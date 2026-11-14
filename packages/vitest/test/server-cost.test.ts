import { describe, expect, it } from 'vitest'
import { InventoryType, makeInventoryItem, PRIM_SIZE } from '@rezless/vm'
import { loadLinkset, loadScript, World, type LoadedLinkset } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlGetObjectDetails: OBJECT_SERVER_COST,
// "Gets the server cost of the object." The page gives no formula.
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm 7.3.0, 2026-11-14):
// 0.5 m boxes rezzed by the viewer, with scripts dragged in from inventory,
// read by a script in another box and, for the changes a script makes, by the
// script itself. The cost is half a point for each prim and a quarter for each
// script the region counted when it last worked the cost out, and never more
// than one point for each prim. It works the cost out again at the changes
// listed below, and when a script is added it counts the scripts that were
// there before. So a box read 0.5 with its first script until one of those
// changes, and 0.75 after. Every "In-world:" note in this file is from those
// probes.

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'
const INERT = 'default { state_entry() { } }'
const NULL = '00000000-0000-0000-0000-000000000000'
const READER = `float cost; default { link_message(integer s, integer n, string m, key id) {
  cost = llList2Float(llGetObjectDetails(id, [OBJECT_SERVER_COST]), 0);
} }`

interface Scene {
  world: World
  /** The cost another object's script reads for the object `key` is in. */
  cost(key: string): number
  /** A box in the region with `scripts` scripts dragged in, the first running `source`. */
  box(scripts: number, source?: string): Promise<LoadedLinkset>
}

async function scene(): Promise<Scene> {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const reader = await loadLinkset({
    world, region: 'home', owner: AVATAR, position: { x: 118, y: 46, z: 20 },
    prims: [{ scripts: [{ name: 'reader', source: { source: READER } }] }],
  })
  reader.scripts.reader!.start()
  let made = 0
  return {
    world,
    cost(key) {
      reader.scripts.reader!.fire('link_message', { sender_num: 1, num: 0, str: '', id: key })
      return reader.scripts.reader!.global('cost') as number
    },
    async box(scripts, source = INERT) {
      const y = 48 + made++
      const loaded = await loadLinkset({
        world, region: 'home', owner: AVATAR, position: { x: 118, y, z: 20 },
        prims: [{ scripts: Array.from({ length: scripts }, (_, i) => ({ name: `s${i}`, source: { source: i ? INERT : source } })) }],
      })
      for (const script of Object.values(loaded.scripts)) script.start()
      loaded.linkset.advanceTime(100)
      return loaded
    },
  }
}

const key = (loaded: LoadedLinkset) => loaded.linkset.prims[0]!.key
/** Run the first script's touch_start and let its events settle. */
const touch = (loaded: LoadedLinkset) => { loaded.linkset.touch(0); loaded.linkset.advanceTime(2000) }

describe('OBJECT_SERVER_COST of an object built in-world', () => {
  // In-world: a new box read 0.5 with no script, 0.5 with one, 0.75 with two
  // and 1.0 with three, read as soon as the last script was in and again
  // 20 s and two minutes later.
  it('leaves out the script added last', async () => {
    const s = await scene()
    const costs = []
    for (const scripts of [0, 1, 2, 3]) costs.push(s.cost(key(await s.box(scripts))))
    expect(costs).toEqual([0.5, 0.5, 0.75, 1])
  })

  // In-world: one script in a box read 0.5 whether it was compiled as LSL on
  // Mono, as LSL on LSO, as LSL on Luau or as SLua, whether it held a listen,
  // ran a 0.5 s timer or had stopped with a Stack-Heap Collision, and whether
  // it was dragged in running or not running.
  it('does not depend on what the script is or does', async () => {
    const s = await scene()
    const sources = [
      'default { state_entry() { llListen(991443, "", NULL_KEY, ""); } listen(integer c, string n, key i, string m) { } }',
      'default { state_entry() { llSetTimerEvent(0.5); } timer() { } }',
      'default { state_entry() { llSetScriptState(llGetScriptName(), FALSE); } }',
    ]
    for (const source of sources) expect(s.cost(key(await s.box(1, source)))).toBe(0.5)
    const slua = await loadLinkset({
      world: s.world, region: 'home', owner: AVATAR,
      prims: [{ scripts: [{ name: 'lua', language: 'slua', source: { source: 'local x = 1' } }] }],
    })
    slua.scripts.lua!.start()
    expect(s.cost(key(slua))).toBe(0.5)
  })

  // In-world: a box with one script read 0.5 before and 0.75 after
  // llSetScale(<0.6, 0.6, 0.6>), after [PRIM_TYPE, PRIM_TYPE_SPHERE, ...],
  // after [PRIM_PHYSICS_SHAPE_TYPE, PRIM_PHYSICS_SHAPE_CONVEX], after
  // [PRIM_TEMP_ON_REZ, TRUE], after llSetStatus(STATUS_PHYSICS, TRUE), after
  // llScaleByFactor(1.1) and after a PRIM_TYPE that only cut the box. Setting
  // PRIM_TEMP_ON_REZ and STATUS_PHYSICS back to FALSE did the same. The script
  // read itself one second after the call.
  it.each([
    'llSetScale(<0.6, 0.6, 0.6>);',
    'llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_TYPE, PRIM_TYPE_SPHERE, 0, <0.0, 1.0, 0.0>, 0.0, ZERO_VECTOR, <0.0, 1.0, 0.0>]);',
    'llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_PHYSICS_SHAPE_TYPE, PRIM_PHYSICS_SHAPE_CONVEX]);',
    'llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_TEMP_ON_REZ, TRUE]);',
    'llSetStatus(STATUS_PHYSICS, TRUE);',
    'llScaleByFactor(1.1);',
    'llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_TYPE, PRIM_TYPE_BOX, 0, <0.1, 0.9, 0.0>, 0.0, ZERO_VECTOR, <1.0, 1.0, 0.0>, ZERO_VECTOR]);',
  ])('counts every script after %s', async (call) => {
    const s = await scene()
    const box = await s.box(1, `default { touch_start(integer n) { ${call} } }`)
    expect(s.cost(key(box))).toBe(0.5)
    touch(box)
    expect(s.cost(key(box))).toBe(0.75)
  })

  // In-world: a box with one script still read 0.5 after llSetText,
  // llSetStatus(STATUS_PHANTOM, TRUE), [PRIM_MATERIAL, PRIM_MATERIAL_METAL],
  // llSitTarget, llSetObjectName, llSetColor, llSetPos, llSetRot and
  // llResetScript, after a touch, after the viewer changed its description and
  // moved it, and after a notecard was dragged in. Setting the value it
  // already had did nothing either: llSetScale(llGetScale()), its own
  // PRIM_TYPE, PRIM_PHYSICS_SHAPE_PRIM, [PRIM_TEMP_ON_REZ, FALSE] and
  // llSetStatus(STATUS_PHYSICS, FALSE). Nor did PRIM_SLICE, PRIM_FLEXIBLE,
  // llVolumeDetect, PRIM_POINT_LIGHT, llTargetOmega, PRIM_GLOW with
  // PRIM_FULLBRIGHT, llSetTexture, llSetAlpha, llSetClickAction,
  // llSetLinkSitFlags, PRIM_HEALTH with PRIM_DAMAGE, llSetPhysicsMaterial,
  // llSetBuoyancy, llSetStatus with STATUS_ROTATE_X | STATUS_ROTATE_Y and with
  // STATUS_BLOCK_GRAB, and llSetKeyframedMotion on a convex box. A
  // PRIM_PHYSICS_SHAPE_TYPE of 7 and PRIM_PHYSICS_SHAPE_NONE on the lone box
  // left the shape type at PRIM_PHYSICS_SHAPE_PRIM and the count as it was.
  it.each([
    'llSetText("hello", <1.0, 1.0, 1.0>, 1.0);',
    'llSetStatus(STATUS_PHANTOM, TRUE);',
    'llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_MATERIAL, PRIM_MATERIAL_METAL]);',
    'llSitTarget(<0.0, 0.0, 0.5>, ZERO_ROTATION);',
    'llSetObjectName("renamed");',
    'llSetObjectDesc("changed");',
    'llSetColor(<1.0, 0.0, 0.0>, ALL_SIDES);',
    'llSetPos(llGetPos() + <0.0, 0.0, 0.3>);',
    'llSetRot(llEuler2Rot(<0.0, 0.0, 1.0>));',
    'llResetScript();',
    '',
    'llSetScale(llGetScale());',
    'llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_TYPE] + llGetPrimitiveParams([PRIM_TYPE]));',
    'llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_PHYSICS_SHAPE_TYPE, PRIM_PHYSICS_SHAPE_PRIM]);',
    'llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_TEMP_ON_REZ, FALSE]);',
    'llSetStatus(STATUS_PHYSICS, FALSE);',
    'llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_SLICE, <0.2, 0.8, 0.0>]);',
    'llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_FLEXIBLE, TRUE, 2, 0.3, 2.0, 0.0, 1.0, ZERO_VECTOR]);',
    'llVolumeDetect(TRUE);',
    'llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_POINT_LIGHT, TRUE, <1.0, 1.0, 1.0>, 1.0, 10.0, 0.75]);',
    'llTargetOmega(<0.0, 0.0, 1.0>, 1.0, 1.0);',
    'llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_GLOW, ALL_SIDES, 0.2, PRIM_FULLBRIGHT, ALL_SIDES, TRUE]);',
    'llSetTexture(TEXTURE_BLANK, ALL_SIDES);',
    'llSetAlpha(0.5, ALL_SIDES);',
    'llSetClickAction(CLICK_ACTION_SIT);',
    'llSetLinkSitFlags(LINK_THIS, 6);',
    'llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_HEALTH, 50.0, PRIM_DAMAGE, 25.0, 4]);',
    'llSetPhysicsMaterial(GRAVITY_MULTIPLIER | DENSITY | FRICTION | RESTITUTION, 0.5, 0.5, 0.5, 500.0);',
    'llSetBuoyancy(0.5);',
    'llSetStatus(STATUS_ROTATE_X | STATUS_ROTATE_Y, FALSE);',
    'llSetStatus(STATUS_BLOCK_GRAB, TRUE);',
    'llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_PHYSICS_SHAPE_TYPE, 7]);',
    'llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_PHYSICS_SHAPE_TYPE, PRIM_PHYSICS_SHAPE_NONE]);',
  ])('keeps the count after %s', async (call) => {
    const s = await scene()
    const box = await s.box(1, `default { touch_start(integer n) { ${call} } }`)
    touch(box)
    expect(s.cost(key(box))).toBe(0.5)
    expect(box.linkset.prims[0]!.params.physicsShapeType).toBe(0)
  })

  // In-world: a box with three scripts read 1.0. With one removed in the
  // viewer it read 1.0, with two removed 0.75 and with all three removed 0.5.
  it('counts the scripts left when one is removed', async () => {
    const s = await scene()
    const box = await s.box(3, `default { touch_start(integer n) {
      integer last = llGetInventoryNumber(INVENTORY_SCRIPT) - 1;
      if (last) llRemoveInventory(llGetInventoryName(INVENTORY_SCRIPT, last));
    } }`)
    const costs = [s.cost(key(box))]
    for (let i = 0; i < 2; ++i) { touch(box); costs.push(s.cost(key(box))) }
    expect(costs).toEqual([1, 1, 0.75])
  })

  it('counts the scripts left when the owner removes them', async () => {
    const s = await scene()
    const box = await s.box(3)
    const costs = [s.cost(key(box))]
    for (const name of ['s2', 's1', 's0']) {
      box.linkset.prims[0]!.removeInventory(name)
      costs.push(s.cost(key(box)))
    }
    expect(costs).toEqual([1, 1, 0.75, 0.5])
  })

  // In-world: a box that read 0.75 with its one script (taken and rezzed
  // again) still read 0.75 with a second script dragged in, and 1.0 after the
  // viewer changed its size.
  it('counts the scripts that were there when one is added', async () => {
    const s = await scene()
    const box = await s.box(1, 'default { touch_start(integer n) { llSetScale(llGetScale() * 1.2); } }')
    touch(box)
    expect(s.cost(key(box))).toBe(0.75)
    await loadScript({ host: box.linkset.prims[0]!, scriptName: 'added', source: INERT })
    expect(s.cost(key(box))).toBe(0.75)
    touch(box)
    expect(s.cost(key(box))).toBe(1)
  })

  // In-world: two boxes that each read 0.5 with one script read 1.5 once the
  // viewer linked them, from either prim, and 0.75 each once it unlinked them.
  it('counts every script when prims are linked and unlinked', async () => {
    const s = await scene()
    // The owner the script asks for PERMISSION_CHANGE_LINKS: a request to a key that is no avatar fails.
    s.world.addAvatar({ region: 'home', key: AVATAR, username: 'av', position: { x: 116, y: 48, z: 20 } })
    const root = await s.box(1, `default {
      touch_start(integer n) { llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
      run_time_permissions(integer p) { if (llGetNumberOfPrims() > 1) llBreakLink(2); else llCreateLink(llGetObjectDesc(), TRUE); }
    }`)
    const child = await s.box(1)
    const keys = [key(root), key(child)]
    root.linkset.prims[0]!.description = keys[1]!
    const costs = () => keys.map((k) => s.cost(k))
    const relink = () => {
      root.linkset.touch(root.linkset.prims[0]!.linkNumber)
      root.scripts.s0!.grantPermissions()
      root.linkset.advanceTime(2000)
    }
    expect(costs()).toEqual([0.5, 0.5])
    relink()
    expect(costs()).toEqual([1.5, 1.5])
    relink()
    expect(costs()).toEqual([0.75, 0.75])
  })

  // In-world: a box with one script read 0.5, then 0.75 with the avatar seated
  // on it and 0.75 after the avatar stood up. The seated avatar's own
  // OBJECT_SERVER_COST was the box's 0.75, and 0.0 standing.
  it('counts every script when an avatar sits down, and the sitter reads the same', async () => {
    const s = await scene()
    const avatar = s.world.addAvatar({ region: 'home', key: AVATAR, username: 'av', position: { x: 116, y: 48, z: 20 } })
    const box = await s.box(1)
    expect([s.cost(key(box)), s.cost(AVATAR)]).toEqual([0.5, 0])
    s.world.sitAvatar(avatar, box.linkset.prims[0]!)
    expect([s.cost(key(box)), s.cost(AVATAR)]).toEqual([0.75, 0.75])
    s.world.standAvatar(avatar)
    expect([s.cost(key(box)), s.cost(AVATAR)]).toEqual([0.75, 0])
  })

  // In-world: with the avatar seated on a box that read 0.75 with its one
  // script, a second script was dragged in and it still read 0.75. It read
  // 1.0 once the avatar stood up.
  it('counts every script when the avatar stands up', async () => {
    const s = await scene()
    const avatar = s.world.addAvatar({ region: 'home', key: AVATAR, username: 'av', position: { x: 116, y: 48, z: 20 } })
    const box = await s.box(1)
    s.world.sitAvatar(avatar, box.linkset.prims[0]!)
    await loadScript({ host: box.linkset.prims[0]!, scriptName: 'second', source: INERT })
    expect(s.cost(key(box))).toBe(0.75)
    s.world.standAvatar(avatar)
    expect(s.cost(key(box))).toBe(1)
  })

  // In-world: a stopped script counts. A box with one script dragged in not
  // running read 0.5, and 0.75 after the viewer changed the box's size. So did
  // a box whose script had stopped with a Stack-Heap Collision, and one with
  // an SLua script.
  it.each([
    { name: 'stopped', source: { source: INERT } },
    { name: 'lua', language: 'slua' as const, source: { source: 'local x = 1' } },
  ])('counts a $name script', async (script) => {
    const s = await scene()
    const box = await loadLinkset({ world: s.world, region: 'home', owner: AVATAR, prims: [{ scripts: [script] }] })
    if (script.name === 'lua') box.scripts.lua!.start()
    expect(s.cost(key(box))).toBe(0.5)
    box.linkset.prims[0]!.setPrimParam(PRIM_SIZE, [{ x: 0.6, y: 0.6, z: 0.6 }], 0)
    expect(s.cost(key(box))).toBe(0.75)
  })

  // In-world: a box with two scripts read 0.75 before and after one script
  // stopped the other with llSetScriptState and started it again. A box with
  // one script and a notecard read 0.5 before and after
  // llRemoveInventory of the notecard.
  it('keeps the count when a script is stopped or a notecard is removed', async () => {
    const s = await scene()
    const box = await s.box(2, `integer on = TRUE; default { touch_start(integer n) {
      on = !on;
      llSetScriptState("s1", on);
      if (llGetInventoryType("note") == INVENTORY_NOTECARD) llRemoveInventory("note");
    } }`)
    box.linkset.prims[0]!.addInventory(makeInventoryItem({ name: 'note', type: InventoryType.NOTECARD }))
    for (let i = 0; i < 3; ++i) {
      expect(s.cost(key(box))).toBe(0.75)
      touch(box)
    }
    expect(box.linkset.prims[0]!.inventory.map((item) => item.name)).toEqual(['s0', 's1'])
  })

  // In-world: two linked boxes with two scripts in the root read 1.25. They
  // read 1.5 after the root's script gave the child another PRIM_SIZE,
  // PRIM_POS_LOCAL, PRIM_ROT_LOCAL or PRIM_TYPE, or PRIM_PHYSICS_SHAPE_NONE,
  // and after the viewer moved the child. They still read 1.25 after the
  // child got the PRIM_SIZE it had, and after the viewer moved and turned the
  // whole object.
  it.each([
    ['llSetLinkPrimitiveParamsFast(2, [PRIM_SIZE, <0.7, 0.5, 0.25>]);', 1.5],
    ['llSetLinkPrimitiveParamsFast(2, [PRIM_POS_LOCAL, <0.0, 1.5, 0.3>]);', 1.5],
    ['llSetLinkPrimitiveParamsFast(2, [PRIM_ROT_LOCAL, llEuler2Rot(<0.0, 0.0, 1.0>)]);', 1.5],
    ['llSetLinkPrimitiveParamsFast(2, [PRIM_PHYSICS_SHAPE_TYPE, PRIM_PHYSICS_SHAPE_NONE]);', 1.5],
    ['llSetLinkPrimitiveParamsFast(2, [PRIM_TYPE, PRIM_TYPE_SPHERE, 0, <0.0, 1.0, 0.0>, 0.0, ZERO_VECTOR, <0.0, 1.0, 0.0>]);', 1.5],
    ['llSetLinkPrimitiveParamsFast(2, [PRIM_SIZE] + llGetLinkPrimitiveParams(2, [PRIM_SIZE]));', 1.25],
    ['llSetLinkPrimitiveParamsFast(LINK_ROOT, [PRIM_POSITION, llGetPos() + <0.5, 0.0, 0.1>, PRIM_ROTATION, llEuler2Rot(<0.0, 0.0, 0.5>)]);', 1.25],
  ])('reads %s on a two-prim object as %f', async (call, cost) => {
    const s = await scene()
    const pair = await loadLinkset({
      world: s.world, region: 'home', owner: AVATAR, position: { x: 120, y: 50, z: 20 },
      prims: [{ scripts: [
        { name: 'root', source: { source: `default { touch_start(integer n) { ${call} } }` } },
        { name: 'second', source: { source: INERT } },
      ] }, {}],
    })
    pair.linkset.prims[1]!.params.position = { x: 0, y: 1, z: 0 }
    pair.scripts.root!.start()
    expect(s.cost(key(pair))).toBe(1.25)
    pair.linkset.touch(1)
    pair.linkset.advanceTime(1000)
    expect(s.cost(key(pair))).toBe(cost)
  })

  // In-world: a lone box read 1.0 with two scripts counted, and still 1.0 with
  // 15 scripts after a change of size. Two linked boxes, their size changed
  // after each script was dragged in, read 1.25, 1.5, 1.75 and 2.0 with one to
  // four scripts and 2.0 with five, six and seven. With a third box linked
  // they read 3.0 with seven scripts and with nine. An avatar seated on a lone
  // box with three scripts did not raise the limit: the box read 1.0.
  it('never reads more than one point for each prim', async () => {
    const s = await scene()
    const avatar = s.world.addAvatar({ region: 'home', key: AVATAR, username: 'av', position: { x: 116, y: 48, z: 20 } })
    const built = async (prims: number, scripts: number) => {
      const object = await loadLinkset({
        world: s.world, region: 'home', owner: AVATAR,
        prims: Array.from({ length: prims }, (_, p) => ({
          scripts: p ? [] : Array.from({ length: scripts }, (_, i) => ({ name: `s${i}`, source: { source: INERT } })),
        })),
      })
      object.linkset.recountScripts()
      return object
    }
    expect(s.cost(key(await built(1, 15)))).toBe(1)
    const two = []
    for (let scripts = 1; scripts <= 7; ++scripts) two.push(s.cost(key(await built(2, scripts))))
    expect(two).toEqual([1.25, 1.5, 1.75, 2, 2, 2, 2])
    expect([s.cost(key(await built(3, 7))), s.cost(key(await built(3, 9)))]).toEqual([3, 3])
    const seat = await built(1, 3)
    s.world.sitAvatar(avatar, seat.linkset.prims[0]!)
    expect([s.cost(key(seat)), s.cost(AVATAR)]).toEqual([1, 1])
  })
})

describe('OBJECT_SERVER_COST when a script loads a script', () => {
  // In-world: a box that read 0.5 with its one script read 0.75 once
  // llRemoteLoadScriptPin from another box had put a second script in it, the
  // same as when the viewer drags one in.
  it('counts the scripts that were there', async () => {
    const s = await scene()
    const target = await s.box(1, 'default { state_entry() { llSetRemoteScriptAccessPin(1234); } }')
    const giver = await s.box(2, `default { touch_start(integer n) { llRemoteLoadScriptPin("${key(target)}", "s1", 1234, TRUE, 0); } }`)
    expect(s.cost(key(target))).toBe(0.5)
    touch(giver)
    expect(target.linkset.allScripts()).toHaveLength(2)
    expect(s.cost(key(target))).toBe(0.75)
  })
})

describe('OBJECT_SERVER_COST of an object from inventory', () => {
  // In-world: a box with one script, taken into inventory and rezzed again by
  // the viewer, read 0.75. So did one that a script rezzed from its prim's
  // inventory with llRezObject, read in object_rez and by the new object in
  // on_rez. A box without scripts read 0.5 after the same round trip.
  it('counts every script of a rezzed object', async () => {
    const s = await scene()
    const rezzer = await loadLinkset({
      world: s.world, region: 'home', owner: AVATAR, position: { x: 118, y: 44, z: 20 },
      prims: [{
        objects: { child: { prims: [{ scripts: [{ name: 'kid', source: { source: INERT } }] }] } },
        scripts: [{ name: 'rezzer', source: { source: `float cost; default {
          touch_start(integer n) { llRezObject("child", llGetPos() + <0.0, 0.0, 1.0>, ZERO_VECTOR, ZERO_ROTATION, 1); }
          object_rez(key id) { cost = llList2Float(llGetObjectDetails(id, [OBJECT_SERVER_COST]), 0); }
        }` } }],
      }],
    })
    rezzer.scripts.rezzer!.start()
    touch(rezzer)
    expect(rezzer.scripts.rezzer!.global('cost')).toBe(0.75)
  })

  // In-world: a box that read 0.5 with its one script still read 0.5 once that
  // script had worn it with llAttachToAvatar, and another once worn with
  // llAttachToAvatarTemp, read in attach() and afterwards. Detached into
  // inventory and worn again from there, the first read 0.75.
  it.each([false, true])('keeps the count when a rezzed object is attached, temporary %s', async (temporary) => {
    const s = await scene()
    const box = await s.box(1)
    box.linkset.attachToAvatar(AVATAR, 5, temporary)
    expect(s.cost(key(box))).toBe(0.5)
    if (temporary) return
    box.linkset.detachFromAvatar()
    box.linkset.attachToAvatar(AVATAR, 5)
    expect(s.cost(key(box))).toBe(0.75)
  })

  // In-world: a box without scripts, worn from inventory, read 0.5. With one
  // script dragged in while worn it read 0.5, with a second 0.75. A box worn
  // from inventory with one script read 0.75.
  it('leaves out the script added last to a worn object', async () => {
    const s = await scene()
    const box = await s.box(0)
    box.linkset.attachToAvatar(AVATAR, 1)
    const costs = [s.cost(key(box))]
    for (const scriptName of ['first', 'second']) {
      await loadScript({ host: box.linkset.prims[0]!, scriptName, source: INERT })
      costs.push(s.cost(key(box)))
    }
    expect(costs).toEqual([0.5, 0.5, 0.75])
  })
})

// One script in link 1 and one in link 2 of a four-prim object, run by
// link_message. Each command reads the object's cost one second later.
const COMMANDS = `float cost;
default { link_message(integer s, integer n, string m, key id) {
  list a = llParseString2List(m, [" "], []);
  string c = llList2String(a, 0);
  integer v = (integer)llList2String(a, 1);
  integer w = (integer)llList2String(a, 2);
  if (c == "status") llSetStatus(v, w);
  else if (c == "lphys") llSetLinkPrimitiveParamsFast(v, [PRIM_PHYSICS, w]);
  else if (c == "temp") llSetLinkPrimitiveParamsFast(LINK_ROOT, [PRIM_TEMP_ON_REZ, v]);
  else if (c == "rotlook") llRotLookAt(llEuler2Rot(<0.0, 0.0, (float)v> * DEG_TO_RAD), 1.0, 1.0);
  else if (c == "rotlookself") llRotLookAt(llGetRot(), 1.0, 1.0);
  else if (c == "look") llLookAt(llGetPos() + <(float)v, (float)w, (float)llList2String(a, 3)>, 1.0, 1.0);
  llSleep(1.0);
  cost = llList2Float(llGetObjectDetails(llGetKey(), [OBJECT_SERVER_COST]), 0);
} }`

describe('OBJECT_SERVER_COST and calls from a child prim', () => {
  // Measured on the Aditi beta grid (SLua Tideland, Firestorm 7.3.0,
  // 2026-11-14): four linked 0.5 m boxes built by the viewer, the command
  // script dragged into link 1 and then link 2, and an empty script dragged
  // into link 3 or 4 before each command whose count is in question.
  async function fourPrims(rotation?: { x: number; y: number; z: number; s: number }) {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const object = await loadLinkset({
      world, region: 'home', owner: AVATAR, position: { x: 120, y: 45, z: 20 },
      prims: [
        { scripts: [{ name: 'one', source: { source: COMMANDS } }] },
        { scripts: [{ name: 'two', source: { source: COMMANDS } }] }, {}, {},
      ],
    })
    const prims = object.linkset.prims
    prims.forEach((prim, i) => { if (i) prim.params.position = { x: 0, y: i * 0.5, z: 0 } })
    if (rotation) prims[0]!.params.rotation = rotation
    for (const script of Object.values(object.scripts)) script.start()
    let added = 0
    const run = (link: 1 | 2, command: string) => {
      const script = object.scripts[link === 1 ? 'one' : 'two']!
      script.fire('link_message', { sender_num: link, num: 0, str: command, id: NULL })
      object.linkset.advanceTime(1500)
      return script.global('cost') as number
    }
    const drop = async () => {
      await loadScript({ host: prims[2 + (added % 2)]!, scriptName: `empty${++added}`, source: INERT })
    }
    return { object, prims, run, drop }
  }

  // In-world, from 2.25: PRIM_TEMP_ON_REZ TRUE from the root read 2.5. After
  // an empty script each: llSetStatus(STATUS_PHYSICS, TRUE) from link 2 read
  // 2.75 (counted). llRotLookAt(llGetRot(), 1, 1) from link 2 on the physical
  // object read 2.75 (not counted). STATUS_PHYSICS TRUE from the root, which
  // the object already had, read 3.0, what the empty script left it at. FALSE
  // from the root then read 3.25 (counted). After an empty script, FALSE from
  // link 2 read 3.25 (not counted). After another,
  // llSetLinkPrimitiveParamsFast(2, [PRIM_PHYSICS, TRUE]) from the root read
  // 3.75 (counted).
  it('counts again when the object turns physical or not, from any prim', async () => {
    const s = await fourPrims()
    const costs = [s.run(1, 'read'), s.run(1, 'temp 1')]
    await s.drop(); costs.push(s.run(2, 'status 1 1'))
    await s.drop(); costs.push(s.run(2, 'rotlookself'))
    await s.drop(); costs.push(s.run(1, 'status 1 1'), s.run(1, 'status 1 0'))
    await s.drop(); costs.push(s.run(2, 'status 1 0'))
    await s.drop(); costs.push(s.run(1, 'lphys 2 1'))
    expect(costs).toEqual([2.25, 2.5, 2.75, 2.75, 3, 3.25, 3.25, 3.75])
  })

  // In-world, on the same object built again and not physical, its root
  // turned 90 degrees about Z, an empty script before each command:
  // llRotLookAt to 45 degrees from link 2 read 2.5, the same as before it.
  // llRotLookAt(llGetRot(), 1, 1) from link 2 read 2.75, llLookAt from link 2
  // at a point 3 m along Y read 3.0, llRotLookAt to 30 degrees from the root
  // read 3.25 and llRotLookAt(llGetRot(), 1, 1) from the root read 3.5: each
  // what the empty script left it at, though link 2 turned each time and the
  // root turned once.
  it('does not count again for llLookAt or llRotLookAt', async () => {
    const s = await fourPrims({ x: 0, y: 0, z: Math.SQRT1_2, s: Math.SQRT1_2 })
    const costs = [s.run(1, 'read')]
    await s.drop(); costs.push(s.run(2, 'rotlook 45'))
    await s.drop(); costs.push(s.run(2, 'rotlookself'))
    await s.drop(); costs.push(s.run(2, 'look 0 3'))
    await s.drop(); costs.push(s.run(1, 'rotlook 30'))
    await s.drop(); costs.push(s.run(1, 'rotlookself'))
    expect(costs).toEqual([2.25, 2.5, 2.75, 3, 3.25, 3.5])
  })

  // In-world, on the object built again, not turned, an empty script before
  // each command: llLookAt from the root at a point 3 m along Y read 2.5 and
  // turned the root to <-90, 0, 90>; at a point 3 m along X it read 2.75 and
  // turned the root to <0, 90, 0>, each what the empty script left it at.
  // STATUS_PHYSICS TRUE from the root then read 3.25 (counted). On the
  // physical object llLookAt from the root at a point 1 m along X and 10 m up
  // read 3.25, and 3.25 again three seconds later as the object turned;
  // llLookAt from link 2 read 3.5 and llRotLookAt to 90 degrees from the root
  // read 3.75, as it turned to 82 degrees: none of them counted again.
  it('does not count again for llLookAt from the root or a look-at that turns the physical object', async () => {
    const s = await fourPrims()
    const turns: Array<{ x: number; y: number; z: number; s: number }> = []
    const costs = [s.run(1, 'read')]
    await s.drop(); costs.push(s.run(1, 'look 0 3 0')); turns.push({ ...s.prims[0]!.params.rotation })
    await s.drop(); costs.push(s.run(1, 'look 3 0 0')); turns.push({ ...s.prims[0]!.params.rotation })
    await s.drop(); costs.push(s.run(1, 'read'), s.run(1, 'status 1 1'))
    await s.drop(); costs.push(s.run(1, 'look 1 0 10'))
    s.object.linkset.advanceTime(3000); costs.push(s.run(1, 'read'))
    await s.drop(); costs.push(s.run(2, 'look 0 1 10'))
    await s.drop(); costs.push(s.run(1, 'rotlook 90'))
    s.object.linkset.advanceTime(3000); costs.push(s.run(1, 'read'))
    expect(costs).toEqual([2.25, 2.5, 2.75, 3, 3.25, 3.25, 3.25, 3.5, 3.75, 3.75])
    const euler = await loadScript({ source: `rotation a; rotation b; default { state_entry() {
      a = llEuler2Rot(<-90.0, 0.0, 90.0> * DEG_TO_RAD); b = llEuler2Rot(<0.0, 90.0, 0.0> * DEG_TO_RAD); } }` })
    euler.start()
    turns.forEach((turn, i) => {
      const q = euler.global(i ? 'b' : 'a') as typeof turn
      expect(Math.abs(turn.x * q.x + turn.y * q.y + turn.z * q.z + turn.s * q.s)).toBeCloseTo(1)
    })
  })
})

describe('OBJECT_SERVER_COST and llDerezObject', () => {
  // https://wiki.secondlife.com/wiki/LlDerezObject: DEREZ_MAKE_TEMP "Flags
  // the object as temp on rez". In-world (Aditi, SLua Tideland, 2026-11-14):
  // a box without scripts rezzed by llRezObject read 0.5, and 0.5 with an
  // empty script dragged in. llDerezObject(id, DEREZ_MAKE_TEMP) returned 1,
  // and the box then read 0.75 with OBJECT_TEMP_ON_REZ 1.
  //
  // In-world, a box rezzed temporary by llRezObjectWithParams with
  // REZ_FLAG_TEMP read 0.5 with OBJECT_TEMP_ON_REZ 1, and 0.5 with an empty
  // script dragged in. DEREZ_MAKE_TEMP returned 1 and it still read 0.5.
  it.each([[false, 0.75], [true, 0.5]])('counts again when DEREZ_MAKE_TEMP makes the object temporary, temporary already %s', async (temporary, after) => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const rezzer = await loadLinkset({
      world, region: 'home', owner: AVATAR, position: { x: 118, y: 45, z: 20 },
      prims: [{
        objects: { child: { prims: [{}] } },
        scripts: [{ name: 'rezzer', source: { source: `key child; integer result; list read; default {
          object_rez(key id) { child = id; }
          link_message(integer s, integer n, string m, key id) {
            if (m == "rez") llRezObject("child", llGetPos() + <0.0, 0.0, 1.0>, ZERO_VECTOR, ZERO_ROTATION, 0);
            if (m == "reztemp") llRezObjectWithParams("child", [REZ_FLAGS, REZ_FLAG_TEMP, REZ_POS, llGetPos() + <0.0, 0.0, 1.0>, FALSE, FALSE]);
            if (m == "temp") result = llDerezObject(child, DEREZ_MAKE_TEMP);
            read = llGetObjectDetails(child, [OBJECT_SERVER_COST, OBJECT_TEMP_ON_REZ]);
          } }` } }],
      }],
    })
    const script = rezzer.scripts.rezzer!
    script.start()
    const send = (m: string) => {
      script.fire('link_message', { sender_num: 1, num: 0, str: m, id: NULL })
      rezzer.linkset.advanceTime(1500)
      return script.global('read')
    }
    const flag = temporary ? 1 : 0
    send(temporary ? 'reztemp' : 'rez')
    expect(send('read')).toEqual([0.5, flag])
    const child = world.linksets.find((l) => l.prims[0]!.key === script.global('child'))!
    await loadScript({ host: child.prims[0]!, scriptName: 'empty', source: INERT })
    expect(send('read')).toEqual([0.5, flag])
    expect(send('temp')).toEqual([after, 1])
    expect(script.global('result')).toBe(1)
  })
})
