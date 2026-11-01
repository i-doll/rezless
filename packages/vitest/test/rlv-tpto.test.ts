import { describe, expect, it } from 'vitest'
import { AGENT_SITTING, CHANGED_REGION, CHANGED_TELEPORT, NULL_KEY } from '@rezless/vm'
import { loadLinkset, loadRlvPair, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Teleportation
// In-world: global/region coordinates and fractions work; partial region coordinates
// and malformed/empty angles refuse movement. Numeric suffixes are accepted.
// Foreign tploc blocks distant travel, tplm does not block location travel,
// foreign sittp blocks local travel, and seated unsit exempts the force issuer.
// Global cross-region travel works under tplm, exact region boundaries enter the
// neighbouring region, and UUID tploc options do not grant an exception.
// (Aditi, SLua Tideland and SLua Tombolo, Firestorm RLVa 2.4.2, 2026-11-01).
const source = `integer changes; default {
  state_entry() { }
  link_message(integer s,integer n,string m,key id) { llOwnerSay(m); }
  changed(integer c) { if(c & CHANGED_LINK) ++changes; }
}`
const issue = (script: import('@rezless/vm').Script, message: string) =>
  script.fire('link_message', { sender_num: 1, num: 0, str: message, id: NULL_KEY })
const setup = async () => {
  const pair = await loadRlvPair({ source })
  for (const { world, avatar, script } of Object.values(pair)) {
    world.addRegion('North', { x: 0, y: 256 })
    avatar.position = { x: 10, y: 20, z: 30 }
    script.start()
  }
  return pair
}

describe('paired forced teleport', () => {
  it('moves through global coordinates and explicit regions without granting permissions', async () => {
    for (const { avatar, script } of Object.values(await setup())) {
      issue(script, '@tpto:12/24/36=force')
      expect(avatar.position).toEqual({ x: 12, y: 24, z: 36 })
      issue(script, '@tpto:north/14/25/40=force')
      expect(avatar.region).toBe('North')
      expect(avatar.position).toEqual({ x: 14, y: 25, z: 40 })
      expect(script.permissionRequests).toEqual([])
      expect(script.teleportRequests).toEqual([])
      expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'action', action: 'tpto', actionOutcome: 'applied' })
    }
  })

  it('preserves RLVa fractions and truncates Kokua coordinates', async () => {
    const pair = await setup()
    for (const fixture of Object.values(pair)) issue(fixture.script, '@tpto:12.75/24.5/36.9=force')
    expect(pair.rlv.avatar.position).toEqual({ x: 12, y: 24, z: 36 })
    expect(pair.rlva.avatar.position).toEqual({ x: 12.75, y: 24.5, z: 36.9 })
  })
})

it.each([
  ['12/24', { x: 12, y: 24, z: 22.975 }, false],
  ['12//24/36', { x: 12, y: 24, z: 36 }, false],
  ['bad/24/36', { x: 0, y: 24, z: 36 }, false],
  ['', { x: 0, y: 0, z: 22.975 }, false],
  ['12/24/36junk', { x: 12, y: 24, z: 36 }, true],
  ['12/24/36;bad', { x: 12, y: 24, z: 36 }, false],
  ['12/24/36;', { x: 12, y: 24, z: 36 }, false],
] as const)('parses profile-specific destination %s', async (option, rlv, rlvaMoves) => {
  const pair = await setup()
  for (const f of Object.values(pair)) issue(f.script, '@tpto:' + option + '=force')
  expect(pair.rlv.avatar.position).toEqual(rlv)
  expect(pair.rlva.avatar.position).toEqual(rlvaMoves ? rlv : { x: 10, y: 20, z: 30 })
  if (!rlvaMoves) expect(pair.rlva.avatar.viewer.commandLog.at(-1)).toMatchObject({ actionOutcome: 'refused', outcome: 'invalid-option' })
})

it('handles numeric prefixes, extra fields and requested facing by profile', async () => {
  const pair = await setup()
  for (const f of Object.values(pair)) {
    issue(f.script, '@tpto:12/24/36;1.57079632679junk;ignored=force')
    expect(f.avatar.position).toEqual({ x: 12, y: 24, z: 36 })
  }
  expect(pair.rlv.avatar.rotation).toEqual({ x: 0, y: 0, z: 0, s: 1 })
  expect(pair.rlva.avatar.rotation.z).toBeCloseTo(Math.SQRT1_2)
  expect(pair.rlva.teleportActions.at(-1)?.lookAt?.y).toBeCloseTo(1)
  issue(pair.rlva.script, '@tpto:14/26/38/ignored=force')
  expect(pair.rlva.avatar.position).toEqual({ x: 14, y: 26, z: 38 })
  issue(pair.rlva.script, '@tpto:rlv fixture/14/26/38/ignored=force')
  expect(pair.rlva.teleportActions.at(-1)).toMatchObject({ actionOutcome: 'refused', outcome: 'invalid-option' })
})

it('resolves named-region float precision and half-open global boundaries', async () => {
  for (const { world, avatar, script } of Object.values(await setup())) {
    world.addRegion('West', { x: -256, y: 0 })
    issue(script, '@tpto:rlv fixture/-1/256/40=force')
    expect(avatar.region).toBe('RLV fixture') // no north-west region exists
    expect(avatar.position).toEqual({ x: 10, y: 20, z: 30 })
    expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ reason: 'target-unavailable' })
    issue(script, '@tpto:0/256/40=force')
    expect(avatar.region).toBe('North')
    expect(avatar.position).toEqual({ x: 0, y: 0, z: 40 })
    issue(script, '@tpto:-1/0/40=force')
    expect(avatar.region).toBe('West')
    expect(avatar.position).toEqual({ x: 255, y: 0, z: 40 })
    issue(script, '@tpto:unknown/10/20/30=force')
    expect(avatar.region).toBe('West')
    expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ actionOutcome: 'refused', reason: 'target-unavailable' })
  }
})

it('stands with normal changed events and leaves simulator teleport permissions intact', async () => {
  for (const { world, avatar, script } of Object.values(await setup())) {
    world.sitAvatar(avatar, script.host)
    script.host.linkset!.advanceTime(0)
    issue(script, '@tpto:20/30/40=force')
    expect(avatar.sittingOn).toBeNull()
    expect(avatar.info & AGENT_SITTING).toBe(0)
    expect(script.global('changes')).toBe(2)
    expect(script.permissionRequests).toEqual([])
  }
  const pair = await loadRlvPair({ source: `default { state_entry() {
    llOwnerSay("@tpto:20/30/40=force");
    llTeleportAgent(llGetOwner(),"",<50,60,70>,<1,0,0>);
  } }` })
  for (const { avatar, script } of Object.values(pair)) {
    script.start()
    expect(avatar.position).toEqual({ x: 20, y: 30, z: 40 })
    expect(script.teleportRequests).toMatchObject([{ accepted: false }])
  }
})

const foreign = async (f: Awaited<ReturnType<typeof setup>>['rlv']) => {
  const loaded = await loadLinkset({ world: f.world, region: 'RLV fixture', owner: f.avatar.key,
    prims: [{ scripts: [{ name: 'foreign', source: { source } }] }] })
  loaded.scripts.foreign!.start()
  return loaded.scripts.foreign!
}

it.each(['global', 'named'] as const)('checks issuer exemptions for %s moves', async form => {
  const pair = await setup()
  for (const [profile, f] of Object.entries(pair)) {
    const option = form === 'global' ? '10/300/30' : 'north/10/44/30'
    issue(f.script, '@tploc=n,tpto:' + option + '=force')
    const allowed = profile === 'rlva' || form === 'global'
    expect(f.avatar.region).toBe(allowed ? 'North' : 'RLV fixture')
    expect(f.avatar.viewer.restrictions.snapshot()).toMatchObject([{ behaviour: 'tploc' }])
    f.avatar.region = 'RLV fixture'; f.avatar.position = { x: 10, y: 20, z: 30 }
    issue(f.script, '@clear')
    const other = await foreign(f)
    issue(other, '@tploc=n,tploc:' + f.script.host.key + '=n')
    issue(f.script, '@tpto:' + option + '=force')
    expect(f.avatar.region).toBe('RLV fixture')
    expect(f.teleportActions.at(-1)).toMatchObject({ actionOutcome: 'refused', reason: 'restriction' })
  }
})

it('separates local tploc and landmark locks by profile', async () => {
  const pair = await setup()
  for (const [profile, f] of Object.entries(pair)) {
    const other = await foreign(f)
    issue(other, '@tploc=n,tplm=n')
    issue(f.script, '@tpto:12/24/36=force')
    expect(f.avatar.position).toEqual(profile === 'rlva' ? { x: 12, y: 24, z: 36 } : { x: 10, y: 20, z: 30 })
    issue(other, '@clear,tplm=n')
    issue(f.script, '@tpto:10/300/30=force')
    expect(f.avatar.region).toBe('North')
  }
})

it('enforces foreign unsit while seated and exempts the synchronous force issuer', async () => {
  for (const f of Object.values(await setup())) {
    f.world.sitAvatar(f.avatar, f.script.host)
    const other = await foreign(f)
    issue(other, '@unsit=n')
    issue(f.script, '@tpto:12/24/36=force')
    expect(f.avatar.sittingOn).toBe(f.script.host)
    expect(f.teleportActions.at(-1)?.reason).toBe('restriction')
    issue(other, '@clear')
    issue(f.script, '@unsit=n,tpto:12/24/36=force')
    expect(f.avatar.sittingOn).toBeNull()
    expect(f.avatar.position).toEqual({ x: 12, y: 24, z: 36 })
    expect(f.avatar.viewer.restrictions.snapshot()).toMatchObject([{ behaviour: 'unsit' }])
  }
})

it.each([
  ['tplocal', '10/20/31.5', false, true],
  ['tplocal', '10/20/31.4', true, true],
  ['tplocal:2', '10/20/32.1', false, true],
  ['tplocal:500', '10/20/300', false, true],
  ['tplocal:-2', '10/20/31', true, false],
  ['sittp:2', '10/20/32', false, true],
] as const)('%s checks XYZ distance to %s', async (lock, destination, rlvaAllowed, rlvAllowed) => {
  for (const [profile, f] of Object.entries(await setup())) {
    const other = await foreign(f)
    issue(other, '@' + lock + '=n')
    issue(f.script, '@tpto:' + destination + '=force')
    const allowed = profile === 'rlva' ? rlvaAllowed : rlvAllowed
    expect(f.teleportActions.at(-1)?.actionOutcome).toBe(allowed ? 'applied' : 'refused')
  }
})

it('classifies local RLVa moves by XY distance across region boundaries', async () => {
  const pair = await setup()
  for (const f of Object.values(pair)) {
    f.avatar.position = { x: 10, y: 255, z: 30 }
    issue(await foreign(f), '@tploc=n')
    issue(f.script, '@tpto:10/256/30=force')
  }
  expect(pair.rlva.avatar.region).toBe('North')
  expect(pair.rlv.avatar.region).toBe('RLV fixture')
})

it('keeps malformed and exotic numeric forms inspectable and disabled mode inert', async () => {
  const pair = await setup()
  for (const f of Object.values(pair)) {
    for (const option of ['nan/20/30', '0x10/20/30', '2147483648e999/20/30']) {
      issue(f.script, '@tpto:' + option + '=force')
      expect(f.avatar.position).toEqual(f.avatar.viewer.profile === 'rlv' ? { x: 0, y: 20, z: 30 } : { x: option.startsWith('nan') ? 10 : 16, y: 20, z: 30 })
      expect(f.avatar.viewer.commandLog.at(-1)?.status).toBe(f.avatar.viewer.profile === 'rlv' && option.startsWith('2147483648') ? 'unsupported' : 'action')
    }
    issue(f.script, '@tpto:12/24/36=n')
    expect(f.avatar.position).toEqual({ x: f.avatar.viewer.profile === 'rlv' ? 0 : 16, y: 20, z: 30 })
  }
  const world = new World(); world.addRegion('off', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'off', region: 'off' })
  const loaded = await loadLinkset({ world, region: 'off', owner: avatar.key,
    prims: [{ scripts: [{ name: 'off', source: { source } }] }] })
  loaded.scripts.off!.start()
  issue(loaded.scripts.off!, '@tpto:12/24/36=force')
  expect(avatar.position).toEqual({ x: 0, y: 0, z: 0 })
  expect(avatar.viewer.commandLog).toEqual([])
})

it('keeps named Kokua angles inert and restores named issuer locks before teleporting', async () => {
  const pair = await setup()
  for (const f of Object.values(pair)) {
    f.avatar.rotation = { x: 0, y: 0, z: 1, s: 0 }
    issue(f.script, '@tpto:rlv fixture/12/24/36;0=force')
  }
  expect(pair.rlv.avatar.rotation).toEqual({ x: 0, y: 0, z: 1, s: 0 })
  expect(pair.rlva.avatar.rotation).toEqual({ x: 0, y: 0, z: 0, s: 1 })
  for (const [profile, f] of Object.entries(pair)) {
    const other = await foreign(f)
    issue(other, '@sittp=n')
    issue(f.script, '@tpto:rlv fixture/12/24/36;0=force')
    expect(f.teleportActions.at(-1)?.actionOutcome).toBe(profile === 'rlv' ? 'refused' : 'applied')
    issue(other, '@clear')
    f.world.sitAvatar(f.avatar, f.script.host)
    issue(f.script, '@unsit=n,tpto:rlv fixture/12/24/36=force')
    expect(f.avatar.sittingOn).toBe(profile === 'rlv' ? f.script.host : null)
    expect(f.avatar.viewer.restrictions.snapshot()).toMatchObject([{ behaviour: 'unsit' }])
  }
})

it('combines modifiers from all issuers when a foreign RLVa lock remains', async () => {
  const f = (await setup()).rlva
  const other = await foreign(f)
  issue(f.script, '@tplocal:1=n')
  issue(other, '@tplocal:10=n')
  issue(f.script, '@tpto:12/20/30=force')
  expect(f.teleportActions.at(-1)?.reason).toBe('restriction')
  issue(other, '@clear')
  issue(f.script, '@tpto:12/20/30=force')
  expect(f.avatar.position).toEqual({ x: 12, y: 20, z: 30 })
})

it('keeps Kokua custom issuer limits while lifting only bare limits', async () => {
  const f = (await setup()).rlv
  issue(f.script, '@tplocal:1=n,tplocal=n,tpto:12/20/30=force')
  expect(f.teleportActions.at(-1)?.reason).toBe('restriction')
  expect(f.avatar.viewer.restrictions.snapshot().map(r => r.rule)).toEqual(['tplocal:1', 'tplocal'])
  issue(f.script, '@tpto:a/b/c/d/e=force')
  expect(f.teleportActions.at(-1)?.outcome).toBe('invalid-option')
  expect(f.avatar.viewer.restrictions.snapshot().map(r => r.rule)).toEqual(['tplocal:1', 'tplocal'])
})

it('restores temporary Kokua locks with normal notification ordering', async () => {
  const pair = await loadRlvPair({ source: `list replies; default {
    state_entry() { llListen(227101,"",llGetOwner(),""); llOwnerSay("@notify:227101=add,tploc=n"); }
    link_message(integer s,integer n,string m,key id) { llOwnerSay(m); }
    listen(integer c,string n,key id,string m) { replies += [m]; }
  }` })
  for (const f of Object.values(pair)) { f.script.start(); issue(f.script, '@tpto:12/24/36=force') }
  expect(pair.rlv.script.global('replies')).toEqual(['/tploc=n', '/tploc=y', '/tploc=n'])
  expect(pair.rlva.script.global('replies')).toEqual(['/notify:227101=add', '/tploc=n'])
})

it('supports decimal exponents by each coordinate parser and rejects float overflow/underflow angles', async () => {
  const pair = await setup()
  for (const f of Object.values(pair)) issue(f.script, '@tpto:1e2/2e1/3e1=force')
  expect(pair.rlv.avatar.position).toEqual({ x: 1, y: 2, z: 22.975 })
  expect(pair.rlva.avatar.position).toEqual({ x: 100, y: 20, z: 30 })
  for (const option of ['12/24/36;1e999', '12/24/36;1e-99', '12/24/1e300']) {
    issue(pair.rlva.script, '@tpto:' + option + '=force')
    expect(pair.rlva.avatar.position).toEqual(option === '12/24/1e300' ? { x: 12, y: 24, z: 1e300 } : { x: 100, y: 20, z: 30 })
    expect(pair.rlva.avatar.viewer.commandLog.at(-1)?.status).toBe('action')
  }
})

it('refuses invalid World moves without disturbing seating or pose', async () => {
  const { world, avatar, script } = (await setup()).rlva
  world.sitAvatar(avatar, script.host)
  const before = { ...avatar.position }
  expect(world.teleportAvatar(avatar, { x: 0, y: 0, z: NaN })).toBe(false)
  expect(world.teleportAvatar(avatar, { x: 0, y: 0, z: 1 }, { x: Infinity, y: 0, z: 0 })).toBe(false)
  expect(world.teleportAvatar(avatar, { x: 999, y: 999, z: 1 })).toBe(false)
  const otherWorld = new World(); otherWorld.addRegion('RLV fixture', { x: 0, y: 0 })
  const outsider = otherWorld.addAvatar({ username: 'outsider', region: 'RLV fixture' })
  expect(world.teleportAvatar(outsider, { x: 0, y: 0, z: 1 })).toBe(false)
  expect(avatar.sittingOn).toBe(script.host)
  expect(avatar.position).toEqual(before)
  expect(world.teleportAvatar(avatar, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 })).toBe(true)
  expect(avatar.sittingOn).toBeNull()
  expect(avatar.position).toEqual({ x: 0, y: 0, z: 1 })
})

it('treats region names as names and ignores fields after the first angle', async () => {
  for (const f of Object.values(await setup())) {
    f.world.addRegion('Infinity Cove', { x: 256, y: 0 })
    issue(f.script, '@tpto:infinity cove/12/24/36;0;nan=force')
    expect(f.avatar.region).toBe('Infinity Cove')
    expect(f.avatar.position).toEqual({ x: 12, y: 24, z: 36 })
    issue(f.script, '@tpto:infinity cove/12/nan/36=force')
    expect(f.avatar.position).toEqual({ x: 12, y: f.avatar.viewer.profile === 'rlv' ? 0 : 24, z: 36 })
    expect(f.avatar.viewer.commandLog.at(-1)?.status).toBe('action')
  }
})

it('recognizes a nonempty Kokua angle tail even when it starts with another semicolon', async () => {
  const f = (await setup()).rlv
  issue(await foreign(f), '@sittp=n')
  issue(f.script, '@tpto:rlv fixture/12/24/36;;ignored=force')
  expect(f.avatar.position).toEqual({ x: 10, y: 20, z: 30 })
  expect(f.teleportActions.at(-1)?.reason).toBe('restriction')
})

it('lifts and restores Kokua issuer locks in command order regardless of insertion order', async () => {
  const pair = await loadRlvPair({ source: `list replies; default {
    state_entry() { llListen(227101,"",llGetOwner(),"");
      llOwnerSay("@notify:227101=add,sittp=n,unsit=n,tplocal=n,tploc=n"); }
    link_message(integer s,integer n,string m,key id) { llOwnerSay(m); }
    listen(integer c,string n,key id,string m) { replies += [m]; }
  }` })
  const f = pair.rlv; f.script.start()
  issue(f.script, '@tpto:12/24/36=force')
  expect((f.script.global('replies') as string[]).slice(4)).toEqual([
    '/tploc=y', '/tplocal=y', '/unsit=y', '/sittp=y',
    '/tploc=n', '/tplocal=n', '/unsit=n', '/sittp=n',
  ])
  expect(f.avatar.position).toEqual({ x: 12, y: 24, z: 36 })
})

describe('worn objects during forced teleport', () => {
  const worn = `integer replies; list changes; default {
    state_entry() { llListen(555, "", llGetOwner(), ""); }
    link_message(integer s, integer n, string m, key id) { llOwnerSay(m); }
    listen(integer c, string n, key id, string m) { ++replies; }
    changed(integer c) { changes += c; }
  }`
  const wear = async () => {
    const pair = await loadRlvPair({ source: worn })
    for (const { world, avatar, script } of Object.values(pair)) {
      world.addRegion('North', { x: 0, y: 256 })
      avatar.position = { x: 10, y: 20, z: 30 }
      script.start()
      script.linkset.attachToAvatar(avatar.key, 39)
      script.advanceTime(0)
    }
    return pair
  }

  it('keeps hearing viewer replies after moving far away and into another region', async () => {
    for (const { avatar, script } of Object.values(await wear())) {
      for (const command of ['@versionnum=555', '@tpto:200/200/30=force', '@versionnum=555',
        '@tpto:north/10/10/30=force', '@versionnum=555']) {
        issue(script, command)
        script.advanceTime(0)
      }
      expect(script.global('replies')).toBe(3)
      expect(script.linkset.region).toBe(avatar.region)
    }
  })

  // In-world: a worn object logging changed() saw 512 after a same-region
  // teleport and one 768 event after crossing into SLua Tombolo (Aditi,
  // SLua Tideland and SLua Tombolo, Firestorm RLVa 2.4.2, 2026-11-01).
  it('reports a teleport, and a region change when the region changes', async () => {
    for (const { script } of Object.values(await wear())) {
      issue(script, '@tpto:200/200/30=force')
      script.advanceTime(0)
      issue(script, '@tpto:north/10/10/30=force')
      script.advanceTime(0)
      expect(script.global('changes')).toEqual([CHANGED_TELEPORT, CHANGED_TELEPORT | CHANGED_REGION])
    }
  })
})
