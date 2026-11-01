import { scalarNames, vectorNames, textures, legacy, kokuaAliases, environmentNames as names } from './environment-forms.js'
import type { ViewerProfile } from './profiles.js'
import type { RlvParsedCommand } from './classifier.js'
import { rlvIntegerPrefix } from './classifier.js'
import { isValidReplyChannel, sendViewerReply } from './reply.js'
import type { WorldAvatar } from '../world.js'
import type { Prim } from '../prim.js'

type Value = number | string | readonly number[]
/** Native sky values, before command-specific scaling. Angles are radians. */
export type RlvEnvironmentSky = Readonly<Record<string, Value>>
export interface RlvEnvironmentPreset {
  readonly name: string
  readonly asset: string
  readonly type: 'sky' | 'daycycle'
  readonly location: 'library' | 'inventory'
  readonly sky: RlvEnvironmentSky
}
export interface RlvEnvironmentConfig {
  readonly sky?: RlvEnvironmentSky
  /** Shared environment restored by daytime:-1. */
  readonly sharedSky?: RlvEnvironmentSky
  readonly fixed?: boolean
  readonly presets?: readonly RlvEnvironmentPreset[]
  /** Sky samples supplied by a daycycle fixture, indexed by fractional time. */
  readonly daytimeSkies?: Readonly<Record<string, RlvEnvironmentSky>>
}
const zero = '00000000-0000-0000-0000-000000000000'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function defaultSky(): Record<string, Value> {
  return { ambient: [0.25, 0.25, 0.25], bluedensity: [0.2447, 0.4487, 0.7599], bluehorizon: [0.4954, 0.4954, 0.6399],
    densitymultiplier: 0.0001, distancemultiplier: 0.8, hazedensity: 0.7, hazehorizon: 0.19,
    dropletradius: 800, icelevel: 0, maxaltitude: 1605, moisturelevel: 0, scenegamma: 1,
    cloudcolor: [0.4099, 0.4099, 0.4099], clouddensity: [1, 0.526, 1], clouddetail: [1, 0.526, 1],
    cloudcoverage: 0.2699, cloudscale: 0.4199, cloudscroll: [0.2, 0.01], cloudvariance: 0,
    moonbrightness: 0.5, moonscale: 1, sunscale: 1, sunglowsize: 1.75, sunglowfocus: 0.09598,
    sunlightcolor: [0.7342, 0.7815, 0.8999], starbrightness: 250,
    sunazimuth: 0, sunelevation: 80 * Math.PI / 180, moonazimuth: Math.PI / 8, moonelevation: 80 * Math.PI / 180 + Math.PI / 8,
    suntexture: zero, moontexture: 'd07f6eed-b96a-47cd-b51d-400ad4a1c428', cloudtexture: '1dc1368f-e8fe-f02d-a08d-9d9f11c1af6b' }
}
function copySky(sky: RlvEnvironmentSky): Record<string, Value> {
  return Object.fromEntries(Object.entries(sky).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]))
}
/** Per-avatar selected environment; it never changes simulator parcel settings. */
export class RlvEnvironment {
  private values: Record<string, Value>
  private readonly shared: Record<string, Value>
  private selectedPreset = ''
  private east = 0
  private position = 0
  fixed: boolean
  selectedAsset: string | null = null
  constructor(private readonly profile: ViewerProfile, private readonly config: RlvEnvironmentConfig = {}) {
    this.shared = { ...defaultSky(), ...copySky(config.sharedSky ?? {}) }
    this.values = { ...this.shared, ...copySky(config.sky ?? {}) }
    this.fixed = config.fixed ?? false
  }
  get sky(): RlvEnvironmentSky { return Object.freeze(Object.fromEntries(Object.entries(this.values)
    .map(([key, value]) => [key, Array.isArray(value) ? Object.freeze([...value]) : value]))) }
  private resolve(name: string): { base: string; component?: number | undefined } {
    if (this.profile === 'rlv' && kokuaAliases[name]) return { base: kokuaAliases[name]! }
    if ([...scalarNames, ...vectorNames, ...textures].includes(name)) return { base: name }
    const suffix = name.slice(-1), prefix = name.slice(0, -1)
    const base = legacy[prefix] ?? prefix
    return { base, component: ({ r: 0, x: 0, g: 1, y: 1, b: 2, d: 2, i: 3 } as Record<string, number>)[suffix] }
  }
  private scale(base: string): number {
    return ['ambient', 'sunlightcolor'].includes(base) ? 3 : ['bluedensity', 'bluehorizon'].includes(base) ? 2
      : base === 'densitymultiplier' ? 0.001 : base === 'hazedensity' && this.profile === 'rlv' ? 4 : 1
  }
  private read(base: string): Value {
    const value = this.values[base]!
    if (base === 'scenegamma' && this.profile === 'rlv') {
      const gamma = value as number
      return gamma > 2.9 ? 20 : gamma <= 0.5 ? 0 : gamma < 1 ? (gamma - 0.5) * 2 : gamma < 2 ? 1 + (gamma - 1) * 4 : 5 + (gamma - 2) / 0.06
    }
    if (Array.isArray(value)) return value.map(v => base === 'cloudscroll' && this.profile === 'rlv' ? v - 10 : v / this.scale(base))
    return typeof value === 'number' ? value / this.scale(base) : value
  }
  reply(name: string): string {
    if (name === 'daytime') return this.format(this.profile === 'rlva' ? this.fixed ? 2 : -1 : !this.selectedPreset ? -1 : Math.sin(this.values.sunelevation as number) < 0 ? 0 : 1)
    if (['asset', 'preset'].includes(name)) return this.selectedPreset
    let value: Value
    if (['eastangle', 'sunmoonposition'].includes(name)) {
      const [east, position] = this.legacyAngles()
      value = this.profile === 'rlv' ? name === 'eastangle' ? [east, position] : [position, east] : name === 'eastangle' ? east : position
    } else {
      const { base, component } = this.resolve(name)
      value = this.read(base)
      if (component !== undefined) value = component === 3 ? Math.max(...value as number[]) : (value as number[])[component]!
      if (this.profile === 'rlva' && /(?:azimuth|elevation)$/.test(base)) {
        const body = base.startsWith('sun') ? 'sun' : 'moon'
        const [azimuth, elevation] = this.directionAngles(body)
        value = base.endsWith('azimuth') ? azimuth : elevation
      }
    }
    return typeof value === 'string' ? value : Array.isArray(value) ? value.map(v => this.format(v)).join(this.profile === 'rlv' ? ';' : '/') : this.format(value as number)
  }
  private format(value: number): string {
    value = Math.fround(value)
    if (this.profile === 'rlva') return value.toFixed(6)
    if (Object.is(value, -0)) return '-0'
    const rounded = Number(value.toPrecision(6))
    const exponent = rounded === 0 ? 0 : Math.floor(Math.log10(Math.abs(rounded)))
    if (exponent < -4 || exponent >= 6) {
      const [mantissa, power] = rounded.toExponential(5).split('e')
      return `${Number(mantissa)}e${Number(power) < 0 ? '-' : '+'}${String(Math.abs(Number(power))).padStart(2, '0')}`
    }
    return String(rounded)
  }
  private directionAngles(body: string): [number, number] {
    const a = this.values[body + 'azimuth'] as number, e = this.values[body + 'elevation'] as number
    const x = Math.cos(a) * Math.cos(e), y = Math.sin(a) * Math.cos(e), z = Math.sin(e)
    const azimuth = Math.abs(y) < 1e-6 ? 0 : Math.abs(x) < 1e-6 ? Math.PI / 2 : normalize(Math.atan2(y, x))
    const elevation = Math.abs(z) < 1e-6 ? 0 : Math.abs(x) < 1e-6 && Math.abs(y) >= 1e-6 ? Math.atan2(z, y)
      : Math.abs(y) < 1e-6 && Math.abs(x) >= 1e-6 ? Math.atan2(z, x) : Math.asin(z)
    return [azimuth, normalize(elevation)]
  }
  private legacyAngles(): [number, number] {
    const a = this.values.sunazimuth as number, e = this.values.sunelevation as number
    const x = Math.cos(a) * Math.cos(e), y = Math.sin(a) * Math.cos(e), z = Math.sin(e)
    if (this.profile === 'rlv') {
      if (Math.abs(x) < 1e-6 && Math.abs(y) < 1e-6) return [z > 0 ? this.east : normalize(-this.east * Math.PI * 2) / (Math.PI * 2), z > 0 ? 0.25 : 0.75]
      let az = Math.atan2(y, x), el = Math.atan2(z, Math.hypot(x, y))
      if (x < 0) el = Math.PI - el
      if (Math.abs(y) < 1e-6 && Math.abs(z) < 1e-6 && Math.abs(Math.sin(this.east * Math.PI * 2)) < 1e-6 && Math.abs(Math.sin(this.position * Math.PI * 2)) < 1e-6) { az = -this.east * Math.PI * 2; el = this.position * Math.PI * 2 }
      return [normalize(-az) / (Math.PI * 2), normalize(el) / (Math.PI * 2)]
    }
    const [azimuth, elevation] = this.directionAngles('sun')
    return [normalize(-azimuth) / (Math.PI * 2), elevation / (Math.PI * 2)]
  }
  set(name: string, option: string): boolean {
    const scalar = numeric(option, this.profile === 'rlv')
    if (this.profile === 'rlv') { this.fixed = true; this.selectedPreset = '' }
    if (['preset', 'asset', 'daycycle'].includes(name)) {
      const preset = this.config.presets?.find(p => p.asset.toLowerCase() === option || p.name.toLowerCase() === option &&
        p.location === (this.profile === 'rlv' ? 'inventory' : 'library') && (this.profile === 'rlv' || p.type === (name === 'daycycle' ? 'daycycle' : 'sky')))
      if (this.profile === 'rlva' && name === 'asset' && (!uuid.test(option) || option === zero)) return false
      if (!preset && !uuid.test(option)) return this.profile === 'rlv'
      if (this.profile === 'rlva' && option === zero) return false
      this.selectedAsset = preset?.asset ?? option
      this.selectedPreset = this.profile === 'rlv' ? preset?.name ?? '' : ''
      if (preset) this.values = { ...defaultSky(), ...copySky(preset.sky) }
      this.fixed = preset?.type !== 'daycycle'
      return true
    }
    if (name === 'reset' || name === 'daytime' && scalar !== undefined && (this.profile === 'rlv' ? scalar < 0 : scalar === -1)) {
      this.values = copySky(this.shared); this.fixed = false; this.selectedAsset = null; this.selectedPreset = ''; return true
    }
    if (name === 'daytime') {
      if (scalar === undefined || this.profile === 'rlva' && (scalar < 0 || scalar > 1)) return false
      if (this.profile === 'rlva') {
        const sky = this.config.daytimeSkies?.[String(scalar)]
        if (sky) { this.values = { ...defaultSky(), ...copySky(sky) }; this.fixed = true }
      } else { this.fixed = true; this.selectedPreset = '' }
      return true
    }
    const { base, component } = this.resolve(name)
    if (textures.includes(base)) {
      if (this.profile === 'rlva' && !uuid.test(option)) return false
      this.values[base] = uuid.test(option) ? option : zero
    } else if (['eastangle', 'sunmoonposition'].includes(base)) {
      if (scalar === undefined) return false
      const tau = Math.PI * 2
      if (this.profile === 'rlv') {
        const value = scalar === 0 ? 0 : scalar > 0 && Number.isInteger(scalar) ? 1 : ((scalar % 1) + 1) % 1
        if (base === 'eastangle') this.east = value; else this.position = value
      } else {
        const angles = this.legacyAngles()
        this.east = base === 'eastangle' ? scalar : angles[0]
        this.position = base === 'sunmoonposition' ? scalar : angles[1]
      }
      this.values.sunazimuth = -this.east * tau; this.values.sunelevation = this.position * tau
      this.values.moonazimuth = -this.east * tau + Math.PI; this.values.moonelevation = -this.position * tau
    } else if (vectorNames.includes(base)) {
      const current = [...this.read(base) as number[]]
      if (component !== undefined) {
        if (scalar === undefined) return false
        if (component === 3) {
          const max = Math.max(...current)
          for (let i = 0; i < current.length; i++) current[i] = scalar === 0 || max === 0 ? scalar : current[i]! * scalar / max
        } else current[component] = scalar
      } else {
        const count = base === 'cloudscroll' ? 2 : 3
        const values = parseVector(option, count, this.profile === 'rlv')
        if (!values) return false
        current.splice(0, current.length, ...values)
      }
      this.values[base] = current.map(v => Math.fround(base === 'cloudscroll' && this.profile === 'rlv' ? v + 10 : v * this.scale(base)))
    } else {
      if (scalar === undefined) return false
      let value = scalar
      if (/elevation$/.test(base)) value = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, value))
      if (/azimuth$/.test(base)) value -= Math.PI * 2 * Math.floor((value + Math.PI) / (Math.PI * 2))
      if (base === 'scenegamma' && this.profile === 'rlv') {
        value = Math.min(value, 20)
        value = value <= 0 ? 0.25 : value < 1 ? 0.5 + value * 0.5 : value < 5 ? 1 + (value - 1) * 0.25 : 2 + (value - 5) * 0.06
      }
      this.values[base] = Math.fround(value * this.scale(base))
    }
    this.fixed = true; this.selectedPreset = ''; this.selectedAsset = null
    return true
  }
}
function normalize(value: number): number {
  const tau = Math.PI * 2
  return ((value % tau) + tau) % tau
}
function numeric(text: string, permissive: boolean): number | undefined {
  const match = /^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(text)
  const number = match ? Number(match[0]) : permissive ? 0 : undefined
  return number !== undefined && Number.isFinite(Math.fround(number)) ? Math.fround(number) : undefined
}
function parseVector(text: string, count: number, permissive: boolean): number[] | undefined {
  if (permissive) {
    const parts = text.split(/[;/]/)
    return Array.from({ length: count }, (_, i) => numeric(parts[i] ?? '', true)!)
  }
  const atom = '\\s*([+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?)'
  const match = new RegExp('^' + Array.from({ length: count }, () => atom).join('/'), 'i').exec(text)
  return match ? match.slice(1).map(v => Math.fround(Number(v))) : undefined
}

export function dispatchEnvironmentCommand(avatar: WorldAvatar, prim: Prim, parsed: RlvParsedCommand, command: string): boolean {
  const { viewer } = avatar
  if (!/^(setenv_|getenv_)/.test(parsed.behaviour) || viewer.profile === 'disabled') return false
  const get = parsed.behaviour.startsWith('getenv_'), name = parsed.behaviour.slice(7)
  if (get) {
    const channel = rlvIntegerPrefix(parsed.parameter)
    if ((viewer.profile === 'rlva' && parsed.kind !== 'query') || channel === undefined || !isValidReplyChannel(viewer.profile, channel)) return false
    if (viewer.profile === 'rlva' && !names(viewer.profile).includes(name)) return false
    const known = names(viewer.profile).includes(name) || viewer.profile === 'rlv' && ['asset', 'preset'].includes(name)
    const reply = sendViewerReply(prim.linkset!, avatar, channel, known ? viewer.environment.reply(name) : '')!
    viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'replied', reply })
    return true
  }
  if (parsed.kind !== 'force') return false
  const supported = names(viewer.profile).includes(name) || ['asset', 'preset'].includes(name) || name === (viewer.profile === 'rlv' ? 'reset' : 'daycycle')
  if (!supported) return false
  if (viewer.restrictions.snapshot().some(r => r.behaviour === 'setenv' && !r.option && r.sourcePrim !== prim.key)) {
    viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'unsupported', outcome: 'failed-lock' }); return true
  }
  const applied = viewer.environment.set(name, parsed.option)
  viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: applied ? 'applied' : 'unsupported', ...(applied ? {} : { outcome: 'invalid-option' as const }) })
  return true
}
