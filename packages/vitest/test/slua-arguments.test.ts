import { describe, it, expect } from 'vitest'
import { loadScript, makeInventoryItem, InventoryType } from '../src/index.js'

// Every "In-world" result below was measured on the Aditi beta grid, region
// SLua Tideland, on 2026-11-13: one SLua script called each case under pcall
// and said the result, or the error text, on a channel.

const U = '5748decc-f629-461c-9a36-a35a221fe21f'
const PLYWOOD = '89556747-24cb-43ed-920b-47caed15465f'
const NULL = '00000000-0000-0000-0000-000000000000'

const PRELUDE = `
  local U = touuid("${U}")
  local V = vector(1, 2, 3)
  local Q = quaternion(0, 0, 0, 1)
  local function show(v)
    if typeof(v) == "table" then
      local parts = {}
      for i = 1, #v do parts[i] = typeof(v[i]) .. ":" .. tostring(v[i]) end
      return "{" .. table.concat(parts, " | ") .. "}"
    end
    return typeof(v) .. ":" .. tostring(v)
  end
  local function t(f, ...)
    local r = table.pack(pcall(f, ...))
    if not r[1] then return "!! " .. tostring(r[2]) end
    return r.n == 1 and "(nothing)" or show(r[2])
  end
`

/** Run each `t(...)` expression (see PRELUDE) and return what it gave, in order. */
async function results(cases: ReadonlyArray<string>, setup = '', prepare?: (s: Awaited<ReturnType<typeof loadScript>>) => void) {
  const body = cases.map((c) => `ll.Say(7777, ${c})`).join('\n')
  const s = await loadScript({ source: `${PRELUDE}\n${setup}\n${body}`, language: 'slua', filename: 'test.luau' })
  prepare?.(s)
  s.start()
  // An error raised inside a Lua function starts with where; the cases here are about the rest.
  return s.chat.filter((c) => c.channel === 7777).map((c) => c.text.replace(/^!! lua_script:\d+: /, '!! '))
}

async function expectResults(cases: ReadonlyArray<readonly [string, string]>, setup = '') {
  const got = await results(cases.map(([c]) => c), setup)
  expect(Object.fromEntries(cases.map(([c], i) => [c, got[i]]))).toEqual(Object.fromEntries(cases))
}

describe('SLua: too few and too many arguments', () => {
  it('counts the arguments before it looks at any of them', async () => {
    await expectResults([
      // In-world: ll.PlaySound() -> Fewer arguments than expected, 0 < 2
      ['t(ll.PlaySound)', '!! Fewer arguments than expected, 0 < 2'],
      // In-world: ll.PlaySound("") -> 1 < 2; ll.SetText("a", V) -> 2 < 3
      ['t(ll.PlaySound, "")', '!! Fewer arguments than expected, 1 < 2'],
      ['t(ll.SetText, "a", V)', '!! Fewer arguments than expected, 2 < 3'],
      ['t(ll.MessageLinked, LINK_THIS, 1, "a")', '!! Fewer arguments than expected, 3 < 4'],
      // In-world: ll.PlaySound(5), ll.Say("x"), ll.SetText(5) -> the count error, not the type error
      ['t(ll.PlaySound, 5)', '!! Fewer arguments than expected, 1 < 2'],
      ['t(ll.Say, "x")', '!! Fewer arguments than expected, 1 < 2'],
      ['t(ll.SetText, 5)', '!! Fewer arguments than expected, 1 < 3'],
      // In-world: ll.GetSubString("abc", 0) -> 2 < 3, not the 0-index error
      ['t(ll.GetSubString, "abc", 0)', '!! Fewer arguments than expected, 2 < 3'],
      // In-world: llcompat.PlaySound(""), llcompat.Say(7778), llcompat.GetSubString("abc") -> the same wording
      ['t(llcompat.PlaySound, "")', '!! Fewer arguments than expected, 1 < 2'],
      ['t(llcompat.Say, 7778)', '!! Fewer arguments than expected, 1 < 2'],
      ['t(llcompat.GetSubString, "abc")', '!! Fewer arguments than expected, 1 < 3'],
    ])
  })

  it('says so whatever the parameter types are', async () => {
    // In-world: each of these 92 functions with no arguments, through ll and through llcompat
    // -> Fewer arguments than expected, 0 < N
    const functions: Array<[string, number]> = [
      ['PlaySound', 2], ['OwnerSay', 1], ['Say', 2], ['SetText', 3], ['Sleep', 1], ['SetPos', 1], ['Key2Name', 1],
      ['GetSubString', 3], ['StringLength', 1], ['MessageLinked', 4], ['Dialog', 4], ['GetInventoryName', 2],
      ['Frand', 1], ['SetAlpha', 2], ['Round', 1], ['VecMag', 1], ['VecNorm', 1], ['VecDist', 2], ['Rot2Euler', 1],
      ['Euler2Rot', 1], ['List2CSV', 1], ['CSV2List', 1], ['ParseString2List', 3], ['ParseStringKeepNulls', 3],
      ['ListFindList', 2], ['ListFindStrided', 5], ['ListSort', 3], ['ListRandomize', 2], ['List2ListStrided', 4],
      ['ListStatistics', 2], ['Char', 1], ['Ord', 2], ['StringTrim', 2], ['SubStringIndex', 2], ['InsertString', 3],
      ['DeleteSubString', 3], ['ReplaceSubString', 4], ['EscapeURL', 1], ['UnescapeURL', 1], ['Base64ToString', 1],
      ['StringToBase64', 1], ['IntegerToBase64', 1], ['Base64ToInteger', 1], ['MD5String', 2], ['SHA1String', 1],
      ['ModPow', 3], ['AxisAngle2Rot', 2], ['Rot2Fwd', 1], ['RotBetween', 2], ['AngleBetween', 2], ['List2Json', 2],
      ['Json2List', 1], ['JsonGetValue', 2], ['JsonSetValue', 3], ['JsonValueType', 2], ['GetEnv', 1],
      ['Name2Key', 1], ['GetObjectDetails', 2], ['GetPrimitiveParams', 1], ['SetPrimitiveParams', 1],
      ['GetLinkPrimitiveParams', 2], ['SetLinkPrimitiveParamsFast', 2], ['LinksetDataWrite', 2],
      ['LinksetDataRead', 1], ['GetTexture', 1], ['SetTexture', 2], ['GetOwnerKey', 1], ['GetLinkKey', 1],
      ['Listen', 4], ['ListenRemove', 1], ['GetAlpha', 1], ['SetColor', 2], ['SetScale', 1], ['SetRot', 1],
      ['GetInventoryKey', 1], ['GetInventoryType', 1], ['RegionSayTo', 3], ['Whisper', 2], ['Shout', 2],
      ['RegionSay', 2], ['SetObjectName', 1], ['SetObjectDesc', 1], ['GetAgentSize', 1], ['GetAgentInfo', 1],
      ['DetectedKey', 1], ['DetectedName', 1], ['ListSortStrided', 4], ['Linear2sRGB', 1], ['sRGB2Linear', 1],
      ['GetDisplayName', 1], ['RequestAgentData', 2], ['HTTPRequest', 3],
    ]
    for (const lib of ['ll', 'llcompat']) {
      await expectResults(functions.map(([name, n]) => [`t(${lib}.${name})`, `!! Fewer arguments than expected, 0 < ${n}`]))
    }
  })

  it('takes a nil that was passed as an argument', async () => {
    await expectResults([
      // In-world: ll.PlaySound(nil) -> Fewer arguments than expected, 1 < 2
      ['t(ll.PlaySound, nil)', '!! Fewer arguments than expected, 1 < 2'],
      // In-world: ll.PlaySound(nil, nil) -> invalid argument #1 to 'PlaySound' (string expected, got nil)
      ['t(ll.PlaySound, nil, nil)', "!! invalid argument #1 to 'PlaySound' (string expected, got nil)"],
      // In-world: ll.PlaySound("", nil) -> invalid argument #2 to 'PlaySound' (number expected, got nil)
      ['t(ll.PlaySound, "", nil)', "!! invalid argument #2 to 'PlaySound' (number expected, got nil)"],
      // In-world: ll.OwnerSay(nil) -> invalid argument #1 to 'OwnerSay' (string expected, got nil)
      ['t(ll.OwnerSay, nil)', "!! invalid argument #1 to 'OwnerSay' (string expected, got nil)"],
    ])
  })

  it('leaves the functions SLua runs in its own VM to their own wording', async () => {
    await expectResults([
      // In-world: ll.ToUpper() -> missing argument #1 to 'ToUpper' (string expected)
      ['t(ll.ToUpper)', "!! missing argument #1 to 'ToUpper' (string expected)"],
      // In-world: ll.Abs(), ll.Sin(), ll.Floor() -> missing argument #1 to '<name>' (number expected)
      ['t(ll.Abs)', "!! missing argument #1 to 'Abs' (number expected)"],
      ['t(ll.Sin)', "!! missing argument #1 to 'Sin' (number expected)"],
      ['t(ll.Floor)', "!! missing argument #1 to 'Floor' (number expected)"],
      // In-world: ll.Pow(2), llcompat.Pow(2) -> missing argument #2 to 'Pow' (number expected)
      ['t(ll.Pow, 2)', "!! missing argument #2 to 'Pow' (number expected)"],
      ['t(llcompat.Pow, 2)', "!! missing argument #2 to 'Pow' (number expected)"],
      // In-world: ll.GetListLength(), ll.List2String(), ll.GetListEntryType() -> missing argument #1 to '<name>' (table expected)
      ['t(ll.GetListLength)', "!! missing argument #1 to 'GetListLength' (table expected)"],
      ['t(ll.List2String)', "!! missing argument #1 to 'List2String' (table expected)"],
      ['t(ll.GetListEntryType)', "!! missing argument #1 to 'GetListEntryType' (table expected)"],
      // In-world: ll.DumpList2String({1}) -> missing argument #2 to 'DumpList2String' (string expected)
      ['t(ll.DumpList2String, {1})', "!! missing argument #2 to 'DumpList2String' (string expected)"],
      // In-world: ll.List2String({"a"}) -> missing argument #2 to 'List2String' (number expected)
      ['t(ll.List2String, {"a"})', "!! missing argument #2 to 'List2String' (number expected)"],
    ])
  })

  it('ignores arguments past the last parameter', async () => {
    await expectResults([
      // In-world: ll.OwnerSay("a", "b"), ll.Say(7778, "a", "b"), ll.Say(7778, "a", nil), ll.PlaySound(U, 0, 3) -> no error
      ['t(ll.OwnerSay, "a", "b")', '(nothing)'],
      ['t(ll.Say, 7778, "a", "b")', '(nothing)'],
      ['t(ll.Say, 7778, "a", nil)', '(nothing)'],
      ['t(ll.PlaySound, U, 0, 3)', '(nothing)'],
      // In-world: ll.GetSubString("abc", 1, 2, 3) -> "ab"; ll.StringLength("a", "b") -> 1
      ['t(ll.GetSubString, "abc", 1, 2, 3)', 'string:ab'],
      ['t(ll.StringLength, "a", "b")', 'number:1'],
      // In-world: ll.GetPos(1), ll.GetPos(nil), llcompat.GetPos(1) -> the position; ll.GetKey(1, 2, 3) -> the key
      ['typeof(ll.GetPos(1)) .. typeof(ll.GetPos(nil)) .. typeof(llcompat.GetPos(1)) .. typeof(ll.GetKey(1, 2, 3))', 'vectorvectorvectoruuid'],
      // In-world: ll.List2CSV({1}, 2) -> "1"
      ['t(ll.List2CSV, {1}, 2)', 'string:1'],
      // In-world: ll.ToUpper("a", "b") -> "A"; ll.Abs(-1, 2) -> 1; ll.Pow(2, 3, 4) -> 8; ll.GetListLength({}, 1) -> 0
      ['t(ll.ToUpper, "a", "b")', 'string:A'],
      ['t(ll.Abs, -1, 2)', 'number:1'],
      ['t(ll.Pow, 2, 3, 4)', 'number:8'],
      ['t(ll.GetListLength, {}, 1)', 'number:0'],
    ])
  })

  it('still checks the types when there are too many', async () => {
    await expectResults([
      // In-world: ll.PlaySound(5, "x", 3) -> invalid argument #1 to 'PlaySound' (string expected, got number)
      ['t(ll.PlaySound, 5, "x", 3)', "!! invalid argument #1 to 'PlaySound' (string expected, got number)"],
      // In-world: ll.OwnerSay(5, 6), llcompat.OwnerSay(5, 6) -> invalid argument #1 to 'OwnerSay' (string expected, got number)
      ['t(ll.OwnerSay, 5, 6)', "!! invalid argument #1 to 'OwnerSay' (string expected, got number)"],
      ['t(llcompat.OwnerSay, 5, 6)', "!! invalid argument #1 to 'OwnerSay' (string expected, got number)"],
    ])
  })
})

describe('SLua: booleans as arguments', () => {
  it('reads a boolean for an integer parameter as 1 or 0', async () => {
    await expectResults([
      // In-world: ll.IntegerToBase64(true) -> "AAAAAQ=="; (false) -> "AAAAAA=="; the same through llcompat
      ['t(ll.IntegerToBase64, true)', 'string:AAAAAQ=='],
      ['t(ll.IntegerToBase64, false)', 'string:AAAAAA=='],
      ['t(llcompat.IntegerToBase64, true)', 'string:AAAAAQ=='],
      ['t(llcompat.IntegerToBase64, false)', 'string:AAAAAA=='],
      // In-world: ll.Ord(ll.Char(true), 1) -> 1; #ll.Char(false) -> 0
      ['t(function() return ll.Ord(ll.Char(true), 1) end)', 'number:1'],
      ['t(function() return #ll.Char(false) end)', 'number:0'],
      // In-world: ll.ModPow(true, true, 5) -> 1; ll.StringTrim(" a ", true) -> "a " (STRING_TRIM_HEAD)
      ['t(ll.ModPow, true, true, 5)', 'number:1'],
      ['t(ll.StringTrim, " a ", true)', 'string:a '],
      // In-world: ll.MD5String("", true) -> 3558193cd9818af7fe4d2c2f5bd9d00f, the hash for nonce 1
      ['t(ll.MD5String, "", true)', 'string:3558193cd9818af7fe4d2c2f5bd9d00f'],
      ['t(ll.MD5String, "", 1)', 'string:3558193cd9818af7fe4d2c2f5bd9d00f'],
      // In-world: ll.GetInventoryName(true, 1) -> "" (type 1 is a sound; the prim held only the script)
      ['t(ll.GetInventoryName, true, 1)', 'string:'],
      // In-world: ll.SetTexture(U, true), then ll.GetTexture(1) and ll.GetTexture(true) -> uuid U (face 1 held plywood before)
      ['t(function() ll.SetTexture(U, true); return ll.GetTexture(1) end)', `uuid:${U}`],
      ['t(ll.GetTexture, true)', `uuid:${U}`],
      // In-world: ll.SetStatus(STATUS_PHANTOM, true), then ll.GetStatus(STATUS_PHANTOM) -> true (it was false);
      // ll.GetStatus(true) -> false (status 1 is STATUS_PHYSICS)
      ['t(function() ll.SetStatus(STATUS_PHANTOM, true); return ll.GetStatus(STATUS_PHANTOM) end)', 'boolean:true'],
      ['t(ll.GetStatus, true)', 'boolean:false'],
      // In-world: ll.GetInventoryNumber(true) -> 0; ll.GetLinkPrimitiveParams(true, {PRIM_NAME}) on an unlinked prim -> {}
      ['t(ll.GetInventoryNumber, true)', 'number:0'],
      ['t(ll.GetLinkPrimitiveParams, true, {PRIM_NAME})', '{}'],
      // In-world: ll.ListenRemove(true), ll.SetColor(V, true), ll.MessageLinked(true, true, "", "") -> no error;
      // ll.Listen(true, "", NULL_KEY, "") -> a number
      ['t(ll.ListenRemove, true)', '(nothing)'],
      ['t(ll.SetColor, V, true)', '(nothing)'],
      ['t(ll.MessageLinked, true, true, "", "")', '(nothing)'],
      ['typeof(ll.Listen(true, "", NULL_KEY, ""))', 'number'],
      // In-world: llcompat.DetectedKey(true) -> the null uuid; llcompat.GetInventoryName(INVENTORY_ALL, true) -> ""
      // (item 1, and the prim held one script)
      ['t(llcompat.DetectedKey, true)', `uuid:${NULL}`],
      ['t(llcompat.GetInventoryName, INVENTORY_ALL, true)', 'string:'],
    ])
  })

  it('passes it on as that integer', async () => {
    // In-world: ll.Say(true, "x"), ll.SetAlpha(1, true), ll.GetAlpha(true), ll.GetLinkKey(true),
    // ll.SetLinkAlpha(true, 1, true), ll.ListRandomize({1}, true) -> no error. That true arrives as 1 is
    // measured on a channel (ll.Say(true, "x") was heard on channel 1) and on a face (ll.SetTexture(U, true),
    // then ll.GetTexture(1) -> U, and ll.GetTexture(true) -> U).
    const s = await loadScript({
      source: `ll.Say(true, "x"); ll.SetAlpha(1, true); ll.GetAlpha(true); ll.GetLinkKey(true); ll.SetLinkAlpha(true, 1, true); ll.ListRandomize({1}, true)`,
      language: 'slua',
      filename: 'test.luau',
    })
    s.start()
    expect(s.calls.map((c) => [c.name, ...c.args])).toEqual([
      ['llSay', 1, 'x'],
      ['llSetAlpha', 1, 1],
      ['llGetAlpha', 1],
      ['llGetLinkKey', 1],
      ['llSetLinkAlpha', 1, 1, 1],
      ['llListRandomize', [1], 1],
    ])
  })

  it('refuses one for a 1-based index in ll, and takes it in llcompat', async () => {
    await expectResults([
      // In-world: ll.GetSubString("abcdef", true, true) -> invalid argument #2 to 'GetSubString' (number expected, got boolean)
      ['t(ll.GetSubString, "abcdef", true, true)', "!! invalid argument #2 to 'GetSubString' (number expected, got boolean)"],
      ['t(ll.GetSubString, "abcdef", false, 2)', "!! invalid argument #2 to 'GetSubString' (number expected, got boolean)"],
      // In-world: ll.GetSubString("abcdef", 2, true) -> invalid argument #3 ...
      ['t(ll.GetSubString, "abcdef", 2, true)', "!! invalid argument #3 to 'GetSubString' (number expected, got boolean)"],
      // In-world: ll.DeleteSubString("abcdef", true, true), ll.InsertString("abc", true, "x"), ll.Ord("abc", true),
      // ll.GetInventoryName(INVENTORY_ALL, true) -> invalid argument #2 to '<name>' (number expected, got boolean)
      ['t(ll.DeleteSubString, "abcdef", true, true)', "!! invalid argument #2 to 'DeleteSubString' (number expected, got boolean)"],
      ['t(ll.InsertString, "abc", true, "x")', "!! invalid argument #2 to 'InsertString' (number expected, got boolean)"],
      ['t(ll.Ord, "abc", true)', "!! invalid argument #2 to 'Ord' (number expected, got boolean)"],
      ['t(ll.GetInventoryName, INVENTORY_ALL, true)', "!! invalid argument #2 to 'GetInventoryName' (number expected, got boolean)"],
      // In-world: ll.DetectedKey(true) -> invalid argument #1 to 'DetectedKey' (number expected, got boolean)
      ['t(ll.DetectedKey, true)', "!! invalid argument #1 to 'DetectedKey' (number expected, got boolean)"],
      // In-world: ll.ListFindStrided({1, 2, 3, 4}, {3}, true, -1, 2) -> invalid argument #3 ...;
      // ll.List2ListStrided({1, 2, 3, 4}, true, -1, 2) -> invalid argument #2 ...
      ['t(ll.ListFindStrided, {1, 2, 3, 4}, {3}, true, -1, 2)', "!! invalid argument #3 to 'ListFindStrided' (number expected, got boolean)"],
      ['t(ll.List2ListStrided, {1, 2, 3, 4}, true, -1, 2)', "!! invalid argument #2 to 'List2ListStrided' (number expected, got boolean)"],
      // In-world: llcompat.GetSubString("abcdef", true, true) -> "b"; (false, true) -> "ab"
      ['t(llcompat.GetSubString, "abcdef", true, true)', 'string:b'],
      ['t(llcompat.GetSubString, "abcdef", false, true)', 'string:ab'],
      // In-world: llcompat.DeleteSubString("abcdef", true, true) -> "acdef"; llcompat.InsertString("abc", true, "x") -> "axbc";
      // llcompat.Ord("abc", true) -> 98
      ['t(llcompat.DeleteSubString, "abcdef", true, true)', 'string:acdef'],
      ['t(llcompat.InsertString, "abc", true, "x")', 'string:axbc'],
      ['t(llcompat.Ord, "abc", true)', 'number:98'],
    ])
  })

  it('reads a boolean parameter from a number as LSL does: only 1 is true', async () => {
    const sort = (flag: string, lib = 'll') => `t(function() return ll.List2CSV(${lib}.ListSort({2, 1, 3}, 1, ${flag})) end)`
    await expectResults([
      // In-world: ll.ListSort({2, 1, 3}, 1, true) -> 1, 2, 3; false -> 3, 2, 1; the same through llcompat
      [sort('true'), 'string:1, 2, 3'],
      [sort('false'), 'string:3, 2, 1'],
      [sort('true', 'llcompat'), 'string:1, 2, 3'],
      [sort('false', 'llcompat'), 'string:3, 2, 1'],
      // In-world: 1 and "1" -> ascending; 0, 5, -1, 0.5 and "0" -> descending
      [sort('1'), 'string:1, 2, 3'],
      [sort('"1"'), 'string:1, 2, 3'],
      [sort('0'), 'string:3, 2, 1'],
      [sort('5'), 'string:3, 2, 1'],
      [sort('-1'), 'string:3, 2, 1'],
      [sort('0.5'), 'string:3, 2, 1'],
      [sort('"0"'), 'string:3, 2, 1'],
      // In-world: "true", "", {}, U, nil -> invalid argument #3 to 'ListSort' (number expected, got <type>)
      [sort('"true"'), "!! invalid argument #3 to 'ListSort' (number expected, got string)"],
      [sort('{}'), "!! invalid argument #3 to 'ListSort' (number expected, got table)"],
      [sort('U'), "!! invalid argument #3 to 'ListSort' (number expected, got uuid)"],
      [sort('nil'), "!! invalid argument #3 to 'ListSort' (number expected, got nil)"],
    ])
  })

  it('refuses a boolean for every other kind of parameter', async () => {
    await expectResults([
      // In-world: ll.Frand(true), ll.Round(true), ll.SetAlpha(true, 0), ll.Sleep(true), llcompat.Round(true),
      // llcompat.Frand(true), llcompat.SetAlpha(true, 0) -> invalid argument #1 to '<name>' (number expected, got boolean)
      ['t(ll.Frand, true)', "!! invalid argument #1 to 'Frand' (number expected, got boolean)"],
      ['t(ll.Frand, false)', "!! invalid argument #1 to 'Frand' (number expected, got boolean)"],
      ['t(ll.Round, true)', "!! invalid argument #1 to 'Round' (number expected, got boolean)"],
      ['t(ll.SetAlpha, true, 0)', "!! invalid argument #1 to 'SetAlpha' (number expected, got boolean)"],
      ['t(ll.Sleep, true)', "!! invalid argument #1 to 'Sleep' (number expected, got boolean)"],
      ['t(llcompat.Round, true)', "!! invalid argument #1 to 'Round' (number expected, got boolean)"],
      ['t(llcompat.Frand, true)', "!! invalid argument #1 to 'Frand' (number expected, got boolean)"],
      ['t(llcompat.SetAlpha, true, 0)', "!! invalid argument #1 to 'SetAlpha' (number expected, got boolean)"],
      // In-world: ll.StringLength(true) -> (string expected, got boolean); ll.Key2Name(true) -> (uuid expected, got boolean)
      ['t(ll.StringLength, true)', "!! invalid argument #1 to 'StringLength' (string expected, got boolean)"],
      ['t(ll.Key2Name, true)', "!! invalid argument #1 to 'Key2Name' (uuid expected, got boolean)"],
      // In-world: ll.VecMag(true), ll.SetPos(true) -> (vector expected, got boolean);
      // ll.Rot2Euler(true), ll.SetRot(true) -> (quaternion expected, got boolean)
      ['t(ll.VecMag, true)', "!! invalid argument #1 to 'VecMag' (vector expected, got boolean)"],
      ['t(ll.SetPos, true)', "!! invalid argument #1 to 'SetPos' (vector expected, got boolean)"],
      ['t(ll.Rot2Euler, true)', "!! invalid argument #1 to 'Rot2Euler' (quaternion expected, got boolean)"],
      ['t(ll.SetRot, true)', "!! invalid argument #1 to 'SetRot' (quaternion expected, got boolean)"],
      // In-world: ll.SetPrimitiveParams(true) -> invalid argument #1 to 'SetPrimitiveParams' (expected a table)
      ['t(ll.SetPrimitiveParams, true)', "!! invalid argument #1 to 'SetPrimitiveParams' (expected a table)"],
    ])
  })

  it('reads the other values an integer parameter takes as it did', async () => {
    await expectResults([
      // In-world: ll.IntegerToBase64("7") and (" 7 ") -> "AAAABw=="; ("0x10") -> "AAAAEA=="; ("1.9") -> "AAAAAQ=="; ("1e2") -> "AAAAZA=="
      ['t(ll.IntegerToBase64, "7")', 'string:AAAABw=='],
      ['t(ll.IntegerToBase64, " 7 ")', 'string:AAAABw=='],
      ['t(ll.IntegerToBase64, "0x10")', 'string:AAAAEA=='],
      ['t(ll.IntegerToBase64, "1.9")', 'string:AAAAAQ=='],
      ['t(ll.IntegerToBase64, "1e2")', 'string:AAAAZA=='],
      // In-world: ll.IntegerToBase64(1.9) -> "AAAAAQ=="; (-1.9) -> "/////w=="; (2^31) -> "gAAAAA=="; (2^32 + 5) -> "AAAABQ=="
      ['t(ll.IntegerToBase64, 1.9)', 'string:AAAAAQ=='],
      ['t(ll.IntegerToBase64, -1.9)', 'string://///w=='],
      ['t(ll.IntegerToBase64, 2^31)', 'string:gAAAAA=='],
      ['t(ll.IntegerToBase64, 2^32 + 5)', 'string:AAAABQ=='],
      // In-world: ("abc"), ("") -> (number expected, got string); {} -> got table; V -> got vector; U -> got uuid; nil -> got nil
      ['t(ll.IntegerToBase64, "abc")', "!! invalid argument #1 to 'IntegerToBase64' (number expected, got string)"],
      ['t(ll.IntegerToBase64, "")', "!! invalid argument #1 to 'IntegerToBase64' (number expected, got string)"],
      ['t(ll.IntegerToBase64, {})', "!! invalid argument #1 to 'IntegerToBase64' (number expected, got table)"],
      ['t(ll.IntegerToBase64, V)', "!! invalid argument #1 to 'IntegerToBase64' (number expected, got vector)"],
      ['t(ll.IntegerToBase64, U)', "!! invalid argument #1 to 'IntegerToBase64' (number expected, got uuid)"],
      ['t(ll.IntegerToBase64, nil)', "!! invalid argument #1 to 'IntegerToBase64' (number expected, got nil)"],
    ])
  })

  it('reads a boolean in a list as 1 or 0', async () => {
    await expectResults([
      // In-world: ll.List2CSV({true, false}), llcompat.List2CSV({true, false}) -> "1, 0"
      ['t(ll.List2CSV, {true, false})', 'string:1, 0'],
      ['t(llcompat.List2CSV, {true, false})', 'string:1, 0'],
      // In-world: ll.List2Json(JSON_ARRAY, {true, false, 1}) -> [1,0,1]
      ['t(ll.List2Json, JSON_ARRAY, {true, false, 1})', 'string:[1,0,1]'],
      // In-world: ll.ListStatistics(LIST_STAT_SUM, {true, true, 2}) -> 4
      ['t(ll.ListStatistics, LIST_STAT_SUM, {true, true, 2})', 'number:4'],
      // In-world: ll.ListSort({true, false, true}, 1, true) -> {0, 1, 1}, as numbers
      ['t(ll.ListSort, {true, false, true}, 1, true)', '{number:0 | number:1 | number:1}'],
      // In-world: ll.ParseString2List("a1b", {true}, {}) -> {"a1b"}
      ['t(ll.ParseString2List, "a1b", {true}, {})', '{string:a1b}'],
      // In-world: ll.JsonGetValue("[10,20,30]", {true}) -> "20"
      ['t(ll.JsonGetValue, "[10,20,30]", {true})', 'string:20'],
    ])
  })

  it('still tells a boolean in a list from the number it is sent as', async () => {
    await expectResults([
      // In-world: ll.ListFindList({true}, {true}) -> 1; ({true, false}, {false}) -> 2; ({1, true}, {true}) -> 2
      ['t(ll.ListFindList, {true}, {true})', 'number:1'],
      ['t(ll.ListFindList, {true, false}, {false})', 'number:2'],
      ['t(ll.ListFindList, {1, true}, {true})', 'number:2'],
      // In-world: ll.ListFindList({true}, {1}), ({0, 1}, {true}), ({false}, {0}) -> nil
      ['t(ll.ListFindList, {true}, {1})', 'nil:nil'],
      ['t(ll.ListFindList, {0, 1}, {true})', 'nil:nil'],
      ['t(ll.ListFindList, {false}, {0})', 'nil:nil'],
      // In-world: llcompat.ListFindList({true}, {1}) -> -1; llcompat.ListFindList({1, true}, {true}) -> 1
      ['t(llcompat.ListFindList, {true}, {1})', 'number:-1'],
      ['t(llcompat.ListFindList, {1, true}, {true})', 'number:1'],
      // In-world: ll.ListFindStrided({1, true}, {true}, 1, -1, 1) -> 2
      ['t(ll.ListFindStrided, {1, true}, {true}, 1, -1, 1)', 'number:2'],
      // In-world: ll.List2CSV(ll.ListSort({true, 0.5, 2, false, 1.5}, 1, true)) -> "0, 0.500000, 1.500000, 1, 2":
      // the booleans in their places, the numbers in theirs
      ['t(function() return ll.List2CSV(ll.ListSort({true, 0.5, 2, false, 1.5}, 1, true)) end)', 'string:0, 0.500000, 1.500000, 1, 2'],
      // In-world: ll.List2CSV(ll.ListSort({true, 0.5, false}, 1, true)) -> "0, 0.500000, 1"
      ['t(function() return ll.List2CSV(ll.ListSort({true, 0.5, false}, 1, true)) end)', 'string:0, 0.500000, 1'],
      // In-world: ll.List2CSV(ll.ListSort({true, "x", false, "y"}, 2, true)) -> "0, y, 1, x";
      // ll.List2CSV(ll.ListSortStrided({"x", true, "y", false}, 2, 2, true)) -> "y, 0, x, 1"
      ['t(function() return ll.List2CSV(ll.ListSort({true, "x", false, "y"}, 2, true)) end)', 'string:0, y, 1, x'],
      ['t(function() return ll.List2CSV(ll.ListSortStrided({"x", true, "y", false}, 2, 2, true)) end)', 'string:y, 0, x, 1'],
      // In-world: ll.List2CSV(ll.ListSort({true, "b", false, "a", 2, 1}, 1, false)) -> "2, 1, a, 0, b, 1"
      ['t(function() return ll.List2CSV(ll.ListSort({true, "b", false, "a", 2, 1}, 1, false)) end)', 'string:2, 1, a, 0, b, 1'],
      // In-world: ll.ListStatistics(LIST_STAT_NUM_COUNT, {true, "1", 2, U}) -> 2; (LIST_STAT_MAX, {true, 0.5}) -> 1;
      // ll.ListStatistics(true, {1, 4}) -> 1 (operation 1 is LIST_STAT_MIN)
      ['t(ll.ListStatistics, LIST_STAT_NUM_COUNT, {true, "1", 2, U})', 'number:2'],
      ['t(ll.ListStatistics, LIST_STAT_MAX, {true, 0.5})', 'number:1'],
      ['t(ll.ListStatistics, true, {1, 4})', 'number:1'],
      // In-world: ll.ListSort({true, 2, false, 1}, 1, true) -> {0, 1, 1, 2}, as numbers
      ['t(ll.ListSort, {true, 2, false, 1}, 1, true)', '{number:0 | number:1 | number:1 | number:2}'],
    ])
  })

  it('takes a boolean where a prim rule wants an integer or a float', async () => {
    await expectResults([
      // In-world: ll.SetPrimitiveParams({PRIM_GLOW, ALL_SIDES, true}), then ll.GetPrimitiveParams({PRIM_GLOW, 0}) -> {1}
      // (the glow was 0 before)
      ['t(function() ll.SetPrimitiveParams({PRIM_GLOW, ALL_SIDES, true}); return ll.GetPrimitiveParams({PRIM_GLOW, 0}) end)', '{number:1}'],
      // In-world: ll.SetPrimitiveParams({PRIM_FULLBRIGHT, ALL_SIDES, true}), then ll.GetPrimitiveParams({PRIM_FULLBRIGHT, 0})
      // -> {true} (it was off), and after {PRIM_FULLBRIGHT, ALL_SIDES, 0} -> {false}. rezless gives 1 and 0 for that
      // entry through ll as well, so the test reads it through llcompat.
      ['t(function() ll.SetPrimitiveParams({PRIM_FULLBRIGHT, ALL_SIDES, true}); return llcompat.GetPrimitiveParams({PRIM_FULLBRIGHT, 0}) end)', '{number:1}'],
      ['t(function() ll.SetPrimitiveParams({PRIM_FULLBRIGHT, ALL_SIDES, 0}); return llcompat.GetPrimitiveParams({PRIM_FULLBRIGHT, 0}) end)', '{number:0}'],
    ])
  })
})

describe('SLua: a list argument that is not a list', () => {
  const kinds: Array<[string, string]> = [['5', 'number'], ['"s"', 'string'], ['true', 'boolean'], ['U', 'uuid'], ['V', 'vector'], ['Q', 'quaternion'], ['print', 'function'], ['nil', 'nil']]

  it('says "expected a table" without naming what it got', async () => {
    // In-world: each of these with 5, "s", true, a uuid, a vector, a quaternion, a function and nil
    // -> invalid argument #N to '<name>' (expected a table)
    const calls: Array<[string, string]> = [
      ['ll.List2CSV(X)', "#1 to 'List2CSV'"],
      ['llcompat.List2CSV(X)', "#1 to 'List2CSV'"],
      ['ll.ListFindList(X, {})', "#1 to 'ListFindList'"],
      ['ll.ListFindList({}, X)', "#2 to 'ListFindList'"],
      ['ll.ParseString2List("a", X, {})', "#2 to 'ParseString2List'"],
      ['ll.ParseString2List("a", {}, X)', "#3 to 'ParseString2List'"],
      ['ll.SetPrimitiveParams(X)', "#1 to 'SetPrimitiveParams'"],
      ['llcompat.SetPrimitiveParams(X)', "#1 to 'SetPrimitiveParams'"],
      ['ll.GetPrimitiveParams(X)', "#1 to 'GetPrimitiveParams'"],
      ['ll.SetLinkPrimitiveParamsFast(LINK_THIS, X)', "#2 to 'SetLinkPrimitiveParamsFast'"],
      ['ll.GetObjectDetails(ll.GetKey(), X)', "#2 to 'GetObjectDetails'"],
      ['ll.List2Json(JSON_ARRAY, X)', "#2 to 'List2Json'"],
      ['ll.ListSort(X, 1, true)', "#1 to 'ListSort'"],
      ['ll.JsonGetValue("{}", X)', "#2 to 'JsonGetValue'"],
    ]
    for (const [call, where] of calls) {
      await expectResults(kinds.map(([value]) => [
        `t(function(X) return ${call} end, ${value})`,
        `!! invalid argument ${where} (expected a table)`,
      ]))
    }
  })

  it('leaves the list functions SLua runs in its own VM to name the type', async () => {
    // In-world: ll.GetListLength, ll.DumpList2String, ll.List2String and llcompat.GetListLength with each value
    // -> invalid argument #1 to '<name>' (table expected, got <type>)
    await expectResults(kinds.flatMap(([value, type]): Array<[string, string]> => [
      [`t(ll.GetListLength, ${value})`, `!! invalid argument #1 to 'GetListLength' (table expected, got ${type})`],
      [`t(ll.DumpList2String, ${value}, ",")`, `!! invalid argument #1 to 'DumpList2String' (table expected, got ${type})`],
      [`t(ll.List2String, ${value}, 1)`, `!! invalid argument #1 to 'List2String' (table expected, got ${type})`],
      [`t(llcompat.GetListLength, ${value})`, `!! invalid argument #1 to 'GetListLength' (table expected, got ${type})`],
    ]))
  })

  it('refuses a list holding something LSL lists cannot, as argument #-1', async () => {
    const decode = (name: string) => `!! invalid argument #-1 to '${name}' (Don't know how to decode this)`
    const hole = (name: string) => `!! invalid argument #-1 to '${name}' (Can't have undefined in an argument)`
    await expectResults([
      // In-world: ll.List2CSV({1, {3}}), ({print}), ({buffer.create(1)}), ({1, ll}), ({coroutine.create(print)})
      // -> invalid argument #-1 to 'List2CSV' (Don't know how to decode this)
      ['t(ll.List2CSV, {1, {3}})', decode('List2CSV')],
      ['t(ll.List2CSV, {print})', decode('List2CSV')],
      ['t(ll.List2CSV, {buffer.create(1)})', decode('List2CSV')],
      ['t(ll.List2CSV, {1, ll})', decode('List2CSV')],
      ['t(ll.List2CSV, {coroutine.create(print)})', decode('List2CSV')],
      // In-world: the same for llcompat.List2CSV, ll.SetPrimitiveParams and a list that is argument 2 or 3
      ['t(llcompat.List2CSV, {1, {3}})', decode('List2CSV')],
      ['t(ll.SetPrimitiveParams, {print})', decode('SetPrimitiveParams')],
      ['t(ll.ParseString2List, "a", {1, {3}}, {})', decode('ParseString2List')],
      ['t(ll.ParseString2List, "a", {}, {{}})', decode('ParseString2List')],
      ['t(ll.Dialog, U, "m", {print}, "x")', decode('Dialog')],
      // In-world: ll.List2CSV({1, nil, 2}), ({nil, 1}) -> invalid argument #-1 to 'List2CSV' (Can't have undefined in an argument)
      ['t(ll.List2CSV, {1, nil, 2})', hole('List2CSV')],
      ['t(ll.List2CSV, {nil, 1})', hole('List2CSV')],
      ['t(llcompat.List2CSV, {1, nil, 2})', hole('List2CSV')],
      ['t(ll.SetPrimitiveParams, {nil, 1})', hole('SetPrimitiveParams')],
      ['t(ll.ParseString2List, "a", {1, nil, 2}, {})', hole('ParseString2List')],
    ])
  })

  it('reads only the array part of a table', async () => {
    await expectResults([
      // In-world: ll.List2CSV({a = 1}) -> ""; ({[2] = 5}) -> ""; ({1, 2, x = 3}) -> "1, 2"; ({1, 2, nil}) -> "1, 2"; ({}) -> ""
      ['t(ll.List2CSV, {a = 1})', 'string:'],
      ['t(ll.List2CSV, {[2] = 5})', 'string:'],
      ['t(ll.List2CSV, {1, 2, x = 3})', 'string:1, 2'],
      ['t(ll.List2CSV, {1, 2, nil})', 'string:1, 2'],
      ['t(ll.List2CSV, {})', 'string:'],
      // In-world: local x = {}; x[1] = 1; x[3] = 3; ll.List2CSV(x) -> "1"
      ['t(function() local x = {}; x[1] = 1; x[3] = 3; return ll.List2CSV(x) end)', 'string:1'],
      // In-world: local x = {1, 2, 3}; x[2] = nil; ll.List2CSV(x) -> ... (Can't have undefined in an argument)
      ['t(function() local x = {1, 2, 3}; x[2] = nil; return ll.List2CSV(x) end)', "!! invalid argument #-1 to 'List2CSV' (Can't have undefined in an argument)"],
      // In-world: ll.List2CSV of a table whose metatable has __len and __index -> ""
      ['t(ll.List2CSV, setmetatable({}, {__index = function() return 1 end, __len = function() return 2 end}))', 'string:'],
    ])
  })

  it('checks the arguments from the left, and for a 0 index last', async () => {
    await expectResults([
      // In-world: ll.ParseString2List("a", {{}}, 5) -> invalid argument #-1 ... (Don't know how to decode this)
      ['t(ll.ParseString2List, "a", {{}}, 5)', "!! invalid argument #-1 to 'ParseString2List' (Don't know how to decode this)"],
      // In-world: ll.ParseString2List("a", 5, {{}}) -> invalid argument #2 to 'ParseString2List' (expected a table)
      ['t(ll.ParseString2List, "a", 5, {{}})', "!! invalid argument #2 to 'ParseString2List' (expected a table)"],
      // In-world: ll.ParseString2List("a", {nil, 1}, {{}}) -> ... (Can't have undefined in an argument)
      ['t(ll.ParseString2List, "a", {nil, 1}, {{}})', "!! invalid argument #-1 to 'ParseString2List' (Can't have undefined in an argument)"],
      // In-world: ll.ParseString2List(5, {{}}, {}) -> invalid argument #1 to 'ParseString2List' (string expected, got number)
      ['t(ll.ParseString2List, 5, {{}}, {})', "!! invalid argument #1 to 'ParseString2List' (string expected, got number)"],
      // In-world: ll.ListFindList({print}, 5) -> invalid argument #-1 to 'ListFindList' (Don't know how to decode this)
      ['t(ll.ListFindList, {print}, 5)', "!! invalid argument #-1 to 'ListFindList' (Don't know how to decode this)"],
      // In-world: ll.SetText("a", V, {}) -> invalid argument #3 to 'SetText' (number expected, got table)
      ['t(ll.SetText, "a", V, {})', "!! invalid argument #3 to 'SetText' (number expected, got table)"],
      // In-world: ll.GetSubString("abc", 0, "x") -> invalid argument #3 to 'GetSubString' (number expected, got string)
      ['t(ll.GetSubString, "abc", 0, "x")', "!! invalid argument #3 to 'GetSubString' (number expected, got string)"],
      // In-world: ll.GetSubString(5, 0, 0) -> invalid argument #1 to 'GetSubString' (string expected, got number)
      ['t(ll.GetSubString, 5, 0, 0)', "!! invalid argument #1 to 'GetSubString' (string expected, got number)"],
      // In-world: ll.GetSubString("abcdef", 0.5, 3) -> passed 0 when a 1-based index was expected
      ['t(ll.GetSubString, "abcdef", 0.5, 3)', '!! passed 0 when a 1-based index was expected'],
      // In-world: ll.ListFindStrided({print}, {1}, 0, 1, 1) -> invalid argument #-1 ... (Don't know how to decode this)
      ['t(ll.ListFindStrided, {print}, {1}, 0, 1, 1)', "!! invalid argument #-1 to 'ListFindStrided' (Don't know how to decode this)"],
      // In-world: ll.ListFindStrided({1}, {1}, 0, 1, {}) -> invalid argument #5 to 'ListFindStrided' (number expected, got table)
      ['t(ll.ListFindStrided, {1}, {1}, 0, 1, {})', "!! invalid argument #5 to 'ListFindStrided' (number expected, got table)"],
      // In-world: ll.ListFindStrided({1}, {1}, 0, 1, 1) -> passed 0 when a 1-based index was expected
      ['t(ll.ListFindStrided, {1}, {1}, 0, 1, 1)', '!! passed 0 when a 1-based index was expected'],
      // In-world: ll.ListFindStrided({1, 2, 1.5, 2}, {1.5, 2}, 1, -1, 2) -> 3
      ['t(ll.ListFindStrided, {1, 2, 1.5, 2}, {1.5, 2}, 1, -1, 2)', 'number:3'],
      // In-world: ll.GetSubString("abcdef", "2", "3") and ("abcdef", 2.9, 3.9) -> "bc"
      ['t(ll.GetSubString, "abcdef", "2", "3")', 'string:bc'],
      ['t(ll.GetSubString, "abcdef", 2.9, 3.9)', 'string:bc'],
    ])
  })
})

describe('SLua: the texture a face holds', () => {
  it('comes back from ll.GetTexture as a uuid', async () => {
    await expectResults([
      // In-world: ll.GetTexture(0) and llcompat.GetTexture(0) on a new prim -> uuid 89556747-24cb-43ed-920b-47caed15465f
      ['t(ll.GetTexture, 0)', `uuid:${PLYWOOD}`],
      ['t(llcompat.GetTexture, 0)', `uuid:${PLYWOOD}`],
      // In-world: ll.GetTexture(ALL_SIDES) -> the same uuid
      ['t(ll.GetTexture, ALL_SIDES)', `uuid:${PLYWOOD}`],
      // In-world: ll.GetTexture(99) -> uuid 00000000-0000-0000-0000-000000000000
      ['t(ll.GetTexture, 99)', `uuid:${NULL}`],
      // In-world: ll.SetTexture(U, 0), then ll.GetTexture(0) and llcompat.GetTexture(0) -> uuid U
      ['t(function() ll.SetTexture(U, 0); return ll.GetTexture(0) end)', `uuid:${U}`],
      ['t(llcompat.GetTexture, 0)', `uuid:${U}`],
      // In-world: ll.SetTexture(tostring(U), 1), then ll.GetTexture(1) -> uuid U
      ['t(function() ll.SetTexture(tostring(U), 1); return ll.GetTexture(1) end)', `uuid:${U}`],
      // In-world: ll.SetTexture("5748DECC-F629-461C-9A36-A35A221FE21F", 2), then ll.GetTexture(2) and
      // llcompat.GetTexture(2) -> uuid 5748decc-f629-461c-9a36-a35a221fe21f
      ['t(function() ll.SetTexture(string.upper(tostring(U)), 2); return ll.GetTexture(2) end)', `uuid:${U}`],
      ['t(llcompat.GetTexture, 2)', `uuid:${U}`],
    ])
  })

  it('comes back as a uuid from a mock too', async () => {
    const got = await results(['t(ll.GetTexture, 0)', 't(ll.PlaySound, "x")'], '', (s) => {
      s.mock('llGetTexture', () => U)
      s.mock('llPlaySound', () => undefined)
    })
    expect(got).toEqual([`uuid:${U}`, '!! Fewer arguments than expected, 1 < 2'])
  })

  it('is not a string any more', async () => {
    await expectResults([
      // In-world: ll.GetTexture(0) .. "" -> attempt to concatenate uuid with string
      ['t(function() return ll.GetTexture(0) .. "" end)', '!! attempt to concatenate uuid with string'],
      // In-world: string.len(ll.GetTexture(0)) -> invalid argument #1 to 'len' (string expected, got uuid)
      ['t(function() return string.len(ll.GetTexture(0)) end)', "!! invalid argument #1 to 'len' (string expected, got uuid)"],
      // In-world: #tostring(ll.GetTexture(0)) -> 36
      ['t(function() return #tostring(ll.GetTexture(0)) end)', 'number:36'],
    ])
  })

  it('comes back as a string when it is the name of a texture in the prim', async () => {
    // In-world: with a texture item "probe420 tex" in the prim, ll.SetTexture("probe420 tex", 1), then
    // ll.GetTexture(1) -> string "probe420 tex". slua-results.test.ts has the item named like a key.
    const got = await results(['t(function() ll.SetTexture("Wood", 2); return ll.GetTexture(2) end)'], '', (s) =>
      s.host.addInventory(makeInventoryItem({ name: 'Wood', type: InventoryType.TEXTURE, key: U })),
    )
    expect(got).toEqual(['string:Wood'])
  })

  it('leaves the other names and keys as they were', async () => {
    await expectResults([
      // In-world: ll.GetRenderMaterial(0), (99) and llcompat.GetRenderMaterial(0) -> string 00000000-0000-0000-0000-000000000000
      ['t(ll.GetRenderMaterial, 0)', `string:${NULL}`],
      ['t(ll.GetRenderMaterial, 99)', `string:${NULL}`],
      ['t(llcompat.GetRenderMaterial, 0)', `string:${NULL}`],
      // In-world: ll.SetRenderMaterial(U, 2), then ll.GetRenderMaterial(2) and llcompat.GetRenderMaterial(2) -> string U
      ['t(function() ll.SetRenderMaterial(U, 2); return ll.GetRenderMaterial(2) end)', `string:${U}`],
      ['t(llcompat.GetRenderMaterial, 2)', `string:${U}`],
      // In-world: with the description, then the name, set to U's text: ll.GetObjectDesc(), ll.GetObjectName(),
      // ll.GetLinkName(LINK_THIS) -> string; ll.GetObjectDetails(ll.GetKey(), {OBJECT_NAME}) -> {string}
      ['t(function() ll.SetObjectDesc(tostring(U)); return ll.GetObjectDesc() end)', `string:${U}`],
      ['t(function() ll.SetObjectName(tostring(U)); return ll.GetObjectName() end)', `string:${U}`],
      ['t(ll.GetLinkName, LINK_THIS)', `string:${U}`],
      ['t(ll.GetObjectDetails, ll.GetKey(), {OBJECT_NAME})', `{string:${U}}`],
      // In-world: ll.LinksetDataWrite("k", tostring(U)), then ll.LinksetDataRead("k") -> string
      ['t(function() ll.LinksetDataWrite("k", tostring(U)); return ll.LinksetDataRead("k") end)', `string:${U}`],
      // In-world: ll.List2String({U}, 1) -> string; ll.CSV2List("a, " .. tostring(U)) -> {string, string}
      ['t(ll.List2String, {U}, 1)', `string:${U}`],
      ['t(ll.CSV2List, "a, " .. tostring(U))', `{string:a | string:${U}}`],
      // In-world: ll.GetInventoryName(INVENTORY_ALL, 99), ll.GetScriptName(), ll.GetRegionName(), ll.Key2Name(owner),
      // ll.GetDisplayName(owner), ll.GetUsername(owner), ll.GetAnimation(owner), ll.GetEnv("sim_channel") -> string
      [
        `table.concat({typeof(ll.GetInventoryName(INVENTORY_ALL, 99)), typeof(ll.GetScriptName()), typeof(ll.GetRegionName()),
          typeof(ll.Key2Name(ll.GetOwner())), typeof(ll.GetDisplayName(ll.GetOwner())), typeof(ll.GetUsername(ll.GetOwner())),
          typeof(ll.GetAnimation(ll.GetOwner())), typeof(ll.GetEnv("sim_channel"))}, " ")`,
        Array(8).fill('string').join(' '),
      ],
      // In-world: ll.DetectedName(1) outside an event -> string 00000000-0000-0000-0000-000000000000
      ['t(ll.DetectedName, 1)', `string:${NULL}`],
    ])
  })

  it('gives a uuid from the functions that return a key', async () => {
    await expectResults([
      // In-world: ll.GetKey(), ll.GetOwner(), ll.GetCreator(), ll.GetLinkKey(0), ll.GetOwnerKey(ll.GetKey()),
      // ll.GetInventoryKey(script), ll.GetInventoryKey("nope"), ll.GetInventoryCreator(script), ll.Name2Key("i doll"),
      // ll.GetPermissionsKey(), ll.GetLandOwnerAt(pos), ll.GenerateKey(), ll.RequestAgentData(owner, DATA_NAME),
      // ll.HTTPRequest(url, {}, ""), ll.AvatarOnSitTarget(), ll.DetectedKey(1), ll.GetObjectLinkKey(ll.GetKey(), 1) -> uuid
      [
        `table.concat({typeof(ll.GetKey()), typeof(ll.GetOwner()), typeof(ll.GetCreator()), typeof(ll.GetLinkKey(0)),
          typeof(ll.GetOwnerKey(ll.GetKey())), typeof(ll.GetInventoryKey(ll.GetScriptName())), typeof(ll.GetInventoryKey("nope")),
          typeof(ll.GetInventoryCreator(ll.GetScriptName())), typeof(ll.Name2Key("i doll")), typeof(ll.GetPermissionsKey()),
          typeof(ll.GetLandOwnerAt(ll.GetPos())), typeof(ll.GenerateKey()), typeof(ll.RequestAgentData(ll.GetOwner(), DATA_NAME)),
          typeof(ll.HTTPRequest("https://example.com", {}, "")), typeof(ll.AvatarOnSitTarget()), typeof(ll.DetectedKey(1)),
          typeof(ll.GetObjectLinkKey(ll.GetKey(), 1))}, " ")`,
        Array(17).fill('uuid').join(' '),
      ],
      // In-world: llcompat.GetKey(), llcompat.GetOwner(), llcompat.GetCreator(), llcompat.GetLinkKey(1),
      // llcompat.GetInventoryKey(script), llcompat.GetOwnerKey(ll.GetKey()), llcompat.GenerateKey(),
      // llcompat.AvatarOnSitTarget() -> uuid
      [
        `table.concat({typeof(llcompat.GetKey()), typeof(llcompat.GetOwner()), typeof(llcompat.GetCreator()), typeof(llcompat.GetLinkKey(1)),
          typeof(llcompat.GetInventoryKey(ll.GetScriptName())), typeof(llcompat.GetOwnerKey(ll.GetKey())), typeof(llcompat.GenerateKey()),
          typeof(llcompat.AvatarOnSitTarget())}, " ")`,
        Array(8).fill('uuid').join(' '),
      ],
      // In-world: ll.List2Key({"abc"}, 1), ({5}, 1), ({}, 1) -> the null uuid; ({tostring(U)}, 1), ({U}, 1),
      // llcompat.List2Key({tostring(U)}, 0) -> uuid U
      ['t(ll.List2Key, {"abc"}, 1)', `uuid:${NULL}`],
      ['t(ll.List2Key, {5}, 1)', `uuid:${NULL}`],
      ['t(ll.List2Key, {}, 1)', `uuid:${NULL}`],
      ['t(ll.List2Key, {tostring(U)}, 1)', `uuid:${U}`],
      ['t(ll.List2Key, {U}, 1)', `uuid:${U}`],
      ['t(llcompat.List2Key, {tostring(U)}, 0)', `uuid:${U}`],
      // In-world: ll.List2List({U, "s", 1}, 1, 3) -> {uuid, string, number}
      ['t(ll.List2List, {U, "s", 1}, 1, 3)', `{uuid:${U} | string:s | number:1}`],
      // In-world: ll.GetObjectDetails(ll.GetKey(), {OBJECT_NAME, OBJECT_OWNER, OBJECT_CREATOR, OBJECT_ROOT}) -> {string, uuid, uuid, uuid}
      [
        't(function() local d = ll.GetObjectDetails(ll.GetKey(), {OBJECT_NAME, OBJECT_OWNER, OBJECT_CREATOR, OBJECT_ROOT}); return typeof(d[1]) .. typeof(d[2]) .. typeof(d[3]) .. typeof(d[4]) end)',
        'string:stringuuiduuiduuid',
      ],
    ])
  })
})

describe('SLua: numbers in lists', () => {
  it('sends a whole number that fits an LSL integer as an integer', async () => {
    const csv = (n: string) => `t(function() return ll.List2CSV({${n}}) .. " " .. ll.List2Json(JSON_ARRAY, {${n}}) end)`
    await expectResults([
      // In-world: ll.List2CSV({1}) -> "1"; ll.List2Json(JSON_ARRAY, {1}) -> "[1]", and so on for each number
      [csv('1'), 'string:1 [1]'],
      [csv('1.5'), 'string:1.500000 [1.500000]'],
      [csv('0'), 'string:0 [0]'],
      [csv('-0'), 'string:0 [0]'],
      [csv('-1'), 'string:-1 [-1]'],
      [csv('-3.0'), 'string:-3 [-3]'],
      [csv('100'), 'string:100 [100]'],
      [csv('0.1'), 'string:0.100000 [0.100000]'],
      [csv('0.5'), 'string:0.500000 [0.500000]'],
      [csv('1e-7'), 'string:0.000000 [0.000000]'],
      // In-world: 16777217 -> "16777217", which a 32-bit float can't hold
      [csv('16777217'), 'string:16777217 [16777217]'],
      // In-world: 2^31 - 1 -> "2147483647"; 2^31 -> "2147483648.000000"; -2^31 -> "-2147483648"; -2^31 - 1 -> "-2147483648.000000"
      [csv('2^31 - 1'), 'string:2147483647 [2147483647]'],
      [csv('2^31'), 'string:2147483648.000000 [2147483648.000000]'],
      [csv('-2^31'), 'string:-2147483648 [-2147483648]'],
      [csv('-2^31 - 1'), 'string:-2147483648.000000 [-2147483648.000000]'],
      // In-world: 2^32 -> "4294967296.000000"; 1e10 -> "10000000000.000000"; 1e15 -> "999999986991104.000000"
      [csv('2^32'), 'string:4294967296.000000 [4294967296.000000]'],
      [csv('1e10'), 'string:10000000000.000000 [10000000000.000000]'],
      [csv('1e15'), 'string:999999986991104.000000 [999999986991104.000000]'],
      // In-world: 1/0 -> "inf"; -1/0 -> "-inf"; 1e39 -> "inf"
      [csv('1/0'), 'string:inf [inf]'],
      [csv('-1/0'), 'string:-inf [-inf]'],
      [csv('1e39'), 'string:inf [inf]'],
    ])
  })

  it('does so in a mixed list and through llcompat', async () => {
    await expectResults([
      // In-world: ll.List2CSV({U, 1, 1.5, "s"}) -> "5748decc-f629-461c-9a36-a35a221fe21f, 1, 1.500000, s"
      ['t(ll.List2CSV, {U, 1, 1.5, "s"})', `string:${U}, 1, 1.500000, s`],
      // In-world: llcompat.List2CSV({1, 1.5}) -> "1, 1.500000"
      ['t(llcompat.List2CSV, {1, 1.5})', 'string:1, 1.500000'],
      // In-world: ll.List2CSV({-0.0, 0, -0.5}) -> "0, 0, -0.500000"
      ['t(ll.List2CSV, {-0.0, 0, -0.5})', 'string:0, 0, -0.500000'],
      // In-world: ll.List2CSV({1e6, 1e7, 123456789, 0.999999, 0.9999999}) -> "1000000, 10000000, 123456789, 0.999999, 1.000000"
      ['t(ll.List2CSV, {1e6, 1e7, 123456789, 0.999999, 0.9999999})', 'string:1000000, 10000000, 123456789, 0.999999, 1.000000'],
      // In-world: ll.List2CSV({0.0000005, 2.5, 0.125, 1/3}) -> "0.000000, 2.500000, 0.125000, 0.333333"
      ['t(ll.List2CSV, {0.0000005, 2.5, 0.125, 1/3})', 'string:0.000000, 2.500000, 0.125000, 0.333333'],
      // In-world: ll.List2CSV({1.0000001, 3.0000001}) -> "1.000000, 3.000000"
      ['t(ll.List2CSV, {1.0000001, 3.0000001})', 'string:1.000000, 3.000000'],
      // In-world: ll.List2Json(JSON_ARRAY, {1, 1.5, 2.0, "s"}) -> [1,1.500000,2,"s"]
      ['t(ll.List2Json, JSON_ARRAY, {1, 1.5, 2.0, "s"})', 'string:[1,1.500000,2,"s"]'],
      // In-world: ll.List2Json(JSON_OBJECT, {"a", 1, "b", 1.5}) -> {"a":1,"b":1.500000}
      ['t(ll.List2Json, JSON_OBJECT, {"a", 1, "b", 1.5})', 'string:{"a":1,"b":1.500000}'],
      // In-world: ll.List2CSV({V, Q}) -> "<1.000000, 2.000000, 3.000000>, <0.000000, 0.000000, 0.000000, 1.000000>"
      ['t(ll.List2CSV, {V, Q})', 'string:<1.000000, 2.000000, 3.000000>, <0.000000, 0.000000, 0.000000, 1.000000>'],
      // In-world: ll.List2CSV({vector(1.5, 0.1, 1e10)}) -> "<1.500000, 0.100000, 10000000000.000000>"
      ['t(ll.List2CSV, {vector(1.5, 0.1, 1e10)})', 'string:<1.500000, 0.100000, 10000000000.000000>'],
    ])
  })

  it('leaves the list functions SLua runs in its own VM printing every number as a float', async () => {
    await expectResults([
      // In-world: ll.DumpList2String({1}, ",") and ll.List2String({1}, 1) -> "1.000000"
      ['t(ll.DumpList2String, {1}, ",")', 'string:1.000000'],
      ['t(ll.List2String, {1}, 1)', 'string:1.000000'],
      // In-world: llcompat.DumpList2String({1, 1.5}, ",") -> "1.000000,1.500000"; llcompat.List2String({1}, 0) -> "1.000000"
      ['t(llcompat.DumpList2String, {1, 1.5}, ",")', 'string:1.000000,1.500000'],
      ['t(llcompat.List2String, {1}, 0)', 'string:1.000000'],
      // In-world: ll.DumpList2String({16777217}, ",") -> "16777220.000000"; ({2^31 - 1}, ",") -> "2147484000.000000"
      ['t(ll.DumpList2String, {16777217}, ",")', 'string:16777220.000000'],
      ['t(ll.DumpList2String, {2^31 - 1}, ",")', 'string:2147484000.000000'],
      // In-world: tostring(1) -> "1"; tostring(1.5) -> "1.5"; "" .. 1e15 -> "1000000000000000"
      ['tostring(1) .. " " .. tostring(1.5) .. " " .. 1e15', '1 1.5 1000000000000000'],
    ])
  })

  it('treats a number an ll function returned like any other', async () => {
    const csv = (expr: string) => `t(function() return ll.List2CSV({${expr}}) .. " " .. ll.List2Json(JSON_ARRAY, {${expr}}) end)`
    await expectResults([
      // In-world: ll.List2CSV({ll.GetAlpha(0)}) -> "1" (a float result), and "[1]" from ll.List2Json
      [csv('ll.GetAlpha(0)'), 'string:1 [1]'],
      [csv('llcompat.GetAlpha(0)'), 'string:1 [1]'],
      // In-world: ll.GetNumberOfPrims() -> "1"; ll.StringLength("abc") -> "3"; ll.GetListLength({1, 2}) -> "2"
      [csv('ll.GetNumberOfPrims()'), 'string:1 [1]'],
      [csv('ll.StringLength("abc")'), 'string:3 [3]'],
      [csv('ll.GetListLength({1, 2})'), 'string:2 [2]'],
      // In-world: ll.Floor(1.5) -> "1"; ll.Round(2.5) -> "3"; ll.Pow(2, 2) -> "4"; ll.Fabs(-1) -> "1"; ll.Sqrt(4) -> "2"
      [csv('ll.Floor(1.5)'), 'string:1 [1]'],
      [csv('ll.Round(2.5)'), 'string:3 [3]'],
      [csv('ll.Pow(2, 2)'), 'string:4 [4]'],
      [csv('ll.Fabs(-1)'), 'string:1 [1]'],
      [csv('ll.Sqrt(4)'), 'string:2 [2]'],
      // In-world: ll.Sqrt(2) -> "1.414214"; PI -> "3.141593"; ll.VecMag(vector(3, 4, 0)) -> "5"
      [csv('ll.Sqrt(2)'), 'string:1.414214 [1.414214]'],
      [csv('PI'), 'string:3.141593 [3.141593]'],
      [csv('ll.VecMag(vector(3, 4, 0))'), 'string:5 [5]'],
      // In-world: ll.List2Float({1}, 1) -> "1"; ll.List2Float({"2.0"}, 1) -> "2"; ll.List2Integer({1.5}, 1) -> "1"
      [csv('ll.List2Float({1}, 1)'), 'string:1 [1]'],
      [csv('ll.List2Float({"2.0"}, 1)'), 'string:2 [2]'],
      [csv('ll.List2Integer({1.5}, 1)'), 'string:1 [1]'],
      // In-world: ll.GetScale().x on a 0.5 m cube -> "0.500000"; TYPE_INTEGER -> "1"; ALL_SIDES -> "-1"
      [csv('ll.GetScale().x'), 'string:0.500000 [0.500000]'],
      [csv('TYPE_INTEGER'), 'string:1 [1]'],
      [csv('ALL_SIDES'), 'string:-1 [-1]'],
    ])
  })

  it('treats a list an ll function returned like any other', async () => {
    const csv = (expr: string) => `t(function() return ll.List2CSV(${expr}) end)`
    await expectResults([
      // In-world: ll.List2CSV(ll.List2List({1, 1.5, 2.0}, 1, 3)) -> "1, 1.500000, 2"
      [csv('ll.List2List({1, 1.5, 2.0}, 1, 3)'), 'string:1, 1.500000, 2'],
      [csv('llcompat.List2List({1, 1.5}, 0, 1)'), 'string:1, 1.500000'],
      // In-world: ll.List2CSV(ll.ListReplaceList({1, 2}, {1.5, 3}, 1, 1)) -> "1.500000, 3, 2"
      [csv('ll.ListReplaceList({1, 2}, {1.5, 3}, 1, 1)'), 'string:1.500000, 3, 2'],
      // In-world: ll.List2CSV(ll.Json2List("[1,1.0,1.5,2e0]")) -> "1, 1, 1.500000, 2"
      [csv('ll.Json2List("[1,1.0,1.5,2e0]")'), 'string:1, 1, 1.500000, 2'],
      // In-world: ll.List2CSV(ll.CSV2List("1, 1.0, 1.5")) -> "1, 1.0, 1.5" (strings)
      [csv('ll.CSV2List("1, 1.0, 1.5")'), 'string:1, 1.0, 1.5'],
      // In-world: ll.List2CSV(ll.GetPrimitiveParams({PRIM_COLOR, 0})) -> "<1.000000, 1.000000, 1.000000>, 1" (the alpha is a float)
      [csv('ll.GetPrimitiveParams({PRIM_COLOR, 0})'), 'string:<1.000000, 1.000000, 1.000000>, 1'],
      // In-world: ll.List2CSV(llcompat.GetPrimitiveParams({PRIM_GLOW, 0, PRIM_FULLBRIGHT, 0, PRIM_MATERIAL})) -> "0, 0, 3"
      [csv('llcompat.GetPrimitiveParams({PRIM_GLOW, 0, PRIM_FULLBRIGHT, 0, PRIM_MATERIAL})'), 'string:0, 0, 3'],
      // In-world: after ll.SetPrimitiveParams({PRIM_GLOW, ALL_SIDES, 1}) (from 0) -> "1"; after 0.25 -> "0.250000"
      ['t(function() ll.SetPrimitiveParams({PRIM_GLOW, ALL_SIDES, 1}); return ll.List2CSV(ll.GetPrimitiveParams({PRIM_GLOW, 0})) end)', 'string:1'],
      ['t(function() ll.SetPrimitiveParams({PRIM_GLOW, ALL_SIDES, 0.25}); return ll.List2CSV(ll.GetPrimitiveParams({PRIM_GLOW, 0})) end)', 'string:0.250000'],
      // In-world: ll.List2CSV(ll.GetBoundingBox(ll.GetKey())) on a 0.5 m cube
      // -> "<-0.250000, -0.250000, -0.250000>, <0.250000, 0.250000, 0.250000>"
      [csv('ll.GetBoundingBox(ll.GetKey())'), 'string:<-0.250000, -0.250000, -0.250000>, <0.250000, 0.250000, 0.250000>'],
    ])
  })

  it('finds and counts whole and fractional numbers alike', async () => {
    await expectResults([
      // In-world: ll.ListFindList({1, 1.5}, {1}) -> 1; ll.ListFindList({1.5, 2}, {2}) -> 2
      ['t(ll.ListFindList, {1, 1.5}, {1})', 'number:1'],
      ['t(ll.ListFindList, {1.5, 2}, {2})', 'number:2'],
      // In-world: ll.ListFindList({ll.GetAlpha(0)}, {1}) and ({ll.GetNumberOfPrims()}, {1}) -> 1
      ['t(function() return ll.ListFindList({ll.GetAlpha(0)}, {1}) end)', 'number:1'],
      ['t(function() return ll.ListFindList({ll.GetNumberOfPrims()}, {1}) end)', 'number:1'],
      // In-world: ll.ListFindList(ll.GetPrimitiveParams({PRIM_GLOW, 0}), {0}) -> 1 (a float 0 from the rule)
      ['t(function() return ll.ListFindList(ll.GetPrimitiveParams({PRIM_GLOW, 0}), {0}) end)', 'number:1'],
      // In-world: ll.ListFindList({2^31}, {2^31}) -> 1; ll.ListFindList({"1"}, {1}) -> nil
      ['t(ll.ListFindList, {2^31}, {2^31})', 'number:1'],
      ['t(ll.ListFindList, {"1"}, {1})', 'nil:nil'],
      // In-world: ll.ListStatistics(LIST_STAT_SUM, {1, 1.5}) -> 2.5; (LIST_STAT_MAX, {1, 2.5}) -> 2.5; (LIST_STAT_MEAN, {1, 2}) -> 1.5
      ['t(ll.ListStatistics, LIST_STAT_SUM, {1, 1.5})', 'number:2.5'],
      ['t(ll.ListStatistics, LIST_STAT_MAX, {1, 2.5})', 'number:2.5'],
      ['t(ll.ListStatistics, LIST_STAT_MEAN, {1, 2})', 'number:1.5'],
      // In-world: ll.ListStatistics(LIST_STAT_NUM_COUNT, {1, 1.5, "2"}) -> 2
      ['t(ll.ListStatistics, LIST_STAT_NUM_COUNT, {1, 1.5, "2"})', 'number:2'],
    ])
  })

  it('compares, sorts and adds up numbers as 32-bit floats', async () => {
    await expectResults([
      // In-world: ll.ListFindList({16777217}, {16777216}) -> 1, though ll.List2CSV({16777217}) is "16777217"
      ['t(ll.ListFindList, {16777217}, {16777216})', 'number:1'],
      ['t(ll.ListFindList, {16777217}, {16777217})', 'number:1'],
      // In-world: ll.List2CSV(ll.ListSort({16777217, 16777216}, 1, true)) -> "16777216, 16777216"
      ['t(function() return ll.List2CSV(ll.ListSort({16777217, 16777216}, 1, true)) end)', 'string:16777216, 16777216'],
      // In-world: ll.List2CSV(ll.ListSort({16777218, 16777217, 16777216}, 1, true)) -> "16777216, 16777216, 16777218"
      ['t(function() return ll.List2CSV(ll.ListSort({16777218, 16777217, 16777216}, 1, true)) end)', 'string:16777216, 16777216, 16777218'],
      // In-world: ll.List2CSV(ll.ListSort({16777217, 5, 3}, 2, true)), where the length doesn't fit the stride,
      // and ll.List2CSV(ll.ListSortStrided({16777217, 5, 3}, 2, 1, true)) -> "16777216, 5, 3"
      ['t(function() return ll.List2CSV(ll.ListSort({16777217, 5, 3}, 2, true)) end)', 'string:16777216, 5, 3'],
      ['t(function() return ll.List2CSV(ll.ListSortStrided({16777217, 5, 3}, 2, 1, true)) end)', 'string:16777216, 5, 3'],
      // In-world: ll.List2CSV(ll.ListRandomize({16777217}, 1)) -> "16777216";
      // ll.List2CSV(ll.List2ListStrided({16777217, 1}, 1, -1, 1)) -> "16777216, 1"
      ['t(function() return ll.List2CSV(ll.ListRandomize({16777217}, 1)) end)', 'string:16777216'],
      ['t(function() return ll.List2CSV(ll.List2ListStrided({16777217, 1}, 1, -1, 1)) end)', 'string:16777216, 1'],
      // In-world: the list functions SLua runs itself keep the number: ll.List2CSV(ll.List2List({16777217, 1}, 1, 2))
      // -> "16777217, 1"; ll.List2CSV(ll.ListInsertList({16777217}, {1.5}, 1)) -> "1.500000, 16777217"
      ['t(function() return ll.List2CSV(ll.List2List({16777217, 1}, 1, 2)) end)', 'string:16777217, 1'],
      ['t(function() return ll.List2CSV(ll.ListInsertList({16777217}, {1.5}, 1)) end)', 'string:1.500000, 16777217'],
      // In-world: ll.ListFindList({0/0}, {0/0}) -> nil
      ['t(ll.ListFindList, {0/0}, {0/0})', 'nil:nil'],
      // In-world: ll.ListFindListNext({1, 1.5, 1}, {1}, 2) -> 3; ({1, true, 1, true}, {true}, 2) -> 4; (…, {1}, 2) -> 3
      ['t(ll.ListFindListNext, {1, 1.5, 1}, {1}, 2)', 'number:3'],
      ['t(ll.ListFindListNext, {1, true, 1, true}, {true}, 2)', 'number:4'],
      ['t(ll.ListFindListNext, {1, true, 1, true}, {1}, 2)', 'number:3'],
      // In-world: ll.ListStatistics(LIST_STAT_MEAN, {16777217, 16777217}), (LIST_STAT_MIN, {16777217, 16777219}),
      // (LIST_STAT_RANGE, {16777217, 0}), (LIST_STAT_MEDIAN, {16777217}) -> 16777216
      ['t(ll.ListStatistics, LIST_STAT_MEAN, {16777217, 16777217})', 'number:16777216'],
      ['t(ll.ListStatistics, LIST_STAT_MIN, {16777217, 16777219})', 'number:16777216'],
      ['t(ll.ListStatistics, LIST_STAT_RANGE, {16777217, 0})', 'number:16777216'],
      ['t(ll.ListStatistics, LIST_STAT_MEDIAN, {16777217})', 'number:16777216'],
      // In-world: ll.ListStatistics(LIST_STAT_SUM, {0.1, 0.2}) -> 0.30000001192092896; (LIST_STAT_SUM_SQUARES, {3, 4}) -> 25
      ['t(ll.ListStatistics, LIST_STAT_SUM, {0.1, 0.2})', 'number:0.30000001192092896'],
      ['t(ll.ListStatistics, LIST_STAT_SUM_SQUARES, {3, 4})', 'number:25'],
      // In-world: ll.ListStatistics(LIST_STAT_SUM, {16777217, 1}) -> 16777216; (LIST_STAT_MAX, {16777217}) -> 16777216
      ['t(ll.ListStatistics, LIST_STAT_SUM, {16777217, 1})', 'number:16777216'],
      ['t(ll.ListStatistics, LIST_STAT_MAX, {16777217})', 'number:16777216'],
      // In-world: ll.ListStatistics(LIST_STAT_SUM, {16777217, 0.5}) -> 16777216; ({2147483647, 1}) -> 2147483648
      ['t(ll.ListStatistics, LIST_STAT_SUM, {16777217, 0.5})', 'number:16777216'],
      ['t(ll.ListStatistics, LIST_STAT_SUM, {2147483647, 1})', 'number:2147483648'],
    ])
  })

  it('takes a whole number as a JSON specifier', async () => {
    await expectResults([
      // In-world: ll.JsonGetValue("[10,20,30]", {1}) -> "20"; ({0}) -> "10"; ({"1"}) -> "20"; llcompat too
      ['t(ll.JsonGetValue, "[10,20,30]", {1})', 'string:20'],
      ['t(ll.JsonGetValue, "[10,20,30]", {0})', 'string:10'],
      ['t(ll.JsonGetValue, "[10,20,30]", {"1"})', 'string:20'],
      ['t(llcompat.JsonGetValue, "[10,20,30]", {1})', 'string:20'],
      // In-world: ll.JsonGetValue("[10,20,30]", {1.5}) and ({3}) -> JSON_INVALID
      ['t(function() return ll.JsonGetValue("[10,20,30]", {1.5}) == JSON_INVALID end)', 'boolean:true'],
      ['t(function() return ll.JsonGetValue("[10,20,30]", {3}) == JSON_INVALID end)', 'boolean:true'],
      // In-world: ll.JsonGetValue('{"a":[5,6]}', {"a", 1}) -> "6"
      ['t(ll.JsonGetValue, \'{"a":[5,6]}\', {"a", 1})', 'string:6'],
      // In-world: ll.JsonSetValue("[10,20,30]", {1}, "x") -> [10,"x",30]; ({JSON_APPEND}, "x") -> [10,20,30,"x"]
      ['t(ll.JsonSetValue, "[10,20,30]", {1}, "x")', 'string:[10,"x",30]'],
      ['t(ll.JsonSetValue, "[10,20,30]", {JSON_APPEND}, "x")', 'string:[10,20,30,"x"]'],
      // In-world: ll.JsonValueType("[10,[1,2]]", {1, 0}) -> JSON_NUMBER
      ['t(function() return ll.JsonValueType("[10,[1,2]]", {1, 0}) == JSON_NUMBER end)', 'boolean:true'],
      // In-world: ll.JsonSetValue("", {0}, "x") -> ["x"]; ("{}", {1}, "x") and ("", {1}, "x") -> JSON_INVALID
      ['t(ll.JsonSetValue, "", {0}, "x")', 'string:["x"]'],
      ['t(function() return ll.JsonSetValue("{}", {1}, "x") == JSON_INVALID end)', 'boolean:true'],
      ['t(function() return ll.JsonSetValue("", {1}, "x") == JSON_INVALID end)', 'boolean:true'],
    ])
  })

  it('takes a whole number or a boolean in a glTF override list', async () => {
    await expectResults([
      // In-world: with a material on face 0, ll.SetLinkGLTFOverrides(LINK_THIS, 0, {OVERRIDE_GLTF_BASE_ALPHA_MODE,
      // PRIM_GLTF_ALPHA_MODE_MASK, OVERRIDE_GLTF_BASE_DOUBLE_SIDED, true}), then
      // ll.List2CSV(ll.GetPrimitiveParams({PRIM_GLTF_BASE_COLOR, 0}))
      // -> ", <1.000000, 1.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, 0, , , 2, , 1"
      [
        `t(function()
          ll.SetRenderMaterial(U, 0)
          ll.SetLinkGLTFOverrides(LINK_THIS, 0, {OVERRIDE_GLTF_BASE_ALPHA_MODE, PRIM_GLTF_ALPHA_MODE_MASK, OVERRIDE_GLTF_BASE_DOUBLE_SIDED, true})
          return ll.List2CSV(ll.GetPrimitiveParams({PRIM_GLTF_BASE_COLOR, 0}))
        end)`,
        'string:, <1.000000, 1.000000, 0.000000>, <0.000000, 0.000000, 0.000000>, 0, , , 2, , 1',
      ],
    ])
  })

  it('sorts whole and fractional numbers together, unlike LSL', async () => {
    const sort = (list: string, flag: string, lib = 'll') => `t(function() return ll.List2CSV(${lib}.ListSort(${list}, 1, ${flag})) end)`
    await expectResults([
      // In-world: ll.ListSort({3, 1.5, 2}, 1, true) -> 1.500000, 2, 3; llcompat.ListSort({3, 1.5, 2}, 1, 1) -> the same
      [sort('{3, 1.5, 2}', 'true'), 'string:1.500000, 2, 3'],
      [sort('{3, 1.5, 2}', '1', 'llcompat'), 'string:1.500000, 2, 3'],
      // In-world: ll.ListSort({2, 1.5, 1, 0.5}, 1, true) -> 0.500000, 1, 1.500000, 2
      [sort('{2, 1.5, 1, 0.5}', 'true'), 'string:0.500000, 1, 1.500000, 2'],
      // In-world: ll.ListSort({3, 1.5, 2, 2.5, 1}, 1, true) -> 1, 1.500000, 2, 2.500000, 3; false -> 3, 2.500000, 2, 1.500000, 1
      [sort('{3, 1.5, 2, 2.5, 1}', 'true'), 'string:1, 1.500000, 2, 2.500000, 3'],
      [sort('{3, 1.5, 2, 2.5, 1}', 'false'), 'string:3, 2.500000, 2, 1.500000, 1'],
      // In-world: ll.ListSort({3, "b", 1.5, "a", 2}, 1, true) -> 1.500000, a, 2, b, 3: numbers among numbers, strings among strings
      [sort('{3, "b", 1.5, "a", 2}', 'true'), 'string:1.500000, a, 2, b, 3'],
    ])
    const csv = (call: string) => `t(function() return ll.List2CSV(${call}) end)`
    await expectResults([
      // In-world: ll.ListSortStrided({3, 1.5, 2, 2.5, 1}, 1, 1, true) -> 1, 1.500000, 2, 2.500000, 3; false -> 3, 2.500000, 2, 1.500000, 1
      [csv('ll.ListSortStrided({3, 1.5, 2, 2.5, 1}, 1, 1, true)'), 'string:1, 1.500000, 2, 2.500000, 3'],
      [csv('ll.ListSortStrided({3, 1.5, 2, 2.5, 1}, 1, 1, false)'), 'string:3, 2.500000, 2, 1.500000, 1'],
      // In-world: llcompat.ListSortStrided({3, 1.5, 2, 2.5, 1}, 1, 0, 1) -> 1, 1.500000, 2, 2.500000, 3
      [csv('llcompat.ListSortStrided({3, 1.5, 2, 2.5, 1}, 1, 0, 1)'), 'string:1, 1.500000, 2, 2.500000, 3'],
      // In-world: ll.ListSortStrided({"c", 3, "b", 1.5, "a", 2}, 2, 2, true) -> b, 1.500000, a, 2, c, 3;
      // llcompat.ListSortStrided({"c", 3, "b", 1.5, "a", 2}, 2, 1, 1) -> the same
      [csv('ll.ListSortStrided({"c", 3, "b", 1.5, "a", 2}, 2, 2, true)'), 'string:b, 1.500000, a, 2, c, 3'],
      [csv('llcompat.ListSortStrided({"c", 3, "b", 1.5, "a", 2}, 2, 1, 1)'), 'string:b, 1.500000, a, 2, c, 3'],
      // In-world: ll.ListSort({3, "c", 1.5, "b", 2, "a"}, 2, true) -> 1.500000, b, 2, a, 3, c
      [csv('ll.ListSort({3, "c", 1.5, "b", 2, "a"}, 2, true)'), 'string:1.500000, b, 2, a, 3, c'],
      // In-world: ll.ListSort({3, 1.5, 2, V, 2.5, 1}, 1, true) -> 1, 1.500000, 2, <1.000000, 2.000000, 3.000000>, 2.500000, 3
      [csv('ll.ListSort({3, 1.5, 2, V, 2.5, 1}, 1, true)'), 'string:1, 1.500000, 2, <1.000000, 2.000000, 3.000000>, 2.500000, 3'],
      // In-world: ll.ListSort({2^31, 1.5, 2, 2^31 + 1, 1}, 1, true) -> 1, 1.500000, 2, 2147483648.000000, 2147483648.000000
      [csv('ll.ListSort({2^31, 1.5, 2, 2^31 + 1, 1}, 1, true)'), 'string:1, 1.500000, 2, 2147483648.000000, 2147483648.000000'],
      // In-world: sorting a list ll.ListSort returned: ll.ListSort(ll.ListSort({3, 1.5, 2}, 1, false), 1, true) -> 1.500000, 2, 3
      [csv('ll.ListSort(ll.ListSort({3, 1.5, 2}, 1, false), 1, true)'), 'string:1.500000, 2, 3'],
      // In-world: ll.ListSort(ll.GetPrimitiveParams({PRIM_MATERIAL, PRIM_GLOW, 0, PRIM_MATERIAL}), 1, false) -> 3, 3, 0
      // (an integer, a float, an integer from the rules)
      [csv('ll.ListSort(ll.GetPrimitiveParams({PRIM_MATERIAL, PRIM_GLOW, 0, PRIM_MATERIAL}), 1, false)'), 'string:3, 3, 0'],
    ])
    // In-world, the same lists in an LSL script: llListSort([3, 1.5, 2], 1, TRUE) -> 2, 1.500000, 3;
    // llListSort([3, 1.5, 2, 2.5, 1], 1, TRUE) -> 1, 1.500000, 2, 2.500000, 3; FALSE -> 1, 2.500000, 2, 1.500000, 3;
    // llListSort([3, "b", 1.5, "a", 2], 1, TRUE) -> 2, a, 1.500000, b, 3
    const lsl = await loadScript({
      source: `default { state_entry() {
        llSay(7777, llList2CSV(llListSort([3, 1.5, 2], 1, TRUE)));
        llSay(7777, llList2CSV(llListSort([3, 1.5, 2, 2.5, 1], 1, TRUE)));
        llSay(7777, llList2CSV(llListSort([3, 1.5, 2, 2.5, 1], 1, FALSE)));
        llSay(7777, llList2CSV(llListSort([3, "b", 1.5, "a", 2], 1, TRUE)));
      } }`,
    })
    lsl.start()
    expect(lsl.chat.map((c) => c.text)).toEqual([
      '2, 1.500000, 3',
      '1, 1.500000, 2, 2.500000, 3',
      '1, 2.500000, 2, 1.500000, 3',
      '2, a, 1.500000, b, 3',
    ])
  })
})
