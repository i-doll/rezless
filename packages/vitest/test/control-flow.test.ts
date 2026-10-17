import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

async function run(source: string) {
  const s = await loadScript({ source })
  s.start()
  return s
}

describe('Phase 2 — control flow', () => {
  it('if/else picks the consequent or alternate', async () => {
    const s = await run(`
      integer a = 0;
      integer b = 0;
      default {
        state_entry() {
          if (1) a = 10; else a = 20;
          if (0) b = 10; else b = 20;
        }
      }
    `)
    expect(s.global('a')).toBe(10)
    expect(s.global('b')).toBe(20)
  })

  it('while loop counts to 10', async () => {
    const s = await run(`
      integer n = 0;
      default {
        state_entry() {
          while (n < 10) n = n + 1;
        }
      }
    `)
    expect(s.global('n')).toBe(10)
  })

  it('do/while runs at least once', async () => {
    const s = await run(`
      integer count = 0;
      default {
        state_entry() {
          do { count = count + 1; } while (0);
        }
      }
    `)
    expect(s.global('count')).toBe(1)
  })

  it('for loop with init/test/update', async () => {
    const s = await run(`
      integer sum = 0;
      default {
        state_entry() {
          integer i;
          for (i = 0; i < 5; i = i + 1) {
            sum = sum + i;
          }
        }
      }
    `)
    expect(s.global('sum')).toBe(0 + 1 + 2 + 3 + 4)
  })

  it('blocks introduce a new scope', async () => {
    const s = await run(`
      integer outer = 0;
      default {
        state_entry() {
          integer x = 1;
          {
            integer x = 99;
            outer = x;
          }
          // back to the outer x
          outer = outer + x;
        }
      }
    `)
    expect(s.global('outer')).toBe(100)
  })

  it('return in an event handler exits the handler', async () => {
    const s = await run(`
      integer ran = 0;
      default {
        state_entry() {
          ran = 1;
          return;
          ran = 99;  // unreachable
        }
      }
    `)
    expect(s.global('ran')).toBe(1)
  })

  it('chains conditions in a if/else if cascade', async () => {
    const s = await run(`
      integer label = 0;
      default {
        state_entry() {
          integer x = 5;
          if (x < 0)       label = 1;
          else if (x == 0) label = 2;
          else if (x < 10) label = 3;
          else             label = 4;
        }
      }
    `)
    expect(s.global('label')).toBe(3)
  })

  it('runs empty statements as no-ops', async () => {
    const s = await run(`
      integer i;
      integer hits = 0;
      default {
        state_entry() {
          ;
          for (i = 0; i < 5; i++) ;
          if (i == 5) ; else hits = 100;
          while (FALSE) ;
          do ; while (FALSE);
          hits += 1;
        }
      }
    `)
    expect(s.global('i')).toBe(5)
    expect(s.global('hits')).toBe(1)
  })

  it('refuses to load a declaration as an unbraced body', async () => {
    await expect(
      loadScript({ source: `default { state_entry() { if (TRUE) integer y; } }` }),
    ).rejects.toThrow(/Declaration requires a new scope -- use \{ and \}/)
  })
})
