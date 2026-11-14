import type { BuiltinImpl } from '../runtime.js'
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
  q: Scan
  /** Seconds between scans; 0 for a one-shot llSensor. */
  rate: number
  /** Virtual time of the next scan, while one is scheduled. */
  dueAt: number
  /** Time left to the next scan, while the object is in inventory. */
  remainingMs: number
  /** A scan fell due while the script was stopped; it runs when the script starts. */
  missed: boolean
  /** The scheduled scan is one owed from while the script was down. */
  late: boolean
  /** The result this sensor last queued, which its next result replaces. */
  waiting: Record<string, unknown> | undefined
  cancel: (() => void) | undefined
}
const sensors = new WeakMap<Script, SensorTask>()

/** `late`: a scan owed from while the script was down comes after the events and the timer tick due now. */
function schedule(script: Script, task: SensorTask, delay: number, late = false): void {
  if (!script.linkset.peers.includes(script.linkset)) {
    task.remainingMs = delay
    task.missed ||= late
    return
  }
  task.dueAt = script.clockView.now + delay
  task.late = late
  task.cancel = script.linkset.clock.scheduleTask(script, task.dueAt, () => {
    task.cancel = undefined
    task.late = false
    if (script.running) run(script, task)
    else task.missed = true
  }, late)
}

function run(script: Script, task: SensorTask): void {
  if (task.rate > 0) schedule(script, task, task.rate * 1000)
  else sensors.delete(script)
  scan(script, task)
}

function register(script: Script, q: Scan, rate: number): void {
  stopSensors(script)
  const task: SensorTask = { q, rate, dueAt: 0, remainingMs: 0, missed: false, late: false, waiting: undefined, cancel: undefined }
  sensors.set(script, task)
  schedule(script, task, rate * 1000)
}

/** Inventory stops simulator work without discarding the registered scan. */
export function pauseSensors(script: Script): void {
  const task = sensors.get(script)
  if (!task?.cancel) return
  task.cancel()
  task.cancel = undefined
  task.remainingMs = Math.max(0, task.dueAt - script.clockView.now)
}

export function resumeSensors(script: Script): void {
  const task = sensors.get(script)
  if (!task || task.cancel) return
  // A scan that fell due while the script was down is due at once.
  const missed = task.missed
  task.missed = false
  schedule(script, task, missed ? 0 : task.remainingMs, missed)
}

/** A scan that fell due while the script was stopped runs at the start, and a repeating one starts its interval again. */
export function runMissedSensor(script: Script): void {
  const task = sensors.get(script)
  if (!task?.missed) return
  task.missed = false
  schedule(script, task, 0, true)
}

/** An object saved to inventory keeps its scan and the time left to the next one. */
export function copySensors(from: Script, to: Script): void {
  const task = sensors.get(from)
  if (!task) return
  const copy: SensorTask = { ...task, q: { ...task.q }, cancel: undefined, missed: false, late: false, waiting: undefined }
  sensors.set(to, copy)
  const left = task.cancel ? Math.max(0, task.dueAt - from.clockView.now) : task.remainingMs
  // A scan that fell due while the script was down is due at once.
  const owed = task.missed || task.late
  schedule(to, copy, owed ? 0 : left, owed)
}

/** Reset and state changes discard scans; completed events belong to the event queue. */
export function stopSensors(script: Script): void {
  const task = sensors.get(script)
  task?.cancel?.()
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

function targets(script: Script): WorldEntity[] {
  const world = script.linkset.world
  const out = [...(world?.objects ?? []), ...(world?.avatars ?? [])]
  for (const linkset of script.linkset.peers) {
    if (linkset === script.linkset || linkset.dead || !linkset.prims.length) continue
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

function scan(script: Script, task: SensorTask): void {
  const q = task.q
  if (script.dead || q.radius <= 0 || q.type === 0) return
  const origin = script.host.regionPosition()
  const forward = rotateVector({ x: 1, y: 0, z: 0 }, script.host.regionRotation())
  const group = script.linkset.world?.sensorProperties.get(script.linkset)?.group ?? NULL_KEY
  const found: { distance: number; entry: DetectedEntry }[] = []
  for (const target of targets(script)) {
    // DAMAGEABLE matched nothing on the measured Aditi simulator, even with health and handlers.
    if (q.type & 32) continue
    if (target.region !== (script.linkset.region ?? '')) continue
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
  // A sleeping handler holds back the latest completed result, rather than a backlog of scans.
  // In-world: a repeating sensor that found its target and then lost it during one sleep gave
  // one no_sensor after it, and one that lost it and then found it one sensor event. A result
  // released by an earlier wake or handler kept its place and ran ahead of the new one.
  const event = detected.length ? 'sensor' : 'no_sensor'
  const payload = { num_detected: detected.length, detected }
  const clock = script.linkset.clock
  const since = script.handlerStartedAt
  const waiting = task.waiting
  clock.purgeWhere((e) => e.target === script && (since === undefined
    ? e.event === event
    : clock.heldBack(e, since) && (e.event === event || (waiting !== undefined && e.payload === waiting))))
  task.waiting = payload
  script.clockView.schedule(script.clockView.now, event, payload)
}

export const llSensor: BuiltinImpl = (ctx, args) => {
  register(ctx.script, query(args), 0)
}

export const llSensorRepeat: BuiltinImpl = (ctx, args) => {
  stopSensors(ctx.script)
  const rate = Number(args[5])
  if (rate < 0) return
  register(ctx.script, query(args), rate)
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
