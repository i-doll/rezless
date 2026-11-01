import type { BuiltinImpl, CallContext } from '../runtime.js'
import { rotateVector } from '../values/ops.js'
import { llAxes2Rot } from './math.js'
import type { LslValue, Rotation, Vector } from '../values/types.js'
import { vec, ZERO_ROTATION, ZERO_VECTOR } from '../values/types.js'
import { AGENT_MOUSELOOK, LINK_ROOT, LINK_THIS, PERMISSION_CONTROL_CAMERA, PERMISSION_TRACK_CAMERA } from '../generated/constants.js'

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

/** Seat offsets are captured by World when the avatar sits, then follow the prim. */
function seatedCamera(ctx: CallContext): Pick<Camera, 'pos' | 'rot'> | null {
  const avatar = ctx.linkset.world?.avatars.find(a => a.key.toLowerCase() === ctx.state.permissions.agent.toLowerCase())
  const seat = avatar?.sittingOn
  const offsets = avatar?.sittingCamera
  // Mouselook eye/bone transforms are supplied through Script.setCamera.
  if (!seat || !offsets || (avatar.info & AGENT_MOUSELOOK)) return null
  const eye = offsets.eye
  const at = offsets.at
  if (eye.x === at.x && eye.y === at.y && eye.z === at.z) return null
  const origin = seat.regionPosition()
  const rotation = seat.regionRotation()
  const offset = rotateVector(eye, rotation)
  const direction = rotateVector({ x: at.x - eye.x, y: at.y - eye.y, z: at.z - eye.z }, rotation)
  const length = Math.hypot(direction.x, direction.y, direction.z)
  const forward = vec(direction.x / length, direction.y / length, direction.z / length)
  const horizontal = Math.hypot(forward.x, forward.y)
  const left = horizontal === 0 ? vec(0, 1, 0) : vec(-forward.y / horizontal, forward.x / horizontal, 0)
  const up = vec(-forward.z * left.y, forward.z * left.x, forward.x * left.y - forward.y * left.x)
  return {
    pos: vec(origin.x + offset.x, origin.y + offset.y, origin.z + offset.z),
    rot: llAxes2Rot(ctx, [forward, left, up]) as Rotation,
  }
}

/** Pose shared by camera reads and consumers such as HUD projection. */
export function effectiveCamera(ctx: CallContext): Camera {
  const seated = seatedCamera(ctx)
  return seated ? { ...ctx.state.camera, ...seated } : ctx.state.camera
}

/** llGetCameraPos() — ZERO_VECTOR without PERMISSION_TRACK_CAMERA. */
export const llGetCameraPos: BuiltinImpl = (ctx) => (tracking(ctx) ? effectiveCamera(ctx).pos : ZERO_VECTOR)

/** llGetCameraRot() — ZERO_ROTATION without PERMISSION_TRACK_CAMERA. */
export const llGetCameraRot: BuiltinImpl = (ctx) => (tracking(ctx) ? effectiveCamera(ctx).rot : ZERO_ROTATION)

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

/** Prim settings need no runtime camera permission and affect subsequent sits. */
export const llSetCameraEyeOffset: BuiltinImpl = (ctx, args) => {
  ctx.prim.cameraEyeOffset = { ...(args[0] as Vector) }
  return undefined
}

export const llSetCameraAtOffset: BuiltinImpl = (ctx, args) => {
  ctx.prim.cameraAtOffset = { ...(args[0] as Vector) }
  return undefined
}

export const llForceMouselook: BuiltinImpl = (ctx, args) => {
  ctx.prim.forceMouselook = (args[0] as number) !== 0
  return undefined
}

export const llSetLinkCamera: BuiltinImpl = (ctx, args) => {
  const link = args[0] as number
  const root = ctx.linkset.prims[0]!
  const occupiedLoneRoot = ctx.linkset.prims.length === 1 &&
    ctx.linkset.world?.avatars.some(a => a.sittingOn === root)
  // In-world: every negative selector except LINK_THIS picks the first other
  // prim, even LINK_SET / LINK_ALL_CHILDREN and unknown negative values.
  const target = link === LINK_THIS ? ctx.prim
    : link < 0 ? ctx.linkset.prims.find(p => p !== ctx.prim)
    : link === 0 && occupiedLoneRoot ? undefined
    : link === 0 && ctx.prim !== root ? root
    : link === LINK_ROOT && occupiedLoneRoot ? root
    : ctx.linkset.prims.find(p => p.linkNumber === link)
  if (target) {
    target.cameraEyeOffset = { ...(args[1] as Vector) }
    target.cameraAtOffset = { ...(args[2] as Vector) }
  }
  return undefined
}
