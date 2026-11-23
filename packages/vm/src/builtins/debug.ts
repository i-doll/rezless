import type { CallContext } from '../runtime.js'
import { DEBUG_CHANNEL } from '../generated/constants.js'
import { isPrim, type Link } from '../linkset.js'
import { formatG } from '../prim-params.js'

/**
 * Report a non-fatal script error the way the simulator does: a say on
 * DEBUG_CHANNEL. `speaker` is the link that says it when that is not the
 * script's prim: another prim of the object, or an avatar seated on it.
 * With `heard` false only the owner sees it: scripts listening on
 * DEBUG_CHANNEL don't hear it.
 */
export function sayError(ctx: CallContext, text: string, speaker: Link = ctx.prim, heard = true): void {
  ctx.state.chat.push({ channel: DEBUG_CHANNEL, text, type: 'say', ...(speaker === ctx.prim ? {} : { from: speaker.key }) })
  if (!heard) return
  if (isPrim(speaker)) ctx.linkset.routeChat(speaker, 'say', DEBUG_CHANNEL, text)
  else ctx.linkset.routeAvatarSay(speaker, DEBUG_CHANNEL, text)
}

/**
 * Say an error to the owner only. Said by any link but the root, a child
 * prim or a seated avatar, it ends with the root's name and position, or
 * the wearer's position for a worn object.
 */
export function sayOwnerError(ctx: CallContext, text: string, speaker: Link = ctx.prim): void {
  const root = ctx.linkset.prims[0]!
  // In-world: a worn object's suffix gives its wearer's position, whatever the root's offset.
  const at = ctx.linkset.wearer?.position ?? root.regionPosition()
  const suffix = speaker === root ? '' : ` {RootName ${root.name}, RootPosition { ${[at.x, at.y, at.z].map((v) => formatG(Math.fround(v))).join(', ')} }}`
  sayError(ctx, text + suffix, speaker, false)
}
