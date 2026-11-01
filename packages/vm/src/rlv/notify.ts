import type { Prim } from '../prim.js'
import type { WorldAvatar } from '../world.js'
import type { RlvProfile } from './profiles.js'
import type { RlvRestriction } from './restrictions.js'
import { isValidReplyChannel, sendViewerReply } from './reply.js'

/** Notification options use each profile's channel and separator policy. */
export function parseNotifyOption(profile: RlvProfile, option: string): { channel: number; filter: string } | undefined {
  const fields = profile === 'rlv' ? option.split(';').filter(Boolean) : option.split(';')
  if (profile === 'rlva' && fields.length > 2) return undefined
  const prefix = /^[\t\n\v\f\r ]*([+-]?[0-9]+)/.exec(fields[0] ?? '')
  const channel = prefix ? Number(prefix[1]) : undefined
  if (channel === undefined || !isValidReplyChannel(profile, channel)) return undefined
  return { channel, filter: fields[1] ?? '' }
}

/** Emit avatar-origin messages in subscriber UUID and registration insertion order. */
export function sendRestrictionNotifications(prim: Prim, avatar: WorldAvatar | undefined, rules: readonly RlvRestriction[], action: string, suffix = ''): void {
  const linkset = prim.linkset!
  if (!avatar || !linkset.world?.avatars.includes(avatar) || avatar.viewer.profile === 'disabled') return
  const profile = avatar.viewer.profile
  const subscriptions = rules.filter(rule => rule.behaviour === 'notify')
    .sort((a, b) => a.sourcePrim < b.sourcePrim ? -1 : a.sourcePrim > b.sourcePrim ? 1 : 0)
  for (const rule of subscriptions) {
    const registration = parseNotifyOption(profile, rule.option)
    if (registration && action.includes(registration.filter)) {
      sendViewerReply(linkset, avatar, registration.channel, '/' + action + suffix)
    }
  }
}
