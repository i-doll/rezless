import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { EnvironmentChanges, Parcel, Region } from '../world.js'
import type { LslType, LslValue, Rotation, Vector } from '../values/types.js'
import { NULL_KEY, isRotation, isVector, rot, toFloat32, toFloat32Value, vec } from '../values/types.js'
import { rotateVector } from '../values/ops.js'
import { typedList, listElementType } from '../values/list-types.js'
import { InventoryType } from '../inventory.js'
import { newEnvironmentChanges } from '../world.js'
import { estateManager, owns } from './land.js'
import { isAgentInRegion, isKey } from './viewer.js'
import {
  ENV_INVALID_AGENT, ENV_INVALID_RULE, ENV_NOT_EXPERIENCE, ENV_NO_ENVIRONMENT, ENV_NO_EXPERIENCE_LAND,
  ENV_NO_EXPERIENCE_PERMISSION, ENV_NO_PERMISSIONS, ENV_OK, ENV_VALIDATION_FAIL,
} from '../generated/constants.js'

type Scope = { readonly region: Region | undefined; readonly changes: EnvironmentChanges | undefined }

function regionOf(ctx: CallContext): Region | undefined {
  const { world, region } = ctx.linkset
  return world ? world.region(region) : undefined
}

function regionScope(ctx: CallContext): Scope {
  const region = regionOf(ctx)
  return { region, changes: region?.environmentChanges }
}

/** The environment at a position: its parcel's own one if it has one, else the region's. <-1, -1> is always the region. */
function scopeAt(ctx: CallContext, pos: Vector): Scope {
  const region = regionOf(ctx)
  if (!region || (pos.x === -1 && pos.y === -1)) return { region, changes: region?.environmentChanges }
  const parcel = ctx.linkset.world!.parcelAt(region.name, pos)?.environmentChanges
  return { region, changes: hasEnvironment(parcel) ? parcel! : region.environmentChanges }
}

/** A parcel has its own environment while it has settings on some track. Its overrides outlast removal. */
const hasEnvironment = (changes: EnvironmentChanges | undefined): boolean => !!changes?.tracks.size

const primScope = (ctx: CallContext) => scopeAt(ctx, ctx.prim.regionPosition())

// In-world: SLua Tombolo and SLua Tideland both read 14400 and 57600 (Aditi, 2026-10-31).
const DEFAULT_DAY_LENGTH = 14_400
const DEFAULT_DAY_OFFSET = 57_600

// The sun and moon in SLua Tombolo at llGetRegionTimeOfDay 2290.531 (Aditi,
// 2026-10-31). Real regions put them wherever their environment says.
const DEFAULT_SUN = rot(0, -0.04711, 0, 0.99889)
const DEFAULT_MOON = rot(0, 0.99889, 0, 0.04711)

const dayLength = (s: Scope) => s.changes?.dayLength ?? s.region?.dayLength ?? DEFAULT_DAY_LENGTH
const dayOffset = (s: Scope) => s.changes?.dayOffset ?? s.region?.dayOffset ?? DEFAULT_DAY_OFFSET

function secondsIntoDay(ctx: CallContext, s: Scope): number {
  const micros = ctx.linkset.clock.unixMicros() + dayOffset(s) * 1e6
  return (micros % (dayLength(s) * 1e6)) / 1e6
}

const DEFAULT_TRACK_ALTITUDES = [1000, 2000, 3000]

/** Track 1 (ground) below the first SKY_TRACKS altitude, then sky tracks 2 to 4. */
function skyTrack(s: Scope, z: number): number {
  const altitudes = (s.region?.environment?.[15] ?? DEFAULT_TRACK_ALTITUDES) as readonly number[]
  const above = altitudes.filter(altitude => z >= altitude).length
  return 1 + Math.min(above, 3)
}

const isWaterRule = (rule: number) => rule >= 100 && rule < 200
const trackFor = (s: Scope, rule: number, z: number) => isWaterRule(rule) ? 0 : skyTrack(s, z)

/** The override for `rule` on `track`, or on all tracks when the track has none. */
const override = (s: Scope, track: number, rule: number) =>
  s.changes?.overrides.get(track)?.get(rule) ?? s.changes?.overrides.get(-1)?.get(rule)

function skyRotation(ctx: CallContext, s: Scope, rule: 9 | 14, z: number): Rotation {
  const track = skyTrack(s, z)
  const set = override(s, track, rule)
  if (set) {
    const q = set[0] as Rotation
    return rot(q.x, q.y, q.z, q.s)
  }
  const asset = s.changes?.tracks.get(track)
  const configured = rule === 14 ? asset?.sunRotation ?? s.region?.sunRotation : asset?.moonRotation ?? s.region?.moonRotation
  const fixed = configured ?? (rule === 14 ? DEFAULT_SUN : DEFAULT_MOON)
  const q = typeof fixed === 'function' ? fixed(secondsIntoDay(ctx, s) / dayLength(s)) : fixed
  return rot(q.x, q.y, q.z, q.s)
}

const primZ = (ctx: CallContext) => ctx.prim.regionPosition().z
const X_AXIS = vec(1, 0, 0)

/** llGetRegionDayLength() */
export const llGetRegionDayLength: BuiltinImpl = (ctx) => dayLength(regionScope(ctx))

/** llGetRegionDayOffset() */
export const llGetRegionDayOffset: BuiltinImpl = (ctx) => dayOffset(regionScope(ctx))

/** llGetRegionTimeOfDay() — seconds into the region's day cycle: Unix time plus the offset, modulo the length. */
export const llGetRegionTimeOfDay: BuiltinImpl = (ctx) => toFloat32(secondsIntoDay(ctx, regionScope(ctx)))

/** llGetRegionSunRotation() */
export const llGetRegionSunRotation: BuiltinImpl = (ctx) => skyRotation(ctx, regionScope(ctx), 14, primZ(ctx))

/** llGetRegionSunDirection() — the sun's rotation applied to <1, 0, 0>. */
export const llGetRegionSunDirection: BuiltinImpl = (ctx) => rotateVector(X_AXIS, skyRotation(ctx, regionScope(ctx), 14, primZ(ctx)))

/** llGetRegionMoonRotation() */
export const llGetRegionMoonRotation: BuiltinImpl = (ctx) => skyRotation(ctx, regionScope(ctx), 9, primZ(ctx))

/** llGetRegionMoonDirection() — the moon's rotation applied to <1, 0, 0>. */
export const llGetRegionMoonDirection: BuiltinImpl = (ctx) => rotateVector(X_AXIS, skyRotation(ctx, regionScope(ctx), 9, primZ(ctx)))

// The parcel reads use the prim's parcel environment, which is the region's unless a script replaced it.
export const llGetDayLength: BuiltinImpl = (ctx) => dayLength(primScope(ctx))
export const llGetDayOffset: BuiltinImpl = (ctx) => dayOffset(primScope(ctx))
export const llGetTimeOfDay: BuiltinImpl = (ctx) => toFloat32(secondsIntoDay(ctx, primScope(ctx)))
export const llGetSunRotation: BuiltinImpl = (ctx) => skyRotation(ctx, primScope(ctx), 14, primZ(ctx))
export const llGetSunDirection: BuiltinImpl = (ctx) => rotateVector(X_AXIS, skyRotation(ctx, primScope(ctx), 14, primZ(ctx)))
export const llGetMoonRotation: BuiltinImpl = (ctx) => skyRotation(ctx, primScope(ctx), 9, primZ(ctx))
export const llGetMoonDirection: BuiltinImpl = (ctx) => rotateVector(X_AXIS, skyRotation(ctx, primScope(ctx), 9, primZ(ctx)))


// One SLua Tideland snapshot, Aditi, 2026-10-31. Lighting and cloud values
// change in a real day cycle; these defaults are held fixed like the sky
// rotations above. Tests may supply another snapshot in region.environment.
const ENVIRONMENT_DEFAULTS: Readonly<Record<number, readonly LslValue[]>> = {
  0: [vec(0.343241, 0.295929, 0.295929)],
  1: [1, 1, 1],
  2: [vec(0.285051, 0.285051, 0.285051), 0.27, 0.42, 0,
    vec(0.403484, 0.011, 0), vec(1, 0.526097, 0.918443), vec(1, 0.526097, 0.125), 1],
  4: [0.96, 15000, 896.475098],
  5: [1],
  6: [1.75, 0.096],
  8: [vec(-0.955281, 0, 0.295699), vec(1.500222, 1.264277, 1.137315), vec(1, 0.878872, 0.878751)],
  9: [DEFAULT_MOON, 1, 0.5, 1, vec(0, 0, 0), vec(0.008247, 0.008247, 0.014992), vec(0.000445, 0.000340, 0.000679)],
  10: [6360, 6360, 6420],
  11: [0, 800, 0],
  13: [0],
  14: [DEFAULT_SUN, 1, vec(0.726739, 0.731679, 0.744028), 1, vec(0, 0, 0), vec(1, 0.878196, 0.878074), vec(1, 0.768759, 0.513451)],
  15: [1000, 2000, 3000],
  22: [vec(0.086688, 0.206889, 0.394344), vec(0.108678, 0.146621, 0.180150)],
  23: [0.07, 0.168485, 0.380810, 0.943436],
  24: [0],
  100: [0.04],
  101: [vec(0.015686, 0.149020, 0.250980), 16, 0.25],
  102: [0.5, 0.4],
  103: [1, 0],
  104: [vec(2, 2, 2)],
  105: [0.03, 0.2],
  106: [vec(1.05, -0.42, 0), vec(1.11, -1.16, 0)],
}

const ENVIRONMENT_TYPES: Readonly<Record<number, readonly LslType[]>> = {
  0: ['vector'], 1: ['integer', 'integer', 'integer'],
  2: ['vector', 'float', 'float', 'float', 'vector', 'vector', 'vector', 'integer'],
  4: ['float', 'float', 'float'], 5: ['float'], 6: ['float', 'float'],
  8: ['vector', 'vector', 'vector'],
  9: ['rotation', 'float', 'float', 'integer', 'vector', 'vector', 'vector'],
  10: ['float', 'float', 'float'], 11: ['float', 'float', 'float'], 13: ['float'],
  14: ['rotation', 'float', 'vector', 'integer', 'vector', 'vector', 'vector'],
  15: ['float', 'float', 'float'], 22: ['vector', 'vector'],
  23: ['float', 'float', 'float', 'float'], 24: ['float'],
  100: ['float'], 101: ['vector', 'float', 'float'], 102: ['float', 'float'],
  103: ['integer', 'integer'], 104: ['vector'], 105: ['float', 'float'],
  106: ['vector', 'vector'], 200: ['integer', 'integer', 'float'],
}

/** llGetEnvironment(vector pos, list params). x and y pick the parcel (<-1, -1> the region), z the sky track. */
export const llGetEnvironment: BuiltinImpl = (ctx, args) => {
  const pos = args[0] as Vector
  const requested = args[1] as readonly LslValue[]
  // A bad rule invalidates the entire request, including earlier valid rules.
  // Measured float and string IDs are rejected rather than coerced.
  if (requested.some((rule, i) => typeof rule !== 'number' ||
      (listElementType(requested, i) ?? 'integer') !== 'integer' || !Object.hasOwn(ENVIRONMENT_TYPES, rule))) return []
  const scope = scopeAt(ctx, pos)
  const values: LslValue[] = []
  const types: LslType[] = []
  for (const rule of requested as readonly number[]) {
    let tuple = environmentTuple(scope, rule, trackFor(scope, rule, pos.z))
    if (rule === 200) tuple = [dayLength(scope), dayOffset(scope), secondsIntoDay(ctx, scope)]
    if (rule === 9 || rule === 14) {
      const rotation = skyRotation(ctx, scope, rule, pos.z)
      tuple[0] = rotation
      tuple[4] = rotateVector(X_AXIS, rotation)
    }
    const tupleTypes = ENVIRONMENT_TYPES[rule]!
    values.push(...tuple.map((value, i) => toFloat32Value(value, tupleTypes[i]!)))
    types.push(...tupleTypes)
  }
  return typedList(values, types)
}

// Where a set rule lands in the getter's tuples when the shapes differ.
// Texture rules only clear the getter's "is default texture" flag.
const OVERRIDE_TARGET: Readonly<Record<number, readonly [rule: number, index: number]>> = {
  19: [2, 7], 20: [9, 3], 21: [14, 3], 107: [103, 0],
}
const TEXTURE_RULES = new Set([19, 20, 21, 107])

function environmentTuple(s: Scope, rule: number, track: number): LslValue[] {
  const asset = s.changes?.tracks.get(track)
  const tuple = [...(asset?.environment?.[rule] ?? s.region?.environment?.[rule] ?? ENVIRONMENT_DEFAULTS[rule] ?? [])]
  // All-track overrides first, so the track's own overrides win.
  for (const slot of [-1, track]) {
    for (const [setRule, values] of s.changes?.overrides.get(slot) ?? []) {
      const [target, at] = OVERRIDE_TARGET[setRule] ?? [setRule, 0]
      if (target !== rule) continue
      if (TEXTURE_RULES.has(setRule)) tuple[at] = 0
      else tuple.splice(at, values.length, ...values)
    }
  }
  return tuple
}

type Check = (value: LslValue) => boolean
const within = (lo: number, hi: number): Check => (v) => (v as number) >= lo && (v as number) <= hi
const box = (lo: Vector, hi: Vector): Check => (v) => {
  const { x, y, z } = v as Vector
  return x >= lo.x && x <= hi.x && y >= lo.y && y <= hi.y && z >= lo.z && z <= hi.z
}
const color = box(vec(0, 0, 0), vec(1, 1, 1))
// X east/west and Y north/south; Z is unused.
const flat = (r: number): Check => (v) => Math.abs((v as Vector).x) <= r && Math.abs((v as Vector).y) <= r
const radius = within(1000, 32768)

// Parameter types and ranges from https://wiki.secondlife.com/wiki/LlSetEnvironment
// and https://wiki.secondlife.com/wiki/LlSetAgentEnvironment. A missing check has no documented range.
const SET_RULES: Readonly<Record<number, readonly (readonly [LslType, Check?])[]>> = {
  0: [['vector']],
  2: [['vector', color], ['float', within(0, 1)], ['float', (v) => (v as number) > 0 && (v as number) <= 3],
    ['float', within(0, 1)], ['vector', flat(50)], ['vector', box(vec(0, 0, 0), vec(1, 1, 3))], ['vector', color]],
  4: [['float', within(0, 1)], ['float', within(1000, 2000)], ['float', within(0, 10000)]],
  5: [['float', within(0, 20)]],
  6: [['float', within(0.2, 40)], ['float', within(-10, 10)]],
  9: [['rotation'], ['float', within(0.25, 20)], ['float', within(0, 1)]],
  10: [['float', radius], ['float', radius], ['float', radius]],
  11: [['float', within(0, 1)], ['float', within(5, 1000)], ['float', within(0, 1)]],
  13: [['float', within(0, 500)]],
  14: [['rotation'], ['float', within(0.25, 20)], ['vector', color]],
  19: [['string']], 20: [['string']], 21: [['string']],
  22: [['vector'], ['vector']],
  23: [['float'], ['float'], ['float'], ['float']],
  24: [['float', within(0, 10)]],
  100: [['float', within(-0.5, 0.5)]],
  101: [['vector', color], ['float', within(-10, 10)], ['float', within(0, 20)]],
  102: [['float', within(0, 1)], ['float', within(0, 1)]],
  104: [['vector', box(vec(0, 0, 0), vec(10, 10, 10))]],
  105: [['float', within(0, 3)], ['float', within(0, 3)]],
  106: [['vector', flat(20)], ['vector', flat(20)]],
  107: [['string']],
}

function fits(value: LslValue, type: LslType): boolean {
  switch (type) {
    case 'float': return typeof value === 'number'
    case 'string': return typeof value === 'string'
    case 'vector': return isVector(value)
    default: return isRotation(value)
  }
}

/** A texture key, or the key of a texture of that name in the prim's inventory. */
function textureKey(ctx: CallContext, ident: string): string | undefined {
  if (isKey(ident)) return ident.toLowerCase()
  return ctx.prim.inventory.find(item => item.type === InventoryType.TEXTURE && item.name === ident)?.key.toLowerCase()
}

/**
 * Parse setter rules into values by rule, later repeats winning. Nothing is
 * applied unless every rule is valid: an unknown rule, a missing or
 * wrongly typed value fails with ENV_INVALID_RULE, a value outside the
 * documented range with ENV_VALIDATION_FAIL, and a texture neither a key nor
 * in inventory with ENV_NO_ENVIRONMENT.
 */
function parseRules(ctx: CallContext, params: readonly LslValue[]): number | Map<number, LslValue[]> {
  const rules = new Map<number, LslValue[]>()
  for (let i = 0; i < params.length;) {
    const rule = params[i]
    const shape = typeof rule === 'number' && (listElementType(params, i) ?? 'integer') === 'integer'
      ? SET_RULES[rule] : undefined
    if (!shape) return ENV_INVALID_RULE
    const values: LslValue[] = []
    for (const [type] of shape) {
      const value = params[++i]
      if (value === undefined || !fits(value, type)) return ENV_INVALID_RULE
      values.push(toFloat32Value(value, type))
    }
    ++i
    if (shape.some(([, check], j) => check && !check(values[j]!))) return ENV_VALIDATION_FAIL
    if (TEXTURE_RULES.has(rule as number)) {
      const key = textureKey(ctx, values[0] as string)
      if (key === undefined) return ENV_NO_ENVIRONMENT
      values[0] = key
    }
    rules.set(rule as number, values)
  }
  return rules
}

const isRegionTarget = (pos: Vector) => pos.x === -1 && pos.y === -1

/** Region changes need an estate manager; parcel changes the parcel's owner. */
function mayEdit(ctx: CallContext, pos: Vector): boolean {
  const { world, region } = ctx.linkset
  if (!world || region === undefined) return false
  if (isRegionTarget(pos)) return estateManager(ctx)
  const parcel = world.parcelAt(region, pos)
  return parcel !== undefined && owns(ctx, parcel)
}

/** The changes a setter edits: the region's, or the parcel's own environment if it has one. */
function editTarget(ctx: CallContext, pos: Vector): { changes: EnvironmentChanges | undefined; parcel?: Parcel } {
  const { world, region } = ctx.linkset
  const r = world!.region(region)
  if (isRegionTarget(pos)) return { changes: r.environmentChanges }
  const parcel = world!.parcelAt(r.name, pos)!
  return { changes: hasEnvironment(parcel.environmentChanges) ? parcel.environmentChanges : undefined, parcel }
}

/**
 * llSetEnvironment(vector pos, list params) — override environment
 * parameters on the region (<-1, -1, z>) or a parcel. z picks the sky track by
 * altitude, -1 the all-tracks slot; water rules always land on the water
 * track, so the latest water override wins. An empty list removes every override. A parcel must already have
 * its own environment (from llReplaceEnvironment). No throttle is modelled:
 * the wiki gives none.
 */
export const llSetEnvironment: BuiltinImpl = (ctx, args) => {
  const pos = args[0] as Vector
  if (!mayEdit(ctx, pos)) return ENV_NO_PERMISSIONS
  const { changes } = editTarget(ctx, pos)
  if (!changes) return ENV_NO_ENVIRONMENT
  const rules = parseRules(ctx, args[1] as readonly LslValue[])
  if (typeof rules === 'number') return rules
  if (!rules.size) {
    changes.overrides.clear()
    return ENV_OK
  }
  const scope: Scope = { region: regionOf(ctx), changes }
  for (const [rule, values] of rules) {
    // Water has one track, so its rules always go there, whatever z is.
    const slot = isWaterRule(rule) ? 0 : pos.z === -1 ? -1 : skyTrack(scope, pos.z)
    let track = changes.overrides.get(slot)
    if (!track) changes.overrides.set(slot, track = new Map())
    track.set(rule, values)
  }
  return ENV_OK
}

/** A settings item in the prim's inventory, by name or by item key. */
function settingsItem(ctx: CallContext, ident: string) {
  const lower = ident.toLowerCase()
  return ctx.prim.inventory.find(item => item.type === InventoryType.SETTING &&
    (item.name === ident || (isKey(ident) && item.key.toLowerCase() === lower)))
}

const isRemoval = (ident: string) => ident === '' || ident === NULL_KEY

/**
 * llReplaceEnvironment(vector pos, string environment, integer track,
 * integer day_length, integer day_offset) — apply a settings item from
 * inventory to one track (0 water, 1 ground, 2 to 4 sky) or all of them (-1).
 * "" or NULL_KEY removes the track's settings; tracks 0 and 1 can't be
 * removed. Negative day values leave the day unchanged. A parcel without
 * its own environment gets one, starting from the region's. Overrides from
 * llSetEnvironment are kept. The change applies at once; Second Life applies
 * it after downloading the asset. A key that names no settings item returns
 * ENV_OK and changes nothing.
 */
export const llReplaceEnvironment: BuiltinImpl = (ctx, args) => {
  const pos = args[0] as Vector
  const ident = args[1] as string
  const track = args[2] as number
  const length = args[3] as number
  const offset = args[4] as number
  if (!mayEdit(ctx, pos)) return ENV_NO_PERMISSIONS
  const removal = isRemoval(ident)
  if (removal && (track === 0 || track === 1)) return ENV_NO_PERMISSIONS
  // The wiki lists no code for a track outside -1 to 4.
  if (track < -1 || track > 4) return ENV_INVALID_RULE
  const item = removal ? undefined : settingsItem(ctx, ident)
  if (!removal && !item && !isKey(ident)) return ENV_NO_ENVIRONMENT
  if (!removal && !item) return ENV_OK
  const target = editTarget(ctx, pos)
  if (target.parcel && !target.changes && removal) return ENV_OK
  const changes = target.changes ?? startParcelEnvironment(ctx, target.parcel!)
  const tracks = track === -1 ? [0, 1, 2, 3, 4] : [track]
  for (const t of tracks) {
    if (removal) changes.tracks.delete(t)
    else changes.tracks.set(t, item!.environment ?? {})
  }
  if (target.parcel && !hasEnvironment(changes)) {
    // The parcel is back on the region's environment; its overrides wait for the next one.
    delete changes.dayLength
    delete changes.dayOffset
    return ENV_OK
  }
  if (length > 0) changes.dayLength = length
  if (offset >= 0) changes.dayOffset = offset
  return ENV_OK
}

/** Give a parcel the region's settings and day, keeping any overrides it had before. */
function startParcelEnvironment(ctx: CallContext, parcel: Parcel): EnvironmentChanges {
  const region = regionOf(ctx)!.environmentChanges
  const changes = parcel.environmentChanges ?? newEnvironmentChanges()
  for (const [track, asset] of region.tracks) changes.tracks.set(track, asset)
  if (region.dayLength !== undefined) changes.dayLength = region.dayLength
  if (region.dayOffset !== undefined) changes.dayOffset = region.dayOffset
  parcel.environmentChanges = changes
  return changes
}

/**
 * The checks both agent calls share. In-world, a missing avatar or an object
 * key gave ENV_INVALID_AGENT before the experience check, and the present
 * owner without an experience ENV_NOT_EXPERIENCE (Aditi, SLua Tideland,
 * 2026-10-31). The later checks follow the wiki.
 */
function agentCheck(ctx: CallContext, agent: string): number {
  if (!isAgentInRegion(ctx, agent)) return ENV_INVALID_AGENT
  const xp = ctx.state.experience
  if (!xp) return ENV_NOT_EXPERIENCE
  if (!xp.allowedHere) return ENV_NO_EXPERIENCE_LAND
  const lower = agent.toLowerCase()
  if (![...xp.agents].some(a => a.toLowerCase() === lower)) return ENV_NO_EXPERIENCE_PERMISSION
  return ENV_OK
}

/**
 * llSetAgentEnvironment(key agent, float transition, list params) — tell an
 * experience participant's viewer to use these settings. An empty list
 * clears what the experience set. Recorded in Script.viewerRequests.
 */
export const llSetAgentEnvironment: BuiltinImpl = (ctx, args) => {
  const agent = (args[0] as string).toLowerCase()
  const checked = agentCheck(ctx, agent)
  if (checked !== ENV_OK) return checked
  const rules = parseRules(ctx, args[2] as readonly LslValue[])
  if (typeof rules === 'number') return rules
  ctx.state.viewerRequests.push({ kind: 'agentEnvironment', agent, transition: args[1] as number,
    params: [...rules].flatMap(([rule, values]) => [rule, ...values]) })
  return ENV_OK
}

/**
 * llReplaceAgentEnvironment(key agent, float transition, string environment)
 * — tell an experience participant's viewer to use a settings item, by
 * inventory name or asset key. "" or NULL_KEY clears what the experience
 * set. Recorded in Script.viewerRequests with the item's key, or NULL_KEY to clear.
 */
export const llReplaceAgentEnvironment: BuiltinImpl = (ctx, args) => {
  const agent = (args[0] as string).toLowerCase()
  const ident = args[2] as string
  const checked = agentCheck(ctx, agent)
  if (checked !== ENV_OK) return checked
  const item = isRemoval(ident) ? undefined : settingsItem(ctx, ident)
  if (!isRemoval(ident) && !item && !isKey(ident)) return ENV_NO_ENVIRONMENT
  const environment = isRemoval(ident) ? NULL_KEY : (item?.key ?? ident).toLowerCase()
  ctx.state.viewerRequests.push({ kind: 'replaceAgentEnvironment', agent, transition: args[1] as number,
    environment, ...(item?.environment ? { asset: item.environment } : {}) })
  return ENV_OK
}
