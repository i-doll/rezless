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
    expect(s).toHaveSaid(0x7fffffff, 'Script run-time error')
    expect(s.chat.at(-1)!.text).toMatch(/passed 0 when a 1-based index was expected/)
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
    const s = await slua(`local t = nil; ll.OwnerSay(t.x)`)
    expect(() => s.start()).toThrow(/attempt to index nil/)
    expect(s).toHaveSaid(0x7fffffff, 'Script run-time error')
    expect(s.chat.at(-1)!.text).toMatch(/attempt to index nil/)
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

  it('converts list arguments element by element, dropping nested tables', async () => {
    const s = await slua(`ll.OwnerSay(ll.List2CSV({1, 2.5, {3}, "a", true, vector(1, 2, 3), print}))`)
    s.start()
    const text = s.chat[0]!.text
    expect(text).toMatch(/^1\.000000, 2\.500000, a, 1, <1\.000000, 2\.000000, 3\.000000>, function/)
  })

  it('raises SLua errors for missing and wrong-typed arguments', async () => {
    const missing = await slua(`ll.SetPos()`)
    expect(() => missing.start()).toThrow(/missing argument #1 to 'SetPos' \(vector expected\)/)
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

  it('fails a script that yields outside of an ll call', async () => {
    const s = await slua(`coroutine.yield()`)
    expect(() => s.start()).toThrow(/yielded outside of an ll call/)
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
    const copy = s.copyTo(other)
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

  it('takes integer values and numbers where LSL wants integers and strings', async () => {
    const s = await slua(`ll.Say(integer.create(0), "a"); ll.OwnerSay(5)`)
    s.start()
    expect(s.chat.map((c) => c.text)).toEqual(['a', '5'])
  })
})
