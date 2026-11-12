import { describe, it, expect } from 'vitest'
import { loadLinkset } from '@rezless/vitest'
import { fileURLToPath } from 'node:url'

const COUNTER = fileURLToPath(new URL('./counter.luau', import.meta.url))
const DISPLAY = fileURLToPath(new URL('./display.lsl', import.meta.url))

describe('SLua counter + LSL display', () => {
  it('drives an LSL display in another prim with link messages', async () => {
    const { scripts } = await loadLinkset({
      prims: [
        { name: 'Root', scripts: [{ source: COUNTER, name: 'counter' }] },
        { name: 'Display', scripts: [{ source: DISPLAY, name: 'display' }] },
      ],
    })
    scripts['counter']!.start()
    scripts['display']!.start()
    scripts['counter']!.fire('touch_start', { num_detected: 1 })
    expect(scripts['display']!.text?.text).toBe('count: 1')
    scripts['counter']!.fire('touch_start', { num_detected: 1 })
    expect(scripts['display']!.text?.text).toBe('count: 2')
    expect(scripts['counter']!.linkset.linksetData.get('count')).toMatchObject({ value: '2' })
  })
})
