import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlGetAgentInfo
// https://wiki.secondlife.com/wiki/LlGetAnimation
// https://wiki.secondlife.com/wiki/LlSetCameraParams
// https://wiki.secondlife.com/wiki/LlClearCameraParams
// https://wiki.secondlife.com/wiki/LlResetScript
//
// Every "In-world" note below was measured on Aditi, SLua Tideland, 2026-11-14, with Firestorm
// (RLVa) and one avatar that owned every probe object.
//
// Each probe object held the same script. On a chat command it said llGetPermissions(),
// llGetAgentInfo(owner), llGetAnimation(owner), whether llAvatarOnSitTarget() was set and
// llGetCameraPos() (with PERMISSION_TRACK_CAMERA). From changed(CHANGED_LINK) it said the same at
// once. A "watch" sampled llGetAgentInfo(owner) and llGetAnimation(owner) every 0.05 s for a few
// seconds and said each change with the time since the start. The probes were a seat with
// llSitTarget(<0, 0, 0.6>, ZERO_ROTATION), a prim with no sit target, a rezzed prim that was never
// sat on, and two objects worn on the hands, one of which held PERMISSION_TRACK_CAMERA only to read
// where the avatar's camera was. A probe locked the camera with
// llSetCameraParams([CAMERA_ACTIVE, 1, CAMERA_POSITION, llGetPos() + <0, 0, 20>,
// CAMERA_POSITION_LOCKED, TRUE, CAMERA_FOCUS, llGetPos(), CAMERA_FOCUS_LOCKED, TRUE]).
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NULL_KEY = '00000000-0000-0000-0000-000000000000'
const AGENT_SITTING = 0x10, AGENT_ON_OBJECT = 0x20, AGENT_IN_AIR = 0x100
const MOTION = AGENT_SITTING | AGENT_ON_OBJECT | AGENT_IN_AIR
const TRACK = 1024, CAMERA = 2048
const SIT_GROUND = '@sit:00000000-0000-0000-0000-000000000000=force'

const source = (sitTarget: boolean) => `
  key o; list log;
  default {
    state_entry() { o = llGetOwner(); ${sitTarget ? 'llSitTarget(<0.0, 0.0, 0.6>, ZERO_ROTATION);' : ''} }
    changed(integer c) {
      if (c & CHANGED_LINK) log += ["chg", llGetAgentInfo(o) & ${MOTION}, llGetAnimation(o)];
    }
    link_message(integer s, integer n, string str, key id) {
      if (str == "rd") log += ["rd", llGetAgentInfo(o) & ${MOTION}, llGetAnimation(o)];
      else if (str == "held") log += ["held", llGetPermissions(), llGetPermissionsKey()];
      else if (str == "rlv") llOwnerSay((string)id);
      else if (str == "unsit") llUnSit(o);
      else if (str == "tp") llTeleportAgentGlobalCoords(o, <256.0, 0.0, 0.0>, <30.0, 30.0, 30.0>, ZERO_VECTOR);
      else if (str == "tplocal") llTeleportAgent(o, "", <30.0, 30.0, 30.0>, ZERO_VECTOR);
      else if (str == "die") llDie();
      else if (str == "ask") llRequestPermissions(o, n);
      else if (str == "cam") llSetCameraParams([CAMERA_ACTIVE, TRUE, CAMERA_POSITION, llGetPos() + <0.0, 0.0, 20.0>,
        CAMERA_POSITION_LOCKED, TRUE]);
      else if (str == "clear") llClearCameraParams();
      else if (str == "release") llReleaseCamera(o);
      else if (str == "reset") llResetScript();
      else if (str == "rm") llRemoveInventory(llGetScriptName());
    }
  }`

type Probe = Awaited<ReturnType<typeof probe>>

async function probe(world: World, opts: { sitTarget?: boolean, scripts?: string[], child?: boolean } = {}) {
  const names = opts.scripts ?? ['probe']
  const prims = [{ scripts: names.map(name => ({ name, source: { source: source(!!opts.sitTarget) } })) }]
  if (opts.child) prims.push({ scripts: [{ name: 'child', source: { source: source(false) } }] })
  const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, prims })
  for (const script of Object.values(scripts)) script.start()
  linkset.advanceTime(0)
  const send = (str: string, num = 0, id = '', name = names[0]!) => {
    scripts[name]!.fire('link_message', { sender_num: 1, num, str, id })
    linkset.advanceTime(0)
  }
  const script = scripts[names[0]!]!
  return {
    linkset, scripts, script, send,
    prim: linkset.prims[0]!,
    /** What the probe's last log entry read: the masked llGetAgentInfo bits and llGetAnimation. */
    read: () => { send('rd'); return (script.global('log') as unknown[]).slice(-2) },
    /** llGetPermissions() and llGetPermissionsKey(). */
    held: () => { send('held'); return (script.global('log') as unknown[]).slice(-2) },
    /** Every changed(CHANGED_LINK) the probe heard, as [bits, animation]. */
    changes: () => {
      const log = script.global('log') as unknown[]
      const out: unknown[][] = []
      for (let i = 0; i < log.length; i += 3) if (log[i] === 'chg') out.push([log[i + 1], log[i + 2]])
      return out
    },
  }
}

async function fixture() {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner', viewer: { profile: 'rlva' } })
  const seat = await probe(world, { sitTarget: true })
  const other = await probe(world)
  const watcher = await probe(world)
  const worn = await probe(world)
  worn.linkset.attachToAvatar(OWNER, 5)
  for (const p of [seat, other, watcher, worn]) avatar.viewer.session.bind(p.linkset, avatar)
  const advance = (ms: number) => watcher.linkset.advanceTime(ms)
  const sit = (p: Probe = seat) => { expect(world.userSitAvatar(avatar, p.prim)).toBe(true); advance(0) }
  const stand = () => { expect(world.userStandAvatar(avatar)).toBe(true); advance(0) }
  return { world, avatar, seat, other, watcher, worn, advance, sit, stand }
}

describe('llGetAgentInfo and llGetAnimation as the avatar sits', () => {
  // In-world: standing, every probe read 6 and "Standing". Sitting on the seat, the seat's changed
  // read 54 (AGENT_SITTING and AGENT_ON_OBJECT, no AGENT_IN_AIR) and "Sitting", and the watching
  // probe went from 6 "Standing" to 54 "Sitting" in one step. The same on the prim with no sit target.
  it('reads "Sitting" from the moment the avatar sits on an object', async () => {
    const f = await fixture()
    expect(f.watcher.read()).toEqual([0, 'Standing'])
    f.sit()
    expect(f.seat.changes()).toEqual([[AGENT_SITTING | AGENT_ON_OBJECT, 'Sitting']])
    expect(f.watcher.read()).toEqual([AGENT_SITTING | AGENT_ON_OBJECT, 'Sitting'])
  })

  // In-world: sitting on the seat, a sit request for the prim with no sit target moved the avatar
  // there. Both objects heard changed(CHANGED_LINK) and both read 54 and "Sitting".
  it('reads "Sitting" in both objects when the avatar moves from one seat to another', async () => {
    const f = await fixture()
    f.sit()
    f.sit(f.other)
    expect(f.seat.changes().at(-1)).toEqual([AGENT_SITTING | AGENT_ON_OBJECT, 'Sitting'])
    expect(f.other.changes()).toEqual([[AGENT_SITTING | AGENT_ON_OBJECT, 'Sitting']])
  })

  // In-world: standing, "@sitground=force" took the watching probe from 6 "Standing" to 22
  // (AGENT_SITTING only) "Sitting on Ground". No object heard an event.
  it('reads "Sitting on Ground" after a ground sit', async () => {
    const f = await fixture()
    f.worn.send('rlv', 0, SIT_GROUND)
    f.advance(225)
    expect(f.watcher.read()).toEqual([AGENT_SITTING, 'Sitting on Ground'])
    expect(f.seat.changes()).toEqual([])
  })

  // In-world: on the ground, a sit request for the seat gave one changed in the seat that read 54
  // and "Sitting".
  it('reads "Sitting" when the avatar sits on an object from the ground', async () => {
    const f = await fixture()
    f.worn.send('rlv', 0, SIT_GROUND)
    f.advance(225)
    f.sit()
    expect(f.seat.changes()).toEqual([[AGENT_SITTING | AGENT_ON_OBJECT, 'Sitting']])
  })
})

describe('llGetAnimation of an avatar with no recorded state', () => {
  // In-world: flown up a few metres with the viewer's fly autopilot, the avatar read 263
  // (AGENT_FLYING and AGENT_IN_AIR) and "Hovering".
  it('reads "Hovering" for a flying avatar and the sitting states from llGetAgentInfo', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const flier = world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
    const p = await probe(world)
    flier.info |= 0x1 | AGENT_IN_AIR
    expect(p.read()).toEqual([AGENT_IN_AIR, 'Hovering'])
    flier.info = AGENT_SITTING
    expect(p.read()).toEqual([AGENT_SITTING, 'Sitting on Ground'])
    flier.info = AGENT_SITTING | AGENT_ON_OBJECT
    expect(p.read()).toEqual([AGENT_SITTING | AGENT_ON_OBJECT, 'Sitting'])
  })
})

describe('llGetAgentInfo and llGetAnimation as the avatar stands', () => {
  // In-world: a viewer stand from the seat, from the prim with no sit target, and "@unsit=force"
  // from the seat each gave a changed in the seat that read 262 (AGENT_IN_AIR, no AGENT_SITTING,
  // no AGENT_ON_OBJECT) and "Striding". The watching probe read 262 "Striding" for one 0.05 s
  // sample (about 0.07 s), then 6 "Standing". The "Walking" that follows is pinned in
  // stand-walk-teleport-fall-flying-sit.test.ts.
  it('reads AGENT_IN_AIR and "Striding" in the seat\'s changed event, then "Standing"', async () => {
    const f = await fixture()
    f.sit()
    f.stand()
    expect(f.seat.changes().at(-1)).toEqual([AGENT_IN_AIR, 'Striding'])
    expect(f.watcher.read()).toEqual([AGENT_IN_AIR, 'Striding'])
    f.advance(100)
    expect(f.watcher.read()).toEqual([0, 'Standing'])
  })

  it('reads the same after "@unsit=force"', async () => {
    const f = await fixture()
    f.sit()
    f.worn.send('rlv', 0, '@unsit=force')
    f.advance(225)
    expect(f.seat.changes().at(-1)).toEqual([AGENT_IN_AIR, 'Striding'])
    f.advance(100)
    expect(f.watcher.read()).toEqual([0, 'Standing'])
  })

  it('reads the same from a seat with no sit target', async () => {
    const f = await fixture()
    f.sit(f.other)
    f.stand()
    expect(f.other.changes().at(-1)).toEqual([AGENT_IN_AIR, 'Striding'])
  })

  // In-world: llUnSit(owner) from the seat, three runs. Two changed events read 262 "Striding"
  // and one read 6 "Standing". The watching probe read 262 "Striding" for one sample, then 6
  // "Standing". What the calling handler reads is pinned in stand-walk-teleport-fall-flying-sit.test.ts.
  it('reads the same after llUnSit', async () => {
    const f = await fixture()
    f.sit()
    f.seat.send('unsit')
    expect(f.seat.changes().at(-1)).toEqual([AGENT_IN_AIR, 'Striding'])
    f.advance(100)
    expect(f.watcher.read()).toEqual([0, 'Standing'])
  })

  // In-world: the seat said llDie() with the avatar on it, and in another run the seat was taken
  // into inventory with the avatar on it. Each time the watching probe went from 54 "Sitting" to
  // 262 "Striding", then 6 "Standing".
  it('reads the same when the seat dies under the avatar', async () => {
    const f = await fixture()
    f.sit()
    f.seat.send('die')
    expect(f.watcher.read()).toEqual([AGENT_IN_AIR, 'Striding'])
    f.advance(100)
    expect(f.watcher.read()).toEqual([0, 'Standing'])
  })

  // In-world: a viewer stand from the ground, in two runs, and "@unsit=force" from the ground each
  // took the watching probe from 22 "Sitting on Ground" to 262 "Striding" for one sample, then to
  // 6 "Standing". (A first run of the viewer stand missed the 262 between two samples.)
  it('reads the same for a stand from the ground', async () => {
    const f = await fixture()
    f.worn.send('rlv', 0, SIT_GROUND)
    f.advance(225)
    f.stand()
    expect(f.watcher.read()).toEqual([AGENT_IN_AIR, 'Striding'])
    f.advance(100)
    expect(f.watcher.read()).toEqual([0, 'Standing'])
  })

  // In-world: "@sitground=force" with the avatar on the seat gave one changed in the seat that
  // read 262 "Striding". The worn probe watched 54 "Sitting", then 6 "Standing" 0.26 s later and
  // 22 "Sitting on Ground" 0.53 s later. rezless puts the avatar on the ground at once, so the
  // seat's changed reads 22; #455 holds a failing test for that.
  it('ends a ground sit from a seat on "Sitting on Ground"', async () => {
    const f = await fixture()
    f.sit()
    f.worn.send('rlv', 0, SIT_GROUND)
    f.advance(225)
    f.advance(1000)
    expect(f.watcher.read()).toEqual([AGENT_SITTING, 'Sitting on Ground'])
  })

  // In-world: a teleport to a spot in the same region with the avatar on the seat gave a changed
  // in the seat that read 262 "Falling Down". The worn probe read 262 "Falling Down" for 0.6 s,
  // then 134 "Walking" for 0.2 s, then 6 "Standing".
  it('reads AGENT_IN_AIR and "Falling Down" after a teleport from a seat, then "Standing"', async () => {
    const f = await fixture()
    f.sit()
    expect(f.world.teleportAvatar(f.avatar, { x: 120, y: 52, z: 30 })).toBe(true)
    f.advance(0)
    expect(f.seat.changes().at(-1)).toEqual([AGENT_IN_AIR, 'Falling Down'])
    f.advance(300)
    expect(f.watcher.read()).toEqual([AGENT_IN_AIR, 'Falling Down'])
    f.advance(700)
    expect(f.watcher.read()).toEqual([0, 'Standing'])
  })

  // In-world: the seat held 4096 from a dialog and called llTeleportAgent(owner, "", a spot 2 m
  // away, ZERO_VECTOR) with the avatar on it. Its changed read 262 "Falling Down"; the watching
  // probe read 262 "Falling Down" for 0.2 s, then 6 "Landing", then 6 "Standing". The fall lasts
  // as long as the drop to the floor, which rezless doesn't simulate, so it uses the 0.6 s a
  // viewer teleport took.
  it('reads AGENT_IN_AIR and "Falling Down" after llTeleportAgent from a seat', async () => {
    const f = await fixture()
    f.sit()
    f.seat.send('ask', 4096)
    f.seat.script.grantPermissions()
    f.seat.send('tplocal')
    expect(f.seat.changes().at(-1)).toEqual([AGENT_IN_AIR, 'Falling Down'])
    f.advance(1000)
    expect(f.watcher.read()).toEqual([0, 'Standing'])
  })

  // In-world: a viewer teleport within the region with the avatar standing, and another with it
  // sitting on the ground, each read 262 "Falling Down" for 0.6 s in the worn probe, then 6
  // "Landing" and 6 "Standing".
  it('reads "Falling Down" after a teleport from standing or from the ground', async () => {
    const f = await fixture()
    expect(f.world.teleportAvatar(f.avatar, { x: 120, y: 52, z: 30 })).toBe(true)
    f.advance(0)
    expect(f.watcher.read()).toEqual([AGENT_IN_AIR, 'Falling Down'])
    f.advance(700)
    f.worn.send('rlv', 0, SIT_GROUND)
    f.advance(225)
    expect(f.world.teleportAvatar(f.avatar, { x: 30, y: 30, z: 30 })).toBe(true)
    f.advance(0)
    expect(f.watcher.read()).toEqual([AGENT_IN_AIR, 'Falling Down'])
    f.advance(1000)
    expect(f.watcher.read()).toEqual([0, 'Standing'])
  })

  it('carries the state with a script teleport to another region', async () => {
    const f = await fixture()
    f.world.addRegion('away', { x: 256, y: 0 })
    f.sit()
    f.seat.send('ask', 4096)
    f.seat.script.grantPermissions()
    f.seat.send('tp')
    f.advance(1000)
    expect(f.avatar.region).toBe('away')
    expect(f.world.teleportAvatar(f.avatar, { x: 30, y: 30, z: 30 })).toBe(true)
    f.advance(1000)
    expect(f.watcher.read()).toEqual([0, 'Standing'])
  })

  // https://wiki.secondlife.com/wiki/LlGetAnimation: an avatar that is not in the region reads "".
  it('reads nothing while the avatar is in another region, and "Standing" once it is back', async () => {
    const f = await fixture()
    f.world.addRegion('away', { x: 256, y: 0 })
    f.sit()
    expect(f.world.teleportAvatar(f.avatar, { x: 300, y: 30, z: 30 })).toBe(true)
    f.advance(1000)
    expect(f.watcher.read()).toEqual([0, ''])
    expect(f.world.teleportAvatar(f.avatar, { x: 30, y: 30, z: 30 })).toBe(true)
    f.advance(0)
    expect(f.watcher.read()).toEqual([AGENT_IN_AIR, 'Falling Down'])
    f.advance(1000)
    expect(f.watcher.read()).toEqual([0, 'Standing'])
  })

  it('keeps a locomotion state the test sets before the avatar lands', async () => {
    const f = await fixture()
    f.sit()
    f.stand()
    f.watcher.script.setAnimationState(OWNER, 'Walking')
    f.advance(100)
    expect(f.watcher.read()).toEqual([0, 'Walking'])
  })

  it('reads AGENT_IN_AIR afresh for each of two quick stands', async () => {
    const f = await fixture()
    f.sit()
    f.stand()
    f.advance(30)
    f.sit()
    f.stand()
    f.advance(30)
    expect(f.watcher.read()).toEqual([AGENT_IN_AIR, 'Striding'])
    f.advance(30)
    expect(f.watcher.read()).toEqual([0, 'Standing'])
  })
})

describe('the scripted camera after a reset', () => {
  async function locked() {
    const f = await fixture()
    f.worn.send('ask', TRACK | CAMERA)
    f.worn.send('cam')
    expect(f.worn.script.cameraParams.size).toBeGreaterThan(0)
    return f
  }

  // In-world: the worn probe held 3072 and locked the camera 20 m up. After llResetScript the
  // other worn probe read llGetCameraPos() at the scripted position 2 s, 6 s and 12 s later, and
  // still after the reset probe asked for 1024 and then 3072 again (both granted at once).
  it('keeps the camera where the script put it, and asking again does not release it', async () => {
    const f = await locked()
    f.worn.send('reset')
    expect(f.worn.script.cameraParams.size).toBeGreaterThan(0)
    f.worn.send('ask', TRACK)
    f.worn.send('ask', TRACK | CAMERA)
    expect(f.worn.script.cameraParams.size).toBeGreaterThan(0)
  })

  // In-world: holding 3072 with the camera locked, the worn probe asked for 1024 alone (granted,
  // 1024 read back) and the camera stayed where it was. llReleaseCamera(owner) left it there too.
  it('keeps the camera when a request drops camera control, and after llReleaseCamera', async () => {
    const f = await locked()
    f.worn.send('release')
    expect(f.worn.script.cameraParams.size).toBeGreaterThan(0)
    f.worn.send('ask', TRACK)
    expect(f.worn.held()).toEqual([TRACK, OWNER])
    expect(f.worn.script.cameraParams.size).toBeGreaterThan(0)
  })

  // In-world: after the reset, llClearCameraParams with no permission asked for left the camera
  // where it was. After a request for 1024, or for nothing (run_time_permissions(0)),
  // llClearCameraParams put the camera back on the avatar.
  it('is released by llClearCameraParams once the script holds a permission key again', async () => {
    const f = await locked()
    f.worn.send('reset')
    f.worn.send('clear')
    expect(f.worn.script.cameraParams.size).toBeGreaterThan(0)
    f.worn.send('ask', 0)
    expect(f.worn.held()).toEqual([0, OWNER])
    f.worn.send('clear')
    expect(f.worn.script.cameraParams.size).toBe(0)
  })

  it('is released by llClearCameraParams from a script that holds only PERMISSION_TRACK_CAMERA', async () => {
    const f = await locked()
    f.worn.send('ask', TRACK)
    f.worn.send('clear')
    expect(f.worn.script.cameraParams.size).toBe(0)
  })

  // In-world: the seat held 3072 and locked the camera with the avatar on it, then reset. The
  // camera stayed where it was until the avatar stood, which put it back on the avatar.
  it('is released when the avatar stands from the seat, even after the seat script reset', async () => {
    const f = await fixture()
    f.sit()
    f.seat.send('ask', TRACK | CAMERA)
    f.seat.send('cam')
    f.seat.send('reset')
    expect(f.seat.script.cameraParams.size).toBeGreaterThan(0)
    expect(f.seat.held()).toEqual([0, NULL_KEY])
    f.stand()
    expect(f.seat.script.cameraParams.size).toBe(0)
  })

  // In-world: the worn probe held 3104, locked the camera, reset and asked for 32. The camera
  // stayed where it was until llDetachFromAvatar, which put it back on the avatar.
  it('is released when the object is detached, even after the script reset', async () => {
    const f = await locked()
    f.worn.send('reset')
    f.worn.linkset.detachFromAvatar()
    expect(f.worn.script.cameraParams.size).toBe(0)
  })
})

describe('which scripts can release a scripted camera', () => {
  // In-world (Aditi, two avatars, 2026-11-14): two scripts in one prim each locked the camera of
  // one of the prim's two sitters; each llClearCameraParams released only the camera of the
  // avatar the script held its key for (two-avatar-permissions.test.ts).
  it('keeps each avatar\'s rules apart in one prim', async () => {
    const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const owner = world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
    const bob = world.addAvatar({ region: 'home', key: BOB, username: 'bob' })
    const seat = await probe(world, { sitTarget: true, scripts: ['one', 'two'], child: true })
    expect(world.sitAvatar(owner, seat.linkset.prims[0]!)).toBe(true)
    expect(world.sitAvatar(bob, seat.linkset.prims[1]!)).toBe(true)
    seat.send('ask', TRACK | CAMERA, '', 'one')
    seat.send('cam', 0, '', 'one')
    seat.scripts.two!.setGlobal('o', BOB)
    seat.send('ask', TRACK | CAMERA, '', 'two')
    seat.send('cam', 0, '', 'two')
    seat.send('clear', 0, '', 'two')
    expect(seat.scripts.one!.cameraParams.size).toBeGreaterThan(0)
    expect(seat.scripts.two!.cameraParams.size).toBe(0)
    seat.send('cam', 0, '', 'two')
    seat.send('clear', 0, '', 'one')
    expect(seat.scripts.one!.cameraParams.size).toBe(0)
    expect(seat.scripts.two!.cameraParams.size).toBeGreaterThan(0)
  })

  it('is released by a stand or a detach after the prim\'s last script is gone', async () => {
    const f = await fixture()
    f.sit()
    f.seat.send('ask', TRACK | CAMERA)
    f.seat.send('cam')
    const rules = f.seat.prim.scriptedCameras
    f.seat.send('rm')
    expect(f.seat.prim.scripts.length).toBe(0)
    f.stand()
    expect(rules.size).toBe(0)
    f.worn.send('ask', TRACK | CAMERA)
    f.worn.send('cam')
    const worn = f.worn.prim.scriptedCameras
    f.worn.send('rm')
    f.worn.linkset.detachFromAvatar()
    expect(worn.size).toBe(0)
  })

  // In-world (Aditi, two avatars, 2026-11-14): with the owner's camera locked by a script in the
  // seat's root, a second avatar stood up from the seat's child prim -> the owner's camera came
  // back to the owner, though the script still held 3072 (two-avatar-permissions.test.ts).
  it('is released when another sitter stands', async () => {
    const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const owner = world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
    const bob = world.addAvatar({ region: 'home', key: BOB, username: 'bob' })
    const seat = await probe(world, { sitTarget: true, scripts: ['one', 'two'], child: true })
    expect(world.sitAvatar(owner, seat.linkset.prims[0]!)).toBe(true)
    expect(world.sitAvatar(bob, seat.linkset.prims[1]!)).toBe(true)
    seat.send('ask', TRACK | CAMERA, '', 'one')
    seat.send('cam', 0, '', 'one')
    seat.scripts.two!.setGlobal('o', BOB)
    seat.send('ask', 4, '', 'two')
    seat.send('held', 0, '', 'two')
    expect((seat.scripts.two!.global('log') as unknown[]).slice(-2)).toEqual([4, BOB])
    world.standAvatar(bob)
    seat.linkset.advanceTime(0)
    expect(seat.scripts.one!.cameraParams.size).toBe(0)
  })

  // In-world: with the worn probe's camera locked, a second script in the same prim asked for
  // 1024 and called llClearCameraParams, and the camera went back to the avatar. The other worn
  // object, holding 1024, called llClearCameraParams and the camera stayed where it was. With the
  // avatar on a two-prim seat whose root held 3072 and a locked camera, a script in the child prim
  // asked for 1024 and called llClearCameraParams, and the camera stayed where it was.
  it('is any script in the same prim with a permission key, not one in another prim', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
    const worn = await probe(world, { scripts: ['one', 'two'], child: true })
    worn.linkset.attachToAvatar(OWNER, 5)
    const other = await probe(world)
    other.linkset.attachToAvatar(OWNER, 6)
    worn.send('ask', TRACK | CAMERA, '', 'one')
    worn.send('cam', 0, '', 'one')
    other.send('ask', TRACK)
    other.send('clear')
    worn.send('ask', TRACK, '', 'child')
    worn.send('clear', 0, '', 'child')
    expect(worn.scripts.one!.cameraParams.size).toBeGreaterThan(0)
    worn.send('ask', TRACK, '', 'two')
    worn.send('clear', 0, '', 'two')
    expect(worn.scripts.one!.cameraParams.size).toBe(0)
  })
})
