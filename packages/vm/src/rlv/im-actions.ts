import { deliverAvatarReceivedIM } from './received.js'
import type { World, WorldAvatar } from '../world.js'
import type { ViewerProfile } from './profiles.js'
import type { RlvRestriction } from './restrictions.js'

const base = (behaviour: string) => behaviour.replace(/_sec$/, '')
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const globals = new Set(['sendim', 'startim'])
const targeted = new Set(['sendimto', 'startimto'])

export function avatarIMSupport(profile: ViewerProfile, behaviour: string, option: string): RlvRestriction['support'] | undefined {
  const family = base(behaviour)
  if (!globals.has(family) && !targeted.has(family)) return undefined
  if (profile === 'disabled' || profile === 'rlv' && targeted.has(family) && behaviour.endsWith('_sec')) return 'unsupported'
  return uuid(option) || !option && globals.has(family) ? 'enforced' : 'unsupported'
}

/** An attempted online one-to-one IM, including replacement text sent under a send lock. */
export interface AvatarIMAction {
  readonly action: 'im'
  readonly recipient: string
  readonly message: string
  readonly status: 'sent' | 'blocked' | 'unsupported'
  readonly deliveredMessage?: string
  readonly reason?: 'sendim' | 'sendimto' | 'startim' | 'startimto' | 'avatar' | 'recipient'
  readonly restrictions: readonly RlvRestriction[]
}

const logs = new WeakMap<WorldAvatar, readonly AvatarIMAction[]>()
const sessions = new WeakMap<WorldAvatar, Set<string>>()
const empty: readonly AvatarIMAction[] = Object.freeze([])

export function avatarIMLog(avatar: WorldAvatar): readonly AvatarIMAction[] {
  return logs.get(avatar) ?? empty
}

/** Incoming IMs create a conversation even when receive policy replaces their text. */
export function openAvatarIMSession(avatar: WorldAvatar, recipient: string): void {
  let open = sessions.get(avatar)
  if (!open) sessions.set(avatar, open = new Set())
  open.add(recipient.toLowerCase())
}

function denials(avatar: WorldAvatar, family: 'sendim' | 'startim', recipient: string): readonly RlvRestriction[] {
  const rules = avatar.viewer.restrictions.snapshot().filter(rule => rule.support === 'enforced')
  const strict = rules.some(rule => rule.behaviour === 'permissive' && !rule.option)
  const blocks = rules.filter(rule => base(rule.behaviour) === family && !rule.option)
  const exceptions = rules.filter(rule => base(rule.behaviour) === family && rule.option === recipient)
  const missing = blocks.filter(rule => (strict || rule.behaviour.endsWith('_sec')) &&
    !exceptions.some(exception => exception.sourcePrim === rule.sourcePrim))
  const global = missing.length ? missing : !exceptions.length ? blocks : []
  const targets = rules.filter(rule => base(rule.behaviour) === family + 'to')
  const matching = targets.filter(rule => rule.option === recipient)
  if (avatar.viewer.profile === 'rlv') return Object.freeze([...global, ...matching])
  const scoped = targets.filter(rule => strict || rule.behaviour.endsWith('_sec'))
  const denied = scoped.length ? scoped.every(rule => matching.some(match => match.sourcePrim === rule.sourcePrim)) : matching.length > 0
  return Object.freeze([...global, ...(denied ? matching : [])])
}

/** Apply start policy only when opening a session; send policy also applies to open sessions. */
export function attemptAvatarIM(world: World, sender: WorldAvatar, recipient: string, message: string): AvatarIMAction {
  const key = recipient.toLowerCase()
  const valid = uuid(key) && key !== '00000000-0000-0000-0000-000000000000' && key !== sender.key.toLowerCase() &&
    world.avatars.some(avatar => avatar.key.toLowerCase() === key)
  const invalid = !world.avatars.includes(sender) ? 'avatar' : !valid ? 'recipient' : undefined
  const active = !invalid && sender.viewer.profile !== 'disabled'
  const start = active && !sessions.get(sender)?.has(key) ? denials(sender, 'startim', key) : []
  const send = active && !start.length ? denials(sender, 'sendim', key) : []
  const restrictions = Object.freeze([...start, ...send])
  const reason = invalid ?? (restrictions[0] ? base(restrictions[0].behaviour) as 'sendim' | 'sendimto' | 'startim' | 'startimto' : undefined)
  const status = invalid ? 'unsupported' : restrictions.length ? 'blocked' : 'sent'
  const deliveredMessage = invalid || start.length ? undefined : send.length ? "*** IM blocked by sender's viewer" : message
  const record: AvatarIMAction = Object.freeze({ action: 'im', recipient, message, status, restrictions,
    ...(reason ? { reason } : {}), ...(deliveredMessage !== undefined ? { deliveredMessage } : {}) })
  logs.set(sender, Object.freeze([...avatarIMLog(sender), record]))
  if (deliveredMessage !== undefined) {
    openAvatarIMSession(sender, key)
    deliverAvatarReceivedIM(world, sender, key, deliveredMessage)
  }
  return record
}
