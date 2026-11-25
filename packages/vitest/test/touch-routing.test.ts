import { describe, it, expect } from 'vitest'
import { loadLinkset, type ScriptInput } from '../src/index.js'

// In-world: Aditi, Mono. The 4-prim routing table was measured in Dore
// (2026-10-30, see #148); the handler, pass-value, stopped-script and
// lone-prim cases in SLua Tideland (2026-10-31) with a 7-prim linkset whose
// scripts llSay what they received, each prim clicked on face 0.

const SIM_FRAME_MS = 1000 / 45

const ALICE = { key: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Alice Resident' }

const recorder = (events: ReadonlyArray<string> = ['touch_start', 'touch', 'touch_end'], entry = '') => `
  list got = [];
  default {
    state_entry() { ${entry} }
    ${events
      .map(
        (e) => `${e}(integer n) {
          got += ["${e}|" + (string)n + "|" + (string)llDetectedLinkNumber(0) + "|"
            + (string)llDetectedTouchFace(0) + "|" + llDetectedName(0) + "|" + (string)llDetectedKey(0)];
        }`,
      )
      .join('\n')}
  }
`

const script = (name: string, source: string): ScriptInput => ({ name, source: { source, filename: `${name}.lsl` } })

async function setup(prims: ReadonlyArray<ReadonlyArray<ScriptInput>>) {
  const loaded = await loadLinkset({ prims: prims.map((scripts) => ({ scripts })) })
  for (const s of Object.values(loaded.scripts)) s.start()
  const got = (name: string) => loaded.scripts[name]!.global('got')
  return { ...loaded, got }
}

const click = (link: number, face = 0) =>
  ['touch_start', 'touch', 'touch_end'].map((e) => `${e}|1|${link}|${face}|${ALICE.name}|${ALICE.key}`)

describe('linkset.touch routes a click like Second Life', () => {
  it('a click on the root reaches only the root', async () => {
    const { linkset, got } = await setup([[script('root', recorder())], [script('child', recorder())]])
    linkset.touch(1, { avatar: ALICE })
    expect(got('root')).toEqual(click(1))
    expect(got('child')).toEqual([])
  })

  it('a click on a child with touch handlers reaches every script there and not the root', async () => {
    // In-world: link 2 with two touch scripts; both got it, the root got nothing.
    const { linkset, got } = await setup([
      [script('root', recorder())],
      [script('a', recorder()), script('b', recorder())],
    ])
    linkset.touch(2, { avatar: ALICE, face: 3 })
    expect(got('a')).toEqual(click(2, 3))
    expect(got('b')).toEqual(click(2, 3))
    expect(got('root')).toEqual([])
  })

  it('a click on a child with no touch handler, or no scripts, passes to the root', async () => {
    // In-world: links 3 (script without touch handlers) and 4 (no scripts) both reached the root.
    const { linkset, got } = await setup([
      [script('root', recorder())],
      [script('quiet', 'default { state_entry() { } }')],
      [],
    ])
    linkset.touch(2, { avatar: ALICE })
    linkset.touch(3, { avatar: ALICE })
    expect(got('root')).toEqual([...click(2), ...click(3)])
  })

  it.each([
    ['touch', ['touch']],
    ['touch_end', ['touch_end']],
  ])('a script with only a %s handler keeps the click from the root', async (_, events) => {
    // In-world: link 2 with only touch() said "L2 touch", link 3 with only
    // touch_end() said "L3 end"; the root heard none of touch_start, touch or touch_end.
    const { linkset, got } = await setup([[script('root', recorder())], [script('child', recorder(events))]])
    linkset.touch(2, { avatar: ALICE })
    expect(got('child')).toEqual(click(2).filter((e) => e.startsWith(`${events[0]}|`)))
    expect(got('root')).toEqual([])
  })

  it('PASS_ALWAYS also passes a handled click to the root', async () => {
    const { linkset, got } = await setup([
      [script('root', recorder())],
      [script('child', recorder(undefined, 'llPassTouches(PASS_ALWAYS);'))],
    ])
    linkset.touch(2, { avatar: ALICE })
    expect(got('child')).toEqual(click(2))
    expect(got('root')).toEqual(click(2))
  })

  it('PASS_NEVER keeps the click in the child, even with no handler there', async () => {
    const { linkset, got } = await setup([
      [script('root', recorder())],
      [script('child', recorder(undefined, 'llPassTouches(PASS_NEVER);'))],
      [script('quiet', 'default { state_entry() { llPassTouches(PASS_NEVER); } }')],
    ])
    linkset.touch(2, { avatar: ALICE })
    linkset.touch(3, { avatar: ALICE })
    expect(got('child')).toEqual(click(2))
    expect(got('root')).toEqual([])
  })

  it.each([
    ['PASS_IF_NOT_HANDLED', 'PASS_ALWAYS', 'PASS_NEVER'],
    ['3', '1', '2'],
    ['-1', '1', '2'],
  ])('llPassTouches(%s) restores the default', async (value, always, never) => {
    // In-world: PASS_ALWAYS then PASS_IF_NOT_HANDLED on a handled prim kept the
    // click there; PASS_NEVER then PASS_IF_NOT_HANDLED on an unhandled prim
    // passed it to the root. 3 and -1 did the same after 1 or 2.
    const { linkset, got } = await setup([
      [script('root', recorder())],
      [script('child', recorder(undefined, `llPassTouches(${always}); llPassTouches(${value});`))],
      [script('quiet', `default { state_entry() { llPassTouches(${never}); llPassTouches(${value}); } }`)],
    ])
    linkset.touch(2, { avatar: ALICE })
    linkset.touch(3, { avatar: ALICE })
    expect(got('child')).toEqual(click(2))
    expect(got('root')).toEqual(click(3))
  })

  it('a stopped script does not count as handling the click and never sees it', async () => {
    // In-world: link 6's only touch script was not running; the root got the
    // click, and starting the script afterwards replayed nothing.
    const starter = `default { link_message(integer s, integer n, string m, key k) { llSetScriptState("stopped", n); } }`
    const { linkset, scripts, got } = await setup([
      [script('root', recorder())],
      [script('stopped', recorder()), script('starter', starter)],
    ])
    const setRunning = (on: boolean) => linkset.deliverLinkMessage(1, 2, on ? 1 : 0, '', '')
    setRunning(false)
    linkset.advanceTime(0)
    linkset.touch(2, { avatar: ALICE })
    setRunning(true)
    linkset.advanceTime(0)
    expect(scripts['stopped']!.running).toBe(true)
    expect(got('root')).toEqual(click(2))
    expect(got('stopped')).toEqual([])
  })

  it('handlers only count in the state the script is in', async () => {
    // In-world: link 7's script had touch_start in default but sat in a state
    // without touch handlers; the root got the click.
    const other = `
      list got = [];
      default { state_entry() { state idle; } touch_start(integer n) { got += ["default"]; } }
      state idle { state_entry() { } }
    `
    const { linkset, got } = await setup([[script('root', recorder())], [script('other', other)]])
    linkset.touch(2, { avatar: ALICE })
    expect(got('root')).toEqual(click(2))
    expect(got('other')).toEqual([])
  })

  it('a lone prim is touched as link 0 or 1 and reports link number 0', async () => {
    // In-world: an unlinked prim's touch_start saw llDetectedLinkNumber(0) = 0.
    const { linkset, got } = await setup([[script('lone', recorder(['touch_start']))]])
    linkset.touch(0, { avatar: ALICE })
    linkset.touch(1, { avatar: ALICE })
    expect(got('lone')).toEqual([click(0)[0], click(0)[0]])
  })

  it('defaults to face 0 and the owner as the toucher', async () => {
    const owner = '11111111-2222-3333-4444-555555555555'
    const loaded = await loadLinkset({ owner, prims: [{ scripts: [script('s', recorder(['touch_start']))] }] })
    loaded.scripts['s']!.start()
    loaded.linkset.touch(0)
    expect(loaded.scripts['s']!.global('got')).toEqual([`touch_start|1|0|0||${owner}`])
  })

  it('hold delays touch_end, and lets the clock run in between', async () => {
    const timed = `
      list got = [];
      default {
        touch_start(integer n) { got += ["start@" + (string)llGetTime()]; llSetTimerEvent(0.1); }
        timer() { got += ["timer@" + (string)llGetTime()]; llSetTimerEvent(0); }
        touch_end(integer n) { got += ["end@" + (string)llGetTime()]; }
      }
    `
    const { linkset, got } = await setup([[script('s', timed)]])
    linkset.touch(0, { hold: 1500 })
    // The 0.1 s tick runs on the first simulator frame after it falls due.
    expect(got('s')).toEqual(['start@0.000000', 'timer@0.111111', 'end@1.500000'])
  })

  it('hold counts from the click, not from when the touch_start handler finishes', async () => {
    const sleepy = `
      list got = [];
      default {
        touch_start(integer n) { llResetTime(); llSleep(2.0); }
        touch_end(integer n) { got += [llGetTime()]; }
      }
    `
    const { linkset, got } = await setup([[script('s', sleepy)]])
    linkset.touch(0, { hold: 1000 })
    expect(got('s')).toEqual([Math.fround(2 + SIM_FRAME_MS / 1000)])
  })

  const selfStopping = (stopIn: string) => `
    list got = [];
    default {
      touch_start(integer n) { got += ["start"]; ${stopIn === 'touch_start' ? 'llSetScriptState(llGetScriptName(), FALSE);' : 'llSetTimerEvent(0.5);'} }
      timer() { llSetTimerEvent(0); llSetScriptState(llGetScriptName(), FALSE); }
      touch(integer n) { got += ["touch"]; }
      touch_end(integer n) { got += ["end"]; }
    }
  `
  const restarter = `default { link_message(integer s, integer n, string m, key k) { llSetScriptState("s", TRUE); } }`

  it('a script that stops itself in touch_start still gets the rest of a click once restarted', async () => {
    // In-world: touch_start called llSetScriptState(llGetScriptName(), FALSE);
    // after another script restarted it, it said "touch" then "end".
    const { linkset, got } = await setup([[script('s', selfStopping('touch_start')), script('r', restarter)]])
    linkset.touch(0)
    expect(got('s')).toEqual(['start'])
    linkset.deliverLinkMessage(0, 0, 0, '', '')
    linkset.advanceTime(100)
    expect(got('s')).toEqual(['start', 'touch', 'end'])
  })

  it('a script stopped through the release keeps getting touch once restarted, until the next click ends it', async () => {
    // In-world: a script stopped 0.5 s into a 2 s hold and restarted 4 s later got no
    // touch_end. From the restart it got touch 22 times a second, still 746 times after
    // 30 s. The same avatar's next click raised no touch_start, only touch_end, and the
    // touch events stopped; the click after that was a normal click with one touch.
    const counting = `
      list got = [];
      integer n;
      default {
        touch_start(integer k) { got += ["start"]; }
        touch(integer k) { ++n; }
        touch_end(integer k) { got += ["end", n]; n = 0; }
        link_message(integer s, integer k, string m, key id) { got += ["touches", n]; n = 0; }
      }
    `
    const stopper = `
      integer done;
      default {
        touch_start(integer n) { if (!done) llSetTimerEvent(0.5); done = TRUE; }
        timer() { llSetTimerEvent(0); llSetScriptState("s", FALSE); }
        link_message(integer s, integer n, string m, key k) { if (m == "go") llSetScriptState("s", TRUE); }
      }
    `
    const { linkset, got } = await setup([[script('s', counting), script('c', stopper)]])
    linkset.touch(0, { hold: 2000 })
    expect(got('s')).toEqual(['start'])
    linkset.advanceTime(2000)
    linkset.deliverLinkMessage(0, 0, 0, 'go', '')
    linkset.advanceTime(1000)
    linkset.deliverLinkMessage(0, 0, 0, '', '')
    linkset.advanceTime(SIM_FRAME_MS)
    // 11 touch events before the stop, then 23 in the second after the restart: the first
    // 0.022 s after it, then every 0.044 s.
    expect(got('s')).toEqual(['start', 'touches', 34])
    linkset.touch(0)
    linkset.touch(0)
    expect(got('s')).toEqual(['start', 'touches', 34, 'end', 1, 'start', 'end', 1])
    linkset.advanceTime(1000)
    linkset.deliverLinkMessage(0, 0, 0, '', '')
    linkset.advanceTime(0)
    expect(got('s').slice(-2)).toEqual(['touches', 0])
  })

  it('a script stopped and restarted during a hold gets touch again and the release', async () => {
    // In-world: stopped 0.5 s into a 4 s hold, restarted 1.1 s later -> 11 touch events
    // before the stop, none while stopped, the next one 0.022 s after the restart, then
    // touch_end at the release. The stopper's 0.5 s and 1.1 s ticks each run on the frame after
    // they fall due, so the restart comes at 1.622 s.
    const log = `
      list got = [];
      default {
        touch_start(integer k) { got += ["start"]; }
        touch(integer k) { got += llRound(llGetTime() * 1000); }
        touch_end(integer k) { got += ["end", llRound(llGetTime() * 1000)]; }
      }
    `
    const stopper = `
      integer step;
      default {
        touch_start(integer n) { llSetTimerEvent(0.5); }
        timer() { llSetScriptState("s", step); step = !step; if (step == 0) llSetTimerEvent(0); else llSetTimerEvent(1.1); }
      }
    `
    const { linkset, got } = await setup([[script('s', log), script('c', stopper)]])
    linkset.touch(0, { hold: 4000 })
    const times = got('s').filter((x): x is number => typeof x === 'number')
    expect(times.filter((t) => t < 500)).toHaveLength(11)
    expect(times.filter((t) => t > 500 && t < 1600)).toEqual([])
    expect(times.find((t) => t >= 1600)).toBe(1644)
    // The restart's frame puts a touch in the frame of the release here, so touch_end comes a
    // frame after it, within the frame of the release that was measured.
    expect(got('s').slice(-2)).toEqual(['end', 4022])
  })

  it('a held click raises touch every two simulator frames', async () => {
    // In-world: held 1.5 s, touch came 0.022 s after touch_start and then every 0.044 s,
    // 34 in all, and touch_end 1.511 s after touch_start (one frame past the release). Held
    // 1.0 s with no surface point: 24 touch events.
    const log = `
      list got = [];
      default {
        touch(integer k) { got += llGetTime(); }
        touch_end(integer k) { got += ["end", llGetTime()]; }
      }
    `
    const { linkset, got } = await setup([[script('s', log)]])
    linkset.touch(0, { hold: 1500 })
    const times = got('s').slice(0, -2) as number[]
    expect(times).toHaveLength(34)
    expect(times[0]).toBeCloseTo(0.022, 3)
    expect(times.slice(1).map((t, i) => Math.round((t - times[i]!) * 1000))).toEqual(Array(33).fill(44))
    expect(got('s').slice(-2)).toEqual(['end', Math.fround(68 * SIM_FRAME_MS / 1000)])
  })

  it('under llMinEventDelay a held click raises touch once per delay, on its own beat', async () => {
    // In-world: llMinEventDelay(1.0) and a 4 s hold -> touch at 0.022, 1.000, 2.022, 3.044
    // and 4.044 after touch_start, and touch_end at 4.067 right behind the last one. With a 0.1 s timer
    // as well: timer at 0.978, 2.000, 3.000 and touch at 0.022, 1.000, 2.022, 3.023 -- the
    // touch events kept a second apart from each other, not from the timer.
    const log = `
      list got = [];
      default {
        state_entry() { llMinEventDelay(1.0); }
        touch_start(integer k) { llResetTime(); got += ["start"]; }
        touch(integer k) { got += llRound(llGetTime() * 1000); }
        touch_end(integer k) { got += ["end", llRound(llGetTime() * 1000)]; }
      }
    `
    const { linkset, got } = await setup([[script('s', log)]])
    linkset.advanceTime(2000)
    linkset.touch(0, { hold: 4000 })
    // A touch held back by the delay runs when the delay is over; in-world it ran on the next
    // simulator frame, up to 0.022 s later. touch_end waits behind it.
    expect(got('s')).toEqual(['start', 22, 1000, 2000, 3000, 4000, 'end', 4022])
  })

  it('under llMinEventDelay held touch events keep their beat apart from a timer', async () => {
    // In-world: llMinEventDelay(1.0) and a 0.1 s timer; touch_start came 0.455 s after the
    // click, on the timer's beat. After it: timer at 0.978, 2.000 and 3.000, touch at 0.022,
    // 1.000, 2.022 and 3.023, and touch_end at 3.045, each within a frame of the times here. The
    // tick on the beat ran a frame ahead of touch_start, and the delay counted from it.
    const log = `
      list got = [];
      integer on;
      string t() { return (string)llRound(llGetTime() * 1000); }
      default {
        state_entry() { llMinEventDelay(1.0); llSetTimerEvent(0.1); }
        timer() { if (on) got += "timer@" + t(); }
        touch_start(integer k) { on = 1; llResetTime(); got += "start"; }
        touch(integer k) { got += "touch@" + t(); }
        touch_end(integer k) { on = 0; got += "end@" + t(); }
      }
    `
    const { linkset, got } = await setup([[script('s', log)]])
    linkset.advanceTime(2500)
    linkset.touch(0, { hold: 3510 })
    expect(got('s')).toEqual(['start', 'touch@22', 'timer@978', 'touch@1000', 'timer@1978', 'touch@2000',
      'timer@2978', 'touch@3000', 'end@3022'])
  })

  describe('under llMinEventDelay, touch events waiting from one avatar merge', () => {
    // In-world probe: llMinEventDelay(1.0) or (2.0) set in state_entry, about 3 s before the
    // first click; each click on its own face; times from state_entry.
    const merged = (delay: number) => `
      list got = [];
      string at(string kind) { return kind + (string)llDetectedTouchFace(0) + "@" + (string)llRound(llGetTime() * 1000); }
      default {
        state_entry() { llMinEventDelay(${delay}); llResetTime(); }
        touch_start(integer k) { got += at("S"); }
        touch(integer k) { got += at("T"); }
        touch_end(integer k) { got += at("E"); }
      }
    `
    const run = async (delay: number, clicks: ReadonlyArray<{ face: number; hold: number }>) => {
      const { linkset, got } = await setup([[script('s', merged(delay))]])
      linkset.advanceTime(3000)
      for (const { face, hold } of clicks) {
        linkset.press(0, { face })
        linkset.advanceTime(hold)
        linkset.release()
        linkset.advanceTime(100)
      }
      linkset.advanceTime(5000)
      return got('s')
    }

    it.each([[1, 4000], [2, 5000]])('two 0.1 s holds in a row with llMinEventDelay(%i) make one click', async (delay, due) => {
      // In-world, (1.0): S1@3066 T1@3111 T2@4067 E2@4089. (2.0): S1@3068 T1@3090 T2@5090
      // E2@5112. The second click raised no touch_start; its data reached the touch and
      // touch_end that waited, one delay after the first touch_start.
      expect(await run(delay, [{ face: 1, hold: 100 }, { face: 2, hold: 100 }])).toEqual(['S1@3000', 'T1@3022', `T2@${due}`, `E2@${due + 22}`])
    })

    it.each([[1, 4000], [2, 5000]])('three 0.1 s holds in a row with llMinEventDelay(%i) make one click', async (delay, due) => {
      // In-world, (1.0): S1@3067 T1@3089 T3@4067 E3@4089. (2.0): S1@3111 T1@3133 T3@5111 E3@5134.
      const clicks = [1, 2, 3].map((face) => ({ face, hold: 100 }))
      expect(await run(delay, clicks)).toEqual(['S1@3000', 'T1@3022', `T3@${due}`, `E3@${due + 22}`])
    })

    it.each([[1, 4000], [2, 5000]])('a quick click, then a 0.4 s hold, with llMinEventDelay(%i)', async (delay, due) => {
      // In-world, (1.0): S1@3067 T1@3089 E1@3111 S2@4067 T2@4089 E2@4111. (2.0): S1@3066
      // T1@3089 E1@3111 S2@5066 T2@5089 E2@5111. The hold's touch_start waited a delay, and its
      // touch events merged into one.
      expect(await run(delay, [{ face: 1, hold: 0 }, { face: 2, hold: 400 }])).toEqual(
        ['S1@3000', 'T1@3022', 'E1@3044', `S2@${due}`, `T2@${due + 22}`, `E2@${due + 44}`])
    })
  })

  it('under llMinEventDelay a link message does not wait behind a waiting touch_start', async () => {
    // In-world: llMinEventDelay(1.0); a quick click on face 1, then a 0.4 s hold on face 2 whose
    // touch_start a second script answered with a link message 0.2 s later -> S1@3045 T1@3089
    // E1@3111 Lx@3333 S2@4067 T2@4089 E2@4111: the link message ran while touch_start waited,
    // and the hold's touch and touch_end waited behind it.
    const log = `
      list got = [];
      string at(string kind) { return kind + (string)llDetectedTouchFace(0) + "@" + (string)llRound(llGetTime() * 1000); }
      default {
        state_entry() { llMinEventDelay(1.0); llResetTime(); }
        touch_start(integer n) { got += at("S"); }
        touch(integer n) { got += at("T"); }
        touch_end(integer n) { got += at("E"); }
        link_message(integer s, integer k, string m, key id) { got += "L" + m + "@" + (string)llRound(llGetTime() * 1000); }
      }
    `
    const sender = `default {
      touch_start(integer n) { if (llDetectedTouchFace(0) == 2) llSetTimerEvent(0.2); }
      timer() { llSetTimerEvent(0); llMessageLinked(LINK_THIS, 0, "x", ""); }
    }`
    const { linkset, got } = await setup([[script('s', log), script('r', sender)]])
    linkset.advanceTime(3000)
    linkset.touch(0, { face: 1 })
    linkset.advanceTime(3100 - linkset.clock.now)
    linkset.touch(0, { face: 2, hold: 400 })
    linkset.advanceTime(2000)
    expect(got('s')).toEqual(['S1@3000', 'T1@3022', 'E1@3044', 'Lx@3322', 'S2@4000', 'T2@4022', 'E2@4044'])
  })

  describe('clicks held back in a sleep keep their own times when they merge', () => {
    // From the measured rule: touch_start lists each avatar's first click and touch and
    // touch_end each one's last, in the order those clicks came. A click scheduled for a time
    // in the middle of the sleep counts at that time, among clicks queued as they happened.
    const log = `
      list got = [];
      string at(string kind, integer n) {
        string s = kind + (string)n + "[";
        integer i;
        for (i = 0; i < n; ++i) s += llGetSubString(llDetectedName(i), 0, 0) + (string)llDetectedTouchFace(i);
        return s + "]";
      }
      default {
        link_message(integer s, integer k, string m, key id) { llSleep(8.0); }
        touch_start(integer n) { got += at("S", n); }
        touch(integer n) { got += at("T", n); }
        touch_end(integer n) { got += at("E", n); }
      }
    `
    async function asleep() {
      const made = await setup([[script('s', log)]])
      made.linkset.deliverLinkMessage(0, -1, 0, '', '')
      made.linkset.advanceTime(0)
      const queue = (at: number, name: string, face: number) => {
        const detected = [{ key: `${name}-0000-0000-0000-000000000000`, name, touchFace: face }]
        for (const event of ['touch_start', 'touch', 'touch_end']) made.linkset.clock.schedule(made.scripts.s!, at, event, { num_detected: 1, detected })
      }
      return { ...made, queue }
    }

    it('one avatar: the last click wins even when an earlier one was scheduled ahead', async () => {
      const { linkset, got, queue } = await asleep()
      linkset.advanceTime(1000)
      queue(linkset.clock.now, 'aaaaaaaa', 1)
      queue(linkset.clock.now + 1000, 'aaaaaaaa', 3)
      linkset.advanceTime(2000)
      queue(linkset.clock.now, 'aaaaaaaa', 2)
      linkset.advanceTime(10_000)
      expect(got('s')).toEqual(['S1[a1]', 'T1[a2]', 'E1[a2]'])
    })

    it('three avatars: each list follows the times of the clicks', async () => {
      const { linkset, got, queue } = await asleep()
      linkset.advanceTime(1000)
      queue(linkset.clock.now, 'aaaaaaaa', 1)
      queue(linkset.clock.now + 1000, 'cccccccc', 3)
      linkset.advanceTime(2000)
      queue(linkset.clock.now, 'bbbbbbbb', 2)
      linkset.advanceTime(10_000)
      expect(got('s')).toEqual(['S3[a1c3b2]', 'T3[a1c3b2]', 'E3[a1c3b2]'])
    })
  })

  describe('clicks by two avatars that wait together', () => {
    // In-world probe: i doll clicked face 1 and fivebot face 2, each on their own viewer, one
    // right after the other; the script logged each event's num_detected, and the first letter
    // of each detected name with its face. Times from state_entry, which set the delay.
    const IDOLL = { key: '11111111-1111-1111-1111-111111111111', name: 'i doll' }
    const FIVEBOT = { key: '22222222-2222-2222-2222-222222222222', name: 'fivebot' }
    const both = (delay: number) => `
      list got = [];
      string at(string kind, integer n) {
        string s = kind + (string)n + "[";
        integer i;
        for (i = 0; i < n; ++i) s += llGetSubString(llDetectedName(i), 0, 0) + (string)llDetectedTouchFace(i);
        return s + "]@" + (string)llRound(llGetTime() * 1000);
      }
      default {
        state_entry() { if (${delay} > 0) llMinEventDelay(${delay}); llResetTime(); }
        touch_start(integer n) { got += at("S", n); }
        touch(integer n) { got += at("T", n); }
        touch_end(integer n) { got += at("E", n); }
      }
    `
    const click = (who: typeof IDOLL, hold: number) => ({ avatar: who, face: who === IDOLL ? 1 : 2, hold })
    const run = async (delay: number, clicks: ReadonlyArray<ReturnType<typeof click>>) => {
      const { linkset, got } = await setup([[script('s', both(delay))]])
      linkset.advanceTime(3000)
      for (const { hold, ...c } of clicks) {
        linkset.press(0, c)
        linkset.advanceTime(hold)
        linkset.release(c.avatar)
        linkset.advanceTime(100)
      }
      linkset.advanceTime(5000)
      return got('s')
    }

    it.each([[1, 4000], [2, 5000]])('with llMinEventDelay(%i) another avatar\'s click waits and joins the waiting touch events', async (delay, due) => {
      // In-world, (1.0): S1[i1]@3067 T1[i1]@3178 S1[f2]@4067 T2[i1f2]@4089 E2[i1f2]@4111.
      // (2.0): S1[i1]@3088 T1[i1]@3111 S1[f2]@5088 T2[i1f2]@5111 E2[i1f2]@5133.
      expect(await run(delay, [click(IDOLL, 100), click(FIVEBOT, 100)])).toEqual(
        ['S1[i1]@3000', 'T1[i1]@3022', `S1[f2]@${due}`, `T2[i1f2]@${due + 22}`, `E2[i1f2]@${due + 44}`])
    })

    it.each([[1, 4000], [2, 5000]])('with llMinEventDelay(%i) the merged touch and touch_end list avatars by their last click', async (delay, due) => {
      // In-world, i doll, fivebot, i doll: (1.0) S1[i1]@3088 T1[i1]@3111 S1[f2]@4089
      // T2[f2i1]@4111 E2[f2i1]@4133. (2.0) S1[i1]@3066 T1[i1]@3089 S1[f2]@5067 T2[f2i1]@5088
      // E2[f2i1]@5111.
      expect(await run(delay, [click(IDOLL, 100), click(FIVEBOT, 100), click(IDOLL, 100)])).toEqual(
        ['S1[i1]@3000', 'T1[i1]@3022', `S1[f2]@${due}`, `T2[f2i1]@${due + 22}`, `E2[f2i1]@${due + 44}`])
    })

    it.each([[1, 4000], [2, 5000]])('with llMinEventDelay(%i) a click after another avatar\'s finished click waits a delay', async (delay, due) => {
      // In-world, a quick click by i doll then a 0.4 s hold by fivebot: (1.0) S1[i1]@3067
      // T1[i1]@3089 E1[i1]@3112 S1[f2]@4089 T1[f2]@4112 E1[f2]@4134. (2.0) the same with
      // fivebot's events at 5111, 5133 and 5155.
      expect(await run(delay, [click(IDOLL, 0), click(FIVEBOT, 400)])).toEqual(
        ['S1[i1]@3000', 'T1[i1]@3022', 'E1[i1]@3044', `S1[f2]@${due}`, `T1[f2]@${due + 22}`, `E1[f2]@${due + 44}`])
    })

    it('during a sleep, each kind of touch event lists both avatars once', async () => {
      // In-world, no delay, clicks by i doll, fivebot and i doll during an 8 s sleep -> after it
      // S2[i1f2], T2[f2i1] and E2[f2i1].
      const sleeper = both(0).replace('default {', 'default {\n        link_message(integer s, integer k, string m, key id) { llSleep(8.0); }')
      const { linkset, got, scripts } = await setup([[script('s', sleeper)]])
      linkset.deliverLinkMessage(0, -1, 0, '', '')
      linkset.advanceTime(1000)
      const target = scripts.s!
      for (const who of [IDOLL, FIVEBOT, IDOLL]) {
        const detected = [{ ...who, touchFace: who === IDOLL ? 1 : 2 }]
        for (const event of ['touch_start', 'touch', 'touch_end']) linkset.clock.schedule(target, linkset.clock.now, event, { num_detected: 1, detected })
        linkset.advanceTime(200)
      }
      linkset.advanceTime(10_000)
      expect(got('s')).toEqual(['S2[i1f2]@8044', 'T2[f2i1]@8067', 'E2[f2i1]@8089'])
    })
  })

  it('under llMinEventDelay a click during a sleep is held back for the sleep, not merged into the waiting events', async () => {
    const log = `
      list got = [];
      string at(string kind) { return kind + (string)llDetectedTouchFace(0); }
      default {
        state_entry() { llMinEventDelay(1.0); }
        touch_start(integer k) { got += at("S"); if (llGetListLength(got) == 1) llSleep(2.0); }
        touch(integer k) { got += at("T"); }
        touch_end(integer k) { got += at("E"); }
      }
    `
    const { linkset, got, scripts } = await setup([[script('s', log)]])
    linkset.advanceTime(3000)
    linkset.clock.scheduleTask(scripts.s!, 3500, () => linkset.touch(0, { face: 2, avatar: { key: ALICE.key.toUpperCase(), name: ALICE.name } }))
    linkset.touch(0, { face: 1, avatar: ALICE })
    linkset.advanceTime(5000)
    expect(got('s')).toEqual(['S1', 'T1', 'E1', 'S2', 'T2', 'E2'])
  })

  describe('a click a script still holds', () => {
    // In-world probe: a prim with a touch script that reports, once a second, how many touch
    // events it got and the face of the last, and a second script that stops it 0.5 s into a
    // 2 s hold on face 1 and starts it again 4 s later, leaving the click stuck.
    const reporter = `
      list got = [];
      integer n;
      integer face = -9;
      report() { if (n) got += ["touches", n, face]; n = 0; }
      default {
        touch_start(integer k) { report(); got += ["start", llDetectedTouchFace(0)]; }
        touch(integer k) { ++n; face = llDetectedTouchFace(0); }
        touch_end(integer k) { report(); got += ["end", llDetectedTouchFace(0)]; }
        link_message(integer s, integer k, string m, key id) {
          report();
          if (m == "reset") llResetScript();
          if (m == "state") state other;
        }
      }
      state other {
        touch_start(integer k) { report(); got += ["other start", llDetectedTouchFace(0)]; }
        touch(integer k) { ++n; face = llDetectedTouchFace(0); }
        touch_end(integer k) { report(); got += ["other end", llDetectedTouchFace(0)]; }
        link_message(integer s, integer k, string m, key id) { report(); if (m == "back") state default; }
      }
    `
    const stopper = `
      integer done;
      default {
        touch_start(integer n) { if (!done) llSetTimerEvent(0.5); done = TRUE; }
        timer() { llSetTimerEvent(0); llSetScriptState("s", FALSE); }
        link_message(integer s, integer n, string m, key k) { if (m == "go") llSetScriptState("s", TRUE); }
      }
    `
    async function stuck() {
      const made = await setup([[script('s', reporter), script('c', stopper)]])
      const send = (m: string) => {
        made.linkset.deliverLinkMessage(0, 0, 0, m, '')
        made.linkset.advanceTime(0)
      }
      made.linkset.touch(0, { face: 1, hold: 2000 })
      made.linkset.advanceTime(2000)
      send('go')
      made.linkset.advanceTime(1000)
      return { ...made, send }
    }

    it('gives the next click\'s data to the touch_end that ends it', async () => {
      // In-world: stuck on face 1, then clicked on face 3 -> touch_end read face 3.
      const { linkset, got } = await stuck()
      linkset.touch(0, { face: 3 })
      expect(got('s')).toEqual(['start', 1, 'touches', 35, 3, 'end', 3])
    })

    it('is forgotten by a reset', async () => {
      // In-world: stuck, then llResetScript -> no more touch events; the next click raised
      // touch_start, one touch and touch_end.
      const { linkset, got, send } = await stuck()
      send('reset')
      linkset.advanceTime(2000)
      send('')
      expect(got('s')).toEqual([])
      linkset.touch(0, { face: 2 })
      expect(got('s')).toEqual(['start', 2, 'touches', 1, 2, 'end', 2])
    })

    it('stops raising touch after a state change but still keeps the next click from starting', async () => {
      // In-world: stuck, then `state other` -> no touch events in the new state, nor after
      // going back; the next click raised no touch_start, only one touch and touch_end.
      const { linkset, got, send } = await stuck()
      send('state')
      linkset.advanceTime(2000)
      send('back')
      linkset.advanceTime(2000)
      send('')
      expect(got('s')).toEqual(['start', 1, 'touches', 34, 1])
      linkset.touch(0, { face: 2 })
      expect(got('s')).toEqual(['start', 1, 'touches', 34, 1, 'touches', 1, 2, 'end', 2])
    })

    it('keeps raising touch through a detach and a wear, without its surface point', async () => {
      // In-world: worn, stuck on face 1, detached and worn again -> touch kept coming, 22 a
      // second, reading face -1; the next click raised no touch_start, only touch_end.
      const { linkset, got, send } = await stuck()
      linkset.attachToAvatar(linkset.owner, 1)
      linkset.advanceTime(1000)
      send('')
      linkset.advanceTime(SIM_FRAME_MS)
      linkset.detachFromAvatar()
      linkset.attachToAvatar(linkset.owner, 1)
      linkset.advanceTime(1000)
      send('')
      linkset.advanceTime(SIM_FRAME_MS)
      expect(got('s').slice(-3)).toEqual(['touches', 23, -1])
      linkset.touch(0, { face: 2 })
      expect(got('s').slice(-5)).toEqual(['touches', 1, 2, 'end', 2])
      expect(got('s').filter((x) => x === 'start')).toHaveLength(1)
    })

    it('keeps raising touch in an object rezzed from a take, without its surface point', async () => {
      // In-world: stuck on face 1, taken and rezzed -> touch kept coming, 22 a second, reading
      // face -1; the next click raised no touch_start, only touch_end.
      const { linkset, send } = await stuck()
      send('')
      const rezzed = linkset.copy()
      linkset.remove()
      rezzed.advanceTime(1000)
      const s = rezzed.allScripts().find((x) => x.scriptName === 's')!
      rezzed.deliverLinkMessage(0, 0, 0, '', '')
      rezzed.advanceTime(0)
      expect((s.global('got') as unknown[]).slice(-3)).toEqual(['touches', 22, -1])
      rezzed.touch(0, { face: 2 })
      expect((s.global('got') as unknown[]).slice(-5)).toEqual(['touches', 1, 2, 'end', 2])
    })

    it('stays with the script when its prim is unlinked', async () => {
      // In-world: a child prim's script stuck on face 1, then the child unlinked -> touch kept
      // coming, still reading face 1; a click on the unlinked prim raised only touch_end.
      const made = await setup([[], [script('s', reporter), script('c', stopper)]])
      made.linkset.touch(2, { face: 1, hold: 2000 })
      made.linkset.advanceTime(2000)
      made.linkset.deliverLinkMessage(1, -1, 0, 'go', '')
      made.linkset.advanceTime(1000)
      made.linkset.deliverLinkMessage(1, -1, 0, '', '')
      made.linkset.advanceTime(0)
      const child = made.linkset.prims[1]!
      made.linkset.breakOff(child)
      const apart = child.linkset!
      apart.advanceTime(1000)
      apart.deliverLinkMessage(0, -1, 0, '', '')
      apart.advanceTime(0)
      expect(made.got('s').slice(-3)).toEqual(['touches', 22, 1])
      apart.touch(0, { face: 2 })
      expect(made.got('s').slice(-3)).toEqual([2, 'end', 2])
      expect(made.got('s').filter((x) => x === 'start')).toHaveLength(1)
    })

    it('keeps every llDetected* value of its click after an unlink, the link number too', async () => {
      // In-world: a child prim's script stuck on face 1 at ST 0.3, 0.6, then the child
      // unlinked. Its touch events kept reading llDetectedLinkNumber 2 (llGetLinkNumber read
      // 0), face 1, the ST, the touch position and normal, and the clicker's key, name, owner,
      // type and position. The next click on the unlinked prim read link 0, face 2 and its ST.
      const details = `
        string last;
        list got = [];
        string d() {
          return (string)llDetectedLinkNumber(0) + "|" + (string)llGetLinkNumber() + "|" + (string)llDetectedTouchFace(0) + "|"
            + (string)llDetectedTouchST(0) + "|" + (string)llDetectedTouchPos(0) + "|" + (string)llDetectedTouchNormal(0) + "|"
            + llDetectedName(0) + "|" + (string)llDetectedKey(0) + "|" + (string)llDetectedOwner(0) + "|" + (string)llDetectedType(0)
            + "|" + (string)llDetectedPos(0);
        }
        default {
          touch(integer k) { last = d(); }
          touch_end(integer k) { got += ["end", d()]; }
          link_message(integer s, integer k, string m, key id) { got += ["touch", last]; }
        }
      `
      const made = await setup([[], [script('s', details), script('c', stopper)]])
      const alice = { ...ALICE, type: 1, pos: { x: 118, y: 48, z: 1997.446 } }
      made.linkset.touch(2, { face: 1, st: { x: 0.3, y: 0.6, z: 0 }, pos: { x: 120.9, y: 49.75, z: 1998.05 },
        normal: { x: 0, y: -1, z: 0 }, hold: 2000, avatar: alice })
      made.linkset.advanceTime(2000)
      made.linkset.deliverLinkMessage(1, -1, 0, 'go', '')
      made.linkset.advanceTime(1000)
      const child = made.linkset.prims[1]!
      made.linkset.breakOff(child)
      const apart = child.linkset!
      apart.advanceTime(1000)
      apart.deliverLinkMessage(0, -1, 0, '', '')
      apart.advanceTime(0)
      apart.touch(0, { face: 2, st: { x: 0.7, y: 0.1, z: 0 }, avatar: alice })
      const who = `${ALICE.name}|${ALICE.key}|${ALICE.key}|1|<118.00000, 48.00000, 1997.44600>`
      expect(made.got('s')).toEqual([
        'touch', `2|0|1|<0.30000, 0.60000, 0.00000>|<120.90000, 49.75000, 1998.05000>|<0.00000, -1.00000, 0.00000>|${who}`,
        'end', `0|0|2|<0.70000, 0.10000, 0.00000>|<0.00000, 0.00000, 0.00000>|<0.00000, 0.00000, 0.00000>|${who}`,
      ])
    })
  })

  it('a reset in the middle of a hold stops touch, and the release still ends the click', async () => {
    // In-world: 1.5 s into a 5 s hold the script called llResetScript -> no touch events after
    // the reset, then touch_end at the release; the next click was a normal one.
    const log = `
      list got = [];
      default {
        state_entry() { got += "entry"; }
        touch_start(integer k) { got += "start"; if (llGetListLength(got) == 2) llSetTimerEvent(1.5); }
        touch(integer k) { got += "touch"; }
        touch_end(integer k) { got += "end"; }
        timer() { llResetScript(); }
      }
    `
    const { linkset, got } = await setup([[script('s', log)]])
    linkset.touch(0, { hold: 5000 })
    expect(got('s')).toEqual(['entry', 'end'])
    linkset.touch(0)
    expect(got('s')).toEqual(['entry', 'end', 'start', 'touch', 'end'])
  })

  it('a state change in touch_start leaves the click with no touch, only touch_end', async () => {
    // In-world: touch_start changed state during a 3 s hold -> no touch at all, and touch_end
    // in the new state at the release.
    const log = `
      list got = [];
      default {
        touch_start(integer k) { got += "start"; state other; }
        touch(integer k) { got += "touch"; }
      }
      state other {
        touch(integer k) { got += "other touch"; }
        touch_end(integer k) { got += "other end"; }
      }
    `
    const { linkset, got } = await setup([[script('s', log)]])
    linkset.touch(0, { hold: 3000 })
    expect(got('s')).toEqual(['start', 'other end'])
  })

  it('llMinEventDelay called in touch_start holds the next touch of the click back', async () => {
    // In-world: touch_start called llMinEventDelay(1.0) during a hold -> touch at 0.044, 1.022,
    // 2.022, 3.022 and 4.045 after touch_start.
    const log = `
      list got = [];
      default {
        touch_start(integer k) { llResetTime(); llMinEventDelay(1.0); }
        touch(integer k) { got += llRound(llGetTime() * 1000); }
      }
    `
    const { linkset, got } = await setup([[script('s', log)]])
    linkset.touch(0, { hold: 3500 })
    expect(got('s')).toEqual([22, 1000, 2000, 3000, 4000])
  })

  it('each held click starts its touch events half a beat after it, even right after another', async () => {
    const log = `list got = []; default { touch_start(integer k) { llResetTime(); } touch(integer k) { got += llRound(llGetTime() * 1000); } }`
    const { linkset, got } = await setup([[script('s', log)]])
    linkset.touch(0, { hold: 100 })
    linkset.advanceTime(10)
    linkset.touch(0, { hold: 100 })
    expect(got('s')).toEqual([22, 67, 22, 67])
  })

  it('a state change in the middle of a hold stops touch, and the release still ends the click', async () => {
    // In-world: 1.5 s into a 5 s hold the script changed state -> no touch events after it,
    // and touch_end in the new state at the release. The next click was a normal one.
    const log = `
      list got = [];
      default {
        touch_start(integer k) { got += "start"; llSetTimerEvent(1.5); }
        touch(integer k) { got += "touch"; }
        timer() { llSetTimerEvent(0); state other; }
      }
      state other {
        touch_start(integer k) { got += "other start"; }
        touch(integer k) { got += "other touch"; }
        touch_end(integer k) { got += "other end"; }
      }
    `
    const { linkset, got } = await setup([[script('s', log)]])
    linkset.touch(0, { hold: 5000 })
    expect(got('s').filter((x) => x === 'touch')).toHaveLength(34)
    expect(got('s').slice(-1)).toEqual(['other end'])
    linkset.touch(0)
    expect(got('s').slice(-3)).toEqual(['other start', 'other touch', 'other end'])
  })

  it('held clicks repeat again after a detach and a wear', async () => {
    const log = `list got = []; default { touch(integer k) { got += "touch"; } }`
    const { linkset, got } = await setup([[script('s', log)]])
    linkset.attachToAvatar(linkset.owner, 1)
    linkset.advanceTime(0)
    linkset.touch(0, { hold: 500 })
    linkset.detachFromAvatar()
    linkset.advanceTime(100)
    linkset.attachToAvatar(linkset.owner, 1)
    linkset.advanceTime(0)
    linkset.touch(0, { hold: 500 })
    expect(got('s')).toHaveLength(22)
  })

  it('under llMinEventDelay a quick click still raises its touch', async () => {
    // In-world: llMinEventDelay(2.0), clicks at about t, t+0.3, t+2.8 and t+3.1 -> three clicks
    // got through, each with touch_start, touch and touch_end.
    const log = `
      list got = [];
      default {
        state_entry() { llMinEventDelay(2.0); }
        touch_start(integer k) { got += "start"; }
        touch(integer k) { got += "touch"; }
        touch_end(integer k) { got += "end"; }
      }
    `
    const { linkset, got } = await setup([[script('s', log)]])
    linkset.advanceTime(4000)
    for (const wait of [300, 2500, 300, 10_000]) {
      linkset.press(0)
      linkset.release()
      linkset.advanceTime(wait)
    }
    expect(got('s')).toEqual(['start', 'touch', 'end', 'start', 'touch', 'end', 'start', 'touch', 'end'])
  })

  it('starts scripts that have not run state_entry yet', async () => {
    const loaded = await loadLinkset({
      prims: [
        { scripts: [script('root', recorder())] },
        { scripts: [script('child', recorder(undefined, 'llPassTouches(PASS_ALWAYS);'))] },
      ],
    })
    loaded.linkset.touch(2, { avatar: ALICE })
    expect(loaded.scripts['root']!.global('got')).toEqual(click(2))
  })

  it('throws for a link number the linkset does not have', async () => {
    const { linkset } = await setup([[], []])
    expect(() => linkset.touch(3)).toThrow('no prim with link number 3')
    expect(() => linkset.touch(0)).toThrow('no prim with link number 0')
  })
})

describe('llDetectedTouchFace', () => {
  it('reads the face passed to fire(), and 0 past the count or outside a touch', async () => {
    // In-world: a click on face 3 gave llDetectedTouchFace(0) = 3, and 0 for
    // indexes 1 and -1; in state_entry it was 0.
    const { scripts } = await setup([
      [
        script(
          's',
          `list got = [];
          default {
            state_entry() { got += [llDetectedTouchFace(0)]; }
            touch_start(integer n) { got += [llDetectedTouchFace(0), llDetectedTouchFace(1), llDetectedTouchFace(-1)]; }
          }`,
        ),
      ],
    ])
    scripts['s']!.fire('touch_start', { num_detected: 1, detected: [{ ...ALICE, touchFace: 3 }] })
    expect(scripts['s']!.global('got')).toEqual([0, 3, 0, 0])
  })
})

describe('touch coordinates', () => {
  const coords = `
    list got = [];
    string d(integer i) {
      return (string)llDetectedTouchST(i) + "|" + (string)llDetectedTouchUV(i) + "|"
        + (string)llDetectedTouchNormal(i) + "|" + (string)llDetectedTouchBinormal(i);
    }
    default {
      state_entry() { got += [d(0)]; }
      touch_start(integer n) { got += [d(0), d(1)]; }
    }
  `
  const ZERO = '<0.00000, 0.00000, 0.00000>'
  const INVALID = '<-1.00000, -1.00000, 0.00000>'

  it('reads the point passed to linkset.touch', async () => {
    const { linkset, got } = await setup([[script('s', coords)]])
    linkset.touch(0, { st: { x: 0.25, y: 0.75, z: 0 }, uv: { x: 0.5, y: 0.5, z: 0 } })
    expect(got('s')[1]).toBe(`<0.25000, 0.75000, 0.00000>|<0.50000, 0.50000, 0.00000>|${ZERO}|${ZERO}`)
  })

  it('reads normals passed to fire()', async () => {
    const { scripts, got } = await setup([[script('s', coords)]])
    const up = { x: 0, y: 0, z: 1 }
    const east = { x: 1, y: 0, z: 0 }
    scripts['s']!.fire('touch_start', { num_detected: 1, detected: [{ ...ALICE, touchNormal: up, touchBinormal: east }] })
    expect(got('s')[1]).toBe(`${INVALID}|${INVALID}|<0.00000, 0.00000, 1.00000>|<1.00000, 0.00000, 0.00000>`)
  })

  it('a click with no point reads invalid texture coordinates; outside a touch and past the count read zero', async () => {
    // In-world: object.touch sends no surface point. touch_start, touch and
    // touch_end all read ST and UV <-1, -1, 0> and zero normals; index 1 and
    // state_entry read zero for all four.
    const { linkset, got } = await setup([[script('s', coords)]])
    linkset.touch(0)
    const none = [ZERO, ZERO, ZERO, ZERO].join('|')
    expect(got('s')).toEqual([none, `${INVALID}|${INVALID}|${ZERO}|${ZERO}`, none])
  })
})
