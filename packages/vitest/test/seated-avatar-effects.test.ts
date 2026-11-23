import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlSetLinkTextureAnim and
// https://wiki.secondlife.com/wiki/LlLinkParticleSystem don't say what a link
// call does to an avatar sitting on the object.
//
// In-world (Aditi beta grid, SLua Tideland, Firestorm 7.3.0, 2026-11-23): a lone
// box and a two-box linkset each held the same script in every prim. With the
// probe avatar seated, the script called llSetLinkTextureAnim(L, ANIM_ON | LOOP,
// ALL_SIDES, 2, 2, 0.0, 4.0, 1.0) then the same call with mode 0, and
// llLinkParticleSystem(L, a seven-particle burst) then llLinkParticleSystem(L, []).
// The viewer read each link's texture animation and particle system and the
// avatar's. Rows mark the links changed, in link order, then the avatar.

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'

const SOURCE = `
default {
  link_message(integer sender, integer num, string cmd, key id) {
    if (num != llGetLinkNumber()) return;
    integer L = (integer)((string)id);
    if (cmd == "anim3") llSetLinkTextureAnim(L, ANIM_ON | SMOOTH | LOOP, 2, 3, 3, 0.0, 0.0, 2.5);
    else if (cmd == "anim") llSetLinkTextureAnim(L, ANIM_ON | LOOP, ALL_SIDES, 2, 2, 0.0, 4.0, 1.0);
    else if (cmd == "clear anim") llSetLinkTextureAnim(L, 0, ALL_SIDES, 0, 0, 0.0, 0.0, 0.0);
    else if (cmd == "particles") llLinkParticleSystem(L, [PSYS_PART_MAX_AGE, 2.0, PSYS_SRC_BURST_PART_COUNT, 7]);
  }
}`

async function scene(count: number) {
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
  for (const s of Object.values(scripts)) s.start()
  expect(world.sitAvatar(avatar, linkset.prims[0]!)).toBe(true)
  linkset.advanceTime(100)
  const send = (caller: number, cmd: string, link: number) => {
    const num = linkset.prims[caller - 1]!.linkNumber
    linkset.deliverLinkMessage(num, -1, num, cmd, String(link))
    linkset.advanceTime(1000)
  }
  const mark = (hit: boolean) => (hit ? 'x' : '-')
  const anim = (caller: number, link: number) => {
    send(caller, 'anim', link)
    const row = `${linkset.prims.map((p) => mark(p.params.textureAnim.sizex === 2)).join('')}/${mark(avatar.textureAnim.sizex === 2)}`
    send(caller, 'clear anim', link)
    expect([...linkset.prims.map((p) => p.params.textureAnim.mode), avatar.textureAnim.mode]).toEqual(Array(count + 1).fill(0))
    return row
  }
  const particles = (caller: number, link: number) => {
    linkset.prims.forEach((p) => { p.particles = null })
    send(caller, 'particles', link)
    return linkset.prims.map((p) => mark(p.particles !== null)).join('')
  }
  return { world, avatar, linkset, send, anim, particles }
}

describe('texture animation on a seated avatar', () => {
  // In-world, lone box: -5, LINK_ALL_OTHERS, LINK_ALL_CHILDREN and 2 (the
  // avatar's link number) animated the avatar only; LINK_SET the box and the
  // avatar; LINK_THIS and 1 the box only; 0 nothing. The mode 0 call cleared
  // whatever the same link number had set.
  it('from a lone prim', async () => {
    const s = await scene(1)
    expect([-5, 0, -1, -2, -3, -4, 1, 2].map((link) => s.anim(1, link)))
      .toEqual(['-/x', '-/-', 'x/x', '-/x', '-/x', 'x/-', 'x/-', '-/x'])
  })

  // In-world, two boxes with the avatar on the root (link 3). From the root:
  // -5 link 2, 0 nothing, 3 the avatar, LINK_SET everything, LINK_ALL_OTHERS and
  // LINK_ALL_CHILDREN link 2 and the avatar. From link 2: -5 and 0 the root,
  // LINK_SET everything, LINK_ALL_OTHERS the root and the avatar,
  // LINK_ALL_CHILDREN link 2 and the avatar, 2 link 2 only.
  it.each([
    [1, [-5, 0, 3, -1, -2, -3], ['-x/-', '--/-', '--/x', 'xx/x', '-x/x', '-x/x']],
    [2, [-5, 0, -1, -2, -3, 2], ['x-/-', 'x-/-', 'xx/x', 'x-/x', '-x/x', '-x/-']],
  ])('from link %i of two prims', async (caller, links, want) => {
    const s = await scene(2)
    expect(links.map((link) => s.anim(caller, link))).toEqual(want)
  })

  // In-world, lone box: after llSetLinkTextureAnim(LINK_SET, ANIM_ON | SMOOTH |
  // LOOP, 2, 3, 3, 0.0, 0.0, 2.5) the avatar stood and still carried the
  // animation. Standing, LINK_SET and LINK_ALL_OTHERS with mode 0 cleared the box
  // only, and LINK_ALL_OTHERS with a new 2x2 animation reached nothing. Seated again,
  // the avatar still had the 3x3 animation, and LINK_ALL_OTHERS replaced it.
  it('keeps the animation on an avatar that stands, out of reach until it sits again', async () => {
    const s = await scene(1)
    s.send(1, 'anim3', -1)
    s.world.standAvatar(s.avatar)
    s.linkset.advanceTime(100)
    expect(s.avatar.textureAnim.sizex).toBe(3)
    s.send(1, 'clear anim', -1)
    s.send(1, 'clear anim', -2)
    s.send(1, 'anim', -2)
    expect(s.linkset.prims[0]!.params.textureAnim.mode).toBe(0)
    expect(s.avatar.textureAnim).toMatchObject({ mode: 19, sizex: 3 })
    expect(s.world.sitAvatar(s.avatar, s.linkset.prims[0]!)).toBe(true)
    s.linkset.advanceTime(100)
    expect(s.avatar.textureAnim.sizex).toBe(3)
    s.send(1, 'anim', -2)
    expect(s.avatar.textureAnim.sizex).toBe(2)
  })
})

describe('particles never reach a seated avatar', () => {
  // In-world, the same probes with llLinkParticleSystem: the viewer never saw a
  // particle system on the avatar, for any link number. The prims took the
  // particles as they do with nobody seated: on a lone box LINK_SET, LINK_THIS
  // and 1 set the box and the others nothing; on two boxes LINK_SET set both
  // and the avatar's link number set nothing.
  it('from a lone prim', async () => {
    const s = await scene(1)
    expect([-5, 0, -1, -2, -3, -4, 1, 2].map((link) => s.particles(1, link)))
      .toEqual(['-', '-', 'x', '-', '-', 'x', 'x', '-'])
  })

  it('from the root of two prims', async () => {
    const s = await scene(2)
    expect([3, -1].map((link) => s.particles(1, link))).toEqual(['--', 'xx'])
  })
})
