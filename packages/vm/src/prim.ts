import type { VehicleSettings } from './builtins/vehicles.js'
import type { PhysicsState } from './builtins/physics.js'
import { TargetMotionStepper, type KeyframedMotion, type TargetMotionState } from './builtins/motion.js'
import type { CollisionFilter, CollisionSound } from './builtins/collision.js'
import type { Script } from './script.js'
import type { InventoryItem } from './inventory.js'
import { InventoryType, freeInventoryName, hearsInventoryChange, inventoryItemName, queueInventoryChanged } from './inventory.js'
import { defaultPrimParams, readPrimParam, writePrimParam, type PrimParams } from './prim-params.js'
import type { LslValue, Rotation, Vector } from './values/types.js'
import { mulRotation } from './values/ops.js'
import { NULL_KEY, ZERO_VECTOR } from './values/types.js'
import { deterministicKey } from './keys.js'
import {
  PERM_ALL, PRIM_PHYSICS_SHAPE_TYPE, PRIM_POSITION, PRIM_POS_LOCAL, PRIM_ROTATION, PRIM_ROT_LOCAL, PRIM_SIZE,
  PRIM_TEMP_ON_REZ, PRIM_TYPE, STATUS_PHANTOM, STATUS_PHYSICS,
} from './generated/constants.js'
import type { Linkset } from './linkset.js'

/** Rules whose change makes the region work out the object's server cost again. */
const COST_RULES = new Set([
  PRIM_SIZE, PRIM_TYPE, PRIM_PHYSICS_SHAPE_TYPE, PRIM_TEMP_ON_REZ,
  PRIM_POSITION, PRIM_POS_LOCAL, PRIM_ROTATION, PRIM_ROT_LOCAL,
])

let primsMade = 0
let itemsSaved = 0

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
  #key = ''
  get key(): string { return this.#key }
  set key(value: string) {
    const previous = this.#key
    this.#key = value
    // Rez replaces the temporary snapshot key after scripts have been copied.
    const state = (this.linkset?.prims[0] ?? this).targetMotion
    for (const kind of ['move', 'look'] as const) {
      const request = state[kind]
      if (request?.owner.prim === previous) request.owner.prim = value
    }
  }
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
  /** Physics calls are captured per caller; the root holds test-controlled reads. */
  readonly physics: PhysicsState = {
    requests: [], force: null, torque: { x: 0, y: 0, z: 0 }, velocity: null,
    acceleration: { x: 0, y: 0, z: 0 }, omega: { x: 0, y: 0, z: 0 },
    mass: 1.25, massMKS: 125, centerOfMass: null, energy: 1,
  }
  /** Requested settings survive as capture history, independently of script effects. */
  buoyancy = 0
  hover: { height: number; water: number; tau: number } | null = null
  groundRepel: { height: number; water: number; tau: number } | null = null
  readonly vehicle: VehicleSettings = { type: 0, flags: 0, params: {}, requests: [] }
  /** Keyframed playback is shared by every script in the object. */
  keyframedMotion: KeyframedMotion | null = null
  /** Plain target requests; clock callbacks are private and never enter inventory snapshots. */
  targetMotion: TargetMotionState = { move: null, look: null }
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
  /** Local camera settings for the next avatar to sit; preserved in inventory. */
  cameraEyeOffset: Vector = { ...ZERO_VECTOR }
  cameraAtOffset: Vector = { ...ZERO_VECTOR }
  forceMouselook = false
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

  /** The script an owner edit is adding or recompiling, while the other scripts handle the event. */
  #arriving: Script | undefined
  /** Set when this prim joins a linkset. */
  #linkset: Linkset | undefined
  #cancelTargetMotion: (() => void) | undefined
  get linkset(): Linkset | undefined { return this.#linkset }
  set linkset(value: Linkset | undefined) {
    this.#cancelTargetMotion?.()
    this.#linkset = value
    if (!value) return
    const motion = new TargetMotionStepper(this, value.clock.now)
    this.#cancelTargetMotion = value.clock.onAdvance(now => {
      if (value.dead) { this.#cancelTargetMotion?.(); return }
      if (value.prims[0] === this) motion.advance(now)
    })
  }
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
    // The region counts scripts for the server cost before the new one lands.
    this.linkset?.recountScripts()
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
   * Start a script built on this prim (`host: prim`) as the owner dropping it
   * in. The scripts already there get `changed(CHANGED_INVENTORY)` first, and
   * until they have handled it they cannot reach the new script. It then runs
   * `state_entry` unless `running` is false, with no event for its own arrival.
   */
  dropScript(script: Script, opts: { running?: boolean } = {}): void {
    const item = this.inventory.find((it) => it.script === script)
    if (!item) throw new Error('dropScript: the script was not built on this prim')
    if (script.hasStarted) throw new Error(`dropScript: '${item.name}' has already started`)
    if (script.linkset.dead) throw new Error('dropScript: the object no longer exists')
    if (this.inventory.some((it) => it !== item && it.name === item.name)) throw new Error(`dropScript: an item named '${item.name}' already exists`)
    script.running = opts.running ?? true
    this.#ownerEditedScript(script, () => {
      if (script.running) script.start()
      else script.queueStart()
    })
  }

  /** The name an arriving item called `name` gets: a taken name has a number appended. */
  freeInventoryName(name: string): string {
    return freeInventoryName(this.inventory, inventoryItemName(name))
  }

  /**
   * Add a non-script inventory item (notecard, texture, etc.) as the owner
   * does by dropping it on the prim. A name the prim already holds gets a
   * number appended. The prim's scripts get `changed(CHANGED_INVENTORY)`.
   * The caller is responsible for setting `acquireTimeMs`; if you want it to
   * default to the current linkset clock, build the item with
   * `makeInventoryItem` and pass `acquireTimeMs: this.linkset?.clock.now ?? 0`.
   */
  addInventory(item: InventoryItem): InventoryItem {
    const base = inventoryItemName(item.name)
    if (!base) throw new Error('addInventory: the item name has no ASCII characters')
    const added = this.placeInventory({ ...item, name: freeInventoryName(this.inventory, base) })
    this.#ownerEditedInventory()
    return added
  }

  /** Put an item in the inventory as it is, without telling the prim's scripts. The VM uses this to build and copy objects. */
  placeInventory(item: InventoryItem): InventoryItem {
    const placed = { ...item, name: inventoryItemName(item.name) }
    this.inventory.push(placed)
    return placed
  }

  /**
   * Delete items as the owner does in the object's contents. Deleted scripts
   * stop. The prim's remaining scripts get one `changed(CHANGED_INVENTORY)`
   * for the call, however many items it names.
   */
  removeInventory(...names: string[]): void {
    const indexes = [...new Set(names)].map((name) => this.#inventoryIndex('removeInventory', name))
    for (const item of indexes.map((index) => this.inventory[index]!)) {
      this.inventory.splice(this.inventory.indexOf(item), 1)
      if (!item.script) continue
      const running = this.scripts.indexOf(item.script)
      if (running >= 0) this.scripts.splice(running, 1)
      item.script.markDead()
    }
    if (names.length) this.#ownerEditedInventory()
  }

  /**
   * Save new content over an item, as the owner does when editing a notecard
   * in the object's contents. The item keeps its name and gets a new key
   * unless `changes.key` supplies one. The prim's scripts get
   * `changed(CHANGED_INVENTORY)`. Saving a script recompiles it: the others
   * hear first, then it resets with no event of its own. A stopped script
   * stays stopped.
   */
  replaceInventory(name: string, changes: Partial<Omit<InventoryItem, 'name' | 'type' | 'script'>>): void {
    const index = this.#inventoryIndex('replaceInventory', name)
    const old = this.inventory[index]!
    this.inventory[index] = {
      ...old, ...changes, name: old.name, type: old.type,
      key: changes.key ?? deterministicKey(`inventory-save/${++itemsSaved}`),
    }
    const script = old.script
    if (!script || script.dead || !this.#live(script)) return this.#ownerEditedInventory()
    this.#ownerEditedScript(script, () => {
      script.reset()
      if (!script.running) script.queueStart()
    })
  }

  /**
   * Rename an item as the owner does in the object's contents. The prim's
   * scripts get `changed(CHANGED_INVENTORY)`. A renamed script keeps running
   * and gets the event too.
   */
  renameInventory(from: string, to: string): void {
    const item = this.inventory[this.#inventoryIndex('renameInventory', from)]!
    const name = inventoryItemName(to)
    if (!name) throw new Error('renameInventory: the new name has no ASCII characters')
    if (name === item.name) throw new Error(`renameInventory: '${from}' already has that name`)
    if (this.inventory.some((it) => it.name === name)) throw new Error(`renameInventory: an item named '${name}' already exists`)
    item.name = name
    this.#ownerEditedInventory()
  }

  #inventoryIndex(method: string, name: string): number {
    const index = this.inventory.findIndex((it) => it.name === name)
    if (index < 0) throw new Error(`${method}: no item named '${name}'`)
    return index
  }

  /**
   * Tell the prim's scripts of an edit that added or recompiled `script`, then
   * `start` it. Until their handlers end or sleep, the script reads as not
   * running, `findScript` does not find it and a link message to it is lost.
   * A script they deleted, or whose object they deleted, is not started.
   */
  #ownerEditedScript(script: Script, start: () => void): void {
    const linkset = script.linkset
    const running = script.running
    script.running = false
    this.#arriving = script
    let idle: Script[] | undefined
    try {
      const hearing = this.#queueOwnerEdit()
      if (hearing.length) {
        idle = hearing.filter((other) => other.wakeAt === undefined)
        linkset.drainQueue()
      }
    } finally {
      this.#arriving = undefined
      script.running = running
    }
    if (!script.dead) start()
    if (idle) linkset.settle(idle)
  }

  /** A queued event can run a script's handler without starting it. */
  #live(script: Script): boolean {
    return script.hasStarted || script.clockView.completedHandlers > 0 || script.wakeAt !== undefined
  }

  #ownerEditedInventory(): void {
    const hearing = this.#queueOwnerEdit()
    if (hearing.length) this.linkset!.settle(hearing.filter((script) => script.wakeAt === undefined))
  }

  /**
   * Queue `changed(CHANGED_INVENTORY)` for an owner edit and return the
   * scripts that get it. A stopped script, or one that has not
   * started yet, never hears of the edit. A script busy in a handler gets the
   * event when it finishes. When no script in a child prim handles `changed`,
   * the root's scripts get the event.
   */
  #queueOwnerEdit(): Script[] {
    const linkset = this.linkset
    if (!linkset) return []
    const hearing = (prim: Prim) => prim.scripts.filter(hearsInventoryChange)
    let scripts = hearing(this)
    if (!scripts.some((script) => script.handles('changed'))) scripts = hearing(linkset.prims[0]!)
    for (const script of scripts) queueInventoryChanged(script)
    return scripts
  }

  /** Find a script by inventory name. A script the owner is adding or recompiling is not found until the others have heard of it. */
  findScript(name: string): Script | undefined {
    for (const it of this.inventory) {
      if (it.type === InventoryType.SCRIPT && it.name === name) return it.script === this.#arriving ? undefined : it.script
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
  ) {
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
    const before = COST_RULES.has(param) ? this.costShape() : undefined
    const consumed = writePrimParam(this, param, rules, cursor, caller)
    if (before !== undefined && before !== this.costShape()) this.linkset?.recountScripts()
    return consumed
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

  /** The values whose change makes the region work out the object's server cost again. */
  private costShape(): string {
    const { size, shape, physicsShapeType, tempOnRez, position, rotation } = this.params
    // Where a child is in the object counts; where the object is does not.
    const placed = this.linkset && this !== this.linkset.prims[0] ? [position, rotation] : []
    return JSON.stringify([size, shape, physicsShapeType, tempOnRez, placed])
  }

  /** llSetStatus seam. STATUS_* is a bit value; sets or clears it. */
  setStatus(flag: number, value: boolean): void {
    const physical = this.statusFlags & STATUS_PHYSICS
    if (value) this.statusFlags |= flag
    else this.statusFlags &= ~flag
    if (this.volumeDetect) this.statusFlags |= STATUS_PHANTOM
    if ((this.statusFlags & STATUS_PHYSICS) !== physical) this.linkset?.recountScripts()
  }
}
