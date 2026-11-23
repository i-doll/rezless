import type { BuiltinImpl } from '../runtime.js'
import type { Script } from '../script.js'
import type { DetectedEntry } from './detected.js'
import { NULL_KEY } from '../values/types.js'
import { REZ_FLAG_DIE_ON_COLLIDE, REZ_FLAG_NO_COLLIDE_FAMILY, REZ_FLAG_NO_COLLIDE_OWNER, STATUS_PHANTOM } from '../generated/constants.js'
import type { Linkset } from '../linkset.js'

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
  if (ctx.prim.volumeDetect === enabled) return
  ctx.prim.volumeDetect = enabled
  ctx.prim.setStatus(STATUS_PHANTOM, enabled)
}

export const llCollisionSound: BuiltinImpl = (ctx, args) => {
  ctx.prim.collisionSound = { sound: String(args[0]), volume: Number(args[1]) }
}

/** Opens this prim, root or child, to gifts its owner could not otherwise put there. */
export const llAllowInventoryDrop: BuiltinImpl = (ctx, args) => {
  ctx.prim.allowInventoryDrop = Number(args[0]) !== 0
}

export const llSetRemoteScriptAccessPin: BuiltinImpl = (ctx, args) => {
  ctx.prim.remoteScriptAccessPin = Number(args[0])
}

const family = (linkset: Linkset) => !!((linkset.rez?.flags ?? 0) & REZ_FLAG_NO_COLLIDE_FAMILY)

/** Whether REZ_FLAG_NO_COLLIDE_FAMILY hides this collision: on either of two objects from one rezzer, or on the rezzed one of a rezzer and what it rezzed. */
function sameFamily(linkset: Linkset, key: string): boolean {
  const other = linkset.world?.linksets.find(l => l.prims.some(p => p.key.toLowerCase() === key))
  if (!other) return false
  const root = (l: Linkset) => l.prims[0]!.key.toLowerCase()
  const mine = linkset.rez?.rezzerKey.toLowerCase(), theirs = other.rez?.rezzerKey.toLowerCase()
  if (mine !== undefined && mine === theirs) return family(linkset) || family(other)
  return mine === root(other) && family(linkset) || theirs === root(linkset) && family(other)
}

/** Filter at test injection, before queueing. Completed events keep their detected data. */
export function withCollisionFilter(script: Script, event: string, payload: Record<string, unknown>, deliver: (payload: Record<string, unknown>) => void): void {
  const linkset = script.linkset
  const flags = linkset.rez?.flags ?? 0
  // In-world, a die-on-collide object was deleted at its first collision, object, avatar or
  // ground, before its collision_start or land_collision_start handler ran.
  if (event.startsWith('land_collision')) return flags & REZ_FLAG_DIE_ON_COLLIDE ? linkset.remove() : deliver(payload)
  if (event !== 'collision_start' && event !== 'collision' && event !== 'collision_end') return deliver(payload)
  let entries = Array.isArray(payload['detected']) ? payload['detected'] as DetectedEntry[] : undefined
  if (entries) {
    const owner = linkset.owner.toLowerCase()
    entries = entries.filter(entry => {
      const key = entry.key.toLowerCase()
      return !(flags & REZ_FLAG_NO_COLLIDE_OWNER && key === owner) && !sameFamily(linkset, key)
    })
    if (!entries.length) return
  }
  // In-world, it was deleted however llCollisionFilter was set, but a die-on-collide object that
  // detected volume let an object fall through it, raised collision_start and stayed.
  if (flags & REZ_FLAG_DIE_ON_COLLIDE && !linkset.prims.some(p => p.volumeDetect)) return linkset.remove()
  // In-world, an object that detects volume raised collision_start and
  // collision_end in its root's scripts only, even for a child it was entered through.
  if (script.host.volumeDetect && (event === 'collision' || script.host !== script.linkset.prims[0])) return
  const filter = script.host.collisionFilter
  if (!entries) return deliver(payload)
  const detected = entries.filter(entry => {
    const matches = (!filter.name || entry.name === filter.name) && (filter.key === NULL_KEY || entry.key.toLowerCase() === filter.key)
    return matches === filter.accept
  })
  if (detected.length) deliver({ ...payload, detected, num_detected: detected.length })
}
