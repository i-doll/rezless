import { describe, it, expect } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

const OWNER = '11111111-1111-1111-1111-111111111111'

// Lists from mocks carry no LSL element types. Rule and selector parsers read
// a whole number there as an integer.
describe('untyped rule lists', () => {
  it('reads whole numbers in mocked lists as integers', async () => {
    const world = new World({ startUnixTime: 1234.25 })
    world.addRegion('Sandbox', { x: 0, y: 0 }, { estateManagers: [OWNER] })
    const { scripts } = await loadLinkset({ world, region: 'Sandbox', owner: OWNER, position: { x: 10, y: 10, z: 30 }, prims: [{
      scripts: [{ name: 'p', source: { source: `default { state_entry() {
        llOwnerSay(llList2CSV(llGetObjectDetails(llGetKey(), llCSV2List("details"))));
        llOwnerSay((string)llGetListLength(llGetEnvironment(llGetPos(), llCSV2List("environment"))));
        llOwnerSay((string)llSetEnvironment(<-1, -1, -1>, llCSV2List("environment")));
        llOwnerSay((string)llSetGroundTexture(llCSV2List("environment")));
        llRezObjectWithParams("missing", llCSV2List("rez"));
      } }` } }],
    }] })
    const s = scripts['p']!
    const lists: Record<string, unknown[]> = {
      // A name selector, then a fraction and a string, which aren't selectors.
      details: [1, 1.5, 'x'],
      // A fraction where a rule id belongs.
      environment: [1.5],
      // REZ_FLAGS with an integer value.
      rez: [1, 0],
    }
    s.mock('llCSV2List', (_ctx, args) => lists[args[0] as string])
    s.start()
    expect(s.chat.map((c) => c.text)).toEqual(['-1', '0', '-5', '0', "Could not find object 'missing'."])
  })
})
