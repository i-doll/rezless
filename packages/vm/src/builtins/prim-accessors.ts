import type { BuiltinImpl } from '../runtime.js'
import type { LslValue, Vector, Rotation } from '../values/types.js'
import { NULL_KEY, ZERO_VECTOR, ZERO_ROTATION } from '../values/types.js'
import { faceIndices, numberOfSides, renderMaterialKey, setGltfOverrides, textureKey } from '../prim-params.js'
import { sayError } from './debug.js'
import { uniformList } from '../values/list-types.js'
import type { Prim } from '../prim.js'
import type { Linkset } from '../linkset.js'
import {
  ALL_SIDES,
  DENSITY,
  FRICTION,
  GRAVITY_MULTIPLIER,
  PRIM_CLICK_ACTION,
  PRIM_OMEGA,
  PRIM_POSITION,
  PRIM_RENDER_MATERIAL,
  PRIM_ROTATION,
  PRIM_ROT_LOCAL,
  PRIM_SIT_FLAGS,
  PRIM_SIT_TARGET,
  PRIM_SIZE,
  RESTITUTION,
} from '../generated/constants.js'

/* ------------------------------------------------------------------ */
/*  helpers                                                            */
/* ------------------------------------------------------------------ */

const num = (v: LslValue | undefined, d = 0): number => (typeof v === 'number' ? v : d)
const str = (v: LslValue | undefined, d = ''): string => (typeof v === 'string' ? v : d)
const vecOf = (v: LslValue | undefined): Vector =>
  v && typeof v === 'object' && !Array.isArray(v) && 'x' in v && 'y' in v && 'z' in v && !('s' in v)
    ? (v as Vector)
    : ZERO_VECTOR
const rotOf = (v: LslValue | undefined): Rotation =>
  v && typeof v === 'object' && !Array.isArray(v) && 's' in v ? (v as Rotation) : ZERO_ROTATION

const hasFace = (prim: Prim, face: number): boolean => face >= 0 && face < prim.params.faces.length

function targets(linkset: Linkset, sender: number, link: number): Prim[] {
  return linkset.resolveTargets(sender, link)
}

/* ------------------------------------------------------------------ */
/*  Position / rotation / scale                                        */
/* ------------------------------------------------------------------ */

/** How far an unattached root prim moves per llSetPos call; child prims are not capped. */
const MAX_SET_POS_DISTANCE = 10

export const llSetPos: BuiltinImpl = (ctx, args) => {
  const target = vecOf(args[0])
  const from = ctx.prim.params.position
  const dx = target.x - from.x, dy = target.y - from.y, dz = target.z - from.z
  const dist = Math.hypot(dx, dy, dz)
  const isChild = ctx.prim.linkNumber > 1
  const k = !isChild && dist > MAX_SET_POS_DISTANCE ? MAX_SET_POS_DISTANCE / dist : 1
  ctx.prim.setPrimParam(PRIM_POSITION, [{ x: from.x + dx * k, y: from.y + dy * k, z: from.z + dz * k }], 0)
  return undefined
}

export const llGetPos: BuiltinImpl = (ctx) => ctx.prim.regionPosition()
export const llGetLocalPos: BuiltinImpl = (ctx) => ctx.prim.params.position
export const llGetRootPosition: BuiltinImpl = (ctx) => {
  const root = ctx.linkset.prims[0] ?? ctx.prim
  return root.params.position
}

export const llSetRot: BuiltinImpl = (ctx, args) => {
  ctx.prim.setPrimParam(PRIM_ROTATION, [rotOf(args[0])], 0)
  return undefined
}
export const llSetLocalRot: BuiltinImpl = (ctx, args) => {
  ctx.prim.setPrimParam(PRIM_ROT_LOCAL, [rotOf(args[0])], 0)
  return undefined
}
export const llGetRot: BuiltinImpl = (ctx) => ctx.prim.params.rotation
export const llGetLocalRot: BuiltinImpl = (ctx) => ctx.prim.params.rotation
export const llGetRootRotation: BuiltinImpl = (ctx) => {
  const root = ctx.linkset.prims[0] ?? ctx.prim
  return root.params.rotation
}

export const llSetScale: BuiltinImpl = (ctx, args) => {
  ctx.prim.setPrimParam(PRIM_SIZE, [vecOf(args[0])], 0)
  return undefined
}
export const llGetScale: BuiltinImpl = (ctx) => ctx.prim.params.size

export const llScaleByFactor: BuiltinImpl = (ctx, args) => {
  const factor = num(args[0], 1)
  if (!Number.isFinite(factor) || factor <= 0) return 0
  for (const p of ctx.linkset.prims) {
    const s = p.params.size
    p.params.size = { x: s.x * factor, y: s.y * factor, z: s.z * factor }
  }
  return 1
}
export const llGetMaxScaleFactor: BuiltinImpl = (ctx) => {
  const prims = ctx.linkset.prims
  const sizes = prims.map((p) => Math.max(p.params.size.x, p.params.size.y, p.params.size.z))
  const offsets = prims.slice(1).map(({ params: { position: v } }) => Math.hypot(v.x, v.y, v.z))
  return 64 / Math.max(...sizes, ...offsets)
}
export const llGetMinScaleFactor: BuiltinImpl = (ctx) =>
  Math.max(...ctx.linkset.prims.map((p) => 0.01 / Math.min(p.params.size.x, p.params.size.y, p.params.size.z)))
export const llGetNumberOfSides: BuiltinImpl = (ctx) => numberOfSides(ctx.prim.params.shape)

/* ------------------------------------------------------------------ */
/*  Color / alpha / texture                                            */
/* ------------------------------------------------------------------ */

export const llSetColor: BuiltinImpl = (ctx, args) => {
  const color = vecOf(args[0])
  const face = num(args[1], ALL_SIDES) | 0
  // Preserve current alpha when only color is set. Clone per face so
  // faces don't alias the same vector instance.
  const clone = () => ({ x: color.x, y: color.y, z: color.z })
  for (const f of faceIndices(ctx.prim.params, face)) ctx.prim.params.faces[f]!.color = clone()
  return undefined
}
export const llGetColor: BuiltinImpl = (ctx, args) => {
  const face = num(args[0], 0) | 0
  if (face < 0) {
    const faces = ctx.prim.params.faces
    let x = 0, y = 0, z = 0
    for (const { color: c } of faces) {
      x += c.x; y += c.y; z += c.z
    }
    return { x: x / faces.length, y: y / faces.length, z: z / faces.length }
  }
  if (face >= ctx.prim.params.faces.length) return { x: 1, y: 1, z: 1 }
  return ctx.prim.params.faces[face]!.color
}

export const llSetAlpha: BuiltinImpl = (ctx, args) => {
  const alpha = num(args[0], 1)
  const face = num(args[1], ALL_SIDES) | 0
  for (const f of faceIndices(ctx.prim.params, face)) ctx.prim.params.faces[f]!.alpha = alpha
  return undefined
}
export const llGetAlpha: BuiltinImpl = (ctx, args) => {
  const face = num(args[0], 0) | 0
  if (face < 0) {
    let a = 0
    for (const f of ctx.prim.params.faces) a += f.alpha
    return a
  }
  if (face >= ctx.prim.params.faces.length) return 1
  return ctx.prim.params.faces[face]!.alpha
}

export const llSetTexture: BuiltinImpl = (ctx, args) => {
  const name = str(args[0])
  const face = num(args[1], ALL_SIDES) | 0
  const key = textureKey(ctx.prim, name)
  if (key === null || key === NULL_KEY) {
    sayError(ctx, `Could not find texture '${name}'.`)
    return undefined
  }
  for (const f of faceIndices(ctx.prim.params, face)) ctx.prim.params.faces[f]!.texture = key
  return undefined
}
export const llGetTexture: BuiltinImpl = (ctx, args) => {
  const face = Math.max(0, num(args[0], 0) | 0)
  if (!hasFace(ctx.prim, face)) return NULL_KEY
  return ctx.prim.params.faces[face]!.texture
}
export const llGetTextureOffset: BuiltinImpl = (ctx, args) => {
  const face = num(args[0], 0) | 0
  if (!hasFace(ctx.prim, face)) return ZERO_VECTOR
  return ctx.prim.params.faces[face]!.textureOffsets
}
export const llGetTextureScale: BuiltinImpl = (ctx, args) => {
  const face = num(args[0], 0) | 0
  if (!hasFace(ctx.prim, face)) return ZERO_VECTOR
  return ctx.prim.params.faces[face]!.textureRepeats
}
export const llGetTextureRot: BuiltinImpl = (ctx, args) => {
  const face = num(args[0], 0) | 0
  if (!hasFace(ctx.prim, face)) return 0
  return ctx.prim.params.faces[face]!.textureRotation
}

export const llScaleTexture: BuiltinImpl = (ctx, args) => {
  const u = num(args[0])
  const v = num(args[1])
  const face = num(args[2], ALL_SIDES) | 0
  const list = faceIndices(ctx.prim.params, face)
  for (const f of list) ctx.prim.params.faces[f]!.textureRepeats = { x: u, y: v, z: 0 }
  return undefined
}
export const llOffsetTexture: BuiltinImpl = (ctx, args) => {
  const u = num(args[0])
  const v = num(args[1])
  const face = num(args[2], ALL_SIDES) | 0
  const list = faceIndices(ctx.prim.params, face)
  for (const f of list) ctx.prim.params.faces[f]!.textureOffsets = { x: u, y: v, z: 0 }
  return undefined
}
export const llRotateTexture: BuiltinImpl = (ctx, args) => {
  const angle = num(args[0])
  const face = num(args[1], ALL_SIDES) | 0
  const list = faceIndices(ctx.prim.params, face)
  for (const f of list) ctx.prim.params.faces[f]!.textureRotation = angle
  return undefined
}

/* ------------------------------------------------------------------ */
/*  Link variants                                                      */
/* ------------------------------------------------------------------ */

export const llSetLinkColor: BuiltinImpl = (ctx, args) => {
  const link = num(args[0]) | 0
  const color = vecOf(args[1])
  const face = num(args[2], ALL_SIDES) | 0
  // Wiki: only color is set; per-face alpha is preserved.
  for (const p of targets(ctx.linkset, ctx.prim.linkNumber, link)) {
    for (const f of faceIndices(p.params, face)) p.params.faces[f]!.color = { x: color.x, y: color.y, z: color.z }
  }
  return undefined
}
export const llSetLinkAlpha: BuiltinImpl = (ctx, args) => {
  const link = num(args[0]) | 0
  const alpha = num(args[1], 1)
  const face = num(args[2], ALL_SIDES) | 0
  for (const p of targets(ctx.linkset, ctx.prim.linkNumber, link)) {
    for (const f of faceIndices(p.params, face)) p.params.faces[f]!.alpha = alpha
  }
  return undefined
}
export const llSetLinkTexture: BuiltinImpl = (ctx, args) => {
  const link = num(args[0]) | 0
  const tex = str(args[1])
  const face = num(args[2], ALL_SIDES) | 0
  for (const p of targets(ctx.linkset, ctx.prim.linkNumber, link)) {
    for (const f of faceIndices(p.params, face)) p.params.faces[f]!.texture = tex
  }
  return undefined
}

export const llSetTextureAnim: BuiltinImpl = (ctx, args) => {
  ctx.prim.params.textureAnim = {
    mode: num(args[0]) | 0,
    face: num(args[1]) | 0,
    sizex: num(args[2]) | 0,
    sizey: num(args[3]) | 0,
    start: num(args[4]),
    length: num(args[5]),
    rate: num(args[6]),
  }
  return undefined
}
export const llSetLinkTextureAnim: BuiltinImpl = (ctx, args) => {
  const link = num(args[0]) | 0
  const anim = {
    mode: num(args[1]) | 0,
    face: num(args[2]) | 0,
    sizex: num(args[3]) | 0,
    sizey: num(args[4]) | 0,
    start: num(args[5]),
    length: num(args[6]),
    rate: num(args[7]),
  }
  for (const p of targets(ctx.linkset, ctx.prim.linkNumber, link)) {
    p.params.textureAnim = { ...anim }
  }
  return undefined
}
/**
 * Same effect as llSetLinkTextureAnim per the wiki. Kept as a distinct
 * function (not an alias) so call-log telemetry / mocks can key on
 * function identity.
 */
export const llSetLinkTextureAnimOverrideMe: BuiltinImpl = (ctx, args) =>
  llSetLinkTextureAnim(ctx, args)

export const llSetLinkGLTFOverrides: BuiltinImpl = (ctx, args) => {
  const link = num(args[0]) | 0
  const face = num(args[1]) | 0
  const params = args[2] as ReadonlyArray<LslValue>
  for (const p of targets(ctx.linkset, ctx.prim.linkNumber, link)) {
    for (const f of faceIndices(p.params, face)) {
      const fa = p.params.faces[f]!
      if (fa.renderMaterial !== NULL_KEY) setGltfOverrides(fa.gltf, params)
    }
  }
  return undefined
}

export const llSetRenderMaterial: BuiltinImpl = (ctx, args) => {
  const material = str(args[0])
  const face = num(args[1], ALL_SIDES) | 0
  const key = renderMaterialKey(ctx.prim, material)
  if (key === null) sayError(ctx, `Could not find render material '${material}'.`)
  ctx.prim.setPrimParam(PRIM_RENDER_MATERIAL, [face, key ?? NULL_KEY], 0)
  return undefined
}
export const llGetRenderMaterial: BuiltinImpl = (ctx, args) => {
  const face = Math.max(0, num(args[0], 0) | 0)
  if (!hasFace(ctx.prim, face)) return NULL_KEY
  return ctx.prim.params.faces[face]!.renderMaterial
}

/* ------------------------------------------------------------------ */
/*  Status / click / omega / physics material / passes                 */
/* ------------------------------------------------------------------ */

export const llSetStatus: BuiltinImpl = (ctx, args) => {
  const flag = num(args[0]) | 0
  const value = num(args[1]) !== 0
  ctx.prim.setStatus(flag, value)
  return undefined
}
export const llGetStatus: BuiltinImpl = (ctx, args) => {
  const flag = num(args[0]) | 0
  return (ctx.prim.statusFlags & flag) !== 0 ? 1 : 0
}
export const llSetLinkStatus: BuiltinImpl = (ctx, args) => {
  const link = num(args[0]) | 0
  const flag = num(args[1]) | 0
  const value = num(args[2]) !== 0
  for (const p of targets(ctx.linkset, ctx.prim.linkNumber, link)) p.setStatus(flag, value)
  return undefined
}

export const llSetClickAction: BuiltinImpl = (ctx, args) => {
  ctx.prim.setPrimParam(PRIM_CLICK_ACTION, [num(args[0]) | 0], 0)
  return undefined
}

export const llTargetOmega: BuiltinImpl = (ctx, args) => {
  ctx.prim.setPrimParam(PRIM_OMEGA, [vecOf(args[0]), num(args[1]), num(args[2])], 0)
  return undefined
}

export const llSetPhysicsMaterial: BuiltinImpl = (ctx, args) => {
  // mask bitfield selects which fields the call updates; the rest are
  // preserved. DENSITY=0x1, FRICTION=0x2, RESTITUTION=0x4, GRAVITY_MULTIPLIER=0x8.
  // mask is a transient selector for *this* call, not a persistent
  // property of the material — don't store it.
  const mask = num(args[0]) | 0
  const m = ctx.prim.params.physicsMaterial
  const inRange = (v: number, lo: number, hi: number): boolean => v >= lo && v <= hi
  if (mask & GRAVITY_MULTIPLIER && inRange(num(args[1], 1), -1, 28)) m.gravityMultiplier = num(args[1], 1)
  if (mask & RESTITUTION && inRange(num(args[2]), 0, 1)) m.restitution = num(args[2])
  if (mask & FRICTION && inRange(num(args[3]), 0, 255)) m.friction = num(args[3])
  if (mask & DENSITY && inRange(num(args[4], 1000), 1, 22587)) m.density = num(args[4], 1000)
  return undefined
}
export const llGetPhysicsMaterial: BuiltinImpl = (ctx) => {
  const m = ctx.prim.params.physicsMaterial
  return uniformList([m.gravityMultiplier, m.restitution, m.friction, m.density], 'float')
}

export const llPassCollisions: BuiltinImpl = (ctx, args) => {
  ctx.prim.params.passCollisions = num(args[0]) | 0
  return undefined
}
export const llPassTouches: BuiltinImpl = (ctx, args) => {
  ctx.prim.params.passTouches = num(args[0]) | 0
  return undefined
}

/* ------------------------------------------------------------------ */
/*  Sit                                                                */
/* ------------------------------------------------------------------ */

export const llSitTarget: BuiltinImpl = (ctx, args) => {
  const offset = vecOf(args[0])
  const rot = rotOf(args[1])
  // LSL: zero offset disables the sit target.
  const enabled = !(offset.x === 0 && offset.y === 0 && offset.z === 0)
  ctx.prim.setPrimParam(PRIM_SIT_TARGET, [enabled ? 1 : 0, offset, rot], 0)
  return undefined
}
export const llLinkSitTarget: BuiltinImpl = (ctx, args) => {
  const link = num(args[0]) | 0
  const offset = vecOf(args[1])
  const rot = rotOf(args[2])
  const enabled = !(offset.x === 0 && offset.y === 0 && offset.z === 0)
  for (const p of targets(ctx.linkset, ctx.prim.linkNumber, link)) {
    p.setPrimParam(PRIM_SIT_TARGET, [enabled ? 1 : 0, offset, rot], 0)
  }
  return undefined
}
export const llAvatarOnSitTarget: BuiltinImpl = () => NULL_KEY
export const llAvatarOnLinkSitTarget: BuiltinImpl = () => NULL_KEY

export const llSetLinkSitFlags: BuiltinImpl = (ctx, args) => {
  const link = num(args[0]) | 0
  const flags = num(args[1]) | 0
  for (const p of targets(ctx.linkset, ctx.prim.linkNumber, link)) {
    p.setPrimParam(PRIM_SIT_FLAGS, [flags], 0)
  }
  return undefined
}
export const llGetLinkSitFlags: BuiltinImpl = (ctx, args) => {
  const link = num(args[0]) | 0
  const ts = targets(ctx.linkset, ctx.prim.linkNumber, link)
  return ts[0]?.params.sitFlags ?? 0
}

