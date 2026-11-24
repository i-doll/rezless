import { describe, expect, it } from 'vitest'
import { addScript, InventoryType, loadLinkset, makeInventoryItem, PERM_ALL, PERM_COPY, seedRlvInventory, World } from '../src/index.js'
import type { Linkset } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Moving_start
// https://wiki.secondlife.com/wiki/Moving_end
// https://wiki.secondlife.com/wiki/LlSetKeyframedMotion
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const looper = `list log;
  default {
    state_entry() { llSetPrimitiveParams([PRIM_PHYSICS_SHAPE_TYPE, PRIM_PHYSICS_SHAPE_CONVEX]); log += "entry"; }
    moving_start() { log += "moving_start"; }
    moving_end() {
      string mode = llGetObjectDesc();
      if (mode == "sleeps") llSleep(1.0);
      log += "moving_end";
      if (mode == "die") llDie();
      if (mode == "stop play") { llSetObjectDesc(""); llSetKeyframedMotion([], [KFM_COMMAND, KFM_CMD_STOP]); }
      if (mode == "play" || mode == "stop play") { llSetObjectDesc(""); llSetKeyframedMotion([], [KFM_COMMAND, KFM_CMD_PLAY]); }
    }
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

  // A script loaded and never started starts automatically at the first event fired at it. Second
  // Life starts every script as it is added, so this follows the start measured above: the
  // script hears of the motion only once it has started, with state_entry and then moving_start,
  // ahead of the event that started it.
  it('tells a script that starts automatically that its object moves, after its state_entry', async () => {
    const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [
      { name: 'main', source: { source: looper } },
      { name: 'late', source: { source: watcher.replace('default {', 'default { touch_start(integer n) { log += "touch"; }') } },
    ] }] })
    scripts.main!.start()
    scripts.main!.fire('link_message', { sender_num: 0, num: 0, str: 'go', id: '' })
    linkset.advanceTime(500)
    expect(scripts.late!.hasStarted).toBe(false)
    scripts.late!.fire('touch_start', { num_detected: 1 })
    linkset.advanceTime(500)
    expect(scripts.late!.global('log')).toEqual(['entry', 'moving_start', 'touch'])
  })

  // A script that first starts as its object is rezzed, still in keyframed motion, starts the same
  // way, and its on_rez was already waiting when the state_entry ended. The rezzed object plays on
  // and raises neither event for a script that had started (see the scripted rez of an object
  // whose keyframed motion plays on).
  it('tells a script that first starts at a rez that its object moves, after its on_rez', async () => {
    const mover = `default { state_entry() { llSetPrimitiveParams([PRIM_PHYSICS_SHAPE_TYPE, PRIM_PHYSICS_SHAPE_CONVEX]);
      llSetKeyframedMotion([<0, 0, 0.3>, 1.0, <0, 0, -0.3>, 1.0], [KFM_MODE, KFM_LOOP, KFM_DATA, KFM_TRANSLATION]); } }`
    const payload = await loadLinkset({ prims: [{ name: 'payload', scripts: [
      { name: 'mover', source: { source: mover } },
      { name: 'late', source: { source: watcher.replace('default {', 'default { on_rez(integer p) { log += "rez"; }') } },
    ] }] })
    payload.scripts.mover!.start()
    payload.linkset.advanceTime(100)
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const item = makeInventoryItem({ name: 'payload', type: InventoryType.OBJECT })
    Object.assign(item, { object: payload.linkset.copy() })
    const rezzer = await loadLinkset({ owner: OWNER, world, region: 'home', position: { x: 100, y: 100, z: 30 },
      prims: [{ name: 'rezzer', inventory: [item], scripts: [{ name: 'parent', source: { source:
        'default { state_entry() { llRezObject("payload", llGetPos() + <1.2, 0, 0>, ZERO_VECTOR, ZERO_ROTATION, 1); } }' } }] }] })
    rezzer.scripts.parent!.start()
    const rezzed = world.linksets.at(-1)!
    rezzed.advanceTime(500)
    expect(rezzed.prims[0]!.keyframedMotion!.playing).toBe(true)
    expect(rezzed.allScripts()[1]!.global('log')).toEqual(['entry', 'rez', 'moving_start'])
  })

  // In-world: in a box in looping keyframed motion, one script called llResetOtherScript on the
  // other and then llMessageLinked, two runs -> the reset script logged state_entry, then
  // moving_start, and never got the link message (Aditi, SLua Tideland, 2026-11-24).
  it('tells a script reset by another that its object moves, and drops a message sent after the reset', async () => {
    const reset = `default { link_message(integer f, integer n, string m, key id) {
      if (m == "reset") { llResetOtherScript("late"); llMessageLinked(LINK_THIS, 0, "ping", ""); } } }`
    const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [
      { name: 'main', source: { source: looper } },
      { name: 'late', source: { source: watcher.replace('default {', 'default { link_message(integer f, integer n, string m, key id) { if (m == "ping") log += m; }') } },
      { name: 'resetter', source: { source: reset } },
    ] }] })
    for (const script of Object.values(scripts)) script.start()
    scripts.main!.fire('link_message', { sender_num: 0, num: 0, str: 'go', id: '' })
    linkset.advanceTime(500)
    scripts.resetter!.fire('link_message', { sender_num: 0, num: 0, str: 'reset', id: '' })
    linkset.advanceTime(500)
    expect(scripts.late!.global('log')).toEqual(['entry', 'moving_start'])
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

  // In-world: a looping box whose moving_end called llDie, taken into inventory and, in a second
  // run, taken as a copy -> the box logged that moving_end and died, and no item was saved
  // (Aditi, SLua Tideland, 2026-11-24).
  it.each([false, true])('saves no item when the moving_end kills the object (copy: %s)', async (copy) => {
    const b = await box()
    b.prim.description = 'die'
    go(b)
    b.linkset.advanceTime(1_500)
    const taken = b.world.attemptAvatarTake(b.avatar, b.prim, { copy })
    expect(taken).toMatchObject({ status: 'unsupported', reason: 'target' })
    expect(taken.object).toBeUndefined()
    expect(b.linkset.dead).toBe(true)
    expect(logOf(b.linkset)).toEqual(['entry', 'moving_start', 'moving_end'])
  })

  // In-world: a looping box whose moving_end called KFM_CMD_PLAY, taken into inventory -> the box
  // rezzed from the item had run that moving_end, stood still and got on_rez only. Taken as a copy
  // -> the copy did the same, and the original got moving_start only as the viewer let go of it,
  // 0.8 s and 9.4 s after its moving_end in two runs. A moving_end that stopped and then played
  // the motion, Take Copy -> the same, with moving_start 0.78 s later (Aditi, SLua Tideland,
  // 2026-11-24).
  it.each([
    [false, 'play'], [true, 'play'], [true, 'stop play'],
  ])('keeps the item still when the moving_end plays the motion (copy: %s, %s)', async (copy, mode) => {
    const b = await box()
    b.prim.description = mode
    go(b)
    b.linkset.advanceTime(1_500)
    const rezzed = take(b, copy)
    const z = rezzed.prims[0]!.params.position.z
    if (copy) {
      b.linkset.advanceTime(600)
      expect(logOf(b.linkset)).toEqual(['entry', 'moving_start', 'moving_end'])
    }
    rezzed.advanceTime(1_000)
    expect(logOf(rezzed)).toEqual(['entry', 'moving_start', 'moving_end', 'rez'])
    expect(rezzed.prims[0]!.params.position.z).toBe(z)
    if (copy) expect(logOf(b.linkset)).toEqual(['entry', 'moving_start', 'moving_end', 'moving_start'])
  })
})

describe('Take Copy of an object in keyframed motion by another avatar', () => {
  // In-world: a looping box everyone could copy, Take Copy by the other avatar, two runs -> the
  // original logged nothing and moved on; the copy rezzed moving with on_rez only, its scripts
  // having logged state_entry and moving_start before the Take Copy (Aditi, SLua Tideland,
  // 2026-11-24).
  it('leaves the object moving and saves the copy moving', async () => {
    const b = await box()
    for (const prim of b.linkset.prims) {
      prim.permMask = { ...prim.permMask, everyone: PERM_COPY, next: PERM_ALL }
      for (const item of prim.inventory) item.permMask = { ...item.permMask, everyone: PERM_COPY, next: PERM_ALL }
    }
    const other = b.world.addAvatar({ region: 'home', key: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', username: 'other' })
    go(b)
    b.linkset.advanceTime(1_500)
    const taken = b.world.attemptAvatarTake(other, b.prim, { copy: true }).object!
    b.linkset.advanceTime(2_000)
    expect(logOf(b.linkset)).toEqual(['entry', 'moving_start'])
    expect(b.linkset.prims[0]!.keyframedMotion!.playing).toBe(true)
    seedRlvInventory(other, { sharedRootId: null, entries: [{ id: 'taken', kind: 'item', parentId: null, name: 'probe', object: taken, assetType: 'object' }] })
    const rezzed = b.world.attemptAvatarRez(other, 'taken', { x: 128, y: 130, z: 100 }).object!
    const z = rezzed.prims[0]!.params.position.z
    rezzed.advanceTime(300)
    expect(rezzed.prims[0]!.params.position.z).not.toBe(z)
    rezzed.advanceTime(2_000)
    expect(logOf(rezzed)).toEqual(['entry', 'moving_start', 'rez'])
  })
})

