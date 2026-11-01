import { deterministicKey } from './keys.js'
import { ZERO_VECTOR, ZERO_ROTATION, NULL_KEY } from './values/types.js'
import { LinksetClock } from './clock.js'
import type { Linkset } from './linkset.js'
import type { Script } from './script.js'
import type { LslValue, Rotation, Vector } from './values/types.js'

/** A placeable sensor target. Positions use its region's coordinates. */
export interface WorldObjectOptions {
  readonly region: string
  readonly key?: string
  readonly name?: string
  readonly position?: Vector
  readonly rotation?: Rotation
  readonly velocity?: Vector
  readonly owner?: string
  readonly group?: string
  readonly physical?: boolean
  readonly scripted?: boolean
  /** Whether its script is currently using simulator resources. */
  readonly active?: boolean
}

export interface WorldAvatarOptions extends WorldObjectOptions {
  readonly username: string
}

export interface WorldEntity {
  key: string
  name: string
  region: string
  position: Vector
  rotation: Rotation
  velocity: Vector
  owner: string
  group: string
  physical: boolean
  scripted: boolean
  active: boolean
  username?: string
}

/** Sensor properties absent from the live prim model. */
export interface SensorObjectProperties {
  readonly group?: string
  readonly velocity?: Vector
  readonly active?: boolean
}

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
  /**
   * llGetEnvironment result tuples by SKY_* / WATER_* parameter. Defaults
   * are fixed Aditi samples. Sun/moon rotations and directions always come
   * from sunRotation/moonRotation; day info comes from dayLength/dayOffset.
   * This world has one environment per region and no land edit permissions.
   */
  readonly environment?: Readonly<Record<number, readonly LslValue[]>>
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
  /** llScriptDanger: one answer for the whole region, or a function of region x and y from 0 to 256. Default false. */
  readonly scriptDanger?: boolean | ((x: number, y: number) => boolean)
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

/** Region coordinates, inclusive minimum and exclusive maximum. */
export interface ParcelBounds {
  readonly min: RegionCorner
  readonly max: RegionCorner
}

/** Parcel fixtures supply land impact explicitly; rezzing VM prims does not alter it. */
export interface WorldParcelOptions {
  readonly region: string
  /** Defaults to the whole region. Later parcels take precedence where bounds overlap. */
  readonly bounds?: ParcelBounds
  readonly id?: string
  readonly name?: string
  readonly description?: string
  readonly owner?: string
  readonly group?: string
  /** Square metres. Defaults to the bounding rectangle's area. */
  readonly area?: number
  readonly flags?: number
  readonly seeAvatars?: boolean
  /** Unrounded land-impact budget. Queries truncate after summing same-owner budgets. */
  readonly maxPrims?: number
  /** Land impact by PARCEL_COUNT_* category, including total at 0. Unset categories read 0. */
  readonly primCounts?: Readonly<Record<number, number>>
  /** Land impact by owner UUID. Visible only to the parcel owner. */
  readonly primOwners?: Readonly<Record<string, number>>
  readonly musicURL?: string
  readonly landingPoint?: Vector
  readonly landingLookAt?: Vector
  readonly tpRouting?: number
}

export interface Parcel extends WorldParcelOptions {
  readonly id: string
  readonly bounds: ParcelBounds
  readonly owner: string
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
  /** Targets without scripts to execute. Returned entities may be moved between scans. */
  readonly objects: WorldEntity[] = []
  readonly avatars: WorldEntity[] = []
  readonly parcels: Parcel[] = []
  /** Optional sensor metadata for linksets loaded with loadLinkset. */
  readonly sensorProperties = new Map<Linkset, SensorObjectProperties>()
  private readonly regions = new Map<string, Region>()

  constructor(opts: WorldOptions = {}) {
    this.clock = new LinksetClock(opts.startUnixTime)
  }

  addObject(opts: WorldObjectOptions): WorldEntity {
    const object = this.entity(opts)
    this.objects.push(object)
    return object
  }

  addAvatar(opts: WorldAvatarOptions): WorldEntity {
    const avatar = this.entity(opts)
    avatar.username = opts.username
    avatar.owner = avatar.key
    this.avatars.push(avatar)
    return avatar
  }

  private entity(opts: WorldObjectOptions): WorldEntity {
    this.region(opts.region)
    return {
      key: opts.key ?? deterministicKey(`world/entity/${this.objects.length + this.avatars.length}`),
      name: opts.name ?? 'Object', region: opts.region,
      position: { ...(opts.position ?? ZERO_VECTOR) },
      rotation: { ...(opts.rotation ?? ZERO_ROTATION) },
      velocity: { ...(opts.velocity ?? ZERO_VECTOR) },
      owner: opts.owner ?? NULL_KEY, group: opts.group ?? NULL_KEY,
      physical: opts.physical ?? false, scripted: opts.scripted ?? false,
      active: opts.active ?? false,
    }
  }

  addRegion(name: string, corner: RegionCorner, settings: RegionSettings = {}): void {
    this.regions.set(name, { ...settings, name, corner })
  }

  addParcel(opts: WorldParcelOptions): Parcel {
    this.region(opts.region)
    const parcel: Parcel = {
      ...opts,
      id: opts.id ?? deterministicKey(`world/parcel/${this.parcels.length}`),
      bounds: opts.bounds ?? { min: { x: 0, y: 0 }, max: { x: 256, y: 256 } },
      owner: opts.owner ?? NULL_KEY,
    }
    this.parcels.push(parcel)
    return parcel
  }

  /** Positions outside the region read its nearest edge, never a neighbouring region. */
  parcelAt(region: string, position: Vector): Parcel | undefined {
    const x = Math.min(255.999999, Math.max(0, position.x))
    const y = Math.min(255.999999, Math.max(0, position.y))
    for (let i = this.parcels.length - 1; i >= 0; --i) {
      const p = this.parcels[i]!
      if (p.region === region && x >= p.bounds.min.x && x < p.bounds.max.x && y >= p.bounds.min.y && y < p.bounds.max.y) return p
    }
    return undefined
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
