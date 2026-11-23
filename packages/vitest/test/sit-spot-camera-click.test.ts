import { describe, expect, it } from 'vitest'
import type { Vector } from '@rezless/vm'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlSitTarget: "If the object has no sit
// target, the avatar is seated at a position chosen by the simulator."
// sit-spot.test.ts pins where, for a plain request from a viewer whose camera
// rests behind the avatar: on the line from a point 3 m behind the avatar and
// 1.94 m above it to the prim's centre.
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm 7.3.0, 2026-11-23)
// on a 1 m box without a sit target, unturned, centred at <123, 52, 1997.47>.
// The avatar stood about 4 m from it along -X and turned to face its centre.
// The viewer moved its own camera, which the region follows, or sent the sit
// request with an offset from the box's centre in region axes, as a click on
// that spot of the box does. A script in the box read the avatar's link with
// PRIM_POS_LOCAL and PRIM_ROT_LOCAL in changed(CHANGED_LINK). Each row gives
// the avatar's region position, the camera's region position (none: where it
// rests), the offset, and the position and rotation read.

type Row = [string, Vector, Vector | null, Vector | null, Vector, [number, number, number, number]]

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'
const BOX = { x: 123, y: 52, z: 1997.47 }
const v = (x: number, y: number, z: number) => ({ x, y, z })
const AWAY = [0, 0, 1, 0] as [number, number, number, number]

// The line runs from the camera: it met the -Y side from a camera on -Y, a
// corner from one above +X +Y, and the top first from one steeply above -X,
// where the side is still the one towards the camera.
const CAMERA: Row[] = [
  ['camera 4 m along -Y and 1.9 m up', v(119.843, 52.065, 1997.448), v(122.978, 48.015, 1999.37), null, v(0, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['camera 3 m along +X and +Y and 2 m up', v(118.362, 52.145, 1997.448), v(125.962, 54.99, 1999.469), null, v(0.499, 0.59, 1.13), [0, 0, 0.707, 0.707]],
  ['camera 4 m along -X and 6 m up', v(118.324, 51.849, 1997.448), v(118.986, 51.999, 2003.454), null, v(-0.59, 0, 1.13), AWAY],
]

// With the camera where it rests, the line runs to the clicked spot: a click
// on a side, or on the far side, seats the avatar where the line first meets
// the box.
const CLICK: Row[] = [
  ['no click', v(119.551, 51.98, 1997.448), null, null, v(-0.59, -0.002, 1.13), AWAY],
  ['click on the +Y side', v(118.271, 52.212, 1997.448), null, v(0, 0.5, 0), v(-0.59, 0.483, 1.13), AWAY],
  ['click on the far +X side', v(118.082, 51.828, 1997.448), null, v(0.5, 0, 0), v(-0.59, -0.021, 1.13), AWAY],
  ['click on the near -X side', v(118.426, 52.152, 1997.448), null, v(-0.5, 0.3, 0), v(-0.59, 0.3, 1.13), AWAY],
  ['click 0.2 m up the near side', v(118.336, 51.998, 1997.437), null, v(-0.5, 0, 0.2), v(-0.59, 0, 1.13), AWAY],
  ['click 0.25 m down the near side', v(118.488, 51.999, 1997.448), null, v(-0.5, 0, -0.25), v(-0.59, 0, 1.13), AWAY],
  ['click 0.4 m down the near side, from 3.1 m', v(119.872, 51.999, 1997.448), null, v(-0.5, 0, -0.4), v(-0.59, 0, 1.13), AWAY],
]

// In-world: a click low on the near side was refused with "There is no
// suitable surface to sit on" from about 4.6 m away: 0.3 and 0.4 m below the
// centre, and 0.4 m below at 0.3 m along Y. From 4.5 m a click 0.25 m below
// seated the avatar, and from 3.1 m clicks 0.35 and 0.4 m below did. No rule
// was found for which clicks the region refuses, so rezless seats them all.
const LOW_REFUSED: Row[] = [
  ['click 0.4 m down the near side, from 4.8 m', v(118.187, 51.754, 1997.448), null, v(-0.5, 0, -0.4), v(0, 0, 0), AWAY],
  ['click 0.4 m down the near side, from 4.6 m', v(118.403, 51.975, 1997.448), null, v(-0.5, 0, -0.4), v(0, 0, 0), AWAY],
  ['click 0.3 m down the near side, from 4.7 m', v(118.29, 51.999, 1997.448), null, v(-0.5, 0, -0.3), v(0, 0, 0), AWAY],
  ['click 0.4 m down the near side at 0.3 m along Y', v(118.484, 51.999, 1997.448), null, v(-0.5, 0.3, -0.4), v(0, 0, 0), AWAY],
]

// A click on the top: the line meets the top at the clicked spot, and the
// avatar sat at one of the box's sides, in line with the spot. rezless takes
// the side towards the camera, as for a request whose line meets the top
// first; Second Life often took another. In every row where one side was
// nearer the spot than the others among the sides towards and away from the
// camera and the side towards the avatar, the avatar sat at that side; where
// two of those were equally near, no rule was found.
const TOP: Row[] = [
  ['camera 7 m along -X, click at -0.4, -0.4 on the top: -X side', v(119.276, 53.108, 1997.439), v(116, 52, 1999.37), v(-0.4, -0.4, 0.5), v(-0.59, -0.4, 1.13), AWAY],
  ['camera 7 m along -X, click at -0.4, 0.4 on the top: -X side', v(118.233, 52.577, 1997.448), v(116, 52, 1999.37), v(-0.4, 0.4, 0.5), v(-0.59, 0.4, 1.13), AWAY],
  ['camera 7 m along -X, click at -0.2, 0 on the top: -X side', v(120.2, 51.942, 1997.448), v(116, 52, 1999.37), v(-0.2, 0, 0.5), v(-0.59, 0, 1.13), AWAY],
  ['camera 4 m along -Y, click at 0.4, -0.4 on the top: -Y side', v(120.2, 52.333, 1997.448), v(122.97, 48.016, 1999.37), v(0.4, -0.4, 0.5), v(0.4, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['camera 4 m along -Y, click at 0.1, 0 on the top: -Y side', v(120.122, 52.229, 1997.448), v(122.97, 48.016, 1999.37), v(0.1, 0, 0.5), v(0.1, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['camera 4 m along -Y, click at -0.4, -0.4 on the top: -Y side', v(118.061, 52.162, 1997.448), v(122.97, 48.016, 1999.37), v(-0.4, -0.4, 0.5), v(-0.4, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['camera 4 m along -Y, click at 0.3, -0.2 on the top: -Y side', v(119.959, 52.528, 1997.448), v(122.978, 48.018, 1999.37), v(0.3, -0.2, 0.5), v(0.3, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['avatar and camera along -Y, click at 0, 0 on the top: -Y side', v(123.171, 46.91, 1997.448), v(123, 45, 1999.37), v(0, 0, 0.5), v(0, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['avatar and camera along -Y, click at 0.3, -0.2 on the top: -Y side', v(123.062, 48.854, 1997.448), v(123, 45, 1999.37), v(0.3, -0.2, 0.5), v(0.3, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['avatar and camera along -Y, click at -0.3, 0 on the top: -Y side', v(123.204, 48.762, 1997.448), v(123, 45, 1999.37), v(-0.3, 0, 0.5), v(-0.3, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['avatar and camera along -Y, click at -0.3, -0.2 on the top: -Y side', v(123.218, 48.288, 1997.448), v(123, 45, 1999.37), v(-0.3, -0.2, 0.5), v(-0.3, -0.59, 1.13), [0, 0, -0.707, 0.707]],
]
const TOP_MISSED: Row[] = [
  ['camera 7 m along -X, click at 0.2, -0.4 on the top: +X side', v(118.06, 52.269, 1997.448), v(116, 52, 1999.37), v(0.2, -0.4, 0.5), v(0.59, -0.4, 1.13), [0, 0, 0, 1]],
  ['camera 7 m along -X, click at 0.4, 0.4 on the top: +X side', v(118.491, 51.893, 1997.448), v(116, 52, 1999.37), v(0.4, 0.4, 0.5), v(0.59, 0.4, 1.13), [0, 0, 0, 1]],
  ['camera 7 m along -X, click at 0, 0 on the top: +X side', v(118.129, 52.289, 1997.448), v(116, 52, 1999.37), v(0, 0, 0.5), v(0.59, 0, 1.13), [0, 0, 0, 1]],
  ['camera 4 m along -Y, click at -0.4, 0.4 on the top: -X side', v(118.142, 52.352, 1997.448), v(122.97, 48.016, 1999.37), v(-0.4, 0.4, 0.5), v(-0.59, 0.4, 1.13), AWAY],
  ['camera 4 m along -Y, click at 0.4, 0.4 on the top: +Y side', v(118.166, 52.174, 1997.448), v(122.97, 48.016, 1999.37), v(0.4, 0.4, 0.5), v(0.4, 0.59, 1.13), [0, 0, 0.707, 0.707]],
  ['camera 4 m along -Y, click at -0.1, 0 on the top: -X side', v(118.32, 51.612, 1997.448), v(122.97, 48.016, 1999.37), v(-0.1, 0, 0.5), v(-0.59, 0, 1.13), AWAY],
  ['camera 4 m along -Y, click at 0, 0 on the top: +Y side', v(118.002, 52.166, 1997.448), v(122.972, 48.015, 1999.37), v(0, 0, 0.5), v(0, 0.59, 1.13), [0, 0, 0.707, 0.707]],
  ['camera 4 m along +X, click at 0, 0 on the top: -X side', v(118.157, 52.142, 1997.448), v(126.956, 52, 1999.37), v(0, 0, 0.5), v(-0.59, 0, 1.13), AWAY],
  ['camera 4 m along +X, click at -0.3, 0.2 on the top: -X side', v(118.241, 52.0, 1997.448), v(126.956, 52, 1999.37), v(-0.3, 0.2, 0.5), v(-0.59, 0.2, 1.13), AWAY],
  ['camera at rest, click at 0, 0.4 on the top: +X side', v(118.089, 52.001, 1997.448), null, v(0, 0.4, 0.5), v(0.59, 0.4, 1.13), [0, 0, 0, 1]],
  ['camera at rest, click at 0, -0.3 on the top: +X side', v(118.29, 52.002, 1997.448), null, v(0, -0.3, 0.5), v(0.59, -0.3, 1.13), [0, 0, 0, 1]],
  ['camera at rest, click at 0.3, 0.3 on the top: +X side', v(119.86, 52.098, 1997.448), null, v(0.3, 0.3, 0.5), v(0.59, 0.3, 1.13), [0, 0, 0, 1]],
  ['camera at rest, click at 0, 0 on the top: +X side', v(118.341, 51.949, 1997.448), null, v(0, 0, 0.5), v(0.59, 0, 1.13), [0, 0, 0, 1]],
]

async function sit([, at, camera, offset]: Row, turn = { x: 0, y: 0, z: 0, s: 1 }) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const half = Math.atan2(BOX.y - at.y, BOX.x - at.x) / 2
  const avatar = world.addAvatar({
    region: 'home', key: AVATAR, name: 'av', username: 'av', position: at, rotation: { x: 0, y: 0, z: Math.sin(half), s: Math.cos(half) },
  })
  const loaded = await loadLinkset({
    world, region: 'home', owner: AVATAR, position: BOX,
    prims: [{ scripts: [{ name: 'seat', source: { source: `vector pos; rotation rot; default { changed(integer c) {
      list p = llGetLinkPrimitiveParams(llGetNumberOfPrims(), [PRIM_POS_LOCAL, PRIM_ROT_LOCAL]);
      pos = llList2Vector(p, 0); rot = llList2Rot(p, 1); } }` } }] }],
  })
  const prim = loaded.linkset.prims[0]!
  prim.params.size = v(1, 1, 1)
  prim.params.rotation = turn
  loaded.scripts.seat!.start()
  if (camera) world.setAvatarCamera(avatar, camera)
  expect(world.userSitAvatar(avatar, prim, offset ?? undefined)).toBe(true)
  loaded.linkset.advanceTime(100)
  return { world, avatar, prim, pos: loaded.scripts.seat!.global('pos') as Vector, rot: loaded.scripts.seat!.global('rot') as { x: number; y: number; z: number; s: number } }
}

function check(row: Row, { pos, rot }: { pos: Vector; rot: { x: number; y: number; z: number; s: number } }) {
  const want = row[4], [qx, qy, qz, qs] = row[5]
  // Where the camera rests is known to a few centimetres, and the avatar's
  // heading to a degree, so those rows allow 1.5 cm.
  expect(Math.hypot(pos.x - want.x, pos.y - want.y, pos.z - want.z)).toBeLessThan(row[2] ? 0.005 : 0.015)
  expect(Math.abs(rot.x * qx + rot.y * qy + rot.z * qz + rot.s * qs)).toBeGreaterThan(0.999)
}

describe('where a sit request seats an avatar on a prim without a sit target', () => {
  it.each(CAMERA)('%s', async (...row) => { check(row, await sit(row)) })
  it.each(CLICK)('%s', async (...row) => { check(row, await sit(row)) })
  it.each(TOP)('%s', async (...row) => { check(row, await sit(row)) })
  it.fails.each(TOP_MISSED)('%s', async (...row) => { check(row, await sit(row)) })

  it.fails.each(LOW_REFUSED)('refuses a %s', async (...row) => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const half = Math.atan2(BOX.y - row[1].y, BOX.x - row[1].x) / 2
    const avatar = world.addAvatar({ region: 'home', key: AVATAR, name: 'av', username: 'av', position: row[1], rotation: { x: 0, y: 0, z: Math.sin(half), s: Math.cos(half) } })
    const { linkset } = await loadLinkset({ world, region: 'home', owner: AVATAR, position: BOX, prims: [{}] })
    linkset.prims[0]!.params.size = v(1, 1, 1)
    expect(world.userSitAvatar(avatar, linkset.prims[0]!, row[3]!)).toBe(false)
  })

  // In-world, the same box turned 90 degrees about Z: the offset is read in
  // region axes from the prim's centre, as the viewer sends a click. Positions
  // are in the box's frame: its +Y side faces region -X.
  it.each([
    ['no click', v(119.166, 52.624, 1997.448), null, null, v(0.085, 0.59, 1.13), [0, 0, 0.707, 0.707]],
    ['click on the region +Y side', v(118.424, 51.992, 1997.448), null, v(0, 0.5, 0), v(0.467, 0.59, 1.13), [0, 0, 0.707, 0.707]],
    ['click on the near region -X side', v(118.313, 52.247, 1997.448), null, v(-0.5, 0.3, 0), v(0.3, 0.59, 1.13), [0, 0, 0.707, 0.707]],
  ] as Row[])('box turned 90 degrees, %s', async (...row) => {
    check(row, await sit(row, { x: 0, y: 0, z: Math.SQRT1_2, s: Math.SQRT1_2 }))
  })

  it('puts the camera back behind the avatar after a teleport', async () => {
    const { world, avatar, prim } = await sit(CAMERA[0]!)
    world.teleportAvatar(avatar, { x: CLICK[0]![1].x, y: CLICK[0]![1].y, z: CLICK[0]![1].z })
    expect(world.getSitResponse(avatar, prim)!.position).toMatchObject({ x: expect.closeTo(-0.59, 2), z: expect.closeTo(1.13, 2) })
  })

  it('takes only a finite camera position', async () => {
    const { world, avatar } = await sit(CLICK[0]!)
    expect(() => world.setAvatarCamera(avatar, v(Infinity, 0, 0))).toThrow(RangeError)
    expect(() => world.setAvatarCamera(avatar, v(0, NaN, 0))).toThrow(RangeError)
  })

  it('goes back to the camera behind the avatar once the camera is cleared', async () => {
    const row = CLICK[0]!
    const { world, avatar, prim } = await sit(CAMERA[0]!)
    world.standAvatar(avatar)
    world.setAvatarCamera(avatar)
    avatar.position = { ...row[1] }
    expect(world.getSitResponse(avatar, prim)!.position).toMatchObject({ x: expect.closeTo(-0.59, 2), z: expect.closeTo(1.13, 2) })
  })
})
