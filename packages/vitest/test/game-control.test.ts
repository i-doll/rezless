import { expect, it } from 'vitest'
import { loadLinkset, loadScript, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Game_control
// https://wiki.secondlife.com/wiki/llGetGameControlMode
// https://wiki.secondlife.com/wiki/llGetGameControlModeAxes
// https://wiki.secondlife.com/wiki/llGetGameControlModeButtons
// Measurements below: Aditi, SLua Tideland, 2026-11-23, a region whose features say
// GameControlEnabled, with a viewer sending controller input as GameControlData.

// In-world: probe.lsl and types.lsl -> mode -1, buttons 0, empty axes;
// mode/buttons have TYPE_INTEGER. Same results with permissions 0 and 1048576.
// Aditi, Morris, 2026-11-01, server 2026-10-21.39669442371.
// In-world: these functions compiled in SLua Tideland too on 2026-11-23.
it.each(['11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'bad', '22222222-2222-2222-2222-222222222222', 'object'])('returns unavailable snapshot defaults outside an event for %s', async key => {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: '11111111-1111-1111-1111-111111111111', name: 'Owner', username: 'owner.resident' })
  const { scripts } = await loadLinkset({ world, region: 'home', prims: [{ scripts: [{ name: 'test', source: { source: `
    integer mode; integer buttons; list axes; list types;
    default { state_entry() {
      mode = llGetGameControlMode(${key === 'object' ? 'llGetKey()' : '"'+key+'"'});
      buttons = llGetGameControlModeButtons(${key === 'object' ? 'llGetKey()' : '"'+key+'"'});
      axes = llGetGameControlModeAxes(${key === 'object' ? 'llGetKey()' : '"'+key+'"'});
      types = [llGetListEntryType([mode],0), llGetListEntryType([buttons],0)];
    } }
  ` } }] }] })
  scripts.test!.start()
  expect(scripts.test!.global('mode')).toBe(-1)
  expect(scripts.test!.global('buttons')).toBe(0)
  expect(scripts.test!.global('axes')).toEqual([])
  expect(scripts.test!.global('types')).toEqual([1, 1])
})

const OWNER = 'abcdefab-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const probe = (extra = '') => `
  list events; integer mode = -9; integer buttons; list semantic; list types; integer perms;
  out() { key k = llGetOwner(); perms = llGetPermissions(); mode = llGetGameControlMode(k); buttons = llGetGameControlModeButtons(k); semantic = llGetGameControlModeAxes(k); }
  default {
    state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_GAME_CONTROL); }
    game_control(key id, integer b, list a) {
      out();
      integer i; types = []; for (i = 0; i < llGetListLength(a); ++i) types += llGetListEntryType(a, i);
      events += [(string)id + "|" + (string)b + "|" + llList2CSV(a)];
    }
    touch_start(integer n) { out(); }
    ${extra}
  }`

async function fixture(extra = '') {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner.resident' })
  const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [
    { name: 'test', source: { source: probe(extra) } },
    { name: 'nop', source: { source: `integer count; integer mode = -9;
      default { game_control(key id, integer b, list a) { ++count; } touch_start(integer n) { mode = llGetGameControlMode(llGetOwner()); } }` } },
  ] }] })
  const script = scripts.test!
  script.start()
  scripts.nop!.start()
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(0)
  script.grantPermissions()
  const events = () => script.global('events') as string[]
  const out = () => {
    script.fire('touch_start', { num_detected: 1 })
    return [script.global('mode'), script.global('buttons'), script.global('semantic')]
  }
  return { world, avatar, linkset, script, nop: scripts.nop!, events, out }
}

// In-world: worn probe holding PERMISSION_GAME_CONTROL (granted without a dialog), the viewer
// sending button 0 with axes 0.5 and -0.25 for 3 s, resending it about 30 times a second ->
// two events, 3044 ms apart: 1|0.500015, -0.250000, 0, 0, 0, 0 then 0|0, 0, 0, 0, 0, 0, all
// floats, id the owner. Buttons 0 and 3 with axes 1, -1 and 0.75 on axis 5 -> 9|1.000000,
// -0.999969, 0, 0, 0, 0.749992.
it('raises game_control when the input changes, with six canonical float axes', async () => {
  const { script, events } = await fixture()
  script.sendGameControl(OWNER.toUpperCase(), { buttons: 1, axes: [0.5, -0.25] })
  script.sendGameControl(OWNER, { buttons: 1, axes: [0.5, -0.25] })
  script.sendGameControl(OWNER, { buttons: 1, axes: [0.5, -0.25] })
  script.sendGameControl(OWNER)
  script.sendGameControl(OWNER, { buttons: 9, axes: [1, -1, 0, 0, 0, 0.75] })
  expect(events()).toEqual([
    `${OWNER}|1|0.500015, -0.250000, 0.000000, 0.000000, 0.000000, 0.000000`,
    `${OWNER}|0|0.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000`,
    `${OWNER}|9|1.000000, -0.999969, 0.000000, 0.000000, 0.000000, 0.749992`,
  ])
  expect(script.global('types')).toEqual([2, 2, 2, 2, 2, 2])
})

// In-world: the same input (buttons 0 and 3; axes 1, -1, 0.75 on 5) sent in each action mode with
// mode buttons 2 and 31 and mode axes 0.25, -0.5 and -1 on 4 -> inside the event the mode read
// 0..4, the mode buttons -2147483644 and the mode axes 0.250008, -0.500000, 0, 0, -0.999969, padded
// to 5 axes (avatar, mouselook, captive), 7 (flycam) or 6 (cursor, where axis 4 read -1.000000).
// The event's own arguments kept the canonical buttons and axes.
it.each([
  [0, [0.250008, -0.5, 0, 0, -0.999969]],
  [1, [0.250008, -0.5, 0, 0, -0.999969]],
  [2, [0.250008, -0.5, 0, 0, -0.999969, 0, 0]],
  [3, [0.250008, -0.5, 0, 0, -0.999969]],
  [4, [0.250008, -0.5, 0, 0, -1, 0]],
] as const)('reads action mode %s and its own buttons and axes', async (mode, axes) => {
  const { script, events } = await fixture()
  script.sendGameControl(OWNER, { mode, buttons: 9, axes: [1, -1, 0, 0, 0, 0.75], modeButtons: 0x80000004, modeAxes: [0.25, -0.5, 0, 0, -1] })
  expect(script.global('mode')).toBe(mode)
  expect(script.global('buttons')).toBe(-2147483644)
  expect((script.global('semantic') as number[]).map(v => +v.toFixed(6))).toEqual(axes)
  expect(events()).toEqual([`${OWNER}|9|1.000000, -0.999969, 0.000000, 0.000000, 0.000000, 0.749992`])
})

// In-world: cursor mode axes 0.5, -0.5, 16384, -16384, 0.5, -0.5 (the last four sent as the raw
// values 16384, -16384, 16384, -16384) -> 0.500015, -0.500000, 16384.000000, -16384.000000,
// 0.500015, -0.500015. Flycam mode axes 5 and 6 at -0.5 and 1 -> -0.500000, 1.000000. Without
// mode buttons the viewer sent its canonical buttons there, which the mode buttons read.
it('reads cursor pixels as sent and scales the normalized cursor axes evenly', async () => {
  const { script } = await fixture()
  script.sendGameControl(OWNER, { mode: 4, modeAxes: [0.5, -0.5, 16384, -16384, 0.5, -0.5] })
  expect(script.global('semantic')).toEqual([Math.fround(16384 / 32767), -0.5, 16384, -16384, Math.fround(16384 / 32767), Math.fround(-16384 / 32767)])
  script.sendGameControl(OWNER, { mode: 2, buttons: 16, modeAxes: [0, 0, 0, 0, 0, -0.5, 1] })
  expect(script.global('semantic')).toEqual([0, 0, 0, 0, 0, -0.5, 1])
  expect(script.global('buttons')).toBe(16)
})

// In-world: mode axis 2 alone, then mode button 12 alone in avatar mode, then the same in
// mouselook mode, each held 0.5 s with no canonical input -> six events, each with button_levels
// 0 and zero axes, reading m0 0.500015 on axis 2, m0 4096, m1 4096 and the releases between.
it('raises game_control for a change in the mode values alone', async () => {
  const { script, events } = await fixture()
  script.sendGameControl(OWNER, { modeAxes: [0, 0, 0.5] })
  script.sendGameControl(OWNER, { modeButtons: 4096 })
  script.sendGameControl(OWNER, { mode: 1, modeButtons: 4096 })
  expect(events()).toHaveLength(3)
  expect(script.global('mode')).toBe(1)
  expect(script.global('buttons')).toBe(4096)
})

it('refuses an action mode the viewer does not send', async () => {
  const { script } = await fixture()
  expect(() => script.sendGameControl(OWNER, { mode: 5 })).toThrow(RangeError)
})

// In-world: a second script in the worn probe with no permission got no event. After the probe
// released its permission with llRequestPermissions(owner, 0) a 0.6 s hold raised nothing; asked
// again, the permission came back at once and events came again.
it('raises game_control only in scripts holding the permission from that avatar', async () => {
  const { script, nop, events, linkset } = await fixture(`
    listen(integer c, string n, key id, string m) { llRequestPermissions(llGetOwner(), (integer)m); }`)
  script.sendGameControl(OWNER, { buttons: 1 })
  expect(nop.global('count')).toBe(0)
  script.fire('listen', { channel: 0, name: 'x', id: OWNER, msg: '0' })
  script.sendGameControl(OWNER, { buttons: 2 })
  script.sendGameControl(OTHER, { buttons: 2 })
  expect(events()).toHaveLength(1)
  script.fire('listen', { channel: 0, name: 'x', id: OWNER, msg: String(1 << 20) })
  linkset.advanceTime(0)
  script.sendGameControl(OWNER, { buttons: 4 })
  expect(events()).toHaveLength(2)
})

// In-world: the probe script was stopped, a 0.6 s hold sent, then the script started again ->
// no event came, then or later.
it('loses input that arrives while the script is stopped', async () => {
  const { script, events, linkset } = await fixture()
  script.running = false
  script.sendGameControl(OWNER, { buttons: 4 })
  script.sendGameControl(OWNER)
  script.running = true
  linkset.advanceTime(3000)
  expect(events()).toEqual([])
})

// In-world: outside game_control the worn probe read the mode values of its last event: mode 2 and
// seven zero axes after a flycam release, mode 0 and buttons 2 while a hold was on. With the
// permission released, input in cursor mode left it reading mode 3 from its last event while a
// seat holding the permission read 4. In one seat a script holding the permission read 2/0/7 axes
// after a flycam release and a second script with none read -1; NULL_KEY, the object's key and
// another key read -1 and the owner's key in upper case read 2. The first script read the same
// after a state change and after a reset, which dropped its permission.
it('keeps the last event values per script, through a state change and a reset', async () => {
  const { script, nop, out } = await fixture(`
    listen(integer c, string n, key id, string m) { if (m == "two") state two; llRequestPermissions(llGetOwner(), 0); }
    } state two { state_entry() { buttons = 7; mode = llGetGameControlMode(llToUpper((string)llGetOwner())); }`)
  script.sendGameControl(OWNER, { mode: 2, buttons: 8 })
  script.sendGameControl(OWNER, { mode: 2 })
  expect(out()).toEqual([2, 0, [0, 0, 0, 0, 0, 0, 0]])
  nop.fire('touch_start', { num_detected: 1 })
  expect(nop.global('mode')).toBe(-1)
  script.fire('listen', { channel: 0, name: 'x', id: OWNER, msg: '' })
  script.sendGameControl(OWNER, { mode: 4, buttons: 32 })
  expect(out()).toEqual([2, 0, [0, 0, 0, 0, 0, 0, 0]])
  script.reset()
  expect(out()).toEqual([2, 0, [0, 0, 0, 0, 0, 0, 0]])
  script.fire('listen', { channel: 0, name: 'x', id: OWNER, msg: 'two' })
  expect([script.global('mode'), script.global('buttons')]).toEqual([2, 7])
})

// In-world: worn probe and a seat both holding the permission, the owner sitting -> each got the
// same events (the viewer sent captive mode). After the owner stood up, the seat still held
// 1048576 and got the next events, in avatar mode.
it('reaches a seat and an attachment alike, and a seat after its sitter stands', async () => {
  const { world, avatar, script, events } = await fixture()
  const seat = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'seat', source: { source: probe(`
    changed(integer c) { if (llAvatarOnSitTarget()) llRequestPermissions(llAvatarOnSitTarget(), PERMISSION_GAME_CONTROL); }`).replace(
    'state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_GAME_CONTROL); }', 'state_entry() { llSitTarget(<0, 0, 0.6>, ZERO_ROTATION); }') } }] }] })
  const sitter = seat.scripts.seat!
  sitter.start()
  expect(world.sitAvatar(avatar, seat.linkset.prims[0]!)).toBe(true)
  seat.linkset.advanceTime(0)
  script.sendGameControl(OWNER, { mode: 3, buttons: 64, axes: [0, 0, 0.5] })
  expect(sitter.global('events')).toEqual(events())
  expect(events()).toHaveLength(1)
  world.standAvatar(avatar)
  seat.linkset.advanceTime(0)
  sitter.sendGameControl(OWNER, { buttons: 128 })
  expect(sitter.global('events')).toHaveLength(2)
  expect(sitter.global('mode')).toBe(0)
})

// In-world: the worn probe detached itself, input was sent, and the object was worn again ->
// nothing arrived for the input sent while it was off; it still held 1048608, read -1 until its
// next event, and got the next events.
it('keeps the permission through a detach and forgets the last event values', async () => {
  const { linkset, script, events, out } = await fixture()
  script.sendGameControl(OWNER, { buttons: 1 })
  linkset.detachFromAvatar()
  script.sendGameControl(OWNER, { buttons: 256 })
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(0)
  expect(out()).toEqual([-1, 0, []])
  expect(script.global('perms')).toBe(1 << 20)
  script.sendGameControl(OWNER, { buttons: 512 })
  expect(events().map(e => e.split('|')[1])).toEqual(['1', '512'])
})

it('works in a standalone script and keeps its values through a hand-fired event', async () => {
  const script = await loadScript({ source: probe(), owner: OWNER })
  script.start()
  script.grantPermissions()
  script.sendGameControl(OWNER, { mode: 1, buttons: 512 })
  expect(script.global('mode')).toBe(1)
  script.fire('game_control', { id: OWNER, button_levels: 4, axes: [0, 0] })
  expect(script.global('mode')).toBe(1)
})

it('raises nothing for an avatar at rest, and reads no negative zero or non-finite axis', async () => {
  const { script, events } = await fixture()
  script.sendGameControl(OWNER, { axes: [0, -0], modeAxes: [-0] })
  expect(events()).toEqual([])
  script.sendGameControl(OWNER, { mode: 4, axes: [-0.00001, 1], modeAxes: [-0.00001, 0, -0.4] })
  expect(events()).toEqual([`${OWNER}|0|0.000000, 1.000000, 0.000000, 0.000000, 0.000000, 0.000000`])
  expect((script.global('semantic') as number[]).map(v => Object.is(v, -0))).not.toContain(true)
  expect(() => script.sendGameControl(OWNER, { axes: [NaN] })).toThrow(RangeError)
  expect(() => script.sendGameControl(OWNER, { modeAxes: [Infinity] })).toThrow(RangeError)
})
