import { expect, it } from 'vitest'
import { loadLinkset, loadRlvPair } from '../src/index.js'

// Firestorm RLVa 2.4.2: RlvForceHandler<RLV_BHVR_SIT>::onCommand,
// RlvActions::canSit, process_avatar_sit_response and near_sit_object.
// Kokua RLV 2.09.35.00: force_sit, process_avatar_sit_response and near_sit_object.
const source = `integer changes; default {
  link_message(integer s, integer n, string m, key id) { llOwnerSay(m); }
  changed(integer c) { if (c & CHANGED_LINK) ++changes; }
}`
const profiles = ['rlv', 'rlva'] as const
const send = (fixture: Awaited<ReturnType<typeof loadRlvPair>>['rlv'], command: string) =>
  fixture.script.fire('link_message', { sender_num: 1, num: 0, str: command, id: fixture.avatar.key })

it.each(profiles)('%s applies a simulator surface pose beyond 8 m without a sittp force limit', async profile => {
  const fixture = (await loadRlvPair({ source }))[profile]
  const { world, avatar, script } = fixture
  const seat = await loadLinkset({ world, region: avatar.region, position: { x: 116, y: 60, z: 1997.41638 },
    prims: [{ scripts: [{ name: 'seat', source: { source } }] }] })
  const prim = seat.prims[0]!
  prim.params.size = { x: 20, y: 20, z: 0.5 }
  avatar.position = { x: 116, y: 48, z: 1997.41638 }
  // In-world: zero-offset force sit, 20x20x0.5 box at 12 m -> seated near its
  // near edge at local <-0.38675,-10.09,0.88>, rotation <0,0,-0.70711,0.70711>.
  // Aditi, SLua Tideland, Firestorm RLVa 2.4.2, 2026-11-01.
  world.setSitResponse(prim, { position: { x: -0.38675, y: -10.09, z: 0.88 },
    rotation: { x: 0, y: 0, z: -Math.SQRT1_2, s: Math.SQRT1_2 } })
  script.start(); seat.scripts.seat!.start()
  send(fixture, '@sittp:0=n,sit:' + prim.key + '=force')
  expect(avatar.sittingOn).toBe(prim)
  expect(avatar.position.x).toBeCloseTo(115.61325, 5)
  expect(avatar.position.y).toBeCloseTo(49.91, 5)
  expect(avatar.position.z).toBeCloseTo(1998.29638, 5)
  expect(avatar.rotation.z).toBeCloseTo(-0.70710678, 7)
  expect(avatar.rotation.s).toBeCloseTo(0.70710678, 7)
  expect(avatar.info & 48).toBe(48)
  expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'action', actionOutcome: 'applied' })
  expect(avatar.viewer.diagnostics).toEqual([])
  expect(seat.scripts.seat!.global('changes')).toBe(1)
  expect(script.permissionRequests).toEqual([])
})

it.each(profiles)('%s treats a far plain-prim refusal as an action and preserves the pose', async profile => {
  const fixture = (await loadRlvPair({ source }))[profile]
  const { world, avatar, script } = fixture
  const seat = await loadLinkset({ world, region: avatar.region, position: { x: 60, y: 0, z: 0 }, prims: [{}] })
  script.start()
  const before = { ...avatar.position }
  // In-world: 0.5 m box at 8.5, 10, 20 and 60 m -> standing, unchanged pose.
  // Aditi, SLua Tideland, Firestorm RLVa 2.4.2, 2026-11-01.
  send(fixture, '@sit:' + seat.prims[0]!.key + '=force')
  expect(avatar.sittingOn).toBeNull()
  expect(avatar.position).toEqual(before)
  expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'action', actionOutcome: 'refused', reason: 'world-constraint' })
  expect(avatar.viewer.diagnostics).toEqual([])
})

it.each(profiles)('%s completes successful autopilot before seating and changed events', async profile => {
  const fixture = (await loadRlvPair({ source }))[profile]
  const { world, avatar, script } = fixture
  const seat = await loadLinkset({ world, region: avatar.region, position: { x: 60, y: 0, z: 0 },
    prims: [{ scripts: [{ name: 'seat', source: { source } }] }] })
  const prim = seat.prims[0]!
  world.setSitResponse(prim, { position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 1, s: 0 },
    autopilot: { durationMs: 2000, success: true } })
  script.start(); seat.scripts.seat!.start()
  send(fixture, '@sit:' + prim.key + '=force')
  expect(avatar.sittingOn).toBeNull()
  expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ actionOutcome: 'pending' })
  seat.linkset.advanceTime(1999)
  expect(avatar.sittingOn).toBeNull()
  expect(seat.scripts.seat!.global('changes')).toBe(0)
  seat.linkset.advanceTime(1)
  expect(avatar.sittingOn).toBe(prim)
  expect(avatar.position).toEqual({ x: 61, y: 2, z: 3 })
  expect(avatar.rotation).toEqual({ x: 0, y: 0, z: 1, s: 0 })
  expect(seat.scripts.seat!.global('changes')).toBe(1)
  expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ actionOutcome: 'applied' })
  prim.params.position = { x: 1, y: 0, z: 0 }
  expect(avatar.position).toEqual({ x: 2, y: 2, z: 3 })
})

it.each(profiles)('%s keeps a failed autopilot standing', async profile => {
  const fixture = (await loadRlvPair({ source }))[profile]
  const { world, avatar, script } = fixture
  const seat = await loadLinkset({ world, region: avatar.region, position: { x: 60, y: 0, z: 0 }, prims: [{}] })
  world.setSitResponse(seat.prims[0]!, { position: { x: 0, y: 0, z: 1 },
    autopilot: { durationMs: 1000, success: false } })
  script.start(); send(fixture, '@sit:' + seat.prims[0]!.key + '=force')
  seat.linkset.advanceTime(1000)
  expect(avatar.sittingOn).toBeNull()
  expect(avatar.position).toEqual({ x: 0, y: 0, z: 0 })
  expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ actionOutcome: 'refused', reason: 'world-constraint' })
})

it.each(profiles)('%s enforces user sittp before considering a far response', async profile => {
  const fixture = (await loadRlvPair({ source }))[profile]
  const { world, avatar, script } = fixture
  const seat = await loadLinkset({ world, region: avatar.region, position: { x: 60, y: 0, z: 0 }, prims: [{}] })
  const prim = seat.prims[0]!
  world.setSitResponse(prim, { position: { x: 0, y: 0, z: 1 } })
  script.start(); send(fixture, '@sittp:60=n')
  expect(fixture.userSit(prim)).toBe(false)
  send(fixture, '@sittp:60=y,sittp:61=n')
  expect(fixture.userSit(prim)).toBe(true)
  expect(avatar.position).toEqual({ x: 60, y: 0, z: 1 })
})

it.each(['reset', 'teleport', 'occupied', 'deleted', 'replacement', 'cancel'] as const)(
  'does not complete stale autopilot after %s', async event => {
    for (const fixture of Object.values(await loadRlvPair({ source }))) {
      const { world, avatar, script } = fixture
      const seat = await loadLinkset({ world, region: avatar.region, position: { x: 60, y: 0, z: 0 }, prims: [{}] })
      const prim = seat.prims[0]!
      world.setSitResponse(prim, { position: { x: 0, y: 0, z: 1 }, autopilot: { durationMs: 1000, success: true } })
      script.start(); send(fixture, '@sit:' + prim.key + '=force')
      if (event === 'reset') avatar.viewer.session.reset()
      if (event === 'teleport') world.teleportAvatar(avatar, { x: 10, y: 10, z: 10 })
      if (event === 'occupied') world.sitAvatar(world.addAvatar({ username: 'occupant', region: avatar.region }), prim)
      if (event === 'deleted') seat.linkset.dead = true
      if (event === 'replacement') send(fixture, '@sit:' + script.host.key + '=force')
      if (event === 'cancel') world.cancelSitAutopilot(avatar)
      script.linkset.advanceTime(1000)
      expect(avatar.sittingOn).toBe(event === 'replacement' ? script.host : null)
      if (event === 'teleport') expect(avatar.position).toEqual({ x: 10, y: 10, z: 10 })
    }
  })

it('completes user autopilot and skips it when already seated on the response linkset', async () => {
  for (const fixture of Object.values(await loadRlvPair({ source }))) {
    const { world, avatar, script } = fixture
    const seat = await loadLinkset({ world, region: avatar.region, position: { x: 60, y: 0, z: 0 }, prims: [{}, {}] })
    world.setSitResponse(seat.prims[0]!, { position: { x: 0, y: 0, z: 1 }, autopilot: { durationMs: 1000, success: true } })
    world.setSitResponse(seat.prims[1]!, { position: { x: 0, y: 0, z: 2 }, autopilot: { durationMs: 1000, success: false } })
    script.start()
    expect(fixture.userSit(seat.prims[0]!)).toBe(true)
    expect(avatar.sittingOn).toBeNull()
    script.linkset.advanceTime(1000)
    expect(avatar.sittingOn).toBe(seat.prims[0])
    expect(fixture.userSit(seat.prims[1]!)).toBe(true)
    expect(avatar.sittingOn).toBe(seat.prims[1])
    expect(avatar.position).toEqual({ x: 60, y: 0, z: 2 })
  }
})

it('snapshots responses, supports explicit refusal and clearing, and validates transforms', async () => {
  for (const fixture of Object.values(await loadRlvPair({ source }))) {
    const { world, avatar, script } = fixture
    script.start()
    const position = { x: 0, y: 0, z: 2 }
    world.setSitResponse(script.host, { position })
    position.z = 10
    expect(fixture.userSit(script.host)).toBe(true)
    expect(avatar.position).toEqual({ x: 0, y: 0, z: 2 })
    fixture.userStand()
    world.setSitResponse(script.host, null)
    expect(fixture.userSit(script.host)).toBe(false)
    world.setSitResponse(script.host, undefined)
    expect(fixture.userSit(script.host)).toBe(true)
    expect(avatar.position).toEqual({ x: 0, y: 0, z: 0 })
    expect(() => world.setSitResponse(script.host, { position: { x: NaN, y: 0, z: 0 } })).toThrow(RangeError)
    expect(() => world.setSitResponse(script.host, { position, autopilot: { durationMs: -1, success: true } })).toThrow(RangeError)
  }
})

it('keeps named signed-versus-squared user limits on far simulator responses', async () => {
  const pair = await loadRlvPair({ source })
  const allowed = { rlv: false, rlva: true }
  for (const profile of profiles) {
    const fixture = pair[profile]
    const { world, avatar, script } = fixture
    const seat = await loadLinkset({ world, region: avatar.region, position: { x: 30, y: 0, z: 0 }, prims: [{}] })
    world.setSitResponse(seat.prims[0]!, { position: { x: 0, y: 0, z: 1 } })
    script.start(); send(fixture, '@sittp:-50=n')
    expect(fixture.userSit(seat.prims[0]!)).toBe(allowed[profile])
    expect(avatar.position).toEqual(allowed[profile] ? { x: 30, y: 0, z: 1 } : { x: 0, y: 0, z: 0 })
  }
})

it('turns flying off when a sit response starts an unsuccessful pilot', async () => {
  for (const fixture of Object.values(await loadRlvPair({ source }))) {
    const { world, avatar, script } = fixture
    avatar.info = 1
    world.setSitResponse(script.host, { position: { x: 0, y: 0, z: 1 }, autopilot: { durationMs: 1000, success: false } })
    script.start(); send(fixture, '@sit:' + script.host.key + '=force')
    expect(avatar.info & 1).toBe(0)
    script.linkset.advanceTime(1000)
    expect(avatar.info & 17).toBe(0)
  }
})
