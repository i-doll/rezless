import { CHANGED_OWNER, PERM_COPY, PERM_TRANSFER } from '../generated/constants.js'
import { forNextOwner, nextOwnerMask } from '../inventory.js'
import type { Linkset } from '../linkset.js'
import type { Prim } from '../prim.js'
import { NULL_KEY, type Vector } from '../values/types.js'
import type { World, WorldAvatar } from '../world.js'
import type { ViewerProfile } from './profiles.js'
import type { RlvRestriction } from './restrictions.js'
import { isRlvDetachLocked } from './detach.js'
import { isRlvInventoryWearLocked } from './outfit.js'
import { rlvaPieMenuDenials } from './touch.js'
import { endBeforeTake, rezzedMoving, SELECTION_MS, selectMotion, stillCopy } from '../builtins/motion.js'

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
export interface AvatarDropAction {
  readonly action: 'drop'
  /** The object's root key. */
  readonly target: string
  readonly status: 'dropped' | 'blocked' | 'unsupported'
  readonly reason?: string
  readonly restrictions: readonly RlvRestriction[]
}
export interface AvatarDuplicateAction {
  readonly action: 'duplicate'
  /** The original's root key. */
  readonly target: string
  readonly status: 'duplicated' | 'blocked' | 'unsupported'
  readonly object?: Linkset
  readonly reason?: string
  readonly restrictions: readonly RlvRestriction[]
}
export interface AvatarTakeOptions {
  readonly copy?: boolean
  /** Global-axis offset from the clicked prim's center to the point right-clicked. */
  readonly offset?: Vector
}
const edits = new WeakMap<WorldAvatar, readonly AvatarEditAction[]>()
const drops = new WeakMap<WorldAvatar, readonly AvatarDropAction[]>()
const duplicates = new WeakMap<WorldAvatar, readonly AvatarDuplicateAction[]>()
export const avatarDropLog = (avatar: WorldAvatar): readonly AvatarDropAction[] => drops.get(avatar) ?? Object.freeze([])
export const avatarDuplicateLog = (avatar: WorldAvatar): readonly AvatarDuplicateAction[] => duplicates.get(avatar) ?? Object.freeze([])
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
  if (denials.length) return record('blocked', denials[0]!.behaviour, denials)
  selectMotion(linkset, SELECTION_MS.edit)
  return record('opened')
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
 * world, and either way an avatar sitting on it is stood up, also when another avatar takes
 * the copy. Another avatar may take a copy of an object that everyone may copy, with its
 * contents.
 *
 * The refusals are the viewers' own, read from their menu code. No viewer offers Take for the
 * object its avatar sits on. Firestorm RLVa opens no menu on the object under `interact`, or when
 * both the prim's center is past the `fartouch` reach and the clicked point (`offset` from that
 * center) is more than 1.5 m away. It refuses a copy of the seat under `unsit`, and a take under
 * `rez`, `edit` or an edit lock on the object. Kokua RLV refuses a take under `rez` and has no check on a copy.
 */
export function attemptAvatarTake(world: World, avatar: WorldAvatar, prim: Prim, options: AvatarTakeOptions = {}): AvatarTakeAction {
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
  // In-world: another avatar could take a copy once the object and the script in it could be
  // copied by everyone. With the script left as it was, the object read as no-copy to them.
  const foreign = linkset.owner.toLowerCase() !== avatar.key.toLowerCase()
  if (foreign && !(copy && linkset.owner !== NULL_KEY && copyableByEveryone(linkset))) return record('unsupported', 'owner')
  const seated = avatar.sittingOn?.linkset === linkset
  if (seated && !copy) return record('unsupported', 'seated')
  const { profile } = avatar.viewer
  const rules = profile === 'disabled' ? [] : avatar.viewer.restrictions.snapshot().filter(rule => rule.support === 'enforced')
  const named = (...behaviours: string[]) => rules.filter(rule => !rule.option && behaviours.includes(rule.behaviour))
  // RLVa looks at the object only while edit, rez or unsit is set, or any object is edit-locked.
  const checked = named('edit', 'rez', 'unsit').length > 0 || rules.some(rule => rule.behaviour === 'editobj')
  const pieMenu = profile === 'rlva' ? rlvaPieMenuDenials(world, avatar, prim, options.offset) : []
  const denials = pieMenu.length ? pieMenu : copy
    ? profile === 'rlva' && seated ? named('unsit') : []
    : profile !== 'rlva' ? named('rez')
      : checked ? [...new Set([...editDenials(avatar, linkset), ...named('edit', 'rez')])] : []
  if (denials.length) return record('blocked', denials[0]!.behaviour, denials)
  if (!foreign) {
    const paused = selectMotion(linkset, SELECTION_MS.copy)
    if (paused) endBeforeTake(linkset)
    // In-world: an llDie in that moving_end, at a Take or a Take Copy, left no item.
    if (linkset.dead) return record('unsupported', 'target')
    const object = linkset.copy()
    if (paused) stillCopy(object)
    if (!copy) linkset.remove()
    return record('taken', undefined, [], object)
  }
  // In-world: another avatar's Take Copy left a looping box moving with no event, and the copy
  // rezzed moving on with on_rez only, its scripts having been told of no moving_end (two runs).
  const waiting = new Set(linkset.clock.pendingEvents())
  const object = linkset.copy({ owner: avatar.key })
  for (const prim of object.prims) {
    prim.permMask = nextOwnerMask(prim.permMask)
    for (const item of prim.inventory) Object.assign(item, forNextOwner(item))
  }
  // In-world: the original's scripts got changed(CHANGED_OWNER) when another avatar took a copy,
  // after the events already waiting, and still read their old owner. A copy taken by the owner
  // raised nothing. When the copy stood up an avatar sitting on the object, whoever that was,
  // the stand and the new owner came as one changed(160).
  const stands = linkset.clock.pendingEvents().filter(e => !waiting.has(e) && e.event === 'changed')
  for (const script of linkset.allScripts()) {
    const stand = stands.find(e => e.target === script)
    if (stand) stand.payload['changes'] = (stand.payload['changes'] as number) | CHANGED_OWNER
    else linkset.clock.schedule(script, linkset.clock.now, 'changed', { changes: CHANGED_OWNER })
  }
  return record('taken', undefined, [], object)
}

function copyableByEveryone(linkset: Linkset): boolean {
  return linkset.prims.every(prim => prim.permMask.everyone & PERM_COPY && prim.permMask.owner & PERM_TRANSFER &&
    prim.inventory.every(item => item.permMask.everyone & PERM_COPY && item.permMask.owner & PERM_TRANSFER))
}

/**
 * Drop a worn object to the ground with the viewer's Drop, at `position` or where the avatar
 * stands (see `Linkset.dropFromAvatar`). Viewers offer Drop only for an attachment that has an
 * inventory item, so not for a temporary one.
 *
 * Firestorm RLVa refuses it for a locked attachment and under `rez`, and opens no menu on an
 * attachment other than a HUD under `interact`. Kokua RLV refuses it under `rez` and for a locked attachment.
 */
export function attemptAvatarDrop(world: World, avatar: WorldAvatar, linkset: Linkset, position?: Vector): AvatarDropAction {
  const record = (status: AvatarDropAction['status'], reason?: string, restrictions: readonly RlvRestriction[] = []): AvatarDropAction => {
    const result: AvatarDropAction = Object.freeze({ action: 'drop', target: linkset.prims[0]?.key ?? NULL_KEY, status,
      ...(reason ? { reason } : {}), restrictions: Object.freeze([...restrictions]) })
    drops.set(avatar, Object.freeze([...avatarDropLog(avatar), result]))
    return result
  }
  if (!world.avatars.includes(avatar)) return record('unsupported', 'avatar')
  const attached = linkset.attachment
  if (linkset.dead || linkset.world !== world || !attached || attached.avatar.toLowerCase() !== avatar.key.toLowerCase()) return record('unsupported', 'target')
  if (attached.temporary) return record('unsupported', 'temporary')
  if (position && !Object.values(position).every(Number.isFinite)) return record('unsupported', 'position')
  const { profile } = avatar.viewer
  const rules = profile === 'disabled' ? [] : avatar.viewer.restrictions.snapshot().filter(rule => rule.support === 'enforced')
  const locked = (subset: readonly RlvRestriction[]) => isRlvDetachLocked(avatar, linkset, subset) ||
    isRlvInventoryWearLocked(avatar, avatar.viewer.inventory.attachmentItem(linkset.prims[0]!.key), false, subset)
  // Decided on the whole set, where exceptions apply, then named rule by rule.
  const locks = locked(rules) ? rules.filter(rule => locked([rule])) : []
  const rez = rules.filter(rule => rule.behaviour === 'rez' && !rule.option)
  const hud = attached.point >= 31 && attached.point <= 38
  const interact = profile === 'rlva' && !hud ? rules.filter(rule => rule.behaviour === 'interact' && !rule.option) : []
  const denials = interact.length ? interact : [...locks, ...rez]
  if (denials.length) return record('blocked', denials[0]!.behaviour, denials)
  linkset.dropFromAvatar(position)
  return record('dropped')
}

/**
 * Copy an object the avatar owns with the viewer's Duplicate, `offset` from the original (see
 * `Linkset.duplicate`). An avatar may sit on the original.
 *
 * Firestorm RLVa refuses it under `interact`, and while `edit`, `rez` or `unsit` is set or any
 * object is edit-locked it refuses an object the avatar can't edit, any object under `edit` or
 * `rez`, and the object the avatar sits on under `unsit`. It needs the object selected, which
 * under `fartouch` takes the same reach as Take: the prim's center, or the clicked point
 * (`clicked`, from that center) within 1.5 m. Kokua RLV refuses an object the avatar can't edit,
 * which the build tools need selected.
 */
export function attemptAvatarDuplicate(world: World, avatar: WorldAvatar, prim: Prim, offset: Vector = { x: 0, y: 0, z: 0 }, clicked?: Vector): AvatarDuplicateAction {
  const linkset = prim.linkset
  const record = (status: AvatarDuplicateAction['status'], reason?: string, restrictions: readonly RlvRestriction[] = [], object?: Linkset): AvatarDuplicateAction => {
    const result: AvatarDuplicateAction = Object.freeze({ action: 'duplicate', target: linkset?.prims[0]?.key ?? prim.key, status,
      ...(reason ? { reason } : {}), ...(object ? { object } : {}), restrictions: Object.freeze([...restrictions]) })
    duplicates.set(avatar, Object.freeze([...avatarDuplicateLog(avatar), result]))
    return result
  }
  if (!world.avatars.includes(avatar)) return record('unsupported', 'avatar')
  if (!linkset || linkset.dead || linkset.world !== world || !world.linksets.includes(linkset) || !linkset.prims.includes(prim)) return record('unsupported', 'target')
  if (linkset.attachment) return record('unsupported', 'worn')
  if (linkset.owner.toLowerCase() !== avatar.key.toLowerCase()) return record('unsupported', 'owner')
  if (linkset.prims.some(prim => !(prim.permMask.owner & PERM_COPY) || prim.inventory.some(item => !(item.permMask.owner & PERM_COPY)))) {
    return record('unsupported', 'no-copy')
  }
  if (!Object.values(offset).every(Number.isFinite)) return record('unsupported', 'position')
  const { profile } = avatar.viewer
  const rules = profile === 'disabled' ? [] : avatar.viewer.restrictions.snapshot().filter(rule => rule.support === 'enforced')
  const named = (...behaviours: string[]) => rules.filter(rule => !rule.option && behaviours.includes(rule.behaviour))
  const seated = avatar.sittingOn?.linkset === linkset
  const checked = named('edit', 'rez', 'unsit').length > 0 || rules.some(rule => rule.behaviour === 'editobj')
  const pieMenu = profile === 'rlva' ? rlvaPieMenuDenials(world, avatar, prim, clicked) : []
  const denials = profile === 'rlv' ? editDenials(avatar, linkset)
    : pieMenu.length ? pieMenu
      : checked ? [...new Set([...editDenials(avatar, linkset), ...named('edit', 'rez'), ...seated ? named('unsit') : []])] : []
  if (denials.length) return record('blocked', denials[0]!.behaviour, denials)
  return record('duplicated', undefined, [], linkset.duplicate(offset))
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
  rezzedMoving(object, false)
  object.applyStoppedPastWearChanges()
  return record('rezzed', undefined, [], object)
}
