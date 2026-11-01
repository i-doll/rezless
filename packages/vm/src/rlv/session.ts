import { recoverRlvAttachment } from './forcewear.js'
import { RLV_ATTACHMENT_POINTS, isRlvAttachmentBridge } from './attachments.js'
import { isRlvDetachLocked } from './detach.js'
import { sendRestrictionNotifications } from './notify.js'
import type { Linkset } from '../linkset.js'
import type { LinksetClock } from '../clock.js'
import type { Prim } from '../prim.js'
import type { World, WorldAvatar } from '../world.js'
import type { RlvParsedCommand } from './classifier.js'
import type { ViewerConfig, ViewerProfile } from './profiles.js'

export type RlvStartupPhase = 'starting' | 'misc' | 'ready'
interface RetainedCommand {
  readonly behaviour: string
  readonly query: boolean
  readonly replay: () => void
}
interface Recovery {
  readonly object: Linkset
  readonly itemId: string
  readonly point: number
  readonly detachedAt: number
  attemptedAt: number | undefined
  assetSaved: boolean
}
interface Issuer {
  readonly prim: Prim
  readonly clear: () => void
  seen: boolean
  misses: number
}

/** Per-avatar startup work and viewer object references, driven only by virtual time. */
export class RlvSession {
  private readonly recovery = new Map<string, Recovery>()
  private cancelRecovery: (() => void) | undefined
  private recoveryTimeout = false
  private recoveryStarted = 0
  private phase: RlvStartupPhase
  private readonly retained: RetainedCommand[] = []
  private replaying = false
  private readonly issuers = new Map<string, Issuer>()
  private readonly availability = new Map<string, boolean>()
  private clock: LinksetClock | undefined
  private avatar: WorldAvatar | undefined
  private world: World | undefined
  private stop: (() => void) | undefined
  private cancelTask: (() => void) | undefined
  private taskLifetime = { dead: false }
  private nextVersion = 0
  private nextCollection = 0
  private collectionRunning = false
  private readonly replyPayloads = new WeakSet<object>()
  private readonly recipients = new Set<import('../script.js').Script>()
  private onReset: (() => void) | undefined

  constructor(private readonly profile: ViewerProfile, private readonly config: ViewerConfig | undefined) {
    for (const value of [config?.initialGarbageCollectionAdditionalWait, config?.garbageCollectionAdditionalInterval]) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new RangeError('Viewer collection additions must be finite nonnegative milliseconds')
    }
    this.config = config ? { ...config } : undefined
    this.phase = config?.ready === false ? 'starting' : 'ready'
  }

  get ready(): boolean { return this.phase === 'ready' }
  get pendingCommands(): number { return this.retained.length }

  /** Bind on the first command; fixtures may bind earlier to start the session clock. */
  bind(linkset: Linkset, avatar: WorldAvatar): void {
    if (this.clock) return
    this.clock = linkset.clock
    this.avatar = avatar
    this.world = linkset.world
    const restrictions = avatar.viewer.restrictions
    restrictions.bind(avatar)
    this.onReset = () => restrictions.reset()
    this.nextVersion = this.clock.now + 2000
    this.nextCollection = this.clock.now + this.firstCollectionDelay()
    this.taskLifetime = { dead: false }
    this.stop = this.clock.onAdvance(now => { this.update(now); this.arm() })
  }

  /** Kokua's version bypass defaults on. RLVa retains all incoming commands. */
  retain(parsed: RlvParsedCommand | undefined, replay: () => void): boolean {
    const recovering = this.profile === 'rlv' && this.recovery.size > 0 && !this.recoveryTimeout
    if (this.ready && !recovering || this.profile === 'disabled' || this.replaying) return false
    if (this.profile === 'rlv' && this.config?.doNotQueueVersionRequests !== false &&
      parsed?.behaviour.startsWith('version')) return false
    this.retained.push({ behaviour: parsed?.behaviour ?? '', query: parsed?.kind === 'query', replay })
    this.arm()
    return true
  }

  setReady(ready: boolean): void { this.setStartupPhase(ready ? 'ready' : 'starting') }

  /** RLVa can answer version requests from misc startup, before full readiness. */
  setStartupPhase(phase: RlvStartupPhase): void {
    const wasReady = this.ready
    this.phase = phase
    if (this.ready && !wasReady) {
      if (this.clock) this.nextCollection = this.clock.now + this.firstCollectionDelay()
      if (!this.recovery.size || this.profile !== 'rlv') this.flush(() => true)
    } else if (this.clock) this.update(this.clock.now)
    this.arm()
  }

  /** Explicit viewer object-list membership; distance and region alone do not remove objects. */
  setObjectAvailable(sourcePrim: string, available: boolean): void {
    this.availability.set(sourcePrim, available)
    const issuer = this.issuers.get(sourcePrim)
    if (available && issuer) issuer.seen = true
  }

  track(prim: Prim, clear: () => void): void {
    if (this.issuers.has(prim.key)) return
    if (!this.collectionRunning && this.profile === 'rlva' && this.clock) {
      this.nextCollection = this.clock.now + 30000
      this.collectionRunning = true
    }
    this.issuers.set(prim.key, { prim, clear, seen: this.available(prim), misses: 0 })
    this.arm()
  }

  untrack(sourcePrim: string): void { this.issuers.delete(sourcePrim); this.arm() }

  /** A completed detach is separate from disappearance and orphan collection. */
  detached(linkset: Linkset): void {
    if (this.profile !== 'rlva') return
    this.captureReplies(() => {
      for (const issuer of this.orderedIssuers()) {
        if (issuer.seen && issuer.prim.linkset === linkset) issuer.clear()
      }
    })
  }

  /** Record a locked simulator detach before attachment rules are cleared. */
  recoverAttachment(object: Linkset, itemId: string, point: number): void {
    if (this.profile === 'disabled' || object.attachment?.temporary) return
    const avatar = object.world?.avatars.find(candidate => candidate.key.toLowerCase() === object.attachment?.avatar.toLowerCase())
    if (!avatar || isRlvAttachmentBridge(avatar.viewer, object) || !isRlvDetachLocked(avatar, object)) return
    this.bind(object, avatar)
    this.recoveryNotice(object, point, 'detached illegally')
    if (this.recovery.has(itemId) || this.profile === 'rlv' && [...this.recovery.values()].some(entry => entry.point === point)) return
    const now = this.clock!.now
    this.recovery.set(itemId, { object, itemId, point, detachedAt: now, attemptedAt: undefined, assetSaved: false })
    if (this.profile === 'rlv') {
      this.recoveryStarted = now
      const waitingForAttach = [...this.recovery.values()][0]!.attemptedAt !== undefined
      this.scheduleRecovery(now + (waitingForAttach ? 61000 : 15000))
    } else if (this.recovery.size === 1) this.scheduleRecovery(now + 10000)
  }

  /** Inject the inventory-save acknowledgement used by RLVa's watchdog. */
  savedAttachment(itemId: string): void {
    const entry = this.recovery.get(itemId)
    if (this.profile !== 'rlva' || !entry || entry.assetSaved || !this.clock) return
    this.clock.scheduleTask(this.taskLifetime, this.clock.now, () => {
      if (this.recovery.get(itemId) === entry) this.performRecovery(entry)
    })
  }

  private recoveryNotice(object: Linkset, point: number, action: string): void {
    const avatar = this.avatar!
    const name = RLV_ATTACHMENT_POINTS.find(candidate => candidate.id === point)!.name
    this.captureReplies(() => sendRestrictionNotifications(object.prims[0]!, avatar,
      avatar.viewer.restrictions.snapshot(), action + ' ' + name))
  }

  private scheduleRecovery(at: number): void {
    this.cancelRecovery?.()
    this.cancelRecovery = this.clock!.scheduleTask(this.taskLifetime, at, () => {
      this.cancelRecovery = undefined
      if (!this.world?.avatars.includes(this.avatar!)) { this.reset(); return }
      const now = this.clock!.now
      if (this.profile === 'rlv') {
        const entry = [...this.recovery.values()][0]
        if (entry?.attemptedAt !== undefined) this.recoveryTimeout = true
        if (entry) this.performRecovery(entry)
        if (entry && this.recovery.has(entry.itemId)) this.scheduleRecovery(this.recoveryStarted + 61000 > now ? this.recoveryStarted + 61000 : now + 61000)
      } else {
        for (const entry of this.recovery.values()) {
          if (!this.avatar!.viewer.inventory.snapshot().some(item => item.id === entry.itemId)) this.recovery.delete(entry.itemId)
          else if (!entry.assetSaved ? now > entry.detachedAt + 15000 : now > entry.attemptedAt! + 30000) {
            entry.assetSaved = true
            this.performRecovery(entry)
          }
        }
        if (this.recovery.size) this.scheduleRecovery(now + 10000)
      }
    })
  }

  private performRecovery(entry: Recovery): void {
    const avatar = this.avatar!
    entry.attemptedAt = this.clock!.now
    const result = recoverRlvAttachment(avatar, entry.object, entry.itemId, entry.point)
    if (result?.outcome !== 'attached' && result?.outcome !== 'already-worn') return
    this.recovery.delete(entry.itemId)
    this.recoveryTimeout = false
    this.recoveryNotice(avatar.viewer.inventory.attachmentObject(entry.itemId)!, entry.point, 'reattached legally')
    if (!this.recovery.size) {
      this.cancelRecovery?.()
      this.cancelRecovery = undefined
      if (this.ready && this.profile === 'rlv') this.flush(() => true)
      this.arm()
    } else if (this.profile === 'rlv') this.scheduleRecovery(Math.max(this.clock!.now, this.recoveryStarted + 15000))
  }

  /** Track queued listener payloads so session reset cannot deliver old viewer output. */
  captureReplies<T>(run: () => T): T {
    const clock = this.clock
    const before = new Set(clock?.pendingEvents().map(event => event.payload))
    try { return run() } finally {
      for (const event of clock?.pendingEvents() ?? []) {
        if (event.event === 'listen' && !before.has(event.payload) && event.payload.id === this.avatar?.key) {
          this.replyPayloads.add(event.payload)
          this.recipients.add(event.target)
        }
      }
    }
  }

  /** A new login clears rules, registrations, retained work and undelivered replies. */
  reset(): void {
    this.taskLifetime.dead = true
    this.cancelRecovery?.()
    this.cancelRecovery = undefined
    this.recovery.clear()
    this.recoveryTimeout = false
    this.cancelTask?.()
    this.cancelTask = undefined
    this.stop?.()
    this.stop = undefined
    this.retained.length = 0
    this.issuers.clear()
    this.collectionRunning = false
    this.availability.clear()
    if (this.clock) {
      // Requeue the surviving events in their original order, including unrelated listens.
      const pending = this.clock.pendingEvents()
      for (const target of new Set(pending.map(event => event.target))) this.clock.purgeTarget(target)
      for (const event of pending) {
        if (!this.replyPayloads.has(event.payload)) this.clock.schedule(event.target, event.at, event.event, event.payload)
      }
    }
    for (const recipient of this.recipients) {
      for (let index = recipient.parkedEvents.length - 1; index >= 0; --index) {
        if (this.replyPayloads.has(recipient.parkedEvents[index]!.payload)) recipient.parkedEvents.splice(index, 1)
      }
    }
    this.recipients.clear()
    this.onReset?.()
    this.onReset = undefined
    this.clock = undefined
    this.avatar = undefined
    this.world = undefined
    this.phase = 'starting'
  }

  private arm(): void {
    this.cancelTask?.()
    this.cancelTask = undefined
    if (!this.clock) return
    const next = this.ready ? this.profile === 'rlv' && this.recovery.size ? undefined : this.issuers.size || this.collectionRunning ? this.nextCollection : undefined
      : this.profile === 'rlva' && this.phase === 'misc' && this.retained.some(command => command.query &&
        ['version', 'versionnew', 'versionnum'].includes(command.behaviour)) ? this.nextVersion : undefined
    const clock = this.clock
    if (next !== undefined) this.cancelTask = clock.scheduleTask(this.taskLifetime, next, () => this.update(clock.now))
  }

  private available(prim: Prim): boolean {
    const linkset = prim.linkset!
    return !linkset.dead && linkset.peers.includes(linkset) && linkset.prims.includes(prim) &&
      this.availability.get(prim.key) !== false
  }

  private orderedIssuers(): Issuer[] {
    return [...this.issuers.values()].sort((a, b) => a.prim.key.localeCompare(b.prim.key))
  }

  private firstCollectionDelay(): number {
    return this.profile === 'rlva' ? 30000 : 5000 + (this.config?.initialGarbageCollectionAdditionalWait ?? 5000)
  }

  private flush(matches: (command: RetainedCommand) => boolean): void {
    const selected = this.retained.filter(matches)
    const remaining = this.retained.filter(command => !matches(command))
    this.retained.splice(0, this.retained.length, ...remaining)
    this.replaying = true
    try { for (const command of selected) command.replay() } finally { this.replaying = false }
  }

  private update(now: number): void {
    if (!this.avatar || this.profile === 'disabled') return
    if (!this.world?.avatars.includes(this.avatar)) { this.reset(); return }
    if (!this.ready) {
      if (this.profile === 'rlva' && this.phase === 'misc' && now >= this.nextVersion) {
        this.nextVersion += (Math.floor((now - this.nextVersion) / 2000) + 1) * 2000
        for (const behaviour of ['version', 'versionnew', 'versionnum']) {
          this.flush(command => command.query && command.behaviour === behaviour)
        }
      }
      return
    }
    if (this.profile === 'rlv' && this.recovery.size || now < this.nextCollection) return
    const interval = this.profile === 'rlva' ? 30000 : 2000 + (this.config?.garbageCollectionAdditionalInterval ?? 8000)
    const passes = Math.floor((now - this.nextCollection) / interval) + 1
    this.nextCollection += passes * interval
    this.captureReplies(() => {
      for (const issuer of this.orderedIssuers()) {
        if (this.available(issuer.prim)) issuer.seen = true
        else if (this.profile === 'rlv' || issuer.seen || (issuer.misses += passes) > 20) issuer.clear()
      }
    })
    if (!this.issuers.size) this.collectionRunning = false
  }
}
