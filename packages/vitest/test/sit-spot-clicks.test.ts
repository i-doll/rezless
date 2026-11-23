import { describe, expect, it } from 'vitest'
import { PRIM_TYPE_BOX, PRIM_TYPE_CYLINDER, PRIM_TYPE_PRISM, PRIM_TYPE_SPHERE, type Vector } from '@rezless/vm'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlSitTarget: "If the object has no sit
// target, the avatar is seated at a position chosen by the simulator."
// sit-spot-camera-click.test.ts pins the line from the camera to the clicked
// spot. This file holds a larger set of clicks.
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm 7.3.0 with RLVa,
// 2026-11-23) with one avatar, on an unturned prim without a sit target
// centred at <123, 52, z>. Before each click the avatar walked near the prim
// and turned to face it; the viewer either moved its own camera and waited
// for the region to see it, or left it at rest behind the avatar, then sent
// the sit request with an offset from the prim's centre in region axes, as a
// click on that spot does. A script in the prim read the avatar's last
// standing position and rotation, then its link's PRIM_POS_LOCAL and
// PRIM_ROT_LOCAL in changed(CHANGED_LINK). Each row gives the shape, size and
// centre height, the avatar's region position and heading in degrees, the
// camera's region position (null: at rest), the offset (null: no click), and
// the seat's position and rotation (null: refused with "There is no suitable
// surface to sit on").

type Shape = 'box' | 'cylinder' | 'sphere' | 'prism'
type Click = [string, Shape, Vector, number, Vector, number, Vector | null, Vector | null, Vector | null, [number, number, number, number] | null]

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'
const KIND = { box: PRIM_TYPE_BOX, cylinder: PRIM_TYPE_CYLINDER, sphere: PRIM_TYPE_SPHERE, prism: PRIM_TYPE_PRISM }
const v = (x: number, y: number, z: number) => ({ x, y, z })

// Clicks on a 1 m box's top. The avatar sat at a side, in line with the
// clicked spot. Rays across the top from the spot towards the camera, away
// from it and towards the avatar each reach a side; the avatar sat at the one
// of those sides nearest the spot, in every click where one was nearest.
// Three batches moved the box to <123.3, 52.7> and <122.6, 51.35>; those rows
// are given as if the box stood at <123, 52>, and the same clicks took the
// same sides at all three places.
const TOP: Click[] = [
  ['box, camera at -3.0, -3.0, 1.9, click at -0.3, -0.3, 0.5: -X', 'box', v(1, 1, 1), 1997.47, v(117.635, 51.768, 1997.421), -1.722, v(119.987, 49.007, 1999.37), v(-0.3, -0.3, 0.5), v(-0.59, -0.3, 1.13), [0, 0, 1, 0]],
  ['box, camera at -3.0, -3.0, 1.9, click at -0.3, 0, 0.5: -X', 'box', v(1, 1, 1), 1997.47, v(117.615, 52.091, 1997.421), -4.231, v(119.988, 49.007, 1999.37), v(-0.3, 0, 0.5), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at -3.0, -3.0, 1.9, click at 0, 0.3, 0.5: +Y', 'box', v(1, 1, 1), 1997.47, v(117.595, 52.002, 1997.421), -3.965, v(119.989, 49.006, 1999.37), v(0, 0.3, 0.5), v(0, 0.59, 1.13), [0, 0, 0.707, 0.707]],
  ['box, camera at -3.0, -3.0, 1.9, click at 0, -0.3, 0.5: -Y', 'box', v(1, 1, 1), 1997.47, v(117.796, 51.621, 1997.421), 7.046, v(119.989, 49.006, 1999.37), v(0, -0.3, 0.5), v(0, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['box, camera at -3.0, -3.0, 1.9, click at 0.3, 0.3, 0.5: +X', 'box', v(1, 1, 1), 1997.47, v(117.818, 52.434, 1997.421), -4.084, v(119.989, 49.007, 1999.37), v(0.3, 0.3, 0.5), v(0.59, 0.3, 1.13), [0, 0, 0, 1]],
  ['box, camera at -3.0, -3.0, 1.9, click at 0.3, 0, 0.5: +X', 'box', v(1, 1, 1), 1997.47, v(117.803, 52.209, 1997.421), 2.058, v(119.988, 49.007, 1999.37), v(0.3, 0, 0.5), v(0.59, 0, 1.13), [0, 0, 0, 1]],
  ['box, camera at 0.0, -4.0, 1.9, click at 0, 0, 0.5: -Y', 'box', v(1, 1, 1), 1997.47, v(128.552, 52.003, 1997.421), -175.948, v(123.02, 48.01, 1999.37), v(0, 0, 0.5), v(0, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['box, camera at 0.0, -4.0, 1.9, click at 0, 0.3, 0.5: +Y', 'box', v(1, 1, 1), 1997.47, v(128.532, 52.112, 1997.421), -175.157, v(123.014, 48.007, 1999.37), v(0, 0.3, 0.5), v(0, 0.59, 1.13), [0, 0, 0.707, 0.707]],
  ['box, camera at 0.0, -4.0, 1.9, click at -0.3, -0.3, 0.5: -Y', 'box', v(1, 1, 1), 1997.47, v(128.174, 51.607, 1997.421), 173.186, v(123.02, 48.009, 1999.37), v(-0.3, -0.3, 0.5), v(-0.3, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['box, camera at 0.0, -4.0, 1.9, click at 0.3, 0, 0.5: +X', 'box', v(1, 1, 1), 1997.47, v(128.152, 52.34, 1997.421), -175.5, v(123.021, 48.011, 1999.37), v(0.3, 0, 0.5), v(0.59, 0, 1.13), [0, 0, 0, 1]],
  ['box, camera at 0.0, -4.0, 1.9, click at 0.3, 0.3, 0.5: +Y', 'box', v(1, 1, 1), 1997.47, v(128.55, 51.996, 1997.421), 174.11, v(123.02, 48.009, 1999.37), v(0.3, 0.3, 0.5), v(0.3, 0.59, 1.13), [0, 0, 0.707, 0.707]],
  ['box, camera at 0.0, -4.0, 1.9, click at 0, -0.3, 0.5: -Y', 'box', v(1, 1, 1), 1997.47, v(128.12, 51.636, 1997.421), 174.261, v(123.017, 48.008, 1999.37), v(0, -0.3, 0.5), v(0, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['box, camera at 0.0, -4.0, 1.9, click at -0.3, 0.3, 0.5: +Y', 'box', v(1, 1, 1), 1997.47, v(128.123, 51.667, 1997.421), 175.5, v(123.022, 48.009, 1999.37), v(-0.3, 0.3, 0.5), v(-0.3, 0.59, 1.13), [0, 0, 0.707, 0.707]],
  ['box, camera at 2.0, -4.0, 1.9, click at 0, -0.3, 0.5: -Y', 'box', v(1, 1, 1), 1997.47, v(119.719, 48.136, 1997.421), 47.955, v(124.984, 47.995, 1999.37), v(0, -0.3, 0.5), v(0, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['box, camera at 2.0, -4.0, 1.9, click at -0.3, 0, 0.5: -X', 'box', v(1, 1, 1), 1997.47, v(119.794, 48.165, 1997.421), 52.166, v(124.986, 47.996, 1999.37), v(-0.3, 0, 0.5), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at 2.0, -4.0, 1.9, click at 0.3, 0.3, 0.5: +X', 'box', v(1, 1, 1), 1997.47, v(119.656, 48.102, 1997.421), 46.559, v(124.982, 47.995, 1999.37), v(0.3, 0.3, 0.5), v(0.59, 0.3, 1.13), [0, 0, 0, 1]],
  ['box, camera at 2.0, -4.0, 1.9, click at 0, 0.3, 0.5: +Y', 'box', v(1, 1, 1), 1997.47, v(119.212, 48.745, 1997.421), 42.756, v(124.981, 47.997, 1999.37), v(0, 0.3, 0.5), v(0, 0.59, 1.13), [0, 0, 0.707, 0.707]],
  ['box, camera at 2.0, -4.0, 1.9, click at 0.3, 0, 0.5: +X', 'box', v(1, 1, 1), 1997.47, v(119.695, 48.314, 1997.421), 47.886, v(124.982, 47.996, 1999.37), v(0.3, 0, 0.5), v(0.59, 0, 1.13), [0, 0, 0, 1]],
  ['box, camera at 2.0, -4.0, 1.9, click at 0.3, -0.3, 0.5: -Y', 'box', v(1, 1, 1), 1997.47, v(118.978, 48.764, 1997.421), 34.878, v(124.978, 47.997, 1999.37), v(0.3, -0.3, 0.5), v(0.3, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['box, camera at 0.0, -4.0, 1.9, click at 0, 0, 0.5: -Y (2)', 'box', v(1, 1, 1), 1997.47, v(117.822, 52.393, 1997.421), -3.446, v(122.983, 48.009, 1999.37), v(0, 0, 0.5), v(0, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['box, camera at 0.0, -4.0, 1.9, click at 0.2, 0, 0.5: -Y', 'box', v(1, 1, 1), 1997.47, v(117.843, 52.391, 1997.421), -6.23, v(122.978, 48.012, 1999.37), v(0.2, 0, 0.5), v(0.2, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['box, camera at 0.0, -4.0, 1.9, click at 0.4, 0, 0.5: -Y', 'box', v(1, 1, 1), 1997.47, v(117.852, 52.371, 1997.421), -5.631, v(122.982, 48.01, 1999.37), v(0.4, 0, 0.5), v(0.4, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['box, camera at 0.0, -4.0, 1.9, click at -0.2, 0.2, 0.5: +Y', 'box', v(1, 1, 1), 1997.47, v(117.712, 52.501, 1997.421), -6.531, v(122.98, 48.011, 1999.37), v(-0.2, 0.2, 0.5), v(-0.2, 0.59, 1.13), [0, 0, 0.707, 0.707]],
  ['box, camera at 0.0, -4.0, 1.9, click at 0, 0, 0.5: -Y (3)', 'box', v(1, 1, 1), 1997.47, v(117.705, 52.262, 1997.421), -2.362, v(122.981, 48.01, 1999.37), v(0, 0, 0.5), v(0, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['box, camera at 0.0, -4.0, 1.9, click at 0.2, 0, 0.5: -Y (2)', 'box', v(1, 1, 1), 1997.47, v(117.754, 52.501, 1997.421), -7.207, v(122.979, 48.012, 1999.37), v(0.2, 0, 0.5), v(0.2, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['box, camera at 0.0, -4.0, 1.9, click at 0.4, 0, 0.5: -Y (2)', 'box', v(1, 1, 1), 1997.47, v(117.858, 52.384, 1997.421), -6.275, v(122.984, 48.009, 1999.37), v(0.4, 0, 0.5), v(0.4, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['box, camera at 0.0, -4.0, 1.9, click at -0.2, 0.2, 0.5: +Y (2)', 'box', v(1, 1, 1), 1997.47, v(119.58, 51.407, 1997.421), 11.731, v(122.987, 48.006, 1999.37), v(-0.2, 0.2, 0.5), v(-0.2, 0.59, 1.13), [0, 0, 0.707, 0.707]],
  ['box, camera at 0.0, -4.0, 1.9, click at 0, 0, 0.5: -Y (4)', 'box', v(1, 1, 1), 1997.47, v(117.851, 51.794, 1997.421), 2.317, v(122.982, 48.008, 1999.37), v(0, 0, 0.5), v(0, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['box, camera at 0.0, -4.0, 1.9, click at 0.2, 0, 0.5: -Y (3)', 'box', v(1, 1, 1), 1997.47, v(119.591, 51.269, 1997.421), 8.42, v(122.989, 48.005, 1999.37), v(0.2, 0, 0.5), v(0.2, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['box, camera at 0.0, -4.0, 1.9, click at 0.4, 0, 0.5: -Y (3)', 'box', v(1, 1, 1), 1997.47, v(117.915, 52.376, 1997.421), -4.669, v(122.985, 48.009, 1999.37), v(0.4, 0, 0.5), v(0.4, -0.59, 1.13), [0, 0, -0.707, 0.707]],
  ['box, camera at 0.0, -4.0, 1.9, click at -0.2, 0.2, 0.5: +Y (3)', 'box', v(1, 1, 1), 1997.47, v(117.823, 52.384, 1997.421), -9.331, v(122.983, 48.01, 1999.37), v(-0.2, 0.2, 0.5), v(-0.2, 0.59, 1.13), [0, 0, 0.707, 0.707]],
]
// Where two of those sides were equally near the spot, rezless takes the side
// the ray towards the camera reaches, then the one away from it. Second Life
// took another side in these clicks. Taken pair by pair, its choices go round
// in a circle: the avatar's side over the camera's, the camera's over the far
// side, the far side over the avatar's, so no order of the three fits them.
const TOP_MISSED: Click[] = [
  ['box, camera at -3.0, -3.0, 1.9, click at -0.3, 0.3, 0.5: +Y', 'box', v(1, 1, 1), 1997.47, v(119.054, 52.665, 1997.421), -11.407, v(119.99, 49.01, 1999.37), v(-0.3, 0.3, 0.5), v(-0.3, 0.59, 1.13), [0, 0, 0.707, 0.707]],
  ['box, camera at -3.0, -3.0, 1.9, click at 0.3, -0.3, 0.5: +X', 'box', v(1, 1, 1), 1997.47, v(117.808, 51.6, 1997.421), 6.654, v(119.989, 49.005, 1999.37), v(0.3, -0.3, 0.5), v(0.59, -0.3, 1.13), [0, 0, 0, 1]],
  ['box, camera at -3.0, -3.0, 1.9, click at 0, 0, 0.5: +Y', 'box', v(1, 1, 1), 1997.47, v(117.771, 51.579, 1997.421), 3.506, v(119.989, 49.005, 1999.37), v(0, 0, 0.5), v(0, 0.59, 1.13), [0, 0, 0.707, 0.707]],
  ['box, camera at 0.0, -4.0, 1.9, click at 0.3, -0.3, 0.5: +X', 'box', v(1, 1, 1), 1997.47, v(128.109, 52.271, 1997.421), -178.582, v(123.019, 48.01, 1999.37), v(0.3, -0.3, 0.5), v(0.59, -0.3, 1.13), [0, 0, 0, 1]],
  ['box, camera at 0.0, -4.0, 1.9, click at -0.3, 0, 0.5: +Y', 'box', v(1, 1, 1), 1997.47, v(128.252, 52.405, 1997.421), -176.581, v(123.02, 48.011, 1999.37), v(-0.3, 0, 0.5), v(-0.3, 0.59, 1.13), [0, 0, 0.707, 0.707]],
  ['box, camera at 2.0, -4.0, 1.9, click at -0.3, -0.3, 0.5: -X', 'box', v(1, 1, 1), 1997.47, v(121.076, 49.585, 1997.421), 58.181, v(124.987, 47.998, 1999.37), v(-0.3, -0.3, 0.5), v(-0.59, -0.3, 1.13), [0, 0, 1, 0]],
  ['box, camera at 2.0, -4.0, 1.9, click at -0.3, 0.3, 0.5: -X', 'box', v(1, 1, 1), 1997.47, v(119.677, 48.223, 1997.421), 47.05, v(124.985, 47.996, 1999.37), v(-0.3, 0.3, 0.5), v(-0.59, 0.3, 1.13), [0, 0, 1, 0]],
  ['box, camera at 2.0, -4.0, 1.9, click at 0, 0, 0.5: +Y', 'box', v(1, 1, 1), 1997.47, v(119.737, 48.277, 1997.421), 46.693, v(124.985, 47.996, 1999.37), v(0, 0, 0.5), v(0, 0.59, 1.13), [0, 0, 0.707, 0.707]],
  ['box, camera at 0.0, -4.0, 1.9, click at -0.2, -0.2, 0.5: -X', 'box', v(1, 1, 1), 1997.47, v(117.745, 51.536, 1997.421), 6.783, v(122.983, 48.007, 1999.37), v(-0.2, -0.2, 0.5), v(-0.59, -0.2, 1.13), [0, 0, 1, 0]],
  ['box, camera at 0.0, -4.0, 1.9, click at -0.2, -0.2, 0.5: -X (2)', 'box', v(1, 1, 1), 1997.47, v(117.707, 51.557, 1997.421), 3.356, v(122.983, 48.007, 1999.37), v(-0.2, -0.2, 0.5), v(-0.59, -0.2, 1.13), [0, 0, 1, 0]],
  ['box, camera at 0.0, -4.0, 1.9, click at -0.2, -0.2, 0.5: -X (3)', 'box', v(1, 1, 1), 1997.47, v(119.513, 52.46, 1997.421), -4.693, v(122.989, 48.008, 1999.37), v(-0.2, -0.2, 0.5), v(-0.59, -0.2, 1.13), [0, 0, 1, 0]],
]
// Clicks on a side of a box, below and above its centre. The avatar sat at
// the top of the clicked side, in line with the spot.
const LOW: Click[] = [
  ['box, camera at rest, click at -0.5, 0, -0.2: -X', 'box', v(1, 1, 1), 1997.47, v(117.777, 51.615, 1997.421), -52.117, null, v(-0.5, 0, -0.2), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at rest, click at -0.5, 0, -0.45: -X', 'box', v(1, 1, 1), 1997.47, v(120.623, 51.709, 1997.421), -5.14, null, v(-0.5, 0, -0.45), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at rest, click at -0.5, 0, -0.3: -X', 'box', v(1, 1, 1), 1997.47, v(120.101, 51.649, 1997.421), 111.033, null, v(-0.5, 0, -0.3), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at rest, click at -0.5, 0, -0.3: -X (2)', 'box', v(1, 1, 1), 1997.47, v(120.832, 52.069, 1997.421), -13.317, null, v(-0.5, 0, -0.3), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at rest, click at -0.5, 0, -0.3: -X (3)', 'box', v(1, 1, 1), 1997.47, v(118.793, 51.938, 1997.421), -11.885, null, v(-0.5, 0, -0.3), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at rest, click at -0.5, 0, -0.2: -X (2)', 'box', v(1, 1, 1), 1997.47, v(117.336, 51.851, 1997.421), 99.766, null, v(-0.5, 0, -0.2), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at rest, click at -0.5, 0, -0.2: -X (3)', 'box', v(1, 1, 1), 1997.47, v(119.87, 52.136, 1997.421), -8.546, null, v(-0.5, 0, -0.2), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at rest, click at -0.5, 0, -0.35: -X', 'box', v(1, 1, 1), 1997.47, v(119.295, 52.162, 1997.421), -125.499, null, v(-0.5, 0, -0.35), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at rest, click at -0.5, 0, -0.45: -X (2)', 'box', v(1, 1, 1), 1997.47, v(120.775, 52.001, 1997.421), -6.107, null, v(-0.5, 0, -0.45), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at rest, click at -0.5, 0, -0.2: -X (4)', 'box', v(1, 1, 1), 1997.47, v(118.724, 52.16, 1997.421), -93.722, null, v(-0.5, 0, -0.2), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at rest, click at -0.5, 0, -0.3: -X (4)', 'box', v(1, 1, 1), 1997.47, v(119.713, 52.138, 1997.421), -6.461, null, v(-0.5, 0, -0.3), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at rest, click at -0.5, 0, -0.2: -X (5)', 'box', v(1, 1, 1), 1997.47, v(119.221, 52.16, 1997.421), -19.004, null, v(-0.5, 0, -0.2), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at rest, click at -0.5, 0, -0.35: -X (2)', 'box', v(1, 1, 1), 1997.47, v(119.724, 52, 1997.421), -0.904, null, v(-0.5, 0, -0.35), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at -3.0, 0.0, 1.9, click at -0.5, 0, -0.4: -X', 'box', v(1, 1, 1), 1997.47, v(117.172, 52.004, 1997.42), -3.895, v(119.987, 52, 1999.37), v(-0.5, 0, -0.4), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at -4.0, 0.0, 3.5, click at -0.5, 0, -0.3: -X', 'box', v(1, 1, 1), 1997.47, v(119.231, 52.002, 1997.417), -4.003, v(118.995, 52, 2000.997), v(-0.5, 0, -0.3), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at -3.0, 0.0, 1.9, click at -0.5, 0, -0.3: -X', 'box', v(1, 1, 1), 1997.47, v(118.943, 52, 1997.421), -5.855, v(119.991, 52, 1999.37), v(-0.5, 0, -0.3), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at -1.5, 0.0, 0.5, click at -0.5, 0, -0.4: -X', 'box', v(1, 1, 1), 1997.47, v(117.419, 51.801, 1997.421), 5.544, v(121.485, 51.999, 1998.003), v(-0.5, 0, -0.4), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at -4.0, 0.0, 3.5, click at -0.5, 0, -0.4: -X', 'box', v(1, 1, 1), 1997.47, v(120.867, 52, 1997.421), -4.003, v(118.997, 52, 2000.996), v(-0.5, 0, -0.4), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at -1.5, 0.0, 0.5, click at -0.5, 0, -0.3: -X', 'box', v(1, 1, 1), 1997.47, v(118.799, 52, 1997.421), 4.003, v(121.486, 52, 1998.003), v(-0.5, 0, -0.3), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at -6.0, 0.0, 1.9, click at -0.5, 0, -0.3: -X', 'box', v(1, 1, 1), 1997.47, v(120.867, 52, 1997.421), -4.003, v(117.002, 52, 1999.37), v(-0.5, 0, -0.3), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at -5.0, 0.0, 4.0, click at -0.5, 0, -0.3: -X', 'box', v(1, 1, 1), 1997.47, v(117.33, 51.612, 1997.421), 2.135, v(117.992, 51.999, 2001.495), v(-0.5, 0, -0.3), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at -5.0, 0.0, 4.0, click at -0.5, 0, -0.4: -X', 'box', v(1, 1, 1), 1997.47, v(117.101, 52.004, 1997.42), -3.895, v(117.99, 52, 2001.494), v(-0.5, 0, -0.4), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at -6.0, 0.0, 1.9, click at -0.5, 0, -0.4: -X', 'box', v(1, 1, 1), 1997.47, v(120.05, 52.056, 1997.421), -3.661, v(117, 52, 1999.37), v(-0.5, 0, -0.4), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at -6.0, 0.0, 0.8, click at -0.5, 0, -0.1: -X', 'box', v(1, 1, 1), 1997.47, v(121.856, 51.493, 1997.421), 18.685, v(117.005, 51.996, 1998.272), v(-0.5, 0, -0.1), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at -6.0, 0.0, 0.3, click at -0.5, 0, 0: -X', 'box', v(1, 1, 1), 1997.47, v(119.447, 51.976, 1997.421), -3.23, v(116.999, 52, 1997.773), v(-0.5, 0, 0), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at -6.0, 0.0, 0.8, click at -0.5, 0, 0: -X', 'box', v(1, 1, 1), 1997.47, v(119.516, 52.003, 1997.416), -4.021, v(116.999, 52, 1998.272), v(-0.5, 0, 0), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at -6.0, 0.0, 0.8, click at -0.5, 0, 0.2: -X', 'box', v(1, 1, 1), 1997.47, v(119.587, 52.002, 1997.416), -4.003, v(116.999, 52, 1998.272), v(-0.5, 0, 0.2), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at -6.0, 0.0, 1.3, click at -0.5, 0, 0.2: -X', 'box', v(1, 1, 1), 1997.47, v(119.586, 52.002, 1997.421), -3.958, v(116.999, 52, 1998.771), v(-0.5, 0, 0.2), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at -6.0, 0.0, 1.3, click at -0.5, 0, 0: -X', 'box', v(1, 1, 1), 1997.47, v(121.436, 52, 1997.421), -4, v(117.003, 52, 1998.771), v(-0.5, 0, 0), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at -6.0, 0.0, 0.3, click at -0.5, 0, 0.2: -X', 'box', v(1, 1, 1), 1997.47, v(119.516, 52.002, 1997.416), -4.003, v(116.999, 52, 1997.772), v(-0.5, 0, 0.2), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at -6.0, 0.0, 1.3, click at -0.5, 0, -0.1: -X', 'box', v(1, 1, 1), 1997.47, v(119.654, 51.999, 1997.413), -5.851, v(116.999, 52, 1998.771), v(-0.5, 0, -0.1), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['box, camera at -6.0, 0.0, 0.3, click at -0.5, 0, -0.1: -X', 'box', v(1, 1, 1), 1997.47, v(121.365, 52, 1997.421), -4.028, v(117.002, 52, 1997.773), v(-0.5, 0, -0.1), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['1 x 1 x 2 m box, camera at -6.0, 0.0, 1.9, click at -0.5, 0, -0.7: -X', 'box', v(1, 1, 2), 1997.97, v(120.287, 52.622, 1997.421), -10.395, v(117.001, 52.002, 1999.869), v(-0.5, 0, -0.7), v(-0.59, 0, 1.63), [0, 0, 1, 0]],
  ['1 x 1 x 2 m box, camera at -6.0, 0.0, 1.9, click at -0.5, 0, -0.1: -X', 'box', v(1, 1, 2), 1997.97, v(118.594, 52.003, 1997.421), -4.014, v(116.998, 52, 1999.869), v(-0.5, 0, -0.1), v(-0.59, 0, 1.63), [0, 0, 1, 0]],
  ['1 x 1 x 2 m box, camera at -4.0, 0.0, 1.0, click at -0.5, 0, -0.9: -X', 'box', v(1, 1, 2), 1997.97, v(118.593, 52.002, 1997.421), -4.049, v(118.993, 52, 1998.971), v(-0.5, 0, -0.9), v(-0.59, 0, 1.63), [0, 0, 1, 0]],
  ['1 x 1 x 2 m box, camera at -4.0, 0.0, 1.0, click at -0.5, 0, -0.3: -X', 'box', v(1, 1, 2), 1997.97, v(120.428, 52.005, 1997.421), -0.901, v(118.997, 52, 1998.971), v(-0.5, 0, -0.3), v(-0.59, 0, 1.63), [0, 0, 1, 0]],
  ['1 x 1 x 2 m box, camera at -6.0, 0.0, 1.9, click at -0.5, 0, -0.3: -X', 'box', v(1, 1, 2), 1997.97, v(118.807, 52.003, 1997.418), -4.024, v(116.997, 52, 1999.869), v(-0.5, 0, -0.3), v(-0.59, 0, 1.63), [0, 0, 1, 0]],
  ['1 x 1 x 2 m box, camera at -4.0, 0.0, 1.0, click at -0.5, 0, -0.7: -X', 'box', v(1, 1, 2), 1997.97, v(118.593, 52.002, 1997.421), -4.031, v(118.993, 52, 1998.971), v(-0.5, 0, -0.7), v(-0.59, 0, 1.63), [0, 0, 1, 0]],
  ['1 x 1 x 2 m box, camera at -6.0, 0.0, 1.9, click at -0.5, 0, -0.5: -X', 'box', v(1, 1, 2), 1997.97, v(118.807, 52.003, 1997.418), -4.014, v(116.998, 52, 1999.869), v(-0.5, 0, -0.5), v(-0.59, 0, 1.63), [0, 0, 1, 0]],
  ['1 x 1 x 2 m box, camera at -4.0, 0.0, 1.0, click at -0.5, 0, -0.5: -X', 'box', v(1, 1, 2), 1997.97, v(118.665, 52.003, 1997.421), -4.024, v(118.994, 52, 1998.971), v(-0.5, 0, -0.5), v(-0.59, 0, 1.63), [0, 0, 1, 0]],
  ['1 x 1 x 2 m box, camera at -6.0, 0.0, 1.9, click at -0.5, 0, -0.4: -X', 'box', v(1, 1, 2), 1997.97, v(118.668, 52.005, 1997.418), -3.895, v(116.997, 52, 1999.869), v(-0.5, 0, -0.4), v(-0.59, 0, 1.63), [0, 0, 1, 0]],
  ['0.5 x 0.5 x 0.5 m box, camera at -1.5, 0.0, 0.3, click at -0.25, 0, -0.2: at -0.34, 0', 'box', v(0.5, 0.5, 0.5), 1997.47, v(118.451, 52.002, 1997.421), -4.021, v(121.489, 52, 1997.773), v(-0.25, 0, -0.2), v(-0.34, 0, 0.88), [0, 0, 1, 0]],
  ['0.5 x 0.5 x 0.5 m box, camera at -1.5, 0.0, 0.3, click at -0.25, 0, -0.1: at -0.34, 0', 'box', v(0.5, 0.5, 0.5), 1997.47, v(118.487, 52.005, 1997.421), -3.867, v(121.49, 52, 1997.773), v(-0.25, 0, -0.1), v(-0.34, 0, 0.88), [0, 0, 1, 0]],
  ['0.5 x 0.5 x 0.5 m box, camera at -6.0, 0.0, 1.9, click at -0.25, 0, -0.2: at -0.34, 0', 'box', v(0.5, 0.5, 0.5), 1997.47, v(118.769, 52.002, 1997.421), -3.971, v(116.998, 52, 1999.37), v(-0.25, 0, -0.2), v(-0.34, 0, 0.88), [0, 0, 1, 0]],
  ['0.5 x 0.5 x 0.5 m box, camera at -6.0, 0.0, 1.9, click at -0.25, 0, -0.15: at -0.34, 0', 'box', v(0.5, 0.5, 0.5), 1997.47, v(118.556, 52.002, 1997.421), -3.975, v(116.998, 52, 1999.37), v(-0.25, 0, -0.15), v(-0.34, 0, 0.88), [0, 0, 1, 0]],
  ['0.5 x 0.5 x 0.5 m box, camera at -6.0, 0.0, 1.9, click at -0.25, 0, -0.1: at -0.34, 0', 'box', v(0.5, 0.5, 0.5), 1997.47, v(118.129, 52.004, 1997.421), -5.607, v(116.997, 52, 1999.37), v(-0.25, 0, -0.1), v(-0.34, 0, 0.88), [0, 0, 1, 0]],
  ['0.5 x 0.5 x 0.5 m box, camera at -6.0, 0.0, 1.9, click at -0.25, 0, 0: at -0.34, 0', 'box', v(0.5, 0.5, 0.5), 1997.47, v(118.557, 52.005, 1997.421), -4.231, v(116.998, 52, 1999.37), v(-0.25, 0, 0), v(-0.34, 0, 0.88), [0, 0, 1, 0]],
]
// The region refused these low clicks. A click refused from one camera was
// taken from a camera nearer or higher, and deeper clicks needed a steeper
// line from the camera, but the line's slope at which it refused changed with
// the box's size: on the 2 m tall box a click 0.1 m above the bottom was
// refused at a slope where one on the 1 m box was taken, and on the 0.5 m box
// every click was taken. sit-spot-shapes.test.ts maps more sizes and camera
// heights; no rule fits them either, so rezless seats them all.
const LOW_MISSED: Click[] = [
  ['box, camera at rest, click at -0.5, 0, -0.35: refused', 'box', v(1, 1, 1), 1997.47, v(118.674, 52.165, 1997.421), -2.186, null, v(-0.5, 0, -0.35), null, null],
  ['box, camera at rest, click at -0.5, 0, -0.4: refused', 'box', v(1, 1, 1), 1997.47, v(119.365, 52.151, 1997.421), -2.381, null, v(-0.5, 0, -0.4), null, null],
  ['box, camera at rest, click at -0.5, 0, -0.35: refused (2)', 'box', v(1, 1, 1), 1997.47, v(117.953, 51.64, 1997.421), 4.08, null, v(-0.5, 0, -0.35), null, null],
  ['box, camera at rest, click at -0.5, 0, -0.3: refused', 'box', v(1, 1, 1), 1997.47, v(117.735, 52.076, 1997.416), -0.823, null, v(-0.5, 0, -0.3), null, null],
  ['box, camera at rest, click at -0.5, 0, -0.45: refused', 'box', v(1, 1, 1), 1997.47, v(117.738, 52.079, 1997.421), -0.863, null, v(-0.5, 0, -0.45), null, null],
  ['box, camera at rest, click at -0.5, 0, -0.35: refused (3)', 'box', v(1, 1, 1), 1997.47, v(117.314, 52.049, 1997.421), -0.49, null, v(-0.5, 0, -0.35), null, null],
  ['box, camera at rest, click at -0.5, 0, -0.45: refused (2)', 'box', v(1, 1, 1), 1997.47, v(118.948, 51.974, 1997.421), 0.367, null, v(-0.5, 0, -0.45), null, null],
  ['box, camera at rest, click at -0.5, 0, -0.4: refused (2)', 'box', v(1, 1, 1), 1997.47, v(117.279, 52.32, 1997.421), -3.198, null, v(-0.5, 0, -0.4), null, null],
  ['box, camera at rest, click at -0.5, 0, -0.4: refused (3)', 'box', v(1, 1, 1), 1997.47, v(117.753, 52.091, 1997.421), -0.992, null, v(-0.5, 0, -0.4), null, null],
  ['box, camera at rest, click at -0.5, 0, -0.4: refused (4)', 'box', v(1, 1, 1), 1997.47, v(118.8, 52.165, 1997.421), -2.252, null, v(-0.5, 0, -0.4), null, null],
  ['box, camera at rest, click at -0.5, 0, -0.4: refused (5)', 'box', v(1, 1, 1), 1997.47, v(118.232, 52.135, 1997.421), -1.62, null, v(-0.5, 0, -0.4), null, null],
  ['box, camera at rest, click at -0.5, 0, -0.45: refused (3)', 'box', v(1, 1, 1), 1997.47, v(118.801, 52.001, 1997.41), -0.013, null, v(-0.5, 0, -0.45), null, null],
  ['box, camera at -13.0, 0.0, 1.9, click at -0.5, 0, -0.3: refused', 'box', v(1, 1, 1), 1997.47, v(117.289, 52, 1997.404), 0.003, v(110.01, 52, 1999.37), v(-0.5, 0, -0.3), null, null],
  ['box, camera at -8.0, 0.0, 1.9, click at -0.5, 0, -0.4: refused', 'box', v(1, 1, 1), 1997.47, v(119.339, 52, 1997.4), 0.005, v(115.002, 52, 1999.37), v(-0.5, 0, -0.4), null, null],
  ['box, camera at -11.0, 0.0, 0.0, click at -0.5, 0, -0.4: refused', 'box', v(1, 1, 1), 1997.47, v(119.157, 52, 1997.405), 0.004, v(112.009, 52, 1997.504), v(-0.5, 0, -0.4), null, null],
  ['box, camera at -8.0, 0.0, 1.9, click at -0.5, 0, -0.3: refused', 'box', v(1, 1, 1), 1997.47, v(117.291, 52, 1997.404), -0.002, v(114.998, 52, 1999.37), v(-0.5, 0, -0.3), null, null],
  ['box, camera at -11.0, 0.0, 0.0, click at -0.5, 0, -0.3: refused', 'box', v(1, 1, 1), 1997.47, v(119.411, 52, 1997.399), 0.005, v(112.01, 52, 1997.504), v(-0.5, 0, -0.3), null, null],
  ['box, camera at -8.0, 0.0, 1.9, click at -0.5, 0, -0.4: refused (2)', 'box', v(1, 1, 1), 1997.47, v(116.953, 52, 1997.418), 0.003, v(114.996, 52, 1999.37), v(-0.5, 0, -0.4), null, null],
  ['box, camera at -13.0, 0.0, 1.9, click at -0.5, 0, -0.4: refused', 'box', v(1, 1, 1), 1997.47, v(120.866, 51.999, 1997.421), 0.028, v(110.019, 52, 1999.37), v(-0.5, 0, -0.4), null, null],
  ['box, camera at -8.0, 0.0, 1.9, click at -0.5, 0, -0.3: refused (2)', 'box', v(1, 1, 1), 1997.47, v(119.234, 52.224, 1997.421), -3.403, v(115.003, 52.001, 1999.37), v(-0.5, 0, -0.3), null, null],
  ['box, camera at -13.0, 0.0, 1.9, click at -0.5, 0, -0.4: refused (2)', 'box', v(1, 1, 1), 1997.47, v(117.281, 51.999, 1997.421), 0.007, v(110.01, 52, 1999.37), v(-0.5, 0, -0.4), null, null],
  ['box, camera at -13.0, 0.0, 1.9, click at -0.5, 0, -0.3: refused (2)', 'box', v(1, 1, 1), 1997.47, v(120.866, 51.999, 1997.421), 0.025, v(110.02, 52, 1999.37), v(-0.5, 0, -0.3), null, null],
  ['box, camera at -6.0, 0.0, 0.8, click at -0.5, 0, -0.3: refused', 'box', v(1, 1, 1), 1997.47, v(119.783, 52, 1997.421), 0.005, v(116.999, 52, 1998.272), v(-0.5, 0, -0.3), null, null],
  ['box, camera at -6.0, 0.0, 0.3, click at -0.5, 0, -0.3: refused', 'box', v(1, 1, 1), 1997.47, v(119.792, 52.001, 1997.406), -0.009, v(116.999, 52, 1997.773), v(-0.5, 0, -0.3), null, null],
  ['box, camera at -6.0, 0.0, 1.3, click at -0.5, 0, -0.3: refused', 'box', v(1, 1, 1), 1997.47, v(119.696, 51.999, 1997.421), 0.01, v(116.999, 52, 1998.771), v(-0.5, 0, -0.3), null, null],
  ['1 x 1 x 2 m box, camera at -6.0, 0.0, 1.9, click at -0.5, 0, -0.9: refused', 'box', v(1, 1, 2), 1997.97, v(118.662, 52, 1997.413), 0.004, v(116.992, 52, 1999.867), v(-0.5, 0, -0.9), null, null],
]
// Clicks on a cylinder's side seat the avatar where the line from the camera
// to the spot first meets the round side, 0.09 m out from it, as without a
// click. A click on a cylinder's top seats the avatar at the round edge
// nearest the spot, by the rays a box's top uses (sit-spot-shapes.test.ts has
// more). An unturned prism seated the avatar at the side towards the camera,
// as a box does, though two clicks pinned further down sat about 2.5 cm
// lower. Where the camera rests these allow 3.5 cm, since its place is known
// only from the avatar's heading, which moves the seat only across.
const SHAPE: Click[] = [
  ['cylinder, camera at rest, no click: -X', 'cylinder', v(1, 1, 1), 1997.47, v(118.665, 52.005, 1997.418), -3.898, null, null, v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['cylinder, camera at rest, click at -0.4, 0.3, 0: at -0.472, 0.354', 'cylinder', v(1, 1, 1), 1997.47, v(118.806, 51.947, 1997.421), -5.197, null, v(-0.4, 0.3, 0), v(-0.472, 0.354, 1.13), [0, 0, 0.949, 0.316]],
  ['cylinder, camera at rest, click at 0, 0.5, 0: +Y', 'cylinder', v(1, 1, 1), 1997.47, v(120.558, 52.248, 1997.421), -9.827, null, v(0, 0.5, 0), v(0, 0.59, 1.13), [0, 0, 0.707, 0.707]],
  ['cylinder, camera at rest, click at 0.5, 0, 0: -X', 'cylinder', v(1, 1, 1), 1997.47, v(120.625, 52.553, 1997.421), -15.132, null, v(0.5, 0, 0), v(-0.543, 0.23, 1.13), [0, 0, 0.98, 0.199]],
  ['cylinder, camera at rest, click at -0.5, 0, 0.3: -X', 'cylinder', v(1, 1, 1), 1997.47, v(118.681, 51.758, 1997.421), 8.286, null, v(-0.5, 0, 0.3), v(-0.59, 0, 1.13), [0, 0, 1, 0]],
  ['prism, camera at rest, click at -0.25, 0.3, 0: -X', 'prism', v(1, 1, 1), 1997.47, v(118.785, 52.161, 1997.421), 3.384, null, v(-0.25, 0.3, 0), v(-0.59, 0.299, 1.13), [0, 0, 1, 0]],
  ['prism, camera at rest, click at 0.5, 0, -0.3: -X', 'prism', v(1, 1, 1), 1997.47, v(118.687, 52.025, 1997.421), -0.341, null, v(0.5, 0, -0.3), v(-0.59, 0.014, 1.13), [0, 0, 1, 0]],
  ['prism, camera at rest, click at -0.4, 0, -0.3: -X', 'prism', v(1, 1, 1), 1997.47, v(120.251, 52.025, 1997.421), 4.318, null, v(-0.4, 0, -0.3), v(-0.59, 0.002, 1.13), [0, 0, 1, 0]],
  ['cylinder, camera at rest, click at -0.3, 0, 0.5: -X', 'cylinder', v(1, 1, 1), 1997.47, v(118.813, 52.27, 1997.421), -1.617, null, v(-0.3, 0, 0.5), v(-0.59, 0.005, 1.13), [0, 0, 1, 0.009]],
  ['cylinder, camera at rest, click at -0.3, -0.3, 0: at -0.492, -0.325', 'cylinder', v(1, 1, 1), 1997.47, v(120.359, 52.374, 1997.421), -2.513, null, v(-0.3, -0.3, 0), v(-0.492, -0.325, 1.13), [0, 0, 0.958, -0.288]],
  ['cylinder, camera at rest, click at 0, 0.3, 0.5: +Y', 'cylinder', v(1, 1, 1), 1997.47, v(120.451, 52.162, 1997.421), -6.212, null, v(0, 0.3, 0.5), v(-0.327, 0.546, 1.13), [0, 0, 0.948, 0.317]],
  ['cylinder, camera at rest, click at 0.3, 0, 0.5: +X', 'cylinder', v(1, 1, 1), 1997.47, v(118.687, 52.003, 1997.421), -3.923, null, v(0.3, 0, 0.5), v(0.59, 0, 1.13), [0, 0, 0, 1]],
  ['cylinder, camera at rest, click at 0, -0.3, 0.5: -Y', 'cylinder', v(1, 1, 1), 1997.47, v(118.734, 52.006, 1997.418), -4.237, null, v(0, -0.3, 0.5), v(0.309, -0.554, 1.13), [0, 0, -0.337, 0.942]],
  ['cylinder, camera at rest, click at 0.2, 0.2, 0.5: +X', 'cylinder', v(1, 1, 1), 1997.47, v(118.792, 52.457, 1997.421), -7.133, null, v(0.2, 0.2, 0.5), v(0.506, 0.323, 1.13), [0, 0, 0.19, 0.982]],
  ['cylinder, camera at rest, click at 0, 0.3, 0.5: +Y (2)', 'cylinder', v(1, 1, 1), 1997.47, v(120.656, 52.626, 1997.421), -9.486, null, v(0, 0.3, 0.5), v(-0.249, 0.572, 1.13), [0, 0, 0.915, 0.403]],
]
// Clicks on spheres and prisms, where rezless does not follow Second Life. A
// sphere seated the avatar at heights that follow its surface, and a prism
// twice seated it 2.5 cm lower; sit-spot-shapes.test.ts has more of both.
// Three clicks were refused: two on a sphere's sides across the line from the
// camera and one on a prism's ridge.
const SHAPE_MISSED: Click[] = [
  ['prism, camera at rest, no click: -X', 'prism', v(1, 1, 1), 1997.47, v(118.844, 52.156, 1997.421), 2.191, null, null, v(-0.59, 0.018, 1.105), [0, 0, 1, 0]],
  ['prism, camera at rest, click at 0, 0.5, 0: -X', 'prism', v(1, 1, 1), 1997.47, v(118.797, 52.091, 1997.421), -2.167, null, v(0, 0.5, 0), v(-0.59, 0.478, 1.104), [0, 0, 1, 0]],
  ['sphere, camera at rest, no click: -X', 'sphere', v(1, 1, 1), 1997.47, v(118.52, 52.002, 1997.421), -4.003, null, null, v(-0.509, 0, 1.132), [0, 0, 1, 0]],
  ['sphere, camera at rest, click at -0.4, 0.3, 0: +Y', 'sphere', v(1, 1, 1), 1997.47, v(118.672, 52.002, 1997.421), -3.975, null, v(-0.4, 0.3, 0), v(-0.405, 0.533, 0.931), [0, 0, 0.949, 0.316]],
  ['sphere, camera at rest, click at 0, 0.5, 0: refused', 'sphere', v(1, 1, 1), 1997.47, v(120.531, 52.334, 1997.421), -7.697, null, v(0, 0.5, 0), null, null],
  ['sphere, camera at rest, click at 0.5, 0, 0: at -0.483, 0.333', 'sphere', v(1, 1, 1), 1997.47, v(120.427, 52.812, 1997.421), -12.012, null, v(0.5, 0, 0), v(-0.483, 0.333, 1.105), [0, 0, 0.961, 0.276]],
  ['sphere, camera at rest, click at 0, 0, 0.5: at -0.439, 0.047', 'sphere', v(1, 1, 1), 1997.47, v(120.687, 52.231, 1997.421), -9.827, null, v(0, 0, 0.5), v(-0.439, 0.047, 1.184), [0, 0, 0.999, 0.054]],
  ['sphere, camera at rest, click at -0.354, 0, 0.354: -X', 'sphere', v(1, 1, 1), 1997.47, v(118.789, 51.995, 1997.421), 4.909, null, v(-0.354, 0, 0.354), v(-0.641, 0, 0.992), [0, 0, 1, 0]],
  ['prism, camera at rest, click at 0, 0.3, 0.5: refused', 'prism', v(1, 1, 1), 1997.47, v(118.995, 52.155, 1997.403), -2.214, null, v(0, 0.3, 0.5), null, null],
  ['sphere, camera at rest, click at -0.5, 0, 0: -X', 'sphere', v(1, 1, 1), 1997.47, v(120.837, 51.835, 1997.421), 6.621, null, v(-0.5, 0, 0), v(-0.59, 0, 1.048), [0, 0, 1, 0]],
  ['sphere, camera at rest, click at -0.3, -0.4, 0: at -0.354, -0.472', 'sphere', v(1, 1, 1), 1997.47, v(118.665, 52.001, 1997.421), -3.93, null, v(-0.3, -0.4, 0), v(-0.354, -0.472, 0.876), [0, 0, 0.894, -0.447]],
  ['sphere, camera at rest, click at 0, -0.5, 0: refused', 'sphere', v(1, 1, 1), 1997.47, v(120.272, 51.784, 1997.421), 4.531, null, v(0, -0.5, 0), null, null],
  ['sphere, camera at rest, click at -0.25, 0, 0.433: -X', 'sphere', v(1, 1, 1), 1997.47, v(118.853, 52.469, 1997.421), -6.373, null, v(-0.25, 0, 0.433), v(-0.598, 0.015, 1.084), [0, 0, 1, 0.022]],
  ['sphere, camera at rest, click at -0.433, 0, -0.25: -X', 'sphere', v(1, 1, 1), 1997.47, v(118.73, 52.009, 1997.421), -4.669, null, v(-0.433, 0, -0.25), v(-0.654, 0, 0.873), [0, 0, 1, 0]],
]
async function sit([, shape, size, z, at, heading, camera, click]: Click) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const half = heading * Math.PI / 360
  const avatar = world.addAvatar({ region: 'home', key: AVATAR, name: 'av', username: 'av', position: at, rotation: { x: 0, y: 0, z: Math.sin(half), s: Math.cos(half) } })
  const { linkset } = await loadLinkset({ world, region: 'home', owner: AVATAR, position: v(123, 52, z), prims: [{}] })
  const prim = linkset.prims[0]!
  prim.params.size = size
  prim.params.shape = { ...prim.params.shape, kind: KIND[shape] }
  if (camera) world.setAvatarCamera(avatar, camera)
  return world.getSitResponse(avatar, prim, click ?? undefined)
}

async function check(row: Click) {
  const response = await sit(row)
  const [, , , , , , camera, , want, rotation] = row
  if (!want) return expect(response).toBeNull()
  const { position, rotation: rot } = response!
  expect(Math.hypot(position.x - want.x, position.y - want.y)).toBeLessThan(camera ? 0.005 : 0.035)
  expect(Math.abs(position.z - want.z)).toBeLessThan(0.005)
  const [qx, qy, qz, qs] = rotation!
  expect(rot!.x * qx + rot!.y * qy + rot!.z * qz + rot!.s * qs).toBeGreaterThan(0.999)
}

describe('where a click seats an avatar on a prim without a sit target', () => {
  it.each(TOP)('%s', async (...row) => { await check(row) })
  it.fails.each(TOP_MISSED)('%s', async (...row) => { await check(row) })
  it.each(LOW)('%s', async (...row) => { await check(row) })
  it.fails.each(LOW_MISSED)('%s', async (...row) => { await check(row) })
  it.each(SHAPE)('%s', async (...row) => { await check(row) })
  it.fails.each(SHAPE_MISSED)('%s', async (...row) => { await check(row) })

  // Not measured: the same box turned over about X keeps its top facing up, so
  // a click there takes the same side.
  it('takes the same side on a box turned upside down', async () => {
    const row = TOP.find(r => r[0].startsWith('box, camera at 0.0, -4.0, 1.9, click at 0.3, 0, 0.5'))!
    const upright = await sit(row)
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const half = row[5] * Math.PI / 360
    const avatar = world.addAvatar({ region: 'home', key: AVATAR, name: 'av', username: 'av', position: row[4], rotation: { x: 0, y: 0, z: Math.sin(half), s: Math.cos(half) } })
    const { linkset } = await loadLinkset({ world, region: 'home', owner: AVATAR, position: v(123, 52, row[3]), prims: [{}] })
    linkset.prims[0]!.params.size = row[2]
    linkset.prims[0]!.params.rotation = { x: 1, y: 0, z: 0, s: 0 }
    world.setAvatarCamera(avatar, row[6]!)
    const over = world.getSitResponse(avatar, linkset.prims[0]!, row[7]!)!
    // The seat is in the prim's frame, so the turned box reads it with Y and Z flipped.
    expect(over.position.x).toBeCloseTo(upright!.position.x, 3)
    expect(over.position.y).toBeCloseTo(-upright!.position.y, 3)
  })

  // Not measured: a click on a cylinder's edge, seen from the side, seats the
  // avatar there, though the spot rounds to just outside the round side.
  it('seats a click on the edge of a cylinder seen from the side at that spot', async () => {
    const plain = SHAPE.find(row => row[0] === 'cylinder, camera at rest, no click: -X')!
    const edge: Click = [...plain]
    edge[6] = v(123 - 3.7, 52 + 3.4, plain[3] + 1)
    edge[7] = v(0.3, 0.4, 0)
    const { position } = (await sit(edge))!
    expect(Math.atan2(position.y, position.x)).toBeCloseTo(Math.atan2(0.4, 0.3), 2)
  })

  // Not measured: a viewer only sends spots on the prim. A spot beside a
  // cylinder, off the line's way round it, takes the line to its centre.
  it('takes the line to a cylinder\'s centre when the line to the spot misses it', async () => {
    const plain = SHAPE.find(row => row[0] === 'cylinder, camera at rest, no click: -X')!
    const beside: Click = [...plain]
    beside[7] = v(0, 3, 0)
    expect((await sit(beside))!.position).toEqual((await sit(plain))!.position)
  })
})
