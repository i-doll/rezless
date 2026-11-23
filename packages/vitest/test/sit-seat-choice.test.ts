import { describe, expect, it } from 'vitest'
import { loadLinkset, loadRlvPair, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlSetLinkSitFlags: SIT_FLAG_SCRIPTED_ONLY,
// "Only allow scripted sits on this sit target." The page does not say which
// sit target a sit request takes when some of an object's targets carry it.
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm 7.3.0 with RLVa,
// 2026-11-23): three linked 0.5 m boxes 1.5 m apart along Y, each with
// llLinkSitTarget(<0, 0, 0.6>, ZERO_ROTATION), sit flags set per link with
// llSetLinkSitFlags. The standing avatar's viewer sent a plain sit request for
// one prim. A script in the root read llAvatarOnLinkSitTarget for each link in
// changed(CHANGED_LINK). Every "In-world:" note in this file is from those
// probes.

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'
const TARGET = { enabled: true, offset: { x: 0, y: 0, z: 0.6 }, rotation: { x: 0, y: 0, z: 0, s: 1 } }

async function three(flags: number[]) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({
    region: 'home', key: AVATAR, name: 'av', username: 'av', size: { x: 0.45, y: 0.6, z: 1.65 },
    position: { x: 118, y: 48, z: 20 },
  })
  const { linkset } = await loadLinkset({ world, region: 'home', owner: AVATAR, position: { x: 124, y: 46, z: 20 }, prims: flags.map(() => ({})) })
  linkset.prims.forEach((prim, i) => {
    if (i) prim.params.position = { x: 0, y: 1.5 * i, z: 0 }
    prim.params.sitFlags = flags[i]!
    prim.params.sitTarget = TARGET
  })
  return { world, avatar, linkset }
}

describe('which sit target a sit request takes when some are scripted-only', () => {
  // In-world, each row is the sit flags of links 1 to 3, the link asked for and
  // the link whose sit target the avatar took. The request takes the asked-for
  // prim's target when it is free and not scripted-only, else the first such
  // target in link order: not the next link after it, and not the nearest. With
  // every target scripted-only the request was refused.
  it.each([
    [[2, 2, 2], 2, 2],
    [[2, 6, 2], 2, 1],
    [[2, 2, 6], 3, 1],
    [[6, 2, 2], 1, 2],
    [[6, 2, 2], 3, 3],
    [[6, 6, 2], 1, 3],
    [[6, 2, 6], 3, 2],
    [[2, 6, 6], 3, 1],
    [[6, 6, 6], 1, 0],
  ])('flags %j, asked for link %i: sits on link %i', async (flags, link, seat) => {
    const { world, avatar, linkset } = await three(flags)
    expect(world.userSitAvatar(avatar, linkset.prims[link - 1]!)).toBe(seat !== 0)
    linkset.advanceTime(100)
    expect(avatar.sittingOn).toBe(seat ? linkset.prims[seat - 1] : null)
    if (seat) expect(world.avatarOnSitTarget(linkset.prims[seat - 1]!)).toBe(avatar)
  })
})

describe('moving between seats of one object', () => {
  // In-world: seated on link 1's sit target (flags 2 on all three), the root
  // said "@sit:<link 2>=force" and then "@sit:<link 3>=force" with llOwnerSay.
  // After each the avatar was still on link 1's sit target and the script got
  // no changed event, as for a plain sit request on another prim of the seat.
  // A sitter can only change seats in one object by standing up first, or
  // through llSitOnLink, which needs an experience.
  it('@sit:<key>=force on another link leaves the sitter where it is', async () => {
    const { rlva } = await loadRlvPair({ source: 'default { link_message(integer s, integer n, string m, key id) { llOwnerSay(m); } }' })
    const { world, avatar, script } = rlva
    script.start()
    const { linkset } = await loadLinkset({ world, region: avatar.region, owner: avatar.key, prims: [{}, {}, {}] })
    linkset.prims.forEach((prim, i) => {
      if (i) prim.params.position = { x: 0, y: 1.5 * i, z: 0 }
      prim.params.sitTarget = TARGET
    })
    expect(world.userSitAvatar(avatar, linkset.prims[0]!)).toBe(true)
    linkset.advanceTime(100)
    for (const prim of linkset.prims.slice(1)) {
      script.fire('link_message', { sender_num: 1, num: 0, str: `@sit:${prim.key}=force`, id: avatar.key })
      script.host.linkset!.advanceTime(350)
      expect(avatar.sittingOn).toBe(linkset.prims[0])
      expect(world.avatarOnSitTarget(linkset.prims[0]!)).toBe(avatar)
    }
  })
})

describe('a sit request from several metres away', () => {
  // In-world: from 9.6 m, a sit request on a box with a sit target, and from
  // 6.4 m one on the root of the three boxes without sit targets, seated the
  // avatar within 0.4 to 0.5 s of the request, with changed(CHANGED_LINK). The
  // region's answer sometimes asked the viewer to walk to the seat, but the
  // region had seated the avatar before a walk could start, so no sit request
  // could be sent during one. rezless seats the avatar at once and starts no
  // walk unless world.setSitResponse asks for one.
  it('seats the avatar without a walk', async () => {
    const { world, avatar, linkset } = await three([2, 2, 2])
    linkset.prims.forEach(prim => { prim.params.sitTarget = { ...TARGET, enabled: false } })
    expect(world.userSitAvatar(avatar, linkset.prims[0]!)).toBe(true)
    expect(avatar.sittingOn).toBe(linkset.prims[0])
  })
})
