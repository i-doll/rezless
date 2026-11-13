import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LINK_ROOT says link 0 is a lone prim and 1 the
// root of a linkset. It does not say what link 0 names inside a linkset.
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm 7.3.0, 2026-11-13).
// The probes were a three-box linkset and a lone box with the same scripts in
// every prim, so each call ran from the root, from child 2 and from child 3.
// Before each call the script set a known value on every prim through its
// positive link number, made the call with link 0 and a value no other call
// used, and read every prim back. The runs were repeated with one avatar
// seated on the root and on the lone box, and a shorter set with the avatar on
// child 2's sit target. Every "In-world:" note in this file is from those probes.
//
// In-world, every call that could be measured gave the same answer but
// llGetObjectLinkKey, whose link 0 is the root from any prim. Link 0 is the root
// when a child prim calls, with or without a sitter. From the root of a linkset
// it names nothing. A lone prim is link 0 itself until an avatar sits on it;
// then the prim is link 1 and link 0 names nothing.
//
// In a setter row "x" marks a prim the call changed, one letter per prim in link order.

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'

const HELPERS = `
list out; list log;
integer NP; integer TOT; integer step;
integer pl(integer i) { if (TOT == 1) return LINK_THIS; return i; }
string who(key k)
{
    if (k == NULL_KEY) return "-";
    integer i;
    for (i = 1; i <= TOT; ++i) if (llGetLinkKey(pl(i)) == k) return (string)i;
    return "?";
}
string last(string n) { return llGetSubString(n, -1, -1); }
string flags()
{
    string r; integer i;
    for (i = 1; i <= TOT; ++i) {
        integer P = pl(i);
        if (i > 1) r += " ";
        r += (string)llGetLinkSitFlags(P) + "/" + llDumpList2String(llGetLinkPrimitiveParams(P, [PRIM_SIT_FLAGS, PRIM_ALLOW_UNSIT, PRIM_SCRIPTED_SIT_ONLY]), "/");
    }
    return r;
}
string texts()
{
    string r; integer i;
    for (i = 1; i <= NP; ++i) {
        list v = llGetLinkPrimitiveParams(pl(i), [PRIM_DESC, PRIM_TEXT]);
        if (i > 1) r += ",";
        r += llList2String(v, 0) + llList2String(v, 1);
    }
    return r;
}
clear() { integer i; for (i = 1; i <= NP; ++i) llSetLinkPrimitiveParamsFast(pl(i), [PRIM_DESC, "-", PRIM_TEXT, "", <1.0, 1.0, 1.0>, 1.0]); }
`

/**
 * `count` boxes named p1, p2, ... with the same script in each. Touching a prim
 * runs `body` in that prim's script and returns its `out`.
 */
async function scene(count: number, body: string, seated: boolean | number = false) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({
    region: 'home', key: AVATAR, name: 'av', username: 'av', size: { x: 0.45, y: 0.6, z: 1.65 },
    position: { x: 110, y: 50, z: 20 },
  })
  const source = `${HELPERS}
    default {
      link_message(integer sender, integer num, string str, key id) { log += [sender]; }
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
  if (seated) {
    const prim = linkset.prims[seated === true ? 0 : seated - 1]!
    prim.params.sitTarget = { enabled: true, offset: { x: 0, y: 0, z: 0.6 }, rotation: { x: 0, y: 0, z: 0, s: 1 } }
    expect(world.sitAvatar(avatar, prim)).toBe(true)
    linkset.advanceTime(100)
  }
  const run = (caller = 1) => {
    const prim = linkset.prims[caller - 1]!
    linkset.touch(prim.linkNumber, { avatar: { key: AVATAR, name: 'av' } })
    linkset.advanceTime(600000)
    return (scripts[`p${caller}`]!.global('out') as unknown[])[0]
  }
  return { world, avatar, linkset, scripts, run }
}

/** Set a known value on every prim, make one call with link 0, and mark the prims it changed. */
const marks = (reset: string, set: string, hit: string) => `
  string r; integer j;
  for (j = 1; j <= NP; ++j) { integer P = pl(j); ${reset} }
  ${set}
  for (j = 1; j <= NP; ++j) { integer P = pl(j); if (${hit}) r += "x"; else r += "-"; }
  out = [r];`

const descIs = (v: string) => `llList2String(llGetLinkPrimitiveParams(P, [PRIM_DESC]), 0) == "${v}"`
const RESET_DESC = 'llSetLinkPrimitiveParamsFast(P, [PRIM_DESC, "-"]);'
const M0 = '968cbad0-4dad-d64e-71b5-72bf13ad051a'
const M1 = '11111111-2222-3333-4444-555555555555'

/** The calls that take LINK_SET, LINK_ALL_OTHERS and LINK_ALL_CHILDREN as groups of prims. */
const GROUP_SETTERS: Record<string, string> = {
  llSetLinkPrimitiveParamsFast: marks(RESET_DESC, 'llSetLinkPrimitiveParamsFast(0, [PRIM_DESC, "v1"]);', descIs('v1')),
  llSetLinkPrimitiveParams: marks(RESET_DESC, 'llSetLinkPrimitiveParams(0, [PRIM_DESC, "v2"]);', descIs('v2')),
  'PRIM_LINK_TARGET in llSetLinkPrimitiveParamsFast': marks(RESET_DESC, 'llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_LINK_TARGET, 0, PRIM_DESC, "v3"]);', descIs('v3')),
  'PRIM_LINK_TARGET in llSetPrimitiveParams': marks(RESET_DESC, 'llSetPrimitiveParams([PRIM_LINK_TARGET, 0, PRIM_DESC, "v4"]);', descIs('v4')),
  'PRIM_LINK_TARGET in llSetLinkPrimitiveParamsFast on the last prim': marks(RESET_DESC, 'llSetLinkPrimitiveParamsFast(pl(NP), [PRIM_LINK_TARGET, 0, PRIM_DESC, "v5"]);', descIs('v5')),
  'PRIM_LINK_TARGET in llSetLinkPrimitiveParamsFast on LINK_SET': marks(RESET_DESC, 'llSetLinkPrimitiveParamsFast(LINK_SET, [PRIM_LINK_TARGET, 0, PRIM_DESC, "v6"]);', descIs('v6')),
  'PRIM_LINK_TARGET in llSetLinkPrimitiveParams': marks(RESET_DESC, 'llSetLinkPrimitiveParams(LINK_THIS, [PRIM_LINK_TARGET, 0, PRIM_DESC, "v7"]);', descIs('v7')),
  llSetLinkAlpha: marks(
    'llSetLinkAlpha(P, 0.5, ALL_SIDES);', 'llSetLinkAlpha(0, 0.25, ALL_SIDES);',
    'llList2Float(llGetLinkPrimitiveParams(P, [PRIM_COLOR, 0]), 1) == 0.25'),
  llSetLinkColor: marks(
    'llSetLinkColor(P, <0.5, 0.5, 0.5>, ALL_SIDES);', 'llSetLinkColor(0, <0.25, 0.5, 0.5>, ALL_SIDES);',
    'llList2Vector(llGetLinkPrimitiveParams(P, [PRIM_COLOR, 0]), 0) == <0.25, 0.5, 0.5>'),
  llSetLinkTexture: marks(
    'llSetLinkTexture(P, TEXTURE_BLANK, 0);', 'llSetLinkTexture(0, TEXTURE_PLYWOOD, 0);',
    'llList2String(llGetLinkPrimitiveParams(P, [PRIM_TEXTURE, 0]), 0) == TEXTURE_PLYWOOD'),
  llSetLinkRenderMaterial: marks(
    `llSetLinkRenderMaterial(P, "${M0}", 0);`, `llSetLinkRenderMaterial(0, "${M1}", 0);`,
    `llList2String(llGetLinkPrimitiveParams(P, [PRIM_RENDER_MATERIAL, 0]), 0) == "${M1}"`),
  llSetLinkGLTFOverrides: marks(
    `llSetLinkRenderMaterial(P, "${M0}", 0); llSetLinkGLTFOverrides(P, 0, [OVERRIDE_GLTF_BASE_COLOR_FACTOR, <0.5, 0.5, 0.5>]);`,
    'llSetLinkGLTFOverrides(0, 0, [OVERRIDE_GLTF_BASE_COLOR_FACTOR, <0.25, 0.5, 0.5>]);',
    'llList2Vector(llGetLinkPrimitiveParams(P, [PRIM_GLTF_BASE_COLOR, 0]), 4) == <0.25, 0.5, 0.5>'),
  llSetLinkSitFlags: marks('llSetLinkSitFlags(P, 2);', 'llSetLinkSitFlags(0, 18);', 'llGetLinkSitFlags(P) & 16'),
}

describe('link 0 in calls that take groups of links', () => {
  // In-world: llSetLinkPrimitiveParamsFast, llSetLinkPrimitiveParams, PRIM_LINK_TARGET 0
  // inside llSetLinkPrimitiveParamsFast (started on LINK_THIS, on the last prim and on
  // LINK_SET), inside llSetLinkPrimitiveParams and inside llSetPrimitiveParams,
  // llSetLinkAlpha, llSetLinkColor, llSetLinkTexture, llSetLinkRenderMaterial,
  // llSetLinkGLTFOverrides and llSetLinkSitFlags changed nothing from the root (---)
  // and the root only from child 2 and from child 3 (x--). Seated on the root gave
  // the same rows. A lone box changed itself (x), and nothing with an avatar seated
  // on it (-). With the avatar on child 2's sit target every call gave the same
  // rows from the root, child 2 and child 3.
  describe.each(Object.entries(GROUP_SETTERS))('%s', (_name, body) => {
    it.each([
      [1, '---'],
      [2, 'x--'],
      [3, 'x--'],
    ])('from link %i of a linkset', async (caller, want) => {
      expect((await scene(3, body)).run(caller)).toBe(want)
      expect((await scene(3, body, true)).run(caller)).toBe(want)
      expect((await scene(3, body, 2)).run(caller)).toBe(want)
    })

    it('on a lone prim, seated or not', async () => {
      expect((await scene(1, body)).run()).toBe('x')
      expect((await scene(1, body, true)).run()).toBe('-')
    })
  })

  // In-world: llMessageLinked(0, ...) from the root reached no prim. From child 2
  // and from child 3 it reached the root only, with the child as sender. Seated on
  // the root and seated on child 2 gave the same. A lone box got its own message
  // with sender 0, and nothing with an avatar seated on it.
  it.each([
    [1, [[], [], []]],
    [2, [[2], [], []]],
    [3, [[3], [], []]],
  ])('llMessageLinked(0) from link %i of a linkset', async (caller, want) => {
    for (const seated of [false, true, 2]) {
      const s = await scene(3, 'llMessageLinked(0, 1, "", "");', seated)
      s.run(caller)
      expect([1, 2, 3].map((p) => s.scripts[`p${p}`]!.global('log'))).toEqual(want)
    }
  })

  it('llMessageLinked(0) on a lone prim, seated or not', async () => {
    const lone = await scene(1, 'llMessageLinked(0, 1, "", "");')
    lone.run()
    expect(lone.scripts.p1!.global('log')).toEqual([0])
    const seated = await scene(1, 'llMessageLinked(0, 1, "", "");', true)
    seated.run()
    expect(seated.scripts.p1!.global('log')).toEqual([])
  })

  const TARGETS = [
    [1, 3, false, -1],
    [2, 3, false, 0],
    [3, 3, false, 0],
    [1, 3, true, -1],
    [2, 3, true, 0],
    [3, 3, true, 0],
    [1, 1, false, 0],
    [1, 1, true, -1],
  ] as const

  // In-world: llLinkParticleSystem(0, ...) with bright particles, read from
  // snapshots of the three boxes. Nothing emitted when the root called; the root
  // emitted when child 2 and when child 3 called, with nobody seated and with an
  // avatar seated on the root; a lone box emitted, and did not with an avatar
  // seated on it.
  it.each(TARGETS)('llLinkParticleSystem(0) from link %i of %i prims, seated %s', async (caller, count, seated, target) => {
    const s = await scene(count, 'llLinkParticleSystem(0, [PSYS_PART_MAX_AGE, 2.0]);', seated)
    s.run(caller)
    expect(s.linkset.prims.map((prim) => prim.particles !== null)).toEqual(s.linkset.prims.map((_, i) => i === target))
  })

  // The link sound calls and llSetLinkTextureAnim with link 0 are not measured. No
  // script can read a prim's sound or texture animation back, a snapshot cannot
  // show a sound, and the snapshots showed no texture animation even on a prim
  // that animated itself. A person would have to watch the prims in a rendering
  // viewer, with sound beacons on for the sound calls. They resolve links through
  // the same resolver as every measured group call.
  const SOUND = 'caae27c6-6dd3-495e-9cc2-a3f94cb60568'
  const UNREAD = `
    if (step == 0) {
      llLinkPlaySound(0, "${SOUND}", 1.0, SOUND_LOOP);
      llLinkAdjustSoundVolume(0, 0.25);
      llLinkSetSoundRadius(0, 7.0);
      llLinkSetSoundQueueing(0, TRUE);
      llSetLinkTextureAnim(0, ANIM_ON | LOOP, ALL_SIDES, 2, 2, 0.0, 4.0, 1.0);
    } else llLinkStopSound(0);
    ++step;`
  it.each(TARGETS)('gives the sound and texture animation calls the shared rule from link %i of %i prims, seated %s', async (caller, count, seated, target) => {
    const s = await scene(count, UNREAD, seated)
    s.run(caller)
    s.linkset.prims.forEach((prim, i) => {
      const hit = i === target
      expect(prim.sound).toMatchObject({ current: hit ? { sound: SOUND, volume: 0.25 } : null, radius: hit ? 7 : 0, queueing: hit })
      expect(prim.params.textureAnim).toMatchObject({ sizex: hit ? 2 : 0, sizey: hit ? 2 : 0 })
    })
    s.run(caller)
    expect(s.linkset.prims.every((prim) => prim.sound.current === null)).toBe(true)
  })
})

describe('link 0 in calls that take one link', () => {
  // In-world: llSetLinkCamera(0, eye, at), then the avatar sat on the root and the
  // root's script read llGetCameraPos. Set from the root the camera stayed at the
  // default; set from child 3 and from child 2 the camera took the new eye
  // offset. Set while the avatar sat on the root, from child 3 and then from the
  // root, the next sit used child 3's offsets. A lone box stored offsets set
  // through link 0 while nobody sat on it, and did not while seated (the next sit
  // still used the earlier offsets).
  it.each([
    [1, 3, false, -1],
    [2, 3, false, 0],
    [3, 3, false, 0],
    [3, 3, true, 0],
    [1, 3, true, -1],
    [1, 1, false, 0],
    [1, 1, true, -1],
  ])('llSetLinkCamera(0) from link %i of %i prims, seated %s', async (caller, count, seated, target) => {
    const s = await scene(count, 'llSetLinkCamera(0, <-4.0, 1.0, 5.0>, <2.0, 1.0, 5.0>);', seated)
    s.run(caller)
    expect(s.linkset.prims.map((prim) => prim.cameraEyeOffset.z === 5)).toEqual(s.linkset.prims.map((_, i) => i === target))
  })

  // In-world: with media on face 0 of every prim, llGetLinkMedia(0, ...) read
  // nothing from the root and the root's media from child 2 and child 3, seated or
  // not. llSetLinkMedia(0, ...) returned 0 from every caller and changed the
  // root's media from the children only. A lone box read and set its own media,
  // and nothing with an avatar seated on it.
  const MEDIA = `
    string U = "https://example.com/"; integer j; string r;
    for (j = 1; j <= NP; ++j) llSetLinkMedia(pl(j), 0, [PRIM_MEDIA_HOME_URL, U + "p" + (string)j]);
    list g = llGetLinkMedia(0, 0, [PRIM_MEDIA_HOME_URL]);
    if (g == []) r = "none"; else r = last(llList2String(g, 0));
    r += " " + (string)llSetLinkMedia(0, 0, [PRIM_MEDIA_HOME_URL, U + "v"]) + ":";
    for (j = 1; j <= NP; ++j) r += last(llList2String(llGetLinkMedia(pl(j), 0, [PRIM_MEDIA_HOME_URL]), 0));
    out = [r];`
  it.each([
    [1, 3, false, 'none 0:123'],
    [2, 3, false, '1 0:v23'],
    [3, 3, false, '1 0:v23'],
    [1, 3, true, 'none 0:123'],
    [3, 3, true, '1 0:v23'],
    [1, 1, false, '1 0:v'],
    [1, 1, true, 'none 0:1'],
  ])('the link media calls with link 0 from link %i of %i prims, seated %s', async (caller, count, seated, want) => {
    expect((await scene(count, MEDIA, seated)).run(caller)).toBe(want)
  })
})

describe('link 0 in the calls that take one link, continued', () => {
  // In-world: with media on face 0 of every prim, llClearLinkMedia(0, 0) returned 0
  // and cleared nothing from the root (xxx), the root's face from child 2 and from
  // child 3 (-xx), with nobody seated, with the avatar on child 2's sit target and
  // on the root's. A lone box cleared its own face.
  const CLEAR = `
    integer j; string r;
    for (j = 1; j <= NP; ++j) llSetLinkMedia(pl(j), 0, [PRIM_MEDIA_HOME_URL, "https://example.com/"]);
    r = (string)llClearLinkMedia(0, 0) + ":";
    for (j = 1; j <= NP; ++j) { if (llGetLinkMedia(pl(j), 0, [PRIM_MEDIA_HOME_URL]) == []) r += "-"; else r += "x"; }
    out = [r];`
  it.each([
    [1, 3, false, '0:xxx'],
    [3, 3, false, '0:-xx'],
    [1, 3, 2, '0:xxx'],
    [2, 3, 2, '0:-xx'],
    [3, 3, 2, '0:-xx'],
    [1, 3, true, '0:xxx'],
    [1, 1, false, '0:-'],
  ])('llClearLinkMedia(0) from link %i of %i prims, seated %s', async (caller, count, seated, want) => {
    expect((await scene(count, CLEAR, seated)).run(caller)).toBe(want)
  })
})

describe('link 0 in the reads that answer LINK_THIS only below zero', () => {
  // In-world: the root was a hollow box (7 sides), child 2 a box (6) and child 3 a
  // cut box (7), with a PBR material on face 0 of the root, face 1 of child 2 and
  // face 2 of child 3. llGetLinkNumberOfSides(0) read 0 from the root and 7 from
  // child 2 and child 3. llIsLinkGLTFMaterial(0, face) for faces 0, 1 and 2 read
  // 000 from the root and 100, the root's faces, from both children; the caller's
  // own faces would have read 010 and 001. Seated on the root gave the same. A
  // lone box read itself (7 and 100), and 0 and 000 with an avatar seated on it.
  // From child 3 the side count alone does not tell the root from the caller; the
  // material read does.
  const READS = `
    integer j;
    for (j = 1; j <= NP; ++j) {
      vector cut = <0.0, 1.0, 0.0>; float hollow = 0.0;
      if (j == 1) hollow = 0.5;
      if (j == 3) cut = <0.0, 0.75, 0.0>;
      llSetLinkPrimitiveParamsFast(pl(j), [PRIM_TYPE, PRIM_TYPE_BOX, PRIM_HOLE_DEFAULT, cut, hollow, ZERO_VECTOR, <1.0, 1.0, 0.0>, ZERO_VECTOR]);
      llSetLinkRenderMaterial(pl(j), "${M0}", j - 1);
    }
    out = [(string)llGetLinkNumberOfSides(0) + " " + (string)llIsLinkGLTFMaterial(0, 0) + (string)llIsLinkGLTFMaterial(0, 1) + (string)llIsLinkGLTFMaterial(0, 2)];`
  it.each([
    [1, 3, false, '0 000'],
    [2, 3, false, '7 100'],
    [3, 3, false, '7 100'],
    [1, 3, true, '0 000'],
    [2, 3, true, '7 100'],
    [3, 3, true, '7 100'],
    [1, 1, false, '7 100'],
    [1, 1, true, '0 000'],
  ])('llGetLinkNumberOfSides(0) and llIsLinkGLTFMaterial(0) from link %i of %i prims, seated %s', async (caller, count, seated, want) => {
    expect((await scene(count, READS, seated)).run(caller)).toBe(want)
  })

  // In-world: llGetObjectLinkKey(id, link) with the key of every link as id, from
  // the root, child 2 and child 3. Link 0 and link 1 gave the root for every id, and
  // LINK_THIS gave id itself. With an avatar seated, its key as id gave the root for
  // links 0 and 1 and the avatar for LINK_THIS, on the linkset and on the lone box.
  const OBJECT_LINK_KEY = `
    integer j; string r;
    for (j = 1; j <= TOT; ++j) {
      key id = llGetLinkKey(pl(j));
      if (j > 1) r += " ";
      r += who(llGetObjectLinkKey(id, 0)) + who(llGetObjectLinkKey(id, 1)) + who(llGetObjectLinkKey(id, LINK_THIS));
    }
    out = [r];`
  it.each([
    [1, 3, false, '111 112 113'],
    [3, 3, false, '111 112 113'],
    [1, 3, true, '111 112 113 114'],
    [2, 3, true, '111 112 113 114'],
    [1, 1, false, '111'],
    [1, 1, true, '111 112'],
  ])('llGetObjectLinkKey from link %i of %i prims, seated %s', async (caller, count, seated, want) => {
    expect((await scene(count, OBJECT_LINK_KEY, seated)).run(caller)).toBe(want)
  })

  // In-world: llGetObjectLinkKey(avatar, link) for links 0, 1, 2, 3, 4, 5, LINK_THIS,
  // LINK_ROOT, LINK_SET and -5, with the avatar on the root's sit target and on
  // child 2's, from every prim: the root, the root, links 2, 3 and 4 (the avatar),
  // NULL_KEY, the avatar, the root, NULL_KEY, NULL_KEY. A script in another object
  // got the same keys. For an avatar that
  // sat on nothing, links 0, 1, LINK_THIS and LINK_ROOT gave the avatar's key and
  // links 2, 3, LINK_SET, LINK_ALL_OTHERS, LINK_ALL_CHILDREN and -5 NULL_KEY.
  const AVATAR_LINKS = `
    list ls = [0, 1, 2, 3, 4, 5, LINK_THIS, LINK_ROOT, LINK_SET, LINK_ALL_OTHERS, LINK_ALL_CHILDREN, -5];
    integer j; string r;
    for (j = 0; j < 12; ++j) {
      key k = llGetObjectLinkKey("${AVATAR}", llList2Integer(ls, j));
      if (k == (key)"${AVATAR}") r += "a"; else if (k == NULL_KEY) r += "-"; else r += who(k);
    }
    out = [r];`
  it('llGetObjectLinkKey with an avatar as id', async () => {
    expect((await scene(3, AVATAR_LINKS, true)).run(1)).toBe('1123a-a1----')
    expect((await scene(3, AVATAR_LINKS, 2)).run(3)).toBe('1123a-a1----')
    expect((await scene(3, AVATAR_LINKS)).run(2)).toBe('aa----aa----')
    expect((await scene(1, AVATAR_LINKS)).run()).toBe('aa----aa----')
    const seated = await scene(3, AVATAR_LINKS, 2)
    const { scripts } = await loadLinkset({
      world: seated.world, region: 'home', owner: AVATAR, position: { x: 120, y: 50, z: 20 },
      prims: [{ name: 'other', scripts: [{ name: 'other', source: { source: `${HELPERS}
        default { state_entry() {
          list ls = [0, 1, 2, 3, 4, 5, LINK_THIS, LINK_ROOT, LINK_SET, -5]; integer j;
          for (j = 0; j < 10; ++j) out += [llGetObjectLinkKey("${AVATAR}", llList2Integer(ls, j))];
        } }` } }] }],
    })
    scripts.other!.start()
    const [p1, p2, p3] = seated.linkset.prims.map((prim) => prim.key)
    const none = '00000000-0000-0000-0000-000000000000'
    expect(scripts.other!.global('out')).toEqual([p1, p1, p2, p3, AVATAR, none, AVATAR, p1, none, none])
  })
})

describe('link 0 on an attachment', () => {
  // In-world: a three-box linkset worn on the left hand (point 5) and a lone box
  // worn on the right hand (point 6). llGetLinkKey(0), llGetLinkNumberOfSides(0) and llGetLinkSitFlags(0)
  // read NULL_KEY, 0 and 0 from the root and the root (its key, 6 and 2) from child 2
  // and child 3. llMessageLinked(0, ...) reached nothing from the root and the root
  // from each child. The lone box read itself and got its own message with sender 0.
  const WORN = 'llMessageLinked(0, 1, "", ""); out = [who(llGetLinkKey(0)) + " " + (string)llGetLinkNumberOfSides(0) + " " + (string)llGetLinkSitFlags(0)];'
  it.each([
    [1, 3, '- 0 0', []],
    [2, 3, '1 6 2', [2]],
    [3, 3, '1 6 2', [3]],
    [1, 1, '1 6 2', [0]],
  ])('from link %i of %i worn prims', async (caller, count, want, heard) => {
    const s = await scene(count, WORN)
    s.linkset.attachToAvatar(AVATAR, count > 1 ? 5 : 6)
    expect(s.run(caller)).toBe(want)
    expect(Object.values(s.scripts).map((script) => script.global('log'))).toEqual([heard, [], []].slice(0, count))
  })
})

// https://wiki.secondlife.com/wiki/LlGetLinkSitFlags lists SIT_FLAG_SIT_TARGET (1) as
// a flag that says the prim has a sit target, next to SIT_FLAG_ALLOW_UNSIT (2),
// SIT_FLAG_SCRIPTED_ONLY (4), SIT_FLAG_NO_COLLIDE (16) and SIT_FLAG_NO_DAMAGE (32).
describe('sit flags', () => {
  const run = async (count: number, code: string[], seated = false) => {
    const body = `${code.map((c) => `${c} log += [flags()];`).join('\n')}\nout = [llDumpList2String(log, "|")];`
    return String((await scene(count, body, seated)).run()).split('|')
  }

  // Each entry is llGetLinkSitFlags / PRIM_SIT_FLAGS / PRIM_ALLOW_UNSIT / PRIM_SCRIPTED_SIT_ONLY, one per link.
  //
  // In-world: a new linkset read 2/2/1/0 on every prim. With flags 18, 34 and 6 set
  // on links 1, 2 and 3 and no sit target anywhere, they read back as set, and 6
  // turned PRIM_SCRIPTED_SIT_ONLY on. llLinkSitTarget on link 1 made it read 19, and
  // on link 2 made that read 35, in both calls. Removing the sit target from link 1
  // put it back to 18 and left link 2 at 35. llLinkSitTarget(2, ZERO_VECTOR, rot)
  // with a quarter turn as rot removed link 2's sit target and its bit.
  it('adds SIT_FLAG_SIT_TARGET to a prim that has a sit target', async () => {
    expect(await run(3, [
      '',
      'llSetLinkSitFlags(1, 18); llSetLinkSitFlags(2, 34); llSetLinkSitFlags(3, 6);',
      'llLinkSitTarget(1, <0.0, 0.0, 0.5>, ZERO_ROTATION);',
      'llLinkSitTarget(2, <0.0, 0.0, 0.5>, ZERO_ROTATION);',
      'llLinkSitTarget(1, ZERO_VECTOR, ZERO_ROTATION);',
      'llLinkSitTarget(2, ZERO_VECTOR, <0.0, 0.0, 0.7071068, 0.7071068>);',
    ])).toEqual([
      '2/2/1/0 2/2/1/0 2/2/1/0',
      '18/18/1/0 34/34/1/0 6/6/1/1',
      '19/19/1/0 34/34/1/0 6/6/1/1',
      '19/19/1/0 35/35/1/0 6/6/1/1',
      '18/18/1/0 35/35/1/0 6/6/1/1',
      '18/18/1/0 34/34/1/0 6/6/1/1',
    ])
  })

  // In-world, from flags 18, 34 and 6 with no sit targets: llSetLinkSitFlags(3, 17)
  // read back 16, with no sit target made and PRIM_ALLOW_UNSIT off. A sit target on
  // link 1 and then llSetLinkSitFlags(1, 32) read 33, the sit target still there.
  // [PRIM_SIT_FLAGS, 5] on link 3 read 4 and [PRIM_SIT_FLAGS, 4] on link 1 read 5.
  // So a script cannot set or clear the bit: it follows the sit target.
  it('ignores SIT_FLAG_SIT_TARGET in the flags a script sets', async () => {
    expect(await run(3, [
      'llSetLinkSitFlags(1, 18); llSetLinkSitFlags(2, 34); llSetLinkSitFlags(3, 6); llSetLinkSitFlags(3, 17);',
      'llLinkSitTarget(1, <0.0, 0.0, 0.5>, ZERO_ROTATION); llSetLinkSitFlags(1, 32);',
      'llSetLinkPrimitiveParamsFast(3, [PRIM_SIT_FLAGS, 5]); llSetLinkPrimitiveParamsFast(1, [PRIM_SIT_FLAGS, 4]);',
      'log += [llList2String(llGetLinkPrimitiveParams(1, [PRIM_SIT_TARGET]), 0) + llList2String(llGetLinkPrimitiveParams(3, [PRIM_SIT_TARGET]), 0)];',
    ])).toEqual([
      '18/18/1/0 34/34/1/0 16/16/0/0',
      '33/33/0/0 34/34/1/0 16/16/0/0',
      '5/5/0/1 34/34/1/0 4/4/0/1',
      '10',
      '5/5/0/1 34/34/1/0 4/4/0/1',
    ])
  })

  // In-world, on link 2 with flags 34: [PRIM_SIT_TARGET, TRUE, <0, 0, 0.4>, ZERO_ROTATION]
  // read 35, the same with FALSE read 34, [PRIM_SIT_TARGET, TRUE, ZERO_VECTOR,
  // ZERO_ROTATION] read 35 with PRIM_SIT_TARGET reading TRUE, and FALSE read 34.
  it('follows a sit target set through PRIM_SIT_TARGET', async () => {
    expect((await run(3, [
      'llSetLinkSitFlags(2, 34); llSetLinkPrimitiveParamsFast(2, [PRIM_SIT_TARGET, TRUE, <0.0, 0.0, 0.4>, ZERO_ROTATION]);',
      'llSetLinkPrimitiveParamsFast(2, [PRIM_SIT_TARGET, FALSE, <0.0, 0.0, 0.4>, ZERO_ROTATION]);',
      'llSetLinkPrimitiveParamsFast(2, [PRIM_SIT_TARGET, TRUE, ZERO_VECTOR, ZERO_ROTATION]);',
      'llSetLinkPrimitiveParamsFast(2, [PRIM_SIT_TARGET, FALSE, ZERO_VECTOR, ZERO_ROTATION]);',
    ])).map((row) => row.split(' ')[1])).toEqual(['35/35/1/0', '34/34/1/0', '35/35/1/0', '34/34/1/0'])
  })

  // In-world, on link 3: llSetLinkSitFlags(3, -1) read 54, the four flags a script
  // can set. Flags 0 read 0 with PRIM_ALLOW_UNSIT off. [PRIM_ALLOW_UNSIT, TRUE,
  // PRIM_SCRIPTED_SIT_ONLY, TRUE] then read 6, and flags 16 turned both rules off.
  it('keeps PRIM_ALLOW_UNSIT and PRIM_SCRIPTED_SIT_ONLY in the sit flags', async () => {
    expect((await run(3, [
      'llSetLinkSitFlags(3, -1);',
      'llSetLinkSitFlags(3, 0);',
      'llSetLinkPrimitiveParamsFast(3, [PRIM_ALLOW_UNSIT, TRUE, PRIM_SCRIPTED_SIT_ONLY, TRUE]);',
      'llSetLinkSitFlags(3, 16);',
    ])).map((row) => row.split(' ')[2])).toEqual(['54/54/1/1', '0/0/0/0', '6/6/1/1', '16/16/0/0'])
  })

  // In-world, on link 3 from flags 2: [PRIM_SIT_FLAGS, -1] read 54. From there
  // [PRIM_ALLOW_UNSIT, FALSE] read 52, [PRIM_SCRIPTED_SIT_ONLY, FALSE] 48,
  // [PRIM_ALLOW_UNSIT, TRUE] 50 and [PRIM_SCRIPTED_SIT_ONLY, 5] 54. PRIM_ALLOW_UNSIT
  // FALSE and then 7 read 54. [PRIM_SIT_FLAGS, 0x7FFFFFC9], every bit but the four,
  // read 0.
  it('sets one flag at a time through PRIM_ALLOW_UNSIT and PRIM_SCRIPTED_SIT_ONLY', async () => {
    expect((await run(3, [
      'llSetLinkPrimitiveParamsFast(3, [PRIM_SIT_FLAGS, -1]);',
      'llSetLinkPrimitiveParamsFast(3, [PRIM_ALLOW_UNSIT, FALSE]);',
      'llSetLinkPrimitiveParamsFast(3, [PRIM_SCRIPTED_SIT_ONLY, FALSE]);',
      'llSetLinkPrimitiveParamsFast(3, [PRIM_ALLOW_UNSIT, TRUE]);',
      'llSetLinkPrimitiveParamsFast(3, [PRIM_SCRIPTED_SIT_ONLY, 5]);',
      'llSetLinkPrimitiveParamsFast(3, [PRIM_ALLOW_UNSIT, FALSE]); llSetLinkPrimitiveParamsFast(3, [PRIM_ALLOW_UNSIT, 7]);',
      'llSetLinkPrimitiveParamsFast(3, [PRIM_SIT_FLAGS, 0x7FFFFFC9]);',
    ])).map((row) => row.split(' ')[2])).toEqual(['54/54/1/1', '52/52/0/1', '48/48/0/0', '50/50/1/0', '54/54/1/1', '54/54/1/1', '0/0/0/0'])
  })

  // In-world, on link 2 with a quarter turn as rot: [PRIM_SIT_TARGET, TRUE, <0, 0, 0.4>, rot]
  // read back as set. [PRIM_SIT_TARGET, FALSE, <0, 0, 0.4>, rot] and
  // llLinkSitTarget(2, ZERO_VECTOR, rot) each read [0, ZERO_VECTOR, ZERO_ROTATION]: a
  // removed sit target keeps no offset or rotation. [PRIM_SIT_TARGET, TRUE,
  // ZERO_VECTOR, rot] read [1, ZERO_VECTOR, rot].
  it('reads a removed sit target as zero offset and rotation', async () => {
    const R = '<0.0, 0.0, 0.7071068, 0.7071068>'
    const read = 'out += [llList2CSV(llGetLinkPrimitiveParams(2, [PRIM_SIT_TARGET]))];'
    const s = await scene(3, `
      llSetLinkPrimitiveParamsFast(2, [PRIM_SIT_TARGET, TRUE, <0.0, 0.0, 0.4>, ${R}]); ${read}
      llSetLinkPrimitiveParamsFast(2, [PRIM_SIT_TARGET, FALSE, <0.0, 0.0, 0.4>, ${R}]); ${read}
      llLinkSitTarget(2, <0.0, 0.0, 0.4>, ${R}); llLinkSitTarget(2, ZERO_VECTOR, ${R}); ${read}
      llSetLinkPrimitiveParamsFast(2, [PRIM_SIT_TARGET, TRUE, ZERO_VECTOR, ${R}]); ${read}`)
    s.run()
    const gone = '0, <0.000000, 0.000000, 0.000000>, <0.000000, 0.000000, 0.000000, 1.000000>'
    expect(s.scripts.p1!.global('out')).toEqual([
      '1, <0.000000, 0.000000, 0.400000>, <0.000000, 0.000000, 0.707107, 0.707107>',
      gone,
      gone,
      '1, <0.000000, 0.000000, 0.000000>, <0.000000, 0.000000, 0.707107, 0.707107>',
    ])
  })

  // In-world, lone box: 2 when new, 18 as set, 19 after llSitTarget, 18 after
  // llSitTarget(ZERO_VECTOR, rot) with a quarter turn as rot, and 16 after
  // llSetLinkSitFlags(LINK_THIS, 17).
  it('does the same on a lone prim through llSitTarget', async () => {
    expect(await run(1, [
      '',
      'llSetLinkSitFlags(LINK_THIS, 18);',
      'llSitTarget(<0.0, 0.0, 0.5>, ZERO_ROTATION);',
      'llSitTarget(ZERO_VECTOR, <0.0, 0.0, 0.7071068, 0.7071068>);',
      'llSetLinkSitFlags(LINK_THIS, 17);',
    ])).toEqual(['2/2/1/0', '18/18/1/0', '19/19/1/0', '18/18/1/0', '16/16/0/0'])
  })

  // In-world: sitting does not set the bit. A lone box with flags 18 and no sit
  // target read 18 with an avatar seated on it. A linkset with a sit target on the
  // root only and flags 2, 18 and 34 read 3, 18 and 34 before sitting, with the
  // avatar seated and after it stood. With the sit target on child 2 only, the
  // prims read 2, 3 and 2 with the avatar seated on it. The avatar link reads 0
  // and PRIM_SIT_FLAGS 2.
  it('does not set the bit for a sitter', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const avatar = world.addAvatar({ region: 'home', key: AVATAR, name: 'av', username: 'av', size: { x: 0.45, y: 0.6, z: 1.65 }, position: { x: 110, y: 50, z: 20 } })
    const { linkset, scripts } = await loadLinkset({
      world, region: 'home', owner: AVATAR, position: { x: 116, y: 50, z: 20 },
      prims: [{ name: 'p1', scripts: [{ name: 'p1', source: { source: `${HELPERS}
        default { touch_start(integer n) { NP = 1; TOT = llGetNumberOfPrims(); llSetLinkSitFlags(LINK_THIS, 18); out += [flags()]; } }` } }] }],
    })
    scripts.p1!.start()
    expect(world.sitAvatar(avatar, linkset.prims[0]!)).toBe(true)
    linkset.touch(1, { avatar: { key: AVATAR, name: 'av' } })
    expect(scripts.p1!.global('out')).toEqual(['18/18/1/0 0/2/1/0'])
    const s = await scene(3, 'if (step++ == 0) { llSetLinkSitFlags(2, 18); llSetLinkSitFlags(3, 34); llLinkSitTarget(1, <0.0, 0.0, 0.6>, ZERO_ROTATION); } out = [flags()];')
    expect(s.run()).toBe('3/3/1/0 18/18/1/0 34/34/1/0')
    expect(s.world.sitAvatar(s.avatar, s.linkset.prims[0]!)).toBe(true)
    expect(s.run()).toBe('3/3/1/0 18/18/1/0 34/34/1/0 0/2/1/0')
    s.world.standAvatar(s.avatar)
    expect(s.run()).toBe('3/3/1/0 18/18/1/0 34/34/1/0')
    expect((await scene(3, 'out = [flags()];', 2)).run()).toBe('2/2/1/0 3/3/1/0 2/2/1/0 0/2/1/0')
  })
})

// https://wiki.secondlife.com/wiki/LlSetLinkPrimitiveParamsFast documents
// PRIM_LINK_TARGET and says nothing about a target that names no link.
describe('a PRIM_LINK_TARGET that names no link in a set call', () => {
  // The rules are [PRIM_DESC, "a", PRIM_LINK_TARGET, X, PRIM_TEXT, "b", ...,
  // PRIM_LINK_TARGET, V, PRIM_DESC, "c"] on LINK_THIS, where V is the next prim
  // (LINK_THIS on a lone prim). Each result is the description and the hover text
  // of every prim, in link order.
  //
  // In-world: a PRIM_LINK_TARGET that names no link drops the rules after it, up
  // to the next PRIM_LINK_TARGET, and that one applies as usual. It does not end
  // the call, as it does in a read, and its rules do not land on the earlier
  // target. That held for link 99, the link after the last one, 2147483647, link 0
  // from the root, and on a lone box for -5, LINK_ALL_OTHERS and LINK_ALL_CHILDREN,
  // which are empty there. On the linkset -5, LINK_ALL_OTHERS and LINK_ALL_CHILDREN
  // name prims, which took "b". Every row was run with nobody seated and with an
  // avatar seated on the root.
  const MID = (x: string) => `[PRIM_DESC, "a", PRIM_LINK_TARGET, ${x}, PRIM_TEXT, "b", <1.0, 1.0, 1.0>, 1.0, PRIM_LINK_TARGET, V, PRIM_DESC, "c"]`
  const each = (calls: string[]) => `
    integer V = LINK_THIS; integer ME = llGetLinkNumber();
    if (NP > 1) V = (ME % NP) + 1;
    ${calls.map((c) => `clear(); ${c} log += [texts()];`).join('\n')}
    out = [llDumpList2String(log, " ")];`
  const TARGETS = each(['99', '0', '-5', 'LINK_ALL_OTHERS', 'LINK_ALL_CHILDREN', 'TOT + 1', '0x7FFFFFFF']
    .map((x) => `llSetLinkPrimitiveParamsFast(LINK_THIS, ${MID(x)});`))
  it.each([
    [1, 3, false, 'a,c,- a,c,- a,cb,- a,cb,-b a,cb,-b a,c,- a,c,-'],
    [2, 3, false, '-,a,c -b,a,c -b,a,c -b,a,cb -,ab,cb -,a,c -,a,c'],
    [3, 3, false, 'c,-,a cb,-,a cb,-,a cb,-b,a c,-b,ab c,-,a c,-,a'],
    [1, 3, true, 'a,c,- a,c,- a,cb,- a,cb,-b a,cb,-b a,c,- a,c,-'],
    [2, 3, true, '-,a,c -b,a,c -b,a,c -b,a,cb -,ab,cb -,a,c -,a,c'],
    [3, 3, true, 'c,-,a cb,-,a cb,-,a cb,-b,a c,-b,ab c,-,a c,-,a'],
    [1, 1, false, 'c cb c c c c c'],
  ])('skips to the next PRIM_LINK_TARGET from link %i of %i prims, seated %s', async (caller, count, seated, want) => {
    expect((await scene(count, TARGETS, seated)).run(caller)).toBe(want)
  })

  // In-world: seated on a lone box, the targets that name no link (99, 0,
  // LINK_ALL_OTHERS, LINK_ALL_CHILDREN, the link after the avatar and 2147483647)
  // had their rules dropped (c). -5 is the avatar there, and a rule an avatar link
  // does not take ends the call, so the description stayed "a".
  it('skips link 0 and stops at the avatar link on a seated lone prim', async () => {
    expect((await scene(1, TARGETS, true)).run()).toBe('c c a c c c c')
  })

  // In-world: the same list through llSetPrimitiveParams and llSetLinkPrimitiveParams
  // gave the same results for X = 99 and X = 0. Two PRIM_LINK_TARGETs in a row, the
  // first naming no link, applied the second. Two missing targets with rules, then a
  // valid one, applied the valid one. Started on link V with PRIM_LINK_TARGET 99
  // and then LINK_THIS, "a" went to V and "c" to the caller. The linkset rows were
  // also run with an avatar seated on the root, and the lone row with an avatar
  // seated on the box, where link 0 names nothing (c c c c c c c).
  const OTHERS = each([
    `llSetPrimitiveParams(${MID('99')});`,
    `llSetPrimitiveParams(${MID('0')});`,
    `llSetLinkPrimitiveParams(LINK_THIS, ${MID('99')});`,
    `llSetLinkPrimitiveParams(LINK_THIS, ${MID('0')});`,
    'llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_DESC, "a", PRIM_LINK_TARGET, 99, PRIM_LINK_TARGET, V, PRIM_DESC, "c"]);',
    'llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_DESC, "a", PRIM_LINK_TARGET, 99, PRIM_TEXT, "b", <1.0, 1.0, 1.0>, 1.0, PRIM_LINK_TARGET, 98, PRIM_TEXT, "d", <1.0, 1.0, 1.0>, 1.0, PRIM_LINK_TARGET, V, PRIM_DESC, "c"]);',
    'llSetLinkPrimitiveParamsFast(V, [PRIM_DESC, "a", PRIM_LINK_TARGET, 99, PRIM_TEXT, "b", <1.0, 1.0, 1.0>, 1.0, PRIM_LINK_TARGET, LINK_THIS, PRIM_DESC, "c"]);',
  ])
  it.each([
    [1, 3, 'a,c,- a,c,- a,c,- a,c,- a,c,- a,c,- c,a,-'],
    [2, 3, '-,a,c -b,a,c -,a,c -b,a,c -,a,c -,a,c -,c,a'],
    [3, 3, 'c,-,a cb,-,a c,-,a cb,-,a c,-,a c,-,a a,-,c'],
    [1, 1, 'c cb c cb c c c'],
  ])('does the same in llSetPrimitiveParams and llSetLinkPrimitiveParams from link %i of %i prims', async (caller, count, want) => {
    expect((await scene(count, OTHERS)).run(caller)).toBe(want)
    expect((await scene(count, OTHERS, true)).run(caller)).toBe(count > 1 ? want : 'c c c c c c c')
  })

  // In-world: a call that starts on no link (link 99, or link 0 from the root)
  // drops its first rules and applies the ones after a PRIM_LINK_TARGET. From
  // child 2, link 0 is the root, so "a" went to the root. Seated on the root, and
  // seated on the lone box, gave the same rows.
  const START = each([
    'llSetLinkPrimitiveParamsFast(99, [PRIM_DESC, "a", PRIM_LINK_TARGET, V, PRIM_DESC, "c"]);',
    'llSetLinkPrimitiveParamsFast(0, [PRIM_DESC, "a", PRIM_LINK_TARGET, V, PRIM_DESC, "c"]);',
    'llSetLinkPrimitiveParams(99, [PRIM_DESC, "a", PRIM_LINK_TARGET, V, PRIM_DESC, "c"]);',
  ])
  it.each([
    [1, 3, '-,c,- -,c,- -,c,-'],
    [2, 3, '-,-,c a,-,c -,-,c'],
    [3, 3, 'c,-,- c,-,- c,-,-'],
    [1, 1, 'c c c'],
  ])('applies a later PRIM_LINK_TARGET when the call starts on no link, from link %i of %i prims', async (caller, count, want) => {
    expect((await scene(count, START)).run(caller)).toBe(want)
    expect((await scene(count, START, true)).run(caller)).toBe(want)
  })
})
