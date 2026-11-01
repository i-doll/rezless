import { expect, it } from 'vitest'
import {
  getRlvViewerState, getRlvCommandCoverage, loadRlvPair, loadLinkset, World,
  resetRlvViewerSession,
} from '../src/index.js'

// Kokua RLV 2.09.35.00: RRInterface::refreshCachedVariable, LLVOAvatar::idleUpdateNameTag.
// Firestorm RLVa 2.4.2: RlvBehaviourDictionary, RlvActions::canShowName/canShowNameTag/canShowHoverText.
const source = `string command; default { touch_start(integer n) { llOwnerSay(command); } }`
const target = '12345678-1234-1234-1234-123456789abc'
const simple = ['showinv', 'showloc', 'showminimap', 'showworldmap', 'shownames', 'shownametags',
  'shownearby', 'showhovertextall', 'showhovertexthud', 'showhovertextworld', 'viewnote', 'viewscript', 'viewtexture']
const rlvaOnly = ['showself', 'showselfhead', 'viewtransparent', 'viewwireframe']
type Fixture = Awaited<ReturnType<typeof loadRlvPair>>['rlv']
function send(f: Fixture, command: string) {
  f.script.setGlobal('command', command)
  f.script.fire('touch_start', { num_detected: 1 })
}
const effect = (f: Fixture, behaviour: string, context = {}) => getRlvViewerState(f.avatar, context).find(e => e.behaviour === behaviour)!

it('reports every UI restriction, removal and filtered clear in both profiles', async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.script.start()
    for (const name of simple) {
      expect(effect(f, name)).toMatchObject({ support: 'enforced', restricted: false, rules: [] })
      send(f, `@${name}=n`)
      expect(effect(f, name)).toMatchObject({ restricted: true, rules: [{ sourcePrim: f.script.host.key, option: '', rule: name }] })
      send(f, `@${name}=y`)
      expect(effect(f, name).restricted).toBe(false)
    }
    send(f, '@showinv=n,viewnote=n,clear=show')
    expect(effect(f, 'showinv').restricted).toBe(false)
    expect(effect(f, 'viewnote').restricted).toBe(true)
    send(f, '@clear')
    expect(getRlvViewerState(f.avatar).every(e => e.restricted !== true)).toBe(true)
  }
})

it('keeps Kokua unsupported effects inspectable and discovers only implemented forms', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    send(f, '@' + rlvaOnly.map(name => `${name}=n`).join(','))
    for (const name of rlvaOnly) {
      expect(effect(f, name)).toMatchObject(profile === 'rlva'
        ? { support: 'enforced', restricted: true }
        : { support: 'unsupported', restricted: null })
      expect(f.avatar.viewer.commandLog.find(e => e.parsed?.behaviour === name)?.status)
        .toBe(profile === 'rlva' ? 'applied' : 'unsupported')
      expect(getRlvCommandCoverage(profile).find(e => e.behaviour === name)?.support)
        .toBe(profile === 'rlva' ? 'enforced' : 'unsupported')
    }
    send(f, '@getcommand:showself=22930')
    expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject(profile === 'rlva'
      ? { status: 'replied', reply: { text: 'showself;showselfhead' } } : { status: 'unsupported' })
  }
})

it('applies name exceptions and the RLVa self exemption', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    send(f, `@shownames=n,shownames:${target}=n`)
    expect(effect(f, 'shownames', { target }).restricted).toBe(false)
    expect(effect(f, 'shownames').restricted).toBe(true)
    expect(effect(f, 'shownames', { target: f.avatar.key }).restricted).toBe(profile === 'rlv')
    expect(effect(f, 'shownames').rules.map(r => r.option)).toEqual(['', target])
    send(f, `@shownames:${target}=y`)
    expect(effect(f, 'shownames', { target }).restricted).toBe(true)
  }
})

it('requires exceptions from every strict RLVa issuer', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    const loaded = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
    const other = { ...f, script: loaded.scripts.other! }; other.script.start()
    send(f, `@shownames_sec=n,shownames:${target}=n`)
    send(other, '@shownames_sec=n')
    expect(effect(f, 'shownames', { target }).restricted).toBe(profile === 'rlva')
    send(other, `@shownames:${target}=n`)
    expect(effect(f, 'shownames', { target }).restricted).toBe(false)
    send(other, '@clear')
    expect(effect(f, 'shownames').rules.every(r => r.sourcePrim === f.script.host.key)).toBe(true)
  }
})

it('applies RLVa nametag distance modifiers and exceptions without enabling Kokua modifiers', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    send(f, `@shownametags:10=n,shownametags:5=n,shownametags:${target}=n`)
    expect(effect(f, 'shownametags', { distance: 4 }).restricted).toBe(false)
    expect(effect(f, 'shownametags', { distance: 5 }).restricted).toBe(profile === 'rlva')
    expect(effect(f, 'shownametags', { target, distance: 20 }).restricted).toBe(false)
    send(f, '@shownametags=n')
    expect(effect(f, 'shownametags', { distance: 4 }).restricted).toBe(true)
    expect(effect(f, 'shownametags', { target }).restricted).toBe(profile === 'rlv')
    send(f, '@clear')
    expect(effect(f, 'shownametags').restricted).toBe(false)
  }
})

it('resolves hover text by exact prim UUID and HUD/world scope', async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.script.start()
    send(f, `@showhovertext:${target}=n`)
    expect(effect(f, 'showhovertext', { target }).restricted).toBe(true)
    expect(effect(f, 'showhovertext', { target: f.avatar.key }).restricted).toBe(false)
    send(f, '@showhovertexthud=n')
    expect(effect(f, 'showhovertext', { target: f.avatar.key, hud: true }).restricted).toBe(true)
    expect(effect(f, 'showhovertext', { target: f.avatar.key, hud: false }).restricted).toBe(false)
    send(f, '@showhovertexthud=y,showhovertextworld=n')
    expect(effect(f, 'showhovertext', { hud: false }).restricted).toBe(true)
    expect(effect(f, 'showhovertext', { hud: true }).restricted).toBe(false)
    send(f, '@showhovertextall=n')
    expect(effect(f, 'showhovertext', { hud: true }).restricted).toBe(true)
    send(f, '@clear')
    expect(effect(f, 'showhovertext', { target }).restricted).toBe(false)
  }
})

it('ignores invalid forms in effective state while preserving Kokua wire diagnostics', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    send(f, '@showinv:bad=n,showhovertext=n,showhovertext:bad=n,shownametags:bad=n')
    expect(getRlvViewerState(f.avatar).every(e => e.restricted !== true)).toBe(true)
    expect(f.avatar.viewer.commandLog.every(e => e.status === 'unsupported')).toBe(true)
    expect(f.avatar.viewer.restrictions.snapshot()).toHaveLength(profile === 'rlv' ? 4 : 0)
    send(f, '@viewnote=force')
    expect(f.avatar.viewer.commandLog.at(-1)?.status).toBe('unsupported')
  }
})

it('returns frozen snapshots that survive removal and session reset', async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.script.start(); send(f, '@showinv=n')
    const snapshot = getRlvViewerState(f.avatar)
    const inventory = snapshot.find(e => e.behaviour === 'showinv')!
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(inventory)).toBe(true)
    expect(Object.isFrozen(inventory.rules)).toBe(true)
    expect(Object.isFrozen(inventory.rules[0])).toBe(true)
    resetRlvViewerSession(f.avatar)
    expect(effect(f, 'showinv').restricted).toBe(false)
    expect(inventory.restricted).toBe(true)
    expect(inventory.rules).toHaveLength(1)
  }
})

it('leaves disabled viewers inert and isolates avatars', async () => {
  const pair = await loadRlvPair({ source })
  const f = pair.rlva; f.script.start(); send(f, '@showinv=n')
  const other = f.world.addAvatar({ username: 'other', region: f.avatar.region, viewer: { profile: 'rlva' } })
  expect(getRlvViewerState(other).every(e => !e.restricted)).toBe(true)
  const world = new World(); world.addRegion('test', { x: 0, y: 0 })
  const off = world.addAvatar({ username: 'off', region: 'test' })
  expect(getRlvViewerState(off).every(e => e.support === 'unsupported' && e.restricted === null)).toBe(true)
})

it('shares Kokua censor exceptions across name families while RLVa scopes them separately', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    send(f, `@shownames=n,shownametags:${target}=n`)
    expect(effect(f, 'shownames', { target }).restricted).toBe(profile === 'rlva')
    expect(effect(f, 'shownametags', { target }).restricted).toBe(profile === 'rlv')
    send(f, '@clear')
    send(f, `@shownames:${target}=n`)
    expect(effect(f, 'shownames').restricted).toBe(profile === 'rlv')
    expect(effect(f, 'shownametags').restricted).toBe(profile === 'rlv')
    expect(effect(f, 'shownametags').rules).toHaveLength(profile === 'rlv' ? 1 : 0)
  }
})

it('applies permissive issuer checks to plain RLVa name restrictions', async () => {
  const pair = await loadRlvPair({ source })
  const f = pair.rlva; f.script.start()
  const loaded = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
    prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
  const other = { ...f, script: loaded.scripts.other! }; other.script.start()
  send(f, '@shownames=n,shownametags_sec:5=n')
  send(other, `@shownames:${target}=n,shownametags:${target}=n`)
  expect(effect(f, 'shownames', { target }).restricted).toBe(false)
  expect(effect(f, 'shownametags', { target, distance: 10 }).restricted).toBe(true)
  expect(effect(f, 'shownametags', { target: f.avatar.key, distance: 10 }).restricted).toBe(false)
  send(f, '@permissive=n')
  expect(effect(f, 'shownames', { target }).restricted).toBe(true)
  send(f, `@shownames:${target}=n,shownametags:${target}=n`)
  expect(effect(f, 'shownames', { target }).restricted).toBe(false)
  expect(effect(f, 'shownametags', { target, distance: 10 }).restricted).toBe(false)
  send(f, '@clear=shownames')
  expect(effect(f, 'shownames', { target }).restricted).toBe(false)
})

it('keeps another issuer active through removal and clears effects on emitter collection', async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.script.start()
    const loaded = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
    const other = { ...f, script: loaded.scripts.other! }; other.script.start()
    send(f, '@showinv=n'); send(other, '@showinv=n')
    send(f, '@showinv=y')
    expect(effect(f, 'showinv')).toMatchObject({ restricted: true, rules: [{ sourcePrim: other.script.host.key }] })
    other.script.linkset.remove()
    f.world.clock.advance(700000)
    expect(effect(f, 'showinv').restricted).toBe(false)
  }
})
