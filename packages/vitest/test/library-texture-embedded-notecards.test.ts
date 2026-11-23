import { describe, it, expect } from 'vitest'
import { loadLinkset } from '../src/index.js'
import { EOF, InventoryType, makeInventoryItem, NULL_KEY } from '@rezless/vm'

// In-world probes for this file: Aditi, SLua Tideland, Mono and SLua, 2026-11-23. The texture is the
// Library's Wood/Cherry, copied into the avatar's inventory and dropped into a new box. The notecards
// were saved with an embedded item: "nc emb" holds that texture, "nc emb2" holds another notecard.

const PLYWOOD = '89556747-24cb-43ed-920b-47caed15465f'
const CHERRY = 'a0ce8c4d-74d1-a38c-53c0-0819c24b32b4'
const TEXTURE = 'probe Cherry'
const TEXT = ['first line', 'second X here', 'third foo', '', 'last']
const DEBUG = 2147483647

const texture = () => makeInventoryItem({ name: TEXTURE, type: InventoryType.TEXTURE, key: CHERRY })
const notecard = (name: string, hasEmbeddedItems: boolean) =>
  makeInventoryItem({ name, type: InventoryType.NOTECARD, notecardLines: TEXT, hasEmbeddedItems })

async function run(source: string, language: 'lsl' | 'slua', inventory = [texture(), notecard('emb', true), notecard('plain', false)]) {
  const filename = language === 'slua' ? 'p.luau' : 'p.lsl'
  const { scripts } = await loadLinkset({
    prims: [{ inventory, scripts: [{ source: { source, filename }, name: 'p', ...(language === 'slua' ? { language } : {}) }] }],
  })
  const p = scripts['p']!
  p.start()
  p.advanceTime(5000)
  return p
}

const said = (p: Awaited<ReturnType<typeof run>>, channel = 1) => p.chat.filter((c) => c.channel === channel).map((c) => c.text)

describe('llGetTexture on a Library texture held in the prim', () => {
  // https://wiki.secondlife.com/wiki/LlGetTexture: "If the texture is in the prim's inventory, the
  // return value is the inventory name, else the returned value is the texture UUID".
  it('returns the item name for every face showing its asset, and the key elsewhere', async () => {
    // In-world: a copy of the Library's Cherry in the prim has owner and next-owner masks
    // 2147483647 and llGetInventoryKey gives its asset key. Face 3 was set to the asset from the
    // avatar's inventory before the item went in; ll.GetTexture(3) and {PRIM_TEXTURE, 3} still give
    // the item's name, and faces 0-2, 4 and 5 give plywood's key. After llSetTexture(name, 1) and
    // {PRIM_TEXTURE, 2, name, ...}: both faces give the name.
    const p = await run(
      `default { state_entry() {
        llSetPrimitiveParams([PRIM_TEXTURE, 3, "${CHERRY}", <1,1,0>, ZERO_VECTOR, 0.0]);
        llSay(1, (string)llGetInventoryKey("${TEXTURE}"));
        llSay(1, llGetTexture(0) + "|" + llGetTexture(3) + "|" + llList2String(llGetPrimitiveParams([PRIM_TEXTURE, 3]), 0));
        llSetTexture("${TEXTURE}", 1);
        llSetPrimitiveParams([PRIM_TEXTURE, 2, "${TEXTURE}", <1,1,0>, ZERO_VECTOR, 0.0]);
        llSay(1, llGetTexture(1) + "|" + llGetTexture(2));
      } }`,
      'lsl',
    )
    expect(said(p)).toEqual([CHERRY, `${PLYWOOD}|${TEXTURE}|${TEXTURE}`, `${TEXTURE}|${TEXTURE}`])
  })

  it('types the name as a string and a key as a uuid in SLua', async () => {
    // In-world: ll.GetTexture(3) and {PRIM_TEXTURE, 3} -> string, the name; ll.GetTexture(0) ->
    // uuid, plywood; ll.GetInventoryKey(name) -> uuid
    const p = await run(
      `ll.SetPrimitiveParams({PRIM_TEXTURE, 3, "${CHERRY}", vector(1, 1, 0), vector(0, 0, 0), 0})
      local function k(v) return typeof(v) .. ":" .. tostring(v) end
      ll.Say(1, k(ll.GetTexture(3)) .. "|" .. k(ll.GetPrimitiveParams({PRIM_TEXTURE, 3})[1]) .. "|" .. k(ll.GetTexture(0)) .. "|" .. k(ll.GetInventoryKey("${TEXTURE}")))`,
      'slua',
    )
    expect(said(p)).toEqual([`string:${TEXTURE}|string:${TEXTURE}|uuid:${PLYWOOD}|uuid:${CHERRY}`])
  })

  it('puts every face showing the asset back to plywood when the item is removed', async () => {
    // In-world: after llRemoveInventory(name), ll.GetTexture on faces 1, 2 (set by name) and 3 (set
    // by key before the item went in) -> plywood's key, in LSL and SLua
    const p = await run(
      `default { state_entry() {
        llSetPrimitiveParams([PRIM_TEXTURE, 3, "${CHERRY}", <1,1,0>, ZERO_VECTOR, 0.0]);
        llSetTexture("${TEXTURE}", 1);
        llRemoveInventory("${TEXTURE}");
        llSay(1, llGetTexture(1) + "|" + llGetTexture(3));
      } }`,
      'lsl',
    )
    expect(said(p)).toEqual([`${PLYWOOD}|${PLYWOOD}`])
  })
})

describe('a notecard with embedded items', () => {
  // https://wiki.secondlife.com/wiki/LlGetNotecardLine: a notecard with embedded inventory items
  // returns EOF regardless of the line requested. https://wiki.secondlife.com/wiki/LlFindNotecardTextSync:
  // such a notecard returns an empty list.
  const reads = (name: string) => `
    list asked;
    default {
      state_entry() {
        asked = [llGetNumberOfNotecardLines("${name}"), "count", llGetNotecardLine("${name}", 0), "line0",
          llGetNotecardLine("${name}", 4), "line4", llGetNotecardLine("${name}", -1), "line-1",
          llFindNotecardTextCount("${name}", "o", []), "fcount"];
        llSay(1, "sync " + llGetNotecardLineSync("${name}", 0) + "|" + llGetNotecardLineSync("${name}", 99));
        llSay(1, "find " + llList2CSV(llFindNotecardTextSync("${name}", "o", 0, 0, [])));
      }
      dataserver(key q, string d) { llSay(1, llList2String(asked, llListFindList(asked, [q]) + 1) + " " + d); }
    }`

  it('reads as no lines: a count of 0, EOF for every line and no matches', async () => {
    // In-world, "nc emb" (text "first line / second <item> here / third foo / / last"):
    // llGetNumberOfNotecardLines -> "0"; llGetNotecardLine 0..4, 99 and -1 -> EOF;
    // llFindNotecardTextCount("o") -> "0". Once read, llGetNotecardLineSync 0..4 and 99 -> EOF, and
    // llFindNotecardTextSync("o") and (".", 0, 3) -> []. "nc emb2", holding a notecard, gave the same.
    const p = await run(reads('emb'), 'lsl')
    expect(said(p)).toEqual([`sync ${EOF}|${EOF}`, 'find ', 'count 0', `line0 ${EOF}`, `line4 ${EOF}`, `line-1 ${EOF}`, 'fcount 0'])
  })

  it('reads the same text without embedded items line by line', async () => {
    // In-world: "nc plain", the same text with X for the item: count "5", lines as written,
    // llFindNotecardTextCount("o") -> "3", llFindNotecardTextSync("o") -> [1,3,1, 2,7,1, 2,8,1]
    const p = await run(reads('plain'), 'lsl')
    expect(said(p)).toEqual([
      `sync first line|${EOF}`, 'find 1, 3, 1, 2, 7, 1, 2, 8, 1', 'count 5', 'line0 first line', 'line4 last', `line-1 ${EOF}`, 'fcount 3',
    ])
  })

  it('still reports an invalid pattern', async () => {
    // In-world: llFindNotecardTextSync("nc emb", "(", 0, 0, []) -> [] and llFindNotecardTextCount
    // ("nc emb", "(", []) -> NULL_KEY with no event, each saying
    // Regex error: Mismatched '(' and ')' in "(" at position 1
    const p = await run(
      `default {
        state_entry() {
          llSay(1, (string)llGetListLength(llFindNotecardTextSync("emb", "(", 0, 0, [])));
          llSay(1, (string)llFindNotecardTextCount("emb", "(", []));
        }
        dataserver(key q, string d) { llSay(1, "event " + d); }
      }`,
      'lsl',
    )
    expect(said(p)).toEqual(['0', NULL_KEY])
    expect(said(p, DEBUG)).toEqual([`Regex error: Mismatched '(' and ')' in "(" at position 1`, `Regex error: Mismatched '(' and ')' in "(" at position 1`])
  })

  it('counts a pattern that matches empty text once, while the sync search finds nothing', async () => {
    // In-world: on "nc emb", llFindNotecardTextCount with "", "^", "$", ".*", "\A" and "x*" -> "1"
    // each; once read, llFindNotecardTextSync with each of them -> []
    const patterns = ['', '^', '$', '.*', '\\\\A', 'x*']
    const p = await run(
      `list asked;
      default {
        state_entry() {
          ${patterns.map((pat) => `asked += [llFindNotecardTextCount("emb", "${pat}", []), "${pat}"];`).join('\n')}
          ${patterns.map((pat) => `llSay(1, "sync ${pat} " + (string)llGetListLength(llFindNotecardTextSync("emb", "${pat}", 0, 0, [])));`).join('\n')}
        }
        dataserver(key q, string d) { llSay(1, "count " + llList2String(asked, llListFindList(asked, [q]) + 1) + " " + d); }
      }`,
      'lsl',
    )
    const shown = ['', '^', '$', '.*', '\\A', 'x*']
    expect(said(p)).toEqual([...shown.map((pat) => `sync ${pat} 0`), ...shown.map((pat) => `count ${pat} 1`)])
  })

  it('reads as no lines when the item gives only the flag and no text', async () => {
    // The item stands for the same measured notecard; its text doesn't matter to a script.
    const bare = makeInventoryItem({ name: 'emb', type: InventoryType.NOTECARD, hasEmbeddedItems: true })
    const p = await run(reads('emb'), 'lsl', [bare])
    expect(said(p)).toEqual([`sync ${EOF}|${EOF}`, 'find ', 'count 0', `line0 ${EOF}`, `line4 ${EOF}`, `line-1 ${EOF}`, 'fcount 0'])
    expect(said(p, DEBUG)).toEqual([])
  })

  it('reads as no lines in SLua too', async () => {
    // In-world, SLua: ll.GetNumberOfNotecardLines -> "0"; ll.GetNotecardLine 1..5 and 100 -> EOF;
    // ll.FindNotecardTextCount("o") -> "0"; once read, ll.GetNotecardLineSync 1..5 and 100 -> EOF
    // and ll.FindNotecardTextSync("o", 0, 0) -> {}
    const p = await run(
      `local asked = {}
      asked[tostring(ll.GetNumberOfNotecardLines("emb"))] = "count"
      asked[tostring(ll.GetNotecardLine("emb", 1))] = "line1"
      asked[tostring(ll.FindNotecardTextCount("emb", "o", {}))] = "fcount"
      ll.Say(1, tostring(ll.GetNotecardLineSync("emb", 1) == EOF) .. " " .. #ll.FindNotecardTextSync("emb", "o", 0, 0, {}))
      LLEvents:on("dataserver", function(q, d) ll.Say(1, asked[tostring(q)] .. " " .. d) end)`,
      'slua',
    )
    expect(said(p)).toEqual(['true 0', 'count 0', `line1 ${EOF}`, 'fcount 0'])
  })
})

describe('SLua ll.FindNotecardTextSync', () => {
  it('counts start from 0 and returns 1-based lines and columns', async () => {
    // In-world, SLua, on "nc plain" (3 matches of "o"): start 0 -> {2,4,1, 3,8,1, 3,9,1}; start 1 ->
    // {3,8,1, 3,9,1}; start 2 -> {3,9,1}; start 3 and 4 -> {}; start -1 -> all three. Start 1 with
    // count 1 or -1 -> {3,8,1}, with count 2 -> {3,8,1, 3,9,1}. llcompat.FindNotecardTextSync with
    // start 0, 1, 2 -> the same matches as LSL gives: {1,3,1, 2,7,1, 2,8,1}, {2,7,1, 2,8,1}, {2,8,1}.
    const p = await run(
      `local function show(r) return table.concat(r, ",") end
      for _, st in ipairs({0, 1, 2, 3, -1}) do ll.Say(1, st .. ": " .. show(ll.FindNotecardTextSync("plain", "o", st, 0, {}))) end
      ll.Say(1, "count 1: " .. show(ll.FindNotecardTextSync("plain", "o", 1, 1, {})))
      ll.Say(1, "count -1: " .. show(ll.FindNotecardTextSync("plain", "o", 1, -1, {})))
      ll.Say(1, "count 2: " .. show(ll.FindNotecardTextSync("plain", "o", 1, 2, {})))
      for _, st in ipairs({0, 1, 2}) do ll.Say(1, "compat " .. st .. ": " .. show(llcompat.FindNotecardTextSync("plain", "o", st, 0, {}))) end`,
      'slua',
    )
    expect(said(p)).toEqual([
      '0: 2,4,1,3,8,1,3,9,1', '1: 3,8,1,3,9,1', '2: 3,9,1', '3: ', '-1: 2,4,1,3,8,1,3,9,1',
      'count 1: 3,8,1', 'count -1: 3,8,1', 'count 2: 3,8,1,3,9,1',
      'compat 0: 1,3,1,2,7,1,2,8,1', 'compat 1: 2,7,1,2,8,1', 'compat 2: 2,8,1',
    ])
  })

  it('takes a boolean, a fraction or a numeric string for start, and refuses other types', async () => {
    // In-world, SLua, on "nc plain": start true, 1.5, 1.9, "1", "1.7" and 2^32+1 -> skip one match;
    // false, -0.5 and 2^31 -> all three; with count true -> one match. "abc", a vector, a uuid and nil
    // raise invalid argument #3 to 'FindNotecardTextSync' (number expected, got <type>).
    // llcompat.FindNotecardTextSync takes each listed start value the same way, with LSL's 0-based results.
    const p = await run(
      `local function show(r) return table.concat(r, ",") end
      local vals = {{"true", true}, {"false", false}, {"1.5", 1.5}, {"1.9", 1.9}, {"-0.5", -0.5}, {"'1'", "1"}, {"'1.7'", "1.7"},
        {"2^31", 2 ^ 31}, {"2^32+1", 2 ^ 32 + 1}, {"'abc'", "abc"}, {"vector", vector(1, 0, 0)}, {"uuid", touuid("${CHERRY}")}}
      for _, f in ipairs({{"ll", ll.FindNotecardTextSync}, {"compat", llcompat.FindNotecardTextSync}}) do
        for _, v in ipairs(vals) do
          local ok, r = pcall(f[2], "plain", "o", v[2], 0, {})
          ll.Say(1, f[1] .. " " .. v[1] .. ": " .. (ok and show(r) or tostring(r)))
        end
      end
      local ok, r = pcall(ll.FindNotecardTextSync, "plain", "o", nil, 0, {})
      ll.Say(1, "ll nil: " .. tostring(r))
      ll.Say(1, "ll true, true: " .. show(ll.FindNotecardTextSync("plain", "o", true, true, {})))`,
      'slua',
    )
    const err = (type: string) => `invalid argument #3 to 'FindNotecardTextSync' (number expected, got ${type})`
    const skip = { ll: '3,8,1,3,9,1', compat: '2,7,1,2,8,1' }
    const all = { ll: '2,4,1,3,8,1,3,9,1', compat: '1,3,1,2,7,1,2,8,1' }
    const expected = (['ll', 'compat'] as const).flatMap((f) => [
      `${f} true: ${skip[f]}`, `${f} false: ${all[f]}`, `${f} 1.5: ${skip[f]}`, `${f} 1.9: ${skip[f]}`, `${f} -0.5: ${all[f]}`,
      `${f} '1': ${skip[f]}`, `${f} '1.7': ${skip[f]}`, `${f} 2^31: ${all[f]}`, `${f} 2^32+1: ${skip[f]}`,
      `${f} 'abc': ${err('string')}`, `${f} vector: ${err('vector')}`, `${f} uuid: ${err('uuid')}`,
    ])
    expect(said(p)).toEqual([...expected, `ll nil: ${err('nil')}`, 'll true, true: 3,8,1'])
  })
})
