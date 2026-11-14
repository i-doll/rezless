import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

const DEBUG_CHANNEL = 2147483647

const slua = (source: string, options: { memoryLimit?: boolean } = {}) =>
  loadScript({ source, language: 'slua', filename: 'lua_script', ...options })

const texts = (s: Awaited<ReturnType<typeof slua>>, channel = 0) => s.chat.filter((c) => c.channel === channel).map((c) => c.text)

/** Run `source` from the top and return what it said to its owner. */
const said = async (source: string, options: { memoryLimit?: boolean } = {}) => {
  const s = await slua(source, options)
  s.start()
  return texts(s)
}

const touch = (s: Awaited<ReturnType<typeof slua>>) => s.fire('touch_start', { num_detected: 1 })

// Every measurement cited below: Aditi, SLua Tideland, 2026-11-14, one SLua script per group.
describe('coroutine.running() in SLua', () => {
  it('is nil wherever the script itself runs', async () => {
    // In-world, at the top level: typeof(coroutine.running()) -> nil; through pcall -> nil; in an xpcall handler,
    // an __index metamethod and a table.sort comparator -> nil; tostring -> nil, and select("#", ...) -> 1.
    // coroutine.isyieldable() -> true at the top level and through pcall.
    expect(
      await said(`
        local r = function() return typeof(coroutine.running()) end
        ll.OwnerSay("top " .. r() .. " " .. tostring(coroutine.isyieldable()))
        ll.OwnerSay("pcall " .. typeof(select(2, pcall(coroutine.running))) .. " " .. tostring(select(2, pcall(coroutine.isyieldable))))
        ll.OwnerSay("handler " .. tostring(select(2, xpcall(function() error("x") end, r))))
        ll.OwnerSay("metamethod " .. setmetatable({}, {__index = r}).x)
        local seen
        table.sort({2, 1}, function(a, b) seen = r() return a < b end)
        ll.OwnerSay("comparator " .. seen)
        ll.OwnerSay("values " .. tostring(coroutine.running()) .. " " .. select("#", coroutine.running()))
      `),
    ).toEqual(['top nil true', 'pcall nil true', 'handler nil', 'metamethod nil', 'comparator nil', 'values nil 1'])
  })

  it('is the coroutine inside one', async () => {
    // In-world: in a coroutine, coroutine.running() -> a thread equal to the coroutine, status "running", also
    // through pcall; in a coroutine it started -> that one, with the outer one "normal"; in coroutine.wrap -> a
    // thread; back at the top level after the resume -> nil.
    expect(
      await said(`
        local co
        co = coroutine.create(function()
          local me = coroutine.running()
          ll.OwnerSay("co " .. typeof(me) .. " " .. tostring(me == co) .. " " .. coroutine.status(me) .. " " .. tostring(select(2, pcall(coroutine.running)) == co))
          local inner
          inner = coroutine.create(function()
            ll.OwnerSay("inner " .. tostring(coroutine.running() == inner) .. " " .. coroutine.status(co))
          end)
          coroutine.resume(inner)
        end)
        coroutine.resume(co)
        ll.OwnerSay("wrap " .. coroutine.wrap(function() return typeof(coroutine.running()) end)())
        ll.OwnerSay("top " .. typeof(coroutine.running()))
      `),
    ).toEqual(['co thread true running true', 'inner true normal', 'wrap thread', 'top nil'])
  })

  it('is nil in a handler and a timer callback, and the coroutine in one resumed from there', async () => {
    // In-world: in a touch_start handler, an LLTimers:once callback and an LLTimers:every callback,
    // typeof(coroutine.running()) -> nil, also through pcall, and coroutine.isyieldable() -> true. A coroutine
    // made at the top level and resumed from each of them saw itself, and each read nil again afterwards.
    const s = await slua(`
      local r = function() return typeof(coroutine.running()) end
      local co
      co = coroutine.create(function()
        while true do
          coroutine.yield()
          ll.OwnerSay("resumed " .. tostring(coroutine.running() == co))
        end
      end)
      coroutine.resume(co)
      local function report(where)
        ll.OwnerSay(where .. " " .. r() .. " " .. typeof(select(2, pcall(coroutine.running))) .. " " .. tostring(coroutine.isyieldable()))
        coroutine.resume(co)
        ll.OwnerSay(where .. " after " .. r())
      end
      LLTimers:once(1, function() report("once") end)
      local every
      every = LLTimers:every(2.5, function() report("every") LLTimers:off(every) end)
      LLEvents:on("touch_start", function() report("touch") end)
    `)
    s.start()
    s.advanceTime(3000)
    touch(s)
    touch(s)
    const each = (where: string) => [`${where} nil nil true`, 'resumed true', `${where} after nil`]
    expect(texts(s)).toEqual([...each('once'), ...each('every'), ...each('touch'), ...each('touch')])
  })

  it('stays nil in a handler that an event was fired into, and keeps that handler intact', async () => {
    // Second Life queues events, so this has no measurement: only a mock that fires into the script it serves
    // runs one handler inside another.
    const s = await slua(`
      LLEvents:on("touch_start", function()
        local keep = {}
        for i = 1, 200 do keep[i] = "k" .. i end
        ll.OwnerSay("before " .. typeof(coroutine.running()))
        ll.GetObjectDesc()
        local sum = 0
        for i = 1, 200 do sum += #keep[i] end
        ll.OwnerSay("after " .. typeof(coroutine.running()) .. " " .. sum)
      end)
      LLEvents:on("link_message", function()
        for r = 1, 50 do local g = {} for i = 1, 2000 do g[i] = {i, "x" .. i} end end
        ll.OwnerSay("inside " .. typeof(coroutine.running()))
      end)
    `)
    s.start()
    let fired = false
    s.mock('llGetObjectDesc', () => {
      if (!fired) s.fire('link_message', { sender_num: 0, num: 1, str: 'x', id: '' })
      fired = true
      return 'd'
    })
    touch(s)
    touch(s)
    expect(texts(s)).toEqual(['before nil', 'inside nil', 'after nil 692', 'before nil', 'after nil 692'])
  })

  it('carries on from a yield on the script thread, which returns nothing', async () => {
    // In-world, at the top level: pcall(coroutine.yield) -> true and nothing else; select("#", coroutine.yield())
    // -> 0; select("#", coroutine.yield(1, 2)) -> 0 and select("#", pcall(coroutine.yield, 1, 2)) -> 1, and the
    // script went on at once. The same three lines from a touch_start handler, on each of two touches.
    const body = `
      local r = table.pack(pcall(coroutine.yield))
      ll.OwnerSay("pcall " .. tostring(r[1]) .. " " .. r.n)
      ll.OwnerSay("bare " .. select("#", coroutine.yield()))
      ll.OwnerSay("values " .. select("#", coroutine.yield(1, 2)) .. " " .. select("#", pcall(coroutine.yield, 1, 2)))
    `
    const lines = ['pcall true 1', 'bare 0', 'values 0 1']
    expect(await said(body)).toEqual(lines)
    const s = await slua(`LLEvents:on("touch_start", function() ${body} end)`)
    s.start()
    touch(s)
    touch(s)
    expect(texts(s)).toEqual([...lines, ...lines])
  })
})

describe('coroutine.yield() where the script thread cannot yield', () => {
  it('fails in a metamethod and an xpcall handler, and carries on in a comparator and a gsub callback', async () => {
    // In-world, at the top level, each under pcall: coroutine.yield(1) in an __index and in a __tostring
    // metamethod -> false, "attempt to yield across metamethod/C-call boundary"; in an xpcall handler -> false,
    // "error in error handling"; in a table.sort comparator -> true, and the table was sorted; in a string.gsub
    // callback -> true, "zb".
    expect(
      await said(`
        local function show(label, ok, v) ll.OwnerSay(label .. " " .. tostring(ok) .. " " .. tostring(v)) end
        show("index", pcall(function() return setmetatable({}, {__index = function() coroutine.yield(1) return 5 end}).x end))
        show("tostring", pcall(function() return tostring(setmetatable({}, {__tostring = function() coroutine.yield(1) return "t" end})) end))
        show("handler", xpcall(function() error("x", 0) end, function() coroutine.yield(1) return "h" end))
        show("sort", pcall(function() local t = {2, 1} table.sort(t, function(a, b) coroutine.yield(1) return a < b end) return t[1] end))
        show("gsub", pcall(function() return (string.gsub("ab", "a", function() coroutine.yield(1) return "z" end)) end))
      `),
    ).toEqual([
      'index false attempt to yield across metamethod/C-call boundary',
      'tostring false attempt to yield across metamethod/C-call boundary',
      'handler false error in error handling',
      'sort true 1',
      'gsub true zb',
    ])
  })
})

describe('SLua memory errors', () => {
  const REC = `
    local depth = 0
    local function rec(n) depth = n return 1 + rec(n + 1) end
  `

  it('lets pcall catch the memory error of a runaway recursion', async () => {
    // In-world: pcall(rec, 1) with rec counting its depth -> false, "not enough memory", at depth 1212, with
    // 130329 of 131072 bytes in use straight after it (743 free) and the script still running. A second
    // pcall(rec, 1) gave the same answer at the same depth. On the next touch the script answered, with 4151 bytes
    // in use. (The depth moves by one with the locals the top level holds, so the test takes 1201 to 1219.)
    const s = await slua(
      `${REC}
      LLEvents:on("touch_start", function() ll.OwnerSay("touch " .. tostring(ll.GetUsedMemory() < 8000)) end)
      for _ = 1, 2 do
        local ok, e = pcall(rec, 1)
        ll.OwnerSay(tostring(ok) .. " " .. tostring(e) .. " " .. tostring(depth > 1200 and depth < 1220) .. " " .. tostring(ll.GetFreeMemory() < 4096))
      end`,
      { memoryLimit: true },
    )
    s.start()
    touch(s)
    expect(texts(s)).toEqual(['false not enough memory true true', 'false not enough memory true true', 'touch true'])
  })

  it('runs out between 1500 and 2000 calls deep', async () => {
    // In-world: a function calling itself to a set depth and reading ll.GetUsedMemory() at the bottom, each under
    // pcall: 1000 deep -> 76742 bytes; 1100 -> 107462; 1300 -> 115654; 1500 -> 125894; 2000, 3000, 5000, 10000,
    // 19000 and 25000 -> "not enough memory".
    expect(
      await said(
        `local function down(n, max) if n == max then return ll.GetUsedMemory() end return (down(n + 1, max)) end
        for _, n in {1000, 1500, 2000, 25000} do
          local ok, v = pcall(down, 0, n)
          ll.OwnerSay(n .. " " .. (ok and tostring(v > 70000 and v < 131072) or v))
        end`,
        { memoryLimit: true },
      ),
    ).toEqual(['1000 true', '1500 true', '2000 not enough memory', '25000 not enough memory'])
  })

  it('stops a script whose recursion nothing catches', async () => {
    // In-world: rec(1) at the top level put "Script run-time error" and then "not enough memory" on DEBUG_CHANNEL,
    // and the script answered no touch afterwards. The same from a touch_start handler: the first touch said the
    // two lines, the next two touches nothing.
    const top = await slua(`${REC} LLEvents:on("touch_start", function() ll.OwnerSay("alive") end) rec(1)`, { memoryLimit: true })
    expect(() => top.start()).toThrow('not enough memory')
    touch(top)
    expect(texts(top, DEBUG_CHANNEL)).toEqual(['Script run-time error', 'not enough memory'])
    expect(texts(top)).toEqual([])

    const handler = await slua(`${REC} LLEvents:on("touch_start", function() ll.OwnerSay("alive") rec(1) end)`, { memoryLimit: true })
    handler.start()
    expect(() => touch(handler)).toThrow('not enough memory')
    touch(handler)
    expect(texts(handler, DEBUG_CHANNEL)).toEqual(['Script run-time error', 'not enough memory'])
    expect(texts(handler)).toEqual(['alive'])
  })

  it('lets pcall, xpcall and coroutine.resume catch an allocation past the limit', async () => {
    // In-world, in this order: pcall of string.rep("x", 200000) -> false, "not enough memory"; of
    // string.rep("y", 100000) -> true; of buffer.create(200000) and of table.create(20000, 0) -> false, "not
    // enough memory"; coroutine.resume of a coroutine filling a table for ever -> false, "not enough memory";
    // pcall of a function filling a table with strings for ever -> false, "not enough memory" after 3388 strings
    // with 131040 bytes in use and 32 free, and 6623 in use once the table was dropped; xpcall of the first one
    // with a handler -> the handler's result. The script answered a touch afterwards.
    const s = await slua(
      `local t = {}
      local n = 0
      local function fill() while true do n += 1 t[n] = "s" .. n end end
      local co = coroutine.create(function() local c = {} local i = 0 while true do i += 1 c[i] = "c" .. i end end)
      local function try(label, ok, e) ll.OwnerSay(label .. " " .. tostring(ok) .. " " .. tostring(e)) end
      LLEvents:on("touch_start", function() ll.OwnerSay("alive") end)
      try("rep 200000", pcall(function() return #string.rep("x", 200000) end))
      try("rep 100000", pcall(function() return #string.rep("y", 100000) end))
      try("buffer", pcall(function() return buffer.len(buffer.create(200000)) end))
      try("table", pcall(function() return #table.create(20000, 0) end))
      local resumed, why = coroutine.resume(co)
      co = nil
      try("coroutine", resumed, why)
      local ok, e = pcall(fill)
      local used, free = ll.GetUsedMemory(), ll.GetFreeMemory()
      t = nil
      try("fill", ok, e)
      ll.OwnerSay(tostring(n > 3000 and n < 3700) .. " " .. tostring(used > 130900) .. " " .. tostring(free < 172) .. " " .. tostring(ll.GetUsedMemory() < 9000))
      try("xpcall", xpcall(function() return #string.rep("x", 200000) end, function(m) return "handled:" .. tostring(m) end))`,
      { memoryLimit: true },
    )
    s.start()
    touch(s)
    expect(texts(s)).toEqual([
      'rep 200000 false not enough memory',
      'rep 100000 true 100000',
      'buffer false not enough memory',
      'table false not enough memory',
      'coroutine false not enough memory',
      'fill false not enough memory',
      'true true true true',
      'xpcall false handled:not enough memory',
      'alive',
    ])
  })

  it('gives back the stack a handler grew when the handler ends', async () => {
    // In-world: with 5288 bytes in use, a call 1000 deep read 77384 at the bottom and 77405 after returning; 77384
    // still after ll.Sleep(4) and after making and dropping 300 small tables, all in the same run. An LLTimers
    // callback 9 seconds on read 4452. A touch read 4157, 77122 after the same call 1000 deep, and the next touch
    // 4157 again.
    const s = await slua(
      `local used = ll.GetUsedMemory
      local function down(n, max) if n == max then return used() end return (down(n + 1, max)) end
      local function deep(where)
        ll.OwnerSay(where .. " " .. tostring(used() < 8000))
        pcall(down, 0, 1000)
        ll.OwnerSay(where .. " after " .. tostring(used() > 70000))
      end
      LLEvents:on("touch_start", function() deep("touch") end)
      LLTimers:once(9, function() ll.OwnerSay("timer " .. tostring(used() < 8000)) end)
      deep("top")
      ll.Sleep(4)
      local t = {}
      for i = 1, 300 do t[i] = {i} end
      t = nil
      ll.OwnerSay("top later " .. tostring(used() > 70000))`,
      { memoryLimit: true },
    )
    s.start()
    s.advanceTime(10000)
    touch(s)
    touch(s)
    expect(texts(s)).toEqual([
      'top true',
      'top after true',
      'top later true',
      'timer true',
      'touch true',
      'touch after true',
      'touch true',
      'touch after true',
    ])
  })
})

describe('llcompat.SetMemoryLimit in SLua', () => {
  it('refuses a limit below what the script uses, and takes one equal to it', async () => {
    // In-world, after llcompat.SetMemoryLimit(100000), with nothing allocated between reading ll.GetUsedMemory()
    // and the call: used + 4000, + 2000, + 1000, + 500, + 200, + 100, + 64, + 32, + 16, + 8, + 4, + 2, + 1 and
    // + 0 -> 1 each, and ll.GetMemoryLimit() is then the new limit; used - 1 and used - 100 -> 0, limit unchanged.
    // From the default limit, one script each: used - 1 -> 0, 131072; used -> 1; used + 1 -> 1;
    // llcompat.SetMemoryLimit(ll.GetUsedMemory()) -> 1; llcompat.SetMemoryLimit(ll.GetUsedMemory() - 1) -> 0.
    expect(
      await said(`
        local set, used, lim = llcompat.SetMemoryLimit, ll.GetUsedMemory, ll.GetMemoryLimit
        local D = {4000, 16, 1, 0, -1, -100}
        local res = table.create(#D * 2, 0)
        set(100000)
        for i = 1, #D do
          local before = used()
          res[i * 2 - 1] = set(before + D[i])
          res[i * 2] = lim() - before
        end
        local same = set(used())
        local below = set(used() - 1)
        set(131072)
        for i = 1, #D do ll.OwnerSay(D[i] .. " -> " .. res[i * 2 - 1] .. " " .. res[i * 2]) end
        ll.OwnerSay(same .. " " .. below)
      `),
    ).toEqual(['4000 -> 1 4000', '16 -> 1 16', '1 -> 1 1', '0 -> 1 0', '-1 -> 0 0', '-100 -> 0 0', '1 0'])
  })

  it('counts what the script allocated since it read its use', async () => {
    // In-world, one script each: local u = ll.GetUsedMemory(), then a string built from u (25 bytes more in
    // use), then llcompat.SetMemoryLimit(u) -> 0; llcompat.SetMemoryLimit(u + 1) in the same way -> 0.
    expect(
      await said(`
        local u = ll.GetUsedMemory()
        local label = "used " .. u
        ll.OwnerSay(llcompat.SetMemoryLimit(u) .. " " .. llcompat.SetMemoryLimit(u + 1) .. " " .. ll.GetMemoryLimit())
      `),
    ).toEqual(['0 0 131072'])
  })

  it('stops the script at a lowered limit', async () => {
    // In-world: llcompat.SetMemoryLimit(40000) -> 1, ll.GetFreeMemory() 35456; a pcall filling a table with
    // strings for ever -> "not enough memory" with 39961 bytes in use and 858 strings; after dropping 100 of
    // them, llcompat.SetMemoryLimit(used - 1000) -> 0, limit still 40000; (60000) -> 1 and the fill went on to
    // 59963 bytes; (131072) -> 1 and it went on to 131045. (How close to the limit a fill stops depends on where
    // its table next grows, so the test takes anything within 4096 bytes.)
    expect(
      await said(
        `local t = {}
        local function fill() local n = #t while true do n += 1 t[n] = "s" .. n end end
        local function drop(k) for i = #t, #t - k + 1, -1 do t[i] = nil end end
        local function upTo(limit)
          local set = llcompat.SetMemoryLimit(limit)
          local ok, e = pcall(fill)
          local used = ll.GetUsedMemory()
          drop(100)
          ll.OwnerSay(limit .. " " .. set .. " " .. tostring(e) .. " " .. tostring(used > limit - 4096 and used <= limit))
        end
        upTo(40000)
        ll.OwnerSay(llcompat.SetMemoryLimit(ll.GetUsedMemory() - 1000) .. " " .. ll.GetMemoryLimit())
        upTo(60000)
        upTo(131072)`,
        { memoryLimit: true },
      ),
    ).toEqual(['40000 1 not enough memory true', '0 40000', '60000 1 not enough memory true', '131072 1 not enough memory true'])
  })

  it('fails every allocation once the limit is what the script uses', async () => {
    // In-world, one script each: after llcompat.SetMemoryLimit(ll.GetUsedMemory()) -> 1, pcall(string.rep, "x", 64)
    // -> false, "not enough memory", and so did a pcall of a function calling itself 200 deep;
    // llcompat.SetMemoryLimit(131072) -> 1 afterwards. (Making a function at that limit ended the script in-world
    // with "not enough memory". rezless charges nothing for a function without upvalues, so it carries on there.)
    expect(
      await said(
        `local function down(n) if n == 0 then return 0 end return (down(n - 1)) end
        local a = llcompat.SetMemoryLimit(ll.GetUsedMemory())
        local ok, e = pcall(string.rep, "x", 64)
        local ok2, e2 = pcall(down, 200)
        local b = llcompat.SetMemoryLimit(131072)
        ll.OwnerSay(a .. " " .. tostring(e) .. " / " .. tostring(e2) .. " " .. b)`,
        { memoryLimit: true },
      ),
    ).toEqual(['1 not enough memory / not enough memory 1'])
  })

  it('keeps a limit close to what the script uses from one event to the next', async () => {
    // In-world: a script that set its limit to what it used plus 4000, 2000 and so on down to plus 0 carried on
    // after each, and a script at 40000 took a touch.
    const s = await slua(
      `local set, used = llcompat.SetMemoryLimit, ll.GetUsedMemory
      LLEvents:on("touch_start", function() ll.OwnerSay("touch") end)
      ll.OwnerSay("top")
      set(used() + 200)`,
      { memoryLimit: true },
    )
    s.start()
    touch(s)
    expect(texts(s)).toEqual(['top', 'touch'])
    expect(s.memoryLimit).toBeLessThan(3300)
  })

  it('keeps a lowered limit through ll.ResetScript', async () => {
    // In-world: llcompat.SetMemoryLimit(50000) -> 1, then ll.ResetScript(); the script started again with
    // ll.GetMemoryLimit() 50000 and ll.GetFreeMemory() + ll.GetUsedMemory() 50000. With the limit at what the
    // script used plus 1000 before the reset, it started again and read that limit, with 1000 bytes fewer in use.
    const reset = (limit: string, options = {}) =>
      slua(
        `if ll.GetObjectDesc() == "again" then
          ll.SetObjectDesc("done")
          ll.OwnerSay("restarted")
          ll.OwnerSay("after " .. ll.GetMemoryLimit() .. " " .. (ll.GetFreeMemory() + ll.GetUsedMemory()))
        else
          ll.SetObjectDesc("again")
          local used = ll.GetUsedMemory()
          llcompat.SetMemoryLimit(${limit})
          ll.ResetScript()
        end`,
        options,
      )
    const s = await reset('50000')
    s.start()
    s.advanceTime(1000)
    expect(texts(s)).toEqual(['restarted', 'after 50000 50000'])

    const enforced = await reset('used + 1000', { memoryLimit: true })
    enforced.start()
    enforced.advanceTime(1000)
    expect(texts(enforced)).toEqual(['restarted', expect.stringMatching(/^after (\d+) \1$/)])
    expect(enforced.memoryLimit).toBeLessThan(6000)
  })

  it('fails the restart when the kept limit is too low to start in', async () => {
    // In-world: with the limit at what the script used, ll.ResetScript() -> "Script run-time error" and "not
    // enough memory" on DEBUG_CHANNEL before the script said anything. With the limit at that plus 64, the script
    // said its first line after the reset and then failed the same way.
    const reset = (limit: string) =>
      slua(
        `if ll.GetObjectDesc() == "again" then
          ll.SetObjectDesc("done")
          ll.OwnerSay("restarted")
          ll.OwnerSay("after reset limit=" .. ll.GetMemoryLimit() .. " used=" .. ll.GetUsedMemory())
        else
          ll.SetObjectDesc("again")
          local set, used = llcompat.SetMemoryLimit, ll.GetUsedMemory
          local u = used()
          local r = set(u + ${limit})
          ll.ResetScript()
        end`,
        { memoryLimit: true },
      )
    const exact = await reset('0')
    expect(() => exact.start()).toThrow('not enough memory')
    expect(texts(exact)).toEqual([])
    expect(texts(exact, DEBUG_CHANNEL)).toEqual(['Script run-time error', 'not enough memory'])

    const close = await reset('64')
    expect(() => close.start()).toThrow('not enough memory')
    expect(texts(close)).toEqual(['restarted'])
    expect(texts(close, DEBUG_CHANNEL)).toEqual(['Script run-time error', 'not enough memory'])
  })
})

describe('nested xpcall in SLua', () => {
  const DEEP = `
    local calls = 0
    local function h(e) calls += 1 return e end
    local function deep(n)
      if n == 0 then return 0 end
      local ok, v = xpcall(deep, h, n - 1)
      if ok then return v + 1 end
      error(v, 0)
    end
    local function deepv(n)
      if n == 0 then return 0 end
      local ok, v = xpcall(deepv, h, n - 1)
      if ok then return v end
      return "caught:" .. tostring(v)
    end
  `

  it('reports the handler that overflowed, not the call that did', async () => {
    // In-world, twice over: xpcall nested 100, 190 and 196 deep, each level rethrowing with error(v, 0) -> the
    // depth, no handler called. 1000 deep -> "error in error handling" with 198 handler calls, and through an
    // outer pcall "error in error handling" too. The innermost xpcall alone saw "C stack overflow": returning it
    // as a value from 1000 deep -> "caught:C stack overflow" with one handler call. Between 198 and 400 deep the
    // region gave either answer for the same depth from one run to the next (198 deep: "C stack overflow" with
    // 199 handler calls, then "error in error handling" with 198; 200 and 225 deep: the depth itself once), so
    // those depths are not pinned.
    expect(
      await said(`${DEEP}
        for _, n in {100, 190, 196, 1000} do
          calls = 0
          local _, b = xpcall(deep, h, n)
          local x = calls
          local _, p = pcall(deep, n)
          calls = 0
          local _, v = xpcall(deepv, h, n)
          ll.OwnerSay(n .. " " .. tostring(b) .. " " .. x .. " / " .. tostring(p) .. " / " .. tostring(v) .. " " .. calls)
        end
      `),
    ).toEqual([
      '100 100 0 / 100 / 0 0',
      '190 190 0 / 190 / 0 0',
      '196 196 0 / 196 / 0 0',
      '1000 error in error handling 198 / error in error handling / caught:C stack overflow 1',
    ])
  })

  it('answers a failing, a two-valued and a missing handler as Second Life does', async () => {
    // In-world: xpcall(function() error("a", 0) end, function(e) error("b", 0) end) -> false, "error in error
    // handling"; a handler returning 1, 2 -> two values in all; xpcall(function() end, 1) -> "invalid argument #2
    // to 'xpcall' (function expected, got number)"; debug.traceback as the handler -> "a" and the traceback lines.
    expect(
      await said(`
        ll.OwnerSay(tostring(select(2, xpcall(function() error("a", 0) end, function(e) error("b", 0) end))))
        ll.OwnerSay(tostring(select("#", xpcall(function() error("a", 0) end, function(e) return 1, 2 end))))
        ll.OwnerSay(tostring(select(2, pcall(xpcall, function() end, 1))))
        local tb = string.gsub(select(2, xpcall(function() error("a", 0) end, debug.traceback)), "%s+$", "")
        ll.OwnerSay((string.gsub(tb, "%s+", "|")))
      `),
    ).toEqual([
      'error in error handling',
      '2',
      "invalid argument #2 to 'xpcall' (function expected, got number)",
      'a|lua_script:5|lua_script:5',
    ])
  })
})
