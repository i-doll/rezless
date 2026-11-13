import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LINK_THIS documents the LINK_* flags and says
// nothing about link numbers below LINK_THIS (-4).
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm 7.3.0, 2026-11-13).
// The probes were a three-box linkset and a lone box with the same scripts in
// every prim, so each call ran from the root, from child 2 and from child 3. A
// touch ran every call with the link numbers -1, -2, -3, -4, -5, -100 and
// -2147483648. Before each call the script set a known value on every prim
// through its positive link number, and after it read every prim back the same
// way. The runs were repeated with one avatar seated on the root, on child 2 and
// on the lone box. Every "In-world:" note in this file is from those probes.
//
// The seven columns of each expected string are those seven link numbers. In a
// setter row "x" marks a prim the call changed, one letter per prim in link order.

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'
const CHANGED_COLOR = 2

const HELPERS = `
list LINKS = [-1, -2, -3, -4, -5, -100, 0x80000000];
list out; list log; list changes;
integer NP; integer TOT; integer step;
integer pl(integer i) { if (TOT == 1) return LINK_THIS; return i; }
string who(key k)
{
    if (k == NULL_KEY) return "-";
    integer i;
    for (i = 1; i <= NP; ++i) if (llGetLinkKey(pl(i)) == k) return "p" + (string)i;
    return "av";
}
string names(list v) { if (v == []) return "[]"; return llDumpList2String(v, "/"); }
`

type Seat = 'root' | 'child'

/**
 * `count` boxes named p1, p2, ... with the same script in each. Touching a prim
 * runs `body` in that prim's script and returns its `out`.
 */
async function scene(count: number, body: string, seat?: Seat) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({
    region: 'home', key: AVATAR, name: 'av', username: 'av', size: { x: 0.45, y: 0.6, z: 1.65 },
    position: { x: 110, y: 50, z: 20 },
  })
  const source = `${HELPERS}
    default {
      changed(integer c) { changes += [c]; }
      link_message(integer sender, integer num, string str, key id) { log += [num]; }
      touch_start(integer n) {
        NP = llGetObjectPrimCount(llGetKey()); TOT = llGetNumberOfPrims();
        ${body}
      }
    }`
  const { linkset, scripts } = await loadLinkset({
    world, region: 'home', owner: AVATAR, position: { x: 116, y: 50, z: 20 },
    prims: Array.from({ length: count }, (_, i) => ({
      name: `p${i + 1}`,
      scripts: [{ name: `p${i + 1}`, source: { source } }],
    })),
  })
  linkset.prims.forEach((p, i) => { if (i) p.params.position = { x: 0, y: 0.6 * i, z: 0 } })
  for (const s of Object.values(scripts)) s.start()
  if (seat) {
    const prim = linkset.prims[seat === 'child' ? 1 : 0]!
    prim.params.sitTarget = { enabled: true, offset: { x: 0, y: 0, z: 0.6 }, rotation: { x: 0, y: 0, z: 0, s: 1 } }
    expect(world.sitAvatar(avatar, prim)).toBe(true)
    linkset.advanceTime(100)
  }
  const run = (caller = 1) => {
    const prim = linkset.prims[caller - 1]!
    linkset.touch(prim.linkNumber, { avatar: { key: AVATAR, name: 'av' } })
    linkset.advanceTime(600000)
    return (scripts[`p${caller}`]!.global('out') as string[])[0]
  }
  return { world, avatar, linkset, scripts, run }
}

/** Set a known value on every prim, make one call with each link number, and mark the prims it changed. */
const marks = (reset: string, set: string, hit: string) => `
  string r; integer i; integer j;
  for (i = 0; i < 7; ++i) {
    integer L = llList2Integer(LINKS, i);
    for (j = 1; j <= NP; ++j) { integer P = pl(j); ${reset} }
    ${set}
    if (i) r += " ";
    for (j = 1; j <= NP; ++j) { integer P = pl(j); if (${hit}) r += "x"; else r += "-"; }
  }
  out = [r];`

/** Make one read with each link number. */
const reads = (prepare: string, read: string) => `
  string r; integer i; integer j;
  ${prepare}
  for (i = 0; i < 7; ++i) {
    integer L = llList2Integer(LINKS, i);
    if (i) r += " ";
    r += ${read};
  }
  out = [r];`

const DESC = 'llList2String(llGetLinkPrimitiveParams(P, [PRIM_DESC]), 0) == "x"'
const RESET_DESC = 'llSetLinkPrimitiveParamsFast(P, [PRIM_DESC, "-"]);'
const M0 = '968cbad0-4dad-d64e-71b5-72bf13ad051a'
const M1 = '11111111-2222-3333-4444-555555555555'

/** The calls that take LINK_SET, LINK_ALL_OTHERS and LINK_ALL_CHILDREN as groups of prims. */
const GROUP_SETTERS: Record<string, string> = {
  llSetLinkPrimitiveParamsFast: marks(RESET_DESC, 'llSetLinkPrimitiveParamsFast(L, [PRIM_DESC, "x"]);', DESC),
  llSetLinkPrimitiveParams: marks(RESET_DESC, 'llSetLinkPrimitiveParams(L, [PRIM_DESC, "x"]);', DESC),
  'PRIM_LINK_TARGET in llSetLinkPrimitiveParamsFast': marks(RESET_DESC, 'llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_LINK_TARGET, L, PRIM_DESC, "x"]);', DESC),
  'PRIM_LINK_TARGET in llSetPrimitiveParams': marks(RESET_DESC, 'llSetPrimitiveParams([PRIM_LINK_TARGET, L, PRIM_DESC, "x"]);', DESC),
  llSetLinkAlpha: marks(
    'llSetLinkAlpha(P, 0.5, ALL_SIDES);', 'llSetLinkAlpha(L, 0.25, ALL_SIDES);',
    'llList2Float(llGetLinkPrimitiveParams(P, [PRIM_COLOR, 0]), 1) == 0.25'),
  llSetLinkColor: marks(
    'llSetLinkColor(P, <0.5, 0.5, 0.5>, ALL_SIDES);', 'llSetLinkColor(L, <0.25, 0.25, 0.25>, ALL_SIDES);',
    'llList2Vector(llGetLinkPrimitiveParams(P, [PRIM_COLOR, 0]), 0) == <0.25, 0.25, 0.25>'),
  llSetLinkTexture: marks(
    'llSetLinkTexture(P, TEXTURE_BLANK, 0);', 'llSetLinkTexture(L, TEXTURE_PLYWOOD, 0);',
    'llList2String(llGetLinkPrimitiveParams(P, [PRIM_TEXTURE, 0]), 0) == TEXTURE_PLYWOOD'),
  llSetLinkRenderMaterial: marks(
    `llSetLinkRenderMaterial(P, "${M0}", 0);`, `llSetLinkRenderMaterial(L, "${M1}", 0);`,
    `llList2String(llGetLinkPrimitiveParams(P, [PRIM_RENDER_MATERIAL, 0]), 0) == "${M1}"`),
  llSetLinkGLTFOverrides: marks(
    `llSetLinkRenderMaterial(P, "${M0}", 0); llSetLinkGLTFOverrides(P, 0, [OVERRIDE_GLTF_BASE_COLOR_FACTOR, <0.5, 0.5, 0.5>]);`,
    'llSetLinkGLTFOverrides(L, 0, [OVERRIDE_GLTF_BASE_COLOR_FACTOR, <0.25, 0.25, 0.25>]);',
    'llList2Vector(llGetLinkPrimitiveParams(P, [PRIM_GLTF_BASE_COLOR, 0]), 4) == <0.25, 0.25, 0.25>'),
  llSetLinkSitFlags: marks('llSetLinkSitFlags(P, 2);', 'llSetLinkSitFlags(L, 18);', 'llGetLinkSitFlags(P) & 16'),
}

const SIT_TARGET = marks(
  'llLinkSitTarget(P, <0.0, 0.0, 0.5>, ZERO_ROTATION);', 'llLinkSitTarget(L, <0.0, 0.0, 0.6>, ZERO_ROTATION);',
  'llList2Vector(llGetLinkPrimitiveParams(P, [PRIM_SIT_TARGET]), 1) == <0.0, 0.0, 0.6>')

describe('link numbers below LINK_THIS in calls that take groups of links', () => {
  // In-world: llSetLinkPrimitiveParamsFast, llSetLinkPrimitiveParams, PRIM_LINK_TARGET
  // inside llSetLinkPrimitiveParamsFast and llSetPrimitiveParams, llSetLinkAlpha, llSetLinkColor, llSetLinkTexture,
  // llSetLinkRenderMaterial, llSetLinkGLTFOverrides and llSetLinkSitFlags all gave
  // the same rows. From the root: xxx -xx -xx x-- -x- -x- -x-. From child 2:
  // xxx x-x -xx -x- x-- x-- x--. From child 3: xxx xx- -xx --x x-- x-- x--.
  // LINK_SET, LINK_ALL_OTHERS and LINK_ALL_CHILDREN are groups, and -5, -100 and
  // -2147483648 are the first link that is not the caller: link 2 from the root,
  // the root from a child. All ten gave the same rows with an avatar seated on the
  // root and with it seated on child 2.
  describe.each(Object.entries(GROUP_SETTERS))('%s', (_, body) => {
    it.each([
      [1, 'xxx -xx -xx x-- -x- -x- -x-'],
      [2, 'xxx x-x -xx -x- x-- x-- x--'],
      [3, 'xxx xx- -xx --x x-- x-- x--'],
    ])('sets the first other prim from link %i of a linkset', async (caller, want) => {
      expect((await scene(3, body)).run(caller)).toBe(want)
      expect((await scene(3, body, 'root')).run(caller)).toBe(want)
      expect((await scene(3, body, 'child')).run(caller)).toBe(want)
    })

    // In-world: on a lone box only LINK_SET and LINK_THIS changed it (x - - x - - -),
    // for all ten calls, with nobody seated and with an avatar seated on it. Seated, the first other
    // link is the avatar, and none of these values can be set on an avatar.
    it('sets nothing on a lone prim, seated or not', async () => {
      expect((await scene(1, body)).run()).toBe('x - - x - - -')
      expect((await scene(1, body, 'root')).run()).toBe('x - - x - - -')
    })
  })

  // In-world: llMessageLinked with each link number, from the root: LINK_SET reached
  // links 1, 2 and 3, LINK_ALL_OTHERS and LINK_ALL_CHILDREN links 2 and 3, LINK_THIS
  // link 1, and -5, -100 and -2147483648 link 2 only. From child 2 and from child 3
  // the last three reached link 1 only. Seated on the root and seated on child 2
  // gave the same.
  it.each([
    [1, [[0, 3], [0, 1, 2, 4, 5, 6], [0, 1, 2]]],
    [2, [[0, 1, 4, 5, 6], [0, 2, 3], [0, 1, 2]]],
    [3, [[0, 1, 4, 5, 6], [0, 1, 2], [0, 2, 3]]],
  ])('llMessageLinked reaches the first other prim from link %i', async (caller, want) => {
    for (const seat of [undefined, 'root', 'child'] as const) {
      const s = await scene(3, 'integer i; for (i = 0; i < 7; ++i) llMessageLinked(llList2Integer(LINKS, i), i, "", "");', seat)
      s.run(caller)
      expect([1, 2, 3].map((p) => s.scripts[`p${p}`]!.global('log'))).toEqual(want)
    }
  })

  // In-world: from a lone box, seated or not, only LINK_SET and LINK_THIS delivered.
  it('llMessageLinked reaches nothing below LINK_THIS on a lone prim', async () => {
    for (const seat of [undefined, 'root'] as const) {
      const s = await scene(1, 'integer i; for (i = 0; i < 7; ++i) llMessageLinked(llList2Integer(LINKS, i), i, "", "");', seat)
      s.run()
      expect(s.scripts.p1!.global('log')).toEqual([0, 3])
    }
  })

  // In-world: seated on a lone box, llSetLinkPrimitiveParamsFast(L, [PRIM_ROT_LOCAL, r])
  // turned the box for LINK_SET and LINK_THIS, nothing for LINK_ALL_OTHERS and
  // LINK_ALL_CHILDREN, and the avatar for -5, -100 and -2147483648
  // (box/avatar: x- -- -- x- -x -x -x). The groups hold prims only.
  it('moves the sitter of a lone prim for a link number below LINK_THIS', async () => {
    const s = await scene(1, `
      string r; integer i; integer j;
      for (i = 0; i < 7; ++i) {
        list before;
        for (j = 1; j <= 2; ++j) before += llGetLinkPrimitiveParams(j, [PRIM_ROT_LOCAL]);
        llSetLinkPrimitiveParamsFast(llList2Integer(LINKS, i), [PRIM_ROT_LOCAL, llEuler2Rot(<0.0, 0.0, 0.1 * (i + 1)>)]);
        if (i) r += " ";
        for (j = 1; j <= 2; ++j) {
          if (llList2Rot(llGetLinkPrimitiveParams(j, [PRIM_ROT_LOCAL]), 0) != llList2Rot(before, j - 1)) r += "x"; else r += "-";
        }
      }
      out = [r];`, 'root')
    expect(s.run()).toBe('x- -- -- x- -x -x -x')
  })

  // In-world: seated on a lone box, PRIM_LINK_TARGET -5 inside
  // llSetLinkPrimitiveParamsFast(LINK_THIS, ...) and PRIM_LINK_TARGET -100 inside
  // llSetPrimitiveParams each turned the avatar. [PRIM_DESC, "y", PRIM_ROT_LOCAL, r]
  // on link -5 changed neither the description nor the avatar: the avatar link's
  // rules apply, and a rule an avatar does not take ends the list.
  it('applies the avatar link rules through a link number below LINK_THIS', async () => {
    const s = await scene(1, `
      rotation a = llEuler2Rot(<0.0, 0.0, 1.0>); rotation b = llEuler2Rot(<0.0, 0.0, 2.0>);
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_LINK_TARGET, -5, PRIM_ROT_LOCAL, a]);
      out = [llList2Rot(llGetLinkPrimitiveParams(2, [PRIM_ROT_LOCAL]), 0) == a];
      llSetPrimitiveParams([PRIM_LINK_TARGET, -100, PRIM_ROT_LOCAL, b]);
      out += llGetLinkPrimitiveParams(2, [PRIM_ROT_LOCAL]);
      llSetLinkPrimitiveParamsFast(-5, [PRIM_DESC, "y", PRIM_ROT_LOCAL, a]);
      out += llGetLinkPrimitiveParams(2, [PRIM_ROT_LOCAL]) + [llGetObjectDesc()];`, 'root')
    s.run()
    const b = { x: 0, y: 0, z: expect.closeTo(Math.sin(1), 5), s: expect.closeTo(Math.cos(1), 5) }
    expect(s.scripts.p1!.global('out')).toEqual([1, b, b, ''])
  })

  // In-world: seated on a lone box, one call a second. llSetLinkAlpha raised
  // changed(CHANGED_COLOR) for LINK_SET and LINK_THIS with the new alpha, nothing for
  // LINK_ALL_OTHERS and LINK_ALL_CHILDREN, and changed(CHANGED_COLOR) with the alpha
  // unchanged for -5, -100 and -2147483648: the event an avatar link raises.
  // llSetLinkColor did the same.
  it.each([
    ['llSetLinkAlpha(L, 0.3 + 0.02 * step, ALL_SIDES);', 'llList2Float(c, 1)', [0.3, 0.3, 0.3, 0.36, 0.36, 0.36, 0.36]],
    ['llSetLinkColor(L, <0.1, 0.1, 0.1> * (step + 1), ALL_SIDES);', 'llList2Vector(c, 0) * <1.0, 0.0, 0.0>', [0.1, 0.1, 0.1, 0.4, 0.4, 0.4, 0.4]],
  ])('raises the avatar link colour event for a link number below LINK_THIS: %s', async (call, value, values) => {
    const s = await scene(1, `
      integer L = llList2Integer(LINKS, step);
      if (step == 0) changes = [];
      ${call}
      list c = llGetLinkPrimitiveParams(LINK_THIS, [PRIM_COLOR, 0]);
      out += [${value}];
      ++step;`, 'root')
    const events: number[] = []
    for (let i = 0; i < 7; i++) {
      s.run()
      events.push((s.scripts.p1!.global('changes') as number[]).length)
    }
    expect(s.scripts.p1!.global('out')).toEqual(values.map((v) => expect.closeTo(v, 5)))
    expect(events).toEqual([1, 1, 1, 2, 3, 4, 5])
    expect(new Set(s.scripts.p1!.global('changes') as number[])).toEqual(new Set([CHANGED_COLOR]))
  })

  // llLinkPlaySound, llLinkStopSound, llLinkAdjustSoundVolume, llLinkSetSoundQueueing,
  // llLinkSetSoundRadius and llSetLinkTextureAnim are not measured: no script can read
  // a prim's sound or texture animation back, and the viewer tools used for the
  // probes do not report them. Their wiki pages document the LINK_* flags as
  // groups, so they follow the rule every measured group call follows.
  it.each([
    [1, 1],
    [3, 0],
  ])('gives the sound and texture animation calls the shared group rule from link %i', async (caller, other) => {
    const SOUND = 'caae27c6-6dd3-495e-9cc2-a3f94cb60568'
    const s = await scene(3, `
      if (step == 0) {
        llLinkPlaySound(-5, "${SOUND}", 1.0, SOUND_LOOP);
        llLinkAdjustSoundVolume(-100, 0.25);
        llLinkSetSoundRadius(-100, 7.0);
        llLinkSetSoundQueueing(0x80000000, TRUE);
        llSetLinkTextureAnim(-5, ANIM_ON | LOOP, ALL_SIDES, 2, 2, 0.0, 4.0, 1.0);
      } else llLinkStopSound(-5);
      ++step;`)
    s.run(caller)
    s.linkset.prims.forEach((prim, i) => {
      const hit = i === other
      expect(prim.sound).toMatchObject({ current: hit ? { sound: SOUND, volume: 0.25 } : null, radius: hit ? 7 : 0, queueing: hit })
      expect(prim.params.textureAnim).toMatchObject({ sizex: hit ? 2 : 0, sizey: hit ? 2 : 0 })
    })
    s.run(caller)
    expect(s.linkset.prims[other]!.sound.current).toBeNull()
  })

  // Not measured either, for the same reason: on a lone prim there is no other link
  // until someone sits, and then the other link is the avatar, which is taken to
  // have no sound or texture animation to set.
  it('gives the sound and texture animation calls no link below LINK_THIS on a lone prim', async () => {
    for (const seat of [undefined, 'root'] as const) {
      const s = await scene(1, `
        llLinkPlaySound(-5, "caae27c6-6dd3-495e-9cc2-a3f94cb60568", 1.0, SOUND_LOOP);
        llLinkSetSoundRadius(-100, 7.0);
        llSetLinkTextureAnim(-5, ANIM_ON | LOOP, ALL_SIDES, 2, 2, 0.0, 4.0, 1.0);`, seat)
      s.run()
      expect(s.linkset.prims[0]!.sound).toMatchObject({ current: null, radius: 0 })
      expect(s.linkset.prims[0]!.params.textureAnim).toMatchObject({ sizex: 0 })
    }
  })
})

describe('negative link numbers in calls that take one link', () => {
  // In-world: llLinkSitTarget takes one link. LINK_SET, LINK_ALL_OTHERS,
  // LINK_ALL_CHILDREN, -5, -100 and -2147483648 each set the first link that is not
  // the caller, and LINK_THIS the caller. From the root: -x- -x- -x- x-- -x- -x- -x-.
  // From child 2: x-- x-- x-- -x- x-- x-- x--. From child 3: x-- x-- x-- --x x-- x-- x--.
  it.each([
    [1, '-x- -x- -x- x-- -x- -x- -x-'],
    [2, 'x-- x-- x-- -x- x-- x-- x--'],
    [3, 'x-- x-- x-- --x x-- x-- x--'],
  ])('llLinkSitTarget sets the first other prim from link %i', async (caller, want) => {
    expect((await scene(3, SIT_TARGET)).run(caller)).toBe(want)
  })

  // In-world: on a lone box, seated or not, only LINK_THIS set its sit target
  // (- - - x - - -). LINK_SET did not.
  it('llLinkSitTarget sets a lone prim only through LINK_THIS', async () => {
    expect((await scene(1, SIT_TARGET)).run()).toBe('- - - x - - -')
    expect((await scene(1, SIT_TARGET, 'root')).run()).toBe('- - - x - - -')
  })

  // In-world: with sit flags 2, 18 and 34 on links 1, 2 and 3, llGetLinkSitFlags
  // read 18 18 18 2 18 18 18 from the root, 2 2 2 18 2 2 2 from child 2 and
  // 2 2 2 34 2 2 2 from child 3.
  const SIT_FLAGS = reads(
    'for (j = 1; j <= NP; ++j) llSetLinkSitFlags(pl(j), llList2Integer([2, 18, 34], j - 1));',
    '(string)(llGetLinkSitFlags(L) & ~SIT_FLAG_SIT_TARGET)')
  it.each([
    [1, '18 18 18 2 18 18 18'],
    [2, '2 2 2 18 2 2 2'],
    [3, '2 2 2 34 2 2 2'],
  ])('llGetLinkSitFlags reads the first other prim from link %i', async (caller, want) => {
    expect((await scene(3, SIT_FLAGS)).run(caller)).toBe(want)
  })

  // In-world: a lone box read 0 0 0 2 0 0 0, and 0 0 0 3 0 0 0 with an avatar on its
  // sit target: the first other link is then the avatar. On the avatar link of one
  // seated avatar llGetLinkSitFlags read 0 and PRIM_SIT_FLAGS read 2. The 3 is 2 plus
  // SIT_FLAG_SIT_TARGET, which the grid reports while a prim has a sit target. That
  // bit is a separate change, so the reads here mask it out.
  it('llGetLinkSitFlags reads 0 below LINK_THIS on a lone prim', async () => {
    expect((await scene(1, SIT_FLAGS)).run()).toBe('0 0 0 2 0 0 0')
    expect((await scene(1, SIT_FLAGS, 'root')).run()).toBe('0 0 0 2 0 0 0')
    const both = await scene(1, 'out = [(string)llGetLinkSitFlags(2) + "/" + llDumpList2String(llGetLinkPrimitiveParams(2, [PRIM_SIT_FLAGS]), "")];', 'root')
    expect(both.run()).toBe('0/2')
  })

  // In-world: llAvatarOnLinkSitTarget with the avatar on the root's sit target read
  // NULL_KEY for every number but LINK_THIS from the root, and the avatar for every
  // number but LINK_THIS from child 2 and from child 3. With the avatar on child 2's
  // sit target the root read the avatar for every number but LINK_THIS (its first
  // other link is link 2), child 2 read it for LINK_THIS only, and child 3 never.
  const ON_TARGET = reads('', 'who(llAvatarOnLinkSitTarget(L))')
  it.each([
    ['root', 1, '- - - av - - -'],
    ['root', 2, 'av av av - av av av'],
    ['root', 3, 'av av av - av av av'],
    ['child', 1, 'av av av - av av av'],
    ['child', 2, '- - - av - - -'],
    ['child', 3, '- - - - - - -'],
  ] as const)('llAvatarOnLinkSitTarget with the avatar on the %s reads the first other prim from link %i', async (seat, caller, want) => {
    expect((await scene(3, ON_TARGET, seat)).run(caller)).toBe(want)
  })

  // In-world: seated on a lone box, only LINK_THIS read the avatar. The first other
  // link is the avatar itself, which has no sit target.
  it('llAvatarOnLinkSitTarget reads NULL_KEY below LINK_THIS on a seated lone prim', async () => {
    expect((await scene(1, ON_TARGET, 'root')).run()).toBe('- - - av - - -')
    expect((await scene(1, ON_TARGET)).run()).toBe('- - - - - - -')
  })

  // In-world: link 0 in llAvatarOnLinkSitTarget, llGetLinkSitFlags and llLinkSitTarget
  // is the root seen from a child and no link seen from the root, as in llGetLinkKey.
  // With sit flags 2, 18 and 34 and the avatar on the root's sit target, the root read
  // NULL_KEY and 0 and set no sit target; children 2 and 3 read the avatar and the
  // root's flags and set the root's sit target. A lone box read its own flags and set
  // its own sit target through link 0 until an avatar sat on it, then 0 and nothing.
  const ZERO = `
    integer j;
    for (j = 1; j <= NP; ++j) { llSetLinkSitFlags(pl(j), llList2Integer([2, 18, 34], j - 1)); llLinkSitTarget(pl(j), <0.0, 0.0, 0.5>, ZERO_ROTATION); }
    string r = who(llAvatarOnLinkSitTarget(0)) + " " + (string)(llGetLinkSitFlags(0) & ~SIT_FLAG_SIT_TARGET) + " ";
    llLinkSitTarget(0, <0.0, 0.0, 0.6>, ZERO_ROTATION);
    for (j = 1; j <= NP; ++j) { if (llList2Vector(llGetLinkPrimitiveParams(pl(j), [PRIM_SIT_TARGET]), 1) == <0.0, 0.0, 0.6>) r += "x"; else r += "-"; }
    out = [r];`
  it('reads link 0 as the root from a child and as nothing from the root', async () => {
    expect((await scene(3, ZERO, 'root')).run(1)).toBe('- 0 ---')
    expect((await scene(3, ZERO, 'root')).run(2)).toBe('av 2 x--')
    expect((await scene(3, ZERO, 'root')).run(3)).toBe('av 2 x--')
    expect((await scene(3, ZERO)).run(3)).toBe('- 2 x--')
    expect((await scene(1, ZERO)).run()).toBe('- 2 x')
    expect((await scene(1, ZERO, 'root')).run()).toBe('- 0 -')
  })

  // The media calls were measured from the root and a child for an earlier change
  // (media.test.ts). In-world, for this one: llSetLinkMedia with LINK_SET, LINK_ALL_OTHERS, LINK_ALL_CHILDREN, -5,
  // -100 and -2147483648, each on its own face 0 to 5, put all six on link 1 from
  // child 3, on the avatar (link 2) seated on a lone box, and nowhere on a lone box
  // nobody sits on. llGetLinkMedia after llSetLinkMedia put a different URL on faces 0
  // and 1 of every link: from child 3 every number but LINK_THIS read link 1's URL;
  // seated on a lone box they read the avatar's. llClearLinkMedia(-100, 0) and
  // llClearLinkMedia(-2147483648, 1) cleared those faces on that link only. On a lone
  // box nobody sits on, only LINK_THIS read anything.
  const MEDIA = `
    string r; integer i; integer j;
    for (i = 0; i < 7; ++i) if (i != 3) llSetLinkMedia(llList2Integer(LINKS, i), i - (i > 3), [PRIM_MEDIA_HOME_URL, "https://example.invalid/set"]);
    for (j = 1; j <= TOT; ++j) {
      integer faces;
      for (i = 0; i < 6; ++i) faces += llGetLinkMedia(pl(j), i, [PRIM_MEDIA_HOME_URL]) != [];
      r += (string)faces;
    }
    r += " ";
    for (j = 1; j <= TOT; ++j) {
      llSetLinkMedia(pl(j), 0, [PRIM_MEDIA_HOME_URL, "https://example.invalid/L" + (string)j]);
      llSetLinkMedia(pl(j), 1, [PRIM_MEDIA_HOME_URL, "https://example.invalid/L" + (string)j]);
    }
    for (i = 0; i < 7; ++i) {
      list v = llGetLinkMedia(llList2Integer(LINKS, i), 0, [PRIM_MEDIA_HOME_URL]);
      if (i) r += " ";
      if (v == []) r += "[]"; else r += llGetSubString(llList2String(v, 0), -2, -1);
    }
    llClearLinkMedia(-100, 0); llClearLinkMedia(0x80000000, 1);
    for (j = 1; j <= TOT; ++j) r += " " + (string)llGetListLength(llGetLinkMedia(pl(j), 0, [PRIM_MEDIA_HOME_URL]) + llGetLinkMedia(pl(j), 1, [PRIM_MEDIA_HOME_URL]));
    out = [r];`
  it('the media calls read, set and clear the first other link', async () => {
    expect((await scene(3, MEDIA)).run(3)).toBe('600 L1 L1 L1 L3 L1 L1 L1 0 2 2')
    expect((await scene(1, MEDIA, 'root')).run()).toBe('06 L2 L2 L2 L1 L2 L2 L2 2 0')
    expect((await scene(1, MEDIA)).run()).toBe('0 [] [] [] L1 [] [] [] 2')
  })

  // In-world: seated on a lone box, llSetLinkMedia with -1, -3, -5 and -100 on faces 0
  // to 3 returned 0 and put all four on the avatar and none on the box;
  // llGetLinkMedia with the same numbers read them back; llClearLinkMedia with the
  // same numbers returned 0 and emptied the four avatar faces.
  it('sets, reads and clears the sitter\'s media through -1, -3, -5 and -100', async () => {
    const s = await scene(1, `
      string r; integer k; integer j; list ls = [-1, -3, -5, -100];
      for (k = 0; k < 4; ++k) r += (string)llSetLinkMedia(llList2Integer(ls, k), k, [PRIM_MEDIA_HOME_URL, "https://example.invalid/" + (string)k]);
      r += " ";
      for (j = 1; j <= 2; ++j) for (k = 0; k < 4; ++k) r += (string)(llGetLinkMedia(j, k, [PRIM_MEDIA_HOME_URL]) != []);
      r += " ";
      for (k = 0; k < 4; ++k) r += llGetSubString(llList2String(llGetLinkMedia(llList2Integer(ls, k), k, [PRIM_MEDIA_HOME_URL]), 0), -1, -1);
      r += " ";
      for (k = 0; k < 4; ++k) r += (string)llClearLinkMedia(llList2Integer(ls, k), k);
      r += " ";
      for (k = 0; k < 4; ++k) r += (string)(llGetLinkMedia(2, k, [PRIM_MEDIA_HOME_URL]) != []);
      out = [r];`, 'root')
    expect(s.run()).toBe('0000 00001111 0123 0000 0000')
  })

  // In-world: seated on a lone box, llSetLinkMedia(2, ALL_SIDES, ...), llGetLinkMedia(2,
  // ALL_SIDES, ...) and llClearLinkMedia(2, ALL_SIDES) on the avatar link each said
  // "PRIM_MEDIA error: ALL_SIDES not supported" on DEBUG_CHANNEL; set and clear
  // returned 1004, the read returned [], and no face took media. The box link did the
  // same. In-world the avatar's name is on the message for the avatar link; here the
  // script says it.
  it('refuses ALL_SIDES on an avatar link as on a prim', async () => {
    const s = await scene(1, `
      out = [(string)llSetLinkMedia(2, ALL_SIDES, [PRIM_MEDIA_HOME_URL, "https://example.invalid/a"])
        + names(llGetLinkMedia(2, ALL_SIDES, [PRIM_MEDIA_HOME_URL])) + (string)llClearLinkMedia(2, ALL_SIDES)
        + names(llGetLinkMedia(2, 0, [PRIM_MEDIA_HOME_URL])) + (string)llSetLinkMedia(1, ALL_SIDES, [PRIM_MEDIA_HOME_URL, "https://example.invalid/a"])];`, 'root')
    expect(s.run()).toBe('1004[]1004[]1004')
    expect(s.scripts.p1!.chat.filter((c) => c.channel === 2147483647).map((c) => c.text)).toEqual(Array(4).fill('PRIM_MEDIA error: ALL_SIDES not supported'))
  })

  // In-world: llGetPrimMediaParams(ALL_SIDES, ...), llGetLinkMedia(LINK_THIS, ALL_SIDES,
  // ...) and llGetLinkMedia(LINK_THIS, -2, ...) on a box each said the ALL_SIDES error
  // and returned []. On face 6 of the box and on face 45 of the avatar link,
  // llSetLinkMedia and llClearLinkMedia returned 1003, llGetLinkMedia returned [], and
  // each call said "PRIM_MEDIA error: face N on object K not found", K being the
  // box's key or the avatar's.
  it('says which face is missing, on a prim and on an avatar link', async () => {
    const s = await scene(1, `
      string r = names(llGetPrimMediaParams(ALL_SIDES, [PRIM_MEDIA_HOME_URL])) + names(llGetLinkMedia(LINK_THIS, -2, [PRIM_MEDIA_HOME_URL]));
      list links = [1, 2]; list faces = [6, 45]; integer i;
      for (i = 0; i < 2; ++i) {
        integer L = llList2Integer(links, i); integer F = llList2Integer(faces, i);
        r += " " + (string)llSetLinkMedia(L, F, [PRIM_MEDIA_HOME_URL, "https://example.invalid/a"]) + names(llGetLinkMedia(L, F, [PRIM_MEDIA_HOME_URL])) + (string)llClearLinkMedia(L, F);
      }
      out = [r];`, 'root')
    expect(s.run()).toBe('[][] 1003[]1003 1003[]1003')
    const box = `PRIM_MEDIA error: face 6 on object ${s.linkset.prims[0]!.key} not found`
    const av = `PRIM_MEDIA error: face 45 on object ${AVATAR} not found`
    expect(s.scripts.p1!.chat.filter((c) => c.channel === 2147483647).map((c) => c.text)).toEqual([
      'PRIM_MEDIA error: ALL_SIDES not supported', 'PRIM_MEDIA error: ALL_SIDES not supported', box, box, box, av, av, av,
    ])
  })

  // In-world: seated on a lone box, one call every three seconds. llClearLinkMedia on
  // an avatar-link face that held no media (face 4 through link 2, face 0 through -5
  // and through 2, and a face cleared three seconds earlier) returned 0 and raised no
  // event. Setting a face and clearing a face that held media each raised
  // changed(CHANGED_MEDIA). A set and a clear of one face inside one event left one
  // more CHANGED_MEDIA for the next clear of that face; that is not modelled.
  it('raises no event for clearing an avatar-link face that holds no media', async () => {
    const s = await scene(1, `
      if (step == 0) changes = [];
      if (step == 0) out += llClearLinkMedia(2, 4);
      if (step == 1) out += llClearLinkMedia(-5, 0);
      if (step == 2) out += llSetLinkMedia(2, 1, [PRIM_MEDIA_HOME_URL, "https://example.invalid/a"]);
      if (step == 3) out += llClearLinkMedia(2, 1);
      if (step == 4) out += llClearLinkMedia(2, 1);
      ++step;`, 'root')
    const events: number[] = []
    for (let i = 0; i < 5; i++) {
      s.run()
      events.push((s.scripts.p1!.global('changes') as number[]).length)
    }
    expect(s.scripts.p1!.global('out')).toEqual([0, 0, 0, 0, 0])
    expect(events).toEqual([0, 0, 1, 2, 2])
    expect(new Set(s.scripts.p1!.global('changes') as number[])).toEqual(new Set([2048]))
  })

  // In-world: seated on a lone box, llSetLinkCamera with -5, -100, -2147483648,
  // LINK_SET, LINK_ALL_OTHERS and LINK_ALL_CHILDREN left the camera at the default on
  // the next sit; LINK_THIS and link 1 stored the offsets. The first other link is
  // the avatar, which keeps no camera offsets.
  it('llSetLinkCamera stores nothing below LINK_THIS on a seated lone prim', async () => {
    const s = await scene(1, `
      integer i;
      for (i = 0; i < 7; ++i) if (i != 3) llSetLinkCamera(llList2Integer(LINKS, i), <-4.0, 1.0, 2.0>, <2.0, 1.0, 2.0>);`, 'root')
    s.run()
    expect(s.linkset.prims[0]!.cameraEyeOffset).toEqual({ x: 0, y: 0, z: 0 })
    expect(s.linkset.prims[0]!.cameraAtOffset).toEqual({ x: 0, y: 0, z: 0 })
    for (const link of ['LINK_THIS', '1']) {
      const stored = await scene(1, `llSetLinkCamera(${link}, <-4.0, 1.0, 2.0>, <2.0, 1.0, 2.0>);`, 'root')
      stored.run()
      expect(stored.linkset.prims[0]!.cameraEyeOffset).toEqual({ x: -4, y: 1, z: 2 })
      expect(stored.linkset.prims[0]!.cameraAtOffset).toEqual({ x: 2, y: 1, z: 2 })
    }
  })
})

describe('negative link numbers in llGetLinkPrimitiveParams', () => {
  // In-world: llGetLinkPrimitiveParams(L, [PRIM_NAME]) read [] for LINK_SET,
  // LINK_ALL_OTHERS and LINK_ALL_CHILDREN, the caller for LINK_THIS, and the first
  // other link for -5, -100 and -2147483648: link 2 from the root, the root from
  // children 2 and 3, the avatar from a seated lone box, nothing from a lone box.
  const GET = reads('', 'names(llGetLinkPrimitiveParams(L, [PRIM_NAME]))')
  it('reads the first other link below LINK_THIS and nothing for the groups', async () => {
    expect((await scene(3, GET)).run(1)).toBe('[] [] [] p1 p2 p2 p2')
    expect((await scene(3, GET)).run(2)).toBe('[] [] [] p2 p1 p1 p1')
    expect((await scene(3, GET, 'root')).run(3)).toBe('[] [] [] p3 p1 p1 p1')
    expect((await scene(1, GET)).run()).toBe('[] [] [] p1 [] [] []')
    expect((await scene(1, GET, 'root')).run()).toBe('[] [] [] p1 av av av')
  })

  // In-world: PRIM_LINK_TARGET inside a read takes one link, so the group flags
  // read the first other link too. llGetLinkPrimitiveParams(LINK_THIS,
  // [PRIM_LINK_TARGET, L, PRIM_NAME]) and llGetPrimitiveParams([PRIM_LINK_TARGET, L,
  // PRIM_NAME]) read p2 p2 p2 p1 p2 p2 p2 from the root, p1 p1 p1 p2 p1 p1 p1 from
  // child 2, p1 p1 p1 p3 p1 p1 p1 from child 3, [] for all but LINK_THIS on a lone
  // box, and the avatar for all but LINK_THIS on a seated lone box.
  it.each([
    'names(llGetLinkPrimitiveParams(LINK_THIS, [PRIM_LINK_TARGET, L, PRIM_NAME]))',
    'names(llGetPrimitiveParams([PRIM_LINK_TARGET, L, PRIM_NAME]))',
  ])('reads the first other link for every negative PRIM_LINK_TARGET but LINK_THIS: %s', async (read) => {
    const body = reads('', read)
    expect((await scene(3, body)).run(1)).toBe('p2 p2 p2 p1 p2 p2 p2')
    expect((await scene(3, body)).run(2)).toBe('p1 p1 p1 p2 p1 p1 p1')
    expect((await scene(3, body)).run(3)).toBe('p1 p1 p1 p3 p1 p1 p1')
    expect((await scene(1, body)).run()).toBe('[] [] [] p1 [] [] []')
    expect((await scene(1, body, 'root')).run()).toBe('av av av p1 av av av')
  })

  // In-world: inside a read, PRIM_LINK_TARGET counts from the link the call started
  // on, not from the calling prim. From any caller of a three-box linkset,
  // llGetLinkPrimitiveParams(n, [PRIM_LINK_TARGET, t, PRIM_NAME]) read, for n = 1, 2
  // and 3: LINK_THIS -> p1, p2, p3 (the starting link); -5 and LINK_SET -> p2, p1, p1
  // (the first link that is not the starting link); 0 -> [], p1, p1 (the root, seen
  // from a child). The starting link stays the reference after a PRIM_LINK_TARGET:
  // (3, [PRIM_NAME, PRIM_LINK_TARGET, 2, PRIM_NAME, PRIM_LINK_TARGET, LINK_THIS,
  // PRIM_NAME, PRIM_LINK_TARGET, -5, PRIM_NAME]) read p3, p2, p3, p1.
  it.each([1, 2, 3])('counts PRIM_LINK_TARGET in a read from the starting link (caller %i)', async (caller) => {
    const s = await scene(3, `
      string r; integer n;
      for (n = 1; n <= 3; ++n) {
        r += names(llGetLinkPrimitiveParams(n, [PRIM_LINK_TARGET, LINK_THIS, PRIM_NAME])) + " "
          + names(llGetLinkPrimitiveParams(n, [PRIM_LINK_TARGET, -5, PRIM_NAME])) + " "
          + names(llGetLinkPrimitiveParams(n, [PRIM_LINK_TARGET, LINK_SET, PRIM_NAME])) + " "
          + names(llGetLinkPrimitiveParams(n, [PRIM_LINK_TARGET, 0, PRIM_NAME])) + ", ";
      }
      r += names(llGetLinkPrimitiveParams(3, [PRIM_NAME, PRIM_LINK_TARGET, 2, PRIM_NAME, PRIM_LINK_TARGET, LINK_THIS, PRIM_NAME, PRIM_LINK_TARGET, -5, PRIM_NAME]));
      out = [r];`)
    expect(s.run(caller)).toBe('p1 p2 p2 [], p2 p1 p1 p1, p3 p1 p1 p1, p3/p2/p3/p1')
  })

  // In-world: llGetLinkPrimitiveParams(-5, [PRIM_NAME, PRIM_LINK_TARGET, LINK_THIS,
  // PRIM_NAME, PRIM_LINK_TARGET, -5, PRIM_NAME]) read p2, p2, p1 from the root and p1,
  // p1, p2 from children 2 and 3. Seated on the root, starting on the avatar link 4:
  // LINK_THIS read the avatar, and -5 and LINK_SET read p1.
  it('counts PRIM_LINK_TARGET from a starting link that was itself a first other link', async () => {
    const body = 'out = [names(llGetLinkPrimitiveParams(-5, [PRIM_NAME, PRIM_LINK_TARGET, LINK_THIS, PRIM_NAME, PRIM_LINK_TARGET, -5, PRIM_NAME]))];'
    expect((await scene(3, body)).run(1)).toBe('p2/p2/p1')
    expect((await scene(3, body)).run(2)).toBe('p1/p1/p2')
    expect((await scene(3, body)).run(3)).toBe('p1/p1/p2')
    const seated = await scene(3, `out = [names(llGetLinkPrimitiveParams(4, [PRIM_LINK_TARGET, LINK_THIS, PRIM_NAME])
      + llGetLinkPrimitiveParams(4, [PRIM_LINK_TARGET, -5, PRIM_NAME]) + llGetLinkPrimitiveParams(4, [PRIM_LINK_TARGET, LINK_SET, PRIM_NAME]))];`, 'root')
    expect(seated.run(3)).toBe('av/p1/p1')
  })

  // In-world: a read that starts on no link returns [] whatever follows:
  // llGetLinkPrimitiveParams(99, ...), (LINK_SET, ...) and, from the root, (0, ...),
  // each with [PRIM_LINK_TARGET, LINK_THIS, PRIM_NAME] or [PRIM_LINK_TARGET, 2,
  // PRIM_NAME], read []. A PRIM_LINK_TARGET that names no link ends the read:
  // (2, [PRIM_LINK_TARGET, 99, PRIM_NAME, PRIM_LINK_TARGET, LINK_THIS, PRIM_NAME]) read [].
  it('reads nothing once a read is on no link', async () => {
    const s = await scene(3, `
      out = [names(llGetLinkPrimitiveParams(99, [PRIM_LINK_TARGET, LINK_THIS, PRIM_NAME])
        + llGetLinkPrimitiveParams(99, [PRIM_LINK_TARGET, 2, PRIM_NAME])
        + llGetLinkPrimitiveParams(LINK_SET, [PRIM_LINK_TARGET, LINK_THIS, PRIM_NAME])
        + llGetLinkPrimitiveParams(LINK_SET, [PRIM_LINK_TARGET, 2, PRIM_NAME])
        + llGetLinkPrimitiveParams(0, [PRIM_LINK_TARGET, LINK_THIS, PRIM_NAME])
        + llGetLinkPrimitiveParams(2, [PRIM_LINK_TARGET, 99, PRIM_NAME, PRIM_LINK_TARGET, LINK_THIS, PRIM_NAME]))];`)
    expect(s.run(1)).toBe('[]')
  })

  // In-world: the read ends at any PRIM_LINK_TARGET that names no link, whatever
  // comes after. With L = LINK_THIS, T = PRIM_LINK_TARGET and N = PRIM_NAME:
  // (L, [T, 1, N, T, L, N, T, 0, N]) read p1, p1 from the root (link 0 ended it),
  // p1, p3, p1 from child 3 and [] from a lone box, where link 1 names nothing.
  // (L, [T, 0, N, T, 1, N]) read [] from the root, p1, p1 from child 3 and p1 from a
  // lone box. Seated on the lone box the two reads gave p1, p1 and [], as from a root.
  it('ends a read at a PRIM_LINK_TARGET that names no link', async () => {
    const body = `out = [names(llGetLinkPrimitiveParams(LINK_THIS, [PRIM_LINK_TARGET, 1, PRIM_NAME, PRIM_LINK_TARGET, LINK_THIS, PRIM_NAME, PRIM_LINK_TARGET, 0, PRIM_NAME]))
      + " " + names(llGetLinkPrimitiveParams(LINK_THIS, [PRIM_LINK_TARGET, 0, PRIM_NAME, PRIM_LINK_TARGET, 1, PRIM_NAME]))];`
    expect((await scene(3, body)).run(1)).toBe('p1/p1 []')
    expect((await scene(3, body)).run(3)).toBe('p1/p3/p1 p1/p1')
    expect((await scene(1, body)).run()).toBe('[] p1')
    expect((await scene(1, body, 'root')).run()).toBe('p1/p1 []')
  })

  // In-world: with the read started on another link than the caller, LINK_ALL_OTHERS,
  // LINK_ALL_CHILDREN, -100 and -2147483648 as PRIM_LINK_TARGET each read p2 for a
  // start on link 1 and p1 for a start on links 2 and 3, from every caller. Started
  // on the avatar link of a seated linkset, those four and link 0 read p1.
  it.each([1, 2, 3])('counts every negative PRIM_LINK_TARGET from the starting link (caller %i)', async (caller) => {
    const s = await scene(3, `
      string r; integer n; integer t; list ts = [LINK_ALL_OTHERS, LINK_ALL_CHILDREN, -100, 0x80000000, 0];
      for (n = 1; n <= 4; ++n) {
        for (t = 0; t < 5; ++t) r += names(llGetLinkPrimitiveParams(n, [PRIM_LINK_TARGET, llList2Integer(ts, t), PRIM_NAME]));
        r += " ";
      }
      out = [r];`, 'root')
    expect(s.run(caller)).toBe('p2p2p2p2[] p1p1p1p1p1 p1p1p1p1p1 p1p1p1p1p1 ')
  })

  // In-world: inside a set call PRIM_LINK_TARGET counts from the calling prim
  // whatever link the call started on. From child 3,
  // llSetLinkPrimitiveParamsFast(n, [PRIM_LINK_TARGET, t, PRIM_DESC, "x"]) for n = 1,
  // 2, 3, LINK_SET and -5 set: LINK_THIS -> --x, -5 -> x--, LINK_ALL_OTHERS -> xx-.
  it('counts PRIM_LINK_TARGET in a set call from the calling prim', async () => {
    const s = await scene(3, `
      string r; integer i; integer j; integer k;
      list starts = [1, 2, 3, LINK_SET, -5]; list targets = [LINK_THIS, -5, LINK_ALL_OTHERS];
      for (i = 0; i < 5; ++i) for (k = 0; k < 3; ++k) {
        for (j = 1; j <= 3; ++j) llSetLinkPrimitiveParamsFast(j, [PRIM_DESC, "-"]);
        llSetLinkPrimitiveParamsFast(llList2Integer(starts, i), [PRIM_LINK_TARGET, llList2Integer(targets, k), PRIM_DESC, "x"]);
        for (j = 1; j <= 3; ++j) r += llList2String(llGetLinkPrimitiveParams(j, [PRIM_DESC]), 0);
        r += " ";
      }
      out = [r];`)
    expect(s.run(3)).toBe('--x x-- xx- '.repeat(5))
  })
})

describe('llBreakLink keeps its own rule', () => {
  // https://wiki.secondlife.com/wiki/LlBreakLink
  // In-world: on a five-box object b1 to b5 with PERMISSION_CHANGE_LINKS, child b4
  // called llBreakLink(-5): b2 left, and b4 became link 3. It then called
  // llBreakLink(-100): b3, the new link 2, left. A negative number other than
  // LINK_THIS is link 2 whichever prim calls, not the first other link, which from a
  // child would be the root.
  it('breaks link 2 for a number below LINK_THIS called from a child', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const { linkset, scripts } = await loadLinkset({
      world, region: 'home', owner: AVATAR, position: { x: 116, y: 50, z: 20 },
      prims: [1, 2, 3, 4, 5].map((i) => ({
        name: `b${i}`,
        scripts: i === 4 ? [{ name: 'b', source: { source: `integer k; list out;
          default {
            state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
            touch_start(integer n) {
              llBreakLink(llList2Integer([-5, -100], k)); ++k;
              string r; integer i;
              for (i = 1; i <= llGetNumberOfPrims(); ++i) r += llGetLinkName(i);
              out += [r, llGetLinkNumber()];
            }
          }` } }] : [],
      })),
    })
    const script = scripts.b!
    script.start()
    script.grantPermissions()
    linkset.advanceTime(100)
    for (let i = 0; i < 2; i++) {
      linkset.touch(linkset.prims.find((p) => p.name === 'b4')!.linkNumber)
      linkset.advanceTime(100)
    }
    expect(script.global('out')).toEqual(['b1b3b4b5', 3, 'b1b4b5', 2])
  })
})

describe('negative link numbers in calls that read nothing for them', () => {
  // In-world: llGetLinkNumberOfSides (a hollow box, a cylinder and a sphere: 7, 3 and
  // 1 sides), llIsLinkGLTFMaterial and llGetObjectLinkKey(llGetKey(), L) answered for
  // LINK_THIS only, from the root and from both children, seated or not: 0 0 0 n 0 0 0
  // sides, FALSE, and NULL_KEY for every other negative number.
  it.each([1, 2, 3])('reads only LINK_THIS from link %i', async (caller) => {
    const SIDES = `
      llSetLinkPrimitiveParamsFast(1, [PRIM_TYPE, PRIM_TYPE_BOX, 0, <0.0, 1.0, 0.0>, 0.5, ZERO_VECTOR, <1.0, 1.0, 0.0>, ZERO_VECTOR]);
      llSetLinkPrimitiveParamsFast(2, [PRIM_TYPE, PRIM_TYPE_CYLINDER, 0, <0.0, 1.0, 0.0>, 0.0, ZERO_VECTOR, <1.0, 1.0, 0.0>, ZERO_VECTOR]);
      llSetLinkPrimitiveParamsFast(3, [PRIM_TYPE, PRIM_TYPE_SPHERE, 0, <0.0, 1.0, 0.0>, 0.0, ZERO_VECTOR, <0.0, 1.0, 0.0>]);
      llSetLinkRenderMaterial(LINK_SET, "${M0}", 0);
      string r; integer i;
      for (i = 0; i < 7; ++i) {
        integer L = llList2Integer(LINKS, i);
        if (i) r += " ";
        r += (string)llGetLinkNumberOfSides(L) + (string)llIsLinkGLTFMaterial(L, 0) + who(llGetObjectLinkKey(llGetKey(), L));
      }
      out = [r];`
    const s = await scene(3, SIDES, 'root')
    expect(s.run(caller)).toBe(`00- 00- 00- ${[7, 3, 1][caller - 1]}1p${caller} 00- 00- 00-`)
    expect((await scene(3, SIDES)).run(caller)).toBe(`00- 00- 00- ${[7, 3, 1][caller - 1]}1p${caller} 00- 00- 00-`)
  })
})
