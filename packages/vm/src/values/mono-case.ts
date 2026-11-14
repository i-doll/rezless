import { lowerPairs, upperPairs } from './case-tables.js'

function toMap(pairs: ReadonlyArray<number>): Map<number, number> {
  const m = new Map<number, number>()
  for (let i = 0; i < pairs.length; i += 2) m.set(pairs[i]!, pairs[i + 1]!)
  return m
}

let lower: Map<number, number> | null = null
let upper: Map<number, number> | null = null

function mapCase(s: string, table: Map<number, number>): string {
  let out = ''
  for (const ch of s) {
    const mapped = table.get(ch.codePointAt(0)!)
    out += mapped === undefined ? ch : String.fromCodePoint(mapped)
  }
  return out
}

/** llToLower: Mono 2.6's invariant lower-casing, one codepoint at a time. */
export function monoToLower(s: string): string {
  lower ??= toMap(lowerPairs)
  return mapCase(s, lower)
}

/** llToUpper: Mono 2.6's invariant upper-casing, one codepoint at a time. */
export function monoToUpper(s: string): string {
  upper ??= toMap(upperPairs)
  return mapCase(s, upper)
}
