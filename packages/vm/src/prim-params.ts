import {
  CLICK_ACTION_TOUCH,
  OVERRIDE_GLTF_BASE_ALPHA,
  OVERRIDE_GLTF_BASE_ALPHA_MASK,
  OVERRIDE_GLTF_BASE_ALPHA_MODE,
  OVERRIDE_GLTF_BASE_COLOR_FACTOR,
  OVERRIDE_GLTF_BASE_DOUBLE_SIDED,
  OVERRIDE_GLTF_EMISSIVE_FACTOR,
  OVERRIDE_GLTF_METALLIC_FACTOR,
  OVERRIDE_GLTF_ROUGHNESS_FACTOR,
  PRIM_ALPHA_MODE,
  PRIM_ALPHA_MODE_BLEND,
  PRIM_ALPHA_MODE_MASK,
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
  PRIM_GLTF_BASE_COLOR,
  PRIM_GLTF_EMISSIVE,
  PRIM_GLTF_METALLIC_ROUGHNESS,
  PRIM_GLTF_NORMAL,
  PRIM_HEALTH,
  PRIM_HOLE_DEFAULT,
  PRIM_LINK_TARGET,
  PRIM_MATERIAL,
  PRIM_MATERIAL_WOOD,
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
import type { LslType, LslValue, Rotation, Vector } from './values/types.js'
import { NULL_KEY, isRotation, isVector } from './values/types.js'
import { listElementType } from './values/list-types.js'
import { InventoryType } from './inventory.js'
import { truncateUtf8 } from './values/utf8.js'
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
  /** glTF overrides of the render material. An unset texture or value is "". */
  gltf: {
    baseColor: PrimFaceMaterial & { color: Vector | ''; alpha: number | ''; alphaMode: number | ''; alphaCutoff: number | ''; doubleSided: number | '' }
    normal: PrimFaceMaterial
    metallicRoughness: PrimFaceMaterial & { metallic: number | ''; roughness: number | '' }
    emissive: PrimFaceMaterial & { tint: Vector | '' }
  }
}

/**
 * Typed-literal aliases for the PRIM_TYPE_* constants. The
 * generated module exports them as `: number` so TS can't narrow on
 * them; we re-pin them to their literal values here. The `as` assertions
 * are runtime-asserted below so a future upstream renumber would surface as
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
/** Throws unless `shapes` lists PRIM_TYPE_BOX..PRIM_TYPE_SCULPT as 0..7 in order. */
export function assertShapeAliases(shapes: readonly number[]): void {
  if (shapes.length !== 8 || shapes.some((v, i) => v !== i)) {
    throw new Error('PRIM_TYPE_* constants disagree with PrimShape literal aliases')
  }
}
assertShapeAliases([
  SHAPE_BOX, SHAPE_CYLINDER, SHAPE_PRISM, SHAPE_SPHERE,
  SHAPE_TORUS, SHAPE_TUBE, SHAPE_RING, SHAPE_SCULPT,
])

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
    renderMaterial: NULL_KEY,
    normal: { ...defaultFaceMaterial(), texture: NULL_KEY },
    specular: { ...defaultFaceMaterial(), texture: NULL_KEY, color: one(), glossiness: 51, environment: 0 },
    alphaMode: { mode: PRIM_ALPHA_MODE_BLEND, cutoff: 0 },
    gltf: {
      baseColor: { ...defaultFaceMaterial(), color: '', alpha: '', alphaMode: '', alphaCutoff: '', doubleSided: '' },
      normal: defaultFaceMaterial(),
      metallicRoughness: { ...defaultFaceMaterial(), metallic: '', roughness: '' },
      emissive: { ...defaultFaceMaterial(), tint: '' },
    },
  }
}

function clearGltfOverrides(g: PrimFace['gltf']): void {
  g.baseColor = { ...g.baseColor, texture: '', color: '', alpha: '', alphaMode: '', alphaCutoff: '', doubleSided: '' }
  g.normal = { ...g.normal, texture: '' }
  g.metallicRoughness = { ...g.metallicRoughness, texture: '', metallic: '', roughness: '' }
  g.emissive = { ...g.emissive, texture: '', tint: '' }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const findItem = (prim: Prim, type: number, name: string) =>
  prim.inventory.find((it) => it.type === type && it.name === name)

/** The key a render material argument names: "" (none), a key, or a material item's name; null if it names nothing. */
export function renderMaterialKey(prim: Prim, material: string): string | null {
  if (material === '') return NULL_KEY
  if (UUID.test(material)) return material
  return findItem(prim, InventoryType.MATERIAL, material)?.key ?? null
}

export function textureKey(prim: Prim, texture: string): string | null {
  if (texture === '') return NULL_KEY
  if (UUID.test(texture)) return texture
  return findItem(prim, InventoryType.TEXTURE, texture)?.key ?? null
}

const itemName = (prim: Prim, type: number, key: string): string =>
  key === NULL_KEY ? key : (prim.inventory.find((it) => it.type === type && it.key === key)?.name ?? key)

export const textureName = (prim: Prim, key: string): string => itemName(prim, InventoryType.TEXTURE, key)

export const materialName = (prim: Prim, key: string): string => itemName(prim, InventoryType.MATERIAL, key)

const OVERRIDE_TYPES: Readonly<Record<number, LslType>> = {
  [OVERRIDE_GLTF_BASE_COLOR_FACTOR]: 'vector',
  [OVERRIDE_GLTF_BASE_ALPHA]: 'float',
  [OVERRIDE_GLTF_BASE_ALPHA_MODE]: 'integer',
  [OVERRIDE_GLTF_BASE_ALPHA_MASK]: 'float',
  [OVERRIDE_GLTF_BASE_DOUBLE_SIDED]: 'integer',
  [OVERRIDE_GLTF_METALLIC_FACTOR]: 'float',
  [OVERRIDE_GLTF_ROUGHNESS_FACTOR]: 'float',
  [OVERRIDE_GLTF_EMISSIVE_FACTOR]: 'vector',
}

const overrideType = (code: LslValue): LslType | undefined => (typeof code === 'number' ? OVERRIDE_TYPES[code] : undefined)

/**
 * Apply llSetLinkGLTFOverrides' [OVERRIDE_GLTF_*, value, ...] pairs. The base
 * colour and alpha form one factor that "" leaves alone; "" clears the others.
 * One wrong-typed value rejects the whole call; an unknown code is skipped.
 */
export function setGltfOverrides(g: PrimFace['gltf'], params: ReadonlyArray<LslValue>): void {
  for (let i = 0; i + 1 < params.length; i += 2) {
    const expected = overrideType(params[i]!)
    if (expected === undefined || params[i + 1] === '') continue
    const given = givenType(params, i + 1)
    if (given !== expected && !(expected === 'float' && given === 'integer')) return
  }
  const bc = g.baseColor
  for (let i = 0; i + 1 < params.length; i += 2) {
    const v = params[i + 1]!
    const n = typeof v === 'number' ? v : ''
    switch (params[i]) {
      case OVERRIDE_GLTF_BASE_COLOR_FACTOR:
        if (isVector(v)) {
          bc.color = clampVec(asVec(v), 0, 1)
          if (bc.alpha === '') bc.alpha = 1
        }
        break
      case OVERRIDE_GLTF_BASE_ALPHA:
        if (typeof v === 'number') {
          bc.alpha = clamp(v, 0, 1)
          if (bc.color === '') bc.color = one()
        }
        break
      case OVERRIDE_GLTF_BASE_ALPHA_MODE: bc.alphaMode = n === '' ? '' : clamp(n, 0, 2); break
      case OVERRIDE_GLTF_BASE_ALPHA_MASK: bc.alphaCutoff = n === '' ? '' : clamp(n, 0, 1); break
      case OVERRIDE_GLTF_BASE_DOUBLE_SIDED: bc.doubleSided = n === '' ? '' : clamp(n, 0, 1); break
      case OVERRIDE_GLTF_METALLIC_FACTOR: g.metallicRoughness.metallic = n === '' ? '' : clamp(n, 0, 1); break
      case OVERRIDE_GLTF_ROUGHNESS_FACTOR: g.metallicRoughness.roughness = n === '' ? '' : clamp(n, 0, 1); break
      case OVERRIDE_GLTF_EMISSIVE_FACTOR: g.emissive.tint = isVector(v) ? clampVec(asVec(v), 0, 1) : ''; break
    }
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
    pointLight: { enabled: false, color: zero(), intensity: 0, radius: 0, falloff: 0 },
    glow: [0, 0, 0, 0, 0, 0],
    omega: { axis: zero(), spinrate: 0, gain: 0 },
    physicsShapeType: PRIM_PHYSICS_SHAPE_PRIM,
    flexible: { enabled: false, softness: 0, gravity: 0, friction: 0, wind: 0, tension: 0, force: zero() },
    sculpt: { textureKey: '', type: PRIM_SCULPT_TYPE_SPHERE },
    slice: { x: 0, y: 1, z: 0 },
    shape: defaultShape(),
    material: PRIM_MATERIAL_WOOD,
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
    physicsMaterial: { gravityMultiplier: 1, restitution: 0.5, friction: Math.fround(0.6), density: 1000 },
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
const toByteChannel = (c: number): number => Math.floor(Math.min(1, Math.max(0, c)) * 255) / 255
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const clampVec = (v: Vector, lo: number, hi: number): Vector =>
  ({ x: clamp(v.x, lo, hi), y: clamp(v.y, lo, hi), z: clamp(v.z, lo, hi) })

function normalizeRot(r: Rotation): Rotation {
  const mag = Math.hypot(r.x, r.y, r.z, r.s)
  if (mag === 0) return identityRot()
  return { x: r.x / mag, y: r.y / mag, z: r.z / mag, s: r.s / mag }
}

/** Face indexes a face argument names: every face for a negative face, none past the shape's face count. */
export function faceIndices(p: PrimParams, face: number): number[] {
  if (face < 0) return p.faces.map((_, i) => i)
  return face < p.faces.length ? [face] : []
}

const facesOf = (p: PrimParams, faceArg: LslValue | undefined): number[] => faceIndices(p, num(faceArg, 0) | 0)

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
  caller: Prim = prim,
): number | null {
  const p = prim.params
  switch (param) {
    case PRIM_NAME:
      prim.name = truncateUtf8(plainText(str(rules[cursor])), 63)
      return 1
    case PRIM_DESC:
      prim.description = truncateUtf8(plainText(str(rules[cursor])), 127)
      prim.appearance.description = prim.description
      return 1
    case PRIM_TEXT: {
      const text = truncateUtf8(str(rules[cursor]), 254)
      const color = asVec(rules[cursor + 1])
      const alpha = num(rules[cursor + 2], 1)
      const outOfRange = (v: number) => v < 0 || v > 1
      if (outOfRange(alpha) || outOfRange(color.x) || outOfRange(color.y) || outOfRange(color.z)) return 3
      prim.appearance.text = { text, color, alpha }
      return 3
    }
    case PRIM_POSITION:
    case PRIM_POS_LOCAL:
      p.position = asVec(rules[cursor])
      return 1
    case PRIM_ROTATION:
    case PRIM_ROT_LOCAL:
      p.rotation = normalizeRot(asRot(rules[cursor]))
      return 1
    case PRIM_SIZE:
      p.size = clampVec(asVec(rules[cursor]), 0.01, 64)
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
      const faces = facesOf(p, rules[cursor])
      const color = asVec(rules[cursor + 1])
      const alpha = clamp(num(rules[cursor + 2], 1), 0, 1)
      for (const f of faces) {
        p.faces[f]!.color = clampVec(color, 0, 1)
        p.faces[f]!.alpha = alpha
      }
      return 3
    }
    case PRIM_TEXTURE: {
      const faces = facesOf(p, rules[cursor])
      const tex = textureKey(caller, str(rules[cursor + 1])) ?? NULL_KEY
      const repeats = asVec(rules[cursor + 2])
      const offsets = asVec(rules[cursor + 3])
      const rot = num(rules[cursor + 4])
      for (const f of faces) {
        p.faces[f]!.texture = tex
        p.faces[f]!.textureRepeats = { x: repeats.x, y: repeats.y, z: 0 }
        p.faces[f]!.textureOffsets = { x: offsets.x, y: offsets.y, z: 0 }
        p.faces[f]!.textureRotation = rot
      }
      return 5
    }
    case PRIM_RENDER_MATERIAL: {
      const faces = facesOf(p, rules[cursor])
      const m = renderMaterialKey(caller, str(rules[cursor + 1])) ?? NULL_KEY
      for (const f of faces) {
        p.faces[f]!.renderMaterial = m
        clearGltfOverrides(p.faces[f]!.gltf)
      }
      return 2
    }
    case PRIM_FULLBRIGHT: {
      const faces = facesOf(p, rules[cursor])
      const raw = num(rules[cursor + 1])
      if (raw !== 0 && raw !== 1) return 2
      const v = raw === 1
      for (const f of faces) {
        p.faces[f]!.fullBright = v
      }
      return 2
    }
    case PRIM_GLOW: {
      const faces = facesOf(p, rules[cursor])
      const v = num(rules[cursor + 1])
      for (const f of faces) {
        p.faces[f]!.glow = v
        p.glow[f] = v
      }
      return 2
    }
    case PRIM_BUMP_SHINY: {
      const faces = facesOf(p, rules[cursor])
      const shiny = num(rules[cursor + 1]) | 0
      const bump = num(rules[cursor + 2]) | 0
      if (shiny < 0 || shiny > 3 || bump < 0 || bump > 17) return 3
      for (const f of faces) {
        p.faces[f]!.bumpShiny = { shiny, bump }
      }
      return 3
    }
    case PRIM_TEXGEN: {
      const faces = facesOf(p, rules[cursor])
      const mode = num(rules[cursor + 1]) | 0
      if (mode < 0 || mode > 1) return 2
      for (const f of faces) {
        p.faces[f]!.texgen = mode
      }
      return 2
    }
    case PRIM_NORMAL: {
      const faces = facesOf(p, rules[cursor])
      const tex = str(rules[cursor + 1])
      const key = textureKey(caller, tex) ?? NULL_KEY
      const repeats = tex === '' ? { x: 1, y: 1, z: 0 } : asVec(rules[cursor + 2])
      const offsets = tex === '' ? zero() : asVec(rules[cursor + 3])
      const rot = tex === '' ? 0 : num(rules[cursor + 4])
      for (const f of faces) {
        p.faces[f]!.normal = {
          texture: key,
          textureRepeats: { x: repeats.x, y: repeats.y, z: repeats.z },
          textureOffsets: { x: offsets.x, y: offsets.y, z: offsets.z },
          textureRotation: rot,
        }
      }
      return 5
    }
    case PRIM_SPECULAR: {
      const faces = facesOf(p, rules[cursor])
      const tex = str(rules[cursor + 1])
      const key = textureKey(caller, tex) ?? NULL_KEY
      const reset = tex === ''
      const repeats = reset ? { x: 1, y: 1, z: 0 } : asVec(rules[cursor + 2])
      const offsets = reset ? zero() : asVec(rules[cursor + 3])
      const rot = reset ? 0 : num(rules[cursor + 4])
      const color = reset ? one() : asVec(rules[cursor + 5])
      const gloss = reset ? 51 : clamp(num(rules[cursor + 6]) | 0, 0, 255)
      const env = reset ? 0 : clamp(num(rules[cursor + 7]) | 0, 0, 255)
      for (const f of faces) {
        p.faces[f]!.specular = {
          texture: key,
          textureRepeats: { x: repeats.x, y: repeats.y, z: repeats.z },
          textureOffsets: { x: offsets.x, y: offsets.y, z: offsets.z },
          // Second Life stores a negative rotation as 0 and the colour in 8 bits per channel
          textureRotation: Math.max(0, rot),
          color: { x: toByteChannel(color.x), y: toByteChannel(color.y), z: toByteChannel(color.z) },
          glossiness: gloss,
          environment: env,
        }
      }
      return 8
    }
    case PRIM_ALPHA_MODE: {
      const faces = facesOf(p, rules[cursor])
      const mode = clamp(num(rules[cursor + 1]) | 0, 0, 3)
      const cutoff = mode === PRIM_ALPHA_MODE_MASK ? clamp(num(rules[cursor + 2]) | 0, 0, 255) : 0
      for (const f of faces) {
        p.faces[f]!.alphaMode = { mode, cutoff }
      }
      return 3
    }
    case PRIM_GLTF_BASE_COLOR: {
      const color = rules[cursor + 5]
      const alpha = rules[cursor + 6]
      const factor = color !== '' || alpha !== ''
      writeGltf(prim, caller, rules, cursor, 'baseColor', {
        color: factor ? (color === '' ? one() : clampVec(asVec(color), 0, 1)) : '',
        alpha: factor ? clamp(num(alpha, 1), 0, 1) : '',
        alphaMode: valueOverride(rules[cursor + 7], (v) => clamp(num(v) | 0, 0, 2)),
        alphaCutoff: valueOverride(rules[cursor + 8], (v) => clamp(num(v), 0, 1)),
        doubleSided: valueOverride(rules[cursor + 9], (v) => clamp(num(v) | 0, 0, 1)),
      })
      return 10
    }
    case PRIM_GLTF_NORMAL:
      writeGltf(prim, caller, rules, cursor, 'normal', {})
      return 5
    case PRIM_GLTF_METALLIC_ROUGHNESS:
      writeGltf(prim, caller, rules, cursor, 'metallicRoughness', {
        metallic: valueOverride(rules[cursor + 5], (v) => clamp(num(v), 0, 1)),
        roughness: valueOverride(rules[cursor + 6], (v) => clamp(num(v), 0, 1)),
      })
      return 7
    case PRIM_GLTF_EMISSIVE:
      writeGltf(prim, caller, rules, cursor, 'emissive', { tint: valueOverride(rules[cursor + 5], (v) => clampVec(asVec(v), 0, 1)) })
      return 6
    case PRIM_LINK_TARGET:
      return null
    default:
      return null
  }
}

const valueOverride = <T>(v: LslValue | undefined, read: (v: LslValue | undefined) => T): T | '' => (v === '' ? '' : read(v))

/**
 * Write one PRIM_GLTF_* rule. "" in a transform slot resets it; "" in a texture
 * or value slot unsets that override. Faces without a render material keep
 * only the transforms.
 */
function writeGltf<K extends keyof PrimFace['gltf']>(
  prim: Prim,
  caller: Prim,
  rules: ReadonlyArray<LslValue>,
  cursor: number,
  rule: K,
  values: Omit<PrimFace['gltf'][K], keyof PrimFaceMaterial>,
): void {
  const transform = {
    textureRepeats: rules[cursor + 2] === '' ? { x: 1, y: 1, z: 0 } : asVec(rules[cursor + 2]),
    textureOffsets: asVec(rules[cursor + 3]),
    textureRotation: num(rules[cursor + 4]),
  }
  const name = str(rules[cursor + 1])
  const texture = name === '' ? '' : (textureKey(caller, name) ?? NULL_KEY)
  for (const f of facesOf(prim.params, rules[cursor])) {
    const face = prim.params.faces[f]!
    const overrides = face.renderMaterial === NULL_KEY ? {} : { texture, ...values }
    face.gltf[rule] = { ...face.gltf[rule], ...transform, ...overrides }
  }
}

/** Names and descriptions can't hold the separator characters; they become `?`. */
const plainText = (s: string): string => s.replace(/[|\n]/g, '?')

function writePrimType(p: PrimParams, rules: ReadonlyArray<LslValue>, cursor: number): number | null {
  const kind = (num(rules[cursor]) | 0)
  const old = p.shape
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
      break
    case SHAPE_SPHERE:
      p.shape = {
        kind: SHAPE_SPHERE,
        hole: num(rules[cursor + 1]) | 0,
        cut: asVec(rules[cursor + 2]),
        hollow: num(rules[cursor + 3]),
        twist: asVec(rules[cursor + 4]),
        dimple: asVec(rules[cursor + 5]),
      }
      break
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
      break
    case SHAPE_SCULPT:
      p.shape = {
        kind: SHAPE_SCULPT,
        map: str(rules[cursor + 1]),
        type: num(rules[cursor + 2]) | 0,
      }
      break
    default:
      // Unknown PRIM_TYPE_* kind: terminate the walk rather than guessing
      // a slot count. Matches writePrimParamSlots' default behavior so
      // walkSet handles both target-bearing and empty-target cases the
      // same way.
      return null
  }
  remapFaces(p, old)
  return writePrimParamSlots(PRIM_TYPE, rules, cursor)
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
      return { values: t ? [t.text, t.color, t.alpha] : ['', zero(), 1], consumed: 0 }
    }
    case PRIM_POSITION:
      return { values: [prim.regionPosition()], consumed: 0 }
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
      const faces = facesOf(p, rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        out.push(p.faces[f]!.color, p.faces[f]!.alpha)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_TEXTURE: {
      const faces = facesOf(p, rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        const fa = p.faces[f]!
        out.push(textureName(prim, fa.texture), fa.textureRepeats, fa.textureOffsets, fa.textureRotation)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_RENDER_MATERIAL: {
      const faces = facesOf(p, rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        out.push(materialName(prim, p.faces[f]!.renderMaterial))
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_FULLBRIGHT: {
      const faces = facesOf(p, rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        out.push(p.faces[f]!.fullBright ? 1 : 0)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_GLOW: {
      const faces = facesOf(p, rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        out.push(p.faces[f]!.glow)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_BUMP_SHINY: {
      const faces = facesOf(p, rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        out.push(p.faces[f]!.bumpShiny.shiny, p.faces[f]!.bumpShiny.bump)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_TEXGEN: {
      const faces = facesOf(p, rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        out.push(p.faces[f]!.texgen)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_NORMAL: {
      const faces = facesOf(p, rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        const n = p.faces[f]!.normal
        out.push(textureName(prim, n.texture), n.textureRepeats, n.textureOffsets, n.textureRotation)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_SPECULAR: {
      const faces = facesOf(p, rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        const s = p.faces[f]!.specular
        out.push(textureName(prim, s.texture), s.textureRepeats, s.textureOffsets, s.textureRotation, s.color, s.glossiness, s.environment)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_ALPHA_MODE: {
      const faces = facesOf(p, rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        out.push(p.faces[f]!.alphaMode.mode, p.faces[f]!.alphaMode.cutoff)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_GLTF_BASE_COLOR: {
      const faces = facesOf(p, rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        const g = p.faces[f]!.gltf.baseColor
        out.push(g.texture, g.textureRepeats, g.textureOffsets, g.textureRotation, g.color, g.alpha, g.alphaMode, g.alphaCutoff, g.doubleSided)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_GLTF_NORMAL: {
      const faces = facesOf(p, rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        const g = p.faces[f]!.gltf.normal
        out.push(g.texture, g.textureRepeats, g.textureOffsets, g.textureRotation)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_GLTF_METALLIC_ROUGHNESS: {
      const faces = facesOf(p, rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
        const g = p.faces[f]!.gltf.metallicRoughness
        out.push(g.texture, g.textureRepeats, g.textureOffsets, g.textureRotation, g.metallic, g.roughness)
      }
      return { values: out, consumed: 1 }
    }
    case PRIM_GLTF_EMISSIVE: {
      const faces = facesOf(p, rules[cursor])
      const out: LslValue[] = []
      for (const f of faces) {
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

const MATERIAL_TYPES: ReadonlyArray<LslType> = ['string', 'vector', 'vector', 'float']
const MAP_TYPES: ReadonlyArray<LslType> = ['key', 'vector', 'vector', 'float']

/**
 * LSL types of the values each PRIM_* rule reads. Per-face rules list one
 * face's values; the pattern repeats for each face.
 */
const PRIM_PARAM_TYPES: Readonly<Record<number, ReadonlyArray<LslType>>> = {
  [PRIM_NAME]: ['string'],
  [PRIM_DESC]: ['string'],
  [PRIM_TEXT]: ['string', 'vector', 'float'],
  [PRIM_POSITION]: ['vector'],
  [PRIM_POS_LOCAL]: ['vector'],
  [PRIM_ROTATION]: ['rotation'],
  [PRIM_ROT_LOCAL]: ['rotation'],
  [PRIM_SIZE]: ['vector'],
  [PRIM_SLICE]: ['vector'],
  [PRIM_MATERIAL]: ['integer'],
  [PRIM_PHYSICS]: ['integer'],
  [PRIM_PHANTOM]: ['integer'],
  [PRIM_TEMP_ON_REZ]: ['integer'],
  [PRIM_PHYSICS_SHAPE_TYPE]: ['integer'],
  [PRIM_CAST_SHADOWS]: ['integer'],
  [PRIM_ALLOW_UNSIT]: ['integer'],
  [PRIM_SCRIPTED_SIT_ONLY]: ['integer'],
  [PRIM_SIT_FLAGS]: ['integer'],
  [PRIM_CLICK_ACTION]: ['integer'],
  [PRIM_HEALTH]: ['float'],
  [PRIM_DAMAGE]: ['float', 'integer'],
  [PRIM_OMEGA]: ['vector', 'float', 'float'],
  [PRIM_POINT_LIGHT]: ['integer', 'vector', 'float', 'float', 'float'],
  [PRIM_REFLECTION_PROBE]: ['integer', 'float', 'float', 'integer'],
  [PRIM_PROJECTOR]: ['string', 'float', 'float', 'float'],
  [PRIM_FLEXIBLE]: ['integer', 'integer', 'float', 'float', 'float', 'float', 'vector'],
  [PRIM_SIT_TARGET]: ['integer', 'vector', 'rotation'],
  [PRIM_COLOR]: ['vector', 'float'],
  [PRIM_TEXTURE]: MATERIAL_TYPES,
  [PRIM_RENDER_MATERIAL]: ['string'],
  [PRIM_FULLBRIGHT]: ['integer'],
  [PRIM_GLOW]: ['float'],
  [PRIM_BUMP_SHINY]: ['integer', 'integer'],
  [PRIM_TEXGEN]: ['integer'],
  [PRIM_NORMAL]: MAP_TYPES,
  [PRIM_SPECULAR]: [...MAP_TYPES, 'vector', 'integer', 'integer'],
  [PRIM_ALPHA_MODE]: ['integer', 'integer'],
  [PRIM_GLTF_BASE_COLOR]: [...MAP_TYPES, 'vector', 'float', 'integer', 'float', 'integer'],
  [PRIM_GLTF_NORMAL]: MAP_TYPES,
  [PRIM_GLTF_METALLIC_ROUGHNESS]: [...MAP_TYPES, 'float', 'float'],
  [PRIM_GLTF_EMISSIVE]: [...MAP_TYPES, 'vector'],
}

/** LSL types of PRIM_TYPE's values, which depend on the shape. */
function primTypeTypes(kind: LslValue | undefined): ReadonlyArray<LslType> {
  if (kind === SHAPE_SCULPT) return ['integer', 'string', 'integer']
  const common: LslType[] = ['integer', 'integer', 'vector', 'float', 'vector']
  if (kind === SHAPE_SPHERE) return [...common, 'vector']
  if (kind === SHAPE_TORUS || kind === SHAPE_TUBE || kind === SHAPE_RING) {
    return [...common, 'vector', 'vector', 'vector', 'vector', 'float', 'float', 'float']
  }
  return [...common, 'vector', 'vector']
}

/** GLTF override rules take "" in any slot after the face to mean "no override", and read an unset one as "". */
const GLTF_RULES = new Set([PRIM_GLTF_BASE_COLOR, PRIM_GLTF_NORMAL, PRIM_GLTF_METALLIC_ROUGHNESS, PRIM_GLTF_EMISSIVE])

/** LSL types of the values `readPrimParam` returns for `param`. */
export function primParamTypes(param: number, values: ReadonlyArray<LslValue>): Array<LslType | undefined> {
  const pattern = param === PRIM_TYPE ? primTypeTypes(values[0]) : (PRIM_PARAM_TYPES[param] ?? [])
  return values.map((v, i) => (GLTF_RULES.has(param) && v === '' ? 'string' : pattern[i % pattern.length]))
}

const PER_FACE_RULES: ReadonlySet<number> = new Set([
  PRIM_COLOR, PRIM_TEXTURE, PRIM_RENDER_MATERIAL, PRIM_FULLBRIGHT, PRIM_GLOW, PRIM_BUMP_SHINY,
  PRIM_TEXGEN, PRIM_NORMAL, PRIM_SPECULAR, PRIM_ALPHA_MODE, PRIM_GLTF_BASE_COLOR,
  PRIM_GLTF_NORMAL, PRIM_GLTF_METALLIC_ROUGHNESS, PRIM_GLTF_EMISSIVE,
])

const RULE_CONSTANTS: Readonly<Record<string, number>> = {
  PRIM_NAME, PRIM_DESC, PRIM_TEXT, PRIM_POSITION, PRIM_POS_LOCAL, PRIM_ROTATION, PRIM_ROT_LOCAL,
  PRIM_SIZE, PRIM_SLICE, PRIM_MATERIAL, PRIM_PHYSICS, PRIM_PHANTOM, PRIM_TEMP_ON_REZ,
  PRIM_PHYSICS_SHAPE_TYPE, PRIM_CAST_SHADOWS, PRIM_ALLOW_UNSIT, PRIM_SCRIPTED_SIT_ONLY,
  PRIM_SIT_FLAGS, PRIM_CLICK_ACTION, PRIM_HEALTH, PRIM_DAMAGE, PRIM_OMEGA, PRIM_POINT_LIGHT,
  PRIM_REFLECTION_PROBE, PRIM_PROJECTOR, PRIM_FLEXIBLE, PRIM_SIT_TARGET, PRIM_TYPE, PRIM_COLOR,
  PRIM_TEXTURE, PRIM_RENDER_MATERIAL, PRIM_FULLBRIGHT, PRIM_GLOW, PRIM_BUMP_SHINY, PRIM_TEXGEN,
  PRIM_NORMAL, PRIM_SPECULAR, PRIM_ALPHA_MODE, PRIM_GLTF_BASE_COLOR, PRIM_GLTF_NORMAL,
  PRIM_GLTF_METALLIC_ROUGHNESS, PRIM_GLTF_EMISSIVE,
}
const RULE_NAMES = new Map(Object.entries(RULE_CONSTANTS).map(([name, value]) => [value, name]))

function givenType(rules: ReadonlyArray<LslValue>, index: number): LslType {
  const known = listElementType(rules, index)
  if (known) return known
  const v = rules[index]!
  if (typeof v === 'string') return 'string'
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'float'
  if (isRotation(v)) return 'rotation'
  if (isVector(v)) return 'vector'
  return 'list'
}

function typeAccepts(expected: LslType, given: LslType): boolean {
  if (expected === given) return true
  const numeric = (t: LslType) => t === 'integer' || t === 'float'
  const text = (t: LslType) => t === 'string' || t === 'key'
  return (numeric(expected) && numeric(given)) || (text(expected) && text(given))
}

/** `%g`-style number text, as the simulator prints it in error messages. */
const formatG = (v: number): string => String(Number(v.toPrecision(6)))

/**
 * Check one PRIM_* rule of a set call before it is applied. Returns null if
 * the rule can run, otherwise the error text that follows "rule #N" in the
 * simulator's message (e.g. " (PRIM_SIZE): arg #1 vector expected but string given").
 */
export function checkPrimRule(param: number, rules: ReadonlyArray<LslValue>, cursor: number): string | null {
  const name = RULE_NAMES.get(param)
  if (name === undefined) return ': unknown rule'
  if (writePrimParamSlots(param, rules, cursor) === null) return param === PRIM_TYPE ? null : ': unknown rule'
  const pattern = param === PRIM_TYPE ? primTypeTypes(rules[cursor]) : PRIM_PARAM_TYPES[param]!
  const expected = PER_FACE_RULES.has(param) ? ['integer' as const, ...pattern] : pattern
  for (let i = 0; i < expected.length; i++) {
    if (cursor + i >= rules.length) break
    if (i > 0 && GLTF_RULES.has(param) && rules[cursor + i] === '') continue
    const given = givenType(rules, cursor + i)
    if (!typeAccepts(expected[i]!, given)) {
      return ` (${name}): arg #${i + 1} ${expected[i]} expected but ${given} given`
    }
  }
  if (param === PRIM_GLOW) {
    const glow = num(rules[cursor + 1])
    if (glow < 0 || glow > 1) return ` (${name}): bounds error; ${formatG(glow)} is not in (0, 1)`
  }
  return null
}

/**
 * What a face is on its shape: a path end (top / bottom), the hollow's inner
 * face, one of the two profile-cut faces, or an outer profile side covering
 * `[from, to]` of the profile. Faces are numbered top, outer sides, inner,
 * bottom, cut faces, as measured on a box in Second Life.
 */
type FaceRole = 'top' | 'inner' | 'bottom' | 'cutStart' | 'cutEnd' | { from: number; to: number }

const PROFILE_SIDES: Readonly<Record<number, number>> = {
  [SHAPE_BOX]: 4, [SHAPE_CYLINDER]: 1, [SHAPE_PRISM]: 3, [SHAPE_SPHERE]: 1,
  [SHAPE_TORUS]: 1, [SHAPE_TUBE]: 4, [SHAPE_RING]: 3,
}

const isCut = (range: Vector): boolean => range.x > 0 || range.y < 1

function faceRoles(shape: PrimShape): FaceRole[] {
  if (shape.kind === SHAPE_SCULPT) return [{ from: 0, to: 1 }]
  const looped = shape.kind === SHAPE_TORUS || shape.kind === SHAPE_TUBE || shape.kind === SHAPE_RING
  const profileCut = looped ? shape.advancedCut : shape.cut
  const pathEnds = shape.kind === SHAPE_SPHERE
    ? isCut(shape.dimple) || shape.hollow > 0
    : !looped || isCut(shape.cut)
  const sides = PROFILE_SIDES[shape.kind]!
  const roles: FaceRole[] = pathEnds ? ['top'] : []
  for (let i = 0; i < sides; i++) {
    const from = i / sides, to = (i + 1) / sides
    if (from < profileCut.y && to > profileCut.x) roles.push({ from, to })
  }
  if (shape.hollow > 0) roles.push('inner')
  if (pathEnds) roles.push('bottom')
  if (isCut(profileCut)) roles.push('cutStart', 'cutEnd')
  return roles
}

/**
 * Rebuild the face slots for a new shape. A face keeps the values of the old
 * face with the same role; an outer side takes the first old outer side it
 * overlaps, else the nearest one; any other new face copies the old last face.
 */
function remapFaces(p: PrimParams, oldShape: PrimShape): void {
  const oldRoles = faceRoles(oldShape)
  const old = p.faces
  const last = old[old.length - 1]!
  const oldOuter = oldRoles.flatMap((r, i) => (typeof r === 'string' ? [] : [{ ...r, face: old[i]! }]))
  const source = (role: FaceRole): PrimFace => {
    if (typeof role === 'string') return old[oldRoles.indexOf(role)] ?? last
    const gap = (o: { from: number; to: number }) => Math.max(o.from - role.to, role.from - o.to)
    const overlap = oldOuter.find((o) => gap(o) < 0)
    if (overlap) return overlap.face
    const nearest = oldOuter.reduce<(typeof oldOuter)[number] | undefined>((a, o) => (!a || gap(o) < gap(a) ? o : a), undefined)
    return nearest?.face ?? last
  }
  p.faces = faceRoles(p.shape).map((role) => structuredClone(source(role)))
  p.glow = p.faces.map((f) => f.glow)
}

/** Face count of a prim shape, as llGetNumberOfSides reports it. */
export function numberOfSides(shape: PrimShape): number {
  return faceRoles(shape).length
}
