import { expect, it } from 'vitest'
import { loadLinkset, NULL_KEY, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlGetLinkKey: "When an avatar sits on an
// object, it is added to the end of the link set and will have the largest link
// number." https://wiki.secondlife.com/wiki/LlSitTarget and
// https://wiki.secondlife.com/wiki/LlAvatarOnSitTarget say one avatar holds a
// sit target. Neither page says how the other sitters renumber when one stands,
// or where a second avatar sits when the sit target is taken.
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm 7.3.0, 2026-11-14)
// with two avatars: a lone 1 m box and three linked 1 m boxes 1.5 m apart, each
// with a script that reported, in changed() and on command, llGetLinkNumber,
// llGetNumberOfPrims, llGetLinkKey of every link, llAvatarOnLinkSitTarget of
// every prim, llGetLinkKey(-5), llGetLinkName(-1) and
// llGetLinkPrimitiveParams(-5, [PRIM_NAME]), and PRIM_POS_LOCAL and
// PRIM_ROT_LOCAL of each avatar link. The viewers sent plain sit requests.
// Every "In-world:" note in this file is from those probes.

const FIRST = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa'
const SECOND = 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb'
const TARGET = { enabled: true, offset: { x: 0, y: 0, z: 0.5 }, rotation: { x: 0, y: 0, z: 0, s: 1 } }
const SCRIPTED_ONLY = 6
const REPORT = `list log;
  report() {
    log = [llGetLinkNumber(), llGetNumberOfPrims(), llGetLinkKey(2), llGetLinkKey(3), llGetLinkKey(4),
      llAvatarOnLinkSitTarget(1), llGetLinkKey(-5), llGetLinkName(-1),
      llList2String(llGetLinkPrimitiveParams(-5, [PRIM_NAME]), 0)];
  }
  default { changed(integer c) { if (c & 32) report(); } }`

/** Two avatars beside an object of `prims` 1 m boxes 1.5 m apart along X, with a reporting script in the root. */
async function scene(prims = 1, setup: (world: World) => void = () => {}) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  setup(world)
  const first = world.addAvatar({ region: 'home', key: FIRST, name: 'First Resident', username: 'first',
    position: { x: 116, y: 51, z: 20 } })
  const second = world.addAvatar({ region: 'home', key: SECOND, name: 'Second Resident', username: 'second',
    position: { x: 116, y: 51, z: 20 } })
  const { linkset, scripts } = await loadLinkset({
    world, region: 'home', owner: FIRST, position: { x: 120, y: 48, z: 20 },
    prims: Array.from({ length: prims }, (_, i) => ({
      name: `p${i + 1}`, size: { x: 1, y: 1, z: 1 },
      scripts: i ? [] : [{ name: 'report', source: { source: REPORT } }],
    })),
  })
  linkset.prims.forEach((prim, i) => { if (i) prim.params.position = { x: 1.5 * i, y: 0, z: 0 } })
  scripts.report!.start()
  const log = () => { linkset.advanceTime(100); return scripts.report!.global('log') }
  const sit = (avatar: typeof first, link = 1) => {
    const accepted = world.userSitAvatar(avatar, linkset.prims[link - 1]!)
    linkset.advanceTime(100)
    return accepted
  }
  const stand = (avatar: typeof first) => { world.standAvatar(avatar); linkset.advanceTime(100) }
  return { world, first, second, linkset, log, sit, stand }
}

/** Where a sit request from `second` seats it on link `link` of the same object without any sit target or sitter. */
async function bareSpot(prims = 1, link = 1) {
  const { second, sit } = await scene(prims)
  expect(sit(second, link)).toBe(true)
  return second.sitPlacement
}

const report = (n: number, l2: string, l3: string, onTarget: string, firstOther: string, name: string) =>
  [1, n, l2, l3, NULL_KEY, onTarget, firstOther, name, name]

it('makes a second sitter the last link and renumbers the sitters after it when one stands', async () => {
  const { first, second, linkset, log, sit, stand } = await scene()
  linkset.prims[0]!.params.sitTarget = TARGET

  // In-world: the first avatar took the sit target as link 2; the second sat as link 3,
  // and the box's first other link (-5, -1, and llGetLinkPrimitiveParams(-5)) was the first sitter.
  expect(sit(first)).toBe(true)
  expect(sit(second)).toBe(true)
  expect(log()).toEqual(report(3, FIRST, SECOND, FIRST, FIRST, 'First Resident'))
  expect(first.sitPlacement?.position).toEqual(TARGET.offset)

  // In-world: when the first sitter stood, the second moved down to link 2 without moving
  // in the region, and did not take the sit target: llAvatarOnLinkSitTarget(1) read NULL_KEY.
  const placed = second.sitPlacement
  stand(first)
  expect(log()).toEqual(report(2, SECOND, NULL_KEY, NULL_KEY, SECOND, 'Second Resident'))
  expect(second.sitPlacement).toEqual(placed)

  // In-world: sitting again, the first avatar took the free sit target as link 3, after the
  // second, which stayed the first other link.
  expect(sit(first)).toBe(true)
  expect(log()).toEqual(report(3, SECOND, FIRST, FIRST, SECOND, 'Second Resident'))
  expect(first.sitPlacement?.position).toEqual(TARGET.offset)

  // In-world: when the second stood, the first moved down to link 2.
  stand(second)
  expect(log()).toEqual(report(2, FIRST, NULL_KEY, FIRST, FIRST, 'First Resident'))
})

it('seats an avatar where it sits without a sit target when the sit target is taken', async () => {
  // In-world: the second avatar sat at <-0.59, 0.376, 1.13> facing <0, 0, 1, 0> beside the
  // first on the box's sit target, the spot the same request took on the box without a sit target.
  const { first, second, linkset, sit } = await scene()
  linkset.prims[0]!.params.sitTarget = TARGET
  expect(sit(first)).toBe(true)
  expect(sit(second)).toBe(true)
  expect(second.sittingOn).toBe(linkset.prims[0])
  expect(second.sitPlacement).toEqual(await bareSpot())
})

it('seats a second sitter on the prim it asks for when the only sit target is taken', async () => {
  // In-world: three linked boxes with a sit target on link 1 only, the first avatar on it. The
  // second sat on link 1 at <0, -0.59, 1.13> when it asked for link 1, and on link 2 at
  // <1.5, -0.59, 1.13> when it asked for link 2: each where it sits without a sit target.
  for (const link of [1, 2]) {
    const { first, second, linkset, log, sit } = await scene(3)
    linkset.prims[0]!.params.sitTarget = TARGET
    expect(sit(first)).toBe(true)
    expect(sit(second, link)).toBe(true)
    expect(second.sittingOn).toBe(linkset.prims[link - 1])
    expect(second.sitPlacement).toEqual(await bareSpot(3, link))
    expect(log().slice(0, 2)).toEqual([1, 5])
  }
})

it('seats a scripted sitter beside the avatar on a taken sit target', async () => {
  // The repro from #394: world.sitAvatar seats the second avatar on the prim, not on its sit target.
  const { world, first, second, linkset, log } = await scene()
  linkset.prims[0]!.params.sitTarget = TARGET
  expect(world.sitAvatar(first, linkset.prims[0]!)).toBe(true)
  expect(world.sitAvatar(second, linkset.prims[0]!)).toBe(true)
  expect(second.sittingOn).toBe(linkset.prims[0])
  expect(second.sitPlacement?.position).toEqual({ x: 0, y: 0, z: 0 })
  expect(log()).toEqual(report(3, FIRST, SECOND, FIRST, FIRST, 'First Resident'))
})

it('refuses a sit request when every sit target without SIT_FLAG_SCRIPTED_ONLY is taken', async () => {
  const { first, second, linkset, log, sit } = await scene(3)
  const [p1, , p3] = linkset.prims
  p1!.params.sitTarget = TARGET
  expect(sit(first)).toBe(true)

  // In-world: link 3 with flags 6 and no sit target: requests on links 2 and 1 were refused with
  // "There is no suitable surface to sit on, try another spot."
  p3!.params.sitFlags = SCRIPTED_ONLY
  expect(sit(second, 2)).toBe(false)
  expect(sit(second, 1)).toBe(false)
  expect(second.viewer.alerts.map(alert => alert.name)).toEqual(['CantSitNoSuitableSurface'])

  // In-world: link 3 with a sit target and flags 6 (read back as 7): refused.
  p3!.params.sitTarget = TARGET
  expect(sit(second, 2)).toBe(false)

  // In-world: link 3's flags back to 2 (read back as 3): the request on link 2 took link 3's sit target.
  p3!.params.sitFlags = 2
  expect(sit(second, 2)).toBe(true)
  expect(second.sittingOn).toBe(p3)
  expect(second.sitPlacement?.position).toEqual({ x: 3, y: 0, z: 0.5 })
  expect(log().slice(0, 2)).toEqual([1, 5])
})

it('refuses a sit request at the spot another sitter has', async () => {
  // In-world: on the box without a sit target, the second avatar asked from where the first
  // had asked, which gives the same spot. It was refused with "No room to sit here, try
  // another spot." Asked from 3 m away it sat 0.376 m from the first.
  const { world, first, second, linkset, log, sit } = await scene()
  expect(sit(first)).toBe(true)
  expect(sit(second)).toBe(false)
  expect(second.sittingOn).toBeNull()
  expect(second.viewer.alerts).toMatchObject([{ name: 'CantSitNoRoom', message: 'No room to sit here, try another spot.' }])
  expect(log().slice(0, 2)).toEqual([1, 2])

  world.standAvatar(first)
  expect(world.sitAvatar(first, linkset.prims[0]!, { position: { x: -0.59, y: 0.376, z: 1.13 } })).toBe(true)
  expect(sit(second)).toBe(true)
  expect(log().slice(0, 2)).toEqual([1, 3])
})

it('lets an avatar that sat beside a sit target hold the next free one it sits on', async () => {
  const { world, first, second, linkset } = await scene(2)
  const [p1, p2] = linkset.prims
  p1!.params.sitTarget = TARGET
  p2!.params.sitTarget = TARGET
  expect(world.sitAvatar(first, p1!)).toBe(true)
  expect(world.sitAvatar(second, p1!)).toBe(true)
  expect(world.sitAvatar(second, p2!)).toBe(true)
  expect(world.avatarOnSitTarget(p2!)).toBe(second)
  expect(world.avatarOnSitTarget(p1!)).toBe(first)
})

it('tracks the sit target through the sittingOn setter', async () => {
  const { world, first, second, linkset } = await scene()
  const box = linkset.prims[0]!
  box.params.sitTarget = TARGET
  first.sittingOn = box
  second.sittingOn = box
  expect(world.avatarOnSitTarget(box)).toBe(first)
  expect(second.sitPlacement?.position).toEqual({ x: 0, y: 0, z: 0 })
  second.sittingOn = null
  world.standAvatar(first)
  second.sittingOn = box
  expect(world.avatarOnSitTarget(box)).toBe(second)
  expect(second.sitPlacement?.position).toEqual(TARGET.offset)
})

it('gives a sit target set under seated avatars to the next avatar to sit', async () => {
  // In-world: both avatars sat on the box without a sit target, then the script set one.
  // llAvatarOnSitTarget read NULL_KEY, also once only one of them still sat there. The
  // other avatar then sat again and took the sit target as link 3.
  const { first, second, linkset, log, sit, stand } = await scene()
  const box = linkset.prims[0]!
  expect(sit(second)).toBe(true)
  expect(linkset.world!.sitAvatar(first, box, { position: { x: -0.59, y: -0.375, z: 1.13 } })).toBe(true)
  box.params.sitTarget = TARGET
  expect(log()).toEqual(report(3, SECOND, FIRST, NULL_KEY, SECOND, 'Second Resident'))
  stand(first)
  expect(log()).toEqual(report(2, SECOND, NULL_KEY, NULL_KEY, SECOND, 'Second Resident'))
  expect(sit(first)).toBe(true)
  expect(log()).toEqual(report(3, SECOND, FIRST, FIRST, SECOND, 'Second Resident'))
  expect(first.sitPlacement?.position).toEqual(TARGET.offset)
})

it('keeps reading the holder after its sit target is removed or set again', async () => {
  // In-world: with an avatar on the box's sit target, llLinkSitTarget(LINK_THIS, <0, 0, 0.7>, ...)
  // and llSitTarget(ZERO_VECTOR, ZERO_ROTATION) each left llAvatarOnSitTarget reading it, while
  // PRIM_SIT_TARGET read 1 and then 0.
  const { world, first, linkset } = await scene()
  const box = linkset.prims[0]!
  box.params.sitTarget = TARGET
  expect(world.sitAvatar(first, box)).toBe(true)
  box.params.sitTarget = { ...TARGET, offset: { x: 0, y: 0, z: 0.7 } }
  expect(world.avatarOnSitTarget(box)).toBe(first)
  box.params.sitTarget = { enabled: false, offset: { x: 0, y: 0, z: 0 }, rotation: TARGET.rotation }
  expect(world.avatarOnSitTarget(box)).toBe(first)
})

it('refuses a far sit request on a taken sit target without an alert', async () => {
  // In-world: with the second avatar on the box's sit target, the first asked from 12 m
  // away. It stayed standing, no script got an event and the viewer showed nothing.
  const { first, second, linkset, log, sit } = await scene()
  linkset.prims[0]!.params.sitTarget = TARGET
  expect(sit(second)).toBe(true)
  first.position = { x: 108, y: 48, z: 20 }
  expect(sit(first)).toBe(false)
  expect(first.sittingOn).toBeNull()
  expect(first.viewer.alerts).toEqual([])
  expect(log().slice(0, 2)).toEqual([1, 2])
})

it('keeps an avatar beside the sit target when it asks again after the holder stands', async () => {
  // In-world: the first avatar sat beside the second on the sit target. The second stood,
  // and the first asked to sit on the box again: it stayed where it was, no script got an
  // event and llAvatarOnLinkSitTarget(1) read NULL_KEY. Then the second sat again and took
  // the free sit target as link 3.
  const { first, second, linkset, log, sit, stand } = await scene()
  linkset.prims[0]!.params.sitTarget = TARGET
  expect(sit(second)).toBe(true)
  expect(sit(first)).toBe(true)
  const placed = first.sitPlacement
  stand(second)
  expect(log()).toEqual(report(2, FIRST, NULL_KEY, NULL_KEY, FIRST, 'First Resident'))
  linkset.prims[0]!.scripts[0]!.setGlobal('log', [])
  expect(sit(first)).toBe(true)
  expect(log()).toEqual([])
  expect(first.sitPlacement).toEqual(placed)
  expect(sit(second)).toBe(true)
  expect(log()).toEqual(report(3, FIRST, SECOND, SECOND, FIRST, 'First Resident'))
})
