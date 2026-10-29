import { createHash, createHmac } from 'node:crypto'
import type { BuiltinImpl } from '../runtime.js'

/**
 * Hash and HMAC builtins. LSL uses UTF-8 byte representation of strings as
 * input; Node's crypto handles that naturally with `update(str, 'utf8')`.
 */

const lowerHex = (h: import('node:crypto').Hash | import('node:crypto').Hmac) => h.digest('hex')

export const llMD5String: BuiltinImpl = (_ctx, args) => {
  const message = (args[0] as string | undefined) ?? ''
  const nonce = (args[1] as number | undefined) ?? 0
  // LSL: llMD5String("foo", 1) digests "foo:1"
  const h = createHash('md5')
  h.update(`${message}:${nonce}`, 'utf8')
  return lowerHex(h)
}

export const llSHA1String: BuiltinImpl = (_ctx, args) => {
  const message = (args[0] as string | undefined) ?? ''
  return lowerHex(createHash('sha1').update(message, 'utf8'))
}

export const llSHA256String: BuiltinImpl = (_ctx, args) => {
  const message = (args[0] as string | undefined) ?? ''
  return lowerHex(createHash('sha256').update(message, 'utf8'))
}

export const llHMAC: BuiltinImpl = (_ctx, args) => {
  const key = (args[0] as string | undefined) ?? ''
  const message = (args[1] as string | undefined) ?? ''
  const algo = ((args[2] as string | undefined) ?? 'sha256').toLowerCase()
  const supported = new Set(['md5', 'sha1', 'sha224', 'sha256', 'sha384', 'sha512'])
  if (!supported.has(algo)) return ''
  // Per the LSL definitions: llHMAC returns the *Base64*-encoded HMAC, unlike the other
  // hash builtins which return lowercase hex.
  return createHmac(algo, key).update(message, 'utf8').digest('base64')
}
