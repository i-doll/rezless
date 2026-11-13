import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { AttachedSound, Prim, SoundTrigger } from '../prim.js'
import type { Vector } from '../values/types.js'
import { NULL_KEY } from '../values/types.js'
import { InventoryType } from '../inventory.js'
import { SOUND_LOOP, SOUND_SYNC, SOUND_TRIGGER } from '../generated/constants.js'
import { sayError } from './debug.js'

const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const volume = (value: number) => Math.max(0, Math.min(1, value))

/** Link sounds resolve names in the caller's inventory, before selecting targets. */
function resolve(ctx: CallContext, name: string): string | undefined {
  const id = KEY.test(name) ? name : ctx.prim.inventory.find(it => it.name === name && it.type === InventoryType.SOUND)?.key
  if (id !== undefined && id.toLowerCase() !== NULL_KEY) return id.toLowerCase()
  sayError(ctx, `Could not find sound '${name}'.`)
  return undefined
}

function targets(ctx: CallContext, link: number): Prim[] {
  // The documented legacy link-0 alias applies when a child addresses its root.
  if (link === 0 && ctx.prim.linkNumber > 1) return [ctx.linkset.prims[0]!]
  return ctx.linkset.resolveTargets(ctx.prim.linkNumber, link)
}

function attach(prim: Prim, sound: string, gain: number, loop: boolean, sync: AttachedSound['sync']): void {
  prim.sound.current = { sound, volume: volume(gain), loop, sync }
}

function trigger(prim: Prim, sound: string, gain: number, bounds?: { topNorthEast: Vector; bottomSouthWest: Vector }): void {
  const entry: SoundTrigger = { sound, volume: volume(gain), position: { ...prim.regionPosition() }, ...bounds }
  prim.sound.triggers.push(entry)
}

function attached(loop: boolean, sync: AttachedSound['sync']): BuiltinImpl {
  return (ctx, args) => {
    const sound = resolve(ctx, args[0] as string)
    if (sound !== undefined) attach(ctx.prim, sound, args[1] as number, loop, sync)
    return undefined
  }
}

export const llPlaySound = attached(false, 'none')
export const llLoopSound = attached(true, 'none')
export const llLoopSoundMaster = attached(true, 'master')
export const llLoopSoundSlave = attached(true, 'slave')
export const llPlaySoundSlave = attached(false, 'slave')

export const llLinkPlaySound: BuiltinImpl = (ctx, args) => {
  const sound = resolve(ctx, args[1] as string)
  if (sound === undefined) return undefined
  const flags = args[3] as number
  for (const prim of targets(ctx, args[0] as number)) {
    if (flags & SOUND_TRIGGER) trigger(prim, sound, args[2] as number)
    else attach(prim, sound, args[2] as number, !!(flags & SOUND_LOOP), flags & SOUND_SYNC ? 'slave' : 'none')
  }
  return undefined
}

export const llTriggerSound: BuiltinImpl = (ctx, args) => {
  const sound = resolve(ctx, args[0] as string)
  if (sound !== undefined) trigger(ctx.prim, sound, args[1] as number)
  return undefined
}

export const llTriggerSoundLimited: BuiltinImpl = (ctx, args) => {
  const sound = resolve(ctx, args[0] as string)
  if (sound !== undefined) trigger(ctx.prim, sound, args[1] as number, {
    topNorthEast: { ...args[2] as Vector }, bottomSouthWest: { ...args[3] as Vector },
  })
  return undefined
}

export const llPreloadSound: BuiltinImpl = (ctx, args) => {
  const sound = resolve(ctx, args[0] as string)
  if (sound !== undefined) ctx.prim.sound.preloads.push(sound)
  return undefined
}

export const llStopSound: BuiltinImpl = (ctx) => {
  ctx.prim.sound.current = null
  return undefined
}

export const llLinkStopSound: BuiltinImpl = (ctx, args) => {
  for (const prim of targets(ctx, args[0] as number)) prim.sound.current = null
  return undefined
}

export const llAdjustSoundVolume: BuiltinImpl = (ctx, args) => {
  if (ctx.prim.sound.current) ctx.prim.sound.current.volume = volume(args[0] as number)
  return undefined
}

export const llLinkAdjustSoundVolume: BuiltinImpl = (ctx, args) => {
  for (const prim of targets(ctx, args[0] as number)) {
    if (prim.sound.current) prim.sound.current.volume = volume(args[1] as number)
  }
  return undefined
}

export const llSetSoundQueueing: BuiltinImpl = (ctx, args) => {
  ctx.prim.sound.queueing = args[0] !== 0
  return undefined
}

export const llLinkSetSoundQueueing: BuiltinImpl = (ctx, args) => {
  for (const prim of targets(ctx, args[0] as number)) prim.sound.queueing = args[1] !== 0
  return undefined
}

export const llSetSoundRadius: BuiltinImpl = (ctx, args) => {
  ctx.prim.sound.radius = args[0] as number
  return undefined
}

export const llLinkSetSoundRadius: BuiltinImpl = (ctx, args) => {
  for (const prim of targets(ctx, args[0] as number)) prim.sound.radius = args[1] as number
  return undefined
}
