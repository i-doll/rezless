import { it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { loadScript } from '@rezless/vitest'

const HELLO = fileURLToPath(new URL('./hello.lsl', import.meta.url))

it('says hi', async () => {
  const s = await loadScript(HELLO)
  s.start()
  expect(s).toHaveSaid(0, 'hi')
})

it('collects for one script when asked to', async () => {
  const s = await loadScript({ source: 'default { state_entry() { llSay(0, "hi"); } }', filename: HELLO, coverage: true })
  s.start()
  expect(s.coverage!.statements.length).toBeGreaterThan(0)
})
