import { describe, expect, it } from 'vitest'
import { loadLinkset, loadScript, World, NULL_KEY } from '../src/index.js'

// Measured on the Aditi beta grid, SLua Tideland, Firestorm viewer, 2026-11-13.
// A two-prim linkset held the script under test, a control script that ran
// llSetScriptState, llResetOtherScript and llGetScriptState on command, and a
// DEBUG_CHANNEL listener in each prim. More listeners sat in separate objects
// 1.8 m, 15 m, 19.5 m, 20.5 m, 30 m and 120 m away, and on an attachment of the
// owner 2 m away.
// The script said "pre <case>" before the statement and "post <value>" after it.
// The same LSL source also ran compiled to Luau, and an SLua script ran the
// SLua cases.

const DEBUG_CHANNEL = 2147483647

const victim = `integer g; integer n; list log;
  act(string st, string m) {
    integer zi; float zf; rotation zr = <0,0,0,0>; vector v = <1,2,3>;
    if (m == "ping") { log += "pong " + st; return; }
    if (m == "arm") { g = 42; llSetTimerEvent(3.0); llListen(7, "", NULL_KEY, ""); llSensorRepeat("", NULL_KEY, AGENT, 30.0, PI, 4.0); return; }
    log += "pre";
    if (m == "idiv") log += (string)(1 / zi);
    else if (m == "imod") log += (string)(1 % zi);
    else if (m == "fdiv") log += (string)(1.0 / zf);
    else if (m == "f00") log += (string)(zf / zf);
    else if (m == "ifdiv") log += (string)(1 / zf);
    else if (m == "fidiv") log += (string)(1.0 / zi);
    else if (m == "vdiv") log += (string)(v / zf);
    else if (m == "vdivi") log += (string)(v / zi);
    else if (m == "infinf") { float inf = (float)"inf"; log += (string)(inf / inf); }
    else if (m == "nan1") { float nan = (float)"nan"; log += (string)(nan / 1.0); }
    else if (m == "nan2") { float nan = (float)"nan"; log += (string)(1.0 / nan); }
    else if (m == "vnan") { float nan = (float)"nan"; log += (string)(v / nan); }
    else if (m == "vinf") { float inf = (float)"inf"; log += (string)(v / inf); }
    else if (m == "vrot") log += (string)(v / zr);
    else if (m == "rrot") log += (string)(<0,0,0,1> / zr);
    else if (m == "minint") { integer x = 0x80000000; integer y = -1; log += (string)(x / y); }
    else if (m == "minmod") { integer x = 0x80000000; integer y = -1; log += (string)(x % y); }
    else if (m == "listens") { integer i; for (i = 0; i < 70; ++i) llListen(1000 + i, "", NULL_KEY, ""); }
    log += "post";
  }
  default {
    state_entry() { log += "entry"; }
    link_message(integer s, integer num, string m, key k) { if (m == "two") state two; act("default", m); }
    timer() { ++n; log += "timer"; }
    listen(integer c, string nm, key id, string m) { log += "heard " + m; }
    sensor(integer c) { log += "sensor"; }
    no_sensor() { log += "no_sensor"; }
  }
  state two {
    state_entry() { log += "entry two"; }
    link_message(integer s, integer num, string m, key k) { act("two", m); }
    timer() { ++n; log += "timer"; }
    listen(integer c, string nm, key id, string m) { log += "heard " + m; }
    sensor(integer c) { log += "sensor"; }
    no_sensor() { log += "no_sensor"; }
  }`

const sluaVictim = `g = 0
  n = 0
  log = {}
  LLEvents:on("link_message", function(sender, num, m, id)
    if m == "ping" then table.insert(log, "pong") return end
    if m == "arm" then
      g = 42
      LLTimers:every(3, function() n += 1 end)
      ll.Listen(7, "", "", "")
      return
    end
    table.insert(log, "pre")
    if m == "div" then table.insert(log, tostring(1 / 0))
    elseif m == "mod" then table.insert(log, tostring(1 % 0))
    elseif m == "idiv" then table.insert(log, tostring(1 // 0))
    elseif m == "vdiv" then table.insert(log, tostring(vector(1, 2, 3) / 0))
    elseif m == "pcall" then local ok = pcall(function() error("inner") end) table.insert(log, tostring(ok))
    elseif m == "err" then error("boom")
    elseif m == "errtab" then error({ code = 1 })
    elseif m == "errnil" then error()
    elseif m == "errtrue" then error(true)
    elseif m == "err42" then error(42)
    elseif m == "errlvl0" then error("plain", 0)
    elseif m == "llerr" then table.insert(log, ll.GetSubString("abc", 0, 1))
    elseif m == "listens" then for i = 1, 70 do ll.Listen(1000 + i, "", "", "") end
    elseif m == "plisten" then pcall(function() for i = 1, 70 do ll.Listen(1000 + i, "", "", "") end end)
    elseif m == "nilidx" then local t = nil; table.insert(log, t.x)
    end
    table.insert(log, "post")
  end)
  LLEvents:on("listen", function(c, nm, id, m) table.insert(log, "heard " .. m) end)
  table.insert(log, "entry")`

const control = `list states;
  default { link_message(integer s, integer n, string m, key k) {
    if (m == "start") llSetScriptState((string)k, TRUE);
    else if (m == "stop") llSetScriptState((string)k, FALSE);
    else if (m == "reset") llResetOtherScript((string)k);
    else if (m == "state") states += llGetScriptState((string)k);
  } }`

const ear = `list heard;
  default {
    state_entry() { llListen(DEBUG_CHANNEL, "", NULL_KEY, ""); }
    listen(integer c, string name, key id, string m) { heard += [name, id, m]; }
  }`

const lsl = (name: string, source: string) => ({ name, source: { source, filename: `${name}.lsl` } })

async function rig(a: { name: string; source: unknown; language?: string } = lsl('a', victim)) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const at = (x: number) => ({ x, y: 50, z: 30 })
  const target = await loadLinkset({ world, region: 'home', position: at(100), prims: [
    { name: 'Target', scripts: [a as ReturnType<typeof lsl>, lsl('ctl', control), lsl('ear', ear)] },
    { name: 'Child', scripts: [lsl('kc', victim), lsl('ear2', ear)] },
  ] })
  const ears: Record<string, Awaited<ReturnType<typeof loadLinkset>>['scripts'][string]> = {
    same: target.scripts['ear']!, child: target.scripts['ear2']!,
  }
  for (const [name, x] of [['near', 119.5], ['far', 120.5]] as const) {
    const o = await loadLinkset({ world, region: 'home', position: at(x), prims: [{ name, scripts: [lsl('ear', ear)] }] })
    ears[name] = o.scripts['ear']!
    o.scripts['ear']!.start()
  }
  for (const s of Object.values(target.scripts)) s.start()
  const script = target.scripts['a']!
  const ctl = target.scripts['ctl']!
  const message = (m: string) => ({ sender_num: 1, num: 0, str: m, id: NULL_KEY })
  /** Send the script a link message, as another script would. */
  const send = (m: string, to = script) => {
    target.linkset.clock.schedule(to, target.linkset.clock.now, 'link_message', message(m))
  }
  const run = () => target.linkset.advanceTime(0)
  const tell = (m: string, name = 'a') => ctl.fire('link_message', { sender_num: 1, num: 0, str: m, id: name })
  const debug = (s = script) => s.chat.filter(c => c.channel === DEBUG_CHANNEL).map(c => c.text)
  return { world, target, script, ctl, ears, send, run, tell, debug, root: target.prims[0]!, child: target.prims[1]! }
}

describe('a division that Second Life cannot do', () => {
  // In-world (Mono): each of these said "pre", then the prim said
  // "<prim name> [script:<script name>] Script run-time error" and "Math Error"
  // on DEBUG_CHANNEL, the script never said "post", llGetScriptState read 0 a
  // second later and a link message sent after it got no answer.
  it.each([
    ['an integer by integer zero', 'idiv'],
    ['an integer modulo integer zero', 'imod'],
    ['a float by float zero', 'fdiv'],
    ['float zero by float zero', 'f00'],
    ['an integer by float zero', 'ifdiv'],
    ['a float by integer zero', 'fidiv'],
    ['a vector by float zero', 'vdiv'],
    ['a vector by integer zero', 'vdivi'],
    ['infinity by infinity', 'infinf'],
    ['NaN by a float', 'nan1'],
    ['a float by NaN', 'nan2'],
  ])('crashes the script on %s', async (_what, op) => {
    const { script, send, run, tell, ctl, debug } = await rig()
    send(op)
    expect(run).toThrow('Math Error')
    expect(debug()).toEqual(['Target [script:a] Script run-time error', 'Math Error'])
    expect(script.global('log')).toEqual(['entry', 'pre'])
    expect(script.running).toBe(false)
    tell('state')
    expect(ctl.global('states')).toEqual([0])
    send('ping')
    run()
    expect(script.global('log')).toEqual(['entry', 'pre'])
  })

  // In-world (Mono): these said "post" with the value and the script kept running.
  it.each([
    ['a vector by NaN', 'vnan', '<NaN, NaN, NaN>'],
    ['a vector by infinity', 'vinf', '<0.00000, 0.00000, 0.00000>'],
    ['a vector by a zero rotation', 'vrot', '<0.00000, 0.00000, 0.00000>'],
    ['a rotation by a zero rotation', 'rrot', '<0.00000, 0.00000, 0.00000, 0.00000>'],
    ['the lowest integer by -1', 'minint', '-2147483648'],
    ['the lowest integer modulo -1', 'minmod', '0'],
  ])('gives a value for %s', async (_what, op, value) => {
    const { script, send, run, debug } = await rig()
    send(op)
    run()
    expect(script.global('log')).toEqual(['entry', 'pre', value, 'post'])
    expect(script.running).toBe(true)
    expect(debug()).toEqual([])
  })

  it('rejects a float modulo when the script is compiled', async () => {
    // In-world: "float z; ... 1.0 % z" did not compile: "Type mismatch" under
    // Mono, "Invalid operator: float % float." compiled to Luau.
    await expect(loadScript({ source: 'default { state_entry() { float z; llOwnerSay((string)(1.0 % z)); } }' }))
      .rejects.toThrow('Type mismatch')
  })
})

describe('other run-time errors', () => {
  it('crashes the script on its 66th listen with "Too Many Listens"', async () => {
    // In-world (Mono, and the same source compiled to Luau): a loop of 70
    // llListen calls -> "<prim> [script:<name>] Script run-time error" and
    // "Too Many Listens", no "post", llGetScriptState 0.
    const { script, send, run, debug } = await rig()
    send('listens')
    expect(run).toThrow('Too Many Listens')
    expect(debug()).toEqual(['Target [script:a] Script run-time error', 'Too Many Listens'])
    expect(script.global('log')).toEqual(['entry', 'pre'])
    expect(script.running).toBe(false)
  })

  it('names the prim and the script on a Stack-Heap Collision', async () => {
    // In-world (Mono): unbounded recursion -> "<prim> [script:<name>] Script
    // run-time error" and "Stack-Heap Collision", llGetScriptState 0.
    const s = await loadScript({
      source: 'integer deep(integer d) { return deep(d + 1) + 1; } default { state_entry() { deep(0); } }',
      scriptName: 'K',
      memoryLimit: true,
    })
    expect(() => s.start()).toThrow('Stack-Heap Collision')
    expect(s.chat.map(c => c.text)).toEqual(['Object [script:K] Script run-time error', 'Stack-Heap Collision'])
    expect(s.running).toBe(false)
  })
})

describe('who hears a run-time error', () => {
  it('is said by the prim that holds the script, to listeners within 20 m outside that prim', async () => {
    // In-world: a crash in the root -> the listeners in the child prim, in the
    // objects 1.8 m, 15 m and 19.5 m away and on the owner's attachment heard
    // both lines, from the root's name and key. The listener in the root itself
    // and the objects 20.5 m, 30 m and 120 m away heard nothing.
    const { ears, root, send, run } = await rig()
    send('idiv')
    expect(run).toThrow('Math Error')
    run()
    const lines = [
      'Target', root.key, 'Target [script:a] Script run-time error',
      'Target', root.key, 'Math Error',
    ]
    expect(ears['child']!.global('heard')).toEqual(lines)
    expect(ears['near']!.global('heard')).toEqual(lines)
    expect(ears['same']!.global('heard')).toEqual([])
    expect(ears['far']!.global('heard')).toEqual([])
  })

  it('is said by the child prim when the script is in the child', async () => {
    // In-world: a crash in the child -> the root's listener and the objects
    // 1.8 m and 15 m away heard "<child name> [script:<name>] Script run-time
    // error" and "Math Error" from the child's name and key.
    const { target, ears, child, send, run } = await rig()
    send('idiv', target.scripts['kc']!)
    expect(run).toThrow('Math Error')
    run()
    const lines = [
      'Child', child.key, 'Child [script:kc] Script run-time error',
      'Child', child.key, 'Math Error',
    ]
    expect(ears['same']!.global('heard')).toEqual(lines)
    expect(ears['near']!.global('heard')).toEqual(lines)
    expect(ears['child']!.global('heard')).toEqual([])
  })
})

describe('a crashed script', () => {
  /** A script in state two with a timer, a listen and a repeating sensor, then crashed. */
  async function crashed() {
    const r = await rig()
    r.send('two')
    r.run()
    r.send('arm')
    r.target.linkset.advanceTime(4000)
    expect(r.script.global('n')).toBe(1)
    expect(r.script.global('log')).toEqual(['entry', 'entry two', 'timer', 'no_sensor'])
    r.send('idiv')
    // A message already waiting behind the one that crashes the script.
    r.send('ping')
    expect(r.run).toThrow('Math Error')
    expect(r.script.running).toBe(false)
    return r
  }

  it('stays down when llSetScriptState tries to start it', async () => {
    // In-world: llSetScriptState(name, TRUE) on the crashed script, and FALSE
    // then TRUE -> llGetScriptState still 0 right after and 2 s later; the
    // script said nothing, its timer and sensor stayed silent, and a link
    // message got no answer.
    const { script, ctl, target, tell, send } = await crashed()
    tell('start')
    tell('state')
    tell('stop')
    tell('start')
    tell('state')
    send('ping')
    target.linkset.advanceTime(10_000)
    expect(ctl.global('states')).toEqual([0, 0])
    expect(script.running).toBe(false)
    expect(script.global('log')).toEqual(['entry', 'entry two', 'timer', 'no_sensor', 'pre'])
    expect(script.global('n')).toBe(1)
  })

  it('runs again from the top on llResetOtherScript, holding nothing it held before', async () => {
    // In-world: the script crashed in state two with g = 42, a 3 s timer, a
    // listen and a repeating sensor; link messages were sent to it while it
    // was down. llResetOtherScript 77 s after the crash -> llGetScriptState
    // read 1 right after the call (the test reads it before the script's
    // state_entry runs), the script said state_entry in default with
    // g = 0 and nothing before it (no late timer or sensor), answered
    // none of the earlier messages, and in the next minute its timer and
    // sensor never fired and it did not hear chat on its old channel. A link
    // message sent after the reset was answered from default.
    const { script, ctl, ears, target, tell, send, run } = await crashed()
    send('ping')
    target.linkset.advanceTime(10_000)
    target.linkset.clock.schedule(ctl, target.linkset.clock.now, 'link_message', { sender_num: 1, num: 0, str: 'reset', id: 'a' })
    target.linkset.clock.schedule(ctl, target.linkset.clock.now, 'link_message', { sender_num: 1, num: 0, str: 'state', id: 'a' })
    run()
    expect(ctl.global('states')).toEqual([1])
    expect(script.running).toBe(true)
    expect(script.currentState).toBe('default')
    expect(script.global('g')).toBe(0)
    expect(script.global('log')).toEqual(['entry'])
    ears['near']!.host.linkset!.routeChat(ears['near']!.host, 'say', 7, 'hello')
    target.linkset.advanceTime(10_000)
    expect(script.global('n')).toBe(0)
    expect(script.global('log')).toEqual(['entry'])
    send('ping')
    run()
    expect(script.global('log')).toEqual(['entry', 'pong default'])
  })

  it('is stopped by llSetScriptState right after the reset and runs state_entry when started', async () => {
    // In-world: llResetOtherScript then llSetScriptState(FALSE) on the crashed
    // script in one handler -> llGetScriptState 0 and nothing said. 4 s later
    // llSetScriptState(TRUE) -> it said state_entry in default with g = 0.
    const { script, ctl, target, send, run } = await crashed()
    for (const m of ['reset', 'stop', 'state']) {
      target.linkset.clock.schedule(ctl, target.linkset.clock.now, 'link_message', { sender_num: 1, num: 0, str: m, id: 'a' })
    }
    target.linkset.advanceTime(4000)
    expect(ctl.global('states')).toEqual([0])
    expect(script.global('log')).toEqual([])
    ctl.fire('link_message', { sender_num: 1, num: 0, str: 'start', id: 'a' })
    run()
    expect(script.running).toBe(true)
    expect(script.currentState).toBe('default')
    expect(script.global('log')).toEqual(['entry'])
  })

  it('answers a link message sent right after the reset, after state_entry', async () => {
    // In-world: llResetOtherScript on the crashed script, then
    // llMessageLinked in the same handler -> state_entry, then the answer
    // from default.
    const r = await rig()
    r.send('idiv')
    expect(r.run).toThrow('Math Error')
    const both = await loadScript({ host: r.root, scriptName: 'both', source: `default { link_message(integer s, integer n, string m, key k) {
      if (m != "both") return;
      llResetOtherScript("a"); llMessageLinked(LINK_THIS, 0, "ping", "");
    } }` })
    both.start()
    both.fire('link_message', { sender_num: 1, num: 0, str: 'both', id: NULL_KEY })
    r.run()
    expect(r.script.global('log')).toEqual(['entry', 'pong default'])
  })

  it('differs from a stopped script, which llResetOtherScript leaves alone', async () => {
    // In-world: the same script stopped with llSetScriptState(FALSE) instead
    // of crashed, then llResetOtherScript -> llGetScriptState stayed 0 and it
    // said nothing. llSetScriptState(TRUE) -> it carried on in state two with
    // g = 42 and its timer, sensor and listen.
    const { script, ctl, ears, target, tell, send, run } = await rig()
    send('two')
    run()
    send('arm')
    run()
    tell('stop')
    tell('reset')
    tell('state')
    target.linkset.advanceTime(1000)
    expect(ctl.global('states')).toEqual([0])
    tell('start')
    target.linkset.advanceTime(7000)
    ears['near']!.host.linkset!.routeChat(ears['near']!.host, 'say', 7, 'hello')
    target.linkset.advanceTime(0)
    expect(script.currentState).toBe('two')
    expect(script.global('g')).toBe(42)
    const log = script.global('log') as string[]
    expect(log.filter(l => l.startsWith('entry'))).toEqual(['entry', 'entry two'])
    expect(log).toContain('timer')
    expect(log).toContain('no_sensor')
    expect(log.at(-1)).toBe('heard hello')
  })

  it('comes back when it crashed in its own timer and is reset later', async () => {
    // In-world: a script that held a 3 s timer when a link message crashed it
    // was reset 77 s later (and another 12 s later); each said state_entry and
    // no timer line before it. Here the crash is in the timer handler itself.
    const { target, ctl } = await rig(lsl('a', `integer z; list log;
      default {
        state_entry() { log += "entry"; llSetTimerEvent(3.0); }
        timer() { log += "tick"; if (llGetTime() > 5.0) log += (string)(1 / z); }
      }`))
    expect(() => target.linkset.advanceTime(6000)).toThrow('Math Error')
    target.linkset.advanceTime(10_000)
    const a = target.scripts['a']!
    expect(a.global('log')).toEqual(['entry', 'tick', 'tick'])
    ctl.fire('link_message', { sender_num: 1, num: 0, str: 'reset', id: 'a' })
    expect(a.running).toBe(true)
    expect(a.global('log')).toEqual(['entry'])
    target.linkset.advanceTime(3000)
    expect(a.global('log')).toEqual(['entry', 'tick'])
  })
})

describe('an SLua script', () => {
  const slua = (source = sluaVictim) => rig({ name: 'a', source: { source, filename: 'a.luau' }, language: 'slua' })

  it('does not treat a division by zero as an error', async () => {
    // In-world: 1 / 0 -> inf, 1 % 0 -> nan, 1 // 0 -> inf, vector(1, 2, 3) / 0
    // -> <inf, inf, inf>; the script kept running.
    const { script, send, run, debug } = await slua()
    for (const op of ['div', 'mod', 'idiv', 'vdiv']) send(op)
    run()
    expect(script.global('log')).toEqual(['entry', 'pre', 'inf', 'post', 'pre', 'nan', 'post', 'pre', 'inf', 'post', 'pre', '<inf, inf, inf>', 'post'])
    expect(script.running).toBe(true)
    expect(debug()).toEqual([])
  })

  it.each([
    ['error("boom")', 'err', /boom/],
    ['indexing nil', 'nilidx', /attempt to index nil/],
    ['error(42)', 'err42', /42/],
    ['error("plain", 0)', 'errlvl0', /plain/],
    ['an ll call that rejects its arguments', 'llerr', /1-based index/],
  ])('crashes on %s and says "runtime error"', async (_what, op, thrown) => {
    // In-world: the prim said "<prim> [script:<name>] Script run-time error"
    // and "runtime error" on DEBUG_CHANNEL; no "post"; llGetScriptState 0; a
    // later link message got no answer. The Lua message is not in the chat;
    // rezless keeps it on the error it throws.
    const { script, ctl, send, run, tell, debug } = await slua()
    send(op)
    expect(run).toThrow(thrown)
    expect(debug()).toEqual(['Target [script:a] Script run-time error', 'runtime error'])
    expect(script.global('log')).toEqual(['entry', 'pre'])
    expect(script.running).toBe(false)
    tell('state')
    expect(ctl.global('states')).toEqual([0])
    send('ping')
    run()
    expect(script.global('log')).toEqual(['entry', 'pre'])
  })

  it.each([
    ['a table', 'errtab', 'table'],
    ['nil', 'errnil', 'nil'],
    ['a boolean', 'errtrue', 'boolean'],
  ])('says "Unknown runtime error" for an error value that is %s', async (_what, op, type) => {
    // In-world: error({ code = 1 }), error() and error(true) -> "<prim>
    // [script:<name>] Script run-time error" and "Unknown runtime error";
    // llGetScriptState 0. A vector and a function said the same. error(42)
    // said "runtime error".
    const { script, send, run, debug } = await slua()
    send(op)
    expect(run).toThrow(`error object is a ${type} value`)
    expect(debug()).toEqual(['Target [script:a] Script run-time error', 'Unknown runtime error'])
    expect(script.running).toBe(false)
  })

  it('says "not enough memory" when it runs out of memory', async () => {
    // In-world: unbounded recursion in an SLua script (and in LSL compiled to
    // Luau) -> "<prim> [script:<name>] Script run-time error" and "not enough
    // memory"; llGetScriptState 0.
    const s = await loadScript({
      source: 'local function f(d) return f(d + 1) + 1 end\nf(0)',
      language: 'slua', filename: 'deep.luau', scriptName: 'LK', memoryLimit: true,
    })
    expect(() => s.start()).toThrow('not enough memory')
    expect(s.chat.map(c => c.text)).toEqual(['Object [script:LK] Script run-time error', 'not enough memory'])
    expect(s.running).toBe(false)
  })

  it.each([['bare', 'listens'], ['inside pcall', 'plisten']])('crashes on its 66th listen with "Too Many Listens", %s', async (_how, op) => {
    // In-world: 70 ll.Listen calls, bare and inside pcall -> "<prim>
    // [script:<name>] Script run-time error" and "Too Many Listens", no
    // "post", llGetScriptState 0. pcall did not catch it.
    const { script, send, run, debug } = await slua()
    send(op)
    expect(run).toThrow('Too Many Listens')
    expect(debug()).toEqual(['Target [script:a] Script run-time error', 'Too Many Listens'])
    expect(script.global('log')).toEqual(['entry', 'pre'])
    expect(script.running).toBe(false)
  })

  it('keeps running when pcall catches the error', async () => {
    // In-world: pcall(function() error("inner") end) -> false, the handler
    // carried on, nothing on DEBUG_CHANNEL, llGetScriptState 1.
    const { script, send, run, debug } = await slua()
    send('pcall')
    run()
    expect(script.global('log')).toEqual(['entry', 'pre', 'false', 'post'])
    expect(script.running).toBe(true)
    expect(debug()).toEqual([])
  })

  it('crashes on an error at the top level after running what came before it', async () => {
    // In-world: a script of ll.RegionSay(...) then error("top boom") said its
    // line, then "<prim> [script:<name>] Script run-time error" and "runtime
    // error"; llGetScriptState 0.
    const s = await loadScript({ source: 'll.Say(5, "before")\nerror("top boom")', language: 'slua', filename: 'top.luau', scriptName: 'LTOP' })
    expect(() => s.start()).toThrow('top boom')
    expect(s.chat.map(c => c.text)).toEqual(['before', 'Object [script:LTOP] Script run-time error', 'runtime error'])
    expect(s.running).toBe(false)
  })

  it('comes back only through a reset, with no timer or listen', async () => {
    // In-world: an SLua script with g = 42, an LLTimers:every(3) timer and a
    // listen crashed on error("boom"). ll.SetScriptState TRUE (and FALSE then
    // TRUE) from an LSL script -> llGetScriptState stayed 0. llResetOtherScript
    // -> llGetScriptState 1 at once, the script ran from the top with g = 0,
    // its timer never fired again and it did not hear its old channel.
    const { script, ctl, ears, target, tell, send, run } = await slua()
    send('arm')
    target.linkset.advanceTime(4000)
    expect(script.global('n')).toBe(1)
    send('err')
    expect(run).toThrow('boom')
    tell('start')
    tell('state')
    target.linkset.advanceTime(4000)
    expect(script.running).toBe(false)
    expect(script.global('n')).toBe(1)
    tell('reset')
    tell('state')
    expect(ctl.global('states')).toEqual([0, 1])
    target.linkset.advanceTime(0)
    expect(script.global('g')).toBe(0)
    expect(script.global('log')).toEqual(['entry'])
    ears['near']!.host.linkset!.routeChat(ears['near']!.host, 'say', 7, 'hello')
    target.linkset.advanceTime(10_000)
    expect(script.global('n')).toBe(0)
    expect(script.global('log')).toEqual(['entry'])
  })
})
