import { expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Game_control
// https://wiki.secondlife.com/wiki/llRequestPermissions
// Every "In-world" note below was measured on Aditi, SLua Tideland, 2026-11-23, a region whose
// features say GameControlEnabled, with two avatars: i doll owned every probe object and fivebot
// sent controller state as GameControlData. The probe script asked a sitter for
// PERMISSION_GAME_CONTROL from its changed handler, or any avatar on a chat command, and logged
// each event with the three mode functions for the event's key and for the owner's.
const OWNER = 'aaaaaaaa-1111-4111-8111-111111111111'
const SITTER = 'bbbbbbbb-2222-4222-8222-222222222222'

const probe = `list log; integer sleepy;
  string fns(key k) { return (string)llGetGameControlMode(k) + "/" + (string)llGetGameControlModeButtons(k); }
  default {
    state_entry() { llSitTarget(<0, 0, 0.6>, ZERO_ROTATION); llListen(5, "", "", ""); }
    changed(integer c) {
      key sitter = llAvatarOnSitTarget();
      if (sitter) llRequestPermissions(sitter, PERMISSION_GAME_CONTROL);
      log += "changed " + (string)(sitter != NULL_KEY);
    }
    run_time_permissions(integer p) { log += "rtp " + (string)p; }
    touch_start(integer n) { log += "touch"; }
    listen(integer c, string n, key id, string m) {
      if (m == "sleep") sleepy = 1;
      else llRequestPermissions((key)m, PERMISSION_GAME_CONTROL);
    }
    game_control(key id, integer b, list a) {
      log += "ev " + llGetSubString((string)id, 0, 7) + " " + (string)b + " " + fns(id) + " owner " + fns(llGetOwner());
      if (sleepy) { sleepy = 0; llSleep(20); }
    }
  }`

async function seat() {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: OWNER, username: 'owner.resident' })
  const sitter = world.addAvatar({ region: 'home', key: SITTER, username: 'sitter.resident' })
  const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'seat', source: { source: probe } }] }] })
  const script = scripts.seat!
  script.start()
  const log = () => script.global('log') as string[]
  const say = (m: string) => world.clock.schedule(script, world.clock.now, 'listen', { channel: 5, name: 'owner', id: OWNER, msg: m })
  return { world, sitter, linkset, script, log, say }
}

// In-world: fivebot sat on i doll's seat -> PERMISSION_GAME_CONTROL came at once, with no dialog.
// fivebot's first state, all zero in captive mode -> an event reading mode 3; fivebot's buttons 0
// and 3 -> an event for 9 reading 3/9 for fivebot and -1/0 for the owner. i doll's own input ->
// nothing. fivebot stood up -> the seat kept 1048576 and got fivebot's next press and release,
// in avatar mode.
it('gets a sitter’s input, not the owner’s, and reads it for the sitter only', async () => {
  const f = await seat()
  expect(f.world.sitAvatar(f.sitter, f.linkset.prims[0]!)).toBe(true)
  f.linkset.advanceTime(0)
  f.script.sendGameControl(SITTER, { mode: 3 })
  f.script.sendGameControl(SITTER, { mode: 3, buttons: 9 })
  f.script.sendGameControl(OWNER, { buttons: 2 })
  f.script.sendGameControl(OWNER, {})
  f.world.standAvatar(f.sitter)
  f.linkset.advanceTime(0)
  f.script.sendGameControl(SITTER, { buttons: 4 })
  expect(f.log()).toEqual([
    'changed 1', `rtp ${1 << 20}`,
    'ev bbbbbbbb 0 3/0 owner -1/0',
    'ev bbbbbbbb 9 3/9 owner -1/0',
    'changed 0',
    'ev bbbbbbbb 4 0/4 owner -1/0',
  ])
})

// In-world: the seat slept 20 s in fivebot's game_control. A touch by i doll and fivebot's
// release came in while it slept, the release first or the touch first -> after the wake,
// touch_start and then the game_control, both times. The same with fivebot standing up in place
// of the touch -> changed and then the game_control, both times.
type Seat = Awaited<ReturnType<typeof seat>>
it.each([
  ['a touch', (f: Seat) => f.world.clock.schedule(f.script, f.world.clock.now, 'touch_start', { num_detected: 1, detected: [{ key: OWNER, name: 'owner' }] }), 'touch'],
  ['a stand', (f: Seat) => f.world.standAvatar(f.sitter), 'changed 0'],
])('runs a game_control that waited in a sleep behind %s, whichever came first', async (_, other, line) => {
  for (const first of ['input', 'other']) {
    const f = await seat()
    f.world.sitAvatar(f.sitter, f.linkset.prims[0]!)
    f.say('sleep')
    f.linkset.advanceTime(0)
    f.script.sendGameControl(SITTER, { mode: 3, buttons: 1 })
    f.linkset.advanceTime(1_000)
    const steps = [() => f.script.sendGameControl(SITTER, { mode: 3 }), () => other(f)]
    for (const step of first === 'input' ? steps : steps.reverse()) {
      step()
      f.linkset.advanceTime(1_000)
    }
    f.linkset.advanceTime(30_000)
    expect(f.log().slice(3)).toEqual([line, 'ev bbbbbbbb 0 3/0 owner -1/0'])
  }
})

// In-world: an unworn prim of i doll's, and one i doll wore, each asked fivebot (standing next to
// it) for PERMISSION_GAME_CONTROL -> fivebot's viewer got a permission question for each, with no
// script error, and no run_time_permissions came while it went unanswered. The measuring viewer
// does not know the game control permission and drops the question, so what an answer does was
// not measured. The same prim asking fivebot for PERMISSION_TRIGGER_ANIMATION showed a dialog.
it.each([['an unworn object', false], ['an attachment', true]])('waits for an answer when %s asks an avatar who is not on it', async (_, worn) => {
  const f = await seat()
  if (worn) {
    f.linkset.attachToAvatar(OWNER, 5)
    f.linkset.advanceTime(0)
  }
  f.say(SITTER)
  f.linkset.advanceTime(5_000)
  expect(f.log().filter(line => line.startsWith('rtp'))).toEqual([])
  expect(f.script.state.permissions.waiting).toBe(true)
  expect(f.script.state.permissions.granted).toBe(0)
})
