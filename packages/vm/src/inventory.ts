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
  CHANGED_INVENTORY,
} from './generated/constants.js'
import type { Script } from './script.js'

/**
 * Queue `changed(CHANGED_INVENTORY)` for a script. A script asleep in a
 * handler that already waits for one gets no second event, unless it has woken
 * since that one was queued and no other is waiting behind it. A busy one gets
 * what the clock gives any event that comes up while it is busy.
 */
export function queueInventoryChanged(script: Script, changes = CHANGED_INVENTORY): void {
  const clock = script.linkset.clock
  if (script.wakeAt !== undefined && !script.busy) {
    const waiting = clock.pendingEvents().filter((e) => e.target === script && e.event === 'changed'
      && ((e.payload['changes'] as number) & CHANGED_INVENTORY) !== 0)
    const merge = waiting.find((e) => e.at >= script.resumedAt) ?? (waiting.length >= 2 ? waiting.at(-1) : undefined)
    if (merge) {
      merge.payload['changes'] = (merge.payload['changes'] as number) | changes
      return
    }
  }
  clock.schedule(script, clock.now, 'changed', { changes })
}

/**
 * Whether an owner edit or a remote script load made now queues `changed`
 * for a script. It does not for a stopped script, nor for one that has not
 * run yet.
 */
export function hearsInventoryChange(script: Script): boolean {
  return script.running && script.hasStarted
}

/** The name an arriving item gets: a taken name is cut to fit a number within 63 characters. */
export function freeInventoryName(inventory: ReadonlyArray<InventoryItem>, name: string): string {
  return numberedName(name, freeNumber(inventory, name, 0))
}

/**
 * The name `item` gets when renamed to `name`. A name another item holds takes
 * the number an arriving item would get plus one, then the next free one; an
 * item already called by such a numbered name keeps it.
 */
export function renamedInventoryName(inventory: ReadonlyArray<InventoryItem>, item: InventoryItem, name: string): string {
  const others = inventory.filter((it) => it !== item)
  if (!others.some((it) => it.name === name)) return name
  const first = freeNumber(others, name, 1)
  if (numberedName(name, first) === item.name) return item.name
  return numberedName(name, freeNumber(others, name, first + 1))
}

function freeNumber(inventory: ReadonlyArray<InventoryItem>, name: string, from: number): number {
  let n = from
  while (inventory.some((item) => item.name === numberedName(name, n))) n++
  return n
}

function numberedName(name: string, n: number): string {
  return n === 0 ? name : `${name.slice(0, 63 - ` ${n}`.length)} ${n}`
}

/**
 * LSL inventory item types. Numeric values come straight from the
 * INVENTORY_* constants. MESH (22) has no LSL constant.
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
  /** A notecard saved with embedded items: scripts read it as having no lines. */
  hasEmbeddedItems?: boolean
  /** Saved object contents. Rezzing copies this linkset with fresh prim keys. */
  object?: import('./linkset.js').Linkset
  /** For type === INVENTORY_SETTING: what llReplaceEnvironment applies from it. */
  environment?: import('./world.js').EnvironmentAsset
}

/** A notecard that was never saved holds no asset. */
export function isEmptyNotecard(item: InventoryItem): boolean {
  return item.type === InventoryType.NOTECARD && item.key === NULL_KEY && !item.notecardLines?.length
}

/** The masks an item or prim has once it reaches its next owner. */
export function nextOwnerMask(mask: PermMask): PermMask {
  return { ...mask, base: mask.base & mask.next, owner: mask.owner & mask.next }
}

/** An item as its next owner receives it: its masks, and a saved object's prims, cut to the next-owner masks. */
export function forNextOwner(item: InventoryItem): InventoryItem {
  const copy = { ...item, permMask: nextOwnerMask(item.permMask) }
  if (item.object) {
    copy.object = item.object.copy()
    for (const prim of copy.object.prims) prim.permMask = nextOwnerMask(prim.permMask)
  }
  return copy
}

/** Second Life drops non-ASCII characters from an item's name when it enters a prim's inventory. */
export function inventoryItemName(name: string): string {
  return name.replace(/[^\x00-\x7f]/g, '')
}

/** The name a rename asks for: each control character, each byte of a non-ASCII character and each `|` becomes a space, then it is cut to 63 characters and trimmed. */
export function renamedItemName(name: string): string {
  const bytes = [...new TextEncoder().encode(name)]
  return bytes.map((b) => (b < 0x20 || b > 0x7f || b === 0x7c ? ' ' : String.fromCharCode(b))).join('').slice(0, 63).trim()
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
  if (partial.hasEmbeddedItems !== undefined) item.hasEmbeddedItems = partial.hasEmbeddedItems
  if (partial.object !== undefined) item.object = partial.object
  if (partial.environment !== undefined) item.environment = partial.environment
  return item
}
