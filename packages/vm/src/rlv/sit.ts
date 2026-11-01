import { AGENT_SITTING } from '../generated/constants.js'
import { NULL_KEY } from '../values/types.js'
import type { WorldAvatar } from '../world.js'
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
