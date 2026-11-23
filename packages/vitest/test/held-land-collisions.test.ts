import { describe, expect, it } from 'vitest'
import { loadLinkset, seedRlvInventory, World } from '../src/index.js'
import type { Linkset } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Land_collision
// https://wiki.secondlife.com/wiki/Land_collision_start
// https://wiki.secondlife.com/wiki/Land_collision_end
// Every "In-world" note below was measured on Aditi, SLua Tideland, 2026-11-23. A 0.5 m box held
// two scripts. One slept when told to by a link message and logged what ran after its wake. The
// other switched the box's physics on 0.6 m above bare land, off again a set time later and moved
// it back up, and logged the land collisions it got while running, about one every 44 ms.
const sleeper = `list log; integer reset;
  default {
    link_message(integer f, integer n, string s, key id) {
      if (s == "sleep") { llSleep(n / 1000.0); log += "woke"; }
      else if (s == "sleep reset") { reset = 1; llSleep(n / 1000.0); log += "woke"; }
      else if (s == "twice") { llSleep(n / 1000.0); log += "woke"; llSleep(10.0); log += "woke2"; }
      else if (s == "sleep stop") { llSleep(n / 1000.0); log += "woke"; llMessageLinked(LINK_THIS, 0, "stop", ""); }
      else if (s == "nap") { log += "link"; llSleep(0.1); }
      else log += "link";
    }
    collision_start(integer n) { log += "cs"; }
    collision(integer n) { log += "c"; }
    collision_end(integer n) { log += "ce"; }
    land_collision_start(vector p) { log += "lcs"; }
    land_collision(vector p) { log += "lc"; if (reset) llResetScript(); }
    land_collision_end(vector p) { log += "lce"; }
    on_rez(integer p) { log += "rez"; }
  }`

const ground = { pos: { x: 124, y: 52, z: 22.31 } }
const ramp = { num_detected: 1, detected: [{ key: '99999999-9999-4999-8999-999999999999', name: 'ramp' }] }

const stopper = `default {
    link_message(integer f, integer n, string s, key id) { if (s == "stop") llSetScriptState("sleeper", FALSE); }
  }`

const OWNER = 'abcdefab-1111-1111-1111-111111111111'

async function box() {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner.resident' })
  const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'sleeper', source: { source: sleeper } }, { name: 'stopper', source: { source: stopper } }] }] })
  scripts.stopper!.start()
  const script = scripts.sleeper!
  script.start()
  linkset.advanceTime(0)
  const at = (event: string, payload: Record<string, unknown> = ground) => linkset.clock.schedule(script, linkset.clock.now, event, payload)
  const link = (str: string, num = 0) => at('link_message', { sender_num: 0, num, str, id: '' })
  /** Take the object into the owner's inventory and rez it; the copy's log. */
  const takeAndRez = (ms: number) => {
    const saved = linkset.copy()
    linkset.remove()
    seedRlvInventory(avatar, { sharedRootId: null, entries: [{ id: 'item', kind: 'item', parentId: null, name: 'probe', object: saved, assetType: 'object' }] })
    const object = world.attemptAvatarRez(avatar, 'item', { x: 124, y: 52, z: 22.9 }).object!
    object.advanceTime(ms)
    return object.prims[0]!.scripts[0]!.global('log') as string[]
  }
  return { linkset, script, at, link, takeAndRez, log: () => script.global('log') as string[] }
}

/** One contact: land_collision_start, `count` land_collision 44 ms apart, then land_collision_end unless `ends` is false. */
function contact(f: { linkset: Linkset; at: (event: string) => void }, count: number, ends = true) {
  f.at('land_collision_start')
  for (let i = 0; i < count; i++) {
    f.linkset.advanceTime(44)
    f.at('land_collision')
  }
  if (!ends) return
  f.linkset.advanceTime(44)
  f.at('land_collision_end')
}

const landed = (log: string[]) => log.filter((e) => e === 'lc').length

describe('land_collision held through a sleep', () => {
  // In-world: contacts of 0.04 to 6 s, giving 5 to 29 land_collision to the running script, held in
  // sleeps of 6, 10 and 16 s, and three contacts in one 16 s sleep -> one land_collision_start,
  // four land_collision and one land_collision_end each time.
  it.each([[1, 5], [1, 29], [3, 26]])('gives four for %i contacts of %i', async (contacts, count) => {
    const f = await box()
    f.link('sleep', 16_000)
    f.linkset.advanceTime(0)
    for (let i = 0; i < contacts; i++) {
      f.linkset.advanceTime(1_000)
      contact(f, count)
    }
    f.linkset.advanceTime(20_000)
    expect(f.log()).toEqual(['woke', 'lcs', 'lc', 'lc', 'lc', 'lc', 'lce'])
  })

  // In-world: link messages sent during an 8 s or 6 s sleep, after the contact, ran first after
  // the wake. Then land_collision_start, and 4, 4, 3, 3, 2 and 1 land_collision for 0, 1, 2, 3, 4
  // and 6 link messages.
  it.each([[0, 4], [1, 4], [2, 3], [3, 3], [4, 2], [6, 1]])('gives fewer after %i events that ran first: %i', async (links, kept) => {
    const f = await box()
    f.link('sleep', 6_000)
    f.linkset.advanceTime(1_500)
    contact(f, 26)
    for (let i = 0; i < links; i++) f.link('x')
    f.linkset.advanceTime(10_000)
    expect(f.log()).toEqual(['woke', ...Array(links).fill('link'), 'lcs', ...Array(kept).fill('lc'), 'lce'])
  })

  // In-world: the same with link_message handlers that slept 0.1 s: 3, 2, 1 and 1 land_collision
  // for 1, 2, 3 and 6 of them.
  it.each([[1, 3], [2, 2], [3, 1], [6, 1]])('counts a handler that sleeps ahead of them twice: %i give %i', async (naps, kept) => {
    const f = await box()
    f.link('sleep', 6_000)
    f.linkset.advanceTime(1_500)
    contact(f, 26)
    for (let i = 0; i < naps; i++) f.link('nap')
    f.linkset.advanceTime(10_000)
    expect(f.log()).toEqual(['woke', ...Array(naps).fill('link'), 'lcs', ...Array(kept).fill('lc'), 'lce'])
  })

  // In-world: sleeps that ended while the box still lay on the land, 0.64 and 0.24 s after it came
  // down, with the contact going on 0.55 and 0.96 s more -> land_collision_start at the wake, then
  // land_collision as the running script got them, but one fewer: 11 against its 12 and 20 against
  // its 21. The sleeper's land_collision_end came a frame before the running script's.
  it.each([[12], [21]])('gives the land_collision of a contact that goes on past the wake as they come: %i', async (after) => {
    const f = await box()
    f.link('sleep', 2_000)
    f.linkset.advanceTime(1_500)
    contact(f, 6, false)
    f.linkset.advanceTime(2_000 - f.linkset.clock.now)
    for (let i = 0; i < after; i++) {
      f.linkset.advanceTime(44)
      f.at('land_collision')
    }
    f.linkset.advanceTime(44)
    f.at('land_collision_end')
    f.linkset.advanceTime(1_000)
    expect(f.log().slice(0, 2)).toEqual(['woke', 'lcs'])
    expect(f.log().at(-1)).toBe('lce')
    expect(landed(f.log())).toBe(after - 1)
  })

  // Follows the rule above: of two contacts held in one sleep, the one still going on at the wake
  // is the one whose live land_collision events stand in for the held ones.
  it('drops live land_collision for a second contact that goes on past the wake', async () => {
    const f = await box()
    f.link('sleep', 4_000)
    f.linkset.advanceTime(1_000)
    contact(f, 6)
    f.linkset.advanceTime(1_000)
    contact(f, 6, false)
    f.linkset.advanceTime(4_000 - f.linkset.clock.now)
    for (let i = 0; i < 12; i++) {
      f.linkset.advanceTime(44)
      f.at('land_collision')
    }
    f.linkset.advanceTime(44)
    f.at('land_collision_end')
    f.linkset.advanceTime(1_000)
    expect(landed(f.log())).toBe(11)
  })

  // The same contact going on past the wake, with the live events given to the script directly.
  it('drops the live land_collision events fired at an idle script as well', async () => {
    const f = await box()
    f.link('sleep', 2_000)
    f.linkset.advanceTime(1_500)
    contact(f, 6, false)
    f.linkset.advanceTime(2_000 - f.linkset.clock.now)
    for (let i = 0; i < 12; i++) {
      f.linkset.advanceTime(44)
      f.script.fire('land_collision', ground)
    }
    f.linkset.advanceTime(44)
    f.script.fire('land_collision_end', ground)
    f.linkset.advanceTime(1_000)
    expect(f.log().slice(0, 2)).toEqual(['woke', 'lcs'])
    expect(f.log().at(-1)).toBe('lce')
    expect(landed(f.log())).toBe(11)
  })

  // In-world: the same with the sleeper resetting itself in its first land_collision after the
  // wake -> after the reset it got every live land_collision, 15 of 15 and 14 of 14, and
  // land_collision_end. It also got a new land_collision_start first, as a script reset during
  // any contact does.
  it('gives a script reset during the contact a new start and every live land_collision', async () => {
    const f = await box()
    f.link('sleep reset', 2_000)
    f.linkset.advanceTime(1_500)
    contact(f, 6, false)
    f.linkset.advanceTime(2_000 - f.linkset.clock.now)
    expect(f.log()).toEqual([])
    for (let i = 0; i < 15; i++) {
      f.linkset.advanceTime(44)
      f.at('land_collision')
    }
    f.linkset.advanceTime(44)
    f.at('land_collision_end')
    f.linkset.advanceTime(1_000)
    expect(f.log()).toEqual(['lcs', ...Array(15).fill('lc'), 'lce'])
  })

  // In-world: sleeps that ended 0.1 s before the physics went off, and 0.14 and 0.27 s after it
  // -> four land_collision each time, where the running script got three, one and none after the
  // wake before its land_collision_end.
  it.each([[3], [1], [0]])('gives four when the contact ends just after the wake (%i more)', async (more) => {
    const f = await box()
    f.link('sleep', 2_000)
    f.linkset.advanceTime(1_500)
    contact(f, 6, false)
    f.linkset.advanceTime(2_000 - f.linkset.clock.now)
    for (let i = 0; i < more; i++) {
      f.linkset.advanceTime(44)
      f.at('land_collision')
    }
    f.linkset.advanceTime(44)
    f.at('land_collision_end')
    f.linkset.advanceTime(1_000)
    expect(f.log()).toEqual(['woke', 'lcs', 'lc', 'lc', 'lc', 'lc', 'lce'])
  })
  // Follows the count above: a script stopped by another one at its wake keeps the held events
  // for when it runs again, and they are counted then, behind the link message that stopped it.
  it('keeps the count for a script stopped at the wake and run again', async () => {
    const f = await box()
    f.link('sleep stop', 4_000)
    f.linkset.advanceTime(1_000)
    contact(f, 6)
    f.linkset.advanceTime(5_000)
    expect(f.log()).toEqual(['woke'])
    f.script.running = true
    f.linkset.advanceTime(1_000)
    expect(f.log()).toEqual(['woke', 'link', 'lcs', 'lc', 'lc', 'lc', 'lc', 'lce'])
  })
})

describe('events a sleeper has no handler for', () => {
  // Follows the count above: link messages that the sleeping script has no handler for never run
  // in it, so they leave its four land_collision alone.
  it('leaves the four alone', async () => {
    const { linkset, scripts } = await loadLinkset({ prims: [{ scripts: [
      { name: 'sleeper', source: { source: `list log;
        default {
          touch_start(integer n) { llSleep(6.0); log += "woke"; }
          land_collision_start(vector p) { log += "lcs"; }
          land_collision(vector p) { log += "lc"; }
          land_collision_end(vector p) { log += "lce"; }
        }` } },
      { name: 'talker', source: { source: 'default { touch_start(integer n) { integer i; for (i = 0; i < 6; i++) llMessageLinked(LINK_THIS, 0, "x", ""); } }' } },
    ] }] })
    const sleeper = scripts.sleeper!
    sleeper.start()
    scripts.talker!.start()
    linkset.advanceTime(0)
    linkset.clock.schedule(sleeper, linkset.clock.now, 'touch_start', { num_detected: 1, detected: [{ key: OWNER, name: 'owner' }] })
    linkset.advanceTime(1_000)
    contact({ linkset, at: (event: string) => linkset.clock.schedule(sleeper, linkset.clock.now, event, ground) }, 26)
    linkset.clock.schedule(scripts.talker!, linkset.clock.now, 'touch_start', { num_detected: 1, detected: [{ key: OWNER, name: 'owner' }] })
    linkset.advanceTime(10_000)
    expect(sleeper.global('log')).toEqual(['woke', 'lcs', 'lc', 'lc', 'lc', 'lc', 'lce'])
  })
})

describe('land_collision held through a sleep and a take', () => {
  // In-world: the box was taken 6 s into a 15 s sleep, after the contact and the link messages,
  // and rezzed 4 s later -> the copy woke, ran on_rez, the link messages and land_collision_start,
  // then four land_collision with no link message (three in another run), three with two, and one
  // with six.
  it.each([[0, 4], [2, 3], [6, 1]])('counts on_rez and %i link messages in the copy: %i', async (links, kept) => {
    const f = await box()
    f.link('sleep', 15_000)
    f.linkset.advanceTime(1_500)
    contact(f, 26)
    for (let i = 0; i < links; i++) f.link('x')
    f.linkset.advanceTime(4_000)
    const log = f.takeAndRez(15_000)
    expect(log).toEqual(['woke', 'rez', ...Array(links).fill('link'), 'lcs', ...Array(kept).fill('lc'), 'lce'])
  })

  // In-world: a handler slept 4 s and then 10 s, with the contact and the link messages in the
  // first sleep. They ran when the handler ended: four land_collision with no link message, one
  // with six. Taken 8 s in, in the second sleep, and rezzed 4 s later, the copy ran on_rez first
  // and then the same: four, and one with six.
  it.each([[0, 4], [6, 1]])('counts the events ahead across a second sleep, %i link messages: %i', async (links, kept) => {
    const f = await box()
    f.link('twice', 4_000)
    f.linkset.advanceTime(1_000)
    contact(f, 26)
    for (let i = 0; i < links; i++) f.link('x')
    f.linkset.advanceTime(20_000)
    expect(f.log()).toEqual(['woke', 'woke2', ...Array(links).fill('link'), 'lcs', ...Array(kept).fill('lc'), 'lce'])
  })

  it.each([[0, 4], [6, 1]])('counts them in a copy taken in the second sleep, %i link messages: %i', async (links, kept) => {
    const f = await box()
    f.link('twice', 4_000)
    f.linkset.advanceTime(1_000)
    contact(f, 26)
    for (let i = 0; i < links; i++) f.link('x')
    f.linkset.advanceTime(7_000 - f.linkset.clock.now)
    const log = f.takeAndRez(15_000)
    expect(log).toEqual(['woke', 'woke2', 'rez', ...Array(links).fill('link'), 'lcs', ...Array(kept).fill('lc'), 'lce'])
  })
})

describe('collision_end among held land collisions', () => {
  // In-world: the box was dropped onto a prim ramp sloping onto the land, slid off it
  // (collision_end) and onto the land 1.6 s later, in an 8 s sleep. Three runs woke to
  // land_collision_start, collision_start, collision, two land_collision, collision_end, one
  // land_collision and land_collision_end. A slower slide, 1.7 s off the ramp before the land in a
  // 10 s sleep, ran collision_end after the first land_collision instead.
  it('runs collision_end after the second land_collision', async () => {
    const f = await box()
    f.link('sleep', 8_000)
    f.linkset.advanceTime(1_000)
    f.at('collision_start', ramp)
    for (let i = 0; i < 6; i++) {
      f.linkset.advanceTime(130)
      f.at('collision', ramp)
    }
    f.linkset.advanceTime(130)
    f.at('collision_end', ramp)
    f.linkset.advanceTime(1_600)
    contact(f, 8)
    f.linkset.advanceTime(10_000)
    expect(f.log()).toEqual(['woke', 'lcs', 'cs', 'c', 'lc', 'lc', 'ce', 'lc', 'lce'])
  })
})
