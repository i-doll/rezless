import { describe, expect, it } from 'vitest'
import { addScript, loadLinkset, seedRlvInventory, World } from '../src/index.js'
import type { Linkset } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Moving_start
// https://wiki.secondlife.com/wiki/Moving_end
// https://wiki.secondlife.com/wiki/LlSetKeyframedMotion
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const looper = `list log;
  default {
    state_entry() { llSetPrimitiveParams([PRIM_PHYSICS_SHAPE_TYPE, PRIM_PHYSICS_SHAPE_CONVEX]); log += "entry"; }
    moving_start() { log += "moving_start"; }
    moving_end() { if (llGetObjectDesc() == "sleeps") llSleep(1.0); log += "moving_end"; }
    on_rez(integer p) { log += "rez"; }
    touch_start(integer n) { log += "touch"; llSleep(6.0); log += "woke"; }
    link_message(integer f, integer n, string m, key id) {
      if (m == "go") llSetKeyframedMotion([<0, 0, 0.3>, 1.0, <0, 0, -0.3>, 1.0], [KFM_MODE, KFM_LOOP, KFM_DATA, KFM_TRANSLATION]);
    }
  }`
const watcher = `list log;
  default {
    state_entry() { log += "entry"; }
    moving_start() { log += "moving_start"; }
    moving_end() { log += "moving_end"; }
  }`
const logOf = (linkset: Linkset, n = 0) => linkset.allScripts()[n]!.global('log') as string[]

async function box(source = looper) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
  const { linkset, prims, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER,
    prims: [{ scripts: [{ name: 'main', source: { source } }] }] })
  linkset.prims[0]!.params.position = { x: 128, y: 128, z: 100 }
  scripts.main!.start()
  return { world, avatar, linkset, prim: prims[0]!, script: scripts.main! }
}
type Box = Awaited<ReturnType<typeof box>>
const go = (b: Box) => b.script.fire('link_message', { sender_num: 0, num: 0, str: 'go', id: '' })

describe('a script that first starts in a moving object', () => {
  // In-world: a script added to a box in looping keyframed motion -> state_entry, then
  // moving_start (Aditi, SLua Tideland, 2026-11-23, measured for #585).
  it('tells a script added to an object in keyframed motion that it moves', async () => {
    const b = await box()
    go(b)
    b.linkset.advanceTime(500)
    const added = await addScript(b.prim, { name: 'added', source: { source: watcher } })
    b.linkset.advanceTime(100)
    expect(added.global('log')).toEqual(['entry', 'moving_start'])
    b.linkset.advanceTime(3_000)
    expect(added.global('log')).toEqual(['entry', 'moving_start'])
  })

  // In-world: a script added stopped to a box in looping keyframed motion, then set running ->
  // state_entry, then moving_start. The same script stopped, reset and set running again ->
  // state_entry, then moving_start (Aditi, SLua Tideland, 2026-11-24).
  it('tells a script added stopped that its object moves when it is started', async () => {
    const b = await box()
    go(b)
    b.linkset.advanceTime(500)
    const added = await addScript(b.prim, { name: 'added', source: { source: watcher } }, { running: false })
    b.linkset.advanceTime(500)
    expect(added.global('log')).toEqual([])
    added.running = true
    b.linkset.advanceTime(100)
    expect(added.global('log')).toEqual(['entry', 'moving_start'])
    added.running = false
    added.reset()
    b.linkset.advanceTime(500)
    added.running = true
    b.linkset.advanceTime(100)
    expect(added.global('log')).toEqual(['entry', 'moving_start'])
  })

  it('tells a script added to an object at rest nothing', async () => {
    const b = await box()
    const added = await addScript(b.prim, { name: 'added', source: { source: watcher } })
    b.linkset.advanceTime(1_000)
    expect(added.global('log')).toEqual(['entry'])
  })
})

describe('Take of an object in keyframed motion', () => {
  function take(b: Box, copy = false) {
    const taken = b.world.attemptAvatarTake(b.avatar, b.prim, { copy }).object!
    seedRlvInventory(b.avatar, { sharedRootId: null, entries: [{ id: 'taken', kind: 'item', parentId: null, name: 'probe', object: taken, assetType: 'object' }] })
    return b.world.attemptAvatarRez(b.avatar, 'taken', { x: 128, y: 130, z: 100 }).object!
  }

  // In-world: a looping box taken into inventory logged moving_end as it went, and the box rezzed
  // from the item had counted that moving_end before its on_rez (Aditi, SLua Tideland,
  // 2026-11-24).
  it('runs the moving_end of the selection before the object is saved', async () => {
    const b = await box()
    go(b)
    b.linkset.advanceTime(1_500)
    const rezzed = take(b)
    expect(b.linkset.dead).toBe(true)
    expect(logOf(b.linkset)).toEqual(['entry', 'moving_start', 'moving_end'])
    rezzed.advanceTime(1_000)
    expect(logOf(rezzed)).toEqual(['entry', 'moving_start', 'moving_end', 'rez'])
  })

  // In-world: Take Copy of the looping box, two runs -> the original logged moving_end, and the box
  // rezzed from the item had counted it before its on_rez (Aditi, SLua Tideland, 2026-11-24).
  it('runs the moving_end of the selection before a Take Copy is saved', async () => {
    const b = await box()
    go(b)
    b.linkset.advanceTime(1_500)
    const rezzed = take(b, true)
    rezzed.advanceTime(1_000)
    expect(logOf(rezzed)).toEqual(['entry', 'moving_start', 'moving_end', 'rez'])
    b.linkset.advanceTime(1_000)
    expect(logOf(b.linkset)).toEqual(['entry', 'moving_start', 'moving_end', 'moving_start'])
  })

  // In-world: the same box whose moving_end slept 1 s before logging -> nothing logged before the
  // Take; the box rezzed from the item finished that handler, logging moving_end, and then got
  // on_rez (Aditi, SLua Tideland, 2026-11-24).
  it('saves a moving_end handler that sleeps, and finishes it after the rez', async () => {
    const b = await box()
    b.prim.description = 'sleeps'
    go(b)
    b.linkset.advanceTime(1_500)
    const rezzed = take(b)
    expect(logOf(b.linkset)).toEqual(['entry', 'moving_start'])
    rezzed.advanceTime(2_000)
    expect(logOf(rezzed)).toEqual(['entry', 'moving_start', 'moving_end', 'rez'])
  })

  // In-world: a looping box touched into a 6 s sleep and taken during it -> no moving_end before it
  // went; the box rezzed from the item logged woke, rez and then moving_end. Take Copy in the same
  // sleep -> the original woke with neither event, and the rezzed copy logged woke, rez and then
  // moving_end (Aditi, SLua Tideland, 2026-11-24).
  it.each([false, true])('gives a script asleep at the Take its moving_end after the rez (copy: %s)', async (copy) => {
    const b = await box()
    go(b)
    b.linkset.advanceTime(1_500)
    b.world.clock.schedule(b.script, b.world.clock.now, 'touch_start', { num_detected: 1 })
    b.linkset.advanceTime(100)
    const taken = b.world.attemptAvatarTake(b.avatar, b.prim, { copy }).object!
    if (copy) {
      b.linkset.advanceTime(7_000)
      expect(logOf(b.linkset)).toEqual(['entry', 'moving_start', 'touch', 'woke'])
    }
    seedRlvInventory(b.avatar, { sharedRootId: null, entries: [{ id: 'taken', kind: 'item', parentId: null, name: 'probe', object: taken, assetType: 'object' }] })
    const rezzed = b.world.attemptAvatarRez(b.avatar, 'taken', { x: 128, y: 130, z: 100 }).object!
    rezzed.advanceTime(7_000)
    expect(logOf(rezzed)).toEqual(['entry', 'moving_start', 'touch', 'woke', 'rez', 'moving_end'])
  })
})
