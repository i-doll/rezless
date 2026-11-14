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
      else if (n == 4) { llSetTimerEvent(3.0); log += "sleep start"; llSleep(10.0); log += "sleep end"; }
      else if (n == 5) { llSetTimerEvent(4.0); llSensorRepeat("", NULL_KEY, AGENT, 20.0, PI, 4.0); }
      else if (n == 6) log += "lm";
    }
    timer() { log += "timer"; }
    sensor(integer n) { log += "scan"; }
    no_sensor() { log += "scan"; }
  }`

const mouth = 'default { link_message(integer s, integer n, string m, key k) { llSay(7, m); } }'

async function rig(source: { source: string; filename?: string } = { source: target }, language?: 'slua') {
  const loaded = await loadLinkset({ prims: [
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
  // taken and rezzed again said the error again under its new name.
  it.each([
    ['error("boom")', 'runtime error'],
    ['error({})', 'Unknown runtime error'],
    ['for i = 1, 70 do ll.Listen(i, "", NULL_KEY, "") end', 'Too Many Listens'],
  ])('says the error again: %s', async (statement, said) => {
    const payload = await loadLinkset({ prims: [{ name: 'crasher', scripts: [{ name: 'x', language: 'slua', source: { source: `
      rezzed = 0
      LLEvents:on("on_rez", function(p) rezzed += 1 end)
      LLEvents:on("touch_start", function() ${statement} end)
    `, filename: 'x.luau' } }] }] })
    const saved = payload.scripts['x']!
    saved.start()
    expect(() => saved.fire('touch_start', { num_detected: 1, detected: [{ key: NULL_KEY, name: 'A' }] })).toThrow()
    expect(saved.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text)).toEqual(['crasher [script:x] Script run-time error', said])
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
    expect(x.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text)).toEqual(['renamed [script:x] Script run-time error', said])
  })

  it('says it again each time the object is rezzed', async () => {
    const payload = await loadLinkset({ prims: [{ name: 'crasher', scripts: [{ name: 'x', language: 'slua', source: { source:
      'error("top boom")', filename: 'x.luau' } }] }] })
    expect(() => payload.scripts['x']!.start()).toThrow('top boom')
    const { rez } = await rezzer(payload.linkset)
    for (const _ of [1, 2]) {
      const x = rez()
      expect(x.chat.map((c) => c.text)).toEqual(['crasher [script:x] Script run-time error', 'runtime error'])
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
    expect(x.chat.map((c) => c.text)).toEqual(['crasher [script:x] Script run-time error', 'runtime error'])
    object.detachFromAvatar()
    script.advanceTime(0)
    script.fire('touch_start', { num_detected: 1 })
    script.advanceTime(0)
    expect(object.attachment).not.toBeNull()
    expect(x.chat.map((c) => c.text)).toEqual([
      'crasher [script:x] Script run-time error', 'runtime error',
      'crasher [script:x] Script run-time error', 'runtime error',
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
