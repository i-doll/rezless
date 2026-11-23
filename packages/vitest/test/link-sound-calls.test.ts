import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlLinkPlaySound, LlLinkStopSound,
// LlLinkAdjustSoundVolume, LlLinkSetSoundRadius, LlLinkSetSoundQueueing,
// LlSetLinkTextureAnim and LlLinkParticleSystem document LINK_SET,
// LINK_ALL_OTHERS, LINK_ALL_CHILDREN and LINK_THIS, but not a link number below
// LINK_THIS, link 0, or what happens to an avatar sitting on the object.
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm 7.3.0, 2026-11-23).
// A three-box and a two-box linkset and a lone box held the same script in every
// prim. Before each call the script gave every prim a known state through its
// positive link number: sound A looping at gain 0.5, radius 10 + link, queueing
// off, a 3x3 texture animation on all sides and a three-particle burst. It then
// called, with one link number L, llLinkPlaySound(L, B, 0.8, SOUND_LOOP),
// llLinkAdjustSoundVolume(L, 0.25), llLinkSetSoundRadius(L, 7.0),
// llLinkSetSoundQueueing(L, TRUE), llSetLinkTextureAnim(L, ANIM_ON | SMOOTH |
// LOOP, 2, 2, 2, 0.0, 4.0, 2.0), llLinkParticleSystem(L, a seven-particle burst)
// and llLinkPlaySound(L, C, 0.6, SOUND_TRIGGER), or, from the same state,
// llLinkStopSound(L). The viewer read back every link's sound, texture
// animation and particle system, and listed the attached and triggered sounds
// it heard, by the object or avatar that played them.

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'
const A = 'caae27c6-6dd3-495e-9cc2-a3f94cb60568'
const B = 'ed124764-705d-d497-167a-182cd9fa2e6c'
const C = '4c8c3c77-de8d-bde2-b9b8-32635e0fd4a6'
const MIN = -2147483648

const SOURCE = `
integer TOT;
integer P(integer i) { if (TOT == 1) return LINK_THIS; return i; }
default {
  link_message(integer sender, integer num, string cmd, key id) {
    TOT = llGetObjectPrimCount(llGetKey());
    if (num != llGetLinkNumber()) return;
    integer L = (integer)((string)id);
    integer i;
    for (i = 1; i <= TOT; ++i) {
      llLinkPlaySound(P(i), "${A}", 0.5, SOUND_LOOP);
      llLinkSetSoundRadius(P(i), 10.0 + i);
      llLinkSetSoundQueueing(P(i), FALSE);
      llSetLinkTextureAnim(P(i), ANIM_ON | LOOP, ALL_SIDES, 3, 3, 0.0, 9.0, 1.0);
      llLinkParticleSystem(P(i), [PSYS_PART_MAX_AGE, 3.0, PSYS_SRC_BURST_PART_COUNT, 3]);
    }
    if (cmd == "play") {
      llLinkPlaySound(L, "${B}", 0.8, SOUND_LOOP);
      llLinkAdjustSoundVolume(L, 0.25);
      llLinkSetSoundRadius(L, 7.0);
      llLinkSetSoundQueueing(L, TRUE);
      llSetLinkTextureAnim(L, ANIM_ON | SMOOTH | LOOP, 2, 2, 2, 0.0, 4.0, 2.0);
      llLinkParticleSystem(L, [PSYS_PART_MAX_AGE, 2.0, PSYS_SRC_BURST_PART_COUNT, 7]);
      llLinkPlaySound(L, "${C}", 0.6, SOUND_TRIGGER);
    } else llLinkStopSound(L);
  }
}`

async function scene(count: number, seated: boolean) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({
    region: 'home', key: AVATAR, name: 'av', username: 'av', size: { x: 0.45, y: 0.6, z: 1.65 },
    position: { x: 110, y: 50, z: 20 },
  })
  const { linkset, scripts } = await loadLinkset({
    world, region: 'home', owner: AVATAR, position: { x: 116, y: 50, z: 20 },
    prims: Array.from({ length: count }, (_, i) => ({ name: `p${i + 1}`, scripts: [{ name: `p${i + 1}`, source: { source: SOURCE } }] })),
  })
  linkset.prims.forEach((p, i) => { if (i) p.params.position = { x: 0.6 * i, y: 0, z: 0 } })
  for (const s of Object.values(scripts)) s.start()
  if (seated) {
    expect(world.sitAvatar(avatar, linkset.prims[0]!)).toBe(true)
    linkset.advanceTime(100)
  }
  /**
   * Run one pass from the prim at `caller` (1-based) and mark what it changed.
   * Every link it marks unchanged must still hold its whole starting state.
   */
  const run = (caller: number, cmd: 'play' | 'stop', link: number) => {
    avatar.sound.current = cmd === 'stop' ? { sound: A, volume: 0.5, loop: true, sync: 'none' } : null
    avatar.sound.radius = 0
    avatar.sound.queueing = false
    avatar.sound.triggers.length = 0
    linkset.prims.forEach((p) => { p.sound.triggers.length = 0 })
    const num = linkset.prims[caller - 1]!.linkNumber
    linkset.deliverLinkMessage(num, -1, num, cmd, String(link))
    linkset.advanceTime(1000)
    const mark = (hit: boolean) => (hit ? 'x' : '-')
    const prims = linkset.prims.map((p) => cmd === 'play'
      ? mark(p.sound.current?.sound === B && p.sound.current.volume === 0.25 && p.sound.radius === 7 && p.sound.queueing &&
        p.sound.triggers.some((t) => t.sound === C) && p.params.textureAnim.sizex === 2 && p.particles?.rules[3] === 7)
      : mark(p.sound.current === null)).join('')
    const sitter = cmd === 'play'
      ? mark(avatar.sound.current?.sound === B && avatar.sound.current.volume === 0.25 && avatar.sound.radius === 7 &&
        avatar.sound.queueing && avatar.sound.triggers.some((t) => t.sound === C))
      : mark(avatar.sound.current === null)
    linkset.prims.forEach((p, i) => {
      if (prims[i] === 'x') return
      expect(p.sound.current).toMatchObject({ sound: A, volume: 0.5 })
      expect(p.sound).toMatchObject({ radius: 11 + i, queueing: false, triggers: [] })
      expect(p.params.textureAnim.sizex).toBe(3)
      expect(p.particles?.rules[3]).toBe(3)
    })
    if (sitter === '-') {
      expect(avatar.sound).toMatchObject({ radius: 0, queueing: false, triggers: [] })
      expect(avatar.sound.current?.sound ?? null).toBe(cmd === 'stop' ? A : null)
    }
    return seated ? `${prims}/${sitter}` : prims
  }
  return { world, avatar, linkset, scripts, run }
}

const LINKS = [-5, -100, MIN, 0] as const

describe('link sound, texture animation and particle calls on a linkset', () => {
  // In-world, three boxes, each L in -5, -100, -2147483648, 0: every call of the
  // pass changed the same one link, and llLinkStopSound stopped that link only.
  // From the root: link 2, link 2, link 2, nothing. From child 2 and from child 3:
  // the root for all four. LINK_SET, LINK_ALL_OTHERS and LINK_ALL_CHILDREN
  // changed xxx, -xx and -xx from the root, x-x and -xx from child 2, xx- and
  // -xx from child 3.
  it.each([
    [1, ['-x-', '-x-', '-x-', '---']],
    [2, ['x--', 'x--', 'x--', 'x--']],
    [3, ['x--', 'x--', 'x--', 'x--']],
  ])('from link %i of three prims', async (caller, want) => {
    const s = await scene(3, false)
    for (const cmd of ['play', 'stop'] as const) {
      expect(LINKS.map((link) => s.run(caller, cmd, link))).toEqual(want)
    }
  })

  it.each([
    [-1, ['xxx', 'xxx', 'xxx']],
    [-2, ['-xx', 'x-x', 'xx-']],
    [-3, ['-xx', '-xx', '-xx']],
  ])('group flag %i from each link of three prims', async (link, want) => {
    const s = await scene(3, false)
    expect([1, 2, 3].map((caller) => s.run(caller, 'play', link))).toEqual(want)
    expect([1, 2, 3].map((caller) => s.run(caller, 'stop', link))).toEqual(want)
  })

  // In-world, two boxes: link 2 from the root for -5, -100 and -2147483648 and
  // nothing for 0; the root from child 2 for all four.
  it.each([
    [1, ['-x', '-x', '-x', '--']],
    [2, ['x-', 'x-', 'x-', 'x-']],
  ])('from link %i of two prims', async (caller, want) => {
    const s = await scene(2, false)
    for (const cmd of ['play', 'stop'] as const) expect(LINKS.map((link) => s.run(caller, cmd, link))).toEqual(want)
  })

  // In-world, a lone box: -5, -100, -2147483648, LINK_ALL_OTHERS and
  // LINK_ALL_CHILDREN changed nothing; 0, LINK_SET and LINK_THIS changed the box.
  it('on a lone prim', async () => {
    const s = await scene(1, false)
    const links = [-5, -100, MIN, 0, -1, -2, -3, -4]
    for (const cmd of ['play', 'stop'] as const) {
      expect(links.map((link) => s.run(1, cmd, link))).toEqual(['-', '-', '-', 'x', 'x', '-', '-', 'x'])
    }
  })
})

describe('link sound calls reach a seated avatar', () => {
  // In-world, an avatar seated on the lone box: -5, -100, -2147483648,
  // LINK_ALL_OTHERS and LINK_ALL_CHILDREN attached sound B to the avatar, at gain
  // 0.8 then 0.25, with radius 7 and the queueing flag, triggered C from the
  // avatar, and llLinkStopSound stopped the avatar's sound. The box kept its
  // sound, texture animation and particles. LINK_SET did both the box and the
  // avatar. Link 0 did neither, and LINK_THIS only the box. Whether the avatar
  // took the texture animation or the particles could not be read: the viewer
  // reports neither for an avatar, and with bright particles from -5,
  // LINK_ALL_OTHERS and LINK_SET a snapshot showed none where the avatar sat,
  // two metres from the box, though the snapshots draw no avatars.
  it('on a lone prim', async () => {
    const s = await scene(1, true)
    const links = [-5, -100, MIN, 0, -1, -2, -3, -4]
    const want = ['-/x', '-/x', '-/x', '-/-', 'x/x', '-/x', '-/x', 'x/-']
    expect(links.map((link) => s.run(1, 'play', link))).toEqual(want)
    expect(links.map((link) => s.run(1, 'stop', link))).toEqual(want)
  })

  // In-world, an avatar seated on the root of three boxes: the prim rows matched
  // the unseated ones. LINK_SET, LINK_ALL_OTHERS and LINK_ALL_CHILDREN also gave
  // the avatar the sound, from the root and from child 2; -5 and 0 did not. Link
  // 4, the avatar's link number, gave the avatar the sound and no prim.
  it.each([
    [1, [-5, 0, -1, -2, -3, 4], ['-x-/-', '---/-', 'xxx/x', '-xx/x', '-xx/x', '---/x']],
    [2, [-5, 0, -1, -2, -3], ['x--/-', 'x--/-', 'xxx/x', 'x-x/x', '-xx/x']],
  ])('from link %i of three prims', async (caller, links, want) => {
    const s = await scene(3, true)
    expect(links.map((link) => s.run(caller, 'play', link))).toEqual(want)
    expect(links.map((link) => s.run(caller, 'stop', link))).toEqual(want)
  })

  it('triggers a sound where the avatar is', async () => {
    const s = await scene(1, true)
    s.run(1, 'play', -5)
    expect(s.avatar.sound.triggers).toEqual([{ sound: C, volume: expect.closeTo(0.6, 6), position: s.avatar.position }])
  })

  // In-world, a second probe on a lone box: after llLinkPlaySound(LINK_ALL_OTHERS)
  // gave the seated avatar a looping sound, the avatar stood and the viewer heard
  // no stop. Standing, llLinkAdjustSoundVolume(LINK_SET) and
  // llLinkStopSound(LINK_SET) changed the box only. Seated again,
  // llLinkStopSound(LINK_ALL_OTHERS) stopped the avatar's sound. Standing after
  // another play, llLinkStopSound(LINK_ALL_OTHERS) reached nothing.
  it('keeps the sound on an avatar that stands, out of reach until it sits again', async () => {
    const s = await scene(1, true)
    s.run(1, 'play', -2)
    s.world.standAvatar(s.avatar)
    s.linkset.advanceTime(100)
    expect(s.avatar.sound.current).toMatchObject({ sound: B, volume: 0.25 })
    s.linkset.deliverLinkMessage(0, -1, 0, 'stop', String(-1))
    s.linkset.advanceTime(1000)
    expect(s.linkset.prims[0]!.sound.current).toBeNull()
    expect(s.avatar.sound.current).toMatchObject({ sound: B, volume: 0.25 })
    expect(s.world.sitAvatar(s.avatar, s.linkset.prims[0]!)).toBe(true)
    s.linkset.advanceTime(100)
    s.linkset.deliverLinkMessage(1, -1, 1, 'stop', String(-2))
    s.linkset.advanceTime(1000)
    expect(s.avatar.sound.current).toBeNull()
  })
})
