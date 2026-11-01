import type { World, WorldAvatar } from '../world.js'
import type { Script } from '../script.js'
import type { RlvRestriction } from './restrictions.js'

/** A fixture action records an attempt even when no chat is delivered. */
export interface AvatarChatAction {
  readonly action: 'chat'
  readonly channel: number
  readonly message: string
  readonly status: 'sent' | 'blocked' | 'unsupported'
  readonly deliveredMessage?: string
  readonly reason?: 'sendchat' | 'sendchannel' | 'channel' | 'avatar'
  readonly restrictions: readonly RlvRestriction[]
}

const logs = new WeakMap<WorldAvatar, readonly AvatarChatAction[]>()

export function avatarChatLog(avatar: WorldAvatar): readonly AvatarChatAction[] {
  return logs.get(avatar) ?? Object.freeze([])
}

/** Default OOC and ellipsis settings; emote extensions are outside this action. */
function filterPublicChat(profile: 'rlv' | 'rlva', message: string): string {
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
    const dot = Buffer.from(text).indexOf(46)
    if (profile === 'rlv') {
      return Buffer.from(text).subarray(0, dot >= 0 ? Math.min(dot + 1, 20) : 20).toString('utf8')
    }
    return [...text].slice(0, dot > 0 && dot < 20 ? dot + 1 : 20).join('')
  }
  if (text.startsWith('/')) return (profile === 'rlv' ? Buffer.byteLength(text) : [...text].length) > 7 ? '...' : text
  return text.startsWith('((') && text.endsWith('))') && (profile === 'rlv' || text.length >= 4) ? text : '...'
}

/** Ordinary avatar say, separate from simulator builtins and automatic query replies. */
export function sendAvatarChat(world: World, avatar: WorldAvatar, channel: number, message: string): AvatarChatAction {
  const chatRules = avatar.viewer.profile === 'disabled' ? [] : avatar.viewer.restrictions.snapshot()
    .filter(rule => rule.behaviour === 'sendchat' && !rule.option)
  const restrictions = channel === 0 || channel === 2147483647 && chatRules.length
    ? Object.freeze(chatRules) : avatar.viewer.restrictions.channelDenials(channel)
  const reason = !world.avatars.includes(avatar) ? 'avatar'
    : !Number.isInteger(channel) || channel < 0 || channel > 2147483647 ? 'channel'
    : channel === 2147483647 && chatRules.length ? 'sendchat'
    : channel !== 0 && restrictions.length ? 'sendchannel' : undefined
  const deliveredMessage = channel === 0 && chatRules.length && avatar.viewer.profile !== 'disabled'
    ? filterPublicChat(avatar.viewer.profile, message) : message
  const status = reason === 'sendchannel' || reason === 'sendchat' ? 'blocked' : reason ? 'unsupported' : 'sent'
  const record: AvatarChatAction = Object.freeze({ action: 'chat', channel, message, status,
    ...(status === 'sent' ? { deliveredMessage } : {}),
    ...(reason ? { reason } : deliveredMessage !== message ? { reason: 'sendchat' as const } : {}), restrictions })
  logs.set(avatar, Object.freeze([...avatarChatLog(avatar), record]))
  if (record.status !== 'sent') return record

  const corner = world.corner(avatar.region)
  const origin = { x: corner.x + avatar.position.x, y: corner.y + avatar.position.y, z: avatar.position.z }
  const matched: Script[] = []
  for (const linkset of world.linksets) {
    for (const prim of linkset.prims) {
      const local = prim.regionPosition()
      const region = world.corner(linkset.region)
      const position = { x: region.x + local.x, y: region.y + local.y, z: local.z }
      if ((position.x - origin.x) ** 2 + (position.y - origin.y) ** 2 + (position.z - origin.z) ** 2 > 20 ** 2) continue
      for (const script of prim.scripts) {
        if (script.matchChatListens({ channel, name: avatar.name, key: avatar.key, message: deliveredMessage })) matched.push(script)
      }
    }
  }
  matched[0]?.linkset.settle(matched.filter(script => script.handles('listen')))
  return record
}
