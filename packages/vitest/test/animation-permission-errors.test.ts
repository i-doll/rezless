import { describe, it, expect } from 'vitest'
import { loadLinkset, World, PERMISSION_TAKE_CONTROLS, PERMISSION_TRIGGER_ANIMATION } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlStartAnimation, LlStopAnimation, LlSetAnimationOverride,
// LlResetAnimationOverride and LlGetAnimationOverride.
//
// Every "In-world" note below was measured on the Aditi beta grid, SLua Tideland, 2026-11-23,
// with a probe prim owned by the avatar that made each call 6 s apart, timed with llGetTime,
// and a second prim that relayed everything it heard on DEBUG_CHANNEL. The owner's chat was
// read from the viewer. The listener heard the rez errors of a third prim, and none of these.
// A second run put the probe script in the child prim of a two-prim object, and another avatar
// sat on it and granted PERMISSION_TAKE_CONTROLS; that avatar's chat was read from its viewer too.

const OWNER = '00000000-0000-0000-0000-00000000000a'
const OTHER = '00000000-0000-0000-0000-00000000000b'
const DEBUG_CHANNEL = 2147483647
const START = 'Script trying to trigger animations but PERMISSION_TRIGGER_ANIMATION permission not set'
const STOP = 'Script trying to stop animations but PERMISSION_TRIGGER_ANIMATION permission not set'

const probe = `
  string call;
  string got;
  float took;
  default {
    state_entry() { llSitTarget(<0, 0, 0.5>, ZERO_ROTATION); }
    touch_start(integer n) {
      llResetTime();
      if (call == "ask") llRequestPermissions(llGetOwner(), ${PERMISSION_TAKE_CONTROLS | PERMISSION_TRIGGER_ANIMATION});
      else if (call == "ask sitter") llRequestPermissions(llAvatarOnSitTarget(), ${PERMISSION_TAKE_CONTROLS});
      else if (call == "release take") { llReleaseControls(); llTakeControls(CONTROL_FWD, TRUE, FALSE); }
      else if (call == "start") llStartAnimation("dance1");
      else if (call == "stop") llStopAnimation("dance1");
      else if (call == "start missing") llStartAnimation("nosuchanim");
      else if (call == "stop missing") llStopAnimation("nosuchanim");
      else if (call == "set") llSetAnimationOverride("Standing", "dance1");
      else if (call == "reset") llResetAnimationOverride("ALL");
      else if (call == "get") got = llGetAnimationOverride("Standing");
      else if (call == "say") llSay(DEBUG_CHANNEL, "heard");
      took = llGetTime();
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

async function scene(child = false) {
  const world = new World({ autoGrantPermissions: 'none' })
  world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: OWNER, username: 'owner', position: { x: 115, y: 50, z: 1997.5 } })
  const other = world.addAvatar({ region: 'home', key: OTHER, username: 'other', position: { x: 117, y: 50, z: 1997.5 } })
  const scripts = [{ name: 'probe', source: { source: probe } }]
  const made = await loadLinkset({ world, region: 'home', owner: OWNER, position: { x: 116, y: 50, z: 1997.5 },
    prims: child ? [{ name: 'root' }, { position: { x: 0.6, y: 0, z: 0 }, scripts }] : [{ scripts }] })
  const heard = await loadLinkset({ world, region: 'home', owner: OWNER, position: { x: 116, y: 51, z: 1997.5 },
    prims: [{ scripts: [{ name: 'listener', source: { source: listener } }] }] })
  const s = made.scripts['probe']!
  s.start()
  heard.scripts['listener']!.start()
  const call = (name: string) => {
    s.setGlobal('call', name)
    made.linkset.touch(child ? 2 : 0, OWNER)
    made.linkset.advanceTime(6000)
  }
  const errors = () => s.chat.filter(c => c.channel === DEBUG_CHANNEL).map(c => [c.text, c.to])
  return { world, other, made, s, call, errors, heard: () => heard.scripts['listener']!.global('heard') }
}

describe('animation calls without PERMISSION_TRIGGER_ANIMATION', () => {
  // In-world: with no permissions, llStartAnimation and llStopAnimation of "dance1" and of a
  // missing animation each told the owner once, took no time, and the listener heard nothing.
  it('tell the owner alone, before looking the animation up', async () => {
    const { s, call, errors, heard } = await scene()
    for (const name of ['start', 'stop', 'start missing', 'stop missing']) {
      call(name)
      expect(s.global('took')).toBe(0)
    }
    expect(errors()).toEqual([[START, undefined], [STOP, undefined], [START, undefined], [STOP, undefined]])
    expect(heard()).toEqual([])
    call('say')
    expect(heard()).toEqual(['heard'])
  })

  // In-world: after the owner granted PERMISSION_TAKE_CONTROLS (llGetPermissionsKey the owner,
  // llGetPermissions 4), each call still told the owner once. llTakeControls tells a permission
  // avatar a second time; these calls don't.
  it('tell the owner once when the owner holds the permission key', async () => {
    const { s, call, errors, heard } = await scene()
    call('ask')
    s.grantPermissions(PERMISSION_TAKE_CONTROLS)
    call('start')
    call('stop')
    expect(errors()).toEqual([[START, undefined], [STOP, undefined]])
    expect(heard()).toEqual([])
  })

  // In-world: in the child prim, each message ended with
  // " {RootName probe issue-578 root, RootPosition { 116, 50, 1997.5 }}".
  it('name the root and its position when said by a child prim', async () => {
    const { call, errors } = await scene(true)
    call('start')
    call('stop')
    const suffix = ' {RootName root, RootPosition { 116, 50, 1997.5 }}'
    expect(errors()).toEqual([[START + suffix, undefined], [STOP + suffix, undefined]])
  })

  // In-world: another avatar sat on the child prim and granted PERMISSION_TAKE_CONTROLS. After
  // llReleaseControls, llTakeControls told that avatar too, but each animation message reached
  // the owner alone, once.
  it('do not tell another avatar holding the permission key', async () => {
    const { world, other, made, s, call, errors } = await scene(true)
    world.sitAvatar(other, made.linkset.prims[1]!)
    call('ask sitter')
    s.grantPermissions(PERMISSION_TAKE_CONTROLS)
    call('release take')
    call('start')
    call('stop')
    expect(errors().filter(([, to]) => to === OTHER)).toHaveLength(1)
    expect(errors().slice(-2).map(([text, to]) => [text.slice(0, 30), to])).toEqual([[START.slice(0, 30), undefined], [STOP.slice(0, 30), undefined]])
  })

  it('stays quiet once the permission is granted', async () => {
    const { s, call, errors } = await scene()
    call('ask')
    s.grantPermissions(PERMISSION_TRIGGER_ANIMATION)
    call('start')
    call('stop')
    expect(errors()).toEqual([])
  })
})

describe('animation override calls without PERMISSION_OVERRIDE_ANIMATIONS', () => {
  // In-world: holding only PERMISSION_TAKE_CONTROLS, each override call told the owner once, took
  // no time, llGetAnimationOverride returned "", and the listener heard nothing.
  it('tell the owner alone', async () => {
    const { s, call, errors, heard } = await scene()
    call('ask')
    s.grantPermissions(PERMISSION_TAKE_CONTROLS)
    for (const name of ['set', 'reset', 'get']) {
      call(name)
      expect(s.global('took')).toBe(0)
    }
    expect(s.global('got')).toBe('')
    expect(errors()).toEqual([
      ['llSetAnimationOverride error: PERMISSION_OVERRIDE_ANIMATIONS permission not set', undefined],
      ['llResetAnimationOverride error: PERMISSION_OVERRIDE_ANIMATIONS permission not set', undefined],
      ['llGetAnimationOverride error: neither PERMISSION_OVERRIDE_ANIMATIONS or PERMISSION_TRIGGER_ANIMATION permissions are set', undefined],
    ])
    expect(heard()).toEqual([])
  })
})
