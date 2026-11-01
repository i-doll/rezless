import { describe, expect, it } from 'vitest'
import { changedScene } from './helpers/changed-events.js'

// https://wiki.secondlife.com/wiki/Changed
// In-world: issue-362 expanded setter series, Aditi, SLua Tideland, 2026-11-01,
// Firestorm 7.3.0.83011, Mono. PRIM_SIZE changes notify the root only;
// llScaleByFactor notifies every prim even at factor 1. Shape changes notify
// the changed prim only. Repeated size/type and PRIM_SLICE emit nothing.
const BOX = 'PRIM_TYPE,PRIM_TYPE_BOX,PRIM_HOLE_DEFAULT,<0.1,0.9,0>,0.0,ZERO_VECTOR,<1,1,0>,ZERO_VECTOR'
const SPHERE = 'PRIM_TYPE,PRIM_TYPE_SPHERE,PRIM_HOLE_DEFAULT,<0,1,0>,0.0,ZERO_VECTOR,<0,1,0>'

describe('changed scale and shape events', () => {
  it.each([
    'llSetScale(<0.6,0.7,0.8>);',
    'llSetPrimitiveParams([PRIM_SIZE,<0.6,0.7,0.8>]);',
    'llSetLinkPrimitiveParams(2,[PRIM_SIZE,<0.7,0.8,0.9>]);',
    'llSetLinkPrimitiveParamsFast(2,[PRIM_SIZE,<0.7,0.8,0.9>]);',
  ])('reports size changes to the root: %s', async body => {
    const s = await changedScene(body)
    expect(s.root).toEqual([8])
    expect(s.driver).toEqual([8])
    expect(s.child).toEqual([])
  })

  it('does not repeat a size event for an identical scale', async () => {
    expect((await changedScene('llSetScale(<0.6,0.7,0.8>);', 'llSetScale(<0.6,0.7,0.8>);')).driver).toEqual([])
  })

  it.each([1.0, 1.1])('broadcasts llScaleByFactor(%s) to all prims', async factor => {
    const s = await changedScene(`llScaleByFactor(${factor.toFixed(1)});`)
    expect(s.root).toEqual([8])
    expect(s.child).toEqual([8])
    expect(s.driver).toEqual([8])
  })

  it.each([BOX, SPHERE, 'PRIM_TYPE,PRIM_TYPE_SCULPT,TEXTURE_BLANK,PRIM_SCULPT_TYPE_SPHERE'])('reports a changed shape: %s', async rule => {
    const s = await changedScene(`llSetPrimitiveParams([${rule}]);`)
    expect(s.root).toEqual([4])
    expect(s.driver).toEqual([4])
    expect(s.child).toEqual([])
    expect((await changedScene(`llSetPrimitiveParams([${rule}]);`, `llSetPrimitiveParams([${rule}]);`)).driver).toEqual([])
  })

  // In-world: attempting PRIM_TYPE_SCULPT with mesh type 5 left the sphere
  // unchanged and emitted no event.
  it('ignores an attempt to convert a prim to mesh', async () => {
    const s = await changedScene('llSetPrimitiveParams([PRIM_TYPE,PRIM_TYPE_SCULPT,TEXTURE_BLANK,5]);out=llGetPrimitiveParams([PRIM_TYPE]);', `llSetPrimitiveParams([${SPHERE}]);`)
    expect(s.driver).toEqual([])
    expect((s.scripts.driver!.global('out') as unknown[])[0]).toBe(3)
  })

  it('reports a child shape change only to the child', async () => {
    const s = await changedScene(`llSetLinkPrimitiveParamsFast(2,[${SPHERE}]);`)
    expect(s.root).toEqual([])
    expect(s.driver).toEqual([])
    expect(s.child).toEqual([4])
  })

  it('does not report PRIM_SLICE on either boxes or spheres', async () => {
    expect((await changedScene('llSetPrimitiveParams([PRIM_SLICE,<0.2,0.8,0>]);')).driver).toEqual([])
    expect((await changedScene('llSetPrimitiveParams([PRIM_SLICE,<0.2,0.8,0>]);', `llSetPrimitiveParams([${SPHERE}]);`)).driver).toEqual([])
  })

  // In-world: size + colour + texture + slice + material -> 4106 in the root.
  // With the child as target, root -> 8 and child -> 4098.
  it.each([1, 2])('coalesces mixed rules using each kind\'s prim scope, target %s', async link => {
    const s = await changedScene(`llSetLinkPrimitiveParamsFast(${link},[
      PRIM_SIZE,<0.8,0.9,1.0>,PRIM_COLOR,0,<0.2,0.3,0.4>,0.8,
      PRIM_TEXTURE,0,TEXTURE_BLANK,<2,2,0>,ZERO_VECTOR,0.0,
      PRIM_SLICE,<0.3,0.7,0>,PRIM_RENDER_MATERIAL,0,MATERIAL]);`)
    expect(s.root).toEqual([link === 1 ? 4106 : 8])
    expect(s.driver).toEqual([link === 1 ? 4106 : 8])
    expect(s.child).toEqual(link === 1 ? [] : [4098])
  })
})

// In-world: each texture/material-map rule below, including same-value writes,
// gave no changed event. These setters do not synthesize CHANGED_TEXTURE.
describe('script texture writes', () => {
  it.each([
    'llSetTexture(TEXTURE_BLANK,0);',
    'llSetLinkTexture(2,TEXTURE_BLANK,0);',
    'llOffsetTexture(0.2,0.3,0);',
    'llScaleTexture(2.0,3.0,0);',
    'llRotateTexture(0.5,0);',
    'llSetPrimitiveParams([PRIM_TEXTURE,0,TEXTURE_BLANK,<1,1,0>,ZERO_VECTOR,0.0]);',
    'llSetPrimitiveParams([PRIM_NORMAL,0,TEXTURE_BLANK,<1,1,0>,ZERO_VECTOR,0.0]);',
    'llSetPrimitiveParams([PRIM_SPECULAR,0,TEXTURE_BLANK,<1,1,0>,ZERO_VECTOR,0.0,<0.3,0.4,0.5>,100,30]);',
    'llSetPrimitiveParams([PRIM_BUMP_SHINY,0,PRIM_SHINY_HIGH,PRIM_BUMP_BRICKS]);',
    'llSetPrimitiveParams([PRIM_FULLBRIGHT,0,TRUE]);',
    'llSetPrimitiveParams([PRIM_GLOW,0,0.2]);',
    'llSetPrimitiveParams([PRIM_TEXGEN,0,PRIM_TEXGEN_PLANAR]);',
    'llSetPrimitiveParams([PRIM_ALPHA_MODE,0,PRIM_ALPHA_MODE_MASK,100]);',
  ])('does not emit changed for %s', async body => {
    const s = await changedScene(body)
    expect(s.driver).toEqual([])
    expect(s.root).toEqual([])
    expect(s.child).toEqual([])
  })
})
