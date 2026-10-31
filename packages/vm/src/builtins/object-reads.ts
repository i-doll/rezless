import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { Prim } from '../prim.js'
import type { PrimShape } from '../prim-params.js'
import type { Script } from '../script.js'
import { NULL_KEY, ZERO_ROTATION, ZERO_VECTOR, type LslType, type LslValue, type Rotation, type Vector } from '../values/types.js'
import { mulRotation, rotateVector } from '../values/ops.js'
import { listElementType, typedList } from '../values/list-types.js'
import { formatTimestamp } from './time.js'
import {
  LINK_THIS,
  OBJECT_ACCOUNT_LEVEL,
  OBJECT_ANIMATED_COUNT,
  OBJECT_ANIMATED_SLOTS_AVAILABLE,
  OBJECT_ATTACHED_POINT,
  OBJECT_ATTACHED_SLOTS_AVAILABLE,
  OBJECT_BODY_SHAPE_TYPE,
  OBJECT_CHARACTER_TIME,
  OBJECT_CLICK_ACTION,
  OBJECT_CREATION_TIME,
  OBJECT_CREATOR,
  OBJECT_DAMAGE,
  OBJECT_DAMAGE_TYPE,
  OBJECT_DESC,
  OBJECT_GROUP,
  OBJECT_GROUP_TAG,
  OBJECT_HEALTH,
  OBJECT_HOVER_HEIGHT,
  OBJECT_LAST_OWNER_ID,
  OBJECT_LINK_NUMBER,
  OBJECT_LOCKED,
  OBJECT_MASS,
  OBJECT_MATERIAL,
  OBJECT_NAME,
  OBJECT_OMEGA,
  OBJECT_OWNER,
  OBJECT_PATHFINDING_TYPE,
  OBJECT_PERMS,
  OBJECT_PERMS_COMBINED,
  OBJECT_PHANTOM,
  OBJECT_PHYSICS,
  OBJECT_PHYSICS_COST,
  OBJECT_POS,
  OBJECT_PRIM_COUNT,
  OBJECT_PRIM_EQUIVALENCE,
  OBJECT_RENDER_WEIGHT,
  OBJECT_REZZER_KEY,
  OBJECT_REZ_TIME,
  OBJECT_ROOT,
  OBJECT_ROT,
  OBJECT_RUNNING_SCRIPT_COUNT,
  OBJECT_SCALE,
  OBJECT_SCRIPT_MEMORY,
  OBJECT_SCRIPT_TIME,
  OBJECT_SELECT_COUNT,
  OBJECT_SERVER_COST,
  OBJECT_SIT_COUNT,
  OBJECT_STREAMING_COST,
  OBJECT_TEMP_ATTACHED,
  OBJECT_TEMP_ON_REZ,
  OBJECT_TEXT,
  OBJECT_TEXT_ALPHA,
  OBJECT_TEXT_COLOR,
  OBJECT_TOTAL_INVENTORY_COUNT,
  OBJECT_TOTAL_SCRIPT_COUNT,
  OBJECT_UNKNOWN_DETAIL,
  OBJECT_VELOCITY,
  OBJECT_VOLUME_DETECT,
  PERM_ALL,
  PERM_MOVE,
  PERM_TRANSFER,
  PRIM_PHYSICS_SHAPE_NONE,
  PRIM_TEXT,
  PRIM_TYPE_BOX,
  PRIM_TYPE_CYLINDER,
  PRIM_TYPE_PRISM,
  PRIM_TYPE_SPHERE,
  STATUS_PHANTOM,
  STATUS_PHYSICS,
} from '../generated/constants.js'

const KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The prim with key `id` in a live linkset in the caller's region, matched without regard to case. */
function findPrim(ctx: CallContext, id: string): Prim | undefined {
  if (!KEY_PATTERN.test(id) || id === NULL_KEY) return undefined
  const wanted = id.toLowerCase()
  const { world, region } = ctx.linkset
  const linksets = world ? world.linksets.filter((l) => l.region === region && !l.dead) : [ctx.linkset]
  for (const linkset of linksets) {
    const prim = linkset.prims.find((p) => p.key.toLowerCase() === wanted)
    if (prim) return prim
  }
  return undefined
}

const keyArg = (args: Parameters<BuiltinImpl>[1]) => (args[0] as string | undefined) ?? ''
const rootOf = (prim: Prim): Prim => prim.linkset?.prims[0] ?? prim
const primsOf = (prim: Prim): readonly Prim[] => prim.linkset?.prims ?? [prim]

function profileArea(shape: PrimShape): number | undefined {
  switch (shape.kind) {
    case PRIM_TYPE_BOX:
      return 1
    case PRIM_TYPE_CYLINDER:
      return Math.PI / 4
    case PRIM_TYPE_PRISM:
      return (3 * Math.sqrt(3)) / 16
    default:
      return undefined
  }
}

/**
 * Volume of a prim's physics shape in cubic metres. Boxes, cylinders and
 * prisms are extrusions, so a hollow, a path cut and a taper scale the
 * volume by their share of the profile. A sphere is a whole ellipsoid,
 * whatever its cut, hollow or dimple. Other shapes read as a solid box of
 * their size.
 */
function volume(prim: Prim): number {
  const { size, shape } = prim.params
  const box = size.x * size.y * size.z
  const area = profileArea(shape)
  if (area !== undefined && 'topSize' in shape) {
    const hollow = 1 - shape.hollow * shape.hollow
    const cut = shape.cut.y - shape.cut.x
    const tx = Math.abs(1 - shape.topSize.x)
    const ty = Math.abs(1 - shape.topSize.y)
    const taper = 1 - (tx + ty) / 2 + (tx * ty) / 3
    return box * area * hollow * cut * taper
  }
  if (shape.kind === PRIM_TYPE_SPHERE) return (box * Math.PI) / 6
  return box
}

/** Mass in kilograms: volume times density, or 0 for a prim with no physics shape. */
function primMass(prim: Prim): number {
  if (prim.params.physicsShapeType === PRIM_PHYSICS_SHAPE_NONE) return 0
  return volume(prim) * prim.params.physicsMaterial.density
}

/** Mass of the whole linkset in kilograms. */
function linksetMass(prim: Prim): number {
  return primsOf(prim).reduce((sum, p) => sum + primMass(p), 0)
}

/**
 * The linkset's bounding box, relative to the root and in its frame,
 * leaving out children with no physics shape. Each prim is a box of its
 * size with rounded edges: every half-size is at least 0.025 m, and the
 * edges round off by the smaller of 0.05 m and half the smallest half-size.
 */
function boundingBox(prim: Prim): [Vector, Vector] {
  const root = rootOf(prim)
  const min = { x: Infinity, y: Infinity, z: Infinity }
  const max = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const p of primsOf(prim)) {
    if (p !== root && p.params.physicsShapeType === PRIM_PHYSICS_SHAPE_NONE) continue
    const { size, position, rotation } = p.params
    const half = { x: Math.max(size.x / 2, 0.025), y: Math.max(size.y / 2, 0.025), z: Math.max(size.z / 2, 0.025) }
    const round = Math.min(0.05, Math.min(half.x, half.y, half.z) / 2)
    const centre = p === root ? ZERO_VECTOR : position
    const turn = p === root ? ZERO_ROTATION : rotation
    const axes = [
      rotateVector({ x: half.x - round, y: 0, z: 0 }, turn),
      rotateVector({ x: 0, y: half.y - round, z: 0 }, turn),
      rotateVector({ x: 0, y: 0, z: half.z - round }, turn),
    ]
    for (const c of ['x', 'y', 'z'] as const) {
      const reach = axes.reduce((sum, a) => sum + Math.abs(a[c]), 0) + round
      min[c] = Math.min(min[c], centre[c] - reach)
      max[c] = Math.max(max[c], centre[c] + reach)
    }
  }
  return [min, max]
}

/** llKey2Name(key id) — the prim's name, or "" for a key with no prim in the region. */
export const llKey2Name: BuiltinImpl = (ctx, args) => findPrim(ctx, keyArg(args))?.name ?? ''

/** llGetObjectPrimCount(key id) — prims in the linkset holding `id`, or 0. */
export const llGetObjectPrimCount: BuiltinImpl = (ctx, args) => {
  const prim = findPrim(ctx, keyArg(args))
  return prim ? primsOf(prim).length : 0
}

/**
 * llGetObjectLinkKey(key id, integer link) — the key of link `link` in the
 * linkset holding `id`. Link 0 is the root (or a lone prim) and LINK_THIS is
 * the prim `id` itself.
 */
export const llGetObjectLinkKey: BuiltinImpl = (ctx, args) => {
  const prim = findPrim(ctx, keyArg(args))
  if (!prim) return NULL_KEY
  const link = (args[1] as number | undefined) ?? 0
  if (link === LINK_THIS) return prim.key
  const prims = primsOf(prim)
  if (link === 0 || (link === 1 && prims.length === 1)) return rootOf(prim).key
  return prims.find((p) => p.linkNumber === link)?.key ?? NULL_KEY
}

/**
 * llGetObjectMass(key id) — for a root or lone prim, the linkset's mass; for
 * a child, its own mass. Second Life keeps a child's mass from when it was
 * linked; here it follows the child's current shape.
 */
export const llGetObjectMass: BuiltinImpl = (ctx, args) => {
  const prim = findPrim(ctx, keyArg(args))
  if (!prim) return 0
  return (rootOf(prim) === prim ? linksetMass(prim) : primMass(prim)) / 100
}

/** llGetBoundingBox(key id) — [min, max] of the linkset holding `id`, or [] for no prim. */
export const llGetBoundingBox: BuiltinImpl = (ctx, args) => {
  const prim = findPrim(ctx, keyArg(args))
  return prim ? boundingBox(prim) : []
}

/** llGetGeometricCenter() — the mean of the prims' positions relative to the root, in its frame. */
export const llGetGeometricCenter: BuiltinImpl = (ctx) => {
  const prims = ctx.linkset.prims
  const root = prims[0]
  const sum = { x: 0, y: 0, z: 0 }
  for (const p of prims) {
    if (p === root) continue
    sum.x += p.params.position.x
    sum.y += p.params.position.y
    sum.z += p.params.position.z
  }
  const n = Math.max(prims.length, 1)
  return { x: sum.x / n, y: sum.y / n, z: sum.z / n }
}

type Entry = readonly [LslValue, LslType]

/** The object's own base, owner, group, everyone and next-owner masks. */
const PERMS = [PERM_ALL, PERM_ALL, 0, 0, PERM_MOVE | PERM_TRANSFER]

/** The object's masks ANDed with those of every item in every prim's inventory. */
function combinedPerms(prim: Prim): number[] {
  return primsOf(prim)
    .flatMap((p) => p.inventory)
    .reduce(
      (masks, { permMask: m }) => [masks[0]! & m.base, masks[1]! & m.owner, masks[2]! & m.group, masks[3]! & m.everyone, masks[4]! & m.next],
      PERMS,
    )
}

function regionRotation(prim: Prim): Rotation {
  const root = rootOf(prim)
  return root === prim ? prim.params.rotation : mulRotation(prim.params.rotation, root.params.rotation)
}

const scriptsOf = (prim: Prim): Script[] => primsOf(prim).flatMap((p) => p.scripts)

function timestamp(prim: Prim): string {
  const start = prim.linkset?.clock.startUnixTime ?? 0
  return formatTimestamp(Math.floor(start * 1e6 + prim.createdAt * 1000))
}

/** The entries one OBJECT_* flag gives for `prim`, or undefined for a number that is not a flag. */
function detail(prim: Prim, flag: number): Entry[] | undefined {
  const root = rootOf(prim)
  const owner = prim.linkset?.owner ?? NULL_KEY
  const count = primsOf(prim).length
  const text = prim.getPrimParam(PRIM_TEXT, [], 0)?.values ?? ['', ZERO_VECTOR, 1]
  const int = (v: number): Entry[] => [[v, 'integer']]
  const float = (v: number): Entry[] => [[v, 'float']]
  switch (flag) {
    case OBJECT_NAME:
      return [[prim.name, 'string']]
    case OBJECT_DESC:
      return [[prim.description, 'string']]
    case OBJECT_POS:
      return [[prim.regionPosition(), 'vector']]
    case OBJECT_ROT:
      return [[regionRotation(prim), 'rotation']]
    case OBJECT_VELOCITY:
      return [[ZERO_VECTOR, 'vector']]
    case OBJECT_OMEGA: {
      const { axis, spinrate } = root.params.omega
      return [[{ x: axis.x * spinrate, y: axis.y * spinrate, z: axis.z * spinrate }, 'vector']]
    }
    case OBJECT_OWNER:
    case OBJECT_CREATOR:
    case OBJECT_REZZER_KEY:
      return [[owner, 'key']]
    case OBJECT_GROUP:
    case OBJECT_LAST_OWNER_ID:
      return [[NULL_KEY, 'key']]
    case OBJECT_ROOT:
      return [[root.key, 'key']]
    case OBJECT_RUNNING_SCRIPT_COUNT:
      return int(scriptsOf(prim).filter((s) => s.running && !s.dead).length)
    case OBJECT_TOTAL_SCRIPT_COUNT:
      return int(scriptsOf(prim).length)
    case OBJECT_SCRIPT_MEMORY:
      return int(scriptsOf(prim).reduce((sum, s) => sum + s.memoryLimit, 0))
    case OBJECT_PRIM_EQUIVALENCE:
    case OBJECT_PRIM_COUNT:
      return int(count)
    case OBJECT_SERVER_COST:
      return float(count / 2 + Math.max(scriptsOf(prim).length - 1, 0) / 4)
    case OBJECT_PHYSICS_COST:
      return float(count)
    case OBJECT_SCRIPT_TIME:
    case OBJECT_STREAMING_COST:
    case OBJECT_CHARACTER_TIME:
    case OBJECT_HOVER_HEIGHT:
      return float(0)
    case OBJECT_HEALTH:
      return float(prim.params.health)
    case OBJECT_DAMAGE:
      return float(prim.params.damage.amount)
    case OBJECT_DAMAGE_TYPE:
      return int(prim.params.damage.type)
    case OBJECT_BODY_SHAPE_TYPE:
      return float(-1)
    case OBJECT_ACCOUNT_LEVEL:
      return int(-1)
    case OBJECT_ATTACHED_POINT:
    case OBJECT_PATHFINDING_TYPE:
    case OBJECT_RENDER_WEIGHT:
    case OBJECT_TEMP_ATTACHED:
    case OBJECT_ATTACHED_SLOTS_AVAILABLE:
    case OBJECT_SELECT_COUNT:
    case OBJECT_SIT_COUNT:
    case OBJECT_ANIMATED_COUNT:
    case OBJECT_ANIMATED_SLOTS_AVAILABLE:
    case OBJECT_LOCKED:
    case OBJECT_VOLUME_DETECT:
      return int(0)
    case OBJECT_PHYSICS:
      return int((root.statusFlags & STATUS_PHYSICS) !== 0 ? 1 : 0)
    case OBJECT_PHANTOM:
      return int((root.statusFlags & STATUS_PHANTOM) !== 0 ? 1 : 0)
    case OBJECT_TEMP_ON_REZ:
      return int(root.params.tempOnRez ? 1 : 0)
    case OBJECT_CLICK_ACTION:
      return int(prim.params.clickAction)
    case OBJECT_MATERIAL:
      return int(prim.params.material)
    case OBJECT_TOTAL_INVENTORY_COUNT:
      return int(primsOf(prim).reduce((sum, p) => sum + p.inventory.length, 0))
    case OBJECT_LINK_NUMBER:
      return int(prim.linkNumber)
    case OBJECT_MASS:
      return float(linksetMass(prim))
    case OBJECT_GROUP_TAG:
      return [['', 'string']]
    case OBJECT_CREATION_TIME:
    case OBJECT_REZ_TIME:
      return [[timestamp(prim), 'string']]
    case OBJECT_TEXT:
      return [[text[0]!, 'string']]
    case OBJECT_TEXT_COLOR:
      return [[text[1]!, 'vector']]
    case OBJECT_TEXT_ALPHA:
      return float(text[2] as number)
    case OBJECT_SCALE:
      return [[prim.params.size, 'vector']]
    case OBJECT_PERMS:
      return PERMS.map((m) => [m, 'integer'])
    case OBJECT_PERMS_COMBINED:
      return combinedPerms(prim).map((m) => [m, 'integer'])
    default:
      return undefined
  }
}

/**
 * llGetObjectDetails(key id, list params) — the entries for each OBJECT_*
 * flag (five masks for OBJECT_PERMS), and OBJECT_UNKNOWN_DETAIL for a number
 * that is not a flag. An entry that is not an integer is dropped and turns
 * the last entry so far into OBJECT_UNKNOWN_DETAIL. A key with no prim in
 * the region gives [].
 */
export const llGetObjectDetails: BuiltinImpl = (ctx, args) => {
  const prim = findPrim(ctx, keyArg(args))
  if (!prim) return []
  const flags = (args[1] as LslValue[] | undefined) ?? []
  const out: Entry[] = []
  flags.forEach((flag, i) => {
    const type = listElementType(flags, i) ?? (typeof flag === 'number' && Number.isInteger(flag) ? 'integer' : undefined)
    if (type !== 'integer') {
      if (out.length > 0) out[out.length - 1] = [OBJECT_UNKNOWN_DETAIL, 'integer']
      return
    }
    out.push(...(detail(prim, flag as number) ?? [[OBJECT_UNKNOWN_DETAIL, 'integer']]))
  })
  return typedList(
    out.map(([v]) => v),
    out.map(([, t]) => t),
  )
}
