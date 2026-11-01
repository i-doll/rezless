import { expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, seedRlvInventory, attemptViewerAttach, attemptViewerDetach, getRlvCommandCoverage } from '../src/index.js'

const source = `default { touch_start(integer n) { llOwnerSay(llGetObjectDesc()); } }`
// Kokua RLV 2.09.35.00: RRInterface::isFolderLockedWithoutExceptionAux, canAttachCategoryAux, canDetachCategoryAux.
// Firestorm RLVa 2.4.2: RlvHandler::onAddRemFolderLock, onAddRemFolderLockException; RlvFolderLocks::isLockedFolder.
async function fixtures() {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    const object = (await loadLinkset({ prims: [{}] })).linkset
    seedRlvInventory(f.avatar, { sharedRootId: 'r', entries: [
      { id: 'r', parentId: null, kind: 'folder', name: '#RLV' },
      { id: 'base', parentId: 'r', kind: 'folder', name: 'Base' },
      { id: 'child', parentId: 'base', kind: 'folder', name: 'Child' },
      { id: 'other', parentId: 'r', kind: 'folder', name: 'Other' },
      { id: 'issuer', parentId: 'base', kind: 'item', name: 'Issuer', assetType: 'object' },
      { id: 'a', parentId: 'base', kind: 'item', name: 'A (left hand)', assetType: 'object', object },
      { id: 'b', parentId: 'child', kind: 'item', name: 'B (right hand)', assetType: 'object', object },
      { id: 'shirt', parentId: 'base', kind: 'item', name: 'Shirt', wearableType: 'shirt' },
      { id: 'pants', parentId: 'child', kind: 'item', name: 'Pants', wearableType: 'pants' },
      { id: 'other-shirt', parentId: 'other', kind: 'item', name: 'Other shirt', wearableType: 'shirt' },
    ], wornAttachments: [{ itemId: 'issuer', rootKey: f.script.host.key }] })
    f.script.host.linkset!.attachToAvatar(f.avatar.key, 1)
    f.script.start()
  }
  return pair
}
type Fixture = Awaited<ReturnType<typeof fixtures>>['rlv']
function send(f: Fixture, command: string) {
  f.script.host.description = command
  f.script.fire('touch_start', { num_detected: 1 })
}
for (const recursive of [false, true]) for (const wear of [false, true]) {
  const command = `${wear ? 'attach' : 'detach'}${recursive ? 'all' : ''}this`
  it(`${command} enforces node or subtree locks on user clothing and force operations`, async () => {
    for (const f of Object.values(await fixtures())) {
      if (!wear) send(f, '@attachallover:base=force')
      send(f, `@${command}:base=n`)
      expect(f.avatar.viewer.restrictions.snapshot().at(-1)?.support).toBe('enforced')
      expect(f.attemptWearable('shirt', wear)).toBe('blocked')
      expect(f.attemptWearable('pants', wear)).toBe(recursive ? 'blocked' : 'allowed')
      send(f, `@${wear ? 'attachallover' : 'detachall'}:base=force`)
      expect(f.avatar.viewer.commandLog.at(-1)?.[wear ? 'wearResults' : 'removeResults']).toContainEqual(
        expect.objectContaining({ itemId: 'a', outcome: 'blocked' }))
      send(f, `@${command}:base=y`)
      expect(f.attemptWearable('shirt', wear)).toBe('allowed')
    }
  })
}
it('subtree exceptions exempt only their issuer and clear restores the denial', async () => {
  for (const f of Object.values(await fixtures())) {
    send(f, '@attachallthis:base=n,attachthis_except:base/child=n')
    expect(f.attemptWearable('shirt', true)).toBe('blocked')
    expect(f.attemptWearable('pants', true)).toBe('allowed')
    expect(f.attemptWearable('pants', false)).toBe('allowed')
    const second = (await loadLinkset({ world: f.world, owner: f.avatar.key, region: f.avatar.region,
      prims: [{ scripts: [{ name: 'second', source: { source } }] }] })).scripts.second!
    second.start(); second.host.description = '@attachallthis:base=n'; second.fire('touch_start', { num_detected: 1 })
    expect(f.attemptWearable('pants', true)).toBe('blocked')
    second.host.description = '@clear'; second.fire('touch_start', { num_detected: 1 })
    expect(f.attemptWearable('pants', true)).toBe('allowed')
    f.attemptWearable('pants', false)
    send(f, '@attachthis_except:base/child=y')
    expect(f.attemptWearable('pants', true)).toBe('blocked')
    send(f, '@clear')
    expect(f.attemptWearable('shirt', true)).toBe('allowed')
  }
})
it('no-option attachthis locks the issuer folder in RLVa only', async () => {
  for (const [profile, f] of Object.entries(await fixtures())) {
    send(f, '@attachthis=n')
    expect(f.attemptWearable('shirt', true)).toBe(profile === 'rlva' ? 'blocked' : 'allowed')
  }
})
it('all eight restrictions are discoverable independently of their force forms', async () => {
  for (const [profile, f] of Object.entries(await fixtures())) {
    for (const command of ['attachthis', 'attachallthis', 'detachthis', 'detachallthis']) for (const suffix of ['', '_except']) {
      send(f, `@${command}${suffix}:base=n`)
      expect(f.avatar.viewer.commandLog.at(-1)?.status).toBe('applied')
      expect(getRlvCommandCoverage(profile as 'rlv' | 'rlva')).toContainEqual({ behaviour: command + suffix, type: 'add', support: 'enforced', option: 'any' })
    }
  }
})
it('mapped user attachments obey folder locks and replacement preserves locked occupants', async () => {
  for (const f of Object.values(await fixtures())) {
    const inv = f.avatar.viewer.inventory
    const object = inv.snapshot().find(e => e.id === 'a')!.object!.copy({ world: f.world, owner: f.avatar.key, region: f.avatar.region })
    inv.rememberAttachment('a', object)
    send(f, '@attachthis:base=n')
    expect(attemptViewerAttach(f.avatar, object, 5)).toBe('blocked')
    send(f, '@attachthis:base=y')
    expect(attemptViewerAttach(f.avatar, object, 5)).toBe('allowed')
    send(f, '@detachthis:base=n')
    expect(attemptViewerDetach(f.avatar, object)).toBe('blocked')
    const replacement = (await loadLinkset({ world: f.world, owner: f.avatar.key, region: f.avatar.region, prims: [{}] })).linkset
    expect(attemptViewerAttach(f.avatar, replacement, 5, true)).toBe('blocked')
    send(f, '@detachthis:base=y')
    expect(attemptViewerDetach(f.avatar, object)).toBe('allowed')
  }
})

it('distinguishes direct denial precedence from same-folder insertion-order grants', async () => {
  for (const [profile, f] of Object.entries(await fixtures())) {
    send(f, '@attachthis_except:base=n,attachthis:base=n')
    expect(f.attemptWearable('shirt', true)).toBe(profile === 'rlva' ? 'allowed' : 'blocked')
    send(f, '@clear')
    f.avatar.viewer.inventory.setWearableWorn('shirt', false)
    send(f, '@attachthis:base=n,attachthis_except:base=n')
    expect(f.attemptWearable('shirt', true)).toBe('blocked')
  }
})
it('point and worn-layer selectors distinguish RLVa selected folders from Kokua eligible contents', async () => {
  for (const [profile, f] of Object.entries(await fixtures())) {
    send(f, '@attachthis:chest=n')
    expect(f.attemptWearable('shirt', true)).toBe(profile === 'rlva' ? 'blocked' : 'allowed')
    send(f, '@clear')
    f.avatar.viewer.inventory.setWearableWorn('shirt', true)
    send(f, '@detachthis:shirt=n')
    expect(f.attemptWearable('shirt', false)).toBe('blocked')
    expect(f.attemptWearable('pants', true)).toBe('allowed')
  }
})
it('no-option detach locks the issuer folder and its subtree only for allthis', async () => {
  for (const recursive of [false, true]) for (const f of Object.values(await fixtures())) {
    f.avatar.viewer.inventory.setWearableWorn('shirt', true)
    f.avatar.viewer.inventory.setWearableWorn('pants', true)
    send(f, `@detach${recursive ? 'all' : ''}this=n`)
    expect(f.attemptWearable('shirt', false)).toBe('blocked')
    expect(f.attemptWearable('pants', false)).toBe(recursive ? 'blocked' : 'allowed')
  }
})
it('rejects non-path RLVa exceptions and retains unsupported selectors inspectably', async () => {
  for (const [profile, f] of Object.entries(await fixtures())) {
    for (const option of ['', ':chest', ':shirt', ':' + f.script.host.key, ':missing']) {
      send(f, `@attachthis_except${option}=n`)
      expect(f.avatar.viewer.commandLog.at(-1)?.status).toBe(profile === 'rlva' ? 'unsupported' : 'applied')
    }
    expect(f.attemptWearable('shirt', true)).toBe('allowed')
  }
})
it('folded attachment folders inherit their effective containing folder lock', async () => {
  for (const f of Object.values(await fixtures())) {
    const inv = f.avatar.viewer.inventory
    inv.seed({ sharedRootId: 'r', entries: [...inv.snapshot().map(e => e.id === 'a'
      ? { ...e, parentId: 'fold', modifiable: false } : e),
      { id: 'fold', parentId: 'base', kind: 'folder', name: '.(left hand)', folded: true }],
      wornAttachments: [{ itemId: 'issuer', rootKey: f.script.host.key }] })
    send(f, '@attachthis:base=n,attachover:base=force')
    expect(f.avatar.viewer.commandLog.at(-1)?.wearResults).toContainEqual(expect.objectContaining({ itemId: 'a', outcome: 'blocked' }))
  }
})
it('force layer and point removals respect folder locks and replacement protects clothing occupants', async () => {
  for (const f of Object.values(await fixtures())) {
    send(f, '@attachover:base=force,detachthis:base=n,remoutfit:shirt=force')
    expect(f.avatar.viewer.inventory.wornWearables()).toContain('shirt')
    send(f, '@detach:left hand=force')
    expect(f.world.linksets.some(o => o.attachment?.point === 5)).toBe(true)
    send(f, '@attach:other=force')
    expect(f.avatar.viewer.inventory.wornWearables()).toContain('shirt')
    send(f, '@clear,remoutfit:shirt=force')
    expect(f.avatar.viewer.inventory.wornWearables()).not.toContain('shirt')
  }
})

it('preserves Kokua clothing replacement ordering when the incoming folder is denied', async () => {
  for (const [profile, f] of Object.entries(await fixtures())) {
    f.avatar.viewer.inventory.setWearableWorn('other-shirt', true)
    send(f, '@attachthis:base=n,attach:base=force')
    expect(f.avatar.viewer.inventory.wornWearables()).toEqual(profile === 'rlv' ? [] : ['other-shirt'])
    expect(f.avatar.viewer.commandLog.at(-1)?.wearResults).toContainEqual({ itemId: 'shirt', outcome: 'blocked', reason: 'folder-lock' })
  }
})
it('Kokua bodypart force wear checks the layer rather than the incoming folder', async () => {
  for (const [profile, f] of Object.entries(await fixtures())) {
    const inv = f.avatar.viewer.inventory
    inv.seed({ sharedRootId: 'r', entries: [...inv.snapshot(),
      { id: 'shape', parentId: 'base', kind: 'item', name: 'Shape', wearableType: 'shape' },
      { id: 'old-shape', parentId: 'other', kind: 'item', name: 'Old shape', wearableType: 'shape' }],
      wornWearables: ['old-shape'], wornAttachments: [{ itemId: 'issuer', rootKey: f.script.host.key }] })
    send(f, '@attachthis:base=n,attachover:base=force')
    expect(inv.wornWearables()).toEqual(profile === 'rlv' ? ['shape'] : ['old-shape'])
  }
})

it('Kokua force bodypart replacement also bypasses the outgoing folder lock', async () => {
  for (const [profile, f] of Object.entries(await fixtures())) {
    const inv = f.avatar.viewer.inventory
    inv.seed({ sharedRootId: 'r', entries: [...inv.snapshot(),
      { id: 'shape', parentId: 'base', kind: 'item', name: 'Shape', wearableType: 'shape' },
      { id: 'old-shape', parentId: 'other', kind: 'item', name: 'Old shape', wearableType: 'shape' }],
      wornWearables: ['old-shape'], wornAttachments: [{ itemId: 'issuer', rootKey: f.script.host.key }] })
    send(f, '@detachthis:other=n,attachover:base=force')
    expect(inv.wornWearables()).toContain(profile === 'rlv' ? 'shape' : 'old-shape')
    expect(inv.wornWearables()).not.toContain(profile === 'rlv' ? 'old-shape' : 'shape')
  }
})
