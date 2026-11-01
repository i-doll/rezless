import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/PRIM_ROTATION
// https://wiki.secondlife.com/wiki/llSetLinkPrimitiveParamsFast
// In-world: X90 child under Z90 root -> region <.5,.5,.5,.5>, local X90;
// llGetRot/llGetLocalRot agree (Aditi, SLua Tideland, Firestorm 7.3.0.83011, 2026-11-01).
const x90 = { x: Math.SQRT1_2, y: 0, z: 0, s: Math.SQRT1_2 }
const z90 = { x: 0, y: 0, z: Math.SQRT1_2, s: Math.SQRT1_2 }
const identity = { x: 0, y: 0, z: 0, s: 1 }

function expectRotation(actual: unknown, expected: typeof identity) {
  const q = actual as typeof identity
  for (const axis of ['x', 'y', 'z', 's'] as const) expect(q[axis]).toBeCloseTo(expected[axis], 5)
}

async function fixture(body: string, child = false) {
  const { scripts, linkset } = await loadLinkset({ prims: [
    { name: 'root', scripts: child ? [] : [{ name: 'probe', source: { source: body } }] },
    { name: 'child', scripts: child ? [{ name: 'probe', source: { source: body } }] : [] },
  ] })
  linkset.prims[0]!.params.rotation = z90
  return { script: scripts.probe!, linkset }
}

describe('PRIM_ROTATION on linked prims', () => {
  it('reads region rotation from a child while local accessors stay local', async () => {
    const { script, linkset } = await fixture(`list out; rotation global; rotation local;
      default { state_entry() {
        out=llGetPrimitiveParams([PRIM_ROTATION,PRIM_ROT_LOCAL]);
        global=llGetRot(); local=llGetLocalRot();
      } }`, true)
    linkset.prims[1]!.params.rotation = x90
    script.start()
    const out = script.global('out') as unknown[]
    expectRotation(out[0], { x: .5, y: .5, z: .5, s: .5 })
    expectRotation(out[1], x90)
    expectRotation(script.global('global'), { x: .5, y: .5, z: .5, s: .5 })
    expectRotation(script.global('local'), x90)
  })

  // In-world: setting child PRIM_ROTATION X90 from identity -> local <.5,.5,.5,.5>;
  // setting identity from X90 -> local Z90, region Z180. Root and child callers agree
  // (Aditi, SLua Tideland, Firestorm 7.3.0.83011, 2026-11-01).
  for (const child of [false, true]) it(`applies the child setter quirk from a ${child ? 'child' : 'root'} script`, async () => {
    const { script } = await fixture(`list x; list zero;
      default { state_entry() {
        llSetLinkPrimitiveParamsFast(2,[PRIM_ROTATION,llEuler2Rot(<PI_BY_TWO,0,0>)]);
        x=llGetLinkPrimitiveParams(2,[PRIM_ROTATION,PRIM_ROT_LOCAL]);
        llSetLinkPrimitiveParamsFast(2,[PRIM_ROT_LOCAL,llEuler2Rot(<PI_BY_TWO,0,0>)]);
        llSetLinkPrimitiveParamsFast(2,[PRIM_ROTATION,ZERO_ROTATION]);
        zero=llGetLinkPrimitiveParams(2,[PRIM_ROTATION,PRIM_ROT_LOCAL]);
      } }`, child)
    script.start()
    const x = script.global('x') as unknown[]
    expectRotation(x[0], { x: 0, y: Math.SQRT1_2, z: Math.SQRT1_2, s: 0 })
    expectRotation(x[1], { x: .5, y: .5, z: .5, s: .5 })
    const zero = script.global('zero') as unknown[]
    expectRotation(zero[0], { x: 0, y: 0, z: 1, s: 0 })
    expectRotation(zero[1], z90)
  })

  // In-world: PRIM_ROTATION equal to the current local rotation does nothing,
  // including identity (Aditi, SLua Tideland, Firestorm 7.3.0.83011, 2026-11-01).
  it('leaves a child alone when PRIM_ROTATION equals its current local rotation', async () => {
    const { script } = await fixture(`list out; list zero;
      default { state_entry() {
        rotation q=llEuler2Rot(<PI_BY_TWO,0,0>);
        llSetLinkPrimitiveParamsFast(2,[PRIM_ROT_LOCAL,q]);
        llSetLinkPrimitiveParamsFast(2,[PRIM_ROTATION,q]);
        out=llGetLinkPrimitiveParams(2,[PRIM_ROT_LOCAL]);
        llSetLinkPrimitiveParamsFast(2,[PRIM_ROT_LOCAL,ZERO_ROTATION]);
        llSetLinkPrimitiveParamsFast(2,[PRIM_ROTATION,ZERO_ROTATION]);
        zero=llGetLinkPrimitiveParams(2,[PRIM_ROT_LOCAL]);
      } }`)
    script.start()
    expectRotation((script.global('out') as unknown[])[0], x90)
    expectRotation((script.global('zero') as unknown[])[0], identity)
  })

  // In-world: root PRIM_ROTATION and PRIM_ROT_LOCAL both set/read the root pose
  // (Aditi, SLua Tideland, Firestorm 7.3.0.83011, 2026-11-01).
  for (const param of ['PRIM_ROTATION', 'PRIM_ROT_LOCAL']) it(`keeps ${param} root setters unchanged`, async () => {
    const { script } = await fixture(`list out;
      default { state_entry() {
        llSetLinkPrimitiveParamsFast(1,[${param},llEuler2Rot(<PI_BY_TWO,0,0>)]);
        out=llGetLinkPrimitiveParams(1,[PRIM_ROTATION,PRIM_ROT_LOCAL]);
      } }`)
    script.start()
    for (const q of script.global('out') as unknown[]) expectRotation(q, x90)
  })
})

// In-world: attached root with local X90 -> PRIM_ROTATION and llGetRot return
// avatar Z90; both setters keep local X90
// (Aditi, SLua Tideland, Firestorm 7.3.0.83011, 2026-11-01).
for (const param of ['PRIM_ROTATION', 'PRIM_ROT_LOCAL']) it(`reads avatar rotation on an attachment root after ${param}`, async () => {
  const world = new World()
  const owner = '11111111-1111-1111-1111-111111111111'
  world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: owner, username: 'tester', rotation: z90 })
  const { scripts, linkset } = await loadLinkset({ world, region: 'home', owner, prims: [
    { scripts: [{ name: 'probe', source: { source: `list out; rotation global; rotation local;
      default { state_entry() {
        llSetLinkPrimitiveParamsFast(LINK_THIS,[${param},llEuler2Rot(<PI_BY_TWO,0,0>)]);
        out=llGetPrimitiveParams([PRIM_ROTATION,PRIM_ROT_LOCAL]);
        global=llGetRot(); local=llGetLocalRot();
      } }` } }] },
  ] })
  linkset.attachToAvatar(owner, 1)
  scripts.probe!.start()
  const out = scripts.probe!.global('out') as unknown[]
  expectRotation(out[0], z90)
  expectRotation(out[1], x90)
  expectRotation(scripts.probe!.global('global'), z90)
  expectRotation(scripts.probe!.global('local'), x90)
})
