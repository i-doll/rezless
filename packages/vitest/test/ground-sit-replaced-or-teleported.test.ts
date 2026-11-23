import { describe, expect, it } from 'vitest'
import { AGENT_ON_OBJECT, AGENT_SITTING, NULL_KEY } from '@rezless/vm'
import { loadRlvPair } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Sitting
// @sitground=force from a seat stands the avatar, and the viewer asks for the ground sit once it
// sees the stand. The ground sit lands about 300 ms after the stand.

const seatSource = `default {
  state_entry() { llSitTarget(<0,0,0.6>, ZERO_ROTATION); llRequestPermissions(llGetOwner(), PERMISSION_TELEPORT); }
  link_message(integer sender, integer num, string message, key id) {
    if (num == 1) llTeleportAgent(llGetOwner(), "", <120,60,23>, ZERO_VECTOR);
    else if (num == 2) llTeleportAgentGlobalCoords(llGetOwner(), <0,256,0>, <128,128,23>, ZERO_VECTOR);
    else llOwnerSay(message);
  }
}`
const LANDED_MS = 250
const profiles = ['rlv', 'rlva'] as const

async function fixture(profile: typeof profiles[number]) {
  const { script, avatar, world } = (await loadRlvPair({ source: seatSource }))[profile]
  world.addRegion('north', { x: 0, y: 256 })
  script.start()
  script.grantPermissions()
  const say = (message: string, num = 0) => script.fire('link_message', { sender_num: 1, num, str: message, id: NULL_KEY })
  const wait = (ms: number) => script.linkset.advanceTime(ms)
  const outcomes = (from: number) => avatar.viewer.commandLog.slice(from)
    .map(entry => 'actionOutcome' in entry ? [entry.action, entry.actionOutcome, entry.reason] : [])
  const seat = (bits = avatar.info) => bits & (AGENT_SITTING | AGENT_ON_OBJECT)
  // Seated, then the ground sit's stand has landed and its ground sit waits.
  const waiting = () => {
    say('@sit:' + script.host.key + '=force')
    wait(LANDED_MS)
    const from = avatar.viewer.commandLog.length
    say('@sitground=force')
    wait(LANDED_MS)
    expect(seat()).toBe(0)
    return from
  }
  return { script, avatar, world, say, wait, outcomes, seat, waiting }
}

describe('a force ground sit that a later ground sit replaces', () => {
  // The avatar ends on the ground through the later request, so the first closes as a ground sit
  // that finds the avatar already there does.
  it.each(profiles)('%s records the first as unchanged when a second @sitground=force replaces it', async profile => {
    const f = await fixture(profile)
    const from = f.waiting()
    f.say('@sitground=force')
    f.wait(1000)
    expect(f.seat()).toBe(AGENT_SITTING)
    expect(f.outcomes(from)).toEqual([
      ['sitground', 'pending', undefined],
      ['sitground', 'pending', undefined],
      ['sitground', 'unchanged', undefined],
      ['sitground', 'applied', undefined],
    ])
  })

  it.each(profiles)('%s records the first as unchanged when a menu ground sit replaces it', async profile => {
    const f = await fixture(profile)
    const from = f.waiting()
    expect(f.world.userSitAvatarOnGround(f.avatar)).toBe(true)
    f.wait(1000)
    expect(f.seat()).toBe(AGENT_SITTING)
    expect(f.outcomes(from)).toEqual([
      ['sitground', 'pending', undefined],
      ['sitground', 'unchanged', undefined],
    ])
  })

  it.each(profiles)('%s records both as unchanged when the avatar reaches the ground before the second lands', async profile => {
    const f = await fixture(profile)
    const from = f.waiting()
    f.say('@sitground=force')
    f.wait(50)
    f.world.sitAvatarOnGround(f.avatar)
    f.wait(1000)
    expect(f.seat()).toBe(AGENT_SITTING)
    expect(f.outcomes(from)).toEqual([
      ['sitground', 'pending', undefined],
      ['sitground', 'pending', undefined],
      ['sitground', 'unchanged', undefined],
      ['sitground', 'unchanged', undefined],
    ])
  })

  // Kokua's menu ground sit asks the same sitDown as its @sitground=force, which checks @sit.
  it('rlv records the first as refused when a locked menu ground sit replaces it', async () => {
    const f = await fixture('rlv')
    const from = f.waiting()
    f.say('@sit=n')
    expect(f.world.userSitAvatarOnGround(f.avatar)).toBe(false)
    f.wait(1000)
    expect(f.seat()).toBe(0)
    expect(f.outcomes(from)).toEqual([
      ['sitground', 'pending', undefined],
      [],
      ['sitground', 'refused', 'world-constraint'],
    ])
  })
})

describe('a teleport while a force ground sit waits for its stand', () => {
  // In-world: a worn probe said "@sitground=force" from a seat, then "@tpto:<x/y/z>=force" after 0 to
  // 0.47 s, and polled llGetAgentInfo every 20 ms (Aditi, SLua Tideland and SLua Tombolo, Firestorm
  // RLVa 2.4.2, 2026-11-23). Within SLua Tideland, in all five runs whose teleport arrived before
  // the ground sit landed (teleport sent 0.02 to 0.22 s after the command), the avatar arrived
  // sitting on the ground at the destination, and the ground sit came with the arrival, 0.02 to
  // 0.22 s after the stand rather than the usual 0.3 s. In the three runs whose ground sit landed
  // first, the teleport stood the avatar up. To SLua Tombolo, all eight runs arrived standing: the
  // ground sit either landed in SLua Tideland before the avatar left, or never did.
  it.each(profiles)('%s sits the avatar on the ground at the destination within the region', async profile => {
    const f = await fixture(profile)
    const from = f.waiting()
    expect(f.world.teleportAvatar(f.avatar, { x: 120, y: 60, z: 23 })).toBe(true)
    expect(f.seat()).toBe(AGENT_SITTING)
    expect(f.avatar.region).toBe('RLV fixture')
    expect(f.avatar.position).toEqual({ x: 120, y: 60, z: 23 })
    f.wait(3000)
    expect(f.seat()).toBe(AGENT_SITTING)
    expect(f.outcomes(from)).toEqual([
      ['sitground', 'pending', undefined],
      ['sitground', 'applied', undefined],
    ])
  })

  it.each(profiles)('%s leaves the avatar standing in another region and drops the ground sit', async profile => {
    const f = await fixture(profile)
    const from = f.waiting()
    expect(f.world.teleportAvatar(f.avatar, { x: 128, y: 384, z: 23 })).toBe(true)
    f.wait(3000)
    expect(f.avatar.region).toBe('north')
    expect(f.seat()).toBe(0)
    expect(f.outcomes(from)).toEqual([
      ['sitground', 'pending', undefined],
      ['sitground', 'refused', 'world-constraint'],
    ])
  })

  it.each(profiles)('%s stands an avatar whose ground sit landed before the teleport', async profile => {
    const f = await fixture(profile)
    f.waiting()
    f.wait(300)
    expect(f.seat()).toBe(AGENT_SITTING)
    expect(f.world.teleportAvatar(f.avatar, { x: 120, y: 60, z: 23 })).toBe(true)
    f.wait(3000)
    expect(f.seat()).toBe(0)
  })

  // In-world: "@standtp=n", force sit, "@sitground=force" -> the standtp return stood the avatar
  // back where it stood before the sit, no ground sit. Then "@standtp=y", force sit on the seat and
  // "@tpto=force" from the seat: within SLua Tideland the avatar arrived sitting on the ground, two
  // runs, while a teleport from the seat without the kept ground sit arrived standing; to SLua
  // Tombolo it arrived standing, two runs (Aditi, Firestorm RLVa 2.4.2, 2026-11-23).
  async function kept() {
    const f = await fixture('rlva')
    f.avatar.position = { x: 10, y: 20, z: 30 }
    f.say('@standtp=n')
    f.say('@sit:' + f.script.host.key + '=force')
    f.wait(LANDED_MS)
    f.say('@sitground=force')
    f.wait(1000)
    expect(f.seat()).toBe(0)
    f.say('@standtp=y')
    expect(f.world.sitAvatar(f.avatar, f.script.host)).toBe(true)
    return f
  }

  it('rlva sits the avatar on the ground on arrival when a teleport within the region runs a kept ground sit', async () => {
    const f = await kept()
    expect(f.world.teleportAvatar(f.avatar, { x: 120, y: 60, z: 23 })).toBe(true)
    expect(f.seat()).toBe(AGENT_SITTING)
    f.wait(3000)
    expect(f.seat()).toBe(AGENT_SITTING)
  })

  it('rlva leaves the avatar standing when a teleport to another region runs a kept ground sit', async () => {
    const f = await kept()
    expect(f.world.teleportAvatar(f.avatar, { x: 128, y: 384, z: 23 })).toBe(true)
    f.wait(3000)
    expect(f.avatar.region).toBe('north')
    expect(f.seat()).toBe(0)
  })

  // Kokua's standtp return teleports the avatar as it stands, before it asks for the ground sit.
  // It follows the region's handling measured with RLVa above; no Kokua viewer was available to
  // measure it.
  it('rlv sits a standtp avatar on the ground as the return lands', async () => {
    const f = await fixture('rlv')
    f.avatar.position = { x: 10, y: 20, z: 30 }
    f.say('@standtp=n')
    f.say('@sit:' + f.script.host.key + '=force')
    f.wait(LANDED_MS)
    f.avatar.position = { x: 50, y: 60, z: 70 }
    f.say('@sitground=force')
    f.wait(LANDED_MS)
    expect(f.seat()).toBe(AGENT_SITTING)
    expect(f.avatar.position).toMatchObject({ x: 10, y: 20 })
  })
})

describe('a script teleport while a force ground sit waits', () => {
  // In-world: a seat said "@sitground=force" and called llTeleportAgent within SLua Tideland after 0
  // to 0.35 s: the avatar arrived standing and the ground sit followed at the destination 0.02 to
  // 0.29 s later, five runs. llTeleportAgentGlobalCoords to SLua Tombolo after 0 to 0.2 s arrived
  // standing, three runs (Aditi, Firestorm RLVa 2.4.2, 2026-11-23).
  it.each(profiles)('%s sits the avatar on the ground at the destination after llTeleportAgent', async profile => {
    const f = await fixture(profile)
    f.say('@sit:' + f.script.host.key + '=force')
    f.wait(LANDED_MS)
    const from = f.avatar.viewer.commandLog.length
    f.say('@sitground=force')
    f.say('', 1)
    expect(f.avatar.position).toEqual({ x: 120, y: 60, z: 23 })
    f.wait(1000)
    expect(f.seat()).toBe(AGENT_SITTING)
    expect(f.avatar.position).toEqual({ x: 120, y: 60, z: 23 })
    expect(f.outcomes(from).filter(entry => entry.length)).toEqual([
      ['sitground', 'pending', undefined],
      ['sitground', 'applied', undefined],
    ])
  })

  it.each(profiles)('%s leaves the avatar standing after llTeleportAgentGlobalCoords to another region', async profile => {
    const f = await fixture(profile)
    f.say('@sit:' + f.script.host.key + '=force')
    f.wait(LANDED_MS)
    const from = f.avatar.viewer.commandLog.length
    f.say('@sitground=force')
    f.say('', 2)
    f.wait(1000)
    expect(f.avatar.region).toBe('north')
    expect(f.seat()).toBe(0)
    expect(f.outcomes(from).filter(entry => entry.length)).toEqual([
      ['sitground', 'pending', undefined],
      ['sitground', 'refused', 'world-constraint'],
    ])
  })

  it.each(profiles)('%s drops a ground sit waiting after its stand when llTeleportAgentGlobalCoords leaves the region', async profile => {
    const f = await fixture(profile)
    const from = f.waiting()
    f.say('', 2)
    f.wait(1000)
    expect(f.avatar.region).toBe('north')
    expect(f.seat()).toBe(0)
    expect(f.outcomes(from)).toEqual([
      ['sitground', 'pending', undefined],
      ['sitground', 'refused', 'world-constraint'],
    ])
  })
})
