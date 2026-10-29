import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

const NULL_KEY_STR = '00000000-0000-0000-0000-000000000000'

async function run(source: string) {
  const s = await loadScript({ source })
  s.start()
  return s
}

describe('Phase 2 — multi-state and state transitions', () => {
  it('starts in default state', async () => {
    const s = await run(`default { state_entry() {} }`)
    expect(s).toBeInState('default')
  })

  it('transitions on `state foo;` and fires state_exit + state_entry', async () => {
    const s = await run(`
      integer trail = 0;
      default {
        state_entry() {
          trail = 1;
          state listening;
        }
        state_exit() {
          // state_exit on default
          trail = trail * 10 + 2;
        }
      }
      state listening {
        state_entry() {
          trail = trail * 10 + 3;
        }
      }
    `)
    // default.state_entry sets trail=1, then state listening
    // → default.state_exit appends 2 → trail = 12
    // → listening.state_entry appends 3 → trail = 123
    expect(s.global('trail')).toBe(123)
    expect(s).toBeInState('listening')
  })

  it('transitions back to default with `state default;`', async () => {
    const s = await run(`
      default {
        touch_start(integer n) { state listening; }
      }
      state listening {
        touch_start(integer n) { state default; }
      }
    `)
    s.fire('touch_start', { num_detected: 1 })
    expect(s).toBeInState('listening')
    s.fire('touch_start', { num_detected: 1 })
    expect(s).toBeInState('default')
  })

  // In-world: `state X;` while already in X runs neither state_exit nor state_entry.
  it('`state default;` while in default is a no-op', async () => {
    const s = await run(`
      integer entries = 0;
      integer exits = 0;
      default {
        state_entry() { entries = entries + 1; }
        state_exit() { exits = exits + 1; }
        touch_start(integer n) { state default; }
      }
    `)
    s.fire('touch_start', { num_detected: 1 })
    expect(s.global('entries')).toBe(1)
    expect(s.global('exits')).toBe(0)
  })

  // In-world: a listen opened in default does not hear chat in state two.
  it('a state change releases every listen', async () => {
    const s = await run(`
      integer heard = 0;
      default {
        state_entry() {
          llListen(5, "", NULL_KEY, "");
          state two;
        }
      }
      state two {
        listen(integer c, string n, key i, string m) { heard = heard + 1; }
      }
    `)
    s.deliverChat({ channel: 5, name: 'A', key: NULL_KEY_STR, message: 'hi' })
    expect(s.listens).toHaveLength(0)
    expect(s.global('heard')).toBe(0)
  })

  it('a state change drops events queued for the old state', async () => {
    const s = await run(`
      integer got = 0;
      default {
        state_entry() {
          llMessageLinked(LINK_THIS, 1, "", "");
          state two;
        }
      }
      state two {
        link_message(integer sender, integer num, string str, key id) { got = got + 1; }
      }
    `)
    expect(s.global('got')).toBe(0)
  })

  it('llResetScript releases every listen', async () => {
    const s = await run(`
      default {
        touch_start(integer n) { llListen(5, "", NULL_KEY, ""); }
        touch_end(integer n) { llResetScript(); }
      }
    `)
    s.fire('touch_start', { num_detected: 1 })
    expect(s.listens).toHaveLength(1)
    s.fire('touch_end', { num_detected: 1 })
    expect(s.listens).toHaveLength(0)
  })

  it('rejects a transition to an unknown state at load time', async () => {
    await expect(
      loadScript({ source: `default { state_entry() { state nope; } }` }),
    ).rejects.toThrow(/Name not defined within scope: state nope/)
  })
})

describe('Phase 2 — jump and labels', () => {
  it('jumps forward over statements', async () => {
    const s = await run(`
      integer x = 0;
      default {
        state_entry() {
          x = 1;
          jump skip;
          x = 999;
          @skip;
          x = x + 10;
        }
      }
    `)
    expect(s.global('x')).toBe(11)
  })

  it('jumps backward (manual loop)', async () => {
    const s = await run(`
      integer n = 0;
      default {
        state_entry() {
          @top;
          n = n + 1;
          if (n < 5) jump top;
        }
      }
    `)
    expect(s.global('n')).toBe(5)
  })

  it('a backward jump that re-runs a VariableDeclaration re-initializes it', async () => {
    // Without per-block declareOrReset, the second pass over `integer i = 0;`
    // would throw "variable 'i' already declared in this scope".
    const s = await run(`
      integer total = 0;
      default {
        state_entry() {
          @retry;
          integer i = 0;
          while (i < 3) {
            total = total + 1;
            i = i + 1;
          }
          if (total < 6) jump retry;
        }
      }
    `)
    expect(s.global('total')).toBe(6)
  })

  it('genuine duplicate declarations in the same block are still rejected', async () => {
    await expect(
      loadScript({
        source: `
          default {
            state_entry() {
              integer x = 1;
              integer x = 2;
            }
          }
        `,
      }),
    ).rejects.toThrow(/Name previously declared within scope: x/)
  })

  it('rejects a jump to a label in another function at load time', async () => {
    // Labels are local: `done` in state_entry isn't visible from skip_ahead.
    const load = loadScript({
      source: `
        integer x = 0;
        skip_ahead() { jump done; }
        default {
          state_entry() {
            x = 1;
            skip_ahead();
            x = 2;
            @done;
            x = x + 10;
          }
        }
      `,
    })
    await expect(load).rejects.toThrow(/Name not defined within scope: label done/)
  })
})

describe('Phase 2 — user-defined functions', () => {
  it('void function with no return value', async () => {
    const s = await run(`
      integer counter = 0;
      bump() { counter = counter + 1; }
      default {
        state_entry() {
          bump();
          bump();
          bump();
        }
      }
    `)
    expect(s.global('counter')).toBe(3)
  })

  it('typed function with return value', async () => {
    const s = await run(`
      integer result = 0;
      integer add(integer a, integer b) {
        return a + b;
      }
      default {
        state_entry() {
          result = add(7, 35);
        }
      }
    `)
    expect(s.global('result')).toBe(42)
  })

  it('recursive function', async () => {
    const s = await run(`
      integer result = 0;
      integer fact(integer n) {
        if (n <= 1) return 1;
        return n * fact(n - 1);
      }
      default {
        state_entry() {
          result = fact(6);
        }
      }
    `)
    expect(s.global('result')).toBe(720)
  })

  it('function locals do not leak to globals', async () => {
    const s = await run(`
      integer outer = 0;
      do_thing() {
        integer outer = 999;  // shadows
      }
      default {
        state_entry() {
          do_thing();
          outer = outer + 1;  // should be 0+1, NOT 999+1
        }
      }
    `)
    expect(s.global('outer')).toBe(1)
  })
})

describe('Phase 2 — fire() with typed payload', () => {
  it('binds payload to handler params by event-spec name', async () => {
    const s = await run(`
      integer captured = 0;
      default {
        touch_start(integer n) {
          captured = n;
        }
      }
    `)
    s.fire('touch_start', { num_detected: 3 })
    expect(s.global('captured')).toBe(3)
  })

  it('omitted payload values default to the LSL zero for that type', async () => {
    const s = await run(`
      integer captured = 99;
      default {
        touch_start(integer n) {
          captured = n;
        }
      }
    `)
    s.fire('touch_start', {})
    expect(s.global('captured')).toBe(0)
  })

  it('binds vector and string payload args', async () => {
    const s = await run(`
      integer level = 0;
      key who = "";
      default {
        control(key id, integer ll, integer edges) {
          who = id;
          level = ll;
        }
      }
    `)
    s.fire('control', {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      level: 7,
      edge: 0,
    })
    expect(s.global('who')).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    expect(s.global('level')).toBe(7)
  })
})
