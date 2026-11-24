import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'
import type { Linkset } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlRotLookAt
// https://wiki.secondlife.com/wiki/LlMoveToTarget
// Every "In-world" note below was measured on Aditi, SLua Tideland, 2026-11-24, three runs each,
// with a 0.5 m box over the platform whose script logged its yaw and height every 0.1 s, and a
// Duplicate 1.2 m to the side. rezless does not simulate gravity, so a copy that falls in-world
// stays where it is here.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const source = `default { link_message(integer f, integer n, string m, key id) {
  if (m == "look") { llSetStatus(STATUS_PHYSICS, TRUE); llRotLookAt(llEuler2Rot(<0, 0, PI_BY_TWO>), 2.0, 1.0); }
  else if (m == "move") llMoveToTarget(llGetPos() + <0, 0, 0.3>, 0.3);
  else if (m == "on") llSetStatus(STATUS_PHYSICS, TRUE); } }`

async function box() {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER,
    prims: [{ scripts: [{ name: 'main', source: { source } }] }] })
  linkset.prims[0]!.params.position = { x: 128, y: 128, z: 100 }
  scripts.main!.start()
  return linkset
}
const send = (linkset: Linkset, m: string) => {
  linkset.allScripts()[0]!.fire('link_message', { sender_num: 0, num: 0, str: m, id: '' })
  linkset.advanceTime(0)
}
const yaw = (linkset: Linkset) => {
  const r = linkset.prims[0]!.params.rotation
  return 2 * Math.atan2(r.z, r.s) * 180 / Math.PI
}

describe('a Duplicate of an object with a target', () => {
  // In-world: a physical box with friction 0 turning to llRotLookAt(90 degrees about Z, 2.0, 1.0),
  // duplicated 1 to 1.5 s in, three runs -> the copy appeared at the original's yaw then (37, 38
  // and 50 degrees) and stayed within 5 degrees of it for 8 s, while the original turned on to 78
  // degrees and more.
  it('gives the copy of an object turning to its look target no look target', async () => {
    const original = await box()
    send(original, 'look')
    original.advanceTime(1_000)
    const turned = yaw(original)
    expect(turned).toBeGreaterThan(5)
    expect(turned).toBeLessThan(80)
    const copy = original.duplicate({ x: 0, y: 1.2, z: 0 })
    expect(copy.prims[0]!.targetMotion.look).toBeNull()
    copy.advanceTime(8_000)
    expect(yaw(copy)).toBeCloseTo(turned, 3)
    original.advanceTime(8_000)
    expect(yaw(original)).toBeCloseTo(90, 0)
  })

  // In-world: a non-physical box 0.57 m over the platform called llMoveToTarget(llGetPos() +
  // <0, 0, 0.3>, 0.3), then a Duplicate, three runs -> switched physical 2.5 to 2.8 s later, the
  // copy fell 0.56 m to the platform with no move toward the target; the original, switched
  // physical about 4 s after that, rose 0.29 m to its target.
  it('gives the copy of a non-physical object holding a move target none once it is physical', async () => {
    const original = await box()
    send(original, 'move')
    const copy = original.duplicate({ x: 0, y: 1.2, z: 0 })
    const at = { ...copy.prims[0]!.params.position }
    copy.advanceTime(2_500)
    send(copy, 'on')
    copy.advanceTime(4_000)
    expect(copy.prims[0]!.params.position).toEqual(at)
    send(original, 'on')
    original.advanceTime(4_000)
    expect(original.prims[0]!.params.position.z).toBeCloseTo(100.3, 2)
  })
})
