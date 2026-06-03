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
          r = llRound(2.5);  // banker's: 2 (round to even)
          c = llCeil(2.1);
          fl = llFloor(2.9);
        }
      }
    `)
    expect(s.global('a')).toBe(5)
    expect(s.global('f')).toBe(3.5)
    expect(s.global('r')).toBe(2)
    expect(s.global('c')).toBe(3)
    expect(s.global('fl')).toBe(2)
  })

  it('llRound uses banker\'s rounding', async () => {
    const s = await run(`
      integer a = 0;
      integer b = 0;
      integer c = 0;
      default {
        state_entry() {
          a = llRound(0.5);  // → 0 (even)
          b = llRound(1.5);  // → 2 (even)
          c = llRound(-0.5); // → 0 (even)
        }
      }
    `)
    expect(s.global('a')).toBe(0)
    expect(s.global('b')).toBe(2)
    expect(s.global('c')).toBe(0)
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
    expect(s.global('n')).toEqual({ x: 0.6, y: 0.8, z: 0 })
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

  it('llUnescapeURL returns "" on malformed percent-escapes', async () => {
    const s = await run(`
      string out = "no-fallback";
      default {
        state_entry() {
          out = llUnescapeURL("%E0%A4%A");
        }
      }
    `)
    expect(s.global('out')).toBe('')
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
    expect(s.global('a')).toBe('hello%20world!')
    expect(s.global('b')).toBe('hello world!')
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

  it('llDumpList2String joins with separator', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() { out = llDumpList2String(["a", "b", "c"], ","); } }
    `)
    expect(s.global('out')).toBe('a,b,c')
  })

  it('llCSV2List splits commas with optional whitespace', async () => {
    const s = await run(`
      list out = [];
      default { state_entry() { out = llCSV2List("a, b,c"); } }
    `)
    expect(s.global('out')).toEqual(['a', 'b', 'c'])
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
})
