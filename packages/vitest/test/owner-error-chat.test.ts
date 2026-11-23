import { describe, expect, it } from 'vitest'
import { loadLinkset, loadScript, World } from '../src/index.js'

// Measured on the Aditi beta grid, region SLua Tideland, 2026-11-23, by reading
// the owner's nearby chat in the viewer (owner-say lines and DEBUG_CHANNEL
// lines as the viewer shows them). A probe box ran each call on a chat
// command, spaced 6 s apart, and said the values it left with llOwnerSay. A
// second box 3 m away listened on DEBUG_CHANNEL and repeated what it heard
// with llOwnerSay.

const DEBUG_CHANNEL = 2147483647
const K = '5748decc-f629-461c-9a36-a35a221fe21f'
const OWNER = 'abcdefab-1234-1234-1234-abcdefabcdef'

type Chat = { chat: ReadonlyArray<{ channel: number; text: string; type: string }> }
const debugChat = (s: Chat) => s.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text)
const ownerChat = (s: Chat) => s.chat.filter((c) => c.type === 'ownerSay').map((c) => c.text)

/** A box running `call` from state_entry, and a listener in a second prim that logs what it hears on DEBUG_CHANNEL. */
async function withListener(call: string, language: 'lsl' | 'slua' = 'lsl') {
  const probe = language === 'lsl'
    ? `default { state_entry() { ${call} } }`
    : call
  const { scripts, linkset } = await loadLinkset({
    prims: [
      { name: 'probe', scripts: [{ source: { source: probe, filename: language === 'lsl' ? 'p.lsl' : 'p.luau', language }, name: 'p', start: false }] },
      {
        name: 'listener',
        scripts: [{ source: { source: 'list heard; default { state_entry() { llListen(DEBUG_CHANNEL, "", NULL_KEY, ""); } listen(integer c, string n, key id, string m) { heard += m; } }', filename: 'l.lsl' }, name: 'l' }],
      },
    ],
  })
  scripts.l!.start()
  scripts.p!.start()
  linkset.advanceTime(100)
  return { probe: scripts.p!, heard: scripts.l!.global('heard') as string[] }
}

async function set(rules: string) {
  const s = await loadScript({
    source: `
      list out;
      default {
        state_entry() {
          llSetPrimitiveParams([PRIM_DESC, "start", PRIM_GLOW, ALL_SIDES, 0.25]);
          llSetPrimitiveParams([PRIM_DESC, "before", ${rules}]);
          out = [llGetObjectDesc()] + llGetPrimitiveParams([PRIM_GLOW, 0]);
        }
      }
    `,
  })
  s.start()
  return s
}

const rule2 = (rest: string) => `llSetPrimitiveParams error running rule #2${rest}.`

describe('a set rule error is shown to the owner, not heard by scripts', () => {
  // In-world: [PRIM_DESC, "before", 999999, "x", ...] showed the unknown-rule error in the owner's chat; the
  // listener heard nothing, for this and every other prim-param error below. It did hear the run-time errors
  // of the crash probes further down.
  it('the listener hears nothing', async () => {
    const { probe, heard } = await withListener('llSetPrimitiveParams([PRIM_DESC, "before", 999999, "x"]);')
    expect(debugChat(probe)).toEqual([rule2(': unknown rule')])
    expect(heard).toEqual([])
  })

  // In-world: llSetLinkPrimitiveParamsFast(LINK_THIS, [.., PRIM_COLOR, 0, "red", 1.0, ..]) and
  // llSetLinkPrimitiveParams(LINK_THIS, [.., PRIM_SIZE, 3, ..]) both named llSetPrimitiveParams.
  it.each([
    ['llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_DESC, "before", PRIM_COLOR, 0, "red", 1.0, PRIM_DESC, "after"]);', ' (PRIM_COLOR): arg #2 (color) vector expected but string given'],
    ['llSetLinkPrimitiveParams(LINK_THIS, [PRIM_DESC, "before", PRIM_SIZE, 3, PRIM_DESC, "after"]);', ' (PRIM_SIZE): arg #1 vector expected but integer given'],
    ['llSetLinkPrimitiveParamsFast(LINK_SET, [PRIM_DESC, "before", 999999, "x", PRIM_DESC, "after"]);', ': unknown rule'],
  ])('every set function words it as llSetPrimitiveParams: %s', async (call, rest) => {
    const s = await loadScript({ source: `default { state_entry() { ${call} } }` })
    s.start()
    expect(debugChat(s)).toEqual([rule2(rest)])
    expect(s.host.description).toBe('before')
  })

  // In-world (SLua): ll.SetPrimitiveParams under pcall returned true and showed the same errors, worded as
  // llSetPrimitiveParams; the listener heard none of them.
  it('an SLua script shows the same error', async () => {
    const { probe, heard } = await withListener(
      'll.SetPrimitiveParams({PRIM_DESC, "before", PRIM_SIZE, "big", PRIM_DESC, "after"})',
      'slua',
    )
    expect(debugChat(probe)).toEqual([rule2(' (PRIM_SIZE): arg #1 vector expected but string given')])
    expect(heard).toEqual([])
    expect(probe.host.description).toBe('before')
  })
})

describe('the error for a rule that cannot run', () => {
  // In-world: each of these left the description "before" (the rule after the bad one did not run).
  it.each([
    ['999999, "x"', ': unknown rule'],
    ['"7", <0.6, 0.6, 0.6>', ': non-integer rule'],
    ['7.0, <0.6, 0.6, 0.6>', ': non-integer rule'],
    ['PRIM_SIZE, "big"', ' (PRIM_SIZE): arg #1 vector expected but string given'],
    ['PRIM_MATERIAL, 1.5', ' (PRIM_MATERIAL): arg #1 integer expected but float given'],
    ['PRIM_NORMAL, 0, 5, <1, 1, 0>, ZERO_VECTOR, 0.0', ' (PRIM_NORMAL): arg #2 (normal texture name) string or key expected but integer given'],
    ['PRIM_LINK_TARGET, "x"', ' (PRIM_LINK_TARGET): arg #1 integer expected but string given'],
    ['PRIM_LINK_TARGET, 1.0', ' (PRIM_LINK_TARGET): arg #1 integer expected but float given'],
    ['PRIM_SIZE, ZERO_ROTATION', ' (PRIM_SIZE): arg #1 vector expected but quaternion given'],
    ['PRIM_ROTATION, <1, 1, 1>', ' (PRIM_ROTATION): arg #1 quaternion expected but vector given'],
    ['PRIM_TEXT, <1, 1, 1>, <1, 1, 1>, 1.0', ' (PRIM_TEXT): arg #1 (text) string expected but vector given'],
    ['PRIM_ROTATION, "bad"', ' (PRIM_ROTATION): arg #1 quaternion expected but string given'],
    ['PRIM_NAME, 5', ' (PRIM_NAME): arg #1 string expected but integer given'],
    ['PRIM_DESC, (key)"x"', ' (PRIM_DESC): arg #1 string expected but key given'],
    ['PRIM_TEXTURE, 0, 5, <1,1,0>, ZERO_VECTOR, 0.0', ' (PRIM_TEXTURE): arg #2 (texture name) string or key expected but integer given'],
    ['PRIM_PROJECTOR, 5, 0.5, 0.5, 0.5', ' (PRIM_PROJECTOR): arg #1 string expected but integer given'],
    ['PRIM_RENDER_MATERIAL, 0, 5', ' (PRIM_RENDER_MATERIAL): arg #2 (render material name) string or key expected but integer given'],
    ['PRIM_HEALTH, "x"', ' (PRIM_HEALTH): arg #1 float expected but string given'],
    ['PRIM_TEXT, "t", <1,1,1>, "x"', ' (PRIM_TEXT): arg #3 (alpha) float expected but string given'],
    ['PRIM_SIT_TARGET, 1, <0,0,1>, "x"', ' (PRIM_SIT_TARGET): arg #3 quaternion expected but string given'],
    ['PRIM_TYPE, "x"', ': need integer prim type'],
    ['PRIM_TYPE, PRIM_TYPE_SCULPT, 5, 1', ' (PRIM_TYPE_SCULPT): arg #1 (texture) string or key expected but integer given'],
    ['PRIM_GLOW, "0", 0.5', ' (PRIM_GLOW): arg #1 (face number) integer expected but string given'],
    ['PRIM_FLEXIBLE, 1, 2, 0.5, 0.5, 0.5, 0.5, "v"', ' (PRIM_FLEXIBLE): arg #7 vector expected but string given'],
    ['PRIM_SPECULAR, 0, TEXTURE_BLANK, <1,1,0>, ZERO_VECTOR, 0.0, <1,1,1>, 51, 0.5', ' (PRIM_SPECULAR): arg #8 (environment) integer expected but float given'],
  ])('[%s]', async (bad, rest) => {
    const s = await set(`${bad}, PRIM_DESC, "after"`)
    expect(debugChat(s)).toEqual([rule2(rest)])
    expect(s.global('out')).toEqual(['before', 0.25])
  })
})

// In-world: one probe ran each rule cut short, [PRIM_DESC, "cN", <rule>, <the values before the missing one>],
// and showed "arg #N is missing" naming the first value left out. Most rules name only its number; the per-face
// rules, PRIM_TEXT and the shapes of PRIM_TYPE name the value too. PRIM_TYPE names the shape and counts from the
// value after it.
const MAP = ['texture repeat', 'texture offset', 'texture rotation']
const LOOP = ['hole type', 'cut', 'hollow', 'twist', 'hole size', 'top shear', 'advanced cut', 'taper', 'revolutions', 'radius offset', 'skew']
const V: Record<string, string> = { i: '0', f: '0.5', v: '<0.5, 0.5, 0.5>', r: 'ZERO_ROTATION', s: 'TEXTURE_BLANK' }
const MISSING: Array<[string, string, Array<string | null>]> = [
  ['PRIM_NAME', 's', [null]], ['PRIM_DESC', 's', [null]], ['PRIM_TEXT', 'svf', ['text', 'color', 'alpha']],
  ['PRIM_POSITION', 'v', [null]], ['PRIM_POS_LOCAL', 'v', [null]], ['PRIM_ROTATION', 'r', [null]], ['PRIM_ROT_LOCAL', 'r', [null]],
  ['PRIM_SIZE', 'v', [null]], ['PRIM_SLICE', 'v', [null]], ['PRIM_MATERIAL', 'i', [null]], ['PRIM_PHYSICS', 'i', [null]],
  ['PRIM_PHANTOM', 'i', [null]], ['PRIM_TEMP_ON_REZ', 'i', [null]], ['PRIM_PHYSICS_SHAPE_TYPE', 'i', [null]],
  ['PRIM_CAST_SHADOWS', 'i', [null]], ['PRIM_ALLOW_UNSIT', 'i', [null]], ['PRIM_SCRIPTED_SIT_ONLY', 'i', [null]],
  ['PRIM_SIT_FLAGS', 'i', [null]], ['PRIM_CLICK_ACTION', 'i', [null]], ['PRIM_HEALTH', 'f', [null]], ['PRIM_DAMAGE', 'fi', [null, null]],
  ['PRIM_OMEGA', 'vff', [null, null, null]], ['PRIM_POINT_LIGHT', 'ivfff', [null, null, null, null, null]],
  ['PRIM_REFLECTION_PROBE', 'iffi', [null, null, null, null]], ['PRIM_PROJECTOR', 'sfff', [null, null, null, null]],
  ['PRIM_FLEXIBLE', 'iiffffv', [null, null, null, null, null, null, null]], ['PRIM_SIT_TARGET', 'ivr', [null, null, null]],
  ['PRIM_COLOR', 'ivf', ['face number', 'color', 'alpha']],
  ['PRIM_TEXTURE', 'isvvf', ['face number', 'texture name', ...MAP]],
  ['PRIM_RENDER_MATERIAL', 'is', ['face number', 'render material name']],
  ['PRIM_FULLBRIGHT', 'ii', ['face number', 'fullbright']], ['PRIM_GLOW', 'if', ['face number', 'glow']],
  ['PRIM_BUMP_SHINY', 'iii', ['face number', 'shininess', 'bump mapping']],
  ['PRIM_TEXGEN', 'ii', ['face number', 'generation mode']],
  ['PRIM_NORMAL', 'isvvf', ['face number', 'normal texture name', ...MAP]],
  ['PRIM_SPECULAR', 'isvvfvii', ['face number', 'specular texture name', ...MAP, 'color', 'glossy', 'environment']],
  ['PRIM_ALPHA_MODE', 'iii', ['face number', 'alpha mode', 'alpha mask cutoff']],
  ['PRIM_GLTF_BASE_COLOR', 'isvvfvfifi', ['face number', 'texture name', ...MAP, 'color', 'alpha', 'alpha mode', 'alpha mask cutoff', 'double sided']],
  ['PRIM_GLTF_NORMAL', 'isvvf', ['face number', 'normal texture name', ...MAP]],
  ['PRIM_GLTF_METALLIC_ROUGHNESS', 'isvvfff', ['face number', 'normal texture name', ...MAP, 'metallic factor', 'roughness factor']],
  ['PRIM_GLTF_EMISSIVE', 'isvvfv', ['face number', 'emissive texture name', ...MAP, 'color']],
  ['PRIM_TYPE, PRIM_TYPE_BOX', 'ivfvvv', ['hole type', 'cut', 'hollow', 'twist', 'top size', 'top shear']],
  ['PRIM_TYPE, PRIM_TYPE_CYLINDER', 'ivfvvv', ['hole type', 'cut', 'hollow', 'twist', 'top size', 'top shear']],
  ['PRIM_TYPE, PRIM_TYPE_PRISM', 'ivfvvv', ['hole type', 'cut', 'hollow', 'twist', 'top size', 'top shear']],
  ['PRIM_TYPE, PRIM_TYPE_SPHERE', 'ivfvv', ['hole type', 'cut', 'hollow', 'twist', 'dimple']],
  ['PRIM_TYPE, PRIM_TYPE_TORUS', 'ivfvvvvvfff', LOOP],
  ['PRIM_TYPE, PRIM_TYPE_TUBE', 'ivfvvvvvfff', LOOP],
  ['PRIM_TYPE, PRIM_TYPE_RING', 'ivfvvvvvfff', LOOP],
  ['PRIM_TYPE, PRIM_TYPE_SCULPT', 'si', ['texture', 'type']],
]

describe('a rule cut short names the missing value', () => {
  const cases = MISSING.flatMap(([rule, types, labels]) => labels.map((label, k) => {
    const given = [...types.slice(0, k)].map((t) => V[t]!)
    const name = rule.startsWith('PRIM_TYPE, ') ? rule.slice('PRIM_TYPE, '.length) : rule
    return [[rule, ...given].join(', '), ` (${name}): arg #${k + 1}${label ? ` (${label})` : ''} is missing`] as const
  }))

  it.each(cases)('[%s]', async (rules, rest) => {
    const s = await set(rules)
    expect(debugChat(s)).toEqual([rule2(rest)])
    expect(s.global('out')).toEqual(['before', 0.25])
  })

  // In-world: [PRIM_DESC, "c113", PRIM_TYPE] -> "rule #2: missing prim type."; [.., PRIM_LINK_TARGET] ->
  // "(PRIM_LINK_TARGET): arg #1 is missing."
  it.each([
    ['PRIM_TYPE', ': missing prim type'],
    ['PRIM_LINK_TARGET', ' (PRIM_LINK_TARGET): arg #1 is missing'],
  ])('[%s]', async (rules, rest) => {
    const s = await set(rules)
    expect(debugChat(s)).toEqual([rule2(rest)])
  })
})

describe('a value out of bounds', () => {
  // In-world: PRIM_GLOW 5.0, -1.0 and 1.5 showed the bounds error. Aditi then went on to the next rule; the main
  // grid ended the call (prim-param-rule-errors.test.ts), which rezless keeps.
  it.each([['5.0', '5'], ['-1.0', '-1'], ['1.5', '1.5']])('PRIM_GLOW %s', async (glow, shown) => {
    const s = await set(`PRIM_GLOW, ALL_SIDES, ${glow}, PRIM_DESC, "after"`)
    expect(debugChat(s)).toEqual([rule2(` (PRIM_GLOW): bounds error; ${shown} is not in (0, 1)`)])
    expect(s.global('out')).toEqual(['before', 0.25])
  })

  // In-world: PRIM_MATERIAL 99, -1 and 8 showed a bounds error, left the material wood and set the description that
  // followed; so did PRIM_FULLBRIGHT 2 and -1 (full bright stayed on) and a PRIM_TEXT alpha of 5.0 or -1.0. A text
  // colour of <2, -1, 0.5> named 2, and <1.01, 0, 0> named 1.01; the text stayed as it was.
  it.each([
    ['PRIM_MATERIAL, 99', ' (PRIM_MATERIAL): bounds error; 99 is not in (0, 7)'],
    ['PRIM_MATERIAL, -1', ' (PRIM_MATERIAL): bounds error; -1 is not in (0, 7)'],
    ['PRIM_MATERIAL, 8', ' (PRIM_MATERIAL): bounds error; 8 is not in (0, 7)'],
    ['PRIM_FULLBRIGHT, ALL_SIDES, 2', ' (PRIM_FULLBRIGHT): bounds error; 2 is not in (0, 1)'],
    ['PRIM_FULLBRIGHT, ALL_SIDES, -1', ' (PRIM_FULLBRIGHT): bounds error; -1 is not in (0, 1)'],
    ['PRIM_TEXT, "c", <2, -1, 0.5>, 0.5', ' (PRIM_TEXT): bounds error; 2 is not in (0, 1)'],
    ['PRIM_TEXT, "x", <1.01, 0, 0>, 1.0', ' (PRIM_TEXT): bounds error; 1.01 is not in (0, 1)'],
    ['PRIM_TEXT, "t", <1, 1, 1>, 5.0', ' (PRIM_TEXT): bounds error; 5 is not in (0, 1)'],
    ['PRIM_TEXT, "u", <1, 1, 1>, -1.0', ' (PRIM_TEXT): bounds error; -1 is not in (0, 1)'],
  ])('[%s] skips only its rule', async (rule, rest) => {
    const s = await loadScript({
      source: `list out; default { state_entry() {
        llSetPrimitiveParams([PRIM_MATERIAL, PRIM_MATERIAL_WOOD, PRIM_FULLBRIGHT, ALL_SIDES, TRUE]);
        llSetPrimitiveParams([PRIM_DESC, "before", ${rule}, PRIM_DESC, "after"]);
        out = llGetPrimitiveParams([PRIM_DESC, PRIM_MATERIAL, PRIM_FULLBRIGHT, 0, PRIM_TEXT]);
      } }`,
    })
    s.start()
    expect(debugChat(s)).toEqual([rule2(rest)])
    expect(s.global('out')).toEqual(['after', 3, 1, '', { x: 0, y: 0, z: 0 }, 1])
  })

  // In-world: from full bright off, PRIM_FULLBRIGHT 2 showed the bounds error and left it off; from the prim shape,
  // PRIM_PHYSICS_SHAPE_TYPE 9 left the prim shape.
  it.each([
    ['PRIM_FULLBRIGHT, ALL_SIDES, 2', 'PRIM_FULLBRIGHT, 0', 0, rule2(' (PRIM_FULLBRIGHT): bounds error; 2 is not in (0, 1)')],
    ['PRIM_PHYSICS_SHAPE_TYPE, 9', 'PRIM_PHYSICS_SHAPE_TYPE', 0, 'Invalid physics shape type requested.'],
  ])('[%s] from the off state leaves it off', async (rule, read, expected, text) => {
    const s = await loadScript({
      source: `list out; default { state_entry() {
        llSetPrimitiveParams([PRIM_FULLBRIGHT, ALL_SIDES, FALSE, PRIM_PHYSICS_SHAPE_TYPE, PRIM_PHYSICS_SHAPE_PRIM]);
        llSetPrimitiveParams([PRIM_DESC, "before", ${rule}, PRIM_DESC, "after"]);
        out = llGetPrimitiveParams([PRIM_DESC, ${read}]);
      } }`,
    })
    s.start()
    expect(debugChat(s)).toEqual([text])
    expect(s.global('out')).toEqual(['after', expected])
  })

  // In-world, from a convex shape: PRIM_PHYSICS_SHAPE_TYPE 9 (and 28) showed "Invalid physics shape type requested.",
  // -1 a different message, and PRIM_PHYSICS_SHAPE_NONE on the root prim a third. Each left the shape convex and the
  // call went on.
  it.each([
    ['9', 'Invalid physics shape type requested.'],
    ['-1', 'ERROR: Failed to set physics shape type. Unexpected behavior may result.'],
    ['PRIM_PHYSICS_SHAPE_NONE', 'ERROR: Root prim may not be set to shape type none.'],
  ])('physics shape type %s', async (type, text) => {
    const s = await loadScript({
      source: `list out; default { state_entry() {
        llSetPrimitiveParams([PRIM_PHYSICS_SHAPE_TYPE, PRIM_PHYSICS_SHAPE_CONVEX]);
        llSetPrimitiveParams([PRIM_DESC, "before", PRIM_PHYSICS_SHAPE_TYPE, ${type}, PRIM_DESC, "after"]);
        out = llGetPrimitiveParams([PRIM_DESC, PRIM_PHYSICS_SHAPE_TYPE]);
      } }`,
    })
    s.start()
    expect(debugChat(s)).toEqual([text])
    expect(s.global('out')).toEqual(['after', 2])
  })
})

describe('a set rule on a seated avatar', () => {
  async function seated(call: string) {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const sitter = world.addAvatar({ region: 'home', key: OWNER, name: 'Sitter', username: 'sitter', size: { x: 0.45, y: 0.6, z: 1.65 }, position: { x: 110, y: 50, z: 20 } })
    const { scripts, linkset } = await loadLinkset({
      world, region: 'home', owner: OWNER, position: { x: 116, y: 50, z: 20 },
      prims: [{ name: 'seat', scripts: [{ source: { source: `default { touch_start(integer n) { integer av = llGetNumberOfPrims(); ${call} } }`, filename: 's.lsl' }, name: 's' }] }],
    })
    world.sitAvatar(sitter, linkset.prims[0]!)
    const s = scripts.s!
    s.start()
    s.fire('touch_start', { num_detected: 1 })
    return { s, sitter }
  }

  // In-world, sitting on the probe: the probe's prim showed each message; the listener heard none.
  // [999999, "x"] and [PRIM_POS_LOCAL, "bad"] gave the errors a prim gives, and [PRIM_POS_LOCAL] the missing value.
  it.each([
    ['[999999, "x"]', 'llSetPrimitiveParams error running rule #1: unknown rule.'],
    ['[PRIM_POS_LOCAL, "bad"]', 'llSetPrimitiveParams error running rule #1 (PRIM_POS_LOCAL): arg #1 vector expected but string given.'],
    ['[PRIM_POS_LOCAL]', 'llSetPrimitiveParams error running rule #1 (PRIM_POS_LOCAL): arg #1 is missing.'],
    // A rule an avatar can't take is refused with a warning before its values are looked at.
    ['[PRIM_SIZE, "big"]', 'llSetPrimitiveParams warning running rule #1 (PRIM_SIZE): PRIM_SIZE disallowed on agent.'],
    ['[PRIM_GLOW, ALL_SIDES, 5.0]', 'llSetPrimitiveParams warning running rule #1 (PRIM_GLOW): PRIM_GLOW disallowed on agent.'],
    ['[PRIM_DESC, 5]', 'llSetPrimitiveParams warning running rule #1 (PRIM_DESC): PRIM_DESC disallowed on agent.'],
    ['[PRIM_COLOR, 0, "red", 1.0]', 'llSetPrimitiveParams warning running rule #1 (PRIM_COLOR): PRIM_COLOR disallowed on agent.'],
  ])('llSetLinkPrimitiveParamsFast(avatar, %s)', async (rules, text) => {
    const { s } = await seated(`llSetLinkPrimitiveParamsFast(av, ${rules});`)
    expect(debugChat(s)).toEqual([text])
  })

  // In-world: [PRIM_DESC, "before", PRIM_LINK_TARGET, avatar, PRIM_SIZE, "big", PRIM_DESC, "after"] on LINK_THIS warned
  // about rule #3 and left the description "before".
  it('PRIM_LINK_TARGET counts as a rule', async () => {
    const { s } = await seated('llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_DESC, "before", PRIM_LINK_TARGET, av, PRIM_SIZE, "big", PRIM_DESC, "after"]);')
    expect(debugChat(s)).toEqual(['llSetPrimitiveParams warning running rule #3 (PRIM_SIZE): PRIM_SIZE disallowed on agent.'])
    expect(s.host.description).toBe('before')
  })

  // In-world: [PRIM_SIZE, <1,1,1>, PRIM_POS_LOCAL, <0,0,0.9>] left the avatar at <0,0,0.6>, and
  // [PRIM_POS_LOCAL, <0,0,0.7>, PRIM_DESC, "x", PRIM_POS_LOCAL, <0,0,1>] left it at <0,0,0.7>: the warning ends the call.
  it('the warning ends the call', async () => {
    const { sitter } = await seated('llSetLinkPrimitiveParamsFast(av, [PRIM_POS_LOCAL, <0, 0, 0.7>, PRIM_DESC, "x", PRIM_POS_LOCAL, <0, 0, 1.0>]);')
    expect(sitter.sitPlacement?.position.z).toBeCloseTo(0.7, 5)
  })

  // In-world: [PRIM_POS_LOCAL, <0,0,0.7>, 999999, "x"] moved the avatar to <0,0,0.7> and then showed the error for rule #2.
  it('rules before an error still apply to the avatar', async () => {
    const { s, sitter } = await seated('llSetLinkPrimitiveParamsFast(av, [PRIM_POS_LOCAL, <0, 0, 0.7>, 999999, "x"]);')
    expect(debugChat(s)).toEqual(['llSetPrimitiveParams error running rule #2: unknown rule.'])
    expect(sitter.sitPlacement?.position.z).toBeCloseTo(0.7, 5)
  })

  // In-world: LINK_SET with [PRIM_DESC, "x"] set the prim's description with no warning, and [999999, "x"] showed the
  // unknown-rule error once.
  it('LINK_SET with a seated avatar gives no agent warning', async () => {
    const { s } = await seated('llSetLinkPrimitiveParamsFast(LINK_SET, [PRIM_DESC, "x"]);')
    expect(debugChat(s)).toEqual([])
    expect(s.host.description).toBe('x')
    const other = await seated('llSetLinkPrimitiveParamsFast(LINK_SET, [999999, "x"]);')
    expect(debugChat(other.s)).toEqual(['llSetPrimitiveParams error running rule #1: unknown rule.'])
  })
})

describe('pathfinding without a character', () => {
  // https://wiki.secondlife.com/wiki/LlEvade#Caveats
  // In-world: each call with no character showed "You must call llCreateCharacter before <name>." in the owner's
  // chat, the listener heard none of them, and the handler went on. llExecCharacterCmd named itself
  // llExecPathingCmd. llUpdateCharacter and llDeleteCharacter showed nothing.
  it.each([
    ['llEvade(llGetOwner(), []);', 'llEvade'],
    ['llNavigateTo(llGetPos() + <1, 0, 0>, []);', 'llNavigateTo'],
    ['llPursue(llGetOwner(), []);', 'llPursue'],
    ['llWanderWithin(llGetPos(), <2, 2, 2>, []);', 'llWanderWithin'],
    ['llFleeFrom(llGetPos(), 5.0, []);', 'llFleeFrom'],
    ['llPatrolPoints([llGetPos(), llGetPos() + <1, 0, 0>], []);', 'llPatrolPoints'],
    ['llExecCharacterCmd(CHARACTER_CMD_STOP, []);', 'llExecPathingCmd'],
    ['llExecCharacterCmd(CHARACTER_CMD_JUMP, [1.0]);', 'llExecPathingCmd'],
  ])('%s', async (call, name) => {
    const { probe, heard } = await withListener(`${call} llOwnerSay("done");`)
    expect(debugChat(probe)).toEqual([`You must call llCreateCharacter before ${name}.`])
    expect(heard).toEqual([])
    expect(ownerChat(probe)).toEqual(['done'])
  })

  it.each([['llUpdateCharacter([CHARACTER_DESIRED_SPEED, 2.0]);'], ['llDeleteCharacter();']])('%s shows nothing', async (call) => {
    const { probe } = await withListener(call)
    expect(debugChat(probe)).toEqual([])
  })

  // In-world (SLua): ll.Evade and ll.NavigateTo under pcall returned true and showed the same text.
  it('an SLua script shows the same text', async () => {
    const { probe } = await withListener('local ok = pcall(function() ll.Evade(ll.GetOwner(), {}) end) ll.OwnerSay(tostring(ok))', 'slua')
    expect(debugChat(probe)).toEqual(['You must call llCreateCharacter before llEvade.'])
    expect(ownerChat(probe)).toEqual(['true'])
  })
})

describe('ll.OwnerSay with a uuid', () => {
  // In-world: ll.OwnerSay(touuid(k)) and llcompat.OwnerSay(touuid(k)) showed the key's text, uuid() of the key in
  // capitals showed it in lower case, touuid("") and NULL_KEY showed the null key, and ll.GetOwner() the owner's key.
  it('shows the key as text', async () => {
    const s = await loadScript({
      source: `
        ll.OwnerSay(touuid("${K}"))
        ll.OwnerSay(touuid(""))
        ll.OwnerSay(uuid("${K.toUpperCase()}"))
        llcompat.OwnerSay(touuid("${K}"))
        ll.OwnerSay(NULL_KEY)
        ll.OwnerSay(ll.GetOwner())
      `,
      language: 'slua',
      filename: 'own.luau',
      owner: OWNER,
    })
    s.start()
    const nul = '00000000-0000-0000-0000-000000000000'
    expect(ownerChat(s)).toEqual([K, nul, K, K, nul, OWNER])
  })
})

describe('a script that removes itself', () => {
  // In-world, five runs: llRemoveInventory(llGetScriptName()) before a loop of owner-says showed the first turn only
  // (a for loop, a while loop, a loop saying two lines a turn); a loop that said nothing for three turns showed nothing.
  // Removing itself at i == 1 of a five-turn loop raced: one run stopped after loop 2, one after loop 3, and two ran to
  // "end". rezless stops it at the next turn of the loop every time.
  it('an LSL script stops at the next turn of its loop', async () => {
    const s = await loadScript({
      source: `default { state_entry() {
        llOwnerSay("before");
        llRemoveInventory(llGetScriptName());
        integer i;
        for (i = 0; i < 4; ++i) { llOwnerSay("a" + (string)i); llOwnerSay("b" + (string)i); }
        llOwnerSay("end");
      } }`,
    })
    s.start()
    expect(ownerChat(s)).toEqual(['before', 'a0', 'b0'])
  })

  // In-world: the same in SLua (ll.RemoveInventory(ll.GetScriptName()) then a for loop) showed every line through
  // "rm4 end".
  it('an SLua script runs to the end of its chunk', async () => {
    const s = await loadScript({
      source: `
        ll.OwnerSay("before")
        ll.RemoveInventory(ll.GetScriptName())
        for i = 0, 4 do ll.OwnerSay("loop " .. i) end
        ll.OwnerSay("end")
      `,
      language: 'slua',
      filename: 'rm.luau',
    })
    s.start()
    expect(ownerChat(s)).toEqual(['before', 'loop 0', 'loop 1', 'loop 2', 'loop 3', 'loop 4', 'end'])
    expect(s.host.scripts).toHaveLength(0)
  })
})

describe('the owner resetting a script', () => {
  // In-world: after a Math Error the viewer's script list still read the script as running, but it answered no
  // command. The build menu's Reset ran state_entry again and it answered commands.
  it('brings a crashed LSL script back', async () => {
    const s = await loadScript({
      source: `default {
        state_entry() { llOwnerSay("entry"); }
        touch_start(integer n) { integer z; llOwnerSay("pre"); llOwnerSay((string)(1 / z)); }
        link_message(integer s, integer n, string m, key id) { llOwnerSay("pong"); }
      }`,
    })
    s.start()
    expect(() => s.fire('touch_start', { num_detected: 1 })).toThrow('Math Error')
    expect(s.crashed).toBe(true)
    s.reset()
    expect(s.crashed).toBe(false)
    expect(s.running).toBe(true)
    s.fire('link_message', { sender_num: 1, num: 0, str: 'ping', id: '' })
    expect(ownerChat(s)).toEqual(['entry', 'pre', 'entry', 'pong'])
  })

  // In-world: saving a crashed LSL script (a recompile of the same text) ran state_entry and it answered commands.
  it('saving a crashed script brings it back', async () => {
    const { scripts, linkset } = await loadLinkset({
      prims: [{ scripts: [{ name: 'c', source: { source: `default {
        state_entry() { llOwnerSay("entry"); }
        touch_start(integer n) { integer z; llOwnerSay((string)(1 / z)); }
      }`, filename: 'c.lsl' } }] }],
    })
    const s = scripts.c!
    s.start()
    expect(() => s.fire('touch_start', { num_detected: 1 })).toThrow('Math Error')
    linkset.prims[0]!.replaceInventory('c', {})
    linkset.advanceTime(100)
    expect(s.crashed).toBe(false)
    expect(ownerChat(s)).toEqual(['entry', 'entry'])
  })

  // In-world: error("boom custom"), indexing nil and error({}) each crashed the SLua script; Reset ran it from the
  // top again with its memory limit kept.
  it('brings a crashed SLua script back', async () => {
    const s = await loadScript({
      source: `
        ll.OwnerSay("entry " .. ll.GetMemoryLimit())
        LLEvents:on("touch_start", function() error("boom custom") end)
        LLEvents:on("link_message", function() ll.OwnerSay("pong") end)
      `,
      language: 'slua',
      filename: 'crash.luau',
    })
    s.start()
    expect(() => s.fire('touch_start', { num_detected: 1 })).toThrow()
    expect(s.crashed).toBe(true)
    s.reset()
    s.fire('link_message', { sender_num: 1, num: 0, str: 'ping', id: '' })
    expect(ownerChat(s)).toEqual(['entry 131072', 'entry 131072', 'pong'])
  })

  // In-world: a script stopped with the Running checkbox and then reset stayed stopped (no state_entry, no answer);
  // started again, it ran state_entry.
  it('leaves a stopped script stopped until it is started', async () => {
    const s = await loadScript({ source: 'default { state_entry() { llOwnerSay("entry"); } }' })
    s.start()
    s.running = false
    s.reset()
    expect(ownerChat(s)).toEqual(['entry'])
    s.advanceTime(1000)
    expect(ownerChat(s)).toEqual(['entry'])
    s.running = true
    s.advanceTime(100)
    expect(ownerChat(s)).toEqual(['entry', 'entry'])
  })

  // In-world: llSetMemoryLimit(30000) -> 1 in an LSL script, then Reset: state_entry read llGetMemoryLimit() 65536.
  // llcompat.SetMemoryLimit(100000) -> 1 in an SLua script, then Reset: it read 100000.
  it('puts an LSL script back at 65536 and keeps an SLua script’s limit', async () => {
    const lsl = await loadScript({
      source: 'default { state_entry() { llOwnerSay((string)llGetMemoryLimit()); } touch_start(integer n) { llSetMemoryLimit(30000); llOwnerSay((string)llGetMemoryLimit()); } }',
    })
    lsl.start()
    lsl.fire('touch_start', { num_detected: 1 })
    lsl.reset()
    expect(ownerChat(lsl)).toEqual(['65536', '30000', '65536'])

    const slua = await loadScript({
      source: `ll.OwnerSay(tostring(ll.GetMemoryLimit()))
        LLEvents:on("touch_start", function() llcompat.SetMemoryLimit(100000) ll.OwnerSay(tostring(ll.GetMemoryLimit())) end)`,
      language: 'slua',
      filename: 'mem.luau',
    })
    slua.start()
    slua.fire('touch_start', { num_detected: 1 })
    slua.reset()
    expect(ownerChat(slua)).toEqual(['131072', '100000', '100000'])
  })
})
