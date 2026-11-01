import { expect, it } from 'vitest'
import { AGENT_SITTING, NULL_KEY, teleportOfferLog, teleportRequestLog, World } from '@rezless/vm'
import { getRlvCommandCoverage, loadLinkset, loadRlvPair } from '../src/index.js'

// Kokua RLV 2.09.35.00: LLIMProcessing::processNewMessage, teleport_request_callback, send_lures.
// Firestorm RLVa 2.4.2: RlvActions::canAcceptTpRequest, autoAcceptTeleportRequest; teleport_request_callback.
const source = `default {
  state_entry() { }
  link_message(integer s, integer n, string m, key id) { llOwnerSay(m); }
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
const requester = (f: Awaited<ReturnType<typeof setup>>['rlv']) =>
  f.world.addAvatar({ username: 'requester', region: 'North', viewer: { profile: f.avatar.viewer.profile }, position: { x: 10, y: 20, z: 30 } })

it('accepts requests by sending ordinary offers to the requester at response-time coordinates', async () => {
  for (const f of Object.values(await setup())) {
    const from = requester(f)
    const original = { ...from.position }
    expect(f.teleportRequests).toEqual([])
    const request = f.receiveTeleportRequest(from)
    const history = teleportRequestLog(f.avatar)
    expect(request).toMatchObject({ requester: from.key, recipient: f.avatar.key, status: 'pending', automatic: false })
    expect(teleportOfferLog(from)).toEqual([])
    f.world.teleportAvatar(f.avatar, { x: 40, y: 50, z: 60 })
    const response = f.respondTeleportRequest(request, 'accept')
    expect(response).toMatchObject({ status: 'accepted', automatic: false,
      offer: { sender: f.avatar.key, recipient: from.key, status: 'pending', destination: { x: 40, y: 50, z: 60 } } })
    expect(from.position).toEqual(original)
    expect(history).toEqual([request])
    expect(f.teleportRequests).toEqual([request, response])
    expect(Object.isFrozen(response)).toBe(true)
    expect(f.world.respondTeleportOffer(from, response.offer!, 'accept').status).toBe('accepted')
    expect(from.position).toEqual(f.avatar.position)
    expect(f.respondTeleportRequest(request, 'accept').reason).toBe('request')
    const next = f.receiveTeleportRequest(from)
    const declined = f.respondTeleportRequest(next, 'decline')
    expect(declined.status).toBe('declined')
    expect(declined.offer).toBeUndefined()
    expect(teleportOfferLog(from)).toHaveLength(2)
    expect(f.script.permissionRequests).toEqual([])
    expect(f.script.teleportRequests).toEqual([])
  }
})

it.each(['tprequest', 'tprequest_sec'])('enforces %s before automatic acceptance, including aliases and clear', async lock => {
  for (const f of Object.values(await setup())) {
    const from = requester(f)
    issue(f.script, '@' + lock + '=add,accepttprequest=n')
    const blocked = f.receiveTeleportRequest(from)
    expect(blocked).toMatchObject({ status: 'blocked', automatic: false, restrictions: [{ behaviour: lock }] })
    expect(teleportOfferLog(from)).toEqual([])
    issue(f.script, '@' + lock + ':' + from.key + '=add')
    expect(f.receiveTeleportRequest(from).status).toBe('accepted')
    issue(f.script, '@' + lock + ':' + from.key + '=rem')
    expect(f.receiveTeleportRequest(from).status).toBe('blocked')
    issue(f.script, '@clear=tprequest')
    expect(f.receiveTeleportRequest(from).status).toBe('pending')
    issue(f.script, '@accepttprequest=add')
    expect(f.receiveTeleportRequest(from).status).toBe('accepted')
    issue(f.script, '@accepttprequest=rem')
    expect(f.receiveTeleportRequest(from).status).toBe('pending')
    expect(blocked.restrictions).toHaveLength(1)
    expect(Object.isFrozen(blocked.restrictions)).toBe(true)
  }
})

it('requires issuer-specific exceptions for secure or permissive request locks', async () => {
  for (const f of Object.values(await setup())) {
    const from = requester(f)
    const other = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
    const script = other.scripts.other!; script.start()
    issue(f.script, '@tprequest=n,tprequest:' + from.key + '=n')
    issue(script, '@tprequest=n')
    expect(f.receiveTeleportRequest(from).status).toBe('pending')
    issue(f.script, '@permissive=n')
    expect(f.receiveTeleportRequest(from).restrictions).toMatchObject([{ sourcePrim: script.host.key }])
    issue(script, '@tprequest_sec:' + from.key + '=n')
    expect(f.receiveTeleportRequest(from).status).toBe('pending')
    issue(f.script, '@clear')
    issue(script, '@clear,tprequest_sec=n')
    issue(f.script, '@tprequest:' + from.key + '=n')
    expect(f.receiveTeleportRequest(from).status).toBe('blocked')
    issue(script, '@tprequest:' + from.key + '=n')
    expect(f.receiveTeleportRequest(from).status).toBe('pending')
  }
})

it('auto-accepts globally or by requester, with named profile expectations for secure aliases', async () => {
  const secureAcceptance = { rlv: 'pending', rlva: 'accepted' } as const
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = (await setup())[profile]
    const from = requester(f)
    const other = f.world.addAvatar({ username: 'other', region: 'North' })
    issue(f.script, '@accepttprequest:' + from.key + '=n')
    expect(f.receiveTeleportRequest(from)).toMatchObject({ status: 'accepted', automatic: true })
    expect(f.receiveTeleportRequest(other).status).toBe('pending')
    for (const option of ['', ':' + from.key]) {
      issue(f.script, '@clear,accepttprequest_sec' + option + '=n')
      expect(f.receiveTeleportRequest(from).status).toBe(secureAcceptance[profile])
      expect(f.avatar.viewer.commandLog.at(-1)?.status).toBe(profile === 'rlv' ? 'unsupported' : 'applied')
      expect(f.avatar.viewer.restrictions.snapshot().map(rule => rule.support))
        .toEqual(profile === 'rlv' ? ['unsupported'] : ['enforced'])
    }
    issue(f.script, '@clear,accepttprequest=n')
    expect(f.receiveTeleportRequest(other).status).toBe('accepted')
    issue(f.script, '@accepttprequest=y')
    expect(f.receiveTeleportRequest(other).status).toBe('pending')
  }
})

it('keeps request policy separate from travel locks and preserves the pending callback', async () => {
  for (const f of Object.values(await setup())) {
    const from = requester(f)
    f.world.sitAvatarOnGround(f.avatar)
    issue(f.script, '@unsit=n,tplure=n,tplm=n,tploc=n,tplocal:1=n,sittp:1=n,accepttp=n')
    const request = f.receiveTeleportRequest(from)
    expect(request.status).toBe('pending')
    issue(f.script, '@tprequest=n')
    expect(f.respondTeleportRequest(request, 'accept').offer?.status).toBe('pending')
    expect(f.avatar.info & AGENT_SITTING).toBe(AGENT_SITTING)
    expect(f.avatar.region).toBe('RLV fixture')
    expect(f.receiveTeleportRequest(from).status).toBe('blocked')
    issue(f.script, '@clear,accepttprequest=n')
    from.viewer.restrictions.apply(f.script.host, { behaviour: 'tplure', option: '', kind: 'add', parameter: 'n' })
    expect(f.receiveTeleportRequest(from)).toMatchObject({ status: 'accepted', offer: { status: 'blocked' } })
  }
})

it('can complete the request and offer chain using the requester auto-accept policy', async () => {
  for (const f of Object.values(await setup())) {
    const from = requester(f)
    from.viewer.restrictions.apply(f.script.host, { behaviour: 'accepttp', option: '', kind: 'add', parameter: 'n' })
    issue(f.script, '@accepttprequest=n')
    const request = f.receiveTeleportRequest(from)
    expect(request).toMatchObject({ status: 'accepted', automatic: true, offer: { status: 'accepted', automatic: true } })
    expect(from.region).toBe(f.avatar.region)
    expect(from.position).toEqual(f.avatar.position)
  }
})

it('rejects foreign, self, forged, wrong-recipient and consumed requests', async () => {
  const f = (await setup()).rlva
  const from = requester(f)
  const elsewhere = new World(); elsewhere.addRegion('Elsewhere', { x: 0, y: 0 })
  const foreign = elsewhere.addAvatar({ username: 'foreign', region: 'Elsewhere' })
  expect(f.world.requestTeleport(foreign, f.avatar).reason).toBe('avatar')
  expect(f.world.requestTeleport(from, foreign).reason).toBe('avatar')
  expect(f.world.requestTeleport(f.avatar, f.avatar).reason).toBe('avatar')
  const request = f.receiveTeleportRequest(from)
  expect(f.world.respondTeleportRequest(from, request, 'accept').reason).toBe('request')
  expect(f.respondTeleportRequest({ ...request }, 'accept').reason).toBe('request')
  expect(new World().respondTeleportRequest(f.avatar, request, 'accept').reason).toBe('request')
  f.world.avatars.splice(f.world.avatars.indexOf(from), 1)
  expect(f.respondTeleportRequest(request, 'accept').reason).toBe('request')
  f.world.avatars.push(from)
  f.world.avatars.splice(f.world.avatars.indexOf(f.avatar), 1)
  expect(f.respondTeleportRequest(request, 'accept').reason).toBe('request')
  f.world.avatars.push(f.avatar)
  expect(f.respondTeleportRequest(request, 'decline').status).toBe('declined')
  expect(f.respondTeleportRequest(request, 'accept').reason).toBe('request')
})

it('retains invalid forms as unsupported and disabled viewers as manual', async () => {
  for (const [profile, f] of Object.entries(await setup())) {
    const from = requester(f)
    issue(f.script, '@tprequest:invalid=n,accepttprequest:invalid=n')
    expect(f.avatar.viewer.commandLog.slice(-2).map(record => record.status)).toEqual(['unsupported', 'unsupported'])
    expect(f.avatar.viewer.restrictions.snapshot().map(rule => rule.support))
      .toEqual(profile === 'rlv' ? ['unsupported', 'unsupported'] : [])
    expect(f.receiveTeleportRequest(from).status).toBe('pending')
  }
  const world = new World(); world.addRegion('Off', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'off', region: 'Off' })
  const from = world.addAvatar({ username: 'from', region: 'Off' })
  expect(teleportRequestLog(avatar)).toEqual([])
  const request = world.requestTeleport(from, avatar)
  expect(request.status).toBe('pending')
  expect(world.respondTeleportRequest(avatar, request, 'accept').offer?.status).toBe('pending')
})

it('discovers the request family and keeps unsupported Kokua aliases out of metadata', async () => {
  const pair = await loadRlvPair({ source: `list replies; default {
    state_entry() { llListen(287101,"",llGetOwner(),"");
      llOwnerSay("@getcommand:tprequest;add=287101,getcommand:tprequest;force=287101"); }
    listen(integer c, string n, key id, string m) { replies += [m]; }
  }` })
  for (const f of Object.values(pair)) f.script.start()
  expect(pair.rlva.script.global('replies')).toEqual(['accepttprequest;accepttprequest_sec;tprequest;tprequest_sec', ''])
  expect(pair.rlv.script.global('replies')).toEqual([])
  expect(getRlvCommandCoverage('rlv').filter(form => form.behaviour.includes('tprequest')).map(form => form.behaviour))
    .toEqual(['accepttprequest', 'tprequest', 'tprequest_sec'])
})
