import { LinksetClock } from './clock.js'
import { Prim } from './prim.js'
import type { Script } from './script.js'
import type { LinksetDataEntry } from './builtins/linksetdata.js'
import type { LinkedMessageEntry } from './builtins/linked.js'

/** LSL link sentinels. */
export const LINK_ROOT = 1
export const LINK_SET = -1
export const LINK_ALL_OTHERS = -2
export const LINK_ALL_CHILDREN = -3
export const LINK_THIS = -4

export interface LinksetOptions {
  /** Owner key applied to all scripts in this linkset. */
  readonly owner?: string
}

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
  readonly clock = new LinksetClock()
  readonly prims: Prim[] = []
  /** Linkset-wide LSD store (was per-script before multi-script support). */
  readonly linksetData: Map<string, LinksetDataEntry> = new Map()
  /**
   * Cross-script capture of every `llMessageLinked` invocation in this
   * linkset. Append-only; long-running tests should call
   * `clearLinkedMessages()` between scenarios to keep memory bounded.
   */
  readonly linkedMessages: LinkedMessageEntry[] = []

  /** Drop every captured cross-script linked-message entry. */
  clearLinkedMessages(): void {
    this.linkedMessages.length = 0
  }
  readonly owner: string

  constructor(opts: LinksetOptions = {}) {
    this.owner = opts.owner ?? '00000000-0000-0000-0000-000000000000'
  }

  /** Add a prim to the linkset; assigns a 1-based linkNumber. */
  addPrim(prim: Prim): Prim {
    prim.linkset = this
    this.prims.push(prim)
    this.recomputeLinkNumbers()
    return prim
  }

  private recomputeLinkNumbers(): void {
    if (this.prims.length === 1) {
      // LSL: a lone unlinked prim reports linkNumber 0.
      this.prims[0]!.linkNumber = 0
      return
    }
    for (let i = 0; i < this.prims.length; i++) {
      this.prims[i]!.linkNumber = i + 1
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

  /** Resolve LINK_* / specific link number to the set of target prims. */
  resolveTargets(senderLink: number, target: number): Prim[] {
    if (target === LINK_THIS) {
      const me = this.prims.find((p) => p.linkNumber === senderLink) ?? this.prims[0]
      return me ? [me] : []
    }
    if (target === LINK_SET) return [...this.prims]
    if (target === LINK_ALL_OTHERS) {
      return this.prims.filter((p) => p.linkNumber !== senderLink)
    }
    if (target === LINK_ALL_CHILDREN) {
      // children = everything except root (link 1 in a real linkset; lone prim has linkNumber 0 → no children)
      if (this.prims.length <= 1) return []
      return this.prims.filter((p) => p.linkNumber !== 1)
    }
    if (target >= 1) {
      const p = this.prims.find((pp) => pp.linkNumber === target)
      return p ? [p] : []
    }
    if (target === 0 && this.prims.length === 1) {
      // Lone unlinked prim accepts target 0 as "self".
      return [this.prims[0]!]
    }
    return []
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
   * `sender_num` is set to that value. The capture array on the linkset
   * records every invocation for cross-script test assertions.
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
        this.clock.schedule(s, at, 'link_message', { sender_num: senderLink, num, str, id })
      }
    }
  }

  /**
   * Deliver chat to every script in the linkset whose listens match. Useful
   * for region/world-level chat simulation. `Script.deliverChat` remains
   * available for the single-script case (delivers only to that script).
   */
  deliverChat(opts: { channel: number; name: string; key: string; message: string }): void {
    for (const s of this.allScripts()) {
      s.matchChatListens(opts)
    }
    this.drainQueue()
  }

  /**
   * Advance the shared clock by `ms` and drain every event that becomes
   * due, dispatching each to its target script.
   */
  advanceTime(ms: number): void {
    this.clock.advance(ms)
    this.drainQueue()
  }

  /**
   * Drain due events in chronological order. Each event is delivered to
   * its target script via `script.deliver(event, payload)`. If a handler
   * triggers more events (timers, chained chats, …) they may become due
   * inside this loop and are picked up in the next iteration.
   */
  drainQueue(): void {
    while (true) {
      const scripts = this.allScripts()
      if (scripts.length === 0) return
      const next = this.clock.takeNextDue(scripts)
      if (!next) return
      const target = next.target
      if (target.dead) continue
      // `__reset` (from llResetOtherScript) must run regardless of the
      // target's running flag — per LSL, a stopped script is still reset
      // when commanded, it just stays stopped afterward.
      if (!target.running && next.event !== '__reset') {
        // Park for replay when the script is re-enabled. A paused script
        // must not block other scripts' events, so we stash on the script
        // itself rather than holding a slot in the linkset queue.
        target.parkedEvents.push({ at: next.at, event: next.event, payload: next.payload })
        continue
      }
      // ResetScriptSignal is caught inside `Script.runHandler`; it never
      // bubbles up to here, so no try/catch is needed.
      target.deliver(next.event, next.payload)
    }
  }
}
