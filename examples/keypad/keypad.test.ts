import { describe, it, expect, beforeEach } from 'vitest'
import { loadScript } from '@rezless/vitest'
import type { Script } from '@rezless/vitest'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./keypad.lsl', import.meta.url))

const LAYOUT = ['123', '456', '789', '*0#']

// The middle of the key's cell on the face, as ST coordinates.
function st(key: string) {
  const row = LAYOUT.findIndex((r) => r.includes(key))
  const col = LAYOUT[row]!.indexOf(key)
  return { x: (col + 0.5) / 3, y: 1 - (row + 0.5) / 4, z: 0 }
}

describe('keypad.lsl', () => {
  let s: Script
  const press = (keys: string) => {
    for (const k of keys) s.linkset.touch(0, { st: st(k) })
  }
  beforeEach(async () => {
    s = await loadScript(SCRIPT)
    s.start()
  })

  it('masks the digits entered so far', () => {
    press('12')
    expect(s.text?.text).toBe('code: **')
  })

  it('unlocks on the right code', () => {
    press('1234#')
    expect(s.text?.text).toBe('unlocked')
  })

  it('rejects a wrong code and starts over', () => {
    press('4321#')
    expect(s.text?.text).toBe('wrong code')
    press('1234#')
    expect(s.text?.text).toBe('unlocked')
  })

  it('clears the entry on *', () => {
    press('99*1234#')
    expect(s.text?.text).toBe('unlocked')
  })

  it('reads the edges of the face as the outer keys', () => {
    s.linkset.touch(0, { st: { x: 0, y: 1, z: 0 } })
    s.linkset.touch(0, { st: { x: 1, y: 0, z: 0 } })
    expect(s.text?.text).toBe('wrong code')
  })

  it('ignores a click that carries no point on the face', () => {
    s.linkset.touch(0)
    expect(s.text?.text).toBe('enter code')
  })
})
