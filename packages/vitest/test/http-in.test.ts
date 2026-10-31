import { describe, it, expect } from 'vitest'
import { loadLinkset, loadScript } from '../src/index.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const CAP = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const HOST = 'simhost-08ead0889a544632b.aditi.secondlife.io'

// Takes a URL, reports what it was granted on channel 0, and answers every
// request with its method, path, query and body.
const SERVER = `
  key urlReq;
  default {
    state_entry() { urlReq = llRequestURL(); }
    http_request(key id, string method, string body) {
      if (method == URL_REQUEST_GRANTED || method == URL_REQUEST_DENIED) {
        llSay(0, method + " " + (string)(id == urlReq) + " " + body);
        return;
      }
      llHTTPResponse(id, 200, method + " " + llGetHTTPHeader(id, "x-path-info") + " "
        + llGetHTTPHeader(id, "x-query-string") + " " + body);
    }
  }
`

// Takes a URL and answers each request with the result of running `answer`
// with `id`, `method` and `body` in scope.
function server(answer: string, globals = ''): string {
  return `
    ${globals}
    default {
      state_entry() { llRequestURL(); }
      http_request(key id, string method, string body) {
        if (method == URL_REQUEST_GRANTED) return;
        ${answer}
      }
    }
  `
}

describe('llRequestURL', () => {
  // https://wiki.secondlife.com/wiki/LlRequestURL
  // In-world: llRequestURL -> http_request(<the returned key>, URL_REQUEST_GRANTED,
  // "http://simhost-08ead0889a544632b.aditi.secondlife.io:12046/cap/<uuid>") (Aditi, SLua Tombolo, 2026-10-31)
  it('grants a URL through http_request with the request key and the URL as body', async () => {
    const s = await loadScript({ source: SERVER })
    s.start()
    expect(s.urls).toHaveLength(1)
    const url = s.urls[0]!
    expect(url).toMatch(new RegExp(`^http://${HOST}:12046/cap/${CAP}$`))
    expect(s.chat.map((c) => c.text)).toEqual([`URL_REQUEST_GRANTED 1 ${url}`])
  })

  // Not measured: the region had 20000 free URLs, and running them out to
  // see a denial would take URLs from everyone else's objects there too.
  it('denies the URL after denyUrls, and grants again after grantUrls', async () => {
    const s = await loadScript({ source: SERVER })
    s.denyUrls()
    s.start()
    expect(s.urls).toEqual([])
    expect(s.chat.map((c) => c.text)).toEqual(['URL_REQUEST_DENIED 1 '])
    s.grantUrls()
    s.reset()
    expect(s.urls).toHaveLength(1)
  })

  // In-world: a second script in the prim saw no http_request, neither the
  // grant nor the requests to the first script's URL (Aditi, SLua Tombolo, 2026-10-31)
  it('only the requesting script hears the grant and the requests', async () => {
    const { scripts } = await loadLinkset({
      prims: [
        {
          scripts: [
            { source: { source: server('llHTTPResponse(id, 200, "a");') }, name: 'a' },
            {
              source: {
                source: `default { http_request(key id, string m, string b) { llSay(0, "b heard " + m); } }`,
              },
              name: 'b',
            },
          ],
        },
      ],
    })
    const a = scripts['a']
    const b = scripts['b']
    a!.start()
    b!.start()
    expect(a!.sendHttpRequest(a!.urls[0]!).response?.body).toBe('a')
    expect(b!.chat).toEqual([])
  })

  // https://wiki.secondlife.com/wiki/LlRequestSecureURL
  // In-world: llRequestSecureURL -> "https://simhost-08ead0889a544632b.aditi.secondlife.io:12043/cap/<uuid>"
  // (Aditi, SLua Tombolo, 2026-10-31)
  it('llRequestSecureURL grants an https URL on port 12043', async () => {
    const s = await loadScript({ source: `default { state_entry() { llRequestSecureURL(); } }` })
    s.start()
    expect(s.urls[0]).toMatch(new RegExp(`^https://${HOST}:12043/cap/${CAP}$`))
  })

  // In-world: after `state two;` requests to the URL reached state two's
  // http_request (Aditi, SLua Tombolo, 2026-10-31)
  it('keeps its URLs across a state change', async () => {
    const s = await loadScript({
      source: `
        default {
          state_entry() { llRequestURL(); }
          http_request(key id, string method, string body) {
            if (method == URL_REQUEST_GRANTED) return;
            llHTTPResponse(id, 200, "default");
            state two;
          }
        }
        state two {
          http_request(key id, string method, string body) { llHTTPResponse(id, 200, "two"); }
        }
      `,
    })
    s.start()
    const url = s.urls[0]!
    expect(s.sendHttpRequest(url).response?.body).toBe('default')
    expect(s.sendHttpRequest(url).response?.body).toBe('two')
  })

  // In-world: after llResetScript, requests to the old URL got 404 "cap not found"
  // and llGetFreeURLs was back to 20000 in state_entry (Aditi, SLua Tombolo, 2026-10-31)
  it('a script reset releases every URL', async () => {
    const s = await loadScript({ source: `default { state_entry() { llSay(0, (string)llGetFreeURLs()); llRequestURL(); } }` })
    s.start()
    const old = s.urls[0]!
    s.reset()
    expect(s.chat.map((c) => c.text)).toEqual(['20000', '20000'])
    expect(s.urls).toHaveLength(1)
    expect(s.urls[0]).not.toBe(old)
    expect(s.sendHttpRequest(old).response?.status).toBe(404)
  })
})

describe('sendHttpRequest', () => {
  it('fires http_request and returns the llHTTPResponse the script sent', async () => {
    const s = await loadScript({ source: SERVER })
    s.start()
    const req = s.sendHttpRequest(s.urls[0]! + '/a/b?x=1&y=%20', { method: 'POST', body: 'hello' })
    expect(req.key).toMatch(UUID)
    expect(req.response).toEqual({
      status: 200,
      body: 'POST /a/b x=1&y=%20 hello',
      contentType: 'text/plain; charset=utf-8',
    })
  })

  // In-world: GET, POST, PUT, DELETE and PATCH reached the script; DELETE
  // arrived with an empty body (Aditi, SLua Tombolo, 2026-10-31)
  it('passes GET, POST, PUT, DELETE and PATCH on, dropping a DELETE body', async () => {
    const s = await loadScript({ source: SERVER })
    s.start()
    const url = s.urls[0]!
    const answers = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(
      (method) => s.sendHttpRequest(url + '/m', { method, body: 'b' }).response?.body,
    )
    expect(answers).toEqual(['GET /m  b', 'POST /m  b', 'PUT /m  b', 'DELETE /m  ', 'PATCH /m  b'])
  })

  // In-world: OPTIONS -> 200 "OK" text/plain, HEAD -> 400, FOO -> 501, none
  // of them reaching the script (Aditi, SLua Tombolo, 2026-10-31)
  it('answers OPTIONS, HEAD and unknown methods itself', async () => {
    const s = await loadScript({ source: SERVER })
    s.start()
    const url = s.urls[0]!
    expect(s.sendHttpRequest(url, { method: 'OPTIONS' }).response).toEqual({
      status: 200,
      body: 'OK',
      contentType: 'text/plain',
    })
    expect(s.sendHttpRequest(url, { method: 'HEAD' }).response?.status).toBe(400)
    expect(s.sendHttpRequest(url, { method: 'FOO' }).response?.status).toBe(501)
    expect(s.chat).toHaveLength(1)
  })

  // In-world: a 3000-byte POST body arrived as 2048 characters (Aditi, SLua Tombolo, 2026-10-31)
  it('cuts the request body to 2048 bytes', async () => {
    const s = await loadScript({ source: server('llHTTPResponse(id, 200, (string)llStringLength(body));') })
    s.start()
    expect(s.sendHttpRequest(s.urls[0]!, { method: 'POST', body: 'z'.repeat(3000) }).response?.body).toBe(
      '2048',
    )
  })

  // In-world: a request to a released URL -> 404 "cap not found: '<uuid>'\n"
  // with no Content-Type (Aditi, SLua Tombolo, 2026-10-31)
  it('a URL the script does not hold gets a 404', async () => {
    const s = await loadScript({ source: SERVER })
    s.start()
    const url = `http://${HOST}:12046/cap/00000000-0000-0000-0000-00000000abcd`
    expect(s.sendHttpRequest(url + '/x').response).toEqual({
      status: 404,
      body: "cap not found: '00000000-0000-0000-0000-00000000abcd'\n",
      contentType: '',
    })
  })

  // In-world: a request the script never answered -> 504 "Timed out waiting
  // for response from internal server." text/plain after 25.5-27.4 s
  // (Aditi, SLua Tombolo, 2026-10-31)
  it('times out with a 504 after 25 seconds without an answer', async () => {
    const s = await loadScript({ source: server('') })
    s.start()
    const req = s.sendHttpRequest(s.urls[0]!)
    expect(req.response).toBeUndefined()
    s.advanceTime(24_999)
    expect(req.response).toBeUndefined()
    s.advanceTime(1)
    expect(req.response).toEqual({
      status: 504,
      body: 'Timed out waiting for response from internal server.',
      contentType: 'text/plain',
    })
  })

  // In-world: a script that answered from a timer 2 s later got its answer
  // through, and could still read the headers then (Aditi, SLua Tombolo, 2026-10-31)
  it('takes an answer sent from a later event', async () => {
    const s = await loadScript({
      source: `
        key held;
        default {
          state_entry() { llRequestURL(); }
          http_request(key id, string method, string body) {
            if (method == URL_REQUEST_GRANTED) return;
            held = id;
            llSetTimerEvent(2.0);
          }
          timer() {
            llSetTimerEvent(0);
            llHTTPResponse(held, 200, "late " + llGetHTTPHeader(held, "x-path-info"));
          }
        }
      `,
    })
    s.start()
    const req = s.sendHttpRequest(s.urls[0]! + '/late')
    expect(req.response).toBeUndefined()
    s.advanceTime(2000)
    expect(req.response?.body).toBe('late /late')
  })
})

describe('llHTTPResponse', () => {
  // https://wiki.secondlife.com/wiki/LlHTTPResponse
  // In-world: two llHTTPResponse calls -> the client got the first, 200 "one"
  // (Aditi, SLua Tombolo, 2026-10-31)
  it('only the first answer counts', async () => {
    const s = await loadScript({
      source: server('llHTTPResponse(id, 200, "one"); llHTTPResponse(id, 201, "two");'),
    })
    s.start()
    expect(s.sendHttpRequest(s.urls[0]!).response).toMatchObject({ status: 200, body: 'one' })
  })

  // In-world: statuses 201, 204, 418, 599 and 600 came through as sent; 99, 0
  // and -5 arrived as 200 (Aditi, SLua Tombolo, 2026-10-31)
  it('sends a status below 100 as 200', async () => {
    const s = await loadScript({ source: server('llHTTPResponse(id, (integer)body, "");') })
    s.start()
    const url = s.urls[0]!
    const statuses = ['201', '418', '600', '99', '0', '-5'].map(
      (body) => s.sendHttpRequest(url, { method: 'POST', body }).response?.status,
    )
    expect(statuses).toEqual([201, 418, 600, 200, 200, 200])
  })

  // In-world: llHTTPResponse(NULL_KEY, ...) did nothing and raised no error
  // (Aditi, SLua Tombolo, 2026-10-31)
  it('ignores an unknown request key', async () => {
    const s = await loadScript({
      source: server('llHTTPResponse(NULL_KEY, 500, "x"); llHTTPResponse(id, 200, "ok");'),
    })
    s.start()
    expect(s.sendHttpRequest(s.urls[0]!).response?.body).toBe('ok')
    expect(s.chat).toEqual([])
  })
})

describe('llGetHTTPHeader', () => {
  // https://wiki.secondlife.com/wiki/LlGetHTTPHeader
  // In-world: only x-script-url, x-path-info, x-query-string, x-remote-ip
  // and user-agent were non-empty; content-type, host, accept, custom
  // headers and upper-case names read "". An X-Forwarded-For of 1.2.3.4 made
  // x-remote-ip "1.2.3.4, <sender>" (Aditi, SLua Tombolo, 2026-10-31)
  it('reads the five headers Second Life exposes, by lowercase name', async () => {
    const names = [
      'x-script-url',
      'x-path-info',
      'x-query-string',
      'x-remote-ip',
      'user-agent',
      'content-type',
      'x-custom',
      'X-Path-Info',
    ]
    const s = await loadScript({
      source: server(
        `llHTTPResponse(id, 200, llDumpList2String([${names
          .map((n) => `llGetHTTPHeader(id, "${n}")`)
          .join(', ')}], "|"));`,
      ),
    })
    s.start()
    const url = s.urls[0]!
    const res = s.sendHttpRequest(url + '/p/q?a=b', {
      method: 'POST',
      headers: { 'User-Agent': 'probe/1', 'Content-Type': 'application/json', 'X-Custom': 'v' },
      body: '{}',
      remoteIp: '203.0.113.9',
    }).response
    expect(res?.body).toBe(`${url}|/p/q|a=b|203.0.113.9|probe/1|||`)
    const forwarded = s.sendHttpRequest(url, { headers: { 'X-Forwarded-For': '1.2.3.4' } }).response
    expect(forwarded?.body.split('|')[3]).toBe('1.2.3.4, 127.0.0.1')
  })

  // In-world: the header read "" right after llHTTPResponse, and for
  // NULL_KEY or a random key (Aditi, SLua Tombolo, 2026-10-31)
  it('reads "" once the request is answered, or for an unknown key', async () => {
    const s = await loadScript({
      source: server(
        `string before = llGetHTTPHeader(id, "x-path-info");
         llHTTPResponse(id, 200, "");
         llSay(0, before + "|" + llGetHTTPHeader(id, "x-path-info") + "|" + llGetHTTPHeader(NULL_KEY, "x-path-info"));`,
      ),
    })
    s.start()
    s.sendHttpRequest(s.urls[0]! + '/x')
    expect(s.chat.map((c) => c.text)).toEqual(['/x||'])
  })
})

describe('llSetContentType', () => {
  // https://wiki.secondlife.com/wiki/LlSetContentType
  // In-world: CONTENT_TYPE_* 0-8 -> text/plain, text/plain (HTML to a
  // non-viewer client), application/xml, application/xhtml+xml,
  // application/atom+xml, application/json, application/llsd+xml,
  // application/x-www-form-urlencoded, application/rss+xml, each with
  // "; charset=utf-8"; 9, 99 and -1 -> text/plain (Aditi, SLua Tombolo, 2026-10-31)
  it('sets the Content-Type of the response', async () => {
    const s = await loadScript({
      source: server('llSetContentType(id, (integer)body); llHTTPResponse(id, 200, "");'),
    })
    s.start()
    const url = s.urls[0]!
    const types = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '-1'].map(
      (body) => s.sendHttpRequest(url, { method: 'POST', body }).response?.contentType,
    )
    expect(types).toEqual(
      [
        'text/plain',
        'text/plain',
        'application/xml',
        'application/xhtml+xml',
        'application/atom+xml',
        'application/json',
        'application/llsd+xml',
        'application/x-www-form-urlencoded',
        'application/rss+xml',
        'text/plain',
        'text/plain',
      ].map((t) => `${t}; charset=utf-8`),
    )
  })

  // In-world: JSON then XML -> application/xml; llSetContentType after
  // llHTTPResponse -> text/plain (Aditi, SLua Tombolo, 2026-10-31)
  it('the last call before the answer wins', async () => {
    const s = await loadScript({
      source: server(`
        if (body == "after") {
          llHTTPResponse(id, 200, "");
          llSetContentType(id, CONTENT_TYPE_JSON);
        } else {
          llSetContentType(id, CONTENT_TYPE_JSON);
          llSetContentType(id, CONTENT_TYPE_XML);
          llHTTPResponse(id, 200, "");
        }
      `),
    })
    s.start()
    const url = s.urls[0]!
    expect(s.sendHttpRequest(url, { method: 'POST', body: 'twice' }).response?.contentType).toBe(
      'application/xml; charset=utf-8',
    )
    expect(s.sendHttpRequest(url, { method: 'POST', body: 'after' }).response?.contentType).toBe(
      'text/plain; charset=utf-8',
    )
  })
})

describe('llReleaseURL', () => {
  // https://wiki.secondlife.com/wiki/LlReleaseURL
  // In-world: llReleaseURL(url) -> llGetFreeURLs went up by one at once, and
  // the URL then answered 404 "cap not found" (Aditi, SLua Tombolo, 2026-10-31)
  it('frees the URL so requests to it no longer reach the script', async () => {
    const s = await loadScript({
      source: `
        string url;
        default {
          state_entry() { llRequestURL(); }
          http_request(key id, string method, string body) {
            if (method == URL_REQUEST_GRANTED) { url = body; return; }
            integer before = llGetFreeURLs();
            llReleaseURL(url);
            llHTTPResponse(id, 200, (string)before + " " + (string)llGetFreeURLs());
          }
        }
      `,
    })
    s.start()
    const url = s.urls[0]!
    expect(s.sendHttpRequest(url).response?.body).toBe('19999 20000')
    expect(s.urls).toEqual([])
    expect(s.sendHttpRequest(url).response?.status).toBe(404)
  })

  // In-world: llReleaseURL("http://example.com/nope") and llReleaseURL("")
  // raised no error and left llGetFreeURLs unchanged (Aditi, SLua Tombolo, 2026-10-31)
  it('ignores a URL the script does not hold', async () => {
    const s = await loadScript({
      source: server('llReleaseURL("http://example.com/nope"); llReleaseURL(""); llHTTPResponse(id, 200, (string)llGetFreeURLs());'),
    })
    s.start()
    expect(s.sendHttpRequest(s.urls[0]!).response?.body).toBe('19999')
    expect(s.chat).toEqual([])
  })
})

describe('llGetFreeURLs', () => {
  // https://wiki.secondlife.com/wiki/LlGetFreeURLs
  // In-world: 20000 before any URL, 19999 after llRequestURL and 19998 after
  // llRequestSecureURL (Aditi, SLua Tombolo, 2026-10-31)
  it('counts down as scripts in the linkset take URLs', async () => {
    const { linkset, scripts } = await loadLinkset({
      prims: [
        {
          scripts: [
            {
              source: {
                source: `default {
                  state_entry() { llSay(0, (string)llGetFreeURLs()); llRequestURL(); llRequestSecureURL(); }
                  http_request(key id, string m, string b) { llSay(0, (string)llGetFreeURLs()); }
                }`,
              },
              name: 'a',
            },
          ],
        },
        {
          scripts: [
            {
              source: { source: `default { touch_start(integer n) { llSay(0, (string)llGetFreeURLs()); } }` },
              name: 'b',
            },
          ],
        },
      ],
    })
    const a = scripts['a']
    const b = scripts['b']
    a!.start()
    b!.start()
    linkset.touch(2)
    expect(a!.chat.map((c) => c.text)).toEqual(['20000', '19998', '19998'])
    expect(b!.chat.map((c) => c.text)).toEqual(['19998'])
  })

  it('runs out after 20000 URLs, and later requests are not granted', async () => {
    const s = await loadScript({
      source: `default { state_entry() {
        integer i;
        for (i = 0; i < 20001; i++) llRequestURL();
        llSay(0, (string)llGetFreeURLs());
      } }`,
    })
    s.start()
    expect(s.urls).toHaveLength(20000)
    expect(s.chat.map((c) => c.text)).toEqual(['0'])
  })
})
