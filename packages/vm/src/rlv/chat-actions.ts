import type { World, WorldAvatar } from '../world.js'
import type { Script } from '../script.js'
import type { RlvRestriction } from './restrictions.js'

/** A fixture action records an attempt even when no chat is delivered. */
export interface AvatarChatAction {
  readonly action: 'chat'
  readonly channel: number
  readonly message: string
  readonly status: 'sent' | 'blocked' | 'unsupported'
  readonly reason?: 'sendchannel' | 'channel' | 'avatar'
  readonly restrictions: readonly RlvRestriction[]
}

const logs = new WeakMap<WorldAvatar, readonly AvatarChatAction[]>()

export function avatarChatLog(avatar: WorldAvatar): readonly AvatarChatAction[] {
  return logs.get(avatar) ?? Object.freeze([])
}

/** Ordinary avatar say, separate from simulator builtins and automatic query replies. */
export function sendAvatarChat(world: World, avatar: WorldAvatar, channel: number, message: string): AvatarChatAction {
  const restrictions = avatar.viewer.restrictions.channelDenials(channel)
  const reason = !world.avatars.includes(avatar) ? 'avatar'
    : !Number.isInteger(channel) || channel < 0 || channel > 2147483647 ? 'channel'
    : restrictions.length ? 'sendchannel' : undefined
  const record: AvatarChatAction = Object.freeze({ action: 'chat', channel, message,
    status: reason === 'sendchannel' ? 'blocked' : reason ? 'unsupported' : 'sent',
    ...(reason ? { reason } : {}), restrictions })
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
        if (script.matchChatListens({ channel, name: avatar.name, key: avatar.key, message })) matched.push(script)
      }
    }
  }
  matched[0]?.linkset.settle(matched.filter(script => script.handles('listen')))
  return record
}
