import type { BuiltinImpl } from '../runtime.js'
import type { LslType, LslValue, Vector, Rotation } from '../values/types.js'
import { isVector, isRotation, ZERO_VECTOR, ZERO_ROTATION } from '../values/types.js'
import { formatFloatExact, formatListElement } from '../values/format.js'
import { floatToInteger, parseLslInteger } from '../values/coerce.js'
import {
  LIST_STAT_GEOMETRIC_MEAN,
  LIST_STAT_MAX,
  LIST_STAT_MEAN,
  LIST_STAT_MEDIAN,
  LIST_STAT_MIN,
  LIST_STAT_NUM_COUNT,
  LIST_STAT_RANGE,
  LIST_STAT_STD_DEV,
  LIST_STAT_SUM,
  LIST_STAT_SUM_SQUARES,
} from '../generated/constants.js'
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
  if (typeof v === 'number') return floatToInteger(v)
  if (typeof v === 'string') return parseLslInteger(v)
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
  return formatListElement(l[i]!, listElementType(l, i))
}

export const llList2Key: BuiltinImpl = (_ctx, args) => {
  const l = args[0] as ReadonlyArray<LslValue> | undefined
  if (!l) return ''
  const i = resolveIndex((args[1] as number | undefined) ?? 0, l.length)
  if (i < 0) return ''
  const v = l[i]
  return typeof v === 'string' ? v : ''
}

const ENTRY_TYPES: Partial<Record<LslType, number>> = {
  integer: 1,
  float: 2,
  string: 3,
  key: 4,
  vector: 5,
  rotation: 6,
}

/**
 * llGetListEntryType(list src, integer index) — the TYPE_* constant of an
 * element, or TYPE_INVALID (0) out of range. Elements with no recorded type
 * are judged by their value, so a whole number reads as an integer.
 */
export const llGetListEntryType: BuiltinImpl = (_ctx, args) => {
  const l = args[0] as ReadonlyArray<LslValue> | undefined
  if (!l) return 0
  const i = resolveIndex((args[1] as number | undefined) ?? 0, l.length)
  if (i < 0) return 0
  const recorded = listElementType(l, i)
  if (recorded) return ENTRY_TYPES[recorded] ?? 0
  const v = l[i]
  if (typeof v === 'string') return 3
  if (typeof v === 'number') return Number.isInteger(v) ? 1 : 2
  if (isRotation(v as Rotation)) return 6
  if (isVector(v as Vector)) return 5
  return 0
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
  for (let i = 0; i <= src.length - test.length; i++) if (matchesAt(src, test, i)) return i
  return -1
}

function matchesAt(src: ReadonlyArray<LslValue>, test: ReadonlyArray<LslValue>, at: number): boolean {
  for (let j = 0; j < test.length; j++) {
    const ta = listElementType(src, at + j)
    const tb = listElementType(test, j)
    if (ta && tb && ta !== tb) return false
    if (!lslElementsEqual(src[at + j], test[j])) return false
  }
  return true
}

function lslElementsEqual(a: LslValue | undefined, b: LslValue | undefined): boolean {
  if (a === b) return true
  if (typeof a === 'object' && typeof b === 'object' && a && b) {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}

export const llDumpList2String: BuiltinImpl = (_ctx, args) => {
  const list = (args[0] as ReadonlyArray<LslValue> | undefined) ?? []
  const sep = (args[1] as string | undefined) ?? ''
  return list.map((v, i) => formatListElement(v, listElementType(list, i))).join(sep)
}

export const llList2CSV: BuiltinImpl = (_ctx, args) => {
  const list = (args[0] as ReadonlyArray<LslValue> | undefined) ?? []
  return list.map((v, i) => formatListElement(v, listElementType(list, i), formatFloatExact)).join(', ')
}

export const llCSV2List: BuiltinImpl = (_ctx, args) => {
  const s = (args[0] as string | undefined) ?? ''
  const out: string[] = []
  let depth = 0
  let start = 0
  let atItemStart = true
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === ',' && depth === 0) {
      out.push(s.slice(start, i))
      start = i + 1
      atItemStart = true
      continue
    }
    if (c === '<') depth++
    else if (c === '>' && depth > 0) depth--
    else if (c === ' ' && atItemStart) start++
    atItemStart = false
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
export const llListSort: BuiltinImpl = (_ctx, args) =>
  sortStrided(args[0], args[1], 0, args[2])

/**
 * llListSortStrided(list src, integer stride, integer stride_index, integer ascending)
 * — llListSort keyed on the element at stride_index in each stride. A
 * negative index counts from the end of the stride; one outside it gives [].
 */
export const llListSortStrided: BuiltinImpl = (_ctx, args) =>
  sortStrided(args[0], args[1], (args[2] as number | undefined) ?? 0, args[3])

function sortStrided(
  list: LslValue | undefined,
  strideArg: LslValue | undefined,
  index: number,
  ascending: LslValue | undefined,
): ReadonlyArray<LslValue> {
  const src = (list as ReadonlyArray<LslValue> | undefined) ?? []
  const stride = Math.max(1, (strideArg as number | undefined) ?? 1)
  const descending = ((ascending as number | undefined) ?? 0) !== 1
  if (index < 0) index += stride
  if (index < 0 || index >= stride) return []
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
      const a = i + index
      const b = j + index
      if (sortsAfter(values[a]!, types[a], values[b]!, types[b]) !== descending) swap(i, j)
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

/**
 * The inclusive index ranges `start..end` selects, clamped to the list.
 * Negative indexes count from the end; start after end selects both outer ends.
 */
function ranges(start: number, end: number, len: number): Array<[number, number]> {
  const s = start < 0 ? start + len : start
  const e = end < 0 ? end + len : end
  const selected: Array<[number, number]> = s > e ? [[0, e], [s, len - 1]] : [[s, e]]
  return selected.map(([from, to]) => [Math.max(from, 0), Math.min(to, len - 1)])
}

function pick(src: ReadonlyArray<LslValue>, indexes: number[]): ReadonlyArray<LslValue> {
  return typedList(
    indexes.map((i) => src[i]!),
    indexes.map((i) => listElementType(src, i)),
  )
}

/**
 * llList2ListStrided(list src, integer start, integer end, integer stride) —
 * the elements in start..end whose index in the whole list is a multiple of
 * the stride. A stride of 0 acts as 1, a negative one as its absolute value,
 * and start after end selects the whole list.
 */
export const llList2ListStrided: BuiltinImpl = (_ctx, args) => {
  const src = (args[0] as ReadonlyArray<LslValue> | undefined) ?? []
  const start = (args[1] as number | undefined) ?? 0
  const end = (args[2] as number | undefined) ?? 0
  const stride = Math.abs((args[3] as number | undefined) ?? 1) || 1
  const selected = ranges(start, end, src.length)
  const [from, to] = selected.length > 1 ? [0, src.length - 1] : selected[0]!
  const indexes: number[] = []
  for (let i = from; i <= to; i++) if (i % stride === 0) indexes.push(i)
  return pick(src, indexes)
}

/**
 * llList2ListSlice(list src, integer start, integer end, integer stride, integer slice_index)
 * — within each selected range, the elements whose offset from the range's
 * start is slice_index modulo the stride. A negative slice_index counts from
 * the end of the stride; one outside the stride, or a stride below 1, gives [].
 */
export const llList2ListSlice: BuiltinImpl = (_ctx, args) => {
  const src = (args[0] as ReadonlyArray<LslValue> | undefined) ?? []
  const start = (args[1] as number | undefined) ?? 0
  const end = (args[2] as number | undefined) ?? 0
  const stride = (args[3] as number | undefined) ?? 0
  let slice = (args[4] as number | undefined) ?? 0
  if (slice < 0) slice += stride
  if (stride <= 0 || slice < 0 || slice >= stride) return []
  const indexes: number[] = []
  for (const [from, to] of ranges(start, end, src.length)) {
    for (let i = from + slice; i <= to; i += stride) indexes.push(i)
  }
  return pick(src, indexes)
}

/**
 * llListRandomize(list src, integer stride) — shuffles whole stride-sized
 * blocks with the script's seeded random source. A stride below 1 shuffles
 * single elements; a list whose length isn't a multiple of the stride comes
 * back unchanged.
 */
export const llListRandomize: BuiltinImpl = (ctx, args) => {
  const src = (args[0] as ReadonlyArray<LslValue> | undefined) ?? []
  const stride = Math.max(1, (args[1] as number | undefined) ?? 1)
  if (src.length % stride !== 0) return src
  const blocks = Array.from({ length: src.length / stride }, (_, b) => b)
  for (let i = blocks.length - 1; i > 0; i--) {
    const j = ctx.state.random.nextInt(i + 1)
    ;[blocks[i], blocks[j]] = [blocks[j]!, blocks[i]!]
  }
  return pick(src, blocks.flatMap((b) => Array.from({ length: stride }, (_, k) => b * stride + k)))
}

export const llListStatistics: BuiltinImpl = (_ctx, args) => {
  const op = (args[0] as number | undefined) ?? 0
  const src = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  const nums = src.filter((v): v is number => typeof v === 'number')
  if (nums.length === 0) return 0
  const sum = nums.reduce((a, b) => a + b, 0)
  const mean = sum / nums.length
  const sorted = [...nums].sort((a, b) => a - b)
  switch (op) {
    case LIST_STAT_RANGE:
      return sorted[sorted.length - 1]! - sorted[0]!
    case LIST_STAT_MIN:
      return sorted[0]!
    case LIST_STAT_MAX:
      return sorted[sorted.length - 1]!
    case LIST_STAT_MEAN:
      return mean
    case LIST_STAT_MEDIAN: {
      const mid = sorted.length >> 1
      return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
    }
    case LIST_STAT_STD_DEV:
      if (nums.length < 2) return 0
      return Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (nums.length - 1))
    case LIST_STAT_SUM:
      return sum
    case LIST_STAT_SUM_SQUARES:
      return nums.reduce((a, b) => a + b * b, 0)
    case LIST_STAT_NUM_COUNT:
      return nums.length
    case LIST_STAT_GEOMETRIC_MEAN:
      if (nums.some((n) => n <= 0)) return 0
      return Math.exp(nums.reduce((a, b) => a + Math.log(b), 0) / nums.length)
    default:
      return 0
  }
}

/**
 * llListFindListNext(list src, list test, integer instance) — start index of
 * the instance-th occurrence of `test` (0-based, or counted back from the end
 * when negative). Each search resumes after the previous match; once a later
 * search starts past the end of `src` the result is length(src).
 */
export const llListFindListNext: BuiltinImpl = (_ctx, args) => {
  const src = (args[0] as ReadonlyArray<LslValue> | undefined) ?? []
  const test = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  const instance = (args[2] as number | undefined) ?? 0
  const last = src.length - 1
  const forward = instance >= 0
  const rounds = forward ? instance + 1 : -instance
  let pos = forward ? 0 : last
  let found = -1
  for (let round = 0; round < rounds; round++) {
    if (round > 0 && (forward ? pos >= src.length : pos < 0)) return src.length
    found = -1
    if (forward) {
      for (let i = pos; i <= last - test.length + 1 && i < src.length; i++) {
        if (matchesAt(src, test, i)) {
          found = i
          break
        }
      }
    } else {
      for (let i = Math.min(pos, last - test.length + 1); i >= 0; i--) {
        if (matchesAt(src, test, i)) {
          found = i
          break
        }
      }
    }
    if (found < 0) return -1
    pos = forward ? found + 1 : found - 1
  }
  return found
}

/**
 * llListFindStrided(list src, list test, integer start, integer end, integer stride)
 * — first match of `test` beginning at start, start + stride, ... and no
 * later than end. Negative start or end count from the end; a stride below 1
 * acts as 1.
 */
export const llListFindStrided: BuiltinImpl = (_ctx, args) => {
  const src = (args[0] as ReadonlyArray<LslValue> | undefined) ?? []
  const test = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  let start = (args[2] as number | undefined) ?? 0
  let end = (args[3] as number | undefined) ?? -1
  const stride = Math.max(1, (args[4] as number | undefined) ?? 1)
  if (start < 0) start += src.length
  if (end < 0) end += src.length
  for (let i = Math.max(start, 0); i <= Math.min(end, src.length - test.length); i += stride) {
    if (matchesAt(src, test, i)) return i
  }
  return -1
}
