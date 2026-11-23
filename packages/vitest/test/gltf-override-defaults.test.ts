import { describe, expect, it } from 'vitest'
import { loadScript } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlSetLinkGLTFOverrides
// https://wiki.secondlife.com/wiki/PRIM_GLTF_BASE_COLOR
// In-world: measured on the Aditi beta grid, region SLua Tideland, 2026-11-23, with SLua probes on a face holding
// the Library brick material. Each probe set the overrides and read them back with ll.GetPrimitiveParams,
// printing each number with string.format("%.17g").
//
// A glTF override equal to the glTF default would read as no override, so Second Life moves it off the
// default by FLT_EPSILON (2^-23). The value is stored that way, so LSL and SLua both read it back.

const MAT = 'f35823e6-40dc-d992-f4cc-85a4cb5464c0'
const EPS = 2 ** -23

async function slua(body: string) {
  const s = await loadScript({
    source: `
      local function g(v)
        if type(v) == "number" then return string.format("%.17g", v) end
        if typeof(v) == "vector" then return string.format("<%.17g,%.17g,%.17g>", v.x, v.y, v.z) end
        return typeof(v) .. ":" .. tostring(v)
      end
      function rd()
        local b = ll.GetPrimitiveParams({PRIM_GLTF_BASE_COLOR, 0})
        local m = ll.GetPrimitiveParams({PRIM_GLTF_METALLIC_ROUGHNESS, 0})
        local e = ll.GetPrimitiveParams({PRIM_GLTF_EMISSIVE, 0})
        return "col=" .. g(b[5]) .. " a=" .. g(b[6]) .. " cut=" .. g(b[8]) .. " met=" .. g(m[5]) .. " rough=" .. g(m[6]) .. " em=" .. g(e[5])
      end
      ll.SetLinkPrimitiveParamsFast(LINK_THIS, {PRIM_RENDER_MATERIAL, 0, "${MAT}"})
      ${body}
      out = rd()
    `,
    filename: 'p.luau',
    language: 'slua',
  })
  s.start()
  return s.global('out') as string
}

const ov = (rules: string) => slua(`ll.SetLinkGLTFOverrides(LINK_THIS, 0, {${rules}})`)
const pp = (rules: string) => slua(`ll.SetLinkPrimitiveParamsFast(LINK_THIS, {${rules}})`)
const read = (s: string, field: string) => s.split(' ').find((p) => p.startsWith(`${field}=`))!.slice(field.length + 1)

describe('glTF overrides equal to the default', () => {
  // In-world: OVERRIDE_GLTF_METALLIC_FACTOR 1, 1.0, true, 1.5, 2 and 0.99999994 -> 0.99999988079071045;
  // 0.5 -> 0.5; 0, false and -1 -> 0. OVERRIDE_GLTF_ROUGHNESS_FACTOR the same (1, 1.0, true, 1.5, 0.99999994).
  it.each([
    ['1', '0.99999988079071045'],
    ['1.0', '0.99999988079071045'],
    ['true', '0.99999988079071045'],
    ['1.5', '0.99999988079071045'],
    ['2', '0.99999988079071045'],
    ['0.99999994', '0.99999988079071045'],
    ['0.5', '0.5'],
    ['0', '0'],
    ['false', '0'],
    ['-1', '0'],
  ])('metallic and roughness %s read back as %s', async (v, want) => {
    expect(read(await ov(`OVERRIDE_GLTF_METALLIC_FACTOR, ${v}`), 'met')).toBe(want)
    expect(read(await ov(`OVERRIDE_GLTF_ROUGHNESS_FACTOR, ${v}`), 'rough')).toBe(want)
  })

  // In-world: OVERRIDE_GLTF_BASE_ALPHA_MASK 0.5 -> 0.49999988079071045; 0.49999994 and 0.50000006 are kept;
  // 1, 1.0 and true -> 1; 1.5 -> 1; -1 -> 0.
  it.each([
    ['0.5', '0.49999988079071045'],
    ['0.49999994', '0.49999994039535522'],
    ['0.50000006', '0.50000005960464478'],
    ['1', '1'],
    ['true', '1'],
    ['1.5', '1'],
    ['-1', '0'],
  ])('alpha cutoff %s reads back as %s', async (v, want) => {
    expect(read(await ov(`OVERRIDE_GLTF_BASE_ALPHA_MASK, ${v}`), 'cut')).toBe(want)
  })

  // In-world: the base alpha moves off 1 only while the colour is <1,1,1>: {BASE_ALPHA, 1}, {BASE_ALPHA, true},
  // {BASE_ALPHA, 1.5}, {BASE_COLOR_FACTOR, <1,1,1>} and {BASE_COLOR_FACTOR, <2,1,1>} -> 0.99999988079071045;
  // {BASE_COLOR_FACTOR, <0.5,0.5,0.5>, BASE_ALPHA, 1} -> 1; {BASE_ALPHA, 0.99999994} is kept.
  it.each([
    ['OVERRIDE_GLTF_BASE_ALPHA, 1', '<1,1,1>', '0.99999988079071045'],
    ['OVERRIDE_GLTF_BASE_ALPHA, true', '<1,1,1>', '0.99999988079071045'],
    ['OVERRIDE_GLTF_BASE_ALPHA, 1.5', '<1,1,1>', '0.99999988079071045'],
    ['OVERRIDE_GLTF_BASE_COLOR_FACTOR, vector(1, 1, 1)', '<1,1,1>', '0.99999988079071045'],
    ['OVERRIDE_GLTF_BASE_COLOR_FACTOR, vector(2, 1, 1)', '<1,1,1>', '0.99999988079071045'],
    ['OVERRIDE_GLTF_BASE_COLOR_FACTOR, vector(1, 1, 1), OVERRIDE_GLTF_BASE_ALPHA, 1', '<1,1,1>', '0.99999988079071045'],
    ['OVERRIDE_GLTF_BASE_COLOR_FACTOR, vector(0.5, 0.5, 0.5), OVERRIDE_GLTF_BASE_ALPHA, 1', '<0.5,0.5,0.5>', '1'],
    ['OVERRIDE_GLTF_BASE_COLOR_FACTOR, vector(0.5, 0.5, 0.5)', '<0.5,0.5,0.5>', '1'],
    ['OVERRIDE_GLTF_BASE_ALPHA, 0.99999994', '<1,1,1>', '0.99999994039535522'],
  ])('{%s} reads colour %s and alpha %s', async (rules, color, alpha) => {
    const out = await ov(rules)
    expect(read(out, 'col')).toBe(color)
    expect(read(out, 'a')).toBe(alpha)
  })

  // In-world: OVERRIDE_GLTF_EMISSIVE_FACTOR <0,0,0> and <-1,0,0> -> <1.1920928955078125e-07,0,0>; <1,0,0> and
  // <2,0,0> -> <1,0,0>; <0.00000006,0,0> and <0,0.0000001,0> are kept.
  it.each([
    ['vector(0, 0, 0)', '<1.1920928955078125e-07,0,0>'],
    ['vector(-1, 0, 0)', '<1.1920928955078125e-07,0,0>'],
    ['vector(1, 0, 0)', '<1,0,0>'],
    ['vector(2, 0, 0)', '<1,0,0>'],
    ['vector(0.00000006, 0, 0)', '<5.9999997858994902e-08,0,0>'],
    ['vector(0, 0.0000001, 0)', '<0,1.0000000116860974e-07,0>'],
  ])('emissive %s reads back as %s', async (v, want) => {
    expect(read(await ov(`OVERRIDE_GLTF_EMISSIVE_FACTOR, ${v}`), 'em')).toBe(want)
  })

  // In-world: the nudged value is kept through later writes. {BASE_ALPHA, 1} then {BASE_COLOR_FACTOR, <0.5,0.5,0.5>}
  // -> alpha 0.99999988079071045; {BASE_COLOR_FACTOR, <0.5,0.5,0.5>} then {BASE_COLOR_FACTOR, <1,1,1>} -> alpha
  // 0.99999988079071045; {METALLIC, 1} then {ROUGHNESS, 0.25} -> metallic 0.99999988079071045, roughness 0.25.
  it('keeps a nudged value through later writes and nudges a colour that becomes the default', async () => {
    const a = await slua(`
      ll.SetLinkGLTFOverrides(LINK_THIS, 0, {OVERRIDE_GLTF_BASE_ALPHA, 1})
      ll.SetLinkGLTFOverrides(LINK_THIS, 0, {OVERRIDE_GLTF_BASE_COLOR_FACTOR, vector(0.5, 0.5, 0.5)})`)
    expect([read(a, 'col'), read(a, 'a')]).toEqual(['<0.5,0.5,0.5>', '0.99999988079071045'])
    const b = await slua(`
      ll.SetLinkGLTFOverrides(LINK_THIS, 0, {OVERRIDE_GLTF_BASE_COLOR_FACTOR, vector(0.5, 0.5, 0.5)})
      ll.SetLinkGLTFOverrides(LINK_THIS, 0, {OVERRIDE_GLTF_BASE_COLOR_FACTOR, vector(1, 1, 1)})`)
    expect([read(b, 'col'), read(b, 'a')]).toEqual(['<1,1,1>', '0.99999988079071045'])
    const c = await slua(`
      ll.SetLinkGLTFOverrides(LINK_THIS, 0, {OVERRIDE_GLTF_METALLIC_FACTOR, 1})
      ll.SetLinkGLTFOverrides(LINK_THIS, 0, {OVERRIDE_GLTF_ROUGHNESS_FACTOR, 0.25})`)
    expect([read(c, 'met'), read(c, 'rough')]).toEqual(['0.99999988079071045', '0.25'])
  })

  // In-world: {BASE_ALPHA, 1, BASE_COLOR_FACTOR, <0.5,0.5,0.5>} in one call -> alpha 1. The call is judged on the
  // colour and alpha it leaves, where two calls nudge the alpha in the first.
  it('judges the colour and alpha a call leaves', async () => {
    const out = await ov('OVERRIDE_GLTF_BASE_ALPHA, 1, OVERRIDE_GLTF_BASE_COLOR_FACTOR, vector(0.5, 0.5, 0.5)')
    expect([read(out, 'col'), read(out, 'a')]).toEqual(['<0.5,0.5,0.5>', '1'])
  })
})

describe('PRIM_GLTF_* values equal to the default', () => {
  // In-world: [PRIM_GLTF_METALLIC_ROUGHNESS, 0, "", "", "", "", 1, 0.5] -> 0.99999988079071045, 0.5; with 1 and
  // true for both -> 0.99999988079071045 for both; 0.99999994, 1.5 -> 0.99999988079071045 for both.
  it.each([
    ['1, 0.5', '0.99999988079071045', '0.5'],
    ['true, true', '0.99999988079071045', '0.99999988079071045'],
    ['0.99999994, 1.5', '0.99999988079071045', '0.99999988079071045'],
  ])('metallic and roughness %s read back as %s, %s', async (v, met, rough) => {
    const out = await pp(`PRIM_GLTF_METALLIC_ROUGHNESS, 0, "", "", "", "", ${v}`)
    expect([read(out, 'met'), read(out, 'rough')]).toEqual([met, rough])
  })

  // In-world: [PRIM_GLTF_BASE_COLOR, 0, "", "", "", "", <1,1,1>, 1, "", 0.5, ""] -> alpha 0.99999988079071045, cutoff
  // 0.49999988079071045; colour <0.5,0.5,0.5> with alpha 1 -> 1; only the alpha 1, or only the colour <1,1,1>
  // -> 0.99999988079071045.
  it.each([
    ['vector(1, 1, 1), 1, "", 0.5', '<1,1,1>', '0.99999988079071045', '0.49999988079071045'],
    ['vector(0.5, 0.5, 0.5), 1, "", ""', '<0.5,0.5,0.5>', '1', 'string:'],
    ['"", 1, "", ""', '<1,1,1>', '0.99999988079071045', 'string:'],
    ['vector(1, 1, 1), "", "", ""', '<1,1,1>', '0.99999988079071045', 'string:'],
  ])('base colour %s reads colour %s, alpha %s, cutoff %s', async (v, color, alpha, cut) => {
    const out = await pp(`PRIM_GLTF_BASE_COLOR, 0, "", "", "", "", ${v}, ""`)
    expect([read(out, 'col'), read(out, 'a'), read(out, 'cut')]).toEqual([color, alpha, cut])
  })

  // In-world: [PRIM_GLTF_EMISSIVE, 0, "", "", "", "", <0,0,0>] -> <1.1920928955078125e-07,0,0>
  it('nudges an emissive tint of <0,0,0>', async () => {
    expect(read(await pp('PRIM_GLTF_EMISSIVE, 0, "", "", "", "", vector(0, 0, 0)'), 'em')).toBe('<1.1920928955078125e-07,0,0>')
  })
})

describe('reading a nudged value back as text', () => {
  // In-world: after {METALLIC, 1, ROUGHNESS, 0.25}, m = ll.GetPrimitiveParams({PRIM_GLTF_METALLIC_ROUGHNESS, 0}):
  // ll.List2CSV(m) -> , <1.000000, 1.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, 0, 1.000000, 0.250000;
  // ll.DumpList2String(m, "/") -> /<1.000000, 1.000000, 0.000000>/<0.000000, 0.000000, 0.000000>/0.000000/1.000000/0.250000;
  // ll.List2Json -> ["","<1.000000, 1.000000, 0.000000>","<0.000000, 0.000000, 0.000000>",0,1.000000,0.250000];
  // tostring(m[5]) -> 0.9999998807907104; ll.List2String(m, 5) -> 1.000000; typeof(m[5]) -> number, m[5] == 1 -> false.
  // string.format("%s", m[5]) and tostring of the same value read through ll.GetLinkPrimitiveParams -> 0.9999998807907104.
  // llcompat.List2CSV(llcompat.GetPrimitiveParams(...)) gives the same CSV.
  it('prints as 1.000000 in lists and as 0.9999998807907104 from tostring', async () => {
    const s = await loadScript({
      source: `
        ll.SetLinkPrimitiveParamsFast(LINK_THIS, {PRIM_RENDER_MATERIAL, 0, "${MAT}"})
        ll.SetLinkGLTFOverrides(LINK_THIS, 0, {OVERRIDE_GLTF_METALLIC_FACTOR, 1, OVERRIDE_GLTF_ROUGHNESS_FACTOR, 0.25})
        local m = ll.GetPrimitiveParams({PRIM_GLTF_METALLIC_ROUGHNESS, 0})
        local lm = ll.GetLinkPrimitiveParams(LINK_THIS, {PRIM_GLTF_METALLIC_ROUGHNESS, 0})
        out = {
          ll.List2CSV(m), ll.DumpList2String(m, "/"), ll.List2Json(JSON_ARRAY, m), tostring(m[5]), string.format("%s", m[5]),
          ll.List2String(m, 5), typeof(m[5]), tostring(m[5] == 1), tostring(lm[5]),
          llcompat.List2CSV(llcompat.GetPrimitiveParams({PRIM_GLTF_METALLIC_ROUGHNESS, 0})),
        }
      `,
      filename: 'p.luau',
      language: 'slua',
    })
    s.start()
    const csv = ', <1.000000, 1.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, 0, 1.000000, 0.250000'
    expect(s.global('out')).toEqual([
      csv,
      '/<1.000000, 1.000000, 0.000000>/<0.000000, 0.000000, 0.000000>/0.000000/1.000000/0.250000',
      '["","<1.000000, 1.000000, 0.000000>","<0.000000, 0.000000, 0.000000>",0,1.000000,0.250000]',
      '0.9999998807907104',
      '0.9999998807907104',
      '1.000000',
      'number',
      'false',
      '0.9999998807907104',
      csv,
    ])
  })

  // In-world: after {OVERRIDE_GLTF_EMISSIVE_FACTOR, <0,0,0>}, ll.List2CSV of the PRIM_GLTF_EMISSIVE read ends
  // <0.000000, 0.000000, 0.000000>.
  it('prints a nudged emissive tint as zeros', async () => {
    const s = await loadScript({
      source: `
        ll.SetLinkPrimitiveParamsFast(LINK_THIS, {PRIM_RENDER_MATERIAL, 0, "${MAT}"})
        ll.SetLinkGLTFOverrides(LINK_THIS, 0, {OVERRIDE_GLTF_EMISSIVE_FACTOR, vector(0, 0, 0)})
        out = ll.List2CSV(ll.GetPrimitiveParams({PRIM_GLTF_EMISSIVE, 0}))
      `,
      filename: 'p.luau',
      language: 'slua',
    })
    s.start()
    expect(s.global('out')).toBe(', <1.000000, 1.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, 0, <0.000000, 0.000000, 0.000000>')
  })

  // In-world (Mono): llSetLinkGLTFOverrides(LINK_THIS, 0, [METALLIC, 1, ROUGHNESS, 1.0]) then llList2CSV of the
  // PRIM_GLTF_METALLIC_ROUGHNESS read -> , <1.000000, 1.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, 0.000000, 1.000000, 1.000000;
  // llList2Float(m, 4) == 1.0 -> 0 and llList2Float(m, 4) == 1.0 - 2^-23 -> 1
  it('prints as 1.000000 from LSL', async () => {
    const s = await loadScript({
      source: `
        string out;
        default { state_entry() {
          llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_RENDER_MATERIAL, 0, "${MAT}"]);
          llSetLinkGLTFOverrides(LINK_THIS, 0, [OVERRIDE_GLTF_METALLIC_FACTOR, 1, OVERRIDE_GLTF_ROUGHNESS_FACTOR, 1.0]);
          list m = llGetPrimitiveParams([PRIM_GLTF_METALLIC_ROUGHNESS, 0]);
          out = llList2CSV(m) + " " + (string)(llList2Float(m, 4) == 1.0) + " " + (string)(llList2Float(m, 4) == 1.0 - ${EPS});
        } }`,
    })
    s.start()
    expect(s.global('out')).toBe(', <1.000000, 1.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, 0.000000, 1.000000, 1.000000 0 1')
  })
})

describe('whole numbers in other float slots', () => {
  // In-world: set with 1, 1.0 and true, these read back as exactly 1 (typeof number, tostring 1, ll.List2CSV 1,
  // == 1 true) through ll.GetPrimitiveParams and ll.GetLinkPrimitiveParams: PRIM_GLOW, the PRIM_COLOR alpha, the
  // PRIM_TEXTURE rotation, the PRIM_POINT_LIGHT intensity and falloff, the PRIM_FLEXIBLE gravity, wind and tension,
  // and the PRIM_GLTF_BASE_COLOR texture rotation. 0 read back as 0, the light radius 10 as 10, the flexible
  // friction 2 as 2. ll.SetPhysicsMaterial(15, 1, 1, 1, 100) read back from ll.GetPhysicsMaterial() as 1, 1, 1, 100.
  it.each(['1', '1.0', 'true'])('%s reads back as 1', async (v) => {
    const s = await loadScript({
      source: `
        local function d(r, i) return typeof(r[i]) .. ":" .. tostring(r[i]) .. ":" .. ll.List2CSV({r[i]}) .. ":" .. tostring(r[i] == 1) end
        ll.SetLinkPrimitiveParamsFast(LINK_THIS, {
          PRIM_GLOW, 0, ${v}, PRIM_COLOR, 0, vector(1, 1, 1), ${v},
          PRIM_TEXTURE, 0, "89556747-24cb-43ed-920b-47caed15465f", vector(1, 1, 0), vector(0, 0, 0), ${v},
          PRIM_POINT_LIGHT, true, vector(1, 1, 1), ${v}, 10, ${v},
          PRIM_FLEXIBLE, true, 2, ${v}, 2, ${v}, ${v}, vector(0, 0, 0),
        })
        local r = ll.GetLinkPrimitiveParams(LINK_THIS, {PRIM_GLOW, 0, PRIM_COLOR, 0, PRIM_TEXTURE, 0, PRIM_POINT_LIGHT, PRIM_FLEXIBLE})
        out = {}
        for _, i in {1, 3, 7, 10, 12, 15, 17, 18} do table.insert(out, d(r, i)) end
        table.insert(out, ll.List2CSV({r[11], r[16]}))
      `,
      filename: 'p.luau',
      language: 'slua',
    })
    s.start()
    expect(s.global('out')).toEqual([...Array(8).fill('number:1:1:true'), '10, 2'])
  })

  it.each(['1', 'true'])('reads a glTF texture rotation of %s back as 1', async (v) => {
    const s = await loadScript({
      source: `
        ll.SetLinkPrimitiveParamsFast(LINK_THIS, {PRIM_RENDER_MATERIAL, 0, "${MAT}"})
        ll.SetLinkPrimitiveParamsFast(LINK_THIS, {PRIM_GLTF_BASE_COLOR, 0, "", "", "", ${v}, "", "", "", "", ""})
        local r = ll.GetPrimitiveParams({PRIM_GLTF_BASE_COLOR, 0})
        out = typeof(r[4]) .. ":" .. tostring(r[4]) .. ":" .. tostring(r[4] == 1)
      `,
      filename: 'p.luau',
      language: 'slua',
    })
    s.start()
    expect(s.global('out')).toBe('number:1:true')
  })

  it('reads physics material values back as given', async () => {
    const s = await loadScript({
      source: `
        ll.SetPhysicsMaterial(15, 1, 1, 1, 100)
        out = ll.List2CSV(ll.GetPhysicsMaterial())
      `,
      filename: 'p.luau',
      language: 'slua',
    })
    s.start()
    expect(s.global('out')).toBe('1, 1, 1, 100')
  })
})
