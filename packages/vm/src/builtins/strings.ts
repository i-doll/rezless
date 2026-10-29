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
  const idx = src.indexOf(pat)
  return idx < 0 ? -1 : [...src.slice(0, idx)].length
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
  const chars = [...src]
  const safe = Math.min(Math.max(pos, 0), chars.length)
  return chars.slice(0, safe).join('') + text + chars.slice(safe).join('')
}

export const llStringTrim: BuiltinImpl = (_ctx, args) => {
  const src = (args[0] as string | undefined) ?? ''
  const flags = (args[1] as number | undefined) ?? 0
  let s = src
  if (flags & STRING_TRIM_HEAD) s = s.replace(/^[\t\n\v\f\r ]+/, '')
  if (flags & STRING_TRIM_TAIL) s = s.replace(/[\t\n\v\f\r ]+$/, '')
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

export const llEscapeURL: BuiltinImpl = (_ctx, args) => {
  let out = ''
  for (const byte of Buffer.from((args[0] as string | undefined) ?? '', 'utf8')) {
    const isAlnum =
      (byte >= 0x30 && byte <= 0x39) ||
      (byte >= 0x41 && byte <= 0x5a) ||
      (byte >= 0x61 && byte <= 0x7a)
    out += isAlnum
      ? String.fromCharCode(byte)
      : '%' + byte.toString(16).toUpperCase().padStart(2, '0')
  }
  return out
}

export const llUnescapeURL: BuiltinImpl = (_ctx, args) => {
  const src = (args[0] as string | undefined) ?? ''
  try {
    return decodeURIComponent(src.endsWith('%') ? src.slice(0, -1) : src)
  } catch {
    return ''
  }
}

// ---- Helpers ----

function resolveIndex(i: number, length: number): number {
  return i < 0 ? length + i : i
}

function sliceLslString(src: string, start: number, end: number): string {
  const chars = [...src]
  const len = chars.length
  const a = resolveIndex(start, len)
  const b = resolveIndex(end, len)
  if (a <= b) return chars.slice(Math.max(a, 0), Math.max(b + 1, 0)).join('')
  return chars.slice(0, Math.max(b + 1, 0)).join('') + chars.slice(Math.min(a, len)).join('')
}

function deleteLslSubString(src: string, start: number, end: number): string {
  const chars = [...src]
  const len = chars.length
  const a = resolveIndex(start, len)
  const b = resolveIndex(end, len)
  if (a <= b) {
    return chars.slice(0, Math.max(a, 0)).join('') + chars.slice(Math.max(b + 1, 0)).join('')
  }
  return chars.slice(Math.max(b + 1, 0), Math.min(a, len)).join('')
}
