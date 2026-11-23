import { describe, it, expect } from 'vitest'
import { loadLinkset, makeInventoryItem, InventoryType, DEBUG_CHANNEL, NULL_KEY, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlGetPrimitiveParams
// https://wiki.secondlife.com/wiki/LlGetLinkPrimitiveParams
// https://wiki.secondlife.com/wiki/LlRezObjectWithParams
// https://wiki.secondlife.com/wiki/PRIM_COLLISION_SOUND
// In-world: Aditi, SLua Tideland, 2026-11-23, Mono and SLua scripts in two linked 0.5 m boxes
// made with object.create, read from the owner's chat history. The root sat at
// <119.37, 50.71, 1998.234> for the suffix cases.

const SOUND = 'ed124764-705d-d497-167a-182cd9fa2e6c'
const SND = '4e90ac5f-8897-c0bd-a2f1-5998ab0497a7'
const PSND = '28947fa0-7188-219f-5acc-b6f00ad85e69'
const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'

type Chat = ReadonlyArray<{ channel: number; text: string; from?: string }>
const owner = (chat: Chat) => chat.filter((c) => c.channel !== DEBUG_CHANNEL).map((c) => c.text)
const debug = (chat: Chat) => chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text)

const SUFFIX = ' {RootName Root, RootPosition { 119.37, 50.71, 1998.23 }}'
const error = (n: number, reason = 'unknown parameter') => `llGetPrimitiveParams error: Param ${n} error, ${reason}`

async function linked(source: string, child = '') {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: AVATAR, name: 'Test Resident', username: 'test', position: { x: 118, y: 48, z: 1998 } })
  const loaded = await loadLinkset({
    world, region: 'home', owner: AVATAR, position: { x: 119.37, y: 50.71, z: 1998.234 },
    prims: [
      { name: 'Root', scripts: [{ name: 'probe', source: { source } }] },
      { name: 'Kid', scripts: child ? [{ name: 'kid', source: { source: child } }] : [] },
    ],
  })
  for (const s of Object.values(loaded.scripts)) s.start()
  const sit = () => {
    loaded.linkset.prims[0]!.params.sitTarget = { enabled: true, offset: { x: 0, y: 0, z: 1 }, rotation: { x: 0, y: 0, z: 0, s: 1 } }
    expect(world.sitAvatar(avatar, loaded.linkset.prims[0]!)).toBe(true)
    loaded.linkset.advanceTime(100)
  }
  return { ...loaded, sit, run: () => loaded.linkset.touch(1, { avatar: { key: AVATAR, name: 'Test Resident' } }) }
}

describe('a PRIM_CLICK_ACTION read', () => {
  it('keeps its value only while no later rule gives a value', async () => {
    const { scripts, run } = await linked(`
      g(string t, list rules) { list v = llGetPrimitiveParams(rules); llOwnerSay(t + " " + (string)llGetListLength(v) + " [" + llList2CSV(v) + "]"); }
      default { touch_start(integer n) {
        llSetClickAction(CLICK_ACTION_SIT);
        g("G1", [PRIM_CLICK_ACTION, PRIM_NAME, PRIM_CAST_SHADOWS]);
        g("G2", [PRIM_CLICK_ACTION, PRIM_CAST_SHADOWS]);
        g("G3", [PRIM_CLICK_ACTION, PRIM_CAST_SHADOWS, PRIM_NAME]);
        g("G4", [PRIM_NAME, PRIM_CLICK_ACTION, PRIM_DESC, PRIM_CAST_SHADOWS]);
        g("G5", [PRIM_CLICK_ACTION, PRIM_CLICK_ACTION, PRIM_CAST_SHADOWS]);
        g("G6", [PRIM_CLICK_ACTION, "x", PRIM_NAME]);
        g("G7", [PRIM_CLICK_ACTION, PRIM_COLOR, 0, PRIM_CAST_SHADOWS]);
        g("G8", [PRIM_CLICK_ACTION, 9999, PRIM_NAME]);
        g("G10", [PRIM_NAME, PRIM_CLICK_ACTION]);
        g("G11", [PRIM_CLICK_ACTION, PRIM_DESC]);
        g("C1", [PRIM_CLICK_ACTION, PRIM_COLOR, 7, PRIM_NAME]);
        g("C2", [PRIM_CLICK_ACTION, PRIM_COLOR, 7]);
        g("C3", [PRIM_CLICK_ACTION, PRIM_LINK_TARGET, 2, PRIM_NAME]);
        g("C4", [PRIM_CLICK_ACTION, PRIM_LINK_TARGET, 2]);
        g("C5", [PRIM_CLICK_ACTION, PRIM_TEXT]);
        g("C6", [PRIM_CLICK_ACTION, PRIM_NAME, PRIM_CLICK_ACTION]);
        g("C10", [PRIM_NAME, PRIM_CLICK_ACTION, PRIM_CLICK_ACTION]);
      }}`)
    run()
    // In-world: the click action probes, with the click action set to sit. Its value stayed in
    // the result when the read ended after it, at the end of the list, at a rule that can't be
    // read or at a rule that is not an integer, and when the rules after it gave no value
    // (face 7 of a box, a PRIM_LINK_TARGET). The next value read replaced it. The errors
    // still counted it as a rule.
    expect(owner(scripts.probe!.chat)).toEqual([
      'G1 1 [Root]',
      'G2 1 [1]',
      'G3 1 [1]',
      'G4 2 [Root, ]',
      'G5 1 [1]',
      'G6 1 [1]',
      'G7 2 [<1.000000, 1.000000, 1.000000>, 1.000000]',
      'G8 1 [1]',
      'G10 2 [Root, 1]',
      'G11 1 []',
      'C1 1 [Root]',
      'C2 1 [1]',
      'C3 1 [Kid]',
      'C4 1 [1]',
      'C5 3 [, <0.000000, 0.000000, 0.000000>, 1.000000]',
      'C6 2 [Root, 1]',
      'C10 2 [Root, 1]',
    ])
    expect(debug(scripts.probe!.chat)).toEqual([error(2), error(1), error(1), error(3), error(2), error(2), error(1)])
  })

  it('is replaced on a seated avatar link as on a prim', async () => {
    const f = await linked(`default { touch_start(integer n) {
      llOwnerSay(llList2CSV(llGetLinkPrimitiveParams(llGetNumberOfPrims(), [PRIM_CLICK_ACTION, PRIM_NAME, PRIM_CAST_SHADOWS])));
    }}`)
    f.sit()
    f.run()
    // In-world: A7 on the seated avatar's link.
    expect(owner(f.scripts.probe!.chat)).toEqual(['Test Resident'])
    expect(debug(f.scripts.probe!.chat)).toEqual([error(2) + SUFFIX])
  })
})

describe('get errors that end a read', () => {
  it('says a missing or bad face number, and a missing, bad or absent link number', async () => {
    const { scripts, run } = await linked(`
      g(string t, list rules) { llOwnerSay(t + " [" + llList2CSV(llGetPrimitiveParams(rules)) + "]"); }
      default { touch_start(integer n) {
        g("F1", [PRIM_NAME, PRIM_COLOR]);
        g("F2", [PRIM_NAME, PRIM_COLOR, "x", PRIM_NAME]);
        g("F3", [PRIM_NAME, PRIM_COLOR, 1.0, PRIM_NAME]);
        g("F4", [PRIM_NAME, PRIM_LINK_TARGET]);
        g("F5", [PRIM_NAME, PRIM_LINK_TARGET, "x", PRIM_NAME]);
        g("C12", [PRIM_CLICK_ACTION, PRIM_LINK_TARGET, 99, PRIM_NAME]);
        g("H9", [PRIM_LINK_TARGET, 2, PRIM_CLICK_ACTION, PRIM_NAME, PRIM_CAST_SHADOWS]);
      }}`)
    run()
    // In-world: the follow-up probe. A per-face rule without an integer face, and a
    // PRIM_LINK_TARGET without an integer link or with a link the object doesn't have, ended
    // the read with an error. The link error counts the link number as its own param.
    expect(owner(scripts.probe!.chat)).toEqual(['F1 [Root]', 'F2 [Root]', 'F3 [Root]', 'F4 [Root]', 'F5 [Root]', 'C12 [0]', 'H9 [Kid]'])
    const face = error(1, 'missing or bad face number.')
    const link = error(2, 'PRIM_LINK_TARGET has missing or bad link number.')
    expect(debug(scripts.probe!.chat)).toEqual([face, face, face, link, link, link, error(4)])
  })
})

describe('get errors on a seated avatar link', () => {
  const READS = `
    h(string t, integer l, list rules) { llOwnerSay(t + " [" + llList2CSV(llGetLinkPrimitiveParams(l, rules)) + "]"); }
    default { touch_start(integer n) {
      integer a = llGetNumberOfPrims();
      h("A1", a, [PRIM_NAME, PRIM_CAST_SHADOWS]);
      h("A2", a, [PRIM_NAME, 9999, PRIM_NAME]);
      h("A3", a, [PRIM_NAME, PRIM_COLOR, 0, PRIM_NAME]);
      h("A4", 1, [PRIM_NAME, PRIM_LINK_TARGET, a, PRIM_NAME, PRIM_CAST_SHADOWS]);
      h("A5", a, [PRIM_NAME, PRIM_LINK_TARGET, 1, PRIM_NAME, PRIM_CAST_SHADOWS]);
      h("A6", a, [PRIM_NAME, PRIM_LINK_TARGET, 2, PRIM_NAME, PRIM_CAST_SHADOWS]);
      h("A8", 2, [PRIM_NAME, PRIM_LINK_TARGET, a, PRIM_NAME, PRIM_PROJECTOR]);
      h("A9", a, [PRIM_NAME, PRIM_PROJECTOR]);
      h("W1", 1, [PRIM_NAME, PRIM_LINK_TARGET, a, PRIM_COLOR, 0]);
      h("W2", a, [PRIM_NAME, PRIM_COLOR]);
      h("W3", a, [PRIM_NAME, PRIM_COLOR, ALL_SIDES]);
    }}`

  it('are said by the link the read starts on, the avatar too, with the root suffix off the root', async () => {
    const f = await linked(READS)
    f.sit()
    f.run()
    const [root, kid] = f.linkset.prims
    // In-world: the avatar probe, fivebot seated on the root of the two boxes. An error read on
    // the avatar link came from the avatar, with the root's name and position after it, and a
    // read that started on a prim was said by that prim.
    expect(owner(f.scripts.probe!.chat)).toEqual([
      'A1 [Test Resident]', 'A2 [Test Resident]', 'A3 [Test Resident]', 'A4 [Root, Test Resident]',
      'A5 [Test Resident, Root]', 'A6 [Test Resident, Kid]', 'A8 [Kid, Test Resident]', 'A9 [Test Resident]',
      'W1 [Root]', 'W2 [Test Resident]', 'W3 [Test Resident]',
    ])
    const texture = 'texture info cannot be accessed for avatars.'
    expect(f.scripts.probe!.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => [c.text, c.from ?? root!.key])).toEqual([
      [error(1) + SUFFIX, AVATAR],
      [error(1) + SUFFIX, AVATAR],
      [error(1, texture) + SUFFIX, AVATAR],
      [error(4), root!.key],
      [error(4) + SUFFIX, AVATAR],
      [error(4) + SUFFIX, AVATAR],
      [error(4) + SUFFIX, kid!.key],
      [error(1) + SUFFIX, AVATAR],
      [error(3, texture), root!.key],
      [error(1, 'missing or bad face number.') + SUFFIX, AVATAR],
      [error(1, texture) + SUFFIX, AVATAR],
    ])
  })

  it('reads PRIM_COLLISION_SOUND as a prim with none', async () => {
    const f = await linked(`default { touch_start(integer n) {
      llOwnerSay(llList2CSV(llGetLinkPrimitiveParams(llGetNumberOfPrims(), [PRIM_NAME, PRIM_COLLISION_SOUND, PRIM_NAME])));
    }}`)
    f.sit()
    f.run()
    // In-world: the second avatar probe.
    expect(owner(f.scripts.probe!.chat)).toEqual([`Test Resident, ${NULL_KEY}, 1.000000, Test Resident`])
    expect(debug(f.scripts.probe!.chat)).toEqual([])
  })

  it.each([
    ['PRIM_COLOR', 'texture info cannot be accessed for avatars.'],
    ['PRIM_BUMP_SHINY', 'texture info cannot be accessed for avatars.'],
    ['PRIM_FULLBRIGHT', 'texture info cannot be accessed for avatars.'],
    ['PRIM_TEXGEN', 'texture info cannot be accessed for avatars.'],
    ['PRIM_GLOW', 'texture info cannot be accessed for avatars.'],
    ['PRIM_TEXTURE', 'texture and material parameters cannot be used for avatars.'],
    ['PRIM_SPECULAR', 'texture and material parameters cannot be used for avatars.'],
    ['PRIM_NORMAL', 'texture and material parameters cannot be used for avatars.'],
    ['PRIM_ALPHA_MODE', 'texture and material parameters cannot be used for avatars.'],
    ['PRIM_RENDER_MATERIAL', 'texture and material parameters cannot be used for avatars.'],
    ['PRIM_GLTF_BASE_COLOR', 'texture and material parameters cannot be used for avatars.'],
    ['PRIM_GLTF_NORMAL', 'texture and material parameters cannot be used for avatars.'],
    ['PRIM_GLTF_METALLIC_ROUGHNESS', 'texture and material parameters cannot be used for avatars.'],
    ['PRIM_GLTF_EMISSIVE', 'texture and material parameters cannot be used for avatars.'],
  ])('ends a %s read with its own error', async (rule, reason) => {
    const f = await linked(`default { touch_start(integer n) {
      llOwnerSay(llList2CSV(llGetLinkPrimitiveParams(llGetNumberOfPrims(), [PRIM_NAME, ${rule}, 0, PRIM_NAME])));
    }}`)
    f.sit()
    f.run()
    // In-world: the follow-up probe read each face rule on face 0 of the avatar link.
    expect(owner(f.scripts.probe!.chat)).toEqual(['Test Resident'])
    expect(debug(f.scripts.probe!.chat)).toEqual([error(1, reason) + SUFFIX])
  })
})

describe('the root suffix on prim parameter errors', () => {
  it('follows get and set errors from a child prim, and nothing else it says', async () => {
    const f = await linked(`
      default {
        state_entry() { llListen(DEBUG_CHANNEL, "", NULL_KEY, ""); }
        listen(integer c, string n, key id, string m) { llOwnerSay("HEARD " + m); }
        touch_start(integer n) {
          llOwnerSay("R2 [" + llList2CSV(llGetLinkPrimitiveParams(2, [PRIM_NAME, PRIM_CAST_SHADOWS])) + "]");
          llSetLinkPrimitiveParamsFast(2, [PRIM_NAME, 5]);
          llMessageLinked(2, 0, "", NULL_KEY);
        }
      }`, `
      default { link_message(integer s, integer n, string m, key id) {
        llSay(DEBUG_CHANNEL, "K1 kid say");
        llOwnerSay("K6 [" + llList2CSV(llGetPrimitiveParams([PRIM_NAME, PRIM_CAST_SHADOWS])) + "]");
        llSetPrimitiveParams([PRIM_NAME, 5]);
        llRezObjectWithParams("nothing534kid", []);
      }}`)
    f.run()
    f.linkset.advanceTime(2000)
    const [root, kid] = f.linkset.prims
    const set = 'llSetPrimitiveParams error running rule #1 (PRIM_NAME): arg #1 string expected but integer given.'
    // In-world: the child and root probes. A get or set error said by the child carried the
    // root's name and position, printed to six significant digits; the root's own errors,
    // the child's llSay on DEBUG_CHANNEL and its "Could not find object" did not. A script in
    // the root heard the child's say and its rez error but not the get or set errors.
    expect(f.scripts.probe!.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => [c.text, c.from ?? root!.key])).toEqual([
      [error(1) + SUFFIX, kid!.key],
      [set, root!.key],
    ])
    expect(f.scripts.kid!.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text)).toEqual([
      'K1 kid say',
      error(1) + SUFFIX,
      set + SUFFIX,
      "Could not find object 'nothing534kid'.",
    ])
    expect(owner(f.scripts.probe!.chat)).toEqual(['R2 [Kid]', 'HEARD K1 kid say', "HEARD Could not find object 'nothing534kid'."])
  })
})

describe('the root position in the suffix', () => {
  it('prints the single-precision position the region stores', async () => {
    const f = await linked('default { touch_start(integer n) { llGetLinkPrimitiveParams(2, [PRIM_CAST_SHADOWS]); } }')
    f.linkset.prims[0]!.params.position = { x: 119.3705, y: 50.71, z: 1998.234 }
    f.run()
    // The region keeps positions as floats: 119.3705 is held as 119.370499.
    expect(debug(f.scripts.probe!.chat)).toEqual([`${error(0)}${SUFFIX}`])
  })
})

describe('the shape type none error', () => {
  it('carries the root suffix when a child prim says it', async () => {
    const f = await linked('default { touch_start(integer n) { llMessageLinked(2, 0, "", NULL_KEY); } }', `
      default { link_message(integer s, integer n, string m, key id) {
        llSetLinkPrimitiveParamsFast(LINK_ROOT, [PRIM_PHYSICS_SHAPE_TYPE, PRIM_PHYSICS_SHAPE_NONE]);
      }}`)
    f.run()
    f.linkset.advanceTime(100)
    // In-world: the shape probe, a script in link 2 setting the root's physics shape to none.
    expect(debug(f.scripts.kid!.chat)).toEqual([`ERROR: Root prim may not be set to shape type none.${SUFFIX}`])
  })
})

describe('REZ_SOUND_COLLIDE', () => {
  async function rezzer(calls: string, preset?: { sound: string; volume: number }) {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const payload = (await loadLinkset({ prims: [{ name: 'plain' }, { name: 'plainkid' }] })).linkset
    if (preset) payload.prims[0]!.collisionSound = preset
    const item = makeInventoryItem({ name: 'probe', type: InventoryType.OBJECT })
    Object.assign(item, { object: payload })
    const loaded = await loadLinkset({
      world, region: 'home', position: { x: 120, y: 48, z: 1998 },
      prims: [{
        name: 'rezzer',
        inventory: [item, makeInventoryItem({ name: 'psnd534', type: InventoryType.SOUND, key: PSND })],
        scripts: [{ name: 'r', source: { source: `
          r(list p) {
            float t = llGetTime();
            key k = llRezObjectWithParams("probe", [REZ_POS, <0, 0, 1.5>, TRUE, FALSE] + p);
            llOwnerSay((string)(k != NULL_KEY) + " " + (string)(llGetTime() - t >= 1.0));
          }
          default { state_entry() { ${calls} } }` } }],
      }],
    })
    loaded.scripts.r!.start()
    loaded.linkset.advanceTime(20000)
    const sounds = (n: number) => world.linksets[n]!.prims.map((p) => p.collisionSound)
    return { world, chat: loaded.scripts.r!.chat, sounds }
  }

  it('sets the rezzed root collision sound from a sound name or a key', async () => {
    const f = await rezzer(`
      r([]);
      r([REZ_SOUND_COLLIDE, "psnd534", 0.5]);
      r([REZ_SOUND_COLLIDE, "${SND}", 0.6]);
      r([REZ_SOUND_COLLIDE, "", 0.8]);
      r([REZ_SOUND_COLLIDE, "${SND}", 2.0]);
      r([REZ_SOUND_COLLIDE, "${SND}", -1.0]);
      r([REZ_SOUND_COLLIDE, "${SND.toUpperCase()}", 0.5]);
      r([REZ_SOUND_COLLIDE, "11111111-1111-1111-1111-111111111111", 0.5]);
      r([REZ_SOUND_COLLIDE, "", 0.5, REZ_SOUND_COLLIDE, "psnd534", 0.2]);`)
    // In-world: the rez probes R1-R7, Z4, Z8 and Z10, read by the rezzed object's on_rez. Only the
    // root took the sound; link 2 kept [NULL_KEY, 1.0]. A sound's name in the rezzer gave its key, a
    // key was kept in lower case whatever asset it named, the volume was clamped to 0..1, ""
    // changed nothing, and the last rule counted.
    expect(owner(f.chat)).toEqual(Array(9).fill('1 0'))
    expect(debug(f.chat)).toEqual([])
    const read = (n: number) => f.sounds(n)
    expect(read(1)).toEqual([null, null])
    expect(read(2)).toEqual([{ sound: PSND, volume: 0.5 }, null])
    expect(read(3)).toEqual([{ sound: SND, volume: Math.fround(0.6) }, null])
    expect(read(4)).toEqual([null, null])
    expect(read(5)).toEqual([{ sound: SND, volume: 1 }, null])
    expect(read(6)).toEqual([{ sound: SND, volume: 0 }, null])
    expect(read(7)).toEqual([{ sound: SND, volume: 0.5 }, null])
    expect(read(8)).toEqual([{ sound: '11111111-1111-1111-1111-111111111111', volume: 0.5 }, null])
    expect(read(9)).toEqual([{ sound: PSND, volume: Math.fround(0.2) }, null])
  })

  it('reads back with PRIM_COLLISION_SOUND in the rezzed object', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const payload = (await loadLinkset({ prims: [{ name: 'plain', scripts: [{ name: 'c', source: { source: `
      default { on_rez(integer p) { llOwnerSay(llList2CSV(llGetPrimitiveParams([PRIM_COLLISION_SOUND]) + llGetLinkPrimitiveParams(2, [PRIM_COLLISION_SOUND]))); } }` } }] }, { name: 'plainkid' }] })).linkset
    const item = makeInventoryItem({ name: 'probe', type: InventoryType.OBJECT })
    Object.assign(item, { object: payload })
    const loaded = await loadLinkset({ world, region: 'home', prims: [{ inventory: [item], scripts: [{ name: 'r', source: { source: `
      default { state_entry() { llRezObjectWithParams("probe", [REZ_SOUND_COLLIDE, "${SND}", 0.6]); } }` } }] }] })
    loaded.scripts.r!.start()
    loaded.linkset.advanceTime(1000)
    // In-world: R3.
    expect(owner(world.linksets[1]!.allScripts()[0]!.chat)).toEqual([`${SND}, 0.600000, ${NULL_KEY}, 1.000000`])
  })

  it('plays from the rezzed root on impact', async () => {
    const f = await rezzer(`r([REZ_SOUND_COLLIDE, "${SND}", 0.6]);`)
    const [source, rezzed] = f.world.linksets
    rezzed!.collide(source!, 5)
    // The impact gain, 0.75 times the volume, is pinned in collision-settings.test.ts.
    expect(rezzed!.prims[0]!.sound.triggers.map((t) => [t.sound, t.volume])).toEqual([[SND, 0.75 * Math.fround(0.6)]])
    expect(source!.prims[0]!.sound.triggers).toEqual([])
  })

  it('keeps or replaces the sound the object was saved with', async () => {
    const f = await rezzer(`
      r([]);
      r([REZ_SOUND_COLLIDE, "", 0.8]);
      r([REZ_SOUND_COLLIDE, "${SND}", 0.6]);
      r([REZ_SOUND_COLLIDE, "psnd534", 0.5, REZ_SOUND_COLLIDE, "", 0.8]);
      r([REZ_SOUND_COLLIDE, "missing534", 0.5, REZ_SOUND_COLLIDE, "psnd534", 0.3]);
      r([REZ_SOUND_COLLIDE, "missing534", 0.5, REZ_SOUND_COLLIDE, "", 0.3]);`, { sound: SOUND, volume: 0.25 })
    // In-world: the preset probes R9, R11, R12, Z7, Y1, X1 and X2, on an object taken with
    // llCollisionSound(SOUND, 0.25). Only the last REZ_SOUND_COLLIDE counted: a "" after a sound
    // kept the saved one, and a missing name before a sound or "" was ignored.
    expect(owner(f.chat)).toEqual(Array(6).fill('1 0'))
    expect(debug(f.chat)).toEqual([])
    expect(f.sounds(1)[0]).toEqual({ sound: SOUND, volume: 0.25 })
    expect(f.sounds(2)[0]).toEqual({ sound: SOUND, volume: 0.25 })
    expect(f.sounds(3)[0]).toEqual({ sound: SND, volume: Math.fround(0.6) })
    expect(f.sounds(4)[0]).toEqual({ sound: SOUND, volume: 0.25 })
    expect(f.sounds(5)[0]).toEqual({ sound: PSND, volume: Math.fround(0.3) })
    expect(f.sounds(6)[0]).toEqual({ sound: SOUND, volume: 0.25 })
  })

  it('refuses the whole rez for a name that is not a sound in the rezzer, or NULL_KEY', async () => {
    const f = await rezzer(`
      r([REZ_SOUND_COLLIDE, "missing534", 0.7]);
      r([REZ_SOUND_COLLIDE, "probe", 0.5]);
      r([REZ_SOUND_COLLIDE, NULL_KEY, 0.5]);
      r([REZ_SOUND_COLLIDE, "psnd534", 0.4, REZ_SOUND_COLLIDE, "missing534", 0.3]);
      r([REZ_SOUND_COLLIDE, "missa", 0.5, REZ_SOUND_COLLIDE, "missb", 0.5]);
      llOwnerSay((string)llRezObjectWithParams("nothere534", [REZ_SOUND_COLLIDE, "missing534", 0.5]));`, { sound: SOUND, volume: 0.25 })
    // In-world: R4, R8, R10, R13, Y2, Z1, Z3, Z5 and Z6. Each returned NULL_KEY after about a second,
    // rezzed nothing, and the rezzer said "Could not find sound" for the last REZ_SOUND_COLLIDE on
    // DEBUG_CHANNEL, which scripts heard. A missing object with a missing sound gave only the sound error.
    expect(owner(f.chat)).toEqual(['0 1', '0 1', '0 1', '0 1', '0 1', NULL_KEY])
    expect(debug(f.chat)).toEqual([
      "Could not find sound 'missing534'.",
      "Could not find sound 'probe'.",
      `Could not find sound '${NULL_KEY}'.`,
      "Could not find sound 'missing534'.",
      "Could not find sound 'missb'.",
      "Could not find sound 'missing534'.",
    ])
    expect(f.world.linksets).toHaveLength(1)
  })
})

describe('PRIM_COLLISION_SOUND in SLua', () => {
  it('reads the sound as a uuid', async () => {
    const { scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 's', language: 'slua', source: { filename: 's.luau', source: `
      local function show(t, v)
        local s = {}
        for _, x in ipairs(v) do s[#s + 1] = typeof(x) .. "=" .. tostring(x) end
        ll.OwnerSay(t .. " " .. table.concat(s, " "))
      end
      show("S1", ll.GetPrimitiveParams({PRIM_COLLISION_SOUND}))
      ll.CollisionSound("${SOUND}", 0.5)
      show("S2", ll.GetPrimitiveParams({PRIM_COLLISION_SOUND}))
      ll.SetPrimitiveParams({PRIM_COLLISION_SOUND, "nope", 0.3})
      show("S3", ll.GetLinkPrimitiveParams(LINK_THIS, {PRIM_COLLISION_SOUND}))
    ` } }] }] })
    scripts.s!.start()
    // In-world: the SLua probe.
    expect(owner(scripts.s!.chat)).toEqual([
      `S1 uuid=${NULL_KEY} number=1`,
      `S2 uuid=${SOUND} number=0.5`,
      `S3 uuid=${NULL_KEY} number=0.30000001192092896`,
    ])
  })
})

