import { describe, it, expect } from 'vitest'
import { loadScript, makeInventoryItem, InventoryType, DEBUG_CHANNEL } from '../src/index.js'

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

  it('takes the key of a material item named in the prim inventory', async () => {
    const s = await loadScript({
      source: `string m; default { state_entry() { llSetRenderMaterial("brick", 0); m = llGetRenderMaterial(0); } }`,
    })
    s.host.addInventory(makeInventoryItem({ name: 'brick', type: InventoryType.MATERIAL, key: MAT }))
    s.start()
    expect(s.global('m')).toBe(MAT)
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
})
