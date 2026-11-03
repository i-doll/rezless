import { describe, expect, it } from 'vitest'
import { InventoryType, makeInventoryItem, type WorldParcelOptions } from '@rezless/vm'
import { loadLinkset, World, type RegionSettings, type Vector } from '../src/index.js'

// Wiki: https://wiki.secondlife.com/wiki/LlModifyLand and
// https://wiki.secondlife.com/wiki/LlSetGroundTexture.
// The refusals were measured on Aditi in SLua Tideland. The successful edits
// follow the wiki and are unmeasured: they need land the test account owns
// with terraform rights, or estate manager rights, which it doesn't have.

const OWNER = '11111111-2222-3333-4444-555555555555'
const NEIGHBOUR = '66666666-7777-8888-9999-000000000000'
const TEXTURE = 'aaaaaaaa-0000-0000-0000-000000000001'
const MATERIAL = 'aaaaaaaa-0000-0000-0000-000000000002'

interface Fixture {
  readonly settings?: RegionSettings
  readonly parcels?: readonly Omit<WorldParcelOptions, 'region'>[]
  readonly position?: Vector
  readonly ownerAway?: boolean
}

// A slope rising 1 m per metre east.
const slope = (x: number) => 20 + x

async function run(body: string, { settings = { ground: slope }, parcels = [{ owner: OWNER }], position = { x: 10.5, y: 10.5, z: 30 }, ownerAway }: Fixture = {}) {
  const world = new World({ startUnixTime: 1000 })
  world.addRegion('Sandbox', { x: 0, y: 0 }, settings)
  world.addRegion('Elsewhere', { x: 256, y: 0 })
  world.addAvatar({ region: ownerAway ? 'Elsewhere' : 'Sandbox', key: OWNER, username: 'owner' })
  for (const parcel of parcels) world.addParcel({ region: 'Sandbox', ...parcel })
  const { scripts } = await loadLinkset({ world, region: 'Sandbox', owner: OWNER, position, prims: [{
    inventory: [
      makeInventoryItem({ name: 'rock', type: InventoryType.TEXTURE, key: TEXTURE }),
      makeInventoryItem({ name: 'moss', type: InventoryType.MATERIAL, key: MATERIAL }),
    ],
    scripts: [{ name: 'p', source: { source: `
      vector at(float x, float y) { vector p = llGetPos(); return <x - p.x, y - p.y, 0.0>; }
      list result; default { state_entry() { ${body} } }` } }],
  }] })
  scripts.p!.start()
  return { script: scripts.p!, region: world.region('Sandbox') }
}

describe('llModifyLand on land the owner may terraform', () => {
  // Wiki: LAND_LEVEL levels the brush square at the prim's centre; LAND_BRUSH_SMALL is 2 m by 2 m.
  it('levels the small brush square to the ground under the prim', async () => {
    const { script, region } = await run(`
      llModifyLand(LAND_LEVEL, LAND_BRUSH_SMALL);
      result = [llGround(at(10, 10)), llGround(at(11, 11)), llGround(at(11.5, 11)), llGround(at(9, 10)),
        llGroundNormal(at(10, 10)), llGroundSlope(at(10.5, 10.5))];
    `)
    expect(script.global('result')).toEqual([30.5, 30.5, 31.25, 29, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 }])
    expect([...region.terrainEdits.keys()].sort()).toEqual(['10,10', '10,11', '11,10', '11,11'])
  })

  it.each([[1, 4, 8.5, 12.5], [2, 8, 6.5, 14.5]])('covers a brush %i of %i m', async (brush, _size, lo, hi) => {
    const { region } = await run(`llModifyLand(LAND_LEVEL, ${brush});`)
    const xs = [...region.terrainEdits.keys()].map(k => Number(k.split(',')[0]))
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([Math.ceil(lo), Math.floor(hi)])
  })

  // Wiki: LAND_REVERT restores the land to its baked value.
  it('reverts levelled land to the configured ground', async () => {
    const { script, region } = await run(`
      llModifyLand(LAND_LEVEL, LAND_BRUSH_SMALL);
      llModifyLand(LAND_REVERT, LAND_BRUSH_SMALL);
      result = [llGround(at(11, 10))];
    `)
    expect(script.global('result')).toEqual([31])
    expect(region.terrainEdits.size).toBe(0)
  })

  it('shows edits to llCastRay', async () => {
    const { script } = await run(`
      llModifyLand(LAND_LEVEL, LAND_BRUSH_SMALL);
      result = llCastRay(<11, 11, 100>, <11, 11, 0>, [RC_REJECT_TYPES, RC_REJECT_AGENTS | RC_REJECT_PHYSICAL | RC_REJECT_NONPHYSICAL]);
    `)
    expect((script.global('result') as unknown[])[1]).toEqual({ x: 11, y: 11, z: 30.5 })
  })

  // The wiki gives no amounts for raising, lowering, smoothing or noise, so they change nothing here.
  it.each(['LAND_RAISE', 'LAND_LOWER', 'LAND_SMOOTH', 'LAND_NOISE'])('leaves %s unmodelled', async (action) => {
    const { region } = await run(`llModifyLand(${action}, LAND_BRUSH_LARGE);`)
    expect(region.terrainEdits.size).toBe(0)
  })

  it('only edits grid points on the owner\'s parcels', async () => {
    const { region } = await run('llModifyLand(LAND_LEVEL, LAND_BRUSH_SMALL);', { parcels: [
      { owner: OWNER }, { owner: NEIGHBOUR, bounds: { min: { x: 11, y: 0 }, max: { x: 256, y: 256 } } },
    ] })
    expect([...region.terrainEdits.keys()].sort()).toEqual(['10,10', '10,11'])
  })

  // Wiki: no effect if the owner is away from the region, the land isn't
  // theirs or they lack terraform rights. In-world: without rights,
  // LAND_RAISE and an invalid action/brush left llGround unchanged (2026-10-31).
  it.each<[string, Fixture]>([
    ['owner away', { ownerAway: true }],
    ['someone else\'s land', { parcels: [{ owner: NEIGHBOUR }] }],
    ['no parcel', { parcels: [] }],
    ['terraform blocked', { settings: { ground: slope, flags: 0x40 } }],
  ])('does nothing with %s', async (_, fixture) => {
    const { region } = await run('llModifyLand(LAND_LEVEL, LAND_BRUSH_SMALL); llModifyLand(-1, -1); llModifyLand(LAND_LEVEL, 3);', fixture)
    expect(region.terrainEdits.size).toBe(0)
  })

  // Wiki (BUG-4929): a child prim uses its position relative to the root.
  it('uses a child prim\'s local position', async () => {
    const world = new World()
    world.addRegion('Sandbox', { x: 0, y: 0 }, { ground: slope })
    world.addParcel({ region: 'Sandbox', owner: OWNER })
    const { scripts } = await loadLinkset({ world, region: 'Sandbox', owner: OWNER, position: { x: 100, y: 100, z: 30 }, prims: [{}, {
      scripts: [{ name: 'c', source: { source: 'default { state_entry() { llSetPos(<2, 2, 0>); llModifyLand(LAND_LEVEL, LAND_BRUSH_SMALL); } }' } }],
    }] })
    scripts.c!.start()
    expect([...world.region('Sandbox').terrainEdits.keys()].sort()).toEqual(['1,1', '1,2', '1,3', '2,1', '2,2', '2,3', '3,1', '3,2', '3,3'])
  })
})

describe('llSetGroundTexture for an estate manager', () => {
  const estate = { estateManagers: [OWNER] }

  it('applies every rule kind and always returns 0', async () => {
    const { script, region } = await run(`
      result += llSetGroundTexture([TERRAIN_DETAIL_1, "rock", TERRAIN_DETAIL_2, "moss", TERRAIN_DETAIL_3, "${TEXTURE}",
        TERRAIN_HEIGHT_RANGE_NE, 10, 60.5, TERRAIN_PBR_SCALE_1, <2,3,0>, TERRAIN_PBR_ROTATION_4, 1.5,
        TERRAIN_PBR_OFFSET_2, <0.5,0,0>]);
    `, { settings: estate })
    expect(script.global('result')).toEqual([0])
    expect(Object.fromEntries(region.groundTextures)).toEqual({
      0: [TEXTURE], 1: [MATERIAL], 2: [TEXTURE], 7: [10, 60.5], 8: [{ x: 2, y: 3, z: 0 }], 15: [1.5], 17: [{ x: 0.5, y: 0, z: 0 }],
    })
    expect(script.chat).toEqual([])
  })

  // Wiki: NULL_KEY or "" restores the default texture.
  it('restores the default texture for NULL_KEY or an empty string', async () => {
    const { region } = await run(`
      llSetGroundTexture([TERRAIN_DETAIL_1, "rock", TERRAIN_DETAIL_2, "rock"]);
      llSetGroundTexture([TERRAIN_DETAIL_1, NULL_KEY, TERRAIN_DETAIL_2, ""]);
    `, { settings: estate })
    expect(region.groundTextures.size).toBe(0)
  })

  // The wiki doesn't say what a bad list does; nothing from it is applied.
  it.each(['[999]', '[TERRAIN_DETAIL_1]', '[TERRAIN_DETAIL_1, "missing"]', '[TERRAIN_HEIGHT_RANGE_SW, 1.0]',
    '[TERRAIN_PBR_SCALE_1, 2.0]', '[TERRAIN_PBR_ROTATION_1, "x"]', '[TERRAIN_DETAIL_1, 5]', '[1.0, "rock"]', '[-1, 1.0, 2.0]', '[20, 1.0]'])('applies nothing from %s', async (rules) => {
    const { region } = await run(`llSetGroundTexture([TERRAIN_DETAIL_4, "rock"] + ${rules});`, { settings: estate })
    expect(region.groundTextures.size).toBe(0)
  })

  // Wiki: throttled to 4 calls every 2 minutes.
  it('ignores a fifth call within two minutes', async () => {
    const { region } = await run(`
      integer i; for (i = 0; i < 4; ++i) llSetGroundTexture([]);
      llSetGroundTexture([TERRAIN_DETAIL_1, "rock"]);
      llSleep(121);
      llSetGroundTexture([TERRAIN_DETAIL_2, "rock"]);
    `, { settings: estate })
    expect([...region.groundTextures.keys()]).toEqual([1])
  })

  // In-world: six calls 6 s apart without estate rights each gave 0 and the
  // denial message (Aditi, SLua Tideland, 2026-11-04), so refusals aren't throttled.
  it('does not throttle refusals', async () => {
    const { script } = await run('integer i; for (i = 0; i < 6; ++i) result += llSetGroundTexture([]);')
    expect(script.global('result')).toEqual(Array(6).fill(0))
    expect(script.chat).toHaveLength(6)
  })
})
