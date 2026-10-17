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
