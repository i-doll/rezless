import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlSetCameraAtOffset
// https://wiki.secondlife.com/wiki/LlSetCameraEyeOffset
// https://wiki.secondlife.com/wiki/LlSetLinkCamera
// https://wiki.secondlife.com/wiki/LlForceMouselook
// In-world: probe.lsl / child.lsl -> independent per-prim offsets, no permission
// requirement, ZERO_VECTOR clearing, and nonzero mouselook flags. Reset,
// setter-script removal and take/rez retain the settings. Aditi, SLua Tideland,
// 2026-11-01; sources and JSONL transcript in /tmp/issue-153-cam/.
const source = (body: string) => ({ source: `default { touch_start(integer n) { ${body} } }` })
const eye = { x: -4, y: 1, z: 2 }
const at = { x: 2, y: 1, z: 2 }

describe('prim camera settings', () => {
  it('stores independent eye and focus offsets without camera permissions', async () => {
    const l = await loadLinkset({ prims: [{ scripts: [{ source: source('llSetCameraEyeOffset(<-4,1,2>); llSetCameraAtOffset(<2,1,2>);') }] }] })
    l.linkset.touch(0)
    expect(l.prims[0]!.cameraEyeOffset).toEqual(eye)
    expect(l.prims[0]!.cameraAtOffset).toEqual(at)
  })

  it.each([['LINK_THIS', 1], ['LINK_ROOT', 0], ['2', 1]])('targets one prim with %s from a child', async (selector, index) => {
    const l = await loadLinkset({ prims: [{}, { scripts: [{ source: source(`llSetLinkCamera(${selector}, <-4,1,2>, <2,1,2>);`) }] }] })
    l.linkset.touch(2)
    expect(l.prims[index]!.cameraEyeOffset).toEqual(eye)
    expect(l.prims[index]!.cameraAtOffset).toEqual(at)
    expect(l.prims[1 - index]!.cameraEyeOffset).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('stores a nonzero mouselook flag on the calling prim', async () => {
    const l = await loadLinkset({ prims: [{}, { scripts: [{ source: source('llForceMouselook(-2);') }] }] })
    l.linkset.touch(2)
    expect(l.prims[1]!.forceMouselook).toBe(true)
    expect(l.prims[0]!.forceMouselook).toBe(false)
  })
})

it.each(['99'])('ignores invalid link selector %s', async selector => {
  const l = await loadLinkset({ prims: [{ scripts: [{ source: source(`llSetLinkCamera(LINK_THIS, <-4,1,2>, <2,1,2>); llSetLinkCamera(${selector}, <-9,9,9>, <9,9,9>);`) }] }, {}] })
  l.linkset.touch(1)
  expect(l.prims[0]!.cameraEyeOffset).toEqual(eye)
  expect(l.prims[0]!.cameraAtOffset).toEqual(at)
  expect(l.prims[1]!.cameraEyeOffset).toEqual({ x: 0, y: 0, z: 0 })
})

it('clears eye and focus independently with ZERO_VECTOR', async () => {
  const l = await loadLinkset({ prims: [{ scripts: [{ source: source('llSetLinkCamera(LINK_THIS, <-4,1,2>, <2,1,2>); llSetCameraEyeOffset(ZERO_VECTOR);') }] }] })
  l.linkset.touch(0)
  expect(l.prims[0]!.cameraEyeOffset).toEqual({ x: 0, y: 0, z: 0 })
  expect(l.prims[0]!.cameraAtOffset).toEqual(at)
})

it('retains camera settings through script reset and inventory snapshots', async () => {
  const l = await loadLinkset({ prims: [{ scripts: [{ name: 'cam', source: source('llSetLinkCamera(LINK_THIS, <-4,1,2>, <2,1,2>); llForceMouselook(TRUE);') }] }] })
  l.linkset.touch(0)
  l.scripts.cam!.reset()
  const copy = l.linkset.copy()
  expect(copy.prims[0]!.cameraEyeOffset).toEqual(eye)
  expect(copy.prims[0]!.cameraAtOffset).toEqual(at)
  expect(copy.prims[0]!.forceMouselook).toBe(true)
  copy.prims[0]!.cameraEyeOffset = { x: -8, y: 0, z: 0 }
  expect(l.prims[0]!.cameraEyeOffset).toEqual(eye)
})

const OWNER = '11111111-1111-1111-1111-111111111111'
async function seatedFixture(body = '', lone = false) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ key: OWNER, username: 'i.doll', region: 'home', info: 6 })
  const l = await loadLinkset({ world, region: 'home', owner: OWNER, position: { x: 100, y: 100, z: 30 }, prims: [{ scripts: [{ name: 'cam', source: { source: `
    vector pos; vector forward; rotation rot; integer info;
    default {
      state_entry(){llSitTarget(<0,0,0.5>, ZERO_ROTATION);llRequestPermissions(llGetOwner(), PERMISSION_TRACK_CAMERA);}
      touch_start(integer n){${body}}
      touch_end(integer n){pos=llGetCameraPos();rot=llGetCameraRot();forward=llRot2Fwd(rot);info=llGetAgentInfo(llGetOwner());}
    }
  ` } }] }, ...(lone ? [] : [{}])] })
  const script = l.scripts.cam!
  script.start(); script.grantPermissions()
  return { ...l, world, avatar, script }
}

// In-world: probe.lsl modes 1/2/3 -> offsets apply on the next sit; edits and
// clearing leave the current sitter's camera unchanged. Aditi, SLua Tideland,
// 2026-11-01. Sources and transcript: /tmp/issue-153-cam/.
it('snapshots the camera at seating, including edits made before the first read', async () => {
  const f = await seatedFixture('llSetLinkCamera(LINK_THIS, <-4,1,2>, <2,1,2>);')
  f.linkset.touch(1)
  f.world.sitAvatar(f.avatar, f.prims[0]!)
  f.prims[0]!.cameraEyeOffset = { x: -7, y: -2, z: 3 }
  f.prims[0]!.cameraAtOffset = { x: 1, y: -2, z: 3 }
  f.script.fire('touch_end', { num_detected: 1 })
  expect(f.script.global('pos')).toEqual({ x: 96, y: 101, z: 32 })
  const rotation = f.script.global('rot') as { x: number; y: number; z: number; s: number }
  expect(rotation.x).toBeCloseTo(0)
  expect(rotation.y).toBeCloseTo(0)
  expect(rotation.z).toBeCloseTo(0)
  expect(rotation.s).toBeCloseTo(1)
  f.world.standAvatar(f.avatar)
  f.world.sitAvatar(f.avatar, f.prims[0]!)
  f.script.fire('touch_end', { num_detected: 1 })
  expect(f.script.global('pos')).toEqual({ x: 93, y: 98, z: 33 })
})

// In-world: modes 17/18 -> info 54 to 62 on the next sit. Clearing the flag
// leaves the current sitter in mouselook; FALSE keeps the viewer's current
// mode on a later sit. Aditi, SLua Tideland, 2026-11-01.
it('enters mouselook on sitting without forcing an existing sitter or clearing the viewer mode', async () => {
  const f = await seatedFixture('llForceMouselook(TRUE);')
  f.world.sitAvatar(f.avatar, f.prims[0]!)
  f.linkset.touch(1)
  expect(f.script.global('info')).toBe(54)
  f.world.standAvatar(f.avatar)
  f.world.sitAvatar(f.avatar, f.prims[0]!)
  f.prims[0]!.forceMouselook = false
  f.script.fire('touch_end', { num_detected: 1 })
  expect(f.script.global('info')).toBe(62)
  f.world.standAvatar(f.avatar)
  f.world.sitAvatar(f.avatar, f.prims[0]!)
  f.script.fire('touch_end', { num_detected: 1 })
  expect(f.script.global('info')).toBe(62)
})

// In-world: probe.lsl mode 23 -> a child script's link-zero call changes the
// root, while mode 13 from the root leaves it unchanged (Aditi, SLua Tideland,
// 2026-11-01).
it('accepts the legacy child-to-root link-zero alias', async () => {
  const l = await loadLinkset({ prims: [{}, { scripts: [{ source: source('llSetLinkCamera(0, <-4,1,2>, <2,1,2>);') }] }] })
  l.linkset.touch(2)
  expect(l.prims[0]!.cameraEyeOffset).toEqual(eye)
  expect(l.prims[0]!.cameraAtOffset).toEqual(at)
})

// In-world: matrix.lsl and matrix-child.lsl, with link keys checked by keys.lsl,
// -> all tested negative selectors except LINK_THIS change only the first prim
// other than the caller. Root -> link 2; child -> root. Other children retain
// their prior values. Aditi, SLua Tideland, 2026-11-01.
it.each(['LINK_SET', 'LINK_ALL_CHILDREN', 'LINK_ALL_OTHERS', '-5', '-999'])('selects only the first other prim for %s', async selector => {
  const l = await loadLinkset({ prims: [{ scripts: [{ source: source(`llSetLinkCamera(LINK_THIS, <-2,0,1>, <2,0,1>); llSetLinkCamera(${selector}, <-4,1,2>, <2,1,2>);`) }] }, {}, {}] })
  l.linkset.touch(1)
  expect(l.prims[0]!.cameraEyeOffset).toEqual({ x: -2, y: 0, z: 1 })
  expect(l.prims[1]!.cameraEyeOffset).toEqual(eye)
  expect(l.prims[1]!.cameraAtOffset).toEqual(at)
  expect(l.prims[2]!.cameraEyeOffset).toEqual({ x: 0, y: 0, z: 0 })
})

it.each(['LINK_SET', 'LINK_ALL_CHILDREN', 'LINK_ALL_OTHERS', '-5', '-999'])('selects the root from a child for %s', async selector => {
  const l = await loadLinkset({ prims: [{}, { scripts: [{ source: source(`llSetLinkCamera(${selector}, <-4,1,2>, <2,1,2>);`) }] }, {}] })
  l.linkset.touch(2)
  expect(l.prims[0]!.cameraEyeOffset).toEqual(eye)
  expect(l.prims[0]!.cameraAtOffset).toEqual(at)
  expect(l.prims[1]!.cameraEyeOffset).toEqual({ x: 0, y: 0, z: 0 })
  expect(l.prims[2]!.cameraEyeOffset).toEqual({ x: 0, y: 0, z: 0 })
})

// In-world: modes 3/4/5 -> zero clears one or both stored components. With only
// eye <-4,1,2>, the camera looks at the prim origin. With only at <2,1,2>, the
// eye is the prim origin. Aditi, SLua Tideland, 2026-11-01.
it('clears focus independently and uses the prim origin as the eye for an at-only offset', async () => {
  const f = await seatedFixture('llSetLinkCamera(LINK_THIS, <-4,1,2>, <2,1,2>); llSetCameraAtOffset(ZERO_VECTOR);')
  f.linkset.touch(1)
  expect(f.prims[0]!.cameraAtOffset).toEqual({ x: 0, y: 0, z: 0 })
  expect(f.prims[0]!.cameraEyeOffset).toEqual(eye)
  f.prims[0]!.cameraEyeOffset = { x: 0, y: 0, z: 0 }
  f.prims[0]!.cameraAtOffset = at
  f.world.sitAvatar(f.avatar, f.prims[0]!)
  f.script.fire('touch_end', { num_detected: 1 })
  expect(f.script.global('pos')).toEqual({ x: 100, y: 100, z: 30 })
})

it('restores the supplied viewer camera after clearing both offsets and sitting again', async () => {
  const f = await seatedFixture('llSetLinkCamera(LINK_THIS, ZERO_VECTOR, ZERO_VECTOR);')
  f.script.setCamera({ pos: { x: 90, y: 100, z: 35 } })
  f.prims[0]!.cameraEyeOffset = eye
  f.prims[0]!.cameraAtOffset = at
  f.world.sitAvatar(f.avatar, f.prims[0]!)
  f.linkset.touch(1)
  expect(f.script.global('pos')).toEqual({ x: 96, y: 101, z: 32 })
  f.world.standAvatar(f.avatar)
  f.world.sitAvatar(f.avatar, f.prims[0]!)
  f.script.fire('touch_end', { num_detected: 1 })
  expect(f.script.global('pos')).toEqual({ x: 90, y: 100, z: 35 })
})

it('keeps seated camera reads gated by TRACK_CAMERA', async () => {
  const f = await seatedFixture('llSetLinkCamera(LINK_THIS, <-4,1,2>, <2,1,2>);')
  f.linkset.touch(1)
  f.world.sitAvatar(f.avatar, f.prims[0]!)
  f.script.reset()
  f.script.fire('touch_end', { num_detected: 1 })
  expect(f.script.global('pos')).toEqual({ x: 0, y: 0, z: 0 })
  expect(f.script.global('rot')).toEqual({ x: 0, y: 0, z: 0, s: 1 })
})

// In-world: single.lsl modes 6/7/13 -> LINK_ROOT is ignored on an unoccupied
// lone prim, but stores the new offsets while occupied. Existing sitter keeps
// the old offsets; the next sit sees the new ones. Link 0 works when unoccupied.
// Aditi, SLua Tideland, 2026-11-01.
it('resolves LINK_ROOT on a lone prim only while occupied', async () => {
  const f = await seatedFixture('llSetLinkCamera(LINK_ROOT, <-4,1,2>, <2,1,2>);', true)
  f.linkset.touch(0)
  expect(f.prims[0]!.cameraEyeOffset).toEqual({ x: 0, y: 0, z: 0 })
  f.world.sitAvatar(f.avatar, f.prims[0]!)
  f.linkset.touch(0)
  expect(f.prims[0]!.cameraEyeOffset).toEqual(eye)
  expect(f.prims[0]!.cameraAtOffset).toEqual(at)
  f.world.standAvatar(f.avatar)
  f.world.sitAvatar(f.avatar, f.prims[0]!)
  f.script.fire('touch_end', { num_detected: 1 })
  expect(f.script.global('pos')).toEqual({ x: 96, y: 101, z: 32 })
})

it('accepts link zero on an unoccupied lone prim and ignores it from a linked root', async () => {
  const single = await seatedFixture('llSetLinkCamera(0, <-4,1,2>, <2,1,2>);', true)
  single.linkset.touch(0)
  expect(single.prims[0]!.cameraEyeOffset).toEqual(eye)
  const linked = await seatedFixture('llSetLinkCamera(0, <-4,1,2>, <2,1,2>);')
  linked.linkset.touch(1)
  expect(linked.prims[0]!.cameraEyeOffset).toEqual({ x: 0, y: 0, z: 0 })
  expect(linked.prims[1]!.cameraEyeOffset).toEqual({ x: 0, y: 0, z: 0 })
})

// In-world: matrix follow-up -> moving/turning a seat leaves the local camera
// offset <-4,1,2> and forward <1,0,0> unchanged. Aditi, SLua Tideland, 2026-11-01.
it('follows the occupied child prim transform without using the sit-target offset', async () => {
  const f = await seatedFixture()
  const root = f.prims[0]!
  const child = f.prims[1]!
  root.params.rotation = { x: 0, y: 0, z: Math.SQRT1_2, s: Math.SQRT1_2 }
  child.params.position = { x: 2, y: 0, z: 0 }
  child.cameraEyeOffset = eye
  child.cameraAtOffset = at
  child.params.sitTarget = { enabled: true, offset: { x: 20, y: 30, z: 40 }, rotation: { x: 0, y: 0, z: 0, s: 1 } }
  f.world.sitAvatar(f.avatar, child)
  root.params.position = { x: 110, y: 100, z: 30 }
  f.script.fire('touch_end', { num_detected: 1 })
  const pos = f.script.global('pos') as { x: number; y: number; z: number }
  expect(pos.x).toBeCloseTo(109, 5)
  expect(pos.y).toBeCloseTo(98, 5)
  expect(pos.z).toBeCloseTo(32, 5)
  const rot = f.script.global('rot') as { z: number; s: number }
  expect(rot.z).toBeCloseTo(Math.SQRT1_2, 5)
  expect(rot.s).toBeCloseTo(Math.SQRT1_2, 5)
})

// In-world: probe.lsl mode 31 -> equal nonzero eye/at gives the viewer's default
// camera rather than the requested eye. single.lsl mode 32 -> mouselook works
// with the sit target disabled. Aditi, SLua Tideland, 2026-11-01.
it('leaves equal eye/focus offsets to the supplied viewer camera', async () => {
  const f = await seatedFixture('llSetLinkCamera(LINK_THIS, <-4,1,2>, <-4,1,2>);')
  f.script.setCamera({ pos: { x: 90, y: 95, z: 40 } })
  f.linkset.touch(1)
  f.world.sitAvatar(f.avatar, f.prims[0]!)
  f.script.fire('touch_end', { num_detected: 1 })
  expect(f.script.global('pos')).toEqual({ x: 90, y: 95, z: 40 })
})

it('enters mouselook without a sit target and uses the supplied head camera', async () => {
  const f = await seatedFixture('llSitTarget(ZERO_VECTOR,ZERO_ROTATION); llForceMouselook(TRUE); llSetLinkCamera(LINK_THIS, <-4,1,2>, <2,1,2>);')
  f.script.setCamera({ pos: { x: 100, y: 100, z: 31 } })
  f.linkset.touch(1)
  f.world.sitAvatar(f.avatar, f.prims[0]!)
  f.script.fire('touch_end', { num_detected: 1 })
  expect(f.script.global('info')).toBe(62)
  expect(f.script.global('pos')).toEqual({ x: 100, y: 100, z: 31 })
})

// In-world: probe.lsl mode 5 -> at-only <2,1,2> gives camera forward
// <0.66667,0.33333,0.66667> (Aditi, SLua Tideland, 2026-11-01).
it('aims at the focus when both yaw and pitch are nonzero', async () => {
  const f = await seatedFixture('llSetCameraAtOffset(<2,1,2>);')
  f.linkset.touch(1)
  f.world.sitAvatar(f.avatar, f.prims[0]!)
  f.script.fire('touch_end', { num_detected: 1 })
  const forward = f.script.global('forward') as { x: number; y: number; z: number }
  expect(forward.x).toBeCloseTo(0.66667, 5)
  expect(forward.y).toBeCloseTo(0.33333, 5)
  expect(forward.z).toBeCloseTo(0.66667, 5)
})
