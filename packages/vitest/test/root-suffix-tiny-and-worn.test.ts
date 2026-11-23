import { describe, it, expect } from 'vitest'
import { loadLinkset, DEBUG_CHANNEL, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlGetPrimitiveParams
// In-world: Aditi, SLua Tideland, 2026-11-23, Mono scripts in two linked 0.5 m boxes, read from the
// owner's chat history. The child read [PRIM_NAME, PRIM_CAST_SHADOWS] and set [PRIM_NAME, 5].

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'
const KID = `default { link_message(integer s, integer n, string m, key id) {
  llGetPrimitiveParams([PRIM_NAME, PRIM_CAST_SHADOWS]);
  llSetPrimitiveParams([PRIM_NAME, 5]);
}}`
const errors = (at: string) => [
  `llGetPrimitiveParams error: Param 1 error, unknown parameter {RootName Root, RootPosition { ${at} }}`,
  `llSetPrimitiveParams error running rule #1 (PRIM_NAME): arg #1 string expected but integer given. {RootName Root, RootPosition { ${at} }}`,
]

async function linked(position: { x: number; y: number; z: number }) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: AVATAR, name: 'Test Resident', username: 'test', position: { x: 118, y: 48, z: 1997.444 } })
  const loaded = await loadLinkset({
    world, region: 'home', owner: AVATAR, position,
    prims: [
      { name: 'Root', scripts: [{ name: 'root', source: { source: 'default { touch_start(integer n) { llMessageLinked(2, 0, "", NULL_KEY); } }' } }] },
      { name: 'Kid', position: { x: 0, y: -0.6, z: 0 }, scripts: [{ name: 'kid', source: { source: KID } }] },
    ],
  })
  for (const s of Object.values(loaded.scripts)) s.start()
  const run = () => {
    loaded.linkset.touch(1, { avatar: { key: AVATAR, name: 'Test Resident' } })
    loaded.linkset.advanceTime(1000)
    return loaded.scripts.kid!.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text)
  }
  return { ...loaded, avatar, run }
}

describe('the root position in the suffix', () => {
  it('switches to an exponent below 1e-4, as C %g does', async () => {
    const f = await linked({ x: 0.00005, y: 0.00012345, z: 1998.45 })
    // In-world: the root moved with llSetRegionPos(<0.00005, 0.00012345, 1998.45>) to the region
    // corner; the child's errors ended {RootName ..., RootPosition { 5e-05, 0.00012345, 1998.45 }}.
    expect(f.run()).toEqual(errors('5e-05, 0.00012345, 1998.45'))
  })

  it('gives the wearer position for a worn object, whatever the root offset', async () => {
    const f = await linked({ x: 0.3, y: 0.2, z: 0.1 })
    f.linkset.attachToAvatar(AVATAR, 1)
    // In-world: the linkset worn on the chest by an avatar at <118, 48, 1997.444>, first at the
    // attachment point and then moved to <0.3, 0.2, 0.1>. Both times the child's errors ended
    // RootPosition { 118, 48, 1997.44 }, the position llGetRootPosition reported.
    expect(f.run()).toEqual(errors('118, 48, 1997.44'))
  })
})
