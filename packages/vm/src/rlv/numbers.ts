import type { Vector } from '../values/types.js'

const whitespace = '[\\t\\n\\v\\f\\r ]*'
const decimal = '(?:[0-9]+\\.?[0-9]*|\\.[0-9]+)(?:e[+-]?[0-9]+)?'
const hexadecimal = '0x(?:[0-9a-f]+\\.?[0-9a-f]*|\\.[0-9a-f]+)(?:p[+-]?[0-9]+)?'
const floating = new RegExp('^' + whitespace + '([+-]?(?:infinity|inf|nan(?:\\([a-z0-9_]*\\))?|' + hexadecimal + '|' + decimal + '))', 'i')

/** C floating conversion prefix, retaining its consumed length for slash scanning. */
function floatPrefix(text: string): { value: number; nonzero: boolean; length: number } | undefined {
  const match = floating.exec(text)
  if (!match) return undefined
  const token = match[1]!.toLowerCase()
  let value: number
  let nonzero = false
  if (/^[+-]?nan/.test(token)) value = token.startsWith('-') ? -NaN : NaN
  else if (/^[+-]?inf/.test(token)) value = token.startsWith('-') ? -Infinity : Infinity
  else {
    const hex = /^([+-]?)0x([0-9a-f]*)(?:\.([0-9a-f]*))?(?:p([+-]?[0-9]+))?$/.exec(token)
    if (hex) {
      const digits = (hex[2] ?? '') + (hex[3] ?? '')
      nonzero = /[1-9a-f]/.test(digits)
      const significand = BigInt('0x' + (digits || '0'))
      const bits = significand.toString(2).length
      const exponent = Number(hex[4] ?? 0) - 4 * (hex[3]?.length ?? 0)
      // Round once to the double's available mantissa, including subnormals.
      const retained = Math.min(53, bits + exponent + 1074)
      if (!nonzero || retained < 0) value = 0
      else if (bits + exponent > 1024) value = Infinity
      else {
        const shift = Math.max(0, bits - retained)
        let rounded = significand >> BigInt(shift)
        if (shift) {
          const remainder = significand - (rounded << BigInt(shift))
          const half = 1n << BigInt(shift - 1)
          if (remainder > half || remainder === half && (rounded & 1n) === 1n) ++rounded
        }
        value = Number(rounded) * 2 ** (exponent + shift)
      }
      if (hex[1] === '-') value = -value
    } else {
      nonzero = /[1-9]/.test(token.split('e')[0]!)
      value = Number(token)
    }
  }
  return { value, nonzero, length: match[0].length }
}

/** atof returns zero for invalid text and permits overflow/underflow. */
export function rlvAtof(text: string): number {
  return Math.fround(floatPrefix(text)?.value ?? 0)
}

/** std::stof accepts special spellings but rejects numeric range errors. */
export function rlvStof(text: string): number | undefined {
  const parsed = floatPrefix(text)
  if (!parsed) return undefined
  const value = Math.fround(parsed.value)
  if (parsed.nonzero && (!Number.isFinite(value) || Math.abs(value) < 1.1754943508222875e-38)) return undefined
  return value
}

/** sscanf vector conversions accept range errors and final-field suffixes. */
export function rlvScanVector(text: string, singlePrecision: boolean): Vector | undefined {
  const values: number[] = []
  for (let index = 0; index < 3; ++index) {
    const parsed = floatPrefix(text)
    if (!parsed) return undefined
    values.push(singlePrecision ? Math.fround(parsed.value) : parsed.value)
    const consumed = text.slice(0, parsed.length)
    // scanf consumes the nan spelling but leaves a payload as trailing text.
    const payload = /^[\t\n\v\f\r ]*[+-]?nan/i.exec(consumed)
    text = text.slice(payload ? payload[0].length : parsed.length)
    if (index < 2) {
      if (!text.startsWith('/')) return undefined
      text = text.slice(1)
    }
  }
  return { x: values[0]!, y: values[1]!, z: values[2]! }
}

/** Decimal atoi prefixes; overflowing integer conversions have no defined result. */
export function rlvAtoi(text: string): number | undefined {
  const match = /^[\t\n\v\f\r ]*([+-]?[0-9]+)/.exec(text)
  if (!match) return 0
  const value = Number(match[1])
  return value >= -2147483648 && value <= 2147483647 ? value || 0 : undefined
}
