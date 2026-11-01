import { describe, expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, seedRlvInventory, Linkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Shared_Folders
// In-world: all three commands wear direct named attachments. Attach and
// attachoverorreplace replace occupied Chest and keep the final same-point item;
// attachover adds and keeps both. Repeating worn folders preserves object IDs.
// Named replacement is blocked by detach=n; add still works.
// (Aditi, SLua Tideland, 2026-11-01, Firestorm RLVa 2.4.2, API 3.4.3).
const source = `list replies; default {
 state_entry() { llListen(773232,"",NULL_KEY,""); }
 touch_start(integer n) { llOwnerSay(llGetObjectDesc()); }
 listen(integer c,string n,key id,string m) { replies += [m]; }
}`

async function fixtures() {
 const pair = await loadRlvPair({ source })
 for (const { world, avatar, script } of Object.values(pair)) {
  const a = await loadLinkset({ prims: [{ name: 'First', scripts: [{ name: 'events', source: { source: `list events; default { attach(key id) { events += [(string)id,llGetAttached()]; } }` } }] }] })
  const b = await loadLinkset({ prims: [{ name: 'Second' }] })
  seedRlvInventory(avatar, { sharedRootId: 'root', entries: [
   { id: 'root', parentId: null, kind: 'folder', name: '#RLV' },
   { id: 'folder', parentId: 'root', kind: 'folder', name: 'Direct' },
   { id: 'a', parentId: 'folder', kind: 'item', name: 'First (chest)', assetType: 'object', object: a.linkset },
   { id: 'b', parentId: 'folder', kind: 'item', name: 'Second (left hand)', assetType: 'object', object: b.linkset },
  ] })
  expect(world.linksets).toHaveLength(1)
  script.start()
 }
 return pair
}

function send(script: Awaited<ReturnType<typeof fixtures>>['rlv']['script'], command: string) {
 script.host.description = command
 script.fire('touch_start', { num_detected: 1 })
}

describe('direct shared attachment force wear', () => {
 for (const command of ['attach', 'attachover', 'attachoverorreplace']) it(`${command}: queries, wears two direct items and preserves identity`, async () => {
  const pair = await fixtures()
  for (const { script, world, avatar } of Object.values(pair)) {
   send(script, '@getinvworn:direct=773232')
   expect(script.global('replies')).toEqual(['|10'])
   send(script, `@${command}:DIRECT=force`)
   const worn = world.linksets.filter(l => l.attachment)
   expect(worn.map(l => l.attachment!.point)).toEqual([1, 5])
   expect(worn.map(l => avatar.viewer.inventory.attachmentItem(l.prims[0]!.key)?.id)).toEqual(['a', 'b'])
   expect(worn.every(l => l.owner === avatar.key)).toBe(true)
   send(script, '@getinvworn:direct=773232')
   expect(script.global('replies')).toEqual(['|10', '|30'])
   send(script, `@${command}:direct=force`)
   expect(world.linksets.filter(l => l.attachment)).toEqual(worn)
   expect(avatar.viewer.inventory.snapshot().filter(e => e.kind === 'item')).toHaveLength(2)
  }
 })
})

it('does not wear descendants, clothing, missing definitions, or unshared paths', async () => {
 const pair = await fixtures()
 for (const { script, world, avatar } of Object.values(pair)) {
  const inventory = avatar.viewer.inventory
  inventory.seed({ sharedRootId: inventory.sharedRootId, entries: [
   ...inventory.snapshot(),
   { id: 'nested', parentId: 'folder', kind: 'folder', name: 'Nested' },
   { id: 'child', parentId: 'nested', kind: 'item', name: 'Child (skull)', assetType: 'object' },
   { id: 'shirt', parentId: 'folder', kind: 'item', name: 'Shirt', wearableType: 'shirt' },
   { id: 'other', parentId: null, kind: 'folder', name: 'Unshared' },
  ] })
  send(script, '@attach:missing=force')
  expect(world.linksets.filter(l => l.attachment)).toEqual([])
  send(script, '@attach:unshared=force')
  expect(world.linksets.filter(l => l.attachment)).toEqual([])
  send(script, '@attach:direct=force')
  expect(world.linksets.filter(l => l.attachment)).toHaveLength(2)
  expect(inventory.wornWearables()).toEqual([])
 }
})

for (const command of ['attach', 'attachover', 'attachoverorreplace']) it(`${command}: resolves same-point collisions`, async () => {
 const pair = await fixtures()
 for (const { script, world, avatar } of Object.values(pair)) {
  const inventory = avatar.viewer.inventory
  inventory.seed({ sharedRootId: 'root', entries: inventory.snapshot().map(e => e.id === 'b' ? { ...e, name: 'Second (chest)' } : e) })
  send(script, `@${command}:direct=force`)
  const worn = world.linksets.filter(l => l.attachment)
  expect(worn.map(l => inventory.attachmentItem(l.prims[0]!.key)?.id)).toEqual(command === 'attachover' ? ['a', 'b'] : ['b'])
  expect(worn.map(l => l.attachment!.point)).toEqual(command === 'attachover' ? [1, 1] : [1])
 }
})

for (const command of ['attach', 'attachover', 'attachoverorreplace']) it(`${command}: respects locked occupants without blocking add`, async () => {
 const pair = await fixtures()
 for (const { script, world, avatar } of Object.values(pair)) {
  const old = await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [{ scripts: [{ name: 'lock', source: { source: 'default { state_entry() { llOwnerSay("@detach=n"); } }' } }] }] })
  old.linkset.attachToAvatar(avatar.key, 1); old.scripts.lock!.start()
  send(script, `@${command}:direct=force`)
  expect(old.linkset.attachment?.point).toBe(1)
  expect(world.linksets.filter(l => l.attachment).map(l => l.attachment!.point)).toEqual(command === 'attachover' ? [1, 1, 5] : [1, 5])
 }
})

it('skips unnamed RLVa items when shared wear is disabled and keeps Kokua unnamed wear', async () => {
 const pair = await fixtures()
 for (const [profile, { script, world, avatar }] of Object.entries(pair)) {
  const inventory = avatar.viewer.inventory
  inventory.seed({ sharedRootId: 'root', sharedWear: false, entries: inventory.snapshot().map(e => e.id === 'a' ? { ...e, name: 'Plain' } : e) })
  send(script, '@attach:direct=force')
  expect(world.linksets.filter(l => l.attachment).map(l => l.attachment!.point)).toEqual(profile === 'rlv' ? [6, 5] : [5])
 }
})

// In-world: all three commands resolve an unnamed item's remembered Chest point;
// attach/attachoverorreplace replace its unlocked occupant, while attachover adds.
// With a locked and an unlocked occupant, unnamed replacement retains the locked
// item and removes the unlocked one. A fresh attachover uses Right Hand.
// (Aditi, SLua Tideland, 2026-11-01, Firestorm RLVa 2.4.2, API 3.4.3).
for (const command of ['attach', 'attachover', 'attachoverorreplace']) it(`${command}: uses the saved point for unnamed items`, async () => {
 const pair = await fixtures()
 for (const [profile, { script, world, avatar }] of Object.entries(pair)) {
  const inventory = avatar.viewer.inventory
  inventory.seed({ sharedRootId: 'root', entries: inventory.snapshot().filter(e => e.id !== 'b').map(e => e.id === 'a' ? { ...e, name: 'Plain' } : e) })
  send(script, `@${command}:direct=force`)
  const object = world.linksets.find(l => l.attachment)!
  expect(object.attachment?.point).toBe(6)
  object.detachFromAvatar(); object.attachToAvatar(avatar.key, 1); object.detachFromAvatar()
  const occupied = await loadLinkset({ world, region: avatar.region, owner: avatar.key, prims: [{}] })
  occupied.linkset.attachToAvatar(avatar.key, 1)
  send(script, `@${command}:direct=force`)
  expect(object.attachment?.point).toBe(1)
  expect(occupied.linkset.attachment?.point ?? 0).toBe(profile === 'rlv' || command === 'attachover' ? 1 : 0)
  expect(inventory.attachmentItem(object.prims[0]!.key)?.id).toBe('a')
 }
})

it('unnamed replacement keeps locked occupants and removes only unlocked occupants in RLVa', async () => {
 const { rlva: { script, world, avatar } } = await fixtures()
 const inventory = avatar.viewer.inventory
 inventory.seed({ sharedRootId: 'root', entries: inventory.snapshot().filter(e => e.id !== 'b').map(e => e.id === 'a' ? { ...e, name: 'Plain' } : e) })
 send(script, '@attach:direct=force')
 const object = world.linksets.find(l => l.attachment)!
 object.detachFromAvatar(); object.attachToAvatar(avatar.key, 1); object.detachFromAvatar()
 const lock = await loadLinkset({ world, region: avatar.region, owner: avatar.key, prims: [{ scripts: [{ name: 'lock', source: { source: 'default { state_entry() { llOwnerSay("@detach=n"); } }' } }] }] })
 lock.linkset.attachToAvatar(avatar.key, 1); lock.scripts.lock!.start()
 const unlocked = await loadLinkset({ world, region: avatar.region, owner: avatar.key, prims: [{}] })
 unlocked.linkset.attachToAvatar(avatar.key, 1)
 send(script, '@attach:direct=force')
 expect(lock.linkset.attachment?.point).toBe(1)
 expect(unlocked.linkset.attachment).toBeNull()
 expect(object.attachment?.point).toBe(1)
})

// In-world: a + prefixed folder makes attach, attachover and attachoverorreplace
// add both Chest objects (Aditi, SLua Tideland, 2026-11-01, Firestorm RLVa 2.4.2).
for (const command of ['attach', 'attachover', 'attachoverorreplace']) it(`${command}: honors the default add folder prefix`, async () => {
 const pair = await fixtures()
 for (const { script, world, avatar } of Object.values(pair)) {
  const inventory = avatar.viewer.inventory
  inventory.seed({ sharedRootId: 'root', entries: inventory.snapshot().map(e => e.id === 'folder' ? { ...e, name: '+Direct' } : e.id === 'b' ? { ...e, name: 'Second (chest)' } : e) })
  send(script, `@${command}:+direct=force`)
  expect(world.linksets.filter(l => l.attachment).map(l => l.attachment!.point)).toEqual([1, 1])
 }
})

it('copies script state, queues attachment lifecycle events, and reuses the inventory instance', async () => {
 const pair = await fixtures()
 for (const { script, world, avatar } of Object.values(pair)) {
  send(script, '@attach:direct=force')
  const first = world.linksets.find(l => avatar.viewer.inventory.attachmentItem(l.prims[0]!.key)?.id === 'a')!
  const events = first.allScripts()[0]!
  expect(events.global('events')).toEqual([avatar.key, 1])
  expect(events.state.permissions.granted).toBe(0)
  first.detachFromAvatar(); script.advanceTime(0)
  send(script, '@attach:direct=force')
  expect(world.linksets.filter(l => l.attachment)).toContain(first)
  expect(events.global('events')).toEqual([avatar.key, 1, '00000000-0000-0000-0000-000000000000', 0, avatar.key, 1])
 }
})

for (const [name, rlv, rlva] of [
 ['Mixed (left hand) suffix (chest)', 1, 1],
 ['Mixed (left hand) suffix (unknown)', 5, 6],
 ['Mixed ( chest )', 6, 1],
 ['Mixed (root)', 40, 40],
 ['No parentheses chest', 6, 6],
] as const) it(`resolves profile attachment point names: ${name}`, async () => {
 const pair = await fixtures()
 for (const profile of ['rlv', 'rlva'] as const) {
  const { script, world, avatar } = pair[profile]
  const inventory = avatar.viewer.inventory
  inventory.seed({ sharedRootId: 'root', entries: inventory.snapshot().filter(e => e.id !== 'b').map(e => e.id === 'a' ? { ...e, name } : e) })
  send(script, '@attach:direct=force')
  expect(world.linksets.find(l => l.attachment)?.attachment?.point).toBe(profile === 'rlv' ? rlv : rlva)
 }
})

for (const modifiable of [true, false]) it(`prefers the correct point for modifiable=${modifiable} inside a folded folder`, async () => {
 const pair = await fixtures()
 for (const profile of ['rlv', 'rlva'] as const) {
  const { script, world, avatar } = pair[profile]
  const inventory = avatar.viewer.inventory
  inventory.seed({ sharedRootId: 'root', entries: inventory.snapshot().filter(e => e.id !== 'b').map(e => e.id === 'folder' ? { ...e, name: 'Fold (chest)', folded: true } : e.id === 'a' ? { ...e, name: 'Object (left hand)', modifiable } : e) })
  send(script, '@attach:fold=force')
  expect(world.linksets.find(l => l.attachment)?.attachment?.point).toBe(profile === 'rlva' && !modifiable ? 1 : 5)
 }
})

it('collects single no-mod folded child attachments without traversing ordinary descendants', async () => {
 const pair = await fixtures()
 for (const { script, world, avatar } of Object.values(pair)) {
  const inventory = avatar.viewer.inventory
  inventory.seed({ sharedRootId: 'root', entries: [
   ...inventory.snapshot().filter(e => e.id !== 'b').map(e => e.id === 'a' ? { ...e, parentId: 'folded', name: 'No mod', modifiable: false } : e),
   { id: 'folded', parentId: 'folder', name: '.(chest)', kind: 'folder', folded: true },
   { id: 'ordinary', parentId: 'folder', name: 'Ordinary', kind: 'folder' },
   { id: 'nested', parentId: 'ordinary', name: 'Nested (skull)', kind: 'item', assetType: 'object', object: inventory.snapshot().find(e => e.id === 'b')!.object! },
  ] })
  send(script, '@attach:direct=force')
  expect(world.linksets.filter(l => l.attachment).map(l => l.attachment!.point)).toEqual([1])
 }
})

it('reports invalid paths and unsupported forms without changing the outfit', async () => {
 const pair = await fixtures()
 for (const [profile, { script, world, avatar }] of Object.entries(pair)) {
  for (const path of ['', 'missing', '/']) {
   send(script, `@attach:${path}=force`)
   expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'enforced', outcome: profile === 'rlva' ? 'failed-option' : 'no-op' })
  }
  send(script, '@attach:direct|other=force')
  expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'unsupported', outcome: 'unsupported-form' })
  send(script, '@attachall:direct=force')
  expect(avatar.viewer.commandLog.at(-1)?.status).toBe('unsupported')
  expect(world.linksets.filter(l => l.attachment)).toEqual([])
  avatar.viewer.inventory.seed({ sharedRootId: null, entries: [] })
  send(script, '@attach:direct=force')
  expect(world.linksets.filter(l => l.attachment)).toEqual([])
 }
})

it('reports unsupported contents and absent definitions alongside successful actions', async () => {
 const pair = await fixtures()
 for (const { script, avatar } of Object.values(pair)) {
  const inventory = avatar.viewer.inventory
  inventory.seed({ sharedRootId: 'root', entries: [
   ...inventory.snapshot(),
   { id: 'empty', parentId: 'folder', name: 'Empty (skull)', kind: 'item', assetType: 'object' },
   { id: 'shirt', parentId: 'folder', name: 'Shirt', kind: 'item', wearableType: 'shirt' },
  ] })
  send(script, '@attach:direct=force')
  expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'enforced', outcome: 'partial', wearResults: expect.arrayContaining([
   { itemId: 'empty', outcome: 'unsupported', reason: 'missing-definition' },
   { itemId: 'shirt', outcome: 'unsupported', reason: 'unsupported-content' },
   { itemId: 'a', outcome: 'attached', point: 1 },
  ]) })
 }
})

it('leaves disabled viewer commands inert', async () => {
 const world = new World(); world.addRegion('disabled', { x: 0, y: 0 })
 const avatar = world.addAvatar({ username: 'disabled', region: 'disabled' })
 const definition = await loadLinkset({ prims: [{}] })
 seedRlvInventory(avatar, { sharedRootId: 'root', entries: [
  { id: 'root', name: '#RLV', parentId: null, kind: 'folder' },
  { id: 'folder', name: 'Direct', parentId: 'root', kind: 'folder' },
  { id: 'item', name: 'Object (chest)', parentId: 'folder', kind: 'item', assetType: 'object', object: definition.linkset },
 ] })
 const loaded = await loadLinkset({ world, region: avatar.region, owner: avatar.key, prims: [{ scripts: [{ name: 'off', source: { source: 'default { state_entry() { llOwnerSay("@attach:direct=force,attachover:direct=force,attachoverorreplace:direct=force"); } }' } }] }] })
 loaded.scripts.off!.start()
 expect(world.linksets.filter(l => l.attachment)).toEqual([])
 expect(avatar.viewer.commandLog).toEqual([])
})

it('validates object definitions atomically', async () => {
 const { rlv: { avatar } } = await fixtures()
 const inventory = avatar.viewer.inventory
 const before = inventory.snapshot()
 expect(() => inventory.seed({ sharedRootId: 'root', entries: [
  ...before, { id: 'bad', name: 'Bad', parentId: 'folder', kind: 'item', assetType: 'object', object: new Linkset() },
 ] })).toThrow('Attachment definitions require')
 expect(inventory.snapshot()).toBe(before)
})

it('does not reuse a saved instance worn by another avatar', async () => {
 const pair = await fixtures()
 for (const { script, avatar, world } of Object.values(pair)) {
  send(script, '@attach:direct=force')
  const object = world.linksets.find(l => avatar.viewer.inventory.attachmentItem(l.prims[0]!.key)?.id === 'a')!
  object.detachFromAvatar()
  const other = world.addAvatar({ username: 'other', region: avatar.region })
  object.attachToAvatar(other.key, 1)
  send(script, '@attach:direct=force')
  expect(object.attachment?.avatar).toBe(other.key)
  expect(avatar.viewer.commandLog.at(-1)?.wearResults).toContainEqual({ itemId: 'a', outcome: 'unsupported', reason: 'unavailable-attachment' })
 }
})

it('initializes a new attachment before its attach handler runs', async () => {
 const pair = await fixtures()
 for (const { script, world, avatar } of Object.values(pair)) {
  const definition = await loadLinkset({ prims: [{ scripts: [{ name: 'lifecycle', source: { source: `integer initialized; integer observed; list events; default {
   state_entry() { initialized = 7; }
   on_rez(integer p) { events += ["rez"]; }
   attach(key id) { observed = initialized; events += ["attach"]; }
  }` } }] }] })
  const inventory = avatar.viewer.inventory
  inventory.seed({ sharedRootId: 'root', entries: inventory.snapshot().filter(e => e.id !== 'b').map(e => e.id === 'a' ? { ...e, object: definition.linkset } : e) })
  send(script, '@attach:direct=force')
  const live = world.linksets.find(l => l.attachment)!.allScripts()[0]!
  expect(live.global('observed')).toBe(7)
  expect(live.global('events')).toEqual(['rez', 'attach'])
 }
})
