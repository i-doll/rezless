import { AGENT_FLYING, AGENT_SITTING } from '../generated/constants.js'
import { NULL_KEY, ZERO_VECTOR, type Vector } from '../values/types.js'
import type { World, WorldAvatar } from '../world.js'
import type { Linkset } from '../linkset.js'
import type { Prim } from '../prim.js'
import type { RlvParsedCommand } from './classifier.js'
import type { RlvCommandRecord, ViewerProfile } from './profiles.js'
import { dispatchRestrictionCommand } from './restrictions.js'

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
  if (locked('sit') || sitting && (locked('unsit') || viewer.profile === 'rlva' && hasStandtp(avatar))) return record('refused', 'restriction')
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
  const outcome = requestViewerSit(world, avatar, seat, outcome => record(outcome, outcome === 'refused' ? 'world-constraint' : undefined))
  return record(outcome, outcome === 'refused' ? 'world-constraint' : undefined)
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
    if (rules.some(rule => !rule.option && (rule.behaviour === 'sit' || rule.behaviour === 'interact' && rule.support === 'enforced' ||
      (rule.behaviour === 'unsit' || profile === 'rlva' && rule.behaviour === 'standtp') && !!(avatar.info & AGENT_SITTING)))) return false
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
  return requestViewerSit(world, avatar, seat) !== 'refused'
}

const pendingSits = new WeakMap<Readonly<{ dead: boolean }>, () => void>()

/** A user Stop action or replacement request cancels the current pilot. */
export function cancelPendingSit(avatar: WorldAvatar): void {
  pendingSits.get(avatar.viewer.session.lifetime)?.()
  pendingSits.delete(avatar.viewer.session.lifetime)
}

/** The simulator chooses the pose; the viewer sends AgentSit only after a successful pilot. */
function requestViewerSit(world: World, avatar: WorldAvatar, seat: Prim,
  complete?: (outcome: 'applied' | 'unchanged' | 'refused') => void): Action['actionOutcome'] {
  const response = world.getSitResponse(avatar, seat)
  if (!response) return 'refused'
  cancelPendingSit(avatar)
  avatar.info &= ~AGENT_FLYING
  const previous = avatar.sittingOn
  rememberStandtpSit(world, avatar)
  const sit = (): 'applied' | 'unchanged' | 'refused' =>
    !world.sitAvatar(avatar, seat, response) ? 'refused' : previous === seat ? 'unchanged' : 'applied'
  if (!response.autopilot || previous?.linkset === seat.linkset) return sit()
  const { durationMs, success } = response.autopilot
  avatar.viewer.session.bind(seat.linkset!, avatar)
  const lifetime = avatar.viewer.session.lifetime
  const cancel = world.clock.scheduleTask(lifetime, world.clock.now + durationMs, () => {
    pendingSits.delete(avatar.viewer.session.lifetime)
    const outcome = success ? sit() : 'refused'
    complete?.(outcome)
  })
  pendingSits.set(lifetime, () => { cancel(); complete?.('refused') })
  return 'pending'
}

/** Simulator standAvatar and llUnSit bypass this explicit viewer action. */
export function userStandAvatar(world: World, avatar: WorldAvatar): boolean {
  if (!world.avatars.includes(avatar)) return false
  if (avatar.viewer.profile !== 'disabled' && avatar.info & AGENT_SITTING &&
    avatar.viewer.restrictions.snapshot().some(rule => rule.behaviour === 'unsit' && !rule.option)) return false
  world.standAvatar(avatar)
  return true
}

// LLParcel::L_DIRECT, also the parcel fixture tpRouting value.
const DIRECT_ROUTING = 2

interface StandtpState {
  origin: Vector
  pending: boolean
}
const standtpStates = new WeakMap<Readonly<{ dead: boolean }>, StandtpState>()

function standtpState(avatar: WorldAvatar): StandtpState {
  const lifetime = avatar.viewer.session.lifetime
  let state = standtpStates.get(lifetime)
  if (!state) standtpStates.set(lifetime, state = { origin: { ...ZERO_VECTOR }, pending: false })
  return state
}

function hasStandtp(avatar: WorldAvatar): boolean {
  return avatar.viewer.profile !== 'disabled' && avatar.viewer.restrictions.snapshot()
    .some(rule => rule.behaviour === 'standtp' && !rule.option && rule.support === 'enforced')
}

export function standtpSupport(profile: ViewerProfile, behaviour: string, option: string): 'enforced' | undefined {
  return profile !== 'disabled' && behaviour === 'standtp' && !option ? 'enforced' : undefined
}

function rememberStandtpOrigin(world: World, avatar: WorldAvatar): void {
  const corner = world.corner(avatar.region)
  const position = avatar.position
  standtpState(avatar).origin = { x: corner.x + position.x, y: corner.y + position.y, z: position.z }
}

/** Only viewer object-sit requests capture an RLVa return origin. */
function rememberStandtpSit(world: World, avatar: WorldAvatar): void {
  if (!(avatar.info & AGENT_SITTING) && hasStandtp(avatar)) rememberStandtpOrigin(world, avatar)
}

/** Kokua also captures the position when a new bare standtp rule is added. */
export function dispatchStandtpRestrictionCommand(avatar: WorldAvatar, prim: Prim,
  parsed: RlvParsedCommand, command: string): boolean {
  if (parsed.kind !== 'clear' && !(parsed.behaviour === 'standtp' && !parsed.option &&
    (parsed.kind === 'add' || parsed.kind === 'remove'))) return false
  const rules = avatar.viewer.restrictions
  const held = rules.snapshot(prim.key).some(rule => rule.rule === 'standtp')
  dispatchRestrictionCommand(avatar.viewer, prim, parsed, command)
  if (avatar.viewer.profile === 'rlv') {
    if (parsed.kind === 'add' && !held) rememberStandtpOrigin(prim.linkset!.world!, avatar)
    else if (!(avatar.info & AGENT_SITTING) && (parsed.kind === 'clear' || held && parsed.kind === 'remove')) {
      standtpState(avatar).origin = { ...ZERO_VECTOR }
    }
  }
  return true
}

/** A stand has already cleared its seat and flags before the return is queued. */
export function returnStandtpAvatar(world: World, avatar: WorldAvatar): void {
  if (!hasStandtp(avatar)) return
  const state = standtpState(avatar)
  if (state.pending) return
  if (avatar.viewer.profile === 'rlv') {
    const parcel = world.parcelAt(avatar.region, avatar.position)
    if (parcel && (parcel.tpRouting ?? 1) !== DIRECT_ROUTING) return
  }
  const destination = state.origin
  if (avatar.viewer.profile === 'rlva' && !destination.x && !destination.y && !destination.z) return
  state.origin = { ...ZERO_VECTOR }
  state.pending = true
  // RLVa postpones the return until the avatar has been unparented. The
  // fixture delivers both profiles' teleport completion through virtual time.
  world.clock.scheduleTask(avatar.viewer.session.lifetime, world.clock.now, () => {
    try {
      // Return travel bypasses unsit, sittp, tploc, tplocal and tplm policy.
      world.teleportAvatar(avatar, destination)
    } finally { state.pending = false }
  })
}
