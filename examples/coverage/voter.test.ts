import { describe, it, expect, beforeEach } from 'vitest'
import { loadScript } from '@lslvm/vitest'
import type { Script } from '@lslvm/vitest'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const VOTER = fileURLToPath(new URL('./voter.lsl', import.meta.url))

async function loadVoter(): Promise<Script> {
  // The path-form of loadScript doesn't take extra options; load once via
  // the inline form so `coverage: true` activates per-script collection
  // regardless of whether the LslCoverageReporter is installed.
  const source = await readFile(VOTER, 'utf8')
  return loadScript({ source, filename: VOTER, coverage: true })
}

describe('voter.lsl coverage', () => {
  let s: Script
  beforeEach(async () => {
    s = await loadVoter()
  })

  it('records hits for the touched code paths', () => {
    s.start()
    s.deliverChat({ channel: 5, name: 'A', key: '00000000-0000-0000-0000-000000000001', message: '3' })
    s.deliverChat({ channel: 5, name: 'B', key: '00000000-0000-0000-0000-000000000002', message: '-1' })
    expect(s).toHaveSaid(0, '3')
    expect(s).toHaveSaid(0, '2')

    const r = s.coverage!
    expect(r.functions.find((f) => f.name === 'bump')!.hits).toBe(2)
    // `reset` is intentionally never called; coverage flags it as missed.
    expect(r.functions.find((f) => f.name === 'reset')!.hits).toBe(0)
    const bumpBranch = r.branches.find((b) => b.kind === 'if')!
    expect(bumpBranch.hits[0]).toBeGreaterThan(0)
    expect(bumpBranch.hits[1]).toBeGreaterThan(0)
  })

  it('records the state transition into "done"', () => {
    s.start()
    s.deliverChat({
      channel: 5,
      name: 'A',
      key: '00000000-0000-0000-0000-000000000001',
      message: '42',
    })
    expect(s).toBeInState('done')
    const r = s.coverage!
    expect(r.states.find((st) => st.name === 'done')!.hits).toBe(1)
    expect(
      r.functions.find((f) => f.kind === 'event' && f.state === 'done')!.hits,
    ).toBe(1)
  })
})
