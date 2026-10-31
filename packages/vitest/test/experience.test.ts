import { describe, it, expect } from 'vitest'
import { Experience, loadLinkset, loadScript, NULL_KEY } from '../src/index.js'

// Measured on Aditi (SLua Tideland, 2026-10-31) with the headless viewer as
// i doll, with probe scripts compiled without an experience and with i doll's
// "Fifth Column" experience. That parcel doesn't allow the experience, so the
// granted path of llRequestExperiencePermissions, llAgentInExperience returning
// TRUE and llGetExperienceDetails on allowed land couldn't be measured: i doll
// owns no land, and no parcel within reach allows the experience. Those follow
// https://wiki.secondlife.com/wiki/LlRequestExperiencePermissions and
// https://wiki.secondlife.com/wiki/LlAgentInExperience.

const OWNER = '00000000-0000-0000-0000-00000000000a'

async function load(body: string, experience?: Experience) {
  const s = await loadScript({
    source: `
      list got;
      default {
        state_entry() { ${body} }
        dataserver(key q, string d) { got += [d]; }
        experience_permissions(key a) { got += ["granted", a]; }
        experience_permissions_denied(key a, integer r) { got += ["denied", a, r]; }
      }
    `,
    owner: OWNER,
    experience,
  })
  s.start()
  return s
}

const answers = async (body: string, experience?: Experience) => (await load(body, experience)).global('got')

const xp = () => new Experience({ name: 'Fifth Column', owner: OWNER })

describe('llGetExperienceErrorMessage', () => {
  // In-world: llGetExperienceErrorMessage(-1 .. 19, 1000, -5) (Aditi, SLua Tideland, 2026-10-31)
  it.each([
    [0, 'no error'],
    [1, 'exceeded throttle'],
    [2, 'experiences are disabled'],
    [3, 'invalid parameters'],
    [4, 'operation not permitted'],
    [5, 'script not associated with an experience'],
    [6, 'not found'],
    [7, 'invalid experience'],
    [8, 'experience is disabled'],
    [9, 'experience is suspended'],
    [10, 'unknown error'],
    [11, 'experience data quota exceeded'],
    [12, 'key-value store is disabled'],
    [13, 'key-value store communication failed'],
    [14, "key doesn't exist"],
    [15, 'retry update'],
    [16, 'experience content rating too high'],
    [17, 'not allowed to run in current location'],
    [18, 'experience permissions request timed out'],
    [19, 'unknown error id'],
    [1000, 'unknown error id'],
    [-1, 'unknown error id'],
    [-5, 'unknown error id'],
  ])('error %i is "%s"', async (code, text) => {
    expect(await answers(`got = [llGetExperienceErrorMessage(${code})];`)).toEqual([text])
  })
})

describe('a script without an experience', () => {
  // In-world: every key-value call -> dataserver "0,5" (XP_ERROR_NO_EXPERIENCE)
  it.each([
    'llCreateKeyValue("a", "1")',
    'llReadKeyValue("a")',
    'llUpdateKeyValue("a", "1", FALSE, "")',
    'llDeleteKeyValue("a")',
    'llKeyCountKeyValue()',
    'llKeysKeyValue(0, 10)',
    'llDataSizeKeyValue()',
  ])('%s answers 0,5', async (call) => {
    expect(await answers(`${call};`)).toEqual(['0,5'])
  })

  // In-world: llAgentInExperience(owner) = 0, llGetExperienceDetails(NULL_KEY) = []
  it('is in no experience and has no details', async () => {
    expect(
      await answers(
        'got = [llAgentInExperience(llGetOwner())] + llGetExperienceDetails(NULL_KEY) + llGetExperienceDetails(llGenerateKey());',
      ),
    ).toEqual([0])
  })

  // In-world: llRequestExperiencePermissions(owner, "") -> experience_permissions_denied(owner, 5)
  it('has experience permission requests denied with XP_ERROR_NO_EXPERIENCE', async () => {
    const s = await load('llRequestExperiencePermissions(llGetOwner(), "");')
    expect(s.global('got')).toEqual(['denied', OWNER, 5])
    expect(s.experienceRequests).toEqual([])
  })

  it('returns a request key for each call', async () => {
    const s = await load('got = [llCreateKeyValue("a", "1")];')
    const key = (s.global('got') as string[])[0]
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(s.dataserverRequests).toEqual([
      { key, source: 'create_key_value', args: ['a', '1'], fulfilled: true },
    ])
  })
})

describe('llGetExperienceDetails', () => {
  // In-world: llGetExperienceDetails(NULL_KEY) on land that doesn't allow the experience =
  // [Fifth Column, <owner>, <experience id>, 17, "not allowed to run in current location", NULL_KEY];
  // llGetExperienceDetails(llGenerateKey()) = []
  it('describes the script experience, and nothing for another key', async () => {
    const x = new Experience({ name: 'Fifth Column', owner: OWNER, allowedHere: false })
    const s = await load(
      'got = llGetExperienceDetails(NULL_KEY) + ["|"] + llGetExperienceDetails(llGenerateKey());',
      x,
    )
    expect(s.global('got')).toEqual([
      'Fifth Column',
      OWNER,
      x.id,
      17,
      'not allowed to run in current location',
      NULL_KEY,
      '|',
    ])
  })

  // Not measured: no parcel i doll can reach allows the experience. The state follows the measured
  // shape above, with XP_ERROR_NONE and its message.
  it('reports XP_ERROR_NONE where the land allows it, and accepts its own key', async () => {
    const x = xp()
    const s = await load(`got = llGetExperienceDetails("${x.id}");`, x)
    expect(s.global('got')).toEqual(['Fifth Column', OWNER, x.id, 0, 'no error', NULL_KEY])
  })

  it('types the keys and the state', async () => {
    const s = await load(
      'list d = llGetExperienceDetails(NULL_KEY); got = [llGetListEntryType(d, 1), llGetListEntryType(d, 2), llGetListEntryType(d, 3), llGetListEntryType(d, 5)];',
      xp(),
    )
    expect(s.global('got')).toEqual([4, 4, 1, 4])
  })
})

describe('the key-value store', () => {
  // In-world: llCreateKeyValue("p158_a", "v1") -> "1,v1"; again with "v2" -> "0,13";
  // llReadKeyValue("p158_a") -> "1,v1"; llReadKeyValue("p158_missing") -> "0,14"
  it('creates once and reads back', async () => {
    const x = xp()
    expect(
      await answers(
        'llCreateKeyValue("a", "v1"); llCreateKeyValue("a", "v2"); llReadKeyValue("a"); llReadKeyValue("missing");',
        x,
      ),
    ).toEqual(['1,v1', '0,13', '1,v1', '0,14'])
    expect([...x.store]).toEqual([['a', 'v1']])
  })

  // In-world: llUpdateKeyValue("p158_a", "v3", TRUE, "wrong") -> "0,15"; with "v1" -> "1,v3";
  // llUpdateKeyValue("p158_b", "x,y", FALSE, "") on a missing key -> "1,x,y", then read -> "1,x,y";
  // llUpdateKeyValue("p158_m2", "z", TRUE, "") and (..., TRUE, "z") on a missing key -> "0,15"
  it('updates, checked against the original value', async () => {
    const x = xp()
    x.seed([['a', 'v1']])
    expect(
      await answers(
        `llUpdateKeyValue("a", "v3", TRUE, "wrong"); llUpdateKeyValue("a", "v3", TRUE, "v1");
         llUpdateKeyValue("b", "x,y", FALSE, ""); llReadKeyValue("b");
         llUpdateKeyValue("m", "z", TRUE, ""); llUpdateKeyValue("m", "z", TRUE, "z"); llReadKeyValue("m");`,
        x,
      ),
    ).toEqual(['0,15', '1,v3', '1,x,y', '1,x,y', '0,15', '0,15', '0,14'])
  })

  // In-world: llDeleteKeyValue("p158_a") -> "1,delete"; again -> "0,13"
  it('deletes', async () => {
    const x = xp()
    x.seed([['a', '1']])
    expect(await answers('llDeleteKeyValue("a"); llDeleteKeyValue("a");', x)).toEqual(['1,delete', '0,13'])
    expect(x.store.size).toBe(0)
  })

  // In-world: llCreateKeyValue("", "e"), llReadKeyValue(""), llDeleteKeyValue("") -> "0,3";
  // llCreateKeyValue("p158_c", "") -> "1,", read -> "1,", llUpdateKeyValue(.., "", FALSE, "") -> "1,"
  it('refuses an empty key but stores an empty value', async () => {
    expect(
      await answers(
        'llCreateKeyValue("", "e"); llReadKeyValue(""); llDeleteKeyValue(""); llCreateKeyValue("c", ""); llReadKeyValue("c"); llUpdateKeyValue("c", "", FALSE, "");',
        xp(),
      ),
    ).toEqual(['0,3', '0,3', '0,3', '1,', '1,', '1,'])
  })

  // In-world: a 4095-byte ASCII value and 2047 "é" (4094 bytes) -> "1,…";
  // 4096 ASCII bytes, 2048 "é" (4096 bytes) and 1366 "€" (4098 bytes) -> "0,3"
  it('limits values to 4095 bytes', async () => {
    const s = await driven(xp())
    for (const [k, v] of [
      ['a', 'a'.repeat(4095)],
      ['b', 'a'.repeat(4096)],
      ['c', 'é'.repeat(2047)],
      ['d', 'é'.repeat(2048)],
      ['e', '€'.repeat(1366)],
    ] as const) {
      create(s, k, v)
    }
    expect((s.global('got') as string[]).map((d) => d.slice(0, 3))).toEqual(['1,a', '0,3', '1,é', '0,3', '0,3'])
  })

  // In-world: llReadKeyValue of a 1105-byte key -> "0,14"; llUpdateKeyValue(<1105-byte key>, "v", FALSE, "") -> "0,13"
  // and (..., TRUE, "x") -> "0,15"; llUpdateKeyValue("", "v", FALSE, "") -> "0,3"; with "p158_a" = "1",
  // a 4096-byte update answers "0,3" unchecked, checked against "1" and checked against "zz"
  it('checks updates for an empty key and value size before the original value, then key size', async () => {
    const x = xp()
    x.seed([['a', '1']])
    const long = 'a'.repeat(1105)
    const big = 'a'.repeat(4096)
    expect(
      await answers(
        `llReadKeyValue("${long}"); llUpdateKeyValue("${long}", "v", FALSE, ""); llUpdateKeyValue("${long}", "v", TRUE, "x");
         llUpdateKeyValue("", "v", FALSE, ""); llUpdateKeyValue("a", "${big}", FALSE, "");
         llUpdateKeyValue("a", "${big}", TRUE, "1"); llUpdateKeyValue("a", "${big}", TRUE, "zz");`,
        x,
      ),
    ).toEqual(['0,14', '0,13', '0,15', '0,3', '0,3', '0,3', '0,3'])
    expect(x.store.get('a')).toBe('1')
  })

  // In-world: "p158_" + 1006 "a" (1011 bytes) and "p158_" + 503 "é" (1011 bytes) -> "1,v";
  // "p158_" + 1007 "a" (1012 bytes) and "p158_" + 504 "é" (1013 bytes) -> "0,13"
  it('limits keys to 1011 bytes', async () => {
    const s = await driven(xp())
    for (const k of ['a'.repeat(1006), 'a'.repeat(1007), 'é'.repeat(503), 'é'.repeat(504)]) create(s, `p158_${k}`, 'v')
    expect(s.global('got')).toEqual(['1,v', '0,13', '1,v', '0,13'])
  })
})

describe('listing and sizing the store', () => {
  // In-world: create p158_o2, p158_o1, p158_o3, delete p158_o2, create it again, update p158_o1
  // -> llKeysKeyValue(0, 10) = "1,p158_o1,p158_o3,p158_o2"
  it('lists keys in the order they were added', async () => {
    const x = xp()
    expect(
      await answers(
        `llCreateKeyValue("o2", "2"); llCreateKeyValue("o1", "1"); llCreateKeyValue("o3", "3");
         llDeleteKeyValue("o2"); llCreateKeyValue("o2", "2"); llUpdateKeyValue("o1", "1x", FALSE, "");
         llKeysKeyValue(0, 10); llKeyCountKeyValue();`,
        x,
      ),
    ).toEqual(['1,2', '1,1', '1,3', '1,delete', '1,2', '1,1x', '1,o1,o3,o2', '1,3'])
  })

  // In-world, with 6 keys: llKeysKeyValue(0, 0) lists all 6; (1000000, 1) and (0, -1) -> "0,14";
  // (-1, 1) -> "1,". With 9 keys: (5, 1) -> the 6th key; (2, 10) -> keys 3 to 9. With 3 keys:
  // (3, 1), (3, 0) and (-5, -1) -> "0,14"; (2, 5) -> the 3rd key; (1, 0) -> keys 2 and 3; (-1, 0) -> "1,".
  it.each([
    ['0, 0', '1,a,b,c,d'],
    ['1, 2', '1,b,c'],
    ['2, 10', '1,c,d'],
    ['3, 1', '1,d'],
    ['4, 1', '0,14'],
    ['1000000, 1', '0,14'],
    ['0, -1', '0,14'],
    ['-1, 1', '1,'],
    ['-1, 0', '1,'],
    ['-5, -1', '0,14'],
  ])('llKeysKeyValue(%s) answers %s', async (range, data) => {
    const x = xp()
    x.seed(['a', 'b', 'c', 'd'].map((k) => [k, '1']))
    expect(await answers(`llKeysKeyValue(${range});`, x)).toEqual([data])
  })

  // In-world (Aditi, SLua Tideland, 2026-10-31): four 1000-character keys, then a fifth. llKeysKeyValue(0, 0) and (0, 10) list all five
  // while the answer is at most 4097 bytes, "1," and commas included: a 91-character fifth key -> 4097
  // characters with 5 keys; 92 to 95 characters -> only the first 4 (4005 characters). A fifth key of
  // "p" + 45 "é" (4097 bytes) is listed; "p" + 46 "é" (4099 bytes, 4053 characters) and up to
  // "p" + 92 "é" (4099 characters) are not, so the limit is in UTF-8 bytes.
  it.each([
    ['a 91-character fifth key', 'p'.padEnd(91, 'x'), 5],
    ['a 92-character fifth key', 'p'.padEnd(92, 'x'), 4],
    ['a fifth key making 4097 bytes', 'p' + 'é'.repeat(45), 5],
    ['a fifth key making 4099 bytes', 'p' + 'é'.repeat(46), 4],
  ])('stops before a key that takes the answer past 4097 bytes: %s', async (_, last, n) => {
    const x = xp()
    const keys = [1, 2, 3, 4].map((i) => `k${i}`.padEnd(1000, 'x')).concat(last)
    x.seed(keys.map((k) => [k, 'v']))
    const listed = `1,${keys.slice(0, n).join(',')}`
    expect(await answers('llKeysKeyValue(0, 0); llKeysKeyValue(0, 10);', x)).toEqual([listed, listed])
  })

  // In-world: four 1000-character keys, a 92-character key, then "p158u". (0, 0) and (0, 10) list the
  // first 4 keys only; (1, 0) lists the other 5.
  it('stops at the first key that does not fit, even when a later one would', async () => {
    const x = xp()
    const keys = [1, 2, 3, 4].map((i) => `k${i}`.padEnd(1000, 'x')).concat('p'.padEnd(92, 'x'), 'u')
    x.seed(keys.map((k) => [k, 'v']))
    expect(await answers('llKeysKeyValue(0, 0); llKeysKeyValue(0, 10); llKeysKeyValue(1, 0);', x)).toEqual([
      `1,${keys.slice(0, 4).join(',')}`,
      `1,${keys.slice(0, 4).join(',')}`,
      `1,${keys.slice(1).join(',')}`,
    ])
  })

  // In-world: on an empty store llKeysKeyValue(0, 0) and (0, 1) -> "0,14"; llKeyCountKeyValue() -> "1,0"
  it('has no keys to list when empty', async () => {
    expect(await answers('llKeysKeyValue(0, 0); llKeysKeyValue(0, 1); llKeyCountKeyValue();', xp())).toEqual([
      '0,14',
      '0,14',
      '1,0',
    ])
  })

  // In-world: empty store -> "1,0,134217728"; "p158_x" = "" -> 131 bytes; "p158_xy" = "abc" -> 135;
  // two 7-byte keys with empty values -> 264; adding "p158_L" = 4095 "a" -> 4490;
  // adding "p158_M" = 100 "é" (200 bytes) -> 4821. Each entry is 125 bytes plus its UTF-8 key and value.
  it('measures 125 bytes per entry plus its key and value', async () => {
    const x = xp()
    expect(
      await answers(
        `llDataSizeKeyValue(); llCreateKeyValue("p158_s1", ""); llCreateKeyValue("p158_s2", ""); llDataSizeKeyValue();
         llCreateKeyValue("p158_M", "${'é'.repeat(100)}"); llDataSizeKeyValue();`,
        x,
      ),
    ).toEqual(['1,0,134217728', '1,', '1,', '1,264,134217728', `1,${'é'.repeat(100)}`, '1,595,134217728'])
  })

  // Not measured: filling the 134217728-byte quota measured above would take over a million writes.
  it('refuses writes past the quota with XP_ERROR_QUOTA_EXCEEDED', async () => {
    const x = new Experience({ quota: 130 })
    expect(
      await answers('llCreateKeyValue("a", "1"); llCreateKeyValue("b", "2"); llUpdateKeyValue("a", "12345678", FALSE, "");', x),
    ).toEqual(['1,1', '0,11', '0,11'])
  })
})

describe('dataserver answers', () => {
  // In-world: a second script in the prim heard all 45 key-value answers, with and without an experience
  it('reach every script in the prim, and the store is shared by the experience', async () => {
    const x = xp()
    const { scripts } = await loadLinkset({
      prims: [
        {
          scripts: [
            { name: 'other', source: { source: 'list got; default { dataserver(key q, string d) { got += [d]; } }' } },
            {
              name: 'writer',
              source: { source: 'default { state_entry() { llCreateKeyValue("a", "1"); } }' },
              experience: x,
            },
          ],
        },
      ],
    })
    scripts.other!.start()
    scripts.writer!.start()
    expect(scripts.other!.global('got')).toEqual(['1,1'])
    const reader = await load('llReadKeyValue("a");', x)
    expect(reader.global('got')).toEqual(['1,1'])
  })
})

describe('experience permissions', () => {
  // In-world: on land that doesn't allow the experience, llRequestExperiencePermissions(owner, "")
  // -> experience_permissions_denied(owner, 17) and llAgentInExperience(owner) = 0
  it('are denied with XP_ERROR_NOT_PERMITTED_LAND where the land disallows the experience', async () => {
    const x = new Experience({ allowedHere: false, agents: [OWNER] })
    const s = await load('llRequestExperiencePermissions(llGetOwner(), ""); got += [llAgentInExperience(llGetOwner())];', x)
    expect(s.global('got')).toEqual([0, 'denied', OWNER, 17])
  })

  // Not measured: needs land that allows the experience (see the top of the file).
  it('wait for the test to accept, then the agent is in the experience', async () => {
    const x = xp()
    const s = await load('llRequestExperiencePermissions(llGetOwner(), "");', x)
    expect(s.experienceRequests).toEqual([{ agent: OWNER, answered: false }])
    expect(s.global('got')).toEqual([])
    s.grantExperiencePermissions()
    expect(s.global('got')).toEqual(['granted', OWNER])
    expect(x.agents.has(OWNER)).toBe(true)
    expect(s.experienceRequests[0]!.answered).toBe(true)
    const again = await load('got = [llAgentInExperience(llGetOwner())]; llRequestExperiencePermissions(llGetOwner(), "");', x)
    expect(again.global('got')).toEqual([1, 'granted', OWNER])
    expect(again.experienceRequests).toEqual([])
  })

  // Not measured: needs land that allows the experience (see the top of the file). The wiki lists the
  // permissions an experience grants: take controls, trigger animation, attach, track camera,
  // control camera and teleport.
  it('grant the experience permissions for the agent, whether accepted now or before', async () => {
    const x = xp()
    const source = `
      list got;
      default {
        state_entry() { llRequestExperiencePermissions(llGetOwner(), ""); }
        experience_permissions(key a) {
          llTakeControls(CONTROL_FWD, TRUE, FALSE);
          got = [llGetPermissions(), llGetPermissionsKey()];
        }
      }
    `
    const s = await loadScript({ source, owner: OWNER, experience: x })
    s.start()
    s.grantExperiencePermissions()
    const bits = 0x4 | 0x10 | 0x20 | 0x400 | 0x800 | 0x1000
    expect(s.global('got')).toEqual([bits, OWNER])
    expect(s.controls).not.toBeNull()
    const again = await loadScript({ source, owner: OWNER, experience: x })
    again.start()
    expect(again.global('got')).toEqual([bits, OWNER])
    expect(again.controls).not.toBeNull()
  })

  it('can be declined, by default with XP_ERROR_NOT_PERMITTED', async () => {
    const x = xp()
    const s = await load('llRequestExperiencePermissions(llGetOwner(), ""); llRequestExperiencePermissions(llGetOwner(), "");', x)
    s.denyExperiencePermissions()
    s.denyExperiencePermissions(18)
    expect(s.global('got')).toEqual(['denied', OWNER, 4, 'denied', OWNER, 18])
    expect(x.agents.size).toBe(0)
    expect(() => s.denyExperiencePermissions()).toThrow(/no pending experience permission request/)
  })

  it('are dropped when the script resets', async () => {
    const s = await load('llRequestExperiencePermissions(llGetOwner(), "");', xp())
    s.reset()
    expect(s.experienceRequests.map((r) => r.answered)).toEqual([true, false])
  })

  it('expose the experience on the script', async () => {
    const x = xp()
    expect((await load('', x)).experience).toBe(x)
    expect((await load('')).experience).toBeNull()
  })
})

async function driven(experience: Experience) {
  const s = await loadScript({
    source: `
      list got;
      default {
        link_message(integer s, integer n, string m, key id) {
          list a = llParseStringKeepNulls(m, ["|"], []);
          llCreateKeyValue(llList2String(a, 0), llList2String(a, 1));
        }
        dataserver(key q, string d) { got += [d]; }
      }
    `,
    experience,
  })
  s.start()
  return s
}

function create(s: Awaited<ReturnType<typeof driven>>, k: string, v: string) {
  s.fire('link_message', { sender_num: 1, num: 0, str: `${k}|${v}`, id: NULL_KEY })
}
