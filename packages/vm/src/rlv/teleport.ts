import { AGENT_SITTING } from '../generated/constants.js'
import type { Linkset } from '../linkset.js'
import type { Prim } from '../prim.js'
import type { Vector } from '../values/types.js'
import type { AvatarDestination, WorldAvatar } from '../world.js'
import type { RlvParsedCommand } from './classifier.js'
import { getRlvSitId, seatingDistance } from './sit.js'
import type { ViewerProfile } from './profiles.js'

export interface RlvTeleportAction {
  readonly status: 'action'
  readonly action: 'tpto'
  readonly actionOutcome: 'applied' | 'refused'
  readonly target: string
  readonly seat: string
  readonly requested: Vector | null
  readonly destination: AvatarDestination | null
  readonly result: AvatarDestination
  /** Requested facing direction; Kokua does not apply the supplied angle. */
  readonly lookAt?: Vector
  readonly reason?: 'restriction' | 'target-unavailable' | 'world-constraint'
}

const decimal = '[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:e[+-]?[0-9]+)?'
const prefix = new RegExp('^\\s*(' + decimal + ')', 'i')
const vectorPrefix = new RegExp('^\\s*(' + decimal + ')/\\s*(' + decimal + ')/\\s*(' + decimal + ')', 'i')
const exotic = /^\s*[+-]?(?:nan\b|inf(?:inity)?\b|0x)/i

type Destination = { region?: string; coordinates: Vector; angle?: number }
type ParsedDestination = Destination | 'invalid' | 'unsupported'

function parseDestination(profile: 'rlv' | 'rlva', option: string): ParsedDestination {
  const parts = option.split(';')
  const text = parts[0]!
  let angle: number | undefined
  if (parts.length > 1 && (profile === 'rlva' || parts[1] !== '')) {
    if (exotic.test(parts[1]!)) return 'unsupported'
    const match = prefix.exec(parts[1]!)
    if (!match && profile === 'rlva') return 'invalid'
    angle = Math.fround(match ? Number(match[1]) : 0)
    if (!Number.isFinite(angle) || profile === 'rlva' && match && Number(match[1]) !== 0 && Math.abs(Number(match[1])) < 1.1754943508222875e-38) return 'unsupported'
  }
  if (profile === 'rlv') {
    // Kokua discards empty slash fields and pads to at least three fields.
    const tokens = (angle === undefined ? option : text).split('/').filter(Boolean)
    while (tokens.length < 3) tokens.push('')
    if (tokens.length > 4) return 'invalid'
    const region = tokens.length === 4 ? tokens.shift()! : undefined
    if (tokens.some(token => exotic.test(token))) return 'unsupported'
    const numbers = tokens.map(token => {
      const value = Number(/^\s*([+-]?[0-9]+)/.exec(token)?.[1] ?? 0)
      return value >= -2147483648 && value <= 2147483647 ? value || 0 : NaN
    })
    if (!numbers.every(Number.isFinite)) return 'unsupported'
    return { ...(region === undefined ? {} : { region }),
      coordinates: { x: numbers[0]!, y: numbers[1]!, z: numbers[2]! }, ...(angle === undefined ? {} : { angle }) }
  }
  // Global vectors are tried first and may have trailing slash fields.
  let match = vectorPrefix.exec(text)
  let region: string | undefined
  if (!match) {
    const fields = text.split('/')
    if (fields.length === 3 && fields.some(field => exotic.test(field)) ||
      /^[+-]?(?:nan|inf(?:inity)?|0x[0-9a-f]+)$/i.test(fields[0]!.trim())) return 'unsupported'
    if (fields.length !== 4) return 'invalid'
    region = fields[0]!
    if (fields.slice(1).some(field => exotic.test(field))) return 'unsupported'
    match = vectorPrefix.exec(fields.slice(1).join('/'))
  }
  if (!match) return 'invalid'
  const numbers = match.slice(1).map(value => region === undefined ? Number(value) : Math.fround(Number(value)))
  if (!numbers.every(value => Number.isFinite(Math.fround(value)))) return 'unsupported'
  return { ...(region === undefined ? {} : { region }),
    coordinates: { x: numbers[0]!, y: numbers[1]!, z: numbers[2]! }, ...(angle === undefined ? {} : { angle }) }
}

/** Teleport constraints apply to forced location travel; landmark actions are separate. */
export function teleportSupport(profile: ViewerProfile, behaviour: string, option: string): 'enforced' | undefined {
  if (profile === 'disabled') return undefined
  if (behaviour === 'tploc' && !option) return 'enforced'
  if (behaviour === 'tplocal' && seatingDistance(profile, option) !== undefined) return 'enforced'
  return undefined
}

export function dispatchTeleportCommand(linkset: Linkset, prim: Prim, avatar: WorldAvatar,
  parsed: RlvParsedCommand, command: string): boolean {
  if (parsed.kind !== 'force' || parsed.behaviour !== 'tpto') return false
  const { viewer } = avatar
  const destination = parseDestination(viewer.profile as 'rlv' | 'rlva', parsed.option)
  if (destination === 'unsupported') {
    viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'unsupported', outcome: 'unsupported-form' })
    viewer.diagnostics.push({ command, reason: 'unsupported',
      detail: 'Non-finite, hexadecimal and out-of-range teleport numbers are unsupported.' })
    return true
  }
  const world = linkset.world!
  let requested: Vector | null = null
  let resolved: AvatarDestination | null = null
  const record = (reason?: RlvTeleportAction['reason'] | 'invalid-option', lookAt?: Vector): true => {
    viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'action', action: 'tpto',
      actionOutcome: reason ? 'refused' : 'applied', target: parsed.option, seat: getRlvSitId(avatar),
      requested, destination: resolved, result: { region: avatar.region, position: { ...avatar.position } },
      ...(reason ? { reason: reason === 'invalid-option' ? 'world-constraint' as const : reason } : {}),
      ...(reason === 'invalid-option' ? { outcome: 'invalid-option' as const } : {}), ...(lookAt ? { lookAt } : {}) })
    return true
  }
  // Kokua temporarily lifts its own bare locks, including their notifications.
  const lifted = viewer.profile === 'rlv' ? viewer.restrictions.snapshot(prim.key)
    .filter(rule => !rule.option && ['tploc', 'tplocal', 'unsit', 'sittp'].includes(rule.behaviour)) : []
  const setLifted = (kind: 'add' | 'remove') => {
    for (const rule of lifted) viewer.restrictions.apply(prim, {
      behaviour: rule.behaviour, option: '', kind, parameter: kind === 'add' ? 'n' : 'y',
    })
  }
  setLifted('remove')
  try {
    if (destination === 'invalid') return record('invalid-option')
    // A named-region callback runs after Kokua restores the issuer's locks.
    if (viewer.profile === 'rlv' && destination.region !== undefined) setLifted('add')
    requested = { ...destination.coordinates }
    if (destination.region !== undefined) {
      const region = world.regionNamed(destination.region)
      if (!region) return record('target-unavailable')
      requested = { x: region.corner.x + requested.x, y: region.corner.y + requested.y, z: requested.z }
    }
    const region = world.regionAt(requested.x, requested.y)
    if (!region) return record('target-unavailable')
    resolved = { region: region.name,
      position: { x: requested.x - region.corner.x, y: requested.y - region.corner.y, z: requested.z } }
    const rules = viewer.restrictions.snapshot()
    const except = viewer.profile === 'rlva' ? prim.key : undefined
    const has = (behaviour: string) => rules.some(rule => rule.behaviour === behaviour &&
      !rule.option && rule.sourcePrim !== except)
    const corner = world.corner(avatar.region)
    const dx = requested.x - (corner.x + avatar.position.x)
    const dy = requested.y - (corner.y + avatar.position.y)
    const dz = requested.z - avatar.position.z
    const squared = Math.fround(dx * dx + dy * dy + dz * dz)
    const limited = (behaviour: string, cap = Infinity) => {
      // The global minimum includes the issuer when another object has a lock.
      const limits = rules.filter(rule => rule.behaviour === behaviour && rule.support === 'enforced')
      if (!limits.some(rule => rule.sourcePrim !== except)) return false
      const limit = Math.min(cap, ...limits.map(rule => seatingDistance(viewer.profile as 'rlv' | 'rlva', rule.option)!))
      return viewer.profile === 'rlva' ? !(squared < Math.fround(limit * limit)) : Math.fround(Math.hypot(dx, dy, dz)) > limit
    }
    if (avatar.info & AGENT_SITTING && has('unsit')) return record('restriction')
    if (viewer.profile === 'rlva') {
      const startX = Math.fround(corner.x + avatar.position.x)
      const startY = Math.fround(corner.y + avatar.position.y)
      const local = Math.fround(Math.fround(Math.fround(requested.x) - startX) ** 2 +
        Math.fround(Math.fround(requested.y) - startY) ** 2) < 256 * 256
      if (local ? limited('sittp') || limited('tplocal', 256) : has('tploc')) return record('restriction')
    } else if (has('tploc') || region.name === avatar.region && limited('tplocal') ||
      destination.region !== undefined && destination.angle !== undefined && rules.some(rule => rule.behaviour === 'sittp')) {
      return record('restriction')
    }
    const angle = viewer.profile === 'rlva' ? destination.angle : undefined
    const lookAt = angle === undefined ? undefined : { x: Math.cos(angle), y: Math.sin(angle), z: 0 }
    world.teleportAvatar(avatar, requested, lookAt)
    return record(undefined, lookAt)
  } finally {
    // Named callbacks already have the restored locks.
    if (destination === 'invalid' || destination.region === undefined) setLifted('add')
  }
}
