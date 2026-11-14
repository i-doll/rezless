import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { LslValue, Vector, Rotation } from '../values/types.js'
import { isVector, rot, vec } from '../values/types.js'
import { rotateVector } from '../values/ops.js'

/** llAbs(integer val) — absolute value (integer). */
export const llAbs: BuiltinImpl = (_ctx, args) => {
  return Math.abs((args[0] as number | undefined) ?? 0) | 0
}

/** llFabs(float val) — absolute value (float). */
export const llFabs: BuiltinImpl = (_ctx, args) => {
  // As Mono 2.x (and SLua): -0.0 is not below zero, so it keeps its sign.
  const x = (args[0] as number | undefined) ?? 0
  return x < 0 ? -x : x
}

/** C's `result == -0.0`, which is true for either zero: both become +0. */
const unsignedZero = (n: number): number => (n === 0 ? 0 : n)

/** Doubles beyond this are all even integers (SLua's LARGEST_INT_DOUBLE). */
const LARGEST_INT_DOUBLE = 2 ** 53 - 1

/** Second Life gives -2147483648 for a rounded result outside int32, NaN and infinity. */
const toIntOrMin = (n: number): number =>
  n >= -2147483648 && n <= 2147483647 ? n | 0 : -2147483648

/**
 * llRound(float val) — floor(val + 0.5), so halves round up. The sum is in
 * single precision: 0.49999997 rounds to 1 and 16777215.0 to 16777216.
 */
export const llRound: BuiltinImpl = (_ctx, args) =>
  toIntOrMin(Math.floor(Math.fround(Math.fround((args[0] as number | undefined) ?? 0) + 0.5)))

export const llCeil: BuiltinImpl = (_ctx, args) =>
  toIntOrMin(Math.ceil((args[0] as number | undefined) ?? 0))
export const llFloor: BuiltinImpl = (_ctx, args) =>
  toIntOrMin(Math.floor((args[0] as number | undefined) ?? 0))

/** llPow, with the Mono 2.x limit cases SLua reproduces. */
export const llPow: BuiltinImpl = (_ctx, args) => {
  const x = (args[0] as number) ?? 0
  const y = (args[1] as number) ?? 0
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN
  if ((x === 1 || x === -1) && !Number.isFinite(y)) return NaN
  if (x < -LARGEST_INT_DOUBLE) {
    if (y > LARGEST_INT_DOUBLE) return Infinity
    if (y < -LARGEST_INT_DOUBLE) return 0
  }
  // C's pow(-1, y) is NaN for huge y in some libms, which SLua maps to 1;
  // JavaScript already gives 1, as every double that large is even.
  return unsignedZero(Math.pow(x, y))
}
export const llSqrt: BuiltinImpl = (_ctx, args) => Math.sqrt((args[0] as number) ?? 0)
/** Mono gives 0.0 for the sine and tangent of -0.0. SLua keeps the sign. */
const monoZero = (ctx: CallContext, n: number) => (ctx.script.language === 'lsl' ? unsignedZero(n) : n)
export const llSin: BuiltinImpl = (ctx, args) => monoZero(ctx, Math.sin((args[0] as number) ?? 0))
export const llCos: BuiltinImpl = (_ctx, args) => Math.cos((args[0] as number) ?? 0)
export const llTan: BuiltinImpl = (ctx, args) => monoZero(ctx, Math.tan((args[0] as number) ?? 0))
export const llAsin: BuiltinImpl = (_ctx, args) => Math.asin((args[0] as number) ?? 0)
export const llAcos: BuiltinImpl = (_ctx, args) => Math.acos((args[0] as number) ?? 0)
/** llAtan2: both arguments infinite gives NaN, and a zero result is +0 (Mono 2.x, as SLua). */
export const llAtan2: BuiltinImpl = (_ctx, args) => {
  const y = (args[0] as number) ?? 0
  const x = (args[1] as number) ?? 0
  if (!Number.isFinite(y) && !Number.isFinite(x) && !Number.isNaN(y) && !Number.isNaN(x)) return NaN
  return unsignedZero(Math.atan2(y, x))
}
export const llLog: BuiltinImpl = (_ctx, args) => {
  const x = (args[0] as number | undefined) ?? 0
  // Anything not above zero, NaN included, gives 0.
  return x > 0 ? Math.log(x) : 0
}
export const llLog10: BuiltinImpl = (_ctx, args) => {
  const x = (args[0] as number | undefined) ?? 0
  return x > 0 ? Math.log10(x) : 0
}

/** llFrand(float mag) — seeded uniform [0, mag). Negative mag → [mag, 0). A zero result is +0. */
export const llFrand: BuiltinImpl = (ctx, args) => {
  const mag = (args[0] as number | undefined) ?? 0
  return unsignedZero(ctx.state.random.next() * mag)
}

// ---- Vector / rotation math ----

const f32 = Math.fround

const toF32Vector = (v: Vector) => vec(f32(v.x), f32(v.y), f32(v.z))

const FLOAT32_MIN_NORMAL = 2 ** -126

/** A single-precision square as SLua computes it: below the smallest normal float it is zero. */
const square = (n: number) => {
  const r = f32(n * n)
  return r < FLOAT32_MIN_NORMAL ? 0 : r
}

/**
 * The length of a vector. Mono sums the squares in double precision. SLua
 * works in single precision throughout, so a length over about 1.8e19 is
 * infinite and one under about 1.1e-19 is zero.
 */
function magnitude(ctx: CallContext, x: number, y: number, z: number) {
  if (ctx.script.language === 'lsl') return Math.sqrt(x * x + y * y + z * z)
  return f32(Math.sqrt(f32(f32(square(x) + square(y)) + square(z))))
}

export const llVecMag: BuiltinImpl = (ctx, args) => {
  const v = args[0]
  if (!v || typeof v !== 'object' || !isVector(v as Vector)) return 0
  const u = toF32Vector(v as Vector)
  return magnitude(ctx, u.x, u.y, u.z)
}

/** Second Life normalises a vector no longer than this to ZERO_VECTOR. */
const NORMALISE_THRESHOLD = Math.fround(1e-7)

/** llVecNorm(vector v) — each component times the single-precision reciprocal of the length. */
export const llVecNorm: BuiltinImpl = (ctx, args) => {
  const v = args[0]
  if (!v || typeof v !== 'object' || !isVector(v as Vector)) return { x: 0, y: 0, z: 0 }
  const u = toF32Vector(v as Vector)
  const m = f32(magnitude(ctx, u.x, u.y, u.z))
  if (!(m > NORMALISE_THRESHOLD)) return { x: 0, y: 0, z: 0 }
  const k = f32(1 / m)
  return { x: f32(u.x * k), y: f32(u.y * k), z: f32(u.z * k) }
}

export const llVecDist: BuiltinImpl = (ctx, args) => {
  const a = args[0] as Vector | undefined
  const b = args[1] as Vector | undefined
  if (!a || !b) return 0
  const p = toF32Vector(a)
  const q = toF32Vector(b)
  if (ctx.script.language === 'lsl') return magnitude(ctx, p.x - q.x, p.y - q.y, p.z - q.z)
  return magnitude(ctx, f32(p.x - q.x), f32(p.y - q.y), f32(p.z - q.z))
}

type Row = [number, number, number]

const dot3 = (a: Row, b: Row) => f32(f32(f32(a[0] * b[0]) + f32(a[1] * b[1])) + f32(a[2] * b[2]))

/** A single-precision unit vector, or zero for a length of 1e-7 or less (and for NaN). */
function unitRow(v: Row): Row {
  const length = f32(Math.sqrt(dot3(v, v)))
  if (!(length > NORMALISE_THRESHOLD)) return [0, 0, 0]
  const k = f32(1 / length)
  return [f32(v[0] * k), f32(v[1] * k), f32(v[2] * k)]
}

/** With this cosine of y or less, llRot2Euler treats the rotation as gimbal-locked. */
const GIMBAL_THRESHOLD = 0.005

const RAD_TO_DEG = 180 / Math.PI
const DEG_TO_RAD = Math.PI / 180

/**
 * Second Life rounds each angle of llRot2Euler to 1e-7 degrees in single
 * precision, so a zero is never negative, and gives 180 degrees for -180.
 */
function stepAngle(radians: number) {
  const degrees = f32(Math.abs(f32(radians)) * RAD_TO_DEG)
  const stepped = f32(Math.floor(f32(f32(degrees * 1e7) + 0.5)) / 1e7)
  const result = f32(stepped * DEG_TO_RAD)
  return radians < 0 && stepped !== 0 && stepped !== 180 ? -result : result
}

/**
 * llRot2Euler(rotation r) → vector (x, y, z) Euler angles in radians, the
 * inverse of llEuler2Rot. Second Life turns the rotation into a matrix in
 * single precision, makes its rows orthogonal and reads the angles from that,
 * so y comes from an arcsine and is coarse near ±PI/2. Within about 0.29
 * degrees of there it returns x = 0 and puts the combined turn in z.
 */
export const llRot2Euler: BuiltinImpl = (_ctx, args) => {
  const { x, y, z, s } = unitRotation(args[0])
  const xx = f32(x * x)
  const xy = f32(x * y)
  const xz = f32(x * z)
  const xs = f32(x * s)
  const yy = f32(y * y)
  const yz = f32(y * z)
  const ys = f32(y * s)
  const zz = f32(z * z)
  const zs = f32(z * s)
  const row0: Row = [f32(1 - f32(2 * f32(yy + zz))), f32(2 * f32(xy + zs)), f32(2 * f32(xz - ys))]
  const row1: Row = [f32(2 * f32(xy - zs)), f32(1 - f32(2 * f32(xx + zz))), f32(2 * f32(yz + xs))]
  const fwd = unitRow(row0)
  const along = dot3(fwd, row1)
  const left = unitRow([f32(row1[0] - f32(fwd[0] * along)), f32(row1[1] - f32(fwd[1] * along)), f32(row1[2] - f32(fwd[2] * along))])
  const up: Row = [
    f32(f32(fwd[1] * left[2]) - f32(left[1] * fwd[2])),
    f32(f32(fwd[2] * left[0]) - f32(left[2] * fwd[0])),
    f32(f32(fwd[0] * left[1]) - f32(left[0] * fwd[1])),
  ]
  const angleY = Math.asin(Math.min(1, Math.max(-1, up[0])))
  const cy = Math.cos(angleY)
  if (Math.abs(cy) > GIMBAL_THRESHOLD) {
    return vec(stepAngle(Math.atan2(-up[1] / cy, up[2] / cy)), stepAngle(angleY), stepAngle(Math.atan2(-left[0] / cy, fwd[0] / cy)))
  }
  // Gimbal lock: x and z turn about the same axis, so z carries both.
  return vec(0, stepAngle(angleY), stepAngle(Math.atan2(fwd[1], left[1])))
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

/** Second Life reads a rotation whose half-angle sine is below this as no rotation. */
const HALF_ANGLE_SINE_MIN = 0.0005

/**
 * The angle in [0, PI] and the axis of a normalised rotation, as Second Life
 * works them out in single precision: the angle is 2 * acos(s) and the axis
 * is x, y, z over sqrt(1 - s * s), which is not exactly a unit vector. A turn
 * of under about 0.001 radians gives a zero angle and a zero axis.
 */
function angleAxis(q: Rotation) {
  const cos = Math.min(1, Math.max(-1, q.s))
  const sin = f32(Math.sqrt(f32(1 - f32(cos * cos))))
  if (sin < HALF_ANGLE_SINE_MIN) return { angle: 0, axis: vec(0, 0, 0) }
  const k = f32(1 / sin)
  const angle = f32(2 * f32(Math.acos(cos)))
  const axis = vec(f32(q.x * k), f32(q.y * k), f32(q.z * k))
  if (angle <= f32(Math.PI)) return { angle, axis }
  return { angle: f32(f32(2 * Math.PI) - angle), axis: vec(-axis.x, -axis.y, -axis.z) }
}

/** llRot2Axis(rotation q) — the rotation axis, or ZERO_VECTOR for no rotation. */
export const llRot2Axis: BuiltinImpl = (_ctx, args) => angleAxis(unitRotation(args[0])).axis

/** llRot2Angle(rotation q) — the rotation angle in [0, PI]. */
export const llRot2Angle: BuiltinImpl = (_ctx, args) => angleAxis(unitRotation(args[0])).angle

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

const toF32 = (q: Rotation) => rot(f32(q.x), f32(q.y), f32(q.z), f32(q.s))

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

const unitRotation = (q: LslValue | undefined) => normalizeRotation(toF32((q as Rotation | undefined) ?? rot(0, 0, 0, 1)))

/** The dot product of two rotations, normalised, summed from the s term in single precision. */
function rotationDot(p: LslValue | undefined, q: LslValue | undefined) {
  const a = unitRotation(p)
  const b = unitRotation(q)
  return f32(f32(f32(f32(a.s * b.s) + f32(a.x * b.x)) + f32(a.y * b.y)) + f32(a.z * b.z))
}

/**
 * llAngleBetween(rotation a, rotation b) — the angle of the turn from a to b,
 * read from the dot product as llRot2Angle reads it from s. Angles under
 * about 0.002 lose most of their digits.
 */
export const llAngleBetween: BuiltinImpl = (_ctx, args) => angleAxis(rot(0, 0, 0, rotationDot(args[0], args[1]))).angle

/** The angle a rotation target is compared by: as llAngleBetween, but small angles are not read as zero. */
export function rotTargetAngle(a: Rotation, b: Rotation) {
  const angle = f32(2 * f32(Math.acos(Math.min(1, Math.max(-1, rotationDot(a, b))))))
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
