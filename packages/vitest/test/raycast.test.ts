import { expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// In-world: batch.py, Aditi / SLua Tideland, Mono, 2026-11-01.
// Evidence: /tmp/issue-154-ray/results.jsonl.
// https://wiki.secondlife.com/wiki/LlCastRay
it('casts against a placed prim and returns its entry face before the hit count', async () => {
  const world = new World()
  world.addRegion('ray', { x: 0, y: 0 })
  const target = await loadLinkset({ world, region: 'ray', position: { x: 5, y: 0, z: 100 }, prims: [{}] })
  const caster = await loadLinkset({ world, region: 'ray', prims: [{ scripts: [{ name: 'ray', source: { source: `list result; default { state_entry() { result=llCastRay(<0,0,100>,<10,0,100>,[]); } }` } }] }] })
  caster.scripts['ray']!.start()
  expect(caster.scripts['ray']!.global('result')).toEqual([target.prims[0]!.key, { x: 4.75, y: 0, z: 100 }, 1])
})

async function ray(start: string, end: string, options = '[]') {
  const world = new World()
  world.addRegion('ray', { x: 0, y: 0 }, { ground: 22 })
  const loaded = await loadLinkset({ world, region: 'ray', position: { x: 100, y: 100, z: 100 }, prims: [{ scripts: [{ name: 'ray', source: { source: `list result; default {state_entry(){result=llCastRay(${start},${end},${options});}}` } }] }] })
  const script = loaded.scripts['ray']!
  return { world, ...loaded, script, cast: () => { script.start(); return script.global('result') } }
}

it('orders entry intersections by distance and applies the hit cap', async () => {
  const { world, cast } = await ray('<10,10,100>', '<30,10,100>', '[RC_MAX_HITS,2]')
  const far = await loadLinkset({ world, region: 'ray', position: { x: 25, y: 10, z: 100 }, prims: [{}] })
  const near = await loadLinkset({ world, region: 'ray', position: { x: 15, y: 10, z: 100 }, prims: [{}] })
  expect(cast()).toEqual([near.prims[0]!.key, { x: 14.75, y: 10, z: 100 }, far.prims[0]!.key, { x: 24.75, y: 10, z: 100 }, 2])
})

it('omits a containing prim, but can hit the caster from outside', async () => {
  const inside = await ray('<100,100,100>', '<102,100,100>')
  expect(inside.cast()).toEqual([0])
  const outside = await ray('<99,100,100>', '<101,100,100>', '[RC_DATA_FLAGS,7]')
  expect(outside.cast()).toEqual([outside.prims[0]!.key, 0, { x: 99.75, y: 100, z: 100 }, { x: -1, y: 0, z: 0 }, 1])
})

it('returns a terrain intersection with a null key and omits rejected terrain', async () => {
  const hit = await ray('<150,70,100>', '<150,70,0>', '[RC_DATA_FLAGS,7]')
  expect(hit.cast()).toEqual(['00000000-0000-0000-0000-000000000000', 0, { x: 150, y: 70, z: 22 }, { x: 0, y: 0, z: 1 }, 1])
  const rejected = await ray('<150,70,100>', '<150,70,0>', '[RC_REJECT_TYPES,RC_REJECT_LAND]')
  expect(rejected.cast()).toEqual([0])
})

it('rejects nonphysical prims without rejecting physical prims', async () => {
  const { world, cast } = await ray('<10,10,100>', '<30,10,100>', '[RC_REJECT_TYPES,RC_REJECT_NONPHYSICAL,RC_MAX_HITS,4]')
  await loadLinkset({ world, region: 'ray', position: { x: 15, y: 10, z: 100 }, prims: [{}] })
  const physical = await loadLinkset({ world, region: 'ray', position: { x: 20, y: 10, z: 100 }, prims: [{}] })
  physical.prims[0]!.statusFlags = 1
  expect(cast()).toEqual([physical.prims[0]!.key, { x: 19.75, y: 10, z: 100 }, 1])
})

// In-world: batch.py -> [] for each invalid option, [0] for a zero-length ray.
// Aditi, SLua Tideland, Mono, 2026-11-01. Evidence: /tmp/issue-154-ray/results.jsonl.
it.each(['[RC_MAX_HITS,0]', '[RC_MAX_HITS,-1]', '[RC_MAX_HITS,257]', '[RC_MAX_HITS]', '[999,1]',
  '[RC_MAX_HITS,2.0]', '[RC_MAX_HITS,"2"]', '[3.0,2]', '[RC_REJECT_TYPES,15]', '[RC_DATA_FLAGS,8]'])('returns an empty list for invalid options %s', async options => {
  const { cast } = await ray('<10,10,100>', '<30,10,100>', options)
  expect(cast()).toEqual([])
})

it('returns zero hits for a zero-length ray', async () => {
  const { cast } = await ray('<10,10,100>', '<10,10,100>')
  expect(cast()).toEqual([0])
})

it('uses the last value for a repeated option', async () => {
  const { world, cast } = await ray('<10,10,100>', '<30,10,100>', '[RC_MAX_HITS,2,RC_MAX_HITS,1]')
  const near = await loadLinkset({ world, region: 'ray', position: { x: 15, y: 10, z: 100 }, prims: [{}] })
  await loadLinkset({ world, region: 'ray', position: { x: 20, y: 10, z: 100 }, prims: [{}] })
  expect(cast()).toEqual([near.prims[0]!.key, { x: 14.75, y: 10, z: 100 }, 1])
})

it('casts against World object fixtures with their supplied box dimensions', async () => {
  const { world, cast } = await ray('<10,10,100>', '<30,10,100>')
  const object = world.addObject({ region: 'ray', position: { x: 20, y: 10, z: 100 }, size: { x: 4, y: 2, z: 2 } })
  expect(cast()).toEqual([object.key, { x: 18, y: 10, z: 100 }, 1])
})

it('does not hit fixtures in a different region or prims in a dead linkset', async () => {
  const { world, cast } = await ray('<10,10,100>', '<30,10,100>')
  world.addRegion('other', { x: 256, y: 0 })
  world.addObject({ region: 'other', position: { x: 20, y: 10, z: 100 } })
  const dead = await loadLinkset({ world, region: 'ray', position: { x: 15, y: 10, z: 100 }, prims: [{}] })
  dead.linkset.dead = true
  expect(cast()).toEqual([0])
})

// In-world: follow.py -> phantom detection bypasses object rejection, but reject mask 15 is invalid.
// geometry.py/root.py -> child=2, linked root=0; shape NONE excluded.
// rotated.py -> entry face included, exit face and endpoint excluded, rotated normal <-.707107,.707107,0>.
// Aditi, SLua Tideland, Mono, 2026-11-01, /tmp/issue-154-ray/.
it.each([['[]', false], ['[RC_DETECT_PHANTOM,TRUE]', true], ['[RC_DETECT_PHANTOM,-1,RC_REJECT_TYPES,6]', true], ['[RC_DETECT_PHANTOM,1,RC_REJECT_TYPES,15]', false]] as const)('handles phantom boxes with %s', async (options, hit) => {
  const { world, cast } = await ray('<10,10,100>', '<30,10,100>', options)
  const target = world.addObject({ region: 'ray', position: { x: 20, y: 10, z: 100 }, phantom: true })
  expect(cast()).toEqual(hit ? [target.key, { x: 19.75, y: 10, z: 100 }, 1] : options.includes('15') ? [] : [0])
})

it.each(['[RC_REJECT_TYPES,16]', '[RC_REJECT_TYPES,-1]', '[RC_DETECT_PHANTOM,1.0]', '[RC_DATA_FLAGS,-1]', '[RC_MAX_HITS,2,RC_DATA_FLAGS]'])('rejects measured invalid options %s', async options => {
  const { cast } = await ray('<10,10,100>', '<30,10,100>', options)
  expect(cast()).toEqual([])
})

it('detects an avatar fixture and can reject agents', async () => {
  const { world, cast } = await ray('<10,10,100>', '<30,10,100>', '[RC_DATA_FLAGS,7]')
  const avatar = world.addAvatar({ region: 'ray', username: 'test', position: { x: 20, y: 10, z: 100 }, size: { x: 1, y: 1, z: 2 } })
  expect(cast()).toEqual([avatar.key, 0, { x: 19.5, y: 10, z: 100 }, { x: -1, y: 0, z: 0 }, 1])
  const other = await ray('<10,10,100>', '<30,10,100>', '[RC_REJECT_TYPES,1]')
  other.world.addAvatar({ region: 'ray', username: 'test', position: { x: 20, y: 10, z: 100 } })
  expect(other.cast()).toEqual([0])
})

it('uses zero for a linked root and the child link number even when returning the root key', async () => {
  for (const [start, end, options, root, link, x] of [
    ['<12,10,100>', '<18,10,100>', '[RC_DATA_FLAGS,7]', true, 0, 14.75],
    ['<18,10,100>', '<22,10,100>', '[RC_DATA_FLAGS,5]', false, 2, 19.75],
    ['<18,10,100>', '<22,10,100>', '[RC_DATA_FLAGS,7]', true, 2, 19.75],
  ] as const) {
    const { world, cast } = await ray(start, end, options)
    const target = await loadLinkset({ world, region: 'ray', position: { x: 15, y: 10, z: 100 }, prims: [{}, {}] })
    target.prims[1]!.params.position = { x: 5, y: 0, z: 0 }
    expect(cast()).toEqual([target.prims[root ? 0 : 1]!.key, link, { x, y: 10, z: 100 }, { x: -1, y: 0, z: 0 }, 1])
  }
})

it('excludes prims whose physics shape is NONE and linksets from other regions', async () => {
  const { world, cast } = await ray('<10,10,100>', '<30,10,100>')
  const target = await loadLinkset({ world, region: 'ray', position: { x: 15, y: 10, z: 100 }, prims: [{}] })
  target.prims[0]!.params.physicsShapeType = 1
  world.addRegion('other', { x: 256, y: 0 })
  await loadLinkset({ world, region: 'other', position: { x: 15, y: 10, z: 100 }, prims: [{}] })
  expect(cast()).toEqual([0])
})

it.each([
  ['<19.75,10,100>', '<22,10,100>', true],
  ['<20.25,10,100>', '<22,10,100>', false],
  ['<18,10,100>', '<19.75,10,100>', false],
  ['<18,10,100>', '<19,10,100>', false],
  ['<20,8,100>', '<20,12,100>', true],
  ['<20,10,102>', '<20,10,100>', true],
  ['<20,10,98>', '<20,10,100>', true],
  ['<20,12,100>', '<20,8,100>', true],
  ['<18,11,100>', '<22,11,100>', false],
] as const)('uses the measured segment boundaries for %s -> %s', async (start, end, hit) => {
  const { world, cast } = await ray(start, end)
  world.addObject({ region: 'ray', position: { x: 20, y: 10, z: 100 } })
  const result = cast() as unknown[]
  expect(result.at(-1)).toBe(hit ? 1 : 0)
})

it('intersects an oriented box and returns the rotated surface normal', async () => {
  const { world, cast } = await ray('<115,60,2005>', '<125,60,2005>', '[RC_DATA_FLAGS,1]')
  world.addObject({ region: 'ray', position: { x: 120, y: 60, z: 2005 }, size: { x: 4, y: 2, z: 2 }, rotation: { x: 0, y: 0, z: Math.sin(Math.PI / 8), s: Math.cos(Math.PI / 8) } })
  const result = cast() as [string, { x: number }, { x: number; y: number }, number]
  expect(result[1].x).toBeCloseTo(118.585785, 4)
  expect(result[2].x).toBeCloseTo(-0.707107, 5)
  expect(result[2].y).toBeCloseTo(0.707107, 5)
  expect(result[3]).toBe(1)
})

it('caps the nearest results at the configured 256-hit maximum', async () => {
  const { world, cast } = await ray('<0,10,100>', '<256,10,100>', '[RC_MAX_HITS,256]')
  for (let x = 0.5; x < 256; x += 0.5) world.addObject({ region: 'ray', position: { x, y: 10, z: 100 }, size: { x: 0.1, y: 0.1, z: 0.1 } })
  const result = cast() as unknown[]
  expect(result).toHaveLength(513)
  expect(result.at(-1)).toBe(256)
  expect((result.at(-2) as { x: number }).x).toBeCloseTo(127.95, 4)
})

// In-world: geometry.py -> land hit from either side, with an upward normal.
// Terrain index 967 repeated at <150,70>; 961 at <151,70>. Fixture indices are supplied explicitly.
it('returns configured terrain indices and upward normals from both sides', async () => {
  const sample = await ray('<150,70,0>', '<150,70,100>', '[RC_DATA_FLAGS,7]')
  sample.world.addRegion('ray', { x: 0, y: 0 }, { ground: 22, groundLinkNumber: (x) => x === 150 ? 967 : 961 })
  expect(sample.cast()).toEqual(['00000000-0000-0000-0000-000000000000', 967, { x: 150, y: 70, z: 22 }, { x: 0, y: 0, z: 1 }, 1])
})

it('intersects the region fixture height grid and deduplicates cell-boundary hits', async () => {
  const sample = await ray('<0,10,1>', '<2,10,1>', '[RC_DATA_FLAGS,1,RC_MAX_HITS,4]')
  sample.world.addRegion('ray', { x: 0, y: 0 }, { ground: x => x })
  const result = sample.cast() as [string, { x: number }, { x: number; z: number }, number]
  expect(result[1].x).toBe(1)
  expect(result[2].x).toBeCloseTo(-Math.SQRT1_2)
  expect(result[2].z).toBeCloseTo(Math.SQRT1_2)
  expect(result[3]).toBe(1)
})

it('finds both crossings of a bilinear terrain fixture', async () => {
  const sample = await ray('<0,1,0.1875>', '<1,0,0.1875>', '[RC_MAX_HITS,4]')
  sample.world.addRegion('ray', { x: 0, y: 0 }, { ground: (x, y) => x * y, groundLinkNumber: 7 })
  expect(sample.cast()).toEqual(['00000000-0000-0000-0000-000000000000', { x: 0.25, y: 0.75, z: 0.1875 }, '00000000-0000-0000-0000-000000000000', { x: 0.75, y: 0.25, z: 0.1875 }, 2])
})

it.each([
  ['<0,0,-1>', '<1,1,-1>'],
  ['<0,0,5>', '<1,1,5>'],
  ['<300,300,100>', '<300,300,0>'],
  ['<1,1,1>', '<2,1,2>'],
] as const)('omits terrain when the segment %s -> %s never crosses the fixture surface', async (start, end) => {
  const sample = await ray(start, end)
  sample.world.addRegion('ray', { x: 0, y: 0 }, { ground: (x, y) => x * y })
  expect(sample.cast()).toEqual([0])
})

it('supports standalone own-prim and default-terrain queries without a World', async () => {
  const { loadScript } = await import('../src/index.js')
  const script = await loadScript({ source: `list own;list land;default{state_entry(){own=llCastRay(<99,100,100>,<101,100,100>,[]);land=llCastRay(<20,20,30>,<20,20,10>,[]);}}` })
  script.host.params.position = { x: 100, y: 100, z: 100 }
  script.start()
  expect(script.global('own')).toEqual([script.host.key, { x: 99.75, y: 100, z: 100 }, 1])
  expect(script.global('land')).toEqual(['00000000-0000-0000-0000-000000000000', { x: 20, y: 20, z: 22 }, 1])
})

// In-world: replacement.py -> each invalid-before-valid duplicate returns [], lengths 0,0,0.
// Terrain profile in the same probe returned five land hits in each direction across a ridge.
// Aditi, SLua Tideland, Mono, 2026-11-01, /tmp/issue-154-ray/.
it.each(['[RC_MAX_HITS,0,RC_MAX_HITS,1]', '[RC_DATA_FLAGS,8,RC_DATA_FLAGS,0]', '[RC_REJECT_TYPES,15,RC_REJECT_TYPES,0]'])('rejects invalid options before a later duplicate can overwrite them: %s', async options => {
  const { world, cast } = await ray('<10,10,100>', '<30,10,100>', options)
  world.addObject({ region: 'ray', position: { x: 20, y: 10, z: 100 } })
  expect(cast()).toEqual([])
})
