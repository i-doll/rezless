import type { BuiltinImpl } from '../runtime.js'
import { PUBLIC_CHANNEL } from '../generated/constants.js'

/** llSay(integer channel, string msg) — captures into ScriptState.chat. */
export const llSay: BuiltinImpl = (ctx, args) => {
  const channel = (args[0] as number | undefined) ?? 0
  const text = (args[1] as string | undefined) ?? ''
  ctx.state.chat.push({ channel, text, type: 'say' })
  return undefined
}

/** llShout(integer channel, string msg) */
export const llShout: BuiltinImpl = (ctx, args) => {
  ctx.state.chat.push({
    channel: (args[0] as number | undefined) ?? 0,
    text: (args[1] as string | undefined) ?? '',
    type: 'shout',
  })
  return undefined
}

/** llWhisper(integer channel, string msg) */
export const llWhisper: BuiltinImpl = (ctx, args) => {
  ctx.state.chat.push({
    channel: (args[0] as number | undefined) ?? 0,
    text: (args[1] as string | undefined) ?? '',
    type: 'whisper',
  })
  return undefined
}

/** llOwnerSay(string msg) — channel 0 by convention; LSL routes it privately to the owner. */
export const llOwnerSay: BuiltinImpl = (ctx, args) => {
  ctx.state.chat.push({
    channel: PUBLIC_CHANNEL,
    text: (args[0] as string | undefined) ?? '',
    type: 'ownerSay',
  })
  return undefined
}
