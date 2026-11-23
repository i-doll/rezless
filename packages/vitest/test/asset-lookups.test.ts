import { describe, it, expect } from 'vitest'
import { loadScript, makeInventoryItem, InventoryType, DEBUG_CHANNEL, PERMISSION_TRIGGER_ANIMATION } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlPlaySound
// https://wiki.secondlife.com/wiki/LlTriggerSound
// https://wiki.secondlife.com/wiki/LlCollisionSound
// https://wiki.secondlife.com/wiki/LlSetTexture
// https://wiki.secondlife.com/wiki/LlParticleSystem
// https://wiki.secondlife.com/wiki/LlStartAnimation
// https://wiki.secondlife.com/wiki/LlRequestInventoryData
// https://wiki.secondlife.com/wiki/LlGetRenderMaterial
// In-world: one box on the Aditi beta grid, region SLua Tideland, 2026-11-23, holding two uploaded
// textures (A, B), two uploaded sounds (A, B), an animation, a landmark and an empty notecard, with a
// Mono script and an SLua script that ran each call on a chat command. The items were renamed between
// commands. Sounds were read from the viewer's sound events, particle textures from the object's
// particle system, and the rest from the scripts' own reads and DEBUG_CHANNEL.

const OWNER = '00000000-0000-0000-0000-00000000000a'
const TEX_A = '3144123a-3577-4e80-cf84-32917d3fe8d8'
const TEX_B = '3f6c6cb7-8781-7827-703a-8311e54f768b'
const SND_A = '0a280631-071c-dc05-b1e9-2e3fd31d264f'
const SND_B = '8cdc600e-831f-d095-d6c5-88f08672bb15'
const ANIM = '7a48d23e-861a-7068-18e0-c11939ce79a7'
const DANCE1 = 'b68a3d7c-de9e-fc87-eec8-543d787e5b0d'
const LANDMARK = '2eb394af-7cc3-120f-9920-d52214559041'
const NULL_KEY = '00000000-0000-0000-0000-000000000000'
const BASE = '5748decc-f629-461c-9a36-a35a221fe21f'

type Item = { name: string; type: number; key: string }

async function run(body: string, items: Item[], options: { slua?: boolean } = {}) {
  const s = await loadScript(
    options.slua
      ? { owner: OWNER, source: body, language: 'slua' }
      : { owner: OWNER, source: `list out; default { state_entry() { ${body} } }` },
  )
  for (const item of items) s.host.addInventory(makeInventoryItem(item))
  s.start()
  return s
}

const errors = (s: Awaited<ReturnType<typeof run>>) => s.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text)
const prim = (s: Awaited<ReturnType<typeof run>>) => s.linkset.prims[0]!

const sound = (name: string, key: string): Item => ({ name, type: InventoryType.SOUND, key })
const texture = (name: string, key: string): Item => ({ name, type: InventoryType.TEXTURE, key })

describe('sounds by name or key', () => {
  // In-world: llPlaySound and llTriggerSound with sound A's key in upper case played sound A, and
  // llCollisionSound with sound B's key in upper case read back as B's key in lower case.
  it('takes a key in any case', async () => {
    const s = await run(`llPlaySound("${SND_A.toUpperCase()}", 1.0); llTriggerSound("${SND_A.toUpperCase()}", 1.0);
      llCollisionSound("${SND_B.toUpperCase()}", 1.0); out = llGetPrimitiveParams([PRIM_COLLISION_SOUND]);`, [sound('p420 sndA', SND_A)])
    expect(prim(s).sound.current?.sound).toBe(SND_A)
    expect(prim(s).sound.triggers.map((t) => t.sound)).toEqual([SND_A])
    expect(s.global('out')).toEqual([SND_B, 1])
    expect(errors(s)).toEqual([])
  })

  // In-world: with sound A's item renamed to sound B's key, llPlaySound, llTriggerSound and
  // llCollisionSound with that text all took sound A. The same key in upper case matched no name and
  // played sound B.
  it('looks an item name up before a key', async () => {
    const items = [sound(SND_B, SND_A), sound('p420 sndB', SND_B)]
    const s = await run(`llPlaySound("${SND_B}", 1.0); llTriggerSound("${SND_B}", 1.0); llCollisionSound("${SND_B}", 1.0);
      out = llGetPrimitiveParams([PRIM_COLLISION_SOUND]);`, items)
    expect(prim(s).sound.current?.sound).toBe(SND_A)
    expect(prim(s).sound.triggers.map((t) => t.sound)).toEqual([SND_A])
    expect(s.global('out')).toEqual([SND_A, 1])

    const upper = await run(`llPlaySound("${SND_B.toUpperCase()}", 1.0);`, items)
    expect(prim(upper).sound.current?.sound).toBe(SND_B)
  })

  // In-world: with texture A's item renamed to sound B's key, llPlaySound and llTriggerSound with that
  // text said "Could not find sound '<key>'." and played nothing, and llCollisionSound stored the null key.
  it('finds no sound when an item of another type has the name', async () => {
    const items = [texture(SND_B, TEX_A), sound('p420 sndB', SND_B)]
    const s = await run(`llPlaySound("${SND_B}", 1.0); llTriggerSound("${SND_B}", 1.0); llCollisionSound("${SND_B}", 1.0);
      out = llGetPrimitiveParams([PRIM_COLLISION_SOUND]);`, items)
    expect(prim(s).sound.current).toBeNull()
    expect(prim(s).sound.triggers).toEqual([])
    expect(s.global('out')).toEqual([NULL_KEY, 1])
    expect(errors(s)).toEqual([`Could not find sound '${SND_B}'.`, `Could not find sound '${SND_B}'.`])
  })

  // In-world, a second box with texture A's item renamed to sound B's key: llLoopSound, llLinkPlaySound,
  // llTriggerSoundLimited and llPreloadSound with that text each said "Could not find sound '<key>'.", and
  // {PRIM_COLLISION_SOUND} with it stored the null key.
  it('finds no sound for the other sound calls either', async () => {
    const s = await run(`vector p = llGetPos(); llLoopSound("${SND_B}", 1.0); llLinkPlaySound(LINK_THIS, "${SND_B}", 1.0, SOUND_PLAY);
      llTriggerSoundLimited("${SND_B}", 1.0, p + <5,5,5>, p - <5,5,5>); llPreloadSound("${SND_B}");
      llSetPrimitiveParams([PRIM_COLLISION_SOUND, "${BASE}", 1.0, PRIM_COLLISION_SOUND, "${SND_B}", 1.0]);
      out = llGetPrimitiveParams([PRIM_COLLISION_SOUND]);`, [texture(SND_B, TEX_A), sound('p420 sndB', SND_B)])
    expect(prim(s).sound.current).toBeNull()
    expect(prim(s).sound.triggers).toEqual([])
    expect(s.global('out')).toEqual([NULL_KEY, 1])
    expect(errors(s)).toEqual(Array(4).fill(`Could not find sound '${SND_B}'.`))
  })

  // In-world: the same in SLua. ll.PlaySound with sound B's key, with sound A's item named that, played sound A.
  it('looks an item name up first in SLua too', async () => {
    const s = await run(`ll.PlaySound("${SND_B}", 1)`, [sound(SND_B, SND_A), sound('p420 sndB', SND_B)], { slua: true })
    expect(prim(s).sound.current?.sound).toBe(SND_A)
  })
})

describe('textures by name or key', () => {
  // In-world: with sound B's item renamed to texture B's key, llSetTexture with that text said
  // "Could not find texture '<key>'." and left the face alone, and PRIM_NORMAL with it stored the null key.
  it('finds no texture when an item of another type has the name', async () => {
    const s = await run(`llSetTexture("${BASE}", 0); llSetTexture("${TEX_B}", 0);
      llSetPrimitiveParams([PRIM_NORMAL, 0, "${BASE}", <1,1,0>, ZERO_VECTOR, 0.0]);
      llSetPrimitiveParams([PRIM_NORMAL, 0, "${TEX_B}", <1,1,0>, ZERO_VECTOR, 0.0]);
      out = [llGetTexture(0)] + llList2List(llGetPrimitiveParams([PRIM_NORMAL, 0]), 0, 0);`,
    [sound(TEX_B, SND_B), texture('p420 texB', TEX_B)])
    expect(s.global('out')).toEqual([BASE, NULL_KEY])
    expect(errors(s)).toEqual([`Could not find texture '${TEX_B}'.`])
  })

  // In-world, a second box with sound A's item renamed to texture B's key: {PRIM_TEXTURE} with that text
  // read the null key as a string, {PRIM_SPECULAR} the null key, llSetLinkTexture said "Could not find
  // texture '<key>'." and left the face alone, and a sculpt with it as the map read back as a torus.
  it('takes no texture from the other prim-param and link calls when an item of another type has the name', async () => {
    const s = await run(`llSetTexture("${BASE}", 0);
      llSetPrimitiveParams([PRIM_TEXTURE, 1, "${BASE}", <1,1,0>, ZERO_VECTOR, 0.0, PRIM_TEXTURE, 1, "${TEX_B}", <1,1,0>, ZERO_VECTOR, 0.0,
        PRIM_SPECULAR, 0, "${BASE}", <1,1,0>, ZERO_VECTOR, 0.0, <1,1,1>, 51, 0, PRIM_SPECULAR, 0, "${TEX_B}", <1,1,0>, ZERO_VECTOR, 0.0, <1,1,1>, 51, 0]);
      llSetLinkTexture(LINK_THIS, "${TEX_B}", 0);
      out = llList2List(llGetPrimitiveParams([PRIM_TEXTURE, 1]), 0, 0) + llList2List(llGetPrimitiveParams([PRIM_SPECULAR, 0]), 0, 0) + [llGetTexture(0)];
      out += [llGetListEntryType(out, 0), llGetListEntryType(out, 1)];
      llSetPrimitiveParams([PRIM_TYPE, PRIM_TYPE_SCULPT, "${TEX_B}", PRIM_SCULPT_TYPE_SPHERE]);
      out += llList2List(llGetPrimitiveParams([PRIM_TYPE]), 0, 0);`,
    [sound(TEX_B, SND_A), texture('p420 texB', TEX_B)])
    expect(s.global('out')).toEqual([NULL_KEY, NULL_KEY, BASE, 3, 4, 4])
    expect(errors(s)).toEqual([`Could not find texture '${TEX_B}'.`])
  })

  // In-world (SLua, measured for #441 on 2026-11-13): ll.SetRenderMaterial with the name of a texture item
  // that reads like a key said "Could not find render material".
  it('finds no render material when a texture item has the name', async () => {
    const s = await run(`ll.SetRenderMaterial("${TEX_B}", 1)`, [texture(TEX_B, TEX_A)], { slua: true })
    expect(errors(s)).toEqual([`Could not find render material '${TEX_B}'.`])
  })

  // In-world: llSetRenderMaterial with the name of the empty notecard said
  // "Could not find render material 'p420 nc'.".
  it('finds no render material in a notecard', async () => {
    const s = await run('llSetRenderMaterial("p420 nc", 0);', [{ name: 'p420 nc', type: InventoryType.NOTECARD, key: NULL_KEY }])
    expect(errors(s)).toEqual(["Could not find render material 'p420 nc'."])
  })

  // In-world: with texture A in the prim as "p420 texA" and then "p420 texA2", a face set by either
  // name read back as "p420 texA". (Renaming an item moved it behind the other one.)
  it('reads a face back as the first item holding its texture', async () => {
    const s = await run('llSetTexture("p420 texA2", 1); out = [llGetTexture(1)];', [texture('p420 texA', TEX_A), texture('p420 texA2', TEX_A)])
    expect(s.global('out')).toEqual(['p420 texA'])
  })

  // In-world: after the owner renamed "p420 texA" to "zz texA", the face read "p420 texA2"; after renaming
  // "p420 texA2" to "aa texA2", it read "zz texA"; after renaming "zz texA" to "a texA", it read "aa texA2".
  // Each rename moved the item behind the other one, whatever the names' order.
  it('finds a renamed item after the others holding the same texture', async () => {
    const s = await loadScript({ owner: OWNER, source: `list out; default {
      state_entry() { llSetTexture("p420 texA", 1); } touch_start(integer n) { out += [llGetTexture(1)]; } }` })
    for (const item of [texture('p420 texA', TEX_A), texture('p420 texA2', TEX_A)]) s.host.addInventory(makeInventoryItem(item))
    s.start()
    for (const [from, to] of [['p420 texA', 'zz texA'], ['p420 texA2', 'aa texA2'], ['zz texA', 'a texA']] as const) {
      prim(s).renameInventory(from, to)
      s.linkset.touch(0)
    }
    expect(s.global('out')).toEqual(['p420 texA2', 'zz texA', 'aa texA2'])
  })

  // In-world: on a face with no render material, llGetRenderMaterial and {PRIM_RENDER_MATERIAL} read
  // "p420 nc", the empty notecard's name, as a string. {PRIM_NORMAL} and {PRIM_SPECULAR} read the null key.
  it('reads no render material as the name of an empty notecard', async () => {
    const s = await run(`out = [llGetRenderMaterial(1)] + llGetPrimitiveParams([PRIM_RENDER_MATERIAL, 1])
        + llList2List(llGetPrimitiveParams([PRIM_NORMAL, 1]), 0, 0) + llList2List(llGetPrimitiveParams([PRIM_SPECULAR, 1]), 0, 0);
      integer i; for (i = 0; i < 4; ++i) out += llGetListEntryType(out, i);`,
    [{ name: 'p420 nc', type: InventoryType.NOTECARD, key: NULL_KEY }])
    expect(s.global('out')).toEqual(['p420 nc', 'p420 nc', NULL_KEY, NULL_KEY, 3, 3, 4, 4])

    const withText = await run('out = [llGetRenderMaterial(1)];', [{ name: 'config', type: InventoryType.NOTECARD, key: NULL_KEY, notecardLines: ['a'] }])
    expect(withText.global('out')).toEqual([NULL_KEY])
  })
})

describe('particle textures by name or key', () => {
  const texOf = (s: Awaited<ReturnType<typeof run>>) => prim(s).particles?.texture
  const particles = (tex: string) => `llParticleSystem([PSYS_SRC_TEXTURE, "${tex}", PSYS_PART_MAX_AGE, 1.0, PSYS_SRC_BURST_RATE, 0.5]);`

  // In-world: texture B's key, the name "p420 texB", and texture B's key in upper case all gave the
  // particles texture B; another key in upper case was stored in lower case.
  it('takes a name, or a key in any case', async () => {
    const items = [texture('p420 texB', TEX_B)]
    for (const tex of [TEX_B, 'p420 texB', TEX_B.toUpperCase()]) expect(texOf(await run(particles(tex), items))).toBe(TEX_B)
    expect(texOf(await run(particles(BASE.toUpperCase()), items))).toBe(BASE)
  })

  // In-world: with texture A's item renamed to texture B's key, that text gave the particles texture A;
  // the key in upper case gave texture B.
  it('looks an item name up before a key', async () => {
    const items = [texture(TEX_B, TEX_A), texture('p420 texB', TEX_B)]
    expect(texOf(await run(particles(TEX_B), items))).toBe(TEX_A)
    expect(texOf(await run(particles(TEX_B.toUpperCase()), items))).toBe(TEX_B)
  })

  // In-world: with sound B's item renamed to texture B's key, that text gave the particles the null key.
  it('takes no texture when an item of another type has the name', async () => {
    expect(texOf(await run(particles(TEX_B), [sound(TEX_B, SND_B), texture('p420 texB', TEX_B)]))).toBe(NULL_KEY)
  })

  // In-world: the same in SLua: ll.ParticleSystem with texture B's key, with texture A's item named that,
  // gave the particles texture A.
  it('looks an item name up first in SLua too', async () => {
    const s = await run(`ll.ParticleSystem({PSYS_SRC_TEXTURE, "${TEX_B}", PSYS_PART_MAX_AGE, 1.0})`,
      [texture(TEX_B, TEX_A), texture('p420 texB', TEX_B)], { slua: true })
    expect(texOf(s)).toBe(TEX_A)
  })
})

describe('animations by name, never by key', () => {
  const start = async (anim: string, items: Item[]) => {
    const s = await loadScript({ owner: OWNER, source: `default {
      state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_TRIGGER_ANIMATION); }
      touch_start(integer n) { llStartAnimation("${anim}"); } }` })
    for (const item of items) s.host.addInventory(makeInventoryItem(item))
    s.start()
    s.grantPermissions(PERMISSION_TRIGGER_ANIMATION)
    s.linkset.touch(0)
    return s
  }
  const anim = (name: string): Item => ({ name, type: InventoryType.ANIMATION, key: ANIM })

  // In-world: llStartAnimation with the key of the animation in the prim, in lower or upper case, or with
  // dance1's key, said "Could not find animation '<key>'" and started nothing.
  it.each([ANIM, ANIM.toUpperCase(), DANCE1])('finds nothing by the key %s', async (key) => {
    const s = await start(key, [anim('p420 anim')])
    expect(s.getPlayingAnimations(OWNER)).not.toContain(ANIM)
    expect(errors(s)).toEqual([`Could not find animation '${key}'`])
  })

  // In-world: with the animation item renamed "dance1", llStartAnimation("dance1") started the item;
  // with a texture named "dance1" instead, it started the built-in dance1.
  it('takes an animation item before a built-in, and passes over other types', async () => {
    expect((await start('dance1', [anim('dance1')])).getPlayingAnimations(OWNER)).toContain(ANIM)
    const s = await start('dance1', [anim('p420 anim'), texture('dance1', TEX_A)])
    expect(s.getPlayingAnimations(OWNER)).toContain(DANCE1)
    expect(errors(s)).toEqual([])
  })
})

describe('landmarks by name only', () => {
  // In-world: llRequestInventoryData("p420 lm") returned a request key. The landmark's key, in lower or
  // upper case, a missing name and the name of a texture returned the null key, and nothing was said.
  it('returns the null key for anything but a landmark name', async () => {
    const s = await run(`out = [llRequestInventoryData("${LANDMARK}"), llRequestInventoryData("${LANDMARK.toUpperCase()}"),
      llRequestInventoryData("nothing here"), llRequestInventoryData("p420 texB"), llRequestInventoryData("p420 lm") == NULL_KEY];`,
    [{ name: 'p420 lm', type: InventoryType.LANDMARK, key: LANDMARK }, texture('p420 texB', TEX_B)])
    expect(s.global('out')).toEqual([NULL_KEY, NULL_KEY, NULL_KEY, NULL_KEY, 0])
    expect(errors(s)).toEqual([])
  })
})
