import { describe, expect, it } from 'vitest'
import { loadScript, loadLinkset, World, makeInventoryItem, InventoryType, PERM_ALL, PERM_COPY, PERM_TRANSFER, type InventoryItem } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlGiveInventory
// https://wiki.secondlife.com/wiki/LlGiveInventoryList
// https://wiki.secondlife.com/wiki/LlGiveAgentInventory
// In-world: give.lsl, extra.lsl and repeat probe, Aditi, SLua Tideland, 2026-10-31.
// Sources/transcripts: /tmp/issue-153-give-viewer/ on the probing machine.
const OWNER = '00000000-0000-0000-0000-00000000000a'
const OTHER = '00000000-0000-0000-0000-00000000000b'
const TARGET = '00000000-0000-0000-0000-000000000123'
const gift = (overrides: Partial<InventoryItem> = {}) => makeInventoryItem({ name: 'gift', type: InventoryType.NOTECARD, key: OTHER, notecardLines: ['hello'], ...overrides })
const perms = (owner: number) => ({ base: owner, owner, next: PERM_ALL, group: 0, everyone: 0 })
async function load(call: string, items = [gift()]) {
  const s = await loadScript({ owner: OWNER, source: `integer result = 999; integer done;
    default { touch_start(integer n) { ${call} done = 1; } }` })
  for (const item of items) s.host.addInventory(item)
  s.start()
  s.linkset.touch(0)
  return s
}
const errors = (s: Awaited<ReturnType<typeof load>>) => s.chat.filter(c => c.channel === 2147483647).map(c => c.text)

it('records the offered item and target, preserving the source copy', async () => {
  const s = await load('llGiveInventory(llGetOwner(), "gift");')
  expect(s.inventoryOffers).toMatchObject([{ kind: 'inventory', target: OWNER, folder: null, rootPath: [], items: [{ name: 'gift', key: OTHER, notecardLines: ['hello'] }] }])
  expect(s.host.inventory.filter(i => i.name === 'gift')).toHaveLength(1)
})

it('delays an avatar give for two seconds', async () => {
  // In-world: give step 3 -> dt=2.000072; a valid but absent UUID also sleeps 2 s.
  const s = await load(`llGiveInventory("${OTHER}", "gift");`)
  expect(s.now).toBe(2000)
  expect(s.global('done')).toBe(1)
})

it('reports a missing single item and does not delay', async () => {
  // In-world: extra step 10 -> missing item error, dt=0.022141.
  const s = await load('llGiveInventory(llGetOwner(), "missing");')
  expect(errors(s)).toEqual(["Unable to give inventory: 'No item named 'missing'.'."])
  expect(s.inventoryOffers).toEqual([])
  expect(s.global('done')).toBe(1)
})

it.each(['NULL_KEY', '"bad"'])('silently ignores invalid single target %s without a delay', async target => {
  // In-world: give 20 / extra 11 -> silent, dt=0.
  const s = await load(`llGiveInventory(${target}, "gift");`)
  expect(s.inventoryOffers).toEqual([])
  expect(errors(s)).toEqual([])
  expect(s.global('done')).toBe(1)
})

// Actual restricted owner masks cannot be created through these tools with one avatar.
// These permission/move cases follow the wiki; need a second avatar to supply restricted items.
it('moves a no-copy item out of the source without a source changed event', async () => {
  const s = await loadScript({ owner: OWNER, source: `integer changes; default {
    touch_start(integer n) { llGiveInventory(llGetOwner(), "gift"); }
    changed(integer c) { changes = c; }
  }` })
  s.host.addInventory(gift({ permMask: perms(PERM_ALL & ~PERM_COPY) }))
  s.start(); s.linkset.touch(0)
  expect(s.host.inventory.map(i => i.name)).not.toContain('gift')
  expect(s.inventoryOffers[0]!.items[0]!.name).toBe('gift')
  expect(s.global('changes')).toBe(0)
})

it('permits no-transfer gifts to the owner and refuses other owners', async () => {
  const item = gift({ permMask: perms(PERM_ALL & ~PERM_TRANSFER) })
  const own = await load('llGiveInventory(llGetOwner(), "gift");', [item])
  expect(own.inventoryOffers).toHaveLength(1)
  const foreign = await load(`llGiveInventory("${OTHER}", "gift");`, [item])
  expect(foreign.inventoryOffers).toEqual([])
  expect(errors(foreign).join()).toContain('Permissions do not allow transfer')
  expect(foreign.host.inventory.map(i => i.name)).toContain('gift')
})

describe('list transfers', () => {
  it.each(['llGiveInventoryList', 'llGiveAgentInventory'])('%s skips missing and no-copy items', async fn => {
    // In-world: extra 1/2 -> valid gift offered, missing entry silently excluded.
    // No-copy exclusion is documented, not measured: needs a second avatar's restricted item.
    const s = await load(`${fn}(llGetOwner(), "folder", ["missing", "gift", "nocopy"]${fn === 'llGiveAgentInventory' ? ', []' : ''});`, [gift(), gift({ name: 'nocopy', permMask: perms(PERM_ALL & ~PERM_COPY) })])
    expect(s.inventoryOffers[0]!.items.map(i => i.name)).toEqual(['gift'])
    expect(s.host.inventory.map(i => i.name)).toContain('nocopy')
    expect(errors(s)).toEqual([])
  })
  it.each(['llGiveInventoryList', 'llGiveAgentInventory'])('%s uses New Inventory for an empty folder name and sleeps three seconds', async fn => {
    // In-world: give 8/19 -> offered folder New Inventory, dt ~= 3 s.
    const s = await load(`${fn}(llGetOwner(), "", ["gift"]${fn === 'llGiveAgentInventory' ? ', []' : ''});`)
    expect(s.inventoryOffers[0]!.folder).toBe('New Inventory')
    expect(s.now).toBe(3000)
    expect(s.global('done')).toBe(1)
  })
  it('reports a list with no transferable items', async () => {
    // In-world: give 10 / extra 3 -> No items passed filter, even with a numeric list entry.
    const s = await load('llGiveInventoryList(llGetOwner(), "folder", [123, "missing"]);')
    expect(errors(s)).toEqual(['Unable to give inventory list: No items passed filter'])
    expect(s.inventoryOffers).toEqual([])
    s.advanceTime(3000); expect(s.global('done')).toBe(1)
  })
  it('reports an absent list destination', async () => {
    // In-world: give 9 / 21 -> Cannot find destination.
    const s = await load(`llGiveInventoryList("${OTHER}", "folder", ["gift"]);`)
    expect(errors(s)).toEqual(['Unable to give inventory list: Cannot find destination'])
    expect(s.inventoryOffers).toEqual([])
  })
})

it.each([
  ['[]', '["gift"]', 'llGetOwner()', 0],
  ['[]', '[]', 'llGetOwner()', -4],
  ['[]', '["missing"]', 'llGetOwner()', -4],
  ['[]', '["gift"]', `"${OTHER}"`, -2],
  ['[999]', '["gift"]', 'llGetOwner()', -1],
  ['[999, 0]', '["gift"]', 'llGetOwner()', -1],
  ['[TRANSFER_DEST]', '["gift"]', 'llGetOwner()', -1],
  ['[TRANSFER_DEST, 123]', '["gift"]', 'llGetOwner()', -1],
  ['[TRANSFER_FLAGS, "x"]', '["gift"]', 'llGetOwner()', -1],
  ['[TRANSFER_FLAGS, 1]', '["gift"]', 'llGetOwner()', 0],
  ['[TRANSFER_DEST, "Trash"]', '["gift"]', 'llGetOwner()', -5],
  ['[TRANSFER_DEST, "a|b|c|d|e"]', '["gift"]', 'llGetOwner()', -5],
  ['[TRANSFER_DEST, ""]', '["gift"]', 'llGetOwner()', 0],
  ['[TRANSFER_DEST, "a||b"]', '["gift"]', 'llGetOwner()', 0],
])('agent transfer options %s items %s target %s return %i silently', async (options, items, target, result) => {
  // In-world: give 11-24 and extra 2-9 -> these result codes, always dt ~= 3 s, no debug error.
  const s = await load(`result = llGiveAgentInventory(${target}, "folder", ${items}, ${options});`)
  s.advanceTime(3000)
  expect(s.global('result')).toBe(result)
  expect(errors(s)).toEqual([])
  expect(s.inventoryOffers).toHaveLength(result === 0 ? 1 : 0)
})

it('records TRANSFER_DEST separately from the leaf folder', async () => {
  // In-world: give 18 -> offer named probe issue-153 root|child|probe issue-153 path.
  const s = await load('llGiveAgentInventory(llGetOwner(), "leaf", ["gift"], [TRANSFER_DEST, "root|child"]);')
  expect(s.inventoryOffers[0]).toMatchObject({ folder: 'leaf', rootPath: ['root', 'child'] })
})

async function pair(foreign = false, drop = false, region = 'test') {
  const world = new World(); world.addRegion('test', { x: 0, y: 0 }); world.addRegion('away', { x: 256, y: 0 })
  const receiver = await loadLinkset({ owner: foreign ? OTHER : OWNER, world, region, prims: [{ key: TARGET, scripts: [{ name: 'receiver', source: { source: `integer changes; default { state_entry() { ${drop ? 'llAllowInventoryDrop(TRUE);' : ''} } changed(integer c) { changes = c; } }` } }] }] })
  const giver = await loadLinkset({ owner: OWNER, world, region: 'test', prims: [{ inventory: [gift()], scripts: [{ name: 'giver', source: { source: `integer done; default { touch_start(integer n) { llGiveInventory("${TARGET}", "gift"); done=1; } }` } }] }] })
  receiver.scripts.receiver!.start(); giver.scripts.giver!.start()
  return { receiver, giver, s: giver.scripts.giver! }
}

it('copies into a World prim without delay and fires CHANGED_INVENTORY', async () => {
  // In-world: give 1 -> dt .044 s, receiver changes=1 c=1 count=2.
  const { s, receiver } = await pair(); s.linkset.touch(0)
  expect(receiver.prims[0]!.inventory.find(i => i.name === 'gift')?.notecardLines).toEqual(['hello'])
  expect(receiver.scripts.receiver!.global('changes')).toBe(1)
  expect(s.global('done')).toBe(1)
})

it('keeps earlier deliveries and gives later items unique names', async () => {
  // In-world: give 1,5,6,repeat -> gift, gift 1, gift 2, gift 3, CHANGED_INVENTORY each time.
  const { s, receiver } = await pair(); s.linkset.touch(0); s.linkset.touch(0)
  expect(receiver.prims[0]!.inventory.filter(i => i.type === InventoryType.NOTECARD).map(i => i.name)).toEqual(['gift', 'gift 1'])
  expect(s.inventoryOffers[0]!.items[0]!.name).toBe('gift')
})

it('does not deliver to a World object in another region', async () => {
  const { s, receiver } = await pair(false, false, 'away'); s.linkset.touch(0)
  expect(receiver.prims[0]!.inventory.map(i => i.name)).not.toContain('gift')
  expect(s.inventoryOffers).toEqual([])
})

it('requires inventory drop for a foreign-owned prim and uses CHANGED_ALLOWED_DROP', async () => {
  // Not measurable here: needs a second avatar to own the destination. Wiki behavior.
  const denied = await pair(true); denied.s.linkset.touch(0)
  expect(denied.receiver.prims[0]!.inventory.map(i => i.name)).not.toContain('gift')
  expect(errors(denied.s).join()).toContain('Blocked by permissions')
  const allowed = await pair(true, true); allowed.s.linkset.touch(0)
  expect(allowed.receiver.prims[0]!.inventory.map(i => i.name)).toContain('gift')
  expect(allowed.receiver.scripts.receiver!.global('changes')).toBe(64)
})

it('can revoke inventory drop after enabling it', async () => {
  // Foreign owner verification needs a second avatar; llAllowInventoryDrop is documented.
  const { receiver, s } = await pair(true, true)
  // A second script in the same prim changes the prim-level setting.
  const toggle = await loadScript({ host: receiver.prims[0]!, source: 'default { state_entry() { llAllowInventoryDrop(FALSE); } }' })
  toggle.start(); s.linkset.touch(0)
  expect(receiver.prims[0]!.inventory.map(i => i.name)).not.toContain('gift')
  expect(errors(s).join()).toContain('Blocked by permissions')
})

it('delivers a list into a prim without creating a folder and sleeps three seconds', async () => {
  // In-world: give 5 -> receiver got gift 1, CHANGED_INVENTORY, dt=3.000011.
  const { s, receiver } = await pair()
  const list = await loadScript({ host: s.host, scriptName: 'list-giver', source: `default { state_entry() { llGiveInventoryList("${TARGET}", "ignored folder", ["gift"]); } }` })
  list.start()
  expect(list.now).toBe(3000)
  expect(list.inventoryOffers[0]).toMatchObject({ target: TARGET, folder: null })
  expect(receiver.prims[0]!.inventory.find(i => i.name === 'gift')).toBeDefined()
  expect(receiver.scripts.receiver!.global('changes')).toBe(1)
})

it('rejects a prim as an agent transfer target', async () => {
  // In-world: give 13 -> -2, no error.
  const { s, receiver } = await pair()
  const agent = await loadScript({ host: s.host, scriptName: 'agent-giver', source: `integer r; default { state_entry() { r=llGiveAgentInventory("${TARGET}", "folder", ["gift"], []); } }` })
  agent.start()
  expect(agent.global('r')).toBe(-2)
  expect(agent.inventoryOffers).toEqual([])
  expect(receiver.prims[0]!.inventory.map(i => i.name)).not.toContain('gift')
})

it('does not mutate the offer history when the recipient edits an item', async () => {
  const { s, receiver } = await pair(); s.linkset.touch(0)
  receiver.prims[0]!.inventory.find(i => i.name === 'gift')!.name = 'edited'
  s.host.inventory.find(i => i.name === 'gift')!.description = 'changed'
  expect(s.inventoryOffers[0]!.items[0]).toMatchObject({ name: 'gift', description: '' })
})

it.each([
  ['[0.0, "root"]', -1],
  ['[TRANSFER_FLAGS, 1.0]', -1],
  ['[TRANSFER_DEST, "trash"]', -5],
  ['[TRANSFER_DEST, " trash "]', -5],
  ['[TRANSFER_DEST, "root|Trash"]', -5],
  ['[TRANSFER_DEST, "Lost And Found"]', -5],
  ['[TRANSFER_DEST, "Current Outfit"]', -5],
  ['[TRANSFER_DEST, "Current Outfit|child"]', -5],
  ['[TRANSFER_DEST, "Inbox"]', -5],
  ['[TRANSFER_DEST, "Outbox"]', -5],
  ['[TRANSFER_DEST, "Objects"]', 0],
  ['[TRANSFER_DEST, "Outfits"]', 0],
  ['[TRANSFER_DEST, "||"]', 0],
  ['[TRANSFER_DEST, "a|b|c|d", TRANSFER_DEST, ""]', 0],
])('validates measured root/options boundary %s -> %i', async (options, expected) => {
  // In-world: validation.lsl / rootcase.lsl -> these codes, Aditi, SLua Tideland, 2026-10-31.
  const s = await load(`result = llGiveAgentInventory(llGetOwner(), "folder", ["gift"], ${options});`)
  expect(s.global('result')).toBe(expected)
  expect(errors(s)).toEqual([])
  expect(s.inventoryOffers).toHaveLength(expected === 0 ? 1 : 0)
})

it.each(['single', 'list'])('rejects %s script delivery to a foreign prim even with inventory drop enabled', async kind => {
  // https://wiki.secondlife.com/wiki/LlAllowInventoryDrop#Caveats
  // Needs a second avatar to measure a destination without modify rights.
  const { s, receiver } = await pair(true, true)
  s.host.addInventory(gift({ name: 'script', type: InventoryType.SCRIPT, permMask: perms(PERM_ALL & ~PERM_COPY) }))
  s.host.addInventory(gift({ name: 'copy-script', type: InventoryType.SCRIPT }))
  const call = kind === 'single' ? `llGiveInventory("${TARGET}", "script")` : `llGiveInventoryList("${TARGET}", "folder", ["gift", "copy-script"])`
  const giver = await loadScript({ host: s.host, scriptName: 'script-giver', source: `default { state_entry() { ${call}; } }` })
  giver.start()
  expect(receiver.prims[0]!.inventory.filter(i => i.name === 'script' || i.name === 'copy-script')).toEqual([])
  expect(s.host.inventory.map(i => i.name)).toContain('script')
  if (kind === 'single') expect(giver.inventoryOffers).toEqual([])
  else expect(giver.inventoryOffers[0]!.items.map(i => i.name)).toEqual(['gift'])
})

it('treats an uppercase owner UUID as the same no-transfer recipient', async () => {
  // In-world: review-upper.lsl -> uppercase owner URL/list offers succeed, no error (Aditi, SLua Tideland, 2026-10-31).
  const s = await load('llGiveInventory((key)llToUpper((string)llGetOwner()), "gift");', [gift({ permMask: perms(PERM_ALL & ~PERM_TRANSFER) })])
  expect(s.inventoryOffers).toHaveLength(1)
  expect(errors(s)).toEqual([])
})

it('only lets the root change the linkset inventory-drop setting', async () => {
  // llAllowInventoryDrop wiki caveat: child calls fail silently. Foreign receipt needs another avatar to measure.
  const world = new World(); world.addRegion('test', { x: 0, y: 0 })
  const recipient = await loadLinkset({ owner: OTHER, world, region: 'test', prims: [
    { scripts: [{ name: 'root', source: { source: 'default { touch_start(integer n) { llAllowInventoryDrop(TRUE); } }' } }] },
    { key: TARGET, scripts: [{ name: 'child', source: { source: 'default { state_entry() { llAllowInventoryDrop(TRUE); } }' } }] },
  ] })
  recipient.scripts.child!.start()
  const giver = await loadLinkset({ owner: OWNER, world, region: 'test', prims: [{ inventory: [gift()], scripts: [{ name: 'giver', source: { source: `default { touch_start(integer n) { llGiveInventory("${TARGET}", "gift"); } }` } }] }] })
  const s = giver.scripts.giver!
  s.linkset.touch(0)
  expect(recipient.prims[1]!.inventory.map(i => i.name)).not.toContain('gift')
  recipient.linkset.touch(1)
  s.linkset.touch(0)
  expect(recipient.prims[1]!.inventory.map(i => i.name)).toContain('gift')
})

it.each(['llGiveInventoryList', 'llGiveAgentInventory'])('%s accepts an uppercase spelling of the owner key', async fn => {
  // In-world: review-upper.lsl -> both uppercase list destinations succeed (Aditi, SLua Tideland, 2026-10-31). Actual no-transfer owner masks need another avatar.
  const s = await load(`${fn}((key)llToUpper((string)llGetOwner()), "folder", ["gift"]${fn === 'llGiveAgentInventory' ? ', []' : ''});`, [gift({ permMask: perms(PERM_ALL & ~PERM_TRANSFER) })])
  expect(s.inventoryOffers).toHaveLength(1)
  expect(errors(s)).toEqual([])
})
