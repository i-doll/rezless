import { describe, it, expect } from 'vitest'
import { loadLinkset, loadScript, World, NULL_KEY, type Vector } from '../src/index.js'

const OWNER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const GROUP = '33333333-3333-3333-3333-333333333333'
const ID = '44444444-4444-4444-4444-444444444444'

async function script(world: World, body: string, owner = OTHER, position: Vector = { x: 20, y: 20, z: 1999 }) {
  const loaded = await loadLinkset({ world, region: 'Sandbox', owner, position,
    prims: [{ scripts: [{ name: 'probe', source: { source: `list out; default { state_entry() { ${body} } }` } }] }],
  })
  loaded.scripts.probe!.start()
  return loaded
}

function fixture() {
  const world = new World()
  world.addRegion('Sandbox', { x: 0, y: 0 }, { scriptDanger: (x) => x < 128 })
  world.addRegion('Neighbour', { x: 256, y: 0 })
  world.addParcel({ region: 'Sandbox', id: ID, bounds: { min: { x: 0, y: 0 }, max: { x: 128, y: 256 } },
    name: 'Garden', description: 'West parcel', owner: OWNER, group: GROUP, area: 32768,
    flags: 1040187467, seeAvatars: false, maxPrims: 10000,
    primCounts: { 0: 20, 1: 5, 2: 7, 3: 8, 4: 2, 5: 3 },
    primOwners: { [OTHER]: 15, [OWNER]: 5 }, musicURL: 'https://example.com/stream',
    landingPoint: { x: 10, y: 20, z: 30 }, landingLookAt: { x: 1, y: 0, z: 0 }, tpRouting: 2,
  })
  world.addParcel({ region: 'Sandbox', bounds: { min: { x: 128, y: 0 }, max: { x: 256, y: 256 } },
    name: 'East', owner: OWNER, maxPrims: 6000, primCounts: { 0: 10, 1: 4, 5: 1 },
  })
  // Same owner in another region must not enter same-owner, same-region totals.
  world.addParcel({ region: 'Neighbour', owner: OWNER, maxPrims: 9000, primCounts: { 0: 100 } })
  return world
}

// Docs: https://wiki.secondlife.com/wiki/LlGetParcelDetails and /LlGetLandOwnerAt.
// In-world: issue-159 reads, Aditi, SLua Tideland, 2026-10-31: selectors 0..13
// returned name, description, owner/group keys, area 65056, parcel key, visibility
// 1, same-owner capacity 20000, used 2273, zero landing vectors, routing 1,
// flags 1040187467 and danger 0. Land owner matched the details owner.
describe('parcel reads', () => {
  it('returns every detail in requested order with LSL element types', async () => {
    const { scripts } = await script(fixture(), `
      list d = llGetParcelDetails(llGetPos(), [0,1,2,3,4,5,6,7,8,9,10,11,12,13]);
      out = d + [llGetLandOwnerAt(llGetPos()), llGetListEntryType(d,2), llGetListEntryType(d,4), llGetListEntryType(d,9)];
    `)
    expect(scripts.probe!.global('out')).toEqual(['Garden', 'West parcel', OWNER, GROUP, 32768, ID, 0,
      16000, 30, { x: 10, y: 20, z: 30 }, { x: 1, y: 0, z: 0 }, 2, 1040187467, 1, OWNER, 4, 1, 5])
  })

  // In-world: issue-159 invalid/types follow-up -> [name] for [0,999,4] and
  // [0,-1,4], [owner] for ["0",4.0,2], no DEBUG_CHANNEL errors (same place/date).
  it('skips non-integer selectors and stops at an unknown integer, preserving preceding results', async () => {
    const { scripts } = await script(fixture(), `
      out = llGetParcelDetails(llGetPos(), [0,999,4]) + llGetParcelDetails(llGetPos(), [0,-1,4])
        + llGetParcelDetails(llGetPos(), ["0",4.0,2]) + llGetParcelDetails(llGetPos(), []);
    `)
    expect(scripts.probe!.global('out')).toEqual(['Garden', 'Garden', OWNER])
    expect(scripts.probe!.chat).toEqual([])
  })

  // Docs: /LlGetParcelFlags, /LlGetParcelMaxPrims, /LlGetParcelPrimCount.
  // In-world: local/sim-wide/-1 capacity = 19853/20000/20000; local total 2250,
  // sim-wide total 2273. Categories -1 and 6 returned 0. All categories 0..5
  // were measured with sim_wide 0,1,-1. Small-parcel follow-up: capacity 146/20000,
  // total 24/2275 (counts changed with rezzing), Aditi, SLua Tideland, 2026-10-31.
  it('reads flags, capacities and each count category, aggregating only the same owner in the same region', async () => {
    const world = fixture()
    world.addParcel({ region: 'Sandbox', owner: OTHER, maxPrims: 4000, primCounts: { 0: 999 },
      bounds: { min: { x: 120, y: 0 }, max: { x: 128, y: 256 } } })
    const { scripts } = await script(world, `
      out = [llGetParcelFlags(llGetPos()), llGetParcelMaxPrims(llGetPos(),0), llGetParcelMaxPrims(llGetPos(),-1)];
      integer i; for(i=-1;i<=6;++i) out += [llGetParcelPrimCount(llGetPos(),i,0)];
      out += [llGetParcelPrimCount(llGetPos(),0,1),llGetParcelPrimCount(llGetPos(),1,-1),llGetParcelPrimCount(llGetPos(),5,1)];
    `)
    expect(scripts.probe!.global('out')).toEqual([1040187467, 10000, 16000, 0, 20, 5, 7, 8, 2, 3, 0, 30, 9, 4])
  })

  // In-world: large/small/sim-wide capacities 19853/146/20000. Capacity
  // must be rounded after aggregation, not summed after parcel rounding.
  it('truncates capacity after summing unrounded parcel budgets', async () => {
    const world = new World(); world.addRegion('Sandbox', { x: 0, y: 0 })
    world.addParcel({ region: 'Sandbox', owner: OWNER, maxPrims: 19853.515625 })
    world.addParcel({ region: 'Sandbox', owner: OWNER, maxPrims: 146.484375,
      bounds: { min: { x: 76, y: 60 }, max: { x: 100, y: 80 } } })
    const { scripts } = await script(world, `out=[llGetParcelMaxPrims(llGetPos(),0),llGetParcelMaxPrims(<78,62,0>,0),
      llGetParcelMaxPrims(llGetPos(),1)] + llGetParcelDetails(llGetPos(),[7]);`)
    expect(scripts.probe!.global('out')).toEqual([19853,146,20000,20000])
  })

  // In-world: issue-159 reads at <-1,48>, <116,-1>, <256,48>, <116,256>,
  // <300,300>, <-1e6,-1e6> and z -1000/5000 -> ordinary parcel values, no
  // errors. Follow-up from the small parcel read the large parcel at <-1,-1>
  // and <300,300>. Aditi, SLua Tideland, 2026-10-31.
  it.each([
    ['<-1000000,-1,5000>', 'Garden', 1040187467, 10000, 20, 1],
    ['<256,20,-1000>', 'East', 0, 6000, 10, 0],
    ['<1000000,300,0>', 'East', 0, 6000, 10, 0],
    ['<128,20,0>', 'East', 0, 6000, 10, 0],
  ])('clamps x/y to region edges and ignores z at %s', async (pos, name, flags, max, count, danger) => {
    const { scripts } = await script(fixture(), `
      out = llGetParcelDetails(${pos},[0,13]) + [llGetLandOwnerAt(${pos}),llGetParcelFlags(${pos}),
        llGetParcelMaxPrims(${pos},0),llGetParcelPrimCount(${pos},0,0)] + llGetParcelPrimOwners(${pos});
    `)
    expect(scripts.probe!.global('out')).toEqual([name, danger, OWNER, flags, max, count])
  })

  // Docs: /LlGetParcelMusicURL and /LlGetParcelPrimOwners. In-world: issue-159
  // reads -> "" and [], no errors, without land rights. Owners call slept 2s.
  // Success paths require ownership/group return powers absent on this parcel;
  // changing ownership, parcel settings or deeding the probe was prohibited.
  it('hides music and prim owners from a foreign owner and applies the owners delay', async () => {
    const { scripts, linkset } = await script(fixture(), 'out = [llGetParcelMusicURL()] + llGetParcelPrimOwners(llGetPos()); out += [9];')
    expect(linkset.clock.now).toBe(2000)
    expect(scripts.probe!.global('out')).toEqual(['', 9])
    expect(scripts.probe!.chat).toEqual([])
  })

  it('lets a parcel owner read music and prim owners sorted by key with key/integer types', async () => {
    const { scripts, linkset } = await script(fixture(), `
      list owners = llGetParcelPrimOwners(llGetPos());
      out = [llGetParcelMusicURL()] + owners + [llGetListEntryType(owners,0),llGetListEntryType(owners,1)];
    `, OWNER)
    expect(scripts.probe!.global('out')).toEqual(['https://example.com/stream', OWNER, 5, OTHER, 15, 4, 1])
  })

  it('limits the owner list to the first 100 UUID-sorted strides', async () => {
    const world = new World(); world.addRegion('Sandbox', { x: 0, y: 0 })
    const owners: Record<string, number> = {}
    for (let i = 101; i >= 1; --i) owners[`00000000-0000-0000-0000-${String(i).padStart(12,'0')}`] = i
    world.addParcel({ region: 'Sandbox', owner: OWNER, primOwners: owners })
    const { scripts, linkset } = await script(world, 'list p=llGetParcelPrimOwners(llGetPos()); out=[llGetListLength(p),llList2Key(p,0),llList2Key(p,-2),llList2Integer(p,-1)];', OWNER)
    expect(scripts.probe!.global('out')).toEqual([200, '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000100', 100])
  })

  // Docs: /LlOverMyLand. In-world: issue-159 reads -> 0 for the probe, its
  // owner, NULL_KEY and "bad". TRUE requires land owned by the script owner,
  // unavailable here without changing land ownership. Same place/date above.
  it('looks up live prims, fixture objects and avatars in the caller region', async () => {
    const world = fixture()
    const target = world.addObject({ region: 'Sandbox', position: { x: 40, y: 40, z: 10 } })
    const avatar = world.addAvatar({ region: 'Sandbox', username: 'test.user', position: { x: 200, y: 20, z: 0 } })
    const remote = world.addObject({ region: 'Neighbour' })
    const { scripts } = await script(world, `out = [llOverMyLand(llGetKey()),
      llOverMyLand((key)llToUpper((string)llGetKey())), llOverMyLand("${target.key}"),
      llOverMyLand("${avatar.key}"),llOverMyLand("${remote.key}"),llOverMyLand(NULL_KEY),llOverMyLand("bad")];`, OWNER)
    expect(scripts.probe!.global('out')).toEqual([1,1,1,1,0,0,0])
  })

  it('uses the target parcel owner rather than its object owner or group', async () => {
    const world = fixture()
    const foreign = world.addObject({ region: 'Sandbox', owner: OWNER, group: GROUP })
    const { scripts } = await script(world, `out=[llOverMyLand(llGetKey()),llOverMyLand("${foreign.key}")];`)
    expect(scripts.probe!.global('out')).toEqual([0, 0])
  })

  it('returns unowned defaults in holes between configured parcels', async () => {
    const world = new World(); world.addRegion('Sandbox', { x: 0, y: 0 })
    world.addParcel({ region: 'Sandbox', owner: OWNER,
      bounds: { min: { x: 100, y: 100 }, max: { x: 128, y: 128 } } })
    const { scripts } = await script(world, 'out=[llGetLandOwnerAt(llGetPos()),llGetParcelFlags(llGetPos()),llGetParcelMaxPrims(llGetPos(),1),llOverMyLand(llGetKey())];', OWNER)
    expect(scripts.probe!.global('out')).toEqual([NULL_KEY,0,0,0])
  })

  it('returns empty owner-only fields when an owned parcel has no music or objects', async () => {
    const { scripts } = await script(fixture(), 'out=[llGetParcelMusicURL()] + llGetParcelPrimOwners(llGetPos());', OWNER, { x: 200, y: 20, z: 0 })
    expect(scripts.probe!.global('out')).toEqual([''])
  })

  it('supplies empty fixture defaults where no parcel was configured', async () => {
    const s = await loadScript({ source: 'list out; default { state_entry() { out=llGetParcelDetails(ZERO_VECTOR,[0,1,2,3,4,6,7,8,9,10,11,12,13])+[llGetParcelFlags(ZERO_VECTOR),llGetParcelMaxPrims(ZERO_VECTOR,0),llGetParcelPrimCount(ZERO_VECTOR,0,0),llGetParcelMusicURL(),llOverMyLand(llGetKey())]; } }' })
    s.start()
    expect(s.global('out')).toEqual(['','',NULL_KEY,NULL_KEY,65536,1,0,0,{x:0,y:0,z:0},{x:0,y:0,z:0},1,0,0,0,0,0,'',0])
  })
})
