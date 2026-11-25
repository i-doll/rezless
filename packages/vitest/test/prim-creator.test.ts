import { describe, expect, it } from 'vitest'
import { loadLinkset, World, type ObjectInput } from '../src/index.js'

const OWNER = 'a0000000-0000-4000-8000-000000000001'
const MAKER = 'b0000000-0000-4000-8000-000000000002'

const PROBE = `
  string made(key k) { return llList2String(llGetObjectDetails(k, [OBJECT_CREATOR]), 0); }
  list got;
  default {
    state_entry() {
      got = [llGetCreator(), made(llGetKey()), made(llGetLinkKey(LINK_ROOT)), made(llGetLinkKey(2))];
    }
  }
`

// https://wiki.secondlife.com/wiki/LlGetCreator
// https://wiki.secondlife.com/wiki/LlGetObjectDetails (OBJECT_CREATOR)
describe('prim creator', () => {
  it('is the owner by default', async () => {
    const { scripts } = await loadLinkset({ owner: OWNER, prims: [{ scripts: [{ name: 'p', source: { source: PROBE } }] }] })
    scripts.p!.start()
    expect(scripts.p!.global('got')).toEqual([OWNER, OWNER, '', ''])
  })

  // In-world: i doll linked a box they made (root) to a box fivebot made and gave them (child).
  // In both prims llGetCreator read that prim's own maker; OBJECT_CREATOR of the root's key read
  // i doll and of the child's key read fivebot, from either prim; llGetOwner read i doll in both
  // (Aditi, SLua Tideland, 2026-11-25).
  it('is each prim\'s own maker in a linkset whose prims different avatars made', async () => {
    const { scripts } = await loadLinkset({ owner: OWNER, prims: [
      { scripts: [{ name: 'root', source: { source: PROBE } }] },
      { creator: MAKER, scripts: [{ name: 'child', source: { source: PROBE } }] },
    ] })
    scripts.root!.start()
    scripts.child!.start()
    expect(scripts.root!.global('got')).toEqual([OWNER, OWNER, OWNER, MAKER])
    expect(scripts.child!.global('got')).toEqual([MAKER, MAKER, OWNER, MAKER])
  })

  // In-world: the box fivebot made and gave to i doll, rezzed by i doll, read llGetCreator and
  // its own OBJECT_CREATOR as fivebot, owner i doll (Aditi, SLua Tideland, 2026-11-25).
  it('stays the maker when another avatar owns the object', async () => {
    const { scripts } = await loadLinkset({ owner: OWNER, prims: [{ creator: MAKER, scripts: [{ name: 'p', source: { source: PROBE } }] }] })
    scripts.p!.start()
    expect(scripts.p!.global('got')).toEqual([MAKER, MAKER, '', ''])
  })

  async function rezzed(object: ObjectInput) {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const { scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, position: { x: 100, y: 100, z: 30 },
      prims: [{ objects: { object }, scripts: [{ name: 'rezzer', source: { source: `
        string made;
        default {
          state_entry() { llRezObject("object", llGetPos(), ZERO_VECTOR, ZERO_ROTATION, 0); }
          object_rez(key id) { made = llList2String(llGetObjectDetails(id, [OBJECT_CREATOR]), 0); }
        }` } }] }] })
    scripts.rezzer!.start()
    world.clock.advance(1000)
    return scripts.rezzer!.global('made')
  }

  // In-world: llRezObject of the fivebot-made box from i doll's prim -> object_rez, and
  // OBJECT_CREATOR of the new object read fivebot (Aditi, SLua Tideland, 2026-11-25).
  it('stays the maker on an object rezzed from a prim\'s contents', async () => {
    expect(await rezzed({ prims: [{ creator: MAKER }] })).toBe(MAKER)
  })

  it('is the rezzer\'s owner on a rezzed object that names no creator', async () => {
    expect(await rezzed({ prims: [{}] })).toBe(OWNER)
  })

  it('reads in SLua too', async () => {
    const { scripts } = await loadLinkset({ owner: OWNER, prims: [{ creator: MAKER, scripts: [{ name: 'p', language: 'slua',
      source: { source: 'got = { ll.GetCreator(), ll.GetObjectDetails(ll.GetKey(), {OBJECT_CREATOR})[1] }' } }] }] })
    scripts.p!.start()
    expect(scripts.p!.global('got')).toEqual([MAKER, MAKER])
  })

  it('stays on a copy of the object', async () => {
    const { linkset } = await loadLinkset({ owner: OWNER, prims: [{ creator: MAKER, scripts: [{ name: 'p', source: { source: PROBE } }] }] })
    const copy = linkset.copy({ owner: 'c0000000-0000-4000-8000-000000000003' })
    copy.allScripts()[0]!.start()
    expect(copy.allScripts()[0]!.global('got')).toEqual([MAKER, MAKER, '', ''])
  })
})
