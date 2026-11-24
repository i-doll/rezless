import { describe, expect, it } from 'vitest'
import { DEBUG_CHANNEL, loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlSetRegionPos
// https://wiki.secondlife.com/wiki/LlMoveToTarget
// https://wiki.secondlife.com/wiki/LlCreateLink
// https://wiki.secondlife.com/wiki/LlBreakLink
// https://wiki.secondlife.com/wiki/LlBreakAllLinks
// In-world: SLua Tideland on the Aditi beta grid (2026-11-24), Mono. The probe avatar, standing
// at <118, 48, 1997.444> and turned 90 degrees, wore a two-prim object on the chest: a 0.3 m box
// root, offset <0.3, 0, 0.1> and turned <0, 0, -90> degrees on the point, and a 0.2 m box child at
// <0.3, 0, 0>. Each prim ran one script, driven by the avatar's chat, that made the call and
// reported llGetPos, llGetLocalPos, the avatar's OBJECT_POS and llGetNumberOfPrims at once and
// again after 1 to 3 s. A 0.2 m box the avatar owned stood 1.5 m away.

const OWNER = '00000000-0000-4000-8000-000000000663'
const v = (x: number, y: number, z: number) => ({ x, y, z })
const AT = v(118, 48, 1997.444)

async function worn(root: string, child = '') {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({
    region: 'home', key: OWNER, username: 'probe', size: v(0.45, 0.6, 1.70672), position: AT,
    rotation: { x: 0, y: 0, z: Math.SQRT1_2, s: Math.SQRT1_2 },
  })
  const box = await loadLinkset({ world, region: 'home', owner: OWNER, position: v(119, 48.5, 1997.4), prims: [{ name: 'box' }] })
  const source = (body: string) => ({ source: `list out; default {
    state_entry() { if (${JSON.stringify(body)} != "") llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
    run_time_permissions(integer p) { ${body} }
    changed(integer c) { out += ["changed", c]; }
  }`.replaceAll('BOX', box.prims[0]!.key) })
  const { linkset, scripts } = await loadLinkset({
    world, region: 'home', owner: OWNER, position: v(118, 50, 1997.4),
    prims: [
      { name: 'worn', scripts: [{ name: 'root', source: source(root) }] },
      { name: 'worn child', scripts: [{ name: 'child', source: source(child) }] },
    ],
  })
  linkset.prims[1]!.params.position = v(0.3, 0, 0)
  linkset.attachToAvatar(OWNER, 1)
  linkset.prims[0]!.params.position = v(0.3, 0, 0.1)
  linkset.prims[0]!.params.rotation = { x: 0, y: 0, z: -Math.SQRT1_2, s: Math.SQRT1_2 }
  const listener = await loadLinkset({
    world, region: 'home', owner: OWNER, position: v(114.5, 47, 1997.4),
    prims: [{ name: 'listener', scripts: [{ name: 'listen', source: { source: 'list heard; default { state_entry() { llListen(DEBUG_CHANNEL, "", "", ""); } listen(integer c, string n, key i, string m) { heard += m; } }' } }] }],
  })
  listener.scripts.listen!.start()
  const start = (s: typeof scripts[string], grant = true) => {
    s!.start()
    if (grant) s!.grantPermissions()
    else s!.denyPermissions()
  }
  return { world, avatar, linkset, box: box.linkset, root: scripts.root!, child: scripts.child!, start, heard: () => listener.scripts.listen!.global('heard') }
}

const close = (p: { x: number, y: number, z: number }, x: number, y: number, z: number, digits = 4) => {
  expect(p.x).toBeCloseTo(x, digits)
  expect(p.y).toBeCloseTo(y, digits)
  expect(p.z).toBeCloseTo(z, digits)
}

describe('llSetRegionPos in a worn object', () => {
  // In-world: llSetRegionPos(llGetPos() + <0, 0, 1>) in the root, llGetPos() + <1, 0, 0> in the
  // child, and the avatar's own position in the root each returned 0. Nothing moved, at once or
  // 2 s later, and no moving_start came.
  it('returns FALSE and moves nothing', async () => {
    const f = await worn(
      'out = [llSetRegionPos(llGetPos() + <0, 0, 1>), llSetRegionPos(llGetPos()), llGetLocalPos()];',
      'out = [llSetRegionPos(llGetPos() + <1, 0, 0>), llGetLocalPos()];',
    )
    f.start(f.root)
    f.start(f.child)
    f.linkset.advanceTime(2000)
    const [a, b, local] = f.root.global('out') as [number, number, { x: number, y: number, z: number }]
    expect([a, b]).toEqual([0, 0])
    close(local, 0.3, 0, 0.1)
    const [c, childLocal] = f.child.global('out') as [number, { x: number, y: number, z: number }]
    expect(c).toBe(0)
    close(childLocal, 0.3, 0, 0)
    close(f.avatar.position, 118, 48, 1997.444)
  })
})

describe('llMoveToTarget in a worn object', () => {
  // In-world: llMoveToTarget(llGetPos() + <0, -1, 0>, 0.3) in the root took the wearer to
  // <118, 47.00292, 1997.448> in 1 s and <118, 47.00002, 1997.448> in 3 s; the worn prims kept
  // their offsets. llStopMoveToTarget then left the wearer there.
  it('moves the wearer to the target and leaves the object on its point', async () => {
    const f = await worn('llMoveToTarget(llGetPos() + <0, -1, 0>, 0.3);')
    f.start(f.root)
    f.linkset.advanceTime(3000)
    close(f.avatar.position, 118, 47, 1997.444, 3)
    expect(f.linkset.prims[0]!.params.position).toEqual(v(0.3, 0, 0.1))
  })

  // In-world: llMoveToTarget(llGetPos() + <0, 1, 0>, 0.3) in the child, whose llGetPos was
  // 0.3 m north of the wearer, took the wearer to the target: <118, 48.30001, 1997.449> for a
  // target of <118, 48.30003, 1997.445>. The child stayed 0.3 m north of the wearer.
  it('moves the wearer, not the child, to a target set from the child', async () => {
    const f = await worn('', 'llMoveToTarget(llGetPos() + <0, 1, 0>, 0.3);')
    f.start(f.child)
    f.linkset.advanceTime(3000)
    close(f.avatar.position, 118, 49.3, 1997.444, 3)
    close(f.linkset.prims[1]!.regionPosition(), 118, 49.6, 1997.444, 3)
  })

  // In-world: seated on a box, llMoveToTarget(llGetPos() + <1, 0, 0>, 0.3) in the root left the
  // wearer where it sat, at once and 3 s later.
  it('leaves a seated wearer where it sits', async () => {
    const f = await worn('llMoveToTarget(llGetPos() + <1, 0, 0>, 0.3);')
    const seat = await loadLinkset({ world: f.world, region: 'home', owner: OWNER, position: v(118, 45.5, 1996.75), prims: [{ name: 'seat' }] })
    expect(f.world.sitAvatar(f.avatar, seat.prims[0]!)).toBe(true)
    const before = { ...f.avatar.position }
    f.start(f.root)
    f.linkset.advanceTime(3000)
    expect(f.avatar.position).toEqual(before)
  })

  it('moves the wearer the same however the clock is sliced, physical or not', async () => {
    const run = async (slices: number[]) => {
      const f = await worn('llSetStatus(STATUS_PHYSICS, TRUE); llMoveToTarget(llGetPos() + <0, -10, 0>, 1.0); llLookAt(llGetPos() + <5, 0, 0>, 1.0, 1.0);')
      f.start(f.root)
      for (const ms of slices) f.linkset.advanceTime(ms)
      return f.avatar.position.y
    }
    expect(await run([5, 5])).toBeCloseTo(await run([10]), 9)
  })

  it('adds up steps smaller than a single-precision position', async () => {
    const run = async (slices: number) => {
      const f = await worn('llMoveToTarget(llGetPos() + <0, 0, 1>, 100.0);')
      f.start(f.root)
      for (let i = 0; i < slices; i++) f.linkset.advanceTime(1000 / slices)
      return f.avatar.position.z
    }
    expect(await run(1000)).toBeCloseTo(await run(1), 6)
    expect(await run(1)).toBeCloseTo(1997.444 + -Math.expm1(-1 / 100), 6)
  })

  it('leaves a ground-sitting wearer where it sits', async () => {
    const f = await worn('llMoveToTarget(llGetPos() + <1, 0, 0>, 0.3);')
    f.world.sitAvatarOnGround(f.avatar)
    const before = { ...f.avatar.position }
    f.start(f.root)
    f.linkset.advanceTime(3000)
    expect(f.avatar.position).toEqual(before)
  })

  // In-world: a target 64.2 m above the wearer left it where it was; 63.8 m above lifted it to
  // 2061.18 in 3 s, 0.07 m short of the target. Here the wearer reaches the target, with no
  // gravity.
  it('measures the 64 m limit from the wearer', async () => {
    const far = await worn('llMoveToTarget(llGetPos() + <0, 0, 64.2>, 0.3);')
    far.start(far.root)
    far.linkset.advanceTime(3000)
    close(far.avatar.position, 118, 48, 1997.444)
    const near = await worn('llMoveToTarget(llGetPos() + <0, 0, 63.8>, 0.3);')
    near.start(near.root)
    near.linkset.advanceTime(3000)
    close(near.avatar.position, 118, 48, 2061.244, 1)
  })
})

describe('link changes in a worn object', () => {
  const debug = (s: { chat: { channel: number, text: string }[] }) => s.chat.filter(m => m.channel === DEBUG_CHANNEL).map(m => m.text)

  // In-world: llCreateLink(box, TRUE) and llCreateLink(box, FALSE) from the root, with
  // PERMISSION_CHANGE_LINKS granted by the wearer and without it, each told the owner
  // "Attachments cannot link objects" on DEBUG_CHANNEL; a listener 3 m away heard nothing. Each
  // call still took 0.11 s. The object kept its two prims and the box stayed where it was.
  it('refuses llCreateLink and tells the owner, with or without the permission', async () => {
    for (const grant of [true, false]) {
      const f = await worn('float t = llGetTime(); llCreateLink("BOX", TRUE); llCreateLink("BOX", FALSE); out += [llGetTime() - t, llGetNumberOfPrims()];')
      f.start(f.root, grant)
      f.linkset.advanceTime(2000)
      expect(f.root.global('out')).toEqual([expect.closeTo(0.2, 5), 2])
      expect(debug(f.root)).toEqual(['Attachments cannot link objects', 'Attachments cannot link objects'])
      expect(f.heard()).toEqual([])
      expect(f.box.prims).toHaveLength(1)
      expect(f.linkset.prims).toHaveLength(2)
    }
  })

  // In-world: from the child, without the permission, the owner got "Attachments cannot link
  // objects {RootName probe issue-663 worn, RootPosition { 116, 48, 1997.42 }}" with the wearer
  // at <116, 48, 1997.421>.
  it('names the root and the wearer position when a child tries', async () => {
    const f = await worn('', 'llCreateLink("BOX", TRUE);')
    f.start(f.child, false)
    f.linkset.advanceTime(1000)
    expect(debug(f.child)).toEqual(['Attachments cannot link objects {RootName worn, RootPosition { 118, 48, 1997.44 }}'])
  })

  // In-world: with the permission, llBreakLink(2) and then llBreakAllLinks from the root left the
  // object whole, raised no changed and said nothing on DEBUG_CHANNEL.
  it('breaks nothing, with no error, given the permission', async () => {
    const f = await worn('llBreakLink(2); llBreakAllLinks(); out += [llGetNumberOfPrims()];')
    f.start(f.root)
    f.linkset.advanceTime(2000)
    expect(f.root.global('out')).toEqual([2])
    expect(debug(f.root)).toEqual([])
    expect(f.linkset.prims).toHaveLength(2)
  })

  // In-world: without it, llBreakLink(2) and llBreakAllLinks from the root each told the owner
  // "Script trying to break links but PERMISSION_CHANGE_LINKS permission not set!", and
  // llBreakLink(1) from the child added the root's name and the wearer's position. The listener
  // heard none of them.
  it('tells the owner when the permission is missing', async () => {
    const f = await worn('llBreakLink(2); llBreakAllLinks();', 'llBreakLink(1);')
    f.start(f.root, false)
    f.start(f.child, false)
    f.linkset.advanceTime(2000)
    const text = 'Script trying to break links but PERMISSION_CHANGE_LINKS permission not set!'
    expect(debug(f.root)).toEqual([text, text])
    expect(debug(f.child)).toEqual([`${text} {RootName worn, RootPosition { 118, 48, 1997.44 }}`])
    expect(f.heard()).toEqual([])
    expect(f.linkset.prims).toHaveLength(2)
  })
})
