import { describe, it, expect, beforeEach } from 'vitest'
import { loadScript } from '@rezless/vitest'
import type { Script } from '@rezless/vitest'
import { fileURLToPath } from 'node:url'

const HELLO = fileURLToPath(new URL('./hello.lsl', import.meta.url))

describe('hello.lsl', () => {
  let s: Script

  beforeEach(async () => {
    s = await loadScript(HELLO)
  })

  it('greets on state_entry', () => {
    s.start()
    expect(s).toHaveSaid(0, 'Hello, Avatar!')
  })

  it('starts in the default state', () => {
    expect(s).toBeInState('default')
  })

  it('logs the llSay call', () => {
    s.start()
    expect(s).toHaveCalledFunction('llSay', 0, 'Hello, Avatar!')
  })

  it('also accepts inline source', async () => {
    const inline = await loadScript({
      source: `default { state_entry() { llSay(0, "from inline"); } }`,
    })
    inline.start()
    expect(inline).toHaveSaid(0, 'from inline')
  })

  it('reports parse errors with file:line:col', async () => {
    await expect(
      loadScript({
        source: `default { state_entry() { llSay(0, "broken") } }`,
        filename: 'broken.lsl',
      }),
    ).rejects.toThrow(/broken\.lsl:1:\d+: expected ';'/)
  })
})
