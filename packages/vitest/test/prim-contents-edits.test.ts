import { describe, expect, it } from 'vitest'
import { loadLinkset, makeInventoryItem, InventoryType, NULL_KEY, type Script } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Changed
// https://wiki.secondlife.com/wiki/LlGetScriptName
// In-world: a two-prim linkset owned by the probing avatar, with logging scripts
// "a" and "b" and notecards in the root, and logging script "c" and a notecard
// in the child. The owner saved notecards and renamed items in the object's
// contents through the viewer. Aditi beta grid, SLua Tideland, Firestorm viewer
// with RLVa 2.4.2, 2026-11-23. Each logging script counted its `changed` events
// and said llGetScriptName(), the value, and every item with the start of its
// llGetInventoryKey; on a chat command it said its name and count. Every
// `changed` value seen was 1, and each edit gave each script one event.
const logger = `integer n; list seen;
  default {
    changed(integer c) { ++n; seen += llGetScriptName() + " " + (string)c; }
    link_message(integer s, integer num, string m, key k) { seen += llGetScriptName() + " " + (string)n; }
  }`
const control = `default { link_message(integer s, integer num, string m, key k) { if (m != "") llSetScriptState(m, num); } }`
const src = (source: string, name: string) => ({ source: { source, filename: `${name}.lsl` }, name })
const notecard = (name: string, lines = ['one'], key = NULL_KEY) =>
  makeInventoryItem({ name, type: InventoryType.NOTECARD, key, notecardLines: lines })
const names = (prim: { inventory: ReadonlyArray<{ name: string }> }) => prim.inventory.map((item) => item.name).sort()
const keyOf = (prim: { inventory: ReadonlyArray<{ name: string; key: string }> }, name: string) =>
  prim.inventory.find((item) => item.name === name)!.key

async function load() {
  const loaded = await loadLinkset({
    prims: [
      {
        inventory: [notecard('nc', ['one'], '6e8d8309-2899-9383-7052-559c2d84ff11'), notecard('v'), notecard('w')],
        scripts: [src(logger, 'a'), src(logger, 'b'), src(control, 'ctl')],
      },
      { inventory: [notecard('nc')], scripts: [src(logger, 'c')] },
    ],
  })
  for (const script of Object.values(loaded.scripts)) script.start()
  return loaded
}

const seen = (script: Script) => script.global('seen')
function setRunning(scripts: Record<string, Script>, name: string, running: boolean) {
  scripts['ctl']!.fire('link_message', { sender_num: 1, num: running ? 1 : 0, str: name, id: NULL_KEY })
  scripts['ctl']!.linkset.advanceTime(0)
}
function dump(script: Script) {
  script.fire('link_message', { sender_num: 1, num: 0, str: '', id: NULL_KEY })
}

describe('owner saves a notecard inside a prim', () => {
  it('sends one CHANGED_INVENTORY to each script in that prim and gives the notecard a new key', async () => {
    // In-world: saving the root's "nc" with new text -> "a" and "b" each logged
    // changed(1) once with nc's key changed (6e8d... to f2f1...); "c" logged
    // nothing; the object's contents showed the same item id before and after.
    const { prims, scripts } = await load()
    prims[0]!.replaceInventory('nc', { notecardLines: ['two'] })
    expect(seen(scripts['a']!)).toEqual(['a 1'])
    expect(seen(scripts['b']!)).toEqual(['b 1'])
    expect(seen(scripts['c']!)).toEqual([])
    expect(keyOf(prims[0]!, 'nc')).not.toBe('6e8d8309-2899-9383-7052-559c2d84ff11')
  })

  it('gives the same text the same key, and sends the event when the text is unchanged', async () => {
    // In-world: three notecards created with the text "one" all had the key
    // 6e8d...; saving "two" over "nc" gave f2f1..., and saving "two" again kept
    // f2f1... and still sent changed(1) to "a" and "b".
    const { prims, scripts } = await load()
    prims[0]!.replaceInventory('nc', { notecardLines: ['two'] })
    const saved = keyOf(prims[0]!, 'nc')
    prims[0]!.replaceInventory('nc', { notecardLines: ['two'] })
    expect(keyOf(prims[0]!, 'nc')).toBe(saved)
    prims[0]!.replaceInventory('nc', {})
    expect(keyOf(prims[0]!, 'nc')).toBe(saved)
    expect(seen(scripts['a']!)).toEqual(['a 1', 'a 1', 'a 1'])
    prims[0]!.replaceInventory('v', { notecardLines: ['two'] })
    expect(keyOf(prims[0]!, 'v')).toBe(saved)
  })

  it('gives an emptied notecard a key', async () => {
    // In-world: saving an empty text over a notecard -> llGetInventoryKey gave
    // a key (7223...), not NULL_KEY, and the script logged changed(1).
    const { prims, scripts } = await load()
    prims[0]!.replaceInventory('nc', { notecardLines: [] })
    expect(keyOf(prims[0]!, 'nc')).not.toBe(NULL_KEY)
    expect(keyOf(prims[0]!, 'nc')).not.toBe('6e8d8309-2899-9383-7052-559c2d84ff11')
    expect(seen(scripts['a']!)).toEqual(['a 1'])
  })

  it('reaches only the child for a notecard saved in the child', async () => {
    // In-world: saving the child's "nc" -> "c" logged changed(1) with the new
    // key; "a" and "b" logged nothing.
    const { prims, scripts } = await load()
    prims[1]!.replaceInventory('nc', { notecardLines: ['three'] })
    expect(seen(scripts['c']!)).toEqual(['c 1'])
    expect(seen(scripts['a']!)).toEqual([])
  })

  it('reaches the root when the child holds only a stopped script', async () => {
    // In-world: "c" stopped, then the child's notecard saved -> "a" and "b"
    // each logged changed(1).
    const { linkset, prims, scripts } = await load()
    linkset.prims[1]!.scripts[0]!.running = false
    prims[1]!.replaceInventory('nc', { notecardLines: ['four'] })
    expect(seen(scripts['a']!)).toEqual(['a 1'])
    expect(seen(scripts['b']!)).toEqual(['b 1'])
    expect(seen(scripts['c']!)).toEqual([])
  })
})

describe('owner renames an item inside a prim', () => {
  it('sends one CHANGED_INVENTORY to each script in that prim and keeps the key', async () => {
    // In-world: renaming the root's "v496" to "v496r" -> "a" and "b" each logged
    // changed(1) once, listing the new name with the old key; "c" logged
    // nothing; the item id did not change.
    const { prims, scripts } = await load()
    const key = keyOf(prims[0]!, 'nc')
    prims[0]!.renameInventory('nc', 'renamed')
    expect(keyOf(prims[0]!, 'renamed')).toBe(key)
    expect(names(prims[0]!)).not.toContain('nc')
    expect(seen(scripts['a']!)).toEqual(['a 1'])
    expect(seen(scripts['b']!)).toEqual(['b 1'])
    expect(seen(scripts['c']!)).toEqual([])
  })

  it('reaches only the child for an item in the child, and the root when its only script is stopped', async () => {
    // In-world: renaming the child's notecard -> "c" logged changed(1) and the
    // root's scripts nothing. With "c" stopped, renaming it again -> "a" and "b"
    // each logged changed(1).
    const { linkset, prims, scripts } = await load()
    prims[1]!.renameInventory('nc', 'nc2')
    expect(seen(scripts['c']!)).toEqual(['c 1'])
    expect(seen(scripts['a']!)).toEqual([])
    linkset.prims[1]!.scripts[0]!.running = false
    prims[1]!.renameInventory('nc2', 'nc3')
    expect(seen(scripts['a']!)).toEqual(['a 1'])
    expect(seen(scripts['c']!)).toEqual(['c 1'])
  })

  it('sends the event for a rename to the name the item already has', async () => {
    // In-world: renaming "v496r" to "v496r" -> the region confirmed it and "a"
    // and "b" each logged changed(1).
    const { prims, scripts } = await load()
    prims[0]!.renameInventory('v', 'v')
    expect(names(prims[0]!)).toContain('v')
    expect(seen(scripts['a']!)).toEqual(['a 1'])
  })

  it('numbers a taken name from 2, whatever the type of the item holding it', async () => {
    // In-world: renaming "w496" to "v496r", which another notecard held ->
    // "v496r 2"; renaming a third notecard to "v496r" -> "v496r 3"; renaming
    // "v496r 2" to the script name "a496" -> "a496 2". Each sent changed(1) to
    // "a" and "b". Dropping an item with a taken name numbered it "v496 1".
    const { prims, scripts } = await load()
    prims[0]!.renameInventory('w', 'v')
    expect(names(prims[0]!)).toEqual(['a', 'b', 'ctl', 'nc', 'v', 'v 2'])
    prims[0]!.renameInventory('nc', 'v')
    expect(names(prims[0]!)).toEqual(['a', 'b', 'ctl', 'v', 'v 2', 'v 3'])
    prims[0]!.renameInventory('v 2', 'a')
    expect(names(prims[0]!)).toEqual(['a', 'a 2', 'b', 'ctl', 'v', 'v 3'])
    expect(prims[0]!.inventory.find((item) => item.name === 'a 2')!.type).toBe(InventoryType.NOTECARD)
    expect(seen(scripts['a']!)).toEqual(['a 1', 'a 1', 'a 1'])
    expect(prims[0]!.addInventory(notecard('v')).name).toBe('v 1')
  })

  it('takes the number an arriving item would get plus one, then the next free one', async () => {
    // In-world, in a one-prim object holding notecards named by renames: with
    // "x496" and "x496 1" there, a rename to "x496" -> "x496 3" (and "r", "r 1"
    // -> "r 3"); with "q" and "q 3" -> "q 2"; with "w" and "w 7" -> "w 2"; with
    // "k", "k 1" and "k 3" -> "k 4".
    const rename = async (taken: string[], want: string) => {
      const { prims: [prim] } = await loadLinkset({ prims: [{ inventory: [...taken, 'new'].map((name) => notecard(name)) }] })
      prim!.renameInventory('new', want)
      return names(prim!).filter((name) => !taken.includes(name))[0]
    }
    expect(await rename(['x', 'x 1'], 'x')).toBe('x 3')
    expect(await rename(['q', 'q 3'], 'q')).toBe('q 2')
    expect(await rename(['w', 'w 7'], 'w')).toBe('w 2')
    expect(await rename(['k', 'k 1', 'k 3'], 'k')).toBe('k 4')
    expect(await rename(['k 1'], 'k')).toBe('k')
  })

  it('keeps the name of an item already numbered for the name it is renamed to, and sends the event', async () => {
    // In-world: with "x496", "x496 1" and "x496 3" there, renaming "x496 1" to
    // "x496" -> it stayed "x496 1" and the script logged changed(1). The same
    // with "r", "r 1" and "r 3".
    const { prims: [prim], scripts } = await loadLinkset({
      prims: [{ inventory: ['r', 'r 1', 'r 3'].map((name) => notecard(name)), scripts: [src(logger, 'a')] }],
    })
    scripts['a']!.start()
    prim!.renameInventory('r 1', 'r')
    expect(names(prim!)).toEqual(['a', 'r', 'r 1', 'r 3'])
    expect(seen(scripts['a']!)).toEqual(['a 1'])
  })

  it('cuts a taken 63-character name to fit the number', async () => {
    // In-world: a notecard renamed to a 63-character name, then a second one
    // renamed to the same name -> the first 61 characters and " 2".
    const { prims } = await load()
    const long = 'x'.repeat(60) + 'abc'
    prims[0]!.renameInventory('v', long)
    prims[0]!.renameInventory('w', long)
    expect(names(prims[0]!)).toContain(long)
    expect(names(prims[0]!)).toContain(`${long.slice(0, 61)} 2`)
  })
})

describe('the name a rename gives', () => {
  // In-world: a notecard in a one-prim object with a logging script, renamed
  // through the viewer (2026-11-23). Each rename sent changed(1).
  it('turns control characters, each byte of a non-ASCII character and each | into a space, cuts to 63 characters and trims', async () => {
    // In-world: "aéb" -> "a  b"; "  sp  " -> "sp"; "p|q" -> "p q"; 70 "y" -> 63
    // "y"; "a<tab>b" -> "a b"; 62 "z" and " bcd" -> 62 "z".
    const { prims, scripts } = await load()
    prims[0]!.renameInventory('v', 'aéb')
    expect(names(prims[0]!)).toContain('a  b')
    prims[0]!.renameInventory('a  b', '  sp  ')
    expect(names(prims[0]!)).toContain('sp')
    prims[0]!.renameInventory('sp', 'p|q')
    expect(names(prims[0]!)).toContain('p q')
    prims[0]!.renameInventory('p q', 'y'.repeat(70))
    expect(names(prims[0]!)).toContain('y'.repeat(63))
    prims[0]!.renameInventory('w', 'a\tb')
    expect(names(prims[0]!)).toContain('a b')
    prims[0]!.renameInventory('a b', `${'z'.repeat(62)} bcd`)
    expect(names(prims[0]!)).toContain('z'.repeat(62))
    expect(seen(scripts['a']!)).toEqual(['a 1', 'a 1', 'a 1', 'a 1', 'a 1', 'a 1'])
  })

  it('keeps the old name when nothing is left, and still sends the event', async () => {
    // In-world: renaming "n496" to "é" -> the item was still "n496" and the
    // script logged changed(1).
    const { prims, scripts } = await load()
    prims[0]!.renameInventory('v', 'é')
    prims[0]!.renameInventory('v', ' | ')
    expect(names(prims[0]!)).toContain('v')
    expect(seen(scripts['a']!)).toEqual(['a 1', 'a 1'])
  })
})

describe('owner renames a script inside a prim', () => {
  it('keeps it running with its state, and it hears the rename under its new name', async () => {
    // In-world: renaming the running "b496" to "b496r" after ten edits -> it
    // logged "b496r changed 1 n=11" and "a" logged changed(1); asked afterwards
    // it answered "b496r pong n=11" and the editor showed it running. Its key
    // did not change.
    const { prims, scripts } = await load()
    prims[0]!.renameInventory('v', 'v1')
    const key = keyOf(prims[0]!, 'b')
    prims[0]!.renameInventory('b', 'b2')
    expect(seen(scripts['b']!)).toEqual(['b 1', 'b2 1'])
    expect(seen(scripts['a']!)).toEqual(['a 1', 'a 1'])
    expect(scripts['b']!.running).toBe(true)
    expect(keyOf(prims[0]!, 'b2')).toBe(key)
    expect(prims[0]!.findScript('b2')).toBe(scripts['b'])
    expect(prims[0]!.findScript('b')).toBeUndefined()
    dump(scripts['b']!)
    expect(seen(scripts['b']!).at(-1)).toBe('b2 2')
  })

  it('leaves a stopped script stopped, with no event for it, and it keeps its state', async () => {
    // In-world: "b496r" stopped, then renamed to "b496s" -> only "a" logged
    // changed(1) and the editor showed "b496s" not running. Started again, it
    // logged no changed and answered "b496s pong n=11", its count from before.
    const { prims, scripts } = await load()
    prims[0]!.renameInventory('v', 'v1')
    setRunning(scripts, 'b', false)
    prims[0]!.renameInventory('b', 'b2')
    expect(scripts['b']!.running).toBe(false)
    expect(seen(scripts['a']!)).toEqual(['a 1', 'a 1'])
    setRunning(scripts, 'b2', true)
    expect(scripts['b']!.running).toBe(true)
    expect(seen(scripts['b']!)).toEqual(['b 1'])
    dump(scripts['b']!)
    expect(seen(scripts['b']!).at(-1)).toBe('b2 1')
  })

  it('tells only the renamed script when it is the only one in a child', async () => {
    // In-world: renaming "c496", the child's only script -> it logged
    // "c496r changed 1"; the root's scripts logged nothing. Renaming it again
    // while stopped -> "a" and "b" each logged changed(1).
    const { linkset, prims, scripts } = await load()
    prims[1]!.renameInventory('c', 'c2')
    expect(seen(scripts['c']!)).toEqual(['c2 1'])
    expect(seen(scripts['a']!)).toEqual([])
    linkset.prims[1]!.scripts[0]!.running = false
    prims[1]!.renameInventory('c2', 'c3')
    expect(seen(scripts['a']!)).toEqual(['a 1'])
    expect(seen(scripts['c']!)).toEqual(['c2 1'])
  })

  it('names a renamed script by its new name in a run-time error', async () => {
    // In-world: a script renamed from "l496" to "m496", then made to divide by
    // zero -> DEBUG_CHANNEL said "probe issue-496 more [script:m496] Script
    // run-time error" and "Math Error".
    const { prims: [prim], scripts } = await loadLinkset({
      prims: [{ name: 'Box', scripts: [src('default { link_message(integer s, integer n, string m, key k) { integer z; llOwnerSay((string)(1 / z)); } }', 'l')] }],
    })
    scripts['l']!.start()
    prim!.renameInventory('l', 'm')
    expect(() => scripts['l']!.fire('link_message', { sender_num: 1, num: 0, str: '', id: NULL_KEY })).toThrow('Math Error')
    expect(scripts['l']!.chat.map((entry) => entry.text)).toEqual(['Box [script:m] Script run-time error', 'Math Error'])
  })

  it('numbers a taken name from 2 and keeps running', async () => {
    // In-world: renaming the running "b496s" to "a496", the other script's name
    // -> it became "a496 2", logged "a496 2 changed 1", and kept running.
    const { prims, scripts } = await load()
    prims[0]!.renameInventory('b', 'a')
    expect(seen(scripts['b']!)).toEqual(['a 2 1'])
    expect(prims[0]!.findScript('a 2')).toBe(scripts['b'])
    expect(prims[0]!.findScript('a')).toBe(scripts['a'])
    expect(scripts['b']!.running).toBe(true)
  })
})
