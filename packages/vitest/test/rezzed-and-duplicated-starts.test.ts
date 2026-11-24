import { describe, it, expect } from 'vitest'
import { loadLinkset, World, makeInventoryItem, InventoryType } from '../src/index.js'

// Measured on Aditi, SLua Tideland, 2026-11-24, with a two-prim object holding eight copies of
// one Mono script: six in the root, added in the order e, b, f, a, d, c, and two (x, g) in the
// child. Each script reported the time its first event ran and then sent
// llMessageLinked(LINK_SET, 0, name, ""); four seconds later it reported the names it had got in
// link_message, in order, marking any that ran before its own first event.

const OWNER = '11111111-1111-1111-1111-111111111111'

// https://wiki.secondlife.com/wiki/On_rez
const REZZED = `string N; string got; integer rezzed;
default {
  state_entry() { N = llGetScriptName(); }
  on_rez(integer p) { rezzed = TRUE; llMessageLinked(LINK_SET, 0, N, ""); llSetTimerEvent(4.0); }
  link_message(integer s, integer n, string m, key id) { if (!rezzed) got += "!"; got += m; }
  timer() { llSetTimerEvent(0); llOwnerSay(N + " " + got); }
}`

// https://wiki.secondlife.com/wiki/State_entry
const FRESH = `string N; string got;
default {
  state_entry() { N = llGetScriptName(); llMessageLinked(LINK_SET, 0, N, ""); llSetTimerEvent(4.0); }
  link_message(integer s, integer n, string m, key id) { if (N == "") got += "!"; got += m; }
  timer() { llSetTimerEvent(0); llOwnerSay(N + " " + got); }
}`

const scripts = (source: string, names: string[]) => names.map(name => ({ name, source: { source, filename: `${name}.lsl` } }))

function reports(linkset: { allScripts(): ReadonlyArray<{ scriptName: string; chat: ReadonlyArray<{ text: string }> }> }) {
  return Object.fromEntries(linkset.allScripts().map(s => [s.scriptName, s.chat.map(c => c.text)]))
}

/** Each report with the names it got sorted, since Second Life runs the first events in a random order. */
function sorted(linkset: Parameters<typeof reports>[0]) {
  return Object.fromEntries(Object.entries(reports(linkset)).map(([name, lines]) =>
    [name, lines.map(line => { const [who, got = ''] = line.split(' '); return `${who} ${[...got].sort().join('')}` })]))
}

describe('a rezzed object', () => {
  it('runs every script\'s on_rez together, so each gets every link message sent from on_rez', async () => {
    // In-world: rezzed by hand four times and with llRezObject eight times, every copy ran all
    // eight on_rez handlers within a few milliseconds, in one frame, and every script got all
    // eight messages, in the order the on_rez handlers ran ("f x e b d c a g", "d b e g a c f x",
    // ...: a different order each time). No message ran before the receiver's own on_rez.
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const payload = await loadLinkset({ owner: OWNER, prims: [
      { scripts: scripts(REZZED, ['e', 'b', 'f', 'a', 'd', 'c']) },
      { scripts: scripts(REZZED, ['x', 'g']) },
    ] })
    payload.linkset.startAll()
    const item = Object.assign(makeInventoryItem({ name: 'payload', type: InventoryType.OBJECT }), { object: payload.linkset })
    const rezzer = await loadLinkset({ owner: OWNER, world, region: 'home', position: { x: 100, y: 100, z: 30 }, prims: [{
      inventory: [item],
      scripts: [{ name: 'rezzer', source: { source: `default { state_entry() {
        llRezObject("payload", llGetPos() + <0, 0, 1>, ZERO_VECTOR, ZERO_ROTATION, 1); } }` } }],
    }] })
    rezzer.scripts.rezzer!.start()
    const copy = world.linksets.at(-1)!
    copy.advanceTime(5000)
    const all = 'abcdefgx'
    expect(sorted(copy)).toEqual(Object.fromEntries([...'ebfadcxg'].map(n => [n, [`${n} ${all}`]])))
  })
})

describe('a duplicated object', () => {
  async function original() {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const { linkset } = await loadLinkset({ owner: OWNER, world, region: 'home', position: { x: 100, y: 100, z: 30 }, prims: [
      { scripts: scripts(FRESH, ['e', 'b', 'f', 'a', 'd', 'c']) },
      { scripts: scripts(FRESH, ['x', 'g']) },
    ] })
    linkset.startAll()
    linkset.advanceTime(5000)
    return linkset
  }

  it('starts every script of the copy together unless the test staggers them', async () => {
    const linkset = await original()
    const copy = linkset.duplicate()
    copy.advanceTime(5000)
    const all = 'abcdefgx'
    expect(sorted(copy)).toEqual(Object.fromEntries([...'ebfadcxg'].map(n => [n, [`${n} ${all}`]])))
  })

  it('leaves the copy\'s scripts unstarted with startScripts: false, so a test can stagger them', async () => {
    // In-world: the copies' scripts started over several frames, a script or a few at a time,
    // 22 to 65 ms apart, in an order that changed with every copy: (a) (c f d) (e) (b x) (g) in
    // one, (d c f a) (e x b) (g) in the next. Each script got the messages of the scripts that
    // started in its frame or later, none from earlier frames, and none before its own
    // state_entry.
    const linkset = await original()
    const copy = linkset.duplicate(undefined, { startScripts: false })
    copy.advanceTime(1000)
    expect(copy.allScripts().filter(s => s.hasStarted)).toEqual([])
    expect(copy.linkedMessages).toEqual([])
    const named = (names: string) => copy.allScripts().filter(s => names.includes(s.scriptName))
    copy.startAll(named('dcfa'))
    copy.advanceTime(88)
    copy.startAll(named('exb'))
    copy.advanceTime(85)
    copy.startAll()
    copy.advanceTime(5000)
    expect(sorted(copy)).toEqual({
      e: ['e begx'], b: ['b begx'], f: ['f abcdefgx'], a: ['a abcdefgx'],
      d: ['d abcdefgx'], c: ['c abcdefgx'], x: ['x begx'], g: ['g g'],
    })
  })
})
