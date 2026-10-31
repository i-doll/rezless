import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { RegionSettings } from '../world.js'
import type { LslValue, Vector } from '../values/types.js'
import { toFloat32, vec } from '../values/types.js'

// Measured in SLua Tombolo and SLua Tideland on Aditi (2026-10-31).
const DEFAULT_GROUND = 22
const DEFAULT_WATER = 20
// llWind(ZERO_VECTOR) under the SLua Tideland platform. Real regions simulate their own wind.
const DEFAULT_WIND = vec(-0.654923, -2.482508, 0)

function settings(ctx: CallContext): RegionSettings {
  const { world, region } = ctx.linkset
  return world ? world.region(region) : {}
}

/**
 * The region x and y the call reads: the prim's position plus the offset's x
 * and y, held between -1 and 256. The terrain grid has a line of heights
 * just outside the west and south edges, and one along the east and north.
 */
function point(ctx: CallContext, args: readonly LslValue[]): [number, number] {
  const offset = (args[0] as Vector | undefined) ?? { x: 0, y: 0, z: 0 }
  const pos = ctx.prim.regionPosition()
  return [clamp(pos.x + offset.x), clamp(pos.y + offset.y)]
}

const clamp = (v: number) => Math.min(Math.max(v, -1), 256)

type Height = (x: number, y: number) => number

function heights(r: RegionSettings): Height {
  const ground = r.ground ?? DEFAULT_GROUND
  return typeof ground === 'number' ? () => ground : (x, y) => ground(clamp(x), clamp(y))
}

/** llGround(vector offset) — bilinear between the four whole-metre grid heights around the point. */
export const llGround: BuiltinImpl = (ctx, args) => {
  const h = heights(settings(ctx))
  const [x, y] = point(ctx, args)
  const fx = Math.floor(x)
  const fy = Math.floor(y)
  const u = x - fx
  const v = y - fy
  const south = h(fx, fy) * (1 - u) + h(fx + 1, fy) * u
  const north = h(fx, fy + 1) * (1 - u) + h(fx + 1, fy + 1) * u
  return toFloat32(south * (1 - v) + north * v)
}

/**
 * The ground normal, not unit length: its x is the height drop across the
 * point's cell along the nearest grid row, its y the drop along the nearest
 * grid column, and its z 1.
 */
function normal(ctx: CallContext, args: readonly LslValue[]): Vector {
  const h = heights(settings(ctx))
  const [x, y] = point(ctx, args)
  const fx = Math.floor(x)
  const fy = Math.floor(y)
  const rx = Math.round(x)
  const ry = Math.round(y)
  return vec(h(fx, ry) - h(fx + 1, ry) + 0, h(rx, fy) - h(rx, fy + 1) + 0, 1)
}

/** llGroundNormal(vector offset) */
export const llGroundNormal: BuiltinImpl = (ctx, args) => normal(ctx, args)

/** llGroundSlope(vector offset) — the normal's x and y, with z -(x² + y²). */
export const llGroundSlope: BuiltinImpl = (ctx, args) => {
  const n = normal(ctx, args)
  return vec(n.x, n.y, -(n.x * n.x + n.y * n.y) + 0)
}

/** llGroundContour(vector offset) — the slope turned a quarter left, flat. */
export const llGroundContour: BuiltinImpl = (ctx, args) => {
  const n = normal(ctx, args)
  return vec(-n.y + 0, n.x, 0)
}

/** llWater(vector offset) — one water height for the whole region. */
export const llWater: BuiltinImpl = (ctx) => settings(ctx).water ?? DEFAULT_WATER

/** llWind(vector offset) */
export const llWind: BuiltinImpl = (ctx, args) => {
  const wind = settings(ctx).wind ?? DEFAULT_WIND
  if (typeof wind !== 'function') return vec(wind.x, wind.y, wind.z)
  const [x, y] = point(ctx, args)
  const w = wind(x, y)
  return vec(w.x, w.y, w.z)
}
