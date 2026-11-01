import { describe, expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, seedRlvInventory, attemptViewerAttach, setRlvAttachmentBridge, RLV_ATTACHMENT_POINTS } from '../src/index.js'

// Kokua RLV 2.09.35.00: RRInterface::canAttachWithExplanation,
// canDetachWithExplanation, forceDetach, forceDetachByUuid and force.
// Firestorm RLVa 2.4.2: RlvBehaviourAddRemAttachHandler::onCommand,
// RlvBehaviourHandler<RLV_BHVR_DETACH>::onCommand, RlvForceRemAttachHandler::onCommand,
// RlvAttachmentLocks::canAttach and RlvHandler::onGetAttachNames.
const source = `list replies; integer during; default {
 state_entry() { llListen(277123,"",NULL_KEY,""); }
 touch_start(integer n) { llOwnerSay(llGetObjectDesc()); during = llGetAttached(); }
 listen(integer c,string n,key id,string m) { replies += [m]; }
}`
type Fixture = Awaited<ReturnType<typeof loadRlvPair>>['rlv']
function send(f: Fixture, command: string) {
 f.script.host.description = command; f.script.fire('touch_start', { num_detected: 1 })
}
async function attachment(f: Fixture, point = 1, name = 'Item') {
 const loaded = await loadLinkset({ world: f.world, owner: f.avatar.key, region: f.avatar.region,
  prims: [{ name }, { name: 'Child' }] })
 loaded.linkset.attachToAvatar(f.avatar.key, point)
 return loaded.linkset
}

for (const behaviour of ['detach', 'remattach', 'addattach']) describe(`${behaviour} point locks`, () => {
 it('constrains explicit user wear/removal and force wear/removal by profile', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
   const f = pair[profile]; f.script.start()
   const old = await attachment(f)
   const incoming = await loadLinkset({ world: f.world, owner: f.avatar.key, region: f.avatar.region, prims: [{}] })
   send(f, `@${behaviour}:chest=n`)
   const removeLocked = behaviour !== 'addattach'
   const addLocked = behaviour === 'addattach' || behaviour === 'detach' && profile === 'rlva'
   expect(f.attemptDetach(old)).toBe(removeLocked ? 'blocked' : 'allowed')
   old.attachToAvatar(f.avatar.key, 1)
   expect(attemptViewerAttach(f.avatar, incoming.linkset, 1)).toBe(addLocked ? 'blocked' : 'allowed')
   send(f, '@detach:chest=force')
   expect(old.attachment?.point ?? 0).toBe(removeLocked ? 1 : 0)
   seedRlvInventory(f.avatar, { sharedRootId: 'root', entries: [
    { id: 'root', parentId: null, kind: 'folder', name: '#RLV' },
    { id: 'folder', parentId: 'root', kind: 'folder', name: 'Wear' },
    { id: 'item', parentId: 'folder', kind: 'item', name: 'New (chest)', assetType: 'object', object: incoming.linkset },
   ] })
   incoming.linkset.detachFromAvatar()
   send(f, '@attachover:wear=force')
   expect(f.world.linksets.filter(l => l.attachment?.point === 1)).toHaveLength((removeLocked ? 1 : 0) + (addLocked ? 0 : 1))
   send(f, `@${behaviour}:chest=y`)
   expect(f.avatar.viewer.restrictions.snapshot()).toEqual([])
   expect(f.attemptDetach(old)).toBe(removeLocked ? 'allowed' : 'no-op')
  }
 })
})

it('keeps independent issuers, root aliases, global locks and invalid options distinct', async () => {
 const pair = await loadRlvPair({ source })
 for (const f of Object.values(pair)) {
  f.script.start()
  const other = await loadLinkset({ world: f.world, owner: f.avatar.key, region: f.avatar.region,
   prims: [{ scripts: [{ name: 'lock', source: { source: 'default { state_entry() { llOwnerSay("@remattach:root=n"); } }' } }] }] })
  other.scripts.lock!.start()
  const target = await attachment(f, 40)
  send(f, '@remattach:avatar center=n,remattach:avatar center=y')
  expect(f.attemptDetach(target)).toBe('blocked')
  send(f, '@clear')
  expect(f.attemptDetach(target)).toBe('blocked')
  send(f, '@addattach=n')
  const incoming = await loadLinkset({ world: f.world, owner: f.avatar.key, region: f.avatar.region, prims: [{}] })
  expect(attemptViewerAttach(f.avatar, incoming.linkset, 5)).toBe('blocked')
  send(f, '@addattach=y,remattach=n')
  const hand = await attachment(f, 5)
  expect(f.attemptDetach(hand)).toBe('blocked')
  send(f, '@remattach=y,addattach:invalid=n,remattach: chest=n')
  expect(f.attemptDetach(hand)).toBe('allowed')
  expect(f.avatar.viewer.commandLog.slice(-2).map(r => r.status)).toEqual(['unsupported', 'unsupported'])
 }
})

for (const option of ['', 'chest', 'UUID', 'CHILD']) it(`force removal selects ${option || 'all points'} and preserves other points`, async () => {
 const pair = await loadRlvPair({ source })
 for (const f of Object.values(pair)) {
  f.script.start()
  const a = await attachment(f); const b = await attachment(f); const hand = await attachment(f, 5)
  const value = option === 'UUID' ? a.prims[0]!.key : option === 'CHILD' ? a.prims[1]!.key : option
  send(f, '@detach' + (value ? ':' + value : '') + '=force')
  const unsupportedChild = option === 'CHILD' && f.avatar.viewer.profile === 'rlva'
  expect(a.attachment?.point ?? 0).toBe(unsupportedChild ? 1 : 0)
  expect(b.attachment?.point ?? 0).toBe(option === 'UUID' || option === 'CHILD' ? 1 : 0)
  expect(hand.attachment?.point ?? 0).toBe(option ? 5 : 0)
  expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ status: unsupportedChild ? 'unsupported' : 'enforced', outcome: unsupportedChild ? 'unsupported-form' : 'allowed' })
 }
})

it('honors point locks, local locks, nostrip and bridge protection during force selection', async () => {
 const pair = await loadRlvPair({ source })
 for (const f of Object.values(pair)) {
  f.script.start()
  const target = await attachment(f)
  send(f, '@remattach:chest=n,detach:' + target.prims[0]!.key + '=force')
  expect(target.attachment?.point).toBe(1)
  send(f, '@remattach:chest=y')
  seedRlvInventory(f.avatar, { sharedRootId: null, entries: [{ id: 'protected', parentId: null, kind: 'item', name: 'nostrip item', assetType: 'object' }],
   wornAttachments: [{ itemId: 'protected', rootKey: target.prims[0]!.key }] })
  send(f, '@detach:chest=force')
  expect(target.attachment?.point).toBe(1)
  const bridge = await attachment(f, 31)
  setRlvAttachmentBridge(f.avatar.viewer, bridge.prims[0]!.key)
  send(f, '@detach:Center 2=force')
  expect(bridge.attachment?.point ?? 0).toBe(f.avatar.viewer.profile === 'rlva' ? 31 : 0)
  send(f, '@detach:11111111-2222-3333-4444-555555555555=force')
  expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ outcome: 'no-op' })
 }
})

it('returns RLVa available point names and leaves both queries unsupported in Kokua', async () => {
 const pair = await loadRlvPair({ source })
 for (const profile of ['rlv', 'rlva'] as const) {
  const f = pair[profile]; f.script.start()
  await attachment(f); await attachment(f); await attachment(f, 5); await attachment(f, 47)
  send(f, '@addattach:chest=n,remattach:left hand=n,getaddattachnames:torso=277123,getremattachnames=277123,getremattachnames:hud=277123,getaddattachnames:invalid=277123')
  expect(f.script.global('replies')).toEqual(profile === 'rlva' ? [
   RLV_ATTACHMENT_POINTS.filter(p => p.group === 6 && p.id !== 1).map(p => p.name).join(','),
   'Chest,Jaw', 'Jaw', RLV_ATTACHMENT_POINTS.filter(p => p.id !== 1).map(p => p.name).join(','),
  ] : [])
  send(f, '@addattach=n,remattach=n,getaddattachnames=277123,getremattachnames=277123')
  if (profile === 'rlva') expect((f.script.global('replies') as string[]).slice(-2)).toEqual(['', ''])
  else expect(f.avatar.viewer.commandLog.slice(-2).map(r => r.status)).toEqual(['unsupported', 'unsupported'])
 }
})

it('blocks replacements at remove-locked points while allowing add, then replaces after unlock', async () => {
 for (const f of Object.values(await loadRlvPair({ source }))) {
  f.script.start(); const old = await attachment(f)
  const incoming = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key, prims: [{}] })
  send(f, '@remattach:chest=n')
  expect(attemptViewerAttach(f.avatar, incoming.linkset, 1, true)).toBe('blocked')
  expect(attemptViewerAttach(f.avatar, incoming.linkset, 1)).toBe('allowed')
  incoming.linkset.detachFromAvatar()
  send(f, '@remattach:chest=y')
  expect(attemptViewerAttach(f.avatar, incoming.linkset, 1, true)).toBe('allowed')
  expect(old.attachment).toBeNull()
  expect(incoming.linkset.attachment?.point).toBe(1)
 }
})

it('honors point locks in direct folder removal and at remembered unnamed wear points', async () => {
 for (const f of Object.values(await loadRlvPair({ source }))) {
  f.script.start(); const old = await attachment(f)
  seedRlvInventory(f.avatar, { sharedRootId: 'root', entries: [
   { id: 'root', parentId: null, name: '#RLV', kind: 'folder' },
   { id: 'folder', parentId: 'root', name: 'Direct', kind: 'folder' },
   { id: 'item', parentId: 'folder', name: 'Plain', kind: 'item', assetType: 'object' },
  ], wornAttachments: [{ itemId: 'item', rootKey: old.prims[0]!.key }] })
  send(f, '@remattach:chest=n,detach:direct=force')
  expect(old.attachment?.point).toBe(1)
  expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ outcome: 'blocked' })
  send(f, '@remattach:chest=y,remattach:direct=force')
  expect(old.attachment).toBeNull()
  send(f, '@addattach:chest=n,attachover:direct=force')
  expect(old.attachment).toBeNull()
  expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ outcome: 'blocked',
   wearResults: [{ itemId: 'item', point: 1, outcome: 'blocked', reason: 'addattach-lock' }] })
  send(f, '@addattach:chest=y,attachover:direct=force')
  expect(old.attachment?.point).toBe(1)
 }
})

it('evaluates force locks in command order and reports partial removal asynchronously', async () => {
 for (const f of Object.values(await loadRlvPair({ source }))) {
  f.script.start(); f.script.linkset.attachToAvatar(f.avatar.key, 5)
  const chest = await attachment(f)
  send(f, '@remattach:chest=n,detach=force,remattach:chest=y')
  expect(f.script.global('during')).toBe(5)
  expect(f.script.linkset.attachment).toBeNull()
  expect(chest.attachment?.point).toBe(1)
  expect(f.avatar.viewer.commandLog.find(r => r.command === '@detach=force')).toMatchObject({ outcome: 'partial' })
 }
})

it('does not offer protected occupants in removal names and retains a point with another removable occupant', async () => {
 const f = (await loadRlvPair({ source })).rlva; f.script.start()
 const protectedItem = await attachment(f)
 seedRlvInventory(f.avatar, { sharedRootId: null, entries: [
  { id: 'nostrip', parentId: null, kind: 'item', name: 'nostrip', assetType: 'object' },
 ], wornAttachments: [{ itemId: 'nostrip', rootKey: protectedItem.prims[0]!.key }] })
 const bridge = await attachment(f, 31)
 setRlvAttachmentBridge(f.avatar.viewer, bridge.prims[0]!.key)
 send(f, '@getremattachnames=277123')
 expect(f.script.global('replies')).toEqual([''])
 await attachment(f)
 send(f, '@getremattachnames=277123')
 expect(f.script.global('replies')).toEqual(['', 'Chest'])
})

it('rejects invalid user wear targets without changing state and leaves disabled viewers unrestricted', async () => {
 const f = (await loadRlvPair({ source })).rlv; f.script.start()
 const target = await loadLinkset({ world: f.world, owner: f.avatar.key, region: f.avatar.region, prims: [{}] })
 for (const point of [0, -1, 56, 1.5, NaN]) expect(attemptViewerAttach(f.avatar, target.linkset, point)).toBe('no-op')
 const foreign = f.world.addAvatar({ username: 'foreign', region: f.avatar.region })
 expect(attemptViewerAttach(foreign, target.linkset, 1)).toBe('no-op')
 const other = await loadLinkset({ world: f.world, owner: foreign.key, region: foreign.region, prims: [{}] })
 expect(attemptViewerAttach(foreign, other.linkset, 1)).toBe('allowed')
 expect(attemptViewerAttach(foreign, other.linkset, 1)).toBe('no-op')
 expect(target.linkset.attachment).toBeNull()
})

it('checks the saved point of copied inventory definitions before wearing unnamed attachments', async () => {
 for (const f of Object.values(await loadRlvPair({ source }))) {
  f.script.start(); const definition = await loadLinkset({ prims: [{}] })
  definition.linkset.attachToAvatar(f.avatar.key, 1); definition.linkset.detachFromAvatar()
  seedRlvInventory(f.avatar, { sharedRootId: 'root', entries: [
   { id: 'root', parentId: null, kind: 'folder', name: '#RLV' },
   { id: 'folder', parentId: 'root', kind: 'folder', name: 'Direct' },
   { id: 'item', parentId: 'folder', kind: 'item', name: 'Unnamed', assetType: 'object', object: definition.linkset.copy() },
  ] })
  send(f, '@addattach:chest=n,attachover:direct=force')
  expect(f.world.linksets.filter(l => l.attachment)).toEqual([])
  expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ outcome: 'blocked' })
  send(f, '@addattach:chest=y,attachover:direct=force')
  expect(f.world.linksets.filter(l => l.attachment).map(l => l.attachment!.point)).toEqual([1])
 }
})

it('applies RLVa UUID ownership checks without hiding other-owned point attachments', async () => {
 for (const profile of ['rlv', 'rlva'] as const) {
  const f = (await loadRlvPair({ source }))[profile]; f.script.start()
  const target = await attachment(f)
  target.owner = f.world.addAvatar({ username: 'attachment owner', region: f.avatar.region }).key
  send(f, '@detach:' + target.prims[0]!.key + '=force')
  expect(target.attachment?.point ?? 0).toBe(profile === 'rlva' ? 1 : 0)
  target.attachToAvatar(f.avatar.key, 1)
  send(f, '@detach:chest=force')
  expect(target.attachment).toBeNull()
 }
})

it('checks the replacement definition point when a cached attachment is dead', async () => {
 for (const f of Object.values(await loadRlvPair({ source }))) {
  f.script.start(); const definition = await loadLinkset({ prims: [{}] })
  seedRlvInventory(f.avatar, { sharedRootId: 'root', entries: [
   { id: 'root', parentId: null, kind: 'folder', name: '#RLV' },
   { id: 'folder', parentId: 'root', kind: 'folder', name: 'Direct' },
   { id: 'item', parentId: 'folder', kind: 'item', name: 'Unnamed', assetType: 'object', object: definition.linkset },
  ] })
  send(f, '@attachover:direct=force')
  const cached = f.avatar.viewer.inventory.attachmentObject('item')!
  cached.detachFromAvatar(); cached.attachToAvatar(f.avatar.key, 1); cached.remove()
  send(f, '@addattach:right hand=n,attachover:direct=force')
  expect(f.world.linksets.filter(l => l.attachment)).toEqual([])
  expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ outcome: 'blocked',
   wearResults: [{ itemId: 'item', outcome: 'blocked', point: 6, reason: 'addattach-lock' }] })
  send(f, '@addattach:right hand=y,attachover:direct=force')
  expect(f.world.linksets.filter(l => l.attachment).map(l => l.attachment!.point)).toEqual([6])
 }
})
