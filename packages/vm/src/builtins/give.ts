import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { InventoryItem } from '../inventory.js'
import { InventoryType } from '../inventory.js'
import type { Prim } from '../prim.js'
import type { LslValue } from '../values/types.js'
import { NULL_KEY } from '../values/types.js'
import { formatListElement } from '../values/format.js'
import { listElementType } from '../values/list-types.js'
import { PERM_COPY, PERM_TRANSFER, CHANGED_INVENTORY, CHANGED_ALLOWED_DROP, TRANSFER_DEST, TRANSFER_FLAGS } from '../generated/constants.js'
import { sayError } from './debug.js'
import { isAgentInRegion, isKey } from './viewer.js'
import { llRemoveInventory } from './inventory.js'

/** An avatar offer or completed prim delivery. Items are snapshots of the transferred inventory. */
export interface InventoryOffer {
  readonly kind: 'inventory' | 'inventoryList' | 'agentInventory'
  readonly target: string
  /** Avatar folder name; null for a single item or a prim destination. */
  readonly folder: string | null
  readonly rootPath: ReadonlyArray<string>
  readonly items: ReadonlyArray<InventoryItem>
}

export { llAllowInventoryDrop } from './collision.js'

function findPrim(ctx: CallContext, key: string): Prim | undefined {
  return ctx.linkset.peers.flatMap(l => l.dead ? [] : l.prims).find(p => p.key.toLowerCase() === key.toLowerCase())
}

function snapshot(item: InventoryItem, foreign: boolean): InventoryItem {
  const { script: _script, ...copy } = item
  return { ...copy, permMask: { ...item.permMask,
    ...(foreign ? { base: item.permMask.base & item.permMask.next, owner: item.permMask.owner & item.permMask.next } : {}),
  }, ...(item.notecardLines ? { notecardLines: [...item.notecardLines] } : {}) }
}

function deliver(ctx: CallContext, kind: InventoryOffer['kind'], target: string, items: InventoryItem[], prim: Prim | undefined, folder: string | null, rootPath: string[] = []): void {
  const foreign = (prim?.linkset?.owner ?? target).toLowerCase() !== ctx.linkset.owner.toLowerCase()
  if (prim && foreign && !prim.linkset!.prims[0]!.allowInventoryDrop) {
    sayError(ctx, "Unable to give inventory: 'Blocked by permissions'.")
    return
  }
  if (prim && foreign && items.some(i => i.type === InventoryType.SCRIPT)) {
    sayError(ctx, "Unable to give inventory: 'Blocked by permissions'.")
    items = items.filter(i => i.type !== InventoryType.SCRIPT)
    if (!items.length) return
  }
  const copies = items.map(i => snapshot(i, foreign))
  if (prim) {
    for (const item of copies) {
      let name = item.name
      let suffix = 0
      while (prim.inventory.some(i => i.name === name)) name = `${item.name} ${++suffix}`
      prim.addInventory({ ...item, name, acquireTimeMs: ctx.state.clock.now })
    }
    const changed = foreign ? CHANGED_ALLOWED_DROP : CHANGED_INVENTORY
    for (const script of prim.scripts) ctx.state.clock.scheduleOn(script, ctx.state.clock.now, 'changed', { changes: changed })
  }
  ctx.state.inventoryOffers.push({ kind, target, folder: prim ? null : folder, rootPath: [...rootPath], items: copies })
  if (kind === 'inventory') for (const item of items) {
    if (!(item.permMask.owner & PERM_COPY)) llRemoveInventory(ctx, [item.name])
  }
}

export const llGiveInventory: BuiltinImpl = (ctx, args) => {
  const target = (args[0] as string).toLowerCase()
  const name = args[1] as string
  const item = ctx.prim.inventory.find(i => i.name === name)
  if (!item) {
    sayError(ctx, `Unable to give inventory: 'No item named '${name}'.'.`)
    return undefined
  }
  if (!isKey(target) || target === NULL_KEY) return undefined
  const prim = findPrim(ctx, target)
  if (prim && prim.linkset!.region !== ctx.linkset.region) return undefined
  const foreign = (prim?.linkset?.owner ?? target).toLowerCase() !== ctx.linkset.owner.toLowerCase()
  if (foreign && !(item.permMask.owner & PERM_TRANSFER)) {
    sayError(ctx, "Unable to give inventory: 'Permissions do not allow transfer'.")
    return undefined
  }
  deliver(ctx, 'inventory', target, [item], prim, null)
  if (!prim) ctx.sleep(2000)
  return undefined
}

function listItems(ctx: CallContext, values: ReadonlyArray<LslValue>, foreign: boolean): InventoryItem[] {
  const items: InventoryItem[] = []
  for (let i = 0; i < values.length; i++) {
    const name = formatListElement(values[i]!, listElementType(values, i))
    const item = ctx.prim.inventory.find(it => it.name === name)
    if (item && (item.permMask.owner & PERM_COPY) && (!foreign || (item.permMask.owner & PERM_TRANSFER))) items.push(item)
  }
  return items
}

export const llGiveInventoryList: BuiltinImpl = (ctx, args) => {
  const target = (args[0] as string).toLowerCase()
  const prim = findPrim(ctx, target)
  if (prim ? prim.linkset!.region !== ctx.linkset.region : !isAgentInRegion(ctx, target)) {
    sayError(ctx, 'Unable to give inventory list: Cannot find destination')
    return undefined
  }
  const foreign = (prim?.linkset?.owner ?? target).toLowerCase() !== ctx.linkset.owner.toLowerCase()
  const items = listItems(ctx, args[2] as ReadonlyArray<LslValue>, foreign)
  if (!items.length) sayError(ctx, 'Unable to give inventory list: No items passed filter')
  else deliver(ctx, 'inventoryList', target, items, prim, (args[1] as string) || 'New Inventory')
  return undefined
}

function rootPath(options: ReadonlyArray<LslValue>): string[] | number {
  let path: string[] = []
  for (let i = 0; i < options.length; i += 2) {
    const rule = options[i]
    const ruleType = listElementType(options, i)
    if (typeof rule !== 'number' || !Number.isInteger(rule) || (ruleType !== undefined && ruleType !== 'integer')) return -1
    const value = options[i + 1]
    const type = listElementType(options, i + 1)
    if (rule === TRANSFER_DEST) {
      if (typeof value !== 'string' || (type !== undefined && type !== 'string')) return -1
      path = value.split('|').filter(Boolean)
      if (path.length > 4 || path.some(p => ['trash', 'lost and found', 'current outfit', 'inbox', 'outbox'].includes(p.trim().toLowerCase()))) return -5
    } else if (rule === TRANSFER_FLAGS) {
      if (typeof value !== 'number' || !Number.isInteger(value) || (type !== undefined && type !== 'integer')) return -1
    } else return -1
  }
  return path
}

export const llGiveAgentInventory: BuiltinImpl = (ctx, args) => {
  const path = rootPath(args[3] as ReadonlyArray<LslValue>)
  if (typeof path === 'number') return path
  const target = (args[0] as string).toLowerCase()
  if (findPrim(ctx, target) || !isAgentInRegion(ctx, target)) return -2
  const items = listItems(ctx, args[2] as ReadonlyArray<LslValue>, target !== ctx.linkset.owner.toLowerCase())
  if (!items.length) return -4
  deliver(ctx, 'agentInventory', target, items, undefined, (args[1] as string) || 'New Inventory', path)
  return 0
}
