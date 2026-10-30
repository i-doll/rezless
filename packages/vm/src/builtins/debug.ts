import type { CallContext } from '../runtime.js'
import { DEBUG_CHANNEL } from '../generated/constants.js'

/** Report a non-fatal script error the way the simulator does: a shout on DEBUG_CHANNEL. */
export function shoutError(ctx: CallContext, text: string): void {
  ctx.state.chat.push({ channel: DEBUG_CHANNEL, text, type: 'shout' })
  ctx.linkset.routeChat(ctx.prim, DEBUG_CHANNEL, text)
}
