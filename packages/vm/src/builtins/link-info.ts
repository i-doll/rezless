import type { BuiltinImpl } from '../runtime.js'

/** llGetLinkNumber() — calling prim's link number. 0 for a lone unlinked prim. */
export const llGetLinkNumber: BuiltinImpl = (ctx) => ctx.prim.linkNumber

/** llGetNumberOfPrims() — total prim count in the linkset. */
export const llGetNumberOfPrims: BuiltinImpl = (ctx) => ctx.linkset.prims.length

/** llGetLinkKey(integer link) — UUID of the prim at `link`, or NULL_KEY. */
export const llGetLinkKey: BuiltinImpl = (ctx, args) => {
  const link = (args[0] as number | undefined) ?? 0
  const prim = findPrim(ctx, link)
  return prim ? prim.key : '00000000-0000-0000-0000-000000000000'
}

/** llGetLinkName(integer link) — name of the prim at `link`, or empty. */
export const llGetLinkName: BuiltinImpl = (ctx, args) => {
  const link = (args[0] as number | undefined) ?? 0
  const prim = findPrim(ctx, link)
  return prim ? prim.name : ''
}

function findPrim(ctx: Parameters<BuiltinImpl>[0], link: number) {
  if (link === 0 && ctx.linkset.prims.length === 1) return ctx.linkset.prims[0]
  if (link === -4 /* LINK_THIS */) return ctx.prim
  return ctx.linkset.prims.find((p) => p.linkNumber === link)
}
