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
    expect(await held(lsl(0, 1, 0), 2500)).toEqual(['S', 'T22', 'T1067', 'T2111', 'E3111'])
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
    expect(await held(lsl(1, 1, 1), 2500)).toEqual(['S', 'T1000', 'T2044', 'E3044'])
  })

  it('the next touch comes one repeat after the touch handler ends', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-24): touch slept 1 s, 0.5 s or 1.01 s through a
    // hold of 3 to 5 s, logging the time after each sleep -> the next touch came 0.044 to 0.045 s
    // after the wake in LSL and 0.022 to 0.023 s after it in SLua, every time (14 wakes each).
    const afterWake = async (source: string, sleepMs: number, hold: number, isSlua = false) => {
      const times = (await held(source, hold, isSlua)).filter((e) => e[0] === 'T').map((e) => Number(e.slice(1)))
      return [...new Set(times.slice(1).map((t, i) => t - times[i]! - sleepMs))].sort((x, y) => x - y)
    }
    expect(await afterWake(lsl(0, 1, 0), 1000, 5000)).toEqual([44, 45])
    expect(await afterWake(lsl(0, 0.5, 0), 500, 3000)).toEqual([44, 45])
    expect(await afterWake(slua(0, 1), 1000, 5000, true)).toEqual([22, 23])
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

// In-world: Aditi, SLua Tideland, 2026-11-24. i doll and fivebot pressed and released clicks
// on one prim whose script slept in touch_start, touch or listen. The log lists each event with
// the first letter of each detected name, L for the listen that slept and M for a listen that
// only logged. LSL ran on Mono. Each case was read 3 s or more after the last sleep ended.
describe('two avatars clicking while a handler sleeps', () => {
  const IDOLL = { key: 'aaaaaaaa-0000-0000-0000-000000000000', name: 'i doll' }
  const FIVEBOT = { key: 'bbbbbbbb-0000-0000-0000-000000000000', name: 'fivebot' }

  const lslLog = (start: number, touch: number, end: number | 'spin' = 0) => `
    list got = [];
    string who(integer n) { string w; integer i; for (i = 0; i < n; ++i) w += llGetSubString(llDetectedName(i), 0, 0); return w; }
    default {
      state_entry() { llListen(5, "", NULL_KEY, ""); }
      listen(integer c, string n, key k, string m) {
        if (m == "mark") got += "M";
        else if (m == "spin") { got += "P"; llOwnerSay("spin"); }
        else { got += "L"; llSleep(3); }
      }
      timer() { got += "X"; llSleep(3); }
      touch_start(integer n) { got += "S" + who(n); llSleep(${start}); }
      touch(integer n) { got += "T" + who(n); llSleep(${touch}); }
      touch_end(integer n) { got += "E" + who(n); ${end === 'spin' ? 'llOwnerSay("spin")' : `llSleep(${end})`}; }
    }
  `
  const sluaLog = (start: number, touch: number, end: number | 'spin' = 0) => `
    got = {}
    local function who(d) local w = "" for i = 1, #d do w = w .. string.sub(d[i]:getName(), 1, 1) end return w end
    ll.Listen(5, "", "", "")
    LLEvents:on("listen", function(c, n, k, m)
      if m == "mark" then table.insert(got, "M")
      elseif m == "spin" then table.insert(got, "P"); ll.OwnerSay("spin")
      else table.insert(got, "L"); ll.Sleep(3) end
    end)
    LLEvents:on("timer", function() table.insert(got, "X"); ll.Sleep(3) end)
    LLEvents:on("touch_start", function(d) table.insert(got, "S" .. who(d)); ll.Sleep(${start}) end)
    LLEvents:on("touch", function(d) table.insert(got, "T" .. who(d)); ll.Sleep(${touch}) end)
    LLEvents:on("touch_end", function(d) table.insert(got, "E" .. who(d)); ${end === 'spin' ? 'll.OwnerSay("spin")' : `ll.Sleep(${end})`} end)
  `

  /**
   * i, f: press as i doll or fivebot; I, F: release; L: a listen that sleeps 3 s; P: one that
   * spins 3 s; M: one that only logs; X: a timer event that sleeps 3 s.
   */
  type Step = 'i' | 'I' | 'f' | 'F' | 'L' | 'P' | 'M' | 'X'

  /** Run `steps` at their times (ms), with Linkset.press and release, and give the log with runs of one touch event shown once. */
  async function run(lang: 'lsl' | 'slua', start: number, touch: number, steps: Record<number, Step>, end: number | 'spin' = 0) {
    const source = lang === 'slua' ? sluaLog(start, touch, end) : lslLog(start, touch, end)
    const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 's', source: { source, filename: `s.${lang === 'slua' ? 'luau' : 'lsl'}` } }] }] })
    const s = scripts.s!
    s.mock('llOwnerSay', (ctx) => { ctx.busy(3000); return undefined })
    s.start()
    linkset.advanceTime(0)
    let now = 0
    for (const [at, step] of Object.entries(steps).map(([at, step]) => [Number(at), step] as const).sort((a, b) => a[0] - b[0])) {
      linkset.advanceTime(at - now)
      now = at
      if (step === 'i') linkset.press(0, { avatar: IDOLL })
      else if (step === 'I') linkset.release(IDOLL)
      else if (step === 'f') linkset.press(0, { avatar: FIVEBOT })
      else if (step === 'F') linkset.release(FIVEBOT)
      else {
        const msg = step === 'M' ? 'mark' : step === 'P' ? 'spin' : 'sleep'
        if (step === 'X') linkset.clock.schedule(s, linkset.clock.now, 'timer')
        else linkset.clock.schedule(s, linkset.clock.now, 'listen', { channel: 5, name: 'fivebot', id: FIVEBOT.key, msg })
        linkset.drainQueue()
      }
    }
    linkset.advanceTime(10_000)
    const got = s.global('got') as string[]
    return got.filter((e, i) => !(e[0] === 'T' && got[i - 1] === e)).join(' ')
  }

  describe('the touch handler sleeping', () => {
    it('a click pressed while another is held raises no touch_start in LSL, and one in SLua', async () => {
      // In-world: touch slept 3 s, i doll held 6 s and fivebot clicked for 0.3 s 0.5 s in ->
      // LSL: fivebot's touch_end alone, then i doll's touch and touch_end; SLua: fivebot's
      // touch_start and touch_end, then i doll's.
      expect(await run('lsl', 0, 3, { 0: 'i', 500: 'f', 800: 'F', 6000: 'I' })).toBe('Si Ti Ef Ti Ei')
      expect(await run('slua', 0, 3, { 0: 'i', 500: 'f', 800: 'F', 6000: 'I' })).toBe('Si Ti Sf Ef Ti Ei')
      // In-world: i doll held 1 s and fivebot held 4 s from 0.5 s in -> i doll's touch_end, then
      // fivebot's touch and touch_end, with fivebot's touch_start first in SLua only.
      expect(await run('lsl', 0, 3, { 0: 'i', 500: 'f', 1000: 'I', 4500: 'F' })).toBe('Si Ti Ei Tf Ef')
      expect(await run('slua', 0, 3, { 0: 'i', 500: 'f', 1000: 'I', 4500: 'F' })).toBe('Si Ti Sf Ei Tf Ef')
    })

    it('one touch_end lists both clicks in the order they were released', async () => {
      // In-world: touch slept 3 s, i doll held 2 s and fivebot clicked for 0.3 s 1 s in ->
      // one touch_end listing fivebot, then i doll, three runs out of three; with the avatars
      // swapped it listed i doll, then fivebot. SLua gave fivebot's touch_start before it.
      // An earlier single run had listed i doll first.
      expect(await run('lsl', 0, 3, { 0: 'i', 1000: 'f', 1300: 'F', 2000: 'I' })).toBe('Si Ti Efi')
      expect(await run('slua', 0, 3, { 0: 'i', 1000: 'f', 1300: 'F', 2000: 'I' })).toBe('Si Ti Sf Efi')
    })

    it('a click pressed after the other was released raises touch_start, and touch only once the sleep is over', async () => {
      // In-world: touch slept 3 s, i doll clicked for 0.2 s and fivebot clicked 1 s in ->
      // fivebot's touch_start, then one touch_end for both and no touch for fivebot. Touch
      // slept 2 s, i doll clicked for 0.3 s and fivebot held 3 s from 0.8 s in -> fivebot's
      // touch_start, i doll's touch_end, then fivebot's touch and touch_end. LSL and SLua alike.
      for (const lang of ['lsl', 'slua'] as const) {
        expect(await run(lang, 0, 3, { 0: 'i', 200: 'I', 1000: 'f', 1100: 'F' })).toBe('Si Ti Sf Eif')
        expect(await run(lang, 0, 2, { 0: 'i', 300: 'I', 800: 'f', 3800: 'F' })).toBe('Si Ti Sf Ei Tf Ef')
      }
    })
  })

  describe('the touch_start handler sleeping', () => {
    it('a click pressed while another is held raises no touch_start in LSL, and one behind the touch_end in SLua', async () => {
      // In-world: touch_start slept 3 s, i doll held 1 s and fivebot clicked for 0.1 s 0.5 s in
      // -> LSL: i doll's touch, then one touch_end listing fivebot and i doll; SLua: the same,
      // then fivebot's touch_start. fivebot got no touch.
      expect(await run('lsl', 3, 0, { 0: 'i', 500: 'f', 600: 'F', 1000: 'I' })).toBe('Si Ti Efi')
      expect(await run('slua', 3, 0, { 0: 'i', 500: 'f', 600: 'F', 1000: 'I' })).toBe('Si Ti Efi Sf')
      // In-world: i doll held 5 s -> fivebot's touch_end, then i doll's touch events and
      // touch_end; SLua ran fivebot's touch_start after fivebot's touch_end.
      expect(await run('lsl', 3, 0, { 0: 'i', 500: 'f', 600: 'F', 5000: 'I' })).toBe('Si Ti Ef Ti Ei')
      expect(await run('slua', 3, 0, { 0: 'i', 500: 'f', 600: 'F', 5000: 'I' })).toBe('Si Ti Ef Sf Ti Ei')
      // In-world: i doll held 1 s and fivebot held 4 s from 0.5 s in -> i doll's touch_end, then
      // fivebot's touch events and touch_end; SLua ran fivebot's touch_start after i doll's
      // touch_end.
      expect(await run('lsl', 3, 0, { 0: 'i', 500: 'f', 1000: 'I', 4500: 'F' })).toBe('Si Ti Ei Tf Ef')
      expect(await run('slua', 3, 0, { 0: 'i', 500: 'f', 1000: 'I', 4500: 'F' })).toBe('Si Ti Ei Sf Tf Ef')
    })

    it('a click pressed after the other was released raises its touch_start behind the touch_end', async () => {
      // In-world: touch_start slept 3 s, i doll clicked for 0.2 s and fivebot held 1 s from
      // 0.5 s in -> i doll's touch, one touch_end listing i doll and fivebot, then fivebot's
      // touch_start and nothing more, in LSL and SLua.
      for (const lang of ['lsl', 'slua'] as const) {
        expect(await run(lang, 3, 0, { 0: 'i', 200: 'I', 500: 'f', 1500: 'F' })).toBe('Si Ti Eif Sf')
      }
    })

    it('the click\'s touch runs at the wake, ahead of a listen that came up later in the sleep', async () => {
      // In-world: touch_start slept 3 s, i doll clicked for 0.1 s and a listen came 1 s in ->
      // i doll's touch, the listen, then touch_end. With fivebot clicking 0.5 s in as well ->
      // i doll's touch, the listen, one touch_end for both, then fivebot's touch_start. LSL and
      // SLua alike.
      for (const lang of ['lsl', 'slua'] as const) {
        expect(await run(lang, 3, 0, { 0: 'i', 100: 'I', 1000: 'M' })).toBe('Si Ti M Ei')
        expect(await run(lang, 3, 0, { 0: 'i', 100: 'I', 500: 'f', 600: 'F', 1000: 'M' })).toBe('Si Ti M Eif Sf')
      }
    })
  })

  describe('no handler sleeping', () => {
    it('a click pressed while another is held raises no touch_start in LSL, and each touch lists both', async () => {
      // In-world (Aditi, SLua Tideland, 2026-11-24): nothing slept, i doll held 4 s and fivebot
      // clicked for 0.3 s 0.6 to 1.5 s in -> LSL: no touch_start for fivebot, 6 runs of 6; SLua
      // raised it. While both clicks were held each touch listed i doll, then fivebot.
      expect(await run('lsl', 0, 0, { 0: 'i', 1000: 'f', 1300: 'F', 4000: 'I' })).toBe('Si Ti Tif Ef Ti Ei')
      expect(await run('slua', 0, 0, { 0: 'i', 1000: 'f', 1300: 'F', 4000: 'I' })).toBe('Si Ti Sf Tif Ef Ti Ei')
    })
  })

  describe('the touch_end handler sleeping', () => {
    it('a click pressed in the sleep while another is held raises touch_start, ahead of the waiting touch in LSL', async () => {
      // In-world (Aditi, SLua Tideland, 2026-11-24): touch_end slept 3 s. i doll held 6 s,
      // fivebot clicked for 0.2 s and clicked again for 0.3 s in the sleep of its touch_end ->
      // LSL: fivebot's touch_start, one touch listing i doll and fivebot, fivebot's touch_end,
      // 4 runs of 4; SLua: i doll's touch, fivebot's touch_start and touch_end, 1 run.
      expect(await run('lsl', 0, 0, { 0: 'i', 500: 'f', 700: 'F', 1500: 'f', 1800: 'F', 6000: 'I' }, 3)).toBe('Si Ti Tif Ef Sf Tif Ef Ti Ei')
      expect(await run('slua', 0, 0, { 0: 'i', 500: 'f', 700: 'F', 1500: 'f', 1800: 'F', 6000: 'I' }, 3)).toBe('Si Ti Sf Tif Ef Ti Sf Ef Ti Ei')
      // In-world: the same with fivebot's second click held 4 s, past the wake -> fivebot's
      // touch_start, then touches listing both, in LSL; i doll's touch first in SLua.
      expect(await run('lsl', 0, 0, { 0: 'i', 500: 'f', 700: 'F', 1500: 'f', 5500: 'F', 6000: 'I' }, 3)).toBe('Si Ti Tif Ef Sf Tif Ef Ti Ei')
      expect(await run('slua', 0, 0, { 0: 'i', 500: 'f', 700: 'F', 1500: 'f', 5500: 'F', 6000: 'I' }, 3)).toBe('Si Ti Sf Tif Ef Ti Sf Tif Ef Ti Ei')
    })

    it('a click pressed in the sleep after the other was released runs once the sleep is over', async () => {
      // In-world: touch_end slept 3 s, i doll clicked for 0.2 s and fivebot clicked for 0.3 s,
      // or held 4 s, 1 s in -> after the wake fivebot's touch_start, touch and touch_end, in LSL
      // and SLua.
      for (const lang of ['lsl', 'slua'] as const) {
        expect(await run(lang, 0, 0, { 0: 'i', 200: 'I', 1000: 'f', 1300: 'F' }, 3)).toBe('Si Ti Ei Sf Tf Ef')
        expect(await run(lang, 0, 0, { 0: 'i', 200: 'I', 1000: 'f', 5000: 'F' }, 3)).toBe('Si Ti Ei Sf Tf Ef')
      }
    })
    it('a click pressed in a touch_end spin while another is held does not join the waiting touch in LSL', async () => {
      // In-world (Aditi, SLua Tideland, 2026-11-24): the runs above with touch_end spinning 3 s
      // in place of the sleep. LSL: after the spin i doll's touch alone, then fivebot's
      // touch_start and touch_end, 4 runs of 4; with fivebot's second click held past the end of
      // the spin, i doll's touch, then fivebot's touch_start and touches listing both, 1 run.
      // SLua gave the events of the sleep, 1 run of each. A click pressed after the other was
      // released ran once the spin was over, in LSL and SLua, 1 run of each.
      expect(await run('lsl', 0, 0, { 0: 'i', 500: 'f', 700: 'F', 1500: 'f', 1800: 'F', 6000: 'I' }, 'spin')).toBe('Si Ti Tif Ef Ti Sf Ef Ti Ei')
      expect(await run('slua', 0, 0, { 0: 'i', 500: 'f', 700: 'F', 1500: 'f', 1800: 'F', 6000: 'I' }, 'spin')).toBe('Si Ti Sf Tif Ef Ti Sf Ef Ti Ei')
      expect(await run('lsl', 0, 0, { 0: 'i', 500: 'f', 700: 'F', 1500: 'f', 5500: 'F', 6000: 'I' }, 'spin')).toBe('Si Ti Tif Ef Ti Sf Tif Ef Ti Ei')
      expect(await run('slua', 0, 0, { 0: 'i', 500: 'f', 700: 'F', 1500: 'f', 5500: 'F', 6000: 'I' }, 'spin')).toBe('Si Ti Sf Tif Ef Ti Sf Tif Ef Ti Ei')
      for (const lang of ['lsl', 'slua'] as const) {
        expect(await run(lang, 0, 0, { 0: 'i', 200: 'I', 1000: 'f', 1300: 'F' }, 'spin')).toBe('Si Ti Ei Sf Tf Ef')
        expect(await run(lang, 0, 0, { 0: 'i', 200: 'I', 1000: 'f', 5000: 'F' }, 'spin')).toBe('Si Ti Ei Sf Tf Ef')
      }
    })
  })

  it('a click in an LSL touch_end sleep runs its touch_start ahead of the touch it joined, whenever it presses', async () => {
    // fivebot presses 10 ms into the sleep, before i doll's next touch comes up.
    expect(await run('lsl', 0, 0, { 0: 'i', 500: 'f', 700: 'F', 710: 'f', 1010: 'F', 6000: 'I' }, 3)).toBe('Si Ti Tif Ef Sf Tif Ef Ti Ei')
  })

  it('touch_start events let through a touch_end sleep merge as held ones do', async () => {
    const CAROL = { key: 'cccccccc-0000-0000-0000-000000000000', name: 'carol' }
    const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 's', source: { source: lslLog(0, 0, 3), filename: 's.lsl' } }] }] })
    const t = scripts.s!
    t.start(); linkset.advanceTime(0)
    linkset.press(0, { avatar: IDOLL }); linkset.advanceTime(500)
    linkset.press(0, { avatar: FIVEBOT }); linkset.advanceTime(200); linkset.release(FIVEBOT); linkset.advanceTime(800)
    linkset.press(0, { avatar: FIVEBOT }); linkset.advanceTime(100); linkset.press(0, { avatar: CAROL }); linkset.advanceTime(200)
    linkset.release(FIVEBOT); linkset.advanceTime(100); linkset.release(CAROL); linkset.advanceTime(4100); linkset.release(IDOLL); linkset.advanceTime(5000)
    const got = t.global('got') as string[]
    expect(got.filter((e, i) => !(e[0] === 'T' && got[i - 1] === e)).join(' ')).toBe('Si Ti Tif Ef Sfc Tifc Efc Ti Ei')
  })

  it('a held click does not join a waiting touch fired without detected data', async () => {
    const l2 = await loadLinkset({ prims: [{ scripts: [{ name: 's', source: { source: lslLog(0, 0), filename: 's.lsl' } }] }] })
    const u = l2.scripts.s!
    u.start(); l2.linkset.advanceTime(0)
    l2.linkset.press(0, { avatar: IDOLL }); l2.linkset.advanceTime(300)
    l2.linkset.clock.schedule(u, l2.linkset.clock.now, 'listen', { channel: 5, name: 'x', id: FIVEBOT.key, msg: 'sleep' }); l2.linkset.drainQueue()
    l2.linkset.advanceTime(100); u.fire('touch', { num_detected: 1 }); l2.linkset.advanceTime(3900); l2.linkset.release(IDOLL); l2.linkset.advanceTime(2000)
    const g2 = u.global('got') as string[]
    expect(g2.filter((e, i) => !(e[0] === 'T' && g2[i - 1] === e)).join(' ')).toBe('Si Ti L Ti T0 Ti Ei')
  })

  it('a click whose first touch falls in the handler\'s first frame adds no touch of its own', async () => {
    // fivebot's first touch comes on i doll's next one, 11 ms after the timer starts. A touch
    // that came up in the handler's first frame took no other avatar in the runs above, so
    // fivebot gets no touch here either.
    expect(await run('slua', 0, 0, { 0: 'i', 300: 'X', 305: 'f', 1000: 'F', 4000: 'I' })).toBe('Si Ti X Ti Sf Ef Ti Ei')
  })

  describe('another handler sleeping', () => {
    it('a click pressed while another is held raises no touch_start in LSL, and one in SLua', async () => {
      // In-world: i doll held 4 s, a listen 0.3 s in slept 3 s and fivebot clicked for 0.3 s
      // 1 s in -> after the sleep i doll's touch, fivebot's touch_end, then i doll's touch
      // events and touch_end. SLua ran fivebot's touch_start between i doll's touch and
      // fivebot's touch_end. fivebot got no touch. The handler starts here in the frame i doll's
      // touch comes due, so that touch lists i doll alone (see below).
      expect(await run('lsl', 0, 0, { 0: 'i', 320: 'L', 1000: 'f', 1300: 'F', 4000: 'I' })).toBe('Si Ti L Ti Ef Ti Ei')
      expect(await run('slua', 0, 0, { 0: 'i', 320: 'L', 1000: 'f', 1300: 'F', 4000: 'I' })).toBe('Si Ti L Ti Sf Ef Ti Ei')
      // In-world: the same with a timer that slept 3 s, or a listen that spun 3 s, in place of
      // the listen's sleep -> the same events.
      for (const busy of ['X', 'P'] as const) {
        expect(await run('lsl', 0, 0, { 0: 'i', 320: busy, 1000: 'f', 1300: 'F', 4000: 'I' })).toBe(`Si Ti ${busy} Ti Ef Ti Ei`)
        expect(await run('slua', 0, 0, { 0: 'i', 320: busy, 1000: 'f', 1300: 'F', 4000: 'I' })).toBe(`Si Ti ${busy} Ti Sf Ef Ti Ei`)
      }
    })

    it('in LSL the touch waiting from the sleep lists the second avatar too when it came up after the handler\'s first frame', async () => {
      // In-world (Aditi, SLua Tideland, 2026-11-24): i doll held 4 s, a timer 0.3 s in slept 3 s
      // and fivebot clicked for 0.3 s 1 s in, 13 runs in LSL with the region time of each event.
      // When the timer ran one frame after i doll's last touch, i doll's next touch came up a
      // frame into the sleep and listed fivebot too after the wake: 5 runs of 5. When the timer
      // ran two frames after it, in the frame that touch came due, it listed i doll alone: 8 runs
      // of 8. Earlier runs without the region times had listed fivebot too in 3 of 6, with a
      // listen or a timer sleeping. SLua raises a held click's touch every frame, so it came due
      // in the handler's first frame and listed i doll alone: 4 runs of 4.
      // In-world (Aditi, SLua Tideland, 2026-11-24): the same with a listen 0.3 s in that slept
      // 3 s, 10 LSL runs with the region time of each event -> when the listen ran one frame
      // (0.022 s) after i doll's last touch, the touch after the wake listed fivebot too, 8 runs
      // of 8; when it ran two frames (0.044 s) after, it listed i doll alone, 2 runs of 2.
      // Here i doll's touches come 22, 67, ..., 289 and 333 ms after the press.
      for (const busy of ['X', 'L'] as const) {
        expect(await run('lsl', 0, 0, { 0: 'i', 300: busy, 1000: 'f', 1300: 'F', 4000: 'I' })).toBe(`Si Ti ${busy} Tif Ef Ti Ei`)
        expect(await run('lsl', 0, 0, { 0: 'i', 320: busy, 1000: 'f', 1300: 'F', 4000: 'I' })).toBe(`Si Ti ${busy} Ti Ef Ti Ei`)
        expect(await run('slua', 0, 0, { 0: 'i', 300: busy, 1000: 'f', 1300: 'F', 4000: 'I' })).toBe(`Si Ti ${busy} Ti Sf Ef Ti Ei`)
      }
    })

    it('in LSL the touch waiting from a spin lists the first avatar alone, whatever frame it came up in', async () => {
      // In-world (Aditi, SLua Tideland, 2026-11-24): i doll held 4 s, a listen 0.3 s in spun 3 s
      // and fivebot clicked for 0.3 s 1 s in, 13 LSL runs with the region time of each event ->
      // the touch after the spin listed i doll alone in all 13: 6 runs where the listen ran one
      // frame (0.022 s) after i doll's last touch, and 7 where it ran two frames after.
      for (const at of [300, 320]) {
        expect(await run('lsl', 0, 0, { 0: 'i', [at]: 'P', 1000: 'f', 1300: 'F', 4000: 'I' })).toBe('Si Ti P Ti Ef Ti Ei')
      }
    })

    it('a held click\'s touch from a spin runs ahead of a listen that came up during it', async () => {
      // In-world: i doll held 4 s and a listen 0.3 s in spun 3 s; a second listen came 0.7 s in
      // -> after the spin i doll's touch, the second listen, then i doll's touch events.
      for (const lang of ['lsl', 'slua'] as const) {
        expect(await run(lang, 0, 0, { 0: 'i', 300: 'P', 700: 'M', 4000: 'I' })).toBe('Si Ti P Ti M Ti Ei')
      }
    })

    it('a listen that came up in the sleep runs ahead of a click that came before it', async () => {
      // In-world: a listen slept 3 s, i doll clicked for 0.1 s 0.5 s in and a second listen
      // came 1 s in -> the second listen, then the click's touch_start, touch and touch_end.
      // Touch slept 3 s with the same click and listen -> the listen, then touch_end.
      for (const lang of ['lsl', 'slua'] as const) {
        expect(await run(lang, 0, 0, { 0: 'L', 500: 'i', 600: 'I', 1000: 'M' })).toBe('L M Si Ti Ei')
        expect(await run(lang, 0, 3, { 0: 'i', 100: 'I', 1000: 'M' })).toBe('Si Ti M Ei')
      }
    })
  })

  it('a held click runs beside a fired touch that carries no detected data', async () => {
    const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 's', source: { source: lslLog(1, 0), filename: 's.lsl' } }] }] })
    const s = scripts.s!
    s.start()
    linkset.advanceTime(0)
    linkset.press(0, { avatar: IDOLL })
    s.fire('touch', { num_detected: 1 })
    linkset.advanceTime(2000)
    linkset.release(IDOLL)
    linkset.advanceTime(1000)
    expect((s.global('got') as string[]).map((e) => e[0]).join('')).toMatch(/^STT*E$/)
  })

  it('a touch queued for later does not count as waiting for a held click', async () => {
    const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 's', source: { source: lslLog(1, 0), filename: 's.lsl' } }] }] })
    const s = scripts.s!
    s.start()
    linkset.advanceTime(0)
    linkset.clock.schedule(s, linkset.clock.now, 'touch', { num_detected: 1, detected: [{ ...FIVEBOT }] }, undefined, linkset.clock.now + 5000)
    linkset.press(0, { avatar: IDOLL })
    linkset.advanceTime(300)
    linkset.release(IDOLL)
    linkset.advanceTime(10_000)
    expect(s.global('got')).toEqual(['Si', 'Ti', 'Ei', 'Tf'])
  })

  it('a second click by the same avatar in a sleep gives the touch after the wake its face', async () => {
    const src = `list got;
      default {
        state_entry() { llSetTimerEvent(0.1); }
        timer() { llSetTimerEvent(0); llSleep(2); }
        touch_start(integer n) { got += "S" + (string)llDetectedTouchFace(0); }
        touch(integer n) { got += "T" + (string)llDetectedTouchFace(0); }
        touch_end(integer n) { got += "E" + (string)llDetectedTouchFace(0); }
      }`
    const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 's', source: { source: src, filename: 's.lsl' } }] }] })
    const s = scripts.s!
    s.start()
    linkset.advanceTime(500)
    linkset.press(0, { avatar: IDOLL, face: 1 })
    linkset.advanceTime(300)
    linkset.release(IDOLL)
    linkset.advanceTime(100)
    linkset.press(0, { avatar: IDOLL, face: 2 })
    linkset.advanceTime(3000)
    linkset.release(IDOLL)
    linkset.advanceTime(1000)
    const got = s.global('got') as string[]
    expect(got.slice(0, 3)).toEqual(['S1', 'T2', 'E1'])
  })

  it('press and release refuse a second press or a release without a press', async () => {
    const { linkset } = await loadLinkset({ prims: [{ scripts: [{ name: 's', source: { source: lslLog(0, 0), filename: 's.lsl' } }] }] })
    linkset.press(0, { avatar: IDOLL })
    expect(() => linkset.press(0, { avatar: { ...IDOLL, key: IDOLL.key.toUpperCase() } })).toThrow(/already holding/)
    expect(() => linkset.touch(0, { avatar: IDOLL })).toThrow(/holding a click from press/)
    linkset.release(IDOLL)
    expect(() => linkset.release(IDOLL)).toThrow(/not holding/)
  })
})

describe('the touch handler rules leave other cases alone', () => {
  it('a click cut by a link break does not count as held', async () => {
    // The cut click's release went to the broken-off prim, so no button is down when cat
    // clicks, as in the measured case above where cat's touch_start came.
    const log = `list got;
      string who(integer n) { string w; integer i; for (i = 0; i < n; ++i) w += llGetSubString(llDetectedName(i), 0, 0); return w; }
      default {
        touch_start(integer n) { got += "S" + who(n); }
        touch(integer n) { got += "T" + who(n); llSleep(3); }
        touch_end(integer n) { got += "E" + who(n); }
      }`
    const av = (c: string, name: string) => ({ key: c.repeat(8) + '-0000-0000-0000-000000000000', name })
    const { linkset, scripts } = await loadLinkset({ prims: [
      { scripts: [{ name: 's', source: { source: log, filename: 's.lsl' } }] },
      { scripts: [{ name: 'e', source: { source: 'default { state_entry() {} }', filename: 'e.lsl' } }] },
    ] })
    scripts.s!.start()
    scripts.e!.start()
    linkset.advanceTime(0)
    linkset.clock.scheduleTask(scripts.s!, linkset.clock.now + 10, () => linkset.breakOff(linkset.prims[1]!))
    linkset.touch(2, { avatar: av('b', 'bob'), hold: 100 })
    linkset.advanceTime(5000)
    linkset.clock.scheduleTask(scripts.s!, linkset.clock.now + 1000, () => linkset.touch(0, { avatar: av('c', 'cat'), hold: 100 }))
    linkset.touch(0, { avatar: av('a', 'ann'), hold: 200 })
    linkset.advanceTime(10_000)
    expect(scripts.s!.global('got')).toEqual(['Sb', 'Eb', 'Sa', 'Ta', 'Sc', 'Eac'])
  })

  it('a busy handler still releases a held change behind the touch events that came up before it', async () => {
    const src = `list log;
      default {
        link_message(integer f, integer n, string s, key id) { log += "begin"; llOwnerSay("spin"); log += "end"; }
        changed(integer c) { log += "changed"; }
        touch_start(integer n) { log += "S" + llGetSubString(llDetectedName(0), 0, 0); }
        touch(integer n) { log += "T" + llGetSubString(llDetectedName(0), 0, 0); }
        touch_end(integer n) { integer i; string w; for (i = 0; i < n; ++i) w += llGetSubString(llDetectedName(i), 0, 0); log += "E" + w; }
      }`
    const who = (k: string, name: string) => ({ num_detected: 1, detected: [{ key: k.repeat(8) + '-0000-0000-0000-000000000000', name }] })
    const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 's', source: { source: src, filename: 's.lsl' } }] }] })
    const s = scripts.s!
    s.mock('llOwnerSay', (ctx) => { ctx.busy(5000); return undefined })
    s.start()
    linkset.advanceTime(0)
    const c = linkset.clock
    const q = (ev: string, p: Record<string, unknown>) => c.schedule(s, c.now, ev, p)
    q('link_message', { sender_num: 1, num: 0, str: '', id: '' })
    linkset.advanceTime(100)
    const w = who('c', 'w')
    q('touch_start', w)
    q('touch', w)
    q('touch_end', w)
    linkset.advanceTime(100)
    q('touch_end', who('a', 'x'))
    linkset.advanceTime(100)
    q('changed', { changes: 1 })
    linkset.advanceTime(50)
    q('changed', { changes: 2 })
    linkset.advanceTime(50)
    q('touch_start', who('b', 'y'))
    linkset.advanceTime(10_000)
    expect(s.global('log')).toEqual(['begin', 'end', 'Sw', 'Tw', 'Ew', 'changed', 'Sy', 'Ex', 'changed'])
  })
})
