import { describe, expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, World } from '../src/index.js'

// Wiki: https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Architecture
// Kokua RLV 2.09.35.00: RRInterface::parse/parseCommand/reallyHandleCommand/answerOnChat.
// Firestorm RLVa 2.4.2: RlvCommand::parseCommand, RlvCommand constructor,
// LLStringUtil::convertToS32, and owner-chat interception in llviewermessage.cpp.
// In-world: parser batch -> counts 1,2,1,2,1,1,1,1,1,2,1,1,1,1,1,0;
// API 3040300 and implementation 2040213 (Firestorm RLVa 2.4.2,
// Aditi, SLua Tideland, 2026-11-01). Numeric suffixes and leading parameter
// whitespace reply; overflow does not. Empty tokens do not stop later queries.
const cases = [
  { name: 'shared baseline', command: '@versionnum=21500', replies: 1 },
  { name: 'shared mixed-case order', command: '@VeRsIoNnUm=21500,versionnum:impl=21500', replies: 2 },
  { name: 'shared partial failure', command: '@bogus=21500,broken,versionnum=21500', replies: 1 },
  { name: 'shared empty tokens', command: '@,versionnum=21500,,versionnum=21500,', replies: 2 },
  { name: 'shared whitespace placement', command: '@ versionnum=21500,versionnum =21500,versionnum= 21500', replies: 1 },
  { name: 'shared numeric suffix', command: '@versionnum=21500x', replies: 1 },
  { name: 'shared signed prefix', command: '@versionnum=+21500', replies: 1 },
  { name: 'shared trailing whitespace', command: '@versionnum=21500 ', replies: 1 },
  { name: 'missing fields preserve later query', command: '@versionnum=,=21500,:x=21500,versionnum=21500', replies: 1 },
  { name: 'shared option delimiters', command: '@versionnum:x:y=21500,versionnum:x=y=21500,versionnum=21500', replies: 2 },
  { name: 'shared repeated at-sign', command: '@@versionnum=21500,versionnum=21500,@versionnum=21500', replies: 1 },
  { name: 'shared decimal suffix', command: '@versionnum=21500.5', replies: 1 },
  { name: 'shared equals suffix', command: '@versionnum=21500=more', replies: 1 },
  { name: 'shared clear forms', command: '@clear,clear=,clear:x=,versionnum=21500', replies: 1 },
  { name: 'shared leading whitespace stays chat', command: ' @versionnum=21500', replies: 0 },
]

async function batch(command: string) {
  return loadRlvPair({ source: `integer replies; string messages; integer during; default {
    state_entry() { llListen(21500, "", llGetOwner(), "");
      llOwnerSay(${JSON.stringify(command)}); during = replies; }
    listen(integer c, string n, key id, string m) { ++replies; messages += "[" + m + "]"; }
  }` })
}

describe('ordered viewer batches', () => {
  for (const row of cases) it(row.name, async () => {
    const pair = await batch(row.command)
    for (const profile of ['rlv', 'rlva'] as const) {
      const { script, avatar } = pair[profile]
      script.start()
      expect(script.global('replies')).toBe(row.replies)
      expect(script.global('during')).toBe(0)
      const replies = avatar.viewer.commandLog.filter(e => e.status === 'replied')
      expect(replies).toHaveLength(row.replies)
      expect(replies.every(e => e.sourcePrim === script.host.key)).toBe(true)
      if (row.name === 'shared mixed-case order') {
        expect(script.global('messages')).toBe(profile === 'rlv' ? '[2093500][2093500]' : '[3040300][2040213]')
      }
    }
  })

  it('distinguishes malformed tokens from unsupported commands for each profile', async () => {
    const pair = await batch('@broken,=21500,:x=21500,versionnum=,unknown=21500,versionnum=21500')
    for (const profile of ['rlv', 'rlva'] as const) {
      const { script, avatar } = pair[profile]
      script.start()
      expect(avatar.viewer.commandLog.map(e => e.status)).toEqual(profile === 'rlv'
        ? ['malformed', 'unsupported', 'unsupported', 'unsupported', 'unsupported', 'replied']
        : ['malformed', 'malformed', 'malformed', 'malformed', 'unsupported', 'replied'])
      expect(avatar.viewer.diagnostics.map(e => e.reason)).toEqual(avatar.viewer.commandLog.slice(0, -1).map(e => e.status))
      expect(script.global('replies')).toBe(1)
    }
  })

  it('classifies without enforcing arbitrary restrictions or force commands', async () => {
    const pair = await batch('@detach=n,detach=add,detach=y,detach=rem,sit=force,clear,clear=foo,clear=n,clear=force,unknown=21500')
    for (const { script, avatar } of Object.values(pair)) {
      script.start()
      expect(avatar.viewer.commandLog.map(e => e.parsed?.kind)).toEqual([
        'add', 'add', 'remove', 'remove', 'force', 'clear', 'clear', 'add', 'clear', 'query',
      ])
      expect(avatar.viewer.commandLog.every(e => e.status === 'unsupported')).toBe(true)
      expect(script.global('replies')).toBe(0)
    }
  })

  it('keeps normalized fields and the original token for inspection', async () => {
    const pair = await batch('@VeRsIoNnUm:X:Y=21500,versionnum:x=y=21500')
    for (const { script, avatar } of Object.values(pair)) {
      script.start()
      expect(avatar.viewer.commandLog[0]).toMatchObject({ command: '@VeRsIoNnUm:X:Y=21500',
        parsed: { behaviour: 'versionnum', option: 'x:y', parameter: '21500', kind: 'query' } })
      expect(avatar.viewer.commandLog[1]).toMatchObject({ command: '@versionnum:x=y=21500',
        parsed: { behaviour: 'versionnum', option: 'x', parameter: 'y=21500', kind: 'unknown' } })
    }
  })

  it('rejects RLVa integer overflow without suppressing a later reply', async () => {
    const pair = await batch('@versionnum=2147483648,versionnum=4294988796,versionnum=999999999999999999999999999999,versionnum=21500')
    const { script, avatar } = pair.rlva
    script.start()
    expect(script.global('replies')).toBe(1)
    expect(avatar.viewer.commandLog.map(e => e.status)).toEqual(['malformed', 'malformed', 'malformed', 'replied'])
  })

  it('only interprets owner chat and truncates UTF-8 before splitting', async () => {
    const padding = 'é'.repeat(500)
    const pair = await loadRlvPair({ source: `integer replies; default {
      state_entry() { llListen(21500,"",llGetOwner(),"");
        llSay(0,"@versionnum=21500"); llRegionSayTo(llGetOwner(),0,"@versionnum=21500");
        llInstantMessage(llGetOwner(),"@versionnum=21500");
        llOwnerSay("@versionnum=21500,${padding},versionnum=21500"); }
      listen(integer c,string n,key id,string m) { ++replies; }
    }` })
    for (const { script, avatar } of Object.values(pair)) {
      script.start(); script.advanceTime(5000)
      expect(script.global('replies')).toBe(1)
      expect(avatar.viewer.commandLog).toHaveLength(3)
      expect(avatar.viewer.commandLog[2]!.status).toBe('malformed')
      expect(avatar.viewer.commandLog[0]!.status).toBe('replied')
    }
  })

  it('leaves disabled batch viewers inert', async () => {
    const world = new World(); world.addRegion('test', { x: 0, y: 0 })
    const avatar = world.addAvatar({ username: 'off', region: 'test', viewer: { profile: 'disabled' } })
    const { scripts } = await loadLinkset({ world, region: 'test', owner: avatar.key,
      prims: [{ scripts: [{ name: 'off', source: { source: 'default { state_entry() { llOwnerSay("@broken,versionnum=21500"); } }' } }] }] })
    scripts.off!.start()
    expect(avatar.viewer.commandLog).toEqual([])
    expect(avatar.viewer.diagnostics).toEqual([])
  })
})
