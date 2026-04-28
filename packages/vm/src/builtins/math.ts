import type { BuiltinImpl } from '../runtime.js'
import type { Vector, Rotation } from '../values/types.js'
import { isVector } from '../values/types.js'

/** llAbs(integer val) — absolute value (integer). */
export const llAbs: BuiltinImpl = (_ctx, args) => {
  return Math.abs((args[0] as number | undefined) ?? 0) | 0
}

/** llFabs(float val) — absolute value (float). */
export const llFabs: BuiltinImpl = (_ctx, args) => {
  return Math.abs((args[0] as number | undefined) ?? 0)
}

/** llRound(float val) — banker's rounding per LSL (round-half-to-even). */
export const llRound: BuiltinImpl = (_ctx, args) => {
  const x = (args[0] as number | undefined) ?? 0
  const floor = Math.floor(x)
  const diff = x - floor
  if (diff < 0.5) return floor | 0
  if (diff > 0.5) return (floor + 1) | 0
  // exact half — round to even
  return ((floor % 2 === 0 ? floor : floor + 1) | 0)
}

export const llCeil: BuiltinImpl = (_ctx, args) =>
  Math.ceil((args[0] as number | undefined) ?? 0) | 0
export const llFloor: BuiltinImpl = (_ctx, args) =>
  Math.floor((args[0] as number | undefined) ?? 0) | 0

export const llPow: BuiltinImpl = (_ctx, args) =>
  Math.pow((args[0] as number) ?? 0, (args[1] as number) ?? 0)
export const llSqrt: BuiltinImpl = (_ctx, args) => Math.sqrt((args[0] as number) ?? 0)
export const llSin: BuiltinImpl = (_ctx, args) => Math.sin((args[0] as number) ?? 0)
export const llCos: BuiltinImpl = (_ctx, args) => Math.cos((args[0] as number) ?? 0)
export const llTan: BuiltinImpl = (_ctx, args) => Math.tan((args[0] as number) ?? 0)
export const llAsin: BuiltinImpl = (_ctx, args) => Math.asin((args[0] as number) ?? 0)
export const llAcos: BuiltinImpl = (_ctx, args) => Math.acos((args[0] as number) ?? 0)
export const llAtan2: BuiltinImpl = (_ctx, args) =>
  Math.atan2((args[0] as number) ?? 0, (args[1] as number) ?? 0)
export const llLog: BuiltinImpl = (_ctx, args) => Math.log((args[0] as number) ?? 0)
export const llLog10: BuiltinImpl = (_ctx, args) => Math.log10((args[0] as number) ?? 0)

/** llFrand(float mag) — seeded uniform [0, mag). Negative mag → [mag, 0). */
export const llFrand: BuiltinImpl = (ctx, args) => {
  const mag = (args[0] as number | undefined) ?? 0
  return ctx.state.random.next() * mag
}

// ---- Vector / rotation math ----

export const llVecMag: BuiltinImpl = (_ctx, args) => {
  const v = args[0]
  if (!v || typeof v !== 'object' || !isVector(v as Vector)) return 0
  const u = v as Vector
  return Math.sqrt(u.x * u.x + u.y * u.y + u.z * u.z)
}

export const llVecNorm: BuiltinImpl = (_ctx, args) => {
  const v = args[0]
  if (!v || typeof v !== 'object' || !isVector(v as Vector)) return { x: 0, y: 0, z: 0 }
  const u = v as Vector
  const m = Math.sqrt(u.x * u.x + u.y * u.y + u.z * u.z)
  if (m === 0) return { x: 0, y: 0, z: 0 }
  return { x: u.x / m, y: u.y / m, z: u.z / m }
}

export const llVecDist: BuiltinImpl = (_ctx, args) => {
  const a = args[0] as Vector | undefined
  const b = args[1] as Vector | undefined
  if (!a || !b) return 0
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * llRot2Euler(rotation r) → vector (x, y, z) Euler angles in radians.
 * Uses the LSL convention (extrinsic XYZ, ZYX intrinsic equivalent).
 */
export const llRot2Euler: BuiltinImpl = (_ctx, args) => {
  const q = args[0] as Rotation | undefined
  if (!q) return { x: 0, y: 0, z: 0 }
  // Standard quaternion → Euler (ZYX) conversion.
  const sinr_cosp = 2 * (q.s * q.x + q.y * q.z)
  const cosr_cosp = 1 - 2 * (q.x * q.x + q.y * q.y)
  const x = Math.atan2(sinr_cosp, cosr_cosp)
  const sinp = 2 * (q.s * q.y - q.z * q.x)
  const y = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp)
  const siny_cosp = 2 * (q.s * q.z + q.x * q.y)
  const cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z)
  const z = Math.atan2(siny_cosp, cosy_cosp)
  return { x, y, z }
}

/** llEuler2Rot(vector v) → rotation. Inverse of llRot2Euler. */
export const llEuler2Rot: BuiltinImpl = (_ctx, args) => {
  const v = args[0] as Vector | undefined
  if (!v) return { x: 0, y: 0, z: 0, s: 1 }
  const cy = Math.cos(v.z * 0.5)
  const sy = Math.sin(v.z * 0.5)
  const cp = Math.cos(v.y * 0.5)
  const sp = Math.sin(v.y * 0.5)
  const cr = Math.cos(v.x * 0.5)
  const sr = Math.sin(v.x * 0.5)
  return {
    x: sr * cp * cy - cr * sp * sy,
    y: cr * sp * cy + sr * cp * sy,
    z: cr * cp * sy - sr * sp * cy,
    s: cr * cp * cy + sr * sp * sy,
  }
}
