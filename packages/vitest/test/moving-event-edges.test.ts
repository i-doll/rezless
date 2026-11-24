import { describe, expect, it } from 'vitest'
import { loadLinkset, STATUS_PHYSICS, World } from '../src/index.js'
import type { Linkset } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Moving_start
// https://wiki.secondlife.com/wiki/Moving_end
// Every "In-world" note below was measured on Aditi, SLua Tideland, 2026-11-23, with 0.5 m
// boxes above the platform whose scripts logged moving_start and moving_end with the time
// since each command.
const logger = `list log; float t0;
  add(string s) { log += s + " " + (string)llRound((llGetTime() - t0) * 10); }`
const handlers = `moving_start() { add("moving_start"); }
    moving_end() { add("moving_end"); }`
const mover = `${logger}
  up(float seconds) { llSetKeyframedMotion([<0, 0, 0.6>, seconds], [KFM_DATA, KFM_TRANSLATION]); }
  command(integer c) { llSetKeyframedMotion([], [KFM_COMMAND, c]); }
  default {
    ${handlers}
    state_entry() { llSetPrimitiveParams([PRIM_PHYSICS_SHAPE_TYPE, PRIM_PHYSICS_SHAPE_CONVEX]); }
    link_message(integer f, integer n, string m, key id) {
      t0 = llGetTime();
      if (m == "long") llSetKeyframedMotion([<0, 0, 0.6>, 4.0], [KFM_DATA, KFM_TRANSLATION]);
      else if (m == "newkf") { up(3.0); llSleep(1.0); llSetKeyframedMotion([<0, 0, -0.3>, 2.0], [KFM_DATA, KFM_TRANSLATION]); }
      else if (m == "whole") { llSetKeyframedMotion([<0, 0, 0.3>, 1.0], [KFM_DATA, KFM_TRANSLATION]); llSleep(2.5); }
      else if (m == "pp") { up(3.0); llSleep(0.5); command(KFM_CMD_PAUSE); llSleep(0.5); command(KFM_CMD_PLAY); llSleep(0.5); }
      else if (m == "ppnosleep") { up(3.0); llSleep(0.5); command(KFM_CMD_PAUSE); command(KFM_CMD_PLAY); }
      else if (m == "sp") { up(3.0); llSleep(0.5); command(KFM_CMD_STOP); llSleep(0.5); command(KFM_CMD_PLAY); llSleep(0.5); }
      else if (m == "pps") { up(4.0); llSleep(0.5); command(KFM_CMD_PAUSE); llSleep(0.5); command(KFM_CMD_PLAY); llSleep(0.5);
        command(KFM_CMD_STOP); llSleep(0.5); }
    }
  }`

async function box(source: string, x = 128, world?: World) {
  const { linkset, scripts } = await loadLinkset({ ...(world && { world, region: 'home' }),
    prims: [{ scripts: [{ name: 'main', source: { source } }] }] })
  linkset.prims[0]!.params.position = { x, y: 128, z: 100 }
  const script = scripts.main!
  script.start()
  return { linkset, script, log: () => script.global('log') as string[] }
}
const send = (b: Awaited<ReturnType<typeof box>>, m: string) =>
  b.script.fire('link_message', { sender_num: 0, num: 0, str: m, id: '' })

describe('moving events when an object is linked', () => {
  // In-world: a 4 s motion, and 1.2 s in a still box linked to it as a child -> the child's
  // script got moving_start at the link, ahead of changed(CHANGED_LINK), and moving_end
  // with the root's when the motion ended. The root's motion ran on and it got nothing new.
  it('starts a prim that joins a moving object, and ends it with the object', async () => {
    const root = await box(mover)
    const child = await box(`${logger} default { ${handlers} changed(integer c) { add("changed " + (string)c); } }`, 130)
    send(root, 'long')
    root.linkset.advanceTime(1_200)
    root.linkset.absorb(child.linkset)
    root.linkset.advanceTime(4_000)
    expect(root.log()).toEqual(['moving_start 0', 'moving_end 40'])
    expect(child.log().map((line) => line.split(' ').slice(0, -1).join(' '))).toEqual(['moving_start', 'changed 32', 'moving_end'])
  })

  // Follows the rule measured below: the link's moving_start takes away the moving_end that
  // stopping the incoming mover raised.
  it('takes away the moving_end of a mover linked into a moving object', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const root = await box(mover, 128, world)
    const child = await box(mover, 130, world)
    send(root, 'long')
    send(child, 'long')
    root.linkset.advanceTime(1_200)
    root.linkset.absorb(child.linkset)
    root.linkset.advanceTime(4_000)
    expect(child.log().map((line) => line.split(' ')[0])).toEqual(['moving_start', 'moving_start', 'moving_end'])
  })

  // The link's moving_start replaces the moving_end that stopping the incoming mover held back
  // for its sleeping script.
  it('gives a sleeping mover linked into a moving object no moving_end before the object stops', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const root = await box(mover, 128, world)
    const child = await box(mover.replace('else if (m == "newkf")', 'else if (m == "nap") { up(4.0); llSleep(2.0); }\n      else if (m == "newkf")'), 130, world)
    send(root, 'long')
    world.clock.schedule(child.script, world.clock.now, 'link_message', { sender_num: 0, num: 0, str: 'nap', id: '' })
    root.linkset.advanceTime(1_200)
    root.linkset.absorb(child.linkset)
    root.linkset.advanceTime(1_500)
    expect(child.log().map((line) => line.split(' ')[0])).toEqual(['moving_start'])
    root.linkset.advanceTime(3_000)
    expect(child.log().map((line) => line.split(' ')[0])).toEqual(['moving_start', 'moving_end'])
  })
})

// A motion that starts and comes to rest inside one sleep is in moving-event-sleeps.test.ts.
describe('moving events raised while a handler sleeps', () => {
  // In-world: a 3 s motion, and 1 s in new keyframes for 2 s from the same handler -> one
  // moving_start after the handler and one moving_end 3 s after the first call, when the
  // new keyframes ended. The motion they replaced raised no moving_end.
  it('runs on through new keyframes set while the object moves', async () => {
    const b = await box(mover)
    send(b, 'newkf')
    b.linkset.advanceTime(5_000)
    expect(b.log()).toEqual(['moving_start 10', 'moving_end 30'])
  })

  // In-world: start, pause 0.5 s in and play 0.5 s later, 0.5 s sleeps between -> moving_start
  // after the handler and moving_end when the motion ended 3.5 s in. Pause and play with no
  // sleep between them gave the same, the end 3 s in. Stop then play gave the same, the end
  // 3 s after the play.
  it.each([
    ['pp', ['moving_start 15', 'moving_end 35']],
    ['ppnosleep', ['moving_start 5', 'moving_end 30']],
    ['sp', ['moving_start 15', 'moving_end 40']],
  ])('gives the object\'s state when the handler ends: %s', async (command, expected) => {
    const b = await box(mover)
    send(b, command)
    b.linkset.advanceTime(6_000)
    expect(b.log()).toEqual(expected)
  })

  // In-world, three runs: start, pause, play and stop 0.5 s apart in one handler ->
  // moving_start and moving_end after the handler. Start and pause, and start and stop, gave
  // the same.
  it('starts and ends an object stopped in the handler that started it', async () => {
    const b = await box(mover)
    send(b, 'pps')
    b.linkset.advanceTime(6_000)
    expect(b.log()).toEqual(['moving_start 20', 'moving_end 20'])
  })
})

describe('moving events from physical motion', () => {
  // rezless does not simulate physics: the test sets the velocity a push, a fall or a stop
  // would give, and the object comes to rest when the test sets it to zero.
  const physical = `${logger}
    default {
      ${handlers}
      link_message(integer f, integer n, string m, key id) {
        t0 = llGetTime();
        if (m == "on") llSetStatus(STATUS_PHYSICS, TRUE);
        else if (m == "params") llSetPrimitiveParams([PRIM_PHYSICS, TRUE]);
        else if (m == "link") llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_PHYSICS, TRUE]);
        else if (m == "off") llSetStatus(STATUS_PHYSICS, FALSE);
      }
    }`

  // In-world: physics switched on for a box resting on the platform -> moving_start 0.04 to
  // 0.11 s later and moving_end 0.73 to 0.80 s after the call in 45 runs (Aditi, SLua Tideland,
  // 2026-11-24). Rest times of 0.2 to 30 s before the switch,
  // 0.2, 0.5 and 1 m boxes, a 0.5 m cylinder, llSetStatus and llSetPrimitiveParams, a box sunk
  // 5 mm into the platform and one left where physics had put it all gave the same. A box
  // 1 to 2 cm above the platform came to rest 0.15 to 0.26 s after the switch; 3 mm to 5 cm
  // above, it bounced, with up to five start and end pairs. Four 0.3 m drops gave moving_end
  // 1.25 to 1.33 s after physics was switched on, as llGetVel first read zero.
  // In-world: a new box's first switch took longer. Boxes a script rezzed still onto the platform,
  // switched physical 1 or 4 s later, three times with 1 s off between -> moving_end 0.86 to
  // 0.87 s after the first switch, 0.82 s after the second and 0.75 s after the third, the same in
  // all 8 runs; five boxes made in the viewer took 0.86 to 0.97 s the first time (Aditi, SLua
  // Tideland, 2026-11-24).
  it.each(['on', 'link'])('starts when physics is switched on (%s), and ends as the object rests', async (command) => {
    const b = await box(physical)
    send(b, command)
    b.linkset.advanceTime(850)
    expect(b.log()).toEqual(['moving_start 0'])
    b.linkset.advanceTime(100)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 9'])
  })

  it('settles sooner from the second switch to physical on', async () => {
    const b = await box(physical)
    send(b, 'on')
    b.linkset.advanceTime(1_000)
    send(b, 'off')
    b.linkset.advanceTime(1_000)
    send(b, 'on')
    b.linkset.advanceTime(750)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 9', 'moving_start 0'])
    b.linkset.advanceTime(100)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 9', 'moving_start 0', 'moving_end 8'])
  })

  const copyLog = (copy: Linkset) => copy.allScripts()[0]!.global('log') as string[]

  // In-world: a Duplicate of a box switched physical just before -> the original got moving_end
  // as the viewer selected it, then moving_start 0.53 to 0.69 s after the copy appeared and
  // moving_end 0.64 to 0.76 s after that. The copy got moving_start 0.01 to 0.08 s after it
  // appeared, moving_end 0.15 to 0.35 s in, moving_start 0.44 to 0.79 s in and moving_end 0.57 to
  // 0.76 s after that, 19 copies; copies made 0.14 to 0.29 s into the original's settle gave the
  // same as copies of a box at rest (Aditi, SLua Tideland, 2026-11-24).
  it('stops a physical object as a Duplicate selects it, and starts it and its copy when the viewer lets go', async () => {
    const b = await box(physical)
    send(b, 'on')
    b.linkset.advanceTime(100)
    const copy = b.linkset.duplicate({ x: 0, y: 1, z: 0 })
    b.linkset.advanceTime(1_600)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 1', 'moving_start 8', 'moving_end 15'])
    expect(copyLog(copy)).toEqual(['moving_start 0', 'moving_end 2', 'moving_start 7', 'moving_end 14'])
  })

  // In-world: a Duplicate of a physical box that had rested 10 s -> the original got moving_start
  // 0.55 to 0.58 s after the copy appeared and moving_end 0.64 to 0.71 s later; its copies as above.
  it('starts a physical object at rest and its copy when the viewer lets go of a Duplicate', async () => {
    const b = await box(physical)
    send(b, 'on')
    b.linkset.advanceTime(2_000)
    const copy = b.linkset.duplicate({ x: 0, y: 1, z: 0 })
    b.linkset.advanceTime(2_000)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 9', 'moving_start 27', 'moving_end 34'])
    expect(copyLog(copy)).toEqual(['moving_start 0', 'moving_end 2', 'moving_start 7', 'moving_end 14'])
  })

  // In-world: an impulse during the Duplicate selection did nothing (2026-11-24, see
  // physical-selection.test.ts).
  it('drops an impulse 0.3 s into the Duplicate selection', async () => {
    const b = await box(`${physical.replace('else if (m == "off")', 'else if (m == "imp") llApplyImpulse(<0, 0, 1>, FALSE);\n        else if (m == "off")')}`)
    send(b, 'on')
    b.linkset.advanceTime(2_000)
    const copy = b.linkset.duplicate({ x: 0, y: 1, z: 0 })
    b.linkset.advanceTime(300)
    send(b, 'imp')
    b.linkset.advanceTime(2_000)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 9', 'moving_start 4', 'moving_end 11'])
    expect(copyLog(copy)).toEqual(['moving_start 0', 'moving_end 2', 'moving_start 7', 'moving_end 14'])
  })

  it('leaves an object that moved and stopped during the Duplicate selection at rest', async () => {
    const b = await box(physical)
    send(b, 'on')
    b.linkset.advanceTime(2_000)
    b.linkset.duplicate({ x: 0, y: 1, z: 0 })
    b.linkset.advanceTime(100)
    b.linkset.setVelocity({ x: 0, y: 0, z: 0.5 })
    b.linkset.advanceTime(100)
    b.linkset.setVelocity({ x: 0, y: 0, z: 0 })
    b.linkset.advanceTime(2_000)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 9', 'moving_start 21', 'moving_end 23'])
  })

  it('selects an object switched off and on again during a Duplicate selection for the next Duplicate', async () => {
    const b = await box(physical)
    send(b, 'on')
    b.linkset.advanceTime(2_000)
    b.linkset.duplicate({ x: 0, y: 1, z: 0 })
    b.linkset.advanceTime(100)
    send(b, 'off')
    send(b, 'on')
    b.linkset.advanceTime(100)
    b.linkset.duplicate({ x: 0, y: 1, z: 0 })
    b.linkset.advanceTime(2_000)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 9', 'moving_start 0', 'moving_end 1', 'moving_start 8', 'moving_end 15'])
  })

  it('gives the copy of a physical object that moves no Duplicate selection', async () => {
    const b = await box(physical)
    b.linkset.setVelocity({ x: 0.5, y: 0, z: 0 })
    send(b, 'on')
    b.linkset.advanceTime(1_000)
    const copy = b.linkset.duplicate({ x: 0, y: 1, z: 0 })
    b.linkset.advanceTime(2_000)
    expect(b.log()).toEqual(['moving_start 0'])
    expect(copyLog(copy).filter((line) => line.startsWith('moving_end'))).toEqual([])
    // The copy has been physical, so its next switch settles as a later one.
    for (const m of ['off', 'on']) copy.allScripts()[0]!.fire('link_message', { sender_num: 0, num: 0, str: m, id: '' })
    copy.setVelocity({ x: 0, y: 0, z: 0 })
    copy.advanceTime(750)
    expect(copyLog(copy).filter((line) => line.startsWith('moving_end'))).toEqual(['moving_end 0'])
    copy.advanceTime(100)
    expect(copyLog(copy).filter((line) => line.startsWith('moving_end'))).toEqual(['moving_end 0', 'moving_end 8'])
  })

  // In-world: Duplicates of a box that was not physical -> neither object got an event. Switched
  // physical 1 s later, the copy got moving_end 0.91 to 0.93 s after the switch, three runs,
  // though the original had been physical many times.
  it('treats the copy of an object that is not physical as new to physics', async () => {
    const b = await box(physical)
    send(b, 'on')
    b.linkset.advanceTime(1_000)
    send(b, 'off')
    b.linkset.advanceTime(1_000)
    const copy = b.linkset.duplicate({ x: 0, y: 1, z: 0 })
    copy.advanceTime(1_000)
    expect(copyLog(copy)).toEqual([])
    copy.allScripts()[0]!.fire('link_message', { sender_num: 0, num: 0, str: 'on', id: '' })
    copy.advanceTime(850)
    expect(copyLog(copy)).toEqual(['moving_start 0'])
    copy.advanceTime(100)
    expect(copyLog(copy)).toEqual(['moving_start 0', 'moving_end 9'])
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 9'])
  })

  // In-world: a box floating at 0.04, 0.05 or 0.5 m/s for 5 to 6 s never got moving_end. At
  // 0.5 m/s, set to zero with llSetVelocity, moving_end came 0.09, 0.13 and 0.13 s later.
  it('ends a moment after the velocity becomes zero', async () => {
    const b = await box(physical)
    b.linkset.setVelocity({ x: 0.5, y: 0, z: 0 })
    send(b, 'on')
    b.linkset.advanceTime(5_000)
    expect(b.log()).toEqual(['moving_start 0'])
    b.linkset.setVelocity({ x: 0, y: 0, z: 0 })
    b.linkset.advanceTime(100)
    expect(b.log()).toEqual(['moving_start 0'])
    b.linkset.advanceTime(100)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 51'])
  })

  // In-world: a floating box at rest, given 0.5 m/s with llSetVelocity and stopped 0.6 s later
  // -> moving_start and moving_end.
  it('starts again when an object at rest gets a velocity', async () => {
    const b = await box(physical)
    send(b, 'on')
    b.linkset.advanceTime(1_000)
    b.linkset.setVelocity({ x: 0.5, y: 0, z: 0 })
    b.linkset.advanceTime(1_000)
    b.linkset.setVelocity({ x: 0, y: 0, z: 0 })
    b.linkset.advanceTime(1_000)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 9', 'moving_start 10', 'moving_end 21'])
  })

  // In-world: a box floating at 0.5 m/s whose physics was switched off -> moving_end.
  it('ends when physics is switched off while the object moves', async () => {
    const b = await box(physical)
    b.linkset.setVelocity({ x: 0.5, y: 0, z: 0 })
    send(b, 'on')
    b.linkset.advanceTime(1_000)
    send(b, 'off')
    b.linkset.advanceTime(1_000)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 0'])
    expect(b.linkset.prims[0]!.physics.velocity).toBeNull()
  })

  it('starts an object made physical without a script call when it gets a velocity', async () => {
    const b = await box(physical)
    b.linkset.prims[0]!.setStatus(STATUS_PHYSICS, true)
    b.linkset.setVelocity({ x: 0.5, y: 0, z: 0 })
    b.linkset.advanceTime(1_000)
    b.linkset.setVelocity({ x: 0, y: 0, z: 0 })
    b.linkset.advanceTime(1_000)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 11'])
  })

  it('raises nothing more when physics is switched off on an object at rest', async () => {
    const b = await box(physical)
    send(b, 'on')
    b.linkset.advanceTime(1_000)
    send(b, 'off')
    b.linkset.advanceTime(1_000)
    expect(b.log()).toEqual(['moving_start 0', 'moving_end 9'])
  })

  it('ends a copy of a moving physical object when its velocity becomes zero', async () => {
    const b = await box(physical)
    b.linkset.setVelocity({ x: 0.5, y: 0, z: 0 })
    send(b, 'on')
    b.linkset.advanceTime(1_000)
    const rezzed = b.linkset.copy().copy()
    rezzed.setVelocity({ x: 0, y: 0, z: 0 })
    rezzed.advanceTime(1_000)
    expect((rezzed.prims[0]!.scripts[0]!.global('log') as string[]).at(-1)?.split(' ')[0]).toBe('moving_end')
  })

  it('ends a copy of a moving physical object when its physics is switched off', async () => {
    const b = await box(physical)
    b.linkset.setVelocity({ x: 0.5, y: 0, z: 0 })
    send(b, 'on')
    b.linkset.advanceTime(1_000)
    const rezzed = b.linkset.copy().copy()
    rezzed.prims[0]!.scripts[0]!.fire('link_message', { sender_num: 0, num: 0, str: 'off', id: '' })
    rezzed.advanceTime(1_000)
    expect((rezzed.prims[0]!.scripts[0]!.global('log') as string[]).at(-1)?.split(' ')[0]).toBe('moving_end')
  })

  it('ends a copy taken while its object was coming to rest', async () => {
    const b = await box(physical)
    b.linkset.setVelocity({ x: 0.5, y: 0, z: 0 })
    send(b, 'on')
    b.linkset.advanceTime(1_000)
    b.linkset.setVelocity({ x: 0, y: 0, z: 0 })
    b.linkset.advanceTime(50)
    const rezzed = b.linkset.copy().copy()
    rezzed.advanceTime(1_000)
    expect((rezzed.prims[0]!.scripts[0]!.global('log') as string[]).at(-1)?.split(' ')[0]).toBe('moving_end')
  })

  it('raises nothing for a velocity set on an object that is not physical', async () => {
    const b = await box(physical)
    b.linkset.setVelocity({ x: 0.5, y: 0, z: 0 })
    b.linkset.advanceTime(500)
    b.linkset.setVelocity({ x: 0, y: 0, z: 0 })
    b.linkset.advanceTime(500)
    expect(b.log()).toEqual([])
    expect(b.linkset.prims[0]!.physics.velocity).toEqual({ x: 0, y: 0, z: 0 })
  })
})

describe('land collisions held back in one sleep', () => {
  // A second script in the box switched its physics on 1 s into a 16 s sleep, 0.6 m above the
  // ground, off again 3 s later and moved it back up; for two drops it did the same again
  // 1.5 m along. Without the sleep each drop gave land_collision_start, about 27
  // land_collision and land_collision_end, each reading where the box was.
  const sleeper = `list log;
    string at(vector p) { return (string)llRound(p.x * 10) + "/" + (string)llRound(p.z * 10); }
    default {
      link_message(integer f, integer n, string s, key id) { llSleep(16.0); log += "woke"; }
      land_collision_start(vector p) { log += "lcs " + at(p); }
      land_collision(vector p) { log += "lc " + at(p); }
      land_collision_end(vector p) { log += "lce " + at(p); }
    }`
  const ground = (x: number) => ({ pos: { x, y: 48, z: 22.25 } })

  it('reads the position when the event runs, after a second sleep', async () => {
    const b = await box(`list log;
      default {
        link_message(integer f, integer n, string s, key id) { llSleep(1.0); llSleep(1.0); }
        land_collision_start(vector p) { log += (string)llRound(p.z * 10); }
      }`, 121)
    b.linkset.clock.schedule(b.script, 0, 'link_message', { sender_num: 0, num: 0, str: '', id: '' })
    b.linkset.advanceTime(0)
    b.linkset.advanceTime(500)
    b.linkset.clock.schedule(b.script, b.linkset.clock.now, 'land_collision_start', ground(121))
    b.linkset.advanceTime(1_000)
    b.linkset.prims[0]!.params.position = { x: 121, y: 48, z: 30 }
    b.linkset.advanceTime(2_000)
    expect(b.log()).toEqual(['300'])
  })

  it('reads the position when the event runs in a copy taken between the sleeps', async () => {
    const b = await box(`list log;
      default {
        link_message(integer f, integer n, string s, key id) { llSleep(1.0); llSleep(1.0); }
        land_collision_start(vector p) { log += (string)llRound(p.z * 10); }
      }`, 121)
    b.linkset.clock.schedule(b.script, 0, 'link_message', { sender_num: 0, num: 0, str: '', id: '' })
    b.linkset.advanceTime(0)
    b.linkset.advanceTime(500)
    b.linkset.clock.schedule(b.script, b.linkset.clock.now, 'land_collision_start', ground(121))
    b.linkset.advanceTime(1_000)
    const rezzed = b.linkset.copy().copy()
    rezzed.prims[0]!.params.position = { x: 121, y: 48, z: 30 }
    rezzed.advanceTime(2_000)
    expect(rezzed.prims[0]!.scripts[0]!.global('log')).toEqual(['300'])
  })

  it.each([1, 2])('gives one start, four land_collision and one end for %i drops', async (drops) => {
    const b = await box(sleeper, 121)
    b.linkset.prims[0]!.params.position = { x: 121, y: 48, z: 22.6 }
    const queue = (event: string, x: number) => b.linkset.clock.schedule(b.script, b.linkset.clock.now, event, ground(x))
    b.linkset.clock.schedule(b.script, 0, 'link_message', { sender_num: 0, num: 0, str: 'sleep', id: '' })
    b.linkset.advanceTime(0)
    for (let drop = 0; drop < drops; drop++) {
      b.linkset.advanceTime(1_000)
      queue('land_collision_start', 121 + drop * 1.5)
      for (let i = 0; i < 27; i++) {
        b.linkset.advanceTime(44)
        queue('land_collision', 121 + drop * 1.5)
      }
      b.linkset.advanceTime(1_000)
      queue('land_collision_end', 121 + drop * 1.5)
    }
    b.linkset.advanceTime(20_000)
    // In-world: one or two drops in sleeps of 6, 10 and 16 s, six runs: one
    // land_collision_start and one land_collision_end each time, and four land_collision in
    // five runs (one in the other). Every one read the box's position when it ran, back at
    // <121, 48, 22.6>, not where it had touched down.
    const here = '1210/226'
    expect(b.log()).toEqual(['woke', `lcs ${here}`, `lc ${here}`, `lc ${here}`, `lc ${here}`, `lc ${here}`, `lce ${here}`])
  })
})
