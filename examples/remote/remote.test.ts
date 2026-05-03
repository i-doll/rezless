import { describe, it, expect, beforeEach } from 'vitest'
import { loadScript } from '@rezless/vitest'
import type { Script } from '@rezless/vitest'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./remote.lsl', import.meta.url))
const OWNER = '11111111-2222-3333-4444-555555555555'
const STRANGER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('remote.lsl', () => {
  let s: Script
  beforeEach(async () => {
    s = await loadScript({
      source: await (await import('node:fs/promises')).readFile(SCRIPT, 'utf8'),
      owner: OWNER,
    })
    s.start()
  })

  it('registers an owner-filtered listen on channel 7', () => {
    expect(s).toHaveListened(7, { key: OWNER })
  })

  it('responds to "on" with a confirmation', () => {
    s.deliverChat({ channel: 7, name: 'Owner', key: OWNER, message: 'on' })
    expect(s.chat.at(-1)).toMatchObject({ type: 'ownerSay', text: 'Lights: ON' })
  })

  it('falls through unknown commands with a useful message', () => {
    s.deliverChat({ channel: 7, name: 'Owner', key: OWNER, message: 'wat' })
    expect(s.chat.at(-1)?.text).toBe('Unknown command: wat')
  })

  it('ignores chat from strangers', () => {
    // The listen filter is owner-only — non-owner messages don't even arrive.
    s.deliverChat({ channel: 7, name: 'Mallory', key: STRANGER, message: 'on' })
    expect(s.chat).toEqual([])
  })

  it('"stop" disables further command processing', () => {
    s.deliverChat({ channel: 7, name: 'Owner', key: OWNER, message: 'stop' })
    expect(s.chat.at(-1)?.text).toBe('Listening disabled.')
    s.deliverChat({ channel: 7, name: 'Owner', key: OWNER, message: 'on' })
    // Still only the disabled-confirmation message; the new "on" was ignored.
    expect(s.chat).toHaveLength(1)
  })
})
