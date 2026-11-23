import { describe, expect, it } from 'vitest'
import { WindowThrottle } from '../src/throttle.js'

describe('WindowThrottle with aligned periods', () => {
  it('starts its periods at multiples of the period', () => {
    const t = new WindowThrottle(16_000, 2, true)
    // The period holding 20 s runs from 16 s to 32 s, so all three fall in it.
    expect([t.take(20_000), t.take(31_000), t.take(31_500)]).toEqual(['open', 'open', 'shuts'])
    // Shut until the end of the period after 16-32 s.
    expect(t.take(47_999)).toBe('refused')
  })

  it('counts from a fresh period two periods on', () => {
    const t = new WindowThrottle(16_000, 2, true)
    t.take(1_000)
    t.take(2_000)
    // 32 s is two periods after the one from 0 s: nothing carries over.
    expect([t.take(32_000), t.take(32_500)]).toEqual(['open', 'open'])
  })

  it('carries the previous period, scaled by what is left of the current one', () => {
    const t = new WindowThrottle(16_000, 2, true)
    t.take(1_000)
    t.take(2_000)
    // At 20 s, a quarter of the way in: 2 * 0.75 + 1 = 2.5 is past the limit of 2.
    expect(t.take(20_000)).toBe('shuts')
  })
})
