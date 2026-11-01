import { describe, expect, it } from 'vitest'
import { loadLinkset, World, NULL_KEY } from '../src/index.js'

const OWNER = '11111111-1111-1111-1111-111111111111'
const OTHER_OWNER = '22222222-2222-2222-2222-222222222222'
const ROOT = 'aabbccdd-1111-1111-1111-111111111111'
const CHILD = 'aabbccdd-2222-2222-2222-222222222222'
const UNKNOWN = 'aabbccdd-9999-9999-9999-999999999999'

function worldFixture() {
  const world = new World()
  world.addRegion('Here', { x: 0, y: 0 })
  world.addRegion('There', { x: 256, y: 0 })
  world.addAvatar({ key: OWNER, region: 'Here', username: 'owner' })
  world.addAvatar({ key: OTHER_OWNER, region: 'Here', username: 'other.owner' })
  return world
}

async function reader(world?: World) {
  const loaded = await loadLinkset({
    ...(world ? { world, region: 'Here' } : {}),
    owner: OWNER,
    prims: [{ scripts: [{ name: 'reader', source: { source: `list out;
      default { touch_start(integer n) {
        out = [llGetOwnerKey("${ROOT}"), llGetOwnerKey("${CHILD}"),
          llGetOwnerKey("${ROOT.toUpperCase()}"), llGetOwnerKey(llGetKey()),
          llGetOwnerKey("${OWNER}"), llGetOwnerKey("${OTHER_OWNER}"),
          llGetOwnerKey("${UNKNOWN}"), llGetOwnerKey(NULL_KEY), llGetOwnerKey("bad")];
      } }` } }] }],
  })
  loaded.scripts.reader!.start()
  return {
    ...loaded,
    read() {
      loaded.linkset.touch(0)
      return loaded.scripts.reader!.global('out')
    },
  }
}

// https://wiki.secondlife.com/wiki/LlGetOwnerKey
// In-world: another object's root and child, an uppercase root key, a worn
// attachment and the caller's own prim -> owner. Avatar and random keys ->
// themselves; malformed and null keys -> NULL_KEY. After crossing into SLua
// Tombolo, root and child -> themselves; after detach, attachment -> itself.
// Aditi, SLua Tideland, 2026-11-01, Firestorm 7.3.0.83011.
describe('llGetOwnerKey', () => {
  it.each([OWNER, OTHER_OWNER])('returns the owner of another linkset owned by %s', async owner => {
    const world = worldFixture()
    await loadLinkset({ world, region: 'Here', owner, prims: [{ key: ROOT }, { key: CHILD }] })
    const caller = await reader(world)
    expect(caller.read()).toEqual([owner, owner, owner, OWNER, OWNER, OTHER_OWNER, UNKNOWN, NULL_KEY, NULL_KEY])
  })

  it('returns unknown keys unchanged and rejects invalid keys without a world', async () => {
    const caller = await reader()
    expect(caller.read()).toEqual([ROOT, CHILD, ROOT.toUpperCase(), OWNER, OWNER, OTHER_OWNER, UNKNOWN, NULL_KEY, NULL_KEY])
  })

  it('does not resolve prims in a different region', async () => {
    const world = worldFixture()
    await loadLinkset({ world, region: 'There', owner: OTHER_OWNER, prims: [{ key: ROOT }, { key: CHILD }] })
    const caller = await reader(world)
    expect((caller.read() as string[]).slice(0, 3)).toEqual([ROOT, CHILD, ROOT.toUpperCase()])
  })

  it('stops resolving a removed linkset', async () => {
    const world = worldFixture()
    const target = await loadLinkset({ world, region: 'Here', owner: OTHER_OWNER, prims: [{ key: ROOT }, { key: CHILD }] })
    const caller = await reader(world)
    expect((caller.read() as string[]).slice(0, 2)).toEqual([OTHER_OWNER, OTHER_OWNER])
    target.linkset.remove()
    expect((caller.read() as string[]).slice(0, 3)).toEqual([ROOT, CHILD, ROOT.toUpperCase()])
  })

  it('resolves worn prims in the wearer region and stops after detach', async () => {
    const world = worldFixture()
    const target = await loadLinkset({ world, region: 'There', owner: OTHER_OWNER,
      prims: [{ key: ROOT }, { key: CHILD }],
    })
    target.linkset.attachToAvatar(OTHER_OWNER, 6)
    const caller = await reader(world)
    expect((caller.read() as string[]).slice(0, 2)).toEqual([OTHER_OWNER, OTHER_OWNER])
    target.linkset.detachFromAvatar()
    expect((caller.read() as string[]).slice(0, 2)).toEqual([ROOT, CHILD])
  })
})
