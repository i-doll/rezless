import { describe, it, expect, beforeEach } from 'vitest'
import { loadScript, JSON_FALSE } from '@rezless/vitest'
import type { Script } from '@rezless/vitest'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./json-config.lsl', import.meta.url))

function chat(s: Script, message: string): void {
  s.deliverChat({ channel: 0, name: 'A', key: '', message })
}

function lastSaid(s: Script): string {
  return s.chat.length === 0 ? '' : s.chat[s.chat.length - 1]!.text
}

describe('json-config.lsl', () => {
  let s: Script
  beforeEach(async () => {
    s = await loadScript(SCRIPT)
    s.start()
  })

  it('seeds defaults on first run', () => {
    expect(s.linksetData.get('config')?.value).toBe(
      '{"theme":{"color":"blue","size":12},"volume":5,"muted":false}',
    )
    chat(s, 'get theme.color')
    expect(lastSaid(s)).toBe('blue')
  })

  it('reads a nested numeric path', () => {
    chat(s, 'get theme.size')
    expect(lastSaid(s)).toBe('12')
  })

  it('writes a nested path and persists it to LSD', () => {
    chat(s, 'set theme.color red')
    chat(s, 'get theme.color')
    expect(lastSaid(s)).toBe('red')
    expect(s.linksetData.get('config')?.value).toContain('"color":"red"')
  })

  it('auto-creates a missing branch on set', () => {
    chat(s, 'set theme.font Arial')
    chat(s, 'get theme.font')
    expect(lastSaid(s)).toBe('Arial')
    // existing siblings are still there
    chat(s, 'get theme.color')
    expect(lastSaid(s)).toBe('blue')
    chat(s, 'get theme.size')
    expect(lastSaid(s)).toBe('12')
  })

  it('bare-word boolean round-trips as the FDDx sentinel JSON_FALSE', () => {
    chat(s, 'get muted')
    expect(lastSaid(s)).toBe(JSON_FALSE)
  })

  it('"keys" lists top-level keys in source order', () => {
    chat(s, 'keys')
    expect(lastSaid(s)).toBe('theme,volume,muted')
  })

  it('config survives llResetScript via Linkset Data', async () => {
    chat(s, 'set theme.color crimson')
    chat(s, 'set volume 11')
    s.reset()
    chat(s, 'get theme.color')
    expect(lastSaid(s)).toBe('crimson')
    chat(s, 'get volume')
    expect(lastSaid(s)).toBe('11')
  })

  it('does not re-seed when LSD already holds a valid object', async () => {
    // Restart from a sibling-written config: a different shape entirely.
    const fresh = await loadScript(SCRIPT)
    fresh.seedLinksetData([['config', { value: '{"x":1}' }]])
    fresh.start()
    chat(fresh, 'get x')
    expect(fresh.chat[fresh.chat.length - 1]!.text).toBe('1')
    chat(fresh, 'keys')
    expect(fresh.chat[fresh.chat.length - 1]!.text).toBe('x')
  })
})
