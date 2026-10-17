import type { BuiltinImpl } from '../runtime.js'
import { toInt32 } from '../values/types.js'

/**
 * Base64 encode/decode builtins. LSL's base64 alphabet matches RFC 4648
 * standard (Node's `Buffer` default). Padding behaviour: LSL pads with `=`,
 * which Buffer also produces.
 */

export const llStringToBase64: BuiltinImpl = (_ctx, args) => {
  const s = (args[0] as string | undefined) ?? ''
  return Buffer.from(s, 'utf8').toString('base64')
}

export const llBase64ToString: BuiltinImpl = (_ctx, args) => {
  const s = (args[0] as string | undefined) ?? ''
  // LSL silently tolerates malformed input; Buffer does too.
  return Buffer.from(s, 'base64').toString('utf8')
}

/**
 * llIntegerToBase64(integer x) — encodes the 32-bit big-endian
 * representation of x as 6 base64 chars (24 bits → 4 chars × 6 bits, padded
 * to 4 chars per encoding round). LSL's specific output is 8 chars: e.g.
 *   llIntegerToBase64(0)    → "AAAAAA=="
 *   llIntegerToBase64(0xFF) → "AAAA/w=="  (no — actually "/w==" right-aligned)
 *
 * The reference output is the standard base64 encoding of the 4-byte
 * big-endian integer.
 */
export const llIntegerToBase64: BuiltinImpl = (_ctx, args) => {
  const x = toInt32((args[0] as number | undefined) ?? 0)
  const buf = Buffer.alloc(4)
  buf.writeInt32BE(x, 0)
  return buf.toString('base64')
}

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/**
 * Decodes base64 the way Second Life does for llXorBase64: reading stops at
 * the first character outside `A-Z a-z 0-9 + /` (so `=` ends it too), and
 * bits left over after the last whole byte are dropped. `Buffer.from(s,
 * 'base64')` is more lenient (skips spaces, accepts `-` `_`), so it can't be
 * used here.
 */
function decodeBase64Strict(s: string): Uint8Array {
  const bytes: number[] = []
  let bits = 0
  let nbits = 0
  for (const ch of s) {
    const v = BASE64_ALPHABET.indexOf(ch)
    if (v < 0) break
    bits = ((bits << 6) | v) & 0xffff
    nbits += 6
    if (nbits >= 8) {
      nbits -= 8
      bytes.push((bits >> nbits) & 0xff)
    }
  }
  return Uint8Array.from(bytes)
}

/**
 * llXorBase64(string str1, string str2) — xors the bytes of str1 with the
 * bytes of str2, repeating str2 as needed. An empty key leaves str1 as is.
 */
export const llXorBase64: BuiltinImpl = (_ctx, args) => {
  const data = decodeBase64Strict((args[0] as string | undefined) ?? '')
  const key = decodeBase64Strict((args[1] as string | undefined) ?? '')
  const out =
    key.length === 0 ? data : data.map((byte, i) => byte ^ key[i % key.length]!)
  return Buffer.from(out).toString('base64')
}

/**
 * llBase64ToInteger(string s) — inverse of llIntegerToBase64.
 * Returns 0 if the input doesn't decode to at least 4 bytes.
 */
export const llBase64ToInteger: BuiltinImpl = (_ctx, args) => {
  const s = (args[0] as string | undefined) ?? ''
  const buf = Buffer.from(s, 'base64')
  if (buf.length < 4) return 0
  return buf.readInt32BE(0)
}
