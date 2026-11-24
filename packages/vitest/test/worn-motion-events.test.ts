import { describe, expect, it } from 'vitest'
import { DEBUG_CHANNEL, loadLinkset, PERM_MODIFY, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Moving_start
// https://wiki.secondlife.com/wiki/Moving_end
// https://wiki.secondlife.com/wiki/LlMoveToTarget
// https://wiki.secondlife.com/wiki/LlStopMoveToTarget
// https://wiki.secondlife.com/wiki/LlLookAt
// https://wiki.secondlife.com/wiki/LlRotLookAt
// https://wiki.secondlife.com/wiki/LlBreakLink
// https://wiki.secondlife.com/wiki/LlBreakAllLinks
// In-world: SLua Tideland on the Aditi beta grid (2026-11-24), Mono. The probe avatar stood on
// a platform wearing a two-prim object on the chest (a 0.3 m box root on the point, a 0.2 m box
// child at <0.3, 0, 0>) and a 0.2 m box on the left hand. Each prim ran one script, driven by the
// avatar's chat, that logged every moving_start, moving_end and changed with llGetTimestamp and
// read the avatar's OBJECT_POS and OBJECT_ROT.

const OWNER = '00000000-0000-4000-8000-000000000673'
const v = (x: number, y: number, z: number) => ({ x, y, z })
const turn = (degrees: number) => ({ x: 0, y: 0, z: Math.sin(degrees * Math.PI / 360), s: Math.cos(degrees * Math.PI / 360) })
const AT = v(116, 48, 1997.421)

const logger = (body = '') => ({ source: `list seen; list out;
  default {
    state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
    run_time_permissions(integer p) { ${body} llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
    moving_start() { seen += ["ms"]; }
    moving_end() { seen += ["me"]; }
    changed(integer c) { if (c & CHANGED_TELEPORT) seen += ["tp"]; }
  }` })

async function worn(opts: { root?: string, child?: string, hand?: string, rotation?: number } = {}) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({
    region: 'home', key: OWNER, username: 'probe', size: v(0.45, 0.6, 1.70672), position: AT,
    rotation: turn(opts.rotation ?? 90),
  })
  const chest = await loadLinkset({
    world, region: 'home', owner: OWNER, position: v(116, 50, 1997.4),
    prims: [
      { name: 'chest', scripts: [{ name: 'root', source: logger(opts.root) }] },
      { name: 'chest child', scripts: [{ name: 'child', source: logger(opts.child) }] },
    ],
  })
  chest.linkset.prims[1]!.params.position = v(0.3, 0, 0)
  chest.linkset.attachToAvatar(OWNER, 1)
  chest.linkset.prims[0]!.params.position = v(0, 0, 0)
  const hand = await loadLinkset({
    world, region: 'home', owner: OWNER, position: v(117, 50, 1997.4),
    prims: [{ name: 'hand', scripts: [{ name: 'hand', source: logger(opts.hand) }] }],
  })
  hand.linkset.attachToAvatar(OWNER, 5)
  const scripts = { root: chest.scripts.root!, child: chest.scripts.child!, hand: hand.scripts.hand! }
  for (const s of Object.values(scripts)) s.start()
  const run = (...names: Array<keyof typeof scripts>) => { for (const n of names) scripts[n].grantPermissions() }
  const seen = () => Object.fromEntries(Object.entries(scripts).map(([n, s]) => [n, s.global('seen')]))
  const clear = () => { for (const s of Object.values(scripts)) s.setGlobal('seen', []) }
  return { world, avatar, chest: chest.linkset, hand: hand.linkset, scripts, run, seen, clear }
}

const all = (events: string[]) => ({ root: events, child: events, hand: events })
const close = (p: { x: number, y: number, z: number }, x: number, y: number, z: number, digits = 3) => {
  expect(p.x).toBeCloseTo(x, digits)
  expect(p.y).toBeCloseTo(y, digits)
  expect(p.z).toBeCloseTo(z, digits)
}

describe('moving events in worn objects', () => {
  // In-world: walking forward for 1 s gave moving_start 0.22 s after the key went down and
  // moving_end 0.54 s after it came up, in every prim of both worn objects.
  it('tells every worn prim when the wearer moves', async () => {
    const f = await worn()
    f.chest.advanceTime(100)
    f.avatar.position = v(116, 49.5, 1997.421)
    f.chest.advanceTime(100)
    expect(f.seen()).toEqual(all(['ms', 'me']))
  })

  // In-world: turning 180 degrees in place gave moving_start and moving_end in every worn prim.
  it('tells every worn prim when the wearer turns', async () => {
    const f = await worn()
    f.chest.advanceTime(100)
    f.avatar.rotation = turn(-90)
    f.chest.advanceTime(100)
    expect(f.seen()).toEqual(all(['ms', 'me']))
  })

  it('says nothing when the wearer is set where it already is', async () => {
    const f = await worn()
    f.chest.advanceTime(100)
    f.avatar.position = { ...AT }
    f.avatar.rotation = turn(90)
    f.chest.advanceTime(100)
    expect(f.seen()).toEqual(all([]))
  })

  // In-world: a teleport within the region gave moving_start, changed(CHANGED_TELEPORT) 21 ms
  // later and moving_end 0.42 s after that.
  it('wraps a teleport within the region in moving_start and moving_end', async () => {
    const f = await worn()
    f.chest.advanceTime(100)
    expect(f.world.teleportAvatar(f.avatar, v(116, 45, 1997.5))).toBe(true)
    f.chest.advanceTime(100)
    expect(f.seen()).toEqual(all(['ms', 'tp', 'me']))
  })

  // In-world: sitting on a box 4 m away and sitting on the ground gave no moving event; standing
  // from either gave moving_start and moving_end 67 ms apart.
  it('says nothing when the wearer sits and tells it when it stands', async () => {
    const f = await worn()
    const seat = await loadLinkset({ world: f.world, region: 'home', owner: OWNER, position: v(116.5, 44, 1996.75), prims: [{ name: 'seat' }] })
    f.chest.advanceTime(100)
    expect(f.world.sitAvatar(f.avatar, seat.prims[0]!)).toBe(true)
    f.chest.advanceTime(100)
    expect(f.seen()).toEqual(all([]))
    f.world.standAvatar(f.avatar)
    f.chest.advanceTime(100)
    expect(f.seen()).toEqual(all(['ms', 'me']))
    f.clear()
    f.world.sitAvatarOnGround(f.avatar)
    f.chest.advanceTime(100)
    expect(f.seen()).toEqual(all([]))
    f.world.standAvatar(f.avatar)
    f.chest.advanceTime(100)
    expect(f.seen()).toEqual(all(['ms', 'me']))
  })

  // In-world: llMoveToTarget 2 m away with tau 0.3 gave moving_start as the wearer set off and
  // moving_end 3.16 s later, 0.02 mm from the target; with tau 1.5 moving_end came after 7.02 s,
  // 2 cm short. Here moving_end comes once the wearer is at the target to single precision.
  it('tells every worn prim when a move target takes the wearer and when it gets there', async () => {
    const f = await worn({ root: 'llMoveToTarget(llGetPos() + <0, 2, 0>, 0.3);' })
    f.run('root')
    f.chest.advanceTime(1000)
    expect(f.seen()).toEqual(all(['ms']))
    f.chest.advanceTime(5000)
    expect(f.seen()).toEqual(all(['ms', 'me']))
    close(f.avatar.position, 116, 50, Math.fround(AT.z), 5)
  })
})

describe('move targets in two worn objects', () => {
  // In-world: targets 1 m apart, both with tau 0.3, from the chest and the hand left the wearer
  // at <116.85260, 43.82253>, halfway between them. Targets <117.85, 43.82> with tau 0.3 and
  // <116.85, 45.82> with tau 0.9 left it at <117.60010, 44.31989>: each target pulls in
  // proportion to 1 / tau.
  it('takes the wearer to the targets averaged by 1 / tau', async () => {
    const f = await worn({
      root: `llMoveToTarget(<117.85, 43.82, ${AT.z}>, 0.3);`,
      hand: `llMoveToTarget(<116.85, 45.82, ${AT.z}>, 0.9);`,
    })
    f.run('root', 'hand')
    f.chest.advanceTime(10000)
    close(f.avatar.position, 117.6, 44.32, AT.z)
  })

  // In-world: with targets in the chest and the hand, llStopMoveToTarget in either left the
  // wearer where it was, 0.5 m from the other target, for 3 s and more. After the avatar walked
  // a little, the other target took it back (to <118.5996, 45.2999> for a target at
  // <118.6, 45.3>).
  it('holds the wearer still when one of two targets stops, until something else moves it', async () => {
    const f = await worn({
      root: `llMoveToTarget(<117, 47, ${AT.z}>, 0.3);`,
      hand: `if (llGetListLength(out) == 0) llMoveToTarget(<116, 48, ${AT.z}>, 0.3); else llStopMoveToTarget(); out += [1];`,
    })
    f.run('root', 'hand')
    f.chest.advanceTime(10000)
    close(f.avatar.position, 116.5, 47.5, AT.z)
    f.run('hand')
    f.chest.advanceTime(5000)
    close(f.avatar.position, 116.5, 47.5, AT.z)
    f.avatar.position = v(116.5, 47, AT.z)
    f.chest.advanceTime(10000)
    close(f.avatar.position, 117, 47, AT.z)
  })

  // In-world: targets <117, 47> (chest) and <116, 48> (hand) left the wearer at <116.5, 47.5>;
  // after the hand stopped, a new hand target <116, 49> took it to <116.5, 47.99998>: the
  // chest's target pulled again too.
  it('wakes every held target with a new one', async () => {
    const f = await worn({
      root: `llMoveToTarget(<117, 47, ${AT.z}>, 0.3);`,
      hand: `integer n = llGetListLength(out); out += [1];
        if (n == 0) llMoveToTarget(<116, 48, ${AT.z}>, 0.3);
        else if (n == 1) llStopMoveToTarget();
        else llMoveToTarget(<116, 49, ${AT.z}>, 0.3);`,
    })
    f.run('root', 'hand')
    f.chest.advanceTime(10000)
    f.run('hand')
    f.chest.advanceTime(3000)
    close(f.avatar.position, 116.5, 47.5, AT.z)
    f.run('hand')
    f.chest.advanceTime(10000)
    close(f.avatar.position, 116.5, 48, AT.z)
  })
})

describe('move targets and sitting', () => {
  // In-world: sitting on the ground, llMoveToTarget(<+1, 0, 0>, 0.3) left the wearer where it sat
  // for 3 s. When it stood with the target still set, the target took it there.
  it('takes a ground sitter to the target once it stands', async () => {
    const f = await worn({ root: 'llMoveToTarget(llGetPos() + <1, 0, 0>, 0.3);' })
    f.world.sitAvatarOnGround(f.avatar)
    f.run('root')
    f.chest.advanceTime(3000)
    close(f.avatar.position, AT.x, AT.y, AT.z, 6)
    f.world.standAvatar(f.avatar)
    f.chest.advanceTime(5000)
    close(f.avatar.position, AT.x + 1, AT.y, AT.z)
  })

  // In-world: with a worn target holding the wearer where it stood, a ground sit 3 m away that
  // the viewer walked to failed after 3.4 s: the wearer got 0.25 m and was pulled back.
  it('stops a sit autopilot while a move target holds the wearer', async () => {
    const f = await worn({ root: 'llMoveToTarget(llGetPos(), 0.3);' })
    const seat = await loadLinkset({ world: f.world, region: 'home', owner: OWNER, position: v(116, 45, 1997), prims: [{ name: 'seat' }] })
    f.world.setSitResponse(seat.prims[0]!, { position: v(0, 0, 1), autopilot: { durationMs: 1000, success: true } })
    f.run('root')
    f.chest.advanceTime(100)
    expect(f.world.userSitAvatar(f.avatar, seat.prims[0]!)).toBe(true)
    f.chest.advanceTime(2000)
    expect(f.avatar.sittingOn).toBe(null)
  })
})

describe('look targets in a worn object', () => {
  const euler = (r: { x: number, y: number, z: number, s: number }) => {
    const deg = 180 / Math.PI
    return [Math.atan2(2 * (r.s * r.x + r.y * r.z), 1 - 2 * (r.x * r.x + r.y * r.y)) * deg,
      Math.asin(Math.max(-1, Math.min(1, 2 * (r.s * r.y - r.z * r.x)))) * deg,
      Math.atan2(2 * (r.s * r.z + r.x * r.y), 1 - 2 * (r.y * r.y + r.z * r.z)) * deg]
  }
  const near = (a: number[], b: number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, 1))

  // In-world, wearer facing -161 degrees: llRotLookAt(45 degrees about z) in the root set the
  // root's rotation on its point to <0, 0, 45>, and llLookAt 5 m east of the wearer set it to
  // <0, 90, 0>. llRotLookAt(45) in the child set the child's rotation to <0, 0, 45>. The wearer
  // did not turn, and the root's llGetRot still read the wearer's rotation.
  it('turns the prim on its point, not the wearer', async () => {
    const rotation = -161
    const look = (lsl: string) => `vector av = llList2Vector(llGetObjectDetails(llGetOwner(), [OBJECT_POS]), 0); ${lsl}`
    const rotLook = await worn({ rotation, root: 'llRotLookAt(llEuler2Rot(<0, 0, 45> * DEG_TO_RAD), 1, 1);', child: 'llRotLookAt(llEuler2Rot(<0, 0, 45> * DEG_TO_RAD), 1, 1);' })
    rotLook.run('root', 'child')
    rotLook.chest.advanceTime(3000)
    near(euler(rotLook.chest.prims[0]!.params.rotation), [0, 0, 45])
    near(euler(rotLook.chest.prims[1]!.params.rotation), [0, 0, 45])
    near(euler(rotLook.avatar.rotation), [0, 0, rotation])
    const lookAt = await worn({ rotation, root: look('llLookAt(av + <5, 0, 0>, 1, 1);') })
    lookAt.run('root')
    lookAt.chest.advanceTime(3000)
    near(euler(lookAt.chest.prims[0]!.params.rotation), [0, 90, 0])
    near(euler(lookAt.avatar.rotation), [0, 0, rotation])
  })
})

describe('break-links errors', () => {
  const PERM = 'Script trying to break links but PERMISSION_CHANGE_LINKS permission not set!'
  const EDIT = 'Unlink failed: no edit permissions.'

  async function object(prims: number, body: string, opts: { grant: boolean, noModify?: boolean, from?: 'root' | 'child' }) {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    world.addAvatar({ region: 'home', key: OWNER, username: 'probe', position: v(116, 48, 1997.42) })
    const script = { name: 'breaker', source: { source: `default {
      state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
      run_time_permissions(integer p) { ${body} } }` } }
    const from = opts.from ?? 'root'
    const loaded = await loadLinkset({
      world, region: 'home', owner: OWNER, position: v(114.8, 50, 1997.45),
      prims: Array.from({ length: prims }, (_, i) => ({ name: i ? `child ${i}` : 'nomod', scripts: (i === 0) === (from === 'root') ? [script] : [] })),
    })
    if (opts.noModify) for (const prim of loaded.linkset.prims) prim.permMask = { ...prim.permMask, owner: prim.permMask.owner & ~PERM_MODIFY }
    const listener = await loadLinkset({
      world, region: 'home', owner: OWNER, position: v(115, 51.5, 1997.3),
      prims: [{ name: 'listener', scripts: [{ name: 'listen', source: { source: 'list heard; default { state_entry() { llListen(DEBUG_CHANNEL, "", "", ""); } listen(integer c, string n, key i, string m) { heard += m; } }' } }] }],
    })
    listener.scripts.listen!.start()
    const s = loaded.scripts.breaker!
    s.start()
    if (opts.grant) s.grantPermissions()
    else s.denyPermissions()
    loaded.linkset.advanceTime(1000)
    return {
      errors: s.chat.filter(m => m.channel === DEBUG_CHANNEL).map(m => m.text),
      heard: listener.scripts.listen!.global('heard'),
      prims: loaded.linkset.prims.length,
    }
  }

  // In-world: a lone prim without PERMISSION_CHANGE_LINKS gave the permission error for
  // llBreakLink(2), (1), (0), (LINK_THIS) and (-1), and for llBreakAllLinks.
  it('tells the owner a lone prim lacks the permission, whatever the link', async () => {
    const r = await object(1, 'llBreakLink(2); llBreakLink(1); llBreakLink(0); llBreakLink(LINK_THIS); llBreakLink(-1); llBreakAllLinks();', { grant: false })
    expect(r.errors).toEqual(Array(6).fill(PERM))
  })

  // In-world: a two-prim object made no-modify for its owner by next-owner permissions and a
  // gift from the other probe avatar. Without the permission, llBreakLink(2) and llBreakAllLinks
  // in the root gave the permission error, as in a modifiable object.
  it('checks the permission before the modify right', async () => {
    const r = await object(2, 'llBreakLink(2); llBreakAllLinks();', { grant: false, noModify: true })
    expect(r.errors).toEqual([PERM, PERM])
  })

  // In-world: with the permission granted, llBreakLink(2), (1) and (LINK_THIS) and llBreakAllLinks
  // in the root each told the owner "Unlink failed: no edit permissions."; llBreakLink(0) and
  // (5) said nothing. A DEBUG_CHANNEL listener 1.5 m away heard nothing, and the object stayed
  // whole.
  it('tells the owner it cannot edit a no-modify object, for a link that is there', async () => {
    const r = await object(2, 'llBreakLink(2); llBreakLink(0); llBreakLink(5); llBreakLink(1); llBreakLink(LINK_THIS); llBreakAllLinks();', { grant: true, noModify: true })
    expect(r.errors).toEqual([EDIT, EDIT, EDIT, EDIT])
    expect(r.heard).toEqual([])
    expect(r.prims).toBe(2)
  })

  // In-world: from the child, llBreakLink(1) and llBreakAllLinks added the root's name and
  // position: "Unlink failed: no edit permissions. {RootName probe issue-673 nomod, RootPosition
  // { 114.8, 50, 1997.45 }}".
  it('names the root when a child of a no-modify object tries', async () => {
    const r = await object(2, 'llBreakLink(1); llBreakAllLinks();', { grant: true, noModify: true, from: 'child' })
    const suffix = ' {RootName nomod, RootPosition { 114.8, 50, 1997.45 }}'
    expect(r.errors).toEqual([EDIT + suffix, EDIT + suffix])
  })
})
