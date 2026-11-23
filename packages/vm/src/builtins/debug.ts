import type { CallContext } from '../runtime.js'
import { DEBUG_CHANNEL } from '../generated/constants.js'
import { isPrim, type Link } from '../linkset.js'
import { WindowThrottle } from '../throttle.js'

export const FLOOD = 'Too many errors... dropping further messages until the flood stops'
const floods = new WeakMap<object, { region: string | undefined; throttle: WindowThrottle }>()

// In-world a prim gets 8 errors in 16 s, counted by a sliding window over periods
// that start every 16 s on the region's clock, and shared by its scripts. The next
// one is replaced by FLOOD, and errors are dropped until the end of the following
// period, for the owner and listeners alike. Errors a second or two apart are each
// past the limit and keep it dropping, and dropped errors count towards the next
// period. An error only the owner sees counts too, but when it is the one past the
// limit it is shown as it is. An error said by another link, such as a media error
// on a child prim or a get error on a seated avatar, counts for the link that says
// it, and both lines of a script crash count. A worn object that teleports or
// crosses into another region starts that region's count afresh. Every region here
// shares the one clock, so their periods line up, where in-world each has its own.
export function flood(link: Link, now: number): 'open' | 'shuts' | 'refused' {
  const region = isPrim(link) ? link.linkset?.region : link.region
  let state = floods.get(link)
  if (!state || state.region !== region) floods.set(link, state = { region, throttle: new WindowThrottle(16_000, 8, true) })
  return state.throttle.take(now)
}

/**
 * Report a non-fatal script error the way the simulator does: a say on
 * DEBUG_CHANNEL. `speaker` is the link that says it when that is not the
 * script's prim: another prim of the object, or an avatar seated on it.
 * With `heard` false only the owner sees it: scripts listening on
 * DEBUG_CHANNEL don't hear it.
 */
export function sayError(ctx: CallContext, text: string, speaker: Link = ctx.prim, heard = true): void {
  const state = flood(speaker, ctx.state.clock.now)
  if (state === 'refused') return
  if (state === 'shuts' && heard) text = FLOOD
  ctx.state.chat.push({ channel: DEBUG_CHANNEL, text, type: 'say', ...(speaker === ctx.prim ? {} : { from: speaker.key }) })
  if (!heard) return
  if (isPrim(speaker)) ctx.linkset.routeChat(speaker, 'say', DEBUG_CHANNEL, text)
  else ctx.linkset.routeAvatarSay(speaker, DEBUG_CHANNEL, text)
}
