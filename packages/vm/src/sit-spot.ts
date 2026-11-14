import { PRIM_TYPE_CYLINDER } from './generated/constants.js'
import type { Prim } from './prim.js'
import { conjugate, mulRotation, rotateVector } from './values/ops.js'
import type { Rotation, Vector } from './values/types.js'

const ABOVE_TOP = 0.63
const OUT_FROM_SIDE = 0.09
const BEHIND_AVATAR = 3
const ABOVE_AVATAR = 1.94

/**
 * Where a plain sit request seats `avatar` on a prim without a sit target,
 * and its rotation, both in the prim's frame. Measured on boxes and round
 * cylinders with an axis vertical; Second Life seats an avatar elsewhere on
 * tilted prims and other shapes.
 */
export function sitSpot(prim: Prim, avatar: { position: Vector; rotation: Rotation }) {
  const turn = prim.regionRotation(), inverse = conjugate(turn)
  const centre = prim.regionPosition()
  const facing = rotateVector({ x: 1, y: 0, z: 0 }, avatar.rotation)
  const heading = Math.atan2(facing.y, facing.x)
  const from = rotateVector({
    x: avatar.position.x - BEHIND_AVATAR * Math.cos(heading) - centre.x,
    y: avatar.position.y - BEHIND_AVATAR * Math.sin(heading) - centre.y,
    z: avatar.position.z + ABOVE_AVATAR - centre.z,
  }, inverse)
  const local = [from.x, from.y, from.z]
  const { size } = prim.params
  const half = [size.x, size.y, size.z].map(v => Math.max(v, 0.01) / 2)
  const axes = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }].map(axis => rotateVector(axis, turn))
  const up = [0, 1, 2].reduce((best, i) => Math.abs(axes[i]!.z) > Math.abs(axes[best]!.z) ? i : best, 2)
  const [a, b] = [0, 1, 2].filter(i => i !== up) as [number, number]
  const seat = [0, 0, 0], out = [0, 0, 0]
  if (prim.params.shape.kind === PRIM_TYPE_CYLINDER && up === 2) {
    const scale = Math.hypot(local[a]! / half[a]!, local[b]! / half[b]!) || 1
    const ea = local[a]! / scale, eb = local[b]! / scale
    const ga = ea / half[a]! ** 2, gb = eb / half[b]! ** 2, length = Math.hypot(ga, gb) || 1
    out[a] = ga / length; out[b] = gb / length
    seat[a] = ea + OUT_FROM_SIDE * out[a]!; seat[b] = eb + OUT_FROM_SIDE * out[b]!
  } else {
    // Where the line first meets the box: the nearest of its three slabs.
    const reach = local.map((v, i) => half[i]! / Math.abs(v))
    const meet = Math.min(...reach)
    const [side, along] = reach[a]! <= reach[b]! ? [a, b] : [b, a]
    out[side] = local[side]! < 0 ? -1 : 1
    seat[side] = out[side]! * (half[side]! + OUT_FROM_SIDE)
    seat[along] = Number.isFinite(meet) ? local[along]! * meet : 0
  }
  const turned = rotateVector({ x: seat[0]!, y: seat[1]!, z: seat[2]! }, turn)
  const offset = { ...turned, z: turned.z + half[up]! + ABOVE_TOP }
  const normal = rotateVector({ x: out[0]!, y: out[1]!, z: out[2]! }, turn)
  const yaw = Math.atan2(normal.y, normal.x) / 2
  return {
    position: rotateVector(offset, inverse),
    rotation: mulRotation({ x: 0, y: 0, z: Math.sin(yaw), s: Math.cos(yaw) }, inverse),
  }
}
