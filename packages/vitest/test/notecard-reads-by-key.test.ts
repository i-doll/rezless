import { describe, it, expect } from 'vitest'
import { loadLinkset, World } from '../src/index.js'
import { EOF, NAK, InventoryType, makeInventoryItem, NULL_KEY } from '@rezless/vm'

// https://wiki.secondlife.com/wiki/LlGetNotecardLine: "name - a notecard in the inventory of the prim
// this script is used in or a UUID of a notecard". The same holds for llGetNumberOfNotecardLines and
// llGetNotecardLineSync.
// In-world probes for this file: Aditi, SLua Tideland, Mono and SLua, 2026-11-23. Each probe prim held
// a plain notecard ("alpha / beta apple / gamma"), a notecard saved with an embedded notecard, a
// notecard the script removed before reading it by key, and a stopped script. Each key went through
// llGetNotecardLineSync, llGetNumberOfNotecardLines, llGetNotecardLine 0, 1 and 99, the sync read again,
// llFindNotecardTextCount and llFindNotecardTextSync, three seconds apart.

const NC_KEY = 'b55a2053-c6bc-5e6d-0193-553cdf8ae12e'
const EMB_KEY = '6f3b8a51-2b8e-4c9e-9c1d-1f7b4f0e2a10'
const GONE_KEY = '0b0b6c55-6f3e-4a51-a3f1-7c1a2e9f5d42'
const SCRIPT_KEY = 'a0ce8c4d-74d1-a38c-53c0-0819c24b32b4'
const LINES = ['alpha', 'beta apple', 'gamma']
const DEBUG = 2147483647
const OWNER = '7d1f3a2b-9c4e-4f6a-8b2d-5e0c1a9f3b7d'

const notecard = (name: string, key: string, notecardLines: ReadonlyArray<string>, hasEmbeddedItems = false) =>
  makeInventoryItem({ name, type: InventoryType.NOTECARD, key, notecardLines, hasEmbeddedItems })

const inventory = () => [
  notecard('nc', NC_KEY, LINES),
  notecard('emb', EMB_KEY, ['first a', 'X b', 'last a'], true),
  notecard('gone', GONE_KEY, ['gone a', 'second']),
  makeInventoryItem({ name: 'dummy', type: InventoryType.SCRIPT, key: SCRIPT_KEY }),
]

async function run(body: string, items = inventory(), otherObject?: ReadonlyArray<ReturnType<typeof notecard>>) {
  const source = `
    list asked;
    ask(key q, string label) { asked += [q, label]; }
    sync(string label, string k) {
      llSay(1, label + " sync " + llGetNotecardLineSync(k, 0) + "|" + llGetNotecardLineSync(k, 1) + "|" + llGetNotecardLineSync(k, 99));
    }
    reads(string label, string k) {
      ask(llGetNumberOfNotecardLines(k), label + " count");
      ask(llGetNotecardLine(k, 0), label + " line0");
      ask(llGetNotecardLine(k, 1), label + " line1");
      ask(llGetNotecardLine(k, 99), label + " line99");
      ask(llFindNotecardTextCount(k, "a", []), label + " fcount");
    }
    default {
      state_entry() { ${body} }
      dataserver(key q, string d) {
        integer i = llListFindList(asked, [q]);
        if (i >= 0) llSay(1, llList2String(asked, i + 1) + " " + d);
      }
    }`
  const world = otherObject && new World()
  if (world) {
    world.addRegion('Here', { x: 0, y: 0 })
    await loadLinkset({ world, region: 'Here', owner: OWNER, prims: [{ inventory: [...otherObject!] }] })
  }
  const { scripts } = await loadLinkset({
    ...(world ? { world, region: 'Here' } : {}),
    owner: OWNER,
    prims: [{ inventory: items, scripts: [{ source: { source, filename: 'p.lsl' }, name: 'p' }] }],
  })
  const p = scripts['p']!
  p.start()
  p.advanceTime(5000)
  return p
}

const said = (p: Awaited<ReturnType<typeof run>>, channel = 1) => p.chat.filter((c) => c.channel === channel).map((c) => c.text)

describe('notecard line reads given an asset key', () => {
  it('read a notecard in the prim by its key, in any case', async () => {
    // In-world: the key upper-cased and as given -> count "3", lines 0 and 1 as written, line 99 EOF,
    // with no error. The sync reads gave NAK before the first read and the lines after it; rezless
    // holds a notecard in the prim as cached from the start, by name or by key.
    const p = await run(`
      reads("up", llToUpper("${NC_KEY}"));
      reads("key", "${NC_KEY}");
      sync("key", "${NC_KEY}");`)
    expect(said(p)).toEqual([
      `key sync alpha|beta apple|${EOF}`,
      'up count 3', 'up line0 alpha', 'up line1 beta apple', `up line99 ${EOF}`, 'up fcount 6',
      'key count 3', 'key line0 alpha', 'key line1 beta apple', `key line99 ${EOF}`, 'key fcount 6',
    ])
    expect(said(p, DEBUG)).toEqual([])
  })

  it('read a notecard with embedded items by its key as no lines', async () => {
    // In-world: count "0", lines 0, 1 and 99 EOF, llFindNotecardTextCount("a") "0"; once read, the sync
    // reads give EOF and llFindNotecardTextSync gives [] (rezless holds it as cached from the start).
    const p = await run(`
      reads("emb", "${EMB_KEY}");
      sync("emb", "${EMB_KEY}");
      llSay(1, "emb fsync [" + llList2CSV(llFindNotecardTextSync("${EMB_KEY}", "a", 0, 0, [])) + "]");`)
    expect(said(p)).toEqual([
      `emb sync ${EOF}|${EOF}|${EOF}`, 'emb fsync []',
      'emb count 0', `emb line0 ${EOF}`, `emb line1 ${EOF}`, `emb line99 ${EOF}`, 'emb fcount 0',
    ])
  })

  it('read a notecard by its key after it has left the prim, caching it for the sync reads', async () => {
    // In-world: after llRemoveInventory, the removed notecard's key gives NAK from
    // llGetNotecardLineSync, then count "2", "gone a", "second", EOF and a find count of "1"; once
    // read, the sync reads give "gone a|second|EOF" and llFindNotecardTextSync("a") [0, 5, 1].
    const p = await run(`
      llRemoveInventory("gone");
      llSay(1, "before " + llGetNotecardLineSync("${GONE_KEY}", 0) + " [" + llList2CSV(llFindNotecardTextSync("${GONE_KEY}", "a", 0, 0, [])) + "]");
      reads("gone", "${GONE_KEY}");
      llSetTimerEvent(1);
    }
    timer() {
      llSetTimerEvent(0);
      sync("gone", "${GONE_KEY}");
      llSay(1, "gone fsync [" + llList2CSV(llFindNotecardTextSync("${GONE_KEY}", "a", 0, 0, [])) + "]");`)
    expect(said(p)).toEqual([
      `before ${NAK} [${NAK}]`,
      'gone count 2', 'gone line0 gone a', 'gone line1 second', `gone line99 ${EOF}`, 'gone fcount 1',
      `gone sync gone a|second|${EOF}`, 'gone fsync [0, 5, 1]',
    ])
    expect(said(p, DEBUG)).toEqual([])
  })

  it('read a notecard held by another object by its key, caching it for the sync reads', async () => {
    // In-world: a notecard ("far a / far two") in another object, read by the key its save gave it:
    // llGetNotecardLineSync NAK and llFindNotecardTextSync [NAK] at first, then count "2", "far a" and
    // "far two"; once read, the sync reads gave the lines and llFindNotecardTextSync("a") matches.
    const p = await run(`
      llSay(1, "before " + llGetNotecardLineSync("${GONE_KEY}", 0) + " [" + llList2CSV(llFindNotecardTextSync("${GONE_KEY}", "a", 0, 0, [])) + "]");
      reads("far", "${GONE_KEY}");
      llSetTimerEvent(1);
    }
    timer() {
      llSetTimerEvent(0);
      sync("far", "${GONE_KEY}");`, inventory().filter((it) => it.name !== 'gone'), [notecard('gone', GONE_KEY, ['gone a', 'second'])])
    expect(said(p)).toEqual([
      `before ${NAK} [${NAK}]`,
      'far count 2', 'far line0 gone a', 'far line1 second', `far line99 ${EOF}`, 'far fcount 1',
      `far sync gone a|second|${EOF}`,
    ])
  })

  it('cache a notecard outside the prim after llFindNotecardTextCount alone', async () => {
    // In-world: a removed notecard read only by llFindNotecardTextCount ("2") then gave its first line
    // to llGetNotecardLineSync and its matches to llFindNotecardTextSync; another removed notecard that
    // nothing read still gave NAK.
    const p = await run(`
      llRemoveInventory("gone");
      llRemoveInventory("nc");
      ask(llFindNotecardTextCount("${GONE_KEY}", "a", []), "fcount");
      llSetTimerEvent(1);
    }
    timer() {
      llSetTimerEvent(0);
      llSay(1, llGetNotecardLineSync("${GONE_KEY}", 0) + " [" + llList2CSV(llFindNotecardTextSync("${GONE_KEY}", "a", 0, 0, [])) + "]");
      llSay(1, "unread " + llGetNotecardLineSync("${NC_KEY}", 0));`)
    expect(said(p)).toEqual(['fcount 1', 'gone a [0, 5, 1]', `unread ${NAK}`])
  })

  it('keep a notecard read by name cached for its key after it leaves the prim', async () => {
    // In-world, the cache holds assets: a read by one spelling of the key made the sync read of the
    // other spelling give the line, and a dataserver read by name made the sync read by that name
    // give the line where it gave NAK before.
    const p = await run(`
      ask(llGetNotecardLine("gone", 0), "by name");
      llSetTimerEvent(1);
    }
    timer() {
      llSetTimerEvent(0);
      llRemoveInventory("gone");
      llSay(1, "sync " + llGetNotecardLineSync("${GONE_KEY}", 1));`)
    expect(said(p)).toEqual(['by name gone a', 'sync second'])
  })

  it.each([
    ['a script in the prim', SCRIPT_KEY],
    ['a key no asset has', 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b'],
    ['the prim', 'llGetKey()'],
    ['the owner', 'llGetOwner()'],
  ])('deliver EOF for the key of %s, with NAK from the sync reads and no error', async (_, k) => {
    // In-world: the keys of a stopped script in the prim, of llGenerateKey(), of the prim and of the owner each
    // gave EOF from llGetNumberOfNotecardLines, llGetNotecardLine and llFindNotecardTextCount, NAK from
    // llGetNotecardLineSync before and after those reads and [NAK] from llFindNotecardTextSync, with
    // nothing on DEBUG_CHANNEL.
    const expr = k.endsWith('()') ? `(string)${k}` : `"${k}"`
    const p = await run(`
      reads("k", ${expr});
      sync("k", ${expr});
      llSay(1, "k fsync [" + llList2CSV(llFindNotecardTextSync(${expr}, "a", 0, 0, [])) + "]");`)
    expect(said(p)).toEqual([
      `k sync ${NAK}|${NAK}|${NAK}`, `k fsync [${NAK}]`,
      `k count ${EOF}`, `k line0 ${EOF}`, `k line1 ${EOF}`, `k line99 ${EOF}`, `k fcount ${EOF}`,
    ])
    expect(said(p, DEBUG)).toEqual([])
  })

  it('treat NULL_KEY as a missing notecard name', async () => {
    // In-world: each read of NULL_KEY says "Could not find notecard '00000000-...'." on DEBUG_CHANNEL;
    // the line reads return a key with no event, llFindNotecardTextCount returns NULL_KEY and the sync
    // reads give NAK and [NAK].
    const p = await run(`
      key q = llGetNotecardLine(NULL_KEY, 0);
      llSay(1, "line " + (string)(q != NULL_KEY));
      llSay(1, "fcount " + (string)llFindNotecardTextCount(NULL_KEY, "a", []));
      llSay(1, "sync " + llGetNotecardLineSync(NULL_KEY, 0));
      llSay(1, "fsync [" + llList2CSV(llFindNotecardTextSync(NULL_KEY, "a", 0, 0, [])) + "]");
      ask(q, "event");`)
    expect(said(p)).toEqual(['line 1', `fcount ${NULL_KEY}`, `sync ${NAK}`, `fsync [${NAK}]`])
    expect(said(p, DEBUG)).toEqual(Array(4).fill(`Could not find notecard '${NULL_KEY}'.`))
  })

  it('read an item named like a key by its name, ahead of the notecard with that key', async () => {
    // In-world: a notecard named as another notecard's key ("decoy one" .. "decoy four") read as
    // itself: count "4", line 0 "decoy one", line 3 "decoy four", find count "4"; the key upper-cased
    // matched no name and read the other notecard's "alpha".
    const items = [notecard('nc', NC_KEY, LINES), notecard(NC_KEY, '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', ['decoy one', 'decoy two', 'decoy three', 'decoy four'])]
    const p = await run(`
      ask(llGetNumberOfNotecardLines("${NC_KEY}"), "count");
      ask(llGetNotecardLine("${NC_KEY}", 0), "line0");
      ask(llGetNotecardLine("${NC_KEY}", 3), "line3");
      ask(llFindNotecardTextCount("${NC_KEY}", "decoy", []), "fcount");
      ask(llGetNotecardLine(llToUpper("${NC_KEY}"), 0), "up line0");`, items)
    expect(said(p)).toEqual(['count 4', 'line0 decoy one', 'line3 decoy four', 'fcount 4', 'up line0 alpha'])
  })
})

describe('SLua notecard line reads given an asset key', () => {
  it('take the key as a string or a uuid and count lines from 1', async () => {
    // In-world, SLua: the key upper-cased, as a uuid and as a string -> count "3", ll.GetNotecardLine 1
    // "alpha", 2 "beta apple", 100 EOF; once read, ll.GetNotecardLineSync the same. A script's key and
    // llGenerateKey() -> EOF from the dataserver reads and NAK from the sync read, with no error.
    const source = `
      local asked = {}
      local function ask(q, label) asked[tostring(q)] = label end
      local k = ll.GetInventoryKey("nc")
      for label, key in pairs({up = string.upper(tostring(k)), uuid = k}) do
        ask(ll.GetNumberOfNotecardLines(key), label .. " count")
        ask(ll.GetNotecardLine(key, 1), label .. " line1")
        ask(ll.GetNotecardLine(key, 100), label .. " line100")
      end
      ask(ll.GetNotecardLine("${SCRIPT_KEY}", 1), "scr line1")
      ll.Say(1, "sync " .. ll.GetNotecardLineSync(tostring(k), 2) .. " " .. tostring(ll.GetNotecardLineSync("${SCRIPT_KEY}", 1) == NAK))
      LLEvents:on("dataserver", function(q, d) ll.Say(1, asked[tostring(q)] .. " " .. d) end)`
    const { scripts } = await loadLinkset({
      prims: [{ inventory: inventory(), scripts: [{ source: { source, filename: 'p.luau' }, name: 'p', language: 'slua' }] }],
    })
    const p = scripts['p']!
    p.start()
    p.advanceTime(5000)
    expect(said(p).slice(0, 1)).toEqual(['sync beta apple true'])
    expect(said(p).slice(1).sort()).toEqual(
      ['up count 3', 'up line1 alpha', `up line100 ${EOF}`, 'uuid count 3', 'uuid line1 alpha', `uuid line100 ${EOF}`, `scr line1 ${EOF}`].sort(),
    )
    expect(said(p, DEBUG)).toEqual([])
  })
})
