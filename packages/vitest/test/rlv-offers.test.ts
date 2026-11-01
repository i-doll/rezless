import { expect, it } from 'vitest'
import { loadRlvPair, seedRlvInventory, makeInventoryItem, InventoryType, PERM_ALL, PERM_COPY, PERM_TRANSFER, World, loadLinkset } from '../src/index.js'
import { respondRlvInventoryOffer as respond } from '../src/index.js'

// Wiki: https://wiki.secondlife.com/wiki/LlGiveInventoryList
// Wiki: https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Shared_Folders
// In-world: shared accept -> renamed under #RLV, then /accepted_in_rlv with
// the final path; decline -> /declined with original name; ordinary accept and
// decline and #RLV/ without tilde -> no notice; duplicates remain distinct.
// Nested shared accept -> parents created, leaf renamed, final path in notice.
// Too-deep accept -> original name under #RLV, no notice. Lowercase #rlv
// prefix -> ordinary inventory, no notice.
// Aditi, SLua Tideland, 2026-11-01, Firestorm RLVa 2.4.2, API 3.4.3.
const source = (name = '#RLV/~Gift', call = 'llGiveInventoryList(llGetOwner(), folder, ["gift"]);') => `
string folder = ${JSON.stringify(name)}; list events;
default {
 state_entry() { llListen(23401,"",llGetOwner(),""); llListen(23402,"",llGetOwner(),"");
  llOwnerSay("@notify:23401;inv_offer=n"); llOwnerSay("@getinv=23402"); ${call} }
 touch_start(integer n) { ${call} }
 listen(integer c,string n,key id,string m) { if (llSubStringIndex(m, "/notify:") == 0) return; events += [(string)c + ":" + m];
  if(c == 23401) llOwnerSay("@getinv=23402"); }
}`
const root = { id: 'root', parentId: null, name: '#RLV', kind: 'folder' as const }
const gift = () => makeInventoryItem({ name: 'gift', type: InventoryType.NOTECARD, notecardLines: ['original'] })
async function pair(name = '#RLV/~Gift', call?: string) {
 const fixtures = await loadRlvPair({ source: source(name, call) })
 for (const f of Object.values(fixtures)) {
  seedRlvInventory(f.avatar, { sharedRootId: 'root', entries: [root] })
  f.script.host.addInventory(gift()); f.script.start()
 }
 return fixtures
}
it('requires an explicit decision and materializes accepted shared content before its listener queries', async () => {
 const fixtures = await pair()
 for (const [profile, f] of Object.entries(fixtures)) {
  expect(f.avatar.viewer.inventory.snapshot()).toEqual([root])
  expect(f.script.global('events')).toEqual(['23402:'])
  const result = respond(f.avatar, f.script.inventoryOffers[0]!, { accept: true, allowSharedRouting: true })
  expect(result.status).toBe('accepted-in-shared')
  const folder = f.avatar.viewer.inventory.snapshot().find(e => e.id === result.folderId)!
  expect(folder).toMatchObject({ name: '~Gift', parentId: 'root', kind: 'folder' })
  const item = f.avatar.viewer.inventory.snapshot().find(e => e.parentId === result.folderId)!
  expect(item).toMatchObject({ name: 'gift', kind: 'item', content: { notecardLines: ['original'] } })
  f.script.advanceTime(0)
  expect(f.script.global('events')).toEqual(['23402:', `23401:/accepted_in_rlv inv_offer ${profile === 'rlv' ? '#RLV/~Gift' : '~Gift'}`, '23402:~Gift'])
 }
})

it('declines once without creating content or allowing a subsequent acceptance', async () => {
 for (const f of Object.values(await pair())) {
  const offer = f.script.inventoryOffers[0]!
  expect(respond(f.avatar, offer, { accept: false, allowSharedRouting: true }).status).toBe('declined')
  expect(respond(f.avatar, offer, { accept: true, allowSharedRouting: true })).toMatchObject({ status: 'refused', reason: 'already-resolved' })
  f.script.advanceTime(0)
  expect(f.avatar.viewer.inventory.snapshot()).toEqual([root])
  expect(f.script.global('events')).toEqual(['23402:', '23401:/declined inv_offer #RLV/~Gift', '23402:'])
 }
})

it('defaults acceptance to ordinary inventory and honors an explicit shared-routing refusal', async () => {
 for (const options of [{ accept: true }, { accept: true, allowSharedRouting: false }]) {
  for (const f of Object.values(await pair())) {
   const result = respond(f.avatar, f.script.inventoryOffers[0]!, options)
   expect(result.status).toBe('accepted-in-inventory')
   expect(f.avatar.viewer.inventory.snapshot().find(e => e.id === result.folderId)).toMatchObject({ name: '#RLV/~Gift', parentId: null })
   f.script.advanceTime(0)
   expect(f.script.global('events')).toEqual(['23402:', '23401:/accepted_in_inv inv_offer #RLV/~Gift', '23402:'])
  }
 }
})

it('keeps the forbid-give setting authoritative even with an explicit shared-routing opt-in', async () => {
 const fixtures = await loadRlvPair({ source: source(), viewer: { inventory: { sharedRootId: 'root', entries: [root], forbidGiveToRlv: true } } })
 for (const f of Object.values(fixtures)) {
  f.script.host.addInventory(gift()); f.script.start()
  expect(respond(f.avatar, f.script.inventoryOffers[0]!, { accept: true, allowSharedRouting: true }).status).toBe('accepted-in-inventory')
  expect(f.avatar.viewer.inventory.snapshot().filter(e => e.parentId === 'root')).toEqual([])
  f.script.advanceTime(0)
  expect(f.script.global('events')).toEqual(['23402:', '23401:/accepted_in_inv inv_offer #RLV/~Gift', '23402:'])
 }
})

for (const name of ['Ordinary', '#RLV/No tilde', '#rlv/~Wrong case']) {
 for (const accept of [true, false]) it(`distinguishes ${name} ${accept ? 'acceptance' : 'decline'} notifications by profile`, async () => {
  for (const [profile, f] of Object.entries(await pair(name))) {
   expect(respond(f.avatar, f.script.inventoryOffers[0]!, { accept, allowSharedRouting: true }).status).toBe(accept ? 'accepted-in-inventory' : 'declined')
   f.script.advanceTime(0)
   expect(f.script.global('events')).toEqual(profile === 'rlv'
    ? ['23402:', `23401:/${accept ? 'accepted_in_inv' : 'declined'} inv_offer ${name}`, '23402:'] : ['23402:'])
  }
 })
}

it('reuses exact case-insensitive parents but creates distinct duplicate leaf folders', async () => {
 for (const f of Object.values(await pair('#RLV/~Parent/Leaf'))) {
  seedRlvInventory(f.avatar, { sharedRootId: 'root', entries: [root,
   { id: 'partial', parentId: 'root', name: '~Parent extended', kind: 'folder' },
   { id: 'parent', parentId: 'root', name: '~PARENT', kind: 'folder' }] })
  const old = f.avatar.viewer.inventory.snapshot()
  const first = respond(f.avatar, f.script.inventoryOffers[0]!, { accept: true, allowSharedRouting: true })
  f.script.linkset.touch(0)
  const second = respond(f.avatar, f.script.inventoryOffers[1]!, { accept: true, allowSharedRouting: true })
  expect(first.folderId).not.toBe(second.folderId)
  expect(f.avatar.viewer.inventory.snapshot().filter(e => e.parentId === 'parent')).toMatchObject([
   { id: first.folderId, name: 'Leaf' }, { id: second.folderId, name: 'Leaf' }])
  expect(old).toHaveLength(3)
  expect(Object.isFrozen(f.avatar.viewer.inventory.snapshot())).toBe(true)
 }
})

it('creates nested parents without wearing or attaching received content', async () => {
 for (const f of Object.values(await pair('#RLV/~Parent/Child/Leaf'))) {
  const result = respond(f.avatar, f.script.inventoryOffers[0]!, { accept: true, allowSharedRouting: true })
  expect(result.status).toBe('accepted-in-shared')
  expect(f.avatar.viewer.inventory.sharedPath(result.folderId!)).toBe('~Parent/Child/Leaf')
  expect(f.avatar.viewer.inventory.wornWearables()).toEqual([])
  expect(f.avatar.viewer.inventory.attachmentMappings()).toEqual([])
 }
})

// Missing shared roots and the forbid-give setting are explicit fixture states.
// RLVa creates a root on accepted prefixed offers; Kokua requires an existing root.
it('retains the missing-root profile difference', async () => {
 for (const [profile, f] of Object.entries(await pair())) {
  seedRlvInventory(f.avatar, { sharedRootId: null, entries: [] })
  const result = respond(f.avatar, f.script.inventoryOffers[0]!, { accept: true, allowSharedRouting: true })
  expect(result.status).toBe(profile === 'rlva' ? 'accepted-in-shared' : 'accepted-in-inventory')
  expect(f.avatar.viewer.inventory.sharedRootId === null).toBe(profile === 'rlv')
  f.script.advanceTime(0)
  expect(f.script.global('events')).toEqual(profile === 'rlv'
   ? ['23402:', '23401:/accepted_in_inv inv_offer #RLV/~Gift', '23402:']
   : ['23402:', '23401:/accepted_in_rlv inv_offer ~Gift', '23402:~Gift'])
 }
})

it('retains the RLVa four-segment maximum and Kokua deeper routing', async () => {
 for (const [profile, f] of Object.entries(await pair('#RLV/~A/B/C/D'))) {
  const result = respond(f.avatar, f.script.inventoryOffers[0]!, { accept: true, allowSharedRouting: true })
  expect(result.status).toBe('accepted-in-shared')
  expect(result).toMatchObject({ routed: profile === 'rlv' })
  expect(f.avatar.viewer.inventory.snapshot().find(e => e.id === result.folderId)).toMatchObject({ name: profile === 'rlv' ? 'D' : '#RLV/~A/B/C/D' })
  f.script.advanceTime(0)
  expect(f.script.global('events')).toEqual(profile === 'rlv'
   ? ['23402:', '23401:/accepted_in_rlv inv_offer #RLV/~A/B/C/D', '23402:~A'] : ['23402:'])
 }
})

it('rejects another avatar, forged offers, and duplicate decisions without mutation', async () => {
 const fixtures = await pair()
 const { avatar, script, world } = fixtures.rlv
 const offer = script.inventoryOffers[0]!
 const other = world.addAvatar({ username: 'other', region: avatar.region, viewer: { profile: 'rlv' } })
 expect(respond(other, offer, { accept: true, allowSharedRouting: true })).toMatchObject({ status: 'refused', reason: 'not-recipient' })
 expect(respond(fixtures.rlva.avatar, offer, { accept: false })).toMatchObject({ status: 'refused', reason: 'not-recipient' })
 expect(respond(avatar, { ...offer }, { accept: true })).toMatchObject({ status: 'refused', reason: 'not-captured' })
 expect(avatar.viewer.inventory.snapshot()).toEqual([root])
 expect(other.viewer.inventory.snapshot()).toEqual([])
 expect(respond(avatar, offer, { accept: true, allowSharedRouting: true }).status).toBe('accepted-in-shared')
 expect(respond(avatar, offer, { accept: false }).status).toBe('refused')
})

it('preserves filtering and delivery-time snapshots through a later acceptance', async () => {
 for (const f of Object.values(await pair('#RLV/~Gift', 'llGiveInventoryList(llGetOwner(), folder, ["gift", "no copy", "missing"]);'))) {
  // The first offer predates this no-copy item, and repeated giving still excludes it.
  f.script.host.addInventory(makeInventoryItem({ name: 'no copy', type: InventoryType.NOTECARD,
   permMask: { base: PERM_ALL, owner: PERM_ALL & ~PERM_COPY, next: PERM_ALL, group: 0, everyone: 0 } }))
  f.script.linkset.touch(0)
  const offer = f.script.inventoryOffers[1]!
  f.script.host.inventory.find(e => e.name === 'gift')!.notecardLines = ['changed giver']
  offer.items[0]!.name = 'changed captured record'
  const result = respond(f.avatar, offer, { accept: true, allowSharedRouting: true })
  const items = f.avatar.viewer.inventory.snapshot().filter(e => e.parentId === result.folderId)
  expect(items).toHaveLength(1)
  expect(items[0]).toMatchObject({ name: 'gift', content: { notecardLines: ['original'] } })
  expect(Object.isFrozen(items[0])).toBe(true)
  expect(Object.isFrozen(Reflect.get(items[0]!, 'content'))).toBe(true)
 }
})

it('keeps disabled viewers inert and unsupported give forms inspectable', async () => {
 for (const profile of ['disabled', 'rlva'] as const) {
  const world = new World(); world.addRegion('test', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'recipient', region: 'test', viewer: { profile } })
  const loaded = await loadLinkset({ world, region: 'test', owner: avatar.key, prims: [{ scripts: [{ name: 'give', source: { source: source('#RLV/~Gift', profile === 'disabled'
   ? 'llGiveInventoryList(llGetOwner(), folder, ["gift"]);' : 'llGiveInventory(llGetOwner(), "gift");') } }] }] })
  const script = loaded.scripts.give!; script.host.addInventory(gift()); script.start()
  expect(respond(avatar, script.inventoryOffers[0]!, { accept: true, allowSharedRouting: true })).toMatchObject({ status: 'unsupported', reason: profile === 'disabled' ? 'disabled' : 'offer-kind' })
  expect(avatar.viewer.inventory.snapshot()).toEqual([])
 }
})

it('delivers third-party offers only to the recipient and retains transfer permissions', async () => {
 for (const profile of ['rlv', 'rlva'] as const) {
  const world = new World(); world.addRegion('test', { x: 0, y: 0 })
  const recipient = world.addAvatar({ username: 'recipient', region: 'test', viewer: { profile } })
  const giver = world.addAvatar({ username: 'giver', region: 'test', viewer: { profile } })
  seedRlvInventory(recipient, { sharedRootId: 'root', entries: [root] })
  const listener = await loadLinkset({ world, region: 'test', owner: recipient.key, prims: [{ scripts: [{ name: 'listen', source: { source: `list notices; default {
   state_entry() { llListen(23401,"",llGetOwner(),""); llOwnerSay("@notify:23401;accepted_in=n"); }
   listen(integer c,string n,key id,string m) { if (llSubStringIndex(m, "/notify:") == 0) return; notices += [(string)id, m]; }
  }` } }] }] })
  listener.scripts.listen!.start()
  const loaded = await loadLinkset({ world, region: 'test', owner: giver.key, prims: [{ scripts: [{ name: 'give', source: { source: `default { state_entry() { llGiveInventoryList("${recipient.key}","#RLV/~Gift",["gift","private"]); } }` } }] }] })
  const script = loaded.scripts.give!
  script.host.addInventory(makeInventoryItem({ name: 'gift', type: InventoryType.NOTECARD, permMask: { base: PERM_ALL, owner: PERM_ALL, next: PERM_TRANSFER, group: 0, everyone: 0 } }))
  script.host.addInventory(makeInventoryItem({ name: 'private', type: InventoryType.NOTECARD, permMask: { base: PERM_ALL, owner: PERM_ALL & ~PERM_TRANSFER, next: PERM_ALL, group: 0, everyone: 0 } }))
  script.start()
  const result = respond(recipient, script.inventoryOffers[0]!, { accept: true, allowSharedRouting: true })
  script.advanceTime(0)
  expect(listener.scripts.listen!.global('notices')).toEqual([recipient.key, `/accepted_in_rlv inv_offer ${profile === 'rlv' ? '#RLV/~Gift' : '~Gift'}`])
  expect(recipient.viewer.inventory.snapshot().filter(e => e.parentId === result.folderId)).toMatchObject([
   { name: 'gift', content: { permMask: { owner: PERM_TRANSFER, base: PERM_TRANSFER } } }])
  expect(giver.viewer.inventory.snapshot()).toEqual([])
 }
})

it('uses existing notification channel, substring and truncation policies for offers', async () => {
 const name = '#RLV/~' + 'G'.repeat(1200)
 const fixtures = await loadRlvPair({ source: `list notices; default {
  state_entry() { llListen(23401,"",llGetOwner(),""); llListen(-23401,"",llGetOwner(),""); llListen(23402,"",llGetOwner(),"");
   llOwnerSay("@notify:23401;accepted_in=n,notify:-23401;accepted_in=n,notify:23402;declined=n");
   llGiveInventoryList(llGetOwner(), ${JSON.stringify(name)}, ["gift"]); }
  listen(integer c,string n,key id,string m) { if (llSubStringIndex(m, "/notify:") == 0) return; notices += [(string)c + ":" + m]; }
 }` })
 for (const [profile, f] of Object.entries(fixtures)) {
  f.script.host.addInventory(gift()); f.script.start()
  respond(f.avatar, f.script.inventoryOffers[0]!, { accept: true })
  f.script.advanceTime(0)
  const notice = '/accepted_in_inv inv_offer ' + name
  expect(f.script.global('notices')).toEqual(profile === 'rlv'
   ? ['23401:' + notice.slice(0, 1023), '-23401:' + notice.slice(0, 254)]
   : ['23401:' + notice.slice(0, 1023)])
 }
})

it('keeps accepted content after viewer reset and giver removal', async () => {
 const fixtures = await pair()
 for (const f of Object.values(fixtures)) {
  const offer = f.script.inventoryOffers[0]!
  f.script.linkset.dead = true
  const result = respond(f.avatar, offer, { accept: true, allowSharedRouting: true })
  expect(result.status).toBe('accepted-in-shared')
  const entries = f.avatar.viewer.inventory.snapshot()
  f.avatar.viewer.session.reset()
  expect(f.avatar.viewer.inventory.snapshot()).toBe(entries)
 }
})

it('refuses a recipient removed from the delivery world', async () => {
 const f = (await pair()).rlva
 f.world.avatars.splice(f.world.avatars.indexOf(f.avatar), 1)
 expect(respond(f.avatar, f.script.inventoryOffers[0]!, { accept: true })).toMatchObject({ status: 'refused', reason: 'not-recipient' })
 expect(f.avatar.viewer.inventory.snapshot()).toEqual([root])
})

it('appends folders without accepting invalid parents or colliding with seeded IDs', async () => {
 const { RlvInventory } = await import('@rezless/vm')
 const first = new RlvInventory()
 first.receiveFolder('Existing', null)
 const seeded = new RlvInventory({ sharedRootId: null, entries: first.snapshot() })
 expect(() => seeded.receiveFolder('Bad', 'missing')).toThrow('parent')
 const newId = seeded.receiveFolder('New', null)
 expect(newId).not.toBe(first.snapshot()[0]!.id)
 expect(seeded.snapshot().map(e => e.name)).toEqual(['Existing', 'New'])
})
