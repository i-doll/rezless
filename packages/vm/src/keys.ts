import type { CallContext } from './runtime.js'

/** A stable, UUID-shaped string derived from `seed`. */
export function deterministicKey(seed: string): string {
  let h1 = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h1 ^= seed.charCodeAt(i)
    h1 = Math.imul(h1, 0x01000193) >>> 0
  }
  let h2 = (h1 ^ 0xdeadbeef) >>> 0
  for (let i = 0; i < seed.length; i++) {
    h2 ^= seed.charCodeAt(i) << (i & 31)
    h2 = Math.imul(h2, 0x01000193) >>> 0
  }
  const hex = (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).repeat(2)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/** A request key (llHTTPRequest, dataserver) that is a valid UUID, unique per script, kind and count. */
export function requestKey(ctx: CallContext, kind: string, n: number): string {
  return deterministicKey(`${ctx.prim.key}/${ctx.script.scriptName}/${kind}/${n}`)
}
