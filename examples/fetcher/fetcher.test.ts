import { describe, it, expect, beforeEach } from 'vitest'
import { loadScript } from '@rezless/vitest'
import type { Script } from '@rezless/vitest'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./fetcher.lsl', import.meta.url))

describe('fetcher.lsl', () => {
  let s: Script
  beforeEach(async () => {
    s = await loadScript(SCRIPT)
    s.start()
  })

  it('fires a GET to the configured URL on touch', () => {
    s.fire('touch_start', { num_detected: 1 })
    expect(s).toHaveSentHTTP({
      url: 'https://api.example.test/status',
      method: 'GET',
    })
    expect(s.chat.at(-1)?.text).toBe('Fetching status...')
  })

  it('reports the body verbatim on a 200 response', () => {
    s.fire('touch_start', { num_detected: 1 })
    s.respondToLastHttp({ status: 200, body: 'all systems nominal' })
    expect(s.chat.at(-1)?.text).toBe('OK: all systems nominal')
  })

  it('reports the status code on a non-200 response', () => {
    s.fire('touch_start', { num_detected: 1 })
    s.respondToLastHttp({ status: 503, body: '' })
    expect(s.chat.at(-1)?.text).toBe('Error 503')
  })

  it('ignores responses for stale request keys', () => {
    s.fire('touch_start', { num_detected: 1 })
    // Spec: the script clears pendingRequest after the first response.
    s.respondToLastHttp({ status: 200, body: 'first' })
    const before = s.chat.length

    // Second touch issues a new request; respond to the FIRST one's key.
    s.fire('touch_start', { num_detected: 1 })
    const firstKey = s.httpRequests[0]!.key
    s.respondToHttp(firstKey, { status: 200, body: 'stale' })
    // No "OK: stale" chat, since the script's pendingRequest has rotated.
    expect(s.chat.length).toBe(before + 1) // only the "Fetching status..." line
  })
})
