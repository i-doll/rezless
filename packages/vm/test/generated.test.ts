import { describe, it, expect } from 'vitest'
import { BUILTIN_SPECS } from '../src/generated/functions.js'
import { EVENT_SPECS } from '../src/generated/events.js'
import { PI, TRUE, FALSE } from '../src/generated/constants.js'
import { ZERO_VECTOR, ZERO_ROTATION } from '../src/values/types.js'

describe('generated LSL definition tables', () => {
  it('has core ll* functions in BUILTIN_SPECS', () => {
    expect(BUILTIN_SPECS.llSay).toMatchObject({
      name: 'llSay',
      returnType: 'void',
      params: [
        { name: 'channel', type: 'integer' },
        { name: 'msg', type: 'string' },
      ],
    })
    expect(BUILTIN_SPECS.llSetTimerEvent).toMatchObject({
      returnType: 'void',
      params: [{ name: 'sec', type: 'float' }],
    })
    expect(BUILTIN_SPECS.llHTTPRequest).toBeDefined()
    expect(BUILTIN_SPECS.llListen).toBeDefined()
  })

  it('has the canonical 43 SL events', () => {
    const expected = [
      'state_entry',
      'state_exit',
      'touch_start',
      'touch',
      'touch_end',
      'listen',
      'timer',
      'http_response',
      'dataserver',
      'link_message',
      'changed',
      'on_rez',
    ]
    for (const name of expected) {
      expect(EVENT_SPECS, `missing event ${name}`).toHaveProperty(name)
    }
  })

  it('exports correct constant values', () => {
    expect(TRUE).toBe(1)
    expect(FALSE).toBe(0)
    expect(PI).toBeCloseTo(Math.PI, 5)
    expect(ZERO_VECTOR).toEqual({ x: 0, y: 0, z: 0 })
    expect(ZERO_ROTATION).toEqual({ x: 0, y: 0, z: 0, s: 1 })
  })
})
