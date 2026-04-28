import { NULL_KEY } from './values/types.js'
import {
  INVENTORY_TEXTURE,
  INVENTORY_SOUND,
  INVENTORY_LANDMARK,
  INVENTORY_CLOTHING,
  INVENTORY_OBJECT,
  INVENTORY_NOTECARD,
  INVENTORY_SCRIPT,
  INVENTORY_BODYPART,
  INVENTORY_ANIMATION,
  INVENTORY_GESTURE,
  INVENTORY_SETTING,
  INVENTORY_MATERIAL,
  PERM_ALL,
} from './generated/constants.js'

/**
 * LSL inventory item types. Numeric values come straight from the kwdb
 * INVENTORY_* constants. MESH (22) has no kwdb constant.
 */
export const InventoryType = {
  TEXTURE: INVENTORY_TEXTURE,
  SOUND: INVENTORY_SOUND,
  LANDMARK: INVENTORY_LANDMARK,
  CLOTHING: INVENTORY_CLOTHING,
  OBJECT: INVENTORY_OBJECT,
  NOTECARD: INVENTORY_NOTECARD,
  SCRIPT: INVENTORY_SCRIPT,
  BODYPART: INVENTORY_BODYPART,
  ANIMATION: INVENTORY_ANIMATION,
  GESTURE: INVENTORY_GESTURE,
  MESH: 22,
  SETTING: INVENTORY_SETTING,
  MATERIAL: INVENTORY_MATERIAL,
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

const DEFAULT_PERMS: PermMask = {
  base: PERM_ALL,
  owner: PERM_ALL,
  group: 0,
  everyone: 0,
  next: PERM_ALL,
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
