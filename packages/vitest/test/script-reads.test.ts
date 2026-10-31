import { describe, it, expect } from 'vitest'
import { loadLinkset, loadScript, World } from '../src/index.js'

// In-world: SLua Tideland on Aditi, Mono (2026-10-31). Probes wrote results
// into the object description, read back with object.get.

async function run(body: string, globals = '') {
  const s = await loadScript({ source: `list out; ${globals} default { ${body} }` })
  s.start()
  return s
}

describe('llGetSimulatorHostname', () => {
  // In-world: llGetSimulatorHostname() -> "simhost-08ead0889a544632b.aditi.secondlife.io",
  // the same as llGetEnv("simulator_hostname"), and llGetTime() read 10.044390 after the call.
  it('returns the region host after a 10 second delay', async () => {
    const s = await run(
      'state_entry() { llResetTime(); string h = llGetSimulatorHostname(); out = [h, llGetEnv("simulator_hostname"), llGetTime()]; }',
    )
    expect(s.global('out')).toEqual([
      'simhost-08ead0889a544632b.aditi.secondlife.io',
      'simhost-08ead0889a544632b.aditi.secondlife.io',
      10,
    ])
  })

  it('reads the host set on the region', async () => {
    const world = new World()
    world.addRegion('Home', { x: 0, y: 0 }, { env: { simulator_hostname: 'sim1.example' } })
    const { scripts } = await loadLinkset({
      world,
      region: 'Home',
      prims: [{ scripts: [{ name: 'probe', source: { source: 'list out; default { state_entry() { out = [llGetSimulatorHostname()]; } }' } }] }],
    })
    scripts.probe!.start()
    expect(scripts.probe!.global('out')).toEqual(['sim1.example'])
  })
})

describe('llGetStartParameter and llGetStartString', () => {
  // In-world: in a box made with the build tool, llGetStartParameter() -> 0 and llGetStartString() -> "".
  it('read 0 and "" in an object that was not rezzed', async () => {
    const s = await run('state_entry() { out = [llGetStartParameter(), llGetStartString()]; }')
    expect(s.global('out')).toEqual([0, ''])
  })

  const rezzed = `state_entry() {
      string now = (string)llGetStartParameter() + "," + llGetStartString();
      if (llLinksetDataRead("first") == "") { llLinksetDataWrite("first", now); llResetScript(); }
      out = [llLinksetDataRead("first"), now];
    }`

  // In-world (SLua Tombolo): a child rezzed with llRezObjectWithParams and
  // [REZ_PARAM, 42, REZ_PARAM_STRING, "hello"] read 42 and "hello"; after llResetScript it
  // read 0 and "hello".
  it('read what the object was rezzed with, and a reset clears only the parameter', async () => {
    const s = await loadScript({ source: `list out; default { ${rezzed} }`, startParameter: 42, startString: 'hello' })
    s.start()
    expect(s.global('out')).toEqual(['42,hello', '0,hello'])
  })

  // In-world: a child rezzed with llRezObject(..., 7) read 7 and "", then 0 and "" after a reset.
  it('read the parameter of every script in a rezzed linkset', async () => {
    const { scripts } = await loadLinkset({
      startParameter: 7,
      prims: [{ scripts: [{ name: 'a', source: { source: 'list out; default { state_entry() { out = [llGetStartParameter(), llGetStartString()]; } }' } }] }],
    })
    scripts.a!.start()
    expect(scripts.a!.global('out')).toEqual([7, ''])
  })
})

describe('llMinEventDelay', () => {
  const ticks = (setup: string, until = 0.7) =>
    run(
      `state_entry() { ${setup} llResetTime(); llSetTimerEvent(0.1); }
       timer() { if (llGetTime() < ${until}) out += [llGetTime()]; else llSetTimerEvent(0); }`,
    )

  // In-world, a 0.1 s timer counted for 6 s: no call, 0.0, 0.01, 0.05 and -5.0 -> 60 or 61
  // ticks; 0.2 -> 29, 0.3 -> 20, 1.0 -> 6, 3.0 -> 2.
  it.each([
    ['', [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]],
    ['llMinEventDelay(0.0);', [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]],
    ['llMinEventDelay(0.05);', [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]],
    ['llMinEventDelay(-5.0);', [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]],
    ['llMinEventDelay(0.2);', [0.2, 0.4, 0.6]],
    ['llMinEventDelay(0.3);', [0.3, 0.6]],
  ])('spaces timer events: %s', async (setup, want) => {
    const s = await ticks(setup)
    s.advanceTime(1000)
    expect((s.global('out') as number[]).map((t) => Math.round(t * 1000) / 1000)).toEqual(want)
  })

  // In-world: llMinEventDelay(1.0) and a 0.1 s timer whose handler sleeps 0.5 s -> ticks at
  // 1.000014, 2.022415, 3.044474, 4.044626: one second apart counted from each handler's start.
  it('counts the delay from the start of the previous event', async () => {
    const s = await run(
      `state_entry() { llMinEventDelay(1.0); llResetTime(); llSetTimerEvent(0.1); }
       timer() { out += [llGetTime()]; llSleep(0.5); if (llGetListLength(out) == 4) llSetTimerEvent(0); }`,
    )
    s.advanceTime(10_000)
    expect(s.global('out')).toEqual([1, 2, 3, 4])
  })

  // In-world: with llMinEventDelay(1.0), four llMessageLinked(LINK_THIS) calls arrived a frame
  // (0.022 s) apart, and a talker prim's 0.1 s llSay reached a listen 61 times in 6 s.
  it('does not delay link messages or listens', async () => {
    const s = await run(
      `state_entry() { llMinEventDelay(1.0); llListen(5, "", NULL_KEY, ""); llResetTime();
         integer i; for (i = 0; i < 3; ++i) llMessageLinked(LINK_THIS, i, "", ""); }
       link_message(integer s, integer n, string m, key k) { out += ["lm", llGetTime()]; }
       listen(integer c, string n, key i, string m) { out += ["listen", llGetTime()]; }`,
    )
    s.deliverChat({ channel: 5, name: 'talker', key: '00000000-0000-0000-0000-000000000005', message: 'x' })
    expect(s.global('out')).toEqual(['lm', 0, 'lm', 0, 'lm', 0, 'listen', 0])
  })

  // In-world: with llMinEventDelay(2.0), clicks at about t, t+0.3, t+2.8 and t+3.1 gave
  // touch_start at 4.178, 6.178, 8.178, each followed by its touch_end 0.022 s later.
  // Eight clicks inside a 1.0 s window gave two touch_starts, with num_detected 1 each.
  it('queues one click at a time, two seconds apart, and drops the rest', async () => {
    const s = await run(
      `state_entry() { llMinEventDelay(2.0); llResetTime(); }
       touch_start(integer n) { out += ["start", n, llGetTime()]; }
       touch_end(integer n) { out += ["end", n, llGetTime()]; }`,
    )
    s.advanceTime(4000)
    s.linkset.touch(0)
    s.advanceTime(300)
    s.linkset.touch(0)
    s.advanceTime(2500)
    s.linkset.touch(0)
    s.advanceTime(300)
    s.linkset.touch(0)
    s.advanceTime(10_000)
    expect(s.global('out')).toEqual(['start', 1, 4, 'end', 1, 4, 'start', 1, 6, 'end', 1, 6, 'start', 1, 8, 'end', 1, 8])
  })

  // In-world: llMinEventDelay(1.0) with a 0.1 s timer running; clicks at about 2.2 s and 4.7 s
  // gave touch_start at 3.044 and 5.044, on the timer's one-second beat, and 6 timer events in
  // about 7 s instead of 7.
  it('shares one delay between timer and touch events', async () => {
    const s = await run(
      `state_entry() { llMinEventDelay(1.0); llResetTime(); llSetTimerEvent(0.1); }
       timer() { ++ticks; }
       touch_start(integer n) { out += [llGetTime()]; }`,
      'integer ticks;',
    )
    s.advanceTime(2200)
    s.linkset.touch(0)
    s.advanceTime(2500)
    s.linkset.touch(0)
    s.advanceTime(2300)
    expect(s.global('out')).toEqual([3, 5])
    expect(s.global('ticks')).toBe(5)
  })

  // In-world: llMinEventDelay(3.0) called after the last timer event, then three clicks within
  // 0.4 s -> one touch_start, at 3.000052 after the call.
  it('starts a new delay when called', async () => {
    const s = await run(
      `state_entry() { llResetTime(); llMinEventDelay(3.0); }
       touch_start(integer n) { out += [n, llGetTime()]; }`,
    )
    s.linkset.touch(0)
    s.advanceTime(200)
    s.linkset.touch(0)
    s.advanceTime(200)
    s.linkset.touch(0)
    s.advanceTime(9000)
    expect(s.global('out')).toEqual([1, 3])
  })

  // In-world: llMinEventDelay(1.0), then `state other` -> a 0.1 s timer gave 4 ticks in 4 s;
  // after llResetScript it gave 40 ticks in 4 s.
  it('holds an event fired from a test until the delay has passed', async () => {
    const s = await run('state_entry() { llMinEventDelay(1.0); llResetTime(); } timer() { out += [llGetTime()]; }')
    s.fire('timer')
    expect(s.global('out')).toEqual([])
    s.advanceTime(1000)
    expect(s.global('out')).toEqual([1])
  })

  it('survives a state change', async () => {
    const s = await loadScript({
      source: `list out;
        default { state_entry() { llMinEventDelay(1.0); state other; } }
        state other {
          state_entry() { llResetTime(); llSetTimerEvent(0.1); }
          timer() { out += [llGetTime()]; if (llGetListLength(out) == 3) llSetTimerEvent(0); }
        }`,
    })
    s.start()
    s.advanceTime(5000)
    expect(s.global('out')).toEqual([1, 2, 3])
  })

  it('is cleared by a reset', async () => {
    const s = await run(
      `state_entry() {
         if (llLinksetDataRead("reset") == "") { llLinksetDataWrite("reset", "1"); llMinEventDelay(1.0); llResetScript(); }
         llResetTime(); llSetTimerEvent(0.1);
       }
       timer() { out += [llGetTime()]; if (llGetListLength(out) == 3) llSetTimerEvent(0); }`,
    )
    s.advanceTime(1000)
    expect((s.global('out') as number[]).map((t) => Math.round(t * 1000) / 1000)).toEqual([0.1, 0.2, 0.3])
  })
})
