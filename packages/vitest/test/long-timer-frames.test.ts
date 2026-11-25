import { describe, expect, it } from 'vitest'
import { loadLinkset } from '../src/index.js'

type Kind = 'lsl' | 'llcompat' | 'LLTimers' | 'lsl-delay' | 'slua-delay'

/** The simulator frame of each of the first `count` ticks, counted from the frame that set the timer. */
async function tickFrames(kind: Kind, seconds: number, count = 3) {
  const lsl = kind === 'lsl' || kind === 'lsl-delay'
  const set = {
    lsl: `llSetTimerEvent(${seconds});`,
    'lsl-delay': `llMinEventDelay(${seconds}); llSetTimerEvent(0.05);`,
    llcompat: `LLEvents:on("timer", tick) llcompat.SetTimerEvent(${seconds})`,
    LLTimers: `LLTimers:every(${seconds}, tick)`,
    'slua-delay': `ll.MinEventDelay(${seconds}) LLTimers:every(0.05, tick)`,
  }[kind]
  const source = lsl
    ? `list L; default { state_entry() { ${set} } timer() { L += llGetTime(); if (llGetListLength(L) == ${count}) llSetTimerEvent(0.0); } }`
    : `L = {}
      function tick() table.insert(L, ll.GetTime()) end
      ${set}`
  const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 's', language: lsl ? 'lsl' : 'slua', source: { source } }] }] })
  linkset.startAll()
  linkset.advanceTime(count * seconds * 1000 + 1000)
  return (JSON.parse(JSON.stringify(scripts['s']!.global('L'))) as number[]).slice(0, count).map((t) => Math.round(t * 45))
}

// 256.2 s is 11529 frames, but as a float it is 256.2000122 s, 12 µs past that frame, and its
// later ticks fall due 24 and 36 µs past frames 23058 and 34587.
// In-world (Aditi, SLua Tideland, 2026-11-25): one chat line started LSL llSetTimerEvent and SLua
// llcompat.SetTimerEvent and LLTimers:every timers of 256.19, 256.2 and 256.21 s, and an LSL and an
// SLua script under llMinEventDelay(256.2) with a 0.05 s timer, each logging llGetTimestamp at the
// start and at each of three ticks. In two rounds every 256.2 s tick ran on a frame of its own
// whole-frame schedule: the first on the frame of the 256.19 s timer's first tick, the second and
// third a frame after the 256.19 s timer's and a frame before the 256.21 s timer's. The
// llMinEventDelay(256.2) ticks ran on the same frames as the 256.2 s timers. The region's frames ran
// up to 0.4 frame behind llGetTimestamp by the third tick, so the 256.19 s timer's second tick, due
// 0.1 frame past frame 23057, ran on that frame; rezless keeps an even frame rate and runs it on
// frame 23058.
describe('a timer past 256 s ticks on its whole frames', () => {
  it.each(['lsl', 'llcompat', 'LLTimers'] as const)('ticks a 256.2 s timer on frames 11529, 23058 and 34587 in %s', async (kind) => {
    expect(await tickFrames(kind, 256.2)).toEqual([11529, 23058, 34587])
  })

  it.each(['lsl', 'llcompat', 'LLTimers'] as const)('ticks 256.19 and 256.21 s timers on the frames on or after them in %s', async (kind) => {
    expect(await tickFrames(kind, 256.19)).toEqual([11529, 23058, 34586])
    expect(await tickFrames(kind, 256.21)).toEqual([11530, 23059, 34589])
  })

  it.each(['lsl-delay', 'slua-delay'] as const)('runs ticks held by llMinEventDelay(256.2) on its whole frames in %s', async (kind) => {
    expect(await tickFrames(kind, 256.2)).toEqual([11529, 23058, 34587])
  })

  // A timer that isn't whole frames keeps ticking on the first frame on or after each due time,
  // counting a due time within 10 µs past a frame as on it, however long it runs: 512.063 s is
  // 23042.835 frames and its twelfth tick falls due 0.02 frame past frame 276514, and 10.01 s is
  // 450.45 frames.
  it.each([[512.063, 12], [10.01, 100]] as const)('ticks a %s s timer on the frame after each due time', async (seconds, count) => {
    const due = (k: number) => k * Math.fround(seconds) * 45
    expect(await tickFrames('lsl', seconds, count)).toEqual(Array.from({ length: count }, (_, i) => Math.ceil(due(i + 1) - 0.01 / (1000 / 45))))
  })
})
