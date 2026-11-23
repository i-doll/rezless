import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

const said = (s: { chat: ReadonlyArray<{ channel: number; text: string }> }) =>
  s.chat.filter((c) => c.channel === 0).map((c) => c.text)

async function run(source: string) {
  const s = await loadScript({ source })
  s.start()
  return s
}

// Shapes by number: 0 box, 1 hollow box, 2 box cut 0.25 to 0.75, 3 box twisted 0 to 0.5,
// 4 cylinder, 5 hollow cylinder, 6 cut cylinder, 7 cut hollow cylinder, 8 prism, 9 hollow prism,
// 10 cut prism, 11 sphere, 12 sphere with a path cut, 13 hollow sphere, 14 sphere dimpled 0.2 to
// 0.8, 15 cut hollow dimpled sphere, 16 torus, 17 torus with a path cut, 18 hollow torus, 19 torus
// with a profile cut, 20 tube, 21 hollow tube, 22 tube with a path cut, 23 ring, 24 ring with a
// path cut, 25 twisted torus, 26 twisted cylinder, 27 tube with both cuts and a hollow, 28 tube
// with a profile cut, 29 hollow ring. Cuts are 0.25 to 0.75, hollows 0.5, twists 0 to 0.5.
const SHAPES = `
  list shape(integer k) {
    vector Z = ZERO_VECTOR;
    vector F = <0,1,0>;
    vector C = <0.25,0.75,0>;
    if (k == 0) return [PRIM_TYPE_BOX, 0, F, 0.0, Z, <1,1,0>, Z];
    if (k == 1) return [PRIM_TYPE_BOX, 0, F, 0.5, Z, <1,1,0>, Z];
    if (k == 2) return [PRIM_TYPE_BOX, 0, C, 0.0, Z, <1,1,0>, Z];
    if (k == 3) return [PRIM_TYPE_BOX, 0, F, 0.0, <0,0.5,0>, <1,1,0>, Z];
    if (k == 4) return [PRIM_TYPE_CYLINDER, 0, F, 0.0, Z, <1,1,0>, Z];
    if (k == 5) return [PRIM_TYPE_CYLINDER, 0, F, 0.5, Z, <1,1,0>, Z];
    if (k == 6) return [PRIM_TYPE_CYLINDER, 0, C, 0.0, Z, <1,1,0>, Z];
    if (k == 7) return [PRIM_TYPE_CYLINDER, 0, C, 0.5, Z, <1,1,0>, Z];
    if (k == 8) return [PRIM_TYPE_PRISM, 0, F, 0.0, Z, <1,1,0>, Z];
    if (k == 9) return [PRIM_TYPE_PRISM, 0, F, 0.5, Z, <1,1,0>, Z];
    if (k == 10) return [PRIM_TYPE_PRISM, 0, C, 0.0, Z, <1,1,0>, Z];
    if (k == 11) return [PRIM_TYPE_SPHERE, 0, F, 0.0, Z, F];
    if (k == 12) return [PRIM_TYPE_SPHERE, 0, C, 0.0, Z, F];
    if (k == 13) return [PRIM_TYPE_SPHERE, 0, F, 0.5, Z, F];
    if (k == 14) return [PRIM_TYPE_SPHERE, 0, F, 0.0, Z, <0.2,0.8,0>];
    if (k == 15) return [PRIM_TYPE_SPHERE, 0, C, 0.5, Z, <0.2,0.8,0>];
    if (k == 16) return [PRIM_TYPE_TORUS, 0, F, 0.0, Z, <1,0.25,0>, Z, F, Z, 1.0, 0.0, 0.0];
    if (k == 17) return [PRIM_TYPE_TORUS, 0, C, 0.0, Z, <1,0.25,0>, Z, F, Z, 1.0, 0.0, 0.0];
    if (k == 18) return [PRIM_TYPE_TORUS, 0, F, 0.5, Z, <1,0.25,0>, Z, F, Z, 1.0, 0.0, 0.0];
    if (k == 19) return [PRIM_TYPE_TORUS, 0, F, 0.0, Z, <1,0.25,0>, Z, C, Z, 1.0, 0.0, 0.0];
    if (k == 20) return [PRIM_TYPE_TUBE, 0, F, 0.0, Z, <1,0.25,0>, Z, F, Z, 1.0, 0.0, 0.0];
    if (k == 21) return [PRIM_TYPE_TUBE, 0, F, 0.5, Z, <1,0.25,0>, Z, F, Z, 1.0, 0.0, 0.0];
    if (k == 22) return [PRIM_TYPE_TUBE, 0, C, 0.0, Z, <1,0.25,0>, Z, F, Z, 1.0, 0.0, 0.0];
    if (k == 23) return [PRIM_TYPE_RING, 0, F, 0.0, Z, <1,0.25,0>, Z, F, Z, 1.0, 0.0, 0.0];
    if (k == 24) return [PRIM_TYPE_RING, 0, C, 0.0, Z, <1,0.25,0>, Z, F, Z, 1.0, 0.0, 0.0];
    if (k == 25) return [PRIM_TYPE_TORUS, 0, F, 0.0, <0,0.5,0>, <1,0.25,0>, Z, F, Z, 1.0, 0.0, 0.0];
    if (k == 26) return [PRIM_TYPE_CYLINDER, 0, F, 0.0, <0,0.5,0>, <1,1,0>, Z];
    if (k == 27) return [PRIM_TYPE_TUBE, 0, C, 0.5, Z, <1,0.25,0>, Z, C, Z, 1.0, 0.0, 0.0];
    if (k == 28) return [PRIM_TYPE_TUBE, 0, F, 0.0, Z, <1,0.25,0>, Z, C, Z, 1.0, 0.0, 0.0];
    return [PRIM_TYPE_RING, 0, F, 0.5, Z, <1,0.25,0>, Z, F, Z, 1.0, 0.0, 0.0];
  }
`

describe('the faces of each prim shape', () => {
  it('counts the faces of every shape', async () => {
    const s = await run(SHAPES + `
      default {
        state_entry() {
          integer k;
          list n;
          for (k = 0; k <= 29; ++k) {
            llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_TYPE] + shape(k));
            n += llGetNumberOfSides();
          }
          llSay(0, llList2CSV(n));
        }
      }`)
    // In-world: the face-order probe set each shape on a 1 m box and touched every face at its
    // middle, reading llDetectedTouchFace, llDetectedTouchPos and llDetectedTouchNormal (Aditi,
    // SLua Tideland, 2026-11-23). Every shape numbers its faces top, outer sides, hollow, bottom,
    // then the two cut faces, the order the faces keep when a shape changes:
    // - A box, cylinder or prism has its top first and bottom after the sides and the hollow; a
    //   twisted box keeps that order. The sides follow the profile: a box's run -y, +x, +y, -x.
    // - A sphere, torus, tube or ring has no top or bottom until a path cut or a twist gives it
    //   ends. Then face 0 and the face after the sides and hollow are the two path ends.
    // - A sphere's dimple faces and a torus's profile-cut faces come last, as a box's cut faces do.
    // - A hollow sphere has two more faces after its hollow that a touch reads with a zero normal.
    // That is the role order faceRoles builds, which the shape-change tests pin through the faces
    // each role keeps.
    expect(said(s)).toEqual(['6, 7, 6, 6, 3, 4, 5, 6, 5, 6, 7, 1, 3, 4, 3, 6, 1, 3, 2, 3, 4, 5, 6, 3, 5, 3, 3, 7, 4, 4'])
  })
})

describe('texture reads for a face that is not on the prim', () => {
  const PAINT = `
    string T = "5748decc-f629-461c-9a36-a35a221fe21f";
    string T2 = "8dcd4a48-2d37-4909-9f78-f7a9eb4ef903";
    paint() {
      llSetPrimitiveParams([PRIM_TEXTURE, ALL_SIDES, T, <2,2,0>, <0.2,0,0>, 0.2,
        PRIM_TEXTURE, 0, T2, <5,4,0>, <0.4,0.3,0>, 0.7]);
    }
  `

  it('reads face 0 for a negative face', async () => {
    const s = await run(PAINT + `
      default {
        state_entry() {
          paint();
          llSay(0, llList2CSV([llGetTexture(-3), llGetTextureOffset(-3), llGetTextureScale(-3), llGetTextureRot(-3)]));
          llSay(0, llList2CSV([llGetTexture(ALL_SIDES), llGetTextureOffset(ALL_SIDES), llGetTextureScale(ALL_SIDES), llGetTextureRot(ALL_SIDES)]));
        }
      }`)
    // In-world: with face 0 textured differently from the rest, llGetTexture, llGetTextureOffset,
    // llGetTextureScale and llGetTextureRot at face -3 and at ALL_SIDES all read face 0
    // (Aditi, SLua Tideland, 2026-11-23).
    const face0 = '8dcd4a48-2d37-4909-9f78-f7a9eb4ef903, <0.400000, 0.300000, 0.000000>, <5.000000, 4.000000, 0.000000>, 0.700000'
    expect(said(s)).toEqual([face0, face0])
  })

  it('reads a null key and zeros past the last face', async () => {
    const s = await run(PAINT + `
      default {
        state_entry() {
          paint();
          llSay(0, llList2CSV([llGetTexture(9), llGetTextureOffset(9), llGetTextureScale(9), llGetTextureRot(9)]));
        }
      }`)
    // In-world: the same reads at face 9 of a box (Aditi, SLua Tideland, 2026-11-23).
    expect(said(s)).toEqual(['00000000-0000-0000-0000-000000000000, <0.000000, 0.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, 0.000000'])
  })

  it('sets every face for a negative face in each face setter', async () => {
    const s = await run(PAINT + `
      rep(string what, integer rule) {
        llSay(0, what + " " + llList2CSV(llGetPrimitiveParams([rule, 0]) + ["/"] + llGetPrimitiveParams([rule, 3]) + ["/"] + llGetPrimitiveParams([rule, 5])));
      }
      default {
        state_entry() {
          llSetPrimitiveParams([PRIM_TEXTURE, ALL_SIDES, T2, <1,1,0>, ZERO_VECTOR, 0.0]);
          llSetTexture(T, -3); rep("A", PRIM_TEXTURE);
          llSetPrimitiveParams([PRIM_TEXTURE, -5, T2, <2,2,0>, <0.1,0.1,0>, 1.0]); rep("B", PRIM_TEXTURE);
          llScaleTexture(3, 3, -4); llOffsetTexture(0.2, 0.2, -4); llRotateTexture(0.5, -4); rep("C", PRIM_TEXTURE);
          llSetLinkTexture(LINK_THIS, T, -9); rep("D", PRIM_TEXTURE);
          llSetPrimitiveParams([PRIM_GLOW, -2, 0.3]); rep("E", PRIM_GLOW);
          llSetPrimitiveParams([PRIM_FULLBRIGHT, -4, TRUE]); rep("F", PRIM_FULLBRIGHT);
          llSetPrimitiveParams([PRIM_BUMP_SHINY, -6, PRIM_SHINY_HIGH, PRIM_BUMP_BRIGHT]); rep("G", PRIM_BUMP_SHINY);
          llSetPrimitiveParams([PRIM_TEXGEN, -7, PRIM_TEXGEN_PLANAR]); rep("H", PRIM_TEXGEN);
          llSetPrimitiveParams([PRIM_ALPHA_MODE, -2, PRIM_ALPHA_MODE_MASK, 100]); rep("I", PRIM_ALPHA_MODE);
          llSetPrimitiveParams([PRIM_NORMAL, -3, T, <1,1,0>, ZERO_VECTOR, 0.0]); rep("J", PRIM_NORMAL);
          llSetPrimitiveParams([PRIM_SPECULAR, -3, T, <1,1,0>, ZERO_VECTOR, 0.0, <1,0,0>, 50, 5]); rep("K", PRIM_SPECULAR);
          llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_GLOW, -3, 0.6]); rep("L", PRIM_GLOW);
          llSetLinkAlpha(LINK_THIS, 0.4, -5); rep("M", PRIM_COLOR);
        }
      }`)
    // In-world: each setter given a negative face changed faces 0, 3 and 5 of a box alike
    // (Aditi, SLua Tideland, 2026-11-23).
    const all = (v: string) => `${v}, /, ${v}, /, ${v}`
    const tex = (k: string, r: string, o: string, a: string) => all(`${k}, <${r}, ${r}, 0.000000>, <${o}, ${o}, 0.000000>, ${a}`)
    const T = '5748decc-f629-461c-9a36-a35a221fe21f'
    const T2 = '8dcd4a48-2d37-4909-9f78-f7a9eb4ef903'
    expect(said(s)).toEqual([
      `A ${tex(T, '1.000000', '0.000000', '0.000000')}`,
      `B ${tex(T2, '2.000000', '0.100000', '1.000000')}`,
      `C ${tex(T2, '3.000000', '0.200000', '0.500000')}`,
      `D ${tex(T, '3.000000', '0.200000', '0.500000')}`,
      `E ${all('0.300000')}`,
      `F ${all('1')}`,
      `G ${all('3, 1')}`,
      `H ${all('1')}`,
      `I ${all('2, 100')}`,
      `J ${all(`${T}, <1.000000, 1.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, 0.000000`)}`,
      `K ${all(`${T}, <1.000000, 1.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, 0.000000, <1.000000, 0.000000, 0.000000>, 50, 5`)}`,
      `L ${all('0.600000')}`,
      `M ${all('<1.000000, 1.000000, 1.000000>, 0.400000')}`,
    ])
  })
})
