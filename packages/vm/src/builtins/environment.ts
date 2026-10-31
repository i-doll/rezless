import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { RegionSettings, SkyRotation } from '../world.js'
import type { LslType, LslValue, Rotation } from '../values/types.js'
import { rot, toFloat32, toFloat32Value, vec } from '../values/types.js'
import { rotateVector } from '../values/ops.js'
import { typedList, listElementType } from '../values/list-types.js'
import { ENV_NO_PERMISSIONS } from '../generated/constants.js'

// Measured in SLua Tombolo and SLua Tideland on Aditi (2026-10-31).
const DEFAULT_DAY_LENGTH = 14_400
const DEFAULT_DAY_OFFSET = 57_600

function settings(ctx: CallContext): RegionSettings {
  const { world, region } = ctx.linkset
  return world ? world.region(region) : {}
}

// The sun and moon in SLua Tombolo at llGetRegionTimeOfDay 2290.531 (Aditi,
// 2026-10-31). Real regions put them wherever their environment says.
const DEFAULT_SUN = rot(0, -0.04711, 0, 0.99889)
const DEFAULT_MOON = rot(0, 0.99889, 0, 0.04711)

const dayLength = (r: RegionSettings) => r.dayLength ?? DEFAULT_DAY_LENGTH
const dayOffset = (r: RegionSettings) => r.dayOffset ?? DEFAULT_DAY_OFFSET

/** llGetRegionDayLength() */
export const llGetRegionDayLength: BuiltinImpl = (ctx) => dayLength(settings(ctx))

/** llGetRegionDayOffset() */
export const llGetRegionDayOffset: BuiltinImpl = (ctx) => dayOffset(settings(ctx))

/** llGetRegionTimeOfDay() — seconds into the region's day cycle: Unix time plus the offset, modulo the length. */
export const llGetRegionTimeOfDay: BuiltinImpl = (ctx) => toFloat32(secondsIntoDay(ctx, settings(ctx)))

function secondsIntoDay(ctx: CallContext, r: RegionSettings): number {
  const micros = ctx.linkset.clock.unixMicros() + dayOffset(r) * 1e6
  return (micros % (dayLength(r) * 1e6)) / 1e6
}

function skyRotation(ctx: CallContext, pick: (r: RegionSettings) => SkyRotation | undefined, fallback: Rotation): Rotation {
  const r = settings(ctx)
  const set = pick(r) ?? fallback
  const q = typeof set === 'function' ? set(secondsIntoDay(ctx, r) / dayLength(r)) : set
  return rot(q.x, q.y, q.z, q.s)
}

const sun = (ctx: CallContext) => skyRotation(ctx, (r) => r.sunRotation, DEFAULT_SUN)
const moon = (ctx: CallContext) => skyRotation(ctx, (r) => r.moonRotation, DEFAULT_MOON)
const X_AXIS = vec(1, 0, 0)

/** llGetRegionSunRotation() */
export const llGetRegionSunRotation: BuiltinImpl = (ctx) => sun(ctx)

/** llGetRegionSunDirection() — the sun's rotation applied to <1, 0, 0>. */
export const llGetRegionSunDirection: BuiltinImpl = (ctx) => rotateVector(X_AXIS, sun(ctx))

/** llGetRegionMoonRotation() */
export const llGetRegionMoonRotation: BuiltinImpl = (ctx) => moon(ctx)

/** llGetRegionMoonDirection() — the moon's rotation applied to <1, 0, 0>. */
export const llGetRegionMoonDirection: BuiltinImpl = (ctx) => rotateVector(X_AXIS, moon(ctx))

// Parcels have no environment of their own here, so the parcel reads give the region's.
export const llGetDayLength = llGetRegionDayLength
export const llGetDayOffset = llGetRegionDayOffset
export const llGetTimeOfDay = llGetRegionTimeOfDay
export const llGetSunRotation = llGetRegionSunRotation
export const llGetSunDirection = llGetRegionSunDirection
export const llGetMoonRotation = llGetRegionMoonRotation
export const llGetMoonDirection = llGetRegionMoonDirection


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

/** llGetEnvironment(vector pos, list params). Parcels share the region environment. */
export const llGetEnvironment: BuiltinImpl = (ctx, args) => {
  const requested = args[1] as readonly LslValue[]
  // A bad rule invalidates the entire request, including earlier valid rules.
  // Measured float and string IDs are rejected rather than coerced.
  if (requested.some((rule, i) => typeof rule !== 'number' ||
      (listElementType(requested, i) ?? 'integer') !== 'integer' || !Object.hasOwn(ENVIRONMENT_TYPES, rule))) return []
  const region = settings(ctx)
  const values: LslValue[] = []
  const types: LslType[] = []
  for (const rule of requested as readonly number[]) {
    let tuple = [...(region.environment?.[rule] ?? ENVIRONMENT_DEFAULTS[rule] ?? [])]
    if (rule === 200) tuple = [dayLength(region), dayOffset(region), secondsIntoDay(ctx, region)]
    if (rule === 9 || rule === 14) {
      const rotation = rule === 9 ? moon(ctx) : sun(ctx)
      tuple[0] = rotation
      tuple[4] = rotateVector(X_AXIS, rotation)
    }
    const tupleTypes = ENVIRONMENT_TYPES[rule]!
    values.push(...tuple.map((value, i) => toFloat32Value(value, tupleTypes[i]!)))
    types.push(...tupleTypes)
  }
  return typedList(values, types)
}

// Land ownership, parcel environments and estate permissions are not modelled
// yet. These are the measured refusal paths, not successful environment edits.
export const llSetEnvironment: BuiltinImpl = () => ENV_NO_PERMISSIONS
export const llReplaceEnvironment: BuiltinImpl = () => ENV_NO_PERMISSIONS
