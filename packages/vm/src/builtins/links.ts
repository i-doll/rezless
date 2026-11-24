import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { Prim } from '../prim.js'
import { LINK_THIS, PERMISSION_CHANGE_LINKS, PERM_MODIFY } from '../generated/constants.js'
import { findObjectPrim } from './object-reads.js'
import { sayOwnerError } from './debug.js'
import { holdForStand } from './sit.js'

const mayChangeLinks = (ctx: CallContext) => (ctx.state.permissions.granted & PERMISSION_CHANGE_LINKS) !== 0
const ownerCanModify = (linkset: CallContext['linkset']) => (linkset.prims[0]!.permMask.owner & PERM_MODIFY) !== 0

// In-world, llBreakLink and llBreakAllLinks without the permission told the owner so on
// DEBUG_CHANNEL, from a rezzed object and a worn one alike; a listener there heard nothing.
function mayBreakLinks(ctx: CallContext): boolean {
  if (mayChangeLinks(ctx)) return true
  sayOwnerError(ctx, 'Script trying to break links but PERMISSION_CHANGE_LINKS permission not set!')
  return false
}

/**
 * llCreateLink(key target, integer parent) — link the object holding prim
 * `target` with this one. With `parent` TRUE this object stays root and the
 * target's prims go in from link 2; with FALSE the target's root becomes root
 * and this object's prims go in from link 2. A target in this object only
 * raises changed. A key with no prim, no PERMISSION_CHANGE_LINKS, a target
 * with another owner, or either object no-modify for its owner does nothing,
 * with no error. A worn object links nothing and tells its owner so.
 */
export const llCreateLink: BuiltinImpl = (ctx, args) => {
  // In-world: from a worn root or child, with or without PERMISSION_CHANGE_LINKS, the owner got
  // this on DEBUG_CHANNEL and a listener there heard nothing.
  if (ctx.linkset.attachment) {
    sayOwnerError(ctx, 'Attachments cannot link objects')
    return undefined
  }
  if (!mayChangeLinks(ctx)) return undefined
  const target = findObjectPrim(ctx, (args[0] as string | undefined) ?? '')?.linkset
  if (!target || target.owner.toLowerCase() !== ctx.linkset.owner.toLowerCase()) return undefined
  if (!ownerCanModify(ctx.linkset) || !ownerCanModify(target)) return undefined
  const parent = (args[1] as number | undefined) ?? 0
  if (parent !== 0) ctx.linkset.absorb(target)
  else target.absorb(ctx.linkset)
  return undefined
}

// In-world: in an object no-modify for its owner, with the permission granted, llBreakLink of a
// link that is there and llBreakAllLinks told the owner so; a listener on DEBUG_CHANNEL heard nothing.
function mayEdit(ctx: CallContext): boolean {
  if (ownerCanModify(ctx.linkset)) return true
  sayOwnerError(ctx, 'Unlink failed: no edit permissions.')
  return false
}

/**
 * llBreakLink(integer link) — break the prim at `link` out of the linkset.
 * LINK_THIS reads as the root and any other negative number as link 2; 0
 * and numbers past the last prim do nothing. Without
 * PERMISSION_CHANGE_LINKS nothing happens and the owner is told, whatever the
 * link; in an object no-modify for its owner the owner is told too, for a link
 * that is there. A worn object breaks nothing, with no error.
 */
export const llBreakLink: BuiltinImpl = (ctx, args) => {
  // In-world: a worn object with the permission stayed whole.
  if (!mayBreakLinks(ctx) || ctx.linkset.attachment) return undefined
  const link = (args[0] as number | undefined) ?? 0
  const prims = ctx.linkset.prims
  let prim: Prim | undefined
  if (link === LINK_THIS) prim = prims[0]
  else if (link < 0) prim = prims[1]
  else if (link > 0) prim = prims[link - 1]
  if (!prim || !mayEdit(ctx)) return undefined
  holdForStand(ctx, ctx.linkset.sitters())
  ctx.linkset.breakOff(prim, ctx.script)
  return undefined
}

/**
 * llBreakAllLinks() — break every prim apart. Without PERMISSION_CHANGE_LINKS, or in a no-modify
 * object, nothing happens and the owner is told; a worn object breaks nothing, with no error.
 */
export const llBreakAllLinks: BuiltinImpl = (ctx) => {
  if (!mayBreakLinks(ctx) || ctx.linkset.attachment || !mayEdit(ctx)) return undefined
  holdForStand(ctx, ctx.linkset.sitters())
  ctx.linkset.breakAll(ctx.script)
  return undefined
}
