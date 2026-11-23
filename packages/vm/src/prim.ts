import type { VehicleSettings } from './builtins/vehicles.js'
import type { PhysicsState } from './builtins/physics.js'
import { TargetMotionStepper, type KeyframedMotion, type TargetMotionState } from './builtins/motion.js'
import type { CollisionFilter, CollisionSound } from './builtins/collision.js'
import { rememberNotecardAsset } from './builtins/notecard-search.js'
import type { Script } from './script.js'
import type { InventoryItem, PermMask } from './inventory.js'
import { InventoryType, freeInventoryName, hearsInventoryChange, inventoryItemName, queueInventoryChanged, renamedInventoryName, renamedItemName } from './inventory.js'
import { defaultPrimParams, readPrimParam, writePrimParam, type PrimParams } from './prim-params.js'
import type { LslValue, Rotation, Vector } from './values/types.js'
import { mulRotation } from './values/ops.js'
import { NULL_KEY, ZERO_VECTOR } from './values/types.js'
import { deterministicKey } from './keys.js'
import {
  PERM_ALL, PERM_MOVE, PERM_TRANSFER, PRIM_PHYSICS_SHAPE_TYPE, PRIM_POSITION, PRIM_POS_LOCAL, PRIM_ROTATION, PRIM_ROT_LOCAL, PRIM_SIZE,
  PRIM_TEMP_ON_REZ, PRIM_TYPE, STATUS_CAST_SHADOWS, STATUS_DIE_ON_NO_REZZER, STATUS_PHANTOM, STATUS_PHYSICS, STATUS_ROTATE_X, STATUS_ROTATE_Y, STATUS_ROTATE_Z,
} from './generated/constants.js'
import type { Linkset } from './linkset.js'

/** Rules whose change makes the region work out the object's server cost again. */
const COST_RULES = new Set([
  PRIM_SIZE, PRIM_TYPE, PRIM_PHYSICS_SHAPE_TYPE, PRIM_TEMP_ON_REZ,
  PRIM_POSITION, PRIM_POS_LOCAL, PRIM_ROTATION, PRIM_ROT_LOCAL,
])

let primsMade = 0
let itemsSaved = 0

/** The key each notecard text has had in a linkset, so saving a text again gives it the same key. */
const notecardKeys = new WeakMap<object, Map<string, string>>()
const notecardText = (lines: ReadonlyArray<string> | undefined) => JSON.stringify(lines ?? [])

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
  /** The object's STATUS_* bits when this prim is its root. */
  private objectStatus = STATUS_ROTATE_X | STATUS_ROTATE_Y | STATUS_ROTATE_Z
  /**
   * llSetStatus / PRIM_PHYSICS / PRIM_PHANTOM bitfield. The flags belong to
   * the object: every prim reads and sets its root's.
   */
  get statusFlags(): number { return (this.linkset?.prims[0] ?? this).objectStatus }
  set statusFlags(value: number) { (this.linkset?.prims[0] ?? this).objectStatus = value }
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
  /** The object's llVolumeDetect setting when this prim is its root. */
  private objectVolumeDetect = false
  /** llVolumeDetect belongs to the object: every prim reads and sets its root's. */
  get volumeDetect(): boolean { return (this.linkset?.prims[0] ?? this).objectVolumeDetect }
  set volumeDetect(value: boolean) { (this.linkset?.prims[0] ?? this).objectVolumeDetect = value }
  /** Set by llAllowInventoryDrop from a script in this prim; each prim has its own. */
  allowInventoryDrop = false
  /** The prim's own masks; the root's are the object's. */
  permMask: PermMask = { base: PERM_ALL, owner: PERM_ALL, group: 0, everyone: 0, next: PERM_MOVE | PERM_TRANSFER }
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
  /**
   * Camera rules this prim's scripts set with llSetCameraParams, by the avatar (lower case) they
   * were set for. Any script in the prim shares them. A copy of the object starts without them.
   */
  readonly scriptedCameras = new Map<string, Map<number, LslValue>>()
  /** Local camera settings for the next avatar to sit; preserved in inventory. */
  cameraEyeOffset: Vector = { ...ZERO_VECTOR }
  cameraAtOffset: Vector = { ...ZERO_VECTOR }
  forceMouselook = false
  /** The price and four quick pay buttons the Pay dialog gets, or null if llSetPayPrice never ran. */
  payPrice: { price: number; buttons: number[] } | null = null
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
    let removedScript = false
    for (const item of indexes.map((index) => this.inventory[index]!)) {
      this.inventory.splice(this.inventory.indexOf(item), 1)
      if (this.linkset) rememberNotecardAsset(this.linkset.peers, item)
      if (!item.script) continue
      const running = this.scripts.indexOf(item.script)
      if (running >= 0) this.scripts.splice(running, 1)
      item.script.markDead()
      removedScript = true
    }
    if (removedScript) this.linkset?.recountScripts()
    if (names.length) this.#ownerEditedInventory()
  }

  /**
   * Save new content over an item, as the owner does when editing a notecard
   * in the object's contents. The item keeps its name. A notecard gets the key
   * of its new text, and saving the same text keeps its key; any other item gets a new key.
   * The old notecard text still reads by its old key.
   * `changes.key` overrides either. The prim's scripts get
   * `changed(CHANGED_INVENTORY)`, also for a save that changes nothing. Saving
   * a script recompiles it: the others hear first, then it resets with no
   * event of its own. A stopped script stays stopped.
   */
  replaceInventory(name: string, changes: Partial<Omit<InventoryItem, 'name' | 'type' | 'script'>>): void {
    const index = this.#inventoryIndex('replaceInventory', name)
    const old = this.inventory[index]!
    if (this.linkset) rememberNotecardAsset(this.linkset.peers, old)
    const saved = this.inventory[index] = {
      ...old, ...changes, name: old.name, type: old.type,
      key: changes.key ?? this.#savedKey(old, changes.notecardLines),
    }
    if (saved.type === InventoryType.NOTECARD && saved.key !== NULL_KEY) this.#notecardKeys().set(notecardText(saved.notecardLines), saved.key)
    const script = old.script
    if (!script || script.dead || !this.#live(script)) return this.#ownerEditedInventory()
    this.#ownerEditedScript(script, () => script.reset())
  }

  /**
   * Rename an item as the owner does in the object's contents. Each control
   * character, each byte of a non-ASCII character and each `|` becomes a
   * space; the name is cut to 63 characters and trimmed, and if nothing is
   * left the item keeps its old name. An empty `to` throws. A name another
   * item holds takes the number an arriving item would get plus one, then the
   * next free one; an item already numbered for that name keeps it. The
   * prim's scripts get `changed(CHANGED_INVENTORY)`, also when the name is
   * unchanged. A renamed script keeps running and its state, and hears the
   * rename under its new name; a stopped one stays stopped.
   */
  renameInventory(from: string, to: string): void {
    const item = this.inventory[this.#inventoryIndex('renameInventory', from)]!
    if (!to) throw new Error('renameInventory: the new name is empty')
    const name = renamedItemName(to)
    if (name) item.name = renamedInventoryName(this.inventory, item, name)
    this.#ownerEditedInventory()
  }

  /** A save gives a notecard the key its text has had in the linkset; other items get a new key at each save. */
  #savedKey(old: InventoryItem, lines: ReadonlyArray<string> | undefined): string {
    if (old.type !== InventoryType.NOTECARD) return deterministicKey(`inventory-save/${++itemsSaved}`)
    const text = notecardText(lines ?? old.notecardLines)
    if (old.key !== NULL_KEY && text === notecardText(old.notecardLines)) return old.key
    return this.#notecardKeys().get(text) ?? deterministicKey(`notecard/${text}`)
  }

  /** The key each notecard text has had in the linkset, adding the notecards it holds now. */
  #notecardKeys(): Map<string, string> {
    const owner = this.linkset ?? this
    const known = notecardKeys.get(owner) ?? new Map<string, string>()
    notecardKeys.set(owner, known)
    for (const prim of this.linkset?.prims ?? [this]) {
      for (const item of prim.inventory) {
        const text = notecardText(item.notecardLines)
        if (item.type === InventoryType.NOTECARD && item.key !== NULL_KEY && !known.has(text)) known.set(text, item.key)
      }
    }
    return known
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

  /** llSetStatus seam. STATUS_* is a bit value; sets or clears it for the whole object. */
  setStatus(flag: number, value: boolean): void {
    const physical = this.statusFlags & STATUS_PHYSICS
    // In-world, STATUS_CAST_SHADOWS read FALSE after TRUE was set from the root or a child,
    // and so did STATUS_DIE_ON_NO_REZZER on a server that predates it.
    if (value) this.statusFlags |= flag & ~(STATUS_CAST_SHADOWS | STATUS_DIE_ON_NO_REZZER)
    else this.statusFlags &= ~flag
    if (this.volumeDetect) this.statusFlags |= STATUS_PHANTOM
    if ((this.statusFlags & STATUS_PHYSICS) !== physical) this.linkset?.recountScripts()
  }
}
