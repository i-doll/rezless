import { describe, expect, it } from 'vitest'
import type { Prim } from '@rezless/vm'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlSetStatus lists the STATUS_* flags.
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm 7.3.0,
// 2026-11-14): linked 0.5 m boxes built by the viewer, with the same script
// in link 1 and link 2. A command set a flag from one link, and each script
// read the flags back with llGetStatus, PRIM_PHYSICS and PRIM_PHANTOM of
// links 1 and 2, and OBJECT_PHYSICS and OBJECT_PHANTOM. Every "In-world:"
// note in this file is from those probes.

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'
const NULL = '00000000-0000-0000-0000-000000000000'
const SCRIPT = `list read;
integer mask() { integer m; integer f = 1; while (f <= 1024) { if (llGetStatus(f)) m = m | f; f = f << 1; } return m; }
default { link_message(integer s, integer n, string m, key id) {
  list a = llParseString2List(m, [" "], []);
  string c = llList2String(a, 0);
  integer v = (integer)llList2String(a, 1);
  integer w = (integer)llList2String(a, 2);
  if (c == "status") llSetStatus(v, w);
  else if (c == "lphys") llSetLinkPrimitiveParamsFast(v, [PRIM_PHYSICS, w]);
  else if (c == "rotlook") llRotLookAt(llEuler2Rot(<0.0, 0.0, (float)v> * DEG_TO_RAD), 1.0, 1.0);
  else if (c == "look") llLookAt(llGetPos() + <(float)v, (float)w, 0.0>, 1.0, 1.0);
  read = [mask()] + llGetLinkPrimitiveParams(1, [PRIM_PHYSICS, PRIM_PHANTOM])
    + llGetLinkPrimitiveParams(2, [PRIM_PHYSICS, PRIM_PHANTOM])
    + llGetObjectDetails(llGetKey(), [OBJECT_PHYSICS, OBJECT_PHANTOM]);
} }`

async function linked(prims = 2) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const object = await loadLinkset({
    world, region: 'home', owner: AVATAR, position: { x: 120, y: 51, z: 20 },
    prims: Array.from({ length: prims }, (_, i) => (i < 2 ? { scripts: [{ name: `link${i + 1}`, source: { source: SCRIPT } }] } : {})),
  })
  object.linkset.prims.forEach((prim, i) => { if (i) prim.params.position = { x: 0, y: i * 0.5, z: 0 } })
  for (const script of Object.values(object.scripts)) script.start()
  const run = (link: 1 | 2, command: string) => {
    const script = object.scripts[`link${link}`]!
    script.fire('link_message', { sender_num: link, num: 0, str: command, id: NULL })
    object.linkset.advanceTime(100)
    return script.global('read') as number[]
  }
  return { object, run }
}

// The flags, PRIM_PHYSICS and PRIM_PHANTOM of links 1 and 2, OBJECT_PHYSICS and OBJECT_PHANTOM.
const flags = (mask: number) => {
  const physics = mask & 1, phantom = mask & 16 ? 1 : 0
  return [mask, physics, phantom, physics, phantom, physics, phantom]
}

describe('STATUS_* flags of a linked object', () => {
  // In-world: both scripts of a new object read 14, STATUS_ROTATE_X, _Y and
  // _Z, and no other flag.
  it('starts with the rotation flags set', async () => {
    const s = await linked()
    expect([s.run(1, 'read'), s.run(2, 'read')]).toEqual([flags(14), flags(14)])
  })

  // In-world: llSetStatus(STATUS_PHYSICS, TRUE) from link 2 made both
  // scripts read the flag, PRIM_PHYSICS 1 for both links and OBJECT_PHYSICS 1.
  // FALSE from the root cleared it for both. TRUE from the root's
  // llSetLinkPrimitiveParamsFast(2, [PRIM_PHYSICS, TRUE]) and FALSE from link
  // 2's llSetLinkPrimitiveParamsFast(1, [PRIM_PHYSICS, FALSE]) did the same.
  it('turns the whole object physical from any prim', async () => {
    const s = await linked(4)
    expect(s.run(2, 'status 1 1')).toEqual(flags(15))
    expect(s.run(1, 'read')).toEqual(flags(15))
    expect(s.run(1, 'status 1 0')).toEqual(flags(14))
    expect(s.run(2, 'read')).toEqual(flags(14))
    expect(s.run(1, 'lphys 2 1')).toEqual(flags(15))
    expect(s.run(2, 'read')).toEqual(flags(15))
    expect(s.run(2, 'lphys 1 0')).toEqual(flags(14))
    expect(s.run(1, 'read')).toEqual(flags(14))
  })

  // In-world: link 2 set STATUS_PHANTOM, _SANDBOX, _BLOCK_GRAB, _DIE_AT_EDGE,
  // _RETURN_AT_EDGE, _CAST_SHADOWS and _BLOCK_GRAB_OBJECT to TRUE in one call.
  // Both scripts then read 1534, every one of them but STATUS_CAST_SHADOWS,
  // with PRIM_PHANTOM 1 for both links and OBJECT_PHANTOM 1. The root cleared
  // them and both read 14. Link 2 cleared the three rotation flags and both
  // read 0; the root set them again and both read 14.
  it('keeps every flag for the whole object', async () => {
    const s = await linked(4)
    expect(s.run(2, 'status 2032 1')).toEqual(flags(1534))
    expect(s.run(1, 'read')).toEqual(flags(1534))
    expect(s.run(1, 'status 2032 0')).toEqual(flags(14))
    expect(s.run(2, 'read')).toEqual(flags(14))
    expect(s.run(2, 'status 14 0')).toEqual(flags(0))
    expect(s.run(1, 'read')).toEqual(flags(0))
    expect(s.run(1, 'status 14 1')).toEqual(flags(14))
    expect(s.run(2, 'read')).toEqual(flags(14))
  })
})

describe('STATUS_* flags when prims are linked and unlinked', () => {
  // In-world: STATUS_CAST_SHADOWS set to TRUE from the root of two linked
  // boxes, and then from link 2, read FALSE from both scripts.
  it('never reads STATUS_CAST_SHADOWS as set', async () => {
    const s = await linked()
    expect(s.run(1, 'status 512 1')).toEqual(flags(14))
    expect(s.run(2, 'status 512 1')).toEqual(flags(14))
    expect(s.run(1, 'read')).toEqual(flags(14))
  })

  // In-world: three linked boxes, A the root. B set STATUS_PHANTOM and
  // STATUS_BLOCK_GRAB and cleared STATUS_ROTATE_X; A read 92. The viewer
  // unlinked C, which then read 30 (phantom and the three rotation flags),
  // while A still read 92. It then unlinked A, which kept 92, and B on its
  // own read 30.
  it('keeps the phantom flag on an unlinked prim and resets the rest', async () => {
    const s = await linked(3)
    const [a, b, c] = s.object.linkset.prims as [Prim, Prim, Prim]
    s.run(2, 'status 80 1')
    expect(s.run(2, 'status 2 0')[0]).toBe(92)
    s.object.linkset.breakOff(c)
    expect([c.statusFlags, a.statusFlags]).toEqual([30, 92])
    s.object.linkset.breakOff(a)
    expect([a.statusFlags, b.statusFlags]).toEqual([92, 30])
  })

  // In-world: three linked boxes, H the root. I set PRIM_TEMP_ON_REZ and then
  // STATUS_PHYSICS, _SANDBOX, _DIE_AT_EDGE, _RETURN_AT_EDGE and
  // _BLOCK_GRAB_OBJECT; H read 1455. The viewer unlinked J, which then read 15
  // (physics and the rotation flags) with OBJECT_TEMP_ON_REZ 1. H still read
  // 1455.
  it('keeps the physics flag on an unlinked prim and resets the rest', async () => {
    const s = await linked(3)
    const [h, , j] = s.object.linkset.prims as [Prim, Prim, Prim]
    expect(s.run(2, 'status 1441 1')[0]).toBe(1455)
    s.object.linkset.breakOff(j)
    expect([j.statusFlags, h.statusFlags]).toEqual([15, 1455])
  })

  // In-world: a lone box D set STATUS_PHANTOM and the viewer linked it to a
  // box E as E's child. Both then read 14, not phantom. A lone phantom box F
  // linked as the root over a box G: both read 30, phantom.
  it("gives the linked object its new root's flags", async () => {
    const lone = async (phantom: boolean) => {
      const s = await linked(1)
      if (phantom) s.run(1, 'status 16 1')
      return s.object.linkset
    }
    const e = await lone(false), d = await lone(true)
    e.absorb(d)
    expect(e.prims.map((p) => p.statusFlags)).toEqual([14, 14])
    const f = await lone(true), g = await lone(false)
    f.absorb(g)
    expect(f.prims.map((p) => p.statusFlags)).toEqual([30, 30])
  })
})

describe('llLookAt and llRotLookAt in a child prim of an object that is not physical', () => {
  const rotations = `vector own; vector local; vector root; default { link_message(integer s, integer n, string m, key id) {
    if (m == "rotlook") llRotLookAt(llEuler2Rot(<0.0, 0.0, 45.0> * DEG_TO_RAD), 1.0, 1.0);
    if (m == "rotlookself") llRotLookAt(llGetRot(), 1.0, 1.0);
    if (m == "look") llLookAt(llGetPos() + <0.0, 3.0, 0.0>, 1.0, 1.0);
    own = llRot2Euler(llGetRot()) * RAD_TO_DEG;
    local = llRot2Euler(llGetLocalRot()) * RAD_TO_DEG;
    root = llRot2Euler(llGetRootRotation()) * RAD_TO_DEG;
  } }`

  // https://wiki.secondlife.com/wiki/LlRotLookAt and
  // https://wiki.secondlife.com/wiki/LlLookAt do not say what a child prim
  // turns to. In-world, the root turned 90 degrees about Z: llRotLookAt to 45
  // degrees from link 2 turned link 2 to 45 degrees in the object (135 in the
  // region) and left the root at 90. llRotLookAt(llGetRot(), 1, 1) then turned
  // it to 135 in the object (-135 in the region). llLookAt at a point 3 m
  // along Y turned it to <-90, 0, 90> in the object.
  it('turns the child within the object to the rotation asked for', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const object = await loadLinkset({
      world, region: 'home', owner: AVATAR, position: { x: 120, y: 51, z: 20 },
      prims: [{}, { scripts: [{ name: 'child', source: { source: rotations } }] }],
    })
    object.linkset.prims[0]!.params.rotation = { x: 0, y: 0, z: Math.SQRT1_2, s: Math.SQRT1_2 }
    object.linkset.prims[1]!.params.position = { x: 0, y: 0.5, z: 0 }
    const script = object.scripts.child!
    script.start()
    const read = (command: string) => {
      script.fire('link_message', { sender_num: 2, num: 0, str: command, id: NULL })
      return ['own', 'local', 'root'].map((name) => {
        const v = script.global(name) as { x: number; y: number; z: number }
        return [v.x, v.y, v.z].map((n) => Math.round(n) + 0)
      })
    }
    expect(read('rotlook')).toEqual([[0, 0, 135], [0, 0, 45], [0, 0, 90]])
    expect(read('rotlookself')).toEqual([[0, 0, -135], [0, 0, 135], [0, 0, 90]])
    expect(read('look')[1]).toEqual([-90, 0, 90])
  })
})
