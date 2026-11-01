import { expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, seedRlvInventory } from '../src/index.js'

const source = `list replies; default {
 state_entry() { llListen(773282,"",NULL_KEY,""); }
 touch_start(integer n) { llOwnerSay(llGetObjectDesc()); }
 listen(integer c,string n,key id,string m) { replies += [m]; }
}`
async function fixtures() {
 const pair = await loadRlvPair({ source })
 for (const f of Object.values(pair)) {
  const object = (await loadLinkset({ prims: [{}] })).linkset
  seedRlvInventory(f.avatar, { sharedRootId: 'root', entries: [
   { id: 'root', parentId: null, kind: 'folder', name: '#RLV' },
   { id: 'base', parentId: 'root', kind: 'folder', name: 'Base' },
   { id: 'linked', parentId: 'root', kind: 'folder', name: 'Linked' },
   { id: 'targets', parentId: null, kind: 'folder', name: 'Targets' },
   { id: 'shirt1', parentId: 'base', kind: 'item', name: 'Shirt 1', wearableType: 'shirt' },
   { id: 'shirt2', parentId: 'base', kind: 'item', name: 'Shirt 2', wearableType: 'shirt' },
   { id: 'skin', parentId: 'base', kind: 'item', name: 'Skin', wearableType: 'skin' },
   { id: 'old-shirt', parentId: null, kind: 'item', name: 'Old shirt', wearableType: 'shirt' },
   { id: 'old-skin', parentId: null, kind: 'item', name: 'Old skin', wearableType: 'skin' },
   { id: 'target', parentId: 'targets', kind: 'item', name: 'Target shirt', wearableType: 'shirt' },
   { id: 'object', parentId: 'targets', kind: 'item', name: 'Target (chest)', assetType: 'object', object },
   { id: 'link', parentId: 'linked', kind: 'item', name: 'Alias', linkTargetId: 'target' },
   { id: 'object-link', parentId: 'linked', kind: 'item', name: 'Alias (skull)', linkTargetId: 'object' },
  ], wornWearables: ['old-shirt', 'old-skin'] })
  f.script.start()
 }
 return pair
}
type Fixture = Awaited<ReturnType<typeof fixtures>>['rlv']
function send(f: Fixture, command: string) {
 f.script.host.description = command; f.script.fire('touch_start', { num_detected: 1 })
}
function result(f: Fixture) { return f.avatar.viewer.commandLog.at(-1)! }

// Kokua RLV 2.09.35.00: RRInterface::forceAttach, LLAppearanceMgr::wearItemsOnAvatar.
// Firestorm RLVa 2.4.2: RlvForceWear::forceFolder, addWearable, RlvWearableLocks::canWear.
for (const command of ['attach', 'attachover', 'attachoverorreplace']) {
 it(`${command} wears direct clothing and replaces bodyparts with per-item results`, async () => {
  for (const [profile, f] of Object.entries(await fixtures())) {
   send(f, `@${command}:base=force`)
   const shirts = command === 'attachover' ? ['old-shirt', 'shirt1', 'shirt2']
    : profile === 'rlv' ? ['shirt2'] : ['shirt1', 'shirt2']
   expect([...f.avatar.viewer.inventory.wornWearables()].sort()).toEqual([...shirts, 'skin'].sort())
   expect(result(f).wearResults).toEqual(['shirt1', 'shirt2', 'skin'].map(itemId => ({ itemId, outcome: 'worn' })))
   send(f, '@getoutfit:skin=773282,getoutfit:shirt=773282')
   expect(f.script.global('replies')).toEqual(['1', '1'])
  }
 })
}
it('retains bodyparts when their removal layer is locked', async () => {
 for (const f of Object.values(await fixtures())) {
  send(f, '@remoutfit:skin=n,attach:base=force')
  expect(f.avatar.viewer.inventory.wornWearables()).toContain('old-skin')
  expect(result(f).wearResults).toContainEqual({ itemId: 'skin', outcome: 'blocked', reason: 'layer-lock' })
 }
})
it('resolves linked clothing and objects to target identity, type and attachment name', async () => {
 for (const f of Object.values(await fixtures())) {
  send(f, '@attach:linked=force')
  expect(f.avatar.viewer.inventory.wornWearables()).toEqual(['old-skin', 'target'])
  expect(f.avatar.viewer.inventory.attachmentMappings().map(m => m.itemId)).toEqual(['object'])
  expect(result(f).wearResults).toEqual([
   { itemId: 'link', outcome: 'worn' }, { itemId: 'object-link', outcome: 'attached', point: 1 },
  ])
  send(f, '@attach:linked=force')
  expect(result(f).wearResults?.map(r => r.outcome)).toEqual(['already-worn', 'already-worn'])
  send(f, '@detach:linked=force')
  expect(f.avatar.viewer.inventory.wornWearables()).toEqual(['old-skin'])
  expect(f.world.linksets.filter(l => l.attachment)).toEqual([])
 }
})
it('applies layer and attachment add locks to linked targets', async () => {
 for (const f of Object.values(await fixtures())) {
  send(f, '@addoutfit:shirt=n,addattach:chest=n,attach:linked=force')
  expect(f.avatar.viewer.inventory.wornWearables()).not.toContain('target')
  expect(f.world.linksets.filter(l => l.attachment)).toEqual([])
  expect(result(f).wearResults).toContainEqual({ itemId: 'link', outcome: 'blocked', reason: 'layer-lock' })
  expect(result(f).wearResults).toContainEqual({ itemId: 'object-link', outcome: 'blocked', reason: 'addattach-lock', point: 1 })
 }
})
it('uses the link folder for RLVa clothing add locks and the target folder for Kokua', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  send(f, '@attachthis:linked=n,attach:linked=force')
  expect(f.avatar.viewer.inventory.wornWearables().includes('target')).toBe(profile === 'rlv')
  expect(f.world.linksets.filter(l => l.attachment)).toEqual([])
 }
})
it('shares force clothing checks with shared and unshared wear locks', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  send(f, '@sharedwear=n,attach:linked=force')
  expect(f.avatar.viewer.inventory.wornWearables().includes('target')).toBe(profile === 'rlv')
  expect(f.world.linksets.filter(l => l.attachment)).toEqual([])
  send(f, '@sharedwear=y,remoutfit:shirt=force,unsharedwear=n,attach:linked=force')
  expect(f.avatar.viewer.inventory.wornWearables().includes('target')).toBe(profile === 'rlva')
 }
})
it('checks RLVa removal locks on every shared link to a worn target', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  send(f, '@attach:linked=force,detachthis:linked=n,remoutfit:shirt=force')
  expect(f.avatar.viewer.inventory.wornWearables().includes('target')).toBe(profile === 'rlva')
 }
})
it('resolves explicit wearable actions and does not duplicate target occupancy', async () => {
 for (const f of Object.values(await fixtures())) {
  expect(f.attemptWearable('link', true)).toBe('allowed')
  expect(f.avatar.viewer.inventory.wornWearables()).toContain('target')
  expect(f.attemptWearable('link', true)).toBe('no-op')
  expect(f.attemptWearable('link', false)).toBe('allowed')
  expect(f.avatar.viewer.inventory.wornWearables()).not.toContain('target')
 }
})
it('leaves broken links and links to links inert without following cycles', async () => {
 for (const f of Object.values(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot().filter(e => e.id !== 'object-link'),
   { id: 'broken', parentId: 'linked', kind: 'item', name: 'Missing', linkTargetId: 'absent' },
   { id: 'chain', parentId: 'linked', kind: 'item', name: 'Chain', linkTargetId: 'link' },
   { id: 'cycle', parentId: 'linked', kind: 'item', name: 'Cycle', linkTargetId: 'cycle' },
  ] })
  send(f, '@attach:linked=force')
  expect(inv.wornWearables()).toEqual(['target'])
  expect(result(f).wearResults?.filter(r => r.outcome === 'unsupported').map(r => r.itemId)).toEqual(['broken', 'chain', 'cycle'])
 }
})

// Firestorm RLVa 2.4.2: RlvWearableItemCollector::onCollectItem/onCollectFolder.
// Kokua RLV 2.09.35.00: RRInterface::forceAttach does not traverse folder links.
it('follows one visible folder-link target level only in RLVa', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot().filter(e => e.parentId !== 'linked'),
   { id: 'folder-link', parentId: 'linked', kind: 'item', name: 'Alias', linkTargetId: 'targets' },
   { id: 'child', parentId: 'targets', kind: 'folder', name: 'Child' },
   { id: 'nested', parentId: 'child', kind: 'item', name: 'Pants', wearableType: 'pants' },
   { id: 'second', parentId: 'targets', kind: 'item', name: 'Second link', linkTargetId: 'base' },
  ] })
  send(f, '@attachall:linked=force')
  expect(inv.wornWearables()).toEqual(profile === 'rlva' ? ['target'] : [])
  expect(inv.attachmentMappings().map(m => m.itemId)).toEqual(profile === 'rlva' ? ['object'] : [])
  expect(result(f).status).toBe(profile === 'rlva' ? 'enforced' : 'unsupported')
 }
})
it('excludes hidden, outfit and same-subtree folder-link targets', async () => {
 for (const f of Object.values(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot().filter(e => e.parentId !== 'linked'),
   { id: 'self', parentId: 'linked', kind: 'item', name: 'Self', linkTargetId: 'linked' },
   { id: 'hidden', parentId: null, kind: 'folder', name: '.Hidden' },
   { id: 'outfit', parentId: null, kind: 'folder', name: 'Outfit', outfitFolder: true },
   { id: 'hidden-shirt', parentId: 'hidden', kind: 'item', name: 'Shirt', wearableType: 'shirt' },
   { id: 'outfit-shirt', parentId: 'outfit', kind: 'item', name: 'Shirt', wearableType: 'shirt' },
   { id: 'hidden-link', parentId: 'linked', kind: 'item', name: 'Hidden', linkTargetId: 'hidden' },
   { id: 'outfit-link', parentId: 'linked', kind: 'item', name: 'Outfit', linkTargetId: 'outfit' },
  ] })
  send(f, '@attachall:linked=force')
  expect(inv.wornWearables()).toEqual([])
 }
})
it('counts linked target occupancy in folder replies', async () => {
 for (const f of Object.values(await fixtures())) {
  send(f, '@getinvworn:linked=773282,attach:linked=force')
  send(f, '@getinvworn:linked=773282')
  expect(f.script.global('replies')).toEqual(['|10', '|30'])
 }
})
it('blocks removal through shared links without changing the target', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  send(f, '@attach:linked=force,sharedunwear=n,remoutfit:shirt=force')
  expect(f.avatar.viewer.inventory.wornWearables().includes('target')).toBe(profile === 'rlva')
 }
})
it('checks both link and target removal folders and target nostrip protection', async () => {
 for (const f of Object.values(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  inv.seed({ sharedRootId: 'root', entries: inv.snapshot().map(e => e.id === 'targets' ? { ...e, parentId: 'root' } : e) })
  send(f, '@attach:linked=force,detachthis:targets=n')
  send(f, '@detach:linked=force')
  expect(inv.wornWearables()).toContain('target')
  expect(result(f).removeResults).toContainEqual({ itemId: 'link', outcome: 'blocked', reason: 'folder-lock' })
  send(f, '@detachthis:targets=y')
  inv.seed({ sharedRootId: 'root', entries: inv.snapshot().map(e => e.id === 'targets' ? { ...e, name: 'nostrip Targets' } : e),
   wornWearables: ['target'] })
  send(f, '@detach:linked=force')
  expect(inv.wornWearables()).toEqual(['target'])
  expect(result(f).removeResults).toContainEqual({ itemId: 'link', outcome: 'blocked', reason: 'nostrip' })
 }
})
it('lets RLVa use the link folder point only when the target has no point', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  inv.seed({ sharedRootId: 'root', sharedWear: false, entries: inv.snapshot().map(e => e.id === 'linked' ? { ...e, name: 'Linked (skull)' }
   : e.id === 'object' ? { ...e, name: 'Object' } : e) })
  send(f, '@attach:linked=force')
  expect(f.world.linksets.filter(l => l.attachment).map(l => l.attachment!.point)).toEqual(profile === 'rlva' ? [2] : [6])
 }
})
it('RLVa folder links include strippable folded clothing and remove folded objects', async () => {
 const f = (await fixtures()).rlva
 const inv = f.avatar.viewer.inventory
 const object = inv.snapshot().find(e => e.id === 'object')!.object!
 inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot().filter(e => e.parentId !== 'linked'),
  { id: 'folder-link', parentId: 'linked', kind: 'item', name: 'Alias', linkTargetId: 'targets' },
  { id: 'folded', parentId: 'targets', kind: 'folder', name: '.(skull)', folded: true },
  { id: 'fold-object', parentId: 'folded', kind: 'item', name: 'Object', assetType: 'object', object },
  { id: 'fold-shirt', parentId: 'folded', kind: 'item', name: 'Shirt', wearableType: 'pants' },
  { id: 'fold-nostrip', parentId: 'folded', kind: 'item', name: 'nostrip Shirt', wearableType: 'socks' },
 ] })
 send(f, '@attach:linked=force')
 expect([...inv.wornWearables()].sort()).toEqual(['fold-shirt', 'target'])
 expect(result(f).wearResults).toContainEqual({ itemId: 'fold-nostrip', outcome: 'skipped', reason: 'nostrip' })
 send(f, '@detach:linked=force')
 expect(inv.wornWearables()).toEqual(['fold-shirt'])
 expect(f.world.linksets.filter(l => l.attachment)).toEqual([])
})
it('rejects links with an independent wearable definition and keeps invalid user actions inert', async () => {
 for (const f of Object.values(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  expect(() => inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot(),
   { id: 'invalid', parentId: 'linked', kind: 'item', name: 'Invalid', linkTargetId: 'target', wearableType: 'shirt' },
  ] })).toThrow('Inventory links require an item')
  expect(f.attemptWearable('missing', true)).toBe('no-op')
  expect(f.attemptWearable('object-link', true)).toBe('no-op')
 }
})
