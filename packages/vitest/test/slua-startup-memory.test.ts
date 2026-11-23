import { describe, expect, it } from 'vitest'
import { loadScript } from '../src/index.js'

// Measured on the Aditi beta grid, region SLua Tideland, 2026-11-23. Each probe below ran as its own SLua script in
// one prim and reported with ll.OwnerSay, read from the owner's chat in the viewer. Every value a script read in-world
// is pinned here; rezless reads 71 bytes more at the start of every one of them (see START_GAP).

/**
 * What rezless reads at a script's start beyond what Second Life does. The probes changed one start-up object at a
 * time and found no single object that accounts for it: LLEvents and LLTimers count the same in both, and the
 * region's own globals table starts larger (the last describe block). What the region leaves out is still open.
 */
const START_GAP = 71

async function read(source: string): Promise<number[]> {
  const s = await loadScript({ source, language: 'slua', filename: 'lua_script' })
  s.start()
  const [line] = s.chat.map((c) => c.text)
  return line!.split(' ').slice(1).filter((w) => /^\d+$/.test(w)).map(Number)
}

const plus = (values: number[]) => values.map((v) => v + START_GAP)

describe('ll.GetUsedMemory() at the start of an SLua script', () => {
  it.each([
    ['reads it first', 'local a = ll.GetUsedMemory()\nll.OwnerSay("M0 " .. a)\n', [2277]],
    ['names LLEvents', 'local a = ll.GetUsedMemory()\nlocal e = LLEvents\nll.OwnerSay("M3 " .. a .. " " .. type(e))\n', [2351]],
    ['names LLTimers', 'local a = ll.GetUsedMemory()\nlocal e = LLTimers\nll.OwnerSay("M3b " .. a .. " " .. type(e))\n', [2352]],
    ['names neither', 'local a = ll.GetUsedMemory()\nlocal e = 0\nll.OwnerSay("M3c " .. a .. " " .. type(e))\n', [2326]],
  ])('is 71 bytes more than in-world when a script %s', async (_what, source, inWorld) => {
    // In-world: the values in the table. Naming LLEvents or LLTimers changes the bytecode only: the three scripts
    // differ by what their code takes, and rezless reads 71 more for each, as for every other script.
    expect(await read(source)).toEqual(plus(inWorld))
  })
})

describe('LLEvents and LLTimers', () => {
  it.each([
    ['LLTimers', 'local a = ll.GetUsedMemory()\nLLTimers = nil\nlocal b = ll.GetUsedMemory()\nll.OwnerSay("M1 " .. a .. " " .. b)\n', [2334, 2334]],
    ['LLEvents', 'local a = ll.GetUsedMemory()\nLLEvents = nil\nlocal b = ll.GetUsedMemory()\nll.OwnerSay("M2 " .. a .. " " .. b)\n', [2334, 2334]],
  ])('free nothing when the global %s is set to nil', async (_what, source, inWorld) => {
    // In-world: the values in the table, the same before and after.
    expect(await read(source)).toEqual(plus(inWorld))
  })

  it('free nothing when both are set to nil, and setting LLEvents again costs nothing', async () => {
    // In-world: 2397, 2397 after both were set to nil, and 2397 after LLEvents = 1.
    const source = 'local u = ll.GetUsedMemory\nlocal a = u()\nLLEvents = nil\nLLTimers = nil\nlocal b = u()\nLLEvents = 1\nlocal c = u()\nll.OwnerSay("G3 " .. a .. " " .. b .. " " .. c)\n'
    expect(await read(source)).toEqual(plus([2397, 2397, 2397]))
  })

  it('count each LLEvents:on handler', async () => {
    // In-world: 2601, then 2749 (+148) after the first listen handler, 2833 (+84) after a second one for the same
    // event, and 2981 (+148) after a touch_start handler.
    const source = `local a = ll.GetUsedMemory()
LLEvents:on("listen", function(ch, n, k, m) end)
local b = ll.GetUsedMemory()
LLEvents:on("listen", function(ch, n, k, m) end)
local c = ll.GetUsedMemory()
LLEvents:on("touch_start", function(d) end)
local d = ll.GetUsedMemory()
ll.OwnerSay("M9 " .. a .. " " .. b .. " " .. c .. " " .. d)
`
    expect(await read(source)).toEqual(plus([2601, 2749, 2833, 2981]))
  })

  it('count an LLTimers:once callback', async () => {
    // In-world: 2396, then 2713 (+317) after LLTimers:once(5, f).
    const source = 'local u = ll.GetUsedMemory\nlocal a = u()\nLLTimers:once(5, function() end)\nlocal b = u()\nll.OwnerSay("G5 " .. a .. " " .. b)\n'
    expect(await read(source)).toEqual(plus([2396, 2713]))
  })
})

describe('ll.Listen', () => {
  it('costs a script no memory', async () => {
    // In-world: 2426, 2426, 2426 around two ll.Listen calls.
    const source = `local a = ll.GetUsedMemory()
local h = ll.Listen(5, "", "", "")
local b = ll.GetUsedMemory()
local h2 = ll.Listen(6, "", "", "")
local c = ll.GetUsedMemory()
ll.OwnerSay("M8 " .. a .. " " .. b .. " " .. c)
`
    expect(await read(source)).toEqual(plus([2426, 2426, 2426]))
  })

  it('costs nothing after an LLEvents:on handler either', async () => {
    // In-world: 2485, then 2633 after the listen handler, and 2633 after ll.Listen. These are the two calls #456's
    // first script made before it read 3300; that one confounded the handler's 148 bytes with the start-up gap.
    const source = `local a = ll.GetUsedMemory()
LLEvents:on("listen", function(ch, n, k, m) end)
local b = ll.GetUsedMemory()
local h = ll.Listen(5, "", "", "")
local c = ll.GetUsedMemory()
ll.OwnerSay("M10 " .. a .. " " .. b .. " " .. c)
`
    expect(await read(source)).toEqual(plus([2485, 2633, 2633]))
  })

  it('compares with a function made at the top level', async () => {
    // In-world: 2342, then 2362: 20 bytes for the function.
    const source = 'local a = ll.GetUsedMemory()\nlocal f = function(ch, n, k, m) end\nlocal b = ll.GetUsedMemory()\nll.OwnerSay("M11 " .. a .. " " .. b)\n'
    expect(await read(source)).toEqual(plus([2342, 2362]))
  })
})

// In-world, a script's globals table grows by 128 bytes at its first new global and by 256 at its fifth, so it starts
// with four entries in four slots. rezless starts it with two (LLEvents and LLTimers), so it grows by 64 at the first
// new global, 128 at the third and 256 at the seventh. Setting LLEvents costs nothing in both. Twenty other names
// (_G, ll, llcompat, _VERSION, uuid, vector, quaternion, integer, bit32, lljson, llbase64, print, require, rotation,
// toquaternion, tovector, touuid, tostring, dangerouslyexecuterequiredmodule, _ENV) each cost 128 as a new global,
// so the region's other two entries are not any of these, and rezless doesn't model them. They aren't the copies of
// LLEvents and LLTimers that SLua's dangerouslyexecuterequiredmodule looks for under "/$ require_sandbox $ " names
// either: in-world, after LLEvents = nil and LLTimers = nil, it failed with "cannot call
// dangerouslyexecuterequiredmodule() without 'LLEvents' global".
describe('the globals table of an SLua script', () => {
  it.fails('grows as in-world when a script sets new globals', async () => {
    // In-world: 2870, then 2998 after X1, the same through X4, 3254 after X5, the same through X9.
    const source = `local u = ll.GetUsedMemory
local r = {}
r[1] = u()
X1 = 1 r[2] = u()
X2 = 1 r[3] = u()
X3 = 1 r[4] = u()
X4 = 1 r[5] = u()
X5 = 1 r[6] = u()
X6 = 1 r[7] = u()
X7 = 1 r[8] = u()
X8 = 1 r[9] = u()
X9 = 1 r[10] = u()
ll.OwnerSay("G2 " .. table.concat(r, " "))
`
    expect(await read(source)).toEqual(plus([2870, 2998, 2998, 2998, 2998, 3254, 3254, 3254, 3254, 3254]))
  })

  it('costs nothing to set LLEvents, which is already one', async () => {
    // In-world: LLEvents = LLEvents -> 0 bytes; X1 = X1 -> 128.
    const cost = async (name: string) => {
      const [a, b] = await read(`local u = ll.GetUsedMemory\nlocal a = u()\n${name} = ${name}\nlocal b = u()\nll.OwnerSay("K ${name} " .. a .. " " .. b)\n`)
      return b! - a!
    }
    expect(await cost('LLEvents')).toBe(0)
  })
})
