import type { BuiltinImpl } from '../runtime.js'
import type { Script } from '../script.js'
import type { DetectedEntry } from './detected.js'
import type { Prim } from '../prim.js'
import { NULL_KEY } from '../values/types.js'
import { REZ_FLAG_DIE_ON_COLLIDE, REZ_FLAG_NO_COLLIDE_FAMILY, REZ_FLAG_NO_COLLIDE_OWNER, STATUS_PHANTOM } from '../generated/constants.js'
import type { Linkset } from '../linkset.js'
import { soundKey } from '../prim-params.js'

export interface CollisionFilter { name: string; key: string; accept: boolean }
/** The prim's impact sound and volume. Audio playback and particles are not simulated. */
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

/** "" stores NULL_KEY at volume 0; a sound's name stores its key, a key is kept, and any other name stores NULL_KEY. */
export const llCollisionSound: BuiltinImpl = (ctx, args) => {
  const sound = String(args[0])
  ctx.prim.collisionSound = sound === ''
    ? { sound: NULL_KEY, volume: 0 }
    : { sound: soundKey(ctx.prim, sound) ?? NULL_KEY, volume: Math.min(1, Math.max(0, Math.fround(Number(args[1])))) }
}

/** Impact speed in m/s from which a collision plays sounds. In-world, drops of 0.2 m (1.98 m/s) played none and drops of 0.25 m (2.21 m/s) did. */
export const COLLISION_SOUND_MIN_SPEED = 2

const IMPACT_GAIN = 0.75

/** The prim whose setting an object uses: its root once the root has called, else the first child with a sound. */
function settingPrim(linkset: Linkset): Prim | undefined {
  const [root, ...children] = linkset.prims
  return root?.collisionSound ? root : children.find(p => p.collisionSound && p.collisionSound.sound !== NULL_KEY)
}

/**
 * The sounds an impact plays: `mover` lands on `struck` at `speed` m/s. The caller
 * vouches that the objects touched. Each object that set a sound triggers it from
 * its root at 0.75 times one volume: the mover's root's once that root has called,
 * else the struck object's, else the mover's child's. When the setting an object
 * uses holds NULL_KEY, as "" and a missing name leave it, the impact plays nothing.
 * Objects that never called play nothing here; their default material sounds are
 * not simulated.
 */
export function playCollisionSounds(mover: Linkset, struck: Linkset, speed: number) {
  if (!(speed >= COLLISION_SOUND_MIN_SPEED)) return
  const objects = [mover, struck].map(linkset => ({ root: linkset.prims[0], setting: settingPrim(linkset)?.collisionSound }))
  if (objects.some(({ setting }) => setting?.sound === NULL_KEY)) return
  const [moving, hit] = objects
  const volume = (mover.prims[0]?.collisionSound ? moving!.setting : hit!.setting ?? moving!.setting)?.volume ?? 0
  const gain = IMPACT_GAIN * volume
  if (gain <= 0) return
  for (const { root, setting } of objects) {
    if (setting && root) root.sound.triggers.push({ sound: setting.sound, volume: gain, position: { ...root.regionPosition() } })
  }
}

/** Opens this prim, root or child, to gifts its owner could not otherwise put there. */
export const llAllowInventoryDrop: BuiltinImpl = (ctx, args) => {
  ctx.prim.allowInventoryDrop = Number(args[0]) !== 0
}

export const llSetRemoteScriptAccessPin: BuiltinImpl = (ctx, args) => {
  ctx.prim.remoteScriptAccessPin = Number(args[0])
}

/** Whether REZ_FLAG_NO_COLLIDE_FAMILY on either object hides this collision: same rezzer, or one rezzed the other. */
function sameFamily(linkset: Linkset, key: string): boolean {
  const other = linkset.peers.find(l => l.prims.some(p => p.key.toLowerCase() === key))
  if (!other) return false
  if (!(((linkset.rez?.flags ?? 0) | (other.rez?.flags ?? 0)) & REZ_FLAG_NO_COLLIDE_FAMILY)) return false
  const root = (l: Linkset) => l.prims[0]!.key.toLowerCase()
  const mine = linkset.rez?.rezzerKey.toLowerCase(), theirs = other.rez?.rezzerKey.toLowerCase()
  return mine !== undefined && mine === theirs || mine === root(other) || theirs === root(linkset)
}

/** Filter at test injection, before queueing. Completed events keep their detected data. */
export function withCollisionFilter(script: Script, event: string, payload: Record<string, unknown>, deliver: (payload: Record<string, unknown>) => void): void {
  const linkset = script.linkset
  const flags = linkset.rez?.flags ?? 0
  // In-world, a die-on-collide object was deleted at its first collision, object, avatar or
  // ground, before its collision_start or land_collision_start handler ran.
  // A physical one that detected volume fell through the ground, with no land collision to die on.
  const dies = !!(flags & REZ_FLAG_DIE_ON_COLLIDE) && !linkset.prims.some(p => p.volumeDetect)
  if (event.startsWith('land_collision')) return dies ? linkset.remove() : deliver(payload)
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
  if (dies) return linkset.remove()
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
