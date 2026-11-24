/**
 * Virtual clock + event queue.
 *
 * The clock is the only source of "time" in the VM. Tests advance it
 * explicitly (`vm.advanceTime` / `linkset.advanceTime`); a script in
 * `llSleep` or a builtin delay is suspended until its wake time while the
 * clock runs other scripts' events. Real wall-clock time is never read.
 *
 * The queue is **linkset-wide**, or world-wide for linksets in a `World`:
 * every script shares one `now` and one event queue. Each queued event carries a `target: Script`
 * — the script whose handler will run when the event fires. Per-script
 * state (timer interval, llGetTime reference) lives on `ScriptClockView`,
 * a thin facade exposed to builtins as `ctx.state.clock`.
 */
import type { Script } from './script.js'

export interface QueuedEvent {
  /** Virtual ms timestamp at which this event becomes ready to fire. */
  readonly at: number
  /** Script whose handler is invoked when the event fires. */
  readonly target: Script
  readonly event: string
  readonly payload: Record<string, unknown>
  /** Set on an event that was queued again: whether it was held back for a sleeping handler. */
  readonly held?: boolean
  /** Came up while the handler was busy, or held back as then: released in the order it came up. */
  readonly busy?: boolean
}

/**
 * Events Second Life holds back while a handler sleeps. When the handler wakes or ends they go
 * behind the events that waited for it, in this order, whatever order they came up in. Events
 * of one rank keep the order they came up in.
 */
const HELD_ORDER: ReadonlyMap<string, number> = new Map([
  ['timer', 0], ['sensor', 1], ['no_sensor', 1],
  ['at_target', 2], ['not_at_target', 2], ['at_rot_target', 2], ['not_at_rot_target', 2],
  // In-world: land_collision_start ran ahead of a collision_start that came up before it.
  ['land_collision_start', 2.5], ['collision_start', 3], ['collision', 3],
  ['touch_start', 4], ['touch', 5], ['touch_end', 6], ['changed', 7], ['__unseated', 7], ['__ownerChanged', 7],
  // In-world: game_control ran after a touch, a stand's changed and collision_start and before
  // collision_end, whichever came first.
  ['game_control', 8],
  ['collision_end', 9], ['land_collision', 9], ['land_collision_end', 9],
])

/** Changes to running state held from the rest of a handler that was busy at a detach; they take no event slot. */
export const HELD_CONTROL: ReadonlySet<string> = new Set(['__running', '__scriptState'])

/** `changed` and the events a rez raises that run as `changed`. */
const CHANGED_EVENTS: ReadonlySet<string> = new Set(['changed', '__unseated', '__ownerChanged'])

type TouchKind = 'touch_start' | 'touch' | 'touch_end'
const TOUCH_KINDS: ReadonlyArray<TouchKind> = ['touch_start', 'touch', 'touch_end']
interface DetectedTouch { readonly key?: string }

/**
 * Merge events that wait together: held back in a sleep, or behind llMinEventDelay.
 *
 * In-world: three clicks by one avatar on faces 0, 2 and 4 while a handler slept gave one
 * touch_start that read face 0, and one touch and one touch_end that read face 4. A click
 * made while only the touch_end of the click before it was held back changed that touch_end
 * and added nothing. Clicks by i doll, fivebot and i doll in one sleep gave one touch_start(2)
 * listing them in the order of each one's first click, and one touch(2) and one touch_end(2)
 * in the order of each one's last click. A colour change, an item dropped into the prim, and
 * a sit and a stand gave one changed(35). `held` is in the order the events came up; the
 * touch events become one event of each kind, in that order, where the first of them was,
 * and an event that merges into an earlier one takes its place.
 *
 * In-world: a prim dropped onto the platform twice in one sleep gave one collision_start, one
 * collision and one collision_end, each detecting the platform once. Dropped onto the platform
 * and then onto another prim gave one of each listing both, in the order they were first hit.
 * A collision event merges into the first held one of its kind, and a key it detects again
 * takes the place of the earlier entry: the other prim, moved between the drops, read where
 * it was for the second.
 */
function mergeHeld(held: ReadonlyArray<QueuedEvent>): QueuedEvent[] {
  const merged: QueuedEvent[] = []
  const land = new Map<string, number>()
  const parts: { kind: TouchKind; entry: DetectedTouch; at: number; seq: number }[] = []
  const collisions = new Map<string, number>()
  let changed: number | undefined
  let touches: number | undefined
  let gameControl: number | undefined
  let landEnd: number | undefined
  for (const e of held) {
    // In-world: a release and a new press sent while the handler slept gave one game_control,
    // for the press.
    if (e.event === 'game_control') {
      if (gameControl === undefined) gameControl = merged.push(e) - 1
      else merged[gameControl] = { ...merged[gameControl]!, payload: e.payload }
      continue
    }
    if (CHANGED_EVENTS.has(e.event)) {
      if (changed === undefined) changed = merged.push(e) - 1
      else {
        // The event a rez raises keeps its name: it runs after attach.
        const first = merged[changed]!
        merged[changed] = {
          ...first,
          event: e.event === 'changed' ? first.event : e.event,
          payload: { changes: (first.payload['changes'] as number) | (e.payload['changes'] as number) },
        }
      }
      continue
    }
    if (LAND_EVENTS.has(e.event)) {
      // The end kept is the last contact's; a contact that starts after it marks it as reopened.
      if (landEnd !== undefined && e.event !== 'land_collision') {
        const end = merged[landEnd]!
        merged[landEnd] = e.event === 'land_collision_end' ? e : { ...end, payload: { ...end.payload, [REOPENED]: true } }
      }
      const kept = land.get(e.event) ?? 0
      if (kept < (e.event === 'land_collision' ? HELD_LAND_COLLISIONS : 1)) {
        land.set(e.event, kept + 1)
        if (e.event === 'land_collision_end') landEnd = merged.length
        merged.push(e)
      }
      continue
    }
    const detected = e.payload['detected'] as ReadonlyArray<DetectedTouch> | undefined
    const keyed = !!detected?.length && detected.every((entry) => entry.key !== undefined)
    if (COLLISION_EVENTS.has(e.event) && keyed) {
      const at = collisions.get(e.event)
      if (at === undefined) {
        collisions.set(e.event, merged.push(e) - 1)
        continue
      }
      const first = merged[at]!
      const entries = [...first.payload['detected'] as DetectedTouch[]]
      for (const entry of detected!) {
        const same = entries.findIndex((x) => x.key!.toLowerCase() === entry.key!.toLowerCase())
        if (same < 0) entries.push(entry)
        else entries[same] = entry
      }
      merged[at] = { ...first, payload: { ...first.payload, num_detected: entries.length, detected: entries } }
      continue
    }
    if (!TOUCH_EVENTS.has(e.event) || !keyed) {
      merged.push(e)
      continue
    }
    touches ??= merged.push(e) - 1
    // When each click came up; an event merged before carries its clicks' own times.
    const arrived = e.payload['__at'] as ReadonlyArray<number> | undefined
    detected.forEach((entry, i) => parts.push({ kind: e.event as TouchKind, entry, at: arrived?.[i] ?? e.at, seq: parts.length }))
  }
  if (touches === undefined) return merged
  const clicks = new Map<string, Partial<Record<TouchKind, (typeof parts)[number]>>>()
  // The rules follow the order the events are in; the times only order each merged event's list.
  for (const part of parts) {
    const by = part.entry.key!.toLowerCase()
    const click = clicks.get(by) ?? {}
    clicks.set(by, click)
    if (part.kind === 'touch_start') {
      if (!click.touch_start && !click.touch && !click.touch_end) click.touch_start = part
    } else if (part.kind === 'touch_end' || click.touch || !click.touch_end) click[part.kind] = part
  }
  const first = merged[touches]!
  const group = TOUCH_KINDS.flatMap((kind): QueuedEvent[] => {
    const kept = [...clicks.values()].flatMap((click) => click[kind] ?? []).sort((x, y) => x.at - y.at || x.seq - y.seq)
    if (!kept.length) return []
    const payload = { num_detected: kept.length, detected: kept.map((p) => p.entry), __at: kept.map((p) => p.at) }
    return [{ ...first, at: Math.min(...kept.map((p) => p.at)), event: kind, payload }]
  })
  merged.splice(touches, 1, ...group)
  return merged
}

const TOUCH_EVENTS: ReadonlySet<string> = new Set(['touch_start', 'touch', 'touch_end'])
const SENSOR_EVENTS: ReadonlySet<string> = new Set(['sensor', 'no_sensor'])

/** The kind an event is merged and held back by. */
const heldKind = (event: string) => CHANGED_EVENTS.has(event) ? 'changed' : event === 'no_sensor' ? 'sensor' : event

/**
 * Events a busy handler holds back, as a sleep does, when one of their kind already waits for
 * it; the others, and the first of each kind, wait in the order they came up. Held events are
 * released behind them, also in the order they came up. In-world, a handler that spun in a loop
 * got two changed events for two or three drops or gifts, the first click whole and the later
 * clicks merged, two timer events for one to seven ticks, two sensor events for four scans and
 * two changed events for two colour changes, or for a drop and a colour change.
 */
const BUSY_HELD: ReadonlySet<string> = new Set([...CHANGED_EVENTS, ...TOUCH_EVENTS, 'timer', ...SENSOR_EVENTS,
  'collision', 'collision_end', 'game_control'])

/**
 * Events a busy handler drops when one of their kind already waits for it. In-world, a second
 * contact with the platform gave no collision_start of its own, a second contact with land no
 * land collision events at all, and a target crossed and left, or reached, gave only the
 * not_at_target or not_at_rot_target that waited from before.
 */
const BUSY_DROPPED: ReadonlySet<string> = new Set(['collision_start', 'land_collision_start', 'land_collision', 'land_collision_end',
  'at_target', 'not_at_target', 'at_rot_target', 'not_at_rot_target'])

/**
 * The kind a busy handler holds back or drops an event by. In-world, a collision_end that came
 * up while the contact's first collision waited was held back with the later collision events,
 * so a collision_end also waits behind a collision.
 */
function busyKind(event: string): string {
  if (event === 'not_at_target') return 'at_target'
  if (event === 'not_at_rot_target') return 'at_rot_target'
  return heldKind(event)
}
const COLLISION_EVENTS: ReadonlySet<string> = new Set(['collision_start', 'collision', 'collision_end'])

/**
 * In-world: a box dropped onto bare land once or twice in sleeps of 6, 10 and 16 s, six runs,
 * got one land_collision_start and one land_collision_end each time, and four land_collision in
 * five of them (one in the other), where a drop without the sleep gave about 27. Every one read
 * the box's position when it ran, back where it had been lifted to, not where it touched down.
 */
const LAND_EVENTS: ReadonlySet<string> = new Set(['land_collision_start', 'land_collision', 'land_collision_end'])
const HELD_LAND_COLLISIONS = 4
/** Marks a held land_collision_end whose object touched the land again after it. */
const REOPENED = '__reopened'

/**
 * Held land events released together, carried in their payload's `__here`: the script's events
 * taken by then, and how many land_collision ran. A copy of the script keeps its own count.
 */
interface LandTail {
  readonly script: Script; readonly since: number; limit?: number; ran: number; dropped: number
  readonly copies: WeakMap<Script, LandTail>
}

function landTailOf(tail: LandTail, script: Script): LandTail {
  if (tail.script === script) return tail
  let copy = tail.copies.get(script)
  if (!copy) tail.copies.set(script, copy = { script, since: 0, ran: 0, dropped: 0, copies: tail.copies })
  return copy
}

/** Events that wait behind one llMinEventDelay holds back. */
const WAITS_BEHIND: ReadonlySet<string> = new Set([...TOUCH_EVENTS, 'timer'])

/**
 * Events llMinEventDelay spaces out; other events are not delayed. In-world: with
 * llMinEventDelay(4.0) and a 1 s repeating sensor, sensor events ran 4, 8 and 12 s after the
 * call, and a timer due at 16 s waited behind a no_sensor that ran 15.1 s in under a 3 s delay.
 */
export const DELAYED_EVENTS: ReadonlySet<string> = new Set(['timer', 'touch_start', 'sensor', 'no_sensor'])

/** Events a script can hold in its queue; more are dropped, as in Second Life. */
export const MAX_PENDING_EVENTS = 64

/** When llMinEventDelay lets a queued event run, or 0 when it doesn't delay it. */
function delayedUntil(e: QueuedEvent): number {
  const v = e.target.clockView
  if (DELAYED_EVENTS.has(e.event)) return v.delayedUntilMs
  return e.event === 'touch' ? v.touchDelayUntil() : 0
}

/** Linkset-wide clock. One instance per Linkset. */
export class LinksetClock {
  /** Virtual milliseconds since linkset construction. Strictly monotonic. */
  private time = 0
  private readonly timeListeners = new Set<(now: number) => void>()

  get now(): number { return this.time }
  set now(value: number) {
    this.time = value
    for (const update of this.timeListeners) update(value)
  }

  /** Continuous simulator properties update before scripts observe the new time. */
  onAdvance(update: (now: number) => void): () => void {
    this.timeListeners.add(update)
    return () => { this.timeListeners.delete(update) }
  }

  /** @param startUnixTime Unix time in seconds when `now` is 0. */
  constructor(readonly startUnixTime = 0) {}

  /** Wall-clock time in microseconds since the Unix epoch, floored. */
  unixMicros(): number {
    return Math.floor(this.startUnixTime * 1e6 + this.now * 1000)
  }

  private readonly tasks = new Set<{ target: Pick<Script, 'dead'>; at: number; run: () => void; afterEvents: boolean }>()

  /**
   * Simulator work follows its target's lifetime, even while script handlers
   * sleep. It runs before the events due at the same instant, or after them
   * with `afterEvents`.
   */
  scheduleTask(target: Pick<Script, 'dead'>, at: number, run: () => void, afterEvents = false): () => void {
    const task = { target, at, run, afterEvents }
    this.tasks.add(task)
    return () => { this.tasks.delete(task) }
  }

  /** The last change in motion each script in a handler has not been told of yet. */
  private readonly unseenMoving = new Map<Script, (at: number) => void>()

  /**
   * Keep a change in its object's motion from `script` while it is in a handler; `settle`
   * runs when the script wakes or its handler ends. A later change replaces it.
   */
  holdMoving(script: Script, settle: (at: number) => void): void {
    this.unseenMoving.set(script, settle)
  }

  private settleMoving(script: Script, at: number): void {
    const settle = this.unseenMoving.get(script)
    if (!settle) return
    this.unseenMoving.delete(script)
    if (!script.dead) settle(at)
  }

  private readonly queue: QueuedEvent[] = []

  /**
   * Schedule a one-shot event on `target`'s handler at virtual time `at`.
   * A stopped or crashed script never gets an event raised while it is down;
   * the events it already held wait for it. A script holds at most
   * MAX_PENDING_EVENTS queued events, counting those waiting while it is
   * stopped; further events are dropped. Pass `held` to queue again an event
   * that was waiting, with what `heldBack` said of it.
   */
  schedule(target: Script, at: number, event: string, payload: Record<string, unknown> = {}, held?: boolean): void {
    if (event !== '__reset' && !target.running) return
    // Due now, in the middle of a sleep: held back even at the instant the handler began.
    const wakeAt = target.wakeAt
    // A busy handler holds events back until it sleeps or ends, also those it raises itself.
    let busy = false
    if (held === undefined && at <= this.now) {
      if (target.busy) {
        if (BUSY_DROPPED.has(event) && this.waitsFor(target, event)) return
        held = busy = BUSY_HELD.has(event) && this.waitsFor(target, event)
      } else if (wakeAt !== undefined && wakeAt > this.now) {
        held = true
        // In-world: in the sleep of a handler that was busy first, a click or a change whose kind
        // waited from the busy part kept the order it came up in, as one held while busy does.
        busy = BUSY_HELD.has(event) && this.waitsFor(target, event, target.handlerStartedAt)
      }
    }
    held &&= HELD_ORDER.has(event)
    const queued: QueuedEvent = { at, target, event, payload, ...(held !== undefined && { held }), ...((target.busy && at <= Math.max(wakeAt ?? 0, this.now) || held && busy) && { busy: true }) }
    // In-world: a release in the first sleep of a game_control handler and a press in its second
    // gave one event, for the press. A release that waited from a listen handler's sleep and a
    // press in the sleep of the touch_start handler that ran next gave two. The first input of a
    // handler that was busy kept its place and its values through the sleep that followed.
    if (held && event === 'game_control') {
      const since = target.handlerStartedAt
      const waiting = this.queue.findIndex((e) => e.target === target && e.event === event && !(e.busy && e.held === false) && e.payload['heldFor'] === since && e.at <= this.now)
      if (waiting >= 0) {
        this.queue[waiting] = { ...this.queue[waiting]!, payload }
        return
      }
    }
    if (held && at <= this.now) {
      // A click or a change that merges into one already held back takes no room of its own.
      if (this.mergeWaiting(target, this.queue.filter((e) => e.target === target && e.held && e.at <= this.now), queued)) return
    }
    if (event !== '__reset' && !HELD_CONTROL.has(event) && this.full(target)) return
    this.queue.push(queued)
  }

  /** Whether `target` holds as many queued events as it can. */
  private full(target: Script): boolean {
    let pending = target.parkedEvents.filter(e => !HELD_CONTROL.has(e.event)).length
    for (const e of this.queue) if (e.target === target && !HELD_CONTROL.has(e.event)) pending++
    return pending >= MAX_PENDING_EVENTS
  }

  /** Whether an event of `event`'s kind waits for `target`; with `since`, one that came up while busy after it. */
  private waitsFor(target: Script, event: string, since?: number): boolean {
    const kinds = event === 'collision_end' ? ['collision', 'collision_end'] : [busyKind(event)]
    return this.queue.some((e) => e.target === target && !e.held && e.at <= this.now && (since === undefined || e.at > since && e.busy === true)
      && kinds.includes(busyKind(e.event)))
  }

  /**
   * Queue a touch event. Under llMinEventDelay touch events that wait merge as clicks held back
   * in a sleep do. In-world, with llMinEventDelay(1.0) or (2.0), two or three 0.1 s clicks by
   * one avatar on faces 1, 2 and 3 in a row gave touch_start and touch reading face 1, then one
   * touch and one touch_end reading the last face, a full delay after touch_start. A 0.1 s
   * click by i doll and then one by fivebot gave i doll's touch_start and touch, then a delay
   * later fivebot's touch_start(1), and touch(2) and touch_end(2) listing both by last click.
   */
  scheduleTouch(target: Script, event: string, payload: Record<string, unknown>): void {
    // A sleeping script's events go through the sleep's own merge in schedule().
    if (target.clockView.minEventDelayMs > 0 && target.running && target.wakeAt === undefined) {
      const before = this.queue.filter((e) => e.target === target && !e.held && TOUCH_EVENTS.has(e.event))
      if (this.mergeWaiting(target, before, { at: this.now, target, event, payload })) return
    }
    this.schedule(target, this.now, event, payload)
  }

  /**
   * Merge `queued` into the events `before` that wait for `target`, in place of the first of
   * them. Returns false, leaving the queue alone, when nothing waits; and drops the event when
   * the merge needs room the target's queue has run out of.
   */
  private mergeWaiting(target: Script, before: ReadonlyArray<QueuedEvent>, queued: QueuedEvent): boolean {
    if (!before.length) return false
    const after = mergeHeld([...before, queued])
    if (after.length > before.length) {
      let pending = target.parkedEvents.filter(e => !HELD_CONTROL.has(e.event)).length
      for (const e of this.queue) if (e.target === target && !HELD_CONTROL.has(e.event)) pending++
      if (pending + after.length - before.length > MAX_PENDING_EVENTS) return true
    }
    const at = this.queue.indexOf(before[0]!)
    for (const e of before) this.queue.splice(this.queue.indexOf(e), 1)
    this.queue.splice(at, 0, ...after)
    return true
  }

  /** Remove the queued events that `match`, leaving the others as they are. */
  purgeWhere(match: (e: QueuedEvent) => boolean): void {
    for (let i = this.queue.length - 1; i >= 0; i--) if (match(this.queue[i]!)) this.queue.splice(i, 1)
  }

  /**
   * Whether a waiting event is held back for its target's handler, which began at `since`:
   * an event of a held kind that fell due after the handler began.
   */
  heldBack(e: QueuedEvent, since: number | undefined): boolean {
    return HELD_ORDER.has(e.event) && (e.held ?? (since !== undefined && e.at > since))
  }

  /** Whether `target` has a queued `event` that has not been delivered yet. */
  hasPending(target: Script, event: string): boolean {
    return this.queue.some((e) => e.target === target && e.event === event)
  }

  /** Move the clock forward unconditionally; does not drain queues. */
  advance(ms: number): void {
    if (ms < 0) throw new Error('cannot advance time backwards')
    this.now += ms
  }

  /**
   * Pop and return the next due event (`at <= horizon`, default `now`) considering all queued
   * one-shots, every script's recurring timer and every sleeping script's wake
   * (a synthetic `__wake` event). Returns `null` when no event is ready. A
   * sleeping script gets no events but `__reset` until it finishes, and wakes
   * at its wake time or, if paused past it, on resume. At the same instant a
   * queued event comes first, then a timer, then a wake.
   *
   * Recurring timers fire once per script per interval; their next fire
   * timestamp is advanced by `at + interval` (not `now + interval`) so that
   * long advances catch up on every missed fire. Ticks that fall due while
   * the script is busy (e.g. in llSleep) collapse into one event delivered
   * when it finishes. The next keeps the schedule if that is still ahead, and
   * otherwise the interval restarts from there.
   *
   * Under llMinEventDelay, a timer or touch_start waits until the delay since
   * the last of them has passed, and a held click's touch until its own delay has;
   * the touch events queued behind one that waits wait too.
   */
  takeNextDue(scripts: ReadonlyArray<Script>, horizon = this.now): QueuedEvent | null {
    for (;;) {
      let next = this.takeNextEventOrTask(scripts, horizon)
      if (next && next !== 'task' && this.owesLandStart(next.target, next.event)) {
        this.queue.unshift(next)
        next = { ...next, event: 'land_collision_start' }
      }
      if (next !== 'task' && !(next && this.dropsLandCollision(next))) return next
    }
  }

  /** Events each script has run, other than land_collision_start, and the wakes of its handlers. */
  private readonly ran = new WeakMap<Script, number>()
  /** The released contact still going on, by script: its live land_collision events to drop. */
  private readonly openContacts = new WeakMap<Script, LandTail>()
  /** Scripts whose last land event taken was not a land_collision_end. */
  private readonly onLand = new WeakSet<Script>()
  /** Scripts reset during a land contact, owed a land_collision_start ahead of its next land_collision. */
  private readonly restarted = new WeakSet<Script>()

  /**
   * Whether `e`, just taken, is a land_collision the script doesn't get. In-world, a held
   * contact's land_collision events ran one per physics step in about 0.2 s after the wake, so
   * the events that ran first left room for fewer of them: four, one fewer for every two events
   * ahead of them, at least one. A handler that slept ahead of them cut one, as its wake counts
   * as an event here. When the contact went on past the wake, the next live land_collision
   * events, one more than the held ones that ran, gave nothing. A copy rezzed from an object
   * taken while they waited counts its own events from the rez: in-world it ran on_rez, then
   * four, three or one land_collision as two link messages, six, or none waited with them.
   */
  private dropsLandCollision(e: QueuedEvent): boolean {
    // A stopped script keeps the event for when it runs again; it is judged then.
    if (!e.target.running) return false
    const before = this.ran.get(e.target)
    const ran = before ?? 0
    // A copy taken asleep starts counting at the wake of the handler it was taken in. An event
    // with no handler never runs.
    const counts = e.event === '__wake' ? before !== undefined
      : e.event !== 'land_collision_start' && e.target.handles(CHANGED_EVENTS.has(e.event) ? 'changed' : e.event)
    this.ran.set(e.target, ran + (counts ? 1 : 0))
    this.landEventCame(e.target, e.event)
    const released = e.payload['__here'] as LandTail | true | undefined
    const tail = typeof released === 'object' ? landTailOf(released, e.target) : undefined
    if (!tail) return this.dropsLiveLandEvent(e.target, e.event)
    if (e.event !== 'land_collision') {
      this.restarted.delete(e.target)
      return false
    }
    tail.limit ??= Math.max(1, HELD_LAND_COLLISIONS - Math.floor((ran - tail.since) / 2))
    if (tail.ran >= tail.limit) return true
    tail.ran++
    return false
  }

  /**
   * Whether a live land event of `script`, one that wasn't held, gives nothing: a land_collision
   * of a contact whose held land_collision events ran at the wake, until one more has come than
   * those. Another land_collision_start or a land_collision_end ends the contact.
   */
  dropsLiveLandEvent(script: Script, event: string): boolean {
    if (event !== 'land_collision') {
      if (LAND_EVENTS.has(event)) {
        this.openContacts.delete(script)
        this.restarted.delete(script)
      }
      return false
    }
    const open = this.openContacts.get(script)
    if (!open?.ran || open.ran + 1 <= open.dropped) return false
    open.dropped++
    return true
  }

  /** A land event of `script` was taken from the queue or given to it at once. */
  landEventCame(script: Script, event: string): void {
    if (event === 'land_collision_end') this.onLand.delete(script)
    else if (LAND_EVENTS.has(event)) this.onLand.add(script)
  }

  /**
   * A reset or state change of `script`. Either ends the drop of the live land_collision events
   * of a contact whose held ones ran. In-world, a script reset during a land contact got a new
   * land_collision_start at the next physics step, then every land_collision; a script that
   * changed state got every land_collision and no new start.
   */
  landContactRestarted(script: Script, reset: boolean): void {
    this.openContacts.delete(script)
    // In-world: a script reset while it slept through the start of a contact got the new start
    // too. Land events due but not taken yet count; ones still to come don't.
    const due = this.queue.filter((e) => e.target === script && e.at <= this.now && LAND_EVENTS.has(e.event))
      .reduce<QueuedEvent | undefined>((last, e) => !last || e.at >= last.at ? e : last, undefined)
    // A held end that a later contact reopened isn't the end of the contact going on.
    if (due) this.landEventCame(script, due.payload[REOPENED] ? 'land_collision' : due.event)
    if (reset && this.onLand.has(script)) this.restarted.add(script)
  }

  /** Whether `event`, about to run, is the first land_collision of `script` since a reset during the contact. */
  owesLandStart(script: Script, event: string): boolean {
    if (event !== 'land_collision' || !this.restarted.has(script)) return false
    this.restarted.delete(script)
    return true
  }

  private takeNextEventOrTask(scripts: ReadonlyArray<Script>, horizon: number): QueuedEvent | 'task' | null {
    for (const script of this.unseenMoving.keys()) {
      if (!script.handling && script.wakeAt === undefined) this.settleMoving(script, this.now)
    }
    // The first event of a script that llMinEventDelay holds back, and when it may run: the
    // events queued behind it wait for it.
    const heldFrom = new Map<Script, { index: number; until: number }>()
    for (let i = 0; i < this.queue.length; i++) {
      const e = this.queue[i]!
      const until = delayedUntil(e)
      if (until > e.at && WAITS_BEHIND.has(e.event) && !heldFrom.has(e.target)) heldFrom.set(e.target, { index: i, until })
    }
    let bestIdx = -1
    let bestAt = Infinity
    for (let i = 0; i < this.queue.length; i++) {
      const e = this.queue[i]!
      const v = e.target.clockView
      // An event that waited for its target's handler is due when that handler finished.
      let due = Math.max(e.at, v.busyUntilMs)
      const held = heldFrom.get(e.target)
      // In-world: a link message sent while a touch_start waited for llMinEventDelay ran at once,
      // and the click's touch and touch_end waited behind the touch_start.
      if (e.event !== '__reset') due = Math.max(due, delayedUntil(e), held && i >= held.index && WAITS_BEHIND.has(e.event) ? held.until : 0)
      if (due <= horizon && due < bestAt && !e.target.handling &&
          (e.event === '__reset' || (e.event === '__running' && !e.target.running) ||
            (e.target.wakeAt === undefined && !e.target.detachedInHandler))) {
        bestAt = due
        bestIdx = i
      }
    }
    let bestTimerScript: Script | null = null
    let bestTimerAt = Infinity
    let waking: Script | null = null
    let wakeAt = Infinity
    // In-world: the first tick that fell due while a handler was busy waited where it came up, and
    // the later ones gave one event that ran where the last of them came up among the held events.
    let ticking: Script | null = null
    let tickAt = Infinity
    for (const s of scripts) {
      // Per LSL: dead and stopped scripts don't generate timer events. Skip
      // their timer state so we don't waste catch-up iterations or accumulate
      // back-logged events that flood the script on resume.
      if (s.dead || !s.running || s.handling) continue
      const w = s.wakeAt === undefined ? undefined : Math.max(s.wakeAt, this.now)
      if (w !== undefined) {
        if (w <= horizon && w < wakeAt) {
          wakeAt = w
          waking = s
        }
        const tick = Math.max(s.clockView.timerNextFireMs, this.now)
        if (s.busy && s.clockView.timerIntervalMs > 0 && tick <= w && tick <= horizon && tick < tickAt && (!this.full(s) || this.queue.some((e) => e.target === s && e.event === 'timer' && e.held))) {
          tickAt = tick
          ticking = s
        }
        continue
      }
      const v = s.clockView
      if (v.timerIntervalMs > 0 && v.timerNextFireMs <= horizon) {
        const due = Math.max(v.timerNextFireMs, v.busyUntilMs, v.delayedUntilMs)
        if (due <= horizon && due < bestTimerAt) {
          bestTimerAt = due
          bestTimerScript = s
        }
      }
    }

    const nextEvent = Math.min(bestAt, bestTimerAt, wakeAt)
    let task: { target: Pick<Script, 'dead'>; at: number; run: () => void; afterEvents: boolean } | undefined
    for (const candidate of this.tasks) {
      if (candidate.target.dead) { this.tasks.delete(candidate); continue }
      if (candidate.afterEvents && nextEvent <= Math.max(candidate.at, this.now)) continue
      if (candidate.at <= horizon && (!task || candidate.at < task.at)) task = candidate
    }
    if (ticking && tickAt <= nextEvent && (!task || tickAt < task.at)) {
      this.now = tickAt
      this.purgeWhere((e) => e.target === ticking && e.event === 'timer' && e.held === true)
      this.schedule(ticking, tickAt, 'timer')
      ticking.clockView.timerFired(tickAt)
      return 'task'
    }
    if (task && task.at <= nextEvent) {
      this.tasks.delete(task)
      this.now = Math.max(this.now, task.at)
      task.run()
      return 'task'
    }

    // In-world: a sensor result and a timer tick of one script that fell due together ran the
    // timer first, also when both waited for llMinEventDelay.
    const waiting = bestIdx === -1 ? undefined : this.queue[bestIdx]!
    const own = waiting && SENSOR_EVENTS.has(waiting.event) ? waiting.target : undefined
    const ownTimer = own?.clockView
    const sensorWaits = !!own?.running && !!ownTimer && ownTimer.timerIntervalMs > 0 && bestAt <= bestTimerAt &&
      (bestAt === ownTimer.delayedUntilMs || waiting!.at === ownTimer.timerNextFireMs) &&
      bestAt === Math.max(ownTimer.timerNextFireMs, ownTimer.busyUntilMs, ownTimer.delayedUntilMs)
    if (sensorWaits) {
      bestTimerScript = own
      bestTimerAt = bestAt
    }
    if (bestIdx !== -1 && bestAt <= bestTimerAt && !sensorWaits && bestAt <= wakeAt) {
      const ev = this.queue[bestIdx]!
      this.queue.splice(bestIdx, 1)
      const at = Math.max(bestAt, this.now)
      const due = ev.payload['__due']
      const tv = ev.target.clockView
      if (ev.event === 'timer' && typeof due === 'number') {
        const passed = ev.payload['__passedAt']
        const interval = ev.payload['__interval']
        // In-world: a held tick that a call let run after more than one interval left no lag.
        const once = typeof interval !== 'number' || due + interval > at
        tv.timerLate(once ? (typeof passed === 'number' ? passed : at) - due : 0)
      } else {
        // In-world: a tick that waited behind another handler had the lag it had when that handler started.
        if (tv.timerIntervalMs > 0 && tv.timerNextFireMs <= bestAt) tv.timerPassedAt ??= at
        for (const e of this.queue) {
          if (e.target === ev.target && e.event === 'timer' && typeof e.payload['__due'] === 'number' && e.at <= bestAt) e.payload['__passedAt'] ??= at
        }
      }
      return bestAt > ev.at ? { ...ev, at: bestAt } : ev
    }
    if (bestTimerScript && bestTimerAt <= wakeAt) {
      const at = bestTimerAt
      const v = bestTimerScript.clockView
      // A tick held back while the script was down keeps the old schedule if that is still ahead.
      v.timerFired(at)
      return { at, target: bestTimerScript, event: 'timer', payload: {} }
    }
    if (waking) this.settleMoving(waking, wakeAt)
    return waking && { at: wakeAt, target: waking, event: '__wake', payload: {} }
  }

  /** Snapshot of the pending one-shot queue. Read-only; for inspection/tests. */
  pendingEvents(): readonly QueuedEvent[] {
    return this.queue.slice()
  }

  /**
   * Move `script`'s events that are due by now behind every other queued
   * event, in their order. Called when a handler that took time finishes,
   * so the events that waited for it follow other scripts' events at that
   * instant. The events held back since it began, at `since`, follow the
   * others, with a timer tick that fell due ahead of them.
   */
  requeue(script: Script, since: number): void {
    const waited = this.queue.filter((e) => e.target === script && e.at <= this.now)
    this.purgeTarget(script, this.now)
    const plain = ({ at, target, event, payload }: QueuedEvent): QueuedEvent => ({ at, target, event, payload })
    this.queue.push(...waited.filter((e) => !this.heldBack(e, since)).map(plain))
    this.release(script, waited.filter((e) => this.heldBack(e, since)), false)
  }

  /**
   * When a handler wakes in its middle, the events held back so far join the queue, except
   * those of a kind that an earlier wake released and that still waits: those stay held back
   * until the handler ends. In-world, a colour change in each of three sleeps gave two
   * changed events, and changes held in the first sleep ran ahead of chat from the second.
   * A sensor result is one kind: a no_sensor held in a second sleep stayed held while the
   * sensor event released at the first wake waited.
   */
  releaseAtWake(script: Script, since: number): void {
    const kind = (e: QueuedEvent) => heldKind(e.event)
    const waited = this.queue.filter((e) => e.target === script && e.at <= this.now)
    const waiting = new Set(waited.filter((e) => HELD_ORDER.has(e.event) && !this.heldBack(e, since)).map(kind))
    const held = waited.filter((e) => this.heldBack(e, since) && !waiting.has(kind(e)))
    if (!held.length) return
    this.purgeWhere((e) => held.includes(e))
    this.release(script, held, waiting.has('timer'))
  }

  /** Queue held-back events behind the others, merged and in the held order. */
  private release(script: Script, events: QueuedEvent[], timerWaits: boolean): void {
    // In-world: a handler busy and then asleep ran what it held in the sleep in the held order, a
    // change held in the busy part among them, unless all of it was held as when busy.
    const inOrder = events.every((e) => e.busy)
    const merged = mergeHeld(events.sort((a, b) => a.at - b.at))
    // The contact goes on past the wake when no end of it was held.
    const open = !merged.some((e) => e.event === 'land_collision_end' && !e.payload[REOPENED])
    const held = merged.filter((e) => !e.payload[REOPENED])
      .map(({ at, target, event, payload }): QueuedEvent => ({ at, target, event, held: false,
        payload: LAND_EVENTS.has(event) ? { ...payload, __here: true } : payload }))
    const lands = held.filter((e) => e.event === 'land_collision')
    if (lands.length) {
      const tail: LandTail = { script, since: this.ran.get(script) ?? 0, ran: 0, dropped: 0, copies: new WeakMap() }
      for (const e of held) if (LAND_EVENTS.has(e.event)) e.payload['__here'] = tail
      if (open) this.openContacts.set(script, tail)
      else this.openContacts.delete(script)
    }
    const v = script.clockView
    // In-world: a 3 s timer, a click in each of two 8 s sleeps in a row -> timer, the first
    // click, timer, the second click. The ticks that fell due during one sleep give one event,
    // released with the other held events. With nothing else held the tick is left to
    // takeNextDue, which gives one tick after several sleeps, as measured on the main grid.
    let pending = script.parkedEvents.length + events.length
    for (const e of this.queue) if (e.target === script) pending++
    // In-world: a 1 s timer through a handler busy for 6 s and then asleep for 6 s gave two timer
    // events: the tick held in the busy part stands for those in the sleep.
    const busyTick = events.some((e) => e.busy && e.event === 'timer')
    if (held.length && pending < MAX_PENDING_EVENTS && script.running && v.timerIntervalMs > 0 && v.timerNextFireMs <= this.now &&
        !timerWaits && (busyTick || !held.some((e) => e.event === 'timer'))) {
      if (!busyTick) held.push({ at: this.now, target: script, event: 'timer', payload: {}, held: false })
      // As in takeNextDue: an overdue tick keeps the old schedule if that is still ahead.
      // In-world: its lag is how late it was at the wake, even when another handler held it longer.
      v.timerFired(this.now)
    }
    // In-world: a box that fell onto land and was lifted off it while asleep woke to
    // land_collision_start, one land_collision, the game_control that waited, the other
    // land_collision events and land_collision_end. A box that slid down a prim onto land woke to
    // land_collision_start, collision_start, collision, one land_collision, the game_control, a
    // second land_collision and collision_end: six of eight runs over two probes, three of them
    // with collision_end come before the land contact. A single land_collision ran behind changed.
    const rank = (e: QueuedEvent) => e === lands[0] ? HELD_ORDER.get('changed')! + 0.5
      : e === lands[1] ? HELD_ORDER.get('game_control')! + 0.5 : HELD_ORDER.get(e.event)!
    if (!inOrder) held.sort((a, b) => rank(a) - rank(b))
    this.queue.push(...held)
  }

  /**
   * Remove every queued event whose target is `script` and that is due by
   * `upTo` (default: all of them), except events named `keep`. Used on reset
   * and state change.
   */
  purgeTarget(script: Script, upTo = Infinity, keep: readonly string[] = []): void {
    // In-world: a script reset during a contact it had held events of got every live
    // land_collision after the reset.
    if (upTo === Infinity) this.openContacts.delete(script)
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const e = this.queue[i]!
      if (e.target === script && e.at <= upTo && !keep.includes(e.event)) this.queue.splice(i, 1)
    }
  }

  /** Remove and return the queued `event`s due by now whose target is `script` and that `match`, in queue order. */
  takeDue(script: Script, event: string, match: (e: QueuedEvent) => boolean): QueuedEvent[] {
    const taken = this.queue.filter((e) => e.target === script && e.event === event && e.at <= this.now && match(e))
    this.purgeWhere((e) => taken.includes(e))
    return taken
  }

  /** Remove every queued `event` whose target is `script`. */
  purgeEvent(script: Script, event: string): void {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const e = this.queue[i]!
      if (e.target === script && e.event === event) this.queue.splice(i, 1)
    }
  }
}

/**
 * Per-script clock facade. Builtins read `ctx.state.clock` and call
 * `.schedule()` / `.setTimer()` / `.elapsedSeconds()` against this view; it
 * forwards shared state to the linkset and keeps per-script state local.
 */
export class ScriptClockView {
  /** Script clocks stop while their attachment is saved in inventory. */
  private inventorySince: number | undefined
  /** Reference time for `llGetTime`/`llResetTime` (virtual ms); the script's creation, reset or last llResetTime. */
  timeReferenceMs: number
  /** Monotonic completed-handler count used to bound synchronous settling. */
  completedHandlers = 0
  /** Recurring timer interval in ms; 0 = no timer. */
  timerIntervalMs = 0
  /** Virtual time at which the next timer event fires. */
  timerNextFireMs = 0
  /** When the tick that fell due while the script was down should have fired, until that tick fires. */
  timerLateDueMs: number | undefined
  /**
   * How late the last tick ran after it was due; for the tick a start caught up on, how late the
   * start was. An LSL llSetTimerEvent call counts its interval from that much earlier.
   */
  timerLagMs = 0
  /** When the overdue tick first waited behind another event. */
  timerPassedAt: number | undefined
  /** Whether the owed tick leaves a lag when it fires. */
  private owedTickLags = false
  /** For a tick a start owes: the next tick on the schedule the timer had at the start. */
  private owedNextMs = 0
  /** When the start that owes a tick came. */
  private owedStartMs = 0
  /** Whether the owed tick fell due while the script was stopped. */
  private owedWhileStopped = false
  /** When the script was last stopped. */
  private stoppedAtMs = 0
  /** Whether the script was in a handler, asleep or not, when it was last stopped. */
  private stoppedInHandler = false
  /** Whether the due tick is the one that follows an owed tick, which a call replaces. */
  private followsOwed = false
  /** Whether an llSetTimerEvent call made the owed tick due, so a later call replaces it. */
  private owedBySet = false
  /** When the first tick is due on the schedule of a call made while a start's tick is owed. */
  private owedSetDueMs: number | undefined
  /** Virtual time at which the script's last handler finished, when it took time (llSleep, delays). */
  busyUntilMs = 0
  /** llMinEventDelay in ms; 0 = none. */
  minEventDelayMs = 0
  /** Earliest virtual time the next timer or touch_start may start, under llMinEventDelay. */
  delayedUntilMs = 0
  /** Earliest virtual time a held click's next `touch` may be raised, under llMinEventDelay. */
  private touchDelayedUntilMs = 0
  /** The first `touch` after a `touch_start` is not delayed and leaves the delay where touch_start put it. */
  private touchAfterStart = false

  constructor(
    private readonly linksetClock: LinksetClock,
    private readonly self: () => Script,
  ) {
    this.timeReferenceMs = linksetClock.now
  }

  get now(): number {
    return this.linksetClock.now
  }

  /** Schedule a one-shot event on this script. */
  schedule(at: number, event: string, payload: Record<string, unknown> = {}, held?: boolean): void {
    this.linksetClock.schedule(this.self(), at, event, payload, held)
  }

  /** Schedule a one-shot event on a specific script. */
  scheduleOn(target: Script, at: number, event: string, payload: Record<string, unknown> = {}): void {
    this.linksetClock.schedule(target, at, event, payload)
  }

  /** A reset chain finishes when its replacement state_entry finishes. */
  finishHandler(restarting: boolean): void {
    if (!restarting) this.completedHandlers++
  }

  /** llSetTimerEvent(0): the lag a caught-up tick left stays. */
  cancelTimer(): void {
    this.linksetClock.purgeWhere((e) => e.target === this.self() && e.event === 'timer')
    this.timerIntervalMs = 0
    this.timerNextFireMs = 0
    this.timerLateDueMs = undefined
    this.timerPassedAt = undefined
    this.owedBySet = false
    this.followsOwed = false
    this.owedSetDueMs = undefined
  }

  /** The script stopped running. */
  stopped(): void {
    const script = this.self()
    this.stoppedAtMs = this.now
    this.stoppedInHandler = script.handling || script.wakeAt !== undefined
  }

  /** A reset ends the timer and its lag. */
  resetTimer(): void {
    this.cancelTimer()
    this.timerLagMs = 0
  }

  /**
   * A tick fired `at`. The next comes an interval after this one was due if that is still ahead,
   * and this one leaves a lag of how late it was; otherwise the next comes a full interval later
   * and there is no lag. An owed tick is followed at once by the next tick when that is due by the
   * time it runs: on the schedule the timer had, or on that of a call made while it was owed.
   */
  timerFired(at: number): void {
    const late = this.timerLateDueMs
    const due = this.timerNextFireMs
    const passed = this.timerPassedAt
    this.timerPassedAt = undefined
    this.followsOwed = false
    const kept = (late ?? due) + this.timerIntervalMs
    const bySet = this.owedBySet
    const setDue = this.owedSetDueMs
    this.timerLateDueMs = undefined
    this.owedBySet = false
    this.owedSetDueMs = undefined
    this.timerNextFireMs = kept > at ? kept : at + this.timerIntervalMs
    // In-world: a tick held through one interval, by a sleep or llMinEventDelay, kept the
    // schedule and left its lateness as the lag; one held through more left neither.
    if (late === undefined) {
      this.timerLate(kept > at ? (passed ?? at) - due : 0)
      return
    }
    // A start that missed more than one tick leaves no lag, and nor does a tick that ran after
    // the next was due on the schedule it had, unless a tick follows it: then the start's lag
    // stays until that tick runs. In-world, a timer set again in the caught-up tick after a 4, 5
    // or 6 s sleep queued at a start 1 s late came 1 s early. A tick a call made due leaves how
    // late it was, unless that is a full interval or more: in-world, a 1 s timer due 2 s before
    // it ran left none.
    const overdue = !bySet && at >= this.owedNextMs
    const lags = bySet ? kept > at : !overdue || this.owedWhileStopped
    this.timerLagMs = lags && this.owedTickLags ? (overdue ? this.owedStartMs : passed ?? at) - late : 0
    if (bySet || (setDue === undefined && !this.owedWhileStopped)) return
    // In-world: after a start that missed more than one tick, the next came an interval after the
    // start, and after a call before the caught-up tick ran, on the call's schedule. A script that
    // slept in a waiting handler while that tick fell due woke to the caught-up tick and then that
    // one. One stopped during its own sleep woke to one, unless a waiting handler set the timer.
    const running = setDue ?? (kept > this.owedStartMs ? kept : this.owedStartMs + this.timerIntervalMs)
    this.timerNextFireMs = running
    this.followsOwed = running <= at
  }

  /** A tick ran `ms` after it was due. */
  timerLate(ms: number): void {
    this.timerLagMs = Math.max(0, ms)
  }

  /**
   * A script that was stopped or crashed runs again: ticks that fell due
   * meanwhile collapse into one, fired once the events already waiting have
   * run. The tick after it keeps the old schedule if that is still ahead, and
   * otherwise comes a full interval later, unless a call before it runs
   * starts a new schedule. If the tick was missed while the script was
   * stopped, a tick on that schedule that falls due before it runs follows it
   * at once.
   */
  catchUpTimer(lag = true): void {
    if (this.timerIntervalMs <= 0 || this.timerNextFireMs > this.now) return
    // A tick already owed from an earlier start keeps its place.
    this.timerLateDueMs ??= this.timerNextFireMs
    this.timerNextFireMs = this.now
    // In-world: an LSL script started with llSetScriptState has the lag from the start, also when
    // a waiting event turns the timer off before the tick; with more than one tick missed it has
    // none. Neither had a crashed script that came back in a rez. An SLua script's timer, which
    // LLTimers sets, lags the same way.
    this.owedBySet = false
    this.timerPassedAt = undefined
    this.owedStartMs = this.now
    this.owedWhileStopped = lag && !this.stoppedInHandler && this.timerLateDueMs >= this.stoppedAtMs
    this.owedNextMs = this.timerLateDueMs + this.timerIntervalMs
    this.owedTickLags = lag && this.owedNextMs > this.now
    this.timerLagMs = this.owedTickLags ? this.now - this.timerLateDueMs : 0
  }

  setTimer(intervalMs: number): void {
    if (intervalMs <= 0) {
      this.cancelTimer()
      return
    }
    // A tick that fell due and has not run yet still runs, and leaves how late it ran as the lag.
    // In-world: one that follows a caught-up tick did not run once that tick's handler set the timer.
    if (this.timerIntervalMs > 0 && this.timerNextFireMs <= this.now && this.timerLateDueMs === undefined && !this.followsOwed) {
      // Its due time is bookkeeping: a copy in inventory drops it, and with it the lag.
      const passed = this.timerPassedAt === undefined ? {} : { __passedAt: this.timerPassedAt }
      this.schedule(this.timerNextFireMs, 'timer', { __due: this.timerNextFireMs, __interval: this.timerIntervalMs, ...passed })
    }
    this.followsOwed = false
    this.timerIntervalMs = intervalMs
    // A tick still owed from before the script started keeps its place. The call starts the
    // schedule of the ticks after it, earlier by the lag the start left if the next tick on the
    // old schedule is still ahead.
    if (this.timerLateDueMs !== undefined && !this.owedBySet) {
      this.owedSetDueMs = this.now + intervalMs - (this.now < this.owedNextMs ? this.timerLagMs : 0)
      return
    }
    this.timerPassedAt = undefined
    // A lag moves the first tick earlier. One that would be due already is owed: it fires once the
    // handler ends, unless a later call replaces it.
    const due = this.now + intervalMs - this.timerLagMs
    this.owedBySet = due <= this.now
    this.owedTickLags = this.owedBySet
    this.timerLateDueMs = this.owedBySet ? due : undefined
    this.timerNextFireMs = this.owedBySet ? this.now : due
  }

  /**
   * When llMinEventDelay lets the next `touch` run, or 0 when it doesn't delay it: the first
   * touch after a touch_start is not delayed.
   */
  touchDelayUntil(): number {
    return this.minEventDelayMs > 0 && !this.touchAfterStart ? this.touchDelayedUntilMs - 1e-6 : 0
  }

  /** Under llMinEventDelay, held `touch` events are spaced from `touch_start` and from each other. */
  touchDelivered(event: string): void {
    if (event === 'touch_start') {
      this.touchDelayedUntilMs = this.now + this.minEventDelayMs
      this.touchAfterStart = true
    } else if (event === 'touch') {
      if (!this.touchAfterStart) this.touchDelayedUntilMs = this.now + this.minEventDelayMs
      this.touchAfterStart = false
    }
  }

  /** llMinEventDelay: `ms` below 0 counts as 0, and the delay starts now. */
  setMinEventDelay(ms: number): void {
    this.minEventDelayMs = Math.max(0, ms)
    this.delayedUntilMs = this.now + this.minEventDelayMs
    // In-world: llMinEventDelay(1.0) in touch_start held a held click's second touch until 1.0 s after the call.
    this.touchDelayedUntilMs = this.delayedUntilMs
  }

  /** Advances the linkset clock. */
  advance(ms: number): void {
    this.linksetClock.advance(ms)
  }

  /** Wall-clock time in microseconds since the Unix epoch, floored. */
  unixMicros(): number {
    return this.linksetClock.unixMicros()
  }

  elapsedSeconds(): number {
    return ((this.inventorySince ?? this.now) - this.timeReferenceMs) / 1000
  }

  resetReference(): void {
    this.timeReferenceMs = this.inventorySince ?? this.now
  }

  /** True between a detach into inventory and the next wear. */
  get inInventory(): boolean {
    return this.inventorySince !== undefined
  }

  /** The time the script's own clock stands at: `now`, or when it went into inventory. */
  get stoppedAt(): number {
    return this.inventorySince ?? this.now
  }

  pauseForInventory(): void {
    this.inventorySince = this.now
    // In-world: a worn script detached during a timer lag and worn again had none.
    this.timerLagMs = 0
    this.timerPassedAt = undefined
    this.followsOwed = false
    this.owedWhileStopped = false
    this.owedSetDueMs = undefined
    for (const e of this.linksetClock.pendingEvents()) {
      if (e.target === this.self() && e.event === 'timer') {
        delete e.payload['__due']
        delete e.payload['__passedAt']
        delete e.payload['__interval']
      }
    }
  }

  /** Restore saved timer phase; lifecycle events must already be queued. */
  resumeFromInventory(): void {
    if (this.inventorySince === undefined) return
    const pausedMs = this.now - this.inventorySince
    this.self().postponeWake(this.inventorySince)
    this.inventorySince = undefined
    this.timeReferenceMs += pausedMs
    if (this.timerIntervalMs > 0) {
      this.timerNextFireMs += pausedMs
      if (this.timerNextFireMs <= this.now && this.self().running) {
        this.schedule(this.now, 'timer')
        const next = this.timerNextFireMs + this.timerIntervalMs
        this.timerNextFireMs = next > this.now ? next : this.now + this.timerIntervalMs
      }
    }
  }
}
