import type { BuiltinImpl } from '../runtime.js'
import type { Script } from '../script.js'
import type { DetectedEntry } from './detected.js'
import { NULL_KEY } from '../values/types.js'
import { STATUS_PHANTOM } from '../generated/constants.js'

export interface CollisionFilter { name: string; key: string; accept: boolean }
/** Requested impact sound and volume. Audio playback and particles are not simulated. */
export interface CollisionSound { sound: string; volume: number }

const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const llCollisionFilter: BuiltinImpl = (ctx, args) => {
  const key = String(args[1])
  ctx.prim.collisionFilter = { name: String(args[0]), key: KEY.test(key) ? key.toLowerCase() : NULL_KEY, accept: Number(args[2]) !== 0 }
}

export const llVolumeDetect: BuiltinImpl = (ctx, args) => {
  const enabled = Number(args[0]) !== 0
  for (const prim of ctx.linkset.prims) {
    if (prim.volumeDetect === enabled) continue
    prim.volumeDetect = enabled
    prim.setStatus(STATUS_PHANTOM, enabled)
  }
}

export const llCollisionSound: BuiltinImpl = (ctx, args) => {
  ctx.prim.collisionSound = { sound: String(args[0]), volume: Number(args[1]) }
}

/** Foreign inventory drops are opt-in, and only the root can change this flag. */
export const llAllowInventoryDrop: BuiltinImpl = (ctx, args) => {
  if (ctx.prim === ctx.linkset.prims[0]) ctx.prim.allowInventoryDrop = Number(args[0]) !== 0
}

export const llSetRemoteScriptAccessPin: BuiltinImpl = (ctx, args) => {
  ctx.prim.remoteScriptAccessPin = Number(args[0])
}

/** Tests supply collision events explicitly. No overlap detection or physics runs. */
export function withCollisionFilter(script: Script, event: string, payload: Record<string, unknown>, deliver: (payload: Record<string, unknown>) => void): void {
  if (event !== 'collision_start' && event !== 'collision' && event !== 'collision_end') return deliver(payload)
  if (script.host.volumeDetect && event === 'collision') return
  const filter = script.host.collisionFilter
  if (!Array.isArray(payload['detected'])) return deliver(payload)
  const detected = (payload['detected'] as DetectedEntry[]).filter(entry => {
    const matches = (!filter.name || entry.name === filter.name) && (filter.key === NULL_KEY || entry.key.toLowerCase() === filter.key)
    return matches === filter.accept
  })
  if (detected.length) deliver({ ...payload, detected, num_detected: detected.length })
}
