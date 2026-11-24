import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlCastRay
// In-world: SLua Tideland on the Aditi beta grid (2026-11-24), Mono. A prim cast rays past an
// avatar with RC_REJECT_TYPES RC_REJECT_LAND | RC_REJECT_PHYSICAL | RC_REJECT_NONPHYSICAL,
// RC_DATA_FLAGS RC_GET_NORMAL and RC_MAX_HITS 1, each from and to an offset from the avatar's
// OBJECT_POS, and reported the hit position less OBJECT_POS and the normal: horizontal rays
// through the avatar's axis along eight or more directions at heights 0.05 m apart, rays toward
// the avatar from 24 directions, and vertical rays down and up at offsets up to 0.5 m.
// fixtures/avatar-ray-hits.json holds every ray and what it hit, or null for none, with the
// avatar's llGetAgentSize height, OBJECT_ROT, pose and how many decimals the probe printed.
// - Standing: two avatars, 1.70672 ("tall", also turned 40.85 degrees) and 1.65382 m ("short"),
//   to three decimals; then one avatar wearing shapes that made it 1.13977, 1.55859, 1.70672
//   and 2.20989 m, to four decimals.
// - Seated on a box with a sit target of <0, 0, 0.6> and no rotation, and again with
//   <0.3, 0.2, 0.8> turned 90 degrees ("turned"), at each of those four heights except the
//   turned sit; with the sit animation replaced by "stand" the rays hit the same places.
// - Sitting on the ground at 1.13977, 1.55859, 1.70672 (twice, turned differently) and
//   2.20989 m. Rays straight down through the avatar to 1.5 m below it, and horizontal rays
//   5 mm apart, found its top flat at the avatar's position.
// The hits lie on flat faces of a convex hull for each pose, not on a capsule or a box. Two
// rays straight up along an edge of the seated hull reported the mean of the two faces'
// normals; they are left out, as the standing rays along an edge reported one face's normal.

type Pose = 'standing' | 'seated' | 'ground'
interface Fixture {
  avatars: Record<string, { size: number, rot: [number, number, number, number], pose: Pose, decimals: number }>
  rays: [string, [number, number, number], [number, number, number], [number, number, number, number, number, number] | null][]
}
const FIXTURE: Fixture = JSON.parse(readFileSync(new URL('./fixtures/avatar-ray-hits.json', import.meta.url), 'utf8'))

const AT = { x: 128, y: 128, z: 100 }

interface Quaternion { x: number, y: number, z: number, s: number }
const multiply = (a: Quaternion, b: Quaternion): Quaternion => ({
  x: a.s * b.x + a.x * b.s + a.y * b.z - a.z * b.y,
  y: a.s * b.y - a.x * b.z + a.y * b.s + a.z * b.x,
  z: a.s * b.z + a.x * b.y - a.y * b.x + a.z * b.s,
  s: a.s * b.s - a.x * b.x - a.y * b.y - a.z * b.z,
})
const turn = (q: Quaternion, [x, y, z]: readonly number[]) => {
  const p = multiply(multiply(q, { x: x!, y: y!, z: z!, s: 0 }), { x: -q.x, y: -q.y, z: -q.z, s: q.s })
  return [p.x, p.y, p.z]
}

async function world(name: string) {
  const { size, rot: [x, y, z, s], pose } = FIXTURE.avatars[name]!
  const w = new World()
  w.addRegion('ray', { x: 0, y: 0 })
  const avatar = w.addAvatar({ region: 'ray', username: 'probe', position: AT, rotation: { x, y, z, s }, size: { x: 0.45, y: 0.6, z: size } })
  if (pose === 'ground') w.sitAvatarOnGround(avatar)
  if (pose === 'seated') {
    const seat = await loadLinkset({ world: w, region: 'ray', position: { x: 120, y: 120, z: 100 }, prims: [{ name: 'seat' }] })
    expect(w.sitAvatar(avatar, seat.prims[0]!, { position: { x: 0, y: 0, z: 1 } })).toBe(true)
  }
  // Rays were cast in the region's frame around the avatar as it stood in-world; turn them with it.
  const r = avatar.rotation
  const from = multiply(r, { x: -x, y: -y, z: -z, s })
  const at = avatar.position
  const place = (p: readonly number[]) => {
    const [px, py, pz] = turn(from, p)
    return { x: px! + at.x, y: py! + at.y, z: pz! + at.z }
  }
  const back = (p: { x: number, y: number, z: number }, origin = at) =>
    turn({ x: -from.x, y: -from.y, z: -from.z, s: from.s }, [p.x - origin.x, p.y - origin.y, p.z - origin.z])
  return { w, avatar, place, back }
}

const STEPS = [0, -0.0005, 0.0005, -0.001, 0.001]
const SHIFTS = [...STEPS.flatMap(dx => STEPS.map(dy => [dx, dy, 0])), ...STEPS.slice(1).map(dz => [0, 0, dz])]

describe('llCastRay on an avatar', () => {
  for (const name of Object.keys(FIXTURE.avatars)) {
    it(`hits the ${name} avatar where every measured ray did`, async () => {
      const { w, avatar, place, back } = await world(name)
      // The probe cut each number toward zero: take the middle of what it stood for.
      const half = 0.5 / 10 ** FIXTURE.avatars[name]!.decimals
      const truncated = (n: number) => n === 0 ? 0 : n + Math.sign(n) * half
      const rays = FIXTURE.rays.filter(r => r[0] === name)
      expect(rays.length).toBeGreaterThan(80)
      const misses: string[] = []
      for (const [, from, to, hit] of rays) {
        const label = `${JSON.stringify(from)} -> ${JSON.stringify(to)}`
        // In-world a ray along an edge or past a corner hit either side of it, and positions came cut
        // short, so a ray matches when it or the same ray moved by up to 1 mm hits the same face
        // within 1.5 mm of where it was hit in-world.
        const matches = SHIFTS.some(([dx, dy, dz]) => {
          const shift = (p: readonly number[]) => [p[0]! + dx!, p[1]! + dy!, p[2]! + dz!]
          const hits = w.castRay('ray', place(shift(from)), place(shift(to)), { rejectTypes: 6, detectPhantom: false })
          if (!hit) return hits.length === 0
          if (hits.length !== 1 || hits[0]!.key !== avatar.key) return false
          const p = back(hits[0]!.position)
          const n = back(hits[0]!.normal, { x: 0, y: 0, z: 0 })
          const got = [p[0]! - dx!, p[1]! - dy!, p[2]! - dz!, ...n]
          if (!got.slice(3).every((x, i) => Math.abs(x - hit[i + 3]!) < 0.01)) return false
          // Hits on the same face differ along the ray, which barely moves off a face it grazes.
          return Math.abs(got.slice(0, 3).reduce((sum, x, i) => sum + (x - truncated(hit[i]!)) * hit[i + 3]!, 0)) < 0.0015
        })
        if (!matches) misses.push(label)
      }
      expect(misses).toEqual([])
    })
  }

  // In-world: the tall avatar, turned 90 degrees. Along x at its centre's height the ray hit
  // <-0.250, 0, 0> (an edge); along y it hit <0, -0.204, 0> with normal <0, -0.999, -0.039>;
  // straight down it hit the top at 0.903 with normal <0, 0, 1>, and straight up the bottom at
  // -0.903. At 0.95 above the centre a horizontal ray missed.
  it('reports the hit and the face normal to a script', async () => {
    const { w, avatar } = await world('tall')
    const { scripts } = await loadLinkset({
      world: w, region: 'ray', position: { x: 130, y: 130, z: 100 },
      prims: [{ name: 'caster', scripts: [{ name: 'cast', source: { source: `
        list out;
        cast(vector a, vector b) {
          vector o = llList2Vector(llGetObjectDetails(llGetOwner(), [OBJECT_POS]), 0);
          list r = llCastRay(o + a, o + b, [RC_DATA_FLAGS, RC_GET_NORMAL]);
          if (llList2Integer(r, -1) == 1) out += [llList2Vector(r, 1) - o, llList2Vector(r, 2)];
          else out += [llList2Integer(r, -1)];
        }
        default { state_entry() {
          cast(<-1.5, 0, 0>, <1.5, 0, 0>);
          cast(<0, -1.5, 0>, <0, 1.5, 0>);
          cast(<0, 0, 2>, <0, 0, 0>);
          cast(<0, 0, -1.3>, <0, 0, 0>);
          cast(<-1.5, 0, 0.95>, <1.5, 0, 0.95>);
        } }` } }] }],
      owner: avatar.key,
    })
    const s = scripts.cast!
    s.start()
    const out = s.global('out') as ({ x: number, y: number, z: number } | number)[]
    const near = (p: unknown, x: number, y: number, z: number) => {
      const q = p as { x: number, y: number, z: number }
      expect(q.x).toBeCloseTo(x, 2)
      expect(q.y).toBeCloseTo(y, 2)
      expect(q.z).toBeCloseTo(z, 2)
    }
    near(out[0], -0.25, 0, 0)
    near(out[2], 0, -0.2041, 0)
    near(out[3], 0, -0.9992, -0.0399)
    near(out[4], 0, 0, 0.903)
    near(out[5], 0, 0, 1)
    near(out[6], 0, 0, -0.903)
    near(out[7], 0, 0, -1)
    expect(out[8]).toBe(0)
  })
})
