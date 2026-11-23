/**
 * A region throttle as measured in-world: a sliding-window count over periods.
 * Periods follow on from each other, and a new one starts at the first request
 * once the current period and the one after it have passed. The count is the
 * requests in the current period plus the previous period's, scaled by how much
 * of the current period is left. A request that would take the count past the
 * limit shuts the throttle until the end of the following period, and requests
 * past the limit while it is shut keep it shut. Refused requests count.
 */
export class WindowThrottle {
  private start = -Infinity
  private previous = 0
  private count = 0
  private shutUntil = -Infinity

  /**
   * @param period Period length, in the clock's milliseconds.
   * @param aligned Periods start at multiples of `period` on the clock rather than at the first request.
   */
  constructor(private readonly period: number, private readonly limit: number, private readonly aligned = false) {}

  /** `open` lets the request through; `shuts` refuses it and shuts an open throttle; `refused` refuses it otherwise. */
  take(now: number): 'open' | 'shuts' | 'refused' {
    if (now - this.start >= 2 * this.period) {
      this.start = this.aligned ? now - now % this.period : now
      this.previous = this.count = 0
    } else if (now - this.start >= this.period) {
      this.start += this.period
      this.previous = this.count
      this.count = 0
    }
    const wasShut = now < this.shutUntil
    const left = this.period - (now - this.start)
    const over = this.previous * left + (this.count + 1) * this.period > this.limit * this.period
    this.count++
    if (over) this.shutUntil = this.start + 2 * this.period
    if (!over && !wasShut) return 'open'
    return over && !wasShut ? 'shuts' : 'refused'
  }
}
