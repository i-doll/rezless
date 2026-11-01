import type { LinksetClock } from '../clock.js'

/** Opt-in delivery controls shared by one avatar's viewer. */
export class RlvViewerControls {
  private holding = false
  private scheduled = 0
  private readonly pending: Array<() => void> = []
  private readonly overrides: Array<{ matches: (command: string) => boolean; text?: string }> = []

  /** Suppress the next matching query reply. Overrides are consumed in registration order. */
  dropNext(matches: (command: string) => boolean = () => true): void {
    this.overrides.push({ matches })
  }

  /** Replace the next matching query reply, including with an empty string. */
  answerNext(text: string, matches: (command: string) => boolean = () => true): void {
    this.overrides.push({ matches, text })
  }

  /** Hold query replies and forced inventory actions until release. */
  hold(): void { this.holding = true }

  /** Schedule at most count queued deliveries; omit count to drain and resume automatic delivery. */
  release(count?: number): void {
    if (count !== undefined && (!Number.isSafeInteger(count) || count < 0)) {
      throw new RangeError('count must be a nonnegative integer')
    }
    if (count === undefined) this.holding = false
    for (const deliver of this.pending.splice(0, count ?? this.pending.length)) deliver()
  }

  /** @internal Select one override when a query arrives, before holding its delivery. */
  queryReply(command: string, text: string): string | undefined {
    const index = this.overrides.findIndex(override => override.matches(command))
    return index < 0 ? text : this.overrides.splice(index, 1)[0]!.text
  }

  /** @internal Released work and subsequent deliveries share scheduler order. */
  deliver(clock: LinksetClock, target: { readonly dead: boolean }, run: () => void, immediate = false): void {
    const schedule = (ordered: boolean) => {
      if (ordered) ++this.scheduled
      // Even canceled work retires its ordering barrier when the clock drains.
      clock.scheduleTask({ dead: false }, clock.now, () => {
        try { if (!target.dead) run() } finally { if (ordered) --this.scheduled }
      })
    }
    if (this.holding) this.pending.push(() => schedule(true))
    else if (immediate && this.scheduled === 0) run()
    else schedule(this.scheduled > 0)
  }
}
