import { describe, it, expect } from 'vitest'
import { loadLinkset, loadScript, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlScriptDanger: TRUE when pos is over land
// where a script may be in danger. A test sets which land that is on the region,
// because it doesn't follow from llGetParcelFlags. In-world, a Morris parcel
// with llGetParcelFlags 0x3E00004B read 1 and the SLua Tideland parcel with the
// same flags read 0; the Gecko01 parcel, which doesn't allow building, read 0
// (Aditi, 2026-10-31).

async function inRegion(world: World, region: string, body: string) {
  const { scripts } = await loadLinkset({
    world,
    region,
    position: { x: 128, y: 128, z: 20 },
    prims: [{ name: 'probe', scripts: [{ source: { source: `list out; default { state_entry() { ${body} } }` }, name: 'probe' }] }],
  })
  scripts.probe!.start()
  return scripts.probe!.global('out')
}

describe('llScriptDanger', () => {
  // In-world: llScriptDanger at llGetPos() and a 5x5 grid over SLua Tideland
  // (both parcels: scripts and building allowed, not a sandbox region) -> 0
  // everywhere (Aditi, SLua Tideland, 2026-10-31).
  it('is FALSE by default', async () => {
    const s = await loadScript({ source: 'integer out; default { state_entry() { out = llScriptDanger(llGetPos()); } }' })
    s.start()
    expect(s.global('out')).toBe(0)
  })

  // In-world: an 8 m scan of Morris (a sandbox region) found 14 parcels. Of the
  // 12 whose results arrived, 11 read 1 and the private Gecko01 parcel read 0.
  // llGetParcelDetails(pos, [PARCEL_DETAILS_SCRIPT_DANGER]) matched llScriptDanger
  // on all 7 parcels where both were read (Aditi, Morris, 2026-10-31).
  it('reads TRUE across a region marked dangerous', async () => {
    const world = new World()
    world.addRegion('Morris', { x: 255232, y: 256256 }, { scriptDanger: true })
    expect(await inRegion(world, 'Morris', 'out = [llScriptDanger(<4, 4, 30>), llScriptDanger(llGetPos())];')).toEqual([
      1, 1,
    ])
  })

  // In-world: in Morris the abandoned parcel at <4, 4> read 1 and the Gecko01
  // Tester parcel at <228, 228> read 0 (Aditi, Morris, 2026-10-31).
  it('reads each position from a function of x and y', async () => {
    const world = new World()
    world.addRegion('Morris', { x: 255232, y: 256256 }, { scriptDanger: (x, y) => !(x >= 192 && y >= 192) })
    expect(
      await inRegion(world, 'Morris', 'out = [llScriptDanger(<4, 4, 30>), llScriptDanger(<228, 228, 30>)];'),
    ).toEqual([1, 0])
  })

  // In-world: in Morris, <0,0>, <-1,4>, <4,-1>, <-50,-50>, <-1e6,-1e6>, <4,4,-100>
  // and <4,4,5000> all read 1 from the parcel at <4,4>; <255.9,255.9>, <256,256>,
  // <300,300> and <1e6,1e6> all read 0 from the Gecko01 parcel at <228,228>;
  // <4,256> and <4,300> read the parcel at <4,255.9> (Aditi, Morris, 2026-10-31).
  it('reads an off-region position at the nearest edge and ignores z', async () => {
    const world = new World()
    const seen: [number, number][] = []
    world.addRegion('Morris', { x: 255232, y: 256256 }, {
      scriptDanger: (x, y) => {
        seen.push([x, y])
        return !(x >= 192 && y >= 192)
      },
    })
    expect(
      await inRegion(
        world,
        'Morris',
        'out = [llScriptDanger(<-50, -50, 30>), llScriptDanger(<4, 4, 5000>), llScriptDanger(<1e6, 1e6, -100>), llScriptDanger(<4, 300, 30>)];',
      ),
    ).toEqual([1, 1, 0, 1])
    expect(seen).toEqual([
      [0, 0],
      [4, 4],
      [256, 256],
      [4, 256],
    ])
  })
})
