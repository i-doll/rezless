import { describe, expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, seedRlvInventory, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Shared_Folders
// In-world: folder detach retains locked attachments, removes unlocked direct
// items and leaves nested items worn. Repeating on an unworn folder is inert.
// Socks removal respects the issuer's own and a second controller's layer locks;
// clearing the final lock permits removal. Empty jacket and skin removal are inert.
// (Aditi, SLua Tideland, 2026-11-01, Firestorm RLVa 2.4.2, API 3.4.3).
const source = `list replies; default {
 state_entry() { llListen(773233,"",NULL_KEY,""); }
 touch_start(integer n) { llOwnerSay(llGetObjectDesc()); }
 listen(integer c,string n,key id,string m) { replies += [m]; }
}`
async function fixtures() {
 const pair = await loadRlvPair({ source })
 for (const { avatar, script, world } of Object.values(pair)) {
  const a = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
   prims: [{ scripts: [{ name: 'events', source: { source: `list events; default { attach(key id) { events += [(string)id,llGetAttached()]; } touch_start(integer n) { llOwnerSay(llGetObjectDesc()); } }` } }] }, { scripts: [{ name: 'child', source: { source } }] }] })
  const b = await loadLinkset({ world, region: avatar.region, owner: avatar.key, prims: [{}] })
  const nested = await loadLinkset({ world, region: avatar.region, owner: avatar.key, prims: [{}] })
  a.linkset.attachToAvatar(avatar.key, 1); b.linkset.attachToAvatar(avatar.key, 5); nested.linkset.attachToAvatar(avatar.key, 2)
  a.scripts.events!.start(); a.scripts.child!.start()
  seedRlvInventory(avatar, { sharedRootId: 'root', entries: [
   { id: 'root', parentId: null, kind: 'folder', name: '#RLV' },
   { id: 'direct', parentId: 'root', kind: 'folder', name: 'Direct' },
   { id: 'nested', parentId: 'direct', kind: 'folder', name: 'Nested' },
   { id: 'empty', parentId: 'root', kind: 'folder', name: 'Empty' },
   { id: 'a', parentId: 'direct', kind: 'item', name: 'First', assetType: 'object' },
   { id: 'b', parentId: 'direct', kind: 'item', name: 'Second', assetType: 'object' },
   { id: 'c', parentId: 'nested', kind: 'item', name: 'Child', assetType: 'object' },
   { id: 'socks', parentId: 'root', kind: 'item', name: 'Socks', wearableType: 'socks' },
   { id: 'shirt', parentId: null, kind: 'item', name: 'Shirt', wearableType: 'shirt' },
   { id: 'skin', parentId: null, kind: 'item', name: 'Skin', wearableType: 'skin' },
  ], wornWearables: ['socks', 'shirt', 'skin'], wornAttachments: [
   { itemId: 'a', rootKey: a.linkset.prims[0]!.key }, { itemId: 'b', rootKey: b.linkset.prims[0]!.key },
   { itemId: 'c', rootKey: nested.linkset.prims[0]!.key },
  ] })
  script.start()
 }
 return pair
}
type Fixture = Awaited<ReturnType<typeof fixtures>>['rlv']
function send(script: Fixture['script'], command: string) {
 script.host.description = command; script.fire('touch_start', { num_detected: 1 })
}
function attachment(f: Fixture, id: string) {
 const root = f.avatar.viewer.inventory.attachmentMappings().find(m => m.itemId === id)!.rootKey
 return f.world.linksets.find(l => l.prims[0]!.key === root) ?? f.avatar.viewer.inventory.attachmentObject(id)!
}
function result(f: Fixture) { return f.avatar.viewer.commandLog.at(-1)! }

it('removes direct attachments, preserves nested items, and updates query replies', async () => {
 for (const f of Object.values(await fixtures())) {
  send(f.script, '@getinvworn:direct=773233')
  send(f.script, '@detach:direct=force')
  expect(attachment(f, 'a').attachment).toBeNull(); expect(attachment(f, 'b').attachment).toBeNull()
  expect(attachment(f, 'c').attachment?.point).toBe(2)
  expect(result(f).removeResults).toEqual([{ itemId: 'a', outcome: 'removed' }, { itemId: 'b', outcome: 'removed' }])
  send(f.script, '@getattach:chest=773233,getinvworn:direct=773233')
  expect(f.script.global('replies')).toEqual(['|33,Nested|30', '0', '|13,Nested|30'])
  expect(attachment(f, 'a').allScripts()[0]!.global('events')).toEqual([f.avatar.key, 1, '00000000-0000-0000-0000-000000000000', 0])
  send(f.script, '@detach:direct=force')
  expect(result(f).outcome).toBe('no-op')
  expect(result(f).removeResults?.map(r => r.outcome)).toEqual(['not-worn', 'not-worn'])
 }
})

it('reports partial attachment removal and respects self and child detach locks', async () => {
 for (const f of Object.values(await fixtures())) {
  const a = attachment(f, 'a'); const lock = a.allScripts()[0]!
  send(lock, '@detach=n,detach:direct=force')
  expect(a.attachment?.point).toBe(1); expect(attachment(f, 'b').attachment).toBeNull()
  expect(result(f).outcome).toBe('partial')
  expect(result(f).removeResults).toEqual([{ itemId: 'a', outcome: 'blocked', reason: 'detach-lock' }, { itemId: 'b', outcome: 'removed' }])
  const child = a.allScripts()[1]!
  // The command emitter, rather than the force issuer, owns each lock.
  send(child, '@detach=n')
  send(lock, '@detach=y'); send(f.script, '@detach:direct=force')
  expect(a.attachment?.point).toBe(1)
  send(child, '@detach=y')
  send(f.script, '@detach:direct=force')
  expect(a.attachment).toBeNull()
 }
})

it('removes only the selected clothing layer and preserves bodyparts', async () => {
 for (const f of Object.values(await fixtures())) {
  send(f.script, '@remoutfit:socks=force')
  expect(f.avatar.viewer.inventory.wornWearables()).toEqual(['shirt', 'skin'])
  expect(result(f).removeResults).toEqual([{ itemId: 'socks', outcome: 'removed' }])
  send(f.script, '@getoutfit:socks=773233,getoutfit:shirt=773233')
  expect(f.script.global('replies')).toEqual(['0', '1'])
  send(f.script, '@remoutfit:jacket=force'); expect(result(f).outcome).toBe('no-op')
  send(f.script, '@remoutfit:skin=force'); expect(result(f).outcome).toBe('no-op')
  expect(result(f).removeResults).toEqual([{ itemId: 'skin', outcome: 'skipped', reason: 'bodypart' }])
  expect(f.avatar.viewer.inventory.wornWearables()).toEqual(['shirt', 'skin'])
 }
})

it('bare removal strips clothing across inventory folders but retains bodyparts and locks', async () => {
 for (const f of Object.values(await fixtures())) {
  send(f.script, '@remoutfit:shirt=n,remoutfit=force')
  expect(f.avatar.viewer.inventory.wornWearables()).toEqual(['shirt', 'skin'])
  expect(result(f).outcome).toBe('partial')
  expect(result(f).removeResults).toEqual([
   { itemId: 'socks', outcome: 'removed' }, { itemId: 'shirt', outcome: 'blocked', reason: 'layer-lock' },
   { itemId: 'skin', outcome: 'skipped', reason: 'bodypart' },
  ])
 }
})

for (const option of ['', ':socks']) it(`keeps every controller's removal lock (${option || 'all layers'})`, async () => {
 for (const f of Object.values(await fixtures())) {
  const other = attachment(f, 'a').allScripts()[0]!
  send(f.script, `@remoutfit${option}=n,remoutfit:socks=force`)
  expect(f.avatar.viewer.inventory.wornWearables()).toContain('socks')
  send(other, '@remoutfit:socks=add')
  send(f.script, `@remoutfit${option}=rem,remoutfit:socks=force`)
  expect(f.avatar.viewer.inventory.wornWearables()).toContain('socks')
  send(other, '@clear=remoutfit'); send(f.script, '@remoutfit:socks=force')
  expect(f.avatar.viewer.inventory.wornWearables()).not.toContain('socks')
 }
})

// In-world: lowercase nostrip in an item or its parent protects socks; uppercase
// NOSTRIP does not (Aditi, SLua Tideland, 2026-11-01, Firestorm RLVa 2.4.2).
for (const name of ['nostrip socks', 'NOSTRIP socks']) it(`applies each profile's item-name protection: ${name}`, async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  inv.seed({ sharedRootId: 'root', entries: inv.snapshot().map(e => e.id === 'socks' ? { ...e, name } : e), wornWearables: ['socks'] })
  send(f.script, '@remoutfit:socks=force')
  // Kokua layer removal checks folder protection, rather than the item name.
  expect(inv.wornWearables()).toEqual(profile === 'rlva' && name.startsWith('nostrip') ? ['socks'] : [])
 }
})

it('keeps invalid options and excluded forms inspectable without removing items', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  send(f.script, '@detach:missing=force')
  expect(result(f).outcome).toBe(profile === 'rlva' ? 'failed-option' : 'no-op')
  send(f.script, '@detach:empty=force'); expect(result(f).outcome).toBe('no-op')
  for (const command of ['@detach=force', '@detach:chest=force', '@detach:direct|empty=force', '@detachall:direct=force', '@remoutfit:direct=force']) {
   send(f.script, command); expect(result(f).status).toBe(command === '@detach=force' || command === '@detach:chest=force' ? 'enforced' : 'unsupported')
  }
  send(f.script, '@remoutfit:invalid=force')
  expect(result(f).outcome).toBe(profile === 'rlva' ? 'failed-option' : 'no-op')
  expect(f.avatar.viewer.inventory.wornWearables()).toEqual(['socks', 'shirt', 'skin'])
 }
})

it('leaves disabled viewer commands inert', async () => {
 const world = new World(); world.addRegion('off', { x: 0, y: 0 })
 const avatar = world.addAvatar({ username: 'off', region: 'off' })
 seedRlvInventory(avatar, { sharedRootId: null, entries: [{ id: 's', parentId: null, name: 'Socks', kind: 'item', wearableType: 'socks' }], wornWearables: ['s'] })
 const loaded = await loadLinkset({ world, region: 'off', owner: avatar.key, prims: [{ scripts: [{ name: 'fixture', source: { source } }] }] })
 loaded.scripts.fixture!.start(); send(loaded.scripts.fixture!, '@remoutfit=force,remoutfit=n,addoutfit=n')
 expect(avatar.viewer.inventory.wornWearables()).toEqual(['s']); expect(avatar.viewer.commandLog).toEqual([])
})

// In-world: addoutfit:socks=n denies wearing the probe socks on an empty layer
// (Aditi, SLua Tideland, 2026-11-01, Firestorm RLVa 2.4.2).
for (const option of ['', ':socks']) it(`explicit clothing actions honor ${option || 'global'} add/remove locks`, async () => {
 for (const f of Object.values(await fixtures())) {
  expect(f.attemptWearable('socks', false)).toBe('allowed')
  send(f.script, `@addoutfit${option}=n`)
  expect(f.attemptWearable('socks', true)).toBe('blocked')
  expect(f.avatar.viewer.inventory.wornWearables()).not.toContain('socks')
  send(f.script, `@addoutfit${option}=y`)
  expect(f.attemptWearable('socks', true)).toBe('allowed')
  expect(f.attemptWearable('socks', true)).toBe('no-op')
  send(f.script, `@remoutfit${option}=n`)
  expect(f.attemptWearable('socks', false)).toBe('blocked')
  send(f.script, `@remoutfit${option}=y`)
  expect(f.attemptWearable('socks', false)).toBe('allowed')
  expect(f.attemptWearable('skin', false)).toBe('no-op')
  expect(f.attemptWearable('missing', true)).toBe('no-op')
 }
})

for (const name of ['nostrip folder', 'NOSTRIP folder']) it(`honors parent folder protection: ${name}`, async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  inv.seed({ sharedRootId: 'root', entries: inv.snapshot().map(e => e.id === 'direct' ? { ...e, name } : e.id === 'socks' ? { ...e, parentId: 'direct' } : e), wornWearables: ['socks'] })
  send(f.script, '@remoutfit:socks=force')
  expect(inv.wornWearables()).toEqual(profile === 'rlv' || name.startsWith('nostrip') ? ['socks'] : [])
 }
})

it('folds attachment children according to each profile and keeps ordinary descendants', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  const inv = f.avatar.viewer.inventory; const old = inv.snapshot()
  inv.seed({ sharedRootId: 'root', entries: old.map(e => e.id === 'nested' ? { ...e, name: '.(skull)', folded: true } : e.id === 'c' ? { ...e, modifiable: false } : e), wornAttachments: inv.attachmentMappings() })
  const child = attachment(f, 'c')
  send(f.script, '@detach:direct=force')
  expect(child.attachment).toBeNull()
  expect(result(f).removeResults?.map(r => r.itemId)).toEqual(['a', 'b', 'c'])
  child.attachToAvatar(f.avatar.key, 2)
  inv.seed({ sharedRootId: 'root', entries: inv.snapshot().map(e => e.id === 'c' ? { ...e, modifiable: true } : e), wornAttachments: inv.attachmentMappings() })
  send(f.script, '@detach:direct=force')
  expect(child.attachment?.point ?? 0).toBe(profile === 'rlva' ? 0 : 2)
 }
})

it('reports unsupported direct folder content alongside successful attachments', async () => {
 for (const f of Object.values(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot(), { id: 'note', parentId: 'direct', kind: 'item', name: 'Note' }], wornAttachments: inv.attachmentMappings(), wornWearables: inv.wornWearables() })
  send(f.script, '@detach:direct=force')
  expect(result(f).outcome).toBe('partial')
  expect(result(f).removeResults?.at(-1)).toEqual({ itemId: 'note', outcome: 'unsupported', reason: 'unsupported-content' })
  send(f.script, '@detach:direct=force'); expect(result(f).status).toBe('unsupported')
  expect(f.avatar.viewer.inventory.wornWearables()).toEqual(['socks', 'shirt', 'skin'])
 }
})

it('uses layer selectors ahead of same-named folders and keeps RLVa detach layer options inert', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  inv.seed({ sharedRootId: 'root', entries: inv.snapshot().map(e => e.id === 'direct' ? { ...e, name: 'Socks' } : e), wornAttachments: inv.attachmentMappings(), wornWearables: inv.wornWearables() })
  send(f.script, '@remoutfit:socks=force')
  expect(inv.wornWearables()).not.toContain('socks')
  const object = attachment(f, 'a')
  send(f.script, '@detach:socks=force')
  expect(object.attachment?.point ?? 0).toBe(profile === 'rlva' ? 1 : 0)
  expect(result(f).outcome).toBe(profile === 'rlva' ? 'failed-option' : 'allowed')
 }
})

it('does not let a later lock undo a queued accepted removal', async () => {
 for (const f of Object.values(await fixtures())) {
  send(f.script, '@remoutfit:socks=force,remoutfit:socks=n')
  expect(f.avatar.viewer.inventory.wornWearables()).not.toContain('socks')
  expect(f.avatar.viewer.restrictions.snapshot().map(r => r.rule)).toEqual(['remoutfit:socks'])
 }
})

it('handles unworn layers and absent shared roots without fabricating success', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  send(f.script, '@remoutfit:socks=force'); send(f.script, '@remoutfit:socks=force')
  expect(result(f).outcome).toBe('no-op')
  expect(result(f).removeResults).toEqual([{ itemId: 'socks', outcome: 'not-worn' }])
  send(f.script, '@detach:/=force'); expect(result(f).outcome).toBe(profile === 'rlva' ? 'failed-option' : 'no-op')
  f.avatar.viewer.inventory.seed({ sharedRootId: null, entries: [] })
  send(f.script, '@detach:direct=force'); expect(result(f).outcome).toBe(profile === 'rlva' ? 'failed-option' : 'no-op')
 }
})

it('keeps invalid layer locks unsupported, retaining only Kokua wire state', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  send(f.script, '@remoutfit:invalid=n,addoutfit:socks;shirt=n')
  expect(f.avatar.viewer.commandLog.slice(-2).map(r => r.status)).toEqual(['unsupported', 'unsupported'])
  expect(f.avatar.viewer.restrictions.snapshot().length).toBe(profile === 'rlv' ? 2 : 0)
  expect(f.attemptWearable('socks', false)).toBe('allowed')
  expect(f.attemptWearable('socks', true)).toBe('allowed')
 }
})

it('protects a registered RLVa bridge and preserves Kokua attachment behavior', async () => {
 const { setRlvAttachmentBridge } = await import('@rezless/vm')
 for (const [profile, f] of Object.entries(await fixtures())) {
  const a = attachment(f, 'a'); a.detachFromAvatar(); a.attachToAvatar(f.avatar.key, 31)
  setRlvAttachmentBridge(f.avatar.viewer, a.prims[0]!.key)
  send(f.script, '@detach:direct=force')
  expect(a.attachment?.point ?? 0).toBe(profile === 'rlva' ? 31 : 0)
  expect(result(f).outcome).toBe(profile === 'rlva' ? 'partial' : 'allowed')
 }
})

it('includes folded mapped attachments without an explicit asset type and ignores folded nonobjects', async () => {
 const f = (await fixtures()).rlva
 const inv = f.avatar.viewer.inventory
 const object = attachment(f, 'c')
 inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot().map(e => e.id === 'nested' ? { ...e, folded: true } : e.id === 'c' ? { ...e, assetType: undefined } : e),
  { id: 'note', parentId: 'nested', kind: 'item', name: 'Note' }], wornAttachments: inv.attachmentMappings() })
 send(f.script, '@detach:direct=force')
 expect(object.attachment).toBeNull()
 expect(result(f).removeResults?.map(r => r.itemId)).toEqual(['a', 'b', 'c'])
 expect(Object.isFrozen(result(f).removeResults)).toBe(true)
 expect(Object.isFrozen(result(f).removeResults![0])).toBe(true)
})

it('preserves ordinary nested ancestors for RLVa name protection but checks Kokua ancestors', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  inv.seed({ sharedRootId: 'root', entries: inv.snapshot().map(e => e.id === 'direct' ? { ...e, name: 'nostrip ancestor' } : e.id === 'socks' ? { ...e, parentId: 'nested' } : e), wornWearables: ['socks'] })
  send(f.script, '@remoutfit:socks=force')
  expect(inv.wornWearables()).toEqual(profile === 'rlv' ? ['socks'] : [])
 }
})

it('keeps invalid inventory wearable updates inert and bypasses viewer locks when disabled', async () => {
 const { attemptRlvWearable } = await import('@rezless/vm')
 const world = new World(); world.addRegion('off', { x: 0, y: 0 })
 const avatar = world.addAvatar({ username: 'off', region: 'off' })
 avatar.viewer.inventory.seed({ sharedRootId: null, entries: [{ id: 's', kind: 'item', parentId: null, name: 'Socks', wearableType: 'socks' }] })
 avatar.viewer.inventory.setWearableWorn('missing', true)
 expect(avatar.viewer.inventory.wornWearables()).toEqual([])
 expect(attemptRlvWearable(avatar, 's', true)).toBe('allowed')
 expect(attemptRlvWearable(avatar, 's', false)).toBe('allowed')
 const loaded = await loadLinkset({ world, region: 'off', owner: avatar.key, prims: [{}] })
 const { dispatchForceRemoveCommand } = await import('../../vm/src/rlv/forcewear.js')
 expect(dispatchForceRemoveCommand(loaded.linkset, loaded.linkset.prims[0]!, avatar,
  { behaviour: 'remoutfit', option: '', parameter: 'force', kind: 'force' }, '@remoutfit=force')).toBe(false)
 expect(avatar.viewer.commandLog).toEqual([])
})
