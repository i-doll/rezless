import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

async function run(source: string, options?: { owner?: string; objectName?: string; objectKey?: string; scriptName?: string; randomSeed?: number }) {
  const s = await loadScript({ source, ...options })
  s.start()
  return s
}

describe('Phase 3 — math builtins', () => {
  it('llAbs / llFabs / llRound / llCeil / llFloor', async () => {
    const s = await run(`
      integer a = 0;
      float f = 0;
      integer r = 0;
      integer c = 0;
      integer fl = 0;
      default {
        state_entry() {
          a = llAbs(-5);
          f = llFabs(-3.5);
          r = llRound(2.5);
          c = llCeil(2.1);
          fl = llFloor(2.9);
        }
      }
    `)
    expect(s.global('a')).toBe(5)
    expect(s.global('f')).toBe(3.5)
    expect(s.global('r')).toBe(3)
    expect(s.global('c')).toBe(3)
    expect(s.global('fl')).toBe(2)
  })

  it('llRound is floor(x + 0.5) (SL parity)', async () => {
    const s = await run(`
      integer a = 0;
      integer b = 0;
      integer c = 0;
      integer d = 0;
      default {
        state_entry() {
          a = llRound(2.5);
          b = llRound(0.5);
          c = llRound(-1.5);
          d = llRound(-2.5);
        }
      }
    `)
    expect(s.global('a')).toBe(3)
    expect(s.global('b')).toBe(1)
    expect(s.global('c')).toBe(-1)
    expect(s.global('d')).toBe(-2)
  })

  it('llPow / llSqrt / llSin / llCos', async () => {
    const s = await run(`
      float p = 0;
      float q = 0;
      float si = 0;
      float co = 0;
      default {
        state_entry() {
          p = llPow(2, 10);
          q = llSqrt(16);
          si = llSin(0);
          co = llCos(0);
        }
      }
    `)
    expect(s.global('p')).toBe(1024)
    expect(s.global('q')).toBe(4)
    expect(s.global('si')).toBe(0)
    expect(s.global('co')).toBe(1)
  })

  it('llVecMag / llVecNorm / llVecDist', async () => {
    const s = await run(`
      float m = 0;
      vector n = <0,0,0>;
      float d = 0;
      default {
        state_entry() {
          m = llVecMag(<3, 4, 0>);
          n = llVecNorm(<3, 4, 0>);
          d = llVecDist(<0, 0, 0>, <3, 4, 0>);
        }
      }
    `)
    expect(s.global('m')).toBe(5)
    expect(s.global('n')).toEqual({ x: Math.fround(0.6), y: Math.fround(0.8), z: 0 })
    expect(s.global('d')).toBe(5)
  })

  it('llFrand is seeded and deterministic', async () => {
    const s1 = await run(
      `
      float a = 0;
      float b = 0;
      default {
        state_entry() {
          a = llFrand(100.0);
          b = llFrand(100.0);
        }
      }
      `,
      { randomSeed: 42 },
    )
    const s2 = await run(
      `
      float a = 0;
      float b = 0;
      default {
        state_entry() {
          a = llFrand(100.0);
          b = llFrand(100.0);
        }
      }
      `,
      { randomSeed: 42 },
    )
    expect(s1.global('a')).toBe(s2.global('a'))
    expect(s1.global('b')).toBe(s2.global('b'))
    expect(s1.global('a')).toBeGreaterThanOrEqual(0)
    expect(s1.global('a')).toBeLessThan(100)
  })

  it('llRot2Euler ⨯ llEuler2Rot is approximately identity', async () => {
    const s = await run(`
      vector e = <0,0,0>;
      default {
        state_entry() {
          rotation r = llEuler2Rot(<0.1, 0.2, 0.3>);
          e = llRot2Euler(r);
        }
      }
    `)
    const e = s.global('e') as { x: number; y: number; z: number }
    expect(e.x).toBeCloseTo(0.1)
    expect(e.y).toBeCloseTo(0.2)
    expect(e.z).toBeCloseTo(0.3)
  })
})

describe('Phase 3 — string builtins', () => {
  it('llStringLength counts code points, not UTF-16 units', async () => {
    const s = await run(`
      integer ascii = 0;
      default { state_entry() { ascii = llStringLength("hello"); } }
    `)
    expect(s.global('ascii')).toBe(5)
  })

  it('llSubStringIndex returns first match or -1', async () => {
    const s = await run(`
      integer a = 0;
      integer b = 0;
      default {
        state_entry() {
          a = llSubStringIndex("hello world", "world");
          b = llSubStringIndex("hello world", "foo");
        }
      }
    `)
    expect(s.global('a')).toBe(6)
    expect(s.global('b')).toBe(-1)
  })

  it('llGetSubString with positive indices is inclusive', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() { out = llGetSubString("hello", 1, 3); } }
    `)
    expect(s.global('out')).toBe('ell')
  })

  it('llGetSubString with negative indices counts from the end', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() { out = llGetSubString("hello", -3, -1); } }
    `)
    expect(s.global('out')).toBe('llo')
  })

  it('llToLower / llToUpper / llStringTrim', async () => {
    const s = await run(`
      string lo = "";
      string up = "";
      string tr = "";
      default {
        state_entry() {
          lo = llToLower("HELLO");
          up = llToUpper("hello");
          tr = llStringTrim("  hi  ", STRING_TRIM);
        }
      }
    `)
    expect(s.global('lo')).toBe('hello')
    expect(s.global('up')).toBe('HELLO')
    expect(s.global('tr')).toBe('hi')
  })

  it('llReplaceSubString replaces all occurrences when count = 0', async () => {
    const s = await run(`
      string out = "";
      default {
        state_entry() {
          out = llReplaceSubString("a-b-c-d", "-", "+", 0);
        }
      }
    `)
    expect(s.global('out')).toBe('a+b+c+d')
  })

  it('llReplaceSubString with positive count replaces from the front', async () => {
    const s = await run(`
      string out = "";
      default {
        state_entry() {
          out = llReplaceSubString("a-b-c-d", "-", "+", 2);
        }
      }
    `)
    expect(s.global('out')).toBe('a+b+c-d')
  })

  it('llReplaceSubString with negative count replaces from the end', async () => {
    const s = await run(`
      string out = "";
      default {
        state_entry() {
          out = llReplaceSubString("a-b-c-d", "-", "+", -2);
        }
      }
    `)
    expect(s.global('out')).toBe('a-b+c+d')
  })

  it('llReplaceSubString returns the input unchanged when the pattern is empty', async () => {
    const s = await run(`
      string out = "";
      default {
        state_entry() {
          out = llReplaceSubString("hello", "", "*", 0);
        }
      }
    `)
    expect(s.global('out')).toBe('hello')
  })

  it('llStringTrim — head-only and tail-only flags', async () => {
    const s = await run(`
      string h = "";
      string t = "";
      default {
        state_entry() {
          h = llStringTrim("  hi  ", STRING_TRIM_HEAD);
          t = llStringTrim("  hi  ", STRING_TRIM_TAIL);
        }
      }
    `)
    expect(s.global('h')).toBe('hi  ')
    expect(s.global('t')).toBe('  hi')
  })

  it('llUnescapeURL turns a truncated UTF-8 sequence into ? and drops the incomplete escape', async () => {
    const s = await run(`
      string out = "no-fallback";
      default {
        state_entry() {
          out = llUnescapeURL("%E0%A4%A");
        }
      }
    `)
    expect(s.global('out')).toBe('??')
  })

  it('llInsertString clamps negative and out-of-bounds positions', async () => {
    const s = await run(`
      string a = "";
      string b = "";
      default {
        state_entry() {
          a = llInsertString("xyz", -5, "[");
          b = llInsertString("xyz", 99, "]");
        }
      }
    `)
    expect(s.global('a')).toBe('[xyz')
    expect(s.global('b')).toBe('xyz]')
  })

  it('llDeleteSubString — wrap mode (start > end)', async () => {
    const s = await run(`
      string out = "";
      default {
        state_entry() {
          // start=3, end=1 → keep just the middle slice between them.
          out = llDeleteSubString("abcdef", 3, 1);
        }
      }
    `)
    expect(s.global('out')).toBe('c')
  })

  it('llGetSubString — wrap mode (start > end)', async () => {
    const s = await run(`
      string out = "";
      default {
        state_entry() {
          out = llGetSubString("abcdef", 4, 1);
        }
      }
    `)
    // [0..1] + [4..end] → "ab" + "ef"
    expect(s.global('out')).toBe('abef')
  })

  it('llEscapeURL / llUnescapeURL roundtrip', async () => {
    const s = await run(`
      string a = "";
      string b = "";
      default {
        state_entry() {
          a = llEscapeURL("hello world!");
          b = llUnescapeURL(a);
        }
      }
    `)
    expect(s.global('a')).toBe('hello%20world%21')
    expect(s.global('b')).toBe('hello world!')
  })

  it('llGetSubString / llDeleteSubString clamp out-of-range indices (SL parity)', async () => {
    const s = await run(`
      string a = "?";
      string b = "?";
      string c = "?";
      string d = "?";
      string e = "?";
      default {
        state_entry() {
          a = llGetSubString("abc", 5, 10);
          b = llGetSubString("abc", -10, -5);
          c = llGetSubString("abc", 1, 10);
          d = llGetSubString("abc", -10, 1);
          e = llDeleteSubString("abc", 5, 10);
        }
      }
    `)
    expect(s.global('a')).toBe('')
    expect(s.global('b')).toBe('')
    expect(s.global('c')).toBe('bc')
    expect(s.global('d')).toBe('ab')
    expect(s.global('e')).toBe('abc')
  })

  it('string functions index by code point (SL parity)', async () => {
    const s = await run(`
      integer idx = -2;
      string sub = "?";
      integer len = -1;
      string del = "?";
      string ins = "?";
      default {
        state_entry() {
          idx = llSubStringIndex("😀a", "a");
          sub = llGetSubString("😀a", 1, 1);
          len = llStringLength("😀a");
          del = llDeleteSubString("😀ab", 1, 1);
          ins = llInsertString("😀a", 1, "-");
        }
      }
    `)
    expect(s.global('idx')).toBe(1)
    expect(s.global('sub')).toBe('a')
    expect(s.global('len')).toBe(2)
    expect(s.global('del')).toBe('😀b')
    expect(s.global('ins')).toBe('😀-a')
  })

  it('llEscapeURL escapes every byte that is not alphanumeric (SL parity)', async () => {
    const s = await run(`
      string a = "";
      string b = "";
      default {
        state_entry() {
          a = llEscapeURL("a-b_c.d!e~f*g'h(i)j");
          b = llEscapeURL("é");
        }
      }
    `)
    expect(s.global('a')).toBe('a%2Db%5Fc%2Ed%21e%7Ef%2Ag%27h%28i%29j')
    expect(s.global('b')).toBe('%C3%A9')
  })

  it('llUnescapeURL drops a trailing lone % and fails on bad hex (SL parity)', async () => {
    const s = await run(`
      string a = "?";
      string b = "?";
      default {
        state_entry() {
          a = llUnescapeURL("100%");
          b = llUnescapeURL("%zz%41");
        }
      }
    `)
    expect(s.global('a')).toBe('100')
    expect(s.global('b')).toBe('')
  })

  it('llStringTrim trims ASCII whitespace only, not NBSP (SL parity)', async () => {
    const s = await run(`
      integer len = 0;
      string t = "?";
      default {
        state_entry() {
          len = llStringLength(llStringTrim("\u00A0x\u00A0", STRING_TRIM));
          t = llStringTrim(" \\n x \\n ", STRING_TRIM);
        }
      }
    `)
    expect(s.global('len')).toBe(3)
    expect(s.global('t')).toBe('x')
  })

  it('llBase64ToString turns NUL and invalid UTF-8 bytes into ? (SL parity)', async () => {
    const s = await run(`
      string a = "";
      integer alen = 0;
      string b = "";
      default {
        state_entry() {
          a = llBase64ToString("YQBi");
          alen = llStringLength(a);
          b = llBase64ToString("/w==");
        }
      }
    `)
    expect(s.global('a')).toBe('a?b')
    expect(s.global('alen')).toBe(3)
    expect(s.global('b')).toBe('?')
  })
})

describe('Phase 3 — list builtins', () => {
  it('llGetListLength', async () => {
    const s = await run(`
      integer n = 0;
      default { state_entry() { n = llGetListLength([1, 2, 3, 4]); } }
    `)
    expect(s.global('n')).toBe(4)
  })

  it('llList2Key gives an empty string for a non-key item and past the end', async () => {
    const s = await run(`
      string k = "";
      string str = "";
      string int = "x";
      string flt = "x";
      string past = "x";
      default {
        state_entry() {
          k = (string)llList2Key([(key)"11111111-2222-3333-4444-555555555555"], 0);
          str = (string)llList2Key(["abc"], 0);
          int = (string)llList2Key([5], 0);
          flt = (string)llList2Key([1.5], 0);
          past = (string)llList2Key([], 0);
        }
      }
    `)
    expect(s.global('k')).toBe('11111111-2222-3333-4444-555555555555')
    expect(s.global('str')).toBe('abc')
    expect(s.global('int')).toBe('')
    expect(s.global('flt')).toBe('')
    expect(s.global('past')).toBe('')
  })

  it('llList2Integer / Float / String / Key with negative index', async () => {
    const s = await run(`
      integer i = 0;
      float f = 0;
      string str = "";
      default {
        state_entry() {
          i = llList2Integer([10, 20, 30], -1);
          f = llList2Float([1.5, 2.5, 3.5], 1);
          str = llList2String(["a", "b", "c"], 0);
        }
      }
    `)
    expect(s.global('i')).toBe(30)
    expect(s.global('f')).toBe(2.5)
    expect(s.global('str')).toBe('a')
  })

  it('llList2List inclusive slice', async () => {
    const s = await run(`
      list out = [];
      default { state_entry() { out = llList2List([1, 2, 3, 4, 5], 1, 3); } }
    `)
    expect(s.global('out')).toEqual([2, 3, 4])
  })

  it('llDeleteSubList removes inclusive range', async () => {
    const s = await run(`
      list out = [];
      default { state_entry() { out = llDeleteSubList([1, 2, 3, 4, 5], 1, 3); } }
    `)
    expect(s.global('out')).toEqual([1, 5])
  })

  it('llListInsertList inserts at position', async () => {
    const s = await run(`
      list out = [];
      default { state_entry() { out = llListInsertList([1, 4, 5], [2, 3], 1); } }
    `)
    expect(s.global('out')).toEqual([1, 2, 3, 4, 5])
  })

  it('llListReplaceList replaces inclusive range', async () => {
    const s = await run(`
      list out = [];
      default { state_entry() { out = llListReplaceList([1, 2, 3, 4, 5], [99], 1, 3); } }
    `)
    expect(s.global('out')).toEqual([1, 99, 5])
  })

  it('list ranges outside the list match Second Life', async () => {
    const s = await run(`
      list L = [10, 20, 30, 40, 50];
      list get = [];
      list wrapped = [];
      list deleted = [];
      list replaced = [];
      list replacedFar = [];
      list replacedFarWrap = [];
      default { state_entry() {
        get = llList2List(L, 5, 10);
        wrapped = llList2List(["a", "b"], 2, -1);
        deleted = llDeleteSubList(L, 5, 9);
        replaced = llListReplaceList(L, [99], 5, 5);
        replacedFar = llListReplaceList([0, 1, 2, 3], [5], -5, -4);
        replacedFarWrap = llListReplaceList([0, 1, 2, 3], [5], -5, -7);
      } }
    `)
    expect(s.global('get')).toEqual([])
    expect(s.global('wrapped')).toEqual(['a', 'b'])
    expect(s.global('deleted')).toEqual([10, 20, 30, 40, 50])
    expect(s.global('replaced')).toEqual([10, 20, 30, 40, 50, 99])
    expect(s.global('replacedFar')).toEqual([1, 2, 3])
    expect(s.global('replacedFarWrap')).toEqual([])
  })

  it('llListFindList returns subsequence index', async () => {
    const s = await run(`
      integer idx = 0;
      integer none = 0;
      default {
        state_entry() {
          idx = llListFindList([1, 2, 3, 4, 5], [3, 4]);
          none = llListFindList([1, 2, 3], [9]);
        }
      }
    `)
    expect(s.global('idx')).toBe(2)
    expect(s.global('none')).toBe(-1)
  })

  it('llListFindList does not match a key against a string', async () => {
    const s = await run(`
      integer keyInSrc = 0;
      integer keyInTest = 0;
      integer keyBoth = 0;
      integer viaConcat = 0;
      integer viaSlice = 0;
      default {
        state_entry() {
          key k = "a";
          keyInSrc = llListFindList([(key)"a"], ["a"]);
          keyInTest = llListFindList(["a"], [(key)"a"]);
          keyBoth = llListFindList(["x", k], [(key)"a"]);
          viaConcat = llListFindList([] + k, ["a"]);
          viaSlice = llListFindList(llList2List(["x", k], 1, 1), ["a"]);
        }
      }
    `)
    expect(s.global('keyInSrc')).toBe(-1)
    expect(s.global('keyInTest')).toBe(-1)
    expect(s.global('keyBoth')).toBe(1)
    expect(s.global('viaConcat')).toBe(-1)
    expect(s.global('viaSlice')).toBe(-1)
  })

  it('llListFindList does not match an integer against a float', async () => {
    const s = await run(`
      integer mixed = 0;
      integer same = 0;
      default {
        state_entry() {
          mixed = llListFindList([1], [1.0]);
          same = llListFindList([1.0], [1.0]);
        }
      }
    `)
    expect(s.global('mixed')).toBe(-1)
    expect(s.global('same')).toBe(0)
  })

  it('llDumpList2String joins with separator', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() { out = llDumpList2String(["a", "b", "c"], ","); } }
    `)
    expect(s.global('out')).toBe('a,b,c')
  })

  it('llList2CSV joins values with a comma and a space, unquoted', async () => {
    const s = await run(`
      string empty = "x";
      string strings = "";
      string blank = "";
      string comma = "";
      string ints = "";
      string floats = "";
      string whole = "";
      string nonfinite = "";
      string vec = "";
      string rot = "";
      string mixed = "";
      string latin = "";
      default {
        state_entry() {
          empty = llList2CSV([]);
          strings = llList2CSV(["a", "b", "c"]);
          blank = llList2CSV(["a", "", "b"]);
          comma = llList2CSV(["a,b", "c"]);
          ints = llList2CSV([1, -2, 0]);
          floats = llList2CSV([0.5, -2.25, 3.14159265]);
          whole = llList2CSV([1.0, 0.0, -3.0]);
          nonfinite = llList2CSV([llSqrt(-1.0), llPow(10.0, 999.0)]);
          vec = llList2CSV([<1.0, 2.5, -3.0>]);
          rot = llList2CSV([<0.0, 0.0, 0.0, 1.0>]);
          mixed = llList2CSV(["x", 1, 2.5, <1.0, 2.0, 3.0>, <0.0, 0.0, 0.0, 1.0>, (key)"11111111-2222-3333-4444-555555555555"]);
          latin = llList2CSV(["a¤b", "c£d"]);
        }
      }
    `)
    expect(s.global('empty')).toBe('')
    expect(s.global('strings')).toBe('a, b, c')
    expect(s.global('blank')).toBe('a, , b')
    expect(s.global('comma')).toBe('a,b, c')
    expect(s.global('ints')).toBe('1, -2, 0')
    expect(s.global('floats')).toBe('0.500000, -2.250000, 3.141593')
    expect(s.global('whole')).toBe('1.000000, 0.000000, -3.000000')
    expect(s.global('nonfinite')).toBe('nan, inf')
    expect(s.global('vec')).toBe('<1.000000, 2.500000, -3.000000>')
    expect(s.global('rot')).toBe('<0.000000, 0.000000, 0.000000, 1.000000>')
    expect(s.global('mixed')).toBe('x, 1, 2.500000, <1.000000, 2.000000, 3.000000>, <0.000000, 0.000000, 0.000000, 1.000000>, 11111111-2222-3333-4444-555555555555')
    expect(s.global('latin')).toBe('a¤b, c£d')
  })

  it('llCSV2List splits commas with optional whitespace', async () => {
    const s = await run(`
      list out = [];
      default { state_entry() { out = llCSV2List("a, b,c"); } }
    `)
    expect(s.global('out')).toEqual(['a', 'b', 'c'])
  })

  it('llCSV2List keeps <> together, drops one space after a comma, and keeps "" as one item', async () => {
    const s = await run(`
      list nested = [];
      list vec = [];
      list empty = [];
      list spaces = [];
      default {
        state_entry() {
          nested = llCSV2List("<<>,>,a");
          vec = llCSV2List("a, <1.000000, 2.000000, 3.000000>, b");
          empty = llCSV2List("");
          spaces = llCSV2List("a,  b");
        }
      }
    `)
    expect(s.global('nested')).toEqual(['<<>,>', 'a'])
    expect(s.global('vec')).toEqual(['a', '<1.000000, 2.000000, 3.000000>', 'b'])
    expect(s.global('empty')).toEqual([''])
    expect(s.global('spaces')).toEqual(['a', ' b'])
  })

  it('llCSV2List drops one leading space from the first item too', async () => {
    const s = await run(`
      list one = [];
      list two = [];
      list blank = [];
      default {
        state_entry() {
          one = llCSV2List(" a, b");
          two = llCSV2List("  a, b");
          blank = llCSV2List(" ");
        }
      }
    `)
    expect(s.global('one')).toEqual(['a', 'b'])
    expect(s.global('two')).toEqual([' a', 'b'])
    expect(s.global('blank')).toEqual([''])
  })

  it('llParseString2List splits on separators, keeps tokens', async () => {
    const s = await run(`
      list out = [];
      default {
        state_entry() {
          out = llParseString2List("a-b-c", ["-"], []);
        }
      }
    `)
    expect(s.global('out')).toEqual(['a', 'b', 'c'])
  })

  it.each([
    ['"a||b", ["|"], []', ['a', '', 'b']],
    ['"|a|", ["|"], []', ['', 'a', '']],
    ['"a,,b", [], [","]', ['a', ',', '', ',', 'b']],
    ['"", ["|"], []', ['']],
    ['"abc", [], []', ['abc']],
  ])('llParseStringKeepNulls(%s) keeps empty entries', async (args, expected) => {
    const s = await run(`
      list out = [];
      default { state_entry() { out = llParseStringKeepNulls(${args}); } }
    `)
    expect(s.global('out')).toEqual(expected)
  })

  it.each([
    ['"ABx", ["A", "AB"], []', ['Bx']],
    ['"a|b", [], ["|"]', ['a', '|', 'b']],
    ['"a|b", ["|"], ["|"]', ['a', 'b']],
    ['"a,b", ["", ","], []', ['a', 'b']],
    ['"a9b", ["1", "2", "3", "4", "5", "6", "7", "8", "9"], []', ['a9b']],
    ['"a9b", [], ["1", "2", "3", "4", "5", "6", "7", "8", "9"]', ['a9b']],
  ])('llParseString2List(%s) picks delimiters like Second Life', async (args, expected) => {
    const s = await run(`
      list out = [];
      default { state_entry() { out = llParseString2List(${args}); } }
    `)
    expect(s.global('out')).toEqual(expected)
  })

  it('llParseString2List ignores key delimiters', async () => {
    const s = await run(`
      list out = [];
      default { state_entry() { key sep = "|"; out = llParseString2List("a|b", [sep], []); } }
    `)
    expect(s.global('out')).toEqual(['a|b'])
  })

  it('llParseStringKeepNulls returns strings, not keys', async () => {
    const s = await run(`
      integer found = 0;
      default { state_entry() { found = llListFindList(llParseStringKeepNulls("a", [], []), [(key)"a"]); } }
    `)
    expect(s.global('found')).toBe(-1)
  })

  it.each([
    ['[3, 1, 2], 1, TRUE', [1, 2, 3]],
    ['[3, 1, 2], 1, FALSE', [3, 2, 1]],
    ['[3, 1, 2], 0, TRUE', [1, 2, 3]],
    ['["b", 1, "a", 2], 2, TRUE', ['a', 2, 'b', 1]],
    ['[3, 1, 2], 2, TRUE', [3, 1, 2]],
    ['["b", "B", "a"], 1, TRUE', ['B', 'a', 'b']],
    ['["\u{10000}", "\u{E000}"], 1, TRUE', ['\u{E000}', '\u{10000}']],
    ['["ab", "a"], 1, TRUE', ['a', 'ab']],
    ['[2.5, -1.0, 0.5], 1, TRUE', [-1, 0.5, 2.5]],
    [
      '[<3, 0, 0>, <0, 1, 0>, <0, 0, 2>], 1, TRUE',
      [{ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 2 }, { x: 3, y: 0, z: 0 }],
    ],
  ])('llListSort(%s)', async (args, expected) => {
    const s = await run(`
      list out = [];
      default { state_entry() { out = llListSort(${args}); } }
    `)
    expect(s.global('out')).toEqual(expected)
  })

  it('llGetListEntryType returns each element type, and TYPE_INVALID out of range', async () => {
    const s = await run(`
      list out = [];
      default {
        state_entry() {
          list l = [1, 1.0, "a", (key)"a", <1, 2, 3>, <0, 0, 0, 1>];
          integer i;
          for (i = 0; i < 6; ++i) out += llGetListEntryType(l, i);
          out += [llGetListEntryType(l, -1), llGetListEntryType(l, 6), llGetListEntryType([], 0)];
        }
      }
    `)
    expect(s.global('out')).toEqual([1, 2, 3, 4, 5, 6, 6, 0, 0])
  })

  // Every case was checked in Second Life. The second column gives each
  // element's type, since llList2CSV prints keys and strings the same.
  it.each([
    ['[2, "a", 1.0, 1], 1, TRUE', '1, a, 1.000000, 2', 'isfi'],
    ['[2, "a", 1.0, 1], 1, FALSE', '1, 1.000000, a, 2', 'ifsi'],
    ['[2, "b", 0.5, 1, "a", 1.5], 1, TRUE', '1, a, 0.500000, 2, b, 1.500000', 'isfisf'],
    ['[2, "b", 0.5, 1, "a", 1.5], 1, FALSE', '1.500000, a, 1, 0.500000, b, 2', 'fsifsi'],
    ['[3, 1, 2], 1, 2', '3, 2, 1', 'iii'],
    ['[3, 1, 2], 1, -1', '3, 2, 1', 'iii'],
    ['["b", 1, "a", 2, 3, 0], 2, TRUE', 'a, 2, b, 1, 3, 0', 'sisiii'],
    ['["b", 1, "a", 2, 3, 0], 2, FALSE', '3, 0, b, 1, a, 2', 'iisisi'],
    [
      '[<0,0,0,1>, 2, <1,0,0,0>, 1], 1, TRUE',
      '<0.000000, 0.000000, 0.000000, 1.000000>, 1, <1.000000, 0.000000, 0.000000, 0.000000>, 2',
      'riri',
    ],
    [
      '[<0,0,0,1>, 2, <1,0,0,0>, 1], 1, FALSE',
      '1, <1.000000, 0.000000, 0.000000, 0.000000>, 2, <0.000000, 0.000000, 0.000000, 1.000000>',
      'irir',
    ],
    ['[(key)"b", "a", (key)"a", "b"], 1, TRUE', 'a, a, b, b', 'ksks'],
  ])('llListSort(%s) orders mixed types like Second Life', async (args, csv, types) => {
    const s = await run(`
      string csv;
      string types;
      default {
        state_entry() {
          list out = llListSort(${args});
          csv = llList2CSV(out);
          integer i;
          for (i = 0; i < llGetListLength(out); ++i) {
            integer t = llGetListEntryType(out, i);
            types += llGetSubString("?ifskvr", t, t);
          }
        }
      }
    `)
    expect(s.global('csv')).toBe(csv)
    expect(s.global('types')).toBe(types)
  })

  it('llListSort only compares elements of the same type', async () => {
    const s = await run(`
      list out = [];
      default { state_entry() { out = llListSort([2, "a", 1.0, 1], 1, TRUE); } }
    `)
    expect(s.global('out')).toEqual([1, 'a', 1, 2])
  })

  it('llListSort keeps key elements as keys', async () => {
    const s = await run(`
      integer found = -1;
      default {
        state_entry() {
          key a = "a";
          key b = "b";
          list sorted = llListSort([b, a], 1, TRUE);
          if (llListFindList(sorted, ["b"]) == -1) found = llListFindList(sorted, [b]);
        }
      }
    `)
    expect(s.global('found')).toBe(1)
  })

  it('lists from llJson2List and llCSV2List keep their element types', async () => {
    const s = await run(`
      list sorted;
      integer csvFound;
      integer jsonFound;
      integer jsonKeyFound;
      string floats;
      default {
        state_entry() {
          sorted = llListSort(llJson2List("[2,0.5,1]"), 1, TRUE);
          csvFound = llListFindList(llCSV2List("a"), [(key)"a"]);
          jsonFound = llListFindList(llJson2List("[1]"), [1.0]);
          jsonKeyFound = llListFindList(llJson2List("{\\"a\\":\\"b\\"}"), [(key)"b"]);
          floats = llDumpList2String(llJson2List("[1.0,2]"), ",");
        }
      }
    `)
    expect(s.global('sorted')).toEqual([1, 0.5, 2])
    expect(s.global('csvFound')).toBe(-1)
    expect(s.global('jsonFound')).toBe(-1)
    expect(s.global('jsonKeyFound')).toBe(-1)
    expect(s.global('floats')).toBe('1.000000,2')
  })

  it('lists from linkset data and physics material keep their element types', async () => {
    const s = await run(`
      integer keyFound;
      integer countFound;
      string material;
      default {
        state_entry() {
          llLinksetDataWrite("a", "1");
          keyFound = llListFindList(llLinksetDataListKeys(0, 0), [(key)"a"]);
          countFound = llListFindList(llLinksetDataDeleteFound("zzz", ""), [0.0]);
          material = llDumpList2String(llGetPhysicsMaterial(), ",");
        }
      }
    `)
    expect(s.global('keyFound')).toBe(-1)
    expect(s.global('countFound')).toBe(-1)
    expect(s.global('material')).toBe('1.000000,0.500000,0.600000,1000.000000')
  })
})

describe('Phase 3 — identity builtins', () => {
  it('llGetOwner returns configured owner key', async () => {
    const s = await run(
      `
      key k = "";
      default { state_entry() { k = llGetOwner(); } }
      `,
      { owner: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
    )
    expect(s.global('k')).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  })

  it('llGetObjectName / llSetObjectName roundtrip', async () => {
    const s = await run(
      `
      string before = "";
      string after = "";
      default {
        state_entry() {
          before = llGetObjectName();
          llSetObjectName("Greeter");
          after = llGetObjectName();
        }
      }
      `,
      { objectName: 'StarterCube' },
    )
    expect(s.global('before')).toBe('StarterCube')
    expect(s.global('after')).toBe('Greeter')
  })

  it('llGetScriptName uses configured name', async () => {
    const s = await run(
      `
      string n = "";
      default { state_entry() { n = llGetScriptName(); } }
      `,
      { scriptName: 'greeter' },
    )
    expect(s.global('n')).toBe('greeter')
  })

  it('llGetOwnerKey resolves the host prim to its owner', async () => {
    const s = await run(
      `
      key k = "";
      default { state_entry() { k = llGetOwnerKey(llGetKey()); } }
      `,
      {
        owner: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        objectKey: '11111111-2222-3333-4444-555555555555',
      },
    )
    expect(s.global('k')).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  })

  it('llGetOwnerKey echoes id for unknown well-formed keys', async () => {
    const s = await run(
      `
      key k = "";
      default {
        state_entry() {
          k = llGetOwnerKey("ffffffff-ffff-ffff-ffff-ffffffffffff");
        }
      }
      `,
      { owner: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
    )
    expect(s.global('k')).toBe('ffffffff-ffff-ffff-ffff-ffffffffffff')
  })

  it('llGetOwnerKey returns NULL_KEY for malformed keys', async () => {
    const s = await run(
      `
      key k = "untouched";
      default { state_entry() { k = llGetOwnerKey("not-a-uuid"); } }
      `,
    )
    expect(s.global('k')).toBe('00000000-0000-0000-0000-000000000000')
  })

  it('llGetOwnerKey returns NULL_KEY when called with NULL_KEY (sentinel never resolves)', async () => {
    // If a fixture pins prim.key = NULL_KEY, an unguarded .some() match would
    // treat NULL_KEY as a real prim and return the owner. NULL_KEY is SL's
    // sentinel for "invalid / missing key" and must never resolve to anything.
    const s = await run(
      `
      key k = "untouched";
      default { state_entry() { k = llGetOwnerKey("00000000-0000-0000-0000-000000000000"); } }
      `,
      {
        owner: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        objectKey: '00000000-0000-0000-0000-000000000000',
      },
    )
    expect(s.global('k')).toBe('00000000-0000-0000-0000-000000000000')
  })

  it('llGetOwnerKey resolves an uppercase UUID to the host prim (case-insensitive lookup)', async () => {
    const s = await run(
      `
      key k = "";
      default {
        state_entry() {
          // KEY_PATTERN already accepts uppercase; the lookup must too.
          k = llGetOwnerKey("AABBCCDD-1122-3344-5566-778899AABBCC");
        }
      }
      `,
      {
        owner: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        objectKey: 'AABBCCDD-1122-3344-5566-778899AABBCC'.toLowerCase(),
      },
    )
    expect(s.global('k')).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  })

  it('llGetOwnerKey resolves a lowercase UUID against an uppercase prim key', async () => {
    const s = await run(
      `
      key k = "";
      default {
        state_entry() {
          k = llGetOwnerKey("aabbccdd-1122-3344-5566-778899aabbcc");
        }
      }
      `,
      {
        owner: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        objectKey: 'aabbccdd-1122-3344-5566-778899aabbcc'.toUpperCase(),
      },
    )
    expect(s.global('k')).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  })
})

describe('in-world parity — math, strings, hashes', () => {
  async function evalExpr(type: string, expr: string) {
    const s = await run(`${type} out; default { state_entry() { out = ${expr}; } }`)
    return s.global('out')
  }

  // In-world: llCeil(1e10), llFloor(-1e10) and llRound(1e10) all gave -2147483648.
  it.each([
    ['llCeil(1e10)'],
    ['llFloor(-1e10)'],
    ['llRound(1e10)'],
    ['llCeil(llPow(10.0, 999.0))'],
    ['llFloor(llSqrt(-1.0))'],
  ])('%s is -2147483648', async (expr) => {
    expect(await evalExpr('integer', expr)).toBe(-2147483648)
  })

  // In-world: llLog(0) and llLog(-1) gave 0.0. llLog10(x <= 0) = 0 is from the wiki, not measured.
  it.each([
    ['llLog(0.0)', 0],
    ['llLog(-1.0)', 0],
    ['llLog10(0.0)', 0],
    ['llLog10(-5.0)', 0],
    ['llLog10(100.0)', 2],
  ])('%s is %d', async (expr, want) => {
    expect(await evalExpr('float', expr)).toBe(want)
  })

  // In-world: llToUpper("école straße ß") gave "ÉCOLE STRAßE ß".
  it('llToUpper leaves characters whose uppercase is longer', async () => {
    expect(await evalExpr('string', 'llToUpper("école straße ß")')).toBe('ÉCOLE STRAßE ß')
  })

  // In-world values for llUnescapeURL.
  it.each([
    ['a%20b+c%2', 'a b+c'],
    ['%e9x', '?x'],
    ['%00x', ''],
    ['%C3%A9', 'é'],
    ['😀%41', '😀A'],
    ['100%', '100'],
    ['%zz%41', ''],
  ])('llUnescapeURL(%j) is %j', async (input, want) => {
    expect(await evalExpr('string', `llUnescapeURL("${input}")`)).toBe(want)
  })

  // In-world values for llModPow; base, exponent and modulus are unsigned 32-bit. A zero modulus was not measured.
  it.each([
    ['llModPow(2, 10, 1000)', 24],
    ['llModPow(-2, 3, 5)', 4],
    ['llModPow(2, -1, 5)', 3],
    ['llModPow(2, 3, 0)', 0],
  ])('%s is %d', async (expr, want) => {
    expect(await evalExpr('integer', expr)).toBe(want)
  })

  // In-world values for llOrd and llChar.
  it.each([
    ['llOrd("é", 0)', 233],
    ['llOrd("abc", -1)', 99],
    ['llOrd("abc", 5)', 0],
    ['llStringLength(llChar(0))', 0],
  ])('%s is %d', async (expr, want) => {
    expect(await evalExpr('integer', expr)).toBe(want)
  })

  it.each([
    ['llChar(233)', 'é'],
    ['llChar(-1)', '�'],
  ])('%s is %j', async (expr, want) => {
    expect(await evalExpr('string', expr)).toBe(want)
  })

  // In-world: llHash("hello") = 684824882, llHash("") = 0.
  it.each([
    ['llHash("hello")', 684824882],
    ['llHash("")', 0],
  ])('%s is %d', async (expr, want) => {
    expect(await evalExpr('integer', expr)).toBe(want)
  })

  // In-world values for llComputeHash (lowercase hex).
  it.each([
    ['sha256', '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'],
    ['md5', '5d41402abc4b2a76b9719d911017c592'],
  ])('llComputeHash("hello", %s)', async (algo, want) => {
    expect(await evalExpr('string', `llComputeHash("hello", "${algo}")`)).toBe(want)
  })

  it('llComputeHash returns "" for an unknown algorithm', async () => {
    expect(await evalExpr('string', 'llComputeHash("hello", "nope")')).toBe('')
  })
})
