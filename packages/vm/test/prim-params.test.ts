import { describe, it, expect } from 'vitest'
import { Prim } from '../src/prim.js'
import { Linkset } from '../src/linkset.js'
import {
  readPrimParam,
  writePrimParam,
  defaultPrimParams,
} from '../src/prim-params.js'
import {
  ALL_SIDES,
  CLICK_ACTION_BUY,
  PRIM_ALPHA_MODE,
  PRIM_ALPHA_MODE_BLEND,
  PRIM_BUMP_BRICKS,
  PRIM_BUMP_SHINY,
  PRIM_CLICK_ACTION,
  PRIM_COLOR,
  PRIM_DAMAGE,
  PRIM_DESC,
  PRIM_FLEXIBLE,
  PRIM_FULLBRIGHT,
  PRIM_GLOW,
  PRIM_GLTF_BASE_COLOR,
  PRIM_GLTF_EMISSIVE,
  PRIM_GLTF_METALLIC_ROUGHNESS,
  PRIM_GLTF_NORMAL,
  PRIM_HEALTH,
  PRIM_HOLE_DEFAULT,
  PRIM_NAME,
  PRIM_NORMAL,
  PRIM_OMEGA,
  PRIM_PHANTOM,
  PRIM_PHYSICS,
  PRIM_PHYSICS_SHAPE_NONE,
  PRIM_PHYSICS_SHAPE_TYPE,
  PRIM_POINT_LIGHT,
  PRIM_POSITION,
  PRIM_POS_LOCAL,
  PRIM_PROJECTOR,
  PRIM_REFLECTION_PROBE,
  PRIM_RENDER_MATERIAL,
  PRIM_ROTATION,
  PRIM_ROT_LOCAL,
  PRIM_SHINY_HIGH,
  PRIM_SIT_TARGET,
  PRIM_SIT_FLAGS,
  PRIM_SIZE,
  PRIM_SLICE,
  PRIM_SPECULAR,
  PRIM_TEMP_ON_REZ,
  PRIM_TEXGEN,
  PRIM_TEXGEN_PLANAR,
  PRIM_TEXT,
  PRIM_TEXTURE,
  PRIM_TYPE,
  PRIM_TYPE_BOX,
  PRIM_TYPE_RING,
  PRIM_TYPE_SCULPT,
  PRIM_TYPE_SPHERE,
  STATUS_PHYSICS,
  TEXTURE_BLANK,
  TEXTURE_DEFAULT,
} from '../src/generated/constants.js'

function freshPrim(): Prim {
  const ls = new Linkset()
  const p = new Prim()
  ls.addPrim(p)
  return p
}

const v = (x: number, y: number, z: number) => ({ x, y, z })
const r = (x: number, y: number, z: number, s: number) => ({ x, y, z, s })

describe('prim-params helpers', () => {
  it('default PrimParams has documented defaults', () => {
    const p = defaultPrimParams()
    expect(p.size).toEqual({ x: 0.5, y: 0.5, z: 0.5 })
    expect(p.position).toEqual({ x: 0, y: 0, z: 0 })
    expect(p.rotation).toEqual({ x: 0, y: 0, z: 0, s: 1 })
    expect(p.faces).toHaveLength(6)
    for (const f of p.faces) {
      expect(f.color).toEqual({ x: 1, y: 1, z: 1 })
      expect(f.alpha).toBe(1)
      expect(f.texture).toBe(TEXTURE_DEFAULT)
    }
    expect(p.shape.kind).toBe(PRIM_TYPE_BOX)
    expect(p.allowUnsit).toBe(true)
  })

  describe('round-trip — object-level params', () => {
    const cases: Array<[string, number, unknown[], unknown[]]> = [
      ['NAME', PRIM_NAME, ['hello'], ['hello']],
      ['DESC', PRIM_DESC, ['my desc'], ['my desc']],
      ['POSITION', PRIM_POSITION, [v(1, 2, 3)], [v(1, 2, 3)]],
      ['POS_LOCAL', PRIM_POS_LOCAL, [v(4, 5, 6)], [v(4, 5, 6)]],
      ['ROTATION', PRIM_ROTATION, [r(0, 0, 0.7, 0.7)], [r(0, 0, 0.7, 0.7)]],
      ['ROT_LOCAL', PRIM_ROT_LOCAL, [r(0, 0, 0.5, 0.5)], [r(0, 0, 0.5, 0.5)]],
      ['SIZE', PRIM_SIZE, [v(2, 3, 4)], [v(2, 3, 4)]],
      ['SLICE', PRIM_SLICE, [v(0.1, 0.9, 0)], [v(0.1, 0.9, 0)]],
      ['PHYSICS_SHAPE_TYPE', PRIM_PHYSICS_SHAPE_TYPE, [PRIM_PHYSICS_SHAPE_NONE], [PRIM_PHYSICS_SHAPE_NONE]],
      ['TEMP_ON_REZ', PRIM_TEMP_ON_REZ, [1], [1]],
      ['CLICK_ACTION', PRIM_CLICK_ACTION, [CLICK_ACTION_BUY], [CLICK_ACTION_BUY]],
      ['HEALTH', PRIM_HEALTH, [0.5], [0.5]],
      ['DAMAGE', PRIM_DAMAGE, [10, 1], [10, 1]],
      ['OMEGA', PRIM_OMEGA, [v(0, 0, 1), 1.5, 0.8], [v(0, 0, 1), 1.5, 0.8]],
      ['POINT_LIGHT', PRIM_POINT_LIGHT, [1, v(1, 0, 0), 0.8, 12, 0.5], [1, v(1, 0, 0), 0.8, 12, 0.5]],
      ['FLEXIBLE', PRIM_FLEXIBLE, [1, 2, 0.3, 0.4, 0.5, 0.6, v(0, 0, -1)], [1, 2, 0.3, 0.4, 0.5, 0.6, v(0, 0, -1)]],
      ['SIT_TARGET', PRIM_SIT_TARGET, [1, v(0, 0, 1), r(0, 0, 0, 1)], [1, v(0, 0, 1), r(0, 0, 0, 1)]],
      ['SIT_FLAGS', PRIM_SIT_FLAGS, [3], [3]],
      ['REFLECTION_PROBE', PRIM_REFLECTION_PROBE, [1, 0.5, 8, 4], [1, 0.5, 8, 4]],
      ['PROJECTOR', PRIM_PROJECTOR, ['tex-key', 1.2, 0.7, 0.3], ['tex-key', 1.2, 0.7, 0.3]],
      ['TEXT', PRIM_TEXT, ['hi', v(1, 0, 0), 0.5], ['hi', v(1, 0, 0), 0.5]],
    ]
    for (const [name, rule, write, expectRead] of cases) {
      it(name, () => {
        const p = freshPrim()
        expect(writePrimParam(p, rule, write as never, 0)).not.toBeNull()
        expect(readPrimParam(p, rule, [], 0)?.values).toEqual(expectRead)
      })
    }
  })

  describe('round-trip — physics/phantom via STATUS bitfield', () => {
    it('PRIM_PHYSICS toggles STATUS_PHYSICS', () => {
      const p = freshPrim()
      writePrimParam(p, PRIM_PHYSICS, [1], 0)
      expect(p.statusFlags & STATUS_PHYSICS).toBe(STATUS_PHYSICS)
      expect(readPrimParam(p, PRIM_PHYSICS, [], 0)?.values).toEqual([1])
      writePrimParam(p, PRIM_PHYSICS, [0], 0)
      expect(readPrimParam(p, PRIM_PHYSICS, [], 0)?.values).toEqual([0])
    })
    it('PRIM_PHANTOM independent of PRIM_PHYSICS', () => {
      const p = freshPrim()
      writePrimParam(p, PRIM_PHYSICS, [1], 0)
      writePrimParam(p, PRIM_PHANTOM, [1], 0)
      expect(readPrimParam(p, PRIM_PHANTOM, [], 0)?.values).toEqual([1])
      expect(readPrimParam(p, PRIM_PHYSICS, [], 0)?.values).toEqual([1])
    })
  })

  describe('round-trip — per-face params', () => {
    it('PRIM_COLOR on face 0', () => {
      const p = freshPrim()
      writePrimParam(p, PRIM_COLOR, [0, v(1, 0, 0), 0.5], 0)
      expect(readPrimParam(p, PRIM_COLOR, [0], 0)?.values).toEqual([v(1, 0, 0), 0.5])
      // other faces untouched
      expect(readPrimParam(p, PRIM_COLOR, [1], 0)?.values).toEqual([v(1, 1, 1), 1])
    })
    it('PRIM_COLOR ALL_SIDES applies to every face', () => {
      const p = freshPrim()
      writePrimParam(p, PRIM_COLOR, [ALL_SIDES, v(0, 1, 0), 0.25], 0)
      const read = readPrimParam(p, PRIM_COLOR, [ALL_SIDES], 0)!.values
      expect(read).toHaveLength(12) // 6 faces × (color, alpha)
      for (let f = 0; f < 6; f++) {
        expect(read[f * 2]).toEqual(v(0, 1, 0))
        expect(read[f * 2 + 1]).toBe(0.25)
      }
    })
    it('PRIM_TEXTURE round-trip', () => {
      const p = freshPrim()
      writePrimParam(p, PRIM_TEXTURE, [3, TEXTURE_BLANK, v(2, 2, 0), v(0.1, 0.2, 0), 0.7], 0)
      expect(readPrimParam(p, PRIM_TEXTURE, [3], 0)?.values).toEqual([
        TEXTURE_BLANK, v(2, 2, 0), v(0.1, 0.2, 0), 0.7,
      ])
    })
    it('PRIM_FULLBRIGHT, PRIM_GLOW, PRIM_BUMP_SHINY, PRIM_TEXGEN, PRIM_RENDER_MATERIAL', () => {
      const p = freshPrim()
      writePrimParam(p, PRIM_FULLBRIGHT, [ALL_SIDES, 1], 0)
      writePrimParam(p, PRIM_GLOW, [2, 0.4], 0)
      writePrimParam(p, PRIM_BUMP_SHINY, [0, PRIM_SHINY_HIGH, PRIM_BUMP_BRICKS], 0)
      writePrimParam(p, PRIM_TEXGEN, [1, PRIM_TEXGEN_PLANAR], 0)
      writePrimParam(p, PRIM_RENDER_MATERIAL, [4, 'mat-key'], 0)
      expect(readPrimParam(p, PRIM_FULLBRIGHT, [0], 0)?.values).toEqual([1])
      expect(readPrimParam(p, PRIM_GLOW, [2], 0)?.values).toEqual([0.4])
      expect(readPrimParam(p, PRIM_BUMP_SHINY, [0], 0)?.values).toEqual([PRIM_SHINY_HIGH, PRIM_BUMP_BRICKS])
      expect(readPrimParam(p, PRIM_TEXGEN, [1], 0)?.values).toEqual([PRIM_TEXGEN_PLANAR])
      expect(readPrimParam(p, PRIM_RENDER_MATERIAL, [4], 0)?.values).toEqual(['mat-key'])
    })
    it('PRIM_NORMAL, PRIM_SPECULAR, PRIM_ALPHA_MODE round-trip', () => {
      const p = freshPrim()
      writePrimParam(p, PRIM_NORMAL, [0, 'n-tex', v(1, 1, 0), v(0, 0, 0), 0], 0)
      writePrimParam(p, PRIM_SPECULAR, [0, 's-tex', v(1, 1, 0), v(0, 0, 0), 0, v(1, 1, 1), 51, 0], 0)
      writePrimParam(p, PRIM_ALPHA_MODE, [0, PRIM_ALPHA_MODE_BLEND, 0], 0)
      expect(readPrimParam(p, PRIM_NORMAL, [0], 0)?.values).toEqual(['n-tex', v(1, 1, 0), v(0, 0, 0), 0])
      expect(readPrimParam(p, PRIM_SPECULAR, [0], 0)?.values).toEqual(['s-tex', v(1, 1, 0), v(0, 0, 0), 0, v(1, 1, 1), 51, 0])
      expect(readPrimParam(p, PRIM_ALPHA_MODE, [0], 0)?.values).toEqual([PRIM_ALPHA_MODE_BLEND, 0])
    })
    it('PRIM_GLTF_* round-trips', () => {
      const p = freshPrim()
      writePrimParam(p, PRIM_GLTF_BASE_COLOR, [
        0, 'bc', v(1, 1, 0), v(0, 0, 0), 0, v(1, 0, 0), 0.7, 0, 0.5, 1,
      ], 0)
      writePrimParam(p, PRIM_GLTF_NORMAL, [0, 'n', v(1, 1, 0), v(0, 0, 0), 0], 0)
      writePrimParam(p, PRIM_GLTF_METALLIC_ROUGHNESS, [0, 'mr', v(1, 1, 0), v(0, 0, 0), 0, 0.4, 0.6], 0)
      writePrimParam(p, PRIM_GLTF_EMISSIVE, [0, 'e', v(1, 1, 0), v(0, 0, 0), 0, v(0.1, 0.2, 0.3)], 0)
      expect(readPrimParam(p, PRIM_GLTF_BASE_COLOR, [0], 0)?.values).toEqual([
        'bc', v(1, 1, 0), v(0, 0, 0), 0, v(1, 0, 0), 0.7, 0, 0.5, 1,
      ])
      expect(readPrimParam(p, PRIM_GLTF_METALLIC_ROUGHNESS, [0], 0)?.values).toEqual([
        'mr', v(1, 1, 0), v(0, 0, 0), 0, 0.4, 0.6,
      ])
    })
  })

  describe('PRIM_TYPE round-trips for every sub-shape', () => {
    it('BOX/CYLINDER/PRISM (kind 0/1/2)', () => {
      for (const kind of [0, 1, 2]) {
        const p = freshPrim()
        writePrimParam(p, PRIM_TYPE, [
          kind, PRIM_HOLE_DEFAULT, v(0, 1, 0), 0, v(0, 0, 0), v(1, 1, 0), v(0, 0, 0),
        ], 0)
        expect(readPrimParam(p, PRIM_TYPE, [], 0)?.values).toEqual([
          kind, PRIM_HOLE_DEFAULT, v(0, 1, 0), 0, v(0, 0, 0), v(1, 1, 0), v(0, 0, 0),
        ])
      }
    })
    it('SPHERE', () => {
      const p = freshPrim()
      writePrimParam(p, PRIM_TYPE, [
        PRIM_TYPE_SPHERE, PRIM_HOLE_DEFAULT, v(0, 1, 0), 0.1, v(0, 0, 0), v(0, 1, 0),
      ], 0)
      expect(readPrimParam(p, PRIM_TYPE, [], 0)?.values).toEqual([
        PRIM_TYPE_SPHERE, PRIM_HOLE_DEFAULT, v(0, 1, 0), 0.1, v(0, 0, 0), v(0, 1, 0),
      ])
    })
    it('TORUS/TUBE/RING (kind 4/5/6)', () => {
      for (const kind of [4, 5, 6]) {
        const p = freshPrim()
        writePrimParam(p, PRIM_TYPE, [
          kind, PRIM_HOLE_DEFAULT, v(0, 1, 0), 0, v(0, 0, 0),
          v(1, 0.25, 0), v(0, 0, 0), v(0, 1, 0), v(1, 1, 0),
          1, 0, 0,
        ], 0)
        expect(readPrimParam(p, PRIM_TYPE, [], 0)?.values).toEqual([
          kind, PRIM_HOLE_DEFAULT, v(0, 1, 0), 0, v(0, 0, 0),
          v(1, 0.25, 0), v(0, 0, 0), v(0, 1, 0), v(1, 1, 0),
          1, 0, 0,
        ])
      }
    })
    it('SCULPT', () => {
      const p = freshPrim()
      writePrimParam(p, PRIM_TYPE, [PRIM_TYPE_SCULPT, 'map-key', 5], 0)
      expect(readPrimParam(p, PRIM_TYPE, [], 0)?.values).toEqual([PRIM_TYPE_SCULPT, 'map-key', 5])
    })
    it('TORUS shape distinct from BOX (no field bleed)', () => {
      const p = freshPrim()
      writePrimParam(p, PRIM_TYPE, [
        PRIM_TYPE_RING, PRIM_HOLE_DEFAULT, v(0, 1, 0), 0, v(0, 0, 0),
        v(1, 0.25, 0), v(0, 0, 0), v(0, 1, 0), v(1, 1, 0),
        2, -0.5, 0.1,
      ], 0)
      const read = readPrimParam(p, PRIM_TYPE, [], 0)!.values
      expect(read).toHaveLength(12)
    })
  })

  it('unknown rule constant returns null (caller stops walk)', () => {
    const p = freshPrim()
    expect(readPrimParam(p, 99999, [], 0)).toBeNull()
    expect(writePrimParam(p, 99999, [], 0)).toBeNull()
  })
})
