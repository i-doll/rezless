import { describe, expect, it } from 'vitest'
import { loadLinkset } from '../src/index.js'

const LSL = (seconds: number, count: number) => `float S; list L;
  default {
    touch_start(integer n) { S = llGetTime(); L = []; llSetTimerEvent(${seconds}); }
    timer() { L += llGetTime(); if (llGetListLength(L) == ${count}) llSetTimerEvent(0.0); }
  }`

/** The frame each LSL script in one prim was touched on, and the frames of its ticks counted from the touch. */
async function run(scriptCount: number, seconds: number, count: number) {
  const names = Array.from({ length: scriptCount }, (_, i) => `p${i + 1}`)
  const { linkset, scripts } = await loadLinkset({
    prims: [{ scripts: names.map((name) => ({ name, language: 'lsl' as const, source: { source: LSL(seconds, count) } })) }],
  })
  linkset.startAll()
  linkset.advanceTime(500)
  linkset.touch(0)
  linkset.advanceTime(count * seconds * 1000 + 1000)
  return names.map((name) => {
    const s = scripts[name]!
    const start = s.global('S') as number
    const ticks = JSON.parse(JSON.stringify(s.global('L'))) as number[]
    return { touched: Math.round(start * 45), ticks: ticks.map((t) => Math.round((t - start) * 45)) }
  })
}

// In-world (Aditi, SLua Tideland, 2026-11-25): one chat line started llSetTimerEvent timers in 19
// LSL scripts, in prims holding 1, 2 and 8 of them and in two prims holding 4 added in opposite
// orders, and LLTimers timers in SLua scripts in prims holding 1 and 4 of them. Over 9 runs of 1.0 s, 4 of 0.3 s, 2 of 5.0 s and one each of
// 30 s and 256.2 s, every LSL script ticked on the same frames as the one alone in its prim: 45, 90
// and 135 frames after the start for 1.0 s, 225, 450 and 675 for 5.0 s, 1350, 2700 and 4050 for
// 30 s, and 11529 for 256.2 s. Only the first run after the scripts were added had stragglers: 8 of
// the 19 LSL scripts, among them the one alone in its prim, heard the chat line 2 frames late and
// ticked 1 to 2 frames after the others. 0.3 s ticks read 13, 27, 40, 54 and 67 frames after the
// start in 2 runs and 14, 27, 41, 54 and 68 in the other 2, the same in every LSL script. The 4
// SLua scripts sharing a prim ticked on the same frames as the one alone in its prim. Touching a
// prim with 8 LSL scripts 4 times, and one with 4 scripts 3 times, ran every script's touch_start
// on the same frame. The test starts the timers from that touch_start; rezless runs a 0.3 s timer,
// 13.5 frames, on the frame on or after each due time.
describe('LSL scripts sharing a prim', () => {
  it.each([1, 2, 4, 8])('runs touch_start in each of %i script(s) on one frame and ticks their 1.0 s timers on frames 45, 90 and 135', async (n) => {
    const results = await run(n, 1.0, 3)
    for (const r of results) expect(r.touched).toBe(23)
    for (const r of results) expect(r.ticks).toEqual([45, 90, 135])
  })

  it.each([[0.3, 5, [14, 27, 41, 54, 68]], [5.0, 3, [225, 450, 675]]] as const)('ticks %s s timers in 4 scripts in one prim on the same frames', async (seconds, count, frames) => {
    for (const r of await run(4, seconds, count)) expect(r.ticks).toEqual(frames)
  })
})
