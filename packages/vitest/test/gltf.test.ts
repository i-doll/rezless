import { describe, it, expect } from 'vitest'
import { loadScript, loadLinkset, makeInventoryItem, InventoryType, DEBUG_CHANNEL } from '../src/index.js'

const MAT = 'f35823e6-40dc-d992-f4cc-85a4cb5464c0'

const HELPERS = `
string MAT = "${MAT}";
out(string id, string v) { llSay(7777, id + "=[" + v + "]"); }
string D(list l) { string s; integer i; integer n = llGetListLength(l); for (i = 0; i < n; ++i) s += "{" + llList2String(l, i) + "}" + (string)llGetListEntryType(l, i); return s; }
string G(integer rule) { return D(llGetPrimitiveParams([rule, 0])); }
dumpAll(string tag) {
    out(tag + "_bc", G(PRIM_GLTF_BASE_COLOR));
    out(tag + "_nm", G(PRIM_GLTF_NORMAL));
    out(tag + "_mr", G(PRIM_GLTF_METALLIC_ROUGHNESS));
    out(tag + "_em", G(PRIM_GLTF_EMISSIVE));
    out(tag + "_rm", G(PRIM_RENDER_MATERIAL) + "|" + llGetRenderMaterial(0));
}
setMat(string m) { llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_RENDER_MATERIAL, 0, m]); }
`

async function probe(body: string) {
  const s = await loadScript({ source: `${HELPERS}\ndefault { state_entry() { ${body} } }` })
  s.start()
  return {
    lines: s.chat.filter((c) => c.channel === 7777).map((c) => c.text),
    errors: s.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text),
  }
}

const UNSET_BC = '[{}3{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2{}3{}3{}3{}3{}3]'
const UNSET_NM = '[{}3{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2]'
const UNSET_MR = '[{}3{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2{}3{}3]'
const UNSET_EM = '[{}3{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2{}3]'
const NO_MAT = `[{00000000-0000-0000-0000-000000000000}3|00000000-0000-0000-0000-000000000000]`
const WITH_MAT = `[{${MAT}}3|${MAT}]`

describe('glTF material values (#144)', () => {
  it('reads unset values as empty and clears overrides when a material is set', async () => {
    const s = await loadScript({
      source: `
// The brick material from the Library
string MATERIAL = "f35823e6-40dc-d992-f4cc-85a4cb5464c0";
string TEXTURE = TEXTURE_BLANK;

list gltf()
{
    return llGetLinkPrimitiveParams(LINK_THIS, [PRIM_GLTF_BASE_COLOR, 0]);
}

string describe()
{
    return "gltf |" + llDumpList2String(gltf(), " | ") + "| prim colour |"
        + llDumpList2String(llGetLinkPrimitiveParams(LINK_THIS, [PRIM_COLOR, 0]), " ") + "|";
}

baseline()
{
    llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_COLOR, 0, <1.0, 1.0, 1.0>, 1.0]);
    llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_RENDER_MATERIAL, 0, MATERIAL]);
    llSleep(2.0);
}

say(string name, string result)
{
    llOwnerSay(name + " => " + result);
}

default
{
    state_entry()
    {
        baseline();
        say("1 material set", describe());

        list old = gltf();
        llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_GLTF_BASE_COLOR, 0, TEXTURE]
            + llList2List(old, 1, -1));
        say("2 texture override written", describe());

        baseline();
        say("3 material set again", describe());
    }
}
`,
    })
    s.start()
    // In-world: Second Life prints these three lines (issue #144).
    expect(s.chat.map((c) => c.text.trimEnd())).toEqual([
      '1 material set => gltf | | <1.000000, 1.000000, 0.000000> | <0.000000, 0.000000, 0.000000> | 0.000000 |  |  |  |  | | prim colour |<1.000000, 1.000000, 1.000000> 1.000000|',
      '2 texture override written => gltf |5748decc-f629-461c-9a36-a35a221fe21f | <1.000000, 1.000000, 0.000000> | <0.000000, 0.000000, 0.000000> | 0.000000 |  |  |  |  | | prim colour |<1.000000, 1.000000, 1.000000> 1.000000|',
      '3 material set again => gltf | | <1.000000, 1.000000, 0.000000> | <0.000000, 0.000000, 0.000000> | 0.000000 |  |  |  |  | | prim colour |<1.000000, 1.000000, 1.000000> 1.000000|',
    ])
  })
})

describe('glTF overrides on a face without a material', () => {
  it('read as unset, with NULL_KEY legacy maps, and keep only the transforms written', async () => {
    const { lines } = await probe(`
      dumpAll("fresh");
      out("fresh_lnm", G(PRIM_NORMAL));
      out("fresh_spec", G(PRIM_SPECULAR));
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_GLTF_BASE_COLOR, 0, TEXTURE_BLANK, <2,2,0>, <0.1,0.2,0>, 0.5, <1,0,0>, 0.5, PRIM_GLTF_ALPHA_MODE_MASK, 0.3, 1]);
      out("nomat_bc_full", G(PRIM_GLTF_BASE_COLOR));
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_GLTF_METALLIC_ROUGHNESS, 0, "", "", "", "", 0.25, ""]);
      out("nomat_mr_partial", G(PRIM_GLTF_METALLIC_ROUGHNESS));
    `)
    // In-world: probe p1 on a fresh box.
    expect(lines).toEqual([
      `fresh_bc=${UNSET_BC}`,
      `fresh_nm=${UNSET_NM}`,
      `fresh_mr=${UNSET_MR}`,
      `fresh_em=${UNSET_EM}`,
      `fresh_rm=${NO_MAT}`,
      'fresh_lnm=[{00000000-0000-0000-0000-000000000000}4{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2]',
      'fresh_spec=[{00000000-0000-0000-0000-000000000000}4{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2{<1.000000, 1.000000, 1.000000>}5{51}1{0}1]',
      'nomat_bc_full=[{}3{<2.000000, 2.000000, 0.000000>}5{<0.100000, 0.200000, 0.000000>}5{0.500000}2{}3{}3{}3{}3{}3]',
      `nomat_mr_partial=${UNSET_MR}`,
    ])
  })
})

describe('glTF overrides on a face with a material', () => {
  it('store each override separately, read textures as keys, and lose them when the material is set again', async () => {
    const { lines } = await probe(`
      setMat(MAT);
      dumpAll("mat");
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_GLTF_BASE_COLOR, 0, "", "", "", "", <1,0,0>, "", "", "", ""]);
      out("ov_bc_color", G(PRIM_GLTF_BASE_COLOR));
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_GLTF_BASE_COLOR, 0, TEXTURE_BLANK, <2,2,0>, <0.1,0.2,0>, 0.5, <0,1,0>, 0.5, PRIM_GLTF_ALPHA_MODE_MASK, 0.3, 1]);
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_GLTF_NORMAL, 0, TEXTURE_BLANK, <3,3,0>, <0.5,0,0>, 1.0]);
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_GLTF_METALLIC_ROUGHNESS, 0, TEXTURE_BLANK, <1,1,0>, <0,0,0>, 0.0, 0.25, 0.75]);
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_GLTF_EMISSIVE, 0, TEXTURE_BLANK, <1,1,0>, <0,0,0>, 0.0, <0.5,0.5,0.5>]);
      dumpAll("ov_full");
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_GLTF_BASE_COLOR, 0, "", "", "", "", "", 0.25, "", "", ""]);
      out("ov_bc_partial2", G(PRIM_GLTF_BASE_COLOR));
      setMat(MAT);
      dumpAll("mat_again");
    `)
    // In-world: probe p2.
    expect(lines).toEqual([
      `mat_bc=${UNSET_BC}`,
      `mat_nm=${UNSET_NM}`,
      `mat_mr=${UNSET_MR}`,
      `mat_em=${UNSET_EM}`,
      `mat_rm=${WITH_MAT}`,
      'ov_bc_color=[{}3{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2{<1.000000, 0.000000, 0.000000>}5{1.000000}2{}3{}3{}3]',
      'ov_full_bc=[{5748decc-f629-461c-9a36-a35a221fe21f}4{<2.000000, 2.000000, 0.000000>}5{<0.100000, 0.200000, 0.000000>}5{0.500000}2{<0.000000, 1.000000, 0.000000>}5{0.500000}2{2}1{0.300000}2{1}1]',
      'ov_full_nm=[{5748decc-f629-461c-9a36-a35a221fe21f}4{<3.000000, 3.000000, 0.000000>}5{<0.500000, 0.000000, 0.000000>}5{1.000000}2]',
      'ov_full_mr=[{5748decc-f629-461c-9a36-a35a221fe21f}4{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2{0.250000}2{0.750000}2]',
      'ov_full_em=[{5748decc-f629-461c-9a36-a35a221fe21f}4{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2{<0.500000, 0.500000, 0.500000>}5]',
      `ov_full_rm=${WITH_MAT}`,
      'ov_bc_partial2=[{}3{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2{<1.000000, 1.000000, 1.000000>}5{0.250000}2{}3{}3{}3]',
      `mat_again_bc=${UNSET_BC}`,
      'mat_again_nm=[{}3{<3.000000, 3.000000, 0.000000>}5{<0.500000, 0.000000, 0.000000>}5{1.000000}2]',
      `mat_again_mr=${UNSET_MR}`,
      `mat_again_em=${UNSET_EM}`,
      `mat_again_rm=${WITH_MAT}`,
    ])
  })
})

describe('render materials', () => {
  it('survive texture and colour changes, clear to NULL_KEY, and report an unknown name', async () => {
    const { lines, errors } = await probe(`
      setMat(MAT);
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_GLTF_BASE_COLOR, 0, "", "", "", "", <1,0,0>, "", "", "", ""]);
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_TEXTURE, 0, TEXTURE_PLYWOOD, <1,1,0>, ZERO_VECTOR, 0.0, PRIM_COLOR, 0, <0,0,1>, 0.8]);
      out("after_tex_bc", G(PRIM_GLTF_BASE_COLOR));
      out("after_tex_rm", G(PRIM_RENDER_MATERIAL) + "|" + llGetRenderMaterial(0));
      out("after_tex_col", G(PRIM_COLOR));
      setMat(NULL_KEY);
      dumpAll("cleared_nullkey");
      setMat(MAT);
      setMat("");
      out("cleared_empty_rm", G(PRIM_RENDER_MATERIAL) + "|" + llGetRenderMaterial(0));
      llSetRenderMaterial("nope", 0);
      out("bad_name_rm", G(PRIM_RENDER_MATERIAL) + "|" + llGetRenderMaterial(0));
      llSetRenderMaterial("00000000-0000-0000-0000-000000000123", 0);
      out("bad_uuid_rm", G(PRIM_RENDER_MATERIAL) + "|" + llGetRenderMaterial(0));
      llSetRenderMaterial(MAT, ALL_SIDES);
      out("allsides_rm", D(llGetPrimitiveParams([PRIM_RENDER_MATERIAL, ALL_SIDES])) + "|" + llGetRenderMaterial(5) + "|" + llGetRenderMaterial(99) + "|" + llGetRenderMaterial(-1));
    `)
    // In-world: probe p4.
    expect(lines).toEqual([
      'after_tex_bc=[{}3{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2{<1.000000, 0.000000, 0.000000>}5{1.000000}2{}3{}3{}3]',
      `after_tex_rm=${WITH_MAT}`,
      'after_tex_col=[{<0.000000, 0.000000, 1.000000>}5{0.800000}2]',
      `cleared_nullkey_bc=${UNSET_BC}`,
      `cleared_nullkey_nm=${UNSET_NM}`,
      `cleared_nullkey_mr=${UNSET_MR}`,
      `cleared_nullkey_em=${UNSET_EM}`,
      `cleared_nullkey_rm=${NO_MAT}`,
      `cleared_empty_rm=${NO_MAT}`,
      `bad_name_rm=${NO_MAT}`,
      'bad_uuid_rm=[{00000000-0000-0000-0000-000000000123}3|00000000-0000-0000-0000-000000000123]',
      `allsides_rm=[${`{${MAT}}3`.repeat(6)}|${MAT}|00000000-0000-0000-0000-000000000000|${MAT}]`,
    ])
    expect(errors).toEqual(["Could not find render material 'nope'."])
  })

  it('reads face 0 for a negative face and stores NULL_KEY for an unknown name in PRIM_RENDER_MATERIAL', async () => {
    const { lines, errors } = await probe(`
      setMat(MAT);
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_RENDER_MATERIAL, 1, "nope"]);
      out("pp_bad_name", D(llGetPrimitiveParams([PRIM_RENDER_MATERIAL, 1])));
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_RENDER_MATERIAL, 1, "00000000-0000-0000-0000-000000000123"]);
      out("rm_m1", llGetRenderMaterial(-1) + "|" + llGetRenderMaterial(1) + "|" + D(llGetPrimitiveParams([PRIM_RENDER_MATERIAL, -1])));
    `)
    // In-world: probe p5.
    expect(lines).toEqual([
      'pp_bad_name=[{00000000-0000-0000-0000-000000000000}3]',
      `rm_m1=[${MAT}|00000000-0000-0000-0000-000000000123|{${MAT}}3{00000000-0000-0000-0000-000000000123}3${'{00000000-0000-0000-0000-000000000000}3'.repeat(4)}]`,
    ])
    expect(errors).toEqual([])
  })

  it('reads a material item named in the prim inventory back as its name', async () => {
    const s = await loadScript({
      source: `string m; default { state_entry() { llSetRenderMaterial("brick", 0); m = llGetRenderMaterial(0); } }`,
    })
    s.host.addInventory(makeInventoryItem({ name: 'brick', type: InventoryType.MATERIAL, key: MAT }))
    s.start()
    // In-world: mat_name_root in p10.full.iw
    expect(s.global('m')).toBe('brick')
    expect(s.chat).toEqual([])
  })
})

describe('llSetLinkGLTFOverrides', () => {
  it('writes the value overrides the PRIM_GLTF_* rules read', async () => {
    const { lines, errors } = await probe(`
      setMat(MAT);
      llSetLinkGLTFOverrides(LINK_THIS, 0, [OVERRIDE_GLTF_BASE_COLOR_FACTOR, <1,0,0>, OVERRIDE_GLTF_BASE_ALPHA, 0.5, OVERRIDE_GLTF_BASE_ALPHA_MODE, PRIM_GLTF_ALPHA_MODE_MASK, OVERRIDE_GLTF_BASE_ALPHA_MASK, 0.4, OVERRIDE_GLTF_BASE_DOUBLE_SIDED, TRUE, OVERRIDE_GLTF_METALLIC_FACTOR, 0.1, OVERRIDE_GLTF_ROUGHNESS_FACTOR, 0.2, OVERRIDE_GLTF_EMISSIVE_FACTOR, <0.3,0.3,0.3>]);
      dumpAll("glo");
      llSetLinkGLTFOverrides(LINK_THIS, 0, [OVERRIDE_GLTF_BASE_COLOR_FACTOR, "", OVERRIDE_GLTF_METALLIC_FACTOR, ""]);
      out("glo_clear_bc", G(PRIM_GLTF_BASE_COLOR));
      out("glo_clear_mr", G(PRIM_GLTF_METALLIC_ROUGHNESS));
      llSetLinkGLTFOverrides(LINK_THIS, 0, []);
      out("glo_empty_bc", G(PRIM_GLTF_BASE_COLOR));
      llSetLinkGLTFOverrides(LINK_THIS, ALL_SIDES, [OVERRIDE_GLTF_BASE_ALPHA, 0.9]);
      out("glo_all_bc0", G(PRIM_GLTF_BASE_COLOR));
      out("glo_all_bc3", D(llGetPrimitiveParams([PRIM_GLTF_BASE_COLOR, 3])));
      llSetLinkGLTFOverrides(LINK_THIS, 0, [OVERRIDE_GLTF_BASE_ALPHA, "x"]);
      llSetLinkGLTFOverrides(LINK_THIS, 0, [99, 1]);
      llSetLinkGLTFOverrides(LINK_THIS, 0, [OVERRIDE_GLTF_BASE_ALPHA]);
      out("glo_bad_bc", G(PRIM_GLTF_BASE_COLOR));
    `)
    const set = '[{}3{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2{<1.000000, 0.000000, 0.000000>}5{0.500000}2{2}1{0.400000}2{1}1]'
    const alpha09 = set.replace('{0.500000}', '{0.900000}')
    // In-world: probe p3.
    expect(lines).toEqual([
      `glo_bc=${set}`,
      `glo_nm=${UNSET_NM}`,
      'glo_mr=[{}3{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2{0.100000}2{0.200000}2]',
      'glo_em=[{}3{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2{<0.300000, 0.300000, 0.300000>}5]',
      `glo_rm=${WITH_MAT}`,
      `glo_clear_bc=${set}`,
      'glo_clear_mr=[{}3{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2{}3{0.200000}2]',
      `glo_empty_bc=${set}`,
      `glo_all_bc0=${alpha09}`,
      `glo_all_bc3=${UNSET_BC}`,
      `glo_bad_bc=${alpha09}`,
    ])
    expect(errors).toEqual([])
  })

  it('sets the colour factor alone with alpha 1 and clears the separate overrides with ""', async () => {
    const { lines } = await probe(`
      setMat(MAT);
      llSetLinkGLTFOverrides(LINK_THIS, 0, [OVERRIDE_GLTF_BASE_COLOR_FACTOR, <0,1,0>, OVERRIDE_GLTF_BASE_ALPHA_MODE, 1, OVERRIDE_GLTF_BASE_ALPHA_MASK, 0.4, OVERRIDE_GLTF_BASE_DOUBLE_SIDED, 1, OVERRIDE_GLTF_ROUGHNESS_FACTOR, 0.2, OVERRIDE_GLTF_EMISSIVE_FACTOR, <1,1,1>]);
      out("set", G(PRIM_GLTF_BASE_COLOR) + G(PRIM_GLTF_METALLIC_ROUGHNESS) + G(PRIM_GLTF_EMISSIVE));
      llSetLinkGLTFOverrides(LINK_THIS, 0, [OVERRIDE_GLTF_BASE_ALPHA_MODE, "", OVERRIDE_GLTF_BASE_ALPHA_MASK, "", OVERRIDE_GLTF_BASE_DOUBLE_SIDED, "", OVERRIDE_GLTF_ROUGHNESS_FACTOR, "", OVERRIDE_GLTF_EMISSIVE_FACTOR, ""]);
      out("cleared", G(PRIM_GLTF_BASE_COLOR) + G(PRIM_GLTF_METALLIC_ROUGHNESS) + G(PRIM_GLTF_EMISSIVE));
    `)
    const t = '{}3{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2'
    // In-world: an unset alpha beside a set colour reads 1.0 (probe p2 ov_bc_color) and "" clears
    // OVERRIDE_GLTF_METALLIC_FACTOR (probe p3); the other separate overrides are assumed to clear the same way.
    expect(lines).toEqual([
      `set=[${t}{<0.000000, 1.000000, 0.000000>}5{1.000000}2{1}1{0.400000}2{1}1${t}{}3{0.200000}2${t}{<1.000000, 1.000000, 1.000000>}5]`,
      `cleared=[${t}{<0.000000, 1.000000, 0.000000>}5{1.000000}2{}3{}3{}3${t}{}3{}3${t}{}3]`,
    ])
  })

  it('sets the alpha alone with colour <1,1,1>', async () => {
    const { lines } = await probe(`
      setMat(MAT);
      llSetLinkGLTFOverrides(LINK_THIS, 0, [OVERRIDE_GLTF_BASE_ALPHA, 0.25]);
      out("alpha", G(PRIM_GLTF_BASE_COLOR));
    `)
    // In-world: an unset colour beside a set alpha reads <1,1,1> (probe p2 ov_bc_partial2).
    expect(lines).toEqual([
      'alpha=[{}3{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2{<1.000000, 1.000000, 1.000000>}5{0.250000}2{}3{}3{}3]',
    ])
  })

  it('clears separate overrides with "", leaves the alpha alone, rejects a call with any wrong-typed value, and clamps', async () => {
    const { lines } = await probe(`
      setMat(MAT);
      llSetLinkGLTFOverrides(LINK_THIS, 0, [OVERRIDE_GLTF_BASE_COLOR_FACTOR, <1,0,0>, OVERRIDE_GLTF_BASE_ALPHA, 0.5, OVERRIDE_GLTF_BASE_ALPHA_MODE, PRIM_GLTF_ALPHA_MODE_MASK, OVERRIDE_GLTF_BASE_ALPHA_MASK, 0.4, OVERRIDE_GLTF_BASE_DOUBLE_SIDED, TRUE, OVERRIDE_GLTF_METALLIC_FACTOR, 0.1, OVERRIDE_GLTF_ROUGHNESS_FACTOR, 0.2, OVERRIDE_GLTF_EMISSIVE_FACTOR, <0.3,0.3,0.3>]);
      llSetLinkGLTFOverrides(LINK_THIS, 0, [OVERRIDE_GLTF_BASE_ALPHA, ""]); out("c_alpha", G(PRIM_GLTF_BASE_COLOR));
      llSetLinkGLTFOverrides(LINK_THIS, 0, [OVERRIDE_GLTF_BASE_ALPHA_MODE, ""]); out("c_mode", G(PRIM_GLTF_BASE_COLOR));
      llSetLinkGLTFOverrides(LINK_THIS, 0, [OVERRIDE_GLTF_BASE_ALPHA_MASK, ""]); out("c_mask", G(PRIM_GLTF_BASE_COLOR));
      llSetLinkGLTFOverrides(LINK_THIS, 0, [OVERRIDE_GLTF_BASE_DOUBLE_SIDED, ""]); out("c_dbl", G(PRIM_GLTF_BASE_COLOR));
      llSetLinkGLTFOverrides(LINK_THIS, 0, [OVERRIDE_GLTF_ROUGHNESS_FACTOR, ""]); out("c_rough", G(PRIM_GLTF_METALLIC_ROUGHNESS));
      llSetLinkGLTFOverrides(LINK_THIS, 0, [OVERRIDE_GLTF_EMISSIVE_FACTOR, ""]); out("c_emis", G(PRIM_GLTF_EMISSIVE));
      llSetLinkGLTFOverrides(LINK_THIS, 0, [OVERRIDE_GLTF_METALLIC_FACTOR, 0.3, OVERRIDE_GLTF_BASE_ALPHA, "x", OVERRIDE_GLTF_ROUGHNESS_FACTOR, 0.6]); out("multi_bad", G(PRIM_GLTF_METALLIC_ROUGHNESS) + "#" + G(PRIM_GLTF_BASE_COLOR));
      llSetLinkGLTFOverrides(LINK_THIS, 0, [OVERRIDE_GLTF_BASE_ALPHA_MODE, 1.5, OVERRIDE_GLTF_BASE_DOUBLE_SIDED, 2.7]); out("int_float", G(PRIM_GLTF_BASE_COLOR));
      llSetLinkGLTFOverrides(LINK_THIS, 0, [OVERRIDE_GLTF_BASE_ALPHA_MODE, 7, OVERRIDE_GLTF_BASE_ALPHA, 2.0, OVERRIDE_GLTF_METALLIC_FACTOR, -1.0]); out("ranges", G(PRIM_GLTF_BASE_COLOR) + "#" + G(PRIM_GLTF_METALLIC_ROUGHNESS));
    `)
    const t = '{}3{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2'
    const red = '{<1.000000, 0.000000, 0.000000>}5'
    // In-world: probe p5.
    expect(lines).toEqual([
      `c_alpha=[${t}${red}{0.500000}2{2}1{0.400000}2{1}1]`,
      `c_mode=[${t}${red}{0.500000}2{}3{0.400000}2{1}1]`,
      `c_mask=[${t}${red}{0.500000}2{}3{}3{1}1]`,
      `c_dbl=[${t}${red}{0.500000}2{}3{}3{}3]`,
      `c_rough=[${t}{0.100000}2{}3]`,
      `c_emis=[${t}{}3]`,
      `multi_bad=[${t}{0.100000}2{}3#${t}${red}{0.500000}2{}3{}3{}3]`,
      `int_float=[${t}${red}{0.500000}2{}3{}3{}3]`,
      `ranges=[${t}${red}{1.000000}2{2}1{}3{}3#${t}{0.000000}2{}3]`,
    ])
  })
})

describe('llSetLinkGLTFOverrides codes', () => {
  it('skips a code that is not an integer', async () => {
    const { lines } = await probe(`
      setMat(MAT);
      llSetLinkGLTFOverrides(LINK_THIS, 0, ["1", "x", OVERRIDE_GLTF_METALLIC_FACTOR, 0.3]);
      out("mr", G(PRIM_GLTF_METALLIC_ROUGHNESS));
    `)
    // Not measured in-world: modelled like the unknown code 99 in probe p3, which changed nothing.
    expect(lines).toEqual([
      'mr=[{}3{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2{0.300000}2{}3]',
    ])
  })
})

describe('legacy PRIM_NORMAL and PRIM_SPECULAR', () => {
  it('treat a "" texture on a default face as NULL_KEY and read set maps as keys', async () => {
    const { lines } = await probe(`
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_NORMAL, 0, "", <2,2,0>, ZERO_VECTOR, 0.0]); out("nm_empty", G(PRIM_NORMAL));
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_NORMAL, 0, TEXTURE_BLANK, <1,1,0>, ZERO_VECTOR, 0.0]); out("nm_set", G(PRIM_NORMAL));
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_NORMAL, 0, NULL_KEY, <1,1,0>, ZERO_VECTOR, 0.0]); out("nm_null", G(PRIM_NORMAL));
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_SPECULAR, 0, "", <1,1,0>, ZERO_VECTOR, 0.0, <1,0,0>, 100, 5]); out("sp_empty", G(PRIM_SPECULAR));
    `)
    const t = '{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2'
    // In-world: probe p5, on a face at its defaults.
    expect(lines).toEqual([
      `nm_empty=[{00000000-0000-0000-0000-000000000000}4${t}]`,
      `nm_set=[{5748decc-f629-461c-9a36-a35a221fe21f}4${t}]`,
      `nm_null=[{00000000-0000-0000-0000-000000000000}4${t}]`,
      `sp_empty=[{00000000-0000-0000-0000-000000000000}4${t}{<1.000000, 1.000000, 1.000000>}5{51}1{0}1]`,
    ])
  })

  it('reset a map to its defaults when written with a "" texture', async () => {
    const { lines } = await probe(`
      llSetPrimitiveParams([PRIM_NORMAL, 3, TEXTURE_BLANK, <2,2,0>, <0.1,0,0>, 0.5]);
      llSetPrimitiveParams([PRIM_NORMAL, 3, "", <3,3,0>, <0.2,0,0>, 1.0]); out("nm", D(llGetPrimitiveParams([PRIM_NORMAL, 3])));
      llSetPrimitiveParams([PRIM_SPECULAR, 3, TEXTURE_BLANK, <2,2,0>, <0.1,0,0>, 0.5, <1,0,0>, 100, 5]);
      llSetPrimitiveParams([PRIM_SPECULAR, 3, "", <3,3,0>, <0.2,0,0>, 1.0, <0,1,0>, 20, 2]); out("sp", D(llGetPrimitiveParams([PRIM_SPECULAR, 3])));
    `)
    // In-world: nm_existing_empty, sp_existing_empty in p10.full.iw
    expect(lines).toEqual([
      `nm=[{00000000-0000-0000-0000-000000000000}4${'{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2'}]`,
      `sp=[{00000000-0000-0000-0000-000000000000}4{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2{<1.000000, 1.000000, 1.000000>}5{51}1{0}1]`,
    ])
  })
})

const TX = '{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2'
const NULL = '00000000-0000-0000-0000-000000000000'
const BLANK = '5748decc-f629-461c-9a36-a35a221fe21f'
const DEFAULT_TEX = '89556747-24cb-43ed-920b-47caed15465f'

describe('texture names (probe p6)', () => {
  it('llSetTexture reports a name that is not a texture and leaves the face alone', async () => {
    const { lines, errors } = await probe(`
      llSetTexture("nope", 0); out("a", llGetTexture(0));
      llSetTexture("", 1); out("b", llGetTexture(1));
      llSetTexture(NULL_KEY, 2); out("c", llGetTexture(2));
    `)
    // In-world: tex_badname, tex_empty, tex_null in p6.full.iw
    expect(lines).toEqual([`a=[${DEFAULT_TEX}]`, `b=[${DEFAULT_TEX}]`, `c=[${DEFAULT_TEX}]`])
    expect(errors).toEqual([
      "Could not find texture 'nope'.",
      "Could not find texture ''.",
      `Could not find texture '${NULL}'.`,
    ])
  })

  it('keeps the name of a texture in the prim inventory as given', async () => {
    const s = await loadScript({
      source: `string t; string n; string x; default { state_entry() {
        llSetTexture("Wood_BaseColor", 2); t = llGetTexture(2);
        llSetPrimitiveParams([PRIM_TEXTURE, 3, "Wood_BaseColor", <1,1,0>, ZERO_VECTOR, 0.0]); x = llGetTexture(3);
        llSetPrimitiveParams([PRIM_NORMAL, 4, "Wood_BaseColor", <1,1,0>, ZERO_VECTOR, 0.0]); n = llList2String(llGetPrimitiveParams([PRIM_NORMAL, 4]), 0);
      } }`,
    })
    s.host.addInventory(makeInventoryItem({ name: 'Wood_BaseColor', type: InventoryType.TEXTURE, key: BLANK }))
    s.start()
    // In-world: st_inv, pp_inv, nm_inv in p8.full.iw
    expect([s.global('t'), s.global('x'), s.global('n')]).toEqual(['Wood_BaseColor', 'Wood_BaseColor', 'Wood_BaseColor'])
    expect(s.chat).toEqual([])
  })

  it('reads an inventory texture in a glTF texture slot back as its key', async () => {
    const s = await loadScript({
      source: `string t; default { state_entry() {
        llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_RENDER_MATERIAL, 0, "${MAT}"]);
        llSetPrimitiveParams([PRIM_GLTF_NORMAL, 0, "Wood_BaseColor", "", "", ""]);
        t = llList2String(llGetPrimitiveParams([PRIM_GLTF_NORMAL, 0]), 0);
      } }`,
    })
    s.host.addInventory(makeInventoryItem({ name: 'Wood_BaseColor', type: InventoryType.TEXTURE, key: BLANK }))
    s.start()
    // In-world: gltf_inv_root in p10.full.iw
    expect(s.global('t')).toBe(BLANK)
  })

  it('llSetLinkTexture reports a name that is not a texture and leaves the face alone', async () => {
    const { lines, errors } = await probe(`
      llSetLinkTexture(LINK_THIS, "nope", 0); out("a", llGetTexture(0));
      llSetLinkTexture(LINK_THIS, "", 1); out("b", llGetTexture(1));
      llSetLinkTexture(LINK_THIS, TEXTURE_BLANK, 2); out("c", llGetTexture(2));
    `)
    // In-world: lt_badname, lt_empty in p8.full.iw
    expect(lines).toEqual([`a=[${DEFAULT_TEX}]`, `b=[${DEFAULT_TEX}]`, `c=[${BLANK}]`])
    expect(errors).toEqual(["Could not find texture 'nope'.", "Could not find texture ''."])
  })

  it('llSetLinkPrimitiveParamsFast PRIM_TEXTURE stores NULL_KEY for an unknown name silently', async () => {
    const { lines, errors } = await probe(`
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_TEXTURE, 5, "nope5", <1,1,0>, ZERO_VECTOR, 0.0]); out("a", D(llGetPrimitiveParams([PRIM_TEXTURE, 5])));
    `)
    // In-world: slpp_badname in p8.full.iw
    expect(lines).toEqual([`a=[{${NULL}}3${TX}]`])
    expect(errors).toEqual([])
  })

  it('PRIM_TEXTURE stores NULL_KEY for an unknown name without an error and runs later rules', async () => {
    const { lines, errors } = await probe(`
      llSetPrimitiveParams([PRIM_TEXTURE, 3, "nope2", <1,1,0>, ZERO_VECTOR, 0.0, PRIM_DESC, "after tex"]);
      out("a", D(llGetPrimitiveParams([PRIM_TEXTURE, 3])) + "|" + llGetObjectDesc());
      llSetPrimitiveParams([PRIM_TEXTURE, 1, "", <2,2,0>, ZERO_VECTOR, 0.0]);
      out("b", D(llGetPrimitiveParams([PRIM_TEXTURE, 1])));
    `)
    // In-world: pp_tex_badname in p6.full.iw, tex_empty_pp in p7.full.iw
    expect(lines).toEqual([
      `a=[{${NULL}}3${TX}|after tex]`,
      `b=[{${NULL}}3{<2.000000, 2.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2]`,
    ])
    expect(errors).toEqual([])
  })

  it('PRIM_TEXTURE zeroes the z of repeats and offsets and keeps rotation as given', async () => {
    const { lines } = await probe(`
      llSetPrimitiveParams([PRIM_TEXTURE, 4, TEXTURE_BLANK, <100,-5,9>, <7,-7,3>, 50.0]);
      out("a", D(llGetPrimitiveParams([PRIM_TEXTURE, 4])));
    `)
    // In-world: tex_ranges in p6.full.iw
    expect(lines).toEqual([
      `a=[{${BLANK}}3{<100.000000, -5.000000, 0.000000>}5{<7.000000, -7.000000, 0.000000>}5{50.000000}2]`,
    ])
  })

  it('llGetTexture past the face count is NULL_KEY and -1 is face 0', async () => {
    const { lines } = await probe(`llSetTexture(TEXTURE_BLANK, 0); out("a", llGetTexture(99) + "|" + llGetTexture(-1));`)
    // In-world: gettex_bad in p6.full.iw
    expect(lines).toEqual([`a=[${NULL}|${BLANK}]`])
  })

  it('PRIM_NORMAL and PRIM_SPECULAR store NULL_KEY for an unknown name', async () => {
    const { lines, errors } = await probe(`
      llSetPrimitiveParams([PRIM_SPECULAR, 0, "nopeS", <1,1,0>, ZERO_VECTOR, 0.0, <1,1,1>, 51, 0]); out("s", G(PRIM_SPECULAR));
      llSetPrimitiveParams([PRIM_NORMAL, 0, "nopeN", <1,1,0>, ZERO_VECTOR, 0.0]); out("n", G(PRIM_NORMAL));
    `)
    // In-world: spec_badname, norm_badname in p7.full.iw
    expect(lines).toEqual([
      `s=[{${NULL}}4${TX}{<1.000000, 1.000000, 1.000000>}5{51}1{0}1]`,
      `n=[{${NULL}}4${TX}]`,
    ])
    expect(errors).toEqual([])
  })

  it('PRIM_GLTF_NORMAL stores NULL_KEY as a key for an unknown name', async () => {
    const { lines } = await probe(`
      setMat(MAT);
      llSetPrimitiveParams([PRIM_GLTF_NORMAL, 0, "nope3", "", "", ""]); out("a", G(PRIM_GLTF_NORMAL));
    `)
    // In-world: gltf_nm_badname in p6.full.iw
    expect(lines).toEqual([`a=[{${NULL}}4${TX}]`])
  })
})

describe('legacy material ranges (probes p6, p7)', () => {
  it('PRIM_SPECULAR clamps glossiness and environment to 0..255', async () => {
    const { lines } = await probe(`
      llSetPrimitiveParams([PRIM_SPECULAR, 0, TEXTURE_BLANK, <1,1,0>, ZERO_VECTOR, 0.0, <2,-1,0.5>, 300, 300]); out("a", G(PRIM_SPECULAR));
      llSetPrimitiveParams([PRIM_SPECULAR, 0, TEXTURE_BLANK, <1,1,0>, ZERO_VECTOR, 0.0, <1,1,1>, -5, -5]); out("b", G(PRIM_SPECULAR));
    `)
    // In-world: spec_ranges, spec_neg in p6.full.iw
    expect(lines).toEqual([
      `a=[{${BLANK}}4${TX}{<1.000000, 0.000000, 0.498039>}5{255}1{255}1]`,
      `b=[{${BLANK}}4${TX}{<1.000000, 1.000000, 1.000000>}5{0}1{0}1]`,
    ])
  })

  it('PRIM_ALPHA_MODE clamps the mode and cutoff and reads a cutoff only for MASK', async () => {
    const cases: Array<[string, string]> = [
      ['PRIM_ALPHA_MODE_MASK, 100', '{2}1{100}1'],
      ['PRIM_ALPHA_MODE_MASK, 300', '{2}1{255}1'],
      ['PRIM_ALPHA_MODE_MASK, -5', '{2}1{0}1'],
      ['PRIM_ALPHA_MODE_EMISSIVE, 50', '{3}1{0}1'],
      ['PRIM_ALPHA_MODE_BLEND, 77', '{1}1{0}1'],
      ['-1, 50', '{0}1{0}1'],
      ['9, 300', '{3}1{0}1'],
    ]
    const { lines } = await probe(
      cases.map(([a], i) => `llSetPrimitiveParams([PRIM_ALPHA_MODE, 0, ${a}]); out("c${i}", G(PRIM_ALPHA_MODE));`).join('\n'),
    )
    // In-world: am_* in p6.full.iw and p7.full.iw
    expect(lines).toEqual(cases.map(([, e], i) => `c${i}=[${e}]`))
  })

  it('PRIM_BUMP_SHINY ignores an out-of-range pair and applies an in-range one', async () => {
    const { lines } = await probe(`
      list pairs = [9, 99, 1, 99, 9, 2, -1, -1, 0, 17];
      integer i;
      for (i = 0; i < 10; i += 2) {
        llSetPrimitiveParams([PRIM_BUMP_SHINY, 0, PRIM_SHINY_HIGH, PRIM_BUMP_BRIGHT]);
        llSetPrimitiveParams([PRIM_BUMP_SHINY, 0, llList2Integer(pairs, i), llList2Integer(pairs, i + 1)]);
        out("b" + (string)i, G(PRIM_BUMP_SHINY));
      }
    `)
    // In-world: bs_bad_both, bs_bad_bump, bs_bad_shiny, bs_neg, bs_17 in p7.full.iw
    expect(lines).toEqual(['b0=[{3}1{1}1]', 'b2=[{3}1{1}1]', 'b4=[{3}1{1}1]', 'b6=[{3}1{1}1]', 'b8=[{0}1{17}1]'])
  })

  it('PRIM_TEXGEN and PRIM_FULLBRIGHT ignore out-of-range values and later rules still run', async () => {
    const { lines } = await probe(`
      llSetPrimitiveParams([PRIM_TEXGEN, 0, PRIM_TEXGEN_PLANAR, PRIM_TEXGEN, 0, 7]); out("t7", G(PRIM_TEXGEN));
      llSetPrimitiveParams([PRIM_TEXGEN, 0, -1]); out("t-1", G(PRIM_TEXGEN));
      llSetPrimitiveParams([PRIM_FULLBRIGHT, 0, 1]);
      llSetPrimitiveParams([PRIM_FULLBRIGHT, 0, 5, PRIM_DESC, "after"]); out("f5", G(PRIM_FULLBRIGHT) + llGetObjectDesc());
      llSetPrimitiveParams([PRIM_FULLBRIGHT, 0, -1]); out("f-1", G(PRIM_FULLBRIGHT));
      llSetPrimitiveParams([PRIM_FULLBRIGHT, 0, 0]); llSetPrimitiveParams([PRIM_FULLBRIGHT, 0, 5]); out("f0", G(PRIM_FULLBRIGHT));
    `)
    // In-world: texgen_bad, texgen_neg, fb_5_from1, fb_m1, fb_5_from0 in p7.full.iw
    expect(lines).toEqual(['t7=[{1}1]', 't-1=[{1}1]', 'f5=[{1}1after]', 'f-1=[{1}1]', 'f0=[{0}1]'])
  })
})

describe('glTF value ranges (probe p6)', () => {
  it('clamps PRIM_GLTF_* values', async () => {
    const { lines } = await probe(`
      setMat(MAT);
      llSetPrimitiveParams([PRIM_GLTF_BASE_COLOR, 0, "", "", "", "", <2,-1,0.5>, 3.0, 9, 4.0, 7]); out("bc", G(PRIM_GLTF_BASE_COLOR));
      llSetPrimitiveParams([PRIM_GLTF_METALLIC_ROUGHNESS, 0, "", "", "", "", -2.0, 5.0]); out("mr", G(PRIM_GLTF_METALLIC_ROUGHNESS));
      llSetPrimitiveParams([PRIM_GLTF_EMISSIVE, 0, "", "", "", "", <5,-1,0.5>]); out("em", G(PRIM_GLTF_EMISSIVE));
    `)
    const head = '{}3{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2'
    // In-world: gltf_bc_ranges, gltf_mr_ranges, gltf_em_ranges in p6.full.iw
    expect(lines).toEqual([
      `bc=[${head}{<1.000000, 0.000000, 0.500000>}5{1.000000}2{2}1{1.000000}2{1}1]`,
      `mr=[${head}{0.000000}2{1.000000}2]`,
      `em=[${head}{<1.000000, 0.000000, 0.500000>}5]`,
    ])
  })

  it('clamps llSetLinkGLTFOverrides values', async () => {
    const { lines } = await probe(`
      setMat(MAT);
      llSetPrimitiveParams([PRIM_GLTF_BASE_COLOR, 0, "", "", "", "", <1,1,1>, 1.0, 1, 0.5, 0, PRIM_GLTF_METALLIC_ROUGHNESS, 0, "", "", "", "", 0.0, 0.0]);
      llSetLinkGLTFOverrides(LINK_THIS, 0, [OVERRIDE_GLTF_BASE_ALPHA_MASK, 5.0, OVERRIDE_GLTF_ROUGHNESS_FACTOR, -3.0,
        OVERRIDE_GLTF_EMISSIVE_FACTOR, <4,-4,0.5>, OVERRIDE_GLTF_BASE_COLOR_FACTOR, <3,-3,0.5>, OVERRIDE_GLTF_BASE_DOUBLE_SIDED, 9]);
      out("o", G(PRIM_GLTF_BASE_COLOR) + "#" + G(PRIM_GLTF_METALLIC_ROUGHNESS) + "#" + G(PRIM_GLTF_EMISSIVE));
    `)
    const head = '{}3{<1.000000, 1.000000, 0.000000>}5{<0.000000, 0.000000, 0.000000>}5{0.000000}2'
    // In-world: glo_ranges in p6.full.iw, after the same earlier base colour and metallic-roughness writes
    expect(lines).toEqual([
      `o=[${head}{<1.000000, 0.000000, 0.500000>}5{1.000000}2{1}1{1.000000}2{1}1#${head}{0.000000}2{0.000000}2#${head}{<1.000000, 0.000000, 0.500000>}5]`,
    ])
  })
})

describe('texture names across a linkset (probe p9)', () => {
  const WOOD = '85f3d0a5-add0-16f7-ae8b-349a9bd84186'
  const wood = () => makeInventoryItem({ name: 'Wood_BaseColor', type: InventoryType.TEXTURE, key: WOOD })

  async function threePrims(body: string) {
    const { scripts } = await loadLinkset({
      prims: [
        {
          name: 'root',
          inventory: [wood()],
          scripts: [{
            source: { source: `list r; default { state_entry() { ${body} } }`, filename: 'root.lsl' },
            name: 'root',
          }],
        },
        { name: 'child' },
        { name: 'holder', inventory: [wood()] },
      ],
    })
    scripts['root']!.start()
    return scripts['root']!
  }

  it('resolves a name in the calling prim and stores the key on a child without the item', async () => {
    const script = await threePrims(`
      llSetLinkTexture(2, "Wood_BaseColor", 0);
      llSetLinkPrimitiveParamsFast(2, [PRIM_TEXTURE, 1, "Wood_BaseColor", <1,1,0>, ZERO_VECTOR, 0.0]);
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_LINK_TARGET, 2, PRIM_NORMAL, 2, "Wood_BaseColor", <1,1,0>, ZERO_VECTOR, 0.0]);
      llSetLinkTexture(LINK_SET, "nope", 3);
      llSetLinkTexture(LINK_ALL_CHILDREN, "Wood_BaseColor", 4);
      llSetLinkTexture(LINK_SET, "Wood_BaseColor", 5);
      r = [llList2String(llGetLinkPrimitiveParams(2, [PRIM_TEXTURE, 0]), 0),
           llList2String(llGetLinkPrimitiveParams(2, [PRIM_TEXTURE, 1]), 0),
           llList2String(llGetLinkPrimitiveParams(2, [PRIM_NORMAL, 2]), 0),
           llList2String(llGetLinkPrimitiveParams(2, [PRIM_TEXTURE, 4]), 0),
           llGetTexture(5)];
    `)
    // In-world: lt_child, slpp_child, lt_normal_child, lac_child, lset_root in p9.full.iw
    expect(script.global('r')).toEqual([WOOD, WOOD, WOOD, WOOD, 'Wood_BaseColor'])
    // In-world: one error for LINK_SET, not one per prim
    expect(script.chat.map((c) => c.text)).toEqual(["Could not find texture 'nope'."])
  })

  it('reads a key back as the item name in a prim that holds the item', async () => {
    const script = await threePrims(`
      llSetLinkTexture(3, "Wood_BaseColor", 0);
      r = [llList2String(llGetLinkPrimitiveParams(3, [PRIM_TEXTURE, 0]), 0)];
    `)
    expect(script.global('r')).toEqual(['Wood_BaseColor'])
  })

  it('reads an inventory texture in a child glTF texture slot as its key', async () => {
    const script = await threePrims(`
      llSetLinkPrimitiveParamsFast(2, [PRIM_RENDER_MATERIAL, 0, "${MAT}"]);
      llSetLinkPrimitiveParamsFast(2, [PRIM_GLTF_NORMAL, 0, "Wood_BaseColor", "", "", ""]);
      r = [llList2String(llGetLinkPrimitiveParams(2, [PRIM_GLTF_NORMAL, 0]), 0)];
    `)
    // In-world: gltf_inv_child in p10.full.iw
    expect(script.global('r')).toEqual([WOOD])
  })
})

describe('render material names across a linkset (probe p10)', () => {
  const ORNATE = '66a1c7ac-129a-294b-403d-5c336f9b99ac'

  async function twoPrims(body: string) {
    const { scripts } = await loadLinkset({
      prims: [
        {
          name: 'root',
          inventory: [
            makeInventoryItem({ name: 'Wood_BaseColor', type: InventoryType.TEXTURE, key: BLANK }),
            makeInventoryItem({ name: 'ornate metal', type: InventoryType.MATERIAL, key: ORNATE }),
          ],
          scripts: [{
            source: { source: `list r; default { state_entry() { ${body} } }`, filename: 'root.lsl' },
            name: 'root',
          }],
        },
        { name: 'child' },
      ],
    })
    scripts['root']!.start()
    return scripts['root']!
  }

  it('reads a material item name back only on a prim that holds the item', async () => {
    const script = await twoPrims(`
      llSetRenderMaterial("ornate metal", 1);
      llSetPrimitiveParams([PRIM_RENDER_MATERIAL, 2, "ornate metal"]);
      llSetLinkPrimitiveParamsFast(2, [PRIM_RENDER_MATERIAL, 1, "ornate metal"]);
      r = [llGetRenderMaterial(1), llList2String(llGetPrimitiveParams([PRIM_RENDER_MATERIAL, 1]), 0), llGetRenderMaterial(2),
           llList2String(llGetLinkPrimitiveParams(2, [PRIM_RENDER_MATERIAL, 1]), 0)];
    `)
    // In-world: mat_name_root, mat_name_pp, mat_name_child in p10.full.iw
    expect(script.global('r')).toEqual(['ornate metal', 'ornate metal', 'ornate metal', ORNATE])
  })

  it('still clears glTF overrides when a material is set by name', async () => {
    const script = await twoPrims(`
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_RENDER_MATERIAL, 0, "${MAT}"]);
      llSetPrimitiveParams([PRIM_GLTF_METALLIC_ROUGHNESS, 0, "", "", "", "", 0.5, 0.5]);
      llSetRenderMaterial("ornate metal", 0);
      r = llGetPrimitiveParams([PRIM_GLTF_METALLIC_ROUGHNESS, 0]);
    `)
    expect(script.global('r')).toEqual(['', { x: 1, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, 0, '', ''])
  })

  it('llSetLinkTexture reports a name that is not a texture even when the link does not exist', async () => {
    const script = await twoPrims(`llSetLinkTexture(5, "nope5", 0); llSetLinkTexture(5, "Wood_BaseColor", 0);`)
    // In-world: DBG line in p10.full.iw, after "mark after nolink" the Wood_BaseColor call reports nothing
    expect(script.chat.map((c) => c.text)).toEqual(["Could not find texture 'nope5'."])
  })
})
