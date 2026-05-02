import { describe, it, expect } from 'vitest'
import { parse } from '@lslvm/parser'
import { Script } from '../src/script.js'
import { buildCoveragePlan, mergeReports } from '../src/coverage.js'

function load(source: string, filename = '<test>'): Script {
  const { script: ast, diagnostics } = parse(source, filename)
  if (diagnostics.some((d) => d.severity === 'error')) {
    throw new Error('parse error: ' + JSON.stringify(diagnostics))
  }
  return new Script(ast, { filename, source, coverage: true })
}

function planOf(source: string, filename = '<test>') {
  const { script: ast } = parse(source, filename)
  return buildCoveragePlan(ast, filename, source)
}

describe('coverage / plan walker', () => {
  it('enumerates statements, branches, functions and states', () => {
    const plan = planOf(`
      integer total = 0;
      add(integer x) {
        total = total + x;
      }
      default {
        state_entry() {
          if (total > 0) {
            llSay(0, "positive");
          } else {
            llSay(0, "zero");
          }
        }
      }
      state idle {
        state_entry() {}
      }
    `)

    expect(plan.functions.find((f) => f.name === 'add')?.kind).toBe('function')
    expect(plan.functions.find((f) => f.name === 'state_entry' && f.state === 'default')?.kind)
      .toBe('event')
    expect(plan.states.map((s) => s.name).sort()).toEqual(['default', 'idle'])
    expect(plan.branches.length).toBe(1)
    expect(plan.branches[0]!.kind).toBe('if')
    expect(plan.branches[0]!.hasElse).toBe(true)
    expect(plan.statements.length).toBeGreaterThan(0)
  })

  it('marks an if-without-else as hasElse=false', () => {
    const plan = planOf(`
      default {
        state_entry() {
          if (1) llSay(0, "yes");
        }
      }
    `)
    expect(plan.branches[0]!.hasElse).toBe(false)
  })
})

describe('coverage / runtime hit counts', () => {
  it('records statement and event hits after fire()', () => {
    const s = load(`
      default {
        state_entry() {
          llSay(0, "hello");
        }
      }
    `)
    s.start()
    const r = s.coverage!
    expect(r.functions.find((f) => f.name === 'state_entry')!.hits).toBe(1)
    // Two statements: the BlockStatement of the handler body + the ExpressionStatement (llSay).
    const hitStmts = r.statements.filter((st) => st.hits > 0)
    expect(hitStmts.length).toBeGreaterThanOrEqual(2)
  })

  it('separates true and false branch hits on if', () => {
    const s = load(`
      integer flip = 0;
      default {
        state_entry() {
          if (flip) llSay(0, "on");
          else llSay(0, "off");
          flip = 1;
          if (flip) llSay(0, "on");
          else llSay(0, "off");
        }
      }
    `)
    s.start()
    const r = s.coverage!
    expect(r.branches.length).toBe(2)
    // First if: tested once with flip=0 → false; second if: tested once with flip=1 → true.
    expect(r.branches[0]!.hits).toEqual([0, 1])
    expect(r.branches[1]!.hits).toEqual([1, 0])
  })

  it('tracks loop iterations and exit', () => {
    const s = load(`
      default {
        state_entry() {
          integer i = 0;
          while (i < 3) {
            i = i + 1;
          }
        }
      }
    `)
    s.start()
    const r = s.coverage!
    const loop = r.branches.find((b) => b.kind === 'while')!
    // body entered 3x (true), then test was false once → exit.
    expect(loop.hits).toEqual([3, 1])
  })

  it('records user function entry only when called', () => {
    const s = load(`
      integer doubled(integer x) { return x * 2; }
      integer tripled(integer x) { return x * 3; }
      default {
        state_entry() {
          llSay(0, (string)doubled(2));
        }
      }
    `)
    s.start()
    const r = s.coverage!
    expect(r.functions.find((f) => f.name === 'doubled')!.hits).toBe(1)
    expect(r.functions.find((f) => f.name === 'tripled')!.hits).toBe(0)
  })

  it('records state entry on state change', () => {
    const s = load(`
      default {
        state_entry() {
          state idle;
        }
      }
      state idle {
        state_entry() {}
      }
    `)
    s.start()
    const r = s.coverage!
    expect(r.states.find((st) => st.name === 'default')!.hits).toBe(1)
    expect(r.states.find((st) => st.name === 'idle')!.hits).toBe(1)
  })

  it('default state is always entered, even before any fire()', () => {
    const s = load(`
      default { state_entry() {} }
    `)
    const r = s.coverage!
    expect(r.states.find((st) => st.name === 'default')!.hits).toBe(1)
  })

  it('snapshot is independent — later fire()s do not mutate it', () => {
    const s = load(`
      default {
        state_entry() {}
        touch_start(integer n) { llSay(0, "touched"); }
      }
    `)
    s.start()
    const before = s.coverage!
    const beforeTouchHits = before.functions.find((f) => f.name === 'touch_start')!.hits
    s.fire('touch_start', { num_detected: 1 })
    const afterTouchHits = before.functions.find((f) => f.name === 'touch_start')!.hits
    expect(beforeTouchHits).toBe(0)
    expect(afterTouchHits).toBe(0) // snapshot frozen at the moment it was taken
    const after = s.coverage!
    expect(after.functions.find((f) => f.name === 'touch_start')!.hits).toBe(1)
  })

  it('disabled coverage returns null with no overhead path', () => {
    const { script: ast } = parse('default { state_entry() {} }', '<test>')
    const s = new Script(ast, { coverage: false })
    expect(s.coverage).toBeNull()
    s.start() // exercises the no-coverage hot path
    expect(s.coverage).toBeNull()
  })
})

describe('coverage / mergeReports', () => {
  it('sums hits for two reports of the same source', () => {
    const src = `
      default {
        state_entry() { llSay(0, "a"); }
        touch_start(integer n) { llSay(0, "b"); }
      }
    `
    const s1 = load(src, '/tmp/x.lsl')
    s1.start()
    const s2 = load(src, '/tmp/x.lsl')
    s2.start()
    s2.fire('touch_start', { num_detected: 1 })

    const merged = mergeReports([s1.coverage!, s2.coverage!])
    expect(merged.functions.find((f) => f.name === 'state_entry')!.hits).toBe(2)
    expect(merged.functions.find((f) => f.name === 'touch_start')!.hits).toBe(1)
  })

  it('throws on filename mismatch', () => {
    const src = 'default { state_entry() {} }'
    const a = load(src, '/tmp/a.lsl')
    a.start()
    const b = load(src, '/tmp/b.lsl')
    b.start()
    expect(() => mergeReports([a.coverage!, b.coverage!])).toThrow(/filename mismatch/)
  })
})
