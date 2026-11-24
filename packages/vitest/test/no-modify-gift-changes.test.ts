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
