import { describe, expect, it } from 'vitest'
import { AGENT_SITTING, CHANGED_REGION, CHANGED_TELEPORT, NULL_KEY, type Script } from '@rezless/vm'
import { loadLinkset, loadRlvPair, World } from '../src/index.js'

// Kokua RLV 2.09.35.00: RRInterface::add, force_sit, LLAgent::standUp,
// LLVOAvatar::sitDown, LLAgent::doTeleportViaLocationLookAt.
// Firestorm RLVa 2.4.2: RlvActions::canSit, RlvHandler::onSitOrStand,
// RlvForceHandler<RLV_BHVR_SIT>::onCommand, RlvUtil::forceTp.
const source = `integer teleports; integer changes; list replies; default {
  state_entry() { llListen(288101,"",llGetOwner(),""); }
  link_message(integer sender,integer num,string message,key id) {
    if (num == 1) llUnSit(llGetOwner()); else llOwnerSay(message);
  }
  changed(integer c) { changes = changes | c; if (c & CHANGED_TELEPORT) ++teleports; }
  listen(integer c,string n,key id,string m) { replies += [m]; }
}`
const issue = (script: Script, message: string, num = 0) =>
  script.fire('link_message', { sender_num: 1, num, str: message, id: NULL_KEY })
const origin = { x: 20, y: 30, z: 40 }
const moved = { x: 80, y: 90, z: 50 }

async function setup() {
  const pair = await loadRlvPair({ source })
  for (const { avatar, script } of Object.values(pair)) {
    avatar.position = { ...origin }
    script.host.params.position = { x: 22, y: 30, z: 40 }
    script.host.params.sitTarget = { enabled: true, offset: { x: 0, y: 0, z: 0.5 }, rotation: { x: 0, y: 0, z: 0, s: 1 } }
    script.start()
  }
  return pair
}

describe('standtp return teleports', () => {
  it.each(['user', 'force', 'llUnSit', 'deleted'] as const)('returns after %s standing and notifies attachments once', async path => {
    const pair = await setup()
    for (const fixture of Object.values(pair)) {
      const { world, avatar, script } = fixture
      const worn = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
        prims: [{ scripts: [{ name: 'worn', source: { source } }] }] })
      worn.linkset.attachToAvatar(avatar.key, 1)
      worn.scripts.worn!.start()
      issue(script, '@standtp=n,sit:' + script.host.key + '=force')
      expect(avatar.sittingOn).toBe(script.host)
      script.host.params.position = { ...moved }
      if (path === 'user') expect(fixture.userStand()).toBe(true)
      else if (path === 'force') issue(script, '@unsit=force')
      else if (path === 'llUnSit') issue(script, '', 1)
      else { script.linkset.remove(); expect(avatar.sittingOn).toBeNull() }
      worn.linkset.advanceTime(0)
      expect(avatar.position).toEqual(origin)
      expect(avatar.info & AGENT_SITTING).toBe(0)
      expect(worn.scripts.worn!.global('changes')).toBe(CHANGED_TELEPORT)
      expect(worn.scripts.worn!.global('teleports')).toBe(1)
      world.standAvatar(avatar)
      worn.linkset.advanceTime(0)
      expect(avatar.position).toEqual(origin)
      expect(worn.scripts.worn!.global('teleports')).toBe(1)
    }
  })

  it('bypasses teleport locks while retaining user and forced unsit policy', async () => {
    const pair = await setup()
    for (const profile of ['rlv', 'rlva'] as const) {
      const fixture = pair[profile]
      const { avatar, script } = fixture
      issue(script, '@standtp=n,sit:' + script.host.key + '=force,unsit=n,tploc=n,tplm=n,tplocal:0=n,sittp:0=n')
      script.host.params.position = { ...moved }
      expect(fixture.userStand()).toBe(false)
      issue(script, '@unsit=force')
      if (profile === 'rlv') {
        expect(avatar.sittingOn).toBe(script.host)
        issue(script, '', 1)
      }
      script.advanceTime(0)
      expect(avatar.position).toEqual(origin)
      expect(avatar.sittingOn).toBeNull()
      expect(avatar.viewer.restrictions.snapshot().map(rule => rule.behaviour)).toContain('unsit')
    }
  })

  it('captures a user sit origin and refreshes it for each later sit', async () => {
    const pair = await setup()
    for (const fixture of Object.values(pair)) {
      const { avatar, script } = fixture
      issue(script, '@standtp=add')
      expect(fixture.userSit(script.host)).toBe(true)
      script.host.params.position = { ...moved }
      fixture.userStand()
      expect(avatar.position).toEqual(origin)
      const next = { x: 81, y: 90, z: 50 }
      avatar.position = { ...next }
      expect(fixture.userSit(script.host)).toBe(true)
      script.host.params.position = { x: 100, y: 110, z: 60 }
      fixture.userStand()
      expect(avatar.position).toEqual(next)
    }
  })

  it('names the different origins when standtp is added after sitting', async () => {
    const pair = await setup()
    for (const profile of ['rlv', 'rlva'] as const) {
      const fixture = pair[profile]
      const { avatar, script } = fixture
      issue(script, '@sit:' + script.host.key + '=force')
      const whenAdded = { ...avatar.position }
      issue(script, '@standtp=n')
      script.host.params.position = { ...moved }
      const seated = { ...avatar.position }
      fixture.userStand()
      expect(avatar.position).toEqual(profile === 'rlv' ? whenAdded : seated)
    }
  })

  it.each(['y', 'rem', 'clear'] as const)('disables return when the last rule is removed with %s', async remove => {
    const pair = await setup()
    for (const fixture of Object.values(pair)) {
      const { avatar, script } = fixture
      issue(script, '@standtp=n,sit:' + script.host.key + '=force')
      issue(script, remove === 'clear' ? '@clear=standtp' : '@standtp=' + remove)
      script.host.params.position = { ...moved }
      const seated = { ...avatar.position }
      fixture.userStand()
      expect(avatar.position).toEqual(seated)
    }
  })

  it('does not refresh Kokua origin on duplicate add, but does for a new issuer', async () => {
    const pair = await setup()
    for (const profile of ['rlv', 'rlva'] as const) {
      const fixture = pair[profile]
      const { world, avatar, script } = fixture
      issue(script, '@standtp=n,sit:' + script.host.key + '=force')
      issue(script, '@standtp=add')
      script.host.params.position = { ...moved }
      fixture.userStand()
      expect(avatar.position).toEqual(origin)
      issue(script, '@sit:' + script.host.key + '=force')
      const other = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
        prims: [{ scripts: [{ name: 'lock', source: { source } }] }] })
      other.scripts.lock!.start()
      const whenAdded = { ...avatar.position }
      issue(other.scripts.lock!, '@standtp=n')
      issue(script, '@standtp=y')
      script.host.params.position = { x: 100, y: 110, z: 60 }
      fixture.userStand()
      expect(avatar.position).toEqual(profile === 'rlv' ? whenAdded : origin)
    }
  })

  it('blocks RLVa seated object sit requests and keeps their original return origin', async () => {
    const pair = await setup()
    const fixture = pair.rlva
    const { world, avatar, script } = fixture
    issue(script, '@standtp=n,sit:' + script.host.key + '=force')
    const other = await loadLinkset({ world, region: avatar.region, owner: avatar.key, prims: [{}] })
    expect(fixture.userSit(other.prims[0]!)).toBe(false)
    issue(script, '@sit:' + other.prims[0]!.key + '=force')
    expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'action', actionOutcome: 'refused', reason: 'restriction' })
    expect(avatar.sittingOn).toBe(script.host)
    script.host.params.position = { ...moved }
    fixture.userStand()
    expect(avatar.position).toEqual(origin)
  })

  it('returns across regions with teleport and region changes on worn scripts', async () => {
    const pair = await setup()
    for (const fixture of Object.values(pair)) {
      const { world, avatar, script } = fixture
      world.addRegion('destination', { x: 256, y: 0 })
      const worn = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
        prims: [{ scripts: [{ name: 'worn', source: { source } }] }] })
      worn.linkset.attachToAvatar(avatar.key, 1); worn.scripts.worn!.start()
      issue(script, '@standtp=n,sit:' + script.host.key + '=force')
      const transported = await loadLinkset({ world, region: 'destination', owner: avatar.key,
        position: moved, prims: [{}] })
      // Seed a simulator transport without a new viewer sit request.
      avatar.sittingOn = null
      avatar.region = 'destination'
      avatar.sittingOn = transported.prims[0]!
      fixture.userStand()
      worn.linkset.advanceTime(0)
      expect(avatar.region).toBe('RLV fixture')
      expect(avatar.position).toEqual(origin)
      expect(worn.scripts.worn!.global('changes')).toBe(CHANGED_TELEPORT | CHANGED_REGION)
    }
  })

  it.each([undefined, 0, 1, 2])('gates Kokua returns on parcel routing %s', async routing => {
    const pair = await setup()
    for (const profile of ['rlv', 'rlva'] as const) {
      const fixture = pair[profile]
      const { world, avatar, script } = fixture
      world.addParcel({ region: avatar.region, ...(routing === undefined ? {} : { tpRouting: routing }) })
      issue(script, '@standtp=n,sit:' + script.host.key + '=force')
      script.host.params.position = { ...moved }
      const seated = { ...avatar.position }
      fixture.userStand()
      expect(avatar.position).toEqual(profile === 'rlv' && routing !== 2 ? seated : origin)
    }
  })

  it('keeps disabled viewers inert and discovers only bare standtp forms', async () => {
    const world = new World(); world.addRegion('off', { x: 0, y: 0 })
    const avatar = world.addAvatar({ username: 'off', region: 'off', position: origin })
    const loaded = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
      position: moved, prims: [{ scripts: [{ name: 'off', source: { source } }] }] })
    loaded.scripts.off!.start(); issue(loaded.scripts.off!, '@standtp=n')
    world.sitAvatar(avatar, loaded.prims[0]!)
    world.userStandAvatar(avatar)
    expect(avatar.position).toEqual(moved)
    expect(avatar.viewer.commandLog).toEqual([])
    const pair = await setup()
    for (const { avatar, script } of Object.values(pair)) {
      issue(script, '@standtp:bad=n,standtp=force')
      expect(avatar.viewer.commandLog.slice(-2).every(entry => entry.status === 'unsupported')).toBe(true)
      issue(script, '@standtp=n,getcommand:standtp;add=288101')
      expect(avatar.viewer.restrictions.snapshot().find(rule => rule.rule === 'standtp')?.support).toBe('enforced')
    }
    expect(pair.rlva.script.global('replies')).toEqual(['standtp'])
    expect(pair.rlv.script.global('replies')).toEqual([])
  })
})

it('names the zero-global-origin guard and preserves facing', async () => {
  const pair = await setup()
  for (const profile of ['rlv', 'rlva'] as const) {
    const fixture = pair[profile]
    const { avatar, script } = fixture
    avatar.position = { x: 0, y: 0, z: 0 }
    script.host.params.rotation = { x: 0, y: 0, z: Math.SQRT1_2, s: Math.SQRT1_2 }
    issue(script, '@standtp=n,sit:' + script.host.key + '=force')
    const facing = { ...avatar.rotation }
    script.host.params.position = { ...moved }
    const seated = { ...avatar.position }
    fixture.userStand()
    expect(avatar.position).toEqual(profile === 'rlv' ? { x: 0, y: 0, z: 0 } : seated)
    // Standing retains the seat's yaw; the return teleport adds no look-at change.
    expect(avatar.rotation).toEqual(facing)
  }
})

it('keeps an RLVa return already queued before a restriction is removed', async () => {
  const { rlva: { world, avatar, script } } = await setup()
  issue(script, '@standtp=n,sit:' + script.host.key + '=force')
  script.host.params.position = { ...moved }
  world.standAvatar(avatar)
  expect(avatar.position).toEqual({ ...moved, z: moved.z + 0.5 })
  issue(script, '@standtp=y')
  script.advanceTime(0)
  expect(avatar.position).toEqual(origin)
})

it('preserves a seated origin when a rule is removed and re-added', async () => {
  const pair = await setup()
  for (const profile of ['rlv', 'rlva'] as const) {
    const fixture = pair[profile]
    const { avatar, script } = fixture
    issue(script, '@standtp=n,sit:' + script.host.key + '=force,standtp=y')
    script.host.params.position = { ...moved }
    const whenAdded = { ...avatar.position }
    issue(script, '@standtp=n')
    script.host.params.position = { x: 110, y: 120, z: 60 }
    fixture.userStand()
    expect(avatar.position).toEqual(profile === 'rlv' ? whenAdded : origin)
  }
})

it.each(['user', 'force'] as const)('names profile outcomes when a seated %s changes object seats', async path => {
  const pair = await setup()
  for (const profile of ['rlv', 'rlva'] as const) {
    const fixture = pair[profile]
    const { world, avatar, script } = fixture
    const other = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
      position: { x: 24, y: 30, z: 40 }, prims: [{}] })
    issue(script, '@standtp=n,sit:' + script.host.key + '=force')
    if (path === 'user') expect(fixture.userSit(other.prims[0]!)).toBe(profile === 'rlv')
    else issue(script, '@sit:' + other.prims[0]!.key + '=force')
    script.advanceTime(0)
    expect(avatar.sittingOn).toBe(profile === 'rlv' ? null : script.host)
    if (profile === 'rlv') expect(avatar.position).toEqual(origin)
  }
})

it('returns when RLVa changes from an object to ground and does not capture ground sit alone', async () => {
  const { rlva: { avatar, script } } = await setup()
  issue(script, '@standtp=n,sit=force,unsit=force')
  expect(avatar.position).toEqual(origin)
  issue(script, '@sit:' + script.host.key + '=force')
  script.host.params.position = { ...moved }
  issue(script, '@sit=force')
  script.advanceTime(0)
  expect(avatar.position).toEqual(origin)
  expect(avatar.info & AGENT_SITTING).toBe(0)
})

it('does not create an RLVa return origin for simulator seating', async () => {
  const { rlva: fixture } = await setup()
  const { world, avatar, script } = fixture
  issue(script, '@standtp=n')
  world.sitAvatar(avatar, script.host)
  script.host.params.position = { ...moved }
  const seated = { ...avatar.position }
  fixture.userStand()
  expect(avatar.position).toEqual(seated)
})


it.each(['rlv', 'rlva'] as const)('queues %s removed-seat travel without reading avatar properties', async profile => {
  const { [profile]: { world, avatar, script } } = await setup()
  const worn = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
    prims: [{ scripts: [{ name: 'worn', source: { source } }] }] })
  worn.linkset.attachToAvatar(avatar.key, 1); worn.scripts.worn!.start()
  issue(script, '@standtp=n,sit:' + script.host.key + '=force')
  script.host.params.position = { ...moved }
  script.linkset.remove()
  worn.linkset.advanceTime(0)
  expect(worn.scripts.worn!.global('teleports')).toBe(1)
  expect(avatar.position).toEqual(origin)
})

it.each(['same', 'other'] as const)('retains Kokua standing-clear behavior for an unrelated filter from %s issuer', async issuer => {
  const { rlv: fixture } = await setup()
  const { world, avatar, script } = fixture
  issue(script, '@standtp=n')
  const other = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
    prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
  other.scripts.other!.start()
  issue(issuer === 'same' ? script : other.scripts.other!, '@clear=unrelated')
  expect(avatar.viewer.restrictions.snapshot().some(rule => rule.rule === 'standtp')).toBe(true)
  world.sitAvatar(avatar, script.host)
  script.host.params.position = { ...moved }
  fixture.userStand()
  expect(avatar.position).toEqual({ x: 0, y: 0, z: 0 })
})
