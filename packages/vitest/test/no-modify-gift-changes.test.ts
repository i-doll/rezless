import { describe, expect, it } from 'vitest'
import { loadLinkset, makeInventoryItem, InventoryType, PERM_ALL, PERM_MODIFY, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlGiveInventory
// https://wiki.secondlife.com/wiki/LlAllowInventoryDrop
// https://wiki.secondlife.com/wiki/Changed
//
// In-world (Aditi, SLua Tideland, 2026-11-24, Firestorm RLVa): a three-prim object made by one
// avatar with next-owner no-modify, given to the other and rezzed by it. The root held a giving
// script with a changed handler, an idle logging script and two notecards; C1's script logged
// changed and allowed inventory drops; C3's script allowed drops and had no changed handler. The
// giving script gave notecards and recoloured a child on a chat command.
const OWNER = '00000000-0000-0000-0000-00000000000a'
const DEBUG = 2147483647
const NO_MODIFY = PERM_ALL & ~PERM_MODIFY
const notecard = (name: string) => makeInventoryItem({ name, type: InventoryType.NOTECARD, notecardLines: ['x'] })
const logger = 'list seen; default { changed(integer c) { seen += c; } }'
const giver = `list seen; default {
    link_message(integer s, integer n, string m, key k) { BODY }
    changed(integer c) { seen += c; }
  }`

async function noModify(body: string, rootDrop = false, world?: World, setupOnly = false) {
  const made = await loadLinkset({ ...(world && { world, region: 'home' }), owner: OWNER, prims: [
    { name: 'R', inventory: [notecard('nc'), notecard('nc2')], scripts: [{ name: 'give', source: { source: giver.replace('BODY', body) } }, { name: 'log', source: { source: logger } }] },
    { name: 'C1', scripts: [{ name: 'c1', source: { source: logger } }] },
    { name: 'C3', scripts: [{ name: 'quiet', source: { source: 'default { state_entry() { } }' } }] },
  ] })
  for (const prim of made.prims) {
    prim.permMask = { base: NO_MODIFY, owner: NO_MODIFY, group: 0, everyone: 0, next: NO_MODIFY }
    prim.allowInventoryDrop = prim.linkNumber !== 1 || rootDrop
  }
  made.linkset.startAll()
  const seen = (name: string) => made.scripts[name]!.global('seen')
  if (setupOnly) return { seen, made, errors: [] }
  made.linkset.advanceTime(1000)
  made.scripts['give']!.fire('link_message', { sender_num: 1, num: 0, str: '', id: '' })
  for (let i = 0; i < 20; i++) made.linkset.advanceTime(100)
  return { seen, made, errors: made.scripts['give']!.chat.filter((c) => c.channel === DEBUG).map((c) => c.text) }
}

const C1 = 'llGetLinkKey(2)'
const C3 = 'llGetLinkKey(3)'
const recolour = (link: number) => `llSetLinkColor(${link}, <1.0, 0.0, 0.0>, ALL_SIDES);`

describe('gifts inside an object its owner cannot modify', () => {
  // In-world: two notecards given to C1 in one handler -> one changed(64), C1 counting both
  // (3 of 3). Given to C3 -> the root's giver and logger each said one changed(64) (2 of 2).
  it('raise one CHANGED_ALLOWED_DROP for two gifts into a child', async () => {
    const { seen, made } = await noModify(`llGiveInventory(${C1}, "nc"); llGiveInventory(${C1}, "nc2");`)
    expect(seen('c1')).toEqual([64])
    expect(made.prims[1]!.inventory.map((i) => i.name).sort()).toEqual(['c1', 'nc', 'nc2'])
  })

  it('raise one CHANGED_ALLOWED_DROP in the root\'s scripts for two gifts into a child with no changed handler', async () => {
    const { seen } = await noModify(`llGiveInventory(${C3}, "nc"); llGiveInventory(${C3}, "nc2");`)
    expect(seen('give')).toEqual([64])
    expect(seen('log')).toEqual([64])
  })

  // In-world: llSetLinkColor on C1 then a gift into it -> one changed(66) (2 of 2); the same on C3
  // -> one changed(66) in the root's scripts (1 run).
  it('merge into a recolour made before them', async () => {
    const { seen } = await noModify(`${recolour(2)} llGiveInventory(${C1}, "nc");`)
    expect(seen('c1')).toEqual([66])
    const root = await noModify(`${recolour(3)} llGiveInventory(${C3}, "nc");`)
    expect(root.seen('give')).toEqual([66])
    expect(root.seen('log')).toEqual([66])
  })

  // In-world: a gift into C1 then llSetLinkColor on it -> changed(64), then changed(2) (2 of 2).
  it('do not merge with a recolour made after them', async () => {
    const { seen } = await noModify(`llGiveInventory(${C1}, "nc"); ${recolour(2)}`)
    expect(seen('c1')).toEqual([64, 2])
  })

  // In-world: a gift into the root, with drops off -> "Unable to give inventory: 'Blocked by
  // permissions'."; after llAllowInventoryDrop(TRUE) -> changed(64) in the root's scripts and the
  // root's item count unchanged (2 runs).
  it('need the root to allow drops for a gift into the root, and add no item there', async () => {
    const blocked = await noModify('llGiveInventory(llGetKey(), "nc");')
    expect(blocked.errors).toEqual(["Unable to give inventory: 'Blocked by permissions'."])
    expect(blocked.seen('log')).toEqual([])
    const allowed = await noModify('llGiveInventory(llGetKey(), "nc");', true)
    expect(allowed.errors).toEqual([])
    expect(allowed.seen('log')).toEqual([64])
    expect(allowed.seen('give')).toEqual([64])
    expect(allowed.made.prims[0]!.inventory.map((i) => i.name).sort()).toEqual(['give', 'log', 'nc', 'nc2'])
  })
})

// In-world (Aditi, SLua Tideland, 2026-11-24, Firestorm RLVa): the same kind of no-modify object, with
// an LSL and an SLua logger in the root, an LSL logger in C1 and an SLua one in C2, each allowing
// drops, and C3 allowing drops with no changed handler. One or two other objects of the same owner
// gave a notecard into a child on the same chat line as the root's giving script, LSL or SLua, so
// the gifts landed within a millisecond of each other. Each script reported changed and each giver
// its gift with llGetTimestamp, which showed whether a script ran a change between the gifts.
describe('gifts from other objects in the same frame as one from inside the linkset', () => {
  const sluaLogger = 'seen = {}; LLEvents:on("changed", function(c) table.insert(seen, c) end)'

  /** Give into link `target` in the order of `steps`: 'in' from the root's script, 'out' from another object each. */
  async function sameFrame(target: number, steps: Array<'in' | 'out'>, before = '') {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const made = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [
      { name: 'R', inventory: [notecard('nc')], scripts: [
        { name: 'give', source: { source: giver.replace('BODY', `${before} llGiveInventory(llGetLinkKey(${target}), "nc");`) } },
        { name: 'log', source: { source: logger } },
        { name: 'slog', language: 'slua', source: { source: sluaLogger } },
      ] },
      { name: 'C1', scripts: [{ name: 'c1', source: { source: logger } }] },
      { name: 'C2', scripts: [{ name: 'c2', language: 'slua', source: { source: sluaLogger } }] },
      { name: 'C3', scripts: [{ name: 'quiet', source: { source: 'default { state_entry() { } }' } }] },
    ] })
    for (const prim of made.prims) {
      prim.permMask = { base: NO_MODIFY, owner: NO_MODIFY, group: 0, everyone: 0, next: NO_MODIFY }
      prim.allowInventoryDrop = prim.linkNumber !== 1
    }
    made.linkset.startAll()
    const givers = await Promise.all(steps.map(async (step) => {
      if (step === 'in') return made.scripts['give']!
      const outside = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ inventory: [notecard('gift')], scripts: [
        { name: 'out', source: { source: `default { link_message(integer s, integer n, string m, key k) { llGiveInventory("${made.prims[target - 1]!.key}", "gift"); } }` } },
      ] }] })
      outside.linkset.startAll()
      return outside.scripts['out']!
    }))
    made.linkset.advanceTime(1000)
    const message = { sender_num: 1, num: 0, str: '', id: '' }
    for (const script of givers) world.clock.schedule(script, world.clock.now, 'link_message', message)
    for (let i = 0; i < 20; i++) made.linkset.advanceTime(100)
    return { seen: (name: string) => made.scripts[name]!.global('seen'), items: (link: number) => made.prims[link - 1]!.inventory.length }
  }

  // In-world: C1's script got one changed(64) counting both notecards when the root's SLua script
  // gave first (5 of 5) and when another object gave first, then the root, then a second object (3
  // of 3). C2's got one in 3 of 5 runs with the root first. Where the receiving script ran the first
  // change before the next gift landed, it got a second: C1 and C2 with the other object first and
  // the LSL giver (10 of 10), C2 with the root first (2 of 5).
  it('raise one change in the receiving prim, in either order', async () => {
    const inFirst = await sameFrame(2, ['in', 'out'])
    expect(inFirst.seen('c1')).toEqual([64])
    expect(inFirst.items(2)).toBe(3)
    expect((await sameFrame(3, ['in', 'out'])).seen('c2')).toEqual([64])
    expect((await sameFrame(2, ['out', 'in'])).seen('c1')).toEqual([64])
    expect((await sameFrame(2, ['out', 'in', 'out'])).seen('c1')).toEqual([64])
  })

  // In-world: another object gave into C1, then the root's SLua script recoloured C1 and gave into it
  // -> one changed(66) (3 of 3). With the LSL script, C1's script ran the other object's change
  // first, then got changed(66) (3 of 3).
  it('merge a recolour and a gift from inside into a gift from another object', async () => {
    expect((await sameFrame(2, ['out', 'in'], recolour(2))).seen('c1')).toEqual([66])
  })

  // In-world: two other objects gave into C1 -> one changed(64) where C1's script had not run the
  // first change yet (3 of 3), two where it had (3 of 3). Into C3 -> one in the root's idle SLua
  // logger (6 of 6).
  it('raise one change for two gifts from other objects', async () => {
    expect((await sameFrame(2, ['out', 'out'])).seen('c1')).toEqual([64])
    expect((await sameFrame(4, ['out', 'out'])).seen('slog')).toEqual([64])
  })

  // In-world: into C3, the root's idle LSL and SLua loggers each got one changed(64) in 10 of 10
  // runs, in either order. The root's giving script got two when the other object gave first (9 of
  // 9, LSL and SLua) and one when it gave first itself (7 of 7).
  it('raise one change in the root for a child with no changed handler, two in a giver the other object beat', async () => {
    const outsideFirst = await sameFrame(4, ['out', 'in'])
    expect(outsideFirst.seen('log')).toEqual([64])
    expect(outsideFirst.seen('slog')).toEqual([64])
    expect(outsideFirst.seen('give')).toEqual([64, 64])
    const insideFirst = await sameFrame(4, ['in', 'out'])
    expect(insideFirst.seen('log')).toEqual([64])
    expect(insideFirst.seen('slog')).toEqual([64])
    expect(insideFirst.seen('give')).toEqual([64])
  })
})

// In-world (Aditi, SLua Tideland, 2026-11-24, Firestorm RLVa): the same kind of no-modify object as
// above, with one or two other objects of the same owner giving notecards on a chat line. C1's LSL
// script and C2's SLua script could also sleep or spin in a loop on llGetTime on that line. Each
// script reported its gifts and events with llGetTimestamp; the simulator ran a frame every 22 ms.
describe('gifts into an object its owner cannot modify, frames apart or at a waiting script', () => {
  const rc = (link: number) => `llSetLinkColor(${link}, <1.0, 0.0, 0.0>, ALL_SIDES);`
  // Another object gives with `gift(link)`; llOwnerSay stands in for a loop on llGetTime that keeps
  // the handler busy for that many ms.
  const gift = (link: number) => `llGiveInventory(LINK${link}, "gift");`
  const spin = (ms: number) => `llOwnerSay("${ms}");`
  const handler = (body: string) => `list seen; default {
    link_message(integer s, integer n, string m, key k) { ${body} }
    changed(integer c) { seen += c; }
  }`

  /**
   * On one link message, run each of `root` in its own script in the root, `c1` in C1's script, `c2`
   * in C2's and each of `outside` in another object; the other objects' handlers first, unless `rootFirst`.
   */
  async function run({ root = [], c1 = '', c2 = '', outside = [], rootFirst = false }: { root?: string[]; c1?: string; c2?: string; outside?: string[]; rootFirst?: boolean }) {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const made = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [
      { name: 'R', inventory: [notecard('nc'), notecard('nc2')], scripts: [
        ...root.map((body, i) => ({ name: `give${i}`, source: { source: handler(body) } })),
        { name: 'log', source: { source: logger } },
      ] },
      { name: 'C1', scripts: [{ name: 'c1', source: { source: handler(c1) } }] },
      { name: 'C2', scripts: [{ name: 'c2', language: 'slua' as const, source: { source: `seen = {}
        LLEvents:on("link_message", function() ${c2} end)
        LLEvents:on("changed", function(c) table.insert(seen, c) end)` } }] },
      { name: 'C3', scripts: [{ name: 'quiet', source: { source: 'default { state_entry() { } }' } }] },
    ] })
    for (const prim of made.prims) {
      prim.permMask = { base: NO_MODIFY, owner: NO_MODIFY, group: 0, everyone: 0, next: NO_MODIFY }
      prim.allowInventoryDrop = prim.linkNumber !== 1
    }
    made.linkset.startAll()
    const others = await Promise.all(outside.map(async (body) => {
      const source = handler(body.replace(/LINK(\d)/g, (_, link: string) => `"${made.prims[Number(link) - 1]!.key}"`))
      const other = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ inventory: [notecard('gift')], scripts: [{ name: 'out', source: { source } }] }] })
      other.linkset.startAll()
      return other.scripts['out']!
    }))
    const givers = root.map((_, i) => made.scripts[`give${i}`]!)
    const scripts = [made.scripts['c1']!, made.scripts['c2']!, ...(rootFirst ? [...givers, ...others] : [...others, ...givers])]
    for (const script of scripts) script.mock('llOwnerSay', (ctx, args) => { ctx.busy(Number(args[0])); return undefined })
    made.linkset.advanceTime(1000)
    for (const script of scripts) world.clock.schedule(script, world.clock.now, 'link_message', { sender_num: 1, num: 0, str: '', id: '' })
    for (let i = 0; i < 40; i++) made.linkset.advanceTime(100)
    return (name: string) => made.scripts[name]!.global('seen')
  }

  // In-world: another object gave into C1 twice with a spin of 5, 10, 20, 40 or 100 ms between the
  // gifts, or llSleep(0.05) -> two changed(64) (23 of 23), also where C1's script had run neither when
  // the second gift landed: the gifts landed a frame or more apart. Spins on llGetTimestamp of 0 to 15
  // ms gave the same (20 of 20): the giver always went on in the next frame, so no shorter gap could be
  // made. The root's SLua script giving into C1 twice with a spin of 5 to 40 ms (12 of 12), the LSL
  // one with 10 or 40 ms (6 of 6), and the root's gift then another object's 10 to 40 ms later (9 of
  // 9) gave two as well. rezless keeps gifts apart that land any time apart; the gaps here are a frame or more.
  it('raise a change for each frame a gift lands in', async () => {
    for (const between of [spin(25), spin(45), spin(100), 'llSleep(0.05);']) {
      expect((await run({ outside: [`${gift(2)} ${between} ${gift(2)}`] }))('c1')).toEqual([64, 64])
    }
    expect((await run({ root: [`llGiveInventory(llGetLinkKey(2), "nc"); ${spin(25)} llGiveInventory(llGetLinkKey(2), "nc2");`] }))('c1')).toEqual([64, 64])
    expect((await run({ root: ['llGiveInventory(llGetLinkKey(2), "nc");'], outside: [`${spin(25)} ${gift(2)}`] }))('c1')).toEqual([64, 64])
  })

  // In-world: C1's script slept 1.5 s while the root's script recoloured C1 and another object gave
  // into it, 0.2 s apart in either order -> one changed(66) when it woke (4 of 4 each); C2's SLua
  // script the same (3 of 3). Two other objects' gifts -> one changed(64) (3 of 3); another object's
  // gift, then the root's -> one changed(64) (3 of 3).
  it('merge into one change at a sleeping script', async () => {
    const asleep = { c1: 'llSleep(1.5);' }
    expect((await run({ ...asleep, root: [`llSleep(0.2); ${rc(2)}`], outside: [`llSleep(0.4); ${gift(2)}`] }))('c1')).toEqual([66])
    expect((await run({ ...asleep, root: [`llSleep(0.4); ${rc(2)}`], outside: [`llSleep(0.2); ${gift(2)}`] }))('c1')).toEqual([66])
    expect((await run({ c2: 'll.Sleep(1.5)', root: [`llSleep(0.2); ${rc(3)}`], outside: [`llSleep(0.4); ${gift(3)}`] }))('c2')).toEqual([66])
    expect((await run({ ...asleep, outside: [`llSleep(0.2); ${gift(2)}`, `llSleep(0.4); ${gift(2)}`] }))('c1')).toEqual([64])
    expect((await run({ ...asleep, root: ['llSleep(0.4); llGiveInventory(llGetLinkKey(2), "nc");'], outside: [`llSleep(0.2); ${gift(2)}`] }))('c1')).toEqual([64])
  })

  // In-world: C1's script spun 1.5 s in a loop on llGetTime instead -> a recolour then another object's
  // gift gave changed(2), then changed(64) (4 of 4); the gift then the recolour gave changed(64), then
  // changed(2) (4 of 4); two other objects' gifts, or another object's gift then the root's, gave two
  // changed(64) (3 of 3 each).
  it('keep the first change apart at a busy script', async () => {
    const busy = { c1: spin(1500) }
    expect((await run({ ...busy, root: [`llSleep(0.2); ${rc(2)}`], outside: [`llSleep(0.4); ${gift(2)}`] }))('c1')).toEqual([2, 64])
    expect((await run({ ...busy, root: [`llSleep(0.4); ${rc(2)}`], outside: [`llSleep(0.2); ${gift(2)}`] }))('c1')).toEqual([64, 2])
    expect((await run({ ...busy, outside: [`llSleep(0.2); ${gift(2)}`, `llSleep(0.4); ${gift(2)}`] }))('c1')).toEqual([64, 64])
    expect((await run({ ...busy, root: ['llSleep(0.4); llGiveInventory(llGetLinkKey(2), "nc");'], outside: [`llSleep(0.2); ${gift(2)}`] }))('c1')).toEqual([64, 64])
  })

  // In-world: another object, the root's SLua script and the root's LSL script gave into C3 in one
  // frame -> each giving script got two changed(64) (4 of 4): the other object's drop waited for both
  // of them, and the second script's gift merged into one of the changes waiting for the first. The
  // root's idle LSL and SLua loggers each got two (4 of 4), as they ran the other object's change in
  // that frame before the root's scripts gave; rezless runs every handler of a frame before the
  // changes, so they get one, as with one giving script in the root above. rezless treats LSL and
  // SLua givers alike, so the test uses two LSL scripts.
  //
  // In-world: with one root script spinning 20 or 60 ms before giving, so that the other object's
  // gift landed while it was busy or in the same frame, the giving script got two (34 of 34, LSL and
  // SLua). With both root scripts giving, after spins of 20 and 60 ms in either order, the one that
  // waited longer got two (20 of 20). The one that gave first got two in 17 of 20 runs, where the other
  // script's gift landed before its second change ran, and three in 3 (SLua), where it landed after.
  // Not followed: a script's second waiting change ran one frame (SLua) or two frames (LSL) after its
  // first; rezless runs them back to back, so there the first giver always gets three.
  it('merge a second inside script\'s gift into a giver\'s waiting change', async () => {
    const seen = await run({ root: ['llGiveInventory(llGetLinkKey(4), "nc");', 'llGiveInventory(llGetLinkKey(4), "nc2");'], outside: [gift(4)] })
    expect(seen('give0')).toEqual([64, 64])
    expect(seen('give1')).toEqual([64, 64])
    expect(seen('log')).toEqual([64])
    const busyGiver = await run({ root: [`${spin(20)} llGiveInventory(llGetLinkKey(4), "nc");`], outside: [gift(4)], rootFirst: true })
    expect(busyGiver('give0')).toEqual([64, 64])
  })
})
