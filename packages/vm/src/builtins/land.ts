import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { Parcel, WorldParcelOptions } from '../world.js'
import { NULL_KEY, ZERO_VECTOR, type LslType, type LslValue, type Vector } from '../values/types.js'
import { listElementType, typedList } from '../values/list-types.js'
import { findObjectPrim } from './object-reads.js'
import { llScriptDanger } from './region.js'
import { sayError } from './debug.js'
import { nextDataserverKey } from './dataserver.js'
import { PERMISSION_DEBIT, PERMISSION_RETURN_OBJECTS, PERMISSION_PRIVILEGED_LAND_ACCESS } from '../generated/constants.js'
import {
  PARCEL_DETAILS_NAME, PARCEL_DETAILS_DESC, PARCEL_DETAILS_OWNER, PARCEL_DETAILS_GROUP,
  PARCEL_DETAILS_AREA, PARCEL_DETAILS_ID, PARCEL_DETAILS_SEE_AVATARS,
  PARCEL_DETAILS_PRIM_CAPACITY, PARCEL_DETAILS_PRIM_USED, PARCEL_DETAILS_LANDING_POINT,
  PARCEL_DETAILS_LANDING_LOOKAT, PARCEL_DETAILS_TP_ROUTING, PARCEL_DETAILS_FLAGS,
  PARCEL_DETAILS_SCRIPT_DANGER, PARCEL_COUNT_TOTAL, PARCEL_COUNT_TEMP,
} from '../generated/constants.js'

// Empty virtual land for a test that has not supplied a parcel fixture.
const EMPTY_PARCEL: Parcel = {
  region: '', id: NULL_KEY, owner: NULL_KEY, effects: [],
  media: { texture: NULL_KEY, url: '', type: '', width: 0, height: 0, description: '', loop: 0 },
  bounds: { min: { x: 0, y: 0 }, max: { x: 256, y: 256 } },
}
const sameKey = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const positionArg = (args: Parameters<BuiltinImpl>[1]) => args[0] as Vector

function parcelAt(ctx: CallContext, position: Vector): Parcel {
  const { world, region } = ctx.linkset
  return (world && region !== undefined ? world.parcelAt(region, position) : undefined) ?? EMPTY_PARCEL
}

function parcelsOf(ctx: CallContext, parcel: Parcel, simWide: boolean): readonly Parcel[] {
  return simWide && ctx.linkset.world
    ? ctx.linkset.world.parcels.filter((p) => p.region === parcel.region && sameKey(p.owner, parcel.owner))
    : [parcel]
}

const capacity = (parcels: readonly Parcel[]) => Math.trunc(parcels.reduce((sum, p) => sum + (p.maxPrims ?? 0), 0))
const count = (p: WorldParcelOptions, category: number) => p.primCounts?.[category] ?? 0
const owns = (ctx: CallContext, parcel: Parcel) => parcel.owner !== NULL_KEY && sameKey(parcel.owner, ctx.linkset.owner)

export const llGetLandOwnerAt: BuiltinImpl = (ctx, args) => parcelAt(ctx, positionArg(args)).owner
export const llGetParcelFlags: BuiltinImpl = (ctx, args) => parcelAt(ctx, positionArg(args)).flags ?? 0

export const llGetParcelMaxPrims: BuiltinImpl = (ctx, args) =>
  capacity(parcelsOf(ctx, parcelAt(ctx, positionArg(args)), args[1] !== 0))

export const llGetParcelPrimCount: BuiltinImpl = (ctx, args) => {
  const category = args[1] as number
  if (category < PARCEL_COUNT_TOTAL || category > PARCEL_COUNT_TEMP) return 0
  return parcelsOf(ctx, parcelAt(ctx, positionArg(args)), args[2] !== 0).reduce((sum, p) => sum + count(p, category), 0)
}

export const llGetParcelMusicURL: BuiltinImpl = (ctx) => {
  const parcel = parcelAt(ctx, ctx.prim.regionPosition())
  return owns(ctx, parcel) ? parcel.musicURL ?? '' : ''
}

/** Group return powers are not modeled; only the parcel owner has access. */
export const llGetParcelPrimOwners: BuiltinImpl = (ctx, args) => {
  const parcel = parcelAt(ctx, positionArg(args))
  if (!owns(ctx, parcel)) return []
  const values: LslValue[] = []
  const types: LslType[] = []
  for (const [owner, impact] of Object.entries(parcel.primOwners ?? {}).sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase())).slice(0, 100)) {
    values.push(owner, impact)
    types.push('key', 'integer')
  }
  return typedList(values, types)
}

/** Unknown integer rules stop the query; rules of other types are skipped. */
export const llGetParcelDetails: BuiltinImpl = (ctx, args) => {
  const position = positionArg(args)
  const parcel = parcelAt(ctx, position)
  const params = args[1] as readonly LslValue[]
  const values: LslValue[] = []
  const types: LslType[] = []
  for (let i = 0; i < params.length; i++) {
    const rule = params[i]
    const type = listElementType(params, i)
    if (typeof rule !== 'number' || (type !== undefined && type !== 'integer')) continue
    let value: LslValue
    let resultType: LslType = 'integer'
    switch (rule) {
      case PARCEL_DETAILS_NAME: value = parcel.name ?? ''; resultType = 'string'; break
      case PARCEL_DETAILS_DESC: value = parcel.description ?? ''; resultType = 'string'; break
      case PARCEL_DETAILS_OWNER: value = parcel.owner; resultType = 'key'; break
      case PARCEL_DETAILS_GROUP: value = parcel.group ?? NULL_KEY; resultType = 'key'; break
      case PARCEL_DETAILS_AREA:
        value = parcel.area ?? (parcel.bounds.max.x - parcel.bounds.min.x) * (parcel.bounds.max.y - parcel.bounds.min.y)
        break
      case PARCEL_DETAILS_ID: value = parcel.id; resultType = 'key'; break
      case PARCEL_DETAILS_SEE_AVATARS: value = parcel.seeAvatars === false ? 0 : 1; break
      case PARCEL_DETAILS_PRIM_CAPACITY:
        value = capacity(parcelsOf(ctx, parcel, true)); break
      case PARCEL_DETAILS_PRIM_USED:
        value = parcelsOf(ctx, parcel, true).reduce((sum, p) => sum + count(p, PARCEL_COUNT_TOTAL), 0); break
      case PARCEL_DETAILS_LANDING_POINT: value = { ...(parcel.landingPoint ?? ZERO_VECTOR) }; resultType = 'vector'; break
      case PARCEL_DETAILS_LANDING_LOOKAT: value = { ...(parcel.landingLookAt ?? ZERO_VECTOR) }; resultType = 'vector'; break
      case PARCEL_DETAILS_TP_ROUTING: value = parcel.tpRouting ?? 1; break
      case PARCEL_DETAILS_FLAGS: value = parcel.flags ?? 0; break
      case PARCEL_DETAILS_SCRIPT_DANGER: value = llScriptDanger(ctx, [position]) as number; break
      default: return typedList(values, types)
    }
    values.push(value)
    types.push(resultType)
  }
  return typedList(values, types)
}

export const llOverMyLand: BuiltinImpl = (ctx, args) => {
  const id = args[0] as string
  if (id === NULL_KEY || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return 0
  const prim = findObjectPrim(ctx, id)
  let position = prim?.regionPosition()
  if (!position) {
    const world = ctx.linkset.world
    position = [...(world?.objects ?? []), ...(world?.avatars ?? [])]
      .find((p) => p.region === ctx.linkset.region && sameKey(p.key, id))?.position
  }
  return position && owns(ctx, parcelAt(ctx, position)) ? 1 : 0
}

// Effects are fixture requests. They never contact a viewer, exchange money,
// remove VM objects or transfer their ownership.
function effect(ctx: CallContext, name: string, args: readonly LslValue[], accepted: boolean, result?: LslValue): void {
  const parcel = parcelAt(ctx, ctx.prim.regionPosition())
  if (parcel === EMPTY_PARCEL) return
  parcel.effects.push({ function: name, args: structuredClone(args), source: ctx.prim.key,
    owner: ctx.linkset.owner, time: ctx.state.clock.now, accepted,
    ...(result === undefined ? {} : { result }) })
}
const validKey = (key: unknown): key is string => typeof key === 'string' && key !== NULL_KEY &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)
const permission = (ctx: CallContext, bit: number) => !!(ctx.state.permissions.granted & bit) &&
  sameKey(ctx.state.permissions.agent, ctx.linkset.owner)
const current = (ctx: CallContext) => parcelAt(ctx, ctx.prim.regionPosition())
const estateManager = (ctx: CallContext) => ctx.linkset.world !== undefined && ctx.linkset.region !== undefined &&
  (ctx.linkset.world.region(ctx.linkset.region).estateManagers ?? []).some(id => sameKey(id, ctx.linkset.owner))

export const llSetParcelMusicURL: BuiltinImpl = (ctx, args) => {
  const parcel = current(ctx)
  const accepted = owns(ctx, parcel)
  effect(ctx, 'llSetParcelMusicURL', args, accepted)
  if (accepted) parcel.musicURL = args[0] as string
}

function landRequest(name: string, target: boolean): BuiltinImpl {
  return (ctx, args) => {
    const accepted = owns(ctx, current(ctx)) && (!target || validKey(args[0]))
    effect(ctx, name, args, accepted)
    return undefined
  }
}
export const llAddToLandBanList = landRequest('llAddToLandBanList', true)
export const llAddToLandPassList = landRequest('llAddToLandPassList', true)
export const llRemoveFromLandBanList = landRequest('llRemoveFromLandBanList', true)
export const llRemoveFromLandPassList = landRequest('llRemoveFromLandPassList', true)
export const llResetLandBanList = landRequest('llResetLandBanList', false)
export const llResetLandPassList = landRequest('llResetLandPassList', false)
export const llEjectFromLand = landRequest('llEjectFromLand', true)

export const llReturnObjectsByID: BuiltinImpl = (ctx, args) => {
  const result = !permission(ctx, PERMISSION_RETURN_OBJECTS) ? -4
    : !(owns(ctx, current(ctx)) || estateManager(ctx)) ? -2 : 0
  effect(ctx, 'llReturnObjectsByID', args, result === 0, result)
  return result
}
export const llReturnObjectsByOwner: BuiltinImpl = (ctx, args) => {
  const result = !validKey(args[0]) || ![1,2,4].includes(args[1] as number) ? -3
    : !permission(ctx, PERMISSION_RETURN_OBJECTS) ? -4
    : !(estateManager(ctx) || (args[1] !== 4 && owns(ctx, current(ctx)))) ? -2 : 0
  effect(ctx, 'llReturnObjectsByOwner', args, result === 0, result)
  return result
}

export const llManageEstateAccess: BuiltinImpl = (ctx, args) => {
  const accepted = estateManager(ctx) && validKey(args[1]) && [4,8,16,32,64,128].includes(args[0] as number)
  const result = accepted ? 1 : 0
  effect(ctx, 'llManageEstateAccess', args, accepted, result)
  return result
}

export const llSetParcelForSale: BuiltinImpl = (ctx, args) => {
  const parcel = current(ctx)
  let result = parcel === EMPTY_PARCEL ? 1
    : !owns(ctx, parcel) || !permission(ctx, PERMISSION_PRIVILEGED_LAND_ACCESS) ? 2
    : parcel.inEscrow ? 3 : 0
  let price = 0, agent = NULL_KEY, objects = false
  if (result === 0 && args[0] !== 0) {
    const options = args[1] as readonly LslValue[]
    for (let i = 0; i < options.length; i += 2) {
      const rule = options[i], value = options[i + 1]
      if (rule === 1 && typeof value === 'number' && Number.isInteger(value)) price = value
      else if (rule === 2 && typeof value === 'string' && (value === NULL_KEY || validKey(value))) agent = value
      else if (rule === 3 && typeof value === 'number' && Number.isInteger(value)) objects = value !== 0
      else { result = 5; break }
    }
    if (result === 0 && (price < 0 || (price === 0 && agent === NULL_KEY))) result = 4
  }
  effect(ctx, 'llSetParcelForSale', args, result === 0, result)
  if (result === 0) {
    if (args[0] === 0) delete parcel.sale
    else parcel.sale = { price, agent, objects }
  }
  return result
}

export const llParcelMediaCommandList: BuiltinImpl = (ctx, args) => {
  const parcel = current(ctx)
  const commands = args[0] as readonly LslValue[]
  const accepted = owns(ctx, parcel)
  effect(ctx, 'llParcelMediaCommandList', args, accepted)
  if (!accepted) return undefined
  // Agent-targeted commands are viewer requests, not changes to parcel settings.
  let agentOnly = false
  for (let i = 0; i < commands.length; i++) {
    const rule = commands[i]
    if (rule === 7) agentOnly = true
    if (rule === 11) i += 2
    else if ([4,5,6,7,9,10,12,13].includes(rule as number)) i++
  }
  if (agentOnly) return undefined
  const media = parcel.media
  for (let i = 0; i < commands.length; i++) {
    const rule = commands[i]
    if ([0,1,2,3,8].includes(rule as number)) continue
    const value = commands[++i]
    if (rule === 4 && typeof value === 'string') media.texture = value
    else if (rule === 5 && typeof value === 'string' && value.length <= 254) media.url = value
    else if (rule === 10 && typeof value === 'string') media.type = value
    else if (rule === 11 && typeof value === 'number' && typeof commands[i+1] === 'number') {
      media.width = value; media.height = commands[++i] as number
    }
    else if (rule === 12 && typeof value === 'string') media.description = value
    else if (rule === 13 && typeof value === 'number') media.loop = value
    else if (rule !== 6 && rule !== 9) break
  }
  return undefined
}

export const llParcelMediaQuery: BuiltinImpl = (ctx, args) => {
  const parcel = current(ctx)
  const accepted = owns(ctx, parcel)
  effect(ctx, 'llParcelMediaQuery', args, accepted)
  if (!accepted) return []
  const values: LslValue[] = [], types: LslType[] = []
  const media = parcel.media
  for (const rule of args[0] as readonly LslValue[]) {
    if (rule === 4) { values.push(media.texture); types.push('key') }
    else if (rule === 5) { values.push(media.url); types.push('string') }
    else if (rule === 10) { values.push(media.type); types.push('string') }
    else if (rule === 11) { values.push(media.width,media.height); types.push('integer','integer') }
    else if (rule === 12) { values.push(media.description); types.push('string') }
    else if (rule === 13) { values.push(media.loop); types.push('float') }
  }
  return typedList(values, types)
}

export const llGiveMoney: BuiltinImpl = (ctx, args) => {
  const debit = permission(ctx, PERMISSION_DEBIT)
  effect(ctx, 'llGiveMoney', args, debit && validKey(args[0]) && (args[1] as number) > 0, 0)
  if (!debit) sayError(ctx, 'Script trying to debit L$ from owner but PERMISSION_DEBIT permission not set!')
  return 0
}
export const llTransferLindenDollars: BuiltinImpl = (ctx, args) => {
  const key = nextDataserverKey(ctx)
  const debit = permission(ctx, PERMISSION_DEBIT)
  const accepted = debit && validKey(args[0]) && (args[1] as number) > 0
  effect(ctx, 'llTransferLindenDollars', args, accepted, key)
  const error = !debit ? 'MISSING_PERMISSION_DEBIT'
    : !validKey(args[0]) ? 'INVALID_DESTINATION'
    : (args[1] as number) <= 0 ? 'INVALID_AMOUNT' : undefined
  if (error) ctx.state.clock.schedule(ctx.state.clock.now, 'transaction_result', {
    id: key, success: 0, data: error,
  })
  // Authorized requests stay pending. Tests can deliver transaction_result;
  // the VM cannot know an account balance or the outcome of a real payment.
  return key
}

export const llTransferOwnership: BuiltinImpl = (ctx, args) => {
  const target = ctx.linkset.world?.avatars.some(a => a.region === ctx.linkset.region && sameKey(a.key, args[0] as string))
  const result = !target ? -2 : (args[2] as readonly LslValue[]).length > 0 ? -1 : 0
  effect(ctx, 'llTransferOwnership', args, result === 0, result)
  return result
}
