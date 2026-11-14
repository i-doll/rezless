import { describe, expect, it } from 'vitest'
import { NULL_KEY, type Script } from '@rezless/vm'
import { loadLinkset, loadRlvPair } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Sitting
// Measured with Firestorm RLVa 2.4.2 (Aditi, SLua Tideland, 2026-11-14), one avatar, two rezzed
// seats with llSitTarget(<0,0,0.6>, ZERO_ROTATION). One seat sent each command with llOwnerSay and
// reported the replies and llGetAgentInfo(llGetOwner()) right after sending.
// RLVa (RlvForceHandler<RLV_BHVR_SIT>, RlvForceHandler<RLV_BHVR_SITGROUND>, @unsit=force) and Kokua
// (RRInterface::force, LLAgent::standUp, LLAgent::sitDown) both send the request to the region and
// learn of the new seat from its reply, and both answer getsitid from that reply (RLVa from the
// avatar's parent, Kokua from LLVOAvatar::sitOnObject and getOffObject). Kokua is read from its
// source, not measured: the test grid's viewer is Firestorm.

const AGENT_SITTING = 0x10
// Each line is "<command>[|<seconds>|<command>]...": the seat says each command with llOwnerSay
// and sleeps the given seconds before the next.
const seatSource = `list replies; integer info; default {
  state_entry() { llSitTarget(<0,0,0.6>, ZERO_ROTATION); llListen(467101, "", llGetOwner(), ""); }
  link_message(integer sender, integer num, string message, key id) {
    list parts = llParseStringKeepNulls(message, ["|"], []);
    integer i;
    for (i = 0; i < llGetListLength(parts); i += 2) {
      llOwnerSay(llList2String(parts, i));
      float pause = llList2Float(parts, i + 1);
      if (pause > 0) llSleep(pause);
    }
    info = llGetAgentInfo(llGetOwner());
  }
  listen(integer c, string n, key id, string m) { replies += [m]; }
}`
const LANDED_MS = 250

async function pair() {
  const fixtures = await loadRlvPair({ source: seatSource })
  return Object.fromEntries(Object.entries(fixtures).map(([profile, fixture]) => {
    const { script, avatar, world } = fixture
    script.start()
    const say = (message: string) => script.fire('link_message', { sender_num: 1, num: 0, str: message, id: NULL_KEY })
    const wait = (ms: number) => script.linkset.advanceTime(ms)
    const replies = () => script.global('replies') as string[]
    const seat = () => { say('@sit:' + script.host.key + '=force'); wait(LANDED_MS); script.setGlobal('replies', []) }
    return [profile, { script, avatar, world, say, wait, replies, seat }]
  })) as Record<'rlv' | 'rlva', { script: Script, avatar: typeof fixtures.rlv.avatar, world: typeof fixtures.rlv.world,
    say(message: string): void, wait(ms: number): void, replies(): string[], seat(): void }>
}

const profiles = ['rlv', 'rlva'] as const

describe('reply commands batched with a force stand', () => {
  // In-world: seated, "@getsitid,unsit=force,getsitid,getstatus,fly=y,getstatus" (after "@fly=n")
  // -> the seat's key, the seat's key, "/fly", "", and the seat's changed event came after.
  it.each(profiles)('%s answers every reply in the message from before the stand', async profile => {
    const f = (await pair())[profile]
    f.seat()
    f.say('@fly=n')
    f.say('@getsitid=467101,unsit=force,getsitid=467101,getstatus=467101,fly=y,getstatus=467101')
    expect(f.avatar.sittingOn).toBe(f.script.host)
    f.wait(LANDED_MS)
    expect(f.avatar.sittingOn).toBeNull()
    expect(f.replies()).toEqual([f.script.host.key, f.script.host.key, '/fly', ''])
  })

  // In-world: seated, "@sitground=force,getsitid" -> the seat's key.
  it.each(profiles)('%s answers getsitid after a ground sit from a seat with the seat', async profile => {
    const f = (await pair())[profile]
    f.seat()
    f.say('@sitground=force,getsitid=467101')
    f.wait(1000)
    expect(f.replies()).toEqual([f.script.host.key])
    expect(f.avatar.info & AGENT_SITTING).toBe(AGENT_SITTING)
  })

  // In-world: seated on one seat, "@sit:<other seat>=force,getsitid" -> the first seat's key,
  // then the avatar sat on the other seat.
  it.each(profiles)('%s answers getsitid after a switch of seats with the old seat', async profile => {
    const f = (await pair())[profile]
    const other = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key, position: { x: 2, y: 0, z: 0 },
      prims: [{ scripts: [{ name: 'target', source: { source: 'default { state_entry() { llSitTarget(<0,0,0.6>, ZERO_ROTATION); } }' } }] }] })
    other.scripts.target!.start()
    f.seat()
    f.say('@sit:' + other.prims[0]!.key + '=force,getsitid=467101')
    f.wait(LANDED_MS)
    expect(f.replies()).toEqual([f.script.host.key])
    expect(f.avatar.sittingOn).toBe(other.prims[0])
  })

  // In-world: sitting on the ground, "@getsitid,unsit=force,getsitid" -> the avatar's key twice,
  // and the avatar stood. Kokua reports the null key on the ground.
  it.each(profiles)('%s answers getsitid after a stand from the ground with the ground', async profile => {
    const f = (await pair())[profile]
    f.say('@sitground=force')
    f.wait(LANDED_MS)
    f.say('@getsitid=467101,unsit=force,getsitid=467101')
    f.wait(LANDED_MS)
    const ground = profile === 'rlva' ? f.avatar.key : NULL_KEY
    expect(f.replies()).toEqual([ground, ground])
    expect(f.avatar.info & AGENT_SITTING).toBe(0)
  })
})

// The second request reaches the region after the first has stood the avatar.
it.each(profiles)('%s leaves the avatar standing at a second force stand in the message', async profile => {
  const f = (await pair())[profile]
  f.seat()
  const count = f.avatar.viewer.commandLog.length
  f.say('@unsit=force,unsit=force')
  f.wait(LANDED_MS)
  expect(f.avatar.viewer.commandLog.slice(count).map(entry => 'actionOutcome' in entry && entry.actionOutcome))
    .toEqual(['pending', 'pending', 'applied', 'unchanged'])
  expect(f.avatar.sittingOn).toBeNull()
})

// In-world: standing, "@sit:<seat>=force,unsit=n,sit:<other seat>=force" -> the avatar sat on the
// first seat, then on the other: the viewer still saw it standing, so the unsit lock didn't block
// the second request.
it.each(profiles)('%s lets an unsit lock after a force sit in the message pass a second force sit', async profile => {
  const f = (await pair())[profile]
  const other = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key, position: { x: 2, y: 0, z: 0 },
    prims: [{ scripts: [{ name: 'target', source: { source: 'default { state_entry() { llSitTarget(<0,0,0.6>, ZERO_ROTATION); } }' } }] }] })
  other.scripts.target!.start()
  f.say('@sit:' + f.script.host.key + '=force,unsit=n,sit:' + other.prims[0]!.key + '=force')
  f.wait(LANDED_MS)
  expect(f.avatar.sittingOn).toBe(other.prims[0])
})

describe('reply commands batched with a force sit', () => {
  // In-world: standing, "@sit:<seat>=force,getsitid" -> the null key, and llGetAgentInfo
  // read 6 straight after the command.
  it.each(profiles)('%s answers getsitid with the null key and still reads the avatar standing', async profile => {
    const f = (await pair())[profile]
    f.say('@sit:' + f.script.host.key + '=force,getsitid=467101')
    expect((f.script.global('info') as number) & AGENT_SITTING).toBe(0)
    f.wait(LANDED_MS)
    expect(f.replies()).toEqual([NULL_KEY])
    expect(f.avatar.sittingOn).toBe(f.script.host)
  })

  // In-world: standing, "@sitground=force,getsitid" -> the null key. Sitting on the ground,
  // "@sit:<seat>=force,getsitid" -> the avatar's key.
  it.each(profiles)('%s answers getsitid with the seat before a ground sit or an object sit', async profile => {
    const f = (await pair())[profile]
    f.say('@sitground=force,getsitid=467101')
    f.wait(LANDED_MS)
    f.say('@sit:' + f.script.host.key + '=force,getsitid=467101')
    f.wait(LANDED_MS)
    expect(f.replies()).toEqual([NULL_KEY, profile === 'rlva' ? f.avatar.key : NULL_KEY])
    expect(f.avatar.sittingOn).toBe(f.script.host)
  })
})

describe('a force sit or stand lands about 0.25 s after the command', () => {
  // In-world: "@unsit=force" and "@getsitid" in two llOwnerSay calls of one event -> the seat's key,
  // and llGetAgentInfo read 54. With llSleep(0.1), (0.15) or (0.2) between them -> the seat's key;
  // with llSleep(0.25) or (0.3) -> the null key, and llGetAgentInfo read 6.
  it.each(profiles)('%s still has the avatar seated for the rest of the event and a sleep of 0.2 s', async profile => {
    const f = (await pair())[profile]
    for (const [pause, expected] of [['0', f.script.host.key], ['0.2', f.script.host.key], ['0.3', NULL_KEY]] as const) {
      f.seat()
      f.say('@unsit=force|' + pause + '|@getsitid=467101')
      expect(!!((f.script.global('info') as number) & AGENT_SITTING), pause).toBe(expected !== NULL_KEY)
      f.wait(1000)
      expect(f.replies(), pause).toEqual([expected])
      expect(f.avatar.sittingOn).toBeNull()
    }
  })

  // In-world: standing, "@sit:<seat>=force" and "@getsitid" in one event -> the null key, and
  // llGetAgentInfo read 6. After llSleep(0.1) or (0.2) -> the null key; after (0.25) or (0.3) ->
  // the seat's key, and llGetAgentInfo read 54.
  it.each(profiles)('%s has the avatar standing for the rest of the event and a sleep of 0.2 s', async profile => {
    const f = (await pair())[profile]
    for (const [pause, expected] of [['0', NULL_KEY], ['0.2', NULL_KEY], ['0.3', f.script.host.key]] as const) {
      f.say('@unsit=force')
      f.wait(LANDED_MS)
      f.script.setGlobal('replies', [])
      f.say('@sit:' + f.script.host.key + '=force|' + pause + '|@getsitid=467101')
      f.wait(1000)
      expect(f.replies(), pause).toEqual([expected])
      expect(f.avatar.sittingOn).toBe(f.script.host)
    }
  })
})

describe('force sit requests the region has not answered yet', () => {
  // In-world: standing, "@sit:<seat>=force,sitground=force" -> on the ground by 0.35 s, next to the
  // seat (Aditi, SLua Tideland, 2026-11-14).
  it.each(profiles)('%s sits the avatar on the ground after an object sit in the same message', async profile => {
    const f = (await pair())[profile]
    f.say('@sit:' + f.script.host.key + '=force,sitground=force')
    f.wait(LANDED_MS)
    expect(f.avatar.info & AGENT_SITTING).toBe(AGENT_SITTING)
    expect(f.avatar.sittingOn).toBeNull()
  })

  // In-world: standing at (116, 48), "@sit:<seat>=force,standtp=n" then "@unsit=force" -> the avatar
  // stood by the seat; "@standtp=n,sit:<seat>=force" then "@unsit=force" -> back at (116, 48).
  // RlvForceHandler<RLV_BHVR_SIT> saves the origin when it sends the request.
  it('rlva saves the standtp origin when it sends the sit request', async () => {
    const f = (await pair()).rlva
    const origin = { x: 20, y: 30, z: 40 }
    f.avatar.position = { ...origin }
    f.say('@sit:' + f.script.host.key + '=force,standtp=n')
    f.wait(LANDED_MS)
    expect(f.avatar.sittingOn).toBe(f.script.host)
    f.say('@unsit=force')
    f.wait(LANDED_MS)
    expect(f.avatar.position).not.toEqual(origin)
    f.say('@clear')
    f.avatar.position = { ...origin }
    f.say('@standtp=n,sit:' + f.script.host.key + '=force')
    f.avatar.position = { x: 21, y: 30, z: 40 }
    f.wait(LANDED_MS)
    f.say('@unsit=force')
    f.wait(LANDED_MS)
    expect(f.avatar.position).toEqual(origin)
  })

  it.each(profiles)('%s drops a waiting ground sit when it sends a later sit request', async profile => {
    const f = (await pair())[profile]
    const far = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key, position: { x: 60, y: 0, z: 0 }, prims: [{}] })
    f.world.setSitResponse(far.prims[0]!, { position: { x: 0, y: 0, z: 1 }, autopilot: { durationMs: 1000, success: true } })
    f.seat()
    f.say('@sitground=force')
    f.wait(400)
    f.say('@sit:' + far.prims[0]!.key + '=force')
    f.wait(400)
    expect(f.avatar.info & AGENT_SITTING).toBe(0)
    f.wait(1000)
    expect(f.avatar.sittingOn).toBe(far.prims[0])
  })

  it.each(profiles)('%s keeps the first ground sit for a second one from the same seat', async profile => {
    const f = (await pair())[profile]
    f.seat()
    const count = f.avatar.viewer.commandLog.length
    f.say('@unsit=force,sitground=force,sitground=force')
    f.wait(1000)
    expect(f.avatar.viewer.commandLog.slice(count).map(entry => 'actionOutcome' in entry && entry.actionOutcome))
      .toEqual(['pending', 'pending', 'pending', 'applied', 'unchanged', 'applied'])
    expect(f.avatar.info & AGENT_SITTING).toBe(AGENT_SITTING)
  })

  it.each(profiles)('%s refuses a request a teleport overtakes', async profile => {
    const f = (await pair())[profile]
    f.say('@sit:' + f.script.host.key + '=force')
    f.wait(100)
    expect(f.world.teleportAvatar(f.avatar, { x: 10, y: 10, z: 10 })).toBe(true)
    f.wait(LANDED_MS)
    expect(f.avatar.sittingOn).toBeNull()
    expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ action: 'sit', actionOutcome: 'refused', reason: 'world-constraint' })
  })

  it.each(profiles)('%s refuses a seat removed before the request arrives, leaving the avatar flying', async profile => {
    const f = (await pair())[profile]
    const other = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key, position: { x: 2, y: 0, z: 0 },
      prims: [{ scripts: [{ name: 'target', source: { source: 'default { state_entry() { llSitTarget(<0,0,0.6>, ZERO_ROTATION); } }' } }] }] })
    other.scripts.target!.start()
    f.avatar.info |= 0x1
    f.say('@sit:' + other.prims[0]!.key + '=force')
    other.linkset.remove()
    f.wait(LANDED_MS)
    expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ action: 'sit', actionOutcome: 'refused', reason: 'world-constraint' })
    expect(f.avatar.info & 0x1).toBe(0x1)
  })
})
