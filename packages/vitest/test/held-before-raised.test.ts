import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlSleep
// https://wiki.secondlife.com/wiki/LlMessageLinked
// https://wiki.secondlife.com/wiki/Changed
//
// Measured on the Aditi beta grid (SLua Tideland, Firestorm RLVa 2.4.2, 2026-11-24) with one
// probe prim per language. A chat command made the probe sleep 4 s in its listen handler, then
// call llMessageLinked(LINK_THIS) and llSetColor. During the sleep the avatar clicked the prim,
// chatted on the probe's channel, or a timer set before the sleep fell due; for the contacts the
// probe turned physics on before it slept and off when it woke, and its link_message handler
// moved it back up. Every handler said its event's name with llOwnerSay.
const LSL = `rep(string s) { llOwnerSay(s); }
  default {
    state_entry() { llListen(7710, "", NULL_KEY, ""); }
    listen(integer c, string n, key id, string m) {
      if (m == "x") { rep("listen"); return; }
      if (m == "M") llSetTimerEvent(1.0);
      llSleep(4.0);
      llMessageLinked(LINK_THIS, 1, m, "");
      llSetColor(<1.0, 0.0, 0.0>, ALL_SIDES);
      if (m == "W") llSleep(1.0);
    }
    link_message(integer s, integer num, string m, key id) { rep("lm"); }
    changed(integer c) { rep("changed " + (string)c); }
    timer() { rep("timer"); llSetTimerEvent(0.0); }
    touch_start(integer d) { rep("touch_start"); }
    touch(integer d) { rep("touch"); }
    touch_end(integer d) { rep("touch_end"); }
    collision_start(integer d) { rep("collision_start"); }
    collision(integer d) { rep("collision"); }
    collision_end(integer d) { rep("collision_end"); }
    land_collision_start(vector p) { rep("land_collision_start"); }
    land_collision(vector p) { rep("land_collision"); }
    land_collision_end(vector p) { rep("land_collision_end"); }
  }`

const SLUA = `local rep = ll.OwnerSay
  ll.Listen(7710, "", "", "")
  LLEvents:on("listen", function(c, n, id, m)
    if m == "x" then rep("listen") return end
    if m == "M" then LLTimers:once(1, function() rep("timer") end) end
    ll.Sleep(4)
    ll.MessageLinked(LINK_THIS, 1, m, "")
    ll.SetColor(vector(1, 0, 0), ALL_SIDES)
    if m == "W" then ll.Sleep(1) end
  end)
  LLEvents:on("link_message", function(s, num, m, id) rep("lm") end)
  LLEvents:on("changed", function(c) rep("changed " .. c) end)
  for _, name in { "touch_start", "touch", "touch_end", "collision_start", "collision", "collision_end" } do
    LLEvents:on(name, function(d) rep(name) end)
  end
  for _, name in { "land_collision_start", "land_collision", "land_collision_end" } do
    LLEvents:on(name, function(p) rep(name) end)
  end`

const OWNER = 'abcdefab-1234-1234-1234-abcdefabcdef'
const PLATFORM = { num_detected: 1, detected: [{ key: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'probe floor' }] }
const GROUND = { pos: { x: 116, y: 50, z: 22.06 } }

type Language = 'lsl' | 'slua'
type Probe = Awaited<ReturnType<typeof probe>>

async function probe(language: Language) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: OWNER, name: 'Test Resident', username: 'test' })
  const { linkset, scripts } = await loadLinkset({
    world, region: 'home', owner: OWNER,
    prims: [{ scripts: [{ name: 'probe', language, source: { source: language === 'lsl' ? LSL : SLUA } }] }],
  })
  const script = scripts.probe!
  linkset.startAll()
  linkset.advanceTime(1000)
  const before = script.chat.length
  const raise = (event: string, payload: Record<string, unknown> = {}) => world.clock.schedule(script, world.clock.now, event, payload)
  const say = (message: string) => raise('listen', { channel: 7710, name: 'Test Resident', id: OWNER, msg: message })
  return { linkset, script, raise, say, log: () => script.chat.slice(before).map((c) => c.text) }
}

/** Send `command`, run `during` 1.5 s into the 4 s sleep and `after` 30 ms past the wake. */
async function run(language: Language, command: string, during: (p: Probe) => void, after?: (p: Probe) => void) {
  const p = await probe(language)
  const start = p.linkset.clock.now
  p.say(command)
  p.linkset.advanceTime(1500)
  during(p)
  p.linkset.advanceTime(Math.max(0, start + 4030 - p.linkset.clock.now))
  after?.(p)
  for (let i = 0; i < 30; i++) p.linkset.advanceTime(100)
  return p.log()
}

describe.each(['lsl', 'slua'] as const)('events that came up in a sleep, then a link message and a change raised after it (%s)', (language) => {
  // In-world: a click 1.5 s into the sleep -> touch_start, touch, touch_end, link_message,
  // changed(2) (2 runs each).
  it('runs a click first', async () => {
    const log = await run(language, 'T', (p) => p.linkset.touch(1, { avatar: { key: OWNER, name: 'Test Resident' } }))
    expect(log).toEqual(['touch_start', 'touch', 'touch_end', 'lm', 'changed 2'])
  })

  // In-world: the same click with a 1 s sleep after llSetColor -> touch_start, touch, touch_end,
  // link_message, changed(2) (2 runs each).
  it('runs a click first when the handler sleeps again', async () => {
    const log = await run(language, 'W', (p) => p.linkset.touch(1, { avatar: { key: OWNER, name: 'Test Resident' } }))
    expect(log).toEqual(['touch_start', 'touch', 'touch_end', 'lm', 'changed 2'])
  })

  // In-world: the owner chatting on the channel 1.5 s into the sleep -> listen, link_message,
  // changed(2) (2 runs each).
  it('runs chat first', async () => {
    expect(await run(language, 'L', (p) => p.say('x'))).toEqual(['listen', 'lm', 'changed 2'])
  })

  // In-world: a 1 s timer set as the sleep began (LLTimers:once(1) in SLua) -> timer,
  // link_message, changed(2) (2 runs each).
  it('runs a timer tick first', async () => {
    expect(await run(language, 'M', () => {})).toEqual(['timer', 'lm', 'changed 2'])
  })

  // In-world: dropped 0.6 m onto a prim -> collision_start, collision, link_message, changed(2),
  // then collision_end once the link_message handler had moved it up (LSL 4 runs, SLua 2).
  it('runs a collision first', async () => {
    const log = await run(language, 'C', (p) => {
      p.raise('collision_start', PLATFORM)
      p.raise('collision', PLATFORM)
    }, (p) => p.raise('collision_end', PLATFORM))
    expect(log).toEqual(['collision_start', 'collision', 'lm', 'changed 2', 'collision_end'])
  })
})

describe.each(['lsl', 'slua'] as const)('a land contact that came up in a sleep (%s)', (language) => {
  // In-world: dropped 0.35 m onto land, physics off at the wake -> land_collision_start,
  // link_message, land_collision, changed(2), land_collision, land_collision_end (LSL 4 runs,
  // SLua 2). The probe logged only its first two land_collision events.
  it('runs land_collision_start first', async () => {
    const log = await run(language, 'G', (p) => {
      p.raise('land_collision_start', GROUND)
      for (let i = 0; i < 50; i++) {
        p.linkset.advanceTime(44)
        p.raise('land_collision', GROUND)
      }
    }, (p) => p.script.fire('land_collision_end', GROUND))
    let landed = 0
    const logged = log.filter((e) => e !== 'land_collision' || ++landed <= 2)
    expect(logged).toEqual(['land_collision_start', 'lm', 'land_collision', 'changed 2', 'land_collision', 'land_collision_end'])
    expect(log.at(-1)).toBe('land_collision_end')
  })
})

/**
 * A 1 s timer set before a 4 s sleep, then `total` link messages the handler sends itself after
 * the wake, with `before` and `after` the messages: what the handler said.
 */
async function fill(total: number, { before = '', after = '' } = {}) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const { linkset, scripts } = await loadLinkset({
    world, region: 'home', owner: OWNER,
    prims: [{ scripts: [{ name: 'probe', source: { source: `integer n;
      default {
        state_entry() {
          llSetTimerEvent(1.0); llSleep(4.0); ${before}
          integer i; for (i = 1; i <= ${total}; ++i) llMessageLinked(LINK_THIS, i, "", "");
          ${after}
        }
        link_message(integer s, integer num, string m, key id) { ++n; if (num == 1 || num == ${total}) llOwnerSay("lm " + (string)num); }
        changed(integer c) { llOwnerSay("changed " + (string)c); }
        timer() { llOwnerSay("timer after " + (string)n); llSetTimerEvent(0.0); }
      }` } }] }],
  })
  linkset.startAll()
  for (let i = 0; i < 80; i++) linkset.advanceTime(100)
  return scripts.probe!.chat.map((c) => c.text)
}
const COLOUR = 'llSetColor(<1.0, 0.0, 0.0>, ALL_SIDES);'
const AGAIN = 'llSleep(1.0);'

describe('a timer tick that fell due in a sleep, with the queue full after the wake', () => {
  // In-world: 63 or 64 link messages -> the timer ran first both times; all 63 messages ran after
  // it, but only 63 of the 64 (2 runs of each in LSL and SLua). The tick took the room of the
  // 64th. The same with a 1 s sleep after the messages (2 runs of each).
  it.each([[63, '', ['timer after 0', 'lm 1', 'lm 63']], [64, '', ['timer after 0', 'lm 1']], [64, AGAIN, ['timer after 0', 'lm 1']]] as const)(
    'runs first and takes the room of the last of %i link messages (then: %s)', async (total, after, expected) => {
      expect(await fill(total, { after })).toEqual(expected)
    })

  // In-world: 62 or 63 link messages, then llSetColor and a 1 s sleep -> the timer, then the
  // messages; changed(2) after 62 of them, none after 63 (2 runs of each in LSL and SLua).
  it.each([[62, ['timer after 0', 'lm 1', 'lm 62', 'changed 2']], [63, ['timer after 0', 'lm 1', 'lm 63']]] as const)(
    'takes the room of a change made after %i link messages before a second sleep', async (total, expected) => {
      expect(await fill(total, { after: COLOUR + AGAIN })).toEqual(expected)
    })

  // In-world: llSetColor, then 63 link messages, with or without a 1 s sleep after them -> the
  // timer and the 63 messages, and no changed (2 runs of each in LSL and SLua): the change came
  // up a frame after the call, behind the messages.
  it.each(['', AGAIN])('takes the room of a change made before 63 link messages (then: %s)', async (after) => {
    expect(await fill(63, { before: COLOUR, after })).toEqual(['timer after 0', 'lm 1', 'lm 63'])
  })

  // In-world: the same with llGiveInventory(llGetKey(), llGetScriptName()) in place of
  // llSetColor -> no changed either (2 runs of each). rezless raises the inventory change at the
  // call, ahead of the messages, so the 63rd message is lost instead.
  it.fails.each(['', AGAIN])('takes the room of an inventory change made before 63 link messages (then: %s)', async (after) => {
    expect(await fill(63, { before: 'llGiveInventory(llGetKey(), llGetScriptName());', after })).toEqual(['timer after 0', 'lm 1', 'lm 63'])
  })
})
