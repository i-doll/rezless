import { describe, expect, it } from 'vitest'
import { InventoryType, loadLinkset, makeInventoryItem } from '../src/index.js'

// Measured on the Aditi beta grid, SLua Tideland, 2026-11-23. A probe prim holding its script
// and a notecard named "note" timed each call with llGetTime before and after, 3 to 5 samples
// per call spaced 2.2 s apart, and a listener logged what each call said on DEBUG_CHANNEL.
// Times are the measured ones without the 0.02 s frame they sometimes gained. A call that
// fails to find a sound, texture, object or script by name, or finds an item of the wrong
// type, takes 1 s more than its usual delay. It takes the 1 s also when its error is
// dropped by the error flood cap (14 missing-sound and 12 missing-texture calls in a row).
const DEBUG_CHANNEL = 2147483647
const calls: [string, string, number, number][] = [
  // In-world: 1.000-1.022 s, and 2.000-2.022 s for llPreloadSound (its own 1 s plus 1 s).
  ['llPlaySound', 'llPlaySound("nope", 0.0)', 1, 1],
  ['llPlaySound, a notecard', 'llPlaySound("note", 0.0)', 1, 1],
  ['llPlaySoundSlave', 'llPlaySoundSlave("nope", 0.0)', 1, 1],
  ['llTriggerSound', 'llTriggerSound("nope", 0.0)', 1, 1],
  ['llTriggerSoundLimited', 'llTriggerSoundLimited("nope", 0.0, <1,1,1>, ZERO_VECTOR)', 1, 1],
  ['llLoopSound', 'llLoopSound("nope", 0.0)', 1, 1],
  ['llLoopSoundMaster', 'llLoopSoundMaster("nope", 0.0)', 1, 1],
  ['llLoopSoundSlave', 'llLoopSoundSlave("nope", 0.0)', 1, 1],
  ['llLinkPlaySound', 'llLinkPlaySound(LINK_THIS, "nope", 0.0, 0)', 1, 1],
  ['llPreloadSound', 'llPreloadSound("nope")', 2, 1],
  // In-world: 1.200-1.222 s, their 0.2 s delay plus 1 s.
  ['llSetTexture', 'llSetTexture("nope", 0)', 1.2, 1],
  ['llSetTexture, a notecard', 'llSetTexture("note", 0)', 1.2, 1],
  ['llSetLinkTexture', 'llSetLinkTexture(LINK_THIS, "nope", 0)', 1.2, 1],
  // In-world: 1.110-1.111 s, their 0.1 s delay plus 1 s, ending on the 50th frame.
  ['llRezObject', 'llRezObject("nope", ZERO_VECTOR, ZERO_VECTOR, ZERO_ROTATION, 0)', 50 / 45, 1],
  ['llRezAtRoot', 'llRezAtRoot("nope", ZERO_VECTOR, ZERO_VECTOR, ZERO_ROTATION, 0)', 50 / 45, 1],
  ['llRezObjectWithParams', 'llRezObjectWithParams("nope", [])', 50 / 45, 1],
  // In-world: 1.000-1.022 s for a missing script; a notecard's name was an error only for
  // llSetScriptState, and the other two took no time and said nothing.
  ['llSetScriptState', 'llSetScriptState("nope", TRUE)', 1, 1],
  ['llSetScriptState, a notecard', 'llSetScriptState("note", TRUE)', 1, 1],
  ['llResetOtherScript', 'llResetOtherScript("nope")', 1, 1],
  ['llResetOtherScript, a notecard', 'llResetOtherScript("note")', 0, 0],
  ['llGetScriptState', 'llGetScriptState("nope")', 1, 1],
  ['llGetScriptState, a notecard', 'llGetScriptState("note")', 0, 0],
  // In-world: these said their errors and took only their usual delay, a 0.1 s one ending on the 5th frame.
  ['llGetNotecardLine', 'llGetNotecardLine("nope", 0)', 5 / 45, 1],
  ['llGetNumberOfNotecardLines', 'llGetNumberOfNotecardLines("nope")', 5 / 45, 1],
  ['llGetNotecardLineSync', 'llGetNotecardLineSync("nope", 0)', 0, 1],
  ['llGiveInventory', 'llGiveInventory(llGetOwner(), "nope")', 0, 1],
  ['llGetInventoryPermMask', 'llGetInventoryPermMask("nope", MASK_OWNER)', 0, 1],
  ['llGetInventoryCreator', 'llGetInventoryCreator("nope")', 0, 1],
  ['llDialog', 'llDialog(llGetOwner(), "x", ["abcdefghijklmnopqrstuvwxyz0123"], -5)', 1, 1],
  ['llSetLinkMedia', 'llSetLinkMedia(LINK_THIS, 99, [PRIM_MEDIA_HOME_URL, "http://example.com"])', 0, 1],
  ['llNavigateTo', 'llNavigateTo(llGetPos(), [])', 0, 1],
  // In-world: a missing texture in a prim parameter list, or a missing collision sound, said
  // nothing and took only the usual delay.
  ['llSetPrimitiveParams', 'llSetPrimitiveParams([PRIM_TEXTURE, 0, "nope", <1,1,0>, ZERO_VECTOR, 0.0])', 0.2, 0],
  ['llSetLinkPrimitiveParams', 'llSetLinkPrimitiveParams(LINK_THIS, [PRIM_TEXTURE, 0, "nope", <1,1,0>, ZERO_VECTOR, 0.0])', 0.2, 0],
  ['llSetLinkPrimitiveParamsFast', 'llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_TEXTURE, 0, "nope", <1,1,0>, ZERO_VECTOR, 0.0])', 0, 0],
  ['llCollisionSound', 'llCollisionSound("nope", 0.0)', 0, 0],
]

async function time(call: string) {
  const source = `float took;
default { state_entry() { float t = llGetTime(); ${call}; took = llGetTime() - t; } }`
  const { scripts, linkset } = await loadLinkset({ prims: [{
    inventory: [makeInventoryItem({ name: 'note', type: InventoryType.NOTECARD })],
    scripts: [{ name: 's', source: { source } }],
  }] })
  scripts.s!.start()
  linkset.advanceTime(10_000)
  return { took: scripts.s!.global('took'), errors: scripts.s!.chat.filter(c => c.channel === DEBUG_CHANNEL).length }
}

describe('time taken by failing calls', () => {
  it.each(calls)('%s takes %s s', async (_name, call, seconds, errors) => {
    expect(await time(call)).toEqual({ took: expect.closeTo(seconds, 3), errors })
  })

  // In-world: 14 missing-sound calls in a row each took 1.000-1.022 s, the 9th to 14th dropped by the flood cap.
  it('takes the time when the error is dropped', async () => {
    const { took } = await time('integer i; for (i = 0; i < 14; ++i) llPlaySound("nope", 0.0)')
    expect(took).toBeCloseTo(14, 3)
  })
})
