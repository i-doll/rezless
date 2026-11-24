import { describe, expect, it } from 'vitest'
import { loadLinkset, loadRlvPair, PERM_ALL, PERM_COPY, World } from '../src/index.js'

// Every "In-world" note below was measured on the Aditi beta grid, SLua Tideland, 2026-11-23,
// with Firestorm 7 and RLVa 2.4.2. Restrictions came from an object that said them with llOwnerSay.

const issuer = 'string command; default { touch_start(integer n) { llOwnerSay(command); } }'
type Rlv = Awaited<ReturnType<typeof loadRlvPair>>['rlva']

function command(f: Rlv, text: string) {
  f.script.setGlobal('command', text)
  f.script.fire('touch_start', { num_detected: 1 })
}

async function scene(profile: 'rlva' | 'rlv' = 'rlva') {
  const f = (await loadRlvPair({ source: issuer }))[profile]
  f.script.start()
  f.avatar.position = { x: 10, y: 10, z: 10 }
  // 8 m long along x, its center 4.5 m from the avatar: the near end is 0.5 m away.
  const long = (await loadLinkset({ world: f.world, owner: f.avatar.key, region: f.avatar.region,
    position: { x: 14.5, y: 10, z: 10 }, prims: [{ size: { x: 8, y: 0.5, z: 0.5 } }] })).linkset
  return { f, prim: long.prims[0]! }
}

// Duplicate copies the selection, and under @fartouch RLVa selects a prim only when its center is
// within reach or the clicked point is within 1.5 m (LLToolSelect::handleObjectSelection), as for
// the pie menu that offers Take.
describe('the @fartouch reach for Duplicate', () => {
  // In-world: an 8 m box whose center was 4.5 m away. Under @fartouch the viewer's menu state for
  // it opened for clicked points 0.5 m and 1.1 m away, and stayed shut for one 1.64 m away, for the
  // far end and for the center.
  it('selects the prim when the clicked point is within 1.5 m', async () => {
    const { f, prim } = await scene()
    command(f, '@fartouch=n')
    expect(f.duplicate(prim, { x: 0, y: 0, z: 1 }, { x: -4, y: 0, z: 0 }).status).toBe('duplicated')
    expect(f.duplicate(prim, { x: 0, y: 0, z: 1 }, { x: -3.4, y: 0, z: 0 }).status).toBe('duplicated')
  })

  it('refuses a clicked point past 1.5 m, the far end and the center', async () => {
    const { f, prim } = await scene()
    command(f, '@fartouch=n')
    expect(f.duplicate(prim, undefined, { x: -2.86, y: 0, z: 0 })).toMatchObject({ status: 'blocked', reason: 'fartouch' })
    expect(f.duplicate(prim, undefined, { x: 4, y: 0, z: 0 })).toMatchObject({ status: 'blocked', reason: 'fartouch' })
    expect(f.duplicate(prim)).toMatchObject({ status: 'blocked', reason: 'fartouch' })
    command(f, '@fartouch=y')
    expect(f.duplicate(prim).status).toBe('duplicated')
  })

  // Kokua's selection has no @fartouch reach (lltoolselect.cpp); the headless viewer is Firestorm,
  // so this is from Kokua's source.
  it('leaves Kokua\'s Duplicate alone', async () => {
    const { f, prim } = await scene('rlv')
    command(f, '@fartouch=n')
    expect(f.duplicate(prim).status).toBe('duplicated')
  })
})

describe('Take Copy at the moment the owner sits', () => {
  const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const seat = `list log;
    default {
      state_entry() { llSitTarget(<0, 0, 0.6>, ZERO_ROTATION); }
      changed(integer c) { log += (string)c + " " + (string)(llAvatarOnSitTarget() != NULL_KEY); }
    }`

  // In-world: the owner sat on a seat everyone could copy at the moment the other avatar's viewer
  // took a copy, four times. Each time the sit came first, then 0.31 to 0.40 s later the copy
  // stood the owner up: changed(32) with the owner seated, then changed(160) with no sitter.
  it('stands the owner up after the sit, with changed(32) then changed(160)', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const owner = world.addAvatar({ region: 'home', key: OWNER, username: 'owner', position: { x: 117, y: 48.5, z: 20 } })
    const other = world.addAvatar({ region: 'home', key: OTHER, username: 'other', position: { x: 118, y: 48, z: 20 } })
    const made = await loadLinkset({ world, region: 'home', owner: OWNER, position: { x: 117, y: 49.5, z: 20 },
      prims: [{ scripts: [{ name: 'seat', source: { source: seat } }] }] })
    for (const prim of made.linkset.prims) {
      prim.permMask = { ...prim.permMask, everyone: PERM_COPY, next: PERM_ALL }
      for (const item of prim.inventory) item.permMask = { ...item.permMask, everyone: PERM_COPY, next: PERM_ALL }
    }
    made.scripts['seat']!.start()
    made.linkset.advanceTime(1)
    world.sitAvatar(owner, made.linkset.prims[0]!)
    made.linkset.advanceTime(350)
    expect(world.attemptAvatarTake(other, made.linkset.prims[0]!, { copy: true }).status).toBe('taken')
    made.linkset.advanceTime(100)
    expect(owner.sittingOn).toBeNull()
    expect(made.scripts['seat']!.global('log')).toEqual(['32 1', '160 0'])
  })
})
