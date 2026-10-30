import type { EvalResult, LslType, LslValue } from './types.js'
import { ZERO_VECTOR, ZERO_ROTATION, NULL_KEY, isVector, isRotation, toInt32, toFloat32 } from './types.js'
import { formatFloatZeroRule, formatList, formatVector, formatRotation } from './format.js'
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
      if (typeof v === 'number') return { type: 'integer', value: floatToInteger(v) }
      if (typeof v === 'string') return { type: 'integer', value: parseLslInteger(v) }
      throw typeError(from, target)
    }
    case 'float': {
      if (typeof v === 'number') return { type: 'float', value: toFloat32(v) }
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
      return formatFloatZeroRule(v as number)
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

/** LSL `(integer)float`: truncate; out of range, NaN and infinity give -2147483648. */
export function floatToInteger(n: number): number {
  const t = Math.trunc(n)
  return t >= -2147483648 && t <= 2147483647 ? t : -2147483648
}

/**
 * LSL `(integer)str` parsing.
 *   - Skip leading whitespace
 *   - Optional + or - sign
 *   - Optional `0x` for hex (not accepted after a '-')
 *   - Read decimal digits (or hex digits) until the first non-matching character
 *   - Empty / no-digits → 0
 */
export function parseLslInteger(s: string): number {
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
    if (!hex || sign < 0) return 0
    return saturate(Number.parseInt(hex, 16), sign)
  }
  let dec = ''
  while (i < s.length && /[0-9]/.test(s[i]!)) {
    dec += s[i]
    i++
  }
  if (!dec) return 0
  return saturate(Number.parseInt(dec, 10), sign)
}

/** C `strtoul` into 32 bits: saturate at 0xFFFFFFFF, negate mod 2^32 for '-'. */
function saturate(magnitude: number, sign: number): number {
  return magnitude > 0xffffffff ? -1 : toInt32(sign * magnitude)
}

/** LSL `(float)str`: leading whitespace, then a C `strtod` number; 0 if none. */
function parseLslFloat(s: string): number {
  let i = 0
  while (i < s.length && /\s/.test(s[i]!)) i++
  return scanFloat(s, i)?.value ?? 0
}

/**
 * Read a C `strtod` number at `start`: decimal with optional exponent, hex
 * (`0x1p4`), `inf`, `infinity` or `nan`, each with an optional sign.
 */
function scanFloat(s: string, start: number): { value: number; end: number } | null {
  const m = /^[+-]?(?:(0x)([0-9a-f]*)(?:\.([0-9a-f]*))?(?:p([+-]?\d+))?|infinity|inf|nan|(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/i.exec(
    s.slice(start),
  )
  if (!m) return null
  const text = m[0]
  const sign = text.startsWith('-') ? -1 : 1
  const body = text.replace(/^[+-]/, '').toLowerCase()
  let value: number
  if (body.startsWith('inf')) value = Infinity
  else if (body === 'nan') value = NaN
  else if (m[1]) {
    const int = m[2] ?? ''
    const frac = m[3] ?? ''
    if (!int && !frac) return { value: 0, end: start + text.toLowerCase().indexOf('x') }
    const mantissa = Number.parseInt(int + frac || '0', 16) / 16 ** frac.length
    value = mantissa * 2 ** Number(m[4] ?? 0)
  } else value = Number.parseFloat(body)
  return { value: toFloat32(sign * value), end: start + text.length }
}

/**
 * LSL `(vector)str` / `(rotation)str`, like C `sscanf("<%f,%f,%f")`: the
 * string must start with `<`, each comma must follow its number directly,
 * and anything after the last number is ignored.
 */
function scanComponents(s: string, count: number): number[] | null {
  if (s[0] !== '<') return null
  const out: number[] = []
  let i = 1
  while (out.length < count) {
    if (out.length > 0) {
      if (s[i] !== ',') return null
      i++
    }
    while (/\s/.test(s[i] ?? '')) i++
    const f = scanFloat(s, i)
    if (!f) return null
    out.push(f.value)
    i = f.end
  }
  return out
}

function parseLslVector(s: string): { x: number; y: number; z: number } {
  const c = scanComponents(s, 3)
  if (!c) return ZERO_VECTOR
  return { x: c[0]!, y: c[1]!, z: c[2]! }
}

function parseLslRotation(s: string): { x: number; y: number; z: number; s: number } {
  const c = scanComponents(s, 4)
  if (!c) return ZERO_ROTATION
  return { x: c[0]!, y: c[1]!, z: c[2]!, s: c[3]! }
}

/** Sentinel re-exports for callers that want defaults inline. */
export { NULL_KEY }
