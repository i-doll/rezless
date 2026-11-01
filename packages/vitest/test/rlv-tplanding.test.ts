import { expect, it } from 'vitest'
import { CHANGED_REGION, CHANGED_TELEPORT, NULL_KEY, type Script } from '@rezless/vm'
import { loadLinkset, loadRlvPair } from '../src/index.js'

// Kokua RLV 2.09.35.00: RRInterface::forceTeleport, LLAgent::doTeleportViaLocation.
// Firestorm RLVa 2.4.2: RlvForceHandler<RLV_BHVR_TPTO>::onCommand,
// LLAgent::doTeleportViaLocation.
// https://community.secondlife.com/knowledgebase/english/managing-your-parcel-r49/
// https://wiki.secondlife.com/wiki/Viewerhelp:About_Land_-_Options
const source = `integer changes; default {
  state_entry() { }
  link_message(integer s, integer n, string m, key id) { llOwnerSay(m); }
  changed(integer c) { changes = changes | c; }
}`
const issue = (script: Script, command: string) => script.fire('link_message', {
  sender_num: 1, num: 0, str: command, id: NULL_KEY,
})
const landing = { x: 80, y: 90, z: 50 }

it('settles below-ground requests above the configured terrain in both profiles', async () => {
  // In-world: @tpto:SLua Tideland/120/60/0=force over llGround=22
  // settled at <120,60,22.975042> (Aditi, Firestorm RLVa 2.4.2, 2026-11-01).
  for (const { avatar, script } of Object.values(await loadRlvPair({ source }))) {
    script.start()
    issue(script, '@tpto:120/60/0=force')
    expect(avatar.position).toEqual({ x: 120, y: 60, z: 22.975 })
    issue(script, '@tpto:120/60/100=force')
    expect(avatar.position.z).toBe(100)
  }
})

it('interpolates terrain at the final landing point, retaining coordinate parsing differences', async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.world.addRegion('Slope', { x: 256, y: 0 }, { ground: (x, y) => x * x + y })
    f.script.start()
    issue(f.script, '@tpto:Slope/2.5/3.5/0=force')
  }
  expect(pair.rlv.avatar.position).toEqual({ x: 2, y: 3, z: 7.975 })
  expect(pair.rlva.avatar.position).toEqual({ x: 2.5, y: 3.5, z: 10.975 })
})

it('routes to the landing point and facing, and notifies worn objects at the resulting destination', async () => {
  for (const f of Object.values(await loadRlvPair({ source }))) {
    const { world, avatar, script } = f
    world.addRegion('Destination', { x: 256, y: 0 }, { ground: 60 })
    world.addParcel({ region: 'Destination', tpRouting: 1, landingPoint: landing, landingLookAt: { x: 0, y: 1, z: 0 } })
    const worn = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
      prims: [{ scripts: [{ name: 'worn', source: { source } }] }] })
    worn.linkset.attachToAvatar(avatar.key, 1)
    worn.scripts.worn!.start()
    script.start()
    issue(script, '@tpto:Destination/10/20/100;0=force')
    worn.linkset.advanceTime(0)
    expect(avatar.position).toEqual({ ...landing, z: 60.975 })
    expect(avatar.rotation.z).toBeCloseTo(Math.SQRT1_2)
    expect(worn.linkset.region).toBe('Destination')
    expect(worn.scripts.worn!.global('changes')).toBe(CHANGED_REGION | CHANGED_TELEPORT)
    expect(f.teleportActions.at(-1)).toMatchObject({ requested: { x: 266, y: 20, z: 100 },
      destination: { region: 'Destination', position: { x: 10, y: 20, z: 100 } },
      result: { region: 'Destination', position: { ...landing, z: 60.975 } }, actionOutcome: 'applied' })
  }
})

it.each([undefined, 2, 1])('allows direct travel with routing %s and no active landing point', async tpRouting => {
  for (const { world, avatar, script } of Object.values(await loadRlvPair({ source }))) {
    world.addParcel({ region: avatar.region, ...(tpRouting === undefined ? {} : { tpRouting }),
      landingPoint: tpRouting === 2 ? landing : { x: 0, y: 0, z: 0 } })
    script.start()
    issue(script, '@tpto:10/20/40=force')
    expect(avatar.position).toEqual({ x: 10, y: 20, z: 40 })
  }
})

it.each(['owner', 'estate'] as const)('exempts the %s from parcel routing while retaining terrain clearance', async role => {
  for (const { world, avatar, script } of Object.values(await loadRlvPair({ source }))) {
    if (role === 'estate') world.addRegion(avatar.region, { x: 0, y: 0 }, { estateManagers: [avatar.key.toUpperCase()] })
    for (const tpRouting of [0, 1]) {
      world.addParcel({ region: avatar.region, tpRouting, landingPoint: landing,
        ...(role === 'owner' ? { owner: avatar.key.toUpperCase() } : {}) })
      script.start()
      issue(script, '@tpto:10/20/0=force')
      expect(avatar.position).toEqual({ x: 10, y: 20, z: 22.975 })
    }
  }
})

it('diverts blocked travel to the nearest available parcel, respecting overlapping parcel bounds', async () => {
  for (const { world, avatar, script } of Object.values(await loadRlvPair({ source }))) {
    world.addParcel({ region: avatar.region, tpRouting: 0 })
    world.addParcel({ region: avatar.region, tpRouting: 2,
      bounds: { min: { x: 40, y: 40 }, max: { x: 60, y: 60 } } })
    world.addParcel({ region: avatar.region, tpRouting: 0,
      bounds: { min: { x: 40, y: 40 }, max: { x: 50, y: 60 } } })
    script.start()
    issue(script, '@tpto:20/50/40=force')
    expect(avatar.position).toEqual({ x: 50, y: 50, z: 40 })
  }
})

it('diverts to uncovered land and applies a replacement parcel landing point', async () => {
  for (const { world, avatar, script } of Object.values(await loadRlvPair({ source }))) {
    world.addParcel({ region: avatar.region, tpRouting: 0,
      bounds: { min: { x: 0, y: 0 }, max: { x: 50, y: 256 } } })
    script.start()
    issue(script, '@tpto:20/50/40=force')
    expect(avatar.position).toEqual({ x: 50, y: 50, z: 40 })
    world.addParcel({ region: avatar.region, tpRouting: 1, landingPoint: landing,
      bounds: { min: { x: 50, y: 0 }, max: { x: 256, y: 256 } } })
    issue(script, '@tpto:20/50/40=force')
    expect(avatar.position).toEqual(landing)
  }
})

it('refuses a wholly blocked region before standing or emitting attachment events', async () => {
  for (const f of Object.values(await loadRlvPair({ source }))) {
    const { world, avatar, script } = f
    world.addParcel({ region: avatar.region, tpRouting: 0 })
    world.sitAvatar(avatar, script.host)
    const before = { ...avatar.position }
    const worn = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
      prims: [{ scripts: [{ name: 'worn', source: { source } }] }] })
    worn.linkset.attachToAvatar(avatar.key, 1)
    worn.scripts.worn!.start()
    script.start()
    issue(script, '@tpto:10/20/40=force')
    worn.linkset.advanceTime(0)
    expect(avatar.position).toEqual(before)
    expect(avatar.sittingOn).toBe(script.host)
    expect(worn.scripts.worn!.global('changes')).toBe(0)
    expect(f.teleportActions.at(-1)).toMatchObject({ actionOutcome: 'refused', reason: 'world-constraint' })
  }
})

it('keeps profile facing rules when the landing point has no facing override', async () => {
  const pair = await loadRlvPair({ source })
  for (const { world, avatar, script } of Object.values(pair)) {
    world.addParcel({ region: avatar.region, landingPoint: landing })
    script.start()
    issue(script, '@tpto:10/20/40;1.57079632679=force')
    expect(avatar.position).toEqual(landing)
  }
  expect(pair.rlv.avatar.rotation.z).toBe(0)
  expect(pair.rlva.avatar.rotation.z).toBeCloseTo(Math.SQRT1_2)
})

it('keeps land group membership subject to routing and checks viewer locks before diversion', async () => {
  for (const f of Object.values(await loadRlvPair({ source }))) {
    const { world, avatar, script } = f
    world.addParcel({ region: avatar.region, group: avatar.group, landingPoint: landing })
    script.start()
    issue(script, '@tpto:10/20/40=force')
    expect(avatar.position).toEqual(landing)
    const other = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
      prims: [{ scripts: [{ name: 'lock', source: { source } }] }] })
    other.scripts.lock!.start()
    issue(other.scripts.lock!, '@tploc=n,tplocal:0=n')
    issue(script, '@tpto:10/20/40=force')
    expect(f.teleportActions.at(-1)).toMatchObject({ actionOutcome: 'refused', reason: 'restriction' })
    expect(avatar.position).toEqual(landing)
  }
})

it('diverts inside excluded upper bounds, ignoring parcels in another region', async () => {
  for (const { world, avatar, script } of Object.values(await loadRlvPair({ source }))) {
    world.addRegion('Other', { x: 256, y: 0 })
    world.addParcel({ region: 'Other', tpRouting: 2 })
    world.addParcel({ region: avatar.region, tpRouting: 0 })
    world.addParcel({ region: avatar.region, tpRouting: 2,
      bounds: { min: { x: 10, y: 10 }, max: { x: 20, y: 20 } } })
    script.start()
    issue(script, '@tpto:30/30/40=force')
    expect(avatar.position.x).toBeCloseTo(20, 4)
    expect(avatar.position.y).toBeCloseTo(20, 4)
    expect(avatar.position.x).toBeLessThan(20)
    expect(avatar.position.y).toBeLessThan(20)
    expect(world.parcelAt(avatar.region, avatar.position)?.tpRouting).toBe(2)
  }
})
