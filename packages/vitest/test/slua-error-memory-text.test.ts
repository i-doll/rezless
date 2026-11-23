import { describe, expect, it } from 'vitest'
import { loadLinkset, type Script } from '../src/index.js'

// Measured on the Aditi beta grid, region SLua Tideland, 2026-11-23, by reading the owner's nearby chat in the
// viewer. The probe below ran one case per chat command, about 7 s apart, and was reset before each. A second box
// listened on DEBUG_CHANNEL and repeated what it heard with llOwnerSay. The owner check that guarded the listen
// handler is replaced by a comment so the line numbers stay the same.

const DEBUG_CHANNEL = 2147483647
const NAME = 'probe issue-456 err'
const HEADER = `${NAME} [script:p] Script run-time error`

const PROBE = `LLEvents:on("listen", function(ch, name, id, msg)
  -- (the probe answered only its owner here)
  if msg == "e1" then error("not enough memory", 0)
  elseif msg == "e2" then error("not enough memory")
  elseif msg == "e3" then local t = {} while true do t[#t + 1] = {} end
  elseif msg == "e4" then
    local ok, e = pcall(function() local t = {} while true do t[#t + 1] = {} end end)
    ll.OwnerSay("E4 caught " .. tostring(ok) .. " " .. tostring(e))
    error(e, 0)
  elseif msg == "e5" then error("not enough memory\\n", 0)
  end
end)
ll.Listen(4566, "", "", "")
ll.OwnerSay("E ready")
`

async function crash(msg: string) {
  const { scripts, linkset } = await loadLinkset({
    prims: [
      { name: NAME, scripts: [{ source: { source: PROBE, filename: 'p.luau', language: 'slua' }, name: 'p', start: false, memoryLimit: true }] },
      {
        name: 'listener',
        scripts: [{ source: { source: 'list heard; default { state_entry() { llListen(DEBUG_CHANNEL, "", NULL_KEY, ""); } listen(integer c, string n, key id, string m) { heard += m; } }', filename: 'l.lsl' }, name: 'l' }],
      },
    ],
  })
  scripts.l!.start()
  const probe: Script = scripts.p!
  probe.start()
  expect(() => {
    probe.fire('listen', { channel: 4566, name: 'owner', id: '00000000-0000-0000-0000-000000000001', msg })
    linkset.advanceTime(1000)
  }).toThrow()
  linkset.advanceTime(1000)
  expect(probe.crashed).toBe(true)
  return {
    said: probe.chat.filter((c) => c.channel !== DEBUG_CHANNEL).map((c) => c.text),
    shown: probe.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text),
    heard: scripts.l!.global('heard') as string[],
  }
}

describe('"not enough memory" raised by a script', () => {
  it.each([
    // In-world: the owner saw the message and its traceback; the listener heard "runtime error", not "not enough memory".
    ['error("not enough memory", 0)', 'e1', 'not enough memory\n[C] function error\nlua_script:3\n[C] function _handleEvent\n'],
    ['error("not enough memory")', 'e2', 'lua_script:4: not enough memory\n[C] function error\nlua_script:4\n[C] function _handleEvent\n'],
    ['the text with a newline after it', 'e5', 'not enough memory\n\n[C] function error\nlua_script:10\n[C] function _handleEvent\n'],
  ])('is a plain run-time error to listeners: %s', async (_what, msg, text) => {
    const { shown, heard } = await crash(msg)
    expect(shown).toEqual([HEADER, text])
    expect(heard).toEqual([HEADER, 'runtime error'])
  })

  it('is a plain run-time error when it rethrows a caught out-of-memory error', async () => {
    // In-world: pcall caught running out of memory as false, "not enough memory"; error(e, 0) then showed the owner
    // its traceback, and the listener heard "runtime error".
    const { said, shown, heard } = await crash('e4')
    expect(said).toEqual(['E ready', 'E4 caught false not enough memory'])
    expect(shown).toEqual([HEADER, 'not enough memory\n[C] function error\nlua_script:9\n[C] function _handleEvent\n'])
    expect(heard).toEqual([HEADER, 'runtime error'])
  })

  it('differs from running out of memory, which listeners hear as "not enough memory"', async () => {
    // In-world: a handler that grew a table until it ran out showed the owner "not enough memory" with its traceback,
    // and the listener heard "not enough memory".
    const { shown, heard } = await crash('e3')
    expect(shown).toEqual([HEADER, 'not enough memory\nlua_script:5\n[C] function _handleEvent\n'])
    expect(heard).toEqual([HEADER, 'not enough memory'])
  })

  it('is "not enough memory" to listeners when a coroutine.wrap function runs out', async () => {
    // In-world (a second probe that day): a script whose top level called a coroutine.wrap function that grew a table
    // until it ran out showed the owner "not enough memory" with the wrapped frame, and the listener heard
    // "not enough memory".
    const { scripts, linkset } = await loadLinkset({
      prims: [
        {
          name: 'probe issue-456 wrap',
          scripts: [{ source: { source: 'll.OwnerSay("W start")\ncoroutine.wrap(function() local t = {} while true do t[#t + 1] = {} end end)()\n', filename: 'p.luau', language: 'slua' }, name: 'p', start: false, memoryLimit: true }],
        },
        {
          name: 'listener',
          scripts: [{ source: { source: 'list heard; default { state_entry() { llListen(DEBUG_CHANNEL, "", NULL_KEY, ""); } listen(integer c, string n, key id, string m) { heard += m; } }', filename: 'l.lsl' }, name: 'l' }],
        },
      ],
    })
    scripts.l!.start()
    expect(() => scripts.p!.start()).toThrow('not enough memory')
    linkset.advanceTime(1000)
    const header = 'probe issue-456 wrap [script:p] Script run-time error'
    expect(scripts.p!.chat.filter((c) => c.channel === DEBUG_CHANNEL).map((c) => c.text)).toEqual([header, 'not enough memory\n[C] function <wrapped>\nlua_script:2\n'])
    expect(scripts.l!.global('heard')).toEqual([header, 'not enough memory'])
  })
})
