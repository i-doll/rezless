import type { BuiltinImpl, CallContext } from '../runtime.js'
import { sayError } from './debug.js'
import { llResetScript } from './object.js'

/**
 * llResetOtherScript(string name) — reset a sibling script in the same prim.
 * Says an error if no inventory item of that name exists; an inactive asset and a stopped script
 * are left alone, a crashed script that is set running runs again, and one
 * naming itself resets at once as with llResetScript. The reset is scheduled via a
 * synthetic `__reset` event so it runs on the next drain step rather than
 * re-entering the target while the caller's handler is still on the stack.
 */
export const llResetOtherScript: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const target = ctx.prim.findScript(name)
  if (!target) {
    if (!ctx.prim.inventory.some(item => item.name === name)) {
      sayError(ctx, `Could not find script '${name}'`)
      ctx.sleep(1000)
    }
    return undefined
  }
  if (target === ctx.script) return target.running ? llResetScript(ctx, []) : undefined
  if (pastWear(ctx, name, { reset: true })) return undefined
  if (target.crashed) {
    if (!target.dead) target.resetCrashed(false)
    return undefined
  }
  if (!target.running) return undefined
  ctx.linkset.clock.schedule(target, ctx.linkset.clock.now, '__reset', {})
  return undefined
}

/**
 * In-world: the rest of a handler that was busy at a detach ran after the wear, so a sibling it
 * stopped, started or reset changed after that sibling's on_rez and attach events.
 */
function pastWear(ctx: CallContext, name: string, change: { running: boolean } | { reset: true }): boolean {
  if (!ctx.script.detachedInHandler || !ctx.script.clockView.inInventory) return false
  ctx.script.pastWearChanges.push({ name, ...change })
  return true
}

/** llSetScriptState(string name, integer running) — enable/disable a script; one that stops itself stops at once. A crashed script keeps the setting and stays down. */
export const llSetScriptState: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const running = ((args[1] as number | undefined) ?? 0) !== 0
  const target = ctx.prim.findScript(name)
  if (!target) {
    sayError(ctx, `Could not find script '${name}'.`)
    ctx.sleep(1000)
    return undefined
  }
  // Held changes are judged after the wear, when a crashed LSL script may be running again.
  if (target !== ctx.script && pastWear(ctx, name, { running })) return undefined
  target.running = running
  if (target === ctx.script && !running) ctx.sleep(0)
  return undefined
}

/** llGetScriptState(string name) — 1 if running, 0 for an inactive asset; a missing item says an error. */
export const llGetScriptState: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const target = ctx.prim.findScript(name)
  if (!target && !ctx.prim.inventory.some(item => item.name === name)) {
    sayError(ctx, `Could not find script '${name}'.`)
    ctx.sleep(1000)
  }
  return target && target.readsRunning ? 1 : 0
}

/** llGetStartParameter() — the object's rez parameter; 0 once the script has reset. */
export const llGetStartParameter: BuiltinImpl = (ctx) => ctx.script.startParameter

/** llGetStartString() — the object's rez string; a reset keeps it. */
export const llGetStartString: BuiltinImpl = (ctx) => ctx.linkset.startString
