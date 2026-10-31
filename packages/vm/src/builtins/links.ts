import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { Prim } from '../prim.js'
import { LINK_THIS, PERMISSION_CHANGE_LINKS } from '../generated/constants.js'
import { findObjectPrim } from './object-reads.js'

const mayChangeLinks = (ctx: CallContext) => (ctx.state.permissions.granted & PERMISSION_CHANGE_LINKS) !== 0

/**
 * llCreateLink(key target, integer parent) — link the object holding prim
 * `target` with this one. With `parent` TRUE this object stays root and the
 * target's prims go in from link 2; with FALSE the target's root becomes root
 * and this object's prims go in from link 2. A target in this object only
 * raises changed. A key with no prim, or no PERMISSION_CHANGE_LINKS, does
 * nothing, with no error.
 */
export const llCreateLink: BuiltinImpl = (ctx, args) => {
  if (!mayChangeLinks(ctx)) return undefined
  const target = findObjectPrim(ctx, (args[0] as string | undefined) ?? '')?.linkset
  if (!target) return undefined
  const parent = (args[1] as number | undefined) ?? 0
  if (parent !== 0) ctx.linkset.absorb(target)
  else target.absorb(ctx.linkset)
  return undefined
}

/**
 * llBreakLink(integer link) — break the prim at `link` out of the linkset.
 * LINK_THIS reads as the root and any other negative number as link 2; 0
 * and numbers past the last prim do nothing. Without
 * PERMISSION_CHANGE_LINKS nothing happens, with no error.
 */
export const llBreakLink: BuiltinImpl = (ctx, args) => {
  if (!mayChangeLinks(ctx)) return undefined
  const link = (args[0] as number | undefined) ?? 0
  const prims = ctx.linkset.prims
  let prim: Prim | undefined
  if (link === LINK_THIS) prim = prims[0]
  else if (link < 0) prim = prims[1]
  else if (link > 0) prim = prims[link - 1]
  if (prim) ctx.linkset.breakOff(prim)
  return undefined
}

/** llBreakAllLinks() — break every prim apart. Without PERMISSION_CHANGE_LINKS nothing happens. */
export const llBreakAllLinks: BuiltinImpl = (ctx) => {
  if (mayChangeLinks(ctx)) ctx.linkset.breakAll()
  return undefined
}
