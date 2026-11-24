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

  // Not measured: a gift from another object in the same frame. rezless keeps it a separate event,
  // as a gift from another object was measured to raise its own.
  it('keep a gift from another object apart', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const { made } = await noModify(`llGiveInventory(${C1}, "nc");`, false, world, true)
    const outside = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ inventory: [notecard('gift')], scripts: [
      { name: 'out', source: { source: `default { link_message(integer s, integer n, string m, key k) { llGiveInventory("${made.prims[1]!.key}", "gift"); } }` } },
    ] }] })
    outside.linkset.startAll()
    made.linkset.advanceTime(1000)
    const message = { sender_num: 1, num: 0, str: '', id: '' }
    world.clock.schedule(outside.scripts['out']!, world.clock.now, 'link_message', message)
    world.clock.schedule(made.scripts['give']!, world.clock.now, 'link_message', message)
    for (let i = 0; i < 20; i++) made.linkset.advanceTime(100)
    expect(made.scripts['c1']!.global('seen')).toEqual([64, 64])
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
