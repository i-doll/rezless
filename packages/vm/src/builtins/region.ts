import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { Region } from '../world.js'
import type { Vector } from '../values/types.js'
import {
  REGION_FLAG_ALLOW_DIRECT_TELEPORT,
  SIM_STAT_ACTIVE_SCRIPT_COUNT,
  SIM_STAT_AGENT_COUNT,
  SIM_STAT_PHYSICS_FPS,
  SIM_STAT_SCRIPT_RUN_PCT,
} from '../generated/constants.js'

/** Where a linkset outside a world sits: a lone region with no neighbours. */
const LONE_REGION: Region = { name: 'Rezless', corner: { x: 256000, y: 256000 } }

// Measured with llGetEnv in SLua Tideland on Aditi (2026-10-31).
const ENV: Readonly<Record<string, string>> = {
  agent_limit: '44',
  agent_limit_max: '110',
  allow_damage_adjust: '1',
  chat_range: '20',
  damage_limit: '0',
  dynamic_pathfinding: 'enabled',
  estate_id: '100077',
  estate_name: 'Luau',
  grid: 'aditi',
  region_cpu_ratio: '1',
  region_idle: '0',
  region_object_bonus: '1',
  region_product_name: 'Estate / Full Region',
  region_product_sku: '024',
  region_rating: 'MATURE',
  restrict_combat_log: '0',
  shout_range: '100',
  sim_channel: 'Luau',
  sim_version: '2026-07-24.30110090421',
  simulator_hostname: 'simhost-08ead0889a544632b.aditi.secondlife.io',
  whisper_range: '10',
}

function regionOf(ctx: CallContext): Region {
  const { world, region } = ctx.linkset
  return world ? world.region(region) : LONE_REGION
}

const fps = (r: Region) => r.fps ?? 45
const agentCount = (r: Region) => r.agentCount ?? 1

/** llGetRegionName() */
export const llGetRegionName: BuiltinImpl = (ctx) => regionOf(ctx).name

/** llGetRegionCorner() — global position of the region's south-west corner, z 0. */
export const llGetRegionCorner: BuiltinImpl = (ctx) => {
  const { x, y } = regionOf(ctx).corner
  return { x, y, z: 0 }
}

/** llGetRegionFlags() */
export const llGetRegionFlags: BuiltinImpl = (ctx) => regionOf(ctx).flags ?? REGION_FLAG_ALLOW_DIRECT_TELEPORT

/** llGetRegionFPS() */
export const llGetRegionFPS: BuiltinImpl = (ctx) => fps(regionOf(ctx))

/** llGetRegionAgentCount() */
export const llGetRegionAgentCount: BuiltinImpl = (ctx) => agentCount(regionOf(ctx))

/** llGetSimStats(integer stat) — 0.0 for stats the region does not set, and for unknown numbers. */
export const llGetSimStats: BuiltinImpl = (ctx, args) => {
  const stat = (args[0] as number | undefined) ?? 0
  const region = regionOf(ctx)
  const set = region.simStats?.[stat]
  if (set !== undefined) return set
  switch (stat) {
    case SIM_STAT_PHYSICS_FPS:
      return fps(region)
    case SIM_STAT_AGENT_COUNT:
      return agentCount(region)
    case SIM_STAT_SCRIPT_RUN_PCT:
      return 100
    case SIM_STAT_ACTIVE_SCRIPT_COUNT: {
      const { peers, region: name } = ctx.linkset
      return peers
        .filter((l) => l.region === name).flatMap((l) => l.allScripts()).filter((s) => s.running && !s.dead).length
    }
    default:
      return 0
  }
}

function env(ctx: CallContext, name: string): string {
  const region = regionOf(ctx)
  const set = region.env && Object.hasOwn(region.env, name) ? region.env[name] : undefined
  if (set !== undefined) return set
  if (name === 'frame_number') return String(Math.floor((ctx.linkset.clock.now * fps(region)) / 1000))
  if (name === 'region_start_time') return String(Math.floor(ctx.linkset.clock.startUnixTime))
  return Object.hasOwn(ENV, name) ? ENV[name]! : ''
}

/** llGetEnv(string name) — "" for a name the region does not know; names match exactly. */
export const llGetEnv: BuiltinImpl = (ctx, args) => env(ctx, (args[0] as string | undefined) ?? '')

/** llGetSimulatorHostname() — the same as llGetEnv("simulator_hostname"). */
export const llGetSimulatorHostname: BuiltinImpl = (ctx) => env(ctx, 'simulator_hostname')

/**
 * llEdgeOfWorld(vector pos, vector dir) — TRUE when a ray from `pos` along
 * the horizontal part of `dir` leaves the region through an edge with no
 * region beyond it. A ray through a corner reads the north or south edge;
 * a ray that never crosses the region, or has no horizontal part, gives
 * FALSE and TRUE respectively.
 */
export const llEdgeOfWorld: BuiltinImpl = (ctx, args) => {
  const pos = (args[0] as Vector | undefined) ?? { x: 0, y: 0, z: 0 }
  const dir = (args[1] as Vector | undefined) ?? { x: 0, y: 0, z: 0 }
  if (dir.x === 0 && dir.y === 0) return 1
  const span = (p: number, d: number): [number, number] => {
    if (d === 0) return p >= 0 && p <= 256 ? [-Infinity, Infinity] : [Infinity, -Infinity]
    const a = -p / d
    const b = (256 - p) / d
    return a < b ? [a, b] : [b, a]
  }
  const [x0, x1] = span(pos.x, dir.x)
  const [y0, y1] = span(pos.y, dir.y)
  if (Math.max(x0, y0, 0) > Math.min(x1, y1)) return 0
  const [ex, ey] = y1 <= x1 ? [0, Math.sign(dir.y)] : [Math.sign(dir.x), 0]
  const { world } = ctx.linkset
  if (!world) return 1
  const { corner } = regionOf(ctx)
  return world.regionAt(corner.x + 128 + 256 * ex, corner.y + 128 + 256 * ey) ? 0 : 1
}

const inRegion = (v: number) => Math.min(Math.max(v, 0), 256)

/**
 * llScriptDanger(vector pos) — the region's scriptDanger setting at pos. A
 * position off the region reads the nearest point on its edge, and z is ignored.
 */
export const llScriptDanger: BuiltinImpl = (ctx, args) => {
  const pos = (args[0] as Vector | undefined) ?? { x: 0, y: 0, z: 0 }
  const danger = regionOf(ctx).scriptDanger ?? false
  return (typeof danger === 'function' ? danger(inRegion(pos.x), inRegion(pos.y)) : danger) ? 1 : 0
}
