import { describe, expect, it } from 'vitest'
import { NULL_KEY } from '@rezless/vm'
import { loadLinkset, loadRlvPair, World } from '../src/index.js'

// A ground sit the user picks from the viewer's own menu, not one an RLV
// command forces. https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Sitting
// lists @sit as "prevents the user from sitting on anything", and @unsit as
// "prevents the user from standing up".
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm 7.3.0 with RLVa,
// 2026-11-23), one avatar. A rezzed box held the restrictions, set with
// llOwnerSay, and read llGetAgentInfo(llGetOwner()) from a chat command and
// in changed(CHANGED_LINK). The viewer then asked for a ground sit as its menu
// does. Every "In-world:" note in this file is from those probes. Kokua was not
// available on the grid; its menu ground sit is taken to ask the same sitDown
// as its @sitground=force, which rlv-sitground.test.ts reads from its source.

const AGENT_SITTING = 0x10, AGENT_ON_OBJECT = 0x20
const source = `list seen; default {
  state_entry() { llSitTarget(<0, 0, 0.6>, ZERO_ROTATION); }
  link_message(integer s, integer n, string m, key id) { llOwnerSay(m); }
  changed(integer c) { if (c & CHANGED_LINK) seen += llGetAgentInfo(llGetOwner()) & 48; }
}`

async function rlva() {
  const { rlva } = await loadRlvPair({ source })
  const { script, avatar, world } = rlva
  script.start()
  const say = (message: string) => {
    script.fire('link_message', { sender_num: 1, num: 0, str: message, id: NULL_KEY })
    script.linkset.advanceTime(0)
  }
  const ground = () => { const accepted = world.userSitAvatarOnGround(avatar); script.linkset.advanceTime(600); return accepted }
  const sitting = () => avatar.info & (AGENT_SITTING | AGENT_ON_OBJECT)
  return { script, avatar, world, say, ground, sitting }
}

describe('a ground sit from the viewer menu', () => {
  // In-world: standing (llGetAgentInfo 16390), the menu ground sit -> 16406:
  // sitting, not on an object.
  it('sits a standing avatar on the ground', async () => {
    const f = await rlva()
    expect(f.ground()).toBe(true)
    expect(f.sitting()).toBe(AGENT_SITTING)
  })

  // In-world: seated on the box, the menu ground sit -> the box's
  // changed(CHANGED_LINK) read 16646, standing, then a dump read 16406.
  it('stands a seated avatar up, then sits it on the ground', async () => {
    const f = await rlva()
    expect(f.world.userSitAvatar(f.avatar, f.script.host)).toBe(true)
    f.script.linkset.advanceTime(100)
    expect(f.ground()).toBe(true)
    expect(f.script.global('seen')).toEqual([AGENT_SITTING | AGENT_ON_OBJECT, 0])
    expect(f.avatar.sittingOn).toBeNull()
    expect(f.sitting()).toBe(AGENT_SITTING)
  })

  // In-world: standing under "@sit=n", the ground sit was refused, twice, and
  // the dump read 16390.
  it('is refused under @sit', async () => {
    const f = await rlva()
    f.say('@sit=n')
    expect(f.ground()).toBe(false)
    expect(f.sitting()).toBe(0)
  })

  // In-world: standing under "@unsit=n", the ground sit went ahead (16406). A
  // second one while sitting on the ground was refused, and so was a stand.
  // Seated on the box under "@unsit=n" the ground sit was refused and the
  // avatar stayed on the box.
  it('is refused under @unsit only while sitting', async () => {
    const f = await rlva()
    f.say('@unsit=n')
    expect(f.ground()).toBe(true)
    expect(f.sitting()).toBe(AGENT_SITTING)
    expect(f.ground()).toBe(false)
    expect(f.world.userStandAvatar(f.avatar)).toBe(false)

    const g = await rlva()
    expect(g.world.userSitAvatar(g.avatar, g.script.host)).toBe(true)
    g.script.linkset.advanceTime(100)
    g.say('@unsit=n')
    expect(g.ground()).toBe(false)
    expect(g.avatar.sittingOn).toBe(g.script.host)
  })

  // In-world: standing under each of "@sittp=n", "@sittp:0.1=n", "@standtp=n",
  // "@interact=n" and "@fartouch=n" alone, the ground sit went ahead (16406).
  it.each(['@sittp=n', '@sittp:0.1=n', '@standtp=n', '@interact=n', '@fartouch=n'])('is not refused under %s', async (rule) => {
    const f = await rlva()
    f.say(rule)
    expect(f.ground()).toBe(true)
    expect(f.sitting()).toBe(AGENT_SITTING)
  })
})

describe('a menu ground sit while an earlier one waits for its stand', () => {
  // The earlier ground sit is replaced, so a stand before its delay ends
  // leaves the avatar standing.
  it('does not sit the avatar down again after a stand', async () => {
    const f = await rlva()
    expect(f.world.userSitAvatar(f.avatar, f.script.host)).toBe(true)
    f.script.linkset.advanceTime(100)
    expect(f.world.userSitAvatarOnGround(f.avatar)).toBe(true)
    expect(f.world.userSitAvatarOnGround(f.avatar)).toBe(true)
    expect(f.world.userStandAvatar(f.avatar)).toBe(true)
    f.script.linkset.advanceTime(600)
    expect(f.sitting()).toBe(0)
  })
})

describe('a menu ground sit waiting for its stand when the viewer session resets', () => {
  // A new login clears what the viewer still had to do, though the first RLV
  // command came after the ground sit was asked for.
  it('is dropped', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const avatar = world.addAvatar({ username: 'av', region: 'home', position: { x: 10, y: 10, z: 20 }, viewer: { profile: 'rlva' } })
    const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: avatar.key, position: { x: 12, y: 10, z: 20 },
      prims: [{ scripts: [{ name: 'seat', source: { source } }] }] })
    scripts.seat!.start()
    expect(world.userSitAvatar(avatar, linkset.prims[0]!)).toBe(true)
    linkset.advanceTime(100)
    expect(world.userSitAvatarOnGround(avatar)).toBe(true)
    scripts.seat!.fire('link_message', { sender_num: 1, num: 0, str: '@versionnum=0', id: NULL_KEY })
    linkset.advanceTime(0)
    avatar.viewer.session.reset()
    linkset.advanceTime(600)
    expect(avatar.info & AGENT_SITTING).toBe(0)
  })
})

describe('a ground sit from the viewer menu under @standtp', () => {
  // In-world: with "@standtp=n", the avatar sat on the box from about 4.6 m
  // away, then asked for the menu ground sit. The box's changed(CHANGED_LINK)
  // read 16646, standing; the avatar was back near where it sat from, and
  // dumps 3 s and 6 s later read 16390: standing, not on the ground.
  it('stands a seated avatar up and leaves it standing where the return takes it', async () => {
    const f = await rlva()
    f.avatar.position = { x: 10, y: 10, z: 20 }
    f.say('@standtp=n')
    const from = { ...f.avatar.position }
    expect(f.world.userSitAvatar(f.avatar, f.script.host)).toBe(true)
    f.script.linkset.advanceTime(100)
    f.avatar.position = { x: from.x + 4, y: from.y, z: from.z }
    expect(f.ground()).toBe(true)
    f.script.linkset.advanceTime(3000)
    expect(f.sitting()).toBe(0)
    expect(f.avatar.position).toMatchObject({ x: expect.closeTo(from.x, 3), y: expect.closeTo(from.y, 3) })
  })
})

describe('a ground sit from the viewer menu in Kokua', () => {
  // From Kokua's source: its sitDown refuses under @sit and @interact.
  it.each(['@sit=n', '@interact=n'])('is refused under %s', async (rule) => {
    const { rlv } = await loadRlvPair({ source })
    rlv.script.start()
    rlv.script.fire('link_message', { sender_num: 1, num: 0, str: rule, id: NULL_KEY })
    rlv.script.linkset.advanceTime(0)
    expect(rlv.world.userSitAvatarOnGround(rlv.avatar)).toBe(false)
    expect(rlv.avatar.info & AGENT_SITTING).toBe(0)
  })
})
