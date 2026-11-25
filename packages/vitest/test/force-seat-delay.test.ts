import { describe, expect, it } from 'vitest'
import { NULL_KEY } from '@rezless/vm'
import { loadRlvPair } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Sitting
// https://wiki.secondlife.com/wiki/LlGetAgentInfo
// In-world: a seat with llSitTarget(<0,0,0.6>, ZERO_ROTATION) said "@sit:<seat>=force" with
// llOwnerSay and polled llGetAgentInfo(llGetOwner()) & AGENT_ON_OBJECT until it changed, then
// "@unsit=force" the same way, 20 times; then timed the seat's changed event after 10 more force
// sits. Measured with Firestorm RLVa 2.4.2 on the Aditi beta grid, SLua Tideland, 2026-11-23, in
// three viewer sessions, each a fresh login. The delays came in whole 22 ms region frames:
//   force sit, polled (60): 199-200 ms 11, 221-222 ms 33, 244 ms 16; mean 224 ms
//   force stand, polled (60): 178 ms 1, 199-200 ms 6, 221-223 ms 48, 244 ms 5; mean 221 ms
//   changed event after a force sit (30): 178 ms 1, 199-200 ms 6, 222-223 ms 8, 243-245 ms 15; mean 227 ms
// The spread was the same in each session. #475 measured 0.2-0.25 s on 2026-11-14. The model
// lands every request on the most common polled frame, frame 10 (222 ms), and runs the changed
// event in that frame. The changed event came on frame 11 more often than on 10 (15 against 8),
// a mean 3 ms after the polled reads, too little to model as a frame of its own. Kokua
// sends the same request to the region (RRInterface::force); it is read from source, not measured.

const AGENT_ON_OBJECT = 0x20
const seatSource = `float t0; float seen = -1.0; default {
  state_entry() { llSitTarget(<0,0,0.6>, ZERO_ROTATION); }
  link_message(integer sender, integer num, string message, key id) { t0 = llGetTime(); llOwnerSay(message); }
  changed(integer c) { if ((c & CHANGED_LINK) && llAvatarOnSitTarget() != NULL_KEY) seen = llGetTime() - t0; }
}`
const FASTEST_MS = 178, SLOWEST_MS = 244
const SIM_FRAME_MS = 1000 / 45

async function fixture(profile: 'rlv' | 'rlva') {
  const { script, avatar } = (await loadRlvPair({ source: seatSource }))[profile]
  script.start()
  const say = (message: string) => script.fire('link_message', { sender_num: 1, num: 0, str: message, id: NULL_KEY })
  const wait = (ms: number) => script.linkset.advanceTime(ms)
  const onObject = () => !!(avatar.info & AGENT_ON_OBJECT)
  return { script, avatar, say, wait, onObject }
}

describe('the delay from a force sit or stand to the new seat', () => {
  it.each(['rlv', 'rlva'] as const)('%s seats the avatar inside the measured spread', async profile => {
    const f = await fixture(profile)
    f.say('@sit:' + f.script.host.key + '=force')
    f.wait(FASTEST_MS - 1)
    expect(f.onObject()).toBe(false)
    f.wait(SLOWEST_MS - FASTEST_MS + 1)
    expect(f.onObject()).toBe(true)
    const seen = f.script.global('seen') as number
    expect(seen).toBeGreaterThanOrEqual(FASTEST_MS / 1000)
    expect(seen).toBeLessThanOrEqual(SLOWEST_MS / 1000)
  })

  it.each(['rlv', 'rlva'] as const)('%s stands the avatar inside the measured spread', async profile => {
    const f = await fixture(profile)
    f.say('@sit:' + f.script.host.key + '=force')
    f.wait(1000)
    f.say('@unsit=force')
    f.wait(FASTEST_MS - 1)
    expect(f.onObject()).toBe(true)
    f.wait(SLOWEST_MS - FASTEST_MS + 1)
    expect(f.onObject()).toBe(false)
  })

  it.each(['rlv', 'rlva'] as const)('%s seats the avatar on frame 10 and runs changed in that frame', async profile => {
    const f = await fixture(profile)
    f.say('@sit:' + f.script.host.key + '=force')
    f.wait(10 * SIM_FRAME_MS - 0.5)
    expect(f.onObject()).toBe(false)
    f.wait(0.5)
    expect(f.onObject()).toBe(true)
    f.wait(100)
    expect((f.script.global('seen') as number) * 45).toBeCloseTo(10, 3)
  })

  it.each(['rlv', 'rlva'] as const)('%s stands the avatar on frame 10', async profile => {
    const f = await fixture(profile)
    f.say('@sit:' + f.script.host.key + '=force')
    f.wait(1000)
    f.say('@unsit=force')
    f.wait(10 * SIM_FRAME_MS - 0.5)
    expect(f.onObject()).toBe(true)
    f.wait(0.5)
    expect(f.onObject()).toBe(false)
  })
})
