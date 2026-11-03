import { describe, expect, it } from 'vitest'
import { InventoryType, makeInventoryItem, type EnvironmentAsset, type InventoryItem } from '@rezless/vm'
import { loadLinkset, loadScript, World, type RegionSettings } from '../src/index.js'

// Wiki: https://wiki.secondlife.com/wiki/LlGetEnvironment,
// https://wiki.secondlife.com/wiki/LlSetEnvironment,
// https://wiki.secondlife.com/wiki/LlReplaceEnvironment,
// https://wiki.secondlife.com/wiki/LlSetGroundTexture.
// Reads and refusals were measured on Aditi in SLua Tideland, 2026-10-31.
// Successful changes follow the wiki and are unmeasured: they need land the
// test account owns or estate manager rights, which it doesn't have.

async function run(body: string, settings: RegionSettings = {}) {
  const world = new World({ startUnixTime: 1234.25 })
  world.addRegion('Sandbox', { x: 0, y: 0 }, settings)
  const loaded = await loadLinkset({ world, region: 'Sandbox', prims: [{ scripts: [{ name: 'p', source: {
    source: `list result; default { state_entry() { ${body} } }`,
  } }] }] })
  loaded.scripts.p!.start()
  return loaded.scripts.p!
}

// In-world: malformed rules, missing inventory, empty rules/removal and 20
// rapid calls -> -9 on both parcel and region targets, with no debug errors.
it.each(['<-1,-1,-1>', '<10,20,2000>'])('refuses land environment changes at %s before validating arguments', async (position) => {
  const script = await run(`
    result += llSetEnvironment(${position}, []);
    result += llSetEnvironment(${position}, [999]);
    result += llSetEnvironment(${position}, [SKY_GAMMA, "bad"]);
    result += llReplaceEnvironment(${position}, "missing", -1, -1, -1);
    result += llReplaceEnvironment(${position}, "", -99, 0, 0);
    integer i; for(i=0;i<20;++i) result += llSetEnvironment(${position}, [SKY_GAMMA, 1.0]);
  `)
  expect(script.global('result')).toEqual(Array(25).fill(-9))
  expect(script.chat).toEqual([])
})

// In-world: [] and [999] both -> 0 plus this exact debug message.
it('reports missing estate permission for ground textures before validating changes', async () => {
  const script = await run(`result += llSetGroundTexture([]); result += llSetGroundTexture([999]);`)
  expect(script.global('result')).toEqual([0, 0])
  expect(script.chat.map(({ channel, text }) => [channel, text])).toEqual(Array(2).fill([
    2147483647, 'llSetGroundTexture object owner must be able to manage estate.',
  ]))
})

// In-world: LAND_RAISE, LAND_BRUSH_SMALL with no terraform permission ->
// llGround remains 22, no debug error. Invalid action/brush also silent.
it('leaves the configured terrain unchanged without terraform rights', async () => {
  const script = await run(`
    result += llGround(ZERO_VECTOR);
    llModifyLand(LAND_RAISE, LAND_BRUSH_SMALL);
    llModifyLand(-1, -1);
    result += llGround(ZERO_VECTOR);
  `, { ground: 37 })
  expect(script.global('result')).toEqual([37, 37])
  expect(script.chat).toEqual([])
})

// In-world: SKY_TRACKS -> three floats; texture default flags -> integers;
// all other numeric parameters -> floats, including values such as 1 or 6360.
it('returns measured defaults in requested order and preserves list element types', async () => {
  const script = await run(`
    result = llGetEnvironment(<-1,-1,2000>, [SKY_GAMMA, SKY_TRACKS, SKY_TEXTURE_DEFAULTS, WATER_FOG,
      SKY_PLANET, WATER_TEXTURE_DEFAULTS, WATER_NORMAL_SCALE, SKY_BLUE, SKY_HAZE]);
    list types; integer i;
    for(i=0;i<llGetListLength(result);++i) types += llGetListEntryType(result,i);
    llSay(0,llList2CSV(types));
  `)
  expect(script.global('result')).toEqual([
    1, 1000, 2000, 3000, 1, 1, 1,
    { x: Math.fround(0.015686), y: Math.fround(0.149020), z: Math.fround(0.250980) }, 16, 0.25,
    6360, 6360, 6420, 1, 0, { x: 2, y: 2, z: 2 },
    { x: Math.fround(0.086688), y: Math.fround(0.206889), z: Math.fround(0.394344) },
    { x: Math.fround(0.108678), y: Math.fround(0.146621), z: Math.fround(0.180150) },
    Math.fround(0.07), Math.fround(0.168485), Math.fround(0.380810), Math.fround(0.943436),
  ])
  expect(script.chat[0]!.text).toBe('2, 2, 2, 2, 1, 1, 1, 5, 2, 2, 2, 2, 2, 1, 1, 5, 5, 5, 2, 2, 2, 2')
})

// In-world: every valid rule measured separately. SKY_CLOUDS has eight values,
// SKY_SUN and SKY_MOON seven each, SKY_LIGHT three vectors.
it.each([
  [0, [5]], [1, [1, 1, 1]], [2, [5, 2, 2, 2, 5, 5, 5, 1]], [4, [2, 2, 2]],
  [5, [2]], [6, [2, 2]], [8, [5, 5, 5]], [9, [6, 2, 2, 1, 5, 5, 5]],
  [10, [2, 2, 2]], [11, [2, 2, 2]], [13, [2]], [14, [6, 2, 5, 1, 5, 5, 5]],
  [15, [2, 2, 2]], [22, [5, 5]], [23, [2, 2, 2, 2]], [24, [2]],
  [100, [2]], [101, [5, 2, 2]], [102, [2, 2]], [103, [1, 1]], [104, [5]],
  [105, [2, 2]], [106, [5, 5]], [200, [1, 1, 2]],
])('returns the measured shape for rule %i', async (rule, types) => {
  const script = await run(`
    list values = llGetEnvironment(ZERO_VECTOR,[${rule}]);
    integer i; for(i=0;i<llGetListLength(values);++i) result += llGetListEntryType(values,i);
  `)
  expect(script.global('result')).toEqual(types)
})

// In-world: unknown rules, float IDs, string IDs and texture IDs unsupported
// by the getter -> [] for the whole request, no debug messages captured.
it.each(['[5,999,5]', '[5.0]', '["5"]', '[3]', '[7]', '[12]', '[16]', '[17]', '[18]', '[19]', '[20]', '[21]', '[107]', '[]'])('returns an empty list for %s', async (rules) => {
  const script = await run(`result = llGetEnvironment(ZERO_VECTOR, ${rules});`)
  expect(script.global('result')).toEqual([])
  expect(script.chat).toEqual([])
})

// In-world: ENVIRONMENT_DAYINFO was [14400,57600,secondsIntoDay];
// SKY_SUN's rotation matched llGetSunRotation at the same position.
it('shares configured day, sun and moon state with existing reads', async () => {
  const script = await run(`
    list day = llGetEnvironment(<-1,-1,2000>, [ENVIRONMENT_DAYINFO]);
    list sun = llGetEnvironment(llGetPos(), [SKY_SUN]);
    list moon = llGetEnvironment(llGetPos(), [SKY_MOON]);
    result = day + [llGetDayLength(),llGetDayOffset(),llGetRegionTimeOfDay(),
      llList2Rot(sun,0) == llGetSunRotation(),llList2Vector(sun,4) == llGetSunDirection(),
      llList2Rot(moon,0) == llGetMoonRotation(),llList2Vector(moon,4) == llGetMoonDirection()];
  `, { dayLength: 1000, dayOffset: 100, sunRotation: { x: 0, y: 0, z: 1, s: 0 }, moonRotation: { x: 1, y: 0, z: 0, s: 0 } })
  expect(script.global('result')).toEqual([1000, 100, 334.25, 1000, 100, 334.25, 1, 1, 1, 1])
})

it('reads values configured per region without changing the supplied arrays', async () => {
  const gamma = Object.freeze([2.5])
  const script = await run(`
    result = llGetEnvironment(ZERO_VECTOR,[SKY_GAMMA, SKY_AMBIENT, WATER_FOG, SKY_GAMMA]);
  `, { environment: { 5: gamma, 0: [{ x: 0.5, y: 0.25, z: 0 }], 101: [{ x: 0, y: 0, z: 1 }, 4, 0.5] } })
  expect(script.global('result')).toEqual([2.5, { x: 0.5, y: 0.25, z: 0 }, { x: 0, y: 0, z: 1 }, 4, 0.5, 2.5])
  expect(gamma).toEqual([2.5])
})

it('also exposes the measured defaults without a world', async () => {
  const script = await loadScript({ source: `list result; default { state_entry() {
    result = llGetEnvironment(ZERO_VECTOR,[SKY_TRACKS,WATER_FRESNEL]);
  } }` })
  script.start()
  expect(script.global('result')).toEqual([1000, 2000, 3000, 0.5, Math.fround(0.4)])
})

it('keeps configured sun metadata while using the existing sun rotation and direction', async () => {
  const supplied = Object.freeze([
    { x: 0, y: 0, z: 0, s: 1 }, 2, { x: 1, y: 0, z: 0 }, 0,
    { x: 99, y: 99, z: 99 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 },
  ])
  const script = await run('result = llGetEnvironment(ZERO_VECTOR,[SKY_SUN]);', {
    sunRotation: { x: 0, y: 0, z: 1, s: 0 }, environment: { 14: supplied },
  })
  expect(script.global('result')).toEqual([
    { x: 0, y: 0, z: 1, s: 0 }, 2, { x: 1, y: 0, z: 0 }, 0,
    { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 },
  ])
  expect(supplied[0]).toEqual({ x: 0, y: 0, z: 0, s: 1 })
  expect(supplied[4]).toEqual({ x: 99, y: 99, z: 99 })
})

it('records refused edits so a test can inspect the attempted changes', async () => {
  const script = await run(`
    llSetEnvironment(<-1,-1,-1>,[SKY_GAMMA,2.5]);
    llReplaceEnvironment(<-1,-1,-1>,"missing",-1,-1,-1);
    llModifyLand(LAND_LEVEL,LAND_BRUSH_SMALL);
    llSetGroundTexture([TERRAIN_DETAIL_1,"missing"]);
    result = llGetEnvironment(ZERO_VECTOR,[SKY_GAMMA]);
  `, { environment: { 5: [1.5] } })
  expect(script.calls.filter(c => c.name === 'llSetEnvironment')).toMatchObject([
    { args: [{ x: -1, y: -1, z: -1 }, [5, 2.5]], returned: -9 },
  ])
  expect(script.calls.filter(c => c.name === 'llReplaceEnvironment')).toMatchObject([
    { args: [{ x: -1, y: -1, z: -1 }, 'missing', -1, -1, -1], returned: -9 },
  ])
  expect(script.calls.filter(c => c.name === 'llModifyLand')).toMatchObject([{ args: [0, 0] }])
  expect(script.calls.filter(c => c.name === 'llSetGroundTexture')).toMatchObject([{ args: [[0, 'missing']], returned: 0 }])
  expect(script.global('result')).toEqual([1.5])
})

const OWNER = '11111111-2222-3333-4444-555555555555'
const TEXTURE = 'aaaaaaaa-0000-0000-0000-000000000001'
const SETTING = 'aaaaaaaa-0000-0000-0000-000000000002'

interface Fixture {
  readonly settings?: RegionSettings
  readonly estate?: boolean
  readonly parcelOwner?: string
  readonly inventory?: readonly InventoryItem[]
}

async function edit(body: string, { settings = {}, estate = true, parcelOwner, inventory = [] }: Fixture = {}) {
  const world = new World({ startUnixTime: 1234.25 })
  world.addRegion('Sandbox', { x: 0, y: 0 }, { ...settings, ...(estate ? { estateManagers: [OWNER] } : {}) })
  const parcel = parcelOwner === undefined ? undefined
    : world.addParcel({ region: 'Sandbox', owner: parcelOwner, bounds: { min: { x: 0, y: 0 }, max: { x: 64, y: 64 } } })
  const loaded = await loadLinkset({ world, region: 'Sandbox', owner: OWNER, position: { x: 10, y: 10, z: 30 }, prims: [{
    inventory: [...inventory],
    scripts: [{ name: 'p', source: { source: `list result; default { state_entry() { ${body} } }` } }],
  }] })
  loaded.scripts.p!.start()
  return { script: loaded.scripts.p!, region: world.region('Sandbox'), parcel }
}

const texture = makeInventoryItem({ name: 'stars', type: InventoryType.TEXTURE, key: TEXTURE })
const setting = (environment: EnvironmentAsset) => makeInventoryItem({ name: 'dusk', type: InventoryType.SETTING, key: SETTING, environment })

describe('llSetEnvironment with estate rights', () => {
  // Wiki: an estate manager may change the whole region with <-1, -1, z>.
  it('overrides a parameter on every track and reports ENV_OK', async () => {
    const { script } = await edit(`
      result += llSetEnvironment(<-1,-1,-1>, [SKY_GAMMA, 2.5]);
      result += llGetEnvironment(<-1,-1,0>, [SKY_GAMMA]) + llGetEnvironment(<10,10,2500>, [SKY_GAMMA]);
    `)
    expect(script.global('result')).toEqual([1, 2.5, 2.5])
  })

  // Wiki: z picks the sky track by altitude; a track's own override beats the all-tracks slot.
  it('lets a single track override win over the all-tracks slot', async () => {
    const { script } = await edit(`
      llSetEnvironment(<-1,-1,1500>, [SKY_GAMMA, 7.0]);
      llSetEnvironment(<-1,-1,-1>, [SKY_GAMMA, 3.0]);
      result = llGetEnvironment(<-1,-1,500>, [SKY_GAMMA]) + llGetEnvironment(<-1,-1,1500>, [SKY_GAMMA])
        + llGetEnvironment(<-1,-1,2500>, [SKY_GAMMA]);
    `)
    expect(script.global('result')).toEqual([3, 7, 3])
  })

  it('picks tracks from the configured SKY_TRACKS altitudes and keeps water rules on the water track', async () => {
    const { script } = await edit(`
      llSetEnvironment(<-1,-1,150>, [SKY_GAMMA, 4.0, WATER_BLUR_MULTIPLIER, 0.25]);
      result = llGetEnvironment(<-1,-1,50>, [SKY_GAMMA, WATER_BLUR_MULTIPLIER])
        + llGetEnvironment(<-1,-1,150>, [SKY_GAMMA, WATER_BLUR_MULTIPLIER]);
    `, { settings: { environment: { 15: [100, 200, 300] } } })
    expect(script.global('result')).toEqual([1, 0.25, 4, 0.25])
  })

  it('keeps the latest water override whatever z it was set with', async () => {
    const { script } = await edit(`
      llSetEnvironment(<-1,-1,100>, [WATER_BLUR_MULTIPLIER, 0.125]);
      llSetEnvironment(<-1,-1,-1>, [WATER_BLUR_MULTIPLIER, 0.25]);
      result = llGetEnvironment(<-1,-1,0>, [WATER_BLUR_MULTIPLIER]) + llGetEnvironment(<-1,-1,2500>, [WATER_BLUR_MULTIPLIER]);
    `)
    expect(script.global('result')).toEqual([0.25, 0.25])
  })

  // Wiki: SKY_SUN takes rotation, scale and colour; the getter adds texture flag, direction and lighting.
  it('moves the sun that the sun reads and SKY_SUN report', async () => {
    const { script } = await edit(`
      result += llSetEnvironment(<-1,-1,-1>, [SKY_SUN, <0,0,1,0>, 2.0, <1,0.5,0>]);
      result += [llGetSunRotation(), llGetRegionSunDirection()] + llGetEnvironment(<-1,-1,0>, [SKY_SUN]);
    `)
    expect((script.global('result') as unknown[]).slice(0, 8)).toEqual([1, { x: 0, y: 0, z: 1, s: 0 }, { x: -1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1, s: 0 }, 2, { x: 1, y: 0.5, z: 0 }, 1, { x: -1, y: 0, z: 0 }])
  })

  it('clears the texture-default flags when a texture rule names a texture', async () => {
    const { script } = await edit(`
      result += llSetEnvironment(<-1,-1,-1>, [SKY_SUN_TEXTURE, "stars", SKY_MOON_TEXTURE, "${TEXTURE}",
        SKY_CLOUD_TEXTURE, "stars", WATER_NORMAL_TEXTURE, "stars"]);
      list sun = llGetEnvironment(<-1,-1,0>, [SKY_SUN]); list moon = llGetEnvironment(<-1,-1,0>, [SKY_MOON]);
      list clouds = llGetEnvironment(<-1,-1,0>, [SKY_CLOUDS]);
      result += [llList2Integer(sun, 3), llList2Integer(moon, 3), llList2Integer(clouds, 7)]
        + llGetEnvironment(<-1,-1,0>, [WATER_TEXTURE_DEFAULTS, SKY_TEXTURE_DEFAULTS]);
    `, { inventory: [texture] })
    // Wiki (llGetEnvironment): SKY_TEXTURE_DEFAULTS covers bloom, halo and rainbow, which these rules don't set.
    expect(script.global('result')).toEqual([1, 0, 0, 0, 0, 0, 1, 1, 1])
  })

  // The wiki doesn't say what a bad list does; nothing from it is applied.
  it.each([
    ['[999]', -5], ['[SKY_GAMMA]', -5], ['[SKY_GAMMA, "2"]', -5], ['[5.0, 2.0]', -5],
    ['[SKY_GAMMA, 21.0]', -6], ['[SKY_GAMMA, 2.0, SKY_GLOW, 0.1, 0.0]', -6],
    ['[SKY_CLOUDS, <1,1,1>, 0.5, 0.0, 0.5, <0,0,0>, <1,1,1>, <1,1,1>]', -6],
    ['[WATER_WAVE_DIRECTION, <21,0,0>, <0,0,0>]', -6], ['[SKY_SUN_TEXTURE, "missing"]', -3],
  ])('rejects %s with %i and applies none of it', async (rules, code) => {
    const { script } = await edit(`
      result += llSetEnvironment(<-1,-1,-1>, ${rules});
      result += llGetEnvironment(<-1,-1,0>, [SKY_GAMMA]);
    `, { settings: { environment: { 5: [1.5] } } })
    expect(script.global('result')).toEqual([code, 1.5])
  })

  it('accepts integers for floats', async () => {
    const { script } = await edit(`
      result += llSetEnvironment(<-1,-1,-1>, [SKY_GAMMA, 3, WATER_FOG, <0,0,1>, 2, 4]);
      result += llGetEnvironment(<-1,-1,0>, [SKY_GAMMA, WATER_FOG]);
    `)
    expect(script.global('result')).toEqual([1, 3, { x: 0, y: 0, z: 1 }, 2, 4])
  })

  // Wiki: an empty list removes every modification from earlier calls.
  it('removes every override with an empty list', async () => {
    const { script, region } = await edit(`
      llSetEnvironment(<-1,-1,-1>, [SKY_GAMMA, 3.0]);
      llSetEnvironment(<-1,-1,1500>, [SKY_GAMMA, 4.0]);
      result += llSetEnvironment(<-1,-1,-1>, []);
      result += llGetEnvironment(<-1,-1,0>, [SKY_GAMMA]) + llGetEnvironment(<-1,-1,1500>, [SKY_GAMMA]);
    `, { settings: { environment: { 5: [1.5] } } })
    expect(script.global('result')).toEqual([1, 1.5, 1.5])
    expect(region.environmentChanges.overrides.size).toBe(0)
  })

  // Wiki: a parcel must already have an environment before it can be changed.
  it('lets a parcel owner change only a parcel that has its own environment', async () => {
    const { script } = await edit(`
      result += llSetEnvironment(<10,10,-1>, [SKY_GAMMA, 3.0]);
      result += llReplaceEnvironment(<10,10,0>, "dusk", -1, -1, -1);
      result += llSetEnvironment(<10,10,-1>, [SKY_GAMMA, 3.0]);
      result += llGetEnvironment(<10,10,0>, [SKY_GAMMA]) + llGetEnvironment(<-1,-1,0>, [SKY_GAMMA])
        + llGetEnvironment(<100,100,0>, [SKY_GAMMA]);
    `, { estate: false, parcelOwner: OWNER, inventory: [setting({ environment: { 5: [9] } })] })
    expect(script.global('result')).toEqual([-3, 1, 1, 3, 1, 1])
  })

  it('refuses a parcel the owner does not own and the region without estate rights', async () => {
    const { script } = await edit(`
      result += llSetEnvironment(<10,10,-1>, [SKY_GAMMA, 3.0]);
      result += llSetEnvironment(<-1,-1,-1>, [SKY_GAMMA, 3.0]);
    `, { estate: false, parcelOwner: TEXTURE })
    expect(script.global('result')).toEqual([-9, -9])
  })
})

describe('llReplaceEnvironment with estate rights', () => {
  const dusk = setting({ environment: { 5: [9], 101: [{ x: 0, y: 0, z: 1 }, 2, 3] }, sunRotation: { x: 1, y: 0, z: 0, s: 0 } })

  // Wiki example: replace every track and set a day of length and offset.
  it('applies a settings item to every track with a new day', async () => {
    const { script } = await edit(`
      result += llReplaceEnvironment(<-1,-1,-1>, "dusk", -1, 3600, 0);
      result += llGetEnvironment(<-1,-1,0>, [SKY_GAMMA, WATER_FOG]) + llGetEnvironment(<-1,-1,2500>, [SKY_GAMMA]);
      result += [llGetRegionDayLength(), llGetRegionDayOffset(), llGetDayLength(), llGetRegionTimeOfDay(), llGetSunRotation()];
    `, { inventory: [dusk] })
    expect(script.global('result')).toEqual([1, 9, { x: 0, y: 0, z: 1 }, 2, 3, 9, 3600, 0, 3600, 1234.25, { x: 1, y: 0, z: 0, s: 0 }])
  })

  // Wiki: -1 (or any negative offset) leaves the day unchanged.
  it('leaves the day alone for negative day values and accepts the item key', async () => {
    const { script } = await edit(`
      result += llReplaceEnvironment(<-1,-1,-1>, "${SETTING}", 2, -1, -5);
      result += llGetEnvironment(<-1,-1,0>, [SKY_GAMMA]) + llGetEnvironment(<-1,-1,1500>, [SKY_GAMMA]);
      result += [llGetRegionDayLength(), llGetRegionDayOffset()];
    `, { inventory: [dusk], settings: { dayLength: 1000, dayOffset: 100, environment: { 5: [1.5] } } })
    expect(script.global('result')).toEqual([1, 1.5, 9, 1000, 100])
  })

  // Wiki: llSetEnvironment overrides survive a replacement.
  it('keeps earlier overrides', async () => {
    const { script } = await edit(`
      llSetEnvironment(<-1,-1,-1>, [SKY_GAMMA, 3.0]);
      llReplaceEnvironment(<-1,-1,-1>, "dusk", -1, -1, -1);
      result = llGetEnvironment(<-1,-1,0>, [SKY_GAMMA, WATER_FOG]);
    `, { inventory: [dusk] })
    expect(script.global('result')).toEqual([3, { x: 0, y: 0, z: 1 }, 2, 3])
  })

  // Wiki: "" or NULL_KEY removes the environment; removing track 0 or 1 is refused.
  it('removes a sky track but refuses to remove the water and ground tracks', async () => {
    const { script } = await edit(`
      llReplaceEnvironment(<-1,-1,-1>, "dusk", -1, -1, -1);
      result += [llReplaceEnvironment(<-1,-1,-1>, "", 2, -1, -1), llReplaceEnvironment(<-1,-1,-1>, NULL_KEY, 0, -1, -1),
        llReplaceEnvironment(<-1,-1,-1>, "", 1, -1, -1)];
      result += llGetEnvironment(<-1,-1,0>, [SKY_GAMMA]) + llGetEnvironment(<-1,-1,1500>, [SKY_GAMMA]);
    `, { inventory: [dusk], settings: { environment: { 5: [1.5] } } })
    expect(script.global('result')).toEqual([1, -9, -9, 9, 1.5])
  })

  // In-world: removing track 0 or 1 without rights -> -9 and no debug message
  // (Aditi, SLua Tideland, 2026-11-04); the permission check comes first.
  it('refuses removal of tracks 0 and 1 without rights', async () => {
    const { script } = await edit(`
      result += [llReplaceEnvironment(<-1,-1,-1>, "", 0, -1, -1), llReplaceEnvironment(<10,10,0>, "", 1, -1, -1)];
    `, { estate: false })
    expect(script.global('result')).toEqual([-9, -9])
    expect(script.chat).toEqual([])
  })

  // Wiki: a missing inventory item gives ENV_NO_ENVIRONMENT; a key that isn't
  // an environment still returns ENV_OK. The wiki has no code for a track
  // outside -1 to 4, so it is refused with ENV_INVALID_RULE and changes nothing.
  it('handles missing items, unknown keys and unknown tracks', async () => {
    const { script, region } = await edit(`
      result += [llReplaceEnvironment(<-1,-1,-1>, "missing", -1, 3600, 0),
        llReplaceEnvironment(<-1,-1,-1>, "${TEXTURE}", -1, 3600, 0),
        llReplaceEnvironment(<-1,-1,-1>, "dusk", 5, 3600, 0), llGetRegionDayLength()];
    `, { inventory: [dusk, texture] })
    expect(script.global('result')).toEqual([-3, 1, -5, 14400])
    expect(region.environmentChanges.tracks.size).toBe(0)
  })

  it('gives a parcel its own environment and day, then removes it', async () => {
    const { script, parcel } = await edit(`
      result += llReplaceEnvironment(<10,10,0>, "dusk", -1, 3600, 0);
      result += [llGetDayLength(), llGetRegionDayLength()] + llGetEnvironment(llGetPos(), [SKY_GAMMA]);
      result += llReplaceEnvironment(<10,10,0>, "", -1, -1, -1);
      result += [llGetDayLength()] + llGetEnvironment(llGetPos(), [SKY_GAMMA]);
    `, { estate: false, parcelOwner: OWNER, inventory: [dusk], settings: { environment: { 5: [1.5] } } })
    expect(script.global('result')).toEqual([1, 3600, 14400, 9, 1, 14400, 1.5])
    expect(parcel!.environmentChanges!.tracks.size).toBe(0)
  })

  // Wiki: overrides survive llReplaceEnvironment; llSetEnvironment with [] clears them.
  it('keeps a parcel\'s overrides through removal and brings them back with the next environment', async () => {
    const { script } = await edit(`
      llReplaceEnvironment(<10,10,0>, "dusk", -1, -1, -1);
      llSetEnvironment(<10,10,-1>, [SKY_GAMMA, 3.0]);
      result += llReplaceEnvironment(<10,10,0>, "", -1, -1, -1);
      result += llGetEnvironment(<10,10,0>, [SKY_GAMMA]);
      result += llSetEnvironment(<10,10,-1>, [SKY_GAMMA, 4.0]);
      result += llReplaceEnvironment(<10,10,0>, "dusk", -1, -1, -1);
      result += llGetEnvironment(<10,10,0>, [SKY_GAMMA]);
    `, { estate: false, parcelOwner: OWNER, inventory: [dusk], settings: { environment: { 5: [1.5] } } })
    expect(script.global('result')).toEqual([1, 1.5, -3, 1, 3])
  })

  it('accepts removal on a parcel that has no environment', async () => {
    const { script, parcel } = await edit('result += llReplaceEnvironment(<10,10,0>, "", 2, -1, -1);',
      { estate: false, parcelOwner: OWNER })
    expect(script.global('result')).toEqual([1])
    expect(parcel!.environmentChanges).toBeUndefined()
  })
})
