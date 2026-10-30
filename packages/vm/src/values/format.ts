import type { LslType, LslValue, Vector, Rotation } from './types.js'
import { isVector, isRotation } from './types.js'
import { listElementType } from './list-types.js'

/**
 * Format a float the way LSL prints it: rounded to 7 significant digits,
 * then written in fixed notation with `decimals` places, e.g.
 *   (string)1.5          → "1.500000"
 *   (string)123456789.0  → "123456800.000000"
 *   (string)1e30         → "1000000000000000000000000000000.000000"
 */
export function formatFloat(n: number, decimals = 6): string {
  if (Number.isNaN(n)) return 'NaN'
  if (!Number.isFinite(n)) return n > 0 ? 'Infinity' : '-Infinity'
  if (Object.is(n, -0)) return `-${(0).toFixed(decimals)}`
  const [mantissa, exp] = n.toExponential(6).split('e') as [string, string]
  if (Number(exp) < 21) return Number(n.toPrecision(7)).toFixed(decimals)
  const digits = mantissa.replace('.', '')
  return `${digits}${'0'.repeat(Number(exp) - 6)}.${'0'.repeat(decimals)}`
}

/**
 * Format a float like C `%f`: the exact digits of the 32-bit value, as
 * llList2CSV and llList2Json print it, e.g. 1e30 →
 * "1000000015047466219876688855040.000000".
 */
export function formatFloatExact(n: number, decimals = 6): string {
  if (Number.isNaN(n)) return 'nan'
  if (!Number.isFinite(n)) return n > 0 ? 'inf' : '-inf'
  if (Math.abs(n) < 1e21) return n.toFixed(decimals)
  return `${BigInt(n)}.${'0'.repeat(decimals)}`
}

type FloatFormat = (n: number, decimals: number) => string

/** A scalar float at 6 decimals: only an exact -0.0 keeps its sign when it prints as zero. */
export function formatFloat6(n: number, fmt: FloatFormat = formatFloat): string {
  const s = fmt(n, 6)
  return s === '-0.000000' && !Object.is(n, -0) ? '0.000000' : s
}

export function formatVector(v: Vector, decimals = 5, fmt: FloatFormat = formatFloat): string {
  return `<${fmt(v.x, decimals)}, ${fmt(v.y, decimals)}, ${fmt(v.z, decimals)}>`
}

export function formatRotation(r: Rotation, decimals = 5, fmt: FloatFormat = formatFloat): string {
  return `<${fmt(r.x, decimals)}, ${fmt(r.y, decimals)}, ${fmt(r.z, decimals)}, ${fmt(r.s, decimals)}>`
}

/**
 * Format a list element the way `(string)list`, llList2String and
 * llDumpList2String do (llList2CSV passes `formatFloatExact`): vectors and
 * rotations get 6 decimals. Without a recorded type, a whole number reads as
 * an integer.
 */
export function formatListElement(v: LslValue, type?: LslType, fmt: FloatFormat = formatFloat): string {
  if (typeof v === 'number') {
    return type !== 'float' && Number.isInteger(v) ? String(v | 0) : formatFloat6(v, fmt)
  }
  if (typeof v === 'string') return v
  if (isVector(v)) return formatVector(v, 6, fmt)
  if (isRotation(v)) return formatRotation(v, 6, fmt)
  if (Array.isArray(v)) return formatList(v)
  return String(v)
}

export function formatList(list: ReadonlyArray<LslValue>): string {
  return list.map((v, i) => formatListElement(v, listElementType(list, i))).join('')
}
