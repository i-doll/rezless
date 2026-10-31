import { LinksetClock } from './clock.js'
import type { Linkset } from './linkset.js'
import type { Script } from './script.js'
import type { Rotation, Vector } from './values/types.js'

export interface WorldOptions {
  /** Unix time in seconds at virtual time 0, read by llGetUnixTime and friends. Default 0. */
  readonly startUnixTime?: number
}

/** Global position of a region's south-west corner, in metres. Regions are 256 m squares. */
export interface RegionCorner {
  readonly x: number
  readonly y: number
}

/** What a region's scripts read about it. Every field is optional. */
export interface RegionSettings {
  /** llGetRegionFlags, a mask of REGION_FLAG_*. Default REGION_FLAG_ALLOW_DIRECT_TELEPORT. */
  readonly flags?: number
  /** llGetRegionAgentCount and SIM_STAT_AGENT_COUNT. Default 1. */
  readonly agentCount?: number
  /** llGetRegionFPS and SIM_STAT_PHYSICS_FPS. Default 45. */
  readonly fps?: number
  /** llGetSimStats values by SIM_STAT_* number, over the defaults. */
  readonly simStats?: Readonly<Record<number, number>>
  /** llGetEnv values by name, over the defaults. */
  readonly env?: Readonly<Record<string, string>>
  /** Seconds in the region's day cycle, read by llGetRegionDayLength and llGetDayLength. Default 14400. */
  readonly dayLength?: number
  /** Seconds added to Unix time before finding the time of day. Default 57600. */
  readonly dayOffset?: number
  /** The sun's rotation, read by llGetRegionSunRotation and llGetSunRotation. Default a measured morning sun. */
  readonly sunRotation?: SkyRotation
  /** The moon's rotation, read by llGetRegionMoonRotation and llGetMoonRotation. Default the moon opposite that sun. */
  readonly moonRotation?: SkyRotation
  /**
   * Terrain height in metres, read by llGround, llGroundNormal, llGroundSlope
   * and llGroundContour: one height, or a function giving the height at each
   * whole-metre grid point from -1 to 256. Heights between grid points are
   * interpolated.
   * Default 22, flat.
   */
  readonly ground?: number | ((x: number, y: number) => number)
  /** Water height in metres across the whole region, read by llWater. Default 20. */
  readonly water?: number
  /** Wind velocity, read by llWind: one vector, or a function of region x and y. Default a measured breeze held fixed. */
  readonly wind?: Vector | ((x: number, y: number) => Vector)
}

/**
 * A unit rotation held fixed, or a function of the day fraction: seconds
 * into the region's day divided by the day length, from 0 up to 1.
 */
export type SkyRotation = Rotation | ((dayFraction: number) => Rotation)

export interface Region extends RegionSettings {
  readonly name: string
  readonly corner: RegionCorner
}

/**
 * Named regions holding several linksets. Every linkset in a world shares the
 * world's clock, and chat reaches prims in other linksets by the in-world
 * range rules. A linkset joins by passing `world` and `region` to its
 * constructor.
 */
export class World {
  readonly clock: LinksetClock
  readonly linksets: Linkset[] = []
  private readonly regions = new Map<string, Region>()

  constructor(opts: WorldOptions = {}) {
    this.clock = new LinksetClock(opts.startUnixTime)
  }

  addRegion(name: string, corner: RegionCorner, settings: RegionSettings = {}): void {
    this.regions.set(name, { ...settings, name, corner })
  }

  /** Region `name`; throws for a region this world does not have. */
  region(name: string | undefined): Region {
    const region = name === undefined ? undefined : this.regions.get(name)
    if (!region) throw new Error(`World: no region named '${name}'`)
    return region
  }

  /** The corner of region `name`; throws for a region this world does not have. */
  corner(name: string | undefined): RegionCorner {
    return this.region(name).corner
  }

  /** The region covering global position (`x`, `y`), if this world has one there. */
  regionAt(x: number, y: number): Region | undefined {
    for (const region of this.regions.values()) {
      const dx = x - region.corner.x
      const dy = y - region.corner.y
      if (dx >= 0 && dx < 256 && dy >= 0 && dy < 256) return region
    }
    return undefined
  }

  allScripts(): Script[] {
    return this.linksets.flatMap((l) => l.allScripts())
  }
}
