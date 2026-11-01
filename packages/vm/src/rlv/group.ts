import type { Prim } from '../prim.js'
import type { WorldAvatar } from '../world.js'
import { NULL_KEY } from '../values/types.js'
import { rlvIntegerPrefix, type RlvParsedCommand } from './classifier.js'
import type { ViewerProfile } from './profiles.js'
import { isValidReplyChannel, sendViewerReply } from './reply.js'

/** Group membership and optional role data supplied by the avatar fixture. */
export interface AvatarGroup {
  readonly key: string
  readonly name: string
  readonly roles?: readonly { readonly key: string; readonly name: string }[]
  activeRole?: string
}

export function groupSupport(_profile: ViewerProfile, behaviour: string, option: string): 'enforced' | 'unsupported' | undefined {
  return behaviour === 'setgroup' ? option ? 'unsupported' : 'enforced' : undefined
}

/** User changes never receive an issuing object's exemption. */
export function userChangeAvatarGroup(avatar: WorldAvatar, key: string): boolean {
  if (avatar.viewer.profile !== 'disabled' && groupLocked(avatar)) return false
  const canonical = key.toLowerCase()
  const member = avatar.groups.find(group => group.key.toLowerCase() === canonical)
  if (canonical !== NULL_KEY && !member) return false
  avatar.group = member?.key ?? NULL_KEY
  return true
}

function groupLocked(avatar: WorldAvatar, issuer?: string): boolean {
  return avatar.viewer.restrictions.snapshot().some(rule => rule.behaviour === 'setgroup' && !rule.option &&
    (avatar.viewer.profile === 'rlv' || rule.sourcePrim !== issuer))
}

const throttles = new WeakMap<object, { until: number; owner: string | null }>()
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Exact matches win; otherwise the last case-insensitive prefix wins. */
function matchName<T extends { readonly name: string }>(entries: readonly T[], name: string): T | undefined {
  let match: T | undefined
  for (const entry of entries) {
    if (!entry.name.toLowerCase().startsWith(name)) continue
    match = entry
    if (entry.name.length === name.length) break
  }
  return match
}

export function dispatchGroupCommand(avatar: WorldAvatar, prim: Prim, parsed: RlvParsedCommand, command: string): boolean {
  const viewer = avatar.viewer
  if (viewer.profile === 'disabled') return false
  if (parsed.behaviour === 'getgroup' && (viewer.profile === 'rlv' || parsed.kind === 'query')) {
    const channel = rlvIntegerPrefix(parsed.parameter)
    if (channel === undefined || !isValidReplyChannel(viewer.profile, channel)) return false
    const text = avatar.group.toLowerCase() === NULL_KEY ? 'none'
      : avatar.groups.find(group => group.key.toLowerCase() === avatar.group.toLowerCase())?.name ?? ''
    const reply = sendViewerReply(prim.linkset!, avatar, channel, text, command)!
    viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'replied', reply })
    return true
  }
  if (parsed.behaviour !== 'setgroup' || parsed.kind !== 'force') return false
  const record = (outcome?: 'failed-lock' | 'failed-option' | 'failed-throttled') => {
    viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: outcome ? 'ignored' : 'enforced', ...(outcome ? { outcome } : {}) })
    return true
  }
  if (groupLocked(avatar, prim.key)) return record('failed-lock')
  if (viewer.profile === 'rlv') {
    const option = parsed.option.replace(/^#rlv\//, '')
    const group = avatar.groups.find(group => group.name.toLowerCase() === option)
    if (option === 'none') avatar.group = NULL_KEY
    else if (group) avatar.group = group.key
    return record()
  }
  const options = parsed.option.split(';')
  if (!parsed.option || options.length > 2) return record('failed-option')
  const name = options[0]!
  const group = uuid.test(name) ? avatar.groups.find(group => group.key.toLowerCase() === name) : matchName(avatar.groups, name)
  const none = name === 'none' || name === NULL_KEY
  if (!none && !group) return record('failed-option')
  const now = prim.linkset!.clock.now
  const lifetime = viewer.session.lifetime
  let throttle = throttles.get(lifetime)
  if (!throttle || now >= throttle.until) {
    throttle = { until: now + 60000, owner: null }
    throttles.set(lifetime, throttle)
  } else if (throttle.owner === null && viewer.restrictions.snapshot(prim.key).some(rule => rule.behaviour === 'setgroup' && !rule.option)) {
    throttle.owner = prim.key
    throttle.until = now + 60000
  } else return record('failed-throttled')
  avatar.group = none ? NULL_KEY : group!.key
  if (!none && options.length === 2) {
    const roles = [...(group!.roles ?? [])].sort((a, b) => a.key.toLowerCase().localeCompare(b.key.toLowerCase()))
    const role = matchName(roles, options[1]!)
    if (role) group!.activeRole = role.key
  }
  return record()
}
