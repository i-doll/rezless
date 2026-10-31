import { describe, it, expect } from 'vitest'
import { loadLinkset, loadScript, World, type RegionSettings, type Vector } from '../src/index.js'

// Wiki: https://wiki.secondlife.com/wiki/LlGround, LlGroundNormal, LlGroundSlope,
// LlGroundContour, LlWater and LlWind. Each reads the region at the prim's
// position plus the offset; only the offset's x and y count.

const HELPERS = `
  vector at(float x, float y) { vector p = llGetPos(); return <x - p.x, y - p.y, 0.0>; }
`

async function read(expr: string, settings: RegionSettings = {}, position: Vector = { x: 126, y: 130, z: 895 }) {
  const world = new World()
  world.addRegion('Sandbox', { x: 256000, y: 256000 }, settings)
  const source = `${HELPERS} list got; default { state_entry() { got = [${expr}]; } }`
  const { scripts } = await loadLinkset({
    world,
    region: 'Sandbox',
    position,
    prims: [{ name: 'probe', scripts: [{ source: { source }, name: 'probe' }] }],
  })
  scripts.probe!.start()
  return scripts.probe!.global('got') as unknown[]
}

function expectVector(got: unknown, x: number, y: number, z: number) {
  const v = got as Vector
  expect(v.x).toBeCloseTo(x, 5)
  expect(v.y).toBeCloseTo(y, 5)
  expect(v.z).toBeCloseTo(z, 5)
}

// Grid heights in SLua Tombolo, read with llGround at whole metres (Aditi,
// 2026-10-31): around (8, 8), at the south-west edge and at the north-east
// corner. The other points used here read 25.5211.
const TOMBOLO: Record<string, number> = {
  '8,8': 25.5211,
  '9,8': 25.5211,
  '8,9': 26.0459,
  '9,9': 25.6035,
  '7,8': 26.1411,
  '8,7': 25.5211,
  '10,8': 25.5211,
  '8,10': 25.5211,
  '10,9': 25.5211,
  '9,10': 26.0421,
  '-1,8': 25.62,
  '8,-1': 25.52,
  '255,255': 22,
  '256,255': 25.52,
  '255,256': 22,
  '256,256': 23.76,
}
const tombolo = (x: number, y: number) => TOMBOLO[`${x},${y}`] ?? 25.5211

describe('ground height', () => {
  // In-world: llGround(ZERO_VECTOR) read 22.0 at most points of SLua Tombolo and
  // SLua Tideland; neither region's terrain is flat everywhere.
  it('defaults to flat ground at 22 m', async () => {
    const got = await read('llGround(ZERO_VECTOR), llGround(<100, -100, 0>)')
    expect(got).toEqual([22, 22])
  })

  it('reads a flat height set on the region', async () => {
    expect(await read('llGround(ZERO_VECTOR)', { ground: 31.5 })).toEqual([31.5])
  })

  // In-world: in SLua Tombolo llGround at (8.25, 8.25), (8.75, 8.25),
  // (8.25, 8.75), (8.75, 8.75), (8.5, 8.5), (8.5, 8) and (8, 8.5) read 25.62465,
  // 25.56935, 25.83175, 25.66585, 25.6729, 25.5211 and 25.7835: bilinear between
  // the four whole-metre heights around each point.
  it('interpolates bilinearly between whole-metre grid heights', async () => {
    const got = await read(
      'llGround(at(8.25, 8.25)), llGround(at(8.75, 8.25)), llGround(at(8.25, 8.75)), llGround(at(8.75, 8.75)), ' +
        'llGround(at(8.5, 8.5)), llGround(at(8.5, 8)), llGround(at(8, 8.5))',
      { ground: tombolo },
    )
    const want = [25.62465, 25.56935, 25.83175, 25.66585, 25.6729, 25.5211, 25.7835]
    got.forEach((h, i) => expect(h).toBeCloseTo(want[i]!, 4))
  })

  // In-world: llGround(<0, 0, 50>), llGround(<0, 0, -5000>) and llGround(ZERO_VECTOR)
  // all read 22.0624 under the SLua Tideland platform.
  it('ignores the offset z', async () => {
    const got = await read('llGround(<0, 0, 50>), llGround(<0, 0, -5000>)', { ground: (x, y) => x + y / 10 })
    expect(got).toEqual([Math.fround(126 + 13), Math.fround(126 + 13)])
  })

  // In-world: with the prim turned 90 degrees about z, llGround and
  // llGroundNormal at the same offset read the same as before (SLua Tombolo).
  it('takes the offset in region axes, whatever the prim rotation', async () => {
    const world = new World()
    world.addRegion('Sandbox', { x: 256000, y: 256000 }, { ground: (x) => x })
    const source = 'float h; default { state_entry() { llSetRot(llEuler2Rot(<0, 0, PI_BY_TWO>)); h = llGround(<10, 0, 0>); } }'
    const { scripts } = await loadLinkset({
      world,
      region: 'Sandbox',
      position: { x: 100, y: 100, z: 50 },
      prims: [{ name: 'probe', scripts: [{ source: { source }, name: 'probe' }] }],
    })
    scripts.probe!.start()
    scripts.probe!.advanceTime(1_000)
    expect(scripts.probe!.global('h')).toBe(110)
  })

  it('reads the ground under a prim outside any world', async () => {
    const s = await loadScript({ source: 'float h; default { state_entry() { h = llGround(ZERO_VECTOR); } }' })
    s.start()
    expect(s.global('h')).toBe(22)
  })
})

describe('ground normal, slope and contour', () => {
  // In-world: llGroundNormal, llGroundSlope and llGroundContour on flat ground
  // read <0, 0, 1>, <0, 0, 0> and <0, 0, 0> (SLua Tideland).
  it('are straight up and zero on flat ground', async () => {
    const [n, s, c] = await read('llGroundNormal(ZERO_VECTOR), llGroundSlope(ZERO_VECTOR), llGroundContour(ZERO_VECTOR)')
    expect([n, s, c]).toEqual([
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
    ])
  })

  // In-world, SLua Tombolo: llGroundNormal at (8.25, 8.25) and (8, 8) read
  // <0, -0.524801, 1>; at (8.75, 8.75) and (8.5, 8.5) <0.4424, -0.082401, 1>; at
  // (8.75, 8.25) <0, -0.082401, 1>. The normal is not unit length. Its x is the
  // height drop across the cell along the nearest grid row, and its y the drop
  // along the nearest grid column.
  // A follow-up at points that tell this apart from a triangle's normal read
  // <0.620001, -0.524801, 1> at (7.75, 8.25), <0, 0, 1> at (8.25, 7.75),
  // <0.4424, -0.524801, 1> at (8.4, 8.6) and <0, -0.082401, 1> at (8.6, 8.4).
  it('take the normal from the height steps along the nearest grid row and column', async () => {
    const got = await read(
      'llGroundNormal(at(8.25, 8.25)), llGroundNormal(at(8, 8)), llGroundNormal(at(8.75, 8.75)), ' +
        'llGroundNormal(at(8.5, 8.5)), llGroundNormal(at(8.75, 8.25)), llGroundNormal(at(7.75, 8.25)), ' +
        'llGroundNormal(at(8.25, 7.75)), llGroundNormal(at(8.4, 8.6)), llGroundNormal(at(8.6, 8.4))',
      { ground: tombolo },
    )
    expectVector(got[0], 0, -0.524801, 1)
    expectVector(got[1], 0, -0.524801, 1)
    expectVector(got[2], 0.4424, -0.082401, 1)
    expectVector(got[3], 0.4424, -0.082401, 1)
    expectVector(got[4], 0, -0.082401, 1)
    expectVector(got[5], 0.62, -0.524801, 1)
    expectVector(got[6], 0, 0, 1)
    expectVector(got[7], 0.4424, -0.524801, 1)
    expectVector(got[8], 0, -0.082401, 1)
  })

  // In-world, SLua Tombolo: at (8.25, 8.25) llGroundSlope read
  // <0, -0.524801, -0.275416> and llGroundContour <0.524801, 0, 0>; at
  // (8.75, 8.75) <0.4424, -0.082401, -0.202508> and <0.082401, 0.4424, 0>.
  // The slope is the normal's x and y with z -(x² + y²); the contour is the
  // slope turned a quarter left, flat.
  it('derive the slope and contour from the normal', async () => {
    const got = await read(
      'llGroundSlope(at(8.25, 8.25)), llGroundContour(at(8.25, 8.25)), llGroundSlope(at(8.75, 8.75)), llGroundContour(at(8.75, 8.75))',
      { ground: tombolo },
    )
    expectVector(got[0], 0, -0.524801, -0.275416)
    expectVector(got[1], 0.524801, 0, 0)
    expectVector(got[2], 0.4424, -0.082401, -0.202508)
    expectVector(got[3], 0.082401, 0.4424, 0)
  })
})

describe('region edges', () => {
  // In-world, SLua Tombolo: llGround at (255.5, 255.5) read 23.32, between the
  // heights at 255 and 256; at (257, 257) and (300, 300) it read 23.76, the
  // height at (256, 256), and the normal there was <0, 0, 1>.
  it('hold points past the east and north edges on the 256 m grid line', async () => {
    const got = await read(
      'llGround(at(255.5, 255.5)), llGround(at(257, 257)), llGround(at(300, 300)), llGroundNormal(at(300, 300))',
      { ground: tombolo },
    )
    expect(got[0]).toBeCloseTo(23.32, 4)
    expect(got[1]).toBeCloseTo(23.76, 4)
    expect(got[2]).toBeCloseTo(23.76, 4)
    expect(got[3]).toEqual({ x: 0, y: 0, z: 1 })
  })

  // In-world, SLua Tombolo: llGroundNormal at (255.7, 255.7) read
  // <-1.760027, 1.760027, 1.000031>. Second Life's z in the last metre before
  // the north-east corner is 1.000031 even on flat ground; rezless keeps it 1.
  it('take the normal in the last cell from the 256 m grid line', async () => {
    const [n] = await read('llGroundNormal(at(255.7, 255.7))', { ground: tombolo })
    expectVector(n, -1.76, 1.76, 1)
  })

  // In-world, SLua Tombolo: along y = 8, llGround at x -3, -1.25 and -1 read
  // 25.62, at -0.75, -0.5 and -0.25 read 25.595, 25.571 and 25.546, and at 0
  // read 25.521. At (-10, -10) it read 25.52, the same as (-1, -1). Points past
  // the west and south edges stop at -1 m, where the grid has one more line.
  it('hold points past the west and south edges on a grid line at -1 m', async () => {
    const got = await read(
      'llGround(at(-3, 8)), llGround(at(-1, 8)), llGround(at(-0.5, 8)), llGround(at(-0.25, 8)), llGround(at(0, 8))',
      { ground: tombolo },
    )
    const want = [25.62, 25.62, 25.571, 25.546, 25.521]
    got.forEach((h, i) => expect(h).toBeCloseTo(want[i]!, 3))
  })

  // In-world, SLua Tombolo: llGroundNormal at (-0.5, 8.3) read <0.098902, 0, 1>
  // and at (8.3, -0.5) <0, -0.001099, 1>.
  it('take normals outside the west and south edges from the -1 m grid line', async () => {
    const [w, s] = await read('llGroundNormal(at(-0.5, 8.3)), llGroundNormal(at(8.3, -0.5))', { ground: tombolo })
    expectVector(w, 0.0989, 0, 1)
    expectVector(s, 0, -0.0011, 1)
  })

  it('never asks the ground function for a point outside -1 to 256', async () => {
    const asked: number[] = []
    const ground = (x: number, y: number) => {
      asked.push(x, y)
      return 22
    }
    await read('llGround(<5000, 5000, 0>), llGroundNormal(<5000, 5000, 0>), llGroundNormal(<-5000, -5000, 0>)', { ground })
    expect(Math.min(...asked)).toBe(-1)
    expect(Math.max(...asked)).toBe(256)
  })
})

describe('water', () => {
  // In-world: llWater at ZERO_VECTOR, <100, 100, 50>, <-500, 0, 0> and
  // <0, 0, -3000> read 20.0 in SLua Tombolo and SLua Tideland.
  it('defaults to 20 m everywhere in the region', async () => {
    expect(await read('llWater(ZERO_VECTOR), llWater(<-500, 0, 0>)')).toEqual([20, 20])
  })

  it('reads a water height set on the region', async () => {
    expect(await read('llWater(<5, 5, 0>)', { water: 35.25 })).toEqual([35.25])
  })
})

describe('wind', () => {
  // In-world: llWind(ZERO_VECTOR) read <-0.654923, -2.482508, 0> in SLua
  // Tideland, and other values at other offsets and times; its z was always 0.
  // A region simulates its own wind, so a test sets one; the default is that
  // sample held fixed.
  it('defaults to a measured breeze held fixed', async () => {
    const [w] = await read('llWind(<60, 60, 0>)')
    expectVector(w, -0.654923, -2.482508, 0)
  })

  it('reads a wind set on the region at the offset point', async () => {
    const got = await read('llWind(ZERO_VECTOR), llWind(<10, -20, 500>)', { wind: (x, y) => ({ x: x / 10, y: y / 10, z: 0 }) })
    expect(got).toEqual([
      { x: Math.fround(12.6), y: 13, z: 0 },
      { x: Math.fround(13.6), y: 11, z: 0 },
    ])
  })

  it('reads a fixed wind set on the region', async () => {
    expect(await read('llWind(ZERO_VECTOR)', { wind: { x: 3, y: -4, z: 0 } })).toEqual([{ x: 3, y: -4, z: 0 }])
  })
})
