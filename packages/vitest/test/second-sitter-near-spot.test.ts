import { describe, expect, it } from 'vitest'
import type { Rotation, Vector } from '@rezless/vm'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlSitTarget: "If the object has no sit
// target, the avatar is seated at a position chosen by the simulator." The
// wiki doesn't say what happens when another avatar already sits there.
// two-sitters.test.ts pins a refusal at the very spot another sitter has, with
// the alert "No room to sit here, try another spot." (CantSitNoRoom).
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm 7.3.0 with RLVa
// 2.4.2, 2026-11-23) with two avatars, A of size <0.45, 0.6, 1.654> and B of
// size <0.45, 0.6, 1.707>, on a lone 1 m box without a sit target, unturned,
// centred at <124, 40, 1997.47>. A's viewer put its camera 4 m along -X from
// the box's centre, level with it (or as each row says), and A asked for the
// spot <-0.5, 0, 0> on the box's -X side. With the box empty that seated A at
// S = <-0.59, 0, 1.13> facing -X, as sit-spot-camera-click.test.ts pins. B sat
// on the box, and a script in the box moved B's link with PRIM_POS_LOCAL and
// PRIM_ROT_LOCAL before each request, then read both links. Each row gives
// B's position and rotation in the box's frame and where A sat, or null where
// the request was refused (each refusal checked showed CantSitNoRoom).
//
// Runs 1 and 2 asked from wherever A stood up after the row before; in run 3 A
// teleported to <121, 40, 1998> before each request. The same row gave
// different seats between runs: B on S facing -X seated A 0.293 m above S in
// run 1, at <-0.606, 0.372, 0.717> in run 2 and 0.043 m above S in run 3. The
// camera's height and the side the line comes from change the result too.
// REPEATED below holds one row asked 52 times in one session: it gave two
// seats 0.25 m apart, with nothing a script can read telling them apart. No
// rule found fits these rows, so rezless keeps seating A at S unless B sits
// within 1 mm of it, and the rows it gets wrong are kept below as it.fails.

type Row = [string, Vector, Rotation, Vector | null]

const A = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa'
const B = 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb'
const BOX = { x: 124, y: 40, z: 1997.47 }
const v = (x: number, y: number, z: number) => ({ x, y, z })
const S = v(-0.59, 0, 1.13)
const OUT = { x: 0, y: 0, z: 1, s: 0 }
const IN = { x: 0, y: 0, z: 0, s: 1 }
const LEFT = { x: 0, y: 0, z: 0.70711, s: 0.70711 }
const RIGHT = { x: 0, y: 0, z: -0.70711, s: 0.70711 }
const LEVEL = v(120, 40, 1997.47)
const HIGH = v(120, 40, 1999.47)
const SIDEWAYS = v(120, 42, 1997.47)

// A sat at S: B was far enough from it, or close but with the camera 2 m higher.
const CLEAR: [string, Vector, Rotation, Vector][] = [
  ['B on the far side', v(0.59, 0, 1.13), OUT, LEVEL],
  ...[0.3, 0.4, 0.5, 0.6].map(y => [`B ${y} m along +Y`, v(-0.59, y, 1.13), OUT, LEVEL] as [string, Vector, Rotation, Vector]),
  ...[0.3, 0.4, 0.5].map(x => [`B ${x} m in towards the box`, v(-0.59 + x, 0, 1.13), OUT, LEVEL] as [string, Vector, Rotation, Vector]),
  ...[0.6, 0.8].map(x => [`B ${x} m out from the box`, v(-0.59 - x, 0, 1.13), OUT, LEVEL] as [string, Vector, Rotation, Vector]),
  ...[0.8, 1.2, 1.7, -1.7].map(z => [`B ${z} m along Z`, v(-0.59, 0, 1.13 + z), OUT, LEVEL] as [string, Vector, Rotation, Vector]),
  ['B 0.3 m out, facing +Y', v(-0.89, 0, 1.13), LEFT, LEVEL],
  ['B 0.1 m out, camera 2 m higher', v(-0.69, 0, 1.13), OUT, HIGH],
  ['B 0.1 m up, camera 2 m higher', v(-0.59, 0, 1.23), OUT, HIGH],
  ['B 0.1 m in, camera 2 m higher', v(-0.49, 0, 1.13), OUT, HIGH],
]

// B on S, refused each time it was tried, as rezless refuses.
const ON_SPOT_REFUSED: [string, Rotation, Vector][] = [
  ['facing +Y (runs 2 and 3, three times)', LEFT, LEVEL],
  ['facing -Y (run 2)', RIGHT, LEVEL],
  ['facing -X, camera 2 m along +Y (run 2)', OUT, SIDEWAYS],
]

// The rows rezless gets wrong: the region refused A or seated it away from S,
// or seated it at S with B on S, where rezless refuses.
const NEAR: Row[] = [
  ['run 1: B on S facing -X (twice)', S, OUT, v(-0.59, 0, 1.42322)],
  ['run 2: B on S facing -X', S, OUT, v(-0.60619, 0.37218, 0.71716)],
  ['run 3: B on S facing -X', S, OUT, v(-0.59, 0, 1.17346)],
  ['run 3: B on S facing -X again', S, OUT, v(-0.59, 0, 1.17285)],
  ['run 2: B on S facing +X (twice)', S, IN, S],
  ['run 3: B on S facing +X', S, IN, v(-0.59, 0, 1.41077)],
  ...[0.05, 0.1, 0.2, 0.3, 0.4, 0.5].map(z => [`run 1: B ${z} m up`, v(-0.59, 0, 1.13 + z), OUT, null] as Row),
  ['run 3: B 0.1 m up', v(-0.59, 0, 1.23), OUT, null],
  ...[0.05, 0.1, 0.15].map(z => [`run 1: B ${z} m down`, v(-0.59, 0, 1.13 - z), OUT, v(-0.59, 0, 1.10498)] as Row),
  ['run 3: B 0.1 m down', v(-0.59, 0, 1.03), OUT, v(-0.59, 0, 1.10498)],
  ['run 1: B 0.25 m down', v(-0.59, 0, 0.88), OUT, null],
  ['run 1: B 0.5 m down', v(-0.59, 0, 0.63), OUT, v(-0.69622, 0, 1.12488)],
  ['run 1: B 0.8 m down', v(-0.59, 0, 0.33), OUT, v(-0.59, 0, 1.10498)],
  ['run 2: B 1.0 m down', v(-0.59, 0, 0.13), OUT, v(-0.59, 0, 1.10498)],
  ['run 2: B 1.2 m down', v(-0.59, 0, -0.07), OUT, null],
  ['run 1: B 0.1 m along +Y', v(-0.59, 0.1, 1.13), OUT, v(-0.59, 0, 1.42322)],
  ['run 1: B 0.2 m along +Y', v(-0.59, 0.2, 1.13), OUT, v(-0.59, 0, 1.33618)],
  ['run 3: B 0.2 m along +Y', v(-0.59, 0.2, 1.13), OUT, v(-0.59, 0, 1.33618)],
  ['run 2: B 0.25 m along +Y', v(-0.59, 0.25, 1.13), OUT, null],
  ...[0.1, 0.2].map(x => [`run 1: B ${x} m in`, v(-0.59 + x, 0, 1.13), OUT, v(-0.59, 0, 1.10498)] as Row),
  ...[0.1, 0.2, 0.3, 0.45].map(x => [`run 1: B ${x} m out`, v(-0.59 - x, 0, 1.13), OUT, null] as Row),
  ['run 3: B 0.1 m out', v(-0.69, 0, 1.13), OUT, null],
  ...[0.2, 0.25, 0.3, 0.4].map(y => [`run 2: B ${y} m along +Y facing +Y`, v(-0.59, y, 1.13), LEFT, null] as Row),
  ['run 2: B 0.3 m in facing +Y', v(-0.29, 0, 1.13), LEFT, null],
  ['run 2: B 0.2 m along +Y facing +X', v(-0.59, 0.2, 1.13), IN, null],
  ['run 2: B 0.1 m in facing +X', v(-0.49, 0, 1.13), IN, v(-0.59, -0.34729, 0.71143)],
  ['run 2: B 0.1 m in facing +X again', v(-0.49, 0, 1.13), IN, v(-0.59, 0.34731, 0.71143)],
  ['run 2: B 0.1 m out facing +X', v(-0.69, 0, 1.13), IN, v(-0.59, -0.31922, 0.70483)],
]

// The same rows with the camera elsewhere: HIGH is 2 m higher, SIDEWAYS 2 m along +Y.
const NEAR_CAMERA: [...Row, Vector][] = [
  ['run 2: B on S, camera 2 m higher (a second try sat at +0.372 in Y)', S, OUT, v(-0.60619, -0.37217, 0.71716), HIGH],
  ['run 2: B 0.2 m along +Y, camera 2 m higher', v(-0.59, 0.2, 1.13), OUT, null, HIGH],
  ['run 2: B 0.1 m down, camera 2 m higher', v(-0.59, 0, 1.03), OUT, null, HIGH],
  ['run 2: B 0.2 m along +Y, camera 2 m along +Y', v(-0.59, 0.2, 1.13), OUT, null, SIDEWAYS],
  ['run 2: B 0.1 m out, camera 2 m along +Y', v(-0.69, 0, 1.13), OUT, null, SIDEWAYS],
  ['run 2: B 0.1 m down, camera 2 m along +Y', v(-0.59, 0, 1.03), OUT, v(-0.59, 0, 1.10498), SIDEWAYS],
]

// One row repeated, measured 2026-11-23 with the same two avatars: B on S
// facing -X, the level camera, and A teleported to <121, 40, 1998> before
// each request (its position read <121, 40, 1997.396> every time). The first
// 20 requests in a row all seated A at 1.42322. Over the next 32, spread
// across about 15 minutes, A sat at 1.42322 three times and between 1.17224
// and 1.17371 the other 29 times. The split held whether or not B was moved
// away and back before each request (from the far side, 0.4 m along +Y,
// 0.5 m up, 0.5 m down or 0.6 m out), after B stood up and sat again, and
// when the request waited 6 s after B was moved. No script-visible state
// separates the two results. Two neighbouring rows repeated in the same
// session: B 0.1 m up was refused 8 times out of 8, and B 0.2 m along +Y
// seated A at 1.33618 twice and between 1.17224 and 1.17371 six times.
const REPEATED: Row[] = [
  ...[1.42322, 1.17224, 1.17285, 1.17322, 1.17371].map(z => [`B on S facing -X, A teleported first: A at ${z}`, S, OUT, v(-0.59, 0, z)] as Row),
  ['B 0.1 m up, A teleported first (8 of 8): refused', v(-0.59, 0, 1.23), OUT, null],
  ...[1.33618, 1.17224, 1.17322, 1.17371].map(z => [`B 0.2 m along +Y, A teleported first: A at ${z}`, v(-0.59, 0.2, 1.13), OUT, v(-0.59, 0, z)] as Row),
]

/** A's sit request with B already at `placed`: where A sits, or null if refused. */
async function request(placed: Vector, rotation: Rotation, camera: Vector) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const first = world.addAvatar({ region: 'home', key: A, name: 'A Resident', username: 'a', position: v(121, 40, 1997.42) })
  const second = world.addAvatar({ region: 'home', key: B, name: 'B Resident', username: 'b', position: v(127, 40, 1997.42) })
  const { linkset } = await loadLinkset({ world, region: 'home', owner: A, position: BOX, prims: [{}] })
  const box = linkset.prims[0]!
  box.params.size = v(1, 1, 1)
  expect(world.sitAvatar(second, box, { position: placed, rotation })).toBe(true)
  world.setAvatarCamera(first, camera)
  const seated = world.userSitAvatar(first, box, v(-0.5, 0, 0))
  linkset.advanceTime(100)
  return { seated, first, place: seated ? first.sitPlacement!.position : null }
}

function expectNear(got: Vector | null, want: Vector | null) {
  if (!want || !got) { expect(got).toEqual(want); return }
  expect(Math.hypot(got.x - want.x, got.y - want.y, got.z - want.z)).toBeLessThan(0.005)
}

describe('a sit request near an avatar already seated on a prim without a sit target', () => {
  it.each(CLEAR)('seats the avatar at its spot with %s', async (_, placed, rotation, camera) => {
    expectNear((await request(placed, rotation, camera)).place, S)
  })

  it.each(ON_SPOT_REFUSED)('refuses it with the other avatar on the spot %s', async (_, rotation, camera) => {
    const { seated, first } = await request(S, rotation, camera)
    expect(seated).toBe(false)
    expect(first.viewer.alerts.map(alert => alert.name)).toEqual(['CantSitNoRoom'])
  })

  it.fails.each(NEAR)('%s', async (_, placed, rotation, want) => {
    expectNear((await request(placed, rotation, LEVEL)).place, want)
  })

  it.fails.each(REPEATED)('%s', async (_, placed, rotation, want) => {
    expectNear((await request(placed, rotation, LEVEL)).place, want)
  })

  it.fails.each(NEAR_CAMERA)('%s', async (_, placed, rotation, want, camera) => {
    expectNear((await request(placed, rotation, camera)).place, want)
  })
})
