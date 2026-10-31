import { describe, it, expect } from 'vitest'
import { loadLinkset, loadScript } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlSetTouchText
// https://wiki.secondlife.com/wiki/LlSetSitText
// https://wiki.secondlife.com/wiki/LlSetPayPrice
// In-world: SLua Tideland on Aditi, Mono (2026-10-31). A touched probe timed each call with
// llResetTime/llGetTime and made bad llSetPayPrice calls 6 s apart, while a second prim listened
// on DEBUG_CHANNEL. A divide by zero in the same probe reached that listener as "Math Error".
// The viewer tools can't read the pie menu or the pay dialog, so what the viewer shows (the
// 9-character limit, hidden buttons) isn't measured. The VM stores what the script passed.

async function run(body: string) {
  const s = await loadScript({ source: `list out; default { ${body} }` })
  s.start()
  return s
}

describe('llSetTouchText and llSetSitText', () => {
  it('read "" before a script sets them', async () => {
    const s = await run('state_entry() { }')
    expect(s.touchText).toBe('')
    expect(s.sitText).toBe('')
  })

  it('store the text on the prim', async () => {
    const s = await run('state_entry() { llSetTouchText("Touch me!"); llSetSitText("Be Seated"); }')
    expect(s.touchText).toBe('Touch me!')
    expect(s.sitText).toBe('Be Seated')
    expect(s.host.touchText).toBe('Touch me!')
    expect(s.host.sitText).toBe('Be Seated')
  })

  // In-world: llSetTouchText and llSetSitText with a 512-character string -> llGetTime() 0.000, no DEBUG_CHANNEL error.
  it('keep text longer than the 9 characters the viewer shows', async () => {
    const s = await run('state_entry() { string big = "x"; integer i; for (i = 0; i < 9; ++i) big += big; llSetTouchText(big); llSetSitText(big); }')
    expect(s.touchText).toBe('x'.repeat(512))
    expect(s.sitText).toBe('x'.repeat(512))
  })

  it('restore the default with an empty string', async () => {
    const s = await run('state_entry() { llSetTouchText("Poke"); llSetSitText("Perch"); llSetTouchText(""); llSetSitText(""); }')
    expect(s.touchText).toBe('')
    expect(s.sitText).toBe('')
  })

  it('stay on the prim after the script resets', async () => {
    const s = await run(`state_entry() {
      if (llLinksetDataRead("reset") == "") {
        llLinksetDataWrite("reset", "1"); llSetTouchText("Poke"); llSetSitText("Perch"); llResetScript();
      }
    }`)
    expect(s.touchText).toBe('Poke')
    expect(s.sitText).toBe('Perch')
  })

  it('belong to the prim the calling script is in', async () => {
    const { scripts, linkset } = await loadLinkset({
      prims: [
        { scripts: [{ name: 'root', source: { source: 'default { state_entry() { llSetTouchText("Root"); } }' } }] },
        { scripts: [{ name: 'child', source: { source: 'default { state_entry() { llSetSitText("Child"); } }' } }] },
      ],
    })
    scripts.root!.start()
    scripts.child!.start()
    expect(linkset.prims[0]!.touchText).toBe('Root')
    expect(linkset.prims[0]!.sitText).toBe('')
    expect(linkset.prims[1]!.touchText).toBe('')
    expect(linkset.prims[1]!.sitText).toBe('Child')
  })

  // In-world: llSetTouchText -> llGetTime() 0.044 (first call in the event), llSetSitText -> 0.000.
  it('take no time', async () => {
    const s = await run('state_entry() { llResetTime(); llSetTouchText("a"); llSetSitText("b"); out = [llGetTime()]; }')
    expect(s.global('out')).toEqual([0])
  })
})

describe('llSetPayPrice', () => {
  it('reads null before a script sets it', async () => {
    const s = await run('state_entry() { }')
    expect(s.payPrice).toBeNull()
  })

  // In-world: llSetPayPrice(10, [1, 5, 10, 20]) -> llGetTime() 0.000, no DEBUG_CHANNEL error.
  it('stores the price and the quick pay buttons', async () => {
    const s = await run('state_entry() { llResetTime(); llSetPayPrice(10, [1, 5, 10, 20]); out = [llGetTime()]; }')
    expect(s.payPrice).toEqual({ price: 10, buttons: [1, 5, 10, 20] })
    expect(s.host.payPrice).toEqual({ price: 10, buttons: [1, 5, 10, 20] })
    expect(s.global('out')).toEqual([0])
  })

  it('stores PAY_HIDE and PAY_DEFAULT as their values', async () => {
    const s = await run('state_entry() { llSetPayPrice(PAY_HIDE, [150, PAY_HIDE, PAY_DEFAULT, PAY_HIDE]); }')
    expect(s.payPrice).toEqual({ price: -1, buttons: [150, -1, -2, -1] })
  })

  it('replaces the previous setting', async () => {
    const s = await run('state_entry() { llSetPayPrice(5, [1, 2, 3, 4]); llSetPayPrice(0, [PAY_HIDE, PAY_HIDE, PAY_HIDE, PAY_HIDE]); }')
    expect(s.payPrice).toEqual({ price: 0, buttons: [-1, -1, -1, -1] })
  })

  // In-world: llSetPayPrice(5, [1]), (5, [1, 2, 3, 4, 5, 6]), (5, ["a", 1.5, <1,1,1>, "7"]),
  // (-7, [-9, 0, PAY_DEFAULT, PAY_HIDE]) and (PAY_HIDE, []) -> no DEBUG_CHANNEL error, the script kept running.
  it.each([
    ['5, [1]', { price: 5, buttons: [1] }],
    ['5, [1, 2, 3, 4, 5, 6]', { price: 5, buttons: [1, 2, 3, 4, 5, 6] }],
    ['5, ["a", 1.5, <1,1,1>, "7"]', { price: 5, buttons: ['a', 1.5, { x: 1, y: 1, z: 1 }, '7'] }],
    ['-7, [-9, 0, PAY_DEFAULT, PAY_HIDE]', { price: -7, buttons: [-9, 0, -2, -1] }],
    ['PAY_HIDE, []', { price: -1, buttons: [] }],
  ])('accepts llSetPayPrice(%s) without an error', async (args, expected) => {
    const s = await run(`state_entry() { llSetPayPrice(${args}); out = ["after"]; }`)
    expect(s.payPrice).toEqual(expected)
    expect(s.global('out')).toEqual(['after'])
  })

  it('stays on the prim after the script resets', async () => {
    const s = await run(`state_entry() {
      if (llLinksetDataRead("reset") == "") { llLinksetDataWrite("reset", "1"); llSetPayPrice(25, [25, PAY_HIDE, PAY_HIDE, PAY_HIDE]); llResetScript(); }
    }`)
    expect(s.payPrice).toEqual({ price: 25, buttons: [25, -1, -1, -1] })
  })
})
