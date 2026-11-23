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
 * region axes. Where the line from above meets a box's top first, the
 * avatar's own position also counts. Measured on boxes and round cylinders
 * with an axis vertical; Second Life seats an avatar elsewhere on tilted
 * prims, other shapes and a click on a cylinder's top.
 */
export function sitSpot(prim: Prim, camera: Vector, offset: Vector, avatar: Vector) {
  const turn = prim.regionRotation(), inverse = conjugate(turn)
  const centre = prim.regionPosition()
  const from = rotateVector({ x: camera.x - centre.x, y: camera.y - centre.y, z: camera.z - centre.z }, inverse)
  const cylinder = prim.params.shape.kind === PRIM_TYPE_CYLINDER
  const spot = rotateVector(offset, inverse)
  const point = [spot.x, spot.y, spot.z]
  const local = [from.x - point[0]!, from.y - point[1]!, from.z - point[2]!]
  const { size } = prim.params
  const half = [size.x, size.y, size.z].map(v => Math.max(v, 0.01) / 2)
  const axes = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }].map(axis => rotateVector(axis, turn))
  const up = [0, 1, 2].reduce((best, i) => Math.abs(axes[i]!.z) > Math.abs(axes[best]!.z) ? i : best, 2)
  const [a, b] = [0, 1, 2].filter(i => i !== up) as [number, number]
  const seat = [0, 0, 0], out = [0, 0, 0]
  if (cylinder && up === 2) {
    // Where the line from the camera first meets the round side.
    const pa = point[a]! / half[a]!, pb = point[b]! / half[b]!, la = local[a]! / half[a]!, lb = local[b]! / half[b]!
    const qa = la * la + lb * lb, qb = pa * la + pb * lb, qc = pa * pa + pb * pb - 1, d = qb * qb - qa * qc
    // A line that misses the round side runs from the centre instead.
    // A spot on the edge seen from the side can round to just outside it.
    const meets = qa > 0 && d >= -1e-4 * qa, start = meets ? [pa, pb] : [0, 0]
    const line = meets ? [la, lb] : [la + pa, lb + pb]
    const root = meets ? (-qb + Math.sqrt(Math.max(d, 0))) / qa : 1 / (Math.hypot(line[0]!, line[1]!) || 1)
    const ea = (start[0]! + line[0]! * root) * half[a]!, eb = (start[1]! + line[1]! * root) * half[b]!
    const ga = ea / half[a]! ** 2, gb = eb / half[b]! ** 2, length = Math.hypot(ga, gb) || 1
    out[a] = ga / length; out[b] = gb / length
    seat[a] = ea + OUT_FROM_SIDE * out[a]!; seat[b] = eb + OUT_FROM_SIDE * out[b]!
  } else {
    // Where the line first meets the box: the last of its three slabs it enters.
    const reach = local.map((v, i) => v ? ((v < 0 ? -half[i]! : half[i]!) - point[i]!) / v : Infinity)
    const meet = Math.min(...reach)
    const hit = local.map((v, i) => point[i]! + (Number.isFinite(meet) ? v * meet : 0))
    let side = reach[a]! <= reach[b]! ? a : b, sign = local[side]! < 0 ? -1 : 1
    if (local[up]! * axes[up]!.z > 0 && reach[up]! < Math.min(reach[a]!, reach[b]!)) {
      const at = rotateVector({ x: avatar.x - centre.x, y: avatar.y - centre.y, z: avatar.z - centre.z }, inverse)
      const to = [at.x, at.y, at.z]
      const rays: [number, number][] = [[local[a]!, local[b]!], [-local[a]!, -local[b]!], [to[a]! - hit[a]!, to[b]! - hit[b]!]]
      const nearest = nearestSide(rays, [hit[a]!, hit[b]!], [half[a]!, half[b]!], [a, b])
      side = nearest[0]; sign = nearest[1]
    }
    out[side] = sign
    seat[side] = sign * (half[side]! + OUT_FROM_SIDE)
    const along = side === a ? b : a
    seat[along] = hit[along]!
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

/**
 * A line that meets the top seats the avatar at a side, in line with the spot
 * where it met. Rays run across the top from that spot towards the camera,
 * away from it and towards the avatar; the avatar sits at the side nearest
 * the spot among the sides they reach. Where two are equally near, the ray
 * towards the camera wins, then the one away from it. A ray leaving through a
 * corner takes the first axis, and with no ray across the top the avatar
 * sits at the +first-axis side.
 */
function nearestSide(rays: [number, number][], spot: [number, number], half: [number, number], axes: [number, number]): [number, number] {
  let best: [number, number] = [axes[0], 1], nearest = Infinity
  for (const ray of rays) {
    let leave = Infinity, index = 0
    for (const i of [0, 1]) {
      if (!ray[i]) continue
      const t = ((ray[i]! < 0 ? -half[i]! : half[i]!) - spot[i]!) / ray[i]!
      if (t < leave) { leave = t; index = i }
    }
    if (!Number.isFinite(leave)) continue
    const sign = ray[index]! < 0 ? -1 : 1
    const distance = half[index]! - sign * spot[index]!
    if (distance < nearest - 1e-6) { nearest = distance; best = [axes[index]!, sign] }
  }
  return best
}

