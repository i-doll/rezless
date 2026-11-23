import { expect, it } from 'vitest'
import { loadLinkset, seedRlvInventory, World } from '../src/index.js'
import type { Linkset, Script } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Game_control
// https://wiki.secondlife.com/wiki/llGetGameControlMode
// https://wiki.secondlife.com/wiki/State
// Every "In-world" note below was measured on Aditi, SLua Tideland, 2026-11-23, a region whose
// features say GameControlEnabled. The probe was an unworn box of i doll's whose script asked
// i doll for PERMISSION_GAME_CONTROL; i doll answered the dialog with Yes. The script logged each
// game_control with llGetGameControlMode/llGetGameControlModeButtons for the owner as mode/buttons,
// and could be armed by chat to sleep in its next game_control, or to sleep in a listen handler.
const OWNER = 'abcdefab-1111-1111-1111-111111111111'

const probe = `list log; integer mode; integer secs; integer xs; integer tsleep;
  string fns() { key k = llGetOwner(); return (string)llGetGameControlMode(k) + "/" + (string)llGetGameControlModeButtons(k); }
  default {
    state_entry() { llListen(5, "", "", ""); log += "entry " + fns(); }
    on_rez(integer p) { log += "rez " + fns(); }
    touch_start(integer n) { log += "ts " + fns(); if (tsleep) { tsleep = 0; llSleep(8); log += "tswoke " + fns(); } }
    listen(integer c, string n, key id, string m) {
      if (m == "perm") llRequestPermissions(llGetOwner(), PERMISSION_GAME_CONTROL);
      else if (m == "x") { if (!xs) log += "x1 " + fns(); ++xs; }
      else if (m == "nap") { log += "nap " + fns(); llSleep(40); log += "woke " + fns() + " xs " + (string)xs; }
      else if (m == "nap10") { log += "nap " + fns(); llSleep(10); log += "woke " + fns(); }
      else if (m == "napgo") { log += "nap " + fns(); llSleep(10); log += "woke " + fns(); state two; }
      else if (m == "tsleep") tsleep = 1;
      else if (m == "back") state default;
      else { list l = llParseString2List(m, [" "], []); mode = llList2Integer(l, 0); secs = llList2Integer(l, 1); }
    }
    game_control(key id, integer b, list a) {
      integer m = mode; mode = 0;
      log += "ev " + (string)b + " " + fns() + " xs " + (string)xs;
      if (m == 1) { llSleep(secs); log += "woke " + fns(); }
      else if (m == 2) { llSleep(secs); log += "mid " + fns(); llSleep(secs); log += "woke2 " + fns(); }
      else if (m == 3) { llSleep(secs); log += "woke " + fns(); state two; }
      else if (m == 4) { llSleep(secs); log += "woke " + fns(); state three; }
    }
  }
  state two {
    state_entry() { llListen(5, "", "", ""); log += "two entry " + fns(); }
    listen(integer c, string n, key id, string m) { if (m == "back") state default; }
    game_control(key id, integer b, list a) { log += "two ev " + (string)b + " " + fns(); }
  }
  state three {
    state_entry() { llListen(5, "", "", ""); log += "three entry " + fns(); }
    attach(key id) { log += "three attach " + (string)(id != NULL_KEY) + " " + fns(); }
    listen(integer c, string n, key id, string m) { if (m == "back") state default; log += "three say " + m + " " + fns(); }
  }`

async function box() {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner.resident' })
  const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'gc', source: { source: probe } }] }] })
  const gc = scripts.gc!
  gc.start()
  linkset.advanceTime(0)
  const say = (m: string, script: Script = gc) => { world.clock.schedule(script, world.clock.now, 'listen', { channel: 5, name: 'owner', id: OWNER, msg: m }); script.linkset.advanceTime(0) }
  say('perm')
  gc.grantPermissions()
  linkset.advanceTime(0)
  // In-world the probe had run a press and a release before each measurement.
  gc.sendGameControl(OWNER, { buttons: 1 })
  gc.sendGameControl(OWNER, {})
  const log = (script: Script = gc) => (script.global('log') as string[]).slice(3)
  return { world, avatar, linkset, gc, say, log }
}

// In-world: armed to sleep 15 s, sent button 0 for 1 s, taken 2 s after the release and rezzed
// again 5 s later -> the copy woke reading -1/0, then on_rez read -1/0, and the release never ran.
// A press and a release sent to the copy then gave two events.
it('drops the input that waited for a game_control handler asleep through a take and rez', async () => {
  const f = await box()
  f.say('1 15')
  f.gc.sendGameControl(OWNER, { buttons: 1 })
  f.linkset.advanceTime(1_000)
  f.gc.sendGameControl(OWNER, {})
  f.linkset.advanceTime(2_000)
  const saved = f.linkset.copy()
  f.linkset.remove()
  seedRlvInventory(f.avatar, { sharedRootId: null, entries: [{ id: 'item', kind: 'item', parentId: null, name: 'probe', object: saved, assetType: 'object' }] })
  const object = f.world.attemptAvatarRez(f.avatar, 'item', { x: 1, y: 2, z: 3 }).object!
  object.advanceTime(30_000)
  const copy = object.allScripts()[0]!
  expect(f.log(copy)).toEqual(['ev 1 0/1 xs 0', 'woke -1/0', 'rez -1/0'])
  copy.sendGameControl(OWNER, { buttons: 1 })
  copy.sendGameControl(OWNER, {})
  expect(f.log(copy).slice(3)).toEqual(['ev 1 0/1 xs 0', 'ev 0 0/0 xs 0'])
})

// In-world: the script slept 40 s in a listen handler while 72 chat lines came in, then button 2
// was pressed and let go -> it woke reading 0/0, ran 64 listens, and no game_control came. The
// same with button 2 held past the wake -> it woke reading the press (0/4), the press never
// raised an event, and the release that came after the 64 listens ran did.
it.each([
  ['let go during the sleep', 1_000, ['nap 0/0', 'woke 0/0 xs 0', 'x1 0/0']],
  ['held past the wake', 45_000, ['nap 0/0', 'woke 0/4 xs 0', 'x1 0/4', 'ev 0 0/0 xs 64']],
])('updates the values but drops the event when input comes to a full queue (%s)', async (_, holdMs, expected) => {
  const f = await box()
  f.say('nap')
  for (let i = 0; i < 72; i++) f.world.clock.schedule(f.gc, f.world.clock.now, 'listen', { channel: 5, name: 'owner', id: OWNER, msg: 'x' })
  f.linkset.advanceTime(10_000)
  f.gc.sendGameControl(OWNER, { buttons: 4 })
  f.linkset.advanceTime(holdMs)
  f.gc.sendGameControl(OWNER, {})
  f.linkset.advanceTime(60_000)
  expect(f.log()).toEqual(expected)
  expect(f.gc.global('xs')).toBe(64)
})

// In-world: armed to sleep 10 s and then change state, sent button 0 for 1.5 s -> the new state's
// state_entry read the sleeping event's values (0/1). In a state with a game_control handler the
// release ran there. In a state without one nothing ran, the values stayed 0/1, and the release
// ran once the script went back to default. With button 1 pressed 4 s after the release and held
// 15 s, past the wake: one event for the press (2) in the state with a handler, then the release.
// In the state without one the release came while it was there and was lost, and back in default
// one event ran for the press.
it.each([
  ['a state with a game_control handler', 3, [0], ['two entry 0/1', 'two ev 0 0/0', 'entry 0/0']],
  ['a state with no game_control handler', 4, [0], ['three entry 0/1', 'three say held 0/1', 'entry 0/1', 'ev 0 0/0 xs 0']],
  ['a state with a game_control handler, new input held past the wake', 3, [0, 2], ['two entry 0/1', 'two ev 2 0/2', 'two ev 0 0/0', 'entry 0/0']],
  ['a state with no game_control handler, new input held past the wake', 4, [0, 2], ['three entry 0/1', 'three say held 0/1', 'entry 0/1', 'ev 2 0/2 xs 0']],
])('keeps the input that waited for a game_control handler that changed state, for %s', async (_, mode, sent, after) => {
  const f = await box()
  f.say(`${mode} 10`)
  f.gc.sendGameControl(OWNER, { buttons: 1 })
  f.linkset.advanceTime(1_500)
  for (const buttons of sent) {
    f.gc.sendGameControl(OWNER, { buttons })
    f.linkset.advanceTime(4_000)
  }
  f.linkset.advanceTime(6_000)
  f.gc.sendGameControl(OWNER, {})
  f.linkset.advanceTime(1_000)
  f.say('held')
  f.say('back')
  f.linkset.advanceTime(1_000)
  expect(f.log()).toEqual(['ev 1 0/1 xs 0', 'woke 0/1', ...after])
})

// In-world: the script slept 10 s in a listen handler, then changed to a state with a game_control
// handler. Button 0 was pressed 2 s into the sleep and held 15 s -> the handler woke reading the
// press (0/1), state_entry read 0/1, no event ran for the press, and the release ran in the new
// state.
it('drops the input that waited for a listen handler that changed state', async () => {
  const f = await box()
  f.say('napgo')
  f.linkset.advanceTime(2_000)
  f.gc.sendGameControl(OWNER, { buttons: 1 })
  f.linkset.advanceTime(15_000)
  f.gc.sendGameControl(OWNER, {})
  f.linkset.advanceTime(1_000)
  expect(f.log()).toEqual(['nap 0/0', 'woke 0/1', 'two entry 0/1', 'two ev 0 0/0'])
})

// In-world (#545): a script asleep in a listen handler that was sent a press and a release woke
// reading the release, then ran one event for it. Here the press comes at the instant the sleep
// begins.
it('reads input that comes as a listen handler starts to sleep', async () => {
  const f = await box()
  f.say('nap10')
  f.gc.sendGameControl(OWNER, { buttons: 1 })
  f.linkset.advanceTime(1_000)
  f.gc.sendGameControl(OWNER, {})
  f.linkset.advanceTime(10_000)
  expect(f.log()).toEqual(['nap 0/0', 'woke 0/0', 'ev 0 0/0 xs 0'])
})

// In-world: the probe, worn, slept 10 s in game_control and changed to the state with no
// game_control handler, with a release waiting. It detached itself there and was worn again ->
// the attach events read -1/0, and back in default no event ran for the release.
it('drops the input carried into a state with no game_control handler at a detach', async () => {
  const f = await box()
  f.linkset.attachToAvatar(OWNER, 5)
  f.linkset.advanceTime(0)
  f.say('4 10')
  f.gc.sendGameControl(OWNER, { buttons: 1 })
  f.linkset.advanceTime(1_500)
  f.gc.sendGameControl(OWNER, {})
  f.linkset.advanceTime(12_000)
  f.linkset.detachFromAvatar()
  f.linkset.advanceTime(4_000)
  f.linkset.attachToAvatar(OWNER, 5)
  f.linkset.advanceTime(0)
  f.say('back')
  f.linkset.advanceTime(1_000)
  expect(f.log()).toEqual(['ev 1 0/1 xs 0', 'woke 0/1', 'three entry 0/1', 'three attach 0 0/1', 'three attach 1 -1/0', 'entry -1/0'])
})

// In-world: the script slept 10 s in a listen handler; a click and a 1 s press of button 0 came
// during the sleep. After the wake touch_start ran and slept 8 s, and button 1 was pressed in that
// sleep and held past it -> touch_start woke reading 0/0, then one event for the release that
// waited from the first sleep and one for the new press.
it('keeps apart a game_control that waited from an earlier handler and input in the next sleep', async () => {
  const f = await box()
  f.say('tsleep')
  f.say('nap10')
  f.linkset.advanceTime(1_000)
  f.world.clock.schedule(f.gc, f.world.clock.now, 'touch_start', { num_detected: 1, detected: [{ key: OWNER, name: 'owner' }] })
  f.gc.sendGameControl(OWNER, { buttons: 1 })
  f.linkset.advanceTime(1_000)
  f.gc.sendGameControl(OWNER, {})
  f.linkset.advanceTime(10_000)
  f.gc.sendGameControl(OWNER, { buttons: 2 })
  f.linkset.advanceTime(15_000)
  expect(f.log()).toEqual(['nap 0/0', 'woke 0/0', 'ts 0/0', 'tswoke 0/0', 'ev 0 0/0 xs 0', 'ev 2 0/2 xs 0'])
})

// In-world: armed to sleep 8 s twice, sent button 0 for 1.5 s (the release came in the first
// sleep), then button 3 pressed in the second sleep and held past the wake -> one event, for 8,
// then the release. Button 3 pressed and let go in the second sleep instead -> one event, for 0.
it.each([
  ['held past the wake', 12_000, ['ev 8 0/8 xs 0', 'ev 0 0/0 xs 0']],
  ['let go in the second sleep', 1_500, ['ev 0 0/0 xs 0']],
])('gives one event for the input that came in two sleeps of a game_control handler (%s)', async (_, holdMs, after) => {
  const f = await box()
  f.say('2 8')
  f.gc.sendGameControl(OWNER, { buttons: 1 })
  f.linkset.advanceTime(1_500)
  f.gc.sendGameControl(OWNER, {})
  f.linkset.advanceTime(8_000)
  f.gc.sendGameControl(OWNER, { buttons: 8 })
  f.linkset.advanceTime(holdMs)
  f.gc.sendGameControl(OWNER, {})
  f.linkset.advanceTime(20_000)
  expect(f.log()).toEqual(['ev 1 0/1 xs 0', 'mid 0/1', 'woke2 0/1', ...after])
})

/** A box whose game_control handler sleeps 15 s when armed, logging land collisions. */
async function landBox() {
  const f = await box()
  const { linkset, scripts } = await loadLinkset({ world: f.world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'land', source: { source: `list log; integer sleepy;
    default {
      state_entry() { llListen(5, "", "", ""); llRequestPermissions(llGetOwner(), PERMISSION_GAME_CONTROL); }
      listen(integer c, string n, key id, string m) { sleepy = 1; }
      game_control(key id, integer b, list a) { log += "ev " + (string)b; if (sleepy) { sleepy = 0; llSleep(15); log += "woke"; } }
      collision_start(integer n) { log += "cs"; }
      collision(integer n) { log += "c"; }
      collision_end(integer n) { log += "ce"; }
      land_collision_start(vector p) { log += "lcs"; }
      land_collision(vector p) { log += "lc"; }
      land_collision_end(vector p) { log += "lce"; }
    }` } }] }] })
  const land = scripts.land!
  land.start()
  linkset.advanceTime(0)
  land.grantPermissions()
  linkset.advanceTime(0)
  return { ...f, land, landLinkset: linkset }
}

function touchDown(linkset: Linkset, land: Script, count: number) {
  const pos = { x: 1, y: 2, z: 22 }
  linkset.world!.clock.schedule(land, linkset.world!.clock.now, 'land_collision_start', { pos })
  for (let i = 0; i < count; i++) {
    linkset.advanceTime(50)
    linkset.world!.clock.schedule(land, linkset.world!.clock.now, 'land_collision', { pos })
  }
  linkset.advanceTime(50)
  linkset.world!.clock.schedule(land, linkset.world!.clock.now, 'land_collision_end', { pos })
}

// In-world: a physical box asleep 15 s in game_control fell about 3 m onto bare land, came to
// rest and was lifted off it before the wake. With the release sent before the fall, or after the
// box was lifted, the wake ran land_collision_start, one land_collision, game_control for the
// release, the other land_collision events and land_collision_end, all within 0.2 s.
it.each([['before', true], ['after', false]])('runs a game_control that waited after land_collision_start and the first land_collision (release %s the fall)', async (_, first) => {
  const f = await landBox()
  f.say('sleep', f.land)
  f.land.sendGameControl(OWNER, { buttons: 1 })
  f.landLinkset.advanceTime(1_000)
  if (first) f.land.sendGameControl(OWNER, {})
  f.landLinkset.advanceTime(1_000)
  touchDown(f.landLinkset, f.land, 4)
  f.landLinkset.advanceTime(1_000)
  if (!first) f.land.sendGameControl(OWNER, {})
  f.landLinkset.advanceTime(20_000)
  expect(f.land.global('log')).toEqual(['ev 1', 'woke', 'lcs', 'lc', 'ev 0', 'lc', 'lc', 'lc', 'lce'])
})

// In-world: the same box dropped onto a prim ramp sloping down onto the land, asleep 15 s in
// game_control. It hit the ramp (collision_start, collision), slid onto the land
// (land_collision_start, land_collision) and off the ramp (collision_end), and was made
// non-physical before the wake. Four runs woke to land_collision_start, collision_start,
// collision and one land_collision first. With the release sent during the sleep, game_control
// ran next, then a land_collision, collision_end, the last land_collision and
// land_collision_end, twice. With the press held past the wake, collision_end ran after the
// first land_collision in one run and after the second in the other.
it.each([['held during the sleep', true], ['held past the wake', false]])('runs land_collision_start first and collision_end with the later land collisions (release %s)', async (_, released) => {
  const f = await landBox()
  const { clock } = f.world
  const at = (event: string, payload: Record<string, unknown>) => { clock.schedule(f.land, clock.now, event, payload); f.landLinkset.advanceTime(50) }
  const ramp = { num_detected: 1, detected: [{ key: '99999999-9999-4999-8999-999999999999', name: 'ramp' }] }
  const ground = { pos: { x: 1, y: 2, z: 22 } }
  f.say('sleep', f.land)
  f.land.sendGameControl(OWNER, { buttons: 1 })
  f.landLinkset.advanceTime(1_000)
  if (released) f.land.sendGameControl(OWNER, {})
  at('collision_start', ramp)
  at('collision', ramp)
  at('land_collision_start', ground)
  at('land_collision', ground)
  at('collision', ramp)
  at('land_collision', ground)
  at('collision_end', ramp)
  at('land_collision', ground)
  at('land_collision_end', ground)
  f.landLinkset.advanceTime(20_000)
  expect(f.land.global('log')).toEqual(['ev 1', 'woke', 'lcs', 'cs', 'c', 'lc', ...released ? ['ev 0'] : [], 'lc', 'ce', 'lc', 'lce'])
})
