import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { RegionSettings } from '../world.js'
import type { LslValue, Vector } from '../values/types.js'
import { NULL_KEY, isVector, toFloat32, vec } from '../values/types.js'
import { terrainHeights } from '../world.js'
import { InventoryType } from '../inventory.js'
import { listElementType } from '../values/list-types.js'
import { sayError } from './debug.js'
import { estateManager, owns } from './land.js'
import { isAgentInRegion, isKey } from './viewer.js'
import { LAND_LEVEL, LAND_REVERT, REGION_FLAG_BLOCK_TERRAFORM } from '../generated/constants.js'

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
  const h = terrainHeights({ ground: DEFAULT_GROUND, ...r })
  return (x, y) => h(clamp(x), clamp(y))
}

/** llGround(vector offset) — bilinear between the four whole-metre grid heights around the point. */
export const llGround: BuiltinImpl = (ctx, args) => {
  const [x, y] = point(ctx, args)
  return toFloat32(groundAt(heights(settings(ctx)), x, y))
}

function groundAt(h: Height, x: number, y: number): number {
  const fx = Math.floor(x)
  const fy = Math.floor(y)
  const u = x - fx
  const v = y - fy
  const south = h(fx, fy) * (1 - u) + h(fx + 1, fy) * u
  const north = h(fx, fy + 1) * (1 - u) + h(fx + 1, fy + 1) * u
  return south * (1 - v) + north * v
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


// Brush sides in metres, from https://wiki.secondlife.com/wiki/LlModifyLand.
const BRUSH_SIZES: readonly number[] = [2, 4, 8]

/**
 * llModifyLand(integer action, integer brush). Fails silently unless the
 * owner is in the region, the region allows terraforming and the owner owns
 * the land; only grid points on the owner's parcels change. LAND_LEVEL sets
 * the brush square to the ground height under the prim's centre and
 * LAND_REVERT restores the configured `ground`. The wiki gives no amounts for
 * LAND_RAISE, LAND_LOWER, LAND_SMOOTH and LAND_NOISE, so they change nothing
 * here, and terraform limits are not modelled.
 */
export const llModifyLand: BuiltinImpl = (ctx, args) => {
  const action = args[0] as number
  const size = BRUSH_SIZES[args[1] as number]
  const { world, region: name } = ctx.linkset
  if (!world || size === undefined || (action !== LAND_LEVEL && action !== LAND_REVERT)) return undefined
  const region = world.region(name)
  if (!isAgentInRegion(ctx, ctx.linkset.owner) || ((region.flags ?? 0) & REGION_FLAG_BLOCK_TERRAFORM)) return undefined
  // The wiki's BUG-4929: child prims and attachments use their local position.
  const centre = ctx.prim.params.position
  const level = groundAt(heights(region), clamp(centre.x), clamp(centre.y))
  const half = size / 2
  for (let x = Math.max(0, Math.ceil(centre.x - half)); x <= Math.min(256, Math.floor(centre.x + half)); ++x) {
    for (let y = Math.max(0, Math.ceil(centre.y - half)); y <= Math.min(256, Math.floor(centre.y + half)); ++y) {
      const parcel = world.parcelAt(region.name, { x, y, z: 0 })
      if (!parcel || !owns(ctx, parcel)) continue
      if (action === LAND_LEVEL) region.terrainEdits.set(`${x},${y}`, level)
      else region.terrainEdits.delete(`${x},${y}`)
    }
  }
  return undefined
}

// Value types by TERRAIN_* rule, from https://wiki.secondlife.com/wiki/LlSetGroundTexture.
const groundTextureRule = (rule: number): readonly ('texture' | 'float' | 'vector')[] | undefined =>
  !Number.isInteger(rule) || rule < 0 ? undefined : rule <= 3 ? ['texture'] : rule <= 7 ? ['float', 'float'] : rule <= 11 ? ['vector']
    : rule <= 15 ? ['float'] : rule <= 19 ? ['vector'] : undefined

const THROTTLE_CALLS = 4
const THROTTLE_SECONDS = 120

/**
 * llSetGroundTexture(list changes) — always 0. Needs an estate manager; the
 * wiki throttles it to 4 calls every 2 minutes, counted here per region.
 * Textures are keys or texture/material names in inventory; NULL_KEY or ""
 * restores the default. The wiki doesn't say what an invalid list does, so
 * one bad rule applies nothing.
 */
export const llSetGroundTexture: BuiltinImpl = (ctx, args) => {
  if (!estateManager(ctx)) {
    sayError(ctx, 'llSetGroundTexture object owner must be able to manage estate.')
    return 0
  }
  const region = ctx.linkset.world!.region(ctx.linkset.region)
  const now = ctx.linkset.clock.unixMicros() / 1e6
  const calls = region.groundTextureCalls
  while (calls.length && calls[0]! <= now - THROTTLE_SECONDS) calls.shift()
  if (calls.length >= THROTTLE_CALLS) return 0
  calls.push(now)
  const changes = args[0] as readonly LslValue[]
  const parsed: [number, LslValue[]][] = []
  for (let i = 0; i < changes.length;) {
    const rule = changes[i++]
    const shape = typeof rule === 'number' && (listElementType(changes, i - 1) ?? 'integer') === 'integer'
      ? groundTextureRule(rule) : undefined
    if (!shape) return 0
    const values: LslValue[] = []
    for (const type of shape) {
      const value = changes[i++]
      if (type === 'texture') {
        if (typeof value !== 'string') return 0
        const key = value === '' ? NULL_KEY : terrainTexture(ctx, value)
        if (key === undefined) return 0
        values.push(key)
      } else if (type === 'float' ? typeof value !== 'number' : value === undefined || !isVector(value)) return 0
      else values.push(type === 'float' ? toFloat32(value as number) : vec((value as Vector).x, (value as Vector).y, (value as Vector).z))
    }
    parsed.push([rule as number, values])
  }
  for (const [rule, values] of parsed) {
    if (values[0] === NULL_KEY) region.groundTextures.delete(rule)
    else region.groundTextures.set(rule, values)
  }
  return 0
}

function terrainTexture(ctx: CallContext, ident: string): string | undefined {
  if (isKey(ident)) return ident.toLowerCase()
  return ctx.prim.inventory.find(item => item.name === ident &&
    (item.type === InventoryType.TEXTURE || item.type === InventoryType.MATERIAL))?.key.toLowerCase()
}
