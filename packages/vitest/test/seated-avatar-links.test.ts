import { describe, expect, it } from 'vitest'
import { loadLinkset, NULL_KEY, World } from '../src/index.js'

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'
const ROOT = '11111111-2222-3333-4444-555555555555'
const CHILD = '22222222-3333-4444-5555-666666666666'
const EXTRA = '33333333-4444-5555-6666-777777777777'
const SIZE = { x: 0.45, y: 0.6, z: 1.653822 }
const ZERO = { x: 0, y: 0, z: 0 }
const IDENTITY = { x: 0, y: 0, z: 0, s: 1 }
const yaw = (degrees: number) => {
  const half = (degrees * Math.PI) / 360
  return { x: 0, y: 0, z: Math.sin(half), s: Math.cos(half) }
}
const near = (v: Record<string, number>) =>
  Object.fromEntries(Object.entries(v).map(([k, n]) => [k, expect.closeTo(n, 4)]))

// The frames of the in-world probe linkset: a root turned 40 degrees about X and
// 30 about Z, child link 2 turned 50 degrees about Y in the region, and a sit
// target off to the side and pitched. None of these rotations commute, so a
// swapped product fails the tests below.
const ROOT_ROT = { x: 0.330366, y: -0.088521, z: 0.24321, s: 0.907673 }
const CHILD_POS = { x: 0.229813, y: 0.398047, z: -0.385672 }
const CHILD_ROT = { x: -0.196628, y: 0.463827, z: -0.360042, s: 0.785221 }
const TARGET = { x: 0.3, y: 0.2, z: 0.75 }
const TARGET_ROT = { x: Math.sin(0.25), y: 0, z: 0, s: Math.cos(0.25) }

const CHANGED_COLOR = 2
const CHANGED_LINK = 32
const CHANGED_MEDIA = 2048

/**
 * A seat with a script in every prim. Touching a prim runs `body` in its
 * script; each script logs its changed and link_message events.
 */
async function fixture(body: string, opts: { prims?: number; target?: 'root' | 'child' | 'none'; childBody?: string } = {}) {
  const count = opts.prims ?? 1
  const target = opts.target ?? 'root'
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({
    region: 'home', key: AVATAR, name: 'Test Resident', username: 'test', size: SIZE,
    position: { x: 110, y: 50, z: 20 },
  })
  const source = (run: string) => `key A = "${AVATAR}"; list out; list log; list msgs;
    default {
      changed(integer c) { log += [c, llGetLinkNumber(), llGetNumberOfPrims()]; }
      link_message(integer sender, integer num, string str, key id) { msgs += [sender, num]; }
      touch_start(integer n) { integer a = llGetNumberOfPrims(); ${run} }
    }`
  const { linkset, scripts } = await loadLinkset({
    world, region: 'home', owner: AVATAR, position: { x: 116, y: 50, z: 20 },
    prims: Array.from({ length: count }, (_, i) => ({
      key: i === 0 ? ROOT : i === 1 ? CHILD : undefined,
      name: i === 0 ? 'Root' : `Child ${i + 1}`,
      scripts: [{ name: `p${i}`, source: { source: source(i === 0 ? body : (opts.childBody ?? '')) } }],
    })),
  })
  const root = linkset.prims[0]!
  root.params.rotation = ROOT_ROT
  for (let i = 1; i < count; i++) {
    linkset.prims[i]!.params.position = { x: CHILD_POS.x * i, y: CHILD_POS.y * i, z: CHILD_POS.z * i }
    linkset.prims[i]!.params.rotation = CHILD_ROT
  }
  const seat = target === 'child' ? linkset.prims[1]! : root
  if (target !== 'none') seat.params.sitTarget = { enabled: true, offset: TARGET, rotation: TARGET_ROT }
  for (const s of Object.values(scripts)) s.start()
  const script = scripts.p0!
  const touch = (link = count === 1 && linkset.sitters().length === 0 ? 0 : 1) => {
    linkset.touch(link, { avatar: { key: AVATAR, name: 'Test Resident' } })
    return script.global('out')
  }
  const sit = () => {
    expect(world.sitAvatar(avatar, seat)).toBe(true)
    linkset.advanceTime(100)
  }
  const stand = () => {
    world.standAvatar(avatar)
    linkset.advanceTime(100)
  }
  return { world, avatar, linkset, scripts, script, root, touch, sit, stand }
}

const COUNTS = 'out = [llGetLinkNumber(), llGetNumberOfPrims(), llGetObjectPrimCount(llGetKey())];'
const LINKS = (from: number, to: number) =>
  `out = []; integer i; for (i = ${from}; i <= ${to}; ++i) out += [llGetLinkKey(i), llGetLinkName(i)];`

// https://wiki.secondlife.com/wiki/LlGetNumberOfPrims
// https://wiki.secondlife.com/wiki/LlGetLinkKey
// https://wiki.secondlife.com/wiki/LlGetLinkNumber
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm 7.3.0, 2026-11-13)
// by seating one avatar on scripted probe objects: a lone box and a three-prim
// linkset, each with and without a sit target, and linksets whose sit target
// is on a child. The probes read every link function before sitting, in
// changed() on sitting, on touch while seated, and in changed() on standing.
// Every "In-world:" note in this file is from those probes.
describe('a seated avatar is a link of the object', () => {
  // In-world: lone box -> llGetLinkNumber 0, llGetNumberOfPrims 1 before sitting;
  // 1 and 2 while seated; 0 and 1 again after standing. llGetObjectPrimCount stays 1.
  // The same with and without a sit target.
  it.each(['root', 'none'] as const)('makes a lone prim link 1 while an avatar sits on it (sit target: %s)', async (target) => {
    const f = await fixture(COUNTS, { target })
    expect(f.touch()).toEqual([0, 1, 1])
    f.sit()
    expect(f.touch()).toEqual([1, 2, 1])
    f.stand()
    expect(f.touch()).toEqual([0, 1, 1])
  })

  // In-world: three-prim linkset -> root stays link 1, children 2 and 3, and
  // llGetNumberOfPrims goes 3 -> 4 -> 3. llGetObjectPrimCount stays 3.
  it.each(['root', 'child', 'none'] as const)('adds the avatar after the prims of a linkset (sit target: %s)', async (target) => {
    const f = await fixture(COUNTS, { prims: 3, target })
    expect(f.touch()).toEqual([1, 3, 3])
    f.sit()
    expect(f.touch()).toEqual([1, 4, 3])
    expect(f.linkset.prims.map((p) => p.linkNumber)).toEqual([1, 2, 3])
    f.stand()
    expect(f.touch()).toEqual([1, 3, 3])
  })

  // In-world: seated on a lone box, llGetLinkKey/llGetLinkName give NULL_KEY for
  // link 0, the box for link 1, the avatar for link 2 and NULL_KEY for link 3.
  // Before sitting and after standing link 0 is the box and links 1 and 2 are NULL_KEY.
  it('reads the avatar key and name at its link number on a lone prim', async () => {
    const f = await fixture(LINKS(0, 3))
    expect(f.touch()).toEqual([ROOT, 'Root', NULL_KEY, NULL_KEY, NULL_KEY, NULL_KEY, NULL_KEY, NULL_KEY])
    f.sit()
    expect(f.touch()).toEqual([NULL_KEY, NULL_KEY, ROOT, 'Root', AVATAR, 'Test Resident', NULL_KEY, NULL_KEY])
    f.stand()
    expect(f.touch()).toEqual([ROOT, 'Root', NULL_KEY, NULL_KEY, NULL_KEY, NULL_KEY, NULL_KEY, NULL_KEY])
  })

  // In-world: seated on a three-prim linkset, link 4 is the avatar and link 5 NULL_KEY.
  it('reads the avatar key and name after the prims of a linkset', async () => {
    const f = await fixture(LINKS(3, 5), { prims: 3 })
    f.sit()
    expect(f.touch()).toEqual([f.linkset.prims[2]!.key, 'Child 3', AVATAR, 'Test Resident', NULL_KEY, NULL_KEY])
  })

  // In-world: llGetLinkKey and llGetLinkName with a negative link other than
  // LINK_THIS (-1, -2, -3, -5, -100 and the smallest integer) read the first
  // link that is not the caller: link 2 from the root, the root from children 2
  // and 3, the avatar from a seated lone box, and NULL_KEY from a lone box
  // nobody sits on. LINK_THIS reads the calling prim.
  it('reads the first other link for negative link numbers', async () => {
    const READ = 'out = [llGetLinkKey(LINK_THIS), llGetLinkKey(-1), llGetLinkName(-2), llGetLinkKey(-3), llGetLinkName(-5), llGetLinkKey(-100), llGetLinkKey(0x80000000)];'
    const lone = await fixture(READ)
    expect(lone.touch()).toEqual([ROOT, NULL_KEY, NULL_KEY, NULL_KEY, NULL_KEY, NULL_KEY, NULL_KEY])
    lone.sit()
    expect(lone.touch()).toEqual([ROOT, AVATAR, 'Test Resident', AVATAR, 'Test Resident', AVATAR, AVATAR])
    const set = await fixture(READ, { prims: 3, childBody: READ })
    set.sit()
    expect(set.touch()).toEqual([ROOT, CHILD, 'Child 2', CHILD, 'Child 2', CHILD, CHILD])
    set.linkset.touch(2)
    expect(set.scripts.p1!.global('out')).toEqual([CHILD, ROOT, 'Root', ROOT, 'Root', ROOT, ROOT])
    set.linkset.touch(3)
    expect(set.scripts.p2!.global('out')).toEqual([set.linkset.prims[2]!.key, ROOT, 'Root', ROOT, 'Root', ROOT, ROOT])
  })

  // In-world: llGetAgentSize(llGetLinkKey(n)) is the avatar's size at the avatar
  // link and ZERO_VECTOR at a prim.
  it('tells the avatar link from the prims by agent size', async () => {
    const f = await fixture(`integer i = llGetNumberOfPrims(); out = [];
      while (llGetAgentSize(llGetLinkKey(i)) != ZERO_VECTOR) { out += llGetLinkKey(i); --i; }
      out += i;`, { prims: 3 })
    f.sit()
    expect(f.touch()).toEqual([AVATAR, 3])
  })

  // In-world: llGetObjectLinkKey(llGetKey(), n) gives the root for 0 and 1, the
  // avatar at its link number, and NULL_KEY past it and for LINK_SET.
  it('reads the avatar through llGetObjectLinkKey', async () => {
    const f = await fixture('key k = llGetKey(); out = [llGetObjectLinkKey(k, 0), llGetObjectLinkKey(k, 1), llGetObjectLinkKey(k, 2), llGetObjectLinkKey(k, 3), llGetObjectLinkKey(k, LINK_SET)];')
    f.sit()
    expect(f.touch()).toEqual([ROOT, ROOT, AVATAR, NULL_KEY, NULL_KEY])
  })

  // In-world: on a seated lone box llGetObjectDetails gives OBJECT_LINK_NUMBER 1
  // for the box and 2 for the avatar, and OBJECT_ROOT the box for both.
  // llGetObjectPrimCount(avatar key) is 0 while seated.
  it('reports object details link numbers that match', async () => {
    const f = await fixture('out = llGetObjectDetails(llGetKey(), [OBJECT_LINK_NUMBER]) + llGetObjectDetails(A, [OBJECT_LINK_NUMBER, OBJECT_ROOT]) + [llGetObjectPrimCount(A)];')
    expect(f.touch()).toEqual([0, 0, AVATAR, 0])
    f.sit()
    expect(f.touch()).toEqual([1, 2, ROOT, 0])
  })

  // In-world: the avatar link has no sides, and llAvatarOnLinkSitTarget reads
  // NULL_KEY for it and for link 0; link 1 and LINK_THIS give the sitter.
  // llGetLinkSitFlags is 0 for the avatar link (PRIM_SIT_FLAGS reads 2) and
  // llIsLinkGLTFMaterial FALSE.
  it('has no sides and no sit target of its own', async () => {
    const f = await fixture('out = [llGetLinkNumberOfSides(1), llGetLinkNumberOfSides(2), llAvatarOnLinkSitTarget(0), llAvatarOnLinkSitTarget(1), llAvatarOnLinkSitTarget(2), llAvatarOnLinkSitTarget(LINK_THIS), llAvatarOnSitTarget(), llGetLinkSitFlags(2), llIsLinkGLTFMaterial(2, 0)];')
    f.sit()
    expect(f.touch()).toEqual([6, 0, NULL_KEY, AVATAR, NULL_KEY, AVATAR, AVATAR, 0, 0])
  })

  // In-world: without a sit target the avatar is still link 2 of a lone box,
  // and llAvatarOnSitTarget and llAvatarOnLinkSitTarget read NULL_KEY.
  it('is a link without a sit target', async () => {
    const f = await fixture('out = [llGetNumberOfPrims(), llGetLinkKey(2), llAvatarOnSitTarget(), llAvatarOnLinkSitTarget(1)];', { target: 'none' })
    f.sit()
    expect(f.touch()).toEqual([2, AVATAR, NULL_KEY, NULL_KEY])
  })

  // The issue's script, in SLua.
  it('shows the sitter to an SLua script', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const bob = world.addAvatar({ region: 'home', key: AVATAR, username: 'bob' })
    const { linkset, scripts } = await loadLinkset({ world, region: 'home', prims: [{ scripts: [{ name: 'seat', language: 'slua', source: { source: `
      ll.SitTarget(vector(0, 0, 0.5), ZERO_ROTATION)
      LLEvents:on("changed", function(change: number)
        if bit32.btest(change, CHANGED_LINK) then
          local n = ll.GetNumberOfPrims()
          ll.OwnerSay(n .. " " .. tostring(ll.GetLinkKey(n)) .. " " .. ll.GetObjectPrimCount(ll.GetKey()))
        end
      end)` } }] }] })
    scripts.seat!.start()
    expect(world.sitAvatar(bob, linkset.prims[0]!)).toBe(true)
    linkset.advanceTime(100)
    expect(scripts.seat!).toHaveSaid(0, `2 ${AVATAR} 1`)
  })
})

// https://wiki.secondlife.com/wiki/Changed
// https://wiki.secondlife.com/wiki/LlMessageLinked
// https://wiki.secondlife.com/wiki/LlDetectedLinkNumber
describe('events on an object with a sitter', () => {
  // In-world: sitting and standing each raise changed(32) in the root and in
  // every child; the handlers already see the new link count.
  it('raises CHANGED_LINK in every prim on sit and on stand', async () => {
    const f = await fixture('', { prims: 3 })
    f.sit()
    f.stand()
    expect(f.script.global('log')).toEqual([CHANGED_LINK, 1, 4, CHANGED_LINK, 1, 3])
    expect(f.scripts.p1!.global('log')).toEqual([CHANGED_LINK, 2, 4, CHANGED_LINK, 2, 3])
    expect(f.scripts.p2!.global('log')).toEqual([CHANGED_LINK, 3, 4, CHANGED_LINK, 3, 3])
  })

  // In-world: a lone box reads llGetLinkNumber 1 inside the sit changed() and 0
  // inside the stand changed().
  it('renumbers a lone prim before its changed event runs', async () => {
    const f = await fixture('')
    f.sit()
    f.stand()
    expect(f.script.global('log')).toEqual([CHANGED_LINK, 1, 2, CHANGED_LINK, 0, 1])
  })

  // In-world: an avatar seated on one lone box sat straight on another. The
  // first box got one changed(32) reading link 0 of 1; the second got one
  // changed(32) reading link 1 of 2.
  it('raises one CHANGED_LINK in each object when the avatar changes seats', async () => {
    const f = await fixture('')
    const other = await loadLinkset({ world: f.world, region: 'home', position: { x: 116, y: 51, z: 20 }, prims: [{ scripts: [{ name: 'other', source: { source:
      'list log; default { changed(integer c) { log += [c, llGetLinkNumber(), llGetNumberOfPrims()]; } }' } }] }] })
    other.scripts.other!.start()
    f.sit()
    expect(f.world.sitAvatar(f.avatar, other.prims[0]!)).toBe(true)
    f.linkset.advanceTime(100)
    expect(f.script.global('log')).toEqual([CHANGED_LINK, 1, 2, CHANGED_LINK, 0, 1])
    expect(other.scripts.other!.global('log')).toEqual([CHANGED_LINK, 1, 2])
  })

  // In-world: touching a lone box gives llDetectedLinkNumber 0, and 1 while an
  // avatar sits on it.
  it('reports link 1 for a touch on a seated lone prim', async () => {
    const f = await fixture('out = [llDetectedLinkNumber(0)];')
    expect(f.touch()).toEqual([0])
    f.sit()
    expect(f.touch()).toEqual([1])
  })

  // In-world: from a seated lone box, llMessageLinked to LINK_SET, LINK_ROOT and
  // LINK_THIS came back with sender 1. LINK_ALL_OTHERS, LINK_ALL_CHILDREN, link 0,
  // the avatar link and the link past it delivered nothing.
  it('delivers link messages on a seated lone prim as on a linkset root', async () => {
    const f = await fixture(`llMessageLinked(a, 1, "", ""); llMessageLinked(LINK_SET, 2, "", "");
      llMessageLinked(LINK_ALL_OTHERS, 3, "", ""); llMessageLinked(LINK_ALL_CHILDREN, 4, "", "");
      llMessageLinked(LINK_ROOT, 5, "", ""); llMessageLinked(LINK_THIS, 6, "", "");
      llMessageLinked(0, 7, "", ""); llMessageLinked(a + 1, 8, "", "");`)
    f.sit()
    f.touch()
    f.linkset.advanceTime(100)
    expect(f.script.global('msgs')).toEqual([1, 2, 1, 5, 1, 6])
  })

  // In-world: on a seated three-prim linkset LINK_SET reached links 1-3,
  // LINK_ALL_OTHERS and LINK_ALL_CHILDREN links 2-3; the avatar link reached nobody.
  it('delivers link messages to the prims only', async () => {
    const f = await fixture(`llMessageLinked(a, 1, "", ""); llMessageLinked(LINK_SET, 2, "", "");
      llMessageLinked(LINK_ALL_OTHERS, 3, "", ""); llMessageLinked(LINK_ALL_CHILDREN, 4, "", "");`, { prims: 3 })
    f.sit()
    f.touch()
    f.linkset.advanceTime(100)
    expect(f.script.global('msgs')).toEqual([1, 2])
    expect(f.scripts.p1!.global('msgs')).toEqual([1, 2, 1, 3, 1, 4])
    expect(f.scripts.p2!.global('msgs')).toEqual([1, 2, 1, 3, 1, 4])
  })
})

// https://wiki.secondlife.com/wiki/LlGetLinkPrimitiveParams
describe('reading an avatar link with llGetLinkPrimitiveParams', () => {
  // In-world: the avatar link read PRIM_NAME the avatar's name, PRIM_DESC "",
  // PRIM_SIZE the llGetAgentSize value, PRIM_POS_LOCAL and PRIM_ROT_LOCAL relative
  // to the root, and PRIM_POSITION and PRIM_ROTATION the same as OBJECT_POS and
  // OBJECT_ROT: root position + local position turned by the root, and local
  // rotation times the root's (measured with the rolled root of this fixture).
  // Second Life also seats an avatar above its sit target by an amount that
  // depends on the avatar (0.35 m here); the fixture seats it on the target.
  // So the position literals below are derived from the measured formulas with
  // that offset left out, not read in-world. The rotations are measured.
  it('reads name, size and placement', async () => {
    const f = await fixture('out = llGetLinkPrimitiveParams(a, [PRIM_NAME, PRIM_DESC, PRIM_SIZE, PRIM_POS_LOCAL, PRIM_ROT_LOCAL, PRIM_POSITION, PRIM_ROTATION]) + llGetObjectDetails(A, [OBJECT_POS, OBJECT_ROT]);')
    f.sit()
    const position = near({ x: 116.159808, y: 49.765499, z: 20.782285 })
    const rotation = near({ x: 0.544658, y: -0.025598, z: 0.25755, s: 0.797722 })
    expect(f.touch()).toEqual(['Test Resident', '', SIZE, TARGET, near(TARGET_ROT), position, rotation, position, rotation])
  })

  // In-world: with the root, child link 2 and sit target of this fixture, the
  // avatar on the child's target read PRIM_ROT_LOCAL <0.003751, 0.360332,
  // -0.463602, 0.809457> (sit target rotation times the child's local rotation)
  // and PRIM_ROTATION <0.224224, 0.409480, -0.104557, 0.878133> (that times the
  // root's). Its PRIM_POS_LOCAL was relative to the root: the child's position
  // plus the target offset turned by the child, plus the avatar's own offset.
  // The position literals here are derived and leave that offset out; the
  // rotation literals are the measured ones.
  // Without a sit target Second Life stands the avatar upright on the prim's
  // surface instead (measured on a rolled child: region rotation a plain yaw,
  // position above the prim). The fixture does not model that placement.
  it('reads placement relative to the root when seated on a child', async () => {
    const f = await fixture('out = llGetLinkPrimitiveParams(a, [PRIM_POS_LOCAL, PRIM_ROT_LOCAL, PRIM_POSITION, PRIM_ROTATION]) + [llAvatarOnLinkSitTarget(2)];', { prims: 3, target: 'child' })
    f.sit()
    expect(f.touch()).toEqual([near({ x: 1.05206, y: 0.28748, z: -0.320974 }), near({ x: 0.003751, y: 0.360332, z: -0.463602, s: 0.809457 }),
      near({ x: 116.76737, y: 50.799998, z: 20.252276 }), near({ x: 0.224224, y: 0.40948, z: -0.104557, s: 0.878133 }), AVATAR])
  })

  // In-world: these rules read the same on every seated avatar link.
  it.each([
    ['PRIM_TEXT', ['', ZERO, 1]],
    ['PRIM_TYPE', [0, 0, { x: 0, y: 1, z: 0 }, 0, ZERO, { x: 1, y: 1, z: 0 }, ZERO]],
    ['PRIM_SLICE', [{ x: 0, y: 1, z: 0 }]],
    ['PRIM_MATERIAL', [4]],
    ['PRIM_PHYSICS', [0]],
    ['PRIM_PHANTOM', [0]],
    ['PRIM_TEMP_ON_REZ', [0]],
    ['PRIM_PHYSICS_SHAPE_TYPE', [0]],
    ['PRIM_CLICK_ACTION', [0]],
    ['PRIM_ALLOW_UNSIT', [1]],
    ['PRIM_SCRIPTED_SIT_ONLY', [0]],
    ['PRIM_SIT_FLAGS', [2]],
    ['PRIM_SIT_TARGET', [0, ZERO, IDENTITY]],
    ['PRIM_OMEGA', [ZERO, 0, 0]],
    ['PRIM_POINT_LIGHT', [0, ZERO, 0, 0, 0]],
    ['PRIM_FLEXIBLE', [0, 0, 0, 0, 0, 0, ZERO]],
    ['PRIM_REFLECTION_PROBE', [0, 0, 0, 0]],
    ['PRIM_HEALTH', [0]],
    ['PRIM_DAMAGE', [0, 0]],
  ])('reads %s as an unset prim would', async (rule, values) => {
    const f = await fixture(`out = llGetLinkPrimitiveParams(a, [${rule}]);`)
    f.sit()
    expect(f.touch()).toEqual(values)
  })

  // In-world: [PRIM_NAME, PRIM_TYPE, PRIM_DESC, PRIM_COLOR, 0, PRIM_POS_LOCAL]
  // returned the name, the type and the description, then nothing.
  // [<rule>, 0, PRIM_NAME] returned [] for each face rule, and so did
  // [PRIM_PROJECTOR, PRIM_NAME] and [PRIM_CAST_SHADOWS, PRIM_NAME], while a box
  // asked for face 7 skips the rule and still returns its name.
  it.each(['PRIM_COLOR, 0', 'PRIM_TEXTURE, 0', 'PRIM_GLOW, 0', 'PRIM_FULLBRIGHT, 0', 'PRIM_BUMP_SHINY, 0', 'PRIM_TEXGEN, 0',
    'PRIM_ALPHA_MODE, 0', 'PRIM_NORMAL, 0', 'PRIM_SPECULAR, 0', 'PRIM_RENDER_MATERIAL, 0', 'PRIM_GLTF_BASE_COLOR, 0',
    'PRIM_GLTF_NORMAL, 0', 'PRIM_GLTF_METALLIC_ROUGHNESS, 0', 'PRIM_GLTF_EMISSIVE, 0', 'PRIM_PROJECTOR',
    'PRIM_CAST_SHADOWS', '9999'])('stops reading at [%s]', async (rule) => {
    const f = await fixture(`out = llGetLinkPrimitiveParams(a, [PRIM_NAME, ${rule}, PRIM_NAME]);`)
    f.sit()
    expect(f.touch()).toEqual(['Test Resident'])
  })

  // In-world: [PRIM_NAME, PRIM_LINK_TARGET, avatar link, PRIM_COLOR, 0,
  // PRIM_LINK_TARGET, 1, PRIM_DESC] read from the root returned only the root's
  // name: a later PRIM_LINK_TARGET does not resume the read.
  it('ends the whole read at a rule the avatar link has no value for', async () => {
    const f = await fixture('out = llGetLinkPrimitiveParams(1, [PRIM_NAME, PRIM_LINK_TARGET, a, PRIM_COLOR, 0, PRIM_LINK_TARGET, 1, PRIM_DESC]);')
    f.sit()
    expect(f.touch()).toEqual(['Root'])
  })

  // In-world: llGetLinkPrimitiveParams(LINK_THIS, [PRIM_LINK_TARGET, avatar link,
  // PRIM_POS_LOCAL, PRIM_NAME]) read the avatar; a PRIM_LINK_TARGET back to a
  // prim reads that prim again, as the set side does.
  it('retargets a read from the avatar link back to a prim', async () => {
    const f = await fixture('out = llGetLinkPrimitiveParams(a, [PRIM_NAME, PRIM_LINK_TARGET, 1, PRIM_NAME, PRIM_LINK_TARGET, a, PRIM_NAME]);')
    f.sit()
    expect(f.touch()).toEqual(['Test Resident', 'Root', 'Test Resident'])
  })

  // In-world: [PRIM_CLICK_ACTION, PRIM_NAME] on the avatar link returned only the name.
  it('skips a click action that is not the last rule, as a prim does', async () => {
    const f = await fixture('out = llGetLinkPrimitiveParams(a, [PRIM_CLICK_ACTION, PRIM_NAME]);')
    f.sit()
    expect(f.touch()).toEqual(['Test Resident'])
  })

  // In-world: llGetLinkPrimitiveParams(LINK_THIS, [PRIM_LINK_TARGET, avatar link,
  // PRIM_POS_LOCAL, PRIM_NAME]) returned the avatar's position and name; the
  // link past the avatar returned [].
  it('reaches the avatar through PRIM_LINK_TARGET and nothing past it', async () => {
    const f = await fixture('out = llGetLinkPrimitiveParams(LINK_THIS, [PRIM_LINK_TARGET, a, PRIM_POS_LOCAL, PRIM_NAME]) + ["|"] + llGetLinkPrimitiveParams(a + 1, [PRIM_NAME]) + llGetPrimitiveParams([PRIM_LINK_TARGET, a, PRIM_NAME]);')
    f.sit()
    expect(f.touch()).toEqual([TARGET, 'Test Resident', '|', 'Test Resident'])
  })
})

// https://wiki.secondlife.com/wiki/LlSetLinkPrimitiveParamsFast
describe('moving a sitter with llSetLinkPrimitiveParamsFast', () => {
  const READ = 'out = llGetLinkPrimitiveParams(a, [PRIM_POS_LOCAL, PRIM_ROT_LOCAL, PRIM_POSITION, PRIM_ROTATION]) + llGetObjectDetails(A, [OBJECT_POS, OBJECT_ROT]);'

  // In-world: with the rolled root of this fixture at <116, 50, 1997.5>,
  // PRIM_POS_LOCAL <0.25, 0.5, 1.5> on the avatar link read back at once, with
  // PRIM_POSITION and OBJECT_POS <115.9665, 49.46328, 1999.008>: the root
  // position plus the offset turned by the root. The rotation did not change.
  it('moves the sitter with PRIM_POS_LOCAL', async () => {
    const f = await fixture(`llSetLinkPrimitiveParamsFast(a, [PRIM_POS_LOCAL, <0.25, 0.5, 1.5>]); ${READ}`)
    f.sit()
    const moved = near({ x: 115.9665, y: 49.46328, z: 21.5077 })
    const rotation = near({ x: 0.544658, y: -0.025598, z: 0.25755, s: 0.797722 })
    expect(f.touch()).toEqual([{ x: 0.25, y: 0.5, z: 1.5 }, near(TARGET_ROT), moved, rotation, moved, rotation])
    expect(f.avatar.position).toEqual(moved)
  })

  // In-world: PRIM_ROT_LOCAL llEuler2Rot(<0.3, 0.6, 0.9>) read back as set, with
  // PRIM_ROTATION and OBJECT_ROT <0.417917, 0.022162, 0.700254, 0.578359>: the
  // local rotation times the root's. The position did not change.
  it('turns the sitter with PRIM_ROT_LOCAL', async () => {
    const f = await fixture(`llSetLinkPrimitiveParamsFast(a, [PRIM_ROT_LOCAL, llEuler2Rot(<0.3, 0.6, 0.9>)]); ${READ}`)
    f.sit()
    const turned = near({ x: 0.417917, y: 0.022162, z: 0.700254, s: 0.578359 })
    const position = near({ x: 116.159808, y: 49.765499, z: 20.782285 })
    expect(f.touch()).toEqual([TARGET, near({ x: 0.255649, y: 0.201015, z: 0.450638, s: 0.831362 }), position, turned, position, turned])
  })

  // In-world: PRIM_POSITION <0.5, 0.25, 2> on the avatar link read back as
  // PRIM_POS_LOCAL <0.5, 0.25, 2>: like a child prim, it is taken relative to the root.
  it('treats PRIM_POSITION as a local position', async () => {
    const f = await fixture(`llSetLinkPrimitiveParamsFast(a, [PRIM_POSITION, <0.5, 0.25, 2.0>]); ${READ}`)
    f.sit()
    expect((f.touch() as unknown[])[0]).toEqual({ x: 0.5, y: 0.25, z: 2 })
  })

  // In-world: PRIM_ROTATION llEuler2Rot(<0.7, -0.4, 0.2>) read back as
  // PRIM_ROT_LOCAL <0.642664, -0.211869, 0.201868, 0.708056> and PRIM_ROTATION
  // <0.850914, -0.165375, 0.342326, 0.362505>: the requested rotation times the
  // root's becomes the local rotation, as for a child prim. Yawed roots agreed:
  // 180 degrees under a 30 degree root gave local 210, under 90 degrees 270.
  it('multiplies PRIM_ROTATION by the root rotation', async () => {
    const f = await fixture(`llSetLinkPrimitiveParamsFast(a, [PRIM_ROTATION, llEuler2Rot(<0.7, -0.4, 0.2>)]); ${READ}`)
    f.sit()
    const out = f.touch() as unknown[]
    expect([out[1], out[3]]).toEqual([near({ x: 0.642664, y: -0.211869, z: 0.201868, s: 0.708056 }), near({ x: 0.850914, y: -0.165375, z: 0.342326, s: 0.362505 })])
  })

  // In-world: with the avatar on child link 2's sit target, PRIM_ROTATION
  // llEuler2Rot(<0.7, -0.4, 0.2>) gave the same local and region rotations as
  // from the root's seat, and PRIM_ROTATION <0, 0, 0, 0> read back as
  // PRIM_ROT_LOCAL equal to the root's rotation: identity times the root's.
  it('multiplies PRIM_ROTATION by the root rotation on a child seat too', async () => {
    const f = await fixture(`llSetLinkPrimitiveParamsFast(a, [PRIM_ROTATION, llEuler2Rot(<0.7, -0.4, 0.2>)]); out = llGetLinkPrimitiveParams(a, [PRIM_ROT_LOCAL, PRIM_ROTATION]);
      llSetLinkPrimitiveParamsFast(a, [PRIM_ROTATION, <0, 0, 0, 0>]); out += llGetLinkPrimitiveParams(a, [PRIM_ROT_LOCAL, PRIM_ROTATION]);`, { prims: 3, target: 'child' })
    f.sit()
    expect(f.touch()).toEqual([near({ x: 0.642664, y: -0.211869, z: 0.201868, s: 0.708056 }), near({ x: 0.850914, y: -0.165375, z: 0.342326, s: 0.362505 }),
      near(ROOT_ROT), near({ x: 0.599728, y: -0.160721, z: 0.441484, s: 0.647755 })])
  })

  // In-world: llSetLinkPrimitiveParams and PRIM_LINK_TARGET move the sitter too.
  it('moves the sitter through the slow call and PRIM_LINK_TARGET', async () => {
    const f = await fixture(`llSetLinkPrimitiveParams(a, [PRIM_POS_LOCAL, <0, 0, 1>, PRIM_ROT_LOCAL, llEuler2Rot(<0, 0, PI_BY_TWO>)]);
      out = llGetLinkPrimitiveParams(a, [PRIM_POS_LOCAL, PRIM_ROT_LOCAL]);
      llSetPrimitiveParams([PRIM_LINK_TARGET, a, PRIM_POS_LOCAL, <0, 0, 1.25>]);
      out += llGetLinkPrimitiveParams(a, [PRIM_POS_LOCAL]);`)
    f.sit()
    expect(f.touch()).toEqual([{ x: 0, y: 0, z: 1 }, near(yaw(90)), { x: 0, y: 0, z: 1.25 }])
  })

  // In-world: PRIM_POS_LOCAL <0, 0, 70> and <0, 0, 400> on the avatar link read
  // back as set.
  it('does not limit how far the sitter moves', async () => {
    const f = await fixture('llSetLinkPrimitiveParamsFast(a, [PRIM_POS_LOCAL, <0, 0, 400>]); out = llGetLinkPrimitiveParams(a, [PRIM_POS_LOCAL]);')
    f.sit()
    expect(f.touch()).toEqual([{ x: 0, y: 0, z: 400 }])
  })

  // In-world: PRIM_NAME, PRIM_DESC, PRIM_SIZE, PRIM_COLOR, PRIM_TEXT and
  // PRIM_PHANTOM on the avatar link changed nothing on the avatar or the box.
  // [PRIM_NAME, "x", PRIM_POS_LOCAL, v], [PRIM_COLOR, ..., PRIM_POS_LOCAL, v] and
  // [PRIM_SIZE, ..., PRIM_TEXT, ..., PRIM_POS_LOCAL, v] left the avatar where it
  // was: a rule the avatar ignores ends the list. So did each of the other
  // rules here, followed by PRIM_POS_LOCAL.
  it.each([
    ['PRIM_NAME, "x"'],
    ['PRIM_DESC, "x"'],
    ['PRIM_SIZE, <1, 1, 1>'],
    ['PRIM_COLOR, ALL_SIDES, <1, 0, 0>, 0.5'],
    ['PRIM_TEXT, "t", <1, 1, 1>, 1.0'],
    ['PRIM_PHANTOM, TRUE'],
    ['PRIM_MATERIAL, PRIM_MATERIAL_WOOD'],
    ['PRIM_GLOW, ALL_SIDES, 0.1'],
    ['PRIM_FULLBRIGHT, ALL_SIDES, TRUE'],
    ['PRIM_PHYSICS_SHAPE_TYPE, PRIM_PHYSICS_SHAPE_PRIM'],
    ['PRIM_CLICK_ACTION, 0'],
    ['PRIM_SLICE, <0, 1, 0>'],
    ['PRIM_OMEGA, <0, 0, 1>, 1.0, 1.0'],
    ['PRIM_ALLOW_UNSIT, TRUE'],
    ['PRIM_SIT_TARGET, TRUE, <0, 0, 1>, ZERO_ROTATION'],
    ['PRIM_TYPE, PRIM_TYPE_BOX, 0, <0, 1, 0>, 0.0, ZERO_VECTOR, <1, 1, 0>, ZERO_VECTOR'],
    ['PRIM_TEXTURE, ALL_SIDES, TEXTURE_BLANK, <1, 1, 0>, ZERO_VECTOR, 0.0'],
    ['PRIM_PHYSICS, FALSE'],
    ['PRIM_TEMP_ON_REZ, FALSE'],
    ['PRIM_POINT_LIGHT, FALSE, <1, 1, 1>, 1.0, 10.0, 0.75'],
    ['PRIM_FLEXIBLE, FALSE, 2, 0.3, 2.0, 0.0, 1.0, ZERO_VECTOR'],
    ['PRIM_BUMP_SHINY, ALL_SIDES, PRIM_SHINY_NONE, PRIM_BUMP_NONE'],
    ['PRIM_TEXGEN, ALL_SIDES, PRIM_TEXGEN_DEFAULT'],
    ['PRIM_ALPHA_MODE, ALL_SIDES, PRIM_ALPHA_MODE_BLEND, 0'],
    ['PRIM_NORMAL, ALL_SIDES, NULL_KEY, <1, 1, 0>, ZERO_VECTOR, 0.0'],
    ['PRIM_SPECULAR, ALL_SIDES, NULL_KEY, <1, 1, 0>, ZERO_VECTOR, 0.0, <1, 1, 1>, 51, 0'],
    ['PRIM_RENDER_MATERIAL, ALL_SIDES, NULL_KEY'],
    ['PRIM_GLTF_BASE_COLOR, ALL_SIDES, "", "", "", "", "", "", "", "", ""'],
    ['PRIM_GLTF_NORMAL, ALL_SIDES, "", "", "", ""'],
    ['PRIM_GLTF_METALLIC_ROUGHNESS, ALL_SIDES, "", "", "", "", "", ""'],
    ['PRIM_GLTF_EMISSIVE, ALL_SIDES, "", "", "", "", ""'],
    ['PRIM_PROJECTOR, NULL_KEY, 1.0, 1.0, 0.0'],
    ['PRIM_CAST_SHADOWS, TRUE'],
    ['PRIM_REFLECTION_PROBE, FALSE, 0.0, 0.0, 0'],
    ['PRIM_SIT_FLAGS, 0'],
    ['PRIM_SCRIPTED_SIT_ONLY, FALSE'],
    ['PRIM_HEALTH, 0.0'],
    ['PRIM_DAMAGE, 0.0, 0'],
  ])('ignores [%s] and the rules after it', async (rule) => {
    const f = await fixture(`llSetLinkPrimitiveParamsFast(a, [${rule}, PRIM_POS_LOCAL, <0, 0, 1.4>]);
      out = llGetLinkPrimitiveParams(a, [PRIM_NAME, PRIM_DESC, PRIM_SIZE, PRIM_POS_LOCAL])
        + llGetLinkPrimitiveParams(1, [PRIM_NAME, PRIM_DESC, PRIM_SIZE, PRIM_COLOR, 0, PRIM_TEXT, PRIM_PHANTOM]);`)
    f.sit()
    expect(f.touch()).toEqual(['Test Resident', '', SIZE, TARGET,
      'Root', '', { x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 1, z: 1 }, 1, '', ZERO, 1, 0])
    f.linkset.advanceTime(100)
    expect(f.script.global('log')).toEqual([CHANGED_LINK, 1, 2])
  })

  // In-world: [PRIM_POS_LOCAL, v, PRIM_LINK_TARGET, 1, PRIM_DESC, "viaav"] on the
  // avatar link moved the avatar and set the box's description.
  it('retargets from the avatar link to a prim', async () => {
    const f = await fixture('llSetLinkPrimitiveParamsFast(a, [PRIM_POS_LOCAL, <0, 0, 1.5>, PRIM_LINK_TARGET, 1, PRIM_DESC, "viaav"]); out = llGetLinkPrimitiveParams(a, [PRIM_POS_LOCAL]) + [llGetObjectDesc()];')
    f.sit()
    expect(f.touch()).toEqual([{ x: 0, y: 0, z: 1.5 }, 'viaav'])
  })

  // In-world: [PRIM_POS_LOCAL, <0, 0, 1.3>, PRIM_NAME, "x", PRIM_ROT_LOCAL, r] moved
  // the avatar and did not turn it, and [PRIM_NAME, "x", PRIM_LINK_TARGET, 1,
  // PRIM_DESC, d] left the root's description alone: the ignored rule ends the
  // whole list, PRIM_LINK_TARGET included.
  it('applies the rules before an ignored one and none after it', async () => {
    const f = await fixture(`llSetLinkPrimitiveParamsFast(a, [PRIM_POS_LOCAL, <0, 0, 1.25>, PRIM_NAME, "x", PRIM_ROT_LOCAL, llEuler2Rot(<0, 0, PI_BY_TWO>)]);
      llSetLinkPrimitiveParamsFast(a, [PRIM_NAME, "x", PRIM_LINK_TARGET, 1, PRIM_DESC, "after"]);
      out = llGetLinkPrimitiveParams(a, [PRIM_POS_LOCAL, PRIM_ROT_LOCAL]) + [llGetObjectDesc()];`)
    f.sit()
    expect(f.touch()).toEqual([{ x: 0, y: 0, z: 1.25 }, near(TARGET_ROT), ''])
  })

  // In-world: after PRIM_ROT_LOCAL r (45 degrees), PRIM_ROTATION r left the avatar
  // at 45 degrees: a rotation equal to the local one changes nothing, as for a
  // child prim. PRIM_ROT_LOCAL <0, 0, 2, 2> read back as <0, 0, 0.707107, 0.707107>.
  it('keeps the rotation for PRIM_ROTATION equal to the local one, and normalises', async () => {
    const f = await fixture(`rotation r = llEuler2Rot(<0, 0, PI / 4>);
      llSetLinkPrimitiveParamsFast(a, [PRIM_ROT_LOCAL, r]); llSetLinkPrimitiveParamsFast(a, [PRIM_ROTATION, r]);
      out = llGetLinkPrimitiveParams(a, [PRIM_ROT_LOCAL]);
      llSetLinkPrimitiveParamsFast(a, [PRIM_ROT_LOCAL, <0, 0, 2, 2>]);
      out += llGetLinkPrimitiveParams(a, [PRIM_ROT_LOCAL]);`)
    f.sit()
    expect(f.touch()).toEqual([near(yaw(45)), near(yaw(90))])
  })

  // In-world: seated on the sit target of child link 2, PRIM_POS_LOCAL
  // <0.25, 0.5, 1.5> read back as set with PRIM_POSITION <115.9665, 49.46328,
  // 1999.008> under the root at <116, 50, 1997.5>: the position is relative to
  // the root, not to the seat.
  it('moves a sitter on a child seat relative to the root', async () => {
    const f = await fixture('llSetLinkPrimitiveParamsFast(a, [PRIM_POS_LOCAL, <0.25, 0.5, 1.5>]); out = llGetLinkPrimitiveParams(a, [PRIM_POS_LOCAL, PRIM_POSITION]);', { prims: 3, target: 'child' })
    f.sit()
    expect(f.touch()).toEqual([{ x: 0.25, y: 0.5, z: 1.5 }, near({ x: 115.9665, y: 49.46328, z: 21.5077 })])
  })

  // In-world: with the avatar on the sit target of child link 2, moving and
  // turning link 2 and then changing its sit target left the avatar link's
  // PRIM_POS_LOCAL, PRIM_ROT_LOCAL and PRIM_POSITION as they were, and
  // llAvatarOnLinkSitTarget(2) still gave the avatar.
  it('leaves the sitter in place when its seat prim moves', async () => {
    const f = await fixture(`llSetLinkPrimitiveParamsFast(2, [PRIM_POS_LOCAL, <1, 1, 0.5>, PRIM_ROT_LOCAL, llEuler2Rot(<0, 0, PI_BY_TWO>)]);
      llLinkSitTarget(2, <0, 0, 1.5>, ZERO_ROTATION);
      out = llGetLinkPrimitiveParams(a, [PRIM_POS_LOCAL, PRIM_ROT_LOCAL]) + [llAvatarOnLinkSitTarget(2)];`, { prims: 3, target: 'child' })
    f.sit()
    const before = { ...f.avatar.position }
    expect(f.touch()).toEqual([near({ x: 1.05206, y: 0.28748, z: -0.320974 }), near({ x: 0.003751, y: 0.360332, z: -0.463602, s: 0.809457 }), AVATAR])
    expect(f.avatar.position).toEqual(before)
  })

  // In-world: llSetLinkPrimitiveParamsFast(LINK_SET, [PRIM_ROT_LOCAL, r]) turned
  // the root and the children and left the avatar link's rotation alone.
  it('leaves the sitter out of LINK_SET', async () => {
    const f = await fixture('llSetLinkPrimitiveParamsFast(LINK_SET, [PRIM_ROT_LOCAL, llEuler2Rot(<0, 0, PI_BY_TWO>)]); out = llGetLinkPrimitiveParams(2, [PRIM_ROT_LOCAL]) + llGetLinkPrimitiveParams(a, [PRIM_ROT_LOCAL]);', { prims: 3 })
    f.sit()
    expect(f.touch()).toEqual([near(yaw(90)), near(TARGET_ROT)])
  })

  // In-world: on the avatar link [PRIM_POS_LOCAL] and [PRIM_POS_LOCAL, "bad"]
  // changed nothing; [PRIM_ROT_LOCAL, r, PRIM_ROTATION] turned the avatar to r;
  // [PRIM_POS_LOCAL, v, 9999, PRIM_ROT_LOCAL, r], [PRIM_POS_LOCAL, v,
  // PRIM_ROT_LOCAL] and [PRIM_POS_LOCAL, v, PRIM_ROT_LOCAL, "bad"] moved it and
  // did not turn it; [9999, PRIM_POS_LOCAL, v] did nothing. A prim treated the
  // same lists the same way. A rotation of <0, 0, 0, 0> read back as identity.
  // A DEBUG_CHANNEL listener heard no message for any of these lists, on the
  // avatar link or on a prim, so what is said for them is not pinned here.
  it.each([
    ['PRIM_POS_LOCAL', TARGET, near(TARGET_ROT)],
    ['PRIM_POS_LOCAL, "bad"', TARGET, near(TARGET_ROT)],
    ['PRIM_ROT_LOCAL, llEuler2Rot(<0, 0, PI_BY_TWO>), PRIM_ROTATION', TARGET, near(yaw(90))],
    ['PRIM_POS_LOCAL, <0, 0, 1.25>, 9999, PRIM_ROT_LOCAL, ZERO_ROTATION', { x: 0, y: 0, z: 1.25 }, near(TARGET_ROT)],
    ['PRIM_POS_LOCAL, <0, 0, 1.25>, PRIM_ROT_LOCAL', { x: 0, y: 0, z: 1.25 }, near(TARGET_ROT)],
    ['PRIM_POS_LOCAL, <0, 0, 1.25>, PRIM_ROT_LOCAL, "bad"', { x: 0, y: 0, z: 1.25 }, near(TARGET_ROT)],
    ['9999, PRIM_POS_LOCAL, <0, 0, 1.25>', TARGET, near(TARGET_ROT)],
    ['PRIM_ROT_LOCAL, <0, 0, 0, 0>', TARGET, IDENTITY],
  ])('applies what it can of the cut-short or malformed list [%s]', async (rules, position, rotation) => {
    const f = await fixture(`llSetLinkPrimitiveParamsFast(a, [${rules}]); out = llGetLinkPrimitiveParams(a, [PRIM_POS_LOCAL, PRIM_ROT_LOCAL]);`)
    f.sit()
    expect(f.touch()).toEqual([position, rotation])
    expect(f.avatar.position).toEqual({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) })
    expect(Object.values(f.avatar.position).every(Number.isFinite)).toBe(true)
  })

  // In-world: on a seated three-prim linkset, [PRIM_POS_LOCAL, v, PRIM_DESC, d] to
  // LINK_ALL_CHILDREN and to LINK_ALL_OTHERS moved and described links 2 and 3
  // and left the avatar at its position. On a seated lone box neither moved the
  // avatar. The link past the avatar is nobody.
  it('leaves the sitter out of LINK_ALL_CHILDREN and LINK_ALL_OTHERS', async () => {
    const f = await fixture(`llSetLinkPrimitiveParamsFast(LINK_ALL_CHILDREN, [PRIM_POS_LOCAL, <0, 0.5, 2>]);
      out = llGetLinkPrimitiveParams(2, [PRIM_POS_LOCAL]) + llGetLinkPrimitiveParams(a, [PRIM_POS_LOCAL]);
      llSetLinkPrimitiveParamsFast(LINK_ALL_OTHERS, [PRIM_POS_LOCAL, <0, -0.5, 2.5>]);
      llSetLinkPrimitiveParamsFast(a + 1, [PRIM_POS_LOCAL, <0, 0, 3>]);
      out += llGetLinkPrimitiveParams(3, [PRIM_POS_LOCAL]) + llGetLinkPrimitiveParams(a, [PRIM_POS_LOCAL]);`, { prims: 3 })
    f.sit()
    expect(f.touch()).toEqual([{ x: 0, y: 0.5, z: 2 }, TARGET, { x: 0, y: -0.5, z: 2.5 }, TARGET])
  })

  // In-world: on a seated lone box [PRIM_DESC, d] set the box's description
  // through LINK_SET, LINK_ROOT and LINK_THIS, and did nothing through link 0.
  // llGetLinkPrimitiveParams(0, [PRIM_NAME]) returned [].
  it('addresses a seated lone prim as a linkset root', async () => {
    const f = await fixture(`out = [];
      llSetLinkPrimitiveParamsFast(LINK_SET, [PRIM_DESC, "set"]); out += llGetObjectDesc();
      llSetLinkPrimitiveParamsFast(LINK_ROOT, [PRIM_DESC, "root"]); out += llGetObjectDesc();
      llSetLinkPrimitiveParamsFast(0, [PRIM_DESC, "zero"]); out += llGetObjectDesc();
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_DESC, "this"]); out += llGetObjectDesc();
      out += llGetLinkPrimitiveParams(0, [PRIM_NAME]);`)
    f.sit()
    expect(f.touch()).toEqual(['set', 'root', 'root', 'this'])
  })
})

// https://wiki.secondlife.com/wiki/LlSetLinkAlpha
// https://wiki.secondlife.com/wiki/LlSetLinkColor
describe('colouring an avatar link', () => {
  // In-world: llSetLinkAlpha and llSetLinkColor on the avatar link left the
  // root's colour and alpha alone and raised changed(CHANGED_COLOR) in the root's
  // script only: not in the caller when a child's script made the call, and not
  // in the seat prim when the avatar sat on child link 2's sit target.
  // PRIM_COLOR through llSetLinkPrimitiveParamsFast raised nothing.
  it.each(['llSetLinkAlpha(a, 0.25, ALL_SIDES);', 'llSetLinkColor(a, <0, 1, 0>, ALL_SIDES);'])('raises CHANGED_COLOR in the root for %s', async (call) => {
    const f = await fixture(`${call} out = llGetLinkPrimitiveParams(1, [PRIM_COLOR, 0]);`, { prims: 3, target: 'child', childBody: call })
    f.sit()
    expect(f.touch()).toEqual([{ x: 1, y: 1, z: 1 }, 1])
    f.linkset.advanceTime(100)
    expect(f.script.global('log')).toEqual([CHANGED_LINK, 1, 4, CHANGED_COLOR, 1, 4])
    f.touch(3)
    f.linkset.advanceTime(100)
    expect(f.script.global('log')).toEqual([CHANGED_LINK, 1, 4, CHANGED_COLOR, 1, 4, CHANGED_COLOR, 1, 4])
    expect(f.scripts.p1!.global('log')).toEqual([CHANGED_LINK, 2, 4])
    expect(f.scripts.p2!.global('log')).toEqual([CHANGED_LINK, 3, 4])
  })
})

// https://wiki.secondlife.com/wiki/LlSetLinkTexture
// https://wiki.secondlife.com/wiki/LlLinkSitTarget
// https://wiki.secondlife.com/wiki/LlSetLinkMedia
describe('other link functions on an avatar link', () => {
  // In-world: on a seated lone box llSetLinkMedia(-2, 0, ...) returned 0 and
  // llGetLinkMedia(-2, 0, ...) and llGetLinkMedia(avatar link, 0, ...) both read
  // the value back, while the box's face had no media: a negative link is the
  // first other link, here the avatar, as for llGetLinkKey.
  it('reaches the sitter of a lone prim through a negative media link', async () => {
    const f = await fixture('out = [llSetLinkMedia(-2, 0, [PRIM_MEDIA_AUTO_PLAY, TRUE])]; out += llGetLinkMedia(-2, 0, [PRIM_MEDIA_AUTO_PLAY]); out += llGetLinkMedia(a, 0, [PRIM_MEDIA_AUTO_PLAY]); out += llGetLinkMedia(1, 0, [PRIM_MEDIA_AUTO_PLAY]); out += llClearLinkMedia(-2, 0); out += llGetLinkMedia(a, 0, [PRIM_MEDIA_AUTO_PLAY]);')
    f.sit()
    expect(f.touch()).toEqual([0, 1, 1, 0])
  })

  // In-world: on the avatar link of a seated lone box, llSetLinkTexture,
  // llSetLinkTextureAnim, llSetLinkRenderMaterial, llSetLinkGLTFOverrides,
  // llSetLinkSitFlags, llLinkSitTarget, llLinkParticleSystem, llLinkPlaySound,
  // llLinkStopSound, llLinkAdjustSoundVolume, llLinkSetSoundQueueing,
  // llLinkSetSoundRadius and llSetLinkCamera raised no event and left the box's
  // texture, sit target and sit flags and the avatar's position as they were.
  // Not measured: llSitOnLink, which needs an experience the probes did not have.
  it('does nothing for the calls that only act on prims', async () => {
    const f = await fixture(`llSetLinkTexture(a, TEXTURE_BLANK, ALL_SIDES); llSetLinkTextureAnim(a, ANIM_ON | LOOP, ALL_SIDES, 2, 2, 0.0, 0.0, 1.0);
      llSetLinkRenderMaterial(a, NULL_KEY, ALL_SIDES); llSetLinkGLTFOverrides(a, ALL_SIDES, [OVERRIDE_GLTF_BASE_ALPHA, 0.5]);
      llSetLinkSitFlags(a, 3); llLinkSitTarget(a, <0, 0, 1>, ZERO_ROTATION); llLinkParticleSystem(a, [PSYS_PART_FLAGS, 0]);
      llLinkPlaySound(a, "ed124764-705d-d497-167a-182cd9fa2e6c", 0.1, SOUND_PLAY); llLinkStopSound(a); llLinkAdjustSoundVolume(a, 0.5);
      llLinkSetSoundQueueing(a, TRUE); llLinkSetSoundRadius(a, 5.0); llSetLinkCamera(a, <0, 0, 1>, <1, 0, 0>);
      out = llGetLinkPrimitiveParams(1, [PRIM_TEXTURE, 0, PRIM_SIT_TARGET]) + [llGetLinkSitFlags(a)] + llGetLinkPrimitiveParams(a, [PRIM_POS_LOCAL, PRIM_SIT_TARGET, PRIM_SIT_FLAGS]);`)
    f.sit()
    const before = f.root.params.faces[0]!.texture
    expect(f.touch()).toEqual([before, { x: 1, y: 1, z: 0 }, ZERO, 0, 1, near(TARGET), near(TARGET_ROT), 0, TARGET, 0, ZERO, IDENTITY, 2])
    f.linkset.advanceTime(100)
    expect(f.script.global('log')).toEqual([CHANGED_LINK, 1, 2])
  })

  // In-world: llSetLinkMedia on the avatar link returned 0 and raised
  // changed(CHANGED_MEDIA) in the root's script only, also when a child made the
  // call and when the avatar sat on a child's sit target. llGetLinkMedia on the avatar link then read the values back, on
  // faces 0 and 9, while the root's faces had no media. The media stayed with
  // the avatar: it read back after standing and sitting again, and from the
  // avatar link of another object. llClearLinkMedia returned 0, raised
  // CHANGED_MEDIA and emptied the face. The link past the avatar gave 0 and []
  // with no event. Faces 0 to 44 took media; faces 45, 255 and 100000 returned
  // 1003 and stored nothing (the avatar also said a "PRIM_MEDIA error: face N on
  // object ... not found" line on DEBUG_CHANNEL, which is not modelled).
  it('keeps media set through an avatar link with the avatar', async () => {
    const MEDIA = '[PRIM_MEDIA_AUTO_PLAY, PRIM_MEDIA_WIDTH_PIXELS, PRIM_MEDIA_PERMS_INTERACT, PRIM_MEDIA_HOME_URL]'
    const body = `integer face = llDetectedTouchFace(0);
      if (face == 0) out = [llSetLinkMedia(a, 0, [PRIM_MEDIA_AUTO_PLAY, TRUE, PRIM_MEDIA_HOME_URL, "http://example.com/", PRIM_MEDIA_WIDTH_PIXELS, 512]), llSetLinkMedia(a, 9, [PRIM_MEDIA_AUTO_PLAY, FALSE])];
      else if (face == 1) out = llGetLinkMedia(a, 0, ${MEDIA}) + ["|"] + llGetLinkMedia(a, 9, ${MEDIA}) + ["|"] + llGetLinkMedia(a, 1, ${MEDIA}) + llGetLinkMedia(1, 0, ${MEDIA}) + llGetLinkMedia(a + 1, 0, ${MEDIA});
      else if (face == 3) { out = [llSetLinkMedia(a, 44, [PRIM_MEDIA_AUTO_PLAY, TRUE])]; out += llClearLinkMedia(a, 44); out += llSetLinkMedia(a, 45, [PRIM_MEDIA_AUTO_PLAY, TRUE]); out += llClearLinkMedia(a, 45); out += llGetLinkMedia(a, 45, ${MEDIA}); }
      else if (face == 2) { out = [llClearLinkMedia(a, 0)]; out += llClearLinkMedia(a + 1, 0); out += llSetLinkMedia(a + 1, 0, [PRIM_MEDIA_AUTO_PLAY, TRUE]); out += llGetLinkMedia(a, 0, ${MEDIA}); }`
    const f = await fixture(body, { prims: 2, target: 'child', childBody: 'llSetLinkMedia(a, 0, [PRIM_MEDIA_AUTO_PLAY, TRUE]);' })
    const touch = (face: number) => {
      f.linkset.touch(1, { avatar: { key: AVATAR, name: 'Test Resident' }, face })
      return f.script.global('out')
    }
    const stored = [1, 512, 7, 'http://example.com/', '|', 0, 0, 7, '', '|']
    f.sit()
    expect(touch(0)).toEqual([0, 0])
    f.linkset.advanceTime(100)
    expect(f.script.global('log')).toEqual([CHANGED_LINK, 1, 3, CHANGED_MEDIA, 1, 3])
    expect(f.scripts.p1!.global('log')).toEqual([CHANGED_LINK, 2, 3])
    expect(touch(1)).toEqual(stored)
    f.stand()
    f.sit()
    expect(touch(1)).toEqual(stored)
    f.linkset.touch(2)
    f.linkset.advanceTime(100)
    expect(f.script.global('log').slice(-3)).toEqual([CHANGED_MEDIA, 1, 3])
    expect(f.scripts.p1!.global('log')).toEqual([CHANGED_LINK, 2, 3, CHANGED_LINK, 2, 2, CHANGED_LINK, 2, 3])
    expect(touch(2)).toEqual([0, 0, 0])
    f.linkset.advanceTime(100)
    expect(f.script.global('log').slice(-3)).toEqual([CHANGED_MEDIA, 1, 3])
    expect(touch(3)).toEqual([0, 0, 1003, 1003])
    expect(f.scripts.p1!.global('log').filter((v, i) => i % 3 === 0)).not.toContain(CHANGED_MEDIA)

    const other = await loadLinkset({ world: f.world, region: 'home', position: { x: 116, y: 51, z: 20 }, prims: [{ scripts: [{ name: 'other', source: { source:
      `list out; default { touch_start(integer n) { out = llGetLinkMedia(llGetNumberOfPrims(), 9, ${MEDIA}); } }` } }] }] })
    other.scripts.other!.start()
    expect(f.world.sitAvatar(f.avatar, other.prims[0]!)).toBe(true)
    other.linkset.touch(1)
    expect(other.scripts.other!.global('out')).toEqual([0, 0, 7, ''])
  })
})

// https://wiki.secondlife.com/wiki/LlBreakLink
// https://wiki.secondlife.com/wiki/LlUnSit
describe('removing an avatar link', () => {
  // In-world: with PERMISSION_CHANGE_LINKS granted, llBreakLink(avatar link) on a
  // lone box and on a three-prim linkset left the avatar seated, the link count
  // unchanged and raised no event.
  it('does not unseat the avatar with llBreakLink', async () => {
    const f = await fixture(`if (llGetPermissions() & PERMISSION_CHANGE_LINKS) { llBreakLink(a); out = [llGetNumberOfPrims(), llGetLinkKey(a)]; }
      else llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS);`, { prims: 3 })
    f.sit()
    f.touch()
    f.script.grantPermissions()
    f.linkset.advanceTime(100)
    expect(f.touch()).toEqual([4, AVATAR])
    f.linkset.advanceTime(100)
    expect(f.script.global('log')).toEqual([CHANGED_LINK, 1, 4])
    expect(f.linkset.prims).toHaveLength(3)
  })

  // In-world: seated on the root of a four-prim linkset, llBreakLink(3) took
  // llGetNumberOfPrims from 5 to 3: the prim left and the avatar stood, though
  // it was not sitting on that prim. changed(32) ran once in the root.
  it('stands the sitters when a prim is unlinked', async () => {
    const f = await fixture(`if (llGetPermissions() & PERMISSION_CHANGE_LINKS) { llBreakLink(3); out = [llGetNumberOfPrims(), llGetObjectPrimCount(llGetKey())]; }
      else llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS);`, { prims: 4 })
    f.sit()
    f.touch()
    f.script.grantPermissions()
    f.linkset.advanceTime(100)
    expect(f.touch()).toEqual([3, 3])
    expect(f.avatar.sittingOn).toBeNull()
    f.linkset.advanceTime(100)
    expect(f.script.global('log')).toEqual([CHANGED_LINK, 1, 5, CHANGED_LINK, 1, 3])
  })

  // In-world: the avatar stood for each of these: llBreakLink(1) with it on the
  // root of a three-prim linkset, llBreakLink(2) with it on child link 2's sit
  // target, and llBreakLink(2) on a two-prim object with it on the root.
  it.each([[3, 'root', 1], [3, 'child', 2], [2, 'root', 2]] as const)('stands the sitter of a %i-prim object (seat: %s) for llBreakLink(%i)', async (prims, target, link) => {
    const f = await fixture(`if (llGetPermissions() & PERMISSION_CHANGE_LINKS) { llBreakLink(${link}); out = llGetObjectDetails(A, [OBJECT_ROOT, OBJECT_LINK_NUMBER]); }
      else llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS);`, { prims, target })
    f.sit()
    f.touch()
    f.script.grantPermissions()
    f.linkset.advanceTime(100)
    expect(f.touch()).toEqual([AVATAR, 0])
    expect(f.avatar.sittingOn).toBeNull()
  })

  // In-world: on a seated lone box llBreakLink(1), llBreakLink(LINK_THIS) and
  // llBreakAllLinks() stood the avatar (changed(32), the box back at link 0 of
  // 1), and llBreakLink(-2), which names the avatar link, left it seated.
  it.each([['llBreakLink(1)', [1, 0]], ['llBreakLink(LINK_THIS)', [1, 0]], ['llBreakAllLinks()', [1, 0]], ['llBreakLink(-2)', [2, 1]]] as const)('on a seated lone prim, %s leaves %j', async (call, counts) => {
    const f = await fixture(`if (llGetPermissions() & PERMISSION_CHANGE_LINKS) { ${call}; out = [llGetNumberOfPrims(), llGetLinkNumber()]; }
      else llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS);`)
    f.sit()
    f.touch()
    f.script.grantPermissions()
    f.linkset.advanceTime(100)
    expect(f.touch()).toEqual(counts)
    f.linkset.advanceTime(100)
    const stood = counts[0] === 1 ? [CHANGED_LINK, 0, 1] : []
    expect(f.script.global('log')).toEqual([CHANGED_LINK, 1, 2, ...stood])
  })

  // In-world: llBreakAllLinks with an avatar seated on a six-link object left
  // the avatar standing: OBJECT_ROOT read the avatar's own key and
  // OBJECT_LINK_NUMBER 0.
  it('stands the sitters when every link is broken', async () => {
    const f = await fixture(`if (llGetPermissions() & PERMISSION_CHANGE_LINKS) { llBreakAllLinks(); out = [llGetNumberOfPrims()] + llGetObjectDetails(A, [OBJECT_ROOT, OBJECT_LINK_NUMBER]); }
      else llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS);`, { prims: 3 })
    f.sit()
    f.touch()
    f.script.grantPermissions()
    f.linkset.advanceTime(100)
    expect(f.touch()).toEqual([1, AVATAR, 0])
    expect(f.avatar.sittingOn).toBeNull()
  })

  // In-world: llCreateLink(other, TRUE) with an avatar seated put the new prim
  // at link 2 and left the avatar seated as the last link (4 links became 5),
  // with its PRIM_POS_LOCAL, PRIM_ROT_LOCAL, PRIM_POSITION and PRIM_ROTATION
  // unchanged.
  it('keeps the sitter as the last link when a prim is linked in', async () => {
    const READ = 'llGetLinkPrimitiveParams(llGetNumberOfPrims(), [PRIM_POS_LOCAL, PRIM_ROT_LOCAL, PRIM_POSITION, PRIM_ROTATION])'
    const f = await fixture(`if (llGetPermissions() & PERMISSION_CHANGE_LINKS) { llCreateLink("${EXTRA}", TRUE); out = [llGetNumberOfPrims(), llGetLinkName(2), llGetLinkKey(4), llGetLinkKey(5)] + ${READ}; }
      else llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS);`, { prims: 3 })
    await loadLinkset({ world: f.world, region: 'home', owner: AVATAR, position: { x: 117, y: 50, z: 20 }, prims: [{ key: EXTRA, name: 'Extra' }] })
    f.sit()
    f.touch()
    f.script.grantPermissions()
    f.linkset.advanceTime(100)
    expect(f.touch()).toEqual([5, 'Extra', f.linkset.prims[3]!.key, AVATAR, near(TARGET), near(TARGET_ROT),
      near({ x: 116.159808, y: 49.765499, z: 20.782285 }), near({ x: 0.544658, y: -0.025598, z: 0.25755, s: 0.797722 })])
    expect(f.avatar.sittingOn).toBe(f.root)
  })

  // In-world: llCreateLink(other, FALSE) made the other object the root, at
  // <116.6, 50.6, 1997.5> turned 60 degrees about Z. The avatar stayed seated as
  // the last link, and its PRIM_POSITION and PRIM_ROTATION did not change:
  // <116, 48.58587, 1999.185> and the old root's rotation. Its PRIM_POS_LOCAL
  // and PRIM_ROT_LOCAL became relative to the new root: <-2.044288, -0.487452,
  // 1.685298> and <0.241845, -0.241845, -0.243210, 0.907673>. OBJECT_ROOT read
  // the new root.
  it('keeps the sitter in place when the object gets another root', async () => {
    const f = await fixture(`if (llGetPermissions() & PERMISSION_CHANGE_LINKS) {
        llSetLinkPrimitiveParamsFast(a, [PRIM_POS_LOCAL, <0, 0, 2.2>, PRIM_ROT_LOCAL, ZERO_ROTATION]);
        llCreateLink("${EXTRA}", FALSE); a = llGetNumberOfPrims();
        out = [llGetLinkNumber(), a, llGetLinkKey(a)] + llGetLinkPrimitiveParams(a, [PRIM_POS_LOCAL, PRIM_ROT_LOCAL, PRIM_POSITION, PRIM_ROTATION]) + llGetObjectDetails(A, [OBJECT_ROOT]); }
      else llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS);`, { prims: 3 })
    const extra = await loadLinkset({ world: f.world, region: 'home', owner: AVATAR, position: { x: 116.6, y: 50.6, z: 20 }, prims: [{ key: EXTRA, name: 'Extra' }] })
    extra.prims[0]!.params.rotation = yaw(60)
    f.sit()
    f.touch()
    f.script.grantPermissions()
    f.linkset.advanceTime(100)
    f.linkset.touch(1, { avatar: { key: AVATAR, name: 'Test Resident' } })
    expect(f.script.global('out')).toEqual([2, 5, AVATAR, near({ x: -2.044288, y: -0.487452, z: 1.685298 }),
      near({ x: 0.241845, y: -0.241845, z: -0.24321, s: 0.907673 }), near({ x: 116, y: 48.58587, z: 21.6853 }), near(ROOT_ROT), EXTRA])
    expect(f.avatar.sittingOn).toBe(f.root)
  })

  // In-world: llUnSit(llGetLinkKey(avatar link)) stood the avatar: the count
  // dropped inside the same event and changed(32) followed, with the lone box
  // back at link 0.
  it('stands the avatar with llUnSit', async () => {
    const f = await fixture('llUnSit(llGetLinkKey(a)); out = [llGetNumberOfPrims(), llGetLinkNumber()];')
    f.sit()
    expect(f.touch(1)).toEqual([1, 0])
    f.linkset.advanceTime(100)
    expect(f.script.global('log')).toEqual([CHANGED_LINK, 1, 2, CHANGED_LINK, 0, 1])
  })
})

// https://wiki.secondlife.com/wiki/LlGetNumberOfPrims
// https://wiki.secondlife.com/wiki/LlGetLinkNumber
// https://wiki.secondlife.com/wiki/LlGetLinkKey
// Not measured: a second sitter needs a second avatar, which the probes did not
// have. The wiki says "When an avatar sits on an object, it is added to the end
// of the link set and will have the largest link number." It does not say what
// happens when an earlier sitter stands; the later ones moving down a link is
// inferred from link numbers having no gaps.
describe('several sitters, from the wiki', () => {
  it('numbers sitters in seating order and renumbers when one stands', async () => {
    const f = await fixture('out = [llGetNumberOfPrims(), llGetLinkKey(3), llGetLinkKey(4), llGetLinkKey(5)];', { prims: 2, target: 'none' })
    const second = f.world.addAvatar({ region: 'home', username: 'second', position: { x: 116, y: 50, z: 20 } })
    f.world.sitAvatar(second, f.linkset.prims[1]!)
    f.sit()
    expect(f.touch()).toEqual([4, second.key, AVATAR, NULL_KEY])
    f.world.standAvatar(second)
    expect(f.touch()).toEqual([3, AVATAR, NULL_KEY, NULL_KEY])
    f.world.sitAvatar(second, f.linkset.prims[1]!)
    expect(f.touch()).toEqual([4, AVATAR, second.key, NULL_KEY])
  })

  it('keeps a lone prim at link 1 until the last sitter stands', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const first = world.addAvatar({ region: 'home', username: 'first' })
    const second = world.addAvatar({ region: 'home', username: 'second' })
    const a = await loadLinkset({ world, region: 'home', prims: [{}] })
    const b = await loadLinkset({ world, region: 'home', prims: [{}] })
    world.sitAvatar(first, a.linkset.prims[0]!)
    expect(a.linkset.prims[0]!.linkNumber).toBe(1)
    world.sitAvatar(first, b.linkset.prims[0]!)
    expect([a.linkset.prims[0]!.linkNumber, b.linkset.prims[0]!.linkNumber]).toEqual([0, 1])
    second.sittingOn = b.linkset.prims[0]!
    world.standAvatar(first)
    expect(b.linkset.prims[0]!.linkNumber).toBe(1)
    b.linkset.remove()
    expect(second.sittingOn).toBeNull()
  })
})
