import { describe, expect, it } from 'vitest'
import { loadLinkset, loadRlvPair, World } from '../src/index.js'

// Neither https://wiki.secondlife.com/wiki/LlSitTarget nor
// https://wiki.secondlife.com/wiki/LlSetLinkSitFlags says what a sit request
// does when the prim is too far away to sit on.
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm 7.3.0 with RLVa,
// 2026-11-14): one avatar, a box 2 m away to sit on and a second box 30 m
// away. A script in each box set its sit target and sit flags, and reported
// changed(), llGetLinkSitFlags, llAvatarOnSitTarget, llGetAgentInfo and the
// avatar's OBJECT_POS and OBJECT_ROOT. The viewer sent a plain sit request for
// the named box. Every "In-world:" note in this file is from those probes.

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'
const NULL_KEY = '00000000-0000-0000-0000-000000000000'
const CHANGED_LINK = 32
const AGENT_ON_OBJECT = 32
const AGENT_SITTING = 16
const TARGET = { enabled: true, offset: { x: 0, y: 0, z: 0.6 }, rotation: { x: 0, y: 0, z: 0, s: 1 } }
const SCRIPT = 'list changes; default { changed(integer c) { changes += [c]; } }'
const NO_SURFACE = expect.objectContaining({
  name: 'CantSitNoSuitableSurface',
  message: 'There is no suitable surface to sit on, try another spot.',
})

/** The avatar at <116, 48>, a box to sit on 2 m west of it and a second box `distance` m east of it. */
async function scene(distance = 30, far: { target?: boolean; flags?: number } = {}) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({
    region: 'home', key: AVATAR, name: 'av', username: 'av', position: { x: 116, y: 48, z: 1997.4 },
  })
  const box = async (x: number) => {
    const loaded = await loadLinkset({
      world, region: 'home', owner: AVATAR, position: { x, y: 48, z: 1997.5 },
      prims: [{ scripts: [{ name: `box${x}`, source: { source: SCRIPT } }] }],
    })
    const script = Object.values(loaded.scripts)[0]!
    script.start()
    return { linkset: loaded.linkset, prim: loaded.linkset.prims[0]!, changes: () => script.global('changes') as number[] }
  }
  const near = await box(114)
  const other = await box(116 + distance)
  if (far.target) other.prim.params.sitTarget = TARGET
  if (far.flags !== undefined) other.prim.params.sitFlags = far.flags
  // The objects share the world's clock, so advancing one advances both.
  const advance = (ms = 100) => near.linkset.advanceTime(ms)
  const request = (prim = other.prim) => {
    const accepted = world.userSitAvatar(avatar, prim)
    advance()
    return accepted
  }
  return { world, avatar, near, other, advance, request }
}

describe('a sit request on a prim out of reach', () => {
  // In-world: the avatar stood 30 m from a box with sit flags 2 and no sit
  // target. The sit request left it standing where it was, neither script got
  // an event and the viewer showed nothing. The same at 10 m and 8.6 m.
  it.each([30, 10, 8.6])('leaves a standing avatar where it is, %f m away', async (distance) => {
    const s = await scene(distance)
    expect(s.request()).toBe(false)
    expect(s.avatar.sittingOn).toBeNull()
    expect(s.avatar.info & AGENT_SITTING).toBe(0)
    expect(s.avatar.position).toEqual({ x: 116, y: 48, z: 1997.4 })
    expect(s.other.changes()).toEqual([])
    expect(s.avatar.viewer.alerts).toEqual([])
  })

  // In-world, three times with the far box 30 m away and once with it 10.7 m
  // away: the avatar sat on the near box and asked for the far one, which read
  // back sit flags 2 and no sit target. The avatar stood up next to the near
  // box, the near box got a second changed(CHANGED_LINK) and the far box none.
  // The avatar was not seated on the far box and did not walk to it in the
  // next 10 s. The viewer showed nothing.
  it.each([30, 10.7])('stands a seated avatar up from its seat, %f m away', async (distance) => {
    const s = await scene(distance)
    expect(s.request(s.near.prim)).toBe(true)
    expect(s.near.changes()).toEqual([CHANGED_LINK])
    expect(s.request()).toBe(false)
    expect(s.avatar.sittingOn).toBeNull()
    expect(s.avatar.info & (AGENT_SITTING | AGENT_ON_OBJECT)).toBe(0)
    expect(s.near.changes()).toEqual([CHANGED_LINK, CHANGED_LINK])
    expect(s.other.changes()).toEqual([])
    expect(s.avatar.viewer.alerts).toEqual([])
  })

  // In-world: the same from a seat with a sit target (flags read 3). The avatar
  // stood up and the seat got its second changed(CHANGED_LINK).
  it('stands an avatar up from a sit target', async () => {
    const s = await scene()
    s.near.prim.params.sitTarget = TARGET
    expect(s.request(s.near.prim)).toBe(true)
    expect(s.request()).toBe(false)
    expect(s.avatar.sittingOn).toBeNull()
    expect(s.near.changes()).toEqual([CHANGED_LINK, CHANGED_LINK])
  })

  // In-world: an avatar sitting on the ground (@sitground=force) asked for the
  // box 32 m away. It kept sitting on the ground: llGetAgentInfo had
  // AGENT_SITTING without AGENT_ON_OBJECT, and no script got an event.
  it('leaves an avatar sitting on the ground', async () => {
    const s = await scene()
    s.world.sitAvatarOnGround(s.avatar)
    expect(s.request()).toBe(false)
    expect(s.avatar.info & (AGENT_SITTING | AGENT_ON_OBJECT)).toBe(AGENT_SITTING)
    expect(s.other.changes()).toEqual([])
    expect(s.avatar.viewer.alerts).toEqual([])
  })

  // In-world: a sit request on the box the avatar sat on changed nothing.
  it('leaves the avatar on the prim it sits on', async () => {
    const s = await scene()
    expect(s.request(s.near.prim)).toBe(true)
    expect(s.request(s.near.prim)).toBe(true)
    expect(s.avatar.sittingOn).toBe(s.near.prim)
    expect(s.near.changes()).toEqual([CHANGED_LINK])
  })

  // world.setSitResponse(prim, null) is the fixture's way to refuse a request.
  // On the object the avatar sits on it leaves the avatar seated, as the
  // region did when it refused a request for the avatar's own seat for
  // SIT_FLAG_SCRIPTED_ONLY.
  it('leaves the avatar seated when its own seat refuses', async () => {
    const s = await scene()
    expect(s.request(s.near.prim)).toBe(true)
    s.world.setSitResponse(s.near.prim, null)
    expect(s.request(s.near.prim)).toBe(false)
    expect(s.avatar.sittingOn).toBe(s.near.prim)
    expect(s.near.changes()).toEqual([CHANGED_LINK])
  })

  // In-world: with llSitTarget(<0, 0, 0.6>, ZERO_ROTATION) on the far box
  // (flags read 3) the request seated a standing avatar 32.7 m away, and one
  // that was falling 470 m below it. llAvatarOnSitTarget returned the avatar
  // and the box got one changed(CHANGED_LINK).
  it('seats a standing avatar on a sit target at any distance', async () => {
    for (const below of [0, 470]) {
      const s = await scene(32.7, { target: true })
      s.avatar.position = { x: 116, y: 48, z: 1997.4 - below }
      expect(s.request()).toBe(true)
      expect(s.avatar.sittingOn).toBe(s.other.prim)
      expect(s.avatar.position).toEqual({ x: 148.7, y: 48, z: expect.closeTo(1998.1, 5) })
      expect(s.other.changes()).toEqual([CHANGED_LINK])
    }
  })

  // In-world: seated on the near box, the avatar asked for the far box with
  // the sit target and moved over. Each box got one changed(CHANGED_LINK) for
  // the move.
  it('moves a seated avatar over to a sit target out of reach', async () => {
    const s = await scene(30, { target: true })
    expect(s.request(s.near.prim)).toBe(true)
    expect(s.request()).toBe(true)
    expect(s.avatar.sittingOn).toBe(s.other.prim)
    expect(s.near.changes()).toEqual([CHANGED_LINK, CHANGED_LINK])
    expect(s.other.changes()).toEqual([CHANGED_LINK])
  })
})

describe('@sit:<key>=force on a prim out of reach', () => {
  const source = `list changes; default {
    link_message(integer s, integer n, string m, key id) { llOwnerSay(m); }
    changed(integer c) { changes += [c]; }
  }`

  // In-world: the near box said "@sit:<far box>=force" to its owner with
  // llOwnerSay, the far box 31 m away with flags 2 and no sit target. A
  // standing avatar stayed where it stood and no script got an event. An
  // avatar seated on the near box stood up, and the near box got its second
  // changed(CHANGED_LINK). The viewer showed nothing either time.
  it.each(['rlv', 'rlva'] as const)('%s stands a seated avatar up and leaves a standing one', async (profile) => {
    const fixture = (await loadRlvPair({ source }))[profile]
    const { world, avatar, script } = fixture
    const far = await loadLinkset({ world, region: avatar.region, position: { x: 31, y: 0, z: 0 }, prims: [{}] })
    const force = () => {
      script.fire('link_message', { sender_num: 1, num: 0, str: `@sit:${far.linkset.prims[0]!.key}=force`, id: avatar.key })
      // The region hears of a force sit about 0.25 s after the command.
      script.linkset.advanceTime(250)
      return avatar.viewer.commandLog.at(-1)
    }
    script.start()
    expect(force()).toMatchObject({ actionOutcome: 'refused', reason: 'world-constraint' })
    expect(avatar.sittingOn).toBeNull()
    expect(script.global('changes')).toEqual([])
    world.sitAvatar(avatar, script.host)
    script.linkset.advanceTime(100)
    expect(script.global('changes')).toEqual([CHANGED_LINK])
    expect(force()).toMatchObject({ actionOutcome: 'refused', reason: 'world-constraint', seat: NULL_KEY })
    script.linkset.advanceTime(100)
    expect(avatar.sittingOn).toBeNull()
    expect(script.global('changes')).toEqual([CHANGED_LINK, CHANGED_LINK])
    expect(avatar.viewer.alerts).toEqual([])
  })
})

describe("the viewer's message for a refused sit request", () => {
  // In-world: the far box had sit flags 6 (SIT_FLAG_SCRIPTED_ONLY) and no sit
  // target, 3 m and 30 m from the avatar. Each refused sit request made the
  // viewer show the notification CantSitNoSuitableSurface, "There is no
  // suitable surface to sit on, try another spot.": to a standing avatar and
  // to one seated on the near box (which stood up) at both distances, and at
  // 3 m to one sitting on the ground (which kept sitting). A request refused
  // for a prim out of reach showed nothing; the tests above pin that.
  it.each([3, 30])('shows for a scripted-only refusal %i m away', async (distance) => {
    const standing = await scene(distance, { flags: 6 })
    expect(standing.request()).toBe(false)
    expect(standing.avatar.viewer.alerts).toEqual([NO_SURFACE])

    const seated = await scene(distance, { flags: 6 })
    expect(seated.request(seated.near.prim)).toBe(true)
    expect(seated.request()).toBe(false)
    expect(seated.avatar.sittingOn).toBeNull()
    expect(seated.avatar.viewer.alerts).toEqual([NO_SURFACE])

    if (distance !== 3) return
    const ground = await scene(distance, { flags: 6 })
    ground.world.sitAvatarOnGround(ground.avatar)
    expect(ground.request()).toBe(false)
    expect(ground.avatar.info & AGENT_SITTING).toBe(AGENT_SITTING)
    expect(ground.avatar.viewer.alerts).toEqual([NO_SURFACE])
  })

  // In-world: the avatar sat on a box, the box then got sit flags 6, and the
  // avatar asked for it again. It stayed seated and the viewer showed nothing.
  it('does not show to an avatar seated on the object', async () => {
    const s = await scene(3)
    expect(s.request()).toBe(true)
    s.other.prim.params.sitFlags = 6
    expect(s.request()).toBe(false)
    expect(s.avatar.sittingOn).toBe(s.other.prim)
    expect(s.avatar.viewer.alerts).toEqual([])
  })

  // In-world: refused requests 9 s and 10 s after the message last showed did
  // not show it again. Requests 10.25, 10.5, 10.75, 11, 12 and 13 s after it
  // did. Six requests 7.4 s apart showed it for the first, third and fifth.
  // Firestorm was the only viewer measured.
  it('does not show again within 10 s of the last time it showed', async () => {
    const s = await scene(3, { flags: 6 })
    const shown = () => s.avatar.viewer.alerts.map((alert) => alert.at)
    s.request()
    s.advance(9900)
    s.request()
    expect(shown()).toEqual([0])
    s.advance(150)
    s.request()
    expect(shown()).toEqual([0, 10250])
    for (let i = 0; i < 3; ++i) { s.advance(7300); s.request() }
    expect(shown()).toEqual([0, 10250, 25050])
  })
})

describe("the viewer's message for a refused @sit:<key>=force", () => {
  const source = 'default { link_message(integer s, integer n, string m, key id) { llOwnerSay(m); } }'

  // In-world: the near box said "@sit:<far box>=force" with llOwnerSay, the
  // far box 3 m away with sit flags 6. The viewer showed the message to a
  // standing avatar, and to one seated on the near box, which stood up.
  it.each(['rlv', 'rlva'] as const)('%s shows for a scripted-only refusal', async (profile) => {
    const fixture = (await loadRlvPair({ source }))[profile]
    const { world, avatar, script } = fixture
    const far = await loadLinkset({ world, region: avatar.region, position: { x: 3, y: 0, z: 0 }, prims: [{}] })
    far.linkset.prims[0]!.params.sitFlags = 6
    const force = () => {
      script.fire('link_message', { sender_num: 1, num: 0, str: `@sit:${far.linkset.prims[0]!.key}=force`, id: avatar.key })
      script.linkset.advanceTime(250)
    }
    script.start()
    force()
    expect(avatar.viewer.alerts).toEqual([NO_SURFACE])
    world.sitAvatar(avatar, script.host)
    script.linkset.advanceTime(13000)
    force()
    expect(avatar.sittingOn).toBeNull()
    expect(avatar.viewer.alerts).toEqual([NO_SURFACE, NO_SURFACE])
  })
})
