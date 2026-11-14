import { describe, expect, it } from 'vitest'
import { loadLinkset, loadRlvPair, seedRlvInventory, World } from '../src/index.js'
import type { Script, WorldAvatar } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlRequestPermissions
// https://wiki.secondlife.com/wiki/LlTeleportAgent
// https://wiki.secondlife.com/wiki/LlAttachToAvatarTemp
// https://wiki.secondlife.com/wiki/LlClearCameraParams
//
// Every "In-world" note below was measured on the Aditi beta grid, SLua Tideland, 2026-11-14, with
// two Firestorm (RLVa) viewers, one per avatar. The owner (here OWNER) made the probe objects,
// except where a note says the second avatar (here BOB) made one.
//
// The probe script took a command on a chat channel and said llGetPermissions(),
// llGetPermissionsKey() and llGetOwner() on the next line. It said the same from
// run_time_permissions, changed, on_rez and attach, and said llGetCameraPos() on command. A second
// object listened on DEBUG_CHANNEL. Each viewer's pending permission dialogs were listed after
// every step. The seat had two prims with a sit target each and two probe scripts in its root.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const NULL_KEY = '00000000-0000-0000-0000-000000000000'
const DEBUG_CHANNEL = 2147483647
const OWNER_ONLY = 'Script asking non-owner for run time permissions only owner can grant'
const ATTACH_REFUSAL = 'Attachment cannot request permissions to attach'
const CAMERA_REFUSAL = 'Camera control currently only supported for attachments and objects on which you are sitting.'
const NO_PERMISSION = 'Script trying to teleport agent without current permission!'
const NOT_OWNER = 'Teleport LSL functions can only teleport the owner of the object.'

const DEBIT = 2, CONTROLS = 4, REMAP = 8, ANIMATION = 16, ATTACH = 32, RELEASE = 64, LINKS = 128, JOINTS = 256
const CHANGE_PERMISSIONS = 512, TRACK = 1024, CAMERA = 2048, TELEPORT = 4096, ESTATE = 16384, OVERRIDE = 32768
const RETURN = 65536, FORCE_SIT = 0x20000, ENVIRONMENT = 0x40000, LAND = 0x80000, GAME = 0x100000
const SEATED = CONTROLS | ANIMATION | TRACK | CAMERA
const CHANGED_OWNER = 128

const source = `
  list log; integer changes;
  string where() { return (string)llGetPermissions() + " " + (string)llGetPermissionsKey() + " " + (string)llGetOwner(); }
  default {
    state_entry() { llSitTarget(<0, 0, 0.6>, ZERO_ROTATION); }
    run_time_permissions(integer p) { log += "rtp " + (string)p + " " + where(); }
    changed(integer c) { changes = c; if (c & CHANGED_OWNER) log += "owner " + where(); }
    on_rez(integer p) { log += "rez " + where(); }
    control(key id, integer level, integer edge) { log += "control"; }
    attach(key id) { log += "attach " + (string)id + " " + where(); }
    link_message(integer from, integer num, string s, key id) {
      if (s == "ask") llRequestPermissions(id, num);
      else if (s == "cam") llSetCameraParams([CAMERA_ACTIVE, 1, CAMERA_POSITION, llGetPos() + <0, 0, num>, CAMERA_POSITION_LOCKED, 1]);
      else if (s == "clear") llClearCameraParams();
      else if (s == "tp") llTeleportAgent(id, "", <30, 40, 50>, ZERO_VECTOR);
      else if (s == "temp") llAttachToAvatarTemp(ATTACH_LHAND);
      else if (s == "attach") llAttachToAvatar(ATTACH_LHAND);
      else if (s == "take") llTakeControls(CONTROL_FWD, TRUE, FALSE);
      else if (s == "stop") llSetScriptState("s2", FALSE);
      else if (s == "start") llSetScriptState("s2", TRUE);
      log += s + " " + where();
    }
  }`

function driver(script: Script) {
  const tell = (str: string, num = 0, id = NULL_KEY) => {
    script.fire('link_message', { sender_num: 0, num, str, id })
    script.linkset.advanceTime(0)
  }
  const log = () => script.global('log') as string[]
  return {
    script,
    tell,
    log,
    ask: (bits: number, agent: string) => tell('ask', bits, agent),
    held: () => {
      tell('held')
      const [, bits, key] = log().at(-1)!.split(' ')
      return [Number(bits), key]
    },
    events: () => log().filter(line => line.startsWith('rtp')).map(line => Number(line.split(' ')[1])),
    errors: () => script.chat.filter(c => c.channel === DEBUG_CHANNEL).map(c => c.text),
    camera: () => script.cameraParams.size > 0,
  }
}

type Driver = ReturnType<typeof driver>

/** `split` puts the second script in the child prim instead of the root. */
async function fixture(owner = OWNER, split = false) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addRegion('north', { x: 256, y: 0 })
  const avatars: Record<string, WorldAvatar> = {
    [OWNER]: world.addAvatar({ region: 'home', key: OWNER, username: 'owner' }),
    [BOB]: world.addAvatar({ region: 'home', key: BOB, username: 'bob' }),
  }
  const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner,
    prims: split
      ? [{ scripts: [{ name: 's1', source: { source } }] }, { scripts: [{ name: 's2', source: { source } }] }]
      : [{ scripts: [{ name: 's1', source: { source } }, { name: 's2', source: { source } }] }, {}] })
  scripts.s1!.start()
  scripts.s2!.start()
  const s1 = driver(scripts.s1!), s2 = driver(scripts.s2!)
  const sit = (who: string, link = who === OWNER ? 0 : 1) => expect(world.sitAvatar(avatars[who]!, linkset.prims[link]!)).toBe(true)
  const stand = (who: string) => world.standAvatar(avatars[who]!)
  /** Answer the newest dialog `d` raised: Yes grants its bits, No grants nothing. */
  const answer = (d: Driver, agent: string, yes = true) => {
    const request = [...d.script.permissionRequests].reverse().find(r => r.agent === agent)!
    d.script.grantPermissions(yes ? undefined : 0, request)
  }
  return { world, avatars, linkset, s1, s2, sit, stand, answer }
}

describe('requests to an avatar who does not own the object', () => {
  // In-world: BOB sat on the owner's seat, which asked BOB for 16, 4, 1024, 2048, 1048576 and 3092
  // in turn -> each read back on the next line with BOB as the key, run_time_permissions fired
  // with the same bits, and no dialog reached BOB. Ownership plays no part in the sitter's grant.
  it.each([ANIMATION, CONTROLS, TRACK, CAMERA, GAME, SEATED])('grants %i to a sitter who does not own the seat', async bits => {
    const f = await fixture()
    f.sit(BOB, 0)
    f.s1.ask(bits, BOB)
    expect(f.s1.held()).toEqual([bits, BOB])
    expect(f.s1.events()).toEqual([bits])
  })

  // In-world: a seat that BOB made asked the owner, sitting on it, for 16, 3092 and 1048576 ->
  // each granted at once with the owner as the key.
  it.each([ANIMATION, SEATED, GAME])('grants %i to the sitter of a seat someone else owns', async bits => {
    const f = await fixture(BOB)
    f.sit(OWNER)
    f.s1.ask(bits, OWNER)
    expect(f.s1.held()).toEqual([bits, OWNER])
  })

  // In-world: BOB sat on the owner's seat, which held 3092 for BOB and asked BOB for 2, 64, 128,
  // 256, 512, 16384, 65536 and 524288 in turn -> DEBUG_CHANNEL said the sentence below each time,
  // no dialog reached BOB, no event fired and the seat still held 3092 for BOB. The same seat
  // asking BOB for 8, 32, 4096, 32768, 131072 and 262144 raised a dialog for each.
  it.each([DEBIT, RELEASE, LINKS, JOINTS, CHANGE_PERMISSIONS, ESTATE, RETURN, LAND])(
    'refuses %i to a non-owner with an error and no dialog', async bits => {
      const f = await fixture()
      f.sit(BOB, 0)
      f.s1.ask(SEATED, BOB)
      f.s1.ask(bits, BOB)
      expect(f.s1.errors()).toEqual([OWNER_ONLY])
      expect(f.s1.held()).toEqual([SEATED, BOB])
      expect(f.s1.events()).toEqual([SEATED])
      expect(f.s1.script.permissionRequests.filter(r => r.permissions === bits)).toEqual([])
    })

  it.each([REMAP, ATTACH, TELEPORT, OVERRIDE, FORCE_SIT, ENVIRONMENT])('asks a seated non-owner for %i with a dialog', async bits => {
    const f = await fixture()
    f.sit(BOB, 0)
    f.s1.ask(bits, BOB)
    expect(f.s1.errors()).toEqual([])
    expect(f.s1.script.permissionRequests).toEqual([{ agent: BOB, permissions: bits, answered: false }])
  })

  // In-world: the seated BOB asked for 18 (16 with 2) -> the error, and nothing else happened. A
  // seat BOB made, asked by the owner sitting on it for 2 -> the error too.
  it('refuses the whole request when one bit is the owner\'s alone', async () => {
    const f = await fixture()
    f.sit(BOB, 0)
    f.s1.ask(SEATED, BOB)
    f.s1.ask(ANIMATION | DEBIT, BOB)
    expect(f.s1.errors()).toEqual([OWNER_ONLY])
    expect(f.s1.held()).toEqual([SEATED, BOB])
    const theirs = await fixture(BOB)
    theirs.sit(OWNER)
    theirs.s1.ask(DEBIT, OWNER)
    expect(theirs.s1.errors()).toEqual([OWNER_ONLY])
  })

  // In-world: an object BOB made asked the standing owner for 2048 -> the camera refusal, and for
  // 2 -> the owner-only error.
  it('refuses camera control and owner-only bits to a non-owner who stands', async () => {
    const f = await fixture(BOB)
    f.s1.ask(CAMERA, OWNER)
    f.s1.ask(DEBIT, OWNER)
    expect(f.s1.errors()).toEqual([CAMERA_REFUSAL, OWNER_ONLY])
  })
})

describe('an attachment asking someone other than its wearer', () => {
  async function worn() {
    const f = await fixture()
    f.linkset.attachToAvatar(OWNER, 5)
    f.linkset.advanceTime(0)
    return f
  }

  // In-world: a probe worn by the owner asked BOB for 16 and for 4 -> a dialog each. Yes on the 16
  // fired run_time_permissions(16) with BOB as the key. A later Yes on the 4 did nothing.
  it('asks with a dialog and holds the answer for the other avatar', async () => {
    const f = await worn()
    f.s1.ask(ANIMATION, BOB)
    f.s1.ask(CONTROLS, BOB)
    expect(f.s1.held()).toEqual([0, NULL_KEY])
    const [animation, controls] = f.s1.script.permissionRequests
    f.s1.script.grantPermissions(undefined, animation)
    expect(f.s1.held()).toEqual([ANIMATION, BOB])
    f.s1.script.grantPermissions(undefined, controls)
    expect(f.s1.held()).toEqual([ANIMATION, BOB])
    expect(f.s1.events()).toEqual([ANIMATION])
  })

  // In-world: the worn probe asked BOB for 32, 48 (with 16) and 2080 (with 2048) -> each time
  // DEBUG_CHANNEL said "Attachment cannot request permissions to attach" and no dialog appeared.
  // 34 (with 2) and 2050 (2048 with 2) said the owner-only error instead, and 2048 alone the
  // camera refusal. So the owner check comes first, then the attach check, then the camera check.
  it('refuses attach permission, after the owner check and before the camera check', async () => {
    const f = await worn()
    for (const bits of [ATTACH, ATTACH | ANIMATION, ATTACH | CAMERA, ATTACH | DEBIT, CAMERA | DEBIT, CAMERA]) f.s1.ask(bits, BOB)
    expect(f.s1.errors()).toEqual([ATTACH_REFUSAL, ATTACH_REFUSAL, ATTACH_REFUSAL, OWNER_ONLY, OWNER_ONLY, CAMERA_REFUSAL])
    expect(f.s1.script.permissionRequests).toEqual([])
    expect(f.s1.held()).toEqual([0, NULL_KEY])
  })
})

describe('one avatar standing up', () => {
  // In-world: the owner sat on the seat's root and BOB on its child. One script held 3092 for the
  // owner, the other 3092 for BOB. BOB stood -> the owner's script still held 3092, BOB's held
  // 1040. With BOB seated again and granted again, the owner stood -> BOB's script still held 3092.
  it('leaves the permissions held for the other avatar', async () => {
    const f = await fixture()
    f.sit(OWNER)
    f.sit(BOB)
    f.s1.ask(SEATED, OWNER)
    f.s2.ask(SEATED, BOB)
    f.stand(BOB)
    expect(f.s1.held()).toEqual([SEATED, OWNER])
    expect(f.s2.held()).toEqual([ANIMATION | TRACK, BOB])
    f.sit(BOB)
    f.s2.ask(SEATED, BOB)
    f.stand(OWNER)
    expect(f.s1.held()).toEqual([ANIMATION | TRACK, OWNER])
    expect(f.s2.held()).toEqual([SEATED, BOB])
  })

  // In-world: the seat held 3092 for the seated BOB and asked the standing owner for 8. BOB stood
  // -> 1040 for BOB. Yes on the owner's dialog then did nothing.
  it('ends the wait on another avatar\'s dialog when the avatar it holds for stands', async () => {
    const f = await fixture()
    f.sit(BOB)
    f.s2.ask(SEATED, BOB)
    f.s2.ask(REMAP, OWNER)
    f.stand(BOB)
    f.answer(f.s2, OWNER)
    expect(f.s2.held()).toEqual([ANIMATION | TRACK, BOB])
    expect(f.s2.events()).toEqual([SEATED])
  })

  // In-world: the seat held 20 for the seated owner and asked the standing BOB for 8. The owner
  // stood -> 16 for the owner. Yes on BOB's dialog then did nothing.
  it('ends the wait when the avatar it holds for stands, whoever the dialog went to', async () => {
    const f = await fixture()
    f.sit(OWNER)
    f.s1.ask(CONTROLS | ANIMATION, OWNER)
    f.s1.ask(REMAP, BOB)
    f.stand(OWNER)
    f.answer(f.s1, BOB)
    expect(f.s1.held()).toEqual([ANIMATION, OWNER])
    expect(f.s1.events()).toEqual([CONTROLS | ANIMATION])
  })

  // In-world: a freshly reset seat script asked the standing BOB for 8. The owner sat on the seat
  // and stood. Yes on BOB's dialog then fired run_time_permissions(8) with BOB as the key.
  it('keeps waiting when someone it holds nothing for stands', async () => {
    const f = await fixture()
    f.s1.ask(REMAP, BOB)
    f.sit(OWNER)
    f.stand(OWNER)
    f.answer(f.s1, BOB)
    expect(f.s1.held()).toEqual([REMAP, BOB])
  })
})

describe('dialogs to two avatars at once', () => {
  // In-world: a rezzed probe asked the owner for 2, then BOB for 8. BOB answered Yes ->
  // run_time_permissions(8) with BOB as the key. Grant on the owner's dialog then did nothing.
  it('acts on the first answer, from either avatar', async () => {
    const f = await fixture()
    f.s1.ask(DEBIT, OWNER)
    f.s1.ask(REMAP, BOB)
    f.answer(f.s1, BOB)
    f.answer(f.s1, OWNER)
    expect(f.s1.held()).toEqual([REMAP, BOB])
    expect(f.s1.events()).toEqual([REMAP])
  })

  // In-world: after a reset the probe asked BOB for 8, then the owner for 64. The owner answered
  // Yes -> run_time_permissions(64) for the owner. Yes on BOB's dialog then did nothing.
  it('acts on the first answer when it comes to the older request\'s rival', async () => {
    const f = await fixture()
    f.s1.ask(REMAP, BOB)
    f.s1.ask(RELEASE, OWNER)
    f.answer(f.s1, OWNER)
    f.answer(f.s1, BOB)
    expect(f.s1.held()).toEqual([RELEASE, OWNER])
    expect(f.s1.events()).toEqual([RELEASE])
  })

  // In-world: holding 64 for the owner, the probe asked BOB for 8 and BOB answered No ->
  // run_time_permissions(0), and llGetPermissionsKey() read BOB. A seat holding 32 for BOB asked
  // the owner for 16 and the owner answered No -> 0, with the owner as the key.
  it('moves the permission key to the avatar who answers, even with No', async () => {
    const f = await fixture()
    f.s1.ask(RELEASE, OWNER)
    f.answer(f.s1, OWNER)
    f.s1.ask(REMAP, BOB)
    f.answer(f.s1, BOB, false)
    expect(f.s1.held()).toEqual([0, BOB])
    f.s2.ask(ATTACH, BOB)
    f.answer(f.s2, BOB)
    f.s2.ask(ANIMATION, OWNER)
    f.answer(f.s2, OWNER, false)
    expect(f.s2.held()).toEqual([0, OWNER])
  })
})

describe('a change of owner', () => {
  async function given() {
    const f = await fixture()
    f.linkset.attachToAvatar(OWNER, 5)
    f.linkset.advanceTime(0)
    f.s1.ask(ANIMATION, BOB)
    f.answer(f.s1, BOB)
    f.s2.ask(ATTACH | ANIMATION | CONTROLS, OWNER)
    f.linkset.detachFromAvatar()
    f.linkset.advanceTime(0)
    /** Give the item to `avatar` (unless `again`) and rez it: the copy's scripts, with only what they logged after the rez. */
    const item = (avatar: WorldAvatar, again = false) => {
      if (!again) seedRlvInventory(avatar, { sharedRootId: null, entries: [{ id: 'item', kind: 'item', parentId: null, name: 'probe', object: f.linkset.copy(), assetType: 'object' }] })
      const rezzed = f.world.attemptAvatarRez(avatar, 'item', { x: 1, y: 2, z: 3 }).object!
      rezzed.advanceTime(0)
      return [f.s1, f.s2].map(original => {
        const copy = driver(rezzed.prims[0]!.scripts.find(s => s.scriptName === original.script.scriptName)!)
        const before = original.log().length
        return { ...copy, log: () => copy.log().slice(before) }
      })
    }
    return { ...f, item }
  }

  // In-world: a worn probe's two scripts held 16 for BOB and 52 for the owner. It was detached,
  // given to BOB and rezzed by BOB -> both scripts read 0 and NULL_KEY in on_rez with BOB as the
  // owner, then got changed(CHANGED_OWNER). The script holding BOB's own permission lost it too.
  it('holds nothing once rezzed by its new owner, and says the owner changed', async () => {
    const f = await given()
    const [s1, s2] = f.item(f.avatars[BOB]!) as [Driver, Driver]
    expect(s1.log()).toEqual([`rez 0 ${NULL_KEY} ${BOB}`, `owner 0 ${NULL_KEY} ${BOB}`])
    expect(s2.log()).toEqual([`rez 0 ${NULL_KEY} ${BOB}`, `owner 0 ${NULL_KEY} ${BOB}`])
  })

  // In-world: BOB rezzed the item they were given a second time -> on_rez, then
  // changed(CHANGED_OWNER) again. BOB took one of the rezzed copies and rezzed that -> on_rez only.
  it('says the owner changed on every rez of the given item, but not once the new owner saved it', async () => {
    const f = await given()
    const bob = f.avatars[BOB]!
    f.item(bob)
    const [again] = f.item(bob, true) as [Driver]
    expect(again.log()).toEqual([`rez 0 ${NULL_KEY} ${BOB}`, `owner 0 ${NULL_KEY} ${BOB}`])
    seedRlvInventory(bob, { sharedRootId: null, entries: [{ id: 'taken', kind: 'item', parentId: null, name: 'probe', object: again.script.linkset.copy(), assetType: 'object' }] })
    const rezzed = f.world.attemptAvatarRez(bob, 'taken', { x: 1, y: 2, z: 3 }).object!
    rezzed.advanceTime(0)
    const before = (again.script.global('log') as string[]).length
    const log = rezzed.prims[0]!.scripts.find(s => s.scriptName === 's1')!.global('log') as string[]
    expect(log.slice(before)).toEqual([`rez 0 ${NULL_KEY} ${BOB}`])
  })

  // In-world: the owner sat on a seat they had made and took it from under themselves, gave it to
  // BOB, and BOB rezzed it -> on_rez, then one changed(160), CHANGED_OWNER and CHANGED_LINK together.
  it('says the owner changed and the sitter left in one event', async () => {
    const f = await fixture()
    f.sit(OWNER)
    const saved = f.linkset.copy()
    const bob = f.avatars[BOB]!
    seedRlvInventory(bob, { sharedRootId: null, entries: [{ id: 'seat', kind: 'item', parentId: null, name: 'seat', object: saved, assetType: 'object' }] })
    const rezzed = f.world.attemptAvatarRez(bob, 'seat', { x: 1, y: 2, z: 3 }).object!
    rezzed.advanceTime(0)
    const before = (f.s1.script.global('log') as string[]).length
    const s1 = rezzed.prims[0]!.scripts.find(s => s.scriptName === 's1')!
    expect((s1.global('log') as string[]).slice(before)).toEqual([`rez 0 ${NULL_KEY} ${BOB}`, `owner 0 ${NULL_KEY} ${BOB}`])
    expect(s1.global('changes')).toBe(CHANGED_OWNER | 32)
  })

  // In-world: the owner's own copy of the same item, rezzed by the owner -> 16 for BOB and 48 for
  // the owner, and no changed event.
  it('keeps what it held, also for another avatar, when its owner rezzes it', async () => {
    const f = await given()
    const [s1, s2] = f.item(f.avatars[OWNER]!) as [Driver, Driver]
    expect(s1.log()).toEqual([`rez ${ANIMATION} ${BOB} ${OWNER}`])
    expect(s2.held()).toEqual([ATTACH | ANIMATION, OWNER])
  })

  // In-world: a rezzed probe whose scripts held 32 for BOB and 4100 for the owner, with a dialog for
  // 20 open on the owner's screen, attached itself to BOB with llAttachToAvatarTemp -> on the next
  // line it read 0 and NULL_KEY with BOB as the owner. Each script then got attach(BOB) and
  // changed(CHANGED_OWNER), both reading 0. Yes on the owner's dialog afterwards did nothing.
  // Asked again, BOB as the wearer was granted 16 and 32 at once. A second run asked BOB for 8
  // after the hand-over, then the owner answered Yes on the old dialog -> nothing. BOB's Yes then
  // fired run_time_permissions(8).
  it('holds nothing after a temporary attach hands it to the wearer', async () => {
    const f = await fixture()
    f.s1.ask(ATTACH, BOB)
    f.answer(f.s1, BOB)
    f.s2.ask(TELEPORT | CONTROLS, OWNER)
    f.answer(f.s2, OWNER)
    f.s2.ask(CONTROLS | ANIMATION, OWNER)
    f.s1.tell('temp')
    const none = `0 ${NULL_KEY} ${BOB}`
    expect(f.s1.log().slice(-3)).toEqual([`temp ${none}`, `attach ${BOB} ${none}`, `owner ${none}`])
    expect(f.s2.log().slice(-2)).toEqual([`attach ${BOB} ${none}`, `owner ${none}`])
    const old = f.s2.script.permissionRequests.at(-1)!
    expect(() => f.s2.script.grantPermissions(undefined, old)).toThrow('no pending permission request')
    expect(f.s2.held()).toEqual([0, NULL_KEY])
    f.s2.ask(REMAP, BOB)
    expect(() => f.s2.script.grantPermissions(undefined, old)).toThrow('no pending permission request')
    f.answer(f.s2, BOB)
    expect(f.s2.held()).toEqual([REMAP, BOB])
    expect(f.s2.events().at(-1)).toBe(REMAP)
    f.s1.ask(ANIMATION, BOB)
    f.s2.ask(ATTACH, BOB)
    expect(f.s1.held()).toEqual([ANIMATION, BOB])
    expect(f.s2.held()).toEqual([ATTACH, BOB])
  })
})

describe('controls across a hand-over', () => {
  // Not measured: control input needs key presses, which the viewer tools here can't make. The
  // input of a script that was stopped when its object changed owner belonged to the old owner's
  // permission, which the hand-over took away, so it does not run when the script starts again.
  it('drops the control input a stopped script was holding back', async () => {
    const f = await fixture()
    f.s2.ask(CONTROLS, OWNER)
    f.answer(f.s2, OWNER)
    f.s2.tell('take')
    f.s1.tell('stop')
    f.s2.script.sendControl(1)
    f.linkset.advanceTime(0)
    f.s1.ask(ATTACH, BOB)
    f.answer(f.s1, BOB)
    f.s1.tell('temp')
    f.s1.tell('start')
    f.linkset.advanceTime(0)
    expect(f.s2.log()).not.toContain('control')
    expect(f.s2.held()).toEqual([0, NULL_KEY])
  })
})

describe('a given item worn by its new owner', () => {
  // In-world: a probe the owner made was given to BOB, who wore it from inventory -> on_rez, then
  // attach(BOB), then changed(CHANGED_OWNER), all reading 0 and NULL_KEY with BOB as the owner.
  it('says the owner changed after attach', async () => {
    const { rlv } = await loadRlvPair({ source: 'default { touch_start(integer n) { llOwnerSay(llGetObjectDesc()); } }' })
    const { world, avatar } = rlv
    world.addAvatar({ region: avatar.region, key: OWNER, username: 'owner' })
    const made = await loadLinkset({ world, region: avatar.region, owner: OWNER, prims: [{ scripts: [{ name: 's1', source: { source } }] }] })
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
    const worn = world.linksets.find(l => l.attachment && l !== rlv.script.linkset && l.allScripts().length)!
    worn.advanceTime(0)
    const none = `0 ${NULL_KEY} ${avatar.key}`
    expect(worn.allScripts()[0]!.global('log')).toEqual([`rez ${none}`, `attach ${avatar.key} ${none}`, `owner ${none}`])
  })
})

describe('scripted cameras for two avatars in one prim', () => {
  async function seated() {
    const f = await fixture()
    f.sit(OWNER)
    f.sit(BOB)
    f.s1.ask(TRACK | CAMERA, OWNER)
    f.s2.ask(TRACK | CAMERA, BOB)
    f.s1.tell('cam', 20)
    f.s2.tell('cam', 10)
    return f
  }

  // In-world: with the owner on the root and BOB on the child, the root's two scripts each held
  // 3072 for one avatar and locked that avatar's camera, the owner's 20 m up and BOB's 10 m up ->
  // each script read its own avatar's camera at its own height. BOB's script cleared -> BOB's
  // camera came back, the owner's stayed. The owner's script, granted 1024 by BOB, cleared ->
  // BOB's camera came back and the owner's stayed; asked the owner for 1024 again, it read the
  // owner's camera still 20 m up.
  it('clears only the camera of the avatar the script holds its key for', async () => {
    const f = await seated()
    f.s2.tell('clear')
    expect([f.s1.camera(), f.s2.camera()]).toEqual([true, false])
    f.s2.tell('cam', 10)
    f.s1.ask(TRACK, BOB)
    f.s1.tell('clear')
    expect(f.s2.camera()).toBe(false)
    f.s1.ask(TRACK, OWNER)
    expect(f.s1.camera()).toBe(true)
  })

  // In-world: with both cameras locked, BOB stood up -> the owner's camera came back to the owner
  // too, while the owner's script still held 3092. Repeated with a fresh lock, and the other way
  // round with BOB's camera locked and the owner standing: the same. BOB sitting down did not
  // release the owner's camera, and the owner sitting on another object and standing up from it
  // left BOB's camera locked.
  it('releases every sitter\'s camera when one sitter stands up', async () => {
    const f = await seated()
    f.stand(BOB)
    expect(f.s1.camera()).toBe(false)
    expect(f.s1.held()).toEqual([TRACK | CAMERA, OWNER])
    f.s1.tell('cam', 20)
    f.sit(BOB)
    expect(f.s1.camera()).toBe(true)
    f.s2.ask(TRACK | CAMERA, BOB)
    f.s2.tell('cam', 10)
    const other = await loadLinkset({ world: f.world, region: 'home', owner: BOB, prims: [{}] })
    f.stand(OWNER)
    expect(f.s2.camera()).toBe(false)
    f.s2.tell('cam', 10)
    expect(f.world.sitAvatar(f.avatars[OWNER]!, other.linkset.prims[0]!)).toBe(true)
    f.stand(OWNER)
    expect(f.s2.camera()).toBe(true)
  })
})

describe('scripted cameras set from different prims of one seat', () => {
  // In-world: the root's script locked the owner's camera, sitting on the root, 20 m up, and the
  // child prim's script locked BOB's, sitting on the child, 10 m up. The owner stood -> BOB's
  // camera came back to BOB too.
  it('releases a camera set from another prim when a sitter stands', async () => {
    const f = await fixture(OWNER, true)
    f.sit(OWNER)
    f.sit(BOB)
    f.s1.ask(TRACK | CAMERA, OWNER)
    f.s2.ask(TRACK | CAMERA, BOB)
    f.s1.tell('cam', 20)
    f.s2.tell('cam', 10)
    f.stand(OWNER)
    expect(f.s2.camera()).toBe(false)
    expect(f.s2.held()).toEqual([TRACK | CAMERA, BOB])
  })
})

describe('llAttachToAvatar with permission from someone other than the owner', () => {
  // In-world: a rezzed probe holding 32 from BOB called llAttachToAvatar -> DEBUG_CHANNEL said
  // "Script trying to attach to someone other than owner!" and the object stayed rezzed.
  it('refuses with an error', async () => {
    const f = await fixture()
    f.s1.ask(ATTACH, BOB)
    f.answer(f.s1, BOB)
    f.s1.tell('attach')
    expect(f.s1.errors()).toEqual(['Script trying to attach to someone other than owner!'])
    expect(f.linkset.attachment).toBeNull()
  })
})

describe('llTeleportAgent and whose permission the script holds', () => {
  // In-world: holding 4096 for the owner, the probe called llTeleportAgent on BOB -> "Script
  // trying to teleport agent without current permission!", and BOB stayed put.
  it('refuses another avatar with the owner\'s permission', async () => {
    const f = await fixture()
    f.s1.ask(TELEPORT, OWNER)
    f.answer(f.s1, OWNER)
    f.s1.tell('tp', 0, BOB)
    expect(f.s1.errors()).toEqual([NO_PERMISSION])
    expect(f.avatars[BOB]!.position).toEqual({ x: 0, y: 0, z: 0 })
  })

  // In-world: BOB was asked for 4096 and got an ordinary dialog. With BOB's Yes held, llTeleportAgent
  // on BOB -> "Teleport LSL functions can only teleport the owner of the object.", and on the owner
  // -> the missing-permission error. Neither avatar moved.
  it('refuses a non-owner who granted teleport, with its own error', async () => {
    const f = await fixture()
    f.s1.ask(TELEPORT, BOB)
    f.answer(f.s1, BOB)
    expect(f.s1.held()).toEqual([TELEPORT, BOB])
    f.s1.tell('tp', 0, BOB)
    f.s1.tell('tp', 0, OWNER)
    expect(f.s1.errors()).toEqual([NOT_OWNER, NO_PERMISSION])
    expect(f.avatars[OWNER]!.position).toEqual({ x: 0, y: 0, z: 0 })
  })

  // In-world: with BOB in the next region, the script holding BOB's 4096 called llTeleportAgent on
  // BOB -> nothing at all, twice. The script holding the owner's 4100 did the same -> the
  // missing-permission error, also for NULL_KEY. Back in the region, BOB got the owner-only
  // teleport error again. So the permission check comes first, then whether the avatar is in the
  // region (silently), then whether it is the owner.
  it('checks the permission, then the region, then the owner', async () => {
    const f = await fixture()
    f.s1.ask(TELEPORT, BOB)
    f.answer(f.s1, BOB)
    f.s2.ask(TELEPORT | CONTROLS, OWNER)
    f.answer(f.s2, OWNER)
    f.world.teleportAvatar(f.avatars[BOB]!, { x: 266, y: 10, z: 20 })
    f.s1.tell('tp', 0, BOB)
    f.s2.tell('tp', 0, BOB)
    f.s2.tell('tp', 0, NULL_KEY)
    expect(f.s1.errors()).toEqual([])
    expect(f.s2.errors()).toEqual([NO_PERMISSION, NO_PERMISSION])
    expect(f.s1.held()).toEqual([TELEPORT, BOB])
  })

  // In-world: the probe held 4100 for the owner, and the owner teleported to the next region. BOB
  // heard the probe read 4100 for the owner, and llTeleportAgent on the owner did nothing and said
  // nothing. Back on the platform the probe still held 4100 for the owner.
  it('keeps the permission of an avatar who left the region, and teleports nobody', async () => {
    const f = await fixture()
    f.s1.ask(TELEPORT | CONTROLS, OWNER)
    f.answer(f.s1, OWNER)
    f.world.teleportAvatar(f.avatars[OWNER]!, { x: 266, y: 10, z: 20 })
    expect(f.s1.held()).toEqual([TELEPORT | CONTROLS, OWNER])
    f.s1.tell('tp', 0, OWNER)
    expect(f.s1.errors()).toEqual([])
    expect(f.avatars[OWNER]!.region).toBe('north')
    f.world.teleportAvatar(f.avatars[OWNER]!, { x: 1, y: 1, z: 1 })
    expect(f.s1.held()).toEqual([TELEPORT | CONTROLS, OWNER])
  })
})
