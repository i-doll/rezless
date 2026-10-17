/**
 * LSL value types as represented at runtime.
 *
 * LSL has 7 value types: integer, float, string, key, vector, rotation, list.
 * Internally we use raw JS values (number / string / Vector / Rotation / array)
 * and carry the LSL type tag alongside in `EvalResult`. Tagging the type
 * separately keeps the public boundary (call log, ll* builtin args) simple
 * while still letting arithmetic and coercion know whether a number is an
 * integer or a float.
 */

export type LslType =
  | 'integer'
  | 'float'
  | 'string'
  | 'key'
  | 'vector'
  | 'rotation'
  | 'list'
  | 'void'

export interface Vector {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface Rotation {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly s: number
}

export type LslValue =
  | number
  | string
  | Vector
  | Rotation
  | ReadonlyArray<LslValue>

export interface EvalResult {
  readonly value: LslValue
  readonly type: LslType
}

export const ZERO_VECTOR: Vector = Object.freeze({ x: 0, y: 0, z: 0 })
export const ZERO_ROTATION: Rotation = Object.freeze({ x: 0, y: 0, z: 0, s: 1 })
export const NULL_KEY = '00000000-0000-0000-0000-000000000000'

export function defaultValueFor(type: LslType): LslValue | undefined {
  switch (type) {
    case 'integer':
      return 0
    case 'float':
      return 0
    case 'string':
      return ''
    case 'key':
      return NULL_KEY
    case 'vector':
      return ZERO_VECTOR
    case 'rotation':
      return ZERO_ROTATION
    case 'list':
      return []
    case 'void':
      return undefined
  }
}

export function defaultEvalFor(type: LslType): EvalResult {
  return { value: defaultValueFor(type) ?? 0, type }
}

/** Truncate a JS number to LSL's 32-bit signed integer semantics. */
export function toInt32(n: number): number {
  // `| 0` does ToInt32; clamp NaN/Infinity to 0 first to mirror LSL's behaviour.
  if (!Number.isFinite(n)) return 0
  return n | 0
}

export function isVector(v: LslValue): v is Vector {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    'x' in v &&
    'y' in v &&
    'z' in v &&
    !('s' in v)
  )
}

export function isRotation(v: LslValue): v is Rotation {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    'x' in v &&
    'y' in v &&
    'z' in v &&
    's' in v
  )
}

/** Round a JS number to LSL's 32-bit float. */
export const toFloat32 = Math.fround

export function vec(x: number, y: number, z: number): Vector {
  return Object.freeze({ x: toFloat32(x), y: toFloat32(y), z: toFloat32(z) })
}

export function rot(x: number, y: number, z: number, s: number): Rotation {
  return Object.freeze({ x: toFloat32(x), y: toFloat32(y), z: toFloat32(z), s: toFloat32(s) })
}
