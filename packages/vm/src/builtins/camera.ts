import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { LslValue, Rotation, Vector } from '../values/types.js'
import { ZERO_ROTATION, ZERO_VECTOR } from '../values/types.js'
import { PERMISSION_CONTROL_CAMERA, PERMISSION_TRACK_CAMERA } from '../generated/constants.js'

/** The permission agent's camera, as llGetCamera* report it. */
export interface Camera {
  pos: Vector
  rot: Rotation
  fov: number
  aspect: number
}

/** In-world, the headless viewer's lens read 1.047198 (60 degrees) and 1.4242. */
export function defaultCamera(): Camera {
  return { pos: ZERO_VECTOR, rot: ZERO_ROTATION, fov: Math.fround(Math.PI / 3), aspect: Math.fround(1.4242) }
}

const tracking = (ctx: CallContext) => (ctx.state.permissions.granted & PERMISSION_TRACK_CAMERA) !== 0
const controlling = (ctx: CallContext) => (ctx.state.permissions.granted & PERMISSION_CONTROL_CAMERA) !== 0

/** llGetCameraPos() — ZERO_VECTOR without PERMISSION_TRACK_CAMERA. */
export const llGetCameraPos: BuiltinImpl = (ctx) => (tracking(ctx) ? ctx.state.camera.pos : ZERO_VECTOR)

/** llGetCameraRot() — ZERO_ROTATION without PERMISSION_TRACK_CAMERA. */
export const llGetCameraRot: BuiltinImpl = (ctx) => (tracking(ctx) ? ctx.state.camera.rot : ZERO_ROTATION)

/** llGetCameraFOV() — 0.0 without PERMISSION_TRACK_CAMERA. */
export const llGetCameraFOV: BuiltinImpl = (ctx) => (tracking(ctx) ? ctx.state.camera.fov : 0)

/** llGetCameraAspect() — 0.0 without PERMISSION_TRACK_CAMERA. */
export const llGetCameraAspect: BuiltinImpl = (ctx) => (tracking(ctx) ? ctx.state.camera.aspect : 0)

/**
 * llSetCameraParams(list rules) — merges [rule, value, ...] pairs into the
 * recorded camera rules; a trailing rule without a value is dropped. Without
 * PERMISSION_CONTROL_CAMERA it does nothing and says nothing.
 */
export const llSetCameraParams: BuiltinImpl = (ctx, args) => {
  if (!controlling(ctx)) return undefined
  const rules = (args[0] as ReadonlyArray<LslValue> | undefined) ?? []
  for (let i = 0; i + 1 < rules.length; i += 2) {
    const rule = rules[i]
    if (typeof rule === 'number') ctx.state.cameraParams.set(rule, rules[i + 1]!)
  }
  return undefined
}

/** llClearCameraParams() — forgets every camera rule; needs PERMISSION_CONTROL_CAMERA. */
export const llClearCameraParams: BuiltinImpl = (ctx) => {
  if (controlling(ctx)) ctx.state.cameraParams.clear()
  return undefined
}
