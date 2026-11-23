import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { AttachedSound, PrimSoundState, SoundTrigger } from '../prim.js'
import type { Vector } from '../values/types.js'
import { isPrim, type Link } from '../linkset.js'
import { NULL_KEY } from '../values/types.js'
import { SOUND_LOOP, SOUND_SYNC, SOUND_TRIGGER } from '../generated/constants.js'
import { sayError } from './debug.js'
import { soundKey } from '../prim-params.js'

const volume = (value: number) => Math.max(0, Math.min(1, value))

/** Link sounds resolve names in the caller's inventory, before selecting targets. */
function resolve(ctx: CallContext, name: string): string | undefined {
  const id = soundKey(ctx.prim, name)
  if (id !== null && id !== NULL_KEY) return id
  sayError(ctx, `Could not find sound '${name}'.`)
  ctx.sleep(1000)
  return undefined
}

function attach(state: PrimSoundState, sound: string, gain: number, loop: boolean, sync: AttachedSound['sync']): void {
  state.current = { sound, volume: volume(gain), loop, sync }
}

function trigger(link: Link, sound: string, gain: number, bounds?: { topNorthEast: Vector; bottomSouthWest: Vector }): void {
  const position = isPrim(link) ? link.regionPosition() : link.position
  const entry: SoundTrigger = { sound, volume: volume(gain), position: { ...position }, ...bounds }
  link.sound.triggers.push(entry)
}

function attached(loop: boolean, sync: AttachedSound['sync']): BuiltinImpl {
  return (ctx, args) => {
    const sound = resolve(ctx, args[0] as string)
    if (sound !== undefined) attach(ctx.prim.sound, sound, args[1] as number, loop, sync)
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
  for (const prim of ctx.linkset.linksWithSitters(ctx.prim, args[0] as number)) {
    if (flags & SOUND_TRIGGER) trigger(prim, sound, args[2] as number)
    else attach(prim.sound, sound, args[2] as number, !!(flags & SOUND_LOOP), flags & SOUND_SYNC ? 'slave' : 'none')
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
  for (const prim of ctx.linkset.linksWithSitters(ctx.prim, args[0] as number)) prim.sound.current = null
  return undefined
}

export const llAdjustSoundVolume: BuiltinImpl = (ctx, args) => {
  if (ctx.prim.sound.current) ctx.prim.sound.current.volume = volume(args[0] as number)
  return undefined
}

export const llLinkAdjustSoundVolume: BuiltinImpl = (ctx, args) => {
  for (const prim of ctx.linkset.linksWithSitters(ctx.prim, args[0] as number)) {
    if (prim.sound.current) prim.sound.current.volume = volume(args[1] as number)
  }
  return undefined
}

export const llSetSoundQueueing: BuiltinImpl = (ctx, args) => {
  ctx.prim.sound.queueing = args[0] !== 0
  return undefined
}

export const llLinkSetSoundQueueing: BuiltinImpl = (ctx, args) => {
  for (const prim of ctx.linkset.linksWithSitters(ctx.prim, args[0] as number)) prim.sound.queueing = args[1] !== 0
  return undefined
}

export const llSetSoundRadius: BuiltinImpl = (ctx, args) => {
  ctx.prim.sound.radius = args[0] as number
  return undefined
}

export const llLinkSetSoundRadius: BuiltinImpl = (ctx, args) => {
  for (const prim of ctx.linkset.linksWithSitters(ctx.prim, args[0] as number)) prim.sound.radius = args[1] as number
  return undefined
}
