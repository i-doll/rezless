import { describe, expect, it } from 'vitest'
import { InventoryType, loadLinkset, makeInventoryItem, World } from '../src/index.js'

// Every "In-world" note below was measured on Aditi, SLua Tideland, 2026-11-23, with a Firestorm
// RLVa viewer whose avatar owned every probe object. The probe script logged every event, and
// a chat command made its listen handler spin in `while (llGetTime() < end);` (busy) or call
// llSleep (asleep) for 6 to 15 s. A second script in the prim sent link messages, a second
// object gave the probe notecards with llGiveInventory and said lines on its channel, and the
// avatar dropped notecards in, clicked faces and chatted while the handler ran.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const probe = `list log; float spin;
  default {
    state_entry() { llListen(5, "", "", ""); }
    listen(integer c, string name, key id, string m) {
      if (m == "busy") { log += "begin"; llOwnerSay("spin"); log += "end"; }
      else if (m == "sleep") { log += "begin"; llSleep(spin); log += "end"; }
      else if (llGetSubString(m, 0, 5) == "timer ") llSetTimerEvent((float)llGetSubString(m, 6, -1));
      else if (m == "sensor") llSensorRepeat("", NULL_KEY, AGENT, 20.0, PI, 2.0);
      else log += "heard " + m;
    }
    link_message(integer from, integer n, string s, key id) { log += "link " + (string)n; }
    touch_start(integer n) { log += "touch_start " + (string)llDetectedTouchFace(0); }
    touch(integer n) { log += "touch " + (string)llDetectedTouchFace(0); }
    touch_end(integer n) { log += "touch_end " + (string)llDetectedTouchFace(0); }
    changed(integer c) { log += "changed " + (string)c; }
    timer() { log += "timer"; }
    sensor(integer n) { log += "sensor"; }
  }`

const giver = `default { link_message(integer s, integer n, string m, key id) { if (m == "gift") llGiveInventory(llGetLinkKey(1), "g"); } }`
const notecard = (name: string) => makeInventoryItem({ name, type: InventoryType.NOTECARD, notecardLines: ['x'] })

async function make(ms: number) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
  const made = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [
    { scripts: [{ name: 'main', source: { source: probe } }] },
    { inventory: [notecard('g')], scripts: [{ name: 'giver', source: { source: giver } }] },
  ] })
  const script = made.scripts.main!
  for (const s of Object.values(made.scripts)) s.start()
  script.setGlobal('spin', ms / 1000)
  script.mock('llOwnerSay', (ctx) => { ctx.busy(ms); return undefined })
  const clock = world.clock
  /** Queue an event rather than fire it: fire() would wait for the handler to finish. */
  const queue = (event: string, payload: Record<string, unknown> = {}) => clock.schedule(script, clock.now, event, payload)
  const say = (msg: string) => queue('listen', { channel: 5, name: 'owner', id: OWNER, msg })
  return {
    world, linkset: made.linkset, prims: made.prims, script,
    say,
    /** Start the handler: busy or asleep for `ms`. */
    begin: (how: 'busy' | 'sleep') => { say(how); made.linkset.advanceTime(0) },
    wait: (ms: number) => made.linkset.advanceTime(ms),
    link: (n: number) => queue('link_message', { sender_num: 1, num: n, str: '', id: '' }),
    click: (face: number) => {
      const detected = [{ key: OWNER, name: 'owner', touchFace: face }]
      for (const event of ['touch_start', 'touch', 'touch_end']) queue(event, { num_detected: 1, detected })
    },
    drop: (name: string) => { made.prims[0]!.addInventory(notecard(name)) },
    gift: () => made.scripts.giver!.fire('link_message', { sender_num: 1, num: 0, str: 'gift', id: '' }),
    log: () => script.global('log') as string[],
  }
}

describe('a handler that is busy, not asleep', () => {
  it('takes the time it is busy for, and llGetTime moves on through it', async () => {
    const { script, begin, wait } = await make(10_000)
    script.mock('llOwnerSay', (ctx) => { ctx.busy(2_500); return undefined })
    const before = script.now
    begin('busy')
    expect(script.wakeAt).toBe(before + 2_500)
    expect(script.global('log')).toEqual(['begin'])
    wait(2_500)
    expect(script.global('log')).toEqual(['begin', 'end'])
    expect(script.now - before).toBe(2_500)
  })

  // In-world: two notecards dropped in 3 s apart gave changed(1) twice after the handler; three
  // drops 3 s apart also gave two. Asleep, two drops gave one.
  it.each([[2, 2], [3, 2]])('gives two changed events for %i owner drops', async (drops, events) => {
    const { begin, wait, drop, log } = await make(12_000)
    begin('busy')
    for (let i = 0; i < drops; i++) { wait(2_000); drop(`x${i}`); wait(1_000) }
    wait(12_000)
    expect(log()).toEqual(['begin', 'end', ...Array(events).fill('changed 1')])
  })

  // In-world: two llGiveInventory gifts from another object 3 s apart gave changed(1) twice;
  // asleep, they gave one.
  it('gives two changed events for two gifts, where a sleep gives one', async () => {
    for (const [how, events] of [['busy', 2], ['sleep', 1]] as const) {
      const { begin, wait, gift, log } = await make(10_000)
      begin(how)
      wait(2_000); gift(); wait(3_000); gift()
      wait(10_000)
      expect(log()).toEqual(['begin', 'end', ...Array(events).fill('changed 1')])
    }
  })

  // In-world: link messages 1 2 3 and then 1 2 ran in order after the handler, busy or asleep.
  // Chat lines from the avatar and from another object did too.
  it('keeps every link message and chat line, in order', async () => {
    const { begin, wait, link, say, log } = await make(8_000)
    begin('busy')
    wait(2_000); link(1); link(2); link(3); say('a'); wait(2_000); link(1); link(2); say('b')
    wait(8_000)
    expect(log()).toEqual(['begin', 'end', 'link 1', 'link 2', 'link 3', 'heard a', 'link 1', 'link 2', 'heard b'])
  })

  // In-world: clicks on faces 1, 2 and 3, 2 s apart, gave touch_start, touch and touch_end on
  // face 1, then touch_start on face 2 with touch and touch_end on face 3. Four clicks gave the
  // same with face 4 last. Asleep, three clicks gave touch_start on face 1 and touch and
  // touch_end on face 3.
  it('gives the first click whole and merges the later ones', async () => {
    const { begin, wait, click, log } = await make(12_000)
    begin('busy')
    for (const face of [1, 2, 3, 4]) { wait(2_000); click(face) }
    wait(12_000)
    expect(log()).toEqual(['begin', 'end', 'touch_start 1', 'touch 1', 'touch_end 1', 'touch_start 2', 'touch 4', 'touch_end 4'])
  })

  // In-world: with a 1 s timer, a 6 s busy handler was followed by two timer events at once and
  // then one a second; with a 3 s timer and 10 s, or a 2 s timer and 15 s, by two as well.
  // Asleep for 6 s, it was followed by one.
  it.each([[1, 6_000], [3, 10_000], [2, 15_000]])('gives two timer events after it, with a %i s timer', async (seconds, ms) => {
    const { begin, wait, say, log } = await make(ms)
    say(`timer ${seconds}`)
    wait(500)
    begin('busy')
    wait(ms)
    expect(log()).toEqual(['begin', 'end', 'timer', 'timer'])
    wait(seconds * 1000)
    expect(log()).toEqual(['begin', 'end', 'timer', 'timer', 'timer'])
  })

  // In-world: a 2 s repeating sensor on the avatar and a 9 s busy handler, with a link message
  // 3 s in and two more 7 s in, gave sensor, the three link messages and sensor.
  it('gives the first sensor result where it came up and the last after the others', async () => {
    const { begin, wait, link, say, log } = await make(9_000)
    say('sensor')
    wait(100)
    begin('busy')
    wait(3_000); link(1); wait(4_000); link(1); link(2)
    wait(2_000)
    expect(log()).toEqual(['begin', 'end', 'sensor', 'link 1', 'link 1', 'link 2', 'sensor'])
  })

  // In-world, with a 5 s timer: a drop, a click, the first tick, a second drop, a second click
  // and the second tick gave changed, the click, timer, changed, the second click and timer.
  // Asleep, the same gave timer, one merged click and one changed.
  it('runs the first event of each kind where it came up and the later ones after, in the order they came up', async () => {
    const { begin, wait, say, drop, click, log } = await make(12_000)
    say('timer 5')
    begin('busy')
    wait(500); drop('x1'); wait(2_000); click(1); wait(3_000); drop('x2'); wait(1_500); click(2)
    wait(5_000)
    expect(log()).toEqual(['begin', 'end', 'changed 1', 'touch_start 1', 'touch 1', 'touch_end 1', 'timer',
      'changed 1', 'touch_start 2', 'touch 2', 'touch_end 2', 'timer'])
  })

  // In-world: drops 1 s and 3 s in, a link message 5 s in, a third drop 7 s in and two link
  // messages 9 s in gave changed, the three link messages and changed. Clicks in place of the
  // drops gave the first click, the link messages and the later two clicks merged.
  it('runs the merged later events after events that came up after them', async () => {
    const { begin, wait, drop, click, link, log } = await make(13_000)
    begin('busy')
    wait(1_000); drop('x1'); wait(2_000); drop('x2'); wait(2_000); link(1); wait(2_000); drop('x3'); wait(2_000); link(1); link(2)
    wait(4_000)
    expect(log()).toEqual(['begin', 'end', 'changed 1', 'link 1', 'link 1', 'link 2', 'changed 1'])
    const touched = await make(13_000)
    touched.begin('busy')
    touched.wait(1_000); touched.click(1); touched.wait(2_000); touched.click(2); touched.wait(2_000); touched.link(1)
    touched.wait(2_000); touched.click(3); touched.wait(2_000); touched.link(1); touched.link(2)
    touched.wait(4_000)
    expect(touched.log()).toEqual(['begin', 'end', 'touch_start 1', 'touch 1', 'touch_end 1', 'link 1', 'link 1', 'link 2',
      'touch_start 2', 'touch 3', 'touch_end 3'])
  })

  // In-world: 100 link messages sent during a 6 s busy handler, or a 6 s sleep, gave link
  // messages 1 to 64. Sixty link messages, a click, a chat line and a drop gave the 60 link
  // messages, the click's three events and the chat line, and no changed.
  it('holds at most 64 events', async () => {
    const { begin, wait, link, click, say, drop, log } = await make(8_000)
    begin('busy')
    wait(2_000)
    for (let n = 1; n <= 60; n++) link(n)
    wait(1_000); click(1); say('a'); drop('x1')
    wait(8_000)
    expect(log()).toEqual(['begin', 'end', ...Array.from({ length: 60 }, (_, i) => `link ${i + 1}`),
      'touch_start 1', 'touch 1', 'touch_end 1', 'heard a'])
  })
})

// In-world: an SLua probe busy for 10 s in `while ll.GetTime() < e do end` got a drop, a second
// drop and a click, then a second click 1 s later: changed, the first click, changed and the
// second click. Asleep, it got one click and one changed.
describe('an SLua handler that is busy', () => {
  it('runs the first event of each kind where it came up and the later ones after', async () => {
    const made = await loadLinkset({ owner: OWNER, prims: [{ scripts: [{ name: 'a', language: 'slua', source: { source: `log = {}
      LLEvents:on("listen", function(c, n, id, m) table.insert(log, "begin"); ll.OwnerSay("spin"); table.insert(log, "end") end)
      LLEvents:on("changed", function(c) table.insert(log, "changed " .. c) end)
      LLEvents:on("touch_start", function(d) table.insert(log, "touch_start") end)
      LLEvents:on("touch_end", function(d) table.insert(log, "touch_end") end)
      ll.Listen(5, "", "", "")` } }] }] })
    const a = made.scripts.a!
    a.start()
    a.mock('llOwnerSay', (ctx) => { ctx.busy(10_000); return undefined })
    const clock = made.linkset.clock
    const queue = (event: string, payload: Record<string, unknown> = {}) => clock.schedule(a, clock.now, event, payload)
    const click = () => {
      const detected = [{ key: OWNER, name: 'owner', touchFace: 1 }]
      for (const event of ['touch_start', 'touch', 'touch_end']) queue(event, { num_detected: 1, detected })
    }
    queue('listen', { channel: 5, name: 'owner', id: OWNER, msg: 'busy' })
    made.linkset.advanceTime(2_000)
    made.prims[0]!.addInventory(notecard('x1'))
    made.linkset.advanceTime(2_000)
    made.prims[0]!.addInventory(notecard('x2'))
    click()
    made.linkset.advanceTime(1_000)
    click()
    made.linkset.advanceTime(6_000)
    expect(Object.values(a.global('log') as Record<string, unknown>)).toEqual(
      ['begin', 'end', 'changed 1', 'touch_start', 'touch_end', 'changed 1', 'touch_start', 'touch_end'])
  })
})

