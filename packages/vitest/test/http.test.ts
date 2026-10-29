import { describe, it, expect } from 'vitest'
import { loadLinkset, loadScript } from '../src/index.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const NULL_KEY = '00000000-0000-0000-0000-000000000000'
const DEBUG_CHANNEL = 2147483647

async function load(source: string) {
  return loadScript({ source })
}

describe('Phase 3 — HTTP requests and responses', () => {
  it('captures llHTTPRequest into s.httpRequests with deterministic keys', async () => {
    const s = await load(`
      key req = "";
      default {
        state_entry() {
          req = llHTTPRequest("https://example.test/api", [], "");
        }
      }
    `)
    s.start()
    expect(s.httpRequests).toHaveLength(1)
    const r = s.httpRequests[0]!
    expect(r.url).toBe('https://example.test/api')
    expect(r.method).toBe('GET')
    expect(r.body).toBe('')
    expect(s.global('req')).toBe(r.key)
    expect(r.key).toMatch(UUID)
    expect(r.key).not.toBe('00000000-0000-0000-0000-000000000000')
  })

  it('parses HTTP_METHOD, HTTP_MIMETYPE, and HTTP_CUSTOM_HEADER from options', async () => {
    const s = await load(`
      default {
        state_entry() {
          llHTTPRequest(
            "https://example.test/post",
            [
              HTTP_METHOD, "POST",
              HTTP_MIMETYPE, "application/json",
              HTTP_CUSTOM_HEADER, "X-Caller", "logical-firefly"
            ],
            "{\\"hello\\":\\"world\\"}"
          );
        }
      }
    `)
    s.start()
    const r = s.httpRequests[0]!
    expect(r.method).toBe('POST')
    expect(r.mimetype).toBe('application/json')
    expect(r.headers).toEqual([['X-Caller', 'logical-firefly']])
    expect(r.body).toBe('{"hello":"world"}')
  })

  it('respondToHttp delivers an http_response event with the right payload', async () => {
    const s = await load(`
      integer status = 0;
      string body = "";
      key got = "";
      default {
        state_entry() {
          llHTTPRequest("https://example.test/", [], "");
        }
        http_response(key request_id, integer s, list metadata, string b) {
          got = request_id;
          status = s;
          body = b;
        }
      }
    `)
    s.start()
    const reqKey = s.httpRequests[0]!.key
    s.respondToHttp(reqKey, { status: 200, body: 'pong' })
    expect(s.global('status')).toBe(200)
    expect(s.global('body')).toBe('pong')
    expect(s.global('got')).toBe(reqKey)
    expect(s.httpRequests[0]!.fulfilled).toBe(true)
  })

  it('respondToLastHttp targets the most recent request', async () => {
    const s = await load(`
      integer count = 0;
      default {
        state_entry() {
          llHTTPRequest("https://a.test/", [], "");
          llHTTPRequest("https://b.test/", [], "");
        }
        http_response(key request_id, integer s, list metadata, string b) {
          count = count + 1;
        }
      }
    `)
    s.start()
    s.respondToLastHttp({ status: 200, body: 'b' })
    expect(s.global('count')).toBe(1)
    // The first request is still unfulfilled.
    expect(s.httpRequests[0]!.fulfilled).toBe(false)
    expect(s.httpRequests[1]!.fulfilled).toBe(true)
  })

  it('respondToHttp with an unknown key throws', async () => {
    const s = await load(`default { state_entry() {} }`)
    s.start()
    expect(() => s.respondToHttp('99999999-9999-9999-9999-999999999999', { status: 200 })).toThrow(
      /unknown HTTP request key/,
    )
  })

  it('multiple requests share a counter and get unique keys', async () => {
    const s = await load(`
      default {
        state_entry() {
          llHTTPRequest("https://example.test/a", [], "");
          llHTTPRequest("https://example.test/b", [], "");
          llHTTPRequest("https://example.test/c", [], "");
        }
      }
    `)
    s.start()
    const keys = s.httpRequests.map((r) => r.key)
    expect(new Set(keys).size).toBe(3)
    for (const k of keys) expect(k).toMatch(UUID)
  })
})

describe('llHTTPRequest errors, throttle and truncation', () => {
  // In-world: "notaurl" returns NULL_KEY and shouts on DEBUG_CHANNEL.
  it('an invalid URL returns NULL_KEY and shouts an error', async () => {
    const s = await load(`
      key req = "x";
      default { state_entry() { req = llHTTPRequest("notaurl", [], ""); } }
    `)
    s.start()
    expect(s.global('req')).toBe(NULL_KEY)
    expect(s.httpRequests).toHaveLength(0)
    expect(s.chat).toEqual([
      { channel: DEBUG_CHANNEL, text: 'URL passed to llHTTPRequest is not valid', type: 'shout' },
    ])
  })

  it('HTTP_BODY_MAXLENGTH above 16384 returns NULL_KEY and shouts an error', async () => {
    const s = await load(`
      key req = "x";
      default {
        state_entry() {
          req = llHTTPRequest("https://example.test/", [HTTP_BODY_MAXLENGTH, 16385], "");
        }
      }
    `)
    s.start()
    expect(s.global('req')).toBe(NULL_KEY)
    expect(s.httpRequests).toHaveLength(0)
    expect(s.chat).toEqual([
      { channel: DEBUG_CHANNEL, text: 'HTTP_BODY_MAXLENGTH value is invalid', type: 'shout' },
    ])
  })

  // In-world: 25 requests per object per 20 s, then NULL_KEY and a shout.
  it('throttles after 25 requests in 20 seconds', async () => {
    const s = await load(`
      integer ok = 0;
      key last;
      default {
        touch_start(integer n) {
          integer i;
          for (i = 0; i < 26; i++) {
            last = llHTTPRequest("https://example.test/", [], "");
            if (last) ok = ok + 1;
          }
        }
      }
    `)
    s.fire('touch_start', { num_detected: 1 })
    expect(s.global('ok')).toBe(25)
    expect(s.global('last')).toBe(NULL_KEY)
    expect(s.chat).toEqual([
      { channel: DEBUG_CHANNEL, text: 'Too many HTTP requests too fast.', type: 'shout' },
    ])
    s.advanceTime(20_000)
    s.fire('touch_start', { num_detected: 1 })
    expect(s.global('ok')).toBe(50)
  })

  it('the throttle is shared by every script in the object', async () => {
    const src = `
      integer ok = 0;
      default {
        touch_start(integer n) {
          integer i;
          for (i = 0; i < 20; i++) if (llHTTPRequest("https://example.test/", [], "")) ok = ok + 1;
        }
      }
    `
    const { scripts } = await loadLinkset({
      prims: [
        {
          scripts: [
            { source: { source: src, filename: 'a.lsl' }, name: 'a' },
            { source: { source: src, filename: 'b.lsl' }, name: 'b' },
          ],
        },
      ],
    })
    scripts['a']!.fire('touch_start', { num_detected: 1 })
    scripts['b']!.fire('touch_start', { num_detected: 1 })
    expect(scripts['a']!.global('ok')).toBe(20)
    expect(scripts['b']!.global('ok')).toBe(5)
  })

  const truncProbe = (options: string) => `
    integer len = 0;
    list meta;
    default {
      state_entry() { llHTTPRequest("https://example.test/", [${options}], ""); }
      http_response(key id, integer status, list m, string body) {
        len = llStringLength(body);
        meta = m;
      }
    }
  `

  // In-world: metadata [0, 2048] for a long body with the default max length.
  it('cuts a long response body to 2048 and reports HTTP_BODY_TRUNCATED', async () => {
    const s = await load(truncProbe(''))
    s.start()
    s.respondToLastHttp({ status: 200, body: 'x'.repeat(3000) })
    expect(s.global('len')).toBe(2048)
    expect(s.global('meta')).toEqual([0, 2048])
  })

  // In-world: metadata [0, 16384] with HTTP_BODY_MAXLENGTH 16384.
  it('honours HTTP_BODY_MAXLENGTH when cutting the body', async () => {
    const s = await load(truncProbe('HTTP_BODY_MAXLENGTH, 16384'))
    s.start()
    s.respondToLastHttp({ status: 200, body: 'x'.repeat(20000) })
    expect(s.global('len')).toBe(16384)
    expect(s.global('meta')).toEqual([0, 16384])
  })

  it('leaves a short body alone with empty metadata', async () => {
    const s = await load(truncProbe(''))
    s.start()
    s.respondToLastHttp({ status: 200, body: 'pong' })
    expect(s.global('len')).toBe(4)
    expect(s.global('meta')).toEqual([])
  })

  // In-world: http_response reaches every script in the prim, not only the requester.
  it('delivers http_response to every script in the prim', async () => {
    const requester = `default { state_entry() { llHTTPRequest("https://example.test/", [], ""); } }`
    const sibling = `
      string got = "";
      default { http_response(key id, integer status, list m, string body) { got = body; } }
    `
    const { scripts } = await loadLinkset({
      prims: [
        {
          scripts: [
            { source: { source: requester, filename: 'req.lsl' }, name: 'req' },
            { source: { source: sibling, filename: 'sib.lsl' }, name: 'sib' },
          ],
        },
      ],
    })
    scripts['req']!.start()
    scripts['sib']!.start()
    scripts['req']!.respondToLastHttp({ status: 200, body: 'pong' })
    expect(scripts['sib']!.global('got')).toBe('pong')
  })
})
