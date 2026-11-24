import { describe, expect, it } from 'vitest'
import { loadScript } from '../src/index.js'
import type { Rotation } from '@rezless/vm'

// https://wiki.secondlife.com/wiki/LlLookAt points the prim's +Z axis at the target but says
// nothing about the turn about that axis.
//
// In-world: llLookAt(llGetPos() + offset, 1, 1) from a non-physical prim, 168 directions: 72
// elevation and bearing pairs from a rezzed child of an unrotated root; the same 72 from that
// child worn on the chest at wearer heading 90; 24 of them again at heading -42 with the root
// turned 40 degrees on its point, and 72 more directions there; and 24 exact offsets from a
// rezzed root (Aditi, SLua Tideland, Mono, 2026-11-24). Worn and rezzed, both headings and the
// turned root gave identical rotations, the look was complete at the first sample (44 ms), and
// the prim's earlier rotation made no difference. Every result matched,
// to the five printed digits, the rotation built from the rows (left x dir, left, dir) with
// dir the unit direction and left = <0, 0, 1> x dir left unnormalised, read as llAxes2Rot reads a
// matrix and then normalised.
const measured: Array<[string, [number, number, number, number]]> = [
  ['<0, 0, 5>', [0, 0, 0, 1]],
  ['<0, 0, -5>', [1, 0, 0, 0]],
  ['<0, 0, -0.01>', [1, 0, 0, 0]],
  ['<0.001, 0, -5>', [0, 1, 0, 0.0001]],
  ['<0, 0.001, -5>', [1, -0.0002, 0, -0.0001]],
  ['<-0.001, 0, -5>', [1, 0, -0.0001, 0]],
  ['<0.001, 0.001, -5>', [-0.0002, 1, 0.0001, 0.0001]],
  ['<0, 0.001, 5>', [-0.0001, 0, 0.0002, 1]],
  ['<3, -2, 1>', [0.17865, 0.57832, -0.22639, 0.76314]],
  ['<-1.5, 4, -2.5>', [0.73722, -0.45721, -0.39393, -0.30378]],
  ['<2, 2, -0.3>', [-0.28531, 0.68655, 0.25521, 0.61816]],
  ['<-4, 1, 3.5>', [-0.41597, 0.05823, 0.90243, 0.09592]],
  ['<0.2, -0.1, 3>', [0.01559, 0.03377, -0.03113, 0.99882]],
  ['<-3, -3, -0.5>', [0.69086, 0.28501, -0.61350, 0.25515]],
  ['<1, 1, 0>', [-0.27060, 0.65328, 0.27060, 0.65328]],
  ['<0, 2, 0>', [0.5, -0.5, -0.5, -0.5]],
  ['<-2, 0, 0>', [0.70711, 0, -0.70711, 0]],
]
// Elevation and bearing in degrees, the target 5 m away along them.
const grid: Array<[number, number, [number, number, number, number]]> = [
  [45, 60, [-0.22308, 0.31094, 0.38082, 0.84174]],
  [45, -110, [0.35671, 0.13859, -0.60894, 0.69480]],
  [53, -135, [0.31385, -0.04673, -0.56449, 0.76201]],
  [70, 110, [-0.17365, 0, 0.33682, 0.92542]],
  [70, -160, [0.08625, -0.15071, -0.16729, 0.97049]],
  [80, -180, [0, -0.08716, 0, 0.99619]],
  [85, -60, [0.03610, 0.02448, -0.07207, 0.99645]],
  [20, -160, [-0.56431, -0.10270, 0.80747, -0.13782]],
  [10, 135, [-0.59307, 0.24786, 0.70866, 0.29091]],
  [-20, 60, [-0.39678, 0.71664, 0.29566, 0.49151]],
  [-45, -110, [0.81460, 0.43586, -0.28506, 0.25532]],
  [-60, -135, [0.93457, 0.24411, -0.22333, 0.13082]],
  [-85, 135, [0.99737, -0.05790, -0.03258, -0.02900]],
  [0, 110, [0.57923, -0.40558, -0.57923, -0.40558]],
  [-60, 90, [0.86395, -0.43198, -0.11575, -0.23150]],
  [-85, -90, [0.99528, 0.08674, -0.00379, 0.04345]],
]

async function look(target: string, physical = false) {
  const s = await loadScript({ source: `rotation r;
    default { state_entry() { ${physical ? 'llSetStatus(STATUS_PHYSICS, TRUE); llMoveToTarget(llGetPos(), 0.2);' : ''}
      llLookAt(llGetPos() + ${target}, 1, 1); r = llGetRot(); }
      touch_start(integer n) { r = llGetRot(); } }` })
  s.start()
  if (physical) {
    s.advanceTime(10000)
    s.fire('touch_start', { num_detected: 1 })
  }
  return s.global('r') as Rotation
}

function expectRotation(r: Rotation, expected: [number, number, number, number]) {
  const sign = Math.sign(r.x * expected[0] + r.y * expected[1] + r.z * expected[2] + r.s * expected[3]) || 1
  expect([r.x, r.y, r.z, r.s].map(n => n * sign)).toEqual(expected.map(n => expect.closeTo(n, 4)))
}

describe('the turn llLookAt gives about the axis it aims', () => {
  it.each(measured)('looks at llGetPos() + %s as Second Life does', async (offset, expected) => {
    expectRotation(await look(offset), expected)
  })

  it.each(grid)('looks 5 m away at elevation %d and bearing %d as Second Life does', async (e, b, expected) => {
    expectRotation(await look(`5 * <llCos(${e} * DEG_TO_RAD) * llCos(${b} * DEG_TO_RAD), llCos(${e} * DEG_TO_RAD) * llSin(${b} * DEG_TO_RAD), llSin(${e} * DEG_TO_RAD)>`), expected)
  })

  // In-world: the same looks from a buoyant physical prim held in place with llMoveToTarget, at
  // elevation and bearing (53, 90), (45, -110), (70, 160), (30, 45), (-45, 60) and (0, 60), came
  // to rest 0.1 to 3.2 degrees from the non-physical rotation (and 0.3 to 140 degrees from a
  // look that keeps +Y level) and did not move further in the next second (same session).
  it('turns a physical prim toward the same rotation', async () => {
    const target = '<0, 5 * llCos(53 * DEG_TO_RAD), 5 * llSin(53 * DEG_TO_RAD)>'
    const settled = await look(target, true)
    expectRotation(settled, [-0.27187, 0.16362, 0.48899, 0.81253])
    const inWorld = { x: -0.26109, y: 0.15713, z: 0.46960, s: 0.82863 }
    const dot = Math.abs(settled.x * inWorld.x + settled.y * inWorld.y + settled.z * inWorld.z + settled.s * inWorld.s)
    expect(2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI).toBeLessThan(3.5)
  })
})
