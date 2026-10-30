import { describe, it, expect } from 'vitest'
import { DEBUG_CHANNEL, World, loadLinkset } from '../src/index.js'
import type { Script } from '../src/index.js'

const SAY = 'say(string s) { llOwnerSay(s); }\n'

async function pair(a: [string, string], b: [string, string], bLeadMs = 0) {
  const log: string[] = []
  const { scripts, linkset } = await loadLinkset({
    prims: [
      {
        scripts: [a, b].map(([name, source]) => ({ source: { source: SAY + source, filename: `${name}.lsl` }, name, memoryLimit: true })),
      },
    ],
  })
  for (const s of Object.values(scripts)) {
    s.mock('llOwnerSay', (ctx, args) => {
      log.push(`${Math.round(ctx.state.clock.now)} ${args[0] as string}`)
      return undefined
    })
  }
  scripts[b[0]]!.start()
  linkset.advanceTime(bLeadMs)
  scripts[a[0]]!.start()
  return { log, scripts: scripts as Record<string, Script>, linkset }
}

describe('scripts run while another script sleeps', () => {
  it('overlapping sleeps interleave in time order', async () => {
    const { log, linkset } = await pair(
      [
        'o_a',
        `default { state_entry() { llSetTimerEvent(3.0); }
          link_message(integer s, integer n, string m, key id) { say("A lm " + m); }
          timer() { llSetTimerEvent(0); say("A start sleep 3"); llSleep(3.0); say("A end sleep"); llMessageLinked(LINK_THIS, 0, "from A", ""); } }`,
      ],
      [
        'o_b',
        `default { state_entry() { llSetTimerEvent(3.5); }
          link_message(integer s, integer n, string m, key id) { say("B lm " + m); }
          timer() { llSetTimerEvent(0); say("B start sleep 0.5"); llSleep(0.5); say("B end sleep"); llMessageLinked(LINK_THIS, 0, "from B", ""); } }`,
      ],
    )
    linkset.advanceTime(10_000)
    // In-world (/tmp/lvprobe6/o_a.iw): 05.69 A start sleep 3, 06.12 B start sleep 0.5, 06.67 B end sleep,
    // 06.69 B lm from B, 08.74 A end sleep, 08.74 B lm from A, 08.76 A lm from B, 08.78 A lm from A.
    expect(log).toEqual([
      '3000 A start sleep 3',
      '3500 B start sleep 0.5',
      '4000 B end sleep',
      '4000 B lm from B',
      '6000 A end sleep',
      '6000 B lm from A',
      '6000 A lm from B',
      '6000 A lm from A',
    ])
  })

  it('builtin delays let other scripts run', async () => {
    const { log, linkset } = await pair(
      [
        'd_a',
        `integer i;
        default { state_entry() { llSetTimerEvent(5.0); }
          timer() { llSetTimerEvent(0); say("A delays start"); for (i = 0; i < 8; ++i) llSetPrimitiveParams([PRIM_GLOW, ALL_SIDES, 0.0]); say("A delays end"); } }`,
      ],
      [
        'd_b',
        `integer n;
        default { state_entry() { llSetTimerEvent(0.3); }
          timer() { if (++n <= 30) { if (n > 12) say("B tick " + (string)n); } else llSetTimerEvent(0); } }`,
      ],
    )
    linkset.advanceTime(8_000)
    // In-world (/tmp/lvprobe6/d_a.iw): 29.43 A delays start, B ticks 17..22 every 0.3 s, 31.16 A delays end,
    // then tick 23. The eight 0.2 s delays took 1.73 s in-world; here they take exactly 1.6 s, so tick 22 and
    // the end fall on the same instant.
    expect(log.slice(log.indexOf('4800 B tick 16'), log.indexOf('6900 B tick 23') + 1)).toEqual([
      '4800 B tick 16',
      '5000 A delays start',
      '5100 B tick 17',
      '5400 B tick 18',
      '5700 B tick 19',
      '6000 B tick 20',
      '6300 B tick 21',
      '6600 A delays end',
      '6600 B tick 22',
      '6900 B tick 23',
    ])
  })

  it('resetting a sleeping script aborts its handler; pausing it past its wake time continues it on resume', async () => {
    const { log, linkset } = await pair(
      [
        'r_a',
        `default { state_entry() { llSetTimerEvent(4.0); }
          timer() { llSetTimerEvent(0); say("A reset B"); llResetOtherScript("r_b"); llSleep(4.0); say("A pause B"); llSetScriptState("r_b", FALSE); llSleep(3.0); say("A resume B"); llSetScriptState("r_b", TRUE); } }`,
      ],
      [
        'r_b',
        `integer runs;
        default { state_entry() { runs++; say("B entry runs=" + (string)runs); llSetTimerEvent(3.0); }
          timer() { llSetTimerEvent(0); say("B before sleep 2"); llSleep(2.0); say("B after sleep 2, t=" + (string)llRound(llGetTime())); } }`,
      ],
    )
    linkset.advanceTime(15_000)
    // In-world (/tmp/lvprobe6/r_a.iw): 38.32 B entry runs=1, 41.38 B before sleep 2, 42.38 A reset B,
    // 42.47 B entry runs=1, 45.51 B before sleep 2, 46.45 A pause B, 49.49 A resume B, 49.51 B after sleep 2, t=7.
    expect(log).toEqual([
      '0 B entry runs=1',
      '3000 B before sleep 2',
      '4000 A reset B',
      '4000 B entry runs=1',
      '7000 B before sleep 2',
      '8000 A pause B',
      '11000 A resume B',
      '11000 B after sleep 2, t=7',
    ])
  })

  it('pausing and resuming a sleeping script before its wake time keeps the wake time', async () => {
    const { log, linkset } = await pair(
      [
        's_a',
        `default { state_entry() { llSetTimerEvent(4.0); }
          timer() { llSetTimerEvent(0); say("A pause B"); llSetScriptState("s_b", FALSE); llSleep(1.0); say("A resume B"); llSetScriptState("s_b", TRUE); } }`,
      ],
      [
        's_b',
        `default { state_entry() { llSetTimerEvent(3.0); }
          timer() { llSetTimerEvent(0); say("B before sleep 4"); llSleep(4.0); say("B after sleep 4"); } }`,
      ],
    )
    linkset.advanceTime(10_000)
    // In-world (/tmp/lvprobe6/s_a.iw): 47.36 B before sleep 4, 48.40 A pause B, 49.49 A resume B, 51.40 B after sleep 4.
    expect(log).toEqual(['3000 B before sleep 4', '4000 A pause B', '5000 A resume B', '7000 B after sleep 4'])
  })

  it('a script that pauses itself stops there until resumed', async () => {
    const { log, linkset } = await pair(
      [
        'p_a',
        `default { state_entry() { llSetTimerEvent(3.0); }
          timer() { llSetTimerEvent(0); say("A pause self"); llSetScriptState(llGetScriptName(), FALSE); say("A after pause"); llSleep(1.0); say("A after sleep"); } }`,
      ],
      [
        'p_b',
        `default { state_entry() { llSetTimerEvent(7.0); }
          timer() { llSetTimerEvent(0); say("B resume A"); llSetScriptState("p_a", TRUE); } }`,
      ],
    )
    linkset.advanceTime(10_000)
    // In-world (/tmp/lvprobe6/p_a.iw): 57.56 A pause self, 01.54 B resume A, 01.63 A after pause, 02.65 A after sleep.
    expect(log).toEqual(['3000 A pause self', '7000 B resume A', '7000 A after pause', '8000 A after sleep'])
  })

  it('a paused timer catches up while the pausing script sleeps on', async () => {
    const { log, linkset } = await pair(
      [
        'h_a',
        `default { state_entry() { llSetTimerEvent(4.0); }
          timer() {
            llSetTimerEvent(0);
            say("A pause"); llSetScriptState("h_b", FALSE); llMessageLinked(LINK_THIS, 1, "", ""); llSleep(5.0);
            say("A resume"); llSetScriptState("h_b", TRUE); llSleep(0.5);
            say("A half"); llSleep(2.5);
            say("A pause+reset"); llSetScriptState("h_b", FALSE); llResetOtherScript("h_b"); llSleep(3.0);
            say("A resume2"); llSetScriptState("h_b", TRUE); llSleep(3.0);
            say("A reset running"); llResetOtherScript("h_b"); llSleep(2.0);
            say("A done");
          } }`,
      ],
      [
        'h_b',
        `integer n; integer ticks;
        default { state_entry() { n++; say("B entry n=" + (string)n); llSetTimerEvent(1.0); }
          link_message(integer s, integer num, string m, key id) { say("B lm " + (string)num); }
          timer() { ticks++; if (ticks <= 3 || ticks % 5 == 0) say("B tick " + (string)ticks); } }`,
      ],
      100,
    )
    linkset.advanceTime(20_000)
    // In-world (/tmp/lvprobe/h.iw, B started about 0.1 s before A): 51.2 B entry n=1, 52.2/53.2/54.2 B tick 1-3,
    // 55.3 A pause, 00.4 A resume, 00.4 B tick 5, 00.9 A half, 03.4 A pause+reset, 06.5 A resume2, 07.5 B tick 10,
    // 09.5 A reset running, 09.6 B entry n=1, 10.6 B tick 1, 11.5 A done, 11.6 B tick 2, 12.6 B tick 3, 14.6 B tick 5.
    // B's tick at 03.4 came before A's wake at the same instant, so tick 10 follows resume2 by 1 s. In-world the
    // reset took 0.1 s, so B tick 2 followed A done; here the reset is instant and they tie, timer first.
    expect(log).toEqual([
      '0 B entry n=1',
      '1000 B tick 1',
      '2000 B tick 2',
      '3000 B tick 3',
      '4100 A pause',
      '9100 A resume',
      '9100 B tick 5',
      '9600 A half',
      '12100 A pause+reset',
      '15100 A resume2',
      '16100 B tick 10',
      '18100 A reset running',
      '18100 B entry n=1',
      '19100 B tick 1',
      '20100 B tick 2',
      '20100 A done',
    ])
  })

  it('removing a sleeping script stops it', async () => {
    const { log, linkset } = await pair(
      ['x_b', `default { state_entry() { llSleep(2.0); say("B after sleep"); } }`],
      ['x_a', `default { state_entry() { llSetTimerEvent(1.0); } timer() { llSetTimerEvent(0); llRemoveInventory("x_b"); } }`],
    )
    linkset.advanceTime(5_000)
    expect(log).toEqual([])
  })

  it('llDie stops a sleeping script', async () => {
    const { log, linkset } = await pair(
      ['x_b', `default { state_entry() { llSleep(2.0); say("B after sleep"); } }`],
      ['x_a', `default { state_entry() { llSetTimerEvent(1.0); } timer() { llDie(); } }`],
    )
    linkset.advanceTime(5_000)
    expect(log).toEqual([])
  })
})

describe('after a script wakes', () => {
  it('a sleeper in one linkset interleaves with a timer in another linkset of the world', async () => {
    const world = new World()
    world.addRegion('R', { x: 0, y: 0 })
    const log: string[] = []
    const load = async (source: string) => {
      const { scripts } = await loadLinkset({ world, region: 'R', prims: [{ scripts: [{ source: { source: SAY + source } }] }] })
      const s = Object.values(scripts)[0]!
      s.mock('llOwnerSay', (ctx, args) => {
        log.push(`${Math.round(ctx.state.clock.now)} ${args[0] as string}`)
        return undefined
      })
      return s
    }
    const ticker = await load(`default { state_entry() { llSetTimerEvent(1.0); } timer() { say("tick"); } }`)
    const sleeper = await load(`default { touch_start(integer n) { say("sleep"); llSleep(2.5); say("woke"); } }`)
    ticker.start()
    sleeper.fire('touch_start', { num_detected: 1 })
    expect(log).toEqual(['0 sleep', '1000 tick', '2000 tick', '2500 woke'])
  })

  it('llDie or a self-removal in state_exit after a sleep halts the chain', async () => {
    for (const end of ['llDie(); llOwnerSay("exit"); say("after");', 'llRemoveInventory(llGetScriptName()); say("after");']) {
      const { log, scripts } = await pair(
        ['e_a', `default { touch_start(integer n) { state two; } state_exit() { llSleep(1.0); ${end} } } state two { state_entry() { say("two"); } }`],
        ['e_b', `default { state_entry() { } }`],
      )
      scripts['e_a']!.fire('touch_start', { num_detected: 1 })
      expect(log.filter((l) => l.endsWith('after') || l.endsWith('two'))).toEqual([])
    }
  })

  it('a state change, a reset and a run-time error all work after a sleep', async () => {
    const { log, scripts } = await pair(
      [
        'w_a',
        `integer n;
        default { state_entry() { say("entry " + (string)(++n)); }
          touch_start(integer t) { llSleep(1.0); state other; } }
        state other { state_entry() { say("other"); }
          link_message(integer s, integer num, string m, key id) { llSleep(1.0); llResetScript(); }
          touch_start(integer t) { string s = "x"; llSleep(1.0); while (TRUE) s += s; } }`,
      ],
      ['w_b', `default { state_entry() { } }`],
    )
    const s = scripts['w_a']!
    s.fire('touch_start', { num_detected: 1 })
    expect(s.currentState).toBe('other')
    expect(() => s.fire('touch_start', { num_detected: 1 })).toThrow('Stack-Heap Collision')
    expect(log).toEqual(['0 entry 1', '1000 other'])
    expect(s.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text)[0]).toBe('Script run-time error')
    expect(s.running).toBe(false)
    s.running = true
    s.fire('link_message', { num: 0, str: '', id: '' })
    expect(s.now).toBe(3000)
    expect(s.currentState).toBe('default')
    expect(log.at(-1)).toBe('3000 entry 1')
  })
})

describe('driving a sleeping script from a test', () => {
  const sleeper = `integer step;
    default { touch_start(integer n) { step = 1; llSleep(5.0); step = 2; say("woke"); } }`
  const ticker = `default { state_entry() { llSetTimerEvent(1.0); } timer() { say("tick"); } }`

  it('fire() returns once its handler has finished, with other scripts running meanwhile', async () => {
    const { log, scripts } = await pair(['sleeper', sleeper], ['ticker', ticker])
    scripts['sleeper']!.fire('touch_start', { num_detected: 1 })
    expect(scripts['sleeper']!.global('step')).toBe(2)
    expect(scripts['sleeper']!.now).toBe(5000)
    expect(log).toEqual(['1000 tick', '2000 tick', '3000 tick', '4000 tick', '5000 tick', '5000 woke'])
  })

  it('advanceTime stops at its horizon and leaves a sleeping handler suspended', async () => {
    const { log, scripts } = await pair(['sleeper', sleeper], ['ticker', ticker])
    const s = scripts['sleeper']!
    s.linkset.clock.schedule(s, 0, 'touch_start', { num_detected: 1 })
    s.advanceTime(2_000)
    expect(s.now).toBe(2000)
    expect(s.global('step')).toBe(1)
    expect(log).toEqual(['1000 tick', '2000 tick'])
    s.advanceTime(4_000)
    expect(s.global('step')).toBe(2)
    expect(log).toEqual(['1000 tick', '2000 tick', '3000 tick', '4000 tick', '5000 tick', '5000 woke', '6000 tick'])
  })

  it('an event fired at a sleeping script runs after its handler', async () => {
    const { log, scripts } = await pair(['sleeper', sleeper], ['ticker', ticker])
    const s = scripts['sleeper']!
    s.linkset.clock.schedule(s, 0, 'touch_start', { num_detected: 1 })
    s.advanceTime(1_000)
    s.fire('touch_start', { num_detected: 1 })
    expect(s.now).toBe(10000)
    expect(log.filter((l) => l.endsWith('woke'))).toEqual(['5000 woke', '10000 woke'])
  })

  it('linkset.deliverChat returns once every listener it reached has finished', async () => {
    const listener = `default { state_entry() { llListen(5, "", NULL_KEY, ""); }
      listen(integer c, string n, key id, string m) { llSleep(2.0); say("heard " + m); } }`
    const { log, linkset } = await pair(['l_a', listener], ['ticker', ticker])
    linkset.deliverChat({ channel: 5, name: 'av', key: '', message: 'hi' })
    expect(linkset.clock.now).toBe(2000)
    expect(log).toEqual(['1000 tick', '2000 tick', '2000 heard hi'])
  })

  it('a reply only waits for scripts with a handler for it', async () => {
    const { scripts } = await pair(
      ['h_a', `default { state_entry() { llSetTimerEvent(1.0); } timer() { llSetTimerEvent(0); llSleep(30.0); } }`],
      ['h_b', `default { touch_start(integer n) { llHTTPRequest("https://example.com", [], ""); llRequestAgentData(llGetOwner(), DATA_ONLINE); llRequestPermissions(llGetOwner(), PERMISSION_TRIGGER_ANIMATION); llListen(5, "", NULL_KEY, ""); } }`],
    )
    const a = scripts['h_a']!
    const b = scripts['h_b']!
    b.fire('touch_start', { num_detected: 1 })
    a.advanceTime(1_500)
    expect(a.wakeAt).toBe(31000)
    const before = a.now
    b.respondToLastHttp({ status: 200, body: '' })
    b.respondToLastDataserver('1')
    b.grantPermissions()
    b.deliverChat({ channel: 5, name: 'av', key: '', message: 'hi' })
    b.fire('touch_end', { num_detected: 1 })
    a.fire('touch_end', { num_detected: 1 })
    b.linkset.deliverChat({ channel: 5, name: 'av', key: '', message: 'hi' })
    expect(a.now).toBe(before)
    expect(a.wakeAt).toBe(31000)
  })

  it('fire() waits for a state change whose state_entry sleeps', async () => {
    const { scripts } = await pair(
      ['c_a', `integer x; default { touch_start(integer n) { state two; } } state two { state_entry() { llSleep(1.0); x = 1; } }`],
      ['ticker', ticker],
    )
    const s = scripts['c_a']!
    s.fire('touch_start', { num_detected: 1 })
    expect(s.global('x')).toBe(1)
    expect(s.now).toBe(1000)
  })

  it('a reply waits for a state change whose state_entry has a builtin delay', async () => {
    const { scripts } = await pair(
      [
        'c_a',
        `integer x; default { touch_start(integer n) { llHTTPRequest("https://example.com", [], ""); }
          http_response(key k, integer st, list m, string b) { state two; } }
        state two { state_entry() { llSetPrimitiveParams([PRIM_GLOW, ALL_SIDES, 0.0]); x = 1; } }`,
      ],
      ['ticker', ticker],
    )
    const s = scripts['c_a']!
    s.fire('touch_start', { num_detected: 1 })
    s.respondToLastHttp({ status: 200, body: '' })
    expect(s.global('x')).toBe(1)
    expect(s.now).toBe(200)
  })

  it('fire() waits for llResetScript into a state_entry that sleeps', async () => {
    const { scripts } = await pair(
      [
        'c_a',
        `default { state_entry() { if (llLinksetDataRead("go") == "1") { llSleep(1.0); llLinksetDataWrite("x", "1"); } else state two; } }
        state two { touch_end(integer n) { llLinksetDataWrite("go", "1"); llResetScript(); } }`,
      ],
      ['ticker', ticker],
    )
    const s = scripts['c_a']!
    s.fire('touch_end', { num_detected: 1 })
    expect(s.linksetData.get('x')?.value).toBe('1')
    expect(s.now).toBe(1000)
  })

  it('deliverChat does not wait for a sleeper no listen matched', async () => {
    const listener = `default { state_entry() { llListen(5, "", NULL_KEY, ""); } listen(integer c, string n, key id, string m) { }
      touch_start(integer n) { llSleep(5.0); } }`
    const { scripts } = await pair(['l_a', listener], ['ticker', ticker])
    const s = scripts['l_a']!
    s.linkset.clock.schedule(s, 0, 'touch_start', { num_detected: 1 })
    s.advanceTime(1_000)
    s.deliverChat({ channel: 6, name: 'av', key: '', message: 'hi' })
    expect(s.now).toBe(1000)
    expect(s.wakeAt).toBe(5000)
  })

  it('reset() of a sleeping script abandons its handler', async () => {
    const { log, scripts } = await pair(['sleeper', sleeper], ['ticker', ticker])
    const s = scripts['sleeper']!
    s.linkset.clock.schedule(s, 0, 'touch_start', { num_detected: 1 })
    s.advanceTime(1_000)
    s.reset()
    s.advanceTime(10_000)
    expect(s.global('step')).toBe(0)
    expect(log).not.toContain('5000 woke')
  })
})
