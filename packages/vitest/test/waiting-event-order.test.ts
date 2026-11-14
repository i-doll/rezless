import { describe, expect, it } from 'vitest'
import { loadLinkset, makeInventoryItem, InventoryType, seedRlvInventory, World } from '../src/index.js'
import type { Linkset, Script } from '../src/index.js'

// Every "In-world" note below was measured on Aditi, SLua Tideland, 2026-11-14, with a
// Firestorm RLVa viewer whose avatar owned every probe object.
//
// The probe object held a script that logged a line from every event and around every sleep,
// and said its log when asked. A chat command put it to sleep in its listen handler, or armed
// another handler to sleep the next time it ran. While it slept it was clicked on a chosen
// face, sent chat lines by the avatar and by another object, sent link messages by a second
// script in the same prim, and that second script changed the prim's colour and scale. The
// stimuli were sent 1.5 s apart, so the order they came in is not in doubt.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

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

/** Queue an event rather than fire it: fire() and touch() would wait for a sleeping handler to finish. */
function queue(f: Fixture, script: Script, event: string, payload: Record<string, unknown> = {}) {
  f.world.clock.schedule(script, f.world.clock.now, event, payload)
}
const heard = (msg: string) => ({ channel: 5, name: 'owner', id: OWNER, msg })
const linked = (str: string) => ({ sender_num: 0, num: 0, str, id: '' })
const click = (face: number) => ({ num_detected: 1, detected: [{ key: OWNER, name: 'owner', touchFace: face }] })

/** One click: the three touch events, as Linkset.touch queues them. */
function touch(f: Fixture, script: Script, face: number) {
  for (const event of ['touch_start', 'touch', 'touch_end']) queue(f, script, event, click(face))
}

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

// "sleep" plus letters: t sets a 3 s timer, n starts a sensor that finds nothing, a sets a
// target the object is already at, r a rotation target it is already at. "nap <event>" makes that event's handler sleep next time.
const probe = `list log; string nap; integer target; integer turn;
  rest(string name) { if (nap == name) { nap = ""; log += "begin"; llSleep(10.0); log += "end"; } }
  default {
    state_entry() { llListen(5, "", "", ""); }
    listen(integer c, string name, key id, string m) {
      if (llGetSubString(m, 0, 4) == "sleep") {
        if (~llSubStringIndex(m, "t")) llSetTimerEvent(3.0);
        if (~llSubStringIndex(m, "n")) llSensor("nothing", NULL_KEY, PASSIVE, 1.0, PI);
        if (~llSubStringIndex(m, "a")) target = llTarget(llGetPos(), 2.0);
        if (~llSubStringIndex(m, "r")) turn = llRotTarget(llGetRot(), 0.2);
        log += "begin"; llSleep(10.0); log += "end";
      }
      else if (llGetSubString(m, 0, 2) == "nap") nap = llGetSubString(m, 4, -1);
      else log += "heard " + m;
    }
    link_message(integer from, integer n, string s, key id) { log += "link " + s; rest("link_message"); }
    touch_start(integer n) { log += "touch_start " + (string)llDetectedTouchFace(0); rest("touch_start"); }
    touch(integer n) { log += "touch " + (string)llDetectedTouchFace(0); rest("touch"); }
    touch_end(integer n) { log += "touch_end " + (string)llDetectedTouchFace(0); rest("touch_end"); }
    changed(integer c) { log += "changed " + (string)c; rest("changed"); }
    timer() { log += "timer"; llSetTimerEvent(0.0); rest("timer"); }
    no_sensor() { log += "no_sensor"; }
    at_target(integer t, vector at, vector pos) { log += "at_target"; llTargetRemove(target); }
    at_rot_target(integer t, rotation at, rotation rot) { log += "at_rot_target"; llRotTargetRemove(turn); }
    dataserver(key q, string d) { log += "dataserver"; }
    http_response(key q, integer status, list meta, string body) { log += "http_response"; }
    run_time_permissions(integer p) { log += "permissions"; }
    linkset_data(integer action, string name, string value) { log += "linkset_data"; }
    on_rez(integer p) { log += "rez " + (string)p; }
    attach(key id) { log += "attach " + (string)(id != NULL_KEY); }
  }`

async function asleep(command = 'sleep') {
  const f = await fixture()
  const made = await make(f, probe)
  queue(f, made.script, 'listen', heard(command))
  made.linkset.advanceTime(2_000)
  return { f, ...made }
}

function logAfterSleep(made: { linkset: Linkset; script: Script }) {
  made.linkset.advanceTime(8_500)
  return (made.script.global('log') as string[]).slice(2)
}

describe('events that come up while a handler sleeps', () => {
  // In-world: clicked, then sent a chat line -> the chat line, then touch_start, touch and
  // touch_end. The same with a link message in place of the chat line, and with the click made
  // after the chat line or link message. A chat line does not overtake: the touch is late.
  it.each([
    ['a chat line', 'listen', heard('a'), 'heard a'],
    ['a link message', 'link_message', linked('m'), 'link m'],
  ])('run a touch behind %s that came after it', async (_, event, payload, line) => {
    const made = await asleep()
    touch(made.f, made.script, 0)
    made.linkset.advanceTime(1_500)
    queue(made.f, made.script, event, payload)
    expect(logAfterSleep(made)).toEqual([line, 'touch_start 0', 'touch 0', 'touch_end 0'])
  })

  // In-world: link message then chat line -> in that order; chat line then link message -> in
  // that order. A dataserver and an http_response reply that came in before a chat line ran
  // before it. A permission dialog answered between two chat lines ran between them, and so
  // did a linkset_data event between a link message and a chat line.
  it('keep chat, link messages and replies in the order they came', async () => {
    const made = await asleep()
    const arrivals: [string, Record<string, unknown>][] = [
      ['link_message', linked('m1')], ['listen', heard('a')], ['dataserver', { queryid: OWNER, data: '1' }],
      ['http_response', { request_id: OWNER, status: 200, metadata: [], body: '' }], ['listen', heard('b')],
      ['run_time_permissions', { perm: 1024 }], ['linkset_data', { action: 1, name: 'k', value: 'v' }],
      ['link_message', linked('m2')], ['listen', heard('c')],
    ]
    for (const [event, payload] of arrivals) {
      queue(made.f, made.script, event, payload)
      made.linkset.advanceTime(500)
    }
    expect(logAfterSleep(made)).toEqual(['link m1', 'heard a', 'dataserver', 'http_response', 'heard b',
      'permissions', 'linkset_data', 'link m2', 'heard c'])
  })

  // In-world: clicked then colour changed -> touch events, then changed(2). Colour changed then
  // clicked -> the same. Colour changed then a chat line -> the chat line, then changed(2).
  // Click, link message, colour change, chat line, link message, chat line -> the two link
  // messages and two chat lines in the order sent, then the touch events, then changed(2).
  it('run changed behind the touch events, whichever came first', async () => {
    const made = await asleep()
    queue(made.f, made.script, 'changed', { changes: 2 })
    made.linkset.advanceTime(1_500)
    queue(made.f, made.script, 'link_message', linked('m1'))
    touch(made.f, made.script, 0)
    made.linkset.advanceTime(1_500)
    queue(made.f, made.script, 'listen', heard('a'))
    expect(logAfterSleep(made)).toEqual(['link m1', 'heard a', 'touch_start 0', 'touch 0', 'touch_end 0', 'changed 2'])
  })

  // In-world: with a 3 s timer and a 4 s repeating sensor that finds nothing, both set as the
  // sleep began, a click and a colour change gave timer, no_sensor, touch_start, touch,
  // touch_end, changed(2). With the timer at 4 s and the sensor at 3 s the order was the same.
  // With a target the object was already at: timer, no_sensor, at_target, the touch events,
  // changed. With a rotation target as well: timer, at_target, at_rot_target, the touch events,
  // changed. A sensor that found an object ran where no_sensor does. A chat line sent during
  // the sleep ran ahead of all of them.
  //
  // Two runs in a dozen differed. In one the sensor and at_target events ran ahead of the chat
  // line: they had come up before the handler reached its sleep, and here a handler reaches its
  // sleep at once. In the other at_target and at_rot_target ran behind changed.
  it('run them in one order: timer, sensor, target, touch, changed', async () => {
    const made = await asleep('sleep tnar')
    queue(made.f, made.script, 'changed', { changes: 2 })
    touch(made.f, made.script, 0)
    made.linkset.advanceTime(1_500)
    queue(made.f, made.script, 'listen', heard('a'))
    expect(logAfterSleep(made)).toEqual(['heard a', 'timer', 'no_sensor', 'at_target', 'at_rot_target',
      'touch_start 0', 'touch 0', 'touch_end 0', 'changed 2'])
  })

  // In-world: a timer that fell due during the sleep ran behind a chat line and a link message
  // that came in after it fell due.
  it('run a timer tick behind the chat that waited', async () => {
    const made = await asleep('sleep t')
    made.linkset.advanceTime(4_000)
    queue(made.f, made.script, 'link_message', linked('m'))
    expect(logAfterSleep(made)).toEqual(['link m', 'timer'])
  })

  // In-world: clicked 2 s into an 8 s sleep; 1.5 s later the script was sent the command to
  // sleep again, which waited; a link message and a chat line were sent during that second
  // sleep. Log: end of the first sleep, the second sleep, the touch events, the link message,
  // the chat line. The touch joined the queue when the first handler ended, behind the command
  // that was waiting and ahead of what came in later.
  it('join the queue when the handler ends, ahead of what comes in later', async () => {
    const made = await asleep()
    touch(made.f, made.script, 0)
    queue(made.f, made.script, 'listen', heard('sleep'))
    made.linkset.advanceTime(9_000)
    queue(made.f, made.script, 'link_message', linked('m'))
    queue(made.f, made.script, 'listen', heard('a'))
    made.linkset.advanceTime(10_000)
    expect(made.script.global('log')).toEqual(['begin', 'end', 'begin', 'end', 'touch_start 0', 'touch 0', 'touch_end 0', 'link m', 'heard a'])
  })

  // In-world: the same with a second click, on face 2, and a chat line during the second
  // sleep -> the first click's three events, the chat line, the second click's three events.
  it('hold a new click back again during the next sleep', async () => {
    const made = await asleep()
    touch(made.f, made.script, 0)
    queue(made.f, made.script, 'listen', heard('sleep'))
    made.linkset.advanceTime(9_000)
    touch(made.f, made.script, 2)
    queue(made.f, made.script, 'listen', heard('a'))
    made.linkset.advanceTime(10_000)
    expect((made.script.global('log') as string[]).slice(4)).toEqual(['touch_start 0', 'touch 0', 'touch_end 0', 'heard a',
      'touch_start 2', 'touch 2', 'touch_end 2'])
  })

  // In-world: asleep in link_message, timer, changed and touch_end handlers in turn, then
  // clicked, sent a chat line and recoloured -> the chat line, the touch events, changed(2),
  // as from a listen handler.
  it.each([
    ['link_message', linked('z'), 'link z'],
    ['changed', { changes: 2 }, 'changed 2'],
    ['touch_end', { num_detected: 1, detected: [{ key: OWNER, name: 'owner', touchFace: 1 }] }, 'touch_end 1'],
  ])('do the same when the sleeping handler is %s', async (event, payload, line) => {
    const f = await fixture()
    const made = await make(f, probe)
    queue(f, made.script, 'listen', heard(`nap ${event}`))
    queue(f, made.script, event, payload)
    made.linkset.advanceTime(2_000)
    queue(f, made.script, 'changed', { changes: 2 })
    touch(f, made.script, 0)
    queue(f, made.script, 'listen', heard('a'))
    made.linkset.advanceTime(8_500)
    expect(made.script.global('log')).toEqual([line, 'begin', 'end', 'heard a', 'touch_start 0', 'touch 0', 'touch_end 0', 'changed 2'])
  })

  // In-world: an SLua script asleep in its listen handler was clicked on face 0, sent a chat
  // line, recoloured, sent a link message and clicked on face 2 -> the chat line, the link
  // message, touch_start reading face 0, touch and touch_end reading face 2, changed(2).
  it('do the same in SLua', async () => {
    const f = await fixture()
    const made = await make(f, `log = {}
      ll.Listen(5, "", "", "")
      LLEvents:on("listen", function(c, name, id, m)
        if m == "sleep" then ll.Sleep(10) else table.insert(log, "heard " .. m) end
      end)
      LLEvents:on("touch_start", function() table.insert(log, "touch_start " .. ll.DetectedTouchFace(1)) end)
      LLEvents:on("touch", function() table.insert(log, "touch " .. ll.DetectedTouchFace(1)) end)
      LLEvents:on("touch_end", function() table.insert(log, "touch_end " .. ll.DetectedTouchFace(1)) end)
      LLEvents:on("link_message", function(from, n, s, id) table.insert(log, "link " .. s) end)
      LLEvents:on("changed", function(c) table.insert(log, "changed " .. c) end)`, 'slua')
    made.linkset.advanceTime(0)
    queue(f, made.script, 'listen', heard('sleep'))
    made.linkset.advanceTime(2_000)
    touch(f, made.script, 0)
    queue(f, made.script, 'listen', heard('a'))
    queue(f, made.script, 'changed', { changes: 2 })
    queue(f, made.script, 'link_message', linked('m'))
    touch(f, made.script, 2)
    made.linkset.advanceTime(8_500)
    expect(made.script.global('log')).toEqual(['heard a', 'link m', 'touch_start 0', 'touch 2', 'touch_end 2', 'changed 2'])
  })

  // The tick that fell due is not queued ahead of the held events when the script already has
  // 64 events waiting. It runs once there is room, as a timer does with nothing held back.
  it('add no timer tick to a full queue', async () => {
    const made = await asleep('sleep t')
    queue(made.f, made.script, 'changed', { changes: 2 })
    for (let i = 0; i < 63; i++) queue(made.f, made.script, 'listen', heard(`${i}`))
    const log = logAfterSleep(made)
    expect(log).toHaveLength(65)
    expect(log.slice(-3)).toEqual(['heard 62', 'changed 2', 'timer'])
  })

  // A touch scheduled for a later time is not part of this sleep and takes no click in.
  it('leave a touch that is due after the sleep out of it', async () => {
    const made = await asleep()
    for (const event of ['touch_start', 'touch', 'touch_end']) made.f.world.clock.schedule(made.script, made.f.world.clock.now + 20_000, event, click(1))
    touch(made.f, made.script, 0)
    expect(logAfterSleep(made)).toEqual(['touch_start 0', 'touch 0', 'touch_end 0'])
    made.linkset.advanceTime(12_000)
    expect((made.script.global('log') as string[]).slice(5)).toEqual(['touch_start 1', 'touch 1', 'touch_end 1'])
  })

  // Touches scheduled ahead for times inside the sleep are held back and merged like those
  // that come up then, in the order of their times, also when they were scheduled before the
  // handler began.
  it.each(['before', 'during'])('hold back and merge touches scheduled %s the sleep that fall due in it', async (when) => {
    const f = await fixture()
    const made = { f, ...await make(f, probe) }
    if (when === 'during') {
      queue(f, made.script, 'listen', heard('sleep'))
      made.linkset.advanceTime(0)
    }
    const at = made.f.world.clock.now
    for (const [ms, face] of [[3_000, 4], [1_000, 1]] as const) {
      for (const event of ['touch_start', 'touch', 'touch_end']) made.f.world.clock.schedule(made.script, at + ms, event, click(face))
    }
    if (when === 'before') queue(f, made.script, 'listen', heard('sleep'))
    made.linkset.advanceTime(4_000)
    queue(made.f, made.script, 'listen', heard('a'))
    made.linkset.advanceTime(6_500)
    expect((made.script.global('log') as string[]).slice(2)).toEqual(['heard a', 'touch_start 1', 'touch 4', 'touch_end 4'])
  })

  // In-world: a 3 s timer was set as an 8 s sleep began. Clicked on face 0 and sent the command
  // to sleep again; clicked on face 2 during that second sleep. Log after it: timer, the first
  // click's events, timer, the second click's events, and the next timer 3 s later. Each sleep
  // gives one tick, released with what else was held back.
  //
  // Not modelled: with no click at all the grid still ran two ticks after the second sleep.
  // rezless gives one, as a main-grid measurement of two sleeps in a row has it (clock.test.ts,
  // "delivers one pending tick, not a burst").
  it('give one timer tick for each sleep that held something back', async () => {
    const f = await fixture()
    const made = await make(f, `list log; default {
      state_entry() { llListen(5, "", "", ""); }
      listen(integer c, string name, key id, string m) { if (m == "timer") llSetTimerEvent(3.0); llSleep(8.0); }
      touch_start(integer n) { log += "touch " + (string)llDetectedTouchFace(0); }
      timer() { log += "timer " + (string)llRound(llGetTime()); } }`)
    queue(f, made.script, 'listen', heard('timer'))
    made.linkset.advanceTime(2_000)
    queue(f, made.script, 'touch_start', click(0))
    queue(f, made.script, 'listen', heard('again'))
    made.linkset.advanceTime(8_000)
    queue(f, made.script, 'touch_start', click(2))
    made.linkset.advanceTime(9_500)
    expect(made.script.global('log')).toEqual(['timer 16', 'touch 0', 'timer 16', 'touch 2', 'timer 19'])
  })
})

// In-world: a listen handler slept 8 s three times in a row. During the sleeps a second script
// in the prim recoloured it, another object gave it a notecard with llGiveInventory, the
// avatar clicked it on a chosen face and sent it chat lines, 1.2 s apart within a sleep.
const sleeper = `list log;
  default {
    state_entry() { llListen(5, "", "", ""); }
    listen(integer c, string name, key id, string m) {
      if (llGetSubString(m, 0, 4) == "sleep") { integer i; for (i = 0; i < (integer)llGetSubString(m, 6, -1); i++) llSleep(8.0); }
      else log += "heard " + m;
    }
    changed(integer c) { log += "changed " + (string)c; }
    touch_start(integer n) { log += "touch_start " + (string)llDetectedTouchFace(0); }
    touch(integer n) { log += "touch " + (string)llDetectedTouchFace(0); }
    touch_end(integer n) { log += "touch_end " + (string)llDetectedTouchFace(0); }
  }`
const recolour = `integer n; default { link_message(integer from, integer num, string s, key id) {
  n++; llSetColor(<n % 2, (n / 2) % 2, 0.5>, ALL_SIDES); } }`

/** What the sleeper logs when each of its sleeps gets the stimuli in its entry. */
async function sleepThrough(stimuli: ReadonlyArray<ReadonlyArray<string>>) {
  const f = await fixture()
  const made = await loadLinkset({ world: f.world, region: 'home', owner: OWNER, prims: [{ scripts: [
    { name: 'main', source: { source: sleeper } },
    { name: 'helper', source: { source: recolour } },
  ] }] })
  const main = made.scripts.main!
  main.start()
  made.scripts.helper!.start()
  queue(f, main, 'listen', heard(`sleep ${stimuli.length}`))
  made.linkset.advanceTime(2_000)
  for (const sleep of stimuli) {
    for (const stimulus of sleep) {
      if (stimulus === 'colour') queue(f, made.scripts.helper!, 'link_message', linked(''))
      else if (stimulus === 'give') made.linkset.prims[0]!.addInventory(makeInventoryItem({ name: 'nc', type: InventoryType.NOTECARD }))
      else if (stimulus.startsWith('click')) touch(f, main, Number(stimulus.slice(6)))
      else queue(f, main, 'listen', heard(stimulus))
      made.linkset.advanceTime(1_200)
    }
    made.linkset.advanceTime(8_000 - 1_200 * sleep.length)
  }
  made.linkset.advanceTime(5_000)
  return main.global('log')
}

describe('a handler that sleeps several times', () => {
  // In-world: recoloured in each of three sleeps -> changed(2) twice when the handler ended.
  // Recoloured, given a notecard, recoloured -> changed(2), changed(3). Given a notecard in the
  // first of two sleeps and recoloured in the second -> changed(1), changed(2). Nothing in the
  // first sleep and a recolour in each of the other two -> changed(2) twice.
  it.each([
    ['a recolour in each of three sleeps', [['colour'], ['colour'], ['colour']], ['changed 2', 'changed 2']],
    ['a recolour, a gift and a recolour', [['colour'], ['give'], ['colour']], ['changed 2', 'changed 3']],
    ['a gift, then a recolour in the next sleep', [['give'], ['colour']], ['changed 1', 'changed 2']],
    ['nothing in the first sleep and a recolour in each other', [[], ['colour'], ['colour']], ['changed 2', 'changed 2']],
  ])('give the first sleep that holds a change its own changed event: %s', async (_, stimuli, log) => {
    expect(await sleepThrough(stimuli)).toEqual(log)
  })

  // In-world: a recolour and a chat line in each of the first two sleeps and a chat line in the
  // third -> the first chat line, changed(2), the second and third chat lines, changed(2). A
  // chat line, a recolour and a chat line, one in each sleep, ran in that order. The held
  // events of a sleep join the queue when the handler wakes from it, unless one of the same
  // kind already waits; then they wait for the end of the handler.
  it.each([
    ['recolours and chat lines', [['colour', 'x'], ['colour', 'y'], ['z']], ['heard x', 'changed 2', 'heard y', 'heard z', 'changed 2']],
    ['a chat line around a recolour', [['c'], ['colour'], ['d']], ['heard c', 'changed 2', 'heard d']],
  ])('release what a sleep held back when the handler wakes from it: %s', async (_, stimuli, log) => {
    expect(await sleepThrough(stimuli)).toEqual(log)
  })

  // In-world: recoloured in the first sleep, clicked on face 0 and sent a chat line in the
  // second, sent a chat line in the third -> changed(2), the first chat line, the touch events,
  // the second chat line. A waiting changed event keeps only other changes back.
  it('keep back only what is of a kind that already waits', async () => {
    expect(await sleepThrough([['colour'], ['click 0', 'a'], ['b']]))
      .toEqual(['changed 2', 'heard a', 'touch_start 0', 'touch 0', 'touch_end 0', 'heard b'])
  })

  // In-world: clicked on faces 0, 2 and 4, one in each sleep -> touch_start, touch and
  // touch_end on face 0, then touch_start on face 2 and touch and touch_end on face 4.
  it('merge the clicks of the later sleeps into one', async () => {
    expect(await sleepThrough([['click 0'], ['click 2'], ['click 4']]))
      .toEqual(['touch_start 0', 'touch 0', 'touch_end 0', 'touch_start 2', 'touch 4', 'touch_end 4'])
  })
})

describe('clicks by one avatar while a handler sleeps', () => {
  // In-world: three clicks, on faces 0, 2 and 4 -> one touch_start that read face 0, one touch
  // and one touch_end that read face 4. Each event had one detected avatar. With link messages
  // between the clicks the result was the same, behind the link messages.
  it('give one touch_start from the first click, and one touch and touch_end from the last', async () => {
    const made = await asleep()
    for (const face of [0, 2, 4]) {
      touch(made.f, made.script, face)
      made.linkset.advanceTime(1_500)
    }
    expect(logAfterSleep(made)).toEqual(['touch_start 0', 'touch 4', 'touch_end 4'])
  })

  // In-world: the touch_start handler of a click on face 1 slept. Clicked on faces 2 and 4 and
  // sent a chat line -> touch and touch_end of the first click, the chat line, touch_start
  // reading face 2, touch and touch_end reading face 4. The first click's events were already
  // waiting when the sleep began, so they keep their place and the later clicks merge only
  // with each other.
  it('leave a click alone whose events were waiting before the sleep', async () => {
    const f = await fixture()
    const made = await make(f, probe)
    queue(f, made.script, 'listen', heard('nap touch_start'))
    touch(f, made.script, 1)
    made.linkset.advanceTime(2_000)
    touch(f, made.script, 2)
    touch(f, made.script, 4)
    queue(f, made.script, 'listen', heard('a'))
    made.linkset.advanceTime(8_500)
    expect(made.script.global('log')).toEqual(['touch_start 1', 'begin', 'end', 'touch 1', 'touch_end 1', 'heard a',
      'touch_start 2', 'touch 4', 'touch_end 4'])
  })

  // In-world: in another run of that probe the first click's touch_end came in just after its
  // touch_start handler went to sleep. A click on face 0 and a chat line then gave touch
  // reading face 1, the chat line, and touch_end reading face 0: the second click added no
  // touch_start and no touch, and changed the touch_end that was held back.
  it('change only the touch_end when that is all that is held back', async () => {
    const f = await fixture()
    const made = await make(f, probe)
    queue(f, made.script, 'listen', heard('nap touch_start'))
    queue(f, made.script, 'touch_start', click(1))
    queue(f, made.script, 'touch', click(1))
    made.linkset.advanceTime(100)
    queue(f, made.script, 'touch_end', click(1))
    made.linkset.advanceTime(2_000)
    touch(f, made.script, 0)
    queue(f, made.script, 'listen', heard('a'))
    made.linkset.advanceTime(8_500)
    expect(made.script.global('log')).toEqual(['touch_start 1', 'begin', 'end', 'touch 1', 'heard a', 'touch_end 0'])
  })

  // In-world: recoloured, an item dropped into the prim, sat on and stood up from -> one
  // changed(35), whatever raised each change.
  it('give one changed event for changes of every kind', async () => {
    const made = await asleep()
    for (const changes of [2, 1, 32, 32]) {
      queue(made.f, made.script, 'changed', { changes })
      made.linkset.advanceTime(500)
    }
    expect(logAfterSleep(made)).toEqual(['changed 35'])
  })

  // In-world: clicked on face 0, sent 61 chat lines, clicked on face 4 -> the 61 lines,
  // touch_start reading face 0, touch and touch_end reading face 4. The first click's three
  // events and the lines made 64, the most a script can have waiting, and the second click
  // still changed the first.
  it('merge a click into the held one when 64 events are waiting', async () => {
    const made = await asleep()
    touch(made.f, made.script, 0)
    for (let i = 0; i < 61; i++) queue(made.f, made.script, 'listen', heard(`${i}`))
    touch(made.f, made.script, 4)
    expect(logAfterSleep(made).slice(61)).toEqual(['touch_start 0', 'touch 4', 'touch_end 4'])
  })

  // The limit of 64 waiting events counts a merged click once: two clicks leave room for 61 lines.
  it('count merged clicks once towards the 64 waiting events', async () => {
    const made = await asleep()
    touch(made.f, made.script, 0)
    for (let i = 0; i < 200; i++) touch(made.f, made.script, 4)
    for (let i = 0; i < 70; i++) queue(made.f, made.script, 'listen', heard(`${i}`))
    expect(made.f.world.clock.pendingEvents().filter(e => e.target === made.script)).toHaveLength(64)
    const log = logAfterSleep(made)
    expect(log).toHaveLength(64)
    expect(log.slice(60)).toEqual(['heard 60', 'touch_start 0', 'touch 4', 'touch_end 4'])
  })

  // In-world: recoloured twice -> one changed(2). Rescaled and recoloured -> one changed(10).
  it('give one changed event with every change in it', async () => {
    const f = await fixture()
    const made = await loadLinkset({ world: f.world, region: 'home', owner: OWNER, prims: [{ scripts: [
      { name: 'main', source: { source: probe } },
      { name: 'helper', source: { source: `default { link_message(integer from, integer n, string s, key id) {
          if (s == "colour") llSetColor(<0.1 * n, 0.0, 0.0>, 0); else if (s == "scale") llSetScale(<0.1 * n, 1.0, 1.0>); } }` } },
    ] }] })
    const main = made.scripts.main!
    main.start()
    made.scripts.helper!.start()
    queue(f, main, 'listen', heard('sleep'))
    made.linkset.advanceTime(2_000)
    for (const [str, num] of [['scale', 3], ['colour', 4], ['colour', 5]] as const) {
      queue(f, made.scripts.helper!, 'link_message', { sender_num: 0, num, str, id: '' })
      made.linkset.advanceTime(1_500)
    }
    made.linkset.advanceTime(4_000)
    expect((main.global('log') as string[]).slice(2)).toEqual(['changed 10'])
  })

  // A touch event queued by hand without a detected avatar names nobody, so it merges with nothing.
  it('keep touch events that name no avatar apart', async () => {
    const made = await asleep()
    for (let i = 0; i < 2; i++) queue(made.f, made.script, 'touch_start', { num_detected: 1 })
    expect(logAfterSleep(made)).toEqual(['touch_start 0', 'touch_start 0'])
  })
})

describe('events held back in an object that is taken while its handler sleeps', () => {
  // In-world: asleep, clicked on face 0, recoloured, sent a link message, taken, rezzed, sent a
  // second link message and clicked on face 2 -> end of the sleep, on_rez, both link messages,
  // touch_start reading face -1, touch and touch_end reading face 2, changed(2).
  it('run behind on_rez and the waiting events, and merge with a click on the rezzed copy', async () => {
    const made = await asleep()
    touch(made.f, made.script, 0)
    queue(made.f, made.script, 'changed', { changes: 2 })
    queue(made.f, made.script, 'link_message', linked('m1'))
    const copy = rez(made.f, take(made.linkset))
    queue(made.f, copy.script, 'link_message', linked('m2'))
    touch(made.f, copy.script, 2)
    expect(logAfterSleep(copy)).toEqual(['rez 0', 'link m1', 'link m2', 'touch_start -1', 'touch 2', 'touch_end 2', 'changed 2'])
  })

  // In-world: clicked on face 3 during the sleep, taken and rezzed -> on_rez, then touch_start,
  // touch and touch_end all reading face -1 and the owner's key.
  it('lose the face of a click that waited', async () => {
    const made = await asleep()
    touch(made.f, made.script, 3)
    expect(logAfterSleep(rez(made.f, take(made.linkset)))).toEqual(['rez 0', 'touch_start -1', 'touch -1', 'touch_end -1'])
  })

  // In-world: a touch_start handler read face 3, slept, and was taken and rezzed during the
  // sleep. After the sleep it read face -1 and still the owner's key; then on_rez ran, and the
  // click's touch and touch_end read face -1.
  it('lose the face in the touch handler that slept through the take', async () => {
    const f = await fixture()
    const made = await make(f, `list log; default {
      touch_start(integer n) { log += llDetectedTouchFace(0); llSleep(10.0); log += [llDetectedTouchFace(0), llDetectedKey(0)]; }
      touch_end(integer n) { log += ["end", llDetectedTouchFace(0)]; }
      on_rez(integer p) { log += "rez"; } }`)
    touch(f, made.script, 3)
    made.linkset.advanceTime(2_000)
    const copy = rez(f, take(made.linkset))
    copy.linkset.advanceTime(8_500)
    expect(copy.script.global('log')).toEqual([3, -1, OWNER, 'rez', 'end', -1])
  })

  // In-world: the touch_start handler of a click on face 1 slept. Sent a chat line, taken,
  // rezzed, clicked on face 2 -> end of the sleep, on_rez, touch and touch_end of the first
  // click reading face -1, the chat line, the second click's three events reading face 2.
  it('keep the place of touch events that were waiting before the sleep', async () => {
    const f = await fixture()
    const made = await make(f, probe)
    queue(f, made.script, 'listen', heard('nap touch_start'))
    touch(f, made.script, 1)
    made.linkset.advanceTime(2_000)
    queue(f, made.script, 'listen', heard('a'))
    const copy = rez(f, take(made.linkset))
    touch(f, copy.script, 2)
    copy.linkset.advanceTime(8_500)
    expect(copy.script.global('log')).toEqual(['touch_start 1', 'begin', 'end', 'rez 0', 'touch -1', 'touch_end -1', 'heard a',
      'touch_start 2', 'touch 2', 'touch_end 2'])
  })

  // In-world: worn and asleep, clicked on face 3 and sent a chat line, detached, worn again ->
  // end of the sleep, on_rez, the chat line, attach(NULL_KEY), attach(wearer), then touch_start,
  // touch and touch_end reading face -1.
  it('lose the face of a click that waited through a detach', async () => {
    const f = await fixture()
    const made = await make(f, probe)
    made.linkset.attachToAvatar(OWNER, 5)
    made.linkset.advanceTime(0)
    made.script.setGlobal('log', [])
    queue(f, made.script, 'listen', heard('sleep'))
    made.linkset.advanceTime(2_000)
    touch(f, made.script, 3)
    queue(f, made.script, 'listen', heard('a'))
    made.linkset.detachFromAvatar()
    f.world.clock.advance(5_000)
    made.linkset.attachToAvatar(OWNER, 5)
    made.linkset.advanceTime(8_500)
    expect(made.script.global('log')).toEqual(['begin', 'end', 'rez 0', 'heard a', 'attach 0', 'attach 1',
      'touch_start -1', 'touch -1', 'touch_end -1'])
  })

  // In-world: the touch_start handler of a click on face 3 slept on a worn object, which was
  // detached and worn again. After the sleep it read face -1; then on_rez, touch and touch_end
  // reading face -1, attach(NULL_KEY), attach(wearer).
  it('lose the face in the touch handler that slept through a detach', async () => {
    const f = await fixture()
    const made = await make(f, `list log; default {
      touch_start(integer n) { log += llDetectedTouchFace(0); llSleep(10.0); log += [llDetectedTouchFace(0), llDetectedKey(0)]; }
      touch_end(integer n) { log += ["end", llDetectedTouchFace(0)]; }
      on_rez(integer p) { log += "rez"; }
      attach(key id) { log += "attach"; } }`)
    made.linkset.attachToAvatar(OWNER, 5)
    made.linkset.advanceTime(0)
    made.script.setGlobal('log', [])
    touch(f, made.script, 3)
    made.linkset.advanceTime(2_000)
    made.linkset.detachFromAvatar()
    f.world.clock.advance(5_000)
    made.linkset.attachToAvatar(OWNER, 5)
    made.linkset.advanceTime(8_500)
    expect(made.script.global('log')).toEqual([3, -1, OWNER, 'rez', 'end', -1, 'attach', 'attach'])
  })

  // The same order whether the worn object's time in inventory was shorter or longer than the
  // sleep it had left (in-world it was shorter: see the attach test below).
  it.each([5_000, 20_000])('stay held back through a detach of %i ms', async (ms) => {
    const f = await fixture()
    const made = await make(f, probe)
    made.linkset.attachToAvatar(OWNER, 5)
    made.linkset.advanceTime(0)
    made.script.setGlobal('log', [])
    queue(f, made.script, 'listen', heard('sleep'))
    made.linkset.advanceTime(2_000)
    queue(f, made.script, 'changed', { changes: 2 })
    queue(f, made.script, 'listen', heard('a'))
    made.linkset.detachFromAvatar()
    f.world.clock.advance(ms)
    made.linkset.attachToAvatar(OWNER, 5)
    made.linkset.advanceTime(8_500)
    expect(made.script.global('log')).toEqual(['begin', 'end', 'rez 0', 'heard a', 'attach 0', 'attach 1', 'changed 2'])
  })

  // A seat's stand event, which a copy taken from under a sitter brings out of inventory, is a
  // changed event like the others held back in that sleep, so it carries their changes too.
  it('merge a held change into the stand event of a seat taken from under its sitter', async () => {
    const made = await asleep()
    made.f.world.sitAvatar(made.f.avatar, made.linkset.prims[0]!)
    queue(made.f, made.script, 'changed', { changes: 2 })
    expect(logAfterSleep(rez(made.f, take(made.linkset)))).toEqual(['rez 0', 'changed 34'])
  })

  it('keep that change when the seat is sat on and taken a second time', async () => {
    const made = await asleep()
    made.f.world.sitAvatar(made.f.avatar, made.linkset.prims[0]!)
    queue(made.f, made.script, 'changed', { changes: 2 })
    const first = rez(made.f, take(made.linkset))
    made.f.world.sitAvatar(made.f.avatar, first.linkset.prims[0]!)
    expect(logAfterSleep(rez(made.f, take(first.linkset)))).toEqual(['rez 0', 'rez 0', 'changed 34'])
  })
})

describe('on_rez and attach among the events waiting for a sleeping handler', () => {
  // In-world: a prim rezzed the probe with start parameter 1. Asleep, the probe was sent a link
  // message, taken back with llDerezObject(id, DEREZ_TO_INVENTORY), rezzed with parameter 2,
  // sent a second link message, taken back, rezzed with parameter 3 and sent a third. Log: end
  // of the sleep, on_rez(2), the first two link messages, on_rez(3), the third link message.
  // Taken and rezzed twice by the avatar with a link message and a chat line before, between
  // and after: on_rez, the first two pairs, on_rez, the last pair.
  it('run the first on_rez ahead of them and a later one where it came in', async () => {
    const f = await fixture()
    const saved = take((await make(f, probe)).linkset)
    const rezzer = await make(f, `key child; default {
      object_rez(key id) { child = id; }
      link_message(integer from, integer n, string s, key id) {
        if (s == "rez") llRezObject("probe", llGetPos() + <0, 0, 1>, ZERO_VECTOR, ZERO_ROTATION, n);
        else llDerezObject(child, DEREZ_TO_INVENTORY);
      }
    }`)
    rezzer.linkset.prims[0]!.addInventory(makeInventoryItem({ name: 'probe', type: InventoryType.OBJECT, key: saved.prims[0]!.key, object: saved }))
    const tell = (str: string, num = 0) => rezzer.script.fire('link_message', { sender_num: 0, num, str, id: '' })
    const rezzed = (param: number) => {
      tell('rez', param)
      return f.world.linksets.at(-1)!.allScripts()[0]!
    }
    const first = rezzed(1)
    queue(f, first, 'listen', heard('sleep'))
    rezzer.linkset.advanceTime(2_000)
    queue(f, first, 'link_message', linked('m1'))
    tell('derez')
    const second = rezzed(2)
    queue(f, second, 'link_message', linked('m2'))
    tell('derez')
    const third = rezzed(3)
    queue(f, third, 'link_message', linked('m3'))
    rezzer.linkset.advanceTime(8_500)
    expect(third.global('log')).toEqual(['rez 1', 'begin', 'end', 'rez 2', 'link m1', 'link m2', 'rez 3', 'link m3'])
  })

  // In-world: worn and asleep, the probe was granted a permission it had asked for as the
  // sleep began, sent a link message and a chat line, detached, worn again, and sent a second
  // link message and chat line. Log: end of the sleep, on_rez, run_time_permissions, the first
  // link message and chat line, attach(NULL_KEY), attach(wearer), the second link message and
  // chat line. The attach events keep the place they came in.
  it('keep attach events in the order they came', async () => {
    const f = await fixture()
    const made = await make(f, probe)
    made.linkset.attachToAvatar(OWNER, 5)
    made.linkset.advanceTime(0)
    made.script.setGlobal('log', [])
    queue(f, made.script, 'listen', heard('sleep'))
    made.linkset.advanceTime(2_000)
    queue(f, made.script, 'link_message', linked('m1'))
    queue(f, made.script, 'listen', heard('a'))
    made.linkset.detachFromAvatar()
    f.world.clock.advance(5_000)
    made.linkset.attachToAvatar(OWNER, 5)
    queue(f, made.script, 'link_message', linked('m2'))
    queue(f, made.script, 'listen', heard('b'))
    made.linkset.advanceTime(8_500)
    expect(made.script.global('log')).toEqual(['begin', 'end', 'rez 0', 'link m1', 'heard a', 'attach 0', 'attach 1', 'link m2', 'heard b'])
  })
})

describe('the timer of a copy rezzed from a detached object', () => {
  const ticker = `list log;
    default {
      state_entry() { llSetTimerEvent(10.0); }
      on_rez(integer p) { log += "rez " + (string)llRound(llGetTime()); }
      timer() { log += "timer " + (string)llRound(llGetTime()); }
    }`

  // In-world: a worn probe set a 10 s timer at llGetTime() 561.5 and was detached 3 s later.
  // After 20 s in inventory it was rezzed on the ground: on_rez at 566.6, timer at 571.5 and
  // again at 581.5. The timer fired 5 s after the rez, 10 s of the script's own time after it
  // was set. Time in inventory did not count.
  it('has the time left that the object went into inventory with', async () => {
    const f = await fixture()
    const made = await make(f, ticker)
    made.linkset.attachToAvatar(OWNER, 5)
    made.linkset.advanceTime(3_000)
    made.script.setGlobal('log', [])
    made.linkset.detachFromAvatar()
    f.world.clock.advance(20_000)
    const copy = rez(f, made.linkset.copy())
    copy.linkset.advanceTime(6_900)
    expect(copy.script.global('log')).toEqual(['rez 3'])
    copy.linkset.advanceTime(10_100)
    expect(copy.script.global('log')).toEqual(['rez 3', 'timer 10', 'timer 20'])
  })
})
