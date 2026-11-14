import { describe, expect, it } from 'vitest'
import { NULL_KEY, type Script } from '@rezless/vm'
import { loadLinkset, loadRlvPair } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Sitting
// https://wiki.secondlife.com/wiki/LlGetAgentInfo
// Kokua's behaviour is read from its source (RRInterface::force, LLAgent::standUp, LLAgent::sitDown,
// LLAgent::onAnimStop), not measured: the test grid's viewer is Firestorm. Kokua waits for the sit
// animation to stop before its ground sit; the delay modelled for it is RLVa's.
// Measured with Firestorm RLVa 2.4.2 (Aditi, SLua Tideland, 2026-11-14), one avatar, a rezzed seat
// with llSitTarget(<0,0,0.6>, ZERO_ROTATION) issuing the commands with llOwnerSay.

const AGENT_SITTING = 0x10, AGENT_ON_OBJECT = 0x20
// The grid's delay varied between 0.265 and 0.53 s in seven runs over two sessions, so the tests
// only ask that the avatar is standing just after the stand and on the ground by 0.6 s.
const GROUND_BY_MS = 600

const seatSource = `list seen; list replies; default {
  state_entry() { llSitTarget(<0,0,0.6>, ZERO_ROTATION); llListen(225101, "", llGetOwner(), ""); }
  link_message(integer sender, integer num, string message, key id) { llOwnerSay(message); }
  changed(integer c) { if (c & CHANGED_LINK) seen += llGetAgentInfo(llGetOwner()) & 48; }
  listen(integer c, string n, key id, string m) { replies += [m]; }
}`
// In-world: a force sit or stand landed 0.2-0.25 s after the command (Aditi, SLua Tideland, 2026-11-14).
// The ground sit from a seat comes a further 0.265-0.53 s after that stand.
const LANDED_MS = 250
const issue = (script: Script, message: string) => {
  script.fire('link_message', { sender_num: 1, num: 0, str: message, id: NULL_KEY })
  script.linkset.advanceTime(LANDED_MS)
}

async function pair() {
  const fixtures = await loadRlvPair({ source: seatSource })
  return Object.fromEntries(Object.entries(fixtures).map(([profile, fixture]) => {
    const { script, avatar, world } = fixture
    script.start()
    const sitting = () => avatar.info & (AGENT_SITTING | AGENT_ON_OBJECT)
    const seat = () => issue(script, '@sit:' + script.host.key + '=force')
    const wait = (ms: number) => script.linkset.advanceTime(ms)
    const last = () => avatar.viewer.commandLog.at(-1)
    return [profile, { script, avatar, world, sitting, seat, wait, last }]
  })) as Record<'rlv' | 'rlva', { script: Script, avatar: typeof fixtures.rlv.avatar, world: typeof fixtures.rlv.world,
    sitting(): number, seat(): void, wait(ms: number): void, last(): unknown }>
}

describe('@sitground=force from standing', () => {
  // In-world: standing (llGetAgentInfo 6), "@sitground=force" -> 22, "Sitting on Ground", no
  // changed event. Again on the ground -> still 22. "@unsit=force" -> 6.
  it.each(['rlv', 'rlva'] as const)('%s sits the avatar on the ground with no changed event', async profile => {
    const f = (await pair())[profile]
    issue(f.script, '@sitground=force')
    expect(f.sitting()).toBe(AGENT_SITTING)
    expect(f.avatar.sittingOn).toBeNull()
    expect(f.script.global('seen')).toEqual([])
    expect(f.last()).toMatchObject({ status: 'action', action: 'sitground', actionOutcome: 'applied', target: NULL_KEY })
    issue(f.script, '@sitground=force')
    expect(f.last()).toMatchObject({ action: 'sitground', actionOutcome: 'unchanged' })
    expect(f.sitting()).toBe(AGENT_SITTING)
    issue(f.script, '@unsit=force')
    expect(f.sitting()).toBe(0)
  })

  // In-world: standing, "@sitground:foo=force" -> 22, twice.
  it.each(['rlv', 'rlva'] as const)('%s ignores an option', async profile => {
    const f = (await pair())[profile]
    issue(f.script, '@sitground:foo=force')
    expect(f.sitting()).toBe(AGENT_SITTING)
    expect(f.avatar.viewer.diagnostics).toEqual([])
  })

  it.each(['rlv', 'rlva'] as const)('%s stops flying', async profile => {
    const f = (await pair())[profile]
    f.avatar.info |= 0x1
    issue(f.script, '@sitground=force')
    expect(f.avatar.info & 0x1).toBe(0)
    expect(f.sitting()).toBe(AGENT_SITTING)
  })
})

describe('@sitground=force from a seat', () => {
  // In-world: seated (54), "@sitground=force" -> the seat's changed(CHANGED_LINK) read 262, then
  // 6 at 0.066 s, sometimes 134 at 0.2 s, and 22 at 0.333, 0.266, 0.266 and 0.333 s after the
  // event, plus 0.266 and 0.265 s in the two runs below. A seventh run in another session read 6 at
  // 0.26 s and 22 at 0.53 s. The delay varied between 0.265 and 0.53 s in seven runs over two
  // sessions. rezless lands it at 300 ms.
  it.each(['rlv', 'rlva'] as const)('%s stands the avatar before the seat hears of it, then sits it on the ground', async profile => {
    const f = (await pair())[profile]
    f.seat()
    issue(f.script, '@sitground=force')
    expect(f.script.global('seen')).toEqual([AGENT_SITTING | AGENT_ON_OBJECT, 0])
    expect(f.last()).toMatchObject({ action: 'sitground', actionOutcome: 'pending', seat: f.script.host.key })
    expect(f.avatar.sittingOn).toBeNull()
    f.wait(0)
    expect(f.script.global('seen')).toEqual([AGENT_SITTING | AGENT_ON_OBJECT, 0])
    expect(f.sitting()).toBe(0)
    f.wait(GROUND_BY_MS)
    expect(f.sitting()).toBe(AGENT_SITTING)
    expect(f.script.global('seen')).toEqual([AGENT_SITTING | AGENT_ON_OBJECT, 0])
    expect(f.last()).toMatchObject({ action: 'sitground', actionOutcome: 'applied', seat: profile === 'rlva' ? f.avatar.key : NULL_KEY })
  })

  // In-world: seated, "@sit=force" -> changed read 262, then 22 at 0.266 s.
  it('rlva takes the same path for a null-key sit', async () => {
    const f = (await pair()).rlva
    f.seat()
    issue(f.script, '@sit=force')
    expect(f.script.global('seen')).toEqual([AGENT_SITTING | AGENT_ON_OBJECT, 0])
    expect(f.last()).toMatchObject({ action: 'sit', actionOutcome: 'pending' })
    f.wait(GROUND_BY_MS)
    expect(f.sitting()).toBe(AGENT_SITTING)
  })

  it.each(['rlv', 'rlva'] as const)('%s leaves an avatar that sat on an object in the meantime there', async profile => {
    const f = (await pair())[profile]
    f.seat()
    issue(f.script, '@sitground=force')
    f.seat()
    f.wait(GROUND_BY_MS)
    expect(f.avatar.sittingOn).toBe(f.script.host)
    expect(f.sitting()).toBe(AGENT_SITTING | AGENT_ON_OBJECT)
    expect(f.last()).toMatchObject({ action: 'sit', actionOutcome: 'applied' })
  })

  it.each(['rlv', 'rlva'] as const)('%s drops the ground sit once a later sit replaces it', async profile => {
    const f = (await pair())[profile]
    f.seat()
    issue(f.script, '@sitground=force')
    f.wait(50)
    f.seat()
    issue(f.script, '@unsit=force')
    f.wait(GROUND_BY_MS)
    expect(f.sitting()).toBe(0)
    const far = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      position: { x: 60, y: 0, z: 0 }, prims: [{}] })
    f.world.setSitResponse(far.prims[0]!, { position: { x: 0, y: 0, z: 1 }, autopilot: { durationMs: 1000, success: true } })
    f.seat()
    issue(f.script, '@sitground=force')
    issue(f.script, '@sit:' + far.prims[0]!.key + '=force')
    expect(f.last()).toMatchObject({ action: 'sit', actionOutcome: 'pending' })
    f.wait(1000)
    expect(f.avatar.sittingOn).toBe(far.prims[0])
  })
})

describe('@sitground=force after another force command in the message', () => {
  // RLVa (RlvForceHandler<RLV_BHVR_SITGROUND>) and Kokua (RRInterface::force) choose between the
  // stand and the ground sit from the seat the viewer knows of when the command arrives, and an
  // earlier force command in the same message hasn't reached the region yet.
  // In-world: seated, "@unsit=force,sitground=force", then "@getsitid" after 0.35 s -> the null key
  // and after 0.85 s -> the avatar's key: it stood first and sat on the ground later. Standing,
  // "@sitground=force,sitground=force" -> 22 (Aditi, SLua Tideland, 2026-11-14).
  it.each(['rlv', 'rlva'] as const)('%s stands first after an @unsit=force in the same message', async profile => {
    const f = (await pair())[profile]
    f.seat()
    issue(f.script, '@unsit=force,sitground=force')
    expect(f.script.global('seen')).toEqual([AGENT_SITTING | AGENT_ON_OBJECT, 0])
    expect(f.sitting()).toBe(0)
    f.wait(GROUND_BY_MS)
    expect(f.sitting()).toBe(AGENT_SITTING)
  })

  it.each(['rlv', 'rlva'] as const)('%s leaves a second ground sit unchanged', async profile => {
    const f = (await pair())[profile]
    issue(f.script, '@sitground=force,sitground=force')
    expect(f.avatar.viewer.commandLog.map(e => 'actionOutcome' in e && e.actionOutcome)).toEqual(['pending', 'pending', 'applied', 'unchanged'])
    expect(f.sitting()).toBe(AGENT_SITTING)
  })

  // Kokua's LLAgent::sitDown checks the sit and interact locks when it sends the ground sit.
  it('rlv checks its ground-sit locks at the command', async () => {
    const f = (await pair()).rlv
    issue(f.script, '@sitground=force,sit=n')
    expect(f.sitting()).toBe(AGENT_SITTING)
    issue(f.script, '@clear,unsit=force')
    f.script.fire('link_message', { sender_num: 1, num: 0, str: '@sit=n,sitground=force', id: NULL_KEY })
    f.script.fire('link_message', { sender_num: 1, num: 0, str: '@clear', id: NULL_KEY })
    f.wait(GROUND_BY_MS)
    expect(f.sitting()).toBe(0)
  })
})

describe('locks on @sitground=force', () => {
  // In-world: seated, the seat said "@unsit=n" then "@sitground=force" -> changed read 262, then 22
  // at 0.265 s. Another object holding "@unsit=n" -> no changed, still 54. Standing, another object
  // holding "@sit=n" -> still 6, and still 6 after that object cleared it.
  it('rlva exempts the issuer from its own unsit lock and refuses another object\'s', async () => {
    const f = (await pair()).rlva
    f.seat()
    issue(f.script, '@unsit=n,sitground=force')
    expect(f.last()).toMatchObject({ action: 'sitground', actionOutcome: 'pending' })
    f.wait(GROUND_BY_MS)
    expect(f.sitting()).toBe(AGENT_SITTING)
    issue(f.script, '@clear,unsit=force')
    const lock = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{ scripts: [{ name: 'lock', source: { source: seatSource } }] }] })
    lock.scripts.lock!.start()
    f.seat()
    issue(lock.scripts.lock!, '@unsit=n')
    issue(f.script, '@sitground=force')
    expect(f.last()).toMatchObject({ action: 'sitground', actionOutcome: 'refused', reason: 'restriction' })
    expect(f.avatar.sittingOn).toBe(f.script.host)
    issue(lock.scripts.lock!, '@clear,sit=n')
    issue(f.script, '@unsit=force')
    issue(f.script, '@sitground=force')
    expect(f.last()).toMatchObject({ action: 'sitground', actionOutcome: 'refused', reason: 'restriction' })
    expect(f.sitting()).toBe(0)
  })

  // Kokua (RRInterface::force, LLAgent::standUp, LLAgent::sitDown): not measured, Kokua is
  // not the viewer on the test grid. Its unsit and sit checks have no issuer exception, and
  // the ground sit after a stand checks the sit lock again.
  it('rlv refuses on the issuer\'s own locks and checks the sit lock again after the stand', async () => {
    const f = (await pair()).rlv
    f.seat()
    issue(f.script, '@unsit=n,sitground=force')
    expect(f.last()).toMatchObject({ action: 'sitground', actionOutcome: 'refused', reason: 'restriction' })
    expect(f.avatar.sittingOn).toBe(f.script.host)
    issue(f.script, '@clear,unsit=force,sit=n,sitground=force')
    f.wait(GROUND_BY_MS)
    expect(f.last()).toMatchObject({ action: 'sitground', actionOutcome: 'refused', reason: 'restriction' })
    expect(f.sitting()).toBe(0)
    issue(f.script, '@clear')
    f.seat()
    issue(f.script, '@sitground=force,sit=n')
    f.wait(GROUND_BY_MS)
    expect(f.sitting()).toBe(0)
    expect(f.last()).toMatchObject({ action: 'sitground', actionOutcome: 'refused', reason: 'restriction' })
  })

  it('rlv refuses the ground sit under an interact lock', async () => {
    const f = (await pair()).rlv
    issue(f.script, '@interact=n,sitground=force')
    expect(f.last()).toMatchObject({ action: 'sitground', actionOutcome: 'refused', reason: 'restriction' })
    expect(f.sitting()).toBe(0)
  })

  it('rlv stops flying even when a lock refuses the ground sit', async () => {
    const f = (await pair()).rlv
    f.avatar.info |= 0x1
    issue(f.script, '@sit=n,sitground=force')
    expect(f.last()).toMatchObject({ action: 'sitground', actionOutcome: 'refused', reason: 'restriction' })
    expect(f.avatar.info & 0x1).toBe(0)
    expect(f.sitting()).toBe(0)
  })

  // Kokua: LLAgent::standUp teleports a standtp avatar back at once, and LLAgent::sitDown then
  // saves the place it sits down at as the next return origin.
  it('rlv returns a standtp avatar, then sits it on the ground there', async () => {
    const f = (await pair()).rlv
    f.avatar.position = { x: 10, y: 20, z: 30 }
    issue(f.script, '@standtp=n')
    f.seat()
    f.avatar.position = { x: 50, y: 60, z: 70 }
    issue(f.script, '@sitground=force')
    f.wait(GROUND_BY_MS)
    expect(f.sitting()).toBe(AGENT_SITTING)
    expect(f.avatar.position).toMatchObject({ x: 10, y: 20 })
    f.avatar.position = { x: 90, y: 90, z: 90 }
    issue(f.script, '@unsit=force')
    f.wait(0)
    expect(f.avatar.position).toMatchObject({ x: 10, y: 20 })
  })

  it('rlva does not check the locks again after the stand', async () => {
    const f = (await pair()).rlva
    f.seat()
    issue(f.script, '@sitground=force,sit=n')
    f.wait(GROUND_BY_MS)
    expect(f.sitting()).toBe(AGENT_SITTING)
  })

  // In-world: "@standtp=n", the seat force-sat the avatar, then "@sitground=force" -> changed read
  // 262, the avatar fell back to where it stood before the sit and read 6, no ground sit. Then
  // "@standtp=y", force sit on the seat, viewer stand -> the avatar sat on the ground (22) next to
  // the seat. Firestorm's RlvHandler::onSitOrStand runs the standtp return in place of the
  // pending ground sit and keeps the ground sit for the next stand.
  it('rlva returns a standtp avatar instead of sitting it on the ground, and sits it at the next stand', async () => {
    const f = (await pair()).rlva
    f.avatar.position = { x: 10, y: 20, z: 30 }
    issue(f.script, '@standtp=n')
    f.seat()
    f.avatar.position = { x: 50, y: 60, z: 70 }
    issue(f.script, '@sitground=force')
    expect(f.last()).toMatchObject({ action: 'sitground', actionOutcome: 'applied' })
    f.wait(GROUND_BY_MS)
    expect(f.sitting()).toBe(0)
    expect(f.avatar.position).toMatchObject({ x: 10, y: 20, z: 30 })
    issue(f.script, '@standtp=y')
    f.seat()
    expect(f.world.userStandAvatar(f.avatar)).toBe(true)
    f.wait(0)
    expect(f.script.global('seen')).toEqual([48, 0, 48, 0])
    expect(f.sitting()).toBe(0)
    f.wait(GROUND_BY_MS)
    expect(f.sitting()).toBe(AGENT_SITTING)
    issue(f.script, '@unsit=force,sit:' + f.script.host.key + '=force,unsit=force')
    f.wait(GROUND_BY_MS)
    expect(f.sitting()).toBe(0)
  })

  it('rlva forgets a kept ground sit at a ground sit from standing', async () => {
    const f = (await pair()).rlva
    f.avatar.position = { x: 10, y: 20, z: 30 }
    issue(f.script, '@standtp=n')
    f.seat()
    issue(f.script, '@sitground=force')
    f.wait(GROUND_BY_MS)
    issue(f.script, '@standtp=y,sitground=force,unsit=force')
    f.seat()
    issue(f.script, '@unsit=force')
    f.wait(GROUND_BY_MS)
    expect(f.sitting()).toBe(0)
  })
})

// In-world: "@getcommand:sit;force=<channel>" -> "sit;sitground;unsit".
it('lists sitground among the RLVa force commands', async () => {
  const f = (await pair()).rlva
  issue(f.script, '@getcommand:sitg=225101')
  expect(f.script.global('replies')).toEqual(['sitground'])
  expect(f.avatar.viewer.commandLog.filter(e => e.status === 'unsupported')).toEqual([])
})
