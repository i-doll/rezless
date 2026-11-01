import { describe, expect, it } from 'vitest'
import { getRlvStatus } from '@rezless/vm'
import { loadRlvPair, loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Miscellaneous
// In-world: getstatus/getstatusall formatting batch -> insertion order, substring
// matches, empty replies, slash fallback, second-field separator and ignored
// later fields. Removing/re-adding sit moves it last. sendchannel:37 appears
// verbatim and matches filter 37. Two emitters added high UUID first ->
// /tplm/sit/sit/sendchat in UUID order, with duplicates retained.
// Firestorm RLVa 2.4.2, viewer 7.2.5.81978, API 3.4.3 (Aditi, SLua Tideland, 2026-11-01).
// Both profiles return canonical rule text, prefix every match with a separator,
// preserve insertion order within a prim and order prims by UUID.
// Kokua RLV 2.09.35.00 keeps the full separator suffix; Firestorm RLVa 2.4.2
// uses only the second semicolon-delimited field.
describe('paired status queries', () => {
  it.each([
    ['', '/unsit/tplm/sit/detach', '/unsit/tplm/sit/detach'],
    [':sit', '/unsit/sit', '/unsit/sit'],
    [':absent', '', ''],
    [':', '/unsit/tplm/sit/detach', '/unsit/tplm/sit/detach'],
    [':;', '/unsit/tplm/sit/detach', '/unsit/tplm/sit/detach'],
    [':sit;', '/unsit/sit', '/unsit/sit'],
    [':sit;##', '##unsit##sit', '##unsit##sit'],
    [':;a;b', 'a;bunsita;btplma;bsita;bdetach', 'aunsitatplmasitadetach'],
    [':;;b', ';bunsit;btplm;bsit;bdetach', '/unsit/tplm/sit/detach'],
    [':sit;A;B', 'a;bunsita;bsit', 'aunsitasit'],
    [':bad:option', '', ''],
  ])('formats and filters option %s', async (option, rlv, rlva) => {
    const pair = await loadRlvPair({ source: `list replies; default {
      state_entry() {
        llListen(218101, "", llGetOwner(), "");
        llOwnerSay("@unsit=n,tplm=n,sit=add,detach=n,sit=n,getstatus${option}=218101,getstatusall${option}=218101");
      }
      listen(integer c, string n, key id, string m) { replies += [m]; }
    }` })
    for (const profile of ['rlv', 'rlva'] as const) {
      const { script, avatar } = pair[profile]
      script.start()
      expect(script.global('replies')).toEqual(profile === 'rlv' ? [rlv, rlv] : [rlva, rlva])
      expect(avatar.viewer.commandLog.slice(-2).map(e => e.status)).toEqual(['replied', 'replied'])
      expect(avatar.viewer.restrictions.snapshot()).toHaveLength(4)
    }
  })

  it('delivers actual empty replies before any rules exist and after removing them', async () => {
    const pair = await loadRlvPair({ source: `list replies; default {
      state_entry() {
        llListen(218101, "", llGetOwner(), "");
        llOwnerSay("@getstatus=218101,getstatusall=218101,sit=n,sit=y,getstatus:;x=218101");
      }
      listen(integer c, string n, key id, string m) { replies += [m]; }
    }` })
    for (const { script } of Object.values(pair)) {
      script.start()
      expect(script.global('replies')).toEqual(['', '', ''])
    }
  })

  it('orders emitters by UUID, retains cross-emitter duplicates and scopes getstatus to the calling prim', async () => {
    const pair = await loadRlvPair({ source: `list replies; default {
      state_entry() { llListen(218101, "", llGetOwner(), ""); }
      touch_start(integer n) { llOwnerSay("@getstatus=218101,getstatusall=218101,getstatusall:sit;#=218101"); }
      listen(integer c, string n, key id, string m) { replies += [m]; }
    }` })
    for (const { script, world, avatar } of Object.values(pair)) {
      script.start()
      const added = await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [
        { key: 'ffffffff-ffff-ffff-ffff-ffffffffffff', scripts: [
          { name: 'high', source: { source: 'default { state_entry() { llOwnerSay("@sit=n,sendchat=n"); } }' } },
        ] },
        { key: '00000000-0000-0000-0000-000000000001', scripts: [
          { name: 'low', source: { source: 'default { state_entry() { llOwnerSay("@tplm=n,sit=n"); } }' } },
          { name: 'same', source: { source: 'default { state_entry() { llOwnerSay("@sit=n"); } }' } },
          { name: 'own', source: { source: 'list replies; default { state_entry() { llListen(218102,"",llGetOwner(),""); llOwnerSay("@getstatus=218102"); } listen(integer c,string n,key id,string m) { replies += [m]; } }' } },
        ] },
        { key: '88888888-8888-8888-8888-888888888888', scripts: [
          { name: 'middle', source: { source: 'default { state_entry() { llOwnerSay("@unsit=n"); } }' } },
        ] },
      ] })
      added.scripts.high!.start(); added.scripts.low!.start(); added.scripts.same!.start(); added.scripts.own!.start(); added.scripts.middle!.start()
      script.fire('touch_start', { num_detected: 1 })
      expect(script.global('replies')).toEqual(['', '/tplm/sit/unsit/sit/sendchat', '#sit#unsit#sit'])
      expect(added.scripts.own!.global('replies')).toEqual(['/tplm/sit'])
      // Status formatting must not reorder the inspection snapshot.
      expect(avatar.viewer.restrictions.snapshot().map(r => r.rule)).toEqual(['sit', 'sendchat', 'tplm', 'sit', 'unsit'])
      expect(getRlvStatus('rlv', avatar.viewer.restrictions)).toBe('/tplm/sit/unsit/sit/sendchat')
    }
  })

  it('moves a removed and re-added rule to the end without retaining its parameter alias', async () => {
    const pair = await loadRlvPair({ source: `list replies; default {
      state_entry() { llListen(218101,"",llGetOwner(),""); llOwnerSay("@sit=n,unsit=add,sit=rem,sit=add,getstatus=218101"); }
      listen(integer c,string n,key id,string m) { replies += [m]; }
    }` })
    for (const { script } of Object.values(pair)) {
      script.start()
      expect(script.global('replies')).toEqual(['/unsit/sit'])
    }
  })

  it('formats stored options and unsupported Kokua wire rules without extending RLVa storage', async () => {
    const pair = await loadRlvPair({ source: `list replies; default {
      state_entry() { llListen(218101,"",llGetOwner(),"");
        llOwnerSay("@sit:bad=n,issue218unknown:foo=add,sit=n,getstatus=218101,getstatus:foo=218101,getstatus:bad;#=218101"); }
      listen(integer c,string n,key id,string m) { replies += [m]; }
    }` })
    for (const profile of ['rlv', 'rlva'] as const) {
      const { script, avatar } = pair[profile]
      script.start()
      expect(script.global('replies')).toEqual(profile === 'rlv'
        ? ['/sit:bad/issue218unknown:foo/sit', '/issue218unknown:foo', '#sit:bad'] : ['/sit', '', ''])
      expect(avatar.viewer.commandLog.slice(0, 3).map(e => e.status)).toEqual(['unsupported', 'unsupported', 'applied'])
    }
  })

  it('uses existing reply-channel validation and rejects non-query parameters', async () => {
    const pair = await loadRlvPair({ source: `list replies; default {
      state_entry() { llListen(-218101,"",llGetOwner(),""); llListen(218101,"",llGetOwner(),"");
        llOwnerSay("@sit=n,getstatus=-218101,getstatusall=0,getstatus=2147483647,getstatus=n,getstatusall=force,getstatusall=bad,getstatus=218101"); }
      listen(integer c,string n,key id,string m) { replies += [m]; }
    }` })
    for (const profile of ['rlv', 'rlva'] as const) {
      const { script, avatar } = pair[profile]
      script.start()
      expect(script.global('replies')).toEqual(profile === 'rlv' ? ['/sit', '/sit'] : ['/sit'])
      expect(avatar.viewer.commandLog.slice(1, 4).map(e => e.status)).toEqual(profile === 'rlv'
        ? ['replied', 'unsupported', 'replied'] : ['unsupported', 'unsupported', 'unsupported'])
      expect(avatar.viewer.restrictions.snapshot().map(r => r.rule)).toEqual(['sit'])
    }
  })

  it('leaves disabled mode inert', async () => {
    const world = new World(); world.addRegion('test', { x: 0, y: 0 })
    const avatar = world.addAvatar({ username: 'off', region: 'test' })
    const loaded = await loadLinkset({ world, region: 'test', owner: avatar.key, prims: [{ scripts: [{ name: 'off', source: { source: `integer replies; default {
      state_entry() { llListen(218101,"",llGetOwner(),""); llOwnerSay("@getstatus=218101,getstatusall=218101"); }
      listen(integer c,string n,key id,string m) { ++replies; }
    }` } }] }] })
    loaded.scripts.off!.start()
    expect(loaded.scripts.off!.global('replies')).toBe(0)
    expect(avatar.viewer.commandLog).toEqual([])
  })
})
