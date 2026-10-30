import type { BuiltinImpl } from '../runtime.js'
import { toInt32 } from '../values/types.js'

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
 * Minimum llSleep advance for positive durations: one server frame at the
 * LSL-canonical 45 Hz tick (~22.222 ms). `llSleep(0)` and negative values
 * are no-ops per the LSL wiki — they are early-returned before this floor
 * is applied.
 */
const FRAME_MS = 1000 / 45

/**
 * llSleep(float sec) — suspends the script on the virtual clock.
 *
 * Per LSL:
 *   - `sec <= 0` is a no-op; the script does not sleep at all.
 *   - For positive `sec`, the wait is at least one server frame (~22.22 ms
 *     at 45 Hz), so e.g. `llSleep(0.001)` actually waits ~22 ms.
 *
 * Events that arrive while the script is sleeping queue up but don't fire
 * on the calling script until the current handler returns; the queue drain
 * happens at the handler boundary (inside Script.runHandler).
 */
export const llSleep: BuiltinImpl = (ctx, args) => {
  const seconds = (args[0] as number | undefined) ?? 0
  if (seconds <= 0) return undefined
  const ms = Math.max(FRAME_MS, seconds * 1000)
  ctx.sleep(ms)
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

/** llGetUnixTime() — whole seconds since the Unix epoch, wrapped to 32 bits. */
export const llGetUnixTime: BuiltinImpl = (ctx) => {
  return toInt32(Math.floor(ctx.state.clock.unixMicros() / 1e6))
}

/** llGetTimestamp() — UTC time as `YYYY-MM-DDThh:mm:ss.ffffffZ`. */
export const llGetTimestamp: BuiltinImpl = (ctx) => {
  const micros = ctx.state.clock.unixMicros()
  const ms = Math.floor(micros / 1000)
  const fraction = String(micros - Math.floor(micros / 1e6) * 1e6).padStart(6, '0')
  return `${new Date(ms).toISOString().slice(0, 19)}.${fraction}Z`
}

/** llGetDate() — UTC date as `YYYY-MM-DD`. */
export const llGetDate: BuiltinImpl = (ctx) => {
  return new Date(Math.floor(ctx.state.clock.unixMicros() / 1000)).toISOString().slice(0, 10)
}

/** llGetRegionTimeDilation() — 1.0, a region running at full speed. */
export const llGetRegionTimeDilation: BuiltinImpl = () => 1
