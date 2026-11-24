import { describe, expect, it } from 'vitest'
import { loadLinkset, seedRlvInventory, World } from '../src/index.js'

// Every "In-world" note below was measured on Aditi, SLua Tideland, 2026-11-24, with a Firestorm
// viewer whose avatar owned the probe box. A chat command made the box's listen handler spin in
// `while (llGetTime() < end);` (busy) for 6 to 20 s, sometimes followed by llSleep. A second
// script in the box, started by a link message just before the spin, then followed a timed
// list of steps: switch physics on 0.35 m above the platform or above bare land and off again,
// move or turn the box, recolour it and send link messages. The probe logged every event.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const painter = `integer n; default { link_message(integer s, integer k, string m, key id) { if (m == "paint") llSetColor(<(float)(++n % 2), 0.5, 0>, ALL_SIDES); } }`
const PLATFORM = { num_detected: 1, detected: [{ key: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'platform' }] }
const GROUND = { pos: { x: 124, y: 52, z: 22.3 } }

const probe = `list log; float nap;
  default {
    state_entry() { llListen(5, "", "", ""); }
    listen(integer c, string name, key id, string m) {
      if (m == "busy") { log += "begin"; llOwnerSay("spin"); llSleep(nap); log += "end"; }
      else if (m == "timer") llSetTimerEvent(1.0);
      else if (m == "target") llTarget(llGetPos() + <0, 0, 1>, 0.5);
      else if (m == "gc") llRequestPermissions(llGetOwner(), PERMISSION_GAME_CONTROL);
      else if (m == "rot target") llRotTarget(llEuler2Rot(<0, 0, PI_BY_TWO>), 0.1);
    }
    link_message(integer from, integer n, string s, key id) { log += "link " + (string)n; }
    changed(integer c) { log += "changed " + (string)c; }
    touch_start(integer n) { log += "touch_start " + (string)llDetectedTouchFace(0); }
    touch(integer n) { log += "touch " + (string)llDetectedTouchFace(0); }
    touch_end(integer n) { log += "touch_end " + (string)llDetectedTouchFace(0); }
    timer() { log += "timer"; }
    collision_start(integer n) { log += "collision_start"; }
    collision(integer n) { log += "collision"; }
    collision_end(integer n) { log += "collision_end"; }
    land_collision_start(vector p) { log += "land_collision_start"; }
    land_collision(vector p) { log += "land_collision"; }
    land_collision_end(vector p) { log += "land_collision_end"; }
    at_target(integer t, vector a, vector b) { log += "at_target"; }
    not_at_target() { log += "not_at_target"; }
    at_rot_target(integer t, rotation a, rotation b) { log += "at_rot_target"; }
    not_at_rot_target() { log += "not_at_rot_target"; }
    on_rez(integer p) { log += "rez"; }
    game_control(key id, integer b, list a) { log += "game_control " + (string)b; }
  }`

async function make(busy: number, nap = 0) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
  const made = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'main', source: { source: probe } }, { name: 'painter', source: { source: painter } }] }] })
  const script = made.scripts.main!
  script.start()
  made.scripts.painter!.start()
  script.setGlobal('nap', nap / 1000)
  script.mock('llOwnerSay', (ctx) => { ctx.busy(busy); return undefined })
  made.linkset.advanceTime(0)
  const clock = world.clock
  let s = script
  let linkset = made.linkset
  /** Queue an event rather than fire it: fire() would wait for the handler to finish. */
  const queue = (event: string, payload: Record<string, unknown> = {}) => clock.schedule(s, clock.now, event, payload)
  const wait = (ms: number) => linkset.advanceTime(ms)
  const say = (msg: string) => { queue('listen', { channel: 5, name: 'owner', id: OWNER, msg }); wait(0) }
  return {
    linkset, avatar, say, wait, queue,
    script: () => s,
    link: (n: number) => queue('link_message', { sender_num: 1, num: n, str: '', id: '' }),
    paint: () => linkset.allScripts().find((x) => x.scriptName === 'painter')!.fire('link_message', { sender_num: 1, num: 0, str: 'paint', id: '' }),
    click: (face: number) => {
      const detected = [{ key: OWNER, name: 'owner', touchFace: face }]
      for (const event of ['touch_start', 'touch', 'touch_end']) queue(event, { num_detected: 1, detected })
    },
    /** A drop onto the platform as the box made it: collision_start, then collision about every 0.11 s for 1 s, then collision_end. */
    bump: () => {
      queue('collision_start', PLATFORM)
      for (let i = 0; i < 9; i++) { queue('collision', PLATFORM); wait(110) }
      wait(200)
      queue('collision_end', PLATFORM)
    },
    /** A drop onto bare land: land_collision_start, then land_collision about every 44 ms for 1.2 s, then land_collision_end. */
    land: () => {
      queue('land_collision_start', GROUND)
      for (let i = 0; i < 27; i++) { queue('land_collision', GROUND); wait(44) }
      queue('land_collision_end', GROUND)
    },
    move: (dz: number) => { const p = linkset.prims[0]!.params.position; linkset.prims[0]!.params.position = { ...p, z: p.z + dz } },
    turn: (rot: { x: number; y: number; z: number; s: number }) => { linkset.prims[0]!.params.rotation = rot },
    /** Take the box into the owner's inventory, leave it there `ms`, and rez it. */
    takeAndRez: (ms: number, copy = false) => {
      const saved = linkset.copy()
      if (!copy) linkset.remove()
      wait(ms)
      seedRlvInventory(avatar, { sharedRootId: null, entries: [{ id: `item-${ms}-${copy}`, kind: 'item', parentId: null, name: 'probe', object: saved, assetType: 'object' }] })
      const original = { script: s, linkset }
      linkset = world.attemptAvatarRez(avatar, `item-${ms}-${copy}`, { x: 120, y: 48, z: 1997 }).object!
      s = linkset.allScripts().find((x) => x.scriptName === 'main')!
      return original
    },
    log: () => s.global('log') as string[],
  }
}

describe('collisions while a handler is busy', () => {
  // In-world: a drop 1 s into a 6 to 10 s busy handler, with link messages 0.6 s, 1 s or 2 s
  // after it touched down and later, gave collision_start, collision, the link messages, then
  // collision and collision_end. Without the busy handler a drop gave collision_start, nine
  // collision and collision_end, about 1.2 s from start to end.
  it('runs the first collision_start and collision where they came up, and merges the rest of the contact behind', async () => {
    const f = await make(8_000)
    f.say('busy')
    f.wait(1_300); f.bump(); f.wait(1_200); f.link(1)
    f.wait(8_000)
    expect(f.log()).toEqual(['begin', 'end', 'collision_start', 'collision', 'link 1', 'collision', 'collision_end'])
  })

  // In-world: two drops 4 s apart, each followed by a link message, gave collision_start,
  // collision, both link messages, collision and collision_end, in three runs: the second
  // contact gave no collision_start of its own.
  it('gives a second contact no collision_start of its own', async () => {
    const f = await make(9_000)
    f.say('busy')
    f.wait(1_300); f.bump(); f.wait(500); f.link(1)
    f.wait(1_500); f.bump(); f.wait(500); f.link(2)
    f.wait(9_000)
    expect(f.log()).toEqual(['begin', 'end', 'collision_start', 'collision', 'link 1', 'link 2', 'collision', 'collision_end'])
  })

  // In-world: one contact with bare land, with link messages 2 s and 6 s in, gave
  // land_collision_start, land_collision, the first link message, land_collision_end and the
  // second link message. Two contacts with a link message after each gave
  // land_collision_start, land_collision and land_collision_end, then both link messages.
  // Without the busy handler each contact gave about 27 land_collision.
  it('runs one of each land collision event where the first came up', async () => {
    const one = await make(8_000)
    one.say('busy')
    one.wait(1_300); one.queue('land_collision_start', GROUND)
    for (let i = 0; i < 6; i++) { one.queue('land_collision', GROUND); one.wait(44) }
    one.wait(500); one.link(1); one.wait(1_500); one.queue('land_collision_end', GROUND); one.wait(2_000); one.link(2)
    one.wait(8_000)
    expect(one.log()).toEqual(['begin', 'end', 'land_collision_start', 'land_collision', 'link 1', 'land_collision_end', 'link 2'])
    const two = await make(9_000)
    two.say('busy')
    two.wait(1_300); two.land(); two.wait(500); two.link(1)
    two.wait(1_500); two.land(); two.wait(500); two.link(2)
    two.wait(9_000)
    expect(two.log()).toEqual(['begin', 'end', 'land_collision_start', 'land_collision', 'land_collision_end', 'link 1', 'link 2'])
  })
})

describe('targets while a handler is busy', () => {
  // In-world: a target 1 m above the box with a range of 0.5 m. The box moved into it 2 s into
  // a 10 s busy handler and out 4 s later, with link messages 4 s and 8 s in: not_at_target,
  // both link messages, then not_at_target about every 44 ms. Moved in and left there, with a
  // link message 5 s in: not_at_target, the link message, then at_target about every 44 ms.
  it('runs the first target event where it came up and drops the later ones', async () => {
    const crossed = await make(10_000)
    crossed.say('target')
    crossed.say('busy')
    crossed.wait(2_000); crossed.move(1); crossed.wait(2_000); crossed.link(1); crossed.wait(2_000); crossed.move(-1); crossed.wait(2_000); crossed.link(2)
    crossed.wait(2_100)
    expect(crossed.log().slice(0, 5)).toEqual(['begin', 'end', 'not_at_target', 'link 1', 'link 2'])
    expect(new Set(crossed.log().slice(5))).toEqual(new Set(['not_at_target']))
    const stayed = await make(8_000)
    stayed.say('target')
    stayed.say('busy')
    stayed.wait(2_000); stayed.move(1); stayed.wait(3_000); stayed.link(1)
    stayed.wait(3_100)
    expect(stayed.log().slice(0, 4)).toEqual(['begin', 'end', 'not_at_target', 'link 1'])
    expect(new Set(stayed.log().slice(4))).toEqual(new Set(['at_target']))
  })

  // In-world: the same with a rotation target 90 degrees round and the box turned into it and
  // back: not_at_rot_target, the link messages, then not_at_rot_target; turned and left there:
  // not_at_rot_target, the link message, then at_rot_target.
  it('does the same with a rotation target', async () => {
    const f = await make(8_000)
    f.say('rot target')
    f.say('busy')
    f.wait(2_000); f.turn({ x: 0, y: 0, z: Math.SQRT1_2, s: Math.SQRT1_2 }); f.wait(3_000); f.link(1)
    f.wait(3_100)
    expect(f.log().slice(0, 4)).toEqual(['begin', 'end', 'not_at_rot_target', 'link 1'])
    expect(new Set(f.log().slice(4))).toEqual(new Set(['at_rot_target']))
  })
})

// In-world: the box worn, holding PERMISSION_GAME_CONTROL. During a 10 s busy handler a button
// was pressed and released 0.7 s in, another 4.3 s in and an axis moved 7.4 s in, with link
// messages 3 s and 7 s in -> game_control for the first press, both link messages, then one
// game_control for the last release.
it('runs the first game_control where it came up and the later ones as one behind', async () => {
  const f = await make(10_000)
  f.linkset.attachToAvatar(OWNER, 1)
  f.say('gc')
  f.say('busy')
  const gc = (buttons: number, axes: number[] = []) => f.script().sendGameControl(OWNER, { buttons, axes })
  f.wait(700); gc(2); f.wait(600); gc(0)
  f.wait(1_700); f.link(1)
  f.wait(1_300); gc(4); f.wait(600); gc(0)
  f.wait(2_500); gc(0, [0.5]); f.wait(600); gc(0)
  f.wait(100); f.link(2)
  f.wait(3_000)
  expect(f.log()).toEqual(['begin', 'end', 'game_control 2', 'link 1', 'link 2', 'game_control 0'])
})

describe('a handler that is busy and then sleeps', () => {
  // In-world: 6 s busy, then llSleep(6). Colour changes 1 s and 3 s in (busy) and 7 s and 9 s
  // in (asleep) gave changed(2) twice. With link messages 2 s and 8 s in as well: changed, the
  // two link messages, changed. A colour change 2 s in and a link message 8 s in: changed, then
  // the link message.
  it('gives the changes in the busy part their place and holds the ones in the sleep', async () => {
    const both = await make(6_000, 6_000)
    both.say('busy')
    both.wait(1_000); both.paint(); both.wait(1_000); both.link(1); both.wait(1_000); both.paint()
    both.wait(4_000); both.paint(); both.wait(1_000); both.link(2); both.wait(1_000); both.paint()
    both.wait(4_000)
    expect(both.log()).toEqual(['begin', 'end', 'changed 2', 'link 1', 'link 2', 'changed 2'])
    const one = await make(6_000, 6_000)
    one.say('busy')
    one.wait(2_000); one.paint(); one.wait(6_000); one.link(1)
    one.wait(5_000)
    expect(one.log()).toEqual(['begin', 'end', 'changed 2', 'link 1'])
  })

  // In-world: clicks on faces 1, 2, 3 and 4 at 1.5, 3.5, 7.5 and 9.5 s gave the first click
  // whole, then touch_start face 2 with touch and touch_end on face 4. Colour changes at 1, 3
  // and 7 s with clicks at 2 and 8 s gave changed, the first click, changed and the second
  // click.
  it('merges later clicks across both parts', async () => {
    const f = await make(6_000, 6_000)
    f.say('busy')
    f.wait(1_500); f.click(1); f.wait(2_000); f.click(2); f.wait(4_000); f.click(3); f.wait(2_000); f.click(4)
    f.wait(3_000)
    expect(f.log()).toEqual(['begin', 'end', 'touch_start 1', 'touch 1', 'touch_end 1', 'touch_start 2', 'touch 4', 'touch_end 4'])
    const g = await make(6_000, 6_000)
    g.say('busy')
    g.wait(1_000); g.paint(); g.wait(1_000); g.click(1); g.wait(1_000); g.paint(); g.wait(4_000); g.paint(); g.wait(1_000); g.click(2)
    g.wait(4_000)
    expect(g.log()).toEqual(['begin', 'end', 'changed 2', 'touch_start 1', 'touch 1', 'touch_end 1', 'changed 2', 'touch_start 2', 'touch 2', 'touch_end 2'])
  })

  // In-world: a 1 s timer set 0.5 s before a handler busy for 6 s and then asleep for 6 s gave
  // two timer events at its end and the next a second later.
  it('gives two timer events after it', async () => {
    const f = await make(6_000, 6_000)
    f.say('timer')
    f.wait(500)
    f.say('busy')
    f.wait(12_000)
    expect(f.log()).toEqual(['begin', 'end', 'timer', 'timer'])
    f.wait(1_000)
    expect(f.log()).toEqual(['begin', 'end', 'timer', 'timer', 'timer'])
  })
})

describe('an object taken while a handler is busy', () => {
  // In-world: taken 3.5 s into a 20 s busy handler and rezzed about 4.5 s later. The handler
  // went on busy after the rez: it ended when llGetTime read 20 s, 24 s after it began, so the
  // time in inventory did not count. on_rez ran after it, then two colour changes made 4 s and
  // 5 s after the rez gave changed(2) twice, as a busy handler gets them.
  it('carries the handler on busy, not asleep', async () => {
    const f = await make(20_000)
    f.say('busy')
    f.wait(1_000); f.paint(); f.wait(1_000); f.paint(); f.wait(1_500)
    f.takeAndRez(4_500)
    f.wait(4_000); f.paint(); f.wait(1_000); f.paint()
    f.wait(12_000)
    expect(f.log()).toEqual(['begin', 'end', 'rez', 'changed 2', 'changed 2'])
  })

  // In-world: a copy taken 3.5 s into a 14 s busy handler and rezzed 2 s later ran the handler
  // on busy from where it was: it ended when llGetTime read 14 s, 16 s after it began. Then
  // on_rez, then two colour changes made after the rez gave changed(2) twice. The original went
  // on as it was: two colour changes before the take gave it changed(2) twice.
  it('carries the handler on busy in a copy taken with Take Copy', async () => {
    const f = await make(14_000)
    f.say('busy')
    f.wait(1_000); f.paint(); f.wait(1_000); f.paint(); f.wait(1_500)
    const original = f.takeAndRez(2_000, true)
    f.wait(2_000); f.paint(); f.wait(1_000); f.paint()
    f.wait(9_000)
    expect(f.log()).toEqual(['begin', 'end', 'rez', 'changed 2', 'changed 2'])
    expect(original.script.global('log')).toEqual(['begin', 'end', 'changed 2', 'changed 2'])
  })
})
