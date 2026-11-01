import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { Linkset } from '../linkset.js'
import { ZERO_VECTOR, type LslValue, type Vector } from '../values/types.js'
import { conjugate, rotateVector } from '../values/ops.js'
import { listElementType, uniformList } from '../values/list-types.js'
import { PERMISSION_ATTACH, PERMISSION_TRACK_CAMERA, CHANGED_OWNER, PERM_TRANSFER } from '../generated/constants.js'
import { sayError } from './debug.js'
import { isAgentInRegion } from './viewer.js'

const sameKey = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const isHUD = (point: number) => point >= 31 && point <= 38

function localAgent(ctx: CallContext, key: string): boolean {
  return isAgentInRegion(ctx, key) && (!ctx.linkset.world ||
    ctx.linkset.world.avatars.some(a => sameKey(a.key, key) && a.region === ctx.linkset.region))
}

function attach(ctx: CallContext, point: number, temporary: boolean): void {
  const { agent, granted } = ctx.state.permissions
  // In-world, the missing permission agent is diagnosed before permission bits.
  if (!localAgent(ctx, agent)) {
    sayError(ctx, 'Cannot find the agent to attach to.')
    return
  }
  if (!(granted & PERMISSION_ATTACH) || ctx.linkset.attachment) return
  if (temporary && ctx.linkset.prims.some(p => p.inventory.some(i => !(i.permMask.owner & PERM_TRANSFER)))) {
    sayError(ctx, 'No permission to transfer')
    return
  }
  if (!sameKey(agent, ctx.linkset.owner)) {
    if (!temporary) return
    ctx.linkset.owner = agent
    ctx.state.permissions.granted = PERMISSION_ATTACH
    for (const script of ctx.linkset.allScripts()) {
      ctx.linkset.clock.schedule(script, ctx.state.clock.now, 'changed', { changes: CHANGED_OWNER })
    }
  }
  ctx.linkset.attachToAvatar(agent, point, temporary)
}

export const llAttachToAvatar: BuiltinImpl = (ctx, args) => {
  attach(ctx, args[0] as number, false)
  return undefined
}
export const llAttachToAvatarTemp: BuiltinImpl = (ctx, args) => {
  attach(ctx, args[0] as number, true)
  return undefined
}

export const llDetachFromAvatar: BuiltinImpl = ctx => {
  const attached = ctx.linkset.attachment
  if (!attached || ctx.prim !== ctx.linkset.prims[0] || !sameKey(ctx.state.permissions.agent, attached.avatar)) return undefined
  // The caller still sees the old point; the simulator detaches asynchronously.
  ctx.linkset.clock.scheduleTask(ctx.script, ctx.state.clock.now, () => ctx.linkset.detachFromAvatar())
  return undefined
}
export const llGetAttached: BuiltinImpl = ctx => ctx.linkset.attachment?.point ?? 0

function attachments(ctx: CallContext, avatar: string): Linkset[] | string {
  const known = ctx.linkset.world?.avatars.find(a => sameKey(a.key, avatar))
  if (known && known.region !== ctx.linkset.region) return 'NOT ON REGION'
  if (!localAgent(ctx, avatar)) return 'NOT FOUND'
  return ctx.linkset.peers.filter(l => !l.dead && l.attachment && sameKey(l.attachment.avatar, avatar))
    .sort((a, b) => a.attachment!.order - b.attachment!.order)
}

export const llGetAttachedList: BuiltinImpl = (ctx, args) => {
  const worn = attachments(ctx, args[0] as string)
  if (typeof worn === 'string') return uniformList([worn], 'string')
  return uniformList(worn.filter(l => !isHUD(l.attachment!.point)).map(l => l.prims[0]!.key), 'key')
}

export const llGetAttachedListFiltered: BuiltinImpl = (ctx, args) => {
  const avatar = args[0] as string
  const worn = attachments(ctx, avatar)
  if (typeof worn === 'string') return uniformList([worn], 'string')
  const options = args[1] as readonly LslValue[]
  const points = new Set<number>()
  let flags = 0
  if (options.length % 2) return []
  for (let i = 0; i < options.length; i += 2) {
    if (listElementType(options, i) !== 'integer' || listElementType(options, i + 1) !== 'integer') return []
    const rule = options[i] as number
    const value = options[i + 1] as number
    if (rule === 1) points.add(value)
    else if (rule === 2) flags = value
    else return []
  }
  const experience = ctx.state.experience
  const canSeeHUDs = !!(flags & 1) && !!experience?.allowedHere &&
    [...experience.agents].some(a => sameKey(a, avatar))
  return uniformList(worn.filter(l => {
    const point = l.attachment!.point
    const hud = isHUD(point)
    if (points.size && !points.has(point) && !(hud && points.has(-1))) return false
    return !hud || (canSeeHUDs && l.allScripts().some(s => s.experience?.id === experience!.id))
  }).map(l => l.prims[0]!.key), 'key')
}

// Offsets from the HUD attachment anchor to the screen centre, in screen heights.
const hudOrigins: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [0.5, -0.5], [0, -0.5], [-0.5, -0.5],
  [0, 0], [-0.5, 0.5], [0, 0.5], [0.5, 0.5],
]
export const llWorldPosToHUD: BuiltinImpl = (ctx, args) => {
  const point = ctx.linkset.attachment?.point ?? 0
  if (!isHUD(point) || !(ctx.state.permissions.granted & PERMISSION_TRACK_CAMERA)) return ZERO_VECTOR
  const { pos, rot, fov, aspect } = ctx.state.camera
  const world = args[0] as Vector
  const local = rotateVector({ x: world.x - pos.x, y: world.y - pos.y, z: world.z - pos.z }, conjugate(rot))
  if (local.x === 0) return ZERO_VECTOR
  const scale = 2 * local.x * Math.tan(fov / 2)
  const [y, z] = hudOrigins[point - 31]!
  return { x: Math.sign(local.x), y: local.y / scale + y * aspect, z: local.z / scale + z }
}
