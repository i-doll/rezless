import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto'
import type { BuiltinImpl } from '../runtime.js'
import { decodeBase64Strict } from './base64.js'

const DIGESTS = new Set(['sha1', 'sha224', 'sha256', 'sha384', 'sha512'])

/**
 * Second Life finds the BEGIN and END lines anywhere in the string and ignores
 * all whitespace between them, so a key with its newlines stripped still reads.
 * The BEGIN line names the key format; the END line's label is not checked.
 */
function readPem(pem: string, labels: readonly string[], read: (pem: string) => KeyObject): KeyObject | null {
  const match = /-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END [A-Z ]*-----/.exec(pem)
  if (!match || !labels.includes(match[1]!)) return null
  const body = match[2]!.replace(/\s/g, '').replace(/.{1,64}/g, '$&\n')
  try {
    const key = read(`-----BEGIN ${match[1]}-----\n${body}-----END ${match[1]}-----\n`)
    return key.asymmetricKeyType === 'rsa' ? key : null
  } catch {
    return null
  }
}

export const llSignRSA: BuiltinImpl = (_ctx, args) => {
  const algorithm = ((args[2] as string | undefined) ?? '').toLowerCase()
  const key = readPem((args[0] as string | undefined) ?? '', ['RSA PRIVATE KEY', 'PRIVATE KEY'], createPrivateKey)
  if (!key || !DIGESTS.has(algorithm)) return ''
  try {
    return sign(algorithm, Buffer.from((args[1] as string | undefined) ?? '', 'utf8'), key).toString('base64')
  } catch {
    return ''
  }
}

export const llVerifyRSA: BuiltinImpl = (_ctx, args) => {
  const algorithm = ((args[3] as string | undefined) ?? '').toLowerCase()
  const key = readPem((args[0] as string | undefined) ?? '', ['PUBLIC KEY'], createPublicKey)
  if (!key || !DIGESTS.has(algorithm)) return 0
  const signature = decodeBase64Strict((args[2] as string | undefined) ?? '')
  if (signature.length !== Math.ceil(key.asymmetricKeyDetails!.modulusLength! / 8)) return 0
  return verify(algorithm, Buffer.from((args[1] as string | undefined) ?? '', 'utf8'), key, signature) ? 1 : 0
}
