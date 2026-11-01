import { PERM_COPY } from '../generated/constants.js'
import type { Linkset } from '../linkset.js'
import type { Prim } from '../prim.js'
import type { Vector } from '../values/types.js'
import type { World, WorldAvatar } from '../world.js'
import type { ViewerProfile } from './profiles.js'
import type { RlvRestriction } from './restrictions.js'

const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const switches = new Set(['editworld', 'editattach', 'rez', 'interact'])
export function editSupport(profile: ViewerProfile, behaviour: string, option: string): RlvRestriction['support'] | undefined {
  if (behaviour === 'edit' || behaviour === 'edit_sec') {
    return profile !== 'disabled' && (behaviour === 'edit' || profile === 'rlv') && (!option || uuid(option)) ? 'enforced' : 'unsupported'
  }
  if (behaviour === 'editobj') return profile !== 'disabled' && uuid(option) ? 'enforced' : 'unsupported'
  if (switches.has(behaviour)) return profile !== 'disabled' && !option ? 'enforced' : 'unsupported'
  return undefined
}

export interface AvatarEditAction {
  readonly action: 'edit'
  readonly target: string
  readonly status: 'opened' | 'blocked' | 'unsupported'
  readonly reason?: string
  readonly restrictions: readonly RlvRestriction[]
}
export interface AvatarRezAction {
  readonly action: 'rez'
  readonly itemId: string
  readonly position: Vector
  readonly status: 'rezzed' | 'blocked' | 'unsupported'
  readonly object?: Linkset
  readonly reason?: string
  readonly restrictions: readonly RlvRestriction[]
}
const edits = new WeakMap<WorldAvatar, readonly AvatarEditAction[]>()
const rezzes = new WeakMap<WorldAvatar, readonly AvatarRezAction[]>()
export const avatarEditLog = (avatar: WorldAvatar): readonly AvatarEditAction[] => edits.get(avatar) ?? Object.freeze([])
export const avatarRezLog = (avatar: WorldAvatar): readonly AvatarRezAction[] => rezzes.get(avatar) ?? Object.freeze([])

/** Explicit editor selection; no touch or distance permission is implied. */
export function attemptAvatarEdit(world: World, avatar: WorldAvatar, prim: Prim): AvatarEditAction {
  const record = (status: AvatarEditAction['status'], reason?: string, restrictions: readonly RlvRestriction[] = []): AvatarEditAction => {
    const result: AvatarEditAction = Object.freeze({ action: 'edit', target: prim.key, status,
      ...(reason ? { reason } : {}), restrictions: Object.freeze([...restrictions]) })
    edits.set(avatar, Object.freeze([...avatarEditLog(avatar), result]))
    return result
  }
  if (!world.avatars.includes(avatar)) return record('unsupported', 'avatar')
  const linkset = prim.linkset
  if (!linkset || linkset.dead || linkset.world !== world || !world.linksets.includes(linkset) || !linkset.prims.includes(prim)) return record('unsupported', 'target')
  if (avatar.viewer.profile === 'disabled') return record('opened')
  const rules = avatar.viewer.restrictions.snapshot().filter(rule => rule.support === 'enforced')
  const root = linkset.prims[0]!.key.toLowerCase()
  const family = rules.filter(rule => rule.behaviour === 'edit' || rule.behaviour === 'edit_sec')
  const blocks = family.filter(rule => !rule.option)
  const grants = family.filter(rule => rule.option === root)
  const strict = avatar.viewer.profile === 'rlv' && rules.some(rule => rule.behaviour === 'permissive' && !rule.option)
  const missing = blocks.filter(rule => (strict || rule.behaviour === 'edit_sec') && !grants.some(grant => grant.sourcePrim === rule.sourcePrim))
  const denials = [
    ...(missing.length ? missing : grants.length ? [] : blocks),
    ...rules.filter(rule => rule.behaviour === 'editobj' && rule.option === root),
    ...rules.filter(rule => !rule.option && rule.behaviour === (linkset.attachment ? 'editattach' : 'editworld')),
    ...rules.filter(rule => avatar.viewer.profile === 'rlv' && rule.behaviour === 'interact' && !rule.option &&
      !(linkset.attachment && linkset.attachment.point >= 31 && linkset.attachment.point <= 38)),
  ]
  return denials.length ? record('blocked', denials[0]!.behaviour, denials) : record('opened')
}

/** Drop a saved, copyable inventory object into the avatar's current region. */
export function attemptAvatarRez(world: World, avatar: WorldAvatar, itemId: string, position: Vector): AvatarRezAction {
  const record = (status: AvatarRezAction['status'], reason?: string, restrictions: readonly RlvRestriction[] = [], object?: Linkset): AvatarRezAction => {
    const result: AvatarRezAction = Object.freeze({ action: 'rez', itemId, position: Object.freeze({ ...position }), status,
      ...(reason ? { reason } : {}), ...(object ? { object } : {}), restrictions: Object.freeze([...restrictions]) })
    rezzes.set(avatar, Object.freeze([...avatarRezLog(avatar), result]))
    return result
  }
  if (!world.avatars.includes(avatar)) return record('unsupported', 'avatar')
  if (!Object.values(position).every(Number.isFinite) || !world.regionNamed(avatar.region)) return record('unsupported', 'position')
  const denials = avatar.viewer.profile === 'disabled' ? [] : avatar.viewer.restrictions.snapshot()
    .filter(rule => rule.support === 'enforced' && !rule.option && (rule.behaviour === 'rez' || rule.behaviour === 'interact'))
  if (denials.length) return record('blocked', denials[0]!.behaviour, denials)
  const item = avatar.viewer.inventory.snapshot().find(entry => entry.id === itemId && entry.kind === 'item')
  if (!item?.object?.prims.length || item.wearableType) return record('unsupported', 'item')
  if (item.content && !(item.content.permMask.owner & PERM_COPY)) return record('unsupported', 'no-copy-item')
  const object = item.object.copy({ world, region: avatar.region, owner: avatar.key })
  object.prims[0]!.params.position = { ...position }
  object.setTemporary(object.prims[0]!.params.tempOnRez)
  for (const script of object.allScripts()) script.queueRez()
  return record('rezzed', undefined, [], object)
}
