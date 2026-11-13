import { describe, expect, it } from 'vitest'
import { loadLinkset, makeInventoryItem, InventoryType, NULL_KEY } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Changed
// In-world: a two-prim linkset with a logging script in each prim and a second
// script in the root, edited through the viewer as its owner. Aditi beta grid,
// SLua Tideland, Firestorm viewer, 2026-11-13. Each script logged
// every `changed` value with llGetInventoryNumber(INVENTORY_ALL) and the first
// characters of llGetInventoryKey("nc").
const logger = `list seen; list counts; string key4;
  default {
    changed(integer c) {
      seen += c;
      counts += llGetInventoryNumber(INVENTORY_ALL);
      key4 = llGetSubString((string)llGetInventoryKey("nc"), 0, 3);
    }
  }`
const notecard = (name: string, key = NULL_KEY) =>
  makeInventoryItem({ name, type: InventoryType.NOTECARD, key, notecardLines: ['version one'] })

async function load() {
  const loaded = await loadLinkset({
    prims: [
      {
        name: 'Root',
        inventory: [notecard('nc', 'f077f3d9-006c-31a8-d6b6-516e2eaa902b'), notecard('v1'), notecard('v2')],
        scripts: [
          { source: { source: logger, filename: 'a.lsl' }, name: 'a' },
          { source: { source: logger, filename: 'b.lsl' }, name: 'b' },
        ],
      },
      { name: 'Child', scripts: [{ source: { source: logger, filename: 'c.lsl' }, name: 'c' }] },
    ],
  })
  for (const script of Object.values(loaded.scripts)) script.start()
  return loaded
}

describe('owner adds an item', () => {
  it('sends CHANGED_INVENTORY once to each script in that prim and to no other prim', async () => {
    // In-world: dropping a notecard on the root -> both root scripts logged changed(1)
    // once with the new item counted; the child's script logged nothing.
    const { prims, scripts } = await load()
    prims[0]!.addInventory(notecard('x1'))
    expect(scripts['a']!.global('seen')).toEqual([1])
    expect(scripts['a']!.global('counts')).toEqual([6])
    expect(scripts['b']!.global('seen')).toEqual([1])
    expect(scripts['c']!.global('seen')).toEqual([])
  })

  it('reaches only the child when the item goes into the child', async () => {
    // In-world: dropping a notecard on link 2 -> the child's script logged changed(1);
    // the root's scripts logged nothing.
    const { prims, scripts } = await load()
    prims[1]!.addInventory(notecard('x1'))
    expect(scripts['c']!.global('seen')).toEqual([1])
    expect(scripts['a']!.global('seen')).toEqual([])
  })

  it('sends one event per item added', async () => {
    // In-world: two notecards sent to the root in one request -> each root script
    // logged changed(1) twice, counting one more item each time.
    const { prims, scripts } = await load()
    prims[0]!.addInventory(notecard('x2'))
    prims[0]!.addInventory(notecard('x3'))
    expect(scripts['a']!.global('seen')).toEqual([1, 1])
    expect(scripts['a']!.global('counts')).toEqual([6, 7])
  })

  it('renames an item whose name is taken', async () => {
    // In-world: dropping "nc" on a prim that holds "nc" -> the new item is "nc 1",
    // and the prim's scripts logged changed(1). Three drops of "x1" -> "x1",
    // "x1 1", "x1 2".
    const { prims, scripts } = await load()
    const added = prims[0]!.addInventory(notecard('nc'))
    expect(added.name).toBe('nc 1')
    expect(prims[0]!.inventory.map((item) => item.name)).toContain('nc 1')
    expect(scripts['a']!.global('seen')).toEqual([1])
    expect(prims[0]!.addInventory(notecard('nc')).name).toBe('nc 2')
  })

  it('is not heard by a script that has not started yet', async () => {
    // In-world: a script dropped into the prim started with state_entry and
    // logged no changed event for its own arrival or for the items already there.
    // A script added without running, then a notecard dropped in, then the
    // script started -> it ran state_entry and logged no changed event.
    const { prims, scripts } = await loadLinkset({
      prims: [{ scripts: [{ source: { source: logger, filename: 'a.lsl' }, name: 'a' }] }],
    })
    prims[0]!.addInventory(notecard('nc'))
    prims[0]!.replaceInventory('nc', {})
    prims[0]!.renameInventory('nc', 'renamed')
    prims[0]!.removeInventory('renamed')
    scripts['a']!.start()
    scripts['a']!.linkset.advanceTime(100)
    expect(scripts['a']!.global('seen')).toEqual([])
  })

  it('is heard by a script that a test event started', async () => {
    const { linkset, prims, scripts } = await loadLinkset({
      prims: [{ scripts: [{ source: { source: logger, filename: 'a.lsl' }, name: 'a' }] }],
    })
    linkset.touch(0)
    prims[0]!.addInventory(notecard('nc'))
    expect(scripts['a']!.global('seen')).toEqual([1])
  })
})

describe('owner deletes an item', () => {
  it('sends CHANGED_INVENTORY to each script in that prim', async () => {
    // In-world: deleting a notecard from the root's contents -> both root scripts
    // logged changed(1) with one item fewer; the child's script logged nothing.
    const { prims, scripts } = await load()
    prims[0]!.removeInventory('v1')
    expect(prims[0]!.inventory.map((item) => item.name)).not.toContain('v1')
    expect(scripts['a']!.global('seen')).toEqual([1])
    expect(scripts['a']!.global('counts')).toEqual([4])
    expect(scripts['b']!.global('seen')).toEqual([1])
    expect(scripts['c']!.global('seen')).toEqual([])
  })

  it('sends one event when several items are deleted together', async () => {
    // In-world: two notecards deleted from the root in one request -> each root
    // script logged changed(1) once, counting both items already gone.
    const { prims, scripts } = await load()
    prims[0]!.removeInventory('v1', 'v2')
    expect(scripts['a']!.global('seen')).toEqual([1])
    expect(scripts['a']!.global('counts')).toEqual([3])
  })

  it('stops a deleted script and tells the scripts that remain', async () => {
    // In-world: deleting a script from the root's contents -> the other root
    // script logged changed(1). A deleted script that renamed its object on a
    // 1 s timer stopped doing so.
    const { linkset, prims, scripts } = await loadLinkset({
      prims: [{
        scripts: [
          { source: { source: logger, filename: 'a.lsl' }, name: 'a' },
          { source: { source: 'integer ticks; default { state_entry() { llSetTimerEvent(1.0); } timer() { ++ticks; } }', filename: 'tick.lsl' }, name: 'tick' },
        ],
      }],
    })
    for (const script of Object.values(scripts)) script.start()
    linkset.advanceTime(3_000)
    expect(scripts['tick']!.global('ticks')).toBe(3)
    prims[0]!.removeInventory('tick')
    linkset.advanceTime(3_000)
    expect(scripts['tick']!.dead).toBe(true)
    expect(scripts['tick']!.global('ticks')).toBe(3)
    expect(prims[0]!.scripts).toEqual([scripts['a']])
    expect(scripts['a']!.global('seen')).toEqual([1])
  })

  it('throws for a name the prim does not hold and changes nothing', async () => {
    const { prims, scripts } = await load()
    expect(() => prims[0]!.removeInventory('v1', 'missing')).toThrow("removeInventory: no item named 'missing'")
    expect(prims[0]!.inventory.map((item) => item.name)).toContain('v1')
    expect(scripts['a']!.global('seen')).toEqual([])
  })
})

describe('owner saves a notecard', () => {
  // https://wiki.secondlife.com/wiki/Changed: CHANGED_INVENTORY is "Prim inventory
  // has changed". Not measured: the viewer tools used for these probes save a
  // notecard only in the avatar's inventory and reject an item inside a prim,
  // so the event for an in-prim save follows the wiki. Whether such a save
  // sends one event or more is not measured either; replaceInventory sends one.
  // In-world, for what could be measured: saving the notecard in the avatar's
  // inventory gave it a new asset id; the copy already in the prim kept its
  // key (f077...) until it was deleted and the saved one dropped in, when
  // scripts logged the new key (41cb...). Recompiling a script inside the prim
  // sent changed(1) to the prim's other scripts and to no other prim.
  it('keeps the name, changes the key and sends CHANGED_INVENTORY', async () => {
    const { prims, scripts } = await load()
    prims[0]!.replaceInventory('nc', { notecardLines: ['version two'] })
    const saved = prims[0]!.inventory.find((item) => item.name === 'nc')!
    expect(saved.notecardLines).toEqual(['version two'])
    expect(saved.key).not.toBe('f077f3d9-006c-31a8-d6b6-516e2eaa902b')
    expect(scripts['a']!.global('seen')).toEqual([1])
    expect(scripts['a']!.global('key4')).toBe(saved.key.slice(0, 4))
    expect(scripts['c']!.global('seen')).toEqual([])
  })

  it('uses the key the test supplies', async () => {
    const { prims, scripts } = await load()
    prims[0]!.replaceInventory('nc', { key: '41cb99c8-11ce-6627-52ab-cc6b91981dce' })
    expect(scripts['a']!.global('key4')).toBe('41cb')
  })

  it('gives each save a different key', async () => {
    const { prims } = await load()
    prims[0]!.replaceInventory('nc', {})
    const first = prims[0]!.inventory.find((item) => item.name === 'nc')!.key
    prims[0]!.replaceInventory('nc', {})
    expect(prims[0]!.inventory.find((item) => item.name === 'nc')!.key).not.toBe(first)
  })

  it('refuses a script and a missing name', async () => {
    const { prims } = await load()
    expect(() => prims[0]!.replaceInventory('a', {})).toThrow('is a script')
    expect(() => prims[0]!.replaceInventory('missing', {})).toThrow("replaceInventory: no item named 'missing'")
  })
})

describe('owner renames an item', () => {
  // https://wiki.secondlife.com/wiki/Changed: CHANGED_INVENTORY is "Prim inventory
  // has changed", and it "will also trigger when inventory permissions are
  // changed". Not measured: the viewer tools used for these probes rename only
  // items in the avatar's inventory and reject an item inside a prim, so the
  // event for a rename follows the wiki. What a rename to a taken or empty name
  // does cannot be measured either; renameInventory refuses both.
  // In-world, for what could be measured: changing the permissions of the items
  // in the root's contents sent changed(1) to each root script and to no other prim.
  it('sends CHANGED_INVENTORY to each script in that prim', async () => {
    const { prims, scripts } = await load()
    prims[0]!.renameInventory('v1', 'renamed')
    expect(prims[0]!.inventory.map((item) => item.name)).toEqual(expect.arrayContaining(['renamed', 'v2']))
    expect(prims[0]!.inventory.map((item) => item.name)).not.toContain('v1')
    expect(scripts['a']!.global('seen')).toEqual([1])
    expect(scripts['c']!.global('seen')).toEqual([])
  })

  it('refuses a taken name, a script and a missing name', async () => {
    const { prims, scripts } = await load()
    expect(() => prims[0]!.renameInventory('v1', 'v2')).toThrow("renameInventory: an item named 'v2' already exists")
    expect(() => prims[0]!.renameInventory('a', 'z')).toThrow('is a script')
    expect(() => prims[0]!.renameInventory('missing', 'z')).toThrow("renameInventory: no item named 'missing'")
    expect(() => prims[0]!.renameInventory('v1', 'v1')).toThrow("'v1' already has that name")
    expect(() => prims[0]!.renameInventory('v1', '')).toThrow('the new name has no ASCII characters')
    expect(() => prims[0]!.renameInventory('v1', 'é')).toThrow('the new name has no ASCII characters')
    expect(scripts['a']!.global('seen')).toEqual([])
  })
})

const control = (body: string) => ({ source: { source: `default { link_message(integer s, integer n, string m, key k) { ${body} } }`, filename: 'ctl.lsl' }, name: 'ctl' })
const napper = `list seen; list counts; list times;
  default {
    changed(integer c) { seen += c; counts += llGetInventoryNumber(INVENTORY_ALL); times += llRound(llGetTime()); }
    link_message(integer s, integer n, string m, key k) {
      if (m == "nap") llSleep(20.0);
      else if (m == "nap3") { llSleep(10.0); llSleep(10.0); llSleep(10.0); }
      else if (m == "crash") { integer zero; integer q = 1 / zero; }
    }
  }`
async function loadWith(...extra: ReturnType<typeof control>[]) {
  const loaded = await loadLinkset({
    prims: [{
      inventory: [notecard('v1'), notecard('v2')],
      scripts: [{ source: { source: napper, filename: 'a.lsl' }, name: 'a' }, { source: { source: logger, filename: 'b.lsl' }, name: 'b' }, ...extra],
    }],
  })
  for (const script of Object.values(loaded.scripts)) script.start()
  return loaded
}

describe('a script that is not running', () => {
  it('gets no event for an edit made while it was stopped, even after it restarts', async () => {
    // In-world: llSetScriptState(FALSE) on the logging script, then a notecard
    // dropped in (and, in a second run, one deleted), then llSetScriptState(TRUE)
    // -> the script logged nothing. The next drop after the restart logged changed(1).
    const { linkset, prims, scripts } = await loadWith(control('llSetScriptState("a", n);'))
    scripts['ctl']!.fire('link_message', { sender_num: 1, num: 0, str: '', id: NULL_KEY })
    expect(scripts['a']!.running).toBe(false)
    prims[0]!.addInventory(notecard('x1'))
    prims[0]!.replaceInventory('x1', {})
    prims[0]!.renameInventory('x1', 'x9')
    prims[0]!.removeInventory('v1')
    scripts['ctl']!.fire('link_message', { sender_num: 1, num: 1, str: '', id: NULL_KEY })
    linkset.advanceTime(100)
    expect(scripts['a']!.running).toBe(true)
    expect(scripts['a']!.global('seen')).toEqual([])
    expect(scripts['b']!.global('seen')).toEqual([1, 1, 1, 1])
    prims[0]!.removeInventory('v2')
    expect(scripts['a']!.global('seen')).toEqual([1])
  })

  it('gets no event for an edit made after it crashed, even after it is reset', async () => {
    // In-world: the logging script divided by zero, a notecard was dropped in,
    // then llResetOtherScript -> it ran state_entry and logged nothing. The
    // next drop logged changed(1).
    const { linkset, prims, scripts } = await loadWith(control('llResetOtherScript("a");'))
    expect(() => scripts['a']!.fire('link_message', { sender_num: 1, num: 0, str: 'crash', id: NULL_KEY })).toThrow('divide by zero')
    prims[0]!.addInventory(notecard('x1'))
    scripts['ctl']!.fire('link_message', { sender_num: 1, num: 0, str: '', id: NULL_KEY })
    linkset.advanceTime(100)
    expect(scripts['a']!.global('seen')).toEqual([])
    prims[0]!.addInventory(notecard('x2'))
    expect(scripts['a']!.global('seen')).toEqual([1])
  })
})

describe('a gift from another prim', () => {
  it('is not heard by a stopped script, even after it restarts', async () => {
    // In-world: llSetScriptState(FALSE) on the root's logging script, then a
    // child script gave the root a notecard with llGiveInventory, then
    // llSetScriptState(TRUE) -> the script logged nothing, though the notecard
    // had arrived. The same gift while it ran logged changed(1).
    const { linkset, prims, scripts } = await loadLinkset({
      prims: [
        { scripts: [{ source: { source: logger, filename: 'a.lsl' }, name: 'a' }, control('llSetScriptState("a", n);')] },
        { inventory: [notecard('g2')], scripts: [{ source: { source: 'default { touch_start(integer n) { llGiveInventory(llGetLinkKey(1), "g2"); } }', filename: 'giver.lsl' }, name: 'giver' }] },
      ],
    })
    for (const script of Object.values(scripts)) script.start()
    scripts['ctl']!.fire('link_message', { sender_num: 1, num: 0, str: '', id: NULL_KEY })
    linkset.touch(2)
    scripts['ctl']!.fire('link_message', { sender_num: 1, num: 1, str: '', id: NULL_KEY })
    linkset.advanceTime(100)
    expect(prims[0]!.inventory.map((item) => item.name)).toContain('g2')
    expect(scripts['a']!.global('seen')).toEqual([])
    linkset.touch(2)
    expect(scripts['a']!.global('seen')).toEqual([1])
  })
})

describe('a script busy in a handler', () => {
  const begin = async (message: string, ...extra: ReturnType<typeof control>[]) => {
    const loaded = await loadWith(...extra)
    const { linkset, scripts } = loaded
    linkset.clock.schedule(scripts['a']!, linkset.clock.now, 'link_message', { sender_num: 1, num: 0, str: message, id: NULL_KEY })
    linkset.advanceTime(0)
    return loaded
  }

  it('gets one event after it finishes for the edits made during one sleep', async () => {
    // In-world: the logging script slept 20 s in a handler; two notecards were
    // dropped in 3 s apart during the sleep -> it logged changed(1) once when
    // the handler ended, counting both. (The probe's clock started a second
    // before its sleep, so it read 21 s where this test reads 20.) A script
    // that was idle logged each drop as it happened.
    const { linkset, prims, scripts } = await begin('nap')
    linkset.advanceTime(2_000)
    prims[0]!.addInventory(notecard('x1'))
    linkset.advanceTime(3_000)
    prims[0]!.addInventory(notecard('x2'))
    expect(linkset.clock.now).toBe(5_000)
    expect(scripts['b']!.global('counts')).toEqual([5, 6])
    expect(scripts['a']!.global('seen')).toEqual([])
    linkset.advanceTime(20_000)
    expect(scripts['a']!.global('seen')).toEqual([1])
    expect(scripts['a']!.global('counts')).toEqual([6])
    expect(scripts['a']!.global('times')).toEqual([20])
  })

  it('gets one event for a drop, a delete and a drop during one sleep', async () => {
    // In-world: during one 20 s sleep a notecard was dropped in, deleted and
    // dropped in again -> changed(1) once when the handler ended.
    const { linkset, prims, scripts } = await begin('nap')
    prims[0]!.addInventory(notecard('x1'))
    linkset.advanceTime(1_000)
    prims[0]!.removeInventory('x1')
    linkset.advanceTime(1_000)
    prims[0]!.addInventory(notecard('x1'))
    linkset.advanceTime(20_000)
    expect(scripts['a']!.global('seen')).toEqual([1])
  })

  it('gets two events for edits spread over three sleeps of one handler', async () => {
    // In-world: a handler slept 10 s three times and a notecard was dropped in
    // during each sleep -> changed(1) twice when the handler ended, both
    // counting all three notecards.
    const { linkset, prims, scripts } = await begin('nap3')
    for (const name of ['x1', 'x2', 'x3']) {
      linkset.advanceTime(5_000)
      prims[0]!.addInventory(notecard(name))
      linkset.advanceTime(5_000)
    }
    linkset.advanceTime(1_000)
    expect(scripts['a']!.global('seen')).toEqual([1, 1])
    expect(scripts['a']!.global('counts')).toEqual([7, 7])
    expect(scripts['a']!.global('times')).toEqual([30, 30])
  })

  it('still gets the event when it is stopped before the handler ends and restarted later', async () => {
    // In-world: a notecard was dropped in during a 20 s sleep, the script was
    // stopped 3 s later with llSetScriptState and restarted after the sleep
    // would have ended -> it finished the handler and then logged changed(1).
    const { linkset, prims, scripts } = await begin('nap', control('llSetScriptState("a", n);'))
    linkset.advanceTime(5_000)
    prims[0]!.addInventory(notecard('x1'))
    linkset.advanceTime(3_000)
    scripts['ctl']!.fire('link_message', { sender_num: 1, num: 0, str: '', id: NULL_KEY })
    linkset.advanceTime(20_000)
    expect(scripts['a']!.global('seen')).toEqual([])
    scripts['ctl']!.fire('link_message', { sender_num: 1, num: 1, str: '', id: NULL_KEY })
    linkset.advanceTime(20_000)
    expect(scripts['a']!.global('seen')).toEqual([1])
  })

  it.each([['gift then drop', true], ['drop then gift', false]])('gets one event for a %s during one sleep', async (_order, giftFirst) => {
    // In-world: during one 20 s sleep of the root's logging script, a child
    // script gave the root a notecard and the owner dropped one in, in either
    // order -> changed(1) once when the handler ended, counting both.
    const { linkset, prims, scripts } = await loadLinkset({
      prims: [
        { scripts: [{ source: { source: napper, filename: 'a.lsl' }, name: 'a' }] },
        { inventory: [notecard('g2')], scripts: [{ source: { source: 'default { touch_start(integer n) { llGiveInventory(llGetLinkKey(1), "g2"); } }', filename: 'giver.lsl' }, name: 'giver' }] },
      ],
    })
    for (const script of Object.values(scripts)) script.start()
    linkset.clock.schedule(scripts['a']!, linkset.clock.now, 'link_message', { sender_num: 1, num: 0, str: 'nap', id: NULL_KEY })
    linkset.advanceTime(2_000)
    const steps = [() => linkset.touch(2), () => { prims[0]!.addInventory(notecard('x1')) }]
    for (const step of giftFirst ? steps : steps.reverse()) {
      step()
      linkset.advanceTime(2_000)
    }
    linkset.advanceTime(20_000)
    expect(scripts['a']!.global('seen')).toEqual([1])
    expect(scripts['a']!.global('counts')).toEqual([3])
  })
})

describe('delivery to several scripts', () => {
  // How a test call hands out the events is this harness's choice, like
  // linkset.touch: it runs the handlers it starts to their end.
  const sleeper = `list log; default { changed(integer c) { log += "pre"; llSleep(5.0); log += "post"; } }`
  it('gives every script the event at the same time and finishes a handler that sleeps', async () => {
    const { linkset, prims, scripts } = await loadLinkset({
      prims: [{
        scripts: [
          { source: { source: sleeper, filename: 's.lsl' }, name: 's' },
          { source: { source: napper, filename: 'a.lsl' }, name: 'a' },
        ],
      }],
    })
    for (const script of Object.values(scripts)) script.start()
    linkset.advanceTime(1_000)
    prims[0]!.addInventory(notecard('x1'))
    expect(scripts['s']!.global('log')).toEqual(['pre', 'post'])
    expect(scripts['a']!.global('times')).toEqual([1])
    expect(linkset.clock.now).toBe(6_000)
  })

  it('does not wait for a script that was already asleep', async () => {
    const { linkset, prims, scripts } = await loadWith()
    linkset.clock.schedule(scripts['a']!, linkset.clock.now, 'link_message', { sender_num: 1, num: 0, str: 'nap', id: NULL_KEY })
    linkset.advanceTime(1_500)
    prims[0]!.addInventory(notecard('x1'))
    expect(linkset.clock.now).toBe(1_500)
    expect(scripts['b']!.global('seen')).toEqual([1])
    expect(scripts['a']!.global('seen')).toEqual([])
  })
})

describe('copying an object', () => {
  it('does not tell the copy\'s scripts about the items copied with them', async () => {
    // In-world: the linkset was taken into inventory and rezzed again -> none of
    // its scripts logged a changed event; a gift to the rezzed copy then logged changed(1).
    const { linkset, prims, scripts } = await load()
    prims[0]!.addInventory(notecard('late'))
    expect(scripts['a']!.global('seen')).toEqual([1])
    const copy = linkset.copy()
    copy.advanceTime(100)
    const copied = copy.prims[0]!.scripts[0]!
    expect(copy.prims[0]!.inventory.map((item) => item.name)).toContain('late')
    expect(copied.global('seen')).toEqual([1])
  })
})

describe('a script changes the inventory', () => {
  // Pins behaviour this file's owner edits must not share.
  it('sends no event when llRemoveInventory deletes an item', async () => {
    // In-world: a root script calling llRemoveInventory on a notecard, and then
    // on another script -> no script in the linkset logged a changed event.
    const { prims, scripts } = await loadLinkset({
      prims: [{
        inventory: [notecard('v1')],
        scripts: [
          { source: { source: logger, filename: 'a.lsl' }, name: 'a' },
          { source: { source: logger, filename: 'b.lsl' }, name: 'b' },
          { source: { source: `default { touch_start(integer n) { llRemoveInventory("v1"); llRemoveInventory("b"); } }`, filename: 'act.lsl' }, name: 'act' },
        ],
      }],
    })
    for (const script of Object.values(scripts)) script.start()
    scripts['act']!.linkset.touch(0)
    expect(prims[0]!.inventory.map((item) => item.name).sort()).toEqual(['a', 'act'])
    expect(scripts['a']!.global('seen')).toEqual([])
  })
})
