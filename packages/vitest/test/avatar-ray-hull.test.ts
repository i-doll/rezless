import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlCastRay
// In-world: SLua Tideland on the Aditi beta grid (2026-11-24), Mono. A prim cast rays past a
// standing avatar with RC_REJECT_TYPES RC_REJECT_LAND | RC_REJECT_PHYSICAL | RC_REJECT_NONPHYSICAL,
// RC_DATA_FLAGS RC_GET_NORMAL and RC_MAX_HITS 1, each from and to an offset from the avatar's
// OBJECT_POS, and reported the hit position less OBJECT_POS and the normal, to three decimals:
// horizontal rays along x, y and the diagonals at heights from -1.2 to 1.2 m in 0.05 m steps, from
// both sides; rays toward the avatar from 24 directions at seven heights; and vertical rays down
// and up at offsets from 0 to 0.4 m. Two avatars, llGetAgentSize <0.45, 0.6, 1.70672> ("tall") and
// <0.45, 0.6, 1.65382> ("short"), stood turned 90 degrees; the tall one again turned 40.85
// degrees. fixtures/avatar-ray-hits.json holds every ray and what it hit, or null for none.
// The hits lie on flat faces, a convex hull of four rings, not on a capsule or a box.

interface Fixture {
  avatars: Record<string, { size: number, rot: [number, number, number, number] }>
  rays: [string, [number, number, number], [number, number, number], [number, number, number, number, number, number] | null][]
}
const FIXTURE: Fixture = JSON.parse(readFileSync(new URL('./fixtures/avatar-ray-hits.json', import.meta.url), 'utf8'))

const AT = { x: 128, y: 128, z: 100 }
const v = ([x, y, z]: readonly number[]) => ({ x: x! + AT.x, y: y! + AT.y, z: z! + AT.z })

function world(name: string) {
  const { size, rot: [x, y, z, s] } = FIXTURE.avatars[name]!
  const w = new World()
  w.addRegion('ray', { x: 0, y: 0 })
  const avatar = w.addAvatar({ region: 'ray', username: 'probe', position: AT, rotation: { x, y, z, s }, size: { x: 0.45, y: 0.6, z: size } })
  return { w, avatar }
}

// The probe cut each number to three decimals, toward zero: take the middle of what it stood for.
const truncated = (n: number) => n === 0 ? 0 : n + Math.sign(n) * 0.0005
const STEPS = [0, -0.0005, 0.0005, -0.001, 0.001]
const SHIFTS = [...STEPS.flatMap(dx => STEPS.map(dy => [dx, dy, 0])), ...STEPS.slice(1).map(dz => [0, 0, dz])]

describe('llCastRay on an avatar', () => {
  for (const name of Object.keys(FIXTURE.avatars)) {
    it(`hits the ${name} avatar where every measured ray did`, () => {
      const { w, avatar } = world(name)
      const rays = FIXTURE.rays.filter(r => r[0] === name)
      expect(rays.length).toBeGreaterThan(100)
      const misses: string[] = []
      for (const [, from, to, hit] of rays) {
        const label = `${JSON.stringify(from)} -> ${JSON.stringify(to)}`
        // In-world a ray along an edge or past a corner hit either side of it, and positions came cut
        // to three decimals, so a ray matches when it or the same ray moved by up to 1 mm hits the
        // same face within 1.5 mm of where it was hit in-world.
        const matches = SHIFTS.some(([dx, dy, dz]) => {
          const shift = (p: readonly number[]) => [p[0]! + dx, p[1]! + dy, p[2]! + dz]
          const hits = w.castRay('ray', v(shift(from)), v(shift(to)), { rejectTypes: 0, detectPhantom: false })
          if (!hit) return hits.length === 0
          if (hits.length !== 1 || hits[0]!.key !== avatar.key) return false
          const { position: p, normal: n } = hits[0]!
          const got = [p.x - AT.x - dx, p.y - AT.y - dy, p.z - AT.z - dz, n.x, n.y, n.z]
          if (!got.slice(3).every((x, i) => Math.abs(x - hit[i + 3]!) < 0.01)) return false
          // Hits on the same face differ along the ray, which barely moves off a face it grazes.
          return Math.abs(got.slice(0, 3).reduce((sum, x, i) => sum + (x - truncated(hit[i]!)) * hit[i + 3]!, 0)) < 0.0015
        })
        if (!matches) misses.push(label)
      }
      expect(misses).toEqual([])
    })
  }

  // In-world, rays at a seated avatar hit a shape that depends on the sitting pose. It isn't
  // modelled, so an avatar sitting on an object or on the ground keeps its size box.
  it('keeps the size box for a seated or ground-sitting avatar', async () => {
    for (const sit of ['object', 'ground'] as const) {
      const { w, avatar } = world('tall')
      if (sit === 'ground') w.sitAvatarOnGround(avatar)
      else {
        const seat = await loadLinkset({ world: w, region: 'ray', position: AT, prims: [{ name: 'seat' }] })
        expect(w.sitAvatar(avatar, seat.prims[0]!, { position: { x: 0, y: 0, z: 1 } })).toBe(true)
      }
      const at = avatar.position
      const hits = w.castRay('ray', { x: at.x - 1.5, y: at.y, z: at.z + 0.84 }, { x: at.x + 1.5, y: at.y, z: at.z + 0.84 }, { rejectTypes: 6, detectPhantom: false })
      expect(hits.map(h => h.position.x - at.x), sit).toEqual([expect.closeTo(-0.3, 4)])
    }
  })

  // In-world: the tall avatar, turned 90 degrees. Along x at its centre's height the ray hit
  // <-0.250, 0, 0> (an edge); along y it hit <0, -0.204, 0> with normal <0, -0.999, -0.039>;
  // straight down it hit the top at 0.903 with normal <0, 0, 1>, and straight up the bottom at
  // -0.903. At 0.95 above the centre a horizontal ray missed.
  it('reports the hit and the face normal to a script', async () => {
    const { w, avatar } = world('tall')
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
