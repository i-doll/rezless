import { describe, it, expect } from 'vitest'
import { loadLinkset, type ScriptInput } from '../src/index.js'

// In-world: Aditi, Mono. The 4-prim routing table was measured in Dore
// (2026-10-30, see #148); the handler, pass-value, stopped-script and
// lone-prim cases in SLua Tideland (2026-10-31) with a 7-prim linkset whose
// scripts llSay what they received, each prim clicked on face 0.

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
    expect(got('s')).toEqual(['start@0.000000', 'timer@0.100000', 'end@1.500000'])
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
    expect(got('s')).toEqual([2])
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
    linkset.advanceTime(0)
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
    linkset.advanceTime(0)
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
    // touch_end at the release.
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
    expect(times.find((t) => t >= 1600)).toBe(1622)
    expect(got('s').slice(-2)).toEqual(['end', 4000])
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
    expect(got('s').slice(-2)).toEqual(['end', 1.5])
  })

  it('under llMinEventDelay a held click raises touch once per delay, on its own beat', async () => {
    // In-world: llMinEventDelay(1.0) and a 4 s hold -> touch at 0.022, 1.000, 2.022, 3.044
    // and 4.044 after touch_start, and touch_end at 4.067, not delayed. With a 0.1 s timer
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
    // Two frames a beat here, so the touch in-world at 4.044 would come at 4.067, after the release.
    expect(got('s')).toEqual(['start', 22, 1000, 2022, 3044, 'end', 4000])
  })

  it('under llMinEventDelay held touch events keep their beat apart from a timer', async () => {
    const log = `
      list got = [];
      integer on;
      default {
        state_entry() { llMinEventDelay(1.0); llSetTimerEvent(0.1); }
        timer() { if (on) got += "timer"; }
        touch_start(integer k) { on = 1; got += "start"; }
        touch(integer k) { got += "touch"; }
        touch_end(integer k) { on = 0; got += "end"; }
      }
    `
    const { linkset, got } = await setup([[script('s', log)]])
    // The click waits for the timer's beat at 3 s, as in-world, where touch_start came 0.455 s
    // after the click and touch_end 3.045 s after touch_start.
    linkset.advanceTime(2500)
    linkset.touch(0, { hold: 3600 })
    expect(got('s')).toEqual(['start', 'touch', 'timer', 'touch', 'timer', 'touch', 'timer', 'touch', 'end'])
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
      linkset.detachFromAvatar()
      linkset.attachToAvatar(linkset.owner, 1)
      linkset.advanceTime(1000)
      send('')
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
      linkset.touch(0)
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
