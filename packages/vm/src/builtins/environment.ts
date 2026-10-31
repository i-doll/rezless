import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { RegionSettings } from '../world.js'
import { toFloat32 } from '../values/types.js'

// Measured in SLua Tombolo and SLua Tideland on Aditi (2026-10-31).
const DEFAULT_DAY_LENGTH = 14_400
const DEFAULT_DAY_OFFSET = 57_600

function settings(ctx: CallContext): RegionSettings {
  const { world, region } = ctx.linkset
  return world ? world.region(region) : {}
}

const dayLength = (r: RegionSettings) => r.dayLength ?? DEFAULT_DAY_LENGTH
const dayOffset = (r: RegionSettings) => r.dayOffset ?? DEFAULT_DAY_OFFSET

/** llGetRegionDayLength() */
export const llGetRegionDayLength: BuiltinImpl = (ctx) => dayLength(settings(ctx))

/** llGetRegionDayOffset() */
export const llGetRegionDayOffset: BuiltinImpl = (ctx) => dayOffset(settings(ctx))

/** llGetRegionTimeOfDay() — seconds into the region's day cycle: Unix time plus the offset, modulo the length. */
export const llGetRegionTimeOfDay: BuiltinImpl = (ctx) => {
  const r = settings(ctx)
  const micros = ctx.linkset.clock.unixMicros() + dayOffset(r) * 1e6
  return toFloat32((micros % (dayLength(r) * 1e6)) / 1e6)
}

// Parcels have no environment of their own here, so the parcel reads give the region's.
export const llGetDayLength = llGetRegionDayLength
export const llGetDayOffset = llGetRegionDayOffset
