import { attemptAvatarMovement, type AvatarMovement, type AvatarMovementAction, type AvatarMovementState } from './rlv/movement.js'
import { attemptAvatarEdit, attemptAvatarRez, type AvatarEditAction, type AvatarRezAction } from './rlv/edit.js'
import { requestTeleport, respondTeleportRequest, type AvatarTeleportRequest, offerTeleport, respondTeleportOffer, type TeleportOffer, type TeleportOfferDecision } from './rlv/tpoffers.js'
import { attemptUserTeleport, type UserTeleportAction } from './rlv/teleport.js'
import { attemptAvatarTouch, type AvatarTouchAction, type AvatarTouchOptions } from './rlv/touch.js'
import { playAvatarGesture, type AvatarGesture, type AvatarGestureAction } from './rlv/gesture.js'
import { attemptAvatarIM, type AvatarIMAction } from './rlv/im-actions.js'
import { deliverAvatarReceivedIM } from './rlv/received.js'
import { returnStandtpAvatar, userSitAvatar, userStandAvatar } from './rlv/sit.js'
import { sendAvatarChat, type AvatarChatAction, type AvatarChatVolume } from './rlv/chat-actions.js'
import { canRlvEnterMouselook } from './rlv/camera.js'
import { createViewerState, type ViewerConfig, type ViewerState } from './rlv/profiles.js'
import { conjugate, mulRotation, rotateVector } from './values/ops.js'
import { deterministicKey } from './keys.js'
import { ZERO_VECTOR, ZERO_ROTATION, NULL_KEY } from './values/types.js'
import { LinksetClock } from './clock.js'
import type { Linkset } from './linkset.js'
import type { Prim } from './prim.js'
import { AGENT_MOUSELOOK, AGENT_SITTING, AGENT_ON_OBJECT, AGENT_FLYING, AGENT_IN_AIR, AGENT_WALKING, CHANGED_LINK, CHANGED_REGION, CHANGED_TELEPORT } from './generated/constants.js'
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
  /** Box dimensions for ray queries. Default <0.5, 0.5, 0.5>. */
  readonly size?: Vector
  readonly phantom?: boolean
  readonly physical?: boolean
  readonly scripted?: boolean
  /** Whether its script is currently using simulator resources. */
  readonly active?: boolean
}

export interface WorldAvatarOptions extends WorldObjectOptions {
  /** Optional viewer emulation. Omission disables it. */
  readonly viewer?: ViewerConfig
  readonly username: string
  /** Defaults to the legacy name, or username when no name is supplied. */
  readonly displayName?: string
  /** Collision size read by llGetAgentSize. Default <0.45, 0.6, 1.9>. */
  readonly size?: Vector
  /** AGENT_* mask. Seating updates sitting/moving bits; other bits are explicit fixture state. */
  readonly info?: number
  /** Shared viewer language; empty means not shared. Default empty. */
  readonly language?: string
  /** Supported llGetVisualParams IDs, with values in [0, 1]. Unset IDs read 0. */
  readonly visualParams?: Readonly<Record<number, number>>
  /** UUIDs of friends, including those outside this avatar's region. */
  readonly friends?: readonly string[]
  /** Virtual destination for llTeleportAgentHome; never inferred from a real account. */
  readonly home?: AvatarDestination
}

export interface AvatarDestination {
  readonly region: string
  readonly position: Vector
}

/** Mutable avatar fixture. Region and position can change between script events. */
export interface WorldAvatar extends WorldEntity {
  readonly viewer: ViewerState
  username: string
  displayName: string
  size: Vector
  info: number
  /** Lazily initialized viewer movement modes and hover configuration. */
  movement?: AvatarMovementState
  language: string
  visualParams: Record<number, number>
  friends: Set<string>
  sittingOn: Prim | null
  /** Prim-local offsets captured on sitting; later prim edits affect the next sit. */
  readonly sittingCamera: { readonly eye: Vector; readonly at: Vector } | null
  /** A rotation requested while seated, applied when the avatar stands. */
  standingRotation: Rotation | null
  home: AvatarDestination | null
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
  size?: Vector
  phantom?: boolean
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
  /** Estate owner/managers allowed to submit estate requests in this fixture. */
  readonly estateManagers?: readonly string[]
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
  /** Terrain index for RC_GET_LINK_NUM. Default 0; supply measured simulator indices explicitly. */
  readonly groundLinkNumber?: number | ((x: number, y: number) => number)
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

/** A request made by a script over this parcel, including refused requests. */
export interface ParcelEffect {
  readonly function: string
  readonly args: readonly LslValue[]
  readonly source: string
  readonly owner: string
  readonly time: number
  /** Permission/argument checks passed; this is not confirmation of an external transaction. */
  readonly accepted: boolean
  readonly result?: LslValue
}

export interface ParcelMedia {
  texture: string
  url: string
  type: string
  width: number
  height: number
  description: string
  loop: number
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
  readonly media?: Partial<ParcelMedia>
  /** Explicit fixture for land held in escrow. */
  readonly inEscrow?: boolean
  /** Region-local arrival point; the zero vector clears it. */
  readonly landingPoint?: Vector
  /** Facing direction for arrivals routed to landingPoint. */
  readonly landingLookAt?: Vector
  /** 0 blocks, 1 uses the landing point if set, 2 allows anywhere. Default 1. */
  readonly tpRouting?: number
}

export interface Parcel extends WorldParcelOptions {
  musicURL?: string
  readonly effects: ParcelEffect[]
  readonly media: ParcelMedia
  sale?: { price: number; agent: string; objects: boolean }
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
  readonly avatars: WorldAvatar[] = []
  /** Landmark asset UUID to destination. Inventory landmark items resolve through this map. */
  readonly landmarks = new Map<string, AvatarDestination>()
  readonly parcels: Parcel[] = []
  /** Optional sensor metadata for linksets loaded with loadLinkset. */
  readonly sensorProperties = new Map<Linkset, SensorObjectProperties>()
  private readonly regions = new Map<string, Region>()

  constructor(opts: WorldOptions = {}) {
    this.clock = new LinksetClock(opts.startUnixTime)
  }

  /** Play a prepared gesture, recording its outcome and any emitted chat. */
  playAvatarGesture(avatar: WorldAvatar, gesture: AvatarGesture): AvatarGestureAction {
    return playAvatarGesture(this, avatar, gesture)
  }

  /** Simulate avatar local chat; restrictions apply only through this action. */
  sendAvatarChat(avatar: WorldAvatar, channel: number, message: string, volume: AvatarChatVolume = 'say'): AvatarChatAction {
    return sendAvatarChat(this, avatar, channel, message, volume)
  }

  /** Deliver an online avatar IM; sender-side restrictions and automatic replies are separate. */
  sendAvatarIM(sender: WorldAvatar, recipient: string, message: string): void {
    deliverAvatarReceivedIM(this, sender, recipient, message)
  }

  /** Attempt an online avatar IM with sender restrictions and a frozen outcome. */
  attemptAvatarIM(sender: WorldAvatar, recipient: string, message: string): AvatarIMAction {
    return attemptAvatarIM(this, sender, recipient, message)
  }

  /** Attempt a viewer-controlled touch of a specific prim. */
  attemptAvatarTouch(avatar: WorldAvatar, prim: Prim, options: AvatarTouchOptions = {}): AvatarTouchAction {
    return attemptAvatarTouch(this, avatar, prim, options)
  }

  /** Open the editor for an existing object through viewer edit permissions. */
  attemptAvatarEdit(avatar: WorldAvatar, prim: Prim): AvatarEditAction {
    return attemptAvatarEdit(this, avatar, prim)
  }

  /** Drop a saved inventory object into the current region. */
  attemptAvatarRez(avatar: WorldAvatar, itemId: string, position: Vector): AvatarRezAction {
    return attemptAvatarRez(this, avatar, itemId, position)
  }

  addObject(opts: WorldObjectOptions): WorldEntity {
    const object = this.entity(opts)
    this.objects.push(object)
    return object
  }

  addAvatar(opts: WorldAvatarOptions): WorldAvatar {
    const world = this
    const entity = this.entity(opts)
    let position = entity.position
    let rotation = entity.rotation
    let region = entity.region
    let info = opts.info ?? 0
    let seat: Prim | null = null
    let seatOffset = ZERO_VECTOR
    let seatOrientation = ZERO_ROTATION
    let sittingCamera: WorldAvatar['sittingCamera'] = null
    const snapshotSeat = (): void => {
      if (!seat) return
      position = this.seatPosition(seat, seatOffset)
      rotation = this.seatRotation(seat, seatOrientation)
      region = seat.linkset?.region ?? region
    }
    const clearRemovedSeat = (): void => {
      if (!seat?.linkset?.dead) return
      snapshotSeat()
      seat = null
      sittingCamera = null
      info &= ~(AGENT_SITTING | AGENT_ON_OBJECT)
      if (avatar.standingRotation) rotation = avatar.standingRotation
      avatar.standingRotation = null
      returnStandtpAvatar(world, avatar)
    }
    const avatar: WorldAvatar = {
      ...entity,
      viewer: createViewerState(opts.viewer),
      username: opts.username.toLowerCase(),
      displayName: opts.displayName ?? opts.name ?? opts.username,
      size: { ...(opts.size ?? { x: 0.45, y: 0.6, z: 1.9 }) },
      get info() { clearRemovedSeat(); return info },
      set info(value) { info = value & AGENT_MOUSELOOK && !canRlvEnterMouselook(avatar) ? value & ~AGENT_MOUSELOOK : value },
      get position() { clearRemovedSeat(); return seat ? world.seatPosition(seat, seatOffset) : position },
      set position(value) { position = value },
      get rotation() { clearRemovedSeat(); return seat ? world.seatRotation(seat, seatOrientation) : rotation },
      set rotation(value) { rotation = value },
      get region() { clearRemovedSeat(); return seat?.linkset?.region ?? region },
      set region(value) { region = value },
      language: opts.language ?? '',
      visualParams: { ...opts.visualParams },
      friends: new Set(opts.friends?.map(key => key.toLowerCase())),
      get sittingCamera() { clearRemovedSeat(); return sittingCamera },
      get sittingOn() { clearRemovedSeat(); return seat },
      set sittingOn(value) {
        const changingSeat = value !== seat && !!(info & AGENT_SITTING)
        snapshotSeat()
        seat = value
        sittingCamera = seat ? { eye: { ...seat.cameraEyeOffset }, at: { ...seat.cameraAtOffset } } : null
        if (seat?.forceMouselook && canRlvEnterMouselook(avatar)) info |= AGENT_MOUSELOOK
        const target = seat?.params.sitTarget
        seatOffset = { ...(target?.enabled ? target.offset : ZERO_VECTOR) }
        seatOrientation = { ...(target?.enabled ? target.rotation : ZERO_ROTATION) }
        if (value && changingSeat && avatar.viewer.profile === 'rlv') returnStandtpAvatar(world, avatar)
      },
      standingRotation: null,
      home: opts.home ? { region: opts.home.region, position: { ...opts.home.position } } : null,
    }
    avatar.owner = avatar.key
    this.avatars.push(avatar)
    return avatar
  }

  private seatPosition(prim: Prim, local: Vector): Vector {
    const origin = prim.regionPosition()
    const offset = rotateVector(local, prim.regionRotation())
    // Target coordinates only; avatar skeleton and collision offsets are not simulated.
    return { x: origin.x + offset.x, y: origin.y + offset.y, z: origin.z + offset.z }
  }

  private seatRotation(prim: Prim, local: Rotation): Rotation {
    return mulRotation(local, prim.regionRotation())
  }

  /** Attempt an explicit user sit with viewer restrictions and no issuer exemption. */
  userSitAvatar(avatar: WorldAvatar, prim: Prim, offset: Vector = ZERO_VECTOR): boolean {
    return userSitAvatar(this, avatar, prim, offset)
  }

  /** Attempt a viewer movement input and record the deciding restrictions. */
  attemptAvatarMovement(avatar: WorldAvatar, action: AvatarMovement): AvatarMovementAction {
    return attemptAvatarMovement(this, avatar, action)
  }

  /** Attempt an explicit user stand. Simulator seating uses standAvatar directly. */
  userStandAvatar(avatar: WorldAvatar): boolean {
    return userStandAvatar(this, avatar)
  }

  /** Seed simulator seating on a free prim, independently of viewer restrictions. */
  sitAvatar(avatar: WorldAvatar, prim: Prim): boolean {
    const linkset = prim.linkset
    if (!this.avatars.includes(avatar) || linkset?.world !== this || linkset.dead || linkset.attachment || avatar.region !== linkset.region ||
      this.avatars.some(a => a !== avatar && a.sittingOn === prim)) return false
    if (avatar.sittingOn === prim) return true
    const previous = avatar.sittingOn?.linkset
    avatar.sittingOn = prim
    avatar.standingRotation = null
    avatar.info = (avatar.info & ~(AGENT_FLYING | AGENT_IN_AIR | AGENT_WALKING)) | AGENT_SITTING | AGENT_ON_OBJECT
    if (previous && previous !== linkset) this.sitChanged(previous)
    this.sitChanged(linkset)
    return true
  }

  /** Stand a fixture avatar. Only an object sitter produces CHANGED_LINK. */
  standAvatar(avatar: WorldAvatar): void {
    const sitting = !!(avatar.info & AGENT_SITTING)
    const previous = avatar.sittingOn?.linkset
    avatar.sittingOn = null
    avatar.info &= ~(AGENT_SITTING | AGENT_ON_OBJECT)
    if (avatar.standingRotation) avatar.rotation = avatar.standingRotation
    avatar.standingRotation = null
    if (previous) this.sitChanged(previous)
    if (sitting) returnStandtpAvatar(this, avatar)
  }

  /** Ground sitting has AGENT_SITTING but no object parent or new link. */
  sitAvatarOnGround(avatar: WorldAvatar): void {
    this.standAvatar(avatar)
    avatar.info = (avatar.info & ~(AGENT_ON_OBJECT | AGENT_FLYING | AGENT_IN_AIR | AGENT_WALKING)) | AGENT_SITTING
  }

  private sitChanged(linkset: Linkset): void {
    // Match the linkset's linking/unlinking event policy.
    const pending = this.clock.pendingEvents().filter(e => e.event === 'changed' && e.payload['changes'] === CHANGED_LINK)
    for (const script of linkset.allScripts()) {
      if (!script.running) continue
      const waiting = pending.filter(e => e.target === script)
      if (waiting.length >= 2 || waiting.some(e => e.at >= script.resumedAt)) continue
      this.clock.schedule(script, this.clock.now, 'changed', { changes: CHANGED_LINK })
    }
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
      size: { ...(opts.size ?? { x: 0.5, y: 0.5, z: 0.5 }) }, phantom: opts.phantom ?? false,
    }
  }

  addRegion(name: string, corner: RegionCorner, settings: RegionSettings = {}): void {
    this.regions.set(name, { ...settings, name, corner })
  }

  addParcel(opts: WorldParcelOptions): Parcel {
    this.region(opts.region)
    const parcel: Parcel = {
      ...opts,
      effects: [],
      media: { texture: NULL_KEY, url: '', type: '', width: 0, height: 0, description: '', loop: 0, ...opts.media },
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

  /** Case-insensitive viewer region lookup; unknown names remain unresolved. */
  regionNamed(name: string): Region | undefined {
    return [...this.regions.values()].find(region => region.name.toLowerCase() === name.toLowerCase())
  }

  /** Request an offer to teleport to another avatar. */
  requestTeleport(requester: WorldAvatar, recipient: WorldAvatar): AvatarTeleportRequest {
    return requestTeleport(this, requester, recipient)
  }

  /** Accept a pending request by sending an offer, or decline it. */
  respondTeleportRequest(avatar: WorldAvatar, request: AvatarTeleportRequest, decision: TeleportOfferDecision): AvatarTeleportRequest {
    return respondTeleportRequest(this, avatar, request, decision)
  }

  /** Deliver a teleport offer with an explicit resolved global destination. */
  offerTeleport(sender: WorldAvatar, recipient: WorldAvatar, destination: Vector): TeleportOffer {
    return offerTeleport(this, sender, recipient, destination)
  }

  /** Accept or decline a pending offer for its original recipient. */
  respondTeleportOffer(avatar: WorldAvatar, offer: TeleportOffer, decision: TeleportOfferDecision): TeleportOffer {
    return respondTeleportOffer(this, avatar, offer, decision)
  }

  /** Attempt travel to a landmark's resolved global coordinates. */
  userTeleportAvatarViaLandmark(avatar: WorldAvatar, globalPosition: Vector): UserTeleportAction {
    return attemptUserTeleport(this, avatar, 'landmark', globalPosition)
  }

  /** Attempt travel to global coordinates selected on the map. */
  userTeleportAvatarViaMap(avatar: WorldAvatar, globalPosition: Vector): UserTeleportAction {
    return attemptUserTeleport(this, avatar, 'map', globalPosition)
  }

  /** Move an avatar through explicitly registered regions; its attachments get teleport and region changes. */
  teleportAvatar(avatar: WorldAvatar, globalPosition: Vector, lookAt?: Vector, applyLanding = false): boolean {
    if (!this.avatars.includes(avatar) || !Object.values(globalPosition).every(Number.isFinite) ||
      lookAt && !Object.values(lookAt).every(Number.isFinite)) return false
    const region = this.regionAt(globalPosition.x, globalPosition.y)
    if (!region) return false
    let position = { x: globalPosition.x - region.corner.x, y: globalPosition.y - region.corner.y, z: globalPosition.z }
    if (applyLanding) {
      const landing = this.teleportLanding(avatar, region, position)
      if (!landing) return false
      position = landing.position
      lookAt = landing.lookAt ?? lookAt
    }
    this.standAvatar(avatar)
    const changes = CHANGED_TELEPORT | (avatar.region === region.name ? 0 : CHANGED_REGION)
    avatar.region = region.name
    avatar.position = position
    if (lookAt && (lookAt.x || lookAt.y)) {
      const half = Math.atan2(lookAt.y, lookAt.x) / 2
      avatar.rotation = { x: 0, y: 0, z: Math.sin(half), s: Math.cos(half) }
    }
    for (const linkset of this.linksets) {
      if (linkset.dead || linkset.attachment?.avatar.toLowerCase() !== avatar.key.toLowerCase()) continue
      for (const script of linkset.allScripts()) {
        if (script.running) this.clock.schedule(script, this.clock.now, 'changed', { changes })
      }
    }
    return true
  }

  /** Resolve forced location travel before changing seating or attachment state. */
  private teleportLanding(avatar: WorldAvatar, region: Region, requested: Vector): { position: Vector; lookAt?: Vector } | undefined {
    let position = { ...requested }
    const estate = region.estateManagers?.some(key => key.toLowerCase() === avatar.key.toLowerCase())
    const exempt = (parcel: Parcel | undefined) => estate || parcel?.owner.toLowerCase() === avatar.key.toLowerCase()
    const blocked = (parcel: Parcel | undefined) => parcel?.tpRouting === 0 && !exempt(parcel)
    let parcel = this.parcelAt(region.name, position)
    if (blocked(parcel)) {
      // Partition overlapping rectangular parcels into cells with a single effective policy.
      const parcels = this.parcels.filter(p => p.region === region.name)
      const boundaries = (axis: 'x' | 'y') => [...new Set([0, 256, ...parcels.flatMap(p =>
        [p.bounds.min[axis], p.bounds.max[axis]].map(n => Math.max(0, Math.min(256, n))))])].sort((a, b) => a - b)
      const xs = boundaries('x'), ys = boundaries('y')
      let nearest: Vector | undefined
      let distance = Infinity
      for (let i = 1; i < xs.length; ++i) for (let j = 1; j < ys.length; ++j) {
        // Upper edges are excluded by parcelAt, so land just inside them.
        const x = Math.max(xs[i - 1]!, Math.min(xs[i]! - 0.000001, requested.x))
        const y = Math.max(ys[j - 1]!, Math.min(ys[j]! - 0.000001, requested.y))
        const candidate = { x, y, z: requested.z }
        if (blocked(this.parcelAt(region.name, candidate))) continue
        const squared = (x - requested.x) ** 2 + (y - requested.y) ** 2
        if (squared < distance) { nearest = candidate; distance = squared }
      }
      if (!nearest) return undefined
      position = nearest
      parcel = this.parcelAt(region.name, position)
    }
    let lookAt: Vector | undefined
    const point = parcel?.landingPoint
    if (parcel && !exempt(parcel) && (parcel.tpRouting ?? 1) === 1 && point && (point.x || point.y || point.z)) {
      position = { ...point }
      lookAt = parcel.landingLookAt
    }
    const ground = region.ground ?? 22
    const height = typeof ground === 'number' ? () => ground : ground
    const x = Math.floor(position.x), y = Math.floor(position.y)
    const u = position.x - x, v = position.y - y
    const south = height(x, y) * (1 - u) + height(x + 1, y) * u
    const north = height(x, y + 1) * (1 - u) + height(x + 1, y + 1) * u
    // The settled location fixture keeps the avatar centre 0.975 m above terrain.
    position.z = Math.max(position.z, south * (1 - v) + north * v + 0.975)
    return { position, ...(lookAt ? { lookAt } : {}) }
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

  /** Entry intersections with the region's placed boxes and avatars, nearest first. */
  castRay(region: string, start: Vector, end: Vector, options: RayOptions): RayHit[] {
    const hits = castRayBoxes(this.linksets.filter(l => l.region === region),
      [...this.objects, ...this.avatars].filter(e => e.region === region), start, end, options)
    if (!(options.rejectTypes & 8)) hits.push(...castRayTerrain(this.region(region), start, end))
    return hits.sort((a, b) => a.fraction - b.fraction)
  }

  allScripts(): Script[] {
    return this.linksets.flatMap((l) => l.allScripts())
  }
}

export interface RayOptions {
  readonly rejectTypes: number
  readonly detectPhantom: boolean
}

export interface RayHit {
  readonly key: string
  readonly rootKey: string
  readonly linkNumber: number
  readonly position: Vector
  readonly normal: Vector
  readonly fraction: number
}

/** Intersect an oriented box, excluding rays whose start is strictly inside. */
function boxEntry(start: Vector, end: Vector, position: Vector, rotation: Rotation, size: Vector): Omit<RayHit, 'key' | 'rootKey' | 'linkNumber'> | undefined {
  const inverse = conjugate(rotation)
  const local = rotateVector({ x: start.x - position.x, y: start.y - position.y, z: start.z - position.z }, inverse)
  const delta = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z }
  const direction = rotateVector(delta, inverse)
  if (Math.abs(local.x) < size.x / 2 && Math.abs(local.y) < size.y / 2 && Math.abs(local.z) < size.z / 2) return
  let entry = -Infinity
  let exit = 1
  let normal: Vector = { x: 0, y: 0, z: 0 }
  for (const axis of ['x', 'y', 'z'] as const) {
    const half = size[axis] / 2
    if (direction[axis] === 0) {
      if (Math.abs(local[axis]) > half) return
      continue
    }
    const a = (-half - local[axis]) / direction[axis]
    const b = (half - local[axis]) / direction[axis]
    const near = Math.min(a, b)
    if (near > entry) {
      entry = near
      normal = { x: 0, y: 0, z: 0, [axis]: direction[axis] > 0 ? -1 : 1 }
    }
    exit = Math.min(exit, Math.max(a, b))
    if (entry > exit) return
  }
  if (entry < 0 || entry >= 1) return
  const rotated = rotateVector(normal, rotation)
  return { fraction: entry,
    position: { x: start.x + delta.x * entry, y: start.y + delta.y * entry, z: start.z + delta.z * entry },
    normal: { x: rotated.x + 0, y: rotated.y + 0, z: rotated.z + 0 },
  }
}

/** Shared by World ray queries and a standalone linkset's own-prim query. */
export function castRayBoxes(linksets: readonly Linkset[], entities: readonly WorldEntity[], start: Vector, end: Vector, options: RayOptions): RayHit[] {
  const hits: RayHit[] = []
  const add = (key: string, rootKey: string, linkNumber: number, position: Vector, rotation: Rotation, size: Vector, physical: boolean, phantom: boolean, avatar: boolean) => {
    if (avatar ? (options.rejectTypes & 1) : phantom ? !options.detectPhantom : (options.rejectTypes & (physical ? 2 : 4))) return
    const hit = boxEntry(start, end, position, rotation, size)
    if (hit) hits.push({ ...hit, key, rootKey, linkNumber })
  }
  for (const linkset of linksets) {
    if (linkset.dead) continue
    const root = linkset.prims[0]!
    for (const prim of linkset.prims) {
      if (prim.params.physicsShapeType === 1) continue
      add(prim.key, root.key, prim === root ? 0 : prim.linkNumber, prim.regionPosition(), prim.regionRotation(), prim.params.size,
        (root.statusFlags & 1) !== 0, (root.statusFlags & 16) !== 0 || root.volumeDetect, false)
    }
  }
  for (const entity of entities) {
    add(entity.key, entity.key, 0, entity.position, entity.rotation, entity.size ?? { x: 0.5, y: 0.5, z: 0.5 },
      entity.physical, entity.phantom ?? false, entity.username !== undefined)
  }
  return hits.sort((a, b) => a.fraction - b.fraction)
}

/** Intersect the same bilinear height grid used by llGround, from either side. */
export function castRayTerrain(settings: RegionSettings, start: Vector, end: Vector): RayHit[] {
  const ground = settings.ground ?? 22
  const height = typeof ground === 'number' ? () => ground : ground
  const delta = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z }
  const point = (t: number): Vector => ({ x: start.x + delta.x * t, y: start.y + delta.y * t, z: start.z + delta.z * t })
  // In each grid cell the height along the ray is quadratic. Split only at cell boundaries.
  const boundaries = new Set([0, 1])
  for (const axis of ['x', 'y'] as const) {
    if (!delta[axis]) continue
    for (let cell = 0; cell <= 256; ++cell) {
      const t = (cell - start[axis]) / delta[axis]
      if (t > 0 && t < 1) boundaries.add(t)
    }
  }
  const times = [...boundaries].sort((a, b) => a - b)
  const hits: RayHit[] = []
  for (let i = 1; i < times.length; ++i) {
    const lo = times[i - 1]!
    const hi = times[i]!
    const midpoint = point((lo + hi) / 2)
    if (midpoint.x < 0 || midpoint.x >= 256 || midpoint.y < 0 || midpoint.y >= 256) continue
    const x = Math.floor(midpoint.x), y = Math.floor(midpoint.y)
    const h00 = height(x, y), h10 = height(x + 1, y), h01 = height(x, y + 1), h11 = height(x + 1, y + 1)
    const surface = (p: Vector) => {
      const u = p.x - x, v = p.y - y
      return h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v
    }
    const f0 = point(lo).z - surface(point(lo)), f1 = point(hi).z - surface(point(hi))
    const fm = midpoint.z - surface(midpoint)
    const a = 2 * (f0 + f1 - 2 * fm), b = f1 - f0 - a
    let roots: number[] = []
    if (Math.abs(a) < 1e-10) {
      if (Math.abs(b) > 1e-10) roots = [-f0 / b]
    } else {
      const discriminant = b * b - 4 * a * f0
      if (discriminant >= 0) roots = [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)]
    }
    for (const root of roots.sort((a, b) => a - b)) {
      if (root < 0 || root > 1) continue
      const t = lo + (hi - lo) * root
      if (t >= 1 || hits.some(h => Math.abs(h.fraction - t) < 1e-9)) continue
      const p = point(t), u = p.x - x, v = p.y - y
      const nx = -((h10 - h00) * (1 - v) + (h11 - h01) * v)
      const ny = -((h01 - h00) * (1 - u) + (h11 - h10) * u)
      const length = Math.hypot(nx, ny, 1)
      const index = settings.groundLinkNumber ?? 0
      hits.push({ key: NULL_KEY, rootKey: NULL_KEY, linkNumber: (typeof index === 'number' ? index : index(p.x, p.y)) | 0,
        fraction: t, position: p, normal: { x: nx / length + 0, y: ny / length + 0, z: 1 / length } })
    }
  }
  return hits.sort((a, b) => a.fraction - b.fraction)
}
