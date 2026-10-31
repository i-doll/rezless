import { describe, it, expect } from 'vitest'
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto'
import { loadScript } from '../src/index.js'

// Expected values follow https://wiki.secondlife.com/wiki/LlSignRSA and
// https://wiki.secondlife.com/wiki/LlVerifyRSA, whose example key pair is used here.
// In-world: probes on Aditi, SLua Tombolo, Mono (2026-10-31). Each probe signed or
// verified in state_entry and said the result on a channel. Signatures are compared by
// fp(): the first 8 hex digits of their SHA-1 and their length. Nothing reached
// DEBUG_CHANNEL in any probe.

const WIKI_PRIVATE = `-----BEGIN RSA PRIVATE KEY-----
MIIEogIBAAKCAQEAqxXSIhFHzYO9UNEUvMMXwhB4vf32fPirCxxV/w4m88jKPmFH
QQe9DOwj7illmvg+81vzBNGt+uNYy/2zFegUtwvxKCEioeoanRpPcvn9r/d/kXad
WL/DyKJwHbF1EtTfPAZSl6ZIBIYis8HQ/RAln3olS705AmCKBRkbz3cZ+dTzqX1v
7ohqqPPoCaXQFgLTMYnqU8ZTsq1Sl8BwKK735HPmKLCEjZaMn97lvzGHufY/JdRs
dwdRHqKnpe2w2c0AzNpQtjoRCnPtj7cFgCeztjAcbdtuS8ipJTEIuBLWHCVVXIlD
DQ6jJvIEW7tt+6kde/NUskRASd7Rtoy5AeS7cwIDAQABAoIBABwvix/7stWj55Oh
7oWuqoJZTlsWtP4fxaYd8/kCLt6o7NDcG+4VxUqUuNKq1UdzsINNWbsohD46KE3r
LQ7l3kvN1twioV8Ff370b7RkhSvxXX3sib2uUiYCxO/PZZdFpMVx0TeUuHauVpdA
zhpzB4+/gtd4hCTlHLf8S/2hBJGJA9e37Vo3MqXh43QRFTD8pgjb0mUWa4xJeZlz
3vGmQl0uMS04wX+r7Pq1HKs7gk93WeLrNhEQgRwUPgumrMGHey9eF1kDb14m3O7Z
qWU7MWWME2lxcUV0YT/iHPfvStvLHiEdi1z2TGKkMmlHX7RGpk7Js5GGQfeEKEsv
ihXuFmkCgYEA2y6V2+HCmViA8V1qY907z5dvG3ar9zbm3qfcJDJFoNOzDZNU0NRJ
eZu/LhwTHW7PArAuWhxh7ENu9Bhl5FjvMuyqrMPud1Tf0GsrYKQJITgbW6IC6w/N
a+2ZMm6VDCztS5MNNmWRCTTEecd4lnPLfyX9XYfUvUovzv5mM65Hzl0CgYEAx9Ly
RR1tkjgiIJHmpv95MkaHg4O4NZT0eiyykRz1qENESZOtJ00l+/p4vZSOdQjwPl+q
vjMhlZc9a2292UEy3BsBOPB/nJybLXBDFa0KYUCc3/aHGSgq+ZbUKNhdBq2c83hb
Dpw2ajHluLtXO7D4kDGvEDLPN+/19NElI6EL9A8CgYAVRu5xS/cyH69UvvbG/wEB
Y/f7OIf1FbVPxAfQ07iCpkppdPX018bSMVZbyYnpf4pE/olhYgP3hYxN0diCVEfU
L7lZ0CNkHi8j8mNhnErumJ2/RXj3DK+qXIRUqvt5FRtsDLhpoW508FRqZfzEzjTh
APUZkUgLoBoIBBYzyiVaWQKBgD3GvHmbmHVc/0f8c0drsedWIK0K+tct3ssqqGXu
gw/rA+CPVDfTRQv6qntJwyTxh3xxDRNSMW7S2/0rZ0cUPgoIGz+kMn+TdvH8Q/Ee
lxfr5tPinm+rmGWjOKIMCe53nA81RUlmB/iaxn9vA5ADrUS+53Vlj+SmPe7a/dVf
A5gHAoGAbS4sMlUkUd449PT33rqx26aNKkKLI9PLxgWE7YBfwzaUkG0MBryQqP5L
aIY2a+8ZvUeHxmY0oQfPQkH5KKbAaC0ozaXf+3qX0Gfkt8vxsh41ON5esr0tfcm2
BFdQrdBOACefo2kOFfdMSP6KWKI3HZMJAr9SDcAiL23IQZ/wl/c=
-----END RSA PRIVATE KEY-----`

const WIKI_PUBLIC = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqxXSIhFHzYO9UNEUvMMX
whB4vf32fPirCxxV/w4m88jKPmFHQQe9DOwj7illmvg+81vzBNGt+uNYy/2zFegU
twvxKCEioeoanRpPcvn9r/d/kXadWL/DyKJwHbF1EtTfPAZSl6ZIBIYis8HQ/RAl
n3olS705AmCKBRkbz3cZ+dTzqX1v7ohqqPPoCaXQFgLTMYnqU8ZTsq1Sl8BwKK73
5HPmKLCEjZaMn97lvzGHufY/JdRsdwdRHqKnpe2w2c0AzNpQtjoRCnPtj7cFgCez
tjAcbdtuS8ipJTEIuBLWHCVVXIlDDQ6jJvIEW7tt+6kde/NUskRASd7Rtoy5AeS7
cwIDAQAB
-----END PUBLIC KEY-----`

const MSG = 'Hello, Avatar!'
const EMPTY = 'da39a3ee:0'

const wiki = createPrivateKey(WIKI_PRIVATE)
const PKCS8_PRIVATE = wiki.export({ type: 'pkcs8', format: 'pem' }) as string
const PKCS1_PUBLIC = createPublicKey(wiki).export({ type: 'pkcs1', format: 'pem' }) as string
const ENCRYPTED_PRIVATE = wiki.export({ type: 'pkcs8', format: 'pem', cipher: 'aes-128-cbc', passphrase: 'pw' }) as string

const lit = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"'

async function lsl(expr: string, strings: Record<string, string> = {}) {
  const globals = Object.entries({ WP: WIKI_PRIVATE, PUB: WIKI_PUBLIC, MSG, ...strings })
    .map(([name, value]) => `string ${name} = ${lit(value)};`)
    .join('\n')
  const s = await loadScript({
    source: `${globals}
      list out;
      string fp(string s) { return llGetSubString(llSHA1String(s), 0, 7) + ":" + (string)llStringLength(s); }
      default { state_entry() { string A = llSignRSA(WP, MSG, "sha1"); out = [${expr}]; } }`,
  })
  s.start()
  return (s.global('out') as unknown[])[0]
}

describe('llSignRSA', () => {
  // In-world: llSignRSA(WP, "Hello, Avatar!", "sha1") -> ba0023bb:344, starting
  // "SgqafXI/M70FJr5th0VR3U36L" as the wiki example says; llGetTime() read 0.0 after it.
  it('signs the wiki example with PKCS #1 v1.5 and returns Base64', async () => {
    expect(await lsl('fp(A)')).toBe('ba0023bb:344')
    expect(await lsl('llGetSubString(A, 0, 24)')).toBe('SgqafXI/M70FJr5th0VR3U36L')
    expect(await lsl('llGetSubString(A, -4, -1)')).toBe('Bg==')
  })

  it('takes no time', async () => {
    expect(await lsl('llGetTime()')).toBe(0)
  })

  // In-world: sha224 -> 6108c6e9:344, sha256 -> d31670c6:344, sha384 -> df71adeb:344,
  // sha512 -> 0ed1c27f:344, "SHA256" -> d31670c6:344, "Sha512" -> 0ed1c27f:344.
  it.each([
    ['sha224', '6108c6e9:344'],
    ['sha256', 'd31670c6:344'],
    ['sha384', 'df71adeb:344'],
    ['sha512', '0ed1c27f:344'],
    ['SHA256', 'd31670c6:344'],
    ['Sha512', '0ed1c27f:344'],
  ])('signs with %s, in any case', async (algorithm, expected) => {
    expect(await lsl(`fp(llSignRSA(WP, MSG, "${algorithm}"))`)).toBe(expected)
  })

  // In-world: md5, "", md5_sha1, sha3-256, SHA-256, " sha256", sha512-256 and ripemd160
  // all returned "" with no error.
  it.each(['md5', '', 'md5_sha1', 'sha3-256', 'SHA-256', ' sha256', 'sha512-256', 'ripemd160'])(
    'returns "" for the algorithm "%s"',
    async (algorithm) => {
      expect(await lsl(`fp(llSignRSA(WP, MSG, "${algorithm}"))`)).toBe(EMPTY)
    },
  )

  // In-world: "héllo ✓" with sha256 -> 5c1c97f4:344 (its UTF-8 bytes), "" -> 448f094c:344.
  it('signs the UTF-8 bytes of the message, and an empty message', async () => {
    expect(await lsl('fp(llSignRSA(WP, "héllo ✓", "sha256"))')).toBe('5c1c97f4:344')
    expect(await lsl('fp(llSignRSA(WP, "", "sha256"))')).toBe('448f094c:344')
  })

  // In-world: the same key as "BEGIN PRIVATE KEY" (PKCS #8) -> ba0023bb:344.
  it('takes a PKCS #8 private key', async () => {
    expect(await lsl('fp(llSignRSA(P8, MSG, "sha1"))', { P8: PKCS8_PRIVATE })).toBe('ba0023bb:344')
  })

  // In-world: every one of these gave ba0023bb:344 -- all newlines removed, newlines
  // replaced by CR LF, by spaces or by tabs, the body lines joined with spaces, the
  // PKCS #8 key on one line, text before the BEGIN line, text after the END line, and
  // "END PRIVATE KEY" closing a "BEGIN RSA PRIVATE KEY" key.
  it.each([
    ['on one line', WIKI_PRIVATE.replace(/\n/g, '')],
    ['with CR LF line ends', WIKI_PRIVATE.replace(/\n/g, '\r\n')],
    ['with spaces for newlines', WIKI_PRIVATE.replace(/\n/g, ' ')],
    ['with tabs for newlines', WIKI_PRIVATE.replace(/\n/g, '\t')],
    ['as PKCS #8 on one line', PKCS8_PRIVATE.replace(/\n/g, '')],
    ['after other text', '  \njunk\n' + WIKI_PRIVATE],
    ['followed by other text', WIKI_PRIVATE + '\ntrailing'],
    ['whose END line names another format', WIKI_PRIVATE.replace('END RSA PRIVATE KEY', 'END PRIVATE KEY')],
  ])('reads a key %s', async (_label, key) => {
    expect(await lsl('fp(llSignRSA(K, MSG, "sha1"))', { K: key })).toBe('ba0023bb:344')
  })

  // In-world: "x", "", the body without its BEGIN and END lines, the public key, an EC
  // private key (SEC 1 or PKCS #8), a passphrase-protected PKCS #8 key, the key with its
  // second-to-last body line removed, and the key with "!" in its body all returned ""
  // with no error.
  it.each([
    ['x', 'x'],
    ['an empty key', ''],
    ['the body alone', WIKI_PRIVATE.split('\n').slice(1, -1).join('\n')],
    ['a public key', WIKI_PUBLIC],
    ['an EC key', generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'sec1', format: 'pem' }) as string],
    ['an encrypted key', ENCRYPTED_PRIVATE],
    ['an EC key in PKCS #8', generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string],
    ['a cut key', [...WIKI_PRIVATE.split('\n').slice(0, -2), '-----END RSA PRIVATE KEY-----'].join('\n')],
    ['a key with "!" in it', WIKI_PRIVATE.replace('MIIEog', 'MIIE!og')],
  ])('returns "" for %s', async (_label, key) => {
    expect(await lsl('fp(llSignRSA(K, MSG, "sha1"))', { K: key })).toBe(EMPTY)
  })

  // In-world: a 512-bit key gave an 88-character signature with sha1 and "" with sha512,
  // whose digest doesn't fit; a 1024-bit key gave 172 characters that llVerifyRSA accepted.
  it('signs with smaller keys, and returns "" when the digest does not fit', async () => {
    const small = generateKeyPairSync('rsa', { modulusLength: 512 }).privateKey.export({ type: 'pkcs1', format: 'pem' }) as string
    const pair = generateKeyPairSync('rsa', { modulusLength: 1024 })
    const strings = {
      K: small,
      P: pair.privateKey.export({ type: 'pkcs1', format: 'pem' }) as string,
      Q: pair.publicKey.export({ type: 'spki', format: 'pem' }) as string,
    }
    expect(await lsl('llStringLength(llSignRSA(K, MSG, "sha1"))', strings)).toBe(88)
    expect(await lsl('llSignRSA(K, MSG, "sha512")', strings)).toBe('')
    expect(await lsl('llStringLength(llSignRSA(P, MSG, "sha256"))', strings)).toBe(172)
    expect(await lsl('llVerifyRSA(Q, MSG, llSignRSA(P, MSG, "sha256"), "sha256")', strings)).toBe(1)
  })
})

describe('llVerifyRSA', () => {
  const verify = (sig: string, extra: Record<string, string> = {}, key = 'PUB', algorithm = 'sha1') =>
    lsl(`llVerifyRSA(${key}, MSG, ${sig}, "${algorithm}")`, extra)

  // In-world: V1 -> 1, a changed message -> 0, sha256 for a sha1 signature -> 0, "SHA1" -> 1.
  it('accepts a matching signature and rejects a changed message or algorithm', async () => {
    expect(await verify('A')).toBe(1)
    expect(await lsl('llVerifyRSA(PUB, MSG + "x", A, "sha1")')).toBe(0)
    expect(await verify('A', {}, 'PUB', 'sha256')).toBe(0)
    expect(await verify('A', {}, 'PUB', 'SHA1')).toBe(1)
    expect(await verify('A', {}, 'PUB', '')).toBe(0)
  })

  // In-world: a sha256 signature made outside Second Life verified (1); an md5 one gave 0.
  it('accepts a signature made elsewhere, but not with md5', async () => {
    const S = sign('sha256', Buffer.from(MSG), WIKI_PRIVATE).toString('base64')
    const M = sign('md5', Buffer.from(MSG), WIKI_PRIVATE).toString('base64')
    expect(await verify('S', { S }, 'PUB', 'sha256')).toBe(1)
    expect(await verify('M', { M }, 'PUB', 'md5')).toBe(0)
  })

  // In-world: the public key with every newline removed -> 1; "BEGIN RSA PUBLIC KEY"
  // (PKCS #1) -> 0; the private key -> 0; "x" -> 0; an EC key with an ECDSA signature -> 0;
  // the public key with "MIIBIjAN" changed to "MIIBIjAA" -> 0.
  it('takes only an RSA public key in "BEGIN PUBLIC KEY" form', async () => {
    const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const strings = {
      ONE: WIKI_PUBLIC.replace(/\n/g, ''),
      P1: PKCS1_PUBLIC,
      ECPUB: ec.publicKey.export({ type: 'spki', format: 'pem' }) as string,
      ECSIG: sign('sha256', Buffer.from(MSG), ec.privateKey).toString('base64'),
      BAD: WIKI_PUBLIC.replace('MIIBIjAN', 'MIIBIjAA'),
    }
    expect(await verify('A', strings, 'ONE')).toBe(1)
    expect(await verify('A', strings, 'P1')).toBe(0)
    expect(await verify('A', strings, 'WP')).toBe(0)
    expect(await verify('A', strings, '"x"')).toBe(0)
    expect(await verify('ECSIG', strings, 'ECPUB', 'sha256')).toBe(0)
    expect(await verify('A', strings, 'BAD')).toBe(0)
  })

  // In-world, signature A with: padding removed -> 1; "QUJD", "A", "!!" or "\n" after the
  // padding -> 1; the last data character "g" changed to "h" (only unused bits differ),
  // with or without its padding -> 1; a space in place of the padding -> 1.
  it('reads the signature up to the first character outside the Base64 alphabet', async () => {
    for (const sig of [
      'llGetSubString(A, 0, -3)',
      'A + "QUJD"',
      'A + "A"',
      'A + "!!"',
      'A + "\\n"',
      'llGetSubString(A, 0, -4) + "h=="',
      'llGetSubString(A, 0, -4) + "h"',
      'llGetSubString(A, 0, -3) + " "',
    ]) {
      expect(await verify(sig), sig).toBe(1)
    }
  })

  // In-world, signature A with: "!" in front -> 0; "\n", " ", "=" or "!" inserted at 100
  // -> 0; the last 4 characters cut -> 0; "-" and "_" for "+" and "/" -> 0; "A" in front
  // -> 0; "QUJD", "AAAA" or "QQ==" after it in place of the padding (extra bytes) -> 0;
  // "" -> 0; "!!!" -> 0.
  it('rejects a signature whose decoded bytes are not exactly the signature', async () => {
    for (const sig of [
      '"!" + A',
      'llInsertString(A, 100, "\\n")',
      'llInsertString(A, 100, " ")',
      'llInsertString(A, 100, "=")',
      'llInsertString(A, 100, "!")',
      'llGetSubString(A, 0, -5)',
      'llReplaceSubString(llReplaceSubString(A, "/", "_", 0), "+", "-", 0)',
      '"A" + A',
      'llGetSubString(A, 0, -3) + "QUJD"',
      'llGetSubString(A, 0, -3) + "AAAA"',
      'llGetSubString(A, 0, -3) + "QQ=="',
      '""',
      '"!!!"',
    ]) {
      expect(await verify(sig), sig).toBe(0)
    }
  })
})
