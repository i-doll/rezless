import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadScript } from '../src/index.js'

const slua = (source: string) => loadScript({ source, language: 'slua', filename: 'lua_script' })

const said = async (source: string) => {
  const s = await slua(source)
  s.start()
  return s.chat.map((c) => c.text)
}

/**
 * Each transcript in slua-grid/ is what the script next to it said in Second
 * Life: one line per case, `<label> -> <typeof>:<value>` or `<label> !! <error>`.
 * Of a value that spans lines, only the first line is there.
 *
 * In-world: Aditi, SLua Tideland, 2026-11-13 (globals line A65 has the
 * simulator version).
 */
const TRANSCRIPTS: Record<string, { tag: string; skipped?: Record<number, string> }> = {
  globals: {
    tag: 'A',
    skipped: {
      65: 'the simulator version',
      72: 'the simulator host name, which the transcript leaves out',
      74: 'not modelled: llcompat has four functions ll lacks',
      75: 'not modelled: llcompat has four functions ll lacks',
      94: 'memory in use',
    },
  },
  integers: {
    tag: 'B',
    skipped: { 113: 'the clock', 115: 'memory in use', 116: 'memory in use', 158: 'the clock', 160: 'memory in use', 161: 'memory in use' },
  },
  'integer-arithmetic': { tag: 'E', skipped: { 1: 'not modelled: llcompat has four functions ll lacks' } },
  scalars: { tag: 'C' },
  lists: { tag: 'D' },
}

const fixture = (file: string) => readFileSync(new URL(`./slua-grid/${file}`, import.meta.url), 'utf8')
const withoutAddresses = (line: string) => line.replace(/0x[0-9a-f]{16}/g, '0x…')

describe('SLua as the grid runs it', () => {
  for (const [name, { tag, skipped = {} }] of Object.entries(TRANSCRIPTS)) {
    it(`answers the ${name} script as Second Life did`, async () => {
      const numbered = new RegExp(`^${tag}(\\d+) `)
      const compared = (lines: string[]) =>
        lines.filter((line) => numbered.test(line) && !(Number(numbered.exec(line)![1]) in skipped)).map(withoutAddresses)
      const s = await slua(fixture(`${name}.luau`))
      s.start()
      s.advanceTime(1000)
      const lines = s.chat.filter((c) => c.channel === 7777).flatMap((c) => c.text.split('\n'))
      expect(compared(lines)).toEqual(compared(fixture(`${name}.txt`).split('\n')))
    })
  }

  it('has no integer library', async () => {
    // In-world: type(integer) -> nil; integer.create(7) -> lua_script:1: attempt to
    // index nil with 'create' (Aditi, SLua Tideland, 2026-11-13)
    expect(await said(`ll.OwnerSay(type(integer))`)).toEqual(['nil'])
    const s = await slua(`local i = integer.create(7)`)
    expect(() => s.start()).toThrow("lua_script:1: attempt to index nil with 'create'")
  })

  it('returns an integer from ll.GetListEntryType, and from nothing else measured', async () => {
    // In-world: typeof -> integer, type -> userdata, tostring -> 2, == 2 -> false,
    // == TYPE_FLOAT -> false, tonumber(v) == TYPE_FLOAT -> true; the same through
    // llcompat. ll.GetListLength, ll.List2Integer, ll.Abs, ll.StringLength,
    // bit32.band and the LSL constants are numbers (Aditi, SLua Tideland, 2026-11-13)
    expect(
      await said(`
        local v = ll.GetListEntryType({1.5}, 1)
        local c = llcompat.GetListEntryType({"s"}, 0)
        ll.OwnerSay(typeof(v) .. " " .. type(v) .. " " .. tostring(v) .. " " .. typeof(c) .. " " .. tostring(c))
        ll.OwnerSay(tostring(v == 2) .. " " .. tostring(v == TYPE_FLOAT) .. " " .. tostring(tonumber(v) == TYPE_FLOAT))
        ll.OwnerSay(typeof(ll.GetListLength({1})) .. " " .. typeof(ll.List2Integer({1}, 1)) .. " " .. typeof(ll.Abs(-1))
          .. " " .. typeof(ll.StringLength("a")) .. " " .. typeof(bit32.band(3, 1)) .. " " .. typeof(TYPE_INTEGER))
      `),
    ).toEqual(['integer userdata 2 integer 3', 'false false true', 'number number number number number number'])
  })

  it('keeps integers apart from numbers', async () => {
    // In-world: integer + integer -> integer:5, integer + 1 -> number:3, integer / integer ->
    // number, integer < 3 -> attempt to compare integer < number, integer .. "" -> attempt to
    // concatenate integer with string, ({10, 20, 30})[integer] -> nil, an integer 0 is falsy
    // (Aditi, SLua Tideland, 2026-11-13)
    expect(
      await said(`
        local two, three, zero = ll.GetListEntryType({1}, 1), ll.GetListEntryType({"s"}, 1), ll.GetListEntryType({}, 1)
        local function show(v) return typeof(v) .. ":" .. tostring(v) end
        ll.OwnerSay(show(two + three) .. " " .. show(two + 1) .. " " .. show(three / two) .. " " .. show(-two))
        ll.OwnerSay(tostring(select(2, pcall(function() return two < 3 end))))
        ll.OwnerSay(tostring(select(2, pcall(function() return two .. "" end))))
        ll.OwnerSay(tostring(({10, 20, 30})[two]) .. " " .. (zero and "truthy" or "falsy"))
      `),
    ).toEqual([
      'integer:5 number:3 number:1.5 integer:-2',
      'lua_script:5: attempt to compare integer < number',
      'lua_script:6: attempt to concatenate integer with string',
      'nil falsy',
    ])
  })

  it('sends an integer in a list as an LSL integer', async () => {
    // In-world, with the integers two and three: ll.GetListEntryType({two}, 1) -> 1,
    // ll.List2CSV({two, three, 1, 1.5}) -> "2, 3, 1, 1.500000",
    // ll.DumpList2String({two, 1, three}, ",") -> "2,1.000000,3",
    // ll.ListFindList({two}, {2}) -> nil, ll.ListFindList({1, two}, {two}) -> 2
    // (Aditi, SLua Tideland, 2026-11-13)
    expect(
      await said(`
        local two, three = ll.GetListEntryType({1}, 1), ll.GetListEntryType({"s"}, 1)
        ll.OwnerSay(tostring(ll.GetListEntryType({two}, 1)))
        ll.OwnerSay(ll.List2CSV({two, three, 1, 1.5}))
        ll.OwnerSay(ll.DumpList2String({two, 1, three}, ","))
        ll.OwnerSay(tostring(ll.ListFindList({two}, {2})) .. " " .. tostring(ll.ListFindList({1, two}, {two})))
      `),
    ).toEqual(['1', '2, 3, 1, 1.500000', '2,1.000000,3', 'nil 2'])
  })

  it('does not take a boolean as a list value in the functions SLua runs itself', async () => {
    // In-world: ll.DumpList2String({true}, ",") -> non-LSL value in list,
    // ll.List2String({true}, 1) -> "", ll.List2Float({true}, 1) -> 0,
    // ll.List2Integer({true}, 1) -> 1, ll.GetListEntryType({true}, 1) -> 8
    // (Aditi, SLua Tideland, 2026-11-13)
    expect(
      await said(`
        ll.OwnerSay(tostring(select(2, pcall(ll.DumpList2String, {1, true}, ","))))
        ll.OwnerSay("[" .. ll.List2String({true}, 1) .. "] " .. ll.List2Float({true}, 1) .. " " .. ll.List2Integer({true}, 1)
          .. " " .. tostring(ll.GetListEntryType({true}, 1)))
      `),
    ).toEqual(['non-LSL value in list', '[] 0 1 8'])
  })

  it('compiles without the syntax Luau still keeps behind a flag', async () => {
    // In-world: a script with `id<<number>>(5)` on line 2 doesn't compile:
    // ":2: Expected identifier when parsing expression, got '<'" (Aditi, SLua Tideland, 2026-11-13)
    await expect(slua(`local function id<T>(x: T): T return x end\nlocal y = id<<number>>(5)`)).rejects.toThrow(
      "lua_script:2: Expected identifier when parsing expression, got '<'",
    )
  })

  it('nests pcall on the C stack', async () => {
    // In-world: pcall nested 190 deep -> true, 190; 250 and 1000 deep -> false, "C stack overflow".
    // Between 196 and 210 deep the region gave either answer. (Aditi, SLua Tideland, 2026-11-13)
    expect(
      await said(`
        local function deep(n)
          if n == 0 then return 0 end
          local ok, v = pcall(deep, n - 1)
          if ok then return v + 1 end
          error(v, 0)
        end
        for _, n in {190, 250, 1000} do ll.OwnerSay(n .. " " .. tostring(select(2, pcall(deep, n)))) end
      `),
    ).toEqual(['190 190', '250 C stack overflow', '1000 C stack overflow'])
  })

  it('runs pcall inside a timer callback', async () => {
    // In-world: in an LLTimers:once callback, pcall(function() return 1 end) -> true, 1 and
    // pcall(function() error("x", 0) end) -> false, "x" (Aditi, SLua Tideland, 2026-11-13)
    const s = await slua(`
      LLTimers:once(0.5, function()
        ll.OwnerSay(tostring(select(2, pcall(function() return 1 end))) .. " " .. tostring(select(2, pcall(function() error("x", 0) end))))
      end)
    `)
    s.start()
    s.advanceTime(2000)
    expect(s.chat.map((c) => c.text)).toEqual(['1 x'])
  })

  it('has the libraries of the SLua the grid runs', async () => {
    // In-world: math.nan, math.tau, math.e, math.phi, math.sqrt2 -> nil;
    // buffer.readinteger, buffer.writeinteger -> nil; llprim.ParamsSetter -> table,
    // llprim.ParamSetter -> nil (Aditi, SLua Tideland, 2026-11-13)
    expect(
      await said(`
        ll.OwnerSay(tostring(math.nan) .. " " .. tostring(math.tau) .. " " .. tostring(math.e) .. " " .. tostring(math.phi)
          .. " " .. tostring(math.sqrt2) .. " " .. tostring(buffer.readinteger) .. " " .. tostring(buffer.writeinteger))
        ll.OwnerSay(type(llprim.ParamsSetter) .. " " .. type(llprim.ParamSetter))
      `),
    ).toEqual(['nil nil nil nil nil nil nil', 'table nil'])
  })
})
