import { describe, it, expect } from 'vitest'
import { loadLinkset, World } from '../src/index.js'
import { NAK, InventoryType, makeInventoryItem } from '@rezless/vm'

// https://wiki.secondlife.com/wiki/LlGetNotecardLineSync: "If the notecard is not in the region's
// cache, NAK is returned". https://wiki.secondlife.com/wiki/LlFindNotecardTextSync returns [NAK] the same way.
// In-world probes for this file: Aditi, SLua Tideland, Mono and SLua, 2026-11-23 (the #522 probes). Each
// key and name went through llGetNotecardLineSync, llGetNumberOfNotecardLines, llGetNotecardLine 0, 1
// and 99, the sync read again, llFindNotecardTextCount and llFindNotecardTextSync, three seconds apart.
// The old-key probes: Aditi, SLua Tideland, Mono, 2026-11-23. Holders each held two notecards
// of distinct text, one read by key from a separate reader prim beforehand and one never read. Then one
// holder called llDie, the owner deleted both notecards from another through the object's contents,
// wore a third and had it detach itself to inventory, and saved new text over both notecards in a fourth.
// The reader then gave each old key to llGetNotecardLineSync, llGetNotecardLine and
// llGetNumberOfNotecardLines.

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

  it.each([
    ['llGetNotecardLine by name', 'llGetNotecardLine("nc", 0);'],
    ['llGetNotecardLine by key', `llGetNotecardLine("${NC_KEY}", 0);`],
    ['llGetNumberOfNotecardLines by name', 'llGetNumberOfNotecardLines("nc");'],
  ])('give the line in the same event as the first %s, before its answer arrives', async (_, read) => {
    // In-world: llGetNotecardLine by name ("same1") and by key ("same2"), and llGetNumberOfNotecardLines
    // by name ("same3"), each followed at once by llGetNotecardLineSync(..., 0) -> the first line, not NAK.
    const p = await run(`${read} llSay(1, "same " + llGetNotecardLineSync("nc", 0) + " " + llGetNotecardLineSync("${NC_KEY}", 0));`)
    expect(said(p)).toEqual(['same alpha alpha'])
  })

  it('give NAK by name right after the owner saves new text into a notecard', async () => {
    // In-world: a notecard read by name, then saved by the owner with new text -> changed() gave it a
    // new key and llGetNotecardLineSync by name gave NAK, as did one never read.
    const { scripts, linkset } = await loadLinkset({
      owner: OWNER,
      prims: [{
        inventory: [notecard('nc', NC_KEY, ['alpha'])],
        scripts: [{ name: 'p', source: { filename: 'p.lsl', source: `default {
          state_entry() { llGetNumberOfNotecardLines("nc"); }
          changed(integer c) { llSay(1, llGetNotecardLineSync("nc", 0) + " " + (string)(llGetInventoryKey("nc") != "${NC_KEY}")); }
        }` } }],
      }],
    })
    const p = scripts['p']!
    p.start()
    p.advanceTime(1000)
    linkset.prims[0]!.replaceInventory('nc', { notecardLines: ['omega'] })
    p.advanceTime(1000)
    expect(said(p)).toEqual([`${NAK} 1`])
  })
})

type Holder = Awaited<ReturnType<typeof loadLinkset>>['linkset']

describe('a notecard asset after its item leaves the world or is saved over', () => {
  const reader = (warm: boolean) => `
    key warming;
    default {
      state_entry() { ${warm ? `warming = llGetNumberOfNotecardLines("${GONE_KEY}");` : ''} llSetTimerEvent(1); }
      timer() {
        llSetTimerEvent(0);
        llSay(1, "sync " + llGetNotecardLineSync("${GONE_KEY}", 0));
        llGetNotecardLine("${GONE_KEY}", 1);
      }
      dataserver(key q, string d) { if (q != warming) llSay(1, d + ", then " + llGetNotecardLineSync("${GONE_KEY}", 0)); }
    }`

  async function setup(warm: boolean) {
    const world = new World()
    world.addRegion('Here', { x: 0, y: 0 })
    const holder = await loadLinkset({ world, region: 'Here', owner: OWNER, prims: [{ inventory: [notecard('gone', GONE_KEY, ['gone a', 'second'])] }] })
    const { scripts } = await loadLinkset({ world, region: 'Here', owner: OWNER, prims: [{ scripts: [{ source: { source: reader(warm), filename: 'p.lsl' }, name: 'p' }] }] })
    const p = scripts['p']!
    p.start()
    return { holder: holder.linkset, p }
  }

  const leaving: ReadonlyArray<[string, (holder: Holder) => void]> = [
    ['the owner deletes it from the object', (holder) => holder.prims[0]!.removeInventory('gone')],
    ['the object holding it is gone', (holder) => holder.remove()],
    ['the owner saves new text over it', (holder) => holder.prims[0]!.replaceInventory('gone', { notecardLines: ['new text'] })],
  ]

  // In-world: every old key read by key after its holder let it go: one never read gave NAK from the
  // sync read, then its lines through dataserver, and the sync read gave them from then on; one read
  // beforehand gave its lines from the sync read straight away.
  describe.each(leaving)('after %s', (_, leave) => {
    it('reads by key, giving NAK from the sync read until a dataserver read', async () => {
      const { holder, p } = await setup(false)
      p.advanceTime(500)
      leave(holder)
      p.advanceTime(3000)
      expect(said(p)).toEqual([`sync ${NAK}`, 'second, then gone a'])
      expect(said(p, DEBUG)).toEqual([])
    })

    it('stays cached for the sync read when it was read before', async () => {
      const { holder, p } = await setup(true)
      p.advanceTime(500)
      leave(holder)
      p.advanceTime(3000)
      expect(said(p)).toEqual(['sync gone a', 'second, then gone a'])
    })
  })

  it('reads by key after the attachment holding it is detached to inventory', async () => {
    // In-world: the worn holder detached itself with llDetachFromAvatar; its never-read notecard's key
    // gave NAK from the sync read, then its lines.
    const { holder, p } = await setup(false)
    holder.attachToAvatar(OWNER, 5)
    p.advanceTime(500)
    holder.detachFromAvatar()
    p.advanceTime(3000)
    expect(said(p)).toEqual([`sync ${NAK}`, 'second, then gone a'])
  })

  it('reads by key when the object holding it deletes itself with llDie', async () => {
    // In-world: after the holder's llDie, its never-read notecard's key gave NAK from the sync read, then its lines.
    const world = new World()
    world.addRegion('Here', { x: 0, y: 0 })
    await loadLinkset({
      world, region: 'Here', owner: OWNER,
      prims: [{
        inventory: [notecard('gone', GONE_KEY, ['gone a', 'second'])],
        scripts: [{ name: 'd', source: { filename: 'd.lsl', source: 'default { state_entry() { llDie(); } }' } }],
      }],
    }).then(({ scripts }) => scripts['d']!.start())
    const { scripts } = await loadLinkset({ world, region: 'Here', owner: OWNER, prims: [{ scripts: [{ source: { source: reader(false), filename: 'p.lsl' }, name: 'p' }] }] })
    const p = scripts['p']!
    p.start()
    p.advanceTime(3000)
    expect(said(p)).toEqual([`sync ${NAK}`, 'second, then gone a'])
  })
})
