import { describe, expect, it } from 'vitest'
import { loadLinkset, loadRlvPair, makeInventoryItem, InventoryType, Prim, seedRlvInventory, World } from '../src/index.js'
import type { Linkset, Script } from '../src/index.js'

// Every "In-world" note below was measured on Aditi, SLua Tideland, 2026-11-13 and 2026-11-14,
// with a Firestorm RLVa viewer whose avatar owned every probe object.
//
// Each probe object held one script that took commands on a chat channel. It logged a line,
// with its event counter and llGetTime(), from every event and before and after every sleep,
// and said its whole log when asked. A command put the script to sleep in a listen handler;
// touches and more chat were then sent to it, the object was taken (or a copy of it), left in
// inventory, and rezzed again.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

async function fixture() {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
  return { world, avatar }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

async function make(f: Fixture, source: string, language: 'lsl' | 'slua' = 'lsl') {
  const made = await loadLinkset({ world: f.world, region: 'home', owner: OWNER,
    prims: [{ scripts: [{ name: 'main', source: { source }, ...(language === 'slua' ? { language } : {}) }] }] })
  const script = made.scripts.main!
  script.start()
  return { linkset: made.linkset, script }
}

/** Queue an event rather than fire it: fire() would wait for a sleeping handler to finish. */
function queue(f: Fixture, script: Script, event: string, payload: Record<string, unknown> = {}) {
  f.world.clock.schedule(script, f.world.clock.now, event, payload)
}
const touched = { num_detected: 1, detected: [{ key: BOB, name: 'Bob' }] }
const heard = (msg: string) => ({ channel: 5, name: 'owner', id: OWNER, msg })

function take(linkset: Linkset) {
  const saved = linkset.copy()
  linkset.remove()
  return saved
}

let items = 0
function rez(f: Fixture, saved: Linkset) {
  const id = `item-${++items}`
  seedRlvInventory(f.avatar, { sharedRootId: null, entries: [{ id, kind: 'item', parentId: null, name: 'probe', object: saved, assetType: 'object' }] })
  const object = f.world.attemptAvatarRez(f.avatar, id, { x: 1, y: 2, z: 3 }).object!
  return { linkset: object, script: object.allScripts()[0]! }
}

const sleeper = `list log; integer n;
  integer wait(float s) { integer before = n; llSleep(s); return before + 1; }
  default {
    state_entry() { llListen(5, "", "", ""); }
    on_rez(integer p) { log += "rez"; }
    attach(key id) { log += "attach " + (string)(id != NULL_KEY); }
    changed(integer c) { log += "changed " + (string)c; }
    touch_start(integer num) { ++n; log += "touch by " + llDetectedName(0); }
    listen(integer c, string name, key id, string m) {
      ++n;
      if (m == "sleep") { integer local = n * 100; log += "begin"; llSleep(90.0); log += "end " + (string)local + " at " + (string)llRound(llGetTime()); }
      else if (m == "expr") { log += "begin"; integer v = 7 + wait(90.0) * 2; log += "end " + (string)v; }
      else if (m == "email") { log += "begin"; llEmail("someone@example.com", "s", "b"); log += "end at " + (string)llRound(llGetTime()); }
      else if (m == "roll") { float r = llFrand(1000.0); llOwnerSay("rolled"); llSleep(90.0); log += (string)r; }
      else if (m == "state") { log += "begin"; llSleep(90.0); log += "woke"; state two; }
      else if (m == "three") state three;
      else log += "heard " + m;
    }
    state_exit() { log += "exit"; }
  }
  state two {
    state_entry() { log += "two"; }
    on_rez(integer p) { log += "two rez"; }
    touch_start(integer num) { log += "two touch"; }
  }
  state three {
    state_entry() { log += "three begin"; llSleep(90.0); log += "three end"; }
    on_rez(integer p) { log += "three rez"; }
    touch_start(integer num) { log += "three touch by " + llDetectedName(0); }
  }`

/** A sleeper told `command`, `after` ms into the sleep that follows. */
async function asleep(command: string, after = 5_000) {
  const f = await fixture()
  const made = await make(f, sleeper)
  queue(f, made.script, 'listen', heard(command))
  made.linkset.advanceTime(after)
  return { f, ...made }
}

describe('an LSL handler asleep when its object is copied', () => {
  // In-world: a listen handler set a local, logged, and slept 90 s inside a user function
  // called in the middle of an expression (integer v = 7 + wait(90.0) * 2). The object was taken
  // 7 s in and rezzed 45 s later. 83 s after the rez the handler logged "expr end v=11", from
  // the local and the function's result, and then on_rez ran. The line from before the sleep
  // was not logged again.
  it('finishes in the rezzed copy, with its locals, before on_rez', async () => {
    const { f, linkset } = await asleep('expr', 7_000)
    const saved = take(linkset)
    f.world.clock.advance(45_000)
    const copy = rez(f, saved)
    copy.linkset.advanceTime(82_000)
    expect(copy.script.global('log')).toEqual(['begin'])
    copy.linkset.advanceTime(1_000)
    expect(copy.script.global('log')).toEqual(['begin', 'end 11', 'rez'])
  })

  // In-world: the handler read llGetTime() as 31.7 s before a 90 s llSleep and 121.7 s after
  // it, though the object spent 45 s of the sleep in inventory.
  it('does not count the time in inventory towards the sleep', async () => {
    const { f, linkset } = await asleep('sleep', 5_000)
    const saved = take(linkset)
    f.world.clock.advance(45_000)
    const copy = rez(f, saved)
    copy.linkset.advanceTime(85_000)
    expect(copy.script.global('log')).toEqual(['begin', 'end 100 at 90', 'rez'])
  })

  // In-world: a handler logged, called llEmail (a 20 s forced delay) and logged again. The
  // object was taken 1 s into the delay and rezzed 49 s later. The second line came 19.4 s after
  // the rez, with llGetTime() 20.0 s past the first, and then on_rez ran.
  it('finishes a forced delay in the copy without making the call again', async () => {
    const { f, linkset, script } = await asleep('email', 1_000)
    expect(script.calls.filter(c => c.name === 'llEmail')).toHaveLength(1)
    const saved = take(linkset)
    f.world.clock.advance(49_000)
    const copy = rez(f, saved)
    copy.linkset.advanceTime(18_000)
    expect(copy.script.global('log')).toEqual(['begin'])
    copy.linkset.advanceTime(1_000)
    expect(copy.script.global('log')).toEqual(['begin', 'end at 20', 'rez'])
    expect(copy.script.calls.filter(c => c.name === 'llEmail')).toEqual([])
  })

  // The copy takes what the handler's calls returned from the original, so a value that would
  // come out differently a second time is the same in both, and nothing is said twice.
  it('keeps what the handler\'s calls had returned', async () => {
    const { linkset, script } = await asleep('roll')
    const copy = linkset.copy().copy({ world: linkset.world!, region: 'home' })
    const twin = copy.allScripts()[0]!
    copy.advanceTime(85_000)
    expect(twin.global('log')).toEqual(script.global('log'))
    expect(script.global('log')).toHaveLength(1)
    expect(twin.chat).toEqual([])
  })

  // In-world: a copy was taken of an object 10 s into a 90 s sleep. The original logged the end
  // of its sleep 90 s after the start and got no on_rez. The copy, rezzed 45 s later, logged the
  // end of the sleep when its own 90 s were up, and then on_rez.
  it('carries on in the original and in a copy taken of it', async () => {
    const { f, linkset, script } = await asleep('sleep', 10_000)
    const saved = linkset.copy()
    linkset.advanceTime(45_000)
    const copy = rez(f, saved)
    linkset.advanceTime(35_000)
    expect(script.global('log')).toEqual(['begin', 'end 100 at 90'])
    expect(copy.script.global('log')).toEqual(['begin'])
    linkset.advanceTime(45_000)
    expect(copy.script.global('log')).toEqual(['begin', 'end 100 at 90', 'rez'])
    expect(script.global('log')).toEqual(['begin', 'end 100 at 90'])
  })

  // In-world: an object taken 5 s into a 60 s sleep was rezzed twice from the one inventory
  // item. Each copy logged the end of the sleep 55 s after its own rez, then on_rez.
  it('finishes in every copy rezzed from the saved object', async () => {
    const { f, linkset } = await asleep('sleep', 5_000)
    const saved = take(linkset)
    const first = rez(f, saved)
    first.linkset.advanceTime(1_000)
    const second = rez(f, saved)
    first.linkset.advanceTime(84_000)
    expect(first.script.global('log')).toEqual(['begin', 'end 100 at 90', 'rez'])
    expect(second.script.global('log')).toEqual(['begin'])
    first.linkset.advanceTime(1_000)
    expect(second.script.global('log')).toEqual(['begin', 'end 100 at 90', 'rez'])
  })

  // In-world: a touch_start handler said llDetectedKey and llDetectedName, slept 30 s, and said
  // them again. The object was taken 6 s into the sleep and rezzed. After the sleep it still
  // read the toucher's key and name.
  it('keeps who touched it', async () => {
    const f = await fixture()
    const made = await make(f, `list log; default { touch_start(integer n) { llSleep(30.0); log += (string)llDetectedKey(0) + " " + llDetectedName(0); } }`)
    queue(f, made.script, 'touch_start', touched)
    made.linkset.advanceTime(6_000)
    const copy = rez(f, take(made.linkset))
    copy.linkset.advanceTime(24_000)
    expect(copy.script.global('log')).toEqual([`${BOB} Bob`])
  })

  // The original's event may carry the host's own record of that delivery (a damage event's
  // does). The copy must not finish or change it, and a later change to the original's event
  // data must not reach the copy.
  it('gets the event\'s data but not the original\'s delivery', async () => {
    const f = await fixture()
    const made = await make(f, `integer done; string who; default { touch_start(integer n) { llSleep(30.0); ++done; who = llDetectedName(0); } }`)
    let completed = 0
    const detected = [{ key: BOB, name: 'Bob' }]
    const delivery = { script: made.script, active: false, complete: () => { completed++ } }
    queue(f, made.script, 'touch_start', { num_detected: 1, detected, __damageDelivery: delivery })
    made.linkset.advanceTime(6_000)
    const copied = made.linkset.copy().copy({ world: f.world, region: 'home' })
    const copy = copied.allScripts()[0]!
    detected[0]!.name = 'Changed'
    copied.advanceTime(24_000)
    expect([made.script.global('done'), copy.global('done')]).toEqual([1, 1])
    expect([made.script.global('who'), copy.global('who')]).toEqual(['Changed', 'Bob'])
    expect(completed).toBe(1)
  })

  // Only the host can do this: a script cannot change its own globals while it sleeps. The copy
  // would take another path through the handler than the original did, so it is refused.
  it('refuses to copy a sleeping handler whose globals a test changed under it', async () => {
    const f = await fixture()
    const made = await make(f, `integer g; default { touch_start(integer n) { llSleep(1.0); if (g) llSleep(10.0); llOwnerSay("after"); llSleep(5.0); } }`)
    queue(f, made.script, 'touch_start', touched)
    made.linkset.advanceTime(500)
    made.script.setGlobal('g', 7)
    made.linkset.advanceTime(1_000)
    expect(() => made.linkset.copy()).toThrow('cannot copy the sleeping handler: it called llSleep where a second run calls llOwnerSay')
  })

  it('refuses to copy a sleeping handler that a changed global would end early', async () => {
    const f = await fixture()
    const made = await make(f, `integer g; default { touch_start(integer n) { llSleep(1.0); if (!g) return; llSleep(5.0); } }`)
    queue(f, made.script, 'touch_start', touched)
    made.linkset.advanceTime(500)
    made.script.setGlobal('g', 7)
    made.linkset.advanceTime(1_000)
    expect(() => made.linkset.copy()).toThrow('cannot copy the sleeping handler: a second run does not reach its sleep')
  })

  // In-world: a sleep did not run down while a worn object was in inventory (see the detach
  // test below). A copy rezzed from the detached object's item has the same sleep left.
  it('has the sleep left that a detached object went into inventory with', async () => {
    const f = await fixture()
    const made = await make(f, sleeper)
    made.linkset.attachToAvatar(OWNER, 5)
    made.linkset.advanceTime(0)
    made.script.setGlobal('log', [])
    queue(f, made.script, 'listen', heard('sleep'))
    made.linkset.advanceTime(3_000)
    made.linkset.detachFromAvatar()
    f.world.clock.advance(50_000)
    const copy = rez(f, made.linkset.copy())
    copy.linkset.advanceTime(86_000)
    expect(copy.script.global('log')).toEqual(['begin'])
    copy.linkset.advanceTime(1_000)
    expect(copy.script.global('log')).toEqual(['begin', 'end 100 at 90', 'rez', 'attach 0'])
  })

  it('carries the handler into a script copied on its own', async () => {
    const { linkset, script } = await asleep('sleep')
    const other = await loadLinkset({ world: linkset.world!, region: 'home', owner: OWNER, prims: [{}] })
    const copy = script.copyTo(other.linkset.prims[0]!)
    other.linkset.advanceTime(85_000)
    expect(copy.global('log')).toEqual(['begin', 'end 100 at 90'])
    expect(script.copyTo(other.linkset.prims[0]!, { fresh: true }).global('log')).toEqual([])
  })
})

// Not measured: an on_damage handler asleep through a take, and what the copy and the
// original's attack do then. on_damage and final_damage need damage-enabled land. The probes'
// parcel and region had damage off (llGetParcelFlags and llGetRegionFlags), and llDamage from
// one probe on another fired neither event there. It needs land with damage on.
describe('events waiting for a handler that is asleep when its object is copied', () => {
  // A list in a waiting event reaches the copy as the list it was.
  it('keep their list parameters', async () => {
    const f = await fixture()
    const made = await make(f, `list log; default {
      touch_start(integer n) { llSleep(10.0); }
      http_response(key id, integer status, list meta, string body) { log += llList2CSV(meta) + "|" + (string)llGetListEntryType(meta, 0); } }`)
    queue(f, made.script, 'touch_start', touched)
    made.linkset.advanceTime(1_000)
    queue(f, made.script, 'http_response', { request_id: BOB, status: 200, metadata: [1, 'two', 3.5], body: 'x' })
    const copy = rez(f, take(made.linkset))
    copy.linkset.advanceTime(10_000)
    expect(copy.script.global('log')).toEqual(['1, two, 3.500000|1'])
  })

  // A script put into a prim starts on the next clock step. Copied before that, it still
  // starts before it hears of the rez.
  it('keep a start that had not run yet ahead of on_rez', async () => {
    const f = await fixture()
    const made = await loadLinkset({ world: f.world, region: 'home', owner: OWNER,
      prims: [{ scripts: [{ name: 'main', source: { source: 'list log; default { state_entry() { log += "entry"; } on_rez(integer p) { log += "rez"; } }' } }] }] })
    made.scripts.main!.queueStart()
    const copy = rez(f, take(made.linkset))
    copy.linkset.advanceTime(0)
    expect(copy.script.global('log')).toEqual(['entry', 'rez'])
  })

  // In-world: while a listen handler slept, the object was touched and then sent a chat line.
  // It was taken and rezzed. The copy logged the end of the sleep, then on_rez, then the chat
  // line, then one touch_start that still named the toucher. (The chat line came before the
  // touch although the touch was made first. It did the same in an object that was never
  // taken, so that order is not the take's doing and the test queues the chat first.)
  it('run in the copy after on_rez', async () => {
    const { f, linkset, script } = await asleep('sleep')
    queue(f, script, 'listen', heard('a'))
    queue(f, script, 'touch_start', touched)
    const copy = rez(f, take(linkset))
    copy.linkset.advanceTime(85_000)
    expect(copy.script.global('log')).toEqual(['begin', 'end 100 at 90', 'rez', 'heard a', 'touch by Bob'])
  })

  // In-world: a prim rezzed the object from its contents with llRezObject, the object went to
  // sleep, was touched and sent a chat line, and the prim took it back with
  // llDerezObject(id, DEREZ_TO_INVENTORY), which returned 1. Rezzed again with llRezObject, it
  // logged the end of the sleep, on_rez(5), the chat line and the touch.
  it('run in a copy that a script derezzed and rezzed again', async () => {
    const f = await fixture()
    const saved = take((await make(f, sleeper)).linkset)
    const rezzer = await make(f, `key child; default {
      object_rez(key id) { child = id; }
      link_message(integer from, integer n, string s, key id) {
        if (s == "rez") llRezObject("probe", llGetPos() + <0, 0, 1>, ZERO_VECTOR, ZERO_ROTATION, 5);
        else llOwnerSay((string)llDerezObject(child, DEREZ_TO_INVENTORY));
      }
    }`)
    rezzer.linkset.prims[0]!.addInventory(makeInventoryItem({ name: 'probe', type: InventoryType.OBJECT, key: saved.prims[0]!.key, object: saved }))
    const tell = (s: string) => rezzer.script.fire('link_message', { sender_num: 0, num: 0, str: s, id: '' })
    tell('rez')
    const first = f.world.linksets.at(-1)!.allScripts()[0]!
    queue(f, first, 'listen', heard('sleep'))
    rezzer.linkset.advanceTime(5_000)
    queue(f, first, 'listen', heard('a'))
    queue(f, first, 'touch_start', touched)
    tell('derez')
    expect(rezzer.script.chat.at(-1)!.text).toBe('1')
    tell('rez')
    const second = f.world.linksets.at(-1)!.allScripts()[0]!
    expect(second).not.toBe(first)
    rezzer.linkset.advanceTime(85_000)
    expect(second.global('log')).toEqual(['rez', 'begin', 'end 100 at 90', 'rez', 'heard a', 'touch by Bob'])
  })

  // In-world: an object 4 s into a 70 s sleep, with a chat line waiting, was taken, rezzed, taken
  // again 3 s later and rezzed again, still asleep. It logged the end of the sleep, on_rez, the
  // chat line, and a second on_rez.
  it('keep the on_rez of an earlier rez, behind them', async () => {
    const { f, linkset, script } = await asleep('sleep')
    queue(f, script, 'listen', heard('b'))
    const first = rez(f, take(linkset))
    first.linkset.advanceTime(3_000)
    const second = rez(f, take(first.linkset))
    second.linkset.advanceTime(82_000)
    expect(second.script.global('log')).toEqual(['begin', 'end 100 at 90', 'rez', 'heard b', 'rez'])
  })

  // In-world: three objects went to sleep and were sent 62, 63 and 64 chat lines, then taken
  // and rezzed (the test runs the two either side of the limit). Each logged the end of its sleep and every line. The ones with 62 and 63 lines
  // got on_rez before the lines; the one with 64 got no on_rez.
  it.each([[63, true], [64, false]])('leave room for on_rez only below 64: %i waiting', async (lines, rezzed) => {
    const { f, linkset, script } = await asleep('sleep')
    for (let i = 0; i < lines; i++) queue(f, script, 'listen', heard(`${i}`))
    const copy = rez(f, take(linkset))
    copy.linkset.advanceTime(85_000)
    const heardAll = Array.from({ length: lines }, (_, i) => `heard ${i}`)
    expect(copy.script.global('log')).toEqual(['begin', 'end 100 at 90', ...(rezzed ? ['rez'] : []), ...heardAll])
  })

  // In-world: an object 4 s into a 40 s sleep (90 s here), with a chat line waiting, was taken
  // and then worn from inventory. It logged the end of the sleep, on_rez, the chat line, and attach.
  it('run between on_rez and attach in a copy that is worn', async () => {
    const { rlv } = await loadRlvPair({ source: 'default { touch_start(integer n) { llOwnerSay("@attach:direct=force"); } }' })
    const { world, avatar } = rlv
    const made = await loadLinkset({ world, region: avatar.region, owner: avatar.key, prims: [{ scripts: [{ name: 'main', source: { source: sleeper } }] }] })
    made.scripts.main!.start()
    world.clock.schedule(made.scripts.main!, world.clock.now, 'listen', heard('sleep'))
    made.linkset.advanceTime(4_000)
    world.clock.schedule(made.scripts.main!, world.clock.now, 'listen', heard('c'))
    seedRlvInventory(avatar, { sharedRootId: 'root', entries: [
      { id: 'root', parentId: null, kind: 'folder', name: '#RLV' },
      { id: 'folder', parentId: 'root', kind: 'folder', name: 'Direct' },
      { id: 'probe', parentId: 'folder', kind: 'item', name: 'Probe (left hand)', assetType: 'object', object: take(made.linkset) },
    ] })
    rlv.script.start()
    rlv.script.fire('touch_start', { num_detected: 1 })
    const worn = world.linksets.find(l => l.attachment && l !== rlv.script.linkset && l.allScripts().length)!
    worn.advanceTime(86_000)
    expect(worn.allScripts()[0]!.global('log')).toEqual(['begin', 'end 100 at 90', 'rez', 'heard c', 'attach 1'])
  })

  // In-world: a worn object went to sleep for 40 s (90 s here) and was sent a chat line. It was
  // detached 3 s in and worn again 9.5 s later. The sleep ended 49.1 s after it began. It logged the end of the sleep, on_rez, the chat line,
  // attach(NULL_KEY) and attach(wearer).
  it('stay with a worn object through a detach, ahead of its attach events', async () => {
    const f = await fixture()
    const made = await make(f, sleeper)
    made.linkset.attachToAvatar(OWNER, 5)
    made.linkset.advanceTime(0)
    made.script.setGlobal('log', [])
    queue(f, made.script, 'listen', heard('sleep'))
    made.linkset.advanceTime(3_000)
    queue(f, made.script, 'listen', heard('b'))
    made.linkset.detachFromAvatar()
    f.world.clock.advance(10_000)
    made.linkset.attachToAvatar(OWNER, 5)
    made.linkset.advanceTime(87_000)
    expect(made.script.global('log')).toEqual(['begin', 'end 100 at 90', 'rez', 'heard b', 'attach 0', 'attach 1'])
  })

  // A handler that starts in inventory, as attach(NULL_KEY) does when the clock moved on before
  // it ran, has only slept since it started.
  it('postpone a sleep that began in inventory by the time since it began', async () => {
    const f = await fixture()
    const made = await make(f, 'list log; default { attach(key id) { if (id == NULL_KEY) { llSleep(5.0); log += "woke"; } } }')
    made.linkset.attachToAvatar(OWNER, 5)
    made.linkset.advanceTime(0)
    made.linkset.detachFromAvatar()
    f.world.clock.advance(10_000)
    made.linkset.advanceTime(0)
    f.world.clock.advance(10_000)
    made.linkset.attachToAvatar(OWNER, 5)
    made.linkset.advanceTime(4_999)
    expect(made.script.global('log')).toEqual([])
    made.linkset.advanceTime(1)
    expect(made.script.global('log')).toEqual(['woke'])
  })

  // A script that was not asleep ran attach(NULL_KEY) on its way into inventory, so that
  // event stays ahead of the next wear's on_rez even when a test wears it again at once.
  it('leave the queue of a script that is not asleep as it is', async () => {
    const f = await fixture()
    const made = await make(f, sleeper)
    made.linkset.attachToAvatar(OWNER, 5)
    made.linkset.advanceTime(0)
    made.script.setGlobal('log', [])
    made.linkset.detachFromAvatar()
    made.linkset.attachToAvatar(OWNER, 5)
    made.linkset.advanceTime(0)
    expect(made.script.global('log')).toEqual(['attach 0', 'rez', 'attach 1'])
  })

  // An on_rez still waiting from the first rez does not stand in for the on_rez of a later wear.
  it('get a new on_rez for every trip out of inventory', async () => {
    const { f, linkset } = await asleep('sleep')
    const copy = rez(f, take(linkset))
    copy.linkset.advanceTime(1_000)
    copy.linkset.attachToAvatar(OWNER, 5)
    copy.linkset.advanceTime(1_000)
    copy.linkset.detachFromAvatar()
    f.world.clock.advance(5_000)
    copy.linkset.attachToAvatar(OWNER, 5)
    copy.linkset.advanceTime(100_000)
    expect(copy.script.global('log')).toEqual(['begin', 'end 100 at 90', 'rez', 'attach 1', 'attach 0', 'rez', 'attach 1'])
  })

  // The stand takes the seat's controls back and drops a control event that was waiting. The
  // copy comes back without the controls, so it does not run that event either.
  it('leave out a control event when the copy comes back without its controls', async () => {
    const f = await fixture()
    const made = await make(f, `list log; default {
      touch_start(integer n) { llRequestPermissions(llGetOwner(), PERMISSION_TAKE_CONTROLS); }
      run_time_permissions(integer p) { llTakeControls(CONTROL_FWD, TRUE, FALSE); log += "took " + (string)p; }
      listen(integer c, string name, key id, string m) { llSleep(90.0); log += "end"; }
      control(key id, integer level, integer edge) { log += "control"; }
      on_rez(integer p) { log += "rez " + (string)llGetPermissions(); } }`)
    f.world.sitAvatar(f.avatar, made.linkset.prims[0]!)
    made.script.fire('touch_start', { num_detected: 1 })
    queue(f, made.script, 'listen', heard('sleep'))
    made.linkset.advanceTime(3_000)
    queue(f, made.script, 'control', { id: OWNER, level: 1, edge: 1 })
    const copy = rez(f, made.linkset.copy())
    made.linkset.advanceTime(100_000)
    expect(copy.script.global('log')).toEqual(['took 4', 'end', 'rez 0'])
  })

  // The cap counts the seat's own changed event: with the queue full there is no room for
  // on_rez or for the stand's event, and the copy runs the 64 it came out with.
  it('keep a full queue whole when the seat was sat on during the sleep', async () => {
    const { f, linkset, script } = await asleep('sleep')
    f.world.sitAvatar(f.avatar, linkset.prims[0]!)
    for (let i = 0; i < 63; i++) queue(f, script, 'listen', heard(`${i}`))
    const copy = rez(f, linkset.copy())
    copy.linkset.advanceTime(90_000)
    const lines = Array.from({ length: 63 }, (_, i) => `heard ${i}`)
    expect(copy.script.global('log')).toEqual(['begin', 'end 100 at 90', 'changed 32', ...lines])
  })

  // In-world: a seat went to sleep, its owner sat on it, and a copy was taken, which stood the
  // owner up. The original logged the end of the sleep and one changed(32). The rezzed copy
  // logged the end of the sleep, on_rez, and one changed(32).
  it('give the copy of a seat sat on during the sleep one changed event', async () => {
    const { f, linkset, script } = await asleep('sleep')
    f.world.sitAvatar(f.avatar, linkset.prims[0]!)
    linkset.advanceTime(1_000)
    const copy = rez(f, linkset.copy())
    linkset.advanceTime(90_000)
    expect(script.global('log')).toEqual(['begin', 'end 100 at 90', 'changed 32'])
    expect(copy.script.global('log')).toEqual(['begin', 'end 100 at 90', 'rez', 'changed 32'])
  })

  // The stand's event is still waiting when a rezzed copy is copied again before it wakes.
  it('keep the stand\'s changed event through a second copy', async () => {
    const { f, linkset } = await asleep('sleep')
    f.world.sitAvatar(f.avatar, linkset.prims[0]!)
    linkset.advanceTime(1_000)
    const first = rez(f, take(linkset))
    first.linkset.advanceTime(1_000)
    const second = rez(f, take(first.linkset))
    second.linkset.advanceTime(90_000)
    expect(second.script.global('log')).toEqual(['begin', 'end 100 at 90', 'rez', 'changed 32', 'rez'])
  })

  // In-world: the SLua twin did the same: the end of the sleep, on_rez, the chat line, the touch.
  it('run in an SLua copy after on_rez', async () => {
    const f = await fixture()
    const made = await make(f, `log = {}
      ll.Listen(5, "", "", "")
      LLEvents:on("on_rez", function(p) table.insert(log, "rez") end)
      LLEvents:on("touch_start", function() table.insert(log, "touch by " .. ll.DetectedName(1)) end)
      LLEvents:on("listen", function(c, name, id, m)
        if m == "sleep" then table.insert(log, "begin"); ll.Sleep(90); table.insert(log, "end") else table.insert(log, "heard " .. m) end
      end)`, 'slua')
    queue(f, made.script, 'listen', heard('sleep'))
    made.linkset.advanceTime(5_000)
    queue(f, made.script, 'listen', heard('a'))
    queue(f, made.script, 'touch_start', touched)
    const copy = rez(f, take(made.linkset))
    copy.linkset.advanceTime(85_000)
    expect(copy.script.global('log')).toEqual(['begin', 'end', 'rez', 'heard a', 'touch by Bob'])
  })

  // In-world: a handler slept 90 s and then changed state. The object was touched during the
  // sleep, taken and rezzed. The copy logged the wake, state_exit and the new state's
  // state_entry, and nothing more: the state change dropped the touch and the on_rez that were
  // waiting behind the handler.
  it('are dropped, on_rez with them, when the handler goes on to change state', async () => {
    const { f, linkset, script } = await asleep('state')
    queue(f, script, 'touch_start', touched)
    const copy = rez(f, take(linkset))
    copy.linkset.advanceTime(85_000)
    expect(copy.script.global('log')).toEqual(['begin', 'woke', 'exit', 'two'])
    copy.linkset.advanceTime(10_000)
    expect(copy.script.global('log')).toEqual(['begin', 'woke', 'exit', 'two'])
  })

  // In-world: a handler changed state and the new state's state_entry slept 90 s. The object
  // was touched during the sleep, taken and rezzed. The copy logged the end of state_entry, then
  // the new state's on_rez, then its touch_start.
  it('run in the state whose state_entry was asleep', async () => {
    const { f, linkset, script } = await asleep('three')
    queue(f, script, 'touch_start', touched)
    const copy = rez(f, take(linkset))
    copy.linkset.advanceTime(85_000)
    expect(copy.script.global('log')).toEqual(['exit', 'three begin', 'three end', 'three rez', 'three touch by Bob'])
  })
})

// What a viewer lets its user take is the viewer's own rule, so these come from the viewers'
// menu code (llviewermenu.cpp and rlvcommon.cpp in Firestorm 7 with RLVa 2.4.2, llviewermenu.cpp
// in Kokua RLV 2.09): a probe script cannot see a menu. What the grid does once a take goes
// through, and what the scripts see, was measured.
describe('taking an object through the viewer', () => {
  const seat = 'list log; default { changed(integer c) { log += "changed " + (string)c; } on_rez(integer p) { log += "rez"; } }'
  const issuer = 'string command; default { touch_start(integer n) { llOwnerSay(command); } }'
  type Rlv = Awaited<ReturnType<typeof loadRlvPair>>['rlv']
  function command(f: Rlv, text: string) {
    f.script.setGlobal('command', text)
    f.script.fire('touch_start', { num_detected: 1 })
  }
  async function target(f: { world: World; avatar: { key: string; region: string } }, owner = f.avatar.key) {
    const made = await loadLinkset({ world: f.world, owner, region: f.avatar.region, prims: [{ scripts: [{ name: 'main', source: { source: seat } }] }] })
    made.scripts.main!.start()
    return { linkset: made.linkset, script: made.scripts.main!, root: made.linkset.prims[0]! }
  }

  it('takes an object out of the world and leaves a copy\'s original in it', async () => {
    const f = await fixture()
    const a = await target(f), b = await target(f)
    const taken = f.world.attemptAvatarTake(f.avatar, a.root)
    expect(taken).toMatchObject({ action: 'take', status: 'taken', copy: false, target: a.root.key })
    expect(a.linkset.dead).toBe(true)
    const copied = f.world.attemptAvatarTake(f.avatar, b.root, { copy: true })
    expect(copied).toMatchObject({ status: 'taken', copy: true })
    expect(b.linkset.dead).toBe(false)
    const again = rez(f, copied.object!)
    again.linkset.advanceTime(0)
    expect(again.script.global('log')).toEqual(['rez'])
  })

  it('does not take what is not there, is worn or belongs to somebody else', async () => {
    const f = await fixture()
    const worn = await target(f), other = await target(f, BOB), gone = await target(f)
    worn.linkset.attachToAvatar(OWNER, 5)
    gone.linkset.remove()
    expect(f.world.attemptAvatarTake(f.avatar, worn.root)).toMatchObject({ status: 'unsupported', reason: 'worn' })
    expect(f.world.attemptAvatarTake(f.avatar, other.root, { copy: true })).toMatchObject({ status: 'unsupported', reason: 'owner' })
    expect(f.world.attemptAvatarTake(f.avatar, gone.root)).toMatchObject({ status: 'unsupported', reason: 'target' })
    const loose = new Prim({ name: 'loose' })
    expect(f.world.attemptAvatarTake(f.avatar, loose)).toMatchObject({ status: 'unsupported', reason: 'target', target: loose.key })
    const stranger = { ...f.avatar }
    expect(f.world.attemptAvatarTake(stranger, other.root)).toMatchObject({ status: 'unsupported', reason: 'avatar' })
  })

  // The viewers' Take is switched off for the object the avatar sits on, with or without RLV.
  // In-world: a copy taken of the seat stood the avatar up and the seat got changed(32).
  it('offers no Take for the seat the avatar sits on, and a copy stands the avatar up', async () => {
    const f = await fixture()
    const s = await target(f)
    f.world.sitAvatar(f.avatar, s.root)
    s.linkset.advanceTime(0)
    expect(f.world.attemptAvatarTake(f.avatar, s.root)).toMatchObject({ status: 'unsupported', reason: 'seated' })
    expect(f.avatar.sittingOn).toBe(s.root)
    expect(f.world.attemptAvatarTake(f.avatar, s.root, { copy: true }).status).toBe('taken')
    expect(f.avatar.sittingOn).toBeNull()
    s.linkset.advanceTime(0)
    expect(s.script.global('log')).toEqual(['changed 32', 'changed 32'])
  })

  // In-world: with @unsit=n from another object, the Firestorm RLVa viewer refused a copy of
  // the seat its avatar sat on. The avatar stayed seated and the seat's script heard nothing.
  // A copy of another object was still taken. Kokua's Take Copy has no such check.
  it('refuses a copy of the seat under @unsit in RLVa only', async () => {
    const pair = await loadRlvPair({ source: issuer })
    for (const profile of ['rlv', 'rlva'] as const) {
      const f = pair[profile]
      f.script.start()
      const s = await target(f), other = await target(f)
      f.world.sitAvatar(f.avatar, s.root)
      s.linkset.advanceTime(0)
      command(f, '@unsit=n')
      expect(f.take(other.root, { copy: true }).status, profile).toBe('taken')
      const attempt = f.take(s.root, { copy: true })
      if (profile === 'rlv') {
        expect(attempt.status).toBe('taken')
        expect(f.avatar.sittingOn).toBeNull()
        continue
      }
      expect(attempt).toMatchObject({ status: 'blocked', reason: 'unsit', copy: true })
      expect(attempt.restrictions.map(r => r.behaviour)).toEqual(['unsit'])
      expect(f.avatar.sittingOn).toBe(s.root)
      s.linkset.advanceTime(0)
      expect(s.script.global('log')).toEqual(['changed 32'])
      command(f, '@unsit=y')
      expect(f.take(s.root, { copy: true }).status).toBe('taken')
      expect(f.takeActions.map(a => a.status)).toEqual(['taken', 'blocked', 'taken'])
    }
  })

  // In-world: with @unsit=n set by another object, a prim called
  // llDerezObject(seat, DEREZ_TO_INVENTORY) on the seat its owner sat on. It returned 1, the
  // seat logged changed(32) with nobody on its sit target, and the avatar was standing with the
  // restriction still in force. DEREZ_DIE stood the avatar up as well. Rezzed again, the seat
  // logged on_rez and changed(32).
  it('lets a script derez the seat under @unsit, which stands the avatar up', async () => {
    const { rlva: f } = await loadRlvPair({ source: issuer })
    f.script.start()
    const s = await target(f)
    const saved = s.linkset.copy()
    s.linkset.remove()
    const rezzer = await loadLinkset({ world: f.world, owner: f.avatar.key, region: f.avatar.region, prims: [{ scripts: [{ name: 'main', source: { source: `key child; default {
      object_rez(key id) { child = id; }
      touch_start(integer n) { llRezObject("seat", llGetPos() + <0, 0, 1>, ZERO_VECTOR, ZERO_ROTATION, 5); }
      touch_end(integer n) { llOwnerSay((string)llDerezObject(child, DEREZ_TO_INVENTORY)); }
    }` } }] }] })
    rezzer.prims[0]!.addInventory(makeInventoryItem({ name: 'seat', type: InventoryType.OBJECT, key: saved.prims[0]!.key, object: saved }))
    rezzer.scripts.main!.start()
    rezzer.scripts.main!.fire('touch_start', { num_detected: 1 })
    const seatObject = f.world.linksets.at(-1)!
    const script = seatObject.allScripts()[0]!
    f.world.sitAvatar(f.avatar, seatObject.prims[0]!)
    seatObject.advanceTime(0)
    command(f, '@unsit=n')
    expect(f.take(seatObject.prims[0]!, { copy: true }).status).toBe('blocked')
    rezzer.scripts.main!.fire('touch_end', { num_detected: 1 })
    expect(rezzer.scripts.main!.chat.at(-1)!.text).toBe('1')
    expect(f.avatar.sittingOn).toBeNull()
    expect(seatObject.dead).toBe(true)
    expect(script.global('log')).toEqual(['rez', 'changed 32', 'changed 32'])
    expect(f.avatar.viewer.restrictions.snapshot().map(r => r.behaviour)).toEqual(['unsit'])
  })

  // RLVa's Take goes through its delete-or-return check: no take of an object under an edit
  // lock, nor of anything the avatar owns while @edit or @rez is set, even with an exception
  // for the object. Its Take Copy has none of these. Kokua's Take refuses under @rez alone.
  it('refuses a take under @rez, and under @edit in RLVa, but not a copy', async () => {
    const pair = await loadRlvPair({ source: issuer })
    for (const profile of ['rlv', 'rlva'] as const) {
      const f = pair[profile]
      f.script.start()
      const t = await target(f)
      command(f, '@rez=n')
      expect(f.take(t.root), profile).toMatchObject({ status: 'blocked', reason: 'rez' })
      expect(f.take(t.root, { copy: true }).status, profile).toBe('taken')
      command(f, '@rez=y,edit=n')
      expect(f.take(t.root).status, profile).toBe(profile === 'rlva' ? 'blocked' : 'taken')
      if (profile === 'rlv') continue
      command(f, `@edit:${t.root.key}=add`)
      expect(f.take(t.root)).toMatchObject({ status: 'blocked', reason: 'edit' })
      command(f, `@clear,editobj:${t.root.key}=n`)
      expect(f.take(t.root)).toMatchObject({ status: 'blocked', reason: 'editobj' })
      expect(f.take(t.root, { copy: true }).status).toBe('taken')
      expect(f.take(t.root).restrictions.map(r => r.behaviour)).toEqual(['editobj'])
      // An edit lock on world objects alone does not reach Take; with @rez it does.
      command(f, '@clear,editworld=n')
      const spare = await target(f)
      expect(f.take(spare.root).status).toBe('taken')
      command(f, '@rez=n')
      expect(f.take(t.root).restrictions.map(r => r.behaviour)).toEqual(['editworld', 'rez'])
      command(f, '@clear,edit=n')
      expect(f.take(t.root).restrictions.map(r => r.behaviour)).toEqual(['edit'])
      command(f, '@clear')
      expect(f.take(t.root).status).toBe('taken')
      expect(t.linkset.dead).toBe(true)
    }
  })
})
