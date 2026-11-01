import type { Linkset } from '../linkset.js'
import type { Prim } from '../prim.js'
import type { WorldAvatar } from '../world.js'
import type { RlvParsedCommand } from './classifier.js'
import { dispatchRestrictionCommand } from './restrictions.js'

export type RlvDetachOutcome = 'allowed' | 'blocked' | 'no-op'

function wornBy(avatar: WorldAvatar, linkset: Linkset): boolean {
  return !linkset.dead && !!linkset.world?.avatars.includes(avatar) &&
    linkset.attachment?.avatar.toLowerCase() === avatar.key.toLowerCase()
}

export function isRlvDetachLocked(avatar: WorldAvatar, linkset: Linkset): boolean {
  return avatar.viewer.profile !== 'disabled' && avatar.viewer.restrictions.snapshot().some(rule =>
    rule.behaviour === 'detach' && !rule.option && linkset.prims.some(prim => prim.key === rule.sourcePrim))
}

/** A viewer action; attach events are delivered when the fixture clock drains. */
export function attemptViewerDetach(avatar: WorldAvatar, linkset: Linkset): RlvDetachOutcome {
  if (!wornBy(avatar, linkset)) return 'no-op'
  if (isRlvDetachLocked(avatar, linkset)) return 'blocked'
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
