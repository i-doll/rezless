import { expect, it } from 'vitest'
import { loadLinkset, World, makeInventoryItem, InventoryType, type Script } from '../src/index.js'
import * as C from '@rezless/vm'

// https://wiki.secondlife.com/wiki/llRezObjectWithParams
// In-world probes: Aditi, SLua Tideland, server Luau 2026-11-10.42914476267, Mono, 2026-11-23.
// A rezzer object rezzed probe children with the flags below and polled
// llGetObjectDetails(child, [OBJECT_POS]) every 0.1 s to see when each child was deleted.

const OWNER = '11111111-1111-1111-1111-111111111111'
const STRANGER = '33333333-3333-3333-3333-333333333333'
const CHILD = `list seen; integer die = -1;
  default {
    on_rez(integer p) { die = llGetStatus(STATUS_DIE_ON_NO_REZZER); }
    collision_start(integer n) { seen += ["start", llDetectedKey(0)]; }
    collision(integer n) { seen += ["collision", llDetectedKey(0)]; }
    collision_end(integer n) { seen += ["end", llDetectedKey(0)]; }
    land_collision_start(vector v) { seen += ["land", v]; }
  }`

async function fixture(rezzes: number[], rezzerSource = 'default { state_entry() { REZ } }') {
  const world = new World()
  world.addRegion('rez region', { x: 0, y: 0 })
  const payload = (await loadLinkset({ prims: [{ name: 'payload', scripts: [{ name: 'child', source: { source: CHILD } }] }] })).linkset
  const item = makeInventoryItem({ name: 'payload', type: InventoryType.OBJECT })
  Object.assign(item, { object: payload })
  const calls = rezzes.map(flags => `llRezObjectWithParams("payload", [REZ_FLAGS, ${flags}]);`).join(' ')
  const rezzer = await loadLinkset({ owner: OWNER, world, region: 'rez region', position: { x: 100, y: 100, z: 30 }, prims: [{
    name: 'rezzer', inventory: [item], scripts: [{ name: 'rezzer', source: { source: rezzerSource.replace('REZ', calls) } }],
  }] })
  rezzer.scripts['rezzer']!.start()
  const children = world.linksets.filter(l => l !== rezzer.linkset)
  return { world, rezzer, children, scripts: children.map(c => c.allScripts()[0]!) }
}

function objectEntry(key: string, owner = OWNER) {
  return { key, name: 'other', owner, type: C.ACTIVE | C.SCRIPTED }
}
function hit(script: Script, ...entries: ReturnType<typeof objectEntry>[]) {
  script.fire('collision_start', { num_detected: entries.length, detected: entries })
}
const alive = (world: World, script: Script) => world.linksets.includes(script.linkset)

it('defines the die-on-no-rezzer constants from the LSL definitions', () => {
  expect(C.REZ_FLAG_DIE_ON_NO_REZZER).toBe(0x100)
  expect(C.STATUS_DIE_ON_NO_REZZER).toBe(0x1000)
})

// In-world: the grid's compiler rejected REZ_FLAG_DIE_ON_NO_REZZER as "Name not defined within scope".
// A child rezzed with 0x101 or 0x100 outlived its rezzer's llDie for 55 s (until temp-on-rez
// removed the 0x101 ones, and until cleanup for 0x100); an unflagged control did the same.
it.each([0x101, 0x100, 0x1])('keeps a child rezzed with flags %s after its rezzer dies', async (flags) => {
  const f = await fixture([flags], 'default { state_entry() { REZ llDie(); } }')
  expect(f.rezzer.linkset.dead).toBe(true)
  f.rezzer.linkset.advanceTime(55000)
  expect(alive(f.world, f.scripts[0]!)).toBe(true)
})

// In-world: a child rezzed with REZ_FLAG_DIE_ON_NO_REZZER read llGetStatus(0x1000) = 0, and
// llSetStatus(0x1000, TRUE) in an unflagged child, or in any prim, still read 0.
it('ignores the die-on-no-rezzer status bit', async () => {
  const f = await fixture([0x101])
  expect(f.scripts[0]!.global('die')).toBe(0)
  const world = new World()
  world.addRegion('here', { x: 0, y: 0 })
  const s = (await loadLinkset({ world, region: 'here', prims: [{ name: 'prim', scripts: [{ name: 's', source: { source: `
    integer before; integer after;
    default { state_entry() { before = llGetStatus(STATUS_DIE_ON_NO_REZZER);
      llSetStatus(STATUS_DIE_ON_NO_REZZER, TRUE); after = llGetStatus(STATUS_DIE_ON_NO_REZZER); } }` } }] }] })).scripts['s']!
  s.start()
  expect([s.global('before'), s.global('after')]).toEqual([0, 0])
})

// In-world: a physical child rezzed with REZ_FLAG_DIE_ON_COLLIDE was deleted on its first collision:
// with the build platform (0.29 s after the rez), with its owner's avatar (0.42 s) and with the
// ground (0.69 s). A non-physical flagged child was deleted when an unflagged physical one fell on it.
// None of them ran collision_start or land_collision_start first: a child whose collision_start
// gave its owner a copy of its script gave nothing with the flag, and gave one without it.
it.each([
  ['an object', (s: Script) => hit(s, objectEntry('44444444-4444-4444-4444-444444444444', STRANGER))],
  ['its owner', (s: Script) => hit(s, { key: OWNER, name: 'owner', owner: OWNER, type: C.AGENT })],
  ['the ground', (s: Script) => s.fire('land_collision_start', { pos: { x: 100, y: 100, z: 22 } })],
])('deletes a die-on-collide object at its first collision with %s, before its handler runs', async (_, collide) => {
  const f = await fixture([C.REZ_FLAG_DIE_ON_COLLIDE])
  collide(f.scripts[0]!)
  expect(alive(f.world, f.scripts[0]!)).toBe(false)
  expect(f.scripts[0]!.global('seen')).toEqual([])
})

// In-world: an unflagged physical child ran collision_start and collision_end with the platform.
it('runs collision handlers in an object rezzed without collision flags', async () => {
  const f = await fixture([C.REZ_FLAG_PHYSICAL])
  hit(f.scripts[0]!, objectEntry('44444444-4444-4444-4444-444444444444', STRANGER))
  expect(alive(f.world, f.scripts[0]!)).toBe(true)
  expect(f.scripts[0]!.global('seen')).toEqual(['start', '44444444-4444-4444-4444-444444444444'])
})

// In-world: a child rezzed with REZ_FLAG_NO_COLLIDE_OWNER and dropped on its owner raised no
// collision with the avatar, then collided with the build platform. With
// REZ_FLAG_DIE_ON_COLLIDE as well it was deleted 1.38 s after the rez, on the platform,
// where a die-on-collide child without NO_COLLIDE_OWNER was deleted on the avatar after 0.42 s.
it('hides collisions with the owner from a no-collide-owner object', async () => {
  const f = await fixture([C.REZ_FLAG_NO_COLLIDE_OWNER, C.REZ_FLAG_NO_COLLIDE_OWNER | C.REZ_FLAG_DIE_ON_COLLIDE])
  const owner = { key: OWNER, name: 'owner', owner: OWNER, type: C.AGENT }
  const platform = objectEntry('44444444-4444-4444-4444-444444444444', STRANGER)
  for (const event of ['collision_start', 'collision', 'collision_end']) f.scripts[0]!.fire(event, { num_detected: 1, detected: [owner] })
  hit(f.scripts[1]!, owner)
  expect(f.scripts[0]!.global('seen')).toEqual([])
  expect(alive(f.world, f.scripts[1]!)).toBe(true)
  hit(f.scripts[0]!, owner, platform)
  expect(f.scripts[0]!.global('seen')).toEqual(['start', platform.key])
  hit(f.scripts[1]!, platform)
  expect(alive(f.world, f.scripts[1]!)).toBe(false)
})

// In-world: a physical child fell on a non-physical one from the same rezzer. With
// REZ_FLAG_NO_COLLIDE_FAMILY on both, on the falling one only or on the resting one only, it
// came to rest on the other and neither script raised a collision event; without the flag both did.
it.each([
  ['both', C.REZ_FLAG_NO_COLLIDE_FAMILY, C.REZ_FLAG_NO_COLLIDE_FAMILY],
  ['the falling one', 0, C.REZ_FLAG_NO_COLLIDE_FAMILY],
  ['the resting one', C.REZ_FLAG_NO_COLLIDE_FAMILY, 0],
])('hides collisions between objects of one rezzer when %s has the no-collide-family flag', async (_, a, b) => {
  const f = await fixture([a, b])
  const [one, two] = f.scripts as [Script, Script]
  hit(one, objectEntry(two.linkset.prims[0]!.key))
  hit(two, objectEntry(one.linkset.prims[0]!.key))
  expect([one.global('seen'), two.global('seen')]).toEqual([[], []])
})

it('keeps collisions between objects of one rezzer without the no-collide-family flag', async () => {
  const f = await fixture([0, 0])
  const [one, two] = f.scripts as [Script, Script]
  hit(one, objectEntry(two.linkset.prims[0]!.key))
  expect(one.global('seen')).toEqual(['start', two.linkset.prims[0]!.key])
})

// In-world: a no-collide-family child dropped on its rezzer raised no collision event; an
// unflagged one did. Dropped on the build platform, a flagged child still raised collision_start.
// A die-on-collide child with the family flag came to rest on a sibling and was not deleted.
it('treats the rezzer as family but not other objects', async () => {
  const f = await fixture([C.REZ_FLAG_NO_COLLIDE_FAMILY, C.REZ_FLAG_NO_COLLIDE_FAMILY | C.REZ_FLAG_DIE_ON_COLLIDE, 0])
  const [flagged, dying, sibling] = f.scripts as [Script, Script, Script]
  hit(flagged, objectEntry(f.rezzer.linkset.prims[0]!.key))
  expect(flagged.global('seen')).toEqual([])
  hit(dying, objectEntry(sibling.linkset.prims[0]!.key))
  expect(alive(f.world, dying)).toBe(true)
  const platform = objectEntry('44444444-4444-4444-4444-444444444444', STRANGER)
  hit(flagged, platform)
  expect(flagged.global('seen')).toEqual(['start', platform.key])
  hit(dying, platform)
  expect(alive(f.world, dying)).toBe(false)
})

it('matches owner and family keys in any letter case', async () => {
  const f = await fixture([C.REZ_FLAG_NO_COLLIDE_OWNER | C.REZ_FLAG_NO_COLLIDE_FAMILY, 0])
  const [flagged, sibling] = f.scripts as [Script, Script]
  hit(flagged, { key: OWNER.toUpperCase(), name: 'owner', owner: OWNER, type: C.AGENT })
  hit(flagged, objectEntry(sibling.linkset.prims[0]!.key.toUpperCase()))
  expect(flagged.global('seen')).toEqual([])
})

it('runs land collision handlers in an object rezzed without the die-on-collide flag', async () => {
  const f = await fixture([C.REZ_FLAG_PHYSICAL | C.REZ_FLAG_NO_COLLIDE_OWNER | C.REZ_FLAG_NO_COLLIDE_FAMILY])
  f.scripts[0]!.fire('land_collision_start', { pos: { x: 100, y: 100, z: 22 } })
  expect(f.scripts[0]!.global('seen')).toEqual(['land', { x: 100, y: 100, z: 22 }])
})

// In-world: a physical die-on-collide child that called llCollisionFilter("nothing by this name",
// NULL_KEY, TRUE) was still deleted on the build platform, 0.33 s after the rez.
it('deletes a die-on-collide object whatever its collision filter', async () => {
  const f = await fixture([C.REZ_FLAG_DIE_ON_COLLIDE])
  f.scripts[0]!.linkset.prims[0]!.collisionFilter = { name: 'nothing by this name', key: '00000000-0000-0000-0000-000000000000', accept: true }
  hit(f.scripts[0]!, objectEntry('44444444-4444-4444-4444-444444444444', STRANGER))
  expect(alive(f.world, f.scripts[0]!)).toBe(false)
})

// In-world: a non-physical die-on-collide child with llVolumeDetect(TRUE) let a physical sibling
// fall through it to the platform, ran collision_start for it and stayed.
it('keeps a die-on-collide object that detects volume', async () => {
  const f = await fixture([C.REZ_FLAG_DIE_ON_COLLIDE, 0])
  const [target, ball] = f.scripts as [Script, Script]
  target.linkset.prims[0]!.volumeDetect = true
  hit(target, objectEntry(ball.linkset.prims[0]!.key))
  expect(alive(f.world, target)).toBe(true)
  expect(target.global('seen')).toEqual(['start', ball.linkset.prims[0]!.key])
})

// In-world: the rezzer's collision_start ran when an unflagged child came to rest on it, and did
// not run for a no-collide-family child.
it('hides a no-collide-family child from its rezzer', async () => {
  const rezzer = `list seen; default { state_entry() { REZ }
    collision_start(integer n) { seen += [llDetectedKey(0)]; } }`
  const f = await fixture([C.REZ_FLAG_NO_COLLIDE_FAMILY, 0], rezzer)
  const script = f.rezzer.scripts['rezzer']!
  const [flagged, plain] = f.children.map(c => c.prims[0]!.key) as [string, string]
  hit(script, objectEntry(flagged))
  hit(script, objectEntry(plain))
  expect(script.global('seen')).toEqual([plain])
})

// In-world: a rezzer that was itself rezzed with REZ_FLAG_NO_COLLIDE_FAMILY rezzed an unflagged
// physical child above itself; the child came to rest on it and neither raised a collision event.
// Rezzed without the flag, both did.
it('hides an object from what it rezzes when it was rezzed with the no-collide-family flag', async () => {
  const f = await fixture([C.REZ_FLAG_NO_COLLIDE_FAMILY])
  const middle = f.children[0]!
  const grandchild = await loadLinkset({ owner: OWNER, world: f.world, region: 'rez region', prims: [{ name: 'grandchild', scripts: [{ name: 'g', source: { source: CHILD } }] }] })
  grandchild.linkset.rez = { ...middle.rez!, rezzer: middle.prims[0]!, rezzerKey: middle.prims[0]!.key, flags: 0 }
  const g = grandchild.scripts['g']!
  hit(g, objectEntry(middle.prims[0]!.key))
  hit(f.scripts[0]!, objectEntry(grandchild.linkset.prims[0]!.key))
  expect([g.global('seen'), f.scripts[0]!.global('seen')]).toEqual([[], []])
})
