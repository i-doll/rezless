import type { BuiltinImpl } from '../runtime.js'
import { toFloat32, toInt32 } from '../values/types.js'

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
 * llMinEventDelay(float delay) — timer and touch_start events start at
 * least `delay` seconds apart, counted from the call and then from the
 * start of each of them. A reset clears it; a state change keeps it.
 */
export const llMinEventDelay: BuiltinImpl = (ctx, args) => {
  ctx.state.clock.setMinEventDelay(((args[0] as number | undefined) ?? 0) * 1000)
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
 * Other scripts keep running while it sleeps. Events that arrive for the
 * sleeping script queue up and fire after its current handler returns.
 */
export const llSleep: BuiltinImpl = (ctx, args) => {
  const seconds = (args[0] as number | undefined) ?? 0
  if (seconds <= 0) return undefined
  ctx.sleep(Number.isNaN(seconds) ? FRAME_MS : Math.max(FRAME_MS, seconds * 1000))
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

const DAY_SECONDS = 86_400

/** Default environment day length: four hours. */
const ENVIRONMENT_DAY_SECONDS = 14_400

const PACIFIC = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  hourCycle: 'h23',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
})

/** llGetGMTclock() — whole seconds since midnight UTC. */
export const llGetGMTclock: BuiltinImpl = (ctx) => {
  return Math.floor(ctx.state.clock.unixMicros() / 1e6) % DAY_SECONDS
}

/** llGetWallclock() — whole seconds since midnight US Pacific time, following daylight time. */
export const llGetWallclock: BuiltinImpl = (ctx) => {
  const parts = PACIFIC.formatToParts(Math.floor(ctx.state.clock.unixMicros() / 1000))
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)!.value)
  return part('hour') * 3600 + part('minute') * 60 + part('second')
}

/** llGetTimeOfDay() — seconds into the default four-hour environment day. */
export const llGetTimeOfDay: BuiltinImpl = (ctx) => {
  return toFloat32((ctx.state.clock.unixMicros() % (ENVIRONMENT_DAY_SECONDS * 1e6)) / 1e6)
}
