import { describe, expect, it } from 'vitest'
import { loadLinkset, seedRlvInventory, World } from '../src/index.js'
import type { Linkset } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Moving_start
// https://wiki.secondlife.com/wiki/Moving_end
// https://wiki.secondlife.com/wiki/LlApplyImpulse
// https://wiki.secondlife.com/wiki/LlPushObject
// https://wiki.secondlife.com/wiki/LlMoveToTarget
// Every "In-world" note below was measured on Aditi, SLua Tideland, 2026-11-24, with a 0.5 m box
// resting on the platform whose script logged moving_start and moving_end with their times. Region
// time dilation read 0.99 to 1.00. rezless does not simulate physics: the test sets the velocity
// a fall or a stop would give.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const source = `list log; float t0;
  add(string s) { log += s + " " + (string)llRound((llGetTime() - t0) * 10); }
  default {
    moving_start() { add("moving_start"); }
    moving_end() { add("moving_end"); }
    on_rez(integer p) { t0 = llGetTime(); add("rez"); }
    link_message(integer f, integer n, string m, key id) {
      t0 = llGetTime();
      if (m == "on") llSetStatus(STATUS_PHYSICS, TRUE);
      else if (m == "off") llSetStatus(STATUS_PHYSICS, FALSE);
      else if (m == "imp") llApplyImpulse(<0, 0, 1.5>, FALSE);
      else if (m == "push") llPushObject(llGetKey(), <0, 0, 1.5>, ZERO_VECTOR, FALSE);
      else if (m == "mtt") llMoveToTarget(llGetPos() + <0, 0, 0.3>, 0.3);
    }
  }`

async function box() {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
  const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER,
    prims: [{ scripts: [{ name: 'main', source: { source } }] }] })
  linkset.prims[0]!.params.position = { x: 128, y: 128, z: 100 }
  scripts.main!.start()
  return { world, avatar, linkset, prim: linkset.prims[0]!, log: () => scripts.main!.global('log') as string[] }
}
type Box = Awaited<ReturnType<typeof box>>
const sendTo = (linkset: Linkset, m: string) =>
  linkset.allScripts()[0]!.fire('link_message', { sender_num: 0, num: 0, str: m, id: '' })
const send = (b: Box, m: string) => sendTo(b.linkset, m)
const logOf = (linkset: Linkset) => linkset.allScripts()[0]!.global('log') as string[]

/** A physical box at rest, its first settle done. */
async function resting() {
  const b = await box()
  send(b, 'on')
  b.linkset.advanceTime(2_000)
  expect(b.log()).toEqual(['moving_start 0', 'moving_end 9'])
  return b
}

describe('a viewer selection of a physical object', () => {
  // In-world: a box switched physical, then inspected 0.3 s later (the viewer selects the object
  // and lets go of it once the region answers), three runs -> moving_end at the selection, 0.40 to
  // 0.44 s after the switch; moving_start 0.40 to 0.49 s later and moving_end 0.60 to 0.75 s after
  // that.
  it('stops a settling object at an edit, and starts and settles it when the viewer lets go', async () => {
    const b = await box()
    send(b, 'on')
    b.linkset.advanceTime(300)
    expect(b.world.attemptAvatarEdit(b.avatar, b.prim).status).toBe('opened')
    b.linkset.advanceTime(1_000)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 3', 'moving_start 7'])
    b.linkset.advanceTime(500)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 3', 'moving_start 7', 'moving_end 14'])
  })

  // In-world: the same box at rest, inspected three times -> no event at the selection; moving_start
  // as the viewer let go and moving_end 0.60 to 0.69 s later (once with a start and end 0.04 s apart
  // before them).
  it('starts and settles an object at rest when the viewer lets go of an edit', async () => {
    const b = await resting()
    b.world.attemptAvatarEdit(b.avatar, b.prim)
    b.linkset.advanceTime(2_000)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 9', 'moving_start 24', 'moving_end 31'])
  })

  // In-world: Take Copy 0.3 s after the switch, two runs -> moving_end at the selection, 0.37 and
  // 0.42 s after the switch; moving_start 0.89 and 1.13 s later, and moving_end 0.71 and 0.76 s
  // after that. At rest, three runs -> moving_start as the viewer let go and moving_end 0.51 to
  // 0.67 s later, twice after a start and end 0.04 s apart. Take Copies of keyframed motion let
  // go 0.78 s after the selection; rezless holds every Take Copy 0.7 s.
  it('stops a settling object at a Take Copy, and starts and settles it when the viewer lets go', async () => {
    const b = await box()
    send(b, 'on')
    b.linkset.advanceTime(300)
    expect(b.world.attemptAvatarTake(b.avatar, b.prim, { copy: true }).status).toBe('taken')
    b.linkset.advanceTime(2_000)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 3', 'moving_start 10', 'moving_end 17'])
  })

  it('starts and settles an object at rest when the viewer lets go of a Take Copy', async () => {
    const b = await resting()
    b.world.attemptAvatarTake(b.avatar, b.prim, { copy: true })
    b.linkset.advanceTime(2_000)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 9', 'moving_start 27', 'moving_end 34'])
  })

  // In-world: shift-drag copies (a Duplicate where the original stands, the original then moved
  // 1 m while still selected), three runs -> the original got moving_start 0.55 to 0.60 s after the
  // copy appeared and moving_end 0.75 to 0.80 s later, twice after a start and end 0.04 s apart as
  // it was moved; the copy got moving_start as it appeared, moving_end 0.15 to 0.28 s in and
  // moving_start 0.59 to 0.64 s in, as Duplicate copies do. All three copies then fell through the
  // platform, which is a fall for the test to set.
  it('stops and restarts a shift-drag copy and its original as a Duplicate does', async () => {
    const b = await resting()
    const copy = b.linkset.duplicate()
    b.linkset.advanceTime(2_000)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 9', 'moving_start 27', 'moving_end 34'])
    expect(logOf(copy)).toEqual(['moving_start 0', 'moving_end 2', 'moving_start 7', 'moving_end 14'])
  })
})

describe('an impulse, push or move target during a selection', () => {
  // In-world: llApplyImpulse lifting the box 0.09 m, or llPushObject on itself, called as the
  // Duplicate's copy appeared (the viewer still held the original), three runs each -> the box
  // never rose, and gave no event at the call; moving_start came 0.55 to 0.71 s after the call as
  // the viewer let go and moving_end 0.67 to 0.75 s later, as without the call. Outside a
  // selection the same call gave moving_start 0.05 s later and moving_end 0.40 s after that.
  it.each(['imp', 'push'])('drops %s during a Duplicate selection', async (call) => {
    const b = await resting()
    const copy = b.linkset.duplicate({ x: 0, y: 1.2, z: 0 })
    send(b, call)
    b.linkset.advanceTime(2_000)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 9', 'moving_start 7', 'moving_end 14'])
    expect(logOf(copy)).toEqual(['moving_start 0', 'moving_end 2', 'moving_start 7', 'moving_end 14'])
  })

  // In-world: llApplyImpulse called just after an inspect selected the box, two runs -> no lift;
  // moving_start 0.33 and 0.44 s after the call and moving_end 0.60 and 0.67 s later.
  it('drops an impulse during an edit selection', async () => {
    const b = await resting()
    b.world.attemptAvatarEdit(b.avatar, b.prim)
    send(b, 'imp')
    b.linkset.advanceTime(2_000)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 9', 'moving_start 4', 'moving_end 11'])
  })

  // In-world: llMoveToTarget 0.3 m up, tau 0.3, called as the Duplicate's copy appeared, three
  // runs -> the box stayed put and gave no event until the viewer let go, 0.62 to 0.67 s after the
  // call; then it got moving_start and rose 0.22 m in the next 0.4 s, and moving_end only once it
  // had fallen back after llStopMoveToTarget. Outside a selection the call gave moving_start 0.07 s
  // later and the box rose at once.
  it('holds a move target until the viewer lets go, and leaves the rest to the test', async () => {
    const b = await resting()
    b.linkset.duplicate({ x: 0, y: 1.2, z: 0 })
    send(b, 'mtt')
    b.linkset.advanceTime(600)
    expect(b.prim.params.position.z).toBe(100)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 9'])
    b.linkset.advanceTime(1_500)
    expect(b.prim.params.position.z).toBeGreaterThan(100.2)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 9', 'moving_start 7'])
    b.linkset.setVelocity({ x: 0, y: 0, z: 0 })
    b.linkset.advanceTime(200)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 9', 'moving_start 7', 'moving_end 22'])
  })
})

describe('the viewer rezzing a physical item', () => {
  function rezTaken(b: Box, taken: Linkset) {
    seedRlvInventory(b.avatar, { sharedRootId: null, entries: [{ id: 'taken', kind: 'item', parentId: null, name: 'probe', object: taken, assetType: 'object' }] })
    return b.world.attemptAvatarRez(b.avatar, 'taken', { x: 130, y: 130, z: 100 }).object!
  }

  // In-world: a Take Copy 0.3 s after the switch, three runs, and a Take, once -> the item's log,
  // kept across the Take, held the moving_end of the selection before on_rez; rezzed by the viewer,
  // it got on_rez only.
  it.each([true, false])('runs the moving_end of the selection before a Take saves the item (copy: %s)', async (copy) => {
    const b = await box()
    send(b, 'on')
    b.linkset.advanceTime(300)
    const taken = b.world.attemptAvatarTake(b.avatar, b.prim, { copy }).object!
    expect(logOf(taken)).toEqual(['moving_start 0', 'moving_end 3'])
    const rezzed = rezTaken(b, taken)
    rezzed.advanceTime(2_000)
    expect(logOf(rezzed)).toEqual(['moving_start 0', 'moving_end 3', 'rez 0'])
  })

  // In-world: Take Copy items of the physical box rezzed by the viewer onto the platform -> on_rez
  // only, 13 runs: 4 from a copy taken at rest and 2 from one taken while it settled, all in
  // contact; 3 aimed 1, 5 and 10 cm above the platform, which the region placed on it; 2 aimed
  // 0.5 and 1 m above it, which had fallen to the platform before on_rez ran, about 1.2 s after
  // the rez (one gave a start and end 0.04 s apart after on_rez). Switched off and on again, those
  // boxes came to rest 0.75 to 0.77 s after the switch, three runs: a later switch, not a first.
  it.each([
    ['at rest', 2_000],
    ['settling', 300],
  ])('gives on_rez only for a Take Copy taken %s', async (_, wait) => {
    const b = await box()
    send(b, 'on')
    b.linkset.advanceTime(wait)
    const taken = b.world.attemptAvatarTake(b.avatar, b.prim, { copy: true }).object!
    b.linkset.advanceTime(2_000)
    const rezzed = rezTaken(b, taken)
    const carried = logOf(rezzed).length
    rezzed.advanceTime(2_000)
    expect(logOf(rezzed).slice(carried)).toEqual(['rez 0'])
    sendTo(rezzed, 'off')
    rezzed.advanceTime(1_000)
    sendTo(rezzed, 'on')
    rezzed.advanceTime(750)
    expect(logOf(rezzed).slice(carried)).toEqual(['rez 0', 'moving_start 0'])
    rezzed.advanceTime(100)
    expect(logOf(rezzed).slice(carried)).toEqual(['rez 0', 'moving_start 0', 'moving_end 8'])
  })
})
