import type { LslType, LslValue, Vector, Rotation } from './types.js'
import { isVector, isRotation } from './types.js'
import { listElementType } from './list-types.js'

/**
 * Format a float the way LSL prints it, porting Mono's NumberFormatter (as
 * SLua does in VM/src/mono_floats.cpp): the float32 value is rounded half-up
 * to 7 significant digits, then half-up again to `decimals` places, e.g.
 *   (string)1.5          → "1.500000"
 *   (string)123456789.0  → "123456800.000000"
 *   (string)0.0000005    → "0.000001"
 *   (string)1e30         → "1000000000000000000000000000000.000000"
 * Only an exact -0.0 prints as "-0.000000", and not when `negZero` is false,
 * as in llDumpList2String.
 */
export function formatFloat(n: number, decimals = 6, negZero = true): string {
  if (Number.isNaN(n)) return 'NaN'
  if (!Number.isFinite(n)) return n > 0 ? 'Infinity' : '-Infinity'
  const negative = n < 0 || Object.is(n, -0)
  let digits = ''
  let point = 1
  if (n !== 0) {
    // 17 significant digits, then round half-up to 7.
    const [mantissa, exp] = Math.abs(n).toExponential(16).split('e') as [string, string]
    const all = mantissa.replace('.', '')
    point = Number(exp) + 1
    digits = all.slice(0, 7)
    if (all[7]! >= '5') {
      digits = addOne(digits)
      if (digits.length > 7) {
        digits = digits.slice(0, 7)
        point++
      }
    }
    digits = digits.replace(/0+$/, '')
    // Round half-up to `decimals` places.
    const drop = digits.length - point - decimals
    if (drop > digits.length) digits = ''
    else if (drop > 0) {
      // The value is 0.<digits> × 10^point; keep the leading digits and
      // round on the first one dropped.
      const keep = digits.slice(0, digits.length - drop)
      if (digits[keep.length]! >= '5') {
        const rounded = addOne(keep)
        point += rounded.length - keep.length
        digits = rounded
      } else digits = keep
      digits = digits.replace(/0+$/, '')
    }
    if (digits === '') point = 1
  }
  // In-world, a negative value that prints as zero loses its sign unless it is
  // exactly -0.0 (SLua keeps it; quirks.test.ts records the measurements).
  const sign = negative && (digits !== '' || (negZero && Object.is(n, -0))) ? '-' : ''
  const intPart = point <= 0 ? '0' : (digits.slice(0, point).padEnd(point, '0') || '0')
  const frac = (point < 0 ? '0'.repeat(-point) + digits : digits.slice(Math.max(point, 0)))
    .padEnd(decimals, '0')
    .slice(0, decimals)
  return decimals > 0 ? `${sign}${intPart}.${frac}` : `${sign}${intPart}`
}

/** Add one to a string of decimal digits. */
function addOne(digits: string): string {
  if (digits === '') return '1'
  return (BigInt(digits) + 1n).toString().padStart(digits.length, '0')
}

const bits = new DataView(new ArrayBuffer(8))

/**
 * Format a float like C `%f`, as llList2CSV and llList2Json print it: the
 * exact value, rounded half to even at `decimals` places, e.g. 1e30 →
 * "1000000015047466219876688855040.000000" and 0.0078125 → "0.007812".
 * A -0.0 keeps its sign. In-world a NaN prints as "nan" or "-nan" by its
 * sign bit, which the VM's floats do not carry, so every NaN prints as "nan".
 */
export function formatFloatExact(n: number, decimals = 6): string {
  if (Number.isNaN(n)) return 'nan'
  if (!Number.isFinite(n)) return n > 0 ? 'inf' : '-inf'
  bits.setFloat64(0, Math.abs(n))
  const raw = bits.getBigUint64(0)
  const exponent = Number(raw >> 52n)
  const fraction = raw & ((1n << 52n) - 1n)
  // |n| = mantissa × 2^power
  const mantissa = exponent === 0 ? fraction : fraction | (1n << 52n)
  const power = Math.max(exponent, 1) - 1075
  const scaled = mantissa * 10n ** BigInt(decimals)
  let whole: bigint
  if (power >= 0) whole = scaled << BigInt(power)
  else {
    const divisor = 1n << BigInt(-power)
    whole = scaled / divisor
    const twice = (scaled % divisor) * 2n
    if (twice > divisor || (twice === divisor && (whole & 1n) === 1n)) whole++
  }
  const digits = whole.toString().padStart(decimals + 1, '0')
  const sign = n < 0 || Object.is(n, -0) ? '-' : ''
  const int = digits.slice(0, digits.length - decimals)
  return decimals > 0 ? `${sign}${int}.${digits.slice(-decimals)}` : `${sign}${int}`
}

type FloatFormat = (n: number, decimals: number) => string

/** As `formatFloat`, but a value that prints as zero never has a sign. */
export function formatFloatPositiveZero(n: number, decimals = 6): string {
  return formatFloat(n, decimals, false)
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
export function formatListElement(
  v: LslValue,
  type?: LslType,
  fmt: FloatFormat = formatFloat,
): string {
  if (typeof v === 'number') return type !== 'float' && Number.isInteger(v) ? String(v | 0) : fmt(v, 6)
  if (typeof v === 'string') return v
  if (isVector(v)) return formatVector(v, 6, fmt)
  if (isRotation(v)) return formatRotation(v, 6, fmt)
  if (Array.isArray(v)) return formatList(v)
  return String(v)
}

export function formatList(list: ReadonlyArray<LslValue>): string {
  return list.map((v, i) => formatListElement(v, listElementType(list, i))).join('')
}
