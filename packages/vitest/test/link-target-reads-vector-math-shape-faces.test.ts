import { describe, it, expect } from 'vitest'
import { loadLinkset, loadScript, DEBUG_CHANNEL } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlGetLinkPrimitiveParams
// https://wiki.secondlife.com/wiki/PRIM_LINK_TARGET
// https://wiki.secondlife.com/wiki/LlVecMag
// https://wiki.secondlife.com/wiki/LlVecNorm
// https://wiki.secondlife.com/wiki/LlRot2Angle
// https://wiki.secondlife.com/wiki/LlRot2Axis
// https://wiki.secondlife.com/wiki/LlAngleBetween
// https://wiki.secondlife.com/wiki/LlRound
// https://wiki.secondlife.com/wiki/PRIM_TYPE
// In-world: SLua Tideland on Aditi (2026-11-13 and 2026-11-14), in 0.5 m boxes made with
// object.create, with scripts compiled for Mono unless a test says otherwise. Results were said on
// a channel, and a listener on DEBUG_CHANNEL heard no script errors from any probe.

const said = (s: { chat: ReadonlyArray<{ channel: number; text: string }> }, channel = 0) =>
  s.chat.filter((c) => c.channel === channel).map((c) => c.text)

async function run(source: string) {
  const s = await loadScript({ source })
  s.start()
  return s
}

async function runSlua(source: string) {
  const s = await loadScript({ language: 'slua', filename: 'probe.luau', source })
  s.start()
  return s
}

// Materials tell the prims apart: 5, 6, 0 and 1 for links 1 to 4, and 2 for a lone prim.
const LINK_PROBE = `
  string line(list r) { return "[" + llList2CSV(r) + "]"; }
  string get(integer link) {
    return line(llGetPrimitiveParams([PRIM_MATERIAL, PRIM_LINK_TARGET, link, PRIM_MATERIAL, PRIM_LINK_TARGET, LINK_THIS, PRIM_PHANTOM]));
  }
  string getLink(integer link) {
    return line(llGetLinkPrimitiveParams(link, [PRIM_MATERIAL, PRIM_LINK_TARGET, LINK_THIS, PRIM_PHANTOM]));
  }
  default {
    state_entry() {
      if (llGetNumberOfPrims() == 1) llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_MATERIAL, 2]);
      else {
        llSetLinkPrimitiveParamsFast(1, [PRIM_MATERIAL, 5]);
        llSetLinkPrimitiveParamsFast(2, [PRIM_MATERIAL, 6]);
        llSetLinkPrimitiveParamsFast(3, [PRIM_MATERIAL, 0]);
        llSetLinkPrimitiveParamsFast(4, [PRIM_MATERIAL, 1]);
      }
      list links = [0, 1, 2, 3, 4, 5, 99, 2147483647, LINK_THIS, LINK_SET, LINK_ALL_OTHERS, LINK_ALL_CHILDREN, -5, -99, -2147483647 - 1];
      integer i;
      string a;
      string b;
      for (i = 0; i < llGetListLength(links); ++i) {
        a += get(llList2Integer(links, i)) + " ";
        b += getLink(llList2Integer(links, i)) + " ";
      }
      llSay(0, a);
      llSay(0, b);
      llSay(0, line(llGetPrimitiveParams([PRIM_MATERIAL, PRIM_LINK_TARGET]))
        + line(llGetPrimitiveParams([PRIM_MATERIAL, PRIM_LINK_TARGET, 99]))
        + line(llGetPrimitiveParams([PRIM_MATERIAL, PRIM_LINK_TARGET, 99, PRIM_LINK_TARGET, LINK_THIS, PRIM_PHANTOM]))
        + line(llGetPrimitiveParams([PRIM_LINK_TARGET, 99, PRIM_LINK_TARGET, 1, PRIM_MATERIAL]))
        + line(llGetLinkPrimitiveParams(99, [PRIM_LINK_TARGET, 1, PRIM_MATERIAL]))
        + line(llGetPrimitiveParams([PRIM_PHANTOM, PRIM_MATERIAL, PRIM_LINK_TARGET, 99, PRIM_PHANTOM])));
      llSay(0, line(llGetPrimitiveParams([PRIM_MATERIAL, PRIM_LINK_TARGET, "1", PRIM_MATERIAL, PRIM_PHANTOM]))
        + line(llGetPrimitiveParams([PRIM_MATERIAL, PRIM_LINK_TARGET, 1.0, PRIM_MATERIAL, PRIM_PHANTOM]))
        + line(llGetPrimitiveParams([PRIM_MATERIAL, PRIM_LINK_TARGET, llGetKey(), PRIM_MATERIAL, PRIM_PHANTOM]))
        + line(llGetPrimitiveParams([PRIM_MATERIAL, PRIM_LINK_TARGET, <2,0,0>, PRIM_MATERIAL, PRIM_PHANTOM])));
      llSay(0, line(llGetPrimitiveParams([PRIM_LINK_TARGET, 1, PRIM_MATERIAL, PRIM_LINK_TARGET, 2, PRIM_MATERIAL, PRIM_LINK_TARGET, 99, PRIM_MATERIAL, PRIM_LINK_TARGET, 1, PRIM_MATERIAL]))
        + line(llGetPrimitiveParams([PRIM_LINK_TARGET, LINK_SET, PRIM_MATERIAL, PRIM_MATERIAL, PRIM_LINK_TARGET, LINK_ALL_OTHERS, PRIM_MATERIAL])));
    }
  }`

async function linkProbe(prims: number, caller: number) {
  const { scripts } = await loadLinkset({
    prims: Array.from({ length: prims }, (_, i) => ({
      name: `p${i + 1}`,
      scripts: i + 1 === caller ? [{ name: 'probe', source: { source: LINK_PROBE, filename: 'probe.lsl' } }] : [],
    })),
  })
  const s = scripts.probe!
  s.start()
  expect(said(s, DEBUG_CHANNEL)).toEqual([])
  return said(s)
}

describe('PRIM_LINK_TARGET in a read', () => {
  it('ends the read when it names no prim, in a lone prim', async () => {
    // In-world: the link target probe in a lone box. Only link 0 and LINK_THIS name the prim. Every
    // other link, LINK_SET included, ends the read: the values read before it stay and the rules
    // after it give nothing, even after a later PRIM_LINK_TARGET, LINK_THIS.
    expect(await linkProbe(1, 1)).toEqual([
      '[2, 2, 0] [2] [2] [2] [2] [2] [2] [2] [2, 2, 0] [2] [2] [2] [2] [2] [2] ',
      '[2, 0] [] [] [] [] [] [] [] [2, 0] [] [] [] [] [] [] ',
      '[2][2][2][][][0, 2]',
      '[2][2][2][2]',
      '[][]',
    ])
  })

  it('ends the read when it names no prim, from the root of four prims', async () => {
    // In-world: the link numbers were read in the root of four linked boxes, and the last three
    // lines in the root of two. Link 0 names no prim from a root.
    // A negative link other than LINK_THIS reads link 2, whether it is LINK_SET, LINK_ALL_OTHERS,
    // LINK_ALL_CHILDREN or any other number. As the first argument of llGetLinkPrimitiveParams
    // the three selectors give an empty list and the other negative links read link 2.
    expect(await linkProbe(4, 1)).toEqual([
      '[5] [5, 5, 0] [5, 6, 0] [5, 0, 0] [5, 1, 0] [5] [5] [5] [5, 5, 0] [5, 6, 0] [5, 6, 0] [5, 6, 0] [5, 6, 0] [5, 6, 0] [5, 6, 0] ',
      '[] [5, 0] [6, 0] [0, 0] [1, 0] [] [] [] [5, 0] [] [] [] [6, 0] [6, 0] [6, 0] ',
      '[5][5][5][][][0, 5]',
      '[5][5][5][5]',
      '[5, 6][6, 6, 6]',
    ])
  })

  for (const caller of [2, 3, 4]) {
    it(`reads the root for link 0 and for a negative link, from child ${caller} of four prims`, async () => {
      // In-world: the link numbers were read in links 2, 3 and 4 of four boxes, and the last
      // three lines in the child of two. Link 0 and every negative link other than LINK_THIS read
      // the root, LINK_ALL_CHILDREN included.
      const m = [5, 6, 0, 1][caller - 1]
      expect(await linkProbe(4, caller)).toEqual([
        `[${m}, 5, 0] [${m}, 5, 0] [${m}, 6, 0] [${m}, 0, 0] [${m}, 1, 0] [${m}] [${m}] [${m}] [${m}, ${m}, 0] ` + `[${m}, 5, 0] `.repeat(6),
        `[5, 0] [5, 0] [6, 0] [0, 0] [1, 0] [] [] [] [${m}, 0] [] [] [] [5, 0] [5, 0] [5, 0] `,
        `[${m}][${m}][${m}][][][0, ${m}]`,
        `[${m}][${m}][${m}][${m}]`,
        '[5, 6][5, 5, 5]',
      ])
    })
  }
})

describe('vector math', () => {
  it('llVecNorm multiplies by the single-precision reciprocal of the length', async () => {
    const s = await run(`
      default {
        state_entry() {
          vector a = llVecNorm(<1, 2, 3>);
          vector b = llVecNorm(<0.1, 0.2, 0.7>);
          vector c = llVecNorm(<0.3, 0.7, 0.2>);
          llSay(0, llList2CSV([(integer)(a.z * 16777216.0), (integer)(b.z * 16777216.0), (integer)(c.z * 33554432.0), (integer)(a.x * 33554432.0)]));
          llSay(0, llList2CSV([llVecMag(<1e30, 0, 0>), llVecNorm(<-1e30, 0, 0>), llVecMag(<1e-20, 0, 0>) * 1e20, llVecDist(<1e30, 0, 0>, <-1e30, 0, 0>)]));
        }
      }`)
    // In-world: the math probe printed each float as an exact mantissa and exponent. The z of
    // llVecNorm(<1, 2, 3>) is 13451698 * 2^-24, one float below the nearest float to 3 / sqrt(14),
    // and 32 vectors agree with the length taken in double precision, rounded to a float, and
    // each component times the float 1 / length. llVecMag and llVecDist keep double precision
    // under Mono, so 1e30 and 1e-20 are not lost.
    expect(said(s)).toEqual([
      '13451698, 15981630, 8522835, 8967799',
      '1000000015047466219876688855040.000000, <-1.000000, 0.000000, 0.000000>, 1.000000, 2000000030094932439753377710080.000000',
    ])
  })

  it('SLua works in single precision, which overflows and underflows', async () => {
    const s = await runSlua(`
      local function f(x) return string.format("%.9g", x) end
      local function fv(v) return \`<{f(v.x)},{f(v.y)},{f(v.z)}>\` end
      local out = {}
      for _, x in {1e19, 1.8e19, 1.9e19, 2e19, 1e30, 1.1e-19, 1e-19, 1e-20, 3e-23} do
        local v = vector(x, 0, 0)
        table.insert(out, \`{f(ll.VecMag(v))} {f(ll.VecDist(v, vector(0, 0, 0)))} {fv(ll.VecNorm(v))}\`)
      end
      ll.Say(0, table.concat(out, " | "))
      ll.Say(0, \`{fv(ll.VecNorm(vector(-1e30, 0, 0)))} {fv(ll.VecNorm(vector(1e19, 1e19, 1e19)))} {f(ll.VecMag(vector(1e19, 1e19, 1e19)))} {f(ll.VecDist(vector(1e30, 0, 0), vector(-1e30, 0, 0)))}\`)
      ll.Say(0, \`{fv(ll.VecNorm(vector(1, 2, 3)))} {f(ll.VecMag(vector(1, 2, 3)))} {f(ll.VecDist(vector(1, 2, 3), vector(4, 6, 8.5)))} {fv(ll.VecNorm(vector(1.1e-7, 0, 0)))} {fv(ll.VecNorm(vector(1e-7, 0, 0)))}\`)`)
    // In-world: the same vectors from an SLua script, printed with %.17g. The squares are summed
    // as floats, so a length over sqrt(3.4e38) is inf and its normal is zero, with the sign kept.
    // A square under the smallest normal float (1.18e-38) is zero, so 1e-19 has no length and
    // 1.1e-19 does. llVecNorm still gives a zero vector for a length of 1e-7 or less.
    expect(said(s)).toEqual([
      '9.99999998e+18 9.99999998e+18 <1,0,0> | 1.80000004e+19 1.80000004e+19 <1,0,0> | inf inf <0,0,0> | inf inf <0,0,0> | inf inf <0,0,0>'
        + ' | 1.10000003e-19 1.10000003e-19 <0,0,0> | 0 0 <0,0,0> | 0 0 <0,0,0> | 0 0 <0,0,0>',
      '<-0,0,0> <0.577350259,0.577350259,0.577350259> 1.73205077e+19 inf',
      '<0.267261237,0.534522474,0.801783681> 3.7416575 7.43303442 <1,0,0> <0,0,0>',
    ])
  })
})

describe('llRound', () => {
  it('rounds halves up, adding 0.5 in single precision', async () => {
    const s = await run(`
      default {
        state_entry() {
          list v = [0.5, 1.5, 2.5, 3.5, -0.5, -1.5, -2.5, -3.5, 0.4, 0.6, -0.4, -0.6, 0.49999997, 0.50000006, -0.49999997, -0.50000006,
                    1.4999999, 2.4999998, 8388607.5, -8388607.5, 16777215.0, 2147483520.0, 2147483648.0, -2147483648.0, -2147483904.0, 1e10];
          integer i;
          string out;
          for (i = 0; i < llGetListLength(v); ++i) out += (string)llRound(llList2Float(v, i)) + " ";
          llSay(0, out);
        }
      }`)
    // In-world: the math probe. Ties go up, not to the even integer: 0.5 is 1, 2.5 is 3 and -2.5
    // is -2. The sum val + 0.5 is a float, so 0.49999997 rounds to 1 and 16777215.0 to 16777216.
    expect(said(s)).toEqual([
      '1 2 3 4 0 -1 -2 -3 0 1 0 -1 1 1 0 -1 1 2 8388608 -8388607 16777216 2147483520 -2147483648 -2147483648 -2147483648 -2147483648 ',
    ])
  })

  it('rounds the same way in SLua', async () => {
    const s = await runSlua(`
      local out = {}
      for _, v in {0.5, 1.5, 2.5, -0.5, -1.5, -2.5, 0.49999997, 16777215.0, 0.49999999999999994, 2147483647.4, 1e10} do
        table.insert(out, tostring(ll.Round(v)))
      end
      ll.Say(0, table.concat(out, " "))`)
    // In-world: the same values through ll.Round. The argument becomes a float first, so
    // 2147483647.4 is out of range.
    expect(said(s)).toEqual(['1 2 3 0 -1 -2 1 16777216 1 -2147483648 -2147483648'])
  })
})

const EXACT = `
  // The exact value of a float: mantissa, "p", exponent of two.
  string B(float f) {
    if (f == 0.0) return llList2String(llParseString2List(llList2CSV([f]), ["."], []), 0);
    string s = "";
    if (f < 0.0) { s = "-"; f = -f; }
    integer e = 0;
    while (f < 8388608.0) { f *= 2.0; --e; }
    while (f >= 16777216.0) { f *= 0.5; ++e; }
    return s + (string)((integer)f) + "p" + (string)e;
  }
  string BV(vector v) { return "<" + B(v.x) + "," + B(v.y) + "," + B(v.z) + ">"; }
`

describe('rotation angle and axis', () => {
  it('llRot2Angle and llRot2Axis work in single precision from 2 * acos(s)', async () => {
    const s = await run(EXACT + `
      default {
        state_entry() {
          list qs = [<1e-4, 0, 0, 1>, <1e-3, 0, 0, 1>, <0.01, 0, 0, 1>, <0.1, 0, 0, 1>, <0.1, 0.2, 0.3, 0.9>, <1, 1, 1, 1>, <0.5, 0, 0, -0.5>, <1e30, 0, 0, 1e30>, <0.1, 0.2, 0.3, -0.9>, <0, 0, 0.001, 0.5>, <1e-4, 1e-4, 1e-4, 1>];
          integer i;
          for (i = 0; i < llGetListLength(qs); ++i) {
            rotation q = llList2Rot(qs, i);
            llSay(0, B(llRot2Angle(q)) + " " + BV(llRot2Axis(q)) + " " + B(llAngleBetween(ZERO_ROTATION, q)));
          }
        }
      }`)
    // In-world: the math probes printed the angle, the axis and llAngleBetween(ZERO_ROTATION, q)
    // for 58 rotations as exact floats. The angle is always the one llAngleBetween gives, and
    // a rotation whose sqrt(1 - s * s) is under 0.0005 has a zero angle and a zero axis. The
    // axis is x, y, z over that square root, so it is not exactly a unit vector: <0.01, 0, 0, 1>
    // gives 1.000463 and <0, 0, 0.001, 0.5> gives 0.993424. A rotation within 1e-6 of unit length
    // is not normalised first, so <1e-3, 0, 0, 1> has s = 1 and reads as no rotation. A negative
    // s turns the axis around, zeros included.
    expect(said(s)).toEqual([
      '0 <0,0,0> 0', '0 <0,0,0> 0', '10731952p-29 <8392496p-23,0,0> 10731952p-29', '13377370p-26 <16777117p-24,0,0> 13377370p-26', '13220483p-24 <8967797p-25,8967797p-24,13451695p-24> 13220483p-24', '8784530p-22 <9686330p-24,9686330p-24,9686330p-24> 8784530p-22', '13176796p-23 <-16777215p-24,-0,-0> 13176796p-23', '13176795p-22 <0,0,0> 13176795p-22', '13220488p-24 <-8967797p-25,-8967797p-24,-13451695p-24> 13220488p-24', '8646781p-31 <0,0,16666890p-24> 8646781p-31', '0 <0,0,0> 0'])
  })

  it('llAngleBetween sums the dot product from the s term', async () => {
    const s = await run(EXACT + `
      default {
        state_entry() {
          llSay(0, B(llAngleBetween(<0.1,0.2,0.3,0.9>, <0.3,0.1,0.2,0.9>)) + " " + B(llAngleBetween(<0.1,0.2,0.3,0.9>, <1,2,3,4>))
            + " " + B(llAngleBetween(<0.7,0.1,-0.3,0.64>, <-0.2,0.4,0.1,-0.88>)) + " " + B(llAngleBetween(<0.7,0.1,-0.3,0.64>, <0,0,0.38268343,0.92387953>))
            + " " + B(llAngleBetween(<1,2,3,4>, <0.01,0.02,0.03,0.999>)) + " " + B(llAngleBetween(<1,2,3,4>, <0.3,-0.3,0.3,-0.3>))
            + " " + B(llAngleBetween(<0,0,0,2>, <0,0,2,0>)));
        }
      }`)
    // In-world: 38 pairs of rotations in the second math probe, as exact floats. All 38 agree
    // with the products added in the order s, x, y, z as floats. Adding x, y, z, s is off by up
    // to 8 floats in four of them, the first pair here among them.
    expect(said(s)).toEqual(['8454995p-24 12013800p-24 13372492p-23 9009732p-22 11989060p-23 11636613p-22 13176795p-22'])
  })

  it('llRot2Euler keeps the stepped angle as a float of degrees', async () => {
    const s = await run(EXACT + `
      default {
        state_entry() {
          float h = 8.7266463e-10;
          list ks = [1, 2, 3, 100, 1000];
          integer i;
          string out;
          for (i = 0; i < 5; ++i) {
            vector e = llRot2Euler(<llList2Integer(ks, i) * h, 0, 0, 1>);
            out += B(e.x) + " ";
          }
          llSay(0, out);
        }
      }`)
    // In-world: turns of 1, 2, 3, 100 and 1000 steps of 1e-7 degrees about x, as exact floats.
    // One step reads 15720529 * 2^-53, the float above the nearest one to 1e-7 degrees in
    // radians. 42 single-axis turns were measured, and the 37 under 0.1 degrees agree with the
    // step count over 1e7 rounded to a float of degrees, then times PI / 180 in double precision.
    expect(said(s)).toEqual(['15720529p-53 15720529p-52 11790397p-51 12281662p-46 15352078p-43 '])
  })
})

// Shapes by number: 0 box, 1 box cut 0.25 to 0.75, 2 hollow box, 3 hollow box cut 0.25 to 0.75,
// 4 box cut 0.5 to 1, 5 box cut 0 to 0.5, 6 cylinder, 7 hollow cylinder cut 0.25 to 0.75, 8 prism,
// 9 sphere, 10 hollow sphere with cut and dimple, 11 torus, 12 hollow torus with both cuts,
// 13 tube, 14 ring, 15 hollow tube with both cuts, 16 prism cut 0.5 to 1, 17 prism cut 0 to 0.5,
// 20 to 25 sculpts of each type.
const SHAPES = `
  string MAP = "89556747-24cb-43ed-920b-47caed15465f";
  list shape(integer k) {
      vector Z = ZERO_VECTOR;
      if (k == 0) return [PRIM_TYPE_BOX, 0, <0,1,0>, 0.0, Z, <1,1,0>, Z];
      if (k == 1) return [PRIM_TYPE_BOX, 0, <0.25,0.75,0>, 0.0, Z, <1,1,0>, Z];
      if (k == 2) return [PRIM_TYPE_BOX, 0, <0,1,0>, 0.5, Z, <1,1,0>, Z];
      if (k == 3) return [PRIM_TYPE_BOX, 0, <0.25,0.75,0>, 0.5, Z, <1,1,0>, Z];
      if (k == 4) return [PRIM_TYPE_BOX, 0, <0.5,1,0>, 0.0, Z, <1,1,0>, Z];
      if (k == 5) return [PRIM_TYPE_BOX, 0, <0,0.5,0>, 0.0, Z, <1,1,0>, Z];
      if (k == 6) return [PRIM_TYPE_CYLINDER, 0, <0,1,0>, 0.0, Z, <1,1,0>, Z];
      if (k == 7) return [PRIM_TYPE_CYLINDER, 0, <0.25,0.75,0>, 0.5, Z, <1,1,0>, Z];
      if (k == 8) return [PRIM_TYPE_PRISM, 0, <0,1,0>, 0.0, Z, <1,1,0>, Z];
      if (k == 9) return [PRIM_TYPE_SPHERE, 0, <0,1,0>, 0.0, Z, <0,1,0>];
      if (k == 10) return [PRIM_TYPE_SPHERE, 0, <0.25,0.75,0>, 0.5, Z, <0.2,0.8,0>];
      if (k == 11) return [PRIM_TYPE_TORUS, 0, <0,1,0>, 0.0, Z, <1,0.25,0>, Z, <0,1,0>, Z, 1.0, 0.0, 0.0];
      if (k == 12) return [PRIM_TYPE_TORUS, 0, <0.25,0.75,0>, 0.5, Z, <1,0.25,0>, Z, <0.25,0.75,0>, Z, 1.0, 0.0, 0.0];
      if (k == 13) return [PRIM_TYPE_TUBE, 0, <0,1,0>, 0.0, Z, <1,0.25,0>, Z, <0,1,0>, Z, 1.0, 0.0, 0.0];
      if (k == 14) return [PRIM_TYPE_RING, 0, <0,1,0>, 0.0, Z, <1,0.25,0>, Z, <0,1,0>, Z, 1.0, 0.0, 0.0];
      if (k == 15) return [PRIM_TYPE_TUBE, 0, <0.25,0.75,0>, 0.5, Z, <1,0.25,0>, Z, <0.25,0.75,0>, Z, 1.0, 0.0, 0.0];
      if (k == 16) return [PRIM_TYPE_PRISM, 0, <0.5,1,0>, 0.0, Z, <1,1,0>, Z];
      if (k == 17) return [PRIM_TYPE_PRISM, 0, <0,0.5,0>, 0.0, Z, <1,1,0>, Z];
      if (k == 20) return [PRIM_TYPE_SCULPT, MAP, PRIM_SCULPT_TYPE_SPHERE];
      if (k == 21) return [PRIM_TYPE_SCULPT, MAP, PRIM_SCULPT_TYPE_TORUS];
      if (k == 22) return [PRIM_TYPE_SCULPT, MAP, PRIM_SCULPT_TYPE_PLANE];
      if (k == 23) return [PRIM_TYPE_SCULPT, MAP, PRIM_SCULPT_TYPE_CYLINDER];
      if (k == 24) return [PRIM_TYPE_SCULPT, MAP, PRIM_SCULPT_TYPE_SPHERE | PRIM_SCULPT_FLAG_INVERT | PRIM_SCULPT_FLAG_MIRROR];
      return [PRIM_TYPE_SCULPT, MAP, PRIM_SCULPT_TYPE_MESH];
  }
  set(integer k) { llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_TYPE] + shape(k)); }
  paint() {
      integer n = llGetNumberOfSides();
      integer f;
      list r;
      for (f = 0; f < n; ++f) r += [PRIM_COLOR, f, <(f + 1) * 0.1, 0, 0>, 1.0];
      llSetLinkPrimitiveParamsFast(LINK_THIS, r);
  }
  string faces() {
      list c = llGetLinkPrimitiveParams(LINK_THIS, [PRIM_COLOR, ALL_SIDES]);
      integer n = llGetListLength(c) / 2;
      integer f;
      string s = (string)llGetNumberOfSides() + ":";
      for (f = 0; f < n; ++f) {
          vector v = llList2Vector(c, f * 2);
          s += (string)(llRound(v.x * 10) - 1);
      }
      return s;
  }

  // Set shape a, give each face its own colour, set shape b, and say which face of a each
  // face of b shows.
  string pair(integer a, integer b) {
    set(a);
    paint();
    set(b);
    return (string)a + ">" + (string)b + "=" + faces();
  }
  string pairs(list ps) {
    integer k;
    list out;
    for (k = 0; k < llGetListLength(ps); k += 2) out += pair(llList2Integer(ps, k), llList2Integer(ps, k + 1));
    return llDumpList2String(out, " ");
  }
`

describe('faces kept by a shape change', () => {
  it('a sculpt takes the first outer side, and gives it to every face of the next shape', async () => {
    const s = await run(SHAPES + `
      default {
        state_entry() {
          integer k;
          list ps;
          for (k = 0; k <= 15; ++k) ps += [k, 20];
          for (k = 21; k <= 25; ++k) ps += [0, k];
          llSay(0, pairs(ps));
          list out;
          for (k = 0; k <= 15; ++k) {
            set(0); paint(); set(20);
            llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_COLOR, 0, <0.9, 0, 0>, 1.0]);
            set(k);
            out += "20>" + (string)k + "=" + faces();
          }
          llSay(0, llDumpList2String(out, " "));
        }
      }`)
    // In-world: the shape probe. Each result is the face count, then for each face the face of
    // the old shape it shows. A sculpt's one face shows the old shape's first outer side.
    // That is face 1 where the shape has a top (a box, a prism, a cylinder, and the cut and hollow
    // sphere, torus and tube) and face 0 of a plain sphere, torus, tube and ring. Every sculpt type does the same, and type 5 leaves the box as it
    // was. Going back, every face of the new shape shows the sculpt's face (8 here).
    expect(said(s)).toEqual([
      '0>20=1:1 1>20=1:1 2>20=1:1 3>20=1:1 4>20=1:1 5>20=1:1 6>20=1:1 7>20=1:1 8>20=1:1 9>20=1:0 10>20=1:1 11>20=1:0 12>20=1:1 13>20=1:0 14>20=1:0 15>20=1:1 0>21=1:1 0>22=1:1 0>23=1:1 0>24=1:1 0>25=6:012345',
      '20>0=6:888888 20>1=6:888888 20>2=7:8888888 20>3=7:8888888 20>4=6:888888 20>5=6:888888 20>6=3:888 20>7=6:888888 20>8=5:88888 20>9=1:8 20>10=6:888888 20>11=1:8 20>12=6:888888 20>13=4:8888 20>14=3:888 20>15=7:8888888',
    ])
  })

  it('an outer side keeps its index, and new faces copy the bottom or the first outer side', async () => {
    const s = await run(SHAPES + `
      default {
        state_entry() {
          llSay(0, pairs([1, 2, 1, 3, 2, 3, 2, 1, 13, 15, 11, 12, 9, 10, 16, 0, 0, 16, 16, 8, 8, 16, 12, 0, 15, 13, 3, 2, 3, 1, 10, 11, 7, 6, 6, 7, 14, 15, 15, 14, 4, 2, 2, 4, 17, 0, 0, 17, 16, 17, 17, 16, 12, 11, 10, 9, 15, 0, 0, 15, 0, 12, 0, 7]));
          llSay(0, pairs([0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6, 0, 8, 0, 9, 0, 10, 0, 11, 0, 13, 0, 14, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 4, 5, 5, 4, 6, 0, 7, 0, 8, 0]));
          llSay(0, pairs([9, 0, 10, 0, 10, 9, 11, 0, 12, 0, 13, 0, 14, 0, 15, 0, 6, 8, 8, 6, 13, 14, 14, 13, 9, 11, 11, 9, 3, 7, 7, 3, 3, 15, 15, 3, 12, 15, 3, 10, 10, 3]));
        }
      }`)
    // In-world: the shape probe, for pairs of shapes without a sculpt. An outer side shows the
    // old outer side with the same index, counted along the shape's own profile, so the four
    // sides of a box show sides 1, 2, 3, 3 of a prism. Where the old shape has no side with that
    // index it shows the nearest one. A new top, bottom or hollow face shows the old bottom. New
    // cut faces show the old hollow face, or the bottom when there is none. A tube and a ring have
    // no bottom, and a box made from one shows their face 0 on its top and bottom.
    expect(said(s)).toEqual([
      '1>2=7:0112233 1>3=7:0123345 2>3=7:0235655 2>1=6:023655 13>15=7:0120000 11>12=6:000000 9>10=6:000000 16>0=6:011223 0>16=6:023555 16>8=5:01123 8>16=6:023444 12>0=6:011113 15>13=4:1122 3>2=7:0112234 3>1=6:012456 10>11=1:1 7>6=3:013 6>7=6:012222 14>15=7:0120000 15>14=3:112 4>2=7:0111233 2>4=6:034655 17>0=6:012223 0>17=6:012555 16>17=6:011345 17>16=6:022345 12>11=1:1 10>9=1:1 15>0=6:011224 0>15=7:0235555 0>12=6:015555 0>7=6:015555',
      '0>1=6:023555 0>2=7:0123455 0>3=7:0235555 0>4=6:034555 0>5=6:012555 0>6=3:015 0>8=5:01235 0>9=1:1 0>10=6:015555 0>11=1:1 0>13=4:1234 0>14=3:123 1>0=6:011223 2>0=6:012346 3>0=6:011224 4>0=6:011123 5>0=6:012223 4>5=6:011345 5>4=6:022345 6>0=6:011112 7>0=6:011113 8>0=6:012334',
      '9>0=6:000000 10>0=6:011113 10>9=1:1 11>0=6:000000 12>0=6:011113 13>0=6:001230 14>0=6:001220 15>0=6:011224 6>8=5:01112 8>6=3:014 13>14=3:012 14>13=4:0122 9>11=1:0 11>9=1:0 3>7=6:013456 7>3=7:0112345 3>15=7:0123456 15>3=7:0123456 12>15=7:0112345 3>10=6:013456 10>3=7:0112345',
    ])
  })
})

describe('rotations too small to read', () => {
  it('llRot2Angle, llRot2Axis and llAngleBetween give zero under a half-angle sine of 0.0005', async () => {
    const s = await run(EXACT + `
      default {
        state_entry() {
          float u = 5.9604645e-8;
          integer k;
          for (k = 0; k <= 10; ++k) {
            rotation q = <0.0003, 0, 0, 1.0 - k * u>;
            llSay(0, "A=" + B(llRot2Angle(q)) + " X=" + BV(llRot2Axis(q)) + " B=" + B(llAngleBetween(ZERO_ROTATION, q)));
          }
        }
      }`)
    // In-world: s steps down from 1 one float at a time. These rotations are within 1e-6 of unit
    // length, so they are not normalised. Two floats below 1 the sine sqrt(1 - s * s) is 0.000488
    // and all three functions give zero. Three floats below 1 it is 0.000598 and they give
    // 0.0012 radians.
    expect(said(s)).toEqual(['A=0 X=<0,0,0> B=0', 'A=0 X=<0,0,0> B=0', 'A=0 X=<0,0,0> B=0', 'A=10273905p-33 X=<8416383p-24,0,0> B=10273905p-33', 'A=11863283p-33 X=<14577603p-25,0,0> B=11863283p-33', 'A=13263554p-33 X=<13038604p-25,0,0> B=13263554p-33', 'A=14529496p-33 X=<11902563p-25,0,0> B=14529496p-33', 'A=15693649p-33 X=<11019632p-25,0,0> B=15693649p-33', 'A=8388608p-32 X=<10307922p-25,0,0> B=8388608p-32', 'A=8897463p-32 X=<9718403p-25,0,0> B=8897463p-32', 'A=9378749p-32 X=<9219686p-25,0,0> B=9378749p-32'])
  })

  it('llAngleBetween reads the dot product of two rotations the same way', async () => {
    const s = await run(EXACT + `
      default {
        state_entry() {
          float u = 5.9604645e-8;
          integer i; integer j;
          for (i = 0; i <= 4; ++i) {
            string s;
            for (j = 0; j <= 4; ++j) s += B(llAngleBetween(<0, 0, 0, 1.0 - i * u>, <0, 0, 0, 1.0 - j * u>)) + " ";
            s += "|";
            for (j = 0; j <= 4; ++j) s += " " + B(llAngleBetween(<0.0004, 0, 0, 1.0 - i * u>, <0.0004, 0, 0, 1.0 - j * u>));
            s += " |";
            for (j = 0; j <= 4; ++j) s += " " + B(llAngleBetween(<0, 0, 0.0004, -(1.0 - i * u)>, <0, 0.0003, 0, 1.0 - j * u>));
            llSay(0, s);
          }
          llSay(0, B(llAngleBetween(<0.6,0,0,0.8>, <0.6,0.0005,0,0.8>)) + " " + B(llAngleBetween(<0.6,0,0,0.8>, <0.6,0.001,0,0.8>))
            + " " + B(llAngleBetween(<0.6,0,0,0.8>, <0.6,0.0015,0,0.8>)) + " " + B(llAngleBetween(<0.6,0,0,0.8>, <0.6005,0,0,0.8>))
            + " " + B(llAngleBetween(<0.6,0,0,0.8>, <0.6003,0,0,0.7997>)) + " " + B(llAngleBetween(<0.6,0,0,0.8>, <0.6004,0,0,0.7997>))
            + " " + B(llAngleBetween(<0.6,0,0,0.8>, <-0.6004,0,0,-0.7997>)));
        }
      }`)
    // In-world: pairs of rotations whose s is 0 to 4 floats below 1, alone, with a small x in
    // both, and with opposite signs of s. The angle is zero until the dot product is three
    // floats below 1 (or above -1), whichever rotation the steps come from.
    expect(said(s)).toEqual(['0 0 0 10273905p-33 11863283p-33 | 0 0 0 0 0 | 0 0 0 10276864p-33 11866112p-33', '0 0 10273905p-33 11863283p-33 13263554p-33 | 0 0 0 0 0 | 0 0 10276864p-33 11866112p-33 13266944p-33', '0 10273905p-33 11863283p-33 13263554p-33 14529496p-33 | 0 0 0 0 10273905p-33 | 0 10276864p-33 11866112p-33 13266944p-33 14532608p-33', '10273905p-33 11863283p-33 13263554p-33 14529496p-33 15693649p-33 | 0 0 0 10273905p-33 11863283p-33 | 10276864p-33 11866112p-33 13266944p-33 14532608p-33 15695872p-33', '11863283p-33 13263554p-33 14529496p-33 15693649p-33 8388608p-32 | 0 0 10273905p-33 11863283p-33 13263554p-33 | 11866112p-33 13266944p-33 14532608p-33 15695872p-33 8388608p-32'].concat('0 0 12582913p-32 0 0 0 0'))
  })

  it('llRot2Axis turns the axis around for a negative s, zeros included', async () => {
    const s = await run(`
      default {
        state_entry() {
          llSay(0, (string)llRot2Axis(<0,0,0.7071068,-0.7071068>) + " " + llList2CSV([llRot2Axis(<0,0,0.7071068,-0.7071068>)]));
          llSay(0, (string)llRot2Axis(<0.5,0,0,-0.5>) + " " + llList2CSV([llRot2Axis(<0.5,0,0,-0.5>)]) + " " + (string)llRot2Axis(<0,0,1,0>) + " "
            + llList2CSV([llRot2Axis(<0,0,-1,0>), llRot2Axis(<0,0,1,-0.0001>), llRot2Axis(<0,0,-0.6,-0.8>)]));
        }
      }`)
    // In-world: the axis of a rotation with a negative s has negative zeros, through a string
    // cast and through llList2CSV alike.
    expect(said(s)).toEqual(['<-0.00000, -0.00000, -1.00000> <-0.000000, -0.000000, -1.000000>', '<-1.00000, -0.00000, -0.00000> <-1.000000, -0.000000, -0.000000> <0.00000, 0.00000, 1.00000> <0.000000, 0.000000, -1.000000>, <-0.000000, -0.000000, -1.000000>, <-0.000000, -0.000000, 1.000000>'])
  })

  it('llVecNorm gives a zero vector when the length is too large for a float', async () => {
    const s = await run(EXACT + `
      default {
        state_entry() {
          llSay(0, BV(llVecNorm(<3e38,3e38,3e38>)) + " " + llList2CSV([llVecMag(<3e38,3e38,3e38>), llVecDist(<3e38,0,0>, <-3e38,0,0>), llVecNorm(<3e38,0,0>), llVecNorm(<2e38,2e38,0>)]));
        }
      }`)
    // In-world: under Mono the length of <3e38, 3e38, 3e38> is over the largest float, so
    // llVecMag gives inf and llVecNorm a zero vector. <2e38, 2e38, 0> still fits.
    expect(said(s)).toEqual(['<0,0,0> inf, inf, <1.000000, 0.000000, 0.000000>, <0.707107, 0.707107, 0.000000>'])
  })
})

describe('a negative link number', () => {
  const source = `
    default {
      state_entry() {
        list links = [LINK_SET, LINK_ALL_OTHERS, LINK_ALL_CHILDREN, -5, -99, 0, 1, 2, 3, 4];
        integer i;
        string s;
        for (i = 0; i < 10; ++i) {
          integer link = llList2Integer(links, i);
          key k = llGetLinkKey(link);
          integer which = -1;
          if (k == NULL_KEY) which = 0;
          else if (k == llGetLinkKey(1)) which = 1;
          else if (k == llGetLinkKey(2)) which = 2;
          else if (k == llGetLinkKey(3)) which = 3;
          s += llGetLinkName(link) + "/" + (string)which + " ";
        }
        llSay(0, s);
      }
    }`
  const NONE = '00000000-0000-0000-0000-000000000000/0 '

  it('names the first prim that is not the caller in llGetLinkName and llGetLinkKey', async () => {
    const { scripts } = await loadLinkset({
      prims: [1, 2, 3].map((i) => ({ name: `t${i}`, scripts: [{ name: `s${i}`, source: { source, filename: 'probe.lsl' } }] })),
    })
    for (const s of Object.values(scripts)) s.start()
    // In-world: three linked boxes named t1 to t3 with the probe in each. From the root every
    // negative link other than LINK_THIS is link 2, and from a child it is the root.
    expect(said(scripts.s1!)).toEqual(['t2/2 '.repeat(5) + NONE + 't1/1 t2/2 t3/3 ' + NONE])
    expect(said(scripts.s2!)).toEqual(['t1/1 '.repeat(5) + 't1/1 t1/1 t2/2 t3/3 ' + NONE])
    expect(said(scripts.s3!)).toEqual(['t1/1 '.repeat(5) + 't1/1 t1/1 t2/2 t3/3 ' + NONE])
  })

  it('names no prim in a lone prim', async () => {
    const s = await loadScript({ source })
    s.start()
    // In-world: the same probe in a lone box. Only link 0 gives its name and key.
    const [line] = said(s)
    expect(line!.split(' ').slice(0, 5).join(' ') + ' ').toBe(NONE.repeat(5))
    expect(line!.split(' ').slice(6).join(' ')).toBe(NONE.repeat(4))
    expect(line!.split(' ')[5]).toMatch(/\/-1$/)
  })
})
