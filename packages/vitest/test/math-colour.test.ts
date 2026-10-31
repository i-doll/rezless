import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

const HELPERS = `
string f(float x) { return (string)x; }
string v(vector a) { return f(a.x) + "," + f(a.y) + "," + f(a.z); }
string r(rotation q) { return f(q.x) + "," + f(q.y) + "," + f(q.z) + "," + f(q.s); }
`

async function evalString(expr: string) {
  const s = await loadScript({
    source: `${HELPERS} string out; default { state_entry() {
      float nan = (float)"nan";
      float inf = (float)"inf";
      rotation q = llEuler2Rot(<0.1, 0.2, 0.3>);
      list L = ["c", 3, 1.5, "a", 1, 2.5, "b", 2, 0.5];
      out = ${expr};
    } }`,
  })
  s.start()
  return s.global('out')
}

async function evalFloat(expr: string) {
  const s = await loadScript({ source: `float out; default { state_entry() { out = ${expr}; } }` })
  s.start()
  return s.global('out') as number
}

// In-world: Aditi, SLua Tideland, 2026-10-31, probes AB1-AB20 printed with (string).
describe('llAngleBetween (measured in Second Life)', () => {
  it.each([
    ['llAngleBetween(ZERO_ROTATION, ZERO_ROTATION)', '0.000000'],
    ['llAngleBetween(ZERO_ROTATION, llEuler2Rot(<0,0,PI_BY_TWO>))', '1.570796'],
    ['llAngleBetween(ZERO_ROTATION, <0,0,1,0>)', '3.141593'],
    ['llAngleBetween(<0,0,0,1>, <0,0,0,-1>)', '0.000000'],
    ['llAngleBetween(<0,0,0,0>, <0,0,0,1>)', '0.000000'],
    ['llAngleBetween(<0,0,0,0>, <0,0,0,0>)', '0.000000'],
    ['llAngleBetween(<0,0,0,2>, <0,0,2,2>)', '1.570796'],
    ['llAngleBetween(q, ZERO_ROTATION)', '0.381565'],
    ['llAngleBetween(llEuler2Rot(<0,0,3>), llEuler2Rot(<0,0,-3>))', '0.283185'],
    ['llAngleBetween(<1,2,3,4>, <-2,1,0.5,3>)', '1.718704'],
    ['llAngleBetween(<0,0,0,1>, <0,0,0.7071068,-0.7071068>)', '1.570796'],
    ['llAngleBetween(<0,0,0,1>, <nan,0,0,1>)', '0.000000'],
    ['llAngleBetween(<0,0,0,1>, <0,0,0.0001,1>)', '0.000000'],
    ['llAngleBetween(<0,0,0,1>, <0,0,0.001,1>)', '0.000000'],
    ['llAngleBetween(<0,0,0,1>, <0,0,0.005,1>)', '0.010007'],
    ['llAngleBetween(<0,0,0,1>, <0,0,0.01,1>)', '0.019990'],
    ['llAngleBetween(<0.1,0.2,0.3,0.9>, <0.1,0.2,0.3,0.9001>)', '0.000000'],
    ['llAngleBetween(<0,0,0,1e-20>, <0,0,1,0>)', '3.141593'],
    ['llAngleBetween(<0,0,1e-5,0>, <0,1e-5,0,0>)', '3.141593'],
  ])('%s = %s', async (expr, expected) => {
    expect(await evalString(`f(${expr})`)).toBe(expected)
  })

  // In-world: probe H<h>, llAngleBetween(ZERO_ROTATION, <0,0,llSin(h),llCos(h)>) * 1e6, along
  // with the negated rotation and the rotation scaled by 3. The negated one differs in the last
  // digits, so Second Life folds 2*acos(dot) back below PI rather than taking |dot|.
  it.each([
    [0.001, 1953.125, 1953.125, 1953.125],
    [0.0012, 2392.08, 2392.292, 2489.756],
    [0.0018, 3588.12, 3588.2, 3653.963],
    [0.002, 4026.471, 4026.413, 3966.816],
    [0.005, 10006.8, 10006.9, 9982.944],
    [0.01, 20001.74, 20001.89, 20013.66],
  ])('a half-angle of %f gives single-precision results', async (h, pos, neg, big) => {
    const s = Math.fround(Math.sin(Math.fround(h))).toPrecision(9)
    const c = Math.fround(Math.cos(Math.fround(h))).toPrecision(9)
    expect((await evalFloat(`llAngleBetween(ZERO_ROTATION, <0,0,${s},${c}>)`)) * 1e6).toBeCloseTo(pos, 1)
    expect((await evalFloat(`llAngleBetween(ZERO_ROTATION, <0,0,-${s},-${c}>)`)) * 1e6).toBeCloseTo(neg, 1)
    expect((await evalFloat(`llAngleBetween(<0,0,0,3>, <0,0,3*${s},3*${c}>)`)) * 1e6).toBeCloseTo(big, 1)
  })

  // In-world: probes Z0-Z5. A rotation whose length isn't above 1e-7 in single precision reads
  // as ZERO_ROTATION, so <0,0,m,0> is half a turn from <0,0,1,0> only for m <= 1e-7.
  it.each([
    ['1e-5', '0.000000'],
    ['1.1e-7', '0.000000'],
    ['1e-7', '3.141593'],
    ['5e-8', '3.141593'],
  ])('a rotation of length %s is normalised or read as no turn', async (m, expected) => {
    expect(await evalString(`f(llAngleBetween(<0,0,${m},0>, <0,0,1,0>))`)).toBe(expected)
  })

  // In-world: probes K13-K15, * 1e6. A rotation within 1e-6 of unit length isn't normalised.
  it.each([
    ['0.0013', 0],
    ['0.0014', 0],
    ['0.0015', 2929.688],
  ])('<0,0,%s,1> is %f millionths of a radian from ZERO_ROTATION', async (z, want) => {
    expect((await evalFloat(`llAngleBetween(ZERO_ROTATION, <0,0,${z},1>)`)) * 1e6).toBeCloseTo(want, 2)
  })
})

// In-world: Aditi, SLua Tideland, 2026-10-31, probes AX1-AX15. Second Life reads the three
// axes as the rows of a rotation matrix and converts it without normalising when the trace
// is positive, so scaled or skewed axes give a quaternion that isn't unit length.
describe('llAxes2Rot (measured in Second Life)', () => {
  it.each([
    ['<1,0,0>, <0,1,0>, <0,0,1>', '0.000000,0.000000,0.000000,1.000000'],
    ['<0,1,0>, <-1,0,0>, <0,0,1>', '0.000000,0.000000,0.707107,0.707107'],
    ['<-1,0,0>, <0,-1,0>, <0,0,1>', '0.000000,0.000000,1.000000,0.000000'],
    ['<1,0,0>, <0,-1,0>, <0,0,-1>', '1.000000,0.000000,0.000000,0.000000'],
    ['<2,0,0>, <0,2,0>, <0,0,2>', '0.000000,0.000000,0.000000,1.322876'],
    ['ZERO_VECTOR, ZERO_VECTOR, ZERO_VECTOR', '1.000000,0.000000,0.000000,0.000000'],
    ['<1,0,0>, <0,1,0>, <0,0,-1>', '0.000000,0.000000,0.000000,0.707107'],
    ['llRot2Fwd(q), llRot2Left(q), llRot2Up(q)', '0.064071,0.091158,0.153439,0.981856'],
    ['<1,1,0>, <0,1,0>, <0,0,1>', '0.000000,0.000000,0.250000,1.000000'],
    ['<-1,0,0>, <0,1,0>, <0,0,-1>', '0.000000,1.000000,0.000000,0.000000'],
    ['<1,0,0>, <0,0,1>, <0,-1,0>', '0.707107,0.000000,0.000000,0.707107'],
    ['<0,0,1>, <0,1,0>, <-1,0,0>', '0.000000,-0.707107,0.000000,0.707107'],
    ['<1,2,3>, <4,5,6>, <7,8,9>', '-0.250000,0.500000,-0.250000,2.000000'],
    ['<-1,0,0>, <0,-1,0>, <0,0,-1>', '1.000000,0.000000,0.000000,0.000000'],
    ['<0,0,0>, <0,1,0>, <0,0,1>', '0.000000,0.000000,0.000000,0.866025'],
  ])('llAxes2Rot(%s) = %s', async (args, expected) => {
    expect(await evalString(`r(llAxes2Rot(${args}))`)).toBe(expected)
  })

  // In-world: probes A1-A3, components * 1e6 (A1 and A2 minus an offset, for more digits).
  it.each([
    ['<0.6,0.8,0>, <-0.8,0.6,0>, <0,0,1>', [0, 0, 447213.6, 894427.2]],
    ['<0.3,0.4,0.5>, <-0.8,0.6,0.1>, <0.2,-0.3,0.9>', [119522.9, -89642.15, 358568.6, 836660]],
    ['<-0.6,0.8,0.1>, <0.8,0.6,0.2>, <0.1,0.2,-1>', [444444.4, 888888.8, 111111.1, 0]],
  ])('llAxes2Rot(%s) keeps its digits', async (args, want) => {
    const s = await loadScript({ source: `rotation out; default { state_entry() { out = llAxes2Rot(${args}); } }` })
    s.start()
    const q = s.global('out') as { x: number; y: number; z: number; s: number }
    ;[q.x, q.y, q.z, q.s].forEach((c, i) => expect(c * 1e6).toBeCloseTo(want[i]!, 0))
  })
})

// In-world: Aditi, SLua Tideland, 2026-10-31, probes L1-L5, S1-S5 and RT. Values outside 0..1
// aren't clamped, negatives take the linear segment and NaN and infinities pass through.
describe('llLinear2sRGB and llsRGB2Linear (measured in Second Life)', () => {
  it.each([
    ['llLinear2sRGB(<0,0.5,1>)', '0.000000,0.735357,1.000000'],
    ['llLinear2sRGB(<0.001,0.0031308,0.0031309>)', '0.012920,0.040450,0.040451'],
    ['llLinear2sRGB(<-0.5,2,0.2>)', '-6.460000,1.353256,0.484529'],
    ['llLinear2sRGB(<-0.001,100,0.04>)', '-0.012920,7.132631,0.220916'],
    ['llLinear2sRGB(<nan,inf,-inf>)', 'NaN,Infinity,-Infinity'],
    ['llsRGB2Linear(<0,0.5,1>)', '0.000000,0.214041,1.000000'],
    ['llsRGB2Linear(<0.01,0.04045,0.04046>)', '0.000774,0.003131,0.003132'],
    ['llsRGB2Linear(<-0.5,2,0.2>)', '-0.038700,4.953847,0.033105'],
    ['llsRGB2Linear(<-0.01,100,0.73536>)', '-0.000774,55560.670000,0.500005'],
    ['llsRGB2Linear(<nan,inf,-inf>)', 'NaN,Infinity,-Infinity'],
    ['llsRGB2Linear(llLinear2sRGB(<0.25,0.002,0.9>))', '0.250000,0.002000,0.900000'],
  ])('%s = %s', async (expr, expected) => {
    expect(await evalString(`v(${expr})`)).toBe(expected)
  })

  // In-world: probes C1-C5, (llLinear2sRGB(<c,0,0>).x - offset) * 1e6.
  it.each([
    [100, 7, 132630.8],
    [2, 1, 353256],
    [0.5, 0.7, 35356.94],
    [0.04, 0.2, 20916.33],
    [0.3, 0.5, 83831.49],
  ])('llLinear2sRGB(<%f,0,0>) is %f plus %f millionths', async (c, offset, want) => {
    const s = await loadScript({ source: `vector out; default { state_entry() { out = llLinear2sRGB(<${c},0,0>); } }` })
    s.start()
    expect(((s.global('out') as { x: number }).x - offset) * 1e6).toBeCloseTo(want, 0)
  })
})

// In-world: Aditi, SLua Tideland, 2026-10-31, probes LS1-LS23 and LSa-LSn. A stride below 1
// sorts single elements, an index outside the stride gives [], and a list whose length isn't a
// multiple of the stride comes back unsorted, checked in that order.
describe('llListSortStrided (measured in Second Life)', () => {
  const byIndex0 = 'a, 1, 2.500000, b, 2, 0.500000, c, 3, 1.500000'
  const byIndex2 = 'b, 2, 0.500000, c, 3, 1.500000, a, 1, 2.500000'
  const descending = 'c, 3, 1.500000, b, 2, 0.500000, a, 1, 2.500000'
  const unsorted = 'c, 3, 1.500000, a, 1, 2.500000, b, 2, 0.500000'
  const singles = 'a, 1, 0.500000, b, 2, 1.500000, c, 3, 2.500000'
  it.each([
    ['L, 3, 0, TRUE', byIndex0],
    ['L, 3, 1, TRUE', byIndex0],
    ['L, 3, 2, TRUE', byIndex2],
    ['L, 3, 1, FALSE', descending],
    ['L, 3, -1, TRUE', byIndex2],
    ['L, 3, -2, TRUE', byIndex0],
    ['L, 3, 3, TRUE', ''],
    ['L, 3, -4, TRUE', ''],
    ['L, 3, 1, 2', descending],
    ['L, 3, 1, -1', descending],
    ['L, 3, 1, 0', descending],
    ['L, 0, 0, TRUE', singles],
    ['L, 0, 1, TRUE', ''],
    ['L, 0, -1, TRUE', singles],
    ['L, -3, 0, TRUE', singles],
    ['L, -3, 1, TRUE', ''],
    ['L, -3, -1, TRUE', singles],
    ['L, -9, 0, TRUE', singles],
    ['L, -1, -1, TRUE', singles],
    ['L, 1, 0, TRUE', singles],
    ['L, 1, 1, TRUE', ''],
    ['L, 4, 1, TRUE', unsorted],
    ['L, 4, 5, TRUE', ''],
    ['L, 9, 1, TRUE', unsorted],
    ['L, 9, -1, TRUE', unsorted],
    ['[3, "x", 1, 2, "y", 5, 1, "z", 9], 3, 2, TRUE', '3, x, 1, 2, y, 5, 1, z, 9'],
    ['[1, "b", 2, 3, "a", 4, 5, 7, 6], 3, 1, TRUE', '3, a, 4, 1, b, 2, 5, 7, 6'],
    [
      '[1, <3,0,0>, 2, <1,0,0>, 3, <2,0,0>], 2, 1, TRUE',
      '2, <1.000000, 0.000000, 0.000000>, 3, <2.000000, 0.000000, 0.000000>, 1, <3.000000, 0.000000, 0.000000>',
    ],
    ['[], 3, 1, TRUE', ''],
    ['[], 3, 5, TRUE', ''],
    ['[1, 2, 3, 4, 5], 2, 1, TRUE', '1, 2, 3, 4, 5'],
    ['[5, 1, 3, 2, 1, 1], 2, 1, TRUE', '5, 1, 1, 1, 3, 2'],
    ['[3, 1, 2], 1, 0, TRUE', '1, 2, 3'],
    ['[3, 1, 2], -1, 0, TRUE', '1, 2, 3'],
    ['[3, 1, 2], 2, 0, TRUE', '3, 1, 2'],
    ['[3, 1, 2], 2, 5, TRUE', ''],
  ])('llListSortStrided(%s) = %s', async (args, expected) => {
    expect(await evalString(`llList2CSV(llListSortStrided(${args}))`)).toBe(expected)
  })
})
