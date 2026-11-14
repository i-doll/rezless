import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

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
    expect(await closures('--!optimize 1\n')).toEqual(['20 640 0 640 0 1152 1664 2176 1920 1024 640 640 0 1152 0 1152 0 7904'])
    expect(await closures('--!optimize 2\n')).toEqual(['20 640 0 640 0 1152 1664 2176 1920 1024 640 640 0 640 0 1152 0 7904'])
    expect(await closures('--!optimize 0\n')).toEqual(['20 640 0 1152 0 1152 1664 2176 1920 1024 640 640 0 1152 0 1152 800 7904'])
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
