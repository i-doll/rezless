import type { BuiltinImpl } from '../runtime.js'
import { STRING_TRIM_HEAD, STRING_TRIM_TAIL } from '../generated/constants.js'

/** llStringLength(string s) — Unicode code-point count, not byte count. */
export const llStringLength: BuiltinImpl = (_ctx, args) => {
  const s = (args[0] as string | undefined) ?? ''
  return [...s].length
}

/** llSubStringIndex(string source, string pattern) — first index, or -1. */
export const llSubStringIndex: BuiltinImpl = (_ctx, args) => {
  const src = (args[0] as string | undefined) ?? ''
  const pat = (args[1] as string | undefined) ?? ''
  return src.indexOf(pat)
}

/**
 * llGetSubString(string src, integer start, integer end)
 *
 * Inclusive bounds. Negative indices count back from the end (so -1 is the
 * last character). If start > end, LSL wraps: returns chars [0..end] +
 * [start..length-1] concatenated.
 */
export const llGetSubString: BuiltinImpl = (_ctx, args) => {
  const src = (args[0] as string | undefined) ?? ''
  const start = (args[1] as number | undefined) ?? 0
  const end = (args[2] as number | undefined) ?? 0
  return sliceLslString(src, start, end)
}

/** llDeleteSubString — same wrap rules as llGetSubString but in reverse. */
export const llDeleteSubString: BuiltinImpl = (_ctx, args) => {
  const src = (args[0] as string | undefined) ?? ''
  const start = (args[1] as number | undefined) ?? 0
  const end = (args[2] as number | undefined) ?? 0
  return deleteLslSubString(src, start, end)
}

export const llInsertString: BuiltinImpl = (_ctx, args) => {
  const src = (args[0] as string | undefined) ?? ''
  const pos = (args[1] as number | undefined) ?? 0
  const text = (args[2] as string | undefined) ?? ''
  const safe = clampInsertPos(src, pos)
  return src.slice(0, safe) + text + src.slice(safe)
}

export const llStringTrim: BuiltinImpl = (_ctx, args) => {
  const src = (args[0] as string | undefined) ?? ''
  const flags = (args[1] as number | undefined) ?? 0
  let s = src
  if (flags & STRING_TRIM_HEAD) s = s.replace(/^\s+/, '')
  if (flags & STRING_TRIM_TAIL) s = s.replace(/\s+$/, '')
  return s
}

export const llToLower: BuiltinImpl = (_ctx, args) =>
  ((args[0] as string | undefined) ?? '').toLowerCase()
export const llToUpper: BuiltinImpl = (_ctx, args) =>
  ((args[0] as string | undefined) ?? '').toUpperCase()

export const llReplaceSubString: BuiltinImpl = (_ctx, args) => {
  const src = (args[0] as string | undefined) ?? ''
  const pattern = (args[1] as string | undefined) ?? ''
  const replacement = (args[2] as string | undefined) ?? ''
  const count = (args[3] as number | undefined) ?? 0
  if (!pattern) return src
  if (count === 0) return src.split(pattern).join(replacement)
  let out = src
  if (count > 0) {
    let remaining = count
    let result = ''
    let rest = out
    while (remaining > 0) {
      const idx = rest.indexOf(pattern)
      if (idx < 0) break
      result += rest.slice(0, idx) + replacement
      rest = rest.slice(idx + pattern.length)
      remaining--
    }
    return result + rest
  }
  // count < 0: replace from end, |count| times.
  let n = -count
  let result = out
  while (n > 0) {
    const idx = result.lastIndexOf(pattern)
    if (idx < 0) break
    result = result.slice(0, idx) + replacement + result.slice(idx + pattern.length)
    n--
  }
  return result
}

export const llEscapeURL: BuiltinImpl = (_ctx, args) =>
  encodeURIComponent((args[0] as string | undefined) ?? '')
export const llUnescapeURL: BuiltinImpl = (_ctx, args) => {
  try {
    return decodeURIComponent((args[0] as string | undefined) ?? '')
  } catch {
    return ''
  }
}

// ---- Helpers ----

function normalizeIndex(i: number, length: number): number {
  return i < 0 ? Math.max(0, length + i) : Math.min(length - 1, i)
}

function sliceLslString(src: string, start: number, end: number): string {
  const len = src.length
  if (len === 0) return ''
  const a = normalizeIndex(start, len)
  const b = normalizeIndex(end, len)
  if (a <= b) return src.slice(a, b + 1)
  // LSL "exclusive" slice: returns [0..b] + [a..end]
  return src.slice(0, b + 1) + src.slice(a)
}

function deleteLslSubString(src: string, start: number, end: number): string {
  const len = src.length
  if (len === 0) return src
  const a = normalizeIndex(start, len)
  const b = normalizeIndex(end, len)
  if (a <= b) return src.slice(0, a) + src.slice(b + 1)
  // Wrapped: keep just the slice between b and a (exclusive).
  return src.slice(b + 1, a)
}

function clampInsertPos(src: string, pos: number): number {
  if (pos < 0) return 0
  if (pos > src.length) return src.length
  return pos
}
