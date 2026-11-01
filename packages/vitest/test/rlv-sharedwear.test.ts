import { expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, seedRlvInventory, attemptViewerAttach, attemptViewerDetach, getRlvCommands } from '../src/index.js'

const source = `default {
 state_entry() {}
 touch_start(integer n) { llOwnerSay(llGetObjectDesc()); }
}`
const folder = (id: string, parentId: string | null, name = id, folded = false) =>
 ({ id, parentId, name, folded, kind: 'folder' as const })
const item = (id: string, parentId: string | null) =>
 ({ id, parentId, name: id, kind: 'item' as const, wearableType: 'shirt' as const })
const locks = ['sharedwear', 'unsharedwear', 'sharedunwear', 'unsharedunwear'] as const

for (const lock of locks) for (const parent of ['shared', 'nested', 'hidden', 'outside', 'decoy']) {
 it(`${lock} classifies ${parent} clothing and attachments by inventory ancestry`, async () => {
  const pair = await loadRlvPair({ source })
  for (const { avatar, world, script, attemptWearable } of Object.values(pair)) {
   const object = (await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [{}] })).linkset
   const wear = !lock.endsWith('unwear')
   seedRlvInventory(avatar, { sharedRootId: 'shared', entries: [folder('shared', null, '#RLV'),
    folder('nested', 'shared'), folder('hidden', 'nested', '.hidden', true), folder('outside', null),
    folder('decoy', 'outside', '#RLV'), item('shirt', parent),
    { id: 'object', parentId: parent, name: 'object', kind: 'item', assetType: 'object' }],
    wornWearables: wear ? [] : ['shirt'],
    wornAttachments: [{ itemId: 'object', rootKey: object.prims[0]!.key }] })
   if (!wear) object.attachToAvatar(avatar.key, 1)
   script.start(); script.host.description = `@${lock}=n`; script.fire('touch_start', { num_detected: 1 })
   const shared = ['shared', 'nested', 'hidden'].includes(parent)
   const blocked = shared !== lock.startsWith('unshared')
   expect(attemptWearable('shirt', wear)).toBe(blocked ? 'blocked' : 'allowed')
   expect(wear ? attemptViewerAttach(avatar, object, 1) : attemptViewerDetach(avatar, object)).toBe(blocked ? 'blocked' : 'allowed')
   expect(avatar.viewer.inventory.wornWearables().includes('shirt')).toBe(blocked ? !wear : wear)
   expect(object.attachment !== null).toBe(blocked ? !wear : wear)
   expect(avatar.viewer.restrictions.snapshot()).toMatchObject([{ behaviour: lock, support: 'enforced' }])
   script.host.description = `@${lock}=rem`; script.fire('touch_start', { num_detected: 1 })
   if (blocked) {
    expect(attemptWearable('shirt', wear)).toBe('allowed')
    expect(wear ? attemptViewerAttach(avatar, object, 1) : attemptViewerDetach(avatar, object)).toBe('allowed')
   }
  }
 })
}

it('blocks replacing an occupant protected by sharedunwear without detaching anything', async () => {
 const pair = await loadRlvPair({ source })
 for (const { avatar, world, script } of Object.values(pair)) {
  const make = async () => (await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [{}] })).linkset
  const old = await make(); const incoming = await make(); const unlocked = await make()
  seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null),
   { id: 'old', parentId: 'r', name: 'old', kind: 'item', assetType: 'object' }],
   wornAttachments: [{ itemId: 'old', rootKey: old.prims[0]!.key }] })
  old.attachToAvatar(avatar.key, 1); unlocked.attachToAvatar(avatar.key, 1)
  script.start(); script.host.description = '@sharedunwear=add'; script.fire('touch_start', { num_detected: 1 })
  expect(attemptViewerAttach(avatar, incoming, 1, true)).toBe('blocked')
  expect(old.attachment?.point).toBe(1); expect(unlocked.attachment?.point).toBe(1)
  expect(incoming.attachment).toBeNull()
  expect(attemptViewerAttach(avatar, incoming, 1)).toBe('allowed')
  script.host.description = '@clear'; script.fire('touch_start', { num_detected: 1 })
  expect(attemptViewerAttach(avatar, await make(), 1, true)).toBe('allowed')
  expect(old.attachment).toBeNull(); expect(unlocked.attachment).toBeNull()
 }
})

it('does not classify missing attachment identities or missing parent folders as unshared', async () => {
 const pair = await loadRlvPair({ source })
 for (const { avatar, world, script, attemptWearable } of Object.values(pair)) {
  const object = (await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [{}] })).linkset
  seedRlvInventory(avatar, { sharedRootId: null, entries: [item('shirt', null)] })
  script.start(); script.host.description = '@unsharedwear=n,unsharedunwear=n'; script.fire('touch_start', { num_detected: 1 })
  expect(attemptWearable('shirt', true)).toBe('allowed')
  expect(attemptWearable('shirt', false)).toBe('allowed')
  expect(attemptViewerAttach(avatar, object, 1)).toBe('allowed')
  expect(attemptViewerDetach(avatar, object)).toBe('allowed')
 }
})

it('treats ordinary folders as unshared when no shared root exists', async () => {
 const pair = await loadRlvPair({ source })
 for (const { avatar, script, attemptWearable } of Object.values(pair)) {
  seedRlvInventory(avatar, { sharedRootId: null, entries: [folder('f', null, '#RLV'), item('shirt', 'f')] })
  script.start(); script.host.description = '@unsharedwear=n'; script.fire('touch_start', { num_detected: 1 })
  expect(attemptWearable('shirt', true)).toBe('blocked')
 }
})

it('keeps option forms inert and discovers the four no-option locks', async () => {
 const pair = await loadRlvPair({ source })
 for (const [profile, { avatar, script, attemptWearable }] of Object.entries(pair)) {
  seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null), item('shirt', 'r')] })
  script.start(); script.host.description = '@' + locks.map(lock => `${lock}:shirt=n`).join(',')
  script.fire('touch_start', { num_detected: 1 })
  expect(attemptWearable('shirt', true)).toBe('allowed')
  expect(attemptWearable('shirt', false)).toBe('allowed')
  expect(avatar.viewer.commandLog.every(entry => entry.status === 'unsupported')).toBe(true)
  expect(avatar.viewer.restrictions.snapshot()).toHaveLength(profile === 'rlv' ? 4 : 0)
 }
 expect(getRlvCommands('rlva', 'shared;add')).toBe('sharedunwear;sharedwear;unsharedunwear;unsharedwear')
})

for (const wear of [true, false]) for (const unsharedFirst of [true, false]) {
 it(`preserves profile precedence for overlapping ${wear ? 'wear' : 'unwear'} locks, unshared first=${unsharedFirst}`, async () => {
  const pair = await loadRlvPair({ source })
  for (const [profile, { avatar, script, attemptWearable }] of Object.entries(pair)) {
   seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null), item('shirt', 'r')], wornWearables: wear ? [] : ['shirt'] })
   const shared = wear ? 'sharedwear' : 'sharedunwear'; const unshared = 'un' + shared
   script.start(); script.host.description = '@' + (unsharedFirst ? [unshared, shared] : [shared, unshared]).map(lock => `${lock}=n`).join(',')
   script.fire('touch_start', { num_detected: 1 })
   expect(attemptWearable('shirt', wear)).toBe(profile === 'rlva' && unsharedFirst ? 'allowed' : 'blocked')
  }
 })
}

it('keeps other issuers effective and clear limited to its sender', async () => {
 const pair = await loadRlvPair({ source })
 for (const { avatar, script, world, attemptWearable } of Object.values(pair)) {
  seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null), item('shirt', 'r')] })
  const second = (await loadLinkset({ world, owner: avatar.key, region: avatar.region,
   prims: [{ scripts: [{ name: 'second', source: { source } }] }] })).scripts.second!
  script.start(); second.start()
  const send = (sender: typeof script, command: string) => {
   sender.host.description = command; sender.fire('touch_start', { num_detected: 1 })
  }
  send(script, '@unsharedwear=n'); send(second, '@sharedwear=n')
  expect(attemptWearable('shirt', true)).toBe('blocked')
  send(script, '@clear'); expect(attemptWearable('shirt', true)).toBe('blocked')
  send(second, '@sharedwear=y'); expect(attemptWearable('shirt', true)).toBe('allowed')
  send(script, '@sharedunwear=n'); send(second, '@sharedunwear=n')
  send(script, '@sharedunwear=y'); expect(attemptWearable('shirt', false)).toBe('blocked')
  send(second, '@clear=sharedunwear'); expect(attemptWearable('shirt', false)).toBe('allowed')
 }
})

it('retains point and clothing locks after shared locks are removed', async () => {
 const pair = await loadRlvPair({ source })
 for (const { avatar, script, world, attemptWearable } of Object.values(pair)) {
  const object = (await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [{}] })).linkset
  seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null), item('shirt', 'r')] })
  script.start()
  script.host.description = '@sharedwear=n,addoutfit:shirt=n,addattach:chest=n,sharedwear=y'
  script.fire('touch_start', { num_detected: 1 })
  expect(attemptWearable('shirt', true)).toBe('blocked')
  expect(attemptViewerAttach(avatar, object, 1)).toBe('blocked')
  script.host.description = '@clear'; script.fire('touch_start', { num_detected: 1 })
  expect(attemptWearable('shirt', true)).toBe('allowed')
  expect(attemptViewerAttach(avatar, object, 1)).toBe('allowed')
 }
})

it('folds RLVa containing folders before classifying the shared boundary', async () => {
 const pair = await loadRlvPair({ source })
 for (const [profile, { avatar, script, attemptWearable }] of Object.entries(pair)) {
  seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('outside', null),
   folder('r', 'outside', '#RLV', true), item('shirt', 'r')] })
  script.start(); script.host.description = '@sharedwear=n'; script.fire('touch_start', { num_detected: 1 })
  expect(attemptWearable('shirt', true)).toBe(profile === 'rlva' ? 'allowed' : 'blocked')
 }
})

it('leaves a folded folder with no effective parent unrestricted in RLVa', async () => {
 const pair = await loadRlvPair({ source })
 for (const [profile, { avatar, script, attemptWearable }] of Object.entries(pair)) {
  seedRlvInventory(avatar, { sharedRootId: null, entries: [folder('f', null, '.(chest)', true), item('shirt', 'f')] })
  script.start(); script.host.description = '@unsharedwear=n'; script.fire('touch_start', { num_detected: 1 })
  expect(attemptWearable('shirt', true)).toBe(profile === 'rlva' ? 'allowed' : 'blocked')
 }
})
