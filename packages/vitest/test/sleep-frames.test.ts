import { describe, expect, it } from 'vitest'
import { loadLinkset } from '../src/index.js'

const SIM_FRAME_MS = 1000 / 45

type Language = 'lsl' | 'slua'

/**
 * Run `body` in one script's state_entry, with `rec(name)` logging `<name>@<llGetTime>` and
 * llSetText mocked to keep it busy for as many frames as its third argument. Read each entry as
 * `<name>=<frames>`, in frames after the entry before it.
 */
async function sleeps(language: Language, body: string) {
  const source = language === 'lsl'
    ? `list L;
      rec(string e) { L += e + "@" + (string)llGetTime(); }
      default { state_entry() { rec("start"); ${body} } }`
    : `L = {}
      local function rec(e) table.insert(L, e .. "@" .. tostring(ll.GetTime())) end
      rec("start") ${body}`
  const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 's', language, source: { source } }] }] })
  const s = scripts['s']!
  s.mock('llSetText', (ctx, args) => { ctx.busy(Number(args[2]) * SIM_FRAME_MS); return undefined })
  linkset.startAll()
  linkset.advanceTime(10_000)
  const log = JSON.parse(JSON.stringify(s.global('L'))) as string[]
  const at = (e: string) => Number(e.split('@')[1])
  return log.slice(1).map((e, i) => e.split('@')[0]! + '=' + Number(((at(e) - at(log[i]!)) * 45).toFixed(3)))
}

const sleepEach = (language: Language, lengths: readonly number[]) => lengths.map((s) =>
  language === 'lsl' ? `llSleep(${s}); rec("${s}");` : `ll.Sleep(${s}) rec("${s}")`).join(' ')

// In-world (Aditi, SLua Tideland, Firestorm, 2026-11-25): an LSL (Mono) and an SLua script in one
// prim each ran sleeps back to back in a listen handler, logging llGetTimestamp before and after
// each. The timestamps moved in whole simulator frames (1/45 s). Every sleep woke on the
// first frame on or after it fell due, counting from the frame of the call, in both languages.
describe('a sleep wakes on a simulator frame', () => {
  // In-world: 0.001, 0.01 and 0.02 s woke 1 frame after the call; 0.0223, 0.03 and 0.04 s 2;
  // 0.05 s 3; 0.1 s 5; 0.12 s 6; 0.25 s 12; 0.3 s 14; 0.5 s 23; 0.65 s 30 (two runs in each
  // language; the very first sleep of one LSL run took 3 frames).
  it.each(['lsl', 'slua'] as const)('wakes on the first frame on or after the due time in %s', async (language) => {
    const lengths = [0.001, 0.01, 0.02, 0.0223, 0.03, 0.04, 0.05, 0.1, 0.12, 0.25, 0.3, 0.5, 0.65]
    expect(await sleeps(language, sleepEach(language, lengths))).toEqual(
      ['0.001=1', '0.01=1', '0.02=1', '0.0223=2', '0.03=2', '0.04=2', '0.05=3', '0.1=5', '0.12=6', '0.25=12', '0.3=14', '0.5=23', '0.65=30'])
  })

  // In-world: 0.195, 0.197, 0.198, 0.199 and 0.1995 s woke on frame 9, 0.2005 and 0.201 s on
  // frame 10, and 0.995, 0.999 and 0.9995 s on frame 45 (one run in each language).
  it.each(['lsl', 'slua'] as const)('wakes a sleep half a millisecond off a frame on the frame past it in %s', async (language) => {
    const lengths = [0.195, 0.1995, 0.2005, 0.201, 0.995, 0.9995]
    expect(await sleeps(language, sleepEach(language, lengths))).toEqual(
      ['0.195=9', '0.1995=9', '0.2005=10', '0.201=10', '0.995=45', '0.9995=45'])
  })

  // In-world: sleeps of a whole number of frames woke on that frame or the next, with no pattern
  // across lengths, runs or languages: 0.2 s on frame 9 in 6 of 12 sleeps and 10 in the others,
  // 0.4 s on 18 in 2 of 8, 0.6 s on 27 in 1 of 4, 1.0 s on 45 in 5 of 8, 2.0 s on 90 in 3 of 4,
  // 3.0 and 5.0 s on 135 and 225 in LSL. So did sleeps within 0.1 ms of a frame: 0.0222 s on 1 or
  // 2, 0.0444 and 0.0445 s on 2 or 3. rezless wakes them on the frame, as it runs timer ticks due
  // exactly on a frame.
  it.each(['lsl', 'slua'] as const)('wakes a whole number of frames on that frame in %s', async (language) => {
    expect(await sleeps(language, sleepEach(language, [0.2, 0.4, 1.0, 2.0, 5.0]))).toEqual(['0.2=9', '0.4=18', '1=45', '2=90', '5=225'])
  })

  // In-world: a handler that spun into its next frame and then slept 0.1 s woke 5 frames after
  // the frame the spin ended in (10 runs over both languages), and with 0.2 s 9 frames after it in
  // 8 of 10 runs and 10 in the other two.
  it.each(['lsl', 'slua'] as const)('counts the frames from the call, after a spin, in %s', async (language) => {
    const body = language === 'lsl'
      ? 'llSetText("", ZERO_VECTOR, 1); llSleep(0.1); rec("a"); llSetText("", ZERO_VECTOR, 1); llSleep(0.2); rec("b");'
      : 'll.SetText("", vector(0, 0, 0), 1) ll.Sleep(0.1) rec("a") ll.SetText("", vector(0, 0, 0), 1) ll.Sleep(0.2) rec("b")'
    expect(await sleeps(language, body)).toEqual(['a=6', 'b=10'])
  })

  // The same rule for a spin that ends part way through a frame: the sleep counts from the frame
  // grid of the handler, not from the end of the spin.
  it.each(['lsl', 'slua'] as const)('wakes on the handler\'s frames after a spin of part of a frame in %s', async (language) => {
    const body = language === 'lsl'
      ? 'llSetText("", ZERO_VECTOR, 0.35); llSleep(0.1); rec("a"); llSleep(0.1); rec("b");'
      : 'll.SetText("", vector(0, 0, 0), 0.35) ll.Sleep(0.1) rec("a") ll.Sleep(0.1) rec("b")'
    expect(await sleeps(language, body)).toEqual(['a=5', 'b=5'])
  })

  it('wakes a mock\'s sleep of a few microseconds on the next frame', async () => {
    const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 's', source: { source: `float t;
      default { state_entry() { llOwnerSay(""); t = llGetTime(); } }` } }] }] })
    scripts['s']!.mock('llOwnerSay', (ctx) => { ctx.sleep(0.005); return undefined })
    linkset.startAll()
    linkset.advanceTime(100)
    expect(scripts['s']!.global('t')).toBeCloseTo(SIM_FRAME_MS / 1000, 6)
  })
})

// In-world (same session): a function's forced delay woke on frames as a sleep does.
// llRequestAgentData (0.1 s) after 5 frames (3 runs), llXorBase64Strings (0.3 s) after 14 (1 run),
// llOffsetTexture (0.2 s) after 9 or 10 frames and llInstantMessage (2.0 s) after 90 or 91.
describe('a forced delay wakes on a simulator frame', () => {
  it('wakes after the frames of the delay in LSL', async () => {
    const body = 'llRequestAgentData(llGetOwner(), DATA_ONLINE); rec("rad"); llXorBase64Strings("QUJD", "QUJD"); rec("xor");' +
      ' llOffsetTexture(0, 0, ALL_SIDES); rec("off");'
    expect(await sleeps('lsl', body)).toEqual(['rad=5', 'xor=14', 'off=9'])
  })

  it('wakes after the frames of the delay in SLua', async () => {
    const body = 'll.RequestAgentData(ll.GetOwner(), DATA_ONLINE) rec("rad") ll.OffsetTexture(0, 0, ALL_SIDES) rec("off")'
    expect(await sleeps('slua', body)).toEqual(['rad=5', 'off=9'])
  })
})
