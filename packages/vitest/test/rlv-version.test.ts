import { describe, expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, loadScript, World } from '../src/index.js'

// Wiki: https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Version_Checking
// Code-derived: Kokua RLV 2.09.35.00, RRInterface.cpp,
// RRInterface::reallyHandleCommand/getVersion/getVersion2; RRInterfaceVersion.h.
// Code-derived: Kokua VIEWER_VERSION.txt supplies the fixed fixture suffix 26.4.0.
// Firestorm RLVa 2.4.2: rlvcommon.cpp, RlvStrings::getVersion/getVersionNum/getVersionImplNum;
// rlvhandler.cpp, RlvHandler::processReplyCommand. Default compatibility settings.
// In-world: version/versionnew -> the RLVa-tagged strings below; versionnum -> 3040300;
// versionnum:impl -> 2040213; versionnum:unknown -> an empty listen reply;
// version:unknown/versionnew:unknown -> unchanged strings. Owner UUID/name identify all replies.
// Measured in Firestorm RLVa 2.4.2 (viewer 7.2.5.81978) on the Aditi beta grid, 2026-11-01.
const cases = [
  { command: 'version', rlv: 'RestrainedLife viewer v2.09.35.00 (26.4.0)', rlva: 'RestrainedLife viewer v3.4.3 (RLVa 2.4.2)' },
  { command: 'versionnew', rlv: 'RestrainedLove viewer v2.09.35.00 (26.4.0)', rlva: 'RestrainedLove viewer v3.4.3 (RLVa 2.4.2)' },
  { command: 'versionnum', rlv: '2093500', rlva: '3040300' },
  { command: 'versionnum:impl', rlv: '2093500', rlva: '2040213' },
  { command: 'versionnum:unknown', rlv: '2093500', rlva: '' },
  { command: 'version:unknown', rlv: 'RestrainedLife viewer v2.09.35.00 (26.4.0)', rlva: 'RestrainedLife viewer v3.4.3 (RLVa 2.4.2)' },
  { command: 'versionnew:unknown', rlv: 'RestrainedLove viewer v2.09.35.00 (26.4.0)', rlva: 'RestrainedLove viewer v3.4.3 (RLVa 2.4.2)' },
]

describe('paired version detection through LSL listen', () => {
  for (const row of cases) it(`answers ${row.command} with the named profile contract`, async () => {
    const pair = await loadRlvPair({ source: `
      integer replies; string reply; key speaker; string speakerName;
      default {
        state_entry() { llListen(214, "", llGetOwner(), ""); llOwnerSay("@${row.command}=214"); }
        listen(integer channel, string name, key id, string message) {
          ++replies; reply = message; speaker = id; speakerName = name;
        }
      }` })
    for (const profile of ['rlv', 'rlva'] as const) {
      const { script, avatar } = pair[profile]
      script.start()
      script.advanceTime(100)
      expect(script.global('replies')).toBe(1)
      expect(script.global('reply')).toBe(row[profile])
      expect(script.global('speaker')).toBe(avatar.key)
      expect(script.global('speakerName')).toBe(avatar.name)
      expect(script.chat.map(entry => entry.text)).toEqual([`@${row.command}=214`])
    }
  })
})

// Integration contracts use the simulator's existing queued listen semantics.
describe('viewer reply routing and inspection', () => {
  it('queues a reply until the issuing handler finishes and records it without changing script chat', async () => {
    const pair = await loadRlvPair({ source: `
      integer replies; integer during; integer finished;
      default {
        state_entry() {
          llListen(214, "", llGetOwner(), ""); llOwnerSay("ordinary owner chat");
          llOwnerSay("@versionnum=214"); during = replies; llSleep(0.5); finished = TRUE;
        }
        listen(integer c, string n, key id, string m) { replies += finished; }
      }` })
    for (const profile of ['rlv', 'rlva'] as const) {
      const { script, avatar } = pair[profile]
      script.start()
      script.advanceTime(1000)
      expect(script.global('during')).toBe(0)
      expect(script.global('replies')).toBe(1)
      expect(script.chat.map(e => e.text)).toEqual(['ordinary owner chat', '@versionnum=214'])
      expect(avatar.viewer.commandLog).toEqual([{
        command: '@versionnum=214', sourcePrim: script.host.key, status: 'replied',
        reply: { channel: 214, text: profile === 'rlv' ? '2093500' : '3040300' },
      }])
      expect(avatar.viewer.diagnostics).toEqual([])
    }
  })

  it('honors removed, inactive and filtered listens, and keeps unsupported forms inspectable', async () => {
    const pair = await loadRlvPair({ source: `
      integer replies;
      default {
        state_entry() {
          integer h = llListen(214, "", NULL_KEY, ""); llListenRemove(h);
          h = llListen(215, "", NULL_KEY, ""); llListenControl(h, FALSE);
          llListen(216, "wrong name", NULL_KEY, ""); llListen(217, "", NULL_KEY, "wrong message");
          llListen(218, "", llGetKey(), ""); llListen(0, "", NULL_KEY, "");
          llOwnerSay("@versionnum=214"); llOwnerSay("@versionnum=215");
          llOwnerSay("@versionnum=216"); llOwnerSay("@versionnum=217"); llOwnerSay("@versionnum=218");
          llSay(0, "@versionnum=214");
          llOwnerSay("@detach=n"); llOwnerSay("@versionnum=214,version=214"); llOwnerSay("@unknown=214");
        }
        listen(integer c, string n, key id, string m) { ++replies; }
      }` })
    for (const { script, avatar } of Object.values(pair)) {
      script.start()
      script.advanceTime(100)
      expect(script.global('replies')).toBe(0)
      expect(avatar.viewer.commandLog.map(e => e.status)).toEqual([
        'replied', 'replied', 'replied', 'replied', 'replied', 'unsupported', 'unsupported', 'unsupported',
      ])
      expect(avatar.viewer.diagnostics.map(e => e.command)).toEqual(['@detach=n', '@versionnum=214,version=214', '@unknown=214'])
    }
  })

  it('shares owner viewer state across emitting prims and delivers to other prims and linksets', async () => {
    const pair = await loadRlvPair({ source: `default { touch_start(integer n) { llOwnerSay("@versionnum=214"); } }` })
    const source = `integer replies; key speaker; default {
      state_entry() { llListen(214, "", NULL_KEY, ""); }
      listen(integer c, string n, key id, string m) { ++replies; speaker = id; }
    }`
    for (const { script, avatar, world } of Object.values(pair)) {
      const listeners = await loadLinkset({ world, region: avatar.region, prims: [
        { scripts: [{ name: 'root', source: { source } }] },
        { scripts: [{ name: 'child', source: { source } }] },
      ] })
      const sender = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
        prims: [{ scripts: [{ name: 'other', source: { source: `default {
          touch_start(integer n) { llOwnerSay("@versionnum=214"); }
        }` } }] }] })
      for (const s of Object.values(listeners.scripts)) s.start()
      script.fire('touch_start', { num_detected: 1 })
      sender.scripts.other!.fire('touch_start', { num_detected: 1 })
      for (const s of Object.values(listeners.scripts)) {
        expect(s.global('replies')).toBe(2)
        expect(s.global('speaker')).toBe(avatar.key)
        expect(s.chat).toEqual([])
      }
      expect(avatar.viewer.commandLog.map(e => e.sourcePrim)).toEqual([script.host.key, sender.scripts.other!.host.key])
    }
  })

  it('retains an already queued reply when the issuing handler removes its listener', async () => {
    const pair = await loadRlvPair({ source: `integer replies; default {
      state_entry() {
        integer h = llListen(214, "", NULL_KEY, "");
        llOwnerSay("@versionnum=214"); llListenRemove(h);
      }
      listen(integer c, string n, key id, string m) { ++replies; }
    }` })
    for (const { script } of Object.values(pair)) {
      script.start()
      expect(script.global('replies')).toBe(1)
    }
  })

  it('preserves owner chat when no owner avatar fixture exists', async () => {
    const script = await loadScript({ source: `integer replies; default {
      state_entry() { llListen(214, "", NULL_KEY, ""); llOwnerSay("@versionnum=214"); }
      listen(integer c, string n, key id, string m) { ++replies; }
    }` })
    script.start()
    expect(script.global('replies')).toBe(0)
    expect(script.chat.map(e => e.text)).toEqual(['@versionnum=214'])
  })

  it.each([undefined, 'disabled'] as const)('leaves %s viewers inert and preserves ordinary owner chat', async profile => {
    const world = new World()
    world.addRegion('test', { x: 0, y: 0 })
    const avatar = world.addAvatar({ region: 'test', username: 'owner', ...(profile ? { viewer: { profile } } : {}) })
    const { scripts } = await loadLinkset({ world, region: 'test', owner: avatar.key,
      prims: [{ scripts: [{ name: 'off', source: { source: `integer replies; default {
        state_entry() { llListen(214, "", NULL_KEY, ""); llOwnerSay("@versionnum=214"); llOwnerSay("hello"); }
        listen(integer c, string n, key id, string m) { ++replies; }
      }` } }] }] })
    const script = scripts.off!
    script.start()
    expect(script.global('replies')).toBe(0)
    expect(script.chat.map(e => e.text)).toEqual(['@versionnum=214', 'hello'])
    expect(avatar.viewer.commandLog).toEqual([])
    expect(avatar.viewer.diagnostics).toEqual([])
  })
})
