import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

async function run(source: string) {
  const s = await loadScript({ source })
  s.start()
  return s
}

/**
 * LSL has a handful of behaviours that surprise people coming from C / JS.
 * These tests pin them down so future refactors don't quietly break them.
 */
describe('Phase 2 — LSL quirks', () => {
  it('&& and || are NOT short-circuit', async () => {
    // If && short-circuited, side effects of the right operand wouldn't run.
    const s = await run(`
      integer flag = 0;
      integer side() { flag = 1; return 0; }
      default {
        state_entry() {
          // 0 && side() — in C this skips side(); in LSL it runs both.
          integer ignore = (0 && side());
        }
      }
    `)
    expect(s.global('flag')).toBe(1)
  })

  it('list == list compares LENGTHS, not contents', async () => {
    const s = await run(`
      integer eq = 0;
      default {
        state_entry() {
          // [1,2,3] vs [9,9,9] — same length, different contents
          eq = ([1, 2, 3] == [9, 9, 9]);
        }
      }
    `)
    expect(s.global('eq')).toBe(1)
  })

  it('vector == vector is component-wise', async () => {
    const s = await run(`
      integer eq1 = 0;
      integer eq2 = 0;
      default {
        state_entry() {
          eq1 = (<1, 2, 3> == <1, 2, 3>);
          eq2 = (<1, 2, 3> == <1, 2, 4>);
        }
      }
    `)
    expect(s.global('eq1')).toBe(1)
    expect(s.global('eq2')).toBe(0)
  })

  it('NULL_KEY is falsy; a valid UUID is truthy', async () => {
    const s = await run(`
      integer a = 0;
      integer b = 0;
      default {
        state_entry() {
          key empty = "00000000-0000-0000-0000-000000000000";
          key real = "11111111-2222-3333-4444-555555555555";
          if (empty) a = 1;
          if (real)  b = 1;
        }
      }
    `)
    expect(s.global('a')).toBe(0)
    expect(s.global('b')).toBe(1)
  })

  it('logical ! is integer-only (SL rejects !key with "Type mismatch")', async () => {
    for (const decl of ['key v = NULL_KEY;', 'float v = 1.0;', 'string v = "";']) {
      await expect(
        loadScript({ source: `default { state_entry() { ${decl} integer r = !v; } }` }),
      ).rejects.toThrow(/Type mismatch/)
    }
  })

  it('compound assignment to vector member preserves other components', async () => {
    const s = await run(`
      vector v = <1, 2, 3>;
      default {
        state_entry() {
          v.x += 10;
          v.z *= 2;
        }
      }
    `)
    expect(s.global('v')).toEqual({ x: 11, y: 2, z: 6 })
  })

  it('rotation .s component is accessible on rotation, not on vector', async () => {
    const s = await run(`
      float qs = 0;
      default {
        state_entry() {
          rotation r = <0, 0, 0, 1>;
          qs = r.s;
        }
      }
    `)
    expect(s.global('qs')).toBe(1)
  })

  it('division by zero (integer) throws Math Error', async () => {
    const s = await loadScript({
      source: `default { state_entry() { integer x = 1 / 0; } }`,
    })
    expect(() => s.start()).toThrow(/Math Error: divide by zero/)
  })

  it('a list used as a list element throws at runtime', async () => {
    const s = await loadScript({
      source: `default { state_entry() { list x = [2]; list y = [x]; } }`,
    })
    expect(() => s.start()).toThrow(/Lists may not contain lists/)
  })

  it('an empty list used as a list element still throws', async () => {
    const s = await loadScript({
      source: `default { state_entry() { list once = []; list twice = [once, once]; } }`,
    })
    expect(() => s.start()).toThrow(/Lists may not contain lists/)
  })

  it('a list cast used as a list element throws', async () => {
    const s = await loadScript({
      source: `default { state_entry() { list y = [(list)1]; } }`,
    })
    expect(() => s.start()).toThrow(/Lists may not contain lists/)
  })

  it('a global list used as a global list element throws on load', async () => {
    await expect(
      loadScript({ source: `list a = [1]; list b = [a]; default { state_entry() {} }` }),
    ).rejects.toThrow(/Lists may not contain lists/)
  })

  it('list-to-string concatenates elements with no separator', async () => {
    const s = await run(`
      string out = "";
      default {
        state_entry() {
          out = (string)["a", "b", "c"];
        }
      }
    `)
    expect(s.global('out')).toBe('abc')
  })

  it('quaternion multiplication composes rotations', async () => {
    // A 180° rotation about z, applied twice, is identity.
    const s = await run(`
      rotation result = <0, 0, 0, 1>;
      default {
        state_entry() {
          rotation r = <0, 0, 1, 0>;  // 180° around z
          result = r * r;
        }
      }
    `)
    const r = s.global('result') as { x: number; y: number; z: number; s: number }
    expect(r.x).toBeCloseTo(0)
    expect(r.y).toBeCloseTo(0)
    expect(r.z).toBeCloseTo(0)
    expect(Math.abs(r.s)).toBeCloseTo(1)
  })
})

/** Each expected value here was measured on the main grid (Mono). */
describe('SL parity — values and operators', () => {
  const globals = async (decls: string, body: string) => {
    const s = await run(`${decls}\ndefault { state_entry() { ${body} } }`)
    return (name: string) => s.global(name)
  }

  it('multiplies rotations as "a then b"', async () => {
    const g = await globals(
      'vector r1; vector r2; rotation ab; vector d1; vector d2;',
      `rotation a = llEuler2Rot(<0, 0, PI_BY_TWO>);
       rotation b = llEuler2Rot(<PI_BY_TWO, 0, 0>);
       vector v = <1, 0, 0>;
       r1 = (v * a) * b; r2 = v * (a * b); ab = a * b;
       d1 = (v * a) / b; d2 = v * (a / b);`,
    )
    const close = (actual: unknown, expected: Record<string, number>) => {
      for (const [k, want] of Object.entries(expected)) {
        expect((actual as Record<string, number>)[k]).toBeCloseTo(want, 5)
      }
    }
    close(g('r1'), { x: 0, y: 0, z: 1 })
    close(g('r2'), { x: 0, y: 0, z: 1 })
    close(g('ab'), { x: 0.5, y: -0.5, z: 0.5, s: 0.5 })
    close(g('d1'), { x: 0, y: 0, z: -1 })
    close(g('d2'), { x: 0, y: 0, z: -1 })
  })

  it('gives && and || the same precedence', async () => {
    const g = await globals('integer r;', 'r = 1 || 0 && 0;')
    expect(g('r')).toBe(0)
  })

  it('evaluates the right operand of a binary operator first', async () => {
    const g = await globals(
      'string log; integer sum; integer f(integer n) { log += (string)n; return n; }',
      'integer i = 1; sum = i + (i = 5); f(1) + f(2);',
    )
    expect(g('log')).toBe('21')
    expect(g('sum')).toBe(10)
  })

  it('evaluates call arguments and list elements left to right', async () => {
    const g = await globals(
      'string log; integer f(integer n) { log += (string)n; return n; }',
      'list l = [f(1), f(2)]; llAbs(f(3)); vector v = <f(4), f(5), f(6)>;',
    )
    expect(g('log')).toBe('123456')
  })

  it('casts vectors and rotations to strings with 5 decimals', async () => {
    const g = await globals('string v; string r;', 'v = (string)<1,2,3>; r = (string)<1,2,3,4>;')
    expect(g('v')).toBe('<1.00000, 2.00000, 3.00000>')
    expect(g('r')).toBe('<1.00000, 2.00000, 3.00000, 4.00000>')
  })

  it('uses the element type when turning list floats into strings', async () => {
    const g = await globals(
      'string cast; string elem; string json;',
      `cast = (string)[2.0, 1, 2.5];
       elem = llList2String([2.0], 0);
       json = llList2Json(JSON_ARRAY, [1.0, 2.5]);`,
    )
    expect(g('cast')).toBe('2.00000012.500000')
    expect(g('elem')).toBe('2.000000')
    expect(g('json')).toBe('[1.000000,2.500000]')
  })

  it('makes list != the length difference', async () => {
    const g = await globals('integer a; integer b; integer c;', 'a = [1,2,3] != []; b = [] != [1,2]; c = [1] != [2];')
    expect(g('a')).toBe(3)
    expect(g('b')).toBe(-2)
    expect(g('c')).toBe(0)
  })

  it('prints floats with about 7 significant digits, then 6 decimals', async () => {
    const g = await globals('string a; string b;', 'a = (string)123456789.0; b = (string)1e30;')
    expect(g('a')).toBe('123456800.000000')
    expect(g('b')).toBe('1000000000000000000000000000000.000000')
  })

  it('keeps the sign of a negative zero', async () => {
    const g = await globals(
      'string a; string b; string c; string d;',
      'float zero = 0.0; a = (string)zero; b = (string)-0.0; c = (string)(zero * -1.0); d = (string)<-0.0, 0.0, 0.0>;',
    )
    expect(g('a')).toBe('0.000000')
    expect(g('b')).toBe('-0.000000')
    expect(g('c')).toBe('-0.000000')
    expect(g('d')).toBe('<-0.00000, 0.00000, 0.00000>')
  })

  it('prints infinity and NaN as Infinity, -Infinity and NaN', async () => {
    const g = await globals(
      'string a; string b; string c;',
      'float inf = (float)"inf"; a = (string)inf; b = (string)(-inf); c = (string)(inf * 0);',
    )
    expect(g('a')).toBe('Infinity')
    expect(g('b')).toBe('-Infinity')
    expect(g('c')).toBe('NaN')
  })

  it('parses inf, nan, overflow and hex floats from strings', async () => {
    const g = await globals(
      'float a; float b; float c; float d; float e;',
      'a = (float)"inf"; b = (float)"nan"; c = (float)"1e39"; d = (float)"1e400"; e = (float)"0x1p4";',
    )
    expect(g('a')).toBe(Infinity)
    expect(g('b')).toBeNaN()
    expect(g('c')).toBe(Infinity)
    expect(g('d')).toBe(Infinity)
    expect(g('e')).toBe(16)
  })

  it('casts out-of-range, NaN and infinite floats to -2147483648', async () => {
    const g = await globals(
      'integer a; integer b; integer c; integer d;',
      'float inf = (float)"inf"; a = (integer)1e10; b = (integer)-1e10; c = (integer)inf; d = (integer)(inf * 0);',
    )
    expect(g('a')).toBe(-2147483648)
    expect(g('b')).toBe(-2147483648)
    expect(g('c')).toBe(-2147483648)
    expect(g('d')).toBe(-2147483648)
  })

  it('keeps the measured string-to-integer wrap and integer *= float truncation', async () => {
    const g = await globals('integer a; integer b = 7;', 'a = (integer)"3000000000"; b *= 1.5;')
    expect(g('a')).toBe(-1294967296)
    expect(g('b')).toBe(10)
  })

  it('prints a float that rounds to zero as 0.000000 unless it is exactly -0.0', async () => {
    // In-world: (string)(-0.0000004) = 0.000000, (string)((float)"-0") = -0.000000
    const g = await globals(
      'string a; string b; string c;',
      'a = (string)(-0.0000004); b = (string)((float)"-0"); c = (string)(0.0000004);',
    )
    expect(g('a')).toBe('0.000000')
    expect(g('b')).toBe('-0.000000')
    expect(g('c')).toBe('0.000000')
  })

  it('parses vectors and rotations from strings like SL', async () => {
    const g = await globals(
      'vector a; vector b; vector c; vector d; rotation e; rotation f; rotation h;',
      `a = (vector)"<1,2,3>junk"; b = (vector)"<1,2,3"; c = (vector)"<1,2,3,4>"; d = (vector)" <1,2,3>";
       e = (rotation)"<1,2,3,4>junk"; f = (rotation)"<1,2,3,4,5>"; h = (rotation)" <1,2,3,4>";`,
    )
    expect(g('a')).toEqual({ x: 1, y: 2, z: 3 })
    expect(g('b')).toEqual({ x: 1, y: 2, z: 3 })
    expect(g('c')).toEqual({ x: 1, y: 2, z: 3 })
    expect(g('d')).toEqual({ x: 0, y: 0, z: 0 })
    expect(g('e')).toEqual({ x: 1, y: 2, z: 3, s: 4 })
    expect(g('f')).toEqual({ x: 1, y: 2, z: 3, s: 4 })
    expect(g('h')).toEqual({ x: 0, y: 0, z: 0, s: 1 })
  })

  it('reads list strings as integers the way (integer) does', async () => {
    const g = await globals('integer a; integer b;', 'a = llList2Integer(["0x10"], 0); b = llList2Integer(["3.9"], 0);')
    expect(g('a')).toBe(16)
    expect(g('b')).toBe(3)
  })

  it('prints floats in lists with 7 significant digits, but llList2CSV and llList2Json with exact %f digits', async () => {
    const g = await globals(
      'string dump; string nonfinite; string elem; string csv; string csvNonfinite; string json; string jsonNonfinite;',
      `float inf = (float)"inf"; float nan = (float)"nan";
       dump = llDumpList2String([123456789.0, 1e30, 0.1234567], ",");
       nonfinite = llDumpList2String([nan, -inf], ",");
       elem = llList2String([123456789.0], 0);
       csv = llList2CSV([123456789.0, 1e30, 0.1234567]);
       csvNonfinite = llList2CSV([nan, -inf, inf]);
       json = llList2Json(JSON_ARRAY, [123456789.0, 1e30, 0.1234567, 1e-7]);
       jsonNonfinite = llList2Json(JSON_ARRAY, [nan, inf]);`,
    )
    expect(g('dump')).toBe('123456800.000000,1000000000000000000000000000000.000000,0.123457')
    expect(g('nonfinite')).toBe('NaN,-Infinity')
    expect(g('elem')).toBe('123456800.000000')
    expect(g('csv')).toBe('123456792.000000, 1000000015047466219876688855040.000000, 0.123457')
    expect(g('csvNonfinite')).toBe('nan, -inf, inf')
    expect(g('json')).toBe('[123456792.000000,1000000015047466219876688855040.000000,0.123457,0.000000]')
    expect(g('jsonNonfinite')).toBe('[nan,inf]')
  })

  it('prints vectors with 5 decimals when cast, 6 inside lists, exact digits in CSV and JSON', async () => {
    const g = await globals(
      'string cast; string inList; string elem; string dump; string csv; string csvBig; string rot; string json;',
      `cast = (string)<123456789.0, 0.1234567, 0>;
       inList = (string)[<1,2,3>];
       elem = llList2String([<1,2,3>], 0);
       dump = llDumpList2String([<1,2,3>], ",");
       csv = llList2CSV([<1,2,3>]);
       csvBig = llList2CSV([<123456789.0, 0.1234567, 0>]);
       rot = (string)[<1,2,3,4>];
       json = llList2Json(JSON_ARRAY, [<1,2,3>]);`,
    )
    const six = '<1.000000, 2.000000, 3.000000>'
    expect(g('cast')).toBe('<123456800.00000, 0.12346, 0.00000>')
    expect(g('inList')).toBe(six)
    expect(g('elem')).toBe(six)
    expect(g('dump')).toBe(six)
    expect(g('csv')).toBe(six)
    expect(g('csvBig')).toBe('<123456792.000000, 0.123457, 0.000000>')
    expect(g('rot')).toBe('<1.000000, 2.000000, 3.000000, 4.000000>')
    expect(g('json')).toBe(`["${six}"]`)
  })

  it.each([
    ['<1, 2, 3>', [1, 2, 3]],
    ['< 1,2,3>', [1, 2, 3]],
    ['<1,\t2,3>', [1, 2, 3]],
    ['<1,2,3 >', [1, 2, 3]],
    ['<1,2,3,>', [1, 2, 3]],
    ['<+1,-2,.5>', [1, -2, 0.5]],
    ['<1e2,0x10,inf>', [100, 16, Infinity]],
    ['<1,2 ,3>', [0, 0, 0]],
    ['<1 ,2,3>', [0, 0, 0]],
    ['< 1, 2 , 3 >', [0, 0, 0]],
    ['<1x,2,3>', [0, 0, 0]],
    ['<1,2>', [0, 0, 0]],
    [' <1,2,3>', [0, 0, 0]],
  ])('reads (vector)%j like sscanf', async (text, [x, y, z]) => {
    const g = await globals('vector v;', `v = (vector)${JSON.stringify(text)};`)
    expect(g('v')).toEqual({ x, y, z })
  })

  it.each([
    ['<1, 2, 3, 4>', [1, 2, 3, 4]],
    ['<1,2,3,4,5>', [1, 2, 3, 4]],
    ['<1,2,3>', [0, 0, 0, 1]],
  ])('reads (rotation)%j like sscanf', async (text, [x, y, z, s]) => {
    const g = await globals('rotation r;', `r = (rotation)${JSON.stringify(text)};`)
    expect(g('r')).toEqual({ x, y, z, s })
  })
})

describe('SL parity — chat', () => {
  const TARGET = 'a2e76fcd-9360-4f6d-a924-000000000001'

  it('cuts every chat message to 1024 UTF-8 bytes', async () => {
    const s = await run(`
      string rep(string c, integer n) { string s; while (n-- > 0) s += c; return s; }
      default {
        state_entry() {
          llSay(1, rep("x", 1100));
          llShout(1, rep("x", 1100));
          llWhisper(1, rep("x", 1100));
          llRegionSay(1, rep("x", 1100));
          llOwnerSay(rep("x", 1100));
          llRegionSayTo("${TARGET}", 1, rep("x", 1100));
          llInstantMessage("${TARGET}", rep("x", 1100));
          llSay(1, rep("é", 600));
          llSay(1, "x" + rep("é", 600));
          llSay(1, rep("x", 1024));
        }
      }
    `)
    expect(s.chat.map((c) => c.text.length)).toEqual([
      1024, 1024, 1024, 1024, 1024, 1024, 1024, 512, 512, 1024,
    ])
  })

  it('llRegionSayTo records the target and allows channel 0', async () => {
    const s = await run(`
      default {
        state_entry() {
          llRegionSayTo("${TARGET}", 0, "psst");
          llRegionSayTo("${TARGET}", -42, "cmd");
        }
      }
    `)
    expect(s.chat).toEqual([
      { channel: 0, text: 'psst', type: 'regionSayTo', to: TARGET },
      { channel: -42, text: 'cmd', type: 'regionSayTo', to: TARGET },
    ])
  })

  it('llInstantMessage records the recipient and sleeps 2 seconds', async () => {
    const s = await run(`
      float took;
      default {
        state_entry() {
          llInstantMessage("${TARGET}", "hello");
          took = llGetTime();
        }
      }
    `)
    expect(s.chat).toEqual([{ channel: 0, text: 'hello', type: 'im', to: TARGET }])
    expect(s.global('took')).toBeCloseTo(2)
  })
})

describe('SL parity — rotations in lists', () => {
  // Measured in Second Life, 2026-10-30.
  it('format like vectors in each list function', async () => {
    const s = await run(`
      string json; string obj; string csv; string dump; string cast;
      default {
        state_entry() {
          rotation r = <123456789.0, 0.1234567, -1.5, 1.0>;
          json = llList2Json(JSON_ARRAY, [r]);
          obj = llList2Json(JSON_OBJECT, ["r", <1, 2, 3, 4>]);
          csv = llList2CSV([r]);
          dump = llDumpList2String([r], ",");
          cast = (string)r;
        }
      }
    `)
    expect(s.global('json')).toBe('["<123456792.000000, 0.123457, -1.500000, 1.000000>"]')
    expect(s.global('obj')).toBe('{"r":"<1.000000, 2.000000, 3.000000, 4.000000>"}')
    expect(s.global('csv')).toBe('<123456792.000000, 0.123457, -1.500000, 1.000000>')
    expect(s.global('dump')).toBe('<123456800.000000, 0.123457, -1.500000, 1.000000>')
    expect(s.global('cast')).toBe('<123456800.00000, 0.12346, -1.50000, 1.00000>')
  })
})

describe('llBase64ToString replacement characters', () => {
  it('keeps a real U+FFFD and replaces only invalid bytes and NUL', async () => {
    const replacement = String.fromCodePoint(0xfffd)
    const bom = String.fromCodePoint(0xfeff)
    const s = await run(`
      string kept; string invalid; string nul; string badTail; string cutShort; string bom;
      default {
        state_entry() {
          kept = llBase64ToString(llStringToBase64("a${replacement}b"));
          invalid = llBase64ToString("/w==");
          nul = llBase64ToString("YQBi");
          badTail = llBase64ToString("w0E=");
          cutShort = llBase64ToString("ww==");
          bom = llBase64ToString(llStringToBase64("a${bom}b"));
        }
      }
    `)
    expect(s.global('kept')).toBe(`a${replacement}b`)
    expect(s.global('invalid')).toBe('?')
    expect(s.global('nul')).toBe('a?b')
    // Not measured in-world: a lead byte with a bad or missing continuation
    // follows the measured single-byte rule, one ? per invalid byte.
    expect(s.global('badTail')).toBe('?A')
    expect(s.global('cutShort')).toBe('?')
    expect(s.global('bom')).toBe(`a${bom}b`)
  })
})
