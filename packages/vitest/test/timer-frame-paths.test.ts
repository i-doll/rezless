import { describe, expect, it } from 'vitest'
import { loadLinkset } from '../src/index.js'

const SIM_FRAME_MS = 1000 / 45

type Language = 'lsl' | 'slua'

/**
 * Load one script whose `L` global logs `<event>@<seconds>`, mock llSetText to keep it busy for
 * as many frames as its third argument, run it `ms` and read its log as `<event><frames>`, in
 * frames after its first entry.
 */
async function frames(language: Language, source: string, ms = 3000) {
  const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 's', language, source: { source } }] }] })
  const s = scripts['s']!
  s.mock('llSetText', (ctx, args) => { ctx.busy(Number(args[2]) * SIM_FRAME_MS); return undefined })
  linkset.startAll()
  linkset.advanceTime(ms)
  const log = JSON.parse(JSON.stringify(s.global('L'))) as string[]
  const at = (e: string) => Number(e.split('@')[1])
  return log.slice(1).map((e) => e.split('@')[0]! + Math.round((at(e) - at(log[0]!)) * 45))
}

// The in-world probes (Aditi, SLua Tideland, Firestorm, 2026-11-25) ran in one prim holding two
// LSL (Mono) and two SLua loggers. A chat command made each one call what the test calls, and each
// logged every event with llGetTimestamp; frames below count from the handler that made the calls.

describe('a timer and a repeating sensor under llMinEventDelay', () => {
  // In-world: llMinEventDelay, a repeating sensor that found nothing and a timer, set in one
  // handler. Under llMinEventDelay(0.105) with a 0.1 s timer and a 0.1 s sensor, each logger ran
  // a tick on frame 5 and the no_sensor on frame 6, then 10 and 11, 15 and 16, and so on, in all
  // seven runs, with the sensor set before or after the timer. With a 0.3 s sensor the no_sensor
  // ran a frame behind the tick on frames 15 and 30 (three runs), and under a 0.15 s delay the two
  // ran on frames 7 and 8, 14 and 15, 21 and 22 (two runs). LSL and SLua alike. The delay counts
  // from the frame it last let events through, and every event due by then goes through with it.
  const lsl = (delay: number, sensor: number) => `list L;
    integer n;
    rec(string e) { L += e + "@" + (string)llGetTime(); }
    stop() { if (++n >= 8) { llSetTimerEvent(0); llSensorRemove(); } }
    default {
      state_entry() {
        rec("call"); llMinEventDelay(${delay});
        llSensorRepeat("nobody", NULL_KEY, AGENT, 1.0, PI, ${sensor}); llSetTimerEvent(0.1);
      }
      timer() { rec("t"); stop(); }
      no_sensor() { rec("s"); stop(); }
    }`
  const slua = (delay: number, sensor: number) => `L = {}
    local n, th = 0, nil
    local function rec(e) table.insert(L, e .. "@" .. tostring(ll.GetTime())) end
    local function stop() n += 1 if n >= 8 then LLTimers:off(th) ll.SensorRemove() end end
    rec("call") ll.MinEventDelay(${delay})
    ll.SensorRepeat("nobody", NULL_KEY, AGENT, 1.0, PI, ${sensor})
    th = LLTimers:every(0.1, function() rec("t") stop() end)
    LLEvents:on("no_sensor", function() rec("s") stop() end)`

  it.each(['lsl', 'slua'] as const)('runs the sensor result a frame behind each tick in %s', async (language) => {
    const source = language === 'lsl' ? lsl(0.105, 0.1) : slua(0.105, 0.1)
    expect(await frames(language, source)).toEqual(['t5', 's6', 't10', 's11', 't15', 's16', 't20', 's21'])
  })

  it.each(['lsl', 'slua'] as const)('holds a sensor result due between two ticks until the next %s tick', async (language) => {
    const source = language === 'lsl' ? lsl(0.105, 0.3) : slua(0.105, 0.3)
    expect(await frames(language, source)).toEqual(['t5', 't10', 't15', 's16', 't20', 't25', 't30', 's31'])
  })

  it.each(['lsl', 'slua'] as const)('lets them through on the first frame the delay has passed in %s', async (language) => {
    const source = language === 'lsl' ? lsl(0.15, 0.1) : slua(0.15, 0.1)
    expect(await frames(language, source)).toEqual(['t7', 's8', 't14', 's15', 't21', 's22', 't28', 's29'])
  })
})

describe('an LSL timer through a sleep', () => {
  // In-world: llSetTimerEvent(0.1) and then llSleep(0.25), which woke on frame 12 -> the held tick
  // ran on frame 13 and the next ticks on 17, 21, 26, 30 and 35, every 0.1 s from the wake (five
  // runs): a tick held through more than an interval starts the schedule again on the frame the
  // script woke on, not when the tick ran. The ticks due exactly on frames 21 and 30 ran on the next
  // frame in two of the ten logger runs.
  it('counts the next ticks from the frame it woke on', async () => {
    expect(await frames('lsl', `list L;
      rec(string e) { L += e + "@" + (string)llGetTime(); }
      default {
        state_entry() { rec("call"); llSetTimerEvent(0.1); llSleep(12.0 / 45); rec("w"); }
        timer() { rec("t"); if (llGetListLength(L) >= 8) llSetTimerEvent(0); }
      }`)).toEqual(['w12', 't13', 't17', 't21', 't26', 't30', 't35'])
  })

  // In-world: the same with a link message sent before the sleep, which each of the four loggers
  // heard from all four -> the messages ran on frames 13 to 16, the held tick on 17, and the next
  // ticks on 19, 21, 26, 30 and 35 (five runs): the tick due at 16.5 frames waited the two frames
  // an LSL tick keeps from the one before.
  it('counts them from the wake when the held tick waits behind link messages', async () => {
    expect(await frames('lsl', `list L;
      rec(string e) { L += e + "@" + (string)llGetTime(); }
      default {
        state_entry() {
          rec("call"); llSetTimerEvent(0.1);
          integer i; for (i = 0; i < 4; ++i) llMessageLinked(LINK_THIS, 0, "", "");
          llSleep(12.0 / 45); rec("w");
        }
        link_message(integer s, integer n, string m, key k) { rec("lm"); }
        timer() { rec("t"); if (llGetListLength(L) >= 12) llSetTimerEvent(0); }
      }`)).toEqual(['w12', 'lm13', 'lm14', 'lm15', 'lm16', 't17', 't19', 't21', 't26', 't30', 't35'])
  })

  // In-world: a 0.05 s timer through llSleep(0.12), which woke on frame 6 -> ticks on 7, 9, 11, 13,
  // 16 and 18 (two runs; the tick due exactly on frame 15 ran on the next).
  it('counts a short timer from the frame it woke on', async () => {
    expect(await frames('lsl', `list L;
      rec(string e) { L += e + "@" + (string)llGetTime(); }
      default {
        state_entry() { rec("call"); llSetTimerEvent(0.05); llSleep(6.0 / 45); rec("w"); }
        timer() { rec("t"); if (llGetListLength(L) >= 8) llSetTimerEvent(0); }
      }`)).toEqual(['w6', 't7', 't9', 't11', 't13', 't15', 't18'])
  })
})

describe('an LSL timer through a longer sleep', () => {
  // In-world: llSetTimerEvent(0.7) and then llSleep(1.5), which woke on frame 68 -> the held tick
  // on 69 and the next ones on 100, 131 or 132, 163 and 194 or 195 (three runs): 0.7 s from the
  // wake, not from the held tick, which would give 101.
  it('counts the next ticks from the frame it woke on', async () => {
    expect(await frames('lsl', `list L;
      rec(string e) { L += e + "@" + (string)llGetTime(); }
      default {
        state_entry() { rec("call"); llSetTimerEvent(0.7); llSleep(68.0 / 45); rec("w"); }
        timer() { rec("t"); if (llGetListLength(L) >= 7) llSetTimerEvent(0); }
      }`, 5000)).toEqual(['w68', 't69', 't100', 't131', 't163', 't194'])
  })

  // In-world: a 0.1 s timer whose first tick ran on frame 4 and slept 0.25 s, waking on 16 -> the
  // held tick ran two frames later, on 18, and the next ones on 23, 28, 32 and 37 (three runs, the
  // ticks due exactly on frames 27 and 36 a frame late in all): a tick held in a timer handler's
  // sleep counts from when it ran. (In-world the first tick came a frame early, on a lag an earlier
  // timer left; here it comes on frame 5 and the rest a frame later.)
  it('counts them from the held tick when a timer handler slept', async () => {
    expect(await frames('lsl', `list L;
      integer slept;
      rec(string e) { L += e + "@" + (string)llGetTime(); }
      default {
        state_entry() { rec("call"); llSetTimerEvent(0.1); }
        timer() {
          rec("t");
          if (!slept) { slept = 1; llSleep(12.0 / 45); rec("w"); }
          else if (llGetListLength(L) >= 8) llSetTimerEvent(0);
        }
      }`)).toEqual(['t5', 'w17', 't19', 't24', 't28', 't33', 't37'])
  })

  // In-world (Aditi, SLua Tideland, 2026-11-25): the same timer handler sent itself two or four link
  // messages before its sleep -> woke on 16 or 17, ran the messages a frame apart and then the held
  // tick, and the next ticks still counted from two frames after the wake: with two messages, waking
  // on 16, ticks 19, 23, 27, 32, 36, and waking on 17, 20, 24, 28, 33, 37 (three runs); with four,
  // waking on 17, ticks 22, 24, 28, 33, 37 (two runs). Not from the wake, nor from the held tick,
  // which would give 25, 29, 34 with two messages. An SLua LLTimers callback counted from when the
  // held callback ran (three and two runs).
  it.each([
    [2, ['t5', 'w17', 'lm18', 'lm19', 't20', 't24', 't28', 't33', 't37']],
    [4, ['t5', 'w17', 'lm18', 'lm19', 'lm20', 'lm21', 't22', 't24', 't28', 't33', 't37']],
  ] as const)('counts them from two frames after the wake with %s link messages ahead of the held tick', async (messages, expected) => {
    expect(await frames('lsl', `list L;
      integer slept;
      rec(string e) { L += e + "@" + (string)llGetTime(); }
      default {
        state_entry() { rec("call"); llSetTimerEvent(0.1); }
        link_message(integer s, integer n, string m, key k) { rec("lm"); }
        timer() {
          rec("t");
          if (!slept) {
            slept = 1;
            integer i; for (i = 0; i < ${messages}; ++i) llMessageLinked(LINK_THIS, 0, "", "");
            llSleep(12.0 / 45); rec("w");
          }
          else if (llGetListLength(L) >= ${expected.length + 1}) llSetTimerEvent(0);
        }
      }`)).toEqual(expected)
  })
})

describe('an LSL timer through a busy handler', () => {
  // In-world: llSetTimerEvent and then a spin that ended on frame 12, 19 or 30. The first tick that
  // fell due in the spin ran a frame after it, and one more stood for those after it two frames
  // later. When that one stood for a tick due more than an interval before it ran, the next ticks
  // came every interval from when it ran:
  // 0.1 s timer, 0.25 s spin -> 13, 15, 20, 24, 29, 33 (five runs; the ticks due exactly on
  // frames 24 and 33 ran on the next frame in one).
  // 0.05 s timer, 0.25 s spin -> 13, 15, 18, 20, 22, 24, 27, 29 (three runs; 24 ran on 25 in two).
  // 0.1 s timer, 0.4 s spin -> 20, 22, 27, 31, 36, 40 (three runs; 31 and 40 ran a frame later in
  // one).
  // 0.3 s timer, 0.65 s spin -> 31, 33, 41, 54, 68 (four runs): the one tick it stood for was due
  // less than an interval before it ran, and the timer kept its schedule.
  const spin = (interval: number, spinFrames: number, ticks: number) => `list L;
    rec(string e) { L += e + "@" + (string)llGetTime(); }
    default {
      state_entry() { rec("call"); llSetTimerEvent(${interval}); llSetText("", ZERO_VECTOR, ${spinFrames}); rec("w"); }
      timer() { rec("t"); if (llGetListLength(L) >= ${ticks + 2}) llSetTimerEvent(0); }
    }`

  it.each([
    [0.1, 12, ['w12', 't13', 't15', 't20', 't24', 't29', 't33']],
    [0.05, 12, ['w12', 't13', 't15', 't18', 't20', 't22', 't24', 't27', 't29']],
    [0.1, 19, ['w19', 't20', 't22', 't27', 't31', 't36', 't40']],
    [0.3, 30, ['w30', 't31', 't33', 't41', 't54', 't68']],
  ] as const)('ticks a %s s timer through a spin of %s frames on the measured frames', async (interval, spinFrames, expected) => {
    expect(await frames('lsl', spin(interval, spinFrames, expected.length - 1), 4000)).toEqual(expected)
  })

  // In-world (Aditi, SLua Tideland, 2026-11-25): a 0.1 s timer, a spin that ended on frame 12,
  // llSetTimerEvent(0.1) again and a second spin that ended on 24 -> two ticks, on 25 and 27 or 28,
  // and then every 0.1 s from the second: 32, 36, 41, 45 (three runs, two LSL loggers each). The
  // ticks of both spins went into the same two events, and the call did not keep the one that
  // stood for the later ticks from counting the schedule from when it ran.
  it('keeps two ticks for two spins with the timer set again between them', async () => {
    expect(await frames('lsl', `list L;
      rec(string e) { L += e + "@" + (string)llGetTime(); }
      default {
        state_entry() {
          rec("call"); llSetTimerEvent(0.1); llSetText("", ZERO_VECTOR, 12); rec("r");
          llSetTimerEvent(0.1); llSetText("", ZERO_VECTOR, 12); rec("w");
        }
        timer() { rec("t"); if (llGetListLength(L) >= 9) llSetTimerEvent(0); }
      }`)).toEqual(['r12', 'w24', 't25', 't27', 't32', 't36', 't41', 't45'])
  })
})

describe('a whole-second timer', () => {
  // In-world: ticks due exactly on a frame, from timers of 50 ms to 1 s. In LSL every one of 460
  // ran on its frame when the timer was set in a listen handler after an earlier timer had ticked,
  // 90 of 96 when it was set at a reset, and all 60 when set in a timer handler and all 60 in a
  // link_message handler. In SLua an LLTimers timer set in a listen handler ran 220 of 232 on the
  // next frame, one set at a reset 24 of 96, in a timer callback 22 of 60 and in a link_message
  // handler 38 of 60. Which frame varied from run to run and between two scripts set up alike in
  // one run, with no rule a script could see; rezless runs them on that frame.
  it.each([
    ['lsl', `list L;
      default {
        state_entry() { L += "call@" + (string)llGetTime(); llSetTimerEvent(1.0); }
        timer() { L += "t@" + (string)llGetTime(); if (llGetListLength(L) >= 4) llSetTimerEvent(0); }
      }`],
    ['slua', `L = {}
      local th
      table.insert(L, "call@" .. tostring(ll.GetTime()))
      th = LLTimers:every(1.0, function()
        table.insert(L, "t@" .. tostring(ll.GetTime()))
        if #L >= 4 then LLTimers:off(th) end
      end)`],
  ] as const)('ticks in %s on the frames of whole seconds', async (language, source) => {
    expect(await frames(language, source, 4000)).toEqual(['t45', 't90', 't135'])
  })
})
