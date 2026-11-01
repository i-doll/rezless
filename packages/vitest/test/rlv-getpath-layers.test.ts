import { expect, it } from 'vitest'
import { loadRlvPair, seedRlvInventory } from '../src/index.js'

// Kokua RLV 2.09.35.00: RRInterface::getFullPath and getOutfitLayerAsType.
// Firestorm RLVa 2.4.2: RlvCommandOptionGetPath::getItemIDs,
// RlvInventory::getPath and RlvHandler::onGetPath.
const source = (options: string[]) => `list replies; default {
  state_entry() { llListen(302101,"",llGetOwner(),""); }
  touch_start(integer n) {
    ${options.flatMap(option => ['getpath', 'getpathnew'].map(command =>
      `llOwnerSay("@${command}:${option}=302101");`)).join('\n')}
  }
  listen(integer c,string n,key id,string m) { replies += [m]; }
}`
const folder = (id: string, parentId: string | null, name = id, folded = false) =>
  ({ id, parentId, name, kind: 'folder' as const, folded })
const clothing = (id: string, parentId: string | null, wearableType: 'shirt' | 'pants' = 'shirt') =>
  ({ id, parentId, name: 'Same item name', kind: 'item' as const, wearableType })

it('lists worn layer paths in worn item order, preserving duplicate folders', async () => {
  const pair = await loadRlvPair({ source: source(['shirt', 'pants']) })
  for (const { avatar, script } of Object.values(pair)) {
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null, '#RLV'),
      folder('a', 'r', 'Alpha'), folder('z', 'r', 'Zulu'), folder('n', 'z', 'Nested'),
      clothing('a1', 'a'), clothing('a2', 'a'), clothing('z1', 'n'), clothing('unworn', 'z'),
      clothing('pants', 'z', 'pants')], wornWearables: ['z1', 'a2', 'pants', 'a1'] })
    script.start(); script.fire('touch_start', { num_detected: 1 })
    expect(script.global('replies')).toEqual(['Zulu/Nested', 'Zulu/Nested,Alpha,Alpha', 'Zulu', 'Zulu'])
    expect(avatar.viewer.commandLog.map(entry => entry.status)).toEqual(['replied', 'replied', 'replied', 'replied'])
  }
})

it('skips unshared clothing before selecting the first path and preserves comma names', async () => {
  const pair = await loadRlvPair({ source: source(['shirt']) })
  for (const { avatar, script } of Object.values(pair)) {
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null, '#RLV'),
      folder('outside', null, 'Private'), folder('shared', 'r', 'A,B'),
      clothing('private', 'outside'), clothing('shared1', 'shared'), clothing('shared2', 'shared')],
    wornWearables: ['private', 'shared1', 'shared2'] })
    script.start(); script.fire('touch_start', { num_detected: 1 })
    expect(script.global('replies')).toEqual(['A,B', 'A,B,A,B'])
  }
})

it('keeps profile-specific folded paths and empty shared-root positions', async () => {
  const pair = await loadRlvPair({ source: source(['shirt', 'pants']) })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { avatar, script } = pair[profile]
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null, '#RLV'),
      folder('a', 'r', 'Alpha'), folder('f', 'a', '.(folded)', true),
      clothing('root', 'r'), clothing('folded', 'f'), clothing('end', 'r'),
      clothing('firstPants', 'f', 'pants'), clothing('lastPants', 'r', 'pants')],
    wornWearables: ['root', 'folded', 'end', 'firstPants', 'lastPants'] })
    script.start(); script.fire('touch_start', { num_detected: 1 })
    const expected = {
      rlv: ['', ',Alpha/.(folded),', 'Alpha/.(folded)', 'Alpha/.(folded),'],
      rlva: ['', 'Alpha,', 'Alpha', 'Alpha,'],
    }
    expect(script.global('replies')).toEqual(expected[profile])
  }
})

const layers = ['shape', 'skin', 'hair', 'eyes', 'shirt', 'pants', 'shoes', 'socks',
  'jacket', 'gloves', 'undershirt', 'underpants', 'skirt', 'alpha', 'tattoo', 'physics', 'universal'] as const
it.each(layers)('recognizes the %s layer even when empty', async layer => {
  const pair = await loadRlvPair({ source: source([layer]) })
  for (const { avatar, script } of Object.values(pair)) {
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null, '#RLV'),
      folder('f', 'r', 'Layer'), { ...clothing('item', 'f'), wearableType: layer }], wornWearables: ['item'] })
    script.start(); script.fire('touch_start', { num_detected: 1 })
    expect(script.global('replies')).toEqual(['Layer', 'Layer'])
    avatar.viewer.inventory.setWearableWorn('item', false)
    script.fire('touch_start', { num_detected: 1 })
    expect(script.global('replies')).toEqual(['Layer', 'Layer', '', ''])
    expect(avatar.viewer.commandLog.every(entry => entry.status === 'replied' && !entry.outcome)).toBe(true)
  }
})

it('returns empty replies for unshared-only layers and missing shared roots', async () => {
  const pair = await loadRlvPair({ source: source(['shirt', 'pants']) })
  for (const { avatar, script } of Object.values(pair)) {
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null, '#RLV'),
      folder('private', null), clothing('item', 'private')], wornWearables: ['item'] })
    script.start(); script.fire('touch_start', { num_detected: 1 })
    expect(script.global('replies')).toEqual(['', '', '', ''])
    seedRlvInventory(avatar, { sharedRootId: null, entries: [clothing('item', null)], wornWearables: ['item'] })
    script.fire('touch_start', { num_detected: 1 })
    expect(script.global('replies')).toEqual(['', '', '', '', '', '', '', ''])
  }
})

it('reports invalid layer options according to each profile', async () => {
  const pair = await loadRlvPair({ source: source(['invalid', 'shirt;extra', 'shirt/pants', '4']) })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { avatar, script } = pair[profile]
    script.start(); script.fire('touch_start', { num_detected: 1 })
    expect(script.global('replies')).toEqual(['', '', '', '', '', '', '', ''])
    expect(avatar.viewer.commandLog.map(entry => entry.outcome)).toEqual(
      profile === 'rlva' ? Array(8).fill('failed-option') : Array(8).fill(undefined))
  }
})
