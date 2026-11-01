import { describe, expect, it } from 'vitest'
import { loadRlvPair, seedRlvInventory } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Clothing_and_Attachments_(Shared_Folders)
// In-world: issue-229 getinv batch -> Zulu,Alpha,Nested,Empty,comma,name,Dup,Dup
// in creation order. Nested -> Child; Empty and missing -> empty messages;
// .hidden -> Hidden child; Dup -> First; repeated slashes -> Child; Nest -> Child.
// slash/name and Nested|30 -> empty messages. Adding Nest -> Exact then querying
// nest -> Exact, ahead of the earlier partial Nested match. Root includes the
// containing folder. Legacy (chest), slash/name and .hidden are omitted from listings.
// Firestorm RLVa 2.4.2, API 3.4.3, viewer 7.2.5.81978
// (Aditi, SLua Tideland, 2026-11-01).
// Kokua RLV 2.09.35.00 uses longest path-span matching, last exact duplicate,
// pipe suffix stripping and hidden-folder exclusion.
const source = (paths: string[]) => `list replies; default {
  state_entry() { llListen(229101,"",llGetOwner(),"");
    ${paths.map(path => `llOwnerSay("@getinv${path}=229101");`).join('\n')}
  }
  listen(integer c,string n,key id,string m) { replies += [m]; }
}`
const folder = (id: string, parentId: string | null, name: string, folded = false) => ({ id, parentId, name, kind: 'folder' as const, folded })

describe('paired getinv queries', () => {
  it('answers absent roots, empty folders and missing paths with queued empty replies', async () => {
    const pair = await loadRlvPair({ source: source(['', ':', ':absent']) })
    for (const { script } of Object.values(pair)) {
      script.start()
      expect(script.global('replies')).toEqual(['', '', ''])
    }
  })

  it('lists direct folders in fixture order, preserving names, commas and duplicates', async () => {
    const pair = await loadRlvPair({ source: source(['', ':nested', ':EMPTY', ':missing']) })
    for (const { script, avatar } of Object.values(pair)) {
      seedRlvInventory(avatar, { sharedRootId: 'root', entries: [
        folder('outside', null, 'Ordinary'), folder('root', null, '#RLV'),
        folder('z', 'root', 'Zulu'), folder('a', 'root', 'Alpha'), folder('h', 'root', '.hidden'),
        folder('n', 'root', 'Nested'), folder('e', 'root', 'Empty'),
        folder('c', 'root', 'comma,name'), folder('d1', 'root', 'Dup'), folder('d2', 'root', 'Dup'),
        folder('child', 'n', 'Child'), folder('private', 'outside', 'Private'),
        { id: 'item', parentId: 'root', name: 'Not a folder', kind: 'item' },
      ] })
      script.start()
      expect(script.global('replies')).toEqual(['Zulu,Alpha,Nested,Empty,comma,name,Dup,Dup', 'Child', '', ''])
      expect(avatar.viewer.commandLog.map(e => e.status)).toEqual(['replied', 'replied', 'replied', 'replied'])
    }
  })

  it('keeps profile differences in hidden lookup, slash names, folded folders and duplicate resolution explicit', async () => {
    const pair = await loadRlvPair({ source: source(['', ':.hidden', ':dup', ':long/path', ':nested|30']) })
    for (const profile of ['rlv', 'rlva'] as const) {
      const { script, avatar } = pair[profile]
      seedRlvInventory(avatar, { sharedRootId: 'root', entries: [
        folder('root', null, '#RLV'), folder('h', 'root', '.hidden'), folder('hc', 'h', 'Hidden child'),
        folder('f', 'root', 'legacy (chest)', true), folder('slash', 'root', 'long/path'),
        folder('sc', 'slash', 'Slash child'), folder('d1', 'root', 'Dup'), folder('d2', 'root', 'Dup'),
        folder('dc1', 'd1', 'First'), folder('dc2', 'd2', 'Last'),
        folder('n', 'root', 'Nested'), folder('nc', 'n', 'Nested child'),
      ] })
      script.start()
      expect(script.global('replies')).toEqual(profile === 'rlv'
        ? ['legacy (chest),long/path,Dup,Dup,Nested', '', 'Last', 'Slash child', 'Nested child']
        : ['Dup,Dup,Nested', 'Hidden child', 'First', '', ''])
    }
  })
})

it('keeps avatar inventories isolated, snapshots immutable, and ordinary inventory unreachable', async () => {
  const { World, loadLinkset } = await import('../src/index.js')
  const world = new World()
  world.addRegion('inventory fixture', { x: 0, y: 0 })
  for (const profile of ['rlv', 'rlva', 'disabled'] as const) {
    for (const suffix of ['One', 'Two']) {
      const avatar = world.addAvatar({ username: `${profile}.${suffix}`, region: 'inventory fixture', viewer: { profile } })
      const entries = [folder('root', null, '#RLV'), folder('same', 'root', 'Same'),
        folder('child', 'same', suffix), folder('private', null, 'Private'), folder('secret', 'private', 'Secret')]
      seedRlvInventory(avatar, { sharedRootId: 'root', entries })
      entries[2]!.name = 'mutated'
      const loaded = await loadLinkset({ world, owner: avatar.key, region: avatar.region,
        prims: [{ scripts: [{ name: 'inventory', source: { source: source([':same', ':private', ':../private']) } }] }] })
      const script = loaded.scripts.inventory!
      script.start()
      expect(script.global('replies')).toEqual(profile === 'disabled' ? [] : [suffix, '', ''])
      expect(Object.isFrozen(avatar.viewer.inventory.snapshot())).toBe(true)
      expect(Object.isFrozen(avatar.viewer.inventory.snapshot()[0])).toBe(true)
    }
  }
})

it('rejects unsupported forms and uses existing profile channel policy', async () => {
  const pair = await loadRlvPair({ source: `list replies; default {
    state_entry() { llListen(229101,"",llGetOwner(),""); llListen(-229101,"",llGetOwner(),"");
      llOwnerSay("@getinv=0,getinv=-229101,getinv=n,getinv=force,getinvworn=229101,getinv=229101"); }
    listen(integer c,string n,key id,string m) { replies += [m]; }
  }` })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { script, avatar } = pair[profile]
    script.start()
    expect(script.global('replies')).toEqual(profile === 'rlv' ? ['', ''] : [''])
    expect(avatar.viewer.commandLog[4]!.status).toBe('unsupported')
  }
})

it('validates trees atomically and accepts an explicit absent root', async () => {
  const { RlvInventory } = await import('@rezless/vm')
  const inventory = new RlvInventory({ sharedRootId: 'root', entries: [folder('root', null, '#RLV')] })
  for (const entries of [
    [folder('root', null, '#RLV'), folder('root', null, 'duplicate')],
    [folder('', null, 'empty ID')],
    [folder('root', 'missing', '#RLV')],
    [folder('root', 'item', '#RLV'), { id: 'item', parentId: null, name: 'Item', kind: 'item' as const }],
    [folder('root', 'root', '#RLV')],
    [folder('root', null, '#RLV'), folder('a', 'b', 'A'), folder('b', 'a', 'B')],
    [],
  ]) {
    expect(() => inventory.seed({ sharedRootId: 'root', entries })).toThrow()
    expect(inventory.sharedRootId).toBe('root')
    expect(inventory.snapshot()).toEqual([folder('root', null, '#RLV')])
  }
  inventory.seed({ sharedRootId: null, entries: [folder('ordinary', null, '#RLV')] })
  expect(inventory.sharedRootId).toBe(null)
})

it('uses partial case-insensitive matches with exact-name priority and skips empty path segments', async () => {
  const pair = await loadRlvPair({ source: source([':nest', ':nEsTeD', ':nested//child/', ':////', ':empty']) })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { avatar, script } = pair[profile]
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [
      folder('r', null, '#RLV'), folder('partial', 'r', 'Nested extended'),
      folder('wrong', 'partial', 'Wrong'), folder('n', 'r', 'Nested'),
      folder('c', 'n', 'Child'), folder('g', 'c', 'Grandchild'),
      folder('e', 'r', ''), folder('empty', 'r', 'Empty'),
    ] })
    script.start()
    expect(script.global('replies')).toEqual(['Wrong', 'Child', 'Grandchild', profile === 'rlv' ? '' : 'Nested extended,Nested,Empty', ''])
  }
})

it('queues replies until yielding and does not turn inventory offers into shared folders', async () => {
  const pair = await loadRlvPair({ source: `list replies; integer before; integer after; default {
    state_entry() { llListen(229101,"",llGetOwner(),""); before=llGetListLength(replies);
      llGiveInventoryList(llGetOwner(),"#RLV/Offered",[llGetScriptName()]);
      llOwnerSay("@getinv=229101"); after=llGetListLength(replies); }
    listen(integer c,string n,key id,string m) { replies += [m]; }
  }` })
  for (const { avatar, script } of Object.values(pair)) {
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null, '#RLV'), folder('f', 'r', 'Seeded')] })
    script.start()
    expect(script.global('before')).toBe(0)
    expect(script.global('after')).toBe(0)
    expect(script.global('replies')).toEqual(['Seeded'])
    expect(script.inventoryOffers).toHaveLength(1)
    expect(script.inventoryOffers[0]!.folder).toBe('#RLV/Offered')
    expect(avatar.viewer.inventory.snapshot().map(entry => entry.id)).toEqual(['r', 'f'])
  }
})


it('seeds through viewer configuration and exposes the same untruncated default-root result', async () => {
  const { World, getRlvInventoryList } = await import('../src/index.js')
  const world = new World()
  world.addRegion('configured inventory', { x: 0, y: 0 })
  const entries = [folder('r', null, '#RLV'), folder('c', 'r', 'Configured')]
  const avatar = world.addAvatar({ username: 'configured', region: 'configured inventory',
    viewer: { profile: 'rlva', inventory: { sharedRootId: 'r', entries } } })
  entries[1]!.name = 'Changed'
  expect(getRlvInventoryList('rlva', avatar.viewer.inventory)).toBe('Configured')
  seedRlvInventory(avatar, { sharedRootId: null, entries })
  expect(getRlvInventoryList('rlva', avatar.viewer.inventory)).toBe('')
})

it('prefers the longest Kokua path span over a nested exact segment', async () => {
  const pair = await loadRlvPair({ source: source([':long/path']) })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { avatar, script } = pair[profile]
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [
      folder('r', null, '#RLV'), folder('slash', 'r', 'long/path'),
      folder('long', 'r', 'long'), folder('nested', 'long', 'path'),
      folder('s', 'slash', 'Slash child'), folder('n', 'nested', 'Nested child'),
    ] })
    script.start()
    expect(script.global('replies')).toEqual(profile === 'rlv' ? ['Slash child'] : ['Nested child'])
  }
})
