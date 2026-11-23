import { describe, it, expect } from 'vitest'
import { loadLinkset, World } from '../src/index.js'
import { NAK } from '@rezless/vm'

const NC_KEY = 'b55a2053-c6bc-5e6d-0193-553cdf8ae12e'
const OWNER = '7d1f3a2b-9c4e-4f6a-8b2d-5e0c1a9f3b7d'
const LINE = 'first line'

const said = (p: { chat: ReadonlyArray<{ channel: number; text: string }> }) => p.chat.filter((c) => c.channel === 1).map((c) => c.text)

describe('World.addNotecardAsset', () => {
  // In-world (Aditi, SLua Tideland, Mono, 2026-11-23): a notecard saved in the owner's inventory and
  // never put in a prim, read by its asset key -> llGetNotecardLineSync gave NAK, then
  // llGetNotecardLine(key, 1) answered the second line, and the sync read gave the first line in that
  // same event and in the dataserver event.
  it('lets a script read a notecard by key that no prim holds', async () => {
    const world = new World()
    world.addRegion('Here', { x: 0, y: 0 })
    world.addNotecardAsset(NC_KEY, [LINE, 'second apple'])
    const { scripts } = await loadLinkset({
      world, region: 'Here', owner: OWNER,
      prims: [{ scripts: [{ name: 'p', source: { filename: 'p.lsl', source: `default {
        state_entry() { llSay(1, "before " + llGetNotecardLineSync("${NC_KEY}", 0)); llGetNotecardLine("${NC_KEY}", 1); llSay(1, "same " + llGetNotecardLineSync("${NC_KEY}", 0)); }
        dataserver(key q, string d) { llSay(1, d + " " + llGetNotecardLineSync("${NC_KEY}", 0)); }
      }` } }] }],
    })
    const p = scripts['p']!
    p.start()
    p.advanceTime(3000)
    expect(said(p)).toEqual([`before ${NAK}`, `same ${LINE}`, `second apple ${LINE}`])
  })

  it('refuses a key that is not an asset key', () => {
    expect(() => new World().addNotecardAsset('nc', [LINE])).toThrow(/not a notecard asset key/)
  })
})
