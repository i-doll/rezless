import { expect, it } from 'vitest'
import { AGENT_SITTING, CHANGED_REGION, CHANGED_TELEPORT, NULL_KEY, userTeleportLog, World } from '@rezless/vm'
import { loadLinkset, loadRlvPair } from '../src/index.js'

const source = `list changes; default {
  state_entry() { }
  link_message(integer s, integer n, string m, key id) { llOwnerSay(m); }
  changed(integer c) { changes += c; }
}`
const issue = (script: import('@rezless/vm').Script, message: string) =>
  script.fire('link_message', { sender_num: 1, num: 0, str: message, id: NULL_KEY })
const setup = async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.world.addRegion('North', { x: 0, y: 256 })
    f.avatar.position = { x: 10, y: 20, z: 30 }
    f.script.start()
  }
  return pair
}

it.each(['landmark', 'map'] as const)('records successful %s travel without granting script permissions', async kind => {
  for (const f of Object.values(await setup())) {
    const destination = { x: 11.25, y: 300.5, z: 40.75 }
    const result = kind === 'landmark' ? f.world.userTeleportAvatarViaLandmark(f.avatar, destination) :
      f.world.userTeleportAvatarViaMap(f.avatar, destination)
    expect(result).toMatchObject({ action: kind, status: 'applied', requested: destination,
      result: { region: 'North', position: { x: 11.25, y: 44.5, z: 40.75 } }, restrictions: [] })
    destination.x = 99
    expect(result.requested.x).toBe(11.25)
    expect(userTeleportLog(f.avatar)).toEqual([result])
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.result.position)).toBe(true)
    expect(f.script.permissionRequests).toEqual([])
    expect(f.script.teleportRequests).toEqual([])
  }
})

it.each(['tplm', 'tploc'] as const)('applies %s to the appropriate user action', async lock => {
  for (const f of Object.values(await setup())) {
    issue(f.script, '@' + lock + '=n')
    const destination = { x: 10, y: 300, z: 30 }
    const landmark = f.world.userTeleportAvatarViaLandmark(f.avatar, destination)
    expect(landmark.status).toBe(lock === 'tplm' ? 'blocked' : 'applied')
    f.avatar.region = 'RLV fixture'; f.avatar.position = { x: 10, y: 20, z: 30 }
    const map = f.world.userTeleportAvatarViaMap(f.avatar, destination)
    expect(map.status).toBe(lock === 'tploc' ? 'blocked' : 'applied')
    const blocked = lock === 'tplm' ? landmark : map
    expect(blocked.restrictions).toMatchObject([{ behaviour: lock, sourcePrim: f.script.host.key, support: 'enforced' }])
    issue(f.script, '@' + lock + '=y')
    expect(f.world.userTeleportAvatarViaLandmark(f.avatar, destination).status).toBe('applied')
    expect(f.world.userTeleportAvatarViaMap(f.avatar, destination).status).toBe('applied')
  }
})

it('distinguishes local map travel by profile and ignores tploc UUID options', async () => {
  const pair = await setup()
  for (const [profile, f] of Object.entries(pair)) {
    issue(f.script, '@tploc=n,tploc:' + f.avatar.key + '=n')
    expect(f.world.userTeleportAvatarViaMap(f.avatar, { x: 12, y: 24, z: 36 }).status)
      .toBe(profile === 'rlva' ? 'applied' : 'blocked')
    issue(f.script, '@clear,tploc:' + f.avatar.key + '=n,tplm:' + f.avatar.key + '=n')
    expect(f.world.userTeleportAvatarViaMap(f.avatar, { x: 10, y: 300, z: 30 }).status).toBe('applied')
    expect(f.world.userTeleportAvatarViaLandmark(f.avatar, { x: 10, y: 20, z: 30 }).status).toBe('applied')
  }
})

it.each([
  ['tplocal:2', { x: 10, y: 20, z: 32 }, 'applied', 'blocked'],
  ['tplocal:2', { x: 10, y: 20, z: 31.9 }, 'applied', 'applied'],
  ['tplocal', { x: 10, y: 20, z: 31.5 }, 'applied', 'blocked'],
  ['tplocal:-2', { x: 10, y: 20, z: 31 }, 'blocked', 'applied'],
  ['sittp:2', { x: 10, y: 20, z: 32 }, 'applied', 'blocked'],
  ['tplocal:500', { x: 10, y: 20, z: 300 }, 'applied', 'blocked'],
  ['tploc', { x: 10, y: 256, z: 30 }, 'blocked', 'applied'],
  ['tploc', { x: 10, y: 276, z: 30 }, 'blocked', 'blocked'],
  ['tplocal:2', { x: 10, y: 256, z: 30 }, 'applied', 'blocked'],
] as const)('%s checks local geometry at %j', async (lock, destination, rlv, rlva) => {
  for (const [profile, f] of Object.entries(await setup())) {
    issue(f.script, '@' + lock + '=n')
    const result = f.world.userTeleportAvatarViaMap(f.avatar, destination)
    expect(result.status).toBe(profile === 'rlv' ? rlv : rlva)
    expect(result.restrictions.map(rule => rule.rule)).toEqual(result.status === 'blocked' ? [lock] : [])
    // Landmarks do not use the map destination's local-distance restrictions.
    expect(f.world.userTeleportAvatarViaLandmark(f.avatar, destination).status).toBe('applied')
  }
})

it.each(['landmark', 'map'] as const)('enforces every issuer and seated unsit for %s travel', async kind => {
  for (const f of Object.values(await setup())) {
    const other = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
    const foreign = other.scripts.other!; foreign.start()
    const lock = kind === 'landmark' ? 'tplm' : 'tploc'
    issue(f.script, '@' + lock + '=n')
    issue(foreign, '@' + lock + '=n')
    const move = () => kind === 'landmark' ? f.world.userTeleportAvatarViaLandmark(f.avatar, { x: 10, y: 300, z: 30 }) :
      f.world.userTeleportAvatarViaMap(f.avatar, { x: 10, y: 300, z: 30 })
    expect(move().restrictions).toHaveLength(2)
    issue(f.script, '@clear')
    expect(move().restrictions).toMatchObject([{ sourcePrim: foreign.host.key }])
    issue(foreign, '@clear')
    f.world.sitAvatar(f.avatar, f.script.host)
    issue(f.script, '@unsit=n')
    expect(move()).toMatchObject({ status: 'blocked', restrictions: [{ behaviour: 'unsit' }] })
    expect(f.avatar.sittingOn).toBe(f.script.host)
    issue(f.script, '@clear')
    expect(move().status).toBe('applied')
    expect(f.avatar.sittingOn).toBeNull()
    expect(f.avatar.info & AGENT_SITTING).toBe(0)
    issue(f.script, '@unsit=n')
    expect(move().status).toBe('applied')
  }
})

it('keeps invalid destinations and foreign avatars from changing state', async () => {
  const f = (await setup()).rlva
  f.world.sitAvatar(f.avatar, f.script.host)
  for (const destination of [{ x: NaN, y: 20, z: 30 }, { x: 999, y: 999, z: 30 }]) {
    expect(f.world.userTeleportAvatarViaMap(f.avatar, destination)).toMatchObject({ status: 'refused', reason: 'destination' })
    expect(f.avatar.sittingOn).toBe(f.script.host)
  }
  const world = new World(); world.addRegion('Other', { x: 0, y: 0 })
  const outsider = world.addAvatar({ username: 'outsider', region: 'Other' })
  expect(f.world.userTeleportAvatarViaLandmark(outsider, { x: 10, y: 20, z: 30 }))
    .toMatchObject({ status: 'refused', reason: 'avatar' })
  expect(outsider.position).toEqual({ x: 0, y: 0, z: 0 })
  expect(world.userTeleportAvatarViaMap(outsider, { x: 10, y: 20, z: 30 }).status).toBe('applied')
})

it('delivers teleport and region changes to worn scripts through the shared move', async () => {
  for (const f of Object.values(await setup())) {
    f.script.linkset.attachToAvatar(f.avatar.key, 39)
    f.script.advanceTime(0)
    f.world.userTeleportAvatarViaLandmark(f.avatar, { x: 12, y: 24, z: 36 })
    f.script.advanceTime(0)
    f.world.userTeleportAvatarViaMap(f.avatar, { x: 10, y: 300, z: 30 })
    f.script.advanceTime(0)
    expect(f.script.global('changes')).toEqual([CHANGED_TELEPORT, CHANGED_TELEPORT | CHANGED_REGION])
    expect(f.script.linkset.region).toBe('North')
  }
})

it('exposes paired user actions and keeps action histories as snapshots', async () => {
  for (const f of Object.values(await setup())) {
    expect(f.userTeleportActions).toEqual([])
    const first = f.userTeleportLandmark({ x: 12, y: 24, z: 36 })
    const history = f.userTeleportActions
    expect(f.userTeleportMap({ x: 10, y: 300, z: 30 }).status).toBe('applied')
    expect(history).toEqual([first])
    expect(f.userTeleportActions).toHaveLength(2)
    expect(first.result).toEqual({ region: 'RLV fixture', position: { x: 12, y: 24, z: 36 } })
  }
})

it('keeps disabled viewer restrictions inert and blocks ground sit escape', async () => {
  const f = (await setup()).rlva
  f.world.sitAvatarOnGround(f.avatar)
  issue(f.script, '@unsit=n')
  expect(f.userTeleportMap({ x: 12, y: 24, z: 36 })).toMatchObject({ status: 'blocked', restrictions: [{ behaviour: 'unsit' }] })
  expect(f.avatar.info & AGENT_SITTING).toBe(AGENT_SITTING)
  const world = new World(); world.addRegion('Off', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'off', region: 'Off' })
  const loaded = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
    prims: [{ scripts: [{ name: 'off', source: { source: 'default { state_entry() { llOwnerSay("@tplm=n,tploc=n,unsit=n"); } }' } }] }] })
  loaded.scripts.off!.start()
  world.sitAvatarOnGround(avatar)
  expect(world.userTeleportAvatarViaMap(avatar, { x: 12, y: 24, z: 36 }).status).toBe('applied')
  expect(world.userTeleportAvatarViaLandmark(avatar, { x: 14, y: 26, z: 38 }).status).toBe('applied')
  expect(avatar.viewer.commandLog).toEqual([])
})

it('aggregates local modifiers across issuers and retains the refusing state', async () => {
  for (const f of Object.values(await setup())) {
    const other = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
    other.scripts.other!.start()
    issue(f.script, '@tplocal:1=n')
    issue(other.scripts.other!, '@tplocal:10=n')
    const action = f.userTeleportMap({ x: 12, y: 20, z: 30 })
    expect(action.status).toBe('blocked')
    expect(action.restrictions.map(rule => rule.rule)).toEqual(['tplocal:1', 'tplocal:10'])
    expect(action.result.position).toEqual({ x: 10, y: 20, z: 30 })
    issue(f.script, '@clear')
    expect(f.userTeleportMap({ x: 12, y: 20, z: 30 }).status).toBe('applied')
    expect(action.restrictions).toHaveLength(2)
  }
})
