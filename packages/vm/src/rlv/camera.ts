import type { WorldAvatar } from '../world.js'
import type { ViewerState, ViewerProfile } from './profiles.js'
import type { RlvParsedCommand } from './classifier.js'
import type { RlvRestriction } from './restrictions.js'
import { dispatchRestrictionCommand } from './restrictions.js'
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
  if (behaviour !== 'setcam_fovmin' && behaviour !== 'setcam_fovmax') return undefined
  return profile === 'rlv' || !!option && cameraAngle(profile, option) !== undefined ? 'enforced' : 'unsupported'
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

/** Per-avatar lens; simulator camera permission remains independent. */
class RlvCamera {
  fov = DEFAULT_FOV
  private savedFov = DEFAULT_FOV
  private persistedFov = DEFAULT_FOV
  private persist = true
  private previous: readonly RlvRestriction[] = []
  // RLVa modifier removal compares float values. NaN never compares equal.
  private readonly modifiers: RlvRestriction[] = []

  constructor(private readonly viewer: ViewerState) {}

  sync(): void {
    const rules = this.viewer.restrictions.snapshot().filter(rule =>
      rule.behaviour === 'setcam_fovmin' || rule.behaviour === 'setcam_fovmax')
    const added = rules.filter(rule => !this.previous.includes(rule))
    const removed = this.previous.filter(rule => !rules.includes(rule))
    if (!added.length && !removed.length) return
    if (this.viewer.profile === 'rlva') {
      if (!this.previous.length && rules.length) this.savedFov = this.persist ? this.fov : DEFAULT_FOV
      for (const rule of removed) {
        if (!Number.isNaN(cameraAngle('rlva', rule.option))) {
          const index = this.modifiers.indexOf(rule)
          this.modifiers.splice(index, 1)
        }
      }
      for (const rule of added) {
        const value = cameraAngle('rlva', rule.option)!
        const family = this.modifiers.filter(other => other.behaviour === rule.behaviour)
        // Match the modifier's lower_bound insertion, including NaN ordering.
        let low = 0, high = family.length
        while (low < high) {
          const middle = (low + high) >>> 1
          const other = cameraAngle('rlva', family[middle]!.option)!
          if (rule.behaviour === 'setcam_fovmin' ? value < other : other < value) low = middle + 1
          else high = middle
        }
        const before = family[low]
        this.modifiers.splice(before ? this.modifiers.indexOf(before) : this.modifiers.length, 0, rule)
      }
      this.previous = rules
      this.fov = this.limit(!rules.length ? this.savedFov : this.fov)
      this.persist = !rules.length
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
    const zoomMax = min !== 0 && min !== Math.fround(0.001) ? Math.min(Math.fround(DEFAULT_FOV / min), EXTREMUM) : EXTREMUM
    const zoomMin = max !== 0 && max !== EXTREMUM ? Math.max(Math.fround(DEFAULT_FOV / max), -EXTREMUM) : -EXTREMUM
    return [zoomMax, Math.min(zoomMin, zoomMax)]
  }

  private bound(behaviour: string): number | undefined {
    const rule = this.modifiers.find(rule => rule.behaviour === behaviour)
    return rule ? cameraAngle('rlva', rule.option) : undefined
  }

  private limit(value: number): number {
    const physicalMax = Math.fround(MAX_FOV / ASPECT)
    if (this.viewer.profile === 'rlva') {
      const active = (name: string) => this.previous.some(rule => rule.behaviour === name)
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

export function getRlvCameraReply(viewer: ViewerState, behaviour: string, option: string): string | undefined {
  if (!['getcam_fov', 'getcam_fovmin', 'getcam_fovmax'].includes(behaviour)) return undefined
  return viewer.profile === 'rlva' && option ? '' : camera(viewer).reply(behaviour)
}

/** Synchronize clear/collection changes before applying the next camera command. */
export function dispatchCameraCommand(avatar: WorldAvatar, prim: Prim, parsed: RlvParsedCommand, command: string): boolean {
  const state = camera(avatar.viewer)
  if ((parsed.kind === 'add' || parsed.kind === 'remove') &&
    cameraSupport(avatar.viewer.profile, parsed.behaviour, parsed.option) === 'enforced') {
    dispatchRestrictionCommand(avatar.viewer, prim, parsed, command)
    state.sync()
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
