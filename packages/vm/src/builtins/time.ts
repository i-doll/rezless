import type { BuiltinImpl } from '../runtime.js'

/**
 * Time and timer built-ins. All operate on the virtual clock; no real
 * wall-clock time is read.
 */

/** llSetTimerEvent(float sec) — `sec <= 0` cancels; otherwise (re)arms. */
export const llSetTimerEvent: BuiltinImpl = (ctx, args) => {
  const seconds = (args[0] as number | undefined) ?? 0
  ctx.state.clock.setTimer(seconds * 1000)
  return undefined
}

/**
 * Minimum llSleep advance: one server frame at the LSL-canonical 45 Hz tick
 * (~22.222 ms). Even `llSleep(0)` waits for the next frame in production.
 */
const FRAME_MS = 1000 / 45

/**
 * llSleep(float sec) — synchronously advances the virtual clock.
 *
 * Per LSL: the calling script does nothing during this time; the wait is at
 * least one server frame (~22.22 ms at 45 Hz) even for `sec == 0` or tiny
 * positive values. Events that arrive while the script is sleeping queue up
 * but don't fire on the calling script until the current handler returns.
 * We model that by advancing the linkset clock; the queue drain happens at
 * the handler boundary (inside Script.runHandler).
 */
export const llSleep: BuiltinImpl = (ctx, args) => {
  const seconds = (args[0] as number | undefined) ?? 0
  const ms = Math.max(FRAME_MS, seconds * 1000)
  ctx.state.clock.advance(ms)
  return undefined
}

/** llGetTime() — seconds since script start (or last llResetTime). */
export const llGetTime: BuiltinImpl = (ctx) => {
  return ctx.state.clock.elapsedSeconds()
}

/** llGetAndResetTime() — returns elapsed and resets in one atomic step. */
export const llGetAndResetTime: BuiltinImpl = (ctx) => {
  const elapsed = ctx.state.clock.elapsedSeconds()
  ctx.state.clock.resetReference()
  return elapsed
}

/** llResetTime() — snapshot now as the new reference for llGetTime. */
export const llResetTime: BuiltinImpl = (ctx) => {
  ctx.state.clock.resetReference()
  return undefined
}
