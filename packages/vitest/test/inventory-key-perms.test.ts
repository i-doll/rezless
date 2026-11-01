import { expect, it } from 'vitest'
import {
  InventoryType,
  NULL_KEY,
  PERM_ALL,
  PERM_COPY,
  PERM_MODIFY,
  PERM_TRANSFER,
  loadScript,
  makeInventoryItem,
} from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlGetInventoryKey
const ASSET = '00000000-0000-0000-0000-000000000348'
const FULL = PERM_COPY | PERM_MODIFY | PERM_TRANSFER
const masks = (owner: number, next = PERM_ALL) => ({
  base: PERM_ALL,
  owner,
  group: 0,
  everyone: 0,
  next,
})

async function readKey(owner: number, next = PERM_ALL) {
  const s = await loadScript({ source: `key result;
    default { state_entry() { result = llGetInventoryKey("asset"); } }` })
  s.host.addInventory(makeInventoryItem({
    name: 'asset',
    type: InventoryType.TEXTURE,
    key: ASSET,
    permMask: masks(owner, next),
  }))
  s.start()
  return s.global('result')
}

it.each([PERM_ALL, FULL])('returns the asset key when owner permissions include copy, modify and transfer (%i)', async owner => {
  // In-world: own-inventory script with owner=2147483647 -> non-null key
  // (Aditi, SLua Tideland, Firestorm 7.3.0.83011, 2026-11-01).
  expect(await readKey(owner)).toBe(ASSET)
})

it.each([
  ['copy', PERM_COPY],
  ['modify', PERM_MODIFY],
  ['transfer', PERM_TRANSFER],
] as const)('returns NULL_KEY when the owner lacks %s, even with full base and next-owner masks', async (_name, bit) => {
  expect(await readKey(PERM_ALL & ~bit)).toBe(NULL_KEY)
})

it('returns NULL_KEY when the owner has no permissions', async () => {
  expect(await readKey(0)).toBe(NULL_KEY)
})

it.each([
  ['copy', PERM_COPY],
  ['modify', PERM_MODIFY],
  ['transfer', PERM_TRANSFER],
] as const)('returns the key when only the next owner lacks %s', async (_name, bit) => {
  // In-world: own-inventory script with full owner permissions and next masks
  // 548864 (no copy), 565248 (no modify), 573440 (no transfer) -> non-null keys
  // (Aditi, SLua Tideland, Firestorm 7.3.0.83011, 2026-11-01).
  expect(await readKey(PERM_ALL, FULL & ~bit)).toBe(ASSET)
})

it('returns NULL_KEY for a missing name without a diagnostic', async () => {
  // In-world: missing inventory name -> 00000000-0000-0000-0000-000000000000
  // (Aditi, SLua Tideland, Firestorm 7.3.0.83011, 2026-11-01).
  const s = await loadScript({ source: `key result;
    default { state_entry() { result = llGetInventoryKey("missing"); } }` })
  s.start()
  expect(s.global('result')).toBe(NULL_KEY)
  expect(s.chat).toEqual([])
})
