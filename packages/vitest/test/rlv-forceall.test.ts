import { expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, seedRlvInventory } from '../src/index.js'

const source = `list replies; default {
 state_entry() { llListen(773279,"",NULL_KEY,""); }
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
   { id: 'child', parentId: 'base', kind: 'folder', name: 'Child' },
   { id: 'deep', parentId: 'child', kind: 'folder', name: 'Deep' },
   { id: 'hidden', parentId: 'base', kind: 'folder', name: '.Hidden' },
   { id: 'fold', parentId: 'base', kind: 'folder', name: '.(skull)', folded: true },
   { id: 'foldchild', parentId: 'fold', kind: 'folder', name: 'Inside folded' },
   { id: 'a', parentId: 'base', kind: 'item', name: 'A (chest)', assetType: 'object', object },
   { id: 'b', parentId: 'child', kind: 'item', name: 'B (left hand)', assetType: 'object', object },
   { id: 'c', parentId: 'deep', kind: 'item', name: 'C (right foot)', assetType: 'object', object },
   { id: 'd', parentId: 'hidden', kind: 'item', name: 'Hidden (left foot)', assetType: 'object', object },
   { id: 'e', parentId: 'fold', kind: 'item', name: 'No mod', assetType: 'object', modifiable: false, object },
   { id: 'f', parentId: 'foldchild', kind: 'item', name: 'Below folded (pelvis)', assetType: 'object', object },
  ] })
  f.script.start()
 }
 return pair
}
type Fixture = Awaited<ReturnType<typeof fixtures>>['rlv']
function send(f: Fixture, command: string) {
 f.script.host.description = command; f.script.fire('touch_start', { num_detected: 1 })
}
function worn(f: Fixture) {
 return f.world.linksets.filter(l => l.attachment).map(l => f.avatar.viewer.inventory.attachmentItem(l.prims[0]!.key)!.id).sort()
}
function result(f: Fixture) { return f.avatar.viewer.commandLog.at(-1)! }

// Kokua RLV 2.09.35.00: RRInterface::forceAttach.
// Firestorm RLVa 2.4.2: RlvWearableItemCollector::onCollectFolder.
for (const command of ['attachall', 'attachallover', 'attachalloverorreplace', 'addoutfitall', 'addoutfitallover']) {
 it(`${command} walks visible descendants and folded objects, excluding hidden trees`, async () => {
  for (const f of Object.values(await fixtures())) {
   send(f, `@${command}:base=force`)
   expect(worn(f)).toEqual(['a', 'b', 'c', 'e'])
   expect(result(f).wearResults?.map(r => r.itemId).sort()).toEqual(['a', 'b', 'c', 'e'])
   expect(result(f)).toMatchObject({ status: 'enforced', outcome: 'allowed' })
   send(f, '@getattach:skull=773279')
   expect(f.script.global('replies')).toEqual(['1'])
  }
 })
}
it('keeps the Kokua-only addoutfitalloverorreplace alias unsupported in RLVa', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  send(f, '@addoutfitalloverorreplace:base=force')
  expect(worn(f)).toEqual(profile === 'rlv' ? ['a', 'b', 'c', 'e'] : [])
  expect(result(f).status).toBe(profile === 'rlv' ? 'enforced' : 'unsupported')
 }
})
it('recursive removal includes hidden descendants only in Kokua', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  for (const entry of inv.snapshot().filter(e => e.kind === 'item')) {
   const object = entry.object!.copy({ world: f.world, region: f.avatar.region, owner: f.avatar.key })
   object.attachToAvatar(f.avatar.key, 1); inv.rememberAttachment(entry.id, object)
  }
  send(f, '@detachall:base=force')
  expect(worn(f)).toEqual(profile === 'rlv' ? [] : ['d', 'f'])
  expect(result(f).outcome).toBe('allowed')
  send(f, '@getinvworn:base=773279')
  expect(f.script.global('replies')).toEqual(['|11,Child|11'])
 }
})
it('remoutfit folder forms remove objects and clothing but preserve bodyparts and ordinary descendants', async () => {
 for (const f of Object.values(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot(),
   { id: 'shirt', parentId: 'base', kind: 'item', name: 'Shirt', wearableType: 'shirt' },
   { id: 'skin', parentId: 'base', kind: 'item', name: 'Skin', wearableType: 'skin' },
   { id: 'socks', parentId: 'child', kind: 'item', name: 'Socks', wearableType: 'socks' },
  ], wornWearables: ['shirt', 'skin', 'socks'] })
  send(f, '@attachall:base=force')
  send(f, '@remoutfit:base=force')
  expect(worn(f)).toEqual(['b', 'c'])
  expect(inv.wornWearables()).toEqual(['skin', 'socks'])
  expect(result(f).removeResults).toContainEqual({ itemId: 'shirt', outcome: 'removed' })
  send(f, '@detachall:base=force')
  expect(inv.wornWearables()).toEqual(['skin'])
 }
})
it('recursive clothing wear honors add and remove layer locks and adds subsequent RLVa layers', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot(),
   { id: 'shirt1', parentId: 'base', kind: 'item', name: 'Shirt 1', wearableType: 'shirt' },
   { id: 'shirt2', parentId: 'child', kind: 'item', name: 'Shirt 2', wearableType: 'shirt' },
   { id: 'old', parentId: null, kind: 'item', name: 'Old shirt', wearableType: 'shirt' },
  ], wornWearables: ['old'] })
  send(f, '@addoutfit:shirt=n,attachall:base=force')
  expect(inv.wornWearables()).toEqual(profile === 'rlv' ? [] : ['old'])
  expect(result(f).wearResults).toContainEqual({ itemId: 'shirt1', outcome: 'blocked', reason: 'layer-lock' })
  send(f, '@addoutfit:shirt=y,remoutfit:shirt=n,attachall:base=force')
  expect(inv.wornWearables()).toEqual(profile === 'rlv' ? ['shirt1', 'shirt2'] : ['old'])
  send(f, '@remoutfit:shirt=y,attachall:base=force')
  expect([...inv.wornWearables()].sort()).toEqual(['shirt1', 'shirt2'])
 }
})
it('pipe text is a Kokua path annotation rather than a second folder', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  send(f, '@attachall:base|child=force')
  expect(worn(f)).toEqual(profile === 'rlv' ? ['a', 'b', 'c', 'e'] : [])
  expect(result(f).outcome).toBe(profile === 'rlv' ? 'allowed' : 'failed-option')
 }
})
it('does not split semicolon options into multiple folders', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  send(f, '@attachall:base;child=force')
  expect(worn(f)).toEqual([])
  expect(result(f).outcome).toBe(profile === 'rlv' ? 'no-op' : 'failed-option')
 }
})

it('honors per-folder add prefixes and RLVa inherited actions', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  inv.seed({ sharedRootId: 'root', entries: inv.snapshot().map(e => e.id === 'base' ? { ...e, name: '+Base' }
   : e.kind === 'item' ? { ...e, name: e.id === 'e' ? e.name : 'Same (chest)' } : e) })
  send(f, '@attachall:+base=force')
  expect(worn(f)).toEqual(profile === 'rlv' ? ['c', 'e'] : ['a', 'b', 'c', 'e'])
 }
})
it('recursive add and replace resolve same-point collisions across folders', async () => {
 for (const command of ['attachall', 'attachallover']) {
  for (const [profile, f] of Object.entries(await fixtures())) {
   const inv = f.avatar.viewer.inventory
   inv.seed({ sharedRootId: 'root', entries: inv.snapshot().map(e => e.kind === 'item' ? { ...e, name: 'Same (chest)' } : e) })
   send(f, `@${command}:base=force`)
   expect(worn(f)).toEqual(command.endsWith('over') ? ['a', 'b', 'c', 'e'] : profile === 'rlv' ? ['c', 'e'] : ['a', 'e'])
   if (command === 'attachall' && profile === 'rlva') expect(result(f).wearResults).toContainEqual({ itemId: 'c', outcome: 'skipped', point: 1, reason: 'superseded' })
  }
 }
})
it('recursive removal reports lock and nostrip denials alongside successful removals', async () => {
 for (const f of Object.values(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot().map(e => e.id === 'c' ? { ...e, name: 'nostrip C (right foot)' } : e),
   { id: 'shirt', parentId: 'child', kind: 'item', name: 'Shirt', wearableType: 'shirt' },
  ], wornWearables: ['shirt'] })
  send(f, '@attachall:base=force,remattach:left hand=n,remoutfit:shirt=n,detachall:base=force')
  expect(worn(f)).toEqual(['b', 'c'])
  expect(inv.wornWearables()).toEqual(['shirt'])
  expect(result(f)).toMatchObject({ outcome: 'partial', removeResults: expect.arrayContaining([
   { itemId: 'b', outcome: 'blocked', reason: 'detach-lock' },
   { itemId: 'c', outcome: 'blocked', reason: 'nostrip' },
   { itemId: 'shirt', outcome: 'blocked', reason: 'layer-lock' },
  ]) })
  send(f, '@remattach:left hand=y,remoutfit:shirt=y,detachall:base=force')
  expect(worn(f)).toEqual(['c']); expect(inv.wornWearables()).toEqual([])
 }
})
it('recursive shared-wear settings preserve named items while skipping unnamed RLVa objects', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  inv.seed({ sharedRootId: 'root', sharedWear: false, entries: inv.snapshot().map(e => e.id === 'b' ? { ...e, name: 'Unnamed' } : e) })
  send(f, '@attachall:base=force')
  expect(worn(f)).toEqual(profile === 'rlv' ? ['a', 'b', 'c', 'e'] : ['a', 'c', 'e'])
  if (profile === 'rlva') expect(result(f).wearResults).toContainEqual({ itemId: 'b', outcome: 'skipped', reason: 'shared-wear-disabled' })
 }
})
it('RLVa excludes clothing from folded removal while Kokua recursive removal includes it', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot(),
   { id: 'shirt', parentId: 'fold', kind: 'item', name: 'Shirt', wearableType: 'shirt' },
  ], wornWearables: ['shirt'] })
  send(f, '@detachall:base=force')
  expect(inv.wornWearables()).toEqual(profile === 'rlv' ? [] : ['shirt'])
 }
})
it('does not wear protected clothing from an RLVa folded folder', async () => {
 const f = (await fixtures()).rlva; const inv = f.avatar.viewer.inventory
 inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot(),
  { id: 'shirt', parentId: 'fold', kind: 'item', name: 'nostrip Shirt', wearableType: 'shirt' },
 ] })
 send(f, '@attachall:base=force')
 expect(inv.wornWearables()).toEqual([])
})

it('RLVa empty locked layers can accept the first replacement and subsequent adds', async () => {
 const f = (await fixtures()).rlva; const inv = f.avatar.viewer.inventory
 inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot(),
  { id: 'shirt1', parentId: 'base', kind: 'item', name: 'Shirt 1', wearableType: 'shirt' },
  { id: 'shirt2', parentId: 'child', kind: 'item', name: 'Shirt 2', wearableType: 'shirt' },
 ] })
 send(f, '@remoutfit:shirt=n,attachall:base=force')
 expect([...inv.wornWearables()].sort()).toEqual(['shirt1', 'shirt2'])
})

it('RLVa selector precedence rejects point-named folders for recursive wear and remoutfit', async () => {
 for (const command of ['attachall', 'remoutfit']) {
  for (const [profile, f] of Object.entries(await fixtures())) {
   const inv = f.avatar.viewer.inventory
   inv.seed({ sharedRootId: 'root', entries: inv.snapshot().map(e => e.id === 'base' ? { ...e, name: 'Chest' } : e) })
   send(f, `@${command}:chest=force`)
   expect(result(f).outcome).toBe(profile === 'rlv' ? command === 'attachall' ? 'allowed' : 'no-op' : 'failed-option')
   expect(worn(f)).toEqual(profile === 'rlv' && command === 'attachall' ? ['a', 'b', 'c', 'e'] : [])
  }
 }
})

// Firestorm RLVa 2.4.2: RlvForceWear::addWearable -> forceRemove.
// Kokua RLV 2.09.35.00: LLAppearanceMgr::removeCOFItemLinks -> RRInterface::canDetach.
for (const command of ['attach', 'attachall', 'attachalloverorreplace', 'addoutfitall']) {
 for (const name of ['nostrip Shirt', 'NOSTRIP Shirt']) it(`${command} preserves profile-protected clothing during replacement: ${name}`, async () => {
  for (const [profile, f] of Object.entries(await fixtures())) {
   const inv = f.avatar.viewer.inventory
   inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot(),
    { id: 'shirt', parentId: 'base', kind: 'item', name: 'New shirt', wearableType: 'shirt' },
    { id: 'old', parentId: null, kind: 'item', name, wearableType: 'shirt' },
   ], wornWearables: ['old'] })
   send(f, `@${command}:base=force`)
   expect(inv.wornWearables()).toEqual(profile === 'rlv' || name.startsWith('nostrip') ? ['old', 'shirt'] : ['shirt'])
   expect(result(f).wearResults).toContainEqual({ itemId: 'shirt', outcome: 'worn' })
  }
 })
}

it('Kokua replaces only the top clothing item while RLVa replaces every strippable occupant', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot(),
   { id: 'new', parentId: 'base', kind: 'item', name: 'New shirt', wearableType: 'shirt' },
   { id: 'old1', parentId: null, kind: 'item', name: 'First shirt', wearableType: 'shirt' },
   { id: 'old2', parentId: null, kind: 'item', name: 'Top shirt', wearableType: 'shirt' },
  ], wornWearables: ['old1', 'old2'] })
  send(f, '@attachall:base=force')
  expect(inv.wornWearables()).toEqual(profile === 'rlv' ? ['old1', 'new'] : ['new'])
 }
})
it('Kokua can add a replacement while a layer removal lock preserves its occupant', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot(),
   { id: 'new', parentId: 'base', kind: 'item', name: 'New shirt', wearableType: 'shirt' },
   { id: 'old', parentId: null, kind: 'item', name: 'Old shirt', wearableType: 'shirt' },
  ], wornWearables: ['old'] })
  send(f, '@remoutfit:shirt=n,attachall:base=force')
  expect(inv.wornWearables()).toEqual(profile === 'rlv' ? ['old', 'new'] : ['old'])
 }
})

it('Kokua checks replacement removal before the add lock while RLVa denies the whole wear', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot(),
   { id: 'new', parentId: 'base', kind: 'item', name: 'New shirt', wearableType: 'shirt' },
   { id: 'old', parentId: null, kind: 'item', name: 'Old shirt', wearableType: 'shirt' },
  ], wornWearables: ['old'] })
  send(f, '@addoutfit:shirt=n,attachall:base=force')
  expect(inv.wornWearables()).toEqual(profile === 'rlv' ? [] : ['old'])
  expect(result(f).wearResults).toContainEqual({ itemId: 'new', outcome: 'blocked', reason: 'layer-lock' })
 }
})

it('RLVa denied queued replacement cannot enable a later add on that layer', async () => {
 const f = (await fixtures()).rlva; const inv = f.avatar.viewer.inventory
 inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot(),
  { id: 'first', parentId: 'base', kind: 'item', name: 'First shirt', wearableType: 'shirt' },
  { id: 'later1', parentId: 'child', kind: 'item', name: 'Later shirt 1', wearableType: 'shirt' },
  { id: 'later2', parentId: 'child', kind: 'item', name: 'Later shirt 2', wearableType: 'shirt' },
 ] })
 send(f, '@remoutfit:shirt=n,attach:base=force,attachall:base/child=force')
 expect(inv.wornWearables()).toEqual(['first'])
 expect(result(f).wearResults).toEqual(expect.arrayContaining([
  { itemId: 'later1', outcome: 'blocked', reason: 'layer-lock' },
  { itemId: 'later2', outcome: 'blocked', reason: 'layer-lock' },
 ]))
})

// Firestorm RLVa 2.4.2: LLWearableData::canAddWearable limits physics to one item.
// Kokua RLV 2.09.35.00 uses the ordinary clothing capacity for physics.
for (const locked of [false, true]) it(`physics add follows profile occupancy and removal locks: ${locked}`, async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot(),
   { id: 'new', parentId: 'base', kind: 'item', name: 'New physics', wearableType: 'physics' },
   { id: 'old', parentId: null, kind: 'item', name: 'Old physics', wearableType: 'physics' },
  ], wornWearables: ['old'] })
  if (locked) send(f, '@remoutfit:physics=n')
  send(f, '@attachallover:base=force')
  expect(inv.wornWearables()).toEqual(profile === 'rlv' ? ['old', 'new'] : locked ? ['old'] : ['new'])
  expect(result(f).wearResults).toContainEqual(profile === 'rlva' && locked
   ? { itemId: 'new', outcome: 'blocked', reason: 'layer-lock' } : { itemId: 'new', outcome: 'worn' })
 }
})
it('RLVa physics automatic slot replacement differs from ordinary nostrip clothing', async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot(),
   { id: 'new', parentId: 'base', kind: 'item', name: 'New physics', wearableType: 'physics' },
   { id: 'old', parentId: null, kind: 'item', name: 'nostrip physics', wearableType: 'physics' },
  ], wornWearables: ['old'] })
  send(f, '@attachallover:base=force')
  expect(inv.wornWearables()).toEqual(profile === 'rlv' ? ['old', 'new'] : ['new'])
 }
})

for (const locked of [false, true]) it(`clothing capacity constrains queued adds without denying a replacement: ${locked}`, async () => {
 for (const [profile, f] of Object.entries(await fixtures())) {
  const inv = f.avatar.viewer.inventory
  const old = Array.from({ length: 60 }, (_, n) => ({ id: `old${n}`, parentId: null, kind: 'item' as const, name: `Shirt ${n}`, wearableType: 'shirt' as const }))
  inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot(), ...old,
   { id: 'new', parentId: 'base', kind: 'item', name: 'New shirt', wearableType: 'shirt' },
  ], wornWearables: old.map(e => e.id) })
  if (locked) send(f, '@remoutfit:shirt=n')
  send(f, '@attachallover:base=force')
  expect(inv.wornWearables()).toHaveLength(60)
  expect(inv.wornWearables().includes('new')).toBe(!locked)
  if (locked) expect(result(f).wearResults).toContainEqual({ itemId: 'new', outcome: 'blocked', reason: profile === 'rlva' ? 'layer-lock' : 'clothing-capacity' })
  else expect(inv.wornWearables()).not.toContain('old59')
 }
})
it('capacity counts clothing accepted earlier in the same queued folder operation', async () => {
 const f = (await fixtures()).rlva; const inv = f.avatar.viewer.inventory
 const old = Array.from({ length: 59 }, (_, n) => ({ id: `old${n}`, parentId: null, kind: 'item' as const, name: `Shirt ${n}`, wearableType: 'shirt' as const }))
 inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot(), ...old,
  { id: 'new1', parentId: 'base', kind: 'item', name: 'New shirt 1', wearableType: 'shirt' },
  { id: 'new2', parentId: 'base', kind: 'item', name: 'New shirt 2', wearableType: 'shirt' },
 ], wornWearables: old.map(e => e.id) })
 send(f, '@remoutfit:shirt=n,attachallover:base=force')
 expect(inv.wornWearables()).toHaveLength(60)
 expect(inv.wornWearables()).toContain('new1'); expect(inv.wornWearables()).not.toContain('new2')
 expect(result(f).wearResults).toContainEqual({ itemId: 'new2', outcome: 'blocked', reason: 'layer-lock' })
})
