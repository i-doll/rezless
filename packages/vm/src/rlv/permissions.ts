import { AGENT_SITTING, PERMISSION_ATTACH, PERMISSION_TAKE_CONTROLS, PERMISSION_TRIGGER_ANIMATION } from '../generated/constants.js'
import type { Linkset } from '../linkset.js'
import type { WorldAvatar } from '../world.js'
import type { ViewerProfile } from './profiles.js'
import type { RlvRestriction } from './restrictions.js'

export function permissionSupport(profile: ViewerProfile, behaviour: string, option: string): RlvRestriction['support'] | undefined {
  if (behaviour !== 'acceptpermission') return undefined
  return profile !== 'disabled' && !option ? 'enforced' : 'unsupported'
}

/** Accept the entire request or leave it pending; option rules grant no exceptions. */
export function acceptsRlvPermissions(avatar: WorldAvatar, requester: Linkset, permissions: number): boolean {
  const viewer = avatar.viewer
  if (viewer.profile === 'disabled' || !viewer.restrictions.snapshot().some(rule =>
    rule.behaviour === 'acceptpermission' && !rule.option && rule.support === 'enforced')) return false
  const owned = requester.owner.toLowerCase() === avatar.key.toLowerCase()
  if (viewer.profile === 'rlva') {
    const covered = PERMISSION_TAKE_CONTROLS | (owned && !requester.attachment ? PERMISSION_ATTACH : 0)
    return (permissions & ~covered) === 0
  }
  const covered = PERMISSION_TAKE_CONTROLS | PERMISSION_TRIGGER_ANIMATION | PERMISSION_ATTACH
  return (permissions & ~covered) === 0 &&
    (!(permissions & PERMISSION_TRIGGER_ANIMATION) || !!(avatar.info & AGENT_SITTING)) &&
    (!(permissions & PERMISSION_ATTACH) || owned)
}
