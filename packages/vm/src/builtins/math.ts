import type { BuiltinImpl } from '../runtime.js'
import type { LslValue, Vector, Rotation } from '../values/types.js'
import { isVector, rot, vec } from '../values/types.js'
import { rotateVector } from '../values/ops.js'

/** llAbs(integer val) — absolute value (integer). */
export const llAbs: BuiltinImpl = (_ctx, args) => {
  return Math.abs((args[0] as number | undefined) ?? 0) | 0
}

/** llFabs(float val) — absolute value (float). */
export const llFabs: BuiltinImpl = (_ctx, args) => {
  return Math.abs((args[0] as number | undefined) ?? 0)
}

/** Second Life gives -2147483648 for a rounded result outside int32, NaN and infinity. */
const toIntOrMin = (n: number): number =>
  n >= -2147483648 && n <= 2147483647 ? n | 0 : -2147483648

/** llRound(float val) — floor(val + 0.5), so halves round up. */
export const llRound: BuiltinImpl = (_ctx, args) =>
  toIntOrMin(Math.floor(((args[0] as number | undefined) ?? 0) + 0.5))

export const llCeil: BuiltinImpl = (_ctx, args) =>
  toIntOrMin(Math.ceil((args[0] as number | undefined) ?? 0))
export const llFloor: BuiltinImpl = (_ctx, args) =>
  toIntOrMin(Math.floor((args[0] as number | undefined) ?? 0))

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
export const llLog: BuiltinImpl = (_ctx, args) => {
  const x = (args[0] as number | undefined) ?? 0
  return x <= 0 ? 0 : Math.log(x)
}
export const llLog10: BuiltinImpl = (_ctx, args) => {
  const x = (args[0] as number | undefined) ?? 0
  return x <= 0 ? 0 : Math.log10(x)
}

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

/** Below this cos(y), llRot2Euler treats the rotation as gimbal-locked. */
const GIMBAL_THRESHOLD = 0.000436

/**
 * llRot2Euler(rotation r) → vector (x, y, z) Euler angles in radians, the
 * inverse of llEuler2Rot. At y = ±PI/2 it returns x = 0 and puts the
 * combined turn in z, as Second Life does.
 */
export const llRot2Euler: BuiltinImpl = (_ctx, args) => {
  const r = args[0] as Rotation
  const m = Math.hypot(r.x, r.y, r.z, r.s)
  if (m === 0) return vec(0, 0, 0)
  const q = { x: r.x / m, y: r.y / m, z: r.z / m, s: r.s / m }
  const sx = 2 * (q.x * q.s - q.y * q.z)
  const sy = 2 * (q.y * q.s + q.x * q.z)
  const ys = q.s * q.s - q.y * q.y
  const xz = q.x * q.x - q.z * q.z
  const cx = ys - xz
  const cy = Math.sqrt(sx * sx + cx * cx)
  if (cy > GIMBAL_THRESHOLD) {
    return vec(Math.atan2(sx, cx), Math.atan2(sy, cy), Math.atan2(2 * (q.z * q.s - q.x * q.y), ys + xz))
  }
  // Gimbal lock: x and z turn about the same axis, so z carries both.
  if (sy > 0) return vec(0, Math.PI / 2, 2 * Math.atan2(q.z + q.x, q.s + q.y))
  return vec(0, -Math.PI / 2, 2 * Math.atan2(q.z - q.x, q.s - q.y))
}

/**
 * llEuler2Rot(vector v) → rotation. Measured in Second Life:
 * llEuler2Rot(<0.1, 0.2, 0.3>) turns the x axis to <0.93629, 0.31299, -0.15935>.
 */
export const llEuler2Rot: BuiltinImpl = (_ctx, args) => {
  const v = args[0] as Vector | undefined
  if (!v) return { x: 0, y: 0, z: 0, s: 1 }
  const cz = halfAngleTerm(Math.cos, v.z)
  const sz = halfAngleTerm(Math.sin, v.z)
  const cy = halfAngleTerm(Math.cos, v.y)
  const sy = halfAngleTerm(Math.sin, v.y)
  const cx = halfAngleTerm(Math.cos, v.x)
  const sx = halfAngleTerm(Math.sin, v.x)
  const q = rot(
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  )
  // Second Life goes through a rotation matrix, which makes s positive, or
  // when |s| <= 0.5 the largest of x, y, z (the first on a tie), and never
  // gives a negative zero.
  const xx = q.x * q.x
  const yy = q.y * q.y
  const zz = q.z * q.z
  let sign = q.s
  if (3 - 4 * (xx + yy + zz) <= 0) sign = zz > Math.max(xx, yy) ? q.z : yy > xx ? q.y : q.x
  return sign < 0 ? rot(0 - q.x, 0 - q.y, 0 - q.z, 0 - q.s) : rot(q.x + 0, q.y + 0, q.z + 0, q.s + 0)
}

/** Second Life clears half-angle sines and cosines below this, so a turn by PI has exact zeros. */
const HALF_ANGLE_ZERO = 0.00001

function halfAngleTerm(fn: (a: number) => number, angle: number): number {
  const v = fn(angle * 0.5)
  return Math.abs(v) < HALF_ANGLE_ZERO ? 0 : v
}

function rotationAxis(q: Rotation, axis: Vector): Vector {
  const m = Math.hypot(q.x, q.y, q.z, q.s)
  if (m === 0) return vec(axis.x, axis.y, axis.z)
  return rotateVector(axis, rot(q.x / m, q.y / m, q.z / m, q.s / m))
}

/** llRot2Fwd(rotation q) — the x axis rotated by q, normalised. */
export const llRot2Fwd: BuiltinImpl = (_ctx, args) => rotationAxis(args[0] as Rotation, { x: 1, y: 0, z: 0 })

/** llRot2Left(rotation q) — the y axis rotated by q, normalised. */
export const llRot2Left: BuiltinImpl = (_ctx, args) => rotationAxis(args[0] as Rotation, { x: 0, y: 1, z: 0 })

/** llRot2Up(rotation q) — the z axis rotated by q, normalised. */
export const llRot2Up: BuiltinImpl = (_ctx, args) => rotationAxis(args[0] as Rotation, { x: 0, y: 0, z: 1 })

/** q, or -q when its s is negative, so the angle comes out in [0, PI]. */
function positiveS(q: Rotation): Rotation {
  return q.s < 0 ? { x: 0 - q.x, y: 0 - q.y, z: 0 - q.z, s: 0 - q.s } : q
}

/** llRot2Axis(rotation q) — the unit rotation axis, or ZERO_VECTOR for no rotation. */
export const llRot2Axis: BuiltinImpl = (_ctx, args) => {
  const q = positiveS((args[0] as Rotation | undefined) ?? { x: 0, y: 0, z: 0, s: 1 })
  const m = Math.hypot(q.x, q.y, q.z)
  if (m === 0) return vec(0, 0, 0)
  return vec(q.x / m, q.y / m, q.z / m)
}

/** llRot2Angle(rotation q) — the rotation angle in [0, PI]. */
export const llRot2Angle: BuiltinImpl = (_ctx, args) => {
  const q = positiveS((args[0] as Rotation | undefined) ?? { x: 0, y: 0, z: 0, s: 1 })
  return Math.fround(2 * Math.atan2(Math.hypot(q.x, q.y, q.z), q.s))
}

/** llAxisAngle2Rot(vector axis, float angle) — the axis is normalised; a zero axis gives ZERO_ROTATION. */
export const llAxisAngle2Rot: BuiltinImpl = (_ctx, args) => {
  const axis = (args[0] as Vector | undefined) ?? { x: 0, y: 0, z: 0 }
  const angle = (args[1] as number | undefined) ?? 0
  const m = Math.hypot(axis.x, axis.y, axis.z)
  if (m === 0) return rot(0, 0, 0, 1)
  const k = Math.sin(angle / 2) / m
  return rot(axis.x * k, axis.y * k, axis.z * k, Math.cos(angle / 2))
}

/**
 * llRotBetween(vector a, vector b) — the shortest rotation taking a's
 * direction to b's. Opposite vectors turn half a circle about the x axis
 * with its component along a removed, or about z when a lies along x.
 * Zero vectors and equal directions give ZERO_ROTATION.
 */
export const llRotBetween: BuiltinImpl = (_ctx, args) => {
  const a = (args[0] as Vector | undefined) ?? { x: 0, y: 0, z: 0 }
  const b = (args[1] as Vector | undefined) ?? { x: 0, y: 0, z: 0 }
  const ab = a.x * b.x + a.y * b.y + a.z * b.z
  const c = { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }
  const cc = c.x * c.x + c.y * c.y + c.z * c.z
  if (cc > 0) {
    const s = Math.sqrt(ab * ab + cc) + ab
    const m = Math.sqrt(cc + s * s)
    return rot(c.x / m, c.y / m, c.z / m, s / m)
  }
  if (ab >= 0) return rot(0, 0, 0, 1)
  const aa = a.x * a.x + a.y * a.y + a.z * a.z
  const ref = a.y === 0 && a.z === 0 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 }
  const k = (ref.x * a.x + ref.y * a.y + ref.z * a.z) / aa
  const u = { x: ref.x - k * a.x, y: ref.y - k * a.y, z: ref.z - k * a.z }
  const m = Math.hypot(u.x, u.y, u.z)
  return rot(u.x / m, u.y / m, u.z / m, 0)
}

const f32 = Math.fround

/**
 * Second Life's quaternion normalise, in single precision: it leaves a
 * rotation within 1e-6 of unit length as it is, and turns a near-zero or NaN
 * one into ZERO_ROTATION.
 */
function normalizeRotation(q: Rotation): Rotation {
  const m = f32(Math.sqrt(f32(f32(f32(f32(q.x * q.x) + f32(q.y * q.y)) + f32(q.z * q.z)) + f32(q.s * q.s))))
  if (!(m > f32(1e-7))) return rot(0, 0, 0, 1)
  if (Math.abs(f32(1 - m)) <= 1e-6) return q
  const k = f32(1 / m)
  return rot(f32(q.x * k), f32(q.y * k), f32(q.z * k), f32(q.s * k))
}

/**
 * llAngleBetween(rotation a, rotation b) — the angle in [0, PI] of the turn
 * from a to b: 2 * acos of the dot product, folded back below PI, all in
 * single precision. Angles under about 0.002 lose most of their digits.
 */
export const llAngleBetween: BuiltinImpl = (_ctx, args) => {
  const toF32 = (q: Rotation) => rot(f32(q.x), f32(q.y), f32(q.z), f32(q.s))
  const a = normalizeRotation(toF32((args[0] as Rotation | undefined) ?? rot(0, 0, 0, 1)))
  const b = normalizeRotation(toF32((args[1] as Rotation | undefined) ?? rot(0, 0, 0, 1)))
  const dot = f32(f32(f32(f32(a.x * b.x) + f32(a.y * b.y)) + f32(a.z * b.z)) + f32(a.s * b.s))
  const angle = f32(2 * f32(Math.acos(Math.min(1, Math.max(-1, dot)))))
  return angle > f32(Math.PI) ? f32(f32(2 * Math.PI) - angle) : angle
}

/**
 * llAxes2Rot(vector fwd, vector left, vector up) — converts the matrix whose
 * rows are the three axes, as Second Life does. With a positive trace the
 * result isn't normalised, so scaled or skewed axes give a non-unit rotation.
 */
export const llAxes2Rot: BuiltinImpl = (_ctx, args) => {
  const row = (v: LslValue | undefined) => {
    const u = (v as Vector | undefined) ?? vec(0, 0, 0)
    return [u.x, u.y, u.z]
  }
  const m = [row(args[0]), row(args[1]), row(args[2])]
  const tr = m[0]![0]! + m[1]![1]! + m[2]![2]!
  if (tr > 0) {
    const s = Math.sqrt(tr + 1)
    const k = 0.5 / s
    return rot((m[1]![2]! - m[2]![1]!) * k, (m[2]![0]! - m[0]![2]!) * k, (m[0]![1]! - m[1]![0]!) * k, s / 2)
  }
  let i = 0
  if (m[1]![1]! > m[0]![0]!) i = 1
  if (m[2]![2]! > m[i]![i]!) i = 2
  const j = (i + 1) % 3
  const k = (j + 1) % 3
  const q = [0, 0, 0, 0]
  let s = Math.sqrt(m[i]![i]! - (m[j]![j]! + m[k]![k]!) + 1)
  q[i] = s * 0.5
  if (s !== 0) s = 0.5 / s
  q[3] = (m[j]![k]! - m[k]![j]!) * s
  q[j] = (m[i]![j]! + m[j]![i]!) * s
  q[k] = (m[i]![k]! + m[k]![i]!) * s
  return normalizeRotation(rot(q[0]!, q[1]!, q[2]!, q[3]!))
}

const mapColour = (v: LslValue | undefined, fn: (c: number) => number): Vector => {
  const c = (v as Vector | undefined) ?? vec(0, 0, 0)
  return vec(fn(f32(c.x)), fn(f32(c.y)), fn(f32(c.z)))
}

/** llLinear2sRGB(vector color) — the sRGB transfer curve per channel in single precision, without clamping. */
export const llLinear2sRGB: BuiltinImpl = (_ctx, args) =>
  mapColour(args[0], (c) =>
    c <= f32(0.0031308)
      ? f32(c * f32(12.92))
      : f32(f32(f32(1.055) * f32(Math.pow(c, f32(f32(1) / f32(2.4))))) - f32(0.055)),
  )

/** llsRGB2Linear(vector color) — the inverse sRGB transfer curve per channel in single precision, without clamping. */
export const llsRGB2Linear: BuiltinImpl = (_ctx, args) =>
  mapColour(args[0], (c) =>
    c <= f32(0.04045)
      ? f32(c / f32(12.92))
      : f32(Math.pow(f32(f32(c + f32(0.055)) / f32(1.055)), f32(2.4))),
  )

/** llModPow(base, exponent, modulus) — operands are read as unsigned 32-bit. */
export const llModPow: BuiltinImpl = (_ctx, args) => {
  const u = (i: number) => BigInt(((args[i] as number | undefined) ?? 0) >>> 0)
  const m = u(2)
  if (m === 0n || u(0) === 0n) return 0
  let result = 1n % m
  let base = u(0) % m
  let exp = u(1)
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % m
    base = (base * base) % m
    exp >>= 1n
  }
  return Number(result) | 0
}
