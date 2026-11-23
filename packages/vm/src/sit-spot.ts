import { PRIM_TYPE_CYLINDER } from './generated/constants.js'
import type { Prim } from './prim.js'
import { conjugate, mulRotation, rotateVector } from './values/ops.js'
import type { Rotation, Vector } from './values/types.js'

const ABOVE_TOP = 0.63
const OUT_FROM_SIDE = 0.09
const BEHIND_AVATAR = 3
const ABOVE_AVATAR = 1.94

/** Where a viewer's camera rests by default, in region coordinates. */
export function defaultCamera(avatar: { position: Vector; rotation: Rotation }): Vector {
  const facing = rotateVector({ x: 1, y: 0, z: 0 }, avatar.rotation)
  const heading = Math.atan2(facing.y, facing.x)
  return {
    x: avatar.position.x - BEHIND_AVATAR * Math.cos(heading),
    y: avatar.position.y - BEHIND_AVATAR * Math.sin(heading),
    z: avatar.position.z + ABOVE_AVATAR,
  }
}

/**
 * Where a sit request seats an avatar on a prim without a sit target, and
 * its rotation, both in the prim's frame. The line runs from the avatar's
 * camera to the spot the request names, `offset` from the prim's centre in
 * region axes. Measured on boxes and round cylinders with an axis vertical;
 * Second Life seats an avatar elsewhere on tilted prims and other shapes.
 * Offsets were measured on boxes only, so a cylinder takes its centre.
 */
export function sitSpot(prim: Prim, camera: Vector, offset: Vector = { x: 0, y: 0, z: 0 }) {
  const turn = prim.regionRotation(), inverse = conjugate(turn)
  const centre = prim.regionPosition()
  const from = rotateVector({ x: camera.x - centre.x, y: camera.y - centre.y, z: camera.z - centre.z }, inverse)
  const cylinder = prim.params.shape.kind === PRIM_TYPE_CYLINDER
  const spot = rotateVector(offset, inverse)
  const point = cylinder ? [0, 0, 0] : [spot.x, spot.y, spot.z]
  const local = [from.x - point[0]!, from.y - point[1]!, from.z - point[2]!]
  const { size } = prim.params
  const half = [size.x, size.y, size.z].map(v => Math.max(v, 0.01) / 2)
  const axes = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }].map(axis => rotateVector(axis, turn))
  const up = [0, 1, 2].reduce((best, i) => Math.abs(axes[i]!.z) > Math.abs(axes[best]!.z) ? i : best, 2)
  const [a, b] = [0, 1, 2].filter(i => i !== up) as [number, number]
  const seat = [0, 0, 0], out = [0, 0, 0]
  if (cylinder && up === 2) {
    const scale = Math.hypot(local[a]! / half[a]!, local[b]! / half[b]!) || 1
    const ea = local[a]! / scale, eb = local[b]! / scale
    const ga = ea / half[a]! ** 2, gb = eb / half[b]! ** 2, length = Math.hypot(ga, gb) || 1
    out[a] = ga / length; out[b] = gb / length
    seat[a] = ea + OUT_FROM_SIDE * out[a]!; seat[b] = eb + OUT_FROM_SIDE * out[b]!
  } else {
    // Where the line first meets the box: the last of its three slabs it enters.
    const reach = local.map((v, i) => v ? ((v < 0 ? -half[i]! : half[i]!) - point[i]!) / v : Infinity)
    const meet = Math.min(...reach)
    const [side, along] = reach[a]! <= reach[b]! ? [a, b] : [b, a]
    out[side] = local[side]! < 0 ? -1 : 1
    seat[side] = out[side]! * (half[side]! + OUT_FROM_SIDE)
    seat[along] = point[along]! + (Number.isFinite(meet) ? local[along]! * meet : 0)
  }
  const turned = rotateVector({ x: seat[0]!, y: seat[1]!, z: seat[2]! }, turn)
  const lifted = { ...turned, z: turned.z + half[up]! + ABOVE_TOP }
  const normal = rotateVector({ x: out[0]!, y: out[1]!, z: out[2]! }, turn)
  // Second Life gives the turn from the prim's heading in (-180, 180] degrees.
  const heading0 = Math.atan2(axes[a]!.y, axes[a]!.x)
  let by = Math.atan2(normal.y, normal.x) - heading0
  while (by <= -Math.PI + 1e-3) by += 2 * Math.PI
  while (by > Math.PI + 1e-3) by -= 2 * Math.PI
  const yaw = (heading0 + by) / 2
  return {
    position: rotateVector(lifted, inverse),
    rotation: mulRotation({ x: 0, y: 0, z: Math.sin(yaw), s: Math.cos(yaw) }, inverse),
  }
}
