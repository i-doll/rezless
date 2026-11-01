import { expect, it } from 'vitest'
import { loadLinkset, loadRlvPair, seedRlvInventory, World, Prim, makeInventoryItem, InventoryType, getRlvCommands, getRlvCommandCoverage } from '../src/index.js'

const source = 'string command; default { touch_start(integer n) { llOwnerSay(command); } }'
type Fixture = Awaited<ReturnType<typeof loadRlvPair>>['rlv']
function command(f: Fixture, text: string) {
  f.script.setGlobal('command', text)
  f.script.fire('touch_start', { num_detected: 1 })
}
async function target(f: Fixture, point = 0) {
  const t = await loadLinkset({ world: f.world, owner: f.avatar.key, region: f.avatar.region, prims: [{}, {}] })
  if (point) t.linkset.attachToAvatar(f.avatar.key, point)
  return t
}

it('opens edit targets and applies root exceptions, targeted denials and category locks', async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.script.start()
    const t = await target(f), root = t.linkset.prims[0]!, child = t.linkset.prims[1]!
    expect(f.edit(child).status).toBe('opened')
    command(f, '@edit=n')
    expect(f.edit(child)).toMatchObject({ status: 'blocked', reason: 'edit' })
    command(f, `@edit:${child.key}=n`)
    expect(f.edit(child).status).toBe('blocked')
    command(f, `@edit:${root.key}=add`)
    expect(f.edit(child).status).toBe('opened')
    command(f, `@editobj:${root.key}=n`)
    expect(f.edit(child)).toMatchObject({ status: 'blocked', reason: 'editobj' })
    command(f, '@clear=editobj,editworld=n')
    expect(f.edit(child)).toMatchObject({ status: 'blocked', reason: 'editworld' })
    t.linkset.attachToAvatar(f.avatar.key, 5)
    expect(f.edit(child).status).toBe('opened')
    command(f, '@editattach=n')
    expect(f.edit(child)).toMatchObject({ status: 'blocked', reason: 'editattach' })
    command(f, '@clear')
    expect(f.edit(child).status).toBe('opened')
    expect(f.editActions).toHaveLength(9)
  }
})

it('rezzes a saved inventory object only after restrictions allow it', async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.script.start()
    const saved = (await target(f)).linkset.copy()
    seedRlvInventory(f.avatar, { sharedRootId: null, entries: [{ id: 'item', kind: 'item', parentId: null, name: 'Payload', object: saved, assetType: 'object' }] })
    const count = f.world.linksets.length
    command(f, '@rez=add')
    expect(f.rez('item', { x: 4, y: 5, z: 6 })).toMatchObject({ status: 'blocked', reason: 'rez' })
    expect(f.world.linksets).toHaveLength(count)
    command(f, '@rez=rem')
    const action = f.rez('item', { x: 4, y: 5, z: 6 })
    expect(action.status).toBe('rezzed')
    expect(action.object?.prims[0]?.params.position).toEqual({ x: 4, y: 5, z: 6 })
    expect(action.object?.owner).toBe(f.avatar.key)
    expect(action.object?.prims[0]?.key).not.toBe(saved.prims[0]!.key)
    expect(f.world.linksets).toHaveLength(count + 1)
    expect(f.rezActions).toHaveLength(2)
  }
})

it('applies interact to rez and user sit, with HUD and profile edit differences', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    const t = await target(f), a = await target(f, 5), hud = await target(f, 31)
    command(f, '@interact=n')
    expect(f.edit(t.linkset.prims[0]!).status, profile).toBe(profile === 'rlv' ? 'blocked' : 'opened')
    expect(f.edit(a.linkset.prims[0]!).status, profile).toBe(profile === 'rlv' ? 'blocked' : 'opened')
    expect(f.edit(hud.linkset.prims[0]!).status).toBe('opened')
    expect(f.touch(t.linkset.prims[0]!).status).toBe('blocked')
    expect(f.touch(hud.linkset.prims[0]!).status).toBe('touched')
    expect(f.userSit(t.linkset.prims[0]!)).toBe(false)
    expect(f.rez('missing', { x: 0, y: 0, z: 0 })).toMatchObject({ status: 'blocked', reason: 'interact' })
    command(f, '@interact=y')
    expect(f.userSit(t.linkset.prims[0]!)).toBe(true)
  }
})


it('keeps edit grants permissive in RLVa and issuer scoped in Kokua permissive mode', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    const t = await target(f)
    const other = await loadLinkset({ world: f.world, owner: f.avatar.key, region: f.avatar.region,
      prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
    const issuer = other.scripts.other!
    issuer.start()
    const issue = (text: string) => { issuer.setGlobal('command', text); issuer.fire('touch_start', { num_detected: 1 }) }
    const root = t.linkset.prims[0]!
    command(f, '@edit=n')
    issue(`@edit:${root.key}=n`)
    expect(f.edit(root).status).toBe('opened')
    command(f, '@permissive=n')
    expect(f.edit(root).status, profile).toBe(profile === 'rlv' ? 'blocked' : 'opened')
    command(f, `@edit:${root.key}=n`)
    expect(f.edit(root).status).toBe('opened')
    issue(`@edit:${root.key}=y,edit=n`)
    command(f, '@clear=edit')
    expect(f.edit(root).status, profile).toBe('blocked')
    command(f, `@edit:${root.key}=n`)
    expect(f.edit(root).status, profile).toBe(profile === 'rlv' ? 'blocked' : 'opened')
    command(f, '@clear')
    issue('@clear')
    command(f, '@edit_sec=n')
    expect(f.avatar.viewer.commandLog.at(-1)?.status, profile).toBe(profile === 'rlv' ? 'applied' : 'unsupported')
    expect(f.edit(root).status, profile).toBe(profile === 'rlv' ? 'blocked' : 'opened')
    issue(`@edit_sec:${root.key}=n`)
    expect(f.edit(root).status, profile).toBe(profile === 'rlv' ? 'blocked' : 'opened')
    command(f, `@edit_sec:${root.key}=n`)
    expect(f.edit(root).status).toBe('opened')
  }
})

it('checks interaction before RLVa touchme but after Kokua touchme, and preserves force sit', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    const t = await target(f), a = await target(f, 5)
    command(f, '@interact=n')
    expect(f.touch(a.linkset.prims[0]!).status, profile).toBe(profile === 'rlv' ? 'touched' : 'blocked')
    const issuer = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{ scripts: [{ name: 'grant', source: { source: 'default { state_entry() { llOwnerSay("@touchme=n"); } }' } }] }] })
    issuer.scripts.grant!.start()
    expect(f.touch(issuer.linkset.prims[0]!).status, profile).toBe(profile === 'rlv' ? 'touched' : 'blocked')
    command(f, `@sit:${t.linkset.prims[0]!.key}=force`)
    expect(f.avatar.sittingOn).toBe(t.linkset.prims[0])
    expect(f.userStand()).toBe(true)
    expect(f.userSit(t.linkset.prims[0]!)).toBe(false)
  }
})

it('returns unsupported outcomes for invalid action fixtures without creating objects', async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.script.start()
    const t = await target(f), root = t.linkset.prims[0]!
    const foreign = new World()
    foreign.addRegion('Foreign', { x: 0, y: 0 })
    const outsider = foreign.addAvatar({ username: 'outsider', region: 'Foreign' })
    expect(f.world.attemptAvatarEdit(outsider, root)).toMatchObject({ status: 'unsupported', reason: 'avatar' })
    expect(f.world.attemptAvatarRez(outsider, 'missing', { x: 0, y: 0, z: 0 }).reason).toBe('avatar')
    expect(f.edit(new Prim()).reason).toBe('target')
    expect(f.rez('missing', { x: NaN, y: 0, z: 0 }).reason).toBe('position')
    expect(f.rez('missing', { x: 0, y: 0, z: 0 }).reason).toBe('item')
    const saved = t.linkset.copy()
    seedRlvInventory(f.avatar, { sharedRootId: null, entries: [{ id: 'no-copy', kind: 'item', parentId: null, name: 'No copy', object: saved, assetType: 'object',
      content: makeInventoryItem({ name: 'No copy', type: InventoryType.OBJECT, object: saved, permMask: { owner: 0 } }) }] })
    expect(f.rez('no-copy', { x: 0, y: 0, z: 0 }).reason).toBe('no-copy-item')
    t.linkset.remove()
    expect(f.edit(root).reason).toBe('target')
    expect(Object.isFrozen(f.editActions)).toBe(true)
    expect(Object.isFrozen(f.rezActions[0]?.position)).toBe(true)
  }
})

it('runs rezzed scripts with on_rez and keeps copyable items available', async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    const template = await loadLinkset({ prims: [{ scripts: [{ name: 'payload', source: { source:
      'integer count; default { on_rez(integer n) { ++count; } }' } }] }] })
    template.scripts.payload!.start()
    seedRlvInventory(f.avatar, { sharedRootId: null, entries: [{ id: 'payload', kind: 'item', parentId: null, name: 'Payload', object: template.linkset, assetType: 'object' }] })
    expect(f.editActions).toEqual([])
    expect(f.rezActions).toEqual([])
    const a = f.rez('payload', { x: 1, y: 2, z: 3 }), b = f.rez('payload', { x: 4, y: 5, z: 6 })
    a.object!.advanceTime(0)
    expect(a.object!.allScripts()[0]!.global('count')).toBe(1)
    expect(b.object!.allScripts()[0]!.global('count')).toBe(1)
    expect(template.scripts.payload!.global('count')).toBe(0)
    expect(f.avatar.viewer.inventory.snapshot()).toHaveLength(1)
    expect(a.object!.prims[0]!.key).not.toBe(b.object!.prims[0]!.key)
  }
})

it('rejects unsupported forms and discovers only the implemented edit and rez forms', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    command(f, '@edit:invalid=n,editobj=n,editobj:invalid=n,editworld:invalid=n,editattach:invalid=n,rez:invalid=n,interact:invalid=n,rez_sec=n,edit=force')
    expect(f.avatar.viewer.commandLog.every(entry => entry.status === 'unsupported')).toBe(true)
    expect(getRlvCommandCoverage(profile)).toContainEqual({ behaviour: 'editobj', type: 'add', support: 'enforced', option: 'any' })
  }
  expect(getRlvCommands('rlva', 'edit;add')).toBe('edit;editattach;editobj;editworld')
})

it('bypasses viewer restrictions for a disabled profile', async () => {
  const world = new World()
  world.addRegion('Test', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'disabled', region: 'Test' })
  const t = await loadLinkset({ world, region: avatar.region, prims: [{}] })
  expect(world.attemptAvatarEdit(avatar, t.linkset.prims[0]!).status).toBe('opened')
  expect(world.attemptAvatarRez(avatar, 'missing', { x: 0, y: 0, z: 0 }).reason).toBe('item')
})

it('rezzes retained prim edits and script state after a mapped attachment is detached', async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    const worn = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{ scripts: [{ name: 'payload', source: { source: 'integer value; default { state_entry() { } }' } }] }] })
    const original = worn.linkset.copy()
    seedRlvInventory(f.avatar, { sharedRootId: null, entries: [{ id: 'payload', kind: 'item', parentId: null,
      name: 'Payload', object: original, assetType: 'object' }],
      wornAttachments: [{ itemId: 'payload', rootKey: worn.linkset.prims[0]!.key }] })
    worn.linkset.attachToAvatar(f.avatar.key, 5)
    worn.scripts.payload!.start()
    worn.scripts.payload!.setGlobal('value', 73)
    worn.linkset.prims[0]!.name = 'Edited while worn'
    expect(f.attemptDetach(worn.linkset)).toBe('allowed')
    const action = f.rez('payload', { x: 7, y: 8, z: 9 })
    expect(action.status).toBe('rezzed')
    expect(action.object!.prims[0]!.name).toBe('Edited while worn')
    expect(action.object!.allScripts()[0]!.global('value')).toBe(73)
    expect(action.object!.attachment).toBeNull()
    expect(original.prims[0]!.name).not.toBe('Edited while worn')
  }
})
