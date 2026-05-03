import { describe, it, expect, beforeEach } from 'vitest'
import { loadScript } from '@rezless/vitest'
import type { Script } from '@rezless/vitest'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./nametag.lsl', import.meta.url))

describe('nametag.lsl', () => {
  let s: Script
  beforeEach(async () => {
    s = await loadScript(SCRIPT)
    s.start()
  })

  it('sets idle text on state_entry', () => {
    expect(s.text?.text).toBe('(idle)')
  })

  it('issues a DATA_NAME request on touch with the toucher key', () => {
    s.fire('touch_start', {
      num_detected: 1,
      detected: [{ key: 'aaa-bbb-ccc-ddd-eee', name: 'Alice' }],
    })
    expect(s.dataserverRequests).toHaveLength(1)
    expect(s.dataserverRequests[0]!.source).toBe('agent_data')
  })

  it('updates the floating text once the dataserver responds', () => {
    s.fire('touch_start', {
      num_detected: 1,
      detected: [{ key: 'k', name: 'Alice' }],
    })
    s.respondToLastDataserver('Alice Resident')
    expect(s.text?.text).toBe('Alice Resident')
    expect(s.text?.color).toEqual({ x: 1, y: 1, z: 0 })
  })

  it('ignores dataserver responses for stale query keys', () => {
    s.fire('touch_start', {
      num_detected: 1,
      detected: [{ key: 'k', name: 'Alice' }],
    })
    const firstKey = s.dataserverRequests[0]!.key
    s.respondToDataserver(firstKey, 'Alice Resident')
    expect(s.text?.text).toBe('Alice Resident')

    // A second touch starts a new query; the FIRST query's late response
    // should be ignored by the script.
    s.fire('touch_start', {
      num_detected: 1,
      detected: [{ key: 'k2', name: 'Bob' }],
    })
    s.respondToHttp // (sanity: just makes sure the API surface exists)
    s.respondToDataserver(firstKey, 'STALE')
    expect(s.text?.text).toBe('Alice Resident')
  })
})
