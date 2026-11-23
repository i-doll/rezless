import { describe, expect, it } from 'vitest'
import { loadLinkset } from '../src/index.js'

// Measured on the Aditi beta grid, region SLua Tideland, 2026-11-23, by
// reading the owner's nearby chat in the viewer. A probe box ran one error per
// chat command, about 7 s apart, and was reset after each. A second box 1.5 m
// away listened on DEBUG_CHANNEL and repeated what it heard with llOwnerSay.
// The probes' sources are below, with the owner check that guarded the listen
// handler replaced by a comment so the line numbers stay the same.
//
// The owner saw the Lua message, a newline and Luau's traceback of the failed
// handler, ending in a newline. The traceback names the simulator's own frames
// (`[C] function _handleEvent`, and `_tick` and `timer_wrapper` for a timer):
// they come from SLua's event and timer managers, which rezless runs too.
// Listeners heard "runtime error". An error value that isn't a string showed
// "Unknown runtime error" to both. An LSL script's error (a Math Error) read
// the same to both.

const DEBUG_CHANNEL = 2147483647
const HEADER = 'probe [script:p] Script run-time error'
const NAME3 = 'probe issue-456 err3'
const HEADER3 = `${NAME3} [script:p] Script run-time error`

const PROBE = "local function deep(n)\n  if n == 0 then error(\"deep boom\") end\n  return deep(n - 1) + 0\nend\nlocal function cases(c)\n  if c == \"1\" then error(\"boom custom\")\n  elseif c == \"2\" then local t = nil; local _ = t.x\n  elseif c == \"3\" then local f = nil; f()\n  elseif c == \"4\" then local n = nil; local _ = n + 1\n  elseif c == \"5\" then error({1})\n  elseif c == \"6\" then error(42)\n  elseif c == \"7\" then assert(false)\n  elseif c == \"8\" then assert(false, \"assert msg\")\n  elseif c == \"9\" then coroutine.wrap(function() error(\"in wrap\") end)()\n  elseif c == \"10\" then LLTimers:once(0.1, function() error(\"in timer\") end)\n  elseif c == \"11\" then error(\"level zero\", 0)\n  elseif c == \"12\" then error(nil)\n  elseif c == \"13\" then error(true)\n  elseif c == \"14\" then local _ = \"a\" .. nil\n  elseif c == \"15\" then local _ = nil < 1\n  elseif c == \"16\" then deep(3)\n  elseif c == \"17\" then error(string.rep(\"a\", 1100))\n  elseif c == \"18\" then error(\"line one\\nline two\")\n  elseif c == \"19\" then error(4.5)\n  elseif c == \"20\" then local t = {}; t.x.y = 1\n  elseif c == \"21\" then error(\"lvl2\", 2)\n  elseif c == \"22\" then ll.SetPos()\n  elseif c == \"23\" then local a = {}; a.b.c()\n  elseif c == \"24\" then local u = nil; u.method(u)\n  elseif c == \"25\" then local s = \"x\"; s:nosuch()\n  elseif c == \"26\" then error(vector(1,2,3))\n  elseif c == \"27\" then error(ll.GetOwner())\n  elseif c == \"28\" then string.rep()\n  elseif c == \"29\" then LLEvents:once(\"touch_start\", nil)\n  end\nend\nLLEvents:on(\"listen\", function(ch, name, id, msg)\n  -- (the probe answered only its owner here)\n  -- (and answered \"ping\")\n  cases(msg)\nend)\nll.Listen(4560, \"\", \"\", \"\")\nll.OwnerSay(\"ready\")\n"

const PROBE3 = "local function f(d) return f(d + 1) + 1 end\nlocal function cases(c)\n  if c == \"1\" then f(0)\n  elseif c == \"2\" then for i = 1, 70 do ll.Listen(1000 + i, \"\", \"\", \"\") end\n  elseif c == \"3\" then error(string.rep(\"c\", 1131), 0)\n  elseif c == \"4\" then error(string.rep(\"\u00e9\", 700), 0)\n  elseif c == \"5\" then error(string.rep(\"d\", 1050), 0)\n  elseif c == \"6\" then error(string.rep(\"\u00e9\", 520), 0)\n  elseif c == \"7\" then error(\"rez again\")\n  end\nend\nLLEvents:on(\"listen\", function(ch, name, id, msg)\n  -- (the probe answered only its owner here)\n  cases(msg)\nend)\nll.Listen(4560, \"\", \"\", \"\")\nll.OwnerSay(\"ready\")\n"

const MEMORY_TRACE = "not enough memory\nlua_script:1 function f\nlua_script:1 function f\nlua_script:1 function f\nlua_script:1 function f\nlua_script:1 function f\nlua_script:1 function f\nlua_script:1 function f\nlua_script:1 function f\nlua_script:1 function f\nlua_script:1 function f\n... (+1598 frames)\nlua_script:1 function f\nlua_script:1 function f\nlua_script:1 function f\nlua_script:1 function f\nlua_script:1 function f\nlua_script:1 function f\nlua_script:1 function f\nlua_script:3 function cases\nlua_script:14\n[C] function _handleEvent\n"

const PROBE2 = "local function deep(n)\n  if n == 0 then error(\"deep boom\") end\n  return deep(n - 1) + 0\nend\nlocal M = {}\nfunction M.f() error(\"in M.f\") end\nlocal g = function() error(\"in g\") end\nfunction globalfn() error(\"in global\") end\nlocal function cases(c)\n  if c == \"1\" then deep(40)\n  elseif c == \"2\" then M.f()\n  elseif c == \"3\" then g()\n  elseif c == \"4\" then globalfn()\n  elseif c == \"5\" then error(setmetatable({}, {__tostring = function() return \"ts\" end}))\n  elseif c == \"6\" then error(\"\")\n  elseif c == \"7\" then LLTimers:every(0.2, function() error(\"in every\") end)\n  elseif c == \"8\" then local ok, e = pcall(error, \"inner\"); error(e, 0)\n  elseif c == \"9\" then error(string.rep(\"b\", 2000), 0)\n  elseif c == \"10\" then coroutine.resume(coroutine.create(function() error(\"swallowed\") end)); error(\"after\")\n  end\nend\nLLEvents:on(\"touch_start\", function(events) error(\"in touch\") end)\nLLEvents:on(\"listen\", function(ch, name, id, msg)\n  -- (the probe answered only its owner here)\n  cases(msg)\nend)\nll.Listen(4560, \"\", \"\", \"\")\nll.OwnerSay(\"ready\")\n"

/** Run `source` in a box with a listener 1 m away, then `trigger` it; what the owner saw and the listener heard. */
async function crash(source: string, trigger: (probe: import('../src/index.js').Script) => void, name = 'probe', coverage = false) {
  // Coverage counters take memory, so a covered script runs out at another depth.
  const { scripts, linkset } = await loadLinkset({
    prims: [
      { name, scripts: [{ source: { source, filename: 'p.luau', language: 'slua' }, name: 'p', start: false, memoryLimit: true, coverage }] },
      {
        name: 'listener',
        scripts: [{ source: { source: 'list heard; default { state_entry() { llListen(DEBUG_CHANNEL, "", NULL_KEY, ""); } listen(integer c, string n, key id, string m) { heard += m; } }', filename: 'l.lsl' }, name: 'l' }],
      },
    ],
  })
  scripts.l!.start()
  const probe = scripts.p!
  expect(() => {
    probe.start()
    trigger(probe)
    linkset.advanceTime(1000)
  }).toThrow()
  linkset.advanceTime(1000)
  expect(probe.crashed).toBe(true)
  return {
    shown: probe.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text),
    heard: scripts.l!.global('heard') as string[],
  }
}

const command = (msg: string) => (probe: import('../src/index.js').Script) =>
  probe.fire('listen', { channel: 4560, name: 'owner', id: '00000000-0000-0000-0000-000000000001', msg })

describe('an uncaught SLua error', () => {
  // In-world: each command below crashed the probe; the owner saw the text in the table, the listener "runtime error".
  it.each([
    ["error(\"boom custom\")", "1", "lua_script:6: boom custom\n[C] function error\nlua_script:6 function cases\nlua_script:40\n[C] function _handleEvent\n"],
    ["indexing nil", "2", "lua_script:7: attempt to index nil with 'x'\nlua_script:7 function cases\nlua_script:40\n[C] function _handleEvent\n"],
    ["calling nil", "3", "lua_script:8: attempt to call a nil value\nlua_script:8 function cases\nlua_script:40\n[C] function _handleEvent\n"],
    ["arithmetic on nil", "4", "lua_script:9: attempt to perform arithmetic (add) on nil and number\nlua_script:9 function cases\nlua_script:40\n[C] function _handleEvent\n"],
    ["error(42)", "6", "lua_script:11: 42\n[C] function error\nlua_script:11 function cases\nlua_script:40\n[C] function _handleEvent\n"],
    ["assert(false)", "7", "lua_script:12: assertion failed!\n[C] function assert\nlua_script:12 function cases\nlua_script:40\n[C] function _handleEvent\n"],
    ["assert(false, \"assert msg\")", "8", "lua_script:13: assert msg\n[C] function assert\nlua_script:13 function cases\nlua_script:40\n[C] function _handleEvent\n"],
    ["an error inside coroutine.wrap", "9", "lua_script:14: lua_script:14: in wrap\n[C] function <wrapped>\nlua_script:14 function cases\nlua_script:40\n[C] function _handleEvent\n"],
    ["an error in an LLTimers:once callback", "10", "lua_script:15: in timer\n[C] function error\nlua_script:15\n[C] function _tick\n[C] function timer_wrapper\n[C] function _handleEvent\n"],
    ["error(\"level zero\", 0)", "11", "level zero\n[C] function error\nlua_script:16 function cases\nlua_script:40\n[C] function _handleEvent\n"],
    ["concatenating nil", "14", "lua_script:19: attempt to concatenate string with nil\nlua_script:19 function cases\nlua_script:40\n[C] function _handleEvent\n"],
    ["comparing nil", "15", "lua_script:20: attempt to compare nil < number\nlua_script:20 function cases\nlua_script:40\n[C] function _handleEvent\n"],
    ["an error four calls deep", "16", "lua_script:2: deep boom\n[C] function error\nlua_script:2 function deep\nlua_script:3 function deep\nlua_script:3 function deep\nlua_script:3 function deep\nlua_script:21 function cases\nlua_script:40\n[C] function _handleEvent\n"],
    ["a message of two lines", "18", "lua_script:23: line one\nline two\n[C] function error\nlua_script:23 function cases\nlua_script:40\n[C] function _handleEvent\n"],
    ["error(4.5)", "19", "lua_script:24: 4.5\n[C] function error\nlua_script:24 function cases\nlua_script:40\n[C] function _handleEvent\n"],
    ["indexing a nil field", "20", "lua_script:25: attempt to index nil with 'y'\nlua_script:25 function cases\nlua_script:40\n[C] function _handleEvent\n"],
    ["error(\"lvl2\", 2)", "21", "lua_script:40: lvl2\n[C] function error\nlua_script:26 function cases\nlua_script:40\n[C] function _handleEvent\n"],
    ["ll.SetPos()", "22", "lua_script:27: Fewer arguments than expected, 0 < 1\n[C] function SetPos\nlua_script:27 function cases\nlua_script:40\n[C] function _handleEvent\n"],
    ["calling a field of a nil field", "23", "lua_script:28: attempt to index nil with 'c'\nlua_script:28 function cases\nlua_script:40\n[C] function _handleEvent\n"],
    ["calling a method of nil", "24", "lua_script:29: attempt to index nil with 'method'\nlua_script:29 function cases\nlua_script:40\n[C] function _handleEvent\n"],
    ["calling a missing string method", "25", "lua_script:30: attempt to call missing method 'nosuch' of string\nlua_script:30 function cases\nlua_script:40\n[C] function _handleEvent\n"],
    ["string.rep()", "28", "lua_script:33: missing argument #1 to 'rep' (string expected)\n[C] function rep\nlua_script:33 function cases\nlua_script:40\n[C] function _handleEvent\n"],
    ["LLEvents:once with no handler", "29", "lua_script:34: invalid argument #3 to 'once' (function or callable table expected, got nil)\n[C] function once\nlua_script:34 function cases\nlua_script:40\n[C] function _handleEvent\n"],
  ])('shows the owner the message and traceback of %s', async (_what, msg, text) => {
    const { shown, heard } = await crash(PROBE, command(msg))
    expect(shown).toEqual([HEADER, text])
    expect(heard).toEqual([HEADER, 'runtime error'])
  })

  // In-world: the follow-up probe, same method.
  it.each([
    ["an error 41 calls deep", "1", "lua_script:2: deep boom\n[C] function error\nlua_script:2 function deep\nlua_script:3 function deep\nlua_script:3 function deep\nlua_script:3 function deep\nlua_script:3 function deep\nlua_script:3 function deep\nlua_script:3 function deep\nlua_script:3 function deep\nlua_script:3 function deep\n... (+25 frames)\nlua_script:3 function deep\nlua_script:3 function deep\nlua_script:3 function deep\nlua_script:3 function deep\nlua_script:3 function deep\nlua_script:3 function deep\nlua_script:3 function deep\nlua_script:10 function cases\nlua_script:25\n[C] function _handleEvent\n"],
    ["an error in a function stored in a table", "2", "lua_script:6: in M.f\n[C] function error\nlua_script:6 function f\nlua_script:11 function cases\nlua_script:25\n[C] function _handleEvent\n"],
    ["an error in a function stored in a local", "3", "lua_script:7: in g\n[C] function error\nlua_script:7\nlua_script:12 function cases\nlua_script:25\n[C] function _handleEvent\n"],
    ["an error in a global function", "4", "lua_script:8: in global\n[C] function error\nlua_script:8 function globalfn\nlua_script:13 function cases\nlua_script:25\n[C] function _handleEvent\n"],
    ["error(\"\")", "6", "lua_script:15: \n[C] function error\nlua_script:15 function cases\nlua_script:25\n[C] function _handleEvent\n"],
    ["an error in an LLTimers:every callback", "7", "lua_script:16: in every\n[C] function error\nlua_script:16\n[C] function _tick\n[C] function timer_wrapper\n[C] function _handleEvent\n"],
    ["rethrowing a caught error with level 0", "8", "inner\n[C] function error\nlua_script:17 function cases\nlua_script:25\n[C] function _handleEvent\n"],
    ["an error after a coroutine swallowed one", "10", "lua_script:19: after\n[C] function error\nlua_script:19 function cases\nlua_script:25\n[C] function _handleEvent\n"],
  ])('shows the owner the message and traceback of %s', async (_what, msg, text) => {
    const { shown, heard } = await crash(PROBE2, command(msg))
    expect(shown).toEqual([HEADER, text])
    expect(heard).toEqual([HEADER, 'runtime error'])
  })

  // In-world: these showed "Unknown runtime error" to the owner and the listener alike, with no traceback.
  it.each([
    ["error({1})", "5"],
    ["error(nil)", "12"],
    ["error(true)", "13"],
    ["error(vector(1, 2, 3))", "26"],
    ["error(ll.GetOwner())", "27"],
  ])('says "Unknown runtime error" to everyone for %s', async (_what, msg) => {
    const { shown, heard } = await crash(PROBE, command(msg))
    expect(shown).toEqual([HEADER, 'Unknown runtime error'])
    expect(heard).toEqual([HEADER, 'Unknown runtime error'])
  })

  it.each([
    ["error(a table with __tostring)", "5"],
  ])('says "Unknown runtime error" to everyone for %s', async (_what, msg) => {
    const { shown, heard } = await crash(PROBE2, command(msg))
    expect(shown).toEqual([HEADER, 'Unknown runtime error'])
    expect(heard).toEqual([HEADER, 'Unknown runtime error'])
  })

  // In-world: touching the follow-up probe ran its touch_start handler, which raised error("in touch").
  it('shows the traceback of a touch handler', async () => {
    const { shown, heard } = await crash(PROBE2, (p) => p.fire('touch_start', { num_detected: 1 }))
    expect(shown).toEqual([HEADER, "lua_script:22: in touch\n[C] function error\nlua_script:22\n[C] function _handleEvent\n"])
    expect(heard).toEqual([HEADER, 'runtime error'])
  })

  // In-world: an LSL script that divided by zero in state_entry showed "Math Error" to the owner and the listener.
  it('leaves an LSL error the same for everyone', async () => {
    const { scripts, linkset } = await loadLinkset({
      prims: [
        { name: 'probe', scripts: [{ source: { source: 'default { state_entry() { integer z = 0; integer x = 1 / z; } }', filename: 'p.lsl' }, name: 'p', start: false }] },
        { name: 'listener', scripts: [{ source: { source: 'list heard; default { state_entry() { llListen(DEBUG_CHANNEL, "", NULL_KEY, ""); } listen(integer c, string n, key id, string m) { heard += m; } }', filename: 'l.lsl' }, name: 'l' }] },
      ],
    })
    scripts.l!.start()
    expect(() => scripts.p!.start()).toThrow('Math Error')
    linkset.advanceTime(1000)
    expect(scripts.p!.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text)).toEqual([HEADER, 'Math Error'])
    expect(scripts.l!.global('heard')).toEqual([HEADER, 'Math Error'])
  })

  // In-world: a script that indexed nil at its top level, after an owner-say.
  it('shows the traceback of an error at the top level', async () => {
    const { shown, heard } = await crash('ll.OwnerSay("start")\nlocal t = nil\nlocal _ = t.x\n', () => {})
    expect(shown).toEqual([HEADER, "lua_script:3: attempt to index nil with 'x'\nlua_script:3\n"])
    expect(heard).toEqual([HEADER, 'runtime error'])
  })
})

// A third probe, measured the same way later that day, in a prim named "probe issue-456 err3".
describe('what the owner sees of an SLua error that is not a plain error', () => {
  // In-world: unbounded recursion showed the owner "not enough memory" and the traceback, cut to the first and last
  // ten frames around "... (+1598 frames)"; the listener heard "not enough memory". rezless runs out at the same depth.
  it('shows the traceback of running out of memory', async () => {
    const { shown, heard } = await crash(PROBE3, command('1'), NAME3)
    expect(shown).toEqual([HEADER3, MEMORY_TRACE])
    expect(heard).toEqual([HEADER3, 'not enough memory'])
  })

  it('leaves the coverage counters out of the traceback', async () => {
    const { shown } = await crash(PROBE3, command('1'), NAME3, true)
    expect(shown[1]).not.toContain('__rz_')
    expect(shown[1]).toMatch(/^not enough memory\n(lua_script:1 function f\n){10}\.\.\. \(\+\d+ frames\)\n(lua_script:1 function f\n){7}lua_script:3 function cases\nlua_script:14\n\[C\] function _handleEvent\n$/)
  })

  // In-world: 70 ll.Listen calls showed "Too Many Listens" to the owner and the listener, with no traceback.
  it('says "Too Many Listens" to everyone', async () => {
    const { shown, heard } = await crash(PROBE3, command('2'), NAME3)
    expect(shown).toEqual([HEADER3, 'Too Many Listens'])
    expect(heard).toEqual([HEADER3, 'Too Many Listens'])
  })
})

// In-world: the owner's text was cut so that the prim's name and the text came to 1151 bytes, without splitting a
// character: 1132 bytes under the 19-byte name "probe issue-456 err" (error(string.rep("a", 1100)) and
// error(string.rep("b", 2000), 0)), 1131 under the 20-byte "probe issue-456 err3", and 1111 under a 40-byte name.
// The listener heard "runtime error" each time.
describe('a long SLua error', () => {
  it.each([
    ['1131 "c"s', '3', "ccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"],
    ['700 "é"s, cut between bytes of one', '4', "\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9"],
    ['1050 "d"s, cut in the traceback', '5', "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd\n[C] function error\nlua_script:7 function cases\nlua_script:14\n[C] function _handl"],
    ['520 "é"s, which fit', '6', "\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\u00e9\n[C] function error\nlua_script:8 function cases\nlua_script:14\n[C] function _handleEvent\n"],
  ])('is cut to fit the prim name: %s', async (_what, msg, text) => {
    const { shown, heard } = await crash(PROBE3, command(msg), NAME3)
    expect(shown).toEqual([HEADER3, text])
    expect(heard).toEqual([HEADER3, 'runtime error'])
  })

  it('is cut shorter under a longer name', async () => {
    const name = `probe issue-456 cap ${'n'.repeat(20)}`
    const { shown } = await crash('error(string.rep("e", 2000), 0)', () => {}, name)
    expect(shown[1]).toBe('e'.repeat(1111))
  })
})
