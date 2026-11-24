import { describe, expect, it } from 'vitest'
import { loadLinkset, makeInventoryItem, InventoryType, seedRlvInventory, World } from '../src/index.js'
import type { Linkset, Script } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Changed
// https://wiki.secondlife.com/wiki/LlGiveInventory
// https://wiki.secondlife.com/wiki/LlRemoteLoadScriptPin
// Every "In-world" note below was measured on the Aditi beta grid, SLua Tideland, 2026-11-23,
// with Firestorm 7. The target was a four-prim object: a root with a logging script, a child
// with no script, a child whose script had no changed handler, and a child with a logging
// script. Each logging script said every changed value with llGetInventoryNumber(INVENTORY_ALL).
// A separate object of the same owner, and the root's own script, gave a notecard or loaded a
// script on a chat command.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const MATERIAL = 'f35823e6-40dc-d992-f4cc-85a4cb5464c0'
const logger = 'list seen; list counts; default { changed(integer c) { seen += c; counts += llGetInventoryNumber(INVENTORY_ALL); } }'
const silent = 'integer ran; default { state_entry() { ran = 1; } }'
const notecard = (name: string) => makeInventoryItem({ name, type: InventoryType.NOTECARD, notecardLines: ['probe'] })
const script = (name: string, source: string) => ({ name, source: { source, filename: `${name}.lsl` } })

/** `body` runs when the giver is touched; C1, C2 and C3 stand for the children's keys. */
async function rig(body: string) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const target = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [
    { name: 'R', scripts: [script('r', logger)] },
    { name: 'C1' },
    { name: 'C2', scripts: [script('quiet', silent)] },
    { name: 'C3', scripts: [script('c3', logger)] },
  ] })
  for (const prim of target.prims.slice(1)) prim.remoteScriptAccessPin = 4231
  const keys = (code: string) => code.replace(/C(\d)/g, (_, n: string) => `"${target.prims[Number(n)]!.key}"`)
  const giver = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [
    { name: 'G', inventory: [notecard('nc')], scripts: [script('loaded', silent), script('give', `default { touch_start(integer n) { ${keys(body)} } }`)] },
  ] })
  for (const s of [...Object.values(target.scripts), ...Object.values(giver.scripts)]) s.start()
  const seen = (name: string) => target.scripts[name]!.global('seen')
  return {
    target,
    seen,
    give: () => { giver.linkset.touch(1); giver.linkset.advanceTime(4_000) },
    child: (n: number) => target.prims[n]!,
  }
}

describe('a gift to a child prim', () => {
  // In-world: llGiveInventory to the child with no script -> the root's script said changed(1),
  // its item count unchanged. The same to the child whose script has no changed handler.
  it.each([1, 2])('reaches the root\'s scripts when no script in child %i handles changed', async (n) => {
    const { seen, give, child } = await rig(`llGiveInventory(C${n}, "nc");`)
    give()
    expect(child(n).inventory.some(item => item.name === 'nc')).toBe(true)
    expect(seen('r')).toEqual([1])
    expect(seen('c3')).toEqual([])
  })

  // In-world: the same gift to the child with a logging script -> only that script said changed(1).
  it('reaches only the child when a script there handles changed', async () => {
    const { seen, give } = await rig('llGiveInventory(C3, "nc");')
    give()
    expect(seen('c3')).toEqual([1])
    expect(seen('r')).toEqual([])
  })
})

it('reaches the root\'s scripts when the root itself gives to a child with no changed handler', async () => {
  // In-world: the root's own script gave the notecard to the child with no script, and to the
  // child whose script has no changed handler -> the root's script said changed(1) after each.
  const made = await loadLinkset({ owner: OWNER, prims: [
    { name: 'R', inventory: [notecard('nc')], scripts: [
      script('r', logger),
      script('g', 'default { touch_start(integer n) { llGiveInventory(llGetLinkKey(2), "nc"); } }'),
    ] },
    { name: 'C1' },
  ] })
  for (const s of Object.values(made.scripts)) s.start()
  made.linkset.touch(1)
  made.linkset.advanceTime(100)
  expect(made.prims[1]!.inventory.some(item => item.name === 'nc')).toBe(true)
  expect(made.scripts['r']!.global('seen')).toEqual([1])
})

describe('a remote script load into a child prim', () => {
  // In-world: llRemoteLoadScriptPin into the child with no script, and into the child whose
  // script has no changed handler -> the root's script said changed(1) before the loaded script
  // said state_entry. Loaded into the child with a logging script, only that script said changed(1).
  it.each([1, 2])('reaches the root\'s scripts when no script in child %i handles changed', async (n) => {
    const { seen, give, child } = await rig(`llRemoteLoadScriptPin(C${n}, "loaded", 4231, TRUE, 0);`)
    give()
    expect(child(n).findScript('loaded')!.global('ran')).toBe(1)
    expect(seen('r')).toEqual([1])
    expect(seen('c3')).toEqual([])
  })

  it('reaches only the child when a script there handles changed', async () => {
    const { seen, give } = await rig('llRemoteLoadScriptPin(C3, "loaded", 4231, TRUE, 0);')
    give()
    expect(seen('c3')).toEqual([1])
    expect(seen('r')).toEqual([])
  })

  it('tells the root before the loaded script starts', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const target = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [
      { name: 'R', scripts: [script('r', 'default { changed(integer c) { llLinksetDataWrite("heard", "yes"); } }')] },
      { name: 'C1' },
    ] })
    target.prims[1]!.remoteScriptAccessPin = 4231
    const giver = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [
      script('loaded', 'string read; default { state_entry() { read = llLinksetDataRead("heard"); } }'),
      script('give', `default { touch_start(integer n) { llRemoteLoadScriptPin("${target.prims[1]!.key}", "loaded", 4231, TRUE, 0); } }`),
    ] }] })
    for (const s of [...Object.values(target.scripts), ...Object.values(giver.scripts)]) s.start()
    giver.linkset.touch(1)
    giver.linkset.advanceTime(4_000)
    expect(target.prims[1]!.findScript('loaded')!.global('read')).toBe('yes')
  })

  // In-world: a script with a changed handler loaded into the child with no script -> the root's
  // script said changed(1); the loaded script said state_entry and no changed.
  it('does not count the loaded script as the child\'s handler, nor tell it', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const target = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [
      { name: 'R', scripts: [script('r', logger)] },
      { name: 'C1' },
    ] })
    target.prims[1]!.remoteScriptAccessPin = 4231
    const giver = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [
      script('loaded', logger),
      script('give', `default { touch_start(integer n) { llRemoteLoadScriptPin("${target.prims[1]!.key}", "loaded", 4231, TRUE, 0); } }`),
    ] }] })
    for (const s of [...Object.values(target.scripts), ...Object.values(giver.scripts)]) s.start()
    giver.linkset.touch(1)
    giver.linkset.advanceTime(4_000)
    expect(target.scripts['r']!.global('seen')).toEqual([1])
    expect(target.prims[1]!.findScript('loaded')!.global('seen')).toEqual([])
  })
})

describe('a gift from another owner through llAllowInventoryDrop', () => {
  // In-world: a second avatar's object gave a notecard to a child that allows drops and whose
  // script has no changed handler -> the root's script said changed(64). The same gift to a
  // child that allows drops and logs changed -> only that child said changed(64).
  async function dropRig(child: string) {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const target = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [
      { name: 'R', scripts: [script('r', logger)] },
      { name: 'C', scripts: [script('c', child)] },
    ] })
    const giver = await loadLinkset({ world, region: 'home', owner: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', prims: [{
      inventory: [notecard('nc')],
      scripts: [script('give', `default { touch_start(integer n) { llGiveInventory("${target.prims[1]!.key}", "nc"); } }`)],
    }] })
    for (const s of [...Object.values(target.scripts), ...Object.values(giver.scripts)]) s.start()
    giver.linkset.touch(1)
    giver.linkset.advanceTime(100)
    expect(target.prims[1]!.inventory.some(item => item.name === 'nc')).toBe(true)
    return target.scripts
  }

  it('reaches the root\'s scripts when no script in the child handles changed', async () => {
    const scripts = await dropRig('default { state_entry() { llAllowInventoryDrop(TRUE); } }')
    expect(scripts['r']!.global('seen')).toEqual([64])
  })

  it('reaches only the child when a script there handles changed', async () => {
    const scripts = await dropRig(`list seen; default { state_entry() { llAllowInventoryDrop(TRUE); } changed(integer c) { seen += c; } }`)
    expect(scripts['c']!.global('seen')).toEqual([64])
    expect(scripts['r']!.global('seen')).toEqual([])
  })
})

// In-world: a one-prim box held a script that counted every line it said in a global, said
// state_entry and on_rez, and on a chat command went to a second state. Run, sent the command
// and set not running, the box was taken and rezzed, or taken as a copy and the copy rezzed.
// Set running, the rezzed script said state_entry of the default state with its counter at 1,
// and no on_rez; then it answered in the default state. The original left behind by Take Copy,
// and a box only stopped and started, answered in the second state with the counter running
// on. A script added stopped, which had never run, did the same through a take, a Take Copy
// and a shift-drag copy. An SLua script set not running, taken and rezzed, ran from the top
// again when set running, with its counter at 1.
const stateful = `integer n; list log;
  say(string s) { ++n; log += s + " " + (string)n; }
  default {
    state_entry() { say("default entry"); }
    on_rez(integer p) { say("default on_rez"); }
    touch_start(integer t) { say("default touch"); }
    link_message(integer s, integer i, string m, key k) { state two; }
  }
  state two {
    state_entry() { say("two entry"); }
    on_rez(integer p) { say("two on_rez"); }
    touch_start(integer t) { say("two touch"); }
  }`

async function box(running = true) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
  const made = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [script('s', stateful)] }] })
  const s = made.scripts['s']!
  if (running) {
    s.start()
    s.fire('touch_start', { num_detected: 1 })
    s.fire('link_message', { sender_num: 1, num: 0, str: '', id: '' })
  } else {
    s.running = false
    s.queueStart()
  }
  made.linkset.advanceTime(100)
  s.running = false
  return { world, avatar, linkset: made.linkset, script: s }
}

let items = 0
function rez(f: { world: World; avatar: ReturnType<World['addAvatar']> }, saved: Linkset): Script {
  const id = `item-${++items}`
  seedRlvInventory(f.avatar, { sharedRootId: null, entries: [{ id, kind: 'item', parentId: null, name: 'probe', object: saved, assetType: 'object' }] })
  return f.world.attemptAvatarRez(f.avatar, id, { x: 1, y: 2, z: 3 }).object!.allScripts()[0]!
}

function startAndTouch(script: Script) {
  script.running = true
  script.linkset.advanceTime(100)
  script.fire('touch_start', { num_detected: 1 })
  return script.global('log') as string[]
}

describe('a stopped script through inventory', () => {
  it('comes out of a take reset, and runs state_entry when started', async () => {
    const f = await box()
    const saved = f.linkset.copy()
    f.linkset.remove()
    const copy = rez(f, saved)
    copy.linkset.advanceTime(100)
    expect(copy.running).toBe(false)
    expect(copy.global('log')).toEqual([])
    expect(startAndTouch(copy)).toEqual(['default entry 1', 'default touch 2'])
  })

  it('comes out of a Take Copy reset, and leaves the original as it was', async () => {
    const f = await box()
    const copy = rez(f, f.linkset.copy())
    expect(startAndTouch(copy)).toEqual(['default entry 1', 'default touch 2'])
    expect(startAndTouch(f.script)).toEqual(['default entry 1', 'default touch 2', 'two entry 3', 'two touch 4'])
  })

  it('keeps its place when it is only stopped and started', async () => {
    const f = await box()
    expect(startAndTouch(f.script)).toEqual(['default entry 1', 'default touch 2', 'two entry 3', 'two touch 4'])
  })

  it.each([
    ['a take', (f: Awaited<ReturnType<typeof box>>) => { const saved = f.linkset.copy(); f.linkset.remove(); return rez(f, saved) }],
    ['a Take Copy', (f: Awaited<ReturnType<typeof box>>) => rez(f, f.linkset.copy())],
    ['a shift-drag copy', (f: Awaited<ReturnType<typeof box>>) => f.linkset.duplicate().allScripts()[0]!],
  ])('keeps the state_entry of a script that never ran through %s', async (_, copyOf) => {
    const f = await box(false)
    const copy = copyOf(f)
    copy.linkset.advanceTime(100)
    expect(copy.global('log')).toEqual([])
    expect(startAndTouch(copy)).toEqual(['default entry 1', 'default touch 2'])
  })

  it('runs an SLua script from the top again after a take', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
    const source = 'n = 0\nn += 1\nLLEvents:on("touch_start", function() n += 1 end)'
    const made = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'l', source: { source, filename: 'l.luau' } }] }] })
    const s = made.scripts['l']!
    s.start()
    s.fire('touch_start', { num_detected: 1 })
    expect(s.global('n')).toBe(2)
    s.running = false
    const saved = made.linkset.copy()
    made.linkset.remove()
    const copy = rez({ world, avatar }, saved)
    copy.running = true
    copy.linkset.advanceTime(100)
    expect(copy.global('n')).toBe(1)
  })
})

// In-world, second session: the same counting script, run, sent to its second state and set
// not running, came back reset through each of these too: llDerezObject(DEREZ_TO_INVENTORY) and a
// rez of the item from the rezzer's contents; a detach and a wear of the item; a detach and a rez
// of the item. A script set not running 2 s into a 20 s llSleep, taken and rezzed, ran
// state_entry when started and never ended the sleep. An SLua script that had lowered its memory
// limit to 40000, set not running, taken and rezzed, read 131072 when it ran again.
describe('a stopped script through other trips to inventory', () => {
  it('comes back reset from llDerezObject to inventory', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const rezzer = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{
      objects: { Y: { prims: [{ scripts: [script('s', stateful)] }] } },
      scripts: [script('z', `key child;
        default {
          touch_start(integer t) { if (child) llDerezObject(child, DEREZ_TO_INVENTORY); else llRezObject("Y", llGetPos(), ZERO_VECTOR, ZERO_ROTATION, 0); }
          object_rez(key k) { child = k; }
        }`)],
    }] })
    rezzer.scripts['z']!.start()
    rezzer.linkset.touch(1)
    rezzer.linkset.advanceTime(1_000)
    const first = world.linksets.find(l => l !== rezzer.linkset)!.allScripts()[0]!
    first.fire('link_message', { sender_num: 1, num: 0, str: '', id: '' })
    first.running = false
    rezzer.linkset.touch(1)
    rezzer.linkset.advanceTime(1_000)
    rezzer.scripts['z']!.setGlobal('child', '')
    rezzer.linkset.touch(1)
    rezzer.linkset.advanceTime(1_000)
    const again = world.linksets.find(l => l !== rezzer.linkset && !l.dead)!.allScripts()[0]!
    expect(again.running).toBe(false)
    expect(startAndTouch(again)).toEqual(['default entry 1', 'default touch 2'])
  })

  it('comes back reset from a detach, worn again or rezzed', async () => {
    const f = await box()
    f.script.running = true
    f.linkset.attachToAvatar(OWNER, 1)
    f.linkset.advanceTime(100)
    f.script.running = false
    f.linkset.detachFromAvatar()
    const rezzed = rez(f, f.linkset.copy())
    f.linkset.attachToAvatar(OWNER, 1)
    expect(f.script.running).toBe(false)
    expect(startAndTouch(f.script)).toEqual(['default entry 1', 'default touch 2'])
    expect(startAndTouch(rezzed)).toEqual(['default entry 1', 'default touch 2'])
  })

  it('does not finish a sleep it was stopped in', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
    const napper = 'list log; default { state_entry() { log += "entry"; } link_message(integer s, integer i, string m, key k) { log += "nap"; llSleep(20.0); log += "woke"; } }'
    const made = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [script('n', napper)] }] })
    const s = made.scripts['n']!
    s.start()
    world.clock.schedule(s, world.clock.now, 'link_message', { sender_num: 1, num: 0, str: '', id: '' })
    made.linkset.advanceTime(2_000)
    s.running = false
    const saved = made.linkset.copy()
    made.linkset.remove()
    const copy = rez({ world, avatar }, saved)
    copy.running = true
    copy.linkset.advanceTime(30_000)
    expect(copy.global('log')).toEqual(['entry'])
  })

  it('lets a detached SLua script use the default memory limit when worn again', async () => {
    const source = [
      'if ll.LinksetDataRead("grow") == "1" then big = string.rep("x", 60000) end',
      'LLEvents:on("touch_start", function() llcompat.SetMemoryLimit(40000) ll.LinksetDataWrite("grow", "1") end)',
    ].join('\n')
    const made = await loadLinkset({ owner: OWNER, prims: [{ scripts: [{ name: 'm', source: { source, filename: 'm.luau' }, memoryLimit: true }] }] })
    const s = made.scripts['m']!
    s.start()
    s.fire('touch_start', { num_detected: 1 })
    expect(s.state.memory.limit).toBe(40000)
    s.running = false
    made.linkset.attachToAvatar(OWNER, 1)
    made.linkset.detachFromAvatar()
    made.linkset.attachToAvatar(OWNER, 1)
    s.running = true
    made.linkset.advanceTime(100)
    expect(s.crashed).toBe(false)
    expect(s.state.memory.limit).toBe(131072)
    expect((s.global('big') as string).length).toBe(60000)
  })

  it('brings an SLua script back at the default memory limit', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
    const source = 'LLEvents:on("touch_start", function() llcompat.SetMemoryLimit(40000) end)'
    const made = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'm', source: { source, filename: 'm.luau' } }] }] })
    const s = made.scripts['m']!
    s.start()
    s.fire('touch_start', { num_detected: 1 })
    expect(s.state.memory.limit).toBe(40000)
    s.running = false
    const copy = rez({ world, avatar }, made.linkset.copy())
    expect(copy.state.memory.limit).toBe(131072)
  })
})

// In-world, third session: a physical box whose script called llMoveToTarget (1 m up),
// llRotLookAt (90 degrees about Z) or llLookAt hovered or turned to its target, and kept holding
// it after the script was set not running. Later sessions (#573) saw the box drop within about
// 2 s of the stop in 11 of 13 tries; see target-of-a-stopped-script.test.ts. Taken and rezzed, or taken as a copy and the copy
// rezzed, each copy dropped to the platform and kept the rotation it was rezzed with, before
// and after its script was started. With the script running, a Take Copy's copy and a taken
// box both went to the original's target. The box left behind by a Take Copy of a stopped
// script went slack, and returned to its target once its script was started.
describe('a move or look target of a stopped script through inventory', () => {
  const mover = `default {
    touch_start(integer t) {
      llSetStatus(STATUS_PHYSICS, TRUE);
      llMoveToTarget(llGetPos() + <0.0, 0.0, 1.0>, 0.3);
      llRotLookAt(llEuler2Rot(<0.0, 0.0, PI_BY_TWO>), 0.5, 0.3);
    }
  }`
  async function moving(running: boolean) {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
    const made = await loadLinkset({ world, region: 'home', owner: OWNER, position: { x: 120, y: 51, z: 20 }, prims: [{ scripts: [script('m', mover)] }] })
    const s = made.scripts['m']!
    s.start()
    s.fire('touch_start', { num_detected: 1 })
    made.linkset.advanceTime(3_000)
    s.running = running
    return { world, avatar, linkset: made.linkset, script: s }
  }
  const held = (linkset: Linkset) => linkset.prims[0]!.targetMotion

  it.each([
    ['a take', (f: Awaited<ReturnType<typeof moving>>) => { const saved = f.linkset.copy(); f.linkset.remove(); return rez(f, saved) }],
    ['a Take Copy', (f: Awaited<ReturnType<typeof moving>>) => rez(f, f.linkset.copy())],
  ])('is gone from the copy after %s, before and after the start', async (_, copyOf) => {
    const f = await moving(false)
    expect(held(f.linkset).move).not.toBeNull()
    const copy = copyOf(f)
    expect(held(copy.linkset)).toEqual({ move: null, look: null })
    copy.running = true
    copy.linkset.advanceTime(3_000)
    expect(held(copy.linkset)).toEqual({ move: null, look: null })
  })

  // In-world (#556): the box left behind by a Take Copy of a stopped script went slack, and
  // went back to its target once its script was started.
  it('lets go of the original of a Take Copy until its script starts', async () => {
    const f = await moving(false)
    rez(f, f.linkset.copy())
    const root = f.linkset.prims[0]!.params
    const target = { ...held(f.linkset).move!.target }
    root.position = { ...target, z: target.z - 1 }
    root.rotation = { x: 0, y: 0, z: 0, s: 1 }
    f.linkset.advanceTime(3_000)
    expect(root.position.z).toBeCloseTo(target.z - 1, 5)
    expect(root.rotation).toEqual({ x: 0, y: 0, z: 0, s: 1 })
    f.script.running = true
    f.linkset.advanceTime(3_000)
    expect(root.position.z).toBeCloseTo(target.z, 2)
    expect(root.rotation.z).toBeCloseTo(Math.SQRT1_2, 2)
  })

  it('goes back to the original of a shift-drag copy once its script starts', async () => {
    const f = await moving(false)
    f.linkset.duplicate()
    const root = f.linkset.prims[0]!.params
    const target = { ...held(f.linkset).move!.target }
    root.position = { ...target, z: target.z - 1 }
    f.script.running = true
    f.linkset.advanceTime(3_000)
    expect(root.position.z).toBeCloseTo(target.z, 2)
  })

  it('stays with the original of a Take Copy', async () => {
    const f = await moving(false)
    rez(f, f.linkset.copy())
    f.script.running = true
    expect(held(f.linkset).move).not.toBeNull()
    expect(held(f.linkset).look).not.toBeNull()
  })

  it('goes with the copy when the script is running', async () => {
    const f = await moving(true)
    const copy = rez(f, f.linkset.copy())
    expect(held(copy.linkset).move).not.toBeNull()
    expect(held(copy.linkset).look).not.toBeNull()
  })
})

describe('owner drops one after another', () => {
  // In-world: a notecard dropped twice into a prim with a logging script, the drops 0 to 2.5 s
  // apart over thirteen pairs -> one changed(1) per drop every time, each counting its own item;
  // a pair that reached the region together gave one changed(1) counting both items.
  it.each([300, 700, 1_000, 2_500])('raise one changed per drop %i ms apart', async (gap) => {
    const made = await loadLinkset({ prims: [{ scripts: [script('log', logger)] }] })
    const s = made.scripts['log']!
    s.start()
    made.prims[0]!.addInventory(notecard('a'))
    made.linkset.advanceTime(gap)
    made.prims[0]!.addInventory(notecard('b'))
    made.linkset.advanceTime(100)
    expect(s.global('seen')).toEqual([1, 1])
    expect(s.global('counts')).toEqual([2, 3])
  })
})

// In-world (Aditi, SLua Tideland, 2026-11-24): a four-prim object. The root held a giving script
// with a changed handler and an idle logging script; C1's script had no changed handler, C2 held
// a giving script, C3 had no script. Each giving script gave notecards or recoloured a child on a
// chat command.
describe('changes to a child whose scripts do not handle changed', () => {
  const giver = `list seen; default {
      link_message(integer s, integer n, string m, key k) { BODY }
      changed(integer c) { seen += c; }
    }`
  async function fallback(from: 'R' | 'C2', body: string) {
    const made = await loadLinkset({ owner: OWNER, prims: [
      { name: 'R', inventory: [notecard('nc'), notecard('nc2')], scripts: [script('give', giver.replace('BODY', from === 'R' ? body : '')), script('log', logger)] },
      { name: 'C1', scripts: [script('quiet', silent)] },
      { name: 'C2', inventory: [notecard('nc'), notecard('nc2')], scripts: [script('cgive', giver.replace('BODY', from === 'C2' ? body : ''))] },
      { name: 'C3' },
    ] })
    made.linkset.startAll()
    made.linkset.advanceTime(1000)
    made.scripts[from === 'R' ? 'give' : 'cgive']!.fire('link_message', { sender_num: 1, num: 0, str: '', id: '' })
    for (let i = 0; i < 20; i++) made.linkset.advanceTime(100)
    return { give: made.scripts['give']!.global('seen'), log: made.scripts['log']!.global('seen'), child: made.scripts['cgive']!.global('seen') }
  }

  // In-world: two gifts into C1 from the root's giver -> the giver and the idle logger each said
  // one changed(1) in 3 of 4 runs (the batch's first run gave two each). From C2's giver -> one
  // changed(1) in the root's scripts, 4 of 4. Into C3, from the root or C2 -> one, 3 of 3.
  it.each([
    ['the root', 'R', 'C1'], ['another child', 'C2', 'C1'], ['the root', 'R', 'C3'], ['another child', 'C2', 'C3'],
  ] as const)('gives the root\'s scripts one changed for two gifts from %s into %s', async (_from, from, to) => {
    const { give, log } = await fallback(from, `llGiveInventory(llGetLinkKey(${to.slice(1) === '1' ? 2 : 4}), "nc"); llGiveInventory(llGetLinkKey(${to.slice(1) === '1' ? 2 : 4}), "nc2");`)
    expect(log).toEqual([1])
    expect(give).toEqual([1])
  })

  // In-world: llSetLinkColor, llSetLinkAlpha or a PRIM_TYPE change on C1 or C3 -> the root's
  // scripts said changed(2), changed(2) and changed(4) (8 runs). A second object, whose child's
  // script had no changed handler: llSetLinkMedia on the child -> changed(2048) in the root's
  // scripts (2 runs), llSetLinkRenderMaterial -> changed(4096) (2 runs).
  it.each([
    ['colour', 'llSetLinkColor(L, <1.0, 0.0, 0.0>, ALL_SIDES);', 2],
    ['alpha', 'llSetLinkAlpha(L, 0.5, ALL_SIDES);', 2],
    ['shape', 'llSetLinkPrimitiveParamsFast(L, [PRIM_TYPE, PRIM_TYPE_BOX, PRIM_HOLE_DEFAULT, <0.0, 1.0, 0.0>, 0.3, ZERO_VECTOR, <1.0, 1.0, 0.0>, ZERO_VECTOR]);', 4],
    ['media', 'llSetLinkMedia(L, 0, [PRIM_MEDIA_HOME_URL, "http://example.com/"]);', 2048],
    ['render material', `llSetLinkRenderMaterial(L, "${MATERIAL}", ALL_SIDES);`, 4096],
  ] as const)('reaches the root\'s scripts for a change of %s', async (_kind, call, bit) => {
    for (const link of [2, 4]) {
      const { give, log } = await fallback('R', call.replace('(L,', `(${link},`))
      expect(log).toEqual([bit])
      expect(give).toEqual([bit])
    }
  })

  // In-world: llScaleByFactor in the second object -> one changed(8) in each root script and in
  // the child script that handles changed (4 runs).
  it('gives the root\'s scripts one changed for a scale of the whole object', async () => {
    const { give, log, child } = await fallback('R', 'llScaleByFactor(1.1);')
    expect(log).toEqual([8])
    expect(give).toEqual([8])
    expect(child).toEqual([8])
  })

  // In-world: llSetLinkColor on C1 or C3 then a gift into it -> one changed(3) in the root's
  // scripts in 8 of 9 runs; a gift, a recolour and a second gift -> one changed(3), 2 of 2. A gift
  // then the recolour gave one changed(3) in 2 runs and changed(1) then changed(2) in 3, so that
  // order is not pinned.
  it.each([
    ['a recolour then a gift', 'llSetLinkColor(2, <1.0, 0.0, 0.0>, ALL_SIDES); llGiveInventory(llGetLinkKey(2), "nc");'],
    ['a gift, a recolour and a gift', 'llGiveInventory(llGetLinkKey(2), "nc"); llSetLinkColor(2, <1.0, 0.0, 0.0>, ALL_SIDES); llGiveInventory(llGetLinkKey(2), "nc2");'],
  ])('gives the root\'s scripts one changed for %s', async (_order, body) => {
    const { give, log } = await fallback('R', body)
    expect(log).toEqual([3])
    expect(give).toEqual([3])
  })
})
