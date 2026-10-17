import { describe, it, expect } from 'vitest'
import { loadScript, loadLinkset } from '../src/index.js'

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
    s.advanceTime(2_000) // fires timer; resets ref; sleeps 1.5; reads time → 1.5
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
  const source = `
    integer unix;
    string stamp;
    string date;
    default {
      state_entry() { unix = llGetUnixTime(); stamp = llGetTimestamp(); date = llGetDate(); }
      touch_start(integer n) { unix = llGetUnixTime(); stamp = llGetTimestamp(); date = llGetDate(); }
    }
  `

  it('starts at the Unix epoch by default', async () => {
    const s = await loadScript({ source })
    s.start()
    expect(s.global('unix')).toBe(0)
    expect(s.global('stamp')).toBe('1970-01-01T00:00:00.000000Z')
    expect(s.global('date')).toBe('1970-01-01')
  })

  it('reads the configured start time plus virtual time', async () => {
    // 2026-03-31T23:59:59Z
    const s = await loadScript({ source, startTime: 1_775_001_599 })
    s.start()
    expect(s.global('unix')).toBe(1_775_001_599)
    expect(s.global('stamp')).toBe('2026-03-31T23:59:59.000000Z')
    expect(s.global('date')).toBe('2026-03-31')

    s.advanceTime(1_250.5)
    s.fire('touch_start', { num_detected: 1 })
    expect(s.global('unix')).toBe(1_775_001_600)
    expect(s.global('stamp')).toBe('2026-04-01T00:00:00.250500Z')
    expect(s.global('date')).toBe('2026-04-01')
  })

  it('keeps fractional start times in the timestamp', async () => {
    const s = await loadScript({ source, startTime: 86_400.123456 })
    s.start()
    expect(s.global('unix')).toBe(86_400)
    expect(s.global('stamp')).toBe('1970-01-02T00:00:00.123456Z')
  })

  it('rejects a start time that is not a finite number', async () => {
    await expect(loadScript({ source, startTime: Number.NaN })).rejects.toThrow(/startTime/)
  })

  it('moves with llSleep', async () => {
    const s = await loadScript({
      source: `
        integer before;
        integer after;
        default { state_entry() { before = llGetUnixTime(); llSleep(90); after = llGetUnixTime(); } }
      `,
      startTime: 1_000,
    })
    s.start()
    expect(s.global('before')).toBe(1_000)
    expect(s.global('after')).toBe(1_090)
  })

  it('shares one start time across a linkset', async () => {
    const { scripts } = await loadLinkset({
      startTime: 1_000,
      prims: [{ scripts: [{ source: { source }, name: 'a' }] }, { scripts: [{ source: { source }, name: 'b' }] }],
    })
    scripts.a!.start()
    scripts.a!.advanceTime(5_000)
    scripts.b!.start()
    expect(scripts.a!.global('unix')).toBe(1_000)
    expect(scripts.b!.global('unix')).toBe(1_005)
  })
})
