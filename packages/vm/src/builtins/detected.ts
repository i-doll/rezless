import type { BuiltinImpl } from '../runtime.js'
import type { Vector, Rotation } from '../values/types.js'
import { ZERO_VECTOR, ZERO_ROTATION, NULL_KEY } from '../values/types.js'
import { TOUCH_INVALID_TEXCOORD } from '../generated/constants.js'
import { typedList } from '../values/list-types.js'

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
  readonly touchFace?: number
  readonly touchST?: Vector
  readonly touchUV?: Vector
  readonly touchNormal?: Vector
  readonly touchBinormal?: Vector
  /** Who rezzed the detected object. Defaults to `owner`, then `key`. */
  readonly rezzer?: string
  /** What `on_damage` / `final_damage` read. `original` defaults to `amount`. */
  readonly damage?: { readonly amount: number; readonly type: number; readonly original?: number }
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
export const llDetectedTouchFace: BuiltinImpl = (ctx, args) => entry(ctx, args)?.touchFace ?? 0

// In-world, a click that carries no surface point reads <-1, -1, 0> here;
// outside a touch event and past the count these read ZERO_VECTOR.
const texcoord = (e: DetectedEntry | undefined, v: Vector | undefined): Vector =>
  e ? (v ?? TOUCH_INVALID_TEXCOORD) : ZERO_VECTOR
export const llDetectedTouchST: BuiltinImpl = (ctx, args) => {
  const e = entry(ctx, args)
  return texcoord(e, e?.touchST)
}
export const llDetectedTouchUV: BuiltinImpl = (ctx, args) => {
  const e = entry(ctx, args)
  return texcoord(e, e?.touchUV)
}
export const llDetectedTouchNormal: BuiltinImpl = (ctx, args) =>
  entry(ctx, args)?.touchNormal ?? ZERO_VECTOR
export const llDetectedTouchBinormal: BuiltinImpl = (ctx, args) =>
  entry(ctx, args)?.touchBinormal ?? ZERO_VECTOR

export const llDetectedRezzer: BuiltinImpl = (ctx, args) => {
  const e = entry(ctx, args)
  return e?.rezzer ?? e?.owner ?? e?.key ?? NULL_KEY
}
export const llDetectedDamage: BuiltinImpl = (ctx, args) => {
  const d = entry(ctx, args)?.damage
  if (!d) return []
  return typedList([d.amount, d.type, d.original ?? d.amount], ['float', 'integer', 'float'])
}
