import { describe, expect, it } from 'vitest'
import { loadLinkset, loadRlvPair, loadScript, makeInventoryItem, InventoryType, seedRlvInventory, World } from '../src/index.js'
import type { Linkset, Script } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlRequestPermissions
//
// Every "In-world" note below was measured on Aditi, SLua Tideland, 2026-11-13, with a
// Firestorm viewer whose avatar owned every probe object.
//
// The probe script made a request when told to on a chat channel, said llGetPermissions() and
// whether llGetPermissionsKey() was its owner on the next line, and said the same from
// run_time_permissions, on_rez, attach and state_entry. A second prim listened on DEBUG_CHANNEL.
// The viewer's pending permission dialogs, with the bits each one asked for, were listed after
// every step.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const NULL_KEY = '00000000-0000-0000-0000-000000000000'
const DEBUG_CHANNEL = 2147483647
const REFUSAL = 'Camera control currently only supported for attachments and objects on which you are sitting.'
const NOT_FOUND = 'Unable to find specified agent to request permissions.'

const DEBIT = 2, CONTROLS = 4, REMAP = 8, ANIMATION = 16, ATTACH = 32, RELEASE = 64, LINKS = 128, JOINTS = 256
const TRACK = 1024, CAMERA = 2048, TELEPORT = 4096, OVERRIDE = 32768
const GAME = 0x100000
/** 33846: the bits the rez probes held from one dialog. */
const DIALOG_SET = DEBIT | CONTROLS | ANIMATION | ATTACH | TRACK | OVERRIDE

const source = `
  integer ask; string whom; key last; list sync; list events; list rezzed; list attached; list entered;
  integer held; key holder; vector camera;
  default {
    state_entry() { entered += llGetPermissions(); entered += llGetPermissionsKey(); }
    touch_start(integer n) {
      if (whom != "") llRequestPermissions(whom, ask); else llRequestPermissions(llGetOwner(), ask);
      sync += llGetPermissions();
    }
    run_time_permissions(integer p) { events += p; }
    touch_end(integer n) { held = llGetPermissions(); holder = llGetPermissionsKey(); camera = llGetCameraPos(); }
    on_rez(integer p) { rezzed += llGetPermissions(); rezzed += llGetPermissionsKey(); }
    attach(key id) { attached += llGetPermissions(); attached += llGetPermissionsKey(); }
    object_rez(key id) { last = id; }
    link_message(integer from, integer n, string s, key id) {
      if (s == "reset") llResetScript();
      else if (s == "derez") llDerezObject(last, DEREZ_TO_INVENTORY);
      else if (n) llRezAtRoot(s, llGetPos() + <0, 0, 1>, ZERO_VECTOR, ZERO_ROTATION, 5);
      else llRezObject(s, llGetPos() + <0, 0, 1>, ZERO_VECTOR, ZERO_ROTATION, 5);
    }
  }`

async function fixture(opts: { world?: World, script?: object } = {}) {
  const world = opts.world ?? new World()
  if (!world.avatars.length) world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.avatars.find(a => a.key === OWNER) ?? world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
  const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER,
    prims: [{ scripts: [{ name: 'probe', source: { source }, ...opts.script }] }] })
  const script = scripts.probe!
  script.start()
  return { world, avatar, linkset, script, ...driver(script) }
}

function driver(script: Script) {
  const ask = (bits: number, agent = '') => {
    script.setGlobal('ask', bits)
    script.setGlobal('whom', agent)
    script.fire('touch_start', { num_detected: 1 })
    script.linkset.advanceTime(0)
  }
  const held = () => {
    script.fire('touch_end', { num_detected: 1 })
    return [script.global('held'), script.global('holder')]
  }
  const errors = () => script.chat.filter(c => c.channel === DEBUG_CHANNEL).map(c => c.text)
  return { ask, held, errors }
}

async function seat(world: World) {
  return (await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{}] })).linkset
}

describe('camera control asked of an avatar who is neither sitting on the object nor wearing it', () => {
  // In-world: a rezzed probe asked its standing owner for 2048, 2064 (with 16), 2050 (with 2),
  // 3072 (with 1024), 2052 (with 4) and 1050624 (with 1048576) -> each time DEBUG_CHANNEL said the
  // sentence below, no dialog appeared for any of the bits, llGetPermissions() and
  // llGetPermissionsKey() read as before and run_time_permissions did not fire.
  it.each([CAMERA, CAMERA | ANIMATION, CAMERA | DEBIT, CAMERA | TRACK, CAMERA | CONTROLS, CAMERA | GAME])(
    'refuses a request for %i with an error and no dialog', async bits => {
      const f = await fixture()
      f.ask(bits)
      expect(f.errors()).toEqual([REFUSAL])
      expect(f.script.global('sync')).toEqual([0])
      expect(f.script.global('events')).toEqual([])
      expect(f.script.permissionRequests).toEqual([])
      expect(() => f.script.grantPermissions()).toThrow('no pending permission request')
      expect(f.held()).toEqual([0, NULL_KEY])
    })

  // In-world: the probe held 16 from a dialog answered Yes, then asked for 2048, 2050, 3072, 2052
  // and 1050624 -> the error each time, and it still held 16 for its owner. Starting from 16
  // rather than 0 shows the refusal leaves the held bits alone instead of clearing them.
  it('leaves the permissions the script already holds', async () => {
    const f = await fixture()
    f.ask(ANIMATION)
    f.script.grantPermissions()
    for (const bits of [CAMERA, CAMERA | DEBIT, CAMERA | TRACK, CAMERA | CONTROLS, CAMERA | GAME]) f.ask(bits)
    expect(f.errors()).toEqual([REFUSAL, REFUSAL, REFUSAL, REFUSAL, REFUSAL])
    expect(f.held()).toEqual([ANIMATION, OWNER])
    expect(f.script.global('events')).toEqual([ANIMATION])
  })

  // In-world: the probe asked for 16 and the dialog was left open, then it asked for 2048 (error),
  // then the dialog was answered Yes -> run_time_permissions(16).
  it('leaves a request that is waiting on a dialog', async () => {
    const f = await fixture()
    f.ask(ANIMATION)
    f.ask(CAMERA)
    expect(f.script.permissionRequests).toEqual([{ agent: OWNER, permissions: ANIMATION, answered: false }])
    f.script.grantPermissions()
    expect(f.script.global('events')).toEqual([ANIMATION])
  })

  // In-world: the avatar sat on a second probe and the first, still rezzed beside it, asked for
  // 2048 and 3072 -> the error both times, nothing granted. The second probe asked for 2048 and
  // got it at once.
  it('refuses while the avatar sits on a different object', async () => {
    const f = await fixture()
    const other = await fixture({ world: f.world })
    expect(f.world.sitAvatar(f.avatar, other.linkset.prims[0]!)).toBe(true)
    f.ask(CAMERA)
    f.ask(CAMERA | TRACK)
    expect(f.errors()).toEqual([REFUSAL, REFUSAL])
    expect(f.held()).toEqual([0, NULL_KEY])
    other.ask(CAMERA)
    expect(other.held()).toEqual([CAMERA, OWNER])
  })

  // In-world: the avatar wore a second probe on the left hand and the rezzed one asked for 2048
  // -> the error, nothing granted.
  it('refuses while the avatar wears a different object', async () => {
    const f = await fixture()
    ;(await seat(f.world)).attachToAvatar(OWNER, 5)
    f.ask(CAMERA)
    expect(f.errors()).toEqual([REFUSAL])
    expect(f.held()).toEqual([0, NULL_KEY])
  })

  // In-world: the probe asked NULL_KEY, a key that belongs to nobody and the key of a prim beside
  // it for 2048 -> "Unable to find specified agent to request permissions." each time, nothing
  // else. The same sentence came for 16 asked of the unknown key; rezless leaves such requests
  // without camera control waiting, so only the camera control one is pinned here.
  it('says the agent cannot be found when the key is not an avatar here', async () => {
    const f = await fixture()
    f.ask(CAMERA, NULL_KEY)
    f.ask(CAMERA, '12345678-1234-4234-8234-123456789abc')
    f.ask(CAMERA, (await seat(f.world)).prims[0]!.key)
    expect(f.errors()).toEqual([NOT_FOUND, NOT_FOUND, NOT_FOUND])
    expect(f.script.permissionRequests).toEqual([])
    expect(f.held()).toEqual([0, NULL_KEY])
  })

  // In-world: a probe worn as a temporary attachment asked a key that belongs to nobody for 6144
  // (4096|2048) -> the agent-not-found sentence. Asked of its wearer -> "Temporary attachments
  // cannot request runtime permissions to teleport".
  it('looks for the agent before it refuses teleport to a temporary attachment', async () => {
    const f = await fixture()
    f.linkset.attachToAvatar(OWNER, 5, true)
    f.ask(TELEPORT | CAMERA, '12345678-1234-4234-8234-123456789abc')
    f.ask(TELEPORT | CAMERA)
    expect(f.errors()).toEqual([NOT_FOUND, 'Temporary attachments cannot request runtime permissions to teleport'])
  })

  // Not measured: an avatar other than the owner. The probes had one avatar, so whether a second
  // avatar standing nearby gets the same refusal is taken from the sentence itself, which names
  // sitting and wearing and not ownership.
  it('refuses for a second avatar who stands nearby', async () => {
    const f = await fixture()
    f.world.addAvatar({ region: 'home', key: BOB, username: 'bob' })
    f.ask(CAMERA, BOB)
    expect(f.errors()).toEqual([REFUSAL])
  })

  // A script loaded on its own has no world, so nobody can sit on its object or wear it: this is
  // the part of the change that tests written against loadScript alone will meet.
  it('refuses in a script loaded on its own, which has no avatar to sit on it', async () => {
    const script = await loadScript({ source, owner: OWNER })
    script.start()
    const f = driver(script)
    f.ask(CAMERA | TRACK)
    f.ask(CAMERA, NULL_KEY)
    expect(f.errors()).toEqual([REFUSAL, NOT_FOUND])
    expect(script.permissionRequests).toEqual([])
  })

  // autoGrantPermissions is a rezless setting, not something measured: 'none' switches off the
  // grants to sitters and wearers and leaves the refusal, and a function that says yes is the
  // test granting the request itself.
  it("still refuses with autoGrantPermissions 'none', and grants when a function says so", async () => {
    const none = await fixture({ world: new World({ autoGrantPermissions: 'none' }) })
    none.ask(CAMERA)
    expect(none.errors()).toEqual([REFUSAL])
    expect(none.script.permissionRequests).toEqual([])

    const declined = await fixture({ world: new World({ autoGrantPermissions: () => false }) })
    declined.ask(CAMERA)
    expect(declined.errors()).toEqual([REFUSAL])

    const yes = await fixture({ world: new World({ autoGrantPermissions: () => true }) })
    yes.ask(CAMERA | TRACK)
    expect(yes.errors()).toEqual([])
    expect(yes.held()).toEqual([CAMERA | TRACK, OWNER])
  })

  // In-world: the standing owner was asked for 1024 and then for 4 -> a dialog each time ("Track
  // your camera", "Act on your control inputs"), Yes fired run_time_permissions with the bit, and
  // with 1024 llGetCameraPos() read the avatar's camera. Only camera control has the refusal.
  it.each([TRACK, CONTROLS])('still sends %i to a dialog', async bits => {
    const f = await fixture()
    f.ask(bits)
    expect(f.errors()).toEqual([])
    expect(f.script.permissionRequests).toEqual([{ agent: OWNER, permissions: bits, answered: false }])
    f.script.grantPermissions()
    expect(f.script.global('events')).toEqual([bits])
  })

  // In-world: with 1024 from that dialog the rezzed probe's llGetCameraPos() read <116, 45, 1999.36>,
  // the avatar's camera.
  it('lets an object that is neither sat on nor worn read the camera once it holds camera tracking', async () => {
    const f = await fixture()
    f.ask(TRACK)
    f.script.grantPermissions()
    f.script.setCamera({ pos: { x: 116, y: 45, z: 1999.36 } })
    f.held()
    expect(f.script.global('camera')).toEqual({ x: 116, y: 45, z: Math.fround(1999.36) })
  })

  // In-world: the avatar sat on the probe, which asked for 2050 -> no error and nothing granted;
  // one dialog asked for 2050. Grant fired run_time_permissions(2050), and the stand left 2.
  it('sends camera control mixed with a dialog bit to a dialog when the avatar sits on the object', async () => {
    const f = await fixture()
    expect(f.world.sitAvatar(f.avatar, f.linkset.prims[0]!)).toBe(true)
    f.ask(CAMERA | DEBIT)
    expect(f.errors()).toEqual([])
    expect(f.script.global('sync')).toEqual([0])
    expect(f.script.permissionRequests).toEqual([{ agent: OWNER, permissions: CAMERA | DEBIT, answered: false }])
    f.script.grantPermissions()
    expect(f.script.global('events')).toEqual([CAMERA | DEBIT])
    f.world.standAvatar(f.avatar)
    expect(f.held()).toEqual([DEBIT, OWNER])
  })
})

describe('camera control mixed with a dialog bit, asked of a wearer', () => {
  // In-world: a worn probe holding 32 asked its wearer for 2304 (2048|256) -> no error, nothing
  // granted at once, one dialog for 2304.
  it('waits on a dialog', async () => {
    const f = await fixture()
    f.linkset.attachToAvatar(OWNER, 5)
    f.ask(ATTACH)
    f.ask(CAMERA | JOINTS)
    expect(f.errors()).toEqual([])
    expect(f.script.permissionRequests.at(-1)).toEqual({ agent: OWNER, permissions: CAMERA | JOINTS, answered: false })
    expect(f.held()).toEqual([ATTACH, OWNER])
  })
})

describe('requests still waiting when the sitter stands', () => {
  /** A seat whose script holds `holds` for its sitter from a dialog, or nothing. */
  async function seated(holds: number | null, ...asks: number[]) {
    const f = await fixture({ world: new World({ autoGrantPermissions: 'none' }) })
    if (holds !== null) {
      f.ask(holds || REMAP)
      if (holds) f.script.grantPermissions()
      else f.script.denyPermissions()
    }
    expect(f.world.sitAvatar(f.avatar, f.linkset.prims[0]!)).toBe(true)
    for (const bits of asks) f.ask(bits)
    f.world.standAvatar(f.avatar)
    return f
  }
  /** The script waits for no answer, and answering each dialog still on screen does nothing. */
  const dropped = (f: Awaited<ReturnType<typeof fixture>>) => {
    expect(() => f.script.grantPermissions()).toThrow('no pending permission request')
    expect(() => f.script.denyPermissions()).toThrow('no pending permission request')
    const before = [f.script.global('events'), f.held()]
    for (const request of f.script.permissionRequests.filter(r => !r.answered)) f.script.grantPermissions(undefined, request)
    expect([f.script.global('events'), f.held()]).toEqual(before)
    expect(f.script.permissionRequests.every(r => r.answered)).toBe(true)
  }

  // In-world, each from a freshly reset probe that held nothing: the sitter was asked, stood, and
  // answered Yes -> run_time_permissions with the asked bits for 2, 6 (2|4), 18 (2|16),
  // 1026 (2|1024) and 2056 (8|2048). The last one leaves a standing avatar's object holding camera
  // control: the refusal is made when the request is, not when it is answered.
  it.each([DEBIT, DEBIT | CONTROLS, DEBIT | ANIMATION, DEBIT | TRACK, REMAP | CAMERA])(
    'keeps a waiting request for %i when the script holds nothing', async bits => {
      const f = await seated(null, bits)
      f.script.grantPermissions()
      expect(f.script.global('events')).toEqual([bits])
      expect(f.held()).toEqual([bits, OWNER])
      expect(f.errors()).toEqual([])
    })

  // In-world: from a reset probe, asked for 2 then 2066 (2|16|2048), stood. Yes on the second
  // dialog first -> run_time_permissions(2066); the first then did nothing. Asked for 2066 then 2:
  // Yes on the second first -> run_time_permissions(2), then the first did nothing. Asked for 2
  // then 2066: Yes on the first -> run_time_permissions(2), then the second did nothing. Asked for 2,
  // 2066 and 18: Yes on the third -> run_time_permissions(18).
  it.each([
    [[DEBIT, DEBIT | ANIMATION | CAMERA], 1],
    [[DEBIT | ANIMATION | CAMERA, DEBIT], 1],
    [[DEBIT, DEBIT | ANIMATION | CAMERA], 0],
    [[DEBIT, DEBIT | ANIMATION | CAMERA, DEBIT | ANIMATION], 2],
  ])('answers whichever of the dialogs for %j is picked first, and only that one', async (asks, pick) => {
    const f = await seated(null, ...asks)
    f.script.grantPermissions(undefined, f.script.permissionRequests[pick])
    expect(f.script.global('events')).toEqual([asks[pick]])
    dropped(f)
  })

  // In-world: a probe asked its standing owner for 4 and left the dialog open; the avatar sat on
  // it, stood, and answered Yes -> run_time_permissions(4). The same with 6 and with 16.
  it.each([CONTROLS, CONTROLS | DEBIT, ANIMATION])('keeps a request for %i made before the avatar sat down', async bits => {
    const f = await fixture()
    f.ask(bits)
    expect(f.world.sitAvatar(f.avatar, f.linkset.prims[0]!)).toBe(true)
    f.world.standAvatar(f.avatar)
    f.script.grantPermissions()
    expect(f.script.global('events')).toEqual([bits])
  })

  // In-world, each from a probe that already held permissions for the avatar, granted by dialog
  // while it stood. The avatar sat, the probe asked, the avatar stood, and the dialog was answered:
  //   held 2, asked 2066 -> Grant did nothing, still 2. Again with Deny -> nothing, still 2 (a Deny
  //     on the same dialog while standing fired run_time_permissions(0)).
  //   held 16, asked 130 then 258 -> Grant on the second, then on the first: nothing, still 16.
  //   held 1026, asked 1048578 -> nothing.
  //   held 6, asked 18 -> the stand left 2; Grant did nothing.
  //   held 2066 (granted while seated), asked 6 -> the stand left 18; Grant did nothing.
  // So a stand ends the wait of a script that holds permissions for the avatar, whatever is held
  // and whatever is asked.
  it.each([
    [DEBIT, [DEBIT | ANIMATION | CAMERA], DEBIT],
    [ANIMATION, [DEBIT | LINKS, DEBIT | JOINTS], ANIMATION],
    [DEBIT | TRACK, [DEBIT | GAME], DEBIT | TRACK],
    [DEBIT | CONTROLS, [DEBIT | ANIMATION], DEBIT],
  ])('drops the waiting requests of a script that holds %i for the avatar', async (holds, asks, left) => {
    const f = await seated(holds, ...asks)
    dropped(f)
    expect(f.held()).toEqual([left, OWNER])
    expect(f.script.global('events')).toEqual([holds])
  })

  it('drops them when the held bits were granted on the seat', async () => {
    const f = await fixture({ world: new World({ autoGrantPermissions: 'none' }) })
    expect(f.world.sitAvatar(f.avatar, f.linkset.prims[0]!)).toBe(true)
    f.ask(DEBIT | ANIMATION | CAMERA)
    f.script.grantPermissions()
    f.ask(DEBIT | CONTROLS)
    f.world.standAvatar(f.avatar)
    dropped(f)
    expect(f.held()).toEqual([DEBIT | ANIMATION, OWNER])
  })

  // In-world: a probe whose dialog for 8 was answered No read 0 with its owner as the permission
  // key. The avatar sat, the probe asked for 514, the avatar stood -> Grant did nothing and the
  // key read NULL_KEY.
  it('drops them, and the permission key, when the script holds only a denial from the avatar', async () => {
    const f = await seated(0, DEBIT | 512)
    dropped(f)
    expect(f.held()).toEqual([0, NULL_KEY])
    expect(f.script.global('events')).toEqual([0])
  })

  // In-world: after such a stand the probe (holding 2) asked for 16, and a Yes was honoured.
  it('answers a request made after the stand', async () => {
    const f = await seated(DEBIT, DEBIT | ANIMATION | CAMERA)
    f.ask(ANIMATION)
    f.script.grantPermissions()
    expect(f.script.global('events')).toEqual([DEBIT, ANIMATION])
  })

  // Not measured: requests to a second avatar. The probes had one avatar. The model ends the wait
  // only for a script whose permission key is the avatar who stood, which is all the grid showed.
  it('leaves a script that holds permissions for another avatar waiting', async () => {
    const f = await fixture()
    f.world.addAvatar({ region: 'home', key: BOB, username: 'bob' })
    f.ask(ANIMATION, BOB)
    f.script.grantPermissions()
    f.ask(ATTACH, BOB)
    expect(f.world.sitAvatar(f.avatar, f.linkset.prims[0]!)).toBe(true)
    f.world.standAvatar(f.avatar)
    f.script.grantPermissions()
    expect(f.script.global('events')).toEqual([ANIMATION, ATTACH])
  })
})

describe('permissions on a rezzed copy', () => {
  /** A probe on the ground holding DIALOG_SET for its standing owner, from one dialog. */
  async function granted() {
    const f = await fixture()
    f.ask(DIALOG_SET)
    f.script.grantPermissions()
    return f
  }
  const only = (object: Linkset) => {
    object.advanceTime(0)
    return object.allScripts()[0]!
  }
  /** Rez `saved` from the avatar's inventory, as dragging the item onto the ground does. */
  function rez(f: Awaited<ReturnType<typeof fixture>>, saved: Linkset) {
    seedRlvInventory(f.avatar, { sharedRootId: null, entries: [{ id: 'item', kind: 'item', parentId: null, name: 'probe', object: saved, assetType: 'object' }] })
    return only(f.world.attemptAvatarRez(f.avatar, 'item', { x: 1, y: 2, z: 3 }).object!)
  }

  // In-world: a rezzed probe granted 33846 (2|4|16|32|1024|32768) by dialog was taken into
  // inventory and rezzed -> on_rez and a later read both said 33846 for the owner. Controls stay:
  // this object was never sat on or worn. Taking a copy left the original at 33846 too.
  it('keeps every held bit and the permission key through inventory and a rez', async () => {
    const f = await granted()
    const copy = rez(f, f.linkset.copy())
    expect(copy.global('rezzed')).toEqual([DIALOG_SET, OWNER])
    expect(driver(copy).held()).toEqual([DIALOG_SET, OWNER])
    expect(f.held()).toEqual([DIALOG_SET, OWNER])
  })

  // In-world: the same item was put in another prim's contents and rezzed with llRezObject and
  // with llRezAtRoot -> on_rez said 33846 for the owner both times.
  it.each([['llRezObject', 0], ['llRezAtRoot', 1]])('keeps them on a copy rezzed with %s', async (_, atRoot) => {
    const f = await granted()
    const rezzer = await loadLinkset({ world: f.world, region: 'home', owner: OWNER,
      prims: [{ scripts: [{ name: 'rezzer', source: { source } }] }] })
    rezzer.prims[0]!.addInventory(makeInventoryItem({ name: 'probe', type: InventoryType.OBJECT,
      key: f.linkset.prims[0]!.key, object: f.linkset.copy() }))
    const before = f.world.linksets.length
    rezzer.scripts.rezzer!.fire('link_message', { sender_num: 0, num: atRoot, str: 'probe', id: NULL_KEY })
    expect(f.world.linksets).toHaveLength(before + 1)
    const copy = only(f.world.linksets.at(-1)!)
    expect(copy.global('rezzed')).toEqual([DIALOG_SET, OWNER])
  })

  /**
   * A probe holding DIALOG_SET in the inventory of an avatar with an RLV viewer, and a relay that
   * force-wears it: the path an item takes from inventory onto the avatar.
   */
  async function inInventory() {
    const { rlv } = await loadRlvPair({ source: 'default { touch_start(integer n) { llOwnerSay(llGetObjectDesc()); } }' })
    const { world, avatar } = rlv
    const made = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
      prims: [{ scripts: [{ name: 'probe', source: { source } }] }] })
    made.scripts.probe!.start()
    const probe = driver(made.scripts.probe!)
    probe.ask(DIALOG_SET)
    made.scripts.probe!.grantPermissions()
    const saved = made.linkset.copy()
    made.linkset.remove()
    seedRlvInventory(avatar, { sharedRootId: 'root', entries: [
      { id: 'root', parentId: null, kind: 'folder', name: '#RLV' },
      { id: 'folder', parentId: 'root', kind: 'folder', name: 'Direct' },
      { id: 'probe', parentId: 'folder', kind: 'item', name: 'Probe (left hand)', assetType: 'object', object: saved },
    ] })
    rlv.script.start()
    const wear = () => {
      rlv.script.host.description = '@attach:direct=force'
      rlv.script.fire('touch_start', { num_detected: 1 })
      const worn = world.linksets.find(l => l.attachment && l !== rlv.script.linkset && l.allScripts().length)!
      return only(worn)
    }
    return { world, avatar, wear }
  }

  // In-world: the item holding 33846 was worn from inventory -> on_rez and attach both said 33846.
  it('keeps them, controls included, when the item is worn from inventory', async () => {
    const f = await inInventory()
    const worn = f.wear()
    expect(worn.global('rezzed')).toEqual([DIALOG_SET, f.avatar.key])
    expect(worn.global('attached')).toEqual([DIALOG_SET, f.avatar.key])
  })

  // In-world: that worn probe, whose controls came from the dialog, detached itself and was worn
  // again -> attach(NULL_KEY) still said 33846; on_rez and attach then said 33842 for the owner.
  // So a detach takes back controls however they were granted, and a rez of a ground object
  // does not.
  it('loses dialog-granted controls on the way through a detach', async () => {
    const f = await inInventory()
    const worn = f.wear()
    worn.linkset.detachFromAvatar()
    worn.linkset.advanceTime(0)
    const again = f.wear()
    const left = DIALOG_SET & ~CONTROLS
    expect(again.global('attached')).toEqual([DIALOG_SET, f.avatar.key, DIALOG_SET, f.avatar.key, left, f.avatar.key])
    expect(again.global('rezzed')).toEqual([DIALOG_SET, f.avatar.key, left, f.avatar.key])
  })

  // In-world: the viewer would not rez an item from inventory while it was worn.
  it('does not rez an item that is worn', async () => {
    const f = await inInventory()
    f.wear()
    expect(f.world.attemptAvatarRez(f.avatar, 'probe', { x: 1, y: 2, z: 3 })).toMatchObject({ status: 'unsupported', reason: 'worn' })
  })

  // In-world: a worn probe granted 35892 (4|16|32|1024|2048|32768) as a wearer detached itself and
  // was worn again -> on_rez said 33840 for the owner. The probe for the wearer grants (same grid
  // and day) rezzed it from inventory onto the ground instead and also read 33840.
  it.each(['worn again', 'rezzed on the ground'])('loses wearer-granted controls and camera control when detached and %s', async how => {
    const f = await fixture()
    f.linkset.attachToAvatar(OWNER, 5)
    f.ask(CONTROLS | ANIMATION | ATTACH | TRACK | CAMERA | OVERRIDE)
    f.linkset.detachFromAvatar()
    f.linkset.advanceTime(0)
    const left = ANIMATION | ATTACH | TRACK | OVERRIDE
    if (how === 'worn again') {
      f.linkset.attachToAvatar(OWNER, 5)
      f.linkset.advanceTime(0)
      expect(f.script.global('rezzed')).toEqual([left, OWNER])
    } else expect(rez(f, f.linkset.copy()).global('rezzed')).toEqual([left, OWNER])
  })

  // In-world: the avatar sat on a probe that was granted 3092 (4|16|1024|2048), and the probe was
  // taken into inventory from under it and rezzed -> on_rez said 1040 for the owner. A copy taken
  // while the avatar sat read 1040 when rezzed too. (That take also stood the avatar up: the
  // original read 1040 straight after. The model's copy leaves the avatar seated.)
  it('loses controls and camera control when the object is taken while its sitter is on it', async () => {
    const f = await fixture()
    expect(f.world.sitAvatar(f.avatar, f.linkset.prims[0]!)).toBe(true)
    f.ask(CONTROLS | ANIMATION | TRACK | CAMERA)
    expect(rez(f, f.linkset.copy()).global('rezzed')).toEqual([ANIMATION | TRACK, OWNER])
  })

  // In-world: a probe granted 4 by dialog while its owner stood was sat on, taken from under the
  // avatar and rezzed -> on_rez said 0 and NULL_KEY, as a stand would have left it.
  it('loses dialog-granted controls, and the key with them, when taken from under its sitter', async () => {
    const f = await fixture()
    f.ask(CONTROLS)
    f.script.grantPermissions()
    expect(f.world.sitAvatar(f.avatar, f.linkset.prims[0]!)).toBe(true)
    expect(rez(f, f.linkset.copy()).global('rezzed')).toEqual([0, NULL_KEY])
  })

  // In-world: the probe holding 33846 was reset -> state_entry said 0 and NULL_KEY. Taken and
  // rezzed after that, on_rez said 0 and NULL_KEY.
  it('has nothing to carry after a script reset', async () => {
    const f = await granted()
    f.script.fire('link_message', { sender_num: 0, num: 0, str: 'reset', id: NULL_KEY })
    expect(f.script.global('entered')).toEqual([0, NULL_KEY])
    const copy = rez(f, f.linkset.copy())
    expect(copy.global('rezzed')).toEqual([0, NULL_KEY])
  })

  // In-world: a probe whose dialog for 8 was answered No read 0 with its owner as the permission
  // key. Taken and rezzed, on_rez said the same.
  it('keeps the permission key a denial left', async () => {
    const f = await fixture()
    f.ask(REMAP)
    f.script.denyPermissions()
    expect(rez(f, f.linkset.copy()).global('rezzed')).toEqual([0, OWNER])
  })

  // In-world: a probe rezzed from another prim's contents with llRezObject held 32. It was granted
  // 64 by dialog, the rezzer called llDerezObject(id, DEREZ_TO_INVENTORY) (returned 1) and rezzed
  // the item again -> on_rez said 64 for the owner.
  it('keeps what it held when llDerezObject saves it and it is rezzed again', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
    const { scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{
      objects: { probe: { prims: [{ scripts: [{ name: 'probe', source: { source } }] }] } },
      scripts: [{ name: 'rezzer', source: { source } }],
    }] })
    const tell = (str: string) => {
      scripts.rezzer!.fire('link_message', { sender_num: 0, num: 0, str, id: NULL_KEY })
      world.linksets[0]!.advanceTime(0)
    }
    tell('probe')
    const first = only(world.linksets.at(-1)!)
    driver(first).ask(RELEASE)
    first.grantPermissions()
    tell('derez')
    expect(first.linkset.dead).toBe(true)
    tell('probe')
    const second = only(world.linksets.at(-1)!)
    expect(second).not.toBe(first)
    expect((second.global('rezzed') as unknown[]).slice(-2)).toEqual([RELEASE, OWNER])
  })

  // In-world: a worn probe holding 32 asked for 2, detached itself with the dialog open and was
  // worn again -> Grant on the dialog did nothing; it still held 32. With 2304 (2048|256) the
  // dialog was answered Yes while the probe was in inventory -> nothing, and worn again it held 32.
  it.each([DEBIT, CAMERA | JOINTS])('stops waiting on a dialog for %i once the attachment is detached', async bits => {
    const f = await fixture()
    f.linkset.attachToAvatar(OWNER, 5)
    f.ask(ATTACH)
    f.ask(bits)
    f.linkset.detachFromAvatar()
    f.linkset.advanceTime(0)
    expect(() => f.script.grantPermissions()).toThrow('no pending permission request')
    f.linkset.attachToAvatar(OWNER, 5)
    f.linkset.advanceTime(0)
    expect(f.script.permissionRequests.every(r => r.answered)).toBe(true)
    expect(() => f.script.grantPermissions()).toThrow('no pending permission request')
    expect(f.held()).toEqual([ATTACH, OWNER])
    expect(f.script.global('events')).toEqual([ATTACH])
  })

  // In-world: a probe asked for 16, and was taken and rezzed with the dialog still open. Yes on
  // the dialog then did nothing: no event, and the rezzed probe held nothing.
  it('does not carry a request that was waiting on a dialog', async () => {
    const f = await fixture()
    f.ask(ANIMATION)
    const copy = rez(f, f.linkset.copy())
    expect(copy.permissionRequests).toEqual([])
    expect(() => copy.grantPermissions()).toThrow('no pending permission request')
    expect(copy.global('rezzed')).toEqual([0, NULL_KEY])
    expect(copy.global('events')).toEqual([])
  })

  // Not measured: a copy that changes owner. The probes had one avatar, so what a script holds
  // after its object is rezzed by someone else is unknown. Such a copy starts with nothing, as
  // every copy did before.
  it('starts with nothing when the copy belongs to another owner', async () => {
    const f = await granted()
    const bob = f.world.addAvatar({ region: 'home', key: BOB, username: 'bob' })
    seedRlvInventory(bob, { sharedRootId: null, entries: [{ id: 'item', kind: 'item', parentId: null, name: 'probe', object: f.linkset.copy(), assetType: 'object' }] })
    const copy = only(f.world.attemptAvatarRez(bob, 'item', { x: 1, y: 2, z: 3 }).object!)
    expect(copy.linkset.owner).toBe(BOB)
    expect(copy.global('rezzed')).toEqual([0, NULL_KEY])
  })
})

describe('autoGrantPermissions in the loaders', () => {
  const seatSource = `
    integer held;
    default {
      changed(integer c) { if (c & CHANGED_LINK) { llRequestPermissions(llAvatarOnSitTarget(), PERMISSION_TRIGGER_ANIMATION); held = llGetPermissions(); } }
      state_entry() { llSitTarget(<0, 0, 0.5>, ZERO_ROTATION); }
    }`
  const home = (opts?: ConstructorParameters<typeof World>[0]) => {
    const world = new World(opts)
    world.addRegion('home', { x: 0, y: 0 })
    return world
  }
  async function sitOn(linkset: Linkset) {
    const world = linkset.world!
    const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
    for (const script of linkset.allScripts()) script.start()
    expect(world.sitAvatar(avatar, linkset.prims[0]!)).toBe(true)
    linkset.advanceTime(0)
  }

  it('loadLinkset sets it for every script of the linkset', async () => {
    const { linkset, scripts } = await loadLinkset({ world: home(), region: 'home', owner: OWNER, autoGrantPermissions: 'none',
      prims: [{ scripts: [{ name: 'a', source: { source: seatSource } }, { name: 'b', source: { source: seatSource }, autoGrantPermissions: 'sl' }] }] })
    expect(scripts.a!.autoGrantPermissions).toBe('none')
    expect(scripts.b!.autoGrantPermissions).toBe('sl')
    await sitOn(linkset)
    expect(scripts.a!.global('held')).toBe(0)
    expect(scripts.b!.global('held')).toBe(ANIMATION)
    scripts.a!.grantPermissions()
    expect(scripts.a!.permissionRequests).toEqual([{ agent: OWNER, permissions: ANIMATION, answered: true }])
  })

  it('loadLinkset leaves scripts on the world setting when it is not given', async () => {
    const { scripts } = await loadLinkset({ world: home({ autoGrantPermissions: 'none' }), region: 'home',
      prims: [{ scripts: [{ name: 'a', source: { source: seatSource } }] }] })
    expect(scripts.a!.autoGrantPermissions).toBe('none')
  })

  it('loadLinkset passes it on to the objects in a prim\'s contents', async () => {
    const world = home()
    const { scripts } = await loadLinkset({ world, region: 'home', autoGrantPermissions: 'none', prims: [{
      objects: {
        inherits: { prims: [{ scripts: [{ name: 'child', source: { source: seatSource } }] }] },
        own: { autoGrantPermissions: 'sl', prims: [{ scripts: [{ name: 'child', source: { source: seatSource } }] }] },
      },
      scripts: [{ name: 'rezzer', source: { source } }],
    }] })
    for (const name of ['inherits', 'own']) scripts.rezzer!.fire('link_message', { sender_num: 0, num: 0, str: name, id: NULL_KEY })
    const [inherits, own] = world.linksets.slice(-2).map(l => l.allScripts()[0]!)
    expect(inherits!.autoGrantPermissions).toBe('none')
    expect(own!.autoGrantPermissions).toBe('sl')
  })

  it('loadScript sets it on the script', async () => {
    const decide = () => true
    const script = await loadScript({ source: seatSource, autoGrantPermissions: decide })
    expect(script.autoGrantPermissions).toBe(decide)
    const plain = await loadScript({ source: seatSource })
    expect(plain.autoGrantPermissions).toBe('sl')
    script.autoGrantPermissions = 'none'
    expect(script.autoGrantPermissions).toBe('none')
  })
})
