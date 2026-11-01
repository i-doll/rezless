import { expect, it } from 'vitest'
import { getRlvViewerState, getRlvCommandCoverage, loadRlvPair, loadLinkset, resetRlvViewerSession } from '../src/index.js'

// Kokua RLV 2.09.35.00: RRInterface::refreshCachedVariable/updateSetsphere/force.
// Firestorm RLVa 2.4.2: RlvBehaviourDictionary, RlvOverlayEffect, RlvSphereEffect.
const source = `string command; default { touch_start(integer n) { llOwnerSay(command); } }`
const texture = '12345678-1234-1234-1234-123456789abc'
type Fixture = Awaited<ReturnType<typeof loadRlvPair>>['rlv']
function send(f: Fixture, command: string) {
  f.script.setGlobal('command', command); f.script.fire('touch_start', { num_detected: 1 })
}
const effect = (f: Fixture, name: string) => getRlvViewerState(f.avatar).find(e => e.behaviour === name)!

it('exposes texture replacement and its alias through the existing frozen query', async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.script.start()
    expect(effect(f, 'setcam_textures')).toMatchObject({ restricted: false, parameters: { texture: null } })
    send(f, `@camtextures:${texture}=n`)
    const snapshot = effect(f, 'setcam_textures')
    expect(snapshot).toMatchObject({ support: 'enforced', restricted: true, parameters: { texture } })
    expect(snapshot.rules[0]).toMatchObject({ sourcePrim: f.script.host.key, option: texture })
    expect(Object.isFrozen(snapshot.parameters)).toBe(true)
    send(f, `@camtextures:${texture}=y`)
    expect(effect(f, 'setcam_textures').restricted).toBe(false)
    expect(snapshot.restricted).toBe(true)
  }
})

it('exposes overlay parameters and touch blocking only for Firestorm', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    send(f, `@setoverlay_touch=n,setoverlay=n,setoverlay_texture:${texture}=force,setoverlay_alpha:0.25=force,setoverlay_tint:1/0.5/0=force`)
    expect(effect(f, 'setoverlay')).toMatchObject(profile === 'rlva'
      ? { support: 'enforced', restricted: true, parameters: { overlays: [{ sourcePrim: f.script.host.key, enabled: true, texture, alpha: 0.25, tint: [1, 0.5, 0], blockTouch: true }] } }
      : { support: 'unsupported', restricted: null })
    expect(effect(f, 'setoverlay_touch').restricted).toBe(profile === 'rlva' ? true : null)
    send(f, '@setoverlay_alpha=force')
    if (profile === 'rlva') expect(effect(f, 'setoverlay').parameters).toMatchObject({ overlays: [{ alpha: 1 }] })
    send(f, '@setoverlay=y')
    expect(effect(f, 'setoverlay').restricted).toBe(profile === 'rlva' ? false : null)
  }
})

it('exposes sphere parameters in both profiles with removal and session reset', async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.script.start()
    send(f, '@setsphere=n,setsphere_mode:4=force,setsphere_origin:1=force,setsphere_distmin:2=force,setsphere_distmax:8=force,setsphere_distextend:3=force,setsphere_valuemin:0.25=force,setsphere_valuemax:0.5=force,setsphere_param:2/3/4/5=force,setsphere_tween:2=force')
    expect(effect(f, 'setsphere')).toMatchObject({ restricted: true, parameters: { spheres: [{ mode: 4, origin: 1, distmin: 2, distmax: 8, distextend: 3, valuemin: 0.25, valuemax: 0.5, param: [2, 3, 4, 5], tween: 2 }] } })
    send(f, '@setsphere=y,setsphere=n')
    expect(effect(f, 'setsphere').parameters).toMatchObject({ spheres: [{ mode: 0, origin: 0, distmin: 0, distmax: 0, distextend: 1, valuemin: 1, valuemax: 1, param: [0, 0, 0, 0], tween: 0 }] })
    resetRlvViewerSession(f.avatar)
    expect(effect(f, 'setsphere')).toMatchObject({ restricted: false, parameters: { spheres: [] } })
  }
})

it('keeps modifiers before activation profile-specific and rejects invalid Firestorm forms', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    send(f, '@setsphere_distmax:7=force,setsphere=n')
    expect(effect(f, 'setsphere').parameters).toMatchObject({ spheres: [{ distmax: profile === 'rlv' ? 7 : 0 }] })
    send(f, '@setsphere_distmax:bad=force')
    expect(effect(f, 'setsphere').parameters).toMatchObject({ spheres: [{ distmax: 0 }] })
    if (profile === 'rlva') expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'unsupported', outcome: 'invalid-option' })
  }
})

it('combines Kokua spheres by mode while retaining independent Firestorm issuers', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    const loaded = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
    const other = { ...f, script: loaded.scripts.other! }; other.script.start()
    send(f, '@setsphere=n,setsphere_distmax:8=force,setsphere_valuemax:0.5=force')
    send(other, '@setsphere=n,setsphere_distmax:4=force,setsphere_valuemax:0.75=force')
    const spheres = (effect(f, 'setsphere').parameters as { spheres: readonly unknown[] }).spheres
    expect(spheres).toHaveLength(profile === 'rlv' ? 1 : 2)
    expect(spheres[0]).toMatchObject({ distmax: profile === 'rlv' ? 4 : 8, valuemax: profile === 'rlv' ? 0.75 : 0.5 })
    send(f, '@clear')
    expect(effect(f, 'setsphere').rules.every(r => r.sourcePrim === other.script.host.key)).toBe(true)
  }
})

it('declares every implemented render form for discovery and unsupported overlays for Kokua', () => {
  for (const profile of ['rlv', 'rlva'] as const) {
    const forms = getRlvCommandCoverage(profile)
    for (const name of ['setcam_textures', 'camtextures', 'setsphere', 'setsphere_mode', 'setsphere_param'])
      expect(forms.find(f => f.behaviour === name)?.support).toBe('enforced')
    expect(forms.find(f => f.behaviour === 'setoverlay')?.support).toBe(profile === 'rlva' ? 'enforced' : 'unsupported')
  }
})

it('retains texture selection differences across multiple rules and alias removals', async () => {
  const pair = await loadRlvPair({ source })
  const second = 'abcdefab-1234-1234-1234-123456789abc'
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    send(f, `@camtextures:${texture}=n,setcam_textures:${second}=n`)
    expect(effect(f, 'setcam_textures').parameters?.texture).toBe(profile === 'rlv' ? second : texture)
    send(f, `@setcam_textures:${texture}=y`)
    expect(effect(f, 'setcam_textures').parameters?.texture).toBe(second)
    send(f, `@camtextures:${texture}=y`)
    expect(effect(f, 'setcam_textures').parameters?.texture).toBe(profile === 'rlv' ? texture : second)
    send(f, '@setcam_textures=n')
    expect(effect(f, 'setcam_textures').parameters?.texture).toBe(profile === 'rlv' ? 'd2114404-dd59-4a4d-8e6c-49359e91bbf0' : second)
    send(f, '@clear')
    expect(effect(f, 'setcam_textures').parameters?.texture).toBeNull()
  }
})

it('exposes typed defaults, color and invalid modifier outcomes', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    send(f, '@setsphere=n,setsphere_color:1/0.5/0=force')
    expect(effect(f, 'setsphere').parameters?.spheres?.[0]?.param).toEqual(profile === 'rlva' ? [1, 0.5, 0, 1] : [0, 0, 0, 0])
    send(f, '@setsphere_color=force')
    expect(effect(f, 'setsphere').parameters?.spheres?.[0]?.param).toEqual([0, 0, 0, 0])
    send(f, '@setsphere_distmax:-2=force')
    expect(effect(f, 'setsphere').parameters?.spheres?.[0]?.distmax).toBe(profile === 'rlv' ? 0 : -2)
    send(f, '@setsphere_distmax=force')
    expect(effect(f, 'setsphere').parameters?.spheres?.[0]?.distmax).toBe(0)
    send(f, '@setoverlay=n,setoverlay_texture:bad=force,setsphere_param:bad=force,setsphere_mode:bad=force')
    expect(effect(f, 'setsphere').parameters?.spheres?.[0]?.mode).toBe(0)
    expect(effect(f, 'setoverlay').parameters?.overlays?.[0]?.texture ?? null).toBeNull()
    if (profile === 'rlva') expect(f.avatar.viewer.commandLog.at(-1)?.outcome).toBe('invalid-option')
  }
})

it('combines Kokua parameters according to each sphere mode', async () => {
  const pair = await loadRlvPair({ source })
  const f = pair.rlv; f.script.start()
  for (const [mode, expected] of [[0, [6, 12, 20, 5]], [1, [0, 0, 0, 0]], [2, [3, 0, 0, 0]], [3, [3, 4, 5, 6]], [4, [3, 4, 5, 6]]] as const) {
    send(f, `@clear,setsphere=n,setsphere_mode:${mode}=n,setsphere_param:2/3/4/5=n,setsphere_param:3;4;5;6=n`)
    expect(effect(f, 'setsphere').parameters?.spheres?.[0]?.param).toEqual(expected)
  }
  send(f, '@clear,setsphere=n,setsphere_mode:9=n')
  expect(effect(f, 'setsphere').parameters?.spheres).toEqual([])
  send(f, '@clear,setsphere_distmax:6=n,setsphere=y,setsphere=n')
  expect(effect(f, 'setsphere').parameters?.spheres?.[0]?.distmax).toBe(6)
  send(f, '@setsphere_distmax:6=y')
  expect(effect(f, 'setsphere').parameters?.spheres?.[0]?.distmax).toBe(0)
})

it('limits Firestorm to six sphere issuers and admits a replacement after clear', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start(); send(f, '@setsphere=n')
    let other = f
    for (let i = 0; i < 6; i++) {
      const loaded = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
        prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
      other = { ...f, script: loaded.scripts.other! }; other.script.start(); send(other, '@setsphere=n')
    }
    expect(effect(f, 'setsphere').parameters?.spheres).toHaveLength(profile === 'rlva' ? 6 : 1)
    expect(other.avatar.viewer.commandLog.at(-1)?.outcome).toBe(profile === 'rlva' ? 'failed-effect-limit' : undefined)
    send(f, '@clear'); send(other, '@setsphere=n')
    expect(other.avatar.viewer.commandLog.at(-1)?.status).toBe('applied')
  }
})

it('selects one overlay hierarchy and enables its linked issuers together', async () => {
  const pair = await loadRlvPair({ source }); const f = pair.rlva; f.script.start()
  const linked = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
    prims: [{ scripts: [{ name: 'root', source: { source } }] }, { scripts: [{ name: 'child', source: { source } }] }] })
  const root = { ...f, script: linked.scripts.root! }, child = { ...f, script: linked.scripts.child! }
  root.script.start(); child.script.start()
  send(root, '@setoverlay=n'); send(f, '@setoverlay=n'); send(child, '@setoverlay=n')
  expect(effect(f, 'setoverlay').parameters?.overlays?.filter(o => o.enabled).map(o => o.sourcePrim)).toEqual([root.script.host.key, child.script.host.key])
  send(root, '@clear')
  expect(effect(f, 'setoverlay').parameters?.overlays?.filter(o => o.enabled).map(o => o.sourcePrim)).toEqual([child.script.host.key])
  send(child, '@clear')
  expect(effect(f, 'setoverlay').parameters?.overlays).toMatchObject([{ sourcePrim: f.script.host.key, enabled: true }])
})
