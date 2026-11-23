import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { WorldAvatar } from '../world.js'
import { NULL_KEY, ZERO_VECTOR, type LslValue, type LslType, type Vector } from '../values/types.js'
import { ruleElementType, typedList, uniformList } from '../values/list-types.js'
import { nextDataserverKey } from './dataserver.js'
import { findObjectPrim, lingeringAvatar } from './object-reads.js'
import { sayError } from './debug.js'
import { WindowThrottle } from '../throttle.js'

const sameKey = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const localAvatars = (ctx: CallContext): WorldAvatar[] =>
  (ctx.linkset.world?.avatars ?? []).filter(a => ctx.linkset.world!.avatarInRegion(a, ctx.linkset.region))
const avatar = (ctx: CallContext, key: string): WorldAvatar | undefined =>
  localAvatars(ctx).find(a => sameKey(a.key, key))

const named = (ctx: CallContext, key: string) => avatar(ctx, key) ?? lingeringAvatar(ctx, key)

export const llGetUsername: BuiltinImpl = (ctx, args) => named(ctx, args[0] as string)?.username ?? ''
export const llGetDisplayName: BuiltinImpl = (ctx, args) => named(ctx, args[0] as string)?.displayName ?? ''

/** An avatar that has just teleported out of the script's region, which still reads it for a moment. */
function departed(ctx: CallContext, key: string): { agent: WorldAvatar, info: number } | undefined {
  const world = ctx.linkset.world
  const agent = world?.avatars.find(a => sameKey(a.key, key))
  const info = agent && world!.departingAvatarInfo(agent, ctx.linkset.region ?? '')
  return agent && info !== undefined ? { agent, info } : undefined
}

export const llGetAgentInfo: BuiltinImpl = (ctx, args) =>
  avatar(ctx, args[0] as string)?.info ?? departed(ctx, args[0] as string)?.info ?? 0
const departing = (ctx: CallContext, key: string) => {
  const agent = ctx.linkset.world?.avatars.find(a => sameKey(a.key, key))
  return agent && ctx.linkset.world!.lingeringAvatar(agent, ctx.linkset.region)?.mode === 'departing' ? agent : undefined
}
export const llGetAgentLanguage: BuiltinImpl = (ctx, args) =>
  (avatar(ctx, args[0] as string) ?? departing(ctx, args[0] as string))?.language ?? ''
export const llGetAgentSize: BuiltinImpl = (ctx, args) =>
  ({ ...(avatar(ctx, args[0] as string) ?? departed(ctx, args[0] as string)?.agent)?.size ?? ZERO_VECTOR })

// In-world, dotted input uses its first two components and an empty second
// component means Resident, whereas an extra space-separated word remains
// part of the surname and prevents a match.
function username(name: string): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  let first: string, last: string
  name = name.trim()
  if (name.includes('.')) {
    const parts = name.split('.')
    first = clean(parts[0]!)
    last = clean(parts[1]!) || 'resident'
  } else {
    const parts = clean(name).split(' ')
    first = parts.shift()!
    last = parts.join(' ') || 'resident'
  }
  return `${first}.${last}`
}

// In-world: llName2Key kept returning the key of an avatar that had left at the end of a 7 min watch,
// long after every other read had lost it, and through the frame a dying seat hides its sitter. The
// watch didn't see it end, so here it never does.
export const llName2Key: BuiltinImpl = (ctx, args) => {
  const wanted = username(args[0] as string)
  const { world, region } = ctx.linkset
  return world?.avatars.find(a => username(a.username) === wanted
    && (a.region === region || world.hasLeft(a, region) || world.lingeringAvatar(a, region) !== undefined))?.key ?? NULL_KEY
}

const userKeyThrottles = new WeakMap<object, Map<string, WindowThrottle>>()

// In-world the limit is 20 lookups per owner and region, counted over 10 s periods
// by a sliding window, and a lookup past it shuts lookups until the end of the next
// period. Refused lookups count too.
function userKeyThrottled(ctx: CallContext): boolean {
  let byOwner = userKeyThrottles.get(ctx.linkset.clock)
  if (!byOwner) userKeyThrottles.set(ctx.linkset.clock, byOwner = new Map())
  const id = `${ctx.linkset.region ?? ''}\n${ctx.linkset.owner.toLowerCase()}`
  let throttle = byOwner.get(id)
  if (!throttle) byOwner.set(id, throttle = new WindowThrottle(10_000, 20))
  return throttle.take(ctx.state.clock.now) !== 'open'
}

/** Global fixture lookup; answers on every script in this prim, like dataserver. */
export const llRequestUserKey: BuiltinImpl = (ctx, args) => {
  if (userKeyThrottled(ctx)) {
    sayError(ctx, 'Too many llRequestUserKey requests.  Throttled until average falls.')
    return NULL_KEY
  }
  const key = nextDataserverKey(ctx)
  const wanted = username(args[0] as string)
  const data = ctx.linkset.world?.avatars.find(a => username(a.username) === wanted)?.key ?? NULL_KEY
  ctx.state.dataserverRequests.push({ key, source: 'user_key', args: [args[0]], fulfilled: true })
  for (const script of ctx.prim.scripts) {
    ctx.state.clock.scheduleOn(script, ctx.state.clock.now, 'dataserver', { queryid: key, data })
  }
  return key
}

export const llGetAgentList: BuiltinImpl = (ctx, args) => {
  const scope = args[0] as number
  if (scope !== 1 && scope !== 2 && scope !== 4) return uniformList(['INVALID_SCOPE'], 'string')
  if ((args[1] as readonly LslValue[]).length) return uniformList(['INVALID_OPTIONS'], 'string')
  const { world, region } = ctx.linkset
  const parcel = region === undefined ? undefined : world?.parcelAt(region, ctx.prim.regionPosition())
  const inScope = (position: Vector) => {
    if (scope === 4) return true
    const target = world!.parcelAt(region!, position)
    if (scope === 1) return target === parcel
    return sameKey(target?.owner ?? NULL_KEY, parcel?.owner ?? NULL_KEY)
  }
  const agents = localAvatars(ctx).filter(a => inScope(a.position))
  // In-world: an avatar that teleported out stayed in the region's and its parcel's lists until one
  // frame after its "Init".
  for (const a of world?.avatars ?? []) {
    const left = world!.lingeringAvatar(a, region)
    if (left?.mode === 'departing' && !agents.includes(a) && inScope(left.position!)) agents.push(a)
  }
  return uniformList(agents.slice(0, 100).map(a => a.key), 'key')
}

const visualNames: Readonly<Record<string, number>> = {
  height: 33, torso_length: 38, male: 80, heel_height: 198, platform_height: 503,
  shoe_height: 616, hand_size: 675, head_size: 682, leg_length: 692, arm_length: 693,
  neck_length: 756, waist_height: 814, hip_length: 842, hover: 11001,
}
const visualIDs = new Set(Object.values(visualNames))
export const llGetVisualParams: BuiltinImpl = (ctx, args) => {
  const found = named(ctx, args[0] as string)
  if (!found) return []
  const params = args[1] as readonly LslValue[]
  const types: LslType[] = []
  const values = params.map((param, i) => {
    const type = ruleElementType(params, i)
    const id = type === 'integer' ? param as number
      : type === 'string' ? visualNames[(param as string).toLowerCase()] : undefined
    if (id === undefined || !visualIDs.has(id)) { types.push('string'); return '' }
    types.push('float')
    return found.visualParams[id] ?? 0
  })
  return typedList(values, types)
}

function group(ctx: CallContext): string {
  return ctx.linkset.world?.sensorProperties.get(ctx.linkset)?.group ?? NULL_KEY
}

export const llSameGroup: BuiltinImpl = (ctx, args) => {
  const key = args[0] as string
  const own = group(ctx)
  if (sameKey(own, key)) return 1
  const target = named(ctx, key)
    ?? ctx.linkset.world?.objects.find(o => o.region === ctx.linkset.region && sameKey(o.key, key))
  if (target) return Number(sameKey(own, target.group))
  const prim = findObjectPrim(ctx, key)
  return Number(prim !== undefined && sameKey(own, ctx.linkset.world?.sensorProperties.get(prim.linkset!)?.group ?? NULL_KEY))
}

export const llIsFriend: BuiltinImpl = (ctx, args) => {
  if (group(ctx) !== NULL_KEY && sameKey(ctx.linkset.owner, group(ctx))) return llSameGroup(ctx, args)
  const key = args[0] as string
  if (sameKey(key, ctx.linkset.owner)) return 0
  const avatars = ctx.linkset.world?.avatars ?? []
  const owner = avatars.find(a => sameKey(a.key, ctx.linkset.owner))
  const target = avatars.find(a => sameKey(a.key, key))
  if (!(owner && owner.region === ctx.linkset.region) && !(target && target.region === ctx.linkset.region)) return 0
  return owner?.friends.has(key.toLowerCase()) || target?.friends.has(ctx.linkset.owner.toLowerCase()) ? 1 : 0
}
