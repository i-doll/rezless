import { describe, it, expect } from 'vitest'
import { loadScript, PERMISSION_TRIGGER_ANIMATION, PERMISSION_OVERRIDE_ANIMATIONS, InventoryType, makeInventoryItem, World, Linkset, Prim } from '../src/index.js'

// In-world: animation.lsl, edges.lsl, builtins.lsl and resolution.lsl through the
// viewer lease as i Doll, Aditi, SLua Tideland, 2026-10-31. See each case below.
const AGENT = '00000000-0000-0000-0000-00000000000a'
const ALL = PERMISSION_TRIGGER_ANIMATION | PERMISSION_OVERRIDE_ANIMATIONS

async function load(body: string, permission: number | null = ALL) {
  const s = await loadScript({ owner: AGENT, source: `
    list got;
    default {
      state_entry() { llRequestPermissions(llGetOwner(), ${ALL}); }
      touch_start(integer n) { ${body} }
    }
  ` })
  s.start()
  if (permission !== null) s.grantPermissions(permission)
  return s
}

describe('avatar animations', () => {
  // https://wiki.secondlife.com/wiki/LlGetAnimationOverride
  it('reads the built-in default with either animation permission', async () => {
    for (const permission of [PERMISSION_TRIGGER_ANIMATION, PERMISSION_OVERRIDE_ANIMATIONS]) {
      const s = await load('got = [llGetAnimationOverride("Standing"), llGetAnimationOverride("Walking")];', permission)
      s.linkset.touch(0)
      expect(s.global('got')).toEqual(['stand', 'walk'])
    }
  })

  // https://wiki.secondlife.com/wiki/LlSetAnimationOverride
  // https://wiki.secondlife.com/wiki/LlResetAnimationOverride
  it('sets a built-in override and resets it to the default', async () => {
    const s = await load(`
      llSetAnimationOverride("Standing", "sit");
      got += [llGetAnimationOverride("Standing")];
      llResetAnimationOverride("Standing");
      got += [llGetAnimationOverride("Standing")];
    `)
    s.linkset.touch(0)
    expect(s.global('got')).toEqual(['sit', 'stand'])
  })
})

// https://wiki.secondlife.com/wiki/LlStartAnimation
// https://wiki.secondlife.com/wiki/LlStopAnimation
// https://wiki.secondlife.com/wiki/LlGetAnimationList
const SIT = '1a5fe8ac-a804-8a5d-7cbd-56bd83184568'
const WALK = '6ed24bd8-91aa-4b12-ccc7-c97c857ab4e0'

describe('playing animations', () => {
  it('starts once and stops by UUID without changing locomotion state', async () => {
    const s = await load(`
      llStartAnimation("sit"); llStartAnimation("sit");
      got = llGetAnimationList(llGetOwner());
      got += [llGetAnimation(llGetOwner())];
      llStopAnimation("${SIT}");
    `)
    s.setAnimationState(AGENT, 'Standing')
    s.linkset.touch(0)
    expect(s.global('got')).toEqual([SIT, '2408fe9e-df1d-1d7d-f4ff-1384fa7b350f', 'Standing'])
    expect(s.getPlayingAnimations(AGENT)).not.toContain(SIT)
  })

  it('does not expose prims or unknown avatars as animated agents', async () => {
    const s = await load(`got = [llGetAnimation(llGetKey()), llGetAnimation(NULL_KEY), llGetListLength(llGetAnimationList(llGetKey()))];`, null)
    s.linkset.touch(0)
    expect(s.global('got')).toEqual(['', '', 0])
  })

  it('reports locomotion and its animation set by the test without permissions', async () => {
    const s = await load('got = [llGetAnimation(llGetOwner())] + llGetAnimationList(llGetOwner());', null)
    s.setAnimationState(AGENT, 'Walking')
    s.linkset.touch(0)
    expect(s.global('got')).toEqual(['Walking', WALK])
  })

  it('needs trigger permission even when override permission is held', async () => {
    const s = await load('llStartAnimation("sit");', PERMISSION_OVERRIDE_ANIMATIONS)
    s.linkset.touch(0)
    expect(s.getPlayingAnimations(AGENT)).not.toContain(SIT)
  })
})

// https://wiki.secondlife.com/wiki/LlGetAnimationOverride
// https://wiki.secondlife.com/wiki/LlResetAnimationOverride
// Overriding locomotion must not change what llGetAnimation reports.
describe('animation overrides', () => {
  it('resets one override without changing another', async () => {
    const s = await load(`
      llSetAnimationOverride("Standing", "walk");
      llSetAnimationOverride("Walking", "sit");
      llResetAnimationOverride("Standing");
      got = [llGetAnimationOverride("Standing"), llGetAnimationOverride("Walking")];
      llResetAnimationOverride("ALL");
      got += [llGetAnimationOverride("Walking")];
    `)
    s.linkset.touch(0)
    expect(s.global('got')).toEqual(['stand', 'sit', 'walk'])
  })

  it('requires override permission to write even with trigger permission', async () => {
    const s = await load(`
      llSetAnimationOverride("Standing", "sit");
      got = [llGetAnimationOverride("Standing")];
    `, PERMISSION_TRIGGER_ANIMATION)
    s.linkset.touch(0)
    expect(s.global('got')).toEqual(['stand'])
  })

  it('keeps a non-default override through denied permissions and reset', async () => {
    const s = await load(`
      llSetAnimationOverride("Standing", "sit");
      llRequestPermissions(llGetOwner(), ${ALL});
    `)
    s.linkset.touch(0)
    s.denyPermissions()
    s.reset()
    s.grantPermissions(PERMISSION_TRIGGER_ANIMATION)
    // Use an event observer rather than a private state view after reset.
    const observer = await loadScript({ host: s.host, owner: AGENT, source: `
      string got;
      default {
        state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_TRIGGER_ANIMATION); }
        run_time_permissions(integer p) { got = llGetAnimationOverride("Standing"); }
      }
    ` })
    observer.start()
    observer.grantPermissions()
    expect(observer.global('got')).toBe('sit')
  })
})

const CUSTOM = 'f5a2df72-fd88-e350-c970-ba5e33b7eec0'
const errors = (s: Awaited<ReturnType<typeof load>>) => s.chat.filter(c => c.channel === 2147483647).map(c => c.text)

function addAnimation(s: Awaited<ReturnType<typeof load>>, name = 'probeanim', key = CUSTOM) {
  s.host.addInventory(makeInventoryItem({ name, type: InventoryType.ANIMATION, key }))
}

describe('animation name resolution', () => {
  // In-world: resolution.lsl: inventory sit shadows the built-in, and the
  // inventory animation probeanim starts, stops and overrides by name.
  it('uses the host prim inventory before built-ins', async () => {
    const s = await load(`
      llStartAnimation("sit"); got = llGetAnimationList(llGetOwner());
      llStopAnimation("sit");
    `)
    addAnimation(s, 'sit')
    s.linkset.touch(0)
    expect(s.global('got')).toContain(CUSTOM)
    expect(s.global('got')).not.toContain(SIT)
    expect(s.getPlayingAnimations(AGENT)).not.toContain(CUSTOM)
  })

  // In-world: animation.lsl and edges.lsl: SIT accepted and returned as sit;
  // resolution.lsl: PROBEANIM rejected when only probeanim is in inventory.
  it('ignores case for built-ins but respects inventory case', async () => {
    const s = await load(`
      llStartAnimation("SIT");
      llStartAnimation("PROBEANIM");
      llSetAnimationOverride("Standing", "SIT");
      got = [llGetAnimationOverride("Standing")];
    `)
    addAnimation(s)
    s.linkset.touch(0)
    expect(s.global('got')).toEqual(['sit'])
    expect(s.getPlayingAnimations(AGENT)).toContain(SIT)
    expect(s.getPlayingAnimations(AGENT)).not.toContain(CUSTOM)
    expect(errors(s)).toEqual(["Could not find animation 'PROBEANIM'"])
  })

  // In-world: edges.lsl: missing, empty and notecard names rejected; stop
  // adds a full stop to the error that start and set report without one.
  it.each(['', 'missing', 'wrongtype'])('rejects %j without affecting existing playback or override', async name => {
    const s = await load(`
      llStartAnimation("sit");
      llSetAnimationOverride("Standing", "walk");
      llStartAnimation("${name}"); llStopAnimation("${name}");
      llSetAnimationOverride("Standing", "${name}");
      got = [llGetAnimationOverride("Standing")];
    `)
    s.host.addInventory(makeInventoryItem({ name: 'wrongtype', type: InventoryType.NOTECARD }))
    s.linkset.touch(0)
    expect(s.global('got')).toEqual(['walk'])
    expect(s.getPlayingAnimations(AGENT)).toContain(SIT)
    expect(errors(s)).toEqual([
      `Could not find animation '${name}'`,
      `Could not find animation '${name}'.`,
      `Could not find animation '${name}'`,
    ])
  })

  // In-world: animation.lsl: starting or overriding with the sit UUID fails;
  // stopping that UUID succeeds.
  it('accepts UUIDs only for stopping', async () => {
    const s = await load(`
      llSetAnimationOverride("Standing", "walk");
      llStartAnimation("${SIT}");
      llSetAnimationOverride("Standing", "${SIT}");
      llStopAnimation((string)NULL_KEY);
      got = [llGetAnimationOverride("Standing")];
    `)
    s.linkset.touch(0)
    expect(s.global('got')).toEqual(['walk'])
    expect(s.getPlayingAnimations(AGENT)).not.toContain(SIT)
    expect(errors(s)).toEqual([
      `Could not find animation '${SIT}'`,
      `Could not find animation '${SIT}'`,
    ])
  })

  // In-world: builtins.lsl: 139 viewer names tried; these four were rejected.
  it.each(['female_run_new', 'female_walk_new', 'run_new', 'walk_new'])('rejects unsupported viewer animation %s', async name => {
    const s = await load(`llStartAnimation("${name}");`)
    s.linkset.touch(0)
    expect(errors(s)).toEqual([`Could not find animation '${name}'`])
  })
})

describe('animation permission gates', () => {
  // In-world: animation.lsl stages 1-5: no-permission calls returned empty
  // values or did nothing, with no error on either DEBUG_CHANNEL listener.
  it('silently rejects calls without permissions before checking their arguments', async () => {
    const s = await load(`
      llStartAnimation("missing"); llStopAnimation("missing");
      llSetAnimationOverride("bad state", "missing");
      llResetAnimationOverride("bad state");
      got = [llGetAnimationOverride("bad state")];
    `, null)
    s.linkset.touch(0)
    expect(s.global('got')).toEqual([''])
    expect(s.getPlayingAnimations(AGENT)).toEqual([])
    expect(errors(s)).toEqual([])
  })

  // In-world: resolution.lsl: Standing was set to walk; after a new grant
  // of trigger only, reset ALL left it at walk and produced no debug error.
  it('does not reset an existing override after losing override permission', async () => {
    const s = await load(`
      if (llGetPermissions() & PERMISSION_OVERRIDE_ANIMATIONS) {
        llSetAnimationOverride("Standing", "walk");
        llStartAnimation("sit");
        llRequestPermissions(llGetOwner(), ${ALL});
      } else {
        llResetAnimationOverride("ALL");
        got = [llGetAnimationOverride("Standing")];
      }
    `)
    s.linkset.touch(0)
    s.grantPermissions(PERMISSION_TRIGGER_ANIMATION)
    s.linkset.touch(0)
    expect(s.global('got')).toEqual(['walk'])
    expect(s.getPlayingAnimations(AGENT)).toContain(SIT)
    expect(errors(s)).toEqual([])
  })

  it('cannot stop an animation with only override permission', async () => {
    const s = await load(`
      if (llGetPermissions() & PERMISSION_TRIGGER_ANIMATION) {
        llStartAnimation("sit"); llRequestPermissions(llGetOwner(), ${ALL});
      } else llStopAnimation("sit");
    `)
    s.linkset.touch(0)
    s.grantPermissions(PERMISSION_OVERRIDE_ANIMATIONS)
    s.linkset.touch(0)
    expect(s.getPlayingAnimations(AGENT)).toContain(SIT)
    expect(errors(s)).toEqual([])
  })
})

describe('override reads and invalid states', () => {
  // In-world: animation.lsl and edges.lsl: state names are case sensitive,
  // invalid reads return "", invalid writes preserve a non-default override.
  it.each(['standing', 'all', 'not a state', ''])('rejects unknown state %j', async state => {
    const s = await load(`
      llSetAnimationOverride("Standing", "walk");
      llSetAnimationOverride("${state}", "sit");
      llResetAnimationOverride("${state}");
      got = [llGetAnimationOverride("${state}"), llGetAnimationOverride("Standing")];
    `)
    s.linkset.touch(0)
    expect(s.global('got')).toEqual(['', 'walk'])
    expect(errors(s)).toEqual(Array(3).fill(`Unknown animation state '${state}'`))
  })

  // In-world: edges.lsl + observer.lsl: the same custom override reads
  // probeanim inside its prim, and "" in another prim without that asset.
  it('resolves an override name in the querying prim inventory', async () => {
    const s = await load(`
      llSetAnimationOverride("Standing", "probeanim");
      got = [llGetAnimationOverride("Standing"), llGetAnimation(llGetOwner())];
    `)
    addAnimation(s)
    s.linkset.touch(0)
    expect(s.global('got')).toEqual(['probeanim', 'Standing'])
    expect(s.getPlayingAnimations(AGENT)).toContain(CUSTOM)
    const other = new Prim()
    s.linkset.addPrim(other)
    const observer = await loadScript({ host: other, source: `
      string got;
      default {
        state_entry() { llRequestPermissions((key)"${AGENT}", PERMISSION_TRIGGER_ANIMATION); }
        run_time_permissions(integer p) { got = llGetAnimationOverride("Standing"); }
      }
    ` })
    observer.start()
    observer.grantPermissions()
    expect(observer.global('got')).toBe('')
    addAnimation(observer, 'local-name')
    observer.fire('run_time_permissions', { perm: PERMISSION_TRIGGER_ANIMATION })
    expect(observer.global('got')).toBe('local-name')
  })
})

// In-world: defaults.lsl queried every wiki state after a permission grant.
// animation.lsl separately confirmed Standing -> stand after reset ALL.
it.each([
  ['Crouching', 'crouch'], ['CrouchWalking', 'crouchwalk'], ['Falling Down', 'falldown'],
  ['Flying', 'fly'], ['FlyingSlow', 'flyslow'], ['Hovering', 'hover'],
  ['Hovering Down', 'hover_down'], ['Hovering Up', 'hover_up'], ['Jumping', 'jump'],
  ['Landing', 'land'], ['PreJumping', 'prejump'], ['Running', 'run'], ['Sitting', 'sit'],
  ['Sitting on Ground', 'sit_ground_constrained'], ['Standing', 'stand'], ['Standing Up', 'standup'],
  ['Striding', 'stride'], ['Soft Landing', 'soft_land'], ['Taking Off', 'hover_up'],
  ['Turning Left', 'turnleft'], ['Turning Right', 'turnright'], ['Walking', 'walk'],
])('reports the default for %s', async (state, animation) => {
  const s = await load(`got = [llGetAnimationOverride("${state}")];`)
  s.linkset.touch(0)
  expect(s.global('got')).toEqual([animation])
})

// https://wiki.secondlife.com/wiki/LlGetAnimationList
// In-world: edges.lsl reported llGetListEntryType(..., 0) = 4, TYPE_KEY,
// and resolution.lsl reported keys sorted by UUID rather than start order.
it('returns UUID-sorted keys with LSL key types', async () => {
  const s = await load(`
    llStartAnimation("walk"); llStartAnimation("sit");
    got = llGetAnimationList(llGetOwner());
    got += [llGetListEntryType(got, 0), llGetListEntryType(got, 1)];
  `)
  s.setAnimationState(AGENT, 'Standing')
  s.linkset.touch(0)
  expect(s.global('got')).toEqual([SIT, '2408fe9e-df1d-1d7d-f4ff-1384fa7b350f', WALK, 4, 4])
})

it('targets the permission granter instead of the owner', async () => {
  const other = '00000000-0000-0000-0000-00000000000b'
  const s = await loadScript({ owner: AGENT, source: `
    default {
      state_entry() { llRequestPermissions((key)"${other}", PERMISSION_TRIGGER_ANIMATION); }
      run_time_permissions(integer p) { llStartAnimation("sit"); }
    }
  ` })
  s.setAnimationState(AGENT, 'Standing')
  s.setAnimationState(other, 'Standing')
  s.start()
  s.grantPermissions()
  expect(s.getPlayingAnimations(other)).toContain(SIT)
  expect(s.getPlayingAnimations(AGENT)).not.toContain(SIT)
})

it('applies an override when the test changes locomotion without dropping unrelated playback', async () => {
  const s = await load(`llStartAnimation("sit"); llSetAnimationOverride("Walking", "probeanim");`)
  addAnimation(s)
  s.setAnimationState(AGENT, 'Standing')
  s.linkset.touch(0)
  const before = s.getPlayingAnimations(AGENT)
  s.setAnimationState(AGENT, 'Walking')
  expect(s.getPlayingAnimations(AGENT)).toEqual([SIT, CUSTOM])
  expect(before).toEqual([SIT, '2408fe9e-df1d-1d7d-f4ff-1384fa7b350f'])
})

it('rejects an invalid locomotion state without changing playback', async () => {
  const s = await load('', null)
  s.setAnimationState(AGENT, 'Walking')
  expect(() => s.setAnimationState(AGENT, 'walking' as 'Walking')).toThrow("Unknown animation state 'walking'")
  expect(s.getPlayingAnimations(AGENT)).toEqual([WALK])
})

it('shares playback between linksets in one region without leaking to other regions or test worlds', async () => {
  const world = new World()
  world.addRegion('Home', { x: 0, y: 0 })
  world.addRegion('Away', { x: 256, y: 0 })
  const scripts = []
  for (const region of ['Home', 'Home', 'Away']) {
    const linkset = new Linkset({ world, region })
    const host = linkset.addPrim(new Prim())
    const s = await loadScript({ host, source: `
      list got;
      default { touch_start(integer n) { got = [llGetAnimation((key)"${AGENT}")] + llGetAnimationList((key)"${AGENT}"); } }
    ` })
    s.start()
    scripts.push(s)
  }
  scripts[0]!.setAnimationState(AGENT, 'Walking')
  scripts[1]!.linkset.touch(0)
  scripts[2]!.linkset.touch(0)
  expect(scripts[1]!.global('got')).toEqual(['Walking', WALK])
  expect(scripts[2]!.global('got')).toEqual([''])
  const isolated = await load('got = [llGetAnimation(llGetOwner())] + llGetAnimationList(llGetOwner());', null)
  isolated.linkset.touch(0)
  expect(isolated.global('got')).toEqual([''])
})

// https://wiki.secondlife.com/wiki/LlStartAnimation documents a 30-animation limit.
// In-world: capacity.lsl started forty looped built-ins, and llGetAnimationList
// returned 34 UUIDs immediately and 32 after three seconds (Aditi, SLua Tideland,
// 2026-10-31). Do not clamp the simulator list to thirty.
it('allows more than thirty animation UUIDs to be reported', async () => {
  const s = await load(`
    integer i;
    for (i = 0; i < 31; ++i) llStartAnimation("asset" + (string)i);
    got = [llGetListLength(llGetAnimationList(llGetOwner()))];
  `)
  for (let i = 0; i < 31; ++i) {
    addAnimation(s, `asset${i}`, `00000000-0000-0000-0000-${(i + 100).toString().padStart(12, '0')}`)
  }
  s.linkset.touch(0)
  expect(s.global('got')).toEqual([32])
})

// In-world: review-collision-repeat.lsl -> stand present while Standing after
// llStartAnimation("stand"), absent after walking (Aditi, SLua Tideland, 2026-10-31).
it('removes the old locomotion UUID even when explicitly started', async () => {
  const stand = '2408fe9e-df1d-1d7d-f4ff-1384fa7b350f'
  const s = await load('llStartAnimation("stand");')
  s.setAnimationState(AGENT, 'Standing')
  s.linkset.touch(0)
  expect(s.getPlayingAnimations(AGENT)).toEqual([stand])
  s.setAnimationState(AGENT, 'Walking')
  expect(s.getPlayingAnimations(AGENT)).toEqual([WALK])
})

// In-world: review-collision-repeat.lsl -> explicitly started sit disappeared
// when Standing's sit override was replaced with walk or reset to stand
// (Aditi, SLua Tideland, 2026-10-31).
it.each([
  ['llSetAnimationOverride("Standing", "walk");', WALK],
  ['llResetAnimationOverride("Standing");', '2408fe9e-df1d-1d7d-f4ff-1384fa7b350f'],
])('removes a colliding explicit animation on %s', async (change, expected) => {
  const s = await load(`
    llSetAnimationOverride("Standing", "sit");
    llStartAnimation("sit");
    got = llGetAnimationList(llGetOwner());
    ${change}
  `)
  s.setAnimationState(AGENT, 'Standing')
  s.linkset.touch(0)
  expect(s.global('got')).toEqual([SIT])
  expect(s.getPlayingAnimations(AGENT)).toEqual([expected])
})

// In-world: review-uuid-confirmed.lsl -> stopping inventory name equal to the
// sit UUID removed uploaded loop d0802c92-eb48-129c-768c-6b71f285b7bc, while
// built-in sit kept playing (Aditi, SLua Tideland, 2026-10-31).
it('resolves UUID-shaped inventory animation names before raw stop UUIDs', async () => {
  const s = await load(`
    llStartAnimation("sit");
    llStartAnimation("${SIT}");
    got = llGetAnimationList(llGetOwner());
    llStopAnimation("${SIT}");
  `)
  addAnimation(s, SIT)
  s.linkset.touch(0)
  expect(s.global('got')).toContain(CUSTOM)
  expect(s.global('got')).toContain(SIT)
  expect(s.getPlayingAnimations(AGENT)).toContain(SIT)
  expect(s.getPlayingAnimations(AGENT)).not.toContain(CUSTOM)
  expect(errors(s)).toEqual([])
})
