import { describe, it, expect } from 'vitest'
import { loadLinkset, seedRlvInventory, World } from '../src/index.js'

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
  linkset.advanceTime(100)
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
    expect(await held(lsl(0, 1, 0), 2500)).toEqual(['S', 'T22', 'T1067', 'T2111', 'E3133'])
    expect(kinds(await held(lsl(0, 1, 0), 5000))).toBe('STTTTTE')
  })

  it('a release during the touch handler sleep leaves only touch_end', async () => {
    // In-world: touch slept 0.5 s and the click was held 2.5 s -> five touch events, then
    // touch_end 0.534 s after the last; slept 2 s, held 5 s -> three; slept 3 s, held 1 s ->
    // one touch and touch_end right after the sleep; slept 1 s, held 0.3 s -> the same.
    expect(kinds(await held(lsl(0, 0.5, 0), 2500))).toBe('STTTTTE')
    expect(kinds(await held(lsl(0, 2, 0), 5000))).toBe('STTTE')
    expect(await held(lsl(0, 3, 0), 1000)).toEqual(['S', 'T22', 'E3044'])
    expect(await held(lsl(0, 1, 0), 300)).toEqual(['S', 'T22', 'E1044'])
  })

  it('every handler sleeping 1 s through a 2.5 s hold gives two touch events', async () => {
    // In-world: touch_start, touch and touch_end each slept 1 s, held 2.5 s -> touch at
    // 1.044 and 2.111 after touch_start, touch_end at 3.133.
    expect(await held(lsl(1, 1, 1), 2500)).toEqual(['S', 'T1022', 'T2067', 'E3089'])
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
    expect(await held(lsl(3, 0, 0), 1000)).toEqual(['S', 'T3022', 'E3044'])
    const got = await held(lsl(2, 0, 0), 2500)
    expect(got.slice(0, 2)).toEqual(['S', 'T2022'])
    expect(got.at(-1)).toBe('E2500')
  })

  it('a timer handler sleeping through the release keeps one touch for after it', async () => {
    // In-world: touch did not sleep; a timer 1 s into a 2.5 s hold slept 2 s -> after the
    // timer's sleep one touch, then touch_end.
    const got = await held(lsl(0, 0, 0, 1, 2), 2500)
    expect(got.slice(got.indexOf('X'))).toEqual(['X', 'T2922', 'E2944'])
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
    integer spinTimer;
    integer spinSleep;
    string who(integer n) { string w; integer i; for (i = 0; i < n; ++i) w += llGetSubString(llDetectedName(i), 0, 0); return w; }
    default {
      state_entry() { llListen(5, "", NULL_KEY, ""); }
      listen(integer c, string n, key k, string m) {
        if (m == "mark") got += "M";
        else if (m == "spin") { got += "P"; llOwnerSay("spin"); }
        else if (m == "spin-sleep") { got += "Q"; llWhisper(0, ""); llSleep(1.5); }
        else if (m == "sleep-spin") { got += "R"; llSleep(1.5); llWhisper(0, ""); }
        else if (m == "sleep-spin-sleep") { got += "Z"; llSleep(1); llShout(0, ""); llSleep(1.5); }
        else if (m == "delay") { got += "D"; llInstantMessage(llGetOwner(), ""); }
        else if (m == "spin-long-sleep") { got += "W"; llWhisper(0, ""); llSleep(10); }
        else { got += "L"; llSleep(3); }
      }
      on_rez(integer p) { got += "O"; }
      changed(integer c) { got += "C"; }
      timer() { if (spinTimer) { got += "Y"; llOwnerSay("spin"); } else if (spinSleep) { got += "U"; llWhisper(0, ""); llSleep(10); } else { got += "X"; llSleep(3); } }
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
      elseif m == "spin-sleep" then table.insert(got, "Q"); ll.Whisper(0, ""); ll.Sleep(1.5)
      elseif m == "sleep-spin" then table.insert(got, "R"); ll.Sleep(1.5); ll.Whisper(0, "")
      elseif m == "delay" then table.insert(got, "D"); ll.InstantMessage(ll.GetOwner(), "")
      elseif m == "sleep-spin-sleep" then table.insert(got, "Z"); ll.Sleep(1); ll.Shout(0, ""); ll.Sleep(1.5)
      elseif m == "spin-long-sleep" then table.insert(got, "W"); ll.Whisper(0, ""); ll.Sleep(10)
      else table.insert(got, "L"); ll.Sleep(3) end
    end)
    spinSleep = 0
    LLEvents:on("timer", function()
      if spinSleep == 1 then table.insert(got, "U"); ll.Whisper(0, ""); ll.Sleep(10)
      else table.insert(got, "X"); ll.Sleep(3) end
    end)
    LLEvents:on("on_rez", function() table.insert(got, "O") end)
    LLEvents:on("changed", function() table.insert(got, "C") end)
    LLEvents:on("touch_start", function(d) table.insert(got, "S" .. who(d)); ll.Sleep(${start}) end)
    LLEvents:on("touch", function(d) table.insert(got, "T" .. who(d)); ll.Sleep(${touch}) end)
    LLEvents:on("touch_end", function(d) table.insert(got, "E" .. who(d)); ${end === 'spin' ? 'll.OwnerSay("spin")' : `ll.Sleep(${end})`} end)
  `

  /**
   * i, f: press as i doll or fivebot; I, F: release; L: a listen that sleeps 3 s; P: one that
   * spins 3 s; M: one that only logs; X: a timer event that sleeps 3 s; Q: a listen that spins
   * 1.5 s, then sleeps 1.5 s; R: one that sleeps 1.5 s, then spins 1.5 s; D: one that waits out
   * llInstantMessage's 2 s delay; Y: a timer event that spins 3 s; Z: a listen that sleeps 1 s,
   * spins 1 s, then sleeps 1.5 s; W: a listen that spins 1.5 s, then sleeps 10 s; U: a timer event that
   * does the same; K: take the
   * object and rez it again; V: detach the object, worn from the start, and wear it again; B:
   * reset the script; C: a change of colour.
   */
  type Step = 'i' | 'I' | 'f' | 'F' | 'L' | 'P' | 'M' | 'X' | 'Q' | 'R' | 'D' | 'Y' | 'Z' | 'W' | 'K' | 'V' | 'B' | 'C' | 'U'

  /** Run `steps` at their times (ms), with Linkset.press and release, and give the log with runs of one touch event shown once. */
  async function run(lang: 'lsl' | 'slua', start: number, touch: number, steps: Record<number, Step>, end: number | 'spin' = 0) {
    const source = lang === 'slua' ? sluaLog(start, touch, end) : lslLog(start, touch, end)
    // fivebot owns the object, so it can take it and rez it again.
    const world = Object.values(steps).includes('K') ? new World() : undefined
    world?.addRegion('home', { x: 0, y: 0 })
    const owner = world?.addAvatar({ region: 'home', key: FIVEBOT.key, username: 'fivebot' })
    const loaded = await loadLinkset({
      ...(world && { world, region: 'home', owner: FIVEBOT.key }),
      prims: [{ scripts: [{ name: 's', source: { source, filename: `s.${lang === 'slua' ? 'luau' : 'lsl'}` } }] }],
    })
    let linkset = loaded.linkset
    let s = loaded.scripts.s!
    s.mock('llOwnerSay', (ctx) => { ctx.busy(3000); return undefined })
    s.mock('llWhisper', (ctx) => { ctx.busy(1500); return undefined })
    s.mock('llShout', (ctx) => { ctx.busy(1000); return undefined })
    s.start()
    if (Object.values(steps).includes('V')) linkset.attachToAvatar(linkset.owner, 1)
    linkset.advanceTime(100)
    let now = 0
    for (const [at, step] of Object.entries(steps).map(([at, step]) => [Number(at), step] as const).sort((a, b) => a[0] - b[0])) {
      linkset.advanceTime(at - now)
      now = at
      if (step === 'i') linkset.press(0, { avatar: IDOLL })
      else if (step === 'I') linkset.release(IDOLL)
      else if (step === 'f') linkset.press(0, { avatar: FIVEBOT })
      else if (step === 'F') linkset.release(FIVEBOT)
      else if (step === 'B') s.reset()
      else if (step === 'C') {
        linkset.clock.schedule(s, linkset.clock.now, 'changed', { changes: 2 })
        linkset.drainQueue()
      }
      else if (step === 'V') {
        linkset.detachFromAvatar()
        linkset.attachToAvatar(linkset.owner, 1)
      } else if (step === 'K') {
        const taken = linkset.copy()
        linkset.remove()
        seedRlvInventory(owner!, { sharedRootId: null, entries: [{ id: 'taken', kind: 'item', parentId: null, name: 'probe', object: taken, assetType: 'object' }] })
        linkset = world!.attemptAvatarRez(owner!, 'taken', { x: 1, y: 2, z: 3 }).object!
        s = linkset.allScripts()[0]!
      } else {
        const msg = { M: 'mark', P: 'spin', Q: 'spin-sleep', R: 'sleep-spin', D: 'delay', Z: 'sleep-spin-sleep', W: 'spin-long-sleep' }[step as string] ?? 'sleep'
        if (step === 'Y') s.setGlobal('spinTimer', 1)
        if (step === 'U') s.setGlobal('spinSleep', 1)
        if (step === 'X' || step === 'Y' || step === 'U') linkset.clock.schedule(s, linkset.clock.now, 'timer')
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

    it('in LSL only the first click by an avatar in another avatar\'s hold goes without touch_start', async () => {
      // In-world (Aditi, SLua Tideland, 2026-11-25): nothing slept, i doll held 4.5 s and fivebot
      // clicked for 0.3 s three times, 0.7, 1.7 and 2.7 s in -> touch_start for the second and
      // third clicks, not the first, 2 runs of 2. One click 2.5 s in -> none, 2 runs of 2.
      expect(await run('lsl', 0, 0, { 0: 'i', 700: 'f', 1000: 'F', 1700: 'f', 2000: 'F', 2700: 'f', 3000: 'F', 4500: 'I' }))
        .toBe('Si Ti Tif Ef Ti Sf Tif Ef Ti Sf Tif Ef Ti Ei')
      expect(await run('lsl', 0, 0, { 0: 'i', 2500: 'f', 2800: 'F', 4500: 'I' })).toBe('Si Ti Tif Ef Ti Ei')
      // In-world: i doll held 2.3 s, fivebot clicked 1 s in, i doll clicked again 0.5 s after
      // the release and held 3 s, and fivebot clicked 1.2 s into that hold -> no touch_start for
      // either of fivebot's clicks, 2 runs of 2.
      expect(await run('lsl', 0, 0, { 0: 'i', 1000: 'f', 1300: 'F', 2300: 'I', 2800: 'i', 4000: 'f', 4300: 'F', 5800: 'I' }))
        .toBe('Si Ti Tif Ef Ti Ei Si Ti Tif Ef Ti Ei')
      // In-world: fivebot clicked for 0.2 s 0.4 s into i doll's hold, a listen then slept 3 s and
      // fivebot clicked again 1 s into the sleep -> touch_start for the second click only, 2 runs
      // of 2.
      expect(await run('lsl', 0, 0, { 0: 'i', 400: 'f', 600: 'F', 700: 'L', 1700: 'f', 2000: 'F', 4500: 'I' }))
        .toBe('Si Ti Tif Ef Ti L Sf Tif Ef Ti Ei')
      // In-world: fivebot held 1.5 s, i doll pressed 0.5 s in and held 4 s, and fivebot clicked
      // again 1 s after its release -> no touch_start for i doll, one for fivebot's second
      // click, 2 runs of 2.
      expect(await run('lsl', 0, 0, { 0: 'f', 500: 'i', 1500: 'F', 2500: 'f', 2800: 'F', 4500: 'I' }))
        .toBe('Sf Tf Tfi Ef Ti Sf Tif Ef Ti Ei')
      // In-world: i doll held 5 s, fivebot clicked 1 s in, a second script reset the logging one
      // 2 s in and fivebot clicked again 3 s in -> the reset script logged fivebot's touch_start,
      // a touch listing fivebot alone, its touch_end and i doll's touch_end, 2 runs of 2.
      expect(await run('lsl', 0, 0, { 0: 'i', 1000: 'f', 1300: 'F', 2000: 'B', 3000: 'f', 3300: 'F', 5000: 'I' })).toBe('Sf Tf Ef Ei')
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
    expect(await run('lsl', 0, 0, { 0: 'i', 500: 'f', 700: 'F', 721: 'f', 1021: 'F', 6000: 'I' }, 3)).toBe('Si Ti Tif Ef Sf Tif Ef Ti Ei')
  })

  it('touch_start events let through a touch_end sleep merge as held ones do', async () => {
    const CAROL = { key: 'cccccccc-0000-0000-0000-000000000000', name: 'carol' }
    const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 's', source: { source: lslLog(0, 0, 3), filename: 's.lsl' } }] }] })
    const t = scripts.s!
    t.start(); linkset.advanceTime(100)
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
    u.start(); l2.linkset.advanceTime(100)
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
    expect(await run('slua', 0, 0, { 0: 'i', 300: 'X', 340: 'f', 1000: 'F', 4000: 'I' })).toBe('Si Ti X Ti Sf Ef Ti Ei')
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
      // In-world: the same in SLua -> i doll's touch, then fivebot's touch_start and touch_end,
      // 3 runs of 3.
      for (const at of [300, 320]) {
        expect(await run('lsl', 0, 0, { 0: 'i', [at]: 'P', 1000: 'f', 1300: 'F', 4000: 'I' })).toBe('Si Ti P Ti Ef Ti Ei')
        expect(await run('slua', 0, 0, { 0: 'i', [at]: 'P', 1000: 'f', 1300: 'F', 4000: 'I' })).toBe('Si Ti P Ti Sf Ef Ti Ei')
      }
    })

    it('in LSL the touch that came up in a spin stays alone through a sleep that follows it', async () => {
      // In-world (Aditi, SLua Tideland, 2026-11-24): i doll held 4 s, a listen 0.3 s in spun
      // 1.5 s and then slept 1.5 s, and fivebot held a click 1 s in until 0.4 s into the sleep ->
      // the touch after the wake listed i doll alone, 5 runs of 5, 3 of them with the listen one
      // frame after i doll's last touch.
      for (const at of [300, 320]) {
        expect(await run('lsl', 0, 0, { 0: 'i', [at]: 'Q', 1000: 'f', 2200: 'F', 4000: 'I' })).toBe('Si Ti Q Ti Ef Ti Ei')
      }
    })

    it('in LSL a sleep followed by a spin, or a function delay, follows the frame rule of a sleep', async () => {
      // In-world (Aditi, SLua Tideland, 2026-11-24): i doll held 4 s, a listen 0.3 s in slept
      // 1.5 s and then spun 1.5 s, and fivebot clicked for 0.3 s 1 s in -> the touch after the
      // handler listed fivebot too when the listen ran one frame after i doll's last touch, 3 runs
      // of 3, and i doll alone when it ran two frames after, 2 runs of 2. A listen that called
      // llInstantMessage, with its 2 s delay, in place of them -> fivebot too 4 runs of 4 a frame
      // after, i doll alone 1 run of 1 two frames after.
      for (const busy of ['R', 'D'] as const) {
        expect(await run('lsl', 0, 0, { 0: 'i', 300: busy, 1000: 'f', 1300: 'F', 4000: 'I' })).toBe(`Si Ti ${busy} Tif Ef Ti Ei`)
        expect(await run('lsl', 0, 0, { 0: 'i', 320: busy, 1000: 'f', 1300: 'F', 4000: 'I' })).toBe(`Si Ti ${busy} Ti Ef Ti Ei`)
      }
    })

    it('in LSL a click pressed while the handler spins stays out of the touch waiting from a sleep', async () => {
      // In-world (Aditi, SLua Tideland, 2026-11-24): i doll held 4 s, a listen 0.3 s in slept
      // 1.5 s and then spun 1.5 s, and fivebot clicked for 0.3 s 0.4 s into the spin -> the touch
      // after the handler listed i doll alone, 6 runs of 6: 3 with the listen one frame (0.022 s)
      // after i doll's last touch, where a click in the sleep was listed, and 3 two frames after.
      for (const at of [300, 320]) {
        expect(await run('lsl', 0, 0, { 0: 'i', [at]: 'R', 2200: 'f', 2500: 'F', 4000: 'I' })).toBe('Si Ti R Ti Ef Ti Ei')
      }
    })

    it('in LSL the touch waiting from a sleep takes no other click once the handler has spun', async () => {
      // In-world (Aditi, SLua Tideland, 2026-11-24): i doll held 4.5 s, a listen 0.3 s in slept
      // 1 s, spun 1 s and slept 1.5 s, and fivebot pressed 0.2 s into the spin and held until
      // 0.2 to 0.3 s into the second sleep -> the touch after the handler listed i doll alone,
      // 6 runs of 6, 4 of them with the listen one frame after i doll's last touch.
      // In-world: the same with fivebot clicking for 0.3 s only in the second sleep, 0.4 to 0.5 s
      // into it -> i doll alone, 6 runs of 6, 4 at the one-frame phase.
      for (const at of [300, 320]) {
        expect(await run('lsl', 0, 0, { 0: 'i', [at]: 'Z', 1600: 'f', 2600: 'F', 4500: 'I' })).toBe('Si Ti Z Ti Ef Ti Ei')
        expect(await run('lsl', 0, 0, { 0: 'i', [at]: 'Z', 2800: 'f', 3100: 'F', 4500: 'I' })).toBe('Si Ti Z Ti Ef Ti Ei')
      }
    })

    it('in LSL a second click by the same avatar, pressed while its first touch_end waits, raises touch_start and a touch of its own', async () => {
      // In-world (Aditi, SLua Tideland, 2026-11-24): the listen above, with fivebot clicking for
      // 0.2 s in the spin and again for 0.3 s in the second sleep -> i doll's touch alone,
      // fivebot's touch_end, then fivebot's touch_start, a touch listing both and fivebot's
      // touch_end, 3 runs of 3.
      // In-world (Aditi, SLua Tideland, 2026-11-25): the same, 3 runs of 3. With a listen that
      // spun 3 s and fivebot clicking twice in the spin, 1 s apart -> the same events, 3 runs of 3.
      // With a listen that slept 3 s and the same two clicks -> one touch listing both and one
      // touch_end, as the clicks merged in the sleep, 3 runs of 3.
      expect(await run('lsl', 0, 0, { 0: 'i', 300: 'Z', 1600: 'f', 1800: 'F', 2800: 'f', 3100: 'F', 4500: 'I' })).toBe('Si Ti Z Ti Ef Sf Tif Ef Ti Ei')
      expect(await run('lsl', 0, 0, { 0: 'i', 300: 'P', 1000: 'f', 1300: 'F', 2000: 'f', 2300: 'F', 4500: 'I' })).toBe('Si Ti P Ti Ef Sf Tif Ef Ti Ei')
      expect(await run('lsl', 0, 0, { 0: 'i', 300: 'L', 1000: 'f', 1300: 'F', 2000: 'f', 2300: 'F', 4500: 'I' })).toBe('Si Ti L Tif Ef Ti Ei')
      // In-world (Aditi, SLua Tideland, 2026-11-25): the sleep in SLua -> one touch_start and one
      // touch_end for fivebot and no touch of its own, 2 runs of 2.
      expect(await run('slua', 0, 0, { 0: 'i', 300: 'L', 1000: 'f', 1300: 'F', 2000: 'f', 2300: 'F', 4500: 'I' })).toBe('Si Ti L Ti Sf Ef Ti Ei')
    })

    it('in SLua the second click\'s own touch from a spin runs ahead of its touch_start', async () => {
      // In-world (Aditi, SLua Tideland, 2026-11-25): the spin above in SLua -> i doll's touch, the
      // first click's touch_start and touch_end, a touch listing both, then the second click's
      // touch_start and touch_end, 2 runs of 2. A listen that slept 1 s, spun 1 s and slept 3.5 s,
      // with fivebot clicking in the spin and again in the second sleep -> the same events, 2 runs
      // of 2.
      expect(await run('slua', 0, 0, { 0: 'i', 300: 'P', 1000: 'f', 1300: 'F', 2000: 'f', 2300: 'F', 4500: 'I' })).toBe('Si Ti P Ti Sf Ef Tif Sf Ef Ti Ei')
      expect(await run('slua', 0, 0, { 0: 'i', 300: 'Z', 1600: 'f', 1800: 'F', 2800: 'f', 3100: 'F', 4500: 'I' })).toBe('Si Ti Z Ti Sf Ef Tif Sf Ef Ti Ei')
    })

    it('in LSL a click pressed in the sleep after a spin stays out of the touch that came up in the spin', async () => {
      // In-world (Aditi, SLua Tideland, 2026-11-24): i doll held 4 s, a listen 0.3 s in spun
      // 1.5 s and then slept 1.5 s, and fivebot clicked for 0.3 s 0.5 s into the sleep -> the
      // touch after the wake listed i doll alone, 8 runs of 8, 3 of them with the listen one
      // frame after i doll's last touch.
      for (const at of [300, 320]) {
        expect(await run('lsl', 0, 0, { 0: 'i', [at]: 'Q', 2300: 'f', 2600: 'F', 4000: 'I' })).toBe('Si Ti Q Ti Ef Ti Ei')
      }
    })

    it('in LSL a timer that spins keeps a click pressed during it out of the waiting touch', async () => {
      // In-world (Aditi, SLua Tideland, 2026-11-24): i doll held 4 s, a timer 0.3 s in spun 3 s
      // and fivebot clicked for 0.3 s 0.4 to 0.5 s into the spin -> after the spin i doll's touch
      // alone, then fivebot's touch_end, 6 runs of 6: 4 with the timer one frame after i doll's
      // last touch, 2 in the frame of one.
      for (const at of [300, 320]) {
        expect(await run('lsl', 0, 0, { 0: 'i', [at]: 'Y', 1000: 'f', 1300: 'F', 4000: 'I' })).toBe('Si Ti Y Ti Ef Ti Ei')
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
    linkset.advanceTime(100)
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
    linkset.advanceTime(100)
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

  describe('a second click by the same avatar after the handler spun', () => {
    it('raises touch_start and touch_end but no touch while the first click\'s touch waits', async () => {
      // In-world (Aditi, SLua Tideland, 2026-11-25): fivebot alone clicked twice in a listen
      // handler, in its spin or the sleep after it, with the handler busy at some point after the
      // first click -> after the handler the first click's touch_start, touch and touch_end, then
      // the second click's touch_start and touch_end: LSL 3 runs of 3 with a click in the spin of
      // a sleep-spin-sleep and one in the second sleep, 2 of 2 with clicks in the first and
      // second sleeps, 2 of 2 with both in a spin, 2 of 2 with one in a sleep and one in the
      // spin after it; SLua 2 of 2 with clicks in a spin, 2 of 2 in the spin and second sleep.
      for (const lang of ['lsl', 'slua'] as const) {
        expect(await run(lang, 0, 0, { 0: 'Z', 1300: 'f', 1500: 'F', 2500: 'f', 2800: 'F' })).toBe('Z Sf Tf Ef Sf Ef')
        expect(await run(lang, 0, 0, { 0: 'P', 500: 'f', 700: 'F', 1500: 'f', 1800: 'F' })).toBe('P Sf Tf Ef Sf Ef')
      }
      expect(await run('lsl', 0, 0, { 0: 'Z', 400: 'f', 600: 'F', 2400: 'f', 2700: 'F' })).toBe('Z Sf Tf Ef Sf Ef')
      expect(await run('lsl', 0, 0, { 0: 'R', 400: 'f', 600: 'F', 1700: 'f', 2000: 'F' })).toBe('R Sf Tf Ef Sf Ef')
    })

    it('merges into the first click in a handler that only slept', async () => {
      // In-world (Aditi, SLua Tideland, 2026-11-25): fivebot alone clicked twice in a listen that
      // slept 3 s -> one touch_start, touch and touch_end, LSL 3 runs of 3, SLua 1 of 1.
      for (const lang of ['lsl', 'slua'] as const) {
        expect(await run(lang, 0, 0, { 0: 'L', 500: 'f', 700: 'F', 1500: 'f', 1800: 'F' })).toBe('L Sf Tf Ef')
      }
    })

    it('merges into the first click after the object is taken and rezzed, or detached and worn, in the sleep', async () => {
      // In-world (Aditi, SLua Tideland, 2026-11-25): fivebot alone clicked in the 1.5 s spin of a
      // listen that then slept 20 s, and again in the sleep -> the second click's touch_start and
      // touch_end of its own, 3 runs of 3. With the object taken and rezzed between the clicks ->
      // on_rez, then one touch_start, touch and touch_end, 7 runs of 8 (the other kept the second
      // click's touch_start and touch_end). Detached and worn between them -> the same, 3 runs
      // of 3.
      expect(await run('lsl', 0, 0, { 0: 'W', 500: 'f', 700: 'F', 5000: 'f', 5300: 'F' })).toBe('W Sf Tf Ef Sf Ef')
      expect(await run('lsl', 0, 0, { 0: 'W', 500: 'f', 700: 'F', 2500: 'K', 5000: 'f', 5300: 'F' })).toBe('W O Sf Tf Ef')
      expect(await run('lsl', 0, 0, { 0: 'W', 500: 'f', 700: 'F', 2500: 'V', 5000: 'f', 5300: 'F' })).toBe('W O Sf Tf Ef')
      // In-world: the same take in SLua -> on_rez, then one touch_end, touch and touch_start, in
      // that order, 2 runs of 2; with no click on the copy, the same, 2 runs of 2. Detached and
      // worn in place of the take -> the same, 2 runs of 2.
      expect(await run('slua', 0, 0, { 0: 'W', 500: 'f', 700: 'F', 2500: 'K', 5000: 'f', 5300: 'F' })).toBe('W O Ef Tf Sf')
      expect(await run('slua', 0, 0, { 0: 'W', 500: 'f', 700: 'F', 2500: 'V', 5000: 'f', 5300: 'F' })).toBe('W O Ef Tf Sf')
      expect(await run('slua', 0, 0, { 0: 'W', 500: 'f', 700: 'F', 2500: 'K' })).toBe('W O Ef Tf Sf')
      // In-world: a click in a plain sleep, then a take -> on_rez, then touch_start, touch and
      // touch_end in order, in LSL and SLua, 1 run each.
      for (const lang of ['lsl', 'slua'] as const) {
        expect(await run(lang, 0, 0, { 0: 'L', 500: 'f', 700: 'F', 1500: 'K' })).toBe('L O Sf Tf Ef')
      }
    })
  })

  it('a copy keeps a touch that came up in a spin to the first avatar, and a click held at the take stuck', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-25): i doll held a click, a listen 0.3 s in spun
    // 1.5 s and then slept 25 s, and fivebot clicked 9 s into the sleep -> i doll's touch alone,
    // fivebot's touch_end, then i doll's touch_end, 1 run. With the object taken and rezzed 3 s
    // in and fivebot's click on the copy -> on_rez, i doll's touch alone, fivebot's touch_start
    // and touch_end, and i doll's touch went on in the copy, 2 runs of 2.
    expect(await run('lsl', 0, 0, { 0: 'i', 300: 'W', 9000: 'f', 9300: 'F', 12000: 'I' })).toBe('Si Ti W Ti Ef Ti Ei')
    expect(await run('lsl', 0, 0, { 0: 'i', 300: 'W', 3300: 'K', 6000: 'f', 6300: 'F' })).toBe('Si Ti W O Ti Sf Ef Ti')
    // In-world: the take in SLua -> the same events, 1 run.
    expect(await run('slua', 0, 0, { 0: 'i', 300: 'W', 3300: 'K', 6000: 'f', 6300: 'F' })).toBe('Si Ti W O Ti Sf Ef Ti')
  })

  it('a second avatar\'s click in a spin, behind another avatar\'s, keeps its touch', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-25): a listen spun 1.5 s and slept 20 s, and
    // fivebot and then i doll clicked in the spin -> each click's touch_start, touch and
    // touch_end after the sleep, LSL 4 runs of 4 (1 of them worn by fivebot) and SLua 5 of 5
    // (2 worn).
    // With i doll holding from the spin 2.2 s into the sleep -> the same, LSL and SLua 1 run each.
    for (const lang of ['lsl', 'slua'] as const) {
      expect(await run(lang, 0, 0, { 0: 'W', 400: 'f', 600: 'F', 800: 'i', 1000: 'I', 13000: 'M' })).toBe('W Sf Tf Ef Si Ti Ei M')
      expect(await run(lang, 0, 0, { 0: 'W', 400: 'f', 600: 'F', 800: 'i', 3000: 'I', 13000: 'M' })).toBe('W Sf Tf Ef Si Ti Ei M')
    }
  })

  it('a detach and wear keeps a click that came after another in the busy part, and a click on the worn object merges into it', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-25): the clicks above on an object fivebot wore,
    // detached and worn again in the sleep -> on_rez, then each click's touch_start, touch and
    // touch_end, LSL 2 runs of 2. With fivebot clicking the worn object after -> on_rez,
    // fivebot's first click's events, then touch_start, touch and touch_end listing i doll and
    // fivebot, 2 runs of 2.
    expect(await run('lsl', 0, 0, { 0: 'W', 400: 'f', 600: 'F', 800: 'i', 1000: 'I', 2500: 'V' })).toBe('W O Sf Tf Ef Si Ti Ei')
    expect(await run('lsl', 0, 0, { 0: 'W', 400: 'f', 600: 'F', 800: 'i', 1000: 'I', 2500: 'V', 5000: 'f', 5300: 'F' })).toBe('W O Sf Tf Ef Sif Tif Eif')
    // In-world: the same in SLua -> on_rez, fivebot's touch_end, touch and touch_start, then i
    // doll's touch_end and touch_start with no touch, 3 runs of 3; worn without the detach, i
    // doll's touch ran, 2 runs of 2. With fivebot's click on the worn object -> the same with i
    // doll's two events listing fivebot too, 2 runs of 2.
    expect(await run('slua', 0, 0, { 0: 'W', 400: 'f', 600: 'F', 800: 'i', 1000: 'I', 2500: 'V' })).toBe('W O Ef Tf Sf Ei Si')
    expect(await run('slua', 0, 0, { 0: 'W', 400: 'f', 600: 'F', 800: 'i', 1000: 'I', 2500: 'V', 5000: 'f', 5300: 'F' })).toBe('W O Ef Tf Sf Eif Sif')
  })

  it('a detach and wear carries a click made in the sleep after the spin, or detached in the spin itself, the same way', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-25): fivebot clicked in the spin and i doll in the
    // sleep after it, and the object was detached and worn later in the sleep -> on_rez, then
    // fivebot's and i doll's events apart, LSL `Sf Tf Ef Si Ti Ei` and SLua `Ef Tf Sf Ei Si`,
    // 2 runs of 2 each. Both clicks in a 3 s spin and the detach in the spin too -> the same,
    // LSL and SLua 1 run each.
    expect(await run('lsl', 0, 0, { 0: 'W', 400: 'f', 600: 'F', 3000: 'i', 3200: 'I', 4500: 'V' })).toBe('W O Sf Tf Ef Si Ti Ei')
    expect(await run('slua', 0, 0, { 0: 'W', 400: 'f', 600: 'F', 3000: 'i', 3200: 'I', 4500: 'V' })).toBe('W O Ef Tf Sf Ei Si')
    expect(await run('lsl', 0, 0, { 0: 'W', 400: 'f', 600: 'F', 800: 'i', 1000: 'I', 1200: 'V', 13000: 'M' })).toBe('W O Sf Tf Ef Si Ti Ei M')
    expect(await run('slua', 0, 0, { 0: 'W', 400: 'f', 600: 'F', 800: 'i', 1000: 'I', 1200: 'V', 13000: 'M' })).toBe('W O Ef Tf Sf Ei Si M')
    // In-world: the click in the sleep, then a take and rez in place of the detach -> the same
    // events, LSL and SLua 2 runs of 2 each.
    expect(await run('lsl', 0, 0, { 0: 'W', 400: 'f', 600: 'F', 3000: 'i', 3200: 'I', 4500: 'K' })).toBe('W O Sf Tf Ef Si Ti Ei')
    expect(await run('slua', 0, 0, { 0: 'W', 400: 'f', 600: 'F', 3000: 'i', 3200: 'I', 4500: 'K' })).toBe('W O Ef Tf Sf Ei Si')
  })

  it('in SLua a detach and wear runs each carried run of touch events up to a touch_end last to first', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-25): i doll held a click on an object fivebot wore,
    // a listen spun 1.5 s and slept 15 s, fivebot clicked twice in the spin, and the object was
    // detached and worn in the sleep -> in LSL on_rez, i doll's touch, fivebot's first touch_end,
    // its second click's touch_start, a touch listing both and touch_end, then i doll's touch
    // went on, 1 run; in SLua on_rez, fivebot's first touch_end and touch_start, i doll's touch,
    // fivebot's second touch_end and touch_start, with no touch listing both, 2 runs of 2.
    expect(await run('lsl', 0, 0, { 0: 'i', 300: 'W', 900: 'f', 1100: 'F', 1400: 'f', 1600: 'F', 5000: 'V', 13000: 'M' })).toBe('Si Ti W O Ti Ef Sf Tif Ef Ti M Ti')
    expect(await run('slua', 0, 0, { 0: 'i', 300: 'W', 900: 'f', 1100: 'F', 1400: 'f', 1600: 'F', 5000: 'V', 13000: 'M' })).toBe('Si Ti W O Ef Sf Ti Ef Sf Ti M Ti')
  })

  it('a detach and wear runs a held-back click behind a tick held in the sleep, in LSL', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-25): fivebot and then i doll clicked in a listen's
    // spin, the object was detached and worn in the sleep, and a timer fell due after the wear
    // -> on_rez, fivebot's touch_start, touch and touch_end, the timer, then i doll's, LSL 2 runs
    // of 2.
    expect(await run('lsl', 0, 0, { 0: 'W', 400: 'f', 600: 'F', 800: 'i', 1000: 'I', 2500: 'V', 3000: 'X', 16000: 'M' })).toBe('W O Sf Tf Ef X Si Ti Ei M')
  })

  it('in SLua a detach and wear splits the carried touch events where the spin gave way to the sleep', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-25): i doll pressed in a listen's spin and let go in
    // the sleep, fivebot clicked in the sleep, and the object was detached and worn later in it
    // -> on_rez, i doll's touch and touch_start, then one touch_end listing both and fivebot's
    // touch_start, SLua 2 runs of 2; with the avatars swapped, the same, 1 run. LSL kept the
    // order: i doll's touch_start and touch, then the touch_end listing both, 1 run. The order of
    // the avatars in that touch_end is pinned below.
    const either = (got: string) => got.replace(/E(if|fi)/, 'E**')
    expect(either(await run('slua', 0, 0, { 0: 'W', 400: 'i', 3000: 'f', 3200: 'F', 3500: 'I', 4500: 'V', 13000: 'M' }))).toBe('W O Ti Si E** Sf M')
    expect(either(await run('slua', 0, 0, { 0: 'W', 400: 'f', 3000: 'i', 3200: 'I', 3500: 'F', 4500: 'V', 13000: 'M' }))).toBe('W O Tf Sf E** Si M')
    expect(either(await run('lsl', 0, 0, { 0: 'W', 400: 'i', 3000: 'f', 3200: 'F', 3500: 'I', 4500: 'V', 13000: 'M' }))).toBe('W O Si Ti E** M')
  })

  it('a detach and wear keeps a touch_end listing first the avatar that pressed in the spin', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-25): the runs above -> the touch_end listed the
    // avatar holding from the spin first, though the other let go first, LSL and SLua 4 runs of 4,
    // as without the detach (below).
    expect(await run('slua', 0, 0, { 0: 'W', 400: 'i', 3000: 'f', 3200: 'F', 3500: 'I', 4500: 'V', 13000: 'M' })).toBe('W O Ti Si Eif Sf M')
    expect(await run('lsl', 0, 0, { 0: 'W', 400: 'i', 3000: 'f', 3200: 'F', 3500: 'I', 4500: 'V', 13000: 'M' })).toBe('W O Si Ti Eif M')
  })

  it('a detach and wear carries one avatar\'s clicks from the spin and the sleep as two clicks', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-25): i doll alone clicked in a listen's spin and
    // again in the sleep, and the object was detached and worn later in the sleep -> on_rez, the
    // first click's touch_start, touch and touch_end, then the second's touch_start and
    // touch_end; SLua ran each click last to first, 1 run each.
    expect(await run('lsl', 0, 0, { 0: 'W', 400: 'i', 600: 'I', 3000: 'i', 3200: 'I', 4500: 'V', 13000: 'M' })).toBe('W O Si Ti Ei Si Ei M')
    expect(await run('slua', 0, 0, { 0: 'W', 400: 'i', 600: 'I', 3000: 'i', 3200: 'I', 4500: 'V', 13000: 'M' })).toBe('W O Ei Ti Si Ei Si M')
  })

  it('a detach and wear carries a click from before the spin, which takes in no later click', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-25): i doll clicked in a listen's 3 s sleep, a
    // second listen that spun and slept came next, the object was detached and worn in its
    // sleep, and fivebot clicked the worn object -> on_rez, i doll's touch_start, touch and
    // touch_end, then fivebot's; SLua ran i doll's last to first, then fivebot's touch_end and
    // touch_start with no touch, 1 run each.
    expect(await run('lsl', 0, 0, { 0: 'L', 500: 'W', 1000: 'i', 1200: 'I', 6000: 'V', 9000: 'f', 9200: 'F', 20000: 'M' })).toBe('L W O Si Ti Ei Sf Tf Ef M')
    expect(await run('slua', 0, 0, { 0: 'L', 500: 'W', 1000: 'i', 1200: 'I', 6000: 'V', 9000: 'f', 9200: 'F', 20000: 'M' })).toMatch(/^L W O Ei Ti Si /)
    // In-world: i doll clicked in the first sleep of a listen that slept 1 s, spun 1 s and slept
    // 12 s, and the object was detached and worn in the second sleep -> on_rez and the click in
    // order in LSL, last to first in SLua, 1 run each.
    expect(await run('lsl', 0, 0, { 0: 'Z', 300: 'i', 500: 'I', 2800: 'V' })).toBe('Z O Si Ti Ei')
    expect(await run('slua', 0, 0, { 0: 'Z', 300: 'i', 500: 'I', 2800: 'V' })).toBe('Z O Ei Ti Si')
  })

  it('in SLua a click on the worn object after a carried click from before the spin runs last to first', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-25): the SLua run above -> fivebot's touch_end, then
    // its touch_start, with no touch, 11 runs of 11. A click on the copy or the worn object that
    // merged into a click carried from the spin, or came while a click was stuck, ran in order.
    expect(await run('slua', 0, 0, { 0: 'L', 500: 'W', 1000: 'i', 1200: 'I', 6000: 'V', 9000: 'f', 9200: 'F', 20000: 'M' })).toBe('L W O Ei Ti Si Ef Sf M')
    // In-world: i doll clicked the worn object in place of fivebot -> its second click's
    // touch_end, then touch_start, 2 runs of 2.
    expect(await run('slua', 0, 0, { 0: 'L', 500: 'W', 1000: 'i', 1200: 'I', 6000: 'V', 9000: 'i', 9200: 'I', 20000: 'M' })).toBe('L W O Ei Ti Si Ei Si M')
  })

  it('a click on the worn object lists each avatar in its merged touch and touch_end by its last click', async () => {
    // As in other merges: i doll clicked again after fivebot, so the touch_end lists fivebot first.
    expect(await run('lsl', 0, 0, { 0: 'W', 400: 'f', 600: 'F', 800: 'i', 1000: 'I', 2500: 'V', 5000: 'f', 5200: 'F', 6000: 'i', 6200: 'I' })).toBe('W O Sf Tf Ef Sif Tfi Efi')
  })

  it('a second avatar\'s click only in the sleep after a spin keeps its touch', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-25): a listen spun 1.5 s and slept 20 s, i doll
    // clicked in the spin and fivebot in the sleep -> each click's touch_start, touch and
    // touch_end after the sleep, LSL and SLua 2 runs of 2 each.
    for (const lang of ['lsl', 'slua'] as const) {
      expect(await run(lang, 0, 0, { 0: 'W', 400: 'i', 600: 'I', 3000: 'f', 3200: 'F', 13000: 'M' })).toBe('W Si Ti Ei Sf Tf Ef M')
    }
  })

  it('a reset forgets a click left stuck by a detach and wear', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-25): i doll held a click through a detach and wear
    // in the sleep after a spin, and the script was reset after the handler ended -> no more
    // touch events for i doll, and fivebot's next click raised touch_start, touch and touch_end
    // for fivebot alone, LSL 2 runs of 2.
    expect(await run('lsl', 0, 0, { 0: 'i', 300: 'W', 3300: 'V', 4000: 'I', 12500: 'B', 14000: 'f', 14300: 'F' })).toBe('Sf Tf Ef')
  })

  it('a detach and wear keeps a touch that came up in a spin to the avatar holding the click, and leaves the click stuck', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-25): i doll held a click on an object fivebot wore,
    // a listen 0.3 s in spun 1.5 s and then slept 25 s, the object was detached and worn again
    // 3 s in, and fivebot clicked the worn object -> on_rez, i doll's touch alone, then
    // fivebot's touch_start and touch_end, and no touch_end for i doll's release, LSL and SLua
    // 2 runs of 2 each, as with a take.
    for (const lang of ['lsl', 'slua'] as const) {
      expect(await run(lang, 0, 0, { 0: 'i', 300: 'W', 3300: 'V', 6000: 'f', 6300: 'F', 9000: 'I' })).toBe('Si Ti W O Ti Sf Ef Ti')
    }
    // In-world: the listen slept 6 s and fivebot clicked after it ended -> on_rez, i doll's touch,
    // fivebot's touch_start, a touch listing both and fivebot's touch_end, then i doll's touch
    // went on, 22 a second in LSL and 45 in SLua, 14 s past the release, LSL 2 runs of 2 and
    // SLua 1 run.
    for (const lang of ['lsl', 'slua'] as const) {
      expect(await run(lang, 0, 0, { 0: 'i', 300: 'W', 3300: 'V', 13000: 'f', 13300: 'F', 14000: 'I', 18000: 'M' })).toBe('Si Ti W O Ti Sf Tif Ef Ti M Ti')
    }
  })

  it('a take loses a click that came after another in the busy part', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-25): the clicks above, taken and rezzed in the
    // sleep -> on_rez and fivebot's events only, with or without a fivebot click on the copy,
    // LSL and SLua 2 runs of 2 each. i doll clicking alone in the spin -> its events after on_rez,
    // 1 run.
    expect(await run('lsl', 0, 0, { 0: 'W', 400: 'f', 600: 'F', 800: 'i', 1000: 'I', 2500: 'K' })).toBe('W O Sf Tf Ef')
    expect(await run('lsl', 0, 0, { 0: 'W', 400: 'f', 600: 'F', 800: 'i', 1000: 'I', 2500: 'K', 5000: 'f', 5300: 'F' })).toBe('W O Sf Tf Ef')
    expect(await run('slua', 0, 0, { 0: 'W', 400: 'f', 600: 'F', 800: 'i', 1000: 'I', 2500: 'K' })).toBe('W O Ef Tf Sf')
    expect(await run('slua', 0, 0, { 0: 'W', 400: 'f', 600: 'F', 800: 'i', 1000: 'I', 2500: 'K', 5000: 'f', 5300: 'F' })).toBe('W O Ef Tf Sf')
    expect(await run('lsl', 0, 0, { 0: 'W', 800: 'i', 1000: 'I', 2500: 'K' })).toBe('W O Si Ti Ei')
  })

  describe('the avatars a touch_end lists when two releases merged into it', () => {
    // In-world (Aditi, SLua Tideland, 2026-11-25): two avatars clicked an object whose listen spun
    // 1.5 s and then slept, or only slept, and both let go in the sleep. The touch_end both
    // releases merged into listed first, in the order they pressed, the avatars that pressed in
    // the spin, then the others in the order they let go. LSL and SLua the same.
    it('lists an avatar that pressed in the spin ahead of one that let go first', async () => {
      // In-world: i doll pressed in the spin, fivebot clicked in the sleep, and i doll let go after
      // fivebot -> touch_end listing i doll and then fivebot, LSL and SLua 2 runs of 2 each; with
      // the avatars swapped, fivebot first, 1 run each. SLua ran fivebot's own touch_start last.
      expect(await run('lsl', 0, 0, { 0: 'W', 300: 'i', 2900: 'f', 3100: 'F', 3400: 'I', 13000: 'M' })).toBe('W Si Ti Eif M')
      expect(await run('slua', 0, 0, { 0: 'W', 300: 'i', 2900: 'f', 3100: 'F', 3400: 'I', 13000: 'M' })).toBe('W Si Ti Eif Sf M')
      expect(await run('lsl', 0, 0, { 0: 'W', 300: 'f', 2900: 'i', 3100: 'I', 3400: 'F', 13000: 'M' })).toBe('W Sf Tf Efi M')
      expect(await run('slua', 0, 0, { 0: 'W', 300: 'f', 2900: 'i', 3100: 'I', 3400: 'F', 13000: 'M' })).toBe('W Sf Tf Efi Si M')
      // In-world: i doll let go first instead -> the same events, 1 run each.
      expect(await run('lsl', 0, 0, { 0: 'W', 300: 'i', 2400: 'f', 3100: 'I', 3400: 'F', 13000: 'M' })).toBe('W Si Ti Eif M')
      expect(await run('slua', 0, 0, { 0: 'W', 300: 'i', 2400: 'f', 3100: 'I', 3400: 'F', 13000: 'M' })).toBe('W Si Ti Eif Sf M')
    })

    it('lists two avatars that pressed in the spin in the order they pressed', async () => {
      // In-world: i doll and then fivebot pressed in the spin, and fivebot let go first in the
      // sleep -> touch_end listing i doll and then fivebot, LSL and SLua 1 run each.
      expect(await run('lsl', 0, 0, { 0: 'W', 200: 'i', 600: 'f', 3100: 'F', 3400: 'I', 13000: 'M' })).toBe('W Si Ti Eif M')
      expect(await run('slua', 0, 0, { 0: 'W', 200: 'i', 600: 'f', 3100: 'F', 3400: 'I', 13000: 'M' })).toBe('W Si Ti Eif Sf M')
    })

    it('lists the avatars in the order they let go when neither pressed in a spin, or only the one who let go first did', async () => {
      // In-world: a listen slept 6 s, i doll pressed, fivebot clicked, and i doll let go last ->
      // touch_end listing fivebot and then i doll, LSL and SLua 1 run each.
      expect(await run('lsl', 0, 0, { 0: 'L', 300: 'i', 1000: 'f', 1200: 'F', 2500: 'I', 13000: 'M' })).toBe('L Si Tif Efi M')
      expect(await run('slua', 0, 0, { 0: 'L', 300: 'i', 1000: 'f', 1200: 'F', 2500: 'I', 13000: 'M' })).toBe('L Sif Tif Efi M')
      // In-world: i doll clicked, fivebot pressed, i doll clicked again, and fivebot let go last ->
      // touch_end listing i doll and then fivebot, LSL and SLua 1 run each.
      for (const lang of ['lsl', 'slua'] as const) {
        expect(await run(lang, 0, 0, { 0: 'L', 200: 'i', 300: 'I', 600: 'f', 1200: 'i', 1300: 'I', 2700: 'F', 13000: 'M' })).toBe('L Sif Tfi Eif M')
      }
      // In-world: i doll pressed in the first sleep of a listen that slept 1 s, spun 1 s and slept
      // 10 s, fivebot pressed in the spin, and fivebot let go first -> touch_end listing fivebot and
      // then i doll, LSL and SLua 1 run each.
      expect(await run('lsl', 0, 0, { 0: 'Z', 200: 'i', 1300: 'f', 2500: 'F', 3000: 'I', 13000: 'M' })).toBe('Z Si Ti Efi M')
      expect(await run('slua', 0, 0, { 0: 'Z', 200: 'i', 1300: 'f', 2500: 'F', 3000: 'I', 13000: 'M' })).toBe('Z Si Ti Efi Sf M')
    })

    it('counts only a press in the spin of the handler the releases came in', async () => {
      // In-world: i doll pressed in a listen's 3 s spin and held on, a timer that slept 3 s ran
      // after it, fivebot clicked in that sleep and i doll let go last -> touch_end listing
      // fivebot and then i doll, LSL and SLua 2 runs of 2 each. In LSL fivebot joined i doll's
      // touch, and in SLua fivebot's touch_start ran ahead of the touch_end.
      expect(await run('lsl', 0, 0, { 0: 'P', 300: 'i', 3100: 'X', 3900: 'f', 4100: 'F', 4600: 'I', 13000: 'M' })).toBe('P Si Ti X Tif Efi M')
      expect(await run('slua', 0, 0, { 0: 'P', 300: 'i', 3100: 'X', 3900: 'f', 4100: 'F', 4600: 'I', 13000: 'M' })).toBe('P Si Ti X Ti Sf Efi M')
    })

    it('follows a timer that spins and then sleeps as it does a listen', async () => {
      // In-world: an LLTimers:once callback spun 1.5 s and slept 10 s, i doll pressed in the spin
      // and fivebot clicked in the sleep -> as with the listen, SLua 2 runs of 2.
      expect(await run('slua', 0, 0, { 0: 'U', 400: 'i', 2900: 'f', 3100: 'F', 3400: 'I', 13000: 'M' })).toBe('U Si Ti Eif Sf M')
    })
  })

  it('a detach and wear runs a held-back click behind a tick or a change held in the sleep', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-25): fivebot and then i doll clicked in a listen's
    // spin, the object was detached and worn in the sleep, and a timer fell due before the detach
    // -> on_rez, fivebot's events, the timer, then i doll's, LSL 1 run; in SLua, with an
    // LLTimers:once timer, each click's events last to first, 1 run, and with the timer due after
    // the wear, the same, 2 runs of 2.
    expect(await run('lsl', 0, 0, { 0: 'W', 400: 'f', 600: 'F', 800: 'i', 1000: 'I', 2300: 'X', 3800: 'V', 16000: 'M' })).toBe('W O Sf Tf Ef X Si Ti Ei M')
    expect(await run('slua', 0, 0, { 0: 'W', 400: 'f', 600: 'F', 800: 'i', 1000: 'I', 2300: 'X', 3800: 'V', 16000: 'M' })).toBe('W O Ef Tf Sf X Ei Si M')
    expect(await run('slua', 0, 0, { 0: 'W', 400: 'f', 600: 'F', 800: 'i', 1000: 'I', 2500: 'V', 3000: 'X', 16000: 'M' })).toBe('W O Ef Tf Sf X Ei Si M')
    // In-world: a change of colour in place of the timer, before the detach or after the wear ->
    // the change in the same place, LSL and SLua 1 run each.
    for (const steps of [{ 2300: 'C', 3800: 'V' }, { 2500: 'V', 8500: 'C' }] as const) {
      expect(await run('lsl', 0, 0, { 0: 'W', 400: 'f', 600: 'F', 800: 'i', 1000: 'I', ...steps, 16000: 'M' })).toBe('W O Sf Tf Ef C Si Ti Ei M')
      expect(await run('slua', 0, 0, { 0: 'W', 400: 'f', 600: 'F', 800: 'i', 1000: 'I', ...steps, 16000: 'M' })).toBe('W O Ef Tf Sf C Ei Si M')
    }
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
    linkset.advanceTime(100)
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
    linkset.advanceTime(100)
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
