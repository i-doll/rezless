import { it, expect } from 'vitest'
import { loadLinkset, InventoryType, makeInventoryItem } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlParticleSystem: one emitter per prim;
// a new call replaces it and an empty rules list shuts it off.
it('records particle rules on the prim and clears them with an empty list', async () => {
  const { prims, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 'p', source: { source: `
    default {
      state_entry() { llParticleSystem([PSYS_SRC_PATTERN, PSYS_SRC_PATTERN_EXPLODE, PSYS_PART_START_COLOR, <1,0,0>]); }
      touch_start(integer n) { llParticleSystem([]); }
    }` } }] }] })
  scripts.p!.start()
  expect(prims[0]).toHaveProperty('particles', { rules: [9, 2, 1, { x: 1, y: 0, z: 0 }], texture: NULL })
  scripts.p!.fire('touch_start', { total_number: 1 })
  expect(prims[0]).toHaveProperty('particles', null)
})

// https://wiki.secondlife.com/wiki/LlParticleSystem: calls replace the emitter,
// rather than updating only the rules named by the new list.
it('replaces the previous rules instead of merging them', async () => {
  const { prims, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 'p', source: { source: `
    default { state_entry() {
      llParticleSystem([PSYS_SRC_PATTERN,2,PSYS_PART_START_COLOR,<1,0,0>]);
      llParticleSystem([PSYS_SRC_PATTERN,1]);
    } }` } }] }] })
  scripts.p!.start()
  expect(prims[0]).toHaveProperty('particles', { rules: [9, 1], texture: NULL })
})


const NULL = '00000000-0000-0000-0000-000000000000'
const TEXTURE = '619750b7-0334-13dc-e8f7-61f2aa2191a2'
const source = (body: string, name = 'p') => ({ name, source: { source: `default { state_entry() { ${body} } }` } })
async function run(rules: string) {
  const loaded = await loadLinkset({ prims: [{ scripts: [source(`llParticleSystem([9,2]); llParticleSystem(${rules});`)] }] })
  loaded.scripts.p!.start()
  expect(loaded.scripts.p!.chat).toEqual([])
  return loaded
}

// In-world: validation.lsl and fresh-*.lsl, Mono, Aditi / SLua
// Tideland, 2026-10-31. Unknown ids, noninteger ids and trailing unpaired rules
// are silent. Green rules + unknown / truncated tail still rendered green.
// These are requested rules, so ignored entries remain inspectable in the record.
it.each([
  ['[999,1]', [999, 1]], ['[-1,ZERO_ROTATION]', [-1, { x: 0, y: 0, z: 0, s: 1 }]],
  ['[9,2,999,1,15,3]', [9, 2, 999, 1, 15, 3]],
  ['[9]', [9]], ['[9,2,1]', [9, 2, 1]],
  ['[9.0,2]', [9, 2]], ['["9",2]', ['9', 2]],
  ['[ZERO_VECTOR,2]', [{ x: 0, y: 0, z: 0 }, 2]],
])('records the silent request %s', async (rules, want) => {
  const { prims } = await run(rules)
  expect(prims[0]).toHaveProperty('particles', { rules: want, texture: NULL })
})

// In-world: a known missing-sound control reached the DEBUG_CHANNEL listener.
// None of the particle validation cases emitted errors. Fresh prims with a
// red emitter followed by green + wrong color/count/flags stopped emitting;
// fresh green + unknown/truncated rules kept emitting. Integer alpha worked.
it.each([
  '[0,1.0]', '[9,2.0]', '[15,3.0]', '[24,7.0]', '[25,9.0]',
  '[1,"red"]', '[3,1]', '[5,ZERO_ROTATION]', '[6,1]', '[8,1]', '[21,"x"]',
  '[2,"0.5"]', '[4,ZERO_VECTOR]', '[7,"2"]', '[12,1]', '[20,1]',
  '[9,2,1,"bad",15,3]',
])('silently clears the whole emitter for wrong value types in %s', async rules => {
  const { prims } = await run(rules)
  expect(prims[0]).toHaveProperty('particles', null)
})

// In-world: bounds cases for all numeric rules produced no DEBUG_CHANNEL errors.
// Snapshots confirmed alpha -99 invisible / 99 opaque and scale 99 identical
// to scale 4. The recorder retains requested numbers, without simulating the
// viewer's clamping, quantization, particle lifetime or motion.
it.each([2,4,7,10,11,13,16,17,18,19,22,23,26,27])('retains numeric requests for rule %s', async rule => {
  const { prims } = await run(`[${rule},-99.0,${rule},999999.0]`)
  expect(prims[0]).toHaveProperty('particles.rules', [rule, -99, rule, 999999])
})
it.each([0,9,15,24,25])('accepts out-of-range integer requests for rule %s', async rule => {
  const { prims } = await run(`[${rule},-2,${rule},999999]`)
  expect(prims[0]).toHaveProperty('particles.rules', [rule, -2, rule, 999999])
})
it.each([1,3,5,6,8,21])('records vector rule %s without inventing effective bounds', async rule => {
  const { prims } = await run(`[${rule},<2,-1,999>]`)
  expect(prims[0]).toHaveProperty('particles.rules', [rule, { x: 2, y: -1, z: 999 }])
})
it('accepts integer values for float rules and arbitrary target key strings', async () => {
  const { prims } = await run('[2,1,20,"badkey",20,(key)"00000000-0000-0000-0000-000000000001"]')
  expect(prims[0]).toHaveProperty('particles.rules', [2, 1, 20, 'badkey', 20,'00000000-0000-0000-0000-000000000001'])
})

// In-world: root-only full-permission particle160Tex resolved to the sculpt
// texture 619750b7-0334-13dc-e8f7-61f2aa2191a2 on the root. LINK_SET children
// showed the default particle ball. Uppercase, missing, empty, NULL_KEY and
// wrong inventory types silently used the default. texture-visual.lsl, Aditi
// / SLua Tideland, 2026-10-31. UUID and key-typed UUID bypassed inventory.
it.each([0, 1])('resolves texture names in each target inventory from caller %s', async caller => {
  const { prims, scripts } = await loadLinkset({ prims: [
    { inventory: [makeInventoryItem({ name: 'particle160Tex', type: InventoryType.TEXTURE, key: TEXTURE })], ...(caller === 0 ? { scripts: [source('llLinkParticleSystem(LINK_SET,[12,"particle160Tex"]);')] } : {}) },
    { ...(caller === 1 ? { scripts: [source('llLinkParticleSystem(LINK_SET,[12,"particle160Tex"]);')] } : {}) },
  ] })
  scripts.p!.start()
  expect(scripts.p!.chat).toEqual([])
  expect(prims[0]).toHaveProperty('particles', { rules: [12, 'particle160Tex'], texture: TEXTURE })
  expect(prims[1]).toHaveProperty('particles.texture', NULL)
})
it.each(['missing160', '', NULL, 'p', 'PARTICLE160TEX'])('silently falls back for texture %j', async texture => {
  const { prims } = await run(`[12,"${texture}"]`)
  expect(prims[0]).toHaveProperty('particles.texture', NULL)
})
it.each([`"${TEXTURE.toUpperCase()}"`, `(key)"${TEXTURE}"`])('accepts texture UUID %s', async texture => {
  const { prims } = await run(`[12,${texture}]`)
  expect(prims[0]).toHaveProperty('particles.texture', TEXTURE)
})
it.each(['12.0', '"12"'])('skips noninteger texture rule id %s', async rule => {
  const { prims } = await run(`[12,"${TEXTURE}",${rule},"missing160"]`)
  expect(prims[0]).toHaveProperty('particles.texture', TEXTURE)
})
it('uses the last texture request', async () => {
  const { prims } = await run(`[12,"${TEXTURE}",12,""]`)
  expect(prims[0]).toHaveProperty('particles.texture', NULL)
})

it('resets an omitted texture from a non-default texture', async () => {
  const { prims, scripts } = await loadLinkset({ prims: [{ scripts: [{
    name: 'p', source: { source: `default {
      state_entry() { llParticleSystem([12,"${TEXTURE}"]); }
      touch_start(integer n) { llParticleSystem([9,2]); }
    }` },
  }] }] })
  scripts.p!.start()
  expect(prims[0]).toHaveProperty('particles.texture', TEXTURE)
  scripts.p!.fire('touch_start', { total_number: 1 })
  expect(prims[0]).toHaveProperty('particles', { rules: [9, 2], texture: NULL })
})

// In-world: root/child snapshots and gated link probes, plus fresh lone prims
// with long-lived particles. Mono, Aditi / SLua Tideland, 2026-10-31.
// Root link 0 is ignored; a child's link 0 addresses root. Invalid negative
// selector -5 picks the first other prim. Positive missing targets do nothing.
it.each([0, 1])('applies every link selector from caller %s', async caller => {
  const selections: [number, number[]][] = [
    [-1, [0, 1, 2]], [-2, [0, 1, 2].filter(i => i !== caller)],
    [-3, [1, 2]], [-4, [caller]], [0, caller ? [0] : []],
    [1, [0]], [2, [1]], [3, [2]], [99, []], [-5, [caller ? 0 : 1]],
  ]
  for (const [target, want] of selections) {
    const { prims, scripts } = await loadLinkset({
      prims: [0, 1, 2].map(i => i === caller
        ? { scripts: [source(`llLinkParticleSystem(${target},[9,2]);`)] } : {}),
    })
    scripts.p!.start()
    expect(scripts.p!.chat).toEqual([])
    prims.forEach((prim, i) => expect(prim).toHaveProperty('particles',
      want.includes(i) ? { rules: [9, 2], texture: NULL } : null))
  }
})

it.each([
  [-1, true], [-2, false], [-3, false], [-4, true], [0, true],
  [1, false], [2, false], [-5, false], [99, false],
])('targets a lone prim with %s', async (target, want) => {
  const { prims, scripts } = await loadLinkset({
    prims: [{ scripts: [source(`llLinkParticleSystem(${target},[9,2]);`)] }],
  })
  scripts.p!.start()
  expect(prims[0]).toHaveProperty('particles', want ? { rules: [9, 2], texture: NULL } : null)
})

it('clears only selected targets, including a rejected list on LINK_SET', async () => {
  const { prims, scripts } = await loadLinkset({ prims: [{ scripts: [{
    name: 'p', source: { source: `default {
      state_entry() { llLinkParticleSystem(LINK_SET,[9,2]); llLinkParticleSystem(2,[]); }
      touch_start(integer n) { llLinkParticleSystem(LINK_SET,[9,2,1,"bad"]); }
    }` },
  }] }, {}] })
  scripts.p!.start()
  expect(prims[0]).toHaveProperty('particles.rules', [9, 2])
  expect(prims[1]).toHaveProperty('particles', null)
  scripts.p!.fire('touch_start', { total_number: 1 })
  expect(prims.every(p => p.particles === null)).toBe(true)
})

it('shares state between scripts and retains it through reset without aliasing requests', async () => {
  const { prims, scripts } = await loadLinkset({ prims: [{ scripts: [
    { name: 'p', source: { source: `list r=[9,2]; default {
      touch_start(integer n) { llLinkParticleSystem(LINK_SET,r); r=[9,1]; }
    }` } },
    source('llParticleSystem([9,1]);', 'other'),
  ] }, {}] })
  expect(prims[0]).toHaveProperty('particles', null)
  scripts.p!.start()
  scripts.p!.fire('touch_start', { total_number: 1 })
  scripts.p!.reset()
  expect(prims[0]).toHaveProperty('particles.rules', [9, 2])
  expect(prims[1]).toHaveProperty('particles.rules', [9, 2])
  expect(prims[0]!.particles).not.toBe(prims[1]!.particles)
  expect(prims[0]!.particles!.rules).not.toBe(prims[1]!.particles!.rules)
  scripts.other!.start()
  expect(prims[0]).toHaveProperty('particles.rules', [9, 1])
  expect(prims[1]).toHaveProperty('particles.rules', [9, 2])
})
