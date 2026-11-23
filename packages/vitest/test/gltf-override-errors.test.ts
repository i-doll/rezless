import { describe, expect, it } from 'vitest'
import { DEBUG_CHANNEL, loadLinkset, loadScript } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlSetLinkGLTFOverrides
// In-world: measured on the Aditi beta grid, region SLua Tideland, 2026-11-23, with Mono probes reading the
// errors from the owner's chat. Each call ran on a face holding the Library brick material, after which the
// probe read PRIM_GLTF_BASE_COLOR, PRIM_GLTF_METALLIC_ROUGHNESS and PRIM_GLTF_EMISSIVE back.

const MAT = 'f35823e6-40dc-d992-f4cc-85a4cb5464c0'
const ERR = 'llSetGLTFOverrides Error running rule #'
const EMPTY = 'Must be empty string to clear override..'

const HELPERS = `
string R() {
    list l = llGetPrimitiveParams([PRIM_GLTF_BASE_COLOR, 0, PRIM_GLTF_METALLIC_ROUGHNESS, 0, PRIM_GLTF_EMISSIVE, 0]);
    return llList2CSV(llList2List(l, 4, 8) + ["/"] + llList2List(l, 13, 14) + ["/"] + llList2List(l, 19, 19));
}
`

async function call(rules: string, before = '') {
  const s = await loadScript({
    source: `${HELPERS}
      list out;
      default {
        state_entry() {
          llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_RENDER_MATERIAL, 0, "${MAT}"]);
          ${before}
          llSetLinkGLTFOverrides(LINK_THIS, 0, ${rules});
          out += R();
        }
      }`,
  })
  s.start()
  return { errors: s.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text), after: (s.global('out') as string[])[0] }
}

const UNSET = ', , , , , /, , , /, '
const M = 'OVERRIDE_GLTF_METALLIC_FACTOR'

describe('llSetLinkGLTFOverrides with a wrong-typed value', () => {
  // In-world: a string or a key says it must be empty to clear the override; any other wrong type names the type
  // the override takes. An integer passes for a float override. Nothing was applied in any case.
  const V = { integer: '1', float: '0.5', string: '"x"', key: '(key)"x"', vector: '<0.5,0.5,0.5>', rotation: '<0,0,0,1>' }
  const OVERRIDES: Array<[string, 'vector' | 'float' | 'integer']> = [
    ['OVERRIDE_GLTF_BASE_COLOR_FACTOR', 'vector'],
    ['OVERRIDE_GLTF_BASE_ALPHA', 'float'],
    ['OVERRIDE_GLTF_BASE_ALPHA_MODE', 'integer'],
    ['OVERRIDE_GLTF_BASE_ALPHA_MASK', 'float'],
    ['OVERRIDE_GLTF_BASE_DOUBLE_SIDED', 'integer'],
    ['OVERRIDE_GLTF_METALLIC_FACTOR', 'float'],
    ['OVERRIDE_GLTF_ROUGHNESS_FACTOR', 'float'],
    ['OVERRIDE_GLTF_EMISSIVE_FACTOR', 'vector'],
  ]
  const cases = OVERRIDES.flatMap(([name, type]) =>
    (Object.keys(V) as Array<keyof typeof V>)
      .filter((given) => given !== type && !(type === 'float' && given === 'integer'))
      .map((given) => [name, given, `${ERR}1 (${name}): ${given === 'string' || given === 'key' ? EMPTY : `Expecting ${type} parameter..`}`] as const))

  it.each(cases)('%s given a %s', async (name, given, error) => {
    const { errors, after } = await call(`[${name}, ${V[given]}]`)
    expect(errors).toEqual([error])
    expect(after).toBe(UNSET)
  })

  // In-world: [OVERRIDE_GLTF_METALLIC_FACTOR, "0.5"] -> the same error; a string that reads as a number is still a string.
  it('rejects a string holding a number', async () => {
    expect((await call(`[${M}, "0.5"]`)).errors).toEqual([`${ERR}1 (${M}): ${EMPTY}`])
  })

  // In-world: with metallic at 0.3, [OVERRIDE_GLTF_METALLIC_FACTOR, (key)""] cleared it with no error, as "" does.
  it('clears an override given an empty key', async () => {
    const { errors, after } = await call(`[${M}, (key)""]`, `llSetLinkGLTFOverrides(LINK_THIS, 0, [${M}, 0.3]);`)
    expect(errors).toEqual([])
    expect(after).toBe(UNSET)
  })

  // In-world: [METALLIC, 0.3, ROUGHNESS, 0.4, EMISSIVE, "x"] -> rule #3; [METALLIC, 0.3, ALPHA_MODE, 1.5, ROUGHNESS, 0.4]
  // -> rule #2 Expecting integer parameter. Rules count code and value pairs from 1.
  it.each([
    [`[${M}, 0.3, OVERRIDE_GLTF_ROUGHNESS_FACTOR, 0.4, OVERRIDE_GLTF_EMISSIVE_FACTOR, "x"]`, `${ERR}3 (OVERRIDE_GLTF_EMISSIVE_FACTOR): ${EMPTY}`],
    [`[${M}, 0.3, OVERRIDE_GLTF_BASE_ALPHA_MODE, 1.5, OVERRIDE_GLTF_ROUGHNESS_FACTOR, 0.4]`, `${ERR}2 (OVERRIDE_GLTF_BASE_ALPHA_MODE): Expecting integer parameter..`],
  ])('numbers the rule: %s', async (rules, error) => {
    const { errors, after } = await call(rules)
    expect(errors).toEqual([error])
    expect(after).toBe(UNSET)
  })

  // In-world: with metallic at 0.3, [METALLIC, 0.9, ROUGHNESS, "x"] left it at 0.3: the valid rule before the
  // bad one was not applied either.
  it('rejects the whole call, leaving earlier overrides as they were', async () => {
    const { errors, after } = await call(`[${M}, 0.9, OVERRIDE_GLTF_ROUGHNESS_FACTOR, "x"]`, `llSetLinkGLTFOverrides(LINK_THIS, 0, [${M}, 0.3]);`)
    expect(errors).toEqual([`${ERR}2 (OVERRIDE_GLTF_ROUGHNESS_FACTOR): ${EMPTY}`])
    expect(after).toBe(', , , , , /, 0.300000, , /, ')
  })

  // In-world: a code with no value after it -> "Expecting <type> parameter.": [METALLIC] rule #1 float,
  // [EMISSIVE] rule #1 vector, [METALLIC, 0.3, ALPHA_MODE] rule #2 integer, [METALLIC, 0.3, ROUGHNESS, 0.4,
  // BASE_COLOR_FACTOR] rule #3 vector.
  it.each([
    [`[${M}]`, `${ERR}1 (${M}): Expecting float parameter..`],
    ['[OVERRIDE_GLTF_EMISSIVE_FACTOR]', `${ERR}1 (OVERRIDE_GLTF_EMISSIVE_FACTOR): Expecting vector parameter..`],
    [`[${M}, 0.3, OVERRIDE_GLTF_BASE_ALPHA_MODE]`, `${ERR}2 (OVERRIDE_GLTF_BASE_ALPHA_MODE): Expecting integer parameter..`],
    [`[${M}, 0.3, OVERRIDE_GLTF_ROUGHNESS_FACTOR, 0.4, OVERRIDE_GLTF_BASE_COLOR_FACTOR]`, `${ERR}3 (OVERRIDE_GLTF_BASE_COLOR_FACTOR): Expecting vector parameter..`],
  ])('a missing value: %s', async (rules, error) => {
    const { errors, after } = await call(rules)
    expect(errors).toEqual([error])
    expect(after).toBe(UNSET)
  })
})

describe('llSetLinkGLTFOverrides with an unknown code', () => {
  // In-world: [99, "x", METALLIC, 0.3], [99, 1, METALLIC, 0.3], [-1, <1,1,1>, METALLIC, 0.3], [0, 0.5] and [99]
  // each said "unknown rule id <code>" for rule #1 and applied nothing.
  it.each([
    [`[99, "x", ${M}, 0.3]`, 99],
    [`[99, 1, ${M}, 0.3]`, 99],
    [`[-1, <1,1,1>, ${M}, 0.3]`, -1],
    ['[0, 0.5]', 0],
    ['[99]', 99],
  ])('%s', async (rules, code) => {
    const { errors, after } = await call(rules)
    expect(errors).toEqual([`${ERR}1: unknown rule id ${code}.`])
    expect(after).toBe(UNSET)
  })

  // In-world: with metallic at 0.3, [METALLIC, 0.9, 99, 1] -> rule #2: unknown rule id 99, metallic still 0.3.
  it('after a valid rule, rejects the whole call', async () => {
    const { errors, after } = await call(`[${M}, 0.9, 99, 1]`, `llSetLinkGLTFOverrides(LINK_THIS, 0, [${M}, 0.3]);`)
    expect(errors).toEqual([`${ERR}2: unknown rule id 99.`])
    expect(after).toBe(', , , , , /, 0.300000, , /, ')
  })
})

describe('llSetLinkGLTFOverrides errors', () => {
  // In-world: a face with no material gave the same errors: [METALLIC, "x"] and [ALPHA_MODE, <1,1,1>].
  it.each([
    [`[${M}, "x"]`, `${ERR}1 (${M}): ${EMPTY}`],
    ['[OVERRIDE_GLTF_BASE_ALPHA_MODE, <1,1,1>]', `${ERR}1 (OVERRIDE_GLTF_BASE_ALPHA_MODE): Expecting integer parameter..`],
  ])('come without a material too: %s', async (rules, error) => {
    const s = await loadScript({ source: `default { state_entry() { llSetLinkGLTFOverrides(LINK_THIS, 0, ${rules}); } }` })
    s.start()
    expect(s.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text)).toEqual([error])
  })

  // In-world: a prim 3 m away listening on DEBUG_CHANNEL heard none of the errors above, nor the non-integer rule
  // error, though it heard the probe's own llSay on DEBUG_CHANNEL.
  it('are shown to the owner, not heard by scripts', async () => {
    const { scripts, linkset } = await loadLinkset({
      prims: [
        { name: 'probe', scripts: [{ source: { source: `default { state_entry() { llSetLinkGLTFOverrides(LINK_THIS, 0, [${M}, "x"]); llSetLinkGLTFOverrides(LINK_THIS, 0, [99, 1]); llSetLinkGLTFOverrides(LINK_THIS, 0, ["1", "x"]); llSay(DEBUG_CHANNEL, "ctl"); } }`, filename: 'p.lsl' }, name: 'p', start: false }] },
        { name: 'listener', scripts: [{ source: { source: 'list heard; default { state_entry() { llListen(DEBUG_CHANNEL, "", NULL_KEY, ""); } listen(integer c, string n, key id, string m) { heard += m; } }', filename: 'l.lsl' }, name: 'l' }] },
      ],
    })
    scripts.l!.start()
    scripts.p!.start()
    linkset.advanceTime(100)
    expect(scripts.p!.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text)).toEqual([
      `${ERR}1 (${M}): ${EMPTY}`,
      `${ERR}1: unknown rule id 99.`,
      `${ERR}1: non-integer rule.`,
      'ctl',
    ])
    expect(scripts.l!.global('heard')).toEqual(['ctl'])
  })

  // In-world: from the child of a two-prim object, [METALLIC, "x"], [99, 1] and ["1", "x"] gave the same errors
  // followed by " {RootName probe issue-604 root, RootPosition { 117, 52, 1998 }}".
  it('from a child prim end with the root name and position', async () => {
    const { scripts } = await loadLinkset({
      prims: [
        { name: 'root' },
        { name: 'child', scripts: [{ source: { source: `default { state_entry() { llSetLinkGLTFOverrides(LINK_THIS, 0, [${M}, "x"]); llSetLinkGLTFOverrides(LINK_THIS, 0, [99, 1]); llSetLinkGLTFOverrides(LINK_THIS, 0, ["1", "x"]); } }`, filename: 'c.lsl' }, name: 'c', start: false }] },
      ],
    })
    scripts.c!.start()
    const suffix = ' {RootName root, RootPosition { 0, 0, 0 }}'
    expect(scripts.c!.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text)).toEqual([
      `${ERR}1 (${M}): ${EMPTY}${suffix}`,
      `${ERR}1: unknown rule id 99.${suffix}`,
      `${ERR}1: non-integer rule.${suffix}`,
    ])
  })

  // In-world (SLua): ll.SetLinkGLTFOverrides under pcall returned true with the same errors and applied nothing:
  // {METALLIC, "x"} and {ROUGHNESS, uuid(...)} must be empty, {METALLIC, vector(1, 1, 1)} expects a float,
  // {ALPHA_MODE, 1.5} an integer and {EMISSIVE, true} a vector.
  it.each([
    [`{${M}, "x"}`, `${ERR}1 (${M}): ${EMPTY}`],
    ['{OVERRIDE_GLTF_ROUGHNESS_FACTOR, uuid("5748decc-f629-461c-9a36-a35a221fe21f")}', `${ERR}1 (OVERRIDE_GLTF_ROUGHNESS_FACTOR): ${EMPTY}`],
    [`{${M}, vector(1, 1, 1)}`, `${ERR}1 (${M}): Expecting float parameter..`],
    ['{OVERRIDE_GLTF_BASE_ALPHA_MODE, 1.5}', `${ERR}1 (OVERRIDE_GLTF_BASE_ALPHA_MODE): Expecting integer parameter..`],
    ['{OVERRIDE_GLTF_EMISSIVE_FACTOR, true}', `${ERR}1 (OVERRIDE_GLTF_EMISSIVE_FACTOR): Expecting vector parameter..`],
  ])('an SLua script gets the same: %s', async (rules, error) => {
    const s = await loadScript({
      source: `
        ll.SetLinkPrimitiveParamsFast(LINK_THIS, {PRIM_RENDER_MATERIAL, 0, "${MAT}"})
        ok = tostring(pcall(ll.SetLinkGLTFOverrides, LINK_THIS, 0, ${rules}))
        after = ll.List2CSV(ll.GetPrimitiveParams({PRIM_GLTF_BASE_COLOR, 0, PRIM_GLTF_METALLIC_ROUGHNESS, 0, PRIM_GLTF_EMISSIVE, 0}))
      `,
      filename: 'p.luau',
      language: 'slua',
    })
    s.start()
    expect(s.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text)).toEqual([error])
    expect(s.global('ok')).toBe('true')
    const t = '<1.000000, 1.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, 0'
    expect(s.global('after')).toBe(`, ${t}, , , , , , , ${t}, , , , ${t}, `)
  })
})

describe('PRIM_GLTF_* rules given a wrong type', () => {
  // In-world: llSetLinkPrimitiveParamsFast with a wrong type after the face number adds "or empty string" to the
  // types the value may take, as "" leaves that value unset. The face number takes an integer only.
  it.each([
    ['PRIM_GLTF_BASE_COLOR, 0, 5, "", "", "", "", "", "", "", ""', '(PRIM_GLTF_BASE_COLOR): arg #2 (texture name) string or key or empty string expected but integer given'],
    ['PRIM_GLTF_BASE_COLOR, 0, "", 1.0, "", "", "", "", "", "", ""', '(PRIM_GLTF_BASE_COLOR): arg #3 (texture repeat) vector or empty string expected but float given'],
    ['PRIM_GLTF_BASE_COLOR, 0, "", "", "", "x", "", "", "", "", ""', '(PRIM_GLTF_BASE_COLOR): arg #5 (texture rotation) float or empty string expected but string given'],
    ['PRIM_GLTF_BASE_COLOR, 0, "", "", "", "", 1.0, "", "", "", ""', '(PRIM_GLTF_BASE_COLOR): arg #6 (color) vector or empty string expected but float given'],
    ['PRIM_GLTF_BASE_COLOR, 0, "", "", "", "", "", "", 1.5, "", ""', '(PRIM_GLTF_BASE_COLOR): arg #8 (alpha mode) integer or empty string expected but float given'],
    ['PRIM_GLTF_BASE_COLOR, 0, "", "", "", "", "", "", "", "", <1,1,1>', '(PRIM_GLTF_BASE_COLOR): arg #10 (double sided) integer or empty string expected but vector given'],
    ['PRIM_GLTF_BASE_COLOR, "", "", "", "", "", "", "", "", "", ""', '(PRIM_GLTF_BASE_COLOR): arg #1 (face number) integer expected but string given'],
    ['PRIM_GLTF_NORMAL, 0, <1,1,1>, "", "", ""', '(PRIM_GLTF_NORMAL): arg #2 (normal texture name) string or key or empty string expected but vector given'],
    ['PRIM_GLTF_NORMAL, 0, "", "", <0,0,0,1>, ""', '(PRIM_GLTF_NORMAL): arg #4 (texture offset) vector or empty string expected but quaternion given'],
    ['PRIM_GLTF_METALLIC_ROUGHNESS, 0, "", "", "", "", "x", ""', '(PRIM_GLTF_METALLIC_ROUGHNESS): arg #6 (metallic factor) float or empty string expected but string given'],
    ['PRIM_GLTF_METALLIC_ROUGHNESS, 0, "", "", "", "", <1,1,1>, ""', '(PRIM_GLTF_METALLIC_ROUGHNESS): arg #6 (metallic factor) float or empty string expected but vector given'],
    ['PRIM_GLTF_METALLIC_ROUGHNESS, 0, "", "", "", "", "", (key)"x"', '(PRIM_GLTF_METALLIC_ROUGHNESS): arg #7 (roughness factor) float or empty string expected but key given'],
    ['PRIM_GLTF_EMISSIVE, 0, "", "", "", "", "x"', '(PRIM_GLTF_EMISSIVE): arg #6 (color) vector or empty string expected but string given'],
  ])('[%s]', async (rules, error) => {
    const s = await loadScript({ source: `default { state_entry() { llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_RENDER_MATERIAL, 0, "${MAT}"]); llSetLinkPrimitiveParamsFast(LINK_THIS, [${rules}]); } }` })
    s.start()
    expect(s.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text)).toEqual([`llSetPrimitiveParams error running rule #1 ${error}.`])
  })
})

describe('llSetLinkGLTFOverrides from SLua with a boolean', () => {
  // In-world: a boolean passes for a float override with no error and pcall returns true. {METALLIC, true} read
  // metallic back as 1.000000, {ROUGHNESS, false} read roughness back as 0.
  async function run(rules: string) {
    const s = await loadScript({
      source: `
        ll.SetLinkPrimitiveParamsFast(LINK_THIS, {PRIM_RENDER_MATERIAL, 0, "${MAT}"})
        ok = tostring(pcall(ll.SetLinkGLTFOverrides, LINK_THIS, 0, ${rules}))
        after = ll.List2CSV(ll.GetPrimitiveParams({PRIM_GLTF_METALLIC_ROUGHNESS, 0}))
      `,
      filename: 'p.luau',
      language: 'slua',
    })
    s.start()
    return s
  }
  const t = ', <1.000000, 1.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, 0, '

  it.each([`{${M}, true}`, '{OVERRIDE_GLTF_ROUGHNESS_FACTOR, false}'])('%s gives no error', async (rules) => {
    const s = await run(rules)
    expect(s.chat.filter((c) => c.channel === DEBUG_CHANNEL)).toEqual([])
    expect(s.global('ok')).toBe('true')
  })

  it('false reads back as 0', async () => {
    expect((await run('{OVERRIDE_GLTF_ROUGHNESS_FACTOR, false}')).global('after')).toBe(`${t}, 0`)
  })

  // Second Life stores a metallic factor of 1 as 1 - 2^-23, which prints as 1.000000 (gltf-override-defaults.test.ts).
  it('true reads back as 1.000000', async () => {
    expect((await run(`{${M}, true}`)).global('after')).toBe(`${t}1.000000, `)
  })
})
