import { describe, it, expect } from 'vitest'
import { loadLinkset } from '../src/index.js'

// In-world: Aditi, SLua Tideland, 2026-11-24. One avatar held a click on a prim whose script
// slept in its touch handlers and logged each event's time after touch_start; LSL (Mono) and
// SLua gave the same events.

const lsl = (start: number, touch: number, end: number, timer = 0, timerSleep = 0) => `
  list got = [];
  default {
    state_entry() { ${timer ? `llSetTimerEvent(${timer});` : ''} }
    timer() { llSetTimerEvent(0); got += "X"; llSleep(${timerSleep}); }
    touch_start(integer n) { llResetTime(); got += "S"; llSleep(${start}); }
    touch(integer n) { got += "T" + (string)llRound(llGetTime() * 1000); llSleep(${touch}); }
    touch_end(integer n) { got += "E" + (string)llRound(llGetTime() * 1000); llSleep(${end}); }
  }
`

const slua = (start: number, touch: number, end = 0) => `
  got = {}
  local t0 = 0
  local function at() return ll.Round((ll.GetTime() - t0) * 1000) end
  LLEvents:on("touch_start", function(d) t0 = ll.GetTime(); table.insert(got, "S"); ll.Sleep(${start}) end)
  LLEvents:on("touch", function(d) table.insert(got, "T" .. at()); ll.Sleep(${touch}) end)
  LLEvents:on("touch_end", function(d) table.insert(got, "E" .. at()); ll.Sleep(${end}) end)
`

async function held(source: string, hold: number, slua = false, busyMs = 0) {
  const { linkset, scripts } = await loadLinkset({
    prims: [{ scripts: [{ name: 's', source: { source, filename: slua ? 's.luau' : 's.lsl' } }] }],
  })
  if (busyMs) scripts.s!.mock('llOwnerSay', (ctx) => { ctx.busy(busyMs); return undefined })
  scripts.s!.start()
  linkset.advanceTime(0)
  linkset.touch(0, { hold })
  linkset.advanceTime(10_000)
  return scripts.s!.global('got') as string[]
}

const kinds = (got: ReadonlyArray<string>) => got.map((e) => e[0]).join('')

describe('a held click while the touch handler sleeps', () => {
  it('raises no touch during the sleep, so each sleep is followed by one touch', async () => {
    // In-world: touch slept 1 s, held 2.5 s -> touch at 0.067, 1.111 and 2.156 after
    // touch_start, touch_end at 3.200; held 5 s -> five touch events a little over a second
    // apart, then touch_end.
    expect(await held(lsl(0, 1, 0), 2500)).toEqual(['S', 'T22', 'T1044', 'T2067', 'E3067'])
    expect(kinds(await held(lsl(0, 1, 0), 5000))).toBe('STTTTTE')
  })

  it('a release during the touch handler sleep leaves only touch_end', async () => {
    // In-world: touch slept 0.5 s and the click was held 2.5 s -> five touch events, then
    // touch_end 0.534 s after the last; slept 2 s, held 5 s -> three; slept 3 s, held 1 s ->
    // one touch and touch_end right after the sleep; slept 1 s, held 0.3 s -> the same.
    expect(kinds(await held(lsl(0, 0.5, 0), 2500))).toBe('STTTTTE')
    expect(kinds(await held(lsl(0, 2, 0), 5000))).toBe('STTTE')
    expect(await held(lsl(0, 3, 0), 1000)).toEqual(['S', 'T22', 'E3022'])
    expect(await held(lsl(0, 1, 0), 300)).toEqual(['S', 'T22', 'E1022'])
  })

  it('every handler sleeping 1 s through a 2.5 s hold gives two touch events', async () => {
    // In-world: touch_start, touch and touch_end each slept 1 s, held 2.5 s -> touch at
    // 1.044 and 2.111 after touch_start, touch_end at 3.133.
    expect(await held(lsl(1, 1, 1), 2500)).toEqual(['S', 'T1000', 'T2022', 'E3022'])
  })

  it('a touch handler kept busy or held by a forced delay drops them the same way', async () => {
    // In-world: a touch handler that looped on llGetTime for 1 s, held 2.5 s -> touch at 0.111,
    // 1.155 and 2.222 after touch_start, touch_end at 3.244; looping 3 s, held 1 s -> one touch,
    // then touch_end after the loop. llInstantMessage (a 2 s delay) in touch, held 2.5 s ->
    // touch at 0.022 and 2.066, touch_end at 4.089; held 1 s -> one touch, then touch_end.
    // The loop stands in as a call that keeps the handler busy for as long.
    const busy = lsl(0, 0, 0).replace('llSleep(0); }\n    touch_end', 'llOwnerSay("spin"); }\n    touch_end')
    const im = lsl(0, 0, 0).replace('llSleep(0); }\n    touch_end', 'llInstantMessage(llGetOwner(), "hi"); }\n    touch_end')
    expect(kinds(await held(busy, 2500, false, 1000))).toBe('STTTE')
    expect(kinds(await held(busy, 1000, false, 3000))).toBe('STE')
    expect(kinds(await held(im, 2500))).toBe('STTE')
    expect(kinds(await held(im, 1000))).toBe('STE')
  })

  it('touch_start sleeping keeps one touch for the click, even past the release', async () => {
    // In-world: touch_start slept 3 s and the click was held 1 s -> one touch right after the
    // sleep, then touch_end. Slept 2 s, held 2.5 s -> one touch after the sleep, then one every
    // two frames until the release.
    expect(await held(lsl(3, 0, 0), 1000)).toEqual(['S', 'T3000', 'E3000'])
    const got = await held(lsl(2, 0, 0), 2500)
    expect(got.slice(0, 2)).toEqual(['S', 'T2000'])
    expect(got.at(-1)).toBe('E2500')
  })

  it('a timer handler sleeping through the release keeps one touch for after it', async () => {
    // In-world: touch did not sleep; a timer 1 s into a 2.5 s hold slept 2 s -> after the
    // timer's sleep one touch, then touch_end.
    const got = await held(lsl(0, 0, 0, 1, 2), 2500)
    expect(got.slice(got.indexOf('X'))).toEqual(['X', 'T3000', 'E3000'])
  })

  it('SLua drops the touch events raised during the touch handler sleep the same way', async () => {
    // In-world (SLua): touch slept 1 s, held 2.5 s -> touch at 0.022, 1.067 and 2.111 after
    // touch_start, touch_end at 3.155; touch_start, touch and touch_end each slept 1 s -> two
    // touch events; touch slept 3 s, held 1 s -> one touch and touch_end after the sleep.
    expect(kinds(await held(slua(0, 1), 2500, true))).toBe('STTTE')
    expect(kinds(await held(slua(1, 1, 1), 2500, true))).toBe('STTE')
    expect(kinds(await held(slua(0, 3), 1000, true))).toBe('STE')
  })
})

describe('another avatar clicking while the touch handler sleeps', () => {
  // In-world: i doll and fivebot clicked one prim whose touch handler slept; the log lists
  // each event with the first letter of each detected name.
  const log = (touch: number) => `
    list got = [];
    string who(integer n) { string w; integer i; for (i = 0; i < n; ++i) w += llGetSubString(llDetectedName(i), 0, 0); return w; }
    default {
      touch_start(integer n) { got += "S" + who(n); }
      touch(integer n) { got += "T" + who(n); llSleep(${touch}); }
      touch_end(integer n) { got += "E" + who(n); }
    }
  `
  const IDOLL = { key: 'aaaaaaaa-0000-0000-0000-000000000000', name: 'i doll' }
  const FIVEBOT = { key: 'bbbbbbbb-0000-0000-0000-000000000000', name: 'fivebot' }

  async function two(touch: number, first: number, at: number, second: number) {
    const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 's', source: { source: log(touch), filename: 's.lsl' } }] }] })
    scripts.s!.start()
    linkset.advanceTime(0)
    linkset.clock.scheduleTask(scripts.s!, linkset.clock.now + at, () => linkset.touch(0, { avatar: FIVEBOT, hold: second }))
    linkset.touch(0, { avatar: IDOLL, hold: first })
    linkset.advanceTime(10_000)
    return scripts.s!.global('got') as string[]
  }

  it('a click pressed while another is held raises no touch_start', async () => {
    // In-world: touch slept 3 s, i doll held 6 s and fivebot clicked 0.5 s in -> fivebot's
    // touch_end alone, then i doll's touch and touch_end. Also with i doll holding 2 s and
    // fivebot clicking 1 s in -> no touch_start or touch for fivebot, and one touch_end listing
    // i doll and then fivebot; and with i doll holding 1 s and fivebot holding 4 s from 0.5 s
    // in -> i doll's touch_end, then fivebot's touch and touch_end with no touch_start.
    // Linkset.touch cannot hold a second click past the first one's release, so only the
    // first case runs here.
    expect(await two(3, 6000, 500, 300)).toEqual(['Si', 'Ti', 'Ef', 'Ti', 'Ei'])
  })

  it('a click pressed after the other was released raises touch_start, and touch only once the sleep is over', async () => {
    // In-world: touch slept 3 s, i doll clicked for 0.2 s and fivebot clicked 1 s in ->
    // fivebot's touch_start, then one touch_end for both and no touch for fivebot; fivebot
    // held 1 s from 0.8 s in, touch sleeping 4 s -> the same. Touch slept 2 s, i doll clicked
    // for 0.3 s and fivebot held 3 s from 0.8 s in -> fivebot's touch_start, i doll's
    // touch_end, then fivebot's touch and touch_end.
    expect(await two(3, 200, 1000, 100)).toEqual(['Si', 'Ti', 'Sf', 'Eif'])
    expect(await two(4, 200, 800, 1000)).toEqual(['Si', 'Ti', 'Sf', 'Eif'])
    expect(await two(2, 300, 800, 3000)).toEqual(['Si', 'Ti', 'Sf', 'Ei', 'Tf', 'Ef'])
  })
})
