import type { Vector } from '../values/types.js'
import type { AvatarDestination, World, WorldAvatar } from '../world.js'
import type { ViewerProfile } from './profiles.js'
import type { RlvRestriction } from './restrictions.js'
import { userTeleportRestrictions } from './teleport.js'

const base = (name: string) => name.replace(/_sec$/, '')
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

export function teleportOfferSupport(profile: ViewerProfile, behaviour: string, option: string): 'enforced' | 'unsupported' | undefined {
  const family = base(behaviour)
  if (family !== 'tplure' && family !== 'accepttp') return undefined
  if (profile === 'disabled' || profile === 'rlv' && behaviour === 'accepttp_sec') return 'unsupported'
  return !option || uuid(option) ? 'enforced' : 'unsupported'
}

/** A received offer or response snapshot. Destinations are resolved global coordinates. */
export interface TeleportOffer {
  readonly sender: string
  readonly recipient: string
  readonly destination: Vector
  readonly status: 'pending' | 'accepted' | 'declined' | 'blocked' | 'refused'
  readonly automatic: boolean
  readonly restrictions: readonly RlvRestriction[]
  readonly result: AvatarDestination
  readonly reason?: 'avatar' | 'destination' | 'restriction' | 'offer'
}
export type TeleportOfferDecision = 'accept' | 'decline'

const pending = new WeakMap<TeleportOffer, { world: World; avatar: WorldAvatar }>()
const logs = new WeakMap<WorldAvatar, readonly TeleportOffer[]>()
const empty: readonly TeleportOffer[] = Object.freeze([])

export function teleportOfferLog(avatar: WorldAvatar): readonly TeleportOffer[] {
  return logs.get(avatar) ?? empty
}

function record(avatar: WorldAvatar, offer: Omit<TeleportOffer, 'result'>): TeleportOffer {
  const result = Object.freeze({ ...offer, destination: Object.freeze({ ...offer.destination }),
    restrictions: Object.freeze([...offer.restrictions]),
    result: Object.freeze({ region: avatar.region, position: Object.freeze({ ...avatar.position }) }) })
  logs.set(avatar, Object.freeze([...teleportOfferLog(avatar), result]))
  return result
}

function offerRestrictions(world: World, avatar: WorldAvatar, sender: string, destination: Vector): readonly RlvRestriction[] {
  const rules = avatar.viewer.restrictions.snapshot().filter(rule => rule.support === 'enforced')
  const blocks = rules.filter(rule => base(rule.behaviour) === 'tplure' && !rule.option)
  const exceptions = rules.filter(rule => base(rule.behaviour) === 'tplure' && rule.option === sender.toLowerCase())
  const strict = rules.some(rule => rule.behaviour === 'permissive' && !rule.option)
  const missing = blocks.filter(rule => (strict || rule.behaviour.endsWith('_sec')) &&
    !exceptions.some(exception => exception.sourcePrim === rule.sourcePrim))
  const denied = missing.length ? missing : exceptions.length ? [] : blocks
  return [...userTeleportRestrictions(world, avatar, 'offer', destination), ...denied]
}

/** Receive policy runs before auto-accept. Pending dialogs retain their original acceptance callback. */
export function offerTeleport(world: World, sender: WorldAvatar, recipient: WorldAvatar, destination: Vector): TeleportOffer {
  const invalid = !world.avatars.includes(sender) || !world.avatars.includes(recipient) || sender === recipient ? 'avatar' :
    !Object.values(destination).every(Number.isFinite) || !world.regionAt(destination.x, destination.y) ? 'destination' : undefined
  const restrictions = invalid ? [] : offerRestrictions(world, recipient, sender.key, destination)
  const rules = recipient.viewer.restrictions.snapshot().filter(rule => rule.support === 'enforced')
  // Kokua looks for literal accepttp rules, while RLVa also registers strict aliases.
  const automatic = !invalid && !restrictions.length && rules.some(rule => base(rule.behaviour) === 'accepttp' &&
    (!rule.option || rule.option === sender.key.toLowerCase()))
  const reason = invalid ?? (restrictions.length ? 'restriction' : undefined)
  if (automatic) world.teleportAvatar(recipient, destination)
  const offer = record(recipient, { sender: sender.key, recipient: recipient.key, destination,
    status: invalid ? 'refused' : reason ? 'blocked' : automatic ? 'accepted' : 'pending', automatic,
    restrictions, ...(reason ? { reason } : {}) })
  if (offer.status === 'pending') pending.set(offer, { world, avatar: recipient })
  return offer
}

/** Only the original pending offer and recipient can consume its callback. */
export function respondTeleportOffer(world: World, avatar: WorldAvatar, offer: TeleportOffer, decision: TeleportOfferDecision): TeleportOffer {
  const entry = pending.get(offer)
  if (!entry || entry.world !== world || entry.avatar !== avatar || !world.avatars.includes(avatar))
    return record(avatar, { ...offer, status: 'refused', reason: 'offer' })
  pending.delete(offer)
  const moved = decision === 'accept' && world.teleportAvatar(avatar, offer.destination)
  return record(avatar, { ...offer, status: decision === 'decline' ? 'declined' : moved ? 'accepted' : 'refused',
    ...(decision === 'accept' && !moved ? { reason: 'destination' as const } : {}) })
}
