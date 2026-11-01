import { it, expect } from 'vitest'
import { loadLinkset } from '../src/index.js'

const v = { x: 1, y: 2, z: 3 }
const zero = { x: 0, y: 0, z: 0 }
const script = (body: string, name = 'p') => ({ name, source: { source: `default { state_entry() { ${body} } }` } })

// https://wiki.secondlife.com/wiki/LlGetMass and LlGetMassMKS.
// In-world: reads.lsl -> zero motion/force/torque, energy 1, mass 1.25 / 125
// on a 0.5 m box, both nonphysical and resting physical. Aditi, SLua Tideland,
// 2026-11-01. These are default fixtures, not a mass or energy simulation.
it.each([false, true])('supplies resting-box defaults, physical=%s', async physical => {
  const { prims, scripts } = await loadLinkset({ prims: [{ scripts: [script(`
    llSay(0, (string)llGetForce()); llSay(0, (string)llGetTorque());
    llSay(0, (string)llGetVel()); llSay(0, (string)llGetAccel()); llSay(0, (string)llGetOmega());
    llSay(0, (string)llGetMass()); llSay(0, (string)llGetMassMKS()); llSay(0, (string)llGetEnergy());
  `)] }] })
  prims[0]!.setStatus(1, physical)
  scripts.p!.start()
  expect(scripts.p!.chat.map(c => c.text)).toEqual([
    ...Array(5).fill('<0.00000, 0.00000, 0.00000>'), '1.250000', '125.000000', '1.000000',
  ])
})

// https://wiki.secondlife.com/wiki/LlApplyImpulse, LlApplyRotationalImpulse,
// LlSetVelocity, LlSetAngularVelocity, LlPushObject. Requests retain local flags
// and requested magnitudes; fixtures, rather than a physics engine, supply reads.
it.each([
  ['llApplyImpulse', '<1,2,3>,TRUE', [v, 1]],
  ['llApplyRotationalImpulse', '<1,2,3>,-7', [v, -7]],
  ['llSetForce', '<1,2,3>,FALSE', [v, 0]],
  ['llSetTorque', '<1,2,3>,TRUE', [v, 1]],
  ['llSetForceAndTorque', '<1,2,3>,<-1,-2,-3>,TRUE', [v, { x: -1, y: -2, z: -3 }, 1]],
  ['llSetVelocity', '<1,2,3>,TRUE', [v, 1]],
  ['llSetAngularVelocity', '<1,2,3>,FALSE', [v, 0]],
  ['llPushObject', 'NULL_KEY,<1,2,3>,ZERO_VECTOR,TRUE', ['00000000-0000-0000-0000-000000000000', v, zero, 1]],
])('records %s without changing kinematic read fixtures', async (name, args, expected) => {
  const { prims, scripts, linkset } = await loadLinkset({ prims: [{ scripts: [script(`${name}(${args}); ${name}(${args});`)] }] })
  scripts.p!.start()
  expect(prims[0]!.physics.requests).toEqual([{ name, args: expected }, { name, args: expected }])
  linkset.advanceTime(1000)
  expect(prims[0]!.params.position).toEqual(zero)
  expect(prims[0]!.physics.velocity).toBeNull()
})

// Explicit fixtures may represent moving objects, arbitrary mass and exhausted
// energy. They do not imply that the VM models the simulator dynamics.
it('lets tests supply every physics read from the root fixture', async () => {
  const { prims, scripts } = await loadLinkset({ prims: [
    {}, { scripts: [script(`
      llSay(0,(string)llGetForce()); llSay(0,(string)llGetTorque());
      llSay(0,(string)llGetVel()); llSay(0,(string)llGetAccel()); llSay(0,(string)llGetOmega());
      llSay(0,(string)llGetMass()); llSay(0,(string)llGetMassMKS());
      llSay(0,(string)llGetCenterOfMass()); llSay(0,(string)llGetEnergy());
    `)] },
  ] })
  Object.assign(prims[0]!.physics, { force: v, torque: v, velocity: v, acceleration: v, omega: v,
    mass: 3, massMKS: 300, centerOfMass: v, energy: .25 })
  scripts.p!.start()
  expect(scripts.p!.chat.map(c => c.text)).toEqual([
    ...Array(5).fill('<1.00000, 2.00000, 3.00000>'), '3.000000', '300.000000', '<1.00000, 2.00000, 3.00000>', '0.250000',
  ])
})

// In-world: com-root/com-child.lsl -> both nonphysical links report root region
// position <116,48,2000>, despite child offset <2,0,0>. Aditi, SLua Tideland,
// 2026-11-01. https://wiki.secondlife.com/wiki/LlGetCenterOfMass
it('uses the current root region position as the default center of mass', async () => {
  const { prims, scripts } = await loadLinkset({ prims: [{}, { scripts: [script('llSay(0,(string)llGetCenterOfMass());')] }] })
  prims[0]!.params.position = v
  prims[1]!.params.position = { x: 20, y: 0, z: 0 }
  scripts.p!.start()
  expect(scripts.p!.chat.map(c => c.text)).toEqual(['<1.00000, 2.00000, 3.00000>'])
})

// In-world: nonphysical.lsl -> impulses, velocity setters and self-push leave
// reads at zero with no DEBUG_CHANNEL error; forces.lsl -> force/torque read
// back the requested frame. physical-calls.lsl -> physical requests cause motion.
// Aditi, SLua Tideland, 2026-11-01. This slice records requests only; tests set
// resulting reads explicitly, including force/torque read-back.
it('keeps requested force and torque separate from the supplied read results', async () => {
  const { prims, scripts } = await loadLinkset({ prims: [{ scripts: [script(`
    llSetForceAndTorque(<1,2,3>,<4,5,6>,TRUE);
    llSay(0,(string)llGetForce()); llSay(0,(string)llGetTorque());
  `)] }] })
  prims[0]!.physics.force = { x: 7, y: 8, z: 9 }
  prims[0]!.physics.torque = v
  scripts.p!.start()
  expect(scripts.p!.chat.map(c => c.text)).toEqual(['<7.00000, 8.00000, 9.00000>', '<1.00000, 2.00000, 3.00000>'])
  expect(prims[0]!.physics.requests).toEqual([{ name: 'llSetForceAndTorque', args: [v, { x: 4, y: 5, z: 6 }, 1] }])
})

it('captures a detached copy of vectors on the caller prim in call order', async () => {
  const { prims, scripts } = await loadLinkset({ prims: [{}, { scripts: [script(`
    vector f=<1,2,3>; llSetForce(f,-2); f.x=99; llApplyImpulse(f,0);
  `)] }] })
  scripts.p!.start()
  expect(prims[0]!.physics.requests).toEqual([])
  expect(prims[1]!.physics.requests).toEqual([
    { name: 'llSetForce', args: [v, -2] },
    { name: 'llApplyImpulse', args: [{ x: 99, y: 2, z: 3 }, 0] },
  ])
})

it('does not share fixtures or request logs between objects', async () => {
  const a = await loadLinkset({ prims: [{ scripts: [script('llSetVelocity(<1,2,3>,TRUE);')] }] })
  const b = await loadLinkset({ prims: [{}] })
  a.prims[0]!.physics.torque.x = 5
  a.scripts.p!.start()
  expect(b.prims[0]!.physics.torque).toEqual(zero)
  expect(b.prims[0]!.physics.requests).toEqual([])
})

it('preserves host fixtures and capture history across script resets', async () => {
  const { prims, scripts } = await loadLinkset({ prims: [{ scripts: [script('llSay(0,(string)llGetEnergy()); llSetTorque(ZERO_VECTOR,FALSE);')] }] })
  prims[0]!.physics.energy = .125
  scripts.p!.start()
  scripts.p!.reset()
  expect(scripts.p!.chat.at(-1)?.text).toBe('0.125000')
  expect(prims[0]!.physics.requests).toHaveLength(2)
})

it('keeps captured requests and fixtures independent in inventory snapshots', async () => {
  const { prims, scripts, linkset } = await loadLinkset({ prims: [{ scripts: [script('llApplyImpulse(<1,2,3>,FALSE);')] }] })
  prims[0]!.physics.velocity = v
  scripts.p!.start()
  const copy = linkset.copy()
  copy.prims[0]!.physics.requests.length = 0
  copy.prims[0]!.physics.velocity!.x = 99
  expect(prims[0]!.physics.requests).toEqual([{ name: 'llApplyImpulse', args: [v, 0] }])
  expect(prims[0]!.physics.velocity).toEqual(v)
})
