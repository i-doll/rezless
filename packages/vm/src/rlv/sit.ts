import { AGENT_SITTING } from '../generated/constants.js'
import { NULL_KEY, ZERO_VECTOR, type Vector } from '../values/types.js'
import type { World, WorldAvatar } from '../world.js'
import type { Linkset } from '../linkset.js'
import type { Prim } from '../prim.js'
import type { RlvParsedCommand } from './classifier.js'
import type { RlvCommandRecord } from './profiles.js'

/** Both profiles report the object root; RLVa reports the avatar on the ground. */
export function getRlvSitId(avatar: WorldAvatar): string {
  const seat = avatar.sittingOn
  if (seat) return seat.linkset!.prims[0]!.key
  return avatar.viewer.profile === 'rlva' && avatar.info & AGENT_SITTING ? avatar.key : NULL_KEY
}

type Action = Extract<RlvCommandRecord, { status: 'action' }>

/** Force actions use world constraints and do not grant script permissions. */
export function dispatchSeatingCommand(linkset: Linkset, prim: Prim, avatar: WorldAvatar,
  parsed: RlvParsedCommand, command: string): boolean {
  if (parsed.kind !== 'force' || parsed.behaviour !== 'sit' && parsed.behaviour !== 'unsit') return false
  const { viewer } = avatar
  if (parsed.behaviour === 'unsit' && parsed.option) return false
  if (parsed.behaviour === 'sit' && parsed.option && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(parsed.option)) return false
  const world = linkset.world!
  const sitting = !!(avatar.info & AGENT_SITTING)
  const target = parsed.behaviour === 'sit' ? parsed.option || NULL_KEY : getRlvSitId(avatar)
  const locked = (behaviour: string, except?: string) => viewer.restrictions.snapshot()
    .some(rule => rule.behaviour === behaviour && !rule.option && rule.sourcePrim !== except)
  const record = (actionOutcome: Action['actionOutcome'], reason?: Action['reason']): true => {
    viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'action', action: parsed.behaviour as 'sit' | 'unsit',
      actionOutcome, target, seat: getRlvSitId(avatar), ...(reason ? { reason } : {}) })
    return true
  }
  if (parsed.behaviour === 'unsit') {
    if (!sitting) return record('unchanged')
    if (locked('unsit', viewer.profile === 'rlva' ? prim.key : undefined)) return record('refused', 'restriction')
    world.standAvatar(avatar)
    return record('applied')
  }
  if (target === NULL_KEY) {
    if (viewer.profile === 'rlv') return record('refused', 'target-unavailable')
    if (locked('sit', prim.key) || sitting && locked('unsit', prim.key)) return record('refused', 'restriction')
    if (sitting && !avatar.sittingOn) return record('unchanged')
    world.sitAvatarOnGround(avatar)
    return record('applied')
  }
  if (locked('sit') || sitting && locked('unsit')) return record('refused', 'restriction')
  const requested = world.linksets.flatMap(l => l.prims).find(p => p.key.toLowerCase() === target)
  if (!requested) return record('refused', 'target-unavailable')
  const seats = requested.linkset!
  // Reject invalid world targets before considering their geometry or range.
  if (seats.dead || seats.attachment || seats.region !== avatar.region) return record('refused', 'world-constraint')
  const free = (p: Prim) => !world.avatars.some(a => a !== avatar && a.sittingOn === p)
  const configured = [requested, ...seats.prims.filter(p => p !== requested)]
    .filter(p => p.params.sitTarget.enabled)
  const seat = configured.find(free) ?? (configured.length ? undefined : requested)
  if (!seat) return record('refused', 'world-constraint')
  if (!seat.params.sitTarget.enabled) {
    const position = seat.regionPosition()
    const origin = avatar.position
    if (Math.hypot(position.x - origin.x, position.y - origin.y, position.z - origin.z) > 8) {
      viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'unsupported', outcome: 'unsupported-form' })
      viewer.diagnostics.push({ command, reason: 'unsupported',
        detail: 'Plain-prim sitting beyond the 8 m fixture radius requires simulator surface placement, which is unsupported.' })
      return true
    }
  }
  const previous = avatar.sittingOn
  if (!world.sitAvatar(avatar, seat)) return record('refused', 'world-constraint')
  return record(previous === seat ? 'unchanged' : 'applied')
}

/** Finite decimal distance prefixes. Other numeric formats remain unsupported. */
export function seatingDistance(profile: 'rlv' | 'rlva', option: string): number | undefined {
  if (!option) return 1.5
  option = option.trimStart()
  if (/^[+-]?(?:nan|inf|0x)/i.test(option)) return undefined
  const prefix = /^[\t\n\v\f\r ]*[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:e[+-]?[0-9]+)?/i.exec(option)
  if (!prefix) return profile === 'rlv' ? 0 : undefined
  const number = Number(prefix[0])
  const value = Math.fround(number)
  if (!Number.isFinite(value) || profile === 'rlva' && number !== 0 && Math.abs(number) < 1.1754943508222875e-38) return undefined
  return value
}

/** Supported add/remove forms for explicit viewer seating actions. */
export function seatingSupport(profile: 'disabled' | 'rlv' | 'rlva', behaviour: string, option: string): 'enforced' | undefined {
  if (profile === 'disabled') return undefined
  if ((behaviour === 'sit' || behaviour === 'unsit') && !option) return 'enforced'
  if (behaviour === 'sittp' && seatingDistance(profile, option) !== undefined) return 'enforced'
  return undefined
}

/** User actions have no command issuer and therefore no issuer exemptions. */
export function userSitAvatar(world: World, avatar: WorldAvatar, requested: Prim, offset: Vector = ZERO_VECTOR): boolean {
  const linkset = requested.linkset
  if (!world.avatars.includes(avatar) || linkset?.world !== world || !world.linksets.includes(linkset) ||
    linkset.dead || linkset.attachment || !linkset.prims.includes(requested) || linkset.region !== avatar.region) return false
  const corner = world.corner(avatar.region)
  const origin = avatar.position
  const target = requested.regionPosition()
  const picked = { x: corner.x + target.x + offset.x, y: corner.y + target.y + offset.y, z: target.z + offset.z }
  const start = { x: corner.x + origin.x, y: corner.y + origin.y, z: origin.z }
  if (![...Object.values(picked), ...Object.values(start)].every(Number.isFinite)) return false
  const distance = Math.hypot(picked.x - start.x, picked.y - start.y, picked.z - start.z)
  const { viewer } = avatar
  const profile = viewer.profile
  if (profile !== 'disabled') {
    const rules = viewer.restrictions.snapshot()
    if (rules.some(rule => !rule.option && (rule.behaviour === 'sit' ||
      rule.behaviour === 'unsit' && !!(avatar.info & AGENT_SITTING)))) return false
    const limits = rules.filter(rule => rule.behaviour === 'sittp' && rule.support === 'enforced')
      .map(rule => seatingDistance(profile, rule.option)!)
    if (limits.length) {
      const limit = Math.min(...limits)
      if (profile === 'rlva' ? !(distance ** 2 < Math.fround(limit * limit)) : !(distance < limit)) return false
    }
  }
  const free = (prim: Prim) => !world.avatars.some(other => other !== avatar && other.sittingOn === prim)
  const configured = [requested, ...linkset.prims.filter(prim => prim !== requested)].filter(prim => prim.params.sitTarget.enabled)
  const seat = configured.find(free) ?? (configured.length ? undefined : requested)
  if (!seat || !Object.values(seat.regionPosition()).every(Number.isFinite) ||
    !Object.values(seat.params.sitTarget.offset).every(Number.isFinite)) return false
  if (!seat.params.sitTarget.enabled && Math.hypot(target.x - origin.x, target.y - origin.y, target.z - origin.z) > 8) {
    viewer.diagnostics.push({ command: 'user sit', reason: 'unsupported',
      detail: 'Plain-prim sitting beyond the 8 m fixture radius requires simulator surface placement, which is unsupported.' })
    return false
  }
  return world.sitAvatar(avatar, seat)
}

/** Simulator standAvatar and llUnSit bypass this explicit viewer action. */
export function userStandAvatar(world: World, avatar: WorldAvatar): boolean {
  if (!world.avatars.includes(avatar)) return false
  if (avatar.viewer.profile !== 'disabled' && avatar.info & AGENT_SITTING &&
    avatar.viewer.restrictions.snapshot().some(rule => rule.behaviour === 'unsit' && !rule.option)) return false
  world.standAvatar(avatar)
  return true
}
