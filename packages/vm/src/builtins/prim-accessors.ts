import type { BuiltinImpl } from '../runtime.js'
import type { LslValue, Vector, Rotation } from '../values/types.js'
import { NULL_KEY, ZERO_VECTOR, ZERO_ROTATION } from '../values/types.js'
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

function applyDelay(spec: { delay: number } | undefined, advance: (ms: number) => void): void {
  const d = spec?.delay ?? 0
  if (d > 0) advance(d * 1000)
}

function targets(linkset: Linkset, sender: number, link: number): Prim[] {
  return linkset.resolveTargets(sender, link)
}

/* ------------------------------------------------------------------ */
/*  Position / rotation / scale                                        */
/* ------------------------------------------------------------------ */

export const llSetPos: BuiltinImpl = (ctx, args) => {
  ctx.prim.setPrimParam(PRIM_POSITION, [vecOf(args[0])], 0)
  applyDelay(ctx.spec, (ms) => ctx.state.clock.advance(ms))
  return undefined
}

export const llGetPos: BuiltinImpl = (ctx) => ctx.prim.params.position
export const llGetLocalPos: BuiltinImpl = (ctx) => ctx.prim.params.position
export const llGetRootPosition: BuiltinImpl = (ctx) => {
  const root = ctx.linkset.prims[0] ?? ctx.prim
  return root.params.position
}

export const llSetRot: BuiltinImpl = (ctx, args) => {
  ctx.prim.setPrimParam(PRIM_ROTATION, [rotOf(args[0])], 0)
  applyDelay(ctx.spec, (ms) => ctx.state.clock.advance(ms))
  return undefined
}
export const llSetLocalRot: BuiltinImpl = (ctx, args) => {
  ctx.prim.setPrimParam(PRIM_ROT_LOCAL, [rotOf(args[0])], 0)
  applyDelay(ctx.spec, (ms) => ctx.state.clock.advance(ms))
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
export const llGetMaxScaleFactor: BuiltinImpl = () => 64
export const llGetMinScaleFactor: BuiltinImpl = () => 0.01

/* ------------------------------------------------------------------ */
/*  Color / alpha / texture                                            */
/* ------------------------------------------------------------------ */

export const llSetColor: BuiltinImpl = (ctx, args) => {
  const color = vecOf(args[0])
  const face = num(args[1], ALL_SIDES) | 0
  // Preserve current alpha when only color is set. Clone per face so
  // faces don't alias the same vector instance.
  const clone = () => ({ x: color.x, y: color.y, z: color.z })
  if (face === ALL_SIDES) {
    for (let f = 0; f < 6; f++) ctx.prim.params.faces[f]!.color = clone()
  } else if (face >= 0 && face <= 5) {
    ctx.prim.params.faces[face]!.color = clone()
  }
  return undefined
}
export const llGetColor: BuiltinImpl = (ctx, args) => {
  const face = num(args[0], 0) | 0
  if (face === ALL_SIDES) {
    // Average the 6 face colors per LSL spec.
    let x = 0, y = 0, z = 0
    for (let f = 0; f < 6; f++) {
      const c = ctx.prim.params.faces[f]!.color
      x += c.x; y += c.y; z += c.z
    }
    return { x: x / 6, y: y / 6, z: z / 6 }
  }
  if (face < 0 || face > 5) return ZERO_VECTOR
  return ctx.prim.params.faces[face]!.color
}

export const llSetAlpha: BuiltinImpl = (ctx, args) => {
  const alpha = num(args[0], 1)
  const face = num(args[1], ALL_SIDES) | 0
  if (face === ALL_SIDES) {
    for (let f = 0; f < 6; f++) ctx.prim.params.faces[f]!.alpha = alpha
  } else if (face >= 0 && face <= 5) {
    ctx.prim.params.faces[face]!.alpha = alpha
  }
  return undefined
}
export const llGetAlpha: BuiltinImpl = (ctx, args) => {
  const face = num(args[0], 0) | 0
  if (face === ALL_SIDES) {
    let a = 0
    for (let f = 0; f < 6; f++) a += ctx.prim.params.faces[f]!.alpha
    return a / 6
  }
  if (face < 0 || face > 5) return 0
  return ctx.prim.params.faces[face]!.alpha
}

export const llSetTexture: BuiltinImpl = (ctx, args) => {
  const tex = str(args[0])
  const face = num(args[1], ALL_SIDES) | 0
  const list = (face === ALL_SIDES ? [0, 1, 2, 3, 4, 5] : face >= 0 && face <= 5 ? [face] : [])
  for (const f of list) ctx.prim.params.faces[f]!.texture = tex
  applyDelay(ctx.spec, (ms) => ctx.state.clock.advance(ms))
  return undefined
}
export const llGetTexture: BuiltinImpl = (ctx, args) => {
  const face = num(args[0], 0) | 0
  if (face < 0 || face > 5) return ''
  return ctx.prim.params.faces[face]!.texture
}
export const llGetTextureOffset: BuiltinImpl = (ctx, args) => {
  const face = num(args[0], 0) | 0
  if (face < 0 || face > 5) return ZERO_VECTOR
  return ctx.prim.params.faces[face]!.textureOffsets
}
export const llGetTextureScale: BuiltinImpl = (ctx, args) => {
  const face = num(args[0], 0) | 0
  if (face < 0 || face > 5) return ZERO_VECTOR
  return ctx.prim.params.faces[face]!.textureRepeats
}
export const llGetTextureRot: BuiltinImpl = (ctx, args) => {
  const face = num(args[0], 0) | 0
  if (face < 0 || face > 5) return 0
  return ctx.prim.params.faces[face]!.textureRotation
}

export const llScaleTexture: BuiltinImpl = (ctx, args) => {
  const u = num(args[0])
  const v = num(args[1])
  const face = num(args[2], ALL_SIDES) | 0
  const list = face === ALL_SIDES ? [0, 1, 2, 3, 4, 5] : face >= 0 && face <= 5 ? [face] : []
  for (const f of list) ctx.prim.params.faces[f]!.textureRepeats = { x: u, y: v, z: 0 }
  applyDelay(ctx.spec, (ms) => ctx.state.clock.advance(ms))
  return undefined
}
export const llOffsetTexture: BuiltinImpl = (ctx, args) => {
  const u = num(args[0])
  const v = num(args[1])
  const face = num(args[2], ALL_SIDES) | 0
  const list = face === ALL_SIDES ? [0, 1, 2, 3, 4, 5] : face >= 0 && face <= 5 ? [face] : []
  for (const f of list) ctx.prim.params.faces[f]!.textureOffsets = { x: u, y: v, z: 0 }
  applyDelay(ctx.spec, (ms) => ctx.state.clock.advance(ms))
  return undefined
}
export const llRotateTexture: BuiltinImpl = (ctx, args) => {
  const angle = num(args[0])
  const face = num(args[1], ALL_SIDES) | 0
  const list = face === ALL_SIDES ? [0, 1, 2, 3, 4, 5] : face >= 0 && face <= 5 ? [face] : []
  for (const f of list) ctx.prim.params.faces[f]!.textureRotation = angle
  applyDelay(ctx.spec, (ms) => ctx.state.clock.advance(ms))
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
  const list = face === ALL_SIDES ? [0, 1, 2, 3, 4, 5] : face >= 0 && face <= 5 ? [face] : []
  for (const p of targets(ctx.linkset, ctx.prim.linkNumber, link)) {
    for (const f of list) p.params.faces[f]!.color = { x: color.x, y: color.y, z: color.z }
  }
  return undefined
}
export const llSetLinkAlpha: BuiltinImpl = (ctx, args) => {
  const link = num(args[0]) | 0
  const alpha = num(args[1], 1)
  const face = num(args[2], ALL_SIDES) | 0
  const list = face === ALL_SIDES ? [0, 1, 2, 3, 4, 5] : face >= 0 && face <= 5 ? [face] : []
  for (const p of targets(ctx.linkset, ctx.prim.linkNumber, link)) {
    for (const f of list) p.params.faces[f]!.alpha = alpha
  }
  return undefined
}
export const llSetLinkTexture: BuiltinImpl = (ctx, args) => {
  const link = num(args[0]) | 0
  const tex = str(args[1])
  const face = num(args[2], ALL_SIDES) | 0
  const list = face === ALL_SIDES ? [0, 1, 2, 3, 4, 5] : face >= 0 && face <= 5 ? [face] : []
  for (const p of targets(ctx.linkset, ctx.prim.linkNumber, link)) {
    for (const f of list) p.params.faces[f]!.texture = tex
  }
  applyDelay(ctx.spec, (ms) => ctx.state.clock.advance(ms))
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

export const llSetRenderMaterial: BuiltinImpl = (ctx, args) => {
  const material = str(args[0])
  const face = num(args[1], ALL_SIDES) | 0
  ctx.prim.setPrimParam(PRIM_RENDER_MATERIAL, [face, material], 0)
  return undefined
}
export const llGetRenderMaterial: BuiltinImpl = (ctx, args) => {
  const face = num(args[0], 0) | 0
  if (face < 0 || face > 5) return ''
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
  if (mask & GRAVITY_MULTIPLIER) m.gravityMultiplier = num(args[1], 1)
  if (mask & RESTITUTION) m.restitution = num(args[2])
  if (mask & FRICTION) m.friction = num(args[3])
  if (mask & DENSITY) m.density = num(args[4], 1000)
  return undefined
}
export const llGetPhysicsMaterial: BuiltinImpl = (ctx) => {
  const m = ctx.prim.params.physicsMaterial
  return [m.gravityMultiplier, m.restitution, m.friction, m.density] as ReadonlyArray<LslValue>
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

