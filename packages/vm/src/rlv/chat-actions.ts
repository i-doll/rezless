import { rlvIntegerPrefix } from './classifier.js'
import { truncateUtf8 } from '../values/utf8.js'
import { deliverAvatarReceivedChat } from './received.js'
import type { World, WorldAvatar } from '../world.js'
import type { RlvRestriction } from './restrictions.js'

export type AvatarChatVolume = 'whisper' | 'say' | 'shout'

const volumeFamilies = new Set(['chatwhisper', 'chatnormal', 'chatshout'])

export function chatVolumeSupport(behaviour: string, option: string): RlvRestriction['support'] | undefined {
  return volumeFamilies.has(behaviour) ? !option ? 'enforced' : 'unsupported' : undefined
}

export function chatRedirectSupport(profile: WorldAvatar['viewer']['profile'], behaviour: string, option: string): RlvRestriction['support'] | undefined {
  if (behaviour === 'emote') return !option ? 'enforced' : 'unsupported'
  if (behaviour !== 'redirchat' && behaviour !== 'rediremote') return undefined
  const channel = rlvIntegerPrefix(option) ?? 0
  return option && (profile === 'rlv' || channel > 0 && channel < 2147483647) ? 'enforced' : 'unsupported'
}

/** A fixture action records an attempt even when no chat is delivered. */
export interface AvatarChatAction {
  readonly action: 'chat'
  readonly channel: number
  readonly message: string
  readonly volume: AvatarChatVolume
  readonly deliveredVolume?: AvatarChatVolume
  readonly status: 'sent' | 'blocked' | 'unsupported'
  readonly deliveredMessage?: string
  /** The separate chat messages listeners got, when the viewer split `deliveredMessage`. */
  readonly deliveredParts?: readonly string[]
  readonly redirected?: readonly Readonly<{ channel: number; message: string; volume: AvatarChatVolume; status: 'sent' | 'blocked'; restrictions: readonly RlvRestriction[] }>[]
  readonly reason?: 'redirchat' | 'rediremote' | 'sendchat' | 'sendchannel' | 'channel' | 'avatar'
  readonly restrictions: readonly RlvRestriction[]
}

const logs = new WeakMap<WorldAvatar, readonly AvatarChatAction[]>()

export function avatarChatLog(avatar: WorldAvatar): readonly AvatarChatAction[] {
  return logs.get(avatar) ?? Object.freeze([])
}

/** Default OOC and ellipsis settings. */
function filterPublicChat(profile: 'rlv' | 'rlva', message: string, extended = false, truncate = true): string {
  if (!message) return message
  let text = message
  if (profile === 'rlv') {
    const emote = text.indexOf('/me')
    if (emote > 0) text = text.slice(emote)
  }
  const isEmote = profile === 'rlv'
    ? text.startsWith('/me ') || text.startsWith("/me'") || /^:[a-zA-Z]./.test(text) || text.startsWith(":'")
    : Buffer.byteLength(text) > 4 && (text.startsWith('/me ') || text.startsWith("/me'"))
  if (isEmote) {
    if (/["]|''|[()*=^_~]| -|- /.test(text) || profile === 'rlva' && text.includes('?')) return '...'
    if (extended || !truncate) return text
    const dot = Buffer.from(text).indexOf(46)
    if (profile === 'rlv') {
      return Buffer.from(text).subarray(0, dot >= 0 ? Math.min(dot + 1, 20) : 20).toString('utf8')
    }
    return [...text].slice(0, dot > 0 && dot < 20 ? dot + 1 : 20).join('')
  }
  if (text.startsWith('/')) return (profile === 'rlv' ? Buffer.byteLength(text) : [...text].length) > 7 ? '...' : text
  return text.startsWith('((') && text.endsWith('))') && (profile === 'rlv' || text.length >= 4) ? text : '...'
}

/** Avatar local chat, separate from simulator builtins and automatic query replies. */
export function sendAvatarChat(world: World, avatar: WorldAvatar, channel: number, message: string, volume: AvatarChatVolume = 'say'): AvatarChatAction {
  const rules = avatar.viewer.profile === 'disabled' ? [] : avatar.viewer.restrictions.snapshot()
  const chatRules = rules.filter(rule => rule.behaviour === 'sendchat' && !rule.option)
  const volumeRules = channel === 0 ? rules.filter(rule => volumeFamilies.has(rule.behaviour) && !rule.option) : []
  const redirectRules = rules.filter(rule => (rule.behaviour === 'redirchat' || rule.behaviour === 'rediremote') && rule.option)
  const emoteRules = rules.filter(rule => rule.behaviour === 'emote' && !rule.option)
  const debugRedirect = channel === 2147483647 && avatar.viewer.profile === 'rlva' && redirectRules.some(rule =>
    rule.behaviour === (isRlvaEmote(message) ? 'rediremote' : 'redirchat'))
  const restrictions = channel === 0 ? Object.freeze(rules.filter(rule => chatRules.includes(rule) || volumeRules.includes(rule) || redirectRules.includes(rule) || emoteRules.includes(rule)))
    : channel === 2147483647 && (chatRules.length || debugRedirect) ? Object.freeze([...chatRules, ...(debugRedirect ? redirectRules : []), ...avatar.viewer.restrictions.channelDenials(channel)]) : avatar.viewer.restrictions.channelDenials(channel)
  const has = (behaviour: string) => volumeRules.some(rule => rule.behaviour === behaviour)
  let deliveredVolume: AvatarChatVolume = channel < 0 ? 'say' : volume
  if (avatar.viewer.profile === 'rlv') {
    if (deliveredVolume === 'whisper' && has('chatwhisper')) deliveredVolume = 'say'
    if (deliveredVolume === 'shout' && has('chatshout')) deliveredVolume = 'say'
    if ((deliveredVolume === 'shout' || deliveredVolume === 'say') && has('chatnormal')) deliveredVolume = 'whisper'
  } else {
    if ((volume === 'shout' || volume === 'say') && has('chatnormal')) deliveredVolume = 'whisper'
    else if (volume === 'shout' && has('chatshout')) deliveredVolume = 'say'
    else if (volume === 'whisper' && has('chatwhisper')) deliveredVolume = 'say'
  }
  const reason = !world.avatars.includes(avatar) ? 'avatar'
    : !Number.isInteger(channel) || channel < -2147483648 || channel > 2147483647 ? 'channel'
    : channel === 2147483647 && chatRules.length ? 'sendchat'
    : debugRedirect ? (isRlvaEmote(message) ? 'rediremote' : 'redirchat')
    : channel !== 0 && restrictions.length ? 'sendchannel' : undefined
  const profile = avatar.viewer.profile
  const hasChatRedirect = redirectRules.some(rule => rule.behaviour === 'redirchat')
  let deliveredMessage = message
  // Kokua's chat editor crunches before the low-level redirect handler, unless
  // redirchat is present. RLVa's handler redirects before sendchat filtering.
  if (channel === 0 && chatRules.length && profile === 'rlv' && !hasChatRedirect)
    deliveredMessage = filterPublicChat(profile, message, emoteRules.length > 0)
  const emote = profile === 'rlv' ? deliveredMessage.startsWith('/me ') || deliveredMessage.startsWith("/me's") : isRlvaEmote(message)
  const family = emote ? 'rediremote' : 'redirchat'
  const targets = redirectRules.filter(rule => rule.behaviour === family)
  const redirect = !reason && channel === 0 && targets.length > 0 &&
    (profile === 'rlv' || !!message && (emote || rlvaFiltersSpeech(message)))
  if (redirect) {
    const redirectVolume = profile === 'rlva' ? 'shout' : deliveredVolume
    const redirectMessage = profile === 'rlva' ? truncateUtf8(deliveredMessage, 1023) : deliveredMessage
    const redirected = Object.freeze(targets.flatMap(rule => {
      const target = rlvIntegerPrefix(rule.option) ?? 0
      if (target <= 0 || target >= 2147483647) return []
      const denials = avatar.viewer.restrictions.channelDenials(target)
      return [Object.freeze({ channel: target, message: redirectMessage, volume: redirectVolume,
        status: denials.length ? 'blocked' as const : 'sent' as const, restrictions: denials })]
    }))
    const sent = redirected.some(target => target.status === 'sent')
    const record: AvatarChatAction = Object.freeze({ action: 'chat', channel, message, volume,
      status: sent ? 'sent' : 'blocked', reason: family,
      restrictions: Object.freeze([...new Set([...restrictions, ...redirected.flatMap(target => target.restrictions)])]), redirected,
      ...(sent ? { deliveredMessage: redirectMessage, deliveredVolume: redirectVolume } : {}) })
    logs.set(avatar, Object.freeze([...avatarChatLog(avatar), record]))
    for (const target of redirected) if (target.status === 'sent')
      deliverAvatarChat(world, avatar, target.channel, target.message, target.volume)
    return record
  }
  if (channel === 0) {
    if (profile === 'rlv' && hasChatRedirect)
      deliveredMessage = filterPublicChat(profile, deliveredMessage, emoteRules.length > 0, false)
    else if (profile === 'rlva' && chatRules.length)
      deliveredMessage = filterPublicChat(profile, message, emoteRules.length > 0)
  }
  const status = reason === 'sendchannel' || reason === 'sendchat' || reason === 'redirchat' || reason === 'rediremote' ? 'blocked' : reason ? 'unsupported' : 'sent'
  const parts = chatParts(profile, channel, deliveredMessage)
  const record: AvatarChatAction = Object.freeze({ action: 'chat', channel, message, volume, status,
    ...(status === 'sent' ? { deliveredMessage: parts.length > 1 ? deliveredMessage : parts[0]!, ...(parts.length > 1 ? { deliveredParts: Object.freeze(parts) } : {}), deliveredVolume } : {}),
    ...(reason ? { reason } : channel === 0 && deliveredMessage !== message ? { reason: 'sendchat' as const } : {}), restrictions })
  logs.set(avatar, Object.freeze([...avatarChatLog(avatar), record]))
  if (record.status === 'sent') for (const part of parts) deliverAvatarChat(world, avatar, channel, part, deliveredVolume)
  return record
}

/**
 * Firestorm sends chat in pieces of at most 1023 bytes, and a negative channel
 * travels as a dialog reply that carries 254 bytes of each piece.
 */
function chatParts(profile: WorldAvatar['viewer']['profile'], channel: number, text: string): string[] {
  const parts = profile === 'rlva' ? splitFirestormChat(text) : [text]
  return channel < 0 ? parts.map(part => truncateUtf8(part, 254)) : parts
}

/**
 * Firestorm's send_chat_from_viewer: each piece ends before the last space
 * that fits in 1023 bytes, or else before a UTF-8 continuation byte. The space
 * starts the next piece. A text of exactly 1023 bytes still looks for a space.
 */
function splitFirestormChat(text: string): string[] {
  const bytes = new TextEncoder().encode(text)
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true })
  const parts: string[] = []
  for (let pos = 0; pos < bytes.length;) {
    let next = Math.min(1023, bytes.length - pos)
    if (pos + 1023 <= bytes.length) {
      while (next > 0 && bytes[pos + next] !== 0x20) --next
      if (next === 0) {
        next = 1023
        while (next > 0 && (bytes[pos + next] ?? 0) >= 0x80 && bytes[pos + next]! < 0xc0) --next
      }
      if (next === 0) next = 1023
    }
    parts.push(decoder.decode(bytes.subarray(pos, pos + next)))
    pos += next
  }
  return parts.length ? parts : [text]
}

function isRlvaEmote(message: string): boolean {
  return Buffer.byteLength(message) > 4 && (message.startsWith('/me ') || message.startsWith("/me'"))
}

/** filterChat(text, false) tests speech without changing emotes. */
function rlvaFiltersSpeech(message: string): boolean {
  if (message.startsWith('/')) return [...message].length > 7
  return !(message.length >= 4 && message.startsWith('((') && message.endsWith('))'))
}

function deliverAvatarChat(world: World, avatar: WorldAvatar, channel: number, deliveredMessage: string, deliveredVolume: AvatarChatVolume): void {
  deliverAvatarReceivedChat(world, avatar, channel, deliveredMessage, deliveredVolume)
  const matched = world.linksets[0]?.routeViewerReply(avatar, channel, deliveredMessage, deliveredVolume) ?? []
  matched[0]?.linkset.settle(matched.filter(script => script.handles('listen')))
}
