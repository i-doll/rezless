import { describe, it, expect } from 'vitest'
import { loadLinkset, loadScript, makeInventoryItem, InventoryType, DEBUG_CHANNEL } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlGetLinkNumberOfSides
// https://wiki.secondlife.com/wiki/LlGetObjectPermMask
// https://wiki.secondlife.com/wiki/LlIsLinkGLTFMaterial
// https://wiki.secondlife.com/wiki/LlSetLinkRenderMaterial
// In-world: SLua Tideland on Aditi, Mono (2026-10-31). The linkset probe was two 0.5 m boxes made
// with object.create and linked, with the script in the root. The lone probe was one unlinked box.
// Results went to the object description, and a third prim listened on DEBUG_CHANNEL.

const MAT = 'f35823e6-40dc-d992-f4cc-85a4cb5464c0'

const HELPERS = `
string MAT = "${MAT}";
list out;
string sides(list links) {
    string o; integer i;
    for (i = 0; i < llGetListLength(links); ++i) o += (string)llGetLinkNumberOfSides(llList2Integer(links, i)) + ",";
    return o;
}
string gl(list pairs) {
    string o; integer i;
    for (i = 0; i < llGetListLength(pairs); i += 2) o += (string)llIsLinkGLTFMaterial(llList2Integer(pairs, i), llList2Integer(pairs, i + 1));
    return o;
}
string faces(integer link) { string o; integer i; for (i = 0; i < 6; ++i) o += (string)llIsLinkGLTFMaterial(link, i); return o; }
string rm(integer link, integer face) { return llList2String(llGetLinkPrimitiveParams(link, [PRIM_RENDER_MATERIAL, face]), 0); }
clr() { llSetLinkPrimitiveParamsFast(LINK_SET, [PRIM_RENDER_MATERIAL, ALL_SIDES, NULL_KEY]); }
`

async function inLinkset(body: string, inventory: ReturnType<typeof makeInventoryItem>[] = []) {
  const { scripts } = await loadLinkset({
    prims: [{ inventory, scripts: [{ name: 'probe', source: { source: `${HELPERS}\ndefault { state_entry() { ${body} } }` } }] }, {}],
  })
  const s = scripts.probe!
  s.start()
  return s
}

async function alone(body: string) {
  const s = await loadScript({ source: `${HELPERS}\ndefault { state_entry() { ${body} } }` })
  s.start()
  return s
}

const errors = (s: { chat: ReadonlyArray<{ channel: number; text: string }> }) =>
  s.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text)

describe('llGetLinkNumberOfSides', () => {
  // In-world, linkset probe S1: links [-4, -3, -2, -1, 0, 1, 2, 3, 99, -5, -100, 2147483647,
  // -2147483648] -> 6,0,0,0,0,6,6,0,0,0,0,0,0. LINK_ALL_CHILDREN and LINK_ALL_OTHERS read 0 even
  // though each names only the child here.
  it('reads LINK_THIS and link numbers, and 0 for the multi-prim flags and missing links', async () => {
    const s = await inLinkset('out = [sides([-4, -3, -2, -1, 0, 1, 2, 3, 99, -5, -100, 2147483647, -2147483648])];')
    expect(s.global('out')).toEqual(['6,0,0,0,0,6,6,0,0,0,0,0,0,'])
  })

  // In-world, lone probe S: links [0, 1, -1, -2, -3, -4, 2] -> 6,0,0,0,0,6,0. An unlinked prim is
  // link 0, so LINK_ROOT finds nothing.
  it('reads link 0 and LINK_THIS in an unlinked prim, and 0 for LINK_ROOT', async () => {
    const s = await alone('out = [sides([0, 1, -1, -2, -3, -4, 2])];')
    expect(s.global('out')).toEqual(['6,0,0,0,0,6,0,'])
  })

  // In-world, linkset probe SH: the child set to each shape, read with llGetLinkNumberOfSides(2),
  // then llGetNumberOfSides in the root -> 7,9,5,4,1,3,1,6,8,6.
  it('counts the faces of the shape the child has', async () => {
    const s = await inLinkset(`
      list r;
      llSetLinkPrimitiveParamsFast(2, [PRIM_TYPE, PRIM_TYPE_BOX, 0, <0,1,0>, 0.5, ZERO_VECTOR, <1,1,0>, ZERO_VECTOR]); r += llGetLinkNumberOfSides(2);
      llSetLinkPrimitiveParamsFast(2, [PRIM_TYPE, PRIM_TYPE_BOX, 0, <0.2,0.8,0>, 0.5, ZERO_VECTOR, <1,1,0>, ZERO_VECTOR]); r += llGetLinkNumberOfSides(2);
      llSetLinkPrimitiveParamsFast(2, [PRIM_TYPE, PRIM_TYPE_BOX, 0, <0.3,0.45,0>, 0.0, ZERO_VECTOR, <1,1,0>, ZERO_VECTOR]); r += llGetLinkNumberOfSides(2);
      llSetLinkPrimitiveParamsFast(2, [PRIM_TYPE, PRIM_TYPE_CYLINDER, 0, <0,1,0>, 0.3, ZERO_VECTOR, <1,1,0>, ZERO_VECTOR]); r += llGetLinkNumberOfSides(2);
      llSetLinkPrimitiveParamsFast(2, [PRIM_TYPE, PRIM_TYPE_SPHERE, 0, <0,1,0>, 0.0, ZERO_VECTOR, <0,1,0>]); r += llGetLinkNumberOfSides(2);
      llSetLinkPrimitiveParamsFast(2, [PRIM_TYPE, PRIM_TYPE_SPHERE, 0, <0,1,0>, 0.0, ZERO_VECTOR, <0.2,0.8,0>]); r += llGetLinkNumberOfSides(2);
      llSetLinkPrimitiveParamsFast(2, [PRIM_TYPE, PRIM_TYPE_TORUS, 0, <0,1,0>, 0.0, ZERO_VECTOR, <1,0.25,0>, ZERO_VECTOR, <0,1,0>, ZERO_VECTOR, 1.0, 0.0, 0.0]); r += llGetLinkNumberOfSides(2);
      llSetLinkPrimitiveParamsFast(2, [PRIM_TYPE, PRIM_TYPE_TUBE, 0, <0,1,0>, 0.2, ZERO_VECTOR, <1,0.25,0>, ZERO_VECTOR, <0.1,0.6,0>, ZERO_VECTOR, 1.0, 0.0, 0.0]); r += llGetLinkNumberOfSides(2);
      llSetLinkPrimitiveParamsFast(2, [PRIM_TYPE, PRIM_TYPE_PRISM, 0, <0.1,0.9,0>, 0.4, ZERO_VECTOR, <0,0,0>, ZERO_VECTOR]); r += llGetLinkNumberOfSides(2);
      out = r + [llGetNumberOfSides()];
    `)
    expect(s.global('out')).toEqual([7, 9, 5, 4, 1, 3, 1, 6, 8, 6])
  })
})

describe('llGetObjectPermMask', () => {
  // In-world, linkset probe P1: MASK_BASE..MASK_NEXT -> 2147483647, 2147483647, 0, 0, 532480, the
  // masks the wiki lists for a new object. The script inside had next-owner copy and modify but
  // not transfer, and MASK_COMBINED with each mask -> 2147483647, 2147483647, 0, 0, 524288.
  it("reads the object's masks, and ANDs in the contents' masks with MASK_COMBINED", async () => {
    const noTransfer = makeInventoryItem({
      name: 'kept',
      type: InventoryType.NOTECARD,
      permMask: { base: 2147483647, owner: 2147483647, group: 0, everyone: 0, next: 0x7fffffff & ~0x2000 },
    })
    const s = await inLinkset(`
      integer c;
      for (c = 0; c <= 4; ++c) out += [llGetObjectPermMask(c), llGetObjectPermMask(c | MASK_COMBINED)];
    `, [noTransfer])
    expect(s.global('out')).toEqual([2147483647, 2147483647, 2147483647, 2147483647, 0, 0, 0, 0, 532480, 524288])
  })
  // In-world, linkset probes P1, P and Q, then probe p3 on an object whose next owner could only
  // copy, holding a script whose next owner could only transfer. p3 read every category from -64
  // to 95 and found the same 32 results in each block of 32: categories 0-4 and 16-20 read the
  // masks, every other one reads 0. P and Q: 32-36 match 0-4, 48 and 52 match 16 and 20, -16 ->
  // MASK_COMBINED|MASK_BASE, -12 -> MASK_COMBINED|MASK_NEXT, 0x40000004 and 0x80000004 ->
  // MASK_NEXT, and -1, 5, 8, 15, 21, 31 and 47 -> 0.
  it('reads only the low five bits of the category', async () => {
    const noTransfer = makeInventoryItem({
      name: 'kept',
      type: InventoryType.NOTECARD,
      permMask: { base: 2147483647, owner: 2147483647, group: 0, everyone: 0, next: 0x7fffffff & ~0x2000 },
    })
    const s = await inLinkset(`
      list cs = [32, 33, 34, 35, 36, 48, 52, 64, 132, 260, -16, -12, 0x40000004, 0x80000004, -1, 5, 8, 15, 21, 31, 47];
      integer i;
      for (i = 0; i < llGetListLength(cs); ++i) out += llGetObjectPermMask(llList2Integer(cs, i));
    `, [noTransfer])
    const ALL = 2147483647
    expect(s.global('out')).toEqual([
      ALL, ALL, 0, 0, 532480, ALL, 524288, ALL, 532480, 532480, ALL, 524288, 532480, 532480, 0, 0, 0, 0, 0, 0, 0,
    ])
  })
})

describe('llIsLinkGLTFMaterial', () => {
  // In-world, linkset probe G0/G1: no material anywhere -> 000. After llSetLinkRenderMaterial(2, MAT,
  // 0), pairs (2,0) (2,1) (2,-1) (2,99) (2,6) (2,-2) (1,0) (LINK_SET,0) (LINK_ALL_OTHERS,0)
  // (LINK_ALL_CHILDREN,0) (LINK_THIS,0) (0,0) (3,0) -> 1000000000000.
  it('is TRUE only for a face with a material on the one prim the link names', async () => {
    const s = await inLinkset(`
      out = [gl([2,0, 1,0, 2,-1])];
      llSetLinkRenderMaterial(2, MAT, 0);
      out += gl([2,0, 2,1, 2,-1, 2,99, 2,6, 2,-2, 1,0, -1,0, -2,0, -3,0, -4,0, 0,0, 3,0]);
    `)
    expect(s.global('out')).toEqual(['000', '1000000000000'])
  })

  // In-world, linkset probe G2: the child with MAT on every face, pairs (2,-1) (2,5)
  // (LINK_ALL_CHILDREN,0) (LINK_ALL_CHILDREN,-1) (2,-2) -> 11001. Lone and linkset probe F1: MAT on
  // face 0 only, faces -1, -2, -5, -100, -2147483648 and 0 of LINK_THIS -> 000001. F2: MAT on every
  // face but 3, faces -1, -2, -7 then 0..5 -> 000111011.
  it('reads every face for any negative face', async () => {
    const s = await inLinkset(`
      llSetLinkRenderMaterial(2, MAT, ALL_SIDES);
      out = [gl([2,-1, 2,5, -3,0, -3,-1, 2,-2])];
      clr(); llSetLinkRenderMaterial(LINK_THIS, MAT, 0);
      out += gl([-4,-1, -4,-2, -4,-5, -4,-100, -4,-2147483648, -4,0]);
      clr(); llSetLinkRenderMaterial(LINK_THIS, MAT, ALL_SIDES); llSetLinkRenderMaterial(LINK_THIS, NULL_KEY, 3);
      out += gl([-4,-1, -4,-2, -4,-7]) + faces(LINK_THIS);
    `)
    expect(s.global('out')).toEqual(['11001', '000001', '000111011'])
  })

  // In-world, linkset probe G: MAT on face 0 of the root, pairs (0,0) (1,0) (LINK_SET,0)
  // (LINK_ALL_OTHERS,0) (LINK_ALL_CHILDREN,0) (LINK_THIS,0) (2,0) -> 0100010. Lone probe G, the same
  // pairs -> 1100010: unlike llGetLinkNumberOfSides, an unlinked prim answers to LINK_ROOT.
  it('reads link 0 and LINK_ROOT as an unlinked prim', async () => {
    const body = 'clr(); llSetLinkRenderMaterial(LINK_THIS, MAT, 0); out = [gl([0,0, 1,0, -1,0, -2,0, -3,0, -4,0, 2,0])];'
    expect((await inLinkset(body)).global('out')).toEqual(['0100010'])
    expect((await alone(body)).global('out')).toEqual(['1100010'])
  })

  // In-world, linkset probe G8: a face with only legacy normal and specular maps -> 0. G10: a key
  // that is not a material asset -> 1, and PRIM_RENDER_MATERIAL reads that key back.
  it('is FALSE for legacy maps and TRUE for any material key', async () => {
    const s = await inLinkset(`
      llSetLinkPrimitiveParamsFast(2, [PRIM_NORMAL, 4, TEXTURE_BLANK, <1,1,0>, ZERO_VECTOR, 0.0,
        PRIM_SPECULAR, 4, TEXTURE_BLANK, <1,1,0>, ZERO_VECTOR, 0.0, <1,1,1>, 51, 0]);
      out = [gl([2,4])];
      llSetLinkRenderMaterial(2, "00000000-0000-0000-0000-000000000123", 0);
      out += gl([2,0]) + rm(2, 0);
    `)
    expect(s.global('out')).toEqual(['0', '100000000-0000-0000-0000-000000000123'])
  })
})

describe('llSetLinkRenderMaterial', () => {
  // In-world, linkset probe T: llGetTime() after one call -> 0.222097.
  it('takes 0.2 seconds', async () => {
    const s = await inLinkset('llResetTime(); llSetLinkRenderMaterial(2, MAT, 0); out = [llGetTime()];')
    expect(s.global('out')).toEqual([expect.closeTo(0.2, 5)])
  })

  // In-world, linkset probe: root then LINK_ALL_OTHERS, LINK_ALL_CHILDREN, 99, link 5 and link 0
  // (G3, G5, G6, G6b) -> only the prims each flag names change, and a missing face or link is
  // skipped silently. Lone and linkset probes L0/L1/LS/LO/LC, MAT on face 0 through each link:
  // linkset (root reads) 000000 100000 100000 000000 000000, lone 100000 000000 100000 000000 000000.
  it('sets the face on each prim the link names', async () => {
    const s = await inLinkset(`
      llSetLinkRenderMaterial(LINK_THIS, MAT, 1);
      out = [gl([-4,1, 1,1, 0,1, 1,0, -4,-1])];
      llSetLinkRenderMaterial(LINK_ALL_OTHERS, MAT, 2);
      out += gl([1,2, 2,2, 2,1]);
      llSetLinkRenderMaterial(LINK_ALL_CHILDREN, MAT, 3);
      out += gl([2,3, 1,3]);
      llSetLinkRenderMaterial(2, MAT, 99);
      llSetLinkRenderMaterial(5, MAT, 0);
      llSetLinkRenderMaterial(0, MAT, 4);
      out += gl([2,4, 1,4]);
    `)
    expect(s.global('out')).toEqual(['11000', '010', '10', '00'])
    expect(errors(s)).toEqual([])
    const links = `
      clr(); llSetLinkRenderMaterial(0, MAT, 0); out = [faces(LINK_THIS)];
      clr(); llSetLinkRenderMaterial(1, MAT, 0); out += faces(LINK_THIS);
      clr(); llSetLinkRenderMaterial(LINK_SET, MAT, 0); out += faces(LINK_THIS);
      clr(); llSetLinkRenderMaterial(LINK_ALL_OTHERS, MAT, 0); out += faces(LINK_THIS);
      clr(); llSetLinkRenderMaterial(LINK_ALL_CHILDREN, MAT, 0); out += faces(LINK_THIS);
    `
    expect((await inLinkset(links)).global('out')).toEqual(['000000', '100000', '100000', '000000', '000000'])
    expect((await alone(links)).global('out')).toEqual(['100000', '000000', '100000', '000000', '000000'])
  })

  // In-world, probes F3/F4/F5: MAT on face -2 or -100 -> every face; on face 6 of a box -> none.
  it('sets every face for any negative face and skips a face past the last', async () => {
    const s = await alone(`
      clr(); llSetLinkRenderMaterial(LINK_THIS, MAT, -2); out = [faces(LINK_THIS)];
      clr(); llSetLinkRenderMaterial(LINK_THIS, MAT, -100); out += faces(LINK_THIS);
      clr(); llSetLinkRenderMaterial(LINK_THIS, MAT, 6); out += faces(LINK_THIS);
    `)
    expect(s.global('out')).toEqual(['111111', '111111', '000000'])
  })

  // In-world, linkset probe G12: a base colour override set on a face with a material reads ""
  // after llSetLinkRenderMaterial sets the material again. G7: NULL_KEY on ALL_SIDES clears the
  // child -> 000.
  it('clears the glTF overrides with a new material and the material with NULL_KEY', async () => {
    const s = await inLinkset(`
      llSetLinkRenderMaterial(2, MAT, ALL_SIDES);
      out = [gl([2,-1, 2,2, 2,3])];
      llSetLinkPrimitiveParamsFast(2, [PRIM_GLTF_BASE_COLOR, 1, "", "", "", "", <1,0,0>, "", "", "", ""]);
      out += llList2String(llGetLinkPrimitiveParams(2, [PRIM_GLTF_BASE_COLOR, 1]), 4);
      llSetLinkRenderMaterial(2, MAT, 1);
      out += llList2String(llGetLinkPrimitiveParams(2, [PRIM_GLTF_BASE_COLOR, 1]), 4);
      llSetLinkRenderMaterial(2, NULL_KEY, ALL_SIDES);
      out += gl([2,-1, 2,2, 2,3]);
    `)
    expect(s.global('out')).toEqual(['111', '<1.000000, 0.000000, 0.000000>', '', '000'])
  })

  // In-world, linkset probe G4, G9, E1, E3, E4 with the DEBUG_CHANNEL listener: "" on LINK_SET and
  // ALL_SIDES, "" on face 0, "nope" on face 0, "nope2" on missing link 5, "nope3" on LINK_SET face 0
  // and "nope4" on face 99 each left every face as it was, and each said
  // "Could not find render material '<name>'.".
  it('reports "" and an unknown name and leaves the faces alone', async () => {
    const s = await inLinkset(`
      llSetLinkRenderMaterial(LINK_THIS, MAT, 1);
      llSetLinkRenderMaterial(2, MAT, ALL_SIDES);
      llSetLinkRenderMaterial(LINK_SET, "", ALL_SIDES);
      out = [gl([1,1, 2,0, 2,-1, 1,-1])];
      llSetLinkRenderMaterial(2, "", 0);
      llSetLinkRenderMaterial(2, "nope", 0);
      llSetLinkRenderMaterial(5, "nope2", 0);
      llSetLinkRenderMaterial(LINK_SET, "nope3", 0);
      llSetLinkRenderMaterial(2, "nope4", 99);
      out += gl([2,-1, 1,0]) + rm(2, 0);
    `)
    expect(s.global('out')).toEqual(['1110', `10${MAT}`])
    expect(errors(s)).toEqual([
      "Could not find render material ''.",
      "Could not find render material ''.",
      "Could not find render material 'nope'.",
      "Could not find render material 'nope2'.",
      "Could not find render material 'nope3'.",
      "Could not find render material 'nope4'.",
    ])
  })

  // In-world, probe p3: "ornate metal" in the root's inventory, set on face 1 of the child and of
  // the root -> the child reads the material's key and the root reads "ornate metal".
  it('finds a material item in the inventory of the prim the script is in', async () => {
    const ornate = makeInventoryItem({ name: 'ornate metal', type: InventoryType.MATERIAL, key: MAT })
    const s = await inLinkset(`
      llSetLinkRenderMaterial(2, "ornate metal", 1);
      llSetLinkRenderMaterial(LINK_THIS, "ornate metal", 1);
      out = [rm(2, 1), rm(1, 1)];
    `, [ornate])
    expect(s.global('out')).toEqual([MAT, 'ornate metal'])
  })
})

describe('llSetRenderMaterial', () => {
  // In-world, probe p3 with the DEBUG_CHANNEL listener: MAT on every face, then "" on face 0, "nope6"
  // on face 1 and "" on face 99 -> faces 0 and 1 kept MAT, and each call said
  // "Could not find render material '<name>'.". NULL_KEY on face 0 then cleared it, silently.
  it('reports "" and an unknown name and leaves the face alone', async () => {
    const s = await alone(`
      llSetRenderMaterial(MAT, ALL_SIDES);
      llSetRenderMaterial("", 0);
      llSetRenderMaterial("nope6", 1);
      llSetRenderMaterial("", 99);
      out = [rm(LINK_THIS, 0), rm(LINK_THIS, 1)];
      llSetRenderMaterial(NULL_KEY, 0);
      out += rm(LINK_THIS, 0);
    `)
    expect(s.global('out')).toEqual([MAT, MAT, '00000000-0000-0000-0000-000000000000'])
    expect(errors(s)).toEqual([
      "Could not find render material ''.",
      "Could not find render material 'nope6'.",
      "Could not find render material ''.",
    ])
  })

  // In-world, lone probe R1 and R5: MAT on face -2 -> every face; on face 6 of a box -> none.
  it('sets every face for any negative face and skips a face past the last', async () => {
    const s = await alone(`
      clr(); llSetRenderMaterial(MAT, -2); out = [faces(LINK_THIS)];
      clr(); llSetRenderMaterial(MAT, 6); out += faces(LINK_THIS);
    `)
    expect(s.global('out')).toEqual(['111111', '000000'])
  })
})
