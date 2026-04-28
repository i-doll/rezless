import { NULL_KEY } from './values/types.js'

/**
 * LSL inventory item types. Numeric values match the kwdb constants
 * (INVENTORY_TEXTURE = 0, INVENTORY_SOUND = 1, …).
 */
export const InventoryType = {
  TEXTURE: 0,
  SOUND: 1,
  LANDMARK: 3,
  CLOTHING: 5,
  OBJECT: 6,
  NOTECARD: 7,
  SCRIPT: 10,
  BODYPART: 13,
  ANIMATION: 20,
  GESTURE: 21,
  MESH: 22,
  SETTING: 56,
  MATERIAL: 57,
} as const

export type InventoryTypeValue = (typeof InventoryType)[keyof typeof InventoryType]

/** Permission mask slots passed to llGetInventoryPermMask. */
export interface PermMask {
  readonly base: number
  readonly owner: number
  readonly group: number
  readonly everyone: number
  readonly next: number
}

const FULL_PERMS = 0x7fffffff

const DEFAULT_PERMS: PermMask = {
  base: FULL_PERMS,
  owner: FULL_PERMS,
  group: 0,
  everyone: 0,
  next: FULL_PERMS,
}

/**
 * A single item in a prim's inventory. For scripts, `script` references the
 * `Script` instance; for notecards, `notecardLines` carries the text body.
 * Other types are passive metadata.
 */
export interface InventoryItem {
  name: string
  type: InventoryTypeValue
  key: string
  creator: string
  description: string
  /** Virtual ms timestamp (relative to the linkset clock) when added. */
  acquireTimeMs: number
  permMask: PermMask
  /** Set when type === INVENTORY_SCRIPT. */
  script?: import('./script.js').Script
  /** Set when type === INVENTORY_NOTECARD. */
  notecardLines?: ReadonlyArray<string>
}

export function makeInventoryItem(
  partial: Partial<InventoryItem> & { name: string; type: InventoryTypeValue },
): InventoryItem {
  const item: InventoryItem = {
    name: partial.name,
    type: partial.type,
    key: partial.key ?? NULL_KEY,
    creator: partial.creator ?? NULL_KEY,
    description: partial.description ?? '',
    acquireTimeMs: partial.acquireTimeMs ?? 0,
    permMask: partial.permMask ?? DEFAULT_PERMS,
  }
  if (partial.script !== undefined) item.script = partial.script
  if (partial.notecardLines !== undefined) item.notecardLines = partial.notecardLines
  return item
}
