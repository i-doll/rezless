import { expect, it } from 'vitest'
import { loadLinkset, loadScript, World, type RegionSettings } from '../src/index.js'

// Wiki: https://wiki.secondlife.com/wiki/LlGetEnvironment,
// https://wiki.secondlife.com/wiki/LlSetEnvironment,
// https://wiki.secondlife.com/wiki/LlReplaceEnvironment,
// https://wiki.secondlife.com/wiki/LlSetGroundTexture.
// In-world probes: /tmp/issue-157-probes/{probe,followup,edges}.lsl,
// Aditi, SLua Tideland, 2026-10-31. Success on land we own/manage is not
// measurable on this parcel. These tests cover reads and permission refusals.

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
