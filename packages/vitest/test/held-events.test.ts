import { describe, expect, it } from 'vitest'
import { loadLinkset, seedRlvInventory, World } from '../src/index.js'
import type { Linkset, Script } from '../src/index.js'

// Every "In-world" note below was measured on Aditi, SLua Tideland, 2026-11-14, with a
// Firestorm RLVa viewer whose avatar owned every probe object.
//
// The probe object held a script that logged a line from every event and around every sleep,
// and said its log when asked. A chat command put it to sleep in its listen handler for 10 s,
// with a 3 s timer set as the sleep began. A second script in the same prim made the event
// under test come up 1.5 s into the sleep, recoloured the prim at 6 s and sent a link message
// at 7.5 s; the avatar clicked the prim at 4.5 s. The link message shows where events that
// keep their place go, the timer, the click and the colour change where held events go.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

async function fixture() {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
  return { world, avatar }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

async function make(f: Fixture, source = probe) {
  const made = await loadLinkset({ world: f.world, region: 'home', owner: OWNER,
    prims: [{ scripts: [{ name: 'main', source: { source } }] }] })
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
const bumped = { num_detected: 1, detected: [{ key: OWNER, name: 'platform' }] }
const ground = { pos: { x: 1, y: 2, z: 0 } }

function touch(f: Fixture, script: Script, face: number) {
  for (const event of ['touch_start', 'touch', 'touch_end']) queue(f, script, event, click(face))
}

const probe = `list log; integer target; integer turn;
  add(string s) { if (llGetAttached()) s += " p" + (string)llGetAttached(); log += s; }
  default {
    state_entry() { llListen(5, "", "", ""); }
    listen(integer c, string name, key id, string m) {
      if (llGetSubString(m, 0, 4) == "sleep") {
        if (~llSubStringIndex(m, "t")) llSetTimerEvent(3.0);
        if (~llSubStringIndex(m, "n")) llSensorRepeat("nothing", NULL_KEY, PASSIVE, 1.0, PI, 4.0);
        add("begin"); llSleep((float)llGetSubString(m, 6, 7)); add("end");
      }
      else add("heard " + m);
    }
    link_message(integer from, integer n, string s, key id) { add("link " + s); }
    touch_start(integer n) { add("touch_start " + (string)llDetectedTouchFace(0)); }
    touch(integer n) { add("touch " + (string)llDetectedTouchFace(0)); }
    touch_end(integer n) { add("touch_end " + (string)llDetectedTouchFace(0)); }
    changed(integer c) { add("changed " + (string)c); }
    timer() { add("timer"); llSetTimerEvent(0.0); }
    no_sensor() { add("no_sensor"); }
    not_at_rot_target() { add("not_at_rot_target"); }
    collision_start(integer n) { add("collision_start"); }
    collision(integer n) { add("collision"); }
    collision_end(integer n) { add("collision_end"); }
    land_collision_start(vector p) { add("land_collision_start"); }
    land_collision(vector p) { add("land_collision"); }
    land_collision_end(vector p) { add("land_collision_end"); }
    object_rez(key id) { add("object_rez"); }
    http_request(key id, string method, string body) { add("http_request " + method); }
    on_rez(integer p) { add("rez"); }
    attach(key id) { add("attach " + (string)(id != NULL_KEY)); }
  }`

/** The run described at the top: `arrive` makes the event under test come up 1.5 s into the sleep. */
async function run(command: string, arrive: (f: Fixture, script: Script) => void) {
  const f = await fixture()
  const made = await make(f)
  queue(f, made.script, 'listen', heard(command))
  made.linkset.advanceTime(0)
  made.linkset.advanceTime(1_500)
  arrive(f, made.script)
  made.linkset.advanceTime(3_000)
  touch(f, made.script, 0)
  made.linkset.advanceTime(1_500)
  queue(f, made.script, 'changed', { changes: 2 })
  made.linkset.advanceTime(1_500)
  queue(f, made.script, 'link_message', linked('m'))
  made.linkset.advanceTime(4_000)
  return (made.script.global('log') as string[]).slice(2)
}
const held = ['touch_start 0', 'touch 0', 'touch_end 0', 'changed 2']

describe('events held back while a handler sleeps that #450 did not probe', () => {
  // In-world: the probe's own physics was switched on 1.5 s into the sleep, 20 cm above the
  // platform, and off 2.5 s later -> link message, timer, collision_start, collision, the touch
  // events, changed(2), collision_end. With a sensor that found nothing as well: timer,
  // no_sensor, then collision_start and collision. Same order in both runs.
  it('run collision_start and collision ahead of the touch events, and collision_end behind changed', async () => {
    const log = await run('sleep 10 tn', (f, script) => {
      for (const event of ['collision_start', 'collision', 'collision_end']) queue(f, script, event, bumped)
    })
    expect(log).toEqual(['link m', 'timer', 'no_sensor', 'collision_start', 'collision', ...held, 'collision_end'])
  })

  // In-world: moved to the ground 1.5 s into a sleep that was 12 s here, physical for 3 s,
  // moved back, then clicked at 9 s rather than 4.5 s -> link message, timer, land_collision_start, the touch events, changed(2),
  // land_collision, land_collision_end. Twice, the second time with a sensor that found nothing,
  // whose no_sensor ran between timer and land_collision_start.
  it('run land_collision_start ahead of the touch events, and land_collision behind changed', async () => {
    const log = await run('sleep 10 tn', (f, script) => {
      for (const event of ['land_collision_start', 'land_collision', 'land_collision_end']) queue(f, script, event, ground)
    })
    expect(log).toEqual(['link m', 'timer', 'no_sensor', 'land_collision_start', ...held, 'land_collision', 'land_collision_end'])
  })

  // In-world: a rotation target the object was at, then the prim turned 90 degrees 1.5 s into
  // the sleep -> link message, timer, not_at_rot_target, the touch events, changed(2), in three
  // runs out of four. In the other not_at_rot_target ran behind changed.
  it('run not_at_rot_target with the other target events', async () => {
    const log = await run('sleep 10 t', (f, script) => queue(f, script, 'not_at_rot_target'))
    expect(log).toEqual(['link m', 'timer', 'not_at_rot_target', ...held])
  })

  // In-world: a second script in the prim rezzed an object 1.5 s into the sleep -> object_rez,
  // then the link message, the timer, the touch events and changed(2). Another object called the
  // probe's URL 1.5 s into the sleep -> http_request, then the same. The URL_REQUEST_GRANTED
  // http_request of a URL requested as the sleep began ran in the same place.
  it.each([
    ['object_rez', { id: OWNER }, 'object_rez'],
    ['http_request', { request_id: OWNER, method: 'POST', body: 'ping' }, 'http_request POST'],
    ['http_request', { request_id: OWNER, method: 'URL_REQUEST_GRANTED', body: 'url' }, 'http_request URL_REQUEST_GRANTED'],
  ])('keep %s in the order it came', async (event, payload, line) => {
    const log = await run('sleep 10 t', (f, script) => queue(f, script, event, payload))
    expect(log).toEqual([line, 'link m', 'timer', ...held])
  })
})

describe('collision events held back by a handler that sleeps three times', () => {
  const sleeper = `list log;
    default {
      link_message(integer from, integer n, string s, key id) {
        if (s != "run") { log += "link " + s; return; }
        llSleep(6.0); llSleep(6.0); llSleep(6.0); log += "end";
      }
      collision_start(integer n) { log += "collision_start"; }
      collision(integer n) { log += "collision"; }
      collision_end(integer n) { log += "collision_end"; }
    }`

  async function sleepThrice(steps: [number, (f: Fixture, script: Script) => void][]) {
    const f = await fixture()
    const made = await make(f, sleeper)
    queue(f, made.script, 'link_message', linked('run'))
    made.linkset.advanceTime(0)
    let at = 0
    for (const [ms, step] of [...steps, [8_500, (f: Fixture, s: Script) => queue(f, s, 'link_message', linked('x'))],
      [14_000, (f: Fixture, s: Script) => queue(f, s, 'link_message', linked('y'))]].sort((a, b) => (a[0] as number) - (b[0] as number)) as typeof steps) {
      made.linkset.advanceTime(ms - at)
      at = ms
      step(f, made.script)
    }
    made.linkset.advanceTime(18_500 - at)
    return made.script.global('log')
  }
  const bump = (...events: string[]) => (f: Fixture, script: Script) => { for (const event of events) queue(f, script, event, bumped) }

  // In-world: the probe slept three times for 6 s; a second script sent link message x 8.5 s in
  // and y 14 s in. Physics on 20 cm above the platform 1.5 s in, off and moved back 4 s in ->
  // after the handler: collision_start, collision, x, collision_end, y. collision_end came up
  // in the second sleep and joined the queue at the second wake.
  it('releases the collisions of the first sleep at its wake', async () => {
    const log = await sleepThrice([[1_500, bump('collision_start', 'collision')], [7_000, bump('collision_end')]])
    expect(log).toEqual(['end', 'collision_start', 'collision', 'link x', 'collision_end', 'link y'])
  })

  // In-world: the same with a second bump from 7.5 s to 10 s (twice) -> collision_start,
  // collision, x, y, collision, collision_end. The collision of the second sleep stayed held
  // back while the first one waited, and collision_end came up in the third sleep.
  it('holds a collision of a later sleep back to the end while the one released earlier waits', async () => {
    const log = await sleepThrice([
      [1_500, bump('collision_start', 'collision')],
      [8_000, bump('collision')],
      [13_000, bump('collision_end')],
    ])
    expect(log).toEqual(['end', 'collision_start', 'collision', 'link x', 'link y', 'collision', 'collision_end'])
  })
})

describe('a repeating sensor that scans several times during one sleep', () => {
  const scanner = `list log; key mark;
    default {
      link_message(integer from, integer n, string s, key id) {
        if (s == "scan") llSensorRepeat("", id, PASSIVE, 4.0, PI, 1.0);
        log += "begin"; llSleep(10.0); log += "end";
      }
      sensor(integer n) { log += "sensor " + llDetectedName(0); }
      no_sensor() { log += "no_sensor"; }
    }`

  type Mark = { name: string; position: { x: number; y: number; z: number } }
  async function scan(steps: [number, (mark: Mark, f: Fixture, script: Script) => void][]) {
    const f = await fixture()
    const made = await make(f, scanner)
    const mark = f.world.addObject({ region: 'home', name: 'm1', position: { x: 2, y: 0, z: 0 } })
    queue(f, made.script, 'link_message', { sender_num: 0, num: 0, str: 'scan', id: mark.key })
    made.linkset.advanceTime(0)
    let at = 0
    for (const [ms, step] of steps) {
      made.linkset.advanceTime(ms - at)
      at = ms
      step(mark, f, made.script)
    }
    made.linkset.advanceTime(Math.max(10_500, at + 500) - at)
    return made.script
  }

  // In-world: the sensor's target was renamed every 2 s, m1 to m5, during the 10 s sleep ->
  // one sensor event after it, which read m5.
  it('gives one event, from the last scan', async () => {
    const script = await scan([2_000, 4_000, 6_000, 8_000].map((ms, i) => [ms + 500, (mark) => { mark.name = `m${i + 2}` }]))
    expect(script.global('log')).toEqual(['begin', 'end', 'sensor m5'])
  })

  // In-world: found as m1, then moved out of range 4 s into the sleep -> one no_sensor. Out of
  // range at first, then back in range as m2 5 s in -> one sensor event that read m2.
  it.each([
    ['found, then lost', 'm1', { x: 2, y: 0, z: 0 }, { x: 2, y: 9, z: 0 }, 'no_sensor'],
    ['lost, then found', 'm2', { x: 2, y: 9, z: 0 }, { x: 2, y: 0, z: 0 }, 'sensor m2'],
  ])('gives the last scan\'s event when the target was %s', async (_, name, first, then, line) => {
    const script = await scan([
      [0, (mark) => { mark.name = name; mark.position = first }],
      [4_500, (mark) => { mark.position = then }],
    ])
    expect(script.global('log')).toEqual(['begin', 'end', line])
  })

  // In-world: a handler that slept three times for 6 s, with a 1 s repeating sensor on an object
  // in range as m1. A second script sent link message x 8.5 s in and y 14 s in. The target was
  // moved out of range 7.5 s in (twice); renamed m2 at 7.5 s and m3 at 13.5 s; or moved out
  // of range at 7.5 s and back in range as m3 at 13 s. After the handler: sensor m1, x, y, then
  // no_sensor, sensor m3 and sensor m3. The result of the first sleep joined the queue at the
  // first wake. A result of the later sleeps stayed held back while it waited, sensor or
  // no_sensor, and the last scan replaced it.
  it.each([
    ['lost', [[7_500, (mark: Mark) => { mark.position = { x: 2, y: 9, z: 0 } }]], 'no_sensor'],
    ['renamed twice', [[7_500, (mark: Mark) => { mark.name = 'm2' }], [13_500, (mark: Mark) => { mark.name = 'm3' }]], 'sensor m3'],
    ['lost, then found again', [
      [7_500, (mark: Mark) => { mark.position = { x: 2, y: 9, z: 0 } }],
      [13_000, (mark: Mark) => { mark.position = { x: 2, y: 0, z: 0 }; mark.name = 'm3' }],
    ], 'sensor m3'],
  ] as [string, [number, (mark: Mark) => void][], string][])('gives one result per wake for a handler that sleeps three times when the target is %s', async (_, changes, line) => {
    const f = await fixture()
    const made = await make(f, `list log;
      default {
        link_message(integer from, integer n, string s, key id) {
          if (s != "scan") { log += "link " + s; return; }
          llSensorRepeat("", id, PASSIVE, 4.0, PI, 1.0);
          llSleep(6.0); llSleep(6.0); llSleep(6.0); log += "end";
        }
        sensor(integer n) { log += "sensor " + llDetectedName(0); }
        no_sensor() { log += "no_sensor"; }
      }`)
    const mark = f.world.addObject({ region: 'home', name: 'm1', position: { x: 2, y: 0, z: 0 } })
    queue(f, made.script, 'link_message', { sender_num: 0, num: 0, str: 'scan', id: mark.key })
    made.linkset.advanceTime(0)
    const steps: [number, () => void][] = [
      ...changes.map(([ms, change]): [number, () => void] => [ms, () => change(mark)]),
      [8_500, () => queue(f, made.script, 'link_message', linked('x'))],
      [14_000, () => queue(f, made.script, 'link_message', linked('y'))],
    ]
    let at = 0
    for (const [ms, step] of steps.sort((a, b) => a[0] - b[0])) {
      made.linkset.advanceTime(ms - at)
      at = ms
      step()
    }
    made.linkset.advanceTime(18_500 - at)
    expect(made.script.global('log')).toEqual(['end', 'sensor m1', 'link x', 'link y', line])
  })

  // In-world: the sensor found m1 during a 10 s sleep and the script was sent the command to
  // sleep again 3 s in. 2 s into the second sleep the target was moved out of range, or renamed
  // m2 -> after the second sleep, sensor reading m1, then no_sensor, or sensor reading m2. The
  // result released when the first sleep ended kept its place. Three runs, two of them lost.
  it.each([
    ['lost', (mark: Mark) => { mark.position = { x: 2, y: 9, z: 0 } }, 'no_sensor'],
    ['renamed', (mark: Mark) => { mark.name = 'm2' }, 'sensor m2'],
  ])('leaves the result released by an earlier sleep in its place when the target is %s', async (_, change, line) => {
    const script = await scan([
      [3_000, (mark, f, script) => queue(f, script, 'link_message', linked(''))],
      [12_000, change],
      [20_500, () => {}],
    ])
    // The scans after the second sleep follow.
    expect((script.global('log') as string[]).slice(0, 6)).toEqual(['begin', 'end', 'begin', 'end', 'sensor m1', line])
  })
})

describe('an event held back in one sleep and released into the next', () => {
  // In-world: asleep for 10 s, clicked on face 3 and sent the command to sleep 25 s. The first
  // sleep ended and the second began with the touch events waiting behind it. 2 s into the
  // second sleep it was sent a chat line, then taken, rezzed, and sent another chat line. Log
  // after the second sleep: on_rez, touch_start, touch and touch_end reading face -1, the two
  // chat lines. The released click keeps its place, as an event that waited before the sleep.
  it('keeps its place through a take, and loses its face', async () => {
    const f = await fixture()
    const made = await make(f)
    queue(f, made.script, 'listen', heard('sleep 10'))
    made.linkset.advanceTime(2_000)
    touch(f, made.script, 3)
    queue(f, made.script, 'listen', heard('sleep 25'))
    made.linkset.advanceTime(10_000)
    queue(f, made.script, 'listen', heard('a'))
    const copy = rez(f, take(made.linkset))
    queue(f, copy.script, 'listen', heard('b'))
    copy.linkset.advanceTime(25_000)
    expect((copy.script.global('log') as string[]).slice(4)).toEqual(['rez', 'touch_start -1', 'touch -1', 'touch_end -1', 'heard a', 'heard b'])
  })
})

describe('llGetAttached in a handler that slept through a detach', () => {
  // In-world: worn on the chest (1), asleep 25 s; sent a chat line, detached 3.5 s in and worn on
  // the left hand (5) 4 s later. The end of the sleep, on_rez, the chat line, attach(NULL_KEY)
  // and attach(wearer) all read 5.
  it('reads the new point everywhere after a wear on another point', async () => {
    const f = await fixture()
    const made = await make(f)
    made.linkset.attachToAvatar(OWNER, 1)
    made.linkset.advanceTime(0)
    made.script.setGlobal('log', [])
    queue(f, made.script, 'listen', heard('sleep 25'))
    made.linkset.advanceTime(2_000)
    queue(f, made.script, 'listen', heard('a'))
    made.linkset.advanceTime(1_500)
    made.linkset.detachFromAvatar()
    f.world.clock.advance(4_000)
    made.linkset.attachToAvatar(OWNER, 5)
    made.linkset.advanceTime(25_000)
    expect(made.script.global('log')).toEqual(['begin p1', 'end p5', 'rez p5', 'heard a p5', 'attach 0 p5', 'attach 1 p5'])
  })

  // In-world: the same, but rezzed on the ground instead of worn -> the end of the sleep,
  // on_rez, the chat line and attach(NULL_KEY) read 0, and no attach(wearer) came.
  it('reads 0 everywhere after a rez on the ground', async () => {
    const f = await fixture()
    const made = await make(f)
    made.linkset.attachToAvatar(OWNER, 1)
    made.linkset.advanceTime(0)
    made.script.setGlobal('log', [])
    queue(f, made.script, 'listen', heard('sleep 25'))
    made.linkset.advanceTime(2_000)
    queue(f, made.script, 'listen', heard('a'))
    made.linkset.advanceTime(1_500)
    made.linkset.detachFromAvatar()
    f.world.clock.advance(4_000)
    const ground = rez(f, made.linkset.copy())
    ground.linkset.advanceTime(25_000)
    expect(ground.script.global('log')).toEqual(['begin p1', 'end', 'rez', 'heard a', 'attach 0'])
  })
})

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
