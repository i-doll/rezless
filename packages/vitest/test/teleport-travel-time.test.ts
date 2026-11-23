import { describe, expect, it } from 'vitest'
import { AGENT_ON_OBJECT, AGENT_SITTING, CHANGED_REGION, CHANGED_TELEPORT, NULL_KEY } from '@rezless/vm'
import { loadLinkset, loadRlvPair } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Teleportation
// https://wiki.secondlife.com/wiki/LlTeleportAgent
// https://wiki.secondlife.com/wiki/LlTeleportAgentGlobalCoords
// The wiki gives no travel time. Every figure below was measured on the Aditi beta grid with
// Firestorm RLVa 2.4.2 on 2026-11-23, with a worn object that sent the request, stamped it with
// llGetTimestamp and logged its own changed event, and a seat in SLua Tideland that watched the
// avatar with llGetObjectDetails, llGetAgentSize and llGetAnimation. Destinations: elsewhere in
// SLua Tideland, SLua Tombolo (the next region north) and Cloud Sandbox 2 (far away).
//
// In-world: @tpto within SLua Tideland, 40 runs: the worn object's changed event came 199 to 245 ms
// after the command, in 22 ms region frames (199-202 ms: 11, 220-224 ms: 23, 244-245 ms: 6), mean
// 220 ms. The avatar left for another region after the same delay: the watch read "Init" about
// 200 ms after the command.
// In-world: llTeleportAgent within the region moved the avatar inside the call, and changed came
// 0 to 1 ms later, 15 runs. A viewer teleport within the region landed -27 to +35 ms from when a
// chat line sent at the same moment reached the region, 8 runs.
// In-world: into another region, the worn object's changed (CHANGED_TELEPORT | CHANGED_REGION)
// came after the avatar had left: @tpto 781 to 1032 ms after the command (29 runs, mean 860 ms),
// llTeleportAgentGlobalCoords 588 to 834 ms after the call (13 runs, mean 649 ms, and one at
// 2579 ms), a viewer teleport 577 to 791 ms after the request (12 runs, mean 641 ms). Next region
// and far away took the same time. The watch saw the avatar in SLua Tombolo 45 to 200 ms after it
// left.
const source = `list changes;
default {
  state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_TELEPORT); }
  link_message(integer sender, integer num, string message, key id) {
    if (num == 1) llTeleportAgent(llGetOwner(), "", (vector)message, ZERO_VECTOR);
    else if (num == 2) llTeleportAgentGlobalCoords(llGetOwner(), <0, 256, 0>, (vector)message, ZERO_VECTOR);
    else {
      list commands = llParseString2List(message, ["|"], []);
      integer i;
      for (i = 0; i < llGetListLength(commands); ++i) llOwnerSay(llList2String(commands, i));
    }
  }
  changed(integer c) { if (c & (CHANGED_TELEPORT | CHANGED_REGION)) changes += c; }
}`
const seatSource = `default { state_entry() { llSitTarget(<0, 0, 0.6>, ZERO_ROTATION); } }`
const profiles = ['rlv', 'rlva'] as const

async function fixture(profile: typeof profiles[number]) {
  const { script, avatar, world } = (await loadRlvPair({ source }))[profile]
  world.addRegion('north', { x: 0, y: 256 })
  avatar.position = { x: 118, y: 48, z: 30 }
  script.start()
  script.linkset.attachToAvatar(avatar.key, 39)
  script.grantPermissions()
  script.advanceTime(0)
  const loaded = await loadLinkset({ world, region: 'RLV fixture', owner: avatar.key, position: { x: 120, y: 49, z: 30 },
    prims: [{ name: 'seat', scripts: [{ name: 'seat', source: { source: seatSource } }] }] })
  loaded.scripts['seat']!.start()
  const seat = loaded.prims[0]!
  const say = (message: string, num = 0) => script.fire('link_message', { sender_num: 1, num, str: message, id: NULL_KEY })
  const wait = (ms: number) => script.linkset.advanceTime(ms)
  const changes = () => script.global('changes')
  const outcomes = (from: number) => avatar.viewer.commandLog.slice(from)
    .map(entry => 'actionOutcome' in entry ? [entry.action, entry.actionOutcome] : [])
  const sit = () => {
    say(`@sit:${seat.key}=force`)
    wait(300)
    expect(avatar.sittingOn).toBe(seat)
  }
  return { script, avatar, world, seat, say, wait, changes, outcomes, sit }
}

describe('teleport travel time', () => {
  it.each(profiles)('%s: @tpto within the region moves the avatar about 220 ms after the command', async profile => {
    const f = await fixture(profile)
    f.say('@tpto:122/60/25=force')
    f.wait(198)
    expect(f.avatar.position).toMatchObject({ x: 118, y: 48 })
    expect(f.changes()).toEqual([])
    f.wait(47)
    expect(f.avatar.position).toMatchObject({ x: 122, y: 60 })
    expect(f.changes()).toEqual([CHANGED_TELEPORT])
    expect(f.outcomes(0)).toEqual([['tpto', 'pending'], ['tpto', 'applied']])
  })

  it.each(profiles)('%s: @tpto to another region leaves after about 220 ms and reports the change later', async profile => {
    const f = await fixture(profile)
    f.say('@tpto:118/304/30=force')
    f.wait(198)
    expect(f.avatar.region).toBe('RLV fixture')
    f.wait(47)
    expect(f.avatar.region).toBe('north')
    f.wait(780 - 245)
    expect(f.changes()).toEqual([])
    f.wait(1032 - 780)
    expect(f.changes()).toEqual([CHANGED_TELEPORT | CHANGED_REGION])
  })

  // https://wiki.secondlife.com/wiki/LlSetScriptState: a stopped script gets no events raised while
  // it is down. The region change is raised when the handoff ends.
  it.each(profiles)('%s: a worn script stopped during the handoff never hears the region change', async profile => {
    const f = await fixture(profile)
    f.say('<118, 48, 30>', 2)
    f.wait(100)
    f.script.running = false
    f.wait(900)
    f.script.running = true
    f.wait(100)
    expect(f.changes()).toEqual([])
  })

  it.each(profiles)('%s: llTeleportAgent within the region moves the avatar and reports it at once', async profile => {
    const f = await fixture(profile)
    f.say('<122, 60, 25>', 1)
    expect(f.avatar.position).toMatchObject({ x: 122, y: 60 })
    f.wait(1)
    expect(f.changes()).toEqual([CHANGED_TELEPORT])
  })

  it.each(profiles)('%s: llTeleportAgentGlobalCoords to another region reports the change after about 650 ms', async profile => {
    const f = await fixture(profile)
    f.say('<118, 48, 30>', 2)
    expect(f.avatar.region).toBe('north')
    f.wait(587)
    expect(f.changes()).toEqual([])
    f.wait(834 - 587)
    expect(f.changes()).toEqual([CHANGED_TELEPORT | CHANGED_REGION])
  })

  it.each(profiles)('%s: a viewer teleport moves the avatar at once and reports a region change after about 640 ms', async profile => {
    const pair = await fixture(profile)
    pair.world.userTeleportAvatarViaMap(pair.avatar, { x: 122, y: 60, z: 25 })
    expect(pair.avatar.position).toMatchObject({ x: 122, y: 60 })
    pair.wait(0)
    expect(pair.changes()).toEqual([CHANGED_TELEPORT])
    pair.world.userTeleportAvatarViaMap(pair.avatar, { x: 118, y: 304, z: 30 })
    expect(pair.avatar.region).toBe('north')
    pair.wait(576)
    expect(pair.changes()).toEqual([CHANGED_TELEPORT])
    pair.wait(791 - 576)
    expect(pair.changes()).toEqual([CHANGED_TELEPORT, CHANGED_TELEPORT | CHANGED_REGION])
  })
})

describe('teleports that overlap a @tpto on its way', () => {
  // In-world: two @tpto in the same event took the avatar to the second destination, with one
  // changed event, three runs within SLua Tideland.
  it.each(profiles)('%s: a later @tpto replaces one still on its way', async profile => {
    const f = await fixture(profile)
    f.say('@tpto:122/60/25=force|@tpto:140/84/25=force')
    f.wait(1000)
    expect(f.avatar.position).toMatchObject({ x: 140, y: 84 })
    expect(f.changes()).toEqual([CHANGED_TELEPORT])
    expect(f.outcomes(0)).toEqual([['tpto', 'pending'], ['tpto', 'refused'], ['tpto', 'pending'], ['tpto', 'applied']])
  })

  // In-world: @tpto, then llTeleportAgent 0.11 s later: the script teleport moved the avatar at once,
  // and the @tpto landed afterwards and took it to its own destination, with two changed events,
  // three runs.
  it.each(profiles)('%s: a @tpto on its way still lands after llTeleportAgent', async profile => {
    const f = await fixture(profile)
    f.say('@tpto:122/60/25=force')
    f.wait(110)
    f.say('<100, 80, 25>', 1)
    expect(f.avatar.position).toMatchObject({ x: 100, y: 80 })
    f.wait(1000)
    expect(f.avatar.position).toMatchObject({ x: 122, y: 60 })
    expect(f.changes()).toEqual([CHANGED_TELEPORT, CHANGED_TELEPORT])
  })
})

describe('force seating sent with @tpto', () => {
  // In-world: "@sit:<seat>=force" and "@tpto" in the same event, within the region: in six of seven
  // runs the avatar never sat; in one the sit landed in the frame the avatar left. Into SLua
  // Tombolo it never sat, two runs.
  it.each(profiles)('%s: the teleport overtakes a force sit and the sit is refused', async profile => {
    for (const destination of ['122/60/25', '118/304/30']) {
      const f = await fixture(profile)
      const from = f.avatar.viewer.commandLog.length
      f.say(`@sit:${f.seat.key}=force|@tpto:${destination}=force`)
      f.wait(2000)
      expect(f.avatar.sittingOn).toBeNull()
      expect(f.outcomes(from)).toEqual([['sit', 'pending'], ['tpto', 'pending'], ['sit', 'refused'], ['tpto', 'applied']])
    }
  })

  // In-world: seated, "@unsit=force" and "@tpto" in the same event: the avatar stayed on the seat
  // until the frame it left, four runs within the region and two into SLua Tombolo, and arrived
  // standing. The teleport stood it, so the stand found it standing.
  it.each(profiles)('%s: the teleport stands the avatar before a force stand lands', async profile => {
    for (const destination of ['122/60/25', '118/304/30']) {
      const f = await fixture(profile)
      f.sit()
      const from = f.avatar.viewer.commandLog.length
      f.say(`@unsit=force|@tpto:${destination}=force`)
      f.wait(2000)
      expect(f.avatar.info & (AGENT_SITTING | AGENT_ON_OBJECT)).toBe(0)
      expect(f.outcomes(from)).toEqual([['unsit', 'pending'], ['tpto', 'pending'], ['unsit', 'unchanged'], ['tpto', 'applied']])
      expect(f.avatar.viewer.commandLog.slice(from).find(entry => 'actionOutcome' in entry && entry.actionOutcome === 'unchanged'))
        .toMatchObject({ seat: NULL_KEY })
    }
  })

  // In-world: standing, "@sitground=force" and "@tpto" in the same event: within the region the
  // avatar arrived sitting on the ground at the destination, three runs; into SLua Tombolo it
  // arrived standing, two runs.
  it.each(profiles)('%s: a force ground sit lands at a destination in the same region', async profile => {
    const f = await fixture(profile)
    const from = f.avatar.viewer.commandLog.length
    f.say('@sitground=force|@tpto:122/60/25=force')
    f.wait(2000)
    expect(f.avatar.position).toMatchObject({ x: 122, y: 60 })
    expect(f.avatar.info & (AGENT_SITTING | AGENT_ON_OBJECT)).toBe(AGENT_SITTING)
    expect(f.outcomes(from)).toEqual([['sitground', 'pending'], ['tpto', 'pending'], ['tpto', 'applied'], ['sitground', 'applied']])
  })

  // In-world (#570): seated, "@sitground=force" and "@tpto" within the region in the same event: the
  // avatar arrived at the destination and then sat on the ground there.
  it.each(profiles)('%s: a force ground sit from a seat lands at a destination in the same region', async profile => {
    const f = await fixture(profile)
    f.sit()
    f.say('@sitground=force|@tpto:122/60/25=force')
    f.wait(2000)
    expect(f.avatar.position).toMatchObject({ x: 122, y: 60 })
    expect(f.avatar.sittingOn).toBeNull()
    expect(f.avatar.info & (AGENT_SITTING | AGENT_ON_OBJECT)).toBe(AGENT_SITTING)
  })

  it.each(profiles)('%s: a force ground sit is refused when the teleport leaves the region', async profile => {
    const f = await fixture(profile)
    const from = f.avatar.viewer.commandLog.length
    f.say('@sitground=force|@tpto:118/304/30=force')
    f.wait(2000)
    expect(f.avatar.region).toBe('north')
    expect(f.avatar.info & AGENT_SITTING).toBe(0)
    expect(f.outcomes(from)).toEqual([['sitground', 'pending'], ['tpto', 'pending'], ['sitground', 'refused'], ['tpto', 'applied']])
  })
})

describe('force seating sent with a script teleport', () => {
  // In-world: "@sit:<seat>=force" and then llTeleportAgent within the region in the same event: the
  // avatar arrived at once, and the sit landed 178 to 1199 ms later and took it back to the seat,
  // three runs. llTeleportAgentGlobalCoords to SLua Tombolo: it never sat, three runs.
  it.each(profiles)('%s: a force sit still lands after llTeleportAgent within the region', async profile => {
    const f = await fixture(profile)
    f.say(`@sit:${f.seat.key}=force`)
    f.say('<122, 60, 25>', 1)
    expect(f.avatar.position).toMatchObject({ x: 122, y: 60 })
    f.wait(1000)
    expect(f.avatar.sittingOn).toBe(f.seat)
  })

  // In-world: seated, "@unsit=force" and then a script teleport in the same event: the avatar stayed
  // on the seat until it left and arrived standing, llTeleportAgentGlobalCoords to SLua Tombolo
  // three runs and llTeleportAgent within the region two runs.
  it.each(profiles)('%s: a script teleport stands the avatar before a force stand lands', async profile => {
    for (const [num, destination] of [[1, '<122, 60, 25>'], [2, '<118, 48, 30>']] as const) {
      const f = await fixture(profile)
      f.sit()
      const from = f.avatar.viewer.commandLog.length
      f.say('@unsit=force')
      f.say(destination, num)
      f.wait(1000)
      expect(f.avatar.info & (AGENT_SITTING | AGENT_ON_OBJECT)).toBe(0)
      expect(f.outcomes(from)).toEqual([['unsit', 'pending'], ['unsit', 'unchanged']])
    }
  })

  it.each(profiles)('%s: a force sit is refused after llTeleportAgentGlobalCoords to another region', async profile => {
    const f = await fixture(profile)
    const from = f.avatar.viewer.commandLog.length
    f.say(`@sit:${f.seat.key}=force`)
    f.say('<118, 48, 30>', 2)
    f.wait(1000)
    expect(f.avatar.sittingOn).toBeNull()
    expect(f.outcomes(from)).toEqual([['sit', 'pending'], ['sit', 'refused']])
  })
})

describe('Kokua lock restoration', () => {
  // Kokua lifts the issuer's own bare locks while it handles @tpto and restores them before the
  // command returns, so they are back while the teleport is still on its way.
  it('restores the issuer locks while the teleport is still on its way', async () => {
    const f = await fixture('rlv')
    f.say('@tploc=n|@unsit=n|@tpto:122/60/25=force')
    expect(f.outcomes(0).at(-1)).toEqual(['tpto', 'pending'])
    expect(f.avatar.viewer.restrictions.snapshot().map(rule => rule.behaviour).sort()).toEqual(['tploc', 'unsit'])
    f.wait(220)
    expect(f.avatar.position).toMatchObject({ x: 122, y: 60 })
  })
})
