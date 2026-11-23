import type { BuiltinImpl } from '../runtime.js'
import type { LslValue, Vector } from '../values/types.js'
import { PAY_DEFAULT, PAY_HIDE, PRIM_DESC, PRIM_TEXT } from '../generated/constants.js'
import { listElementType } from '../values/list-types.js'
import { truncateUtf8 } from '../values/utf8.js'

/**
 * Builtins that read or mutate the prim's appearance / lifecycle. We
 * model them with structured state on the Script — `s.text` exposes
 * floating text; `s.dead` indicates the script called llDie.
 */

/** llSetText(string text, vector color, float alpha) — floating prim text. */
export const llSetText: BuiltinImpl = (ctx, args) => {
  const text = (args[0] as string | undefined) ?? ''
  const rawColor = (args[1] as Vector | undefined) ?? { x: 1, y: 1, z: 1 }
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  const color = { x: clamp(rawColor.x), y: clamp(rawColor.y), z: clamp(rawColor.z) }
  const alpha = Math.min(1, Math.max(0, (args[2] as number | undefined) ?? 1))
  // Route through the PRIM_TEXT seam — `ctx.state.appearance` is aliased
  // to `prim.appearance`, so legacy `s.text` reads see this write too.
  ctx.prim.setPrimParam(PRIM_TEXT, [text, color, alpha], 0)
  return undefined
}

/** llSetObjectDesc(string desc) — sets the prim's description field. */
export const llSetObjectDesc: BuiltinImpl = (ctx, args) => {
  const desc = (args[0] as string | undefined) ?? ''
  // Route through the PRIM_DESC seam so llGetPrimitiveParams sees the same
  // value. The seam mirrors to ScriptState.appearance via prim.appearance.
  ctx.prim.setPrimParam(PRIM_DESC, [desc], 0)
  return undefined
}

/** llGetObjectDesc() */
export const llGetObjectDesc: BuiltinImpl = (ctx) => ctx.prim.description

const MENU_TEXT_BYTES = 9
const PAY_BUTTON_DEFAULTS = [1, 5, 10, 20]

/** llSetTouchText(string text) — the region keeps the first 9 bytes. */
export const llSetTouchText: BuiltinImpl = (ctx, args) => {
  ctx.prim.touchText = truncateUtf8((args[0] as string | undefined) ?? '', MENU_TEXT_BYTES)
  return undefined
}

/** llSetSitText(string text) — the region keeps the first 9 bytes. */
export const llSetSitText: BuiltinImpl = (ctx, args) => {
  ctx.prim.sitText = truncateUtf8((args[0] as string | undefined) ?? '', MENU_TEXT_BYTES)
  return undefined
}

/**
 * llSetPayPrice(integer price, list quick_pay_buttons) — stores the four
 * buttons the pay dialog gets: PAY_DEFAULT takes that button's default,
 * anything but an integer and any missing button is PAY_HIDE, and an empty
 * list gives the defaults.
 */
export const llSetPayPrice: BuiltinImpl = (ctx, args) => {
  const list = (args[1] as LslValue[] | undefined) ?? []
  const buttons = PAY_BUTTON_DEFAULTS.map((fallback, i) => {
    if (list.length === 0) return fallback
    const value = list[i]
    const type = listElementType(list, i)
    if (typeof value !== 'number' || (type ?? 'integer') !== 'integer' || !Number.isInteger(value)) return PAY_HIDE
    return value === PAY_DEFAULT ? fallback : value
  })
  ctx.prim.payPrice = { price: (args[0] as number | undefined) ?? 0, buttons }
  return undefined
}

/**
 * llDie() — deletes the entire linked object. In real LSL this kills
 * every prim and every script in the linkset, not just the calling one.
 * We mark every script in the linkset as dead and cancel their timers;
 * subsequent events on any of them are dropped silently. The caller halts
 * once its next builtin call returns or at its next loop iteration.
 */
export const llDie: BuiltinImpl = (ctx) => {
  ctx.linkset.remove()
  ctx.state.lifecycle.dying = true
  return undefined
}

/** Thrown where a script that called llDie or removed itself halts. */
export class HaltSignal {}

/**
 * llResetScript() — reset globals to their initial values, return to the
 * `default` state, and run state_entry. Implemented by the Script handle:
 * the builtin throws a sentinel that runHandler / drainQueue catch.
 */
export class ResetScriptSignal {}
export const llResetScript: BuiltinImpl = (ctx) => {
  if (ctx.state.lifecycle.dying) return undefined
  throw new ResetScriptSignal()
}
