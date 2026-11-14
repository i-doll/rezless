import { describe, expect, it } from 'vitest'
import { loadLinkset, loadRlvPair, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlSetLinkSitFlags: SIT_FLAG_SCRIPTED_ONLY,
// "Only allow scripted sits on this sit target." The page says nothing about a
// prim without a sit target, the other prims of the object, or what a refused
// avatar and the scripts see.
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm 7.3.0 with RLVa,
// 2026-11-13): a lone box and three linked boxes 1.5 m apart, one avatar 2 m
// away. A script in each root set sit flags with llSetLinkSitFlags and sit
// targets with llLinkSitTarget, and reported changed(), llGetAgentInfo,
// llAvatarOnLinkSitTarget and the sitter's PRIM_POS_LOCAL. The viewer sent a
// plain sit request for the named prim. Every "In-world:" note in this file is
// from those probes.

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'
const CHANGED_LINK = 32
const AGENT_SITTING = 16
const TARGET = { enabled: true, offset: { x: 0, y: 0, z: 0.6 }, rotation: { x: 0, y: 0, z: 0, s: 1 } }
const SCRIPT = `
  list changes;
  default {
    changed(integer c) { changes += [c]; }
    touch_start(integer n) { llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_SCRIPTED_SIT_ONLY, TRUE]); }
  }`

/** One object per entry of `objects`: the sit flags of its prims, the links that have a sit target, and where it is. */
async function scene(...objects: { flags: number[]; targets?: number[]; y?: number }[]) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({
    region: 'home', key: AVATAR, name: 'av', username: 'av', size: { x: 0.45, y: 0.6, z: 1.65 },
    position: { x: 114, y: 50, z: 20 },
  })
  const loaded = []
  for (const [n, { flags, targets = [], y = 50 - 2 * n }] of objects.entries()) {
    const object = await loadLinkset({
      world, region: 'home', owner: AVATAR, position: { x: 116, y, z: 20 },
      prims: flags.map((_, i) => ({ name: `p${i + 1}`, scripts: i ? [] : [{ name: 'root', source: { source: SCRIPT } }] })),
    })
    object.linkset.prims.forEach((prim, i) => {
      if (i) prim.params.position = { x: 0, y: 1.5 * i, z: 0 }
      prim.params.sitFlags = flags[i]!
      if (targets.includes(i + 1)) prim.params.sitTarget = TARGET
    })
    object.scripts.root!.start()
    loaded.push(object)
  }
  const advance = () => loaded.forEach(({ linkset }) => linkset.advanceTime(100))
  /** A viewer sit request on `link` of object `n`. Returns the link the avatar then sits on in that object, or 0. */
  const sit = (link: number, n = 0) => {
    const { linkset } = loaded[n]!
    const accepted = world.userSitAvatar(avatar, linkset.prims[link - 1]!)
    advance()
    const seat = avatar.sittingOn?.linkset === linkset ? avatar.sittingOn.linkNumber : 0
    expect(accepted).toBe(seat !== 0)
    return seat
  }
  const stand = () => { world.standAvatar(avatar); advance() }
  const changes = (n = 0) => loaded[n]!.scripts.root!.global('changes') as number[]
  return { world, avatar, loaded, sit, stand, advance, changes }
}

describe('a sit request on an object with a SIT_FLAG_SCRIPTED_ONLY prim', () => {
  // In-world: with sit flags 6 on a lone box without a sit target, with 6 and a
  // sit target (read back as 7), and with 4 and a sit target (5), the sit request
  // left the avatar standing where it was. The script got no event. The viewer
  // showed "There is no suitable surface to sit on, try another spot." With flags
  // 2 the same request seated the avatar and raised changed(CHANGED_LINK).
  it.each([
    [6, false], [6, true], [4, true],
  ])('is refused on a lone prim with flags %i, sit target %s', async (flags, target) => {
    const s = await scene({ flags: [flags], targets: target ? [1] : [] })
    expect(s.sit(1)).toBe(0)
    expect(s.avatar.sittingOn).toBeNull()
    expect(s.changes()).toEqual([])
    s.loaded[0]!.linkset.prims[0]!.params.sitFlags = 2
    expect(s.sit(1)).toBe(1)
    expect(s.changes()).toEqual([CHANGED_LINK])
  })

  // In-world: [PRIM_SCRIPTED_SIT_ONLY, TRUE] on the lone box made flags 3 read 7
  // and the sit request was refused.
  it('is refused after PRIM_SCRIPTED_SIT_ONLY', async () => {
    const s = await scene({ flags: [2], targets: [1] })
    s.loaded[0]!.linkset.touch(0)
    s.advance()
    expect(s.sit(1)).toBe(0)
  })

  // In-world: the avatar sat on the lone box with flags 3. Setting flags 6 left
  // it seated, and a sit request on the box it sat on changed nothing. After it
  // stood up the request was refused.
  it('leaves a seated avatar seated when the flag is set', async () => {
    const s = await scene({ flags: [2], targets: [1] })
    expect(s.sit(1)).toBe(1)
    s.loaded[0]!.linkset.prims[0]!.params.sitFlags = 6
    s.advance()
    expect(s.avatar.sittingOn).toBe(s.loaded[0]!.linkset.prims[0])
    expect(s.world.userSitAvatar(s.avatar, s.loaded[0]!.linkset.prims[0]!)).toBe(false)
    s.advance()
    expect(s.avatar.sittingOn).toBe(s.loaded[0]!.linkset.prims[0])
    expect(s.changes()).toEqual([CHANGED_LINK])
    s.stand()
    expect(s.sit(1)).toBe(0)
    expect(s.changes()).toEqual([CHANGED_LINK, CHANGED_LINK])
  })

  // In-world, three boxes and no sit target: with flags 6 on the root only, on
  // child 2 only and on child 3 only, a sit request on each of the three prims
  // was refused. With flags 2 on all three the avatar sat on the prim asked for
  // (0.3 m from the root for link 1, 2.7 m along the row for link 3).
  it.each([
    [[6, 2, 2]], [[2, 6, 2]], [[2, 2, 6]],
  ])('is refused on every prim when no prim has a sit target: flags %j', async (flags) => {
    for (const link of [1, 2, 3]) {
      const s = await scene({ flags })
      expect(s.sit(link)).toBe(0)
      expect(s.changes()).toEqual([])
    }
  })

  it('seats the avatar on the prim asked for when no prim is scripted-only', async () => {
    for (const link of [1, 3]) {
      const s = await scene({ flags: [2, 2, 2] })
      expect(s.sit(link)).toBe(link)
    }
  })

  // In-world, three boxes with sit targets. Each row is the flags of links 1 to
  // 3, the links with a sit target, the link asked for and the link whose sit
  // target the avatar took (llAvatarOnLinkSitTarget, and its PRIM_POS_LOCAL was
  // on that prim). A scripted-only sit target is passed over for the next one. A
  // scripted-only prim without a sit target refuses nothing while another sit
  // target is free. With no sit target left the request was refused.
  it.each([
    [[2, 2, 6], [2], 1, 2],
    [[2, 2, 6], [2], 2, 2],
    [[2, 2, 6], [2], 3, 2],
    [[6, 2, 2], [2], 1, 2],
    [[6, 2, 2], [1, 2], 2, 2],
    [[6, 2, 2], [1, 2], 3, 2],
    [[2, 6, 2], [1, 2], 1, 1],
    [[2, 6, 2], [1, 2], 3, 1],
    [[2, 2, 2], [1, 2], 3, 1],
    [[2, 2, 2], [1, 2], 2, 2],
    [[6, 6, 2], [1, 2], 3, 0],
    [[6, 6, 2], [1, 2], 1, 0],
    [[2, 6, 2], [2], 1, 0],
    [[2, 6, 2], [2], 3, 0],
  ])('flags %j, sit targets on %j, asked for link %i: sits on link %i', async (flags, targets, link, seat) => {
    const s = await scene({ flags, targets })
    expect(s.sit(link)).toBe(seat)
    expect(s.changes()).toEqual(seat ? [CHANGED_LINK] : [])
  })

  // In-world: the avatar sat on the lone box (flags 3). A sit request on the
  // root of the three boxes, whose root had flags 6 and no sit target, was
  // refused and the avatar stood up from the lone box: its script got a second
  // changed(CHANGED_LINK) and read one link and an avatar that no longer sat. The
  // same for a request on child 3. The three boxes got no event. With flags 2 on
  // all three the avatar moved over, and each object got one event.
  it.each([1, 3])('stands the avatar up from another object: asked for link %i', async (link) => {
    const s = await scene({ flags: [2], targets: [1] }, { flags: [6, 2, 2] })
    expect(s.sit(1)).toBe(1)
    expect(s.sit(link, 1)).toBe(0)
    expect(s.avatar.sittingOn).toBeNull()
    expect(s.changes(0)).toEqual([CHANGED_LINK, CHANGED_LINK])
    expect(s.changes(1)).toEqual([])
  })

  // In-world: the same from the lone box with the refusing box 30 m away.
  it('stands the avatar up from another object 30 m away', async () => {
    const s = await scene({ flags: [2], targets: [1] }, { flags: [6], y: 80 })
    expect(s.sit(1)).toBe(1)
    expect(s.sit(1, 1)).toBe(0)
    expect(s.avatar.sittingOn).toBeNull()
    expect(s.changes(0)).toEqual([CHANGED_LINK, CHANGED_LINK])
  })

  // In-world: an avatar sitting on the ground (AGENT_SITTING without
  // AGENT_ON_OBJECT) still sat on the ground after a refused request.
  it('leaves an avatar sitting on the ground', async () => {
    const s = await scene({ flags: [6, 6, 2] })
    s.world.sitAvatarOnGround(s.avatar)
    expect(s.sit(1)).toBe(0)
    expect(s.avatar.info & AGENT_SITTING).toBe(AGENT_SITTING)
    expect(s.changes()).toEqual([])
  })

  it('moves the avatar over from another object when no prim is scripted-only', async () => {
    const s = await scene({ flags: [2], targets: [1] }, { flags: [2, 2, 2] })
    expect(s.sit(1)).toBe(1)
    expect(s.sit(1, 1)).toBe(1)
    expect(s.changes(0)).toEqual([CHANGED_LINK, CHANGED_LINK])
    expect(s.changes(1)).toEqual([CHANGED_LINK])
  })

  // In-world: the avatar sat on the root of the three boxes (no sit targets,
  // flags 2). With flags 6 then set on child 3, sit requests on child 3 and on
  // child 2 left it seated where it was, and the script got no event.
  it('leaves the avatar on the object it sits on', async () => {
    const s = await scene({ flags: [2, 2, 2] })
    expect(s.sit(1)).toBe(1)
    const { prims } = s.loaded[0]!.linkset
    prims[2]!.params.sitFlags = 6
    for (const prim of [prims[2]!, prims[1]!]) {
      expect(s.world.userSitAvatar(s.avatar, prim)).toBe(false)
      s.advance()
      expect(s.avatar.sittingOn).toBe(prims[0])
    }
    expect(s.changes()).toEqual([CHANGED_LINK])
  })

  // In-world: with sit targets on links 1 and 2 and the avatar on link 1's,
  // flags 6 were set on link 2. A sit request on link 2 left the avatar on link
  // 1 and the script got no event.
  it('leaves the avatar on its sit target when asked for a scripted-only one', async () => {
    const s = await scene({ flags: [2, 2, 2], targets: [1, 2] })
    expect(s.sit(1)).toBe(1)
    const { prims } = s.loaded[0]!.linkset
    prims[1]!.params.sitFlags = 6
    s.world.userSitAvatar(s.avatar, prims[1]!)
    s.advance()
    expect(s.avatar.sittingOn).toBe(prims[0])
    expect(s.changes()).toEqual([CHANGED_LINK])
  })

  // https://wiki.secondlife.com/wiki/LlSitOnLink seats an avatar from a script,
  // which is what the flag leaves open. It needs an experience, which the probes
  // did not have, so this is from the wiki's wording and not measured.
  // world.sitAvatar is the same forced seating.
  it('does not refuse forced seating', async () => {
    const s = await scene({ flags: [6], targets: [1] })
    expect(s.world.sitAvatar(s.avatar, s.loaded[0]!.linkset.prims[0]!)).toBe(true)
    s.advance()
    expect(s.changes()).toEqual([CHANGED_LINK])
  })
})

// In-world: a box said "@sit:<key>=force" to its owner with llOwnerSay, the
// key being its own or that of a link of the three boxes. The viewer was
// Firestorm with RLVa. The rlv profile gets the same results here because the
// region refuses the request, whichever viewer sends it.
describe('@sit:<key>=force on an object with a scripted-only prim', () => {
  const source = (flags: number) => `list changes; default {
    state_entry() { llSitTarget(<0.0, 0.0, 0.6>, ZERO_ROTATION); llSetLinkSitFlags(LINK_THIS, ${flags}); }
    link_message(integer s, integer n, string m, key id) { llOwnerSay(m); }
    changed(integer c) { changes += [c]; }
  }`
  const refused = { status: 'action', actionOutcome: 'refused', reason: 'world-constraint' }

  async function each(flags: number, run: (fixture: Awaited<ReturnType<typeof loadRlvPair>>['rlv'], force: (key: string) => void) => Promise<void>) {
    for (const fixture of Object.values(await loadRlvPair({ source: source(flags) }))) {
      const { script, avatar } = fixture
      script.start()
      await run(fixture, (key) => {
        script.fire('link_message', { sender_num: 1, num: 0, str: `@sit:${key}=force`, id: avatar.key })
        // The region hears of a force sit about 0.25 s after the command.
        script.host.linkset!.advanceTime(350)
      })
    }
  }
  const boxes = async (fixture: Awaited<ReturnType<typeof loadRlvPair>>['rlv'], flags: number[], targets: number[]) => {
    const { linkset } = await loadLinkset({ world: fixture.world, region: fixture.avatar.region, owner: fixture.avatar.key, prims: flags.map(() => ({})) })
    linkset.prims.forEach((prim, i) => {
      prim.params.sitFlags = flags[i]!
      if (targets.includes(i + 1)) prim.params.sitTarget = TARGET
    })
    return linkset.prims
  }

  // In-world: with flags 7 on the box that asked, the avatar stayed standing
  // and the script got no event. With flags 3 it sat on the box.
  it.each([[6, false], [2, true]])('on the lone prim with flags %i: seated %s', async (flags, seated) => {
    await each(flags, async ({ script, avatar }, force) => {
      force(script.host.key)
      expect(avatar.sittingOn).toBe(seated ? script.host : null)
      expect(script.global('changes')).toEqual(seated ? [CHANGED_LINK] : [])
      expect(avatar.viewer.commandLog.at(-1)).toMatchObject(seated ? { status: 'action', actionOutcome: 'applied' } : refused)
    })
  })

  // In-world: the avatar sat on the lone box (flags 3), which then asked for the
  // root of the three boxes, whose root had flags 6 and no sit target. The
  // avatar stood up from the lone box, whose script got a second
  // changed(CHANGED_LINK). With flags 2 on all three it moved over.
  it('stands the avatar up from another object', async () => {
    await each(2, async (fixture, force) => {
      const { script, avatar } = fixture
      const prims = await boxes(fixture, [6, 2, 2], [])
      force(script.host.key)
      expect(avatar.sittingOn).toBe(script.host)
      force(prims[0]!.key)
      expect(avatar.sittingOn).toBeNull()
      expect(script.global('changes')).toEqual([CHANGED_LINK, CHANGED_LINK])
      expect(avatar.viewer.commandLog.at(-1)).toMatchObject(refused)
    })
  })

  // In-world, the three boxes: with sit targets on links 1 and 2 and flags 7, 3
  // and 2, asking for link 1 and for link 3 seated the avatar on link 2's sit
  // target. With a sit target on link 2 only and flags 2, 7 and 2, asking for
  // link 1 and for link 3 left the avatar standing.
  it.each([
    [[6, 2, 2], [1, 2], 1, 2],
    [[6, 2, 2], [1, 2], 3, 2],
    [[2, 6, 2], [2], 1, 0],
    [[2, 6, 2], [2], 3, 0],
  ])('flags %j, sit targets on %j, asked for link %i: sits on link %i', async (flags, targets, link, seat) => {
    await each(2, async (fixture, force) => {
      const prims = await boxes(fixture, flags, targets)
      force(prims[link - 1]!.key)
      expect(fixture.avatar.sittingOn ?? null).toBe(seat ? prims[seat - 1] : null)
      if (!seat) expect(fixture.avatar.viewer.commandLog.at(-1)).toMatchObject(refused)
    })
  })
})
