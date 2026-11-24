import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlGetRot
// https://wiki.secondlife.com/wiki/LlGetLocalRot
// https://wiki.secondlife.com/wiki/LlGetRootRotation
// https://wiki.secondlife.com/wiki/PRIM_ROTATION
// https://wiki.secondlife.com/wiki/LlGetObjectDetails
// In-world: SLua Tideland on the Aditi beta grid (2026-11-24), Mono. The probe avatar wore two
// two-prim objects of 0.1 m boxes, one on the chest and one on HUD center, each with its child
// turned <20, 0, 50> degrees in the linkset. A script in each prim read llGetRot,
// llGetRootRotation, llGetLocalRot, PRIM_ROTATION and PRIM_ROT_LOCAL of its own link and of link
// 1, and OBJECT_ROT of the wearer and of itself, with the attachment unturned on its point, turned
// on it (chest <0, 35, 0>, HUD <10, 0, 70>), with the avatar turned, and seated on a box turned
// 40 degrees, before and after the chest attachment was turned <30, 0, 10> on its point.

type Rot = { x: number, y: number, z: number, s: number }
const q = (x: number, y: number, z: number, s: number): Rot => ({ x, y, z, s })
const CHILD = q(0.157379, -0.073387, 0.416198, 0.892539)

const PROBE = `
list out;
default {
  touch_start(integer n) {
    list lp = llGetLinkPrimitiveParams(LINK_THIS, [PRIM_ROTATION, PRIM_ROT_LOCAL]);
    list rp = llGetLinkPrimitiveParams(1, [PRIM_ROTATION, PRIM_ROT_LOCAL]);
    out = [llGetRot(), llGetRootRotation(), llGetLocalRot()] + lp + rp
      + llGetObjectDetails(llGetKey(), [OBJECT_ROT]);
  }
}
`

async function fixture(point: number, onPoint: Rot, wearer: Rot) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const key = '00000000-0000-4000-8000-000000000647'
  const avatar = world.addAvatar({
    region: 'home', key, name: 'av', username: 'av', size: { x: 0.45, y: 0.6, z: 1.65 },
    position: { x: 116, y: 48, z: 20 }, rotation: wearer,
  })
  const { linkset, scripts } = await loadLinkset({
    world, region: 'home', owner: key, position: { x: 116, y: 46.5, z: 20 },
    prims: [
      { name: 'probe root', scripts: [{ name: 'root', source: { source: PROBE } }] },
      { name: 'probe child', position: { x: 0.3, y: 0, z: 0 }, scripts: [{ name: 'child', source: { source: PROBE } }] },
    ],
  })
  for (const s of Object.values(scripts)) s!.start()
  linkset.prims[1]!.params.rotation = CHILD
  linkset.attachToAvatar(key, point)
  linkset.prims[0]!.params.rotation = onPoint
  const read = (name: 'root' | 'child') => {
    const script = scripts[name]!
    script.fire('touch_start', { num_detected: 1 })
    linkset.advanceTime(100)
    return script.global('out') as Rot[]
  }
  return { avatar, read }
}

function expectRotations(actual: Rot[], expected: Rot[]) {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((r, i) => {
    for (const axis of ['x', 'y', 'z', 's'] as const) expect(r[axis], `value ${i} ${axis}`).toBeCloseTo(expected[i]![axis], 5)
  })
}

// [wearer, attachment's rotation on its point, child's llGetRot] as read in-world.
const CASES: [string, number, Rot, Rot, Rot][] = [
  ['unturned on the chest, standing', 1, q(0, 0, 0.707107, 0.707107), q(0, 0, 0, 1), q(0.163176, 0.059391, 0.925417, 0.336824)],
  ['turned on the chest, standing', 1, q(0, 0, 0.707107, 0.707107), q(0, 0.300706, 0, 0.953717), q(0.163176, 0.059391, 0.925417, 0.336824)],
  ['turned on the chest, avatar turned', 1, q(0, 0, 0.191125, 0.981566), q(0, 0.300706, 0, 0.953717), q(0.168504, -0.041955, 0.579112, 0.796540)],
  ['turned on the chest, seated', 1, q(0, 0, 0.939693, -0.342020), q(0, 0.300706, 0, 0.953717), q(0.015134, 0.172987, 0.696364, -0.696364)],
  ['turned again on the chest, seated', 1, q(0, 0, 0.939693, -0.342020), q(0.257834, -0.022558, 0.084186, 0.962250), q(0.015134, 0.172987, 0.696364, -0.696364)],
  ['unturned on a HUD, standing', 35, q(0, 0, 0.707107, 0.707107), q(0, 0, 0, 1), q(0.163176, 0.059391, 0.925417, 0.336824)],
  ['turned on a HUD, standing', 35, q(0, 0, 0.707107, 0.707107), q(0.071394, -0.049990, 0.571394, 0.816035), q(0.163176, 0.059391, 0.925417, 0.336824)],
  ['turned on a HUD, avatar turned', 35, q(0, 0, 0.191125, 0.981566), q(0.071394, -0.049990, 0.571394, 0.816035), q(0.168504, -0.041955, 0.579112, 0.796540)],
  ['turned on a HUD, seated', 35, q(0, 0, 0.939693, -0.342020), q(0.071394, -0.049990, 0.571394, 0.816035), q(0.015134, 0.172987, 0.696364, -0.696364)],
]

describe('rotation reads in a child prim of an attachment', () => {
  // In-world, in every case: the child's llGetRot, PRIM_ROTATION and OBJECT_ROT were its rotation
  // in the linkset times the wearer's, whatever the attachment's turn on its point; its
  // llGetRootRotation and link 1's PRIM_ROTATION were the wearer's; its llGetLocalRot and
  // PRIM_ROT_LOCAL were its rotation in the linkset; link 1's PRIM_ROT_LOCAL was the attachment's
  // rotation on its point.
  for (const [label, point, wearer, onPoint, global] of CASES) it(label, async () => {
    const f = await fixture(point, onPoint, wearer)
    expectRotations(f.read('child'), [global, wearer, CHILD, global, CHILD, wearer, onPoint, global])
  })

  it('reads the same in the root as #637 measured', async () => {
    // In-world: the root read the wearer's rotation for llGetRot, llGetRootRotation, PRIM_ROTATION
    // and OBJECT_ROT, and its rotation on the point for llGetLocalRot and PRIM_ROT_LOCAL.
    const [, point, wearer, onPoint] = CASES[3]!
    const f = await fixture(point, onPoint, wearer)
    expectRotations(f.read('root'), [wearer, wearer, onPoint, wearer, onPoint, wearer, onPoint, wearer])
  })

  it('follows the wearer when the avatar turns', async () => {
    const [, point, wearer, onPoint] = CASES[1]!
    const f = await fixture(point, onPoint, wearer)
    f.avatar.rotation = CASES[2]![2]
    const [rot, root] = f.read('child')
    expectRotations([rot!, root!], [CASES[2]![4], CASES[2]![2]])
  })
})
