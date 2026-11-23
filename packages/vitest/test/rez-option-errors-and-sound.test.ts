import { describe, it, expect } from 'vitest'
import { loadLinkset, makeInventoryItem, InventoryType, DEBUG_CHANNEL, NULL_KEY, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlRezObjectWithParams
// In-world: Aditi, SLua Tideland, 2026-11-23. A rezzer box ran each case 6 s apart in a Mono script
// and in the same LSL compiled to Luau, with identical results. Results were read from the owner's chat
// history; a separate box relayed whatever it heard on DEBUG_CHANNEL. The rezzed object reported its
// collision sound from on_rez, and its attached sound was read from the viewer's sound events.

const SA = 'e4633815-b1bf-3713-bec3-a54855d31582'
const SB = '7236ca15-4b49-c158-9b97-9f44db3f606b'
const TEX = '7bce9c52-7b6b-0f82-8832-eff76db4952a'
const SAVED = '11111111-2222-3333-4444-555555555555'
const OWNER = 'abcdefab-1234-1234-1234-abcdefabcdef'

type Chat = ReadonlyArray<{ channel: number; text: string }>
const owner = (chat: Chat) => chat.filter((c) => c.channel !== DEBUG_CHANNEL).map((c) => c.text)
const debug = (chat: Chat) => chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text)

const R = `
  r(list p) { r2("payload", p); }
  r2(string name, list p) {
    float t = llGetTime();
    key k = llRezObjectWithParams(name, p);
    llOwnerSay((string)(k != NULL_KEY) + " " + (string)(llGetTime() - t >= 1.0));
  }`

interface Setup {
  /** Names for the rezzer's sound A, sound B and texture items. */
  names?: { a?: string; b?: string; t?: string }
  /** The attached sound the payload was saved with. */
  saved?: boolean
  /** Put the rezzer script and its items in link 2 of a two-prim object. */
  child?: boolean
}

async function rezzer(calls: string, setup: Setup = {}) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const payload = (await loadLinkset({ prims: [{ name: 'payload' }] })).linkset
  if (setup.saved) payload.prims[0]!.sound.current = { sound: SAVED, volume: 0.5, loop: true, sync: 'none' }
  const item = makeInventoryItem({ name: 'payload', type: InventoryType.OBJECT })
  Object.assign(item, { object: payload })
  const prim = {
    name: setup.child ? 'Kid' : 'Rezzer',
    inventory: [
      item,
      makeInventoryItem({ name: setup.names?.a ?? 'sA', type: InventoryType.SOUND, key: SA }),
      makeInventoryItem({ name: setup.names?.b ?? 'sB', type: InventoryType.SOUND, key: SB }),
      makeInventoryItem({ name: setup.names?.t ?? 't', type: InventoryType.TEXTURE, key: TEX }),
    ],
    scripts: [{ name: 'r', source: { source: `${R} default { state_entry() { ${calls} } }` } }],
  }
  const listener = await loadLinkset({
    world, region: 'home', owner: OWNER, position: { x: 121, y: 46, z: 1998.2 },
    prims: [{ name: 'Listener', scripts: [{ name: 'l', source: { source: `default {
      state_entry() { llListen(DEBUG_CHANNEL, "", NULL_KEY, ""); }
      listen(integer c, string n, key id, string m) { llOwnerSay("HEARD " + m); } }` } }] }],
  })
  listener.scripts.l!.start()
  const loaded = await loadLinkset({
    world, region: 'home', owner: OWNER, position: { x: 119, y: 44, z: 1998.2 },
    prims: setup.child ? [{ name: 'Root' }, { ...prim, position: { x: 0, y: -0.6, z: 0 } }] : [prim],
  })
  loaded.scripts.r!.start()
  loaded.linkset.advanceTime(30000)
  const rezzed = world.linksets.filter((l) => l !== loaded.linkset && l !== listener.linkset)
  return {
    chat: loaded.scripts.r!.chat,
    heard: owner(listener.scripts.l!.chat),
    rezzed,
    sound: (n: number) => rezzed[n]!.prims[0]!.sound.current,
    collision: (n: number) => rezzed[n]!.prims[0]!.collisionSound,
  }
}

const rule = (n: number, text: string) => `llRezObjectWithParams Error running rule #${n}${text}`
const expecting = (n: number, name: string, type: string) => rule(n, ` (${name}): Expecting ${type} parameter..`)

describe('llRezObjectWithParams option errors', () => {
  it.each([
    ['[9999]', rule(1, ': unknown rule id 9999.')],
    ['[REZ_PARAM, 5, 9999, 1]', rule(2, ': unknown rule id 9999.')],
    ['[REZ_POS, <0,0,1>, TRUE, FALSE, REZ_ROT, <0,0,0,1>, FALSE, REZ_PARAM, 3, -5]', rule(4, ': unknown rule id -5.')],
    ['[6, <0,0,1>, FALSE]', rule(1, ': unknown rule id 6.')],
    ['[6, <0,0,1>]', rule(1, ': unknown rule id 6.')],
    ['[14]', rule(1, ': unknown rule id 14.')],
    ['["abc"]', rule(1, ': non-integer rule.')],
    ['[1.0]', rule(1, ': non-integer rule.')],
    ['[<0,0,0>]', rule(1, ': non-integer rule.')],
    ['[(key)"x"]', rule(1, ': non-integer rule.')],
    ['[REZ_PARAM]', expecting(1, 'REZ_PARAM', 'integer')],
    ['[0]', expecting(1, 'REZ_PARAM', 'integer')],
    ['[REZ_PARAM, "a"]', expecting(1, 'REZ_PARAM', 'integer')],
    ['[REZ_FLAGS]', expecting(1, 'REZ_FLAGS', 'integer')],
    ['[REZ_FLAGS, 1.5]', expecting(1, 'REZ_FLAGS', 'integer')],
    ['[REZ_POS, "x", FALSE, FALSE]', expecting(1, 'REZ_POS', 'vector')],
    ['[REZ_POS, <0,0,1>, 1.0, FALSE]', expecting(1, 'REZ_POS', 'integer')],
    ['[REZ_POS, <0,0,1>]', expecting(1, 'REZ_POS', 'integer')],
    ['[REZ_ROT]', expecting(1, 'REZ_ROT', 'rotation')],
    ['[REZ_ROT, <0,0,0>, FALSE]', expecting(1, 'REZ_ROT', 'rotation')],
    ['[REZ_VEL]', expecting(1, 'REZ_VEL', 'vector')],
    ['[REZ_VEL, <0,0,0>, FALSE, 1.0]', expecting(1, 'REZ_VEL', 'integer')],
    ['[REZ_ACCEL]', expecting(1, 'REZ_ACCEL', 'vector')],
    ['[REZ_OMEGA]', expecting(1, 'REZ_OMEGA', 'vector')],
    ['[REZ_DAMAGE_TYPE]', expecting(1, 'REZ_DAMAGE_TYPE', 'integer')],
    ['[REZ_SOUND]', expecting(1, 'REZ_SOUND', 'string')],
    ['[REZ_SOUND, 5, 1.0, FALSE]', expecting(1, 'REZ_SOUND', 'string')],
    ['[REZ_SOUND_COLLIDE]', expecting(1, 'REZ_SOUND_COLLIDE', 'string')],
    ['[REZ_LOCK_AXES]', expecting(1, 'REZ_LOCK_AXES', 'vector')],
    ['[REZ_PARAM_STRING]', expecting(1, 'REZ_PARAM_STRING', 'string')],
    ['[REZ_PARAM, 1, REZ_FLAGS, 0, REZ_DAMAGE, 1.0, REZ_SOUND, "sA", 1.0, FALSE, 8]', expecting(5, 'REZ_DAMAGE', 'float')],
    ['[REZ_POS, <0,0,1>, TRUE, FALSE, REZ_DAMAGE, "x"]', expecting(2, 'REZ_DAMAGE', 'float')],
    ['[REZ_PARAM, 1, REZ_POS, "x", 0, 0, 9999]', expecting(2, 'REZ_POS', 'vector')],
  ])('%s says the first rule it cannot read to the owner only', async (list, text) => {
    const f = await rezzer(`r(${list});`)
    // In-world: rules counted from 1, only the first bad rule was reported, and REZ_TORQUE (6) is an
    // unknown rule id. The call took 0.11 s against 0.155 s for a rez: no second's pause. The
    // DEBUG_CHANNEL listener heard none of these.
    expect(owner(f.chat)).toEqual(['0 0'])
    expect(debug(f.chat)).toEqual([text])
    expect(f.heard).toEqual([])
    expect(f.rezzed).toEqual([])
  })

  it('reports a rule error before a sound error or a missing object', async () => {
    const f = await rezzer(`
      r([REZ_SOUND_COLLIDE, "missing550", 0.5, 9999]);
      r([9999, REZ_SOUND_COLLIDE, "missing550", 0.5]);
      r([REZ_SOUND, "missing550", 1.0, FALSE, 9999]);
      r2("nothere550", [9999]);`)
    // In-world: C15, C16, C32 and C17.
    expect(owner(f.chat)).toEqual(['0 0', '0 0', '0 0', '0 0'])
    expect(debug(f.chat)).toEqual([
      rule(2, ': unknown rule id 9999.'), rule(1, ': unknown rule id 9999.'),
      rule(2, ': unknown rule id 9999.'), rule(1, ': unknown rule id 9999.'),
    ])
    expect(f.heard).toEqual([])
  })

  it('takes an integer for a float and a key for a string', async () => {
    const f = await rezzer(`
      r([REZ_DAMAGE, 5]);
      r([REZ_OMEGA, <0,0,1>, FALSE, 1, 1]);
      r([REZ_PARAM_STRING, (key)"abc"]);
      r([REZ_SOUND, (key)"sA", 1.0, FALSE]);`)
    // In-world: C10, C13, C14 and C43 each rezzed the object.
    expect(owner(f.chat)).toEqual(['1 0', '1 0', '1 0', '1 0'])
    expect(debug(f.chat)).toEqual([])
    expect(f.sound(3)?.sound).toBe(SA)
  })

  it('counts towards the error flood cap like other errors only the owner sees', async () => {
    const f = await rezzer(`
      integer i; for (i = 0; i < 12; ++i) r([9999]);
      r([REZ_SOUND, "missing550", 1.0, FALSE]);`)
    // The cap is pinned in debug-flood.test.ts: the owner sees 9 owner-only errors, then nothing
    // until the flood stops, so the sound error that follows is dropped for listeners too.
    expect(debug(f.chat)).toEqual(Array(9).fill(rule(1, ': unknown rule id 9999.')))
    expect(f.heard).toEqual([])
  })

  it('ends with the root suffix when a child prim says it', async () => {
    const f = await rezzer(`
      r([9999]);
      r([REZ_POS, "x", FALSE, FALSE]);
      r([REZ_SOUND, "missing550", 1.0, FALSE]);`, { child: true })
    const suffix = ' {RootName Root, RootPosition { 119, 44, 1998.2 }}'
    // In-world: the rezzer in link 2 of a linkset whose root sat at <119, 44, 1998.2>. The rule
    // errors carried the suffix; the sound error did not, and the listener heard only it.
    expect(debug(f.chat)).toEqual([
      rule(1, ': unknown rule id 9999.') + suffix,
      expecting(1, 'REZ_POS', 'vector') + suffix,
      "Could not find sound 'missing550'.",
    ])
    expect(f.heard).toEqual(["HEARD Could not find sound 'missing550'."])
  })
})

describe('REZ_SOUND', () => {
  it('sets the rezzed root sound from a sound name or a key', async () => {
    const f = await rezzer(`
      r([REZ_SOUND, "sA", 1.0, FALSE]);
      r([REZ_SOUND, "${SAVED}", 1.0, FALSE]);
      r([REZ_SOUND, "${SB.toUpperCase()}", 1.0, FALSE]);
      r([REZ_SOUND, (key)"${SB}", 2.0, TRUE]);
      r([REZ_SOUND, "${SB}", 0.3, FALSE]);
      r([REZ_SOUND, "${SB}", -1.0, 5]);
      r([REZ_SOUND, "missing550", 1.0, FALSE, REZ_SOUND, "sA", 1.0, FALSE]);
      r([REZ_SOUND, "", 1.0, FALSE]);
      r([REZ_SOUND, "missing550", 1.0, FALSE, REZ_SOUND, "", 1.0, FALSE]);`)
    // In-world: C25, C26, C33, rz2 C17, C18, C21, C27, C22 and C41. A key was kept whatever asset it
    // named, the volume was clamped to 0..1, any non-zero loop flag looped, and the last REZ_SOUND counted.
    expect(owner(f.chat)).toEqual(Array(9).fill('1 0'))
    expect(debug(f.chat)).toEqual([])
    expect(f.sound(0)).toEqual({ sound: SA, volume: 1, loop: false, sync: 'none' })
    expect(f.sound(1)).toEqual({ sound: SAVED, volume: 1, loop: false, sync: 'none' })
    expect(f.sound(2)).toEqual({ sound: SB, volume: 1, loop: false, sync: 'none' })
    expect(f.sound(3)).toEqual({ sound: SB, volume: 1, loop: true, sync: 'none' })
    expect(f.sound(4)).toEqual({ sound: SB, volume: Math.fround(0.3), loop: false, sync: 'none' })
    expect(f.sound(5)).toEqual({ sound: SB, volume: 0, loop: true, sync: 'none' })
    expect(f.sound(6)).toEqual({ sound: SA, volume: 1, loop: false, sync: 'none' })
    expect(f.sound(7)).toBeNull()
    expect(f.sound(8)).toBeNull()
  })

  it('keeps the sound the object was saved with for ""', async () => {
    const f = await rezzer(`
      r([]);
      r([REZ_SOUND, "", 1.0, FALSE]);
      r([REZ_SOUND, "${SB}", 1.0, FALSE, REZ_SOUND, "", 1.0, FALSE]);
      r([REZ_SOUND, "${SB}", 0.3, FALSE]);`, { saved: true })
    // In-world: rz2 C19, C16, C22 and C18, on an object taken while looping a sound at 0.5.
    const saved = { sound: SAVED, volume: 0.5, loop: true, sync: 'none' }
    expect(owner(f.chat)).toEqual(Array(4).fill('1 0'))
    expect([0, 1, 2].map(f.sound)).toEqual([saved, saved, saved])
    expect(f.sound(3)).toEqual({ sound: SB, volume: Math.fround(0.3), loop: false, sync: 'none' })
  })

  it('refuses the whole rez for a name that is not a sound in the rezzer, or NULL_KEY', async () => {
    const f = await rezzer(`
      r([REZ_SOUND, "missing550", 1.0, FALSE]);
      r([REZ_SOUND, NULL_KEY, 1.0, FALSE]);
      r([REZ_SOUND, "payload", 1.0, FALSE]);
      r([REZ_SOUND, "t", 1.0, FALSE]);
      r([REZ_SOUND, "sA", 1.0, FALSE, REZ_SOUND, "missing550", 1.0, FALSE]);
      r([REZ_SOUND, "missingA", 1.0, FALSE, REZ_SOUND_COLLIDE, "missingB", 0.5]);
      r([REZ_SOUND_COLLIDE, "missingB", 0.5, REZ_SOUND, "missingA", 1.0, FALSE]);
      r2("nothere550", [REZ_SOUND, "missing550", 1.0, FALSE]);`)
    // In-world: C21, C23, C24, C40, C28, C29, C30 and C31. Each returned NULL_KEY after about a
    // second and rezzed nothing; scripts heard the error. REZ_SOUND was looked up before
    // REZ_SOUND_COLLIDE, and both before the object.
    const errors = ['missing550', NULL_KEY, 'payload', 't', 'missing550', 'missingA', 'missingA', 'missing550']
      .map((name) => `Could not find sound '${name}'.`)
    expect(owner(f.chat)).toEqual(Array(8).fill('0 1'))
    expect(debug(f.chat)).toEqual(errors)
    expect(f.heard).toEqual(errors.map((e) => `HEARD ${e}`))
    expect(f.rezzed).toEqual([])
  })

  it('looks a name up before a key, and an item of another type blocks the key', async () => {
    const f = await rezzer(`
      r([REZ_SOUND, "${SB}", 1.0, FALSE]);
      r([REZ_SOUND_COLLIDE, "${SB}", 0.5]);
      r([REZ_SOUND, (key)"${SB}", 1.0, FALSE]);
      r([REZ_SOUND, "${SB.toUpperCase()}", 1.0, FALSE]);
      r([REZ_SOUND, "${SA}", 1.0, FALSE]);
      r([REZ_SOUND_COLLIDE, "${SA}", 0.5]);`, { names: { a: SB, t: SA } })
    // In-world: sound A renamed to sound B's key and the texture to sound A's key, then C34, C35,
    // C39, C38, C36 and C37 in Mono and Luau. The name gave sound A, upper case gave sound B, and
    // the texture's name stopped either option taking sound A's key.
    expect(owner(f.chat)).toEqual(['1 0', '1 0', '1 0', '1 0', '0 1', '0 1'])
    expect(f.sound(0)?.sound).toBe(SA)
    expect(f.collision(1)).toEqual({ sound: SA, volume: 0.5 })
    expect(f.sound(2)?.sound).toBe(SA)
    expect(f.sound(3)?.sound).toBe(SB)
    expect(debug(f.chat)).toEqual([`Could not find sound '${SA}'.`, `Could not find sound '${SA}'.`])
  })
})
