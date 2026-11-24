import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// Every "In-world" note below was measured on Aditi, SLua Tideland, 2026-11-24, with a Firestorm
// viewer whose avatar owned a 0.5 m box on the platform and a 0.2 m physical ball. A chat command
// made the box's listen handler spin in `while (llGetTime() < end);` for 8 to 11 s. In the
// meantime the ball flew into the box at 6 m/s or dropped onto it, the box was lifted 0.35 m and
// dropped onto the platform, and a second script in the box sent link messages at set times. The
// box logged each collision event with llDetectedName(0) and its number detected.
//
// In-world, not busy: the ball flying into the box at 6, 12 or 20 m/s, or glancing off its edge,
// gave collision_start, one collision and collision_end, about 0.13 s apart. With llVolumeDetect
// on, the same passes gave collision_start and collision_end with no collision between, and so
// did the ball lying inside the box for 3 s. A volume detect contact is the only one measured
// with no collision.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BALL = { key: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'ball' }
const PLATFORM = { key: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'platform' }

const probe = `list log; float nap;
  default {
    state_entry() { llListen(5, "", "", ""); }
    listen(integer c, string name, key id, string m) { log += "begin"; llOwnerSay("spin"); log += "end"; if (nap > 0) llSleep(nap); }
    touch_start(integer n) { log += "touch_start " + (string)n; }
    touch(integer n) { log += "touch " + (string)n; }
    touch_end(integer n) { log += "touch_end " + (string)n; }
    link_message(integer from, integer n, string s, key id) { log += "link " + (string)n; }
    collision_start(integer n) { log += "collision_start " + llDetectedName(0) + " " + (string)n; }
    collision(integer n) { log += "collision " + llDetectedName(0) + " " + (string)n; }
    collision_end(integer n) { log += "collision_end " + llDetectedName(0) + " " + (string)n; }
  }`

async function make(busy: number, nap = 0) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const made = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'main', source: { source: probe } }] }] })
  const script = made.scripts.main!
  script.start()
  script.setGlobal('nap', nap / 1000)
  script.mock('llOwnerSay', (ctx) => { ctx.busy(busy); return undefined })
  made.linkset.advanceTime(0)
  const clock = world.clock
  const wait = (ms: number) => made.linkset.advanceTime(ms)
  const queue = (event: string, by: typeof BALL | null = BALL) =>
    clock.schedule(script, clock.now, event, by ? { num_detected: 1, detected: [by] } : { num_detected: 1 })
  return {
    wait, queue,
    begin: () => { clock.schedule(script, clock.now, 'listen', { channel: 5, name: 'owner', id: OWNER, msg: 'busy' }); wait(0) },
    click: () => {
      for (const event of ['touch_start', 'touch', 'touch_end']) clock.schedule(script, clock.now, event, { num_detected: 1, detected: [{ key: OWNER, name: 'owner', touchFace: 0 }] })
    },
    link: (n: number) => clock.schedule(script, clock.now, 'link_message', { sender_num: 1, num: n, str: '', id: '' }),
    /** The ball through the box with volume detect on: collision_start, then collision_end 0.13 s later. Takes 0.13 s. */
    pass: () => { queue('collision_start'); wait(130); queue('collision_end') },
    /** The ball off the box: collision_start, collision 0.02 s later, collision_end 0.13 s after it began. Takes 0.13 s. */
    hit: () => { queue('collision_start'); wait(20); queue('collision'); wait(110); queue('collision_end') },
    /** The box dropped onto the platform: collision_start, then collision every 0.13 s for 1.2 s, then collision_end. Takes 1.33 s. */
    drop: () => {
      queue('collision_start', PLATFORM)
      for (let i = 0; i < 10; i++) { wait(i ? 133 : 20); queue('collision', PLATFORM) }
      wait(113)
      queue('collision_end', PLATFORM)
    },
    log: () => script.global('log') as string[],
  }
}

describe('a contact with no collision while a handler is busy', () => {
  // In-world: a volume detect pass 1 s into an 8 s busy handler, link messages 3 s and 5 s in.
  it('runs one contact where it came up', async () => {
    const f = await make(8_000)
    f.begin()
    f.wait(1_200); f.pass(); f.wait(1_800); f.link(1); f.wait(2_000); f.link(2)
    f.wait(5_000)
    expect(f.log()).toEqual(['begin', 'end', 'collision_start ball 1', 'collision_end ball 1', 'link 1', 'link 2'])
  })

  // In-world: volume detect passes 0.5 s and 3 s into a 9 s busy handler, link messages 2 s and
  // 5 s in, gave the first pass, both link messages, then the second pass's collision_start and
  // collision_end.
  it('holds a second contact whole behind the events that came up after the first', async () => {
    const f = await make(9_000)
    f.begin()
    f.wait(700); f.pass(); f.wait(1_300); f.link(1); f.wait(1_200); f.pass(); f.wait(1_800); f.link(2)
    f.wait(6_000)
    expect(f.log()).toEqual(['begin', 'end', 'collision_start ball 1', 'collision_end ball 1', 'link 1', 'link 2',
      'collision_start ball 1', 'collision_end ball 1'])
  })

  // In-world: passes 0.5, 2.5 and 5 s into a 10 s busy handler, link messages 2, 4.5 and 7 s in,
  // gave the first pass, the three link messages, then one collision_start and one collision_end.
  it('merges the later contacts into one held collision_start and collision_end', async () => {
    const f = await make(10_000)
    f.begin()
    f.wait(700); f.pass(); f.wait(1_300); f.link(1); f.wait(700); f.pass(); f.wait(1_800); f.link(2)
    f.wait(700); f.pass(); f.wait(1_800); f.link(3)
    f.wait(5_000)
    expect(f.log()).toEqual(['begin', 'end', 'collision_start ball 1', 'collision_end ball 1', 'link 1', 'link 2', 'link 3',
      'collision_start ball 1', 'collision_end ball 1'])
  })

  // In-world: a volume detect pass 0.5 s into a 10 s busy handler, a link message 1.5 s in,
  // volume detect off, the ball dropped onto the box 3 s in and a link message 6 s in, gave the
  // pass, both link messages, then the drop's collision_start, collision and collision_end.
  it('holds a contact with a collision whole behind one with none', async () => {
    const f = await make(10_000)
    f.begin()
    f.wait(700); f.pass(); f.wait(800); f.link(1); f.wait(1_700); f.hit(); f.wait(2_800); f.link(2)
    f.wait(5_000)
    expect(f.log()).toEqual(['begin', 'end', 'collision_start ball 1', 'collision_end ball 1', 'link 1', 'link 2',
      'collision_start ball 1', 'collision ball 1', 'collision_end ball 1'])
  })

  // In-world: the ball dropped onto the box 0.5 s into an 11 s busy handler, a link message 3 s
  // in, volume detect on, a pass 4.5 s in and a link message 7 s in, gave the drop's
  // collision_start, collision and collision_end, both link messages, then the pass.
  it('holds a contact with no collision whole behind one with a collision', async () => {
    const f = await make(11_000)
    f.begin()
    f.wait(700); f.hit(); f.wait(2_300); f.link(1); f.wait(1_700); f.pass(); f.wait(2_300); f.link(2)
    f.wait(5_000)
    expect(f.log()).toEqual(['begin', 'end', 'collision_start ball 1', 'collision ball 1', 'collision_end ball 1', 'link 1', 'link 2',
      'collision_start ball 1', 'collision_end ball 1'])
  })
})

describe('a second contact while a handler is busy', () => {
  // In-world: the ball dropped onto the box 0.5 s and 4 s into a 10 s busy handler, link
  // messages 3 s and 7 s in, gave the first drop whole, both link messages, then the second
  // drop whole.
  it('holds a second brief contact whole, its collision_start too', async () => {
    const f = await make(10_000)
    f.begin()
    f.wait(700); f.hit(); f.wait(2_300); f.link(1); f.wait(1_100); f.hit(); f.wait(2_900); f.link(2)
    f.wait(5_000)
    expect(f.log()).toEqual(['begin', 'end', 'collision_start ball 1', 'collision ball 1', 'collision_end ball 1', 'link 1', 'link 2',
      'collision_start ball 1', 'collision ball 1', 'collision_end ball 1'])
  })

  // In-world, twice: the box dropped onto the platform 0.5 s into a 10 s busy handler, the ball
  // flown into it 4 s in, link messages 3.5 s and 6.5 s in, gave the platform's collision_start
  // and collision, both link messages, the ball's collision_start, then one collision and one
  // collision_end, each with 2 detected and the platform first.
  it('holds the collision_start of another object behind a held collision', async () => {
    const f = await make(10_000)
    f.begin()
    f.wait(900); f.drop(); f.wait(2_600); f.link(1); f.wait(700); f.hit(); f.wait(2_300); f.link(2)
    f.wait(5_000)
    expect(f.log()).toEqual(['begin', 'end', 'collision_start platform 1', 'collision platform 1', 'link 1', 'link 2',
      'collision_start ball 1', 'collision platform 2', 'collision_end platform 2'])
  })

  // In-world: the box dropped onto the platform 0.5 s and 4 s into an 11 s busy handler, link
  // messages 3.5 s and 7.5 s in, gave collision_start, collision, both link messages, then
  // collision and collision_end: the second drop gave no collision_start, as in #636.
  it('drops a collision_start from an object in a held collision', async () => {
    const f = await make(11_000)
    f.begin()
    f.wait(900); f.drop(); f.wait(2_600); f.link(1); f.wait(900); f.drop(); f.wait(3_100); f.link(2)
    f.wait(5_000)
    expect(f.log()).toEqual(['begin', 'end', 'collision_start platform 1', 'collision platform 1', 'link 1', 'link 2',
      'collision platform 1', 'collision_end platform 1'])
  })

  // In-world: the ball flown into the box 0.5 s into a 10 s busy handler, a link message 1.5 s
  // in, the box dropped onto the platform 2 s in and a link message 5.5 s in, gave the ball's
  // contact whole, both link messages, then the platform's collision_start, collision and
  // collision_end.
  it('holds a long contact whole behind a brief one', async () => {
    const f = await make(10_000)
    f.begin()
    f.wait(700); f.hit(); f.wait(800); f.link(1); f.wait(900); f.drop(); f.wait(3_100); f.link(2)
    f.wait(5_000)
    expect(f.log()).toEqual(['begin', 'end', 'collision_start ball 1', 'collision ball 1', 'collision_end ball 1', 'link 1', 'link 2',
      'collision_start platform 1', 'collision platform 1', 'collision_end platform 1'])
  })

  // Contacts from two objects a few milliseconds apart could not be timed in-world. They follow
  // the measured rule that a contact after the first is held whole.
  it('holds the collision of an object whose collision_start is held', async () => {
    const f = await make(8_000)
    f.begin()
    f.wait(1_000); f.queue('collision_start'); f.wait(5); f.queue('collision_start', PLATFORM); f.queue('collision', PLATFORM); f.link(1)
    f.wait(8_000)
    expect(f.log()).toEqual(['begin', 'end', 'collision_start ball 1', 'link 1', 'collision_start platform 1', 'collision platform 1'])
  })

  // A collision event with no detected objects counts as from one already in a held collision,
  // so a second drop still gives no collision_start of its own.
  it('drops a collision_start with no detected objects behind a held collision', async () => {
    const f = await make(11_000)
    f.begin()
    f.wait(900); f.drop(); f.wait(2_600); f.queue('collision_start', null); f.link(1)
    f.wait(10_000)
    expect(f.log()).toEqual(['begin', 'end', 'collision_start platform 1', 'collision platform 1', 'link 1',
      'collision platform 1', 'collision_end platform 1'])
  })

  // In-world: the box dropped onto the platform 0.5 s into an 11 s busy handler, clicks 3.1 s
  // and 3.5 s in, a link message 4.4 s in, the ball dropped onto the box 5 s in and a link
  // message 8 s in, gave collision_start and collision, the first click whole, both link
  // messages, the ball's collision_start, a collision with 2 detected, the second click and a
  // collision_end with 2 detected.
  it('runs a held click between the held collision and collision_end', async () => {
    const f = await make(11_000)
    f.begin()
    f.wait(900); f.drop(); f.wait(870); f.click(); f.wait(400); f.click(); f.wait(900); f.link(1)
    f.wait(800); f.hit(); f.wait(2_870); f.link(2)
    f.wait(5_000)
    expect(f.log()).toEqual(['begin', 'end', 'collision_start platform 1', 'collision platform 1', 'touch_start 1', 'touch 1', 'touch_end 1',
      'link 1', 'link 2', 'collision_start ball 1', 'collision platform 2', 'touch_start 1', 'touch 1', 'touch_end 1', 'collision_end platform 2'])
  })
})

describe('a contact while a handler is busy and then asleep', () => {
  // In-world: a 6 s busy part and then llSleep(6). The ball lay in the box with volume detect on
  // 0.5 s to 1.7 s in, a link message 2 s in, volume detect off, the ball dropped onto the box
  // 3 s in and a link message 4.5 s in. After the sleep: the volume detect contact, both link
  // messages, then the drop's collision_start, collision and collision_end.
  it('keeps a held contact whole through the sleep', async () => {
    const f = await make(6_000, 6_000)
    f.begin()
    f.wait(600); f.queue('collision_start'); f.wait(1_100); f.queue('collision_end'); f.wait(300); f.link(1)
    f.wait(1_000); f.hit(); f.wait(1_370); f.link(2)
    f.wait(10_000)
    expect(f.log()).toEqual(['begin', 'end', 'collision_start ball 1', 'collision_end ball 1', 'link 1', 'link 2',
      'collision_start ball 1', 'collision ball 1', 'collision_end ball 1'])
  })
})
