import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { Prim } from '../prim.js'
import type { LinksetClock, QueuedEvent } from '../clock.js'
import type { LslValue, Rotation, Vector } from '../values/types.js'
import { ZERO_ROTATION, ZERO_VECTOR } from '../values/types.js'
import { conjugate, mulRotation } from '../values/ops.js'
import { ruleElementType } from '../values/list-types.js'
import { KFM_COMMAND, KFM_DATA, KFM_MODE, KFM_ROTATION, KFM_TRANSLATION,
  KFM_FORWARD, KFM_LOOP, KFM_REVERSE, KFM_PING_PONG,
  KFM_CMD_PLAY, KFM_CMD_PAUSE, KFM_CMD_STOP, STATUS_PHYSICS,
  PRIM_PHYSICS_SHAPE_PRIM } from '../generated/constants.js'
import { llGround } from './ground.js'
import type { Script } from '../script.js'
import type { Linkset } from '../linkset.js'

interface Frame { translation: Vector; rotation: Rotation; duration: number }
interface Transform { position: Vector; rotation: Rotation }
interface Segment { from: Transform; to: Transform; duration: number }

function add(a: Vector, b: Vector): Vector { return {x:a.x+b.x,y:a.y+b.y,z:a.z+b.z} }
function subtract(a: Vector, b: Vector): Vector { return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z} }
function normalize(r: Rotation): Rotation {
  const n=Math.hypot(r.x,r.y,r.z,r.s)
  return {x:r.x/n,y:r.y/n,z:r.z/n,s:r.s/n}
}
function interpolate(a: Rotation, b: Rotation, t: number): Rotation {
  let dot=a.x*b.x+a.y*b.y+a.z*b.z+a.s*b.s
  if (dot<0) { b={x:-b.x,y:-b.y,z:-b.z,s:-b.s};dot=-dot }
  let u=1-t,v=t
  if (dot<.9995) {
    const angle=Math.acos(Math.min(1,dot)), sine=Math.sin(angle)
    u=Math.sin((1-t)*angle)/sine;v=Math.sin(t*angle)/sine
  }
  return normalize({x:a.x*u+b.x*v,y:a.y*u+b.y*v,z:a.z*u+b.z*v,s:a.s*u+b.s*v})
}

type MovingEvent = 'moving_start' | 'moving_end'

/**
 * Raise `event` in every script of the prim's object, root and children alike.
 * In-world: keyframed motion gave moving_start as it began or resumed, and moving_end as it
 * finished, paused, stopped or was cleared; a script in a child prim got both as well.
 * An llSetRegionPos that moved the object gave moving_start and moving_end together, and
 * llSetPos gave neither. Two llSetRegionPos calls in one handler gave one of each: an event
 * still waiting is not raised again (Aditi, SLua Tideland, 2026-11-23).
 * `jump` is a move from one place to another, which a script in a handler gets at once.
 */
function raiseMoving(prim: Prim, event: MovingEvent, at: number, jump = false): void {
  const linkset = prim.linkset
  if (!linkset || linkset.dead) return
  for (const script of linkset.allScripts()) {
    if (jump) queueMoving(linkset.clock, script, event, at)
    else raiseFor(linkset.clock, script, event, at)
  }
}

/** The moving event each script was last given, and the change it has not been given yet. */
const given = new WeakMap<Script, MovingEvent>()
const held = new WeakMap<Script, MovingEvent>()

function hold(script: Script, event: MovingEvent): void {
  held.set(script, event)
  const clock = script.linkset.clock
  clock.holdMoving(script, (when) => {
    const change = held.get(script)
    held.delete(script)
    if (change && change !== (given.get(script) ?? 'moving_end')) queueMoving(clock, script, change, when)
  })
}

/** A copy of a script that carries on where it was (not one that starts from the top) knows what it knew. */
export function copyMovingState(from: Script, to: Script): void {
  const event = given.get(from), change = held.get(from)
  if (event) given.set(to, event)
  if (change) hold(to, change)
}

/** Whether the object moves, in keyframed motion or physically. */
function moving(linkset: Linkset): boolean {
  return !!linkset.prims[0]?.keyframedMotion?.playing || !!physicalMotion.get(linkset)?.moving
}

/**
 * A script that starts, or starts again after a reset, has been told nothing. In-world: keyframed
 * motion started in a handler that then reset the script, at once or after a 1 s sleep, gave the
 * reset script state_entry and then moving_start, and moving_end when the motion ended. A script
 * added to a box in looping keyframed motion got state_entry and then moving_start (Aditi, SLua
 * Tideland, 2026-11-23).
 */
export function forgetMoving(script: Script): void {
  given.delete(script)
  held.delete(script)
  if (!script.dead && moving(script.linkset)) hold(script, 'moving_start')
}

/**
 * A script in a handler, running or asleep, gets the change in its object's motion when it wakes
 * or the handler ends, and only if the object moves otherwise than it was last told.
 *
 * In-world: a keyframed motion of 0.2, 0.5, 1 or 2 s that ended inside the sleep its own call
 * was followed by gave neither event, for sleeps 0.05 to 1.2 s longer than the motion (three
 * runs each). Physics switched on for a box at rest, or 0.3 m above the platform, gave neither
 * when the box came to rest inside the sleep, and so did a hop from llApplyImpulse or
 * llPushObject inside a 3 s sleep. A sleep that ended while the object still moved gave
 * moving_start after it, and moving_end as the object stopped: a 0.5 s motion in a 0.3 s sleep
 * and a 0.6 s sleep after it gave both. A llSleep(0.0) before a 1 s sleep gave neither. A 0.01 or
 * 0.05 s busy loop before the 1 s sleep gave both: a handler that runs on past the call sees the
 * change too, which rezless cannot show, as its handlers take no time but sleeps (Aditi, SLua
 * Tideland, 2026-11-23).
 */
function raiseFor(clock: LinksetClock, script: Script, event: MovingEvent, at: number): void {
  // A script that has not started is told how its object moves when it starts.
  if (script.dead || !script.hasStarted) return
  if (script.handling || script.wakeAt !== undefined) {
    hold(script, event)
    return
  }
  queueMoving(clock, script, event, at)
}

/**
 * Queue a moving event unless one of its kind waits. In-world: start, pause and play 0.5 s
 * apart in one handler gave only moving_start after it, and moving_end when the motion ended.
 * Start, pause, play and stop gave both, as did start and pause, and start and stop. A
 * moving_start takes away a moving_end that waits.
 */
export function queueMoving(clock: LinksetClock, script: Script, event: MovingEvent, at: number): void {
  if (script.dead || !script.hasStarted) return
  // A change queued now replaces one the script was still to be told of.
  held.delete(script)
  given.set(script, event)
  if (event === 'moving_start' && script.running) clock.purgeWhere((e) => e.target === script && e.event === 'moving_end')
  if (!clock.hasPending(script, event)) clock.schedule(script, at, event)
}

/** Whether a physical object's scripts were told it moves, and the settle that will end it. */
interface PhysicalMotion { moving: boolean; settle?: (() => void) | undefined; settleMs?: number }
const physicalMotion = new WeakMap<Linkset, PhysicalMotion>()

/**
 * In-world: moving_end came when the physics engine put the object to rest, and llGetVel read
 * exactly zero from then on. It came 0.09 to 0.13 s after llSetVelocity(ZERO_VECTOR) stopped a
 * floating box. A box floating at 0.04 m/s or more never came to rest; at 0.001 to 0.035 m/s the
 * engine stopped it after 0.8 to 2.2 s. When an object comes to rest is left to the test.
 */
export const SETTLE_MS = 133

/**
 * How long an object resting on something takes to come to rest again once physics is switched
 * on. In-world: 0.73 to 0.80 s in 45 runs, whatever the box's size, shape, rest time before the
 * switch or the call that switched it; a new object's first switch takes longer
 * (FIRST_PHYSICS_SETTLE_MS). A box 1 to 2 cm above the surface fell and rested in 0.15 to 0.26 s,
 * which is a fall for the test to set.
 */
export const PHYSICS_ON_SETTLE_MS = 800

/**
 * How long a new object's first physics takes to come to rest on the surface it lies on.
 * In-world: a box rezzed in contact with the platform with REZ_FLAG_PHYSICAL got moving_end 0.88
 * to 0.93 s after on_rez (8 runs); the first switch to physical of a box rezzed still took 0.86 to
 * 0.87 s (8 runs), and of a Duplicate's copy 0.91 to 0.93 s (3 runs), though the original had
 * been physical many times. The next switches of the same boxes took 0.75 to 0.82 s (Aditi, SLua
 * Tideland, 2026-11-24).
 */
export const FIRST_PHYSICS_SETTLE_MS = 900

/** Objects whose physics has been switched on since they were rezzed or copied. */
const physicalBefore = new WeakSet<Linkset>()
function firstSettleMs(linkset: Linkset, later: number): number {
  if (physicalBefore.has(linkset)) return later
  physicalBefore.add(linkset)
  return FIRST_PHYSICS_SETTLE_MS
}

/** The velocity the object was rezzed or placed with, which llGetVel reads unless a test set one. */
function launchVelocity(linkset: Linkset): Vector {
  return linkset.rez?.velocity ?? linkset.world?.sensorProperties.get(linkset)?.velocity ?? ZERO_VECTOR
}
function velocityOf(linkset: Linkset): Vector {
  return linkset.prims[0]?.physics.velocity ?? launchVelocity(linkset)
}
const still = (v: Vector) => v.x === 0 && v.y === 0 && v.z === 0

function settleLater(linkset: Linkset, state: PhysicalMotion, ms = SETTLE_MS): void {
  if (state.settle || !state.moving) return
  const root = linkset.prims[0]!
  state.settleMs = ms
  state.settle = linkset.clock.scheduleTask({ get dead() { return linkset.dead || linkset.prims[0] !== root } }, linkset.clock.now + ms, () => {
    state.settle = undefined
    // A copy rezzed with a velocity during the settle is still moving.
    if (!still(velocityOf(linkset))) return
    state.moving = false
    raiseMoving(root, 'moving_end', linkset.clock.now)
  })
}

/**
 * The object's motion state, which a velocity read now also counts as moving: an object made
 * physical some other way, or a copy rezzed with a velocity, moves as its velocity says.
 */
function motionOf(linkset: Linkset): PhysicalMotion {
  const state = physicalMotion.get(linkset) ?? { moving: false }
  state.moving ||= !still(velocityOf(linkset))
  return state
}

/** A copy keeps the original's motion state; a settle under way starts again in the copy. */
export function copyPhysicalMotion(from: Linkset, to: Linkset): void {
  const state = physicalMotion.get(from)
  if (!state) return
  const copied: PhysicalMotion = { moving: state.moving }
  physicalMotion.set(to, copied)
  if (state.settle) settleLater(to, copied, state.settleMs)
}

/**
 * Call after a script may have switched the object's physics. In-world: switching physics
 * on gave moving_start at once, whether the box fell or rested on the platform.
 */
export function physicsSwitched(linkset: Linkset, wasPhysical: boolean): void {
  const root = linkset.prims[0]
  if (!root || !!(root.statusFlags & STATUS_PHYSICS) === wasPhysical) return
  const before = motionOf(linkset)
  before.settle?.()
  dropRelease(linkset)
  if (wasPhysical) {
    physicalMotion.delete(linkset)
    // In-world: a box floating at 0.5 m/s whose physics was switched off got moving_end, and
    // llGetVel read zero straight after.
    // Left unset where llGetVel already reads zero, so a later rez can give it a velocity.
    root.physics.velocity = still(launchVelocity(linkset)) ? null : { ...ZERO_VECTOR }
    if (before.moving) raiseMoving(root, 'moving_end', linkset.clock.now)
    return
  }
  const state: PhysicalMotion = { moving: true }
  physicalMotion.set(linkset, state)
  raiseMoving(root, 'moving_start', linkset.clock.now)
  const ms = firstSettleMs(linkset, PHYSICS_ON_SETTLE_MS)
  if (still(velocityOf(linkset))) settleLater(linkset, state, ms)
}

/**
 * Set the velocity llGetVel reads, as a push, a fall or a stop would. A physical object that
 * was at rest raises moving_start, and one whose velocity becomes zero raises moving_end
 * SETTLE_MS later.
 */
export function setVelocity(linkset: Linkset, velocity: Vector): void {
  const root = linkset.prims[0]
  if (!root) return
  if (!(root.statusFlags & STATUS_PHYSICS)) { root.physics.velocity = { ...velocity }; return }
  const state = motionOf(linkset)
  physicalMotion.set(linkset, state)
  root.physics.velocity = { ...velocity }
  if (still(velocity)) { settleLater(linkset, state); return }
  dropRelease(linkset)
  state.settle?.()
  state.settle = undefined
  if (!state.moving) {
    state.moving = true
    raiseMoving(root, 'moving_start', linkset.clock.now)
  }
}

/**
 * A push, an impulse or a move target sets a physical object at rest moving; it comes to rest
 * when the test sets its velocity to zero. In-world: llApplyImpulse and llPushObject lifting a
 * physical box resting on the platform gave moving_start 0.04 to 0.07 s after the call, and
 * moving_end as it landed 0.47 to 0.51 s later; a box another box pushed got moving_start within
 * 0.1 s and moving_end 0.64 to 1.07 s later. An impulse of ZERO_VECTOR gave moving_start too, and
 * a few start and end pairs as the box settled. llMoveToTarget 0.5 m up gave moving_start, and
 * moving_end 2 s later as the box hung at the target; to where the box rested, moving_start and
 * moving_end 0.35 s later. None of them gave an event for a box that was not physical.
 */
export function setMoving(linkset: Linkset, target = false): void {
  const root = linkset.prims[0]
  if (!root || !(root.statusFlags & STATUS_PHYSICS)) return
  // In-world: an impulse or a push on a box the viewer held selected did nothing, and a move
  // target waited until the viewer let go of it.
  const selection = releases.get(linkset)
  if (selection) {
    selection.target ||= target
    return
  }
  const state = motionOf(linkset)
  physicalMotion.set(linkset, state)
  dropRelease(linkset)
  state.settle?.()
  state.settle = undefined
  if (state.moving) return
  state.moving = true
  raiseMoving(root, 'moving_start', linkset.clock.now)
}

/**
 * Call once `object` is rezzed and its on_rez queued. In-world: a box a script rezzed physical,
 * with REZ_FLAG_PHYSICAL or from a physical item, got on_rez, moving_start straight after it,
 * and moving_end as it came to rest on the platform 0.84 to 1.27 s later; rezzed in contact with
 * the platform, 0.88 to 0.93 s after on_rez (FIRST_PHYSICS_SETTLE_MS later here, unless it was
 * rezzed with a velocity). The viewer rezzing a physical item onto the platform gave on_rez only,
 * 13 runs; one it rezzed above the platform had fallen before on_rez ran, and the next switch to
 * physical of such a box took a later switch's 0.8 s. A box a script rezzed not physical with
 * llRezObject, llRezAtRoot or llRezObjectWithParams got on_rez, moving_start and moving_end,
 * seven runs; one the viewer rezzed got neither.
 */
export function rezzedMoving(object: Linkset, byScript: boolean): void {
  const root = object.prims[0]
  if (!root) return
  if (!(root.statusFlags & STATUS_PHYSICS)) {
    // In-world: a box whose keyframed motion a script derezzed playing, rezzed again, got on_rez
    // only and moved on.
    if (!byScript || root.keyframedMotion?.playing) return
    raiseMoving(root, 'moving_start', object.clock.now, true)
    raiseMoving(root, 'moving_end', object.clock.now, true)
    return
  }
  physicalMotion.get(object)?.settle?.()
  physicalBefore.add(object)
  if (!byScript) {
    physicalMotion.set(object, { moving: !still(velocityOf(object)) })
    return
  }
  const state: PhysicalMotion = { moving: true }
  physicalMotion.set(object, state)
  raiseMoving(root, 'moving_start', object.clock.now)
  if (still(velocityOf(object))) settleLater(object, state, FIRST_PHYSICS_SETTLE_MS)
}

/**
 * How long after a Duplicate the viewer's selection stops the copy of a physical object, and how
 * long the copy and the original take to come to rest once the viewer lets go of them.
 */
const DUPLICATE_HELD_MS = 200
const RELEASE_SETTLE_MS = 700

/**
 * The restart due when the viewer lets go of a physical object it selected, and whether a move
 * target set during the selection waits for it.
 */
interface Selection { cancel: () => void; target: boolean }
const releases = new WeakMap<Linkset, Selection>()

/** A velocity set or a physics switch during the selection leaves the motion to the test. */
function dropRelease(linkset: Linkset): void {
  releases.get(linkset)?.cancel()
  releases.delete(linkset)
}

/** Whether the viewer holds the physical object selected, which keeps a move target from acting. */
export function heldBySelection(linkset: Linkset): boolean {
  return releases.has(linkset)
}

function releaseLater(linkset: Linkset, state: PhysicalMotion, ms: number): void {
  const root = linkset.prims[0]!
  const selection: Selection = { cancel: () => {}, target: false }
  selection.cancel = linkset.clock.scheduleTask({ get dead() { return linkset.dead || linkset.prims[0] !== root } }, linkset.clock.now + ms, () => {
    releases.delete(linkset)
    if (!(root.statusFlags & STATUS_PHYSICS) || physicalMotion.get(linkset) !== state) return
    state.moving = true
    raiseMoving(root, 'moving_start', linkset.clock.now)
    // A move target that waited for the release moves the object on; its rest is the test's.
    if (!(selection.target && acting(root.targetMotion.move))) settleLater(linkset, state, RELEASE_SETTLE_MS)
  })
  releases.set(linkset, selection)
}

/**
 * The viewer selects a physical object at rest or settling to edit, Duplicate or take it, which
 * stops it until the viewer lets go `ms` later. In-world: a box switched physical just
 * before a Duplicate got moving_end as it was selected; the original, settling or at rest, got
 * moving_start 0.53 to 0.69 s after the copy appeared and moving_end 0.64 to 0.76 s after that
 * (5 runs). An edit and a Take Copy gave the same, with moving_end 0.51 to 0.76 s after the
 * release (Aditi, SLua Tideland, 2026-11-24). Call before any copy is made; returns whether the
 * object was physical and at rest or settling.
 */
export function selectPhysical(linkset: Linkset, ms: number = SELECTION_MS.copy): boolean {
  const root = linkset.prims[0]
  if (!root || !(root.statusFlags & STATUS_PHYSICS) || !still(velocityOf(linkset))) return false
  if (releases.has(linkset)) return true
  const state = motionOf(linkset)
  physicalMotion.set(linkset, state)
  state.settle?.()
  state.settle = undefined
  if (state.moving) {
    state.moving = false
    raiseMoving(root, 'moving_end', linkset.clock.now)
  }
  releaseLater(linkset, state, ms)
  return true
}

/**
 * A Duplicate's copy of a physical object at rest or settling starts as a new object, is stopped
 * by the viewer's selection, and starts and settles again when the viewer lets go. In-world, 19
 * copies: moving_start 0.01 to 0.08 s after the copy appeared, moving_end 0.15 to 0.35 s in,
 * moving_start 0.44 to 0.79 s in and moving_end 0.57 to 0.76 s after that. Copies made 0.14 to
 * 0.29 s into the original's settle gave the same as copies of a box at rest: the copy keeps
 * none of the settle left to the original. A copy of a box that was not physical got no events.
 * `selected` says whether `selectPhysical` selected the original. A physical copy has been
 * physical either way.
 */
export function duplicatedPhysical(copy: Linkset, selected: boolean): void {
  const root = copy.prims[0]!
  if (root.statusFlags & STATUS_PHYSICS) physicalBefore.add(copy)
  if (!selected) return
  physicalMotion.get(copy)?.settle?.()
  const state: PhysicalMotion = { moving: true }
  physicalMotion.set(copy, state)
  raiseMoving(root, 'moving_start', copy.clock.now)
  state.settle = copy.clock.scheduleTask({ get dead() { return copy.dead || copy.prims[0] !== root } }, copy.clock.now + DUPLICATE_HELD_MS, () => {
    state.settle = undefined
    state.moving = false
    raiseMoving(root, 'moving_end', copy.clock.now)
  })
  releaseLater(copy, state, SELECTION_MS.copy)
}

/**
 * How long the viewer holds an object selected. In-world the moving_start came 0.31 to 0.47 s
 * after an edit or an inspect selected the object (five runs), and 0.54 to 0.86 s after a
 * Duplicate (three runs) or a Take Copy (one run).
 */
export const SELECTION_MS = { edit: 400, copy: 700 } as const

/**
 * The viewer selects an object to edit, Duplicate or Take it, which pauses its keyframed motion
 * until the viewer lets go of it. In-world: a looping motion gave moving_end at the selection and
 * moving_start again when the viewer let go, where the object stayed. A script that paused the
 * motion in its moving_end handler got the moving_start all the same; one that stopped it got
 * nothing more, and the motion stayed stopped. The copy, and the object
 * rezzed from a Take or Take Copy item, stood still with no event, and KFM_CMD_PLAY started its
 * motion again (Aditi, SLua Tideland, 2026-11-23).
 */
export function selectMotion(linkset: Linkset, ms: number): boolean {
  const motion = linkset.prims[0]?.keyframedMotion
  if (motion && selection(motion, linkset.prims[0]!)) return true
  if (!motion?.playing) return false
  motion.command(KFM_CMD_PAUSE)
  selecting.set(motion, { linkset, stops: motion.stops })
  linkset.clock.scheduleTask({ get dead() { return linkset.dead || linkset.prims[0]?.keyframedMotion !== motion } },
    linkset.clock.now + ms, () => {
      const plays = selecting.get(motion)?.stops === motion.stops
      selecting.delete(motion)
      if (plays) motion.command(KFM_CMD_PLAY)
    })
  return true
}

/**
 * Run the moving_end a Take's selection raised before the object is saved. In-world: a looping
 * box taken into inventory ran its moving_end, and the box rezzed from the item had counted it,
 * as had the box rezzed from a Take Copy (two runs); a moving_end handler that slept 1 s was cut
 * off by the Take, and the rezzed box finished it before its on_rez (Aditi, SLua Tideland,
 * 2026-11-24).
 */
export function endBeforeTake(linkset: Linkset): void {
  const clock = linkset.clock
  for (const script of linkset.allScripts()) {
    if (script.dead || !script.running || script.handling || script.wakeAt !== undefined) continue
    const next = clock.pendingEvents().filter((e) => e.target === script && e.at <= clock.now)
      .reduce<QueuedEvent | undefined>((first, e) => !first || e.at < first.at ? e : first, undefined)
    if (next?.event !== 'moving_end') continue
    clock.purgeWhere((e) => e === next)
    script.deliver(next.event, next.payload)
  }
}

/**
 * Motion a viewer selection has paused and not let go of yet, with the stop count it plays again
 * at when the viewer lets go. A KFM_CMD_PLAY while the selection holds it waits for that.
 * In-world: a script's KFM_CMD_PLAY in the moving_end of an edit selection gave moving_start as
 * late as without it, and one in the moving_end of a Take Copy's selection gave moving_start only
 * as the viewer let go, 0.8 s and 9.4 s later, with the copy still. A KFM_CMD_STOP and then a
 * KFM_CMD_PLAY did the same at an edit (two runs) and a Take Copy (Aditi, SLua Tideland,
 * 2026-11-24).
 */
const selecting = new WeakMap<KeyframedMotion, { linkset: Linkset; stops: number }>()

/** The selection holding `motion`, while its object is still the one the viewer selected. */
function selection(motion: KeyframedMotion, prim: Prim) {
  const held = selecting.get(motion)
  if (!held) return undefined
  if (held.linkset.dead || prim.linkset !== held.linkset || held.linkset.prims[0]?.keyframedMotion !== motion) {
    selecting.delete(motion)
    return undefined
  }
  return held
}

/**
 * A copy taken of a selected object holds its motion paused and has been told of no motion:
 * in-world the object rezzed from the item got on_rez only. A script asleep in a handler at the
 * Take or Take Copy keeps the moving_end it was not told yet: the rezzed object finished the
 * handler, got on_rez and then moving_end (Aditi, SLua Tideland, 2026-11-24).
 */
export function stillCopy(copy: Linkset): void {
  for (const script of copy.allScripts()) {
    copy.clock.purgeWhere((e) => e.target === script && (e.event === 'moving_start' || e.event === 'moving_end'))
    if (!held.has(script)) given.set(script, 'moving_end')
  }
}

/** Object-owned motion. Simulator frame drift is not simulated. */
export class KeyframedMotion {
  playing = true
  /** How many times the motion was stopped. */
  stops = 0
  private completed = false
  private elapsed = 0
  private startedAt: number
  private segments: Segment[] = []
  private duration = 0
  private cancel: (() => void) | undefined
  /** When a one-way motion that is playing ends. */
  private endsAt = Infinity
  private held: Transform
  /** A restored object's first cycle runs relative to its new rez pose. */
  private restored: { segments: Segment[]; anchor?: Transform } | undefined

  constructor(private readonly prim: Prim, private readonly clock: LinksetClock,
    private readonly frames: readonly Frame[], private readonly mode: number) {
    this.startedAt=clock.now
    this.held=this.transform()
    this.rebuild()
    this.observe()
  }

  private transform(): Transform {
    return {position:{...this.prim.params.position},rotation:normalize(this.prim.params.rotation)}
  }

  private rebuild(): void {
    let current=this.transform()
    this.segments=[]
    this.restored=undefined
    const frames=this.mode===KFM_REVERSE ? [...this.frames].reverse() : this.frames
    for (const frame of frames) {
      const reverse=this.mode===KFM_REVERSE
      const delta=reverse ? {x:-frame.translation.x,y:-frame.translation.y,z:-frame.translation.z} : frame.translation
      const rotation=reverse ? conjugate(frame.rotation) : frame.rotation
      const next={position:add(current.position,delta),rotation:normalize(mulRotation(rotation,current.rotation))}
      this.segments.push({from:current,to:next,duration:frame.duration})
      current=next
    }
    if (this.mode===KFM_PING_PONG) {
      this.segments.push(...this.segments.slice().reverse().map(s=>({from:s.to,to:s.from,duration:s.duration})))
    }
    this.duration=this.segments.reduce((n,s)=>n+s.duration,0)
  }

  private observe(): void {
    if (this.cancel) return
    const stop=this.clock.onAdvance(now=>this.update(now))
    // The clock stops where a one-way motion ends, so its moving_end comes then.
    const prim=this.prim
    const repeating=this.mode===KFM_LOOP || this.mode===KFM_PING_PONG
    this.endsAt=repeating ? Infinity : this.startedAt+this.duration-this.elapsed
    const end=repeating ? undefined
      : this.clock.scheduleTask({get dead() { return !!prim.linkset?.dead }},this.endsAt,()=>this.update(this.clock.now))
    this.cancel=()=>{stop();end?.()}
  }

  private shift(segments: Segment[], held: Transform): Segment[] {
    const current=this.transform(),delta=subtract(current.position,held.position)
    const rotation=mulRotation(conjugate(held.rotation),current.rotation)
    const shifted=(t: Transform): Transform=>({position:add(t.position,delta),rotation:normalize(mulRotation(t.rotation,rotation))})
    return segments.map(s=>({...s,from:shifted(s.from),to:shifted(s.to)}))
  }

  /** Snapshot plain playback data and bind a fresh controller to the destination clock. */
  copyTo(prim: Prim, clock: LinksetClock): KeyframedMotion {
    this.update(this.clock.now)
    const saved=structuredClone({frames:this.frames,segments:this.segments,
      current:this.restored?.segments,mode:this.mode,playing:this.playing,
      elapsed:this.playing ? this.elapsed+this.clock.now-this.startedAt : 0,pose:this.transform()})
    const copy=new KeyframedMotion(prim,clock,saved.frames,saved.mode)
    // In-world: controlled-snapshot.py and controlled-paused.log (Aditi, SLua Tideland,
    // 2026-11-01) -> active progress survives; paused playback restarts full frames on play.
    const first=saved.playing ? saved.current ?? saved.segments : copy.segments
    copy.segments=saved.segments
    copy.elapsed=this.mode===KFM_LOOP || this.mode===KFM_PING_PONG ? saved.elapsed%copy.duration : saved.elapsed
    copy.held=saved.pose
    copy.restored={segments:first}
    if (saved.playing) {
      copy.restored.anchor=saved.pose
      // The end comes when the restored progress runs out.
      copy.cancel?.();copy.cancel=undefined
      copy.observe()
    } else copy.dispose()
    return copy
  }

  private update(now: number): void {
    if (this.prim.linkset?.dead) { this.dispose();return }
    if (!this.playing) return
    if (this.restored?.anchor) {
      this.restored.segments=this.shift(this.restored.segments,this.restored.anchor)
      delete this.restored.anchor
    }
    let elapsed=this.elapsed+now-this.startedAt
    const repeating=this.mode===KFM_LOOP || this.mode===KFM_PING_PONG
    // In-world: cycle-snapshot.py/loop-snapshot.py -> after the restored partial cycle,
    // both repeating modes return to the original region path (Aditi, SLua Tideland, 2026-11-01).
    if (repeating && elapsed>=this.duration) this.restored=undefined
    if (repeating) elapsed%=this.duration
    else if (elapsed>=this.duration || now>=this.endsAt) {
      raiseMoving(this.prim,'moving_end',this.endsAt)
      elapsed=this.duration
      this.elapsed=this.duration
      this.playing=false
      this.completed=true
      this.cancel?.();this.cancel=undefined
    }
    const segments=this.restored?.segments ?? this.segments
    for (let i=0;i<segments.length;i++) {
      const s=segments[i]!
      if (elapsed>s.duration && i<segments.length-1) { elapsed-=s.duration;continue }
      const t=Math.min(1,elapsed/s.duration)
      this.prim.params.position={x:s.from.position.x+(s.to.position.x-s.from.position.x)*t,
        y:s.from.position.y+(s.to.position.y-s.from.position.y)*t,z:s.from.position.z+(s.to.position.z-s.from.position.z)*t}
      this.prim.params.rotation=interpolate(s.from.rotation,s.to.rotation,t)
      return
    }
  }

  command(command: number): void {
    if (command===KFM_CMD_PAUSE && !this.playing && !this.completed) return
    if (command===KFM_CMD_PAUSE || command===KFM_CMD_STOP) {
      this.update(this.clock.now)
      if (this.playing) {
        this.elapsed+=this.clock.now-this.startedAt
        if (this.mode===KFM_LOOP || this.mode===KFM_PING_PONG) this.elapsed%=this.duration
      }
      if (this.playing) raiseMoving(this.prim,'moving_end',this.clock.now)
      this.playing=false
      this.completed=false
      this.held=this.transform()
      this.cancel?.();this.cancel=undefined
      if (command===KFM_CMD_STOP) { this.elapsed=0;this.stops++;this.rebuild() }
    } else if (command===KFM_CMD_PLAY && selection(this,this.prim)) {
      selection(this,this.prim)!.stops=this.stops
    } else if (command===KFM_CMD_PLAY && !this.playing) {
      if (this.completed) {
        this.completed=false
        this.elapsed=0
        this.held=this.transform()
        this.rebuild()
      }
      if (this.elapsed>=this.duration) return
      // Moving a paused object shifts the remainder of its path by the same transform.
      if (this.restored) {
        this.restored.segments=this.shift(this.restored.segments,this.held)
        delete this.restored.anchor
      } else this.segments=this.shift(this.segments,this.held)
      this.startedAt=this.clock.now
      this.playing=true
      this.observe()
      raiseMoving(this.prim,'moving_start',this.clock.now)
    }
  }

  dispose(): void { this.cancel?.();this.cancel=undefined;this.playing=false }
}

function vector(v: LslValue | undefined): v is Vector {
  return !!v && typeof v==='object' && !Array.isArray(v) && !('s' in v)
    && 'x' in v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
}
function rotation(v: LslValue | undefined): v is Rotation {
  if (!v || typeof v!=='object' || Array.isArray(v) || !('s' in v)) return false
  const r=v as Rotation
  return [r.x,r.y,r.z,r.s].every(Number.isFinite) && Math.abs(r.x*r.x+r.y*r.y+r.z*r.z+r.s*r.s-1)<=1e-6
}
function integer(list: readonly LslValue[], index: number): boolean {
  return typeof list[index]==='number' && Number.isInteger(list[index]) && ruleElementType(list,index)!=='float'
}

export const llSetKeyframedMotion: BuiltinImpl = (ctx,args) => {
  const frames=args[0] as readonly LslValue[], options=args[1] as readonly LslValue[]
  const root=ctx.linkset.prims[0]!
  if (options.length%2) return
  if (options[0]===KFM_COMMAND) {
    if (frames.length || options.length!==2 || !integer(options,0) || !integer(options,1)) return
    root.keyframedMotion?.command(options[1] as number)
    return
  }
  let mode=KFM_FORWARD,data=KFM_TRANSLATION|KFM_ROTATION
  for (let i=0;i<options.length;i+=2) {
    if (!integer(options,i) || !integer(options,i+1)) return
    const value=options[i+1] as number
    if (options[i]===KFM_MODE && value>=KFM_FORWARD && value<=KFM_REVERSE) mode=value
    else if (options[i]===KFM_DATA && value>=1 && value<=3) data=value
    else return
  }
  if (!frames.length) {
    if (options.length) return
    if (root.keyframedMotion?.playing) raiseMoving(root,'moving_end',ctx.state.clock.now)
    root.keyframedMotion?.dispose();root.keyframedMotion=null
    return
  }
  if (root.statusFlags&STATUS_PHYSICS || !ctx.linkset.prims.some(p=>p.params.physicsShapeType!==PRIM_PHYSICS_SHAPE_PRIM)) return
  const stride=1+Number(!!(data&KFM_TRANSLATION))+Number(!!(data&KFM_ROTATION))
  if (frames.length%stride) return
  const parsed: Frame[]=[]
  for (let i=0;i<frames.length;) {
    let translation: Vector=ZERO_VECTOR,orientation: Rotation=ZERO_ROTATION
    if (data&KFM_TRANSLATION) { const v=frames[i++];if (!vector(v)) return;translation={...v} }
    if (data&KFM_ROTATION) { const r=frames[i++];if (!rotation(r)) return;orientation=normalize(r) }
    const seconds=frames[i++]
    if (typeof seconds!=='number' || !Number.isFinite(seconds) || seconds<1/9 || Math.hypot(translation.x,translation.y,translation.z)/seconds>250) return
    parsed.push({translation,rotation:orientation,duration:seconds*1000})
  }
  const moving=root.keyframedMotion?.playing
  root.keyframedMotion?.dispose()
  root.keyframedMotion=new KeyframedMotion(root,ctx.linkset.clock,parsed,mode)
  if (!moving) raiseMoving(root,'moving_start',ctx.state.clock.now)
}

export const llSetRegionPos: BuiltinImpl = (ctx,args) => {
  const target=args[0] as Vector,root=ctx.linkset.prims[0]!
  if (!vector(target) || target.x < -10 || target.x>266 || target.y < -10 || target.y>266 || target.z<0 || target.z>4096
    || root.statusFlags&STATUS_PHYSICS || root.keyframedMotion?.playing) return 0
  const from=ctx.prim.regionPosition()
  const ground=Number(llGround(ctx,[subtract(target,from)]))
  const before=root.params.position
  root.params.position={...target,z:Math.max(target.z,ground)}
  const after=root.params.position
  if (before.x!==after.x || before.y!==after.y || before.z!==after.z) {
    raiseMoving(root,'moving_start',ctx.state.clock.now,true)
    raiseMoving(root,'moving_end',ctx.state.clock.now,true)
  }
  return Number(root.params.position.z-target.z<.1)
}


interface TargetOwner { prim: string; script: string }
interface MoveRequest { owner: TargetOwner; target: Vector; tau: number; slack?: boolean }
interface LookRequest {
  owner: TargetOwner
  slack?: boolean
  target: { position: Vector } | { rotation: Rotation }
  strength: number
  damping: number
}
export interface TargetMotionState { move: MoveRequest | null; look: LookRequest | null }

// In-world: tau-bound/rot-bound probes accepted .044444 and rejected .044.
const MIN_RESPONSE = Math.fround(.044444)
function owner(ctx: CallContext): TargetOwner {
  return { prim: ctx.prim.key, script: ctx.script.instanceId }
}

function stopTargetMotion(prim: Prim, kind: 'move' | 'look', caller: TargetOwner): void {
  const request = prim.targetMotion[kind]
  if (request?.owner.prim === caller.prim && request.owner.script === caller.script) prim.targetMotion[kind] = null
}

/**
 * Let go of, or take up again, the move and look targets `script` owns. In-world: a physical box
 * dropped within about 2 s of its targeting script being set not running, and went back to its
 * target once the script was started.
 */
export function slackenTargetMotion(script: Script, slack: boolean): void {
  const root = script.linkset.prims[0]!
  for (const request of [root.targetMotion.move, root.targetMotion.look]) {
    if (request?.owner.prim === script.host.key && request.owner.script === script.instanceId) {
      if (slack) request.slack = true
      else delete request.slack
    }
  }
}

// In-world: a sibling's new target, set while the script that owns the target was stopped, did
// nothing until that script was started.
const slackOf = (request: { slack?: boolean } | null) => request?.slack ? { slack: true } : {}

const acting = <T extends { slack?: boolean }>(request: T | null) => request?.slack ? null : request

/** The initiating script retains stop/reset ownership even when a sibling retargets it. */
export function clearTargetMotion(script: Script): void {
  const root = script.linkset.prims[0]!, caller = { prim: script.host.key, script: script.instanceId }
  stopTargetMotion(root, 'move', caller)
  stopTargetMotion(root, 'look', caller)
}

function lookRotation(position: Vector, target: Vector): Rotation {
  const delta = subtract(target, position), length = Math.hypot(delta.x, delta.y, delta.z)
  if (!length) return { x: 1, y: 0, z: 0, s: 0 }
  // Pitch +Z toward the target, then yaw around world +Z. This keeps +X below
  // the horizon, rather than using the shortest rotation of +Z alone.
  const pitch = Math.acos(Math.max(-1, Math.min(1, delta.z / length))) / 2
  const yaw = Math.atan2(delta.y, delta.x) / 2
  return { x: -Math.sin(pitch) * Math.sin(yaw), y: Math.sin(pitch) * Math.cos(yaw),
    z: Math.cos(pitch) * Math.sin(yaw), s: Math.cos(pitch) * Math.cos(yaw) }
}

const TARGET_STEP_MS = 10
interface CoupledStep {
  at: number
  ticks: number
  held: Transform
  output: Transform
  move: MoveRequest
  look: LookRequest
}
function pose(prim: Prim): Transform {
  return { position: { ...prim.params.position }, rotation: { ...prim.params.rotation } }
}
function samePose(prim: Prim, value: Transform): boolean {
  const p = prim.params.position, r = prim.params.rotation
  return p.x === value.position.x && p.y === value.position.y && p.z === value.position.z
    && r.x === value.rotation.x && r.y === value.rotation.y && r.z === value.rotation.z && r.s === value.rotation.s
}

/** Coupled move/look uses a fixed cadence. Partial steps are sampled, never committed. */
export class TargetMotionStepper {
  private coupled: CoupledStep | undefined
  constructor(private readonly prim: Prim, private previous: number) {}

  advance(now: number): void {
    const from = this.previous
    this.previous = now
    if (now <= from) return
    if (this.prim.linkset && heldBySelection(this.prim.linkset)) {
      this.coupled = undefined
      return
    }
    const move = acting(this.prim.targetMotion.move), look = acting(this.prim.targetMotion.look)
    if (!(this.prim.statusFlags & STATUS_PHYSICS) || !move || !look || !('position' in look.target)) {
      this.coupled = undefined
      advanceTargetMotion(this.prim, (now - from) / 1000)
      return
    }
    let step = this.coupled
    if (!step || step.move !== move || step.look !== look || !samePose(this.prim, step.output)) {
      step = this.coupled = { at: from, ticks: 0, held: pose(this.prim), output: pose(this.prim), move, look }
    }
    this.prim.params.position = { ...step.held.position }
    this.prim.params.rotation = { ...step.held.rotation }
    const ticks = Math.floor((now - step.at) / TARGET_STEP_MS + 1e-9)
    while (step.ticks < ticks) {
      advanceTargetMotion(this.prim, TARGET_STEP_MS / 1000)
      step.ticks++
    }
    step.held = pose(this.prim)
    const remainder = Math.max(0, now - step.at - ticks * TARGET_STEP_MS)
    if (remainder) advanceTargetMotion(this.prim, remainder / 1000)
    step.output = pose(this.prim)
  }
}

/** Nominal exponential kinematics. No gravity, angular wobble, contacts or inertia. */
function advanceTargetMotion(prim: Prim, seconds: number): void {
  if (!(prim.statusFlags & STATUS_PHYSICS)) return
  const move = acting(prim.targetMotion.move), look = acting(prim.targetMotion.look)
  if (move) {
    const from = prim.params.position, t = -Math.expm1(-seconds / move.tau)
    prim.params.position = { x: from.x + (move.target.x - from.x) * t,
      y: from.y + (move.target.y - from.y) * t, z: from.z + (move.target.z - from.z) * t }
  }
  if (look) {
    const target = 'rotation' in look.target ? look.target.rotation : lookRotation(prim.params.position, look.target.position)
    prim.params.rotation = interpolate(normalize(prim.params.rotation), target,
      -Math.expm1(-seconds / (look.strength * look.damping)))
  }
}

export const llMoveToTarget: BuiltinImpl = (ctx, args) => {
  const root = ctx.linkset.prims[0]!, target = args[0] as Vector, tau = Number(args[1])
  const held = root.targetMotion.move, initiator = held?.owner ?? owner(ctx)
  stopTargetMotion(root, 'move', owner(ctx))
  if (!vector(target) || !Number.isFinite(tau) || tau < MIN_RESPONSE) return
  const delta = subtract(target, root.regionPosition())
  // In-world: edge-64 moved, edge-64.01 and distance-64.9 did not.
  if (Math.hypot(delta.x, delta.y, delta.z) > 64) return
  root.targetMotion.move = { owner: initiator, target: { ...target }, tau, ...slackOf(held) }
  setMoving(ctx.linkset, true)
}
// In-world: llStopMoveToTarget gave moving_start when the box fell from the target, and nothing
// when it rested where it was; the fall is left to the test.
export const llStopMoveToTarget: BuiltinImpl = ctx => { stopTargetMotion(ctx.linkset.prims[0]!, 'move', owner(ctx)) }

function setLook(ctx: CallContext, target: LookRequest['target'], strength: number, damping: number): void {
  const root = ctx.linkset.prims[0]!
  const held = root.targetMotion.look, initiator = held?.owner ?? owner(ctx)
  stopTargetMotion(root, 'look', owner(ctx))
  const physical = !!(root.statusFlags & STATUS_PHYSICS)
  if (!Number.isFinite(strength) || !Number.isFinite(damping) || strength <= 0 || (physical && strength < MIN_RESPONSE)) return
  if (!physical) {
    const rotation = 'rotation' in target ? target.rotation : lookRotation(ctx.prim.regionPosition(), target.position)
    ctx.prim.params.rotation = rotation
    return
  }
  root.targetMotion.look = { owner: initiator, target, strength, damping: Math.max(MIN_RESPONSE, Math.min(1, damping)), ...slackOf(held) }
}
export const llLookAt: BuiltinImpl = (ctx, args) => {
  if (!vector(args[0])) return
  setLook(ctx, { position: { ...args[0] } }, Number(args[1]), Number(args[2]))
}
export const llRotLookAt: BuiltinImpl = (ctx, args) => {
  const target = args[0] as Rotation
  if (![target.x, target.y, target.z, target.s].every(Number.isFinite)) return
  const magnitude = Math.hypot(target.x, target.y, target.z, target.s)
  setLook(ctx, { rotation: magnitude ? normalize(target) : { ...ZERO_ROTATION } }, Number(args[1]), Number(args[2]))
}
export const llStopLookAt: BuiltinImpl = ctx => { stopTargetMotion(ctx.linkset.prims[0]!, 'look', owner(ctx)) }
