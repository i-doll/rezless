import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { RegionSettings, SkyRotation } from '../world.js'
import type { Rotation } from '../values/types.js'
import { rot, toFloat32, vec } from '../values/types.js'
import { rotateVector } from '../values/ops.js'

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
