import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'
import { NULL_KEY as NULL, Prim } from '@rezless/vm'

const slua = (source: string, options: Record<string, unknown> = {}) =>
  loadScript({ source, language: 'slua', filename: 'test.luau', ...options })

describe('SLua scripts', () => {
  it('runs the script top to bottom when it starts', async () => {
    const s = await slua(`ll.OwnerSay("hello from " .. ll.GetScriptName())`)
    s.start()
    expect(s).toHaveSaid(0, 'hello from test')
  })

  it('delivers events to LLEvents handlers with DetectedEvent objects', async () => {
    const s = await slua(`
      LLEvents:on("touch_start", function(events)
        for _, d in events do
          ll.Say(0, "touched by " .. d:getName() .. " #" .. d:getLinkNumber())
        end
      end)
    `)
    s.start()
    s.fire('touch_start', { num_detected: 2, detected: [{ key: 'k1', name: 'Alice' }, { key: 'k2', name: 'Bob' }] })
    // An unlinked prim is link number 0.
    expect(s.chat.map((c) => c.text)).toEqual(['touched by Alice #0', 'touched by Bob #0'])
  })

  it('runs LLTimers on the virtual clock', async () => {
    const s = await slua(`
      local n = 0
      LLTimers:every(2, function() n += 1; ll.OwnerSay("tick " .. n) end)
      LLTimers:once(3, function() ll.OwnerSay("once") end)
    `)
    s.start()
    s.advanceTime(5000)
    expect(s.chat.map((c) => c.text)).toEqual(['tick 1', 'once', 'tick 2'])
  })

  it('suspends in ll.Sleep and resumes when the clock gets there', async () => {
    const s = await slua(`ll.OwnerSay("a"); ll.Sleep(2); ll.OwnerSay("b")`)
    s.start()
    expect(s.chat.map((c) => c.text)).toEqual(['a', 'b'])
    expect(s.now).toBe(2000)
  })

  it('makes ll indexes 1-based and llcompat keep LSL values', async () => {
    const s = await slua(`
      ll.OwnerSay(tostring(ll.ListFindList({"a", "b", "c"}, {"c"})))
      ll.OwnerSay(tostring(ll.ListFindList({"a"}, {"z"})))
      ll.OwnerSay(tostring(llcompat.ListFindList({"a", "b", "c"}, {"c"})))
      ll.OwnerSay(ll.GetSubString("abcdef", 2, 4))
      ll.OwnerSay(llcompat.GetSubString("abcdef", 2, 4))
      ll.OwnerSay(tostring(ll.SameGroup(ll.GetOwner())))
    `)
    s.start()
    expect(s.chat.map((c) => c.text)).toEqual(['3', 'nil', '2', 'bcd', 'cde', 'true'])
  })

  it('rejects a 0 index in the native ll table', async () => {
    const s = await slua(`ll.OwnerSay(ll.GetSubString("abc", 0, 1))`)
    expect(() => s.start()).toThrow(/passed 0 when a 1-based index was expected/)
    // In-world: ll.GetSubString("abc", 0, 1) in an SLua script -> "<prim> [script:<name>] Script
    // run-time error" and "runtime error" (Aditi, SLua Tideland, 2026-11-13).
    expect(s.chat.map((c) => c.text)).toEqual(['Object [script:test] Script run-time error', 'runtime error'])
  })

  it('gives keys as uuids and lists as tables', async () => {
    const s = await slua(`
      local k = ll.GetKey()
      ll.OwnerSay(typeof(k) .. " " .. tostring(k))
      local parts = ll.ParseString2List("a,b,c", {","}, {})
      ll.OwnerSay(typeof(parts) .. " " .. #parts .. " " .. parts[2])
    `, { objectKey: '11111111-2222-3333-4444-555555555555' })
    s.start()
    expect(s.chat.map((c) => c.text)).toEqual(['uuid 11111111-2222-3333-4444-555555555555', 'table 3 b'])
  })

  it('uses mocks for ll functions', async () => {
    const s = await slua(`ll.OwnerSay("region: " .. ll.GetRegionName())`)
    s.mock('llGetRegionName', () => 'Tideland')
    s.start()
    expect(s).toHaveSaid(0, 'region: Tideland')
  })

  it('reads and writes globals', async () => {
    const s = await slua(`count = 1; LLEvents:on("touch_start", function() count += 1 end)`)
    s.start()
    s.fire('touch_start', { num_detected: 1, detected: [{ key: 'k', name: 'A' }] })
    expect(s.global('count')).toBe(2)
    s.setGlobal('count', 10)
    s.fire('touch_start', { num_detected: 1, detected: [{ key: 'k', name: 'A' }] })
    expect(s.global('count')).toBe(11)
  })

  it('crashes on a run-time error, as SL reports it', async () => {
    // In-world: indexing nil in an SLua script -> the prim said "<prim>
    // [script:<name>] Script run-time error" and "runtime error" on
    // DEBUG_CHANNEL (Aditi, SLua Tideland, 2026-11-13). The Lua message stays
    // on the error rezless throws.
    const s = await slua(`local t = nil; ll.OwnerSay(t.x)`)
    expect(() => s.start()).toThrow(/attempt to index nil/)
    expect(s.chat.map((c) => c.text)).toEqual(['Object [script:test] Script run-time error', 'runtime error'])
  })

  it('reports a compile error when loading', async () => {
    await expect(slua(`local x = `)).rejects.toThrow(/test\.luau:1:/)
  })

  it('starts over on ll.ResetScript', async () => {
    const s = await slua(`
      runs = (runs or 0) + 1
      ll.OwnerSay("run")
      LLEvents:on("touch_start", function() ll.ResetScript() end)
    `)
    s.start()
    s.fire('touch_start', { num_detected: 1, detected: [{ key: 'k', name: 'A' }] })
    expect(s.chat.map((c) => c.text)).toEqual(['run', 'run'])
    expect(s.global('runs')).toBe(1)
  })

  it('captures print()', async () => {
    const s = await slua(`print("a", 1, true)`)
    s.start()
    expect(s.printed).toEqual(['a\t1\ttrue'])
  })
})

describe('SLua beside LSL', () => {
  it('exchanges link messages with an LSL script in the same object', async () => {
    const { loadLinkset } = await import('../src/index.js')
    const { scripts } = await loadLinkset({
      prims: [
        {
          name: 'Root',
          scripts: [
            {
              name: 'pinger',
              source: { filename: 'pinger.lsl', source: `default { touch_start(integer n) { llMessageLinked(LINK_SET, 7, "ping", NULL_KEY); }
                link_message(integer s, integer n, string m, key id) { if (m == "pong") llOwnerSay("got pong " + (string)n); } }` },
            },
            {
              name: 'ponger',
              source: { filename: 'ponger.luau', source: `
                LLEvents:on("link_message", function(sender, num, msg, id)
                  if msg == "ping" then ll.MessageLinked(LINK_SET, num + 1, "pong", NULL_KEY) end
                end)` },
            },
          ],
        },
      ],
    })
    scripts['pinger']!.start()
    scripts['ponger']!.start()
    scripts['pinger']!.fire('touch_start', { num_detected: 1 })
    expect(scripts['pinger']!).toHaveSaid(0, 'got pong 8')
  })
})

describe('SLua coverage', () => {
  const source = `
local function classify(n)
  if n > 10 then
    return "big"
  elseif n > 5 then
    return "medium"
  else
    return "small"
  end
end
LLEvents:on("touch_start", function(events)
  local label = #events > 1 and "many" or "one"
  for i = 1, #events do
    ll.OwnerSay(label .. " " .. classify(i * 6))
  end
end)
local unused = function() return 1 end
`

  it('counts statements, both outcomes of each branch, and functions', async () => {
    const s = await slua(source, { coverage: true })
    s.start()
    s.fire('touch_start', { num_detected: 2, detected: [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }] })
    expect(s.chat.map((c) => c.text)).toEqual(['many medium', 'many big'])
    const report = s.coverage!
    const fn = (name: string) => report.functions.find((f) => f.name === name)!
    expect(fn('classify').hits).toBe(2)
    expect(fn('touch_start')).toMatchObject({ kind: 'event', state: 'LLEvents', hits: 1 })
    expect(fn('unused').hits).toBe(0)
    const branch = (line: number, kind: string) => report.branches.find((b) => b.line === line && b.kind === kind)!
    expect(branch(3, 'if').hits).toEqual([1, 1]) // n > 10: once each way
    expect(branch(5, 'if').hits).toEqual([1, 0]) // n > 5: the else arm never ran
    expect(branch(12, 'and').hits).toEqual([1, 0]) // #events > 1 was true
    expect(branch(13, 'for').hits).toEqual([2, 1]) // two iterations, one exit
    const statement = (line: number) => report.statements.find((st) => st.line === line)!
    expect(statement(8).hits).toBe(0) // return "small"
    expect(statement(14).hits).toBe(2)
  })

  it('keeps counts across ll.ResetScript', async () => {
    const s = await slua(`ll.OwnerSay("start"); LLEvents:on("touch_start", function() ll.ResetScript() end)`, { coverage: true })
    s.start()
    s.fire('touch_start', { num_detected: 1, detected: [{ key: 'a', name: 'A' }] })
    expect(s.coverage!.statements.find((st) => st.line === 1)!.hits).toBe(2)
  })
})

describe('SLua values and errors', () => {
  it('passes booleans, vectors and quaternions to ll functions and back', async () => {
    const s = await slua(`
      ll.SetStatus(STATUS_PHANTOM, true)
      ll.OwnerSay(tostring(ll.GetStatus(STATUS_PHANTOM)))
      ll.SetPos(vector(1, 2, 3))
      ll.OwnerSay(tostring(ll.GetPos()))
      ll.SetRot(quaternion(0, 0, 1, 0))
      ll.OwnerSay(tostring(ll.GetRot()))
    `)
    s.start()
    // llGetStatus is boolean-like, so SLua returns a boolean.
    expect(s.chat.map((c) => c.text)).toEqual(['true', '<1, 2, 3>', '<0, 0, 1, 0>'])
  })

  it('converts list arguments element by element', async () => {
    const s = await slua(`ll.OwnerSay(ll.List2CSV({1, 2.5, "a", true, vector(1, 2, 3), ll.GetOwner()}))`)
    s.start()
    expect(s.chat[0]!.text).toMatch(/^1, 2\.500000, a, 1, <1\.000000, 2\.000000, 3\.000000>, [0-9a-f-]{36}$/)
  })

  it('refuses a list holding something LSL lists cannot, as SLua does', async () => {
    // The wording is measured in slua-arguments.test.ts.
    for (const element of ['{3}', 'print']) {
      const s = await slua(`ll.OwnerSay(ll.List2CSV({1, ${element}}))`)
      expect(() => s.start()).toThrow(/invalid argument #-1 to 'List2CSV' \(Don't know how to decode this\)/)
    }
    const hole = await slua(`ll.OwnerSay(ll.List2CSV({1, nil, 1}))`)
    expect(() => hole.start()).toThrow(/invalid argument #-1 to 'List2CSV' \(Can't have undefined in an argument\)/)
  })

  it('raises SLua errors for missing and wrong-typed arguments', async () => {
    // In-world: ll.SetPos() -> Fewer arguments than expected, 0 < 1 (Aditi, SLua Tideland, 2026-11-13)
    const missing = await slua(`ll.SetPos()`)
    expect(() => missing.start()).toThrow(/Fewer arguments than expected, 0 < 1/)
    const wrong = await slua(`ll.SetPos("here")`)
    expect(() => wrong.start()).toThrow(/invalid argument #1 to 'SetPos' \(vector expected, got string\)/)
    const nil = await slua(`ll.SetRot(nil)`)
    expect(() => nil.start()).toThrow(/invalid argument #1 to 'SetRot' \(quaternion expected, got nil\)/)
  })

  it('fills in a mock result that is missing, and types an untyped list from a mock', async () => {
    const s = await slua(`
      ll.OwnerSay(tostring(ll.GetPos()) .. " " .. tostring(ll.GetRot()) .. " " .. #ll.GetPrimitiveParams({PRIM_SIZE}) .. " [" .. ll.GetObjectDesc() .. "]")
      local d = ll.GetObjectDetails(ll.GetKey(), {OBJECT_POS})
      ll.OwnerSay(typeof(d[1]) .. " " .. typeof(d[2]) .. " " .. typeof(d[3]) .. " " .. typeof(d[4]) .. " " .. typeof(d[5]))
    `)
    for (const name of ['llGetPos', 'llGetRot', 'llGetPrimitiveParams', 'llGetObjectDesc']) s.mock(name, () => undefined)
    s.mock('llGetObjectDetails', () => [1, 2.5, 'a', { x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: 0, s: 1 }])
    s.start()
    expect(s.chat.map((c) => c.text)).toEqual(['<0, 0, 0> <0, 0, 0, 1> 0 []', 'number number string vector quaternion'])
  })

  it('passes boolean event parameters as booleans', async () => {
    const s = await slua(`LLEvents:on("transaction_result", function(id, success, data) ll.OwnerSay(typeof(success) .. " " .. tostring(success)) end)`)
    s.start()
    s.fire('transaction_result', { id: NULL, success: 1, data: '' })
    expect(s).toHaveSaid(0, 'boolean true')
  })

  it('reports memory as SLua counts it', async () => {
    const s = await slua(`ll.OwnerSay(tostring(ll.GetUsedMemory() > 0) .. " " .. tostring(ll.GetFreeMemory() + ll.GetUsedMemory()))`)
    s.start()
    expect(s.chat[0]!.text).toBe(`true ${s.memoryLimit}`)
  })

  it('stops on ll.Die as an LSL script does', async () => {
    // rezless lets the call after llDie finish, then halts: the same for both languages.
    const lsl = await loadScript({ source: 'default { state_entry() { llDie(); llOwnerSay("after"); llOwnerSay("never"); } }' })
    lsl.start()
    const s = await slua(`ll.Die(); ll.OwnerSay("after"); ll.OwnerSay("never")`)
    s.start()
    expect(s.dead).toBe(true)
    expect(s.chat.map((c) => c.text)).toEqual(lsl.chat.map((c) => c.text))
  })

  it('ignores events nothing listens for', async () => {
    const s = await slua(`ll.OwnerSay("up")`)
    s.start()
    s.fire('touch_start', { num_detected: 1, detected: [{ key: 'k', name: 'A' }] })
    expect(s.handles('touch_start')).toBe(false)
    expect(s.chat.map((c) => c.text)).toEqual(['up'])
  })

  it('throws reading a global that is nil', async () => {
    const s = await slua(`x = 1`)
    s.start()
    expect(() => s.global('missing')).toThrow(/undefined variable 'missing'/)
    expect(s.language).toBe('slua')
  })

  it('copies into another prim fresh, sharing coverage', async () => {
    const s = await slua(`ll.OwnerSay("hi")`, { coverage: true })
    s.start()
    const other = new Prim({ key: '22222222-2222-2222-2222-222222222222', name: 'Other' })
    s.linkset.addPrim(other)
    const copy = s.copyTo(other, { fresh: true })
    expect(copy.language).toBe('slua')
    copy.start()
    expect(copy).toHaveSaid(0, 'hi')
    expect(s.coverage!.statements[0]!.hits).toBe(2)
  })
})

describe('loadLinkset with SLua', () => {
  it('rejects an LSL script that does not parse, and an SLua one that does not compile', async () => {
    const { loadLinkset } = await import('../src/index.js')
    await expect(loadLinkset({ prims: [{ name: 'R', scripts: [{ source: { source: 'default {', filename: 'a.lsl' } }] }] })).rejects.toThrow()
    await expect(
      loadLinkset({ prims: [{ name: 'R', scripts: [{ source: { source: 'local =', filename: 'a.luau' } }] }] }),
    ).rejects.toThrow(/a\.luau:1:/)
  })
})

describe('SLua starting', () => {
  it('runs the script first when an event arrives before start()', async () => {
    const s = await slua(`ll.OwnerSay("up"); LLEvents:on("touch_start", function() ll.OwnerSay("touched") end)`)
    s.fire('touch_start', { num_detected: 1, detected: [{ key: 'k', name: 'A' }] })
    expect(s.chat.map((c) => c.text)).toEqual(['up', 'touched'])
  })

  it('runs the script when started the way inventory starts a script', async () => {
    const s = await slua(`ll.OwnerSay("up")`)
    s.queueStart()
    s.advanceTime(1)
    expect(s).toHaveSaid(0, 'up')
  })

  it('takes integer values where LSL wants integers', async () => {
    // In-world, with two = ll.GetListEntryType({1}, 1): ll.Say(two, "x") -> no error;
    // ll.GetSubString("abcdef", two, two) -> "b"; ll.List2String({"a", "b", "c"}, two) -> "b";
    // ll.IntegerToBase64(two) -> "AAAAAg==" (Aditi, SLua Tideland, 2026-11-13)
    const s = await slua(`
      local two = ll.GetListEntryType({1}, 1)
      ll.Say(two, "x")
      ll.OwnerSay(ll.GetSubString("abcdef", two, two) .. ll.List2String({"a", "b", "c"}, two) .. ll.IntegerToBase64(two))
    `)
    s.start()
    expect(s.chat.map((c) => c.text)).toEqual(['x', 'bbAAAAAg=='])
  })
})

describe('SLua as SLua runs it', () => {
  it('sleeps in an ll call made inside a coroutine or a metamethod', async () => {
    const s = await slua(`
      local co = coroutine.wrap(function() ll.Sleep(1); ll.OwnerSay("co " .. ll.GetTime()) end)
      co()
      local t = setmetatable({}, { __index = function() ll.Sleep(2); return ll.GetTime() end })
      ll.OwnerSay("meta " .. t.x)
    `)
    s.start()
    // The coroutine breaks at once. A metamethod is not a point SLua can break
    // at, so its sleep waits for the next one: here, the end of the script.
    expect(s.chat.map((c) => c.text)).toEqual(['co 1', 'meta 1'])
    expect(s.now).toBe(3000)
  })

  it('stops for ll.ResetScript and ll.Die even inside pcall', async () => {
    const reset = await slua(`
      n = (n or 0) + 1
      ll.OwnerSay("run")
      LLEvents:on("touch_start", function() print(pcall(ll.ResetScript)); ll.OwnerSay("not reached") end)
    `)
    reset.start()
    reset.fire('touch_start', { num_detected: 1 })
    expect(reset.chat.map((c) => c.text)).toEqual(['run', 'run'])
    expect(reset.printed).toEqual([])
    const die = await slua(`ll.Die(); print(pcall(ll.OwnerSay, "after")); print(pcall(ll.OwnerSay, "never"))`)
    die.start()
    expect(die.dead).toBe(true)
    expect(die.printed).toEqual([])
  })

  it('stops a script whose ll call throws, and lets the error reach the test', async () => {
    const s = await slua(`print(pcall(ll.GetRegionName))`)
    s.mock('llGetRegionName', () => {
      throw new Error('mock blew up')
    })
    expect(() => s.start()).toThrow(/mock blew up/)
    expect(s.printed).toEqual([])
  })

  it('passes link_message ids as strings', async () => {
    const s = await slua(`LLEvents:on("link_message", function(_, _, _, id) ll.OwnerSay(typeof(id) .. " " .. id) end)`)
    s.start()
    s.fire('link_message', { sender_num: 1, num: 0, str: '', id: 'not a key' })
    expect(s).toHaveSaid(0, 'string not a key')
  })

  it('has 128 KiB of memory, enforced with memoryLimit', async () => {
    const limit = await slua(`ll.OwnerSay(tostring(ll.GetMemoryLimit()))`)
    limit.start()
    expect(limit).toHaveSaid(0, '131072')
    const big = `local t = {} for i = 1, 100000 do t[i] = tostring(i) end ll.OwnerSay("done")`
    const unlimited = await slua(big)
    unlimited.start()
    expect(unlimited).toHaveSaid(0, 'done')
    const limited = await slua(big, { memoryLimit: true })
    expect(() => limited.start()).toThrow(/not enough memory/)
  })

  it('refuses handlers for events SLua does not deliver', async () => {
    const s = await slua(`LLEvents:on("bogus", function() end)`)
    expect(() => s.start()).toThrow(/'bogus' is not a supported event name/)
    const removed = await slua(`LLEvents:on("touch_start", function() end); LLEvents:off("touch_start", function() end)`)
    removed.start()
  })

  // The argument checks below were measured in-world with one script that called
  // each function under pcall and said the result (Aditi, SLua Tideland, 2026-11-13).
  const KEY = '5748decc-f629-461c-9a36-a35a221fe21f'
  const DEBUG = 2147483647

  it('takes a uuid for a string parameter, as its text', async () => {
    // In-world: each of these calls with u = touuid(KEY) ran without error,
    // llcompat.PlaySound included, whether the definitions type the parameter
    // `string | uuid` (the sound functions, StopAnimation, SetTexture) or
    // `string` (the rest). After
    // SetTexture(u, 0) on a plywood face, GetTexture(0) read back u's text.
    const s = await slua(`
      local u = touuid("${KEY}")
      ll.PlaySound(u, 1)
      ll.StopAnimation(u)
      ll.LinkPlaySound(LINK_THIS, u, 1, 0)
      ll.TriggerSound(u, 1)
      ll.LoopSound(u, 1)
      ll.SetTexture(u, 0)
      ll.StartAnimation(u)
      ll.Say(7778, u)
      ll.SetText(u, vector(1, 1, 1), 1)
      llcompat.PlaySound(u, 1)
      ll.OwnerSay(tostring(ll.GetTexture(0)))
    `)
    s.start()
    const args = (name: string) => s.calls.filter((c) => c.name === name).map((c) => c.args)
    expect(args('llPlaySound')).toEqual([[KEY, 1], [KEY, 1]])
    expect(args('llStopAnimation')).toEqual([[KEY]])
    expect(args('llLinkPlaySound')).toEqual([[-4, KEY, 1, 0]])
    expect(args('llTriggerSound')).toEqual([[KEY, 1]])
    expect(args('llLoopSound')).toEqual([[KEY, 1]])
    expect(args('llSetTexture')).toEqual([[KEY, 0]])
    expect(s.chat.map((c) => c.text)).toContain(KEY)
    expect(args('llStartAnimation')).toEqual([[KEY]])
    expect(args('llSay')).toEqual([[7778, KEY]])
    expect(args('llSetText')[0]![0]).toBe(KEY)
  })

  it('reads a uuid passed as a string the way LSL reads that text', async () => {
    const s = await slua(`
      local u = touuid("${KEY}")
      ll.OwnerSay(tostring(ll.StringLength(u)))
      ll.OwnerSay(tostring(llcompat.StringLength(u)))
      ll.OwnerSay(ll.GetSubString(u, 1, 4))
      ll.OwnerSay(ll.InsertString("ab", 1, u))
      ll.OwnerSay(ll.ReplaceSubString(u, "-", "+", 0))
      ll.OwnerSay(tostring(ll.SubStringIndex("x${KEY}x", u)))
      ll.OwnerSay(ll.MD5String(u, 0))
      ll.OwnerSay(ll.List2CSV(ll.ParseString2List(u, {"-"}, {})))
    `)
    s.start()
    // In-world: StringLength(u) -> 36 (ll and llcompat), GetSubString(u, 1, 4) -> "5748",
    // InsertString("ab", 1, u) -> u's text then "ab", ReplaceSubString(u, "-", "+", 0) -> the
    // text with "+", SubStringIndex("x" .. text .. "x", u) -> 2, MD5String(u, 0) ->
    // c12a494dc9187526ef87f474d890e612, ParseString2List(u, {"-"}, {}) -> 5748decc, f629,
    // 461c, 9a36, a35a221fe21f.
    expect(s.chat.map((c) => c.text)).toEqual([
      '36',
      '36',
      '5748',
      `${KEY}ab`,
      '5748decc+f629+461c+9a36+a35a221fe21f',
      '2',
      'c12a494dc9187526ef87f474d890e612',
      '5748decc, f629, 461c, 9a36, a35a221fe21f',
    ])
  })

  it('takes a uuid in the other functions measured', async () => {
    // In-world: each call ran without a Lua error. What OwnerSay delivered can't
    // be heard by a listener; Say, Whisper and RegionSayTo delivered u's text
    // (next test).
    const s = await slua(`
      local u = touuid("${KEY}")
      ll.OwnerSay(u)
      ll.Whisper(7778, u)
      ll.RegionSay(7778, u)
      ll.SetTouchText(u)
      ll.SetSitText(u)
      ll.StopSound()
      ll.ListenRemove(ll.Listen(7778, u, NULL_KEY, u))
      ll.StringTrim(u, STRING_TRIM)
      ll.DeleteSubString(u, 1, 2)
      ll.EscapeURL(u)
      ll.StringToBase64(u)
      ll.SHA1String(u)
      ll.ComputeHash(u, "md5")
      ll.Ord(u, 1)
      ll.CSV2List(u)
      ll.JsonValueType(u, {})
      ll.GetInventoryType(u)
      ll.GetInventoryKey(u)
      ll.Name2Key(u)
      ll.GetEnv(u)
      ll.LinksetDataRead(u)
      ll.GetNotecardLine(u, 1)
      ll.OwnerSay("done")
    `)
    s.start()
    expect(s.chat.filter((c) => c.channel === 0).map((c) => c.text)).toEqual([KEY, 'done'])
  })

  it('takes a uuid for a later string parameter too', async () => {
    const s = await slua(`
      local u = touuid("${KEY}")
      ll.Say(7778, u)
      ll.Whisper(7778, u)
      ll.RegionSayTo(ll.GetOwner(), 7778, u)
      ll.Dialog(ll.GetOwner(), u, {"ok"}, -7779)
    `)
    s.start()
    // In-world: a listener heard u's text from Say, Whisper and RegionSayTo.
    // Dialog ran without a Lua error or a DEBUG_CHANNEL message.
    expect(s.chat.filter((c) => c.channel === 7778).map((c) => c.text)).toEqual([KEY, KEY, KEY])
    expect(s.calls.find((c) => c.name === 'llDialog')!.args[1]).toBe(KEY)
    expect(s.chat.filter((c) => c.channel === DEBUG)).toEqual([])
    // In-world: invalid argument #3 to 'RegionSayTo' (string expected, got number).
    const number = await slua(`ll.RegionSayTo(ll.GetOwner(), 7778, 5)`)
    expect(() => number.start()).toThrow("invalid argument #3 to 'RegionSayTo' (string expected, got number)")
  })

  it('does not read a uuid or a number as a string inside a list', async () => {
    // In-world: each call returned without a Lua error, and the object said
    // "llDialog: button list must contain only strings" on DEBUG_CHANNEL.
    for (const call of [
      `ll.Dialog(ll.GetOwner(), "m", {touuid("${KEY}")}, -7779)`,
      `ll.Dialog(ll.GetOwner(), "m", {1, 2}, -7779)`,
      `ll.Dialog(ll.GetOwner(), "m", {1.5}, -7779)`,
      `llcompat.Dialog(ll.GetOwner(), "m", {touuid("${KEY}")}, -7779)`,
    ]) {
      const s = await slua(`${call}; ll.OwnerSay("after")`)
      s.start()
      expect(s.chat.map((c) => [c.channel, c.text]), call).toEqual([
        [DEBUG, 'llDialog: button list must contain only strings'],
        [0, 'after'],
      ])
    }
  })

  it('ignores a uuid or a number among separators and spacers', async () => {
    const s = await slua(`
      local K = "${KEY}"
      local u = touuid(K)
      local function parse(...) local r = ll.ParseString2List(...); ll.OwnerSay(#r .. ":" .. ll.List2CSV(r)) end
      parse("a" .. K .. "b", {u}, {})
      parse("a" .. K .. "b", {K}, {})
      parse("a5b", {5}, {})
      parse("a5b", {"5"}, {})
      parse("a" .. K .. "b", {}, {u})
      parse("a5b", {}, {5})
      parse("a1.5b", {1.5}, {})
    `)
    s.start()
    // In-world: only the string separators split; the rest gave the source back whole.
    expect(s.chat.map((c) => c.text)).toEqual([
      `1:a${KEY}b`,
      '2:a, b',
      '1:a5b',
      '2:a, b',
      `1:a${KEY}b`,
      '1:a5b',
      '1:a1.5b',
    ])
  })

  it('reads the null uuid as its 36 characters, and has no uuid for text that is not one', async () => {
    const s = await slua(`
      ll.OwnerSay(tostring(ll.StringLength(touuid(""))))
      ll.OwnerSay(tostring(ll.StringLength(uuid(""))))
      ll.OwnerSay(tostring(ll.StringLength(NULL_KEY)))
      ll.OwnerSay(tostring(touuid("garbage")))
      ll.OwnerSay(tostring(uuid("5748DECC-F629-461C-9A36-A35A221FE21F")))
    `)
    s.start()
    // In-world: 36, 36, 36, nil, and the upper-case text in lower case.
    expect(s.chat.map((c) => c.text)).toEqual(['36', '36', '36', 'nil', KEY])
    // In-world: these raised exactly these messages.
    const cases: Array<[string, string]> = [
      ['ll.StringLength(touuid("garbage"))', "invalid argument #1 to 'StringLength' (string expected, got nil)"],
      ['ll.StringLength(uuid("garbage"))', "invalid argument #1 to 'uuid' (Unable to convert to UUID)"],
    ]
    for (const [source, error] of cases) {
      const s = await slua(source)
      expect(() => s.start(), source).toThrow(error)
    }
  })

  it('delivers a uuid sent as link_message text as a string', async () => {
    const s = await slua(`
      LLEvents:on("link_message", function(sender, num, str, id)
        ll.OwnerSay(typeof(str) .. ":" .. str .. " " .. typeof(id) .. ":" .. id)
      end)
      ll.MessageLinked(LINK_THIS, 7, touuid("${KEY}"), touuid("${KEY}"))
      ll.MessageLinked(LINK_THIS, 8, "s", "not a key")
    `)
    s.start()
    s.advanceTime(100)
    // In-world: the handler got string:<text> string:<text>, then string:s string:not a key.
    expect(s.chat.map((c) => c.text)).toEqual([`string:${KEY} string:${KEY}`, 'string:s string:not a key'])
  })

  it('refuses a number, nil, boolean, table or vector for a string parameter', async () => {
    // In-world: each call raised exactly this message.
    const cases: Array<[string, string]> = [
      ['ll.OwnerSay(1.5)', "invalid argument #1 to 'OwnerSay' (string expected, got number)"],
      ['ll.OwnerSay(3)', "invalid argument #1 to 'OwnerSay' (string expected, got number)"],
      ['ll.Say(7778, 5)', "invalid argument #2 to 'Say' (string expected, got number)"],
      ['ll.StringLength(5)', "invalid argument #1 to 'StringLength' (string expected, got number)"],
      ['llcompat.StringLength(5)', "invalid argument #1 to 'StringLength' (string expected, got number)"],
      ['ll.GetSubString(12345, 1, 2)', "invalid argument #1 to 'GetSubString' (string expected, got number)"],
      ['ll.PlaySound(5, 1)', "invalid argument #1 to 'PlaySound' (string expected, got number)"],
      ['ll.MessageLinked(LINK_THIS, 7, 5, "")', "invalid argument #3 to 'MessageLinked' (string expected, got number)"],
      ['ll.PlaySound(nil, 1)', "invalid argument #1 to 'PlaySound' (string expected, got nil)"],
      ['ll.PlaySound(true, 1)', "invalid argument #1 to 'PlaySound' (string expected, got boolean)"],
      ['ll.PlaySound({}, 1)', "invalid argument #1 to 'PlaySound' (string expected, got table)"],
      ['ll.PlaySound(vector(1, 2, 3), 1)', "invalid argument #1 to 'PlaySound' (string expected, got vector)"],
      ['ll.StringLength(nil)', "invalid argument #1 to 'StringLength' (string expected, got nil)"],
      ['ll.StringLength(false)', "invalid argument #1 to 'StringLength' (string expected, got boolean)"],
    ]
    for (const [source, error] of cases) {
      const s = await slua(source)
      expect(() => s.start(), source).toThrow(error)
    }
    // In-world: ll.OwnerSay(ll.GetListEntryType({1}, 1)) -> invalid argument #1 to 'OwnerSay'
    // (string expected, got integer); ll.StringLength and ll.ToUpper refuse it the same way
    // (Aditi, SLua Tideland, 2026-11-13)
    for (const name of ['OwnerSay', 'StringLength', 'ToUpper']) {
      const integer = await slua(`ll.${name}(ll.GetListEntryType({1}, 1))`)
      expect(() => integer.start()).toThrow(`invalid argument #1 to '${name}' (string expected, got integer)`)
    }
  })

  it('leaves the functions SLua runs in its own VM to check their own string arguments', async () => {
    // In-world: ToUpper(5) -> "5", ToUpper(1.5) -> "1.5", llcompat.ToUpper(5) -> "5",
    // ToUpper(0.1) -> "0.1", ToUpper(1/0) -> "INF", ToLower(5) -> "5", ToLower(1.5) -> "1.5".
    const s = await slua(`
      for _, v in {ll.ToUpper(5), ll.ToUpper(1.5), llcompat.ToUpper(5), ll.ToUpper(0.1), ll.ToUpper(1/0), ll.ToLower(5), ll.ToLower(1.5)} do
        ll.OwnerSay(v)
      end
    `)
    s.start()
    expect(s.chat.map((c) => c.text)).toEqual(['5', '1.5', '5', '0.1', 'INF', '5', '1.5'])
    // In-world: each call raised exactly this message.
    const cases: Array<[string, string]> = [
      [`ll.ToUpper(touuid("${KEY}"))`, "invalid argument #1 to 'ToUpper' (string expected, got uuid)"],
      [`llcompat.ToUpper(touuid("${KEY}"))`, "invalid argument #1 to 'ToUpper' (string expected, got uuid)"],
      [`ll.ToLower(touuid("${KEY}"))`, "invalid argument #1 to 'ToLower' (string expected, got uuid)"],
      ['ll.ToUpper(nil)', "invalid argument #1 to 'ToUpper' (string expected, got nil)"],
      ['ll.ToUpper(true)', "invalid argument #1 to 'ToUpper' (string expected, got boolean)"],
      [
        `ll.DumpList2String({1, 2}, touuid("${KEY}"))`,
        "invalid argument #2 to 'DumpList2String' (string expected, got uuid)",
      ],
      ['ll.DumpList2String({1, 2}, 5)', "invalid argument #2 to 'DumpList2String' (string expected, got number)"],
    ]
    for (const [source, error] of cases) {
      const s = await slua(source)
      expect(() => s.start(), source).toThrow(error)
    }
  })

  it('takes a string or a uuid for a uuid parameter, and nothing else', async () => {
    const s = await slua(`
      ll.OwnerSay("[" .. ll.Key2Name("garbage") .. "]")
      ll.OwnerSay("[" .. ll.Key2Name(touuid("${KEY}")) .. "]")
      ll.OwnerSay(tostring(ll.GetOwnerKey("5748decc")))
    `)
    s.start()
    // In-world: Key2Name("garbage") -> "", Key2Name(u) -> "", GetOwnerKey("5748decc") -> the null uuid.
    expect(s.chat.map((c) => c.text)).toEqual(['[]', '[]', NULL])
    // In-world: each call raised exactly this message.
    const cases: Array<[string, string]> = [
      ['ll.Key2Name(5)', "invalid argument #1 to 'Key2Name' (uuid expected, got number)"],
      ['llcompat.Key2Name(5)', "invalid argument #1 to 'Key2Name' (uuid expected, got number)"],
      ['ll.Key2Name(nil)', "invalid argument #1 to 'Key2Name' (uuid expected, got nil)"],
      ['ll.Key2Name(false)', "invalid argument #1 to 'Key2Name' (uuid expected, got boolean)"],
      ['ll.Key2Name({})', "invalid argument #1 to 'Key2Name' (uuid expected, got table)"],
      ['ll.Key2Name(vector(1, 2, 3))', "invalid argument #1 to 'Key2Name' (uuid expected, got vector)"],
      ['ll.MessageLinked(LINK_THIS, 7, "", 5)', "invalid argument #4 to 'MessageLinked' (uuid expected, got number)"],
    ]
    for (const [source, error] of cases) {
      const s = await slua(source)
      expect(() => s.start(), source).toThrow(error)
    }
  })

  it('takes numeric strings for numbers, and booleans for integers', async () => {
    const s = await slua(`ll.Say("-5", "x"); ll.SetAlpha(" 0.5 ", ALL_SIDES)`)
    s.start()
    expect(s.calls.map((c) => c.args)).toEqual([[-5, 'x'], [0.5, -1]])
    const flag = await slua(`ll.AllowInventoryDrop(true)`)
    flag.start()
    expect(flag.calls.find((c) => c.name === 'llAllowInventoryDrop')!.args).toEqual([1])
    // In-world: ll.Say(true, "x") -> heard on channel 1; ll.SetAlpha(true, 0) -> (number expected, got boolean)
    // (Aditi, SLua Tideland, 2026-11-13)
    const channel = await slua(`ll.Say(true, "x")`)
    channel.start()
    expect(channel).toHaveSaid(1, 'x')
    const notFloat = await slua(`ll.SetAlpha(true, 0)`)
    expect(() => notFloat.start()).toThrow(/invalid argument #1 to 'SetAlpha' \(number expected, got boolean\)/)
    const notNumber = await slua(`ll.SetAlpha("half", ALL_SIDES)`)
    expect(() => notNumber.start()).toThrow(/invalid argument #1 to 'SetAlpha' \(number expected, got string\)/)
  })

  it('runs the top level once, whatever state_entry events arrive', async () => {
    const s = await slua(`ll.OwnerSay("up")`)
    s.start()
    s.fire('state_entry')
    expect(s.chat.map((c) => c.text)).toEqual(['up'])
  })

  it('keeps one clock for ll.GetTime, os.clock and LLTimers, restarting on reset', async () => {
    const s = await slua(`
      LLEvents:on("touch_start", function()
        ll.OwnerSay(ll.GetTime() .. " " .. os.clock())
        if ll.GetTime() > 4 then ll.ResetScript() end
      end)
    `)
    s.start()
    s.advanceTime(5000)
    s.fire('touch_start', { num_detected: 1 })
    s.fire('touch_start', { num_detected: 1 })
    s.advanceTime(2000)
    s.fire('touch_start', { num_detected: 1 })
    expect(s.chat.map((c) => c.text)).toEqual(['5 5', '0 0', '2 2'])
  })

  it('reports error objects that are not strings', async () => {
    const s = await slua(`error({})`)
    expect(() => s.start()).toThrow(/error object is a table value/)
  })
})

describe('SLua coverage instrumentation', () => {
  it('does not change what the script does or how much memory it uses', async () => {
    const source = `
      local t = {}
      for i = 1, 50 do t[i] = (i % 3 == 0 and "fizz") or (i % 5 == 0 and "buzz") or tostring(i) end
      ll.OwnerSay(table.concat(t, ",") .. " " .. ll.GetUsedMemory())
    `
    const plain = await slua(source, { coverage: false })
    plain.start()
    const covered = await slua(source, { coverage: true })
    covered.start()
    expect(covered.chat.map((c) => c.text)).toEqual(plain.chat.map((c) => c.text))
  })

  it('adds its counters to the script only when covering', async () => {
    const source = `ll.OwnerSay(typeof(__rz_s))`
    const plain = await slua(source, { coverage: false })
    plain.start()
    const covered = await slua(source, { coverage: true })
    covered.start()
    expect([plain.chat[0]!.text, covered.chat[0]!.text]).toEqual(['nil', 'function'])
  })

  it('counts each term of nested and/or chains, and skips constant conditions', async () => {
    const s = await slua(
      [
        'local a, b, c = true, false, true',
        'local x = a and (b or c)',
        'while true do break end',
        'if false then print("never") end',
        'type T = { n: number }',
        'local y: T = { n = 1 }',
      ].join('\n'),
      { coverage: true },
    )
    s.start()
    const branches = s.coverage!.branches.map((b) => `${b.kind}@${b.line}:${b.hits.join('/')}`)
    expect(branches).toEqual(['and@2:1/0', 'or@2:0/1'])
  })
})

describe('SLua edges', () => {
  it('names the real type of a wrong argument', async () => {
    const cases: Array<[string, RegExp]> = [
      ['ll.Say(coroutine.create(print), "x")', /'Say' \(number expected, got thread\)/],
      ['ll.SetAlpha({}, 0)', /'SetAlpha' \(number expected, got table\)/],
      ['ll.OwnerSay({})', /'OwnerSay' \(string expected, got table\)/],
      ['ll.Key2Name(5)', /invalid argument #1 to 'Key2Name' \(uuid expected, got number\)/],
      ['ll.List2CSV("x")', /invalid argument #1 to 'List2CSV' \(expected a table\)/],
    ]
    for (const [source, error] of cases) {
      const s = await slua(source)
      expect(() => s.start(), source).toThrow(error)
    }
  })

  it('passes negative indexes through to LSL', async () => {
    const s = await slua(`ll.OwnerSay(ll.GetSubString("abcdef", -3, -1))`)
    s.start()
    expect(s).toHaveSaid(0, 'def')
  })

  it('converts index and boolean results from mocks', async () => {
    const s = await slua(`ll.OwnerSay(tostring(ll.ListFindList({}, {})) .. " " .. tostring(ll.SameGroup(ll.GetOwner())))`)
    s.mock('llListFindList', () => -5)
    s.mock('llSameGroup', () => 0)
    s.start()
    expect(s).toHaveSaid(0, '-5 false')
  })

  it('passes a false boolean event parameter as false', async () => {
    const s = await slua(`LLEvents:on("transaction_result", function(id, success, data) ll.OwnerSay(tostring(success)) end)`)
    s.start()
    s.fire('transaction_result', { id: NULL, success: 0, data: '' })
    expect(s).toHaveSaid(0, 'false')
  })

  it('reads a global table as a list of its LSL values', async () => {
    const s = await slua(`t = {1, print, "a", vector(1, 2, 3)}`)
    s.start()
    expect(s.global('t')).toEqual([1, 'a', { x: 1, y: 2, z: 3 }])
  })

  it('resets and copies afresh without coverage', async () => {
    const s = await slua(`ll.OwnerSay("run"); LLEvents:on("touch_start", function() ll.ResetScript() end)`, { coverage: false })
    s.start()
    s.fire('touch_start', { num_detected: 1 })
    expect(s.chat.map((c) => c.text)).toEqual(['run', 'run'])
    expect(s.coverage).toBeNull()
    const other = new Prim({ key: '22222222-2222-2222-2222-222222222222', name: 'Other' })
    s.linkset.addPrim(other)
    const copy = s.copyTo(other, { fresh: true })
    copy.start()
    expect(copy).toHaveSaid(0, 'run')
    expect(copy.coverage).toBeNull()
  })

  it('builds from source without options, and tells LSL from SLua', async () => {
    const { Script } = await import('@rezless/vm')
    const s = Script.fromSlua(`print("hi")`)
    s.start()
    expect(s.printed).toEqual(['hi'])
    const lsl = await loadScript({ source: 'default { state_entry() {} }' })
    expect([s.language, lsl.language]).toEqual(['slua', 'lsl'])
  })
})

describe('SLua review follow-ups', () => {
  it('logs the memory queries SLua answers itself', async () => {
    const s = await slua(`ll.GetUsedMemory(); ll.GetFreeMemory()`)
    s.start()
    expect(s.calls.map((c) => c.name)).toEqual(['llGetUsedMemory', 'llGetFreeMemory'])
  })

  it('passes list floats to LSL as 32-bit floats', async () => {
    // In-world: ll.List2CSV({1e15}) -> "999999986991104.000000", the 32-bit float nearest it
    // (Aditi, SLua Tideland, 2026-11-13)
    const s = await slua(`ll.OwnerSay(ll.List2CSV({1e15, 16777217}))`)
    s.start()
    expect(s).toHaveSaid(0, '999999986991104.000000, 16777217')
  })

  it('runs the top level to the end when state_entry is the first event', async () => {
    const s = await slua(`ll.Sleep(1); ll.OwnerSay("awake")`)
    s.fire('state_entry')
    expect(s).toHaveSaid(0, 'awake')
    s.fire('state_entry')
    expect(s.chat.length).toBe(1)
  })

  it('lets go of a removed fresh copy, keeping its coverage', async () => {
    const s = await slua(`ll.OwnerSay("hi"); LLEvents:on("touch_start", function() ll.Die() end)`, { coverage: true })
    s.start()
    const other = new Prim({ key: '22222222-2222-2222-2222-222222222222', name: 'Other' })
    s.linkset.addPrim(other)
    const copy = s.copyTo(other, { fresh: true })
    copy.start()
    copy.fire('touch_start', { num_detected: 1 })
    expect(copy.dead).toBe(true)
    expect(s.coverage!.statements[0]!.hits).toBe(2)
    // Counted once, however often the copy is marked dead.
    copy.markDead()
    expect(s.coverage!.statements[0]!.hits).toBe(2)
    expect(s.coverage!.functions.find((f) => f.kind === 'event')!.hits).toBe(1)
  })
})

describe('SLua as its host runs it', () => {
  it('counts and limits memory a handler holds', async () => {
    const used = await slua(`LLEvents:on("touch_start", function()
      local t = {} for i = 1, 3000 do t[i] = "s" .. i end
      ll.OwnerSay(tostring(ll.GetUsedMemory() > 50000))
    end)`)
    used.start()
    used.fire('touch_start', { num_detected: 1 })
    expect(used).toHaveSaid(0, 'true')
    const limited = await slua(`LLEvents:on("touch_start", function()
      local t = {} for i = 1, 20000 do t[i] = "s" .. i end
      ll.OwnerSay("done")
    end)`, { memoryLimit: true })
    limited.start()
    expect(() => limited.fire('touch_start', { num_detected: 1 })).toThrow(/not enough memory/)
  })

  it('carries on with a fresh handler thread after a handler fails', async () => {
    const s = await slua(`LLEvents:on("touch_start", function(e) print("touch") error("boom") end)`)
    s.start()
    expect(() => s.fire('touch_start', { num_detected: 1 })).toThrow(/boom/)
    s.running = true
    expect(() => s.fire('touch_start', { num_detected: 1 })).toThrow(/boom/)
    expect(s.printed).toEqual(['touch', 'touch'])
  })

  it('gives scripts the libraries SLua does', async () => {
    const s = await slua(`print(typeof(getfenv), typeof(setfenv), typeof(ares), typeof(lljson), typeof(llbase64), gcinfo() == ll.GetUsedMemory() / 1024)`)
    s.start()
    expect(s.printed).toEqual(['nil\tnil\tnil\ttable\ttable\ttrue'])
  })

  it('refuses unhooking an event SLua does not deliver', async () => {
    const s = await slua(`LLEvents:off("bogus", print)`)
    expect(() => s.start()).toThrow(/'bogus' is not a supported event name/)
  })

  it('does not count a for loop left by break as finished', async () => {
    const s = await slua(['for i = 1, 3 do if i == 2 then break end end', 'for _, v in {1, 2} do do break end end', 'for i = 1, 2 do while true do break end end'].join('\n'), { coverage: true })
    s.start()
    const loops = s.coverage!.branches.filter((b) => b.kind === 'for' || b.kind === 'for-in').map((b) => `${b.line}:${b.hits.join('/')}`)
    expect(loops).toEqual(['1:2/0', '2:1/0', '3:2/1'])
  })

  it('dies without coverage', async () => {
    const s = await slua('ll.Die(); ll.OwnerSay("bye")', { coverage: false })
    s.start()
    expect(s.dead).toBe(true)
    s.linkset.remove()
    expect(s.coverage).toBeNull()
  })

  it('counts code that runs after ll.Die', async () => {
    const s = await slua('ll.Die()\nlocal x = 1\nll.OwnerSay("bye")', { coverage: true })
    s.start()
    expect(s.chat.map((c) => c.text)).toEqual(['bye'])
    expect(s.coverage!.statements.map((st) => st.hits)).toEqual([1, 1, 1])
  })
})

describe('SLua third review', () => {
  it('stops a dying script at a memory query, as at any ll call', async () => {
    for (const query of ['ll.GetUsedMemory()', 'll.GetFreeMemory()']) {
      const s = await slua(`ll.Die(); ${query}; print("after")`)
      s.start()
      expect(s.printed, query).toEqual([])
    }
  })

  it('counts a branch on a call that returns several values', async () => {
    const s = await slua('local function f() return true, 7 end\nif f() then print("yes") end', { coverage: true })
    s.start()
    expect(s.printed).toEqual(['yes'])
    expect(s.coverage!.branches.map((b) => b.hits)).toEqual([[1, 0]])
  })
})

describe('SLua parameter types from the definitions', () => {
  it('lets selector lists take whole numbers, and statistics read numbers as floats', async () => {
    const s = await slua(`
      ll.OwnerSay(tostring(#ll.GetObjectDetails(ll.GetKey(), {OBJECT_NAME, OBJECT_DESC})))
      ll.OwnerSay(tostring(ll.ListStatistics(LIST_STAT_MEAN, {1, 2.5})))
      ll.OwnerSay(tostring(ll.ListStatistics(LIST_STAT_SUM, {2147483648})))
    `)
    s.start()
    // In-world: ll.ListStatistics(LIST_STAT_SUM, {2147483647, 1}) -> 2147483648, past int32
    // (Aditi, SLua Tideland, 2026-11-13)
    expect(s.chat.map((c) => c.text)).toEqual(['2', '1.75', '2147483648'])
  })

  it('takes a uuid as llMessageLinked text', async () => {
    const s = await slua(`ll.MessageLinked(LINK_SET, 0, ll.GetKey(), NULL_KEY)`)
    s.start()
    expect(s.calls[1]!.args[2]).toBe(s.host.key)
  })
})

describe('SLua code size', () => {
  it('refuses to run a script whose code takes all its memory, with memoryLimit', async () => {
    // A literal the compiler can't fold away, so it stays in the bytecode.
    const source = `print("${'x'.repeat(140000)}")`
    const limited = await slua(source, { memoryLimit: true })
    expect(() => limited.start()).toThrow(/not enough memory/)
    expect(limited.printed).toEqual([])
    expect(limited.chat.map((c) => c.text)).toEqual(['Object [script:test] Script run-time error', 'not enough memory'])
    const unlimited = await slua(source)
    unlimited.start()
    expect(unlimited.printed[0]!.length).toBe(140000)
  })
})

describe('SLua numbers in rule lists', () => {
  it('sends whole numbers as the integers a rule wants', async () => {
    const s = await slua(`
      ll.OwnerSay(tostring(ll.SetPrimMediaParams(0, {PRIM_MEDIA_CURRENT_URL, "https://example.com"})))
      ll.OwnerSay(ll.List2CSV(ll.GetPrimMediaParams(0, {PRIM_MEDIA_CURRENT_URL})))
      ll.ParticleSystem({PSYS_PART_FLAGS, PSYS_PART_EMISSIVE_MASK, PSYS_PART_START_ALPHA, 1})
    `)
    s.start()
    expect(s.chat.map((c) => c.text)).toEqual(['0', 'https://example.com'])
    expect(s.host.particles).not.toBeNull()
  })

  it('formats them as integers', async () => {
    // In-world: ll.List2CSV({1}) -> "1"; ll.List2CSV({1.5}) -> "1.500000" (Aditi, SLua Tideland, 2026-11-13)
    const s = await slua(`ll.OwnerSay(ll.List2CSV({1, 2, 2.5}))`)
    s.start()
    expect(s).toHaveSaid(0, '1, 2, 2.500000')
  })
})

describe('SLua memory profiling', () => {
  it('tracks the VM peak from ll.ScriptProfiler to ll.GetSPMaxMemory', async () => {
    const s = await slua(`
      ll.ScriptProfiler(PROFILE_SCRIPT_MEMORY)
      local t = {} for i = 1, 1000 do t[i] = "s" .. i end
      local live = ll.GetUsedMemory()
      t = nil
      ll.ScriptProfiler(PROFILE_NONE)
      local peak = ll.GetSPMaxMemory()
      ll.OwnerSay(tostring(peak >= live) .. " " .. tostring(live > 20000))
    `)
    s.start()
    expect(s).toHaveSaid(0, 'true true')
    expect(s.calls.map((c) => c.name)).toContain('llGetSPMaxMemory')
  })
})
