import { describe, expect, it } from 'vitest'
import { loadScript } from '../src/index.js'
import type { Prim, Script, Vector } from '@rezless/vm'

const REQUESTER = `
  key http; key url; key data;
  default {
    state_entry() {
      http = llHTTPRequest("https://example.test/", [], "");
      url = llRequestURL();
      data = llRequestAgentData(llGetOwner(), DATA_ONLINE);
    }
    http_request(key id, string method, string body) {
      if (method != URL_REQUEST_GRANTED) llHTTPResponse(id, 200, "");
    }
  }
`

async function requester(host?: Prim): Promise<Script> {
  const s = await loadScript({ source: REQUESTER, scriptName: 'a', ...(host ? { host } : {}) })
  s.start()
  return s
}

function rename(script: Script, name: string): void {
  script.host.inventory.find((item) => item.script === script)!.name = name
}

function issued(s: Script) {
  return {
    http: s.global('http'),
    url: s.global('url'),
    data: s.global('data'),
    granted: s.urls[0],
    incoming: s.sendHttpRequest(s.urls[0]!).key,
  }
}

function expectDistinct(a: ReturnType<typeof issued>, b: ReturnType<typeof issued>): void {
  for (const k of Object.keys(a) as Array<keyof typeof a>) expect(b[k], k).not.toBe(a[k])
}

// https://wiki.secondlife.com/wiki/Key: keys in Second Life are random, so a later
// script that takes an earlier one's name must not repeat its keys or URLs.
describe('a script under a name another script in the prim had', () => {
  it('issues request keys, URLs and http-in request keys of its own after a rename', async () => {
    const first = await requester()
    const before = issued(first)
    rename(first, 'renamed')
    const second = await requester(first.host)
    expectDistinct(before, issued(second))
  })

  it('issues request keys, URLs and http-in request keys of its own after a remove and add', async () => {
    const first = await requester()
    const before = issued(first)
    first.host.removeInventory('a')
    const second = await requester(first.host)
    expectDistinct(before, issued(second))
  })

  it('leaves the first script in a prim with the keys it had before', async () => {
    const one = await requester()
    expect(one.global('http')).toBe('fd720784-13f1-703c-fd72-078413f1703c')
  })
})

// https://wiki.secondlife.com/wiki/LlMoveToTarget, https://wiki.secondlife.com/wiki/LlLookAt
describe('target motion ownership', () => {
  const START = `default{touch_start(integer n){llSetStatus(STATUS_PHYSICS,TRUE);
    llMoveToTarget(<4,0,0>,1);llLookAt(<0,4,0>,1,1);}
    link_message(integer s,integer n,string t,key k){llStopMoveToTarget();llStopLookAt();}}`

  async function started() {
    const s = await loadScript({ source: START, scriptName: 'a' })
    s.start()
    s.fire('touch_start', { num_detected: 1 })
    s.advanceTime(300)
    return s
  }

  function x(s: Script): number {
    return (s.host.params.position as Vector).x
  }

  it('keeps a renamed initiator as the owner when a new script takes its old name', async () => {
    const first = await started()
    rename(first, 'renamed')
    const second = await loadScript({ source: START, scriptName: 'a', host: first.host })
    second.start()
    second.fire('link_message', { sender_num: 0, num: 0, str: '', id: '' })
    const held = x(first)
    first.advanceTime(1000)
    expect(x(first)).toBeGreaterThan(held)
    first.fire('link_message', { sender_num: 0, num: 0, str: '', id: '' })
    const stopped = x(first)
    first.advanceTime(1000)
    expect(x(first)).toBe(stopped)
  })

  it('hands ownership to the copy of the script that started the motion', async () => {
    const first = await started()
    first.host.removeInventory('a')
    const second = await loadScript({ source: START, scriptName: 'a', host: first.host })
    second.start()
    second.fire('touch_start', { num_detected: 1 })
    first.advanceTime(300)
    const saved = second.linkset.copy(), root = saved.prims[0]!
    root.findScript('a')!.fire('link_message', { sender_num: 0, num: 0, str: '', id: '' })
    const stopped = root.params.position.x
    saved.advanceTime(1000)
    expect(root.params.position.x).toBe(stopped)
  })

  it('does not count a script that failed to load', async () => {
    const host = (await requester()).host
    await expect(loadScript({ source: 'local =', language: 'slua', filename: 'b.luau', host })).rejects.toThrow()
    const b = await loadScript({ source: REQUESTER, scriptName: 'b', host })
    const fresh = await loadScript({ source: REQUESTER, scriptName: 'b', objectKey: host.key })
    b.start()
    fresh.start()
    expect(b.global('http')).toBe(fresh.global('http'))
  })
})
