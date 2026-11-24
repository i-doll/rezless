import { describe, expect, it } from 'vitest'
import {
  loadLinkset,
  loadRlvPair,
  makeInventoryItem,
  seedRlvInventory,
  InventoryType,
  World,
  CAMERA_ACTIVE,
  CONTROL_BACK,
  CONTROL_FWD,
  CONTROL_LEFT,
  CONTROL_ROT_LEFT,
  NULL_KEY,
  PERMISSION_ATTACH,
  PERMISSION_CONTROL_CAMERA,
  PERMISSION_TAKE_CONTROLS,
  PERMISSION_TRACK_CAMERA,
} from '../src/index.js'
import type { Linkset, Script } from '../src/index.js'

// Measured on the Aditi beta grid (SLua Tideland, 2026-11-23) by holding movement keys from the
// viewer, with one avatar unless a test says two. The probe was a two-prim
// object with a sit target on each prim, its script taking commands on a chat channel and logging
// every control event as level/edge with a repeat count.
// https://wiki.secondlife.com/wiki/LlTakeControls
// https://wiki.secondlife.com/wiki/Control

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SEATED = PERMISSION_TAKE_CONTROLS | PERMISSION_TRACK_CAMERA | PERMISSION_CONTROL_CAMERA

const source = `
  list got;
  key who;
  default {
    link_message(integer s, integer n, string m, key id) {
      list a = llParseString2List(m, [" "], []);
      string c = llList2String(a, 0);
      if (c == "perm") llRequestPermissions(llGetOwner(), llList2Integer(a, 1));
      else if (c == "permk") llRequestPermissions(llList2Key(a, 2), llList2Integer(a, 1));
      else if (c == "take") llTakeControls(llList2Integer(a, 1), llList2Integer(a, 2), llList2Integer(a, 3));
      else if (c == "release") llReleaseControls();
      else if (c == "cam") llSetCameraParams([${CAMERA_ACTIVE}, 1]);
    }
    control(key id, integer level, integer edge) { got += [level, edge]; who = id; }
    touch_end(integer n) { got += ["perms " + (string)llGetPermissions() + " " + (string)llGetPermissionsKey()]; }
    changed(integer c) { got += ["changed " + (string)c]; }
    on_rez(integer p) { got += ["rez " + (string)llGetPermissions()]; }
    attach(key id) { got += ["attach " + (string)(id != NULL_KEY) + " " + (string)llGetPermissions()]; }
  }
`

async function fixture() {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner', position: { x: 10, y: 10, z: 20 } })
  const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, position: { x: 11, y: 10, z: 20 },
    prims: [{ scripts: [{ name: 'probe', source: { source } }] }, { position: { x: 0, y: -1, z: 0 } }] })
  for (const prim of linkset.prims) {
    prim.params.sitTarget = { enabled: true, offset: { x: 0, y: 0, z: 0.7 }, rotation: { x: 0, y: 0, z: 0, s: 1 } }
  }
  const script = scripts.probe!
  script.start()
  return { world, avatar, linkset, script }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

function tell(script: Script, command: string) {
  script.fire('link_message', { sender_num: 1, num: 0, str: command, id: NULL_KEY })
  script.linkset.advanceTime(100)
}

/** The keys the avatar holds, one control event per agent update, as the viewer sends them. */
function hold(script: Script, level: number, updates = 3) {
  for (let i = 0; i < updates; i++) script.sendControl(level)
  script.sendControl(0)
  script.linkset.advanceTime(100)
}

async function seated() {
  const f = await fixture()
  expect(f.world.userSitAvatar(f.avatar, f.linkset.prims[0]!)).toBe(true)
  f.linkset.advanceTime(100)
  tell(f.script, `perm ${SEATED}`)
  return f
}

const got = (f: { script: Script }) => f.script.global('got') as unknown[]
// Every other entry is one string, so the numbers are the control events' level and edge.
const events = (f: { script: Script }) => got(f).filter((x) => typeof x === 'number')
function perms(script: Script) {
  script.fire('touch_end', { num_detected: 1 })
  return Number(String((script.global('got') as unknown[]).at(-1)).split(' ')[1])
}
const clear = (f: Fixture) => f.script.setGlobal('got', [])

describe('control event values', () => {
  // In-world: llTakeControls(CONTROL_FWD | CONTROL_BACK, TRUE, FALSE) on a seat, then the forward
  // key held 1.5 s -> one 1/1, 35 of 1/0 (one per agent update), then one 0/1.
  it('reports the press, the hold and the release', async () => {
    const f = await seated()
    tell(f.script, `take ${CONTROL_FWD | CONTROL_BACK} 1 0`)
    clear(f)
    hold(f.script, CONTROL_FWD)
    expect(events(f)).toEqual([1, 1, 1, 0, 1, 0, 0, 1])
  })

  // In-world: with forward taken, forward and left held together -> 1/1, 1/0..., 0/1 (left never
  // shows); left alone -> no event.
  it('reports only the taken controls, and nothing for keys the script did not take', async () => {
    const f = await seated()
    tell(f.script, `take ${CONTROL_FWD} 1 0`)
    clear(f)
    hold(f.script, CONTROL_FWD | CONTROL_LEFT, 1)
    hold(f.script, CONTROL_LEFT)
    expect(events(f)).toEqual([CONTROL_FWD, CONTROL_FWD, 0, CONTROL_FWD])
  })

  // In-world: llTakeControls(CONTROL_FWD, TRUE, FALSE) then llTakeControls(CONTROL_BACK, TRUE,
  // FALSE) -> forward gave no event, back gave 2/2, 2/0..., 0/2.
  it('lets a second llTakeControls replace the first', async () => {
    const f = await seated()
    tell(f.script, `take ${CONTROL_FWD} 1 0`)
    tell(f.script, `take ${CONTROL_BACK} 1 0`)
    clear(f)
    hold(f.script, CONTROL_FWD)
    hold(f.script, CONTROL_BACK, 1)
    expect(events(f)).toEqual([CONTROL_BACK, CONTROL_BACK, 0, CONTROL_BACK])
    expect(f.script.controls).toEqual({ controls: CONTROL_BACK, accept: true, passOn: false })
  })

  // In-world: llTakeControls(CONTROL_FWD, FALSE, TRUE) seated -> no event for forward, left or
  // back. Standing, llTakeControls(CONTROL_FWD | CONTROL_BACK, FALSE, FALSE) and
  // llTakeControls(CONTROL_FWD, FALSE, FALSE) gave no event either. (There the keys left out of
  // the call stopped moving the avatar and the ones named in it still moved it: with accept
  // FALSE, pass_on FALSE takes every other control without telling the script.)
  it('fires nothing with accept FALSE, for the named controls or any other', async () => {
    const f = await seated()
    tell(f.script, `take ${CONTROL_FWD} 0 1`)
    clear(f)
    for (const key of [CONTROL_FWD, CONTROL_LEFT, CONTROL_BACK]) hold(f.script, key)
    tell(f.script, `take ${CONTROL_FWD} 0 0`)
    for (const key of [CONTROL_FWD, CONTROL_BACK]) hold(f.script, key)
    expect(events(f)).toEqual([])
  })

  // In-world: a rezzed probe nobody sat on, granted PERMISSION_TAKE_CONTROLS by its standing
  // owner's dialog, took CONTROL_ROT_LEFT and then forward and back -> the same press, hold and
  // release events as on a seat. With pass_on FALSE the avatar did not walk; with pass_on TRUE it
  // walked and the events still came.
  it('reaches a rezzed object that nobody sits on', async () => {
    const f = await fixture()
    f.world.autoGrantPermissions = 'none'
    tell(f.script, `perm ${PERMISSION_TAKE_CONTROLS}`)
    f.script.grantPermissions()
    tell(f.script, `take ${CONTROL_ROT_LEFT} 1 1`)
    clear(f)
    hold(f.script, CONTROL_ROT_LEFT, 1)
    expect(events(f)).toEqual([CONTROL_ROT_LEFT, CONTROL_ROT_LEFT, 0, CONTROL_ROT_LEFT])
  })
})

describe('when control events stop', () => {
  // In-world: a seat holding 3076 with forward taken; the sitter stood -> changed(CHANGED_LINK)
  // read 1024, and forward and back held while standing gave no event.
  it('stops when the sitter stands, and a new sit does not bring the controls back', async () => {
    const f = await seated()
    tell(f.script, `take ${CONTROL_FWD} 1 0`)
    clear(f)
    f.world.standAvatar(f.avatar)
    f.linkset.advanceTime(100)
    hold(f.script, CONTROL_FWD)
    // In-world: then the avatar sat on the seat again with no new request -> forward gave no event
    // until the script asked for 3076 and took forward again.
    expect(f.world.userSitAvatar(f.avatar, f.linkset.prims[1]!)).toBe(true)
    f.linkset.advanceTime(100)
    hold(f.script, CONTROL_FWD)
    expect(events(f)).toEqual([])
    expect(perms(f.script)).toBe(PERMISSION_TRACK_CAMERA)
    tell(f.script, `perm ${SEATED}`)
    tell(f.script, `take ${CONTROL_FWD} 1 0`)
    hold(f.script, CONTROL_FWD, 1)
    expect(events(f)).toEqual([CONTROL_FWD, CONTROL_FWD, 0, CONTROL_FWD])
  })

  // In-world: a worn probe holding 36 (controls and attach) took forward and back and called
  // llReleaseControls() -> it held 32, and forward held gave no event and walked the avatar.
  it('stops when the script releases the controls', async () => {
    const f = await fixture()
    f.linkset.attachToAvatar(OWNER, 5)
    f.linkset.advanceTime(100)
    tell(f.script, `perm ${PERMISSION_TAKE_CONTROLS | PERMISSION_ATTACH}`)
    tell(f.script, `take ${CONTROL_FWD | CONTROL_BACK} 1 0`)
    tell(f.script, 'release')
    clear(f)
    hold(f.script, CONTROL_FWD)
    expect(events(f)).toEqual([])
    expect(perms(f.script)).toBe(PERMISSION_ATTACH)
  })

  // In-world: a worn probe granted 36 (controls and attach) took forward and back, detached
  // itself and was worn again -> attach(NULL_KEY) read 36, on_rez and attach then read 32, and
  // back held gave no event and walked the avatar.
  it('stops for good once the attachment is detached', async () => {
    const f = await fixture()
    f.linkset.attachToAvatar(OWNER, 5)
    f.linkset.advanceTime(100)
    tell(f.script, `perm ${PERMISSION_TAKE_CONTROLS | PERMISSION_ATTACH}`)
    tell(f.script, `take ${CONTROL_FWD | CONTROL_BACK} 1 0`)
    f.linkset.detachFromAvatar()
    f.linkset.advanceTime(100)
    f.linkset.attachToAvatar(OWNER, 5)
    f.linkset.advanceTime(100)
    clear(f)
    hold(f.script, CONTROL_BACK)
    expect(events(f)).toEqual([])
    expect(perms(f.script)).toBe(PERMISSION_ATTACH)
  })

  // In-world: the seat's script was stopped with forward taken, forward was held 0.8 s, and the
  // script was started again -> no control event at all, then forward held again gave 1/1,
  // 1/0..., 0/1: the input is lost, and the controls stay taken.
  it('loses the input a stopped script misses, and keeps the controls', async () => {
    const f = await seated()
    tell(f.script, `take ${CONTROL_FWD} 1 0`)
    clear(f)
    f.script.running = false
    hold(f.script, CONTROL_FWD)
    f.script.running = true
    f.linkset.advanceTime(1000)
    expect(events(f)).toEqual([])
    hold(f.script, CONTROL_FWD, 1)
    expect(events(f)).toEqual([CONTROL_FWD, CONTROL_FWD, 0, CONTROL_FWD])
  })
})

describe('controls through a take and a rez', () => {
  let items = 0
  function rez(f: Fixture, saved: Linkset) {
    const id = `item-${++items}`
    seedRlvInventory(f.avatar, { sharedRootId: null, entries: [{ id, kind: 'item', parentId: null, name: 'probe', object: saved, assetType: 'object' }] })
    const object = f.world.attemptAvatarRez(f.avatar, id, { x: 11, y: 12, z: 20 }).object!
    object.advanceTime(100)
    return object.allScripts()[0]!
  }

  // In-world: the unseated probe, holding 4 from a dialog with forward and back taken, was taken
  // into inventory and rezzed -> on_rez read 4 for the owner, and back held gave 2/2, 2/0...,
  // 0/2 without walking the avatar.
  it('keeps delivering control events from a copy that was never sat on or worn', async () => {
    const f = await fixture()
    f.world.autoGrantPermissions = 'none'
    tell(f.script, `perm ${PERMISSION_TAKE_CONTROLS}`)
    f.script.grantPermissions()
    tell(f.script, `take ${CONTROL_FWD | CONTROL_BACK} 1 0`)
    const saved = f.linkset.copy()
    f.linkset.remove()
    const copy = rez(f, saved)
    copy.setGlobal('got', [])
    hold(copy, CONTROL_BACK, 1)
    expect(copy.global('got')).toEqual([CONTROL_BACK, CONTROL_BACK, 0, CONTROL_BACK])
    expect(copy.controls).toEqual({ controls: CONTROL_FWD | CONTROL_BACK, accept: true, passOn: false })
  })

  async function holding() {
    const f = await fixture()
    f.world.autoGrantPermissions = 'none'
    tell(f.script, `perm ${PERMISSION_TAKE_CONTROLS}`)
    f.script.grantPermissions()
    tell(f.script, `take ${CONTROL_FWD | CONTROL_BACK} 1 0`)
    return f
  }

  // In-world: a Take Copy of that probe was rezzed from inventory, put in another prim's contents
  // and rezzed with llRezObject, and worn from inventory -> back held gave 2/2, 2/0..., 0/2 in the
  // original and in every copy at once, each holding 4 for the owner (Aditi, SLua Tideland,
  // 2026-11-23).
  it('keeps them in a Take Copy, and in the original', async () => {
    const f = await holding()
    const copy = rez(f, f.linkset.copy())
    clear(f)
    copy.setGlobal('got', [])
    for (const script of [f.script, copy]) hold(script, CONTROL_BACK, 1)
    expect(events(f)).toEqual([CONTROL_BACK, CONTROL_BACK, 0, CONTROL_BACK])
    expect(copy.global('got')).toEqual([CONTROL_BACK, CONTROL_BACK, 0, CONTROL_BACK])
  })

  // In-world: that copy worn from inventory held 4 and gave 2/2, 2/0..., 0/2 for the back key.
  it('keeps them in a copy worn from inventory', async () => {
    const { rlv } = await loadRlvPair({ source: 'default { touch_start(integer n) { llOwnerSay(llGetObjectDesc()); } }' })
    const { world, avatar } = rlv
    world.autoGrantPermissions = 'none'
    const made = await loadLinkset({ world, region: avatar.region, owner: avatar.key, prims: [{ scripts: [{ name: 'probe', source: { source } }] }] })
    const probe = made.scripts.probe!
    probe.start()
    tell(probe, `perm ${PERMISSION_TAKE_CONTROLS}`)
    probe.grantPermissions()
    tell(probe, `take ${CONTROL_FWD | CONTROL_BACK} 1 0`)
    const saved = made.linkset.copy()
    made.linkset.remove()
    seedRlvInventory(avatar, { sharedRootId: 'root', entries: [
      { id: 'root', parentId: null, kind: 'folder', name: '#RLV' },
      { id: 'folder', parentId: 'root', kind: 'folder', name: 'Direct' },
      { id: 'probe', parentId: 'folder', kind: 'item', name: 'Probe (left hand)', assetType: 'object', object: saved },
    ] })
    rlv.script.start()
    rlv.script.host.description = '@attach:direct=force'
    rlv.script.fire('touch_start', { num_detected: 1 })
    const worn = world.linksets.find(l => l.attachment && l !== rlv.script.linkset && l.allScripts().length)!.allScripts()[0]!
    worn.linkset.advanceTime(100)
    worn.setGlobal('got', [])
    hold(worn, CONTROL_BACK, 1)
    expect(worn.global('got')).toEqual([CONTROL_BACK, CONTROL_BACK, 0, CONTROL_BACK])
    expect(perms(worn)).toBe(PERMISSION_TAKE_CONTROLS)
  })

  it('keeps them in a copy rezzed with llRezObject', async () => {
    const f = await holding()
    const rezzer = await loadLinkset({ world: f.world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'rezzer', source: { source:
      'default { link_message(integer s, integer n, string m, key id) { llRezObject("probe", llGetPos() + <0, 0, 1>, ZERO_VECTOR, ZERO_ROTATION, 0); } }' } }] }] })
    rezzer.prims[0]!.addInventory(makeInventoryItem({ name: 'probe', type: InventoryType.OBJECT, key: f.linkset.prims[0]!.key, object: f.linkset.copy() }))
    rezzer.scripts.rezzer!.start()
    tell(rezzer.scripts.rezzer!, 'rez')
    const copy = f.world.linksets.at(-1)!.allScripts()[0]!
    copy.linkset.advanceTime(100)
    copy.setGlobal('got', [])
    hold(copy, CONTROL_BACK, 1)
    expect(copy.global('got')).toEqual([CONTROL_BACK, CONTROL_BACK, 0, CONTROL_BACK])
  })
})

describe('a sit request on another prim of the seat', () => {
  // In-world: seated on link 1 holding 3076 with forward taken and the camera locked, a sit
  // request on link 2 (plain, with an offset, and on link 2's own key) left the avatar on link 1:
  // no changed event, the avatar and camera stayed where they were, 3076 was still held and
  // forward still gave 1/1, 1/0..., 0/1. Seated on link 2 first, a request on link 1 also left
  // the avatar where it was. So did a request on link 2 when only link 1 had a sit target, and
  // one on link 1 from link 2 when neither had one (Aditi, SLua Tideland, 2026-11-23).
  it.each([
    [1, 'both'], [2, 'both'], [1, 'link 1'], [2, 'none'],
  ] as const)('leaves the sitter, its controls and its camera where they were (seated on link %i, sit targets on %s)', async (link, targets) => {
    const f = await fixture()
    const from = link - 1
    if (targets !== 'both') f.linkset.prims[1]!.params.sitTarget = { ...f.linkset.prims[1]!.params.sitTarget, enabled: false }
    if (targets === 'none') f.linkset.prims[0]!.params.sitTarget = { ...f.linkset.prims[0]!.params.sitTarget, enabled: false }
    expect(f.world.userSitAvatar(f.avatar, f.linkset.prims[from]!)).toBe(true)
    f.linkset.advanceTime(100)
    expect(f.avatar.sittingOn).toBe(f.linkset.prims[from])
    f.linkset.advanceTime(100)
    tell(f.script, `perm ${SEATED}`)
    tell(f.script, `take ${CONTROL_FWD} 1 0`)
    tell(f.script, 'cam')
    clear(f)
    expect(f.world.userSitAvatar(f.avatar, f.linkset.prims[1 - from]!)).toBe(true)
    f.linkset.advanceTime(100)
    expect(f.avatar.sittingOn).toBe(f.linkset.prims[from])
    expect(got(f)).toEqual([])
    expect(perms(f.script)).toBe(SEATED)
    expect(f.script.cameraParams).toEqual(new Map([[CAMERA_ACTIVE, 1]]))
    hold(f.script, CONTROL_FWD, 1)
    expect(events(f)).toEqual([CONTROL_FWD, CONTROL_FWD, 0, CONTROL_FWD])
  })
})

describe('@sit:<key>=force on another prim of the seat', () => {
  // In-world: seated on link 1 of the probe (sit target on link 1 only) holding 3076 with forward
  // taken, "@sit:<link 2>=force" from the seat's script left the avatar on link 1 with no changed
  // event, and forward still gave 1/1, 1/0..., 0/1 (Aditi, SLua Tideland, 2026-11-23, RLVa 2.4.2).
  // The viewer sends it as the same sit request as a click, which left the sitter where it was
  // with sit targets on both prims too.
  it.each(['link 1', 'both'] as const)('leaves the sitter where it was (sit targets on %s)', async (targets) => {
    const pair = await loadRlvPair({ source: 'default { link_message(integer s, integer n, string m, key id) { llOwnerSay(m); } }' })
    for (const { world, avatar, script } of Object.values(pair)) {
      const seat = await loadLinkset({ world, region: avatar.region, owner: avatar.key, prims: [{}, {}] })
      for (const prim of targets === 'both' ? seat.prims : [seat.prims[0]!]) {
        prim.params.sitTarget = { enabled: true, offset: { x: 0, y: 0, z: 0.7 }, rotation: { x: 0, y: 0, z: 0, s: 1 } }
      }
      world.sitAvatar(avatar, seat.prims[0]!)
      script.start()
      tell(script, `@sit:${seat.prims[1]!.key}=force`)
      script.linkset.advanceTime(250)
      expect(avatar.sittingOn).toBe(seat.prims[0])
      expect(avatar.viewer.commandLog.filter(entry => entry.status === 'action').at(-1)).toMatchObject({ actionOutcome: 'unchanged' })
    }
  })
})

describe('controls held for another avatar through a copy', () => {
  async function forBob() {
    const f = await fixture()
    const bob = f.world.addAvatar({ region: 'home', key: BOB, username: 'bob', position: { x: 12, y: 10, z: 20 } })
    return { ...f, bob }
  }
  function rez(f: Fixture, saved: Linkset) {
    seedRlvInventory(f.avatar, { sharedRootId: null, entries: [{ id: 'bob-item', kind: 'item', parentId: null, name: 'probe', object: saved, assetType: 'object' }] })
    const object = f.world.attemptAvatarRez(f.avatar, 'bob-item', { x: 11, y: 12, z: 20 }).object!
    object.advanceTime(100)
    return object.allScripts()[0]!
  }

  // In-world, with two avatars: the owner's probe asked a second avatar, standing, for
  // PERMISSION_TAKE_CONTROLS, which it granted from the dialog, and took forward and back. Then
  // the owner made a Take Copy and rezzed it, rezzed it with llRezObject from another prim, and
  // took the original and rezzed it -> every copy and the original held 4 for that avatar, and its
  // back key gave 2/2, 2/0..., 0/2 in each (Aditi, SLua Tideland, 2026-11-23).
  const holdsForBob = (script: Script) => {
    script.setGlobal('got', [])
    hold(script, CONTROL_BACK, 1)
    expect(script.global('got')).toEqual([CONTROL_BACK, CONTROL_BACK, 0, CONTROL_BACK])
    expect(script.global('who')).toBe(BOB)
    script.fire('touch_end', { num_detected: 1 })
    expect((script.global('got') as unknown[]).at(-1)).toBe(`perms ${PERMISSION_TAKE_CONTROLS} ${BOB}`)
  }
  it.each(['take', 'Take Copy', 'llRezObject'] as const)('keeps them for an avatar that is not the owner (%s)', async (how) => {
    const f = await forBob()
    f.world.autoGrantPermissions = 'none'
    tell(f.script, `permk ${PERMISSION_TAKE_CONTROLS} ${BOB}`)
    f.script.grantPermissions()
    tell(f.script, `take ${CONTROL_FWD | CONTROL_BACK} 1 0`)
    const saved = f.linkset.copy()
    let copy: Script
    if (how === 'llRezObject') {
      const rezzer = await loadLinkset({ world: f.world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'rezzer', source: { source:
        'default { link_message(integer s, integer n, string m, key id) { llRezObject("probe", llGetPos() + <0, 0, 1>, ZERO_VECTOR, ZERO_ROTATION, 0); } }' } }] }] })
      rezzer.prims[0]!.addInventory(makeInventoryItem({ name: 'probe', type: InventoryType.OBJECT, key: f.linkset.prims[0]!.key, object: saved }))
      rezzer.scripts.rezzer!.start()
      tell(rezzer.scripts.rezzer!, 'rez')
      copy = f.world.linksets.at(-1)!.allScripts()[0]!
      copy.linkset.advanceTime(100)
    } else {
      if (how === 'take') f.linkset.remove()
      copy = rez(f, saved)
    }
    holdsForBob(copy)
    if (how !== 'take') holdsForBob(f.script)
  })

  // In-world: the second avatar sat on the owner's probe and granted 3076 with forward and back
  // taken. A Take Copy stood it up: the original read 1024 in changed(CHANGED_LINK), and the
  // rezzed copy read 1024 for that avatar in on_rez. Taking the probe from under the sitter and
  // rezzing it gave the same, and its back key gave no event.
  it.each(['Take Copy', 'take'] as const)('drops them for a sitter who is not the owner when the seat is copied from under it (%s)', async (how) => {
    const f = await forBob()
    expect(f.world.userSitAvatar(f.bob, f.linkset.prims[0]!)).toBe(true)
    f.linkset.advanceTime(100)
    tell(f.script, `permk ${SEATED} ${BOB}`)
    tell(f.script, `take ${CONTROL_FWD | CONTROL_BACK} 1 0`)
    clear(f)
    const saved = f.linkset.copy()
    expect(f.bob.sittingOn).toBeNull()
    f.linkset.advanceTime(100)
    expect(got(f)).toEqual(['changed 32'])
    expect(perms(f.script)).toBe(PERMISSION_TRACK_CAMERA)
    if (how === 'take') f.linkset.remove()
    const copy = rez(f, saved)
    expect(copy.global('got')).toContain(`rez ${PERMISSION_TRACK_CAMERA}`)
    copy.fire('touch_end', { num_detected: 1 })
    expect((copy.global('got') as unknown[]).at(-1)).toBe(`perms ${PERMISSION_TRACK_CAMERA} ${BOB}`)
    copy.setGlobal('got', [])
    hold(copy, CONTROL_BACK, 1)
    expect(copy.global('got')).toEqual([])
  })
})
