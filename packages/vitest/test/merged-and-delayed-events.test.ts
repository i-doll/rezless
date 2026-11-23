import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// Every "In-world" note below was measured on Aditi, SLua Tideland, 2026-11-23, with a
// Firestorm RLVa viewer whose avatar owned every probe object.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PLATFORM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const BLOCK = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

async function make(source: string, before?: (world: World) => Promise<void>) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
  await before?.(world)
  const made = await loadLinkset({ world, region: 'home', owner: OWNER,
    prims: [{ scripts: [{ name: 'main', source: { source } }] }] })
  const script = made.scripts.main!
  script.start()
  return { world, linkset: made.linkset, script }
}
type Made = Awaited<ReturnType<typeof make>>

/** Queue an event rather than fire it: fire() would wait for a sleeping handler to finish. */
function queue(m: Made, event: string, payload: Record<string, unknown> = {}) {
  m.world.clock.schedule(m.script, m.world.clock.now, event, payload)
}
function run(m: Made, steps: [number, () => void][], until: number) {
  let at = 0
  for (const [ms, step] of steps) {
    m.linkset.advanceTime(ms - at)
    at = ms
    step()
  }
  m.linkset.advanceTime(until - at)
}

describe('collision events held back in one sleep', () => {
  // The probe slept 12 s in a link_message handler; a second script in the prim switched its
  // physics on 1.5 s into the sleep, 20 cm above the platform, and off again later, and
  // sent a link message once the drops were done.
  const sleeper = `list log;
    string names(integer n) {
      string s = (string)n; integer i;
      for (i = 0; i < n; i++) { vector p = llDetectedPos(i); s += " " + llDetectedName(i) + "/" + (string)llRound(p.y * 10); }
      return s;
    }
    default {
      link_message(integer f, integer n, string s, key id) {
        if (s != "run") { log += "link"; return; }
        llSleep(12.0); log += "end";
      }
      collision_start(integer n) { log += "cs " + names(n); }
      collision(integer n) { log += "c " + names(n); }
      collision_end(integer n) { log += "ce " + names(n); }
    }`
  const hit = (...what: [string, string, number][]) => ({
    num_detected: what.length,
    detected: what.map(([key, name, y]) => ({ key, name, pos: { x: 122, y, z: 1996.5 } })),
  })
  const bump = (m: Made, ...what: [string, string, number][]) => () => {
    queue(m, 'collision_start', hit(...what))
    queue(m, 'collision', hit(...what))
  }
  const leave = (m: Made, ...what: [string, string, number][]) => () => queue(m, 'collision_end', hit(...what))
  const platform: [string, string, number] = [PLATFORM, 'platform', 48]

  async function drops(steps: (m: Made) => [number, () => void][]) {
    const m = await make(sleeper)
    queue(m, 'link_message', { sender_num: 0, num: 0, str: 'run', id: '' })
    m.linkset.advanceTime(0)
    run(m, [...steps(m), [7_000, () => queue(m, 'link_message', { sender_num: 0, num: 0, str: 'mark', id: '' })]], 13_000)
    return m.script.global('log')
  }

  // In-world: dropped onto the platform from 1.5 s to 3 s and again from 5 s to 6.5 s ->
  // after the sleep, the link message, then one collision_start, one collision and one
  // collision_end, each detecting the platform once.
  it('merge two drops onto one object into one event of each kind', async () => {
    const log = await drops((m) => [
      [1_700, bump(m, platform)], [3_000, leave(m, platform)],
      [5_200, bump(m, platform)], [6_500, leave(m, platform)],
    ])
    expect(log).toEqual(['end', 'link', 'cs 1 platform/480', 'c 1 platform/480', 'ce 1 platform/480'])
  })

  // In-world: onto the platform, then onto another prim -> one of each kind listing the
  // platform, then the prim. Onto the prim twice, moved 0.2 m between the drops, then onto
  // the platform as well -> the prim first, read where it was for the second drop.
  it('list every object hit, in the order each was first hit', async () => {
    const log = await drops((m) => [
      [1_700, bump(m, platform)], [3_000, leave(m, platform)],
      [4_700, bump(m, [BLOCK, 'block', 47])], [6_000, leave(m, [BLOCK, 'block', 47])],
    ])
    expect(log).toEqual(['end', 'link', 'cs 2 platform/480 block/470', 'c 2 platform/480 block/470', 'ce 2 platform/480 block/470'])
  })

  it('keep the last entry for an object hit twice', async () => {
    const log = await drops((m) => [
      [1_700, bump(m, [BLOCK, 'block', 47])], [3_000, leave(m, [BLOCK, 'block', 47])],
      [4_700, bump(m, [BLOCK, 'block', 47.2], platform)], [6_000, leave(m, [BLOCK, 'block', 47.2], platform)],
    ])
    expect(log).toEqual(['end', 'link', 'cs 2 block/472 platform/480', 'c 2 block/472 platform/480', 'ce 2 block/472 platform/480'])
  })
})

describe('sensor results under llMinEventDelay', () => {
  // The probe set llMinEventDelay, a 1 s repeating sensor and a 16 s timer, and logged each
  // event with the whole seconds since. Its target renamed itself every second. The timer
  // removed the sensor and set the delay back to 0.
  const scanner = `list log; float t0;
    add(string s) { log += s + "@" + (string)llRound(llGetTime() - t0); }
    default {
      link_message(integer f, integer n, string s, key id) {
        t0 = llGetTime();
        llMinEventDelay((float)s);
        if (n) llSensorRepeat("m", NULL_KEY, ACTIVE | PASSIVE | SCRIPTED, 10.0, PI, 1.0);
        else llSensorRepeat("", id, ACTIVE | PASSIVE | SCRIPTED, 10.0, PI, 1.0);
        llSetTimerEvent(16.0);
        add("go");
      }
      sensor(integer n) { add("s:" + llDetectedName(0)); }
      no_sensor() { add("ns"); }
      timer() { llSensorRemove(); llSetTimerEvent(0.0); llMinEventDelay(0.0); add("stop"); }
    }`

  async function scan(delay: string, byName: boolean, name: (second: number) => string, before?: (world: World) => Promise<void>) {
    const m = await make(scanner, before)
    const mark = m.world.addObject({ region: 'home', name: name(0), position: { x: 2, y: 0, z: 0 }, scripted: true, active: true })
    queue(m, 'link_message', { sender_num: 0, num: byName ? 1 : 0, str: delay, id: mark.key })
    m.linkset.advanceTime(0)
    // Each rename lands half a second before the scan that reads it.
    run(m, Array.from({ length: 19 }, (_, i): [number, () => void] => [i * 1_000 + 500, () => { mark.name = name(i + 1) }]), 20_000)
    return m.script.global('log')
  }

  // In-world: llMinEventDelay(4.0), the target renamed m1, m2, ... every second, each scan
  // reading the name from the second before -> sensor
  // events at 4, 8 and 12 s reading m3, m7 and m11, the timer at 16 s, then a sensor event
  // with nothing detected. With no delay: one sensor event a second, m1 to m15.
  it('runs one sensor event per delay, reading the last scan', async () => {
    const log = await scan('4.0', false, (i) => `m${i - 1}`)
    expect(log).toEqual(['go@0', 's:m3@4', 's:m7@8', 's:m11@12', 'stop@16', 's:00000000-0000-0000-0000-000000000000@16'])
  })

  // In-world: llMinEventDelay(3.0), the sensor looking for "m" and the target renamed m and x
  // in turn, so the scans found it every other second -> no_sensor at 3 s, sensor at 6 s,
  // no_sensor at 9 s, sensor at 12 s, no_sensor at 15 s, the timer at 18 s, then a sensor event
  // with nothing detected. With no delay the two events took turns every second.
  it('lets the last scan replace a waiting result of the other kind', async () => {
    const log = await scan('3.0', true, (i) => (i % 2 ? 'x' : 'm'))
    expect(log).toEqual(['go@0', 'ns@3', 's:m@6', 'ns@9', 's:m@12', 'ns@15', 'stop@18', 's:00000000-0000-0000-0000-000000000000@18'])
  })

  it('runs its own timer first when another script has a timer due then too', async () => {
    const log = await scan('4.0', false, (i) => `m${i - 1}`, async (world) => {
      const made = await loadLinkset({ world, region: 'home', owner: OWNER,
        prims: [{ scripts: [{ name: 'other', source: { source: 'default { link_message(integer f, integer n, string s, key id) { llSetTimerEvent(16.0); } timer() { llSetTimerEvent(0.0); } }' } }] }] })
      const other = made.scripts.other!
      other.start()
      world.clock.schedule(other, 0, 'link_message', { sender_num: 0, num: 0, str: '', id: '' })
    })
    expect(log).toEqual(['go@0', 's:m3@4', 's:m7@8', 's:m11@12', 'stop@16', 's:00000000-0000-0000-0000-000000000000@16'])
  })

  it('leaves another script\'s earlier timer on time', async () => {
    const m = await make(`list log;
      default {
        state_entry() { llMinEventDelay(4.0); llSensorRepeat("m", NULL_KEY, ACTIVE | PASSIVE | SCRIPTED, 10.0, PI, 1.0); llSetTimerEvent(4.0); }
        sensor(integer n) { log += "sensor"; }
        timer() { log += "timer"; llSetTimerEvent(0.0); }
      }`)
    m.world.addObject({ region: 'home', name: 'm', position: { x: 2, y: 0, z: 0 }, scripted: true, active: true })
    const made = await loadLinkset({ world: m.world, region: 'home', owner: OWNER,
      prims: [{ scripts: [{ name: 'other', source: { source: 'float at; default { state_entry() { llSetTimerEvent(2.0); } timer() { at = llGetTime(); llSetTimerEvent(0.0); } }' } }] }] })
    made.scripts.other!.start()
    m.linkset.advanceTime(5_000)
    expect(made.scripts.other!.global('at')).toBeCloseTo(2, 5)
    expect(m.script.global('log')).toEqual(['timer'])
  })

  it('runs every scan with no delay', async () => {
    const log = await scan('0.0', true, (i) => (i % 2 ? 'x' : 'm')) as string[]
    expect(log.slice(0, 5)).toEqual(['go@0', 'ns@1', 's:m@2', 'ns@3', 's:m@4'])
  })
})


describe('target events while a handler sleeps', () => {
  // The probe set a target and slept 12 s in a link_message handler. A second script moved
  // the prim during the sleep, switched its physics on 20 cm above the platform for a drop,
  // and sent a link message once it was done. A target check raises a new event every few
  // frames, so the log keeps one line for a run of the same event.
  const sleeper = `list log;
    add(string s) { if (llList2String(log, -1) != s) log += s; }
    default {
      link_message(integer f, integer n, string s, key id) {
        if (s != "run" && s != "rot") { add("link"); return; }
        if (s == "run") llTarget(llGetPos() + <0.6, 0, 0>, 0.1);
        else llRotTarget(llEuler2Rot(<0, 0, PI_BY_TWO>), 0.1);
        llSleep(12.0); add("end");
      }
      at_target(integer n, vector t, vector o) { add("at"); }
      not_at_target() { add("nat"); }
      at_rot_target(integer n, rotation t, rotation o) { add("art"); }
      not_at_rot_target() { add("nart"); }
      collision_start(integer n) { add("cs"); }
      collision(integer n) { add("c"); }
      collision_end(integer n) { add("ce"); }
    }`
  const platform = { num_detected: 1, detected: [{ key: PLATFORM, name: 'platform' }] }
  const turned = { x: 0, y: 0, z: Math.SQRT1_2, s: Math.SQRT1_2 }

  async function sleep(command: string, steps: (m: Made) => [number, () => void][]) {
    const m = await make(sleeper)
    const root = m.linkset.prims[0]!
    queue(m, 'link_message', { sender_num: 0, num: 0, str: command, id: '' })
    m.linkset.advanceTime(0)
    const moves = steps(m).map(([ms, step]): [number, () => void] => [ms, step])
    run(m, [...moves, [7_000, () => queue(m, 'link_message', { sender_num: 0, num: 0, str: 'mark', id: '' })]]
      .sort((a, b) => a[0] - b[0]), 12_500)
    return { log: m.script.global('log') as string[], root }
  }
  const drop = (m: Made): [number, () => void][] => [
    [1_700, () => { queue(m, 'collision_start', platform); queue(m, 'collision', platform) }],
    [3_000, () => queue(m, 'collision_end', platform)],
  ]

  // In-world: into the target 1.5 s into the sleep and out at 4 s -> after the sleep,
  // not_at_target and no at_target. The same with a rotation target -> not_at_rot_target.
  it.each([
    ['run', (m: Made) => { m.linkset.prims[0]!.params.position = { x: 0.6, y: 0, z: 0 } }, (m: Made) => { m.linkset.prims[0]!.params.position = { x: 0, y: 0, z: 0 } }, 'nat'],
    ['rot', (m: Made) => { m.linkset.prims[0]!.params.rotation = turned }, (m: Made) => { m.linkset.prims[0]!.params.rotation = { x: 0, y: 0, z: 0, s: 1 } }, 'nart'],
  ] as [string, (m: Made) => void, (m: Made) => void, string][])('gives where the object was at the end of the sleep (%s)', async (command, into, out, line) => {
    const { log } = await sleep(command, (m) => [[1_500, () => into(m)], [4_000, () => out(m)]])
    expect(log).toEqual(['end', 'link', line])
  })

  // In-world: dropped onto the platform 1.5 s into the sleep, then moved into the target at
  // 4.5 s -> link message, at_target, collision_start, collision, then collision_end. Into the
  // target at 1.5 s, out at 3 s, then dropped at 4.5 s -> not_at_target in the same place.
  // Second Life ran another target event before collision_end, as target checks go on after
  // the sleep. The same with a rotation target gave at_rot_target and not_at_rot_target there.
  it.each([
    ['run', 'at', (m: Made): [number, () => void][] => [...drop(m), [4_500, () => { m.linkset.prims[0]!.params.position = { x: 0.6, y: 0, z: 0 } }]]],
    ['run', 'nat', (m: Made): [number, () => void][] => [
      [1_500, () => { m.linkset.prims[0]!.params.position = { x: 0.6, y: 0, z: 0 } }],
      [3_000, () => { m.linkset.prims[0]!.params.position = { x: 0, y: 0, z: 0 } }],
      ...drop(m).map(([ms, step]): [number, () => void] => [ms + 3_000, step]),
    ]],
    ['rot', 'art', (m: Made): [number, () => void][] => [...drop(m), [4_500, () => { m.linkset.prims[0]!.params.rotation = turned }]]],
    ['rot', 'nart', (m: Made): [number, () => void][] => [
      [1_500, () => { m.linkset.prims[0]!.params.rotation = turned }],
      [3_000, () => { m.linkset.prims[0]!.params.rotation = { x: 0, y: 0, z: 0, s: 1 } }],
      ...drop(m).map(([ms, step]): [number, () => void] => [ms + 3_000, step]),
    ]],
  ] as [string, string, (m: Made) => [number, () => void][]][])('runs the target event for where the object ended up ahead of the collisions (%s, %s)', async (command, line, steps) => {
    const { log } = await sleep(command, steps)
    expect(log.slice(0, 6)).toEqual(['end', 'link', line, 'cs', 'c', 'ce'])
  })
})
