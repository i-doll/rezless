import { describe, it, expect } from 'vitest'
import { parse } from '@rezless/parser'
import { Script } from '../src/script.js'

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
})
