import { describe, expect, it } from 'vitest'
import { PRIM_TYPE_BOX, PRIM_TYPE_CYLINDER, PRIM_TYPE_PRISM, PRIM_TYPE_SPHERE, PRIM_TYPE_TORUS } from '@rezless/vm'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlSitTarget: "If the object has no sit
// target, the avatar is seated at a position chosen by the simulator." The
// wiki does not say where.
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm 7.3.0,
// 2026-11-14) with one avatar 1.654 m tall standing on a platform. A prim
// without a sit target was put near it, the avatar turned to face it or by
// the angle given, and the viewer sent a plain sit request for the prim,
// which carries no offset. A script in the prim read the avatar's link with
// llGetLinkPrimitiveParams(llGetNumberOfPrims(), [PRIM_POS_LOCAL,
// PRIM_ROT_LOCAL]) in changed(CHANGED_LINK). Each row is one request: the
// prim's shape, size and rotation, where the avatar stood from the prim's
// centre, the way it faced in degrees from +X, and the position and rotation
// read, to 3 decimals.
//
// For boxes and round cylinders with an axis vertical, every request fitted
// this: the line from a point 3 m behind the avatar and 1.94 m above its
// centre to the prim's centre first meets the prim at some point. Seen from
// above, the line leaves the prim's outline through a side. The avatar sat
// 0.09 m out from that side, level with where the line met the prim along
// it, 0.63 m above the prim's top, upright and facing out from that side. The
// rule was fitted to the earlier requests and then predicted the last five
// boxes (4 x 4 x 0.3 m to 1.2 x 2.5 x 0.25 m) to the millimetre. Where the
// viewer reported the avatar sat in the 51 seated requests on boxes and
// cylinders that sit-reach.test.ts lists fits it to within 2 mm too; those
// positions are not kept here. A viewer's
// camera sits about there by default, but moving the viewer's own camera
// could not be tested, so whether the point is the camera is not known.

type Shape = 'box' | 'cylinder' | 'sphere' | 'prism' | 'torus'
type Row = [string, Shape, number[], number[], number[], number, number[], number[]]

const KIND = { box: PRIM_TYPE_BOX, cylinder: PRIM_TYPE_CYLINDER, sphere: PRIM_TYPE_SPHERE, prism: PRIM_TYPE_PRISM, torus: PRIM_TYPE_TORUS }
const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'
const AT = { x: 116, y: 48, z: 1997.42 }

const MATCHED: Row[] = [
  ['0.5 m box', 'box', [0.5, 0.5, 0.5], [0, 0, 0, 1], [-4, 0, 0], 0, [-0.34, 0, 0.88], [0, 0, 1, 0]],
  ['1 m box', 'box', [1, 1, 1], [0, 0, 0, 1], [-4, 0, 0], -0.003, [-0.59, 0, 1.13], [0, 0, 1, 0]],
  ['1 m box at 20 degrees', 'box', [1, 1, 1], [0, 0, 0, 1], [-3.759, -1.368, 0], 20.005, [-0.59, -0.182, 1.13], [0, 0, 1, 0]],
  ['1 m box at -20 degrees', 'box', [1, 1, 1], [0, 0, 0, 1], [-3.759, 1.369, 0], -20.005, [-0.59, 0.182, 1.13], [0, 0, 1, 0]],
  ['1 m box 2 m away', 'box', [1, 1, 1], [0, 0, 0, 1], [-2, 0, 0], -0.001, [-0.59, 0.001, 1.13], [0, 0, 1, 0]],
  ['1 m box 7 m away', 'box', [1, 1, 1], [0, 0, 0, 1], [-6.996, 0.002, 0], -0.014, [-0.59, 0, 1.13], [0, 0, 1, 0]],
  ['1 m box 3 m up', 'box', [1, 1, 1], [0, 0, 0, 1], [-4, 0, -3], -0.003, [-0.59, 0, 1.13], [0, 0, 1, 0]],
  ['1 m box 1.2 m down', 'box', [1, 1, 1], [0, 0, 0, 1], [-4, 0, 1.2], -0.005, [-0.59, 0, 1.13], [0, 0, 1, 0]],
  ['2 m box', 'box', [2, 2, 2], [0, 0, 0, 1], [-3.999, 0, 0], -0.007, [-1.09, -0.001, 1.63], [0, 0, 1, 0]],
  ['2 m box turned 30 degrees', 'box', [2, 2, 2], [0, 0, 0.259, 0.966], [-4, 0, 0], -0.007, [-1.09, 0.577, 1.63], [0, 0, 1, 0]],
  ['2 m box turned 60 degrees', 'box', [2, 2, 2], [0, 0, 0.5, 0.866], [-4, 0, 0], 0.006, [-0.578, 1.09, 1.63], [0, 0, 0.707, 0.707]],
  ['3 x 1 x 0.5 m box', 'box', [3, 1, 0.5], [0, 0, 0, 1], [-4, 0, 0], -0.002, [-1.59, 0.001, 0.88], [0, 0, 1, 0]],
  ['3 x 1 x 0.5 m box turned 90 degrees', 'box', [3, 1, 0.5], [0, 0, 0.707, 0.707], [-4, 0, 0], 0.003, [0, 0.59, 0.88], [0, 0, 0.707, 0.707]],
  ['2 m box upside down', 'box', [2, 2, 2], [-1, 0, 0, 0], [-4, 0, 0], 0.003, [-1.09, 0, -1.63], [0, -1, 0, 0]],
  ['0.5 x 0.5 x 3 m box on its side along X', 'box', [0.5, 0.5, 3], [0, 0.707, 0, 0.707], [-4, 0, 0], 0.003, [-0.88, 0, -1.59], [-0.707, 0, 0.707, 0]],
  ['0.5 x 0.5 x 3 m box on its side along Y', 'box', [0.5, 0.5, 3], [0.707, 0, 0, 0.707], [-4, 0, 0], 0.001, [-0.34, 0.88, 0], [0, 0.707, 0.707, 0]],
  ['2 m cylinder', 'cylinder', [2, 2, 2], [0, 0, 0, 1], [-3.999, -0.001, 0], 0.018, [-1.09, 0.001, 1.63], [0, 0, 1, 0.001]],
  ['2 m cylinder on its side along X', 'cylinder', [2, 2, 2], [0, 0.707, 0, 0.707], [-3.999, -0.005, 0], 0.077, [-1.63, 0, -1.09], [-0.707, 0, 0.707, 0]],
  ['2 m prism', 'prism', [2, 2, 2], [0, 0, 0, 1], [-4, 0, 0], 0.007, [-1.09, 0, 1.63], [0, 0, 1, 0]],
  ['1.5 x 0.8 x 0.6 m box turned 70 degrees, at 15 degrees', 'box', [1.5, 0.8, 0.6], [0, 0, 0.574, 0.819], [-3.863, -1.034, 0], 14.988, [-0.279, 0.49, 0.93], [0, 0, 0.707, 0.707]],
  ['0.6 m box turned -40 degrees, 0.8 m down', 'box', [0.6, 0.6, 0.6], [0, 0, -0.342, 0.94], [-4, 0, 0.8], 0.003, [-0.39, -0.252, 0.93], [0, 0, 1, 0]],
  ['1 x 1 x 2 m cylinder', 'cylinder', [1, 1, 2], [0, 0, 0, 1], [-4, 0, 0], 0.005, [-0.59, 0, 1.63], [0, 0, 1, 0]],
  ['1 m box, the avatar turned 90 degrees from it', 'box', [1, 1, 1], [0, 0, 0, 1], [-3.935, -0.037, 0], 90, [-0.59, -0.386, 1.13], [0, 0, 1, 0]],
  ['1 m box, the avatar turned 90 degrees from it', 'box', [1, 1, 1], [0, 0, 0, 1], [-3.956, -0.062, 0], -90, [-0.59, 0.371, 1.13], [0, 0, 1, 0]],
  ['1 m box, the avatar turned 180 degrees from it', 'box', [1, 1, 1], [0, 0, 0, 1], [-3.95, -0.044, 0], -180, [-0.59, -0.011, 1.13], [0, 0, 1, 0]],
  ['1 m box, the avatar turned 45 degrees from it', 'box', [1, 1, 1], [0, 0, 0, 1], [-3.956, 0.06, 0], 45, [-0.59, -0.169, 1.13], [0, 0, 1, 0]],
  ['2 m box turned 45 degrees, measured again', 'box', [2, 2, 2], [0, 0, 0.383, 0.924], [-3.921, -0.061, 0], 0, [-1.09, 0.982, 1.63], [0, 0, 1, 0]],
  ['3 x 3 x 0.5 m box turned 30 degrees', 'box', [3, 3, 0.5], [0, 0, 0.259, 0.966], [-4, 0, 0], -0.007, [-1.59, 0.451, 0.88], [0, 0, 1, 0]],
  ['3 x 3 x 2 m box turned 30 degrees', 'box', [3, 3, 2], [0, 0, 0.259, 0.966], [-4, 0, 0], -0.005, [-1.59, 0.868, 1.63], [0, 0, 1, 0]],
  ['3 x 3 x 0.5 m box turned 20 degrees', 'box', [3, 3, 0.5], [0, 0, 0.174, 0.985], [-4, 0, 0], 0.005, [-1.59, 0.308, 0.88], [0, 0, 1, 0]],
  ['3 x 3 x 0.5 m box at 10 degrees', 'box', [3, 3, 0.5], [0, 0, 0, 1], [-3.939, -0.695, 0], 10.007, [-1.59, -0.157, 0.88], [0, 0, 1, 0]],
  ['4 x 4 x 0.3 m box turned 15 degrees, 6 m away at 5 degrees', 'box', [4, 4, 0.3], [0, 0, 0.131, 0.991], [-5.977, -0.523, 0], 5.002, [-2.09, 0.121, 0.78], [0, 0, 1, 0]],
  ['2 x 2 x 0.2 m box 1 m up, at 15 degrees', 'box', [2, 2, 0.2], [0, 0, 0, 1], [-3.863, -1.036, -1], 15.004, [-1.09, -0.193, 0.73], [0, 0, 1, 0]],
  ['3 x 1 x 0.4 m box turned 50 degrees, 0.5 m down, 5 m away at -10 degrees', 'box', [3, 1, 0.4], [0, 0, 0.423, 0.906], [-4.924, 0.868, 0.5], -10, [-0.289, 0.59, 0.83], [0, 0, 0.707, 0.707]],
  ['3 x 3 x 0.5 m box, the avatar turned 90 degrees from it', 'box', [3, 3, 0.5], [0, 0, 0, 1], [-3.962, -0.057, 0], 90, [-1.59, -0.394, 0.88], [0, 0, 1, 0]],
  ['1.2 x 2.5 x 0.25 m box turned -25 degrees, 0.3 m up, 3 m away at 20 degrees', 'box', [1.2, 2.5, 0.25], [0, 0, -0.216, 0.976], [-2.819, -1.026, -0.3], 19.992, [-0.69, -0.323, 0.755], [0, 0, 1, 0]],
]

// Prims tilted from an axis vertical, spheres, tori, prisms other than
// unturned, cylinders with an oval top or lying across the line, and a 2 m
// box turned 45 degrees, where the line ran through a corner and the avatar
// sat at the other side from the one rezless picks.
const MISSED: Row[] = [
  ['2 m box turned 45 degrees', 'box', [2, 2, 2], [0, 0, 0.383, 0.924], [-4, 0, 0], 0.003, [-1.09, 1, 1.63], [0, 0, 1, 0]],
  ['2 m box tilted 30 degrees about Y', 'box', [2, 2, 2], [0, 0.259, 0, 0.966], [-4, 0, 0], 0, [-1.458, 0, 0.719], [-0.259, 0, 0.966, 0]],
  ['2 m box tilted -30 degrees about Y', 'box', [2, 2, 2], [0, -0.259, 0, 0.966], [-4, 0, 0], -0.004, [-0.763, 0, 1.591], [0.259, 0, 0.966, 0]],
  ['2 m box tilted 30 degrees about X', 'box', [2, 2, 2], [0.259, 0, 0, 0.966], [-4, 0, 0], -0.007, [-1.09, 0.454, 1.546], [0, 0.259, 0.966, 0]],
  ['2 m box tilted 45 degrees about Y', 'box', [2, 2, 2], [0, 0.383, 0, 0.924], [-4, 0, 0], -0.007, [-1.607, 0, 0.283], [-0.383, 0, 0.924, 0]],
  ['2 m box tilted 45 degrees about X', 'box', [2, 2, 2], [0.383, 0, 0, 0.924], [-4, 0, 0], 0.002, [-1.09, 1.445, 0.642], [0, 0.383, 0.924, 0]],
  ['0.5 x 0.5 x 3 m box tilted 60 degrees about Y', 'box', [0.5, 0.5, 3], [0, 0.5, 0, 0.866], [-4, 0, 0], -0.005, [-0.966, 0, 0.463], [-0.5, 0, 0.866, 0]],
  ['3 x 3 x 0.2 m box tilted 20 degrees about X', 'box', [3, 3, 0.2], [0.174, 0, 0, 0.985], [-3.999, -0.002, 0], 0.022, [-1.59, 0.252, 0.692], [0, 0.174, 0.985, 0]],
  ['1 m sphere', 'sphere', [1, 1, 1], [0, 0, 0, 1], [-4.002, -0.001, 0], 0.007, [-0.501, 0.001, 1.138], [0, 0, 1, 0.001]],
  ['2 m sphere', 'sphere', [2, 2, 2], [0, 0, 0, 1], [-4, 0, 0], 0.003, [-0.96, 0, 1.355], [0, 0, 1, 0]],
  ['2 m sphere on its side', 'sphere', [2, 2, 2], [0, 0.707, 0, 0.707], [-4, 0, 0], 0.004, [-1.355, 0, -0.96], [-0.707, 0, 0.707, 0]],
  ['4 m sphere', 'sphere', [4, 4, 4], [0, 0, 0, 1], [-4, 0, 0], 0.003, [-1.918, -0.001, 1.64], [0, 0, 1, 0]],
  ['2 x 2 x 1 m sphere', 'sphere', [2, 2, 1], [0, 0, 0, 1], [-4, 0, 0], 0.007, [-0.871, 0.005, 1], [0, 0, 0.994, 0.111]],
  ['2 m sphere 3 m up', 'sphere', [2, 2, 2], [0, 0, 0, 1], [-4, 0, -3], 0.006, [-1.084, 0, 0.97], [0, 0, 1, 0]],
  ['2 m cylinder on its side along Y', 'cylinder', [2, 2, 2], [0.707, 0, 0, 0.707], [-4, 0, 0], 0.003, [-0.96, 1.355, 0.001], [0, 0.707, 0.707, 0]],
  ['2 m prism turned 180 degrees', 'prism', [2, 2, 2], [0, 0, -1, 0], [-4, 0, 0], 0.006, [-0.17, 0, 1.029], [0, 0, 0, -1]],
  ['2 m prism turned 90 degrees', 'prism', [2, 2, 2], [0, 0, 0.707, 0.707], [-4, 0, 0], -0.005, [0.131, 0, 0.728], [0, 0, 0, 1]],
  ['2 m torus', 'torus', [2, 2, 2], [0, 0.707, 0, 0.707], [-4, 0, 0], 0.005, [-1.376, -0.006, -0.978], [-0.704, 0.062, 0.704, -0.062]],
  ['2 x 1 x 1 m cylinder at 25 degrees', 'cylinder', [2, 1, 1], [0, 0, 0, 1], [-3.626, -1.691, 0], 25.001, [-0.733, -0.399, 1.13], [0, 0, 0.869, -0.494]],
  ['1 x 2 x 0.4 m box tilted 30 degrees', 'box', [1, 2, 0.4], [0.683, -0.183, 0.183, 0.683], [-3.939, 0.694, 0], -9.997, [-0.263, 1.591, -0.122], [0.183, 0.683, 0.683, 0.183]],
  ['2 x 2 x 0.3 m box tilted 10 degrees about Y', 'box', [2, 2, 0.3], [0, 0.087, 0, 0.996], [-4, 0, 0], -0.001, [-1.218, 0, 0.743], [-0.087, 0, 0.996, 0]],
  ['2 x 2 x 0.3 m box tilted -10 degrees about Y', 'box', [2, 2, 0.3], [0, -0.087, 0, 0.996], [-3.999, -0.003, 0], 0.042, [-0.979, 0, 0.786], [0.087, 0, 0.996, 0]],
  ['2 x 1 x 1 m cylinder', 'cylinder', [2, 1, 1], [0, 0, 0, 1], [-4, 0, 0], 0, [-1.03, -0.001, 1.13], [0, 0, 1, 0]],
  ['1 x 2 x 1 m cylinder', 'cylinder', [1, 2, 1], [0, 0, 0, 1], [-3.998, -0.001, 0], 0.017, [-0.56, 0.001, 1.13], [0, 0, 1, 0]],
  ['2 x 1 x 1 m cylinder at 40 degrees', 'cylinder', [2, 1, 1], [0, 0, 0, 1], [-3.065, -2.571, 0], 39.998, [-0.555, -0.505, 1.13], [0, 0, 0.869, -0.494]],
  ['3 x 1 x 1 m cylinder at 25 degrees', 'cylinder', [3, 1, 1], [0, 0, 0, 1], [-3.625, -1.692, 0], 25.017, [-0.88, -0.478, 1.13], [0, 0, -0.827, 0.562]],
]

const SEAT = `vector pos; rotation rot;
default { changed(integer c) {
  if (!(c & CHANGED_LINK)) return;
  list p = llGetLinkPrimitiveParams(llGetNumberOfPrims(), [PRIM_POS_LOCAL, PRIM_ROT_LOCAL]);
  pos = llList2Vector(p, 0); rot = llList2Rot(p, 1);
} }`

async function sit([, shape, [sx, sy, sz], [rx, ry, rz, rs], [ax, ay, az], facing]: Row) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const half = (facing * Math.PI) / 360
  const avatar = world.addAvatar({
    region: 'home', key: AVATAR, name: 'av', username: 'av', position: { ...AT }, rotation: { x: 0, y: 0, z: Math.sin(half), s: Math.cos(half) },
  })
  const loaded = await loadLinkset({
    world, region: 'home', owner: AVATAR, position: { x: AT.x - ax!, y: AT.y - ay!, z: AT.z - az! },
    prims: [{ scripts: [{ name: 'seat', source: { source: SEAT } }] }],
  })
  const prim = loaded.linkset.prims[0]!
  prim.params.size = { x: sx!, y: sy!, z: sz! }
  prim.params.rotation = { x: rx!, y: ry!, z: rz!, s: rs! }
  prim.params.shape = { ...prim.params.shape, kind: KIND[shape] } as typeof prim.params.shape
  const script = loaded.scripts.seat!
  script.start()
  expect(world.userSitAvatar(avatar, prim)).toBe(true)
  loaded.linkset.advanceTime(100)
  return { pos: script.global('pos') as { x: number; y: number; z: number }, rot: script.global('rot') as { x: number; y: number; z: number; s: number } }
}

function check(row: Row, { pos, rot }: Awaited<ReturnType<typeof sit>>) {
  const [lx, ly, lz] = row[6], [qx, qy, qz, qs] = row[7]
  expect(Math.hypot(pos.x - lx!, pos.y - ly!, pos.z - lz!)).toBeLessThan(0.005)
  expect(Math.abs(rot.x * qx! + rot.y * qy! + rot.z * qz! + rot.s * qs!)).toBeGreaterThan(0.999)
}

describe('where a plain sit request seats an avatar on a prim without a sit target', () => {
  it.each(MATCHED)('%s', async (...row) => { check(row, await sit(row)) })
  it.fails.each(MISSED)('%s', async (...row) => { check(row, await sit(row)) })

  // In-world: a 1 m root box with a 2 x 1 x 1 m box turned 30 degrees as link
  // 2, 2.5 m along X, 0.5 m along Y and 0.5 m up from it. The avatar stood
  // 4.098 m behind the root along X and 0.359 m along Y, faced link 2 and
  // asked to sit on it. The root's script read the avatar's link at
  // <1.419, 0.557, 1.63> and <0, 0, 0.866, 0.5>: on link 2, by the same rule,
  // in the root's frame.
  it('on a child prim, read from the root', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const child = { x: 2.5, y: 0.5, z: 0.5 }
    const half = Math.atan2(child.y - 0.359, child.x + 4.098) / 2
    const avatar = world.addAvatar({
      region: 'home', key: AVATAR, name: 'av', username: 'av', position: { ...AT }, rotation: { x: 0, y: 0, z: Math.sin(half), s: Math.cos(half) },
    })
    const loaded = await loadLinkset({
      world, region: 'home', owner: AVATAR, position: { x: AT.x + 4.098, y: AT.y - 0.359, z: AT.z },
      prims: [{ scripts: [{ name: 'seat', source: { source: SEAT } }] }, {}],
    })
    const link = loaded.linkset.prims[1]!
    link.params.position = child
    link.params.size = { x: 2, y: 1, z: 1 }
    link.params.rotation = { x: 0, y: 0, z: Math.sin(Math.PI / 12), s: Math.cos(Math.PI / 12) }
    loaded.scripts.seat!.start()
    expect(world.userSitAvatar(avatar, link)).toBe(true)
    loaded.linkset.advanceTime(100)
    check(['', 'box', [], [], [], 0, [1.419, 0.557, 1.63], [0, 0, 0.866, 0.5]], {
      pos: loaded.scripts.seat!.global('pos') as { x: number; y: number; z: number },
      rot: loaded.scripts.seat!.global('rot') as { x: number; y: number; z: number; s: number },
    })
  })
})
