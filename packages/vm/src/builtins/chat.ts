import { deliverObjectReceivedChat, deliverObjectReceivedIM } from '../rlv/received.js'
import { dispatchViewerCommand } from '../rlv/commands.js'
import type { BuiltinImpl, CallContext, ChatType, ScriptState } from '../runtime.js'
import type { Linkset } from '../linkset.js'
import type { Prim } from '../prim.js'
import { PUBLIC_CHANNEL } from '../generated/constants.js'
import { truncateUtf8 } from '../values/utf8.js'
import { sayError } from './debug.js'

const MAX_CHAT_BYTES = 1024

/** An owner-say from `prim`: in the script's chat, to the owner's viewer and RLV, cut to 1024 bytes. */
export function sayToOwner(chat: ScriptState['chat'], linkset: Linkset, prim: Prim, text: string): void {
  const entry = { channel: PUBLIC_CHANNEL, text: truncateUtf8(text, MAX_CHAT_BYTES), type: 'ownerSay' as const }
  chat.push(entry)
  dispatchViewerCommand(linkset, prim, entry.text)
  deliverObjectReceivedChat(linkset, prim, entry.type, entry.channel, entry.text)
}

function emit(ctx: CallContext, channel: number, text: string, type: ChatType, to?: string): undefined {
  if (type === 'ownerSay') {
    sayToOwner(ctx.state.chat, ctx.linkset, ctx.prim, text)
    return undefined
  }
  const entry = { channel, text: truncateUtf8(text, MAX_CHAT_BYTES), type }
  ctx.state.chat.push(to === undefined ? entry : { ...entry, to })
  if (type === 'im') deliverObjectReceivedIM(ctx.linkset, ctx.prim, to ?? '', entry.text)
  if (type !== 'im') ctx.linkset.routeChat(ctx.prim, type, channel, entry.text, to)
  return undefined
}

/** llSay(integer channel, string msg) — captures into ScriptState.chat and reaches other prims' listens. */
export const llSay: BuiltinImpl = (ctx, args) =>
  emit(ctx, (args[0] as number | undefined) ?? 0, (args[1] as string | undefined) ?? '', 'say')

/** llShout(integer channel, string msg) */
export const llShout: BuiltinImpl = (ctx, args) =>
  emit(ctx, (args[0] as number | undefined) ?? 0, (args[1] as string | undefined) ?? '', 'shout')

/** llWhisper(integer channel, string msg) */
export const llWhisper: BuiltinImpl = (ctx, args) =>
  emit(ctx, (args[0] as number | undefined) ?? 0, (args[1] as string | undefined) ?? '', 'whisper')

/** llOwnerSay(string msg) — channel 0 by convention; LSL routes it privately to the owner. */
export const llOwnerSay: BuiltinImpl = (ctx, args) =>
  emit(ctx, PUBLIC_CHANNEL, (args[0] as string | undefined) ?? '', 'ownerSay')

/** llRegionSay(integer channel, string msg) — channel 0 is refused with a DEBUG_CHANNEL error. */
export const llRegionSay: BuiltinImpl = (ctx, args) => {
  const channel = (args[0] as number | undefined) ?? 0
  if (channel === PUBLIC_CHANNEL) {
    sayError(ctx, 'Cannot use llRegionSay() on channel 0.')
    return undefined
  }
  return emit(ctx, channel, (args[1] as string | undefined) ?? '', 'regionSay')
}

/** llRegionSayTo(key target, integer channel, string msg) — any channel, including 0. */
export const llRegionSayTo: BuiltinImpl = (ctx, args) =>
  emit(
    ctx,
    (args[1] as number | undefined) ?? 0,
    (args[2] as string | undefined) ?? '',
    'regionSayTo',
    (args[0] as string | undefined) ?? '',
  )

/** llInstantMessage(key agent, string msg) — the 2 s forced delay comes from the function spec. */
export const llInstantMessage: BuiltinImpl = (ctx, args) =>
  emit(ctx, PUBLIC_CHANNEL, (args[1] as string | undefined) ?? '', 'im', (args[0] as string | undefined) ?? '')
