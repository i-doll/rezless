import type { KeyframedMotion } from './builtins/motion.js'
import type { CollisionFilter, CollisionSound } from './builtins/collision.js'
import type { Script } from './script.js'
import type { InventoryItem } from './inventory.js'
import { InventoryType, inventoryItemName } from './inventory.js'
import { defaultPrimParams, readPrimParam, writePrimParam, type PrimParams } from './prim-params.js'
import type { LslValue, Rotation, Vector } from './values/types.js'
import { mulRotation } from './values/ops.js'
import { NULL_KEY } from './values/types.js'
import { deterministicKey } from './keys.js'
import { PERM_ALL, STATUS_PHANTOM } from './generated/constants.js'
import type { Linkset } from './linkset.js'

let primsMade = 0

export interface AttachedSound {
  sound: string
  volume: number
  loop: boolean
  sync: 'none' | 'master' | 'slave'
}

export interface SoundTrigger {
  sound: string
  volume: number
  position: Vector
  topNorthEast?: Vector
  bottomSouthWest?: Vector
}

/** Requested sound state; no audio decoding, playback clock or listener simulation. */
export interface PrimSoundState {
  current: AttachedSound | null
  queueing: boolean
  radius: number
  triggers: SoundTrigger[]
  preloads: string[]
}

/** Media values indexed by PRIM_MEDIA_* parameter, for one face. */
export type PrimMediaParams = ReadonlyArray<number | string>

/** Accepted particle request; numeric values retain their requested magnitude. */
export interface PrimParticleState {
  readonly rules: ReadonlyArray<LslValue>
  /** Resolved asset UUID; NULL_KEY selects the default particle texture. */
  readonly texture: string
}

export interface PrimOptions {
  /** The prim's key. Defaults to a distinct key, so other scripts can look the prim up. */
  readonly key?: string
  readonly name?: string
  readonly description?: string
}

/**
 * A single prim in a linkset. Holds the prim's identity, its script roster,
 * its (full) inventory, and the PRIM_* parameter store. Scripts join a prim
 * via `prim.addScript(script)`.
 */
export class Prim {
  /** 1-based link number assigned by the host Linkset. 0 = unlinked single prim. */
  linkNumber = 0
  key: string
  name: string
  description: string
  readonly scripts: Script[] = []
  readonly inventory: InventoryItem[] = []
  readonly params: PrimParams = defaultPrimParams()
  /**
   * llSetStatus / PRIM_PHYSICS / PRIM_PHANTOM bitfield. Stored on the prim
   * (not in `params`) so `STATUS_*` flags without a PRIM_* counterpart
   * (BLOCK_GRAB, DIE_AT_EDGE, ROTATE_*, etc.) live alongside the
   * PRIM_PHYSICS / PRIM_PHANTOM bits in one place.
   */
  statusFlags = 0
  /** Keyframed playback is shared by every script in the object. */
  keyframedMotion: KeyframedMotion | null = null
  collisionFilter: CollisionFilter = { name: '', key: NULL_KEY, accept: true }
  /** null selects the simulator's default material impact sound. */
  collisionSound: CollisionSound | null = null
  volumeDetect = false
  allowInventoryDrop = false
  /** Zero denies remote script loading. */
  remoteScriptAccessPin = 0
  appearance: {
    text: { text: string; color: { x: number; y: number; z: number }; alpha: number } | null
    description: string
  } = { text: null, description: '' }
  /** llSetTouchText; '' is the viewer's default. */
  touchText = ''
  /** llSetSitText; '' is the viewer's default. */
  sitText = ''
  /** llSetPayPrice arguments as the script passed them, or null if never called. */
  payPrice: { price: number; buttons: LslValue[] } | null = null
  /** UUIDs of the object animations this prim's scripts started. */
  readonly objectAnimations = new Set<string>()
  /** Shared media state per face; absent entries have no media. */
  readonly media = new Map<number, PrimMediaParams>()

  /** Last particle request, or null after clearing/rejecting it. No renderer simulation. */
  particles: PrimParticleState | null = null

  /** Last attached request and one-shot history, shared by this prim's scripts. */
  readonly sound: PrimSoundState = {
    current: null, queueing: false, radius: 0, triggers: [], preloads: [],
  }

  /** Set when this prim joins a linkset. */
  linkset?: Linkset
  /** Virtual time in ms when the prim joined its linkset. */
  createdAt = 0

  constructor(opts: PrimOptions = {}) {
    this.key = opts.key ?? deterministicKey(`prim/${++primsMade}`)
    this.name = opts.name ?? 'Object'
    this.description = opts.description ?? ''
    this.appearance.description = this.description
  }

  /** Add a script to this prim's inventory and roster. */
  addScript(script: Script, opts: { name?: string; key?: string } = {}): void {
    this.scripts.push(script)
    this.inventory.push({
      name: inventoryItemName(opts.name ?? script.scriptName),
      type: InventoryType.SCRIPT,
      key: opts.key ?? NULL_KEY,
      creator: NULL_KEY,
      description: '',
      acquireTimeMs: this.linkset?.clock.now ?? 0,
      permMask: {
        base: PERM_ALL,
        owner: PERM_ALL,
        group: 0,
        everyone: 0,
        next: PERM_ALL,
      },
      script,
    })
  }

  /**
   * Add a non-script inventory item (notecard, texture, etc.). The caller
   * is responsible for setting `acquireTimeMs`; if you want it to default
   * to the current linkset clock, build the item with `makeInventoryItem`
   * and pass `acquireTimeMs: this.linkset?.clock.now ?? 0`.
   */
  addInventory(item: InventoryItem): void {
    this.inventory.push({ ...item, name: inventoryItemName(item.name) })
  }

  /** Find a script by inventory name. */
  findScript(name: string): Script | undefined {
    for (const it of this.inventory) {
      if (it.type === InventoryType.SCRIPT && it.name === name) return it.script
    }
    return undefined
  }

  /**
   * Read one PRIM_* rule starting at `cursor` in `rules`. Returns the flat
   * value list and the number of slots consumed past the rule constant
   * (face index, etc.), or `null` for unknown / unsupported constants.
   */
  getPrimParam(
    param: number,
    rules: ReadonlyArray<LslValue>,
    cursor: number,
  ): { values: LslValue[]; consumed: number } | null {
    return readPrimParam(this, param, rules, cursor)
  }

  /**
   * Apply one PRIM_* rule starting at `cursor` in `rules`. Returns the
   * number of slots consumed past the rule constant, or `null` for
   * unknown / unsupported constants (caller stops walking).
   */
  setPrimParam(
    param: number,
    rules: ReadonlyArray<LslValue>,
    cursor: number,
    caller: Prim = this,
  ): number | null {
    return writePrimParam(this, param, rules, cursor, caller)
  }

  /**
   * Position in region coordinates. `params.position` is the region
   * position of a root or lone prim and the root-relative offset of a child.
   */
  regionPosition(): Vector {
    const local = this.params.position
    const root = this.linkset?.prims[0]
    if (!root || root === this) return local
    const { x, y, z, s } = root.params.rotation
    const tx = 2 * (y * local.z - z * local.y)
    const ty = 2 * (z * local.x - x * local.z)
    const tz = 2 * (x * local.y - y * local.x)
    const origin = root.params.position
    return {
      x: origin.x + local.x + s * tx + (y * tz - z * ty),
      y: origin.y + local.y + s * ty + (z * tx - x * tz),
      z: origin.z + local.z + s * tz + (x * ty - y * tx),
    }
  }

  /**
   * Rotation in region coordinates. `params.rotation` is the region rotation
   * of a root or lone prim and the rotation relative to the root of a child.
   */
  regionRotation(): Rotation {
    const root = this.linkset?.prims[0]
    if (!root || root === this) return this.params.rotation
    return mulRotation(this.params.rotation, root.params.rotation)
  }

  /** llSetStatus seam. STATUS_* is a bit value; sets or clears it. */
  setStatus(flag: number, value: boolean): void {
    if (value) this.statusFlags |= flag
    else this.statusFlags &= ~flag
    if (this.volumeDetect) this.statusFlags |= STATUS_PHANTOM
  }
}
