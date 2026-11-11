import { describe, it, expect } from 'vitest'
import { Env } from '../src/env.js'
import { Memory } from '../src/memory.js'

describe('Env.scopeOf', () => {
  it('tells globals, parameters and locals apart, and undefined names', () => {
    const globals = new Env(null, new Memory(0, false))
    globals.declare('g', 'integer')
    const call = globals.push()
    call.declare('p', 'integer', undefined, true)
    const block = call.push()
    block.declare('l', 'integer')
    expect(block.scopeOf('g')).toBe('global')
    expect(block.scopeOf('p')).toBe('param')
    expect(block.scopeOf('l')).toBe('local')
    expect(block.scopeOf('missing')).toBeUndefined()
  })
})
