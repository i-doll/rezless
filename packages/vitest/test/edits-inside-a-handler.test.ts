import { describe, expect, it } from 'vitest'
import { loadLinkset, makeInventoryItem, InventoryType } from '../src/index.js'
import type { Prim, Script } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Category:LSL_Events
// A script handles one event at a time: an event raised while a handler runs waits in the
// queue until that handler returns.
const logger = `list log;
  default {
    state_entry() {}
    touch_start(integer n) { log += "t1"; llOwnerSay("x"); log += "t2"; }
    changed(integer c) { log += "changed " + (string)c; }
    link_message(integer s, integer n, string m, key id) { log += "lm " + m; }
  }`
const notecard = (name: string) => makeInventoryItem({ name, type: InventoryType.NOTECARD, notecardLines: ['one'] })

async function load(edit: (prim: Prim, scripts: Record<string, Script>) => void, other = logger) {
  const { prims, scripts } = await loadLinkset({
    prims: [{
      inventory: [notecard('nc')],
      scripts: [
        { source: { source: logger, filename: 'a.lsl' }, name: 'a' },
        { source: { source: other, filename: 'b.lsl' }, name: 'b' },
      ],
    }],
  })
  for (const script of Object.values(scripts)) script.start()
  scripts['a']!.mock('llOwnerSay', () => {
    edit(prims[0]!, scripts)
    return undefined
  })
  scripts['a']!.fire('touch_start', { num_detected: 1 })
  return { log: (name: string) => scripts[name]!.global('log'), prim: prims[0]! }
}

describe('an owner edit made inside a running handler', () => {
  it('addInventory queues changed behind the handler', async () => {
    const { log, prim } = await load((p) => { p.addInventory(notecard('x')) })
    expect(log('a')).toEqual(['t1', 't2', 'changed 1'])
    expect(prim.inventory.map((item) => item.name)).toContain('x')
  })

  it('removeInventory queues changed behind the handler', async () => {
    const { log } = await load((p) => p.removeInventory('nc'))
    expect(log('a')).toEqual(['t1', 't2', 'changed 1'])
  })

  it('replaceInventory queues changed behind the handler', async () => {
    const { log } = await load((p) => p.replaceInventory('nc', { notecardLines: ['two'] }))
    expect(log('a')).toEqual(['t1', 't2', 'changed 1'])
  })

  it('renameInventory queues changed behind the handler', async () => {
    const { log } = await load((p) => p.renameInventory('nc', 'renamed'))
    expect(log('a')).toEqual(['t1', 't2', 'changed 1'])
  })

  it('recompiling another script queues changed behind the handler', async () => {
    const { log } = await load((p) => p.replaceInventory('b', {}))
    expect(log('a')).toEqual(['t1', 't2', 'changed 1'])
  })

  it('keeps later events queued after the handler recompiles its own script', async () => {
    const { log } = await load((p, s) => {
      p.replaceInventory('a', {})
      s['a']!.fire('link_message', { sender_num: 1, num: 0, str: 'm', id: '' })
    })
    expect(log('a').at(-1)).toBe('lm m')
  })

  it('returns from a reset inside the handler whose state_entry sleeps, and wakes it afterwards', async () => {
    const { prims, scripts, linkset } = await loadLinkset({
      prims: [{
        scripts: [{
          source: {
            source: `list log; default {
              state_entry() { log += "se"; llSleep(1.0); log += "woke"; }
              touch_start(integer n) { llOwnerSay("x"); log += "t2"; } }`,
            filename: 'a.lsl',
          },
          name: 'a',
        }],
      }],
    })
    const a = scripts['a']!
    a.start()
    linkset.advanceTime(2000)
    a.mock('llOwnerSay', () => { a.reset(); return undefined })
    a.fire('touch_start', { num_detected: 1 })
    expect(a.global('log')).toEqual(['se', 't2', 'woke'])
    expect(prims[0]!.scripts).toContain(a)
  })

  it('queues changed behind a handler the clock runs, past a sleep after the edit', async () => {
    const { prims, scripts, linkset } = await loadLinkset({
      prims: [{
        scripts: [{
          source: {
            source: `list log; default {
              state_entry() { llSetTimerEvent(1.0); }
              timer() { llSetTimerEvent(0); log += "t1"; llOwnerSay("x"); llSleep(2.0); log += "t2"; }
              changed(integer c) { log += "changed " + (string)c; } }`,
            filename: 'a.lsl',
          },
          name: 'a',
        }],
      }],
    })
    const a = scripts['a']!
    a.start()
    a.mock('llOwnerSay', () => { prims[0]!.addInventory(notecard('x')); return undefined })
    linkset.advanceTime(5000)
    expect(a.global('log')).toEqual(['t1', 't2', 'changed 1'])
  })

  it('another script in the prim hears the edit while the handler runs', async () => {
    const { log } = await load((p) => p.renameInventory('nc', 'renamed'))
    expect(log('b')).toEqual(['changed 1'])
  })
})

describe('script.fire() inside a running handler', () => {
  it('queues an event for the same script behind the handler', async () => {
    const { log } = await load((_, s) => s['a']!.fire('link_message', { sender_num: 1, num: 0, str: 'm', id: '' }))
    expect(log('a')).toEqual(['t1', 't2', 'lm m'])
  })

  it('delivers an event for another script at once', async () => {
    const order: string[] = []
    const listener = `default { link_message(integer s, integer n, string m, key id) { llOwnerSay("b heard"); } }`
    const { log } = await load((_, s) => {
      order.push('before')
      s['b']!.mock('llOwnerSay', () => { order.push('b heard'); return undefined })
      s['b']!.fire('link_message', { sender_num: 1, num: 0, str: 'm', id: '' })
      order.push('after')
    }, listener)
    expect(order).toEqual(['before', 'b heard', 'after'])
    expect(log('a')).toEqual(['t1', 't2'])
  })
})
