import {
  ALL_SIDES,
  CLICK_ACTION_TOUCH,
  PRIM_ALPHA_MODE,
  PRIM_ALPHA_MODE_NONE,
  PRIM_ALLOW_UNSIT,
  PRIM_BUMP_NONE,
  PRIM_BUMP_SHINY,
  PRIM_CAST_SHADOWS,
  PRIM_CLICK_ACTION,
  PRIM_COLOR,
  PRIM_DAMAGE,
  PRIM_DESC,
  PRIM_FLEXIBLE,
  PRIM_FULLBRIGHT,
  PRIM_GLOW,
  PRIM_GLTF_ALPHA_MODE_OPAQUE,
  PRIM_GLTF_BASE_COLOR,
  PRIM_GLTF_EMISSIVE,
  PRIM_GLTF_METALLIC_ROUGHNESS,
  PRIM_GLTF_NORMAL,
  PRIM_HEALTH,
  PRIM_HOLE_DEFAULT,
  PRIM_LINK_TARGET,
  PRIM_MATERIAL,
  PRIM_MATERIAL_STONE,
  PRIM_NAME,
  PRIM_NORMAL,
  PRIM_OMEGA,
  PRIM_PHANTOM,
  PRIM_PHYSICS,
  PRIM_PHYSICS_SHAPE_PRIM,
  PRIM_PHYSICS_SHAPE_TYPE,
  PRIM_POINT_LIGHT,
  PRIM_POSITION,
  PRIM_POS_LOCAL,
  PRIM_PROJECTOR,
  PRIM_REFLECTION_PROBE,
  PRIM_RENDER_MATERIAL,
  PRIM_ROTATION,
  PRIM_ROT_LOCAL,
  PRIM_SCRIPTED_SIT_ONLY,
  PRIM_SCULPT_TYPE_SPHERE,
  PRIM_SHINY_NONE,
  PRIM_SIT_FLAGS,
  PRIM_SIT_TARGET,
  PRIM_SIZE,
  PRIM_SLICE,
  PRIM_SPECULAR,
  PRIM_TEMP_ON_REZ,
  PRIM_TEXGEN,
  PRIM_TEXGEN_DEFAULT,
  PRIM_TEXT,
  PRIM_TEXTURE,
  PRIM_TYPE,
  PRIM_TYPE_BOX,
  PRIM_TYPE_CYLINDER,
  PRIM_TYPE_PRISM,
  PRIM_TYPE_RING,
  PRIM_TYPE_SCULPT,
  PRIM_TYPE_SPHERE,
  PRIM_TYPE_TORUS,
  PRIM_TYPE_TUBE,
  STATUS_PHANTOM,
  STATUS_PHYSICS,
  TEXTURE_DEFAULT,
} from './generated/constants.js'
import type { LslValue, Rotation, Vector } from './values/types.js'
import { NULL_KEY } from './values/types.js'
import type { Prim } from './prim.js'

/**
 * Backing store for the PRIM_* family of llSetPrimitiveParams /
 * llGetPrimitiveParams values. The full wiki surface is modeled here so
 * that the seam in `Prim` (`getPrimParam` / `setPrimParam`) is the single
 * place where every PRIM_* rule is interpreted, whether the caller is a
 * direct llSetPrimitiveParams or one of the alternative accessors
 * (llSetPos, llSetColor, llSitTarget, …).
 */
export interface PrimParams {
  position: Vector
  rotation: Rotation
  size: Vector
  /** Per-face slots. LSL uses face index `ALL_SIDES = -1` to mean "every face". */
  faces: PrimFace[]
  pointLight: { enabled: boolean; color: Vector; intensity: number; radius: number; falloff: number }
  /** Legacy mirror of `faces[i].glow`. Kept for direct field access. */
  glow: number[]
  omega: { axis: Vector; spinrate: number; gain: number }
  physicsShapeType: number
  flexible: { enabled: boolean; softness: number; gravity: number; friction: number; wind: number; tension: number; force: Vector }
  sculpt: { textureKey: string; type: number }
  slice: Vector
  shape: PrimShape
  material: number
  tempOnRez: boolean
  castShadows: boolean
  allowUnsit: boolean
  scriptedSitOnly: boolean
  sitTarget: { enabled: boolean; offset: Vector; rotation: Rotation }
  sitFlags: number
  projector: { texture: string; fov: number; focus: number; ambiance: number }
  clickAction: number
  damage: { amount: number; type: number }
  health: number
  reflectionProbe: { enabled: boolean; ambiance: number; clipDistance: number; flags: number }
  physicsMaterial: { gravityMultiplier: number; restitution: number; friction: number; density: number }
  textureAnim: { mode: number; face: number; sizex: number; sizey: number; start: number; length: number; rate: number }
  passCollisions: number
  passTouches: number
}

export interface PrimFaceMaterial {
  texture: string
  textureRepeats: Vector
  textureOffsets: Vector
  textureRotation: number
}

export interface PrimFace {
  texture: string
  textureRepeats: Vector
  textureOffsets: Vector
  textureRotation: number
  color: Vector
  alpha: number
  bumpShiny: { shiny: number; bump: number }
  fullBright: boolean
  glow: number
  texgen: number
  renderMaterial: string
  normal: PrimFaceMaterial
  specular: PrimFaceMaterial & { color: Vector; glossiness: number; environment: number }
  alphaMode: { mode: number; cutoff: number }
  gltf: {
    baseColor: PrimFaceMaterial & { color: Vector; alpha: number; alphaMode: number; alphaCutoff: number; doubleSided: number }
    normal: PrimFaceMaterial
    metallicRoughness: PrimFaceMaterial & { metallic: number; roughness: number }
    emissive: PrimFaceMaterial & { tint: Vector }
  }
}

/**
 * Typed-literal aliases for the kwdb PRIM_TYPE_* constants. The
 * generated module exports them as `: number` so TS can't narrow on
 * them; we re-pin them to their literal values here. The `as` assertions
 * are runtime-asserted below so a future kwdb renumber would surface as
 * a load-time failure rather than silent corruption.
 */
const SHAPE_BOX = PRIM_TYPE_BOX as 0
const SHAPE_CYLINDER = PRIM_TYPE_CYLINDER as 1
const SHAPE_PRISM = PRIM_TYPE_PRISM as 2
const SHAPE_SPHERE = PRIM_TYPE_SPHERE as 3
const SHAPE_TORUS = PRIM_TYPE_TORUS as 4
const SHAPE_TUBE = PRIM_TYPE_TUBE as 5
const SHAPE_RING = PRIM_TYPE_RING as 6
const SHAPE_SCULPT = PRIM_TYPE_SCULPT as 7
if (
  SHAPE_BOX !== 0 || SHAPE_CYLINDER !== 1 || SHAPE_PRISM !== 2 ||
  SHAPE_SPHERE !== 3 || SHAPE_TORUS !== 4 || SHAPE_TUBE !== 5 ||
  SHAPE_RING !== 6 || SHAPE_SCULPT !== 7
) {
  throw new Error('kwdb PRIM_TYPE_* constants disagree with PrimShape literal aliases')
}

export type PrimShape =
  | { kind: typeof SHAPE_BOX | typeof SHAPE_CYLINDER | typeof SHAPE_PRISM; hole: number; cut: Vector; hollow: number; twist: Vector; topSize: Vector; topShear: Vector }
  | { kind: typeof SHAPE_SPHERE; hole: number; cut: Vector; hollow: number; twist: Vector; dimple: Vector }
  | {
      kind: typeof SHAPE_TORUS | typeof SHAPE_TUBE | typeof SHAPE_RING
      hole: number; cut: Vector; hollow: number; twist: Vector
      holeSize: Vector; topShear: Vector; advancedCut: Vector; taper: Vector
      revolutions: number; radiusOffset: number; skew: number
    }
  | { kind: typeof SHAPE_SCULPT; map: string; type: number }

const zero = (): Vector => ({ x: 0, y: 0, z: 0 })
const one = (): Vector => ({ x: 1, y: 1, z: 1 })
const identityRot = (): Rotation => ({ x: 0, y: 0, z: 0, s: 1 })

function defaultFaceMaterial(): PrimFaceMaterial {
  return { texture: '', textureRepeats: { x: 1, y: 1, z: 0 }, textureOffsets: zero(), textureRotation: 0 }
}

export function defaultFace(): PrimFace {
  return {
    texture: TEXTURE_DEFAULT,
    textureRepeats: { x: 1, y: 1, z: 0 },
    textureOffsets: zero(),
    textureRotation: 0,
    color: one(),
    alpha: 1,
    bumpShiny: { shiny: PRIM_SHINY_NONE, bump: PRIM_BUMP_NONE },
    fullBright: false,
    glow: 0,
    texgen: PRIM_TEXGEN_DEFAULT,
    renderMaterial: '',
    normal: defaultFaceMaterial(),
    specular: { ...defaultFaceMaterial(), color: one(), glossiness: 51, environment: 0 },
    alphaMode: { mode: PRIM_ALPHA_MODE_NONE, cutoff: 0 },
    gltf: {
      baseColor: { ...defaultFaceMaterial(), color: one(), alpha: 1, alphaMode: PRIM_GLTF_ALPHA_MODE_OPAQUE, alphaCutoff: 0.5, doubleSided: 0 },
      normal: defaultFaceMaterial(),
      metallicRoughness: { ...defaultFaceMaterial(), metallic: 1, roughness: 1 },
      emissive: { ...defaultFaceMaterial(), tint: zero() },
    },
  }
}

export function defaultShape(): PrimShape {
  return {
    kind: SHAPE_BOX,
    hole: PRIM_HOLE_DEFAULT,
    cut: { x: 0, y: 1, z: 0 },
    hollow: 0,
    twist: zero(),
    topSize: { x: 1, y: 1, z: 0 },
    topShear: zero(),
  }
}

export function defaultPrimParams(): PrimParams {
  return {
    position: zero(),
    rotation: identityRot(),
    size: { x: 0.5, y: 0.5, z: 0.5 },
    faces: Array.from({ length: 6 }, () => defaultFace()),
    pointLight: { enabled: false, color: one(), intensity: 1, radius: 10, falloff: 0.75 },
    glow: [0, 0, 0, 0, 0, 0],
    omega: { axis: zero(), spinrate: 0, gain: 0 },
    physicsShapeType: PRIM_PHYSICS_SHAPE_PRIM,
    flexible: { enabled: false, softness: 0, gravity: 0, friction: 0, wind: 0, tension: 0, force: zero() },
    sculpt: { textureKey: '', type: PRIM_SCULPT_TYPE_SPHERE },
    slice: { x: 0, y: 1, z: 0 },
    shape: defaultShape(),
    material: PRIM_MATERIAL_STONE,
    tempOnRez: false,
    castShadows: false,
    allowUnsit: true,
    scriptedSitOnly: false,
    sitTarget: { enabled: false, offset: zero(), rotation: identityRot() },
    sitFlags: 0,
    projector: { texture: NULL_KEY, fov: 0, focus: 0, ambiance: 0 },
    clickAction: CLICK_ACTION_TOUCH,
    damage: { amount: 0, type: 0 },
    health: 1,
    reflectionProbe: { enabled: false, ambiance: 0, clipDistance: 0, flags: 0 },
    physicsMaterial: { gravityMultiplier: 1, restitution: 0, friction: 0, density: 1000 },
    textureAnim: { mode: 0, face: 0, sizex: 0, sizey: 0, start: 0, length: 0, rate: 0 },
    passCollisions: 0,
    passTouches: 0,
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers used by Prim.getPrimParam / setPrimParam                  */
/* ------------------------------------------------------------------ */

const num = (v: LslValue | undefined, d = 0): number => (typeof v === 'number' ? v : d)
const str = (v: LslValue | undefined, d = ''): string => (typeof v === 'string' ? v : d)
const asVec = (v: LslValue | undefined): Vector => {
  if (v && typeof v === 'object' && !Array.isArray(v) && 'x' in v && 'y' in v && 'z' in v && !('s' in v)) {
    const w = v as Vector
    return { x: w.x, y: w.y, z: w.z }
  }
  return zero()
}
const asRot = (v: LslValue | undefined): Rotation => {
  if (v && typeof v === 'object' && !Array.isArray(v) && 's' in v) {
    const r = v as Rotation
    return { x: r.x, y: r.y, z: r.z, s: r.s }
  }
  return identityRot()
}

function facesOf(faceArg: LslValue | undefined): number[] {
  const f = num(faceArg, 0) | 0
  if (f === ALL_SIDES) return [0, 1, 2, 3, 4, 5]
  return [f]
}

function inRange(face: number): boolean {
  return face >= 0 && face <= 5
}

/**
 * Slot count for a PRIM_* rule's *write* form, given the rule constant
 * and (for variable-shape rules like PRIM_TYPE) the rules list + cursor
 * to peek at the discriminator. Does NOT mutate the prim. Returns null
 * for unsupported / unknown rule constants. Used by the walker to skip
 * past rules that can't be applied (e.g. PRIM_LINK_TARGET resolved to
 * an empty target set) without losing track of cursor position.
 */
export function writePrimParamSlots(
  param: number,
  rules: ReadonlyArray<LslValue>,
  cursor: number,
): number | null {
  switch (param) {
    case PRIM_NAME: case PRIM_DESC:
    case PRIM_POSITION: case PRIM_POS_LOCAL:
    case PRIM_ROTATION: case PRIM_ROT_LOCAL:
    case PRIM_SIZE: case PRIM_SLICE:
    case PRIM_MATERIAL: case PRIM_PHYSICS: case PRIM_PHANTOM:
    case PRIM_TEMP_ON_REZ: case PRIM_PHYSICS_SHAPE_TYPE:
    case PRIM_CAST_SHADOWS: case PRIM_ALLOW_UNSIT:
    case PRIM_SCRIPTED_SIT_ONLY: case PRIM_SIT_FLAGS:
    case PRIM_CLICK_ACTION: case PRIM_HEALTH:
      return 1
    case PRIM_DAMAGE:
      return 2
    case PRIM_TEXT: case PRIM_OMEGA: case PRIM_SIT_TARGET:
      return 3
    case PRIM_REFLECTION_PROBE: case PRIM_PROJECTOR:
      return 4
    case PRIM_POINT_LIGHT:
      return 5
    case PRIM_FLEXIBLE:
      return 7
    case PRIM_TYPE: {
      const kind = num(rules[cursor]) | 0
      if (kind === SHAPE_BOX || kind === SHAPE_CYLINDER || kind === SHAPE_PRISM) return 7
      if (kind === SHAPE_SPHERE) return 6
      if (kind === SHAPE_TORUS || kind === SHAPE_TUBE || kind === SHAPE_RING) return 12
      if (kind === SHAPE_SCULPT) return 3
      return null
    }
    case PRIM_COLOR: return 3
    case PRIM_TEXTURE: case PRIM_NORMAL: case PRIM_GLTF_NORMAL: return 5
    case PRIM_RENDER_MATERIAL: case PRIM_FULLBRIGHT: case PRIM_GLOW: case PRIM_TEXGEN: return 2
    case PRIM_BUMP_SHINY: case PRIM_ALPHA_MODE: return 3
    case PRIM_SPECULAR: return 8
    case PRIM_GLTF_BASE_COLOR: return 10
    case PRIM_GLTF_METALLIC_ROUGHNESS: return 7
    case PRIM_GLTF_EMISSIVE: return 6
    case PRIM_LINK_TARGET: return null // walker handles
    default: return null
  }
}

/**
 * Apply one PRIM_* rule starting at `cursor` in `rules`. Returns the
 * number of slots after `param` consumed by the rule (so the walker
 * advances by `1 + consumed`). Returns `null` for unsupported / unknown
 * rule constants — the walker stops parsing the list, matching LSL.
 */
export function writePrimParam(
  prim: Prim,
  param: number,
  rules: ReadonlyArray<LslValue>,
  cursor: number,
): number | null {
  const p = prim.params
  switch (param) {
    case PRIM_NAME:
      prim.name = str(rules[cursor])
      return 1
    case PRIM_DESC:
      prim.description = str(rules[cursor])
      prim.appearance.description = prim.description
      return 1
    case PRIM_TEXT: {
      const text = str(rules[cursor])
      const color = asVec(rules[cursor + 1])
      const alpha = num(rules[cursor + 2], 1)
      prim.appearance.text = { text, color, alpha }
      return 3
    }
    case PRIM_POSITION:
    case PRIM_POS_LOCAL:
      p.position = asVec(rules[cursor])
      return 1
    case PRIM_ROTATION:
    case PRIM_ROT_LOCAL:
      p.rotation = asRot(rules[cursor])
      return 1
    case PRIM_SIZE:
      p.size = asVec(rules[cursor])
      return 1
    case PRIM_SLICE:
      p.slice = asVec(rules[cursor])
      return 1
    case PRIM_MATERIAL:
      p.material = num(rules[cursor]) | 0
      return 1
    case PRIM_PHYSICS:
      prim.setStatus(STATUS_PHYSICS, num(rules[cursor]) !== 0)
      return 1
    case PRIM_PHANTOM:
      prim.setStatus(STATUS_PHANTOM, num(rules[cursor]) !== 0)
      return 1
    case PRIM_TEMP_ON_REZ:
      p.tempOnRez = num(rules[cursor]) !== 0
      return 1
    case PRIM_PHYSICS_SHAPE_TYPE:
      p.physicsShapeType = num(rules[cursor]) | 0
      return 1
    case PRIM_CAST_SHADOWS:
      p.castShadows = num(rules[cursor]) !== 0
      return 1
    case PRIM_ALLOW_UNSIT:
      p.allowUnsit = num(rules[cursor]) !== 0
      return 1
    case PRIM_SCRIPTED_SIT_ONLY:
      p.scriptedSitOnly = num(rules[cursor]) !== 0
      return 1
    case PRIM_SIT_FLAGS:
      p.sitFlags = num(rules[cursor]) | 0
      return 1
    case PRIM_CLICK_ACTION:
      p.clickAction = num(rules[cursor]) | 0
      return 1
    case PRIM_HEALTH:
      p.health = num(rules[cursor])
      return 1
    case PRIM_DAMAGE:
      p.damage = { amount: num(rules[cursor]), type: num(rules[cursor + 1]) | 0 }
      return 2
    case PRIM_OMEGA:
      p.omega = { axis: asVec(rules[cursor]), spinrate: num(rules[cursor + 1]), gain: num(rules[cursor + 2]) }
      return 3
    case PRIM_POINT_LIGHT:
      p.pointLight = {
        enabled: num(rules[cursor]) !== 0,
        color: asVec(rules[cursor + 1]),
        intensity: num(rules[cursor + 2]),
        radius: num(rules[cursor + 3]),
        falloff: num(rules[cursor + 4]),
      }
      return 5
    case PRIM_REFLECTION_PROBE:
      p.reflectionProbe = {
        enabled: num(rules[cursor]) !== 0,
        ambiance: num(rules[cursor + 1]),
        clipDistance: num(rules[cursor + 2]),
        flags: num(rules[cursor + 3]) | 0,
      }
      return 4
    case PRIM_PROJECTOR:
      p.projector = {
        texture: str(rules[cursor]),
        fov: num(rules[cursor + 1]),
        focus: num(rules[cursor + 2]),
        ambiance: num(rules[cursor + 3]),
      }
      return 4
    case PRIM_FLEXIBLE:
      p.flexible = {
        enabled: num(rules[cursor]) !== 0,
        softness: num(rules[cursor + 1]) | 0,
        gravity: num(rules[cursor + 2]),
        friction: num(rules[cursor + 3]),
        wind: num(rules[cursor + 4]),
        tension: num(rules[cursor + 5]),
        force: asVec(rules[cursor + 6]),
      }
      return 7
    case PRIM_SIT_TARGET:
      p.sitTarget = {
        enabled: num(rules[cursor]) !== 0,
        offset: asVec(rules[cursor + 1]),
        rotation: asRot(rules[cursor + 2]),
      }
      return 3
    case PRIM_TYPE:
      return writePrimType(p, rules, cursor)
    case PRIM_COLOR: {
      const faces = facesOf(rules[cursor])
      const color = asVec(rules[cursor + 1])
      const alpha = num(rules[cursor + 2], 1)
      for (const f of faces) {
        if (!inRange(f)) continue
        // Clone so faces don't alias the same vector instance.
        p.faces[f]!.color = { x: color.x, y: color.y, z: color.z }
        p.faces[f]!.alpha = alpha
      }
      return 3
    }
    case PRIM_TEXTURE: {
      const faces = facesOf(rules[cursor])
      const tex = str(rules[cursor + 1])
      const repeats = asVec(rules[cursor + 2])
      const offsets = asVec(rules[cursor + 3])
      const rot = num(rules[cursor + 4])
      for (const f of faces) {
        if (!inRange(f)) continue
        p.faces[f]!.texture = tex
        p.faces[f]!.textureRepeats = { x: repeats.x, y: repeats.y, z: repeats.z }
        p.faces[f]!.textureOffsets = { x: offsets.x, y: offsets.y, z: offsets.z }
        p.faces[f]!.textureRotation = rot
      }
      return 5
    }
    case PRIM_RENDER_MATERIAL: {
      const faces = facesOf(rules[cursor])
      const m = str(rules[cursor + 1])
      for (const f of faces) {
        if (!inRange(f)) continue
        p.faces[f]!.renderMaterial = m
      }
      return 2
    }
    case PRIM_FULLBRIGHT: {
      const faces = facesOf(rules[cursor])
      const v = num(rules[cursor + 1]) !== 0
      for (const f of faces) {
        if (!inRange(f)) continue
        p.faces[f]!.fullBright = v
      }
      return 2
    }
    case PRIM_GLOW: {
      const faces = facesOf(rules[cursor])
      const v = num(rules[cursor + 1])
      for (const f of faces) {
        if (!inRange(f)) continue
        p.faces[f]!.glow = v
        p.glow[f] = v
      }
      return 2
    }
    case PRIM_BUMP_SHINY: {
      const faces = facesOf(rules[cursor])
      const shiny = num(rules[cursor + 1]) | 0
      const bump = num(rules[cursor + 2]) | 0
      for (const f of faces) {
        if (!inRange(f)) continue
        p.faces[f]!.bumpShiny = { shiny, bump }
      }
      return 3
    }
    case PRIM_TEXGEN: {
      const faces = facesOf(rules[cursor])
      const mode = num(rules[cursor + 1]) | 0
      for (const f of faces) {
        if (!inRange(f)) continue
        p.faces[f]!.texgen = mode
      }
      return 2
    }
    case PRIM_NORMAL: {
      const faces = facesOf(rules[cursor])
      const tex = str(rules[cursor + 1])
      const repeats = asVec(rules[cursor + 2])
      const offsets = asVec(rules[cursor + 3])
      const rot = num(rules[cursor + 4])
      for (const f of faces) {
        if (!inRange(f)) continue
        p.faces[f]!.normal = {
          texture: tex,
          textureRepeats: { x: repeats.x, y: repeats.y, z: repeats.z },
          textureOffsets: { x: offsets.x, y: offsets.y, z: offsets.z },
          textureRotation: rot,
        }
      }
      return 5
    }
    case PRIM_SPECULAR: {
      const faces = facesOf(rules[cursor])
      const tex = str(rules[cursor + 1])
      const repeats = asVec(rules[cursor + 2])
      const offsets = asVec(rules[cursor + 3])
      const rot = num(rules[cursor + 4])
      const color = asVec(rules[cursor + 5])
      const gloss = num(rules[cursor + 6]) | 0
      const env = num(rules[cursor + 7]) | 0
      for (const f of faces) {
        if (!inRange(f)) continue
        p.faces[f]!.specular = {
          texture: tex,
          textureRepeats: { x: repeats.x, y: repeats.y, z: repeats.z },
          textureOffsets: { x: offsets.x, y: offsets.y, z: offsets.z },
          textureRotation: rot,
          color: { x: color.x, y: color.y, z: color.z },
          glossiness: gloss,
          environment: env,
        }
      }
      return 8
    }
    case PRIM_ALPHA_MODE: {
      const faces = facesOf(rules[cursor])
      const mode = num(rules[cursor + 1]) | 0
      const cutoff = num(rules[cursor + 2]) | 0
      for (const f of faces) {
        if (!inRange(f)) continue
        p.faces[f]!.alphaMode = { mode, cutoff }
      }
      return 3
    }
    case PRIM_GLTF_BASE_COLOR: {
      const faces = facesOf(rules[cursor])
      const tex = str(rules[cursor + 1])
      const repeats = asVec(rules[cursor + 2])
      const offsets = asVec(rules[cursor + 3])
      const rot = num(rules[cursor + 4])
      const color = asVec(rules[cursor + 5])
      const alpha = num(rules[cursor + 6], 1)
      const aMode = num(rules[cursor + 7]) | 0
      const aCut = num(rules[cursor + 8])
      const dbl = num(rules[cursor + 9]) | 0
      for (const f of faces) {
        if (!inRange(f)) continue
        p.faces[f]!.gltf.baseColor = {
          texture: tex,
          textureRepeats: { x: repeats.x, y: repeats.y, z: repeats.z },
          textureOffsets: { x: offsets.x, y: offsets.y, z: offsets.z },
          textureRotation: rot,
          color: { x: color.x, y: color.y, z: color.z },
          alpha,
          alphaMode: aMode,
          alphaCutoff: aCut,
          doubleSided: dbl,
        }
      }
      return 10
    }
    case PRIM_GLTF_NORMAL: {
      const faces = facesOf(rules[cursor])
      const tex = str(rules[cursor + 1])
      const repeats = asVec(rules[cursor + 2])
      const offsets = asVec(rules[cursor + 3])
      const rot = num(rules[cursor + 4])
      for (const f of faces) {
        if (!inRange(f)) continue
        p.faces[f]!.gltf.normal = {
          texture: tex,
          textureRepeats: { x: repeats.x, y: repeats.y, z: repeats.z },
          textureOffsets: { x: offsets.x, y: offsets.y, z: offsets.z },
          textureRotation: rot,
        }
      }
      return 5
    }
    case PRIM_GLTF_METALLIC_ROUGHNESS: {
      const faces = facesOf(rules[cursor])
      const tex = str(rules[cursor + 1])
      const repeats = asVec(rules[cursor + 2])
      const offsets = asVec(rules[cursor + 3])
      const rot = num(rules[cursor + 4])
      const metallic = num(rules[cursor + 5])
      const rough = num(rules[cursor + 6])
      for (const f of faces) {
        if (!inRange(f)) continue
        p.faces[f]!.gltf.metallicRoughness = {
          texture: tex,
          textureRepeats: { x: repeats.x, y: repeats.y, z: repeats.z },
          textureOffsets: { x: offsets.x, y: offsets.y, z: offsets.z },
          textureRotation: rot,
          metallic,
          roughness: rough,
        }
      }
      return 7
    }
    case PRIM_GLTF_EMISSIVE: {
      const faces = facesOf(rules[cursor])
      const tex = str(rules[cursor + 1])
      const repeats = asVec(rules[cursor + 2])
      const offsets = asVec(rules[cursor + 3])
      const rot = num(rules[cursor + 4])
      const tint = asVec(rules[cursor + 5])
      for (const f of faces) {
        if (!inRange(f)) continue
        p.faces[f]!.gltf.emissive = {
          texture: tex,
          textureRepeats: { x: repeats.x, y: repeats.y, z: repeats.z },
          textureOffsets: { x: offsets.x, y: offsets.y, z: offsets.z },
          textureRotation: rot,
          tint: { x: tint.x, y: tint.y, z: tint.z },
        }
      }
      return 6
    }
    case PRIM_LINK_TARGET:
      return null
    default:
      return null
  }
}

function writePrimType(p: PrimParams, rules: ReadonlyArray<LslValue>, cursor: number): number | null {
  const kind = (num(rules[cursor]) | 0)
  switch (kind) {
    case SHAPE_BOX:
    case SHAPE_CYLINDER:
    case SHAPE_PRISM:
      p.shape = {
        kind: kind as 0 | 1 | 2,
        hole: num(rules[cursor + 1]) | 0,
        cut: asVec(rules[cursor + 2]),
        hollow: num(rules[cursor + 3]),
        twist: asVec(rules[cursor + 4]),
        topSize: asVec(rules[cursor + 5]),
        topShear: asVec(rules[cursor + 6]),
      }
      return 7
    case SHAPE_SPHERE:
      p.shape = {
        kind: SHAPE_SPHERE,
        hole: num(rules[cursor + 1]) | 0,
        cut: asVec(rules[cursor + 2]),
        hollow: num(rules[cursor + 3]),
        twist: asVec(rules[cursor + 4]),
        dimple: asVec(rules[cursor + 5]),
      }
      return 6
    case SHAPE_TORUS:
    case SHAPE_TUBE:
    case SHAPE_RING:
      p.shape = {
        kind: kind as 4 | 5 | 6,
        hole: num(rules[cursor + 1]) | 0,
        cut: asVec(rules[cursor + 2]),
        hollow: num(rules[cursor + 3]),
        twist: asVec(rules[cursor + 4]),
        holeSize: asVec(rules[cursor + 5]),
        topShear: asVec(rules[cursor + 6]),
        advancedCut: asVec(rules[cursor + 7]),
        taper: asVec(rules[cursor + 8]),
        revolutions: num(rules[cursor + 9]),
        radiusOffset: num(rules[cursor + 10]),
        skew: num(rules[cursor + 11]),
      }
      return 12
    case SHAPE_SCULPT:
      p.shape = {
        kind: SHAPE_SCULPT,
        map: str(rules[cursor + 1]),
        type: num(rules[cursor + 2]) | 0,
      }
      return 3
    default:
      // Unknown PRIM_TYPE_* kind: terminate the walk rather than guessing
      // a slot count. Matches writePrimParamSlots' default behavior so
      // walkSet handles both target-bearing and empty-target cases the
      // same way.
      return null
  }
}

/**
 * Read a single PRIM_* rule, returning the flat values it expands to and
 * the number of slots after `param` consumed (face index, etc.). Returns
 * `null` for unsupported constants — caller stops parsing and returns
 * the prefix accumulated so far.
 */
export function readPrimParam(
  prim: Prim,
  param: number,
  rules: ReadonlyArray<LslValue>,
  cursor: number,
): { values: LslValue[]; consumed: number } | null {
  const p = prim.params
  switch (param) {
    case PRIM_NAME:
      return { values: [prim.name], consumed: 0 }
    case PRIM_DESC:
      return { values: [prim.description], consumed: 0 }
    case PRIM_TEXT: {
      const t = prim.appearance.text
      return { values: t ? [t.text, t.color, t.alpha] : ['', zero(), 0], consumed: 0 }
    }
    case PRIM_POSITION:
    case PRIM_POS_LOCAL:
      return { values: [p.position], consumed: 0 }
    case PRIM_ROTATION:
    case PRIM_ROT_LOCAL:
      return { values: [p.rotation], consumed: 0 }
    case PRIM_SIZE:
      return { values: [p.size], consumed: 0 }
    case PRIM_SLICE:
      return { values: [p.slice], consumed: 0 }
    case PRIM_MATERIAL:
      return { values: [p.material], consumed: 0 }
    case PRIM_PHYSICS:
      return { values: [(prim.statusFlags & STATUS_PHYSICS) !== 0 ? 1 : 0], consumed: 0 }
    case PRIM_PHANTOM:
      return { values: [(prim.statusFlags & STATUS_PHANTOM) !== 0 ? 1 : 0], consumed: 0 }
    case PRIM_TEMP_ON_REZ:
      return { values: [p.tempOnRez ? 1 : 0], consumed: 0 }
    case PRIM_PHYSICS_SHAPE_TYPE:
      return { values: [p.physicsShapeType], consumed: 0 }
    case PRIM_CAST_SHADOWS:
      return { values: [p.castShadows ? 1 : 0], consumed: 0 }
    case PRIM_ALLOW_UNSIT:
      return { values: [p.allowUnsit ? 1 : 0], consumed: 0 }
    case PRIM_SCRIPTED_SIT_ONLY:
      return { values: [p.scriptedSitOnly ? 1 : 0], consumed: 0 }
    case PRIM_SIT_FLAGS:
      return { values: [p.sitFlags], consumed: 0 }
    case PRIM_CLICK_ACTION:
      return { values: [p.clickAction], consumed: 0 }
    case PRIM_HEALTH:
      return { values: [p.health], consumed: 0 }
    case PRIM_DAMAGE:
      return { values: [p.damage.amount, p.damage.type], consumed: 0 }
    case PRIM_OMEGA:
      return { values: [p.omega.axis, p.omega.spinrate, p.omega.gain], consumed: 0 }
    case PRIM_POINT_LIGHT: {
      const l = p.pointLight
      return { values: [l.enabled ? 1 : 0, l.color, l.intensity, l.radius, l.falloff], consumed: 0 }
    }
    case PRIM_REFLECTION_PROBE: {
      const r = p.reflectionProbe
      return { values: [r.enabled ? 1 : 0, r.ambiance, r.clipDistance, r.flags], consumed: 0 }
    }
    case PRIM_PROJECTOR: {
      const j = p.projector
      return { values: [j.texture, j.fov, j.focus, j.ambiance], consumed: 0 }
    }
    case PRIM_FLEXIBLE: {
      const f = p.flexible
      return {
        values: [f.enabled ? 1 : 0, f.softness, f.gravity, f.friction, f.wind, f.tension, f.force],
        consumed: 0,
      }
    }
    case PRIM_SIT_TARGET: {
      const s = p.sitTarget
      return { values: [s.enabled ? 1 : 0, s.offset, s.rotation], consumed: 0 }
    }
    case PRIM_TYPE:
      return { values: readPrimType(p), consumed: 0 }
    case PRIM_COLOR: {
      const faces = facesOf(rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        if (!inRange(f)) continue
        out.push(p.faces[f]!.color, p.faces[f]!.alpha)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_TEXTURE: {
      const faces = facesOf(rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        if (!inRange(f)) continue
        const fa = p.faces[f]!
        out.push(fa.texture, fa.textureRepeats, fa.textureOffsets, fa.textureRotation)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_RENDER_MATERIAL: {
      const faces = facesOf(rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        if (!inRange(f)) continue
        out.push(p.faces[f]!.renderMaterial)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_FULLBRIGHT: {
      const faces = facesOf(rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        if (!inRange(f)) continue
        out.push(p.faces[f]!.fullBright ? 1 : 0)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_GLOW: {
      const faces = facesOf(rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        if (!inRange(f)) continue
        out.push(p.faces[f]!.glow)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_BUMP_SHINY: {
      const faces = facesOf(rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        if (!inRange(f)) continue
        out.push(p.faces[f]!.bumpShiny.shiny, p.faces[f]!.bumpShiny.bump)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_TEXGEN: {
      const faces = facesOf(rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        if (!inRange(f)) continue
        out.push(p.faces[f]!.texgen)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_NORMAL: {
      const faces = facesOf(rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        if (!inRange(f)) continue
        const n = p.faces[f]!.normal
        out.push(n.texture, n.textureRepeats, n.textureOffsets, n.textureRotation)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_SPECULAR: {
      const faces = facesOf(rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        if (!inRange(f)) continue
        const s = p.faces[f]!.specular
        out.push(s.texture, s.textureRepeats, s.textureOffsets, s.textureRotation, s.color, s.glossiness, s.environment)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_ALPHA_MODE: {
      const faces = facesOf(rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        if (!inRange(f)) continue
        out.push(p.faces[f]!.alphaMode.mode, p.faces[f]!.alphaMode.cutoff)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_GLTF_BASE_COLOR: {
      const faces = facesOf(rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        if (!inRange(f)) continue
        const g = p.faces[f]!.gltf.baseColor
        out.push(g.texture, g.textureRepeats, g.textureOffsets, g.textureRotation, g.color, g.alpha, g.alphaMode, g.alphaCutoff, g.doubleSided)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_GLTF_NORMAL: {
      const faces = facesOf(rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        if (!inRange(f)) continue
        const g = p.faces[f]!.gltf.normal
        out.push(g.texture, g.textureRepeats, g.textureOffsets, g.textureRotation)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_GLTF_METALLIC_ROUGHNESS: {
      const faces = facesOf(rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        if (!inRange(f)) continue
        const g = p.faces[f]!.gltf.metallicRoughness
        out.push(g.texture, g.textureRepeats, g.textureOffsets, g.textureRotation, g.metallic, g.roughness)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_GLTF_EMISSIVE: {
      const faces = facesOf(rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        if (!inRange(f)) continue
        const g = p.faces[f]!.gltf.emissive
        out.push(g.texture, g.textureRepeats, g.textureOffsets, g.textureRotation, g.tint)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_LINK_TARGET:
      return null
    default:
      return null
  }
}

function readPrimType(p: PrimParams): LslValue[] {
  const s = p.shape
  if (s.kind === SHAPE_SPHERE) {
    return [s.kind, s.hole, s.cut, s.hollow, s.twist, s.dimple]
  }
  if (s.kind === SHAPE_TORUS || s.kind === SHAPE_TUBE || s.kind === SHAPE_RING) {
    return [s.kind, s.hole, s.cut, s.hollow, s.twist, s.holeSize, s.topShear, s.advancedCut, s.taper, s.revolutions, s.radiusOffset, s.skew]
  }
  if (s.kind === SHAPE_SCULPT) {
    return [s.kind, s.map, s.type]
  }
  if (s.kind === SHAPE_BOX || s.kind === SHAPE_CYLINDER || s.kind === SHAPE_PRISM) {
    return [s.kind, s.hole, s.cut, s.hollow, s.twist, s.topSize, s.topShear]
  }
  return []
}
