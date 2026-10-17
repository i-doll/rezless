import type { BuiltinImpl } from '../runtime.js'
import type { LslType, LslValue, Vector, Rotation } from '../values/types.js'
import { isVector, isRotation, ZERO_VECTOR, ZERO_ROTATION, NULL_KEY, toInt32 } from '../values/types.js'
import { formatFloat, formatList, formatRotation, formatVector } from '../values/format.js'
import { concatLists, listElementType, sliceList, typedList, uniformList } from '../values/list-types.js'

/** llGetListLength(list l) — number of elements. */
export const llGetListLength: BuiltinImpl = (_ctx, args) => {
  const l = args[0] as ReadonlyArray<LslValue> | undefined
  return (l?.length ?? 0) | 0
}

/**
 * Resolve an index that may be negative (counts from the end) and bound it
 * to [0, length). Returns -1 for out-of-range so callers can short-circuit
 * to the LSL default.
 */
function resolveIndex(idx: number, len: number): number {
  if (idx < 0) idx = len + idx
  if (idx < 0 || idx >= len) return -1
  return idx
}

/** llList2Integer(list l, integer i) — element coerced to integer (0 default). */
export const llList2Integer: BuiltinImpl = (_ctx, args) => {
  const l = args[0] as ReadonlyArray<LslValue> | undefined
  if (!l) return 0
  const i = resolveIndex((args[1] as number | undefined) ?? 0, l.length)
  if (i < 0) return 0
  const v = l[i]
  if (typeof v === 'number') return toInt32(Math.trunc(v))
  if (typeof v === 'string') {
    const n = Number.parseInt(v, 10)
    return Number.isNaN(n) ? 0 : toInt32(n)
  }
  return 0
}

export const llList2Float: BuiltinImpl = (_ctx, args) => {
  const l = args[0] as ReadonlyArray<LslValue> | undefined
  if (!l) return 0
  const i = resolveIndex((args[1] as number | undefined) ?? 0, l.length)
  if (i < 0) return 0
  const v = l[i]
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number.parseFloat(v)
    return Number.isNaN(n) ? 0 : n
  }
  return 0
}

export const llList2String: BuiltinImpl = (_ctx, args) => {
  const l = args[0] as ReadonlyArray<LslValue> | undefined
  if (!l) return ''
  const i = resolveIndex((args[1] as number | undefined) ?? 0, l.length)
  if (i < 0) return ''
  const v = l[i]
  if (typeof v === 'string') return v
  if (typeof v === 'number') return Number.isInteger(v) ? String(v | 0) : v.toFixed(6)
  if (Array.isArray(v)) return formatList(v)
  if (isVector(v as Vector)) {
    const u = v as Vector
    return `<${u.x.toFixed(6)}, ${u.y.toFixed(6)}, ${u.z.toFixed(6)}>`
  }
  if (isRotation(v as Rotation)) {
    const r = v as Rotation
    return `<${r.x.toFixed(6)}, ${r.y.toFixed(6)}, ${r.z.toFixed(6)}, ${r.s.toFixed(6)}>`
  }
  return ''
}

export const llList2Key: BuiltinImpl = (_ctx, args) => {
  const l = args[0] as ReadonlyArray<LslValue> | undefined
  if (!l) return NULL_KEY
  const i = resolveIndex((args[1] as number | undefined) ?? 0, l.length)
  if (i < 0) return NULL_KEY
  const v = l[i]
  return typeof v === 'string' ? v : NULL_KEY
}

export const llList2Vector: BuiltinImpl = (_ctx, args) => {
  const l = args[0] as ReadonlyArray<LslValue> | undefined
  if (!l) return ZERO_VECTOR
  const i = resolveIndex((args[1] as number | undefined) ?? 0, l.length)
  if (i < 0) return ZERO_VECTOR
  const v = l[i]
  return isVector(v as Vector) ? (v as Vector) : ZERO_VECTOR
}

export const llList2Rot: BuiltinImpl = (_ctx, args) => {
  const l = args[0] as ReadonlyArray<LslValue> | undefined
  if (!l) return ZERO_ROTATION
  const i = resolveIndex((args[1] as number | undefined) ?? 0, l.length)
  if (i < 0) return ZERO_ROTATION
  const v = l[i]
  return isRotation(v as Rotation) ? (v as Rotation) : ZERO_ROTATION
}

/**
 * Whether `start..end` is an exclusion range: after counting negative indexes
 * from the end once, start comes after end. LSL then keeps or drops both
 * ends of the list instead of the middle. Indexes outside the list are not
 * clamped first, so a range past the end selects nothing.
 */
function isExclusionRange(start: number, end: number, len: number): boolean {
  return (start < 0 ? start + len : start) > (end < 0 ? end + len : end)
}

/**
 * llList2List(list src, integer start, integer end) — inclusive slice.
 * When start comes after end, returns the elements outside end..start.
 */
export const llList2List: BuiltinImpl = (_ctx, args) => {
  const src = (args[0] as ReadonlyArray<LslValue> | undefined) ?? []
  const start = (args[1] as number | undefined) ?? 0
  let end = (args[2] as number | undefined) ?? 0
  if (end === -1) end += src.length
  if (isExclusionRange(start, end, src.length)) return concatLists(sliceList(src, 0, end + 1), sliceList(src, start))
  return sliceList(src, start, end + 1)
}

/**
 * llDeleteSubList(list src, integer start, integer end) — inverse of
 * llList2List. Same range rules.
 */
export const llDeleteSubList: BuiltinImpl = (_ctx, args) => {
  const src = (args[0] as ReadonlyArray<LslValue> | undefined) ?? []
  const start = (args[1] as number | undefined) ?? 0
  let end = (args[2] as number | undefined) ?? 0
  if (end === -1) end += src.length
  if (isExclusionRange(start, end, src.length)) return sliceList(src, end + 1, start)
  return concatLists(sliceList(src, 0, start), sliceList(src, end + 1))
}

/** llListInsertList(list dst, list src, integer pos) — inserts src at pos. */
export const llListInsertList: BuiltinImpl = (_ctx, args) => {
  const dst = (args[0] as ReadonlyArray<LslValue> | undefined) ?? []
  const src = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  let pos = (args[2] as number | undefined) ?? 0
  if (pos < 0) pos = Math.max(0, dst.length + pos)
  pos = Math.min(dst.length, pos)
  return concatLists(sliceList(dst, 0, pos), src, sliceList(dst, pos))
}

/**
 * llListReplaceList(list dst, list src, integer start, integer end)
 * — replaces dst[start..end] (inclusive) with src. A range past the end
 * appends src. When start comes after end, both ends of dst are dropped and
 * src is appended to what is left.
 */
export const llListReplaceList: BuiltinImpl = (_ctx, args) => {
  const dst = (args[0] as ReadonlyArray<LslValue> | undefined) ?? []
  let src = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  const len = dst.length
  const start = (args[2] as number | undefined) ?? 0
  let end = (args[3] as number | undefined) ?? 0
  // A start before the beginning of the list replaces with nothing.
  if (start < -len) src = []
  const exclusion = isExclusionRange(start, end, len)
  if (end === -1) end += len
  if (exclusion) return concatLists(sliceList(dst, end + 1, start), src)
  return concatLists(sliceList(dst, 0, start), src, sliceList(dst, end + 1))
}

/**
 * llListFindList(list src, list test) — index of first occurrence of `test`
 * as a contiguous subsequence in `src`, or -1. Empty `test` returns 0
 * (per LSL). Elements must match in type as well as value, so a key never
 * matches a string with the same text.
 */
export const llListFindList: BuiltinImpl = (_ctx, args) => {
  const src = (args[0] as ReadonlyArray<LslValue> | undefined) ?? []
  const test = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  if (test.length === 0) return 0
  outer: for (let i = 0; i <= src.length - test.length; i++) {
    for (let j = 0; j < test.length; j++) {
      const ta = listElementType(src, i + j)
      const tb = listElementType(test, j)
      if (ta && tb && ta !== tb) continue outer
      if (!lslElementsEqual(src[i + j], test[j])) continue outer
    }
    return i
  }
  return -1
}

function lslElementsEqual(a: LslValue | undefined, b: LslValue | undefined): boolean {
  if (a === b) return true
  if (typeof a === 'object' && typeof b === 'object' && a && b) {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}

function dumpElement(v: LslValue, type: LslType | undefined): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return type !== 'float' && Number.isInteger(v) ? String(v | 0) : formatFloat(v)
  if (Array.isArray(v)) return formatList(v)
  if (isVector(v as Vector)) return formatVector(v as Vector)
  if (isRotation(v as Rotation)) return formatRotation(v as Rotation)
  return ''
}

export const llDumpList2String: BuiltinImpl = (_ctx, args) => {
  const list = (args[0] as ReadonlyArray<LslValue> | undefined) ?? []
  const sep = (args[1] as string | undefined) ?? ''
  return list.map((v, i) => dumpElement(v, listElementType(list, i))).join(sep)
}

export const llList2CSV: BuiltinImpl = (_ctx, args) => {
  const list = (args[0] as ReadonlyArray<LslValue> | undefined) ?? []
  return list.map((v, i) => dumpElement(v, listElementType(list, i))).join(', ')
}

export const llCSV2List: BuiltinImpl = (_ctx, args) => {
  const s = (args[0] as string | undefined) ?? ''
  const out: string[] = []
  let depth = 0
  let start = 0
  let afterComma = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === ',' && depth === 0) {
      out.push(s.slice(start, i))
      start = i + 1
      afterComma = true
      continue
    }
    if (c === '<') depth++
    else if (c === '>' && depth > 0) depth--
    else if (c === ' ' && afterComma) start++
    afterComma = false
  }
  out.push(s.slice(start))
  return uniformList(out, 'string')
}

export const llParseString2List: BuiltinImpl = (_ctx, args) => parseString(args, false)

/** llParseStringKeepNulls(string src, list separators, list spacers) — like llParseString2List, but keeps empty entries. */
export const llParseStringKeepNulls: BuiltinImpl = (_ctx, args) => parseString(args, true)

/**
 * Splits `src` on the first eight string entries of each delimiter list.
 * At each position, separators are tried before spacers, each in the order
 * given, and the first match wins.
 */
function parseString(args: ReadonlyArray<LslValue>, keepNulls: boolean): ReadonlyArray<LslValue> {
  const src = (args[0] as string | undefined) ?? ''
  const seps = delimiters((args[1] as ReadonlyArray<LslValue> | undefined) ?? [])
  const spacers = delimiters((args[2] as ReadonlyArray<LslValue> | undefined) ?? [])
  const out: string[] = []
  let buffer = ''
  let i = 0
  while (i < src.length) {
    const sep = seps.find((t) => src.startsWith(t, i))
    const spacer = sep === undefined ? spacers.find((t) => src.startsWith(t, i)) : undefined
    const matched = sep ?? spacer
    if (matched !== undefined) {
      if (buffer || keepNulls) out.push(buffer)
      buffer = ''
      if (spacer !== undefined) out.push(spacer)
      i += matched.length
    } else {
      buffer += src[i]
      i++
    }
  }
  if (buffer || keepNulls) out.push(buffer)
  return uniformList(out, 'string')
}

/** The non-empty strings among the first eight entries of a delimiter list. */
function delimiters(list: ReadonlyArray<LslValue>): string[] {
  return list
    .slice(0, 8)
    .filter((x, i): x is string => typeof x === 'string' && x !== '' && listElementType(list, i) !== 'key')
}

/**
 * llListSort(list src, integer stride, integer ascending) — sorts strides by
 * their first element, using the same selection sort as Second Life, so
 * elements of different types are never reordered against each other.
 * Vectors compare by magnitude and rotations never compare. A list whose
 * length isn't a multiple of stride comes back unsorted.
 */
export const llListSort: BuiltinImpl = (_ctx, args) => {
  const src = (args[0] as ReadonlyArray<LslValue> | undefined) ?? []
  const stride = Math.max(1, (args[1] as number | undefined) ?? 1)
  const descending = ((args[2] as number | undefined) ?? 0) !== 1
  const len = src.length
  if (len % stride !== 0) return src
  const values = [...src]
  const types = values.map((_, i) => listElementType(src, i))
  const swap = (i: number, j: number) => {
    for (let k = 0; k < stride; k++) {
      ;[values[i + k], values[j + k]] = [values[j + k]!, values[i + k]!]
      ;[types[i + k], types[j + k]] = [types[j + k], types[i + k]]
    }
  }
  for (let i = 0; i < len - stride; i += stride) {
    for (let j = i + stride; j < len; j += stride) {
      if (sortsAfter(values[i]!, types[i], values[j]!, types[j]) !== descending) swap(i, j)
    }
  }
  return typedList(values, types)
}

/** Whether `a` sorts after `b`. A NaN sorts after everything. */
function sortsAfter(a: LslValue, ta: LslType | undefined, b: LslValue, tb: LslType | undefined): boolean {
  if (ta && tb && ta !== tb) return false
  if (typeof a === 'number' && typeof b === 'number') return !(a <= b)
  if (typeof a === 'string' && typeof b === 'string') return compareCodePoints(a, b) > 0
  if (isVector(a) && isVector(b)) return !(a.x * a.x + a.y * a.y + a.z * a.z <= b.x * b.x + b.y * b.y + b.z * b.z)
  return false
}

/** Orders strings by Unicode code point, not UTF-16 code unit. */
function compareCodePoints(a: string, b: string): number {
  const ia = a[Symbol.iterator]()
  const ib = b[Symbol.iterator]()
  for (;;) {
    const ca = ia.next()
    const cb = ib.next()
    if (ca.done || cb.done) return (ca.done ? 0 : 1) - (cb.done ? 0 : 1)
    const d = ca.value.codePointAt(0)! - cb.value.codePointAt(0)!
    if (d !== 0) return d
  }
}
