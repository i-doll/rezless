import { describe, it, expect } from 'vitest'
import { loadLinkset, World, PERMISSION_TAKE_CONTROLS } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlTakeControls, LlSetCameraParams, LlClearCameraParams,
// LlGetCameraPos, LlGetCameraRot, LlGetCameraFOV, LlGetCameraAspect, LlNavigateTo,
// LlExecCharacterCmd and LlWanderWithin.
//
// An error only the owner sees, said by a child prim, ends with the root's name and position.
//
// Every "In-world" note below without another source was measured on the Aditi beta grid,
// SLua Tideland, 2026-11-23: the probe script sat in the child prim of a two-prim object owned
// by the avatar, made each call 6 s apart, and the owner's chat was read from the viewer.

const OWNER = '00000000-0000-0000-0000-00000000000a'
const OTHER = '00000000-0000-0000-0000-00000000000b'
const DEBUG_CHANNEL = 2147483647
const ROOT = 'probe issue-587 root'
const SUFFIX = ` {RootName ${ROOT}, RootPosition { 116, 50, 1997.5 }}`
const FLOOD = 'Too many errors... dropping further messages until the flood stops'
const TAKE = 'Script trying to take controls from owner but PERMISSION_TAKE_CONTROLS permission not set!'

const probe = `
  string call;
  default {
    state_entry() { llSitTarget(<0, 0, 0.5>, ZERO_ROTATION); }
    touch_start(integer n) {
      if (call == "ask") llRequestPermissions(llGetOwner(), ${PERMISSION_TAKE_CONTROLS});
      else if (call == "ask sitter") llRequestPermissions(llAvatarOnSitTarget(), ${PERMISSION_TAKE_CONTROLS});
      else if (call == "take") llTakeControls(CONTROL_FWD, TRUE, FALSE);
      else if (call == "release take") { llReleaseControls(); llTakeControls(CONTROL_FWD, TRUE, FALSE); }
      else if (call == "set") llSetCameraParams([CAMERA_ACTIVE, 1]);
      else if (call == "clear") llClearCameraParams();
      else if (call == "pos") llGetCameraPos();
      else if (call == "rot") llGetCameraRot();
      else if (call == "fov") llGetCameraFOV();
      else if (call == "aspect") llGetCameraAspect();
      else if (call == "navigate") llNavigateTo(llGetPos() + <1, 0, 0>, []);
      else if (call == "exec") llExecCharacterCmd(CHARACTER_CMD_STOP, []);
      else if (call == "wander") llWanderWithin(llGetPos(), <2, 2, 1>, []);
    }
  }
`

async function scene(child = true) {
  const world = new World({ autoGrantPermissions: 'none' })
  world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: OWNER, username: 'owner', position: { x: 115, y: 50, z: 1997.5 } })
  const other = world.addAvatar({ region: 'home', key: OTHER, username: 'other', position: { x: 117, y: 50, z: 1997.5 } })
  const scripts = [{ name: 'probe', source: { source: probe } }]
  const made = await loadLinkset({ world, region: 'home', owner: OWNER, position: { x: 116, y: 50, z: 1997.5 },
    prims: child ? [{ name: ROOT }, { position: { x: 0.6, y: 0, z: 0 }, scripts }] : [{ name: ROOT, scripts }] })
  const s = made.scripts['probe']!
  s.start()
  const call = (name: string) => {
    s.setGlobal('call', name)
    made.linkset.touch(child ? 2 : 0, OWNER)
    made.linkset.advanceTime(6000)
  }
  const errors = () => s.chat.filter(c => c.channel === DEBUG_CHANNEL).map(c => [c.text, c.to])
  return { world, other, made, s, call, errors }
}

describe('llTakeControls without permission, from a child prim', () => {
  // In-world (#584's probe, Aditi, SLua Tideland, 2026-11-23): llTakeControls in the child prim of
  // a two-prim object, after another avatar sat on it and granted PERMISSION_TAKE_CONTROLS and
  // llReleaseControls dropped it, told the owner and the sitter, and both copies ended with
  // " {RootName <root>, RootPosition { 116, 50, 1997.5 }}".
  it('ends the owner\'s and the key holder\'s copies with the root suffix', async () => {
    const { world, other, made, s, call, errors } = await scene()
    world.sitAvatar(other, made.linkset.prims[1]!)
    call('ask sitter')
    s.grantPermissions(PERMISSION_TAKE_CONTROLS)
    call('release take')
    expect(errors()).toEqual([[TAKE + SUFFIX, undefined], [TAKE + SUFFIX, OTHER]])
  })

  // In-world: with no permission key the owner's copy ended with the suffix too.
  it('ends the owner\'s copy with the root suffix when nobody holds the key', async () => {
    const { call, errors } = await scene()
    call('take')
    expect(errors()).toEqual([[TAKE + SUFFIX, undefined]])
  })

  // In-world: with the owner holding the key, llReleaseControls then llTakeControls told the owner
  // twice, and both copies ended with the suffix.
  it('ends both of the owner\'s copies with the root suffix when the owner holds the key', async () => {
    const { s, call, errors } = await scene()
    call('ask')
    s.grantPermissions(PERMISSION_TAKE_CONTROLS)
    call('release take')
    expect(errors()).toEqual([[TAKE + SUFFIX, undefined], [TAKE + SUFFIX, OWNER]])
  })

  it('has no suffix in the root prim', async () => {
    const { call, errors } = await scene(false)
    call('take')
    expect(errors()).toEqual([[TAKE, undefined]])
  })
})

const SET = 'Script trying to set camera parameters but PERMISSION_CONTROL_CAMERA permission not set!'
const CLEAR = 'Script trying to clear camera parameters but PERMISSION_CONTROL_CAMERA permission not set!'
const READ = (what: string) => `Script trying to get camera ${what} but PERMISSION_TRACK_CAMERA permission not set!`

describe('camera errors from a child prim', () => {
  // In-world: in the child prim with no permission key, llClearCameraParams and
  // llSetCameraParams each told the owner, ending with the root suffix; llGetCameraPos returned
  // ZERO_VECTOR and said nothing.
  it('end with the root suffix with no permission key', async () => {
    const { call, errors } = await scene()
    call('clear')
    call('set')
    call('pos')
    expect(errors()).toEqual([[CLEAR + SUFFIX, undefined], [SET + SUFFIX, undefined]])
  })

  // In-world: after the owner granted only PERMISSION_TAKE_CONTROLS, llSetCameraParams and the
  // four camera reads each told the owner, ending with the root suffix; llClearCameraParams said
  // nothing.
  it('end with the root suffix while the owner holds the key', async () => {
    const { s, call, errors } = await scene()
    call('ask')
    s.grantPermissions(PERMISSION_TAKE_CONTROLS)
    for (const c of ['set', 'pos', 'rot', 'fov', 'aspect', 'clear']) call(c)
    expect(errors()).toEqual([
      [SET + SUFFIX, undefined],
      [READ('position') + SUFFIX, undefined],
      [READ('rotation') + SUFFIX, undefined],
      [READ('FOV') + SUFFIX, undefined],
      [READ('aspect') + SUFFIX, undefined],
    ])
  })
})

describe('pathfinding errors from a child prim', () => {
  // In-world: llNavigateTo, llExecCharacterCmd and llWanderWithin in the child prim with no
  // character each told the owner "You must call llCreateCharacter before <name>.", said by
  // the root prim, under its name and key, with no suffix.
  it('are said by the root, without the suffix', async () => {
    const { made, s, call } = await scene()
    call('navigate')
    call('exec')
    call('wander')
    const root = made.linkset.prims[0]!.key
    expect(s.chat.filter(c => c.channel === DEBUG_CHANNEL).map(c => [c.text, c.from])).toEqual([
      ['You must call llCreateCharacter before llNavigateTo.', root],
      ['You must call llCreateCharacter before llExecPathingCmd.', root],
      ['You must call llCreateCharacter before llWanderWithin.', root],
    ])
  })
})

describe('pathfinding errors from a child prim count for the root', () => {
  const child = `
    integer step;
    default {
      touch_start(integer n) { step = 0; llSetTimerEvent(6.0); }
      timer() {
        if (step == 0) llEvade(llGetOwner(), []);
        else if (step == 1) llFleeFrom(llGetPos(), 5.0, []);
        else if (step == 2) llPatrolPoints([llGetPos(), llGetPos() + <1, 0, 0>], []);
        else if (step == 3) llPursue(llGetOwner(), []);
        else if (step == 7) {
          integer i;
          for (i = 0; i < 8; ++i) llNavigateTo(llGetPos() + <1, 0, 0>, []);
          llMessageLinked(LINK_ROOT, 0, "rez", "");
        }
        else if (step > 7) llSetTimerEvent(0);
        ++step;
      }
    }
  `
  const root = `
    default {
      link_message(integer s, integer n, string m, key id) {
        llRezObject("nosuch", llGetPos(), ZERO_VECTOR, ZERO_ROTATION, 0);
        llRezObject("nosuch", llGetPos(), ZERO_VECTOR, ZERO_ROTATION, 0);
      }
      touch_start(integer n) { llRezObject("nosuch", llGetPos(), ZERO_VECTOR, ZERO_ROTATION, 0); }
    }
  `

  // In-world: llEvade, llFleeFrom, llPatrolPoints and llPursue from the child prim, 6 s apart, were
  // each said by the root with no suffix. 24 s later the child made eight llNavigateTo calls at
  // once, all said by the root, and then the root's script tried to rez a missing item twice:
  // neither "Could not find object" nor the flood notice came. 40 s later a single missing-item
  // rez from the root said "Could not find object 'nosuch issue-587'.".
  it('so a burst of them stops the root\'s own errors', async () => {
    const world = new World({ autoGrantPermissions: 'none' })
    world.addRegion('home', { x: 0, y: 0 })
    world.addAvatar({ region: 'home', key: OWNER, username: 'owner', position: { x: 115, y: 50, z: 1997.5 } })
    const made = await loadLinkset({ world, region: 'home', owner: OWNER, position: { x: 116, y: 50, z: 1997.5 },
      prims: [{ name: ROOT, scripts: [{ name: 'root', source: { source: root } }] },
        { position: { x: 0.6, y: 0, z: 0 }, scripts: [{ name: 'child', source: { source: child } }] }] })
    const c = made.scripts['child']!
    const r = made.scripts['root']!
    c.start()
    r.start()
    made.linkset.touch(2, OWNER)
    made.linkset.advanceTime(60_000)
    const said = () => [...c.chat, ...r.chat].filter(l => l.channel === DEBUG_CHANNEL).map(l => l.text)
    // In-world the flood notice did not come either; where it comes depends on when the region's
    // 16 s periods start, which the model doesn't know.
    expect(said().filter(t => t !== FLOOD)).toEqual([
      'You must call llCreateCharacter before llEvade.',
      'You must call llCreateCharacter before llFleeFrom.',
      'You must call llCreateCharacter before llPatrolPoints.',
      'You must call llCreateCharacter before llPursue.',
      ...Array(8).fill('You must call llCreateCharacter before llNavigateTo.'),
    ])
    expect(made.linkset.prims[0]!.key).toBe(c.chat.find(l => l.text.includes('llEvade'))?.from)
    made.linkset.advanceTime(40_000)
    made.linkset.touch(1, OWNER)
    made.linkset.advanceTime(2_000)
    expect(said().at(-1)).toBe("Could not find object 'nosuch'.")
  })
})
