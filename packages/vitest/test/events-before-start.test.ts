import { describe, it, expect } from 'vitest'
import { loadLinkset, World, seedRlvInventory } from '../src/index.js'

// Measured on Aditi, SLua Tideland, 2026-11-24, with a box holding 12 or 40 copies of one probe,
// each compiled on its own so that a copy's scripts start over several frames. The avatar stood
// on the box. Each script logged its state_entry (E), every linkset_data (L + the writer's name),
// collision_start (C) and touch_start (T), marking with "!" any that ran before its own
// state_entry, and wrote its own name to the linkset data store from state_entry. The box was
// duplicated in place, the avatar jumped onto the copy, and the copy was touched at once.
//
// In-world: in every copy, LSL (Mono) and SLua alike, a script got the linkset_data writes of
// the scripts that started in its frame or later and none from earlier frames, lost the
// collision_start of a landing that came before it started, and lost the touch raised before it
// started, even when the other scripts' touch_start handlers ran after it had started. No
// handler ever ran before state_entry.

const OWNER = '11111111-1111-1111-1111-111111111111'

// https://wiki.secondlife.com/wiki/Linkset_data, https://wiki.secondlife.com/wiki/Touch_start,
// https://wiki.secondlife.com/wiki/Collision_start
const LSL = `string N; string log;
string pre() { if (N == "") return "!"; return ""; }
default {
  state_entry() { N = llGetScriptName(); log += " E"; llLinksetDataWrite(N, llGetTimestamp()); }
  linkset_data(integer a, string n, string v) { log += " " + pre() + "L" + n; }
  collision_start(integer n) { log += " " + pre() + "C"; }
  touch_start(integer n) { log += " " + pre() + "T"; }
}`

const SLUA = `log = " E"
LLEvents:on("linkset_data", function(a, n, v) log ..= " L" .. n end)
LLEvents:on("collision_start", function(d) log ..= " C" end)
LLEvents:on("touch_start", function(d) log ..= " T" end)
ll.LinksetDataWrite(ll.GetScriptName(), ll.GetTimestamp())`

type Lang = 'LSL' | 'SLua'

async function copyOf(lang: Lang, names: string[]) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const source = lang === 'LSL' ? LSL : SLUA
  const ext = lang === 'LSL' ? 'lsl' : 'luau'
  const { linkset } = await loadLinkset({ owner: OWNER, world, region: 'home', position: { x: 100, y: 100, z: 30 }, prims: [
    { scripts: names.map(name => ({ name, source: { source, filename: `${name}.${ext}` } })) },
  ] })
  linkset.startAll()
  linkset.advanceTime(1000)
  const copy = linkset.duplicate(undefined, { startScripts: false })
  const named = (picked: string) => copy.allScripts().filter(s => picked.includes(s.scriptName))
  const logs = () => Object.fromEntries(copy.allScripts().map(s => [s.scriptName, String(s.global('log')).trim()]))
  return { copy, named, logs }
}

describe.each<Lang>(['LSL', 'SLua'])('a %s script that has not started yet', (lang) => {
  it('misses the linkset data written before it starts', async () => {
    // In-world: in a copy whose scripts started p05, then p07, then p09 and p10 together, p05 got
    // every write, p07 every write but p05's, and p09 and p10 got neither p05's nor p07's.
    const { copy, named, logs } = await copyOf(lang, ['a', 'b', 'c'])
    copy.startAll(named('a'))
    copy.advanceTime(22)
    copy.startAll(named('b'))
    copy.advanceTime(22)
    copy.startAll(named('c'))
    copy.advanceTime(100)
    expect(logs()).toEqual({ a: 'E La Lb Lc', b: 'E Lb Lc', c: 'E Lc' })
  })

  it('misses a touch raised before it starts', async () => {
    // In-world: in a 40-script copy touched while it was starting, the scripts that started
    // after the touch never got touch_start; those started before it got it after state_entry.
    const { copy, named, logs } = await copyOf(lang, ['a', 'b'])
    copy.startAll(named('a'))
    copy.advanceTime(22)
    copy.touch(0)
    copy.startAll()
    copy.advanceTime(100)
    expect(logs()).toEqual({ a: 'E La T Lb', b: 'E Lb' })
  })

  it('misses a collision raised before it starts', async () => {
    // In-world: the scripts of a copy that started after the avatar landed on it got no
    // collision_start for that landing, only for the next one.
    const { copy, named, logs } = await copyOf(lang, ['a', 'b'])
    copy.startAll(named('a'))
    copy.advanceTime(1000 / 45)
    for (const s of copy.allScripts()) s.fire('collision_start', { num_detected: 1 })
    copy.startAll()
    copy.advanceTime(100)
    for (const s of copy.allScripts()) s.fire('collision_start', { num_detected: 1 })
    expect(logs()).toEqual({ a: 'E La C Lb C', b: 'E Lb C' })
  })
})

describe('a copy\'s script waiting for startAll', () => {
  const LOG = `string log; default {
    state_entry() { log += " E"; }
    changed(integer c) { log += " C"; }
    touch_start(integer n) { log += " T"; }
    collision_start(integer n) { log += " K"; }
  }`

  async function held(other: string) {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const { linkset } = await loadLinkset({ owner: OWNER, world, region: 'home', position: { x: 100, y: 100, z: 30 }, prims: [{ scripts: [
      { name: 'a', source: { source: other, filename: 'a.lsl' } },
      { name: 'b', source: { source: LOG, filename: 'b.lsl' } },
    ] }] })
    linkset.startAll()
    linkset.advanceTime(1000)
    const copy = linkset.duplicate(undefined, { startScripts: false })
    const [a, b] = ['a', 'b'].map(name => copy.allScripts().find(s => s.scriptName === name)!)
    return { copy, a: a!, b: b! }
  }

  it('stays unstarted through a sibling\'s prim change, and misses it', async () => {
    const { copy, a, b } = await held('default { state_entry() { llSetColor(<1, 0, 0>, ALL_SIDES); } }')
    copy.startAll([a])
    copy.advanceTime(100)
    expect([b.hasStarted, b.global('log')]).toEqual([false, ''])
    copy.startAll([b])
    copy.advanceTime(100)
    expect(b.global('log')).toBe(' E')
  })

  it('loses a collision the region raises before it starts', async () => {
    const { copy, b } = await held('default { state_entry() { } }')
    copy.clock.schedule(b, copy.clock.now, 'collision_start', { num_detected: 1 })
    copy.startAll()
    copy.advanceTime(100)
    copy.clock.schedule(b, copy.clock.now, 'collision_start', { num_detected: 1 })
    copy.advanceTime(100)
    expect(b.global('log')).toBe(' E K')
  })

  it('takes events once wearing it from inventory starts it', async () => {
    const { copy, b } = await held('default { state_entry() { } }')
    copy.attachToAvatar(OWNER, 1)
    copy.detachFromAvatar()
    copy.attachToAvatar(OWNER, 1)
    copy.advanceTime(100)
    b.fire('touch_start', { num_detected: 1 })
    expect(b.global('log')).toContain('T')
  })
})

describe.each<Lang>(['LSL', 'SLua'])('a %s copy taken while its start is still queued', (lang) => {
  it('keeps the events queued behind the start', async () => {
    const source = lang === 'LSL'
      ? 'string log; default { state_entry() { log += "E"; } link_message(integer a, integer b, string c, key d) { log += " M"; } }'
      : 'log = "E"\nLLEvents:on("link_message", function(a, b, c, d) log ..= " M" end)'
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
    const made = await loadLinkset({ world, region: 'home', owner: OWNER, position: { x: 100, y: 100, z: 30 }, prims: [{ scripts: [
      { name: 'main', source: { source, filename: lang === 'LSL' ? 'main.lsl' : 'main.luau' } },
    ] }] })
    made.linkset.startAll()
    made.linkset.advanceTime(100)
    const dup = made.linkset.duplicate()
    world.clock.schedule(dup.allScripts()[0]!, world.clock.now, 'link_message', { sender_num: 1, num: 0, str: '', id: '' })
    const saved = dup.copy()
    dup.remove()
    seedRlvInventory(avatar, { sharedRootId: null, entries: [{ id: 'item', kind: 'item', parentId: null, name: 'probe', object: saved, assetType: 'object' }] })
    const rezzed = world.attemptAvatarRez(avatar, 'item', { x: 100, y: 100, z: 30 }).object!
    rezzed.advanceTime(100)
    expect(rezzed.allScripts()[0]!.global('log')).toBe('E M')
  })
})

describe('a loaded script the test has not started', () => {
  it('loses the events other scripts raise at it, and starts on the test\'s own touch or fire', async () => {
    const { linkset, scripts } = await loadLinkset({ owner: OWNER, prims: [{ scripts: [
      { name: 'a', source: { source: LSL, filename: 'a.lsl' } },
      { name: 'w', source: { source: 'default { touch_start(integer n) { llLinksetDataWrite("w", llGetTimestamp()); } }', filename: 'w.lsl' } },
    ] }] })
    scripts.w!.fire('touch_start', { num_detected: 1 })
    expect([scripts.a!.hasStarted, scripts.a!.global('log')]).toEqual([false, ''])
    linkset.touch(0)
    expect(String(scripts.a!.global('log')).trim()).toBe('E La T')
  })
})

describe('Script.start on a stopped script that has not started', () => {
  const STARTS = 'default { state_entry() { llOwnerSay("entry"); } }'

  it('waits for the script to be set running, as startAll does', async () => {
    // In-world: the copy of a stopped script was stopped too, and ran state_entry once it was
    // set running.
    const { linkset, scripts } = await loadLinkset({ owner: OWNER, prims: [{ scripts: [
      { name: 'a', source: { source: STARTS, filename: 'a.lsl' } },
      { name: 'b', source: { source: STARTS, filename: 'b.lsl' } },
    ] }] })
    scripts.a!.running = false
    scripts.b!.running = false
    scripts.a!.start()
    linkset.startAll([scripts.b!])
    linkset.advanceTime(100)
    expect([scripts.a!.chat.length, scripts.b!.chat.length]).toEqual([0, 0])
    scripts.a!.running = true
    scripts.b!.running = true
    linkset.advanceTime(100)
    expect([scripts.a!.chat.map(c => c.text), scripts.b!.chat.map(c => c.text)]).toEqual([['entry'], ['entry']])
  })
})
