import { describe, it, expect, beforeEach } from 'vitest'
import { loadScript } from '@rezless/vitest'
import type { Script } from '@rezless/vitest'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./greeter.lsl', import.meta.url))

describe('greeter.lsl', () => {
  let s: Script
  beforeEach(async () => {
    s = await loadScript(SCRIPT)
    s.start()
  })

  it('starts in default with no chat output', () => {
    expect(s).toBeInState('default')
    expect(s.chat).toEqual([])
  })

  it('greets the toucher by name and transitions to waiting', () => {
    s.fire('touch_start', {
      num_detected: 1,
      detected: [{ key: 'aaa-bbb-ccc-ddd-eee', name: 'Alice' }],
    })
    expect(s).toHaveSaid(0, 'Hello, Alice!')
    expect(s).toBeInState('waiting')
  })

  it('arms a 60-second timer in the waiting state', () => {
    s.fire('touch_start', {
      num_detected: 1,
      detected: [{ key: 'k', name: 'Alice' }],
    })
    expect(s.timerInterval).toBe(60)
  })

  it('reminds and returns to default after 60s of silence', () => {
    s.fire('touch_start', {
      num_detected: 1,
      detected: [{ key: 'k', name: 'Alice' }],
    })
    s.advanceTime(60_000)
    expect(s).toHaveSaid(0, 'Anyone there?')
    expect(s).toBeInState('default')
  })

  it('greets a second time without leaving waiting if touched again', () => {
    s.fire('touch_start', {
      num_detected: 1,
      detected: [{ key: 'k', name: 'Alice' }],
    })
    s.advanceTime(30_000)
    s.fire('touch_start', {
      num_detected: 1,
      detected: [{ key: 'k', name: 'Bob' }],
    })
    expect(s.chat.map((c) => c.text)).toEqual(['Hello, Alice!', 'Hello again, Bob!'])
    expect(s).toBeInState('waiting')
  })
})
