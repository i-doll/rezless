import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'
const ROOT = '11111111-2222-3333-4444-555555555555'
const ZERO = { x: 0, y: 0, z: 0 }
const POSITION = { x: 116, y: 48, z: 1997.421 }
const ROTATION = { x: 0, y: 0, z: 1, s: 0 }
const SIZE = { x: 0.45, y: 0.6, z: 1.653822 }
const MASKS = [2147483647, 2147483647, 0, 0, 0]

async function fixture(body: string) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addRegion('away', { x: 1024, y: 0 })
  const options = {
    region: 'home', key: AVATAR, name: 'Test Resident', username: 'test',
    position: POSITION, rotation: ROTATION, size: SIZE,
    objectDetails: {
      runningScriptCount: 52, totalScriptCount: 52, scriptMemory: 3245069,
      primCount: 560, totalInventoryCount: 522, streamingCost: 404.1732,
      renderWeight: 3112, attachedSlotsAvailable: 23, mass: 156.1691, accountLevel: 10,
    },
  }
  const avatar = world.addAvatar(options)
  const { scripts, linkset } = await loadLinkset({ world, region: 'home', owner: AVATAR, prims: [{
    scripts: [{ name: 'test', source: { source: `key A = "${AVATAR}"; list out; list types;
      default { touch_start(integer n) { ${body}
        types = []; integer entry; for (entry=0; entry<llGetListLength(out); ++entry) types += llGetListEntryType(out,entry);
      } }` } }],
  }] })
  const script = scripts.test!
  script.start()
  const read = () => { script.fire('touch_start', { num_detected: 1 }); return script.global('out') }
  return { world, avatar, script, linkset, read }
}

// https://wiki.secondlife.com/wiki/LlGetObjectDetails
// In-world: flags 1..56, standing and seated, with entry types (Aditi,
// SLua Tideland, Firestorm 7.3.0.83011, 2026-11-01). Creator/group/last owner
// are NULL_KEY; owner/rezzer are the avatar key. Permissions have five masks.
const standing: [unknown[], number[]][] = [
  [['Test Resident'], [3]], [[''], [3]], [[POSITION], [5]], [[ROTATION], [6]], [[ZERO], [5]],
  [[AVATAR], [4]], [['00000000-0000-0000-0000-000000000000'], [4]],
  [['00000000-0000-0000-0000-000000000000'], [4]],
  [[52], [1]], [[52], [1]], [[3245069], [1]], [[0], [2]], [[1], [1]], [[0], [2]],
  [[404.1732], [2]], [[1], [2]], [[0], [2]], [[AVATAR], [4]], [[0], [1]], [[1], [1]],
  [[0], [1]], [[0], [1]], [[0], [1]], [[3112], [1]], [[0], [2]], [[0], [2]],
  [['00000000-0000-0000-0000-000000000000'], [4]], [[0], [1]], [[ZERO], [5]],
  [[560], [1]], [[522], [1]], [[AVATAR], [4]], [[''], [3]], [[0], [1]], [[23], [1]],
  [[''], [3]], [[0], [1]], [[0], [1]], [[0], [1]], [[3], [1]], [[10], [1]], [[4], [1]],
  [[156.1691], [2]], [[''], [3]], [[''], [3]], [[0], [1]], [[SIZE], [5]], [[ZERO], [5]],
  [[1], [2]], [[100], [2]], [[0], [2]], [[0], [1]], [MASKS, [1,1,1,1,1]],
  [MASKS, [1,1,1,1,1]], [[0], [1]], [[0], [1]],
]

describe('llGetObjectDetails avatars', () => {
  it.each(standing.map(([values, types], index) => ({ flag: index + 1, values, types })))('reads flag $flag with its LSL type', async ({ flag, values, types }) => {
    const f = await fixture(`out = llGetObjectDetails(A, [${flag}]);`)
    expect(f.read()).toEqual(values)
    expect(f.script.global('types')).toEqual(types)
  })

  // In-world: unknown key with all supported flags -> [].
  // A different-region fixture must return no details.
  it('requires a known avatar in the caller region and accepts uppercase keys', async () => {
    const f = await fixture('out = llGetObjectDetails(llToUpper(A), [OBJECT_NAME]);')
    expect(f.read()).toEqual(['Test Resident'])
    f.avatar.region = 'away'
    expect(f.read()).toEqual([])
    f.world.avatars.length = 0
    expect(f.read()).toEqual([])
  })

  it.each(['NULL_KEY', '"bad"', '"00000000-0000-0000-0000-000000000001"'])('returns [] for %s', async key => {
    const f = await fixture(`list flags; integer i; for(i=1;i<=56;++i)flags+=i; out=llGetObjectDetails(${key},flags);`)
    expect(f.read()).toEqual([])
  })

  // In-world: [NAME,999,PERMS,"x",DESC] -> name,-1,five masks with last -1,"".
  it('preserves flag order, unknown flags and invalid-entry handling', async () => {
    const f = await fixture('out = llGetObjectDetails(A,[OBJECT_NAME,999,OBJECT_PERMS,"x",OBJECT_DESC]);')
    expect(f.read()).toEqual(['Test Resident', -1, ...MASKS.slice(0,4), -1, ''])
    expect(f.script.global('types')).toEqual([3,1,1,1,1,1,1,3])
  })

  // In-world: a 125 kg seat -> root seat key, link 2, mass 281.1691 kg;
  // a two-prim 250 kg seat -> root key, link 3, mass 406.1691 kg. Costs
  // follow the seat; avatar prim count stays 560. Standing restores link 0.
  it('reads the seated root, placement, link number, mass and costs', async () => {
    const f = await fixture('out=llGetObjectDetails(A,[OBJECT_ROOT,OBJECT_POS,OBJECT_ROT,OBJECT_LINK_NUMBER,OBJECT_MASS,OBJECT_PRIM_COUNT,OBJECT_PRIM_EQUIVALENCE,OBJECT_PHYSICS_COST,OBJECT_SERVER_COST]);')
    const seat = await loadLinkset({ world: f.world, region: 'home', position: { x: 119, y: 48, z: 1997.5 },
      prims: [{ key: ROOT }, {}] })
    f.avatar.sittingOn = seat.linkset.prims[1]!
    expect(f.read()).toEqual([ROOT, { x: 119, y: 48, z: 1997.5 }, { x: 0, y: 0, z: 0, s: 1 }, 3, expect.closeTo(406.1691, 5), 560, 2, 2, 1])
    f.avatar.sittingOn = null
    expect(f.read()).toEqual([AVATAR, { x: 119, y: 48, z: 1997.5 }, { x: 0, y: 0, z: 0, s: 1 }, 0, 156.1691, 560, 1, 1, 0])
  })

  it('uses defaults when resource totals are omitted', async () => {
    const f = await fixture('list flags; integer i; for(i=1;i<=56;++i)flags+=i; out=llGetObjectDetails(A,flags);')
    f.avatar.objectDetails = {}
    const expected = standing.map(([values]) => [...values])
    for (const flag of [9,10,11,15,30,31,39,41,43]) expected[flag-1] = [0]
    expected[23] = [-1]
    expected[34] = [38]
    expect(f.read()).toEqual(expected.flat())
  })

  // In-world: a scripted one-prim seat -> server cost 0.75; a three-script,
  // two-prim seat -> 1.75. Standing -> server cost 0.0 and physics cost 1.0.
  it('includes scripts in the seated server cost', async () => {
    const f = await fixture('out=llGetObjectDetails(A,[OBJECT_ROOT,OBJECT_LINK_NUMBER,OBJECT_SERVER_COST,OBJECT_MASS]);')
    const seat = await loadLinkset({ world: f.world, region: 'home', prims: [{ key: ROOT,
      scripts: [{ name: 'seat', source: { source: 'default{state_entry(){}}' } }] }] })
    f.avatar.sittingOn = seat.linkset.prims[0]!
    expect(f.read()).toEqual([ROOT, 2, 0.75, expect.closeTo(281.1691, 5)])
    seat.linkset.remove()
    expect(f.read()).toEqual([AVATAR, 0, 0, 156.1691])
  })

  it('reads live fixture changes', async () => {
    const f = await fixture('out=llGetObjectDetails(A,[OBJECT_VELOCITY,OBJECT_BODY_SHAPE_TYPE,OBJECT_HOVER_HEIGHT,OBJECT_HEALTH,OBJECT_GROUP_TAG,OBJECT_RENDER_WEIGHT]);')
    f.avatar.velocity = { x: 2, y: 3, z: 4 }
    f.avatar.visualParams[80] = 0.75
    f.avatar.objectDetails.health = 40
    f.avatar.objectDetails.groupTag = 'Builders'
    f.avatar.objectDetails.renderWeight = 5000
    f.avatar.movement = { alwaysRun: false, tempRun: false, hoverOffset: 0.3, hoverEnabled: true }
    expect(f.read()).toEqual([{ x: 2, y: 3, z: 4 }, 0.75, 0.3, 40, 'Builders', 5000])
  })
})

// Resource totals are explicit fixture values, including script time in seconds.
it('keeps mutable resource totals and animated attachment counts typed', async () => {
  const f = await fixture('out=llGetObjectDetails(A,[OBJECT_SCRIPT_TIME,OBJECT_ANIMATED_COUNT,OBJECT_ANIMATED_SLOTS_AVAILABLE]);')
  f.avatar.objectDetails.scriptTime = 0.000075
  f.avatar.objectDetails.animatedCount = 1
  f.avatar.objectDetails.animatedSlotsAvailable = 2
  expect(f.read()).toEqual([0.000075, 1, 2])
  expect(f.script.global('types')).toEqual([2, 1, 1])
})

// https://wiki.secondlife.com/wiki/LlGetLinkPrimitiveParams
it('assigns avatar links in seating order and appends a reseated avatar', async () => {
  const f = await fixture('out=llGetObjectDetails(A,[OBJECT_LINK_NUMBER]);')
  const second = f.world.addAvatar({ region: 'home', username: 'second' })
  const seat = await loadLinkset({ world: f.world, region: 'home', prims: [{}, {}] })
  f.world.sitAvatar(second, seat.linkset.prims[1]!)
  f.world.sitAvatar(f.avatar, seat.linkset.prims[0]!)
  expect(f.read()).toEqual([4])
  f.world.standAvatar(second)
  expect(f.read()).toEqual([3])
  f.world.sitAvatar(second, seat.linkset.prims[1]!)
  expect(f.read()).toEqual([3])
  f.world.standAvatar(f.avatar)
  f.world.sitAvatar(f.avatar, seat.linkset.prims[0]!)
  expect(f.read()).toEqual([4])
})
