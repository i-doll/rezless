import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlRequestPermissions
//
// Every "In-world" note below was measured on Aditi, SLua Tideland, 2026-11-13, with a
// Firestorm viewer whose avatar owned every probe object.
//
// The request probe made each run of requests from a freshly reset script. It read
// llGetPermissions() right after llRequestPermissions and again 1.5 s later, and recorded whether
// run_time_permissions fired and whether llGetPermissionsKey() was the asked avatar. The viewer's
// pending permission dialogs, with the bits each one asked for, were listed after the runs.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const DEBIT = 2, CONTROLS = 4, REMAP = 8, ANIMATION = 16, ATTACH = 32, RELEASE = 64, LINKS = 128, JOINTS = 256
const CHANGE_PERMISSIONS = 512, TRACK = 1024, CAMERA = 2048, TELEPORT = 4096, ESTATE = 16384, OVERRIDE = 32768
const RETURN = 65536, FORCE_SIT = 0x20000, ENVIRONMENT = 0x40000, LAND = 0x80000, GAME = 0x100000

const source = (agent: string, asks: number[]) => `
  list asks = [${asks.join(', ')}]; integer next; list sync; list events; list keys;
  integer held; key holder; list attached; integer controls;
  default {
    touch_start(integer n) {
      llRequestPermissions("${agent}", llList2Integer(asks, next++));
      sync += llGetPermissions();
    }
    run_time_permissions(integer p) {
      events += p; keys += llGetPermissionsKey();
      if (p & PERMISSION_TAKE_CONTROLS) llTakeControls(CONTROL_FWD, TRUE, FALSE);
    }
    control(key id, integer level, integer edge) { ++controls; }
    touch_end(integer n) { held = llGetPermissions(); holder = llGetPermissionsKey(); }
    attach(key id) { attached += llGetPermissions(); attached += llGetPermissionsKey(); }
  }`

type Where = 'seated' | 'worn' | 'worn temporarily' | 'worn in a child prim' | 'standing' | 'seated elsewhere'

async function fixture(where: Where, asks: number[], opts: { agent?: string, scriptIn?: 'child', sitOn?: 'child', world?: World } = {}) {
  const agent = opts.agent ?? OWNER
  const world = opts.world ?? new World()
  world.addRegion('home', { x: 0, y: 0 })
  const owner = world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
  const bob = world.addAvatar({ region: 'home', key: BOB, username: 'bob' })
  const avatar = agent === OWNER ? owner : bob
  const scripts = [{ name: 'probe', source: { source: source(agent, asks) } }]
  if (where === 'worn in a child prim') opts = { ...opts, scriptIn: 'child' }
  const twoPrims = opts.scriptIn === 'child' || opts.sitOn === 'child'
  const { linkset, scripts: loaded } = await loadLinkset({ world, region: 'home', owner: OWNER,
    prims: !twoPrims ? [{ scripts }] : opts.scriptIn === 'child' ? [{}, { scripts }] : [{ scripts }, {}] })
  const script = loaded.probe!
  script.start()
  const sit = () => expect(world.sitAvatar(avatar, linkset.prims[opts.sitOn === 'child' ? 1 : 0]!)).toBe(true)
  if (where === 'seated') sit()
  if (where === 'worn' || where === 'worn in a child prim') linkset.attachToAvatar(agent, 5)
  if (where === 'worn temporarily') linkset.attachToAvatar(agent, 5, true)
  if (where === 'seated elsewhere') {
    const seat = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{}] })
    expect(world.sitAvatar(avatar, seat.linkset.prims[0]!)).toBe(true)
  }
  linkset.advanceTime(0)
  const ask = (times = 1) => {
    for (let i = 0; i < times; i++) {
      script.fire('touch_start', { num_detected: 1 })
      linkset.advanceTime(0)
    }
  }
  const held = () => {
    script.fire('touch_end', { num_detected: 1 })
    return [script.global('held'), script.global('holder')]
  }
  return { world, avatar, linkset, script, ask, sit, held }
}

describe('permissions granted without a dialog', () => {
  // In-world: request probe, avatar seated on the probe -> 4, 16, 1024, 2048 and 1048576 each read
  // back at once, fired run_time_permissions with the same bits and left the avatar as the
  // permission key. No dialog appeared for them.
  it.each([CONTROLS, ANIMATION, TRACK, CAMERA, GAME])('grants %i to an avatar sitting on the object', async bits => {
    const f = await fixture('seated', [bits])
    f.ask()
    expect(f.script.global('sync')).toEqual([bits])
    expect(f.script.global('events')).toEqual([bits])
    expect(f.script.global('keys')).toEqual([OWNER])
    expect(f.script.permissionRequests).toEqual([{ agent: OWNER, permissions: bits, answered: true }])
  })

  // In-world: request probe, avatar seated on the probe -> 2, 8, 32, 64, 128, 256, 512, 4096, 16384,
  // 32768, 65536, 131072, 262144 and 524288 each left llGetPermissions() at 0 with no event. Each of
  // them raised a dialog (131072 as "Force your avatar to sit", 262144 as "Change your environment
  // settings"). A second probe asked its standing owner for 8, 64, 256, 512, 16384, 32768, 65536,
  // 131072, 262144 and 524288 one at a time: answering Yes fired run_time_permissions with that
  // bit. 32 and 128 were answered Yes in other probes; the dialogs for 2 and 4096 were left alone.
  it.each([DEBIT, REMAP, ATTACH, RELEASE, LINKS, JOINTS, CHANGE_PERMISSIONS, TELEPORT, ESTATE, OVERRIDE, RETURN,
    FORCE_SIT, ENVIRONMENT, LAND])('leaves %i from a sitter for a dialog', async bits => {
    const f = await fixture('seated', [bits])
    f.ask()
    expect(f.script.global('sync')).toEqual([0])
    expect(f.script.global('events')).toEqual([])
    expect(f.script.permissionRequests).toEqual([{ agent: OWNER, permissions: bits, answered: false }])
    f.script.grantPermissions()
    expect(f.script.global('events')).toEqual([bits])
  })

  // In-world: request probe worn on the left hand -> the sitter's five bits plus 32 and 32768
  // each read back at once and fired run_time_permissions. The same probe in the child prim of a
  // worn two-prim object -> 16, 4, 32 and 1024 granted, 2 and 18 not.
  it.each([CONTROLS, ANIMATION, ATTACH, TRACK, CAMERA, OVERRIDE, GAME].flatMap(bits =>
    [['worn', bits], ['worn in a child prim', bits]] as const))('grants while %s: %i', async (where, bits) => {
    const f = await fixture(where, [bits])
    f.ask()
    expect(f.script.global('sync')).toEqual([bits])
    expect(f.script.global('events')).toEqual([bits])
    expect(f.script.global('keys')).toEqual([OWNER])
  })

  // In-world: request probe worn -> 2, 8, 64, 128, 256, 512, 4096, 16384, 65536, 131072, 262144 and
  // 524288 stayed at 0 with no event.
  it.each([DEBIT, REMAP, RELEASE, LINKS, JOINTS, CHANGE_PERMISSIONS, TELEPORT, ESTATE, RETURN, FORCE_SIT, ENVIRONMENT,
    LAND])('leaves %i from a wearer for a dialog', async bits => {
    const f = await fixture('worn', [bits])
    f.ask()
    expect(f.script.global('sync')).toEqual([0])
    expect(f.script.global('events')).toEqual([])
    expect(f.script.permissionRequests).toEqual([{ agent: OWNER, permissions: bits, answered: false }])
    f.script.grantPermissions()
    expect(f.script.global('events')).toEqual([bits])
  })

  // In-world: a probe that asked for ATTACH through the dialog, attached itself with
  // llAttachToAvatarTemp and then asked its wearer -> 4, 16, 32, 1024, 2048, 32768, 1048576 and 20
  // were granted at once; 2 and 18 were not.
  it('grants the same to the wearer of a temporary attachment', async () => {
    const asks = [CONTROLS, ANIMATION, ATTACH, TRACK, CAMERA, OVERRIDE, GAME, DEBIT, CONTROLS | ANIMATION, ANIMATION | DEBIT]
    const f = await fixture('worn temporarily', asks)
    f.ask(asks.length)
    expect(f.script.global('sync')).toEqual([4, 16, 32, 1024, 2048, 32768, 1048576, 1048576, 20, 20])
    expect(f.script.global('events')).toEqual([4, 16, 32, 1024, 2048, 32768, 1048576, 20])
  })

  // In-world: request probe -> 20 and 1044 were granted whole to a sitter and to a wearer.
  it.each(['seated', 'worn'] as const)('grants several covered bits in one request while %s', async where => {
    const f = await fixture(where, [CONTROLS | ANIMATION, CONTROLS | ANIMATION | TRACK])
    f.ask(2)
    expect(f.script.global('sync')).toEqual([20, 1044])
    expect(f.script.global('events')).toEqual([20, 1044])
  })

  // In-world: request probe worn on the HUD centre point -> 1056 (32|1024), 32800 (32|32768),
  // 32784 (16|32768) and 48 (16|32) were granted whole. The same four from a seat stayed at 0 and
  // raised dialogs asking for both bits.
  it('grants mixes with the wearer-only bits to a wearer and not to a sitter', async () => {
    const asks = [ATTACH | TRACK, ATTACH | OVERRIDE, ANIMATION | OVERRIDE, ANIMATION | ATTACH]
    const worn = await fixture('worn', asks)
    worn.ask(4)
    expect(worn.script.global('events')).toEqual(asks)
    const seated = await fixture('seated', asks)
    seated.ask(4)
    expect(seated.script.global('sync')).toEqual([0, 0, 0, 0])
    expect(seated.script.global('events')).toEqual([])
  })

  // In-world: request probe -> 18 (16|2) and 144 (16|128) granted nothing to a sitter or a wearer:
  // llGetPermissions() stayed 0, no event fired, and the dialog asked for the whole request
  // (18 and 144). 4112 (16|4096) and 524304 (16|524288) did the same, and so did 16 with each of
  // the retired bits: 24 and 80 seated and worn, 272 and 528 seated.
  it.each(['seated', 'worn'] as const)('sends a request with one uncovered bit to a dialog whole while %s', async where => {
    const asks = [ANIMATION | DEBIT, ANIMATION | TELEPORT, ANIMATION | LAND, ANIMATION | REMAP, ANIMATION | RELEASE,
      ANIMATION | JOINTS, ANIMATION | CHANGE_PERMISSIONS, ANIMATION | LINKS]
    const f = await fixture(where, asks)
    f.ask(asks.length)
    expect(f.script.global('sync')).toEqual(asks.map(() => 0))
    expect(f.script.global('events')).toEqual([])
    expect(f.script.permissionRequests.every(r => !r.answered)).toBe(true)
    f.script.grantPermissions()
    expect(f.script.global('events')).toEqual([ANIMATION | LINKS])
  })

  // In-world: request probe, runs "16,2" and "16,18" and "20,22" -> the permissions already held
  // stayed in llGetPermissions() while the second request waited on its dialog.
  it('keeps the permissions it holds while a later request waits on a dialog', async () => {
    const f = await fixture('seated', [ANIMATION, ANIMATION | DEBIT])
    f.ask(2)
    expect(f.script.global('sync')).toEqual([16, 16])
    expect(f.script.global('events')).toEqual([16])
  })

  // In-world: request probe, runs "16,4" and "20,4" -> the second grant replaced the first
  // (llGetPermissions() 4); run "4,20" -> 20.
  it('replaces the held permissions with the newly granted ones', async () => {
    const f = await fixture('seated', [ANIMATION, CONTROLS, CONTROLS | ANIMATION, CONTROLS])
    f.ask(4)
    expect(f.script.global('sync')).toEqual([16, 4, 20, 4])
    expect(f.script.global('events')).toEqual([16, 4, 20, 4])
  })

  // In-world: request probe, run "16,16", and the sit probe's repeat request -> the same
  // request fired run_time_permissions again.
  it('fires run_time_permissions again for a repeated request', async () => {
    const f = await fixture('seated', [ANIMATION, ANIMATION])
    f.ask(2)
    expect(f.script.global('events')).toEqual([16, 16])
  })

  // In-world: request probe, runs "0" and "16,0" seated and worn -> a request for no permissions
  // fired run_time_permissions(0), set the permission key to the avatar and dropped the held 16.
  it.each(['seated', 'worn'] as const)('answers a request for no permissions with an empty grant while %s', async where => {
    const f = await fixture(where, [0, ANIMATION, 0])
    f.ask(3)
    expect(f.script.global('sync')).toEqual([0, 16, 0])
    expect(f.script.global('events')).toEqual([0, 16, 0])
    expect(f.script.global('keys')).toEqual([OWNER, OWNER, OWNER])
  })

  // In-world: request probe touched by its standing owner, run "0" -> no event, no dialog. A probe
  // that held 16 from an accepted dialog and then asked its standing owner for 0 -> no event, and
  // llGetPermissions() stayed 16 with the same key.
  it('ignores a request for no permissions from an avatar that is neither sitting nor wearing', async () => {
    const f = await fixture('standing', [ANIMATION, 0])
    f.ask()
    f.script.grantPermissions()
    f.ask()
    expect(f.script.global('sync')).toEqual([0, 16])
    expect(f.script.global('events')).toEqual([16])
    expect(f.script.permissionRequests).toHaveLength(1)
  })

  // In-world: request probe touched by its standing owner -> every bit and every mix stayed at 0
  // with no event, so owning the object grants nothing by itself. The same probe touched while
  // the avatar sat on a different object -> 16, 4, 32, 1024 all stayed at 0.
  it.each(['standing', 'seated elsewhere'] as const)('grants nothing to the owner while %s', async where => {
    const asks = [CONTROLS, ANIMATION, ATTACH, TRACK, CONTROLS | ANIMATION]
    const f = await fixture(where, asks)
    f.ask(asks.length)
    expect(f.script.global('sync')).toEqual([0, 0, 0, 0, 0])
    expect(f.script.global('events')).toEqual([])
    expect(f.script.permissionRequests.every(r => !r.answered)).toBe(true)
  })

  // In-world: request probe in a two-prim object with no sit target -> 16, 4 and 1024 were granted
  // and 32 was not, both with the script in the child prim and the avatar seated on the root, and
  // with the script in the root and the avatar seated on the child. A one-prim seat with no sit
  // target gave the same as one with a sit target.
  it.each([{ scriptIn: 'child' }, { sitOn: 'child' }] as const)('grants to a sitter anywhere on the object (%o)', async opts => {
    const f = await fixture('seated', [ANIMATION, CONTROLS, ATTACH, TRACK], opts)
    f.ask(4)
    expect(f.script.global('sync')).toEqual([16, 4, 4, 1024])
    expect(f.script.global('events')).toEqual([16, 4, 1024])
  })

  // In-world (Aditi, two avatars, 2026-11-14): a second avatar sat on the owner's seat, which asked
  // them for 16, 4, 1024, 2048, 1048576 and 3092 -> each granted at once with them as the key.
  it('grants to a sitter who does not own the object', async () => {
    const f = await fixture('seated', [ANIMATION], { agent: BOB })
    f.ask()
    expect(f.script.global('events')).toEqual([16])
    expect(f.script.global('keys')).toEqual([BOB])
  })

  // In-world: sit probes for 16, 1024 and 1048576 -> the bits were still held when the avatar
  // stood and 3 s later, with no event. Asking again from the now standing avatar raised a dialog
  // and left the held bits in place.
  it('keeps animation, camera tracking and game control after the sitter stands, and stops granting', async () => {
    const bits = ANIMATION | TRACK | GAME
    const f = await fixture('seated', [bits, bits])
    f.ask()
    f.world.standAvatar(f.avatar)
    f.linkset.advanceTime(3_000)
    f.ask()
    expect(f.script.global('sync')).toEqual([bits, bits])
    expect(f.script.global('events')).toEqual([bits])
    expect(f.script.permissionRequests.map(r => r.answered)).toEqual([true, false])
  })

  // In-world: a probe asked its standing owner for 16 and the dialog was left open; the avatar then
  // sat on the probe -> llGetPermissions() was still 0 at the sit and 3 s later. Answering the
  // dialog Yes while seated then fired run_time_permissions(16).
  it('does not answer a waiting request when the avatar sits down', async () => {
    const f = await fixture('standing', [ANIMATION])
    f.ask()
    f.sit()
    f.linkset.advanceTime(3_000)
    expect(f.script.global('events')).toEqual([])
    f.script.grantPermissions()
    expect(f.script.global('events')).toEqual([16])
  })
})

describe('controls and camera control taken back', () => {
  // In-world: sit probes granted 4, 2048, 20 (4|16) and 3092 (4|16|1024|2048) to their sitter. When
  // the avatar stood, llGetPermissions() in the changed event was already 0, 0, 16 and 1040, and
  // the same 3 s later; no run_time_permissions fired. llGetPermissionsKey() was NULL_KEY where
  // nothing was left and still the avatar otherwise.
  it.each([
    [CONTROLS, 0, '00000000-0000-0000-0000-000000000000'],
    [CAMERA, 0, '00000000-0000-0000-0000-000000000000'],
    [CONTROLS | ANIMATION, ANIMATION, OWNER],
    [CONTROLS | ANIMATION | TRACK | CAMERA, ANIMATION | TRACK, OWNER],
  ])('leaves %i as %i when the sitter stands', async (bits, left, key) => {
    const f = await fixture('seated', [bits])
    f.ask()
    f.world.standAvatar(f.avatar)
    expect(f.held()).toEqual([left, key])
    f.linkset.advanceTime(3_000)
    expect(f.held()).toEqual([left, key])
    expect(f.script.global('events')).toEqual([bits])
  })

  // In-world: a probe was granted 20 through the dialog while its owner stood. The avatar then sat
  // on it (still 20) and stood -> 16, so the stand takes back controls from a dialog as it does
  // those granted automatically. Controls granted through an experience were not measured,
  // because no experience was available for probing; they are treated the same.
  it('takes back controls that were granted through a dialog', async () => {
    const f = await fixture('standing', [CONTROLS | ANIMATION])
    f.ask()
    f.script.grantPermissions()
    f.sit()
    expect(f.held()).toEqual([20, OWNER])
    f.world.standAvatar(f.avatar)
    expect(f.held()).toEqual([16, OWNER])
    expect(f.script.global('events')).toEqual([20])
  })

  // In-world: a sitter holding 20 sat straight onto another object -> the first seat read 16 in its
  // changed event.
  it('takes them back when the sitter moves to another seat', async () => {
    const f = await fixture('seated', [CONTROLS | ANIMATION])
    f.ask()
    const other = await loadLinkset({ world: f.world, region: 'home', owner: OWNER, prims: [{}] })
    expect(f.world.sitAvatar(f.avatar, other.linkset.prims[0]!)).toBe(true)
    expect(f.held()).toEqual([16, OWNER])
  })

  // In-world: a sitter holding 2068 on the root of a two-prim object, each prim with a sit target,
  // was told to sit on the other prim -> no changed event, still on the first sit target, still
  // 2068. The viewer and simulator would not move a sitter within one object, so what such a
  // move does to permissions could not be measured; the avatar never leaves the object here, and
  // the script keeps what it holds.
  it('keeps them when the sitter moves between prims of the same object', async () => {
    const f = await fixture('seated', [CONTROLS | ANIMATION | CAMERA], { sitOn: 'child' })
    f.ask()
    expect(f.world.sitAvatar(f.avatar, f.linkset.prims[0]!)).toBe(true)
    expect(f.held()).toEqual([2068, OWNER])
    f.script.sendControl(1)
    f.linkset.advanceTime(0)
    expect(f.script.global('controls')).toBe(1)
  })

  // In-world: a seat holding 20 called llUnSit on its sitter -> llGetPermissions() on the next
  // line was 16.
  it('takes them back on the line after llUnSit', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const owner = world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
    const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'seat', source: { source: `
      integer before; integer after;
      default {
        changed(integer c) {
          if ((c & CHANGED_LINK) && !before) llRequestPermissions(llGetOwner(), PERMISSION_TAKE_CONTROLS | PERMISSION_TRIGGER_ANIMATION);
        }
        run_time_permissions(integer p) { before = llGetPermissions(); llUnSit(llGetOwner()); after = llGetPermissions(); }
      }` } }] }] })
    scripts.seat!.start()
    world.sitAvatar(owner, linkset.prims[0]!)
    linkset.advanceTime(0)
    expect([scripts.seat!.global('before'), scripts.seat!.global('after')]).toEqual([20, 16])
    expect(owner.sittingOn).toBeNull()
  })

  // Second Life can't be made to press a key for the probing avatar, so that control events stop
  // is taken from the lost permission: llTakeControls needs the bit that is gone. A control event
  // already queued is dropped the way llReleaseControls drops it.
  it('stops delivering control events once controls are taken back', async () => {
    const f = await fixture('seated', [CONTROLS])
    f.ask()
    f.script.sendControl(1)
    f.linkset.advanceTime(0)
    expect(f.script.global('controls')).toBe(1)
    f.world.standAvatar(f.avatar)
    f.script.sendControl(0)
    f.script.sendControl(1)
    f.linkset.advanceTime(0)
    expect(f.script.global('controls')).toBe(1)
  })

  it('drops a control event still on its way when the sitter stands', async () => {
    const f = await fixture('seated', [CONTROLS])
    f.ask()
    f.world.clock.schedule(f.script, f.world.clock.now + 100, 'control', { id: OWNER, level: 1, edge: 1 })
    f.world.standAvatar(f.avatar)
    f.linkset.advanceTime(200)
    expect(f.script.global('controls')).toBe(0)
  })

  it('drops control events parked for a stopped script', async () => {
    const f = await fixture('seated', [CONTROLS])
    f.ask()
    f.script.running = false
    f.script.sendControl(1)
    f.world.standAvatar(f.avatar)
    f.script.running = true
    f.script.resumeParked()
    f.linkset.advanceTime(0)
    expect(f.script.global('controls')).toBe(0)
  })

  // In-world: a worn probe holding 2052 (4|2048) reported it every 2 s while its wearer sat on a
  // different object and stood again -> 2052 throughout. A rezzed probe holding 4 from a dialog,
  // never sat on, still held 4 after the avatar sat on and stood from other objects.
  it.each(['worn', 'standing'] as const)('leaves a script alone when its avatar leaves a different object (%s)', async where => {
    const bits = where === 'worn' ? CONTROLS | CAMERA : CONTROLS
    const f = await fixture(where, [bits])
    f.ask()
    if (where === 'standing') f.script.grantPermissions()
    const other = await loadLinkset({ world: f.world, region: 'home', owner: OWNER, prims: [{}] })
    expect(f.world.sitAvatar(f.avatar, other.linkset.prims[0]!)).toBe(true)
    f.world.standAvatar(f.avatar)
    expect(f.held()).toEqual([bits, OWNER])
  })

  // In-world (Aditi, two avatars, 2026-11-14): a seat script held 3092 for one sitter and another
  // sitter stood up -> still 3092 for the first (two-avatar-permissions.test.ts).
  it('leaves permissions held for another avatar alone', async () => {
    const f = await fixture('standing', [CONTROLS], { agent: BOB })
    f.ask()
    f.script.grantPermissions()
    const owner = f.world.avatars.find(a => a.key === OWNER)!
    f.world.sitAvatar(owner, f.linkset.prims[0]!)
    f.world.standAvatar(owner)
    expect(f.held()).toEqual([4, BOB])
  })

  // In-world: a worn probe granted 35892 (4|16|32|1024|2048|32768) detached itself. Its
  // attach(NULL_KEY) event still read 35892; rezzed from inventory onto the ground it read 33840,
  // and the same when worn again, with the avatar still the permission key. Probes holding only 4,
  // and only 2052, read 0 with a NULL_KEY permission key when rezzed after the detach. No
  // run_time_permissions fired.
  it.each([
    [CONTROLS | ANIMATION | ATTACH | TRACK | CAMERA | OVERRIDE, ANIMATION | ATTACH | TRACK | OVERRIDE, OWNER],
    [CONTROLS, 0, '00000000-0000-0000-0000-000000000000'],
    [CONTROLS | CAMERA, 0, '00000000-0000-0000-0000-000000000000'],
  ])('leaves %i as %i after an attachment is detached and worn again', async (bits, left, key) => {
    const f = await fixture('worn', [bits])
    f.ask()
    f.linkset.detachFromAvatar()
    f.linkset.advanceTime(0)
    f.linkset.attachToAvatar(OWNER, 5)
    f.linkset.advanceTime(0)
    expect(f.script.global('attached')).toEqual([0, '00000000-0000-0000-0000-000000000000', bits, OWNER, left, key])
    expect(f.script.global('events')).toEqual([bits])
  })
})

describe('the scripted camera', () => {
  const camera = `
    default {
      changed(integer c) { if (c & CHANGED_LINK) llRequestPermissions(llGetOwner(), 3092); }
      attach(key id) { if (id) llRequestPermissions(id, 3124); }
      touch_start(integer n) { llSetCameraParams([CAMERA_ACTIVE, 1, CAMERA_POSITION, llGetPos() + <0, 0, 20>, CAMERA_POSITION_LOCKED, 1]); }
    }`
  async function cameraFixture() {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const owner = world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
    const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'cam', source: { source: camera } }] }] })
    const script = scripts.cam!
    script.start()
    const set = () => { script.fire('touch_start', { num_detected: 1 }); linkset.advanceTime(0) }
    return { world, owner, linkset, script, set }
  }

  // In-world: a seat granted 3092 put a locked camera 20 m above itself and llGetCameraPos()
  // followed it. Four seconds after the sitter stood the camera was back behind the avatar. The
  // avatar sat again and was granted 3092 again, the script set nothing, and the camera stayed
  // the avatar's own.
  it('goes back to the avatar when the sitter stands, and stays there on the next sit', async () => {
    const f = await cameraFixture()
    f.world.sitAvatar(f.owner, f.linkset.prims[0]!)
    f.linkset.advanceTime(0)
    f.set()
    expect(f.script.cameraParams.size).toBe(3)
    f.world.standAvatar(f.owner)
    expect(f.script.cameraParams.size).toBe(0)
    f.world.sitAvatar(f.owner, f.linkset.prims[0]!)
    f.linkset.advanceTime(0)
    expect(f.script.cameraParams.size).toBe(0)
  })

  // In-world: a worn probe granted 3124 set the same camera, detached itself and was rezzed on
  // the ground -> it held 1072 and llGetCameraPos() was back at the position read before the
  // camera was set.
  it('goes back to the avatar when the attachment is detached and rezzed again', async () => {
    const f = await cameraFixture()
    f.linkset.attachToAvatar(OWNER, 5)
    f.linkset.advanceTime(0)
    f.set()
    expect(f.script.cameraParams.size).toBe(3)
    f.linkset.detachFromAvatar()
    f.linkset.advanceTime(0)
    f.linkset.attachToAvatar(OWNER, 5)
    f.linkset.advanceTime(0)
    expect(f.script.cameraParams.size).toBe(0)
  })
})

describe('attaching from the ground', () => {
  // In-world: a rezzed probe granted 36 (4|32) through the dialog called llAttachToAvatar -> its
  // attach event and a read 2 s later both said 36, so attaching takes nothing back.
  it('keeps controls when a rezzed object attaches itself', async () => {
    const f = await fixture('standing', [CONTROLS | ATTACH])
    f.ask()
    f.script.grantPermissions()
    f.linkset.attachToAvatar(OWNER, 6)
    f.linkset.advanceTime(2_000)
    expect(f.script.global('attached')).toEqual([36, OWNER])
    expect(f.held()).toEqual([36, OWNER])
  })
})

describe('bits Second Life drops from a request', () => {
  // In-world: request probe, seated and worn -> 17 (16|1), 8208 (16|8192) and 16 with each of the
  // bits 21 to 31 were granted as 16: llGetPermissions() and run_time_permissions both said 16.
  // Each of 1, 8192 and the bits 21, 25, 29, 30 and 31 alone behaved as a request for 0.
  it.each([1, 8192, 1 << 21, 1 << 25, 1 << 29, 1 << 30, 1 << 31])('ignores bit %i in a sitter\'s request', async bit => {
    const f = await fixture('seated', [ANIMATION | bit, bit])
    f.ask(2)
    expect(f.script.global('sync')).toEqual([16, 0])
    expect(f.script.global('events')).toEqual([16, 0])
    expect(f.script.permissionRequests.map(r => r.permissions)).toEqual([16, 0])
  })

  // In-world: probes asked their standing owner for 8208 (16|8192), 2097168 (16|bit 21), 17,
  // 4194320 (16|bit 22) and -2147483632 (16|bit 31) -> each dialog asked for 16 alone, and Yes fired
  // run_time_permissions(16). The request probe's standing run of 8192 alone raised no dialog
  // and no event.
  it.each([1, 8192, 1 << 21, 1 << 22, 1 << 31])('drops bit %i from a request that goes to a dialog', async bit => {
    const f = await fixture('standing', [ANIMATION | bit, bit])
    f.ask(2)
    expect(f.script.permissionRequests).toEqual([{ agent: OWNER, permissions: 16, answered: false }])
    f.script.grantPermissions()
    expect(f.script.global('events')).toEqual([16])
  })
})

describe('requests left waiting when another is answered', () => {
  // In-world: a seated probe asked for 128 (dialog), then for 16 (granted at once). Answering the
  // 128 dialog afterwards, Yes on one probe and No on another, fired nothing and left
  // llGetPermissions() at 16.
  it('stops waiting on a dialog when a later request is granted automatically', async () => {
    const f = await fixture('seated', [LINKS, ANIMATION])
    f.ask(2)
    expect(f.script.permissionRequests.map(r => r.answered)).toEqual([false, true])
    expect(() => f.script.grantPermissions()).toThrow('no pending permission request')
    expect(() => f.script.denyPermissions()).toThrow('no pending permission request')
    f.script.grantPermissions(undefined, f.script.permissionRequests[0])
    expect(f.script.global('events')).toEqual([16])
    expect(f.held()).toEqual([16, OWNER])
  })

  // In-world: a seated probe asked for 128 (dialog), then for 0 -> run_time_permissions(0) fired,
  // and Yes on the 128 dialog afterwards fired nothing.
  it('drops a waiting request when a sitter is then asked for nothing', async () => {
    const f = await fixture('seated', [LINKS, 0])
    f.ask(2)
    expect(f.script.global('events')).toEqual([0])
    expect(() => f.script.grantPermissions()).toThrow('no pending permission request')
    expect(f.script.global('events')).toEqual([0])
  })

  // In-world: a probe asked its standing owner for 128 and then for 16, leaving both dialogs open.
  // Whichever dialog was answered Yes first fired run_time_permissions with its own bits; the
  // answer to the other fired nothing and changed nothing.
  it.each([[0, 128], [1, 16]])('acts on the first answer only (request %i first)', async (first, bits) => {
    const f = await fixture('standing', [LINKS, ANIMATION])
    f.ask(2)
    const [older, newer] = f.script.permissionRequests
    f.script.grantPermissions(undefined, first === 0 ? older : newer)
    expect(f.script.global('events')).toEqual([bits])
    expect(f.script.permissionRequests.map(r => r.answered)).toEqual([first === 0, first === 1])
    f.script.grantPermissions(undefined, first === 0 ? newer : older)
    expect(f.script.global('events')).toEqual([bits])
    expect(f.script.permissionRequests.map(r => r.answered)).toEqual([true, true])
  })

  // In-world: the same two dialogs, with No on one first (the older on one probe, the newer on
  // another) -> run_time_permissions(0) fired once, and Yes on the other dialog then did nothing.
  it.each([0, 1])('ignores the other dialog when request %i is denied first', async first => {
    const f = await fixture('standing', [LINKS, ANIMATION])
    f.ask(2)
    const requests = f.script.permissionRequests
    f.script.denyPermissions(requests[first])
    expect(f.script.global('events')).toEqual([0])
    expect(() => f.script.grantPermissions()).toThrow('no pending permission request')
    f.script.grantPermissions(undefined, requests[1 - first])
    expect(f.script.global('events')).toEqual([0])
    expect(() => f.script.grantPermissions(undefined, requests[1 - first])).toThrow('no pending permission request')
  })

  it('refuses to answer a request that is not one of the script\'s', async () => {
    const f = await fixture('standing', [ANIMATION])
    f.ask()
    expect(() => f.script.grantPermissions(undefined, { agent: OWNER, permissions: 16, answered: false })).toThrow('no pending permission request')
    expect(f.script.permissionRequests[0]!.answered).toBe(false)
  })
})

describe('autoGrantPermissions', () => {
  it("grants nothing with 'none'", async () => {
    const f = await fixture('seated', [ANIMATION])
    f.script.autoGrantPermissions = 'none'
    f.ask()
    expect(f.script.global('events')).toEqual([])
    f.script.denyPermissions()
    expect(f.script.global('events')).toEqual([0])
  })

  it('lets a function decide each request', async () => {
    const f = await fixture('standing', [DEBIT, ANIMATION])
    const seen: unknown[] = []
    f.script.autoGrantPermissions = request => {
      seen.push(request)
      return request.permissions === DEBIT
    }
    f.ask(2)
    expect(seen).toEqual([{ agent: OWNER, permissions: DEBIT }, { agent: OWNER, permissions: ANIMATION }])
    expect(f.script.global('events')).toEqual([DEBIT])
    expect(f.script.autoGrantPermissions).toBeTypeOf('function')
  })

  it('follows the world setting unless the script has its own', async () => {
    const world = new World({ autoGrantPermissions: 'none' })
    const f = await fixture('seated', [ANIMATION, ANIMATION], { world })
    expect(f.script.autoGrantPermissions).toBe('none')
    f.ask()
    expect(f.script.global('events')).toEqual([])
    f.script.autoGrantPermissions = 'sl'
    f.ask()
    expect(f.script.global('events')).toEqual([16])
    world.autoGrantPermissions = () => true
    expect(f.script.autoGrantPermissions).toBe('sl')
  })

  // A request for nothing never reaches a dialog, so no setting can hold it back or force it.
  it('leaves requests for no permissions to the simulator rule', async () => {
    const seated = await fixture('seated', [0])
    seated.script.autoGrantPermissions = 'none'
    seated.ask()
    expect(seated.script.global('events')).toEqual([0])
    const standing = await fixture('standing', [0])
    standing.script.autoGrantPermissions = () => true
    standing.ask()
    expect(standing.script.global('events')).toEqual([])
  })

  it('says why there is nothing to answer after an automatic grant', async () => {
    const f = await fixture('seated', [ANIMATION])
    expect(() => f.script.grantPermissions()).toThrow(/^no pending permission request$/)
    f.ask()
    expect(() => f.script.grantPermissions()).toThrow('granted automatically')
  })

  it('keeps the setting on copies of the script', async () => {
    const f = await fixture('seated', [ANIMATION])
    f.script.autoGrantPermissions = 'none'
    expect(f.script.copyTo(f.linkset.prims[0]!).autoGrantPermissions).toBe('none')
    expect(f.script.copyTo(f.linkset.prims[0]!, { fresh: true }).autoGrantPermissions).toBe('none')
  })
})

describe('the reported script', () => {
  it('announces the grant when an avatar sits on an SLua seat', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const bob = world.addAvatar({ region: 'home', key: BOB, username: 'bob' })
    const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'seat', source: { filename: 'seat.luau', source: `
      ll.SitTarget(vector(0, 0, 0.5), ZERO_ROTATION)
      LLEvents:on("changed", function(change: number)
          if bit32.btest(change, CHANGED_LINK) and ll.AvatarOnSitTarget() ~= NULL_KEY then
              ll.RequestPermissions(ll.AvatarOnSitTarget(), PERMISSION_TRIGGER_ANIMATION)
          end
      end)
      LLEvents:on("run_time_permissions", function(perm: number)
          ll.OwnerSay("granted " .. perm)
      end)
    ` } }] }] })
    const seat = scripts.seat!
    seat.start()
    world.sitAvatar(bob, linkset.prims[0]!)
    linkset.advanceTime(1_000)
    expect(seat.autoGrantPermissions).toBe('sl')
    expect(seat.chat.map(line => line.text)).toContain('granted 16')
    seat.autoGrantPermissions = 'none'
    expect(seat.copyTo(linkset.prims[0]!).autoGrantPermissions).toBe('none')
  })
})
