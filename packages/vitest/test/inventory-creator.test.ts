import { describe, expect, it } from 'vitest'
import { InventoryType, Linkset, makeInventoryItem, Prim, type InventoryTypeValue } from '@rezless/vm'
import { loadLinkset, loadScript, World, type ObjectInput } from '../src/index.js'

const OWNER = 'a0000000-0000-4000-8000-000000000001'
const MAKER = 'b0000000-0000-4000-8000-000000000002'
const OTHER = 'c0000000-0000-4000-8000-000000000003'
const TARGET = 'd0000000-0000-4000-8000-000000000004'
const NULL_KEY = '00000000-0000-0000-0000-000000000000'

const READER = `
  list got;
  default {
    state_entry() {
      integer i;
      for (i = 0; i < llGetInventoryNumber(INVENTORY_ALL); ++i) {
        string name = llGetInventoryName(INVENTORY_ALL, i);
        if (llGetInventoryType(name) != INVENTORY_SCRIPT) got += [name, llGetInventoryCreator(name)];
      }
    }
  }
`

async function creators(objects: Record<string, ObjectInput>, owner: string | null = OWNER) {
  const { scripts } = await loadLinkset({ ...(owner ? { owner } : {}),
    prims: [{ objects, scripts: [{ name: 'reader', source: { source: READER } }] }] })
  scripts.reader!.start()
  return scripts.reader!.global('got')
}

async function receiverPrim(world: World) {
  const receiver = await loadLinkset({ world, region: 'home', owner: OTHER, prims: [{ key: TARGET,
    scripts: [{ name: 'drop', source: { source: 'default { state_entry() { llAllowInventoryDrop(TRUE); } }' } }] }] })
  receiver.scripts.drop!.start()
  return receiver.prims[0]!
}

function homeWorld() {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  return world
}

// https://wiki.secondlife.com/wiki/LlGetInventoryCreator
describe('llGetInventoryCreator on an object item', () => {
  // In-world: a box i doll made, taken and put in i doll's prim, read i doll
  // (Aditi, SLua Tideland, 2026-11-25).
  it('reads the owner for an object whose prims name no maker', async () => {
    expect(await creators({ box: { prims: [{}, {}] } })).toEqual(['box', OWNER])
  })

  // In-world: a box fivebot made, taken by fivebot and given to i doll, read fivebot in i doll's
  // prim (Aditi, SLua Tideland, 2026-11-25).
  it('reads the maker of an object another avatar made', async () => {
    expect(await creators({ box: { prims: [{ creator: MAKER }] } })).toEqual(['box', MAKER])
  })

  // In-world: i doll linked a box they made and a box fivebot made, then took the linkset. With
  // i doll's box as the root the item read i doll; with fivebot's box as the root it read
  // fivebot, after a Take and after a Take Copy alike. A linkset a script linked the same way
  // (i doll's root, fivebot's child) read i doll once taken (Aditi, SLua Tideland, 2026-11-25).
  it('reads the maker of the root prim when different avatars made the prims', async () => {
    expect(await creators({
      ownRoot: { prims: [{}, { creator: MAKER }] },
      makerRoot: { prims: [{ creator: MAKER }, {}] },
      pair: { prims: [{ creator: MAKER }, { creator: OTHER }] },
    })).toEqual(['makerRoot', MAKER, 'ownRoot', OWNER, 'pair', MAKER])
  })

  it('reads NULL_KEY for an unowned object whose root names no maker', async () => {
    expect(await creators({ box: { prims: [{}] } }, null)).toEqual(['box', NULL_KEY])
  })

  it('reads the root maker of a saved linkset given to makeInventoryItem', () => {
    const own = new Linkset({ owner: OWNER })
    own.addPrim(new Prim())
    own.addPrim(new Prim({ creator: MAKER }))
    const made = new Linkset({ owner: OWNER })
    made.addPrim(new Prim({ creator: MAKER }))
    made.addPrim(new Prim())
    expect(makeInventoryItem({ name: 'a', type: InventoryType.OBJECT, object: own }).creator).toBe(OWNER)
    expect(makeInventoryItem({ name: 'b', type: InventoryType.OBJECT, object: made }).creator).toBe(MAKER)
    expect(makeInventoryItem({ name: 'c', type: InventoryType.OBJECT, object: made, creator: OTHER }).creator).toBe(OTHER)
  })

  it('keeps the maker when a script gives the object to another avatar\'s prim', async () => {
    const world = homeWorld()
    const target = await receiverPrim(world)
    const giver = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{
      objects: { box: { prims: [{}] }, made: { prims: [{ creator: MAKER }] } },
      scripts: [{ name: 'giver', source: { source: `default { state_entry() {
        llGiveInventory("${TARGET}", "box"); llGiveInventory("${TARGET}", "made"); } }` } }] }] })
    giver.scripts.giver!.start()
    const reader = await loadScript({ host: target, source: READER })
    reader.start()
    expect(reader.global('got')).toEqual(['box', OWNER, 'made', MAKER])
  })

  // In-world: a prim's script rezzed i doll's box from its contents, the box linked a box fivebot
  // made as its child, and llDerezObject(DEREZ_TO_INVENTORY) saved the two-prim linkset back over
  // the item. The item still read i doll, and rezzed again as both prims
  // (Aditi, SLua Tideland, 2026-11-25).
  it('keeps the root maker when llDerezObject saves a linkset with another maker\'s child', async () => {
    const world = homeWorld()
    await loadLinkset({ world, region: 'home', owner: OWNER, position: { x: 100, y: 100, z: 30 },
      prims: [{ key: TARGET, creator: MAKER }] })
    const rezzer = await loadLinkset({ world, region: 'home', owner: OWNER, autoGrantPermissions: () => true,
      position: { x: 100, y: 101, z: 30 }, prims: [{
        objects: { box: { prims: [{ scripts: [{ name: 'linker', source: { source: `default {
          on_rez(integer p) { llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
          run_time_permissions(integer p) { llCreateLink("${TARGET}", TRUE); }
        }` } }] }] } },
        scripts: [{ name: 'rezzer', source: { source: `
          key rezzed; integer saved; key creator;
          default {
            state_entry() { llRezObject("box", llGetPos(), ZERO_VECTOR, ZERO_ROTATION, 0); }
            object_rez(key id) { rezzed = id; llSetTimerEvent(1); }
            timer() {
              llSetTimerEvent(0);
              saved = llDerezObject(rezzed, DEREZ_TO_INVENTORY);
              creator = llGetInventoryCreator("box");
            }
          }` } }] }] })
    rezzer.scripts.rezzer!.start()
    rezzer.linkset.advanceTime(3000)
    expect(rezzer.scripts.rezzer!.global('saved')).toBe(1)
    expect(rezzer.prims[0]!.inventory.find(item => item.name === 'box')!.object!.prims.map(prim => prim.creator))
      .toEqual([OWNER, MAKER])
    expect(rezzer.scripts.rezzer!.global('creator')).toBe(OWNER)
  })
})

// In-world: one prim held a notecard, gesture, shirt, shape, texture, sound, animation and material
// i doll made, and the same kinds fivebot made and gave to i doll. llGetInventoryCreator read i doll
// for each of i doll's items and fivebot for each of fivebot's (Aditi, SLua Tideland, 2026-11-25).
// Copies of Library items kept their own creators: a landmark, gesture, sky setting, material,
// sound, body part and tattoo each read a creator key, while a notecard, a texture and an object
// read NULL_KEY. No tool here lets the probe avatars make a landmark or a setting, so those two
// types are covered by the Library copies only.
describe('llGetInventoryCreator on every item type', () => {
  const kinds: Array<[string, InventoryTypeValue]> = [
    ['notecard', InventoryType.NOTECARD],
    ['texture', InventoryType.TEXTURE],
    ['sound', InventoryType.SOUND],
    ['animation', InventoryType.ANIMATION],
    ['gesture', InventoryType.GESTURE],
    ['landmark', InventoryType.LANDMARK],
    ['clothing', InventoryType.CLOTHING],
    ['bodypart', InventoryType.BODYPART],
    ['material', InventoryType.MATERIAL],
    ['setting', InventoryType.SETTING],
  ]
  const creatorOf = (i: number) => i % 2 ? MAKER : OWNER

  it('reads the creator a test gives each item', async () => {
    const { scripts } = await loadLinkset({ owner: OWNER, prims: [{
      inventory: kinds.map(([name, type], i) => makeInventoryItem({ name, type, creator: creatorOf(i) })),
      scripts: [{ name: 'reader', source: { source: READER } }] }] })
    scripts.reader!.start()
    const got = scripts.reader!.global('got') as string[]
    const byName = Object.fromEntries(Array.from({ length: got.length / 2 }, (_, i) => [got[2 * i], got[2 * i + 1]]))
    expect(byName).toEqual(Object.fromEntries(kinds.map(([name], i) => [name, creatorOf(i)])))
  })

  it('reads NULL_KEY for an item made with no creator, as for some Library items', async () => {
    const { scripts } = await loadLinkset({ owner: OWNER, prims: [{
      inventory: [makeInventoryItem({ name: 'Welcome Note', type: InventoryType.NOTECARD })],
      scripts: [{ name: 'reader', source: { source: READER } }] }] })
    scripts.reader!.start()
    expect(scripts.reader!.global('got')).toEqual(['Welcome Note', NULL_KEY])
  })

  // In-world: fivebot's notecard, texture, sound, animation, gesture, shirt, shape and material,
  // given to i doll, still read fivebot in i doll's prim (Aditi, SLua Tideland, 2026-11-25).
  it('keeps the creator when a script gives the item to another avatar\'s prim', async () => {
    const world = homeWorld()
    const target = await receiverPrim(world)
    const giver = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{
      inventory: [makeInventoryItem({ name: 'card', type: InventoryType.NOTECARD, creator: MAKER })],
      scripts: [{ name: 'giver', source: { source: `default { state_entry() { llGiveInventory("${TARGET}", "card"); } }` } }] }] })
    giver.scripts.giver!.start()
    const reader = await loadScript({ host: target, source: READER })
    reader.start()
    expect(reader.global('got')).toEqual(['card', MAKER])
  })
})
