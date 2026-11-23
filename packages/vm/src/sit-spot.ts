import { PRIM_TYPE_CYLINDER } from './generated/constants.js'
import type { Prim } from './prim.js'
import { conjugate, mulRotation, rotateVector } from './values/ops.js'
import type { Rotation, Vector } from './values/types.js'

const ABOVE_TOP = 0.63
const OUT_FROM_SIDE = 0.09
const BEHIND_AVATAR = 3
const ABOVE_AVATAR = 1.94
const SIDES = 9
const ROUND = 0.01 + 1e-6

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
 * region axes. Where the line from above meets a box's or a cylinder's top
 * first, the avatar's own position also counts. Measured on boxes with an
 * axis vertical and upright cylinders; Second Life seats an avatar elsewhere
 * on tilted prims and other shapes.
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
  const top = local[up]! * axes[up]!.z > 0 ? ((local[up]! < 0 ? -half[up]! : half[up]!) - point[up]!) / local[up]! : Infinity
  const across: [number, number] = [point[a]! + local[a]! * top, point[b]! + local[b]! * top]
  const edge = cylinder && up === 2 ? outline(half[a]!, half[b]!) : null
  if (edge && top <= 1 && edge.inside(across)) {
    // The line meets the top first: the edge nearest the spot, as on a box's top.
    let best = edge.leave(across, [1, 0])!, nearest = Infinity
    for (const ray of topRays(avatar, inverse, centre, local, across, a, b)) {
      const left = edge.leave(across, ray)
      if (!left) continue
      const distance = left.reach - (across[0] * left.normal[0] + across[1] * left.normal[1])
      if (distance < nearest - 1e-6) { nearest = distance; best = left }
    }
    const [na, nb] = best.normal, along = -across[0] * nb + across[1] * na
    out[a] = na; out[b] = nb
    seat[a] = (best.reach + OUT_FROM_SIDE) * na - along * nb
    seat[b] = (best.reach + OUT_FROM_SIDE) * nb + along * na
  } else if (edge) {
    // Where the line from the camera first meets the side. A line that misses
    // it runs from the centre instead.
    const met = edge.leave([point[a]!, point[b]!], [local[a]!, local[b]!])
      ?? edge.leave([0, 0], [from.x, from.y, from.z].filter((_, i) => i !== up) as [number, number]) ?? edge.leave([0, 0], [1, 0])!
    out[a] = met.normal[0]; out[b] = met.normal[1]
    seat[a] = met.hit[0] + OUT_FROM_SIDE * met.normal[0]; seat[b] = met.hit[1] + OUT_FROM_SIDE * met.normal[1]
  } else {
    // Where the line first meets the box: the last of its three slabs it enters.
    const reach = local.map((v, i) => v ? ((v < 0 ? -half[i]! : half[i]!) - point[i]!) / v : Infinity)
    const meet = Math.min(...reach)
    const hit = local.map((v, i) => point[i]! + (Number.isFinite(meet) ? v * meet : 0))
    let side = reach[a]! <= reach[b]! ? a : b, sign = local[side]! < 0 ? -1 : 1
    if (local[up]! * axes[up]!.z > 0 && reach[up]! < Math.min(reach[a]!, reach[b]!)) {
      const rays = topRays(avatar, inverse, centre, local, [hit[a]!, hit[b]!], a, b)
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
  // Second Life gives the turn from the prim's heading in (-120, 240] degrees:
  // in-world a turn of -116 degrees read as -116, one of -120.7 as 239.3.
  const heading0 = Math.atan2(axes[a]!.y, axes[a]!.x)
  let by = Math.atan2(normal.y, normal.x) - heading0
  while (by <= -2 * Math.PI / 3) by += 2 * Math.PI
  while (by > 4 * Math.PI / 3) by -= 2 * Math.PI
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

/** Rays across the top from a spot: towards the camera, away from it and towards the avatar. */
function topRays(avatar: Vector, inverse: Rotation, centre: Vector, local: number[], spot: number[], a: number, b: number): [number, number][] {
  const at = rotateVector({ x: avatar.x - centre.x, y: avatar.y - centre.y, z: avatar.z - centre.z }, inverse)
  const to = [at.x, at.y, at.z]
  return [[local[a]!, local[b]!], [-local[a]!, -local[b]!], [to[a]! - spot[0]!, to[b]! - spot[1]!]]
}

interface Leave { hit: [number, number]; normal: [number, number]; reach: number }

/**
 * A cylinder's outline seen from above. A round one, or one up to 1% longer
 * one way, is an ellipse. Any other is the nine-sided polygon with corners at
 * (ha cos t, hb sin t) for t every 40 degrees from 0: in-world, clicks and
 * plain requests on such cylinders seated the avatar against its sides.
 * `leave` gives where a line from a spot along a direction leaves the
 * outline, the outward normal there and the distance of the tangent or side
 * from the centre, or null when the line misses it. A line leaving through a
 * corner takes the side after it, counting from +X towards +Y.
 */
function outline(ha: number, hb: number) {
  if (Math.max(ha, hb) <= Math.min(ha, hb) * (1 + ROUND)) {
    return {
      inside: ([x, y]: [number, number]) => (x / ha) ** 2 + (y / hb) ** 2 <= 1 + 1e-4,
      leave([x, y]: [number, number], [dx, dy]: [number, number]): Leave | null {
        const px = x / ha, py = y / hb, lx = dx / ha, ly = dy / hb
        const qa = lx * lx + ly * ly, qb = px * lx + py * ly, qc = px * px + py * py - 1, d = qb * qb - qa * qc
        // A spot on the edge seen from the side can round to just outside it.
        if (!(qa > 0) || d < -1e-4 * qa) return null
        const t = (-qb + Math.sqrt(Math.max(d, 0))) / qa, hit: [number, number] = [x + dx * t, y + dy * t]
        const ga = hit[0] / ha ** 2, gb = hit[1] / hb ** 2, length = Math.hypot(ga, gb) || 1
        const normal: [number, number] = [ga / length, gb / length]
        return { hit, normal, reach: hit[0] * normal[0] + hit[1] * normal[1] }
      },
    }
  }
  const corners = Array.from({ length: SIDES }, (_, k) => [ha * Math.cos(k * 2 * Math.PI / SIDES), hb * Math.sin(k * 2 * Math.PI / SIDES)])
  const faces = corners.map(([x0, y0], k) => {
    const [x1, y1] = corners[(k + 1) % SIDES]!, length = Math.hypot(y1! - y0!, x0! - x1!)
    const normal: [number, number] = [(y1! - y0!) / length, (x0! - x1!) / length]
    return { normal, reach: normal[0] * x0! + normal[1] * y0! }
  })
  return {
    inside: ([x, y]: [number, number]) => faces.every(f => f.normal[0] * x + f.normal[1] * y <= f.reach + 1e-4),
    leave([x, y]: [number, number], [dx, dy]: [number, number]): Leave | null {
      let enter = -Infinity, exit = Infinity, face = faces[0]!
      for (const f of faces) {
        const along = f.normal[0] * dx + f.normal[1] * dy, room = f.reach - f.normal[0] * x - f.normal[1] * y
        if (Math.abs(along) < 1e-12) { if (room < -1e-4) return null; continue }
        const t = room / along
        if (along > 0 && t < exit) { exit = t; face = f } else if (along < 0 && t > enter) enter = t
      }
      if (!Number.isFinite(exit) || enter > exit + 1e-4) return null
      return { hit: [x + dx * exit, y + dy * exit], normal: face.normal, reach: face.reach }
    },
  }
}
