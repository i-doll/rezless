import type { BuiltinImpl } from '../runtime.js'
import { NULL_KEY } from '../values/types.js'

/** llGetLinkNumber() — calling prim's link number. 0 for a lone unlinked prim. */
export const llGetLinkNumber: BuiltinImpl = (ctx) => ctx.prim.linkNumber

/** llGetNumberOfPrims() — the prims plus the avatars seated on the object. */
export const llGetNumberOfPrims: BuiltinImpl = (ctx) => ctx.linkset.prims.length + ctx.linkset.sitters().length

/** llGetLinkKey(integer link) — UUID of the prim or seated avatar at `link`, or NULL_KEY. */
export const llGetLinkKey: BuiltinImpl = (ctx, args) =>
  ctx.linkset.oneLink(ctx.prim, (args[0] as number | undefined) ?? 0)?.key ?? NULL_KEY

/** llGetLinkName(integer link) — name of the prim or seated avatar at `link`, or NULL_KEY. */
export const llGetLinkName: BuiltinImpl = (ctx, args) =>
  ctx.linkset.oneLink(ctx.prim, (args[0] as number | undefined) ?? 0)?.name ?? NULL_KEY
