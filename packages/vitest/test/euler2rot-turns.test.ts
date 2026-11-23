import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlEuler2Rot
// In-world: SLua Tideland on the Aditi beta grid, in 0.3 m boxes, with scripts compiled for Mono.
// Floats were printed exactly as a mantissa and an exponent of two.

const said = (s: { chat: ReadonlyArray<{ channel: number; text: string }> }) =>
  s.chat.filter((c) => c.channel === 0).map((c) => c.text)

const f32 = Math.fround

const EXACT = `
  string B(float f) {
    if (f == 0.0) return llList2String(llParseString2List(llList2CSV([f]), ["."], []), 0);
    string s = "";
    if (f < 0.0) { s = "-"; f = -f; }
    integer e = 0;
    while (f < 8388608.0) { f *= 2.0; --e; }
    while (f >= 16777216.0) { f *= 0.5; ++e; }
    return s + (string)((integer)f) + "p" + (string)e;
  }
  string BR(rotation r) { return B(r.x) + "," + B(r.y) + "," + B(r.z) + "," + B(r.s); }
`

/** What rezless gives for each Euler vector, one exact line each, in chunks a script can hold. */
async function euler2Rot(vectors: string[]) {
  const got: string[] = []
  for (let start = 0; start < vectors.length; start += 50) {
    const s = await loadScript({ source: EXACT + `
      default {
        state_entry() {
          ${vectors.slice(start, start + 50).map((v) => `llSay(0, BR(llEuler2Rot(${v})));`).join('\n          ')}
        }
      }` })
    s.start()
    got.push(...said(s))
  }
  return got
}

/** A float given as its shortest decimal, as a "mantissa p exponent" string. */
function exact(v: number) {
  const x = f32(v)
  if (Object.is(x, -0)) return '-0'
  if (x === 0) return '0'
  let m = Math.abs(x)
  let e = 0
  while (m < 8388608) { m *= 2; --e }
  while (m >= 16777216) { m /= 2; ++e }
  return `${x < 0 ? '-' : ''}${m}p${e}`
}

describe('llEuler2Rot whole turns', () => {
  it('brings an angle within 180 degrees before rounding it, so turns near 2 PI keep their digits', async () => {
    // In-world (2026-11-14 and 2026-11-23): each of these, measured exactly, is the turn left once
    // the angle is brought within 180 degrees in double precision and stepped to 1e-7 degrees.
    // Rounded to a float before that, a turn this close to 2 PI would lose about 2.4e-7 radians.
    const want: Array<[string, number[]]> = [
      ['<0, 6.2831707, 0>', [0, -0.0000073033307, 0, 1]],
      ['<0, 6.2831664, 0>', [0, -0.0000094492125, 0, 1]],
      ['<0, 6.2831655, 0>', [0, -0.000009926561, 0, 1]],
      ['<0, 6.2831645, 0>', [0, -0.000010403035, 0, 1]],
      ['<0, 6.2831554, 0>', [0, -0.000014933037, 0, 1]],
      ['<3.2646, 0, 0>', [0.9981093, 0, 0, -0.06146496]],
      ['<0, 0, 3.9>', [0, 0, 0.92895967, -0.3701809]],
      ['<-3.5388, 0, 0>', [0.98034304, 0, 0, 0.19730055]],
    ]
    expect(await euler2Rot(want.map(([v]) => v))).toEqual(want.map(([, q]) => q.map(exact).join(',')))
  })
})

/** In-world (2026-11-23, Mono): llEuler2Rot of huge angles, printed exactly. */
const HUGE: Array<[string, string]> = [
  ['<5e5, 0, 0>', '16710229p-24,0,0,11981878p-27'],
  ['<2e6, 0, 0>', '-11743833p-25,-0,0,15716093p-24'],
  ['<5e6, 0, 0>', '-14413549p-24,0,0,8586303p-24'],
  ['<1e7, 0, 0>', '16595753p-24,0,0,9843538p-26'],
  ['<2e7, 0, 0>', '-9737075p-25,-0,0,16055290p-24'],
  ['<3e7, 0, 0>', '11858586p-25,0,0,15694536p-24'],
  ['<5e7, 0, 0>', '-9540296p-26,-0,0,16606818p-24'],
  ['<1.234e8, 0, 0>', '15730705p-25,0,0,14819285p-24'],
  ['<3e8, 0, 0>', '16349695p-24,0,0,-15053220p-26'],
  ['<7e8, 0, 0>', '-8495180p-24,-0,0,14467443p-24'],
  ['<1e9, 0, 0>', '16004339p-24,0,0,10067000p-25'],
  ['<-1e9, 0, 0>', '16004339p-24,0,0,-10067000p-25'],
  ['<2.5e9, 0, 0>', '12340326p-24,0,0,11366238p-24'],
  ['<7e9, 0, 0>', '14498374p-24,0,0,8442282p-24'],
  ['<1e10, 0, 0>', '10973868p-26,0,0,16551386p-24'],
  ['<-1e10, 0, 0>', '-10973868p-26,-0,0,16551386p-24'],
  ['<1.2e10, 0, 0>', '-16526059p-25,-0,0,14601278p-24'],
  ['<1.5e10, 0, 0>', '14565665p-26,0,0,16377273p-24'],
  ['<1.55e10, 0, 0>', '14565665p-26,0,0,16377273p-24'],
  ['<1.6e10, 0, 0>', '14565665p-26,0,0,16377273p-24'],
  ['<16777216.0, 0, 0>', '-14503843p-25,-0,0,15128933p-24'],
  ['<33554432.0, 0, 0>', '14977829p-24,0,0,-15118149p-25'],
  ['<-3e7, 0, 0>', '-11858586p-25,-0,0,15694536p-24'],
  ['<123456789.0, 0, 0>', '14686127p-24,0,0,-16222536p-25'],
  ['<9.87e9, 0, 0>', '11471453p-25,0,0,15766306p-24'],
  ['<4.4e9, 0, 0>', '15639796p-24,0,0,12144426p-25'],
  ['<0, 1e7, 0>', '0,16595753p-24,0,9843538p-26'],
  ['<0, 0, 1e8>', '0,-0,-9443400p-25,16099085p-24'],
  ['<1e7, 2e8, 3e9>', '10250840p-24,-9579055p-24,-11670572p-25,14224823p-25'],
  ['<0.5, 1e9, -0.25>', '-11163438p-28,15541072p-24,13282409p-26,10665247p-25'],
]

const fromExact = (t: string) => {
  if (t === '0') return 0
  if (t === '-0') return -0
  const negative = t.startsWith('-')
  const [m, e] = (negative ? t.slice(1) : t).split('p')
  const v = Number(m) * 2 ** Number(e)
  return negative ? -v : v
}

describe('llEuler2Rot of huge angles', () => {
  it('takes whole turns off as a float, losing multiples of 8 degrees, and turns past 2^31 of them as NaN', async () => {
    // In-world: 30 angles from 5e5 to 1.6e10 radians. Each is the angle in degrees less 360 times
    // its whole turns, truncated to a 32-bit integer and multiplied back as a float, less one more
    // turn when the rest is past 180 degrees: 5e6 radians turned 16 degrees short of 5e6 radians less whole
    // turns, 2e7 radians 16 degrees past, and 3e8 radians 128 degrees short. 1.5e10 radians and up
    // have more turns than fit, and turn as a NaN angle does. 21 of the 30 match to the last bit
    // and 27 within 3e-7. 1e9 radians, which leaves 2015 degrees after the turns come off, is
    // 1.9e-6 out, and the precision of a rest that large is still open.
    const got = (await euler2Rot(HUGE.map(([v]) => v))).map((line) => line.split(',').map(fromExact))
    const want = HUGE.map(([, q]) => q.split(',').map(fromExact))
    for (const [i, q] of want.entries()) {
      for (const [k, v] of q.entries()) {
        expect(Math.abs(got[i]![k]! - v), HUGE[i]![0]).toBeLessThan(2e-6)
        if (v === 0) expect(Object.is(got[i]![k], v), HUGE[i]![0]).toBe(true)
      }
    }
    expect(want.filter((q, i) => q.every((v, k) => got[i]![k] === v)).length).toBe(21)
    expect(want.filter((q, i) => q.every((v, k) => Math.abs(got[i]![k]! - v) < 3e-7)).length).toBe(27)
  })
})

/** In-world (2026-11-23, Mono): more huge angles from a second probe, printed exactly. */
const HUGE_SIGNED: Array<[string, string]> = [
  ['<-1.5e10, 0, 0>', '-10778538p-24,-0,0,12856831p-24'],
  ['<-1.6e10, 0, 0>', '-9796455p-24,-0,0,13620003p-24'],
  ['<-1.7e10, 0, 0>', '9731152p-24,0,0,13666735p-24'],
  ['<-2e10, 0, 0>', '16417203p-24,0,0,13827767p-26'],
  ['<-2.5e10, 0, 0>', '-10680476p-26,-0,0,16563376p-24'],
  ['<-2.6e10, 0, 0>', '15395231p-24,0,0,13335942p-25'],
  ['<-2.7e10, 0, 0>', '-10254874p-24,-0,0,13278273p-24'],
  ['<-3e10, 0, 0>', '14565665p-26,0,0,16377273p-24'],
  ['<-1e11, 0, 0>', '14565665p-26,0,0,16377273p-24'],
  ['<-1e12, 0, 0>', '14565665p-26,0,0,16377273p-24'],
  ['<-3e38, 0, 0>', '14565665p-26,0,0,16377273p-24'],
  ['<2.2e10, 0, 0>', '14565665p-26,0,0,16377273p-24'],
  ['<1.4e10, 0, 0>', '14565665p-26,0,0,16377273p-24'],
  ['<1.45e10, 0, 0>', '14565665p-26,0,0,16377273p-24'],
  ['<-1.45e10, 0, 0>', '16528645p-24,0,0,-11509226p-26'],

]

describe('llEuler2Rot of huge negative angles', () => {
  it('turns a negative angle whose turns do not fit, as long as the rest fits the step', async () => {
    // In-world: the turns of 1.4e10 radians and more don't fit a 32-bit integer, which leaves -2^31
    // of them. Taking those off a positive angle leaves too many steps, so it turns as a NaN angle
    // does; taking them off a negative one adds 7.7e11 degrees, which still fits the step up to
    // -2.7e10 radians. -3e10 radians and more turn as a NaN angle does.
    const got = (await euler2Rot(HUGE_SIGNED.map(([v]) => v))).map((line) => line.split(',').map(fromExact))
    const want = HUGE_SIGNED.map(([, q]) => q.split(',').map(fromExact))
    for (const [i, q] of want.entries()) {
      for (const [k, v] of q.entries()) {
        expect(Math.abs(got[i]![k]! - v), HUGE_SIGNED[i]![0]).toBeLessThan(6e-8)
        if (v === 0) expect(Object.is(got[i]![k], v), HUGE_SIGNED[i]![0]).toBe(true)
      }
    }
    expect(want.filter((q, i) => q.every((v, k) => got[i]![k] === v)).length).toBe(13)
  })

  // In-world: -1.4e10 radians gave 12380024p-24, 0, 0, 11322985p-24, a turn of 95.107 degrees.
  // rezless turns it 128.572 degrees: the angle left is about -5e8 radians, where one float is 32
  // radians, and the two differ by that one float. Which rounding the grid uses there is open.
  it.fails('turns -1.4e10 radians as Second Life does', async () => {
    const [line] = await euler2Rot(['<-1.4e10, 0, 0>'])
    expect(line).toBe('12380024p-24,0,0,11322985p-24')
  })
})

describe('PRIM_ROTATION and PRIM_ROT_LOCAL with a rotation near zero', () => {
  it('store no rotation for one of length 1e-7 or less, and rescale a longer one', async () => {
    // https://wiki.secondlife.com/wiki/PRIM_ROT_LOCAL
    // In-world (2026-11-23, Mono, a 0.3 m box): from a turned prim, each of these set through
    // PRIM_ROT_LOCAL and again through PRIM_ROTATION read back the same with llGetLocalRot, llGetRot
    // and llGetLinkPrimitiveParams. Lengths of 5e-8, 1e-8, 1e-7 (four parts of 5e-8), 9e-8, 5e-8
    // and 1.4e-20, and the zero rotation, left the identity; 1.2e-7 and 1.1e-7 were rescaled to unit
    // length; a length of 1.000006 was rescaled, as Second Life rescales any rotation more than 1e-6
    // from unit length.
    const cases: Array<[string, string]> = [
      ['<0, 0, 0, 5e-8>', '0,0,0,8388608p-23'],
      ['<1e-8, 0, 0, 0>', '0,0,0,8388608p-23'],
      ['<5e-8, 5e-8, 5e-8, 5e-8>', '0,0,0,8388608p-23'],
      ['<6e-8, 6e-8, 6e-8, 6e-8>', '8388608p-24,8388608p-24,8388608p-24,8388608p-24'],
      ['<0, 0, 9e-8, 0>', '0,0,0,8388608p-23'],
      ['<0, 0, 1.1e-7, 0>', '0,0,8388608p-23,0'],
      ['<0, 0, 2e-7, 0>', '0,0,8388608p-23,0'],
      ['<0, 0, 1e-6, 0>', '0,0,8388608p-23,0'],
      ['<3e-8, 0, 0, -4e-8>', '0,0,0,8388608p-23'],
      ['<1e-20, 0, 0, 1e-20>', '0,0,0,8388608p-23'],
      ['<0, 0, 0, 0>', '0,0,0,8388608p-23'],
      ['<0.1, 0, 0, 0.1>', '11863283p-24,0,0,11863283p-24'],
      ['<0, 0.6, 0, 0.8>', '0,10066330p-24,0,13421773p-24'],
      ['<0, 0.6, 0, 0.80001>', '0,10066250p-24,0,13421834p-24'],
    ]
    const s = await loadScript({ source: EXACT + `
      list C = [${cases.map(([q]) => q).join(', ')}];
      default {
        state_entry() {
          integer rule;
          for (rule = 0; rule < 2; ++rule) {
            integer which = PRIM_ROT_LOCAL;
            if (rule) which = PRIM_ROTATION;
            integer i;
            for (i = 0; i < llGetListLength(C); ++i) {
              llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_ROT_LOCAL, llEuler2Rot(<0.3, 0.2, 0.1>)]);
              llSetLinkPrimitiveParamsFast(LINK_THIS, [which, llList2Rot(C, i)]);
              llSay(0, BR(llGetLocalRot()) + "/" + BR(llGetRot()));
            }
          }
        }
      }` })
    s.start()
    const want = cases.map(([, q]) => `${q}/${q}`)
    expect(said(s)).toEqual([...want, ...want])
  })
})
