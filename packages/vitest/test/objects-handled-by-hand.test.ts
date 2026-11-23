import { describe, expect, it } from 'vitest'
import { loadLinkset, loadRlvPair, loadScript, PERM_ALL, PERM_COPY, seedRlvInventory, World } from '../src/index.js'
import type { Linkset, Script } from '../src/index.js'

// Every "In-world" note below was measured on the Aditi beta grid, SLua Tideland, 2026-11-23,
// with Firestorm 7 and RLVa 2.4.2, by one avatar or two.
//
// Each probe object held one LSL script that logged every event with a counter that every line
// raised and llGetTime(), and on a chat command said its llGetAttached(), llGetNumberOfPrims(),
// llGetObjectPrimCount and llGetObjectDetails for its own key (OBJECT_PRIM_COUNT,
// OBJECT_ATTACHED_POINT, OBJECT_SERVER_COST, OBJECT_TOTAL_SCRIPT_COUNT, OBJECT_ROOT,
// OBJECT_OWNER), its permissions and llAvatarOnSitTarget(). It set a sit target and asked a
// sitter for PERMISSION_TRIGGER_ANIMATION. Another command put it to sleep in a listen handler.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const probe = `list log; integer n; float cost;
  string details() {
    list d = llGetObjectDetails(llGetKey(), [OBJECT_PRIM_COUNT, OBJECT_ATTACHED_POINT, OBJECT_SERVER_COST]);
    return "att " + (string)llGetAttached() + " opc " + (string)llGetObjectPrimCount(llGetKey()) + " " + llDumpList2String(d, ",");
  }
  default {
    state_entry() { llSitTarget(<0, 0, 0.6>, ZERO_ROTATION); llListen(5, "", "", ""); log += "start"; }
    on_rez(integer p) { log += "rez"; }
    attach(key id) { log += "attach " + (string)(id != NULL_KEY) + " " + details(); }
    changed(integer c) {
      log += "changed " + (string)c;
      if ((c & CHANGED_LINK) && llAvatarOnSitTarget() != NULL_KEY) llRequestPermissions(llAvatarOnSitTarget(), PERMISSION_TRIGGER_ANIMATION);
    }
    run_time_permissions(integer p) { log += "perm " + (string)p; }
    touch_start(integer t) { log += "touch by " + llDetectedName(0); }
    listen(integer c, string name, key id, string m) {
      ++n;
      if (m == "sleep") { log += "sleep"; llSleep(60.0); log += "woke"; }
      else if (m == "cost") cost = llList2Float(llGetObjectDetails(llGetKey(), [OBJECT_SERVER_COST]), 0);
      else log += "heard " + m;
    }
  }`

async function fixture() {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner', position: { x: 118, y: 48, z: 20 } })
  const bob = world.addAvatar({ region: 'home', key: BOB, username: 'bob', name: 'Bob', position: { x: 119, y: 48, z: 20 } })
  return { world, avatar, bob }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

async function box(f: Fixture, scripts = 1, owner = OWNER) {
  const made = await loadLinkset({ world: f.world, region: 'home', owner, position: { x: 119, y: 50, z: 20 },
    prims: [{ scripts: Array.from({ length: scripts }, (_, i) => ({ name: `s${i}`, source: { source: i ? 'default { state_entry() { } }' : probe } })) }] })
  for (const script of Object.values(made.scripts)) script.start()
  made.linkset.advanceTime(100)
  return { linkset: made.linkset, script: made.scripts.s0! }
}

const log = (script: Script) => script.global('log') as string[]
const queue = (f: Fixture, script: Script, event: string, payload: Record<string, unknown>) =>
  f.world.clock.schedule(script, f.world.clock.now, event, payload)
const heard = (m: string) => ({ channel: 5, name: 'owner', id: OWNER, msg: m })
function cost(script: Script) {
  script.fire('listen', heard('cost'))
  return script.global('cost') as number
}

describe('a shift-drag copy', () => {
  // In-world: a shift-drag copy of the box (the viewer's duplicate with no offset) came out at
  // the original's place with a new key. Its script logged state_entry with its counter back at
  // 1 and llGetTime() at 0, and no on_rez. The original logged nothing.
  it('starts its scripts from the top and leaves the original alone', async () => {
    const f = await fixture()
    const seat = await box(f)
    seat.script.fire('listen', heard('one'))
    const copy = seat.linkset.duplicate()
    copy.advanceTime(100)
    const script = copy.allScripts()[0]!
    expect(copy.prims[0]!.key).not.toBe(seat.linkset.prims[0]!.key)
    expect(copy.prims[0]!.params.position).toEqual(seat.linkset.prims[0]!.params.position)
    expect(log(script)).toEqual(['start'])
    expect(script.global('n')).toBe(0)
    expect(log(seat.script)).toEqual(['start', 'heard one'])
    expect(copy.duplicate({ x: 0, y: 1, z: 0 }).prims[0]!.params.position).toEqual({ x: 119, y: 51, z: 20 })
  })

  // In-world: with the avatar on the seat's sit target and the seat holding
  // PERMISSION_TRIGGER_ANIMATION from it, the copy read one prim, nobody on its sit target and
  // no permissions. The avatar stayed seated on the original, which logged nothing more.
  it('leaves a sitter on the original', async () => {
    const f = await fixture()
    const seat = await box(f)
    f.world.sitAvatar(f.avatar, seat.linkset.prims[0]!)
    seat.linkset.advanceTime(100)
    expect(log(seat.script)).toEqual(['start', 'changed 32', 'perm 16'])
    const copy = seat.linkset.duplicate()
    copy.advanceTime(100)
    const script = copy.allScripts()[0]!
    expect(f.avatar.sittingOn).toBe(seat.linkset.prims[0])
    expect(log(seat.script)).toEqual(['start', 'changed 32', 'perm 16'])
    expect(log(script)).toEqual(['start'])
    expect(copy.prims.length).toBe(1)
    expect(script.state.permissions.granted).toBe(0)
  })

  // In-world: a copy made 3 s into the seat's 15 s sleep, with a chat line waiting, logged only
  // state_entry. The original woke and heard the line.
  it('does not carry a sleeping handler or its waiting events', async () => {
    const f = await fixture()
    const seat = await box(f)
    queue(f, seat.script, 'listen', heard('sleep'))
    seat.linkset.advanceTime(3_000)
    queue(f, seat.script, 'listen', heard('a'))
    const copy = seat.linkset.duplicate()
    seat.linkset.advanceTime(60_000)
    expect(log(copy.allScripts()[0]!)).toEqual(['start'])
    expect(log(seat.script)).toEqual(['start', 'sleep', 'woke', 'heard a'])
  })

  // In-world: a copy of a box with one script read OBJECT_SERVER_COST 0.5. A box built with two
  // scripts read 0.75 and so did its copy. Once a sit and a stand had made the box read 1.0, a
  // copy of it still read 0.75.
  it('reads a cost that leaves out its last script', async () => {
    const f = await fixture()
    const one = await box(f, 1)
    expect(cost(one.linkset.duplicate().allScripts()[0]!)).toBe(0.5)
    const two = await box(f, 2)
    two.linkset.recountScripts()
    expect(cost(two.script)).toBe(1)
    const copy = two.linkset.duplicate()
    copy.advanceTime(100)
    expect(cost(copy.allScripts().find(s => s.scriptName === 's0')!)).toBe(0.75)
  })

  // In-world: a copy of a box whose script had been set not running had a stopped script and
  // logged nothing. Set running, it logged state_entry with its counter at 1.
  it('keeps a stopped script stopped until it is started', async () => {
    const f = await fixture()
    const stopped = await box(f)
    stopped.script.running = false
    const copy = stopped.linkset.duplicate()
    copy.advanceTime(100)
    const script = copy.allScripts()[0]!
    expect(script.running).toBe(false)
    expect(log(script)).toEqual([])
    script.running = true
    copy.advanceTime(100)
    expect(log(script)).toEqual(['start'])
  })

  it('copies only a rezzed object', async () => {
    const f = await fixture()
    const worn = await box(f)
    worn.linkset.attachToAvatar(OWNER, 5)
    expect(() => worn.linkset.duplicate()).toThrow('only a rezzed object')
    worn.linkset.detachFromAvatar()
    expect(() => worn.linkset.duplicate()).toThrow('only a rezzed object')
    // Firestorm's Duplicate needs an object its owner may copy (LLSelectMgr::canDuplicate).
    const locked = await box(f)
    locked.linkset.prims[0]!.permMask = { ...locked.linkset.prims[0]!.permMask, owner: PERM_ALL & ~PERM_COPY }
    expect(() => locked.linkset.duplicate()).toThrow('no-copy')
  })
})

describe('wearing a rezzed object and dropping it', () => {
  // In-world: a box built in-world with one script read OBJECT_SERVER_COST 0.5. Worn with the
  // viewer's Attach, it logged attach(wearer) and no on_rez, its counter carried on, and it read
  // 0.5 in attach and afterwards.
  it('keeps the count and the script state when worn from the world', async () => {
    const f = await fixture()
    const worn = await box(f)
    worn.script.fire('listen', heard('one'))
    worn.linkset.attachToAvatar(OWNER, 1)
    worn.linkset.advanceTime(100)
    expect(log(worn.script)).toEqual(['start', 'heard one', 'attach 1 att 1 opc 0 1,1,0.500000'])
    expect(cost(worn.script)).toBe(0.5)
  })

  // In-world: the worn box got a second script, which read 0.75. Dropped with the viewer's Drop,
  // it kept its key and logged attach(NULL_KEY) and no on_rez. In that event it already read
  // llGetAttached 0, llGetObjectPrimCount 1, OBJECT_PRIM_COUNT 1, OBJECT_ATTACHED_POINT 0 and
  // cost 1.0, and so did another object. Its counter and llGetTime() carried on.
  it('stays in the world, reads its prims in attach and counts its scripts again', async () => {
    const f = await fixture()
    const worn = await box(f)
    worn.linkset.attachToAvatar(OWNER, 1)
    worn.linkset.advanceTime(100)
    await loadScript({ host: worn.linkset.prims[0]!, scriptName: 'second', source: 'default { state_entry() { } }' })
    worn.script.fire('listen', heard('one'))
    const before = worn.linkset.prims[0]!.key
    expect(cost(worn.script)).toBe(0.75)
    worn.linkset.dropFromAvatar()
    worn.linkset.advanceTime(100)
    expect(worn.linkset.dead).toBe(false)
    expect(worn.linkset.attachment).toBeNull()
    expect(worn.linkset.prims[0]!.key).toBe(before)
    expect(worn.linkset.prims[0]!.params.position).toEqual(f.avatar.position)
    expect(log(worn.script).slice(-2)).toEqual(['heard one', 'attach 0 att 0 opc 1 1,0,1.000000'])
    expect(worn.script.global('n')).toBe(2)
    expect(f.world.linksets).toContain(worn.linkset)
  })

  // In-world: a worn box set @fly=n and @sendim=n, then was dropped. Both restrictions were
  // still in force 45 s later, and the dropped box could still set them.
  it('keeps the RLV restrictions the object set', async () => {
    const { rlva: f } = await loadRlvPair({ source: 'default { touch_start(integer n) { llOwnerSay("@fly=n,sendim=n"); } }' })
    const issuer = f.script.linkset
    issuer.attachToAvatar(f.avatar.key, 1)
    f.script.fire('touch_start', { num_detected: 1 })
    expect(f.avatar.viewer.restrictions.snapshot().map(r => r.behaviour)).toEqual(['fly', 'sendim'])
    issuer.dropFromAvatar({ x: 10, y: 10, z: 10 })
    expect(issuer.prims[0]!.params.position).toEqual({ x: 10, y: 10, z: 10 })
    expect(f.avatar.viewer.restrictions.snapshot().map(r => r.behaviour)).toEqual(['fly', 'sendim'])
  })

  // In-world: the item the object was worn from was gone from inventory after the drop.
  it('takes the object out of its wearer\'s inventory', async () => {
    const f = await fixture()
    const worn = await box(f)
    seedRlvInventory(f.avatar, { sharedRootId: null, entries: [{ id: 'worn', kind: 'item', parentId: null, name: 'probe', object: worn.linkset, assetType: 'object' }] })
    worn.linkset.attachToAvatar(OWNER, 1)
    f.avatar.viewer.inventory.rememberAttachment('worn', worn.linkset)
    worn.linkset.dropFromAvatar()
    expect(f.avatar.viewer.inventory.attachmentItem(worn.linkset.prims[0]!.key)).toBeUndefined()
    expect(f.avatar.viewer.inventory.attachmentObject('worn')).toBeUndefined()
    expect(f.avatar.viewer.inventory.snapshot()).toEqual([])
  })

  // Firestorm offers Drop only for an attachment with an inventory item, which a temporary
  // attachment does not have (llviewermenu.cpp, LLAttachmentEnableDrop).
  it('does nothing to an object that is not worn or is worn for now', async () => {
    const f = await fixture()
    const rezzed = await box(f)
    rezzed.linkset.dropFromAvatar()
    const temporary = await box(f)
    temporary.linkset.attachToAvatar(OWNER, 1, true)
    temporary.linkset.dropFromAvatar()
    f.world.clock.advance(100)
    expect(log(rezzed.script)).toEqual(['start'])
    expect(temporary.linkset.attachment).not.toBeNull()
  })
})

// What the menu offers is the viewer's own rule. These were read from Firestorm's pie menu state
// for a seat 0.5 m from the avatar and another object 2.5 m away, under each restriction set by a
// worn object, standing and sitting on the seat. @rez, @edit (with or without an exception for
// the object) and an edit lock on the object turned Take off and left Take Copy on, as modelled
// before. Under @editworld alone the menu-state tool also read Take as off, but Firestorm's menu
// code (enable_take and rlvCanDeleteOrReturn) only checks the object while @edit, @rez, @unsit or
// an edit lock is set, so Take stays on there.
describe('the menu\'s Take and Take Copy under RLVa restrictions', () => {
  const issuer = 'string command; default { touch_start(integer n) { llOwnerSay(command); } }'
  type Rlv = Awaited<ReturnType<typeof loadRlvPair>>['rlva']
  function command(f: Rlv, text: string) {
    f.script.setGlobal('command', text)
    f.script.fire('touch_start', { num_detected: 1 })
  }
  async function target(f: Rlv, x: number) {
    const made = await loadLinkset({ world: f.world, owner: f.avatar.key, region: f.avatar.region, position: { x, y: 0, z: 0 },
      prims: [{ scripts: [{ name: 'main', source: { source: 'default { state_entry() { } }' } }] }] })
    return made.linkset
  }
  async function scene() {
    const { rlva: f } = await loadRlvPair({ source: issuer })
    f.script.start()
    f.avatar.position = { x: 0, y: 0, z: 0 }
    return { f, near: await target(f, 0.5), far: await target(f, 2.5) }
  }
  const statuses = (f: Rlv, ...objects: Linkset[]) =>
    objects.flatMap(o => [f.take(o.prims[0]!, { copy: true }).status, f.take(o.prims[0]!).status])

  // In-world: under @interact both entries were off for both objects, standing or seated.
  it('offers neither under @interact', async () => {
    const { f, near, far } = await scene()
    command(f, '@interact=n')
    const attempt = f.take(near.prims[0]!, { copy: true })
    expect(attempt).toMatchObject({ status: 'blocked', reason: 'interact' })
    expect(statuses(f, near, far)).toEqual(['blocked', 'blocked', 'blocked', 'blocked'])
    f.world.sitAvatar(f.avatar, near.prims[0]!)
    expect(f.take(near.prims[0]!, { copy: true }).reason).toBe('interact')
  })

  // In-world: under @fartouch both entries were off for the object 2.5 m away and on for the
  // seat 0.5 m away.
  it('offers neither past the @fartouch reach', async () => {
    const { f, near, far } = await scene()
    command(f, '@fartouch=n')
    expect(f.take(far.prims[0]!, { copy: true })).toMatchObject({ status: 'blocked', reason: 'fartouch' })
    expect(f.take(far.prims[0]!).status).toBe('blocked')
    expect(statuses(f, near)).toEqual(['taken', 'taken'])
  })

  // In-world: @touchall, @touchworld, @showinv, @sit, @buy, @sittp, @editattach and @unsit
  // (standing) left both entries on. Seated on the seat, @sittp and @standtp left Take Copy on.
  it('offers both under restrictions that do not reach them', async () => {
    for (const restriction of ['touchall', 'touchworld', 'showinv', 'sit', 'buy', 'sittp', 'editattach', 'unsit']) {
      const { f, near, far } = await scene()
      command(f, `@${restriction}=n`)
      expect(statuses(f, near, far), restriction).toEqual(['taken', 'taken', 'taken', 'taken'])
    }
    for (const restriction of ['sittp', 'standtp']) {
      const { f, near } = await scene()
      f.world.sitAvatar(f.avatar, near.prims[0]!)
      command(f, `@${restriction}=n`)
      expect(f.take(near.prims[0]!, { copy: true }).status, restriction).toBe('taken')
    }
  })
})

describe('Take Copy by another avatar', () => {
  async function everyoneCopy(f: Fixture, contents = true) {
    const made = await box(f)
    for (const prim of made.linkset.prims) {
      prim.permMask = { ...prim.permMask, everyone: PERM_COPY, next: PERM_ALL }
      if (contents) for (const item of prim.inventory) item.permMask = { ...item.permMask, everyone: PERM_COPY, next: PERM_ALL }
    }
    return made
  }
  let items = 0
  function rezFor(f: Fixture, saved: Linkset) {
    const id = `item-${++items}`
    seedRlvInventory(f.bob, { sharedRootId: null, entries: [{ id, kind: 'item', parentId: null, name: 'probe', object: saved, assetType: 'object' }] })
    const object = f.world.attemptAvatarRez(f.bob, id, { x: 119, y: 51, z: 20 }).object!
    return { linkset: object, script: object.allScripts()[0]! }
  }

  // In-world: with everyone-copy set on the object, the other avatar's menu still had Take Copy
  // off ("no-copy") while the script inside lacked everyone-copy. With both set it was on.
  it('needs everyone-copy on the object and its contents', async () => {
    const f = await fixture()
    const plain = await box(f)
    const objectOnly = await everyoneCopy(f, false)
    const both = await everyoneCopy(f)
    expect(f.world.attemptAvatarTake(f.bob, plain.linkset.prims[0]!, { copy: true })).toMatchObject({ status: 'unsupported', reason: 'owner' })
    expect(f.world.attemptAvatarTake(f.bob, objectOnly.linkset.prims[0]!, { copy: true }).reason).toBe('owner')
    expect(f.world.attemptAvatarTake(f.bob, both.linkset.prims[0]!).reason).toBe('owner')
    const taken = f.world.attemptAvatarTake(f.bob, both.linkset.prims[0]!, { copy: true })
    expect(taken.status).toBe('taken')
    expect(taken.object!.owner).toBe(BOB)
    expect(both.linkset.dead).toBe(false)
    expect(both.linkset.owner).toBe(OWNER)
  })

  // In-world: the original got changed(CHANGED_OWNER) when the other avatar took a copy, still
  // reading its owner. A copy taken by the owner raised nothing.
  it('raises changed(CHANGED_OWNER) in the original', async () => {
    const f = await fixture()
    const made = await everyoneCopy(f)
    f.world.attemptAvatarTake(f.avatar, made.linkset.prims[0]!, { copy: true })
    made.linkset.advanceTime(100)
    expect(log(made.script)).toEqual(['start'])
    f.world.attemptAvatarTake(f.bob, made.linkset.prims[0]!, { copy: true })
    made.linkset.advanceTime(100)
    expect(log(made.script)).toEqual(['start', 'changed 128'])
  })

  // In-world: the object went to sleep for 60 s in a listen handler and was touched by its owner.
  // The other avatar took a copy and rezzed it 5 s later. The original woke, ran the touch, then
  // changed(128). The copy woke 5.6 s after the original with the same llGetTime(), then logged
  // on_rez, the touch by the owner and changed(128), with its counter carried on and no
  // permissions. A copy taken later while the original was idle logged on_rez and changed(128).
  it('carries a sleeping handler to the new owner, who gets changed(CHANGED_OWNER) after on_rez', async () => {
    const f = await fixture()
    const made = await everyoneCopy(f)
    queue(f, made.script, 'listen', heard('sleep'))
    made.linkset.advanceTime(3_000)
    queue(f, made.script, 'touch_start', { num_detected: 1, detected: [{ key: OWNER, name: 'Owner' }] })
    const taken = f.world.attemptAvatarTake(f.bob, made.linkset.prims[0]!, { copy: true }).object!
    const copy = rezFor(f, taken)
    made.linkset.advanceTime(60_000)
    expect(log(made.script)).toEqual(['start', 'sleep', 'woke', 'touch by Owner', 'changed 128'])
    expect(log(copy.script)).toEqual(['start', 'sleep', 'woke', 'rez', 'touch by Owner', 'changed 128'])
    expect(copy.linkset.owner).toBe(BOB)
    expect(copy.script.global('n')).toBe(1)
    expect(copy.script.state.permissions.granted).toBe(0)
    const idle = rezFor(f, f.world.attemptAvatarTake(f.bob, made.linkset.prims[0]!, { copy: true }).object!)
    idle.linkset.advanceTime(100)
    expect(log(idle.script).slice(-2)).toEqual(['rez', 'changed 128'])
  })
})
