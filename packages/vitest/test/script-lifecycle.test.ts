import { describe, expect, it } from 'vitest'
import { loadLinkset, loadScript, loadRlvPair, seedRlvInventory, World, makeInventoryItem, InventoryType, NULL_KEY, DEBUG_CHANNEL, type Linkset, type Script } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlSetScriptState
// https://wiki.secondlife.com/wiki/LlResetOtherScript
//
// Measured on the Aditi beta grid, SLua Tideland, Firestorm viewer, 2026-11-13
// and 2026-11-14.
// One prim held the script under test, a control script that called
// llSetScriptState, llResetOtherScript and llMessageLinked on a fixed
// schedule, and a logger that collected what the script under test reported
// by link message, each line with its llGetTimestamp. A second object said
// chat on the script's channel when the control script asked it to. The
// script under test ran as LSL on Mono and again as SLua.

const target = `integer g; integer ticks; integer scans; list log;
  default {
    state_entry() { log += "entry default " + (string)g; llListen(7, "", NULL_KEY, ""); }
    link_message(integer s, integer n, string m, key k) {
      if (n == 900) return;
      if (n == 100) {
        llRequestAgentData(llGetOwner(), DATA_NAME);
        llHTTPRequest("https://example.com/", [], "");
        llSensor("", NULL_KEY, AGENT, 20.0, PI);
        llSetTimerEvent(3.0);
        llSetScriptState(llGetScriptName(), FALSE);
        log += "after self-stop";
        return;
      }
      if (n == 300) { log += "sleep start"; llSleep(10.0); log += "sleep end"; return; }
      if (n == 500) { llSetTimerEvent((float)m); llSensorRepeat("", NULL_KEY, AGENT, 20.0, PI, (float)m); return; }
      if (n == 600) { g = 42; state two; }
      log += "lm " + m;
    }
    listen(integer c, string n, key k, string m) { log += "heard " + m; }
    touch_start(integer n) { log += "touch_start"; }
    touch_end(integer n) { log += "touch_end"; }
    timer() { ++ticks; }
    sensor(integer n) { ++scans; }
    no_sensor() { ++scans; }
    dataserver(key q, string d) { log += "dataserver " + d; }
    http_response(key q, integer st, list meta, string body) { log += "http " + (string)st; }
    linkset_data(integer a, string n, string v) { log += "lsd " + v; }
    changed(integer c) { log += "changed " + (string)c; }
  }
  state two {
    state_entry() { log += "entry two " + (string)g; llListen(7, "", NULL_KEY, ""); llSetTimerEvent(3.0); }
    link_message(integer s, integer n, string m, key k) { if (n != 900) log += "two lm " + m; }
    timer() { ++ticks; }
  }`

const control = `list states;
  default {
    link_message(integer s, integer n, string m, key k) {
      if (n != 900) return;
      if (m == "stop") llSetScriptState("t", FALSE);
      else if (m == "start") llSetScriptState("t", TRUE);
      else if (m == "start+stop") { llSetScriptState("t", TRUE); llSetScriptState("t", FALSE); }
      else if (m == "send+stop") { llMessageLinked(LINK_THIS, 1, "queued before stop", ""); llSetScriptState("t", FALSE); }
      else if (m == "send+reset+send") {
        llMessageLinked(LINK_THIS, 1, "before reset", "");
        llResetOtherScript("t");
        llMessageLinked(LINK_THIS, 1, "after reset 1", "");
        llMessageLinked(LINK_THIS, 1, "after reset 2", "");
        states += llGetScriptState("t");
      }
      else if (m == "reset+wait+send") { llResetOtherScript("t"); llSleep(0.1); llMessageLinked(LINK_THIS, 1, "0.1 s after reset", ""); }
      else if (m == "reset+stop+send") {
        llResetOtherScript("t");
        llSetScriptState("t", FALSE);
        llMessageLinked(LINK_THIS, 1, "after reset and stop", "");
        states += llGetScriptState("t");
      }
      else if (m == "lsd") llLinksetDataWrite("k", (string)llGetTime());
      else if (m == "color") llSetColor(<1.0, 0.0, 0.0>, ALL_SIDES);
      else if (llGetSubString(m, 0, 3) == "num:") llMessageLinked(LINK_THIS, (integer)llGetSubString(m, 4, -1), "", "");
      else if (llGetSubString(m, 0, 3) == "msg:") llMessageLinked(LINK_THIS, (integer)llGetSubString(m, 4, 4), llGetSubString(m, 6, -1), "");
      else if (llGetSubString(m, 0, 6) == "q+stop:") {
        llMessageLinked(LINK_THIS, (integer)llGetSubString(m, 7, 7), llGetSubString(m, 9, -1), "");
        llSetScriptState("t", FALSE);
      }
      else llMessageLinked(LINK_THIS, 1, m, "");
    }
  }`

const timed = `list log;
  default {
    link_message(integer s, integer n, string m, key k) {
      if (n == 1) { llSetTimerEvent((float)m); log += "set " + m; }
      else if (n == 2) { llSetTimerEvent(0.0); log += "off"; }
      else if (n == 3) { llSetTimerEvent(2.0); llSetTimerEvent(10.0); }
      else if (n == 7) { float d = (float)m; if (d <= 0.0) d = 5.0; llSleep(d); }
      else if (n == 8) { integer z; z = 1 / z; }
      else if (n == 9) { llSleep(2.0); llSetTimerEvent(4.0); }
      else if (n == 0) { llSleep(5.0); llSetTimerEvent(10.0); }
      else if (n == 4) { llSetTimerEvent(3.0); log += "sleep start"; llSleep(10.0); log += "sleep end"; }
      else if (n == 5) { llSetTimerEvent(4.0); llSensorRepeat("", NULL_KEY, AGENT, 20.0, PI, 4.0); }
      else if (n == 6) log += "lm";
    }
    timer() { log += "timer"; }
    sensor(integer n) { log += "scan"; }
    no_sensor() { log += "scan"; }
  }`

const mouth = 'default { link_message(integer s, integer n, string m, key k) { llSay(7, m); } }'

async function rig(source: { source: string; filename?: string } = { source: target }, language?: 'slua', owner?: string) {
  const loaded = await loadLinkset({ ...(owner ? { owner } : {}), prims: [
    { scripts: [{ name: 't', source, ...(language ? { language } : {}) }, { name: 'ctl', source: { source: control } }] },
    { scripts: [{ name: 'mouth', source: { source: mouth } }] },
  ] })
  const t = loaded.scripts['t']!
  const ctl = loaded.scripts['ctl']!
  for (const s of Object.values(loaded.scripts)) s.start()
  const tell = (m: string) => ctl.fire('link_message', { sender_num: 1, num: 900, str: m, id: NULL_KEY })
  const say = (m: string) => loaded.scripts['mouth']!.fire('link_message', { sender_num: 1, num: 0, str: m, id: NULL_KEY })
  return { ...loaded, t, ctl, tell, say }
}

/** Virtual times, in ms, at which `read()` changed while the clock ran for `ms`. */
function changes(linkset: Linkset, read: () => unknown, ms: number): number[] {
  const out: number[] = []
  let last = read()
  for (let elapsed = 0; elapsed < ms; elapsed += 50) {
    linkset.advanceTime(50)
    const now = read()
    if (now !== last) out.push(linkset.clock.now)
    last = now
  }
  return out
}

/** Offsets from `start`, in ms, at which the script's timer and sensor fired while the clock ran to `start + ms`. */
function fired(linkset: Linkset, k: Script, ms: number, start = linkset.clock.now): { ticks: number[]; scans: number[] } {
  const ticks: number[] = []
  const scans: number[] = []
  let last = [k.global('ticks'), k.global('scans')]
  while (linkset.clock.now < start + ms) {
    linkset.advanceTime(50)
    const now = [k.global('ticks'), k.global('scans')]
    if (now[0] !== last[0]) ticks.push(linkset.clock.now - start)
    if (now[1] !== last[1]) scans.push(linkset.clock.now - start)
    last = now
  }
  return { ticks, scans }
}

describe('a script stopped with llSetScriptState', () => {
  it('never gets what was sent while it was stopped', async () => {
    // In-world: the script was stopped for 18 s. In that time it was sent a
    // link message, chat on its channel and a linkset data write, its prim
    // changed colour and the owner touched it. After llSetScriptState(TRUE)
    // none of them arrived. The same three sent 9 s later all did.
    const { t, tell, say, linkset } = await rig()
    tell('stop')
    tell('while stopped')
    say('chat while stopped')
    tell('lsd')
    tell('color')
    linkset.touch(1)
    t.fire('touch_start', { num_detected: 1 })
    linkset.advanceTime(18_000)
    tell('start')
    linkset.advanceTime(9000)
    expect(t.global('log')).toEqual(['entry default 0'])
    tell('after start')
    say('chat after start')
    tell('lsd')
    expect(t.global('log')).toEqual(['entry default 0', 'lm after start', 'heard chat after start', 'lsd 27.000000'])
  })

  it('never gets a dataserver reply or an HTTP response that came while it was stopped', async () => {
    // In-world: the script called llRequestAgentData and llHTTPRequest, then
    // stopped itself with llSetScriptState in the same handler. Started 8 s
    // later it got neither event. The statement after the llSetScriptState
    // call ran only then: a script that stops itself stops at once and carries
    // on from there when it is started.
    const { t, tell, linkset } = await rig()
    tell('num:100')
    linkset.advanceTime(1000)
    expect(t.running).toBe(false)
    expect(t.global('log')).toEqual(['entry default 0'])
    t.respondToDataserver(t.dataserverRequests[0]!.key, 'i doll')
    t.respondToHttp(t.httpRequests[0]!.key, { status: 200, body: 'ok' })
    linkset.advanceTime(7000)
    tell('start')
    linkset.advanceTime(1000)
    expect(t.global('log')).toEqual(['entry default 0', 'after self-stop'])
  })

  it('runs an llSensor scan that fell due while it was stopped when it starts', async () => {
    // In-world: llSensor then llSetScriptState on itself in one handler. The
    // sensor event came 20 ms after llSetScriptState(TRUE), 8 s later, and a
    // 3 s timer set before the stop ticked at the same moment.
    const { t, tell, linkset } = await rig()
    tell('num:100')
    linkset.advanceTime(8000)
    expect([t.global('scans'), t.global('ticks')]).toEqual([0, 0])
    tell('start')
    expect([t.global('scans'), t.global('ticks')]).toEqual([1, 1])
    linkset.advanceTime(2900)
    expect([t.global('scans'), t.global('ticks')]).toEqual([1, 1])
    linkset.advanceTime(200)
    expect([t.global('scans'), t.global('ticks')]).toEqual([1, 2])
  })

  it('gets an event that was already queued when it stopped, once it runs again', async () => {
    // In-world: llMessageLinked then llSetScriptState(FALSE) in one handler,
    // llSetScriptState(TRUE) 5 s later -> the message arrived right after the
    // start. A dataserver reply that reached the script 60 ms before it was
    // stopped arrived the same way 8 s later; the HTTP response that came
    // after the stop never did.
    const { t, tell, linkset } = await rig()
    tell('send+stop')
    linkset.advanceTime(5000)
    expect(t.global('log')).toEqual(['entry default 0'])
    tell('start')
    expect(t.global('log')).toEqual(['entry default 0', 'lm queued before stop'])
  })

  it('finishes a sleep while stopped and keeps only the events queued before the stop', async () => {
    // In-world: a handler began a 10 s llSleep. Message A came 2 s in, the
    // script was stopped 4 s in, message B came 5 s in and C 14 s in, the
    // script was started 16 s in and D came a second later. The handler
    // carried on at the start, then A and D arrived. B and C never did.
    const { t, tell, linkset } = await rig()
    linkset.clock.schedule(t, linkset.clock.now, 'link_message', { sender_num: 1, num: 300, str: '', id: NULL_KEY })
    linkset.advanceTime(2000)
    tell('A')
    linkset.advanceTime(2000)
    tell('stop')
    linkset.advanceTime(1000)
    tell('B')
    linkset.advanceTime(9000)
    tell('C')
    linkset.advanceTime(2000)
    expect(t.global('log')).toEqual(['entry default 0', 'sleep start'])
    tell('start')
    expect(t.global('log')).toEqual(['entry default 0', 'sleep start', 'sleep end', 'lm A'])
    linkset.advanceTime(1000)
    tell('D')
    expect(t.global('log')).toEqual(['entry default 0', 'sleep start', 'sleep end', 'lm A', 'lm D'])
  })

  it('keeps its timer and sensor schedule when no tick fell due while it was stopped', async () => {
    // In-world: llSetTimerEvent(6) and llSensorRepeat(..., 6) at 0 s, stopped
    // from 1.0 s to 3.1 s -> timer and sensor at 6.0 s and 12.0 s.
    const { t, tell, linkset } = await rig()
    linkset.deliverLinkMessage(1, 1, 500, '6.0', NULL_KEY)
    linkset.drainQueue()
    linkset.advanceTime(1000)
    tell('stop')
    linkset.advanceTime(2100)
    tell('start')
    expect(changes(linkset, () => t.global('ticks'), 10_000)).toEqual([6000, 12_000])
    expect(t.global('scans')).toBe(2)
  })

  it('ticks once at the start for the ticks it missed, then on the old schedule if that is still ahead', async () => {
    // In-world: 4 s timer and sensor set at 0 s, ticks at 4 s and 8 s, stopped
    // at 8.6 s (the 12 s tick fell due while stopped), started at 15.2 s ->
    // timer at 15.2 s, 16.0 s, 20.0 s and 24.0 s; sensor at 15.2 s, 19.2 s
    // and 23.2 s. A 3 s timer missed one tick over a 3.1 s stop and kept its
    // old schedule the same way.
    const { t, tell, linkset } = await rig()
    linkset.deliverLinkMessage(1, 1, 500, '4.0', NULL_KEY)
    linkset.drainQueue()
    linkset.advanceTime(8600)
    expect([t.global('ticks'), t.global('scans')]).toEqual([2, 2])
    tell('stop')
    linkset.advanceTime(6600)
    expect([t.global('ticks'), t.global('scans')]).toEqual([2, 2])
    tell('start')
    expect([t.global('ticks'), t.global('scans')]).toEqual([3, 3])
    expect(fired(linkset, t, linkset.clock.now + 9000, 0)).toEqual({ ticks: [16_000, 20_000, 24_000], scans: [19_200, 23_200] })
  })

  it('starts a full interval again when more than one tick was missed', async () => {
    // In-world: 4 s timer and sensor set at 0 s, tick at 4 s, stopped at 4.6 s
    // (the 8 s and 12 s ticks fell due while stopped), started at 14.1 s ->
    // timer and sensor at 14.1 s, 18.1 s and 22.1 s. An 18 s stop of a 4 s
    // timer and a 9 s stop of a 6 s timer did the same.
    const { t, tell, linkset } = await rig()
    linkset.deliverLinkMessage(1, 1, 500, '4.0', NULL_KEY)
    linkset.drainQueue()
    linkset.advanceTime(4600)
    tell('stop')
    linkset.advanceTime(9500)
    tell('start')
    expect([t.global('ticks'), t.global('scans')]).toEqual([2, 2])
    expect(changes(linkset, () => t.global('ticks'), 8500)).toEqual([18_100, 22_100])
    expect(t.global('scans')).toBe(4)
  })

  it('ticks before it scans when both were missed, after the events that were waiting', async () => {
    // In-world: every start with a missed tick and a missed scan gave the
    // timer event first and the sensor event 20 to 30 ms later; a link message
    // queued before the stop came before both.
    const { t, tell, linkset } = await rig({ source: timed })
    tell('num:5')
    linkset.advanceTime(4500)
    tell('q+stop:6:')
    linkset.advanceTime(6000)
    const before = (t.global('log') as string[]).length
    tell('start')
    expect((t.global('log') as string[]).slice(before)).toEqual(['lm', 'timer', 'scan'])
  })

  it('gets no late tick when an event that was waiting turns the timer off', async () => {
    // In-world: llSetTimerEvent(4) at 0 s. At 1 s one handler sent the script
    // a link message whose handler calls llSetTimerEvent(0), then stopped it.
    // Started at 7 s, it ran that handler and no timer event followed.
    const { t, tell, linkset } = await rig({ source: timed })
    tell('msg:1:4.0')
    linkset.advanceTime(1000)
    tell('q+stop:2:')
    linkset.advanceTime(6000)
    tell('start')
    linkset.advanceTime(6000)
    expect(t.global('log')).toEqual(['set 4.0', 'off'])
  })

  it('still gets the late tick when a waiting event sets a new interval, and counts the new interval from the missed tick', async () => {
    // In-world: llSetTimerEvent(4) at 0 s (tick due at 4.0 s). At 1 s one
    // handler sent a link message whose handler calls llSetTimerEvent(5),
    // then stopped the script. Started at 7.1 s, it ran that handler, got a
    // timer event 30 ms later, and the next at 9.0 s, 14.0 s and 19.0 s. The
    // same llSetTimerEvent(5) in a script that was never stopped gave the
    // first tick 5.0 s after the call.
    const { t, tell, linkset } = await rig({ source: timed })
    tell('msg:1:4.0')
    linkset.advanceTime(1000)
    tell('q+stop:1:5.0')
    linkset.advanceTime(6100)
    tell('start')
    expect(t.global('log')).toEqual(['set 4.0', 'set 5.0', 'timer'])
    expect(changes(linkset, () => (t.global('log') as string[]).length, 8000)).toEqual([9000, 14_000])
  })

  it('gets one tick when it is stopped and started during a sleep, and the interval starts again from there', async () => {
    // In-world: a handler ran llSetTimerEvent(3) and llSleep(10). The script
    // was stopped 4 s in and started 5 s in. The sleep ended at 10.0 s, one
    // timer event followed 60 ms later, and the next came at 13.0 s and
    // 16.0 s.
    const { t, tell, linkset } = await rig({ source: timed })
    linkset.clock.schedule(t, linkset.clock.now, 'link_message', { sender_num: 1, num: 4, str: '', id: NULL_KEY })
    linkset.advanceTime(4000)
    tell('stop')
    linkset.advanceTime(1000)
    tell('start')
    linkset.advanceTime(4950)
    expect(t.global('log')).toEqual(['sleep start'])
    linkset.advanceTime(50)
    expect(t.global('log')).toEqual(['sleep start', 'sleep end', 'timer'])
    expect(changes(linkset, () => (t.global('log') as string[]).length, 6500)).toEqual([13_000, 16_000])
  })

  it('never gets a collision that happened while it was stopped', async () => {
    // In-world: a physical ball dropped on the script's prim gave three
    // collision_start and collision_end pairs as it bounced. Dropped again
    // while the script was stopped, it gave none, also after the start 12 s
    // later. A third drop after the start gave three pairs again. A control
    // event for a stopped script is not measured: it needs control input
    // from an avatar, which the viewer tools used here cannot send. rezless
    // drops it like every other kind.
    const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [
      { name: 't', source: { source: 'integer hits; default { collision_start(integer n) { ++hits; } collision_end(integer n) { ++hits; } }' } },
      { name: 'ctl', source: { source: control } },
    ] }] })
    const t = scripts['t']!
    const ctl = scripts['ctl']!
    t.start()
    ctl.start()
    const tell = (m: string) => ctl.fire('link_message', { sender_num: 1, num: 900, str: m, id: NULL_KEY })
    const bounce = () => {
      for (const event of ['collision_start', 'collision_end']) {
        t.fire(event, { num_detected: 1, detected: [{ key: '22222222-2222-2222-2222-222222222222', name: 'ball' }] })
      }
    }
    bounce()
    expect(t.global('hits')).toBe(2)
    tell('stop')
    bounce()
    linkset.advanceTime(12_000)
    tell('start')
    linkset.advanceTime(1000)
    expect(t.global('hits')).toBe(2)
    bounce()
    expect(t.global('hits')).toBe(4)
  })

  it('keeps the missed tick\'s place when it is started, stopped and started again before the tick fires', async () => {
    const { t, tell, linkset } = await rig({ source: timed })
    tell('msg:1:4.0')
    linkset.advanceTime(1000)
    tell('stop')
    linkset.advanceTime(4000)
    tell('start+stop')
    linkset.advanceTime(1000)
    tell('start')
    expect(t.global('log')).toEqual(['set 4.0', 'timer'])
    expect(changes(linkset, () => (t.global('log') as string[]).length, 6500)).toEqual([8000, 12_000])
  })

  it('catches up the same way when a test starts it with script.running', async () => {
    const { t, linkset } = await rig()
    linkset.deliverLinkMessage(1, 1, 500, '4.0', NULL_KEY)
    linkset.drainQueue()
    linkset.advanceTime(4600)
    t.running = false
    linkset.advanceTime(9500)
    t.running = true
    linkset.advanceTime(0)
    expect([t.global('ticks'), t.global('scans')]).toEqual([2, 2])
    linkset.advanceTime(8500)
    expect([t.global('ticks'), t.global('scans')]).toEqual([4, 4])
  })

  it('treats an SLua script the same way', async () => {
    // In-world, the SLua script: a link message, chat and a linkset data
    // write sent while it was stopped never arrived; a link message queued in
    // the handler that stopped it arrived at the start. Its LLTimers:every(4)
    // timer, stopped from 8.5 s to 15.1 s, fired at 15.1 s, 16.0 s and
    // 20.0 s; stopped from 4.5 s to 14.0 s it fired at 14.0 s and 18.0 s.
    const { t, tell, say, linkset } = await rig({ filename: 't.luau', source: `
      log = {}
      ticks = 0
      ll.Listen(7, "", NULL_KEY, "")
      LLEvents:on("link_message", function(s, n, m, k) if n ~= 900 then table.insert(log, "lm " .. m) end end)
      LLEvents:on("listen", function(c, n, k, m) table.insert(log, "heard " .. m) end)
      LLEvents:on("linkset_data", function(a, n, v) table.insert(log, "lsd") end)
      LLTimers:every(4, function() ticks += 1 end)
    ` }, 'slua')
    linkset.advanceTime(8500)
    tell('stop')
    tell('while stopped')
    say('chat while stopped')
    tell('lsd')
    linkset.advanceTime(6600)
    tell('start')
    expect(t.global('log')).toEqual([])
    expect(t.global('ticks')).toBe(3)
    expect(changes(linkset, () => t.global('ticks'), 5500)).toEqual([16_000, 20_000])
    tell('send+stop')
    linkset.advanceTime(3000)
    tell('start')
    expect(t.global('log')).toEqual(['lm queued before stop'])
  })
})

describe('llSetTimerEvent after a start that caught up on a missed tick', () => {
  // In-world: one prim held the timed script and a control script that sent it
  // llSetTimerEvent calls by link message and stopped and started it on a fixed
  // schedule, each step logged with llGetTimestamp (Aditi, SLua Tideland,
  // 2026-11-23). In every run that started with one tick missed, a later
  // llSetTimerEvent(t) gave its first tick t minus the start's lateness after
  // the call, within a frame, then one every t.
  async function caughtUp(stopAt: number, startAt: number, how = 'q+stop:2:') {
    const r = await rig({ source: timed })
    r.tell('msg:1:4.0')
    r.linkset.advanceTime(stopAt)
    r.tell(how)
    r.linkset.advanceTime(startAt - stopAt)
    r.tell('start')
    const ticks = () => (r.t.global('log') as string[]).filter((l) => l === 'timer').length
    const at = (ms: number) => r.linkset.advanceTime(ms - r.linkset.clock.now)
    return { ...r, ticks, at }
  }

  it('counts the new interval from as late as the missed tick was', async () => {
    // In-world: llSetTimerEvent(4) at 0 s; at 1 s a link message whose handler
    // calls llSetTimerEvent(0) was queued and the script stopped; started at
    // 7 s (the 4 s tick 3 s late). llSetTimerEvent(4) at 10 s -> ticks at
    // 11.07, 15.07 and 19.07 s. A call 0.5 s after the start ticked 1.0 s after
    // it, and one 33 s after the start 1.0 s after it.
    const { tell, at, linkset, ticks } = await caughtUp(1000, 7000)
    at(10_000)
    tell('msg:1:4.0')
    expect(changes(linkset, ticks, 9500)).toEqual([11_000, 15_000, 19_000])
    const late = await caughtUp(1000, 7000)
    late.at(40_000)
    late.tell('msg:1:4.0')
    expect(changes(late.linkset, late.ticks, 2000)).toEqual([41_000])
  })

  it('takes the lateness of the missed tick, whatever the intervals', async () => {
    // In-world: started 4.5 s after a stop at 1 s (the 4 s tick 1.4 s late),
    // llSetTimerEvent(4) 3.5 s after the start -> tick 2.6 s after the call.
    // Started 3 s late, llSetTimerEvent(8) 5.5 s after the start -> 5.0 s after
    // the call, then 8 s later.
    const short = await caughtUp(1000, 5500)
    short.at(9000)
    short.tell('msg:1:4.0')
    expect(changes(short.linkset, short.ticks, 3000)).toEqual([11_500])
    const long = await caughtUp(1000, 7000)
    long.at(12_500)
    long.tell('msg:1:8.0')
    expect(changes(long.linkset, long.ticks, 14_000)).toEqual([17_500, 25_500])
  })

  it('fires at once when the interval is shorter than the lateness, then an interval after it was due', async () => {
    // In-world: started 3 s late, llSetTimerEvent(2) 3 s after the start -> a
    // tick 20 ms after the call, then 1.0 s after the call and every 2 s.
    const { tell, at, linkset, ticks } = await caughtUp(1000, 7000)
    at(10_000)
    tell('msg:1:2.0')
    expect(ticks()).toBe(1)
    expect(changes(linkset, ticks, 5500)).toEqual([11_000, 13_000, 15_000])
  })

  it('keeps the lateness when the caught-up tick ran and the timer was turned off before the next', async () => {
    // In-world: stopped at 1 s with no message queued, started at 7 s -> a tick
    // at the start; llSetTimerEvent(0) 0.5 s later; llSetTimerEvent(4) at 10 s
    // -> ticks at 11.0, 15.0 and 19.0 s.
    const { tell, at, linkset, ticks } = await caughtUp(1000, 7000, 'stop')
    expect(ticks()).toBe(1)
    at(7500)
    tell('msg:2:')
    at(10_000)
    tell('msg:1:4.0')
    expect(changes(linkset, ticks, 9500)).toEqual([11_000, 15_000, 19_000])
  })

  it('keeps the lateness through another stop and start with no tick missed', async () => {
    // In-world: started 3 s late at 7 s, stopped at 8 s and started at 8.5 s,
    // llSetTimerEvent(4) at 10 s -> tick at 11.0 s.
    const { tell, at, linkset, ticks } = await caughtUp(1000, 7000)
    at(8000)
    tell('stop')
    at(8500)
    tell('start')
    at(10_000)
    tell('msg:1:4.0')
    expect(changes(linkset, ticks, 2000)).toEqual([11_000])
  })

  it('drops the lateness once a tick after the caught-up one has run', async () => {
    // In-world: started 3 s late, llSetTimerEvent(4) at 10 s ticked at 11.0 s;
    // llSetTimerEvent(4) again at 13 s ticked at 17, 21 and 25 s. Stopped with
    // no message queued and left running after the start, it ticked at 7, 8, 12
    // and 16 s, and llSetTimerEvent(4) at 17.5 s ticked at 21.5 s.
    const { tell, at, linkset, ticks } = await caughtUp(1000, 7000)
    at(10_000)
    tell('msg:1:4.0')
    at(13_000)
    expect(ticks()).toBe(1)
    tell('msg:1:4.0')
    expect(changes(linkset, ticks, 9000)).toEqual([17_000, 21_000])
    const running = await caughtUp(1000, 7000, 'stop')
    expect(changes(running.linkset, running.ticks, 10_000)).toEqual([8000, 12_000, 16_000])
    running.at(17_500)
    running.tell('msg:1:4.0')
    expect(changes(running.linkset, running.ticks, 4500)).toEqual([21_500])
  })

  it('takes the lag of a tick a call made due at once', async () => {
    // In-world: started 3 s late, llSetTimerEvent(2) 3 s after the start ticked
    // 20 ms after the call, 1.0 s late on its schedule. llSetTimerEvent(4) 0.47 s
    // after that call ticked 2.98 s after it, then every 4 s.
    const { tell, at, linkset, ticks } = await caughtUp(1000, 7000)
    at(10_000)
    tell('msg:1:2.0')
    expect(ticks()).toBe(1)
    at(10_500)
    tell('msg:1:4.0')
    expect(changes(linkset, ticks, 8000)).toEqual([13_500, 17_500])
  })

  it('lets a second call in the same handler replace a tick the first made due at once', async () => {
    // In-world: started 3 s late, llSetTimerEvent(2.0) then llSetTimerEvent(10.0)
    // in one handler 3 s after the start -> no tick at the call; ticks 7.0 s
    // after it and 10 s later.
    const { tell, at, linkset, ticks } = await caughtUp(1000, 7000)
    at(10_000)
    tell('msg:3:')
    expect(ticks()).toBe(0)
    expect(changes(linkset, ticks, 18_000)).toEqual([17_000, 27_000])
  })

  it('has no lag once ticks after the caught-up one have run during a sleep', async () => {
    // In-world: a link message whose handler sleeps 5 s was queued and the
    // script stopped at 1 s; started at 7 s (3 s late), it slept to 12 s and
    // then got its timer events. llSetTimerEvent(4) at 13 s ticked at 17 s.
    // That run gave three timer events within 0.1 s of the wake. Three more runs of
    // the same on 2026-11-23 gave two, the caught-up tick and the one due during
    // the sleep, 45 ms apart (see timer-after-sleep.test.ts).
    const { tell, at, linkset, ticks } = await caughtUp(1000, 7000, 'q+stop:7:')
    at(12_100)
    expect(ticks()).toBe(2)
    at(13_000)
    tell('msg:1:4.0')
    expect(changes(linkset, ticks, 4500)).toEqual([17_000])
  })

  it('takes the lag of a tick that ran late behind a busy handler', async () => {
    // In-world: started 2.9 s late, llSetTimerEvent(4) 3.0 s after the start made a tick due
    // 1.1 s later. A handler that slept 2 s and then called llSetTimerEvent(4) held that tick
    // back; it ran right after the handler, 1.0 s late. llSetTimerEvent(4) 0.36 s later ticked
    // 3.0 s after the call, then every 4 s.
    const { tell, at, linkset, ticks } = await caughtUp(1000, 7000)
    at(10_000)
    tell('msg:1:4.0')
    tell('msg:9:')
    at(12_000)
    expect(ticks()).toBe(1)
    at(12_400)
    tell('msg:1:4.0')
    expect(changes(linkset, ticks, 8000)).toEqual([15_400, 19_400])
  })

  it('takes the lag of a tick held through a sleep from the wake, not from when it runs', async () => {
    // In-world: llSetTimerEvent(10), then a handler slept from 7.9 s to 12.9 s and a second,
    // waiting, from 12.9 s to 17.9 s. The tick ran after the second sleep, 8.0 s late, and
    // llSetTimerEvent(10) 0.44 s later ticked 7.09 s after the call: the lag was the 2.9 s
    // the tick was late at the first wake.
    const { t, tell, linkset } = await rig({ source: timed })
    const ticks = () => (t.global('log') as string[]).filter((l) => l === 'timer').length
    tell('msg:1:10.0')
    linkset.advanceTime(8000)
    tell('msg:7:')
    linkset.advanceTime(500)
    tell('msg:7:')
    linkset.advanceTime(9600)
    expect(ticks()).toBe(1)
    linkset.advanceTime(400)
    tell('msg:1:10.0')
    expect(changes(linkset, ticks, 8000)).toEqual([25_500])
  })

  it('takes the lag of a tick a sleeping handler kept, from when a waiting handler went ahead of it', async () => {
    // As measured above for a tick released at a wake: the lag is how late the tick was when the
    // waiting handler started, not when the tick ran.
    const { t, tell, linkset } = await rig({ source: timed })
    const ticks = () => (t.global('log') as string[]).filter((l) => l === 'timer').length
    tell('msg:1:10.0')
    linkset.advanceTime(8000)
    tell('msg:0:')
    linkset.advanceTime(500)
    tell('msg:7:')
    linkset.advanceTime(10_000)
    expect(ticks()).toBe(1)
    tell('msg:1:10.0')
    const start = linkset.clock.now
    expect(changes(linkset, ticks, 8500).map((at) => at - start)).toEqual([7000])
  })

  it('keeps the lag a waiting tick had when the handler that went ahead of it sets the timer again', async () => {
    // Follows the measured rule above: the tick was 3 s late when the waiting handler started.
    const { t, tell, linkset } = await rig({ source: timed })
    const ticks = () => (t.global('log') as string[]).filter((l) => l === 'timer').length
    tell('msg:1:10.0')
    linkset.advanceTime(8000)
    tell('msg:7:')
    linkset.advanceTime(500)
    tell('msg:0:')
    linkset.advanceTime(10_000)
    expect(ticks()).toBe(1)
    tell('msg:1:10.0')
    const start = linkset.clock.now
    expect(changes(linkset, ticks, 8500).map((at) => at - start)).toEqual([7000])
  })

  it('takes no lag from a tick a call made due a full interval or more ago', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-24, three runs): in an SLua script, whose timer
    // lags as an LSL one does, LLTimers:once(1) set 2 s after a start that left a 3 s lag ticked
    // at once, and the timer LLTimers set again in that tick, for 0.98 s, ticked 0.98 s later.
    const { tell, at, linkset, ticks } = await caughtUp(1000, 7000)
    at(10_000)
    tell('msg:1:1.0')
    expect(ticks()).toBe(1)
    at(10_500)
    tell('msg:1:4.0')
    expect(changes(linkset, ticks, 4100)).toEqual([14_500])
  })

  it('ticks twice at the start when a waiting handler sets an interval shorter than the start\'s lag', async () => {
    // In-world (Aditi, SLua Tideland, 2026-11-24, three runs each): a waiting handler called
    // llSetTimerEvent(2) at the start, 3 s after the missed tick. The caught-up tick and a second
    // one came 45 ms apart, then ticks 8.0 s after the timer was set and every 2 s. llSetTimerEvent(4)
    // 0.55 s after the start ticked 2.87 s after the call: the lag was how late the second tick
    // ran, due at 6 s, 2 s after the call less the start's 3 s lag, not the start's 3 s.
    const plain = await caughtUp(1000, 7000, 'q+stop:1:2.0')
    expect(plain.ticks()).toBe(2)
    expect(changes(plain.linkset, plain.ticks, 3100)).toEqual([8000, 10_000])
    const { tell, at, linkset, ticks } = await caughtUp(1000, 7000, 'q+stop:1:2.0')
    at(7500)
    tell('msg:1:4.0')
    expect(changes(linkset, ticks, 4000)).toEqual([10_500])
  })

  it('keeps the start\'s lag when a waiting handler runs before the caught-up tick', async () => {
    // Follows the measured rule: the lag is the start's lateness, fixed when a waiting handler
    // goes ahead of the tick.
    const { tell, at, linkset, ticks } = await caughtUp(1000, 7000, 'q+stop:7:0.5')
    at(7600)
    expect(ticks()).toBe(1)
    tell('msg:1:10.0')
    expect(changes(linkset, ticks, 8000)).toEqual([14_600])
  })

  it('has no lag after more than one missed tick, even when a waiting handler lengthens the interval', async () => {
    // In-world: a link message queued before the stop called llSetTimerEvent(10); started 8.5 s
    // after the stop, with the 4 s and 8 s ticks missed, the caught-up tick came 20 ms after
    // that handler, and llSetTimerEvent(10) 0.5 s later ticked 10.0 s after the call.
    const { tell, at, linkset, ticks } = await caughtUp(1000, 9500, 'q+stop:1:10.0')
    expect(ticks()).toBe(1)
    at(10_000)
    tell('msg:1:10.0')
    expect(changes(linkset, ticks, 10_500)).toEqual([20_000])
  })

  it('has no lag in a copy taken and rezzed during it', async () => {
    // In-world: started 3 s late, the object was taken 2.5 s after the start
    // and rezzed 4 s later. llSetTimerEvent(4) in the copy ticked 4.0 s after the call.
    const { linkset } = await caughtUp(1000, 7000)
    linkset.advanceTime(2500)
    const rezzed = linkset.copy().copy()
    const named = (n: string) => rezzed.prims[0]!.inventory.find((item) => item.name === n)!.script!
    const copy = named('t')
    for (const s of rezzed.allScripts()) s.queueRez()
    rezzed.advanceTime(4000)
    named('ctl').fire('link_message', { sender_num: 1, num: 900, str: 'msg:1:4.0', id: NULL_KEY })
    const start = rezzed.clock.now
    const ticks = () => (copy.global('log') as string[]).filter((l) => l === 'timer').length
    expect(changes(rezzed, ticks, 4500).map((t) => t - start)).toEqual([4000])
  })

  it('has no lag in a worn object detached during it and worn again', async () => {
    // In-world: the probe was worn; started 3 s late at 7 s, it detached itself
    // at 8 s and was worn again 6.4 s later. llSetTimerEvent(4) 12 s after the
    // wear ticked 4.0 s after the call, then every 4 s.
    const owner = '11111111-1111-1111-1111-111111111111'
    const { t, tell, linkset } = await rig({ source: timed }, undefined, owner)
    linkset.attachToAvatar(owner, 6)
    tell('msg:1:4.0')
    linkset.advanceTime(1000)
    tell('q+stop:2:')
    linkset.advanceTime(6000)
    tell('start')
    linkset.advanceTime(1000)
    linkset.detachFromAvatar()
    linkset.advanceTime(6400)
    linkset.attachToAvatar(owner, 6)
    linkset.advanceTime(12_000)
    tell('msg:1:4.0')
    const start = linkset.clock.now
    const ticks = () => (t.global('log') as string[]).filter((l) => l === 'timer').length
    expect(changes(linkset, ticks, 8500).map((at) => at - start)).toEqual([4000, 8000])
  })

  it('has no lag from a kept tick that waited through a detach', async () => {
    // Follows the measured detach and wear, which left no lag.
    const owner = '11111111-1111-1111-1111-111111111111'
    const { t, tell, linkset } = await rig({ source: timed }, undefined, owner)
    const ticks = () => (t.global('log') as string[]).filter((l) => l === 'timer').length
    linkset.attachToAvatar(owner, 6)
    tell('msg:1:10.0')
    linkset.advanceTime(8000)
    tell('msg:0:')
    linkset.advanceTime(500)
    tell('msg:7:')
    linkset.advanceTime(6500)
    linkset.detachFromAvatar()
    linkset.advanceTime(10_000)
    linkset.attachToAvatar(owner, 6)
    linkset.advanceTime(5000)
    expect(ticks()).toBe(1)
    tell('msg:1:10.0')
    const start = linkset.clock.now
    expect(changes(linkset, ticks, 10_500).map((at) => at - start)).toEqual([10_000])
  })

  it('has no lag in a crashed script that comes back in a rez', async () => {
    // In-world: llSetTimerEvent(4) at 0 s, a Math Error at 1 s, the object taken
    // 6.5 s in and rezzed 2.5 s later. The overdue tick came 70 ms after
    // state_entry and on_rez, and llSetTimerEvent(4) 3.1 s after the rez ticked
    // 4.0 s after the call, then every 4 s.
    const payload = await loadLinkset({ prims: [{ scripts: [{ name: 'k', source: { source: timed } }] }] })
    const saved = payload.scripts['k']!
    const send = (s: Script, num: number, str = '') => s.fire('link_message', { sender_num: 1, num, str, id: NULL_KEY })
    send(saved, 1, '4.0')
    payload.linkset.advanceTime(1000)
    expect(() => send(saved, 8)).toThrow('Math Error')
    payload.linkset.advanceTime(5500)
    const { linkset, rez } = await rezzer(payload.linkset)
    linkset.advanceTime(2500)
    const k = rez()
    linkset.advanceTime(0)
    expect((k.global('log') as string[]).filter((l) => l === 'timer')).toHaveLength(1)
    linkset.advanceTime(3100)
    send(k, 1, '4.0')
    const start = linkset.clock.now
    const ticks = () => (k.global('log') as string[]).filter((l) => l === 'timer').length
    expect(changes(linkset, ticks, 8500).map((at) => at - start)).toEqual([4000, 8000])
  })

  it('runs an SLua LLTimers callback on time after a start that left a lag', async () => {
    // In-world: the same start with an SLua script whose link message handler
    // called LLTimers:every(4) -> the first callback 4.0 s after the call. The
    // timer under it lags, so a raw timer handler would also see an earlier
    // tick that runs no callback (see timer-after-sleep.test.ts).
    const { t, tell, linkset } = await rig({ filename: 't.luau', source: `
      log = {}
      local h = nil
      LLEvents:on("link_message", function(s, n, m, k)
        if n == 1 then
          if h then LLTimers:off(h) end
          h = LLTimers:every(tonumber(m), function() table.insert(log, "timer") end)
        elseif n == 2 then
          if h then LLTimers:off(h); h = nil end
        end
      end)
    ` }, 'slua')
    tell('msg:1:4.0')
    linkset.advanceTime(1000)
    tell('q+stop:2:')
    linkset.advanceTime(6000)
    tell('start')
    linkset.advanceTime(3000)
    tell('msg:1:4.0')
    const ticks = () => (t.global('log') as string[]).length
    expect(changes(linkset, ticks, 4500)).toEqual([14_000])
  })

  it('counts from the call when no tick, or more than one, was missed', async () => {
    // In-world: stopped from 1 s to 3 s (no tick missed), llSetTimerEvent(4) at
    // 10 s -> tick at 14.0 s. Stopped from 1 s to 9.5 s (the 4 s and 8 s ticks
    // missed), llSetTimerEvent(4) at 12 s -> tick at 16.0 s. A 6 s timer
    // stopped from 1 s to 13 s did the same.
    const none = await caughtUp(1000, 3000)
    none.at(10_000)
    none.tell('msg:1:4.0')
    expect(changes(none.linkset, none.ticks, 4500)).toEqual([14_000])
    const two = await caughtUp(1000, 9500)
    two.at(12_000)
    two.tell('msg:1:4.0')
    expect(changes(two.linkset, two.ticks, 4500)).toEqual([16_000])
  })
})

describe('a timer and a repeating sensor that fall due together', () => {
  it('runs the timer first, whichever was set first', async () => {
    // In-world: llSetTimerEvent(2.0) and llSensorRepeat(..., 2.0) in one
    // handler, in either order -> the timer event first and the sensor event 20
    // to 70 ms later, at each of six ticks. The sensor alone and the timer alone
    // each came 2.0 s after the handler. A sensor that found nothing gave the
    // same order (Aditi, SLua Tideland, 2026-11-23).
    for (const calls of [
      'llSetTimerEvent(2.0); llSensorRepeat("", NULL_KEY, AGENT, 20.0, PI, 2.0);',
      'llSensorRepeat("", NULL_KEY, AGENT, 20.0, PI, 2.0); llSetTimerEvent(2.0);',
    ]) {
      const s = await loadScript({ source: `list log;
        default {
          state_entry() { ${calls} }
          timer() { log += "timer"; }
          sensor(integer n) { log += "scan"; }
          no_sensor() { log += "scan"; }
        }` })
      s.start()
      s.advanceTime(4100)
      expect(s.global('log')).toEqual(['timer', 'scan', 'timer', 'scan'])
    }
  })
})

describe('llResetOtherScript on a running script', () => {
  it('drops the link messages sent before and after it in the same handler', async () => {
    // In-world: the script was in state two with g = 42 and a 3 s timer. One
    // handler sent it a link message, called llResetOtherScript and sent two
    // more -> it said state_entry in default with g = 0 and got none of the
    // three, and its timer was gone. llGetScriptState read 1 right after the
    // reset. (A crashed script that is reset does get the messages sent after
    // the reset; that case is in run-time-errors.test.ts.)
    const { t, ctl, tell, linkset } = await rig()
    tell('num:600')
    expect(t.global('log')).toEqual(['entry default 0', 'entry two 42'])
    tell('send+reset+send')
    expect(ctl.global('states')).toEqual([1])
    expect(t.currentState).toBe('default')
    expect(t.global('log')).toEqual(['entry default 0'])
    linkset.advanceTime(7000)
    expect(t.global('ticks')).toBe(0)
    expect(t.global('log')).toEqual(['entry default 0'])
  })

  it('delivers a link message sent 0.1 s after it, after state_entry', async () => {
    // In-world: llResetOtherScript, llSleep(0.1), llMessageLinked -> the
    // script said state_entry in default, then answered the message.
    const { t, tell } = await rig()
    tell('num:600')
    tell('reset+wait+send')
    expect(t.global('log')).toEqual(['entry default 0', 'lm 0.1 s after reset'])
  })

  it('resets a sleeping script at once and drops what it was sent in that handler', async () => {
    // In-world: 3 s into the script's 10 s llSleep, with a link message
    // already waiting for it, one handler called llResetOtherScript and sent
    // another message -> state_entry in default 20 ms later; neither message
    // arrived and the handler never finished. The SLua script did the same.
    const { t, tell, linkset } = await rig()
    linkset.clock.schedule(t, linkset.clock.now, 'link_message', { sender_num: 1, num: 300, str: '', id: NULL_KEY })
    linkset.advanceTime(2000)
    tell('queued during sleep')
    linkset.advanceTime(1000)
    tell('send+reset+send')
    expect(t.global('log')).toEqual(['entry default 0'])
    linkset.advanceTime(12_000)
    expect(t.global('log')).toEqual(['entry default 0'])
  })

  it('leaves it stopped when llSetScriptState follows in the same handler, and runs state_entry at the start', async () => {
    // In-world: llResetOtherScript, llSetScriptState(FALSE), llMessageLinked
    // in one handler -> llGetScriptState 0 and nothing said. 4 s later
    // llSetScriptState(TRUE) -> state_entry in default; the message never
    // arrived. The SLua script did the same.
    const { t, ctl, tell, linkset } = await rig()
    tell('num:600')
    tell('reset+stop+send')
    expect(ctl.global('states')).toEqual([0])
    linkset.advanceTime(4000)
    expect(t.global('log')).toEqual([])
    tell('start')
    linkset.advanceTime(3000)
    expect(t.currentState).toBe('default')
    expect(t.global('log')).toEqual(['entry default 0'])
  })
})

// https://wiki.secondlife.com/wiki/LlSensorRepeat
// https://wiki.secondlife.com/wiki/LlTarget
async function rezzer(payload: Linkset) {
  const world = new World()
  world.addRegion('rez region', { x: 0, y: 0 })
  const item = makeInventoryItem({ name: 'payload', type: InventoryType.OBJECT })
  Object.assign(item, { object: payload })
  const loaded = await loadLinkset({ world, region: 'rez region', position: { x: 100, y: 100, z: 30 }, prims: [{
    name: 'rezzer', inventory: [item], scripts: [{ name: 'parent', source: { source: `
      key child;
      default {
        touch_start(integer n) { llRezObject("payload", llGetPos() + <0.0, 0.0, 1.0>, ZERO_VECTOR, ZERO_ROTATION, 7); }
        object_rez(key id) { child = id; }
        link_message(integer s, integer n, string m, key k) { llDerezObject(child, DEREZ_TO_INVENTORY); }
      }
    ` } }],
  }] })
  const parent = loaded.scripts['parent']!
  parent.start()
  const rez = (): Script => {
    parent.fire('touch_start', { num_detected: 1 })
    return world.linksets.at(-1)!.allScripts()[0]!
  }
  const take = () => parent.fire('link_message', { sender_num: 1, num: 0, str: '', id: NULL_KEY })
  return { world, ...loaded, rez, take }
}

describe('an object taken to inventory and rezzed again', () => {
  const carrier = `
    integer g; integer ticks; integer scans; integer ats; integer rats; list log;
    default { state_entry() { g = 42; state two; } }
    state two {
      state_entry() {
        log += "entry two";
        llListen(7, "", NULL_KEY, "");
        llSetTimerEvent(10.0);
        llSensorRepeat("", NULL_KEY, AGENT, 20.0, PI, 7.0);
        llTarget(llGetPos(), 50.0);
        llRotTarget(llGetRot(), 0.5);
      }
      on_rez(integer p) { log += "on_rez " + (string)p; ats = 0; rats = 0; }
      timer() { ++ticks; }
      sensor(integer n) { ++scans; }
      no_sensor() { ++scans; }
      at_target(integer n, vector a, vector b) { ++ats; }
      at_rot_target(integer n, rotation a, rotation b) { ++rats; }
      listen(integer c, string n, key k, string m) { log += "heard " + m; }
    }`

  it('keeps its timer, repeating sensor, listen and targets, with the time left to the next tick', async () => {
    // In-world (Mono): a script in state two with g = 42 ran llListen,
    // llSetTimerEvent(10), llSensorRepeat(..., 7), llTarget(llGetPos(), 50)
    // and llRotTarget(llGetRot(), 0.5). The owner took the object 6.2 s after
    // a timer tick and 1.2 s after a scan, kept it in inventory for 24 s and
    // rezzed it. It ran on_rez and no state_entry, with g = 42. The timer
    // ticked 3.8 s after the rez and every 10 s from there, the sensor
    // scanned 5.8 s after the rez and every 7 s from there, at_target and
    // at_rot_target kept coming about 22 times a second, and chat on the
    // listen's channel was heard. A second take, with llRezObject from another
    // object's inventory 9 s later, gave the same: timer and sensor carried on
    // with the time they had left.
    const payload = await loadLinkset({ prims: [{ scripts: [{ name: 'k', source: { source: carrier } }] }] })
    const { world, linkset, rez, take } = await rezzer(payload.linkset)
    const first = rez()
    linkset.advanceTime(36_200 - world.clock.now)
    expect([first.global('ticks'), first.global('scans')]).toEqual([3, 5])
    take()
    expect(first.dead).toBe(true)
    linkset.advanceTime(24_000)
    const start = world.clock.now
    const k = rez()
    expect(k).not.toBe(first)
    expect(k.currentState).toBe('two')
    expect(k.global('g')).toBe(42)
    expect(k.global('log')).toEqual(['entry two', 'on_rez 7'])
    expect(fired(linkset, k, 25_000, start)).toEqual({ ticks: [3800, 13_800, 23_800], scans: [5800, 12_800, 19_800] })
    expect(Number(k.global('ats'))).toBeGreaterThan(500)
    expect(Number(k.global('rats'))).toBeGreaterThan(500)
    linkset.routeChat(linkset.prims[0]!, 'say', 7, 'hello')
    linkset.advanceTime(100)
    expect(k.global('log')).toEqual(['entry two', 'on_rez 7', 'heard hello'])
  })

  it('fires the overdue timer and sensor of a crashed LSL script when it runs again in the rezzed object', async () => {
    // In-world (Mono): a script armed a 10 s timer and a 7 s sensor from a
    // listen event, then crashed on a division by zero 4 s before the next
    // tick was due. The owner took the object about 1.5 s after that tick
    // fell due and rezzed it 24 s later. The script said state_entry, then
    // on_rez, then timer and sensor within 50 ms. The next timer came 6.4 s
    // after that one (8 s after the rez, 10 s after the overdue tick's place
    // in the rezzed object's time) and every 10 s from there; the sensor came
    // every 7 s from the first.
    const payload = await loadLinkset({ prims: [{ scripts: [{ name: 'k', source: { source: `
      integer scans; integer ticks; list log;
      default {
        state_entry() { log += "entry"; }
        on_rez(integer p) { log += "on_rez"; }
        link_message(integer s, integer n, string m, key k) {
          if (m == "arm") { llSetTimerEvent(10.0); llSensorRepeat("", NULL_KEY, AGENT, 20.0, PI, 7.0); }
          else { integer z; scans = 1 / z; }
        }
        timer() { ++ticks; log += "timer"; }
        sensor(integer n) { ++scans; log += "scan"; }
        no_sensor() { ++scans; log += "scan"; }
      }` } }] }] })
    const saved = payload.scripts['k']!
    saved.start()
    saved.fire('link_message', { sender_num: 1, num: 0, str: 'arm', id: NULL_KEY })
    payload.linkset.advanceTime(8000)
    expect(() => saved.fire('link_message', { sender_num: 1, num: 0, str: 'crash', id: NULL_KEY })).toThrow('Math Error')
    payload.linkset.advanceTime(7500)
    expect(saved.global('log')).toEqual(['entry', 'scan'])
    const { world, linkset, rez } = await rezzer(payload.linkset)
    linkset.advanceTime(24_000)
    const start = world.clock.now
    const k = rez()
    expect(k.running).toBe(true)
    linkset.advanceTime(0)
    expect(k.global('log')).toEqual(['entry', 'scan', 'entry', 'on_rez', 'timer', 'scan'])
    expect(fired(linkset, k, 20_000, start)).toEqual({ ticks: [4500, 14_500], scans: [7000, 14_000] })
  })
})

const crasher = `integer scans; integer ticks; list log;
  default {
    state_entry() { log += "entry"; }
    on_rez(integer p) { log += "on_rez"; }
    attach(key id) { if (id) log += "attach"; }
    link_message(integer s, integer n, string m, key k) {
      if (m == "arm") { llSetTimerEvent(4.0); llSensorRepeat("", NULL_KEY, AGENT, 20.0, PI, 7.0); }
      else { integer z; scans = 1 / z; }
    }
    timer() { ++ticks; log += "timer"; }
    sensor(integer n) { ++scans; log += "scan"; }
    no_sensor() { ++scans; log += "scan"; }
  }`

describe('an SLua object taken to inventory and rezzed again', () => {
  it('keeps its LLTimers timer with the time it had left, on its own clock', async () => {
    // In-world: an SLua script with LLTimers:every(10) and LLTimers:every(1) was
    // taken 7 to 8 s after it started and rezzed 12 s later. on_rez read
    // ll.GetTime() 9.09, the 1 s timer went on at 9.11 and 10.13, and the 10 s
    // timer fired at ll.GetTime() 10.02, 0.9 s after on_rez, then at 20.02
    // (Aditi, SLua Tideland, 2026-11-23). Time in inventory did not count on
    // either the clock or the timers.
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const { linkset, scripts } = await loadLinkset({ world, region: 'home', prims: [{ scripts: [{ name: 's', language: 'slua', source: { filename: 's.luau', source: `
      ticks = {}
      LLTimers:every(10, function() table.insert(ticks, ll.GetTime()) end)
      LLEvents:on("on_rez", function() rezAt = ll.GetTime() end)
    ` } }] }] })
    scripts['s']!.start()
    linkset.advanceTime(7500)
    const saved = linkset.copy()
    linkset.advanceTime(12_000)
    const rezzed = saved.copy({ world, region: 'home' })
    const copy = rezzed.allScripts()[0]!
    copy.queueRez()
    rezzed.advanceTime(0)
    expect(copy.global('rezAt')).toBeCloseTo(7.5, 3)
    expect(copy.global('ticks')).toEqual([])
    rezzed.advanceTime(2500)
    expect(copy.global('ticks')).toEqual([10])
    rezzed.advanceTime(10_000)
    expect(copy.global('ticks')).toEqual([10, 20])
  })
})

describe('a crashed LSL script whose tick is overdue by more than the interval', () => {
  // In-world (Mono): a 4 s timer and a 7 s sensor armed from a listen event;
  // the script ticked once and crashed on a division by zero 1 s before the
  // next tick and just before the first scan. 11 s later the object left the
  // world, and 15 s after that it was back.
  it('runs state_entry, on_rez, the timer and a scan in the rezzed object, then a full interval', async () => {
    // In-world: taken and rezzed -> state_entry, on_rez, timer, sensor within
    // 60 ms; timer again 4.0 s, 8.0 s and 12.0 s later, sensor 7.0 s and
    // 14.0 s later.
    const payload = await loadLinkset({ prims: [{ scripts: [{ name: 'k', source: { source: crasher } }] }] })
    const saved = payload.scripts['k']!
    saved.start()
    saved.fire('link_message', { sender_num: 1, num: 0, str: 'arm', id: NULL_KEY })
    payload.linkset.advanceTime(6900)
    expect(() => saved.fire('link_message', { sender_num: 1, num: 0, str: 'crash', id: NULL_KEY })).toThrow('Math Error')
    payload.linkset.advanceTime(11_000)
    const { linkset, rez } = await rezzer(payload.linkset)
    linkset.advanceTime(15_000)
    const start = linkset.clock.now
    const k = rez()
    linkset.advanceTime(0)
    expect(k.global('log')).toEqual(['entry', 'timer', 'entry', 'on_rez', 'timer', 'scan'])
    expect(fired(linkset, k, 14_500, start)).toEqual({ ticks: [4000, 8000, 12_000], scans: [7000, 14_000] })
  })

  it('keeps that order when the object goes through llDerezObject and llRezObject', async () => {
    const payload = await loadLinkset({ prims: [{ scripts: [{ name: 'k', source: { source: crasher } }] }] })
    const { linkset, rez, take } = await rezzer(payload.linkset)
    const first = rez()
    linkset.advanceTime(0)
    first.fire('link_message', { sender_num: 1, num: 0, str: 'arm', id: NULL_KEY })
    linkset.advanceTime(6900)
    expect(() => first.fire('link_message', { sender_num: 1, num: 0, str: 'crash', id: NULL_KEY })).toThrow('Math Error')
    linkset.advanceTime(11_000)
    take()
    linkset.advanceTime(15_000)
    const start = linkset.clock.now
    const k = rez()
    linkset.advanceTime(0)
    expect((k.global('log') as string[]).slice(-4)).toEqual(['entry', 'on_rez', 'timer', 'scan'])
    expect(fired(linkset, k, 14_500, start)).toEqual({ ticks: [4000, 8000, 12_000], scans: [7000, 14_000] })
  })

  it('runs on without state_entry in an attachment that is detached and worn again', async () => {
    // In-world: the worn object detached (another script in it called
    // llDetachFromAvatar) and the owner wore it again -> on_rez, attach,
    // timer, sensor within 70 ms and no state_entry; timer again 4.0 s,
    // 8.0 s and 12.0 s later, sensor 7.0 s and 14.0 s later. The script
    // answered chat again.
    const owner = '11111111-1111-1111-1111-111111111111'
    const { linkset, scripts } = await loadLinkset({ owner, prims: [{ scripts: [{ name: 'k', source: { source: crasher } }] }] })
    const k = scripts['k']!
    k.start()
    linkset.attachToAvatar(owner, 6)
    k.fire('link_message', { sender_num: 1, num: 0, str: 'arm', id: NULL_KEY })
    linkset.advanceTime(6900)
    expect(() => k.fire('link_message', { sender_num: 1, num: 0, str: 'crash', id: NULL_KEY })).toThrow('Math Error')
    linkset.advanceTime(11_000)
    expect(k.global('log')).toEqual(['entry', 'attach', 'timer'])
    linkset.detachFromAvatar()
    linkset.advanceTime(15_000)
    linkset.attachToAvatar(owner, 6)
    linkset.advanceTime(0)
    expect(k.running).toBe(true)
    expect(k.global('log')).toEqual(['entry', 'attach', 'timer', 'on_rez', 'attach', 'timer', 'scan'])
    expect(fired(linkset, k, 14_500)).toEqual({ ticks: [4000, 8000, 12_000], scans: [7000, 14_000] })
  })
})

describe('an attachment detached and worn again', () => {
  it('scans and ticks after the time that was left when it was detached', async () => {
    // In-world (Mono): a worn object with llSetTimerEvent(10) and
    // llSensorRepeat(..., 7) detached itself 0.9 s after a tick and 2.9 s
    // after a scan, and the owner wore it again 19 s later. It ran on_rez and
    // attach, scanned 4.1 s after it was back and every 7 s from there, and
    // ticked 9.1 s after it was back and every 10 s from there.
    const owner = '11111111-1111-1111-1111-111111111111'
    const { linkset, scripts } = await loadLinkset({ owner, prims: [{ scripts: [{ name: 'k', source: { source: `
      integer ticks; integer scans;
      default {
        state_entry() { llSetTimerEvent(10.0); llSensorRepeat("", NULL_KEY, AGENT, 20.0, PI, 7.0); }
        timer() { ++ticks; }
        sensor(integer n) { ++scans; }
        no_sensor() { ++scans; }
      }` } }] }] })
    const k = scripts['k']!
    k.start()
    linkset.attachToAvatar(owner, 6)
    linkset.advanceTime(30_900)
    expect([k.global('ticks'), k.global('scans')]).toEqual([3, 4])
    linkset.detachFromAvatar()
    linkset.advanceTime(19_000)
    expect([k.global('ticks'), k.global('scans')]).toEqual([3, 4])
    linkset.attachToAvatar(owner, 6)
    expect(fired(linkset, k, 17_000)).toEqual({ ticks: [9100], scans: [4100, 11_100] })
  })
})

describe('a crashed SLua script in an object rezzed from inventory', () => {
  // In-world: an SLua script crashed on touch in four ways, and a fifth at
  // its top level. The owner took each object and rezzed it. Each time the
  // new prim said "<prim name> [script:<script name>] Script run-time error"
  // and then the same second line as the first time; the script ran neither
  // its top level nor on_rez, and a touch did nothing. The object renamed,
  // taken and rezzed again said the error again under its new name. The owner
  // saw the same Lua message and traceback again where listeners heard
  // "runtime error" (Aditi, SLua Tideland, 2026-11-23).
  it.each([
    ['error("boom")', 'runtime error', 'lua_script:4: boom\n[C] function error\nlua_script:4\n[C] function _handleEvent\n'],
    ['error({})', 'Unknown runtime error', 'Unknown runtime error'],
    ['for i = 1, 70 do ll.Listen(i, "", NULL_KEY, "") end', 'Too Many Listens', 'Too Many Listens'],
  ])('says the error again: %s', async (statement, said, shown) => {
    const payload = await loadLinkset({ prims: [{ name: 'crasher', scripts: [{ name: 'x', language: 'slua', source: { source: `
      rezzed = 0
      LLEvents:on("on_rez", function(p) rezzed += 1 end)
      LLEvents:on("touch_start", function() ${statement} end)
    `, filename: 'x.luau' } }] }] })
    const saved = payload.scripts['x']!
    saved.start()
    expect(() => saved.fire('touch_start', { num_detected: 1, detected: [{ key: NULL_KEY, name: 'A' }] })).toThrow()
    expect(saved.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text)).toEqual(['crasher [script:x] Script run-time error', shown])
    payload.prims[0]!.name = 'renamed'
    const { world, rez } = await rezzer(payload.linkset)
    const ear = (await loadLinkset({ world, region: 'rez region', position: { x: 100, y: 100, z: 33 }, prims: [{ scripts: [{ name: 'ear', source: { source: `list heard;
      default {
        state_entry() { llListen(DEBUG_CHANNEL, "", NULL_KEY, ""); }
        listen(integer c, string n, key k, string m) { heard += [n, k, m]; }
      }` } }] }] })).scripts['ear']!
    ear.start()
    const x = rez()
    world.linksets[0]!.advanceTime(1000)
    const key = x.host.key
    expect(ear.global('heard')).toEqual(['renamed', key, 'renamed [script:x] Script run-time error', 'renamed', key, said])
    expect(x.crashed).toBe(true)
    expect(x.running).toBe(false)
    expect(x.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text)).toEqual(['renamed [script:x] Script run-time error', shown])
  })

  it('says it again each time the object is rezzed', async () => {
    const payload = await loadLinkset({ prims: [{ name: 'crasher', scripts: [{ name: 'x', language: 'slua', source: { source:
      'error("top boom")', filename: 'x.luau' } }] }] })
    expect(() => payload.scripts['x']!.start()).toThrow('top boom')
    const { rez } = await rezzer(payload.linkset)
    for (const _ of [1, 2]) {
      const x = rez()
      expect(x.chat.map((c) => c.text)).toEqual(['crasher [script:x] Script run-time error', 'lua_script:1: top boom\n[C] function error\nlua_script:1\n'])
    }
  })

  it('says it once when an RLV force-wear brings the detached object back', async () => {
    // In-world: the crashed script's object attached from inventory said the
    // error again, like the rezzed one.
    const { world, avatar, script } = (await loadRlvPair({ source: 'default { touch_start(integer n) { llOwnerSay("@attach:direct=force"); } }' })).rlva
    const worn = await loadLinkset({ prims: [{ name: 'crasher', scripts: [{ name: 'x', language: 'slua', source: { source:
      'error("top boom")', filename: 'x.luau' } }] }] })
    expect(() => worn.scripts['x']!.start()).toThrow('top boom')
    seedRlvInventory(avatar, { sharedRootId: 'root', entries: [
      { id: 'root', parentId: null, kind: 'folder', name: '#RLV' },
      { id: 'folder', parentId: 'root', kind: 'folder', name: 'Direct' },
      { id: 'a', parentId: 'folder', kind: 'item', name: 'crasher (chest)', assetType: 'object', object: worn.linkset },
    ] })
    script.start()
    script.fire('touch_start', { num_detected: 1 })
    script.advanceTime(0)
    const object = world.linksets.find((l) => l.attachment)!
    const x = object.allScripts()[0]!
    expect(x.chat.map((c) => c.text)).toEqual(['crasher [script:x] Script run-time error', 'lua_script:1: top boom\n[C] function error\nlua_script:1\n'])
    object.detachFromAvatar()
    script.advanceTime(0)
    script.fire('touch_start', { num_detected: 1 })
    script.advanceTime(0)
    expect(object.attachment).not.toBeNull()
    expect(x.chat.map((c) => c.text)).toEqual([
      'crasher [script:x] Script run-time error', 'lua_script:1: top boom\n[C] function error\nlua_script:1\n',
      'crasher [script:x] Script run-time error', 'lua_script:1: top boom\n[C] function error\nlua_script:1\n',
    ])
  })
})

describe('the value of integer *= float', () => {
  // In-world (Mono), with integer i = 3 and float f = 1.5:
  //   integer j = (i *= f);  integer j = i *= f;  i = (i *= f);  j = (i *= f);
  // did not compile: "Type mismatch". These compiled:
  //   i *= f;                -> i is 4
  //   integer j = (i *= 2);  -> j is 6
  //   float g = (i *= f);  (string)(i *= f);  [(i *= f)];  (i *= f) + 0.25;
  // The last four crashed the script when the handler started.
  it.each([
    'integer j = (i *= f);',
    'integer j = i *= f;',
    'i = (i *= f);',
    'integer j; j = (i *= f);',
  ])('does not compile as an integer: %s', async (statement) => {
    await expect(loadScript({ source: `default { state_entry() { integer i = 3; float f = 1.5; ${statement} } }` }))
      .rejects.toThrow('Type mismatch')
  })

  it.each([
    'float g = (i *= f);',
    'llOwnerSay((string)(i *= f));',
    'list l = [(i *= f)];',
    'float q = ((i *= f) + 0.25);',
  ])('compiles as a float and crashes the script: %s', async (statement) => {
    const s = await loadScript({ source: `default { state_entry() { integer i = 3; float f = 1.5; ${statement} } }` })
    expect(() => s.start()).toThrow()
    expect(s.crashed).toBe(true)
  })

  it('stores the truncated product when used as a statement', async () => {
    const s = await loadScript({ source: `integer i = 3; integer j; integer k = 3;
      default { state_entry() { float f = 1.5; i *= f; j = (k *= 2); } }` })
    s.start()
    expect([s.global('i'), s.global('j'), s.global('k')]).toEqual([4, 6, 6])
  })
})
