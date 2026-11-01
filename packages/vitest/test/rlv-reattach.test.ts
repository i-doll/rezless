import { describe, expect, it } from 'vitest'
import { setRlvAttachmentBridge } from '@rezless/vm'
import { loadLinkset, loadRlvPair, seedRlvInventory, resetRlvViewerSession } from '../src/index.js'

// In-world: locked simulator detach -> attach(NULL_KEY) at 0, then on_rez
// and attach(owner) at the original point (Aditi, SLua Tideland, 2026-11-01,
// Firestorm RLVa 2.4.2).
// Profiles: Kokua RLV 2.09.35.00 and Firestorm RLVa 2.4.2.
const source = `list events; list replies; default {
 state_entry() { llListen(784284,"",NULL_KEY,""); }
 touch_start(integer n) { llOwnerSay(llGetObjectDesc()); }
 on_rez(integer p) { events += ["rez",llGetAttached()]; }
 attach(key id) { events += [(string)id,llGetAttached()]; }
 listen(integer c,string n,key id,string m) { replies += [m]; }
}`
const nil = '00000000-0000-0000-0000-000000000000'
async function fixtures(lock = '@detach=n') {
 const pair = await loadRlvPair({ source })
 for (const fixture of Object.values(pair)) {
  const { script, avatar } = fixture
  seedRlvInventory(avatar, { sharedRootId: null, entries: [
   { id: 'item', parentId: null, kind: 'item', name: 'Recovery (skull)', assetType: 'object' },
  ], wornAttachments: [{ itemId: 'item', rootKey: script.host.key }] })
  script.start()
  script.linkset.attachToAvatar(avatar.key, 5)
  script.advanceTime(0)
  send(script, lock)
 }
 return pair
}
function send(script: Awaited<ReturnType<typeof loadRlvPair>>['rlv']['script'], command: string) {
 script.host.description = command
 script.fire('touch_start', { num_detected: 1 })
}

for (const lock of ['@detach=n', '@detach:left hand=n', '@remattach=n', '@remattach:left hand=n']) {
 it(`${lock}: restores the original point with rez and attach events`, async () => {
  const pair = await fixtures(lock)
  for (const [profile, { script, avatar }] of Object.entries(pair)) {
   script.linkset.detachFromAvatar()
   script.advanceTime(0)
   expect(script.linkset.attachment).toBeNull()
   expect(script.global('events')).toEqual([avatar.key, 5, nil, 0])
   script.advanceTime(profile === 'rlv' ? 14999 : 19999)
   expect(script.linkset.attachment).toBeNull()
   script.advanceTime(1)
   expect(script.linkset.attachment?.point).toBe(5)
   expect(script.global('events')).toEqual([avatar.key, 5, nil, 0, 'rez', 5, avatar.key, 5])
   expect(avatar.viewer.inventory.attachmentObject('item')).toBe(script.linkset)
  }
 })
}

it('retains Kokua self locks during recovery but clears RLVa self locks', async () => {
 const pair = await fixtures()
 for (const [profile, { script, avatar }] of Object.entries(pair)) {
  script.linkset.detachFromAvatar()
  script.advanceTime(20000)
  expect(avatar.viewer.restrictions.snapshot().map(rule => rule.rule)).toEqual(profile === 'rlv' ? ['detach'] : [])
  expect(script.linkset.attachment?.point).toBe(5)
 }
})

it('bypasses add locks and replaces occupants only in Kokua', async () => {
 const pair = await fixtures()
 for (const [profile, { script, avatar, world }] of Object.entries(pair)) {
  const other = await loadLinkset({ world, owner: avatar.key, region: avatar.region,
   prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
  other.scripts.other!.start()
  send(other.scripts.other!, '@addattach:left hand=n,remattach:left hand=n')
  other.linkset.attachToAvatar(avatar.key, 5)
  script.linkset.detachFromAvatar()
  script.advanceTime(20000)
  expect(script.linkset.attachment?.point).toBe(5)
  expect(other.linkset.attachment?.point ?? 0).toBe(profile === 'rlv' ? 0 : 5)
 }
})

it('responds to an inventory save only in RLVa, with subscribed recovery notifications', async () => {
 const pair = await fixtures()
 for (const [profile, { script, avatar, world }] of Object.entries(pair)) {
  const watcher = await loadLinkset({ world, owner: avatar.key, region: avatar.region,
   prims: [{ scripts: [{ name: 'watch', source: { source } }] }] })
  const watch = watcher.scripts.watch!
  watch.start()
  send(watch, '@notify:784284;ed =n')
  script.linkset.detachFromAvatar()
  script.advanceTime(0)
  avatar.viewer.session.savedAttachment('item')
  script.advanceTime(0)
  expect(script.linkset.attachment?.point ?? 0).toBe(profile === 'rlva' ? 5 : 0)
  script.advanceTime(15000)
  expect((watch.global('replies') as string[]).slice(-2)).toEqual(['/detached illegally Left Hand', '/reattached legally Left Hand'])
 }
})

it('queues Kokua commands until recovery and lets version queries bypass the queue', async () => {
 const pair = await fixtures()
 for (const [profile, { script, avatar, world }] of Object.entries(pair)) {
  const other = await loadLinkset({ world, owner: avatar.key, region: avatar.region,
   prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
  other.scripts.other!.start()
  script.linkset.detachFromAvatar()
  send(other.scripts.other!, '@sendchat=n,versionnum=784284')
  expect(avatar.viewer.session.pendingCommands).toBe(profile === 'rlv' ? 1 : 0)
  script.advanceTime(20000)
  expect(avatar.viewer.session.pendingCommands).toBe(0)
  expect(avatar.viewer.restrictions.snapshot().some(rule => rule.rule === 'sendchat')).toBe(true)
 }
})

it('only queues one Kokua item per point, while RLVa recovers both', async () => {
 const pair = await fixtures('@detach=n')
 for (const [profile, { script, avatar, world }] of Object.entries(pair)) {
  const watcher = await loadLinkset({ world, owner: avatar.key, region: avatar.region,
   prims: [{ scripts: [{ name: 'watch', source: { source } }] }] })
  watcher.scripts.watch!.start()
  send(watcher.scripts.watch!, '@remattach:left hand=n')
  const second = await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [{}] })
  const inventory = avatar.viewer.inventory
  seedRlvInventory(avatar, { sharedRootId: null, entries: [...inventory.snapshot(),
   { id: 'second', parentId: null, kind: 'item', name: 'Second', assetType: 'object' },
  ], wornAttachments: [...inventory.attachmentMappings(), { itemId: 'second', rootKey: second.linkset.prims[0]!.key }] })
  second.linkset.attachToAvatar(avatar.key, 5)
  script.linkset.detachFromAvatar()
  second.linkset.detachFromAvatar()
  script.advanceTime(20000)
  expect(script.linkset.attachment?.point).toBe(5)
  expect(second.linkset.attachment?.point ?? 0).toBe(profile === 'rlv' ? 0 : 5)
 }
})

for (const kind of ['unlocked', 'unmapped', 'temporary', 'reset', 'avatar removed'] as const) {
 it(`does not recover ${kind} attachments`, async () => {
  const pair = await fixtures(kind === 'unlocked' ? '@addattach:left hand=n' : '@detach=n')
  for (const { script, avatar, world } of Object.values(pair)) {
   if (kind === 'unmapped') seedRlvInventory(avatar, { sharedRootId: null, entries: [] })
   if (kind === 'temporary') script.linkset.attachment = { ...script.linkset.attachment!, temporary: true }
   script.linkset.detachFromAvatar()
   if (kind === 'reset') resetRlvViewerSession(avatar)
   if (kind === 'avatar removed') world.avatars.splice(world.avatars.indexOf(avatar), 1)
   script.advanceTime(60000)
   expect(script.linkset.attachment).toBeNull()
  }
 })
}

describe('recovery inventory changes', () => {
 it('cancels RLVa recovery when the item is removed', async () => {
  const { rlva: { script, avatar } } = await fixtures()
  script.linkset.detachFromAvatar()
  seedRlvInventory(avatar, { sharedRootId: null, entries: [] })
  script.advanceTime(60000)
  expect(script.linkset.attachment).toBeNull()
 })
})

it('retries failed inventory restoration on each viewer schedule', async () => {
 const pair = await fixtures()
 for (const [profile, { script, avatar, world }] of Object.entries(pair)) {
  script.linkset.detachFromAvatar()
  script.linkset.remove()
  // The retained live object was destroyed and there is no saved definition yet.
  if (profile === 'rlva') avatar.viewer.session.savedAttachment('item')
  script.advanceTime(profile === 'rlv' ? 15000 : 20000)
  const definition = await loadLinkset({ prims: [{ scripts: [{ name: 'events', source: { source } }] }] })
  seedRlvInventory(avatar, { sharedRootId: null, entries: [
   { id: 'item', parentId: null, kind: 'item', name: 'Recovery', assetType: 'object', object: definition.linkset },
  ] })
  script.advanceTime(profile === 'rlv' ? 45999 : 39999)
  expect(world.linksets.filter(object => object.attachment)).toHaveLength(0)
  script.advanceTime(1)
  expect(world.linksets.filter(object => object.attachment).map(object => object.attachment!.point)).toEqual([5])
 }
})

it('recovers different Kokua points in queue order after resetting the shared delay', async () => {
 const { rlv: { script, avatar, world } } = await fixtures()
 const second = await loadLinkset({ world, owner: avatar.key, region: avatar.region,
  prims: [{ scripts: [{ name: 'second', source: { source } }] }] })
 const inventory = avatar.viewer.inventory
 seedRlvInventory(avatar, { sharedRootId: null, entries: [...inventory.snapshot(),
  { id: 'second', parentId: null, kind: 'item', name: 'Second', assetType: 'object' },
 ], wornAttachments: [...inventory.attachmentMappings(), { itemId: 'second', rootKey: second.linkset.prims[0]!.key }] })
 second.linkset.attachToAvatar(avatar.key, 6)
 second.scripts.second!.start()
 send(second.scripts.second!, '@detach=n')
 script.linkset.detachFromAvatar()
 script.advanceTime(5000)
 second.linkset.detachFromAvatar()
 script.advanceTime(14999)
 expect(script.linkset.attachment).toBeNull()
 script.advanceTime(1)
 expect(script.linkset.attachment?.point).toBe(5)
 expect(second.linkset.attachment?.point).toBe(6)
})

it('keeps the recovery queue through readiness changes and releases it after recovery', async () => {
 const { rlv: { script, avatar, world } } = await fixtures()
 const other = await loadLinkset({ world, owner: avatar.key, region: avatar.region,
  prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
 other.scripts.other!.start()
 script.linkset.detachFromAvatar()
 avatar.viewer.session.setReady(false)
 send(other.scripts.other!, '@sendchat=n')
 avatar.viewer.session.setReady(true)
 expect(avatar.viewer.session.pendingCommands).toBe(1)
 script.advanceTime(15000)
 expect(avatar.viewer.session.pendingCommands).toBe(0)
 expect(avatar.viewer.restrictions.snapshot().map(rule => rule.rule)).toEqual(['detach', 'sendchat'])
})

it('lets new Kokua commands through after a recovery timeout, retaining earlier commands', async () => {
 const { rlv: { script, avatar, world } } = await fixtures()
 const other = await loadLinkset({ world, owner: avatar.key, region: avatar.region,
  prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
 other.scripts.other!.start()
 script.linkset.detachFromAvatar()
 script.linkset.remove()
 send(other.scripts.other!, '@sendchat=n')
 script.advanceTime(61000)
 send(other.scripts.other!, '@tploc=n')
 expect(avatar.viewer.session.pendingCommands).toBe(1)
 expect(avatar.viewer.restrictions.snapshot().map(rule => rule.rule)).toEqual(['detach', 'tploc'])
})

it('recovers a permitted LSL simulator detach through a child-issued lock', async () => {
 const pair = await loadRlvPair({ source })
 for (const { world, avatar, script } of Object.values(pair)) {
  const loaded = await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [
   { scripts: [{ name: 'root', source: { source: `list events; default {
    state_entry() { llRequestPermissions(llGetOwner(),PERMISSION_ATTACH); }
    touch_start(integer n) { llDetachFromAvatar(); }
    on_rez(integer p) { events += ["rez",llGetAttached()]; }
    attach(key id) { events += [(string)id,llGetAttached()]; }
   }` } }] },
   { scripts: [{ name: 'child', source: { source: 'default { state_entry() { llOwnerSay("@detach=n"); } }' } }] },
  ] })
  seedRlvInventory(avatar, { sharedRootId: null, entries: [
   { id: 'child-locked', parentId: null, kind: 'item', name: 'Child locked', assetType: 'object' },
  ], wornAttachments: [{ itemId: 'child-locked', rootKey: loaded.linkset.prims[0]!.key }] })
  loaded.linkset.attachToAvatar(avatar.key, 1)
  loaded.scripts.root!.start()
  loaded.scripts.child!.start()
  loaded.scripts.root!.grantPermissions()
  loaded.scripts.root!.fire('touch_start', { num_detected: 1 })
  expect(loaded.linkset.attachment).toBeNull()
  script.advanceTime(20000)
  expect(loaded.linkset.attachment?.point).toBe(1)
  expect(loaded.scripts.root!.global('events')).toEqual([avatar.key, 1, nil, 0, 'rez', 1, avatar.key, 1])
 }
})

it('exempts the registered RLVa bridge from recovery', async () => {
 const { rlva: { avatar, script } } = await fixtures()
 script.linkset.detachFromAvatar()
 resetRlvViewerSession(avatar)
 script.linkset.attachToAvatar(avatar.key, 31)
 avatar.viewer.session.setReady(true)
 send(script, '@detach=n')
 setRlvAttachmentBridge(avatar.viewer, script.host.key)
 script.linkset.detachFromAvatar()
 script.advanceTime(60000)
 expect(script.linkset.attachment).toBeNull()
})

it('coalesces saved replies after successful recovery and ignores unrelated acknowledgements', async () => {
 const { rlva: { avatar, script } } = await fixtures()
 avatar.viewer.session.savedAttachment('missing')
 script.linkset.detachFromAvatar()
 script.advanceTime(0)
 avatar.viewer.session.savedAttachment('item')
 avatar.viewer.session.savedAttachment('item')
 script.advanceTime(0)
 avatar.viewer.session.savedAttachment('item')
 script.advanceTime(60000)
 expect(script.global('events')).toEqual([avatar.key, 5, nil, 0, 'rez', 5, avatar.key, 5])
})

it('restarts Kokua timeout rather than issuing a second in-flight recovery', async () => {
 const { rlv: { script, avatar, world } } = await fixtures()
 const other = await loadLinkset({ world, owner: avatar.key, region: avatar.region,
  prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
 other.scripts.other!.start()
 const second = await loadLinkset({ world, owner: avatar.key, region: avatar.region,
  prims: [{ scripts: [{ name: 'second', source: { source } }] }] })
 const inventory = avatar.viewer.inventory
 seedRlvInventory(avatar, { sharedRootId: null, entries: [...inventory.snapshot(),
  { id: 'second', parentId: null, kind: 'item', name: 'Second', assetType: 'object' },
 ], wornAttachments: [...inventory.attachmentMappings(), { itemId: 'second', rootKey: second.linkset.prims[0]!.key }] })
 second.linkset.attachToAvatar(avatar.key, 6)
 second.scripts.second!.start()
 send(second.scripts.second!, '@detach=n')
 script.linkset.detachFromAvatar()
 script.linkset.remove()
 script.advanceTime(15000)
 second.linkset.detachFromAvatar()
 script.advanceTime(15000)
 send(other.scripts.other!, '@sendchat=n')
 expect(avatar.viewer.session.pendingCommands).toBe(1)
 script.advanceTime(45999)
 send(other.scripts.other!, '@tploc=n')
 expect(avatar.viewer.session.pendingCommands).toBe(2)
 script.advanceTime(1)
 send(other.scripts.other!, '@tplm=n')
 expect(avatar.viewer.session.pendingCommands).toBe(2)
 expect(avatar.viewer.restrictions.snapshot().some(rule => rule.rule === 'tplm')).toBe(true)
})

it('retains Kokua recovery when its inventory item disappears', async () => {
 const { rlv: { script, avatar, world } } = await fixtures()
 const other = await loadLinkset({ world, owner: avatar.key, region: avatar.region,
  prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
 other.scripts.other!.start()
 script.linkset.detachFromAvatar()
 seedRlvInventory(avatar, { sharedRootId: null, entries: [] })
 script.advanceTime(15000)
 expect(script.linkset.attachment).toBeNull()
 send(other.scripts.other!, '@sendchat=n')
 expect(avatar.viewer.session.pendingCommands).toBe(1)
})
