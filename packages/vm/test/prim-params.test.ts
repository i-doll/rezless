import { describe, it, expect } from 'vitest'
import { Prim } from '../src/prim.js'
import { Linkset } from '../src/linkset.js'
import {
  assertShapeAliases,
  readPrimParam,
  writePrimParam,
  defaultPrimParams,
  numberOfSides,
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
const MAT = 'f35823e6-40dc-d992-f4cc-85a4cb5464c0'
const r = (x: number, y: number, z: number, s: number) => ({ x, y, z, s })

describe('prim-params helpers', () => {
  it('rejects PRIM_TYPE_* values that drift from the PrimShape aliases', () => {
    expect(() => assertShapeAliases([0, 1, 2, 3, 4, 5, 6, 7])).not.toThrow()
    expect(() => assertShapeAliases([0, 1, 2, 3, 4, 5, 6, 8])).toThrow(/PRIM_TYPE_\* constants disagree/)
    expect(() => assertShapeAliases([0, 1, 2, 3, 4, 5, 6])).toThrow(/PRIM_TYPE_\* constants disagree/)
  })

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
      ['ROTATION', PRIM_ROTATION, [r(0, 0, 0.6, 0.8)], [r(0, 0, 0.6, 0.8)]],
      ['ROT_LOCAL', PRIM_ROT_LOCAL, [r(0.5, 0.5, 0.5, 0.5)], [r(0.5, 0.5, 0.5, 0.5)]],
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
      // In-world: a material name that is neither a key nor an inventory item reads NULL_KEY (probe p4 bad_name_rm), so this uses a key.
      writePrimParam(p, PRIM_RENDER_MATERIAL, [4, MAT], 0)
      expect(readPrimParam(p, PRIM_FULLBRIGHT, [0], 0)?.values).toEqual([1])
      expect(readPrimParam(p, PRIM_GLOW, [2], 0)?.values).toEqual([0.4])
      expect(readPrimParam(p, PRIM_BUMP_SHINY, [0], 0)?.values).toEqual([PRIM_SHINY_HIGH, PRIM_BUMP_BRICKS])
      expect(readPrimParam(p, PRIM_TEXGEN, [1], 0)?.values).toEqual([PRIM_TEXGEN_PLANAR])
      expect(readPrimParam(p, PRIM_RENDER_MATERIAL, [4], 0)?.values).toEqual([MAT])
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
    it('PRIM_SPECULAR stores a negative rotation as 0', () => {
      const p = freshPrim()
      writePrimParam(p, PRIM_SPECULAR, [0, 's-tex', v(1, 1, 0), v(0, 0, 0), 0.5, v(1, 1, 1), 51, 0], 0)
      expect(readPrimParam(p, PRIM_SPECULAR, [0], 0)?.values[3]).toBe(0.5)
      writePrimParam(p, PRIM_SPECULAR, [0, 's-tex', v(1, 1, 0), v(0, 0, 0), -1.5, v(1, 1, 1), 51, 0], 0)
      expect(readPrimParam(p, PRIM_SPECULAR, [0], 0)?.values[3]).toBe(0)
    })
    it('PRIM_SPECULAR keeps the colour in 8 bits per channel', () => {
      const p = freshPrim()
      writePrimParam(p, PRIM_SPECULAR, [0, 's-tex', v(1, 1, 0), v(0, 0, 0), 0, v(0.5, 0.5, 0.5), 51, 0], 0)
      expect(readPrimParam(p, PRIM_SPECULAR, [0], 0)?.values[4]).toEqual(v(127 / 255, 127 / 255, 127 / 255))
      writePrimParam(p, PRIM_SPECULAR, [0, 's-tex', v(1, 1, 0), v(0, 0, 0), 0, v(-0.5, 2, 1), 51, 0], 0)
      expect(readPrimParam(p, PRIM_SPECULAR, [0], 0)?.values[4]).toEqual(v(0, 1, 1))
    })
    it('PRIM_GLTF_* round-trips on a face with a render material', () => {
      // In-world: overrides on a face without a material read back as "" (probe p1 nomat_bc_full).
      const p = freshPrim()
      writePrimParam(p, PRIM_RENDER_MATERIAL, [0, MAT], 0)
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

describe('face slots follow the shape (measured in Second Life)', () => {
  const plain = v(0, 1, 0)
  const half = v(0.25, 0.75, 0)
  const wide = v(0.1, 0.9, 0)
  const linear = (kind: number, cut = plain, hollow = 0) =>
    [kind, PRIM_HOLE_DEFAULT, cut, hollow, v(0, 0, 0), v(1, 1, 0), v(0, 0, 0)]
  const sphere = (cut = plain, hollow = 0, dimple = plain) =>
    [PRIM_TYPE_SPHERE, PRIM_HOLE_DEFAULT, cut, hollow, v(0, 0, 0), dimple]
  const looped = (kind: number, cut = plain, hollow = 0, profileCut = plain) =>
    [kind, PRIM_HOLE_DEFAULT, cut, hollow, v(0, 0, 0), v(1, 0.25, 0), v(0, 0, 0), profileCut, v(0, 0, 0), 1, 0, 0]

  const sides = (shape: unknown[]) => {
    const p = freshPrim()
    writePrimParam(p, PRIM_TYPE, shape as never, 0)
    expect(p.params.faces).toHaveLength(numberOfSides(p.params.shape))
    expect(readPrimParam(p, PRIM_COLOR, [ALL_SIDES], 0)!.values).toHaveLength(2 * p.params.faces.length)
    return p.params.faces.length
  }

  it.each([
    ['box', 6, linear(0)],
    ['box hollow', 7, linear(0, plain, 0.5)],
    ['box cut', 6, linear(0, half)],
    ['box cut + hollow', 7, linear(0, half, 0.5)],
    ['box cut 0.1-0.9', 8, linear(0, wide)],
    ['box cut 0.1-0.9 + hollow', 9, linear(0, wide, 0.5)],
    ['cylinder', 3, linear(1)],
    ['cylinder hollow', 4, linear(1, plain, 0.5)],
    ['cylinder cut', 5, linear(1, half)],
    ['cylinder cut + hollow', 6, linear(1, half, 0.5)],
    ['prism', 5, linear(2)],
    ['prism hollow', 6, linear(2, plain, 0.5)],
    ['prism cut', 7, linear(2, half)],
    ['prism cut + hollow', 8, linear(2, half, 0.5)],
    ['prism cut 0.1-0.9 + hollow', 8, linear(2, wide, 0.5)],
    ['sphere', 1, sphere()],
    ['sphere hollow', 4, sphere(plain, 0.5)],
    ['sphere cut', 3, sphere(half)],
    ['sphere cut + hollow', 6, sphere(half, 0.5)],
    ['sphere dimple', 3, sphere(plain, 0, half)],
    ['sphere dimple + hollow', 4, sphere(plain, 0.5, half)],
    ['sphere cut + dimple', 5, sphere(half, 0, half)],
    ['torus', 1, looped(4)],
    ['torus hollow', 2, looped(4, plain, 0.5)],
    ['torus cut', 3, looped(4, half)],
    ['torus cut + hollow', 4, looped(4, half, 0.5)],
    ['torus profile cut', 3, looped(4, plain, 0, half)],
    ['torus profile cut + hollow', 4, looped(4, plain, 0.5, half)],
    ['torus cut + profile cut', 5, looped(4, half, 0, half)],
    ['tube', 4, looped(5)],
    ['tube hollow', 5, looped(5, plain, 0.5)],
    ['tube cut', 6, looped(5, half)],
    ['tube cut + hollow', 7, looped(5, half, 0.5)],
    ['tube profile cut', 4, looped(5, plain, 0, half)],
    ['tube profile cut + hollow', 5, looped(5, plain, 0.5, half)],
    ['tube cut + profile cut', 6, looped(5, half, 0, half)],
    ['tube cut + profile cut 0.1-0.9 + hollow', 9, looped(5, half, 0.5, wide)],
    ['ring', 3, looped(6)],
    ['ring hollow', 4, looped(6, plain, 0.5)],
    ['ring cut', 5, looped(6, half)],
    ['ring cut + hollow', 6, looped(6, half, 0.5)],
    ['ring profile cut', 5, looped(6, plain, 0, half)],
    ['ring profile cut + hollow', 6, looped(6, plain, 0.5, half)],
    ['ring cut + profile cut', 7, looped(6, half, 0, half)],
    ['ring cut + profile cut + hollow', 8, looped(6, half, 0.5, half)],
  ])('%s has %i faces', (_, count, shape) => {
    expect(sides(shape)).toBe(count)
  })

  it('a sculpt has one face', () => {
    expect(sides([PRIM_TYPE_SCULPT, 'map', 1])).toBe(1)
  })

  const paint = (p: Prim) => {
    for (let f = 0; f < p.params.faces.length; f++) {
      writePrimParam(p, PRIM_COLOR, [f, v((f + 1) / 10, 0, 0), 1], 0)
    }
  }
  const reds = (p: Prim) => p.params.faces.map((f) => f.color.x)
  const reshape = (p: Prim, shape: unknown[]) => writePrimParam(p, PRIM_TYPE, shape as never, 0)

  it('hollowing a box adds the inner face as a copy of the last face', () => {
    const p = freshPrim()
    paint(p)
    reshape(p, linear(0, plain, 0.5))
    expect(reds(p)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.6])
  })

  it('removing the hollow drops the inner face and moves the bottom back', () => {
    const p = freshPrim()
    reshape(p, linear(0, plain, 0.5))
    paint(p)
    reshape(p, linear(0))
    expect(reds(p)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.7])
    reshape(p, linear(0, plain, 0.5))
    expect(reds(p)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 0.7])
  })

  it('a profile cut keeps the overlapping outer faces and adds cut faces copied from the last face', () => {
    const p = freshPrim()
    paint(p)
    reshape(p, linear(0, half))
    expect(reds(p)).toEqual([0.1, 0.3, 0.4, 0.6, 0.6, 0.6])
    reshape(p, linear(0))
    expect(reds(p)).toEqual([0.1, 0.3, 0.3, 0.4, 0.4, 0.6])
  })

  it('cut + hollow box back to a plain box, then to a cylinder', () => {
    const p = freshPrim()
    reshape(p, linear(0, half, 0.5))
    paint(p)
    reshape(p, linear(0))
    expect(reds(p)).toEqual([0.1, 0.2, 0.2, 0.3, 0.3, 0.5])
    reshape(p, linear(1))
    expect(reds(p)).toEqual([0.1, 0.2, 0.5])
  })

  it('re-applying the same shape keeps every face', () => {
    const p = freshPrim()
    reshape(p, looped(6, half, 0.5, half))
    paint(p)
    reshape(p, looped(6, half, 0.5, half))
    expect(reds(p)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8])
  })

  it('faces copied across a shape change are independent', () => {
    const p = freshPrim()
    reshape(p, linear(0, plain, 0.5))
    p.params.faces[6]!.color.x = 0.9
    expect(p.params.faces[5]!.color.x).toBe(1)
  })

  it.each([
    PRIM_COLOR, PRIM_TEXTURE, PRIM_RENDER_MATERIAL, PRIM_FULLBRIGHT, PRIM_GLOW, PRIM_BUMP_SHINY,
    PRIM_TEXGEN, PRIM_NORMAL, PRIM_SPECULAR, PRIM_ALPHA_MODE, PRIM_GLTF_BASE_COLOR,
    PRIM_GLTF_NORMAL, PRIM_GLTF_METALLIC_ROUGHNESS, PRIM_GLTF_EMISSIVE,
  ])('per-face rule %i reads all nine faces of a nine-face box and nothing past them', (rule) => {
    const p = freshPrim()
    reshape(p, linear(0, wide, 0.5))
    const one = readPrimParam(p, rule, [8], 0)!.values
    expect(one.length).toBeGreaterThan(0)
    expect(readPrimParam(p, rule, [ALL_SIDES], 0)!.values).toHaveLength(9 * one.length)
    expect(readPrimParam(p, rule, [9], 0)!.values).toEqual([])
  })

  it('PRIM_GLOW reaches face 8 of a nine-face box and keeps the glow mirror in step', () => {
    const p = freshPrim()
    reshape(p, linear(0, wide, 0.5))
    writePrimParam(p, PRIM_GLOW, [8, 0.5], 0)
    expect(readPrimParam(p, PRIM_GLOW, [8], 0)!.values).toEqual([0.5])
    expect(readPrimParam(p, PRIM_GLOW, [9], 0)!.values).toEqual([])
    expect(p.params.glow).toHaveLength(9)
    reshape(p, linear(0))
    expect(p.params.glow).toEqual(p.params.faces.map((f) => f.glow))
  })
})
