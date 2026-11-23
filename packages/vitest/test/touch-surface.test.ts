import { describe, expect, it } from 'vitest'
import { loadLinkset, seedRlvInventory, World } from '../src/index.js'
import type { Linkset, Script } from '../src/index.js'

// In-world: Aditi beta grid, SLua Tideland, 2026-11-23, Mono. Each probe reported
// llDetectedTouchFace, ST, UV, Pos, Normal, Binormal (and the key) from every touch event.
// https://wiki.secondlife.com/wiki/LlDetectedTouchST, .../LlDetectedTouchPos

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const reader = `
  list got = [];
  string d() {
    return (string)llDetectedTouchFace(0) + "|" + (string)llDetectedTouchST(0) + "|" + (string)llDetectedTouchUV(0) + "|"
      + (string)llDetectedTouchPos(0) + "|" + (string)llDetectedTouchNormal(0) + "|" + (string)llDetectedTouchBinormal(0);
  }
  default {
    touch_start(integer n) { got += ["touch_start", d()]; }
    touch(integer n) { got += ["touch", d()]; }
    touch_end(integer n) { got += ["touch_end", d()]; }
  }
`

const v = (x: number, y: number, z: number) => ({ x, y, z })

describe('the surface point of a real click', () => {
  it('reaches touch_start, every touch of a hold and touch_end unchanged', async () => {
    // In-world: a 1 x 2 x 0.5 m box turned 30 degrees, its top face textured with repeats 2, 3
    // and offset 0.1, 0.2, held 3 s on face 0 at ST 0.25, 0.75. touch_start, all 66 touch
    // events and touch_end read the same values: face 0, ST <0.25, 0.75, 0>, UV <0.10001,
    // -0.05001, 0>, Pos <119.53350, 47.30801, 1998.25000> in region coordinates, Normal
    // <0, 0, 1>, Binormal <-0.5, 0.86603, 0>.
    const loaded = await loadLinkset({ owner: OWNER, prims: [{ scripts: [{ name: 's', source: { source: reader } }] }] })
    loaded.scripts.s!.start()
    loaded.linkset.touch(0, {
      face: 0, st: v(0.25, 0.75, 0), uv: v(0.10001, -0.05001, 0), pos: v(119.5335, 47.30801, 1998.25),
      normal: v(0, 0, 1), binormal: v(-0.5, 0.86603, 0), hold: 3000,
    })
    const got = loaded.scripts.s!.global('got') as string[]
    const values = '0|<0.25000, 0.75000, 0.00000>|<0.10001, -0.05001, 0.00000>|<119.53350, 47.30801, 1998.25000>'
      + '|<0.00000, 0.00000, 1.00000>|<-0.50000, 0.86603, 0.00000>'
    expect(got.filter((_, i) => i % 2 === 1)).toEqual(Array(got.length / 2).fill(values))
    expect(got[0]).toBe('touch_start')
    expect(got.at(-2)).toBe('touch_end')
  })

  it('on a HUD reads the position in the HUD\'s own coordinates', async () => {
    // In-world: a 0.1 x 0.2 x 0.1 m box worn on HUD Center, clicked at the middle of the
    // screen -> face 4, ST and UV <0.5, 0.5, 0>, Pos <-0.05, 0, 0>, Normal <-1, 0, 0>,
    // Binormal <0, 0, 1>. Clicked on face 4 at ST 0.2, 0.9 -> Pos <-0.05, 0.06, 0.04>.
    const loaded = await loadLinkset({ owner: OWNER, prims: [{ scripts: [{ name: 's', source: { source: reader } }] }] })
    loaded.scripts.s!.start()
    loaded.linkset.attachToAvatar(OWNER, 35)
    loaded.linkset.advanceTime(0)
    loaded.linkset.touch(0, {
      face: 4, st: v(0.2, 0.9, 0), uv: v(0.2, 0.9, 0), pos: v(-0.05, 0.06, 0.04), normal: v(-1, 0, 0), binormal: v(0, 0, 1),
    })
    expect((loaded.scripts.s!.global('got') as string[])[1]).toBe(
      '4|<0.20000, 0.90000, 0.00000>|<0.20000, 0.90000, 0.00000>|<-0.05000, 0.06000, 0.04000>'
      + '|<-1.00000, 0.00000, 0.00000>|<0.00000, 0.00000, 1.00000>')
  })
})

describe('the surface point of a click carried through inventory', () => {
  async function fixture() {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
    return { world, avatar }
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>

  const sleeper = `
    list log;
    integer clicks;
    string d() {
      return (string)llDetectedTouchFace(0) + "|" + (string)llDetectedTouchST(0) + "|" + (string)llDetectedTouchUV(0) + "|"
        + (string)llDetectedTouchPos(0) + "|" + (string)llDetectedTouchNormal(0) + "|" + (string)llDetectedTouchBinormal(0)
        + "|" + (string)llDetectedKey(0);
    }
    default {
      touch_start(integer n) { ++clicks; log += ["start", d()]; if (clicks == 1) { llSleep(20.0); log += ["after", d()]; } }
      touch(integer n) { log += ["touch", d()]; }
      touch_end(integer n) { log += ["end", d()]; }
    }
  `

  /** A click on face `face`, queued so a sleeping handler doesn't hold up the test. */
  function click(f: Fixture, script: Script, face: number, st: { x: number; y: number; z: number }) {
    const detected = [{ key: OWNER, name: 'owner', touchFace: face, touchST: st, touchUV: st,
      touchPos: v(119.9, 51.75, 1998.05), touchNormal: v(0, -1, 0), touchBinormal: v(0, 0, 1) }]
    for (const event of ['touch_start', 'touch', 'touch_end']) f.world.clock.schedule(script, f.world.clock.now, event, { num_detected: 1, detected })
  }

  async function asleep(f: Fixture) {
    const made = await loadLinkset({ world: f.world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'main', source: { source: sleeper } }] }] })
    made.scripts.main!.start()
    return made
  }

  const kept = (log: string[]) => log.filter((_, i) => i % 2 === 1)
  const before = `1|<0.30000, 0.60000, 0.00000>|<0.30000, 0.60000, 0.00000>|<119.90000, 51.75000, 1998.05000>`
    + `|<0.00000, -1.00000, 0.00000>|<0.00000, 0.00000, 1.00000>|${OWNER}`
  const lost = `-1|<-1.00000, -1.00000, 0.00000>|<-1.00000, -1.00000, 0.00000>|<0.00000, 0.00000, 0.00000>`
    + `|<0.00000, 0.00000, 0.00000>|<0.00000, 0.00000, 0.00000>|${OWNER}`

  it('reads no surface point after a take, but keeps who clicked', async () => {
    // In-world: clicked on face 1 at ST 0.3, 0.6 (its touch_start slept 20 s), then on face 2,
    // then taken and rezzed. After the sleep the first touch_start, and every event of both
    // clicks after it, read face -1, ST and UV <-1, -1, 0>, and zero Pos, Normal and Binormal,
    // with the clicker's key.
    const f = await fixture()
    const made = await asleep(f)
    click(f, made.scripts.main!, 1, v(0.3, 0.6, 0))
    made.linkset.advanceTime(500)
    click(f, made.scripts.main!, 2, v(0.7, 0.1, 0))
    made.linkset.advanceTime(1000)
    const saved = made.linkset.copy()
    made.linkset.remove()
    seedRlvInventory(f.avatar, { sharedRootId: null, entries: [{ id: 'item', kind: 'item', parentId: null, name: 'probe', object: saved, assetType: 'object' }] })
    const copy: Linkset = f.world.attemptAvatarRez(f.avatar, 'item', { x: 1, y: 2, z: 3 }).object!
    copy.advanceTime(25_000)
    const log = copy.allScripts()[0]!.global('log') as string[]
    expect(log.filter((_, i) => i % 2 === 0)).toEqual(['start', 'after', 'touch', 'end', 'start', 'touch', 'end'])
    expect(kept(log)).toEqual([before, ...Array(6).fill(lost)])
  })

  it('reads no surface point after a detach and a wear, but keeps who clicked', async () => {
    // In-world: worn on the chest, clicked on face 1 at ST 0.3, 0.6 (its touch_start slept
    // 25 s), then on face 2, then detached and worn again. Every event after the sleep read
    // face -1, ST and UV <-1, -1, 0>, and zero Pos, Normal and Binormal, with the clicker's key.
    const f = await fixture()
    const made = await asleep(f)
    made.linkset.attachToAvatar(OWNER, 1)
    made.linkset.advanceTime(0)
    click(f, made.scripts.main!, 1, v(0.3, 0.6, 0))
    made.linkset.advanceTime(500)
    click(f, made.scripts.main!, 2, v(0.7, 0.1, 0))
    made.linkset.advanceTime(1000)
    made.linkset.detachFromAvatar()
    f.world.clock.advance(4000)
    made.linkset.attachToAvatar(OWNER, 1)
    made.linkset.advanceTime(25_000)
    const log = made.scripts.main!.global('log') as string[]
    expect(log.filter((_, i) => i % 2 === 0)).toEqual(['start', 'after', 'touch', 'end', 'start', 'touch', 'end'])
    expect(kept(log)).toEqual([before, ...Array(6).fill(lost)])
  })
})
