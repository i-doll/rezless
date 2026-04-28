import type { BuiltinImpl } from '../runtime.js'
import type { InventoryItem } from '../inventory.js'
import { InventoryType } from '../inventory.js'
import { NULL_KEY } from '../values/types.js'
import { INVENTORY_ALL, INVENTORY_NONE, EOF, NAK } from '../generated/constants.js'

function itemsOfType(items: ReadonlyArray<InventoryItem>, type: number): InventoryItem[] {
  if (type === INVENTORY_ALL) return [...items]
  return items.filter((it) => it.type === type)
}

function find(items: ReadonlyArray<InventoryItem>, name: string): InventoryItem | undefined {
  return items.find((it) => it.name === name)
}

/** llGetInventoryNumber(integer type) — count of items of that type. */
export const llGetInventoryNumber: BuiltinImpl = (ctx, args) => {
  const type = (args[0] as number | undefined) ?? INVENTORY_ALL
  return itemsOfType(ctx.prim.inventory, type).length
}

/** llGetInventoryName(integer type, integer i) — i-th item name, or "". */
export const llGetInventoryName: BuiltinImpl = (ctx, args) => {
  const type = (args[0] as number | undefined) ?? INVENTORY_ALL
  const i = (args[1] as number | undefined) ?? 0
  const items = itemsOfType(ctx.prim.inventory, type)
  return items[i]?.name ?? ''
}

/** llGetInventoryType(string name) — type code, or INVENTORY_NONE. */
export const llGetInventoryType: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  return find(ctx.prim.inventory, name)?.type ?? INVENTORY_NONE
}

/** llGetInventoryKey(string name) — asset key, or NULL_KEY. */
export const llGetInventoryKey: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  return find(ctx.prim.inventory, name)?.key ?? NULL_KEY
}

/** llGetInventoryCreator(string name) — creator key, or NULL_KEY. */
export const llGetInventoryCreator: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  return find(ctx.prim.inventory, name)?.creator ?? NULL_KEY
}

/** llGetInventoryDesc(string name) — description, or "". */
export const llGetInventoryDesc: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  return find(ctx.prim.inventory, name)?.description ?? ''
}

/**
 * llGetInventoryAcquireTime(string name) — UTC acquire timestamp formatted
 * as `YYYY-MM-DDThh:mm:ssZ` per the LSL spec. We treat the stored
 * `acquireTimeMs` as ms since the Unix epoch so the default value of 0
 * formats to `1970-01-01T00:00:00Z`.
 */
export const llGetInventoryAcquireTime: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const item = find(ctx.prim.inventory, name)
  if (!item) return ''
  return new Date(item.acquireTimeMs).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** llGetInventoryPermMask(string name, integer mask) — selected mask, or 0. */
export const llGetInventoryPermMask: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const mask = (args[1] as number | undefined) ?? 0
  const item = find(ctx.prim.inventory, name)
  if (!item) return 0
  switch (mask) {
    case 0:
      return item.permMask.base
    case 1:
      return item.permMask.owner
    case 2:
      return item.permMask.group
    case 3:
      return item.permMask.everyone
    case 4:
      return item.permMask.next
    default:
      return 0
  }
}

/**
 * llGetNotecardLine(string name, integer line) — schedule a dataserver
 * response with the requested line. Returns the request key.
 */
export const llGetNotecardLine: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const line = (args[1] as number | undefined) ?? 0
  const item = find(ctx.prim.inventory, name)
  ctx.state.dataserverKeyCounter += 1
  const key = `data-req-${String(ctx.state.dataserverKeyCounter).padStart(8, '0')}`
  ctx.state.dataserverRequests.push({
    key,
    source: 'notecard_line',
    args: [name, line],
    fulfilled: false,
  })
  // Per LSL spec: out-of-range line on an existing notecard yields EOF;
  // a missing notecard yields NAK.
  let text = NAK
  if (item && item.type === InventoryType.NOTECARD && item.notecardLines) {
    text = line >= 0 && line < item.notecardLines.length ? item.notecardLines[line]! : EOF
  }
  ctx.state.clock.schedule(ctx.state.clock.now, 'dataserver', { queryid: key, data: text })
  const req = ctx.state.dataserverRequests[ctx.state.dataserverRequests.length - 1]!
  req.fulfilled = true
  return key
}

/**
 * llGetNumberOfNotecardLines(string name) — schedule a dataserver response
 * with the line count for the named notecard. Returns the request key.
 */
export const llGetNumberOfNotecardLines: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const item = find(ctx.prim.inventory, name)
  ctx.state.dataserverKeyCounter += 1
  const key = `data-req-${String(ctx.state.dataserverKeyCounter).padStart(8, '0')}`
  ctx.state.dataserverRequests.push({
    key,
    source: 'notecard_lines',
    args: [name],
    fulfilled: false,
  })
  // Missing notecard yields NAK; a present notecard yields its line count.
  const data =
    item && item.type === InventoryType.NOTECARD && item.notecardLines
      ? String(item.notecardLines.length)
      : NAK
  ctx.state.clock.schedule(ctx.state.clock.now, 'dataserver', { queryid: key, data })
  const req = ctx.state.dataserverRequests[ctx.state.dataserverRequests.length - 1]!
  req.fulfilled = true
  return key
}
