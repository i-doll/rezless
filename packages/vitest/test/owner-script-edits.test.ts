import { describe, expect, it } from 'vitest'
import { addScript, loadLinkset, makeInventoryItem, InventoryType, NULL_KEY, type Script } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Changed
// In-world: linksets of three to eight prims with logging scripts in the root
// and in some children, edited through the viewer as their owner. Aditi beta
// grid, SLua Tideland, Firestorm viewer, 2026-11-13. Each logging script
// recorded state_entry with the start of its own llGetInventoryKey, and every
// `changed` value with llGetInventoryNumber(INVENTORY_ALL). A touch moved a
// logging script to a second state, so a reset showed as a new state_entry.
// Every `changed` value seen was 1.
// The scripts here say each record too, because a reset clears `seen`.
const logger = `list seen;
  note(string s) { seen += s; llOwnerSay(s); }
  default {
    state_entry() { note("entry " + llGetScriptName()); }
    changed(integer c) { note("changed " + (string)c + " of " + (string)llGetInventoryNumber(INVENTORY_ALL)); }
    touch_start(integer n) { state two; }
    link_message(integer s, integer n, string m, key k) { note("message"); }
  }
  state two {
    state_entry() { note("two"); }
    changed(integer c) { note("two changed " + (string)c); }
    link_message(integer s, integer n, string m, key k) { note("message"); }
  }`
// Handles `changed` only in its second state.
const late = `list seen;
  default { touch_start(integer n) { state two; } }
  state two { changed(integer c) { seen += "changed " + (string)c; } }`
const deaf = 'default { state_entry() { } }'
const messenger = 'default { changed(integer c) { llMessageLinked(LINK_THIS, 7, "", ""); } }'
const src = (source: string, name: string) => ({ source: { source, filename: `${name}.lsl` }, name })
const notecard = (name: string) => makeInventoryItem({ name, type: InventoryType.NOTECARD, notecardLines: ['text'] })
const said = (script: Script) => script.chat.map((entry) => entry.text)
const keyOf = (prim: { inventory: ReadonlyArray<{ name: string; key: string }> }, name: string) =>
  prim.inventory.find((item) => item.name === name)!.key

/** Root with scripts a and b; child 2 with script c; child 3 empty; child 4 with script d. */
async function load() {
  const loaded = await loadLinkset({
    prims: [
      { scripts: [src(logger, 'a'), src(logger, 'b')] },
      { scripts: [src(logger, 'c')] },
      {},
      { scripts: [src(logger, 'd')] },
    ],
  })
  for (const script of Object.values(loaded.scripts)) script.start()
  for (const script of Object.values(loaded.scripts)) script.setGlobal('seen', [])
  return loaded
}

describe('owner drops a script in', () => {
  it('runs state_entry in the new script and tells the other scripts in the root', async () => {
    // In-world: a script dropped on the root, which held one logging script ->
    // that script logged changed(1) with the new item counted; the new script
    // logged state_entry and no changed; the scripts in two children logged nothing.
    const { prims, scripts } = await load()
    const added = await addScript(prims[0]!, src(logger, 'n'))
    expect(added.global('seen')).toEqual(['entry n'])
    expect(scripts['a']!.global('seen')).toEqual(['changed 1 of 3'])
    expect(scripts['b']!.global('seen')).toEqual(['changed 1 of 3'])
    expect(scripts['c']!.global('seen')).toEqual([])
    expect(scripts['d']!.global('seen')).toEqual([])
    expect(prims[0]!.findScript('n')).toBe(added)
  })

  it('tells only the child when a script there handles changed', async () => {
    // In-world: a second script dropped on a child that held a logging script ->
    // the child's script logged changed(1); the root's two scripts and the
    // other child's script logged nothing. Seen for two different children.
    const { prims, scripts } = await load()
    const added = await addScript(prims[1]!, src(logger, 'n'))
    expect(added.global('seen')).toEqual(['entry n'])
    expect(scripts['c']!.global('seen')).toEqual(['changed 1 of 2'])
    expect(scripts['a']!.global('seen')).toEqual([])
    expect(scripts['d']!.global('seen')).toEqual([])
  })

  it('tells the root when the child has no script', async () => {
    // In-world: a script dropped on an empty child -> the root's scripts logged
    // changed(1) with the root's own item count; the scripts in the other
    // children logged nothing. Seen for several empty children.
    const { prims, scripts } = await load()
    const added = await addScript(prims[2]!, src(logger, 'n'))
    expect(added.global('seen')).toEqual(['entry n'])
    expect(scripts['a']!.global('seen')).toEqual(['changed 1 of 2'])
    expect(scripts['b']!.global('seen')).toEqual(['changed 1 of 2'])
    expect(scripts['c']!.global('seen')).toEqual([])
    expect(scripts['d']!.global('seen')).toEqual([])
  })

  it('tells the root when the script already in the child has no changed handler', async () => {
    // In-world: a logging script dropped on a child whose running script had no
    // changed handler -> the root's script logged changed(1).
    const { prims, scripts } = await load()
    await addScript(prims[2]!, src(deaf, 'deaf'))
    scripts['a']!.setGlobal('seen', [])
    const added = await addScript(prims[2]!, src(logger, 'n'))
    expect(added.global('seen')).toEqual(['entry n'])
    expect(scripts['a']!.global('seen')).toEqual(['changed 1 of 2'])
  })

  it('tells no child when the root has no script', async () => {
    // In-world: with every script deleted from the root, a notecard and then a
    // script dropped on the root -> the scripts in the children logged nothing.
    const { prims, scripts } = await load()
    prims[0]!.removeInventory('a', 'b')
    prims[0]!.addInventory(notecard('nc'))
    const added = await addScript(prims[0]!, src(logger, 'n'))
    expect(added.global('seen')).toEqual(['entry n'])
    expect(scripts['c']!.global('seen')).toEqual([])
    expect(scripts['d']!.global('seen')).toEqual([])
  })

  it('numbers a script whose name is taken by a script or by another item', async () => {
    // In-world: a script named "L1" dropped on a root that held a script "L1"
    // -> the contents listed "L1 1", llGetScriptName() in the new script
    // contained the space, and the other scripts logged changed(1). A script
    // named "nc" dropped on a root that held a notecard "nc" -> "nc 1".
    const { prims, scripts } = await load()
    prims[0]!.placeInventory(notecard('nc'))
    const added = await addScript(prims[0]!, src(logger, 'a'))
    expect(prims[0]!.inventory.map((item) => item.name)).toEqual(['a', 'b', 'nc', 'a 1'])
    expect(added.global('seen')).toEqual(['entry a 1'])
    expect(added.scriptName).toBe('a 1')
    expect(prims[0]!.findScript('a 1')).toBe(added)
    expect(scripts['a']!.global('seen')).toEqual(['changed 1 of 4'])
    expect((await addScript(prims[0]!, src(logger, 'nc'))).scriptName).toBe('nc 1')
    expect((await addScript(prims[0]!, { source: { source: logger, filename: 'dir/b.lsl' } })).scriptName).toBe('b 1')
  })

  it('tells the others before the new script runs, and loses a link message they send it', async () => {
    // In-world: the root's script sent llMessageLinked(LINK_THIS, ...) from its
    // changed handler and logged timestamps. It logged changed 0.2 s before the
    // new script logged state_entry, and the new script never logged the message.
    // In another run a root script read llGetScriptState of the new script as 0
    // in its changed handler.
    const { prims, scripts } = await loadLinkset({
      prims: [{ scripts: [src(`list heard;
        default { changed(integer c) {
          heard += [llGetObjectDesc(), llGetScriptState("n")];
          llMessageLinked(LINK_THIS, 7, "", "");
        } }`, 'a')] }],
    })
    scripts['a']!.start()
    const added = await addScript(prims[0]!, src(`default {
      state_entry() { llSetObjectDesc(llGetObjectDesc() + "entry "); }
      link_message(integer s, integer n, string m, key k) { llSetObjectDesc(llGetObjectDesc() + "message "); }
    }`, 'n'))
    added.linkset.advanceTime(1000)
    expect(scripts['a']!.global('heard')).toEqual(['', 0])
    expect(prims[0]!.description).toBe('entry ')
  })

  it('leaves a script added as not running stopped until a script starts it', async () => {
    // In-world: a script dropped as not running on an empty child -> the root's
    // scripts logged changed(1) and the new script logged nothing. A second
    // script dropped beside it then called llSetScriptState(name, TRUE) -> the
    // first logged state_entry and no changed.
    const { prims, scripts } = await load()
    const added = await addScript(prims[2]!, src(logger, 'n'), { running: false })
    expect(added.running).toBe(false)
    expect(added.global('seen')).toEqual([])
    expect(scripts['a']!.global('seen')).toEqual(['changed 1 of 2'])
    const starter = await addScript(prims[2]!, src('default { state_entry() { llSetScriptState("n", TRUE); } }', 'starter'))
    starter.linkset.advanceTime(0)
    expect(added.running).toBe(true)
    expect(added.global('seen')).toEqual(['entry n'])
  })

  it('hides the new script from the others while they handle changed', async () => {
    // In-world: a child script whose changed handler called
    // llSetScriptState("L3", TRUE) and then llMessageLinked(LINK_THIS, ...),
    // and "L3" dropped beside it as not running -> the prim said "Could not
    // find script 'L3'." on DEBUG_CHANNEL and "L3" logged nothing. At the next
    // edit of the prim the same handler started it: it logged state_entry and
    // then the message. A child script whose changed handler called
    // llSetScriptState("L4", FALSE), and "L4" dropped beside it -> the prim said
    // "Could not find script 'L4'." and "L4" logged state_entry.
    const { prims, scripts } = await loadLinkset({
      prims: [{ scripts: [src(`default { changed(integer c) {
        llSetScriptState("n", TRUE); llSetScriptState("m", FALSE); llMessageLinked(LINK_THIS, 7, "", "");
      } }`, 'a')] }],
    })
    scripts['a']!.start()
    const stopped = await addScript(prims[0]!, src(logger, 'n'), { running: false })
    stopped.linkset.advanceTime(1000)
    expect(said(scripts['a']!)).toEqual(["Could not find script 'n'.", "Could not find script 'm'."])
    expect(stopped.running).toBe(false)
    expect(said(stopped)).toEqual([])
    const started = await addScript(prims[0]!, src(logger, 'm'))
    started.linkset.advanceTime(1000)
    expect(said(started)).toEqual(['entry m'])
    expect(said(stopped)).toEqual(['entry n', 'message'])
  })

  it('starts the new script while a changed handler sleeps', async () => {
    // In-world: a child script whose changed handler slept 3 s, sent
    // llMessageLinked(LINK_THIS, ...), slept 1 s and called
    // llSetScriptState("L4", FALSE), and "L4" dropped beside it -> "L4" logged
    // state_entry within a second, the message at 3 s, and nothing for a touch
    // afterwards (stopped); nothing was said on DEBUG_CHANNEL. The same when
    // "L4" was recompiled instead.
    const { linkset, prims, scripts } = await loadLinkset({
      prims: [{ scripts: [src(`default { changed(integer c) {
        llSleep(3.0); llMessageLinked(LINK_THIS, 7, "", ""); llSleep(1.0); llSetScriptState("n", FALSE);
      } }`, 'a')] }],
    })
    scripts['a']!.start()
    const start = linkset.clock.now
    const added = await addScript(prims[0]!, src(`list seen;
      default {
        state_entry() { seen += ["entry", llRound(llGetTime())]; }
        link_message(integer s, integer n, string m, key k) { seen += ["message", llRound(llGetTime())]; }
      }`, 'n'))
    expect(linkset.clock.now - start).toBe(4000)
    expect(added.global('seen')).toEqual(['entry', 0, 'message', 3])
    expect(said(scripts['a']!)).toEqual([])
    expect(added.running).toBe(false)
  })

  it('loses a link message the root sends a script dropped on a child', async () => {
    // In-world: a root script whose changed handler called
    // llMessageLinked(LINK_ALL_OTHERS, ...), and a logging script dropped on an
    // empty child, then recompiled -> it logged state_entry each time and no
    // message. At the next edit elsewhere in the object it logged the message.
    const { prims, scripts } = await loadLinkset({
      prims: [{ scripts: [src('default { changed(integer c) { llMessageLinked(LINK_ALL_OTHERS, 9, "", ""); } }', 'a')] }, {}, {}],
    })
    scripts['a']!.start()
    const added = await addScript(prims[1]!, src(logger, 'n'))
    prims[1]!.replaceInventory('n', {})
    added.linkset.advanceTime(1000)
    expect(said(added)).toEqual(['entry n', 'entry n'])
    prims[2]!.addInventory(notecard('nc'))
    added.linkset.advanceTime(1000)
    expect(said(added)).toEqual(['entry n', 'entry n', 'message'])
  })

  it('goes on without a script that a changed handler deleted', async () => {
    // In-world: a child script whose changed handler called
    // llRemoveInventory("L3"), and "L3" dropped beside it -> "L3" never logged
    // state_entry and the contents no longer listed it.
    const { prims, scripts } = await loadLinkset({
      prims: [{ scripts: [src('default { changed(integer c) { llRemoveInventory("n"); } }', 'a')] }],
    })
    scripts['a']!.start()
    const added = await addScript(prims[0]!, src(logger, 'n'))
    expect(added.dead).toBe(true)
    expect(said(added)).toEqual([])
    expect(prims[0]!.scripts).toEqual([scripts['a']])
    expect(prims[0]!.inventory.map((item) => item.name)).toEqual(['a'])
  })

  it('adds, recompiles and renames an SLua script', async () => {
    // In-world: an SLua script dropped on a root beside a logging LSL script ->
    // it ran its top level and the LSL script logged changed(1). A notecard
    // dropped -> its LLEvents changed handler ran. Recompiled -> it ran its top
    // level again with no changed, and the LSL script logged changed(1).
    const { prims, scripts } = await load()
    const added = await addScript(prims[0]!, { source: { source: `print("entry " .. ll.GetScriptName())
      LLEvents:on("changed", function(c) print("changed " .. c) end)`, filename: 'n.luau' } })
    expect(added.printed).toEqual(['entry n'])
    expect(scripts['a']!.global('seen')).toEqual(['changed 1 of 3'])
    prims[0]!.addInventory(notecard('nc'))
    expect(added.printed).toEqual(['entry n', 'changed 1'])
    prims[0]!.replaceInventory('n', {})
    expect(added.printed).toEqual(['entry n', 'changed 1', 'entry n'])
    expect(scripts['a']!.global('seen')).toEqual(['changed 1 of 3', 'changed 1 of 4', 'changed 1 of 4'])
    // The rename is not measured; see 'owner renames a script' below.
    prims[0]!.renameInventory('n', 'm')
    prims[0]!.replaceInventory('m', {})
    expect(added.printed.slice(3)).toEqual(['changed 1', 'entry m'])
  })

  it('leaves the new script in place when a changed handler fails', async () => {
    const { prims, scripts } = await loadLinkset({
      prims: [{ scripts: [src('default { changed(integer c) { integer zero; integer q = 1 / zero; } }', 'a')] }],
    })
    scripts['a']!.start()
    await expect(addScript(prims[0]!, src(logger, 'n'))).rejects.toThrow('divide by zero')
    const added = prims[0]!.findScript('n')!
    expect(added.running).toBe(true)
    expect(added.hasStarted).toBe(false)
  })

  it('refuses a script that was not built on the prim, has started, or has a taken or empty name', async () => {
    const { linkset, prims, scripts } = await load()
    expect(() => prims[1]!.dropScript(scripts['a']!)).toThrow('dropScript: the script was not built on this prim')
    expect(() => prims[0]!.dropScript(scripts['a']!)).toThrow("dropScript: 'a' has already started")
    const twin = await loadLinkset({ prims: [{ scripts: [src(logger, 'x'), src(logger, 'y')] }] })
    twin.prims[0]!.inventory.find((item) => item.script === twin.scripts['y'])!.name = 'x'
    expect(() => twin.prims[0]!.dropScript(twin.scripts['y']!)).toThrow("dropScript: an item named 'x' already exists")
    await expect(addScript(prims[0]!, src(logger, 'é'))).rejects.toThrow('addScript: the script name has no ASCII characters')
    twin.linkset.dead = true
    expect(() => twin.prims[0]!.dropScript(twin.scripts['x']!)).toThrow('dropScript: the object no longer exists')
    linkset.dead = true
    await expect(addScript(prims[0]!, src(logger, 'n'))).rejects.toThrow('addScript: the object no longer exists')
    expect(prims[0]!.inventory.map((item) => item.name)).toEqual(['a', 'b'])
  })
})

describe('a child prim with no script that handles changed', () => {
  it('passes a dropped notecard to the root', async () => {
    // In-world: a notecard dropped on an empty child -> both root scripts logged
    // changed(1) with the root's own item count. A notecard dropped on a child
    // whose script handles changed -> only that script logged it.
    const { prims, scripts } = await load()
    prims[2]!.addInventory(notecard('nc'))
    expect(scripts['a']!.global('seen')).toEqual(['changed 1 of 2'])
    expect(scripts['b']!.global('seen')).toEqual(['changed 1 of 2'])
    expect(scripts['c']!.global('seen')).toEqual([])
    prims[1]!.addInventory(notecard('nc'))
    expect(scripts['c']!.global('seen')).toEqual(['changed 1 of 2'])
    expect(scripts['a']!.global('seen')).toEqual(['changed 1 of 2'])
  })

  it('counts an SLua handler in the child', async () => {
    // In-world: a notecard dropped on a child whose SLua script had an LLEvents
    // changed handler -> that handler ran and the root's script logged nothing.
    // A notecard dropped on a child whose SLua script had no handler -> the
    // root's script logged changed(1).
    const { prims, scripts } = await load()
    const handler = await addScript(prims[2]!, { source: { source: 'LLEvents:on("changed", function(c) print("changed " .. c) end)', filename: 'u.luau' } })
    scripts['a']!.setGlobal('seen', [])
    prims[2]!.addInventory(notecard('nc'))
    expect(handler.printed).toEqual(['changed 1'])
    expect(scripts['a']!.global('seen')).toEqual([])
    prims[2]!.removeInventory('u')
    await addScript(prims[2]!, { source: { source: 'print("v")', filename: 'v.luau' } })
    scripts['a']!.setGlobal('seen', [])
    prims[2]!.addInventory(notecard('nc'))
    expect(scripts['a']!.global('seen')).toEqual(['changed 1 of 2'])
  })

  it('passes it to the root when the child holds only a stopped script', async () => {
    // In-world: a notecard dropped on a child whose only script was not running
    // -> both root scripts logged changed(1).
    const { prims, scripts } = await load()
    await addScript(prims[2]!, src(logger, 'n'), { running: false })
    prims[2]!.addInventory(notecard('nc'))
    expect(scripts['a']!.global('seen')).toEqual(['changed 1 of 2', 'changed 1 of 2'])
  })

  it('goes by the state the child script is in', async () => {
    // In-world: a child script with a changed handler only in its second state.
    // A notecard dropped while it was in the default state -> both root scripts
    // logged changed(1). After a touch moved it to the second state, another
    // notecard -> the child script logged changed(1) once, for that notecard
    // only, and the root's scripts logged nothing.
    const { linkset, prims, scripts } = await load()
    const child = await addScript(prims[2]!, src(late, 'late'))
    scripts['a']!.setGlobal('seen', [])
    prims[2]!.addInventory(notecard('nc'))
    expect(scripts['a']!.global('seen')).toEqual(['changed 1 of 2'])
    expect(child.global('seen')).toEqual([])
    linkset.touch(3)
    prims[2]!.addInventory(notecard('nc'))
    expect(child.global('seen')).toEqual(['changed 1'])
    expect(scripts['a']!.global('seen')).toEqual(['changed 1 of 2'])
  })

  it('keeps it in the child when the script there is asleep in a handler', async () => {
    // In-world: a child script asleep for 15 s in its touch handler, with a
    // changed handler in the same state, and a notecard dropped on the child 2 s
    // into the sleep -> the child script logged changed(1) when it woke; the
    // root's scripts logged nothing.
    const { linkset, prims, scripts } = await load()
    const sleeper = await addScript(prims[2]!, src(`list seen;
      default {
        touch_start(integer n) { llSleep(15.0); }
        changed(integer c) { seen += "changed " + (string)c; }
      }`, 'sleeper'))
    scripts['a']!.setGlobal('seen', [])
    sleeper.linkset.clock.schedule(sleeper, linkset.clock.now, 'touch_start', { num_detected: 1 })
    linkset.advanceTime(2000)
    expect(sleeper.wakeAt).toBeDefined()
    prims[2]!.addInventory(notecard('nc'))
    expect(sleeper.global('seen')).toEqual([])
    linkset.advanceTime(14000)
    expect(sleeper.global('seen')).toEqual(['changed 1'])
    expect(scripts['a']!.global('seen')).toEqual([])
  })

  it('goes by the state a sleeping child script is in at the time of the edit', async () => {
    // In-world: a child script asleep for 12 s in the touch handler of its
    // default state, which has no changed handler, before moving to a state
    // that has one. A notecard dropped on the child 2 s into the sleep -> the
    // root's scripts logged changed(1) within a second; the child script logged
    // no changed after it reached the second state. The next notecard -> the
    // child script logged changed(1) and the root's scripts logged nothing.
    const { linkset, prims, scripts } = await load()
    const sleeper = await addScript(prims[2]!, src(`list seen;
      default { touch_start(integer n) { llSleep(12.0); state two; } }
      state two { changed(integer c) { seen += "changed " + (string)c; } }`, 'sleeper'))
    scripts['a']!.setGlobal('seen', [])
    linkset.clock.schedule(sleeper, linkset.clock.now, 'touch_start', { num_detected: 1 })
    linkset.advanceTime(2000)
    prims[2]!.addInventory(notecard('nc'))
    expect(scripts['a']!.global('seen')).toEqual(['changed 1 of 2'])
    linkset.advanceTime(11000)
    expect(sleeper.currentState).toBe('two')
    expect(sleeper.global('seen')).toEqual([])
    prims[2]!.addInventory(notecard('nc'))
    expect(sleeper.global('seen')).toEqual(['changed 1'])
    expect(scripts['a']!.global('seen')).toEqual(['changed 1 of 2'])
  })

  // Not measured: the viewer tools used for these probes cannot save or rename
  // a notecard inside a prim, so replaceInventory and renameInventory on an
  // item in such a child follow the rule measured for drops, deletes and
  // recompiles.
  it('passes a delete to the root, also when the deleted script was the only one', async () => {
    // In-world: deleting a notecard from a child whose script has no changed
    // handler, then that script, and deleting the only logging script of a
    // child -> both root scripts logged changed(1) each time. Deleting one of
    // two logging scripts in a child -> the one left logged changed(1) and the
    // root's logged nothing.
    const { prims, scripts } = await load()
    await addScript(prims[2]!, src(deaf, 'deaf'))
    prims[2]!.placeInventory(notecard('nc'))
    scripts['a']!.setGlobal('seen', [])
    prims[2]!.removeInventory('nc')
    expect(scripts['a']!.global('seen')).toEqual(['changed 1 of 2'])
    prims[2]!.removeInventory('deaf')
    expect(scripts['a']!.global('seen')).toEqual(['changed 1 of 2', 'changed 1 of 2'])
    await addScript(prims[1]!, src(logger, 'n'))
    scripts['c']!.setGlobal('seen', [])
    prims[1]!.removeInventory('n')
    expect(scripts['c']!.global('seen')).toEqual(['changed 1 of 1'])
    expect(scripts['a']!.global('seen')).toEqual(['changed 1 of 2', 'changed 1 of 2'])
    prims[1]!.removeInventory('c')
    expect(scripts['a']!.global('seen')).toEqual(['changed 1 of 2', 'changed 1 of 2', 'changed 1 of 2'])
    expect(scripts['d']!.global('seen')).toEqual([])
  })
})

describe('owner recompiles a script', () => {
  it('resets it with a new key and tells the other scripts in the prim', async () => {
    // In-world: two logging scripts in a child, both moved to their second state
    // by a touch, one of them recompiled in the object's contents -> it logged
    // state_entry of the default state with a different llGetInventoryKey and
    // no changed; the other logged changed(1); the root's scripts and the other
    // child's script logged nothing. The same in the root: the other root
    // script logged changed(1) and no child script did.
    const { linkset, prims, scripts } = await load()
    const second = await addScript(prims[1]!, src(logger, 'n'))
    linkset.touch(2)
    for (const script of [scripts['a']!, scripts['c']!, second]) script.setGlobal('seen', [])
    expect(scripts['c']!.currentState).toBe('two')
    const spoken = said(scripts['c']!).length
    prims[1]!.replaceInventory('c', {})
    const first = keyOf(prims[1]!, 'c')
    expect(first).not.toBe(NULL_KEY)
    expect(scripts['c']!.currentState).toBe('default')
    expect(said(scripts['c']!).slice(spoken)).toEqual(['entry c'])
    expect(second.global('seen')).toEqual(['two changed 1'])
    expect(scripts['a']!.global('seen')).toEqual([])
    expect(scripts['d']!.global('seen')).toEqual([])
    prims[1]!.replaceInventory('c', {})
    expect(keyOf(prims[1]!, 'c')).not.toBe(first)

    const before = said(scripts['a']!).length
    prims[0]!.replaceInventory('a', { key: '11111111-2222-3333-4444-555555555555' })
    expect(keyOf(prims[0]!, 'a')).toBe('11111111-2222-3333-4444-555555555555')
    expect(said(scripts['a']!).slice(before)).toEqual(['entry a'])
    expect(scripts['b']!.global('seen')).toEqual(['changed 1 of 2'])
    expect(scripts['d']!.global('seen')).toEqual([])
  })

  it('tells the root when no other script in the child handles changed', async () => {
    // In-world: the only script of a child recompiled -> it logged state_entry
    // with a new key; both root scripts logged changed(1). The same when the
    // child also held a running script with no changed handler.
    const { prims, scripts } = await load()
    prims[1]!.replaceInventory('c', {})
    expect(said(scripts['c']!).slice(1)).toEqual(['entry c'])
    expect(scripts['a']!.global('seen')).toEqual(['changed 1 of 2'])
    expect(scripts['b']!.global('seen')).toEqual(['changed 1 of 2'])
    await addScript(prims[1]!, src(deaf, 'deaf'))
    prims[1]!.replaceInventory('c', {})
    expect(scripts['a']!.global('seen')).toEqual(['changed 1 of 2', 'changed 1 of 2'])
  })

  it('tells the others before the reset, and loses a link message they send it', async () => {
    // In-world: the other root script sent llMessageLinked(LINK_THIS, ...) from
    // its changed handler and logged timestamps. It logged changed 0.2 s before
    // the recompiled script logged state_entry, and the recompiled script never
    // logged the message. In another run the script beside it read
    // llGetScriptState of the recompiled script as 0 in its changed handler.
    const { prims, scripts } = await loadLinkset({
      prims: [{ scripts: [
        src(`list heard;
          default { changed(integer c) {
            heard += [llGetObjectDesc(), llGetScriptState("n")];
            llMessageLinked(LINK_THIS, 7, "", "");
          } }`, 'a'),
        src(`default {
          state_entry() { llSetObjectDesc(llGetObjectDesc() + "entry "); }
          link_message(integer s, integer n, string m, key k) { llSetObjectDesc(llGetObjectDesc() + "message "); }
        }`, 'n'),
      ] }],
    })
    for (const script of Object.values(scripts)) script.start()
    prims[0]!.replaceInventory('n', {})
    scripts['n']!.linkset.advanceTime(1000)
    expect(scripts['a']!.global('heard')).toEqual(['entry ', 0])
    expect(prims[0]!.description).toBe('entry entry ')
  })

  it('hides the recompiled script from the others while they handle changed', async () => {
    // In-world: a child script whose changed handler called
    // llSetScriptState("L4", FALSE), and "L4" recompiled beside it -> the prim
    // said "Could not find script 'L4'." on DEBUG_CHANNEL and "L4" logged
    // state_entry. At the next edit of the prim the same handler stopped it
    // with no error.
    const { linkset, prims, scripts } = await loadLinkset({
      prims: [{ scripts: [src('default { changed(integer c) { llSetScriptState("n", FALSE); } }', 'a'), src(logger, 'n')] }],
    })
    for (const script of Object.values(scripts)) script.start()
    prims[0]!.replaceInventory('n', {})
    expect(said(scripts['a']!)).toEqual(["Could not find script 'n'."])
    expect(said(scripts['n']!)).toEqual(['entry n', 'entry n'])
    expect(scripts['n']!.running).toBe(true)
    prims[0]!.addInventory(notecard('nc'))
    linkset.advanceTime(0)
    expect(said(scripts['a']!)).toEqual(["Could not find script 'n'."])
    expect(scripts['n']!.running).toBe(false)
  })

  it('does not reset a script that a changed handler deleted, or one whose object died', async () => {
    // Follows the drop measured above: a script deleted from a changed handler
    // never ran. The llDie case is the harness rule that no script of a deleted
    // object runs; it was not probed.
    const removed = await loadLinkset({
      prims: [{ scripts: [src('default { changed(integer c) { llRemoveInventory("n"); } }', 'a'), src(logger, 'n')] }],
    })
    for (const script of Object.values(removed.scripts)) script.start()
    removed.prims[0]!.replaceInventory('n', {})
    expect(said(removed.scripts['n']!)).toEqual(['entry n'])
    expect(removed.prims[0]!.scripts).toEqual([removed.scripts['a']])
    const died = await loadLinkset({
      prims: [{ scripts: [src('default { changed(integer c) { llDie(); } }', 'a'), src(logger, 'n')] }],
    })
    for (const script of Object.values(died.scripts)) script.start()
    died.prims[0]!.replaceInventory('n', {})
    expect(died.linkset.dead).toBe(true)
    expect(said(died.scripts['n']!)).toEqual(['entry n'])
  })

  it('leaves a stopped script stopped, and it starts afresh later', async () => {
    // In-world: a script that was not running, alone in a child, recompiled ->
    // it logged nothing and both root scripts logged changed(1). With a logging
    // script beside it, that one logged changed(1), and its
    // llSetScriptState(name, TRUE) then made the recompiled script log state_entry.
    const { linkset, prims, scripts } = await load()
    const control = await addScript(prims[1]!, src('default { link_message(integer s, integer n, string m, key k) { llSetScriptState("c", n); } }', 'ctl'))
    linkset.touch(2)
    control.fire('link_message', { sender_num: 2, num: 0, str: '', id: NULL_KEY })
    expect(scripts['c']!.running).toBe(false)
    scripts['a']!.setGlobal('seen', [])
    const spoken = said(scripts['c']!).length
    prims[1]!.replaceInventory('c', {})
    expect(scripts['c']!.running).toBe(false)
    expect(said(scripts['c']!).slice(spoken)).toEqual([])
    expect(scripts['a']!.global('seen')).toEqual(['changed 1 of 2'])
    control.fire('link_message', { sender_num: 2, num: 1, str: '', id: NULL_KEY })
    linkset.advanceTime(0)
    expect(said(scripts['c']!).slice(spoken)).toEqual(['entry c'])
  })

  it('changes only the key of a script that nothing has run', async () => {
    const { prims, scripts } = await loadLinkset({ prims: [{ scripts: [src(logger, 'a')] }] })
    prims[0]!.replaceInventory('a', {})
    expect(keyOf(prims[0]!, 'a')).not.toBe(NULL_KEY)
    expect(scripts['a']!.hasStarted).toBe(false)
    expect(said(scripts['a']!)).toEqual([])
  })

  it('resets a script that only a queued event has run', async () => {
    const { linkset, prims, scripts } = await loadLinkset({ prims: [{ scripts: [src(logger, 'a')] }] })
    linkset.clock.schedule(scripts['a']!, linkset.clock.now, 'link_message', { sender_num: 1, num: 0, str: '', id: NULL_KEY })
    linkset.advanceTime(0)
    expect(scripts['a']!.global('seen')).toEqual(['message'])
    prims[0]!.replaceInventory('a', {})
    expect(scripts['a']!.global('seen')).toEqual(['entry a'])
  })

  it('does not bring back a script of an object that has died', async () => {
    const { prims, scripts } = await loadLinkset({
      prims: [{ scripts: [src('default { state_entry() { llOwnerSay("entry"); } touch_start(integer n) { llDie(); } }', 'a')] }],
    })
    scripts['a']!.start()
    scripts['a']!.fire('touch_start', { num_detected: 1 })
    expect(scripts['a']!.dead).toBe(true)
    prims[0]!.replaceInventory('a', {})
    expect(said(scripts['a']!)).toEqual(['entry'])
  })
})

describe('owner renames a script', () => {
  // https://wiki.secondlife.com/wiki/Changed: CHANGED_INVENTORY is "Prim inventory
  // has changed". https://wiki.secondlife.com/wiki/LlGetScriptName: "the name of
  // the script that called this function".
  // Not measured: no tool of the viewer used for these probes renames an item
  // inside a prim's contents (its rename and script tools answer "no such item"
  // for the id of an item in a prim). That a rename sends the event follows the
  // wiki. These are assumptions: one event per rename, the renamed script gets
  // it too, the script is not reset, and llGetScriptName returns the new name.
  // In-world, for another edit of a script item's details: the next-owner
  // permissions of two scripts in the root's contents were changed, one request
  // per script. Each of the two scripts logged changed(1) once per request, so
  // also for its own item; neither reset (one stayed in its second state); no
  // child script logged anything.
  it('keeps it running under the new name and tells every script in the prim, itself included', async () => {
    const { linkset, prims, scripts } = await load()
    linkset.touch(1)
    for (const script of [scripts['a']!, scripts['b']!]) script.setGlobal('seen', [])
    prims[0]!.renameInventory('a', 'renamed')
    expect(prims[0]!.findScript('renamed')).toBe(scripts['a'])
    expect(prims[0]!.findScript('a')).toBeUndefined()
    expect(scripts['a']!.currentState).toBe('two')
    expect(scripts['a']!.global('seen')).toEqual(['two changed 1'])
    expect(scripts['b']!.global('seen')).toEqual(['two changed 1'])
    expect(scripts['c']!.global('seen')).toEqual([])
    prims[0]!.replaceInventory('renamed', {})
    expect(scripts['a']!.global('seen')).toEqual(['entry renamed'])
  })

  it('refuses a taken name', async () => {
    const { prims } = await load()
    expect(() => prims[0]!.renameInventory('a', 'b')).toThrow("renameInventory: an item named 'b' already exists")
  })
})
