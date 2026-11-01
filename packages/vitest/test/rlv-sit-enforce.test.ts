import { expect, it } from 'vitest'
import { loadRlvPair } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Sitting
// In-world: user sit under sit=n, stand and seat switching under unsit=n -> blocked.
// Two unsit issuers -> blocked until the last lock is removed. llUnSit still stands.
// sittp default: 1.4 m accepted, 1.6 m blocked; :3 accepts 2.9 m, blocks 3/3.1 m.
// Competing :3/:2 block 2.5 m until :2 is removed. Force sit bypasses both issuers'
// sittp locks. Own force unsit/ground sit exempt the issuer; foreign unsit does not.
// :0 blocks; :-2 accepts a 1 m sit; :3suffix accepts; garbage is not stored.
// nan is retained and blocks; inf is retained and allows; overflow is not stored.
// Non-finite and hexadecimal distance forms are outside this finite-decimal fixture.
// Firestorm RLVa 2.4.2, API 3.4.3 (Aditi, SLua Tideland, 2026-11-01).
const source = `integer changes; default {
  state_entry() { llSitTarget(<0,0,0.5>, ZERO_ROTATION); }
  link_message(integer s, integer n, string m, key id) { llOwnerSay(m); }
  changed(integer c) { if (c & CHANGED_LINK) ++changes; }
}`

it('blocks user sitting while sit is locked and allows it after removal', async () => {
  for (const fixture of Object.values(await loadRlvPair({ source }))) {
    const { script, avatar } = fixture
    script.start()
    script.fire('link_message', { sender_num: 1, num: 0, str: '@sit=n', id: avatar.key })
    expect(fixture.userSit(script.host)).toBe(false)
    expect(avatar.sittingOn).toBeNull()
    expect(script.global('changes')).toBe(0)
    script.fire('link_message', { sender_num: 1, num: 0, str: '@sit=y', id: avatar.key })
    expect(fixture.userSit(script.host)).toBe(true)
    expect(avatar.sittingOn).toBe(script.host)
    expect(script.global('changes')).toBe(1)
  }
})

it('keeps two independent unsit locks until the last issuer removes its lock', async () => {
  const { loadLinkset } = await import('../src/index.js')
  for (const fixture of Object.values(await loadRlvPair({ source }))) {
    const { world, avatar, script } = fixture
    const other = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
      prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
    script.start(); other.scripts.other!.start()
    const send = (s: typeof script, str: string) => s.fire('link_message', { sender_num: 1, num: 0, str, id: avatar.key })
    expect(fixture.userSit(script.host)).toBe(true)
    send(script, '@unsit=n'); send(other.scripts.other!, '@unsit=n')
    expect(fixture.userStand()).toBe(false)
    send(script, '@unsit=y')
    expect(fixture.userStand()).toBe(false)
    expect(fixture.userSit(other.prims[0]!)).toBe(false)
    expect(avatar.sittingOn).toBe(script.host)
    send(other.scripts.other!, '@unsit=y')
    expect(fixture.userStand()).toBe(true)
    expect(avatar.sittingOn).toBeNull()
    expect(script.global('changes')).toBe(2)
  }
})

it.each([
  { option: '', distance: 1.49, allowed: true },
  { option: '', distance: 1.5, allowed: false },
  { option: '', distance: 1.51, allowed: false },
  { option: ':3', distance: 2.99, allowed: true },
  { option: ':3', distance: 3, allowed: false },
  { option: ':3', distance: 3.01, allowed: false },
])('applies the strict sittp$option boundary at $distance m', async ({ option, distance, allowed }) => {
  for (const fixture of Object.values(await loadRlvPair({ source }))) {
    const { script, avatar } = fixture
    script.start()
    avatar.position = { x: distance, y: 0, z: 0 }
    script.fire('link_message', { sender_num: 1, num: 0, str: '@sittp' + option + '=n', id: avatar.key })
    expect(fixture.userSit(script.host)).toBe(allowed)
    expect(avatar.sittingOn).toBe(allowed ? script.host : null)
    expect(script.global('changes')).toBe(allowed ? 1 : 0)
  }
})

it('rejects invalid world targets before changing a seated avatar', async () => {
  const { loadLinkset } = await import('../src/index.js')
  for (const fixture of Object.values(await loadRlvPair({ source }))) {
    const { script, world, avatar } = fixture
    script.start()
    expect(fixture.userSit(script.host)).toBe(true)
    world.addRegion('other region', { x: 256, y: 0 })
    const other = await loadLinkset({ world, region: 'other region', prims: [{}] })
    expect(fixture.userSit(other.prims[0]!)).toBe(false)
    const original = { ...avatar.position }
    expect(fixture.userSit(script.host, { x: NaN, y: 0, z: 0 })).toBe(false)
    expect(fixture.userSit(script.host, { x: Infinity, y: 0, z: 0 })).toBe(false)
    expect(avatar.position).toEqual(original)
    expect(avatar.sittingOn).toBe(script.host)
    expect(script.global('changes')).toBe(1)
  }
})

it('combines competing sittp limits and removes only the matching issuer rule', async () => {
  const { loadLinkset } = await import('../src/index.js')
  for (const fixture of Object.values(await loadRlvPair({ source }))) {
    const { script, avatar, world } = fixture
    script.start()
    const foreign = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
      prims: [{ scripts: [{ name: 'lock', source: { source } }] }] })
    const locker = foreign.scripts.lock!
    locker.start()
    const send = (s: typeof script, str: string) => s.fire('link_message', { sender_num: 1, num: 0, str, id: avatar.key })
    avatar.position = { x: 2.5, y: 0, z: 0 }
    send(script, '@sittp:3=n'); send(locker, '@sittp:2=n')
    expect(fixture.userSit(script.host)).toBe(false)
    send(script, '@sittp:2=y')
    expect(fixture.userSit(script.host)).toBe(false)
    send(locker, '@sittp:2=y')
    expect(fixture.userSit(script.host)).toBe(true)
    expect(avatar.sittingOn).toBe(script.host)
  }
})

// https://wiki.secondlife.com/wiki/LlUnSit
it('keeps simulator seating and llUnSit independent of viewer locks', async () => {
  const pair = await loadRlvPair({ source: `integer changes; default {
    state_entry() { llSitTarget(<0,0,0.5>,ZERO_ROTATION); llOwnerSay("@sit=n,unsit=n,sittp:0=n"); }
    touch_start(integer n) { llUnSit(llGetOwner()); }
    changed(integer c) { if(c & CHANGED_LINK) ++changes; }
  }` })
  for (const fixture of Object.values(pair)) {
    const { world, avatar, script } = fixture
    script.start()
    expect(fixture.userSit(script.host)).toBe(false)
    expect(world.sitAvatar(avatar, script.host)).toBe(true)
    expect(fixture.userStand()).toBe(false)
    script.fire('touch_start', { num_detected: 1 })
    expect(avatar.sittingOn).toBeNull()
    expect(avatar.info & 16).toBe(0)
    expect(script.global('changes')).toBe(2)
  }
})

it.each([
  { option: '0', rlv: false, rlva: false },
  { option: '-2', rlv: false, rlva: true },
  { option: '3suffix', rlv: true, rlva: true },
  { option: 'garbage', rlv: false, rlva: true },
])('has named profile expectations for sittp:$option', async ({ option, ...allowed }) => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const fixture = pair[profile]
    const { script, avatar } = fixture
    script.start()
    avatar.position = { x: 1, y: 0, z: 0 }
    script.fire('link_message', { sender_num: 1, num: 0, str: '@sittp:' + option + '=n', id: avatar.key })
    expect(fixture.userSit(script.host)).toBe(allowed[profile])
    expect(avatar.sittingOn).toBe(allowed[profile] ? script.host : null)
    expect(avatar.viewer.commandLog.at(-1)?.status).toBe(profile === 'rlva' && option === 'garbage' ? 'unsupported' : 'applied')
  }
})

it('keeps non-finite and hexadecimal command options inspectably unsupported without moving the avatar', async () => {
  for (const { script, avatar } of Object.values(await loadRlvPair({ source }))) {
    script.start()
    for (const option of ['nan', 'inf', '-inf', '1e50', '0x1p2']) {
      const position = { ...avatar.position }
      script.fire('link_message', { sender_num: 1, num: 0, str: '@sittp:' + option + '=n', id: avatar.key })
      expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'unsupported' })
      expect(avatar.sittingOn).toBeNull()
      expect(avatar.position).toEqual(position)
      expect(avatar.viewer.restrictions.snapshot().filter(rule => rule.support === 'enforced')).toEqual([])
    }
  }
})

it('measures the clicked point in three dimensions in the avatar region, independently of the sit target offset', async () => {
  for (const fixture of Object.values(await loadRlvPair({ source }))) {
    const { script, avatar, world } = fixture
    script.start()
    world.addRegion(avatar.region, { x: 40960, y: 23296 })
    avatar.position = { x: 0, y: 0, z: 2 }
    script.host.params.sitTarget.offset = { x: 0, y: 0, z: 10 }
    script.fire('link_message', { sender_num: 1, num: 0, str: '@sittp=n', id: avatar.key })
    expect(fixture.userSit(script.host)).toBe(false)
    expect(fixture.userSit(script.host, { x: 0, y: 0, z: 0.6 })).toBe(true)
    expect(avatar.position.z).toBe(10)
  }
})

it('does not apply sittp to forced sits from either issuer and keeps object sit locks effective', async () => {
  const { loadLinkset } = await import('../src/index.js')
  for (const fixture of Object.values(await loadRlvPair({ source }))) {
    const { world, avatar, script } = fixture
    script.start()
    const foreign = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
      position: { x: 10, y: 0, z: 0 }, prims: [{ scripts: [{ name: 'foreign', source: { source } }] }] })
    const forcer = foreign.scripts.foreign!
    forcer.start()
    const send = (s: typeof script, str: string) => s.fire('link_message', { sender_num: 1, num: 0, str, id: avatar.key })
    send(script, '@sittp=n')
    expect(fixture.userSit(foreign.prims[0]!)).toBe(false)
    send(script, '@sit:' + foreign.prims[0]!.key + '=force')
    expect(avatar.sittingOn).toBe(foreign.prims[0])
    world.standAvatar(avatar); avatar.position = { x: 0, y: 0, z: 0 }
    send(forcer, '@sit:' + foreign.prims[0]!.key + '=force')
    expect(avatar.sittingOn).toBe(foreign.prims[0])
    send(script, '@sit=n')
    send(forcer, '@sit:' + script.host.key + '=force')
    expect(avatar.sittingOn).toBe(foreign.prims[0])
  }
})

it('bypasses viewer rules in disabled mode and refuses avatars belonging to another world', async () => {
  const { loadLinkset, World } = await import('../src/index.js')
  const world = new World()
  world.addRegion('disabled', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'disabled', region: 'disabled' })
  const fixture = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
    prims: [{ scripts: [{ name: 'fixture', source: { source: source.replace('llSitTarget', 'llOwnerSay("@sit=n,unsit=n,sittp:0=n"); llSitTarget') } }] }] })
  fixture.scripts.fixture!.start()
  expect(world.userSitAvatar(avatar, fixture.prims[0]!)).toBe(true)
  expect(world.userStandAvatar(avatar)).toBe(true)
  expect(avatar.viewer.commandLog).toEqual([])
  const otherWorld = new World()
  otherWorld.addRegion('disabled', { x: 0, y: 0 })
  const other = otherWorld.addAvatar({ username: 'other', region: 'disabled' })
  expect(world.userSitAvatar(other, fixture.prims[0]!)).toBe(false)
  expect(world.userStandAvatar(other)).toBe(false)
})

it('chooses free configured targets and refuses full or removed seat objects atomically', async () => {
  const { loadLinkset, Prim } = await import('../src/index.js')
  for (const fixture of Object.values(await loadRlvPair({ source }))) {
    const { world, avatar, script } = fixture
    script.start()
    const seats = await loadLinkset({ world, region: avatar.region,
      prims: [0, 1].map(i => ({ scripts: [{ name: 'seat' + i, source: { source } }] })) })
    seats.scripts.seat0!.start(); seats.scripts.seat1!.start()
    const occupant = world.addAvatar({ username: 'occupant', region: avatar.region })
    world.sitAvatar(occupant, seats.prims[0]!)
    expect(fixture.userSit(seats.prims[0]!)).toBe(true)
    expect(avatar.sittingOn).toBe(seats.prims[1])
    expect(fixture.userStand()).toBe(true)
    const second = world.addAvatar({ username: 'second', region: avatar.region })
    world.sitAvatar(second, seats.prims[1]!)
    expect(fixture.userSit(seats.prims[0]!)).toBe(false)
    expect(fixture.userSit(new Prim())).toBe(false)
    expect(avatar.sittingOn).toBeNull()
    world.standAvatar(second)
    seats.linkset.dead = true
    expect(fixture.userSit(seats.prims[1]!)).toBe(false)
    expect(avatar.sittingOn).toBeNull()
  }
})

it('bounds plain-prim seating and reports distant simulator placement as unsupported', async () => {
  const { loadLinkset } = await import('../src/index.js')
  for (const fixture of Object.values(await loadRlvPair({ source }))) {
    const { world, avatar, script } = fixture
    script.start()
    const plain = await loadLinkset({ world, region: avatar.region, position: { x: 8, y: 0, z: 0 }, prims: [{}] })
    expect(fixture.userSit(plain.prims[0]!)).toBe(true)
    fixture.userStand(); avatar.position = { x: 0, y: 0, z: 0 }
    plain.prims[0]!.params.position = { x: 9, y: 0, z: 0 }
    expect(fixture.userSit(plain.prims[0]!)).toBe(false)
    expect(avatar.sittingOn).toBeNull()
    expect(avatar.viewer.diagnostics).toEqual([])
  }
})

it('enforces unsit on ground sitting and leaves a standing user free to sit', async () => {
  for (const fixture of Object.values(await loadRlvPair({ source }))) {
    const { world, avatar, script } = fixture
    script.start()
    script.fire('link_message', { sender_num: 1, num: 0, str: '@unsit=n', id: avatar.key })
    expect(fixture.userStand()).toBe(true)
    expect(fixture.userSit(script.host)).toBe(true)
    world.sitAvatarOnGround(avatar)
    expect(fixture.userStand()).toBe(false)
    expect(fixture.userSit(script.host)).toBe(false)
    expect(avatar.info & 16).toBe(16)
    script.fire('link_message', { sender_num: 1, num: 0, str: '@clear', id: avatar.key })
    expect(fixture.userStand()).toBe(true)
    expect(avatar.info & 16).toBe(0)
  }
})

// https://wiki.secondlife.com/wiki/LlSitOnLink
it('keeps experience llSitOnLink separate from user viewer restrictions', async () => {
  const { loadLinkset, Experience } = await import('../src/index.js')
  for (const { world, avatar, script } of Object.values(await loadRlvPair({ source }))) {
    script.start()
    script.fire('link_message', { sender_num: 1, num: 0, str: '@sit=n,unsit=n,sittp:0=n', id: avatar.key })
    const seat = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
      prims: [{ scripts: [{ name: 'experience', experience: new Experience({ agents: [avatar.key] }), source: { source:
        'integer result; default { state_entry() { llSitTarget(<0,0,0.5>,ZERO_ROTATION); result=llSitOnLink(llGetOwner(),1); } }' } }] }] })
    seat.scripts.experience!.start()
    expect(seat.scripts.experience!.global('result')).toBe(1)
    expect(avatar.sittingOn).toBe(seat.prims[0])
    expect(world.userStandAvatar(avatar)).toBe(false)
  }
})

it('uses the profile float comparison at a decimal squared-distance boundary', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const fixture = pair[profile]
    fixture.script.start()
    fixture.avatar.position = { x: 0.100000002, y: 0, z: 0 }
    fixture.script.fire('link_message', { sender_num: 1, num: 0, str: '@sittp:0.1=n', id: fixture.avatar.key })
    expect(fixture.userSit(fixture.script.host)).toBe(profile === 'rlva')
  }
})
