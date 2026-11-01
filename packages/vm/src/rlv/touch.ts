import { dispatchRestrictionCommand } from './restrictions.js'
import type { RlvParsedCommand } from './classifier.js'
import { cameraAngle } from './camera.js'
import type { TouchOptions } from '../linkset.js'
import type { Prim } from '../prim.js'
import type { Vector } from '../values/types.js'
import type { World, WorldAvatar } from '../world.js'
import type { ViewerProfile } from './profiles.js'
import type { RlvRestriction } from './restrictions.js'

const distances = new Set(['fartouch', 'touchfar'])
const switches = new Set(['touchall', 'touchattachself'])
const exceptions = new Set(['touchworld', 'touchattach', 'touchattachother', 'touchhud'])
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

function radius(profile: ViewerProfile, option: string): number | undefined {
  if (!option) return 1.5
  // Explicit non-finite spellings are accepted by atof and stof; overflow is not.
  if (/^[\t\n\v\f\r ]*[+-]?(?:inf|nan)/i.test(option)) return cameraAngle('rlv', option)
  return cameraAngle(profile, option)
}

export function touchSupport(profile: ViewerProfile, behaviour: string, option: string): RlvRestriction['support'] | undefined {
  if (distances.has(behaviour)) return profile !== 'disabled' && radius(profile, option) !== undefined ? 'enforced' : 'unsupported'
  if (switches.has(behaviour)) return profile !== 'disabled' && !option ? 'enforced' : 'unsupported'
  if (behaviour === 'touchworld_sec' || behaviour === 'touchhud_sec') {
    return profile === 'rlv' && (!option || uuid(option)) ? 'enforced' : 'unsupported'
  }
  if (!exceptions.has(behaviour)) return undefined
  // Kokua retains touchattach options, but only its no-option lock has an effect.
  if (profile === 'rlv' && behaviour === 'touchattach' && option) return 'unsupported'
  return profile !== 'disabled' && (!option || uuid(option)) ? 'enforced' : 'unsupported'
}

export interface AvatarTouchOptions extends Omit<TouchOptions, 'avatar'> {
  /** Global-axis offset from the clicked prim's center to the picked point. */
  readonly offset?: Vector
}

export interface AvatarTouchPermission {
  readonly status: 'allowed' | 'blocked' | 'unsupported'
  readonly distance: number
  readonly reason?: string
  readonly restrictions: readonly RlvRestriction[]
}

export interface AvatarTouchAction extends Omit<AvatarTouchPermission, 'status'> {
  readonly action: 'touch'
  readonly target: string
  readonly status: 'touched' | 'blocked' | 'unsupported'
}

const logs = new WeakMap<WorldAvatar, readonly AvatarTouchAction[]>()
export function avatarTouchLog(avatar: WorldAvatar): readonly AvatarTouchAction[] {
  return logs.get(avatar) ?? Object.freeze([])
}

const modifierStates = new WeakMap<WorldAvatar, { previous: readonly RlvRestriction[]; values: { rule: RlvRestriction; value: number }[] }>()
function rlvaRadius(avatar: WorldAvatar, limits: readonly RlvRestriction[]): number {
  let state = modifierStates.get(avatar)
  if (!state) modifierStates.set(avatar, state = { previous: [], values: [] })
  for (const rule of state.previous.filter(rule => !limits.includes(rule))) {
    const value = radius('rlva', rule.option)!
    const index = state.values.findIndex(entry => entry.rule.sourcePrim === rule.sourcePrim && entry.value === value)
    if (index >= 0) state.values.splice(index, 1)
  }
  for (const rule of limits.filter(rule => !state.previous.includes(rule))) {
    const value = radius('rlva', rule.option)!
    let low = 0, high = state.values.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (state.values[middle]!.value < value) low = middle + 1
      else high = middle
    }
    state.values.splice(low, 0, { rule, value })
  }
  state.previous = limits
  return state.values[0]?.value ?? 1.5
}

/** One permission check shared by avatar touch actions and interaction consumers. */
export function checkAvatarTouch(world: World, avatar: WorldAvatar, prim: Prim, options: AvatarTouchOptions = {}): AvatarTouchPermission {
  const linkset = prim.linkset
  const invalid = (reason: string): AvatarTouchPermission => Object.freeze({ status: 'unsupported', distance: NaN, reason, restrictions: Object.freeze([]) })
  if (!world.avatars.includes(avatar)) return invalid('avatar')
  if (!linkset || linkset.dead || linkset.world !== world || !world.linksets.includes(linkset) || !linkset.prims.includes(prim)) return invalid('target')
  const position = prim.regionPosition()
  const targetCorner = world.corner(linkset.region)
  const avatarCorner = world.corner(avatar.region)
  const offset = options.offset ?? { x: 0, y: 0, z: 0 }
  const distance = Math.hypot(targetCorner.x + position.x + offset.x - avatarCorner.x - avatar.position.x,
    targetCorner.y + position.y + offset.y - avatarCorner.y - avatar.position.y, position.z + offset.z - avatar.position.z)
  const result = (status: AvatarTouchPermission['status'], reason?: string, restrictions: readonly RlvRestriction[] = []): AvatarTouchPermission =>
    Object.freeze({ status, distance, ...(reason ? { reason } : {}), restrictions: Object.freeze([...restrictions]) })
  if (!Number.isFinite(distance)) return result('unsupported', 'position')
  if (avatar.viewer.profile === 'disabled') return result('allowed')
  const profile = avatar.viewer.profile
  const rules = avatar.viewer.restrictions.snapshot().filter(rule => rule.support === 'enforced')
  const root = linkset.prims[0]!.key.toLowerCase()
  const attachment = linkset.attachment
  const hud = !!attachment && attachment.point >= 31 && attachment.point <= 38
  const self = profile === 'rlva' ? linkset.owner.toLowerCase() === avatar.key.toLowerCase()
    : attachment?.avatar.toLowerCase() === avatar.key.toLowerCase()
  const family = (name: string) => rules.filter(rule => rule.behaviour === name)
  const blocks = (name: string) => family(name).filter(rule => !rule.option)
  const hasException = (name: string, id: string) => family(name).some(rule => rule.option === id.toLowerCase())
  const deny = (denials: readonly RlvRestriction[]) => result('blocked', denials[0]!.behaviour, denials)
  const worldOrHud = (name: string): readonly RlvRestriction[] => {
    const global = rules.filter(rule => (rule.behaviour === name || rule.behaviour === name + '_sec') && !rule.option)
    const grants = rules.filter(rule => (rule.behaviour === name || rule.behaviour === name + '_sec') && rule.option === root)
    if (profile === 'rlva') return grants.length ? [] : global
    const strict = rules.some(rule => rule.behaviour === 'permissive' && !rule.option)
    const missing = global.filter(rule => (strict || rule.behaviour.endsWith('_sec')) && !grants.some(grant => grant.sourcePrim === rule.sourcePrim))
    return missing.length ? missing : grants.length ? [] : global
  }
  if (!hud && blocks('touchall').length) return deny(blocks('touchall'))
  if (!attachment) {
    const denials = worldOrHud('touchworld')
    if (denials.length) return deny(denials)
  } else if (hud) {
    const denials = worldOrHud('touchhud')
    if (denials.length) return deny(denials)
  } else {
    const attach = blocks('touchattach')
    const own = blocks(self ? 'touchattachself' : 'touchattachother')
    const exempt = profile === 'rlva' && (hasException('touchattach', root) || !self && hasException('touchattach', attachment.avatar))
    if (!exempt && (attach.length || own.length)) return deny([...attach, ...own])
    if (!self) {
      const targeted = family('touchattachother').filter(rule => rule.option === attachment.avatar.toLowerCase())
      if (targeted.length) return deny(targeted)
    }
  }
  if (!attachment || profile === 'rlva' && !self && !hud) {
    const limits = rules.filter(rule => distances.has(rule.behaviour))
    let limit = profile === 'rlv' ? 1000000 : rlvaRadius(avatar, limits)
    if (profile === 'rlv') for (const rule of limits) {
      const value = radius(profile, rule.option)!
      if (value < limit) limit = value
    }
    if (profile === 'rlv' ? Math.fround(distance) > limit : limits.length > 0 && !(distance * distance <= Math.fround(limit * limit))) {
      return result('blocked', limits[0]?.behaviour ?? 'fartouch', limits)
    }
  }
  return result('allowed')
}

/** Deliver through Linkset.touch only after the complete viewer permission check. */
export function attemptAvatarTouch(world: World, avatar: WorldAvatar, prim: Prim, options: AvatarTouchOptions = {}): AvatarTouchAction {
  const permission = checkAvatarTouch(world, avatar, prim, options)
  const record: AvatarTouchAction = Object.freeze({ ...permission, action: 'touch', target: prim.key,
    status: permission.status === 'allowed' ? 'touched' : permission.status })
  logs.set(avatar, Object.freeze([...avatarTouchLog(avatar), record]))
  if (record.status === 'touched') prim.linkset!.touch(prim.linkNumber, { ...options, avatar: { key: avatar.key, name: avatar.name, pos: { ...avatar.position } } })
  return record
}

/** Keep float modifier ordering in command order, including commands between actions. */
export function dispatchTouchCommand(avatar: WorldAvatar, prim: Prim, parsed: RlvParsedCommand, command: string): boolean {
  if (avatar.viewer.profile !== 'rlva') return false
  const limits = () => avatar.viewer.restrictions.snapshot().filter(rule => distances.has(rule.behaviour) && rule.support === 'enforced')
  rlvaRadius(avatar, limits())
  if (!distances.has(parsed.behaviour) || (parsed.kind !== 'add' && parsed.kind !== 'remove') ||
    touchSupport('rlva', parsed.behaviour, parsed.option) !== 'enforced') return false
  dispatchRestrictionCommand(avatar.viewer, prim, parsed, command)
  rlvaRadius(avatar, limits())
  return true
}
