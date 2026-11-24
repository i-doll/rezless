import { describe, expect, it } from 'vitest'
import { InventoryType, loadLinkset, makeInventoryItem, seedRlvInventory, World } from '../src/index.js'
import type { Linkset } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Moving_start
// https://wiki.secondlife.com/wiki/Moving_end
// https://wiki.secondlife.com/wiki/LlSetKeyframedMotion
// Every "In-world" note below was measured on Aditi, SLua Tideland, 2026-11-23, with 0.5 m boxes
// on or above the platform whose scripts logged moving_start and moving_end with the time since
// each command, three runs of each case unless it says otherwise.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const logger = `list log; float t0;
  add(string s) { log += s + " " + (string)llRound((llGetTime() - t0) * 10); }`
const handlers = `moving_start() { add("moving_start"); }
    moving_end() { add("moving_end"); }`

function world() {
  const w = new World()
  w.addRegion('home', { x: 0, y: 0 })
  const avatar = w.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
  return { world: w, avatar }
}

async function box(source: string, w = world()) {
  const { linkset, scripts } = await loadLinkset({ world: w.world, region: 'home', owner: OWNER,
    prims: [{ scripts: [{ name: 'main', source: { source } }] }] })
  linkset.prims[0]!.params.position = { x: 128, y: 128, z: 100 }
  const script = scripts.main!
  script.start()
  return { ...w, linkset, script, log: () => script.global('log') as string[] }
}
type Box = Awaited<ReturnType<typeof box>>
const send = (b: Box, m: string) => b.script.fire('link_message', { sender_num: 0, num: 0, str: m, id: '' })
const logOf = (linkset: Linkset) => linkset.allScripts()[0]!.global('log') as string[]

describe('motion that starts and ends while a handler sleeps', () => {
  const mover = `${logger}
    go(float m) { llSetKeyframedMotion([<0, 0, 0.3>, m], [KFM_DATA, KFM_TRANSLATION]); }
    default {
      ${handlers}
      state_entry() { llSetPrimitiveParams([PRIM_PHYSICS_SHAPE_TYPE, PRIM_PHYSICS_SHAPE_CONVEX]); }
      link_message(integer f, integer n, string m, key id) {
        list a = llCSV2List(m);
        string k = llList2String(a, 0); float motion = llList2Float(a, 1); float s = llList2Float(a, 2);
        t0 = llGetTime();
        go(motion);
        if (k == "k") llSleep(s);
        else if (k == "x") { llSleep(s); llSetKeyframedMotion([], []); }
        else if (k == "ss2") { llSleep(0.3); llSleep(0.6); }
        else if (k == "s0") { llSleep(0.0); llSleep(1.0); }
        else if (k == "sx") { llSleep(0.2); llSetKeyframedMotion([<0, 0, -0.3>, 0.4], [KFM_DATA, KFM_TRANSLATION]); llSleep(1.0); }
        else if (k == "pp") { llSleep(0.2); llSetKeyframedMotion([], [KFM_COMMAND, KFM_CMD_PAUSE]); llSleep(0.3);
          llSetKeyframedMotion([], [KFM_COMMAND, KFM_CMD_PLAY]); llSleep(1.0); }
        else if (k == "ps") { llSleep(0.2); llSetKeyframedMotion([], [KFM_COMMAND, KFM_CMD_STOP]); llSleep(0.5); }
      }
    }`

  // In-world: keyframed motions of 0.2, 0.5, 1 and 2 s, each in sleeps from 0.05 to 1.2 s longer
  // than the motion, gave neither event in all 51 runs. A 1.5 s sleep after a 0.5 s motion,
  // and a 2.5 s sleep after a 1 s motion, followed by clearing the motion, gave neither too.
  it.each([
    ['k,0.2,0.25'], ['k,0.2,1.4'], ['k,0.5,0.55'], ['k,0.5,1.7'], ['k,1.0,1.05'], ['k,2.0,2.05'], ['k,2.0,3.2'],
    ['x,0.5,1.5'], ['x,1.0,2.5'],
    // In-world: llSleep(0.0) and then a 1 s sleep after a 0.5 s motion -> neither.
    ['s0,0.5,0'],
  ])('gives neither event for %s', async (command) => {
    const b = await box(mover)
    send(b, command)
    b.linkset.advanceTime(5_000)
    expect(b.log()).toEqual([])
  })

  // In-world, a motion longer than the sleep: 0.5 s in 0.2 s gave
  // moving_start at 0.22 and moving_end at 0.51 to 0.53; 1 s in 0.7 s gave 0.73 and 1.02 to 1.04;
  // 2 s in 1.7 s gave 1.73 and 2.02 to 2.04.
  it.each([
    ['k,0.5,0.2', ['moving_start 2', 'moving_end 5']],
    ['k,1.0,0.7', ['moving_start 7', 'moving_end 10']],
    ['k,2.0,1.7', ['moving_start 17', 'moving_end 20']],
  ])('starts after the sleep and ends with the motion for %s', async (command, expected) => {
    const b = await box(mover)
    send(b, command)
    b.linkset.advanceTime(5_000)
    expect(b.log()).toEqual(expected)
  })

  // In-world: a 0.5 s motion and sleeps of 0.3 and 0.6 s -> both after the handler, at 0.94 and
  // 0.98 to 1.0. A 0.2 s sleep, new keyframes for 0.4 s and a 1 s sleep -> both, at 1.22 to 1.27.
  // A 0.2 s sleep, a pause, a 0.3 s sleep, play and a 1 s sleep -> both, at 1.53 to 1.62. A 0.2 s
  // sleep, a stop and a 0.5 s sleep -> both, at 0.73 to 0.8. A 0.01 or 0.05 s busy loop before a
  // 1 s sleep gave both as well, which rezless cannot show: its handlers take no time but sleeps.
  it.each([
    ['ss2,0.5,0', ['moving_start 9', 'moving_end 9']],
    ['sx,0.5,0', ['moving_start 12', 'moving_end 12']],
    ['pp,0.5,0', ['moving_start 15', 'moving_end 15']],
    ['ps,0.5,0', ['moving_start 7', 'moving_end 7']],
  ])('gives both when the handler wakes while the object moves: %s', async (command, expected) => {
    const b = await box(mover)
    send(b, command)
    b.linkset.advanceTime(5_000)
    expect(b.log()).toEqual(expected)
  })

  const physical = `${logger}
    default {
      ${handlers}
      link_message(integer f, integer n, string m, key id) {
        list a = llCSV2List(m);
        string k = llList2String(a, 0); float s = llList2Float(a, 1);
        t0 = llGetTime();
        if (k == "on") llSetStatus(STATUS_PHYSICS, TRUE);
        else if (k == "imp") llApplyImpulse(<0, 0, llGetMass() * 1.5>, FALSE);
        else if (k == "push") llPushObject(llGetKey(), <0, 0, llGetMass() * 1.5>, ZERO_VECTOR, FALSE);
        if (s > 0.0) llSleep(s);
      }
    }`

  // In-world: physics switched on for a box at rest on the platform -> moving_start at once and
  // moving_end when it came to rest 0.8 s in; in a sleep of 1 s, neither. In a 0.05 s sleep
  // moving_start came after the sleep; in a 0.5 s sleep, both.
  it('gives neither event when physics switched on comes to rest inside the sleep', async () => {
    const b = await box(physical)
    send(b, 'on,1.0')
    b.linkset.advanceTime(3_000)
    expect(b.log()).toEqual([])
  })

  it('starts after a short sleep when physics is switched on', async () => {
    const b = await box(physical)
    send(b, 'on,0.05')
    b.linkset.advanceTime(3_000)
    expect(b.log()).toEqual(['moving_start 1', 'moving_end 8'])
  })

  it('gives both when physics switched on is still settling at the end of a 0.5 s sleep', async () => {
    const b = await box(physical)
    send(b, 'on,0.5')
    b.linkset.advanceTime(3_000)
    expect(b.log()).toEqual(['moving_start 5', 'moving_end 8'])
  })

  // In-world: a hop from llApplyImpulse or llPushObject in a 3 s sleep -> neither, two runs each.
  it.each(['imp', 'push'])('gives neither event for a %s that lands inside the sleep', async (kind) => {
    const b = await box(physical)
    b.linkset.prims[0]!.setStatus(1, true)
    // Queued rather than fired: fire() would run the handler through its sleep.
    b.world.clock.schedule(b.script, b.world.clock.now, 'link_message', { sender_num: 0, num: 0, str: `${kind},3.0`, id: '' })
    b.linkset.advanceTime(500)
    b.linkset.setVelocity({ x: 0, y: 0, z: 0 })
    b.linkset.advanceTime(5_000)
    expect(b.log()).toEqual([])
  })
})

describe('pushes, impulses and move targets', () => {
  const physical = `${logger}
    default {
      ${handlers}
      state_entry() { llSetStatus(STATUS_PHYSICS, TRUE); }
      link_message(integer f, integer n, string m, key id) {
        t0 = llGetTime();
        if (m == "imp") llApplyImpulse(<0, 0, llGetMass() * 1.5>, FALSE);
        else if (m == "push") llPushObject(llGetKey(), <0, 0, llGetMass() * 1.5>, ZERO_VECTOR, FALSE);
        else if (m == "mtt") llMoveToTarget(llGetPos() + <0, 0, 0.5>, 0.4);
        else if (m == "stop") llStopMoveToTarget();
      }
    }`

  async function resting(source = physical) {
    const b = await box(source)
    b.linkset.advanceTime(1_000)
    b.script.setGlobal('log', [])
    return b
  }

  // In-world: llApplyImpulse lifting a box at rest on the platform -> moving_start 0.04 to 0.07 s
  // after the call and moving_end 0.47 to 0.51 s after it, as it landed; llPushObject on itself
  // gave the same, three runs each. The landing is left to the test.
  it.each(['imp', 'push'])('starts a physical object at rest at the call: %s', async (kind) => {
    const b = await resting()
    send(b, kind)
    b.linkset.advanceTime(500)
    expect(b.log()).toEqual(['moving_start 0'])
    b.linkset.setVelocity({ x: 0, y: 0, z: 0 })
    b.linkset.advanceTime(500)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 6'])
  })

  // In-world: llMoveToTarget 0.5 m up -> moving_start at once and moving_end 2.04 to 2.07 s later,
  // as the box hung at the target; llStopMoveToTarget 4 s in -> moving_start as it fell and
  // moving_end 1.12 to 1.16 s later, two runs. The fall is the test's to set.
  it('starts at llMoveToTarget, and again when the object falls from the target', async () => {
    const b = await resting()
    send(b, 'mtt')
    b.linkset.advanceTime(2_000)
    b.linkset.setVelocity({ x: 0, y: 0, z: 0 })
    b.linkset.advanceTime(2_000)
    send(b, 'stop')
    b.linkset.advanceTime(100)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 21'])
    b.linkset.setVelocity({ x: 0, y: 0, z: -1 })
    b.linkset.advanceTime(100)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 21', 'moving_start 1'])
  })

  // In-world: llMoveToTarget to where the box rested -> moving_start, and moving_end 0.35 s later;
  // llStopMoveToTarget on the resting box then gave nothing.
  it('starts at a move target where the object already is, and raises nothing at the stop', async () => {
    const b = await resting(physical.replace('llGetPos() + <0, 0, 0.5>', 'llGetPos()'))
    send(b, 'mtt')
    b.linkset.setVelocity({ x: 0, y: 0, z: 0 })
    b.linkset.advanceTime(1_000)
    send(b, 'stop')
    b.linkset.advanceTime(1_000)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 1'])
  })

  // In-world: llApplyImpulse(ZERO_VECTOR, FALSE) on a box at rest -> moving_start 0.05 s later, then
  // five start and end pairs within 0.7 s as it settled.
  it('starts a physical object at rest for an impulse of ZERO_VECTOR', async () => {
    const b = await resting(physical.replace('llApplyImpulse(<0, 0, llGetMass() * 1.5>, FALSE)', 'llApplyImpulse(ZERO_VECTOR, FALSE)'))
    send(b, 'imp')
    b.linkset.advanceTime(100)
    expect(b.log()).toEqual(['moving_start 0'])
  })

  // In-world: a second box pushing a physical box at rest with llPushObject -> the pushed box got
  // moving_start within 0.1 s and moving_end as it landed 0.64 to 1.07 s later, three runs.
  it('starts a physical object another object pushes', async () => {
    const target = await resting()
    const pusher = await box(`default { link_message(integer f, integer n, string m, key id) {
      llPushObject((key)m, <0, 0, 100.0>, ZERO_VECTOR, FALSE); } }`, { world: target.world, avatar: target.avatar })
    pusher.script.fire('link_message', { sender_num: 0, num: 0, str: target.linkset.prims[0]!.key, id: '' })
    target.linkset.advanceTime(100)
    expect(target.log().map((line) => line.split(' ')[0])).toEqual(['moving_start'])
  })

  // In-world: the three calls on a box that was not physical -> nothing.
  it.each(['imp', 'push', 'mtt'])('raises nothing for a %s on an object that is not physical', async (kind) => {
    const b = await box(`${logger} default { ${handlers}
      link_message(integer f, integer n, string m, key id) {
        if (m == "imp") llApplyImpulse(<0, 0, 1.0>, FALSE);
        else if (m == "push") llPushObject(llGetKey(), <0, 0, 1.0>, ZERO_VECTOR, FALSE);
        else llMoveToTarget(llGetPos() + <0, 0, 0.5>, 0.4);
      } }`)
    send(b, kind)
    b.linkset.advanceTime(1_000)
    expect(b.log()).toEqual([])
  })
})

describe('moving events at a rez', () => {
  const child = `list log;
    default {
      on_rez(integer p) { log += "rez"; }
      moving_start() { log += "moving_start"; }
      moving_end() { log += "moving_end"; }
    }`

  async function rezzer(call: string, physicalItem = false) {
    const w = world()
    const payload = await loadLinkset({ prims: [{ name: 'payload', scripts: [{ name: 'child', source: { source: child } }] }] })
    payload.scripts.child!.start()
    if (physicalItem) payload.linkset.prims[0]!.setStatus(1, true)
    const item = makeInventoryItem({ name: 'payload', type: InventoryType.OBJECT })
    Object.assign(item, { object: payload.linkset })
    const loaded = await loadLinkset({ owner: OWNER, world: w.world, region: 'home', position: { x: 100, y: 100, z: 30 },
      prims: [{ name: 'rezzer', inventory: [item], scripts: [{ name: 'parent', source: { source: `default { state_entry() { ${call} } }` } }] }] })
    loaded.scripts.parent!.start()
    const rezzed = w.world.linksets.at(-1)!
    return { world: w.world, rezzed }
  }

  // In-world: a box rezzed with llRezObjectWithParams and REZ_FLAG_PHYSICAL, on the platform or
  // 0.5 m above it -> on_rez, moving_start 0.02 to 0.05 s later and moving_end as it came to rest
  // 0.84 to 1.27 s after that. A physical item rezzed with llRezObject gave the same.
  it.each([
    ['llRezObjectWithParams("payload", [REZ_POS, <1.2, 0, 0>, TRUE, FALSE, REZ_FLAGS, REZ_FLAG_PHYSICAL])', false],
    ['llRezObject("payload", llGetPos() + <1.2, 0, 0>, ZERO_VECTOR, ZERO_ROTATION, 1)', true],
  ])('starts an object rezzed physical, after on_rez: %s', async (call, physicalItem) => {
    const f = await rezzer(`${call};`, physicalItem)
    f.rezzed.advanceTime(1_000)
    expect(logOf(f.rezzed)).toEqual(['rez', 'moving_start', 'moving_end'])
  })

  // In-world: a physical box rezzed with a velocity of 1 m/s up -> on_rez, moving_start, and
  // moving_end 0.31 to 0.33 s later as it landed, left to the test here.
  it('keeps an object rezzed physical with a velocity moving until the test stops it', async () => {
    const f = await rezzer('llRezObject("payload", llGetPos() + <1.2, 0, 0>, <0, 0, 1.0>, ZERO_ROTATION, 1);', true)
    f.rezzed.advanceTime(1_000)
    expect(logOf(f.rezzed)).toEqual(['rez', 'moving_start'])
    f.rezzed.setVelocity({ x: 0, y: 0, z: 0 })
    f.rezzed.advanceTime(1_000)
    expect(logOf(f.rezzed)).toEqual(['rez', 'moving_start', 'moving_end'])
  })

  // In-world: a box rezzed not physical with llRezObject (three runs on the platform, one 0.5 m
  // above it), llRezAtRoot and llRezObjectWithParams -> on_rez, moving_start 0.02 s later and
  // moving_end 0.05 s after that.
  it.each([
    'llRezObject("payload", llGetPos() + <1.2, 0, 0>, ZERO_VECTOR, ZERO_ROTATION, 1)',
    'llRezAtRoot("payload", llGetPos() + <1.2, 0, 0>, ZERO_VECTOR, ZERO_ROTATION, 1)',
    'llRezObjectWithParams("payload", [REZ_POS, <1.2, 0, 0>, TRUE, FALSE])',
  ])('starts and ends an object rezzed not physical: %s', async (call) => {
    const f = await rezzer(`${call};`)
    f.rezzed.advanceTime(100)
    expect(logOf(f.rezzed)).toEqual(['rez', 'moving_start', 'moving_end'])
  })

  // In-world: a still box the viewer rezzed, twice, and one holding paused keyframed motion, once
  // -> on_rez only.
  it('raises neither for an object the viewer rezzes', async () => {
    const w = world()
    const payload = await loadLinkset({ prims: [{ name: 'payload', scripts: [{ name: 'child', source: { source: child } }] }] })
    payload.scripts.child!.start()
    seedRlvInventory(w.avatar, { sharedRootId: null, entries: [{ id: 'item', kind: 'item', parentId: null, name: 'payload', object: payload.linkset, assetType: 'object' }] })
    const rezzed = w.world.attemptAvatarRez(w.avatar, 'item', { x: 1, y: 2, z: 3 }).object!
    rezzed.advanceTime(1_000)
    expect(logOf(rezzed)).toEqual(['rez'])
  })

  // In-world: the viewer rezzing a physical item onto the platform -> on_rez, moving_start 0.07 s
  // later and moving_end 0.26 s after that, two runs; rezzed 0.8 m above it, on_rez only, once.
  it('starts a physical object the viewer rezzes', async () => {
    const w = world()
    const payload = await loadLinkset({ prims: [{ name: 'payload', scripts: [{ name: 'child', source: { source: child } }] }] })
    payload.scripts.child!.start()
    payload.linkset.prims[0]!.setStatus(1, true)
    seedRlvInventory(w.avatar, { sharedRootId: null, entries: [{ id: 'item', kind: 'item', parentId: null, name: 'payload', object: payload.linkset, assetType: 'object' }] })
    const rezzed = w.world.attemptAvatarRez(w.avatar, 'item', { x: 1, y: 2, z: 3 }).object!
    rezzed.advanceTime(1_000)
    expect(logOf(rezzed)).toEqual(['rez', 'moving_start', 'moving_end'])
  })

  // In-world: a box whose looping keyframed motion its rezzer derezzed to inventory with
  // llDerezObject, rezzed again with llRezObject -> on_rez only, and it moved on.
  it('raises neither for a scripted rez of an object whose keyframed motion plays on', async () => {
    const payload = await loadLinkset({ prims: [{ name: 'payload', scripts: [{ name: 'child', source: { source: `${child.replace('default {', `default {
      state_entry() { llSetPrimitiveParams([PRIM_PHYSICS_SHAPE_TYPE, PRIM_PHYSICS_SHAPE_CONVEX]);
        llSetKeyframedMotion([<0, 0, 0.3>, 1.0, <0, 0, -0.3>, 1.0], [KFM_MODE, KFM_LOOP, KFM_DATA, KFM_TRANSLATION]); }`)}` } }] }] })
    payload.scripts.child!.start()
    payload.linkset.advanceTime(100)
    payload.scripts.child!.setGlobal('log', [])
    const w = world()
    const item = makeInventoryItem({ name: 'payload', type: InventoryType.OBJECT })
    Object.assign(item, { object: payload.linkset.copy() })
    const loaded = await loadLinkset({ owner: OWNER, world: w.world, region: 'home', position: { x: 100, y: 100, z: 30 },
      prims: [{ name: 'rezzer', inventory: [item], scripts: [{ name: 'parent', source: { source:
        'default { state_entry() { llRezObject("payload", llGetPos() + <1.2, 0, 0>, ZERO_VECTOR, ZERO_ROTATION, 1); } }' } }] }] })
    loaded.scripts.parent!.start()
    const rezzed = w.world.linksets.at(-1)!
    const before = rezzed.prims[0]!.params.position.z
    rezzed.advanceTime(500)
    expect(logOf(rezzed)).toEqual(['rez'])
    expect(rezzed.prims[0]!.params.position.z).not.toBe(before)
  })
})

describe('Duplicate and Take of an object in keyframed motion', () => {
  const looper = `${logger}
    default {
      ${handlers}
      state_entry() { llSetPrimitiveParams([PRIM_PHYSICS_SHAPE_TYPE, PRIM_PHYSICS_SHAPE_CONVEX]); }
      on_rez(integer p) { add("rez"); }
      link_message(integer f, integer n, string m, key id) {
        if (m == "go") { t0 = llGetTime(); llSetKeyframedMotion([<0, 0, 0.3>, 1.0, <0, 0, -0.3>, 1.0], [KFM_MODE, KFM_LOOP, KFM_DATA, KFM_TRANSLATION]); }
        else if (m == "play") llSetKeyframedMotion([], [KFM_COMMAND, KFM_CMD_PLAY]);
      }
    }`
  const z = (linkset: Linkset) => linkset.prims[0]!.params.position.z

  // In-world: a looping motion, Duplicate, three runs -> the original got moving_end at once and
  // moving_start 0.54 to 0.86 s later; the copy's script started from the top, the copy stood
  // still with no event, and KFM_CMD_PLAY started its motion with moving_start.
  it('pauses the original while the viewer holds it selected, and copies the motion paused', async () => {
    const b = await box(looper)
    send(b, 'go')
    b.linkset.advanceTime(4_300)
    const copy = b.linkset.duplicate({ x: 0, y: -1.5, z: 0 })
    b.linkset.advanceTime(1_000)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 43', 'moving_start 50'])
    const still = z(copy)
    copy.advanceTime(1_000)
    expect(z(copy)).toBe(still)
    expect(logOf(copy)).toEqual([])
    copy.allScripts()[0]!.fire('link_message', { sender_num: 0, num: 0, str: 'play', id: '' })
    copy.advanceTime(500)
    expect(z(copy)).not.toBe(still)
    expect(logOf(copy).map((line) => line.split(' ')[0])).toEqual(['moving_start'])
  })

  // In-world: Take of the moving box -> moving_end in the original before it went; the box rezzed
  // from the item got on_rez only and stood still until KFM_CMD_PLAY started it, with
  // moving_start. Take Copy -> moving_end in the original, moving_start 0.78 s later, and the
  // same still copy.
  it.each([false, true])('saves the motion paused at a Take (copy: %s)', async (copy) => {
    const b = await box(looper)
    send(b, 'go')
    b.linkset.advanceTime(1_500)
    const taken = b.world.attemptAvatarTake(b.avatar, b.linkset.prims[0]!, { copy }).object!
    b.linkset.advanceTime(1_000)
    // rezless removes a taken object at once, so its scripts never run that moving_end.
    expect(b.log().map((line) => line.split(' ')[0])).toEqual(copy ? ['moving_start', 'moving_end', 'moving_start'] : ['moving_start'])
    seedRlvInventory(b.avatar, { sharedRootId: null, entries: [{ id: 'taken', kind: 'item', parentId: null, name: 'probe', object: taken, assetType: 'object' }] })
    const rezzed = b.world.attemptAvatarRez(b.avatar, 'taken', { x: 128, y: 130, z: 100 }).object!
    rezzed.advanceTime(1_000)
    expect(z(rezzed)).toBe(100)
    const carried = logOf(taken).length
    expect(logOf(rezzed).slice(carried).map((line) => line.split(' ')[0])).toEqual(['rez'])
    rezzed.allScripts()[0]!.fire('link_message', { sender_num: 0, num: 0, str: 'play', id: '' })
    rezzed.advanceTime(500)
    expect(z(rezzed)).not.toBe(100)
    expect(logOf(rezzed).slice(carried).map((line) => line.split(' ')[0])).toEqual(['rez', 'moving_start'])
  })

  // In-world: an edit and an inspect selecting the moving box, five runs -> moving_end at once and
  // moving_start 0.31 to 0.47 s later.
  it('pauses the motion while the viewer edits the object', async () => {
    const b = await box(looper)
    send(b, 'go')
    b.linkset.advanceTime(1_000)
    expect(b.world.attemptAvatarEdit(b.avatar, b.linkset.prims[0]!).status).toBe('opened')
    b.linkset.advanceTime(1_000)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 10', 'moving_start 14'])
  })

  // In-world: a script that paused the motion in its moving_end handler at a Duplicate still got
  // moving_start 0.54 s later.
  it('plays the motion again when the viewer lets go, after a script paused it', async () => {
    const b = await box(looper.replace('moving_end() { add("moving_end"); }',
      'moving_end() { add("moving_end"); llSetKeyframedMotion([], [KFM_COMMAND, KFM_CMD_PAUSE]); }'))
    send(b, 'go')
    b.linkset.advanceTime(1_000)
    b.linkset.duplicate()
    b.linkset.advanceTime(1_000)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 10', 'moving_start 17'])
  })

  // In-world: a script that stopped the motion in its moving_end handler at a Duplicate got no
  // moving_start, and the motion stayed stopped.
  it('leaves the motion stopped when a script stopped it while the viewer held the object', async () => {
    const b = await box(looper.replace('moving_end() { add("moving_end"); }',
      'moving_end() { add("moving_end"); llSetKeyframedMotion([], [KFM_COMMAND, KFM_CMD_STOP]); }'))
    send(b, 'go')
    b.linkset.advanceTime(1_000)
    b.linkset.duplicate()
    b.linkset.advanceTime(1_000)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 10'])
    expect(b.linkset.prims[0]!.keyframedMotion!.playing).toBe(false)
  })

  // A Take while an edit still holds the motion paused leaves the copy as still as a Take alone.
  it('keeps a copy still when it is taken while an edit holds the motion paused', async () => {
    const b = await box(looper)
    send(b, 'go')
    b.linkset.advanceTime(1_000)
    b.world.attemptAvatarEdit(b.avatar, b.linkset.prims[0]!)
    const taken = b.world.attemptAvatarTake(b.avatar, b.linkset.prims[0]!, { copy: true }).object!
    const carried = logOf(taken).length
    seedRlvInventory(b.avatar, { sharedRootId: null, entries: [{ id: 'taken', kind: 'item', parentId: null, name: 'probe', object: taken, assetType: 'object' }] })
    const rezzed = b.world.attemptAvatarRez(b.avatar, 'taken', { x: 128, y: 130, z: 100 }).object!
    rezzed.advanceTime(1_000)
    expect(logOf(rezzed).slice(carried).map((line) => line.split(' ')[0])).toEqual(['rez'])
  })

  // A Duplicate's script starts from the top, so it has been told nothing of the original's motion.
  it('starts a Duplicate whose script plays the copied motion in a handler that sleeps', async () => {
    const b = await box(looper.replace('else if (m == "play") llSetKeyframedMotion([], [KFM_COMMAND, KFM_CMD_PLAY]);',
      'else if (m == "play") { llSetKeyframedMotion([], [KFM_COMMAND, KFM_CMD_PLAY]); llSleep(0.5); }\n        else if (m == "nap") llSleep(3.0);'))
    send(b, 'go')
    b.linkset.advanceTime(500)
    b.world.clock.schedule(b.script, b.world.clock.now, 'link_message', { sender_num: 0, num: 0, str: 'nap', id: '' })
    b.linkset.advanceTime(100)
    const copy = b.linkset.duplicate()
    copy.advanceTime(500)
    copy.allScripts()[0]!.fire('link_message', { sender_num: 0, num: 0, str: 'play', id: '' })
    copy.advanceTime(500)
    expect(logOf(copy).map((line) => line.split(' ')[0])).toEqual(['moving_start'])
  })
})

describe('moving events carried by a copy', () => {
  const sleeper = `${logger}
    default {
      ${handlers}
      state_entry() { llSetPrimitiveParams([PRIM_PHYSICS_SHAPE_TYPE, PRIM_PHYSICS_SHAPE_CONVEX]); }
      on_rez(integer p) { add("rez"); }
      link_message(integer f, integer n, string m, key id) {
        t0 = llGetTime();
        if (m == "kfm") { llSetKeyframedMotion([<0, 0, 0.3>, 3.0], [KFM_DATA, KFM_TRANSLATION]); llSleep(1.0); }
        else if (m == "jump") { llSetRegionPos(llGetPos() + <0, 0, 1>); llSleep(2.0); }
      }
    }`
  const queue = (b: Box, m: string) => b.world.clock.schedule(b.script, b.world.clock.now, 'link_message', { sender_num: 0, num: 0, str: m, id: '' })
  const names = (linkset: Linkset) => logOf(linkset).map((line) => line.split(' ')[0])

  // A copy carries on the handler it was copied asleep in, with the change it had not been told of.
  it('gives a copy taken asleep the change its handler had not been told of', async () => {
    const b = await box(sleeper)
    queue(b, 'kfm')
    b.linkset.advanceTime(200)
    const copy = b.linkset.copy({ world: b.world, region: 'home' })
    copy.advanceTime(4_000)
    expect(names(copy).filter((name) => name.startsWith('moving'))).toEqual(['moving_start', 'moving_end'])
  })

  // Only a selection that paused keyframed motion leaves the copy with no moving events: other
  // events that waited for a sleeping handler come out with the copy.
  it('keeps the moving events a Take Copy carries when nothing was paused', async () => {
    const b = await box(sleeper)
    queue(b, 'jump')
    b.linkset.advanceTime(500)
    const taken = b.world.attemptAvatarTake(b.avatar, b.linkset.prims[0]!, { copy: true }).object!
    seedRlvInventory(b.avatar, { sharedRootId: null, entries: [{ id: 'taken', kind: 'item', parentId: null, name: 'probe', object: taken, assetType: 'object' }] })
    const rezzed = b.world.attemptAvatarRez(b.avatar, 'taken', { x: 128, y: 130, z: 100 }).object!
    rezzed.advanceTime(3_000)
    expect(names(rezzed)).toEqual(expect.arrayContaining(['moving_start', 'moving_end']))
  })
})

describe('moving events across a reset and a state change', () => {
  const mover = `${logger}
    three() { llSetKeyframedMotion([<0, 0, 0.3>, 3.0], [KFM_DATA, KFM_TRANSLATION]); }
    default {
      ${handlers}
      state_entry() { llSetPrimitiveParams([PRIM_PHYSICS_SHAPE_TYPE, PRIM_PHYSICS_SHAPE_CONVEX]); add("entry"); }
      link_message(integer f, integer n, string m, key id) {
        t0 = llGetTime();
        if (m == "rs") { three(); llSleep(1.0); llResetScript(); }
        else if (m == "rs0") { three(); llResetScript(); }
        else if (m == "st") { three(); llSleep(1.0); state two; }
        else if (m == "st0") { three(); state two; }
      }
    }
    state two {
      state_entry() { add("two entry"); }
      moving_start() { add("two moving_start"); }
      moving_end() { add("two moving_end"); }
    }`
  const names = (b: Box) => b.log().map((line) => line.replace(/ -?\d+$/, ''))

  // In-world: a 3 s motion started in a handler that reset the script after a 1 s sleep, or at
  // once -> state_entry, moving_start, and moving_end when the motion ended.
  it.each(['rs', 'rs0'])('tells a reset script its object moves: %s', async (command) => {
    const b = await box(mover)
    b.world.clock.schedule(b.script, b.world.clock.now, 'link_message', { sender_num: 0, num: 0, str: command, id: '' })
    b.linkset.advanceTime(5_000)
    // The reset cleared the log of the handler that started the motion.
    expect(names(b)).toEqual(['entry', 'moving_start', 'moving_end'])
  })

  // In-world: a script reset in a physical box floating at 0.1 m/s -> state_entry, then moving_start.
  it('tells a script reset in a moving physical object that it moves', async () => {
    const b = await box(mover)
    b.linkset.prims[0]!.setStatus(1, true)
    b.linkset.setVelocity({ x: 0.1, y: 0, z: 0 })
    b.linkset.advanceTime(100)
    b.script.reset()
    b.linkset.advanceTime(100)
    expect(names(b)).toEqual(['entry', 'moving_start'])
  })

  // In-world: a 3 s motion started in a handler that changed state after a 1 s sleep -> the new
  // state got moving_end only; changing state at once -> moving_start and moving_end.
  it.each([
    ['st', ['two entry', 'two moving_end']],
    ['st0', ['two entry', 'two moving_start', 'two moving_end']],
  ])('gives the new state what it has not seen: %s', async (command, expected) => {
    const b = await box(mover)
    b.world.clock.schedule(b.script, b.world.clock.now, 'link_message', { sender_num: 0, num: 0, str: command, id: '' })
    b.linkset.advanceTime(5_000)
    expect(names(b).slice(1)).toEqual(expected)
  })
})
