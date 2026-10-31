import { describe, it, expect, beforeEach } from 'vitest'
import { loadScript } from '@rezless/vitest'
import type { Script } from '@rezless/vitest'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./menu.lsl', import.meta.url))

const ALICE = { key: '00000000-0000-0000-0000-00000000a11c', name: 'Alice Resident' }
const BOB = { key: '00000000-0000-0000-0000-000000000b0b', name: 'Bob Resident' }

describe('menu.lsl', () => {
  let s: Script
  beforeEach(async () => {
    s = await loadScript(SCRIPT)
    s.start()
  })

  it('shows the toucher a colour menu', () => {
    s.linkset.touch(0, { avatar: ALICE })
    expect(s.dialogs).toMatchObject([{ agent: ALICE.key, message: 'Pick a colour', buttons: ['Red', 'Green', 'Blue'] }])
  })

  it('sets the colour the toucher picks', () => {
    s.linkset.touch(0, { avatar: ALICE })
    s.answerDialog('Green', { name: ALICE.name })
    expect(s.text?.text).toBe('green, set by Alice Resident')
  })

  it('ignores the same word from someone else', () => {
    s.linkset.touch(0, { avatar: ALICE })
    s.deliverChat({ channel: -7001, name: BOB.name, key: BOB.key, message: 'Red' })
    expect(s.text?.text).toBe('white')
  })

  it('stops listening after 30 seconds', () => {
    s.linkset.touch(0, { avatar: ALICE })
    s.advanceTime(30_000)
    s.answerDialog('Blue', { name: ALICE.name })
    expect(s.text?.text).toBe('white')
  })
})
