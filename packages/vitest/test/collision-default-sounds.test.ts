import { describe, expect, it } from 'vitest'
import { loadLinkset } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlCollisionSound
// https://wiki.secondlife.com/wiki/PRIM_MATERIAL
//
// In-world (Aditi beta grid, SLua Tideland, Firestorm 7.3.0, 2026-11-23): a physical
// box was lifted and dropped onto a non-physical box, or onto land, and the viewer
// listed every triggered sound it heard with the object, sound, gain and position.
// Neither object had called llCollisionSound unless a test says so. Impact speeds come
// in steps of 0.218 m/s (gravity over one 45 Hz physics frame): a 1 m drop lands at 4.36 m/s.
describe('default collision sounds', () => {
  const S = 'ed124764-705d-d497-167a-182cd9fa2e6c'
  const WOOD_WOOD = '063c97d3-033a-4e9b-98d8-05c8074922cb'
  const DIRT = 'cbe75eb2-3375-41d8-9e3f-2ae46b4164ed'
  type Setup = { size?: string; material?: number; sound?: string }
  async function object(...prims: Setup[]) {
    const source = ({ size, material, sound }: Setup) => `default{state_entry(){${size ? `llSetScale(<${size}>);` : ''}${
      material === undefined ? '' : `llSetPrimitiveParams([PRIM_MATERIAL,${material}]);`}${sound ? `llCollisionSound(${sound});` : ''}}}`
    const { linkset, scripts } = await loadLinkset({ prims: prims.map((p, i) => ({ scripts: [{ name: `p${i}`, source: { source: source(p) } }] })) })
    for (const s of Object.values(scripts)) s.start()
    return linkset
  }
  type Linkset = Awaited<ReturnType<typeof object>>
  const heard = (l: Linkset) => l.prims.flatMap(p => p.sound.triggers.map(t => `${t.sound}@${+t.volume.toFixed(3)}`))

  // In-world, a 0.5 m wood box onto a 2 x 2 x 0.5 m wood box, from 0.25 to 3 m:
  // 2.18 m/s -> 0.817, 2.83 -> 1.062, 3.49 -> 1.307, 4.36 -> 1.633, 5.45 -> 2.042,
  // 6.32 -> 2.368, 7.63 -> 2.858, each played once from the falling box's root at its
  // position. Gains above 1 came through as they were.
  it.each([[2.18, 0.818], [2.83, 1.061], [3.49, 1.309], [4.36, 1.635], [5.45, 2.044], [7.63, 2.861]])(
    'plays the wood-on-wood sound from the falling box at 0.75 times %s m/s times its 0.5 m size', async (speed, gain) => {
      const box = await object({}), floor = await object({ size: '2,2,0.5' })
      box.collide(floor, speed)
      expect([heard(box), heard(floor)]).toEqual([[`${WOOD_WOOD}@${gain}`], []])
      expect(box.prims[0]!.sound.triggers[0]!.position).toEqual(box.prims[0]!.regionPosition())
    })

  // In-world, at 4.36 m/s: a 0.5 m box made eight times denser (10 kg instead of 1.25)
  // still played 1.633. A 0.25 m cube and a 0.5 x 0.5 x 0.25 m box played 0.817, and so
  // did a 0.5 m box onto a 0.25 m thick floor; a 0.5 x 0.5 x 1 m box played 1.633; a 1 m
  // cube onto a 1 m thick floor played 3.266. Mass doesn't count; the thinnest side of
  // either object does.
  it.each([
    ['0.25,0.25,0.25', '2,2,0.5', 0.818], ['0.5,0.5,0.25', '2,2,0.5', 0.818], ['0.5,0.5,0.5', '2,2,0.25', 0.818],
    ['0.5,0.5,1', '2,2,0.5', 1.635], ['1,1,1', '2,2,1', 3.27],
  ])('scales the gain by the thinnest side of either object: %s onto %s', async (box, floor, gain) => {
    const a = await object({ size: box }), b = await object({ size: floor })
    a.collide(b, 4.36)
    expect(heard(a)).toEqual([`${WOOD_WOOD}@${gain}`])
  })

  // In-world, the thin floor: a 0.5 m box dropped onto 2 x 2 m floors 0.1 and 0.01 m
  // thick played nothing at 4.36 m/s, nor onto the 0.01 m floor at 7.63 m/s. A 1 x 1 x 0.125 m
  // box played nothing at 4.36 m/s. Quiet impacts: a 0.5 m box at 1.74 and 1.96 m/s (twice),
  // and a 0.25 m cube at 3.49 m/s, played nothing; a 0.47 m cube at 2.18 m/s played 0.768
  // (twice) and a 0.4 m cube at 2.83 m/s played 0.849. An impact plays once the speed
  // times the thinnest side reaches about 1 (0.98 was silent, 1.02 played).
  it.each([
    ['0.5,0.5,0.5', '2,2,0.1', 4.36], ['0.5,0.5,0.5', '2,2,0.01', 7.63], ['1,1,0.125', '2,2,0.5', 4.36],
    ['0.5,0.5,0.5', '2,2,0.5', 1.96], ['0.25,0.25,0.25', '2,2,0.5', 3.49],
  ])('plays nothing when %s lands on %s at %s m/s', async (box, floor, speed) => {
    const a = await object({ size: box }), b = await object({ size: floor })
    a.collide(b, speed)
    expect([heard(a), heard(b)]).toEqual([[], []])
  })

  it.each([['0.47,0.47,0.47', 2.18, 0.768], ['0.4,0.4,0.4', 2.83, 0.849]])('plays %s at %s m/s at %s', async (box, speed, gain) => {
    const a = await object({ size: box }), b = await object({ size: '2,2,0.5' })
    a.collide(b, speed)
    expect(heard(a)).toEqual([`${WOOD_WOOD}@${gain}`])
  })

  // In-world, at 4.36 m/s, a 0.5 m box onto a 2 x 2 x 0.5 m floor: a lone box onto a
  // lone floor played from the box, whichever was made first. A lone box onto the floor
  // linked with two 0.3 m boxes played from the floor's root, at the floor's position.
  // The box linked with a 0.2 m box on top played from the box's root, onto the linked
  // floor and onto the lone one. Each played 1.633: the smaller linked prims didn't count.
  it.each([
    [1, 1, 'falling'], [1, 3, 'struck'], [2, 3, 'falling'], [2, 1, 'falling'],
  ])('plays from the struck root only when a lone prim lands on a linkset: %s prims onto %s', async (moving, hit, from) => {
    const a = await object({}, ...Array(moving - 1).fill({ size: '0.2,0.2,0.2' }))
    const b = await object({ size: '2,2,0.5' }, ...Array(hit - 1).fill({ size: '0.3,0.3,0.3' }))
    a.collide(b, 4.36)
    const sound = [`${WOOD_WOOD}@1.635`]
    expect([heard(a), heard(b)]).toEqual(from === 'falling' ? [sound, []] : [[], sound])
    const player = from === 'falling' ? a : b
    expect(player.prims[0]!.sound.triggers[0]!.position).toEqual(player.prims[0]!.regionPosition())
  })

  // In-world, at 4.36 m/s, falling material on struck material: stone on wood and wood
  // on stone played SND_STONE_WOOD; metal on glass and glass on metal SND_METAL_GLASS;
  // rubber on light SND_RUBBER_PLASTIC; flesh on flesh SND_FLESH_FLESH; plastic on metal
  // SND_METAL_PLASTIC; light on light SND_PLASTIC_PLASTIC. Each played at 1.633: the
  // material picks the sound, not the gain. The sounds are those of the viewer's
  // material table (indra/llprimitive/llmaterialtable.cpp), where light uses plastic's.
  it.each([
    [0, 3, '8c0f84c3-9afd-4396-b5f5-9bca2c911c20'], [3, 0, '8c0f84c3-9afd-4396-b5f5-9bca2c911c20'],
    [1, 2, 'bc4a4348-cfcc-4e5e-908e-8a52a8915fe6'], [2, 1, 'bc4a4348-cfcc-4e5e-908e-8a52a8915fe6'],
    [6, 7, '75cf3ade-9a5b-4c4d-bb35-f9799bda7fb2'], [4, 4, 'dce5fdd4-afe4-4ea1-822f-dd52cac46b08'],
    [5, 1, 'e534761c-1894-4b61-b20c-658a6fb68157'], [7, 7, '0e24a717-b97e-4b77-9c94-b59a5a88b2da'],
    [0, 0, '9538f37c-456e-4047-81be-6435045608d4'], [1, 3, '874a26fd-142f-4173-8c5b-890cd846c74d'],
  ])('picks the sound of material %s landing on material %s', async (mover, struck, sound) => {
    const a = await object({ material: mover }), b = await object({ size: '2,2,0.5', material: struck })
    a.collide(b, 4.36)
    expect([heard(a), heard(b)]).toEqual([[`${sound}@1.635`], []])
  })

  // In-world: a box with a sound at 1 landing on a physical box that never called, resting
  // on a floor, played only its own sound at 0.75, as on a non-physical box. A 0.25 m cube
  // with a sound at 1 played it at 0.75 at 4.36 m/s three times out of four, and at 5.45
  // and 7.63 m/s; at 2.83 and 3.49 m/s it played nothing.
  it('takes no default sound when either object set one', async () => {
    const a = await object({ sound: `"${S}",1` }), b = await object({})
    a.collide(b, 4.36)
    expect([heard(a), heard(b)]).toEqual([[`${S}@0.75`], []])
  })

  // In-world, at 4.36 m/s: a box that never called, onto a box whose root had set "",
  // played nothing (twice). A two-prim box whose child alone had set "", onto a box that
  // never called, played the wood-on-wood sound at 1.633 from its root (twice).
  it('lets a root\'s "" silence the default sound, but not a child\'s', async () => {
    const a = await object({}), b = await object({ size: '2,2,0.5', sound: '"",1' })
    a.collide(b, 4.36)
    expect([heard(a), heard(b)]).toEqual([[], []])
    const c = await object({}, { size: '0.2,0.2,0.2', sound: '"",1' }), d = await object({ size: '2,2,0.5' })
    c.collide(d, 4.36)
    expect([heard(c), heard(d)]).toEqual([[`${WOOD_WOOD}@1.635`], []])
  })

  // In-world, onto land (a 0.5 m box that never called): SND_STONE_DIRT_02 at 1.63 at
  // 4.36 m/s, 2.038 at 5.45, 2.364 at 6.32, 2.608 at 6.97 and 2.853 at 7.63, from a wood
  // box and from a stone one alike. A 0.25 m cube played it at 1.019 at 5.45 m/s and 1.426
  // at 7.63; a 0.5 m box at 1.96 m/s played nothing. A box whose root set a sound at 1
  // played that sound at 0.75 at 4.36 and 7.63 m/s, and no dirt sound. A root sound at
  // volume 0 played nothing in 1 and 2 m drops; a two-prim box whose child alone set a
  // sound at 1 played it from the root at 0.75 in 1 and 2 m drops.
  describe('onto land', () => {
    it.each([[4.36, 0.5, 1.635], [5.45, 0.5, 2.044], [7.63, 0.5, 2.861], [5.45, 0.25, 1.022], [7.63, 0.25, 1.431]])(
      'plays the dirt sound at %s m/s for a %s m box', async (speed, size, gain) => {
        const box = await object({ size: `${size},${size},${size}` })
        box.collideWithLand(speed)
        expect(heard(box)).toEqual([`${DIRT}@${gain}`])
      })

    it('plays the dirt sound whatever the material', async () => {
      const box = await object({ material: 0 })
      box.collideWithLand(7.63)
      expect(heard(box)).toEqual([`${DIRT}@2.861`])
    })

    it('plays nothing below the threshold', async () => {
      const box = await object({})
      box.collideWithLand(1.96)
      expect(heard(box)).toEqual([])
    })

    it('plays a set sound instead, at 0.75 times its volume', async () => {
      const box = await object({ sound: `"${S}",1` })
      box.collideWithLand(4.36)
      expect(heard(box)).toEqual([`${S}@0.75`])
      for (const sound of ['"",1', `"${S}",0`]) {
        const quiet = await object({ sound })
        quiet.collideWithLand(4.36)
        expect(heard(quiet)).toEqual([])
      }
      const linked = await object({}, { size: '0.2,0.2,0.2', sound: `"${S}",1` })
      linked.collideWithLand(4.36)
      expect(linked.prims[0]!.sound.triggers.map(t => `${t.sound}@${t.volume}`)).toEqual([`${S}@0.75`])
    })
  })
})

// https://wiki.secondlife.com/wiki/LlTriggerSound
//
// In-world (Aditi, SLua Tideland, 2026-11-23): in a two-prim object whose root had set
// a sound, a drop played that sound with the root as the object, no parent, at the
// root's position, though the child sat higher. llTriggerSound in the child was heard
// from the child, with the root as its parent, at the child's position; llPlaySound in
// the child was attached to the child.
describe('which prim a sound names', () => {
  const S = 'ed124764-705d-d497-167a-182cd9fa2e6c'
  it('plays a linkset\'s collision sound from its root and a child\'s triggered sound from the child', async () => {
    const { linkset, scripts } = await loadLinkset({ prims: [
      { scripts: [{ name: 'root', source: { source: `default{state_entry(){llCollisionSound("${S}",1);}}` } }] },
      { scripts: [{ name: 'child', source: { source: `default{state_entry(){llSetPos(<0,0,0.3>);}touch_start(integer n){llTriggerSound("${S}",0.3);llPlaySound("${S}",0.5);}}` } }] },
    ] })
    for (const s of Object.values(scripts)) s.start()
    const { linkset: floor } = await loadLinkset({ prims: [{}] })
    linkset.collide(floor, 4.36)
    const [root, child] = linkset.prims
    expect(root!.sound.triggers).toEqual([{ sound: S, volume: 0.75, position: root!.regionPosition() }])
    scripts.child!.fire('touch_start', { num_detected: 1 })
    linkset.advanceTime(100)
    expect(child!.sound.triggers).toEqual([{ sound: S, volume: Math.fround(0.3), position: child!.regionPosition() }])
    expect(child!.sound.current).toMatchObject({ sound: S, volume: 0.5 })
    expect(root!.sound.triggers).toHaveLength(1)
  })
})
