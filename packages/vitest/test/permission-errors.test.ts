import { describe, it, expect } from 'vitest'
import { loadLinkset, World, PERMISSION_TRIGGER_ANIMATION } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlTakeControls, LlSetCameraParams, LlClearCameraParams,
// LlGetCameraPos, LlGetCameraRot, LlGetCameraFOV and LlGetCameraAspect.
//
// Every "In-world" note below was measured on the Aditi beta grid, SLua Tideland, 2026-11-23, with
// a probe prim that made each call 6 s apart and a second prim that relayed everything it heard on
// DEBUG_CHANNEL. The owner's chat was read from the viewer. The probe ran with no permissions,
// standing and then seated on it, and again seated with only PERMISSION_TRIGGER_ANIMATION, so with
// a permission key. Then another avatar sat on it and was asked for PERMISSION_TRIGGER_ANIMATION.
// The listener prim heard none of the permission errors, but heard the probe's own llSay on
// DEBUG_CHANNEL and its "Cannot use llRegionSay() on channel 0." error: these go to the owner only.

const OWNER = '00000000-0000-0000-0000-00000000000a'
const OTHER = '00000000-0000-0000-0000-00000000000b'
const DEBUG_CHANNEL = 2147483647
const TAKE = 'Script trying to take controls from owner but PERMISSION_TAKE_CONTROLS permission not set!'
const SET = 'Script trying to set camera parameters but PERMISSION_CONTROL_CAMERA permission not set!'
const CLEAR = 'Script trying to clear camera parameters but PERMISSION_CONTROL_CAMERA permission not set!'
const read = (what: string) => `Script trying to get camera ${what} but PERMISSION_TRACK_CAMERA permission not set!`

const probe = `
  string call;
  list got;
  key from;
  default {
    state_entry() { llSitTarget(<0, 0, 0.6>, ZERO_ROTATION); }
    touch_start(integer n) {
      if (call == "ask") llRequestPermissions(from, ${PERMISSION_TRIGGER_ANIMATION});
      else if (call == "take") llTakeControls(CONTROL_FWD, TRUE, FALSE);
      else if (call == "release") llReleaseControls();
      else if (call == "set") llSetCameraParams([CAMERA_ACTIVE, TRUE]);
      else if (call == "clear") llClearCameraParams();
      else if (call == "reads") got = [llGetCameraPos(), llGetCameraRot(), llGetCameraFOV(), llGetCameraAspect()];
    }
  }
`
const listener = `
  list heard;
  default {
    state_entry() { llListen(DEBUG_CHANNEL, "", NULL_KEY, ""); }
    listen(integer c, string n, key id, string m) { heard += m; }
  }
`

async function scene() {
  const world = new World({ autoGrantPermissions: 'none' })
  world.addRegion('home', { x: 0, y: 0 })
  const owner = world.addAvatar({ region: 'home', key: OWNER, username: 'owner', position: { x: 10, y: 10, z: 10 } })
  const other = world.addAvatar({ region: 'home', key: OTHER, username: 'other', position: { x: 12, y: 10, z: 10 } })
  const made = await loadLinkset({ world, region: 'home', owner: OWNER, position: { x: 11, y: 10, z: 10 },
    prims: [{ scripts: [{ name: 'probe', source: { source: probe } }] }] })
  const heard = await loadLinkset({ world, region: 'home', owner: OWNER, position: { x: 11, y: 11, z: 10 },
    prims: [{ scripts: [{ name: 'listener', source: { source: listener } }] }] })
  const s = made.scripts['probe']!
  s.start()
  heard.scripts['listener']!.start()
  const call = (name: string) => {
    s.setGlobal('call', name)
    s.fire('touch_start', { num_detected: 1 })
    made.linkset.advanceTime(6)
  }
  const ask = (avatar: string) => {
    s.setGlobal('from', avatar)
    call('ask')
    s.grantPermissions()
  }
  const errors = () => s.chat.filter(c => c.channel === DEBUG_CHANNEL).map(c => c.to ? [c.text, c.to] : c.text)
  return { world, owner, other, s, call, ask, errors, heard: () => heard.scripts['listener']!.global('heard') }
}

describe('permission errors without a permission key', () => {
  // In-world: standing and seated alike, with llGetPermissions() 0 and no permission key.
  it('go to the owner for each llTakeControls, llSetCameraParams and llClearCameraParams', async () => {
    const f = await scene()
    for (const name of ['take', 'take', 'release', 'set', 'set', 'clear']) f.call(name)
    expect(f.errors()).toEqual([TAKE, TAKE, SET, SET, CLEAR])
    expect(f.heard()).toEqual([])
  })

  it('are not given for camera reads, which return zero', async () => {
    const f = await scene()
    f.call('reads')
    expect(f.s.global('got')).toEqual([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, s: 1 }, 0, 0])
    expect(f.errors()).toEqual([])
  })
})

describe('permission errors with a permission key', () => {
  // In-world: seated, the owner granted PERMISSION_TRIGGER_ANIMATION alone. Each llTakeControls
  // gave the owner its error twice; llClearCameraParams said nothing.
  it('give llTakeControls to the owner and to the permission avatar', async () => {
    const f = await scene()
    f.world.sitAvatar(f.owner, f.s.linkset.prims[0]!)
    f.ask(OWNER)
    for (const name of ['take', 'take', 'release', 'set', 'clear']) f.call(name)
    expect(f.errors()).toEqual([TAKE, [TAKE, OWNER], TAKE, [TAKE, OWNER], SET])
    expect(f.heard()).toEqual([])
  })

  // In-world: the same calls read <0,0,0>, <0,0,0,1>, 0.0 and 0.0, each with an error.
  it('are given for camera reads too', async () => {
    const f = await scene()
    f.ask(OWNER)
    f.call('reads')
    expect(f.s.global('got')).toEqual([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, s: 1 }, 0, 0])
    expect(f.errors()).toEqual([read('position'), read('rotation'), read('FOV'), read('aspect')])
    expect(f.heard()).toEqual([])
  })

  // In-world: another avatar sat on the owner's probe and granted PERMISSION_TRIGGER_ANIMATION.
  // The owner got each llTakeControls error once, and so did the other avatar, still naming the
  // owner. The llSetCameraParams and llGetCameraPos errors reached the owner only.
  it('send the llTakeControls error to another avatar holding the key', async () => {
    const f = await scene()
    f.world.sitAvatar(f.other, f.s.linkset.prims[0]!)
    f.ask(OTHER)
    for (const name of ['take', 'set', 'reads']) f.call(name)
    expect(f.errors()).toEqual([TAKE, [TAKE, OTHER], SET, read('position'), read('rotation'), read('FOV'), read('aspect')])
    expect(f.heard()).toEqual([])
  })

  // In-world: ten llTakeControls 0.3 s apart with the other avatar holding the key. The owner and
  // the other avatar each got nine errors, all with the error's own text, and nothing for the tenth.
  it('count once per call towards the flood cap', async () => {
    const f = await scene()
    f.world.sitAvatar(f.other, f.s.linkset.prims[0]!)
    f.ask(OTHER)
    f.s.setGlobal('call', 'take')
    for (let i = 0; i < 10; ++i) {
      f.s.fire('touch_start', { num_detected: 1 })
      f.s.linkset.advanceTime(0.3)
    }
    const errors = f.errors()
    expect(errors.filter(e => e === TAKE)).toHaveLength(9)
    expect(errors.filter(e => Array.isArray(e) && e[1] === OTHER)).toHaveLength(9)
    expect(errors).toHaveLength(18)
  })
})
