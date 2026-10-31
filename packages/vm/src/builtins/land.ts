import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { Parcel, WorldParcelOptions } from '../world.js'
import { NULL_KEY, ZERO_VECTOR, type LslType, type LslValue, type Vector } from '../values/types.js'
import { listElementType, typedList } from '../values/list-types.js'
import { findObjectPrim } from './object-reads.js'
import { llScriptDanger } from './region.js'
import {
  PARCEL_DETAILS_NAME, PARCEL_DETAILS_DESC, PARCEL_DETAILS_OWNER, PARCEL_DETAILS_GROUP,
  PARCEL_DETAILS_AREA, PARCEL_DETAILS_ID, PARCEL_DETAILS_SEE_AVATARS,
  PARCEL_DETAILS_PRIM_CAPACITY, PARCEL_DETAILS_PRIM_USED, PARCEL_DETAILS_LANDING_POINT,
  PARCEL_DETAILS_LANDING_LOOKAT, PARCEL_DETAILS_TP_ROUTING, PARCEL_DETAILS_FLAGS,
  PARCEL_DETAILS_SCRIPT_DANGER, PARCEL_COUNT_TOTAL, PARCEL_COUNT_TEMP,
} from '../generated/constants.js'

// Empty virtual land for a test that has not supplied a parcel fixture.
const EMPTY_PARCEL: Parcel = {
  region: '', id: NULL_KEY, owner: NULL_KEY,
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
