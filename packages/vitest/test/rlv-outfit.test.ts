import { expect, it } from 'vitest'
import { loadRlvPair, seedRlvInventory } from '../src/index.js'

// In-world: getoutfit -> 17 positions; adding jacket/shirt/socks changed only
// those positions. Invalid, pipe, slash, semicolon and spaced selectors -> empty.
// getinvworn -> empty 00, none 10, some 20, all 30; descendants 01/03.
// A worn jacket with an unworn object -> 20; attaching the object -> 30.
// Folded objects count in their parent; slash and comma names remain in listings.
// Firestorm RLVa 2.4.2, API 3.4.3 (Aditi, SLua Tideland, 2026-11-01).
// https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Clothing_and_Attachments
const source = (commands: string[]) => `list replies; default {
  state_entry() { llListen(231101,"",llGetOwner(),"");
  ${commands.map(command => `llOwnerSay("@${command}=231101");`).join('\n')}
  } listen(integer c,string n,key id,string m) { replies += [m]; }
}`

it('answers the outfit bitmap and individual layers from seeded worn items', async () => {
  const pair = await loadRlvPair({ source: source(['getoutfit', 'getoutfit:shirt', 'getoutfit:shape', 'getoutfit:invalid']) })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { avatar, script } = pair[profile]
    seedRlvInventory(avatar, { sharedRootId: null, entries: [
      { id: 'shirt', parentId: null, name: 'Shirt', kind: 'item', wearableType: 'shirt' },
    ], wornWearables: ['shirt'] })
    script.start()
    expect(script.global('replies')).toEqual(['00010000000000000', '1', '0', profile === 'rlv' ? '00010000000000000' : ''])
  }
})

it('answers empty and missing inventory worn queries', async () => {
  const pair = await loadRlvPair({ source: source(['getinvworn', 'getinvworn:missing']) })
  for (const { avatar, script } of Object.values(pair)) {
    seedRlvInventory(avatar, { sharedRootId: 'root', entries: [{ id: 'root', parentId: null, name: '#RLV', kind: 'folder' }] })
    script.start()
    expect(script.global('replies')).toEqual(['|00', ''])
  }
})

const layers = ['gloves', 'jacket', 'pants', 'shirt', 'shoes', 'skirt', 'socks', 'underpants',
  'undershirt', 'skin', 'eyes', 'hair', 'shape', 'alpha', 'tattoo', 'physics', 'universal'] as const

it.each(layers)('uses the reference wire position for %s without implicit bodyparts', async layer => {
  const pair = await loadRlvPair({ source: source(['getoutfit', `getoutfit:${layer}`, 'getoutfit:']) })
  for (const { avatar, script } of Object.values(pair)) {
    seedRlvInventory(avatar, { sharedRootId: null, entries: [
      { id: 'item', parentId: null, name: layer, kind: 'item', wearableType: layer },
    ], wornWearables: ['item'] })
    script.start()
    const bitmap = layers.map(name => name === layer ? '1' : '0').join('')
    expect(script.global('replies')).toEqual([bitmap, '1', bitmap])
  }
})

it('treats invalid and reserved selector characters according to each profile', async () => {
  const options = ['shirt|30', 'shirt/eyes', 'shirt;eyes', ' shirt', 'constructor', '__proto__']
  const pair = await loadRlvPair({ source: source(options.map(option => `getoutfit:${option}`)) })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { script, avatar } = pair[profile]
    script.start()
    expect(script.global('replies')).toEqual(options.map(() => profile === 'rlv' ? '00000000000000000' : ''))
    expect(avatar.viewer.commandLog.map(entry => entry.status)).toEqual(options.map(() => 'replied'))
    if (profile === 'rlva') expect(avatar.viewer.commandLog.every(entry => entry.outcome === 'failed-option')).toBe(true)
  }
})

const folder = (id: string, parentId: string | null, name = id, folded = false) =>
  ({ id, parentId, name, kind: 'folder' as const, folded })
const clothing = (id: string, parentId: string | null, wearableType: typeof layers[number] = 'shirt') =>
  ({ id, parentId, name: id, kind: 'item' as const, wearableType })

it('aggregates none, some and all at direct and descendant levels and ignores ordinary items', async () => {
  const pair = await loadRlvPair({ source: source(['getinvworn:tree', 'getinvworn:tree/empty',
    'getinvworn:tree/none', 'getinvworn:tree/some', 'getinvworn:tree/all', 'getinvworn:tree/deep']) })
  for (const { avatar, script } of Object.values(pair)) {
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null, '#RLV'), folder('tree', 'r'),
      folder('a', 'tree', 'empty'), folder('b', 'tree', 'none'), folder('c', 'tree', 'some'),
      folder('d', 'tree', 'all'), folder('e', 'tree', 'deep'), folder('f', 'e', 'child'), folder('g', 'f', 'grandchild'),
      { id: 'note', parentId: 'a', name: 'Notecard', kind: 'item' },
      clothing('none', 'b'), clothing('some1', 'c'), clothing('some2', 'c'),
      clothing('all', 'd'), clothing('deep', 'g'),
    ], wornWearables: ['some1', 'all', 'deep'] })
    script.start()
    expect(script.global('replies')).toEqual(['|02,empty|00,none|10,some|20,all|30,deep|03', '|00', '|10', '|20', '|30', '|03,child|03'])
  }
})

it('changes replies when wearables or mapped world attachments change, counting both once', async () => {
  const { loadLinkset } = await import('../src/index.js')
  const pair = await loadRlvPair({ source: `list replies; default {
    state_entry() { llListen(231101,"",llGetOwner(),""); }
    touch_start(integer n) { llOwnerSay("@getinvworn:mixed=231101,getoutfit:shirt=231101"); }
    listen(integer c,string n,key id,string m) { replies += [m]; }
  }` })
  for (const { avatar, script, world } of Object.values(pair)) {
    const attachment = await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [{ name: 'mapped attachment' }] })
    const config = { sharedRootId: 'r', entries: [folder('r', null, '#RLV'), folder('mixed', 'r'),
      clothing('shirt', 'mixed'), { id: 'object', parentId: 'mixed', name: 'Object (chest)', kind: 'item' as const, assetType: 'object' as const }],
      wornAttachments: [{ itemId: 'object', rootKey: attachment.linkset.prims[0]!.key }] }
    seedRlvInventory(avatar, config)
    script.start(); script.fire('touch_start', { num_detected: 1 })
    expect(script.global('replies')).toEqual(['|10', '0'])
    attachment.linkset.attachToAvatar(avatar.key, 1)
    script.fire('touch_start', { num_detected: 1 })
    expect((script.global('replies') as string[]).slice(-2)).toEqual(['|20', '0'])
    seedRlvInventory(avatar, { ...config, wornWearables: ['shirt'] })
    script.fire('touch_start', { num_detected: 1 })
    expect((script.global('replies') as string[]).slice(-2)).toEqual(['|30', '1'])
    attachment.linkset.detachFromAvatar()
    script.fire('touch_start', { num_detected: 1 })
    expect((script.global('replies') as string[]).slice(-2)).toEqual(['|20', '1'])
    seedRlvInventory(avatar, config)
    script.fire('touch_start', { num_detected: 1 })
    expect((script.global('replies') as string[]).slice(-2)).toEqual(['|10', '0'])
  }
})

it('validates wearable identities atomically and freezes independent snapshots', async () => {
  const { RlvInventory } = await import('@rezless/vm')
  const entries = [folder('r', null), clothing('shirt', 'r')]
  const wornWearables = ['shirt']
  const inventory = new RlvInventory({ sharedRootId: 'r', entries, wornWearables })
  wornWearables.length = 0
  expect(inventory.wornWearables()).toEqual(['shirt'])
  expect(Object.isFrozen(inventory.wornWearables())).toBe(true)
  for (const config of [
    { entries, wornWearables: ['missing'] }, { entries, wornWearables: ['r'] },
    { entries, wornWearables: ['shirt', 'shirt'] },
    { entries: [folder('r', null), { ...clothing('shirt', 'r'), wearableType: 'invalid' }], wornWearables: ['shirt'] },
    { entries: [folder('r', null), { ...clothing('shirt', 'r'), kind: 'folder' }], wornWearables: [] },
  ]) {
    expect(() => inventory.seed({ sharedRootId: 'r', ...config } as Parameters<typeof inventory.seed>[0])).toThrow()
    expect(inventory.wornWearables()).toEqual(['shirt'])
  }
  inventory.seed({ sharedRootId: null, entries: [] })
  expect(inventory.wornWearables()).toEqual([])
})

// RlvHandler::onGetInvWorn and RlvWearableItemCollector treat the selected folder as the collection root.
it('pins Kokua no-mod sentinels and direct RLVa folded-folder occupancy', async () => {
  const { loadLinkset } = await import('../src/index.js')
  const pair = await loadRlvPair({ source: `list replies; default {
    state_entry() { llListen(231101,"",llGetOwner(),""); }
    touch_start(integer n) { llOwnerSay("@getinvworn:parent=231101,getinvworn:parent/(chest)=231101"); }
    listen(integer c,string n,key id,string m) { replies += [m]; }
  }` })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { avatar, script, world } = pair[profile]
    const attachment = await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [{ name: 'no-mod fixture' }] })
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null, '#RLV'), folder('parent', 'r'),
      folder('folded', 'parent', '(chest)', true),
      { id: 'item', parentId: 'folded', name: 'Object', kind: 'item', assetType: 'object', modifiable: false },
    ], wornAttachments: [{ itemId: 'item', rootKey: attachment.linkset.prims[0]!.key }] })
    script.start(); script.fire('touch_start', { num_detected: 1 })
    expect(script.global('replies')).toEqual(profile === 'rlv' ? ['|11,(chest)|10', '|10'] : ['|10', '|10'])
    attachment.linkset.attachToAvatar(avatar.key, 1)
    script.fire('touch_start', { num_detected: 1 })
    expect((script.global('replies') as string[]).slice(-2)).toEqual(profile === 'rlv' ? ['|33,(chest)|30', '|30'] : ['|30', '|30'])
    expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'replied' })
    expect(avatar.viewer.diagnostics).toEqual([])
  }
})

it('keeps disabled viewers inert and unsupported wear operations inspectable', async () => {
  const { World, loadLinkset } = await import('../src/index.js')
  const world = new World(); world.addRegion('outfit fixture', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'disabled', region: 'outfit fixture', viewer: { profile: 'disabled' } })
  seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null), clothing('shirt', 'r')], wornWearables: ['shirt'] })
  const loaded = await loadLinkset({ world, owner: avatar.key, region: avatar.region,
    prims: [{ scripts: [{ name: 'query', source: { source: source(['getoutfit', 'getinvworn']) } }] }] })
  loaded.scripts.query!.start()
  expect(loaded.scripts.query!.global('replies')).toEqual([])
  expect(avatar.viewer.commandLog).toEqual([])
  const pair = await loadRlvPair({ source: 'list replies; default { state_entry() { llOwnerSay("@getoutfit=n,getinvworn=force"); } }' })
  for (const { avatar, script } of Object.values(pair)) {
    script.start(); expect(script.global('replies')).toEqual([])
    expect(avatar.viewer.commandLog.every(entry => entry.status !== 'replied')).toBe(true)
  }
})

it('preserves profile ordering, wire names and shared-root item policy', async () => {
  const pair = await loadRlvPair({ source: source(['getinvworn', 'getinvworn:.hidden', 'getinvworn:missing']) })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { avatar, script } = pair[profile]
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null, '#RLV'),
      clothing('root-shirt', 'r'), folder('z', 'r', 'Zulu'), folder('a', 'r', 'comma,name'),
      folder('s', 'r', 'slash/name'), folder('h', 'r', '.hidden'), clothing('hidden', 'h'),
      folder('hc', 'h', 'Child'), clothing('hidden-child', 'hc'), folder('e', 'r', '', true),
      { id: 'empty-object', parentId: 'e', name: 'Empty folder object', kind: 'item', assetType: 'object' },
    ], wornWearables: ['root-shirt', 'hidden', 'hidden-child'] })
    script.start()
    expect(script.global('replies')).toEqual(profile === 'rlv'
      ? ['|00,Zulu|00,comma,name|00,slash/name|00', '', '']
      : ['|30,comma,name|00,slash/name|00,Zulu|00', '|33,Child|30', ''])
    if (profile === 'rlva') expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'replied', outcome: 'failed-option' })
  }
})

it('counts effective folded items directly and omits malformed folded collections and hidden subtrees', async () => {
  const pair = await loadRlvPair({ source: source(['getinvworn:parent']) })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { avatar, script } = pair[profile]
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null), folder('parent', 'r'),
      folder('a', 'parent', '(chest)', true),
      { id: 'object', parentId: 'a', name: 'Object', kind: 'item', assetType: 'object' }, clothing('shirt', 'a'),
      folder('b', 'parent', 'Zero objects', true), clothing('ignored-shirt', 'b'),
      folder('c', 'parent', 'Two objects', true),
      { id: 'o1', parentId: 'c', name: 'First', kind: 'item', assetType: 'object' },
      { id: 'o2', parentId: 'c', name: 'Second', kind: 'item', assetType: 'object' },
      folder('d', 'parent', '.hidden'), clothing('hidden', 'd'),
    ], wornWearables: ['shirt', 'ignored-shirt', 'hidden'] })
    script.start()
    expect(script.global('replies')).toEqual(profile === 'rlv'
      ? ['|02,(chest)|20,Zero objects|30,Two objects|10'] : ['|20'])
  }
})

it('handles Kokua hidden no-mod children and root sentinel exclusions', async () => {
  const pair = await loadRlvPair({ source: source(['getinvworn', 'getinvworn:parent']) })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { avatar, script } = pair[profile]
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null),
      folder('a', 'r', '(chest)', true),
      { id: 'root-object', parentId: 'a', name: 'Root no-mod', kind: 'item', assetType: 'object', modifiable: false },
      folder('p', 'r', 'parent'), folder('h', 'p', '.hidden (root)', true),
      { id: 'hidden-object', parentId: 'h', name: 'Hidden no-mod', kind: 'item', assetType: 'object', modifiable: false },
    ] })
    script.start()
    expect(script.global('replies')).toEqual(profile === 'rlv'
      ? ['|01,(chest)|10,parent|11', '|11'] : ['|11,parent|10', '|10'])
  }
})

it('keeps non-avatar and dead attachment mappings unworn and ignores unshared items in folder scores', async () => {
  const { loadLinkset } = await import('../src/index.js')
  const pair = await loadRlvPair({ source: source(['getinvworn:parent', 'getoutfit:shirt']) })
  for (const { avatar, script, world } of Object.values(pair)) {
    const other = world.addAvatar({ username: 'other', region: avatar.region })
    const live = await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [{}] })
    const dead = await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [{}] })
    live.linkset.attachToAvatar(other.key, 1)
    dead.linkset.attachToAvatar(avatar.key, 1); dead.linkset.dead = true
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null), folder('p', 'r', 'parent'),
      { id: 'other', parentId: 'p', name: 'Other avatar', kind: 'item' },
      { id: 'dead', parentId: 'p', name: 'Dead', kind: 'item' }, clothing('unshared', null),
    ], wornWearables: ['unshared'], wornAttachments: [
      { itemId: 'other', rootKey: live.linkset.prims[0]!.key.toUpperCase() },
      { itemId: 'dead', rootKey: dead.linkset.prims[0]!.key },
    ] })
    script.start()
    expect(script.global('replies')).toEqual(['|10', '1'])
  }
})

it('uses query channel policy and only advertises implemented outfit reply forms', async () => {
  const pair = await loadRlvPair({ source: `list replies; default { state_entry() {
    llListen(231101,"",llGetOwner(),""); llListen(-231101,"",llGetOwner(),"");
    llOwnerSay("@getoutfit=0,getoutfit=-231101,getinvworn=-231101,getcommand:getoutfit;reply=231101,getcommand:getinvworn;reply=231101,getoutfit=force,getinvworn=n");
  } listen(integer c,string n,key id,string m) { replies += [m]; } }` })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { avatar, script } = pair[profile]
    script.start()
    expect(script.global('replies')).toEqual(profile === 'rlv' ? ['00000000000000000', ''] : ['getoutfit;getoutfitnames', 'getinvworn'])
    expect(avatar.viewer.commandLog[0]?.status).toBe('unsupported')
    expect(avatar.viewer.commandLog[5]?.status).toBe('unsupported')
    expect(avatar.viewer.commandLog[6]?.status).toBe('unsupported')
  }
})

it('rejects mapping a wearable item as an attachment without replacing the fixture', async () => {
  const { RlvInventory } = await import('@rezless/vm')
  const entries = [folder('r', null), clothing('shirt', 'r')]
  const inventory = new RlvInventory({ sharedRootId: 'r', entries, wornWearables: ['shirt'] })
  expect(() => inventory.seed({ sharedRootId: 'r', entries, wornAttachments: [{ itemId: 'shirt', rootKey: 'root' }] })).toThrow()
  expect(inventory.wornWearables()).toEqual(['shirt'])
})

it.each([
  ['parent nostrip', '(chest)', 'Shirt'],
  ['parent', 'nostrip (chest)', 'Shirt'],
  ['parent', '(chest)', 'nostrip Shirt'],
])('excludes folded nostrip clothing for %s / %s / %s', async (parent, folded, name) => {
  const pair = await loadRlvPair({ source: source(['getinvworn:parent']) })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { avatar, script } = pair[profile]
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null), folder('p', 'r', parent),
      folder('f', 'p', folded, true), { ...clothing('shirt', 'f'), name },
      { id: 'object', parentId: 'f', name: 'Object', kind: 'item', assetType: 'object' },
    ], wornWearables: ['shirt'] })
    script.start()
    expect(script.global('replies')).toEqual(profile === 'rlv' ? [`|02,${folded}|20`] : ['|10'])
  }
})


it('uses a directly selected folded folder as root even without an object item', async () => {
  const pair = await loadRlvPair({ source: source(['getinvworn:parent', 'getinvworn:parent/(chest)']) })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { avatar, script } = pair[profile]
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null), folder('p', 'r', 'parent'),
      folder('f', 'p', '(chest)', true), clothing('shirt', 'f'),
    ], wornWearables: ['shirt'] })
    script.start()
    expect(script.global('replies')).toEqual(profile === 'rlv' ? ['|03,(chest)|30', '|30'] : ['|00', '|30'])
  }
})

it('retains direct folded-root clothing and child scores while filtering folded-child nostrip ancestry', async () => {
  const pair = await loadRlvPair({ source: source(['getinvworn:parent', 'getinvworn:parent/(chest)']) })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { avatar, script } = pair[profile]
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null), folder('p', 'r', 'parent nostrip'),
      folder('f', 'p', '(chest)', true), { ...clothing('shirt', 'f'), name: 'nostrip Shirt' },
      { id: 'object', parentId: 'f', name: 'Object', kind: 'item', assetType: 'object' },
      folder('c', 'f', 'Child'), clothing('child-shirt', 'c'), folder('g', 'f', '(spine)', true),
      clothing('folded-shirt', 'g'), { id: 'nested-object', parentId: 'g', name: 'Nested object', kind: 'item', assetType: 'object' },
    ], wornWearables: ['shirt', 'child-shirt', 'folded-shirt'] })
    script.start()
    expect(script.global('replies')).toEqual(profile === 'rlv'
      ? ['|02,(chest)|22', '|22,Child|30,(spine)|20'] : ['|10', '|23,Child|30'])
  }
})
