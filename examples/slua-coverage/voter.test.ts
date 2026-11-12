import { describe, it, expect, beforeEach } from 'vitest'
import { loadScript } from '@rezless/vitest'
import type { Script } from '@rezless/vitest'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const VOTER = fileURLToPath(new URL('./voter.luau', import.meta.url))

async function loadVoter(): Promise<Script> {
  // Load the source with `coverage: true`, so per-script coverage is
  // collected even without the coverage reporter installed.
  const source = await readFile(VOTER, 'utf8')
  return loadScript({ source, filename: VOTER, coverage: true })
}

const vote = (s: Script, message: string) =>
  s.deliverChat({ channel: 5, name: 'A', key: '00000000-0000-0000-0000-000000000001', message })

describe('voter.luau coverage', () => {
  let s: Script
  beforeEach(async () => {
    s = await loadVoter()
    s.start()
  })

  it('counts the functions that ran, and the one that did not', () => {
    vote(s, '3')
    vote(s, '-1')
    expect(s.chat.map((c) => c.text)).toEqual(['3', '2'])
    const r = s.coverage!
    expect(r.functions.find((f) => f.name === 'bump')!.hits).toBe(2)
    // Nobody said "reset", so coverage reports it as missed.
    expect(r.functions.find((f) => f.name === 'reset')!.hits).toBe(0)
    // The listen handler is named after its event.
    expect(r.functions.find((f) => f.kind === 'event')).toMatchObject({ name: 'listen', hits: 2 })
  })

  it('counts both outcomes of each branch, term by term', () => {
    vote(s, 'hello')
    vote(s, '12')
    vote(s, '1')
    expect(s.chat.map((c) => c.text)).toEqual(['12', 'Result: 12'])
    const r = s.coverage!
    // In `done or not n`, the `done` term was false for the first two votes
    // and true for the last.
    const or = r.branches.find((b) => b.kind === 'or')!
    expect(or.hits).toEqual([1, 2])
    // The vote was ignored twice and counted once, and the one counted vote
    // reached the tally of 10, so that check never went the other way.
    const ifs = r.branches.filter((b) => b.kind === 'if')
    // The first `if` is the reset check, which no vote matched.
    expect(ifs.map((b) => b.hits)).toEqual([
      [0, 3],
      [2, 1],
      [1, 0],
    ])
  })

  it('counts a function once the test reaches it', () => {
    vote(s, '12')
    vote(s, 'reset')
    vote(s, '4')
    expect(s.chat.map((c) => c.text)).toEqual(['12', 'Result: 12', 'Reset', '4'])
    expect(s.coverage!.functions.find((f) => f.name === 'reset')!.hits).toBe(1)
  })
})
