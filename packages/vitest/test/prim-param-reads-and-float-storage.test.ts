import { describe, it, expect } from 'vitest'
import { loadLinkset, makeInventoryItem, InventoryType, DEBUG_CHANNEL } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlGetPrimitiveParams
// https://wiki.secondlife.com/wiki/LlSetPrimitiveParams
// https://wiki.secondlife.com/wiki/PRIM_COLLISION_SOUND
// https://wiki.secondlife.com/wiki/LlCollisionSound
// https://wiki.secondlife.com/wiki/PRIM_PROJECTOR
// https://wiki.secondlife.com/wiki/PRIM_FLEXIBLE
// In-world: Aditi, SLua Tideland, 2026-11-23, in two linked 0.5 m boxes made with object.create.
// Scripts were compiled for Mono or as SLua and reported with llOwnerSay. A projector can't be
// read by a script, so its settings were read from the prim with the viewer's object details.

const NULL_KEY = '00000000-0000-0000-0000-000000000000'
const SOUND = 'ed124764-705d-d497-167a-182cd9fa2e6c'
const PLYWOOD = '89556747-24cb-43ed-920b-47caed15465f'
const BLANK = '5748decc-f629-461c-9a36-a35a221fe21f'
const TEX = '7bce9c52-7b6b-0f82-8832-eff76db4952a'
const SND = '4e90ac5f-8897-c0bd-a2f1-5998ab0497a7'

const ptex = () => makeInventoryItem({ name: 'ptex', type: InventoryType.TEXTURE, key: TEX })
const psnd = () => makeInventoryItem({ name: 'psnd', type: InventoryType.SOUND, key: SND })

async function linked(source: string, inventory: ReturnType<typeof makeInventoryItem>[] = [], language: 'lsl' | 'slua' = 'lsl') {
  const loaded = await loadLinkset({
    prims: [
      { inventory, scripts: [{ name: 'probe', ...(language === 'slua' ? { language } : {}), source: { source, filename: language === 'slua' ? 'probe.luau' : 'probe.lsl' } }] },
      {},
    ],
  })
  const s = loaded.scripts.probe!
  s.start()
  s.advanceTime(200)
  return { ...loaded, s }
}

const owner = (s: { chat: ReadonlyArray<{ channel: number; text: string }> }) =>
  s.chat.filter((c) => c.channel !== DEBUG_CHANNEL).map((c) => c.text)
const debug = (s: { chat: ReadonlyArray<{ channel: number; text: string }> }) =>
  s.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text)

describe('PRIM_CAST_SHADOWS', () => {
  it('can be set but not read: on get it gives nothing and ends the read', async () => {
    const { s } = await linked(`
      r(list rules) { llOwnerSay(llList2CSV(llGetPrimitiveParams(rules))); }
      default { state_entry() {
        r([PRIM_CAST_SHADOWS, PRIM_MATERIAL]);
        r([PRIM_MATERIAL, PRIM_CAST_SHADOWS, PRIM_PHANTOM]);
        llSetPrimitiveParams([PRIM_CAST_SHADOWS, TRUE, PRIM_DESC, "cs1"]);
        r([PRIM_DESC, PRIM_CAST_SHADOWS, PRIM_MATERIAL]);
        llSetPrimitiveParams([PRIM_CAST_SHADOWS, FALSE]);
        r([PRIM_CAST_SHADOWS, PRIM_MATERIAL]);
      }}`)
    // In-world: the reads probe. A new prim read nothing for PRIM_CAST_SHADOWS and nothing for
    // the rules after it, and so did the prim after [PRIM_CAST_SHADOWS, TRUE] and FALSE. The
    // set took the value without an error and went on to the PRIM_DESC after it.
    expect(owner(s)).toEqual(['', '3', 'cs1', ''])
  })
})

describe('a rule a prim cannot read', () => {
  it('says a get error counting rules from 0, a PRIM_LINK_TARGET as two, and ends the read', async () => {
    const { s, linkset } = await linked(`
      g(string t, list rules) { llOwnerSay(t + " [" + llList2CSV(llGetPrimitiveParams(rules)) + "]"); }
      h(string t, integer l, list rules) { llOwnerSay(t + " [" + llList2CSV(llGetLinkPrimitiveParams(l, rules)) + "]"); }
      default { state_entry() {
        llSetObjectName("Root");
        g("1", [PRIM_COLOR, 0, PRIM_CAST_SHADOWS, PRIM_NAME]);
        g("2", [PRIM_NAME, PRIM_DESC, PRIM_MATERIAL, PRIM_CAST_SHADOWS]);
        g("3", [9999, PRIM_NAME]);
        g("4", [PRIM_NAME, PRIM_PROJECTOR, PRIM_NAME]);
        g("5", [PRIM_NAME, -1]);
        g("6", [PRIM_NAME, "x", PRIM_NAME]);
        h("7", 2, [PRIM_NAME, PRIM_CAST_SHADOWS]);
        h("8", 1, [PRIM_NAME, PRIM_LINK_TARGET, 2, PRIM_NAME, PRIM_CAST_SHADOWS]);
        g("9", [PRIM_COLOR, 7, PRIM_CAST_SHADOWS]);
      }}`)
    // In-world: the get error probe in two linked boxes. Each read stopped at the rule the prim
    // can't read and said the error on DEBUG_CHANNEL; a rule that is not an integer ended the
    // read without one. llGetLinkPrimitiveParams worded it as llGetPrimitiveParams too, and the
    // prim its link argument named said it: link 2 for case 7, the root for case 8.
    expect(owner(s)).toEqual([
      '1 [<1.000000, 1.000000, 1.000000>, 1.000000]',
      '2 [Root, , 3]',
      '3 []',
      '4 [Root]',
      '5 [Root]',
      '6 [Root]',
      '7 [Object]',
      '8 [Root, Object]',
      '9 []',
    ])
    const error = (n: number) => `llGetPrimitiveParams error: Param ${n} error, unknown parameter`
    expect(s.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => [c.text, c.from ?? linkset.prims[0]!.key])).toEqual([
      [error(1), linkset.prims[0]!.key],
      [error(3), linkset.prims[0]!.key],
      [error(0), linkset.prims[0]!.key],
      [error(1), linkset.prims[0]!.key],
      [error(1), linkset.prims[0]!.key],
      [error(1), linkset.prims[1]!.key],
      [error(4), linkset.prims[0]!.key],
      [error(1), linkset.prims[0]!.key],
    ])
  })
})

describe('PRIM_COLLISION_SOUND', () => {
  it('reads [NULL_KEY, 1.0] on a prim that never had a collision sound', async () => {
    const { s } = await linked(`default { state_entry() {
      llOwnerSay(llList2CSV(llGetPrimitiveParams([PRIM_COLLISION_SOUND, PRIM_MATERIAL])));
      llOwnerSay(llList2CSV(llGetLinkPrimitiveParams(2, [PRIM_COLLISION_SOUND, PRIM_NAME])));
    }}`)
    // In-world: the reads probe, on the root and on link 2.
    expect(owner(s)).toEqual([`${NULL_KEY}, 1.000000, 3`, `${NULL_KEY}, 1.000000, Object`])
  })

  it('reads what llCollisionSound stored', async () => {
    const { s } = await linked(`
      r() { llOwnerSay(llList2CSV(llGetPrimitiveParams([PRIM_COLLISION_SOUND]))); }
      default { state_entry() {
        llCollisionSound("${SOUND}", 0.5); r();
        llCollisionSound("${SOUND}", 0.3); list v = llGetPrimitiveParams([PRIM_COLLISION_SOUND]);
        llOwnerSay((string)((llList2Float(v, 1) - 0.3) * 1e9) + " " + (string)llGetListEntryType(v, 0));
        llCollisionSound("${SOUND}", 2.0); r();
        llCollisionSound("${SOUND}", -1.0); r();
        llCollisionSound("", 0.7); r();
        llCollisionSound("${SOUND}", 0.6); llCollisionSound(NULL_KEY, 0.6); r();
        llCollisionSound("${SOUND}", 0.6); llCollisionSound("no such sound", 0.4); r();
        llCollisionSound("psnd", 0.5); r();
        llRemoveInventory("psnd"); r();
      }}`, [psnd()])
    // In-world: the reads probe and its follow-up with an uploaded sound "psnd" in the root. The
    // volume was clamped to 0..1 and kept as the float it was given. "" stored NULL_KEY at volume
    // 0 whatever volume it was given. A name that is not a sound in the prim stored NULL_KEY with
    // no error. The sound reads as a key. A sound's name stored its key, and removing the sound kept it.
    expect(owner(s)).toEqual([
      `${SOUND}, 0.500000`,
      '0.000000 4',
      `${SOUND}, 1.000000`,
      `${SOUND}, 0.000000`,
      `${NULL_KEY}, 0.000000`,
      `${NULL_KEY}, 0.600000`,
      `${NULL_KEY}, 0.400000`,
      `${SND}, 0.500000`,
      `${SND}, 0.500000`,
    ])
    expect(debug(s)).toEqual([])
  })

  it('can be set per link as a rule', async () => {
    const { s } = await linked(`
      r() { llOwnerSay(llList2CSV(llGetPrimitiveParams([PRIM_COLLISION_SOUND]) + llGetLinkPrimitiveParams(2, [PRIM_COLLISION_SOUND]))); }
      default { state_entry() {
        llSetPrimitiveParams([PRIM_DESC, "x", PRIM_COLLISION_SOUND, "${SOUND}", 0.8, PRIM_DESC, "cs2"]);
        llSetLinkPrimitiveParamsFast(2, [PRIM_COLLISION_SOUND, "psnd", 0.4]);
        llOwnerSay(llGetObjectDesc()); r();
        llSetPrimitiveParams([PRIM_COLLISION_SOUND, "", 0.9]); r();
        llSetPrimitiveParams([PRIM_COLLISION_SOUND, "${SOUND}", 0.3]);
        llSetPrimitiveParams([PRIM_COLLISION_SOUND, "nope", 0.6, PRIM_DESC, "after"]); llOwnerSay(llGetObjectDesc()); r();
        llSetPrimitiveParams([PRIM_COLLISION_SOUND, "${SOUND}", 0.3]);
        llSetPrimitiveParams([PRIM_COLLISION_SOUND, NULL_KEY, 0.7]); r();
        llSetPrimitiveParams([PRIM_COLLISION_SOUND, "${SOUND}", 1.5]); r();
        llSetPrimitiveParams([PRIM_COLLISION_SOUND, "${SOUND}", -0.5]); r();
      }}`, [psnd()])
    // In-world: the collision sound follow-up. The rule took a key, or the name of a sound in the
    // script's prim for any link. "" and a name that names nothing stored NULL_KEY with the volume
    // given, without an error, and the rules after it still ran. The volume was clamped to 0..1.
    expect(owner(s)).toEqual([
      'cs2',
      `${SOUND}, 0.800000, ${SND}, 0.400000`,
      `${NULL_KEY}, 0.900000, ${SND}, 0.400000`,
      'after',
      `${NULL_KEY}, 0.600000, ${SND}, 0.400000`,
      `${NULL_KEY}, 0.700000, ${SND}, 0.400000`,
      `${SOUND}, 1.000000, ${SND}, 0.400000`,
      `${SOUND}, 0.000000, ${SND}, 0.400000`,
    ])
    expect(debug(s)).toEqual([])
  })
})

describe('PRIM_SIT_FLAGS', () => {
  it('reads 2 on a new prim and 3 while it has a sit target', async () => {
    const { s } = await linked(`
      r() { llOwnerSay(llList2CSV(llGetPrimitiveParams([PRIM_SIT_FLAGS, PRIM_MATERIAL]))); }
      default { state_entry() {
        r(); llSitTarget(<0, 0, 1>, ZERO_ROTATION); r(); llSitTarget(ZERO_VECTOR, ZERO_ROTATION); r();
      }}`)
    // In-world: the reads probe. Changed flags are pinned in link-zero-calls.test.ts.
    expect(owner(s)).toEqual(['2, 3', '3, 3', '2, 3'])
  })
})

describe('PRIM_PROJECTOR settings as the prim holds them', () => {
  const projectors = (linkset: { prims: ReadonlyArray<{ params: { projector: unknown } }> }) => linkset.prims.map((p) => p.params.projector)

  const set = async (root: string, child: string) => {
    const { linkset } = await linked(`default { state_entry() {
      llSetLinkPrimitiveParamsFast(1, [${root}]);
      llSetLinkPrimitiveParamsFast(2, [${child}]);
    }}`, [ptex()])
    return projectors(linkset)
  }
  const f = Math.fround

  // In-world: the projector probe in a root and a child, read with object details after each
  // step. fov was clamped to 0..3, focus to -20..20 and ambiance to -1..1. A texture's name in
  // the script's prim stored its key, for any link; "", NULL_KEY and a name that names nothing
  // left no projector texture.
  it.each([
    [`PRIM_PROJECTOR, "${PLYWOOD}", 1.5, 2.5, 0.3`, `PRIM_PROJECTOR, "${BLANK}", 0.8, 7.0, 0.9`,
      { texture: PLYWOOD, fov: 1.5, focus: 2.5, ambiance: f(0.3) }, { texture: BLANK, fov: f(0.8), focus: 7, ambiance: f(0.9) }],
    [`PRIM_PROJECTOR, "${PLYWOOD}", -1.0, -30.0, -0.5`, `PRIM_PROJECTOR, "${BLANK}", 10.0, 30.0, 5.0`,
      { texture: PLYWOOD, fov: 0, focus: -20, ambiance: -0.5 }, { texture: BLANK, fov: 3, focus: 20, ambiance: 1 }],
    [`PRIM_PROJECTOR, "${PLYWOOD}", 3.2, 20.5, 1.01`, `PRIM_PROJECTOR, "${BLANK}", 0.0, -20.5, -100.0`,
      { texture: PLYWOOD, fov: 3, focus: 20, ambiance: 1 }, { texture: BLANK, fov: 0, focus: -20, ambiance: -1 }],
    ['PRIM_PROJECTOR, "ptex", 1.0, 1.0, 0.5', 'PRIM_PROJECTOR, "no such texture", 1.1, 1.1, 0.55',
      { texture: TEX, fov: 1, focus: 1, ambiance: 0.5 }, { texture: NULL_KEY, fov: f(1.1), focus: f(1.1), ambiance: f(0.55) }],
    ['PRIM_PROJECTOR, "", 1.2, 2.0, 0.2', 'PRIM_PROJECTOR, NULL_KEY, 1.3, 2.0, 0.2',
      { texture: NULL_KEY, fov: f(1.2), focus: 2, ambiance: f(0.2) }, { texture: NULL_KEY, fov: f(1.3), focus: 2, ambiance: f(0.2) }],
  ])('stores [%s] on the root and [%s] on the child', async (root, child, rootProjector, childProjector) => {
    expect(await set(root, child)).toEqual([rootProjector, childProjector])
  })

  it('keeps a projector without a light', async () => {
    // In-world: a child with no light held its projector, and turning the root's light off kept the root's.
    expect(await set(
      `PRIM_POINT_LIGHT, TRUE, <1, 1, 1>, 1.0, 10.0, 0.75, PRIM_PROJECTOR, "${PLYWOOD}", 1.4, 2.0, 0.2, PRIM_POINT_LIGHT, FALSE, <1, 1, 1>, 1.0, 10.0, 0.75`,
      `PRIM_PROJECTOR, "${BLANK}", 0.8, 7.0, 0.9`,
    )).toEqual([
      { texture: PLYWOOD, fov: f(1.4), focus: 2, ambiance: f(0.2) },
      { texture: BLANK, fov: f(0.8), focus: 7, ambiance: f(0.9) },
    ])
  })

  it('loses its texture when that texture is removed from its own prim', async () => {
    const { linkset } = await linked(`default { state_entry() {
      llSetLinkPrimitiveParamsFast(1, [PRIM_PROJECTOR, "ptex", 1.2, 3.4, 0.5]);
      llSetLinkPrimitiveParamsFast(2, [PRIM_PROJECTOR, "ptex", 0.9, 4.5, 0.6]);
      llRemoveInventory("ptex");
    }}`, [ptex()])
    // In-world: the projector removal probe. With the texture set on both links from the root's
    // "ptex", by name or by key, removing "ptex" from the root took the root's projector texture
    // away and left the child's.
    expect(linkset.prims.map((p) => p.params.projector.texture)).toEqual([NULL_KEY, TEX])
  })

  it('keeps a texture that is not the one removed', async () => {
    const { linkset } = await linked(`default { state_entry() {
      llSetLinkPrimitiveParamsFast(1, [PRIM_PROJECTOR, "${PLYWOOD}", 1.4, 2.0, 0.2]);
      llRemoveInventory("ptex");
    }}`, [ptex()])
    // In-world: the same, with the root's projector set to the plywood texture first.
    expect(linkset.prims[0]!.params.projector.texture).toBe(PLYWOOD)
  })
})

describe('floats as the region stores them', () => {
  // In-world: the rounding sweep. An SLua script on link 2 set each parameter to fourteen values,
  // read it back, and printed every value that did not read back as the float it was given.
  // Text alpha, colour, glow, texture repeats, offsets and rotation, size, local position and
  // rotation, slice, omega gain, light radius and falloff, the reflection probe, the sit target,
  // health, damage, the physics material and the collision sound volume all read back as set.
  // Flexible drag, wind and tension are kept in tenths and gravity in tenths from -10, cut off
  // after scaling by 10.01 (gravity 0.3 reads 0.3000001907). Normal and specular map repeats,
  // offsets and rotation are cut to steps of 0.0001. Light colour and intensity are rounded to
  // 8 bits and read as a multiple of the float 1/255, specular colour is cut to 8 bits, and the
  // omega axis is normalised in float arithmetic. Profile cuts, hollow and skew match the shape
  // rules already pinned in prim-type.
  // The chat log the lines were read from drops each line's trailing space.
  it('rounds the values of the first sweep as measured', async () => {
    const { s } = await linked(ROUND1, [], 'slua')
    expect(s.chat.map((c) => c.text.trimEnd())).toEqual(ROUND1_INWORLD)
  })

  // In-world: the follow-up sweep. Gravity is clamped to -10..10, drag, wind and tension to
  // 0..10 and softness to 0..3, and the force is kept as given. Normal and specular repeats are
  // clamped to -100..100, offsets to 0..1 and rotation to 0..two pi, then cut toward zero.
  it('rounds and clamps the values of the follow-up sweep as measured', async () => {
    const { s } = await linked(ROUND2, [], 'slua')
    expect(s.chat.map((c) => (c.channel === DEBUG_CHANNEL ? 'debug: ' : '') + c.text.trimEnd())).toEqual(ROUND2_INWORLD)
  })
})

const ROUND1 = `local buf = ""
local function flush() if #buf > 0 then ll.OwnerSay(buf); buf = ""; ll.Sleep(0.4) end end
local function out(s) if #buf + #s + 1 > 480 then flush() end buf = buf .. s .. " " end
local okpack = pcall(function() return string.pack("f", 0.3) end)
local function f32(v) if okpack then return (string.unpack("f", string.pack("f", v))) end return v end
local function g(x) return string.format("%.9g", x) end
local n = 0
local function chk(tag, inp, got)
  n += 1
  if type(got) ~= "number" then out(tag .. g(inp) .. ">?" .. tostring(got)) return end
  if got ~= f32(inp) then out(tag .. g(inp) .. ">" .. g(got)) end
end
local L = 2
local function set(r) ll.SetLinkPrimitiveParamsFast(L, r) end
local function get(r) return ll.GetLinkPrimitiveParams(L, r) end
local V = {0.3, 0.1, 0.7, 0.123456789, 0.5555555, 0.9, 0.01, 0.0011, 0.6789, 0.25, 0.999, 0.04, 0.33, 0.47}
out("pack=" .. tostring(okpack))
local PLY = "89556747-24cb-43ed-920b-47caed15465f"
for _, v in V do
  set({PRIM_TEXT, "", vector(1, 1, 1), v}); chk("TA", v, get({PRIM_TEXT})[3])
  set({PRIM_COLOR, 0, vector(v, v, v), v}); local r = get({PRIM_COLOR, 0}); chk("CC", v, r[1].x); chk("CA", v, r[2])
  set({PRIM_GLOW, 0, v}); chk("GL", v, get({PRIM_GLOW, 0})[1])
  set({PRIM_TEXTURE, 0, PLY, vector(v * 7, v * 3, 0), vector(v, -v, 0), v * 6}); r = get({PRIM_TEXTURE, 0})
  chk("TR", v * 7, r[2].x); chk("Tr", v * 3, r[2].y); chk("TO", v, r[3].x); chk("Tt", v * 6, r[4])
  set({PRIM_NORMAL, 0, PLY, vector(v * 7, v * 3, 0), vector(v, -v, 0), v * 6}); r = get({PRIM_NORMAL, 0})
  chk("NR", v * 7, r[2].x); chk("NO", v, r[3].x); chk("Nt", v * 6, r[4])
  set({PRIM_SPECULAR, 0, PLY, vector(v * 7, v * 3, 0), vector(v, -v, 0), v * 6, vector(v, v, v), 51, 0}); r = get({PRIM_SPECULAR, 0})
  chk("SR", v * 7, r[2].x); chk("SO", v, r[3].x); chk("St", v * 6, r[4]); chk("SC", v, r[5].x)
  set({PRIM_SIZE, vector(0.02 + v, 0.5 + v, 1.5 * v + 0.01)}); r = get({PRIM_SIZE})[1]
  chk("ZX", 0.02 + v, r.x); chk("ZY", 0.5 + v, r.y); chk("ZZ", 1.5 * v + 0.01, r.z)
  set({PRIM_POS_LOCAL, vector(v, 0.5 * v, 0.5 + v)}); r = get({PRIM_POS_LOCAL})[1]
  chk("PX", v, r.x); chk("PY", 0.5 * v, r.y); chk("PZ", 0.5 + v, r.z)
  local q = ll.Euler2Rot(vector(v, 2 * v, 3 * v)); set({PRIM_ROT_LOCAL, q}); r = get({PRIM_ROT_LOCAL})[1]
  chk("QX", q.x, r.x); chk("QS", q.s, r.s)
  set({PRIM_SLICE, vector(v * 0.5, 0.5 + v * 0.5, 0)}); r = get({PRIM_SLICE})[1]
  chk("LX", v * 0.5, r.x); chk("LY", 0.5 + v * 0.5, r.y)
  set({PRIM_OMEGA, vector(0, 0, 1), v * 10, v}); r = get({PRIM_OMEGA}); chk("OS", v * 10, r[2]); chk("OG", v, r[3])
  set({PRIM_OMEGA, vector(v, 0.2, 0.4), 1.0, 1.0}); r = get({PRIM_OMEGA}); chk("OA", v, r[1].x); chk("Os", 1.0, r[2])
  set({PRIM_POINT_LIGHT, 1, vector(v, v, v), v, v * 20, v * 2}); r = get({PRIM_POINT_LIGHT})
  chk("LC", v, r[2].x); chk("LI", v, r[3]); chk("LR", v * 20, r[4]); chk("LF", v * 2, r[5])
  set({PRIM_REFLECTION_PROBE, 1, v, v * 100, 0}); r = get({PRIM_REFLECTION_PROBE}); chk("RA", v, r[2]); chk("RC", v * 100, r[3])
  set({PRIM_REFLECTION_PROBE, 1, v * 100, v, 0}); r = get({PRIM_REFLECTION_PROBE}); chk("Ra", v * 100, r[2]); chk("Rc", v, r[3])
  set({PRIM_FLEXIBLE, 1, 2, v * 9, v * 9, v * 9, v * 9, vector(v * 9, -v, v)}); r = get({PRIM_FLEXIBLE})
  chk("FG", v * 9, r[3]); chk("FD", v * 9, r[4]); chk("FW", v * 9, r[5]); chk("FT", v * 9, r[6]); chk("FF", v * 9, r[7].x); chk("Ff", v, r[7].z)
  set({PRIM_FLEXIBLE, 1, 2, v, v, v, v, vector(v, 0, 0)}); r = get({PRIM_FLEXIBLE})
  chk("Fg", v, r[3]); chk("Fd", v, r[4]); chk("Fw", v, r[5]); chk("Ft", v, r[6])
  set({PRIM_FLEXIBLE, 0, 2, 0.3, 2, 0, 1, vector(0, 0, 0)})
  set({PRIM_SIT_TARGET, 1, vector(v, -v, v * 3), q}); r = get({PRIM_SIT_TARGET}); chk("TX", v, r[2].x); chk("TZ", v * 3, r[2].z); chk("TQ", q.x, r[3].x); chk("Tq", q.s, r[3].s)
  set({PRIM_HEALTH, v * 100}); chk("HE", v * 100, get({PRIM_HEALTH})[1])
  set({PRIM_DAMAGE, v * 100, 0}); chk("DA", v * 100, get({PRIM_DAMAGE})[1])
end
flush()
out("phase2 n=" .. n)
set({PRIM_SIT_TARGET, 0, vector(0, 0, 0), quaternion(0, 0, 0, 1)})
set({PRIM_POINT_LIGHT, 0, vector(1, 1, 1), 1, 10, 0.75})
set({PRIM_REFLECTION_PROBE, 0, 0, 0, 0})
set({PRIM_OMEGA, vector(0, 0, 1), 0, 0})
for _, v in V do
  ll.SetPhysicsMaterial(15, v * 9, v, v, 100 + v * 1000)
  local r = ll.GetPhysicsMaterial()
  chk("MG", v * 9, r[1]); chk("MR", v, r[2]); chk("MF", v, r[3]); chk("MD", 100 + v * 1000, r[4])
end
for _, v in V do
  set({PRIM_TYPE, PRIM_TYPE_BOX, 0, vector(v * 0.4, 0.5 + v * 0.5, 0), v * 0.9, vector(v - 0.5, 0.5 - v, 0), vector(v * 2, 2 - v, 0), vector(v - 0.5, (v - 0.5) * 0.5, 0)})
  local r = get({PRIM_TYPE})
  chk("YC", v * 0.4, r[3].x); chk("Yc", 0.5 + v * 0.5, r[3].y); chk("YH", v * 0.9, r[4]); chk("YW", v - 0.5, r[5].x)
  chk("YP", v * 2, r[6].x); chk("Yp", 2 - v, r[6].y); chk("YS", v - 0.5, r[7].x)
  set({PRIM_TYPE, PRIM_TYPE_TORUS, 0, vector(0, 1, 0), 0, vector(0, 0, 0), vector(1, 0.25, 0), vector(0, 0, 0), vector(0, 1, 0), vector(0, 0, 0), 1 + v * 2, v * 0.2, v * 0.5})
  r = get({PRIM_TYPE})
  chk("Yr", 1 + v * 2, r[10]); chk("Yo", v * 0.2, r[11]); chk("Yk", v * 0.5, r[12])
end
set({PRIM_TYPE, PRIM_TYPE_BOX, 0, vector(0, 1, 0), 0, vector(0, 0, 0), vector(1, 1, 0), vector(0, 0, 0)})
ll.SetPhysicsMaterial(15, 1, 0.5, 0.6, 1000)
out("done n=" .. n)
flush()
`

const ROUND1_INWORLD = [
      "pack=true SC0.3>0.298039228 OA0.3>0.557085991 Os1>0.538516521 LC0.3>0.301960796 LI0.3>0.301960796 FG2.7>2.69999981 Fg0.3>0.300000191 SC0.1>0.0980392173 OA0.1>0.21821788 Os1>0.458257586 LC0.1>0.101960793 LI0.1>0.101960793 FG0.9>0.899999619 Fg0.1>0.100000381 SC0.7>0.698039234 OA0.7>0.842701018 Os1>0.83066237 LC0.7>0.701960802 LI0.7>0.701960802 FG6.3>6.29999924 Fg0.7>0.699999809 NR0.864197523>0.864099979 NO0.123456789>0.123400003 Nt0.740740734>0.740700006",
      "SR0.864197523>0.864099979 SO0.123456789>0.123400003 St0.740740734>0.740700006 SC0.123456789>0.121568628 OA0.123456789>0.266104311 Os1>0.463941365 LC0.123456789>0.121568635 LI0.123456789>0.121568635 FG1.1111111>1.10000038 FD1.1111111>1.10000002 FW1.1111111>1.10000002 FT1.1111111>1.10000002 Fg0.123456789>0.100000381 Fd0.123456789>0.100000001 Fw0.123456789>0.100000001 Ft0.123456789>0.100000001 NR3.8888885>3.88879991 NO0.5555555>0.555499971 Nt3.333333>3.33330011",
      "SR3.8888885>3.88879991 SO0.5555555>0.555499971 St3.333333>3.33330011 SC0.5555555>0.552941203 OA0.5555555>0.778971136 Os1>0.71319139 LC0.5555555>0.556862772 LI0.5555555>0.556862772 FG4.9999995>5 FD4.9999995>5 FW4.9999995>5 FT4.9999995>5 Fg0.5555555>0.5 Fd0.5555555>0.5 Fw0.5555555>0.5 Ft0.5555555>0.5 SC0.9>0.898039222 OA0.9>0.895533383 Os1>1.0049876 LC0.9>0.90196085 LI0.9>0.90196085 Fg0.9>0.899999619 SC0.01>0.00784313772 OA0.01>0.0223550908 Os1>0.447325408 LC0.01>0.011764707",
      "LI0.01>0.011764707 FG0.09>0.100000381 FD0.09>0 FW0.09>0 FT0.09>0 Fg0.01>0 Fd0.01>0 Fw0.01>0 Ft0.01>0 SC0.0011>0 OA0.0011>0.00245966716 Os1>0.447214961 LC0.0011>0 LI0.0011>0 FG0.0099>0 FD0.0099>0 FW0.0099>0 FT0.0099>0 Fg0.0011>0 Fd0.0011>0 Fw0.0011>0 Ft0.0011>0 NR4.7523>4.75220013 SR4.7523>4.75220013 SC0.6789>0.678431392 OA0.6789>0.835095644 Os1>0.812960804 LC0.6789>0.678431392 LI0.6789>0.678431392 FG6.1101>6.10000038 FD6.1101>6.0999999 FW6.1101>6.0999999 FT6.1101>6.0999999",
      "Fg0.6789>0.600000381 Fd0.6789>0.600000024 Fw0.6789>0.600000024 Ft0.6789>0.600000024 SC0.25>0.247058824 OA0.25>0.487949997 Os1>0.512347579 LC0.25>0.250980407 LI0.25>0.250980407 FG2.25>2.19999981 FD2.25>2.20000005 FW2.25>2.20000005 FT2.25>2.20000005 Fg0.25>0.199999809 Fd0.25>0.200000003 Fw0.25>0.200000003 Ft0.25>0.200000003 SC0.999>0.996078432 OA0.999>0.912718534 Os1>1.09453237 LC0.999>1 LI0.999>1 FG8.991>9 FD8.991>8.89999962 FW8.991>8.89999962 FT8.991>8.89999962 Fg0.999>1",
      "Fd0.999>0.899999976 Fw0.999>0.899999976 Ft0.999>0.899999976 SC0.04>0.0392156877 OA0.04>0.0890870765 Os1>0.448998898 LC0.04>0.0392156877 LI0.04>0.0392156877 FG0.36>0.300000191 FD0.36>0.300000012 FW0.36>0.300000012 FT0.36>0.300000012 Fg0.04>0 Fd0.04>0 Fw0.04>0 Ft0.04>0 SC0.33>0.329411775 OA0.33>0.593751848 Os1>0.555787742 LC0.33>0.329411775 LI0.33>0.329411775 FG2.97>2.89999962 FD2.97>2.9000001 FW2.97>2.9000001 FT2.97>2.9000001 Fg0.33>0.300000191 Fd0.33>0.300000012",
      "Fw0.33>0.300000012 Ft0.33>0.300000012 SC0.47>0.466666669 OA0.47>0.724449992 Os1>0.648768067 LC0.47>0.470588267 LI0.47>0.470588267 FG4.23>4.19999981 FD4.23>4.19999981 FW4.23>4.19999981 FT4.23>4.19999981 Fg0.47>0.399999619 Fd0.47>0.400000006 Fw0.47>0.400000006 Ft0.47>0.400000006",
      "phase2 n=742 Yc0.65>0.649990022 Yk0.15>0.615384579 Yk0.05>0.545454562 Yk0.35>0.70588237 YC0.0493827156>0.0493800007 Yc0.561728395>0.561720014 YH0.11111111>0.111110002 Yk0.0617283945>0.554944992 YC0.2222222>0.222220004 Yc0.77777775>0.777769983 YH0.49999995>0.499989986 Yk0.27777775>0.678571403 Yk0.45>0.736842096 YH0.009>0.00899 Yk0.005>0.504950523 Yc0.50055>0.500540018 Yk0.00055>0.500549436 Yk0.33945>0.702185988 Yk0.125>0.600000024 Yk0.4995>0.749874949 YH0.036>0.0359899998",
      "Yk0.02>0.519230723 Yk0.165>0.624060154 Yk0.235>0.659863949 done n=938",
    ]

const ROUND2 = `local buf = ""
local function flush() if #buf > 0 then ll.OwnerSay(buf); buf = ""; ll.Sleep(0.4) end end
local function out(s) if #buf + #s + 1 > 480 then flush() end buf = buf .. s .. " " end
local function g(x) return string.format("%.9g", x) end
local L = 2
local function set(r) ll.SetLinkPrimitiveParamsFast(L, r) end
local function get(r) return ll.GetLinkPrimitiveParams(L, r) end
local PLY = "89556747-24cb-43ed-920b-47caed15465f"
for _, v in {-10, -9.99, -0.3, -0.05, -0.36, 10, 12, -12, 9.99, 3.14159} do
  set({PRIM_FLEXIBLE, 1, 2, v, 1, 1, 1, vector(0, 0, 0)}); out("G" .. g(v) .. ">" .. g(get({PRIM_FLEXIBLE})[3]))
end
for _, v in {10, 11, -1, -0.05, 9.99, 0.0999, 12.7, 100} do
  set({PRIM_FLEXIBLE, 1, 2, 0, v, v, v, vector(0, 0, 0)}); local r = get({PRIM_FLEXIBLE})
  out("D" .. g(v) .. ">" .. g(r[4]) .. "/" .. g(r[5]) .. "/" .. g(r[6]))
end
for _, v in {-1, 0, 3, 4, 5, 2.7} do
  set({PRIM_FLEXIBLE, 1, v, 0, 1, 1, 1, vector(0, 0, 0)}); out("S" .. g(v) .. ">" .. g(get({PRIM_FLEXIBLE})[2]))
end
for _, v in {vector(-11, 11, 3), vector(-10.5, 10.5, 0.123456)} do
  set({PRIM_FLEXIBLE, 1, 2, 0, 1, 1, 1, v}); out("F" .. tostring(get({PRIM_FLEXIBLE})[7]))
end
set({PRIM_FLEXIBLE, 0, 2, 0.3, 2, 0, 1, vector(0, 0, 0)})
flush()
for _, v in {-0.123456789, -3.8888885, -0.5555555, 0.00009, -0.00009, 123.456789, -99.99999, 6.2831853, -6.2831853, 1.00005} do
  set({PRIM_NORMAL, 0, PLY, vector(v, v, 0), vector(v, v, 0), v}); local r = get({PRIM_NORMAL, 0})
  out("N" .. g(v) .. ">" .. g(r[2].x) .. "/" .. g(r[3].x) .. "/" .. g(r[4]))
  set({PRIM_SPECULAR, 0, PLY, vector(v, v, 0), vector(v, v, 0), v, vector(1, 1, 1), 51, 0}); r = get({PRIM_SPECULAR, 0})
  out("P" .. g(v) .. ">" .. g(r[2].x) .. "/" .. g(r[3].x) .. "/" .. g(r[4]))
end
set({PRIM_NORMAL, 0, "", vector(1, 1, 0), vector(0, 0, 0), 0})
set({PRIM_SPECULAR, 0, "", vector(1, 1, 0), vector(0, 0, 0), 0, vector(1, 1, 1), 51, 0})
flush()
for _, a in {vector(0.3, 0.2, 0.4), vector(1, 2, 2), vector(0, 0, 3), vector(0.1, 0, 0)} do
  for _, s in {1, 0.7, 2.5} do
    set({PRIM_OMEGA, a, s, 0.5}); local r = get({PRIM_OMEGA})
    out("O" .. g(a.x) .. "," .. g(a.y) .. "," .. g(a.z) .. "*" .. g(s) .. ">" .. g(r[1].x) .. "," .. g(r[1].y) .. "," .. g(r[1].z) .. "*" .. g(r[2]))
  end
end
set({PRIM_OMEGA, vector(0, 0, 1), 0, 0})
for _, v in {0.3, 0.7, 0.9, 0.1, 0.5, 0.002, 0.998, 0.6} do
  set({PRIM_POINT_LIGHT, 1, vector(v, v, v), v, 5, 0.5}); local r = get({PRIM_POINT_LIGHT})
  out("I" .. g(v) .. ">" .. g(r[2].x) .. "/" .. g(r[3]))
end
set({PRIM_POINT_LIGHT, 0, vector(1, 1, 1), 1, 10, 0.75})
out("done2")
flush()
`

const ROUND2_INWORLD = [
      "debug: llSetPrimitiveParams error running rule #1 (PRIM_FLEXIBLE): arg #2 integer expected but float given.",
      "G-10>-10 G-9.99>-10 G-0.3>-0.300000191 G-0.05>-0.100000381 G-0.36>-0.399999619 G10>10 G12>10 G-12>-10 G9.99>10 G3.14159>3.10000038 D10>10/10/10 D11>10/10/10 D-1>0/0/0 D-0.05>0/0/0 D9.99>9.89999962/9.89999962/9.89999962 D0.0999>0/0/0 D12.7>10/10/10 D100>10/10/10 S-1>0 S0>0 S3>3 S4>3 S5>3 S2.7>3 F<-11, 11, 3> F<-10.5, 10.5, 0.123456>",
      "N-0.123456789>-0.123400003/0/0 P-0.123456789>-0.123400003/0/0 N-3.8888885>-3.88879991/0/0 P-3.8888885>-3.88879991/0/0 N-0.5555555>-0.555499971/0/0 P-0.5555555>-0.555499971/0/0 N9e-05>0/0/0 P9e-05>0/0/0 N-9e-05>0/0/0 P-9e-05>0/0/0 N123.456789>100/1/6.28310013 P123.456789>100/1/6.28310013 N-99.99999>-99.9999008/0/0 P-99.99999>-99.9999008/0/0 N6.2831853>6.28310013/1/6.28310013 P6.2831853>6.28310013/1/6.28310013 N-6.2831853>-6.28310013/0/0 P-6.2831853>-6.28310013/0/0",
      "N1.00005>1/1/1 P1.00005>1/1/1",
      "O0.300000012,0.200000003,0.400000006*1>0.557085991,0.371390671,0.742781341*0.538516521 O0.300000012,0.200000003,0.400000006*0.7>0.557085991,0.371390671,0.742781341*0.376961559 O0.300000012,0.200000003,0.400000006*2.5>0.557085991,0.371390671,0.742781341*1.3462913 O1,2,2*1>0.333333343,0.666666687,0.666666687*3 O1,2,2*0.7>0.333333343,0.666666687,0.666666687*2.0999999 O1,2,2*2.5>0.333333343,0.666666687,0.666666687*7.5 O0,0,3*1>0,0,1*3 O0,0,3*0.7>0,0,1*2.0999999",
      "O0,0,3*2.5>0,0,1*7.5 O0.100000001,0,0*1>1,0,0*0.100000001 O0.100000001,0,0*0.7>1,0,0*0.0700000003 O0.100000001,0,0*2.5>1,0,0*0.25 I0.3>0.301960796/0.301960796 I0.7>0.701960802/0.701960802 I0.9>0.90196085/0.90196085 I0.1>0.101960793/0.101960793 I0.5>0.501960814/0.501960814 I0.002>0.00392156886/0.00392156886 I0.998>0.996078491/0.996078491 I0.6>0.600000024/0.600000024 done2",
    ]
