import { expect, it } from 'vitest'
import { loadLinkset, seedRlvInventory, World } from '../src/index.js'
import type { Linkset, Script } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Game_control
// https://wiki.secondlife.com/wiki/llGetGameControlMode
// Every "In-world" note below was measured on Aditi, SLua Tideland, 2026-11-23, a region whose
// features say GameControlEnabled, with a viewer sending its controller state as
// GameControlData. The probe was a worn prim holding three scripts that each held the owner's
// PERMISSION_GAME_CONTROL: one with a game_control handler that could be armed to sleep 20 s
// in its next event, one with no game_control handler that polled the three mode functions
// every 0.2 s, and one that slept 12 s in a listen handler and had a game_control handler too.
// Each logged the mode functions for the owner as mode/buttons/axes.
const OWNER = 'abcdefab-1111-1111-1111-111111111111'

const read = `string fns() { key k = llGetOwner(); return (string)llGetGameControlMode(k) + "/" + (string)llGetGameControlModeButtons(k) + "/" + (string)llGetListLength(llGetGameControlModeAxes(k)); }`
const sleeper = `list log; integer sleepy; ${read}
  default {
    state_entry() { llListen(5, "", "", ""); llRequestPermissions(llGetOwner(), PERMISSION_GAME_CONTROL); }
    listen(integer c, string n, key id, string m) {
      if (m == "sleep") sleepy = 1;
      else if (m == "nap") { log += "nap " + fns(); llSleep(12); log += "woke " + fns(); }
      else log += m + " " + fns();
    }
    attach(key id) { if (id) log += "attach " + fns(); }
    game_control(key id, integer b, list a) {
      log += "ev " + (string)b + " " + fns();
      if (sleepy) { sleepy = 0; llSleep(20); log += "woke " + fns(); }
    }
  }`
const nohandler = `list log; ${read}
  default {
    state_entry() { llListen(5, "", "", ""); llRequestPermissions(llGetOwner(), PERMISSION_GAME_CONTROL); }
    listen(integer c, string n, key id, string m) { log += m + " " + fns(); }
  }`

async function worn() {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: OWNER, username: 'owner.resident' })
  const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [
    { name: 'gc', source: { source: sleeper } },
    { name: 'nohandler', source: { source: nohandler } },
  ] }] })
  linkset.attachToAvatar(OWNER, 5)
  for (const s of Object.values(scripts)) s.start()
  linkset.advanceTime(0)
  const gc = scripts.gc!
  const say = (m: string, script: Script = gc) => world.clock.schedule(script, world.clock.now, 'listen', { channel: 5, name: 'owner', id: OWNER, msg: m })
  // The first wear's attach event is not part of any probe.
  const log = (script: Script = gc) => (script.global('log') as string[]).filter((line, i) => i > 0 || !line.startsWith('attach'))
  return { world, linkset, gc, nop: scripts.nohandler!, say, log }
}

/** Arm the game_control handler to sleep 20 s, then press a button: the handler sleeps from now. */
function asleep(f: Awaited<ReturnType<typeof worn>>, buttons: number) {
  f.say('sleep')
  f.linkset.advanceTime(0)
  f.gc.sendGameControl(OWNER, { buttons })
  f.linkset.advanceTime(1_000)
}

function detachAndWear(linkset: Linkset, ms: number) {
  linkset.detachFromAvatar()
  linkset.advanceTime(ms)
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(0)
}

// In-world: after the permission came, the viewer sent an all-zero state (no buttons, no axes)
// for 0.8 s as its first game control of the session -> no event. A press and a release then
// gave two events, and another all-zero state sent after them gave none.
it('raises nothing for an all-zero first state', async () => {
  const f = await worn()
  f.gc.sendGameControl(OWNER, {})
  expect(f.log()).toEqual([])
  f.gc.sendGameControl(OWNER, { buttons: 4, axes: [0.5] })
  f.gc.sendGameControl(OWNER, {})
  f.gc.sendGameControl(OWNER, {})
  expect(f.log()).toEqual(['ev 4 0/4/5', 'ev 0 0/0/5'])
})

// In-world: the script with no game_control handler held 1048576 and polled every 0.2 s through
// a 1.5 s press of button 2 and its release -> it read -1/0/[] the whole time, and again when
// asked afterwards, while the script with a handler read 0/4 and then 0/0.
it('reads nothing in a script that holds the permission but has no game_control handler', async () => {
  const f = await worn()
  f.gc.sendGameControl(OWNER, { buttons: 4 })
  f.say('held', f.nop)
  f.linkset.advanceTime(0)
  f.gc.sendGameControl(OWNER, {})
  f.say('after', f.nop)
  f.linkset.advanceTime(0)
  expect(f.log(f.nop)).toEqual(['held -1/0/0', 'after -1/0/0'])
  expect(f.nop.state.permissions.granted).toBe(1 << 20)
})

// In-world: the handler slept 20 s in the event for button 1. The press was let go 0.6 s in, the
// object detached itself 1 s in and was worn again 4 s later -> the handler woke 25 s after it
// began and read -1/0/[]; the two attach events followed and read the same; the release that
// came in before the detach never ran. Without the detach, the release ran after the wake, and
// the handler woke reading its own event's values.
it('forgets the values in a game_control handler asleep through a detach, and the input that waited', async () => {
  const f = await worn()
  asleep(f, 2)
  f.gc.sendGameControl(OWNER, {})
  detachAndWear(f.linkset, 4_000)
  f.linkset.advanceTime(30_000)
  expect(f.log()).toEqual(['ev 2 0/2/5', 'woke -1/0/0', 'attach -1/0/0'])
})

it('runs the release that waited for a game_control handler asleep without a detach', async () => {
  const f = await worn()
  asleep(f, 8)
  f.gc.sendGameControl(OWNER, {})
  f.linkset.advanceTime(30_000)
  expect(f.log()).toEqual(['ev 8 0/8/5', 'woke 0/8/5', 'ev 0 0/0/5'])
})

// In-world: the same detach and wear, then button 6 held for 30 s, sent 2 s after the wear while
// the handler still slept -> the handler woke reading 0/64, the attach events read 0/64, then
// one game_control for 64 and one for the release. Button 5 pressed and let go after the wear
// instead -> it woke reading 0/0 and only the release ran, with no event for 32.
it.each([
  [[64], 'woke 0/64/5', ['ev 64 0/64/5']],
  [[32, 0], 'woke 0/0/5', ['ev 0 0/0/5']],
])('reads new input at once in a game_control handler worn again while it sleeps (%j)', async (sent, woke, events) => {
  const f = await worn()
  asleep(f, 16)
  detachAndWear(f.linkset, 4_000)
  f.linkset.advanceTime(2_000)
  for (const buttons of sent) f.gc.sendGameControl(OWNER, { buttons })
  f.linkset.advanceTime(30_000)
  expect(f.log()).toEqual(['ev 16 0/16/5', woke, `attach ${woke.slice(5)}`, ...events])
})

// In-world: the handler slept in the event for button 0. Button 0 was let go 3 s in and button 2
// pressed and held past the wake -> the handler woke reading its own event's values (0/1), then
// one game_control for 4; the release in between never ran.
it('keeps only the newest input that came while a game_control handler slept', async () => {
  const f = await worn()
  asleep(f, 1)
  f.linkset.advanceTime(2_000)
  f.gc.sendGameControl(OWNER, {})
  f.linkset.advanceTime(1_000)
  f.gc.sendGameControl(OWNER, { buttons: 4 })
  f.linkset.advanceTime(30_000)
  expect(f.log()).toEqual(['ev 1 0/1/5', 'woke 0/1/5', 'ev 4 0/4/5'])
})

// In-world: the handler slept in the event for button 0, the press was let go 2 s in, a chat
// command came 1 s after that -> after the wake the listen handler ran first and read the
// sleeping event's values (0/1), then the game_control for the release. A second press sent
// after the chat line made no difference to the order: the listen read 0/1, then one event for 4.
it.each([
  [[0], ['dump 0/1/5', 'ev 0 0/0/5']],
  [[0, 4], ['dump 0/1/5', 'ev 4 0/4/5']],
])('runs a game_control that waited in a sleep behind chat that came after it (%j)', async (sent, after) => {
  const f = await worn()
  asleep(f, 1)
  f.gc.sendGameControl(OWNER, { buttons: sent[0] })
  f.linkset.advanceTime(1_000)
  f.say('dump')
  f.linkset.advanceTime(1_000)
  for (const buttons of sent.slice(1)) f.gc.sendGameControl(OWNER, { buttons })
  f.linkset.advanceTime(30_000)
  expect(f.log()).toEqual(['ev 1 0/1/5', 'woke 0/1/5', ...after])
})

// In-world: a script added to the worn prim got the permission and read -1, then slept 12 s in
// a listen handler while button 3 was held 4 s -> it woke reading 0/0, the values of the release
// whose event had not run yet, then ran one game_control for the release. Asleep again, it was
// sent button 5, held past the wake -> it woke reading 0/32, then ran the event for 32.
it('reads new input at once in a script asleep in another handler', async () => {
  const f = await worn()
  f.say('nap')
  f.linkset.advanceTime(2_000)
  f.gc.sendGameControl(OWNER, { buttons: 8 })
  f.linkset.advanceTime(4_000)
  f.gc.sendGameControl(OWNER, {})
  f.linkset.advanceTime(10_000)
  expect(f.log()).toEqual(['nap -1/0/0', 'woke 0/0/5', 'ev 0 0/0/5'])
  f.say('nap')
  f.linkset.advanceTime(2_000)
  f.gc.sendGameControl(OWNER, { buttons: 32 })
  f.linkset.advanceTime(15_000)
  expect(f.log().slice(3)).toEqual(['nap 0/0/5', 'woke 0/32/5', 'ev 32 0/32/5'])
})

// A state change leaves the game_control handler, so a state_entry asleep after it is asleep in
// another handler, as the 'nap' probe above was.
it('reads new input at once in a state_entry that a game_control handler changed to', async () => {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: OWNER, username: 'owner.resident' })
  const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'main', source: { source: `list log; ${read}
    default {
      state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_GAME_CONTROL); }
      game_control(key id, integer b, list a) { log += "ev " + (string)b + " " + fns(); state two; }
    }
    state two {
      state_entry() { llSleep(10); log += "woke " + fns(); }
      game_control(key id, integer b, list a) { log += "ev " + (string)b + " " + fns(); }
    }` } }] }] })
  linkset.attachToAvatar(OWNER, 5)
  scripts.main!.start()
  linkset.advanceTime(0)
  scripts.main!.sendGameControl(OWNER, { buttons: 1 })
  linkset.advanceTime(2_000)
  scripts.main!.sendGameControl(OWNER, { buttons: 4 })
  linkset.advanceTime(20_000)
  expect(scripts.main!.global('log')).toEqual(['ev 1 0/1/5', 'woke 0/4/5', 'ev 4 0/4/5'])
})

// In-world (#541 and the re-wear above): the values do not survive a trip through inventory. An
// SLua script goes through inventory as its LSL twin does.
it.each(['lsl', 'slua'] as const)('forgets the values in a %s game_control handler asleep through a take and rez, and keeps them in a copy put in the world', async language => {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner.resident' })
  const source = language === 'lsl'
    ? `list log; ${read}
      default {
        state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_GAME_CONTROL); }
        game_control(key id, integer b, list a) { log += "ev " + (string)b; if (b == 1) { llSleep(20); log += "woke " + fns(); } }
      }`
    : `log = {}
      local function fns() local k = ll.GetOwner(); return tostring(ll.GetGameControlMode(k)) .. "/" .. tostring(ll.GetGameControlModeButtons(k)) .. "/" .. tostring(#ll.GetGameControlModeAxes(k)) end
      ll.RequestPermissions(ll.GetOwner(), 1048576)
      LLEvents:on("game_control", function(id, b, a) table.insert(log, "ev " .. tostring(b)); if b == 1 then ll.Sleep(20); table.insert(log, "woke " .. fns()) end end)`
  const made = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'main', source: { source }, ...(language === 'slua' ? { language } : {}) }] }] })
  made.scripts.main!.start()
  made.linkset.advanceTime(0)
  made.scripts.main!.grantPermissions()
  made.scripts.main!.sendGameControl(OWNER, { buttons: 1 })
  made.linkset.advanceTime(2_000)
  const saved = made.linkset.copy()
  const twin = saved.copy({ world, region: 'home' })
  made.linkset.remove()
  seedRlvInventory(avatar, { sharedRootId: null, entries: [{ id: 'item', kind: 'item', parentId: null, name: 'probe', object: saved, assetType: 'object' }] })
  const object = world.attemptAvatarRez(avatar, 'item', { x: 1, y: 2, z: 3 }).object!
  object.advanceTime(30_000)
  const logOf = (l: Linkset) => { const log = l.allScripts()[0]!.global('log'); return Array.isArray(log) ? log : Object.values(log as object) }
  expect(logOf(object)).toEqual(['ev 1', 'woke -1/0/0'])
  expect(logOf(twin)).toEqual(['ev 1', 'woke 0/1/5'])
})

// In-world: a worn script got button 0 in its default state, then changed to a state with no
// game_control handler and was sent button 2 for 4 s -> there it read 0/0 (the release before the
// change) before, during and after the hold. Back in default it still read 0/0, and no event came
// for the input sent while it was in the other state.
it('keeps the old values in a state with no game_control handler, and drops the input sent there', async () => {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: OWNER, username: 'owner.resident' })
  const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'main', source: { source: `list log; ${read}
    default {
      state_entry() { llListen(5, "", "", ""); llRequestPermissions(llGetOwner(), PERMISSION_GAME_CONTROL); }
      listen(integer c, string n, key id, string m) { if (m == "two") state two; log += m + " " + fns(); }
      game_control(key id, integer b, list a) { log += "ev " + (string)b + " " + fns(); }
    }
    state two {
      state_entry() { llListen(5, "", "", ""); }
      listen(integer c, string n, key id, string m) { if (m == "back") state default; log += m + " " + fns(); }
    }` } }] }] })
  linkset.attachToAvatar(OWNER, 5)
  const s = scripts.main!
  s.start()
  linkset.advanceTime(0)
  const say = (m: string) => { world.clock.schedule(s, world.clock.now, 'listen', { channel: 5, name: 'owner', id: OWNER, msg: m }); linkset.advanceTime(0) }
  s.sendGameControl(OWNER, { buttons: 1 })
  s.sendGameControl(OWNER, {})
  say('two')
  s.sendGameControl(OWNER, { buttons: 4 })
  say('held')
  s.sendGameControl(OWNER, {})
  say('back')
  say('after')
  expect(s.global('log')).toEqual(['ev 1 0/1/5', 'ev 0 0/0/5', 'held 0/0/5', 'after 0/0/5'])
})

// In-world: a worn script asleep 15 s in a listen handler was sent button 3 for 0.6 s, detached
// itself 0.5 s later and was worn again 4 s after that -> it woke reading -1/0/[], the attach
// event read the same, and no game_control ran for the input.
it('drops the input that waited for a script asleep in another handler through a detach', async () => {
  const f = await worn()
  f.say('nap')
  f.linkset.advanceTime(1_500)
  f.gc.sendGameControl(OWNER, { buttons: 8 })
  f.linkset.advanceTime(600)
  f.gc.sendGameControl(OWNER, {})
  f.linkset.advanceTime(500)
  detachAndWear(f.linkset, 4_000)
  f.linkset.advanceTime(20_000)
  expect(f.log()).toEqual(['nap -1/0/0', 'woke -1/0/0', 'attach -1/0/0'])
})
