import type { BuiltinImpl } from '../runtime.js'
import { InventoryType, hearsInventoryChange, queueInventoryChanged } from '../inventory.js'
import { PERM_COPY, PERM_MODIFY } from '../generated/constants.js'
import { llRemoveInventory } from './inventory.js'
import { sayError } from './debug.js'

// In-world: batch.py, Aditi / SLua Tideland, 2026-11-01. Forced delay is applied by dispatch.
export const llRemoteLoadScriptPin: BuiltinImpl = (ctx, args) => {
  const key = String(args[0]).toLowerCase()
  const name = String(args[1])
  const item = ctx.prim.inventory.find(i => i.name === name)
  if (!item || item.type !== InventoryType.SCRIPT) {
    sayError(ctx, `Missing inventory item '${name}'.`)
    return
  }
  if (!item.script) return
  const target = ctx.linkset.peers.flatMap(l => l.dead ? [] : l.prims)
    .find(p => p.key.toLowerCase() === key && p.linkset!.region === ctx.linkset.region)
  if (!target) return
  const object = target.linkset!
  const ownerCanModify = object.owner.toLowerCase() === ctx.linkset.owner.toLowerCase() && (object.prims[0]!.permMask.owner & PERM_MODIFY) !== 0
  if (Number(args[2]) === 0 || target.remoteScriptAccessPin !== Number(args[2]) || !ownerCanModify) {
    sayError(ctx, `Task '${ctx.prim.name}' trying to illegally load script onto task '${target.name}'!`)
    return
  }
  if (target === ctx.prim) {
    sayError(ctx, 'Unable to add item!')
    return
  }
  const old = target.inventory.findIndex(i => i.name === name)
  if (old !== -1) {
    const [replaced] = target.inventory.splice(old, 1)
    if (replaced!.script) {
      replaced!.script.markDead()
      target.scripts.splice(target.scripts.indexOf(replaced!.script), 1)
    }
  }
  const copy = item.script.copyTo(target, { fresh: true })
  const entry = target.inventory.at(-1)!
  Object.assign(entry, { ...item, script: copy, acquireTimeMs: ctx.state.clock.now, permMask: { ...item.permMask } })
  copy.startParameter = Number(args[4])
  copy.running = Number(args[3]) !== 0
  copy.queueStart()
  if (!(item.permMask.owner & PERM_COPY)) llRemoveInventory(ctx, [name])
  for (const script of target.scripts) {
    if (script !== copy && hearsInventoryChange(script)) queueInventoryChanged(script)
  }
}
