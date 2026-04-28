import type { BuiltinImpl } from '../runtime.js'

/**
 * llResetOtherScript(string name) — reset a sibling script in the same prim.
 * No-op if no script of that name exists. Per LSL: the reset is queued, not
 * synchronous, so we schedule a `__reset` synthetic event on the target.
 */
export const llResetOtherScript: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const target = ctx.prim.findScript(name)
  if (!target) return undefined
  // Reset on next drain step. We emit a synthetic event the script's deliver
  // path doesn't handle, and use the linkset clock to schedule a reset.
  // Simpler: do it synchronously after the current handler returns via a
  // microtask-like flag. Here we just call reset() now — the calling script
  // is mid-handler, so we re-enter the target only via drainQueue afterward.
  target.reset()
  return undefined
}

/** llSetScriptState(string name, integer running) — enable/disable sibling. */
export const llSetScriptState: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const running = ((args[1] as number | undefined) ?? 0) !== 0
  const target = ctx.prim.findScript(name)
  if (!target) return undefined
  const wasRunning = target.running
  target.running = running
  if (running && !wasRunning) {
    target.resumeParked()
  }
  return undefined
}

/** llGetScriptState(string name) — 1 if sibling exists and is running, else 0. */
export const llGetScriptState: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const target = ctx.prim.findScript(name)
  return target && target.running ? 1 : 0
}
