import type { WorldAvatar } from '../world.js'
import type { ViewerState, ViewerProfile } from './profiles.js'
import { rlvIntegerPrefix, type RlvParsedCommand } from './classifier.js'
import { isValidReplyChannel, sendViewerReply } from './reply.js'
import type { RlvRestriction } from './restrictions.js'
import { dispatchRestrictionCommand } from './restrictions.js'
import { rotateVector } from '../values/ops.js'
import { AGENT_MOUSELOOK } from '../generated/constants.js'
import { vec, ZERO_VECTOR, type Vector } from '../values/types.js'
import type { Prim } from '../prim.js'

const DEFAULT_FOV = Math.fround(Math.PI / 3)
const MIN_FOV = Math.fround(5 * Math.fround(Math.PI / 180))
const MAX_FOV = Math.fround(175 * Math.fround(Math.PI / 180))
const ASPECT = Math.fround(1.4242)
const EXTREMUM = 1000000
const clamp = (value: number, min: number, max: number) => value < min ? min : value > max ? max : value

/** Viewer float prefixes, including explicit non-finite spellings. */
export function cameraAngle(profile: ViewerProfile, option: string): number | undefined {
  const match = /^[\t\n\v\f\r ]*([+-]?(?:infinity|inf|nan(?:\([^)]*\))?|0x(?:[0-9a-f]+\.?[0-9a-f]*|\.[0-9a-f]+)(?:p[+-]?[0-9]+)?|(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:e[+-]?[0-9]+)?))/i.exec(option)
  if (!match) return profile === 'rlv' ? 0 : undefined
  const token = match[1]!.toLowerCase()
  if (/^[+-]?nan/.test(token)) return token.startsWith('-') ? -NaN : NaN
  if (/^[+-]?inf/.test(token)) return token.startsWith('-') ? -Infinity : Infinity
  const hex = /^([+-]?)0x([0-9a-f]*)(?:\.([0-9a-f]*))?(?:p([+-]?[0-9]+))?$/.exec(token)
  const value = hex ? (hex[1] === '-' ? -1 : 1) * (Number.parseInt(hex[2] || '0', 16) +
    [...hex[3] ?? ''].reduce((sum, digit, index) => sum + Number.parseInt(digit, 16) / 16 ** (index + 1), 0)) * 2 ** Number(hex[4] ?? 0)
    : Number(token)
  const rounded = Math.fround(value)
  const nonzero = hex ? /[1-9a-f]/.test((hex[2] ?? '') + (hex[3] ?? '')) : /[1-9]/.test(token.split('e')[0]!)
  if (profile === 'rlva' && (!Number.isFinite(rounded) || nonzero && Math.abs(rounded) < 1.1754943508222875e-38)) return undefined
  return rounded
}

export function cameraSupport(profile: ViewerProfile, behaviour: string, option: string): RlvRestriction['support'] | undefined {
  if (!['setcam_fovmin', 'setcam_fovmax', 'camzoommin', 'camzoommax'].includes(behaviour)) return undefined
  return profile === 'rlv' || (!option && behaviour.startsWith('camzoom')) || !!option && cameraAngle(profile, option) !== undefined ? 'enforced' : 'unsupported'
}

function format(value: number, profile: ViewerProfile): string {
  if (Number.isNaN(value)) {
    const bits = new DataView(new ArrayBuffer(8))
    bits.setFloat64(0, value)
    return bits.getUint8(0) & 0x80 ? '-nan' : 'nan'
  }
  if (!Number.isFinite(value)) return value > 0 ? 'inf' : '-inf'
  const digits = profile === 'rlva' ? 3 : 6
  // Float32 values this large are integers; keep the full fixed-decimal reply.
  if (Math.abs(value) >= 1e21) return BigInt(value).toString() + '.' + '0'.repeat(digits)
  const scale = 10 ** digits
  const scaled = value * scale
  const lower = Math.floor(scaled)
  // Decimal replies round exact halves to even, including negative values.
  const rounded = scaled - lower === 0.5 ? (lower + Math.abs(lower % 2)) / scale : value
  const negativeZero = rounded === 0 && (value < 0 || Object.is(value, -0))
  return (negativeZero ? '-' : '') + rounded.toFixed(digits)
}

function lensFamily(rule: RlvRestriction): string {
  return rule.behaviour === 'camzoommin' ? 'setcam_fovmin' : rule.behaviour === 'camzoommax' ? 'setcam_fovmax' : rule.behaviour
}
function lensValue(rule: RlvRestriction): number {
  return rule.behaviour.startsWith('camzoom') ? Math.fround(DEFAULT_FOV / (rule.option ? cameraAngle('rlva', rule.option)! : 1)) : cameraAngle('rlva', rule.option)!
}

/** Per-avatar lens; simulator camera permission remains independent. */
class RlvCamera {
  fov = DEFAULT_FOV
  private savedFov = DEFAULT_FOV
  private persistedFov = DEFAULT_FOV
  private persist = true
  private previous: readonly RlvRestriction[] = []
  private revision = -1
  // RLVa modifier removal compares float values. NaN never compares equal.
  private readonly modifiers: RlvRestriction[] = []

  constructor(private readonly viewer: ViewerState) {}

  sync(): void {
    if (this.revision === this.viewer.restrictions.revision) return
    this.revision = this.viewer.restrictions.revision
    const rules = this.viewer.restrictions.snapshot().filter(rule =>
      ['setcam_fovmin', 'setcam_fovmax', 'camzoommin', 'camzoommax'].includes(rule.behaviour))
    const added = rules.filter(rule => !this.previous.includes(rule))
    const removed = this.previous.filter(rule => !rules.includes(rule))
    if (!added.length && !removed.length) return
    if (this.viewer.profile === 'rlva') {
      if (!this.previous.length && added.some(rule => !rule.behaviour.startsWith('camzoom'))) this.savedFov = this.persist ? this.fov : DEFAULT_FOV
      for (const rule of removed) {
        if (!Number.isNaN(lensValue(rule))) {
          const index = this.modifiers.indexOf(rule)
          this.modifiers.splice(index, 1)
        }
      }
      for (const rule of added) {
        const value = lensValue(rule)!
        const family = this.modifiers.filter(other => lensFamily(other) === lensFamily(rule))
        // Match the modifier's lower_bound insertion, including NaN ordering.
        let low = 0, high = family.length
        while (low < high) {
          const middle = (low + high) >>> 1
          const other = lensValue(family[middle]!)
          if (lensFamily(rule) === 'setcam_fovmin' ? value < other : other < value) low = middle + 1
          else high = middle
        }
        const before = family[low]
        this.modifiers.splice(before ? this.modifiers.indexOf(before) : this.modifiers.length, 0, rule)
      }
      this.previous = rules
      const restore = !rules.length && removed.length > 0 && !removed.at(-1)!.behaviour.startsWith('camzoom')
      this.fov = this.limit(restore ? this.savedFov : this.fov)
      if (restore) this.persist = true
      else if (added.some(rule => !rule.behaviour.startsWith('camzoom'))) this.persist = false
    } else {
      this.previous = rules
      // Kokua applies a changed bound on addition; removal leaves the lens alone.
      if (added.length) this.fov = this.limit(this.fov)
    }
  }

  private kokuaZoom(): [number, number] {
    const aggregate = (behaviour: string, minimum: boolean, fallback: number) => {
      let value = minimum ? EXTREMUM : -EXTREMUM
      let found = false
      for (const rule of this.previous.filter(rule => rule.behaviour === behaviour)) {
        const next = rule.option ? cameraAngle('rlv', rule.option)! : 1.5
        if (minimum ? next < value : next > value) { value = next; found = true }
      }
      return found ? value : fallback
    }
    const min = aggregate('setcam_fovmin', false, Math.fround(0.001))
    const max = aggregate('setcam_fovmax', true, EXTREMUM)
    const legacyMax = aggregate('camzoommax', true, EXTREMUM) || EXTREMUM
    const legacyMin = aggregate('camzoommin', false, -EXTREMUM) || -EXTREMUM
    const zoomMax = min !== 0 && min !== Math.fround(0.001) ? Math.min(Math.fround(DEFAULT_FOV / min), legacyMax) : legacyMax
    const zoomMin = max !== 0 && max !== EXTREMUM ? Math.max(Math.fround(DEFAULT_FOV / max), legacyMin) : legacyMin
    return [zoomMax, Math.min(zoomMin, zoomMax)]
  }

  private bound(behaviour: string): number | undefined {
    const rule = this.modifiers.find(rule => lensFamily(rule) === behaviour)
    return rule ? lensValue(rule) : undefined
  }

  private limit(value: number): number {
    const physicalMax = Math.fround(MAX_FOV / ASPECT)
    if (this.viewer.profile === 'rlva') {
      const active = (name: string) => this.previous.some(rule => lensFamily(rule) === name)
      value = clamp(value, active('setcam_fovmin') ? this.bound('setcam_fovmin')! : MIN_FOV,
        active('setcam_fovmax') ? this.bound('setcam_fovmax')! : physicalMax)
      return clamp(value, MIN_FOV, physicalMax)
    }
    value = clamp(value, MIN_FOV, physicalMax)
    const [zoomMax, zoomMin] = this.kokuaZoom()
    if (zoomMax < EXTREMUM && Math.fround(DEFAULT_FOV / value) > zoomMax) value = Math.fround(DEFAULT_FOV / zoomMax)
    if (zoomMin > -EXTREMUM && Math.fround(DEFAULT_FOV / value) < zoomMin) value = Math.fround(DEFAULT_FOV / zoomMin)
    return clamp(value, MIN_FOV, MAX_FOV)
  }

  change(value: number, user: boolean): number {
    this.sync()
    this.fov = this.limit(Math.fround(value))
    if (user) { this.persistedFov = this.fov }
    else if (!this.previous.length) this.persist = this.persistedFov === DEFAULT_FOV
    return this.fov
  }

  reply(behaviour: string): string {
    this.sync()
    if (behaviour === 'getcam_fov') return format(this.fov, this.viewer.profile)
    if (behaviour === 'getcam_zoom') return format(Math.fround(DEFAULT_FOV / this.fov), 'rlv')
    if (behaviour === 'getcam_zoommin' || behaviour === 'getcam_zoommax') return format(this.kokuaZoom()[behaviour === 'getcam_zoommax' ? 0 : 1], 'rlv')
    if (this.viewer.profile === 'rlva') {
      const bound = this.bound(behaviour === 'getcam_fovmin' ? 'setcam_fovmin' : 'setcam_fovmax')
      return bound === undefined ? '' : format(bound, 'rlva')
    }
    return format(Math.fround(DEFAULT_FOV / this.kokuaZoom()[behaviour === 'getcam_fovmin' ? 0 : 1]), 'rlv')
  }
}

const cameras = new WeakMap<ViewerState, RlvCamera>()
function camera(viewer: ViewerState): RlvCamera {
  let state = cameras.get(viewer)
  if (!state) cameras.set(viewer, state = new RlvCamera(viewer))
  state.sync()
  return state
}

export function getRlvFov(avatar: WorldAvatar): number { return camera(avatar.viewer).fov }
export function changeRlvFov(avatar: WorldAvatar, radians: number): number { return camera(avatar.viewer).change(radians, true) }

function distanceReply(avatar: WorldAvatar, behaviour: string, option: string): string | undefined {
  const viewer = avatar.viewer
  if (['getcam_avdistmin', 'getcam_avdistmax'].includes(behaviour)) {
    if (viewer.profile === 'rlva' && option) return ''
    const bounds = distanceCamera(avatar).limits().avatar
    const value = bounds[behaviour === 'getcam_avdistmin' ? 0 : 1]
    return value === undefined ? '' : format(value, viewer.profile)
  }
  if (behaviour === 'getcam_avdist' && viewer.profile === 'rlva') {
    if (option) return ''
    const pos = getRlvCameraPosition(avatar)
    return format(Math.hypot(pos.x - avatar.position.x, pos.y - avatar.position.y, pos.z - avatar.position.z), 'rlva')
  }
  return ['getcam_zoom', 'getcam_zoommin', 'getcam_zoommax'].includes(behaviour) && viewer.profile === 'rlv' ? camera(viewer).reply(behaviour) : undefined
}

export function getRlvCameraReply(viewer: ViewerState, behaviour: string, option: string): string | undefined {
  if (!['getcam_fov', 'getcam_fovmin', 'getcam_fovmax'].includes(behaviour)) return undefined
  return viewer.profile === 'rlva' && option ? '' : camera(viewer).reply(behaviour)
}

/** Synchronize clear/collection changes before applying the next camera command. */
export function dispatchCameraCommand(avatar: WorldAvatar, prim: Prim, parsed: RlvParsedCommand, command: string): boolean {
  const viewer = avatar.viewer
  const state = camera(viewer)
  const channel = rlvIntegerPrefix(parsed.parameter)
  if (viewer.profile !== 'disabled' && (viewer.profile === 'rlv' || parsed.kind === 'query') && channel !== undefined && isValidReplyChannel(viewer.profile, channel)) {
    const text = distanceReply(avatar, parsed.behaviour, parsed.option)
    if (text !== undefined) {
      const reply = sendViewerReply(prim.linkset!, avatar, channel, text)!
      viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'replied', reply,
        ...(viewer.profile === 'rlva' && parsed.option ? { outcome: 'failed-option' as const } : {}) })
      return true
    }
  }
  if ((parsed.kind === 'add' || parsed.kind === 'remove') &&
    [cameraSupport(avatar.viewer.profile, parsed.behaviour, parsed.option), cameraDistanceSupport(avatar.viewer.profile, parsed.behaviour, parsed.option)].some(support => support === 'enforced' || support === 'state-only')) {
    dispatchRestrictionCommand(avatar.viewer, prim, parsed, command)
    state.sync()
    distanceCamera(avatar).sync()
    return true
  }
  if (parsed.kind !== 'force' || parsed.behaviour !== 'setcam_fov') return false
  const angle = parsed.option ? cameraAngle(avatar.viewer.profile, parsed.option) : avatar.viewer.profile === 'rlva' ? DEFAULT_FOV : 0
  avatar.viewer.commandLog.push({ command, sourcePrim: prim.key, parsed,
    status: angle === undefined ? 'unsupported' : 'applied', ...(angle === undefined ? { outcome: 'invalid-option' as const } : {}) })
  if (angle === undefined) avatar.viewer.diagnostics.push({ command, reason: 'unsupported', detail: 'invalid-option: Invalid camera angle.' })
  else state.change(angle, false)
  return true
}

const distanceNames = ['setcam_avdistmin', 'setcam_avdistmax', 'camdistmin', 'camdistmax',
  'setcam_origindistmin', 'setcam_origindistmax', 'setcam_avdist']
const distanceFamily = (name: string) => name === 'camdistmin' ? 'setcam_avdistmin' : name === 'camdistmax' ? 'setcam_avdistmax' : name

export function cameraDistanceSupport(profile: ViewerProfile, behaviour: string, option: string): RlvRestriction['support'] | undefined {
  if (!distanceNames.includes(behaviour)) return undefined
  if (profile === 'rlv' && (behaviour === 'setcam_avdist' || behaviour.startsWith('setcam_origindist'))) return 'unsupported'
  if (profile === 'rlva' && (!option || cameraAngle(profile, option) === undefined)) return 'unsupported'
  return behaviour === 'setcam_avdist' ? 'state-only' : 'enforced'
}

export interface RlvCameraLimits {
  readonly avatar: readonly [number | undefined, number | undefined]
  readonly origin: readonly [number | undefined, number | undefined]
  /** RLVa's avatar silhouette threshold; this is independent of camera position. */
  readonly silhouetteDistance: number | undefined
}

class RlvDistanceCamera {
  position: Vector = ZERO_VECTOR
  avatarOrigin: Vector | undefined
  cameraOrigin: Vector | undefined
  private previous: readonly RlvRestriction[] = []
  private readonly modifiers: RlvRestriction[] = []
  private revision = -1
  constructor(private readonly avatar: WorldAvatar) {}

  sync(): void {
    const viewer = this.avatar.viewer
    if (this.revision === viewer.restrictions.revision) return
    this.revision = viewer.restrictions.revision
    const rules = viewer.restrictions.snapshot().filter(rule => distanceNames.includes(rule.behaviour) && rule.support !== 'unsupported')
    if (viewer.profile === 'rlva') {
      for (const rule of this.previous.filter(rule => !rules.includes(rule))) {
        if (!Number.isNaN(cameraAngle('rlva', rule.option))) {
          const index = this.modifiers.indexOf(rule)
          if (index >= 0) this.modifiers.splice(index, 1)
        }
      }
      for (const rule of rules.filter(rule => !this.previous.includes(rule))) {
        const family = distanceFamily(rule.behaviour)
        const value = cameraAngle('rlva', rule.option)!
        const members = this.modifiers.filter(other => distanceFamily(other.behaviour) === family)
        let low = 0, high = members.length
        while (low < high) {
          const middle = (low + high) >>> 1
          const other = cameraAngle('rlva', members[middle]!.option)!
          if (family.endsWith('max') ? other < value : value < other) low = middle + 1
          else high = middle
        }
        const before = members[low]
        this.modifiers.splice(before ? this.modifiers.indexOf(before) : this.modifiers.length, 0, rule)
      }
    }
    this.previous = rules
  }

  limits(): RlvCameraLimits {
    this.sync()
    const viewer = this.avatar.viewer
    const bound = (name: string): number | undefined => {
      const rule = this.modifiers.find(rule => distanceFamily(rule.behaviour) === name)
      return rule ? cameraAngle('rlva', rule.option) : undefined
    }
    if (viewer.profile === 'rlva') return {
      avatar: [bound('setcam_avdistmin'), bound('setcam_avdistmax')],
      origin: [bound('setcam_origindistmin'), bound('setcam_origindistmax')],
      silhouetteDistance: bound('setcam_avdist'),
    }
    if (viewer.profile === 'disabled') return { avatar: [undefined, undefined], origin: [undefined, undefined], silhouetteDistance: undefined }
    const aggregate = (name: string, min: boolean, fallback: number) => {
      let value = min ? EXTREMUM : -EXTREMUM, found = false
      for (const rule of this.previous.filter(rule => distanceFamily(rule.behaviour) === name)) {
        const next = rule.option ? cameraAngle('rlv', rule.option)! : 1.5
        if (min ? next < value : next > value) { value = next; found = true }
      }
      return found ? value : fallback
    }
    const max = Math.min(aggregate('setcam_avdistmax', true, EXTREMUM), EXTREMUM * 0.75)
    const min = Math.min(aggregate('setcam_avdistmin', false, -EXTREMUM), max)
    return { avatar: [min, max], origin: [undefined, undefined], silhouetteDistance: undefined }
  }

  pose(input: Vector): Vector {
    if (this.avatar.viewer.profile === 'disabled' || this.avatar.info & AGENT_MOUSELOOK) return input
    const limits = this.limits()
    const active = (name: string) => this.previous.some(rule => distanceFamily(rule.behaviour) === name)
    const avatarBounds = this.avatar.viewer.profile === 'rlva'
      ? [active('setcam_avdistmin') ? limits.avatar[0] : undefined, active('setcam_avdistmax') ? limits.avatar[1] : undefined] as const
      : limits.avatar
    const [min, max] = avatarBounds
    const originBounds = [active('setcam_origindistmin') ? limits.origin[0] : undefined,
      active('setcam_origindistmax') ? limits.origin[1] : undefined] as const
    const originActive = active('setcam_origindistmin') || active('setcam_origindistmax')
    const avatarLocked = min !== undefined && min === max
    const origin = originActive && !avatarLocked ? this.cameraOrigin ?? this.position : this.avatarOrigin ?? this.avatar.position
    const bounds = originActive && !avatarLocked ? originBounds : avatarBounds
    const offset = { x: input.x - origin.x, y: input.y - origin.y, z: input.z - origin.z }
    const distance = Math.fround(Math.hypot(offset.x, offset.y, offset.z))
    const lower = bounds[0] ?? 0, upper = bounds[1] ?? Infinity
    const multiplier = distance > upper ? Math.fround(upper / distance) : distance < lower ? Math.fround(lower / distance) : NaN
    if (Number.isNaN(multiplier)) return input
    return vec(origin.x + multiplier * offset.x, origin.y + multiplier * offset.y, origin.z + multiplier * offset.z)
  }
}

const distanceCameras = new WeakMap<ViewerState, RlvDistanceCamera>()
function distanceCamera(avatar: WorldAvatar): RlvDistanceCamera {
  let state = distanceCameras.get(avatar.viewer)
  if (!state) distanceCameras.set(avatar.viewer, state = new RlvDistanceCamera(avatar))
  return state
}

/** Explicit region-space reference points for the viewer's joint and default camera origin. */
export function setRlvCameraOrigins(avatar: WorldAvatar, origins: { avatar?: Vector; camera?: Vector }): void {
  const state = distanceCamera(avatar)
  state.avatarOrigin = origins.avatar ? { ...origins.avatar } : undefined
  state.cameraOrigin = origins.camera ? { ...origins.camera } : undefined
}

/** Record a fixture camera position independently of simulator tracking permission. */
export function setRlvCameraPosition(avatar: WorldAvatar, position: Vector): void {
  distanceCamera(avatar).position = { ...position }
}

/** Seat eye position shared by script pose reads and permission-independent viewer queries. */
export function seatedCameraPosition(avatar: WorldAvatar): Vector | undefined {
  const seat = avatar.sittingOn
  const offsets = avatar.sittingCamera
  if (!seat || !offsets || avatar.info & AGENT_MOUSELOOK) return undefined
  const { eye, at } = offsets
  if (eye.x === at.x && eye.y === at.y && eye.z === at.z) return undefined
  const origin = seat.regionPosition()
  const offset = rotateVector(eye, seat.regionRotation())
  return vec(origin.x + offset.x, origin.y + offset.y, origin.z + offset.z)
}

/** Clamp a supplied effective pose, or the avatar's latest fixture pose for viewer queries. */
export function getRlvCameraPosition(avatar: WorldAvatar, position?: Vector): Vector {
  const state = distanceCamera(avatar)
  return state.pose(position ?? seatedCameraPosition(avatar) ?? state.position)
}

export function getRlvCameraLimits(avatar: WorldAvatar): RlvCameraLimits { return distanceCamera(avatar).limits() }
