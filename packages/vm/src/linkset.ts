import { deliverObjectReceivedChat } from './rlv/received.js'
import { retainRlvAttachment } from './rlv/attachments.js'
import { pauseSensors, resumeSensors } from './builtins/sensor.js'
import { pauseTargets, resumeTargets } from './builtins/targets.js'
import { flushDamageEvents } from './builtins/damage.js'
import { playCollisionSounds, playLandSound } from './builtins/collision.js'
import { copyMovingState, copyPhysicalMotion, duplicatedPhysical, queueMoving, SELECTION_MS, selectMotion, selectPhysical, setVelocity } from './builtins/motion.js'
import { LATE_TOUCH_START, LinksetClock, PRESSED_BUSY, SIM_FRAME_MS, cameUp, type QueuedEvent } from './clock.js'
import { Prim } from './prim.js'
import { restepRezzedShape } from './prim-params.js'
import type { Script } from './script.js'
import { mergeLinksetData, type LinksetDataEntry } from './builtins/linksetdata.js'
import type { LinkedMessageEntry } from './builtins/linked.js'
import { touchThroughInventory, type DetectedEntry } from './builtins/detected.js'
import { rememberNotecardAsset } from './builtins/notecard-search.js'
import type { ChatType } from './runtime.js'
import type { World, WorldAvatar } from './world.js'
import { NULL_KEY, ZERO_VECTOR, type Vector } from './values/types.js'
import { conjugate, mulRotation, rotateVector } from './values/ops.js'
import type { InventoryItem } from './inventory.js'
import {
  LINK_ROOT,
  LINK_SET,
  LINK_ALL_OTHERS,
  LINK_ALL_CHILDREN,
  LINK_THIS,
  PASS_ALWAYS,
  PASS_NEVER,
  CHANGED_LINK,
  KFM_CMD_STOP,
  PERM_COPY,
  REGION_FLAG_ALLOW_DAMAGE,
  STATUS_PHANTOM,
  STATUS_PHYSICS,
  STATUS_ROTATE_X,
  STATUS_ROTATE_Y,
  STATUS_ROTATE_Z,
} from './generated/constants.js'

// Re-export so `import { LINK_* } from '@rezless/vm'` keeps working.
export { LINK_ROOT, LINK_SET, LINK_ALL_OTHERS, LINK_ALL_CHILDREN, LINK_THIS }

/** A link of an object: one of its prims, or an avatar seated on it. */
export type Link = Prim | WorldAvatar

export const isPrim = (link: Link | undefined): link is Prim => link instanceof Prim

export interface LinksetOptions {
  /** Owner key applied to all scripts in this linkset. */
  readonly owner?: string
  /**
   * Unix time in seconds at virtual time 0, read by llGetUnixTime and
   * friends. Default 0. Ignored in a world, whose clock the linkset shares.
   */
  readonly startUnixTime?: number
  /** World to join; the linkset shares its clock and chats with its other linksets. */
  readonly world?: World
  /** Region of `world` the linkset is in. */
  readonly region?: string
  /** Start parameter the object was rezzed with, read by llGetStartParameter. Default 0. */
  readonly startParameter?: number
  /** Start string the object was rezzed with, read by llGetStartString. Default "". */
  readonly startString?: string
  /** Whether the object is an animated mesh, so llStartObjectAnimation plays. Default false. */
  readonly animesh?: boolean
}

/** Attachment state shared by every prim in a worn linkset. */
export interface Attachment {
  readonly avatar: string
  readonly point: number
  readonly temporary: boolean
  /** Sequence among this clock's currently worn objects. */
  readonly order: number
}

export interface TouchOptions {
  /** Face of the prim that was clicked. Default 0. */
  readonly face?: number
  /** Where on the face the click landed, as texture coordinates. */
  readonly st?: Vector
  /** Where on the texture the click landed, after repeats and offsets. */
  readonly uv?: Vector
  /** Where the click landed, as the viewer reports it: region coordinates, or the HUD's own for a HUD. */
  readonly pos?: Vector
  /** The surface normal at the point clicked. */
  readonly normal?: Vector
  /** The surface binormal at the point clicked. */
  readonly binormal?: Vector
  /** Milliseconds the click is held before release. Default 0. */
  readonly hold?: number
  /** Who clicked. Defaults to the owner. */
  readonly avatar?: Omit<DetectedEntry, 'linkNumber' | 'touchFace' | 'touchST' | 'touchUV' | 'touchPos' | 'touchNormal' | 'touchBinormal'>
}

/** A click a script still counts as held: it gets `touch` for it while `repeating`. */
export interface HeldTouch {
  detected: ReadonlyArray<DetectedEntry>
  repeating: boolean
  /** When it was pressed, if the handler was busy then. */
  pressedBusy?: number
  /** Whether it was pressed in the sleep after the running handler spun, while another avatar held a click. */
  afterSpin?: boolean
  /** Whether it has raised a `touch` yet. */
  touched: boolean
  /** What its last `touch` detected. */
  lastTouch?: ReadonlyArray<DetectedEntry>
  /** Whether the click is stuck: the button came up while the script was stopped, or it was held through a take or a detach. */
  released: boolean
  /** Whether a link change ended it while the button was still down. */
  cut?: boolean
  /** When its next `touch` is due. */
  dueAt: number
}

/** The scripts on one clock that hold clicks, and the task that raises their next `touch`. */
const repeaters = new WeakMap<LinksetClock, { scripts: Set<Script>; cancel?: (() => void) | undefined; at?: number | undefined }>()

function repeater(clock: LinksetClock) {
  let found = repeaters.get(clock)
  if (!found) repeaters.set(clock, found = { scripts: new Set() })
  return found
}

function scheduleTouch(s: Script, event: string, detected: ReadonlyArray<DetectedEntry>, extra?: { held?: false; late?: true | 'merged'; pressedBusy?: number | undefined }): void {
  if (!s.handles(event)) return
  const pressed = extra?.pressedBusy !== undefined && { [PRESSED_BUSY]: detected.map(() => extra.pressedBusy) }
  s.linkset.clock.scheduleTouch(s, event, { num_detected: detected.length, detected, ...(extra?.late && { [LATE_TOUCH_START]: extra.late }), ...pressed }, extra?.held)
}

/**
 * Whether touch events carried through a take or a detach wait for `s`, none of which a new click
 * merges into. In-world, SLua ran fivebot's click on the worn object last to first after i doll's
 * carried click from before the spin, 11 runs of 11, and i doll's own second click the same way,
 * 2 runs of 2.
 */
const carriedOnly = (s: Script) => {
  const carried = s.linkset.clock.pendingEvents().filter((e) => e.target === s && !!e.carried)
  return carried.length > 0 && carried.every((e) => !e.carried!.takesIn)
}

const detectedIn = (e: QueuedEvent) => (e.payload['detected'] as ReadonlyArray<DetectedEntry> | undefined) ?? []

/** The touch events waiting for `s` that list the avatar `by`, or that list someone else. */
function waitingTouches(s: Script, event: string, by: string) {
  const lists = (e: QueuedEvent) => detectedIn(e).some((d) => d.key?.toLowerCase() === by)
  const clock = s.linkset.clock
  const waiting = clock.pendingEvents().filter((e) => e.target === s && e.event === event && e.at <= clock.now)
  return { own: waiting.find(lists), other: waiting.find((e) => !lists(e)) }
}

/**
 * A copy of `detected` that counts as new touch data, so llMapDestination and llMapBeacon may
 * show the map again from the event that carries it.
 */
const fresh = (detected: ReadonlyArray<DetectedEntry>) => detected.map((e) => ({ ...e }))

/** The avatars that have clicked each script since its held clicks began to overlap. */
const overlapping = new WeakMap<Script, Set<string>>()

/** When each avatar last pressed a click on each script while its handler was busy. */
const busyPresses = new WeakMap<Script, Map<string, number>>()

/** When each avatar last pressed a click on each script while its handler was not busy. */
const idlePresses = new WeakMap<Script, Map<string, number>>()

/** Whether avatar `k` pressed a click on `s` while the handler running now was busy. */
const pressedInSpin = (s: Script, k: string | undefined) =>
  k !== undefined && s.handlerStartedAt !== undefined && (busyPresses.get(s)?.get(k) ?? -Infinity) >= s.handlerStartedAt

/** Whether avatar `k` pressed a click on `s` while the handler running now was busy, and again since. */
const pressedAgain = (s: Script, k: string) => pressedInSpin(s, k) && (idlePresses.get(s)?.get(k) ?? -Infinity) > busyPresses.get(s)!.get(k)!

/** Whether avatar `k` pressed on `s` in the busy part after avatar `by` did. */
const pressedLater = (s: Script, k: string, by: string) => busyPresses.get(s)!.get(k)! > busyPresses.get(s)!.get(by)!

/** The touch data each script has run a `touch` handler with. */
const deliveredTouches = new WeakMap<Script, WeakSet<DetectedEntry>>()

/** Note that `s` runs a `touch` handler with `detected`. */
export function touchDelivered(s: Script, detected: ReadonlyArray<DetectedEntry>): void {
  let seen = deliveredTouches.get(s)
  if (!seen) deliveredTouches.set(s, seen = new WeakSet())
  for (const e of detected) seen.add(e)
}

const raising = (s: Script) => !s.dead && s.running && s.linkset.peers.includes(s.linkset)

/** Schedule the task for the earliest `touch` a held click owes, or cancel it when none does. */
function armTouches(clock: LinksetClock): void {
  const found = repeater(clock)
  let next = Infinity
  for (const s of found.scripts) {
    if (s.dead || !s.heldClicks.size) found.scripts.delete(s)
    else if (raising(s)) for (const click of s.heldClicks.values()) if (click.repeating) next = Math.min(next, click.dueAt)
  }
  if (found.at === next) return
  found.cancel?.()
  found.cancel = found.at = undefined
  if (next === Infinity) return
  found.at = next
  found.cancel = clock.scheduleTask({ dead: false }, next, () => {
    found.cancel = found.at = undefined
    raiseHeldTouches(clock)
    armTouches(clock)
  })
}

/** In-world: an SLua script got touch every simulator frame, an LSL script in the same prim every second. */
const repeatMs = (s: Script) => s.language === 'slua' ? TOUCH_REPEAT_MS / 2 : TOUCH_REPEAT_MS

/**
 * Raise `touch` for each held click that is due. In-world: held for 1.5 s, a click raised
 * touch 0.022 s after touch_start and then every 0.044 s in LSL, every 0.022 s in SLua. Under
 * llMinEventDelay(1.0) the first touch still came 0.022 s after touch_start, the next 1.0 s
 * after touch_start, and each after that a second after the touch before it, whatever the
 * timer did; the ones in between merged into the waiting one.
 */
function raiseHeldTouches(clock: LinksetClock): void {
  for (const s of repeater(clock).scripts) {
    if (!raising(s)) continue
    // In-world: while i doll and fivebot both held a click, each touch listed both, i doll first,
    // in LSL and SLua.
    let raised: { detected: DetectedEntry[]; plain: boolean } | undefined
    const starts: QueuedEvent[] = []
    let ahead: string | undefined
    for (const [by, click] of s.heldClicks) {
      if (!click.repeating || click.dueAt > clock.now + 1e-6) continue
      click.dueAt += repeatMs(s)
      // In-world: a held click raised no touch while the touch handler ran on, asleep, busy or
      // in a call's delay, so a release then left only touch_end; touch_start's or a timer's
      // sleep kept one.
      if (!s.handles('touch') || s.handlerEvent === 'touch') continue
      // In-world: while another handler slept or spun, fivebot's held click raised no touch of
      // its own when i doll's touch waited. In LSL, i doll's touch listed fivebot too when it
      // came up a frame or more after the handler started (5 of 13 runs with a timer that slept
      // 3 s), and listed i doll alone when it came up in the handler's first frame (the other
      // 8; with a listen that slept, 8 of 10 and 2 of 10; in llInstantMessage's delay, 4 of 5
      // and 1 of 5). When i doll's touch came up while the handler spun it listed i doll alone,
      // whatever frame it came up in: 13 runs with a listen, 4 with touch_end, and 5 with a
      // listen that spun 1.5 s and then slept 1.5 s while fivebot's click was held into the
      // sleep, or clicked in the sleep, 8 runs, and 6 with a timer that spun. A listen that slept
      // first and then spun followed the frame rule, 5 runs, but listed i doll alone when
      // fivebot clicked in the spin, 6 runs of 6. A listen that slept 1 s, spun 1 s and slept
      // 1.5 s listed i doll alone when fivebot pressed in the spin and held into the second
      // sleep, 6 runs of 6, and when fivebot clicked only in the second sleep, 6 runs of 6. So
      // once the handler has spun, the touch that came up before the spin takes no one else.
      // SLua raises a held click's touch every frame, so it came up in the first frame and
      // listed i doll alone, 4 runs of 4.
      const running = s.handlerEvent !== undefined
      // A touch still waiting for its frame takes the place of a new one, and lists this click too.
      if (!running) {
        const { own, other } = waitingTouches(s, 'touch', by)
        // Only a touch that came up while the script was idle takes this click too, and not before
        // the click's own touch_start: a touch that waited through a handler keeps its avatars.
        if (other && !own && cameUp(other) >= s.clockView.lastEndedAt && !waitingTouches(s, 'touch_start', by).own) {
          other.payload['detected'] = [...detectedIn(other), ...click.detected]
          other.payload['num_detected'] = detectedIn(other).length
          click.touched = true
          click.lastTouch = click.detected
        }
        if (own || other) continue
      }
      const touches = running ? waitingTouches(s, 'touch', by) : { own: undefined, other: undefined }
      const waiting = touches.other
      if (waiting || running && raised) {
        const listed = waiting ? detectedIn(waiting) : raised!.detected
        const came = waiting ? cameUp(waiting) : clock.now
        // In-world: i doll's second click, in the sleep after its first click in the spin, joined
        // the touch of fivebot's click from the sleep, though i doll's touch from the spin waited,
        // LSL and SLua 3 runs of 3 each. When i doll and then fivebot clicked in the spin and
        // fivebot again in the sleep, i doll's later press joined fivebot's touch from the spin,
        // LSL and SLua 2 runs of 2 each.
        const inSpin = (k: string | undefined) => pressedInSpin(s, k)
        const idle = (k: string) => idlePresses.get(s)?.get(k) ?? -Infinity
        const again = !!waiting && inSpin(by) && listed.every((d) => {
          const k = d.key?.toLowerCase()
          const c = k === undefined ? undefined : s.heldClicks.get(k)
          return k !== undefined && (!c || !c.cut && c.pressedBusy === undefined) && pressedAgain(s, k) && pressedLater(s, k, by) && idle(k) < idle(by)
        })
        if (listed.length && s.handlerEvent !== 'touch_start' && !waiting?.carried && (!s.spunSince(came) || again) && came >= s.handlerStartedAt! + SIM_FRAME_MS - 1e-6 && !listed.some((d) => d.key?.toLowerCase() === by)) {
          if (waiting) {
            waiting.payload['detected'] = [...listed, ...click.detected]
            waiting.payload['num_detected'] = listed.length + click.detected.length
          } else raised!.detected.push(...click.detected)
          click.lastTouch = click.detected
          // In-world: fivebot's click in an LSL touch_end sleep joined i doll's touch that waited
          // through it, and its touch_start ran ahead of that touch, 4 runs of 4.
          const start = waitingTouches(s, 'touch_start', by).own
          if (start?.held) starts.push(start)
          click.touched = true
          continue
        }
        // In-world: fivebot's second click in a listen's spin, or in its sleep after a spin, while
        // i doll held a click and fivebot's first touch_end waited, raised a touch of its own
        // listing both, after its touch_start (9 runs of 9). Its only click on a copy rezzed in
        // the sleep raised none, as a first click does (2 runs of 2).
        // In-world: when the avatars that touch listed had let go before this click, as with a
        // click by fivebot and then one by i doll in a listen's spin, the click kept a touch of
        // its own, LSL 4 runs of 4 and SLua 5 of 5. When i doll still held on at fivebot's click in
        // the sleep and let go first, fivebot's click got no touch, LSL and SLua 1 run each.
        const alone = !!waiting && !(click.afterSpin && click.touched) && (s.spunSince(came) || !!waiting.carried) && !listed.some((d) => { const c = s.heldClicks.get(d.key!.toLowerCase()); return !!c && !c.cut })
        if (!alone && (touches.own || !s.spunSince(came) || !waitingTouches(s, 'touch_end', by).own)) {
          click.touched = true
          continue
        }
        // In-world: in SLua that touch ran ahead of the click's touch_start, after a spin (2 runs
        // of 2) and in the sleep after a spin (2 runs of 2).
        if (!alone && s.language === 'slua') ahead = by
      }
      // In-world: a held click's touch from a sleep in touch_start, or a spin in listen, after
      // its touch_start ran, came ahead of a listen that came up later; its touch_end waited
      // behind that listen.
      const plain = running && !waitingTouches(s, 'touch_start', by).own
      // In-world: a click by the same avatar after the handler spun, while the touch of its
      // earlier click waited, raised no touch, in LSL (12 runs of 12) and SLua (4 runs of 4).
      if (touches.own && s.spunSince(cameUp(touches.own))) {
        click.touched = true
        continue
      }
      // A touch already waiting with this click's data stays as it is, in its place among the
      // avatars it lists; a new click by the same avatar replaces it in the held merge.
      if (touches.own && (plain || detectedIn(touches.own).some((d) => click.detected.includes(d) || !!click.lastTouch?.includes(d)))) continue
      // In-world: a map call in the first touch of a held click showed nothing after one in
      // touch_start, and one in a later touch showed the map again.
      // A touch raised before the last one ran merges into it and keeps its data.
      const last = click.lastTouch
      const detected = !last ? click.detected : deliveredTouches.get(s)?.has(last[0]!) ? fresh(click.detected) : last
      click.touched = true
      click.lastTouch = detected
      const listed = new Set(raised?.detected.map((d) => d.key?.toLowerCase()))
      const others = waiting ? [...s.heldClicks].filter(([k, c]) => k !== by && c.repeating && !c.released && !c.cut && !listed.has(k)).flatMap(([, c]) => c.detected) : []
      if (raised) raised.detected.push(...others, ...detected)
      else raised = { detected: [...others, ...detected], plain }
    }
    if (raised) scheduleTouch(s, 'touch', raised.detected, raised.plain ? { held: false } : undefined)
    for (const start of starts) clock.putAhead(start)
    if (raised && ahead) clock.putTouchAhead(s, ahead)
  }
}

/**
 * In-world: after a held click's touch handler slept, the next touch came 0.044 to 0.045 s
 * after the wake in LSL and 0.022 to 0.023 s after it in SLua, for sleeps of 0.5, 1 and
 * 1.01 s: one repeat after the handler ended.
 */
export function touchHandlerEnded(s: Script): void {
  if (!s.heldClicks.size) return
  for (const click of s.heldClicks.values()) click.dueAt = s.linkset.clock.now + repeatMs(s)
  armTouches(s.linkset.clock)
}

/** In-world: a script started again during a hold, or after it, got touch 0.022 s later. */
export function resumeHeldTouches(s: Script): void {
  if (!s.heldClicks.size) return
  for (const click of s.heldClicks.values()) click.dueAt = s.linkset.clock.now + TOUCH_REPEAT_MS / 2
  repeater(s.linkset.clock).scripts.add(s)
  armTouches(s.linkset.clock)
}

/**
 * In-world: after llResetScript, or a state change, a held click raised no more touch events,
 * and its release still raised touch_end. A reset also forgot a stuck click, whether its button
 * came up while the script was stopped or it was held through a detach and wear, or one that a
 * link break had ended, so the next click was a normal one; after a state change that next
 * click still raised no touch_start.
 */
export function forgetHeldTouches(s: Script, reset: boolean): void {
  for (const [by, click] of s.heldClicks) {
    if (reset && (click.released || click.cut)) s.heldClicks.delete(by)
    else click.repeating = false
  }
  armTouches(s.linkset.clock)
}

/**
 * In-world: llBreakLink and llBreakAllLinks, called from the root or a child, and llBreakLink(1)
 * on the root itself, ended every click the root's scripts held, whether the button was still
 * down or the click was stuck, with touch_end reading the click's link number, and their touch
 * events stopped. Clicks held in the children ran on. llCreateLink ended none. Unlink and Link
 * in the viewer's build tools did the same. A root script still counted such a click as held
 * until a release reached it: when the release went elsewhere, that avatar's next click raised
 * no touch_start there.
 */
function cutRootClicks(root: Prim): void {
  for (const s of root.scripts) {
    if (!s.running || s.dead) continue
    for (const click of s.heldClicks.values()) {
      if (click.cut) continue
      click.cut = true
      click.repeating = false
      scheduleTouch(s, 'touch_end', fresh(click.detected))
    }
  }
  armTouches(root.linkset!.clock)
}

export interface RezRecord {
  readonly rezzer: Prim
  readonly rezzerKey: string
  readonly item: InventoryItem
  readonly copyable: boolean
  flags: number
  velocity: Vector
  acceleration: Vector
  accelerationLocal: boolean
}

const TOUCH_EVENTS = ['touch_start', 'touch', 'touch_end'] as const

/** A click pressed and not yet released. */
interface PressedClick {
  readonly prim: Prim
  readonly by: string
  readonly detected: ReadonlyArray<DetectedEntry>
  readonly receivers: Script[]
  readonly clicks: Map<Script, HeldTouch>
  readonly at: number
}

const live = (s: Script) => s.running && !s.dead

const touchHandlers = (p: Prim) =>
  p.scripts.filter((s) => live(s) && s.hasStarted && TOUCH_EVENTS.some((e) => s.handles(e)))

/** The scripts a click on `prim` reaches now, by its pass setting and links. */
function touchRoute(prim: Prim): Script[] {
  const own = touchHandlers(prim)
  const top = prim.linkset!.prims[0]!
  if (prim === top) return own
  const pass = prim.params.passTouches
  return pass === PASS_ALWAYS || (pass !== PASS_NEVER && own.length === 0) ? [...own, ...touchHandlers(top)] : own
}
/** How often a held click raises `touch`: every second simulator frame. */
export const TOUCH_REPEAT_MS = 2000 / 45

const CHAT_RANGE: Partial<Record<ChatType, number>> = { whisper: 10, say: 20, shout: 100 }

/**
 * A linkset owns the shared world state for its prims and scripts: the
 * single virtual clock, the LSD store, the cross-script link_message
 * capture, and the registry of prims + scripts. Per-script state stays on
 * `Script` / `ScriptState`.
 *
 * Single-script default: when `new Script(ast, options)` is called without
 * a host prim, a 1-prim/1-script linkset is auto-allocated. Existing tests
 * see no behavioral change.
 */
export class Linkset {
  readonly clock: LinksetClock
  readonly prims: Prim[] = []
  /** Linkset-wide LSD store (was per-script before multi-script support). */
  readonly linksetData: Map<string, LinksetDataEntry> = new Map()
  /**
   * Cross-script capture of every `llMessageLinked` invocation in this
   * linkset. Append-only; long-running tests should call
   * `clearLinkedMessages()` between scenarios to keep memory bounded.
   */
  readonly linkedMessages: LinkedMessageEntry[] = []
  /** Virtual times of recent llHTTPRequest calls, for the per-object throttle. */
  readonly httpRequestTimes: number[] = []
  /** Scripts the object held when the region last worked out its server cost. */
  countedScripts = 0

  /**
   * Count the scripts for OBJECT_SERVER_COST again. The region does so when
   * the object is rezzed or linked, when an avatar sits on it or stands up,
   * when a script is removed, when a child prim moves or turns in the object
   * and when a prim's size, shape, physics shape, physics or temporary status
   * changes. Adding a script counts those already there.
   */
  recountScripts(): void {
    this.countedScripts = this.allScripts().length
  }

  /** Drop every captured cross-script linked-message entry. */
  clearLinkedMessages(): void {
    this.linkedMessages.length = 0
  }
  /** Whether this object is on damage-enabled land. Defaults to the region damage flag. */
  damageEnabled = false
  owner: string
  /** Null while rezzed or detached; tests may attach fixtures with attachToAvatar. */
  attachment: Attachment | null = null
  private lastAttachmentPoint = 6
  private deleteAfterDetach = false
  /** True once a script in the linkset has called llDie. */
  dead = false
  /** Provenance and initial motion of a script-rezzed object. */
  rez: RezRecord | undefined
  /** Temporary objects expire after 60 seconds of virtual time. */
  expiresAt: number | undefined
  rezCounter = 0
  readonly world?: World
  private rezRegion: string | undefined
  readonly startParameter: number
  readonly startString: string
  readonly animesh: boolean
  /**
   * The linksets that share this one's clock and hear its chat: its world's,
   * or, outside a world, this one and every linkset broken off it.
   */
  readonly peers: Linkset[]

  /** `from` is the linkset this one breaks off; outside a world, they share a clock. */
  constructor(opts: LinksetOptions = {}, from?: Linkset) {
    this.owner = opts.owner ?? NULL_KEY
    this.rezRegion = opts.region
    this.startParameter = opts.startParameter ?? 0
    this.startString = opts.startString ?? ''
    this.animesh = opts.animesh ?? false
    if (opts.world) {
      opts.world.corner(opts.region)
      this.world = opts.world
      this.clock = opts.world.clock
      this.peers = opts.world.linksets
    } else if (from) {
      this.clock = from.clock
      this.peers = from.peers
    } else {
      this.clock = new LinksetClock(opts.startUnixTime)
      this.peers = []
    }
    this.damageEnabled = from?.damageEnabled
      ?? (((opts.world?.region(opts.region).flags ?? 0) & REGION_FLAG_ALLOW_DAMAGE) !== 0)
    this.peers.push(this)
  }

  /** The avatar wearing this object, if it is worn by one in its world. */
  get wearer(): WorldAvatar | undefined {
    const worn = this.attachment
    return worn ? this.world?.avatars.find(avatar => avatar.key.toLowerCase() === worn.avatar.toLowerCase()) : undefined
  }

  /** A worn object is in its wearer's region. */
  get region(): string | undefined {
    return this.wearer?.region ?? this.rezRegion
  }

  /** Add a prim to the linkset; assigns a 1-based linkNumber. */
  addPrim(prim: Prim): Prim {
    prim.linkset = this
    prim.createdAt = this.clock.now
    this.prims.push(prim)
    this.recomputeLinkNumbers()
    return prim
  }

  /** Point used when the next attachment request specifies point zero. */
  get savedAttachmentPoint(): number { return this.lastAttachmentPoint }

  /** Wear a fixture without a script permission request, as a viewer does. */
  attachToAvatar(avatar: string, point: number, temporary = false): void {
    if (this.dead || this.attachment || !this.prims.length) return
    point &= 255
    point = point === 0 ? this.lastAttachmentPoint : point > 55 ? 1 : point
    const order = Math.max(0, ...this.peers.map(l => l.attachment?.order ?? 0)) + 1
    const fromInventory = !this.peers.includes(this)
    if (fromInventory) {
      this.peers.push(this)
      this.recountScripts()
      for (const prim of this.prims) restepRezzedShape(prim.params)
    }
    this.lastAttachmentPoint = point
    this.attachment = { avatar, point, temporary, order }
    for (const script of this.allScripts()) {
      // In-world: a script that was stopped when its object was stored, even by a sibling's
      // attach(NULL_KEY) during the detach, came back reset. One started there came back as it was.
      if (script.clockView.inInventory) script.resetIntoInventory()
      // Viewer recovery may already have queued this inventory rez.
      if (fromInventory && !script.rezQueued) script.queueRez()
      resumeSensors(script)
      resumeTargets(script)
    }
    this.broadcastAttach(avatar, this.allScripts().filter(script => script.quietAttach))
    for (const script of this.allScripts()) {
      script.clockView.resumeFromInventory()
      resumeHeldTouches(script)
    }
    this.applyStoppedPastWearChanges()
  }

  /**
   * Once an object out of inventory has queued its rez: a script that stopped itself after the
   * changes it held for its siblings still made them.
   */
  applyStoppedPastWearChanges(): void {
    for (const script of this.allScripts()) if (!script.running) script.applyPastWearChanges()
  }

  /** Detach into inventory, preserving script state and the remembered point. */
  detachFromAvatar(): void {
    if (!this.attachment) return
    retainRlvAttachment(this)
    for (const avatar of this.world?.avatars ?? []) avatar.viewer.session.detached(this)
    // In-world: a detach put the camera back on the avatar, though the script had reset since it locked it.
    for (const prim of this.prims) prim.scriptedCameras.clear()
    this.deleteAfterDetach = this.attachment.temporary
    this.attachment = null
    for (const item of this.prims.flatMap((prim) => prim.inventory)) rememberNotecardAsset(this.peers, item)
    const index = this.peers.indexOf(this)
    if (index >= 0) this.peers.splice(index, 1)
    // A detached object leaves region queries and recurring timers. The final
    // attach event still runs from the shared clock's explicit event queue.
    for (const script of this.allScripts()) {
      script.clockView.pauseForInventory()
      script.detached()
      pauseSensors(script)
      pauseTargets(script)
      // In-world: a chat line waiting for a handler that was asleep, or busy in a loop, at the
      // detach ran when the object was worn again, after on_rez and before the two attach events.
      if (script.handling) script.detachedInHandler = true
      else if (script.wakeAt === undefined) this.clock.purgeTarget(script)
      // In-world: a game_control waiting for a script asleep at the detach never ran.
      if (script.wakeAt !== undefined) this.clock.purgeWhere((e) => e.target === script && e.event === 'game_control')
    }
    // In-world: a click held across a detach and a wear kept raising touch, reading face -1. A
    // click still held at the detach stayed stuck: its release raised no touch_end, and another
    // avatar's first click on the worn object raised touch_start (LSL and SLua 2 runs of 2 each).
    for (const script of this.allScripts()) {
      for (const click of script.heldClicks.values()) {
        click.detected = touchThroughInventory(click.detected)
        click.released = true
        delete click.lastTouch
      }
    }
    this.broadcastAttach(NULL_KEY)
    this.finishTemporaryDetach()
  }

  private finishTemporaryDetach(): void {
    if (!this.deleteAfterDetach || this.allScripts().some(s => s.running && s.wakeAt === undefined && !s.detachedInHandler && this.clock.hasPending(s, 'attach'))) return
    this.deleteAfterDetach = false
    this.remove()
  }

  private broadcastAttach(avatar: string, skip: readonly Script[] = []): void {
    for (const script of this.allScripts()) {
      if (!skip.includes(script) && script.running && !script.dead) this.clock.schedule(script, this.clock.now, 'attach', { avatar })
    }
  }

  /**
   * Snapshot an inventory object, or instantiate it in the rezzer's world. A snapshot of an
   * object that is sat on stands its sitter up first, as taking it or a copy of it does.
   */
  copy(opts: LinksetOptions = {}, from?: Linkset): Linkset {
    // In-world: taking an object, or a copy of it, stood up the avatar sitting on it.
    const sitters = opts.world ? [] : this.world?.avatars.filter(avatar => avatar.sittingOn?.linkset === this) ?? []
    // Taken before the stand: the copy's scripts get the stand's event from `unseated`.
    const waiting = this.clock.pendingEvents()
    for (const avatar of sitters) this.world!.standAvatar(avatar)
    const unseated = sitters.length > 0
    const copy = new Linkset({ owner: this.owner, animesh: this.animesh, ...opts }, from)
    this.fill(copy, (script, prim) => {
      const copied = script.copyTo(prim, { unseated, waiting })
      copyMovingState(script, copied)
      return copied
    })
    // A copy that joins a world or a rezzer's clock is rezzed or worn; any other is a snapshot.
    if (opts.world || from) for (const prim of copy.prims) restepRezzedShape(prim.params)
    copy.recountScripts()
    return copy
  }

  /**
   * Copy a rezzed object where it stands, as a shift-drag in the viewer does, or `offset` from
   * it, as the viewer's Duplicate does, and return the copy. The copy's scripts start from the
   * top, and an avatar sitting on the original stays. They start together; with
   * `startScripts: false` they wait for `startAll`, so a test can start them in groups, as
   * Second Life does.
   */
  duplicate(offset: Vector = ZERO_VECTOR, { startScripts = true }: { startScripts?: boolean } = {}): Linkset {
    if (this.dead || this.attachment || !this.prims.length || !this.peers.includes(this)) throw new Error('duplicate: only a rezzed object can be copied')
    // A no-copy item makes the object that holds it no-copy to its owner.
    if (this.prims.some(prim => !(prim.permMask.owner & PERM_COPY) || prim.inventory.some(item => !(item.permMask.owner & PERM_COPY)))) {
      throw new Error('duplicate: the object is no-copy')
    }
    selectMotion(this, SELECTION_MS.copy)
    const selected = selectPhysical(this)
    const region = this.region
    const copy = new Linkset({ owner: this.owner, animesh: this.animesh, ...(this.world ? { world: this.world } : {}),
      ...(region === undefined ? {} : { region }) }, this.world ? undefined : this)
    // In-world: the copy of a stopped script was stopped too. Started, it ran state_entry.
    this.fill(copy, (script, prim) => Object.assign(script.copyTo(prim, { fresh: true }), { running: script.runsWhenDuplicated }))
    // In-world: the copy of a box hanging at its move target fell to the platform at once, and
    // the copy of a box turning to its look target stopped turning.
    copy.prims[0]!.targetMotion = { move: null, look: null }
    const root = copy.prims[0]!.params
    root.position = { x: root.position.x + offset.x, y: root.position.y + offset.y, z: root.position.z + offset.z }
    // In-world: a copy of a box whose one script was counted read 0.5, and a copy of a box whose
    // two scripts were both counted read 0.75: the region leaves out the copy's last script.
    copy.countedScripts = Math.max(0, copy.allScripts().length - 1)
    for (const script of copy.allScripts()) {
      if (startScripts) script.queueStart()
      else script.holdStart()
    }
    duplicatedPhysical(copy, selected)
    return copy
  }

  /**
   * Drop a worn object to the ground, as the viewer's Drop does: at `position`, or where its
   * wearer stands. It keeps its key, its scripts run on and get attach(NULL_KEY), the region
   * counts its scripts again, and RLV restrictions it set stay in force. Its scripts lose
   * controls and camera control, and keep their other permissions. Its inventory item is
   * gone. The viewer offers no Drop for a temporary attachment, which has no item.
   */
  dropFromAvatar(position?: Vector): void {
    const attached = this.attachment
    if (!attached || attached.temporary || this.dead) return
    const wearer = this.world?.avatars.find(avatar => avatar.key.toLowerCase() === attached.avatar.toLowerCase())
    if (wearer) {
      this.rezRegion = wearer.region
      wearer.viewer.inventory.forgetAttachment(this)
    }
    const at = position ?? wearer?.position
    if (at) this.prims[0]!.params.position = { ...at }
    this.attachment = null
    // In-world: the dropped box's script already read llGetPermissions without
    // PERMISSION_TAKE_CONTROLS and PERMISSION_CONTROL_CAMERA in attach(NULL_KEY).
    for (const script of this.allScripts()) script.droppedFromAvatar()
    this.recountScripts()
    this.broadcastAttach(NULL_KEY)
  }

  private fill(copy: Linkset, copyScript: (script: Script, prim: Prim) => Script): void {
    copy.lastAttachmentPoint = this.lastAttachmentPoint
    for (const source of this.prims) {
      const prim = copy.addPrim(new Prim({ name: source.name }))
      for (const [name, value] of Object.entries(source)) {
        if (['key', 'linkset', 'linkNumber', 'createdAt', 'scripts', 'inventory', 'keyframedMotion', 'scriptedCameras'].includes(name)) continue
        Object.assign(prim, { [name]: structuredClone(value) })
      }
      // In-world: scripted derez retains motion; copy only its data, never live callbacks.
      prim.keyframedMotion = source.keyframedMotion?.copyTo(prim, copy.clock) ?? null
      for (const item of source.inventory) {
        if (item.script) {
          const script = copyScript(item.script, prim)
          Object.assign(prim.inventory.at(-1)!, { ...item, permMask: { ...item.permMask }, script })
        } else prim.placeInventory({ ...item, permMask: { ...item.permMask } })
      }
    }
    for (const [key, value] of this.linksetData) copy.linksetData.set(key, { ...value })
    copyPhysicalMotion(this, copy)
  }

  /** Remove the object and cancel all its scripts, including sleeping handlers. */
  remove(): void {
    if (this.dead) return
    for (const avatar of this.world?.avatars ?? []) {
      if (avatar.sittingOn?.linkset === this) this.world!.dropFromRemovedSeat(avatar)
    }
    this.dead = true
    for (const script of this.allScripts()) {
      script.markDead()
      this.clock.purgeTarget(script)
    }
    for (const item of this.prims.flatMap((prim) => prim.inventory)) rememberNotecardAsset(this.peers, item)
    const index = this.peers.indexOf(this)
    if (index >= 0) this.peers.splice(index, 1)
    this.world?.sensorProperties.delete(this)
  }

  /** Temporary status belongs to the whole object; repeated TRUE keeps its deadline. */
  setTemporary(temporary: boolean): void {
    for (const prim of this.prims) prim.params.tempOnRez = temporary
    if (temporary) this.expiresAt ??= this.clock.now + 60000
    else this.expiresAt = undefined
  }

  /** Avatars seated on this object, in seating order. They are the links after the prims. */
  sitters(): WorldAvatar[] {
    return (this.world?.avatars ?? [])
      .filter((a) => a.sittingOn !== null && this.prims.includes(a.sittingOn))
      .sort((a, b) => a.sittingOrder - b.sittingOrder)
  }

  /** The prim or seated avatar at link number `link`. */
  linkAt(link: number): Prim | WorldAvatar | undefined {
    return this.prims.find((p) => p.linkNumber === link) ?? this.sitterAt(link)
  }

  /** The seated avatar at link number `link`. */
  sitterAt(link: number): WorldAvatar | undefined {
    return link > this.prims.length ? this.sitters()[link - this.prims.length - 1] : undefined
  }

  /** Renumber the prims. Runs when prims are linked or unlinked and when an avatar sits or stands. */
  recomputeLinkNumbers(): void {
    if (this.prims.length === 1 && this.sitters().length === 0) {
      // A lone prim is link 0 until an avatar sits on it.
      this.prims[0]!.linkNumber = 0
      return
    }
    for (let i = 0; i < this.prims.length; i++) {
      this.prims[i]!.linkNumber = i + 1
    }
  }

  /**
   * llCreateLink: link `other`'s prims in from link 2, behind this linkset's
   * root, each staying where it is. The root's linkset data stays and keys
   * only `other` holds move over; `other` is left empty and leaves its world.
   * Every script in the result gets changed(CHANGED_LINK).
   */
  absorb(other: Linkset): void {
    if (other !== this) {
      // In-world: linking a mover as a child stops it but retains frames for play after unlink.
      other.prims[0]?.keyframedMotion?.command(KFM_CMD_STOP)
      // In-world: a box linked as a child into an object playing keyframed motion got
      // moving_start at the link, ahead of changed, and moving_end with the object.
      if (this.prims[0]?.keyframedMotion?.playing) {
        for (const script of other.allScripts()) queueMoving(this.clock, script, 'moving_start', this.clock.now)
      }
      this.place([this.prims[0]!, ...other.prims, ...this.prims.slice(1)])
      mergeLinksetData(this.linksetData, other.linksetData)
      other.prims.length = 0
      other.linksetData.clear()
      other.peers.splice(other.peers.indexOf(other), 1)
    }
    this.raiseLinkChanged(this.prims)
  }

  /**
   * llBreakLink: take `prim` out into a linkset of its own. The root prim
   * keeps the linkset data; when `prim` is the root, the rest stay linked
   * under the next prim with no data. Every prim of both parts gets
   * changed(CHANGED_LINK), and avatars seated on the object stand. A lone
   * prim only loses its sitters. `caller` is the script that broke the link.
   */
  breakOff(prim: Prim, caller?: Script): void {
    this.standSitters(caller)
    if (this.prims.length < 2) return
    cutRootClicks(this.prims[0]!)
    const rest = this.prims.filter((p) => p !== prim)
    const all = [...this.prims]
    if (prim === this.prims[0]) {
      this.splitOff(rest)
      this.place([prim])
    } else {
      this.splitOff([prim])
      this.place(rest)
    }
    this.raiseLinkChanged(all)
  }

  /**
   * llBreakAllLinks: break every prim apart; each gets changed(CHANGED_LINK).
   * `caller` is the script that broke the links.
   */
  breakAll(caller?: Script): void {
    this.standSitters(caller)
    if (this.prims.length < 2) return
    cutRootClicks(this.prims[0]!)
    const all = [...this.prims]
    for (const p of all.slice(1)) this.splitOff([p])
    this.place([all[0]!])
    this.raiseLinkChanged(all)
  }

  /** Unlinking a prim stands everyone seated on the object. */
  private standSitters(caller?: Script): void {
    // In-world, the stand's changed(32) came with the link change, a frame late, in LSL and, after
    // a sleep and with a sitter wearing few attached prims, in SLua.
    const late = caller && (caller.language !== 'slua' || caller.handlerWentOn)
    for (const avatar of this.sitters()) {
      if (late) this.world!.unsitFrom(avatar)
      else this.world!.standAvatar(avatar)
    }
  }

  /** Move `prims` into a new linkset in this one's world and region, with no linkset data. */
  private splitOff(prims: Prim[]): void {
    const opts: { -readonly [K in keyof LinksetOptions]: LinksetOptions[K] } = {
      owner: this.owner,
      startParameter: this.startParameter,
      startString: this.startString,
    }
    if (this.world) opts.world = this.world
    if (this.region !== undefined) opts.region = this.region
    new Linkset(opts, this).place(prims)
  }

  /**
   * Make `prims` this linkset's prims, the first as root, keeping each prim
   * at its region position and rotation.
   */
  private place(prims: Prim[]): void {
    const first = prims[0]!
    // In-world: a prim unlinked from an object keeps its physics and phantom
    // status, and its other STATUS_* flags go back to a new object's.
    const status = first.linkset?.prims[0] === first ? undefined
      : first.statusFlags & (STATUS_PHYSICS | STATUS_PHANTOM) | STATUS_ROTATE_X | STATUS_ROTATE_Y | STATUS_ROTATE_Z
    // In-world, a prim unlinked from an object that detects volume still does.
    const volumeDetect = first.volumeDetect
    const placed = prims.map((p) => ({ p, pos: p.framePosition(), rot: p.frameRotation() }))
    // A sitter stays where it is in the region when its object gets another root.
    const seated = (this.world?.avatars ?? [])
      .filter((a) => a.sittingOn !== null && prims.includes(a.sittingOn))
      // From the local rotation last set, which the region may not show yet.
      .map((a) => ({ a, pos: a.position, rot: mulRotation(a.sitPlacement!.rotation, a.sittingOn!.linkset!.prims[0]!.regionRotation()) }))
    this.prims.splice(0, this.prims.length, ...prims)
    const root = placed[0]!
    const inverse = conjugate(root.rot)
    for (const { p, pos, rot } of placed) {
      p.linkset = this
      if (p === root.p) {
        p.params.position = pos
        p.params.rotation = rot
      } else {
        const offset = { x: pos.x - root.pos.x, y: pos.y - root.pos.y, z: pos.z - root.pos.z }
        p.params.position = rotateVector(offset, inverse)
        p.params.rotation = mulRotation(rot, inverse)
      }
    }
    for (const { a, pos, rot } of seated) {
      const offset = { x: pos.x - root.pos.x, y: pos.y - root.pos.y, z: pos.z - root.pos.z }
      a.sitPlacement = { position: rotateVector(offset, inverse), rotation: mulRotation(rot, inverse) }
    }
    if (status !== undefined) {
      first.statusFlags = status
      first.volumeDetect = volumeDetect
    }
    this.recomputeLinkNumbers()
    this.recountScripts()
  }

  /**
   * Queue changed(CHANGED_LINK) on every script in `prims`. As in Second
   * Life, a stopped script never gets it, and a script skips it while one
   * queued since it last started or woke is still waiting, or while two are. In-world it came
   * a simulator frame after llBreakLink or llBreakAllLinks, behind a link message sent straight
   * after it.
   */
  private raiseLinkChanged(prims: ReadonlyArray<Prim>): void {
    const pending = this.clock
      .pendingEvents()
      .filter((e) => e.event === 'changed' && e.payload['changes'] === CHANGED_LINK)
    for (const p of prims) {
      for (const s of p.scripts) {
        if (!s.running) continue
        const waiting = pending.filter((e) => e.target === s)
        if (waiting.length >= 2 || waiting.some((e) => cameUp(e) >= s.resumedAt)) continue
        this.clock.scheduleNextFrame(s, 'changed', { changes: CHANGED_LINK })
      }
    }
  }

  /** Flat list of every script in every prim, in prim/inventory order. */
  allScripts(): Script[] {
    const out: Script[] = []
    for (const p of this.prims) {
      for (const s of p.scripts) out.push(s)
    }
    return out
  }

  /** Locate the prim containing `script`, or undefined. */
  primOf(script: Script): Prim | undefined {
    return this.prims.find((p) => p.scripts.includes(script))
  }

  /** The first link that is not `from`: link 2 seen from the root, the root seen from any other link. */
  firstOtherLink(from: Link): Link | undefined {
    return from === this.prims[0] ? this.linkAt(2) : this.prims[0]
  }

  /**
   * The link `link` names, seen from `from`, in a call that takes one link.
   * LINK_THIS is `from` and every other negative number is the first other
   * link. Link 0 is the root seen from another link, and a lone prim nobody
   * sits on; seen from the root of a linkset, or of a lone prim someone sits
   * on, it names nothing.
   */
  oneLink(from: Link, link: number): Link | undefined {
    if (link === LINK_THIS) return from
    if (link < 0) return this.firstOtherLink(from)
    if (link > 0) return this.linkAt(link)
    const root = this.prims[0]
    return from !== root || root?.linkNumber === 0 ? root : undefined
  }

  /** The prim `link` names in a call that takes one link; undefined for an avatar link or no link. */
  onePrim(from: Link, link: number): Prim | undefined {
    const one = this.oneLink(from, link)
    return isPrim(one) ? one : undefined
  }

  /**
   * The links `link` names, seen from the prim `from`, in a call that takes
   * LINK_SET, LINK_ALL_OTHERS and LINK_ALL_CHILDREN as groups. The groups hold
   * prims only. Any other number names one link, as in `oneLink`: a number
   * below LINK_THIS is the first other link, and that or a positive number can
   * name a seated avatar.
   */
  linksFrom(from: Prim, link: number): { prims: Prim[]; sitter: WorldAvatar | undefined } {
    const group = link === LINK_THIS ? [from]
      : link === LINK_SET ? [...this.prims]
      : link === LINK_ALL_OTHERS ? this.prims.filter((p) => p !== from)
      : link === LINK_ALL_CHILDREN ? this.prims.slice(1)
      : undefined
    if (group) return { prims: group, sitter: undefined }
    const one = this.oneLink(from, link)
    return isPrim(one) ? { prims: [one], sitter: undefined } : { prims: [], sitter: one }
  }

  /**
   * Set the velocity llGetVel reads, as a push, a fall or the object coming to rest would.
   * A physical object at rest raises moving_start when it gets a velocity, and moving_end a
   * moment after its velocity becomes zero.
   */
  setVelocity(velocity: Vector): void {
    setVelocity(this, velocity)
  }

  /** Play the collision sounds of this object landing on `struck` at `speed` m/s. Collision events are fired separately. */
  collide(struck: Linkset, speed: number) {
    playCollisionSounds(this, struck, speed)
  }

  /** Play the sound of this object landing on the ground at `speed` m/s. Land collision events are fired separately. */
  collideWithLand(speed: number) {
    playLandSound(this, speed)
  }

  /**
   * The prims and seated avatars a link call reaches. In-world, the three group
   * flags take every sitter as well, and a link number naming an avatar takes that avatar.
   */
  linksWithSitters(from: Prim, link: number) {
    const { prims, sitter } = this.linksFrom(from, link)
    if (link === LINK_SET || link === LINK_ALL_OTHERS || link === LINK_ALL_CHILDREN) return [...prims, ...this.sitters()]
    return sitter ? [sitter] : prims
  }

  /** Resolve LINK_* / specific link number to the set of target prims. */
  resolveTargets(senderLink: number, target: number): Prim[] {
    const sender = this.prims.find((p) => p.linkNumber === senderLink)
    // A sender that is not a prim of this object leaves nothing out of LINK_ALL_OTHERS.
    if (!sender && target === LINK_ALL_OTHERS) return [...this.prims]
    const from = sender ?? this.prims[0]
    return from ? this.linksFrom(from, target).prims : []
  }

  /**
   * Schedule `linkset_data` events on every script in the linkset. The
   * caller is expected to have already mutated the shared LSD store before
   * broadcasting.
   */
  broadcastLinksetData(action: number, name: string, value: string): void {
    const at = this.clock.now
    for (const s of this.allScripts()) {
      this.clock.schedule(s, at, 'linkset_data', { action, name, value })
    }
  }

  /**
   * Send a `link_message` according to LSL fan-out semantics.
   * `senderLink` is the calling prim's link number; the event payload's
   * `sender_num` is set to that value. Scripts that are not running never
   * get the message. The capture array on the linkset records every
   * invocation for cross-script test assertions.
   */
  deliverLinkMessage(
    senderLink: number,
    target: number,
    num: number,
    str: string,
    id: string,
  ): void {
    this.linkedMessages.push({ target, num, str, id })
    const targets = this.resolveTargets(senderLink, target)
    const at = this.clock.now
    for (const p of targets) {
      for (const s of p.scripts) {
        if (s.running && s.hasStarted) this.clock.schedule(s, at, 'link_message', { sender_num: senderLink, num, str, id })
      }
    }
  }

  /**
   * Deliver chat to every script in the linkset whose listens match. Useful
   * for region/world-level chat simulation. `Script.deliverChat` remains
   * available for the single-script case (delivers only to that script).
   */
  deliverChat(opts: { channel: number; name: string; key: string; message: string }): void {
    this.settle(this.allScripts().filter((s) => s.matchChatListens(opts) && s.handles('listen')))
  }

  /**
   * Queue chat a script in prim `from` sent on the listens of every prim it
   * reaches, in this linkset and the rest of its world. Whisper, say and
   * shout reach prims within 10, 20 and 100 m in any region; llRegionSay
   * reaches the sender's region. llRegionSayTo reaches the prim keyed `to`,
   * or the target avatar's attachments on nonzero channels, in that region.
   * A prim never hears its own chat.
   */
  routeChat(from: Prim, type: ChatType, channel: number, message: string, to?: string): void {
    deliverObjectReceivedChat(this, from, type, channel, message, to)
    const origin = this.globalPosition(from)
    const range = CHAT_RANGE[type] ?? 0
    const reaches = (linkset: Linkset, p: Prim): boolean => {
      if (p === from) return false
      if (type === 'regionSay') return linkset.region === this.region
      if (type === 'regionSayTo') return linkset.region === this.region && to !== NULL_KEY &&
        (p.key === to || channel !== 0 && linkset.attachment !== null &&
          linkset.attachment.avatar.toLowerCase() === to?.toLowerCase())
      return distanceSquared(origin, linkset.globalPosition(p)) <= range * range
    }
    this.broadcast(reaches, { channel, name: from.name, key: from.key, message })
  }

  /** Queue a say by `avatar` on the listens of every prim within 20 m of it and of what it wears. */
  routeAvatarSay(avatar: WorldAvatar, channel: number, message: string): void {
    const corner = this.world!.corner(avatar.region)
    const origin = { x: corner.x + avatar.position.x, y: corner.y + avatar.position.y, z: avatar.position.z }
    const range = CHAT_RANGE.say!
    this.broadcast((linkset, p) => linkset.attachment?.avatar.toLowerCase() === avatar.key.toLowerCase() ||
      distanceSquared(origin, linkset.globalPosition(p)) <= range * range,
      { channel, name: avatar.name, key: avatar.key, message })
  }

  /**
   * Queue an avatar's dialog answer on the listens of every prim within
   * 20 m of `from`, the prim that showed the dialog, including `from`
   * itself. Returns the scripts that matched.
   */
  routeAvatarChat(from: Prim, chat: { channel: number; name: string; key: string; message: string }): Script[] {
    const origin = this.globalPosition(from)
    const range = CHAT_RANGE.say!
    return this.broadcast((linkset, p) => distanceSquared(origin, linkset.globalPosition(p)) <= range * range, chat)
  }

  /**
   * Queue avatar chat on the listens it reaches and return the matched
   * scripts; never drain inside a builtin. Channel 0 and positive channels
   * reach `volume` range; a negative channel reaches 20 m whatever the
   * volume. Both cross region borders.
   */
  routeViewerReply(avatar: WorldAvatar, channel: number, message: string, volume: 'whisper' | 'say' | 'shout' = 'shout'): Script[] {
    const corner = this.world!.corner(avatar.region)
    const origin = { x: corner.x + avatar.position.x, y: corner.y + avatar.position.y, z: avatar.position.z }
    const range = CHAT_RANGE[channel < 0 ? 'say' : volume]!
    // Attachment positions are fixture values, but a worn object always hears its wearer.
    return this.broadcast((linkset, prim) => linkset.attachment?.avatar.toLowerCase() === avatar.key.toLowerCase() ||
      distanceSquared(origin, linkset.globalPosition(prim)) <= range ** 2,
      { channel, name: avatar.name, key: avatar.key, message })
  }

  private broadcast(
    reaches: (linkset: Linkset, p: Prim) => boolean,
    chat: { channel: number; name: string; key: string; message: string },
  ): Script[] {
    const matched: Script[] = []
    for (const linkset of this.peers) {
      for (const p of linkset.prims) {
        if (!reaches(linkset, p)) continue
        for (const s of p.scripts) if (s.matchChatListens(chat)) matched.push(s)
      }
    }
    return matched
  }

  /**
   * Click link `link` as an avatar. Each script in that prim gets
   * `touch_start`, `touch` and `touch_end`, if it handles them. The click
   * also reaches the root's scripts when the prim set PASS_ALWAYS, or when
   * no running script in it that has started handles any touch event and it
   * did not set PASS_NEVER. The release goes where a click on that prim
   * would go at that moment, by its pass setting and links then: a script
   * it reaches that did not get the click gets `touch_end` alone, and a
   * clicked script it no longer reaches keeps getting `touch` as if stopped
   * through the release. llDetectedLinkNumber is `link` until the release,
   * whose `touch_end` reads the prim's link number then, and
   * llDetectedTouchFace is `face`. Breaking a link during the hold ends the
   * root's clicks at once; see cutRootClicks.
   *
   * A click with no `hold` raises all three events at once. A held click
   * raises `touch_start`, then `touch` every TOUCH_REPEAT_MS, starting half
   * a beat after the click, to each receiver that is running, and
   * `touch_end` at the release. A receiver that is stopped at the release
   * gets no `touch_end`: once it runs again it keeps getting `touch` for
   * that avatar until the avatar's next click, which raises no
   * `touch_start` there and whose release ends it.
   */
  touch(link: number, opts: TouchOptions = {}): void {
    const { hold, ...click } = opts
    const by = (opts.avatar?.key ?? this.owner).toLowerCase()
    if (this.pressed.has(by)) throw new Error(`touch: ${by} is holding a click from press`)
    const pressed = this.pressClick(link, click, Math.min(TOUCH_REPEAT_MS / 2, hold ?? 0))
    if (hold) {
      armTouches(this.clock)
      this.advanceTime(hold)
    }
    this.settle(this.releaseClick(pressed))
  }

  /**
   * Press an avatar's click on link `link` and keep it held until `release`, so a test can
   * overlap several avatars' clicks in any order. It reaches the same scripts and raises the
   * same events as `touch`, whose `hold` it leaves out; advance time to run them.
   */
  press(link: number, opts: Omit<TouchOptions, 'hold'> = {}): void {
    const by = (opts.avatar?.key ?? this.owner).toLowerCase()
    if (this.pressed.has(by)) throw new Error(`press: ${by} is already holding a click`)
    this.pressed.set(by, this.pressClick(link, opts, TOUCH_REPEAT_MS / 2))
    armTouches(this.clock)
    this.drainQueue()
  }

  /** Release the click `avatar` (by default the owner) holds from `press`; advance time to run its events. */
  release(avatar: { readonly key: string } = { key: this.owner }): void {
    const by = avatar.key.toLowerCase()
    const pressed = this.pressed.get(by)
    if (!pressed) throw new Error(`release: ${by} is not holding a click`)
    this.pressed.delete(by)
    this.releaseClick(pressed)
    this.drainQueue()
  }

  private readonly pressed = new Map<string, PressedClick>()

  private pressClick(link: number, opts: Omit<TouchOptions, 'hold'>, firstTouchMs: number): PressedClick {
    const prim =
      this.prims.length === 1 && (link === 0 || link === LINK_ROOT)
        ? this.prims[0]
        : this.prims.find((p) => p.linkNumber === link)
    if (!prim) throw new Error(`touch: no prim with link number ${link}`)
    const root = this.prims[0]!
    for (const s of new Set([...prim.scripts, ...root.scripts])) if (s.running && !s.waitsToStart) s.start()
    const avatar = opts.avatar ?? { key: this.owner, name: '' }
    const by = avatar.key.toLowerCase()
    const detected: DetectedEntry[] = [
      {
        ...avatar,
        linkNumber: prim.linkNumber,
        touchFace: opts.face ?? 0,
        ...(opts.st && { touchST: opts.st }),
        ...(opts.uv && { touchUV: opts.uv }),
        ...(opts.pos && { touchPos: opts.pos }),
        ...(opts.normal && { touchNormal: opts.normal }),
        ...(opts.binormal && { touchBinormal: opts.binormal }),
      },
    ]
    const receivers = touchRoute(prim)
    const clicks = new Map<Script, HeldTouch>()
    const firstAt = this.clock.now + firstTouchMs
    for (const s of receivers.filter(live)) {
      // In-world: a script still holding this avatar's earlier click raised no touch_start. Nor
      // did an LSL script for an avatar's first click while another avatar's click was held,
      // whether its handlers were idle (6 runs of 6) or its touch, touch_start, timer or listen
      // handler slept or spun; SLua raised it. A click pressed while the LSL touch_end handler
      // slept raised it (4 runs of 4, each the avatar's second click in the hold; a first click
      // there needs a third avatar). The avatar's later clicks in that hold raised it, idle
      // (2 runs of 2) or in a listen that slept or spun (8 runs of 8), and its first click in
      // the other avatar's next hold did not (2 runs of 2). An avatar already holding when the
      // other pressed counted as having clicked: its next click raised it (2 runs of 2).
      const held = [...s.heldClicks].some(([k, c]) => k !== by && !c.released && !c.cut)
      const seen = held ? overlapping.get(s) : undefined
      // In-world: i doll's click in a listen's spin, and a second click in the sleep pressed while
      // fivebot held one, raised a touch_start listing fivebot and i doll, LSL and SLua 1 run each.
      const started = s.handlerStartedAt
      const inSpin = (k: string) => pressedInSpin(s, k)
      // In-world: when i doll and then fivebot clicked in the spin and fivebot pressed again in
      // the sleep, i doll's press while fivebot held on joined fivebot's touch_start in SLua,
      // 2 runs of 2, and raised none in LSL, 2 runs of 2.
      const others = [...s.heldClicks.keys()].filter((k) => k !== by && inSpin(k))
      const joinsSpin = !s.busy && inSpin(by) && (!others.length || s.language === 'slua' && others.every((k) => s.heldClicks.get(k)!.pressedBusy === undefined && pressedAgain(s, k) && pressedLater(s, k, by)))
      const first = held && !seen?.has(by) && !joinsSpin
      const crowded = s.language !== 'slua' && s.handlerEvent !== 'touch_end' && first
      if (seen) seen.add(by)
      else overlapping.set(s, new Set([by]))
      // In-world: fivebot's click in a touch_start sleep, while i doll held a click or i doll's
      // touch_end waited, raised its touch_start behind that touch_end, in LSL and SLua.
      // In-world: in SLua, the touch_start of fivebot's first click while i doll held one, in the
      // spin of a listen or a timer callback or the sleep after it, ran behind the touch_end their
      // releases merged into (SLua 8 runs of 8). In a timer that only slept, after a spin in an
      // earlier listen, it ran ahead of that touch_end (2 runs of 2).
      const late = s.handlerEvent === 'touch_start' && (held || waitingTouches(s, 'touch_end', by).other !== undefined) ||
        s.language === 'slua' && !s.heldClicks.size && carriedOnly(s) ||
        (s.language === 'slua' && first && started !== undefined && !s.handlerEvent?.startsWith('touch') && s.spunSince(started) ? 'merged' : false)
      if (!s.heldClicks.has(by) && !crowded) {
        scheduleTouch(s, 'touch_start', detected, late ? { late } : undefined)
      }
      // In-world: fivebot's touches came on the frames of i doll's held click, merged with them,
      // also when i doll's click was stuck from a detach (LSL 2 runs of 2, SLua 1 run).
      const beat = [...s.heldClicks].find(([k, c]) => k !== by && c.repeating && !c.cut)?.[1].dueAt
      const dueAt = beat === undefined ? firstAt : beat > this.clock.now + 1e-6 ? beat : beat + repeatMs(s)
      const presses = s.busy ? busyPresses : idlePresses
      if (!presses.has(s)) presses.set(s, new Map())
      presses.get(s)!.set(by, this.clock.now)
      const afterSpin = held && !s.busy && started !== undefined && s.spunSince(started)
      const click: HeldTouch = { detected, repeating: true, touched: false, released: false, dueAt, ...(s.busy && { pressedBusy: this.clock.now }), ...(afterSpin && { afterSpin }) }
      s.heldClicks.set(by, click)
      clicks.set(s, click)
      repeater(this.clock).scripts.add(s)
    }
    return { prim, by, detected, receivers, clicks, at: this.clock.now }
  }

  /** Release a pressed click and return the scripts it reached. */
  private releaseClick({ prim, by, detected, receivers, clicks, at }: PressedClick): Script[] {
    const held = this.clock.now > at
    // In-world: the release went where a click would have gone at that moment, whatever the
    // pass setting at the click, and its touch_end read the prim's link number then. A click passed to
    // the root while the child's touch scripts had not started, or were stopped, ended in the
    // child once one of them ran; the root got no touch_end and kept getting touch. A click
    // taken by the child's only touch script, stopped or moved to a state with no touch
    // handler before the release, raised touch_end in the root. A child that set PASS_NEVER
    // during a passed click kept the release from the root. A script reached only by the
    // release got touch_end alone, which also ended a click it was still holding.
    // In-world: a map call in touch_end showed the map again after one in touch_start when the
    // click was held, and not when it was a quick click.
    const now = (d: ReadonlyArray<DetectedEntry>) =>
      held || d.some((e) => e.linkNumber !== prim.linkNumber) ? d.map((e) => ({ ...e, linkNumber: prim.linkNumber })) : d
    const released = touchRoute(prim)
    const late = released.filter((s) => !clicks.has(s) || clicks.get(s)!.cut)
    for (const s of late) {
      s.heldClicks.delete(by)
      scheduleTouch(s, 'touch_end', now(detected))
    }
    for (const [s, click] of clicks) {
      if (click.cut || click.released) continue
      if (!live(s) || !released.includes(s)) {
        click.released = true
        continue
      }
      if (s.heldClicks.get(by) === click) s.heldClicks.delete(by)
      // In-world: every click, however short, raised one touch, unless touch_start changed state
      // or the click came and went while the touch handler ran on.
      if (!click.touched && click.repeating && s.handlerEvent !== 'touch') scheduleTouch(s, 'touch', click.detected)
      // Only a press in a busy part of the handler still running counts for the merged touch_end.
      const started = s.handlerStartedAt
      const pressedBusy = started !== undefined && click.pressedBusy !== undefined && click.pressedBusy >= started ? click.pressedBusy : undefined
      scheduleTouch(s, 'touch_end', now(click.detected), { pressedBusy })
    }
    armTouches(this.clock)
    return [...receivers, ...late]
  }

  private globalPosition(prim: Prim): Vector {
    const p = prim.regionPosition()
    if (!this.world) return p
    const corner = this.world.corner(this.region)
    return { x: corner.x + p.x, y: corner.y + p.y, z: p.z }
  }

  /**
   * Advance the shared clock by `ms` and drain every event that becomes
   * due across the linkset, or its whole world, dispatching each to its
   * target script. The clock steps to each
   * event's due time before its handler runs, so handlers see the time the
   * event fired rather than the end of the window. The clock ends exactly
   * `ms` later; a handler sleeping past that stays asleep until a later advance.
   */
  advanceTime(ms: number): void {
    if (ms < 0) throw new Error('cannot advance time backwards')
    const until = this.clock.now + ms
    this.drainQueue(until)
    if (this.clock.now < until) this.clock.now = until
  }

  /**
   * Start `scripts` (by default every script in the object) together, as one frame of a rezzed
   * object does, and finish their state_entry handlers. Each one gets the link messages the
   * others send from state_entry, after its own state_entry. Scripts already started are left
   * alone; a stopped one runs state_entry when it is set running. A script started later, by a
   * later call or by `start()`, misses messages sent before it starts.
   */
  startAll(scripts: Iterable<Script> = this.allScripts()): void {
    const batch = [...scripts]
    if (batch.some(s => s.linkset !== this)) throw new Error('startAll: a script is not in this object')
    const starting = batch.filter(s => !s.hasStarted)
    for (const s of starting) s.queueStart()
    this.settle(starting)
  }

  /**
   * Finish the handlers already active or queued on `scripts`, including
   * their reset/state-change chains, moving the clock on to each wake and to
   * the frame each queued event runs in. Future recurring events do not extend
   * this call indefinitely; tests run those with advanceTime.
   */
  settle(scripts: ReadonlyArray<Script>): void {
    const pending = this.clock.pendingEvents()
    // An event a handler raised waits for a later frame: the call doesn't wait for it.
    const goals = scripts.map(script => ({
      script,
      completed: script.clockView.completedHandlers + Number(script.wakeAt !== undefined) +
        pending.filter(e => e.target === script && e.at <= this.clock.now && script.handles(e.event)).length,
    }))
    this.drainQueue()
    for (;;) {
      let at = Infinity
      const queued = this.clock.nextQueued()
      for (const { script, completed } of goals) {
        // Inventory suspends sleeping detach handlers until the object is worn
        // again. They cannot complete as goals of this settling call.
        // A script whose handler is still on the call stack wakes once that handler returns.
        if (script.running && !script.handling && script.linkset.peers.includes(script.linkset) &&
            script.clockView.completedHandlers < completed) {
          // An idle script runs its next queued event a frame after its last handler ended.
          const due = script.wakeAt ?? queued.get(script)?.due
          if (due !== undefined) at = Math.min(at, due)
        }
      }
      if (at === Infinity) return
      this.drainQueue(at)
    }
  }

  /**
   * Drain due events in chronological order. Each event is delivered to
   * its target script via `script.deliver(event, payload)`. If a handler
   * triggers more events (timers, chained chats, …) they may become due
   * inside this loop and are picked up in the next iteration.
   *
   * Refresh the script roster for each event: a handler may rez or remove
   * an object, changing which scripts can wake on this drain.
   */
  drainQueue(until = this.clock.now): void {
    while (true) {
      flushDamageEvents(this.clock)
      const scripts = this.peers.flatMap((l) => l.allScripts())
      const horizon = Math.max(until, this.clock.now)
      let expiry = Infinity
      for (const linkset of this.peers) {
        if (!linkset.prims[0]?.params.tempOnRez) linkset.expiresAt = undefined
        else {
          linkset.expiresAt ??= this.clock.now + 60000
          expiry = Math.min(expiry, linkset.expiresAt)
        }
      }
      const next = this.clock.takeNextDue(scripts, Math.min(horizon, expiry))
      if (!next) {
        if (expiry > horizon) return
        this.clock.now = Math.max(this.clock.now, expiry)
        for (const linkset of [...this.peers]) {
          if (linkset.expiresAt !== undefined && linkset.expiresAt <= this.clock.now) linkset.remove()
        }
        continue
      }
      if (next.at > this.clock.now) this.clock.now = next.at
      const target = next.target
      if (target.dead) continue
      if (next.event === '__wake') {
        // A simulator task may have detached this object after the clock
        // captured its script roster. Inventory must not resume the handler.
        if (target.linkset.peers.includes(target.linkset)) target.wake()
        continue
      }
      // `__reset` (from llResetOtherScript) was requested while the target
      // was running, so it applies even if the target was stopped since; the
      // target just stays stopped afterward.
      // A held running-state change, such as a start after a stop, reaches a stopped script too.
      if (!target.running && next.event !== '__reset' && next.event !== '__running') {
        // Queued before it stopped: keep it for when the script runs again. A paused script
        // must not block other scripts' events, so we stash on the script
        // itself rather than holding a slot in the linkset queue.
        target.parkedEvents.push({ at: next.at, event: next.event, payload: next.payload })
        continue
      }
      // ResetScriptSignal is caught inside `Script.runHandler`; it never
      // bubbles up to here, so no try/catch is needed.
      target.deliver(next.event, next.payload)
      target.linkset.finishTemporaryDetach()
    }
  }
}

function distanceSquared(a: Vector, b: Vector): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2
}
