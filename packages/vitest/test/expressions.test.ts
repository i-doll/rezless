import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

async function run(source: string) {
  const s = await loadScript({ source })
  s.start()
  return s
}

describe('Phase 2 — variables & operators', () => {
  it('declares a global, assigns from a handler, reads back via global()', async () => {
    const s = await run(`
      integer counter = 5;
      default {
        state_entry() {
          counter = counter + 7;
        }
      }
    `)
    expect(s.global('counter')).toBe(12)
  })

  it('declares locals inside a handler', async () => {
    const s = await run(`
      integer total = 0;
      default {
        state_entry() {
          integer a = 10;
          integer b = 20;
          total = a + b;
        }
      }
    `)
    expect(s.global('total')).toBe(30)
  })

  it('promotes int → float in arithmetic', async () => {
    const s = await run(`
      float result = 0;
      default {
        state_entry() {
          result = 3 + 0.5;
        }
      }
    `)
    expect(s.global('result')).toBe(3.5)
  })

  it('integer division truncates toward zero', async () => {
    const s = await run(`
      integer a = 0;
      integer b = 0;
      default {
        state_entry() {
          a = 7 / 2;
          b = -7 / 2;
        }
      }
    `)
    expect(s.global('a')).toBe(3)
    expect(s.global('b')).toBe(-3)
  })

  it('integer arithmetic wraps at 32 bits', async () => {
    const s = await run(`
      integer hi = 0;
      default {
        state_entry() {
          hi = 2147483647 + 1;
        }
      }
    `)
    expect(s.global('hi')).toBe(-2147483648)
  })

  it('compound assignment operators', async () => {
    const s = await run(`
      integer a = 10;
      integer b = 10;
      integer c = 10;
      integer d = 10;
      integer e = 10;
      default {
        state_entry() {
          a += 5;
          b -= 3;
          c *= 2;
          d /= 4;
          e %= 3;
        }
      }
    `)
    expect(s.global('a')).toBe(15)
    expect(s.global('b')).toBe(7)
    expect(s.global('c')).toBe(20)
    expect(s.global('d')).toBe(2)
    expect(s.global('e')).toBe(1)
  })

  it('bitwise operators', async () => {
    const s = await run(`
      integer a = 0;
      integer b = 0;
      integer c = 0;
      integer d = 0;
      integer e = 0;
      default {
        state_entry() {
          a = 0xF0 | 0x0F;
          b = 0xFF & 0x0F;
          c = 0xFF ^ 0x0F;
          d = 1 << 4;
          e = ~0;
        }
      }
    `)
    expect(s.global('a')).toBe(0xff)
    expect(s.global('b')).toBe(0x0f)
    expect(s.global('c')).toBe(0xf0)
    expect(s.global('d')).toBe(16)
    expect(s.global('e')).toBe(-1)
  })

  it('comparison operators return integer 1/0', async () => {
    const s = await run(`
      integer a = 0;
      integer b = 0;
      integer c = 0;
      default {
        state_entry() {
          a = (5 > 3);
          b = (5 == 5);
          c = (5 != 3);
        }
      }
    `)
    expect(s.global('a')).toBe(1)
    expect(s.global('b')).toBe(1)
    expect(s.global('c')).toBe(1)
  })

  it('prefix and postfix ++/--', async () => {
    const s = await run(`
      integer pre = 0;
      integer post = 0;
      integer x = 0;
      default {
        state_entry() {
          x = 5;
          pre = ++x;   // x becomes 6, pre = 6
          post = x--;  // post = 6, x becomes 5
        }
      }
    `)
    expect(s.global('pre')).toBe(6)
    expect(s.global('post')).toBe(6)
    expect(s.global('x')).toBe(5)
  })

  it('reads number literals like Second Life', async () => {
    const s = await run(`
      integer hex = 0x123456789;
      integer big = 99999999999;
      integer wrapped = 3000000000;
      float f = 1.5f;
      integer local = 0;
      float localF = 0;
      default {
        state_entry() {
          local = 4294967296;
          localF = 2.F;
        }
      }
    `)
    expect(s.global('hex')).toBe(-1)
    expect(s.global('big')).toBe(-1)
    expect(s.global('wrapped')).toBe(-1294967296)
    expect(s.global('f')).toBe(1.5)
    expect(s.global('local')).toBe(-1)
    expect(s.global('localF')).toBe(2)
  })

  it('keeps -2147483648 in a global initialiser', async () => {
    const s = await run(`
      integer dec = -2147483648;
      integer hex = -0x80000000;
      integer local = 0;
      default {
        state_entry() {
          local = -2147483648;
        }
      }
    `)
    expect(s.global('dec')).toBe(-2147483648)
    expect(s.global('hex')).toBe(-2147483648)
    expect(s.global('local')).toBe(-2147483648)
  })

  it('keeps -2147483648 in a global vector or rotation component', async () => {
    const s = await run(`
      vector v = <-2147483648, -0x80000000, -1.5>;
      rotation r = <-2147483648, 0, 0, 1>;
      vector local = ZERO_VECTOR;
      default {
        state_entry() {
          local = <-2147483648, -0x80000000, -1.5>;
        }
      }
    `)
    expect(s.global('v')).toEqual({ x: -2147483648, y: -2147483648, z: -1.5 })
    expect(s.global('r')).toMatchObject({ x: -2147483648 })
    expect(s.global('local')).toEqual({ x: -2147483648, y: -2147483648, z: -1.5 })
  })
})

describe('Phase 2 — type coercions', () => {
  it('initialises a global from earlier globals, and again after llResetScript', async () => {
    const s = await run(`
      integer a = 7;
      float b = a;
      vector v = <a, b, -1>;
      list l = [a, v];
      default { state_entry() {} }
    `)
    const check = () => {
      expect(s.global('b')).toBe(7)
      expect(s.global('v')).toEqual({ x: 7, y: 7, z: -1 })
      expect(s.global('l')).toEqual([7, { x: 7, y: 7, z: -1 }])
    }
    check()
    s.reset()
    check()
  })

  it('(integer)"3.7" parses leading digits', async () => {
    const s = await run(`
      integer n = 0;
      default { state_entry() { n = (integer)"3.7"; } }
    `)
    // (integer)"3.7" → 3 (parses "3", stops at ".")
    expect(s.global('n')).toBe(3)
  })

  it('(integer)"  -42abc" handles whitespace, sign, stops at non-digit', async () => {
    const s = await run(`
      integer n = 0;
      default { state_entry() { n = (integer)"  -42abc"; } }
    `)
    expect(s.global('n')).toBe(-42)
  })

  it('(float)"3.14abc" reads numeric prefix', async () => {
    const s = await run(`
      float f = 0;
      default { state_entry() { f = (float)"3.14abc"; } }
    `)
    expect(s.global('f')).toBeCloseTo(3.14)
  })

  it('(integer) of float truncates toward zero', async () => {
    const s = await run(`
      integer a = 0;
      integer b = 0;
      default {
        state_entry() {
          a = (integer)3.7;
          b = (integer)-3.7;
        }
      }
    `)
    expect(s.global('a')).toBe(3)
    expect(s.global('b')).toBe(-3)
  })

  it('(string) of int / float / vector formats per LSL rules', async () => {
    const s = await run(`
      string a = "";
      string b = "";
      string c = "";
      default {
        state_entry() {
          a = (string)42;
          b = (string)3.5;
          c = (string)<1, 2, 3>;
        }
      }
    `)
    expect(s.global('a')).toBe('42')
    expect(s.global('b')).toBe('3.500000')
    expect(s.global('c')).toBe('<1.00000, 2.00000, 3.00000>')
  })

  it('applies a unary operator to a cast: !(integer)s, -(integer)s, ~(integer)s, -(float)s', async () => {
    const s = await run(`
      integer notInt = 0;
      float negFloat = 0;
      integer neg = 0;
      integer inv = 0;
      default {
        state_entry() {
          string zero = "0";
          string five = "5";
          notInt = !(integer)zero;
          negFloat = -(float)five;
          neg = -(integer)five;
          inv = ~(integer)five;
        }
      }
    `)
    expect(s.global('notInt')).toBe(1)
    expect(s.global('negFloat')).toBe(-5)
    expect(s.global('neg')).toBe(-5)
    expect(s.global('inv')).toBe(-6)
  })
})

describe('Phase 2 — vectors and rotations', () => {
  it('component access', async () => {
    const s = await run(`
      float vx = 0;
      float vy = 0;
      float vz = 0;
      default {
        state_entry() {
          vector v = <1.0, 2.0, 3.0>;
          vx = v.x;
          vy = v.y;
          vz = v.z;
        }
      }
    `)
    expect(s.global('vx')).toBe(1)
    expect(s.global('vy')).toBe(2)
    expect(s.global('vz')).toBe(3)
  })

  it('vector + vector', async () => {
    const s = await run(`
      vector r = <0,0,0>;
      default {
        state_entry() {
          r = <1, 2, 3> + <10, 20, 30>;
        }
      }
    `)
    expect(s.global('r')).toEqual({ x: 11, y: 22, z: 33 })
  })

  it('vector * float scales', async () => {
    const s = await run(`
      vector r = <0,0,0>;
      default {
        state_entry() {
          r = <1, 2, 3> * 2.5;
        }
      }
    `)
    expect(s.global('r')).toEqual({ x: 2.5, y: 5, z: 7.5 })
  })

  it('vector * vector → dot product (float)', async () => {
    const s = await run(`
      float d = 0;
      default {
        state_entry() {
          d = <1, 2, 3> * <4, 5, 6>;
        }
      }
    `)
    expect(s.global('d')).toBe(1 * 4 + 2 * 5 + 3 * 6)
  })

  it('vector % vector → cross product', async () => {
    const s = await run(`
      vector r = <0,0,0>;
      default {
        state_entry() {
          r = <1, 0, 0> % <0, 1, 0>;
        }
      }
    `)
    expect(s.global('r')).toEqual({ x: 0, y: 0, z: 1 })
  })

  it('member assignment via .x', async () => {
    const s = await run(`
      vector v = <1, 2, 3>;
      default {
        state_entry() {
          v.x = 99;
        }
      }
    `)
    expect(s.global('v')).toEqual({ x: 99, y: 2, z: 3 })
  })
})

describe('Phase 2 — lists', () => {
  it('list literal + length via white-box global', async () => {
    const s = await run(`
      list xs = [];
      default {
        state_entry() {
          xs = [1, 2, 3];
        }
      }
    `)
    expect(s.global('xs')).toEqual([1, 2, 3])
  })

  it('list + value appends; value + list prepends', async () => {
    const s = await run(`
      list a = [];
      list b = [];
      default {
        state_entry() {
          a = [1, 2] + 3;
          b = 0 + [1, 2];
        }
      }
    `)
    expect(s.global('a')).toEqual([1, 2, 3])
    expect(s.global('b')).toEqual([0, 1, 2])
  })

  it('list + list flattens (LSL has no nested lists)', async () => {
    const s = await run(`
      list r = [];
      default {
        state_entry() {
          r = [1, 2] + [3, 4];
        }
      }
    `)
    expect(s.global('r')).toEqual([1, 2, 3, 4])
  })
})

describe('32-bit floats', () => {
  it('rounds float arithmetic and int → float promotion to 32 bits', async () => {
    const s = await run(`
      integer bigSum = 0;
      integer promoted = 0;
      integer tenths = 0;
      integer mixed = 0;
      default {
        state_entry() {
          float a = 16777216.0;
          float b = a + 1.0;
          integer i = 16777217;
          float c = i;
          bigSum = b == a;
          promoted = c == a;
          tenths = 0.1 + 0.2 == 0.3;
          mixed = 16777217 * 1.0 == a;
        }
      }
    `)
    expect(s.global('bigSum')).toBe(1)
    expect(s.global('promoted')).toBe(1)
    expect(s.global('tenths')).toBe(1)
    expect(s.global('mixed')).toBe(1)
  })

  it('rounds vector and rotation arithmetic to 32 bits', async () => {
    const s = await run(`
      vector v = ZERO_VECTOR;
      rotation r = ZERO_ROTATION;
      float dot = 0;
      default {
        state_entry() {
          v = <0.1, 0.2, 16777216.0> + <0.2, 0.1, 1.0>;
          r = <0.1, 0.2, 0.3, 0.4> + <0.2, 0.1, 0.0, 0.0>;
          dot = <0.1, 0.2, 0.3> * <0.3, 0.2, 0.1>;
        }
      }
    `)
    expect(s.global('v')).toEqual({ x: Math.fround(0.3), y: Math.fround(0.3), z: 16777216 })
    expect(s.global('r')).toMatchObject({ x: Math.fround(0.3), y: Math.fround(0.3) })
    expect(Math.fround(s.global('dot') as number)).toBe(s.global('dot'))
  })

  it('rounds floats parsed from strings and returned by builtins to 32 bits', async () => {
    const s = await run(`
      float parsed = 0;
      vector pv = ZERO_VECTOR;
      float fromList = 0;
      float root = 0;
      default {
        state_entry() {
          parsed = (float)"0.1";
          pv = (vector)"<0.1, 0.2, 0.3>";
          fromList = llList2Float(["0.1"], 0);
          root = llSqrt(2.0);
        }
      }
    `)
    expect(s.global('parsed')).toBe(Math.fround(0.1))
    expect(s.global('pv')).toEqual({ x: Math.fround(0.1), y: Math.fround(0.2), z: Math.fround(0.3) })
    expect(s.global('fromList')).toBe(Math.fround(0.1))
    expect(s.global('root')).toBe(Math.fround(Math.SQRT2))
  })

  it('promotes integer arguments and vector scalars to 32-bit floats first', async () => {
    const s = await run(`
      float sine = 0;
      vector scaled = ZERO_VECTOR;
      vector divided = ZERO_VECTOR;
      default {
        state_entry() {
          sine = llSin(16777217);
          scaled = <0.1, 0, 0> * 16777217;
          divided = <1, 0, 0> / 16777217;
        }
      }
    `)
    expect(s.global('sine')).toBe(Math.fround(Math.sin(16777216)))
    expect((s.global('scaled') as { x: number }).x).toBe(Math.fround(Math.fround(0.1) * 16777216))
    expect((s.global('divided') as { x: number }).x).toBe(Math.fround(1 / 16777216))
  })

  it('rounds float constants, global vector literals and mixed equality to 32 bits', async () => {
    const s = await run(`
      vector gv = <16777217, 0.1, 0>;
      rotation gr = <16777217, 0, 0, 1>;
      float pi = 0;
      integer same = 0;
      integer differ = 1;
      integer localSame = 0;
      default {
        state_entry() {
          pi = PI;
          same = 16777217 == 16777216.0;
          differ = 16777217 != 16777216.0;
          localSame = gv == <16777217, 0.1, 0>;
        }
      }
    `)
    expect(s.global('gv')).toEqual({ x: 16777216, y: Math.fround(0.1), z: 0 })
    expect(s.global('gr')).toMatchObject({ x: 16777216 })
    expect(s.global('pi')).toBe(Math.fround(3.14159265))
    expect(s.global('same')).toBe(1)
    expect(s.global('differ')).toBe(0)
    expect(s.global('localSame')).toBe(1)
  })

  it('keeps a parsed float too large for 32 bits as infinity', async () => {
    const s = await run(`
      float f = 0;
      default { state_entry() { f = (float)"3.403e38"; } }
    `)
    expect(s.global('f')).toBe(Infinity)
  })
})

describe('print', () => {
  it('evaluates its argument and takes its value', async () => {
    const s = await run(`
      integer n = 0;
      integer r;
      string t;
      default {
        state_entry() {
          print(n++);
          r = print(n) + 10;
          t = print("a") + "b";
        }
      }
    `)
    expect(s.global('n')).toBe(1)
    expect(s.global('r')).toBe(10)
    expect(s.global('t')).toBe('b')
  })

  it('yields the zero value of its argument type', async () => {
    // In-world: (string)(print(3) + 1) = 1; print of integer, float, string and vector yields the zero value.
    const s = await run(`
      string r;
      float f;
      default { state_entry() { r = (string)(print(3) + 1); f = print(2.5) + 1.5; } }
    `)
    expect(s.global('r')).toBe('1')
    expect(s.global('f')).toBe(1.5)
  })

  it('halts on entering a handler that uses the value of a key print, before any statement runs', async () => {
    // In-world: a timer with (key)"x" == print((key)"k") in a branch that never runs said nothing, reported
    // "Script run-time error" and "System.InvalidProgramException: Invalid IL code in LSL :timer (): IL_...",
    // and a later touch got no reply.
    const s = await loadScript({
      source: `
        integer r;
        default {
          touch_start(integer n) { llSay(0, "touch ok"); }
          timer() {
            llSay(0, "before");
            r = 1;
            if (r == 2) { llSay(0, (string)((key)"x" == print((key)"k"))); }
            llSay(0, "after");
          }
        }
      `,
    })
    expect(() => s.fire('timer')).toThrow('System.InvalidProgramException')
    expect(s.running).toBe(false)
    expect(s.global('r')).toBe(0)
    s.fire('touch_start', { num_detected: 1 })
    expect(s.chat.map((c) => c.text)).toEqual([
      'Script run-time error',
      'System.InvalidProgramException: Invalid IL code in LSL :timer ()',
    ])
  })

  it('halts on entering a user function that uses the value of a key print', async () => {
    // Unmeasured: a user function failing on entry like a handler, and its name in the message.
    const s = await loadScript({
      source: `
        integer r;
        f() { r = 2; if (r == 3) r = ((key)"x" == print((key)"k")); }
        default { state_entry() { r = 1; f(); r = 3; } }
      `,
    })
    expect(() => s.start()).toThrow('System.InvalidProgramException')
    expect(s.running).toBe(false)
    expect(s.global('r')).toBe(1)
    expect(s.chat.map((c) => c.text)).toEqual([
      'Script run-time error',
      'System.InvalidProgramException: Invalid IL code in LSL :f ()',
    ])
  })

  it('still runs a key print used as a statement', async () => {
    const s = await run(`
      integer r;
      default { state_entry() { print((key)"k"); r = 1; } }
    `)
    expect(s.global('r')).toBe(1)
  })
})
