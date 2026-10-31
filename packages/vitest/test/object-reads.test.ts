import { describe, it, expect } from 'vitest'
import { loadLinkset, World, type PrimInput, type Vector } from '../src/index.js'
import { InventoryType, makeInventoryItem } from '@rezless/vm'

const OWNER = 'af576265-1cc4-46de-98d1-1d0d64d10d3b'
const ROOT = '72cae641-7b24-c8e3-12c9-a49ecf6a1955'
const CHILD = '99d42a32-d0fd-5ad3-c88f-39ad6b7df977'
const BEE = 'ff943def-0d63-319b-0800-5705c23fdf3c'
const UNKNOWN = '6a3c0e6e-1f6d-4a3b-9b62-2f0c1d1e7a55'
const NULL_KEY = '00000000-0000-0000-0000-000000000000'

/**
 * The probe objects on Aditi: a 0.5 m box root with a 1 x 0.5 x 0.25 m box
 * child 1.5 m along x, and a separate 0.4 x 0.6 x 0.8 m sphere named "Bee",
 * turned 90 degrees about y, all in SLua Tideland. `setup` runs in the root
 * before `body`, as the in-world probe scripts did.
 */
async function probe(body: string, setup = '', child: PrimInput = {}) {
  const world = new World({ startUnixTime: 1_793_430_028 })
  world.addRegion('SLua Tideland', { x: 40960, y: 23296 })
  const { scripts } = await loadLinkset({
    world,
    region: 'SLua Tideland',
    owner: OWNER,
    position: { x: 118, y: 50, z: 1998.5 },
    prims: [
      {
        key: ROOT,
        scripts: [
          {
            name: 'probe',
            source: {
              source: `key ROOT = "${ROOT}"; key CHILD = "${CHILD}"; key BEE = "${BEE}"; key UNKNOWN = "${UNKNOWN}"; list out;
                default { state_entry() {
                  llSetLinkPrimitiveParamsFast(2, [PRIM_POS_LOCAL, <1.5, 0, 0>, PRIM_SIZE, <1, 0.5, 0.25>]);
                  ${setup}
                  ${body}
                } }`,
            },
          },
        ],
      },
      { key: CHILD, ...child },
    ],
  })
  const bee = await loadLinkset({
    world,
    region: 'SLua Tideland',
    owner: OWNER,
    position: { x: 118, y: 53, z: 1998.5 },
    prims: [
      {
        key: BEE,
        name: 'Bee',
        description: 'bdesc',
        scripts: [
          {
            name: 'bee',
            source: {
              source: `default { state_entry() { llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_SIZE, <0.4, 0.6, 0.8>, PRIM_ROTATION, llEuler2Rot(<0, 90, 0> * DEG_TO_RAD), PRIM_TYPE, PRIM_TYPE_SPHERE, PRIM_HOLE_DEFAULT, <0, 1, 0>, 0.0, <0, 0, 0>, <0, 1, 0>]); llRemoveInventory(llGetScriptName()); } }`,
            },
          },
        ],
      },
    ],
  })
  bee.scripts.bee!.start()
  scripts.kid?.start()
  scripts.probe!.start()
  return scripts.probe!.global('out') as unknown[]
}

const close = (v: Vector, digits = 5) => ({
  x: expect.closeTo(v.x, digits),
  y: expect.closeTo(v.y, digits),
  z: expect.closeTo(v.z, digits),
})

describe('llKey2Name, llGetObjectPrimCount and llGetObjectLinkKey', () => {
  // In-world: llKey2Name(root) -> "Object", (child) -> "Object", (Bee) -> "Bee";
  // llGetObjectPrimCount -> 2 for the root and the child, 1 for Bee; an
  // upper-case root key reads the same as the root.
  it('reads the prim name and the linkset prim count', async () => {
    expect(
      await probe(
        'out = [llKey2Name(ROOT), llKey2Name(CHILD), llKey2Name(BEE), llKey2Name(llToUpper(ROOT)), llGetObjectPrimCount(ROOT), llGetObjectPrimCount(CHILD), llGetObjectPrimCount(BEE)];',
      ),
    ).toEqual(['Object', 'Object', 'Bee', 'Object', 2, 2, 1])
  })

  // In-world: an unknown key, NULL_KEY, "junk" and the key of an inventory
  // item -> "", 0, 0.0, NULL_KEY link keys, [] bounding box and [] details.
  it('reads nothing for a key with no prim', async () => {
    for (const k of [`UNKNOWN`, 'NULL_KEY', '"junk"', 'llGetInventoryKey(llGetScriptName())']) {
      expect(
        await probe(
          `out = [llKey2Name(${k}), llGetObjectPrimCount(${k}), llGetObjectMass(${k}), llGetObjectLinkKey(${k}, 0), llGetObjectLinkKey(${k}, 1), llGetListLength(llGetBoundingBox(${k})), llGetListLength(llGetObjectDetails(${k}, [OBJECT_NAME, OBJECT_POS]))];`,
        ),
      ).toEqual(['', 0, 0, NULL_KEY, NULL_KEY, 0, 0])
    }
  })

  // In-world: for the root or the child, links 0 and 1 -> root, 2 -> child,
  // -1, -2, 3 and 100 -> NULL_KEY; LINK_THIS -> the prim of the key given.
  // For Bee, links 0 and 1 -> Bee and 2 -> NULL_KEY.
  it('reads link keys of the linkset holding a key', async () => {
    expect(
      await probe(
        'out = [llGetObjectLinkKey(ROOT, 0), llGetObjectLinkKey(CHILD, 1), llGetObjectLinkKey(ROOT, 2), llGetObjectLinkKey(ROOT, -1), llGetObjectLinkKey(ROOT, -2), llGetObjectLinkKey(ROOT, 3), llGetObjectLinkKey(ROOT, 100), llGetObjectLinkKey(CHILD, LINK_THIS), llGetObjectLinkKey(ROOT, LINK_THIS), llGetObjectLinkKey(BEE, 0), llGetObjectLinkKey(BEE, 1), llGetObjectLinkKey(BEE, 2)];',
      ),
    ).toEqual([ROOT, ROOT, CHILD, NULL_KEY, NULL_KEY, NULL_KEY, NULL_KEY, CHILD, ROOT, BEE, BEE, NULL_KEY])
  })
})

describe('llGetObjectMass', () => {
  // In-world: root 2.5 (both 0.125 m^3 boxes), child 1.25, Bee 1.005310
  // (an ellipsoid at density 1000 is 100.53 kg, read in hundreds of kg).
  it('reads the linkset mass for a root and the prim mass for a child', async () => {
    const [root, child, bee] = await probe('out = [llGetObjectMass(ROOT), llGetObjectMass(CHILD), llGetObjectMass(BEE)];')
    expect(root).toBeCloseTo(2.5, 5)
    expect(child).toBeCloseTo(1.25, 5)
    expect(bee).toBeCloseTo(1.00531, 5)
  })

  // In-world, a lone 0.4 x 0.6 x 0.8 m prim: box 1.92, hollow 0.5 1.44, cut
  // 0..0.5 0.96, taper to a point 0.64, cylinder 1.507965, prism 0.623538,
  // sphere 1.005310, density 500 0.96, 10 m cube 10000, 0.01 m cube 0.00001.
  it('reads volume times density for boxes, cylinders, prisms and spheres', async () => {
    const shapes: [string, number][] = [
      ['PRIM_TYPE, PRIM_TYPE_BOX, PRIM_HOLE_DEFAULT, <0,1,0>, 0.0, <0,0,0>, <1,1,0>, <0,0,0>', 1.92],
      ['PRIM_TYPE, PRIM_TYPE_BOX, PRIM_HOLE_DEFAULT, <0,1,0>, 0.5, <0,0,0>, <1,1,0>, <0,0,0>', 1.44],
      ['PRIM_TYPE, PRIM_TYPE_BOX, PRIM_HOLE_DEFAULT, <0,0.5,0>, 0.0, <0,0,0>, <1,1,0>, <0,0,0>', 0.96],
      ['PRIM_TYPE, PRIM_TYPE_BOX, PRIM_HOLE_DEFAULT, <0,1,0>, 0.0, <0,0,0>, <0,0,0>, <0,0,0>', 0.64],
      ['PRIM_TYPE, PRIM_TYPE_CYLINDER, PRIM_HOLE_DEFAULT, <0,1,0>, 0.0, <0,0,0>, <1,1,0>, <0,0,0>', 1.507965],
      ['PRIM_TYPE, PRIM_TYPE_PRISM, PRIM_HOLE_DEFAULT, <0,1,0>, 0.0, <0,0,0>, <1,1,0>, <0,0,0>', 0.623538],
      ['PRIM_TYPE, PRIM_TYPE_SPHERE, PRIM_HOLE_DEFAULT, <0,1,0>, 0.0, <0,0,0>, <0,1,0>', 1.00531],
    ]
    for (const [type, mass] of shapes) {
      const [m] = await probe(
        `llSetLinkPrimitiveParamsFast(LINK_ROOT, [PRIM_SIZE, <0.4, 0.6, 0.8>, ${type}]); out = [llGetObjectMass(ROOT) - llGetObjectMass(CHILD)];`,
      )
      expect(m).toBeCloseTo(mass, 5)
    }
  })
  // In-world, the same prim as a default torus -> 0.753013. rezless doesn't
  // model torus, tube, ring or sculpt volumes and reads them as a solid box
  // of their size, 1.92 here.
  it('reads a torus as a solid box of its size', async () => {
    const [m] = await probe(
      'llSetLinkPrimitiveParamsFast(LINK_ROOT, [PRIM_SIZE, <0.4, 0.6, 0.8>, PRIM_TYPE, PRIM_TYPE_TORUS, PRIM_HOLE_DEFAULT, <0,1,0>, 0.0, <0,0,0>, <1,0.25,0>, <0,0,0>, <0,1,0>, <0,0,0>, 0.0, 0.0, 0.0]); out = [llGetObjectMass(ROOT) - llGetObjectMass(CHILD)];',
    )
    expect(m).toBeCloseTo(1.92, 5)
  })
})

describe('llGetObjectMass density and physics shape', () => {
  // In-world: llSetPhysicsMaterial(DENSITY, 0, 0, 0, 500.0) on the lone
  // 0.4 x 0.6 x 0.8 m box -> 0.96, half of 1.92.
  it('scales mass with density', async () => {
    const [m] = await probe(
      'llSetLinkPrimitiveParamsFast(LINK_ROOT, [PRIM_SIZE, <0.4, 0.6, 0.8>]); llSetPhysicsMaterial(DENSITY, 0, 0, 0, 500.0); out = [llGetObjectMass(ROOT) - llGetObjectMass(CHILD)];',
    )
    expect(m).toBeCloseTo(0.96, 5)
  })

  // In-world: root 1 m cube with a 2 x 1 x 1 m child -> 30.0 and OBJECT_MASS
  // 3000.0; the child as a sphere -> 20.471975; with PRIM_PHYSICS_SHAPE_NONE
  // -> 10.0, the root alone.
  it('leaves out a child with no physics shape', async () => {
    const body = (child: string) =>
      `llSetLinkPrimitiveParamsFast(LINK_ROOT, [PRIM_SIZE, <1, 1, 1>]); llSetLinkPrimitiveParamsFast(2, [PRIM_SIZE, <2, 1, 1>${child}]); out = [llGetObjectMass(ROOT), llList2Float(llGetObjectDetails(CHILD, [OBJECT_MASS]), 0)];`
    const [box, kg] = await probe(body(''))
    expect(box).toBeCloseTo(30, 4)
    expect(kg).toBeCloseTo(3000, 2)
    const [sphere] = await probe(body(', PRIM_TYPE, PRIM_TYPE_SPHERE, PRIM_HOLE_DEFAULT, <0,1,0>, 0.0, <0,0,0>, <0,1,0>'))
    expect(sphere).toBeCloseTo(20.471975, 4)
    const [none] = await probe(body(', PRIM_PHYSICS_SHAPE_TYPE, PRIM_PHYSICS_SHAPE_NONE'))
    expect(none).toBeCloseTo(10, 4)
  })
})

describe('llGetBoundingBox', () => {
  // In-world: [<-0.25, -0.25, -0.25>, <2.0, 0.25, 0.25>] for the root and the
  // child key alike; the root turned 90 degrees about z reads the same.
  it('reads the linkset box relative to the root, in its frame', async () => {
    for (const k of ['ROOT', 'CHILD']) {
      expect(await probe(`out = llGetBoundingBox(${k});`)).toEqual([
        close({ x: -0.25, y: -0.25, z: -0.25 }),
        close({ x: 2, y: 0.25, z: 0.25 }),
      ])
    }
    const turned = await probe(
      'llSetLinkPrimitiveParamsFast(LINK_ROOT, [PRIM_ROTATION, llEuler2Rot(<0, 0, 90> * DEG_TO_RAD)]); out = llGetBoundingBox(ROOT);',
    )
    expect(turned).toEqual([close({ x: -0.25, y: -0.25, z: -0.25 }), close({ x: 2, y: 0.25, z: 0.25 })])
  })

  // In-world: a lone box -> half its size whatever its rotation, and a
  // 0.01 m cube -> +-0.025.
  it('reads half the size of a lone box, at least 0.025 m', async () => {
    expect(
      await probe(
        'llSetLinkPrimitiveParamsFast(LINK_ROOT, [PRIM_SIZE, <0.01, 0.01, 0.01>]); llSetLinkPrimitiveParamsFast(2, [PRIM_SIZE, <0.01, 0.01, 0.01>, PRIM_POS_LOCAL, <0, 0, 0>]); out = llGetBoundingBox(ROOT);',
      ),
    ).toEqual([close({ x: -0.025, y: -0.025, z: -0.025 }), close({ x: 0.025, y: 0.025, z: 0.025 })])
  })

  // In-world, the child turned in the root's frame: 45 degrees about z ->
  // max <2.009619, 0.509619, 0.25>; <30, 20, 10> degrees -> min
  // <-0.25, -0.393331, -0.311996>, max <2.024724, 0.393331, 0.311996>; a
  // 4 x 2 x 1 m child at 45 degrees -> <3.600610, 2.100610, 0.5>. These
  // match a box whose edges round off by 0.05 m.
  it('rounds the edges of a turned child by 0.05 m', async () => {
    const turned = (euler: string, size = '<1, 0.5, 0.25>') =>
      probe(
        `llSetLinkPrimitiveParamsFast(2, [PRIM_SIZE, ${size}, PRIM_ROT_LOCAL, llEuler2Rot(${euler} * DEG_TO_RAD)]); out = llGetBoundingBox(ROOT);`,
      )
    expect(await turned('<0, 0, 45>')).toEqual([
      close({ x: -0.25, y: -0.509619, z: -0.25 }),
      close({ x: 2.009619, y: 0.509619, z: 0.25 }),
    ])
    expect(await turned('<30, 20, 10>')).toEqual([
      close({ x: -0.25, y: -0.393331, z: -0.311996 }),
      close({ x: 2.024724, y: 0.393331, z: 0.311996 }),
    ])
    expect((await turned('<0, 0, 45>', '<4, 2, 1>'))[1]).toEqual(close({ x: 3.60061, y: 2.10061, z: 0.5 }))
  })

  // In-world, a child of x size s turned 45 degrees about z: max x 1.726777
  // (s 0.2), 1.714277 (0.15), 1.706777 (0.12), 1.701777 (0.1), 1.696777
  // (0.08), 1.691777 (0.06), 1.689277 (0.05, 0.04, 0.03, 0.01). A 0.5 x 0.5
  // m child of z size 0.04, 0.01 -> max y 0.348376, and 0.1 -> 0.343198.
  // The rounding is half the smallest half-size up to 0.05 m, and a half-size
  // is at least 0.025 m.
  it('rounds thin children by half their smallest half-size', async () => {
    const maxAt = async (size: string) =>
      (
        (await probe(
          `llSetLinkPrimitiveParamsFast(2, [PRIM_SIZE, ${size}, PRIM_ROT_LOCAL, llEuler2Rot(<0, 0, 45> * DEG_TO_RAD)]); out = llGetBoundingBox(ROOT);`,
        ))[1] as Vector
      )
    const ladder: [number, number][] = [
      [0.2, 1.726777],
      [0.15, 1.714277],
      [0.12, 1.706777],
      [0.1, 1.701777],
      [0.08, 1.696777],
      [0.06, 1.691777],
      [0.05, 1.689277],
      [0.04, 1.689277],
      [0.03, 1.689277],
      [0.01, 1.689277],
    ]
    for (const [s, x] of ladder) expect((await maxAt(`<${s}, 0.5, 0.25>`)).x).toBeCloseTo(x, 5)
    expect((await maxAt('<0.5, 0.5, 0.04>')).y).toBeCloseTo(0.348376, 5)
    expect((await maxAt('<0.5, 0.5, 0.01>')).y).toBeCloseTo(0.348376, 5)
    expect((await maxAt('<0.5, 0.5, 0.1>')).y).toBeCloseTo(0.343198, 5)
  })

  // In-world: the child moved to <0, 1, 0.5> -> [<-0.5, -0.25, -0.25>, <0.5, 1.25, 0.625>].
  it('follows a moved child', async () => {
    expect(await probe('llSetLinkPrimitiveParamsFast(2, [PRIM_POS_LOCAL, <0, 1, 0.5>]); out = llGetBoundingBox(ROOT);')).toEqual([
      close({ x: -0.5, y: -0.25, z: -0.25 }),
      close({ x: 0.5, y: 1.25, z: 0.625 }),
    ])
  })

  // In-world, the lone 0.4 x 0.6 x 0.8 m box -> [<-0.2, -0.3, -0.4>, <0.2, 0.3, 0.4>].
  // Other shapes read their physics hull, which reaches up to 0.05 m past
  // their size: Bee read [<-0.232121, -0.312168, -0.420816>, <0.232121,
  // 0.329397, 0.420816>]. rezless reads every shape as a box of its size.
  it('reads other shapes as a box of their size', async () => {
    expect(await probe('out = llGetBoundingBox(BEE);')).toEqual([
      close({ x: -0.2, y: -0.3, z: -0.4 }),
      close({ x: 0.2, y: 0.3, z: 0.4 }),
    ])
  })
})

describe('llGetGeometricCenter', () => {
  // In-world: <0.75, 0, 0> with the child at <1.5, 0, 0>, unchanged by
  // turning the root or the child; <0, 0.5, 0.25> with the child at <0, 1, 0.5>.
  it('reads the mean prim position relative to the root', async () => {
    expect(await probe('out = [llGetGeometricCenter()];')).toEqual([{ x: 0.75, y: 0, z: 0 }])
    expect(
      await probe(
        'llSetLinkPrimitiveParamsFast(LINK_ROOT, [PRIM_ROTATION, llEuler2Rot(<0, 0, 90> * DEG_TO_RAD)]); llSetLinkPrimitiveParamsFast(2, [PRIM_ROT_LOCAL, llEuler2Rot(<0, 0, 45> * DEG_TO_RAD)]); out = [llGetGeometricCenter()];',
      ),
    ).toEqual([{ x: 0.75, y: 0, z: 0 }])
    expect(await probe('llSetLinkPrimitiveParamsFast(2, [PRIM_POS_LOCAL, <0, 1, 0.5>]); out = [llGetGeometricCenter()];')).toEqual([
      { x: 0, y: 0.5, z: 0.25 },
    ])
  })
})

const ALL_FLAGS = 'list all; integer f; for (f = 1; f <= 56; ++f) all += f;'
const ZERO = { x: 0, y: 0, z: 0 }
const PERMS = [2147483647, 2147483647, 0, 0, 532480]
const STAMP = '2026-10-31T07:00:28.000000Z'

describe('llGetObjectDetails', () => {
  // In-world, OBJECT_NAME (1) to OBJECT_VOLUME_DETECT (56) on the root;
  // OBJECT_HEALTH reads 0.0, a new box's PRIM_HEALTH. Three
  // values differ from Second Life: OBJECT_SCRIPT_TIME read 0.000036 and
  // OBJECT_STREAMING_COST 0.1, which come from the server's CPU and the
  // viewer's mesh, and OBJECT_SELECT_COUNT read 1 because the probe viewer
  // had the object selected. rezless reads them as 0.
  it('reads every flag for the root', async () => {
    expect(await probe(`${ALL_FLAGS} out = llGetObjectDetails(ROOT, all);`)).toEqual([
      'Object', '', { x: 118, y: 50, z: 1998.5 }, { x: 0, y: 0, z: 0, s: 1 }, ZERO, OWNER, NULL_KEY, OWNER,
      1, 1, 65536, 0, 2, 1, 0, 2, 0, ROOT, 0, 0, 0, 0, 0, 0, 0, -1, NULL_KEY, 0, ZERO, 2, 1, OWNER, '', 0, 0,
      STAMP, 0, 0, 0, 0, -1, 3, 250, '', STAMP, 1, { x: 0.5, y: 0.5, z: 0.5 }, ZERO, 1, 0, 0, 0, ...PERMS, ...PERMS,
      0, 0,
    ])
  })

  // In-world, the child: its own name, position, rotation, link number 2 and
  // scale, and the linkset's script counts, memory, prim count, inventory
  // count, root and mass.
  it('reads a child prim', async () => {
    const out = await probe(`${ALL_FLAGS} out = llGetObjectDetails(CHILD, all);`)
    expect(out.slice(0, 4)).toEqual(['Object', '', { x: 119.5, y: 50, z: 1998.5 }, { x: 0, y: 0, z: 0, s: 1 }])
    expect(out.slice(8, 11)).toEqual([1, 1, 65536])
    expect(out[17]).toBe(ROOT)
    expect(out.slice(29, 31)).toEqual([2, 1])
    expect(out.slice(42, 47)).toEqual([250, '', STAMP, 2, { x: 1, y: 0.5, z: 0.25 }])
  })

  // In-world, Bee: "Bee", "bdesc", its rotation <0, 0.707107, 0, 0.707107>,
  // no scripts, 0 bytes, OBJECT_PRIM_EQUIVALENCE 1, OBJECT_SERVER_COST 0.5,
  // OBJECT_PHYSICS_COST 1.0, link number 0 and OBJECT_MASS 100.530975.
  it('reads another object', async () => {
    const out = await probe(`${ALL_FLAGS} out = llGetObjectDetails(BEE, all);`)
    expect(out.slice(0, 3)).toEqual(['Bee', 'bdesc', { x: 118, y: 53, z: 1998.5 }])
    expect(out[3]).toEqual({ x: 0, y: expect.closeTo(0.707107, 5), z: 0, s: expect.closeTo(0.707107, 5) })
    expect(out.slice(8, 11)).toEqual([0, 0, 0])
    expect(out.slice(12, 16)).toEqual([1, 0.5, 0, 1])
    expect(out[17]).toBe(BEE)
    expect(out[29]).toBe(1)
    expect(out[30]).toBe(0)
    expect(out[42]).toBeCloseTo(100.530975, 4)
    expect(out[45]).toBe(0)
  })

  // In-world: [OBJECT_NAME, 999, OBJECT_DESC, 0] -> ["Object", -1, "", -1];
  // [] -> [].
  it('reads OBJECT_UNKNOWN_DETAIL for a number that is not a flag', async () => {
    expect(await probe('out = llGetObjectDetails(ROOT, [OBJECT_NAME, 999, OBJECT_DESC, 0]) + llGetObjectDetails(ROOT, []);')).toEqual([
      'Object',
      -1,
      '',
      -1,
    ])
  })

  // In-world: [OBJECT_PERMS, "x"] -> [2147483647, 2147483647, 0, 0, -1];
  // [OBJECT_NAME, "x", "y"] -> [-1]; [OBJECT_PERMS, OBJECT_NAME, "x"] -> the
  // five masks and -1. [OBJECT_POS, "x"] -> [-1]; ["x"] -> []; ["x", OBJECT_POS] ->
  // [pos]; [OBJECT_POS, OBJECT_NAME, "x", OBJECT_DESC, OBJECT_POS] -> [pos,
  // -1, "", pos]; [OBJECT_NAME, 2.0], [OBJECT_NAME, NULL_KEY] and
  // [OBJECT_NAME, "2"] -> [-1]; [OBJECT_DESC, OBJECT_NAME, 999] -> ["",
  // "Object", -1].
  it('drops an entry that is not an integer and spoils the last entry so far', async () => {
    const pos = { x: 118, y: 50, z: 1998.5 }
    const read = (flags: string) => probe(`out = llGetObjectDetails(ROOT, [${flags}]);`)
    expect(await read('OBJECT_POS, "x"')).toEqual([-1])
    expect(await read('"x"')).toEqual([])
    expect(await read('"x", OBJECT_POS')).toEqual([pos])
    expect(await read('OBJECT_POS, OBJECT_NAME, "x", OBJECT_DESC, OBJECT_POS')).toEqual([pos, -1, '', pos])
    expect(await read('OBJECT_NAME, 2.0')).toEqual([-1])
    expect(await read('OBJECT_NAME, NULL_KEY')).toEqual([-1])
    expect(await read('OBJECT_NAME, "2"')).toEqual([-1])
    expect(await read('OBJECT_PERMS, "x"')).toEqual([2147483647, 2147483647, 0, 0, -1])
    expect(await read('OBJECT_NAME, "x", "y"')).toEqual([-1])
    expect(await read('OBJECT_PERMS, OBJECT_NAME, "x"')).toEqual([...PERMS, -1])
  })

  // In-world, llGetListEntryType: OBJECT_SCRIPT_TIME, OBJECT_SERVER_COST and
  // OBJECT_MASS -> TYPE_FLOAT, OBJECT_PRIM_EQUIVALENCE and
  // OBJECT_SCRIPT_MEMORY -> TYPE_INTEGER, OBJECT_OWNER -> TYPE_KEY,
  // OBJECT_NAME -> TYPE_STRING.
  it('gives each entry its LSL type', async () => {
    expect(
      await probe(
        'list d = llGetObjectDetails(ROOT, [OBJECT_SCRIPT_TIME, OBJECT_SERVER_COST, OBJECT_MASS, OBJECT_PRIM_EQUIVALENCE, OBJECT_SCRIPT_MEMORY, OBJECT_OWNER, OBJECT_NAME]); integer i; for (i = 0; i < 7; ++i) out += llGetListEntryType(d, i);',
      ),
    ).toEqual([2, 2, 2, 1, 1, 4, 3])
  })
})

/** The child as in the follow-up probe: a script that stops itself and a notecard. */
const KID: PrimInput = {
  scripts: [{ name: 'kid', source: { source: 'default { state_entry() { llSetScriptState(llGetScriptName(), FALSE); } }' } }],
  inventory: [makeInventoryItem({ name: 'kidnote', type: InventoryType.NOTECARD })],
}

describe('llGetObjectDetails on a changed linkset', () => {
  // In-world, with a stopped script and a notecard in the child: for root and
  // child alike OBJECT_RUNNING_SCRIPT_COUNT 1, OBJECT_TOTAL_SCRIPT_COUNT 2,
  // OBJECT_SCRIPT_MEMORY 131072, OBJECT_TOTAL_INVENTORY_COUNT 3 and
  // OBJECT_SERVER_COST 1.25.
  it('counts scripts, memory and inventory across the linkset', async () => {
    for (const k of ['ROOT', 'CHILD']) {
      expect(
        await probe(
          `out = llGetObjectDetails(${k}, [OBJECT_RUNNING_SCRIPT_COUNT, OBJECT_TOTAL_SCRIPT_COUNT, OBJECT_SCRIPT_MEMORY, OBJECT_TOTAL_INVENTORY_COUNT, OBJECT_SERVER_COST]);`,
          '',
          KID,
        ),
      ).toEqual([1, 2, 131072, 3, 1.25])
    }
  })

  // In-world, the child renamed "Kid" with description "kdesc", text "hi" in
  // <1, 0, 0> at 0.5, CLICK_ACTION_SIT, PRIM_MATERIAL_METAL, PRIM_HEALTH 50 and
  // PRIM_DAMAGE [25.0, 4], and llTargetOmega(<0, 0, 1>, 2.0, 1.0) in the root
  // (a lone box with llTargetOmega(<3, 4, 0>, 1.0, 1.0) read <3, 4, 0>):
  // llKey2Name(child) -> "Kid"; the child reads its own name, description,
  // text, click action, material, health and damage; root and child both read
  // OBJECT_OMEGA <0, 0, 2>.
  it('reads appearance per prim and spin for the object', async () => {
    const flags =
      '[OBJECT_NAME, OBJECT_DESC, OBJECT_CLICK_ACTION, OBJECT_OMEGA, OBJECT_MATERIAL, OBJECT_TEXT, OBJECT_TEXT_COLOR, OBJECT_TEXT_ALPHA, OBJECT_HEALTH, OBJECT_DAMAGE, OBJECT_DAMAGE_TYPE]'
    const out = await probe(
      `out = [llKey2Name(CHILD)] + llGetObjectDetails(ROOT, ${flags}) + llGetObjectDetails(CHILD, ${flags});`,
      `llSetLinkPrimitiveParamsFast(LINK_ROOT, [PRIM_NAME, "Rooty", PRIM_DESC, "rdesc"]);
       llSetLinkPrimitiveParamsFast(2, [PRIM_NAME, "Kid", PRIM_DESC, "kdesc", PRIM_TEXT, "hi", <1, 0, 0>, 0.5,
         PRIM_CLICK_ACTION, CLICK_ACTION_SIT, PRIM_MATERIAL, PRIM_MATERIAL_METAL, PRIM_HEALTH, 50.0, PRIM_DAMAGE, 25.0, 4]);
       llTargetOmega(<0, 0, 1>, 2.0, 1.0);`,
    )
    const spin = { x: 0, y: 0, z: 2 }
    expect(out).toEqual([
      'Kid',
      ...['Rooty', 'rdesc', 0, spin, 3, '', ZERO, 1, 0, 0, 0],
      ...['Kid', 'kdesc', 1, spin, 1, 'hi', { x: 1, y: 0, z: 0 }, 0.5, 50, 25, 4],
    ])
  })

  // In-world, a lone box: llTargetOmega(<0, 0, 2>, 1.5, 1.0) -> OBJECT_OMEGA
  // <0, 0, 3>; llTargetOmega(<3, 4, 0>, 1.0, 1.0) -> <3, 4, 0>.
  it('reads spin as the axis times the rate', async () => {
    const out = await probe(
      'llTargetOmega(<0, 0, 2>, 1.5, 1.0); out = llGetObjectDetails(ROOT, [OBJECT_OMEGA]); llTargetOmega(<3, 4, 0>, 1.0, 1.0); out += llGetObjectDetails(ROOT, [OBJECT_OMEGA]);',
    )
    expect(out).toEqual([close({ x: 0, y: 0, z: 3 }), close({ x: 3, y: 4, z: 0 })])
  })

  // In-world: PRIM_PHANTOM, PRIM_TEMP_ON_REZ and STATUS_PHYSICS set on the
  // root read 1 for both the root and the child.
  it('reads phantom, temporary and physics for the whole object', async () => {
    const flags = '[OBJECT_PHANTOM, OBJECT_TEMP_ON_REZ, OBJECT_PHYSICS]'
    expect(
      await probe(
        `out = llGetObjectDetails(ROOT, ${flags}) + llGetObjectDetails(CHILD, ${flags});`,
        'llSetLinkPrimitiveParamsFast(LINK_ROOT, [PRIM_PHANTOM, TRUE, PRIM_TEMP_ON_REZ, TRUE]); llSetStatus(STATUS_PHYSICS, TRUE);',
      ),
    ).toEqual([1, 1, 1, 1, 1, 1])
  })

  // In-world, a lone prim: OBJECT_SERVER_COST 0.5 with 0 or 1 scripts, 0.75
  // with 2 and 1.0 with 3; the two-prim linkset 1.0 with 1 script and 1.25
  // with 2. That is 0.5 a prim and 0.25 for each script after the first.
  it('reads server cost from prims and scripts', async () => {
    const lone = async (n: number) => {
      const scripts = Array.from({ length: n }, (_, i) => ({
        name: `s${i}`,
        source: { source: 'list out; default { state_entry() { out = llGetObjectDetails(llGetKey(), [OBJECT_SERVER_COST]); } }' },
      }))
      const { scripts: loaded } = await loadLinkset({ prims: [{ key: BEE, scripts }] })
      loaded.s0!.start()
      return (loaded.s0!.global('out') as number[])[0]
    }
    expect([await lone(1), await lone(2), await lone(3)]).toEqual([0.5, 0.75, 1])
    expect(await probe('out = llGetObjectDetails(BEE, [OBJECT_SERVER_COST]);')).toEqual([0.5])
  })

  // In-world: with the child's physics shape set to none, the bounding box
  // shrinks to the root's [<-0.25, -0.25, -0.25>, <0.25, 0.25, 0.25>] and
  // llGetObjectMass(root) to 1.25.
  it('leaves a child with no physics shape out of the bounding box', async () => {
    const out = await probe(
      'llSetLinkPrimitiveParamsFast(2, [PRIM_PHYSICS_SHAPE_TYPE, PRIM_PHYSICS_SHAPE_NONE]); out = llGetBoundingBox(ROOT) + [llGetObjectMass(ROOT)];',
    )
    expect(out).toEqual([close({ x: -0.25, y: -0.25, z: -0.25 }), close({ x: 0.25, y: 0.25, z: 0.25 }), expect.closeTo(1.25, 5)])
  })

  // In-world: an object moved into SLua Tombolo, the region north of SLua
  // Tideland, reads "", 0, 0.0, [], NULL_KEY and [] from Tideland.
  it('reads nothing for an object in another region', async () => {
    const world = new World()
    world.addRegion('SLua Tideland', { x: 40960, y: 23296 })
    world.addRegion('SLua Tombolo', { x: 40960, y: 23552 })
    await loadLinkset({ world, region: 'SLua Tombolo', position: { x: 118, y: 3, z: 1998.5 }, prims: [{ key: BEE, name: 'Far' }] })
    const { scripts } = await loadLinkset({
      world,
      region: 'SLua Tideland',
      prims: [
        {
          key: ROOT,
          scripts: [
            {
              name: 'probe',
              source: {
                source: `key C = "${BEE}"; list out; default { state_entry() { out = [llKey2Name(C), llGetObjectPrimCount(C), llGetObjectMass(C), llGetListLength(llGetBoundingBox(C)), llGetObjectLinkKey(C, 0), llGetListLength(llGetObjectDetails(C, [OBJECT_NAME, OBJECT_POS]))]; } }`,
              },
            },
          ],
        },
      ],
    })
    scripts.probe!.start()
    expect(scripts.probe!.global('out')).toEqual(['', 0, 0, 0, NULL_KEY, 0])
  })
})

describe('looking up objects', () => {
  it('finds a prim loaded without a key', async () => {
    const { scripts } = await loadLinkset({
      prims: [{ scripts: [{ name: 'probe', source: { source: 'list out; default { state_entry() { out = llGetObjectDetails(llGetKey(), [OBJECT_NAME, OBJECT_PRIM_COUNT]); } }' } }] }, {}],
    })
    scripts.probe!.start()
    expect(scripts.probe!.global('out')).toEqual(['Object', 2])
  })

  it('stops finding an object once it calls llDie', async () => {
    const world = new World()
    world.addRegion('Here', { x: 0, y: 0 })
    const doomed = await loadLinkset({
      world,
      region: 'Here',
      prims: [{ key: BEE, name: 'Bee', scripts: [{ name: 'die', source: { source: 'default { touch_start(integer n) { llDie(); } }' } }] }],
    })
    const { scripts } = await loadLinkset({
      world,
      region: 'Here',
      prims: [
        {
          scripts: [
            {
              name: 'probe',
              source: { source: `list out; default { touch_start(integer n) { out += [llKey2Name("${BEE}"), llGetObjectPrimCount("${BEE}")]; } }` },
            },
          ],
        },
      ],
    })
    doomed.scripts.die!.start()
    scripts.probe!.start()
    scripts.probe!.linkset.touch(0)
    doomed.linkset.touch(0)
    scripts.probe!.linkset.touch(0)
    expect(scripts.probe!.global('out')).toEqual(['Bee', 1, '', 0])
  })
})
