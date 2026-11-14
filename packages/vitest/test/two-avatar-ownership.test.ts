import { describe, expect, it } from 'vitest'
import {
  loadLinkset, World, makeInventoryItem, InventoryType, NULL_KEY,
  PERM_ALL, PERM_COPY, PERM_MODIFY, PERM_MOVE, PERM_TRANSFER, type InventoryItem,
} from '../src/index.js'

// Measured on the Aditi beta grid, SLua Tideland, 2026-11-14, Firestorm with RLVa,
// with two avatars: "owner" (i doll) and "other" (fivebot). Items restricted for their
// owner were made by setting next-owner permissions and giving the item to the other avatar.
// https://wiki.secondlife.com/wiki/LlGiveInventory
// https://wiki.secondlife.com/wiki/LlAllowInventoryDrop
// https://wiki.secondlife.com/wiki/LlCreateLink
// https://wiki.secondlife.com/wiki/LlRemoteLoadScriptPin
// https://wiki.secondlife.com/wiki/LlAttachToAvatarTemp
const OWNER = '00000000-0000-0000-0000-00000000000a'
const OTHER = '00000000-0000-0000-0000-00000000000b'
const DEBUG = 2147483647
const masks = (owner: number, next = PERM_ALL) => ({ base: owner, owner, group: 0, everyone: 0, next })
const NO_COPY = PERM_ALL & ~PERM_COPY
const NO_MODIFY = PERM_ALL & ~PERM_MODIFY
const NO_TRANSFER = PERM_ALL & ~PERM_TRANSFER
const note = (name: string, permMask = masks(PERM_ALL)) => makeInventoryItem({ name, type: InventoryType.NOTECARD, permMask, notecardLines: ['x'] })

const RECEIVER = `list changes; default {
  touch_start(integer n) { llAllowInventoryDrop(TRUE); }
  changed(integer c) { changes += [c]; }
}`

async function scene() {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: OWNER, username: 'owner.resident' })
  world.addAvatar({ region: 'home', key: OTHER, username: 'other.resident' })
  return world
}

async function receiver(world: World, owner: string, prims = 1) {
  return loadLinkset({ world, region: 'home', owner, prims: Array.from({ length: prims }, (_, i) => ({
    name: `R${i + 1}`, scripts: [{ name: `r${i + 1}`, source: { source: RECEIVER } }],
  })) })
}

async function giver(world: World, items: InventoryItem[], call: string) {
  const loaded = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ name: 'Giver', inventory: items, scripts: [{ name: 'giver', source: { source: `list changes; float dt;
    default { touch_start(integer n) { float t = llGetTime(); ${call} dt = llGetTime() - t; } changed(integer c) { changes += [c]; } }` } }] }] })
  const script = loaded.scripts.giver!
  script.start()
  return { ...loaded, script, give: () => { loaded.linkset.touch(0) }, errors: () => script.chat.filter(c => c.channel === DEBUG).map(c => c.text) }
}

const names = (items: ReadonlyArray<InventoryItem>) => items.map(i => i.name)

describe('giving to an object owned by someone else', () => {
  it('delivers a script and a list holding a script to a prim that allows drops, with next-owner masks', async () => {
    // In-world: llGiveInventory of a script to the other avatar's prim after its llAllowInventoryDrop(TRUE)
    // -> delivered, one changed(64), masks 532480/532480/532480 (base and owner cut to next).
    // llGiveInventoryList of a notecard and a script -> both delivered, one changed(64), 3 s.
    const world = await scene()
    const r = await receiver(world, OTHER)
    r.scripts.r1!.start(); r.linkset.touch(0)
    const payload = makeInventoryItem({ name: 'payload', type: InventoryType.SCRIPT, permMask: masks(PERM_ALL, PERM_MOVE | PERM_TRANSFER) })
    const g = await giver(world, [payload, note('gift')], `llGiveInventory("${r.prims[0]!.key}", "payload"); llGiveInventoryList("${r.prims[0]!.key}", "f", ["gift", "payload"]);`)
    g.give()
    expect(g.errors()).toEqual([])
    expect(names(r.prims[0]!.inventory).sort()).toEqual(['gift', 'payload', 'payload 1', 'r1'])
    expect(r.prims[0]!.inventory.find(i => i.name === 'payload')!.permMask).toMatchObject({ base: 532480, owner: 532480, next: 532480 })
    expect(r.scripts.r1!.global('changes')).toEqual([64, 64])
    expect(g.script.global('dt')).toBeCloseTo(3, 5)
  })

  it('refuses a no-transfer item to another owner\'s prim as blocked by permissions', async () => {
    // In-world: no-transfer notecard to the other avatar's prim that allows drops ->
    // "Unable to give inventory: 'Blocked by permissions'.", no delay.
    const world = await scene()
    const r = await receiver(world, OTHER)
    r.scripts.r1!.start(); r.linkset.touch(0)
    const g = await giver(world, [note('locked', masks(NO_TRANSFER))], `llGiveInventory("${r.prims[0]!.key}", "locked");`)
    g.give()
    expect(g.errors()).toEqual(["Unable to give inventory: 'Blocked by permissions'."])
    expect(names(r.prims[0]!.inventory)).toEqual(['r1'])
    expect(g.script.global('dt')).toBe(0)
  })

  it('leaves no-transfer items out of a list given to another owner\'s prim', async () => {
    // In-world: llGiveInventoryList of a no-transfer and a copyable notecard to the other avatar's prim
    // that allows drops -> only the copyable one arrived, one changed(64); the no-transfer one alone ->
    // "Unable to give inventory list: No items passed filter", 3 s each.
    const world = await scene()
    const r = await receiver(world, OTHER)
    r.scripts.r1!.start(); r.linkset.touch(0)
    const g = await giver(world, [note('locked', masks(NO_TRANSFER)), note('gift')],
      `llGiveInventoryList("${r.prims[0]!.key}", "f", ["locked", "gift"]); llGiveInventoryList("${r.prims[0]!.key}", "f", ["locked"]);`)
    g.give()
    expect(names(r.prims[0]!.inventory).sort()).toEqual(['gift', 'r1'])
    expect(r.scripts.r1!.global('changes')).toEqual([64])
    expect(g.errors()).toEqual(['Unable to give inventory list: No items passed filter'])
    expect(g.script.global('dt')).toBeCloseTo(6, 5)
  })

  it('refuses a no-transfer item to another avatar without the two-second delay', async () => {
    // In-world: no-transfer notecard to the other avatar -> "Unable to give inventory:
    // 'No permission to transfer'.", dt=0.
    const world = await scene()
    const g = await giver(world, [note('locked', masks(NO_TRANSFER))], `llGiveInventory("${OTHER}", "locked");`)
    g.give()
    expect(g.errors()).toEqual(["Unable to give inventory: 'No permission to transfer'."])
    expect(g.script.inventoryOffers).toEqual([])
    expect(g.script.global('dt')).toBe(0)
  })

  it('moves a no-copy item into another owner\'s prim with no changed event in the giver', async () => {
    // In-world: no-copy notecard to the other avatar's prim that allows drops -> moved out of the
    // giver, which heard nothing; the receiver got changed(64); owner mask 548864 kept.
    const world = await scene()
    const r = await receiver(world, OTHER)
    r.scripts.r1!.start(); r.linkset.touch(0)
    const g = await giver(world, [note('single', masks(NO_COPY, NO_COPY))], `llGiveInventory("${r.prims[0]!.key}", "single");`)
    g.give()
    expect(names(g.prims[0]!.inventory)).toEqual(['giver'])
    expect(r.prims[0]!.inventory.find(i => i.name === 'single')!.permMask.owner).toBe(NO_COPY)
    expect(g.script.global('changes')).toEqual([])
    expect(r.scripts.r1!.global('changes')).toEqual([64])
  })

  it('treats each prim\'s inventory drop setting as its own, root or child', async () => {
    // In-world, a two-prim object of the other avatar: llAllowInventoryDrop(TRUE) from the child's
    // script alone -> a gift to the child arrived (changed(64) in the child). With only the root
    // allowing drops, a gift to the child was blocked and one to the root arrived; with only the
    // child allowing them, a gift to the root was blocked and one to the child arrived.
    const world = await scene()
    const r = await receiver(world, OTHER, 2)
    r.scripts.r1!.start(); r.scripts.r2!.start()
    const [root, child] = r.prims as [typeof r.prims[0], typeof r.prims[0]]
    const g = await giver(world, [note('gift')], 'llGiveInventory((key)llGetObjectDesc(), "gift");')
    const giveTo = (prim: typeof root) => { g.prims[0]!.description = prim.key; g.give() }
    r.linkset.touch(2)
    giveTo(child)
    expect(names(child.inventory)).toContain('gift')
    giveTo(root)
    expect(names(root.inventory)).not.toContain('gift')
    child.allowInventoryDrop = false
    r.linkset.touch(1)
    giveTo(child)
    expect(names(child.inventory).filter(n => n.startsWith('gift'))).toEqual(['gift'])
    giveTo(root)
    expect(names(root.inventory)).toContain('gift')
    expect(g.errors()).toEqual(Array(2).fill("Unable to give inventory: 'Blocked by permissions'."))
    expect(r.scripts.r2!.global('changes')).toEqual([64])
    expect(r.scripts.r1!.global('changes')).toEqual([64])
  })

  it('needs inventory drop on a no-modify prim its own owner gives to, and reports CHANGED_ALLOWED_DROP', async () => {
    // In-world: a no-modify object given by the other avatar and rezzed by the owner. A gift from the
    // owner's own giver -> 'Blocked by permissions'. After that object's llAllowInventoryDrop(TRUE) ->
    // delivered with changed(64); the notecard kept full owner masks, and a script was delivered too.
    const world = await scene()
    const r = await receiver(world, OWNER)
    r.prims[0]!.permMask = masks(NO_MODIFY, NO_MODIFY)
    r.scripts.r1!.start()
    const payload = makeInventoryItem({ name: 'payload', type: InventoryType.SCRIPT })
    const g = await giver(world, [note('gift', masks(PERM_ALL, NO_MODIFY)), payload], `llGiveInventory("${r.prims[0]!.key}", "gift"); llGiveInventory("${r.prims[0]!.key}", "payload");`)
    g.give()
    expect(g.errors()).toEqual(Array(2).fill("Unable to give inventory: 'Blocked by permissions'."))
    r.linkset.touch(0)
    g.give()
    expect(g.errors()).toHaveLength(2)
    expect(r.prims[0]!.inventory.find(i => i.name === 'gift')!.permMask).toMatchObject({ base: PERM_ALL, owner: PERM_ALL })
    expect(names(r.prims[0]!.inventory)).toContain('payload')
    expect(r.scripts.r1!.global('changes')).toEqual([64, 64])
  })
})

describe('llCreateLink across owners and modify rights', () => {
  async function linker(targetOwner: string, opts: { targetNoMod?: boolean, callerNoMod?: boolean } = {}) {
    const world = await scene()
    const target = await loadLinkset({ world, region: 'home', owner: targetOwner, prims: [{ name: 'T' }] })
    if (opts.targetNoMod) target.prims[0]!.permMask = masks(NO_MODIFY)
    const caller = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ name: 'C', scripts: [{ name: 'c', source: { source: `integer prims;
      default { state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
      touch_start(integer n) { llCreateLink("${target.prims[0]!.key}", TRUE); llCreateLink("${target.prims[0]!.key}", FALSE); prims = llGetNumberOfPrims(); } }` } }] }] })
    if (opts.callerNoMod) caller.prims[0]!.permMask = masks(NO_MODIFY)
    const c = caller.scripts.c!
    c.start(); c.grantPermissions()
    caller.linkset.touch(0)
    caller.linkset.advanceTime(2000)
    return { c, target, caller }
  }

  it.each([
    ['owned by someone else', OTHER, {}],
    ['no-modify for the owner', OWNER, { targetNoMod: true }],
  ] as const)('leaves a target %s alone, silently', async (_label, owner, opts) => {
    // In-world: llCreateLink to the other avatar's object, and to a no-modify object of the owner,
    // with TRUE and with FALSE -> llGetNumberOfPrims stayed 1, no changed, nothing on DEBUG_CHANNEL.
    // The same grant then linked an ordinary object of the owner.
    const { c, target, caller } = await linker(owner, opts)
    expect(c.global('prims')).toBe(1)
    expect(target.linkset.prims).toHaveLength(1)
    expect(caller.linkset.prims).toHaveLength(1)
    expect(c.chat.filter(m => m.channel === DEBUG)).toEqual([])
  })

  it('links an ordinary object of the same owner with the same grant', async () => {
    // In-world: the control after the refusals above -> two prims and changed(32).
    const { c } = await linker(OWNER)
    expect(c.global('prims')).toBe(2)
  })

  it('does nothing from a no-modify object', async () => {
    // In-world: the owner's no-modify object, holding the owner's PERMISSION_CHANGE_LINKS, linking an
    // ordinary object of the owner with TRUE and FALSE -> still one prim, no error.
    const { c } = await linker(OWNER, { callerNoMod: true })
    expect(c.global('prims')).toBe(1)
    expect(c.chat.filter(m => m.channel === DEBUG)).toEqual([])
  })
})

describe('llRemoteLoadScriptPin across owners and copy rights', () => {
  async function loader(target: { owner: string, noMod?: boolean }, payloadMask = masks(PERM_ALL)) {
    const world = await scene()
    const t = await loadLinkset({ world, region: 'home', owner: target.owner, prims: [{ name: 'Target', scripts: [{ name: 'watch', source: { source: 'list changes; default { changed(integer c) { changes += [c]; } }' } }] }] })
    t.scripts.watch!.start()
    t.prims[0]!.remoteScriptAccessPin = 42
    if (target.noMod) t.prims[0]!.permMask = masks(NO_MODIFY)
    const l = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ name: 'Loader', scripts: [
      { name: 'payload', source: { source: 'integer param; default { state_entry() { param = llGetStartParameter(); } }' } },
      { name: 'send', source: { source: `default { state_entry() { llRemoteLoadScriptPin("${t.prims[0]!.key}", "payload", 42, TRUE, 7); } }` } },
    ] }] })
    l.prims[0]!.inventory.find(i => i.name === 'payload')!.permMask = payloadMask
    const send = l.scripts.send!
    send.start()
    l.linkset.advanceTime(3000)
    return { t, l, send, errors: send.chat.filter(c => c.channel === DEBUG).map(c => c.text) }
  }

  it.each([
    ['owned by someone else', { owner: OTHER }],
    ['no-modify for the owner', { owner: OWNER, noMod: true }],
  ] as const)('refuses a target %s even when its PIN matches', async (_label, target) => {
    // In-world: the other avatar's object set PIN 42 and a no-modify object of the owner set PIN 43;
    // loads with the matching PIN -> "Task '<loader>' trying to illegally load script onto task
    // '<target>'!", nothing loaded, the full 3 s delay.
    const { t, errors } = await loader(target)
    expect(errors).toEqual(["Task 'Loader' trying to illegally load script onto task 'Target'!"])
    expect(names(t.prims[0]!.inventory)).toEqual(['watch'])
  })

  it('moves a no-copy script into the target', async () => {
    // In-world: a script that was no-copy for its owner, loaded into the owner's prim with a matching
    // PIN -> gone from the loader, running in the target with start parameter 7, the target's script
    // said changed(1); its masks stayed 548864.
    const { t, l, errors } = await loader({ owner: OWNER }, masks(NO_COPY, NO_COPY))
    expect(errors).toEqual([])
    expect(names(l.prims[0]!.inventory)).toEqual(['send'])
    expect(t.prims[0]!.findScript('payload')!.global('param')).toBe(7)
    expect(t.prims[0]!.inventory.find(i => i.name === 'payload')!.permMask.owner).toBe(NO_COPY)
    expect(t.scripts.watch!.global('changes')).toEqual([1])
  })
})

describe('llAttachToAvatarTemp to an avatar who is not the owner', () => {
  async function temp(items: InventoryItem[] = []) {
    const world = await scene()
    const loaded = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ inventory: items, scripts: [{ name: 't', source: { source: `list log; key owner; integer perms; key pkey;
      default { state_entry() { llRequestPermissions("${OTHER}", PERMISSION_ATTACH); }
      run_time_permissions(integer p) { llAttachToAvatarTemp(ATTACH_RHAND); owner = llGetOwner(); perms = llGetPermissions(); pkey = llGetPermissionsKey(); }
      attach(key id) { log += ["attach", id]; }
      changed(integer c) { log += ["changed", c]; } }` } }] }] })
    loaded.prims[0]!.permMask = masks(PERM_ALL, PERM_MOVE | PERM_COPY | PERM_TRANSFER)
    const t = loaded.scripts.t!
    t.start(); t.grantPermissions()
    return { ...loaded, t }
  }

  it('hands the object over with no permissions, then runs attach before changed', async () => {
    // In-world: right after the call in the same handler llGetOwner was the new owner,
    // llGetPermissions 0 and llGetPermissionsKey NULL_KEY; then attach(new owner), then changed(128).
    const { t, linkset } = await temp()
    expect(t.global('owner')).toBe(OTHER)
    expect(t.global('perms')).toBe(0)
    expect(t.global('pkey')).toBe(NULL_KEY)
    expect(t.global('log')).toEqual(['attach', OTHER, 'changed', 128])
    expect(linkset.attachment).toMatchObject({ avatar: OTHER, temporary: true })
  })

  it('clears the permissions every script in the object held', async () => {
    // In-world: a two-prim object whose child script held PERMISSION_TRIGGER_ANIMATION from the owner;
    // after the root's llAttachToAvatarTemp to the other avatar the child read llGetPermissions 0 and
    // llGetPermissionsKey NULL_KEY, and both scripts ran attach, then changed(128).
    const world = await scene()
    const { scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [
      { scripts: [{ name: 'root', source: { source: `default { state_entry() { llRequestPermissions("${OTHER}", PERMISSION_ATTACH); }
        run_time_permissions(integer p) { llAttachToAvatarTemp(ATTACH_RHAND); } }` } }] },
      { scripts: [{ name: 'child', source: { source: `list log; default { state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_TRIGGER_ANIMATION); }
        attach(key id) { log += ["attach", llGetPermissions(), llGetPermissionsKey()]; }
        changed(integer c) { log += ["changed", c]; } }` } }] },
    ] })
    scripts.child!.start(); scripts.child!.grantPermissions()
    scripts.root!.start(); scripts.root!.grantPermissions()
    expect(scripts.child!.global('log')).toEqual(['attach', 0, NULL_KEY, 'changed', 128])
  })

  it('ignores an answer to an earlier request once the object has a new owner', async () => {
    // In-world: the child script's dialog to the owner was left open through the root's transfer to the
    // other avatar, then answered Yes -> no run_time_permissions, llGetPermissions 0, key NULL_KEY.
    const world = await scene()
    const { scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [
      { scripts: [{ name: 'root', source: { source: `default { state_entry() { llRequestPermissions("${OTHER}", PERMISSION_ATTACH); }
        run_time_permissions(integer p) { llAttachToAvatarTemp(ATTACH_RHAND); } }` } }] },
      { scripts: [{ name: 'child', source: { source: `integer answers; default { state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_TRIGGER_ANIMATION); }
        run_time_permissions(integer p) { ++answers; } }` } }] },
    ] })
    scripts.child!.start()
    scripts.root!.start(); scripts.root!.grantPermissions()
    expect(() => scripts.child!.grantPermissions()).toThrow('no pending permission request')
    expect(scripts.child!.global('answers')).toBe(0)
  })

  it('gives the new owner the next-owner masks of the object and its contents', async () => {
    // In-world: object next-owner copy and transfer, no modify; a notecard the same -> after the
    // transfer the object read 565248 as base, owner and next, and so did the notecard.
    const { prims } = await temp([note('gift', masks(PERM_ALL, PERM_MOVE | PERM_COPY | PERM_TRANSFER))])
    expect(prims[0]!.permMask).toMatchObject({ base: 565248, owner: 565248, next: 565248 })
    expect(prims[0]!.inventory.find(i => i.name === 'gift')!.permMask).toMatchObject({ base: 565248, owner: 565248, next: 565248 })
  })

  it('refuses a transfer of no-transfer contents and keeps the grant', async () => {
    // In-world: the other avatar's attach grant, a no-transfer notecard inside -> "No permission to
    // transfer" on DEBUG_CHANNEL, still owned by the owner, llGetPermissions 32.
    const { t, linkset } = await temp([note('locked', masks(NO_TRANSFER))])
    expect(t.chat.filter(c => c.channel === DEBUG).map(c => c.text)).toEqual(['No permission to transfer'])
    expect(linkset.owner).toBe(OWNER)
    expect(linkset.attachment).toBeNull()
    expect(t.global('perms')).toBe(32)
  })
})

describe('an object item that was restricted for its owner', () => {
  it('rezzes with the object\'s own masks, not the item\'s', async () => {
    // In-world: an object the other avatar gave with next-owner copy and transfer, no modify, put in the
    // owner's prim. The item read 532480 and llRezObject used it up; the rezzed object read 565248 as
    // base, owner and next, and ran on_rez, then changed(128).
    const world = await scene()
    const payload = await loadLinkset({ owner: OWNER, prims: [{ name: 'payload' }] })
    payload.prims[0]!.permMask = masks(565248, 565248)
    const item = makeInventoryItem({ name: 'payload', type: InventoryType.OBJECT, permMask: masks(532480, 532480) })
    Object.assign(item, { object: payload.linkset })
    const rezzer = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ inventory: [item], scripts: [{ name: 'r', source: { source: `list perms;
      default { state_entry() { llRezObject("payload", llGetPos() + <0, 0, 1>, ZERO_VECTOR, ZERO_ROTATION, 3); }
      object_rez(key id) { perms = llList2List(llGetObjectDetails(id, [OBJECT_PERMS]), 0, 1); } }` } }] }] })
    rezzer.scripts.r!.start()
    rezzer.linkset.advanceTime(200)
    expect(rezzer.scripts.r!.global('perms')).toEqual([565248, 565248])
    expect(names(rezzer.prims[0]!.inventory)).toEqual(['r'])
  })
})

describe('inside an object that is no-modify for its owner', () => {
  async function noMod() {
    const world = await scene()
    const loaded = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [
      { name: 'Root', inventory: [note('gift')], scripts: [
        { name: 'payload', source: { source: 'default { state_entry() {} }' } },
        { name: 'root', source: { source: `default { state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
          touch_start(integer n) { key child = llGetLinkKey(2); llGiveInventory(child, "gift"); llRemoteLoadScriptPin(child, "payload", 45, TRUE, 0); llBreakLink(2); llBreakAllLinks(); } }` } }] },
      { name: 'Child', scripts: [{ name: 'child', source: { source: 'default { state_entry() { llSetRemoteScriptAccessPin(45); } }' } }] },
    ] })
    for (const prim of loaded.prims) prim.permMask = masks(NO_MODIFY, NO_MODIFY)
    loaded.scripts.child!.start()
    const root = loaded.scripts.root!
    root.start(); root.grantPermissions()
    loaded.linkset.touch(1)
    loaded.linkset.advanceTime(4000)
    return { ...loaded, root }
  }

  it('blocks gifts and remote loads to its own child', async () => {
    // In-world: a two-prim object that was no-modify for the owner. Its root gave a notecard to its own
    // child -> 'Blocked by permissions'; it loaded a script into the child with the child's PIN -> the
    // illegal-load error. Nothing arrived.
    const { root, prims } = await noMod()
    expect(root.chat.filter(c => c.channel === DEBUG).map(c => c.text)).toEqual([
      "Unable to give inventory: 'Blocked by permissions'.",
      "Task 'Root' trying to illegally load script onto task 'Child'!",
    ])
    expect(names(prims[1]!.inventory)).toEqual(['child'])
  })

  it('cannot break its links', async () => {
    // In-world: the same object's root, holding the owner's PERMISSION_CHANGE_LINKS, called llBreakLink(2)
    // -> still two prims, no error. A three-prim no-modify object: llBreakAllLinks and llBreakLink(3) ->
    // still three prims, no error.
    const { linkset } = await noMod()
    expect(linkset.prims).toHaveLength(2)
  })
})

describe('an object that is no-transfer for its owner', () => {
  async function wear(avatar: string) {
    const world = await scene()
    const loaded = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 't', source: { source: `
      default { state_entry() { llRequestPermissions("${avatar}", PERMISSION_ATTACH); }
      run_time_permissions(integer p) { llAttachToAvatarTemp(ATTACH_RHAND); } }` } }] }] })
    loaded.prims[0]!.permMask = masks(NO_TRANSFER, PERM_MOVE | PERM_COPY | PERM_MODIFY)
    const t = loaded.scripts.t!
    t.start(); t.grantPermissions()
    return { ...loaded, t }
  }

  it('refuses a temporary attach to another avatar', async () => {
    // In-world: an object that read 573440 as base, owner and next, with the other avatar's grant ->
    // "No permission to transfer", still the owner's, llGetPermissions 32.
    const { t, linkset } = await wear(OTHER)
    expect(t.chat.map(c => c.text)).toEqual(['No permission to transfer'])
    expect(linkset.owner).toBe(OWNER)
    expect(linkset.attachment).toBeNull()
  })

  it('still attaches temporarily to its owner', async () => {
    // In-world: the same object with the owner's grant -> attached, no error.
    const { t, linkset } = await wear(OWNER)
    expect(t.chat).toEqual([])
    expect(linkset.attachment).toMatchObject({ avatar: OWNER, temporary: true })
  })
})

describe('a no-copy script that moves itself', () => {
  it('stops in the loading prim once a remote load has moved it', async () => {
    // In-world: a script that was no-copy for its owner called llRemoteLoadScriptPin with its own name into
    // the owner's prim -> it ran state_entry in the target, the loading prim was left empty, and the line
    // the caller said after the call never came.
    const world = await scene()
    const target = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ name: 'Target' }] })
    target.prims[0]!.remoteScriptAccessPin = 46
    const loader = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'self', source: { source: `integer after; integer entries;
      default { state_entry() { ++entries; if (llGetStartParameter() == 9) return; llRemoteLoadScriptPin("${target.prims[0]!.key}", llGetScriptName(), 46, TRUE, 9); after = 1; llSay(0, "after"); } }` } }] }] })
    loader.prims[0]!.inventory[0]!.permMask = masks(NO_COPY, NO_COPY)
    const self = loader.scripts.self!
    self.start()
    loader.linkset.advanceTime(4000)
    expect(names(loader.prims[0]!.inventory)).toEqual([])
    expect(self.chat).toEqual([])
    expect(target.prims[0]!.findScript('self')!.global('entries')).toBe(1)
  })

  it('stops the same way after giving itself to another avatar', async () => {
    // As measured for the remote load above; a no-copy gift moves the item the same way.
    const world = await scene()
    const giver = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'self', source: { source: `
      default { state_entry() { llGiveInventory("${OTHER}", llGetScriptName()); llSay(0, "after"); } }` } }] }] })
    giver.prims[0]!.inventory[0]!.permMask = masks(NO_COPY, NO_COPY)
    const self = giver.scripts.self!
    self.start()
    expect(names(giver.prims[0]!.inventory)).toEqual([])
    expect(self.chat).toEqual([])
    expect(self.inventoryOffers[0]!.items.map(i => i.name)).toEqual(['self'])
  })
})

describe('an object item given to another owner', () => {
  it('rezzes for the new owner with the object\'s next-owner masks', async () => {
    // In-world: an object the other avatar gave to the owner, whose next owner could copy and transfer but
    // not modify, read 565248 as base, owner and next when the owner's prim rezzed it. A script's gift to
    // another owner cuts the object's masks the same way.
    const world = await scene()
    const payload = await loadLinkset({ owner: OWNER, prims: [{ name: 'payload' }] })
    payload.prims[0]!.permMask = masks(PERM_ALL, PERM_MOVE | PERM_COPY | PERM_TRANSFER)
    const item = makeInventoryItem({ name: 'payload', type: InventoryType.OBJECT })
    Object.assign(item, { object: payload.linkset })
    const r = await receiver(world, OTHER)
    r.scripts.r1!.start(); r.linkset.touch(0)
    const g = await giver(world, [item], `llGiveInventory("${r.prims[0]!.key}", "payload");`)
    g.give()
    const received = r.prims[0]!.inventory.find(i => i.name === 'payload')!
    expect(received.object!.prims[0]!.permMask).toMatchObject({ base: 565248, owner: 565248, next: 565248 })
    expect(payload.prims[0]!.permMask.owner).toBe(PERM_ALL)
  })
})
