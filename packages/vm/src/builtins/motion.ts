import type { BuiltinImpl } from '../runtime.js'
import type { Prim } from '../prim.js'
import type { LinksetClock } from '../clock.js'
import type { LslValue, Rotation, Vector } from '../values/types.js'
import { ZERO_ROTATION, ZERO_VECTOR } from '../values/types.js'
import { conjugate, mulRotation } from '../values/ops.js'
import { listElementType } from '../values/list-types.js'
import { KFM_COMMAND, KFM_DATA, KFM_MODE, KFM_ROTATION, KFM_TRANSLATION,
  KFM_FORWARD, KFM_LOOP, KFM_REVERSE, KFM_PING_PONG,
  KFM_CMD_PLAY, KFM_CMD_PAUSE, KFM_CMD_STOP, STATUS_PHYSICS,
  PRIM_PHYSICS_SHAPE_PRIM } from '../generated/constants.js'
import { llGround } from './ground.js'

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

/** Object-owned motion. Simulator frame drift and selection pauses are not simulated. */
export class KeyframedMotion {
  playing = true
  private completed = false
  private elapsed = 0
  private startedAt: number
  private segments: Segment[] = []
  private duration = 0
  private cancel: (() => void) | undefined
  private held: Transform

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
    this.cancel ??= this.clock.onAdvance(now=>this.update(now))
  }

  private update(now: number): void {
    if (this.prim.linkset?.dead) { this.dispose();return }
    if (!this.playing) return
    let elapsed=this.elapsed+now-this.startedAt
    const repeating=this.mode===KFM_LOOP || this.mode===KFM_PING_PONG
    if (repeating) elapsed%=this.duration
    else if (elapsed>=this.duration) {
      elapsed=this.duration
      this.elapsed=this.duration
      this.playing=false
      this.completed=true
      this.cancel?.();this.cancel=undefined
    }
    for (let i=0;i<this.segments.length;i++) {
      const s=this.segments[i]!
      if (elapsed>s.duration && i<this.segments.length-1) { elapsed-=s.duration;continue }
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
      const current=this.transform(),delta=subtract(current.position,this.held.position)
      const rotation=mulRotation(conjugate(this.held.rotation),current.rotation)
      const shifted=(t: Transform): Transform=>({position:add(t.position,delta),rotation:normalize(mulRotation(t.rotation,rotation))})
      this.segments=this.segments.map(s=>({...s,from:shifted(s.from),to:shifted(s.to)}))
      this.startedAt=this.clock.now
      this.playing=true
      this.observe()
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
  return typeof list[index]==='number' && Number.isInteger(list[index]) && listElementType(list,index)!=='float'
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
  root.keyframedMotion?.dispose()
  root.keyframedMotion=new KeyframedMotion(root,ctx.linkset.clock,parsed,mode)
}

export const llSetRegionPos: BuiltinImpl = (ctx,args) => {
  const target=args[0] as Vector,root=ctx.linkset.prims[0]!
  if (!vector(target) || target.x < -10 || target.x>266 || target.y < -10 || target.y>266 || target.z<0 || target.z>4096
    || root.statusFlags&STATUS_PHYSICS || root.keyframedMotion?.playing) return 0
  const from=ctx.prim.regionPosition()
  const ground=Number(llGround(ctx,[subtract(target,from)]))
  root.params.position={...target,z:Math.max(target.z,ground)}
  return Number(root.params.position.z-target.z<.1)
}
