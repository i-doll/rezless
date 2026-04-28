import type { BuiltinImpl } from '../runtime.js'
import type { Vector } from '../values/types.js'

/**
 * Builtins that read or mutate the prim's appearance / lifecycle. We
 * model them with structured state on the Script — `s.text` exposes
 * floating text; `s.dead` indicates the script called llDie.
 */

/** llSetText(string text, vector color, float alpha) — floating prim text. */
export const llSetText: BuiltinImpl = (ctx, args) => {
  const text = (args[0] as string | undefined) ?? ''
  const color = (args[1] as Vector | undefined) ?? { x: 1, y: 1, z: 1 }
  const alpha = (args[2] as number | undefined) ?? 1
  ctx.state.appearance.text = { text, color, alpha }
  return undefined
}

/** llSetObjectDesc(string desc) — sets the prim's description field. */
export const llSetObjectDesc: BuiltinImpl = (ctx, args) => {
  ctx.state.appearance.description = (args[0] as string | undefined) ?? ''
  return undefined
}

/** llGetObjectDesc() */
export const llGetObjectDesc: BuiltinImpl = (ctx) => ctx.state.appearance.description

/**
 * llDie() — schedules the prim/script for deletion. Marks the script as
 * dead; subsequent events are dropped silently. (Real LSL takes a frame
 * to actually delete, but for tests we mark immediately.)
 */
export const llDie: BuiltinImpl = (ctx) => {
  ctx.state.lifecycle.dead = true
  // Stop the timer so drainQueue doesn't iterate catch-up timer fires for a
  // script that's never going to handle them.
  ctx.state.clock.cancelTimer()
  return undefined
}

/**
 * llResetScript() — reset globals to their initial values, return to the
 * `default` state, and run state_entry. Implemented by the Script handle:
 * the builtin throws a sentinel that runHandler / drainQueue catch.
 */
export class ResetScriptSignal {}
export const llResetScript: BuiltinImpl = () => {
  throw new ResetScriptSignal()
}
