/** Opt-in delivery controls shared by one avatar's viewer. */
export class RlvViewerControls {
  private holding = false
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

  /** @internal The callback schedules work rather than running a script or action inline. */
  deliver(schedule: () => void, immediate = schedule): void {
    if (this.holding) this.pending.push(schedule)
    else immediate()
  }
}
