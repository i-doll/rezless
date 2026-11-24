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

  const lslLog = (start: number, touch: number) => `
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
      touch_end(integer n) { got += "E" + who(n); }
    }
  `
  const sluaLog = (start: number, touch: number) => `
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
    LLEvents:on("touch_end", function(d) table.insert(got, "E" .. who(d)) end)
  `

  /**
   * i, f: press as i doll or fivebot; I, F: release; L: a listen that sleeps 3 s; P: one that
   * spins 3 s; M: one that only logs; X: a timer event that sleeps 3 s.
   */
  type Step = 'i' | 'I' | 'f' | 'F' | 'L' | 'P' | 'M' | 'X'

  /** Run `steps` at their times (ms), with Linkset.press and release, and give the log with runs of one touch event shown once. */
  async function run(lang: 'lsl' | 'slua', start: number, touch: number, steps: Record<number, Step>) {
    const source = lang === 'slua' ? sluaLog(start, touch) : lslLog(start, touch)
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

  describe('another handler sleeping', () => {
    it('a click pressed while another is held raises no touch_start in LSL, and one in SLua', async () => {
      // In-world: i doll held 4 s, a listen 0.3 s in slept 3 s and fivebot clicked for 0.3 s
      // 1 s in -> after the sleep i doll's touch, fivebot's touch_end, then i doll's touch
      // events and touch_end. SLua ran fivebot's touch_start between i doll's touch and
      // fivebot's touch_end. fivebot got no touch.
      expect(await run('lsl', 0, 0, { 0: 'i', 300: 'L', 1000: 'f', 1300: 'F', 4000: 'I' })).toBe('Si Ti L Ti Ef Ti Ei')
      expect(await run('slua', 0, 0, { 0: 'i', 300: 'L', 1000: 'f', 1300: 'F', 4000: 'I' })).toBe('Si Ti L Ti Sf Ef Ti Ei')
      // In-world: the same with a timer that slept 3 s, or a listen that spun 3 s, in place of
      // the listen's sleep -> the same events. In three runs each with the listen and the timer
      // sleeping, i doll's touch after the wake listed fivebot too in half of them.
      for (const busy of ['X', 'P'] as const) {
        expect(await run('lsl', 0, 0, { 0: 'i', 300: busy, 1000: 'f', 1300: 'F', 4000: 'I' })).toBe(`Si Ti ${busy} Ti Ef Ti Ei`)
        expect(await run('slua', 0, 0, { 0: 'i', 300: busy, 1000: 'f', 1300: 'F', 4000: 'I' })).toBe(`Si Ti ${busy} Ti Sf Ef Ti Ei`)
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
