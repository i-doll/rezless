import type { BuiltinImpl } from '../runtime.js'

/**
 * llResetOtherScript(string name) — reset a sibling script in the same prim.
 * No-op if no script of that name exists. The reset is scheduled via a
 * synthetic `__reset` event so it runs on the next drain step rather than
 * re-entering the target while the caller's handler is still on the stack.
 */
export const llResetOtherScript: BuiltinImpl = (ctx, args) => {
  const name = (args[0] as string | undefined) ?? ''
  const target = ctx.prim.findScript(name)
  if (!target) return undefined
  ctx.linkset.clock.schedule(target, ctx.linkset.clock.now, '__reset', {})
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
    // Realign the timer cadence so the next fire is one interval from now,
    // not a flood of catch-up events for every interval missed during pause.
    const v = target.clockView
    if (v.timerIntervalMs > 0) {
      v.timerNextFireMs = ctx.linkset.clock.now + v.timerIntervalMs
    }
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
