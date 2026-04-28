import type { Vector, Rotation } from './values/types.js'
import { PRIM_PHYSICS_SHAPE_PRIM } from './generated/constants.js'

/**
 * Backing store for the PRIM_* family of llSetPrimitiveParams /
 * llGetPrimitiveParams values. Most fields are placeholders right now —
 * the dispatch seam (`getPrimParam` / `setPrimParam` on Prim) means
 * filling them in is local to this file plus the relevant builtin.
 */
export interface PrimParams {
  position: Vector
  rotation: Rotation
  size: Vector
  /** Per-face slots. LSL uses face index `ALL_SIDES = -1` to mean "every face". */
  faces: PrimFace[]
  pointLight: { enabled: boolean; color: Vector; intensity: number; radius: number; falloff: number }
  glow: number[]
  omega: { axis: Vector; spinrate: number; gain: number }
  physicsShapeType: number
  flexible: { enabled: boolean; softness: number; gravity: number; friction: number; wind: number; tension: number; force: Vector }
  sculpt: { textureKey: string; type: number }
  slice: Vector
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
}

const zero = (): Vector => ({ x: 0, y: 0, z: 0 })
const one = (): Vector => ({ x: 1, y: 1, z: 1 })
const identityRot = (): Rotation => ({ x: 0, y: 0, z: 0, s: 1 })

export function defaultFace(): PrimFace {
  return {
    texture: '',
    textureRepeats: { x: 1, y: 1, z: 0 },
    textureOffsets: zero(),
    textureRotation: 0,
    color: one(),
    alpha: 1,
    bumpShiny: { shiny: 0, bump: 0 },
    fullBright: false,
    glow: 0,
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
    sculpt: { textureKey: '', type: 0 },
    slice: { x: 0, y: 1, z: 0 },
  }
}
