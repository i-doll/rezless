import { LinksetClock } from './clock.js'
import type { Linkset } from './linkset.js'
import type { Script } from './script.js'

export interface WorldOptions {
  /** Unix time in seconds at virtual time 0, read by llGetUnixTime and friends. Default 0. */
  readonly startUnixTime?: number
}

/** Global position of a region's south-west corner, in metres. Regions are 256 m squares. */
export interface RegionCorner {
  readonly x: number
  readonly y: number
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
  private readonly regions = new Map<string, RegionCorner>()

  constructor(opts: WorldOptions = {}) {
    this.clock = new LinksetClock(opts.startUnixTime)
  }

  addRegion(name: string, corner: RegionCorner): void {
    this.regions.set(name, corner)
  }

  /** The corner of region `name`; throws for a region this world does not have. */
  corner(name: string | undefined): RegionCorner {
    const corner = name === undefined ? undefined : this.regions.get(name)
    if (!corner) throw new Error(`World: no region named '${name}'`)
    return corner
  }

  allScripts(): Script[] {
    return this.linksets.flatMap((l) => l.allScripts())
  }
}
