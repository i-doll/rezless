import { describe, it, expect } from 'vitest'
import { loadLinkset, loadScript } from '../src/index.js'

// Every measurement cited below: Aditi, SLua Tideland, 2026-11-14.

// The probe script, as run in-world (its result line said on a channel there).
const CLOSURES = `
  local CH = 4560
  local u = ll.GetUsedMemory
  local t = table.create(64, false)
  local r = table.create(40, 0)
  local K = 5
  local a, b, c, d

  local function clear() for i = 1, 64 do t[i] = false end end

  a = u() t[1] = function() return 1 end b = u() r[1] = b - a
  clear() a = u() for i = 1, 32 do t[i] = function() return 1 end end b = u() r[2] = b - a
  r[3] = (t[1] == t[2]) and 1 or 0
  clear() a = u() for i = 1, 32 do t[i] = function() return K end end b = u() r[4] = b - a
  r[5] = (t[1] == t[2]) and 1 or 0
  clear() a = u() for i = 1, 32 do t[i] = function() return i end end b = u() r[6] = b - a
  clear() a = u() for i = 1, 32 do local j = i t[i] = function() return i + j end end b = u() r[7] = b - a
  clear() a = u() for i = 1, 32 do local j, k = i, i t[i] = function() return i + j + k end end b = u() r[8] = b - a
  clear() a = u() for i = 1, 32 do local x = i x = x + 1 t[i] = function() return x end end b = u() r[9] = b - a
  clear() a = u() for i = 1, 32 do t[i] = {} end b = u() r[10] = b - a
  clear() a = u() for i = 1, 32 do local function f() return 2 end t[i] = f end b = u() r[11] = b - a
  local function mk() return function() return 3 end end
  clear() a = u() for i = 1, 32 do t[i] = mk() end b = u() r[12] = b - a
  r[13] = (t[1] == t[2]) and 1 or 0
  local function g() return 4 end
  clear() a = u() for i = 1, 32 do t[i] = function() return g() end end b = u() r[14] = b - a
  r[15] = (t[1] == t[2]) and 1 or 0
  clear() a = u() for i = 1, 32 do t[i] = function() return i end end b = u()
  clear() for i = 1, 200 do local s = table.create(50, i) end c = u() r[16] = b - a r[17] = c - a
  clear() a = u() for i = 1, 8 do t[i] = coroutine.create(g) end b = u() r[18] = b - a

  ll.OwnerSay(table.concat(r, " ", 1, 18))
`

async function closures(header: string) {
  const s = await loadScript({ source: header + CLOSURES, language: 'slua', filename: 'lua_script' })
  s.start()
  return s.chat.map((c) => c.text)
}

describe('memory an SLua function costs', () => {
  it('makes a new function each time, 20 bytes and 16 more for each upvalue', async () => {
    // In-world, the script above (r[1] to r[18]): 20 640 0 640 0 1152 1664 2176 1920 1024 640 640 0 1152 0 1152 0
    // 7904. So a function with no upvalues costs 20 bytes each time it is made, and two made by one expression are
    // different functions; a function whose only upvalue is a constant local costs the same 20. Each upvalue adds 16,
    // a written local adds its box too (r[9]), and the bytes come back once the functions are collected (r[17]).
    expect(await closures('')).toEqual(['20 640 0 640 0 1152 1664 2176 1920 1024 640 640 0 1152 0 1152 0 7904'])
  })

  it('follows the --!optimize header', async () => {
    // In-world, the same script under "--!optimize 1": the numbers above. Under "--!optimize 2": the same except
    // r[14] 640, where the call of g is inlined and the function captures nothing. Under "--!optimize 0":
    // 20 640 0 1152 0 1152 1664 2176 1920 1024 640 640 0 1152 0 1152 800 7904, the constant K captured as an upvalue.
    // That 800 (r[17]) is what the collector had not freed yet; when it runs differs, so it isn't compared.
    expect(await closures('--!optimize 1\n')).toEqual(['20 640 0 640 0 1152 1664 2176 1920 1024 640 640 0 1152 0 1152 0 7904'])
    expect(await closures('--!optimize 2\n')).toEqual(['20 640 0 640 0 1152 1664 2176 1920 1024 640 640 0 640 0 1152 0 7904'])
    const [o0] = await closures('--!optimize 0\n')
    expect(o0!.split(' ').toSpliced(16, 1).join(' ')).toBe('20 640 0 1152 0 1152 1664 2176 1920 1024 640 640 0 1152 0 1152 7904')
  })

  it('counts the functions a script makes at its top level', async () => {
    // In-world: five local functions at the top level, f3 calling f1 and f2 and f5 calling f4, took
    // ll.GetUsedMemory() from 2747 to 2895: 148 bytes, 20 each and 16 for each of the three upvalues.
    // The same with "--!optimize 1" as its first line: 2747 and 2895.
    const s = await loadScript({
      source: `
        local u0 = ll.GetUsedMemory()
        local function f1() return math.abs(-1) end
        local function f2() return string.len("abc") end
        local function f3() return f1() + f2() end
        local function f4(x) return x * 2 end
        local function f5(x) return f4(x) + 1 end
        ll.OwnerSay(tostring(ll.GetUsedMemory() - u0) .. " " .. f3() .. f5(1))
      `,
      language: 'slua',
      filename: 'lua_script',
    })
    s.start()
    expect(s.chat.map((c) => c.text)).toEqual(['148 43'])
  })

  it('reads 71 bytes more than Second Life at the start of a script', async () => {
    // In-world, ll.GetUsedMemory() on the first line of each script: 2312 for the first and 2551 for the second,
    // with 2780 after its locals. Eight probe scripts from 2312 to 5137 bytes each read 71 bytes less in-world than
    // rezless does, whatever their size.
    const first = async (source: string) => {
      const s = await loadScript({ source, language: 'slua', filename: 'lua_script' })
      s.start()
      s.advanceTime(20000)
      return s.chat.map((c) => c.text)
    }
    expect(await first('local U0 = ll.GetUsedMemory()\nll.Sleep(9)\nll.Say(4560, "s1 " .. U0)\n')).toEqual([`s1 ${2312 + 71}`])
    expect(
      await first(
        'local U0 = ll.GetUsedMemory()\nlocal x = 0\nfor i = 1, 10 do x += i end\nlocal t = {a = 1, b = "two", c = {3}}\n' +
          'local s = "abc" .. tostring(x)\nlocal U1 = ll.GetUsedMemory()\nll.Sleep(13)\nll.Say(4560, "s3 " .. U0 .. " " .. U1 .. " " .. s .. t.b)\n',
      ),
    ).toEqual([`s3 ${2551 + 71} ${2780 + 71} abc55two`])
  })

  it('stops a script that makes a function at a limit equal to its use', async () => {
    // In-world (#430): after llcompat.SetMemoryLimit(ll.GetUsedMemory()) -> 1, making a function ended the script
    // with "not enough memory".
    const s = await loadScript({
      source: `
        local ok = llcompat.SetMemoryLimit(ll.GetUsedMemory())
        local f = function() return 1 end
        llcompat.SetMemoryLimit(131072)
        ll.OwnerSay("still running " .. ok)
      `,
      language: 'slua',
      filename: 'lua_script',
      memoryLimit: true,
    })
    expect(() => s.start()).toThrow('not enough memory')
    expect(s.chat.filter((c) => c.channel === 0).map((c) => c.text)).toEqual([])
  })
})

const REPORT = `report(string what) { llOwnerSay("A " + what + " " + (string)llGetMemoryLimit()); }`

async function prim(a: string, others: Array<[string, string, 'lsl' | 'slua']> = []) {
  const log: string[] = []
  const { scripts, linkset } = await loadLinkset({
    prims: [
      {
        scripts: [
          { name: 'memA', source: { source: a, filename: 'memA.lsl' } },
          ...others.map(([name, source, language]) => ({ name, language, source: { source, filename: name } })),
        ],
      },
    ],
  })
  for (const s of Object.values(scripts)) {
    s.mock('llOwnerSay', (_ctx, args) => {
      log.push(args[0] as string)
      return undefined
    })
  }
  for (const s of Object.values(scripts)) s.start()
  return { log, scripts, linkset }
}

describe('an LSL script’s memory limit through a reset', () => {
  const A = `${REPORT}
    default {
      state_entry() { report("start"); }
      link_message(integer s, integer n, string m, key id) {
        if (m == "set") { llSetMemoryLimit(n); report("set"); }
        else if (m == "reset") llResetScript();
        else if (m == "state") state other;
        else if (m == "get") report("get");
      }
    }
    state other { state_entry() { report("other"); state default; } }`

  it('goes back to 65536 on llResetScript', async () => {
    // In-world (Mono): llSetMemoryLimit(40000) -> 1, then llResetScript(); state_entry read llGetMemoryLimit() 65536.
    const { log, scripts } = await prim(A)
    scripts.memA!.fire('link_message', { sender_num: 1, num: 40000, str: 'set', id: '' })
    scripts.memA!.fire('link_message', { sender_num: 1, num: 0, str: 'reset', id: '' })
    expect(log).toEqual(['A start 65536', 'A set 40000', 'A start 65536'])
  })

  it('goes back to 65536 when another script resets it, LSL or SLua', async () => {
    // In-world: at a limit of 30000, llResetOtherScript("memA") from an LSL script in the same prim -> memA's
    // state_entry read 65536. The same from an SLua script's ll.ResetOtherScript("memA") -> 65536.
    const { log, scripts, linkset } = await prim(A, [
      ['memB', 'default { link_message(integer s, integer n, string m, key id) { if (m == "B reset") llResetOtherScript("memA"); } }', 'lsl'],
      ['memC', 'LLEvents:on("link_message", function(s, n, m) if m == "C reset" then ll.ResetOtherScript("memA") end end)', 'slua'],
    ])
    scripts.memA!.fire('link_message', { sender_num: 1, num: 30000, str: 'set', id: '' })
    scripts.memB!.fire('link_message', { sender_num: 1, num: 0, str: 'B reset', id: '' })
    linkset.advanceTime(100)
    scripts.memA!.fire('link_message', { sender_num: 1, num: 30000, str: 'set', id: '' })
    scripts.memC!.fire('link_message', { sender_num: 1, num: 0, str: 'C reset', id: '' })
    linkset.advanceTime(100)
    expect(log).toEqual(['A start 65536', 'A set 30000', 'A start 65536', 'A set 30000', 'A start 65536'])
  })

  it('keeps the limit through a state change and through being stopped and started', async () => {
    // In-world: at a limit of 30000, `state other` -> 30000 in its state_entry and 30000 back in default's.
    // llSetScriptState("memA", FALSE) from another script, llGetScriptState -> 0, then TRUE -> memA read 30000.
    const { log, scripts, linkset } = await prim(A, [
      ['memB', 'default { link_message(integer s, integer n, string m, key id) { llSetScriptState("memA", m == "B start"); } }', 'lsl'],
    ])
    scripts.memA!.fire('link_message', { sender_num: 1, num: 30000, str: 'set', id: '' })
    scripts.memA!.fire('link_message', { sender_num: 1, num: 0, str: 'state', id: '' })
    scripts.memB!.fire('link_message', { sender_num: 1, num: 0, str: 'B stop', id: '' })
    linkset.advanceTime(100)
    scripts.memB!.fire('link_message', { sender_num: 1, num: 0, str: 'B start', id: '' })
    linkset.advanceTime(100)
    scripts.memA!.fire('link_message', { sender_num: 1, num: 0, str: 'get', id: '' })
    expect(log).toEqual(['A start 65536', 'A set 30000', 'A other 30000', 'A start 30000', 'A get 30000'])
  })
})

describe('an SLua script’s memory limit through a reset', () => {
  it('keeps the limit when another script resets it', async () => {
    // In-world: llcompat.SetMemoryLimit(50000) -> 1, then llResetOtherScript("memC") from an LSL script in the same
    // prim -> the script started again with ll.GetMemoryLimit() 50000. Stopped and started with llSetScriptState it
    // read 50000 too. (A recompile started it at 131072; ll.ResetScript keeps the limit, see slua-limits.test.ts.)
    const { log, scripts, linkset } = await prim('default { state_entry() {} }', [
      [
        'memB',
        'default { link_message(integer s, integer n, string m, key id) { if (m == "B reset") llResetOtherScript("memC"); else llSetScriptState("memC", m == "B start"); } }',
        'lsl',
      ],
      [
        'memC',
        `ll.OwnerSay("C start " .. ll.GetMemoryLimit())
        LLEvents:on("link_message", function(s, n, m) if m == "set" then llcompat.SetMemoryLimit(n) ll.OwnerSay("C set " .. ll.GetMemoryLimit()) elseif m == "get" then ll.OwnerSay("C get " .. ll.GetMemoryLimit()) end end)`,
        'slua',
      ],
    ])
    scripts.memC!.fire('link_message', { sender_num: 1, num: 50000, str: 'set', id: '' })
    scripts.memB!.fire('link_message', { sender_num: 1, num: 0, str: 'B reset', id: '' })
    linkset.advanceTime(100)
    scripts.memB!.fire('link_message', { sender_num: 1, num: 0, str: 'B stop', id: '' })
    linkset.advanceTime(100)
    scripts.memB!.fire('link_message', { sender_num: 1, num: 0, str: 'B start', id: '' })
    linkset.advanceTime(100)
    scripts.memC!.fire('link_message', { sender_num: 1, num: 0, str: 'get', id: '' })
    expect(log).toEqual(['C start 131072', 'C set 50000', 'C start 50000', 'C get 50000'])
  })
})

describe('OBJECT_SCRIPT_MEMORY with SLua scripts in the prim', () => {
  it('counts each SLua script as 4096 bytes, whatever its limit or use', async () => {
    // In-world, one prim: LSL scripts memA and memB at 65536 and two SLua scripts -> 139264. After one SLua script
    // set its limit to 20000 -> 139264; after the other built a 60000-byte string (62909 bytes in use) -> 139264;
    // after memA set 20000 -> 93728. So an LSL script counts its limit and an SLua script 4096.
    const { log, scripts } = await prim(
      `default { link_message(integer s, integer n, string m, key id) {
        if (m == "set") llSetMemoryLimit(n);
        else llOwnerSay("mem " + llList2String(llGetObjectDetails(llGetKey(), [OBJECT_SCRIPT_MEMORY]), 0));
      } }`,
      [
        ['memB', 'default { state_entry() {} }', 'lsl'],
        ['memC', 'LLEvents:on("link_message", function(s, n) llcompat.SetMemoryLimit(n) end)', 'slua'],
        ['memD', 'big = string.rep("x", 60000)', 'slua'],
      ],
    )
    const ask = () => scripts.memA!.fire('link_message', { sender_num: 1, num: 0, str: 'mem', id: '' })
    ask()
    scripts.memC!.fire('link_message', { sender_num: 1, num: 20000, str: '', id: '' })
    ask()
    scripts.memA!.fire('link_message', { sender_num: 1, num: 20000, str: 'set', id: '' })
    ask()
    expect(log).toEqual(['mem 139264', 'mem 139264', 'mem 93728'])
  })
})
