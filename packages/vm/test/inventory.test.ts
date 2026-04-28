import { describe, it, expect } from 'vitest'
import { makeInventoryItem, InventoryType } from '../src/inventory.js'
import { NULL_KEY } from '../src/values/types.js'
import { PERM_ALL } from '../src/generated/constants.js'

describe('makeInventoryItem', () => {
  it('fills sensible defaults for everything except name + type', () => {
    const item = makeInventoryItem({ name: 'memo', type: InventoryType.NOTECARD })
    expect(item).toEqual({
      name: 'memo',
      type: InventoryType.NOTECARD,
      key: NULL_KEY,
      creator: NULL_KEY,
      description: '',
      acquireTimeMs: 0,
      permMask: {
        base: PERM_ALL,
        owner: PERM_ALL,
        group: 0,
        everyone: 0,
        next: PERM_ALL,
      },
    })
    // Optional fields aren't materialized when not provided — keeps the
    // shape minimal for non-script / non-notecard items.
    expect('script' in item).toBe(false)
    expect('notecardLines' in item).toBe(false)
  })

  it('passes through caller-supplied overrides', () => {
    const item = makeInventoryItem({
      name: 'tex',
      type: InventoryType.TEXTURE,
      key: 'abc',
      creator: 'def',
      description: 'a swatch',
      acquireTimeMs: 12345,
      permMask: { base: 1, owner: 2, group: 3, everyone: 4, next: 5 },
    })
    expect(item.key).toBe('abc')
    expect(item.creator).toBe('def')
    expect(item.description).toBe('a swatch')
    expect(item.acquireTimeMs).toBe(12345)
    expect(item.permMask).toEqual({ base: 1, owner: 2, group: 3, everyone: 4, next: 5 })
  })

  it('attaches notecardLines when provided', () => {
    const item = makeInventoryItem({
      name: 'memo',
      type: InventoryType.NOTECARD,
      notecardLines: ['one', 'two'],
    })
    expect(item.notecardLines).toEqual(['one', 'two'])
    expect(item.script).toBeUndefined()
  })

  it('exposes the kwdb-derived InventoryType numeric codes', () => {
    // NOTECARD=7 is hard-coded in several existing tests; lock it down.
    expect(InventoryType.NOTECARD).toBe(7)
    expect(InventoryType.SCRIPT).toBe(10)
    expect(InventoryType.TEXTURE).toBe(0)
  })
})
