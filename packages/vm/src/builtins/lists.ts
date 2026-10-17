import type { BuiltinImpl } from '../runtime.js'
import type { LslType, LslValue, Vector, Rotation } from '../values/types.js'
import { isVector, isRotation, ZERO_VECTOR, ZERO_ROTATION, NULL_KEY, toInt32 } from '../values/types.js'
import { formatFloat, formatList, formatRotation, formatVector } from '../values/format.js'
import { concatLists, listElementType, sliceList } from '../values/list-types.js'

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
  if (s === '') return []
  return s.split(/,\s*/)
}

export const llParseString2List: BuiltinImpl = (_ctx, args) => {
  const src = (args[0] as string | undefined) ?? ''
  const seps = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  const keep = (args[2] as ReadonlyArray<LslValue> | undefined) ?? []
  const allTokens = [...seps.filter((x): x is string => typeof x === 'string'), ...keep.filter((x): x is string => typeof x === 'string')]
  if (allTokens.length === 0) return src ? [src] : []
  const out: string[] = []
  let buffer = ''
  let i = 0
  while (i < src.length) {
    const matched = allTokens
      .filter((t) => t.length > 0 && src.startsWith(t, i))
      .sort((a, b) => b.length - a.length)[0]
    if (matched) {
      if (buffer) out.push(buffer)
      buffer = ''
      if (keep.includes(matched)) out.push(matched)
      i += matched.length
    } else {
      buffer += src[i]
      i++
    }
  }
  if (buffer) out.push(buffer)
  return out
}
