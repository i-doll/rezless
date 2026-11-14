import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlRequestPermissions
// https://wiki.secondlife.com/wiki/LlGetAgentInfo
//
// Every "In-world" note below was measured on Aditi, SLua Tideland, 2026-11-14, with Firestorm
// (RLVa) and one avatar that owned every probe object.
//
// Three probe objects held the same script: one worn on the left hand, one rezzed and never sat
// on, and one rezzed with a sit target (the seat). On a chat command a probe asked its owner for
// permissions and said llGetPermissions(), whether llGetPermissionsKey() was the owner,
// llGetAgentInfo(owner) and llAvatarOnSitTarget() on the next line. It said the same from
// run_time_permissions and changed. A fourth prim repeated DEBUG_CHANNEL. The avatar was sat on
// the ground by a probe that said "@sitground=force" to it with llOwnerSay, and stood up through
// the viewer. The viewer's pending permission dialogs were listed and answered by the bits they
// asked for.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DEBUG_CHANNEL = 2147483647
const REFUSAL = 'Camera control currently only supported for attachments and objects on which you are sitting.'
// rezless has no "@sitground=force". In RLVa "@sit:<null key>=force" runs the same handler, and
// in-world it sat the standing avatar on the ground as "@sitground=force" did.
const SIT_GROUND = '@sit:00000000-0000-0000-0000-000000000000=force'

const DEBIT = 2, CONTROLS = 4, REMAP = 8, ANIMATION = 16, ATTACH = 32, TRACK = 1024, CAMERA = 2048
const OVERRIDE = 32768, GAME = 0x100000
const ALL_BITS = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 16384, 32768, 65536, 131072, 262144, 524288, 1048576]
const AGENT_SITTING = 0x10, AGENT_ON_OBJECT = 0x20, CHANGED_LINK = 32
const SEATING = AGENT_SITTING | AGENT_ON_OBJECT

const source = `
  list sync; list events; list changes; list seen; integer held; key holder; integer info; integer onTarget; key root;
  default {
    state_entry() { llSitTarget(<0.0, 0.0, 0.6>, ZERO_ROTATION); }
    link_message(integer sender, integer num, string str, key id) {
      if (str == "ask") { llRequestPermissions(llGetOwner(), num); sync += llGetPermissions(); }
      else if (str == "rlv") llOwnerSay((string)id);
      else if (str == "unsit") llUnSit(llGetOwner());
      else if (str == "controls") llTakeControls(CONTROL_FWD, TRUE, TRUE);
      else if (str == "camera") llSetCameraParams([CAMERA_ACTIVE, TRUE, CAMERA_POSITION_LOCKED, TRUE,
        CAMERA_POSITION, llGetPos() + <0.0, 0.0, 20.0>]);
      held = llGetPermissions(); holder = llGetPermissionsKey(); info = llGetAgentInfo(llGetOwner());
      onTarget = llAvatarOnSitTarget() != NULL_KEY;
      root = llList2Key(llGetObjectDetails(llGetOwner(), [OBJECT_ROOT]), 0);
    }
    run_time_permissions(integer p) { events += p; }
    changed(integer c) { changes += c; changes += llGetPermissions(); seen += llGetAgentInfo(llGetOwner()) & 48; }
  }`

async function fixture() {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner', viewer: { profile: 'rlva' } })
  const linksets: { advanceTime(ms: number): void }[] = []
  const tick = () => { for (const linkset of linksets) linkset.advanceTime(0) }
  const load = async () => {
    const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER,
      prims: [{ scripts: [{ name: 'probe', source: { source } }] }] })
    const script = scripts.probe!
    linksets.push(linkset)
    script.start()
    const send = (str: string, num = 0, id = '') => {
      script.fire('link_message', { sender_num: 1, num, str, id })
      tick()
    }
    const read = (name: string) => { send('read'); return script.global(name) }
    return {
      linkset, script, send,
      prim: linkset.prims[0]!,
      ask: (bits: number) => send('ask', bits),
      rlv: (command: string) => send('rlv', 0, command),
      held: () => [read('held'), read('holder')],
      /** The avatar's sitting bits, as the probe's llGetAgentInfo reads them. */
      sitting: () => (read('info') as number) & SEATING,
      events: () => script.global('events'),
      changes: () => script.global('changes'),
      errors: () => script.chat.filter(c => c.channel === DEBUG_CHANNEL).map(c => c.text),
      /** Answer the dialog that asked for `bits`. */
      answer: (bits: number) => {
        const request = script.permissionRequests.findLast(r => r.permissions === bits && !r.answered)
        expect(request).toBeDefined()
        script.grantPermissions(undefined, request)
        tick()
      },
    }
  }
  const worn = await load()
  worn.linkset.attachToAvatar(OWNER, 5)
  const rezzed = await load()
  const seat = await load()
  for (const { linkset } of [worn, rezzed, seat]) avatar.viewer.session.bind(linkset, avatar)
  const lastCommand = () => avatar.viewer.commandLog.at(-1)
  const groundSit = () => { world.sitAvatarOnGround(avatar); tick() }
  const stand = () => { expect(world.userStandAvatar(avatar)).toBe(true); tick() }
  const sit = () => { expect(world.userSitAvatar(avatar, seat.prim)).toBe(true); tick() }
  return { world, avatar, worn, rezzed, seat, groundSit, stand, sit, lastCommand }
}

describe('what a script reads of an avatar sitting on the ground', () => {
  // In-world: standing, the probes read llGetAgentInfo 6. After "@sitground=force" they read 22:
  // AGENT_SITTING was added and AGENT_ON_OBJECT was not. llGetObjectDetails(avatar, [OBJECT_ROOT])
  // was still the avatar's own key, llAvatarOnSitTarget() of the seat stayed NULL_KEY and no probe
  // got a changed event. After the stand they read 6 again, still with no event.
  it('reads AGENT_SITTING without AGENT_ON_OBJECT, and no object hears of it', async () => {
    const f = await fixture()
    const probes = [f.worn, f.rezzed, f.seat]
    expect(probes.map(p => p.sitting())).toEqual([0, 0, 0])
    f.groundSit()
    expect(probes.map(p => p.sitting())).toEqual([AGENT_SITTING, AGENT_SITTING, AGENT_SITTING])
    expect(f.seat.script.global('root')).toBe(OWNER)
    expect(f.seat.script.global('onTarget')).toBe(0)
    f.stand()
    expect(probes.map(p => p.sitting())).toEqual([0, 0, 0])
    expect(probes.map(p => p.changes())).toEqual([[], [], []])
  })
})

describe('permission requests to an avatar sitting on the ground', () => {
  // In-world: avatar on the ground, the worn probe asked for each bit in turn -> 4, 16, 32, 1024,
  // 2048, 32768 and 1048576 each read back on the next line and fired run_time_permissions. The
  // other twelve left llGetPermissions() as it was, and the viewer listed dialogs from the worn
  // probe for bits among them (2, 8, 64, 128 and 256 were read). These are a wearer's grants:
  // sitting on the ground adds nothing and takes nothing away.
  it('grants a wearer what a wearer gets', async () => {
    const f = await fixture()
    const wearer = [CONTROLS, ANIMATION, ATTACH, TRACK, CAMERA, OVERRIDE, GAME]
    f.groundSit()
    const granted = []
    for (const bits of ALL_BITS) {
      f.worn.ask(bits)
      if (f.worn.held()[0] === bits) granted.push(bits)
    }
    expect(granted).toEqual(wearer)
    expect(f.worn.events()).toEqual(wearer)
    expect(f.worn.errors()).toEqual([])
    expect(f.worn.script.permissionRequests.map(r => [r.permissions, r.answered]))
      .toEqual(ALL_BITS.map(bits => [bits, wearer.includes(bits)]))
  })

  // In-world: avatar on the ground, the rezzed probe asked for each bit in turn -> none was
  // granted and no event fired. 2048 raised no dialog: DEBUG_CHANNEL said the camera control
  // error once. The viewer listed dialogs from the rezzed probe for bits among the rest (2, 4, 8,
  // 16 and 32 were read). An avatar on the ground is a standing avatar to an object it is not
  // wearing, and a standing avatar gets a dialog for every bit but 2048.
  it('grants a rezzed object nothing and refuses it camera control', async () => {
    const f = await fixture()
    f.groundSit()
    for (const bits of ALL_BITS) f.rezzed.ask(bits)
    expect(f.rezzed.script.global('sync')).toEqual(ALL_BITS.map(() => 0))
    expect(f.rezzed.events()).toEqual([])
    expect(f.rezzed.held()).toEqual([0, '00000000-0000-0000-0000-000000000000'])
    expect(f.rezzed.errors()).toEqual([REFUSAL])
    expect(f.rezzed.script.permissionRequests.map(r => [r.permissions, r.answered]))
      .toEqual(ALL_BITS.filter(bits => bits !== CAMERA).map(bits => [bits, false]))
  })

  // In-world: avatar on the ground, the rezzed probe asked for 16 -> a dialog; Yes fired
  // run_time_permissions(16). Then it asked for 0 -> no event, still 16 (a sitter or wearer asked
  // for 0 gets run_time_permissions(0)). 20 -> still 16, one dialog for 20. 2048 -> the camera
  // control error, still 16. After the stand it still held 16, and Yes on the dialog for 20 fired
  // run_time_permissions(20).
  it('treats the rezzed object\'s requests as those to a standing avatar', async () => {
    const f = await fixture()
    f.groundSit()
    f.rezzed.ask(ANIMATION)
    f.rezzed.answer(ANIMATION)
    expect(f.rezzed.events()).toEqual([ANIMATION])
    f.rezzed.ask(0)
    f.rezzed.ask(CONTROLS | ANIMATION)
    f.rezzed.ask(CAMERA)
    expect(f.rezzed.events()).toEqual([ANIMATION])
    expect(f.rezzed.held()).toEqual([ANIMATION, OWNER])
    expect(f.rezzed.errors()).toEqual([REFUSAL])
    f.stand()
    expect(f.rezzed.held()).toEqual([ANIMATION, OWNER])
    f.rezzed.answer(CONTROLS | ANIMATION)
    expect(f.rezzed.events()).toEqual([ANIMATION, CONTROLS | ANIMATION])
  })

  // In-world: avatar on the ground, the worn probe asked for 0 -> run_time_permissions(0), with the
  // avatar as the permission key.
  it('answers a wearer on the ground who is asked for nothing', async () => {
    const f = await fixture()
    f.groundSit()
    f.worn.ask(0)
    expect(f.worn.events()).toEqual([0])
    expect(f.worn.held()).toEqual([0, OWNER])
  })

  // In-world: the rezzed probe asked its standing owner for 16 and the dialog was left open. The
  // avatar was sat on the ground -> the probe still held 0. Yes on the dialog, with the avatar
  // still on the ground, fired run_time_permissions(16).
  it('does not answer an open dialog by sitting on the ground', async () => {
    const f = await fixture()
    f.rezzed.ask(ANIMATION)
    f.groundSit()
    expect(f.rezzed.held()[0]).toBe(0)
    expect(f.rezzed.events()).toEqual([])
    f.rezzed.answer(ANIMATION)
    expect(f.rezzed.events()).toEqual([ANIMATION])
  })
})

describe('standing up from the ground', () => {
  // In-world: the rezzed probe was granted 1046 by its standing owner through a dialog, called
  // llTakeControls and asked for 2 (dialog left open). The avatar sat on the ground -> 1046. Stood
  // up -> 1046, no event. Grant on the dialog for 2 then fired run_time_permissions(2). A stand
  // from a seat takes controls from the seat's scripts and ends their waits; a stand from the
  // ground does neither for anybody.
  it('takes nothing from a rezzed object and leaves its dialog answerable', async () => {
    const f = await fixture()
    const held = DEBIT | CONTROLS | ANIMATION | TRACK
    f.rezzed.ask(held)
    f.rezzed.answer(held)
    f.rezzed.send('controls')
    f.rezzed.ask(DEBIT)
    f.groundSit()
    expect(f.rezzed.held()).toEqual([held, OWNER])
    f.stand()
    expect(f.rezzed.held()).toEqual([held, OWNER])
    expect(f.rezzed.script.controls).not.toBeNull()
    expect(f.rezzed.events()).toEqual([held])
    f.rezzed.answer(DEBIT)
    expect(f.rezzed.events()).toEqual([held, DEBIT])
  })

  // In-world: the worn probe was granted 3092 as a wearer, locked the camera 20 m up and asked for
  // 2 (dialog left open). llGetCameraPos() read the scripted position. Avatar on the ground ->
  // 3092, camera unchanged. Stood up -> 3092, camera unchanged. Grant on the dialog for 2 then
  // fired run_time_permissions(2).
  it('takes nothing from an attachment, whose camera stays', async () => {
    const f = await fixture()
    const held = CONTROLS | ANIMATION | TRACK | CAMERA
    f.worn.ask(held)
    f.worn.send('camera')
    f.worn.ask(DEBIT)
    const camera = new Map(f.worn.script.cameraParams)
    expect(camera.size).toBeGreaterThan(0)
    f.groundSit()
    expect(f.worn.held()).toEqual([held, OWNER])
    f.stand()
    expect(f.worn.held()).toEqual([held, OWNER])
    expect(new Map(f.worn.script.cameraParams)).toEqual(camera)
    f.worn.answer(DEBIT)
    expect(f.worn.events()).toEqual([held, DEBIT])
  })

  // In-world: the seat, holding nothing, asked its sitter for 2056. The sitter stood up and then
  // answered Yes -> run_time_permissions(2056), so the object held camera control for an avatar
  // who was not on it. The avatar sat on the ground -> 2056. The seat asked for 2048 and for 3072
  // -> the camera control error each time, still 2056. Stood up -> 2056.
  it('leaves camera control with an object that held it for a standing avatar', async () => {
    const f = await fixture()
    const held = REMAP | CAMERA
    f.sit()
    f.seat.ask(held)
    f.stand()
    f.seat.answer(held)
    expect(f.seat.held()).toEqual([held, OWNER])
    f.groundSit()
    expect(f.seat.held()).toEqual([held, OWNER])
    f.seat.ask(CAMERA)
    f.seat.ask(TRACK | CAMERA)
    expect(f.seat.errors()).toEqual([REFUSAL, REFUSAL])
    f.stand()
    expect(f.seat.held()).toEqual([held, OWNER])
    expect(f.seat.events()).toEqual([held])
  })
})

describe('sit requests to and from the ground', () => {
  // In-world: avatar on the ground, the viewer sent a sit request for the seat -> the seat got one
  // changed(32) and read llGetAgentInfo 54 (22 plus AGENT_ON_OBJECT) in it, with the avatar on its
  // sit target. The worn probe got no event. The seat asked for 20 -> granted on the next line.
  // The avatar stood up -> one changed(32), the seat held 16 and the probes read 6: standing, not
  // back on the ground.
  it('sits a ground sitter on an object at a plain sit request', async () => {
    const f = await fixture()
    f.groundSit()
    f.sit()
    expect(f.seat.changes()).toEqual([CHANGED_LINK, 0])
    expect(f.seat.script.global('seen')).toEqual([SEATING])
    expect(f.seat.sitting()).toBe(SEATING)
    expect(f.seat.script.global('onTarget')).toBe(1)
    f.seat.ask(CONTROLS | ANIMATION)
    expect(f.seat.script.global('sync')).toEqual([CONTROLS | ANIMATION])
    f.stand()
    expect(f.seat.changes()).toEqual([CHANGED_LINK, 0, CHANGED_LINK, ANIMATION])
    expect(f.seat.script.global('seen')).toEqual([SEATING, 0])
    expect([f.seat.sitting(), f.worn.sitting()]).toEqual([0, 0])
    expect(f.worn.changes()).toEqual([])
  })

  // In-world: avatar on the ground, the worn probe said "@sit:<seat key>=force" -> the seat got
  // one changed(32) with the avatar on its sit target, and a request for 20 was granted at once.
  it('sits a ground sitter on an object at a forced sit', async () => {
    const f = await fixture()
    f.groundSit()
    f.worn.rlv(`@sit:${f.seat.prim.key}=force`)
    expect(f.lastCommand()).toMatchObject({ action: 'sit', actionOutcome: 'applied' })
    expect(f.seat.changes()).toEqual([CHANGED_LINK, 0])
    expect(f.seat.sitting()).toBe(SEATING)
    expect(f.seat.script.global('onTarget')).toBe(1)
    f.seat.ask(CONTROLS | ANIMATION)
    expect(f.seat.events()).toEqual([CONTROLS | ANIMATION])
  })

  // In-world: avatar on the seat, which held 20 and had a dialog for 2 open. The worn probe said
  // "@sitground=force" -> the seat got one changed(32) and held 16. The probes then read
  // llGetAgentInfo 22 and the seat's sit target was empty. Grant on the dialog for 2 did nothing.
  // This is a stand from the seat followed by a ground sit, and the seat's scripts lose what a
  // stand takes.
  it('stands a sitter up from the seat when an attachment sits it on the ground', async () => {
    const f = await fixture()
    const held = CONTROLS | ANIMATION
    f.sit()
    f.seat.ask(held)
    f.seat.ask(DEBIT)
    f.worn.rlv(SIT_GROUND)
    expect(f.lastCommand()).toMatchObject({ action: 'sit', actionOutcome: 'applied' })
    expect(f.seat.changes()).toEqual([CHANGED_LINK, 0, CHANGED_LINK, ANIMATION])
    expect(f.seat.held()).toEqual([ANIMATION, OWNER])
    expect([f.seat.sitting(), f.worn.sitting()]).toEqual([AGENT_SITTING, AGENT_SITTING])
    expect(f.seat.script.global('onTarget')).toBe(0)
    f.seat.answer(DEBIT)
    expect(f.seat.events()).toEqual([held])
    expect(f.seat.held()).toEqual([ANIMATION, OWNER])
  })

  // In-world: avatar on the seat, which held 3092 and had locked the camera 20 m up; the worn
  // probe held 3092 too. The rezzed probe said "@sitground=force" -> the seat got one changed(32)
  // and held 1040, the worn probe still held 3092. In a run with nothing else holding camera
  // control, llGetCameraPos() read the scripted position before the command and the avatar's own
  // camera after it.
  it('takes the seat\'s camera when a rezzed object sits the sitter on the ground', async () => {
    const f = await fixture()
    const held = CONTROLS | ANIMATION | TRACK | CAMERA
    f.sit()
    f.seat.ask(held)
    f.seat.send('camera')
    expect(f.seat.script.cameraParams.size).toBeGreaterThan(0)
    f.worn.ask(held)
    f.rezzed.rlv(SIT_GROUND)
    expect(f.lastCommand()).toMatchObject({ action: 'sit', actionOutcome: 'applied' })
    expect(f.seat.changes()).toEqual([CHANGED_LINK, 0, CHANGED_LINK, ANIMATION | TRACK])
    expect(f.seat.held()).toEqual([ANIMATION | TRACK, OWNER])
    expect(f.seat.script.cameraParams.size).toBe(0)
    expect(f.worn.held()).toEqual([held, OWNER])
    expect(f.rezzed.sitting()).toBe(AGENT_SITTING)
  })

  // In-world: in the changed(32) of those ground sits the seat read llGetAgentInfo 262: the avatar
  // had stood up and was not on the ground yet. It read 22 when asked a moment later. rezless has
  // no such moment: the avatar is on the ground as soon as the command is handled, so the seat's
  // handler reads AGENT_SITTING. This pins what rezless does, not what the grid did.
  it('has the avatar on the ground already when the seat hears of the stand', async () => {
    const f = await fixture()
    f.sit()
    f.worn.rlv(SIT_GROUND)
    expect(f.seat.script.global('seen')).toEqual([SEATING, AGENT_SITTING])
  })

  // In-world: avatar on the seat, which held nothing and had a dialog for 2 open. The worn probe
  // said "@sitground=force" -> one changed(32). Grant on the dialog, with the avatar on the
  // ground, fired run_time_permissions(2). A script that holds nothing for the avatar keeps
  // waiting through the stand, as it does when the sitter stands up.
  it('keeps the dialog of a seat that held nothing for the sitter', async () => {
    const f = await fixture()
    f.sit()
    f.seat.ask(DEBIT)
    f.worn.rlv(SIT_GROUND)
    expect(f.seat.changes()).toEqual([CHANGED_LINK, 0, CHANGED_LINK, 0])
    f.seat.answer(DEBIT)
    expect(f.seat.events()).toEqual([DEBIT])
    expect(f.seat.held()).toEqual([DEBIT, OWNER])
  })

  // In-world: avatar on the ground. The worn probe said "@sitground=force" again -> still
  // llGetAgentInfo 22, no event. The rezzed probe, on land its owner does not own, called
  // llUnSit(owner) -> still 22. The worn probe said "@unsit=force" -> 6, the avatar stood.
  it('ignores a second ground sit and an llUnSit from land the owner does not own, and stands at a forced unsit', async () => {
    const f = await fixture()
    f.groundSit()
    f.worn.rlv(SIT_GROUND)
    expect(f.lastCommand()).toMatchObject({ action: 'sit', actionOutcome: 'unchanged' })
    expect(f.worn.sitting()).toBe(AGENT_SITTING)
    f.rezzed.send('unsit')
    expect(f.worn.sitting()).toBe(AGENT_SITTING)
    f.worn.rlv('@unsit=force')
    expect(f.lastCommand()).toMatchObject({ action: 'unsit', actionOutcome: 'applied' })
    expect(f.worn.sitting()).toBe(0)
    expect([f.worn, f.rezzed, f.seat].map(p => p.changes())).toEqual([[], [], []])
  })
})
