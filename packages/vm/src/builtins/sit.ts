import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { Prim } from '../prim.js'
import type { AvatarDestination, WorldAvatar } from '../world.js'
import { NULL_KEY, type Rotation, type Vector } from '../values/types.js'
import { rotateVector } from '../values/ops.js'
import { AGENT_SITTING, INVENTORY_LANDMARK, LINK_THIS, PERMISSION_TELEPORT, PERMISSION_TRIGGER_ANIMATION } from '../generated/constants.js'
import { sayError } from './debug.js'
import { isAgentInRegion } from './viewer.js'

/** A teleport attempt. Accepted means the script's checks passed, not a network confirmation. */
export interface TeleportRequest {
  readonly kind: 'local' | 'landmark' | 'global' | 'home'
  readonly agent: string
  readonly time: number
  readonly accepted: boolean
  readonly region?: string
  readonly position?: Vector
  readonly lookAt?: Vector
  readonly landmark?: string
  readonly globalCoordinates?: Vector
}

const sameKey = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const avatar = (ctx: CallContext, key: string): WorldAvatar | undefined =>
  ctx.linkset.world?.avatars.find(a => sameKey(a.key, key) && a.region === ctx.linkset.region)

function prim(ctx: CallContext, link: number): Prim | undefined {
  return link === LINK_THIS ? ctx.prim : link > 0 ? ctx.linkset.prims[link - 1] : undefined
}

function sitter(ctx: CallContext, target: Prim | undefined): string {
  if (!target?.params.sitTarget.enabled) return NULL_KEY
  return ctx.linkset.world?.avatars.find(a => a.region === ctx.linkset.region && a.sittingOn === target)?.key ?? NULL_KEY
}

export const llAvatarOnSitTarget: BuiltinImpl = ctx => sitter(ctx, ctx.prim)
export const llAvatarOnLinkSitTarget: BuiltinImpl = (ctx, args) => sitter(ctx, prim(ctx, args[0] as number))

export const llSitOnLink: BuiltinImpl = (ctx, args) => {
  const xp = ctx.state.experience
  if (!xp) return -1
  const agent = avatar(ctx, args[0] as string)
  if (!agent) return -4
  if (!xp.allowedHere) return -1
  if (![...xp.agents].some(key => sameKey(key, agent.key))) return -2
  const requested = prim(ctx, args[1] as number)
  if (!requested) return -5
  const targets = [requested, ...ctx.linkset.prims.filter(p => p !== requested)]
  const seat = targets.find(p => p.params.sitTarget.enabled &&
    !ctx.linkset.world!.avatars.some(a => a.sittingOn === p))
  if (!seat) return -3
  ctx.linkset.world!.sitAvatar(agent, seat)
  return 1
}

export const llUnSit: BuiltinImpl = (ctx, args) => {
  const agent = avatar(ctx, args[0] as string)
  if (!agent) return undefined
  const world = ctx.linkset.world!
  const land = world.parcelAt(agent.region, agent.position)
  if (agent.sittingOn?.linkset === ctx.linkset || (land && land.owner !== NULL_KEY && sameKey(land.owner, ctx.linkset.owner))) world.standAvatar(agent)
  return undefined
}

function yawRotation(x: number, y: number): Rotation {
  const half = Math.atan2(y, x) / 2
  return { x: 0, y: 0, z: Math.sin(half), s: Math.cos(half) }
}

export const llSetAgentRot: BuiltinImpl = (ctx, args) => {
  if (!(ctx.state.permissions.granted & PERMISSION_TRIGGER_ANIMATION)) return undefined
  const agent = avatar(ctx, ctx.state.permissions.agent)
  if (!agent) return undefined
  const forward = rotateVector({ x: 1, y: 0, z: 0 }, args[0] as Rotation)
  const rotation = yawRotation(forward.x, forward.y)
  if (agent.info & AGENT_SITTING) agent.standingRotation = rotation
  else agent.rotation = rotation
  return undefined
}

function mayTeleport(ctx: CallContext, key: string): boolean {
  const xp = ctx.state.experience
  const experience = xp?.allowedHere && [...xp.agents].some(agent => sameKey(agent, key))
  const permission = (ctx.state.permissions.granted & PERMISSION_TELEPORT) &&
    sameKey(ctx.state.permissions.agent, key) && sameKey(ctx.linkset.owner, key)
  if (!experience && !permission) {
    sayError(ctx, 'Script trying to teleport agent without current permission!')
    return false
  }
  return isAgentInRegion(ctx, key)
}

function move(ctx: CallContext, key: string, destination: AvatarDestination, lookAt?: Vector): void {
  const agent = avatar(ctx, key)
  if (!agent) return
  const world = ctx.linkset.world!
  world.standAvatar(agent)
  if (lookAt) {
    const local = destination.region === ctx.linkset.region
    agent.rotation = yawRotation(lookAt.x - (local ? destination.position.x : 0), lookAt.y - (local ? destination.position.y : 0))
  }
  agent.region = destination.region
  agent.position = { ...destination.position }
}

export const llTeleportAgent: BuiltinImpl = (ctx, args) => {
  const key = (args[0] as string).toLowerCase()
  const landmark = args[1] as string
  const position = { ...args[2] as Vector }
  const lookAt = { ...args[3] as Vector }
  let accepted = mayTeleport(ctx, key)
  let destination: AvatarDestination | undefined
  if (accepted && landmark) {
    const item = ctx.prim.inventory.find(i => i.name === landmark && i.type === INVENTORY_LANDMARK)
    destination = item ? ctx.linkset.world?.landmarks.get(item.key.toLowerCase()) : undefined
    if (!destination) {
      sayError(ctx, 'Teleport failed: landmark name provided but assets is missing or invalid.')
      accepted = false
    }
  } else if (ctx.linkset.region !== undefined) destination = { region: ctx.linkset.region, position }
  ctx.state.teleportRequests.push({ kind: landmark ? 'landmark' : 'local', agent: key, time: ctx.state.clock.now,
    accepted, landmark, position: { ...(destination?.position ?? position) }, lookAt, ...(destination ? { region: destination.region } : {}) })
  if (accepted && destination) move(ctx, key, destination, lookAt)
  return undefined
}

export const llTeleportAgentGlobalCoords: BuiltinImpl = (ctx, args) => {
  const key = (args[0] as string).toLowerCase()
  const globalCoordinates = { ...args[1] as Vector }
  const position = { ...args[2] as Vector }
  const lookAt = { ...args[3] as Vector }
  const permitted = mayTeleport(ctx, key)
  const region = ctx.linkset.world?.regionAt(globalCoordinates.x, globalCoordinates.y)
  const accepted = permitted && (ctx.linkset.world === undefined || region !== undefined)
  ctx.state.teleportRequests.push({ kind: 'global', agent: key, time: ctx.state.clock.now,
    accepted, globalCoordinates, position, lookAt, ...(region ? { region: region.name } : {}) })
  if (accepted && region) move(ctx, key, { region: region.name, position }, lookAt)
  return undefined
}

export const llTeleportAgentHome: BuiltinImpl = (ctx, args) => {
  const key = (args[0] as string).toLowerCase()
  const agent = avatar(ctx, key)
  const { world, region } = ctx.linkset
  const land = region === undefined ? undefined : world?.parcelAt(region, ctx.prim.regionPosition())
  const accepted = agent !== undefined && land !== undefined && land.owner !== NULL_KEY && sameKey(land.owner, ctx.linkset.owner)
  const destination = agent?.home
  ctx.state.teleportRequests.push({ kind: 'home', agent: key, time: ctx.state.clock.now, accepted,
    ...(destination ? { region: destination.region, position: { ...destination.position } } : {}) })
  if (accepted && destination) move(ctx, key, destination)
  return undefined
}
