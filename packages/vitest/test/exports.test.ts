import { describe, it, expect } from 'vitest'
import * as rezless from '../src/index.js'
import {
  TRUE,
  FALSE,
  PI,
  TWO_PI,
  DEG_TO_RAD,
  STATUS_PHYSICS,
  PERMISSION_ATTACH,
  ATTACH_HEAD,
  ATTACH_CHEST,
  CHANGED_OWNER,
  AGENT_BY_USERNAME,
  EOF,
  JSON_ARRAY,
  JSON_OBJECT,
  NULL_KEY,
  ZERO_VECTOR,
  ZERO_ROTATION,
  CONSTANT_TABLE,
} from '../src/index.js'

describe('public LSL constant surface', () => {
  it('exposes a wide cross-section by named import', () => {
    expect(TRUE).toBe(1)
    expect(FALSE).toBe(0)
    expect(PI).toBeCloseTo(Math.PI, 5)
    expect(TWO_PI).toBeCloseTo(2 * Math.PI, 5)
    expect(DEG_TO_RAD).toBeCloseTo(Math.PI / 180, 5)

    expect(STATUS_PHYSICS).toBe(0x1)
    expect(PERMISSION_ATTACH).toBe(0x20)
    expect(ATTACH_HEAD).toBe(2)
    expect(ATTACH_CHEST).toBe(1)
    expect(CHANGED_OWNER).toBe(0x80)
    expect(AGENT_BY_USERNAME).toBe(0x10)

    expect(NULL_KEY).toBe('00000000-0000-0000-0000-000000000000')
    expect(EOF).toBe('\n\n\n')
    expect(JSON_ARRAY).toBe('﷒')
    expect(JSON_OBJECT).toBe('﷑')

    expect(ZERO_VECTOR).toEqual({ x: 0, y: 0, z: 0 })
    expect(ZERO_ROTATION).toEqual({ x: 0, y: 0, z: 0, s: 1 })
  })

  it('exports a large constant surface and the reflection table', () => {
    const exportedNames = Object.keys(rezless)
    expect(exportedNames.length).toBeGreaterThan(900)
    expect(exportedNames).toContain('STATUS_PHYSICS')
    expect(exportedNames).toContain('JSON_ARRAY')
    expect(exportedNames).toContain('ATTACH_HEAD')

    expect(CONSTANT_TABLE['STATUS_PHYSICS']).toEqual({ type: 'integer', value: 0x1 })
    expect(CONSTANT_TABLE['ZERO_VECTOR']).toEqual({
      type: 'vector',
      value: { x: 0, y: 0, z: 0 },
    })
    expect(CONSTANT_TABLE['NULL_KEY']).toEqual({
      type: 'string',
      value: '00000000-0000-0000-0000-000000000000',
    })
  })
})
