import { describe, it, expect } from 'vitest'
import { loadScript, loadLinkset, World, REGION_FLAG_ALLOW_DAMAGE, seedRlvInventory } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlDamage
// https://wiki.secondlife.com/wiki/On_damage
// https://wiki.secondlife.com/wiki/Final_damage
// https://wiki.secondlife.com/wiki/LlAdjustDamage
// https://wiki.secondlife.com/wiki/LlDetectedDamage
// https://wiki.secondlife.com/wiki/On_death
//
// Every "In-world" note here was measured on the main grid on 2026-11-23, on a parcel with
// damage, building and scripts allowed, with two avatars. Probe objects took commands on a
// chat channel: one called llDamage on a key, others logged every on_damage, final_damage and
// on_death with llDetectedDamage, the source's llDetected* details and llGetHealth of
// themselves and their owner, before and after any llSleep or llAdjustDamage. One probe was
// worn by the second avatar, who was the target of every avatar hit.

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BOT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const DEBUG = 2147483647
const ERROR = 'llAdjustDamage may only be called from the on_damage() event handler'

/** Run the world's events and sleeps forward. */
const tick = (world: World, ms: number) => world.linksets[0]!.advanceTime(ms)

function combatWorld() {
  const world = new World()
  world.addRegion('arena', { x: 0, y: 0 }, { flags: REGION_FLAG_ALLOW_DAMAGE })
  return world
}

async function object(world: World, scripts: Record<string, string>, owner = OWNER) {
  const made = await loadLinkset({ world, region: 'arena', owner, prims: [{
    scripts: Object.entries(scripts).map(([name, source]) => ({ name, source: { source } })),
  }] })
  for (const s of Object.values(made.scripts)) s.start()
  return made
}

const DD = `string dd(integer i) {
    list l = llDetectedDamage(i);
    if (l == []) return "";
    return (string)llRound(llList2Float(l, 0)) + "," + llList2String(l, 1) + "," + (string)llRound(llList2Float(l, 2));
  }`

const recorder = `list log;
  ${DD}
  default {
    on_damage(integer n) { log += "on " + (string)n + " " + dd(0); }
    final_damage(integer n) { log += "final " + (string)n + " " + dd(0) + " " + dd(n - 1); }
    on_death() { log += "death"; }
  }`

function gun(target: string, amount: number, times = 1, type = 0) {
  return `default { touch_start(integer t) {
    integer i; for (i = 0; i < ${times}; ++i) llDamage("${target}", ${amount}.0, ${type});
  } }`
}

function debugChat(s: { chat: { channel: number, text: string }[] }) {
  return s.chat.filter((c) => c.channel === DEBUG).map((c) => c.text)
}

describe('several hits in one moment', () => {
  // In-world: three llDamage calls in one listen handler reached the target as one on_damage
  // with num_detected 3 and one final_damage with num_detected 3; 12 and 30 calls arrived as one
  // event each, with llDetectedDamage valid up to index 29.
  it('reach the target as one on_damage and one final_damage', async () => {
    const world = combatWorld()
    const target = await object(world, { recorder })
    const shooter = await object(world, { gun: gun(target.linkset.prims[0]!.key, 1, 3) })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    expect(target.scripts.recorder!.global('log')).toEqual(['on 3 1,0,1', 'final 3 1,0,1 1,0,1'])
  })

  // In-world: one chat command made eight objects hit the same target at once; it got one
  // on_damage with num_detected 8, with a different source in each entry.
  it('from different objects arrive together', async () => {
    const world = combatWorld()
    const target = await object(world, { recorder: `list sources; default {
      on_damage(integer n) { sources += n; integer i; for (i = 0; i < n; ++i) sources += llDetectedName(i); }
    }` })
    const key = target.linkset.prims[0]!.key
    for (const name of ['a', 'b']) {
      await loadLinkset({ world, region: 'arena', owner: OWNER, prims: [{ name, scripts: [{ name: 'gun', source: { source: `default {
        state_entry() { llListen(7, "", NULL_KEY, "fire"); }
        listen(integer c, string n, key id, string m) { llDamage("${key}", 1.0, 0); }
      }` } }] }] }).then((made) => made.scripts.gun!.start())
    }
    const commander = await object(world, { c: `default { touch_start(integer n) { llRegionSay(7, "fire"); } }` })
    commander.scripts.c!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    expect(target.scripts.recorder!.global('sources')).toEqual([2, 'a', 'b'])
  })

  // In-world: a hit sent after the target's on_damage had started came as an event of its own.
  it('start a new event once the target is handling the last one', async () => {
    const world = combatWorld()
    const target = await object(world, { recorder: `list counts; default {
      on_damage(integer n) { counts += n; llSleep(1.0); }
    }` })
    const shooter = await object(world, { gun: gun(target.linkset.prims[0]!.key, 1) })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 5000)
    expect(target.scripts.recorder!.global('counts')).toEqual([1, 1])
  })
})

describe('no throttle', () => {
  // In-world: 42 hits on one object in 8 seconds, 13 hits sent as separate events within a
  // second, and 33 hits on an avatar within 30 seconds all landed, from objects of the target's
  // owner and of another owner, and nothing was said on DEBUG_CHANNEL. The wiki's limit of 10
  // hits per 30 seconds was not there.
  it('lets every hit on an object through', async () => {
    const world = combatWorld()
    const target = await object(world, { counter: `integer hits; default { final_damage(integer n) { hits += n; } }` }, BOT)
    const shooter = await object(world, { gun: gun(target.linkset.prims[0]!.key, 1, 30) })
    for (let i = 0; i < 2; ++i) shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    expect(target.scripts.counter!.global('hits')).toBe(60)
    expect(debugChat(shooter.scripts.gun!)).toEqual([])
  })

  it('lets every hit on an avatar through', async () => {
    const world = combatWorld()
    world.addAvatar({ region: 'arena', key: BOT, username: 'bot' })
    const shooter = await object(world, { gun: gun(BOT, 1) })
    for (let i = 0; i < 13; ++i) shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    expect(world.avatars[0]!.objectDetails.health).toBe(87)
  })
})

describe('which key takes damage', () => {
  async function pair(world: World) {
    return loadLinkset({ world, region: 'arena', owner: BOT, prims: [
      { scripts: [{ name: 'root', source: { source: recorder } }] },
      { scripts: [{ name: 'child', source: { source: recorder } }] },
    ] })
  }

  // In-world: damage aimed at the root of a two-prim object reached the scripts in both prims,
  // and llDetectedLinkNumber read 0 in every damage event.
  it('the root, for the scripts in every prim, with link number 0', async () => {
    const world = combatWorld()
    const target = await pair(world)
    target.scripts.root!.start(); target.scripts.child!.start()
    const reader = await loadScript({ host: target.linkset.prims[0]!, source: `integer link = -1; default { final_damage(integer n) { link = llDetectedLinkNumber(0); } }` })
    reader.start()
    const shooter = await object(world, { gun: gun(target.linkset.prims[0]!.key, 12, 1, 5) })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    expect(target.scripts.root!.global('log')).toEqual(['on 1 12,5,12', 'final 1 12,5,12 12,5,12'])
    expect(target.scripts.child!.global('log')).toEqual(['on 1 12,5,12', 'final 1 12,5,12 12,5,12'])
    expect(reader.global('link')).toBe(0)
  })

  // In-world: damage aimed at the child prim's key reached nobody.
  it('not a child prim', async () => {
    const world = combatWorld()
    const target = await pair(world)
    target.scripts.root!.start(); target.scripts.child!.start()
    const shooter = await object(world, { gun: gun(target.linkset.prims[1]!.key, 12) })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    expect(target.scripts.root!.global('log')).toEqual([])
    expect(target.scripts.child!.global('log')).toEqual([])
  })

  // In-world: damage aimed at the key of an object the avatar wore reached nobody, and the
  // avatar kept its health.
  it('not a worn object', async () => {
    const world = combatWorld()
    world.addAvatar({ region: 'arena', key: BOT, username: 'bot' })
    const worn = await object(world, { recorder }, BOT)
    worn.linkset.attachToAvatar(BOT, 1)
    const shooter = await object(world, { gun: gun(worn.linkset.prims[0]!.key, 5) })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    expect(worn.scripts.recorder!.global('log')).toEqual([])
    expect(world.avatars[0]!.objectDetails.health ?? 100).toBe(100)
  })
})

describe('llAdjustDamage outside on_damage', () => {
  // In-world: llAdjustDamage(0, 5.0) and llAdjustDamage(-1, 5.0) in a listen handler each said
  // the error on DEBUG_CHANNEL, and the handler went on.
  it('says an error for each call and goes on', async () => {
    const s = await loadScript({ source: `integer finished; default { state_entry() {
      llAdjustDamage(0, 5.0); llAdjustDamage(-1, 5.0); finished = TRUE;
    } }` })
    s.start()
    expect(debugChat(s)).toEqual([ERROR, ERROR])
    expect(s.global('finished')).toBe(1)
  })

  // In-world: the same error from final_damage and from on_death on a worn object.
  it('says the error from final_damage and on_death', async () => {
    const world = combatWorld()
    world.addAvatar({ region: 'arena', key: BOT, username: 'bot' })
    const worn = await object(world, { fin: `integer finals; integer deaths; default {
      final_damage(integer n) { llAdjustDamage(0, 1.0); ++finals; }
      on_death() { llAdjustDamage(0, 1.0); ++deaths; }
    }` }, BOT)
    worn.linkset.attachToAvatar(BOT, 1)
    const shooter = await object(world, { gun: gun(BOT, 200) })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    expect([worn.scripts.fin!.global('finals'), worn.scripts.fin!.global('deaths')]).toEqual([1, 1])
    expect(debugChat(worn.scripts.fin!)).toEqual([ERROR, ERROR])
  })

  // In-world: inside on_damage, llAdjustDamage(-1, 1.0) and llAdjustDamage(5, 1.0) with one
  // entry said nothing and changed nothing.
  it('stays silent for a bad index inside on_damage', async () => {
    const world = combatWorld()
    const target = await object(world, { edge: `list seen; default {
      on_damage(integer n) { llAdjustDamage(-1, 1.0); llAdjustDamage(5, 1.0); seen = llDetectedDamage(0); }
    }` })
    const shooter = await object(world, { gun: gun(target.linkset.prims[0]!.key, 12, 1, 5) })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    expect(target.scripts.edge!.global('seen')).toEqual([12, 5, 12])
    expect(debugChat(target.scripts.edge!)).toEqual([])
  })
})

describe('a state change inside on_damage', () => {
  // In-world: a script whose on_damage changed state said the error from state_exit and from
  // state_entry, read no llDetectedDamage in either, and never got final_damage. The other
  // script in the object got final_damage with the damage unadjusted before state_exit ran, and
  // a worn pair of the same scripts still cost the avatar the damage.
  const changer = `list log;
    ${DD}
    default {
      on_damage(integer n) { state two; }
      state_exit() { llAdjustDamage(0, 1.0); log += "exit " + dd(0); }
      final_damage(integer n) { log += "default final"; }
    }
    state two {
      state_entry() { llAdjustDamage(0, 2.0); log += "entry " + dd(0); }
      final_damage(integer n) { log += "two final"; }
    }`

  it('ends that script\'s part at once and costs it the final_damage', async () => {
    const world = combatWorld()
    const target = await object(world, { changer, recorder })
    const shooter = await object(world, { gun: gun(target.linkset.prims[0]!.key, 12, 1, 5) })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 1000)
    expect(target.scripts.changer!.global('log')).toEqual(['exit ', 'entry '])
    expect(debugChat(target.scripts.changer!)).toEqual([ERROR, ERROR])
    expect(target.scripts.recorder!.global('log')).toEqual(['on 1 12,5,12', 'final 1 12,5,12 12,5,12'])
  })

  it('still applies the damage to the avatar', async () => {
    const world = combatWorld()
    world.addAvatar({ region: 'arena', key: BOT, username: 'bot' })
    const worn = await object(world, { changer, recorder }, BOT)
    worn.linkset.attachToAvatar(BOT, 1)
    const shooter = await object(world, { gun: gun(BOT, 10) })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 1000)
    expect(world.avatars[0]!.objectDetails.health).toBe(90)
    expect(worn.scripts.recorder!.global('log')).toEqual(['on 1 10,0,10', 'final 1 10,0,10 10,0,10'])
  })
})

describe('avatar health', () => {
  async function wearer(world: World, scripts: Record<string, string> = { recorder }) {
    world.addAvatar({ region: 'arena', key: BOT, username: 'bot' })
    const worn = await object(world, scripts, BOT)
    worn.linkset.attachToAvatar(BOT, 1)
    return worn
  }
  const health = (world: World) => world.avatars[0]!.objectDetails.health ?? 100

  // In-world: an object reading llGetHealth of another avatar in the region read 100, and so
  // did the second avatar's object reading the first.
  it('reads 100 for another avatar in the region', async () => {
    const world = combatWorld()
    world.addAvatar({ region: 'arena', key: BOT, username: 'bot' })
    const reader = await object(world, { r: `float h; default { state_entry() { h = llGetHealth("${BOT}"); } }` })
    expect(reader.scripts.r!.global('h')).toBe(100)
  })

  // In-world: 30 damage on an avatar at 100 left 70 in final_damage; with a worn on_damage
  // adjusting it to 10, the avatar lost 10; -100 healed it back to 100 and no further.
  it('applies the adjusted damage after on_damage, and healing stops at 100', async () => {
    const world = combatWorld()
    const worn = await wearer(world, { armor: `list seen; default {
      on_damage(integer n) { if (llList2Float(llDetectedDamage(0), 0) > 20) llAdjustDamage(0, 10.0); }
      final_damage(integer n) { seen += llGetHealth(llGetOwner()); }
    }` })
    const shooter = await object(world, { gun: `default {
      touch_start(integer n) { llDamage("${BOT}", 30.0, 0); }
      touch_end(integer n) { llDamage("${BOT}", -100.0, 0); }
    }` })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    shooter.scripts.gun!.fire('touch_end', { num_detected: 1 })
    tick(world, 0)
    expect(worn.scripts.armor!.global('seen')).toEqual([90, 100])
  })

  // In-world: with nothing worn handling on_damage, llGetHealth right after llDamage in the
  // same handler already read the lowered health.
  it('drops at once when nothing worn handles on_damage', async () => {
    const world = combatWorld()
    world.addAvatar({ region: 'arena', key: BOT, username: 'bot' })
    const shooter = await object(world, { gun: `float after; default { touch_start(integer n) {
      llDamage("${BOT}", 10.0, 0); after = llGetHealth("${BOT}");
    } }` })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    expect(shooter.scripts.gun!.global('after')).toBe(90)
  })

  // In-world: the avatar's own worn object damaging it got no on_damage, its llGetHealth in the
  // same handler read the lowered health, and final_damage came after. Twelve calls in one
  // handler all landed.
  it('skips on_damage for the avatar\'s own attachment and drops at once', async () => {
    const world = combatWorld()
    const worn = await wearer(world, { self: `list log; float after; default {
      touch_start(integer t) { integer i; for (i = 0; i < 12; ++i) llDamage(llGetOwner(), 1.0, 0); after = llGetHealth(llGetOwner()); }
      on_damage(integer n) { log += "on"; }
      final_damage(integer n) { log += "final " + (string)n; }
    }` })
    worn.scripts.self!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    expect(worn.scripts.self!.global('after')).toBe(88)
    expect(worn.scripts.self!.global('log')).toEqual(['final 12'])
  })

  // In-world: 200 damage made the worn scripts hear on_death, after which llGetHealth read 100
  // at once; final_damage came after on_death and read 100 too. A second 200 did the same.
  it('dies at zero, hears on_death before final_damage, and is back at 100', async () => {
    const world = combatWorld()
    const worn = await wearer(world, { w: `list log; default {
      on_death() { log += "death " + (string)llRound(llGetHealth(llGetOwner())); }
      final_damage(integer n) { log += "final " + (string)llRound(llGetHealth(llGetOwner())); }
    }` })
    const shooter = await object(world, { gun: gun(BOT, 200) })
    for (let i = 0; i < 2; ++i) {
      shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
      tick(world, 0)
    }
    expect(worn.scripts.w!.global('log')).toEqual(['death 100', 'final 100', 'death 100', 'final 100'])
    expect(health(world)).toBe(100)
  })

  // In-world: after damage the avatar's health rose by just over 1 about every 6 seconds (seen
  // at 52, 53, 54, 55 and at 51, 52, 53, 54, with steps 5.8 to 6.0 seconds apart), and the
  // first step could come under a second after the hit.
  it('regenerates one point every 6 seconds up to 100', async () => {
    const world = combatWorld()
    world.addAvatar({ region: 'arena', key: BOT, username: 'bot' })
    const shooter = await object(world, { gun: `list seen; default {
      touch_start(integer n) { llDamage("${BOT}", 3.0, 0); }
      touch_end(integer n) { seen += llGetHealth("${BOT}"); }
    }` })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    shooter.scripts.gun!.fire('touch_end', { num_detected: 1 })
    tick(world, 6000)
    shooter.scripts.gun!.fire('touch_end', { num_detected: 1 })
    tick(world, 12000)
    shooter.scripts.gun!.fire('touch_end', { num_detected: 1 })
    tick(world, 60000)
    shooter.scripts.gun!.fire('touch_end', { num_detected: 1 })
    expect(shooter.scripts.gun!.global('seen')).toEqual([97, 98, 100, 100])
  })
})

describe('avatar health set by a test', () => {
  it('starts regenerating from when it was set', async () => {
    const world = combatWorld()
    world.addAvatar({ region: 'arena', key: BOT, username: 'bot' })
    const reader = await object(world, { r: `list seen; default { touch_start(integer n) { seen += llGetHealth("${BOT}"); } }` })
    reader.scripts.r!.fire('touch_start', { num_detected: 1 })
    tick(world, 59000)
    world.avatars[0]!.objectDetails.health = 50
    tick(world, 500)
    reader.scripts.r!.fire('touch_start', { num_detected: 1 })
    expect(reader.scripts.r!.global('seen')).toEqual([100, 50])
  })

  it('regenerates in llGetObjectDetails as in llGetHealth', async () => {
    const world = combatWorld()
    world.addAvatar({ region: 'arena', key: BOT, username: 'bot' })
    const reader = await object(world, { r: `list seen; default {
      touch_start(integer n) { llDamage("${BOT}", 10.0, 0); }
      touch_end(integer n) { seen += llList2Float(llGetObjectDetails("${BOT}", [OBJECT_HEALTH]), 0); }
    }` })
    reader.scripts.r!.fire('touch_start', { num_detected: 1 })
    tick(world, 6000)
    reader.scripts.r!.fire('touch_end', { num_detected: 1 })
    expect(reader.scripts.r!.global('seen')).toEqual([91])
  })

  it('regenerates only from when the avatar was added', async () => {
    const world = combatWorld()
    const reader = await object(world, { r: `list seen; default { touch_start(integer n) { seen += llGetHealth("${BOT}"); } }` })
    tick(world, 60000)
    world.addAvatar({ region: 'arena', key: BOT, username: 'bot', objectDetails: { health: 50 } })
    reader.scripts.r!.fire('touch_start', { num_detected: 1 })
    tick(world, 6000)
    reader.scripts.r!.fire('touch_start', { num_detected: 1 })
    expect(reader.scripts.r!.global('seen')).toEqual([50, 51])
  })

  it('regenerates from when a test set it, read or not', async () => {
    const world = combatWorld()
    world.addAvatar({ region: 'arena', key: BOT, username: 'bot' })
    const reader = await object(world, { r: `float h; default { touch_start(integer n) { h = llGetHealth("${BOT}"); } }` })
    world.avatars[0]!.objectDetails.health = 50
    tick(world, 6000)
    reader.scripts.r!.fire('touch_start', { num_detected: 1 })
    expect(reader.scripts.r!.global('h')).toBe(51)
  })

  it('reads 0 for an avatar in another region', async () => {
    const world = combatWorld()
    world.addRegion('elsewhere', { x: 256, y: 0 })
    world.addAvatar({ region: 'elsewhere', key: OWNER, username: 'owner' })
    const reader = await object(world, { r: `float h = -1; default { state_entry() { h = llGetHealth(llGetOwner()); } }` })
    expect(reader.scripts.r!.global('h')).toBe(0)
  })
})

describe('a seated avatar', () => {
  async function seated(world: World, seatSource: string) {
    world.addAvatar({ region: 'arena', key: BOT, username: 'bot' })
    const seat = await object(world, { seat: seatSource }, BOT)
    world.sitAvatar(world.avatars[0]!, seat.linkset.prims[0]!)
    const worn = await object(world, { w: recorder }, BOT)
    worn.linkset.attachToAvatar(BOT, 1)
    return { seat, worn }
  }

  // In-world: 10 damage on a seated avatar reached the seat's on_damage first. The seat adjusted
  // it to 2; the worn object then saw [2, 0, 2], with the seat's amount as the original. Both
  // got final_damage after the worn on_damage, the seat with [2, 0, 10], and the avatar lost 2.
  it('reaches the seat first, then the worn scripts with what the seat left', async () => {
    const world = combatWorld()
    const { seat, worn } = await seated(world, `list log; ${DD} default {
      on_damage(integer n) { log += "on"; llAdjustDamage(0, 2.0); }
      final_damage(integer n) { log += "final " + dd(0); }
    }`)
    const shooter = await object(world, { gun: gun(BOT, 10) })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    expect(seat.scripts.seat!.global('log')).toEqual(['on', 'final 2,0,10'])
    expect(worn.scripts.w!.global('log')).toEqual(['on 1 2,0,2', 'final 1 2,0,2 2,0,2'])
    expect(world.avatars[0]!.objectDetails.health).toBe(98)
  })

  // In-world: 10 damage aimed at the seat went the same way: the seat's on_damage, the worn
  // object's on_damage, both final_damage events, and the sitter lost 10.
  it('takes damage aimed at the seat', async () => {
    const world = combatWorld()
    const { seat, worn } = await seated(world, recorder)
    const shooter = await object(world, { gun: gun(seat.linkset.prims[0]!.key, 10) })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    expect(seat.scripts.seat!.global('log')).toEqual(['on 1 10,0,10', 'final 1 10,0,10 10,0,10'])
    expect(worn.scripts.w!.global('log')).toEqual(['on 1 10,0,10', 'final 1 10,0,10 10,0,10'])
    expect(world.avatars[0]!.objectDetails.health).toBe(90)
  })

  // In-world: the seat damaging its own sitter heard nothing itself; the worn object got
  // on_damage and final_damage, and the avatar lost 10.
  it('skips the seat when the seat deals the damage', async () => {
    const world = combatWorld()
    const { seat, worn } = await seated(world, `list log; default {
      touch_start(integer n) { llDamage("${BOT}", 10.0, 0); }
      on_damage(integer n) { log += "on"; }
      final_damage(integer n) { log += "final"; }
    }`)
    seat.scripts.seat!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    expect(seat.scripts.seat!.global('log')).toEqual([])
    expect(worn.scripts.w!.global('log')).toEqual(['on 1 10,0,10', 'final 1 10,0,10 10,0,10'])
    expect(world.avatars[0]!.objectDetails.health).toBe(90)
  })

  // In-world: the sitter's own worn object damaging it reached neither the seat nor any
  // on_damage; the health dropped at once and the worn object got final_damage.
  it('skips the seat for the avatar\'s own attachment', async () => {
    const world = combatWorld()
    const { seat, worn } = await seated(world, recorder)
    const self = await loadScript({ host: worn.linkset.prims[0]!, source: gun(BOT, 10) })
    self.start()
    self.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    expect(seat.scripts.seat!.global('log')).toEqual([])
    expect(worn.scripts.w!.global('log')).toEqual(['final 1 10,0,10 10,0,10'])
    expect(world.avatars[0]!.objectDetails.health).toBe(90)
  })
})

describe('a recipient that is away while its on_damage sleeps', () => {
  const sleeper = `list log; default {
    on_damage(integer n) { log += "on"; llSleep(8.0); llAdjustDamage(0, 3.0); log += "end"; }
    on_rez(integer p) { log += "rez"; }
    final_damage(integer n) { log += "final " + (string)llRound(llList2Float(llDetectedDamage(0), 0)); }
  }`
  const watcher = `list log; default {
    on_damage(integer n) { log += "on"; }
    final_damage(integer n) { log += "final " + (string)llRound(llList2Float(llDetectedDamage(0), 0)) + " " + (string)llRound(llGetHealth(llGetOwner())); }
  }`

  // In-world: a worn object was detached a second into its 8-second on_damage sleep. For the
  // next minute nothing else worn got final_damage and the avatar kept 100. Worn again, the
  // handler finished its sleep and adjusted to 3; the other script got final_damage reading 3
  // and health 97, then on_rez ran, then the sleeper's own final_damage.
  it('holds the damage while detached and finishes it when worn again', async () => {
    const world = combatWorld()
    world.addAvatar({ region: 'arena', key: BOT, username: 'bot' })
    const worn = await object(world, { sleeper, watcher }, BOT)
    worn.linkset.attachToAvatar(BOT, 1)
    const shooter = await object(world, { gun: gun(BOT, 10) })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 1000)
    worn.linkset.detachFromAvatar()
    tick(world, 60000)
    expect(worn.scripts.watcher!.global('log')).toEqual(['on'])
    expect(world.avatars[0]!.objectDetails.health ?? 100).toBe(100)
    worn.linkset.attachToAvatar(BOT, 1)
    tick(world, 10000)
    expect(worn.scripts.watcher!.global('log')).toEqual(['on', 'final 3 97'])
    expect(worn.scripts.sleeper!.global('log')).toEqual(['on', 'end', 'rez', 'final 3'])
  })

  // In-world: a script stopped a second into its 8-second on_damage sleep held the other
  // script's final_damage for as long as it stayed stopped. Set running again 17 seconds later,
  // it ended its handler at once with its adjustment to 3, and both scripts got final_damage.
  it('holds the damage while the sleeping script is stopped', async () => {
    const world = combatWorld()
    const target = await object(world, { sleeper, watcher })
    const shooter = await object(world, { gun: gun(target.linkset.prims[0]!.key, 10) })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 1000)
    target.scripts.sleeper!.running = false
    tick(world, 16000)
    expect(target.scripts.watcher!.global('log')).toEqual(['on'])
    target.scripts.sleeper!.running = true
    tick(world, 1000)
    expect(target.scripts.watcher!.global('log')).toEqual(['on', 'final 3 100'])
    expect(target.scripts.sleeper!.global('log')).toEqual(['on', 'end', 'final 3'])
  })
})

// https://github.com/i-doll/rezless/issues/436
describe('a copy taken while on_damage sleeps', () => {
  // In-world: an object was taken while its on_damage slept 8 seconds after reading [12, 5, 12],
  // and rezzed again. The copy finished the sleep, its llAdjustDamage(0, 3.0) said nothing and
  // its llDetectedDamage read [3, 5, 12]; then on_rez ran. The copy never got final_damage
  // (watched for four minutes).
  it('finishes the handler with its adjustment but gets no final_damage', async () => {
    const world = combatWorld()
    const avatar = world.addAvatar({ region: 'arena', key: OWNER, username: 'owner' })
    const target = await object(world, { k: `list log; ${DD} default {
      on_damage(integer n) { llSleep(8.0); llAdjustDamage(0, 3.0); log += "end " + dd(0); }
      on_rez(integer p) { log += "rez"; }
      final_damage(integer n) { log += "final"; }
    }` })
    const shooter = await object(world, { gun: gun(target.linkset.prims[0]!.key, 12, 1, 5) })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 1000)
    const saved = target.linkset.copy()
    target.linkset.remove()
    seedRlvInventory(avatar, { sharedRootId: null, entries: [{ id: 'k', kind: 'item', parentId: null, name: 'k', object: saved, assetType: 'object' }] })
    const copy = world.attemptAvatarRez(avatar, 'k', { x: 1, y: 2, z: 3 }).object!
    tick(world, 60000)
    const script = copy.allScripts()[0]!
    expect(script.global('log')).toEqual(['end 3,5,12', 'rez'])
    expect(debugChat(script)).toEqual([])
  })
})

// Review regressions: hits that arrive together must not change who they reach or what they do.
describe('hits in one moment keep their own targets', () => {
  const BOT2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

  it('reach each sitter of a seat separately', async () => {
    const world = combatWorld()
    world.addAvatar({ region: 'arena', key: BOT, username: 'bot' })
    world.addAvatar({ region: 'arena', key: BOT2, username: 'bot2' })
    const seat = await loadLinkset({ world, region: 'arena', owner: OWNER, prims: [
      { scripts: [{ name: 'seat', source: { source: recorder } }] }, {},
    ] })
    seat.scripts.seat!.start()
    world.sitAvatar(world.avatars[0]!, seat.linkset.prims[0]!)
    world.sitAvatar(world.avatars[1]!, seat.linkset.prims[1]!)
    const shooter = await object(world, { gun: `default { touch_start(integer n) {
      llDamage("${BOT}", 10.0, 0); llDamage("${BOT2}", 30.0, 0);
    } }` })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    expect(world.avatars.map((a) => a.objectDetails.health)).toEqual([90, 70])
  })

  it('let each sitter\'s worn scripts adjust only that sitter\'s damage', async () => {
    const world = combatWorld()
    world.addAvatar({ region: 'arena', key: BOT, username: 'bot' })
    world.addAvatar({ region: 'arena', key: BOT2, username: 'bot2' })
    const seat = await loadLinkset({ world, region: 'arena', owner: OWNER, prims: [{}, {}] })
    world.sitAvatar(world.avatars[0]!, seat.linkset.prims[0]!)
    world.sitAvatar(world.avatars[1]!, seat.linkset.prims[1]!)
    const armor = await object(world, { a: `default { on_damage(integer n) { llAdjustDamage(0, 2.0); } }` }, BOT)
    armor.linkset.attachToAvatar(BOT, 1)
    const plain = await object(world, { w: recorder }, BOT2)
    plain.linkset.attachToAvatar(BOT2, 1)
    const shooter = await object(world, { gun: gun(seat.linkset.prims[0]!.key, 10) })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    expect(world.avatars.map((a) => a.objectDetails.health)).toEqual([98, 90])
    expect(plain.scripts.w!.global('log')).toEqual(['on 1 10,0,10', 'final 1 10,0,10 10,0,10'])
  })

  it('keep the avatar\'s own hit out of an outside hit in flight', async () => {
    const world = combatWorld()
    world.addAvatar({ region: 'arena', key: BOT, username: 'bot' })
    const worn = await object(world, {
      self: `float after; default {
        state_entry() { llListen(7, "", NULL_KEY, "go"); }
        listen(integer c, string n, key id, string m) { llDamage(llGetOwner(), 10.0, 0); after = llGetHealth(llGetOwner()); }
      }`,
      w: recorder,
    }, BOT)
    worn.linkset.attachToAvatar(BOT, 1)
    await object(world, { gun: `default {
      state_entry() { llListen(7, "", NULL_KEY, "go"); }
      listen(integer c, string n, key id, string m) { llDamage("${BOT}", 1.0, 0); }
    }` })
    const commander = await object(world, { c: `default { touch_start(integer n) { llRegionSay(7, "go"); } }` })
    commander.scripts.c!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    expect(worn.scripts.self!.global('after')).toBe(90)
    const log = (worn.scripts.w!.global('log') as string[]).map((l) => l.split(' ').slice(0, 2))
    expect(log.filter(([e]) => e === 'on')).toEqual([['on', '1']])
    expect(log.filter(([e]) => e === 'final').reduce((n, [, c]) => n + Number(c), 0)).toBe(2)
    expect(world.avatars[0]!.objectDetails.health).toBe(89)
  })

  it('keep a hit that arrives after the seat\'s on_damage out of the seat\'s final_damage', async () => {
    const world = combatWorld()
    world.addAvatar({ region: 'arena', key: BOT, username: 'bot' })
    const seat = await object(world, { seat: `list log; default {
      on_damage(integer n) { log += "on " + (string)n; llRegionSay(7, "again"); }
      final_damage(integer n) { log += "final " + (string)n; }
    }` }, BOT)
    world.sitAvatar(world.avatars[0]!, seat.linkset.prims[0]!)
    const worn = await object(world, { w: recorder }, BOT)
    worn.linkset.attachToAvatar(BOT, 1)
    const shooter = await object(world, { gun: `integer once; default {
      state_entry() { llListen(7, "", NULL_KEY, "again"); }
      listen(integer c, string n, key id, string m) { if (!once++) llDamage("${BOT}", 5.0, 0); }
      touch_start(integer n) { llDamage("${BOT}", 10.0, 0); }
    }` })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    const log = seat.scripts.seat!.global('log') as string[]
    expect(log.filter((l) => l.startsWith('final')).map((l) => l.split(' ')[1]))
      .toEqual(log.filter((l) => l.startsWith('on')).map((l) => l.split(' ')[1]))
    expect(world.avatars[0]!.objectDetails.health).toBe(85)
  })

  it('stay together through a seat that does not handle on_damage', async () => {
    const world = combatWorld()
    world.addAvatar({ region: 'arena', key: BOT, username: 'bot' })
    const seat = await object(world, { seat: `list log; default { final_damage(integer n) { log += n; } }` }, BOT)
    world.sitAvatar(world.avatars[0]!, seat.linkset.prims[0]!)
    const worn = await object(world, { w: recorder }, BOT)
    worn.linkset.attachToAvatar(BOT, 1)
    const shooter = await object(world, { gun: gun(BOT, 1, 3) })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    expect(worn.scripts.w!.global('log')).toEqual(['on 3 1,0,1', 'final 3 1,0,1 1,0,1'])
    expect(seat.scripts.seat!.global('log')).toEqual([3])
  })

  it('keep the seat\'s own hit on its sitter out of the seat\'s on_damage', async () => {
    const world = combatWorld()
    world.addAvatar({ region: 'arena', key: BOT, username: 'bot' })
    const seat = await object(world, { seat: `list log; default {
      state_entry() { llListen(7, "", NULL_KEY, "go"); }
      listen(integer c, string n, key id, string m) { llDamage("${BOT}", 10.0, 0); }
      on_damage(integer n) { log += "on " + (string)n + " " + llDetectedName(0); }
    }` }, BOT)
    world.sitAvatar(world.avatars[0]!, seat.linkset.prims[0]!)
    await loadLinkset({ world, region: 'arena', owner: OWNER, prims: [{ name: 'gun', scripts: [{ name: 'gun', source: { source: `default {
      state_entry() { llListen(7, "", NULL_KEY, "go"); }
      listen(integer c, string n, key id, string m) { llDamage("${BOT}", 1.0, 0); }
    }` } }] }] }).then((made) => made.scripts.gun!.start())
    const commander = await object(world, { c: `default { touch_start(integer n) { llRegionSay(7, "go"); } }` })
    commander.scripts.c!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    expect(seat.scripts.seat!.global('log')).toEqual(['on 1 gun'])
    expect(world.avatars[0]!.objectDetails.health).toBe(89)
  })

  it('keep separate final_damage events for hits from different moments that finish together', async () => {
    const world = combatWorld()
    const target = await object(world, {
      slow: `integer first = TRUE; default { on_damage(integer n) { if (first) { first = FALSE; llSleep(1.0); } } }`,
      recorder,
    })
    const shooter = await object(world, { gun: gun(target.linkset.prims[0]!.key, 1) })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    tick(world, 500)
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 2000)
    const log = target.scripts.recorder!.global('log') as string[]
    expect(log.map((l) => l.split(' ').slice(0, 2).join(' '))).toEqual(['on 1', 'on 1', 'final 1', 'final 1'])
  })

  it('still tell a prim unlinked during on_damage', async () => {
    const world = combatWorld()
    world.addAvatar({ region: 'arena', key: OWNER, username: 'owner' })
    const target = await loadLinkset({ world, region: 'arena', owner: OWNER, prims: [
      { scripts: [{ name: 'root', source: { source: `default {
        state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
        on_damage(integer n) { llBreakLink(2); }
      }` } }] },
      { scripts: [{ name: 'child', source: { source: recorder } }] },
    ] })
    target.scripts.root!.start(); target.scripts.child!.start()
    target.scripts.root!.grantPermissions(128)
    const shooter = await object(world, { gun: gun(target.linkset.prims[0]!.key, 4) })
    shooter.scripts.gun!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    expect(target.scripts.child!.global('log')).toEqual(['on 1 4,0,4', 'final 1 4,0,4 4,0,4'])
  })

  it('send on_death before the lethal hit\'s final_damage', async () => {
    const world = combatWorld()
    world.addAvatar({ region: 'arena', key: BOT, username: 'bot' })
    const worn = await object(world, { self: `list log; default {
      touch_start(integer n) { llDamage(llGetOwner(), 50.0, 0); llDamage(llGetOwner(), 60.0, 0); }
      on_death() { log += "death"; }
      final_damage(integer n) { log += "final " + (string)n; }
    }` }, BOT)
    worn.linkset.attachToAvatar(BOT, 1)
    worn.scripts.self!.fire('touch_start', { num_detected: 1 })
    tick(world, 0)
    expect(worn.scripts.self!.global('log')).toEqual(['final 1', 'death', 'final 1'])
  })
})
