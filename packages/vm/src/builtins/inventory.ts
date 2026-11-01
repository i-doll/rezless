import type { BuiltinImpl, CallContext } from '../runtime.js'
import { nextDataserverKey } from './dataserver.js'
import { sayError } from './debug.js'
import type { InventoryItem } from '../inventory.js'
import { InventoryType } from '../inventory.js'
import { NULL_KEY } from '../values/types.js'
import {
  INVENTORY_ALL,
  INVENTORY_NONE,
  EOF,
  NAK,
  MASK_BASE,
  MASK_OWNER,
  MASK_GROUP,
  MASK_EVERYONE,
  MASK_NEXT,
  PERM_COPY,
  PERM_MODIFY,
  PERM_TRANSFER,
} from '../generated/constants.js'

function itemsOfType(items: ReadonlyArray<InventoryItem>, type: number): InventoryItem[] {
  if (type === INVENTORY_ALL) return [...items]
  return items.filter((it) => it.type === type)
}

function find(items: ReadonlyArray<InventoryItem>, name: string): InventoryItem | undefined {
  return items.find((it) => it.name === name)
}

const nameTokens = (name: string) => name.toLowerCase().match(/\d+|\D/g) ?? []
const isDigits = (token: string) => /^\d/.test(token)

export function compareNames(a: string, b: string): number {
  const folded = compareFolded(a, b)
  if (folded !== 0) return folded
  return a < b ? -1 : a > b ? 1 : 0
}

function compareFolded(a: string, b: string): number {
  const x = nameTokens(a)
  const y = nameTokens(b)
  for (let k = 0; k < Math.min(x.length, y.length); k++) {
    const p = x[k]!
    const q = y[k]!
    if (p === q) continue
    if (p.length !== q.length && isDigits(p) && isDigits(q)) return p.length - q.length
    return p < q ? -1 : 1
  }
  return x.length - y.length
}

/** llGetInventoryNumber(integer type) — count of items of that type. */
export const llGetInventoryNumber: BuiltinImpl = (ctx, args) => {
  const type = (args[0] as number | undefined) ?? INVENTORY_ALL
  return itemsOfType(ctx.prim.inventory, type).length
}

/**
 * llGetInventoryName(integer type, integer i) — i-th item name, or "". Names sort case-insensitively
 * with uppercase first on a tie, and digit runs compare as numbers.
 */
export const llGetInventoryName: BuiltinImpl = (ctx, args) => {
  const type = (args[0] as number | undefined) ?? INVENTORY_ALL
  const i = (args[1] as number | undefined) ?? 0
  const names = itemsOfType(ctx.prim.inventory, type)
    .map((it) => it.name)
    .sort(compareNames)
  return names[i] ?? ''
}

/** llGetInventoryType(string name) — type code, or INVENTORY_NONE. */
export const llGetInventoryType: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  return find(ctx.prim.inventory, name)?.type ?? INVENTORY_NONE
}

/** llGetInventoryKey(string name) — asset key for a full-permission item, or NULL_KEY. */
export const llGetInventoryKey: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const item = find(ctx.prim.inventory, name)
  const fullPerms = PERM_COPY | PERM_MODIFY | PERM_TRANSFER
  if (!item || (item.permMask.owner & fullPerms) !== fullPerms) return NULL_KEY
  return item.key
}

/** llGetInventoryCreator(string name) — creator key, or NULL_KEY and an error for a missing item. */
export const llGetInventoryCreator: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const item = find(ctx.prim.inventory, name)
  if (!item) sayError(ctx, `No item named '${name}'.`)
  return item?.creator ?? NULL_KEY
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
  if (!item) {
    sayError(ctx, `No item named '${name}'.`)
    return ''
  }
  return new Date(item.acquireTimeMs).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** llGetInventoryPermMask(string name, integer mask) — selected mask, or 0. */
export const llGetInventoryPermMask: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const mask = (args[1] as number | undefined) ?? 0
  const item = find(ctx.prim.inventory, name)
  if (!item) {
    sayError(ctx, `No item named '${name}'.`)
    return 0
  }
  switch (mask) {
    case MASK_BASE:
      return item.permMask.base
    case MASK_OWNER:
      return item.permMask.owner
    case MASK_GROUP:
      return item.permMask.group
    case MASK_EVERYONE:
      return item.permMask.everyone
    case MASK_NEXT:
      return item.permMask.next
    default:
      return 0
  }
}

/** The named notecard's lines, or undefined after saying an error when there is no such notecard. */
function notecardLines(ctx: CallContext, name: string): ReadonlyArray<string> | undefined {
  const item = find(ctx.prim.inventory, name)
  if (item && item.type === InventoryType.NOTECARD && item.notecardLines) return item.notecardLines
  sayError(ctx, `Could not find notecard '${name}'.`)
  return undefined
}

/**
 * Record a notecard dataserver request and return its key. A missing
 * notecard says an error and fires no event; otherwise `data` is
 * scheduled for every script in the prim once the call's delay has passed.
 */
function notecardRequest(
  ctx: CallContext,
  source: string,
  args: ReadonlyArray<unknown>,
  data: (lines: ReadonlyArray<string>) => string,
): string {
  const name = args[0] as string
  const key = nextDataserverKey(ctx)
  const req = { key, source, args, fulfilled: false }
  ctx.state.dataserverRequests.push(req)
  const lines = notecardLines(ctx, name)
  if (!lines) return key
  // Schedule after the dispatcher's post-call throttle advance so the event
  // fires after the call returns (matches real LSL).
  const at = ctx.state.clock.now + (ctx.spec?.delay ?? 0) * 1000
  const payload = { queryid: key, data: data(lines) }
  for (const s of ctx.prim.scripts) ctx.state.clock.scheduleOn(s, at, 'dataserver', payload)
  req.fulfilled = true
  return key
}

/**
 * llGetNotecardLine(string name, integer line) — schedule a dataserver
 * response with the requested line, or EOF past the end. Returns the request key.
 */
export const llGetNotecardLine: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const line = (args[1] as number | undefined) ?? 0
  return notecardRequest(ctx, 'notecard_line', [name, line], (lines) =>
    line >= 0 && line < lines.length ? lines[line]! : EOF,
  )
}

/**
 * llGetNumberOfNotecardLines(string name) — schedule a dataserver response
 * with the line count for the named notecard. Returns the request key.
 */
export const llGetNumberOfNotecardLines: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  return notecardRequest(ctx, 'notecard_lines', [name], (lines) => String(lines.length))
}

/**
 * llRemoveInventory(string name) — deletes the item, stopping it if it is
 * a script. A script that removes itself halts at once.
 */
export const llRemoveInventory: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const index = ctx.prim.inventory.findIndex((it) => it.name === name)
  if (index < 0) {
    sayError(ctx, `Missing inventory item '${name}'.`)
    return undefined
  }
  const [item] = ctx.prim.inventory.splice(index, 1)
  const script = item!.script
  if (script) {
    ctx.prim.scripts.splice(ctx.prim.scripts.indexOf(script), 1)
    script.markDead()
    if (script === ctx.script) ctx.state.lifecycle.removed = true
  }
  return undefined
}

/**
 * llGetNotecardLineSync(string name, integer line) — the line itself, EOF past the end, or NAK
 * (after an error) for a missing notecard. Notecards are always cached here.
 */
export const llGetNotecardLineSync: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const line = (args[1] as number | undefined) ?? 0
  const lines = notecardLines(ctx, name)
  if (!lines) return NAK
  return line >= 0 && line < lines.length ? lines[line]! : EOF
}
