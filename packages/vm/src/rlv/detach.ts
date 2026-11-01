import { isRlvFolderWearLocked } from './inventory.js'
import type { Linkset } from '../linkset.js'
import type { Prim } from '../prim.js'
import type { WorldAvatar } from '../world.js'
import type { RlvParsedCommand } from './classifier.js'
import { isRlvInventoryWearLocked } from './outfit.js'
import { getRlvAttachmentPoint } from './attachments.js'
import type { ViewerProfile } from './profiles.js'
import type { RlvRestriction } from './restrictions.js'
import { dispatchRestrictionCommand } from './restrictions.js'

export type RlvDetachOutcome = 'allowed' | 'blocked' | 'no-op'

function wornBy(avatar: WorldAvatar, linkset: Linkset): boolean {
  return !linkset.dead && !!linkset.world?.avatars.includes(avatar) &&
    linkset.attachment?.avatar.toLowerCase() === avatar.key.toLowerCase()
}

/** Recognized lock forms; arbitrary Kokua wire rules remain inspectable. */
export function attachmentLockSupport(profile: ViewerProfile, behaviour: string, option: string): RlvRestriction['support'] | undefined {
  if (!['detach', 'addattach', 'remattach'].includes(behaviour)) return undefined
  return profile !== 'disabled' && (!option || getRlvAttachmentPoint(option) !== undefined) ? 'enforced' : 'unsupported'
}

export function isRlvPointLocked(avatar: WorldAvatar, point: number, action: 'add' | 'remove',
  rules = avatar.viewer.restrictions.snapshot()): boolean {
  if (avatar.viewer.profile === 'disabled') return false
  return rules.some(rule => {
    if (rule.behaviour === 'detach') return !!rule.option && getRlvAttachmentPoint(rule.option) === point &&
      (action === 'remove' || avatar.viewer.profile === 'rlva')
    return rule.behaviour === (action === 'add' ? 'addattach' : 'remattach') &&
      (!rule.option || getRlvAttachmentPoint(rule.option) === point)
  })
}

export function isRlvDetachLocked(avatar: WorldAvatar, linkset: Linkset,
  rules = avatar.viewer.restrictions.snapshot()): boolean {
  return avatar.viewer.profile !== 'disabled' &&
    (isRlvFolderWearLocked(avatar, avatar.viewer.inventory.attachmentItem(linkset.prims[0]!.key), false, rules) ||
      isRlvPointLocked(avatar, linkset.attachment?.point ?? 0, 'remove', rules) || rules.some(rule =>
      rule.behaviour === 'detach' && !rule.option && linkset.prims.some(prim => prim.key === rule.sourcePrim)))
}

/** Explicit user wear at a canonical point. Simulator fixture attachment bypasses viewer locks. */
export function attemptViewerAttach(avatar: WorldAvatar, linkset: Linkset, point: number,
  replace = false): RlvDetachOutcome {
  if (linkset.dead || linkset.attachment || !linkset.prims.length || !linkset.world?.avatars.includes(avatar) ||
    linkset.region !== avatar.region || linkset.owner.toLowerCase() !== avatar.key.toLowerCase() ||
    !Number.isInteger(point) || point < 1 || point > 55) return 'no-op'
  const occupants = linkset.peers.filter(peer => wornBy(avatar, peer) && peer.attachment?.point === point)
  const inventory = avatar.viewer.inventory
  if (isRlvPointLocked(avatar, point, 'add') ||
    isRlvInventoryWearLocked(avatar, inventory.attachmentItem(linkset.prims[0]!.key), true) ||
    replace && occupants.some(peer => isRlvDetachLocked(avatar, peer) ||
      isRlvInventoryWearLocked(avatar, inventory.attachmentItem(peer.prims[0]!.key), false))) return 'blocked'
  if (replace) for (const peer of occupants) peer.detachFromAvatar()
  linkset.attachToAvatar(avatar.key, point)
  return 'allowed'
}

/** A viewer action; attach events are delivered when the fixture clock drains. */
export function attemptViewerDetach(avatar: WorldAvatar, linkset: Linkset): RlvDetachOutcome {
  if (!wornBy(avatar, linkset)) return 'no-op'
  if (isRlvDetachLocked(avatar, linkset) ||
    isRlvInventoryWearLocked(avatar, avatar.viewer.inventory.attachmentItem(linkset.prims[0]!.key), false)) return 'blocked'
  linkset.detachFromAvatar()
  return 'allowed'
}

/** Only no-option locks and force self-detach belong to this action family. */
export function dispatchDetachCommand(linkset: Linkset, prim: Prim, avatar: WorldAvatar,
  parsed: RlvParsedCommand, command: string): boolean {
  const viewer = avatar.viewer
  if (parsed.behaviour === 'detach' && !parsed.option && (parsed.kind === 'add' || parsed.kind === 'remove')) {
    return dispatchRestrictionCommand(viewer, prim, parsed, command)
  }
  if (parsed.behaviour !== 'detachme' || parsed.kind !== 'force') return false
  let outcome: RlvDetachOutcome | 'failed-option'
  if (viewer.profile === 'rlva' && parsed.option) outcome = 'failed-option'
  else if (!wornBy(avatar, linkset) || viewer.profile === 'rlva' && prim !== linkset.prims[0]) outcome = 'no-op'
  else if (isRlvDetachLocked(avatar, linkset)) outcome = 'blocked'
  else {
    // Keep simulator completion outside the owner-say handler, as for LSL detach.
    linkset.clock.scheduleTask(linkset, linkset.clock.now, () => linkset.detachFromAvatar())
    outcome = 'allowed'
  }
  viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'enforced', outcome })
  return true
}
