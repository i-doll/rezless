import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

async function run(source: string) {
  const s = await loadScript({ source })
  s.start()
  return s
}

describe('Phase 3 — hash builtins', () => {
  it('llMD5String matches OpenSSL md5sum, with the LSL nonce convention', async () => {
    // LSL: llMD5String("hello", 0) digests the string "hello:0".
    // `echo -n 'hello:0' | md5sum` → 31d46731a4422c15db9cbee93491ca47
    const s = await run(`
      string out = "";
      default { state_entry() { out = llMD5String("hello", 0); } }
    `)
    expect(s.global('out')).toBe('31d46731a4422c15db9cbee93491ca47')
  })

  it('llSHA1String matches the standard sha1sum', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() { out = llSHA1String("hello"); } }
    `)
    // echo -n 'hello' | sha1sum
    expect(s.global('out')).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d')
  })

  it('llSHA256String matches sha256sum', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() { out = llSHA256String("hello"); } }
    `)
    // echo -n 'hello' | sha256sum
    expect(s.global('out')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )
  })

  it('llHMAC returns Base64-encoded digest, not hex (per the LSL definitions)', async () => {
    const s = await run(`
      string out = "";
      default { state_entry() { out = llHMAC("secret", "hello", "sha256"); } }
    `)
    // echo -n 'hello' | openssl dgst -sha256 -hmac 'secret' -binary | base64
    expect(s.global('out')).toBe('iKqz7ejTrflNJquQ07r9SiCDBww7zOnAFO4EpEOEfAs=')
  })
})

describe('Phase 3 — base64 builtins', () => {
  it('llStringToBase64 / llBase64ToString roundtrip', async () => {
    const s = await run(`
      string a = "";
      string b = "";
      default {
        state_entry() {
          a = llStringToBase64("hello");
          b = llBase64ToString(a);
        }
      }
    `)
    expect(s.global('a')).toBe('aGVsbG8=')
    expect(s.global('b')).toBe('hello')
  })

  it('llIntegerToBase64 / llBase64ToInteger roundtrip', async () => {
    const s = await run(`
      string a = "";
      integer b = 0;
      default {
        state_entry() {
          a = llIntegerToBase64(0x12345678);
          b = llBase64ToInteger(a);
        }
      }
    `)
    expect(s.global('a')).toBe('EjRWeA==')
    expect(s.global('b')).toBe(0x12345678)
  })

  it('llBase64ToInteger of short input returns 0', async () => {
    const s = await run(`
      integer x = -1;
      default { state_entry() { x = llBase64ToInteger("AA=="); } }
    `)
    expect(s.global('x')).toBe(0)
  })

  // Every case was checked in Second Life.
  it.each([
    ['AAAA', 'AQID', 'AQID'],
    ['AAAAAAAA', 'AQID', 'AQIDAQID'],
    ['AAAA', 'AQIDBAUG', 'AQID'],
    ['AQID', '', 'AQID'],
    ['', 'AQID', ''],
    ['AAAAAAAA', 'AQIDB', 'AQIDAQID'],
    ['AAAAAAAA', 'AQID=', 'AQIDAQID'],
    ['AAAAAAAA', 'AQ ID', 'AQEBAQEB'],
    ['AAAAAAAA', 'my secret!', 'm5ubm5ub'],
    ['AAAAAAAA', '-_-_', 'AAAAAAAA'],
    ['AAAAAAAA', '+/+/', '+/+/+/+/'],
    ['AAAAA', 'AQID', 'AQID'],
    ['AA AA', 'AQID', 'AQ=='],
    ['AQ==', 'AQID', 'AA=='],
    [
      'bGVmdF9iZWx0wqRyaWdodF9iZWx0LC0xMDAsMCwxNzAwMDAwMDAw',
      'yourSecretKey123',
      'pu7NPbhJH77qCfnFo+zDPbhJH77q53CG+ruHecsaTeKu+22H+rub',
    ],
    [
      'bGVmdF9iZWx0wqRyaWdodF9iZWx0LC0xMDAsMCwxNzAwMDAwMDAw',
      'changeThis3421',
      'HnPB9buD76GMGdZkzuaMldWvnbcGOoqw1NGm/dTqRSaXsdTRuv3I',
    ],
  ])('llXorBase64(%j, %j) is %j', async (a, b, expected) => {
    const s = await run(`
      string out = "unset";
      default { state_entry() { out = llXorBase64("${a}", "${b}"); } }
    `)
    expect(s.global('out')).toBe(expected)
  })
})

describe('Phase 3 — object lifecycle and appearance', () => {
  it('llSetText updates Script.text', async () => {
    const s = await run(`
      default {
        state_entry() {
          llSetText("Hello above prim", <1, 0, 0>, 1.0);
        }
      }
    `)
    expect(s.text).toEqual({
      text: 'Hello above prim',
      color: { x: 1, y: 0, z: 0 },
      alpha: 1,
    })
  })

  it('llSetObjectDesc / llGetObjectDesc roundtrip', async () => {
    const s = await run(`
      string back = "";
      default {
        state_entry() {
          llSetObjectDesc("pinned");
          back = llGetObjectDesc();
        }
      }
    `)
    expect(s.global('back')).toBe('pinned')
    expect(s.objectDesc).toBe('pinned')
  })

  it('llDie marks the script dead and ignores subsequent fire()', async () => {
    const s = await run(`
      integer touched = 0;
      default {
        state_entry() {
          llDie();
        }
        touch_start(integer n) { touched = 1; }
      }
    `)
    expect(s.dead).toBe(true)
    s.fire('touch_start', { num_detected: 1 })
    expect(s.global('touched')).toBe(0)
  })

  describe('after llDie the script halts at its next builtin return or loop iteration', () => {
    const die = async (body: string) => {
      const s = await run(`default { state_entry() { llSetTimerEvent(3.0); } timer() { llSetTimerEvent(0); ${body} } }`)
      s.advanceTime(3_000)
      return s
    }
    const heard = (s: { chat: ReadonlyArray<{ text: string }> }) => s.chat.map((c) => c.text)

    it('runs one more builtin call, then halts', async () => {
      // In-world: die.iw (two runs) heard "before die", "after die" only; no "after die region", "after loop" or "after sleep".
      const s = await die(`llSay(7777, "before die"); llDie(); llSay(7777, "after die"); llRegionSay(7777, "after die region");
        integer i; for (i = 0; i < 1000; ++i) ; llSay(7777, "after loop"); llSleep(0.1); llSay(7777, "after sleep");`)
      expect(heard(s)).toEqual(['before die', 'after die'])
    })

    it('halts after the second llSay', async () => {
      // In-world: die2.iw (two runs) v1 heard "v1 before", "v1 s1"; not "v1 s2".
      const s = await die(`llSay(7777, "v1 before"); llDie(); llSay(7777, "v1 s1"); llSay(7777, "v1 s2");`)
      expect(heard(s)).toEqual(['v1 before', 'v1 s1'])
    })

    it('halts after an llRegionSay', async () => {
      // In-world: die2.iw (two runs) v2 heard "v2 before", "v2 r1"; not "v2 s1".
      const s = await die(`llSay(7777, "v2 before"); llDie(); llRegionSay(7777, "v2 r1"); llSay(7777, "v2 s1");`)
      expect(heard(s)).toEqual(['v2 before', 'v2 r1'])
    })

    it('halts after a builtin that says nothing', async () => {
      // In-world: die2.iw (two runs) v3 heard only "v3 before"; llSetText ran and "v3 s1" did not.
      const s = await die(`llSay(7777, "v3 before"); llDie(); llSetText("x", <1,1,1>, 1.0); llSay(7777, "v3 s1"); llSay(7777, "v3 s2");`)
      expect(heard(s)).toEqual(['v3 before'])
      expect(s.text?.text).toBe('x')
    })

    it('halts at a for loop iteration before any builtin', async () => {
      // In-world: die2.iw (two runs) v4 heard only "v4 before".
      const s = await die(`llSay(7777, "v4 before"); llDie(); integer i; for (i = 0; i < 1000; ++i) ; llSay(7777, "v4 s1"); llSay(7777, "v4 s2");`)
      expect(heard(s)).toEqual(['v4 before'])
    })

    it('halts at a while or do-while iteration too', async () => {
      const w = await die(`llDie(); integer i; while (i < 2) { i++; } llSay(7777, "after while");`)
      expect(heard(w)).toEqual([])
      const d = await die(`llDie(); integer i; do { i++; } while (i < 2); llSay(7777, "after do");`)
      expect(heard(d)).toEqual([])
    })

    it('halts in state_exit too', async () => {
      const s = await run(`default { state_entry() { state other; } state_exit() { llDie(); llOwnerSay("exit"); llOwnerSay("after"); } }
        state other { state_entry() { llOwnerSay("other"); } }`)
      expect(heard(s)).toEqual(['exit'])
    })

    it('halts at a backward jump', async () => {
      // In-world: die3.iw (two runs) v5, a 1000-pass jump loop, heard only "v5 before".
      const s = await die(`llSay(7777, "v5 before"); llDie(); integer i; @top; if (++i < 1000) jump top; llSay(7777, "v5 s1");`)
      expect(heard(s)).toEqual(['v5 before'])
      // In-world: die3.iw (two runs) v9, a single backward jump, heard only "v9 before".
      const one = await die(`llSay(7777, "v9 before"); llDie(); integer i; @top2; if (++i < 2) jump top2; llSay(7777, "v9 s1");`)
      expect(heard(one)).toEqual(['v9 before'])
    })

    it('halts at the first iteration of a short loop', async () => {
      // In-world: die3.iw (two runs) v6 heard only "v6 before".
      const f = await die(`llSay(7777, "v6 before"); llDie(); integer i; for (i = 0; i < 2; ++i) ; llSay(7777, "v6 s1");`)
      expect(heard(f)).toEqual(['v6 before'])
      // In-world: die3.iw (two runs) v8 heard only "v8 before".
      const w = await die(`llSay(7777, "v8 before"); llDie(); integer i; while (i < 2) ++i; llSay(7777, "v8 s1");`)
      expect(heard(w)).toEqual(['v8 before'])
    })

    it('a loop that never iterates does not halt', async () => {
      // In-world: die3.iw (two runs) v7 heard "v7 before", "v7 s1".
      const s = await die(`llSay(7777, "v7 before"); llDie(); integer i; for (i = 0; i < 0; ++i) ; llSay(7777, "v7 s1"); llSay(7777, "v7 s2");`)
      expect(heard(s)).toEqual(['v7 before', 'v7 s1'])
    })

    it('llResetScript does not revive it', async () => {
      // In-world: dieR.iw (two runs) heard "entry n=1", "before die"; no second state_entry, and the object was gone.
      const s = await run(`integer n;
        default { state_entry() { n++; llSay(7777, "entry n=" + (string)n); if (n == 1) llSetTimerEvent(3.0); }
          timer() { llSetTimerEvent(0); llSay(7777, "before die"); llDie(); llResetScript(); } }`)
      s.advanceTime(3_000)
      expect(heard(s)).toEqual(['entry n=1', 'before die'])
      expect(s.dead).toBe(true)
    })
  })

  it('llDie inside a queue-dispatched handler stops further drains', async () => {
    // A timer that calls llDie on its 2nd fire — without the dead-check
    // in drainQueue, advanceTime(2_500) would still fire ticks 3, 4, 5.
    const s = await run(`
      integer ticks = 0;
      default {
        state_entry() { llSetTimerEvent(0.5); }
        timer() {
          ticks = ticks + 1;
          if (ticks == 2) llDie();
        }
      }
    `)
    s.advanceTime(2_500)
    expect(s.global('ticks')).toBe(2)
    expect(s.dead).toBe(true)
  })

  it('llResetScript restores globals to their initializers and reruns state_entry', async () => {
    const s = await run(`
      integer counter = 5;
      integer entries = 0;
      default {
        state_entry() {
          entries = entries + 1;
          counter = counter + 100;
        }
        touch_start(integer n) {
          llResetScript();
        }
      }
    `)
    // After start: entries = 1, counter = 105
    expect(s.global('counter')).toBe(105)
    expect(s.global('entries')).toBe(1)
    s.fire('touch_start', { num_detected: 1 })
    // llResetScript reseeds counter back to 5, then state_entry runs again:
    //   entries = entries(0) + 1 = 1, counter = 5 + 100 = 105
    expect(s.global('counter')).toBe(105)
    expect(s.global('entries')).toBe(1)
  })
})

describe('in-world parity — base64', () => {
  async function evalExpr(type: string, expr: string) {
    const s = await run(`${type} out; default { state_entry() { out = ${expr}; } }`)
    return s.global('out')
  }

  // In-world values for llBase64ToInteger.
  it.each([
    ['AAAB', 256],
    ['AQ', 16777216],
    ['AAAAAQ==', 1],
    ['AAAAAQ', 1],
    ['/////w', -1],
    ['', 0],
    ['AAAAAQAAAAI=', 0],
  ])('llBase64ToInteger(%j) is %d', async (input, want) => {
    expect(await evalExpr('integer', `llBase64ToInteger("${input}")`)).toBe(want)
  })

  // In-world: same result as llXorBase64 for this input.
  it('llXorBase64StringsCorrect', async () => {
    expect(await evalExpr('string', 'llXorBase64StringsCorrect("AQIDBA==", "Bwc=")')).toBe('BgUEAw==')
  })
})
