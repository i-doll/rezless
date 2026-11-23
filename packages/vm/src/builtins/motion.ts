import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { Prim } from '../prim.js'
import type { LinksetClock } from '../clock.js'
import type { LslValue, Rotation, Vector } from '../values/types.js'
import { ZERO_ROTATION, ZERO_VECTOR } from '../values/types.js'
import { conjugate, mulRotation } from '../values/ops.js'
import { ruleElementType } from '../values/list-types.js'
import { KFM_COMMAND, KFM_DATA, KFM_MODE, KFM_ROTATION, KFM_TRANSLATION,
  KFM_FORWARD, KFM_LOOP, KFM_REVERSE, KFM_PING_PONG,
  KFM_CMD_PLAY, KFM_CMD_PAUSE, KFM_CMD_STOP, STATUS_PHYSICS,
  PRIM_PHYSICS_SHAPE_PRIM } from '../generated/constants.js'
import { llGround } from './ground.js'
import type { Script } from '../script.js'

interface Frame { translation: Vector; rotation: Rotation; duration: number }
interface Transform { position: Vector; rotation: Rotation }
interface Segment { from: Transform; to: Transform; duration: number }

function add(a: Vector, b: Vector): Vector { return {x:a.x+b.x,y:a.y+b.y,z:a.z+b.z} }
function subtract(a: Vector, b: Vector): Vector { return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z} }
function normalize(r: Rotation): Rotation {
  const n=Math.hypot(r.x,r.y,r.z,r.s)
  return {x:r.x/n,y:r.y/n,z:r.z/n,s:r.s/n}
}
function interpolate(a: Rotation, b: Rotation, t: number): Rotation {
  let dot=a.x*b.x+a.y*b.y+a.z*b.z+a.s*b.s
  if (dot<0) { b={x:-b.x,y:-b.y,z:-b.z,s:-b.s};dot=-dot }
  let u=1-t,v=t
  if (dot<.9995) {
    const angle=Math.acos(Math.min(1,dot)), sine=Math.sin(angle)
    u=Math.sin((1-t)*angle)/sine;v=Math.sin(t*angle)/sine
  }
  return normalize({x:a.x*u+b.x*v,y:a.y*u+b.y*v,z:a.z*u+b.z*v,s:a.s*u+b.s*v})
}

/**
 * Raise `event` in every script of the prim's object, root and children alike.
 * In-world: keyframed motion gave moving_start as it began or resumed, and moving_end as it
 * finished, paused, stopped or was cleared; a script in a child prim got both as well.
 * An llSetRegionPos that moved the object gave moving_start and moving_end together, and
 * llSetPos gave neither. Two llSetRegionPos calls in one handler gave one of each: an event
 * still waiting is not raised again (Aditi, SLua Tideland, 2026-11-23).
 */
function raiseMoving(prim: Prim, event: 'moving_start' | 'moving_end', at: number): void {
  const linkset = prim.linkset
  if (!linkset || linkset.dead) return
  for (const script of linkset.allScripts()) {
    if (!script.dead && !linkset.clock.hasPending(script, event)) linkset.clock.schedule(script, at, event)
  }
}

/** Object-owned motion. Simulator frame drift and selection pauses are not simulated. */
export class KeyframedMotion {
  playing = true
  private completed = false
  private elapsed = 0
  private startedAt: number
  private segments: Segment[] = []
  private duration = 0
  private cancel: (() => void) | undefined
  /** When a one-way motion that is playing ends. */
  private endsAt = Infinity
  private held: Transform
  /** A restored object's first cycle runs relative to its new rez pose. */
  private restored: { segments: Segment[]; anchor?: Transform } | undefined

  constructor(private readonly prim: Prim, private readonly clock: LinksetClock,
    private readonly frames: readonly Frame[], private readonly mode: number) {
    this.startedAt=clock.now
    this.held=this.transform()
    this.rebuild()
    this.observe()
  }

  private transform(): Transform {
    return {position:{...this.prim.params.position},rotation:normalize(this.prim.params.rotation)}
  }

  private rebuild(): void {
    let current=this.transform()
    this.segments=[]
    this.restored=undefined
    const frames=this.mode===KFM_REVERSE ? [...this.frames].reverse() : this.frames
    for (const frame of frames) {
      const reverse=this.mode===KFM_REVERSE
      const delta=reverse ? {x:-frame.translation.x,y:-frame.translation.y,z:-frame.translation.z} : frame.translation
      const rotation=reverse ? conjugate(frame.rotation) : frame.rotation
      const next={position:add(current.position,delta),rotation:normalize(mulRotation(rotation,current.rotation))}
      this.segments.push({from:current,to:next,duration:frame.duration})
      current=next
    }
    if (this.mode===KFM_PING_PONG) {
      this.segments.push(...this.segments.slice().reverse().map(s=>({from:s.to,to:s.from,duration:s.duration})))
    }
    this.duration=this.segments.reduce((n,s)=>n+s.duration,0)
  }

  private observe(): void {
    if (this.cancel) return
    const stop=this.clock.onAdvance(now=>this.update(now))
    // The clock stops where a one-way motion ends, so its moving_end comes then.
    const prim=this.prim
    const repeating=this.mode===KFM_LOOP || this.mode===KFM_PING_PONG
    this.endsAt=repeating ? Infinity : this.startedAt+this.duration-this.elapsed
    const end=repeating ? undefined
      : this.clock.scheduleTask({get dead() { return !!prim.linkset?.dead }},this.endsAt,()=>this.update(this.clock.now))
    this.cancel=()=>{stop();end?.()}
  }

  private shift(segments: Segment[], held: Transform): Segment[] {
    const current=this.transform(),delta=subtract(current.position,held.position)
    const rotation=mulRotation(conjugate(held.rotation),current.rotation)
    const shifted=(t: Transform): Transform=>({position:add(t.position,delta),rotation:normalize(mulRotation(t.rotation,rotation))})
    return segments.map(s=>({...s,from:shifted(s.from),to:shifted(s.to)}))
  }

  /** Snapshot plain playback data and bind a fresh controller to the destination clock. */
  copyTo(prim: Prim, clock: LinksetClock): KeyframedMotion {
    this.update(this.clock.now)
    const saved=structuredClone({frames:this.frames,segments:this.segments,
      current:this.restored?.segments,mode:this.mode,playing:this.playing,
      elapsed:this.playing ? this.elapsed+this.clock.now-this.startedAt : 0,pose:this.transform()})
    const copy=new KeyframedMotion(prim,clock,saved.frames,saved.mode)
    // In-world: controlled-snapshot.py and controlled-paused.log (Aditi, SLua Tideland,
    // 2026-11-01) -> active progress survives; paused playback restarts full frames on play.
    const first=saved.playing ? saved.current ?? saved.segments : copy.segments
    copy.segments=saved.segments
    copy.elapsed=this.mode===KFM_LOOP || this.mode===KFM_PING_PONG ? saved.elapsed%copy.duration : saved.elapsed
    copy.held=saved.pose
    copy.restored={segments:first}
    if (saved.playing) {
      copy.restored.anchor=saved.pose
      // The end comes when the restored progress runs out.
      copy.cancel?.();copy.cancel=undefined
      copy.observe()
    } else copy.dispose()
    return copy
  }

  private update(now: number): void {
    if (this.prim.linkset?.dead) { this.dispose();return }
    if (!this.playing) return
    if (this.restored?.anchor) {
      this.restored.segments=this.shift(this.restored.segments,this.restored.anchor)
      delete this.restored.anchor
    }
    let elapsed=this.elapsed+now-this.startedAt
    const repeating=this.mode===KFM_LOOP || this.mode===KFM_PING_PONG
    // In-world: cycle-snapshot.py/loop-snapshot.py -> after the restored partial cycle,
    // both repeating modes return to the original region path (Aditi, SLua Tideland, 2026-11-01).
    if (repeating && elapsed>=this.duration) this.restored=undefined
    if (repeating) elapsed%=this.duration
    else if (elapsed>=this.duration || now>=this.endsAt) {
      raiseMoving(this.prim,'moving_end',this.endsAt)
      elapsed=this.duration
      this.elapsed=this.duration
      this.playing=false
      this.completed=true
      this.cancel?.();this.cancel=undefined
    }
    const segments=this.restored?.segments ?? this.segments
    for (let i=0;i<segments.length;i++) {
      const s=segments[i]!
      if (elapsed>s.duration && i<segments.length-1) { elapsed-=s.duration;continue }
      const t=Math.min(1,elapsed/s.duration)
      this.prim.params.position={x:s.from.position.x+(s.to.position.x-s.from.position.x)*t,
        y:s.from.position.y+(s.to.position.y-s.from.position.y)*t,z:s.from.position.z+(s.to.position.z-s.from.position.z)*t}
      this.prim.params.rotation=interpolate(s.from.rotation,s.to.rotation,t)
      return
    }
  }

  command(command: number): void {
    if (command===KFM_CMD_PAUSE && !this.playing && !this.completed) return
    if (command===KFM_CMD_PAUSE || command===KFM_CMD_STOP) {
      this.update(this.clock.now)
      if (this.playing) {
        this.elapsed+=this.clock.now-this.startedAt
        if (this.mode===KFM_LOOP || this.mode===KFM_PING_PONG) this.elapsed%=this.duration
      }
      if (this.playing) raiseMoving(this.prim,'moving_end',this.clock.now)
      this.playing=false
      this.completed=false
      this.held=this.transform()
      this.cancel?.();this.cancel=undefined
      if (command===KFM_CMD_STOP) { this.elapsed=0;this.rebuild() }
    } else if (command===KFM_CMD_PLAY && !this.playing) {
      if (this.completed) {
        this.completed=false
        this.elapsed=0
        this.held=this.transform()
        this.rebuild()
      }
      if (this.elapsed>=this.duration) return
      // Moving a paused object shifts the remainder of its path by the same transform.
      if (this.restored) {
        this.restored.segments=this.shift(this.restored.segments,this.held)
        delete this.restored.anchor
      } else this.segments=this.shift(this.segments,this.held)
      this.startedAt=this.clock.now
      this.playing=true
      this.observe()
      raiseMoving(this.prim,'moving_start',this.clock.now)
    }
  }

  dispose(): void { this.cancel?.();this.cancel=undefined;this.playing=false }
}

function vector(v: LslValue | undefined): v is Vector {
  return !!v && typeof v==='object' && !Array.isArray(v) && !('s' in v)
    && 'x' in v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
}
function rotation(v: LslValue | undefined): v is Rotation {
  if (!v || typeof v!=='object' || Array.isArray(v) || !('s' in v)) return false
  const r=v as Rotation
  return [r.x,r.y,r.z,r.s].every(Number.isFinite) && Math.abs(r.x*r.x+r.y*r.y+r.z*r.z+r.s*r.s-1)<=1e-6
}
function integer(list: readonly LslValue[], index: number): boolean {
  return typeof list[index]==='number' && Number.isInteger(list[index]) && ruleElementType(list,index)!=='float'
}

export const llSetKeyframedMotion: BuiltinImpl = (ctx,args) => {
  const frames=args[0] as readonly LslValue[], options=args[1] as readonly LslValue[]
  const root=ctx.linkset.prims[0]!
  if (options.length%2) return
  if (options[0]===KFM_COMMAND) {
    if (frames.length || options.length!==2 || !integer(options,0) || !integer(options,1)) return
    root.keyframedMotion?.command(options[1] as number)
    return
  }
  let mode=KFM_FORWARD,data=KFM_TRANSLATION|KFM_ROTATION
  for (let i=0;i<options.length;i+=2) {
    if (!integer(options,i) || !integer(options,i+1)) return
    const value=options[i+1] as number
    if (options[i]===KFM_MODE && value>=KFM_FORWARD && value<=KFM_REVERSE) mode=value
    else if (options[i]===KFM_DATA && value>=1 && value<=3) data=value
    else return
  }
  if (!frames.length) {
    if (options.length) return
    if (root.keyframedMotion?.playing) raiseMoving(root,'moving_end',ctx.state.clock.now)
    root.keyframedMotion?.dispose();root.keyframedMotion=null
    return
  }
  if (root.statusFlags&STATUS_PHYSICS || !ctx.linkset.prims.some(p=>p.params.physicsShapeType!==PRIM_PHYSICS_SHAPE_PRIM)) return
  const stride=1+Number(!!(data&KFM_TRANSLATION))+Number(!!(data&KFM_ROTATION))
  if (frames.length%stride) return
  const parsed: Frame[]=[]
  for (let i=0;i<frames.length;) {
    let translation: Vector=ZERO_VECTOR,orientation: Rotation=ZERO_ROTATION
    if (data&KFM_TRANSLATION) { const v=frames[i++];if (!vector(v)) return;translation={...v} }
    if (data&KFM_ROTATION) { const r=frames[i++];if (!rotation(r)) return;orientation=normalize(r) }
    const seconds=frames[i++]
    if (typeof seconds!=='number' || !Number.isFinite(seconds) || seconds<1/9 || Math.hypot(translation.x,translation.y,translation.z)/seconds>250) return
    parsed.push({translation,rotation:orientation,duration:seconds*1000})
  }
  const moving=root.keyframedMotion?.playing
  root.keyframedMotion?.dispose()
  root.keyframedMotion=new KeyframedMotion(root,ctx.linkset.clock,parsed,mode)
  if (!moving) raiseMoving(root,'moving_start',ctx.state.clock.now)
}

export const llSetRegionPos: BuiltinImpl = (ctx,args) => {
  const target=args[0] as Vector,root=ctx.linkset.prims[0]!
  if (!vector(target) || target.x < -10 || target.x>266 || target.y < -10 || target.y>266 || target.z<0 || target.z>4096
    || root.statusFlags&STATUS_PHYSICS || root.keyframedMotion?.playing) return 0
  const from=ctx.prim.regionPosition()
  const ground=Number(llGround(ctx,[subtract(target,from)]))
  const before=root.params.position
  root.params.position={...target,z:Math.max(target.z,ground)}
  const after=root.params.position
  if (before.x!==after.x || before.y!==after.y || before.z!==after.z) {
    raiseMoving(root,'moving_start',ctx.state.clock.now)
    raiseMoving(root,'moving_end',ctx.state.clock.now)
  }
  return Number(root.params.position.z-target.z<.1)
}


interface TargetOwner { prim: string; script: string }
interface MoveRequest { owner: TargetOwner; target: Vector; tau: number; slack?: boolean }
interface LookRequest {
  owner: TargetOwner
  slack?: boolean
  target: { position: Vector } | { rotation: Rotation }
  strength: number
  damping: number
}
export interface TargetMotionState { move: MoveRequest | null; look: LookRequest | null }

// In-world: tau-bound/rot-bound probes accepted .044444 and rejected .044.
const MIN_RESPONSE = Math.fround(.044444)
function owner(ctx: CallContext): TargetOwner {
  return { prim: ctx.prim.key, script: ctx.script.instanceId }
}

function stopTargetMotion(prim: Prim, kind: 'move' | 'look', caller: TargetOwner): void {
  const request = prim.targetMotion[kind]
  if (request?.owner.prim === caller.prim && request.owner.script === caller.script) prim.targetMotion[kind] = null
}

/**
 * Let go of, or take up again, the move and look targets `script` owns. In-world: the object
 * left behind by a Take Copy of a stopped script went slack, and went back to its target once
 * the script was started.
 */
export function slackenTargetMotion(script: Script, slack: boolean): void {
  const root = script.linkset.prims[0]!
  for (const request of [root.targetMotion.move, root.targetMotion.look]) {
    if (request?.owner.prim === script.host.key && request.owner.script === script.instanceId) {
      if (slack) request.slack = true
      else delete request.slack
    }
  }
}

const acting = <T extends { slack?: boolean }>(request: T | null) => request?.slack ? null : request

/** The initiating script retains stop/reset ownership even when a sibling retargets it. */
export function clearTargetMotion(script: Script): void {
  const root = script.linkset.prims[0]!, caller = { prim: script.host.key, script: script.instanceId }
  stopTargetMotion(root, 'move', caller)
  stopTargetMotion(root, 'look', caller)
}

function lookRotation(position: Vector, target: Vector): Rotation {
  const delta = subtract(target, position), length = Math.hypot(delta.x, delta.y, delta.z)
  if (!length) return { x: 1, y: 0, z: 0, s: 0 }
  // Pitch +Z toward the target, then yaw around world +Z. This keeps +X below
  // the horizon, rather than using the shortest rotation of +Z alone.
  const pitch = Math.acos(Math.max(-1, Math.min(1, delta.z / length))) / 2
  const yaw = Math.atan2(delta.y, delta.x) / 2
  return { x: -Math.sin(pitch) * Math.sin(yaw), y: Math.sin(pitch) * Math.cos(yaw),
    z: Math.cos(pitch) * Math.sin(yaw), s: Math.cos(pitch) * Math.cos(yaw) }
}

const TARGET_STEP_MS = 10
interface CoupledStep {
  at: number
  ticks: number
  held: Transform
  output: Transform
  move: MoveRequest
  look: LookRequest
}
function pose(prim: Prim): Transform {
  return { position: { ...prim.params.position }, rotation: { ...prim.params.rotation } }
}
function samePose(prim: Prim, value: Transform): boolean {
  const p = prim.params.position, r = prim.params.rotation
  return p.x === value.position.x && p.y === value.position.y && p.z === value.position.z
    && r.x === value.rotation.x && r.y === value.rotation.y && r.z === value.rotation.z && r.s === value.rotation.s
}

/** Coupled move/look uses a fixed cadence. Partial steps are sampled, never committed. */
export class TargetMotionStepper {
  private coupled: CoupledStep | undefined
  constructor(private readonly prim: Prim, private previous: number) {}

  advance(now: number): void {
    const from = this.previous
    this.previous = now
    if (now <= from) return
    const move = acting(this.prim.targetMotion.move), look = acting(this.prim.targetMotion.look)
    if (!(this.prim.statusFlags & STATUS_PHYSICS) || !move || !look || !('position' in look.target)) {
      this.coupled = undefined
      advanceTargetMotion(this.prim, (now - from) / 1000)
      return
    }
    let step = this.coupled
    if (!step || step.move !== move || step.look !== look || !samePose(this.prim, step.output)) {
      step = this.coupled = { at: from, ticks: 0, held: pose(this.prim), output: pose(this.prim), move, look }
    }
    this.prim.params.position = { ...step.held.position }
    this.prim.params.rotation = { ...step.held.rotation }
    const ticks = Math.floor((now - step.at) / TARGET_STEP_MS + 1e-9)
    while (step.ticks < ticks) {
      advanceTargetMotion(this.prim, TARGET_STEP_MS / 1000)
      step.ticks++
    }
    step.held = pose(this.prim)
    const remainder = Math.max(0, now - step.at - ticks * TARGET_STEP_MS)
    if (remainder) advanceTargetMotion(this.prim, remainder / 1000)
    step.output = pose(this.prim)
  }
}

/** Nominal exponential kinematics. No gravity, angular wobble, contacts or inertia. */
function advanceTargetMotion(prim: Prim, seconds: number): void {
  if (!(prim.statusFlags & STATUS_PHYSICS)) return
  const move = acting(prim.targetMotion.move), look = acting(prim.targetMotion.look)
  if (move) {
    const from = prim.params.position, t = -Math.expm1(-seconds / move.tau)
    prim.params.position = { x: from.x + (move.target.x - from.x) * t,
      y: from.y + (move.target.y - from.y) * t, z: from.z + (move.target.z - from.z) * t }
  }
  if (look) {
    const target = 'rotation' in look.target ? look.target.rotation : lookRotation(prim.params.position, look.target.position)
    prim.params.rotation = interpolate(normalize(prim.params.rotation), target,
      -Math.expm1(-seconds / (look.strength * look.damping)))
  }
}

export const llMoveToTarget: BuiltinImpl = (ctx, args) => {
  const root = ctx.linkset.prims[0]!, target = args[0] as Vector, tau = Number(args[1])
  const initiator = root.targetMotion.move?.owner ?? owner(ctx)
  stopTargetMotion(root, 'move', owner(ctx))
  if (!vector(target) || !Number.isFinite(tau) || tau < MIN_RESPONSE) return
  const delta = subtract(target, root.regionPosition())
  // In-world: edge-64 moved, edge-64.01 and distance-64.9 did not.
  if (Math.hypot(delta.x, delta.y, delta.z) > 64) return
  root.targetMotion.move = { owner: initiator, target: { ...target }, tau }
}
export const llStopMoveToTarget: BuiltinImpl = ctx => { stopTargetMotion(ctx.linkset.prims[0]!, 'move', owner(ctx)) }

function setLook(ctx: CallContext, target: LookRequest['target'], strength: number, damping: number): void {
  const root = ctx.linkset.prims[0]!
  const initiator = root.targetMotion.look?.owner ?? owner(ctx)
  stopTargetMotion(root, 'look', owner(ctx))
  const physical = !!(root.statusFlags & STATUS_PHYSICS)
  if (!Number.isFinite(strength) || !Number.isFinite(damping) || strength <= 0 || (physical && strength < MIN_RESPONSE)) return
  if (!physical) {
    const rotation = 'rotation' in target ? target.rotation : lookRotation(ctx.prim.regionPosition(), target.position)
    ctx.prim.params.rotation = rotation
    return
  }
  root.targetMotion.look = { owner: initiator, target, strength, damping: Math.max(MIN_RESPONSE, Math.min(1, damping)) }
}
export const llLookAt: BuiltinImpl = (ctx, args) => {
  if (!vector(args[0])) return
  setLook(ctx, { position: { ...args[0] } }, Number(args[1]), Number(args[2]))
}
export const llRotLookAt: BuiltinImpl = (ctx, args) => {
  const target = args[0] as Rotation
  if (![target.x, target.y, target.z, target.s].every(Number.isFinite)) return
  const magnitude = Math.hypot(target.x, target.y, target.z, target.s)
  setLook(ctx, { rotation: magnitude ? normalize(target) : { ...ZERO_ROTATION } }, Number(args[1]), Number(args[2]))
}
export const llStopLookAt: BuiltinImpl = ctx => { stopTargetMotion(ctx.linkset.prims[0]!, 'look', owner(ctx)) }
