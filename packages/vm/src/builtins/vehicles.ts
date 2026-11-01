import { sayError } from './debug.js'
import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { LslValue, Rotation, Vector } from '../values/types.js'

export type VehicleRequestName = 'llSetVehicleType' | 'llSetVehicleFlags' | 'llRemoveVehicleFlags'
  | 'llSetVehicleFloatParam' | 'llSetVehicleVectorParam' | 'llSetVehicleRotationParam'
export interface VehicleRequest {
  name: VehicleRequestName
  args: readonly LslValue[]
}

/** Last requested configuration, not simulator motion or an LSL read-back. */
export interface VehicleSettings {
  type: number
  flags: number
  /** VEHICLE_* parameter IDs. Explicit setters retain requested magnitudes. */
  params: Record<number, number | Vector | Rotation>
  requests: VehicleRequest[]
}

const vector = (x = 0, y = x, z = x): Vector => ({ x, y, z })

/**
 * https://wiki.secondlife.com/wiki/VEHICLE_TYPE_{SLED,CAR,BOAT,AIRPLANE,BALLOON}
 * No LSL vehicle parameter getters exist. These are the documented presets;
 * observable motion comparisons are cited in vehicles.test.ts.
 */
function defaults(type: number): VehicleSettings['params'] {
  if (type < 1 || type > 5) return {}
  const linearFriction = [vector(), vector(30, 1, 1000), vector(100, 2, 1000), vector(10, 3, 2), vector(200, 10, 5), vector(5)]
  // Columns are vehicle types 1 through 5; rows use their public parameter IDs.
  const floats: Record<number, number[]> = {
    24: [0, 0, 0, 0, 5], 25: [10, 0, .5, .5, .8], 26: [10, 1000, 2, 1000, 10],
    27: [0, 0, 1, 0, 1], 28: [1, 1, .5, .5, 0], 29: [1, 2, 3, .5, 5],
    30: [1000, 1, 5, 2, 5], 31: [120, 60, 60, 60, 60],
    32: [0, 0, .5, 1, 0], 33: [10, 10, 5, 2, 5],
    34: [1000, 1, 4, 4, 6], 35: [120, .8, 4, 8, 10],
    36: [1, 1, .5, .9, 1], 37: [1000, 10, 5, 2, 1000],
    38: [0, -.2, -.3, 1, 0], 39: [1, 1, .8, .7, .7], 40: [10, 1, 1, 2, 5],
  }
  return {
    ...Object.fromEntries(Object.entries(floats).map(([id, values]) => [id, values[type - 1]!])),
    16: linearFriction[type]!, 17: vector([0, 1000, 1000, 10, 20, 10][type]!),
    18: vector(), 19: vector(), 20: vector(), 44: { x: 0, y: 0, z: 0, s: 1 },
  }
}

function setter(name: VehicleRequestName, apply: (state: VehicleSettings, args: readonly LslValue[], ctx: CallContext) => void): BuiltinImpl {
  return (ctx, args) => {
    const state = ctx.prim.vehicle
    state.requests.push({ name, args: structuredClone(args) })
    apply(state, args, ctx)
    return undefined
  }
}

export const llSetVehicleType = setter('llSetVehicleType', (state, args) => {
  const requested = args[0] as number
  state.type = requested
  state.flags = [0, 67, 99, 101, 2, 0][state.type] ?? 0
  state.params = defaults(state.type)
})
export const llSetVehicleFlags = setter('llSetVehicleFlags', (state, args) => {
  if (state.type) state.flags |= args[0] as number
})
export const llRemoveVehicleFlags = setter('llRemoveVehicleFlags', (state, args) => {
  if (state.type) state.flags &= ~(args[0] as number)
})
export const llSetVehicleFloatParam = setter('llSetVehicleFloatParam', (state, args, ctx) => {
  if (!state.type) return
  const id = args[0] as number, value = args[1] as number
  if (id === 16 || id === 17) state.params[id] = vector(value)
  else if (id >= 24 && id <= 40) state.params[id] = value
  else sayError(ctx, `Unknown vehicle float parameter ${id}`)
})
export const llSetVehicleVectorParam = setter('llSetVehicleVectorParam', (state, args, ctx) => {
  if (!state.type) return
  const id = args[0] as number
  if (id >= 16 && id <= 20) state.params[id] = { ...args[1] as Vector }
  else sayError(ctx, `Unknown vehicle vector parameter ${id}`)
})
export const llSetVehicleRotationParam = setter('llSetVehicleRotationParam', (state, args, ctx) => {
  if (!state.type) return
  if (args[0] === 44) state.params[44] = { ...args[1] as Rotation }
  else sayError(ctx, `Unknown vehicle rotation parameter ${args[0]}`)
})
