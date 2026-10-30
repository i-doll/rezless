import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

async function load(source: string) {
  return loadScript({ source })
}

describe('Phase 3 — link_message and llMessageLinked', () => {
  it('captures every llMessageLinked call into s.linkedMessages', async () => {
    const s = await load(`
      default {
        state_entry() {
          llMessageLinked(LINK_THIS, 1, "hello", NULL_KEY);
          llMessageLinked(LINK_SET, 2, "world", "abc");
        }
      }
    `)
    s.start()
    expect(s.linkedMessages).toHaveLength(2)
    expect(s.linkedMessages[0]).toMatchObject({ num: 1, str: 'hello' })
    expect(s.linkedMessages[1]).toMatchObject({ num: 2, str: 'world', id: 'abc' })
  })

  it('LINK_THIS and LINK_SET self-deliver to the link_message handler', async () => {
    const s = await load(`
      integer last_num = 0;
      string last_str = "";
      default {
        state_entry() {
          llMessageLinked(LINK_THIS, 42, "ping", NULL_KEY);
        }
        link_message(integer sender, integer num, string str, key id) {
          last_num = num;
          last_str = str;
        }
      }
    `)
    s.start()
    expect(s.global('last_num')).toBe(42)
    expect(s.global('last_str')).toBe('ping')
  })

  it('LINK_ALL_OTHERS does NOT self-deliver (no other prims to receive)', async () => {
    const s = await load(`
      integer hits = 0;
      default {
        state_entry() {
          llMessageLinked(LINK_ALL_OTHERS, 1, "x", NULL_KEY);
        }
        link_message(integer sender, integer num, string str, key id) {
          hits = hits + 1;
        }
      }
    `)
    s.start()
    expect(s.global('hits')).toBe(0)
    // …but the call is still captured.
    expect(s.linkedMessages).toHaveLength(1)
  })
})

describe('Phase 3 — dataserver requests and responses', () => {
  it('captures llRequestAgentData and respondToDataserver fires the event', async () => {
    const s = await load(`
      key req = "";
      string answer = "";
      default {
        state_entry() {
          req = llRequestAgentData("11111111-2222-3333-4444-555555555555", DATA_NAME);
        }
        dataserver(key queryid, string data) {
          if (queryid == req) answer = data;
        }
      }
    `)
    s.start()
    expect(s.dataserverRequests).toHaveLength(1)
    const reqKey = s.dataserverRequests[0]!.key
    expect(s.global('req')).toBe(reqKey)

    s.respondToDataserver(reqKey, 'Alice Resident')
    expect(s.global('answer')).toBe('Alice Resident')
    expect(s.dataserverRequests[0]!.fulfilled).toBe(true)
  })

  it('respondToLastDataserver targets the most recent request', async () => {
    const s = await load(`
      string answer = "";
      default {
        state_entry() {
          llRequestAgentData("aaa-aaa", DATA_NAME);
          llRequestAgentData("bbb-bbb", DATA_NAME);
        }
        dataserver(key queryid, string data) { answer = data; }
      }
    `)
    s.start()
    s.respondToLastDataserver('Bob')
    expect(s.global('answer')).toBe('Bob')
    expect(s.dataserverRequests[0]!.fulfilled).toBe(false)
    expect(s.dataserverRequests[1]!.fulfilled).toBe(true)
  })

  it('llRequestUsername / llRequestDisplayName get distinct sources but same response API', async () => {
    const s = await load(`
      default {
        state_entry() {
          llRequestUsername("aaa-bbb-ccc-ddd-eee-fff");
          llRequestDisplayName("ggg-hhh-iii-jjj-kkk-lll");
        }
      }
    `)
    s.start()
    expect(s.dataserverRequests.map((r) => r.source)).toEqual(['username', 'display_name'])
  })

  it('responding to an unknown key throws', async () => {
    const s = await load(`default { state_entry() {} }`)
    s.start()
    expect(() => s.respondToDataserver('nope', 'value')).toThrow(/unknown dataserver request key/)
  })
})

describe('Phase 3 — llDetected* family', () => {
  it('binds detected entries from fire payload for touch_start', async () => {
    const s = await load(`
      key who = "";
      string name = "";
      vector pos = <0, 0, 0>;
      default {
        touch_start(integer num) {
          who = llDetectedKey(0);
          name = llDetectedName(0);
          pos = llDetectedPos(0);
        }
      }
    `)
    s.fire('touch_start', {
      num_detected: 1,
      detected: [
        {
          key: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          name: 'Alice',
          pos: { x: 10, y: 20, z: 30 },
        },
      ],
    })
    expect(s.global('who')).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    expect(s.global('name')).toBe('Alice')
    expect(s.global('pos')).toEqual({ x: 10, y: 20, z: 30 })
  })

  it('handles num_detected > 1 with separate llDetected* calls', async () => {
    const s = await load(`
      string a = "";
      string b = "";
      default {
        touch_start(integer num) {
          a = llDetectedName(0);
          b = llDetectedName(1);
        }
      }
    `)
    s.fire('touch_start', {
      num_detected: 2,
      detected: [
        { key: 'k1', name: 'Alice' },
        { key: 'k2', name: 'Bob' },
      ],
    })
    expect(s.global('a')).toBe('Alice')
    expect(s.global('b')).toBe('Bob')
  })

  // In-world: llDetectedName(5) with one toucher is the NULL_KEY string.
  it('llDetectedName(out-of-range) returns the NULL_KEY string', async () => {
    const s = await load(`
      string oob = "";
      default {
        touch_start(integer num) {
          oob = llDetectedName(99);
        }
      }
    `)
    s.fire('touch_start', {
      num_detected: 1,
      detected: [{ key: 'k', name: 'Alice' }],
    })
    expect(s.global('oob')).toBe('00000000-0000-0000-0000-000000000000')
  })

  it('llDetectedOwner falls back to the avatar key when no owner provided', async () => {
    const s = await load(`
      key own = "";
      default {
        touch_start(integer num) {
          own = llDetectedOwner(0);
        }
      }
    `)
    s.fire('touch_start', {
      num_detected: 1,
      detected: [{ key: '11111111-2222-3333-4444-555555555555', name: 'Alice' }],
    })
    expect(s.global('own')).toBe('11111111-2222-3333-4444-555555555555')
  })
})

describe('event queue limit', () => {
  // In-world: 100 llMessageLinked(LINK_THIS, ...) in one handler deliver 64 link_message events.
  it('caps a script queue at 64 pending events', async () => {
    const s = await load(`
      integer got = 0;
      default {
        touch_start(integer n) {
          integer i;
          for (i = 0; i < 100; i++) llMessageLinked(LINK_THIS, i, "", "");
        }
        link_message(integer sender, integer num, string str, key id) { got = got + 1; }
      }
    `)
    s.fire('touch_start', { num_detected: 1 })
    expect(s.global('got')).toBe(64)
  })
})

describe('request keys', () => {
  // In-world: request keys are real UUIDs, so `if (key)` is true.
  it('dataserver request keys are non-null UUIDs', async () => {
    const s = await load(`
      integer truthy = 0;
      default {
        state_entry() {
          key a = llRequestAgentData("11111111-2222-3333-4444-555555555555", DATA_NAME);
          key b = llRequestAgentData("11111111-2222-3333-4444-555555555555", DATA_NAME);
          if (a) truthy = truthy + 1;
          if (b) truthy = truthy + 1;
        }
      }
    `)
    s.start()
    expect(s.global('truthy')).toBe(2)
    const [a, b] = s.dataserverRequests.map((r) => r.key)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
  })

  it('request keys are deterministic across loads', async () => {
    const src = `default { state_entry() { llRequestAgentData(NULL_KEY, DATA_NAME); } }`
    const s1 = await load(src)
    const s2 = await load(src)
    s1.start()
    s2.start()
    expect(s1.dataserverRequests[0]!.key).toBe(s2.dataserverRequests[0]!.key)
  })
})
