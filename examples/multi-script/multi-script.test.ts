import { describe, it, expect } from 'vitest'
import { loadLinkset } from '@rezless/vitest'
import { fileURLToPath } from 'node:url'

const COUNTER = fileURLToPath(new URL('./counter.lsl', import.meta.url))
const DISPLAY = fileURLToPath(new URL('./display.lsl', import.meta.url))

describe('multi-script counter + display', () => {
  it('counter in root prim drives display in child prim via link_message', async () => {
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
  })

  it('a third script writing the LSD key updates the display via linkset_data', async () => {
    const peeker = `
      default {
        touch_start(integer n) {
          llLinksetDataWrite("count", "99");
        }
      }
    `
    const { scripts } = await loadLinkset({
      prims: [
        {
          name: 'Root',
          scripts: [
            { source: COUNTER, name: 'counter' },
            { source: { source: peeker, filename: 'peeker.lsl' }, name: 'peeker' },
          ],
        },
        { name: 'Display', scripts: [{ source: DISPLAY, name: 'display' }] },
      ],
    })
    scripts['counter']!.start()
    scripts['display']!.start()
    scripts['peeker']!.start()
    scripts['peeker']!.fire('touch_start', { num_detected: 1 })
    expect(scripts['display']!.text?.text).toBe('count: 99')
  })
})
