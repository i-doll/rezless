import type { CallContext } from '../runtime.js'
import { DEBUG_CHANNEL } from '../generated/constants.js'
import { isPrim, type Link } from '../linkset.js'

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
