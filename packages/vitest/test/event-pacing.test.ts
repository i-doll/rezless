import { describe, expect, it } from 'vitest'
const SIM_FRAME_MS = 1000 / 45
import { loadLinkset, World } from '../src/index.js'

const AVATAR = 'abcdefab-1234-1234-1234-abcdefabcdef'

// The in-world probe scripts. Two loggers of one language share the first prim, "1" and "2";
// "T" in the second prim chats on 7749 for them. Each logs every event with the time it ran.
// A command "<who> <cmd> <a>" on 7748 reaches every script; the one named acts on it:
// LM sends a link messages to its own prim, MIX recolours its prim and then sends a link
// messages, LMS sends a link messages and sleeps 14 frames (llSleep(0.3) in-world, which woke on
// the 14th frame), CH recolours its prim three times with
// a spin of a frames between, CLC recolours it, sends a link message and recolours it again with
// a spin of a frames after each, BUSY spins a frames, TM sets a timer of a ms for 8 ticks, TQ sets
// a 0.05 s timer, spins 10 frames and sends a link messages, SAY chats a lines on 7749.
// In-world the spins ran on llGetTime, which moves a frame at a time; here a mocked
// llSetText keeps the script busy as long.
const LSL = `list L; integer ticks; integer tmax;
  rec(string e) { L += [e, llGetTime()]; }
  spin(integer frames) { llSetText("", ZERO_VECTOR, frames); }
  lms(integer n) { integer i; for (i = 1; i <= n; ++i) llMessageLinked(LINK_THIS, i, "", ""); }
  default {
    state_entry() { llListen(7748, "", NULL_KEY, ""); llListen(7749, "", NULL_KEY, ""); }
    listen(integer c, string n, key id, string m) {
      if (c == 7749) { rec("li" + m); return; }
      list w = llParseString2List(m, [" "], []);
      string cmd = llList2String(w, 1); integer a = llList2Integer(w, 2);
      if (llList2String(w, 0) != llGetScriptName()) return;
      rec("cmd");
      if (cmd == "LM") lms(a);
      else if (cmd == "MIX") { llSetColor(<1, 0, 0>, ALL_SIDES); lms(a); }
      else if (cmd == "LMS") { lms(a); llSleep(14.0 / 45); rec("wake"); }
      else if (cmd == "CH") {
        llSetColor(<1, 0, 0>, ALL_SIDES); spin(a); llSetColor(<0, 1, 0>, ALL_SIDES); spin(a);
        llSetColor(<0, 0, 1>, ALL_SIDES); rec("done");
      }
      else if (cmd == "CLC") {
        llSetColor(<1, 0, 0>, ALL_SIDES); spin(a); lms(1); spin(a); llSetColor(<0, 1, 0>, ALL_SIDES); spin(a); rec("done");
      }
      else if (cmd == "BUSY") { spin(a); rec("done"); }
      else if (cmd == "TM") { ticks = 0; tmax = 8; llSetTimerEvent(a / 1000.0); }
      else if (cmd == "TQ") { ticks = 0; tmax = 1; llSetTimerEvent(0.05); spin(10); lms(a); }
      else if (cmd == "SAY") { integer i; for (i = 1; i <= a; ++i) llSay(7749, (string)i); }
    }
    link_message(integer s, integer n, string m, key id) { rec("lm" + (string)n); }
    changed(integer c) { rec("ch" + (string)c); }
    timer() { rec("tm"); if (++ticks >= tmax) llSetTimerEvent(0); }
    touch_start(integer n) { rec("ts"); }
    touch(integer n) { rec("t"); }
    touch_end(integer n) { rec("te"); }
  }`

const SLUA = `L = {}
  local ticks, tmax, th = 0, 0, nil
  local function rec(e) table.insert(L, e) table.insert(L, ll.GetTime()) end
  local function spin(frames) ll.SetText("", vector(0, 0, 0), frames) end
  local function lms(n) for i = 1, n do ll.MessageLinked(LINK_THIS, i, "", "") end end
  ll.Listen(7748, "", "", "")
  ll.Listen(7749, "", "", "")
  LLEvents:on("listen", function(c, n, id, m)
    if c == 7749 then rec("li" .. m) return end
    local w = string.split(m, " ")
    local cmd, a = w[2], tonumber(w[3] or "0") or 0
    if w[1] ~= ll.GetScriptName() then return end
    rec("cmd")
    if cmd == "LM" then lms(a)
    elseif cmd == "MIX" then ll.SetColor(vector(1, 0, 0), ALL_SIDES) lms(a)
    elseif cmd == "LMS" then lms(a) ll.Sleep(14 / 45) rec("wake")
    elseif cmd == "CH" then
      ll.SetColor(vector(1, 0, 0), ALL_SIDES) spin(a) ll.SetColor(vector(0, 1, 0), ALL_SIDES) spin(a)
      ll.SetColor(vector(0, 0, 1), ALL_SIDES) rec("done")
    elseif cmd == "CLC" then
      ll.SetColor(vector(1, 0, 0), ALL_SIDES) spin(a) lms(1) spin(a) ll.SetColor(vector(0, 1, 0), ALL_SIDES) spin(a) rec("done")
    elseif cmd == "BUSY" then spin(a) rec("done")
    elseif cmd == "TM" then
      ticks, tmax = 0, 8
      th = LLTimers:every(a / 1000, function() rec("tm") ticks += 1 if ticks >= tmax then LLTimers:off(th) end end)
    elseif cmd == "TQ" then
      th = LLTimers:every(0.05, function() rec("tm") LLTimers:off(th) end)
      spin(10) lms(a)
    elseif cmd == "SAY" then for i = 1, a do ll.Say(7749, tostring(i)) end
    end
  end)
  LLEvents:on("link_message", function(s, n, m, id) rec("lm" .. n) end)
  LLEvents:on("changed", function(c) rec("ch" .. c) end)
  LLEvents:on("touch_start", function() rec("ts") end)
  LLEvents:on("touch", function() rec("t") end)
  LLEvents:on("touch_end", function() rec("te") end)`

type Language = 'lsl' | 'slua'

async function probe(language: Language) {
  const source = language === 'lsl' ? LSL : SLUA
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: AVATAR, name: 'Test Resident', username: 'test', position: { x: 116, y: 43, z: 20 } })
  const script = (name: string) => ({ name, language, source: { source } })
  const { linkset, scripts } = await loadLinkset({
    world, region: 'home', owner: AVATAR, position: { x: 116, y: 45, z: 20 },
    prims: [{ scripts: [script('1'), script('2')] }, { scripts: [script('T')] }],
  })
  linkset.prims[1]!.params.position = { x: 2.5, y: 0, z: 0 }
  for (const s of Object.values(scripts)) {
    s.mock('llSetText', (ctx, args) => { ctx.busy(Number(args[2]) * SIM_FRAME_MS); return undefined })
  }
  linkset.startAll()
  linkset.advanceTime(1000)
  const marks = new Map(Object.keys(scripts).map((name) => [name, 0]))
  const say = (message: string) => linkset.deliverChat({ channel: 7748, name: 'Test Resident', key: AVATAR, message })
  /** Queue the owner's chat without running anything yet. */
  const queue = (message: string) => linkset.routeAvatarSay(avatar, 7748, message)
  /** Each script's events since the last read, as `<event>@<frames after the command>`. */
  const read = (from: number) => Object.fromEntries(Object.entries(scripts).map(([name, s]) => {
    const log = JSON.parse(JSON.stringify(s.global('L'))) as Array<string | number>
    const out: string[] = []
    for (let i = marks.get(name)!; i < log.length; i += 2) {
      out.push(`${log[i]}@${Math.round((Number(log[i + 1]) * 1000 - from) / SIM_FRAME_MS)}`)
    }
    marks.set(name, log.length)
    return [name, out]
  }))
  return { linkset, say, queue, read }
}

/** Deliver `command`, run 3 s and read what each script logged, in frames after the command. */
async function run(language: Language, command: string) {
  const { linkset, say, read } = await probe(language)
  const at = linkset.clock.now
  say(command)
  linkset.advanceTime(3000)
  return read(at)
}

// In-world: Aditi beta grid, SLua Tideland, Firestorm RLVa, 2026-11-24. A prim held two LSL
// (Mono) and two SLua loggers, which logged llGetTimestamp; a second object chatted for them.
// Times below are simulator frames (1/45 s) after the frame the command ran in.
describe.each(['lsl', 'slua'] as const)('a script\'s queued events (%s)', (language) => {
  // In-world: "LM 6" -> the sender and the other script in the prim each ran the six link
  // messages one frame apart, the first a frame after the command, with LSL or SLua sending,
  // in all four scripts (6 runs). Two scripts in one prim ran theirs in the same frames.
  it('runs one queued link message a frame, in every script of the prim alike', async () => {
    const out = await run(language, '1 LM 6')
    const lms = ['lm1@1', 'lm2@2', 'lm3@3', 'lm4@4', 'lm5@5', 'lm6@6']
    expect(out['1']).toEqual(['cmd@0', ...lms])
    expect(out['2']).toEqual(lms)
  })

  // In-world: "LM 64" -> the link messages ran one a frame, 64 of them over 64 frames (2 runs).
  // The other LSL script got 63 in one run; rezless loses the 64th there as the command
  // still waits in its queue.
  it('takes as many frames as it has queued events', async () => {
    const out = await run(language, '1 LM 63')
    expect(out['2']).toEqual(Array.from({ length: 63 }, (_, i) => `lm${i + 1}@${i + 1}`))
  })

  // In-world: "MIX 3" -> every script ran the three link messages a frame apart, then the
  // colour change a frame after the last (2 runs).
  it('runs a change from before the link messages behind them, a frame after the last', async () => {
    const out = await run(language, '1 MIX 3')
    expect(out['1']).toEqual(['cmd@0', 'lm1@1', 'lm2@2', 'lm3@3', 'ch2@4'])
    expect(out['2']).toEqual(['lm1@1', 'lm2@2', 'lm3@3', 'ch2@4'])
  })

  // In-world: "LMS 4" -> the sender woke 14 frames after the command and ran its four link
  // messages a frame after the wake and one a frame after that; the other script ran them
  // one a frame after the command (2 runs). The same after a 0.3 s spin instead of the sleep.
  it('runs what waited through a sleep a frame after the wake, one a frame', async () => {
    const out = await run(language, '1 LMS 4')
    expect(out['2']).toEqual(['lm1@1', 'lm2@2', 'lm3@3', 'lm4@4'])
    expect(out['1']).toEqual(['cmd@0', 'wake@14', 'lm1@15', 'lm2@16', 'lm3@17', 'lm4@18'])
  })

  // In-world: "TQ 3" -> the tick that fell due in the 10-frame spin ran a frame after the
  // handler, then the three link messages a frame apart (1 run each).
  it('runs a held timer tick and the link messages behind it a frame apart', async () => {
    const out = await run(language, '1 TQ 3')
    expect(out['1']).toEqual(['cmd@0', 'tm@11', 'lm1@12', 'lm2@13', 'lm3@14'])
  })

  // In-world: "SAY 5" from the other object -> every listening script ran the five lines a
  // frame apart, the first a frame after the talker's handler (1 run each).
  it('runs chat another object sent a frame after it, one line a frame', async () => {
    const out = await run(language, 'T SAY 5')
    expect(out['1']).toEqual(['li1@1', 'li2@2', 'li3@3', 'li4@4', 'li5@5'])
    expect(out['2']).toEqual(out['1'])
  })

  // In-world: both loggers spun for 1.5 s while the owner clicked the prim for 0.3 s ->
  // touch_start, touch and touch_end ran a frame apart after the spin, in both languages
  // (2 runs). The first came one frame (SLua) or two (LSL) after the spin; rezless runs it
  // one frame after, as after shorter spins.
  it('runs a click held behind a busy handler one event a frame', async () => {
    const { linkset, queue, read } = await probe(language)
    const at = linkset.clock.now
    queue('1 BUSY 60')
    linkset.touch(1, { hold: 300 })
    linkset.advanceTime(3000)
    expect(read(at)['1']).toEqual(['cmd@0', 'done@60', 'ts@61', 't@62', 'te@63'])
  })
})

describe('two waiting changed events', () => {
  // In-world: "CH" with spins of 3 frames -> the caller got two changed events after its
  // handler: the first a frame after it, the second two frames after the first in LSL (4 of 4
  // runs) and one in SLua (3 of 3).
  it.each([['lsl', 2], ['slua', 1]] as const)('run in the caller in %s, %s frame(s) apart', async (language, gap) => {
    const out = await run(language, '1 CH 3')
    expect(out['1']).toEqual(['cmd@0', 'done@6', 'ch2@7', `ch2@${7 + gap}`])
  })

  // In-world: a logger spinning 1.5 s while another script recoloured its prim three times,
  // 2 frames apart -> it ran its two changed events two frames apart in LSL and one in SLua
  // (2 runs each).
  it.each([['lsl', 2], ['slua', 1]] as const)('run in a busy script in %s, %s frame(s) apart', async (language, gap) => {
    const { linkset, queue, read } = await probe(language)
    const at = linkset.clock.now
    queue('2 BUSY 68')
    queue('1 CH 2')
    linkset.advanceTime(3000)
    const [ch1, ch2] = read(at)['2']!.filter((e) => e.startsWith('ch')).map((e) => Number(e.split('@')[1]))
    // The command for the recolours waits in its queue too, so the first change runs at 70.
    expect(ch1).toBe(70)
    expect(ch2! - ch1!).toBe(gap)
  })

  // In-world: "CLC" with spins of 2 frames -> the caller ran changed, the link message and
  // changed one frame apart in LSL and SLua (2 runs each).
  it.each(['lsl', 'slua'] as const)('with a link message between them run a frame apart in %s', async (language) => {
    const out = await run(language, '1 CLC 2')
    expect(out['1']).toEqual(['cmd@0', 'done@6', 'ch2@7', 'lm1@8', 'ch2@9'])
  })
})

describe('a short timer', () => {
  // In-world: a timer of 10 or 30 ms ticked every two frames in LSL; an LLTimers timer of
  // 10 ms ticked every frame in SLua (1 run each).
  it.each([['lsl', 2], ['slua', 1]] as const)('ticks in %s every %s frame(s)', async (language, gap) => {
    const out = await run(language, '1 TM 10')
    const ticks = out['1']!.filter((e) => e.startsWith('tm')).map((e) => Number(e.split('@')[1]))
    expect(ticks).toHaveLength(8)
    expect(ticks.slice(1).map((f, i) => f - ticks[i]!)).toEqual(Array(7).fill(gap))
  })
})

describe('a timer next to events that take every frame', () => {
  // In-world: a timer ticked on time while at_target and at_rot_target events took every frame
  // (see script-lifecycle.test.ts). A tick that fell due runs ahead of the chat that came up after
  // it, and behind the chat that came up before it.
  it.each(['lsl', 'slua'] as const)('ticks between the chat lines around it in %s', async (language) => {
    const source = language === 'lsl'
      ? `list log;
        default { state_entry() { llListen(5, "", NULL_KEY, ""); llSetTimerEvent(0.1); }
          listen(integer c, string n, key k, string m) { log += m; } timer() { log += "tick"; llSetTimerEvent(0); } }`
      : `log = {}
        ll.Listen(5, "", "", "")
        LLEvents:on("listen", function(c, n, k, m) table.insert(log, m) end)
        LLTimers:once(0.1, function() table.insert(log, "tick") end)`
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const avatar = world.addAvatar({ region: 'home', key: AVATAR, name: 'Test Resident', username: 'test', position: { x: 116, y: 43, z: 20 } })
    const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: AVATAR, position: { x: 116, y: 45, z: 20 },
      prims: [{ scripts: [{ name: 's', language, source: { source } }] }] })
    linkset.startAll()
    // The timer falls due 100 ms after the start, between the chat of frames 4 and 5.
    for (let i = 0; i < 10; i++) {
      linkset.routeAvatarSay(avatar, 5, String(i))
      linkset.advanceTime(SIM_FRAME_MS)
    }
    linkset.advanceTime(500)
    expect(JSON.parse(JSON.stringify(scripts['s']!.global('log')))).toEqual(['0', '1', '2', '3', '4', 'tick', '5', '6', '7', '8', '9'])
  })
})
