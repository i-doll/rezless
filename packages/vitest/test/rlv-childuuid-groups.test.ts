import { expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, seedRlvInventory, RLV_ATTACHMENT_POINTS, setRlvAttachmentBridge } from '../src/index.js'

// Firestorm RLVa 2.4.2: RlvForceRemAttachHandler::onCommand tests the selected
// object's isAttachment(), without resolving its root. Child prims have no
// attachment state. RlvCommandOptionGeneric resolves folders before groups;
// rlvAttachGroupFromIndex uses viewer groups, including group 8 for hud.
// Kokua RLV 2.09.35.00: forceDetachByUuid resolves getRootEdit(); force treats
// group names as shared-folder paths.
const source = `default { touch_start(integer n) { llOwnerSay(llGetObjectDesc()); } }`
type Fixture = Awaited<ReturnType<typeof loadRlvPair>>['rlv']
function send(f: Fixture, command: string) {
 f.script.host.description = command; f.script.fire('touch_start', { num_detected: 1 })
}
async function attachment(f: Fixture, point: number) {
 const loaded = await loadLinkset({ world: f.world, owner: f.avatar.key, region: f.avatar.region,
  prims: [{}, {}] })
 loaded.linkset.attachToAvatar(f.avatar.key, point)
 return loaded.linkset
}

for (const command of ['detach', 'remattach']) {
 it(`${command} accepts child UUIDs with each profile's target semantics`, async () => {
  for (const [profile, f] of Object.entries(await loadRlvPair({ source }))) {
   f.script.start()
   const target = await attachment(f, 1)
   const sibling = await attachment(f, 1)
   send(f, `@${command}:${target.prims[1]!.key}=force`)
   expect(target.attachment?.point ?? 0, profile).toBe(profile === 'rlv' ? 0 : 1)
   expect(sibling.attachment?.point).toBe(1)
   expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'enforced',
    outcome: profile === 'rlv' ? 'allowed' : 'no-op' })
   send(f, `@${command}:${target.prims[0]!.key}=force`)
   expect(target.attachment).toBeNull()
   expect(sibling.attachment?.point).toBe(1)
  }
 })

 for (const [group, ids] of Object.entries({ head: [2], torso: [6], arms: [0, 1, 3, 4], legs: [5, 7], hud: [8] })) {
  it(`${command}:${group} selects only the RLVa viewer group`, async () => {
   for (const [profile, f] of Object.entries(await loadRlvPair({ source }))) {
    f.script.start()
    const objects = await Promise.all(RLV_ATTACHMENT_POINTS.map(p => attachment(f, p.id)))
    send(f, `@${command}:${group}=force`)
    for (const [i, point] of RLV_ATTACHMENT_POINTS.entries()) {
     expect(objects[i]!.attachment?.point ?? 0, `${profile} ${point.name}`).toBe(
      profile === 'rlva' && ids.includes(point.group) ? 0 : point.id)
    }
    expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'enforced', outcome: profile === 'rlva' ? 'allowed' : 'no-op' })
    send(f, `@${command}:${group}=force`)
    expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ outcome: 'no-op' })
   }
  })
 }
}

it('resolves a shared folder before a group name and keeps recursive group options inert', async () => {
 for (const [profile, f] of Object.entries(await loadRlvPair({ source }))) {
  f.script.start()
  const chest = await attachment(f, 1); const hand = await attachment(f, 5)
  seedRlvInventory(f.avatar, { sharedRootId: 'root', entries: [
   { id: 'root', parentId: null, kind: 'folder', name: '#RLV' },
   { id: 'folder', parentId: 'root', kind: 'folder', name: 'Arms' },
   { id: 'item', parentId: 'folder', kind: 'item', name: 'Chest', assetType: 'object' },
  ], wornAttachments: [{ itemId: 'item', rootKey: chest.prims[0]!.key }] })
  send(f, '@remattach:arms=force')
  expect(chest.attachment).toBeNull(); expect(hand.attachment?.point).toBe(5)
  send(f, '@detachall:legs=force')
  expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ outcome: profile === 'rlva' ? 'failed-option' : 'no-op' })
  expect(hand.attachment?.point).toBe(5)
 }
})

it('group removal preserves locked and nostrip occupants while removing their peers', async () => {
 for (const [profile, f] of Object.entries(await loadRlvPair({ source }))) {
  f.script.start()
  const locked = await attachment(f, 1); const protectedItem = await attachment(f, 9)
  const free = await attachment(f, 9)
  seedRlvInventory(f.avatar, { sharedRootId: null, entries: [
   { id: 'protected', parentId: null, kind: 'item', name: 'nostrip item', assetType: 'object' },
  ], wornAttachments: [{ itemId: 'protected', rootKey: protectedItem.prims[0]!.key }] })
  send(f, '@remattach:chest=n,detach:torso=force')
  expect(locked.attachment?.point).toBe(1); expect(protectedItem.attachment?.point).toBe(9)
  expect(free.attachment?.point ?? 0).toBe(profile === 'rlva' ? 0 : 9)
  expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ outcome: profile === 'rlva' ? 'partial' : 'no-op' })
  send(f, '@remattach:chest=y,detach:torso=force')
  expect(locked.attachment?.point ?? 0).toBe(profile === 'rlva' ? 0 : 1)
 }
})

it('child UUID commands preserve locks, nostrip and the registered bridge', async () => {
 for (const [profile, f] of Object.entries(await loadRlvPair({ source }))) {
  f.script.start()
  const target = await attachment(f, 1)
  send(f, `@remattach:chest=n,detach:${target.prims[1]!.key}=force`)
  expect(target.attachment?.point).toBe(1)
  send(f, '@remattach:chest=y')
  seedRlvInventory(f.avatar, { sharedRootId: null, entries: [
   { id: 'protected', parentId: null, kind: 'item', name: 'nostrip item', assetType: 'object' },
  ], wornAttachments: [{ itemId: 'protected', rootKey: target.prims[0]!.key }] })
  send(f, `@detach:${target.prims[1]!.key}=force`)
  expect(target.attachment?.point).toBe(1)
  const bridge = await attachment(f, 31)
  setRlvAttachmentBridge(f.avatar.viewer, bridge.prims[0]!.key)
  send(f, `@remattach:${bridge.prims[1]!.key}=force`)
  expect(bridge.attachment?.point ?? 0).toBe(profile === 'rlva' ? 31 : 0)
 }
})
