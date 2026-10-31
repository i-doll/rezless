import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { Prim } from '../prim.js'
import type { LslValue } from '../values/types.js'
import { isVector, NULL_KEY } from '../values/types.js'
import { listElementType, sliceList } from '../values/list-types.js'
import { InventoryType } from '../inventory.js'
import { PSYS_SRC_TEXTURE } from '../generated/constants.js'

const integers = new Set([0, 9, 15, 24, 25])
const floats = new Set([2, 4, 7, 10, 11, 13, 16, 17, 18, 19, 22, 23, 26, 27])
const vectors = new Set([1, 3, 5, 6, 8, 21])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function integer(rules: ReadonlyArray<LslValue>, index: number): boolean {
  const type = listElementType(rules, index)
  return type === 'integer' || (type === undefined && typeof rules[index] === 'number' && Number.isInteger(rules[index]))
}

// Unknown/noninteger rule ids and incomplete tails are ignored. A wrong value
// type for a known rule disables the entire emitter, without DEBUG_CHANNEL chat.
function valid(rules: ReadonlyArray<LslValue>): boolean {
  for (let i = 0; i + 1 < rules.length; i += 2) {
    if (!integer(rules, i)) continue
    const rule = rules[i] as number
    const value = rules[i + 1]!
    if (integers.has(rule) && !integer(rules, i + 1)) return false
    if (floats.has(rule) && typeof value !== 'number') return false
    if (vectors.has(rule) && !isVector(value)) return false
    if ((rule === PSYS_SRC_TEXTURE || rule === 20) && typeof value !== 'string') return false
  }
  return true
}

function texture(prim: Prim, rules: ReadonlyArray<LslValue>): string {
  let name = ''
  for (let i = 0; i + 1 < rules.length; i += 2) {
    if (integer(rules, i) && rules[i] === PSYS_SRC_TEXTURE) name = rules[i + 1] as string
  }
  if (UUID.test(name)) return name.toLowerCase()
  return prim.inventory.find(item => item.type === InventoryType.TEXTURE && item.name === name)?.key.toLowerCase() ?? NULL_KEY
}

function set(prim: Prim, rules: ReadonlyArray<LslValue>): void {
  prim.particles = rules.length === 0 || !valid(rules)
    ? null
    : { rules: sliceList(rules, 0), texture: texture(prim, rules) }
}

function targets(ctx: CallContext, link: number): Prim[] {
  if (link < -4) {
    const other = ctx.linkset.prims.find(prim => prim !== ctx.prim)
    return other ? [other] : []
  }
  if (link === 0 && ctx.prim.linkNumber > 1) return [ctx.linkset.prims[0]!]
  return ctx.linkset.resolveTargets(ctx.prim.linkNumber, link)
}

export const llParticleSystem: BuiltinImpl = (ctx, args) => {
  set(ctx.prim, args[0] as ReadonlyArray<LslValue>)
  return undefined
}

export const llLinkParticleSystem: BuiltinImpl = (ctx, args) => {
  for (const prim of targets(ctx, args[0] as number)) set(prim, args[1] as ReadonlyArray<LslValue>)
  return undefined
}
