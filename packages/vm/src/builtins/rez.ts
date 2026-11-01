import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { Linkset } from '../linkset.js'
import type { LslType, LslValue, Rotation, Vector } from '../values/types.js'
import { NULL_KEY, ZERO_ROTATION, ZERO_VECTOR, isVector, isRotation } from '../values/types.js'
import { rotateVector, mulRotation } from '../values/ops.js'
import { listElementType } from '../values/list-types.js'
import { truncateUtf8 } from '../values/utf8.js'
import { requestKey } from '../keys.js'
import { InventoryType } from '../inventory.js'
import * as C from '../generated/constants.js'
import { sayError } from './debug.js'

interface Options {
  position: Vector
  rotation: Rotation
  velocity: Vector
  velocityLocal: boolean
  inherit: boolean
  atRoot: boolean
  param: number
  startString: string
  flags: number | undefined
  acceleration: Vector
  accelerationLocal: boolean
  omega: { axis: Vector; local: boolean; spin: number; gain: number } | undefined
  damage: number | undefined
  damageType: number | undefined
  sound: { sound: string; volume: number; loop: boolean } | undefined
  collisionSound: { sound: string; volume: number } | undefined
  locks: Vector | undefined
}

const add = (a: Vector, b: Vector): Vector => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
function normalized(r: Rotation): Rotation {
  const n = Math.hypot(r.x, r.y, r.z, r.s)
  return n > 0 ? { x: r.x / n, y: r.y / n, z: r.z / n, s: r.s / n } : { ...ZERO_ROTATION }
}
function defaults(ctx: CallContext): Options {
  return {
    position: { ...ctx.prim.regionPosition() }, rotation: { ...ZERO_ROTATION },
    velocity: { ...ZERO_VECTOR }, velocityLocal: false, inherit: false,
    atRoot: false, param: 0, startString: '', flags: undefined,
    acceleration: { ...ZERO_VECTOR }, accelerationLocal: false,
    omega: undefined, damage: undefined, damageType: undefined,
    sound: undefined, collisionSound: undefined, locks: undefined,
  }
}

const signatures: Readonly<Record<number, readonly LslType[]>> = {
  [C.REZ_PARAM]: ['integer'], [C.REZ_FLAGS]: ['integer'],
  [C.REZ_POS]: ['vector', 'integer', 'integer'],
  [C.REZ_ROT]: ['rotation', 'integer'],
  [C.REZ_VEL]: ['vector', 'integer', 'integer'],
  [C.REZ_ACCEL]: ['vector', 'integer'],
  [C.REZ_OMEGA]: ['vector', 'integer', 'float', 'float'],
  [C.REZ_DAMAGE]: ['float'], [C.REZ_DAMAGE_TYPE]: ['integer'],
  [C.REZ_SOUND]: ['string', 'float', 'integer'],
  [C.REZ_SOUND_COLLIDE]: ['string', 'float'],
  [C.REZ_LOCK_AXES]: ['vector'], [C.REZ_PARAM_STRING]: ['string'],
}

function matches(list: readonly LslValue[], i: number, type: LslType): boolean {
  const value = list[i]
  if (value === undefined) return false
  if (type === 'integer') return typeof value === 'number' && (listElementType(list, i) ?? 'integer') === 'integer'
  if (type === 'float') return typeof value === 'number'
  if (type === 'vector') return isVector(value)
  if (type === 'rotation') return isRotation(value)
  return typeof value === 'string'
}

function options(ctx: CallContext, list: readonly LslValue[]): Options | undefined {
  const o = defaults(ctx)
  for (let i = 0; i < list.length;) {
    if (!matches(list, i, 'integer')) return undefined
    const param = list[i++] as number
    const signature = signatures[param]
    if (!signature || !signature.every((type, j) => matches(list, i + j, type))) return undefined
    const value = list[i]!
    switch (param) {
      case C.REZ_PARAM: o.param = value as number; break
      case C.REZ_FLAGS: o.flags = value as number; break
      case C.REZ_POS:
        o.position = list[i + 1] ? add(ctx.prim.regionPosition(), value as Vector) : { ...value as Vector }
        o.atRoot = !!list[i + 2]
        break
      case C.REZ_ROT:
        o.rotation = normalized(list[i + 1] ? mulRotation(value as Rotation, ctx.prim.regionRotation()) : value as Rotation)
        break
      case C.REZ_VEL:
        o.velocity = { ...value as Vector }; o.velocityLocal = !!list[i + 1]; o.inherit = !!list[i + 2]
        break
      case C.REZ_ACCEL: o.acceleration = { ...value as Vector }; o.accelerationLocal = !!list[i + 1]; break
      case C.REZ_OMEGA: o.omega = { axis: { ...value as Vector }, local: !!list[i + 1], spin: list[i + 2] as number, gain: list[i + 3] as number }; break
      case C.REZ_DAMAGE: o.damage = value as number; break
      case C.REZ_DAMAGE_TYPE: o.damageType = value as number; break
      case C.REZ_SOUND: o.sound = { sound: value as string, volume: list[i + 1] as number, loop: !!list[i + 2] }; break
      case C.REZ_SOUND_COLLIDE: o.collisionSound = { sound: value as string, volume: list[i + 1] as number }; break
      case C.REZ_LOCK_AXES: o.locks = { ...value as Vector }; break
      case C.REZ_PARAM_STRING: o.startString = truncateUtf8(value as string, 1024); break
    }
    i += signature.length
  }
  return o
}

/** Saved centre offset, before applying the requested rez rotation. */
function centre(object: Linkset): Vector {
  const root = object.prims[0]!
  const min = { x: Infinity, y: Infinity, z: Infinity }
  const max = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const prim of object.prims) {
    const position = prim === root ? ZERO_VECTOR : prim.params.position
    const rotation = prim === root ? ZERO_ROTATION : prim.params.rotation
    const size = prim.params.size
    const axes = [
      rotateVector({ x: size.x / 2, y: 0, z: 0 }, rotation),
      rotateVector({ x: 0, y: size.y / 2, z: 0 }, rotation),
      rotateVector({ x: 0, y: 0, z: size.z / 2 }, rotation),
    ]
    for (const c of ['x', 'y', 'z'] as const) {
      const reach = axes.reduce((n, a) => n + Math.abs(a[c]), 0)
      min[c] = Math.min(min[c], position[c] - reach)
      max[c] = Math.max(max[c], position[c] + reach)
    }
  }
  return rotateVector({ x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 }, root.params.rotation)
}

function resolveSound(ctx: CallContext, name: string): string {
  return ctx.prim.inventory.find(i => i.name === name && i.type === InventoryType.SOUND)?.key ?? name
}

function rez(ctx: CallContext, name: string, o: Options): string {
  const item = ctx.prim.inventory.find(i => i.name === name)
  if (!item) {
    sayError(ctx, `Could not find object '${name}'.`)
    ctx.sleep(1000)
    return ''
  }
  const key = requestKey(ctx, 'rez', ++ctx.linkset.rezCounter)
  // The simulator allocates a key for a wrong-type item but creates no object.
  if (item.type !== InventoryType.OBJECT || !item.object?.prims.length) return key
  const origin = ctx.prim.regionPosition()
  const reach = 10 + Math.hypot(ctx.prim.params.size.x, ctx.prim.params.size.y, ctx.prim.params.size.z) / 2
  if (Math.hypot(o.position.x - origin.x, o.position.y - origin.y, o.position.z - origin.z) > reach) return NULL_KEY
  const object = item.object.copy({
    owner: ctx.linkset.owner, startParameter: o.param, startString: o.startString,
    ...(ctx.linkset.world ? { world: ctx.linkset.world } : {}),
    ...(ctx.linkset.region !== undefined ? { region: ctx.linkset.region } : {}),
  }, ctx.linkset)
  const root = object.prims[0]!
  root.key = key
  const offset = o.atRoot ? ZERO_VECTOR : centre(item.object)
  root.params.position = { x: o.position.x - offset.x, y: o.position.y - offset.y, z: o.position.z - offset.z }
  root.params.rotation = normalized(o.rotation)
  if (o.flags !== undefined) {
    if (o.flags & C.REZ_FLAG_PHYSICAL) root.setStatus(C.STATUS_PHYSICS, true)
    if (o.flags & C.REZ_FLAG_PHANTOM) root.setStatus(C.STATUS_PHANTOM, true)
    if (o.flags & C.REZ_FLAG_BLOCK_GRAB_OBJECT) root.setStatus(C.STATUS_BLOCK_GRAB_OBJECT, true)
    root.params.tempOnRez ||= !!(o.flags & C.REZ_FLAG_TEMP)
  }
  if (o.locks) {
    root.setStatus(C.STATUS_ROTATE_X, !o.locks.x)
    root.setStatus(C.STATUS_ROTATE_Y, !o.locks.y)
    root.setStatus(C.STATUS_ROTATE_Z, !o.locks.z)
  }
  let velocity = o.velocityLocal ? rotateVector(o.velocity, root.params.rotation) : o.velocity
  if (o.inherit) velocity = add(velocity, ctx.linkset.rez?.velocity ?? ctx.linkset.world?.sensorProperties.get(ctx.linkset)?.velocity ?? ZERO_VECTOR)
  const scale = Math.max(1, Math.abs(velocity.x) / 200, Math.abs(velocity.y) / 200, Math.abs(velocity.z) / 200)
  velocity = root.statusFlags & C.STATUS_PHYSICS ? { x: velocity.x / scale, y: velocity.y / scale, z: velocity.z / scale } : { ...ZERO_VECTOR }
  object.rez = {
    rezzer: ctx.prim, rezzerKey: ctx.linkset.prims[0]!.key, item,
    copyable: !!(item.permMask.owner & C.PERM_COPY), flags: o.flags ?? 0,
    velocity, acceleration: o.acceleration, accelerationLocal: o.accelerationLocal,
    collisionSound: o.collisionSound ? { sound: resolveSound(ctx, o.collisionSound.sound), volume: Math.max(0, Math.min(1, o.collisionSound.volume)) } : null,
  }
  if (o.omega) root.params.omega = {
    axis: o.omega.local ? rotateVector(o.omega.axis, root.params.rotation) : o.omega.axis,
    spinrate: o.omega.spin, gain: o.omega.gain,
  }
  if (o.damage !== undefined) root.params.damage.amount = o.damage
  if (o.damageType !== undefined) root.params.damage.type = o.damageType
  if (o.sound) root.sound.current = {
    sound: resolveSound(ctx, o.sound.sound), volume: Math.max(0, Math.min(1, o.sound.volume)), loop: o.sound.loop, sync: 'none',
  }
  object.setTemporary(root.params.tempOnRez)
  object.world?.sensorProperties.set(object, { velocity })
  if (!object.rez.copyable) {
    ctx.prim.inventory.splice(ctx.prim.inventory.indexOf(item), 1)
    for (const s of ctx.prim.scripts) if (s.running) ctx.linkset.clock.schedule(s, ctx.linkset.clock.now, 'changed', { changes: C.CHANGED_INVENTORY })
  }
  for (const script of object.allScripts()) script.queueRez()
  for (const script of ctx.prim.scripts) {
    if (script.running) ctx.linkset.clock.schedule(script, ctx.linkset.clock.now, 'object_rez', { id: key })
  }
  return key
}

function legacy(atRoot: boolean): BuiltinImpl {
  return (ctx, args) => {
    const o = defaults(ctx)
    o.position = args[1] as Vector; o.velocity = args[2] as Vector
    o.rotation = normalized(args[3] as Rotation); o.param = args[4] as number; o.atRoot = atRoot
    rez(ctx, args[0] as string, o)
    return undefined
  }
}
export const llRezObject = legacy(false)
export const llRezAtRoot = legacy(true)
export const llRezObjectWithParams: BuiltinImpl = (ctx, args) => {
  const o = options(ctx, args[1] as readonly LslValue[])
  return o ? rez(ctx, args[0] as string, o) : NULL_KEY
}

export const llDerezObject: BuiltinImpl = (ctx, args) => {
  const id = (args[0] as string).toLowerCase(), mode = args[1] as number
  if (![C.DEREZ_DIE, C.DEREZ_MAKE_TEMP, C.DEREZ_TO_INVENTORY].includes(mode)) return 0
  const target = ctx.linkset.peers.find(l => !l.dead && l.prims[0]?.key.toLowerCase() === id && l.region === ctx.linkset.region)
  const provenance = target?.rez
  if (!target || !provenance || !provenance.copyable || target.owner !== ctx.linkset.owner || provenance.rezzerKey !== ctx.linkset.prims[0]!.key) return 0
  if (mode === C.DEREZ_MAKE_TEMP) {
    target.setTemporary(true)
    return 1
  }
  if (mode === C.DEREZ_TO_INVENTORY) {
    if (!provenance.rezzer.inventory.includes(provenance.item)) return 0
    provenance.item.object = target.copy()
  }
  target.remove()
  return 1
}

/** Initial rez velocity; this VM does not integrate physical motion. */
export const llGetVel: BuiltinImpl = ctx => ctx.linkset.rez?.velocity ?? ctx.linkset.world?.sensorProperties.get(ctx.linkset)?.velocity ?? { ...ZERO_VECTOR }

/** The force supplied with REZ_ACCEL, in its requested coordinate frame. */
export const llGetForce: BuiltinImpl = ctx => ctx.linkset.rez?.acceleration ?? { ...ZERO_VECTOR }
