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

  it('llHMAC returns Base64-encoded digest, not hex (kwdb spec)', async () => {
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
