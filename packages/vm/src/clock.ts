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
}

/**
 * Events Second Life holds back while a handler sleeps. When the handler wakes or ends they go
 * behind the events that waited for it, in this order, whatever order they came up in.
 */
const HELD_ORDER: ReadonlyMap<string, number> = new Map([
  ['timer', 0], ['sensor', 1], ['no_sensor', 1],
  ['at_target', 2], ['not_at_target', 2], ['at_rot_target', 2], ['not_at_rot_target', 2],
  ['touch_start', 3], ['touch', 4], ['touch_end', 5], ['changed', 6], ['__unseated', 6],
])

const toucher = (payload: Record<string, unknown>) => (payload['detected'] as ReadonlyArray<{ key?: string }> | undefined)?.[0]?.key

/**
 * In-world: three clicks by one avatar on faces 0, 2 and 4 while a handler slept gave one
 * touch_start that read face 0, and one touch and one touch_end that read face 4. A click
 * made while only the touch_end of the click before it was held back changed that touch_end
 * and added nothing. A colour change, an item dropped into the prim, and a sit and a stand
 * gave one changed(35). `held` is in the order the events came up; an event that merges
 * into an earlier one takes its place, and the others keep theirs.
 */
function mergeHeld(held: ReadonlyArray<QueuedEvent>): QueuedEvent[] {
  const clicks = new Map<string, { touch_start?: number; touch?: number; touch_end?: number }>()
  const merged: QueuedEvent[] = []
  let changed: number | undefined
  for (const e of held) {
    if (e.event === 'changed' || e.event === '__unseated') {
      if (changed === undefined) changed = merged.push(e) - 1
      else {
        // The stand's event of a seat taken from under its sitter keeps its name: it runs after attach.
        const first = merged[changed]!
        merged[changed] = {
          ...first,
          event: e.event === '__unseated' ? e.event : first.event,
          payload: { changes: (first.payload['changes'] as number) | (e.payload['changes'] as number) },
        }
      }
      continue
    }
    const by = toucher(e.payload)
    if (by === undefined || (e.event !== 'touch_start' && e.event !== 'touch' && e.event !== 'touch_end')) {
      merged.push(e)
      continue
    }
    const click = clicks.get(by) ?? {}
    clicks.set(by, click)
    const same = click[e.event]
    if (same !== undefined) {
      if (e.event !== 'touch_start') merged[same] = e
    } else if (e.event === 'touch_end' || click.touch_end === undefined && (e.event === 'touch' || click.touch === undefined)) {
      click[e.event] = merged.length
      merged.push(e)
    }
  }
  return merged
}

/** Events llMinEventDelay spaces out; other events are not delayed. */
export const DELAYED_EVENTS: ReadonlySet<string> = new Set(['timer', 'touch_start'])

/** Events a script can hold in its queue; more are dropped, as in Second Life. */
export const MAX_PENDING_EVENTS = 64

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
    if (held === undefined && at <= this.now && wakeAt !== undefined && wakeAt > this.now) held = true
    held &&= HELD_ORDER.has(event)
    const queued: QueuedEvent = { at, target, event, payload, ...(held !== undefined && { held }) }
    if (held && at <= this.now) {
      // A click or a change that merges into one already held back takes no room of its own.
      const before = this.queue.filter((e) => e.target === target && e.held && e.at <= this.now)
      const after = mergeHeld([...before, queued])
      if (after.length === before.length) {
        before.forEach((e, i) => { if (after[i] !== e) this.queue[this.queue.indexOf(e)] = after[i]! })
        return
      }
    }
    if (event !== '__reset') {
      let pending = target.parkedEvents.length
      for (const e of this.queue) if (e.target === target) pending++
      if (pending >= MAX_PENDING_EVENTS) return
    }
    this.queue.push(queued)
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
   * when it finishes, and the interval restarts from there.
   *
   * Under llMinEventDelay, a timer or touch_start waits until the delay since
   * the last of them has passed, and the events queued behind it wait too.
   */
  takeNextDue(scripts: ReadonlyArray<Script>, horizon = this.now): QueuedEvent | null {
    for (;;) {
      const next = this.takeNextEventOrTask(scripts, horizon)
      if (next !== 'task') return next
    }
  }

  private takeNextEventOrTask(scripts: ReadonlyArray<Script>, horizon: number): QueuedEvent | 'task' | null {
    const heldFrom = new Map<Script, number>()
    for (let i = 0; i < this.queue.length; i++) {
      const e = this.queue[i]!
      if (DELAYED_EVENTS.has(e.event) && e.target.clockView.delayedUntilMs > e.at && !heldFrom.has(e.target)) {
        heldFrom.set(e.target, i)
      }
    }
    let bestIdx = -1
    let bestAt = Infinity
    for (let i = 0; i < this.queue.length; i++) {
      const e = this.queue[i]!
      const v = e.target.clockView
      // An event that waited for its target's handler is due when that handler finished.
      let due = Math.max(e.at, v.busyUntilMs)
      if (e.event !== '__reset' && i >= (heldFrom.get(e.target) ?? Infinity)) due = Math.max(due, v.delayedUntilMs)
      if (due <= horizon && due < bestAt && (e.event === '__reset' || e.target.wakeAt === undefined)) {
        bestAt = due
        bestIdx = i
      }
    }
    let bestTimerScript: Script | null = null
    let bestTimerAt = Infinity
    let waking: Script | null = null
    let wakeAt = Infinity
    for (const s of scripts) {
      // Per LSL: dead and stopped scripts don't generate timer events. Skip
      // their timer state so we don't waste catch-up iterations or accumulate
      // back-logged events that flood the script on resume.
      if (s.dead || !s.running) continue
      const w = s.wakeAt === undefined ? undefined : Math.max(s.wakeAt, this.now)
      if (w !== undefined) {
        if (w <= horizon && w < wakeAt) {
          wakeAt = w
          waking = s
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
    if (task && task.at <= nextEvent) {
      this.tasks.delete(task)
      this.now = Math.max(this.now, task.at)
      task.run()
      return 'task'
    }

    if (bestIdx !== -1 && bestAt <= bestTimerAt && bestAt <= wakeAt) {
      const ev = this.queue[bestIdx]!
      this.queue.splice(bestIdx, 1)
      return bestAt > ev.at ? { ...ev, at: bestAt } : ev
    }
    if (bestTimerScript && bestTimerAt <= wakeAt) {
      const at = bestTimerAt
      const v = bestTimerScript.clockView
      // A tick held back while the script was down keeps the old schedule if that is still ahead.
      const kept = v.timerLateDueMs === undefined ? at : v.timerLateDueMs + v.timerIntervalMs
      v.timerLateDueMs = undefined
      v.timerNextFireMs = kept > at ? kept : at + v.timerIntervalMs
      return { at, target: bestTimerScript, event: 'timer', payload: {} }
    }
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
   */
  releaseAtWake(script: Script, since: number): void {
    const kind = (e: QueuedEvent) => e.event === '__unseated' ? 'changed' : e.event
    const waited = this.queue.filter((e) => e.target === script && e.at <= this.now)
    const waiting = new Set(waited.filter((e) => HELD_ORDER.has(e.event) && !this.heldBack(e, since)).map(kind))
    const held = waited.filter((e) => this.heldBack(e, since) && !waiting.has(kind(e)))
    if (!held.length) return
    this.purgeWhere((e) => held.includes(e))
    this.release(script, held, waiting.has('timer'))
  }

  /** Queue held-back events behind the others, merged and in the held order. */
  private release(script: Script, events: QueuedEvent[], timerWaits: boolean): void {
    const held = mergeHeld(events.sort((a, b) => a.at - b.at))
      .map(({ at, target, event, payload }): QueuedEvent => ({ at, target, event, payload, held: false }))
    const v = script.clockView
    // In-world: a 3 s timer, a click in each of two 8 s sleeps in a row -> timer, the first
    // click, timer, the second click. The ticks that fell due during one sleep give one event,
    // released with the other held events. With nothing else held the tick is left to
    // takeNextDue, which gives one tick after several sleeps, as measured on the main grid.
    let pending = script.parkedEvents.length + events.length
    for (const e of this.queue) if (e.target === script) pending++
    if (held.length && pending < MAX_PENDING_EVENTS && script.running && v.timerIntervalMs > 0 && v.timerNextFireMs <= this.now &&
        !timerWaits && !held.some((e) => e.event === 'timer')) {
      held.push({ at: this.now, target: script, event: 'timer', payload: {}, held: false })
      v.timerNextFireMs = this.now + v.timerIntervalMs
    }
    held.sort((a, b) => HELD_ORDER.get(a.event)! - HELD_ORDER.get(b.event)!)
    this.queue.push(...held)
  }

  /**
   * Remove every queued event whose target is `script` and that is due by
   * `upTo` (default: all of them), except events named `keep`. Used on reset
   * and state change.
   */
  purgeTarget(script: Script, upTo = Infinity, keep?: string): void {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const e = this.queue[i]!
      if (e.target === script && e.at <= upTo && e.event !== keep) this.queue.splice(i, 1)
    }
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
  /** Virtual time at which the script's last handler finished, when it took time (llSleep, delays). */
  busyUntilMs = 0
  /** llMinEventDelay in ms; 0 = none. */
  minEventDelayMs = 0
  /** Earliest virtual time the next timer or touch_start may start, under llMinEventDelay. */
  delayedUntilMs = 0

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

  cancelTimer(): void {
    this.linksetClock.purgeWhere((e) => e.target === this.self() && e.event === 'timer')
    this.timerIntervalMs = 0
    this.timerNextFireMs = 0
    this.timerLateDueMs = undefined
  }

  /**
   * A script that was stopped or crashed runs again: ticks that fell due
   * meanwhile collapse into one, fired once the events already waiting have
   * run. The tick after it keeps the old schedule if that is still ahead, and
   * otherwise comes a full interval later.
   */
  catchUpTimer(): void {
    if (this.timerIntervalMs <= 0 || this.timerNextFireMs > this.now) return
    // A tick already owed from an earlier start keeps its place.
    this.timerLateDueMs ??= this.timerNextFireMs
    this.timerNextFireMs = this.now
  }

  setTimer(intervalMs: number): void {
    if (intervalMs <= 0) {
      this.cancelTimer()
      return
    }
    // A tick that fell due and has not run yet still runs.
    if (this.timerIntervalMs > 0 && this.timerNextFireMs <= this.now && this.timerLateDueMs === undefined) {
      this.schedule(this.timerNextFireMs, 'timer')
    }
    this.timerIntervalMs = intervalMs
    // A tick still owed from before the script started keeps its place; only the interval changes.
    if (this.timerLateDueMs === undefined) this.timerNextFireMs = this.now + intervalMs
  }

  /** llMinEventDelay: `ms` below 0 counts as 0, and the delay starts now. */
  setMinEventDelay(ms: number): void {
    this.minEventDelayMs = Math.max(0, ms)
    this.delayedUntilMs = this.now + this.minEventDelayMs
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
