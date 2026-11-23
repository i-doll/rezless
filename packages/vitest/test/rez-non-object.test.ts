import { describe, it, expect } from 'vitest'
import { loadLinkset, makeInventoryItem, InventoryType, NULL_KEY, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlRezObject, LlRezAtRoot and LlRezObjectWithParams.
//
// Measured on the Aditi beta grid, SLua Tideland, 2026-11-23. A probe prim held one item of
// each type below and called each rez function on it 6 s apart, timed with llGetTime; a second
// prim relayed everything it heard on DEBUG_CHANNEL, and the owner's chat was read from the viewer.
const DEBUG_CHANNEL = 2147483647
const KEY = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/

async function rez(call: string, item: ReturnType<typeof makeInventoryItem>) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const { scripts } = await loadLinkset({ world, region: 'home', position: { x: 100, y: 100, z: 30 }, prims: [{
    inventory: [item],
    scripts: [{ name: 's', source: { source: `key result = "unset"; float took; integer rezzed;
      default {
        state_entry() { llResetTime(); ${call}; took = llGetTime(); }
        object_rez(key id) { ++rezzed; }
      }` } }],
  }] })
  scripts.s!.start()
  scripts.s!.linkset.advanceTime(10_000)
  return {
    result: scripts.s!.global('result'), took: scripts.s!.global('took'), rezzed: scripts.s!.global('rezzed'),
    objects: world.linksets.length,
    errors: scripts.s!.chat.filter(c => c.channel === DEBUG_CHANNEL).map(c => c.text),
  }
}

const calls = [
  ['llRezObject', 'llRezObject("thing", llGetPos(), ZERO_VECTOR, ZERO_ROTATION, 7)'],
  ['llRezAtRoot', 'llRezAtRoot("thing", llGetPos(), ZERO_VECTOR, ZERO_ROTATION, 7)'],
  ['llRezObjectWithParams', 'result = llRezObjectWithParams("thing", [REZ_PARAM, 7])'],
]

describe('rezzing an item that is not an object', () => {
  // In-world: a texture, sound, landmark, clothing, a notecard with text, body part, animation,
  // gesture, script (another and the calling one), environment setting and material each took
  // 0.110-0.112 s, said nothing, rezzed nothing and gave no object_rez; llRezObjectWithParams
  // returned a fresh key for each.
  const types = [
    ['texture', InventoryType.TEXTURE], ['sound', InventoryType.SOUND], ['landmark', InventoryType.LANDMARK],
    ['clothing', InventoryType.CLOTHING], ['body part', InventoryType.BODYPART], ['animation', InventoryType.ANIMATION],
    ['gesture', InventoryType.GESTURE], ['script', InventoryType.SCRIPT], ['setting', InventoryType.SETTING],
    ['material', InventoryType.MATERIAL],
  ] as const
  it.each(calls.flatMap(([fn, call]) => types.map(([type, value]) => [fn, type, call, value] as const)))(
    '%s of a %s takes the usual 0.1 s and says nothing', async (fn, _type, call, type) => {
      const got = await rez(call, makeInventoryItem({ name: 'thing', type, key: '11111111-2222-3333-4444-555555555555' }))
      expect(got).toMatchObject({ took: expect.closeTo(0.1, 3), rezzed: 0, objects: 1, errors: [] })
      expect(got.result).toMatch(fn === 'llRezObjectWithParams' ? KEY : /^unset$/)
      expect(got.result).not.toBe(NULL_KEY)
    })

  it.each(calls)('%s of a notecard with text takes the usual 0.1 s and says nothing', async (fn, call) => {
    const got = await rez(call, makeInventoryItem({ name: 'thing', type: InventoryType.NOTECARD, notecardLines: ['x'], key: '11111111-2222-3333-4444-555555555555' }))
    expect(got).toMatchObject({ took: expect.closeTo(0.1, 3), rezzed: 0, objects: 1, errors: [] })
    if (fn === 'llRezObjectWithParams') expect(got.result).toMatch(KEY)
    expect(got.result).not.toBe(NULL_KEY)
  })

  it.each(calls)('%s of the calling script takes the usual 0.1 s and says nothing', async (fn, call) => {
    const got = await rez(call.replace('"thing"', 'llGetScriptName()'), makeInventoryItem({ name: 'thing', type: InventoryType.TEXTURE }))
    expect(got).toMatchObject({ took: expect.closeTo(0.1, 3), rezzed: 0, objects: 1, errors: [] })
    if (fn === 'llRezObjectWithParams') expect(got.result).toMatch(KEY)
    expect(got.result).not.toBe(NULL_KEY)
  })

  // In-world: a new notecard that was never saved (llGetInventoryKey NULL_KEY) said
  // "Could not find object '<name>'." on DEBUG_CHANNEL, heard by the listener, took 1.110-1.134 s,
  // and llRezObjectWithParams returned "", as for a missing item.
  it.each(calls)('%s of an empty notecard is refused as a missing object', async (fn, call) => {
    const got = await rez(call, makeInventoryItem({ name: 'thing', type: InventoryType.NOTECARD }))
    expect(got).toMatchObject({ took: expect.closeTo(1.1, 3), rezzed: 0, objects: 1, errors: ["Could not find object 'thing'."] })
    if (fn === 'llRezObjectWithParams') expect(got.result).toBe('')
  })
})
