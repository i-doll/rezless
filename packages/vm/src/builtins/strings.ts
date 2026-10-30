import type { BuiltinImpl } from '../runtime.js'
import { decodeUtf8Lenient } from './base64.js'
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
  [...((args[0] as string | undefined) ?? '')]
    .map((ch) => {
      const up = ch.toUpperCase()
      return [...up].length > 1 ? ch : up
    })
    .join('')

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
  const bytes: number[] = []
  let i = 0
  while (i < src.length) {
    if (src[i] !== '%') {
      bytes.push(...Buffer.from(String.fromCodePoint(src.codePointAt(i)!), 'utf8'))
      i += src.codePointAt(i)! > 0xffff ? 2 : 1
      continue
    }
    if (i + 2 >= src.length) break
    const hex = src.slice(i + 1, i + 3)
    if (!/^[0-9a-fA-F]{2}$/.test(hex)) return ''
    bytes.push(parseInt(hex, 16))
    i += 3
  }
  const nul = bytes.indexOf(0)
  return decodeUtf8Lenient(Uint8Array.from(nul < 0 ? bytes : bytes.slice(0, nul)))
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

/** llOrd(string val, integer index) — code point at index (negative counts from the end), or 0. */
export const llOrd: BuiltinImpl = (_ctx, args) => {
  const chars = [...((args[0] as string | undefined) ?? '')]
  const index = (args[1] as number | undefined) ?? 0
  return chars[resolveIndex(index, chars.length)]?.codePointAt(0) ?? 0
}

/** llChar(integer val) — the character for a code point; 0 gives "" and invalid code points U+FFFD. */
export const llChar: BuiltinImpl = (_ctx, args) => {
  const code = (args[0] as number | undefined) ?? 0
  if (code === 0) return ''
  if (code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '\ufffd'
  return String.fromCodePoint(code)
}

/** llHash(string val) — sdbm hash (multiplier 65599) over the UTF-8 bytes. */
export const llHash: BuiltinImpl = (_ctx, args) => {
  let h = 0
  for (const b of Buffer.from((args[0] as string | undefined) ?? '', 'utf8')) {
    h = (Math.imul(h, 65599) + b) | 0
  }
  return h
}
