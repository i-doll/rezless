import { describe, it, expect } from 'vitest'
import { loadLinkset } from '../src/index.js'

// Each script says the link messages it got, in order. A "!" marks a message that ran before
// the script's own state_entry.
const MEMBER = `string N; string got;
default {
  state_entry() { N = llGetScriptName(); llSetTimerEvent(4.0); llMessageLinked(LINK_SET, 0, N, ""); }
  link_message(integer s, integer n, string m, key id) { got += " " + m; if (N == "") got += "!"; }
  timer() { llSetTimerEvent(0); llOwnerSay(N + " got" + got); }
}`

async function members(root: string[], child: string[]) {
  const scripts = (names: string[]) => names.map(name => ({ name, source: { source: MEMBER, filename: `${name}.lsl` } }))
  return loadLinkset({ prims: [{ scripts: scripts(root) }, { scripts: scripts(child) }] })
}

function reports(scripts: Record<string, { chat: ReadonlyArray<{ text: string }> }>) {
  return Object.fromEntries(Object.entries(scripts).map(([name, s]) => [name, s.chat.map(c => c.text)]))
}

describe('Linkset.startAll', () => {
  it('starts every script together, so each gets every link message sent from state_entry', async () => {
    // In-world: resetting all eight scripts of a two-prim object started them in one frame,
    // and every script got all eight messages, in the order the state_entry events ran
    // ("f a e c d b x g" in one run, "e a c g x b d f" in another). No message ran before the
    // receiver's own state_entry. (Aditi, SLua Tideland, 2026-11-24)
    const { linkset, scripts } = await members(['a', 'b'], ['c'])
    linkset.startAll()
    linkset.advanceTime(5000)
    expect(reports(scripts)).toEqual({
      a: ['a got a b c'],
      b: ['b got a b c'],
      c: ['c got a b c'],
    })
  })

  it('loses link messages sent before a script starts', async () => {
    // In-world: the scripts of a duplicated object started over several frames, a script or a
    // few per frame, in an order that changed from copy to copy. Each script got the messages
    // of the scripts that started in its frame or later, and none from earlier frames: with one
    // script per frame, the first to start ("f") got all eight messages and the last ("x")
    // only its own. (Aditi, SLua Tideland, 2026-11-24)
    const { linkset, scripts } = await members(['a', 'b'], ['c'])
    linkset.startAll([scripts.b!])
    linkset.advanceTime(22)
    linkset.startAll([scripts.a!, scripts.c!])
    linkset.advanceTime(5000)
    expect(reports(scripts)).toEqual({
      a: ['a got a c'],
      b: ['b got b a c'],
      c: ['c got a c'],
    })
  })

  it('loses them for a script started on its own later, as start() does', async () => {
    const { linkset, scripts } = await members(['a'], ['b'])
    scripts.a!.start()
    scripts.b!.start()
    linkset.advanceTime(5000)
    expect(reports(scripts)).toEqual({ a: ['a got a b'], b: ['b got b'] })
  })

  it('leaves started scripts alone and starts the rest', async () => {
    const { linkset, scripts } = await members(['a', 'b'], [])
    scripts.a!.start()
    linkset.advanceTime(5000)
    linkset.startAll()
    linkset.advanceTime(5000)
    expect(reports(scripts)).toEqual({ a: ['a got a'], b: ['b got b'] })
    expect(scripts.a!.global('got')).toBe(' a b')
  })

  it('keeps the start of a stopped script until it runs', async () => {
    const { linkset, scripts } = await members(['a', 'b'], [])
    scripts.b!.running = false
    linkset.startAll()
    linkset.advanceTime(5000)
    expect(reports(scripts)).toEqual({ a: ['a got a'], b: [] })
    scripts.b!.running = true
    linkset.advanceTime(5000)
    expect(reports(scripts)).toEqual({ a: ['a got a'], b: ['b got b'] })
    expect(scripts.a!.global('got')).toBe(' a b')
  })

  it('refuses a script from another object', async () => {
    const one = await members(['a'], [])
    const two = await members(['b'], [])
    expect(() => one.linkset.startAll([two.scripts.b!])).toThrow(/not in this object/)
  })
})
