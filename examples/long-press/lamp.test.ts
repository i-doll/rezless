import { describe, it, expect, beforeEach } from 'vitest'
import { loadScript } from '@rezless/vitest'
import type { Script } from '@rezless/vitest'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./lamp.lsl', import.meta.url))

describe('lamp.lsl', () => {
  let s: Script
  beforeEach(async () => {
    s = await loadScript(SCRIPT)
    s.start()
  })

  it('starts off', () => {
    expect(s.text?.text).toBe('off')
  })

  it('toggles on a short tap', () => {
    s.linkset.touch(0, { hold: 200 })
    expect(s.text?.text).toBe('on, brightness 1')
    s.linkset.touch(0, { hold: 200 })
    expect(s.text?.text).toBe('off')
  })

  it('steps the brightness on a long press, turning the lamp on', () => {
    s.linkset.touch(0, { hold: 1500 })
    expect(s.text?.text).toBe('on, brightness 2')
    s.linkset.touch(0, { hold: 1000 })
    expect(s.text?.text).toBe('on, brightness 3')
    s.linkset.touch(0, { hold: 1000 })
    expect(s.text?.text).toBe('on, brightness 1')
  })

  it('keeps the brightness across a tap off and on', () => {
    s.linkset.touch(0, { hold: 1500 })
    s.linkset.touch(0)
    s.linkset.touch(0)
    expect(s.text?.text).toBe('on, brightness 2')
  })
})
