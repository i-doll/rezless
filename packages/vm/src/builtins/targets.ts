import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { Script } from '../script.js'
import type { Rotation, Vector } from '../values/types.js'
import { ZERO_ROTATION } from '../values/types.js'
import { rotTargetAngle } from './math.js'

/** Aditi's stationary single-target handlers ran about once every 44 ms. */
const INTERVAL = 1000 / 22.5
interface Target<T> { handle: number; value: T; range: number }
interface Targets {
  nextHandle: number
  positions: Target<Vector>[]
  rotations: Target<Rotation>[]
  cancel: (() => void) | undefined
  resume: (() => void) | undefined
}
const targets = new WeakMap<Script, Targets>()

/** Inventory pauses checks while retaining values and handle numbers. */
export function pauseTargets(script: Script): void {
  const entries = targets.get(script)
  entries?.cancel?.()
  if (entries) entries.cancel = undefined
}

export function resumeTargets(script: Script): void {
  const entries = targets.get(script)
  if (entries && !entries.cancel && (entries.positions.length || entries.rotations.length)) entries.resume?.()
}

/** Reset/deletion clear registrations and their handle counter; state changes preserve them. */
export function clearTargets(script: Script): void {
  targets.get(script)?.cancel?.()
  targets.delete(script)
}

function emit(script: Script, event: string, payload: Record<string, unknown> = {}): void {
  // A sleeping handler retains one completed event per target, even after removal.
  const pending = script.linkset.clock.pendingEvents()
  if (pending.some(e => e.target === script && e.event === event &&
    e.payload['tnum'] === payload['tnum'] && e.payload['handle'] === payload['handle'])) return
  script.clockView.schedule(script.clockView.now, event, payload)
}


function check(script: Script, entries: Targets): void {
  if (!script.running || script.dead) return
  const root = script.linkset.prims[0]!
  const position = root.regionPosition()
  const rotation = root.regionRotation()
  if (entries.positions.length) {
    let reached = false
    for (const target of entries.positions) {
      const p = target.value
      const distance = (p.x - position.x) ** 2 + (p.y - position.y) ** 2 + (p.z - position.z) ** 2
      if (distance < target.range ** 2) {
        reached = true
        emit(script, 'at_target', { tnum: target.handle, targetpos: { ...p }, ourpos: { ...position } })
      }
    }
    if (!reached) emit(script, 'not_at_target')
  }
  if (entries.rotations.length) {
    let reached = false
    for (const target of entries.rotations) {
      if (rotTargetAngle(target.value, rotation) < target.range) {
        reached = true
        emit(script, 'at_rot_target', { handle: target.handle, targetrot: { ...target.value }, ourrot: { ...rotation } })
      }
    }
    if (!reached) emit(script, 'not_at_rot_target')
  }
}

function start(script: Script, entries: Targets): void {
  const schedule = () => {
    if (!script.linkset.peers.includes(script.linkset)) return
    entries.cancel = script.linkset.clock.scheduleTask(script, script.clockView.now + INTERVAL, tick)
  }
  const tick = () => {
    check(script, entries)
    schedule()
  }
  entries.resume = schedule
  schedule()
}

function register(ctx: CallContext): Targets {
  let entries = targets.get(ctx.script)
  if (!entries) {
    entries = { nextHandle: 1, positions: [], rotations: [], cancel: undefined, resume: undefined }
    targets.set(ctx.script, entries)
  }
  if (!entries.cancel) start(ctx.script, entries)
  return entries
}

/** An object saved to inventory keeps its targets and their handle numbers. */
export function copyTargets(from: Script, to: Script): void {
  const entries = targets.get(from)
  if (!entries) return
  const copy: Targets = {
    nextHandle: entries.nextHandle, cancel: undefined, resume: undefined,
    positions: entries.positions.map(t => ({ ...t, value: { ...t.value } })),
    rotations: entries.rotations.map(t => ({ ...t, value: { ...t.value } })),
  }
  targets.set(to, copy)
  if (copy.positions.length || copy.rotations.length) start(to, copy)
}

function normalize(rotation: Rotation): Rotation {
  const magnitude = Math.hypot(rotation.x, rotation.y, rotation.z, rotation.s)
  if (magnitude === 0) return ZERO_ROTATION
  return { x: rotation.x / magnitude, y: rotation.y / magnitude, z: rotation.z / magnitude, s: rotation.s / magnitude }
}

export const llTarget: BuiltinImpl = (ctx, args) => {
  const entries = register(ctx)
  const handle = entries.nextHandle++
  entries.positions.push({ handle, value: { ...args[0] as Vector }, range: Number(args[1]) })
  if (entries.positions.length > 8) entries.positions.shift()
  return handle
}

export const llRotTarget: BuiltinImpl = (ctx, args) => {
  const entries = register(ctx)
  const handle = entries.nextHandle++
  entries.rotations.push({ handle, value: normalize(args[0] as Rotation), range: Number(args[1]) })
  if (entries.rotations.length > 8) entries.rotations.shift()
  return handle
}

function remove(ctx: CallContext, handle: number, kind: 'positions' | 'rotations'): void {
  const entries = targets.get(ctx.script)
  if (!entries) return
  const list = entries[kind]
  const index = list.findIndex(target => target.handle === handle)
  if (index >= 0) list.splice(index, 1)
  if (!entries.positions.length && !entries.rotations.length) {
    entries.cancel?.()
    entries.cancel = undefined
  }
}
export const llTargetRemove: BuiltinImpl = (ctx, args) => { remove(ctx, Number(args[0]), 'positions') }
export const llRotTargetRemove: BuiltinImpl = (ctx, args) => { remove(ctx, Number(args[0]), 'rotations') }
