import { describe, it, expect } from 'vitest'
import { loadLinkset, loadScript } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlSetTouchText
// https://wiki.secondlife.com/wiki/LlSetSitText
// https://wiki.secondlife.com/wiki/LlSetPayPrice
// In-world: SLua Tideland on Aditi, Mono (2026-10-31). A touched probe timed each call with
// llResetTime/llGetTime and made bad llSetPayPrice calls 6 s apart, while a second prim listened
// on DEBUG_CHANNEL. A divide by zero in the same probe reached that listener as "Math Error".
// In-world (Aditi, SLua Tideland, 2026-11-23, Mono, Firestorm viewer): a two-prim
// linkset set its texts and pay prices on command, and the viewer read back the touch and sit text
// the region sent for each prim, the labels its pie menu showed and the prices its Pay dialog got.
// The menu and the Pay dialog show the root prim's settings whichever prim is clicked; a child's
// own settings show once it is unlinked. The VM stores each prim's settings as the region keeps them.

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
  // In-world: llSetTouchText("ABCDEFGHIJKLMNOP") -> the region sent "ABCDEFGHI" and the menu showed it;
  // llSetSitText("0123456789abcdef") -> "012345678".
  it('keep the first 9 bytes of longer text', async () => {
    const s = await run('state_entry() { string big = "x"; integer i; for (i = 0; i < 9; ++i) big += big; llSetTouchText(big); llSetSitText(big); }')
    expect(s.touchText).toBe('x'.repeat(9))
    expect(s.sitText).toBe('x'.repeat(9))
  })

  // In-world: llSetTouchText of twelve "é" (24 bytes) -> the region sent and the menu showed "éééé";
  // llSetSitText("abcdefghé") -> "abcdefgh"; llSetTouchText("abcdefghié") -> "abcdefghi".
  it('count the 9 bytes in UTF-8 and do not split a character', async () => {
    const s = await run('state_entry() { llSetTouchText("éééééééééééé"); llSetSitText("abcdefghé"); }')
    expect(s.touchText).toBe('éééé')
    expect(s.sitText).toBe('abcdefgh')
  })

  // In-world: llSetTouchText("") and llSetSitText("") after setting them -> the region sent "" and
  // the menu went back to "Touch" and "Sit Here".
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

  // In-world: a child prim's llSetTouchText("Child") and llSetSitText("Perch") -> the region sent them
  // for the child, the root's texts stayed, and right-clicking either prim showed the root's labels;
  // after unlinking, the child's menu showed "Child" and "Perch".
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

  // In-world: llSetPayPrice(10, [1, 5, 10, 20]) -> llGetTime() 0.000, no DEBUG_CHANNEL error; the
  // Pay dialog got price 10 and buttons [1, 5, 10, 20].
  it('stores the price and the quick pay buttons', async () => {
    const s = await run('state_entry() { llResetTime(); llSetPayPrice(10, [1, 5, 10, 20]); out = [llGetTime()]; }')
    expect(s.payPrice).toEqual({ price: 10, buttons: [1, 5, 10, 20] })
    expect(s.host.payPrice).toEqual({ price: 10, buttons: [1, 5, 10, 20] })
    expect(s.global('out')).toEqual([0])
  })

  // In-world: llSetPayPrice(PAY_HIDE, [PAY_HIDE, PAY_DEFAULT, 5, PAY_HIDE]) -> price -1, buttons
  // [-1, 5, 5, -1]; (PAY_DEFAULT, [PAY_DEFAULT x4]) -> price -2, buttons [1, 5, 10, 20].
  it('keeps PAY_HIDE and gives PAY_DEFAULT buttons their default amount', async () => {
    const s = await run('state_entry() { llSetPayPrice(PAY_HIDE, [150, PAY_HIDE, PAY_DEFAULT, PAY_HIDE]); }')
    expect(s.payPrice).toEqual({ price: -1, buttons: [150, -1, 10, -1] })
    const d = await run('state_entry() { llSetPayPrice(PAY_DEFAULT, [PAY_DEFAULT, PAY_DEFAULT, PAY_DEFAULT, PAY_DEFAULT]); }')
    expect(d.payPrice).toEqual({ price: -2, buttons: [1, 5, 10, 20] })
  })

  it('replaces the previous setting', async () => {
    const s = await run('state_entry() { llSetPayPrice(5, [1, 2, 3, 4]); llSetPayPrice(0, [PAY_HIDE, PAY_HIDE, PAY_HIDE, PAY_HIDE]); }')
    expect(s.payPrice).toEqual({ price: 0, buttons: [-1, -1, -1, -1] })
  })

  // In-world: llSetPayPrice(5, [1]), (5, [1, 2, 3, 4, 5, 6]), (5, ["a", 1.5, <1,1,1>, "7"]),
  // (-7, [-9, 0, PAY_DEFAULT, PAY_HIDE]) and (PAY_HIDE, []) -> no DEBUG_CHANNEL error, the script kept running.
  // In-world, what the Pay dialog got: (25, [7]) -> [7, -1, -1, -1]; (25, [1, 2, 3, 4, 5, 6]) -> [1, 2, 3, 4];
  // (25, ["a", 1.5, <1,1,1>, "7"]) -> [-1, -1, -1, -1]; (25, [2.9, -1.0, "12", 3]) -> [-1, -1, -1, 3];
  // (25, [(key)"8", 6, 6, 6]) -> [-1, 6, 6, 6]; (25, [3.0, 4, 5, 6]) -> [-1, 4, 5, 6];
  // (25, [7.0, -2.0, 0.0, 1]) -> [-1, -1, -1, 1]; (-7, [-9, 0, PAY_DEFAULT, PAY_HIDE]) -> price -7,
  // [-9, 0, 10, -1]; (0, [0, 0, 0, 0]) -> [0, 0, 0, 0]; (PAY_HIDE, []) after (25, [1, 2, 3, 4]) -> [1, 5, 10, 20].
  it.each([
    ['5, [1]', { price: 5, buttons: [1, -1, -1, -1] }],
    ['5, [1, 2, 3, 4, 5, 6]', { price: 5, buttons: [1, 2, 3, 4] }],
    ['5, ["a", 1.5, <1,1,1>, "7"]', { price: 5, buttons: [-1, -1, -1, -1] }],
    ['5, [2.9, -1.0, "12", 3]', { price: 5, buttons: [-1, -1, -1, 3] }],
    ['5, [(key)"8", 6, 6, 6]', { price: 5, buttons: [-1, 6, 6, 6] }],
    ['5, [3.0, 4, 5, 6]', { price: 5, buttons: [-1, 4, 5, 6] }],
    ['5, [7.0, -2.0, 0.0, 1]', { price: 5, buttons: [-1, -1, -1, 1] }],
    ['-7, [-9, 0, PAY_DEFAULT, PAY_HIDE]', { price: -7, buttons: [-9, 0, 10, -1] }],
    ['0, [0, 0, 0, 0]', { price: 0, buttons: [0, 0, 0, 0] }],
    ['PAY_HIDE, []', { price: -1, buttons: [1, 5, 10, 20] }],
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

  // In-world: an SLua script's ll.SetPayPrice(25, {1, 5, 10.5, 20}) -> [1, 5, -1, 20];
  // (25, {PAY_DEFAULT, 2, 3, PAY_HIDE}) -> [1, 2, 3, -1]; (25, {}) -> [1, 5, 10, 20].
  it.each([
    ['{1, 5, 10.5, 20}', [1, 5, -1, 20]],
    ['{PAY_DEFAULT, 2, 3, PAY_HIDE}', [1, 2, 3, -1]],
    ['{}', [1, 5, 10, 20]],
  ])('keeps whole Lua numbers from SLua ll.SetPayPrice(25, %s)', async (buttons, expected) => {
    const s = await loadScript({ language: 'slua', source: `ll.SetPayPrice(25, ${buttons})` })
    s.start()
    expect(s.payPrice).toEqual({ price: 25, buttons: expected })
  })

  // In-world: a child prim's llSetPayPrice(7, [7, 8, 9, 10]) -> the Pay dialog for either prim kept the
  // root's price 10 and [1, 5, 10, 20]; after unlinking, the child's Pay dialog got 7 and [7, 8, 9, 10].
  it('belongs to the prim the calling script is in', async () => {
    const { scripts, linkset } = await loadLinkset({
      prims: [
        { scripts: [{ name: 'root', source: { source: 'default { state_entry() { llSetPayPrice(10, [1, 5, 10, 20]); } }' } }] },
        { scripts: [{ name: 'child', source: { source: 'default { state_entry() { llSetPayPrice(7, [7, 8, 9, 10]); } }' } }] },
      ],
    })
    scripts.root!.start()
    scripts.child!.start()
    expect(linkset.prims[0]!.payPrice).toEqual({ price: 10, buttons: [1, 5, 10, 20] })
    expect(linkset.prims[1]!.payPrice).toEqual({ price: 7, buttons: [7, 8, 9, 10] })
  })
})
