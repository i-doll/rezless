import type { CallContext } from '../runtime.js'
import { DEBUG_CHANNEL } from '../generated/constants.js'

/** Report a non-fatal script error the way the simulator does: a say on DEBUG_CHANNEL. */
export function sayError(ctx: CallContext, text: string): void {
  ctx.state.chat.push({ channel: DEBUG_CHANNEL, text, type: 'say' })
  ctx.linkset.routeChat(ctx.prim, 'say', DEBUG_CHANNEL, text)
}
