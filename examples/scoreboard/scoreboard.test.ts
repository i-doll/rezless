import { describe, it, expect, beforeEach } from 'vitest'
import { loadScript } from '@rezless/vitest'
import type { Script } from '@rezless/vitest'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./scoreboard.lsl', import.meta.url))

function score(s: Script, who: string): void {
  s.deliverChat({ channel: 0, name: 'A', key: '', message: 'score ' + who })
}

describe('scoreboard.lsl', () => {
  let s: Script
  beforeEach(async () => {
    s = await loadScript(SCRIPT)
    s.start()
  })

  it('records scores in the linkset data store', () => {
    score(s, 'alice')
    score(s, 'alice')
    score(s, 'bob')
    expect(s.linksetData.get('score:alice')?.value).toBe('2')
    expect(s.linksetData.get('score:bob')?.value).toBe('1')
    expect(s.linksetData.get('meta:total')?.value).toBe('3')
  })

  it('"show" prints the leaderboard', () => {
    score(s, 'alice')
    score(s, 'alice')
    score(s, 'bob')
    s.deliverChat({ channel: 0, name: 'A', key: '', message: 'show' })
    expect(s.chat.map((c) => c.text)).toEqual([
      'alice: 2',
      'bob: 1',
      'total: 3',
    ])
  })

  it('"reset" clears the store and triggers the linkset_data RESET event', () => {
    score(s, 'alice')
    s.deliverChat({ channel: 0, name: 'A', key: '', message: 'reset' })
    expect(s.linksetData.size).toBe(0)
    expect(s).toHaveSaid(0, 'scoreboard cleared')
  })

  it('total survives llResetScript via linkset data', () => {
    score(s, 'alice')
    score(s, 'bob')
    expect(s.global('total')).toBe(2)
    s.reset()
    expect(s.global('total')).toBe(2)
    expect(s.linksetData.get('meta:total')?.value).toBe('2')
  })
})
