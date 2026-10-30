import type { BuiltinImpl } from '../runtime.js'
import { sayError } from './debug.js'
import { llResetScript } from './object.js'

/**
 * llResetOtherScript(string name) — reset a sibling script in the same prim.
 * Says an error if no script of that name exists; a script that is not running is left alone, and one
 * naming itself resets at once as with llResetScript. The reset is scheduled via a
 * synthetic `__reset` event so it runs on the next drain step rather than
 * re-entering the target while the caller's handler is still on the stack.
 */
export const llResetOtherScript: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const target = ctx.prim.findScript(name)
  if (!target) {
    sayError(ctx, `Could not find script '${name}'`)
    return undefined
  }
  if (!target.running) return undefined
  if (target === ctx.script) return llResetScript(ctx, [])
  ctx.linkset.clock.schedule(target, ctx.linkset.clock.now, '__reset', {})
  return undefined
}

/** llSetScriptState(string name, integer running) — enable/disable a script; one that stops itself stops at once. */
export const llSetScriptState: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const running = ((args[1] as number | undefined) ?? 0) !== 0
  const target = ctx.prim.findScript(name)
  if (!target) {
    sayError(ctx, `Could not find script '${name}'.`)
    return undefined
  }
  const wasRunning = target.running
  target.running = running
  if (target === ctx.script && !running) ctx.sleep(0)
  if (running && !wasRunning) {
    // Ticks missed while paused collapse into one fired at once.
    const v = target.clockView
    if (v.timerIntervalMs > 0) {
      v.timerNextFireMs = Math.max(v.timerNextFireMs, ctx.linkset.clock.now)
    }
    target.resumeParked()
  }
  return undefined
}

/** llGetScriptState(string name) — 1 if sibling is running, else 0; a missing script says an error. */
export const llGetScriptState: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const target = ctx.prim.findScript(name)
  if (!target) sayError(ctx, `Could not find script '${name}'.`)
  return target && target.running ? 1 : 0
}
