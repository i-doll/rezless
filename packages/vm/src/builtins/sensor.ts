import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { Script } from '../script.js'
import type { DetectedEntry } from './detected.js'
import type { WorldEntity } from '../world.js'
import type { Vector } from '../values/types.js'
import { NULL_KEY, ZERO_VECTOR } from '../values/types.js'
import { rotateVector } from '../values/ops.js'

interface Scan {
  name: string
  key: string
  type: number
  radius: number
  arc: number
}
interface SensorTask {
  cancel: (() => void) | undefined
  resume: () => void
}
const sensors = new WeakMap<Script, SensorTask>()

/** Inventory stops simulator work without discarding the registered scan. */
export function pauseSensors(script: Script): void {
  const task = sensors.get(script)
  task?.cancel?.()
  if (task) task.cancel = undefined
}

export function resumeSensors(script: Script): void {
  const task = sensors.get(script)
  if (task && !task.cancel) task.resume()
}

function sensorTask(ctx: CallContext, delay: number, run: () => void): SensorTask {
  const task: SensorTask = { cancel: undefined, resume: () => {
    if (!ctx.script.linkset.peers.includes(ctx.script.linkset)) return
    task.cancel = ctx.script.linkset.clock.scheduleTask(ctx.script, ctx.state.clock.now + delay, run)
  } }
  sensors.set(ctx.script, task)
  task.resume()
  return task
}

/** Reset and state changes discard scans; completed events belong to the event queue. */
export function stopSensors(script: Script): void {
  pauseSensors(script)
  sensors.delete(script)
}

function query(args: Parameters<BuiltinImpl>[1]): Scan {
  const key = String(args[1])
  return {
    name: String(args[0]),
    key: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key) ? key.toLowerCase() : NULL_KEY,
    type: Number(args[2]), radius: Math.min(Number(args[3]), 96), arc: Number(args[4]),
  }
}

function targets(ctx: CallContext): WorldEntity[] {
  const world = ctx.script.linkset.world
  const out = [...(world?.objects ?? []), ...(world?.avatars ?? [])]
  for (const linkset of ctx.script.linkset.peers) {
    if (linkset === ctx.script.linkset || linkset.dead || !linkset.prims.length) continue
    const root = linkset.prims[0]!
    const scripts = linkset.allScripts().filter((s) => !s.dead)
    const properties = world?.sensorProperties.get(linkset)
    out.push({
      key: root.key, name: root.name, region: linkset.region ?? '',
      position: root.regionPosition(), rotation: root.regionRotation(),
      velocity: properties?.velocity ?? ZERO_VECTOR, owner: linkset.owner,
      group: properties?.group ?? NULL_KEY, physical: (root.statusFlags & 1) !== 0,
      scripted: scripts.length > 0,
      active: properties?.active ?? scripts.some((s) => s.running && (s.timerInterval > 0 || s.wakeAt !== undefined || s.listens.some((l) => l.active))),
    })
  }
  return out
}

function scan(ctx: CallContext, q: Scan): void {
  if (!ctx.script.running || ctx.script.dead || q.radius <= 0 || q.type === 0) return
  const origin = ctx.prim.regionPosition()
  const forward = rotateVector({ x: 1, y: 0, z: 0 }, ctx.prim.regionRotation())
  const group = ctx.script.linkset.world?.sensorProperties.get(ctx.script.linkset)?.group ?? NULL_KEY
  const found: { distance: number; entry: DetectedEntry }[] = []
  for (const target of targets(ctx)) {
    // DAMAGEABLE matched nothing on the measured Aditi simulator, even with health and handlers.
    if (q.type & 32) continue
    if (target.region !== (ctx.script.linkset.region ?? '')) continue
    if (q.key !== NULL_KEY && target.key.toLowerCase() !== q.key) continue
    const avatar = target.username !== undefined
    if (q.name && q.name !== (avatar && (q.type & 16) !== 0 ? target.username : target.name)) continue
    if (avatar) {
      if (!(q.type & 17) || (q.type & 8)) continue
    } else {
      const active = target.physical || target.active
      if (q.type & 8) {
        if (!target.scripted || !(active || (q.type & 4))) continue
      } else if (!(q.type & (active ? 2 : 4))) continue
    }
    const delta: Vector = { x: target.position.x - origin.x, y: target.position.y - origin.y, z: target.position.z - origin.z }
    const distance = Math.hypot(delta.x, delta.y, delta.z)
    if (distance >= q.radius) continue
    if (q.arc > 0 && q.arc < Math.PI && distance > 0) {
      const dot = (delta.x * forward.x + delta.y * forward.y + delta.z * forward.z) / distance
      // Measured at 45 and 90 degrees on Aditi, 2026-10-31.
      if (dot + 0.0001 < Math.cos(q.arc)) continue
    }
    found.push({ distance, entry: {
      key: target.key, name: target.name, owner: target.owner,
      group: Number(target.group === group),
      pos: { ...target.position }, rot: { ...target.rotation }, vel: { ...target.velocity },
      type: avatar ? 3 : (target.physical ? 2 : 4) | (target.scripted ? 8 : 0),
      linkNumber: 0,
    } })
  }
  const detected = found.sort((a, b) => a.distance - b.distance).slice(0, 32).map((f) => f.entry)
  // A busy handler holds the latest completed result, rather than a backlog of scans.
  ctx.script.linkset.clock.purgeEvent(ctx.script, detected.length ? 'sensor' : 'no_sensor')
  ctx.state.clock.schedule(ctx.state.clock.now, detected.length ? 'sensor' : 'no_sensor', { num_detected: detected.length, detected })
}

export const llSensor: BuiltinImpl = (ctx, args) => {
  stopSensors(ctx.script)
  const q = query(args)
  sensorTask(ctx, 0, () => {
    sensors.delete(ctx.script)
    scan(ctx, q)
  })
}

export const llSensorRepeat: BuiltinImpl = (ctx, args) => {
  stopSensors(ctx.script)
  const rate = Number(args[5])
  if (rate < 0) return
  if (rate === 0) return llSensor(ctx, args)
  const q = query(args)
  const task = sensorTask(ctx, rate * 1000, () => {
    scan(ctx, q)
    task.resume()
  })
}

export const llSensorRemove: BuiltinImpl = (ctx) => {
  stopSensors(ctx.script)
  for (const event of ctx.script.linkset.clock.pendingEvents()) {
    if (event.target === ctx.script && event.event === 'sensor') event.payload['detected'] = []
  }
  const stack = ctx.state.detectedStack
  const current = stack.at(-1)
  if (current?.event === 'sensor') stack[stack.length - 1] = { ...current, entries: [] }
}
