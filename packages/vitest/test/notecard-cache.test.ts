import { describe, it, expect } from 'vitest'
import { loadLinkset, World } from '../src/index.js'
import { NAK, InventoryType, makeInventoryItem } from '@rezless/vm'

// https://wiki.secondlife.com/wiki/LlGetNotecardLineSync: "If the notecard is not in the region's
// cache, NAK is returned". https://wiki.secondlife.com/wiki/LlFindNotecardTextSync returns [NAK] the same way.
// In-world probes for this file: Aditi, SLua Tideland, Mono and SLua, 2026-11-23 (the #522 probes). Each
// key and name went through llGetNotecardLineSync, llGetNumberOfNotecardLines, llGetNotecardLine 0, 1
// and 99, the sync read again, llFindNotecardTextCount and llFindNotecardTextSync, three seconds apart.

const NC_KEY = 'b55a2053-c6bc-5e6d-0193-553cdf8ae12e'
const GONE_KEY = '0b0b6c55-6f3e-4a51-a3f1-7c1a2e9f5d42'
const OWNER = '7d1f3a2b-9c4e-4f6a-8b2d-5e0c1a9f3b7d'
const DEBUG = 2147483647

const notecard = (name: string, key: string, notecardLines: ReadonlyArray<string>) =>
  makeInventoryItem({ name, type: InventoryType.NOTECARD, key, notecardLines })

async function run(body: string, inventory = [notecard('nc', NC_KEY, ['alpha', 'beta apple'])]) {
  const source = `
    show(string label, string k) {
      llSay(1, label + " " + llGetNotecardLineSync(k, 0) + " [" + llList2CSV(llFindNotecardTextSync(k, "a", 0, 0, [])) + "]");
    }
    default {
      state_entry() { ${body} }
      timer() { llSetTimerEvent(0); show("after", "nc"); show("after key", "${NC_KEY}"); }
    }`
  const { scripts } = await loadLinkset({
    owner: OWNER,
    prims: [{ inventory, scripts: [{ source: { source, filename: 'p.lsl' }, name: 'p' }] }],
  })
  const p = scripts['p']!
  p.start()
  p.advanceTime(5000)
  return p
}

const said = (p: { chat: ReadonlyArray<{ channel: number; text: string }> }, channel = 1) =>
  p.chat.filter((c) => c.channel === channel).map((c) => c.text)

describe('notecard sync reads before a dataserver read', () => {
  it('give NAK for a notecard in the prim, by name and by key, until a dataserver read caches it', async () => {
    // In-world: a notecard in the prim gave NAK from llGetNotecardLineSync and [NAK] from
    // llFindNotecardTextSync until the first dataserver read, then its lines; no error was said.
    const p = await run(`show("before", "nc"); show("before key", "${NC_KEY}"); llGetNumberOfNotecardLines("nc"); llSetTimerEvent(1);`)
    expect(said(p)).toEqual([
      `before ${NAK} [${NAK}]`,
      `before key ${NAK} [${NAK}]`,
      'after alpha [0, 0, 1, 0, 4, 1, 1, 3, 1, 1, 5, 1]',
      'after key alpha [0, 0, 1, 0, 4, 1, 1, 3, 1, 1, 5, 1]',
    ])
    expect(said(p, DEBUG)).toEqual([])
  })

  it.each([
    ['llGetNotecardLine by key', `llGetNotecardLine("${NC_KEY}", 5);`],
    ['llGetNumberOfNotecardLines by key', `llGetNumberOfNotecardLines("${NC_KEY}");`],
    ['llFindNotecardTextCount by name', `llFindNotecardTextCount("nc", "zzz", []);`],
  ])('cache the notecard for both name and key after %s', async (_, read) => {
    // In-world: any of llGetNotecardLine, llGetNumberOfNotecardLines and llFindNotecardTextCount, by
    // name or by key, cached the notecard for the sync reads.
    const p = await run(`${read} llSetTimerEvent(1);`)
    expect(said(p)).toEqual(['after alpha [0, 0, 1, 0, 4, 1, 1, 3, 1, 1, 5, 1]', 'after key alpha [0, 0, 1, 0, 4, 1, 1, 3, 1, 1, 5, 1]'])
  })
})

describe('a notecard asset after its item leaves the world', () => {
  const reader = `default {
    state_entry() { llSetTimerEvent(1); }
    timer() { llSetTimerEvent(0); llGetNotecardLine("${GONE_KEY}", 1); }
    dataserver(key q, string d) { llSay(1, d); }
  }`

  async function setup() {
    const world = new World()
    world.addRegion('Here', { x: 0, y: 0 })
    const other = await loadLinkset({ world, region: 'Here', owner: OWNER, prims: [{ inventory: [notecard('gone', GONE_KEY, ['gone a', 'second'])] }] })
    const { scripts } = await loadLinkset({ world, region: 'Here', owner: OWNER, prims: [{ scripts: [{ source: { source: reader, filename: 'p.lsl' }, name: 'p' }] }] })
    const p = scripts['p']!
    p.start()
    return { other, p }
  }

  it('stays readable by key after the owner deletes it from the object', async () => {
    // In-world: a notecard removed from the prim with llRemoveInventory still read by its key ("gone a",
    // "second"); the asset outlives the item however the item goes.
    const { other, p } = await setup()
    other.linkset.prims[0]!.removeInventory('gone')
    p.advanceTime(3000)
    expect(said(p)).toEqual(['second'])
  })

  it('stays readable by key after the object holding it is gone', async () => {
    // In-world: a notecard read by key gave the same lines whether another object held it or a script
    // had removed it with llRemoveInventory; the asset doesn't depend on any item holding it.
    const { other, p } = await setup()
    other.linkset.remove()
    p.advanceTime(3000)
    expect(said(p)).toEqual(['second'])
  })

  it('stays readable by key when the object deletes itself with llDie', async () => {
    const world = new World()
    world.addRegion('Here', { x: 0, y: 0 })
    await loadLinkset({
      world, region: 'Here', owner: OWNER,
      prims: [{
        inventory: [notecard('gone', GONE_KEY, ['gone a', 'second'])],
        scripts: [{ name: 'd', source: { filename: 'd.lsl', source: 'default { state_entry() { llDie(); } }' } }],
      }],
    }).then(({ scripts }) => scripts['d']!.start())
    const { scripts } = await loadLinkset({ world, region: 'Here', owner: OWNER, prims: [{ scripts: [{ source: { source: reader, filename: 'p.lsl' }, name: 'p' }] }] })
    const p = scripts['p']!
    p.start()
    p.advanceTime(3000)
    expect(said(p)).toEqual(['second'])
    expect(said(p, DEBUG)).toEqual([])
  })
})
