import { describe, expect, it } from 'vitest'
import { loadLinkset, NULL_KEY, type Linkset } from '../src/index.js'

const SIM_FRAME_MS = 1000 / 45

// https://wiki.secondlife.com/wiki/LlSetTimerEvent
// https://wiki.secondlife.com/wiki/LlMinEventDelay
// https://wiki.secondlife.com/wiki/LlSetScriptState
//
// Measured on the Aditi beta grid, SLua Tideland, Firestorm viewer, 2026-11-23. Each probe
// logged every timer event with llGetTimestamp in owner chat. A control script in the same prim
// sent the link messages and called llSetScriptState on a fixed schedule. Every case ran at least
// twice, and most three to six times, with the same result each time.

/** Virtual times, in ms, of each tick while the clock ran for `ms`; two ticks at one time show twice. */
function tickTimes(linkset: Linkset, ticks: () => number, ms: number, step = 50): number[] {
  const out: number[] = []
  let last = ticks()
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    linkset.advanceTime(step)
    const now = ticks()
    for (; last < now; last++) out.push(linkset.clock.now)
  }
  return out
}

async function freshStart(interval: number, sleep: number) {
  const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 's', source: { source: `
    integer ticks;
    default {
      state_entry() {
        llSetTimerEvent(${interval.toFixed(1)});
        llMessageLinked(LINK_THIS, 7, "", "");
      }
      link_message(integer s, integer n, string m, key k) { if (n == 7) llSleep(${sleep.toFixed(1)}); }
      timer() { ++ticks; }
    }
  ` } }] }] })
  const s = scripts['s']!
  s.start()
  // The start runs state_entry and the sleeping handler through to the wake.
  expect(linkset.clock.now).toBe(sleep * 1000 + SIM_FRAME_MS)
  linkset.advanceTime(sleep * 1000 + 50 - linkset.clock.now)
  expect(s.global('ticks')).toBe(1)
  return { linkset, ticks: () => s.global('ticks') as number }
}

describe('a timer after a start and a sleep in a queued handler', () => {
  it('gives one tick at the wake after a fresh start', async () => {
    // In-world: state_entry set a 1 s or 2 s timer and queued a link message whose handler slept
    // 3, 5 or 8 s. Each gave one timer event 20 ms after the wake. So did a sleep in state_entry
    // itself, a recompiled script and an on_rez handler of a rezzed copy.
    for (const [interval, sleep] of [[1, 3], [1, 5], [1, 8], [2, 5], [2, 8]] as const) {
      const { linkset, ticks } = await freshStart(interval, sleep)
      expect(tickTimes(linkset, ticks, interval * 1000 - 100)).toEqual([])
    }
  })

  it('keeps the schedule after a tick held through one interval', async () => {
    // In-world: a 2 s timer and a 3 s sleep ticked at the wake and then 0.95 s later, 4 s after
    // the call, in four runs. A 4 s timer and a 5 s or 6 s sleep ticked at the wake and then 8 s
    // after the call, in four runs.
    const short = await freshStart(2, 3)
    expect(tickTimes(short.linkset, short.ticks, 3100)).toEqual([4000, 6000])
    const long = await freshStart(4, 5)
    expect(tickTimes(long.linkset, long.ticks, 7100)).toEqual([8000, 12_000])
    const longer = await freshStart(4, 6)
    expect(tickTimes(longer.linkset, longer.ticks, 6100)).toEqual([8000, 12_000])
  })

  it('starts the interval again from the wake after a tick held through more than one interval', async () => {
    // In-world: a 2 s timer and a 5 s sleep ticked at the wake and then every 2 s after it; a 4 s
    // timer and a 9 s sleep at the wake and then 4 s after it; a 1 s timer and a 3 s sleep at the
    // wake and then every 1 s after it.
    const two = await freshStart(2, 5)
    expect(tickTimes(two.linkset, two.ticks, 4100)).toEqual([7050, 9050])
    const four = await freshStart(4, 9)
    expect(tickTimes(four.linkset, four.ticks, 4100)).toEqual([13_050])
    const one = await freshStart(1, 3)
    expect(tickTimes(one.linkset, one.ticks, 2100)).toEqual([4050, 5050])
  })
})

const timed = `integer ticks; float next;
  default {
    link_message(integer s, integer n, string m, key k) {
      if (n == 1) llSetTimerEvent((float)m);
      else if (n == 2) next = (float)m;
      else if (n == 4) llMinEventDelay((float)m);
      else if (n == 7) llSleep((float)m);
      else if (n == 9) { llSetTimerEvent(4.0); llSleep((float)m); }
      else if (n == 10) { llSleep((float)m); llSetTimerEvent(4.0); }
      else if (n == 11) {
        list w = llParseString2List(m, [","], []);
        llSetTimerEvent((float)llList2String(w, 0));
        llSleep((float)llList2String(w, 1));
      }
      else if (n == 8) llSetTimerEvent(0.0);
    }
    timer() { ++ticks; if (next > 0.0) { llSetTimerEvent(next); next = 0.0; } }
  }`

const control = `default {
    link_message(integer s, integer n, string m, key k) {
      if (n != 900) return;
      if (m == "stop") llSetScriptState("t", FALSE);
      else if (m == "start") llSetScriptState("t", TRUE);
      else if (llGetSubString(m, 0, 6) == "q+stop:") {
        llMessageLinked(LINK_THIS, 7, llGetSubString(m, 7, -1), "");
        llSetScriptState("t", FALSE);
      }
      else if (llGetSubString(m, 0, 7) == "qs+stop:") {
        llMessageLinked(LINK_THIS, 9, llGetSubString(m, 8, -1), "");
        llSetScriptState("t", FALSE);
      }
      else if (llGetSubString(m, 0, 7) == "qc+stop:") {
        llMessageLinked(LINK_THIS, 11, llGetSubString(m, 8, -1), "");
        llSetScriptState("t", FALSE);
      }
      else {
        list w = llParseString2List(m, [":"], []);
        llMessageLinked(LINK_THIS, (integer)llList2String(w, 0), llList2String(w, 1), "");
      }
    }
  }`

async function rig() {
  const loaded = await loadLinkset({ prims: [{ scripts: [
    { name: 't', source: { source: timed } },
    { name: 'ctl', source: { source: control } },
  ] }] })
  const t = loaded.scripts['t']!
  for (const s of Object.values(loaded.scripts)) s.start()
  const tell = (m: string) => loaded.scripts['ctl']!.fire('link_message', { sender_num: 1, num: 900, str: m, id: NULL_KEY })
  const at = (ms: number) => loaded.linkset.advanceTime(ms - loaded.linkset.clock.now)
  return { linkset: loaded.linkset, tell, at, ticks: () => t.global('ticks') as number }
}

/** A timer of `interval` ms set at 0, a queued `sleep` s handler and a stop at `stopAt`, a start at `startAt`. */
async function stoppedWithSleep(interval: number, sleep: number, stopAt: number, startAt: number, queue = 'q+stop') {
  const r = await rig()
  r.tell(`1:${interval / 1000}`)
  r.at(stopAt)
  r.tell(`${queue}:${sleep}`)
  r.at(startAt)
  r.tell('start')
  return r
}

describe('a timer after a stop, a start and a sleep in a queued handler', () => {
  it('gives the caught-up tick and the tick due during the sleep at the wake', async () => {
    // In-world: a 4 s timer, stopped at 1 s with a 4 s sleep queued and started at 5 s, woke at
    // 9 s to two timer events 45 ms apart, then ticked at 12 s, in two runs. A 6 s sleep woke at
    // 11 s to two events and then ticked at 12 s.
    const four = await stoppedWithSleep(4000, 4, 1000, 5000)
    expect(tickTimes(four.linkset, four.ticks, 7500)).toEqual([9050, 9100, 12_050])
    const six = await stoppedWithSleep(4000, 6, 1000, 5000)
    expect(tickTimes(six.linkset, six.ticks, 7500)).toEqual([11_050, 11_100, 12_050])
  })

  it('gives only the caught-up tick when no tick came due during the sleep', async () => {
    // In-world: the same with a 2 s sleep woke at 7 s to one timer event, then ticked at 8 s and
    // every 4 s, in two runs.
    const r = await stoppedWithSleep(4000, 2, 1000, 5000)
    expect(tickTimes(r.linkset, r.ticks, 7500)).toEqual([7050, 8050, 12_050])
  })

  it('starts the interval again from the wake when more than one tick came due during the sleep', async () => {
    // In-world: a 4 s timer stopped at 1 s with a 5 s sleep queued and started at 7 s woke at
    // 12.02 s to two timer events, then ticked 4.0 s after the second, in three runs. A 1 s
    // timer stopped at 0.25 s and started at 1.75 s with a 3, 5 or 8 s sleep woke to two events
    // 45 ms apart and then ticked every second from the second, in six runs. With three ticks
    // missed while stopped, a 1 s and a 2 s timer did the same.
    const four = await stoppedWithSleep(4000, 5.1, 1000, 7000)
    expect(tickTimes(four.linkset, four.ticks, 9500)).toEqual([12_150, 12_200, 16_200])
    const one = await stoppedWithSleep(1000, 5, 250, 1750)
    expect(tickTimes(one.linkset, one.ticks, 7100)).toEqual([6800, 6850, 7850, 8850])
    const missed = await stoppedWithSleep(1000, 5, 250, 3750)
    expect(tickTimes(missed.linkset, missed.ticks, 7100)).toEqual([8800, 8850, 9850, 10_850])
  })

  it('gives one tick at the wake when it was stopped and started during the sleep', async () => {
    // In-world: a handler set a 3 s timer and slept 10 s. Stopped 4 s in and started at 5 s,
    // 7 s or 8.5 s, it woke at 10 s to one timer event and then ticked every 3 s, in five runs:
    // a tick missed while it was stopped added none to the one already held. Stopped 2 s in,
    // before any tick, and started at 4 s, it did the same in two runs.
    for (const [stopAt, startAt] of [[4000, 5000], [4000, 7000], [4000, 8500], [2000, 4000]] as const) {
      const r = await rig()
      r.tell('1:3.0')
      r.tell('7:10.0')
      r.at(stopAt)
      r.tell('stop')
      r.at(startAt)
      r.tell('start')
      expect(tickTimes(r.linkset, r.ticks, 16_100 - startAt)).toEqual([10_100, 13_100, 16_100])
    }
  })

  it('ticks an interval after the wake when the script was stopped in its own sleep', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-24): a 4 s timer and a handler that slept 10 s from
    // 0.5 s, stopped at 1 s and started at 5 s, woke at 10.5 s to one timer event. llSetTimerEvent(4)
    // in that event's handler ticked at 14.5 s and 18.5 s, in three runs: the start left no lag.
    // Without the call it ticked at 14.49 s and 18.49 s, in one run.
    for (const call of [true, false]) {
      const r = await rig()
      r.tell('1:4.0')
      if (call) r.tell('2:4.0')
      r.at(500)
      r.tell('7:10.0')
      r.at(1000)
      r.tell('stop')
      r.at(5000)
      r.tell('start')
      expect(tickTimes(r.linkset, r.ticks, 13_600)).toEqual([10_550, 14_550, 18_550])
    }
  })

  it('gives one tick at the wake when no tick was missed while stopped', async () => {
    // In-world: a 1 s timer stopped at 0.2 s and started at 0.7 s, and a 2 s timer stopped at
    // 0.4 s and started at 1.4 s, each with a 5 s or 8 s sleep queued, woke to one timer event
    // and then ticked an interval after it.
    const r = await stoppedWithSleep(2000, 5, 400, 1400)
    expect(tickTimes(r.linkset, r.ticks, 8000)).toEqual([6450, 8450])
  })

  it('gives one tick at the start when ticks were missed and nothing slept', async () => {
    // In-world: a 4 s timer stopped at 1 s and started at 9.5 s with a handler that returned at
    // once queued gave one timer event at the start and then ticked every 4 s from it, in two
    // runs. Started at 5 s, it ticked at the start and then at 8 s.
    const many = await stoppedWithSleep(4000, 0, 1000, 9500)
    many.linkset.advanceTime(50)
    expect(many.ticks()).toBe(1)
    expect(tickTimes(many.linkset, many.ticks, 8450)).toEqual([13_500, 17_500])
    const one = await stoppedWithSleep(4000, 0, 1000, 5000)
    one.linkset.advanceTime(50)
    expect(one.ticks()).toBe(1)
    expect(tickTimes(one.linkset, one.ticks, 7450)).toEqual([8050, 12_050])
  })

  it('leaves the lag of the tick due during the sleep', async () => {
    // In-world: the 4 s sleep woke at 9 s to two events; llSetTimerEvent(0) in the second and
    // llSetTimerEvent(4) 0.6 s after the wake ticked 2.9 s after the call, in two runs. A 6 s
    // sleep woke at 11 s, and the same call ticked 0.85 s to 0.9 s after it: the tick due at 8 s
    // left 3 s of lag.
    for (const [sleep, wake, after] of [[4, 9000, 3000], [6, 11_000, 1000]] as const) {
      const r = await stoppedWithSleep(4000, sleep, 1000, 5000)
      r.at(wake + 100)
      expect(r.ticks()).toBe(2)
      r.tell('8:')
      r.at(wake + 600)
      r.tell('1:4.0')
      expect(tickTimes(r.linkset, r.ticks, after + 100)).toEqual([wake + 600 + after + SIM_FRAME_MS])
    }
  })

  it('ticks an interval after a start that missed several ticks, also during a short sleep', async () => {
    // In-world: a 1 s timer stopped at 0.25 s and started at 3.75 s with a 0.75 s sleep queued
    // woke to one timer event, then ticked 1.0 s after the start and every second from there, in
    // two runs.
    const r = await stoppedWithSleep(1000, 0.75, 250, 3750)
    expect(tickTimes(r.linkset, r.ticks, 2100)).toEqual([4550, 4750, 5750])
  })

  it('gives both ticks when the waiting handler sets the timer before it sleeps', async () => {
    // In-world: a 4 s timer stopped at 1 s with a handler queued that called llSetTimerEvent(4)
    // and slept 4 s, started at 5 s, woke at 9 s to two timer events and ticked again at 12 s, in
    // two runs.
    const r = await stoppedWithSleep(4000, 4, 1000, 5000, 'qs+stop')
    expect(tickTimes(r.linkset, r.ticks, 7100)).toEqual([9050, 9100, 12_050])
  })

  it('keeps the start\'s lag when the caught-up tick\'s handler sets the timer after the wake', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-24, three runs each): a 4 s timer stopped at 1 s
    // with a 5 s or 6 s sleep queued and started at 5 s woke to one timer event, whose handler
    // called llSetTimerEvent(4), and ticked 3.0 s after it: the start's 1 s lag stayed, although
    // the tick ran after the next was due.
    for (const [sleep, wake] of [[5, 10_000], [6, 11_000]] as const) {
      const r = await rig()
      r.tell('1:4.0')
      r.tell('2:4.0')
      r.at(1000)
      r.tell(`q+stop:${sleep}`)
      r.at(5000)
      r.tell('start')
      expect(tickTimes(r.linkset, r.ticks, wake - 5000 + 4000)).toEqual([wake + 50, wake + 3050])
    }
  })
})

describe('a waiting handler that changes the interval before the caught-up tick', () => {
  // A timer set at 0 s, stopped at 1 s with a handler queued that called llSetTimerEvent with a
  // new interval and then slept, and started at 5 s. Each case ran three times on 2026-11-24 with
  // the same result each time.
  const changed = (interval: number, next: number, sleep: number) =>
    stoppedWithSleep(interval, sleep, 1000, 5000, `qc+stop:${next / 1000},${sleep}`)

  it('starts the new schedule at the call when more than one tick was missed', async () => {
    // In-world: a 2 s timer changed to 4 s with a 3 s sleep woke at 8 s to one timer event, then
    // ticked 4.0 s after the call and every 4 s from there.
    const short = await changed(2000, 4000, 3)
    expect(tickTimes(short.linkset, short.ticks, 12_100)).toEqual([8050, 9000, 13_000, 17_000])
    // In-world: with a 4 s sleep it woke at 9 s to two timer events 45 ms apart and ticked again
    // 8.0 s after the call; with a 5 s sleep it woke at 10 s to two and ticked 8.0 s after the
    // call. A tick on the old 2 s schedule, at 10 s with a 4 s sleep, never came.
    const even = await changed(2000, 4000, 4)
    expect(tickTimes(even.linkset, even.ticks, 12_100)).toEqual([9050, 9100, 13_000, 17_000])
    const long = await changed(2000, 4000, 5)
    expect(tickTimes(long.linkset, long.ticks, 12_100)).toEqual([10_050, 10_100, 13_000, 17_000])
  })

  it('starts the new schedule earlier by the start\'s lag when one tick was missed', async () => {
    // In-world: a 4 s timer changed to 2 s with no sleep ticked at the start and then 6.0 s after
    // the timer was set, about 0.95 s after the call, and every 2 s from there. A 4 s timer
    // changed to 6 s with a 4 s sleep woke at 9 s to one timer event and ticked 10.0 s after the
    // timer was set, then every 6 s.
    const now = await changed(4000, 2000, 0)
    now.linkset.advanceTime(50)
    expect(now.ticks()).toBe(1)
    expect(tickTimes(now.linkset, now.ticks, 3050)).toEqual([6050, 8050])
    const longer = await changed(4000, 6000, 4)
    expect(tickTimes(longer.linkset, longer.ticks, 11_100)).toEqual([9050, 10_050, 16_050])
    // In-world: a 4 s timer changed to 2 s with a 4 s sleep woke at 9 s to two timer events and
    // ticked 2.0 s after the second, then every 2 s.
    const shorter = await changed(4000, 2000, 4)
    expect(tickTimes(shorter.linkset, shorter.ticks, 8100)).toEqual([9050, 9100, 11_100, 13_100])
    // In-world: a 4 s timer changed to 2 s with no sleep, and llSetTimerEvent(4) 0.55 s after the
    // start, before the tick due on the 2 s schedule, ticked 2.95 s after that call: the start's
    // 1 s lag still held.
    const later = await changed(4000, 2000, 0)
    later.at(5500)
    later.tell('1:4.0')
    expect(tickTimes(later.linkset, later.ticks, 3100)).toEqual([8550 + SIM_FRAME_MS])
  })

  it('applies to a waiting handler of a script stopped during another handler\'s sleep', async () => {
    // In-world: a 4 s timer; a handler that slept 1 s from 0.5 s, and a handler queued behind it
    // that called llSetTimerEvent(2). Stopped at 1 s and started at 7 s, it gave two timer events
    // 45 ms apart at the start, then ticked 8.0 s after the timer was set and every 2 s.
    const r = await rig()
    r.tell('1:4.0')
    r.at(500)
    r.tell('7:1.0')
    r.at(600)
    r.tell('11:2,0')
    r.at(1000)
    r.tell('stop')
    r.at(7000)
    r.tell('start')
    r.linkset.advanceTime(100)
    expect(r.ticks()).toBe(2)
    expect(tickTimes(r.linkset, r.ticks, 3000)).toEqual([8050, 10_050])
  })

  it('drops the tick that follows when the caught-up tick\'s handler sets the timer', async () => {
    // In-world: a 4 s timer changed to 2 s with no sleep, started at 7 s, gave one timer event at
    // the start; llSetTimerEvent(4) in its handler ticked 0.91 s to 1.0 s after the call: the
    // tick due on the 2 s schedule never came, and the call kept the start's 3 s lag.
    const r = await rig()
    r.tell('1:4.0')
    r.tell('2:4.0')
    r.at(1000)
    r.tell('qc+stop:2,0')
    r.at(7000)
    r.tell('start')
    r.linkset.advanceTime(50)
    expect(r.ticks()).toBe(1)
    expect(tickTimes(r.linkset, r.ticks, 5050)).toEqual([8050, 12_050])
  })

  it('leaves no lag for a call made after the next tick on the old schedule', async () => {
    // In-world: a 3 s timer and a handler that slept 10 s and then called llSetTimerEvent(4),
    // stopped 4 s in and started at 5 s, or stopped 2 s in and started at 4 s, woke at 10 s to
    // one timer event and ticked 4.0 s after the call, then every 4 s.
    for (const [stopAt, startAt] of [[4000, 5000], [2000, 4000]] as const) {
      const r = await rig()
      r.tell('1:3.0')
      r.tell('10:10.0')
      r.at(stopAt)
      r.tell('stop')
      r.at(startAt)
      r.tell('start')
      expect(tickTimes(r.linkset, r.ticks, 18_100 - startAt)).toEqual([10_100, 14_100, 18_100])
    }
  })
})

describe('an SLua LLTimers timer after a stop, a start and a sleep in a queued handler', () => {
  // An SLua script set an LLTimers:every timer at 0 s, a control script stopped it at 1 s with a
  // link message queued whose handler slept, and started it again. Each case ran three times on
  // 2026-11-24, measured as above.
  async function sluaRig(interval: number, sleep: number, stopAt: number, startAt: number) {
    const loaded = await loadLinkset({ prims: [{ scripts: [
      { name: 't', language: 'slua', source: { source: `ticks = 0
        raw = 0
        LLEvents:on("timer", function() raw += 1 end)
        LLEvents:on("link_message", function(s, n, m, id)
          if n == 1 then LLTimers:every(tonumber(m), function() ticks += 1 end)
          elseif n == 7 then ll.Sleep(tonumber(m)) end
        end)` } },
      { name: 'ctl', source: { source: control } },
    ] }] })
    const t = loaded.scripts['t']!
    for (const s of Object.values(loaded.scripts)) s.start()
    const tell = (m: string) => loaded.scripts['ctl']!.fire('link_message', { sender_num: 1, num: 900, str: m, id: NULL_KEY })
    const at = (ms: number) => loaded.linkset.advanceTime(ms - loaded.linkset.clock.now)
    tell(`1:${interval / 1000}`)
    at(stopAt)
    tell(`q+stop:${sleep}`)
    at(startAt)
    tell('start')
    return { linkset: loaded.linkset, ticks: () => Number(t.global('ticks')), raw: () => Number(t.global('raw')) }
  }

  it('runs the callback once at the wake and then every interval from it', async () => {
    // In-world: a 4 s timer started at 5 s with a 4 s sleep queued ran its callback once at the
    // wake, 9 s, and then every 4.0 s; with a 6 s sleep once at 11 s and then every 4.0 s. A 1 s
    // timer stopped at 0.25 s and started at 1.75 s with a 5 s sleep ran it once at the wake and
    // then every 1.0 s. An LSL script woke to two timer events in each of these cases.
    for (const [interval, sleep, stopAt, startAt, wake] of [
      [4000, 4, 1000, 5000, 9000], [4000, 6, 1000, 5000, 11_000], [1000, 5, 250, 1750, 6750],
    ] as const) {
      const r = await sluaRig(interval, sleep, stopAt, startAt)
      const span = wake - startAt + 2 * interval + 100
      expect(tickTimes(r.linkset, r.ticks, span)).toEqual([wake + 50, wake + interval + 50, wake + 2 * interval + 50])
    }
  })

  it('raises one timer event at the wake', async () => {
    // In-world: an LLEvents timer handler next to the LLTimers timer counted one timer event at
    // the wake in each of the three runs of the 4 s timer with a 4 s sleep, and of the 1 s timer
    // with a 5 s sleep.
    for (const [interval, sleep, stopAt, startAt, wake] of [[4000, 4, 1000, 5000, 9000], [1000, 5, 250, 1750, 6750]] as const) {
      const r = await sluaRig(interval, sleep, stopAt, startAt)
      expect(tickTimes(r.linkset, r.raw, wake - startAt + 100)).toEqual([wake + 50])
    }
  })
})

describe('the timer events an LLEvents handler sees next to LLTimers', () => {
  // https://wiki.secondlife.com/wiki/LLTimers
  // LLTimers sets the script's timer to its next due callback after each tick. That timer lags as
  // an LSL timer does, so a tick can come before the callback is due: LLTimers runs nothing on it
  // and sets the timer again, and a raw timer handler sees that tick. Measured on the Aditi beta
  // grid, SLua Tideland, 2026-11-24, each case three times. Ticks in-world come at simulator
  // frames, about 22 ms apart, so a tick due a frame early also showed as a pair 22 ms apart.
  async function sluaRig() {
    const loaded = await loadLinkset({ prims: [{ scripts: [
      { name: 't', language: 'slua', source: { source: `ticks = 0
        raw = 0
        LLEvents:on("timer", function() raw += 1 end)
        LLEvents:on("link_message", function(s, n, m, id)
          if n == 1 then LLTimers:every(tonumber(m), function() ticks += 1 end)
          elseif n == 2 then LLTimers:once(tonumber(m), function() ticks += 1 end)
          elseif n == 7 then ll.Sleep(tonumber(m)) end
        end)` } },
      { name: 'ctl', source: { source: control } },
    ] }] })
    const t = loaded.scripts['t']!
    for (const s of Object.values(loaded.scripts)) s.start()
    const raw: number[] = []
    const callbacks: number[] = []
    /** Records the raw timer events and callbacks since the last look at the current virtual time. */
    const look = () => {
      for (const [name, out] of [['raw', raw], ['ticks', callbacks]] as const) {
        for (let n = Number(t.global(name)); out.length < n;) out.push(loaded.linkset.clock.now)
      }
    }
    const tell = (m: string) => {
      loaded.scripts['ctl']!.fire('link_message', { sender_num: 1, num: 900, str: m, id: NULL_KEY })
      look()
    }
    const at = (ms: number) => {
      loaded.linkset.advanceTime(ms - loaded.linkset.clock.now)
      look()
    }
    /** Raw timer events and callbacks from `from` on, by virtual time, until `until`. */
    const trace = (until: number, from = 0) => {
      for (; loaded.linkset.clock.now < until;) at(loaded.linkset.clock.now + 50)
      return { raw: raw.filter((t) => t >= from), callbacks: callbacks.filter((t) => t >= from) }
    }
    return { tell, at, trace }
  }

  /** A timer set at 0 by `set`, stopped at `stopAt` and started at `startAt`. */
  async function stopped(set: string, stopAt: number, startAt: number, queue?: string) {
    const r = await sluaRig()
    r.tell(set)
    r.at(stopAt)
    r.tell(queue === undefined ? 'stop' : `q+stop:${queue}`)
    r.at(startAt)
    r.tell('start')
    return r
  }

  it('sees a tick the start\'s lag brings before the callback is due', async () => {
    // In-world: LLTimers:every(4), stopped at 1 s and started at 5 s with a 4 s sleep queued, ran
    // its callback at the wake, 9.03 s. The timer then ticked at 12.05 s with no callback, 4 s
    // less the start's 1 s lag after the wake, and again at 13.03 s, where the callback ran.
    const slept = await stopped('1:4', 1000, 5000, '4')
    expect(slept.trace(17_100)).toEqual({ raw: [9000, 12_000, 13_000, 17_000], callbacks: [9000, 13_000, 17_000] })
    // In-world: started at 5 s with no sleep, it ran the callback at the start, ticked at 7.0 s
    // with no callback, and ran it at 8.0 s.
    const plain = await stopped('1:4', 1000, 5000)
    expect(plain.trace(8100)).toEqual({ raw: [5000, 7000, 8000], callbacks: [5000, 8000] })
  })

  it('sees an extra tick at once when the lag is as long as the time to the next callback', async () => {
    // In-world: LLTimers:every(4) stopped at 1 s and started at 6 s ran the callback at the start
    // and ticked again 22 ms later with no callback, then ran it at 8 s. Started at 7 s, 7.5 s and
    // 6.5 s it did the same; at 6.5 s the extra tick lagged the next by 1 s, so it also ticked at
    // 6.96 s with no callback. LLTimers:every(5) stopped at 1 s and started at 8 s ran the
    // callback at the start, ticked at 8.02 s and 9.0 s with no callback, and ran it at 10 s.
    for (const [startAt, raw] of [[6000, [6000, 6000, 8000]], [7000, [7000, 7000, 8000]], [7500, [7500, 7500, 8000]],
      [6500, [6500, 6500, 7000, 8000]]] as const) {
      const r = await stopped('1:4', 1000, startAt)
      expect(r.trace(8100)).toEqual({ raw, callbacks: [startAt, 8000] })
    }
    const five = await stopped('1:5', 1000, 8000)
    expect(five.trace(10_100)).toEqual({ raw: [8000, 8000, 9000, 10_000], callbacks: [8000, 10_000] })
  })

  it('sees no extra tick after a start that missed more than one tick', async () => {
    // In-world: LLTimers:every(3) stopped at 1 s and started at 7 s ticked at the start and at 10 s,
    // running the callback each time.
    const r = await stopped('1:3', 1000, 7000)
    expect(r.trace(10_100)).toEqual({ raw: [7000, 10_000], callbacks: [7000, 10_000] })
  })

  it('keeps the lag after the last timer is gone', async () => {
    // In-world: LLTimers:once(4), stopped at 1 s and started at 7 s, ran at the start. A new
    // LLTimers:once(1) at 9 s ticked 22 ms later with no callback and ran at 10 s; a new
    // LLTimers:once(5) at 9 s ticked at 11 s with no callback and ran at 14 s.
    const one = await stopped('2:4', 1000, 7000)
    one.at(9000)
    one.tell('2:1')
    expect(one.trace(10_100, 9000)).toEqual({ raw: [9000, 10_000], callbacks: [10_000] })
    const five = await stopped('2:4', 1000, 7000)
    five.at(9000)
    five.tell('2:5')
    expect(five.trace(14_100, 9000)).toEqual({ raw: [11_000, 14_000], callbacks: [14_000] })
  })

  it('starts a later timer early by the lag an earlier run left', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-24): LLTimers:once(4), stopped at 1 s with a 4 s
    // sleep queued and started at 5 s, ran at the wake, 9 s. A new LLTimers:every(4) set later
    // ticked 3.0 s after it with no callback and ran it at 4.0 s, in three runs: the start's 1 s lag
    // outlived the run.
    const plain = await stopped('2:4', 1000, 5000, '4')
    expect(plain.trace(14_000)).toEqual({ raw: [9050], callbacks: [9050] })
    plain.tell('1:4')
    expect(plain.trace(18_100, 14_000)).toEqual({ raw: [17_050, 18_000].map((t) => t + SIM_FRAME_MS), callbacks: [18_000 + SIM_FRAME_MS] })
  })

  it('sees no extra tick at a start when the earlier run\'s lag made it miss two ticks', async () => {
    // In-world: after that once(4) run, LLTimers:every(4) stopped at 1 s and started at 7 s ran the
    // callback at the start and at 8 s with no other tick, in two runs: its first tick, 1 s early
    // at 3 s, and the one at 7 s both fell while it was stopped, so the start left no lag. After a
    // run that left no lag, or after a script reset, the same timer ticked again at once with no
    // callback, in six runs. Started at 6.5 s, with one tick missed, it ticked again at once in two
    // runs; started at 7.5 s it did not, in two runs. An LSL script that set its timer as LLTimers
    // does gave the same in as many runs of each of these. A start at 7 s comes as the early second
    // tick falls due: after a once(4) run stopped at 1 s and started at 5 s with no sleep, which
    // leaves the same lag, the SLua script did not tick again and the LSL one did, in one run each.
    for (const [startAt, raw] of [[7000, [21_000, 22_000]], [6500, [20_500, 20_500, 22_000]], [7500, [21_500, 22_000]]] as const) {
      const r = await stopped('2:4', 1000, 5000, '4')
      r.trace(14_000)
      r.tell('1:4')
      r.at(15_000)
      r.tell('stop')
      r.at(14_000 + startAt)
      r.tell('start')
      expect(r.trace(22_100, 14_000)).toEqual({ raw, callbacks: [14_000 + startAt, 22_000] })
    }
  })

  it('sees the lag of a tick a sleep held back through one interval', async () => {
    // In-world: LLTimers:every(4) with a 2 s sleep from 3 s ran its callback at the wake, 5 s,
    // ticked at 7 s with no callback and ran it at 8 s. With a 5.5 s sleep it ran it at the wake,
    // 8.5 s, and next at 12.5 s, with no other tick.
    const held = await sluaRig()
    held.tell('1:4')
    held.at(3000)
    held.tell('7:2')
    expect(held.trace(8100)).toEqual({ raw: [5050, 7000, 8000].map((t) => t + SIM_FRAME_MS), callbacks: [5050, 8000].map((t) => t + SIM_FRAME_MS) })
    const longer = await sluaRig()
    longer.tell('1:4')
    longer.at(3000)
    longer.tell('7:5.5')
    expect(longer.trace(12_600)).toEqual({ raw: [8550, 12_550].map((t) => t + SIM_FRAME_MS), callbacks: [8550, 12_550].map((t) => t + SIM_FRAME_MS) })
  })

  it('sees one tick per callback for a timer that keeps time', async () => {
    // In-world: LLTimers:every(1), every(0.5) and every(2.5), and LLTimers:once(2), ran each
    // callback on time; the only ticks without one came a frame before it.
    for (const [set, times] of [['1:1', [1000, 2000, 3000]], ['1:0.5', [500, 1000, 1500, 2000, 2500, 3000]],
      ['1:2.5', [2500]], ['2:2', [2000]]] as const) {
      const r = await sluaRig()
      r.tell(set)
      const late = times.map((t) => t + SIM_FRAME_MS)
      expect(r.trace(3100)).toEqual({ raw: late, callbacks: late })
    }
  })
})

describe('the lag a held tick leaves', () => {
  it('lags a tick held through one interval and not one held through more', async () => {
    // In-world: a 4 s timer and a 5 s sleep in a fresh start ticked at the wake; the timer
    // handler called llSetTimerEvent(0), and llSetTimerEvent(4) 0.55 s later ticked 2.98 s and
    // 3.00 s after the call. With a 1 s or 2 s timer the call ticked 4.0 s after it, in three runs.
    // A 2 s timer and a 4 s sleep, held just past two intervals, ticked 4.0 s after the call in
    // two runs.
    for (const [interval, sleep, after] of [[4, 5, 3000], [2, 5, 4000], [1, 5, 4000], [2, 4, 4000]] as const) {
      const r = await rig()
      r.tell(`1:${interval}.0`)
      r.tell(`7:${sleep}.0`)
      r.at(sleep * 1000 + 100)
      expect(r.ticks()).toBe(1)
      r.tell('8:')
      r.at(sleep * 1000 + 550)
      r.tell('1:4.0')
      expect(tickTimes(r.linkset, r.ticks, 4100)).toEqual([sleep * 1000 + 550 + after])
    }
  })

  it('does not lag a held tick that a call let run after more than one interval', async () => {
    // In-world: a 3 s timer and a handler that slept 10 s and then called llSetTimerEvent(4): the
    // held tick still ran, and llSetTimerEvent(4) in its handler ticked 4.0 s after the call, in
    // two runs.
    const r = await rig()
    r.tell('1:3.0')
    r.tell('2:4.0')
    r.tell('10:10.0')
    r.at(10_200)
    expect(r.ticks()).toBe(1)
    expect(tickTimes(r.linkset, r.ticks, 4100)).toEqual([14_150])
  })

  it('lags a tick llMinEventDelay held back for less than an interval', async () => {
    // In-world: llMinEventDelay(2.5) and llSetTimerEvent(2) ticked 2.51 s after the call, and
    // llSetTimerEvent(4) in that timer handler ticked 3.49 s later, in two runs. With
    // llMinEventDelay(3) the tick came at 3.0 s and the next 3.0 s after the call.
    for (const [delay, first, after] of [[2.5, 2500, 3500], [3, 3000, 3000]] as const) {
      const r = await rig()
      r.tell(`4:${delay}`)
      r.tell('2:4.0')
      r.tell('1:2.0')
      expect(tickTimes(r.linkset, r.ticks, first + after + 100)).toEqual([first, first + after])
    }
  })

  it('does not lag a tick llMinEventDelay held back for more than an interval', async () => {
    // In-world: llMinEventDelay(2) and llSetTimerEvent(0.5) ticked 2.0 s after the call, and
    // llSetTimerEvent(4) in that timer handler ticked 4.0 s later, in two runs. With
    // llMinEventDelay(3) the tick came at 3.0 s and the next 4.0 s after it.
    for (const delay of [2, 3]) {
      const r = await rig()
      r.tell(`4:${delay}`)
      r.tell('2:4.0')
      r.tell('1:0.5')
      r.at(100)
      expect(tickTimes(r.linkset, r.ticks, delay * 1000 + 4100)).toEqual([delay * 1000 + 50, delay * 1000 + 4050])
    }
  })

  it('ticks once per delay when llMinEventDelay is longer than the interval', async () => {
    // In-world: llMinEventDelay(2.5) and llSetTimerEvent(2) ticked at 2.51, 5.02, 7.53 and
    // 10.04 s, in two runs; llMinEventDelay(3) ticked every 3.0 s.
    const r = await rig()
    r.tell('4:2.5')
    r.tell('1:2.0')
    expect(tickTimes(r.linkset, r.ticks, 10_100)).toEqual([2500, 5000, 7500, 10_000].map((t) => t + 2 * SIM_FRAME_MS))
  })
})

describe('a timer handler that sleeps', () => {
  it('ticks as each sleep ends when the sleep is longer than the interval', async () => {
    // In-world: a 1 s timer whose handler slept 1.5 s ticked every 1.56 s, and one whose handler
    // slept 1.2 s every 1.27 s: as each handler ended, with the region's own delay on top.
    for (const [sleep, want] of [[1.5, [1000, 2550, 4090, 5630, 7180]], [1.2, [1000, 2250, 3490, 4730, 5980]]] as const) {
      const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 's', source: { source: `
        integer ticks;
        default {
          state_entry() { llSetTimerEvent(1.0); }
          timer() { ++ticks; llSleep(${sleep}); }
        }
      ` } }] }] })
      const s = scripts['s']!
      s.start()
      // A float sleep runs a fraction of a millisecond over, so read the times to the nearest 10 ms.
      const times = tickTimes(linkset, () => s.global('ticks') as number, 1000 + 4 * (sleep * 1000 + 2 * SIM_FRAME_MS) + 50, 1)
      expect(times.map((t) => Math.round(t / 10) * 10)).toEqual(want)
    }
  })
})
