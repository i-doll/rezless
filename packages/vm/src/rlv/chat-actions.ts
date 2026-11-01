import { rlvIntegerPrefix } from './classifier.js'
import { truncateUtf8 } from '../values/utf8.js'
import { deliverAvatarReceivedChat } from './received.js'
import type { World, WorldAvatar } from '../world.js'
import type { Script } from '../script.js'
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
  let deliveredVolume = volume
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
    : !Number.isInteger(channel) || channel < 0 || channel > 2147483647 ? 'channel'
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
  const record: AvatarChatAction = Object.freeze({ action: 'chat', channel, message, volume, status,
    ...(status === 'sent' ? { deliveredMessage, deliveredVolume } : {}),
    ...(reason ? { reason } : deliveredMessage !== message ? { reason: 'sendchat' as const } : {}), restrictions })
  logs.set(avatar, Object.freeze([...avatarChatLog(avatar), record]))
  if (record.status === 'sent') deliverAvatarChat(world, avatar, channel, deliveredMessage, deliveredVolume)
  return record
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
  const range = deliveredVolume === 'whisper' ? 10 : deliveredVolume === 'shout' ? 100 : 20
  const corner = world.corner(avatar.region)
  const origin = { x: corner.x + avatar.position.x, y: corner.y + avatar.position.y, z: avatar.position.z }
  const matched: Script[] = []
  for (const linkset of world.linksets) {
    for (const prim of linkset.prims) {
      const local = prim.regionPosition()
      const region = world.corner(linkset.region)
      const position = { x: region.x + local.x, y: region.y + local.y, z: local.z }
      if ((position.x - origin.x) ** 2 + (position.y - origin.y) ** 2 + (position.z - origin.z) ** 2 > range ** 2) continue
      for (const script of prim.scripts) {
        if (script.matchChatListens({ channel, name: avatar.name, key: avatar.key, message: deliveredMessage })) matched.push(script)
      }
    }
  }
  matched[0]?.linkset.settle(matched.filter(script => script.handles('listen')))
}
