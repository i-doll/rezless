import { describe, it, expect, beforeEach } from 'vitest'
import { loadScript } from '@rezless/vitest'
import type { Script } from '@rezless/vitest'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./sign.lsl', import.meta.url))

describe('sign.lsl', () => {
  let s: Script
  beforeEach(async () => {
    s = await loadScript(SCRIPT)
  })

  it('tells its owner the URL it was given', () => {
    s.start()
    expect(s.urls).toHaveLength(1)
    expect(s.chat.map((c) => c.text)).toEqual([`Sign URL: ${s.urls[0]}`])
  })

  it('shows text posted to /text and returns it on GET', () => {
    s.start()
    const post = s.sendHttpRequest(`${s.urls[0]}/text`, { method: 'POST', body: 'Back in 5 minutes' })
    expect(post.response?.status).toBe(200)
    expect(s.text?.text).toBe('Back in 5 minutes')
    expect(s.sendHttpRequest(`${s.urls[0]}/text`).response?.body).toBe('Back in 5 minutes')
  })

  it('answers 404 for other paths and 405 for other methods', () => {
    s.start()
    expect(s.sendHttpRequest(`${s.urls[0]}/other`).response?.status).toBe(404)
    expect(s.sendHttpRequest(`${s.urls[0]}/text`, { method: 'PUT', body: 'x' }).response?.status).toBe(405)
  })

  it('tells its owner when the region has no URL to give', () => {
    s.denyUrls()
    s.start()
    expect(s.urls).toEqual([])
    expect(s.chat.map((c) => c.text)).toEqual(['No URL for the sign: '])
  })

  it('stops answering on its old URL after a reset', () => {
    s.start()
    const old = s.urls[0]!
    s.reset()
    expect(s.sendHttpRequest(`${old}/text`).response?.status).toBe(404)
  })
})
