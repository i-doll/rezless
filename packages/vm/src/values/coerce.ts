import type { EvalResult, LslType, LslValue } from './types.js'
import { ZERO_VECTOR, ZERO_ROTATION, NULL_KEY, isVector, isRotation, toInt32 } from './types.js'
import { formatFloat, formatList, formatVector, formatRotation } from './format.js'
import { typedList } from './list-types.js'

/**
 * Coerce a runtime value to a target LSL type.
 *
 * Implements the documented LSL coercion rules:
 *   integer ↔ float
 *   string  ↔ key
 *   any → string (printable form)
 *   string → integer/float (parse, leading whitespace + sign, stops at first non-digit)
 *   anything → list (wraps as single element, except list which is identity)
 *
 * Vector / rotation cannot be cast from anything other than themselves
 * (and string in the form "<x,y,z>"). For now the string→vector path returns
 * ZERO_VECTOR on parse failure to match LSL.
 */
export function coerce(from: EvalResult, target: LslType): EvalResult {
  if (from.type === target) return from
  const v = from.value
  switch (target) {
    case 'integer': {
      if (typeof v === 'number') return { type: 'integer', value: toInt32(Math.trunc(v)) }
      if (typeof v === 'string') return { type: 'integer', value: parseLslInteger(v) }
      throw typeError(from, target)
    }
    case 'float': {
      if (typeof v === 'number') return { type: 'float', value: v }
      if (typeof v === 'string') return { type: 'float', value: parseLslFloat(v) }
      throw typeError(from, target)
    }
    case 'string': {
      return { type: 'string', value: stringify(from) }
    }
    case 'key': {
      if (typeof v === 'string') return { type: 'key', value: v }
      throw typeError(from, target)
    }
    case 'vector': {
      if (isVector(v)) return { type: 'vector', value: v }
      if (typeof v === 'string') return { type: 'vector', value: parseLslVector(v) }
      throw typeError(from, target)
    }
    case 'rotation': {
      if (isRotation(v)) return { type: 'rotation', value: v }
      if (typeof v === 'string') return { type: 'rotation', value: parseLslRotation(v) }
      throw typeError(from, target)
    }
    case 'list': {
      if (Array.isArray(v)) return { type: 'list', value: v }
      // Wrap any single value as a one-element list.
      return { type: 'list', value: typedList([v as LslValue], [from.type]) }
    }
    case 'void':
      throw new Error('cannot coerce to void')
  }
}

function typeError(from: EvalResult, target: LslType): Error {
  return new Error(`cannot coerce ${from.type} to ${target}`)
}

/** Render a value as LSL's `(string)` form. */
export function stringify(r: EvalResult): string {
  const v = r.value
  switch (r.type) {
    case 'integer':
      return String(toInt32(v as number))
    case 'float':
      return formatFloat(v as number)
    case 'string':
      return v as string
    case 'key':
      return v as string
    case 'vector':
      return formatVector(v as { x: number; y: number; z: number })
    case 'rotation':
      return formatRotation(v as { x: number; y: number; z: number; s: number })
    case 'list':
      return formatList(v as ReadonlyArray<LslValue>)
    case 'void':
      return ''
  }
}

/**
 * LSL `(integer)str` parsing.
 *   - Skip leading whitespace
 *   - Optional + or - sign
 *   - Optional `0x` for hex
 *   - Read decimal digits (or hex digits) until the first non-matching character
 *   - Empty / no-digits → 0
 */
function parseLslInteger(s: string): number {
  let i = 0
  while (i < s.length && /\s/.test(s[i]!)) i++
  let sign = 1
  if (s[i] === '+') i++
  else if (s[i] === '-') {
    sign = -1
    i++
  }
  if (s[i] === '0' && (s[i + 1] === 'x' || s[i + 1] === 'X')) {
    i += 2
    let hex = ''
    while (i < s.length && /[0-9a-fA-F]/.test(s[i]!)) {
      hex += s[i]
      i++
    }
    if (!hex) return 0
    return toInt32(sign * Number.parseInt(hex, 16))
  }
  let dec = ''
  while (i < s.length && /[0-9]/.test(s[i]!)) {
    dec += s[i]
    i++
  }
  if (!dec) return 0
  return toInt32(sign * Number.parseInt(dec, 10))
}

/** LSL `(float)str` — accepts decimal, exponent, optional sign, leading whitespace. */
function parseLslFloat(s: string): number {
  let i = 0
  while (i < s.length && /\s/.test(s[i]!)) i++
  const start = i
  if (s[i] === '+' || s[i] === '-') i++
  while (i < s.length && /[0-9]/.test(s[i]!)) i++
  if (s[i] === '.') {
    i++
    while (i < s.length && /[0-9]/.test(s[i]!)) i++
  }
  if (s[i] === 'e' || s[i] === 'E') {
    i++
    if (s[i] === '+' || s[i] === '-') i++
    while (i < s.length && /[0-9]/.test(s[i]!)) i++
  }
  if (i === start) return 0
  const n = Number.parseFloat(s.slice(start, i))
  return Number.isFinite(n) ? n : 0
}

function parseLslVector(s: string): { x: number; y: number; z: number } {
  const m = s.match(/^\s*<\s*([^,]+),\s*([^,]+),\s*([^>]+)\s*>\s*$/)
  if (!m) return ZERO_VECTOR
  const [, xs, ys, zs] = m
  return {
    x: parseLslFloat(xs!),
    y: parseLslFloat(ys!),
    z: parseLslFloat(zs!),
  }
}

function parseLslRotation(s: string): { x: number; y: number; z: number; s: number } {
  const m = s.match(/^\s*<\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^>]+)\s*>\s*$/)
  if (!m) return ZERO_ROTATION
  const [, xs, ys, zs, ss] = m
  return {
    x: parseLslFloat(xs!),
    y: parseLslFloat(ys!),
    z: parseLslFloat(zs!),
    s: parseLslFloat(ss!),
  }
}

/** Sentinel re-exports for callers that want defaults inline. */
export { NULL_KEY }
