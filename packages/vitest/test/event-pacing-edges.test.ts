import { describe, expect, it } from 'vitest'
import { loadLinkset } from '../src/index.js'

const SIM_FRAME_MS = 1000 / 45
const ALICE = { key: 'aaaaaaaa-0000-0000-0000-000000000000', name: 'alice' }
const BOB = { key: 'bbbbbbbb-0000-0000-0000-000000000000', name: 'bob' }

// Edges of the one-event-a-frame pacing (see event-pacing.test.ts for the measured rule).

const lm = (num = 0, str = '') => ({ sender_num: 1, num, str, id: '' })

describe('llResetOtherScript after a link message in one handler', () => {
  // In-world (script-lifecycle.test.ts): a link message sent just before llResetOtherScript in
  // the same handler never reached the reset script.
  it('resets the script before the message can run', async () => {
    const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [
      { name: 't', source: { source: 'default { link_message(integer s, integer n, string m, key k) { llOwnerSay("lm " + m); } }' } },
      { name: 'ctl', source: { source: `default { touch_start(integer n) {
        llMessageLinked(LINK_THIS, 1, "before", ""); llResetOtherScript("t"); } }` } },
    ] }] })
    linkset.startAll()
    linkset.advanceTime(1000)
    scripts['ctl']!.fire('touch_start', { num_detected: 1 })
    linkset.advanceTime(1000)
    expect(scripts['t']!.chat.map((c) => c.text)).toEqual([])
  })
})

describe('a timer next to a backlog of events that come every frame', () => {
  it('still ticks once two events wait', async () => {
    const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 's', source: { source: `
      integer ticks; integer heard;
      default { state_entry() { llSetTimerEvent(0.05); }
        link_message(integer s, integer n, string m, key k) { ++heard; } timer() { ++ticks; } }` } }] }] })
    const s = scripts['s']!
    linkset.startAll()
    linkset.advanceTime(10)
    linkset.clock.schedule(s, linkset.clock.now, 'link_message', lm())
    linkset.clock.schedule(s, linkset.clock.now, 'link_message', lm())
    for (let i = 0; i < 100; i++) {
      linkset.clock.schedule(s, linkset.clock.now, 'link_message', lm())
      linkset.advanceTime(SIM_FRAME_MS)
    }
    // A tick goes ahead of the messages that came up after it fell due, so it keeps coming.
    expect(Number(s.global('ticks'))).toBeGreaterThanOrEqual(8)
  })
})

describe('two avatars holding clicks under llMinEventDelay', () => {
  async function held(avatars: ReadonlyArray<{ key: string; name: string }>) {
    const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 's', source: { source: `list got;
      string who(integer n) { string w; integer i; for (i = 0; i < n; ++i) w += llGetSubString(llDetectedName(i), 0, 0); return w; }
      default { state_entry() { llMinEventDelay(1.0); }
        touch_start(integer n) { got += "S" + who(n); }
        touch(integer n) { got += "T" + who(n); }
        touch_end(integer n) { got += "E" + who(n); } }` } }] }] })
    linkset.startAll()
    linkset.advanceTime(2000)
    for (const avatar of avatars) {
      linkset.press(0, { avatar })
      linkset.advanceTime(200)
    }
    linkset.advanceTime(1400 - 200 * avatars.length)
    for (const avatar of avatars) linkset.release(avatar)
    linkset.advanceTime(3000)
    return JSON.parse(JSON.stringify(scripts['s']!.global('got'))) as string[]
  }

  // The touch that waits for the delay through the release runs after it, as with one avatar
  // (see touch-routing.test.ts): it lists the second avatar, and the release adds no touch of its own.
  it('lists the second avatar in the waiting touch, and adds no touch after the release', async () => {
    expect(await held([ALICE])).toEqual(['Sa', 'Ta', 'Ta', 'Ta', 'Ea'])
    expect(await held([ALICE, BOB])).toEqual(['Sa', 'Ta', 'Tab', 'Tab', 'Eab'])
  })
})

describe('LLTimers at fractions of a millisecond', () => {
  it.each([[1 / 3, 1], [1 / 45, 45]] as const)('runs a callback on every tick of a %s s timer', async (interval, callbacks) => {
    const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 's', language: 'slua', source: { source: `raw = 0 cbs = 0
      LLEvents:on("timer", function() raw += 1 end)
      LLEvents:on("touch_start", function()
        ${callbacks === 1 ? `LLTimers:once(${interval}, function() cbs += 1 end)` : `LLTimers:every(${interval}, function() cbs += 1 end)`}
      end)` } }] }] })
    const s = scripts['s']!
    linkset.startAll()
    linkset.advanceTime(100)
    s.fire('touch_start', { num_detected: 1 })
    linkset.advanceTime(1000)
    const raw = Number(s.global('raw'))
    expect(raw).toBeGreaterThanOrEqual(callbacks - 1)
    expect(Number(s.global('cbs'))).toBe(raw)
  })
})

describe('the handler a script last ran', () => {
  // In LSL a changed waits two frames only after a changed: after state two's state_entry it
  // waits one.
  it('is the last of a state change chain', async () => {
    const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 's', source: { source: `list at;
      default { changed(integer c) { state two; } }
      state two { state_entry() { at += llGetTime(); } changed(integer c) { at += llGetTime(); } }` } }] }] })
    const s = scripts['s']!
    linkset.startAll()
    linkset.advanceTime(1000)
    s.fire('changed', { changes: 2 })
    linkset.clock.schedule(s, linkset.clock.now, 'changed', { changes: 2 })
    linkset.advanceTime(500)
    const [entry, changed] = (JSON.parse(JSON.stringify(s.global('at'))) as number[]).map((t) => t * 1000)
    expect(Math.round((changed! - entry!) / SIM_FRAME_MS)).toBe(1)
  })

  it('is a new start after a reset', async () => {
    const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 's', source: { source: `
      default { changed(integer c) { llSetText("", ZERO_VECTOR, 0.0); if (c == 2) llResetScript(); } }` } }] }] })
    const s = scripts['s']!
    const ran: number[] = []
    s.mock('llSetText', (ctx) => { ran.push(ctx.linkset.clock.now); return undefined })
    linkset.startAll()
    linkset.advanceTime(1000)
    s.fire('changed', { changes: 2 })
    linkset.clock.schedule(s, linkset.clock.now, 'changed', { changes: 1 })
    linkset.advanceTime(500)
    // The change behind the reset runs a frame after it, not the two an LSL changed waits after one.
    expect(ran.map((t) => Math.round((t - ran[0]!) / SIM_FRAME_MS))).toEqual([0, 1])
  })
})

describe('an overdue tick next to a link message sent after the start', () => {
  it('runs the caught-up tick first', async () => {
    const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [
      { name: 't', source: { source: `list log; default { state_entry() { llSetTimerEvent(1.0); }
        timer() { log += "tm"; llSetTimerEvent(0); } link_message(integer s, integer n, string m, key k) { log += m; } }` } },
      { name: 'ctl', source: { source: `default { link_message(integer s, integer n, string m, key k) {
        if (m == "stop") llSetScriptState("t", FALSE);
        else if (m == "start") { llSetScriptState("t", TRUE); llMessageLinked(LINK_THIS, 1, "after", ""); } } }` } },
    ] }] })
    linkset.startAll()
    linkset.advanceTime(500)
    scripts['ctl']!.fire('link_message', lm(0, 'stop'))
    linkset.advanceTime(3000)
    scripts['ctl']!.fire('link_message', lm(0, 'start'))
    linkset.advanceTime(500)
    expect(JSON.parse(JSON.stringify(scripts['t']!.global('log')))).toEqual(['tm', 'after'])
  })
})
