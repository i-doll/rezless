import { expect, it } from 'vitest'
import { loadLinkset, loadRlvPair, seedRlvInventory } from '../src/index.js'

const source = 'default { touch_start(integer n) { llOwnerSay(llGetObjectDesc()); } }'

async function fixture() {
  const f = (await loadRlvPair({ source })).rlva
  f.script.linkset.attachToAvatar(f.avatar.key, 1)
  f.script.start()
  const loaded = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
    prims: [{ scripts: [{ name: 'saved', source: { source: 'integer counter; default { touch_start(integer n) { counter++; } }' } }] }] })
  loaded.linkset.attachToAvatar(f.avatar.key, 5)
  loaded.scripts.saved!.start()
  loaded.scripts.saved!.fire('touch_start', { num_detected: 1 })
  const config = {
    sharedRootId: 'root',
    entries: [
      { id: 'root', parentId: null, kind: 'folder' as const, name: '#RLV' },
      { id: 'a', parentId: 'root', kind: 'folder' as const, name: 'A' },
      { id: 'b', parentId: 'root', kind: 'folder' as const, name: 'B' },
      { id: 'issuer', parentId: 'a', kind: 'item' as const, name: 'Issuer', assetType: 'object' as const },
      { id: 'saved', parentId: 'b', kind: 'item' as const, name: 'Saved', assetType: 'object' as const },
    ],
    wornAttachments: [
      { itemId: 'issuer', rootKey: f.script.host.key },
      { itemId: 'saved', rootKey: loaded.prims[0]!.key },
    ],
  }
  const wear = (folder = 'B') => {
    f.script.host.description = `@attachover:${folder}=force`
    f.script.fire('touch_start', { num_detected: 1 })
  }
  const expectSaved = () => {
    expect(loaded.linkset.attachment?.avatar).toBe(f.avatar.key)
    expect(f.avatar.viewer.inventory.attachmentObject('saved')).toBe(loaded.linkset)
    expect(loaded.scripts.saved!.global('counter')).toBe(1)
    expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ wearResults: [
      { itemId: 'saved', outcome: 'attached' },
    ] })
  }
  return { ...f, loaded, config, wear, expectSaved }
}

it('keeps a detached mapped object wearable after seeding the same inventory again', async () => {
  const f = await fixture()
  seedRlvInventory(f.avatar, f.config)
  f.loaded.linkset.detachFromAvatar()
  f.wear()
  f.expectSaved()
  f.loaded.linkset.detachFromAvatar()
  seedRlvInventory(f.avatar, f.config)
  f.wear()
  f.expectSaved()
})

it('remembers an existing detached linkset from its root mapping on the first seed', async () => {
  const f = await fixture()
  f.loaded.linkset.detachFromAvatar()
  seedRlvInventory(f.avatar, f.config)
  f.wear()
  f.expectSaved()
})

it('retains a remembered item without a replacement root mapping', async () => {
  const f = await fixture()
  seedRlvInventory(f.avatar, f.config)
  f.loaded.linkset.detachFromAvatar()
  f.avatar.viewer.inventory.seed({ ...f.config, wornAttachments: [] })
  f.wear()
  f.expectSaved()
})

it('drops remembered objects whose item IDs were removed', async () => {
  const f = await fixture()
  seedRlvInventory(f.avatar, f.config)
  f.loaded.linkset.detachFromAvatar()
  seedRlvInventory(f.avatar, { ...f.config, entries: f.config.entries.filter(e => e.id !== 'saved'),
    wornAttachments: f.config.wornAttachments.filter(e => e.itemId !== 'saved') })
  expect(f.avatar.viewer.inventory.attachmentObject('saved')).toBeUndefined()
  seedRlvInventory(f.avatar, { ...f.config, wornAttachments: [] })
  f.wear()
  expect(f.loaded.linkset.attachment).toBeNull()
  expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ wearResults: [
    { itemId: 'saved', outcome: 'unsupported', reason: 'missing-definition' },
  ] })
})

it('uses the replacement root when an item is remapped', async () => {
  const f = await fixture()
  seedRlvInventory(f.avatar, f.config)
  f.loaded.linkset.detachFromAvatar()
  const replacement = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key, prims: [{}] })
  replacement.linkset.attachToAvatar(f.avatar.key, 5)
  replacement.linkset.detachFromAvatar()
  seedRlvInventory(f.avatar, { ...f.config, wornAttachments: [
    { itemId: 'saved', rootKey: replacement.prims[0]!.key.toUpperCase() },
  ] })
  f.wear()
  expect(replacement.linkset.attachment?.avatar).toBe(f.avatar.key)
  expect(f.loaded.linkset.attachment).toBeNull()
  expect(f.avatar.viewer.inventory.attachmentObject('saved')).toBe(replacement.linkset)
})

it('does not wear the old object when an item is remapped to an unavailable root', async () => {
  const f = await fixture()
  seedRlvInventory(f.avatar, f.config)
  f.loaded.linkset.detachFromAvatar()
  seedRlvInventory(f.avatar, { ...f.config, wornAttachments: [{ itemId: 'saved', rootKey: 'missing' }] })
  f.wear()
  expect(f.loaded.linkset.attachment).toBeNull()
  expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ wearResults: [
    { itemId: 'saved', outcome: 'unsupported', reason: 'missing-definition' },
  ] })
})

it('keeps a detached item wearable after moving it to another folder', async () => {
  const f = await fixture()
  seedRlvInventory(f.avatar, f.config)
  f.loaded.linkset.detachFromAvatar()
  seedRlvInventory(f.avatar, { ...f.config, entries: f.config.entries.map(e => e.id === 'saved'
    ? { ...e, parentId: 'a' } : e) })
  f.wear('A')
  expect(f.loaded.linkset.attachment?.avatar).toBe(f.avatar.key)
  expect(f.avatar.viewer.inventory.attachmentObject('saved')).toBe(f.loaded.linkset)
  expect(f.loaded.scripts.saved!.global('counter')).toBe(1)
})

it('preserves a currently attached object through reseeding and a later detach', async () => {
  const f = await fixture()
  seedRlvInventory(f.avatar, f.config)
  seedRlvInventory(f.avatar, f.config)
  expect(f.loaded.linkset.attachment?.avatar).toBe(f.avatar.key)
  f.loaded.linkset.detachFromAvatar()
  f.wear()
  f.expectSaved()
})


it('rejects invalid reseeding without losing a remembered detached object', async () => {
  const f = await fixture()
  seedRlvInventory(f.avatar, f.config)
  f.loaded.linkset.detachFromAvatar()
  expect(() => seedRlvInventory(f.avatar, { ...f.config, entries: [] })).toThrow()
  f.wear()
  f.expectSaved()
})

it('does not restore a detached object that has been deleted', async () => {
  const f = await fixture()
  f.loaded.linkset.detachFromAvatar()
  f.loaded.linkset.remove()
  seedRlvInventory(f.avatar, f.config)
  f.wear()
  expect(f.loaded.linkset.attachment).toBeNull()
  expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ wearResults: [
    { itemId: 'saved', outcome: 'unsupported', reason: 'missing-definition' },
  ] })
})

it('does not keep the old item association when its root is reassigned to another item', async () => {
  const f = await fixture()
  seedRlvInventory(f.avatar, f.config)
  f.loaded.linkset.detachFromAvatar()
  seedRlvInventory(f.avatar, { ...f.config, entries: [...f.config.entries,
    { id: 'c', parentId: 'root', kind: 'folder', name: 'C' },
    { id: 'replacement', parentId: 'c', kind: 'item', name: 'Replacement', assetType: 'object' },
  ], wornAttachments: [{ itemId: 'replacement', rootKey: f.loaded.prims[0]!.key }] })
  f.wear()
  expect(f.loaded.linkset.attachment).toBeNull()
  expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ wearResults: [
    { itemId: 'saved', outcome: 'unsupported', reason: 'missing-definition' },
  ] })
  f.wear('C')
  expect(f.loaded.linkset.attachment?.avatar).toBe(f.avatar.key)
  expect(f.avatar.viewer.inventory.attachmentObject('replacement')).toBe(f.loaded.linkset)
  expect(f.loaded.scripts.saved!.global('counter')).toBe(1)
  f.wear()
  expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ wearResults: [
    { itemId: 'saved', outcome: 'unsupported', reason: 'missing-definition' },
  ] })
  expect(f.avatar.viewer.inventory.attachmentItem(f.loaded.prims[0]!.key)?.id).toBe('replacement')
})
