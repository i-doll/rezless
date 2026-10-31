import { LinksetClock } from './clock.js'
import { Prim } from './prim.js'
import type { Script } from './script.js'
import type { LinksetDataEntry } from './builtins/linksetdata.js'
import type { LinkedMessageEntry } from './builtins/linked.js'
import type { DetectedEntry } from './builtins/detected.js'
import type { ChatType } from './runtime.js'
import type { World } from './world.js'
import { NULL_KEY, type Vector } from './values/types.js'
import {
  LINK_ROOT,
  LINK_SET,
  LINK_ALL_OTHERS,
  LINK_ALL_CHILDREN,
  LINK_THIS,
  PASS_ALWAYS,
  PASS_NEVER,
} from './generated/constants.js'

// Re-export so `import { LINK_* } from '@rezless/vm'` keeps working.
export { LINK_ROOT, LINK_SET, LINK_ALL_OTHERS, LINK_ALL_CHILDREN, LINK_THIS }

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
}

export interface TouchOptions {
  /** Face of the prim that was clicked. Default 0. */
  readonly face?: number
  /** Where on the face the click landed, as texture coordinates. */
  readonly st?: Vector
  /** Where on the texture the click landed, after repeats and offsets. */
  readonly uv?: Vector
  /** Milliseconds the click is held before release. Default 0. */
  readonly hold?: number
  /** Who clicked. Defaults to the owner. */
  readonly avatar?: Omit<DetectedEntry, 'linkNumber' | 'touchFace' | 'touchST' | 'touchUV'>
}

const TOUCH_EVENTS = ['touch_start', 'touch', 'touch_end'] as const

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

  /** Drop every captured cross-script linked-message entry. */
  clearLinkedMessages(): void {
    this.linkedMessages.length = 0
  }
  readonly owner: string
  readonly world?: World
  readonly region: string | undefined
  readonly startParameter: number
  readonly startString: string

  constructor(opts: LinksetOptions = {}) {
    this.owner = opts.owner ?? NULL_KEY
    this.region = opts.region
    this.startParameter = opts.startParameter ?? 0
    this.startString = opts.startString ?? ''
    if (opts.world) {
      opts.world.corner(opts.region)
      this.world = opts.world
      this.clock = opts.world.clock
      opts.world.linksets.push(this)
    } else {
      this.clock = new LinksetClock(opts.startUnixTime)
    }
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
      // children = everything except root (LINK_ROOT in a real linkset; a
      // lone prim has linkNumber 0 → no children).
      if (this.prims.length <= 1) return []
      return this.prims.filter((p) => p.linkNumber !== LINK_ROOT)
    }
    if (target >= LINK_ROOT) {
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
        if (s.running) this.clock.schedule(s, at, 'link_message', { sender_num: senderLink, num, str, id })
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
   * reaches the sender's region, and llRegionSayTo only the prim keyed `to`
   * in that region. A prim never hears its own chat.
   */
  routeChat(from: Prim, type: ChatType, channel: number, message: string, to?: string): void {
    const origin = this.globalPosition(from)
    const range = CHAT_RANGE[type] ?? 0
    const reaches = (linkset: Linkset, p: Prim): boolean => {
      if (p === from) return false
      if (type === 'regionSay') return linkset.region === this.region
      if (type === 'regionSayTo') return linkset.region === this.region && to !== NULL_KEY && p.key === to
      return distanceSquared(origin, linkset.globalPosition(p)) <= range * range
    }
    this.broadcast(reaches, { channel, name: from.name, key: from.key, message })
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

  private broadcast(
    reaches: (linkset: Linkset, p: Prim) => boolean,
    chat: { channel: number; name: string; key: string; message: string },
  ): Script[] {
    const matched: Script[] = []
    for (const linkset of this.world?.linksets ?? [this]) {
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
   * no running script in it handles any touch event and it did not set
   * PASS_NEVER. In every receiver llDetectedLinkNumber is `link` and
   * llDetectedTouchFace is `face`. `touch_end` is queued `hold` ms after
   * the click, only for receivers still running then; `touch` fires once,
   * right after `touch_start`.
   */
  touch(link: number, opts: TouchOptions = {}): void {
    const prim =
      this.prims.length === 1 && (link === 0 || link === LINK_ROOT)
        ? this.prims[0]
        : this.prims.find((p) => p.linkNumber === link)
    if (!prim) throw new Error(`touch: no prim with link number ${link}`)
    const root = this.prims[0]!
    for (const s of new Set([...prim.scripts, ...root.scripts])) if (s.running) s.start()
    const handlers = (p: Prim) =>
      p.scripts.filter((s) => s.running && !s.dead && TOUCH_EVENTS.some((e) => s.handles(e)))
    const receivers = handlers(prim)
    const pass = prim.params.passTouches
    if (prim !== root && (pass === PASS_ALWAYS || (pass !== PASS_NEVER && receivers.length === 0))) {
      receivers.push(...handlers(root))
    }
    const avatar = opts.avatar ?? { key: this.owner, name: '' }
    const detected = [
      {
        ...avatar,
        linkNumber: prim.linkNumber,
        touchFace: opts.face ?? 0,
        ...(opts.st && { touchST: opts.st }),
        ...(opts.uv && { touchUV: opts.uv }),
      },
    ]
    // Under llMinEventDelay a script holds one waiting click; it drops the others.
    const dropped = new Set(
      receivers.filter((s) => s.clockView.minEventDelayMs > 0 && this.clock.hasPending(s, 'touch_start')),
    )
    const queue = (events: ReadonlyArray<string>) => {
      for (const s of receivers) {
        if (dropped.has(s)) continue
        if (!s.running || s.dead) continue
        for (const e of events) {
          if (s.handles(e)) this.clock.schedule(s, this.clock.now, e, { num_detected: 1, detected })
        }
      }
    }
    if (opts.hold) {
      queue(['touch_start', 'touch'])
      this.advanceTime(opts.hold)
      queue(['touch_end'])
    } else {
      queue(TOUCH_EVENTS)
    }
    this.settle(receivers)
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
   * Drain due events, then keep moving the clock to the next wake of any of
   * `scripts` that is sleeping, running everything due on the way, until
   * none of them is (or the sleeper is paused).
   */
  settle(scripts: ReadonlyArray<Script>): void {
    this.drainQueue()
    for (;;) {
      let at = Infinity
      for (const s of scripts) if (s.running && s.wakeAt !== undefined) at = Math.min(at, s.wakeAt)
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
   * The script roster is captured once per drain. Adding a script
   * mid-drain is rare (and would require an explicit prim mutation by a
   * builtin); when it happens, the new script's events are simply picked
   * up on the next outer drain. Worth-the-trade for avoiding an O(scripts)
   * allocation per event.
   */
  drainQueue(until = this.clock.now): void {
    const scripts = this.world?.allScripts() ?? this.allScripts()
    if (scripts.length === 0) return
    while (true) {
      const next = this.clock.takeNextDue(scripts, Math.max(until, this.clock.now))
      if (!next) return
      if (next.at > this.clock.now) this.clock.now = next.at
      const target = next.target
      if (target.dead) continue
      if (next.event === '__wake') {
        target.wake()
        continue
      }
      // `__reset` (from llResetOtherScript) was requested while the target
      // was running, so it applies even if the target was stopped since; the
      // target just stays stopped afterward.
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

function distanceSquared(a: Vector, b: Vector): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2
}
