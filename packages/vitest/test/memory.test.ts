import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

// Measured in Second Life (Mono, 2026-10-30), issue #115. The in-world probe
// scripts weren't kept, so the calibration scripts below rebuild them from
// their descriptions.

async function run(source: string, options: { memoryLimit?: boolean } = {}) {
  const s = await loadScript({ source, ...options })
  s.start()
  return s
}

/** Numbers the script said on channel 7357, in order. */
function reports(s: { chat: ReadonlyArray<{ channel: number; text: string }> }): number[] {
  return s.chat.filter((c) => c.channel === 7357).map((c) => Number(c.text.replace(/^used /, '')))
}

const REPORT = 'llSay(7357, "used " + (string)llGetUsedMemory());'
const repeat = (line: string, n: number) =>
  Array.from({ length: n }, (_, i) => line.replaceAll('#', String(i))).join('\n')
const withBase = (globals: string, body: string, handlers = '', states = '') =>
  `${globals}\ndefault { state_entry() { ${body} ${REPORT} } ${handlers} }\n${states}`
const EMPTY_HANDLERS = [
  'touch_start(integer n) {}',
  'touch(integer n) {}',
  'touch_end(integer n) {}',
  'timer() {}',
  'listen(integer c, string n, key k, string m) {}',
  'on_rez(integer p) {}',
  'changed(integer c) {}',
  'attach(key id) {}',
  'sensor(integer n) {}',
  'no_sensor() {}',
].join('\n')

// [description, script, llGetUsedMemory measured in-world, tolerance]
const CODE_CALIBRATION: ReadonlyArray<readonly [string, string, number, number]> = [
  ['minimal reporting script', 'default { state_entry() { llSay(7357, (string)llGetUsedMemory()); } }', 3364, 0],
  ['report with a string concatenation', withBase('', ''), 3876, 0],
  ['+25 x = x + 1;', withBase('', `integer x; ${repeat('x = x + 1;', 25)}`), 3876, 0],
  ['+50 x = x + 1;', withBase('', `integer x; ${repeat('x = x + 1;', 50)}`), 3876, 512],
  ['+100 x = x + 1;', withBase('', `integer x; ${repeat('x = x + 1;', 100)}`), 4900, 0],
  ['+200 x = x + 1;', withBase('', `integer x; ${repeat('x = x + 1;', 200)}`), 5412, 0],
  ['+100 if (x) x = 2;', withBase('', `integer x; ${repeat('if (x) x = 2;', 100)}`), 4900, 0],
  ['+100 llSay(0, "a");', withBase('', repeat('llSay(0, "a");', 100)), 7460, 0],
  ['+10 empty functions', withBase(repeat('f#() {}', 10), ''), 3876, 0],
  ['+10 empty states', withBase('', '', '', repeat('state s# { state_entry() {} }', 10)), 3876, 0],
  ['+10 small functions', withBase(repeat('integer f#(integer a) { return a + 1; }', 10), ''), 4388, 0],
  ['+10 empty event handlers', withBase('', '', EMPTY_HANDLERS), 4388, 0],
  ['+1153-char string literal', withBase('', `llSay(0, "${'a'.repeat(1153)}");`), 5924, 0],
  ['+10 vector globals', withBase(repeat('vector v#;', 10), ''), 4508, 0],
  ['+10 rotation globals', withBase(repeat('rotation r#;', 10), ''), 4548, 0],
  ['+10 list globals [1, 2, 3]', withBase(repeat('list g# = [1, 2, 3];', 10), ''), 5308, 40],
]

describe('script memory: code and baseline', () => {
  it.each(CODE_CALIBRATION)('%s', async (_, source, measured, tolerance) => {
    const s = await run(source)
    const [used] = reports(s)
    expect(Math.abs(used! - measured)).toBeLessThanOrEqual(tolerance)
  })
})

/** Memory taken by running `change` in state_entry, with `globals` declared. */
async function cost(globals: string, change: string): Promise<number> {
  const s = await run(`
    ${globals}
    default {
      state_entry() {
        integer before = llGetUsedMemory();
        ${change}
        llSay(7357, (string)(llGetUsedMemory() - before));
      }
    }
  `)
  return reports(s)[0]!
}

describe('script memory: values', () => {
  it.each([
    ['integer', 'integer g;', 4],
    ['float', 'float g;', 4],
    ['vector', 'vector g;', 12],
    ['rotation', 'rotation g;', 16],
    ['unset key', 'key g;', 4],
    ['key with 36 characters', 'key g = "a0b1c2d3-0000-1111-2222-333344445555";', 4],
    ['empty string', 'string g;', 18],
    ['10-character string', 'string g = "abcdefghij";', 38],
    ['empty list', 'list g;', 40],
  ])('a %s global', async (_, decl, bytes) => {
    const without = await run(`default { state_entry() { ${REPORT} } }`)
    const s = await run(`${decl}\ndefault { state_entry() { ${REPORT} } }`)
    // The declaration's code stays inside the same 512-byte block.
    expect(reports(s)[0]! - reports(without)[0]!).toBe(bytes)
  })

  it('a global string grows by 2 bytes a character', async () => {
    expect(await cost('string g;', 'g = "abcdefghij";')).toBe(20)
    expect(await cost('string g;', `g = "${'a'.repeat(1024)}";`)).toBe(2048)
  })

  it('a global key costs nothing beyond its reference, whatever it holds', async () => {
    expect(await cost('key g;', 'g = llGenerateKey();')).toBe(0)
    expect(await cost('key g;', `g = "${'a'.repeat(1024)}";`)).toBe(0)
  })

  it.each([
    ['integer', '[1]', 16],
    ['float', '[1.5]', 16],
    ['vector', '[<1, 2, 3>]', 24],
    ['rotation', '[<1, 2, 3, 4>]', 28],
    ['1-character string', '["a"]', 20],
    ['100-character string', `["${'a'.repeat(100)}"]`, 218],
    ['1024-character string', `["${'a'.repeat(1024)}"]`, 2066],
    ['36-character key', '[(key)"a0b1c2d3-0000-1111-2222-333344445555"]', 102],
    ['36-character string', '["a0b1c2d3-0000-1111-2222-333344445555"]', 90],
  ])('a list element: %s', async (_, element, bytes) => {
    expect(await cost('list g;', `g = ${element};`)).toBe(bytes)
  })

  it('counts every element of a list, 16 bytes per integer', async () => {
    expect(await cost('list g;', 'integer i; for (i = 0; i < 300; i++) g += [i];')).toBe(300 * 16)
  })

  it('clearing a list gives its memory back at once', async () => {
    expect(await cost('list g = [1, 2, 3];', 'g = [];')).toBe(-48)
  })

  it('a local string counts, a local key only through its frame', async () => {
    expect(await cost('', `string s = "${'a'.repeat(1024)}";`)).toBe(2066)
    expect(await cost('', 'key k = llGenerateKey();')).toBe(0)
  })

  it('a local list counts while it is in scope', async () => {
    const s = await run(`
      default {
        state_entry() {
          integer before = llGetUsedMemory();
          {
            list l = [1, 2, 3];
            llSay(7357, (string)(llGetUsedMemory() - before));
          }
          llSay(7357, (string)(llGetUsedMemory() - before));
        }
      }
    `)
    expect(reports(s)).toEqual([88, 0])
  })

  it('a shrunk global string gives its memory back at once', async () => {
    const s = await run(`
      string g = "abcdefghij";
      integer before;
      default {
        state_entry() {
          before = llGetUsedMemory();
          g = "";
          llSay(7357, (string)(llGetUsedMemory() - before));
        }
        touch_start(integer n) {
          llSay(7357, (string)(llGetUsedMemory() - before));
        }
      }
    `)
    s.fire('touch_start', { num_detected: 1 })
    expect(reports(s)).toEqual([-20, -20])
  })
})

describe('script memory: stack', () => {
  it('keeps the stack high-water mark until the next event', async () => {
    const s = await run(`
      integer before;
      f(integer d) { if (d) f(d - 1); }
      default {
        state_entry() {
          before = llGetUsedMemory();
          f(9);
          llSay(7357, (string)(llGetUsedMemory() - before));
        }
        touch_start(integer n) {
          llSay(7357, (string)(llGetUsedMemory() - before));
        }
      }
    `)
    s.fire('touch_start', { num_detected: 1 })
    expect(reports(s)).toEqual([10 * 50, 0])
  })

  it('a frame costs about 7 bytes more per local', async () => {
    const one = await cost('f(integer d) {}', 'f(0);')
    const six = await cost('f(integer d) { integer a; integer b; integer c; integer e; integer g; }', 'f(0);')
    expect(six - one).toBe(35)
  })

  it('bare recursion collides at a depth of 1200 to 1250', async () => {
    const s = await loadScript({
      source: `
        integer depth;
        f(integer d) { depth = d; f(d + 1); }
        default { state_entry() { f(1); } }
      `,
    })
    expect(() => s.start()).toThrow('Stack-Heap Collision')
    expect(s.global('depth')).toBeGreaterThanOrEqual(1200)
    expect(s.global('depth')).toBeLessThanOrEqual(1250)
  })
})

describe('script memory: Stack-Heap Collision', () => {
  // The padding brings this script's own use to that of the in-world probe.
  const GROW = `
    string pad = "${'p'.repeat(1114)}";
    list l;
    integer n;
    integer used;
    default {
      state_entry() {
        llSetMemoryLimit(16384);
        while (TRUE) {
          l += [n];
          n++;
          used = llGetUsedMemory();
        }
      }
    }
  `

  it('a list of distinct integers reaches 510 elements under a 16 KiB limit', async () => {
    const s = await loadScript({ source: GROW })
    expect(() => s.start()).toThrow('Stack-Heap Collision')
    expect(s.global('n')).toBe(510)
    expect(s.global('used')).toBe(16378)
  })

  it('reports the error on DEBUG_CHANNEL and stops the script', async () => {
    const s = await loadScript({ source: GROW, scriptName: 'grower' })
    expect(() => s.start()).toThrow('Stack-Heap Collision')
    expect(s.chat).toEqual([
      { channel: 2147483647, text: 'Script run-time error', type: 'say' },
      { channel: 2147483647, text: 'Stack-Heap Collision', type: 'say' },
    ])
    expect(s.running).toBe(false)
  })

  it('allows an exact fit to the limit and collides on the next allocation', async () => {
    const s = await loadScript({
      source: `
        list l;
        integer n;
        default {
          state_entry() {
            llSetMemoryLimit(llGetUsedMemory() + 32);
            for (;;) {
              l += [n];
              n++;
            }
          }
        }
      `,
    })
    expect(() => s.start()).toThrow('Stack-Heap Collision')
    expect(s.global('n')).toBe(2)
  })

  it('recursion past the host stack is a Stack-Heap Collision too', async () => {
    const s = await loadScript({
      source: 'f() { f(); } default { state_entry() { f(); } }',
      memoryLimit: false,
    })
    expect(() => s.start()).toThrow('Stack-Heap Collision')
  })

  it('memoryLimit: false lets the script grow past its limit', async () => {
    const s = await run(
      `
        list l;
        default {
          state_entry() {
            integer i;
            for (i = 0; i < 5000; i++) l += [i];
            llSay(7357, (string)llGetFreeMemory());
          }
        }
      `,
      { memoryLimit: false },
    )
    expect(reports(s)[0]).toBeLessThan(0)
  })
})

describe('script memory: limit functions', () => {
  async function limits(calls: string) {
    const s = await run(`
      default {
        state_entry() {
          ${calls}
        }
      }
    `)
    return reports(s)
  }

  it('starts at a 65536 limit, with free memory = limit - used', async () => {
    const [limit, used, free] = await limits(`
      llSay(7357, (string)llGetMemoryLimit());
      llSay(7357, (string)llGetUsedMemory());
      llSay(7357, (string)llGetFreeMemory());
    `)
    expect(limit).toBe(65536)
    expect(free).toBe(65536 - used!)
  })

  it.each([
    ['16384', 1, 16384],
    ['65536', 1, 65536],
    ['llGetUsedMemory() + 100', 1, null],
    ['65537', 0, 65536],
    ['llGetUsedMemory() - 1', 0, 65536],
    ['0', 0, 65536],
    ['-1', 0, 65536],
  ])('llSetMemoryLimit(%s)', async (arg, result, limit) => {
    const [ok, after, used] = await limits(`
      llSay(7357, (string)llSetMemoryLimit(${arg}));
      llSay(7357, (string)llGetMemoryLimit());
      llSay(7357, (string)llGetUsedMemory());
    `)
    expect(ok).toBe(result)
    expect(after).toBe(limit ?? used! + 100)
  })

  it('llGetSPMaxMemory reports the peak use while profiling', async () => {
    const [peak, used] = await limits(`
      llScriptProfiler(PROFILE_SCRIPT_MEMORY);
      list l = [1, 2, 3, 4, 5];
      l = [];
      llScriptProfiler(PROFILE_NONE);
      list m = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      m = [];
      llSay(7357, (string)llGetSPMaxMemory());
      llSay(7357, (string)llGetUsedMemory());
    `)
    // At the peak l held 5 integers; now l and m are both empty.
    expect(peak! - used!).toBe(5 * 16 - 40)
  })

  it('a reset gives back and recreates the globals', async () => {
    const s = await run(`
      list g = [1, 2, 3];
      default { state_entry() { g += [4]; ${REPORT} } }
    `)
    s.reset()
    const [first, second] = reports(s)
    expect(second).toBe(first)
  })
})
