import type { BuiltinImpl } from '../runtime.js'
import type { Script } from '../script.js'
import type { DetectedEntry } from './detected.js'
import type { Prim } from '../prim.js'
import { NULL_KEY } from '../values/types.js'
import { REZ_FLAG_DIE_ON_COLLIDE, REZ_FLAG_NO_COLLIDE_FAMILY, REZ_FLAG_NO_COLLIDE_OWNER, STATUS_PHANTOM } from '../generated/constants.js'
import type { Linkset } from '../linkset.js'
import { soundKey } from '../prim-params.js'

export interface CollisionFilter { name: string; key: string; accept: boolean }
/** The prim's impact sound and volume. */
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

const IMPACT_GAIN = 0.75

/**
 * Whether an impact is hard enough to play sounds: its speed in m/s times the
 * thinnest side of either object reaches 1. In-world, 0.5 m boxes played from
 * 2.18 m/s and not at 1.96, a 0.25 m cube not at 3.49 m/s, and nothing played on a
 * floor 0.1 m thick.
 */
const audible = (speed: number, thinnest: number) => speed * thinnest >= 1

/** The thinnest side of an object's root prim, in metres. */
function thinnest(linkset: Linkset) {
  const size = linkset.prims[0]?.params.size
  return size ? Math.min(size.x, size.y, size.z) : 0
}

const S = {
  STONE_STONE: '9538f37c-456e-4047-81be-6435045608d4', STONE_METAL: 'aca261d8-e145-4610-9e20-9eff990f2c12',
  STONE_GLASS: '24babf58-7156-4841-9a3f-761bdbb8e237', STONE_WOOD: '8c0f84c3-9afd-4396-b5f5-9bca2c911c20',
  STONE_FLESH: '55c3e0ce-275a-46fa-82ff-e0465f5e8703', STONE_PLASTIC: '0642fba6-5dcf-4d62-8e7b-94dbb529d117',
  STONE_RUBBER: '25a863e8-dc42-4e8a-a357-e76422ace9b5', METAL_METAL: '9e5c1297-6eed-40c0-825a-d9bcd86e3193',
  METAL_GLASS: 'bc4a4348-cfcc-4e5e-908e-8a52a8915fe6', METAL_WOOD: '874a26fd-142f-4173-8c5b-890cd846c74d',
  METAL_FLESH: '14209133-4961-4acc-9649-53fc38ee1667', METAL_PLASTIC: 'e534761c-1894-4b61-b20c-658a6fb68157',
  METAL_RUBBER: '8761f73f-6cf9-4186-8aaa-0948ed002db1', GLASS_GLASS: '6a45ba0b-5775-4ea8-8513-26008a17f873',
  GLASS_WOOD: '6e3fb0f7-6d9c-42ca-b86b-1122ff562d7d', GLASS_FLESH: '75872e8c-bc39-451b-9b0b-042d7ba36cba',
  GLASS_PLASTIC: '992a6d1b-8c77-40e0-9495-4098ce539694', GLASS_RUBBER: '2de4da5a-faf8-46be-bac6-c4d74f1e5767',
  WOOD_WOOD: '063c97d3-033a-4e9b-98d8-05c8074922cb', WOOD_FLESH: 'be582e5d-b123-41a2-a150-454c39e961c8',
  WOOD_PLASTIC: 'c70141d4-ba06-41ea-bcbc-35ea81cb8335', WOOD_RUBBER: '7d1826f4-24c4-4aac-8c2e-eff45df37783',
  FLESH_FLESH: 'dce5fdd4-afe4-4ea1-822f-dd52cac46b08', FLESH_PLASTIC: '51011582-fbca-4580-ae9e-1a5593f094ec',
  FLESH_RUBBER: '68d62208-e257-4d0c-bbe2-20c9ea9760bb', RUBBER_RUBBER: '153c8bf7-fb89-4d89-b263-47e58b1b4774',
  RUBBER_PLASTIC: '75cf3ade-9a5b-4c4d-bb35-f9799bda7fb2', PLASTIC_PLASTIC: '0e24a717-b97e-4b77-9c94-b59a5a88b2da',
}

/**
 * The default sound of two materials meeting, by PRIM_MATERIAL_STONE (0) to
 * PRIM_MATERIAL_LIGHT (7), in either order: the viewer's material table, where
 * light uses plastic's sounds. In-world, the pairs measured played these.
 */
const MATERIAL_SOUNDS: ReadonlyArray<ReadonlyArray<string>> = [
  [S.STONE_STONE, S.STONE_METAL, S.STONE_GLASS, S.STONE_WOOD, S.STONE_FLESH, S.STONE_PLASTIC, S.STONE_RUBBER, S.STONE_PLASTIC],
  [S.STONE_METAL, S.METAL_METAL, S.METAL_GLASS, S.METAL_WOOD, S.METAL_FLESH, S.METAL_PLASTIC, S.METAL_RUBBER, S.METAL_PLASTIC],
  [S.STONE_GLASS, S.METAL_GLASS, S.GLASS_GLASS, S.GLASS_WOOD, S.GLASS_FLESH, S.GLASS_PLASTIC, S.GLASS_RUBBER, S.GLASS_PLASTIC],
  [S.STONE_WOOD, S.METAL_WOOD, S.GLASS_WOOD, S.WOOD_WOOD, S.WOOD_FLESH, S.WOOD_PLASTIC, S.WOOD_RUBBER, S.WOOD_PLASTIC],
  [S.STONE_FLESH, S.METAL_FLESH, S.GLASS_FLESH, S.WOOD_FLESH, S.FLESH_FLESH, S.FLESH_PLASTIC, S.FLESH_RUBBER, S.FLESH_PLASTIC],
  [S.STONE_PLASTIC, S.METAL_PLASTIC, S.GLASS_PLASTIC, S.WOOD_PLASTIC, S.FLESH_PLASTIC, S.PLASTIC_PLASTIC, S.RUBBER_PLASTIC, S.PLASTIC_PLASTIC],
  [S.STONE_RUBBER, S.METAL_RUBBER, S.GLASS_RUBBER, S.WOOD_RUBBER, S.FLESH_RUBBER, S.RUBBER_PLASTIC, S.RUBBER_RUBBER, S.RUBBER_PLASTIC],
  [S.STONE_PLASTIC, S.METAL_PLASTIC, S.GLASS_PLASTIC, S.WOOD_PLASTIC, S.FLESH_PLASTIC, S.PLASTIC_PLASTIC, S.RUBBER_PLASTIC, S.PLASTIC_PLASTIC],
]

/** What an object that never called plays when it hits land, whatever its material (SND_STONE_DIRT_02). */
const LAND_SOUND = 'cbe75eb2-3375-41d8-9e3f-2ae46b4164ed'

const materialOf = (linkset: Linkset) => linkset.prims[0]!.params.material

/** The prim whose setting an object uses: its root once the root has called, else the first child with a sound. */
function settingPrim(linkset: Linkset): Prim | undefined {
  const [root, ...children] = linkset.prims
  return root?.collisionSound ? root : children.find(p => p.collisionSound && p.collisionSound.sound !== NULL_KEY)
}

function trigger(root: Prim | undefined, sound: string, volume: number) {
  root?.sound.triggers.push({ sound, volume, position: { ...root.regionPosition() } })
}

/**
 * The sounds an impact plays: `mover` lands on `struck` at `speed` m/s. The caller
 * vouches that the objects touched. Each object that set a sound triggers it from
 * its root at 0.75 times one volume: the mover's root's once that root has called,
 * else the struck object's, else the mover's child's. When the setting an object
 * uses holds NULL_KEY, as "" and a missing name leave it, the impact plays nothing.
 * When neither object ever called, one root plays the sound of the two roots'
 * materials at 0.75 times the speed times the thinnest side of either root: the
 * struck object's when a lone prim lands on a linkset, else the mover's.
 */
export function playCollisionSounds(mover: Linkset, struck: Linkset, speed: number) {
  const size = Math.min(thinnest(mover), thinnest(struck))
  if (!audible(speed, size)) return
  const objects = [mover, struck].map(linkset => ({ root: linkset.prims[0], setting: settingPrim(linkset)?.collisionSound }))
  if (objects.some(({ setting }) => setting?.sound === NULL_KEY)) return
  const [moving, hit] = objects
  if (!moving!.setting && !hit!.setting) {
    const sound = MATERIAL_SOUNDS[materialOf(mover)]?.[materialOf(struck)]
    const player = mover.prims.length === 1 && struck.prims.length > 1 ? hit! : moving!
    if (sound) trigger(player.root, sound, IMPACT_GAIN * speed * size)
    return
  }
  const volume = (mover.prims[0]?.collisionSound ? moving!.setting : hit!.setting ?? moving!.setting)?.volume ?? 0
  const gain = IMPACT_GAIN * volume
  if (gain <= 0) return
  for (const { root, setting } of objects) {
    if (setting) trigger(root, setting.sound, gain)
  }
}

/**
 * The sound `linkset` plays landing on the ground at `speed` m/s: its own sound at
 * 0.75 times its volume, nothing for NULL_KEY, and when it never called the dirt
 * sound at 0.75 times the speed times the thinnest side of its root.
 */
export function playLandSound(linkset: Linkset, speed: number) {
  const size = thinnest(linkset)
  if (!audible(speed, size)) return
  const root = linkset.prims[0]
  const setting = settingPrim(linkset)?.collisionSound
  if (!setting) trigger(root, LAND_SOUND, IMPACT_GAIN * speed * size)
  else if (setting.sound !== NULL_KEY && setting.volume > 0) trigger(root, setting.sound, IMPACT_GAIN * setting.volume)
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
  if (event.startsWith('land_collision')) {
    if (dies) return linkset.remove()
    // An idle script gets the event at once, not through the clock's queue.
    if (script.wakeAt === undefined && !script.handling && linkset.clock.dropsLiveLandEvent(script, event)) return
    return deliver(payload)
  }
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
