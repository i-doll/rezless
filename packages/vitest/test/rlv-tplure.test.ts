import { expect, it } from 'vitest'
import { AGENT_SITTING, CHANGED_REGION, CHANGED_TELEPORT, NULL_KEY, teleportOfferLog, World } from '@rezless/vm'
import { loadLinkset, loadRlvPair } from '../src/index.js'

// Kokua RLV 2.09.35.00: LLIMProcessing::processNewMessage, RRInterface::containsWithoutException.
// Firestorm RLVa 2.4.2: RlvActions::canAcceptTpOffer, autoAcceptTeleportOffer; lure_callback.
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
    f.script.start()
  }
  return pair
}
const destination = { x: 12, y: 300, z: 40 }
const sender = (f: Awaited<ReturnType<typeof setup>>['rlv']) =>
  f.world.addAvatar({ username: 'sender', region: 'North' })

it('offers accept and decline with immutable histories and one response per offer', async () => {
  for (const f of Object.values(await setup())) {
    const from = sender(f)
    const pos = { ...destination }
    const offer = f.world.offerTeleport(from, f.avatar, pos)
    const history = teleportOfferLog(f.avatar)
    expect(offer.status).toBe('pending')
    pos.x = 99
    const accepted = f.world.respondTeleportOffer(f.avatar, offer, 'accept')
    expect(accepted).toMatchObject({ status: 'accepted', automatic: false,
      destination, result: { region: 'North', position: { x: 12, y: 44, z: 40 } } })
    expect(history).toEqual([offer])
    expect(teleportOfferLog(f.avatar)).toEqual([offer, accepted])
    expect(Object.isFrozen(accepted.result.position)).toBe(true)
    expect(f.world.respondTeleportOffer(f.avatar, offer, 'decline').reason).toBe('offer')
    const next = f.world.offerTeleport(from, f.avatar, { x: 20, y: 20, z: 20 })
    expect(f.world.respondTeleportOffer(f.avatar, next, 'decline').status).toBe('declined')
    expect(f.avatar.region).toBe('North')
    expect(f.script.permissionRequests).toEqual([])
    expect(f.script.teleportRequests).toEqual([])
  }
})

it.each(['tplure', 'tplure_sec'])('enforces %s, exceptions, remove aliases and clear', async lock => {
  for (const f of Object.values(await setup())) {
    const from = sender(f)
    issue(f.script, '@' + lock + '=add,accepttp=n')
    const blocked = f.world.offerTeleport(from, f.avatar, destination)
    expect(blocked).toMatchObject({ status: 'blocked', restrictions: [{ behaviour: lock }] })
    issue(f.script, '@' + lock + ':' + from.key + '=add')
    expect(f.world.offerTeleport(from, f.avatar, destination).status).toBe('accepted')
    issue(f.script, '@' + lock + ':' + from.key + '=rem')
    expect(f.world.offerTeleport(from, f.avatar, destination).status).toBe('blocked')
    issue(f.script, '@clear=tplure')
    expect(f.world.offerTeleport(from, f.avatar, destination).status).toBe('accepted')
    expect(blocked.restrictions).toHaveLength(1)
  }
})

it('scopes secure and permissive exceptions to every restricting issuer', async () => {
  for (const f of Object.values(await setup())) {
    const from = sender(f)
    const other = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
    const script = other.scripts.other!; script.start()
    issue(f.script, '@tplure=n,tplure:' + from.key + '=n')
    issue(script, '@tplure=n')
    expect(f.world.offerTeleport(from, f.avatar, destination).status).toBe('pending')
    issue(f.script, '@permissive=n')
    expect(f.world.offerTeleport(from, f.avatar, destination).restrictions).toMatchObject([{ sourcePrim: script.host.key }])
    issue(script, '@tplure:' + from.key + '=n')
    expect(f.world.offerTeleport(from, f.avatar, destination).status).toBe('pending')
    issue(f.script, '@clear')
    issue(script, '@clear,tplure_sec=n')
    issue(f.script, '@tplure:' + from.key + '=n')
    expect(f.world.offerTeleport(from, f.avatar, destination).status).toBe('blocked')
  }
})

it('auto-accepts global and matching sender rules, with profile-specific secure aliases', async () => {
  for (const [profile, f] of Object.entries(await setup())) {
    const from = sender(f)
    issue(f.script, '@accepttp:' + from.key + '=n')
    expect(f.world.offerTeleport(from, f.avatar, destination)).toMatchObject({ status: 'accepted', automatic: true })
    const other = f.world.addAvatar({ username: 'other', region: 'North' })
    expect(f.world.offerTeleport(other, f.avatar, destination).status).toBe('pending')
    issue(f.script, '@clear,accepttp_sec:' + from.key + '=n')
    expect(f.world.offerTeleport(from, f.avatar, destination).status).toBe(profile === 'rlva' ? 'accepted' : 'pending')
    expect(f.avatar.viewer.commandLog.at(-1)?.status).toBe(profile === 'rlva' ? 'applied' : 'unsupported')
    issue(f.script, '@clear,accepttp_sec=n')
    expect(f.world.offerTeleport(from, f.avatar, destination).status).toBe(profile === 'rlva' ? 'accepted' : 'pending')
    issue(f.script, '@clear,accepttp=n')
    expect(f.world.offerTeleport(other, f.avatar, destination).status).toBe('accepted')
    issue(f.script, '@accepttp=y')
    expect(f.world.offerTeleport(other, f.avatar, destination).status).toBe('pending')
  }
})

it('checks seated unsit at receipt, ignores map and landmark locks, and preserves pending callbacks', async () => {
  for (const f of Object.values(await setup())) {
    const from = sender(f)
    f.world.sitAvatarOnGround(f.avatar)
    issue(f.script, '@unsit=n,accepttp=n')
    expect(f.world.offerTeleport(from, f.avatar, destination)).toMatchObject({ status: 'blocked', restrictions: [{ behaviour: 'unsit' }] })
    expect(f.avatar.info & AGENT_SITTING).toBe(AGENT_SITTING)
    issue(f.script, '@clear,tplm=n,tploc=n,tplocal:1=n,sittp:1=n')
    const offer = f.world.offerTeleport(from, f.avatar, destination)
    issue(f.script, '@tplure=n,unsit=n,accepttp=n')
    expect(offer.status).toBe('pending')
    expect(f.world.respondTeleportOffer(f.avatar, offer, 'accept').status).toBe('accepted')
    expect(f.avatar.info & AGENT_SITTING).toBe(0)
  }
})

it('refuses foreign avatars, invalid destinations, forged and wrong-recipient responses', async () => {
  const f = (await setup()).rlva
  const from = sender(f)
  const elsewhere = new World(); elsewhere.addRegion('Elsewhere', { x: 0, y: 0 })
  const foreign = elsewhere.addAvatar({ username: 'foreign', region: 'Elsewhere' })
  expect(f.world.offerTeleport(from, foreign, destination).reason).toBe('avatar')
  expect(f.world.offerTeleport(foreign, f.avatar, destination).reason).toBe('avatar')
  expect(f.world.offerTeleport(f.avatar, f.avatar, destination).reason).toBe('avatar')
  for (const position of [{ x: NaN, y: 0, z: 0 }, { x: 999, y: 999, z: 0 }])
    expect(f.world.offerTeleport(from, f.avatar, position).reason).toBe('destination')
  const offer = f.world.offerTeleport(from, f.avatar, destination)
  expect(f.world.respondTeleportOffer(from, offer, 'accept').reason).toBe('offer')
  expect(f.world.respondTeleportOffer(f.avatar, { ...offer }, 'accept').reason).toBe('offer')
  expect(new World().respondTeleportOffer(f.avatar, offer, 'accept').reason).toBe('offer')
  expect(f.world.respondTeleportOffer(f.avatar, offer, 'accept').status).toBe('accepted')
})

it('moves attachments with normal teleport events and keeps disabled viewers manual', async () => {
  for (const f of Object.values(await setup())) {
    const from = sender(f)
    f.script.linkset.attachToAvatar(f.avatar.key, 39); f.script.advanceTime(0)
    issue(f.script, '@accepttp=n')
    f.world.offerTeleport(from, f.avatar, destination); f.script.advanceTime(0)
    expect(f.script.global('changes')).toEqual([CHANGED_TELEPORT | CHANGED_REGION])
  }
  const world = new World(); world.addRegion('Off', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'off', region: 'Off' })
  const from = world.addAvatar({ username: 'from', region: 'Off' })
  expect(teleportOfferLog(avatar)).toEqual([])
  const offer = world.offerTeleport(from, avatar, { x: 10, y: 20, z: 30 })
  expect(offer.status).toBe('pending')
  expect(world.respondTeleportOffer(avatar, offer, 'accept').status).toBe('accepted')
})

it('exposes fixture offers and advertises only supported discovery forms', async () => {
  for (const [profile, f] of Object.entries(await setup())) {
    const from = sender(f)
    expect(f.teleportOffers).toEqual([])
    const offer = f.receiveTeleportOffer(from, destination)
    expect(f.respondTeleportOffer(offer, 'decline').status).toBe('declined')
    expect(f.teleportOffers).toHaveLength(2)
    issue(f.script, '@issue286unknown=n')
    expect(f.avatar.viewer.commandLog.at(-1)?.status).toBe('unsupported')
    issue(f.script, '@tplure:invalid=n,accepttp:invalid=n')
    expect(f.avatar.viewer.commandLog.slice(-2).map(record => record.status)).toEqual(['unsupported', 'unsupported'])
    const invalid = f.avatar.viewer.restrictions.snapshot().filter(rule => rule.option === 'invalid')
    expect(invalid.map(rule => rule.support)).toEqual(profile === 'rlv' ? ['unsupported', 'unsupported'] : [])
    expect(f.receiveTeleportOffer(from, destination).status).toBe('pending')
    issue(f.script, '@clear,accepttp_sec:' + from.key + '=n')
    expect(f.avatar.viewer.restrictions.snapshot().map(rule => rule.support))
      .toEqual(profile === 'rlv' ? ['unsupported'] : ['enforced'])
  }
})

it('refuses responses when the recipient leaves and consumes unavailable destinations once', async () => {
  const f = (await setup()).rlva
  const from = sender(f)
  const offer = f.receiveTeleportOffer(from, destination)
  f.world.avatars.splice(f.world.avatars.indexOf(f.avatar), 1)
  expect(f.respondTeleportOffer(offer, 'accept').reason).toBe('offer')
  f.world.avatars.push(f.avatar)
  f.world.addRegion('North', { x: 1000, y: 1000 })
  expect(f.respondTeleportOffer(offer, 'accept')).toMatchObject({ status: 'refused', reason: 'destination' })
  expect(f.respondTeleportOffer(offer, 'accept').reason).toBe('offer')
  expect(f.avatar.region).toBe('RLV fixture')
})
