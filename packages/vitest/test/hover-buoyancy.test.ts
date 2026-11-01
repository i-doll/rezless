import { it, expect } from 'vitest'
import { loadLinkset } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlSetBuoyancy
it('records buoyancy without simulating motion', async () => {
  const { prims, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 'p', source: { source:
    'default { state_entry() { llSetBuoyancy(1.5); } }',
  } }] }] })
  scripts.p!.start()
  expect(prims[0]!.buoyancy).toBe(1.5)
})

it('records hover and repel requests and their explicit stop separately', async () => {
  const { prims, scripts, linkset } = await loadLinkset({ prims: [{ scripts: [{ name: 'p', source: { source:
    `default { state_entry() {
      llSetHoverHeight(5,TRUE,.2); llGroundRepel(3,FALSE,1); llStopHover();
    } }`,
  } }] }] })
  scripts.p!.start()
  expect(prims[0]!.physics.requests).toEqual([
    { name: 'llSetHoverHeight', args: [5, 1, Math.fround(.2)] },
    { name: 'llGroundRepel', args: [3, 0, 1] },
    { name: 'llStopHover', args: [] },
  ])
  linkset.advanceTime(1000)
  expect(prims[0]!.params.position).toEqual({ x: 0, y: 0, z: 0 })
})

// In-world: hover.lsl -> buoyancy 0/1/-1/2/-10/10 causes respectively falling,
// balance, stronger fall, rise, stronger fall and stronger rise. Requests set
// before enabling physics are accepted. Mono, Aditi, SLua Tideland, 2026-11-01.
it.each([-10, -1, 0, 1, 2, 10])('retains buoyancy %s on a nonphysical caller', async value => {
  const { prims, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 'p', source: { source:
    `default { state_entry() { llSetBuoyancy(${value}); } }`,
  } }] }] })
  scripts.p!.start()
  expect(prims[0]!.buoyancy).toBe(value)
  expect(prims[0]!.physics.requests).toEqual([{ name: 'llSetBuoyancy', args: [value] }])
})

// In-world: hover.lsl -> llStopHover after llGroundRepel still rises toward
// the repel height. Mono, Aditi, SLua Tideland, 2026-11-01.
// https://wiki.secondlife.com/wiki/LlGroundRepel
it('replaces requests and stops hover without erasing ground repel', async () => {
  const { prims, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 'p', source: { source:
    `default { state_entry() {
      llSetBuoyancy(1); llSetBuoyancy(-1);
      llSetHoverHeight(4,TRUE,1); llSetHoverHeight(-2,-7,0);
      llGroundRepel(3,FALSE,1); llGroundRepel(-3,TRUE,-1); llStopHover();
    } }`,
  } }] }] })
  scripts.p!.start()
  expect(prims[0]!.buoyancy).toBe(-1)
  expect(prims[0]!.hover).toBeNull()
  expect(prims[0]!.groundRepel).toEqual({ height: -3, water: 1, tau: -1 })
  expect(prims[0]!.physics.requests[3]).toEqual({ name: 'llSetHoverHeight', args: [-2, -7, 0] })
})

// In-world: lifecycle.py -> resetting the setter script removes observable
// buoyancy/hover/repel effects. Aditi, SLua Tideland, Mono, 2026-11-01.
// This API retains requested configuration as history, as physics.requests
// already does. It does not claim these are active simulator controllers.
it('preserves request history across reset without reapplying or moving anything', async () => {
  const { prims, scripts, linkset } = await loadLinkset({ prims: [{ scripts: [{ name: 'p', source: { source:
    `default { touch_start(integer n) {
      llSetBuoyancy(1); llSetHoverHeight(2,TRUE,1); llGroundRepel(3,FALSE,1);
    } }`,
  } }] }] })
  scripts.p!.start()
  scripts.p!.fire('touch_start', { num_detected: 1 })
  scripts.p!.reset()
  expect(prims[0]!.buoyancy).toBe(1)
  expect(prims[0]!.hover).toEqual({ height: 2, water: 1, tau: 1 })
  expect(prims[0]!.groundRepel).toEqual({ height: 3, water: 0, tau: 1 })
  expect(prims[0]!.physics.requests).toHaveLength(3)
  const copy = linkset.copy()
  copy.prims[0]!.hover!.height = 99
  copy.prims[0]!.groundRepel!.height = 99
  copy.prims[0]!.physics.requests.length = 0
  expect(prims[0]!.hover!.height).toBe(2)
  expect(prims[0]!.groundRepel!.height).toBe(3)
  expect(prims[0]!.physics.requests).toHaveLength(3)
  linkset.advanceTime(1000)
  expect(prims[0]!.params.position).toEqual({ x: 0, y: 0, z: 0 })
})

it('keeps child capture separate from the root and other objects', async () => {
  const { prims, scripts } = await loadLinkset({ prims: [{}, { scripts: [{ name: 'p', source: { source:
    'default { state_entry() { llSetBuoyancy(1); llSetHoverHeight(5,TRUE,1); llGroundRepel(6,FALSE,2); } }',
  } }] }] })
  scripts.p!.start()
  expect(prims[0]!.buoyancy).toBe(0)
  expect(prims[0]!.hover).toBeNull()
  expect(prims[0]!.groundRepel).toBeNull()
  expect(prims[0]!.physics.requests).toEqual([])
  expect(prims[1]!.hover!.height).toBe(5)
  const other = await loadLinkset({ prims: [{}] })
  expect(other.prims[0]!.physics.requests).toEqual([])
})

// In-world: followup.py and repel-bounds.py -> tau -1/0/.01 falls, .044444
// responds, and requested height 10000 matches 4096 at tau 100. last-probes.py
// -> at ground 22 / water 20 both water flags use terrain. Mono, Aditi,
// SLua Tideland, 2026-11-01. These fields retain requests, including values
// the simulator ignores or saturates; they are not effective physics reads.
it.each([-1, 0, .01, .044444, 4096, 10000])('retains hover/repel boundary request %s', async value => {
  const { prims, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 'p', source: { source:
    `default { state_entry() { llSetHoverHeight(${value},-1,${value}); llGroundRepel(${value},1,${value}); } }`,
  } }] }] })
  scripts.p!.start()
  const n = Math.fround(value)
  expect(prims[0]!.hover).toEqual({ height: n, water: -1, tau: n })
  expect(prims[0]!.groundRepel).toEqual({ height: n, water: 1, tau: n })
})
