import { describe, expect, it } from 'vitest'
import { loadLinkset, loadRlvPair, World } from '../src/index.js'

// Neither https://wiki.secondlife.com/wiki/LlSitTarget nor
// https://wiki.secondlife.com/wiki/Sit says how far away a prim without a sit
// target can be sat on.
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm 7.3.0, 2026-11-14)
// with one avatar standing on a platform. A prim without a sit target was put
// at a distance along X, and the viewer sent a plain sit request for it. The
// distance was halved towards the last seated and the first refused request
// until they were 5 cm apart. Each row of the first two lists is one of 113
// requests: the prim, its turn about Z in degrees, where its centre was from
// the avatar's position, and whether the avatar sat on it. Tilted prims
// follow in two lists of their own.
//
// Second Life's rule for this reach is not known. The limit from the avatar
// to the prim's centre ran from about 1.4 m out from under a box 7 m up to
// 10 m for a 4 m box, and no rule fitted to these requests held for new
// prims. rezless refuses a prim more than 8 m from its centre, an
// approximation that gets 70 of the 113 requests right. The other 43 are
// marked failing. Measuring where the avatar sits (sit-spot.test.ts) did not
// give a rule either: no distance from the avatar, or from the point that
// sets the spot, to the spot or the prim's centre parts the seated requests
// from the refused ones.

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'
const AT = { x: 116, y: 48, z: 1997.42 }

type Row = [string, [number, number, number], number, [number, number, number], boolean]

// The requests the 8 m rule gets right.
const MATCHED: Row[] = [
  ['0.5 m box', [0.5, 0.5, 0.5], 0, [8.661, -0.064, 0], false],
  ['0.5 m box', [0.5, 0.5, 0.5], 0, [7.99, -0.05, 0], true],
  ['0.5 m box', [0.5, 0.5, 0.5], 0, [8.827, 0.05, 0], false],
  ['0.5 m box', [0.5, 0.5, 0.5], 0, [8.431, 0, 0.076], false],
  ['2 m box', [2, 2, 2], 0, [9.4, 0, 0], false],
  ['2 m box', [2, 2, 2], 0, [9.455, 0.131, 0], false],
  ['2 m box', [2, 2, 2], 0, [9.095, -0.178, 0], false],
  ['1 m box', [1, 1, 1], 0, [8.946, 0, 0], false],
  ['1 m box', [1, 1, 1], 0, [8.721, 0, 0], false],
  ['1 m box', [1, 1, 1], 0, [8.667, 0.011, 0], false],
  ['4 m box', [4, 4, 4], 0, [10.252, 0.086, 0], false],
  ['4 m box', [4, 4, 4], 0, [10.548, 0.005, 0], false],
  ['4 m box', [4, 4, 4], 0, [10.5, 0.002, -0.001], false],
  ['4 x 0.5 x 0.5 m box', [4, 0.5, 0.5], 0, [10.421, -0.047, 0], false],
  ['4 x 0.5 x 0.5 m box', [4, 0.5, 0.5], 0, [10.208, -0.004, 0], false],
  ['4 x 0.5 x 0.5 m box', [4, 0.5, 0.5], 0, [10.137, 0.062, 0], false],
  ['0.5 x 4 x 0.5 m box', [0.5, 4, 0.5], 0, [8.59, 0.009, 0], false],
  ['0.5 x 4 x 0.5 m box', [0.5, 4, 0.5], 0, [8.599, 0.04, 0], false],
  ['0.5 x 4 x 0.5 m box', [0.5, 4, 0.5], 0, [8.611, 0.107, 0], false],
  ['0.5 x 4 x 0.5 m box', [0.5, 4, 0.5], 0, [7.992, -0.008, 0], true],
  ['4 x 0.5 x 0.5 m box turned 90 degrees', [4, 0.5, 0.5], 90, [8.75, 0.05, 0], false],
  ['4 x 0.5 x 0.5 m box turned 90 degrees', [4, 0.5, 0.5], 90, [7.896, -0.004, 0], true],
  ['4 x 0.5 x 0.5 m box turned 90 degrees', [4, 0.5, 0.5], 90, [8.825, -0.059, 0], false],
  ['4 x 0.5 x 0.5 m box turned 90 degrees', [4, 0.5, 0.5], 90, [8.433, -0.053, 0], false],
  ['0.5 x 0.5 x 4 m box', [0.5, 0.5, 4], 0, [8.689, -0.039, 0], false],
  ['0.5 x 0.5 x 4 m box', [0.5, 0.5, 4], 0, [7.991, 0.035, 0], true],
  ['0.5 x 0.5 x 4 m box', [0.5, 0.5, 4], 0, [8.714, -0.103, 0], false],
  ['0.5 x 0.5 x 4 m box', [0.5, 0.5, 4], 0, [8.077, 0.089, 0], false],
  ['0.5 x 0.5 x 4 m box', [0.5, 0.5, 4], 0, [8.098, 0.014, 0], false],
  ['0.5 m box 2 m up', [0.5, 0.5, 0.5], 0, [8.641, -0.057, 2], false],
  ['0.5 m box 2 m up', [0.5, 0.5, 0.5], 0, [7.988, -0.041, 2], false],
  ['0.5 m box 2 m up', [0.5, 0.5, 0.5], 0, [7.297, 0.026, 2], true],
  ['0.5 m box 2 m up', [0.5, 0.5, 0.5], 0, [7.659, 0.034, 2], true],
  ['0.5 m box 2 m up', [0.5, 0.5, 0.5], 0, [8.472, -0.025, 1.997], false],
  ['0.5 m box 2 m up', [0.5, 0.5, 0.5], 0, [7.165, -0.003, 1.999], true],
  ['0.5 m box 4 m up', [0.5, 0.5, 0.5], 0, [8.23, -0.072, 4], false],
  ['0.5 m box 4 m up', [0.5, 0.5, 0.5], 0, [8.18, 0.167, 4], false],
  ['0.5 m box 4 m up', [0.5, 0.5, 0.5], 0, [7.234, 0.031, 4], false],
  ['0.5 m box 4 m up', [0.5, 0.5, 0.5], 0, [6.204, 0.08, 4], true],
  ['0.5 m box 4 m up', [0.5, 0.5, 0.5], 0, [6.893, -0.068, 4], true],
  ['0.5 m box 4 m up', [0.5, 0.5, 0.5], 0, [7.307, -0.269, 4], false],
  ['0.5 m box 4 m up', [0.5, 0.5, 0.5], 0, [6.993, 0.037, 4], false],
  ['0.5 m box 4 m up', [0.5, 0.5, 0.5], 0, [6.446, -0.008, 4], true],
  ['2 m sphere', [2, 2, 2], 0, [9.047, 0.042, 0], false],
  ['2 m sphere', [2, 2, 2], 0, [9.178, 0.015, 0], false],
  ['2 m sphere', [2, 2, 2], 0, [9.128, -0.096, 0], false],
  ['2 m cylinder', [2, 2, 2], 0, [9.544, -0.402, 0], false],
  ['2 m cylinder', [2, 2, 2], 0, [9.219, 0.221, 0], false],
  ['2 m cylinder', [2, 2, 2], 0, [9.096, 0.329, 0], false],
  ['2 m box turned 45 degrees', [2, 2, 2], 45, [9.796, -0.057, 0], false],
  ['2 m box turned 45 degrees', [2, 2, 2], 45, [9.478, -0.334, 0], false],
  ['0.5 m box 1 m down', [0.5, 0.5, 0.5], 0, [8.697, -0.028, -1], false],
  ['0.5 m box 1 m down', [0.5, 0.5, 0.5], 0, [8.477, -0.063, -1], false],
  ['0.5 m box 1 m down', [0.5, 0.5, 0.5], 0, [8.372, -0.025, -1], false],
  ['0.5 m box 6 m up', [0.5, 0.5, 0.5], 0, [8.66, -0.062, 6], false],
  ['0.5 m box 6 m up', [0.5, 0.5, 0.5], 0, [7.974, -0.052, 6], false],
  ['0.5 m box 6 m up', [0.5, 0.5, 0.5], 0, [7.296, -0.026, 6], false],
  ['0.5 m box 6 m up', [0.5, 0.5, 0.5], 0, [6.536, 0.059, 6], false],
  ['0.5 m box 6 m up', [0.5, 0.5, 0.5], 0, [5.843, 0.057, 6], false],
  ['0.5 m box 6 m up', [0.5, 0.5, 0.5], 0, [4.407, 0.033, 6], true],
  ['0.5 m box 6 m up', [0.5, 0.5, 0.5], 0, [4.749, 0.037, 6], true],
  ['0.5 m box 6 m up', [0.5, 0.5, 0.5], 0, [4.912, -0.043, 6], true],
  ['0.5 m box 6 m up', [0.5, 0.5, 0.5], 0, [5.403, 0.281, 5.97], false],
  ['3 x 3 x 0.5 m box turned 30 degrees', [3, 3, 0.5], 30, [10.25, 0, 0], false],
  ['3 x 3 x 0.5 m box turned 30 degrees', [3, 3, 0.5], 30, [9.887, -0.046, 0], false],
  ['3 x 3 x 0.5 m box turned 30 degrees', [3, 3, 0.5], 30, [9.823, -0.044, 0], false],
  ['1 m box 7 m up', [1, 1, 1], 0, [0.785, 0.023, 7], true],
  ['1 m box 7 m up', [1, 1, 1], 0, [1.383, -0.6, 7], true],
  ['1 m box 7 m up', [1, 1, 1], 0, [1.134, 0.016, 7], true],
  ['1 m box 7 m up', [1, 1, 1], 0, [1.194, -0.561, 6.991], true],
]

// The requests the 8 m rule gets wrong.
const MISSED: Row[] = [
  ['0.5 m box', [0.5, 0.5, 0.5], 0, [8.35, -0.001, 0], true],
  ['0.5 m box', [0.5, 0.5, 0.5], 0, [8.327, 0.018, 0], true],
  ['2 m box', [2, 2, 2], 0, [8.7, 0, 0], true],
  ['2 m box', [2, 2, 2], 0, [8.799, 0.046, 0], true],
  ['2 m box', [2, 2, 2], 0, [8.822, 0.051, 0], true],
  ['1 m box', [1, 1, 1], 0, [8.446, 0.257, 0], true],
  ['1 m box', [1, 1, 1], 0, [8.325, 0.003, 0], true],
  ['1 m box', [1, 1, 1], 0, [8.464, 0.001, 0.078], true],
  ['4 m box', [4, 4, 4], 0, [9.274, 0.034, 0], true],
  ['4 m box', [4, 4, 4], 0, [9.31, -0.066, 0], true],
  ['4 m box', [4, 4, 4], 0, [9.727, 0.022, 0], true],
  ['4 x 0.5 x 0.5 m box', [4, 0.5, 0.5], 0, [9.919, 0.181, 0], true],
  ['4 x 0.5 x 0.5 m box', [4, 0.5, 0.5], 0, [9.812, 0.01, 0], true],
  ['4 x 0.5 x 0.5 m box', [4, 0.5, 0.5], 0, [9.963, 0, 0.075], true],
  ['0.5 x 4 x 0.5 m box', [0.5, 4, 0.5], 0, [8.29, -0.103, 0], true],
  ['0.5 x 4 x 0.5 m box', [0.5, 4, 0.5], 0, [8.081, -0.001, 0.042], true],
  ['4 x 0.5 x 0.5 m box turned 90 degrees', [4, 0.5, 0.5], 90, [8.303, -0.002, 0.003], true],
  ['4 x 0.5 x 0.5 m box turned 90 degrees', [4, 0.5, 0.5], 90, [8.074, 0.037, 0], true],
  ['0.5 x 0.5 x 4 m box', [0.5, 0.5, 4], 0, [8.04, 0.012, 0], true],
  ['0.5 m box 2 m up', [0.5, 0.5, 0.5], 0, [7.807, -0.018, 2], true],
  ['2 m sphere', [2, 2, 2], 0, [8.976, -0.224, 0], true],
  ['2 m sphere', [2, 2, 2], 0, [8.877, 0.06, 0], true],
  ['2 m sphere', [2, 2, 2], 0, [8.963, 0, 0.097], true],
  ['2 m cylinder', [2, 2, 2], 0, [8.666, 0.042, 0], true],
  ['2 m cylinder', [2, 2, 2], 0, [8.826, -0.012, 0], true],
  ['2 m cylinder', [2, 2, 2], 0, [8.96, 0, 0], true],
  ['2 m box turned 45 degrees', [2, 2, 2], 45, [8.44, 0.042, 0], true],
  ['2 m box turned 45 degrees', [2, 2, 2], 45, [8.76, 0, 0.103], true],
  ['2 m box turned 45 degrees', [2, 2, 2], 45, [9.166, -0.02, 0], true],
  ['2 m box turned 45 degrees', [2, 2, 2], 45, [8.658, 0.221, 0], true],
  ['2 m box turned 45 degrees', [2, 2, 2], 45, [9.066, -0.001, 0.091], true],
  ['0.5 m box 1 m down', [0.5, 0.5, 0.5], 0, [7.959, 0.041, -1], true],
  ['0.5 m box 1 m down', [0.5, 0.5, 0.5], 0, [8.284, -0.045, -1], true],
  ['0.5 m box 1 m down', [0.5, 0.5, 0.5], 0, [8.275, 0.01, -1], true],
  ['0.5 m box 6 m up', [0.5, 0.5, 0.5], 0, [5.111, 0.019, 6], false],
  ['0.5 m box 6 m up', [0.5, 0.5, 0.5], 0, [5.262, 0.033, 6], false],
  ['3 x 3 x 0.5 m box turned 30 degrees', [3, 3, 0.5], 30, [9.55, 0, 0], true],
  ['3 x 3 x 0.5 m box turned 30 degrees', [3, 3, 0.5], 30, [9.794, 0.019, 0], true],
  ['3 x 3 x 0.5 m box turned 30 degrees', [3, 3, 0.5], 30, [9.711, 0.027, 0], true],
  ['1 m box 7 m up', [1, 1, 1], 0, [2.886, 0.023, 7], false],
  ['1 m box 7 m up', [1, 1, 1], 0, [2.206, 0.014, 7], false],
  ['1 m box 7 m up', [1, 1, 1], 0, [1.498, -0.008, 7], false],
  ['1 m box 7 m up', [1, 1, 1], 0, [1.819, 0.359, 6.994], false],
]

// Measured the same way on the same grid and day with prims tilted about X
// or Y. Each row gives the prim's rotation as a quaternion. The 8 m rule gets
// 14 of these 21 requests right.
type TiltedRow = [string, [number, number, number], [number, number, number, number], [number, number, number], boolean]

const TILTED_MATCHED: TiltedRow[] = [
  ['2 m box tilted 45 degrees about Y', [2, 2, 2], [0, 0.383, 0, 0.924], [9.8, 0, 0], false],
  ['2 m box tilted 45 degrees about Y', [2, 2, 2], [0, 0.383, 0, 0.924], [9.201, 0, 0], false],
  ['2 m box tilted 45 degrees about Y', [2, 2, 2], [0, 0.383, 0, 0.924], [9.125, 0, 0], false],
  ['2 m box tilted 45 degrees about Y', [2, 2, 2], [0, 0.383, 0, 0.924], [9.088, 0, 0], false],
  ['2 m box tilted 45 degrees about X', [2, 2, 2], [0.383, 0, 0, 0.924], [9.401, -0.003, 0], false],
  ['2 m box tilted 45 degrees about X', [2, 2, 2], [0.383, 0, 0, 0.924], [9.1, 0, 0], false],
  ['2 m box tilted 45 degrees about X', [2, 2, 2], [0.383, 0, 0, 0.924], [9.057, 0, 0], false],
  ['0.5 x 0.5 x 3 m box tilted 60 degrees about Y', [0.5, 0.5, 3], [0, 0.5, 0, 0.866], [9.596, 0, 0], false],
  ['0.5 x 0.5 x 3 m box tilted 60 degrees about Y', [0.5, 0.5, 3], [0, 0.5, 0, 0.866], [9, 0, 0], false],
  ['0.5 x 0.5 x 3 m box tilted 60 degrees about Y', [0.5, 0.5, 3], [0, 0.5, 0, 0.866], [8.398, 0, 0], false],
  ['0.5 x 0.5 x 3 m box tilted 60 degrees about Y', [0.5, 0.5, 3], [0, 0.5, 0, 0.866], [7.8, 0, 0], true],
  ['0.5 x 0.5 x 3 m box tilted 60 degrees about Y', [0.5, 0.5, 3], [0, 0.5, 0, 0.866], [8.25, 0, 0], false],
  ['0.5 x 0.5 x 3 m box tilted 60 degrees about Y', [0.5, 0.5, 3], [0, 0.5, 0, 0.866], [8.171, 0.003, 0], false],
  ['0.5 x 0.5 x 3 m box tilted 60 degrees about Y', [0.5, 0.5, 3], [0, 0.5, 0, 0.866], [8.136, 0.003, 0], false],
]

const TILTED_MISSED: TiltedRow[] = [
  ['2 m box tilted 45 degrees about Y', [2, 2, 2], [0, 0.383, 0, 0.924], [8.603, 0, 0], true],
  ['2 m box tilted 45 degrees about Y', [2, 2, 2], [0, 0.383, 0, 0.924], [8.9, 0, 0], true],
  ['2 m box tilted 45 degrees about Y', [2, 2, 2], [0, 0.383, 0, 0.924], [9.048, 0.003, 0], true],
  ['2 m box tilted 45 degrees about X', [2, 2, 2], [0.383, 0, 0, 0.924], [8.801, 0, 0], true],
  ['2 m box tilted 45 degrees about X', [2, 2, 2], [0.383, 0, 0, 0.924], [8.945, 0, 0], true],
  ['2 m box tilted 45 degrees about X', [2, 2, 2], [0.383, 0, 0, 0.924], [9.025, 0, 0], true],
  ['0.5 x 0.5 x 3 m box tilted 60 degrees about Y', [0.5, 0.5, 3], [0, 0.5, 0, 0.866], [8.098, 0.004, 0], true],
]

async function request([label, size, turn, centre, seated]: Row) {
  const half = (turn * Math.PI) / 360
  return requestTilted([label, size, [0, 0, Math.sin(half), Math.cos(half)], centre, seated])
}

async function requestTilted([, size, [rx, ry, rz, rs], [x, y, z]]: TiltedRow) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: AVATAR, name: 'av', username: 'av', position: { ...AT } })
  const loaded = await loadLinkset({
    world, region: 'home', owner: AVATAR, position: { x: AT.x + x, y: AT.y + y, z: AT.z + z }, prims: [{}],
  })
  const prim = loaded.linkset.prims[0]!
  prim.params.size = { x: size[0], y: size[1], z: size[2] }
  prim.params.rotation = { x: rx, y: ry, z: rz, s: rs }
  return world.userSitAvatar(avatar, prim)
}

describe('how far away a prim without a sit target can be sat on', () => {
  it.each(MATCHED)('%s, %j, turned %i, centre at %j, seated %s', async (...row) => {
    expect(await request(row)).toBe(row[4])
  })

  it.fails.each(MISSED)('%s, %j, turned %i, centre at %j, seated %s', async (...row) => {
    expect(await request(row)).toBe(row[4])
  })

  it.each(TILTED_MATCHED)('%s, %j, rotation %j, centre at %j, seated %s', async (...row) => {
    expect(await requestTilted(row)).toBe(row[4])
  })

  it.fails.each(TILTED_MISSED)('%s, %j, rotation %j, centre at %j, seated %s', async (...row) => {
    expect(await requestTilted(row)).toBe(row[4])
  })
})

describe('@unsit=n and a sit request', () => {
  const source = `list changes; default {
    link_message(integer s, integer n, string m, key id) { llOwnerSay(m); }
    changed(integer c) { changes += [c]; }
  }`

  // In-world (same grid and day): the avatar sat on a box 2 m away, which
  // then said "@unsit=n" to it. A plain sit request for a box 30 m away, and
  // for one 2.5 m away, was refused by the viewer for the restriction and
  // never sent, and the same keys with "@sit:<key>=force" were refused too.
  // The avatar stayed seated: llGetAgentInfo kept AGENT_SITTING and
  // AGENT_ON_OBJECT, OBJECT_ROOT stayed the seat, and the seat got no second
  // changed(CHANGED_LINK). Without the restriction a sit request for the box
  // 30 m away stood the avatar up.
  it.each(['rlv', 'rlva'] as const)('%s keeps a seated avatar seated on a request out of reach', async (profile) => {
    const { world, avatar, script } = (await loadRlvPair({ source }))[profile]
    const box = async (x: number) => (await loadLinkset({ world, region: avatar.region, position: { x, y: 0, z: 0 }, prims: [{}] })).linkset.prims[0]!
    const far = await box(30), near = await box(-2.5)
    const say = (m: string) => script.fire('link_message', { sender_num: 1, num: 0, str: m, id: avatar.key })
    script.start()
    world.sitAvatar(avatar, script.host)
    script.linkset.advanceTime(100)
    say('@unsit=n')
    for (const prim of [far, near]) {
      expect(world.userSitAvatar(avatar, prim)).toBe(false)
      say(`@sit:${prim.key}=force`)
      expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ actionOutcome: 'refused', reason: 'restriction' })
      script.linkset.advanceTime(100)
      expect(avatar.sittingOn).toBe(script.host)
    }
    expect(script.global('changes')).toEqual([32])
    say('@unsit=y')
    expect(world.userSitAvatar(avatar, far)).toBe(false)
    script.linkset.advanceTime(100)
    expect(avatar.sittingOn).toBeNull()
    expect(script.global('changes')).toEqual([32, 32])
  })
})
