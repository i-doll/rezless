import { describe, expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, World } from '../src/index.js'

// Wiki: https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Architecture
// In-world: store batch -> all six rules persist once after duplicate adds;
// absent removes leave empty state; clear=tp leaves detach/sendchat/sit/unsit;
// clear=sit then leaves detach/sendchat; clear and clear= empty the state.
// Invalid :bad options and issue217unknown are not stored.
// Firestorm RLVa 2.4.2, API 3.4.3, Aditi, SLua Tideland, 2026-11-01.
const names = ['detach', 'sendchat', 'sit', 'unsit', 'tploc', 'tplm']
const source = (command: string) => `default { state_entry() { llOwnerSay(${JSON.stringify(command)}); } }`
async function run(command: string) {
  const pair = await loadRlvPair({ source: source(command) })
  for (const f of Object.values(pair)) f.script.start()
  return pair
}

describe('per-prim viewer restrictions', () => {
  it('canonicalizes aliases and duplicate adds for every allowlisted restriction', async () => {
    const pair = await run('@detach=n,sendchat=n,sit=n,unsit=n,tploc=n,tplm=n,detach=add,sendchat=add,sit=add,unsit=add,tploc=add,tplm=add')
    for (const { avatar, script } of Object.values(pair)) {
      expect(avatar.viewer.restrictions.snapshot()).toEqual(names.map(rule => ({
        sourcePrim: script.host.key, behaviour: rule, option: '', rule, support: ['detach', 'sit', 'unsit'].includes(rule) ? 'enforced' : 'state-only',
      })))
    }
  })

  for (const [command, expected] of [
    ['@detach=n,sendchat=n,sit=n,unsit=n,tploc=n,tplm=n,detach=y,sendchat=y,sit=y,unsit=y,tploc=y,tplm=y', []],
    ['@detach=add,sendchat=add,sit=add,unsit=add,tploc=add,tplm=add,detach=rem,sendchat=rem,sit=rem,unsit=rem,tploc=rem,tplm=rem,detach=rem', []],
    ['@detach=n,sit=n,detach=y,detach=rem,sit=rem,sit=y', []],
    ['@detach=n,sendchat=n,sit=n,unsit=n,tploc=n,tplm=n,clear=tp', ['detach', 'sendchat', 'sit', 'unsit']],
    ['@detach=n,sendchat=n,sit=n,unsit=n,clear=sit', ['detach', 'sendchat']],
    ['@detach=n,sit=n,clear', []],
    ['@detach=n,sit=n,clear=', []],
    ['@detach=n,clear=doesnotmatch', ['detach']],
  ] as const) it(`applies ${command}`, async () => {
    const pair = await run(command)
    for (const { avatar } of Object.values(pair)) expect(avatar.viewer.restrictions.snapshot().map(r => r.rule)).toEqual(expected)
  })

  it('returns immutable snapshots that retain their prior contents', async () => {
    const pair = await loadRlvPair({ source: `default {
      state_entry() { llOwnerSay("@sit=n"); }
      touch_start(integer n) { llOwnerSay("@clear"); }
    }` })
    for (const { script, avatar } of Object.values(pair)) {
      script.start()
      const snapshot = avatar.viewer.restrictions.snapshot()
      expect(Object.isFrozen(snapshot)).toBe(true)
      expect(Object.isFrozen(snapshot[0])).toBe(true)
      expect(() => { (snapshot[0] as { rule: string }).rule = 'detach' }).toThrow()
      script.fire('touch_start', { num_detected: 1 })
      expect(snapshot.map(r => r.rule)).toEqual(['sit'])
      expect(avatar.viewer.restrictions.snapshot()).toEqual([])
    }
  })

  it('shares rules between scripts on one prim and isolates two emitter UUIDs', async () => {
    const pair = await run('@sit=n')
    for (const { world, avatar, script } of Object.values(pair)) {
      const added = await loadLinkset({ world, region: avatar.region, owner: avatar.key, prims: [{ scripts: [
        { name: 'add', source: { source: source('@sit=n') } },
        { name: 'remove', source: { source: source('@sit=y') } },
      ] }] })
      added.scripts.add!.start()
      expect(avatar.viewer.restrictions.snapshot()).toHaveLength(2)
      expect(avatar.viewer.restrictions.snapshot(script.host.key).map(r => r.rule)).toEqual(['sit'])
      added.scripts.remove!.start()
      expect(avatar.viewer.restrictions.snapshot().map(r => r.sourcePrim)).toEqual([script.host.key])
      const clearer = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
        prims: [{ scripts: [{ name: 'clear', source: { source: source('@clear') } }] }] })
      clearer.scripts.clear!.start()
      expect(avatar.viewer.restrictions.snapshot()).toHaveLength(1)
    }
  })

  it('keeps Kokua unknown wire rules inspectable with unsupported effects', async () => {
    const pair = await run('@issue217unknown:foo=add,sit:bad=n,unsit:bad=n,sendchat:bad=n,tploc:bad=n,tplm:bad=n,detach:bad=n')
    expect(pair.rlva.avatar.viewer.restrictions.snapshot()).toEqual([])
    expect(pair.rlv.avatar.viewer.restrictions.snapshot().map(r => [r.rule, r.support])).toEqual([
      ['issue217unknown:foo', 'unsupported'], ['sit:bad', 'unsupported'], ['unsit:bad', 'unsupported'],
      ['sendchat:bad', 'unsupported'], ['tploc:bad', 'unsupported'], ['tplm:bad', 'unsupported'], ['detach:bad', 'unsupported'],
    ])
    expect(pair.rlv.avatar.viewer.diagnostics).toHaveLength(7)
  })

  it('removes unknown Kokua rules by canonical name and filters their option text', async () => {
    const pair = await run('@issue217unknown:foo=n,issue217unknown:bar=add,issue217unknown:foo=rem,issue217other:bar=n,clear=bar')
    for (const { avatar } of Object.values(pair)) expect(avatar.viewer.restrictions.snapshot()).toEqual([])
  })

  it('does not turn named Kokua replies into restrictions when given add aliases', async () => {
    const pair = await run('@version=n,versionnum=add,versionnew=n,versionunknown=n,getstatus=n,getstatusall=add,getoutfit=n,getdebug_test=n,getenv_test=n')
    for (const { avatar } of Object.values(pair)) expect(avatar.viewer.restrictions.snapshot()).toEqual([])
  })

  it('does not store query or force commands' , async () => {
    const pair = await run('@sit=force,getstatus=217,versionnum=217')
    for (const { avatar } of Object.values(pair)) expect(avatar.viewer.restrictions.snapshot()).toEqual([])
  })

  // In-world: sit survived llResetScript, state change and removal of all scripts;
  // derez retained sit immediately, then getstatusall was empty after 35 seconds.
  // Firestorm RLVa 2.4.2, Aditi, SLua Tideland, 2026-11-01.
  it('retains restrictions across script reset, state change and self-removal', async () => {
    const pair = await loadRlvPair({ source: `default {
      state_entry() { if(llGetObjectDesc() == "") { llSetObjectDesc("seeded"); llOwnerSay("@sit=n"); llResetScript(); } }
      touch_start(integer n) { state other; }
    } state other { state_entry() { llRemoveInventory(llGetScriptName()); } }` })
    for (const { avatar, script } of Object.values(pair)) {
      script.start()
      expect(avatar.viewer.restrictions.snapshot().map(r => r.rule)).toEqual(['sit'])
      script.fire('touch_start', { num_detected: 1 })
      expect(script.host.scripts).toHaveLength(0)
      expect(avatar.viewer.restrictions.snapshot().map(r => r.rule)).toEqual(['sit'])
    }
  })

  it('collects derezzed emitter rules without depending on a live script', async () => {
    const pair = await run('@sit=n')
    for (const { script, avatar, world } of Object.values(pair)) {
      script.linkset.remove()
      expect(avatar.viewer.restrictions.snapshot().map(r => r.rule)).toEqual(['sit'])
      world.clock.advance(35000)
      expect(avatar.viewer.restrictions.snapshot()).toEqual([])
    }
  })

  it('retains live emitters during collection and stops collecting after their rules clear', async () => {
    const pair = await loadRlvPair({ source: `default {
      state_entry() { llOwnerSay("@sit=n"); }
      touch_start(integer n) { llOwnerSay("@clear"); }
    }` })
    for (const { script, avatar, world } of Object.values(pair)) {
      script.start()
      world.clock.advance(1000)
      expect(avatar.viewer.restrictions.snapshot().map(r => r.rule)).toEqual(['sit'])
      world.clock.advance(35000)
      expect(avatar.viewer.restrictions.snapshot().map(r => r.rule)).toEqual(['sit'])
      expect(avatar.viewer.restrictions.snapshot('not-an-emitter')).toEqual([])
      script.fire('touch_start', { num_detected: 1 })
      world.clock.advance(35000)
      expect(avatar.viewer.restrictions.snapshot()).toEqual([])
    }
  })

  it('leaves disabled viewers inert' , async () => {
    const world = new World(); world.addRegion('test', { x: 0, y: 0 })
    const avatar = world.addAvatar({ username: 'off', region: 'test' })
    const loaded = await loadLinkset({ world, region: 'test', owner: avatar.key,
      prims: [{ scripts: [{ name: 'off', source: { source: source('@sit=n,clear,issue217unknown=n') } }] }] })
    loaded.scripts.off!.start()
    expect(avatar.viewer.restrictions.snapshot()).toEqual([])
    expect(avatar.viewer.commandLog).toEqual([])
  })
})
