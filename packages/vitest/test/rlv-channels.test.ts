import { describe, expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI
// In-world: signed-channel batch -> only 2147483646 and ordinary positive
// channels reply; unknown versionnum option returns one empty message.
// Firestorm RLVa 2.4.2, viewer 7.2.5.81978 (Aditi, SLua Tideland, 2026-11-01).
// In-world: avatar-origin shout on DEBUG_CHANNEL -> one matching listen event.
// RLVa rejects the query before sending. Firestorm RLVa 2.4.2, viewer 7.2.5.81978
// (Aditi, SLua Tideland, 2026-11-01).
// Kokua RLV 2.09.35.00 permits signed nonzero object reply channels.
// Firestorm RLVa 2.4.2 permits positive channels except DEBUG_CHANNEL.
describe('paired viewer reply channels', () => {
  it.each([-2147483648, -216101, 0, 2147483646, 2147483647])('validates channel %s per profile', async channel => {
    const pair = await loadRlvPair({ source: `integer replies; default {
      state_entry() { llListen(${channel}, "", llGetOwner(), ""); llOwnerSay("@versionnum=${channel}"); }
      listen(integer c, string n, key id, string m) { ++replies; }
    }` })
    for (const profile of ['rlv', 'rlva'] as const) {
      const { script, avatar } = pair[profile]
      script.start()
      const attempted = profile === 'rlv' ? channel !== 0 : channel > 0 && channel < 2147483647
      expect(avatar.viewer.commandLog[0]?.status).toBe(attempted ? 'replied' : 'unsupported')
      expect(script.global('replies')).toBe(attempted ? 1 : 0)
    }
  })
})

// https://wiki.secondlife.com/wiki/llShout
// In-world: issuing prim at avatar and 99.9 m -> one reply each;
// at 100.1 m and 140 m -> no reply; return to avatar -> one reply.
// A listener 7 m across the SLua Tideland / SLua Tombolo boundary hears it.
// Firestorm RLVa 2.4.2, viewer 7.2.5.81978 (Aditi, 2026-11-01).
// Viewer replies originate at the avatar's current global position, including
// the issuing prim. Dialog replies use 20 m in the avatar's region.
describe('avatar reply origin', () => {
  it('recomputes position and region for every reply and uses the profile transport range', async () => {
    const pair = await loadRlvPair({ source: `integer replies; default {
      state_entry() { llListen(216101, "", llGetOwner(), ""); llListen(-216101, "", llGetOwner(), ""); }
      touch_start(integer n) { llOwnerSay("@versionnum=216101,versionnum=-216101"); }
      listen(integer c, string n, key id, string m) { ++replies; }
    }` })
    for (const profile of ['rlv', 'rlva'] as const) {
      const { script, avatar, world } = pair[profile]
      world.addRegion('neighbour', { x: 256, y: 0 })
      script.host.params.position = { x: 250, y: 0, z: 0 }
      avatar.position = { x: 230.1, y: 0, z: 0 }
      script.start()
      script.fire('touch_start', { num_detected: 1 })
      expect(script.global('replies')).toBe(profile === 'rlv' ? 2 : 1)
      avatar.position = { x: 150.1, y: 0, z: 0 }
      script.fire('touch_start', { num_detected: 1 })
      expect(script.global('replies')).toBe(profile === 'rlv' ? 3 : 2)
      avatar.position = { x: 149.9, y: 0, z: 0 }
      script.fire('touch_start', { num_detected: 1 })
      expect(script.global('replies')).toBe(profile === 'rlv' ? 3 : 2)
      avatar.region = 'neighbour'
      avatar.position = { x: 1, y: 0, z: 0 }
      script.fire('touch_start', { num_detected: 1 })
      expect(script.global('replies')).toBe(profile === 'rlv' ? 4 : 3)
    }
  })
})

// In-world: getstatus with repeated separators and three sendchannel exceptions
// -> one 1023-byte ASCII reply; a cut through an e-acute character -> one
// 1022-byte, 518-character reply. Firestorm RLVa 2.4.2, viewer 7.2.5.81978
// (Aditi, SLua Tideland and SLua Tombolo, 2026-11-01).
// Direct delivery also supports replies produced by commands beyond version queries.
describe('reply payload limits', () => {
  it('cuts positive and negative replies by the profile byte policy without splitting into extra events', async () => {
    const { sendViewerReply } = await import('@rezless/vm')
    const pair = await loadRlvPair({ source: `integer replies; string reply; default {
      state_entry() { llListen(216101, "", llGetOwner(), ""); llListen(-216101, "", llGetOwner(), ""); }
      listen(integer c, string n, key id, string m) { ++replies; reply = m; }
    }` })
    for (const profile of ['rlv', 'rlva'] as const) {
      const { script, avatar } = pair[profile]
      script.start()
      sendViewerReply(script.linkset, avatar, 216101, 'A'.repeat(1022) + 'éZ')
      script.advanceTime(1)
      expect(script.global('reply')).toBe('A'.repeat(1022) + (profile === 'rlv' ? '\uFFFD' : ''))
      expect(script.global('replies')).toBe(1)
      sendViewerReply(script.linkset, avatar, -216101, 'A'.repeat(253) + 'éZ')
      script.advanceTime(1)
      expect(script.global('reply')).toBe(profile === 'rlv' ? 'A'.repeat(253) + '\uFFFD' : 'A'.repeat(1022))
      expect(script.global('replies')).toBe(profile === 'rlv' ? 2 : 1)
    }
  })
})

it('preserves a leading BOM and empty data while refusing invalid channels without an event', async () => {
  const { sendViewerReply } = await import('@rezless/vm')
  const pair = await loadRlvPair({ source: `integer replies; string reply; default {
    state_entry() { llListen(216101, "", llGetOwner(), ""); }
    listen(integer c, string n, key id, string m) { ++replies; reply = m; }
  }` })
  for (const { script, avatar } of Object.values(pair)) {
    script.start()
    for (const channel of [0, 1.5, 2147483648, -2147483649, NaN]) {
      expect(sendViewerReply(script.linkset, avatar, channel, '')).toBeUndefined()
    }
    script.advanceTime(1)
    expect(script.global('replies')).toBe(0)
    sendViewerReply(script.linkset, avatar, 216101, '\uFEFFhello')
    script.advanceTime(1)
    expect(script.global('reply')).toBe('\uFEFFhello')
    sendViewerReply(script.linkset, avatar, 216101, '')
    script.advanceTime(1)
    expect(script.global('reply')).toBe('')
    expect(script.global('replies')).toBe(2)
  }
})


it('keeps direct replies inert for disabled avatars', async () => {
  const { sendViewerReply } = await import('@rezless/vm')
  const world = new World()
  world.addRegion('disabled', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'disabled', username: 'disabled' })
  const { scripts } = await loadLinkset({ world, region: 'disabled', prims: [{ scripts: [{
    name: 'listener', source: { source: `integer replies; default {
      state_entry() { llListen(216101, "", NULL_KEY, ""); }
      listen(integer c, string n, key id, string m) { ++replies; }
    }` },
  }] }] })
  const script = scripts.listener!
  script.start()
  expect(sendViewerReply(script.linkset, avatar, 216101, 'hello')).toBeUndefined()
  script.advanceTime(1)
  expect(script.global('replies')).toBe(0)
})

it('limits negative dialog delivery at 20 m from the current avatar', async () => {
  const pair = await loadRlvPair({ source: `integer replies; default {
    state_entry() { llListen(-216101, "", llGetOwner(), ""); }
    touch_start(integer n) { llOwnerSay("@versionnum=-216101"); }
    listen(integer c, string n, key id, string m) { ++replies; }
  }` })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { script } = pair[profile]
    script.start()
    script.host.params.position = { x: 19.9, y: 0, z: 0 }
    script.fire('touch_start', { num_detected: 1 })
    expect(script.global('replies')).toBe(profile === 'rlv' ? 1 : 0)
    script.host.params.position = { x: 20.1, y: 0, z: 0 }
    script.fire('touch_start', { num_detected: 1 })
    expect(script.global('replies')).toBe(profile === 'rlv' ? 1 : 0)
  }
})

it('delivers the ASCII byte ceiling in one event for both transports', async () => {
  const { sendViewerReply } = await import('@rezless/vm')
  const pair = await loadRlvPair({ source: `integer replies; string reply; default {
    state_entry() { llListen(216101, "", llGetOwner(), ""); llListen(-216101, "", llGetOwner(), ""); }
    listen(integer c, string n, key id, string m) { ++replies; reply = m; }
  }` })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { script, avatar } = pair[profile]
    script.start()
    sendViewerReply(script.linkset, avatar, 216101, 'x'.repeat(1200))
    script.advanceTime(1)
    expect(script.global('reply')).toBe('x'.repeat(1023))
    expect(script.global('replies')).toBe(1)
    sendViewerReply(script.linkset, avatar, -216101, 'y'.repeat(300))
    script.advanceTime(1)
    expect(script.global('reply')).toBe(profile === 'rlv' ? 'y'.repeat(254) : 'x'.repeat(1023))
    expect(script.global('replies')).toBe(profile === 'rlv' ? 2 : 1)
  }
})
