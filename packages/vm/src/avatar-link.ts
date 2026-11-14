import type { WorldAvatar } from './world.js'
import type { LslValue, Rotation, Vector } from './values/types.js'
import { ZERO_ROTATION, ZERO_VECTOR } from './values/types.js'
import { mulRotation } from './values/ops.js'
import { normalizeRot } from './prim-params.js'
import {
  PRIM_ALLOW_UNSIT, PRIM_CLICK_ACTION, PRIM_DAMAGE, PRIM_DESC, PRIM_FLEXIBLE, PRIM_HEALTH, PRIM_MATERIAL,
  PRIM_NAME, PRIM_OMEGA, PRIM_PHANTOM, PRIM_PHYSICS, PRIM_PHYSICS_SHAPE_TYPE, PRIM_POINT_LIGHT, PRIM_POSITION,
  PRIM_POS_LOCAL, PRIM_REFLECTION_PROBE, PRIM_ROTATION, PRIM_ROT_LOCAL, PRIM_SCRIPTED_SIT_ONLY, PRIM_SIT_FLAGS,
  PRIM_SIT_TARGET, PRIM_SIZE, PRIM_SLICE, PRIM_TEMP_ON_REZ, PRIM_TEXT, PRIM_TYPE,
} from './generated/constants.js'

/**
 * What an avatar link reads for the rules that describe a prim. Measured on
 * a seated avatar: it reads like an unset box of flesh that allows unsitting.
 */
const FIXED: Readonly<Record<number, () => LslValue[]>> = {
  [PRIM_DESC]: () => [''],
  [PRIM_TEXT]: () => ['', ZERO_VECTOR, 1],
  [PRIM_TYPE]: () => [0, 0, { x: 0, y: 1, z: 0 }, 0, ZERO_VECTOR, { x: 1, y: 1, z: 0 }, ZERO_VECTOR],
  [PRIM_SLICE]: () => [{ x: 0, y: 1, z: 0 }],
  [PRIM_MATERIAL]: () => [4],
  [PRIM_PHYSICS]: () => [0],
  [PRIM_PHANTOM]: () => [0],
  [PRIM_TEMP_ON_REZ]: () => [0],
  [PRIM_PHYSICS_SHAPE_TYPE]: () => [0],
  [PRIM_CLICK_ACTION]: () => [0],
  [PRIM_ALLOW_UNSIT]: () => [1],
  [PRIM_SCRIPTED_SIT_ONLY]: () => [0],
  [PRIM_SIT_FLAGS]: () => [2],
  [PRIM_SIT_TARGET]: () => [0, ZERO_VECTOR, ZERO_ROTATION],
  [PRIM_OMEGA]: () => [ZERO_VECTOR, 0, 0],
  [PRIM_POINT_LIGHT]: () => [0, ZERO_VECTOR, 0, 0, 0],
  [PRIM_FLEXIBLE]: () => [0, 0, 0, 0, 0, 0, ZERO_VECTOR],
  [PRIM_REFLECTION_PROBE]: () => [0, 0, 0, 0],
  [PRIM_HEALTH]: () => [0],
  [PRIM_DAMAGE]: () => [0, 0],
}

/**
 * Read one PRIM_* rule from a seated avatar's link. Null stops the walk:
 * the rules that take a face, and the ones an avatar has no value for.
 */
export function readAvatarLinkParam(avatar: WorldAvatar, param: number): LslValue[] | null {
  switch (param) {
    case PRIM_NAME: return [avatar.name]
    case PRIM_SIZE: return [avatar.size]
    case PRIM_POSITION: return [avatar.position]
    case PRIM_ROTATION: return [avatar.rotation]
    case PRIM_POS_LOCAL: return [avatar.sitPlacement!.position]
    case PRIM_ROT_LOCAL: return [avatar.sitPlacement!.rotation]
    default: return FIXED[param]?.() ?? null
  }
}

const isVector = (v: LslValue | undefined): v is Vector =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && 'x' in v && !('s' in v)
const isRotation = (v: LslValue | undefined): v is Rotation =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && 's' in v

/**
 * Apply one PRIM_* rule to a seated avatar's link. Only the four position
 * and rotation rules move the sitter. Any other rule, and a rule whose
 * argument is missing, changes nothing and returns null, which ends the walk.
 */
export function writeAvatarLinkParam(avatar: WorldAvatar, param: number, value: LslValue | undefined): number | null {
  const placed = avatar.sitPlacement!
  switch (param) {
    case PRIM_POSITION:
    case PRIM_POS_LOCAL:
      if (!isVector(value)) return null
      avatar.sitPlacement = { ...placed, position: value }
      return 1
    case PRIM_ROT_LOCAL:
      if (!isRotation(value)) return null
      avatar.sitPlacement = { ...placed, rotation: normalizeRot(value) }
      return 1
    case PRIM_ROTATION: {
      if (!isRotation(value)) return null
      // As for a child prim: a rotation equal to the local one changes nothing,
      // and any other is taken times the root's.
      const same = (['x', 'y', 'z', 's'] as const).every((k) => Math.fround(value[k]) === Math.fround(placed.rotation[k]))
      const root = avatar.sittingOn!.linkset!.prims[0]!
      if (!same) avatar.sitPlacement = { ...placed, rotation: normalizeRot(mulRotation(normalizeRot(value), root.params.rotation)) }
      return 1
    }
    default:
      return null
  }
}
