import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { Script } from '../script.js'
import type { Linkset } from '../linkset.js'
import type { WorldAvatar } from '../world.js'
import { ACTIVE, PASSIVE, SCRIPTED, DAMAGEABLE, STATUS_PHYSICS, REGION_FLAG_ALLOW_DAMAGE } from '../generated/constants.js'
import type { LinksetClock } from '../clock.js'
import type { DetectedEntry } from './detected.js'
import { findObjectPrim } from './object-reads.js'
import { sayError } from './debug.js'
import { NULL_KEY, ZERO_VECTOR } from '../values/types.js'

/** An avatar supplied by a test; scripts represent its attachments. */
export interface CombatAvatar {
  health: number
  damageEnabled: boolean
  readonly scripts?: readonly Script[]
}

interface RegisteredCombatAvatar extends CombatAvatar { readonly region: string | undefined }
const avatars = new WeakMap<LinksetClock, Map<string, RegisteredCombatAvatar>>()
export function combatAvatars(script: Script): Map<string, RegisteredCombatAvatar> {
  let result = avatars.get(script.linkset.clock)
  if (!result) avatars.set(script.linkset.clock, result = new Map())
  return result
}

/** When each avatar's health last caught up with regeneration. */
const regeneratedAt = new WeakMap<object, number>()

export function registerCombatAvatar(script: Script, id: string, avatar: CombatAvatar): void {
  const registered = { ...avatar, region: script.linkset.region }
  combatAvatars(script).set(id.toLowerCase(), registered)
  regeneratedAt.set(registered, script.linkset.clock.now)
}

// In-world (main grid, 2026-11-23): a damaged avatar's health rose by just over one point
// about every 6 seconds, on a schedule that did not restart when it was damaged.
const REGENERATION_MS = 6000

/** An avatar that damage can reach: one supplied by setCombatAvatar, or a world avatar. */
interface Combatant {
  readonly region: string | undefined
  readonly damageEnabled: boolean
  readonly attachments: readonly Script[]
  readonly seat: Linkset | undefined
  health(now: number): number
  setHealth(health: number): void
}

function regenerate(holder: object, health: number, now: number, start: number): number {
  const last = regeneratedAt.get(holder) ?? start
  regeneratedAt.set(holder, now)
  const ticks = Math.floor(now / REGENERATION_MS) - Math.floor(last / REGENERATION_MS)
  return ticks > 0 && health > 0 ? Math.min(100, health + ticks) : health
}

function worldAvatar(ctx: CallContext, id: string): WorldAvatar | undefined {
  return ctx.linkset.world?.avatars.find((a) => a.key.toLowerCase() === id)
}

function combatant(ctx: CallContext, id: string): Combatant | undefined {
  const avatar = worldAvatar(ctx, id)
  const seat = avatar?.sittingOn?.linkset ?? undefined
  const registered = combatAvatars(ctx.script).get(id)
  if (registered) {
    return {
      region: registered.region,
      damageEnabled: registered.damageEnabled,
      attachments: registered.scripts ?? [],
      seat,
      health: (now) => registered.health = regenerate(registered, registered.health, now, now),
      setHealth: (health) => { registered.health = health },
    }
  }
  if (!avatar) return undefined
  const world = ctx.linkset.world!
  return {
    region: avatar.region,
    damageEnabled: ((world.region(avatar.region).flags ?? 0) & REGION_FLAG_ALLOW_DAMAGE) !== 0,
    attachments: world.linksets
      .filter((l) => !l.dead && l.attachment?.avatar.toLowerCase() === id)
      .flatMap((l) => l.allScripts()),
    seat,
    health: (now) => avatar.objectDetails.health = regenerate(avatar, avatar.objectDetails.health ?? 100, now, 0),
    setHealth: (health) => { avatar.objectDetails.health = health },
  }
}

const live = (s: Script) => s.running && !s.dead

/** One script's on_damage for a damage in progress. */
interface Delivery {
  readonly script: Script
  readonly payload: Record<string, unknown>
  readonly damage: Damage
  active: boolean
  readonly complete: () => void
}
const deliveries = new WeakMap<LinksetClock, Set<Delivery>>()

/**
 * Damage aimed at one target in one moment. It reaches the object's scripts (or the seat's),
 * then the scripts worn by each avatar it reaches, then changes their health, then says
 * final_damage to everyone it reached.
 */
interface Damage {
  readonly key: unknown
  readonly at: number
  readonly clock: LinksetClock
  readonly seat: Linkset | undefined
  readonly riders: readonly Combatant[]
  /** Who may adjust it: nobody for an avatar's own attachment, nobody when the region forbids it. */
  readonly adjust: boolean
  readonly seatEntries: DetectedEntry[]
  riderEntries: DetectedEntry[]
  phase: 'seat' | 'riders' | 'done'
  pending: Delivery[]
  /** Scripts that changed state in their handler, which costs them the final_damage. */
  readonly noFinal: Set<Script>
}
const inFlight = new WeakMap<LinksetClock, Map<unknown, Damage>>()

/** Called when a damage handler starts and finishes, including suspension/abandonment. */
export function enterDamageEvent(payload: Record<string, unknown>): void {
  const delivery = payload['__damageDelivery'] as Delivery | undefined
  if (delivery) delivery.active = true
}
export function leaveDamageEvent(payload: Record<string, unknown>): void {
  const delivery = payload['__damageDelivery'] as Delivery | undefined
  if (!delivery) return
  delivery.active = false
  delivery.complete()
}

/**
 * A state change inside on_damage ends that script's part at once: the damage goes on
 * without waiting for state_exit or state_entry, and the script gets no final_damage.
 */
export function leaveDamageOnStateChange(script: Script): void {
  for (const delivery of deliveries.get(script.linkset.clock) ?? []) {
    if (delivery.script === script && delivery.active) {
      delivery.damage.noFinal.add(script)
      delivery.complete()
    }
  }
}

/** Release a barrier when reset, state change, death or queue overflow drops its event. */
export function flushDamageEvents(clock: LinksetClock): void {
  const pending = deliveries.get(clock)
  if (!pending?.size) return
  const queued = new Set(clock.pendingEvents().map((e) => e.payload))
  for (const delivery of [...pending]) {
    const parked = delivery.script.parkedEvents.some((event) => event.payload === delivery.payload)
    if (!delivery.script.dead && (delivery.active || queued.has(delivery.payload) || parked)) continue
    delivery.complete()
  }
}

/** Ask every handler in `scripts` to adjust; true when there is someone to wait for. */
function askToAdjust(damage: Damage, scripts: readonly Script[], entries: DetectedEntry[]): boolean {
  const adjusters = damage.adjust ? scripts.filter((s) => live(s) && s.handles('on_damage')) : []
  let pending = deliveries.get(damage.clock)
  if (!pending) deliveries.set(damage.clock, pending = new Set())
  let remaining = adjusters.length
  damage.pending = adjusters.map((script) => {
    const payload: Record<string, unknown> = { num_detected: entries.length, detected: entries }
    let done = false
    const delivery: Delivery = {
      script, payload, damage, active: false,
      complete: () => {
        if (done) return
        done = true
        delivery.active = false
        deliveries.get(damage.clock)?.delete(delivery)
        if (--remaining === 0) advance(damage)
      },
    }
    payload['__damageDelivery'] = delivery
    pending.add(delivery)
    damage.clock.schedule(script, damage.clock.now, 'on_damage', payload)
    return delivery
  })
  return damage.pending.length > 0
}

/** The avatars' scripts see the damage as the seat left it: adjusted, with that as its original. */
function forRiders(entry: DetectedEntry): DetectedEntry {
  const amount = entry.damage!.amount
  return { ...entry, damage: { amount, original: amount, type: entry.damage!.type } }
}

/** Move the damage on to its next phase once nobody in the current one is still adjusting. */
function advance(damage: Damage): void {
  if (damage.phase === 'seat') {
    damage.phase = 'riders'
    damage.riderEntries = damage.seatEntries.map(forRiders)
    if (askToAdjust(damage, damage.riders.flatMap((r) => r.attachments), damage.riderEntries)) return
  }
  damage.phase = 'done'
  if (inFlight.get(damage.clock)?.get(damage.key) === damage) inFlight.get(damage.clock)!.delete(damage.key)
  for (const rider of damage.riders) {
    for (const entry of damage.riderEntries) applyToAvatar(damage.clock, rider, entry.damage!.amount)
  }
  const tell = (scripts: readonly Script[], entries: readonly DetectedEntry[]) => {
    for (const s of scripts) if (!damage.noFinal.has(s)) queueFinal(damage.clock, s, entries)
  }
  if (damage.seat) tell(damage.seat.allScripts(), damage.seatEntries)
  for (const rider of damage.riders) tell(rider.attachments, damage.riderEntries)
}

function applyToAvatar(clock: LinksetClock, avatar: Combatant, amount: number): void {
  const before = avatar.health(clock.now)
  const after = Math.max(0, Math.min(100, before - amount))
  avatar.setHealth(after)
  if (before <= 0 || after > 0) return
  // In-world (main grid, 2026-11-23): at zero health the worn scripts heard on_death, health was
  // 100 again at once, and final_damage came after on_death.
  avatar.setHealth(100)
  for (const s of avatar.attachments) {
    if (!live(s) || !s.handles('on_death')) continue
    clock.schedule(s, clock.now, 'on_death')
    // A final_damage already waiting stays ahead of on_death; this damage's comes after it.
    finals.delete(s)
  }
}

const finals = new WeakMap<Script, Record<string, unknown>>()

/**
 * Damage that lands on one script in the same moment arrives as one final_damage, with every
 * hit in num_detected, as long as that event has not started.
 */
function queueFinal(clock: LinksetClock, script: Script, entries: readonly DetectedEntry[]): void {
  if (!live(script) || !script.handles('final_damage')) return
  const waiting = finals.get(script)
  if (waiting && clock.pendingEvents().some((e) => e.payload === waiting && e.at === clock.now && e.target === script)) {
    const detected = waiting['detected'] as DetectedEntry[]
    detected.push(...entries)
    waiting['num_detected'] = detected.length
    return
  }
  const payload = { num_detected: entries.length, detected: [...entries] }
  finals.set(script, payload)
  clock.schedule(script, clock.now, 'final_damage', payload)
}

/**
 * A damage in progress that a new hit can still join: it is in its first phase and nobody has
 * started handling it.
 */
function joinable(damage: Damage | undefined, clock: LinksetClock): damage is Damage {
  if (!damage || damage.at !== clock.now || damage.phase !== (damage.seat ? 'seat' : 'riders')) return false
  const queued = new Set(clock.pendingEvents().map((e) => e.payload))
  return damage.pending.every((d) => !d.active && queued.has(d.payload))
}

function start(ctx: CallContext, key: unknown, entry: DetectedEntry, seat: Linkset | undefined, riders: readonly Combatant[], adjust: boolean): void {
  const clock = ctx.linkset.clock
  let byTarget = inFlight.get(clock)
  if (!byTarget) inFlight.set(clock, byTarget = new Map())
  const current = byTarget.get(key)
  if (joinable(current, clock)) {
    // In-world (main grid, 2026-11-23): three llDamage calls in one handler, or hits from eight
    // objects in one moment, reached the target as one on_damage with num_detected 3 or 8.
    const entries = current.seat ? current.seatEntries : current.riderEntries
    entries.push(entry)
    for (const d of current.pending) d.payload['num_detected'] = entries.length
    return
  }
  const damage: Damage = {
    key, at: clock.now, clock, seat, riders, adjust, noFinal: new Set(),
    seatEntries: seat ? [entry] : [], riderEntries: seat ? [] : [entry], phase: seat ? 'seat' : 'riders', pending: [],
  }
  byTarget.set(key, damage)
  const waiting = seat
    ? askToAdjust(damage, seat.allScripts(), damage.seatEntries)
    : askToAdjust(damage, riders.flatMap((r) => r.attachments), damage.riderEntries)
  if (!waiting) advance(damage)
}

export const llGetHealth: BuiltinImpl = (ctx, args) => {
  const id = (args[0] as string).toLowerCase()
  const prim = findObjectPrim(ctx, id)
  if (prim) return prim.params.health
  const avatar = combatant(ctx, id)
  if (avatar && avatar.region === ctx.linkset.region) return avatar.health(ctx.linkset.clock.now)
  // The owner is the one implicit avatar, as with the other agent builtins.
  const ownerPresent = id !== NULL_KEY && ctx.linkset.peers.some(
    (l) => l.region === ctx.linkset.region && l.owner.toLowerCase() === id,
  )
  return ownerPresent ? 100 : 0
}

export const llSetDamage: BuiltinImpl = (ctx, args) => {
  ctx.prim.params.damage.amount = args[0] as number
  return undefined
}

export const llAdjustDamage: BuiltinImpl = (ctx, args) => {
  const context = ctx.state.detectedStack.at(-1)
  // In-world (main grid, 2026-11-23): each call outside on_damage said this, also from
  // final_damage, on_death, state_exit and state_entry, and the script went on. Aditi was silent.
  if (context?.event !== 'on_damage') {
    sayError(ctx, 'llAdjustDamage may only be called from the on_damage() event handler')
    return undefined
  }
  // Inside on_damage a negative or out-of-range index does nothing, silently.
  const damage = context.entries[args[0] as number]?.damage
  if (damage) damage.amount = args[1] as number
  return undefined
}

export const llDamage: BuiltinImpl = (ctx, args) => {
  if (!ctx.linkset.damageEnabled) return undefined
  const id = (args[0] as string).toLowerCase()
  const prim = findObjectPrim(ctx, id)
  // In-world (main grid, 2026-11-23): damage aimed at a child prim's key or at a worn object's key
  // reached nobody. Only an object's root takes damage.
  if (prim && (prim !== prim.linkset!.prims[0] || prim.linkset!.attachment)) return undefined
  const avatar = prim ? undefined : combatant(ctx, id)
  if (prim) {
    if (!prim.linkset!.damageEnabled) return undefined
  } else if (!avatar?.damageEnabled || avatar.region !== ctx.linkset.region) return undefined
  const amount = args[1] as number
  // In-world (main grid, 2026-11-23): no hit was refused or throttled: 42 hits on one object in
  // 8 seconds, and 13 separate hits on an avatar within a second, from objects of either owner.
  const entry: DetectedEntry = {
    key: ctx.prim.key,
    name: ctx.prim.name,
    owner: ctx.linkset.owner,
    rezzer: ctx.linkset.owner,
    pos: ctx.prim.regionPosition(),
    rot: ctx.prim.regionRotation(),
    vel: ZERO_VECTOR,
    linkNumber: 0,
    type: SCRIPTED | ((ctx.linkset.prims[0]!.statusFlags & STATUS_PHYSICS) ? ACTIVE : PASSIVE)
      | (ctx.linkset.allScripts().some((s) => live(s) && (s.handles('on_damage') || s.handles('final_damage'))) ? DAMAGEABLE : 0),
    damage: { amount, original: amount, type: args[2] as number },
  }
  const adjustAllowed = ctx.linkset.world?.region(ctx.linkset.region).env?.['allow_damage_adjust'] !== '0'
  if (prim) {
    const target = prim.linkset!
    // In-world (main grid, 2026-11-23): damage aimed at a seat reached the seat's scripts, then
    // the sitter's worn scripts, and the sitter lost health.
    const sitters = (ctx.linkset.world?.avatars ?? [])
      .filter((a) => a.sittingOn?.linkset === target)
      .map((a) => combatant(ctx, a.key.toLowerCase()))
      .filter((c): c is Combatant => !!c?.damageEnabled)
    start(ctx, target, entry, target, sitters, adjustAllowed)
    return undefined
  }
  // In-world (main grid, 2026-11-23): damage from the avatar's own attachment skipped on_damage,
  // also on a seat, and took the health inside the llDamage call; the seat heard nothing.
  const own = ctx.linkset.attachment?.avatar.toLowerCase() === id
    || avatar!.attachments.some((s) => s.linkset === ctx.linkset)
  // In-world (main grid, 2026-11-23): damage to a seated avatar reached the seat's scripts first,
  // unless the seat itself dealt it; then the avatar's worn scripts.
  const seat = own || avatar!.seat === ctx.linkset ? undefined : avatar!.seat
  start(ctx, `${own ? 'own' : 'avatar'}:${id}`, entry, seat, [avatar!], adjustAllowed && !own)
  return undefined
}
