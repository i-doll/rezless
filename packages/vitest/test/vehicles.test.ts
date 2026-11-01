import { it, expect } from 'vitest'
import { loadLinkset } from '../src/index.js'

// https://wiki.secondlife.com/wiki/VEHICLE_TYPE_CAR
it('loads car parameters and flags into inspectable per-prim settings', async () => {
  const { prims, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 'p', source: { source:
    'default { state_entry() { llSetVehicleType(VEHICLE_TYPE_CAR); } }',
  } }] }] })
  scripts.p!.start()
  expect(prims[0]!.vehicle?.type).toBe(2)
  expect(prims[0]!.vehicle?.params[16]).toEqual({ x: 100, y: 2, z: 1000 })
})

const setup = async (body: string) => {
  const loaded = await loadLinkset({ prims: [{ scripts: [{ name: 'p', source: { source:
    `default { state_entry() { ${body} } }`,
  } }] }] })
  loaded.scripts.p!.start()
  return loaded
}

it('replaces parameters on a later type call and adds/removes flag masks', async () => {
  const { prims } = await setup(`
    llSetVehicleType(VEHICLE_TYPE_CAR);
    llSetVehicleFloatParam(VEHICLE_BUOYANCY,1);
    llSetVehicleFlags(VEHICLE_FLAG_HOVER_GLOBAL_HEIGHT);
    llSetVehicleType(VEHICLE_TYPE_BOAT);
    llSetVehicleFlags(VEHICLE_FLAG_MOUSELOOK_STEER);
    llRemoveVehicleFlags(VEHICLE_FLAG_HOVER_UP_ONLY);
  `)
  expect(prims[0]!.vehicle.params[27]).toBe(1)
  expect(prims[0]!.vehicle.flags).toBe(197)
})

it('records vectors, scalar vector parameters and rotations independently', async () => {
  const { prims, linkset } = await setup(`
    llSetVehicleType(VEHICLE_TYPE_CAR);
    llSetVehicleFloatParam(VEHICLE_LINEAR_FRICTION_TIMESCALE,3);
    llSetVehicleVectorParam(VEHICLE_LINEAR_MOTOR_DIRECTION,<1,2,3>);
    llSetVehicleVectorParam(VEHICLE_LINEAR_MOTOR_OFFSET,<.1,.2,.3>);
    llSetVehicleRotationParam(VEHICLE_REFERENCE_FRAME,<0,0,1,0>);
  `)
  const state = prims[0]!.vehicle
  expect(state.params[16]).toEqual({ x: 3, y: 3, z: 3 })
  expect(state.params[18]).toEqual({ x: 1, y: 2, z: 3 })
  expect(state.params[20]).toEqual({ x: Math.fround(.1), y: Math.fround(.2), z: Math.fround(.3) })
  expect(state.params[44]).toEqual({ x: 0, y: 0, z: 1, s: 0 })
  linkset.advanceTime(1000)
  expect(prims[0]!.params.position).toEqual({ x: 0, y: 0, z: 0 })
})

it('copies settings independently into inventory snapshots', async () => {
  const { prims, linkset } = await setup('llSetVehicleType(VEHICLE_TYPE_CAR);')
  const copy = linkset.copy()
  ;(copy.prims[0]!.vehicle.params[16] as { x: number }).x = 9
  expect((prims[0]!.vehicle.params[16] as { x: number }).x).toBe(100)
})

// In-world: vehicles.lsl -> all six types produced distinct default motion;
// comparisons.py -> same-type CAR clears custom buoyancy, flags-or retains
// global hover when adding BLOCK_INTERFERENCE, flags-remove and flags-reset
// remove global hover. Mono, Aditi, SLua Tideland, 2026-11-01.
// Exact presets below follow https://wiki.secondlife.com/wiki/VEHICLE_TYPE_SLED
// and its CAR/BOAT/AIRPLANE/BALLOON siblings. LSL has no parameter getters.
// The SLED page gives efficiency 10 despite the documented [0,1] setter
// range. sled-repeat in last-probes.py differs from explicit efficiency 1;
// retain the documented preset value rather than infer a normalization.
it.each([
  [1, 67, [30, 1, 1000], 1000, [0, 10, 10, 0, 1, 1, 1000, 120, 0, 10, 1000, 120, 1, 1000, 0, 1, 10]],
  [2, 99, [100, 2, 1000], 1000, [0, 0, 1000, 0, 1, 2, 1, 60, 0, 10, 1, .8, 1, 10, -.2, 1, 1]],
  [3, 101, [10, 3, 2], 10, [0, .5, 2, 1, .5, 3, 5, 60, .5, 5, 4, 4, .5, 5, -.3, .8, 1]],
  [4, 2, [200, 10, 5], 20, [0, .5, 1000, 0, .5, .5, 2, 60, 1, 2, 4, 8, .9, 2, 1, .7, 2]],
  [5, 0, [5, 5, 5], 10, [5, .8, 10, 1, 0, 5, 5, 60, 0, 5, 6, 10, 1, 1000, 0, .7, 5]],
] as const)('loads the complete documented preset for type %s', async (type, flags, friction, angular, floats) => {
  const { prims } = await setup(`llSetVehicleType(${type});`)
  const state = prims[0]!.vehicle
  expect(state.flags).toBe(flags)
  expect(state.params).toEqual({
    16: { x: friction[0], y: friction[1], z: friction[2] },
    17: { x: angular, y: angular, z: angular },
    18: { x: 0, y: 0, z: 0 }, 19: { x: 0, y: 0, z: 0 }, 20: { x: 0, y: 0, z: 0 },
    ...Object.fromEntries(floats.map((value, i) => [24 + i, value])),
    44: { x: 0, y: 0, z: 0, s: 1 },
  })
})

// In-world: comparisons.py -> nonpositive/small motor and friction timescales
// saturate in observed motion; deflection -1 matches 0, 2/10 match 1;
// VEHICLE_BUOYANCY -10 matches -1, 10 matches 1. Mono, Aditi, SLua Tideland,
// 2026-11-01. Explicit request capture retains the caller's values, without
// pretending to expose simulator-internal clamping through an absent LSL getter.
it('retains requested magnitudes independently of simulator saturation', async () => {
  const { prims } = await setup(`llSetVehicleType(2);
    llSetVehicleFloatParam(VEHICLE_BUOYANCY,10);
    llSetVehicleFloatParam(VEHICLE_LINEAR_DEFLECTION_EFFICIENCY,-1);
    llSetVehicleFloatParam(VEHICLE_LINEAR_MOTOR_TIMESCALE,-10);
    llSetVehicleVectorParam(VEHICLE_LINEAR_FRICTION_TIMESCALE,<-1,0,10000>);
  `)
  expect(prims[0]!.vehicle.params[27]).toBe(10)
  expect(prims[0]!.vehicle.params[28]).toBe(-1)
  expect(prims[0]!.vehicle.params[30]).toBe(-10)
  expect(prims[0]!.vehicle.params[16]).toEqual({ x: -1, y: 0, z: 10000 })
})

it.each([0])('clears vehicle configuration for NONE, type %s', async type => {
  const { prims } = await setup(`llSetVehicleType(2); llSetVehicleType(${type});
    llSetVehicleFloatParam(27,1); llSetVehicleVectorParam(18,<1,2,3>);
    llSetVehicleRotationParam(44,ZERO_ROTATION); llSetVehicleFlags(-1); llRemoveVehicleFlags(1);
  `)
  expect(prims[0]!.vehicle).toMatchObject({ type: 0, flags: 0, params: {} })
  expect(prims[0]!.vehicle.requests).toHaveLength(7)
})

// In-world: float-to-vector and vector-to-float -> no motor/changed buoyancy
// from the wrong parameter category. Mono, Aditi, SLua Tideland, 2026-11-01.
it('ignores wrong parameter categories while preserving their requests', async () => {
  const { prims } = await setup(`llSetVehicleType(2);
    llSetVehicleFloatParam(18,7); llSetVehicleFloatParam(999,7);
    llSetVehicleVectorParam(27,<1,2,3>); llSetVehicleVectorParam(999,ZERO_VECTOR);
    llSetVehicleRotationParam(16,<0,0,1,0>);
  `)
  expect(prims[0]!.vehicle.params[18]).toEqual({ x: 0, y: 0, z: 0 })
  expect(prims[0]!.vehicle.params[27]).toBe(0)
  expect(prims[0]!.vehicle.params[16]).toEqual({ x: 100, y: 2, z: 1000 })
  expect(prims[0]!.vehicle.params[999]).toBeUndefined()
  expect(prims[0]!.vehicle.requests.at(-1)).toEqual({ name: 'llSetVehicleRotationParam', args: [16, { x: 0, y: 0, z: 1, s: 0 }] })
})

it('replaces both parameters and flags on a repeated type call', async () => {
  const { prims } = await setup(`llSetVehicleType(2); llSetVehicleFloatParam(27,1);
    llSetVehicleFlags(-1); llSetVehicleType(2);`)
  expect(prims[0]!.vehicle.params[27]).toBe(0)
  expect(prims[0]!.vehicle.flags).toBe(99)
  expect(prims[0]!.vehicle.requests.map(r => r.name)).toEqual([
    'llSetVehicleType', 'llSetVehicleFloatParam', 'llSetVehicleFlags', 'llSetVehicleType',
  ])
})

it('captures child requests per prim without sharing presets', async () => {
  const { prims, scripts } = await loadLinkset({ prims: [{}, { scripts: [{ name: 'p', source: { source:
    'default { state_entry() { llSetVehicleType(2); vector v=<1,2,3>; llSetVehicleVectorParam(18,v); v.x=9; } }',
  } }] }] })
  scripts.p!.start()
  expect(prims[0]!.vehicle).toEqual({ type: 0, flags: 0, params: {}, requests: [] })
  expect(prims[1]!.vehicle.params[18]).toEqual({ x: 1, y: 2, z: 3 })
  expect(prims[1]!.vehicle.requests[1]).toEqual({ name: 'llSetVehicleVectorParam', args: [18, { x: 1, y: 2, z: 3 }] })
})

// In-world: lifecycle.py -> reset removes the custom motor/buoyancy effect.
// Mono, Aditi, SLua Tideland, 2026-11-01. Capture records deliberately retain
// the last request; they do not model ownership or active controller lifetime.
it('retains vehicle capture history across script reset', async () => {
  const { prims, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 'p', source: { source:
    'default { touch_start(integer n) { llSetVehicleType(2); llSetVehicleFlags(-1); llRemoveVehicleFlags(-1); } }',
  } }] }] })
  scripts.p!.start()
  scripts.p!.fire('touch_start', { num_detected: 1 })
  scripts.p!.reset()
  expect(prims[0]!.vehicle.type).toBe(2)
  expect(prims[0]!.vehicle.flags).toBe(0)
  expect(prims[0]!.vehicle.requests).toEqual([
    { name: 'llSetVehicleType', args: [2] },
    { name: 'llSetVehicleFlags', args: [-1] },
    { name: 'llRemoveVehicleFlags', args: [-1] },
  ])
})

// In-world: followup.py -> invalid -1/6/99 reset custom buoyancy, but a later
// VEHICLE_BUOYANCY setter still balanced gravity. Mono, Aditi, SLua Tideland,
// 2026-11-01. Retain the requested type, without inventing an internal type.
it.each([-1, 6, 99])('retains undocumented type %s and subsequent parameter requests', async type => {
  const { prims } = await setup(`llSetVehicleType(2); llSetVehicleFloatParam(27,1);
    llSetVehicleType(${type}); llSetVehicleFloatParam(27,1);`)
  expect(prims[0]!.vehicle).toMatchObject({ type, flags: 0, params: { 27: 1 } })
  expect(Object.keys(prims[0]!.vehicle.params)).toEqual(['27'])
})

// In-world: last-probes.py -> these exact DEBUG_CHANNEL messages; none-invalid
// in repel-bounds.py -> no message on an untouched non-vehicle object.
// Mono, Aditi, SLua Tideland, 2026-11-01.
it('reports wrong parameter categories without aborting the script', async () => {
  const { scripts } = await setup(`llSetVehicleType(2);
    llSetVehicleFloatParam(18,1); llSetVehicleFloatParam(999,1);
    llSetVehicleVectorParam(27,<1,2,3>); llSetVehicleVectorParam(999,ZERO_VECTOR);
    llSetVehicleRotationParam(16,ZERO_ROTATION); llSetVehicleRotationParam(999,ZERO_ROTATION);
    llSay(0,"continued");`)
  expect(scripts.p!.chat.map(c => [c.channel, c.text])).toEqual([
    [2147483647, 'Unknown vehicle float parameter 18'],
    [2147483647, 'Unknown vehicle float parameter 999'],
    [2147483647, 'Unknown vehicle vector parameter 27'],
    [2147483647, 'Unknown vehicle vector parameter 999'],
    [2147483647, 'Unknown vehicle rotation parameter 16'],
    [2147483647, 'Unknown vehicle rotation parameter 999'],
    [0, 'continued'],
  ])
  const none = await setup('llSetVehicleFloatParam(999,1);')
  expect(none.scripts.p!.chat).toEqual([])
})
