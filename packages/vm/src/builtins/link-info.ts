import type { BuiltinImpl } from '../runtime.js'
import { LINK_THIS } from '../generated/constants.js'
import { NULL_KEY } from '../values/types.js'

/** llGetLinkNumber() — calling prim's link number. 0 for a lone unlinked prim. */
export const llGetLinkNumber: BuiltinImpl = (ctx) => ctx.prim.linkNumber

/** llGetNumberOfPrims() — the prims plus the avatars seated on the object. */
export const llGetNumberOfPrims: BuiltinImpl = (ctx) => ctx.linkset.prims.length + ctx.linkset.sitters().length

/** llGetLinkKey(integer link) — UUID of the prim or seated avatar at `link`, or NULL_KEY. */
export const llGetLinkKey: BuiltinImpl = (ctx, args) =>
  findLink(ctx, (args[0] as number | undefined) ?? 0)?.key ?? NULL_KEY

/** llGetLinkName(integer link) — name of the prim or seated avatar at `link`, or NULL_KEY. */
export const llGetLinkName: BuiltinImpl = (ctx, args) =>
  findLink(ctx, (args[0] as number | undefined) ?? 0)?.name ?? NULL_KEY

function findLink(ctx: Parameters<BuiltinImpl>[0], link: number) {
  if (link === 0) return ctx.prim.linkNumber === 1 ? undefined : ctx.linkset.prims[0]
  if (link === LINK_THIS) return ctx.prim
  // Any other negative number reads the first link that is not the caller.
  return ctx.linkset.linkAt(link < 0 ? (ctx.prim.linkNumber > 1 ? 1 : 2) : link)
}
