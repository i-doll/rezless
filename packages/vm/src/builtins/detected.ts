import type { BuiltinImpl } from '../runtime.js'
import type { Vector, Rotation } from '../values/types.js'
import { ZERO_VECTOR, ZERO_ROTATION, NULL_KEY } from '../values/types.js'

/**
 * One entry in the per-handler "detected" context — the data exposed to
 * llDetected* family functions while a touch / sensor / collision handler
 * is running. Tests provide this via the event payload (e.g.
 * `s.fire('touch_start', { num_detected: 1, detected: [{...}] })`).
 */
export interface DetectedEntry {
  readonly key: string
  readonly name: string
  readonly owner?: string
  readonly group?: string
  readonly pos?: Vector
  readonly rot?: Rotation
  readonly vel?: Vector
  readonly type?: number
  readonly linkNumber?: number
  readonly grab?: Vector
  readonly touchPos?: Vector
}

/**
 * Per-handler detected context. The interpreter sets this before invoking
 * a touch / sensor / collision handler and clears it on return.
 */
export interface DetectedContext {
  readonly entries: ReadonlyArray<DetectedEntry>
}

function get(ctx: Parameters<BuiltinImpl>[0]): ReadonlyArray<DetectedEntry> {
  return ctx.state.detectedStack[ctx.state.detectedStack.length - 1]?.entries ?? []
}

function entry(
  ctx: Parameters<BuiltinImpl>[0],
  args: ReadonlyArray<unknown>,
): DetectedEntry | undefined {
  const i = (args[0] as number | undefined) ?? 0
  const list = get(ctx)
  if (i < 0 || i >= list.length) return undefined
  return list[i]
}

export const llDetectedKey: BuiltinImpl = (ctx, args) => entry(ctx, args)?.key ?? NULL_KEY
export const llDetectedName: BuiltinImpl = (ctx, args) => entry(ctx, args)?.name ?? NULL_KEY
export const llDetectedOwner: BuiltinImpl = (ctx, args) =>
  entry(ctx, args)?.owner ?? entry(ctx, args)?.key ?? NULL_KEY
export const llDetectedGroup: BuiltinImpl = (ctx, args) => entry(ctx, args)?.group ?? NULL_KEY
export const llDetectedPos: BuiltinImpl = (ctx, args) => entry(ctx, args)?.pos ?? ZERO_VECTOR
export const llDetectedRot: BuiltinImpl = (ctx, args) => entry(ctx, args)?.rot ?? ZERO_ROTATION
export const llDetectedVel: BuiltinImpl = (ctx, args) => entry(ctx, args)?.vel ?? ZERO_VECTOR
export const llDetectedType: BuiltinImpl = (ctx, args) => entry(ctx, args)?.type ?? 0
export const llDetectedLinkNumber: BuiltinImpl = (ctx, args) =>
  entry(ctx, args)?.linkNumber ?? 0
export const llDetectedGrab: BuiltinImpl = (ctx, args) => entry(ctx, args)?.grab ?? ZERO_VECTOR
export const llDetectedTouchPos: BuiltinImpl = (ctx, args) =>
  entry(ctx, args)?.touchPos ?? ZERO_VECTOR
