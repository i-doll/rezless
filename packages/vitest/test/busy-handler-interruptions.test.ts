import { describe, expect, it } from 'vitest'
import { loadLinkset, makeInventoryItem, InventoryType, World } from '../src/index.js'

const OWNER = '00000000-0000-0000-0000-0000000000aa'

describe('llDerezObject(DEREZ_TO_INVENTORY) under a sitter, while a seat script is in a handler', () => {
  // A script handles one event at a time. A seat script still in a handler when the seat is
  // derezzed cannot run the stand's changed(CHANGED_LINK) before the object goes, as one asleep
  // in llSleep cannot.
  it('gives the stand\'s changed event to the idle seat scripts only', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
    const seatSource = `list log; default {
      changed(integer c) { log += "changed"; }
      touch_start(integer n) { log += "t1"; llOwnerSay("x"); log += "t2"; } }`
    const made = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [
      { name: 'busy', source: { source: seatSource } },
      { name: 'idle', source: { source: seatSource } },
    ] }] })
    for (const script of Object.values(made.scripts)) script.start()
    const saved = made.linkset.copy()
    made.linkset.remove()
    const rezzer = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'main', source: { source: `key child; default {
      object_rez(key id) { child = id; }
      link_message(integer s, integer n, string m, key k) {
        if (m == "rez") llRezObject("seat", llGetPos() + <0, 0, 1>, ZERO_VECTOR, ZERO_ROTATION, 0);
        else llOwnerSay((string)llDerezObject(child, DEREZ_TO_INVENTORY)); } }` } }] }] })
    rezzer.prims[0]!.addInventory(makeInventoryItem({ name: 'seat', type: InventoryType.OBJECT, key: saved.prims[0]!.key, object: saved }))
    const main = rezzer.scripts['main']!
    main.start()
    const tell = (str: string) => main.fire('link_message', { sender_num: 1, num: 0, str, id: '' })
    tell('rez')
    const seat = world.linksets.at(-1)!
    seat.advanceTime(0)
    expect(world.sitAvatar(avatar, seat.prims[0]!)).toBe(true)
    seat.advanceTime(0)
    const script = (name: string) => seat.allScripts().find(s => s.scriptName === name)!
    script('busy').mock('llOwnerSay', () => { tell('derez'); return undefined })
    script('busy').fire('touch_start', { num_detected: 1 })
    expect(main.chat.at(-1)!.text).toBe('1')
    expect(seat.dead).toBe(true)
    expect(avatar.sittingOn).toBeNull()
    expect(script('busy').global('log')).toEqual(['changed', 't1', 't2'])
    expect(script('idle').global('log')).toEqual(['changed', 'changed'])
  })
})

// In-world: a probe's listen handler spun in a 20 s loop reading llGetTime and saying a tick
// every 2 s. A chat line and a click came in, then the owner pressed Reset (or saved the script
// again, which recompiles it) 7 s in. No tick and no end of the loop came after it: the probe said
// its state_entry line with its globals back at their start, and never heard the chat line or the
// click. An SLua probe did the same for both (Aditi, SLua Tideland, 2026-11-23).
describe('an owner Reset or Recompile of a script whose handler is running', () => {
  const lsl = `list log; integer n;
    default {
      state_entry() { n++; log += "se " + (string)n; }
      touch_start(integer k) { n += 10; log += "t1"; llOwnerSay("x"); log += "t2 " + (string)n; llOwnerSay("y"); }
      link_message(integer s, integer k, string m, key id) { log += "lm " + m; } }`
  const slua = `log = {}
    n = 0
    n += 1
    table.insert(log, "se " .. n)
    LLEvents:on("touch_start", function() n += 10; table.insert(log, "t1"); ll.OwnerSay("x"); table.insert(log, "t2 " .. n); ll.OwnerSay("y") end)
    LLEvents:on("link_message", function(s, k, m, id) table.insert(log, "lm " .. m) end)`

  async function busy(language: 'lsl' | 'slua', edit: 'reset' | 'recompile') {
    const { prims, scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 'a', language, source: { source: language === 'lsl' ? lsl : slua } }] }] })
    const a = scripts['a']!
    a.start()
    const said: string[] = []
    a.mock('llOwnerSay', (_, [text]) => {
      said.push(text as string)
      if (text !== 'x') return undefined
      a.fire('link_message', { sender_num: 0, num: 0, str: 'before', id: '' })
      if (edit === 'reset') a.reset()
      else prims[0]!.replaceInventory('a', {})
      return undefined
    })
    a.fire('touch_start', { num_detected: 1 })
    a.linkset.advanceTime(100)
    const log = a.global('log')
    return { said, log: Array.isArray(log) ? log : Object.values(log as Record<string, unknown>) }
  }

  for (const language of ['lsl', 'slua'] as const) {
    for (const edit of ['reset', 'recompile'] as const) {
      it(`stops the handler and runs state_entry next (${language}, ${edit})`, async () => {
        expect(await busy(language, edit)).toEqual({ said: ['x'], log: ['se 1'] })
      })
    }
  }

  it('stops the handler of a script stopped and then reset inside it', async () => {
    const { scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 'a', source: { source: lsl } }] }] })
    const a = scripts['a']!
    a.start()
    const said: string[] = []
    a.mock('llOwnerSay', (_, [text]) => {
      said.push(text as string)
      if (text === 'x') {
        a.running = false
        a.reset()
      }
      return undefined
    })
    a.fire('touch_start', { num_detected: 1 })
    expect(said).toEqual(['x'])
    expect(a.global('log')).toEqual([])
    a.running = true
    a.linkset.advanceTime(100)
    expect(a.global('log')).toEqual(['se 1'])
  })

  it('waits for an SLua top level that sleeps after a reset inside a handler', async () => {
    const { scripts } = await loadLinkset({ prims: [{ scripts: [{ name: 'a', language: 'slua', source: { source: `log = {}
      table.insert(log, "se")
      ll.Sleep(1.0)
      table.insert(log, "woke")
      LLEvents:on("touch_start", function() ll.OwnerSay("x"); table.insert(log, "t2") end)` } }] }] })
    const a = scripts['a']!
    a.start()
    a.linkset.advanceTime(2000)
    a.mock('llOwnerSay', () => { a.reset(); return undefined })
    a.fire('touch_start', { num_detected: 1 })
    expect(a.wakeAt).toBeUndefined()
    expect(Object.values(a.global('log') as Record<string, unknown>)).toEqual(['se', 'woke'])
  })
})

describe('a detach while a handler of the worn object\'s script is running', () => {
  // In-world: a worn probe's listen handler spun in a 12 s loop reading llGetTime. A chat line
  // came in and another script in the object called llDetachFromAvatar 4 s in. Worn again, the
  // loop ran on to its end and the probe logged on_rez, the chat line, attach(NULL_KEY) and
  // attach(avatar), as it did with llSleep(12.0) in place of the loop (Aditi, SLua Tideland,
  // 2026-11-23).
  it('keeps the events that waited for the handler, as a sleeping handler does', async () => {
    const { linkset, scripts } = await loadLinkset({ owner: OWNER, prims: [{ scripts: [{ name: 'a', source: { source: `list log;
      default {
        on_rez(integer p) { log += "rez"; }
        attach(key id) { log += "attach " + (string)(id != NULL_KEY); }
        link_message(integer s, integer n, string m, key id) {
          if (m == "busy") { log += "begin"; llOwnerSay("x"); log += "end"; }
          else log += "heard " + m; } }` } }] }] })
    const a = scripts['a']!
    a.start()
    linkset.attachToAvatar(OWNER, 5)
    linkset.advanceTime(0)
    a.mock('llOwnerSay', () => {
      a.fire('link_message', { sender_num: 0, num: 0, str: 'a', id: '' })
      linkset.detachFromAvatar()
      return undefined
    })
    a.fire('link_message', { sender_num: 0, num: 0, str: 'busy', id: '' })
    linkset.attachToAvatar(OWNER, 5)
    linkset.advanceTime(100)
    expect(a.global('log')).toEqual(['attach 1', 'begin', 'end', 'rez', 'heard a', 'attach 0', 'attach 1'])
  })

  it('keeps the events in a copy of the detached object', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
    const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'a', source: { source: `list log;
      default {
        on_rez(integer p) { log += "rez"; }
        attach(key id) { log += "attach " + (string)(id != NULL_KEY); }
        link_message(integer s, integer n, string m, key id) {
          if (m == "busy") { log += "begin"; llOwnerSay("x"); log += "end"; }
          else log += "heard " + m; } }` } }] }] })
    const a = scripts['a']!
    a.start()
    linkset.attachToAvatar(OWNER, 5)
    linkset.advanceTime(0)
    a.mock('llOwnerSay', () => {
      a.fire('link_message', { sender_num: 0, num: 0, str: 'a', id: '' })
      linkset.detachFromAvatar()
      return undefined
    })
    a.fire('link_message', { sender_num: 0, num: 0, str: 'busy', id: '' })
    const copy = linkset.copy({ world, region: 'home', owner: OWNER })
    for (const script of copy.allScripts()) script.queueRez()
    copy.attachToAvatar(OWNER, 5)
    copy.advanceTime(100)
    expect(copy.allScripts()[0]!.global('log')).toEqual(['attach 1', 'begin', 'end', 'rez', 'heard a', 'attach 0', 'attach 1'])
  })

  // As for a handler asleep at the detach, the script gets no attach(NULL_KEY) before the
  // temporary attachment goes.
  it('still removes a temporary attachment detached during the handler', async () => {
    const { linkset, scripts } = await loadLinkset({ owner: OWNER, prims: [{ scripts: [{ name: 'a', source: { source: `list log; default {
      link_message(integer s, integer n, string m, key id) { llOwnerSay("x"); }
      attach(key id) { log += "attach " + (string)(id != NULL_KEY); } }` } }] }] })
    const a = scripts['a']!
    a.start()
    linkset.attachToAvatar(OWNER, 5, true)
    linkset.advanceTime(0)
    a.mock('llOwnerSay', () => { linkset.detachFromAvatar(); return undefined })
    a.fire('link_message', { sender_num: 0, num: 0, str: 'go', id: '' })
    expect(linkset.dead).toBe(true)
    expect(a.global('log')).toEqual(['attach 1'])
  })
})
