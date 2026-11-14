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
export interface AvatarTakeAction {
  readonly action: 'take'
  /** The object's root key. */
  readonly target: string
  readonly copy: boolean
  readonly status: 'taken' | 'blocked' | 'unsupported'
  /** The object as it went into inventory. */
  readonly object?: Linkset
  readonly reason?: string
  readonly restrictions: readonly RlvRestriction[]
}
const edits = new WeakMap<WorldAvatar, readonly AvatarEditAction[]>()
const takes = new WeakMap<WorldAvatar, readonly AvatarTakeAction[]>()
export const avatarTakeLog = (avatar: WorldAvatar): readonly AvatarTakeAction[] => takes.get(avatar) ?? Object.freeze([])
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
  const denials = editDenials(avatar, linkset)
  return denials.length ? record('blocked', denials[0]!.behaviour, denials) : record('opened')
}

function editDenials(avatar: WorldAvatar, linkset: Linkset): RlvRestriction[] {
  if (avatar.viewer.profile === 'disabled') return []
  const rules = avatar.viewer.restrictions.snapshot().filter(rule => rule.support === 'enforced')
  const root = linkset.prims[0]!.key.toLowerCase()
  const family = rules.filter(rule => rule.behaviour === 'edit' || rule.behaviour === 'edit_sec')
  const blocks = family.filter(rule => !rule.option)
  const grants = family.filter(rule => rule.option === root)
  const strict = avatar.viewer.profile === 'rlv' && rules.some(rule => rule.behaviour === 'permissive' && !rule.option)
  const missing = blocks.filter(rule => (strict || rule.behaviour === 'edit_sec') && !grants.some(grant => grant.sourcePrim === rule.sourcePrim))
  return [
    ...(missing.length ? missing : grants.length ? [] : blocks),
    ...rules.filter(rule => rule.behaviour === 'editobj' && rule.option === root),
    ...rules.filter(rule => !rule.option && rule.behaviour === (linkset.attachment ? 'editattach' : 'editworld')),
    ...rules.filter(rule => avatar.viewer.profile === 'rlv' && rule.behaviour === 'interact' && !rule.option &&
      !(linkset.attachment && linkset.attachment.point >= 31 && linkset.attachment.point <= 38)),
  ]
}

/**
 * Take an object the avatar owns into inventory, or a copy of it. A taken object leaves the
 * world, and either way an avatar sitting on it is stood up.
 *
 * The refusals are the viewers' own, read from their menu code. No viewer offers Take for the
 * object its avatar sits on. Firestorm RLVa refuses a copy of that object under `unsit`, and
 * a take under `rez`, `edit` or an edit lock on the object. Kokua RLV refuses a take under
 * `rez` and has no check on a copy.
 */
export function attemptAvatarTake(world: World, avatar: WorldAvatar, prim: Prim, options: { copy?: boolean } = {}): AvatarTakeAction {
  const copy = !!options.copy
  const linkset = prim.linkset
  const record = (status: AvatarTakeAction['status'], reason?: string, restrictions: readonly RlvRestriction[] = [], object?: Linkset): AvatarTakeAction => {
    const result: AvatarTakeAction = Object.freeze({ action: 'take', target: linkset?.prims[0]?.key ?? prim.key, copy, status,
      ...(reason ? { reason } : {}), ...(object ? { object } : {}), restrictions: Object.freeze([...restrictions]) })
    takes.set(avatar, Object.freeze([...avatarTakeLog(avatar), result]))
    return result
  }
  if (!world.avatars.includes(avatar)) return record('unsupported', 'avatar')
  if (!linkset || linkset.dead || linkset.world !== world || !world.linksets.includes(linkset) || !linkset.prims.includes(prim)) return record('unsupported', 'target')
  if (linkset.attachment) return record('unsupported', 'worn')
  if (linkset.owner.toLowerCase() !== avatar.key.toLowerCase()) return record('unsupported', 'owner')
  const seated = avatar.sittingOn?.linkset === linkset
  if (seated && !copy) return record('unsupported', 'seated')
  const { profile } = avatar.viewer
  const rules = profile === 'disabled' ? [] : avatar.viewer.restrictions.snapshot().filter(rule => rule.support === 'enforced')
  const named = (...behaviours: string[]) => rules.filter(rule => !rule.option && behaviours.includes(rule.behaviour))
  // RLVa looks at the object only while edit, rez or unsit is set, or any object is edit-locked.
  const checked = named('edit', 'rez', 'unsit').length > 0 || rules.some(rule => rule.behaviour === 'editobj')
  const denials = copy
    ? profile === 'rlva' && seated ? named('unsit') : []
    : profile !== 'rlva' ? named('rez')
      : checked ? [...new Set([...editDenials(avatar, linkset), ...named('edit', 'rez')])] : []
  if (denials.length) return record('blocked', denials[0]!.behaviour, denials)
  const object = linkset.copy()
  if (!copy) linkset.remove()
  return record('taken', undefined, [], object)
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
  const retained = avatar.viewer.inventory.attachmentObject(itemId)
  const definition = retained && !retained.dead ? retained : item?.object
  // The viewer refuses to rez an item that is worn.
  if (retained && !retained.dead && retained.attachment) return record('unsupported', 'worn')
  if (!item || !definition?.prims.length || item.wearableType) return record('unsupported', 'item')
  if (item.content && !(item.content.permMask.owner & PERM_COPY)) return record('unsupported', 'no-copy-item')
  const object = definition.copy({ world, region: avatar.region, owner: avatar.key })
  object.prims[0]!.params.position = { ...position }
  object.setTemporary(object.prims[0]!.params.tempOnRez)
  for (const script of object.allScripts()) script.queueRez()
  return record('rezzed', undefined, [], object)
}
