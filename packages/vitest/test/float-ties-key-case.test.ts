import { describe, it, expect } from 'vitest'
import { loadLinkset, loadScript, makeInventoryItem, InventoryType, DEBUG_CHANNEL } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Typecast
// https://wiki.secondlife.com/wiki/LlList2CSV
// https://wiki.secondlife.com/wiki/LlSetTexture
// https://wiki.secondlife.com/wiki/LlSetPrimitiveParams
// In-world: SLua Tideland on Aditi (2026-11-13), in 0.5 m boxes made with object.create. Each
// probe ran compiled for Mono and, where noted, compiled to Luau. Results were said on a
// channel, and a listener on DEBUG_CHANNEL caught the script errors.

async function run(source: string) {
  const s = await loadScript({ source })
  s.start()
  return s
}

const said = (s: { chat: ReadonlyArray<{ channel: number; text: string }> }, channel = 0) =>
  s.chat.filter((c) => c.channel === channel).map((c) => c.text)

/**
 * Each row is the float k × 2^e and how the grid printed it: as (string)f, in
 * llList2CSV([f]), and as the x of (string)<f, 0, 0>.
 * In-world: the float table probe built f as (float)k * llPow(2.0, (float)e) and gave these
 * strings under Mono and compiled to Luau alike. For every row, llDumpList2String([f], "|"),
 * (string)[f], llList2String([f], 0), the x of (string)[<f, 0, 0>] and the x of
 * llDumpList2String([<f, 0, 0, 1>], "|") equalled (string)f;
 * the x of llList2CSV([<f, 0, 0>]) and of llList2CSV([<f, 0, 0, 1>]) equalled llList2CSV([f]);
 * llList2Json(JSON_ARRAY, [f]) was llList2CSV([f]) in brackets; and the x of
 * (string)<f, 0, 0, 1> equalled the x of (string)<f, 0, 0>.
 */
const FLOATS: ReadonlyArray<readonly [k: number, e: number, cast: string, csv: string, vector: string]> = [
  // sixth decimal exactly on a tie (odd k / 128)
  [1, -7, '0.007813', '0.007812', '0.00781'],
  [3, -7, '0.023438', '0.023438', '0.02344'],
  [5, -7, '0.039063', '0.039062', '0.03906'],
  [7, -7, '0.054688', '0.054688', '0.05469'],
  [-1, -7, '-0.007813', '-0.007812', '-0.00781'],
  [-3, -7, '-0.023438', '-0.023438', '-0.02344'],
  [-5, -7, '-0.039063', '-0.039062', '-0.03906'],
  [129, -7, '1.007813', '1.007812', '1.00781'],
  [131, -7, '1.023438', '1.023438', '1.02344'],
  [133, -7, '1.039063', '1.039062', '1.03906'],
  [-129, -7, '-1.007813', '-1.007812', '-1.00781'],
  [15802469, -7, '123456.800000', '123456.789062', '123456.80000'],
  [15802471, -7, '123456.800000', '123456.804688', '123456.80000'],
  [-15802469, -7, '-123456.800000', '-123456.789062', '-123456.80000'],
  [16777215, -7, '131072.000000', '131071.992188', '131072.00000'],
  [16777213, -7, '131072.000000', '131071.976562', '131072.00000'],
  [12799999, -7, '99999.990000', '99999.992188', '99999.99000'],
  [8388609, -30, '0.007813', '0.007813', '0.00781'],
  [16777215, -31, '0.007813', '0.007812', '0.00781'],
  [10485761, -28, '0.039063', '0.039063', '0.03906'],
  [10485759, -28, '0.039063', '0.039062', '0.03906'],
  [8454145, -23, '1.007813', '1.007813', '1.00781'],
  [8454143, -23, '1.007812', '1.007812', '1.00781'],
  [-10485761, -28, '-0.039063', '-0.039063', '-0.03906'],
  [-10485759, -28, '-0.039063', '-0.039062', '-0.03906'],
  [1, -6, '0.015625', '0.015625', '0.01563'],
  [3, -6, '0.046875', '0.046875', '0.04688'],
  [5, -6, '0.078125', '0.078125', '0.07813'],
  [-1, -6, '-0.015625', '-0.015625', '-0.01563'],
  [-5, -6, '-0.078125', '-0.078125', '-0.07813'],
  [65, -6, '1.015625', '1.015625', '1.01563'],
  [69, -6, '1.078125', '1.078125', '1.07813'],
  [2469133, -1, '1234567.000000', '1234566.500000', '1234567.00000'],
  [2469135, -1, '1234568.000000', '1234567.500000', '1234568.00000'],
  [-2469133, -1, '-1234567.000000', '-1234566.500000', '-1234567.00000'],
  [12345665, 0, '12345670.000000', '12345665.000000', '12345670.00000'],
  [12345675, 0, '12345680.000000', '12345675.000000', '12345680.00000'],
  [16777215, 0, '16777220.000000', '16777215.000000', '16777220.00000'],
  [16777205, 0, '16777210.000000', '16777205.000000', '16777210.00000'],
  [8388605, -1, '4194303.000000', '4194302.500000', '4194303.00000'],
  [8388607, -1, '4194304.000000', '4194303.500000', '4194304.00000'],
  [8796093, -44, '0.000001', '0.000000', '0.00000'],
  [8796093, -45, '0.000000', '0.000000', '0.00000'],
  [2097153, -21, '1.000000', '1.000000', '1.00000'],
  [3298535, -41, '0.000002', '0.000002', '0.00000'],
  [2097151, -21, '1.000000', '1.000000', '1.00000'],
  [8388607, -23, '1.000000', '1.000000', '1.00000'],
  [16570051, -27, '0.123457', '0.123457', '0.12346'],
  [16570185, -27, '0.123458', '0.123457', '0.12346'],
  [1048577, -21, '0.500001', '0.500000', '0.50000'],
  [13421773, -27, '0.100000', '0.100000', '0.10000'],
  [6617445, 77, '1000000000000000000000000000000.000000', '1000000015047466219876688855040.000000', '1000000000000000000000000000000.00000'],
  [332307, -118, '0.000000', '0.000000', '0.00000'],
  [15432099, 3, '123456800.000000', '123456792.000000', '123456800.00000'],
  [8285045, -26, '0.123457', '0.123457', '0.12346'],
  [16777215, 104, '340282300000000000000000000000000000000.000000', '340282346638528859811704183484516925440.000000', '340282300000000000000000000000000000000.00000'],
  [9765625, 10, '10000000000.000000', '10000000000.000000', '10000000000.00000'],
  [5033165, -24, '0.300000', '0.300000', '0.30000'],
  [3, -1, '1.500000', '1.500000', '1.50000'],
  [25, 2, '100.000000', '100.000000', '100.00000'],
  [1, -10, '0.000977', '0.000977', '0.00098'],
  [1, -11, '0.000488', '0.000488', '0.00049'],
  [1, 24, '16777220.000000', '16777216.000000', '16777220.00000'],
  [1, 25, '33554430.000000', '33554432.000000', '33554430.00000'],
  [16777215, -24, '1.000000', '1.000000', '1.00000'],
  [8388609, -23, '1.000000', '1.000000', '1.00000'],
  [7632263, -23, '0.909837', '0.909837', '0.90984'],
  [171355, -18, '0.653667', '0.653667', '0.65367'],
  [15406525, -24, '0.918300', '0.918300', '0.91830'],
  [854761, -23, '0.101896', '0.101895', '0.10190'],
  [8402843, -24, '0.500849', '0.500848', '0.50085'],
  [4948263, -24, '0.294940', '0.294939', '0.29494'],
  [8161205, -23, '0.972891', '0.972891', '0.97289'],
  [-854761, -23, '-0.101896', '-0.101895', '-0.10190'],
  [-171355, -18, '-0.653667', '-0.653667', '-0.65367'],
]

describe('float formatting on ties', () => {
  const PROBE = `
    list out;
    string x(string s) { return llList2String(llParseString2List(s, ["<", ",", ">"], []), 0); }
    list K = [${FLOATS.map((r) => r[0]).join(', ')}];
    list E = [${FLOATS.map((r) => r[1]).join(', ')}];
    default {
      state_entry() {
        integer i;
        for (i = 0; i < llGetListLength(K); ++i) {
          float f = (float)llList2Integer(K, i) * llPow(2.0, (float)llList2Integer(E, i));
          vector v = <f, 0, 0>; rotation r = <f, 0, 0, 1>;
          out += [EXPR];
        }
      }
    }`
  const column = async (expr: string) => (await run(PROBE.replace('EXPR', expr))).global('out')

  // The cast keeps 7 significant digits, rounding half up, then rounds half up again to the
  // decimals shown, so 123456.7890625 prints as 123456.800000 and 0.0078125 as 0.007813.
  it.each([
    ['(string)f', '(string)f'],
    ['llDumpList2String([f], "|")', 'llDumpList2String([f], "|")'],
    ['(string)[f]', '(string)[f]'],
    ['llList2String([f], 0)', 'llList2String([f], 0)'],
    ['(string)[<f, 0, 0>]', 'x((string)[v])'],
    ['llDumpList2String([<f, 0, 0, 1>], "|")', 'x(llDumpList2String([r], "|"))'],
  ])('%s keeps 7 significant digits and rounds half up', async (_, expr) => {
    expect(await column(expr)).toEqual(FLOATS.map((r) => r[2]))
  })

  it.each([
    ['(string)<f, 0, 0>', 'x((string)v)'],
    ['(string)<f, 0, 0, 1>', 'x((string)r)'],
  ])('%s does the same at 5 decimals', async (_, expr) => {
    expect(await column(expr)).toEqual(FLOATS.map((r) => r[4]))
  })

  // llList2CSV and llList2Json print the exact value of the float and round a tie to the even
  // digit, as C's %f does: 0.0078125 prints as 0.007812 and 0.0234375 as 0.023438.
  it.each([
    ['llList2CSV([f])', 'llList2CSV([f])'],
    ['llList2CSV([<f, 0, 0>])', 'x(llList2CSV([v]))'],
    ['llList2CSV([<f, 0, 0, 1>])', 'x(llList2CSV([r]))'],
  ])('%s prints the exact value and rounds a tie to even', async (_, expr) => {
    expect(await column(expr)).toEqual(FLOATS.map((r) => r[3]))
  })

  it('llList2Json prints floats as llList2CSV does', async () => {
    expect(await column('llList2Json(JSON_ARRAY, [f])')).toEqual(FLOATS.map((r) => `[${r[3]}]`))
  })

  it('rounds ties to even inside vectors, rotations and objects in llList2CSV and llList2Json', async () => {
    const s = await run(`
      default {
        state_entry() {
          float nz = (float)"-0";
          float t = 5.0 / 128.0;
          vector v = <t, -t, nz>;
          rotation r = <t, -t, nz, 1.0>;
          llSay(0, llList2Json(JSON_ARRAY, [t, -t, nz, 0.0]));
          llSay(0, llList2Json(JSON_ARRAY, [v]));
          llSay(0, llList2Json(JSON_ARRAY, [r]));
          llSay(0, llList2Json(JSON_OBJECT, ["a", t, "b", nz]));
          llSay(0, llList2CSV([1, t, "s", v, r]));
          llSay(0, (string)v + (string)r);
          llSay(0, (string)[v, r]);
          llSay(0, llDumpList2String([v, t, nz], "|"));
        }
      }`)
    // In-world: the same eight lines, Mono and compiled to Luau.
    expect(said(s)).toEqual([
      '[0.039062,-0.039062,-0.000000,0.000000]',
      '["<0.039062, -0.039062, -0.000000>"]',
      '["<0.039062, -0.039062, -0.000000, 1.000000>"]',
      '{"a":0.039062,"b":-0.000000}',
      '1, 0.039062, s, <0.039062, -0.039062, -0.000000>, <0.039062, -0.039062, -0.000000, 1.000000>',
      '<0.03906, -0.03906, -0.00000><0.03906, -0.03906, -0.00000, 1.00000>',
      '<0.039063, -0.039063, -0.000000><0.039063, -0.039063, -0.000000, 1.000000>',
      '<0.039063, -0.039063, 0.000000>|0.039063|0.000000',
    ])
  })

  it('llList2CSV keeps the sign of a negative zero', async () => {
    const s = await run(`
      default {
        state_entry() {
          float z = 0.0;
          llSay(0, llList2CSV([(float)"-0", -z, -0.0, llSqrt(-z), z]));
        }
      }`)
    // In-world: -0.000000 for (float)"-0", for -z with z = 0.0, for the literal -0.0 and for
    // llSqrt(-z).
    expect(said(s)).toEqual(['-0.000000, -0.000000, -0.000000, -0.000000, 0.000000'])
  })
})

describe('float formatting on ties in SLua', () => {
  it('ll.List2CSV and ll.List2Json round a tie to even, and ll.DumpList2String rounds half up', async () => {
    const s = await loadScript({
      language: 'slua',
      filename: 'ties.luau',
      source: `
        for _, f in {5 / 128, -1 / 128, 3 / 128, 15802469 / 128} do
          local v = vector(f, 0, 0)
          ll.Say(0, \`{ll.List2CSV({f})} {ll.List2CSV({v})} {ll.List2Json(JSON_ARRAY, {f})} {ll.DumpList2String({f}, "|")} {ll.List2String({f}, 1)} {ll.DumpList2String({v}, "|")}\`)
        end`,
    })
    s.start()
    // In-world: the SLua float table probe gave these for 5/128, -1/128, 3/128 and 123456.7890625.
    expect(said(s)).toEqual([
      '0.039062 <0.039062, 0.000000, 0.000000> [0.039062] 0.039063 0.039063 <0.039063, 0.000000, 0.000000>',
      '-0.007812 <-0.007812, 0.000000, 0.000000> [-0.007812] -0.007813 -0.007813 <-0.007813, 0.000000, 0.000000>',
      '0.023438 <0.023438, 0.000000, 0.000000> [0.023438] 0.023438 0.023438 <0.023438, 0.000000, 0.000000>',
      '123456.789062 <123456.789062, 0.000000, 0.000000> [123456.789062] 123456.800000 123456.800000 <123456.800000, 0.000000, 0.000000>',
    ])
  })
})

describe('NaN and the infinities in strings', () => {
  const show = `
    show(float f) {
      vector v = <f, 0, 0>; rotation r = <f, 0, 0, 1>;
      llSay(0, (string)f + " " + llDumpList2String([f], "|") + " " + (string)[f] + " " + llList2String([f], 0)
        + " " + (string)v + " " + (string)r + " " + (string)[v] + " " + llDumpList2String([r], "|"));
      llSay(0, llList2CSV([f]) + " " + llList2CSV([v]) + " " + llList2CSV([r]) + " " + llList2Json(JSON_ARRAY, [f]));
    }`
  const shown = async (expr: string) => said(await run(`${show} default { state_entry() { float inf = (float)"inf"; float zero = 0.0; show(${expr}); } }`))

  // In-world: the NaN probe printed each expression below in these twelve forms, the same under
  // Mono and compiled to Luau.
  it.each([
    ['(float)"inf"'], ['(float)"Infinity"'], ['(float)"INF"'], ['llPow(0.0, -1.0)'], ['inf + inf'], ['1e38 * 10.0'],
  ])('%s prints as Infinity in a cast and inf in llList2CSV', async (expr) => {
    expect(await shown(expr)).toEqual([
      'Infinity Infinity Infinity Infinity <Infinity, 0.00000, 0.00000> <Infinity, 0.00000, 0.00000, 1.00000> <Infinity, 0.000000, 0.000000> <Infinity, 0.000000, 0.000000, 1.000000>',
      'inf <inf, 0.000000, 0.000000> <inf, 0.000000, 0.000000, 1.000000> [inf]',
    ])
  })

  // In-world: the same probe, Mono and compiled to Luau.
  it.each([['(float)"-inf"'], ['-inf'], ['-1e38 * 10.0']])('%s prints as -Infinity in a cast and -inf in llList2CSV', async (expr) => {
    expect(await shown(expr)).toEqual([
      '-Infinity -Infinity -Infinity -Infinity <-Infinity, 0.00000, 0.00000> <-Infinity, 0.00000, 0.00000, 1.00000> <-Infinity, 0.000000, 0.000000> <-Infinity, 0.000000, 0.000000, 1.000000>',
      '-inf <-inf, 0.000000, 0.000000> <-inf, 0.000000, 0.000000, 1.000000> [-inf]',
    ])
  })

  // In-world: these five print NaN in every cast and nan in llList2CSV and llList2Json, under
  // Mono and compiled to Luau.
  it.each([
    ['(float)"nan"'], ['(float)"NaN"'], ['llAcos(2.0)'], ['llAsin(2.0)'], ['llList2Float(["nan"], 0)'],
  ])('%s prints as NaN in a cast and nan in llList2CSV', async (expr) => {
    expect(await shown(expr)).toEqual([
      'NaN NaN NaN NaN <NaN, 0.00000, 0.00000> <NaN, 0.00000, 0.00000, 1.00000> <NaN, 0.000000, 0.000000> <NaN, 0.000000, 0.000000, 1.000000>',
      'nan <nan, 0.000000, 0.000000> <nan, 0.000000, 0.000000, 1.000000> [nan]',
    ])
  })

  // In-world, llList2CSV and llList2Json print a NaN by its sign bit. Under Mono these gave -nan,
  // <-nan, 0.000000, 0.000000>, <-nan, 0.000000, 0.000000, 1.000000> and [-nan]: llPow(-1.0, 0.5),
  // llSqrt(-1.0), llSin(inf), llTan(inf), inf - inf, inf * 0.0, (float)"-nan" and -llAcos(2.0).
  // -llSqrt(-1.0) gave nan. Compiled to Luau the same eight gave -nan, except llSqrt(-1.0), which
  // gave nan, and -llSqrt(-1.0) gave -nan. The VM's floats have one NaN without a sign, so every
  // NaN prints as nan here: the second line below differs from Second Life. The casts print NaN
  // in-world too.
  it.each([
    ['llPow(-1.0, 0.5)'], ['llSqrt(-1.0)'], ['llSin(inf)'], ['llTan(inf)'], ['inf - inf'], ['inf * zero'], ['(float)"-nan"'],
    ['-llAcos(2.0)'], ['-llSqrt(-1.0)'],
  ])('%s prints as NaN in a cast, and as nan without its sign in llList2CSV', async (expr) => {
    expect(await shown(expr)).toEqual([
      'NaN NaN NaN NaN <NaN, 0.00000, 0.00000> <NaN, 0.00000, 0.00000, 1.00000> <NaN, 0.000000, 0.000000> <NaN, 0.000000, 0.000000, 1.000000>',
      'nan <nan, 0.000000, 0.000000> <nan, 0.000000, 0.000000, 1.000000> [nan]',
    ])
  })

  it('llLog and llLog10 of a value that is not positive give 0.0, not a NaN', async () => {
    // In-world: 0.000000 in every form for llLog(-1.0), llLog10(-1.0) and llLog(0.0).
    const s = await run('default { state_entry() { llSay(0, llList2CSV([llLog(-1.0), llLog10(-1.0), llLog(0.0)])); } }')
    expect(said(s)).toEqual(['0.000000, 0.000000, 0.000000'])
  })

  it('inf / inf is a Math Error', async () => {
    // In-world: "Script run-time error" and "Math Error" on DEBUG_CHANNEL, and the script stopped.
    const s = await loadScript({ source: 'default { state_entry() { float inf = (float)"inf"; llSay(0, (string)(inf / inf)); } }' })
    expect(() => s.start()).toThrow('Math Error')
    expect(said(s)).toEqual([])
  })
})

const BASE = '5748decc-f629-461c-9a36-a35a221fe21f'
const LO = 'abcdef01-2345-6789-abcd-ef0123456789'
const UP = LO.toUpperCase()
const NULL_KEY = '00000000-0000-0000-0000-000000000000'

/**
 * The key probe. Before each input, the setter stores BASE, so a refused input shows as BASE
 * and a cleared one as the null key or "".
 */
const KEY_PROBE = (set: string, read: string, before = '') => `
  string BASE = "${BASE}";
  string LO = "${LO}";
  string UP = "${UP}";
  list REP = [<1.0, 1.0, 0.0>, ZERO_VECTOR, 0.0];
  list out;
  set(list k) { string s = llList2String(k, 0); ${set} }
  string first(list l) { return (string)llGetListEntryType(l, 0) + ":" + llList2String(l, 0); }
  default {
    state_entry() {
      list IN = [LO, UP, "AbCdEf01-2345-6789-aBcD-eF0123456789", (key)UP,
        "{" + LO + "}", "abcdef0123456789abcdef0123456789", "ABCDEF0123456789ABCDEF0123456789",
        " " + UP, UP + " ", "not a key", "", NULL_KEY, (key)"not a key", (key)""];
      ${before}
      integer i;
      for (i = 0; i < llGetListLength(IN); ++i) {
        set([BASE]);
        set(llList2List(IN, i, i));
        out += [${read}];
      }
    }
  }`

/** The 14 inputs of the key probe: four spellings of one key, then ten that are not a key to store. */
const NOT_KEYS = [`{${LO}}`, 'abcdef0123456789abcdef0123456789', 'ABCDEF0123456789ABCDEF0123456789', ` ${UP}`, `${UP} `, 'not a key', '', NULL_KEY, 'not a key', '']
const results = (key: string, rest: string | ((input: string, index: number) => string)) =>
  [key, key, key, key, ...NOT_KEYS.map((input, i) => (typeof rest === 'string' ? rest : rest(input, i)))]

describe('the case of a stored key', () => {
  // In-world: an upper-case key, a mixed-case key and an upper-case key of type key all read
  // back in lower case from every setter below. A key in braces, one without dashes, one with a
  // leading or trailing space, text, "" and (key)"" are not keys.
  it.each([
    ['llSetTexture', 'llSetTexture(s, 0);'],
    ['llSetLinkTexture', 'llSetLinkTexture(LINK_THIS, s, 0);'],
  ])('%s stores a key in lower case and refuses what is not a key', async (_, set) => {
    const s = await run(KEY_PROBE(set, 'llGetTexture(0) + " " + first(llGetPrimitiveParams([PRIM_TEXTURE, 0]))'))
    // In-world: the ten refused inputs, the null key among them, left BASE and each said
    // "Could not find texture '<input>'." on DEBUG_CHANNEL.
    expect(s.global('out')).toEqual(results(`${LO} 3:${LO}`, `${BASE} 3:${BASE}`))
    expect(said(s, DEBUG_CHANNEL)).toEqual(NOT_KEYS.map((input) => `Could not find texture '${input}'.`))
  })

  it.each([
    ['llSetPrimitiveParams', 'llSetPrimitiveParams([PRIM_TEXTURE, 0] + k + REP);'],
    ['llSetLinkPrimitiveParamsFast', 'llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_TEXTURE, 0] + k + REP);'],
  ])('PRIM_TEXTURE through %s stores a key in lower case and the null key for what is not a key', async (_, set) => {
    const s = await run(KEY_PROBE(set, 'llGetTexture(0) + " " + first(llGetPrimitiveParams([PRIM_TEXTURE, 0]))'))
    // In-world: no error for any input.
    expect(s.global('out')).toEqual(results(`${LO} 3:${LO}`, `${NULL_KEY} 3:${NULL_KEY}`))
    expect(said(s, DEBUG_CHANNEL)).toEqual([])
  })

  it.each([
    ['PRIM_NORMAL', 'llSetPrimitiveParams([PRIM_NORMAL, 0] + k + REP);', 'PRIM_NORMAL'],
    ['PRIM_SPECULAR', 'llSetPrimitiveParams([PRIM_SPECULAR, 0] + k + REP + [<1.0, 1.0, 1.0>, 51, 0]);', 'PRIM_SPECULAR'],
  ])('%s stores a key in lower case and the null key for what is not a key', async (_, set, rule) => {
    const s = await run(KEY_PROBE(set, `first(llGetPrimitiveParams([${rule}, 0]))`))
    // In-world: the ten inputs that are not a key each left the null key, of type key, in place
    // of BASE, with no error.
    expect(s.global('out')).toEqual(results(`4:${LO}`, `4:${NULL_KEY}`))
    expect(said(s, DEBUG_CHANNEL)).toEqual([])
  })

  it.each([
    ['llSetRenderMaterial', 'llSetRenderMaterial(s, 0);'],
    ['llSetLinkRenderMaterial', 'llSetLinkRenderMaterial(LINK_THIS, s, 0);'],
  ])('%s stores a key in lower case and refuses what is not a key', async (_, set) => {
    const s = await run(KEY_PROBE(set, 'llGetRenderMaterial(0) + " " + first(llGetPrimitiveParams([PRIM_RENDER_MATERIAL, 0]))'))
    // In-world: the null key cleared the material without an error; the other nine left BASE
    // and each said "Could not find render material '<input>'." on DEBUG_CHANNEL.
    expect(s.global('out')).toEqual(
      results(`${LO} 3:${LO}`, (input) => (input === NULL_KEY ? `${NULL_KEY} 3:${NULL_KEY}` : `${BASE} 3:${BASE}`)),
    )
    expect(said(s, DEBUG_CHANNEL)).toEqual(
      NOT_KEYS.filter((input) => input !== NULL_KEY).map((input) => `Could not find render material '${input}'.`),
    )
  })

  it('PRIM_RENDER_MATERIAL stores a key in lower case and the null key for what is not a key', async () => {
    const s = await run(KEY_PROBE(
      'llSetPrimitiveParams([PRIM_RENDER_MATERIAL, 0] + k);',
      'llGetRenderMaterial(0) + " " + first(llGetPrimitiveParams([PRIM_RENDER_MATERIAL, 0]))',
    ))
    // In-world: the ten inputs that are not a key each left the null key in place of BASE, with
    // no error.
    expect(s.global('out')).toEqual(results(`${LO} 3:${LO}`, `${NULL_KEY} 3:${NULL_KEY}`))
    expect(said(s, DEBUG_CHANNEL)).toEqual([])
  })

  it.each([
    ['PRIM_GLTF_BASE_COLOR', 'k + REP + [<1.0, 1.0, 1.0>, 1.0, PRIM_GLTF_ALPHA_MODE_OPAQUE, 0.5, FALSE]'],
    ['PRIM_GLTF_NORMAL', 'k + REP'],
    ['PRIM_GLTF_METALLIC_ROUGHNESS', 'k + REP + [1.0, 1.0]'],
    ['PRIM_GLTF_EMISSIVE', 'k + REP + [<1.0, 1.0, 1.0>]'],
  ])('%s stores a key in lower case, clears on "" and stores the null key for an empty key', async (rule, values) => {
    const s = await run(KEY_PROBE(
      `llSetPrimitiveParams([${rule}, 0] + ${values});`,
      `first(llGetPrimitiveParams([${rule}, 0]))`,
      'llSetRenderMaterial(BASE, 0);',
    ))
    // In-world: the string "" read back as the string "", and (key)"" and the other eight as the
    // null key, of type key, with no error.
    expect(s.global('out')).toEqual(results(`4:${LO}`, (input, i) => (input === '' && i === 6 ? '3:' : `4:${NULL_KEY}`)))
    expect(said(s, DEBUG_CHANNEL)).toEqual([])
  })

  // In-world: PRIM_TYPE read back as this torus, with one face, after a sculpt map that names no
  // texture (each of the ten inputs that are not a key, the null key, "" and (key)"" among
  // them), whether the prim had been a box, a cut and hollowed box, a cylinder or a sculpt.
  const TORUS = '4, 0, <0.000000, 1.000000, 0.000000>, 0.000000, <0.000000, 0.000000, 0.000000>, <1.000000, 0.500000, 0.000000>, <0.000000, 0.000000, 0.000000>, <0.000000, 1.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, 1.000000, 0.000000, 0.000000'

  it('a sculpt map is stored in lower case, and one that is not a key leaves a torus', async () => {
    const s = await run(KEY_PROBE(
      'llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT] + k + [PRIM_SCULPT_TYPE_SPHERE]);',
      'llList2CSV(llGetPrimitiveParams([PRIM_TYPE]))',
    ))
    // In-world: the four spellings of the key read back as 7, the key in lower case, 1. The ten
    // others left the torus, with no error.
    expect(s.global('out')).toEqual(results(`7, ${LO}, 1`, TORUS))
    expect(said(s, DEBUG_CHANNEL)).toEqual([])
  })

  it('a sculpt map that is not a key leaves the same torus from any shape', async () => {
    const s = await run(`
      string t() { return llList2CSV(llGetPrimitiveParams([PRIM_TYPE])); }
      default {
        state_entry() {
          llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, "not a key", PRIM_SCULPT_TYPE_SPHERE]);
          llSay(0, t());
          llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_BOX, PRIM_HOLE_CIRCLE, <0.1, 0.9, 0.0>, 0.3, <0.1, 0.2, 0.0>, <0.5, 0.5, 0.0>, <0.1, 0.1, 0.0>]);
          llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, "not a key", PRIM_SCULPT_TYPE_PLANE]);
          llSay(0, t());
          llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, "${UP}", PRIM_SCULPT_TYPE_PLANE | PRIM_SCULPT_FLAG_MIRROR]);
          llSay(0, t());
          llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, NULL_KEY, PRIM_SCULPT_TYPE_TORUS]);
          llSay(0, t());
          llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, "${BASE}", PRIM_SCULPT_TYPE_CYLINDER]);
          llSay(0, t());
          llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_CYLINDER, PRIM_HOLE_DEFAULT, <0.2, 0.8, 0.0>, 0.5, ZERO_VECTOR, <1.0, 1.0, 0.0>, ZERO_VECTOR]);
          llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, "nope", PRIM_SCULPT_TYPE_SPHERE]);
          llSay(0, t() + " faces=" + (string)llGetNumberOfSides());
        }
      }`)
    // In-world: the torus each time the map was not a key, and between them 7, the key in lower
    // case, 131 (plane with the mirror flag) and 7, the key, 4.
    expect(said(s)).toEqual([TORUS, TORUS, `7, ${LO}, 131`, TORUS, `7, ${BASE}, 4`, `${TORUS} faces=1`])
    expect(said(s, DEBUG_CHANNEL)).toEqual([])
  })

  it('a sculpt map and a texture given by the key of an inventory texture read back as its name', async () => {
    const { scripts } = await loadLinkset({
      prims: [{
        inventory: [makeInventoryItem({ name: 'probe Tex', type: InventoryType.TEXTURE, key: '16eec75e-97e2-5098-2f48-15ee979d6f3a' })],
        scripts: [{
          name: 'probe',
          source: {
            source: `
              string t() { return llList2CSV(llGetPrimitiveParams([PRIM_TYPE])); }
              default {
                state_entry() {
                  string tex = llGetInventoryName(INVENTORY_TEXTURE, 0);
                  string k = (string)llGetInventoryKey(tex);
                  llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, tex, PRIM_SCULPT_TYPE_SPHERE]);
                  llSay(0, t());
                  llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, llToUpper(tex), PRIM_SCULPT_TYPE_SPHERE]);
                  llSay(0, t());
                  llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, llToUpper(k), PRIM_SCULPT_TYPE_SPHERE]);
                  llSay(0, t());
                  llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_BOX, PRIM_HOLE_DEFAULT, <0.0, 1.0, 0.0>, 0.0, ZERO_VECTOR, <1.0, 1.0, 0.0>, ZERO_VECTOR]);
                  llSetTexture("${BASE}", ALL_SIDES);
                  llSetTexture(llToUpper(k), 0);
                  llSay(0, llGetTexture(0) + " " + llList2String(llGetPrimitiveParams([PRIM_TEXTURE, 0]), 0));
                  llSetTexture(llToUpper(tex), 2);
                  llSay(0, llGetTexture(2));
                  llSetRenderMaterial("${BASE}", 0);
                  llSetPrimitiveParams([PRIM_GLTF_BASE_COLOR, 0, tex, <1.0, 1.0, 0.0>, ZERO_VECTOR, 0.0, <1.0, 1.0, 1.0>, 1.0, PRIM_GLTF_ALPHA_MODE_OPAQUE, 0.5, FALSE]);
                  llSay(0, llList2String(llGetPrimitiveParams([PRIM_GLTF_BASE_COLOR, 0]), 0));
                }
              }`,
          },
        }],
      }],
    })
    const s = scripts.probe!
    s.start()
    // In-world: with an uploaded texture "probe issue-421 Tex" in the box, the sculpt map read
    // back as the item's name when set by name or by its key in upper case, and the name in upper
    // case left the torus. llSetTexture by the key in upper case read back the name, and by the
    // name in upper case said "Could not find texture" and left BASE. PRIM_GLTF_BASE_COLOR by
    // name read back the key.
    expect(said(s)).toEqual([
      '7, probe Tex, 1',
      TORUS,
      '7, probe Tex, 1',
      'probe Tex probe Tex',
      BASE,
      '16eec75e-97e2-5098-2f48-15ee979d6f3a',
    ])
    expect(said(s, DEBUG_CHANNEL)).toEqual(["Could not find texture 'PROBE TEX'."])
  })

  it('a sculpt map that is not a key reports a changed shape once', async () => {
    const s = await loadScript({
      source: `
        integer step;
        string t() { list l = llGetPrimitiveParams([PRIM_TYPE]); return llList2String(l, 0) + "," + llList2String(l, 1) + " faces=" + (string)llGetNumberOfSides(); }
        default {
          state_entry() { llSetTimerEvent(2.0); }
          changed(integer c) { llSay(0, "changed " + (string)c + " after step " + (string)step); }
          timer() {
            ++step;
            if (step == 1) llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, "not a key", PRIM_SCULPT_TYPE_SPHERE]);
            else if (step == 2) llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, "not a key", PRIM_SCULPT_TYPE_SPHERE]);
            else if (step == 3) llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, "${BASE}", PRIM_SCULPT_TYPE_SPHERE]);
            else if (step == 4) llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, "nope", PRIM_SCULPT_TYPE_SPHERE]);
            else if (step == 5) llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, "not a key", 5]);
            else if (step == 6) llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SPHERE, PRIM_HOLE_DEFAULT, <0.0, 1.0, 0.0>, 0.0, ZERO_VECTOR, <0.0, 1.0, 0.0>]);
            else if (step == 7) llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, "not a key", 5]);
            else if (step == 8) llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, "", 5]);
            else if (step == 9) llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, "${BASE}", PRIM_SCULPT_TYPE_SPHERE]);
            else if (step == 10) llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, "not a key", 5]);
            else if (step == 11) llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, NULL_KEY, 5 | PRIM_SCULPT_FLAG_MIRROR]);
            else { llSetTimerEvent(0.0); return; }
            llSay(0, (string)step + " " + t());
          }
        }`,
    })
    s.start()
    s.advanceTime(30_000)
    // In-world: the same steps on a 2 s timer. CHANGED_SHAPE came when the box became the torus,
    // not when the torus was set again, and when a sculpt became the torus. With sculpt type 5 a
    // map that is not a key left the torus, the sphere and the sculpt as they were, with no event.
    expect(said(s)).toEqual([
      '1 4,0 faces=1',
      'changed 4 after step 1',
      '2 4,0 faces=1',
      `3 7,${BASE} faces=1`,
      'changed 4 after step 3',
      '4 4,0 faces=1',
      'changed 4 after step 4',
      '5 4,0 faces=1',
      '6 3,0 faces=1',
      'changed 4 after step 6',
      '7 3,0 faces=1',
      '8 3,0 faces=1',
      `9 7,${BASE} faces=1`,
      'changed 4 after step 9',
      `10 7,${BASE} faces=1`,
      `11 7,${BASE} faces=1`,
    ])
  })

  it('a sculpt type PRIM_TYPE does not know, or a rule without one, leaves the shape alone', async () => {
    const s = await run(`
      string t() { list l = llGetPrimitiveParams([PRIM_TYPE]); return llList2String(l, 0) + "," + llList2String(l, 1) + "," + llList2String(l, 2); }
      box() { llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_BOX, PRIM_HOLE_DEFAULT, <0.0, 1.0, 0.0>, 0.0, ZERO_VECTOR, <1.0, 1.0, 0.0>, ZERO_VECTOR]); }
      default {
        state_entry() {
          list types = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 15, 16, 32, 69, 71, 135, 70, 129, 196, 257, 261];
          integer i;
          for (i = 0; i < llGetListLength(types); ++i) {
            box();
            llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, "${BASE}", llList2Integer(types, i)]);
            llSay(0, (string)llList2Integer(types, i) + " " + t());
          }
          list bad = [7, 71, 8, 65, 0, 6];
          for (i = 0; i < llGetListLength(bad); ++i) {
            box();
            llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, "nope", llList2Integer(bad, i)]);
            llSay(0, "nope " + (string)llList2Integer(bad, i) + " " + t());
          }
          box();
          llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, "${BASE}"]);
          llSay(0, "no type " + t());
          llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, "nope"]);
          llSay(0, "nope, no type " + t());
        }
      }`)
    // In-world: from a box each time. Types 0 to 4 and 6, with or without the invert (64) and
    // mirror (128) flags, made the sculpt, and 257 was stored as 1. Types 5 and 7, any type with
    // 8, 16 or 32 set, and a rule with no type left the box, whatever the map. A map that is not
    // a key left the torus with types 0, 6 and 65.
    const SCULPT = (type: number) => `7,${BASE},${type}`
    const BOX = '0,0,<0.000000, 1.000000, 0.000000>'
    const TORUS_START = '4,0,<0.000000, 1.000000, 0.000000>'
    expect(said(s)).toEqual([
      `0 ${SCULPT(0)}`, `1 ${SCULPT(1)}`, `2 ${SCULPT(2)}`, `3 ${SCULPT(3)}`, `4 ${SCULPT(4)}`, `5 ${BOX}`, `6 ${SCULPT(6)}`,
      `7 ${BOX}`, `8 ${BOX}`, `9 ${BOX}`, `13 ${BOX}`, `15 ${BOX}`, `16 ${BOX}`, `32 ${BOX}`, `69 ${BOX}`, `71 ${BOX}`, `135 ${BOX}`,
      `70 ${SCULPT(70)}`, `129 ${SCULPT(129)}`, `196 ${SCULPT(196)}`, `257 ${SCULPT(1)}`, `261 ${BOX}`,
      `nope 7 ${BOX}`, `nope 71 ${BOX}`, `nope 8 ${BOX}`, `nope 65 ${TORUS_START}`, `nope 0 ${TORUS_START}`, `nope 6 ${TORUS_START}`,
      `no type ${BOX}`, `nope, no type ${BOX}`,
    ])
    expect(said(s, DEBUG_CHANNEL)).toEqual([])
  })

  it('PRIM_NORMAL and PRIM_SPECULAR without a texture drop the rule\'s other values for the defaults', async () => {
    const s = await run(`
      string n() { return llList2CSV(llGetPrimitiveParams([PRIM_NORMAL, 0])); }
      string sp() { return llList2CSV(llGetPrimitiveParams([PRIM_SPECULAR, 0])); }
      default {
        state_entry() {
          list maps = [(key)"", "", "not a key", NULL_KEY];
          integer i;
          for (i = 0; i < 4; ++i) {
            llSetPrimitiveParams([PRIM_NORMAL, 0, "${BASE}", <2.0, 2.0, 0.0>, <0.5, 0.5, 0.0>, 1.0]);
            llSetPrimitiveParams([PRIM_NORMAL, 0] + llList2List(maps, i, i) + [<3.0, 3.0, 0.0>, <0.25, 0.25, 0.0>, 2.0]);
            llSay(0, n());
            llSetPrimitiveParams([PRIM_SPECULAR, 0, "${BASE}", <2.0, 2.0, 0.0>, <0.5, 0.5, 0.0>, 1.0, <0.5, 0.25, 0.75>, 100, 50]);
            llSetPrimitiveParams([PRIM_SPECULAR, 0] + llList2List(maps, i, i) + [<3.0, 3.0, 0.0>, <0.25, 0.25, 0.0>, 2.0, <0.1, 0.2, 0.3>, 200, 150]);
            llSay(0, sp());
          }
        }
      }`)
    // In-world: from a map with repeats <2, 2, 0>, offsets <0.5, 0.5, 0> and rotation 1.0, each of
    // (key)"", "", "not a key" and NULL_KEY with other values read back as these defaults.
    const normal = `${NULL_KEY}, <1.000000, 1.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, 0.000000`
    const specular = `${normal}, <1.000000, 1.000000, 1.000000>, 51, 0`
    expect(said(s)).toEqual([normal, specular, normal, specular, normal, specular, normal, specular])
  })

  it('PRIM_TEXTURE and PRIM_GLTF_NORMAL keep the rule\'s other values when the texture is not a key', async () => {
    const s = await run(`
      default {
        state_entry() {
          list maps = ["not a key", "", (key)"", NULL_KEY, "${UP}"];
          list tr = [<3.0, 3.0, 0.0>, <0.25, 0.25, 0.0>, 2.0];
          llSetRenderMaterial("${BASE}", 0);
          integer i;
          for (i = 0; i < 5; ++i) {
            llSetPrimitiveParams([PRIM_TEXTURE, 0, "${BASE}", <2.0, 2.0, 0.0>, <0.5, 0.5, 0.0>, 1.0]);
            llSetPrimitiveParams([PRIM_TEXTURE, 0] + llList2List(maps, i, i) + tr);
            llSay(0, llList2CSV(llGetPrimitiveParams([PRIM_TEXTURE, 0])));
            llSetPrimitiveParams([PRIM_GLTF_NORMAL, 0, "${BASE}", <2.0, 2.0, 0.0>, <0.5, 0.5, 0.0>, 1.0]);
            llSetPrimitiveParams([PRIM_GLTF_NORMAL, 0] + llList2List(maps, i, i) + tr);
            llSay(0, llList2CSV(llGetPrimitiveParams([PRIM_GLTF_NORMAL, 0])));
          }
        }
      }`)
    // In-world: the new repeats, offsets and rotation were stored with every map. PRIM_TEXTURE
    // read the null key for the four that are not a key; PRIM_GLTF_NORMAL read "" for "".
    const tr = '<3.000000, 3.000000, 0.000000>, <0.250000, 0.250000, 0.000000>, 2.000000'
    expect(said(s)).toEqual([
      `${NULL_KEY}, ${tr}`, `${NULL_KEY}, ${tr}`,
      `${NULL_KEY}, ${tr}`, `, ${tr}`,
      `${NULL_KEY}, ${tr}`, `${NULL_KEY}, ${tr}`,
      `${NULL_KEY}, ${tr}`, `${NULL_KEY}, ${tr}`,
      `${LO}, ${tr}`, `${LO}, ${tr}`,
    ])
  })

  it('a sculpt map names a texture in the inventory of the prim the script is in, and reads by the inventory of its own prim', async () => {
    const { scripts } = await loadLinkset({
      prims: [
        {
          inventory: [makeInventoryItem({ name: 'RootTex', type: InventoryType.TEXTURE, key: '16eec75e-97e2-5098-2f48-15ee979d6f3a' })],
          scripts: [{
            name: 'probe',
            source: {
              source: `
                string rd() { list l = llGetLinkPrimitiveParams(2, [PRIM_TYPE]); return llList2String(l, 0) + "," + llList2String(l, 1); }
                box() { llSetLinkPrimitiveParamsFast(2, [PRIM_TYPE, PRIM_TYPE_BOX, PRIM_HOLE_DEFAULT, <0.0, 1.0, 0.0>, 0.0, ZERO_VECTOR, <1.0, 1.0, 0.0>, ZERO_VECTOR]); }
                default {
                  state_entry() {
                    llSetLinkPrimitiveParamsFast(2, [PRIM_TYPE, PRIM_TYPE_SCULPT, "RootTex", PRIM_SCULPT_TYPE_SPHERE]);
                    llSay(0, rd());
                    box();
                    llSetLinkPrimitiveParamsFast(2, [PRIM_TYPE, PRIM_TYPE_SCULPT, "ChildTex", PRIM_SCULPT_TYPE_SPHERE]);
                    llSay(0, rd());
                    box();
                    llSetLinkPrimitiveParamsFast(2, [PRIM_TYPE, PRIM_TYPE_SCULPT, "16EEC75E-97E2-5098-2F48-15EE979D6F3A", PRIM_SCULPT_TYPE_SPHERE]);
                    llSay(0, rd());
                    box();
                    llSetLinkPrimitiveParamsFast(2, [PRIM_TYPE, PRIM_TYPE_SCULPT, "0894c334-5a92-c6a4-19fd-5e228a8b89d2", PRIM_SCULPT_TYPE_SPHERE]);
                    llSay(0, rd());
                  }
                }`,
            },
          }],
        },
        { inventory: [makeInventoryItem({ name: 'ChildTex', type: InventoryType.TEXTURE, key: '0894C334-5A92-C6A4-19FD-5E228A8B89D2' })] },
      ],
    })
    scripts.probe!.start()
    // In-world: a two-box linkset with one uploaded texture in the root and another in the child,
    // the script in the root. The child read the same from its own script each time. The child
    // took the root item's name and read back the key; the child item's name left the torus; the
    // root item's key read back as the key; the child item's key read back as the child item's name.
    expect(said(scripts.probe!)).toEqual([
      '7,16eec75e-97e2-5098-2f48-15ee979d6f3a',
      '4,0',
      '7,16eec75e-97e2-5098-2f48-15ee979d6f3a',
      '7,ChildTex',
    ])
  })

  it('llList2CSV keeps the case of a key in a list', async () => {
    // In-world: llList2CSV([(key)"ABCDEF01-2345-6789-ABCD-EF0123456789"]) kept the upper case.
    const s = await run(`default { state_entry() { llSay(0, llList2CSV([(key)"${UP}"])); } }`)
    expect(said(s)).toEqual([UP])
  })
})
