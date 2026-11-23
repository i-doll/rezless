import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'
import type { Script } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlMoveToTarget
// https://wiki.secondlife.com/wiki/LlRotLookAt
// https://wiki.secondlife.com/wiki/LlSetScriptState
// In-world (Aditi, SLua Tideland, Firestorm RLVa 2.4.2, 2026-11-23): a physical 0.5 m box over a
// 0.5 m thick floor held script M, script S and a reporter. M turned physics on and called
// llMoveToTarget(llGetPos() + <0,0,1>, 0.3) and llRotLookAt(90 degrees about Z, 0.5, 0.3). S, on
// a chat command, called llMoveToTarget(llGetPos() + <0,0,1>, 0.3) or llRotLookAt(180 degrees
// about Z, 0.5, 0.3). M was stopped and started with the script editor's Running checkbox.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const mover = `integer zero; default { link_message(integer s, integer n, string m, key id) {
  if (m == "boom") { zero = 1 / zero; return; }
  llSetStatus(STATUS_PHYSICS, TRUE);
  llMoveToTarget(llGetPos() + <0.0, 0.0, 1.0>, 0.3);
  llRotLookAt(llEuler2Rot(<0.0, 0.0, PI_BY_TWO>), 0.5, 0.3); } }`
const sibling = `default { link_message(integer s, integer n, string m, key id) {
  if (m == "mv") llMoveToTarget(llGetPos() + <0.0, 0.0, 1.0>, 0.3);
  else if (m == "lk") llRotLookAt(llEuler2Rot(<0.0, 0.0, PI>), 0.5, 0.3);
  else if (m == "smv") llStopMoveToTarget();
  else if (m == "slk") llStopLookAt(); } }`
const GROUND = 20

async function box() {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const made = await loadLinkset({ world, region: 'home', owner: OWNER, position: { x: 112, y: 52, z: GROUND }, prims: [{ scripts: [
    { name: 'M', source: { source: mover } }, { name: 'S', source: { source: sibling } },
  ] }] })
  const m = made.scripts['M']!, s = made.scripts['S']!
  m.start(); s.start()
  const root = made.linkset.prims[0]!.params
  const tell = (script: Script, str: string) => { script.fire('link_message', { sender_num: 0, num: 0, str, id: '' }); made.linkset.advanceTime(0) }
  /** Lets go of the box: it rests on the floor where it is, as gravity would leave it. */
  const drop = () => { root.position = { ...root.position, z: GROUND } }
  tell(m, 'go')
  made.linkset.advanceTime(4_000)
  return { linkset: made.linkset, m, s, root, tell, drop, yaw: () => 2 * Math.atan2(root.rotation.z, root.rotation.s) * 180 / Math.PI }
}

describe('the move and look targets of a stopped script', () => {
  // In-world: stopped 2 s, 5 s, 10 s or 18 s after the box reached its target, it fell to the floor
  // within about 2.5 s and kept its 90 degree turn (11 tries in two sessions). Started, it rose back
  // to its target. The first two tries of the first session, read 4 s and 7 s after the stop, still
  // held the target, which the third session of #556 also saw.
  it('let go until the script starts, and act again once it has', async () => {
    const f = await box()
    expect(f.root.position.z).toBeCloseTo(GROUND + 1, 2)
    f.m.running = false
    f.drop()
    f.linkset.advanceTime(5_000)
    expect(f.root.position.z).toBe(GROUND)
    expect(f.yaw()).toBeCloseTo(90, 0)
    f.m.running = true
    f.linkset.advanceTime(4_000)
    expect(f.root.position.z).toBeCloseTo(GROUND + 1, 2)
  })

  // In-world: with M stopped and the box on the floor, S's llMoveToTarget left it on the floor,
  // and S's llRotLookAt left it at 90 degrees. Started, M took the box to S's targets: 1 m above
  // the floor, turned 180 degrees. Measured fresh, and after a Take Copy by the owner.
  it('take a sibling\'s new targets without acting on them until the script starts', async () => {
    const f = await box()
    f.m.running = false
    f.drop()
    f.tell(f.s, 'mv')
    f.tell(f.s, 'lk')
    f.linkset.advanceTime(4_000)
    expect(f.root.position.z).toBe(GROUND)
    expect(f.yaw()).toBeCloseTo(90, 0)
    f.m.running = true
    f.linkset.advanceTime(4_000)
    expect(f.root.position.z).toBeCloseTo(GROUND + 1, 2)
    expect(Math.abs(f.yaw())).toBeCloseTo(180, 0)
  })

  // In-world: S called llStopMoveToTarget and llStopLookAt while M was stopped; started, M still
  // took the box to its target.
  it('stay with the stopped script when a sibling stops them', async () => {
    const f = await box()
    f.m.running = false
    f.drop()
    f.tell(f.s, 'smv')
    f.tell(f.s, 'slk')
    f.m.running = true
    f.linkset.advanceTime(4_000)
    expect(f.root.position.z).toBeCloseTo(GROUND + 1, 2)
  })
})

describe('a shift-drag copy of an object whose targeting script is stopped', () => {
  it('lets a sibling in the copy move it', async () => {
    const f = await box()
    f.m.running = false
    const copy = f.linkset.duplicate()
    copy.advanceTime(1_000)
    const s = copy.prims[0]!.findScript('S')!
    s.running = true
    copy.prims[0]!.params.position = { ...copy.prims[0]!.params.position, z: GROUND }
    s.fire('link_message', { sender_num: 0, num: 0, str: 'mv', id: '' })
    copy.advanceTime(4_000)
    expect(copy.prims[0]!.params.position.z).toBeCloseTo(GROUND + 1, 2)
  })
})

// In-world: M stopped on a Math Error (a division by zero) while the box held its target. The box
// stayed at the target for 15 s, and the editor still showed M as running.
it('keeps the targets of a script that crashed acting', async () => {
  const f = await box()
  expect(() => f.tell(f.m, 'boom')).toThrow()
  expect(f.m.crashed).toBe(true)
  f.drop()
  f.linkset.advanceTime(4_000)
  expect(f.root.position.z).toBeCloseTo(GROUND + 1, 2)
})
