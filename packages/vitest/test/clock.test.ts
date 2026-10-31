import { describe, it, expect } from 'vitest'
import { loadLinkset, loadScript } from '../src/index.js'

async function load(source: string) {
  return loadScript({ source })
}

describe('Phase 3 — virtual clock + timers', () => {
  it('llSetTimerEvent registers a recurring timer; advanceTime fires it', async () => {
    const s = await load(`
      integer ticks = 0;
      default {
        state_entry() {
          llSetTimerEvent(2);
        }
        timer() {
          ticks = ticks + 1;
        }
      }
    `)
    s.start()
    expect(s.global('ticks')).toBe(0)
    expect(s.timerInterval).toBe(2)

    s.advanceTime(2_000)
    expect(s.global('ticks')).toBe(1)

    s.advanceTime(6_500) // 6.5 more seconds → 3 more fires (at 4s, 6s, 8s; not 10s)
    expect(s.global('ticks')).toBe(4)
  })

  it('llSetTimerEvent(0) cancels the recurring timer', async () => {
    const s = await load(`
      integer ticks = 0;
      default {
        state_entry() { llSetTimerEvent(1); }
        timer() {
          ticks = ticks + 1;
          if (ticks == 2) llSetTimerEvent(0);
        }
      }
    `)
    s.start()
    s.advanceTime(10_000)
    expect(s.global('ticks')).toBe(2)
    expect(s.timerInterval).toBe(0)
  })

  it('llSleep advances the virtual clock synchronously', async () => {
    const s = await load(`
      float t = 0;
      default {
        state_entry() {
          llSleep(3.0);
          t = llGetTime();
        }
      }
    `)
    s.start()
    expect(s.now).toBe(3000)
    expect(s.global('t')).toBeCloseTo(3.0)
  })

  it('llGetTime is elapsed since script start by default', async () => {
    const s = await load(`
      float t = 0;
      default {
        timer() { t = llGetTime(); }
        state_entry() { llSetTimerEvent(5); }
      }
    `)
    s.start()
    s.advanceTime(5_000)
    expect(s.global('t')).toBeCloseTo(5.0)
  })

  it('llResetScript restarts llGetTime', async () => {
    const s = await load(`
      float t = -1;
      default {
        state_entry() { t = llGetTime(); }
        touch_start(integer n) { llResetScript(); }
      }
    `)
    s.start()
    s.advanceTime(5_000)
    s.fire('touch_start', { num_detected: 1 })
    expect(s.global('t')).toBe(0)
  })

  it('llResetTime sets the reference to now', async () => {
    const s = await load(`
      float t = 0;
      default {
        state_entry() { llSetTimerEvent(2); }
        timer() {
          llResetTime();
          llSetTimerEvent(0);
          llSleep(1.5);
          t = llGetTime();
        }
      }
    `)
    s.start()
    s.advanceTime(3_500) // fires timer at 2 s; resets ref; sleeps 1.5; reads time → 1.5
    expect(s.global('t')).toBeCloseTo(1.5)
  })

  it('events queued during llSleep fire after the handler returns', async () => {
    const s = await load(`
      integer order = 0;
      integer first = 0;
      integer second = 0;
      default {
        state_entry() {
          llSetTimerEvent(1);
          // While sleeping until t=2, the timer fires at t=1.
          // It must queue, not interrupt this handler.
          llSleep(2.0);
          order = order + 1;
          first = order;  // first should be 1 (this handler finishes first)
        }
        timer() {
          order = order + 1;
          second = order;  // second should be 2 (timer fires after)
          llSetTimerEvent(0);
        }
      }
    `)
    s.start()
    expect(s.global('first')).toBe(1)
    expect(s.global('second')).toBe(2)
    expect(s.now).toBe(2_000)
  })

  it('vm.advanceTime drains multiple scheduled fires in order', async () => {
    // Use a coarser interval to verify multiple fires in one advance.
    const s = await load(`
      integer count = 0;
      default {
        state_entry() { llSetTimerEvent(0.5); }
        timer() { count = count + 1; }
      }
    `)
    s.start()
    s.advanceTime(2_750) // expects 5 fires at 0.5, 1.0, 1.5, 2.0, 2.5
    expect(s.global('count')).toBe(5)
  })
})

describe('wall-clock time from the virtual clock', () => {
  const SOURCE = `
    integer unix;
    string stamp;
    string date;
    default {
      state_entry() { llSetTimerEvent(1); }
      timer() {
        unix = llGetUnixTime();
        stamp = llGetTimestamp();
        date = llGetDate();
      }
    }
  `

  it('starts at the Unix epoch by default', async () => {
    const s = await loadScript({
      source: `
        integer unix = -1;
        string stamp;
        string date;
        default {
          state_entry() {
            unix = llGetUnixTime();
            stamp = llGetTimestamp();
            date = llGetDate();
          }
        }
      `,
    })
    s.start()
    expect(s.global('unix')).toBe(0)
    expect(s.global('stamp')).toBe('1970-01-01T00:00:00.000000Z')
    expect(s.global('date')).toBe('1970-01-01')
  })

  it('reads startUnixTime plus the virtual time', async () => {
    const s = await loadScript({ source: SOURCE, startUnixTime: 1_700_000_000 })
    s.start()
    s.advanceTime(1_000)
    expect(s.global('unix')).toBe(1_700_000_001)
    expect(s.global('stamp')).toBe('2023-11-14T22:13:21.000000Z')
    expect(s.global('date')).toBe('2023-11-14')
  })

  it('moves with advanceTime across midnight', async () => {
    // 2024-02-29T23:59:59Z
    const s = await loadScript({ source: SOURCE, startUnixTime: 1_709_251_199 })
    s.start()
    s.advanceTime(1_000)
    expect(s.global('date')).toBe('2024-03-01')
    expect(s.global('stamp')).toBe('2024-03-01T00:00:00.000000Z')
  })

  it('llGetTimestamp keeps sub-second precision and llGetUnixTime truncates it', async () => {
    const s = await loadScript({
      source: `
        integer unix;
        string stamp;
        default {
          state_entry() {
            llSleep(1.25);
            unix = llGetUnixTime();
            stamp = llGetTimestamp();
          }
        }
      `,
      startUnixTime: 1_700_000_000.5,
    })
    s.start()
    expect(s.global('unix')).toBe(1_700_000_001)
    expect(s.global('stamp')).toBe('2023-11-14T22:13:21.750000Z')
  })

  it('llResetTime does not move wall-clock time', async () => {
    const s = await loadScript({
      source: `
        integer unix;
        default {
          state_entry() {
            llSleep(5);
            llResetTime();
            unix = llGetUnixTime();
          }
        }
      `,
      startUnixTime: 100,
    })
    s.start()
    expect(s.global('unix')).toBe(105)
  })

  it('llGetUnixTime wraps to a 32-bit integer after 2038', async () => {
    const s = await loadScript({
      source: `integer unix; default { state_entry() { unix = llGetUnixTime(); } }`,
      startUnixTime: 2_147_483_648,
    })
    s.start()
    expect(s.global('unix')).toBe(-2_147_483_648)
  })

  it('loadLinkset passes startUnixTime to every script', async () => {
    const { scripts } = await loadLinkset({
      startUnixTime: 1_700_000_000,
      prims: [
        {
          name: 'P1',
          scripts: [
            {
              source: { source: `integer unix; default { state_entry() { unix = llGetUnixTime(); } }` },
              name: 'clock',
            },
          ],
        },
      ],
    })
    scripts['clock']!.start()
    expect(scripts['clock']!.global('unix')).toBe(1_700_000_000)
  })
})

describe('clock reads', () => {
  const SOURCE = `
    float gmt;
    float wall;
    float tod;
    default {
      state_entry() {
        gmt = llGetGMTclock();
        wall = llGetWallclock();
        tod = llGetTimeOfDay();
      }
    }
  `

  async function readAt(startUnixTime: number) {
    const s = await loadScript({ source: SOURCE, startUnixTime })
    s.start()
    return { gmt: s.global('gmt'), wall: s.global('wall'), tod: s.global('tod') }
  }

  // In-world: llGetTimestamp 2026-10-31T06:54:54.506190Z -> llGetUnixTime 1793429694,
  // llGetGMTclock 24894.000000 (SLua Tideland, Aditi).
  it('llGetGMTclock reads whole seconds since UTC midnight', async () => {
    expect((await readAt(1_793_429_694.50619)).gmt).toBe(24_894)
  })

  // In-world: same sample -> llGetWallclock 86094.000000, 23:54:54 on the previous
  // Pacific day, seven hours behind UTC while daylight time is on.
  it('llGetWallclock reads whole seconds since Pacific midnight in daylight time', async () => {
    expect((await readAt(1_793_429_694.50619)).wall).toBe(86_094)
  })

  // Not measured: the probe ran on 2026-10-31, before daylight time ended on
  // 2026-11-01, so only the UTC-7 offset could be observed. This follows the
  // US Pacific zone, which Second Life time is defined as.
  it('llGetWallclock reads Pacific standard time in winter', async () => {
    // 2026-11-15T12:00:00Z is 04:00 PST.
    expect((await readAt(1_794_744_000)).wall).toBe(14_400)
  })

  it('llGetWallclock wraps at Pacific midnight', async () => {
    // 2026-10-31T07:00:00Z is 00:00 PDT.
    expect((await readAt(1_793_430_000)).wall).toBe(0)
  })

  // In-world: llGetTimeOfDay sampled beside llGetTimestamp 06:56:35.869952Z read
  // 10595 + 0.870117, llGetUnixTime mod 14400 to float precision. llGetDayLength
  // was 14400, the default four-hour day.
  it('llGetTimeOfDay reads seconds into the four-hour day with sub-second precision', async () => {
    expect((await readAt(1_793_429_795.869952)).tod).toBe(Math.fround(10_595.869952))
  })

  it('every clock read moves with the virtual clock', async () => {
    const s = await loadScript({
      source: `
        float gmt;
        float wall;
        float tod;
        default {
          state_entry() { llSetTimerEvent(1.5); }
          timer() {
            gmt = llGetGMTclock();
            wall = llGetWallclock();
            tod = llGetTimeOfDay();
          }
        }
      `,
      startUnixTime: 14_400 * 2 + 10,
    })
    s.start()
    s.advanceTime(1_500)
    expect(s.global('gmt')).toBe(28_811)
    expect(s.global('wall')).toBe(11)
    expect(s.global('tod')).toBe(11.5)
  })
})

describe('timer after a long handler', () => {
  // In-world: llSleep(5) with a 1 s timer, then ticks at ~0.04, 1.07, 2.05, 3.05 s after the sleep.
  it('delivers one pending timer event after llSleep, not a burst', async () => {
    const s = await load(`
      integer ticks = 0;
      default {
        state_entry() {
          llSetTimerEvent(1);
          llSleep(5);
        }
        timer() { ticks = ticks + 1; }
      }
    `)
    s.start()
    expect(s.global('ticks')).toBe(1)
    s.advanceTime(999)
    expect(s.global('ticks')).toBe(1)
    s.advanceTime(1)
    expect(s.global('ticks')).toBe(2)
    s.advanceTime(1000)
    expect(s.global('ticks')).toBe(3)
  })
})

describe('one long advanceTime', () => {
  // Measured in Second Life: with one advance covering the whole run, the timer
  // still sees its own fire time, 64 of 100 self-sent link messages arrive, and
  // the ticks after llSleep(5) stay 1 s apart.
  it('runs each handler at its own fire time', async () => {
    const s = await load(`
      integer phase; integer count; float t0; string log; integer ticks;
      default {
        state_entry() { llSetTimerEvent(1.0); }
        link_message(integer sender, integer n, string str, key id) { count++; }
        timer() {
          if (phase == 0) {
            phase = 1;
            log = (string)llGetTime();
            integer i;
            for (i = 0; i < 100; i++) llMessageLinked(LINK_THIS, 0, "q", "");
          } else if (phase == 1) {
            phase = 2;
            llSleep(5.0);
            t0 = llGetTime();
          } else {
            ticks++;
            log += "," + (string)llRound(llGetTime() - t0);
            if (ticks == 3) llSetTimerEvent(0);
          }
        }
      }
    `)
    s.start()
    s.advanceTime(15_000)
    expect(s.global('count')).toBe(64)
    expect(s.global('log')).toBe('1.000000,0,1,2')
  })
})

describe('timer after a handler that started late', () => {
  it('delivers one pending tick, not a burst', async () => {
    const s = await load(`
      string log;
      default {
        state_entry() {
          llSetTimerEvent(1.0);
          llMessageLinked(LINK_THIS, 0, "", "");
          llMessageLinked(LINK_THIS, 0, "", "");
        }
        link_message(integer sender, integer n, string str, key id) { llSleep(3.0); }
        timer() {
          log += (string)llRound(llGetTime()) + ",";
          if (llGetTime() > 7.5) llSetTimerEvent(0);
        }
      }
    `)
    s.start()
    s.advanceTime(10_000)
    expect(s.global('log')).toBe('6,7,8,')
  })
})
