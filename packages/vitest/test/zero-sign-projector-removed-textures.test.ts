import { describe, it, expect } from 'vitest'
import { loadLinkset, loadScript, makeInventoryItem, InventoryType, DEBUG_CHANNEL } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlFabs
// https://wiki.secondlife.com/wiki/LlVecNorm
// https://wiki.secondlife.com/wiki/LlRot2Euler
// https://wiki.secondlife.com/wiki/LlListStatistics
// https://wiki.secondlife.com/wiki/LlJson2List
// https://wiki.secondlife.com/wiki/LlSetPrimitiveParams
// https://wiki.secondlife.com/wiki/LlRemoveInventory
// In-world: SLua Tideland on Aditi (2026-11-13), in 0.5 m boxes made with object.create, with
// scripts compiled for Mono unless a test says otherwise. Results were said on a channel, and a
// listener on DEBUG_CHANNEL caught the script errors.

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

const said = (s: { chat: ReadonlyArray<{ channel: number; text: string }> }, channel = 0) =>
  s.chat.filter((c) => c.channel === channel).map((c) => c.text)

const PLYWOOD = '89556747-24cb-43ed-920b-47caed15465f'
const BLANK = '5748decc-f629-461c-9a36-a35a221fe21f'
const SCULPT_DEFAULT = 'be293869-d0d9-0a69-5989-ad27f1946fd4'
const NULL_KEY = '00000000-0000-0000-0000-000000000000'
const KEY_A = 'cd05f49b-0ba4-b8c7-f55b-5a6518a03c64'
const KEY_B = 'bc027483-b60b-ce87-c7f7-ea3ac6f26e5b'
const KEY_M = 'c89e5f8d-18ce-bb29-72f4-c64b9d8033de'
const DEFAULT_MAP = '<1.000000, 1.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, 0.000000'

describe('the sign of zero in math functions', () => {
  it('llFabs keeps a negative zero, and llSin, llTan and llFrand do not', async () => {
    const s = await run(`
      default {
        state_entry() {
          float nz = 0.0 * -1.0;
          llSay(0, llList2CSV([llFabs(nz), llFabs(-0.0), llFabs(-1.5), llFabs(0.0), llSqrt(nz), llAsin(nz)]));
          llSay(0, llList2CSV([llSin(nz), llSin(-0.0), llTan(nz), llFrand(nz), llFrand(-0.0), llSin(0.0)]));
          llSay(0, llList2CSV([llSin(-1e-30), llTan(-1e-30), llAsin(-1e-30), llAtan2(-1e-30, 1.0), llSin(-PI), llSin(PI), llFrand(-1e-30)]));
          llSay(0, llList2CSV([llAtan2(nz, 1.0), llAtan2(nz, -1.0), llPow(nz, 1.0), llPow(nz, 3.0), llPow(-1e-30, 3.0), llCos(nz), llAcos(nz)]));
        }
      }`)
    // In-world: the zero sign probe. llFabs, llSqrt and llAsin gave back the negative zero.
    // llSin, llTan and llFrand of a negative zero gave 0.0, and of -1e-30 a negative value that
    // prints as -0.000000. llAtan2 and llPow already matched.
    expect(said(s)).toEqual([
      '-0.000000, -0.000000, 1.500000, 0.000000, -0.000000, -0.000000',
      '0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000',
      '-0.000000, -0.000000, -0.000000, -0.000000, 0.000000, -0.000000, -0.000000',
      '0.000000, -3.141593, 0.000000, 0.000000, -0.000000, 1.000000, 1.570796',
    ])
  })

  it('ll.Sin and ll.Tan keep a negative zero in SLua', async () => {
    const s = await runSlua(`
      local nz = 0.0 * -1.0
      ll.Say(0, \`{ll.Fabs(nz)} {ll.Sqrt(nz)} {ll.Sin(nz)} {ll.Tan(nz)} {ll.Asin(nz)} {ll.Atan2(nz, 1.0)} {ll.Pow(nz, 1.0)} {ll.Frand(nz)}\`)`)
    // In-world: the same calls from an SLua script, printed with tostring. The same LSL script
    // compiled to Luau also kept the negative zero from llSin and llTan.
    expect(said(s)).toEqual(['-0 -0 -0 -0 -0 0 0 0'])
  })

  it('llVecNorm gives a zero vector for a magnitude of 1e-7 or less', async () => {
    const s = await run(`
      default {
        state_entry() {
          float nz = 0.0 * -1.0;
          llSay(0, llList2CSV([llVecNorm(<-1e-6, 0, 0>), llVecNorm(<-2e-7, 0, 0>), llVecNorm(<-1.1e-7, 0, 0>)]));
          llSay(0, llList2CSV([llVecNorm(<-1e-7, 0, 0>), llVecNorm(<-9e-8, 0, 0>), llVecNorm(<-1e-8, 0, 0>), llVecNorm(<-1e-30, 0, 0>)]));
          llSay(0, llList2CSV([llVecNorm(<-7e-8, 7e-8, 7e-8>), llVecNorm(<-5e-8, 5e-8, 5e-8>)]));
          llSay(0, llList2CSV([llVecNorm(<nz, nz, nz>), llVecNorm(<1.0, nz, nz>), llVecNorm(<-1e30, 0, 0>), llVecNorm(<1e20, 1e20, 0>), llVecNorm(<1, 2, 3>)]));
          llSay(0, llList2CSV([llVecMag(<1e-20, 0, 0>) * 1e20, llVecDist(<1e-23, 0, 0>, ZERO_VECTOR) * 1e23, llVecMag(<1e30, 0, 0>), llVecMag(<nz, nz, nz>)]));
        }
      }`)
    // In-world: the vector length probe. A vector no longer than 1e-7 normalised to
    // ZERO_VECTOR, with positive zeros. llVecMag and llVecDist had no such limit.
    expect(said(s)).toEqual([
      '<-1.000000, 0.000000, 0.000000>, <-1.000000, 0.000000, 0.000000>, <-1.000000, 0.000000, 0.000000>',
      '<0.000000, 0.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, <0.000000, 0.000000, 0.000000>',
      '<-0.577350, 0.577350, 0.577350>, <0.000000, 0.000000, 0.000000>',
      '<0.000000, 0.000000, 0.000000>, <1.000000, -0.000000, -0.000000>, <-1.000000, 0.000000, 0.000000>, <0.707107, 0.707107, 0.000000>, <0.267261, 0.534522, 0.801784>',
      '1.000000, 1.000000, 1000000015047466219876688855040.000000, 0.000000',
    ])
  })

  it('llRot2Euler gives angles in steps of 1e-7 degrees, so never a negative zero', async () => {
    const s = await run(`
      string e(rotation q) { vector a = llRot2Euler(q); return llList2CSV([a.x * 1e30, a.y * 1e30, a.z * 1e30]); }
      default {
        state_entry() {
          float nz = 0.0 * -1.0;
          llSay(0, llList2CSV([llRot2Euler(<nz, nz, nz, 1.0>), llRot2Euler(<-0.0, -0.0, -0.0, -1.0>), llRot2Euler(<-1e-30, -1e-30, -1e-30, 1.0>)]));
          llSay(0, llList2CSV([llRot2Euler(<-1e-10, -1e-10, -1e-10, 1.0>), llRot2Euler(<1e-10, 1e-10, 1e-10, 1.0>), llRot2Euler(<-1e-9, -1e-9, -1e-9, 1.0>)]));
          llSay(0, llList2CSV([llRot2Euler(<nz, 0.70710678, nz, 0.70710678>), llRot2Euler(<nz, -0.70710678, nz, 0.70710678>), llRot2Euler(<-0.1, 0.0, 0.0, 1.0>), llRot2Euler(<-1e-6, -1e-6, -1e-6, 1.0>)]));
          llSay(0, e(<-1e-7, -1e-7, -1e-7, 1.0>));
          llSay(0, e(<-1e-8, -1e-8, -1e-8, 1.0>));
          llSay(0, e(<-3e-8, 0.0, 0.0, 1.0>) + " " + e(<-6e-8, 0.0, 0.0, 1.0>));
          llSay(0, e(<-2e-8, 0.0, 0.0, 1.0>) + " " + e(<-4e-8, 0.0, 0.0, 1.0>));
          llSay(0, e(<-5e-8, 0.0, 0.0, 1.0>) + " " + e(<-2.9e-8, 0.0, 0.0, 1.0>) + " " + e(<-3.1e-8, 0.0, 0.0, 1.0>));
          llSay(0, e(<-1e-10, 0.0, 0.0, 2.0>) + " " + e(<0.0, 0.0, -1e-30, 1.0>));
        }
      }`)
    // In-world: the small rotation probe printed each angle times 1e30. A turn of 2e-7 radians
    // came back as 1.15e-5 degrees, 2e-8 as 1.1e-6, 6e-8 as 3.4e-6 and 2e-9 as 1e-7, and anything
    // under 5e-8 degrees as 0.0 with a positive sign, under Mono and compiled to Luau alike.
    // The grid's 1e-7 degrees is one float above the nearest float, so that row is read through
    // llList2CSV only.
    expect(said(s)).toEqual([
      '<0.000000, 0.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, <0.000000, 0.000000, 0.000000>',
      '<0.000000, 0.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, <-0.000000, -0.000000, -0.000000>',
      '<0.000000, 1.570796, 0.000000>, <0.000000, -1.570796, 0.000000>, <-0.199337, 0.000000, 0.000000>, <-0.000002, -0.000002, -0.000002>',
      '-200712861341743388295168.000000, -200712861341743388295168.000000, -200712861341743388295168.000000',
      '-19198622283298869608448.000000, -19198622283298869608448.000000, -19198622283298869608448.000000',
      '-59341194101287584530432.000000, 0.000000, 0.000000 -120427713202166331080704.000000, 0.000000, 0.000000',
      '-40142574069788528607232.000000, 0.000000, 0.000000 -80285148139577057214464.000000, 0.000000, 0.000000',
      '-99483768171076113137664.000000, 0.000000, 0.000000 -57595864598096795140096.000000, 0.000000, 0.000000 -62831853107669163311104.000000, 0.000000, 0.000000',
      '0.000000, 0.000000, 0.000000 0.000000, 0.000000, 0.000000',
    ])
  })

  it('llListStatistics gives the first of equal maximums and minimums', async () => {
    const s = await run(`
      float st(integer op, list l) { return llListStatistics(op, l); }
      default {
        state_entry() {
          float nz = 0.0 * -1.0;
          llSay(0, llList2CSV([st(LIST_STAT_MAX, [0.0, nz]), st(LIST_STAT_MAX, [nz, 0.0]), st(LIST_STAT_MAX, [nz]), st(LIST_STAT_MAX, [-1.0, nz]), st(LIST_STAT_MAX, [-2.0, -1.0])]));
          llSay(0, llList2CSV([st(LIST_STAT_MIN, [0.0, nz]), st(LIST_STAT_MIN, [nz, 0.0]), st(LIST_STAT_MIN, [1.0, nz]), st(LIST_STAT_MEDIAN, [nz, nz]), st(LIST_STAT_SUM, [nz, nz]), st(LIST_STAT_MEAN, [nz, nz]), st(LIST_STAT_RANGE, [nz])]));
        }
      }`)
    // In-world: the zero sign probe. rezless gave the last of two equal maximums.
    expect(said(s)).toEqual([
      '0.000000, -0.000000, -0.000000, -0.000000, -1.000000',
      '0.000000, -0.000000, -0.000000, -0.000000, 0.000000, 0.000000, 0.000000',
    ])
  })
})

describe('llJson2List floats', () => {
  const J = (body: string) => `
    string j(string s) {
      list l = llJson2List("[" + s + "]");
      return (string)llGetListEntryType(l, 0) + " " + llList2CSV(l) + " " + llList2String(l, 0) + " " + llJsonGetValue("[" + s + "]", [0]) + " " + llList2Json(JSON_ARRAY, l);
    }
    default { state_entry() { ${body} } }`

  it('are 32-bit, and one beyond the float range is an infinity', async () => {
    const s = await run(J(`
      llSay(0, j("123456.789")); llSay(0, j("16777217.0")); llSay(0, j("16777217")); llSay(0, j("1e40")); llSay(0, j("-1e40"));
      llSay(0, j("3.4028235e38")); llSay(0, j("3.4028236e38")); llSay(0, j("3.5e38")); llSay(0, j("123456789.123"));
      llSay(0, j("0.1")); llSay(0, j("-0.0")); llSay(0, j("1e-46")); llSay(0, j("2147483648")); llSay(0, j("1E2"));`))
    // In-world: the JSON float probe, the same under Mono and compiled to Luau. llJsonGetValue
    // kept the text of the number.
    expect(said(s)).toEqual([
      '2 123456.789062 123456.800000 123456.789 [123456.789062]',
      '2 16777216.000000 16777220.000000 16777217.0 [16777216.000000]',
      '1 16777217 16777217 16777217 [16777217]',
      '2 inf Infinity 1e40 [inf]',
      '2 -inf -Infinity -1e40 [-inf]',
      '2 340282346638528859811704183484516925440.000000 340282300000000000000000000000000000000.000000 3.4028235e38 [340282346638528859811704183484516925440.000000]',
      '2 inf Infinity 3.4028236e38 [inf]',
      '2 inf Infinity 3.5e38 [inf]',
      '2 123456792.000000 123456800.000000 123456789.123 [123456792.000000]',
      '2 0.100000 0.100000 0.1 [0.100000]',
      '2 -0.000000 -0.000000 -0.0 [-0.000000]',
      '2 0.000000 0.000000 1e-46 [0.000000]',
      '1 2147483647 2147483647 2147483648 [2147483647]',
      '2 100.000000 100.000000 1E2 [100.000000]',
    ])
  })

  it('equal the same float literal, in objects and as a top-level number too', async () => {
    const s = await run(`
      default {
        state_entry() {
          list l = llJson2List("[123456.789]");
          llSay(0, (string)llListFindList(l, [123456.789]) + " " + (string)(llList2Float(l, 0) == 123456.789) + " " + llList2CSV([llList2Float(l, 0) - 123456.789]));
          llSay(0, llList2CSV(llJson2List("{\\"a\\":123456.789,\\"b\\":[0.1,123456.789],\\"c\\":{\\"d\\":0.10}}")));
          llSay(0, llList2CSV(llJson2List("123456.789")) + " " + (string)llGetListEntryType(llJson2List("123456.789"), 0));
        }
      }`)
    // In-world: the JSON float probe. Nested arrays and objects kept their text.
    expect(said(s)).toEqual([
      '0 1 0.000000',
      'a, 123456.789062, b, [0.1,123456.789], c, {"d":0.10}',
      '123456.789062 2',
    ])
  })

  it('are 32-bit in SLua', async () => {
    const s = await runSlua(`
      local l = ll.Json2List("[123456.789,-0.0,1e40]")
      ll.Say(0, \`{l[1]} {l[2]} {l[3]}\`)`)
    // In-world: the same from an SLua script, printed with tostring.
    expect(said(s)).toEqual(['123456.7890625 -0 inf'])
  })
})

const LINKED = (source: string, inventory: ReturnType<typeof makeInventoryItem>[] = []) =>
  loadLinkset({
    prims: [{ inventory, scripts: [{ name: 'probe', source: { source } }] }, {}],
  })

describe('PRIM_PROJECTOR', () => {
  it('reads back nothing and ends the read, with or without a light', async () => {
    const { scripts } = await LINKED(`
      string g() {
        list a = llGetPrimitiveParams([PRIM_PROJECTOR]);
        list b = llGetLinkPrimitiveParams(LINK_THIS, [PRIM_PROJECTOR]);
        list c = llGetLinkPrimitiveParams(2, [PRIM_PROJECTOR]);
        return (string)llGetListLength(a) + (string)llGetListLength(b) + (string)llGetListLength(c)
          + " [" + llList2CSV(llGetPrimitiveParams([PRIM_PROJECTOR, PRIM_MATERIAL])) + "]"
          + " [" + llList2CSV(llGetPrimitiveParams([PRIM_MATERIAL, PRIM_PROJECTOR, PRIM_PHANTOM])) + "]"
          + " [" + llList2CSV(llGetLinkPrimitiveParams(1, [PRIM_PROJECTOR, PRIM_LINK_TARGET, 2, PRIM_PROJECTOR, PRIM_MATERIAL])) + "]";
      }
      default {
        state_entry() {
          llSay(0, g());
          llSetPrimitiveParams([PRIM_POINT_LIGHT, TRUE, <1.0, 0.5, 0.25>, 0.8, 7.0, 0.6]);
          llSay(0, g());
          llSetPrimitiveParams([PRIM_PROJECTOR, "${PLYWOOD}", 1.5, 2.5, 0.3, PRIM_MATERIAL, PRIM_MATERIAL_GLASS]);
          llSay(0, g());
          llSetPrimitiveParams([PRIM_PROJECTOR, "ptex A", 1.0, 3.0, 0.5, PRIM_MATERIAL, PRIM_MATERIAL_METAL]);
          llSay(0, g());
          llSetPrimitiveParams([PRIM_PROJECTOR, "no such texture", 1.0, 3.0, 0.5, PRIM_MATERIAL, PRIM_MATERIAL_FLESH]);
          llSay(0, g());
          llSetLinkPrimitiveParamsFast(2, [PRIM_POINT_LIGHT, TRUE, <0.25, 0.5, 1.0>, 0.5, 3.0, 0.2, PRIM_PROJECTOR, "${PLYWOOD}", 2.0, 4.0, 0.1]);
          llSay(0, g() + " " + llList2CSV(llGetLinkPrimitiveParams(2, [PRIM_POINT_LIGHT])));
          llSetPrimitiveParams([PRIM_POINT_LIGHT, FALSE, <1.0, 0.5, 0.25>, 0.8, 7.0, 0.6]);
          llSay(0, g());
          llSetPrimitiveParams([PRIM_PROJECTOR, "", 0.0, 0.0, 0.0, PRIM_MATERIAL, PRIM_MATERIAL_WOOD]);
          llSay(0, g());
          llSetPrimitiveParams([PRIM_PROJECTOR, NULL_KEY, 0.5, 0.5, 0.5, PRIM_MATERIAL, PRIM_MATERIAL_PLASTIC]);
          llSay(0, g());
        }
      }`, [makeInventoryItem({ name: 'ptex A', type: InventoryType.TEXTURE, key: KEY_A })])
    const s = scripts.probe!
    s.start()
    // In-world: the projector probe in the root of two linked boxes, with an uploaded texture
    // "ptex A" in the root. llGetPrimitiveParams and llGetLinkPrimitiveParams gave an empty list
    // for PRIM_PROJECTOR in every state, and nothing for the rules after it either. The setter
    // took its four values each time, as the PRIM_MATERIAL after it was applied, and said no
    // error for a name that is not in the prim.
    expect(said(s)).toEqual([
      '000 [] [3] []',
      '000 [] [3] []',
      '000 [] [2] []',
      '000 [] [1] []',
      '000 [] [4] []',
      '000 [] [4] [] 1, <0.250980, 0.501961, 1.000000>, 0.501961, 3.000000, 0.200000',
      '000 [] [4] []',
      '000 [] [3] []',
      '000 [] [5] []',
    ])
    expect(said(s, DEBUG_CHANNEL)).toEqual([])
  })

  it('reads back nothing in SLua', async () => {
    const s = await runSlua(`ll.Say(0, tostring(#ll.GetPrimitiveParams({PRIM_PROJECTOR})))`)
    // In-world: the same from an SLua script.
    expect(said(s)).toEqual(['0'])
  })
})

describe('PRIM_POINT_LIGHT and PRIM_REFLECTION_PROBE', () => {
  it('a light clamps its values, keeps colour and intensity in 8 bits, and reads zeros when off', async () => {
    const s = await run(`
      string l(list p) { llSetPrimitiveParams([PRIM_POINT_LIGHT] + p); return llList2CSV(llGetPrimitiveParams([PRIM_POINT_LIGHT])); }
      default {
        state_entry() {
          llSay(0, llList2CSV(llGetPrimitiveParams([PRIM_POINT_LIGHT])));
          llSay(0, l([TRUE, <2.0, -1.0, 0.5>, 2.0, 100.0, 5.0]));
          llSay(0, l([TRUE, <0.3, 0.3, 0.3>, -1.0, -1.0, -1.0]));
          llSay(0, l([TRUE, <1.0, 1.0, 1.0>, 0.001, 0.05, 0.001]));
          llSay(0, l([TRUE, <0.3, 0.3, 0.3>, 0.3, 0.123456, 1.234567]));
          llSay(0, l([TRUE, <1.0, 0.5, 0.25>, 0.8, 7.0, 0.6]));
          llSay(0, l([2, <1.0, 1.0, 1.0>, 1, 10, 1]));
          llSay(0, l([-1, <0.5, 0.5, 0.5>, 0.999, 19.99, 1.99]));
          llSay(0, l([TRUE, <0.0, 0.0, 0.0>, 0.0, 0.0, 0.0]));
          llSay(0, l([FALSE, <0.5, 0.5, 0.5>, 0.5, 5.0, 0.5]));
          llSay(0, l([TRUE, <0.5, 0.5, 0.5>, 0.5, 5.0, 0.5]));
        }
      }`)
    // In-world: the light probe. Colour and intensity are clamped to 0..1 and stored in 8 bits,
    // radius is clamped to 0..20 and falloff to 0..2, and a light that is off read all zeros
    // whatever it was given.
    expect(said(s)).toEqual([
      '0, <0.000000, 0.000000, 0.000000>, 0.000000, 0.000000, 0.000000',
      '1, <1.000000, 0.000000, 0.501961>, 1.000000, 20.000000, 2.000000',
      '1, <0.301961, 0.301961, 0.301961>, 0.000000, 0.000000, 0.000000',
      '1, <1.000000, 1.000000, 1.000000>, 0.000000, 0.050000, 0.001000',
      '1, <0.301961, 0.301961, 0.301961>, 0.301961, 0.123456, 1.234567',
      '1, <1.000000, 0.501961, 0.250980>, 0.800000, 7.000000, 0.600000',
      '1, <1.000000, 1.000000, 1.000000>, 1.000000, 10.000000, 1.000000',
      '1, <0.501961, 0.501961, 0.501961>, 1.000000, 19.990000, 1.990000',
      '1, <0.000000, 0.000000, 0.000000>, 0.000000, 0.000000, 0.000000',
      '0, <0.000000, 0.000000, 0.000000>, 0.000000, 0.000000, 0.000000',
      '1, <0.501961, 0.501961, 0.501961>, 0.501961, 5.000000, 0.500000',
    ])
  })

  it('a reflection probe clamps its values, keeps three flag bits, and reads zeros when off', async () => {
    const s = await run(`
      string p(list q) { llSetPrimitiveParams([PRIM_REFLECTION_PROBE] + q); return llList2CSV(llGetPrimitiveParams([PRIM_REFLECTION_PROBE])); }
      default {
        state_entry() {
          llSay(0, llList2CSV(llGetPrimitiveParams([PRIM_REFLECTION_PROBE])));
          llSay(0, p([TRUE, 2.0, 5000.0, 255]));
          llSay(0, p([TRUE, -1.0, -1.0, -1]));
          llSay(0, p([TRUE, 0.123456, 0.01, 7]));
          llSay(0, p([TRUE, 1.0, 64.0, 4]));
          llSay(0, p([TRUE, 100.0, 1024.0, 8]));
          llSay(0, p([2, 0.5, 1.0, 1]));
          llSay(0, p([FALSE, 0.5, 1.0, 1]));
        }
      }`)
    // In-world: the light probe. A negative ambiance became 0.0 and 100.0 was kept, the clip
    // distance was clamped to 0..1024, the flags kept their low three bits, and a probe that
    // is off read all zeros.
    expect(said(s)).toEqual([
      '0, 0.000000, 0.000000, 0',
      '1, 2.000000, 1024.000000, 7',
      '1, 0.000000, 0.000000, 7',
      '1, 0.123456, 0.010000, 7',
      '1, 1.000000, 64.000000, 4',
      '1, 100.000000, 1024.000000, 0',
      '1, 0.500000, 1.000000, 1',
      '0, 0.000000, 0.000000, 0',
    ])
  })
})

const REMOVAL = `
  string keyA; string keyB; string keyM;
  integer step;
  string e(list l) { return llList2CSV(l) + ";t" + (string)llGetListEntryType(l, 0); }
  face(integer link, integer f) {
    llSay(0, (string)link + "/" + (string)f + " T=" + e(llGetLinkPrimitiveParams(link, [PRIM_TEXTURE, f])));
    llSay(0, " N=" + e(llGetLinkPrimitiveParams(link, [PRIM_NORMAL, f])));
    llSay(0, " S=" + e(llGetLinkPrimitiveParams(link, [PRIM_SPECULAR, f])));
  }
  setup() {
    llSetLinkPrimitiveParamsFast(LINK_THIS, [
      PRIM_TEXTURE, 0, "ptex A", <2.0, 3.0, 0.0>, <0.1, 0.2, 0.0>, 0.5,
      PRIM_NORMAL, 0, "ptex A", <2.0, 3.0, 0.0>, <0.1, 0.2, 0.0>, 0.5,
      PRIM_SPECULAR, 0, "ptex A", <2.0, 3.0, 0.0>, <0.1, 0.2, 0.0>, 0.5, <0.2, 0.4, 0.6>, 100, 50,
      PRIM_COLOR, 0, <0.2, 0.4, 0.6>, 0.5, PRIM_BUMP_SHINY, 0, PRIM_SHINY_HIGH, PRIM_BUMP_BRICKS, PRIM_ALPHA_MODE, 0, PRIM_ALPHA_MODE_MASK, 100,
      PRIM_GLOW, 0, 0.25, PRIM_FULLBRIGHT, 0, TRUE, PRIM_TEXGEN, 0, PRIM_TEXGEN_PLANAR,
      PRIM_TEXTURE, 1, keyA, <4.0, 5.0, 0.0>, <0.3, 0.4, 0.0>, 1.0,
      PRIM_NORMAL, 1, keyA, <4.0, 5.0, 0.0>, <0.3, 0.4, 0.0>, 1.0,
      PRIM_SPECULAR, 1, keyA, <4.0, 5.0, 0.0>, <0.3, 0.4, 0.0>, 1.0, <0.2, 0.4, 0.6>, 100, 50,
      PRIM_TEXTURE, 2, "ptex B", <6.0, 7.0, 0.0>, <0.25, 0.35, 0.0>, 1.5,
      PRIM_NORMAL, 2, "ptex B", <6.0, 7.0, 0.0>, <0.25, 0.35, 0.0>, 1.5,
      PRIM_SPECULAR, 2, "ptex B", <6.0, 7.0, 0.0>, <0.25, 0.35, 0.0>, 1.5, <0.6, 0.4, 0.2>, 200, 20,
      PRIM_TEXTURE, 3, "${BLANK}", <8.0, 9.0, 0.0>, <0.45, 0.4, 0.0>, 2.0,
      PRIM_NORMAL, 3, "${BLANK}", <8.0, 9.0, 0.0>, <0.45, 0.4, 0.0>, 2.0,
      PRIM_LINK_TARGET, 2,
      PRIM_TEXTURE, 0, keyA, <2.0, 3.0, 0.0>, <0.1, 0.2, 0.0>, 0.5,
      PRIM_NORMAL, 0, keyA, <2.0, 3.0, 0.0>, <0.1, 0.2, 0.0>, 0.5,
      PRIM_SPECULAR, 0, keyA, <2.0, 3.0, 0.0>, <0.1, 0.2, 0.0>, 0.5, <0.2, 0.4, 0.6>, 100, 50]);
  }`

const TEXTURES = () => [
  makeInventoryItem({ name: 'ptex A', type: InventoryType.TEXTURE, key: KEY_A }),
  makeInventoryItem({ name: 'ptex A2', type: InventoryType.TEXTURE, key: KEY_A }),
  makeInventoryItem({ name: 'ptex B', type: InventoryType.TEXTURE, key: KEY_B }),
  makeInventoryItem({ name: 'pmat', type: InventoryType.MATERIAL, key: KEY_M }),
]

const OBSERVER = `default { changed(integer c) { llSay(0, "observer " + (string)llGetLinkNumber() + " changed " + (string)c); } }`

const removalLinkset = (source: string) =>
  loadLinkset({
    prims: [
      { inventory: TEXTURES(), scripts: [{ name: 'probe', source: { source } }, { name: 'observer', source: { source: OBSERVER } }] },
      { scripts: [{ name: 'child', source: { source: OBSERVER } }] },
    ],
  })

const A_MAP = '<2.000000, 3.000000, 0.000000>, <0.100000, 0.200000, 0.000000>, 0.500000'
const A1_MAP = '<4.000000, 5.000000, 0.000000>, <0.300000, 0.400000, 0.000000>, 1.000000'
const B_MAP = '<6.000000, 7.000000, 0.000000>, <0.250000, 0.350000, 0.000000>, 1.500000'
const SPEC_DEFAULT = '<1.000000, 1.000000, 1.000000>, 51, 0'

describe('llRemoveInventory of a texture or material in use', () => {
  it('resets the faces of that prim that show the texture, whichever item is removed', async () => {
    const { scripts } = await removalLinkset(`${REMOVAL}
      default {
        state_entry() {
          keyA = (string)llGetInventoryKey("ptex A");
          setup();
          face(1, 0); face(1, 1); face(2, 0);
          llRemoveInventory("ptex A2");
          face(1, 0); face(1, 1); face(1, 2); face(1, 3); face(2, 0);
          llSay(0, llGetTexture(0) + " " + (string)llGetTextureOffset(0) + " " + (string)llGetTextureScale(0) + " " + (string)llGetTextureRot(0));
          llSay(0, llList2CSV(llGetPrimitiveParams([PRIM_COLOR, 0, PRIM_BUMP_SHINY, 0, PRIM_ALPHA_MODE, 0, PRIM_GLOW, 0, PRIM_FULLBRIGHT, 0, PRIM_TEXGEN, 0])));
          llSay(0, (string)llGetInventoryNumber(INVENTORY_TEXTURE) + " " + (string)llGetInventoryKey("ptex A"));
          llSetTimerEvent(5.0);
        }
        changed(integer c) { llSay(0, "changed " + (string)c); }
        timer() {
          llSetTimerEvent(0.0);
          llSetPrimitiveParams([PRIM_TEXTURE, 1, keyA, <4.0, 5.0, 0.0>, <0.3, 0.4, 0.0>, 1.0, PRIM_NORMAL, 1, keyA, <4.0, 5.0, 0.0>, <0.3, 0.4, 0.0>, 1.0]);
          llRemoveInventory("ptex A");
          face(1, 1);
          llSetPrimitiveParams([PRIM_TEXTURE, 1, keyA, <4.0, 5.0, 0.0>, <0.3, 0.4, 0.0>, 1.0, PRIM_NORMAL, 1, keyA, <4.0, 5.0, 0.0>, <0.3, 0.4, 0.0>, 1.0]);
          face(1, 1);
        }
      }`)
    const s = scripts.probe!
    for (const script of Object.values(scripts)) script!.start()
    s.advanceTime(30_000)
    // In-world: the removal probe, in the root of two linked boxes holding uploaded textures
    // "ptex A", a copy of it named "ptex A2" and "ptex B". Removing the copy reset every face of
    // the root that showed that texture, set by name or by key, though "ptex A" was still there:
    // the texture became plywood and kept its repeats, offsets and rotation, and the normal and
    // specular maps became the defaults. The other face settings, the faces with another
    // texture and the child prim's faces stayed. No script in either prim got a changed event.
    // A name reads back as a string (type 3) from PRIM_NORMAL and PRIM_SPECULAR, a key as a
    // key (type 4), and PRIM_TEXTURE gives a string for both.
    expect(said(s)).toEqual([
      `1/0 T=ptex A, ${A_MAP};t3`,
      ` N=ptex A, ${A_MAP};t3`,
      ` S=ptex A, ${A_MAP}, <0.200000, 0.400000, 0.600000>, 100, 50;t3`,
      `1/1 T=ptex A, ${A1_MAP};t3`,
      ` N=ptex A, ${A1_MAP};t3`,
      ` S=ptex A, ${A1_MAP}, <0.200000, 0.400000, 0.600000>, 100, 50;t3`,
      `2/0 T=${KEY_A}, ${A_MAP};t3`,
      ` N=${KEY_A}, ${A_MAP};t4`,
      ` S=${KEY_A}, ${A_MAP}, <0.200000, 0.400000, 0.600000>, 100, 50;t4`,
      `1/0 T=${PLYWOOD}, ${A_MAP};t3`,
      ` N=${NULL_KEY}, ${DEFAULT_MAP};t4`,
      ` S=${NULL_KEY}, ${DEFAULT_MAP}, ${SPEC_DEFAULT};t4`,
      `1/1 T=${PLYWOOD}, ${A1_MAP};t3`,
      ` N=${NULL_KEY}, ${DEFAULT_MAP};t4`,
      ` S=${NULL_KEY}, ${DEFAULT_MAP}, ${SPEC_DEFAULT};t4`,
      `1/2 T=ptex B, ${B_MAP};t3`,
      ` N=ptex B, ${B_MAP};t3`,
      ` S=ptex B, ${B_MAP}, <0.600000, 0.400000, 0.200000>, 200, 20;t3`,
      `1/3 T=${BLANK}, <8.000000, 9.000000, 0.000000>, <0.450000, 0.400000, 0.000000>, 2.000000;t3`,
      ` N=${BLANK}, <8.000000, 9.000000, 0.000000>, <0.450000, 0.400000, 0.000000>, 2.000000;t4`,
      ` S=${NULL_KEY}, ${DEFAULT_MAP}, ${SPEC_DEFAULT};t4`,
      `2/0 T=${KEY_A}, ${A_MAP};t3`,
      ` N=${KEY_A}, ${A_MAP};t4`,
      ` S=${KEY_A}, ${A_MAP}, <0.200000, 0.400000, 0.600000>, 100, 50;t4`,
      `${PLYWOOD} <0.10000, 0.20000, 0.00000> <2.00000, 3.00000, 0.00000> 0.500000`,
      '<0.200000, 0.400000, 0.600000>, 0.500000, 3, 5, 2, 100, 0.250000, 1, 1',
      `2 ${KEY_A}`,
      // The colour set in setup() is the only change the script hears of.
      'changed 2',
      // Removing "ptex A" itself does the same, and the key then reads back as a key.
      `1/1 T=${PLYWOOD}, ${A1_MAP};t3`,
      ` N=${NULL_KEY}, ${DEFAULT_MAP};t4`,
      ` S=${NULL_KEY}, ${DEFAULT_MAP}, ${SPEC_DEFAULT};t4`,
      `1/1 T=${KEY_A}, ${A1_MAP};t3`,
      ` N=${KEY_A}, ${A1_MAP};t4`,
      ` S=${NULL_KEY}, ${DEFAULT_MAP}, ${SPEC_DEFAULT};t4`,
    ])
    expect(said(scripts.observer!)).toEqual(['observer 1 changed 2'])
    expect(said(scripts.child!)).toEqual([])
    expect(said(s, DEBUG_CHANNEL)).toEqual([])
  })

  it('gives a sculpt the default sculpt map and keeps its type, with no changed event', async () => {
    const { scripts } = await removalLinkset(`
      integer step;
      string t() { list l = llGetPrimitiveParams([PRIM_TYPE]); return llList2CSV(l) + ";t" + (string)llGetListEntryType(l, 1); }
      default {
        state_entry() { llSetTimerEvent(5.0); }
        changed(integer c) { llSay(0, "changed " + (string)c + " after step " + (string)step); }
        timer() {
          ++step;
          if (step == 1) llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, "ptex B", PRIM_SCULPT_TYPE_PLANE]);
          else if (step == 2) llRemoveInventory("ptex B");
          else if (step == 4) llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, "ptex A", PRIM_SCULPT_TYPE_TORUS | PRIM_SCULPT_FLAG_MIRROR]);
          else if (step == 5) llRemoveInventory("ptex A");
          else if (step > 6) { llSetTimerEvent(0.0); return; }
          llSay(0, (string)step + " " + t());
        }
      }`)
    const s = scripts.probe!
    for (const script of Object.values(scripts)) script!.start()
    s.advanceTime(60_000)
    // In-world: the sculpt removal probe on a 5 s timer, with a second script in the box
    // listening for changed. The map read back as the item's name (a string) and after
    // llRemoveInventory as the default sculpt map (a key), with the sculpt type kept.
    // CHANGED_SHAPE came for each PRIM_TYPE and nothing came for either removal.
    expect(said(s)).toEqual([
      '1 7, ptex B, 3;t3',
      'changed 4 after step 1',
      `2 7, ${SCULPT_DEFAULT}, 3;t4`,
      `3 7, ${SCULPT_DEFAULT}, 3;t4`,
      '4 7, ptex A, 130;t3',
      'changed 4 after step 4',
      `5 7, ${SCULPT_DEFAULT}, 130;t4`,
      `6 7, ${SCULPT_DEFAULT}, 130;t4`,
    ])
    expect(said(scripts.observer!)).toEqual(['observer 1 changed 4', 'observer 1 changed 4'])
  })

  it('clears a removed material from the faces of that prim and reports a changed render material', async () => {
    const { scripts } = await removalLinkset(`
      integer step;
      string keyA; string keyB; string keyM;
      string e(list l) { return llList2CSV(l) + ";t" + (string)llGetListEntryType(l, 0); }
      dump() {
        integer f;
        for (f = 4; f < 6; ++f) {
          llSay(0, (string)f + " M=" + e(llGetPrimitiveParams([PRIM_RENDER_MATERIAL, f])) + " G=" + e(llGetPrimitiveParams([PRIM_GLTF_BASE_COLOR, f])));
          llSay(0, " GN=" + e(llGetPrimitiveParams([PRIM_GLTF_NORMAL, f])) + " GM=" + e(llGetPrimitiveParams([PRIM_GLTF_METALLIC_ROUGHNESS, f])));
        }
        llSay(0, "child M=" + e(llGetLinkPrimitiveParams(2, [PRIM_RENDER_MATERIAL, 4])) + " " + llGetRenderMaterial(5));
      }
      default {
        state_entry() {
          keyA = (string)llGetInventoryKey("ptex A"); keyB = (string)llGetInventoryKey("ptex B"); keyM = (string)llGetInventoryKey("pmat");
          llSetLinkPrimitiveParamsFast(LINK_THIS, [
            PRIM_RENDER_MATERIAL, 5, "pmat", PRIM_RENDER_MATERIAL, 4, keyM,
            PRIM_GLTF_BASE_COLOR, 5, keyA, <2.0, 2.0, 0.0>, <0.1, 0.1, 0.0>, 0.5, <0.5, 0.5, 0.5>, 0.5, PRIM_GLTF_ALPHA_MODE_BLEND, 0.5, TRUE,
            PRIM_GLTF_NORMAL, 5, "ptex B", <2.0, 2.0, 0.0>, <0.1, 0.1, 0.0>, 0.5,
            PRIM_GLTF_METALLIC_ROUGHNESS, 5, keyB, <2.0, 2.0, 0.0>, <0.1, 0.1, 0.0>, 0.5, 0.25, 0.75,
            PRIM_GLTF_BASE_COLOR, 4, keyB, <3.0, 3.0, 0.0>, <0.2, 0.2, 0.0>, 0.25, <0.5, 0.5, 0.5>, 0.5, PRIM_GLTF_ALPHA_MODE_BLEND, 0.5, TRUE,
            PRIM_LINK_TARGET, 2, PRIM_RENDER_MATERIAL, 4, keyM]);
          llSetTimerEvent(5.0);
        }
        changed(integer c) { llSay(0, "changed " + (string)c + " after step " + (string)step); }
        timer() {
          ++step;
          if (step == 1) llRemoveInventory("ptex B");
          else if (step == 2) llRemoveInventory("pmat");
          else if (step == 3) { llRemoveInventory("no such item"); llRemoveInventory("observer"); }
          else { llSetTimerEvent(0.0); return; }
          llSay(0, "step " + (string)step + " " + (string)llGetInventoryNumber(INVENTORY_ALL));
          if (step < 3) dump();
        }
      }`)
    const s = scripts.probe!
    for (const script of Object.values(scripts)) script!.start()
    s.advanceTime(60_000)
    const G5 = '<2.000000, 2.000000, 0.000000>, <0.100000, 0.100000, 0.000000>, 0.500000'
    const G4 = '<3.000000, 3.000000, 0.000000>, <0.200000, 0.200000, 0.000000>, 0.250000'
    // In-world: the material removal probe, with an uploaded material "pmat" on face 5 by name
    // and on face 4 and the child's face 4 by key, and GLTF texture overrides naming the
    // textures. Removing "ptex B" left the GLTF overrides that used it. Removing "pmat" cleared
    // the material from both faces of the root, set by name or by key, dropped their overrides
    // but kept the texture transforms, left the child's face alone, and gave every script in
    // the root CHANGED_RENDER_MATERIAL and no CHANGED_INVENTORY. Removing a script gave no event.
    expect(said(s)).toEqual([
      'changed 4096 after step 0',
      'step 1 5',
      `4 M=pmat;t3 G=${KEY_B}, ${G4}, <0.500000, 0.500000, 0.500000>, 0.500000, 1, 0.500000, 1;t4`,
      ` GN=, ${DEFAULT_MAP};t3 GM=, ${DEFAULT_MAP}, , ;t3`,
      `5 M=pmat;t3 G=${KEY_A}, ${G5}, <0.500000, 0.500000, 0.500000>, 0.500000, 1, 0.500000, 1;t4`,
      ` GN=${KEY_B}, ${G5};t4 GM=${KEY_B}, ${G5}, 0.250000, 0.750000;t4`,
      `child M=${KEY_M};t3 pmat`,
      'step 2 4',
      `4 M=${NULL_KEY};t3 G=, ${G4}, , , , , ;t3`,
      ` GN=, ${DEFAULT_MAP};t3 GM=, ${DEFAULT_MAP}, , ;t3`,
      `5 M=${NULL_KEY};t3 G=, ${G5}, , , , , ;t3`,
      ` GN=, ${G5};t3 GM=, ${G5}, , ;t3`,
      `child M=${KEY_M};t3 ${NULL_KEY}`,
      'changed 4096 after step 2',
      'step 3 3',
    ])
    expect(said(scripts.observer!)).toEqual(['observer 1 changed 4096', 'observer 1 changed 4096'])
    expect(said(scripts.child!)).toEqual(['observer 2 changed 4096'])
    expect(said(s, DEBUG_CHANNEL)).toEqual(["Missing inventory item 'no such item'."])
  })
})
