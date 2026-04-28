import type { BuiltinImpl } from '../runtime.js'
import { LINK_THIS } from '../linkset.js'

/**
 * Captured llMessageLinked invocation. The per-script state.linkedMessages
 * holds invocations originating from one script; the linkset.linkedMessages
 * cross-script capture mirrors all invocations across the linkset.
 */
export interface LinkedMessageEntry {
  readonly target: number
  readonly num: number
  readonly str: string
  readonly id: string
}

/**
 * llMessageLinked(integer link, integer num, string str, key id)
 *
 * Resolves `link` (LINK_THIS / LINK_SET / LINK_ALL_OTHERS / LINK_ALL_CHILDREN /
 * LINK_ROOT / specific link number) relative to the calling prim's link
 * number, then schedules a `link_message` event on every targeted script
 * with `sender_num` = caller's link number. Records the call on both the
 * per-script and linkset-wide capture arrays.
 */
export const llMessageLinked: BuiltinImpl = (ctx, args) => {
  const target = (args[0] as number | undefined) ?? LINK_THIS
  const num = (args[1] as number | undefined) ?? 0
  const str = (args[2] as string | undefined) ?? ''
  const id = (args[3] as string | undefined) ?? ''
  ctx.state.linkedMessages.push({ target, num, str, id })
  ctx.linkset.deliverLinkMessage(ctx.prim.linkNumber, target, num, str, id)
  return undefined
}
