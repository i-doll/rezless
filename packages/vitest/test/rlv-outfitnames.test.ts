import { expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, seedRlvInventory, World, getRlvCommandCoverage } from '../src/index.js'

// Firestorm RLVa 2.4.2: RlvHandler::onGetOutfitNames, RlvWearableLocks::canWear,
// RlvForceWear::isForceRemovable and LLWearableData::canAddWearable.
// Kokua RLV 2.09.35.00: RRInterface::reallyHandleCommand has no matching query.
const layers = ['shape', 'skin', 'hair', 'eyes', 'shirt', 'pants', 'shoes', 'socks',
  'jacket', 'gloves', 'undershirt', 'underpants', 'skirt', 'alpha', 'tattoo', 'physics', 'universal'] as const
const queries = ['getoutfitnames', 'getaddoutfitnames', 'getremoutfitnames']
const source = (commands = queries) => `list replies; default {
  state_entry() { llListen(278101,"",llGetOwner(),""); }
  touch_start(integer n) { llOwnerSay("@${commands.map(command => `${command}=278101`).join(',')}"); }
  link_message(integer s,integer n,string m,key id) { llOwnerSay(m); }
  listen(integer c,string n,key id,string m) { replies += [m]; }
}`
const item = (id: string, wearableType: typeof layers[number], name = id, parentId: string | null = null) =>
  ({ id, parentId, name, kind: 'item' as const, wearableType })
const ask = (script: Awaited<ReturnType<typeof loadRlvPair>>['rlva']['script']) => script.fire('touch_start', { num_detected: 1 })

it('returns valid empty replies and all addable layers, while Kokua remains unsupported', async () => {
  const pair = await loadRlvPair({ source: source() })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { script, avatar } = pair[profile]
    script.start(); ask(script)
    expect(script.global('replies')).toEqual(profile === 'rlva' ? ['', layers.join(','), ''] : [])
    expect(avatar.viewer.commandLog.map(entry => entry.status)).toEqual(queries.map(() => profile === 'rlva' ? 'replied' : 'unsupported'))
    expect(avatar.viewer.diagnostics).toHaveLength(profile === 'rlva' ? 0 : 3)
    if (profile === 'rlv') expect(avatar.viewer.commandLog.every(entry => entry.outcome === 'unknown-behaviour')).toBe(true)
  }
})

it('lists worn layers once in wearable-type order, including bodyparts and unshared items', async () => {
  const pair = await loadRlvPair({ source: source() })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { script, avatar } = pair[profile]
    const entries = [...layers].reverse().map(layer => item(layer, layer))
    entries.push(item('extra-shirt', 'shirt'))
    seedRlvInventory(avatar, { sharedRootId: null, entries, wornWearables: entries.map(entry => entry.id) })
    script.start(); ask(script)
    expect(script.global('replies')).toEqual(profile === 'rlva'
      ? [layers.join(','), layers.join(','), layers.slice(4).join(',')] : [])
    avatar.viewer.inventory.setWearableWorn('shirt', false)
    avatar.viewer.inventory.setWearableWorn('extra-shirt', false)
    ask(script)
    if (profile === 'rlva') expect((script.global('replies') as string[]).slice(-3)).toEqual([
      layers.filter(layer => layer !== 'shirt').join(','), layers.join(','), layers.slice(4).filter(layer => layer !== 'shirt').join(','),
    ])
  }
})

it('honors every issuer lock, aliases, overlapping global locks and clear immediately', async () => {
  const pair = await loadRlvPair({ source: source() })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { script, avatar, world } = pair[profile]
    seedRlvInventory(avatar, { sharedRootId: null, entries: [item('shirt', 'shirt'), item('shape', 'shape')], wornWearables: ['shirt', 'shape'] })
    const controller = await loadLinkset({ world, owner: avatar.key, region: avatar.region,
      prims: [{ scripts: [{ name: 'locks', source: { source: `default { state_entry() { llOwnerSay("@addoutfit:shirt=add,remoutfit:shirt=n,remoutfit:shape=n"); }
        touch_start(integer n) { llOwnerSay("@clear"); } }` } }] }] })
    controller.scripts.locks!.start(); script.start(); ask(script)
    if (profile === 'rlva') expect(script.global('replies')).toEqual(['shape,shirt', layers.filter(layer => layer !== 'shirt' && layer !== 'shape').join(','), ''])
    // The query issuer's own locks also remain effective.
    script.fire('link_message', { sender_num: 1, num: 0, str: '@addoutfit=n', id: '' })
    ask(script)
    if (profile === 'rlva') expect((script.global('replies') as string[]).slice(-3)).toEqual(['shape,shirt', '', ''])
    script.fire('link_message', { sender_num: 1, num: 0, str: '@addoutfit=rem', id: '' })
    controller.scripts.locks!.fire('touch_start', { num_detected: 1 }); ask(script)
    expect((script.global('replies') as string[]).slice(-3)).toEqual(profile === 'rlva' ? ['shape,shirt', layers.join(','), 'shirt'] : [])
  }
})

it('allows add beside remove locks only when another item can be added', async () => {
  const pair = await loadRlvPair({ source: source() })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { avatar, script } = pair[profile]
    const entries = [item('shape', 'shape'), item('physics', 'physics'), item('shirt', 'shirt')]
    seedRlvInventory(avatar, { sharedRootId: null, entries, wornWearables: entries.map(entry => entry.id) })
    script.start(); script.fire('link_message', { sender_num: 1, num: 0, str: '@remoutfit=n', id: '' }); ask(script)
    if (profile === 'rlva') expect(script.global('replies')).toEqual(['shape,shirt,physics', layers.filter(layer => layer !== 'shape' && layer !== 'physics').join(','), ''])
    const full = Array.from({ length: 59 }, (_, i) => item(`shirt-${i}`, 'shirt'))
    seedRlvInventory(avatar, { sharedRootId: null, entries: [...entries.slice(0, 2), ...full], wornWearables: [...entries.slice(0, 2), ...full].map(entry => entry.id) })
    ask(script)
    if (profile === 'rlva') expect((script.global('replies') as string[]).slice(-3)).toEqual(['shape,shirt,physics', layers.filter(layer => layer !== 'shape' && layer !== 'shirt' && layer !== 'physics').join(','), ''])
    avatar.viewer.inventory.setWearableWorn('shirt-0', false); ask(script)
    if (profile === 'rlva') expect((script.global('replies') as string[]).slice(-3)).toEqual(['shape,shirt,physics', layers.filter(layer => layer !== 'shape' && layer !== 'physics').join(','), ''])
    script.fire('link_message', { sender_num: 1, num: 0, str: '@remoutfit=y', id: '' })
    ask(script)
    expect((script.global('replies') as string[]).slice(-3)).toEqual(profile === 'rlva' ? ['shape,shirt,physics', layers.join(','), 'shirt,physics'] : [])
  }
})

it('requires one strippable item, checks folded ancestry, and keeps nostrip case sensitive', async () => {
  const pair = await loadRlvPair({ source: source(['getremoutfitnames']) })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { avatar, script } = pair[profile]
    const entries = [
      { id: 'p', parentId: null, name: 'nostrip parent', kind: 'folder' as const },
      { id: 'f', parentId: 'p', name: '(chest)', kind: 'folder' as const, folded: true },
      { id: 'ordinary', parentId: 'p', name: 'ordinary', kind: 'folder' as const },
      item('shirt', 'shirt', 'nostrip shirt'), item('shirt2', 'shirt', 'Shirt'),
      item('jacket', 'jacket', 'Jacket', 'f'), item('pants', 'pants', 'Pants', 'ordinary'),
      item('socks', 'socks', 'NOSTRIP Socks'), item('gloves', 'gloves', 'Gloves', 'p'),
    ]
    seedRlvInventory(avatar, { sharedRootId: null, entries, wornWearables: ['shirt', 'shirt2', 'jacket', 'pants', 'socks', 'gloves'] })
    script.start(); ask(script)
    expect(script.global('replies')).toEqual(profile === 'rlva' ? ['shirt,pants,socks'] : [])
    avatar.viewer.inventory.setWearableWorn('shirt2', false); ask(script)
    expect(script.global('replies')).toEqual(profile === 'rlva' ? ['shirt,pants,socks', 'pants,socks'] : [])
  }
})

it('rejects nonempty options but accepts an explicitly empty option', async () => {
  const commands = queries.flatMap(query => [`${query}:shirt`, `${query}:`, `${query}:unknown`])
  const pair = await loadRlvPair({ source: source(commands) })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { script, avatar } = pair[profile]
    script.start(); ask(script)
    expect(script.global('replies')).toEqual(profile === 'rlva' ? ['', '', '', '', layers.join(','), '', '', '', ''] : [])
    if (profile === 'rlva') expect(avatar.viewer.commandLog.map(entry => entry.outcome)).toEqual([
      'failed-option', undefined, 'failed-option', 'failed-option', undefined, 'failed-option', 'failed-option', undefined, 'failed-option',
    ])
  }
})

it('advertises only RLVa reply forms and applies channel and parameter policy', async () => {
  const pair = await loadRlvPair({ source: source(['getcommand:outfitnames;reply', 'getoutfitnames=0,getoutfitnames',
    'getoutfitnames=-278101,getoutfitnames=force,getaddoutfitnames=n,getremoutfitnames']) })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { script, avatar } = pair[profile]
    script.start(); ask(script)
    expect(script.global('replies')).toEqual(profile === 'rlva' ? ['getaddoutfitnames;getoutfitnames;getremoutfitnames', '', ''] : [])
    expect(avatar.viewer.commandLog.filter(entry => entry.status === 'replied')).toHaveLength(profile === 'rlva' ? 3 : 0)
    const forms = getRlvCommandCoverage(profile).filter(form => queries.includes(form.behaviour))
    expect(forms).toEqual(profile === 'rlva' ? ['getaddoutfitnames', 'getoutfitnames', 'getremoutfitnames'].map(behaviour =>
      ({ behaviour, type: 'reply', support: 'enforced', option: 'none' })) : [])
  }
})

it('leaves disabled viewers inert', async () => {
  const world = new World(); world.addRegion('outfit names', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'disabled', region: 'outfit names', viewer: { profile: 'disabled' } })
  const loaded = await loadLinkset({ world, owner: avatar.key, region: avatar.region,
    prims: [{ scripts: [{ name: 'query', source: { source: source() } }] }] })
  const script = loaded.scripts.query!
  script.start(); ask(script)
  expect(script.global('replies')).toEqual([])
  expect(avatar.viewer.commandLog).toEqual([])
})
