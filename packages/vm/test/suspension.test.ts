import { describe, it, expect } from 'vitest'
import { parse } from '@rezless/parser'
import { Script } from '../src/script.js'
import { execHandler } from '../src/interpreter.js'
import type { InterpreterContext } from '../src/interpreter.js'
import type { ScriptState } from '../src/runtime.js'

function load(source: string): Script {
  const { script: ast, diagnostics } = parse(source, '<test>')
  if (diagnostics.some((d) => d.severity === 'error')) {
    throw new Error('parse error: ' + JSON.stringify(diagnostics))
  }
  return new Script(ast, { source })
}

describe('suspension', () => {
  it('a mock that sleeps suspends the script after it returns', () => {
    const s = load('default { state_entry() { llPlaySound("a", 1.0); llPlaySound("b", 1.0); } }')
    const seen: number[] = []
    s.mock('llPlaySound', (ctx) => {
      seen.push(ctx.state.clock.now)
      ctx.sleep(250)
      return undefined
    })
    s.start()
    expect(seen).toEqual([0, 250])
    expect(s.now).toBe(500)
  })

  it('sleeps inside recursion deeper than the host stack', () => {
    const s = load(`
      integer bottom;
      f(integer d) { if (d > 0) f(d - 1); else { llSleep(1.0); bottom = TRUE; } }
      default { state_entry() { f(5000); } }
    `)
    s.start()
    expect(s.global('bottom')).toBe(1)
    expect(s.now).toBe(1000)
  })

  it('returns a user function’s value after it sleeps', () => {
    const s = load(`
      integer got;
      integer g() { llSleep(1.0); return 7; }
      default { state_entry() { got = g() * 2 + 1; } }
    `)
    s.start()
    expect(s.global('got')).toBe(15)
    expect(s.now).toBe(1000)
  })

  it('waking an idle script does nothing', () => {
    const s = load('integer n; default { state_entry() { n = 1; } }')
    s.wake()
    expect(s.global('n')).toBe(0)
  })

  it('abandoning a suspended handler gives back its frames and locals', () => {
    const s = load(`
      f(integer d) { string pad = "abc"; if (d > 0) f(d - 1); else llSleep(1.0); }
      default { state_entry() { list l = [1, 2, 3]; f(50); } }
    `)
    const state = s['state'] as ScriptState
    const ctx: InterpreterContext = {
      state,
      mocks: s['mocks'],
      globals: s['globals'],
      userFunctions: s['userFunctions'],
      functions: s['functions'],
      invalidPrograms: s['invalidPrograms'],
      script: s,
      prim: s.host,
      linkset: s.linkset,
    }
    const memory = state.memory
    const before = { locals: memory.locals, stack: memory['stack'] }
    const run = execHandler(ctx, s['handlersByState'].get('default')!.get('state_entry')!)
    expect(run.next().done).toBe(false)
    expect(memory.locals).toBeGreaterThan(before.locals)
    expect(memory['stack']).toBeGreaterThan(before.stack)
    run.return(undefined)
    expect({ locals: memory.locals, stack: memory['stack'] }).toEqual(before)
  })
})
