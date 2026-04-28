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

/** Linkset-wide clock. One instance per Linkset. */
export class LinksetClock {
  /** Virtual milliseconds since linkset construction. Strictly monotonic. */
  now = 0

  private readonly queue: QueuedEvent[] = []

  /** Schedule a one-shot event on `target`'s handler at virtual time `at`. */
  schedule(target: Script, at: number, event: string, payload: Record<string, unknown> = {}): void {
    this.queue.push({ at, target, event, payload })
  }

  /** Move the clock forward unconditionally; does not drain queues. */
  advance(ms: number): void {
    if (ms < 0) throw new Error('cannot advance time backwards')
    this.now += ms
  }

  /**
   * Pop and return the next due event (`at <= now`) considering all queued
   * one-shots and every script's recurring timer. Returns `null` when no
   * event is ready.
   *
   * Recurring timers fire once per script per interval; their next fire
   * timestamp is advanced by `at + interval` (not `now + interval`) so that
   * long advances catch up on every missed fire.
   */
  takeNextDue(scripts: ReadonlyArray<Script>): QueuedEvent | null {
    let bestIdx = -1
    let bestAt = Infinity
    for (let i = 0; i < this.queue.length; i++) {
      const e = this.queue[i]!
      if (e.at <= this.now && e.at < bestAt) {
        bestAt = e.at
        bestIdx = i
      }
    }
    let bestTimerScript: Script | null = null
    let bestTimerAt = Infinity
    for (const s of scripts) {
      const v = s.clockView
      if (v.timerIntervalMs > 0 && v.timerNextFireMs <= this.now && v.timerNextFireMs < bestTimerAt) {
        bestTimerAt = v.timerNextFireMs
        bestTimerScript = s
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

  /** Remove every queued event whose target is `script`. Used on reset. */
  purgeTarget(script: Script): void {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i]!.target === script) this.queue.splice(i, 1)
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

  elapsedSeconds(): number {
    return (this.now - this.timeReferenceMs) / 1000
  }

  resetReference(): void {
    this.timeReferenceMs = this.now
  }
}
