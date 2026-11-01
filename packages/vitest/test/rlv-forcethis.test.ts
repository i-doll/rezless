import { expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, seedRlvInventory, getRlvCommandCoverage } from '../src/index.js'

const source = `default { touch_start(integer n) { llOwnerSay(llGetObjectDesc()); } }`
async function fixtures() {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    const object = (await loadLinkset({ prims: [{}] })).linkset
    seedRlvInventory(f.avatar, { sharedRootId: 'root', entries: [
      { id: 'root', parentId: null, kind: 'folder', name: '#RLV' },
      { id: 'base', parentId: 'root', kind: 'folder', name: 'Base' },
      { id: 'child', parentId: 'base', kind: 'folder', name: 'Child' },
      { id: 'other', parentId: 'root', kind: 'folder', name: 'Other' },
      { id: 'issuer', parentId: 'base', kind: 'item', name: 'Issuer', assetType: 'object' },
      { id: 'a', parentId: 'base', kind: 'item', name: 'A (left hand)', assetType: 'object', object },
      { id: 'b', parentId: 'child', kind: 'item', name: 'B (right hand)', assetType: 'object', object },
      { id: 'c', parentId: 'other', kind: 'item', name: 'C (left foot)', assetType: 'object', object },
      { id: 'shirt', parentId: 'base', kind: 'item', name: 'Shirt', wearableType: 'shirt' },
      { id: 'shirt2', parentId: 'other', kind: 'item', name: 'Shirt 2', wearableType: 'shirt' },
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
function worn(f: Fixture) {
  return f.world.linksets.filter(l => l.attachment).map(l => f.avatar.viewer.inventory.attachmentItem(l.prims[0]!.key)?.id).sort()
}
function result(f: Fixture) { return f.avatar.viewer.commandLog.at(-1)! }

// Kokua RLV 2.09.35.00: RRInterface::force, getFullPath, getItem.
// Firestorm RLVa 2.4.2: RlvCommandOptionGetPath, RlvInventory::getPath, RlvHandler::onForceWearCallback.
const wearCommands = ['attachthis', 'attachthisover', 'attachthisoverorreplace',
  'attachallthis', 'attachallthisover', 'attachallthisoverorreplace',
  'addoutfitthis', 'addoutfitthisover', 'addoutfitthisoverorreplace',
  'addoutfitallthis', 'addoutfitallthisover', 'addoutfitallthisoverorreplace']
for (const command of wearCommands) {
  it(`${command} resolves the issuer folder and retains profile-specific aliases`, async () => {
    for (const [profile, f] of Object.entries(await fixtures())) {
      send(f, `@${command}=force`)
      const unsupported = profile === 'rlva' && command.startsWith('addoutfit') && command.endsWith('overorreplace')
      expect(worn(f)).toEqual(unsupported ? ['issuer'] : command.includes('all') ? ['a', 'b', 'issuer'] : ['a', 'issuer'])
      expect(result(f).status).toBe(unsupported ? 'unsupported' : 'enforced')
      expect(getRlvCommandCoverage(profile as 'rlv' | 'rlva').some(form => form.behaviour === command)).toBe(!unsupported)
    }
  })
}
it('resolves every worn clothing item and every attachment on a named point', async () => {
  for (const selector of ['shirt', 'chest']) for (const f of Object.values(await fixtures())) {
    const inv = f.avatar.viewer.inventory
    if (selector === 'shirt') { inv.setWearableWorn('shirt', true); inv.setWearableWorn('shirt2', true) }
    else {
      const object = inv.snapshot().find(e => e.id === 'c')!.object!.copy({ world: f.world, region: f.avatar.region, owner: f.avatar.key })
      object.attachToAvatar(f.avatar.key, 1); inv.rememberAttachment('c', object)
    }
    send(f, `@attachthisover:${selector}=force`)
    expect(worn(f)).toEqual(['a', 'c', 'issuer'])
    expect(result(f).outcome).toBe('allowed')
  }
})
it('selects a worn object UUID rather than an inventory item UUID or a folder path', async () => {
  for (const [profile, f] of Object.entries(await fixtures())) {
    send(f, `@attachthis:${f.script.host.key}=force`)
    expect(worn(f)).toEqual(['a', 'issuer'])
    for (const option of ['base', '00000000-0000-0000-0000-000000000001']) {
      send(f, `@attachthis:${option}=force`)
      expect(result(f).outcome).toBe(profile === 'rlva' ? 'failed-option' : 'no-op')
    }
  }
})
for (const command of ['detachthis', 'detachallthis']) {
  it(`${command} removes the selected folder including clothing and honors locks`, async () => {
    for (const f of Object.values(await fixtures())) {
      send(f, '@attachallthisover=force')
      send(f, `@detach=n,${command}=force`)
      expect(worn(f)).toEqual(command === 'detachthis' ? ['b', 'issuer'] : ['issuer'])
      expect(f.avatar.viewer.inventory.wornWearables()).toEqual([])
      expect(result(f).outcome).toBe('partial')
      expect(result(f).removeResults).toContainEqual({ itemId: 'issuer', outcome: 'blocked', reason: 'detach-lock' })
    }
  })
}
it('empty points, unworn issuers and unshared selectors do not target shared folders', async () => {
  for (const f of Object.values(await fixtures())) {
    for (const option of [':skull', ':socks']) {
      send(f, `@attachthis${option}=force`)
      expect(result(f).outcome).toBe('no-op')
    }
    f.script.host.linkset!.detachFromAvatar()
    send(f, '@attachthis=force')
    expect(result(f).outcome).toBe('no-op')
    expect(worn(f)).toEqual([])
  }
})
it('folds a no-mod point folder to its containing folder', async () => {
  for (const f of Object.values(await fixtures())) {
    const inv = f.avatar.viewer.inventory
    inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot().map(e => e.id === 'issuer'
      ? { ...e, parentId: 'fold', modifiable: false } : e),
      { id: 'fold', parentId: 'base', kind: 'folder', name: '.(chest)', folded: true },
    ], wornAttachments: [{ itemId: 'issuer', rootKey: f.script.host.key }] })
    send(f, '@attachthisover=force')
    expect(worn(f)).toEqual(['a', 'issuer'])
  }
})
it('child UUID resolves only in Kokua', async () => {
  for (const [profile, f] of Object.entries(await fixtures())) {
    const child = (await loadLinkset({ prims: [{}, {}], world: f.world, region: f.avatar.region, owner: f.avatar.key })).linkset
    child.attachToAvatar(f.avatar.key, 2)
    const inv = f.avatar.viewer.inventory
    inv.rememberAttachment('c', child)
    send(f, `@attachthisover:${child.prims[1]!.key}=force`)
    expect(worn(f)).toEqual(['c', 'issuer'])
    expect(inv.wornWearables()).toEqual(profile === 'rlv' ? ['shirt2'] : [])
  }
})
it('unshared worn objects, missing shared root and direct shared-root items select nothing', async () => {
  for (const mode of ['unshared', 'root', 'missing']) for (const f of Object.values(await fixtures())) {
    const inv = f.avatar.viewer.inventory
    inv.seed({ sharedRootId: mode === 'missing' ? null : 'root', entries: inv.snapshot().map(e => e.id === 'issuer'
      ? { ...e, parentId: mode === 'unshared' ? null : 'root' } : e),
      wornAttachments: [{ itemId: 'issuer', rootKey: f.script.host.key }] })
    send(f, '@attachallthisover=force')
    expect(worn(f)).toEqual(['issuer'])
    expect(result(f).outcome).toBe('no-op')
  }
})
it('RLVa folds modifiable items while Kokua retains their immediate folder', async () => {
  for (const [profile, f] of Object.entries(await fixtures())) {
    const inv = f.avatar.viewer.inventory
    inv.seed({ sharedRootId: 'root', entries: [...inv.snapshot().map(e => e.id === 'issuer'
      ? { ...e, parentId: 'fold', modifiable: true } : e),
      { id: 'fold', parentId: 'base', kind: 'folder', name: '.(chest)', folded: true },
    ], wornAttachments: [{ itemId: 'issuer', rootKey: f.script.host.key }] })
    send(f, '@attachthisover=force')
    expect(worn(f)).toEqual(profile === 'rlv' ? ['issuer'] : ['a', 'issuer'])
    expect(result(f).outcome).toBe(profile === 'rlv' ? 'no-op' : 'allowed')
  }
})
it('point selection applies add or replacement across folders', async () => {
  for (const command of ['attachthis', 'attachthisover', 'attachthisoverorreplace']) {
    for (const f of Object.values(await fixtures())) {
      const inv = f.avatar.viewer.inventory
      const object = inv.snapshot().find(e => e.id === 'c')!.object!.copy({ world: f.world, region: f.avatar.region, owner: f.avatar.key })
      object.attachToAvatar(f.avatar.key, 1); inv.rememberAttachment('c', object)
      send(f, `@${command}:chest=force`)
      expect(worn(f)).toEqual(['a', 'c', 'issuer'])
      expect(inv.wornWearables()).toEqual(command.endsWith('over') ? ['shirt', 'shirt2'] : ['shirt2'])
    }
  }
})
it('removal selectors accept UUIDs and layers and ignore empty points', async () => {
  for (const selector of ['uuid', 'shirt']) for (const f of Object.values(await fixtures())) {
    send(f, '@attachallthisover=force')
    send(f, `@detachthis:${selector === 'uuid' ? f.script.host.key : selector}=force`)
    expect(worn(f)).toEqual(['b'])
    expect(f.avatar.viewer.inventory.wornWearables()).toEqual([])
    send(f, '@detachallthis:skull=force')
    expect(worn(f)).toEqual(['b'])
    expect(result(f).outcome).toBe('no-op')
    send(f, '@detachthis:invalid=force')
    expect(result(f).outcome).toBe(f.avatar.viewer.profile === 'rlva' ? 'failed-option' : 'no-op')
  }
})

it('a child issuer selects its containing root only in Kokua', async () => {
  for (const [profile, f] of Object.entries(await fixtures())) {
    const loaded = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{}, { scripts: [{ name: 'child', source: { source } }] }] })
    loaded.linkset.attachToAvatar(f.avatar.key, 2)
    f.avatar.viewer.inventory.rememberAttachment('c', loaded.linkset)
    const script = loaded.scripts.child!
    script.host.description = '@attachthisover=force'
    script.start(); script.fire('touch_start', { num_detected: 1 })
    expect(f.avatar.viewer.inventory.wornWearables()).toEqual(profile === 'rlv' ? ['shirt2'] : [])
  }
})
it('resolves hidden folder identity directly only in RLVa', async () => {
  for (const [profile, f] of Object.entries(await fixtures())) {
    const inv = f.avatar.viewer.inventory
    inv.seed({ sharedRootId: 'root', entries: inv.snapshot().map(e => e.id === 'base'
      ? { ...e, name: '.Hidden' } : e), wornAttachments: [{ itemId: 'issuer', rootKey: f.script.host.key }] })
    send(f, '@attachthisover=force')
    expect(worn(f)).toEqual(profile === 'rlv' ? ['issuer'] : ['a', 'issuer'])
  }
})

it('an attachment without an inventory mapping selects no folder', async () => {
  for (const f of Object.values(await fixtures())) {
    const inv = f.avatar.viewer.inventory
    inv.seed({ sharedRootId: 'root', entries: inv.snapshot() })
    send(f, '@attachthisover=force')
    expect(result(f).outcome).toBe('no-op')
    expect(inv.wornWearables()).toEqual([])
  }
})
