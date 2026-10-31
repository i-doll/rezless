import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { Script } from '../script.js'
import type { Prim } from '../prim.js'
import { DEBUG_CHANNEL, ACTIVE, PASSIVE, SCRIPTED, DAMAGEABLE, STATUS_PHYSICS } from '../generated/constants.js'
import type { LinksetClock } from '../clock.js'
import type { DetectedEntry } from './detected.js'
import { findObjectPrim } from './object-reads.js'
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

interface Delivery {
  readonly script: Script
  readonly payload: Record<string, unknown>
  readonly complete: () => void
  active: boolean
}
const deliveries = new WeakMap<LinksetClock, Set<Delivery>>()

/** Called when a damage handler starts and finishes, including suspension/abandonment. */
export function enterDamageEvent(payload: Record<string, unknown>): void {
  const delivery = payload['__damageDelivery'] as Delivery | undefined
  if (delivery) delivery.active = true
}
export function leaveDamageEvent(payload: Record<string, unknown>): void {
  const delivery = payload['__damageDelivery'] as Delivery | undefined
  if (!delivery) return
  delivery.active = false
  deliveries.get(delivery.script.linkset.clock)?.delete(delivery)
  delivery.complete()
}

/** Release a barrier when reset, state change, death or queue overflow drops its event. */
export function flushDamageEvents(clock: LinksetClock): void {
  const pending = deliveries.get(clock)
  if (!pending?.size) return
  const queued = new Set(clock.pendingEvents().map((e) => e.payload))
  for (const delivery of [...pending]) {
    const parked = delivery.script.parkedEvents.some((event) => event.payload === delivery.payload)
    if (!delivery.script.dead && (delivery.active || queued.has(delivery.payload) || parked)) continue
    pending.delete(delivery)
    delivery.complete()
  }
}

function dispatch(ctx: CallContext, scripts: readonly Script[], entry: DetectedEntry, apply: () => void, skipAdjustment = false): void {
  const targets = scripts.filter((s) => s.running && !s.dead)
  const adjustmentEnabled = !skipAdjustment && (ctx.linkset.world?.region(ctx.linkset.region).env?.['allow_damage_adjust'] !== '0')
  const adjust = adjustmentEnabled ? targets.filter((s) => s.handles('on_damage')) : []
  const notify = () => {
    apply()
    for (const s of targets) {
      if (s.running && !s.dead && s.handles('final_damage')) {
        ctx.linkset.clock.schedule(s, ctx.linkset.clock.now, 'final_damage', { num_detected: 1, detected: [entry] })
      }
    }
  }
  let remaining = adjust.length
  if (!remaining) {
    notify()
    return
  }
  let pending = deliveries.get(ctx.linkset.clock)
  if (!pending) deliveries.set(ctx.linkset.clock, pending = new Set())
  for (const s of adjust) {
    const payload = { num_detected: 1, detected: [entry] } as Record<string, unknown>
    const delivery: Delivery = {
      script: s,
      payload,
      active: false,
      complete: () => {
        if (--remaining === 0) notify()
      },
    }
    payload['__damageDelivery'] = delivery
    pending.add(delivery)
    ctx.linkset.clock.schedule(s, ctx.linkset.clock.now, 'on_damage', payload)
  }
}

export const llGetHealth: BuiltinImpl = (ctx, args) => {
  const id = (args[0] as string).toLowerCase()
  const prim = findObjectPrim(ctx, id)
  if (prim) return prim.params.health
  const avatar = combatAvatars(ctx.script).get(id)
  if (avatar) return avatar.health
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
  // Aditi silently ignores calls outside on_damage, including negative indexes.
  if (context?.event !== 'on_damage') return undefined
  const damage = context.entries[args[0] as number]?.damage
  if (damage) damage.amount = args[1] as number
  return undefined
}

const damageTimes = new WeakMap<Prim, Map<string, number[]>>()

function throttled(ctx: CallContext, id: string): boolean {
  const root = ctx.linkset.prims[0]!
  let targets = damageTimes.get(root)
  if (!targets) damageTimes.set(root, targets = new Map())
  const recent = (targets.get(id) ?? []).filter((at) => at > ctx.linkset.clock.now - 30000)
  if (recent.length >= 10) {
    const text = 'llDamage: damage throttle exceeded for target.'
    ctx.state.chat.push({ channel: DEBUG_CHANNEL, text, type: 'shout' })
    ctx.linkset.routeChat(ctx.prim, 'shout', DEBUG_CHANNEL, text)
    return true
  }
  recent.push(ctx.linkset.clock.now)
  targets.set(id, recent)
  return false
}

export const llDamage: BuiltinImpl = (ctx, args) => {
  if (!ctx.linkset.damageEnabled) return undefined
  const id = (args[0] as string).toLowerCase()
  const prim = findObjectPrim(ctx, id)
  const avatar = combatAvatars(ctx.script).get(id)
  if (prim) {
    if (!prim.linkset!.damageEnabled) return undefined
  } else if (!avatar?.damageEnabled || avatar.region !== ctx.linkset.region) return undefined
  const amount = args[1] as number
  const ownAttachment = !prim && (avatar!.scripts?.some((s) => s.linkset === ctx.linkset) ?? false)
  if (amount >= 0 && !ownAttachment && !ctx.linkset.damageThrottleExempt && throttled(ctx, id)) {
    return undefined
  }
  const entry: DetectedEntry = {
    key: ctx.prim.key,
    name: ctx.prim.name,
    owner: ctx.linkset.owner,
    rezzer: ctx.linkset.owner,
    pos: ctx.prim.regionPosition(),
    rot: ctx.prim.regionRotation(),
    vel: ZERO_VECTOR,
    linkNumber: prim?.linkNumber ?? 0,
    type: SCRIPTED | ((ctx.linkset.prims[0]!.statusFlags & STATUS_PHYSICS) ? ACTIVE : PASSIVE)
      | (ctx.linkset.allScripts().some((s) => s.running && !s.dead && (s.handles('on_damage') || s.handles('final_damage'))) ? DAMAGEABLE : 0),
    damage: { amount, original: amount, type: args[2] as number },
  }
  // Object health belongs to its scripts. The simulator only changes avatar health.
  const scripts = prim ? prim.linkset!.allScripts() : avatar!.scripts ?? []
  dispatch(ctx, scripts, entry, () => {
    if (!prim && avatar) {
      const before = avatar.health
      avatar.health = Math.max(0, Math.min(100, avatar.health - entry.damage!.amount))
      if (before > 0 && avatar.health === 0) {
        for (const attachment of avatar.scripts ?? []) {
          if (attachment.running && !attachment.dead && attachment.handles('on_death')) {
            ctx.linkset.clock.schedule(attachment, ctx.linkset.clock.now, 'on_death')
          }
        }
      }
    }
  }, ownAttachment)
  return undefined
}
