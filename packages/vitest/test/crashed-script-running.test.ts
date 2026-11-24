import { describe, expect, it } from 'vitest'
import { loadLinkset, World, makeInventoryItem, InventoryType, NULL_KEY, DEBUG_CHANNEL, type Linkset, type Script } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlSetScriptState
// https://wiki.secondlife.com/wiki/LlResetOtherScript
//
// In-world: measured on the Aditi beta grid, SLua Tideland, with the Firestorm viewer, 2026-11-24.
// One prim held an LSL (Mono) script `a` that crashed with a Stack-Heap Collision by doubling a
// list, an SLua script `b` that crashed on error("boom"), and a control script that ran
// llSetScriptState, llResetOtherScript and llGetScriptState on command. `a` and `b` said "entry"
// with a global g on start, "tick" every 4 s and "pong" to a link message; g was set to 42
// before each crash. The owner used the viewer's Running checkbox, its Reset button, saved the
// script again and took and rezzed the object. Here the LSL script crashes on a division by zero,
// which the earlier probes in run-time-errors.test.ts showed leaves a script in the same state.

const lslVictim = `integer g; list log;
  default {
    state_entry() { log += "entry " + (string)g; llSetTimerEvent(4.0); }
    on_rez(integer p) { log += "on_rez " + (string)g; }
    timer() { log += "tick " + (string)g; }
    link_message(integer s, integer n, string m, key k) {
      if (m == "ping") log += "pong " + (string)g;
      else if (m == "set") g = 42;
      else if (m == "crash") { integer z; g = g / z; }
    }
  }`

const sluaVictim = `g = 0
log = {}
table.insert(log, "entry " .. g)
LLTimers:every(4, function() table.insert(log, "tick " .. g) end)
LLEvents:on("on_rez", function(p) table.insert(log, "on_rez " .. g) end)
LLEvents:on("link_message", function(s, n, m, k)
  if m == "ping" then table.insert(log, "pong " .. g)
  elseif m == "set" then g = 42
  elseif m == "crash" then error("boom") end
end)`

const control = `list states;
  default {
    link_message(integer s, integer n, string m, key k) {
      if (m == "start") llSetScriptState(k, TRUE);
      else if (m == "stop") llSetScriptState(k, FALSE);
      else if (m == "reset") llResetOtherScript(k);
      else if (m == "state") states += llGetScriptState(k);
    }
  }`

type Lang = 'lsl' | 'slua'

async function rig(lang: Lang, lsl = lslVictim) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const victim = lang === 'lsl'
    ? { name: 'a', source: { source: lsl } }
    : { name: 'a', language: 'slua', source: { source: sluaVictim, filename: 'a.luau' } }
  const payload = await loadLinkset({ prims: [{ name: 'rig', scripts: [victim, { name: 'ctl', source: { source: control } }] }] })
  for (const s of Object.values(payload.scripts)) s.start()
  const item = makeInventoryItem({ name: 'payload', type: InventoryType.OBJECT })
  Object.assign(item, { object: payload.linkset })
  const rezzer = await loadLinkset({ world, region: 'home', position: { x: 100, y: 100, z: 30 }, prims: [{
    name: 'rezzer', inventory: [item], scripts: [{ name: 'parent', source: { source: `
      key child;
      default {
        touch_start(integer n) { llRezObject("payload", llGetPos() + <0.0, 0.0, 1.0>, ZERO_VECTOR, ZERO_ROTATION, 7); }
        object_rez(key id) { child = id; }
        link_message(integer s, integer n, string m, key k) { llDerezObject(child, DEREZ_TO_INVENTORY); }
      }
    ` } }],
  }] })
  const parent = rezzer.scripts['parent']!
  parent.start()
  let linkset: Linkset
  const scripts = () => {
    const all = linkset.allScripts()
    return { a: all.find(s => s.scriptName === 'a')!, ctl: all.find(s => s.scriptName === 'ctl')! }
  }
  /** Rez the object from the rezzer's contents, or take it back and rez it again. */
  const rez = () => {
    parent.fire('touch_start', { num_detected: 1 })
    linkset = world.linksets.at(-1)!
    linkset.advanceTime(0)
    return scripts()
  }
  const takeAndRez = () => {
    parent.fire('link_message', { sender_num: 1, num: 0, str: '', id: NULL_KEY })
    return rez()
  }
  /** Take a copy into the rezzer's item and rez it, leaving the original where it is. */
  const takeCopyAndRez = () => {
    const original = linkset
    Object.assign(rezzer.prims[0]!.inventory.find(i => i.name === 'payload')!, { object: linkset.copy() })
    return { original: original.allScripts().find(s => s.scriptName === 'a')!, ...rez() }
  }
  /** The viewer's Duplicate: the copy's `a`, with its first events run. */
  const duplicate = () => {
    const copy = linkset.duplicate({ x: 0, y: 0, z: 0.6 })
    copy.advanceTime(0)
    return copy.allScripts().find(s => s.scriptName === 'a')!
  }
  rez()
  const send = (m: string) => {
    const { a } = scripts()
    linkset.clock.schedule(a, linkset.clock.now, 'link_message', { sender_num: 1, num: 0, str: m, id: NULL_KEY })
  }
  /** Have the control script call llSetScriptState, llResetOtherScript or llGetScriptState on `a`. */
  const tell = (m: 'start' | 'stop' | 'reset' | 'state') => scripts().ctl.fire('link_message', { sender_num: 1, num: 0, str: m, id: 'a' })
  const wait = (ms: number) => linkset.advanceTime(ms)
  const crash = () => {
    send('set')
    send('crash')
    expect(() => wait(0)).toThrow(lang === 'lsl' ? 'Math Error' : 'boom')
    const { a } = scripts()
    expect(a.crashed).toBe(true)
    a.setGlobal('log', [])
  }
  // An SLua script that has not run its top level since a reset has no log yet.
  const log = () => {
    try {
      return scripts().a.global('log')
    } catch {
      return []
    }
  }
  const states = () => scripts().ctl.global('states')
  const debug = () => scripts().a.chat.filter(c => c.channel === DEBUG_CHANNEL).map(c => c.text)
  return { world, scripts, send, tell, wait, crash, log, states, takeAndRez, takeCopyAndRez, duplicate, debug, prim: () => linkset.prims[0]! }
}

describe.each<Lang>(['lsl', 'slua'])('a crashed %s script', (lang) => {
  it('stays crashed when the owner sets it running', async () => {
    // In-world: after the crash the Running checkbox still read on. Setting it on, and off then
    // on, left llGetScriptState at 0, and the script said nothing to a link message or its
    // timer in the next 5 s. Two runs each, LSL and SLua.
    const r = await rig(lang)
    r.crash()
    const { a } = r.scripts()
    a.running = true
    r.tell('state')
    a.running = false
    a.running = true
    r.tell('state')
    r.send('ping')
    r.wait(10_000)
    expect(r.states()).toEqual([0, 0])
    expect(a.running).toBe(false)
    expect(a.crashed).toBe(true)
    expect(r.log()).toEqual([])
  })

  it('runs again from the top on llResetOtherScript after the owner set it running', async () => {
    // In-world: llResetOtherScript after the checkbox was turned off and on -> llGetScriptState 1
    // at once, then "entry 0", and it answered a link message.
    const r = await rig(lang)
    r.crash()
    const { a } = r.scripts()
    a.running = false
    a.running = true
    r.tell('reset')
    r.tell('state')
    r.send('ping')
    r.wait(0)
    expect(r.states()).toEqual([1])
    expect(r.log()).toEqual(['entry 0', 'pong 0'])
  })

  it.each(['the checkbox', 'llSetScriptState'] as const)('ignores llResetOtherScript while stopped with %s', async (how) => {
    // In-world: a crashed script stopped with the Running checkbox, or with llSetScriptState FALSE,
    // then reset with llResetOtherScript -> llGetScriptState 0 and nothing said. Started again
    // (checkbox or llSetScriptState TRUE) it still said nothing and read 0. A second
    // llResetOtherScript, now that it was set running, brought it back with "entry 0". Two runs
    // with the checkbox (LSL and SLua), one with llSetScriptState (LSL).
    const r = await rig(lang)
    r.crash()
    const { a } = r.scripts()
    if (how === 'the checkbox') a.running = false
    else r.tell('stop')
    r.tell('reset')
    r.tell('state')
    r.send('ping')
    r.wait(5000)
    expect(r.log()).toEqual([])
    if (how === 'the checkbox') a.running = true
    else r.tell('start')
    r.tell('state')
    r.send('ping')
    r.wait(5000)
    expect(r.log()).toEqual([])
    r.tell('reset')
    r.tell('state')
    r.send('ping')
    r.wait(0)
    expect(r.states()).toEqual([0, 0, 1])
    expect(r.log()).toEqual(['entry 0', 'pong 0'])
  })

  it.each(['reset', 'recompile'] as const)('runs again on the owner’s %s while set running', async (how) => {
    // In-world: the viewer's Reset, and saving the script again, on a crashed script with the
    // checkbox on -> "entry 0", llGetScriptState 1 and an answer to a link message.
    const r = await rig(lang)
    r.crash()
    if (how === 'reset') r.scripts().a.reset()
    else r.prim().replaceInventory('a', {})
    r.tell('state')
    r.send('ping')
    r.wait(0)
    expect(r.states()).toEqual([1])
    expect(r.log()).toEqual(['entry 0', 'pong 0'])
  })

  it.each(['reset', 'recompile'] as const)('waits for its start after the owner’s %s while stopped', async (how) => {
    // In-world: with the checkbox off, the viewer's Reset or a save of the script said nothing and
    // llGetScriptState read 0. Turning the checkbox on then ran "entry 0", read 1 and answered.
    const r = await rig(lang)
    r.crash()
    const { a } = r.scripts()
    a.running = false
    if (how === 'reset') a.reset()
    else r.prim().replaceInventory('a', {})
    r.tell('state')
    r.wait(5000)
    expect(r.log()).toEqual([])
    expect(a.crashed).toBe(false)
    a.running = true
    r.tell('state')
    r.send('ping')
    r.wait(0)
    expect(r.states()).toEqual([0, 1])
    expect(r.log()).toEqual(['entry 0', 'pong 0'])
  })

  it('comes out of a take reset and stopped when it was stopped', async () => {
    // In-world: crashed, the checkbox turned off, then taken and rezzed -> nothing said, no error
    // said again, llGetScriptState 0 and the checkbox off. Turned on, it said "entry 0" (no
    // on_rez) and answered.
    const r = await rig(lang)
    r.crash()
    r.scripts().a.running = false
    const { a } = r.takeAndRez()
    r.tell('state')
    r.wait(5000)
    expect(r.log()).toEqual([])
    expect(r.debug()).toEqual([])
    expect(a.crashed).toBe(false)
    a.running = true
    r.tell('state')
    r.send('ping')
    r.wait(0)
    expect(r.states()).toEqual([0, 1])
    expect(r.log()).toEqual(['entry 0', 'pong 0'])
  })
})

describe('a crashed LSL script stopped and started again', () => {
  it.each(['the checkbox', 'llSetScriptState'] as const)('comes out of a take stuck, stopped and started with %s', async (how) => {
    // In-world: a crashed LSL script with the checkbox turned off and on again (two runs), or
    // llSetScriptState FALSE then TRUE (one run), then taken and rezzed, said nothing: no
    // state_entry, no on_rez, no tick. llGetScriptState read 0. llResetOtherScript then read 1
    // at once, but it still ran nothing; the viewer's Reset did not help either. Saving the
    // script again brought it back with "entry 0". Left alone (checkbox on throughout), the
    // same crash came back in the rezzed object with "entry 42" and "on_rez 42".
    const r = await rig('lsl')
    r.crash()
    if (how === 'the checkbox') {
      r.scripts().a.running = false
      r.scripts().a.running = true
    } else {
      r.tell('stop')
      r.tell('start')
    }
    const { a } = r.takeAndRez()
    r.tell('state')
    r.send('ping')
    r.wait(5000)
    expect(r.log()).toEqual([])
    r.tell('reset')
    r.tell('state')
    r.send('ping')
    r.wait(5000)
    a.reset()
    r.send('ping')
    r.wait(5000)
    expect(r.states()).toEqual([0, 1])
    expect(r.log()).toEqual([])
    r.prim().replaceInventory('a', {})
    r.send('ping')
    r.wait(0)
    expect(r.log()).toEqual(['entry 0', 'pong 0'])
  })

  it('comes back as usual when the checkbox was only set on', async () => {
    // In-world: the checkbox set on (it already was) on the crashed script, then taken and
    // rezzed -> "entry 42", "on_rez 42", then the overdue tick, and it answered.
    const r = await rig('lsl')
    r.crash()
    r.scripts().a.running = true
    r.wait(5000)
    r.takeAndRez()
    r.send('ping')
    r.wait(0)
    expect(r.log()).toEqual(['entry 42', 'on_rez 42', 'tick 42', 'pong 42'])
  })
})

describe('a crashed SLua script stopped and started again', () => {
  it('says its error again in the rezzed object and runs again on llResetOtherScript', async () => {
    // In-world: crashed, the checkbox turned off and on, then taken and rezzed -> the prim said
    // both error lines again and llGetScriptState read 0. llResetOtherScript -> read 1 and it
    // said "entry 0", as after a plain crash.
    const r = await rig('slua')
    r.crash()
    r.scripts().a.running = false
    r.scripts().a.running = true
    r.takeAndRez()
    expect(r.debug()).toEqual(['rig [script:a] Script run-time error', 'lua_script:9: boom\n[C] function error\nlua_script:9\n[C] function _handleEvent\n'])
    r.tell('state')
    r.tell('reset')
    r.tell('state')
    r.send('ping')
    r.wait(0)
    expect(r.states()).toEqual([0, 1])
    expect(r.log()).toEqual(['entry 0', 'pong 0'])
  })
})

describe('a crashed script in a worn object detached and worn again', () => {
  // In-world: the same scripts in an object worn on the chest, detached by the control script
  // with llDetachFromAvatar and worn again from inventory (Aditi, SLua Tideland, 2026-11-24).
  async function worn(lang: Lang) {
    const owner = '11111111-1111-1111-1111-111111111111'
    const victim = lang === 'lsl'
      ? { name: 'a', source: { source: lslVictim } }
      : { name: 'a', language: 'slua', source: { source: sluaVictim, filename: 'a.luau' } }
    const { linkset, scripts } = await loadLinkset({ owner, prims: [{ name: 'worn', scripts: [victim, { name: 'ctl', source: { source: control } }] }] })
    const a = scripts['a']!, ctl = scripts['ctl']!
    a.start()
    ctl.start()
    linkset.attachToAvatar(owner, 1)
    const send = (m: string) => {
      linkset.clock.schedule(a, linkset.clock.now, 'link_message', { sender_num: 1, num: 0, str: m, id: NULL_KEY })
    }
    const tell = (m: string) => ctl.fire('link_message', { sender_num: 1, num: 0, str: m, id: 'a' })
    send('set')
    send('crash')
    expect(() => linkset.advanceTime(0)).toThrow(lang === 'lsl' ? 'Math Error' : 'boom')
    a.setGlobal('log', [])
    const rewear = () => {
      linkset.detachFromAvatar()
      linkset.advanceTime(5000)
      linkset.attachToAvatar(owner, 1)
      linkset.advanceTime(0)
    }
    const log = () => {
      try {
        return a.global('log')
      } catch {
        return []
      }
    }
    return { a, linkset, send, tell, rewear, log, states: () => ctl.global('states'), debug: () => a.chat.filter(c => c.channel === DEBUG_CHANNEL) }
  }

  it.each<Lang>(['lsl', 'slua'])('comes back reset and stopped when it was stopped (%s)', async (lang) => {
    // In-world: crashed, the checkbox turned off, detached and worn again -> nothing said, no
    // error said again, llGetScriptState 0. Turned on, it said "entry 0" and answered. Two runs
    // in LSL, one in SLua.
    const r = await worn(lang)
    r.a.running = false
    const said = r.debug().length
    r.rewear()
    r.tell('state')
    r.send('ping')
    r.linkset.advanceTime(5000)
    expect(r.log()).toEqual([])
    expect(r.debug()).toHaveLength(said)
    r.a.running = true
    r.tell('state')
    r.send('ping')
    r.linkset.advanceTime(0)
    expect(r.states()).toEqual([0, 1])
    expect(r.log()).toEqual(['entry 0', 'pong 0'])
  })

  it('comes back stuck when it was stopped and started again, and reads its checkbox once reset', async () => {
    // In-world: crashed, the checkbox turned off and on, detached and worn again -> nothing said
    // and llGetScriptState 0. llResetOtherScript -> read 1, still nothing said. Then with the
    // checkbox off it read 0, llResetOtherScript read 0, and with the checkbox on again 1.
    const r = await worn('lsl')
    r.a.running = false
    r.a.running = true
    r.rewear()
    r.tell('state')
    r.tell('reset')
    r.tell('state')
    r.send('ping')
    r.linkset.advanceTime(5000)
    r.a.running = false
    r.tell('state')
    r.tell('reset')
    r.tell('state')
    r.a.running = true
    r.tell('state')
    r.linkset.advanceTime(5000)
    expect(r.states()).toEqual([0, 1, 0, 0, 1])
    expect(r.log()).toEqual([])
  })
})

// In-world (Aditi beta grid, SLua Tideland, 2026-11-24): the same scripts, crashed the same way,
// in an object the owner took a copy of or duplicated with the viewer's Duplicate, two runs each.
describe('a copy of a crashed script', () => {
  const copyLog = (s: Script) => {
    try {
      return s.global('log')
    } catch {
      return []
    }
  }

  it('comes out of a Take Copy of an LSL script left set running as out of a take', async () => {
    // In-world: Take Copy of the crashed object, then a rez of the copy -> "entry 42", "on_rez 42"
    // and ticks with g 42. The original stayed down and llGetScriptState read 0 there.
    const r = await rig('lsl')
    r.crash()
    r.wait(5000)
    const { original } = r.takeCopyAndRez()
    r.send('ping')
    r.wait(0)
    expect(r.log()).toEqual(['entry 42', 'on_rez 42', 'tick 42', 'pong 42'])
    expect(original.crashed).toBe(true)
    expect(copyLog(original)).toEqual([])
  })

  it('says its error again from a Take Copy of an SLua script left set running', async () => {
    // In-world: the rezzed copy said both error lines again and ran nothing.
    const r = await rig('slua')
    r.crash()
    const { a, original } = r.takeCopyAndRez()
    r.wait(5000)
    expect(r.debug()).toEqual(['rig [script:a] Script run-time error', 'lua_script:9: boom\n[C] function error\nlua_script:9\n[C] function _handleEvent\n'])
    expect(a.crashed).toBe(true)
    expect(r.log()).toEqual([])
    expect(original.crashed).toBe(true)
  })

  it.each<[Lang, string, boolean]>([
    // In-world: the copy of an LSL script left set running said "entry 0" and ticked, its
    // checkbox on and llGetScriptState 1.
    ['lsl', 'left set running', true],
    // In-world: the copy of an SLua script left set running said nothing, its checkbox off and
    // llGetScriptState 0, though the original's checkbox read on. So did one set running with
    // llSetScriptState TRUE after the crash. A copy of an SLua script that never crashed ran.
    ['slua', 'left set running', false],
    ['slua', 'set running with llSetScriptState', false],
    // In-world: stopped with llSetScriptState FALSE, the copy's checkbox was off, and turned on
    // it said "entry 0". Stopped and started again, the copy said "entry 0" and read 1.
    ['lsl', 'stopped', false],
    ['slua', 'stopped', false],
    ['lsl', 'stopped and started again', true],
    ['slua', 'stopped and started again', true],
  ])('the viewer’s Duplicate of a %s script %s runs: %s', async (lang, how, runs) => {
    const r = await rig(lang)
    r.crash()
    if (how === 'set running with llSetScriptState') r.tell('start')
    if (how.startsWith('stopped')) r.tell('stop')
    if (how === 'stopped and started again') r.tell('start')
    const said = r.debug().length
    const copy = r.duplicate()
    expect(copy.crashed).toBe(false)
    expect(copy.running).toBe(runs)
    expect(copyLog(copy)).toEqual(runs ? ['entry 0'] : [])
    expect(r.debug()).toHaveLength(said)
    expect(copy.chat.filter(c => c.channel === DEBUG_CHANNEL)).toEqual([])
    if (!runs) {
      copy.running = true
      copy.linkset.advanceTime(0)
      expect(copyLog(copy)).toEqual(['entry 0'])
    }
    expect(r.scripts().a.crashed).toBe(true)
  })
})

describe('a crashed LSL script reset while stopped', () => {
  const twoStates = `integer g; list log;
    default {
      state_entry() { log += "entry " + (string)g; }
      on_rez(integer p) { log += "on_rez " + (string)g; }
      link_message(integer s, integer n, string m, key k) {
        if (m == "ping") log += "pong " + (string)g;
        else if (m == "go") state two;
      }
    }
    state two {
      state_entry() { log += "two entry " + (string)g; }
      on_rez(integer p) { log += "two on_rez " + (string)g; }
      link_message(integer s, integer n, string m, key k) {
        if (m == "ping") log += "two pong " + (string)g;
        else if (m == "set") g = 42;
        else if (m == "crash") { integer z; g = g / z; }
      }
    }`

  it('comes out of a take as stuck as one that was never reset', async () => {
    // In-world: g set to 42 and the script moved to a second state before the crash. Then
    // llSetScriptState FALSE, llResetOtherScript (read 0), llSetScriptState TRUE (read 0), a take
    // and a rez -> nothing said in either state, no on_rez, llGetScriptState 0. llResetOtherScript
    // then read 1, and it still ran nothing, as for the stuck script that was never reset. Two runs.
    const r = await rig('lsl', twoStates)
    r.send('go')
    r.wait(0)
    r.crash()
    r.tell('stop')
    r.tell('reset')
    r.tell('start')
    r.tell('state')
    r.takeAndRez()
    r.tell('state')
    r.send('ping')
    r.wait(5000)
    r.tell('reset')
    r.tell('state')
    r.send('ping')
    r.wait(5000)
    expect(r.states()).toEqual([0, 0, 1])
    expect(r.log()).toEqual([])
  })
})

describe('a stuck LSL script', () => {
  it('stays down on llSetScriptState TRUE before any reset', async () => {
    // In-world: crashed, llSetScriptState FALSE then TRUE, taken and rezzed -> llGetScriptState 0.
    // llSetScriptState TRUE -> still 0, and it answered nothing. llResetOtherScript then read 1,
    // and it still answered nothing. Two runs.
    const r = await rig('lsl')
    r.crash()
    r.tell('stop')
    r.tell('start')
    r.takeAndRez()
    r.tell('state')
    r.tell('start')
    r.tell('state')
    r.send('ping')
    r.wait(5000)
    r.tell('reset')
    r.tell('state')
    r.send('ping')
    r.wait(5000)
    expect(r.states()).toEqual([0, 0, 1])
    expect(r.log()).toEqual([])
  })
})
