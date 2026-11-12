import { describe, it, expect, beforeEach } from 'vitest'
import { loadScript } from '@rezless/vitest'
import type { Script } from '@rezless/vitest'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./greeter.luau', import.meta.url))
const touch = (s: Script, name: string) =>
  s.fire('touch_start', { num_detected: 1, detected: [{ key: 'aaa-bbb-ccc-ddd-eee', name }] })

describe('greeter.luau', () => {
  let s: Script
  beforeEach(async () => {
    s = await loadScript(SCRIPT)
    s.start()
  })

  it('says nothing until touched', () => {
    expect(s.chat).toEqual([])
  })

  it('greets the toucher by name', () => {
    touch(s, 'Alice')
    expect(s).toHaveSaid(0, 'Hello, Alice!')
  })

  it('reminds after 60 seconds without another touch', () => {
    touch(s, 'Alice')
    s.advanceTime(59_000)
    expect(s).not.toHaveSaid(0, 'Anyone there?')
    s.advanceTime(1_000)
    expect(s).toHaveSaid(0, 'Anyone there?')
  })

  it('greets again and restarts the reminder on a second touch', () => {
    touch(s, 'Alice')
    s.advanceTime(30_000)
    touch(s, 'Bob')
    expect(s).toHaveSaid(0, 'Hello again, Bob!')
    s.advanceTime(59_000)
    expect(s.chat.filter((c) => c.text === 'Anyone there?')).toEqual([])
    s.advanceTime(1_000)
    expect(s).toHaveSaid(0, 'Anyone there?')
  })
})
