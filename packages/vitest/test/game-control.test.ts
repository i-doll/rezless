import { expect, it } from 'vitest'
import { loadLinkset, loadScript, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/llGetGameControlMode
// https://wiki.secondlife.com/wiki/llGetGameControlModeAxes
// https://wiki.secondlife.com/wiki/llGetGameControlModeButtons
// In-world: probe.lsl and types.lsl -> mode -1, buttons 0, empty axes;
// mode/buttons have TYPE_INTEGER. Same results with permissions 0 and 1048576.
// Aditi, Morris, 2026-11-01, server 2026-10-21.39669442371.
// SLua Tideland lacks these functions; probe sources: /tmp/issue-153-gc/.
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
async function fixture(extra = '', tail = '') {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: OWNER, username: 'owner.resident' })
  const { scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'test', source: { source: `
    integer mode = -9; integer buttons; list semantic; list raw; integer rawButtons; integer count; integer otherMode; list types;
    default {
      state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_GAME_CONTROL); }
      game_control(key id, integer button_levels, list axes) {
        ++count; mode = llGetGameControlMode((key)llToUpper((string)id));
        buttons = llGetGameControlModeButtons(id); semantic = llGetGameControlModeAxes(id);
        raw = axes; rawButtons = button_levels; otherMode = llGetGameControlMode("${OTHER}");
        integer i; types=[]; for(i=0;i<llGetListLength(semantic);++i) types += llGetListEntryType(semantic,i);
        ${extra}
      }
      touch_start(integer n) { mode=llGetGameControlMode(llGetOwner()); semantic=llGetGameControlModeAxes(llGetOwner()); buttons=llGetGameControlModeButtons(llGetOwner()); }
    } ${tail}
  ` } }] }] })
  const script = scripts.test!
  script.start()
  return { script, world }
}

// Live semantic input cannot be produced with this Firestorm fork: it has no
// GameControlData sender or MCP input/mode tool. Shapes follow the wiki above.
it.each([
  [0, [0, 0.25, -0.5, 1, -1]],
  [1, [1, 0, 0, 0, 0]],
  [2, [0, 0, 0, 0, 0, -1, 0.5]],
  [3, [0, 0, 0, 0, 0]],
  [4, [-0.5, 0.25, 640, 480, 0.5, 0.75]],
  [99, [1, 2, 3, 4, 5, 6, 7, 8]],
] as const)('reads mode %s with float semantic axes separately from raw input', async (mode, axes) => {
  const { script } = await fixture()
  script.grantPermissions()
  script.setGameControl(OWNER, { mode, axes, buttons: 0x80000201 })
  script.sendGameControl(OWNER, { buttons: 4, axes: [1, 0, -1, 0, 0, 0] })
  expect(script.global('mode')).toBe(mode)
  expect(script.global('buttons')).toBe(-2147483135)
  expect(script.global('semantic')).toEqual(axes)
  expect(script.global('types')).toEqual(axes.map(() => 2))
  expect(script.global('raw')).toEqual([1, 0, -1, 0, 0, 0])
  expect(script.global('rawButtons')).toBe(4)
  expect(script.global('otherMode')).toBe(-1)
  script.fire('touch_start', { num_detected: 1 })
  expect(script.global('mode')).toBe(-1)
  expect(script.global('buttons')).toBe(0)
  expect(script.global('semantic')).toEqual([])
})

it('requires permission from the input avatar before delivering game-control input', async () => {
  const { script } = await fixture()
  script.setGameControl(OWNER, { mode: 0, axes: [0, 0, 0, 0, 0], buttons: 1 })
  script.sendGameControl(OWNER)
  expect(script.global('count')).toBe(0)
  script.grantPermissions(0)
  script.sendGameControl(OWNER)
  expect(script.global('count')).toBe(0)
  script.reset()
  script.grantPermissions()
  script.setGameControl(OTHER, { mode: 2, axes: [0], buttons: 2 })
  script.sendGameControl(OTHER)
  expect(script.global('count')).toBe(0)
  script.sendGameControl(OWNER)
  expect(script.global('count')).toBe(1)
})

it('preserves each queued snapshot across fixture mutation and handler sleep', async () => {
  const { script } = await fixture('llSleep(1); llSay(0,(string)llGetGameControlMode(id)+":"+(string)llGetGameControlModeButtons(id)+":"+llList2CSV(llGetGameControlModeAxes(id)));')
  script.grantPermissions()
  const axes = [0, 0.25, 0, 0, 0]
  script.setGameControl(OWNER, { mode: 0, axes, buttons: 1 })
  axes[1] = 1
  script.sendGameControl(OWNER)
  script.setGameControl(OWNER, { mode: 4, axes: [0, 0, 640, 480, 0.5, 0.5], buttons: 512 })
  script.sendGameControl(OWNER)
  script.setGameControl(OWNER, null)
  script.advanceTime(2000)
  expect(script.chat.map(x => x.text)).toEqual(['0:1:0.000000, 0.250000, 0.000000, 0.000000, 0.000000', '4:512:0.000000, 0.000000, 640.000000, 480.000000, 0.500000, 0.500000'])
  script.sendGameControl(OWNER)
  expect(script.global('mode')).toBe(-1)
  expect(script.global('semantic')).toEqual([])
})

it('clears the active snapshot on state changes and reset', async () => {
  const { script } = await fixture('state next;', `state next {
    state_entry(){mode=llGetGameControlMode(llGetOwner());}
  }`)
  script.grantPermissions()
  script.setGameControl(OWNER, { mode: 3, axes: [0], buttons: 1 })
  script.sendGameControl(OWNER)
  expect(script.global('mode')).toBe(-1)
  script.reset()
  script.sendGameControl(OWNER)
  expect(script.global('count')).toBe(0)
})

it('shares avatar fixtures within a World while keeping other Worlds isolated', async () => {
  const { script, world } = await fixture()
  const source = `integer mode; default {
    state_entry(){llRequestPermissions(llGetOwner(),PERMISSION_GAME_CONTROL);}
    game_control(key id,integer b,list a){mode=llGetGameControlMode(id);}
  }`
  const { scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'peer', source: { source } }] }] })
  const peer = scripts.peer!
  peer.start()
  peer.grantPermissions()
  script.setGameControl(OWNER.toUpperCase(), { mode: 2, axes: [0, 0, 0, 0, 0, 0, 0], buttons: 0 })
  peer.sendGameControl(OWNER)
  expect(peer.global('mode')).toBe(2)
  const other = await fixture()
  other.script.grantPermissions()
  other.script.sendGameControl(OWNER)
  expect(other.script.global('mode')).toBe(-1)
})

it('supports standalone scripts and raw-only events without semantic data', async () => {
  const script = await loadScript({ source: `integer mode; integer buttons; list axes;
    default {state_entry(){llRequestPermissions(llGetOwner(),PERMISSION_GAME_CONTROL);}
    game_control(key id,integer b,list a){mode=llGetGameControlMode(id);buttons=llGetGameControlModeButtons(id);axes=llGetGameControlModeAxes(id);}}
  `, owner: OWNER })
  script.start()
  script.grantPermissions()
  script.setGameControl(OWNER, { mode: 1, buttons: 512, axes: [0, 0, 0, 0, 0] })
  script.sendGameControl(OWNER)
  expect(script.global('mode')).toBe(1)
  script.fire('game_control', { id: OWNER, button_levels: 4, axes: [0, 0] })
  expect(script.global('mode')).toBe(-1)
  expect(script.global('buttons')).toBe(0)
  expect(script.global('axes')).toEqual([])
})
