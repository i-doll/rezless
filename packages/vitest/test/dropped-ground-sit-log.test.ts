import { describe, expect, it } from 'vitest'
import { NULL_KEY } from '@rezless/vm'
import { loadLinkset, loadRlvPair } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Sitting
// A ground sit from a seat waits for the stand to land. A later sit request drops it, as a later
// request drops a sit still piloting or a request a teleport overtakes; the log closes it the same way.

const seatSource = `default {
  state_entry() { llSitTarget(<0,0,0.6>, ZERO_ROTATION); }
  link_message(integer sender, integer num, string message, key id) { llOwnerSay(message); }
}`
const LANDED_MS = 250
const profiles = ['rlv', 'rlva'] as const

async function fixture(profile: typeof profiles[number]) {
  const { script, avatar, world } = (await loadRlvPair({ source: seatSource }))[profile]
  script.start()
  const say = (message: string) => script.fire('link_message', { sender_num: 1, num: 0, str: message, id: NULL_KEY })
  const wait = (ms: number) => script.linkset.advanceTime(ms)
  const outcomes = (from: number) => avatar.viewer.commandLog.slice(from)
    .map(entry => 'actionOutcome' in entry ? [entry.action, entry.actionOutcome, entry.reason] : [])
  return { script, avatar, world, say, wait, outcomes }
}

describe('a force ground sit dropped by a later sit request', () => {
  it.each(profiles)('%s records the dropped ground sit as refused', async profile => {
    const f = await fixture(profile)
    const far = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key, position: { x: 60, y: 0, z: 0 }, prims: [{}] })
    f.world.setSitResponse(far.prims[0]!, { position: { x: 0, y: 0, z: 1 }, autopilot: { durationMs: 1000, success: true } })
    f.say('@sit:' + f.script.host.key + '=force')
    f.wait(LANDED_MS)
    const from = f.avatar.viewer.commandLog.length
    f.say('@sitground=force')
    f.wait(LANDED_MS + 50)
    f.say('@sit:' + far.prims[0]!.key + '=force')
    f.wait(LANDED_MS + 1000)
    expect(f.avatar.sittingOn).toBe(far.prims[0])
    expect(f.outcomes(from)).toEqual([
      ['sitground', 'pending', undefined],
      ['sitground', 'refused', 'world-constraint'],
      ['sit', 'pending', undefined],
      ['sit', 'applied', undefined],
    ])
  })

  it.each(profiles)('%s records a ground sit that finds the avatar already sitting as unchanged', async profile => {
    const f = await fixture(profile)
    f.say('@sit:' + f.script.host.key + '=force')
    f.wait(LANDED_MS)
    const from = f.avatar.viewer.commandLog.length
    f.say('@sitground=force')
    f.wait(LANDED_MS + 50)
    f.world.sitAvatarOnGround(f.avatar)
    f.wait(1000)
    expect(f.outcomes(from)).toEqual([
      ['sitground', 'pending', undefined],
      ['sitground', 'unchanged', undefined],
    ])
  })
})
