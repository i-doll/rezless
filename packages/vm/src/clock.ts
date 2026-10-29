/**
 * Virtual clock + event queue.
 *
 * The clock is the only source of "time" in the VM. Tests advance it
 * explicitly (`vm.advanceTime` / `linkset.advanceTime`); LSL scripts advance
 * it by calling `llSleep` or `llSetTimerEvent`. Real wall-clock time is
 * never read.
 *
 * The queue is **linkset-wide**: every script in the linkset shares one
 * `now` and one event queue. Each queued event carries a `target: Script`
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
}

/** Events a script can hold in its queue; more are dropped, as in Second Life. */
export const MAX_PENDING_EVENTS = 64

/** Linkset-wide clock. One instance per Linkset. */
export class LinksetClock {
  /** Virtual milliseconds since linkset construction. Strictly monotonic. */
  now = 0

  /** @param startUnixTime Unix time in seconds when `now` is 0. */
  constructor(readonly startUnixTime = 0) {}

  /** Wall-clock time in microseconds since the Unix epoch, floored. */
  unixMicros(): number {
    return Math.floor(this.startUnixTime * 1e6 + this.now * 1000)
  }

  private readonly queue: QueuedEvent[] = []

  /**
   * Schedule a one-shot event on `target`'s handler at virtual time `at`.
   * A script holds at most MAX_PENDING_EVENTS queued events, counting those
   * parked while it is stopped; further events are dropped.
   */
  schedule(target: Script, at: number, event: string, payload: Record<string, unknown> = {}): void {
    if (event !== '__reset') {
      let pending = target.parkedEvents.length
      for (const e of this.queue) if (e.target === target) pending++
      if (pending >= MAX_PENDING_EVENTS) return
    }
    this.queue.push({ at, target, event, payload })
  }

  /** Move the clock forward unconditionally; does not drain queues. */
  advance(ms: number): void {
    if (ms < 0) throw new Error('cannot advance time backwards')
    this.now += ms
  }

  /**
   * Pop and return the next due event (`at <= horizon`, default `now`) considering all queued
   * one-shots and every script's recurring timer. Returns `null` when no
   * event is ready.
   *
   * Recurring timers fire once per script per interval; their next fire
   * timestamp is advanced by `at + interval` (not `now + interval`) so that
   * long advances catch up on every missed fire. Ticks that fall due while
   * the script is busy (e.g. in llSleep) collapse into one event delivered
   * when it finishes, and the interval restarts from there.
   */
  takeNextDue(scripts: ReadonlyArray<Script>, horizon = this.now): QueuedEvent | null {
    let bestIdx = -1
    let bestAt = Infinity
    for (let i = 0; i < this.queue.length; i++) {
      const e = this.queue[i]!
      if (e.at <= horizon && e.at < bestAt) {
        bestAt = e.at
        bestIdx = i
      }
    }
    let bestTimerScript: Script | null = null
    let bestTimerAt = Infinity
    for (const s of scripts) {
      // Per LSL: dead and stopped scripts don't generate timer events. Skip
      // their timer state so we don't waste catch-up iterations or accumulate
      // back-logged events that flood the script on resume.
      if (s.dead || !s.running) continue
      const v = s.clockView
      if (v.timerIntervalMs > 0 && v.timerNextFireMs <= horizon) {
        const due = Math.max(v.timerNextFireMs, v.busyUntilMs)
        if (due < bestTimerAt) {
          bestTimerAt = due
          bestTimerScript = s
        }
      }
    }

    if (bestIdx === -1 && bestTimerScript === null) return null

    if (bestTimerScript && bestTimerAt <= bestAt) {
      const at = bestTimerAt
      const v = bestTimerScript.clockView
      v.timerNextFireMs = at + v.timerIntervalMs
      return { at, target: bestTimerScript, event: 'timer', payload: {} }
    }
    const ev = this.queue[bestIdx]!
    this.queue.splice(bestIdx, 1)
    return ev
  }

  /** Snapshot of the pending one-shot queue. Read-only; for inspection/tests. */
  pendingEvents(): readonly QueuedEvent[] {
    return this.queue.slice()
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
}

/**
 * Per-script clock facade. Builtins read `ctx.state.clock` and call
 * `.schedule()` / `.setTimer()` / `.elapsedSeconds()` against this view; it
 * forwards shared state to the linkset and keeps per-script state local.
 */
export class ScriptClockView {
  /** Reference time for `llGetTime`/`llResetTime` (virtual ms). */
  timeReferenceMs = 0
  /** Recurring timer interval in ms; 0 = no timer. */
  timerIntervalMs = 0
  /** Virtual time at which the next timer event fires. */
  timerNextFireMs = 0
  /** Virtual time at which the script's last handler finished, when it took time (llSleep, delays). */
  busyUntilMs = 0

  constructor(
    private readonly linksetClock: LinksetClock,
    private readonly self: () => Script,
  ) {}

  get now(): number {
    return this.linksetClock.now
  }

  /** Schedule a one-shot event on this script. */
  schedule(at: number, event: string, payload: Record<string, unknown> = {}): void {
    this.linksetClock.schedule(this.self(), at, event, payload)
  }

  /** Schedule a one-shot event on a specific script. */
  scheduleOn(target: Script, at: number, event: string, payload: Record<string, unknown> = {}): void {
    this.linksetClock.schedule(target, at, event, payload)
  }

  cancelTimer(): void {
    this.timerIntervalMs = 0
    this.timerNextFireMs = 0
  }

  setTimer(intervalMs: number): void {
    if (intervalMs <= 0) {
      this.cancelTimer()
      return
    }
    this.timerIntervalMs = intervalMs
    this.timerNextFireMs = this.now + intervalMs
  }

  /** Advances the linkset clock — used by `llSleep`. */
  advance(ms: number): void {
    this.linksetClock.advance(ms)
  }

  /** Wall-clock time in microseconds since the Unix epoch, floored. */
  unixMicros(): number {
    return this.linksetClock.unixMicros()
  }

  elapsedSeconds(): number {
    return (this.now - this.timeReferenceMs) / 1000
  }

  resetReference(): void {
    this.timeReferenceMs = this.now
  }
}
