import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

const OWNER = '11111111-1111-1111-1111-111111111111'
const source = `key target; list result; list types;
 default { touch_start(integer n) {
 result=llGetObjectDetails(target,[OBJECT_ATTACHED_POINT,OBJECT_TEMP_ATTACHED]);
 types=[llGetListEntryType(result,0),llGetListEntryType(result,1)];
 } }`

async function fixture() {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ key: OWNER, region: 'home', username: 'wearer' })
  const worn = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [
    { scripts: [{ name: 'root', source: { source } }] },
    { scripts: [{ name: 'child', source: { source } }] },
  ] })
  const observer = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [
    { scripts: [{ name: 'observer', source: { source } }] },
  ] })
  const readers = [worn.scripts.root!, worn.scripts.child!, observer.scripts.observer!]
  readers.forEach(s => s.start())
  function read(expected: number[], childExpected = expected) {
    for (const reader of readers) for (const prim of worn.linkset.prims) {
      reader.setGlobal('target', prim.key)
      reader.fire('touch_start', { num_detected: 1 })
      expect(reader.global('result')).toEqual(prim === worn.linkset.prims[0] ? expected : childExpected)
      expect(reader.global('types')).toEqual([1, 1])
    }
  }
  return { ...worn, read }
}

// https://wiki.secondlife.com/wiki/OBJECT_ATTACHED_POINT
// https://wiki.secondlife.com/wiki/LlGetObjectDetails
// In-world: rezzed root/child -> [0, 0]; Spine -> [9, 0]; HUD Center -> [35, 0].
// Temporary Left Hand root -> [5, 1], child -> [5, 0], from the root,
// child and external observer (Aditi, SLua Tideland, Firestorm 7.3.0.83011, 2026-11-01).
describe('object attachment details', () => {
  it('returns integer zeroes for an unworn rezzed root and child', async () => {
    const f = await fixture()
    f.read([0, 0])
  })
  it.each([9, 35])('reads normal attachments on point %i from root, child and observer', async point => {
    const f = await fixture()
    f.linkset.attachToAvatar(OWNER, point)
    f.read([point, 0])
  })
  it('reads the point and temporary flag for a temporary attachment', async () => {
    const f = await fixture()
    f.linkset.attachToAvatar(OWNER, 5, true)
    f.read([5, 1], [5, 0])
  })
})
