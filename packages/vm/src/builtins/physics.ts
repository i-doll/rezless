import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { LslValue, Vector } from '../values/types.js'
import { llGetVel as initialVelocity, llGetForce as rezForce } from './rez.js'

export type PhysicsRequestName =
  | 'llApplyImpulse' | 'llApplyRotationalImpulse' | 'llSetForce' | 'llSetTorque'
  | 'llSetForceAndTorque' | 'llSetVelocity' | 'llSetAngularVelocity' | 'llPushObject'

/** Calls as requested, including calls that cannot move a nonphysical object. */
export interface PhysicsRequest {
  name: PhysicsRequestName
  args: readonly LslValue[]
}

/** Test-controlled answers. No force integration, mass calculation or energy clock. */
export interface PhysicsState {
  requests: PhysicsRequest[]
  /** null preserves the initial REZ_ACCEL force read. */
  force: Vector | null
  torque: Vector
  /** null preserves initial rez and world sensor velocity. */
  velocity: Vector | null
  acceleration: Vector
  omega: Vector
  /** Default fixture is a 0.5 m box, in lindograms. */
  mass: number
  /** Kilograms, independently configurable for a test fixture. */
  massMKS: number
  /** Region coordinates; null reads the current root position. */
  centerOfMass: Vector | null
  energy: number
}

function capture(name: PhysicsRequestName): BuiltinImpl {
  return (ctx, args) => {
    ctx.prim.physics.requests.push({ name, args: structuredClone(args) })
    return undefined
  }
}

export const llApplyImpulse = capture('llApplyImpulse')
export const llApplyRotationalImpulse = capture('llApplyRotationalImpulse')
export const llSetForce = capture('llSetForce')
export const llSetTorque = capture('llSetTorque')
export const llSetForceAndTorque = capture('llSetForceAndTorque')
export const llSetVelocity = capture('llSetVelocity')
export const llSetAngularVelocity = capture('llSetAngularVelocity')
export const llPushObject = capture('llPushObject')

const root = (ctx: CallContext) => ctx.linkset.prims[0]!
export const llGetForce: BuiltinImpl = (ctx, args) => ({ ...root(ctx).physics.force ?? rezForce(ctx, args) as Vector })
export const llGetTorque: BuiltinImpl = ctx => ({ ...root(ctx).physics.torque })
export const llGetVel: BuiltinImpl = (ctx, args) => ({ ...root(ctx).physics.velocity ?? initialVelocity(ctx, args) as Vector })
export const llGetAccel: BuiltinImpl = ctx => ({ ...root(ctx).physics.acceleration })
export const llGetOmega: BuiltinImpl = ctx => ({ ...root(ctx).physics.omega })
export const llGetMass: BuiltinImpl = ctx => root(ctx).physics.mass
export const llGetMassMKS: BuiltinImpl = ctx => root(ctx).physics.massMKS
export const llGetCenterOfMass: BuiltinImpl = ctx => ({ ...root(ctx).physics.centerOfMass ?? root(ctx).regionPosition() })
export const llGetEnergy: BuiltinImpl = ctx => root(ctx).physics.energy
