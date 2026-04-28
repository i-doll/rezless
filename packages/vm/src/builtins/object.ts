import type { BuiltinImpl } from '../runtime.js'
import type { Vector } from '../values/types.js'
import { PRIM_TEXT } from '../generated/constants.js'

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
  // Route through the PRIM_TEXT seam so llGetPrimitiveParams sees the same value.
  ctx.prim.setPrimParam(PRIM_TEXT, [text, color, alpha], 0)
  // Mirror onto ScriptState.appearance for legacy `s.text` reads.
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
 * llDie() — deletes the entire linked object. In real LSL this kills
 * every prim and every script in the linkset, not just the calling one.
 * We mark every script in the linkset as dead and cancel their timers;
 * subsequent events on any of them are dropped silently. (Real LSL takes
 * a frame to actually delete, but for tests we mark immediately.)
 */
export const llDie: BuiltinImpl = (ctx) => {
  for (const s of ctx.linkset.allScripts()) {
    s.markDead()
  }
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
