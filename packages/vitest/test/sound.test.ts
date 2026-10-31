import { it, expect } from 'vitest'
import { loadLinkset, InventoryType, makeInventoryItem } from '../src/index.js'

// https://wiki.secondlife.com/wiki/llLoopSound
it('records an attached looping sound on its prim', async () => {
  const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 'p', source: { source: `default { state_entry() { llLoopSound("00000000-0000-0000-0000-000000000001", 0.5); } }` } }] }] })
  scripts.p!.start()
  expect(linkset.prims[0]).toHaveProperty('sound.current', {
    sound: '00000000-0000-0000-0000-000000000001', volume: 0.5, loop: true, sync: 'none',
  })
})

const ID = '00000000-0000-0000-0000-000000000001'
const source = (body: string) => ({ name: 'p', source: { source: `default { state_entry() { ${body} } }` } })
async function run(body: string) {
  const loaded = await loadLinkset({ prims: [{ scripts: [source(body)] }] })
  loaded.scripts.p!.start()
  loaded.scripts.p!.advanceTime(2000)
  return loaded
}

// https://wiki.secondlife.com/wiki/llPlaySound and llPlaySoundSlave;
// https://wiki.secondlife.com/wiki/llLoopSoundMaster and llLoopSoundSlave.
it.each([
  ['llPlaySound', false, 'none'], ['llPlaySoundSlave', false, 'slave'],
  ['llLoopSound', true, 'none'], ['llLoopSoundMaster', true, 'master'],
  ['llLoopSoundSlave', true, 'slave'],
])('%s records its playback mode', async (fn, loop, sync) => {
  const { prims } = await run(`${fn}("${ID}", 0.25);`)
  expect(prims[0]).toHaveProperty('sound.current', { sound: ID, volume: 0.25, loop, sync })
})

// https://wiki.secondlife.com/wiki/llTriggerSoundLimited
it('keeps one-shot triggers separate from stopped attached sounds', async () => {
  const { prims } = await run(`llLoopSound("${ID}",1.0); llTriggerSound("${ID}",0.25); llTriggerSoundLimited("${ID}",0.5,<10,20,30>,<1,2,3>); llStopSound();`)
  expect(prims[0]).toHaveProperty('sound.current', null)
  expect(prims[0]).toHaveProperty('sound.triggers', [
    { sound: ID, volume: 0.25, position: { x: 0, y: 0, z: 0 } },
    { sound: ID, volume: 0.5, position: { x: 0, y: 0, z: 0 }, topNorthEast: { x: 10, y: 20, z: 30 }, bottomSouthWest: { x: 1, y: 2, z: 3 } },
  ])
})

// https://wiki.secondlife.com/wiki/llSetSoundQueueing and llSetSoundRadius
// In-world: radius -5 and 2000 were accepted without errors; no sound/radius
// readback exists in LSL or these MCP tools. Radius records the requested value.
// This is a request recorder, without audio duration, queue playback or audibility.
it('retains queueing and radius when stopping playback', async () => {
  const { prims } = await run(`llSetSoundQueueing(2); llSetSoundRadius(8.0); llLoopSound("${ID}",0.7); llStopSound();`)
  expect(prims[0]).toHaveProperty('sound.queueing', true)
  expect(prims[0]).toHaveProperty('sound.radius', 8)
})

// https://wiki.secondlife.com/wiki/llPreloadSound
it('records preloads without replacing playback', async () => {
  const { prims } = await run(`llLoopSound("${ID}",0.7); llPreloadSound("${ID}");`)
  expect(prims[0]).toHaveProperty('sound.preloads', [ID])
  expect(prims[0]).toHaveProperty('sound.current.sound', ID)
})

// https://wiki.secondlife.com/wiki/llLinkPlaySound
it.each([
  [-1, [true, true, true]], [-2, [true, false, true]], [-3, [false, true, true]],
  [-4, [false, true, false]], [1, [true, false, false]], [3, [false, false, true]],
  [99, [false, false, false]],
])('addresses link target %s from a child', async (target, want) => {
  const { prims, scripts } = await loadLinkset({ prims: [{}, { scripts: [source(`llLinkPlaySound(${target},"${ID}",0.5,SOUND_LOOP);`)] }, {}] })
  scripts.p!.start()
  prims.forEach((prim, i) => expect(prim).toHaveProperty('sound.current', want[i] ? { sound: ID, volume: 0.5, loop: true, sync: 'none' } : null))
})

// https://wiki.secondlife.com/wiki/llAdjustSoundVolume
// In-world: gain -2 and adjustment 3 produced no errors. Effective gain is not
// exposed by LSL or the headless MCP tools, so the recording uses the wiki range.
it('bounds recorded volume to the documented range and adjusts only attached playback', async () => {
  const { prims } = await run(`llLoopSound("${ID}",-2.0); llTriggerSound("${ID}",5.0); llAdjustSoundVolume(7.0);`)
  expect(prims[0]).toHaveProperty('sound.current.volume', 1)
  expect(prims[0]).toHaveProperty('sound.triggers.0.volume', 1)
})

it('applies link settings and stop to the selected prims', async () => {
  const { prims, scripts } = await loadLinkset({ prims: [{ scripts: [source(`
    llLinkPlaySound(LINK_SET,"${ID}",0.5,SOUND_LOOP);
    llLinkSetSoundRadius(LINK_ALL_CHILDREN,8.0);
    llLinkSetSoundQueueing(LINK_ALL_CHILDREN,TRUE);
    llLinkAdjustSoundVolume(2,0.25);
    llLinkStopSound(3);
  `)] }, {}, {}] })
  scripts.p!.start()
  scripts.p!.advanceTime(100)
  expect(prims[0]).toHaveProperty('sound.radius', 0)
  expect(prims[1]).toHaveProperty('sound.radius', 8)
  expect(prims[1]).toHaveProperty('sound.queueing', true)
  expect(prims[1]).toHaveProperty('sound.current.volume', 0.25)
  expect(prims[2]).toHaveProperty('sound.current', null)
})

it('lets SOUND_TRIGGER override looping and synchronization flags', async () => {
  const { prims } = await run(`llLinkPlaySound(LINK_THIS,"${ID}",0.5,SOUND_LOOP|SOUND_SYNC|SOUND_TRIGGER);`)
  expect(prims[0]).toHaveProperty('sound.current', null)
  expect(prims[0]).toHaveProperty('sound.triggers.0.sound', ID)
})

// In-world: probe issue-160 sound, Aditi / SLua Tideland, 2026-10-31:
// missing, empty, NULL_KEY and wrong-type script names all report this error.
it.each(['llPlaySound', 'llLoopSound', 'llLoopSoundMaster', 'llLoopSoundSlave', 'llPlaySoundSlave', 'llTriggerSound', 'llTriggerSoundLimited', 'llPreloadSound'])('%s rejects missing inventory sounds', async (fn) => {
  const args = fn === 'llPreloadSound' ? '' : fn === 'llTriggerSoundLimited' ? ',0.5,<1,1,1>,ZERO_VECTOR' : ',0.5'
  const { scripts, prims } = await run(`${fn}("missing160"${args});`)
  expect(scripts.p!.chat.map(c => c.text)).toContain("Could not find sound 'missing160'.")
  expect(prims[0]).toHaveProperty('sound.current', null)
  expect(prims[0]).toHaveProperty('sound.triggers', [])
  expect(prims[0]).toHaveProperty('sound.preloads', [])
})

it.each(['', '00000000-0000-0000-0000-000000000000', 'p'])('rejects sound %j without replacing an attached sound', async (name) => {
  const { scripts, prims } = await run(`llLoopSound("${ID}",0.5); llPlaySound("${name}",1.0);`)
  expect(scripts.p!.chat.map(c => c.text)).toContain(`Could not find sound '${name}'.`)
  expect(prims[0]).toHaveProperty('sound.current.sound', ID)
})

// In-world: Switch 09 / caae27c6-6dd3-495e-9cc2-a3f94cb60568 worked;
// SWITCH 09 errored. Root -> child succeeded; child -> root could not resolve
// the root's sound. Aditi, SLua Tideland, 2026-10-31, probe issue-160 sound/child.
it('resolves exact names in the caller inventory for link playback', async () => {
  const { prims, scripts } = await loadLinkset({ prims: [
    { inventory: [makeInventoryItem({ name: 'Switch 09', type: InventoryType.SOUND, key: ID })], scripts: [source(`llLinkPlaySound(2,"Switch 09",0.5,SOUND_LOOP); llPlaySound("SWITCH 09",0.5);`)] },
    { scripts: [{ name: 'child', source: { source: `default { touch_start(integer n) { llLinkPlaySound(1,"Switch 09",0.5,0); } }` } }] },
  ] })
  scripts.p!.start()
  expect(prims[1]).toHaveProperty('sound.current.sound', ID)
  expect(scripts.p!.chat.map(c => c.text)).toContain("Could not find sound 'SWITCH 09'.")
  scripts.child!.start()
  scripts.child!.fire('touch_start', { total_number: 1 })
  expect(scripts.child!.chat.map(c => c.text)).toContain("Could not find sound 'Switch 09'.")
  expect(prims[0]).toHaveProperty('sound.current', null)
})

// In-world: missing160 on LINK_SET emitted one error, and childmissing160 on
// link 99 also emitted one. Resolution happens before target selection.
it('validates names once even with multiple or nonexistent link targets', async () => {
  const { scripts } = await run('llLinkPlaySound(LINK_SET,"missing160",1.0,0); llLinkPlaySound(99,"missing160",1.0,0);')
  expect(scripts.p!.chat.map(c => c.text)).toEqual(["Could not find sound 'missing160'.", "Could not find sound 'missing160'."])
})

it.each([[-5, -5], [0, 0], [2000, 2000]])('records requested radius %s without inventing an effective cutoff', async (radius, want) => {
  const { prims } = await run(`llSetSoundRadius(8.0); llSetSoundRadius(${radius}.0);`)
  expect(prims[0]).toHaveProperty('sound.radius', want)
})

it('captures trigger positions before the prim moves', async () => {
  const { prims } = await run(`llSetPos(<1,2,3>); llTriggerSound("${ID}",0.5); llSetPos(<2,3,4>);`)
  expect(prims[0]).toHaveProperty('sound.triggers.0.position', { x: 1, y: 2, z: 3 })
})

it('does not invent playback when adjusting an idle prim', async () => {
  const { prims } = await run('llAdjustSoundVolume(0.5); llLinkAdjustSoundVolume(LINK_THIS,0.5);')
  expect(prims[0]).toHaveProperty('sound.current', null)
})

it('keeps prim settings across script resets and shares them between scripts', async () => {
  const { prims, scripts } = await loadLinkset({ prims: [{ scripts: [
    { name: 'p', source: { source: 'default { touch_start(integer n) { llSetSoundRadius(8.0); llSetSoundQueueing(TRUE); } }' } },
    { name: 'other', source: { source: `default { state_entry() { llLoopSound("${ID}",0.5); } }` } },
  ] }] })
  scripts.p!.start()
  scripts.p!.fire('touch_start', { total_number: 1 })
  scripts.p!.reset()
  scripts.other!.start()
  expect(prims[0]).toHaveProperty('sound.radius', 8)
  expect(prims[0]).toHaveProperty('sound.queueing', true)
  expect(prims[0]).toHaveProperty('sound.current.sound', ID)
})

it('records synchronized looping link sounds', async () => {
  const { prims } = await run(`llLinkPlaySound(LINK_THIS,"${ID}",0.5,SOUND_SYNC|SOUND_LOOP);`)
  expect(prims[0]).toHaveProperty('sound.current', { sound: ID, volume: 0.5, loop: true, sync: 'slave' })
})

// https://wiki.secondlife.com/wiki/llLinkPlaySound#Link_Numbers
it('maps the documented child link-0 alias to the root', async () => {
  const { prims, scripts } = await loadLinkset({ prims: [{}, { scripts: [source(`llLinkPlaySound(0,"${ID}",0.5,0);`)] }] })
  scripts.p!.start()
  expect(prims[0]).toHaveProperty('sound.current.sound', ID)
  expect(prims[1]).toHaveProperty('sound.current', null)
})

it.each([[0, true], [1, false], [-1, true], [-2, false], [-3, false], [-4, true]])('addresses lone prim with link %s', async (link, want) => {
  const { prims } = await run(`llLinkPlaySound(${link},"${ID}",0.5,0);`)
  expect(prims[0]).toHaveProperty('sound.current', want ? { sound: ID, volume: 0.5, loop: false, sync: 'none' } : null)
})

it.each([[-2, 0], [0, 0], [0.5, 0.5], [3, 1]])('records volume %s within the documented bounds', async (gain, want) => {
  const { prims } = await run(`llPlaySound("${ID}",${gain});`)
  expect(prims[0]).toHaveProperty('sound.current.volume', want)
})

it('disables queueing again on the prim and its links', async () => {
  const { prims } = await run('llSetSoundQueueing(TRUE); llSetSoundQueueing(FALSE); llLinkSetSoundQueueing(LINK_THIS,TRUE); llLinkSetSoundQueueing(LINK_THIS,FALSE);')
  expect(prims[0]).toHaveProperty('sound.queueing', false)
})
