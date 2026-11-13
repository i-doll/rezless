/**
 * Which entries of a list result SLua's `ll` hands back as a boolean or a
 * uuid where LSL has an integer or a string. Second Life decides this entry
 * by entry, so the tables here are what was measured in-world (Aditi, SLua
 * Tideland, 2026-11-13); the tests in slua-results.test.ts cite each probe.
 */
import type { LslValue } from '../values/types.js'
import type { LuaResultKind } from '../values/list-types.js'
import type { Prim } from '../prim.js'
import { InventoryType } from '../inventory.js'
import {
  OBJECT_LOCKED,
  OBJECT_PHANTOM,
  OBJECT_PHYSICS,
  OBJECT_TEMP_ATTACHED,
  OBJECT_TEMP_ON_REZ,
  OBJECT_VOLUME_DETECT,
  PARCEL_DETAILS_SCRIPT_DANGER,
  PARCEL_DETAILS_SEE_AVATARS,
  PRIM_ALLOW_UNSIT,
  PRIM_FLEXIBLE,
  PRIM_FULLBRIGHT,
  PRIM_GLTF_BASE_COLOR,
  PRIM_GLTF_EMISSIVE,
  PRIM_GLTF_METALLIC_ROUGHNESS,
  PRIM_GLTF_NORMAL,
  PRIM_MEDIA_ALT_IMAGE_ENABLE,
  PRIM_MEDIA_AUTO_LOOP,
  PRIM_MEDIA_AUTO_PLAY,
  PRIM_MEDIA_AUTO_SCALE,
  PRIM_MEDIA_AUTO_ZOOM,
  PRIM_MEDIA_FIRST_CLICK_INTERACT,
  PRIM_MEDIA_WHITELIST_ENABLE,
  PRIM_NORMAL,
  PRIM_PHANTOM,
  PRIM_PHYSICS,
  PRIM_POINT_LIGHT,
  PRIM_REFLECTION_PROBE,
  PRIM_RENDER_MATERIAL,
  PRIM_SCRIPTED_SIT_ONLY,
  PRIM_SIT_TARGET,
  PRIM_SPECULAR,
  PRIM_TEMP_ON_REZ,
  PRIM_TEXTURE,
  PRIM_TYPE,
  PRIM_TYPE_SCULPT,
  SKY_CLOUDS,
  SKY_MOON,
  SKY_SUN,
  SKY_TEXTURE_DEFAULTS,
  WATER_TEXTURE_DEFAULTS,
} from '../generated/constants.js'

type Kinds = ReadonlyArray<LuaResultKind>

/** A pattern of `length` entries with `kind` at `index`. */
const at = (length: number, index: number, kind: LuaResultKind): Kinds =>
  Array.from({ length }, (_, i) => (i === index ? kind : undefined))

/** The values each PRIM_* rule reads; a per-face rule's pattern repeats for each face. */
const PRIM_PARAM_KINDS: Readonly<Record<number, Kinds>> = {
  [PRIM_PHYSICS]: ['boolean'],
  [PRIM_PHANTOM]: ['boolean'],
  [PRIM_TEMP_ON_REZ]: ['boolean'],
  [PRIM_FULLBRIGHT]: ['boolean'],
  [PRIM_ALLOW_UNSIT]: ['boolean'],
  [PRIM_SCRIPTED_SIT_ONLY]: ['boolean'],
  [PRIM_FLEXIBLE]: at(7, 0, 'boolean'),
  [PRIM_POINT_LIGHT]: at(5, 0, 'boolean'),
  [PRIM_SIT_TARGET]: at(3, 0, 'boolean'),
  [PRIM_REFLECTION_PROBE]: at(4, 0, 'boolean'),
  [PRIM_TEXTURE]: at(4, 0, 'uuid'),
  [PRIM_NORMAL]: at(4, 0, 'uuid'),
  [PRIM_SPECULAR]: at(7, 0, 'uuid'),
  [PRIM_RENDER_MATERIAL]: ['uuid'],
  [PRIM_GLTF_BASE_COLOR]: ['uuid', undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'boolean'],
  [PRIM_GLTF_NORMAL]: at(4, 0, 'uuid'),
  [PRIM_GLTF_METALLIC_ROUGHNESS]: at(6, 0, 'uuid'),
  [PRIM_GLTF_EMISSIVE]: at(5, 0, 'uuid'),
}

const SCULPT_KINDS = at(3, 1, 'uuid')

/** The rules that read an asset back by the name of the item the prim holds it as. A glTF rule reads the key. */
const NAMED_BY_ITEM: ReadonlySet<number> = new Set([PRIM_TEXTURE, PRIM_NORMAL, PRIM_SPECULAR, PRIM_RENDER_MATERIAL, PRIM_TYPE])

/**
 * What the values `prim` returned for PRIM_* rule `param` are in SLua. An
 * item's name is a string even when it reads like a key, and so is the ""
 * of an unset glTF override.
 */
export function primParamLuaKinds(prim: Prim | undefined, param: number, values: ReadonlyArray<LslValue>): LuaResultKind[] {
  const pattern = param === PRIM_TYPE ? (values[0] === PRIM_TYPE_SCULPT ? SCULPT_KINDS : []) : (PRIM_PARAM_KINDS[param] ?? [])
  const itemType = param === PRIM_RENDER_MATERIAL ? InventoryType.MATERIAL : InventoryType.TEXTURE
  const named = (v: LslValue) => NAMED_BY_ITEM.has(param) && !!prim?.inventory.some((it) => it.type === itemType && it.name === v)
  return values.map((v, i) => {
    const kind = pattern[i % pattern.length]
    if (kind === 'boolean') return v === '' ? undefined : kind
    return kind === 'uuid' && named(v) ? 'string' : kind
  })
}

const OBJECT_DETAIL_BOOLEANS: ReadonlySet<number> = new Set([
  OBJECT_PHYSICS, OBJECT_PHANTOM, OBJECT_TEMP_ON_REZ, OBJECT_TEMP_ATTACHED, OBJECT_LOCKED, OBJECT_VOLUME_DETECT,
])

/** What llGetObjectDetails' answer to `detail` is in SLua. */
export const objectDetailLuaKind = (detail: number): LuaResultKind => (OBJECT_DETAIL_BOOLEANS.has(detail) ? 'boolean' : undefined)

const PARCEL_DETAIL_BOOLEANS: ReadonlySet<number> = new Set([PARCEL_DETAILS_SEE_AVATARS, PARCEL_DETAILS_SCRIPT_DANGER])

/** What llGetParcelDetails' answer to `detail` is in SLua. */
export const parcelDetailLuaKind = (detail: number): LuaResultKind => (PARCEL_DETAIL_BOOLEANS.has(detail) ? 'boolean' : undefined)

const MEDIA_BOOLEANS: ReadonlySet<number> = new Set([
  PRIM_MEDIA_ALT_IMAGE_ENABLE, PRIM_MEDIA_AUTO_LOOP, PRIM_MEDIA_AUTO_PLAY, PRIM_MEDIA_AUTO_SCALE, PRIM_MEDIA_AUTO_ZOOM,
  PRIM_MEDIA_FIRST_CLICK_INTERACT, PRIM_MEDIA_WHITELIST_ENABLE,
])

/** What llGetPrimMediaParams' and llGetLinkMedia's answer to `param` is in SLua. */
export const mediaParamLuaKind = (param: number): LuaResultKind => (MEDIA_BOOLEANS.has(param) ? 'boolean' : undefined)

const ENVIRONMENT_KINDS: Readonly<Record<number, Kinds>> = {
  [SKY_TEXTURE_DEFAULTS]: ['boolean', 'boolean', 'boolean'],
  [SKY_CLOUDS]: at(8, 7, 'boolean'),
  [SKY_MOON]: at(7, 3, 'boolean'),
  [SKY_SUN]: at(7, 3, 'boolean'),
  [WATER_TEXTURE_DEFAULTS]: ['boolean', 'boolean'],
}

/** What the values llGetEnvironment returns for `rule` are in SLua. */
export const environmentLuaKinds = (rule: number): Kinds => ENVIRONMENT_KINDS[rule] ?? []
