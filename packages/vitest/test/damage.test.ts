import { describe, it, expect } from 'vitest'
import { loadScript, loadLinkset, World, REGION_FLAG_ALLOW_DAMAGE } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlGetHealth
// https://wiki.secondlife.com/wiki/PRIM_HEALTH
// https://wiki.secondlife.com/wiki/LlSetDamage
// In-world: object health 0 -> PRIM_HEALTH 75 -> llGetHealth 75; llSetDamage
// changes PRIM_DAMAGE (Aditi, SLua Tideland, 2026-10-31).
// Damage events on damage-enabled land were measured on the main grid on 2026-11-23;
// those measurements and the tests they settled are in damage-main-grid.test.ts.
describe('combat and damage', () => {
  it('reads object health from PRIM_HEALTH', async () => {
    const s = await loadScript({ source: `float health; default { state_entry() {
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_HEALTH, 75.0]);
      health = llGetHealth(llGetKey());
    } }` })
    s.start()
    expect(s.global('health')).toBe(75)
  })

  it('sets collision damage on the prim', async () => {
    const s = await loadScript({ source: `list damage; default { state_entry() {
      llSetDamage(30.0); damage = llGetPrimitiveParams([PRIM_DAMAGE]);
    } }` })
    s.start()
    expect(s.global('damage')).toEqual([30, 0])
  })
})

// https://wiki.secondlife.com/wiki/LlAdjustDamage
// In-world: timer/touch calls at indexes 0, -1 and 10 continued, with no DEBUG_CHANNEL
// message; a DEBUG sentinel was captured (Aditi, SLua Tombolo, 2026-10-31, on land without
// damage). The main grid said an error for each call (damage-main-grid.test.ts), which
// rezless follows.
it.fails('says nothing for llAdjustDamage outside on_damage, as Aditi did', async () => {
  const s = await loadScript({ source: `integer finished; default { state_entry() {
    llAdjustDamage(0, 10.0); finished = TRUE;
  } }` })
  s.start()
  expect(s.global('finished')).toBe(1)
  expect(s.chat.filter((c) => c.channel === 2147483647)).toHaveLength(0)
})

// https://wiki.secondlife.com/wiki/LlDamage
// https://wiki.secondlife.com/wiki/On_damage
// https://wiki.secondlife.com/wiki/Final_damage
// In-world (main grid, 2026-11-23): 12 fire damage on an object at health 75 read [12, 5, 12] in
// on_damage, [3, 5, 12] after llAdjustDamage(0, 3.0) in the same handler, and [3, 5, 12] in
// final_damage; the object's health stayed 75.
it('routes damage through adjustment and final notification without reducing object health', async () => {
  const s = await loadScript({ source: `list events; default {
    state_entry() { llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_HEALTH, 75.0]); }
    touch_start(integer n) { llDamage(llGetKey(), 12.0, DAMAGE_TYPE_FIRE); }
    on_damage(integer n) {
      events += llDetectedDamage(0);
      llAdjustDamage(0, 3.0);
      events += llDetectedDamage(0);
    }
    final_damage(integer n) { events += llDetectedDamage(0); }
  }` })
  s.linkset.damageEnabled = true
  s.start()
  s.fire('touch_start', { num_detected: 1 })
  s.linkset.advanceTime(100)
  expect(s.global('events')).toEqual([12, 5, 12, 3, 5, 12, 3, 5, 12])
  expect(s.host.params.health).toBe(75)
})

// In-world (main grid, 2026-11-23): with one on_damage asleep for 4 seconds, final_damage came
// 4 seconds later, carrying that handler's adjustment.
it('waits for a sleeping on_damage handler before final_damage', async () => {
  const s = await loadScript({ source: `list events; default {
    state_entry() { llSetTimerEvent(1.0); }
    timer() { llSetTimerEvent(0.0); llDamage(llGetKey(), 12.0, 5); }
    on_damage(integer n) { llSleep(4.0); llAdjustDamage(0, 3.0); events += ["adjusted"]; }
    final_damage(integer n) { events += llDetectedDamage(0); }
  }` })
  s.linkset.damageEnabled = true
  s.start()
  s.linkset.advanceTime(1000)
  expect(s.global('events')).toEqual([])
  s.linkset.advanceTime(3999)
  expect(s.global('events')).toEqual([])
  s.linkset.advanceTime(100)
  expect(s.global('events')).toEqual(['adjusted', 3, 5, 12])
})

// In-world (main grid, 2026-11-23): every script of the object got on_damage, and final_damage
// went out only after the last on_damage ended.
it('waits for every script on the target before final notification', async () => {
  const { scripts, linkset } = await loadLinkset({ prims: [{ scripts: [
    { name: 'slow', source: { source: `list events; default {
      state_entry() { llSetTimerEvent(1.0); }
      timer() { llSetTimerEvent(0.0); llDamage(llGetKey(), 12.0, 5); }
      on_damage(integer n) { llSleep(4.0); llAdjustDamage(0, 3.0); }
      final_damage(integer n) { events += llDetectedDamage(0); }
    }` } },
    { name: 'observer', source: { source: `list events; default {
      on_damage(integer n) { events += ["on"]; }
      final_damage(integer n) { events += llDetectedDamage(0); }
    }` } },
  ] }] })
  linkset.damageEnabled = true
  scripts.slow!.start()
  scripts.observer!.start()
  linkset.advanceTime(1000)
  expect(scripts.observer!.global('events')).toEqual(['on'])
  linkset.advanceTime(4100)
  expect(scripts.observer!.global('events')).toEqual(['on', 3, 5, 12])
  expect(scripts.slow!.global('events')).toEqual([3, 5, 12])
})

// In-world: llDamage(self,12,5) kept health 75 and fired zero on_damage/final_damage
// events (Aditi, SLua Tideland, 2026-10-31).
it('does not deliver damage on safe land', async () => {
  const s = await loadScript({ source: `integer events; default {
    state_entry() { llDamage(llGetKey(), 12.0, 5); }
    on_damage(integer n) { ++events; }
    final_damage(integer n) { ++events; }
  }` })
  s.start()
  expect(s.global('events')).toBe(0)
})

it('reads health per prim, including child keys and uppercase keys', async () => {
  // In-world: root health 80 and child health 25 read back independently
  // through llGetHealth (Aditi, SLua Tideland, 2026-10-31).
  const { scripts, prims } = await loadLinkset({ prims: [
    { key: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', scripts: [{ name: 'read', source: { source: `list health; default {
      state_entry() {
        llSetLinkPrimitiveParamsFast(1, [PRIM_HEALTH, 80.0]);
        llSetLinkPrimitiveParamsFast(2, [PRIM_HEALTH, 25.0]);
        health = [llGetHealth(llGetLinkKey(1)), llGetHealth(llGetLinkKey(2)),
          llGetHealth("AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA")];
      }
    }` } }] }, {},
  ] })
  scripts.read!.start()
  expect(scripts.read!.global('health')).toEqual([80, 25, 80])
  expect(prims[1]!.params.health).toBe(25)
})

it.each([150, -150, 0])('retains collision damage %s without clamping or replacing its type', async (amount) => {
  // In-world: llSetDamage(+/-150) retained +/-150; setting amount 9 after
  // PRIM_DAMAGE [13,7] retained type 7 (Aditi, SLua Tideland, 2026-10-31).
  const s = await loadScript({ source: `list damage; default { state_entry() {
    llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_DAMAGE, 13.0, 7]);
    llSetDamage(${amount}.0); damage = llGetPrimitiveParams([PRIM_DAMAGE]);
  } }` })
  s.start()
  expect(s.global('damage')).toEqual([amount, 7])
})

it('sets collision damage on the calling child only', async () => {
  // In-world: child llSetDamage(9) kept its type 7 and left root damage
  // [37,2] unchanged (Aditi, SLua Tideland, 2026-10-31).
  const { scripts, prims } = await loadLinkset({ prims: [
    {}, { scripts: [{ name: 'child', source: { source: `default { state_entry() {
      llSetLinkPrimitiveParamsFast(1, [PRIM_DAMAGE, 37.0, 2]);
      llSetLinkPrimitiveParamsFast(LINK_THIS, [PRIM_DAMAGE, 13.0, 7]);
      llSetDamage(9.0);
    } }` } }] },
  ] })
  scripts.child!.start()
  expect(prims[0]!.params.damage).toEqual({ amount: 37, type: 2 })
  expect(prims[1]!.params.damage).toEqual({ amount: 9, type: 7 })
})

const AVATAR = 'af576265-1cc4-46de-98d1-1d0d64d10d3b'
it('reads the owner avatar health and returns zero for unknown targets', async () => {
  // In-world: self=0, owner=100, null=0, malformed=0 and unknown UUID=0
  // (Aditi, SLua Tideland, 2026-10-31).
  const s = await loadScript({ owner: AVATAR, source: `list health; default { state_entry() {
    health = [llGetHealth(llGetKey()), llGetHealth(llGetOwner()), llGetHealth(NULL_KEY),
      llGetHealth("bad"), llGetHealth("00000000-0000-0000-0000-000000000001")];
  } }` })
  s.start()
  expect(s.global('health')).toEqual([0, 100, 0, 0, 0])
})

it('applies avatar damage after adjustments, and healing cannot exceed 100', async () => {
  const world = new World()
  world.addRegion('combat', { x: 0, y: 0 })
  const { scripts: source, linkset } = await loadLinkset({ world, region: 'combat', owner: AVATAR, prims: [{ scripts: [{ name: 'source', source: { source: `default {
    touch_start(integer n) { llDamage(llGetOwner(), 120.0, 5); }
    touch_end(integer n) { llDamage(llGetOwner(), -150.0, 101); }
  }` } }] }] })
  const { scripts: armor } = await loadLinkset({ world, region: 'combat', prims: [{ scripts: [{ name: 'armor', source: { source: `list health; default {
    on_damage(integer n) { if (llList2Float(llDetectedDamage(0), 0) > 0) llAdjustDamage(0, 8.0); }
    final_damage(integer n) { health += [llGetHealth("${AVATAR}")]; }
  }` } }] }] })
  linkset.damageEnabled = true
  source.source!.setCombatAvatar(AVATAR, { health: 75, damageEnabled: true, scripts: [armor.armor!] })
  source.source!.start()
  armor.armor!.start()
  source.source!.fire('touch_start', { num_detected: 1 })
  linkset.advanceTime(100)
  expect(armor.armor!.global('health')).toEqual([67])
  source.source!.fire('touch_end', { num_detected: 1 })
  linkset.advanceTime(100)
  expect(armor.armor!.global('health')).toEqual([67, 100])
})

it('does not damage a target in another region', async () => {
  const world = new World()
  world.addRegion('source', { x: 0, y: 0 })
  world.addRegion('target', { x: 256, y: 0 })
  const { scripts: a } = await loadLinkset({ world, region: 'source', prims: [{ scripts: [{ name: 'a', source: { source: `default { touch_start(integer n) { llDamage("${AVATAR}", 10.0, 0); } }` } }] }] })
  const { scripts: b } = await loadLinkset({ world, region: 'target', prims: [{ scripts: [{ name: 'b', source: { source: `integer events; default { final_damage(integer n) { ++events; } }` } }] }] })
  a.a!.linkset.damageEnabled = true
  b.b!.setCombatAvatar(AVATAR, { health: 75, damageEnabled: true, scripts: [b.b!] })
  a.a!.start(); b.b!.start()
  a.a!.fire('touch_start', { num_detected: 1 })
  expect(b.b!.global('events')).toBe(0)
})

it('honors the region setting that disables on_damage adjustment', async () => {
  const world = new World()
  world.addRegion('combat', { x: 0, y: 0 }, { env: { allow_damage_adjust: '0' } })
  const { scripts, linkset } = await loadLinkset({ world, region: 'combat', prims: [{ scripts: [{ name: 's', source: { source: `list events; default {
    state_entry() { llDamage(llGetKey(), 12.0, 5); }
    on_damage(integer n) { events += ["on"]; llAdjustDamage(0, 3.0); }
    final_damage(integer n) { events += llDetectedDamage(0); }
  }` } }] }] })
  linkset.damageEnabled = true
  scripts.s!.start()
  expect(scripts.s!.global('events')).toEqual([12, 5, 12])
})

it('skips on_damage for an avatar damaged by its own attachment', async () => {
  const s = await loadScript({ owner: AVATAR, source: `list events; default {
    state_entry() { llDamage(llGetOwner(), 12.0, 5); }
    on_damage(integer n) { events += ["on"]; llAdjustDamage(0, 3.0); }
    final_damage(integer n) { events += [llGetHealth(llGetOwner())]; }
  }` })
  s.linkset.damageEnabled = true
  s.setCombatAvatar(AVATAR, { health: 75, damageEnabled: true, scripts: [s] })
  s.start()
  expect(s.global('events')).toEqual([63])
})

it('finishes damage when a queued on_damage event is removed by reset', async () => {
  const { scripts, linkset } = await loadLinkset({ prims: [{ scripts: [
    { name: 'target', source: { source: `default {
      state_entry() { llSetTimerEvent(0.5); }
      timer() { llSetTimerEvent(0.0); llSleep(10.0); }
      on_damage(integer n) { llAdjustDamage(0, 1.0); }
    }` } },
    { name: 'source', source: { source: `integer tick; list events; default {
      state_entry() { llSetTimerEvent(1.0); }
      timer() { if (++tick == 1) llDamage(llGetKey(), 12.0, 5); else { llResetOtherScript("target"); llSetTimerEvent(0.0); } }
      final_damage(integer n) { events += llDetectedDamage(0); }
    }` } },
  ] }] })
  linkset.damageEnabled = true
  scripts.target!.start(); scripts.source!.start()
  linkset.advanceTime(1000)
  expect(scripts.source!.global('events')).toEqual([])
  linkset.advanceTime(1100)
  expect(scripts.source!.global('events')).toEqual([12, 5, 12])
})

// In-world (main grid, 2026-11-23): an object of one owner damaging another owner's object
// showed the source's key, name and owner, the owner again as rezzer, link number 0 and type 44.
it('exposes source identity in the damage context, with link number 0', async () => {
  const world = new World()
  world.addRegion('combat', { x: 0, y: 0 })
  const targetKey = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  const { scripts: source, linkset: gun } = await loadLinkset({ world, region: 'combat', owner: AVATAR, prims: [{
    key: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'gun', scripts: [{ name: 'gun', source: { source: `default {
      touch_start(integer n) { llDamage("${targetKey}", 200.0, 42); }
    }` } }],
  }] })
  const { scripts: target, linkset: victim } = await loadLinkset({ world, region: 'combat', prims: [
    { key: targetKey, scripts: [{ name: 'target', source: { source: `list received; default {
      final_damage(integer n) { received = [n, llDetectedKey(0), llDetectedName(0), llDetectedOwner(0), llDetectedRezzer(0), llDetectedLinkNumber(0), llDetectedType(0)] + llDetectedDamage(0); }
    }` } }] }, {},
  ] })
  gun.damageEnabled = victim.damageEnabled = true
  source.gun!.start(); target.target!.start()
  source.gun!.fire('touch_start', { num_detected: 1 })
  expect(target.target!.global('received')).toEqual([1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gun', AVATAR, AVATAR, 0, 12, 200, 42, 200])
})

// In-world (main grid, 2026-11-23): bad indexes inside on_damage were silent; a call from
// final_damage said the error on DEBUG_CHANNEL.
it('ignores invalid adjustment indexes, and refuses calls from final_damage', async () => {
  const s = await loadScript({ source: `list result; default {
    state_entry() { llDamage(llGetKey(), 12.0, 5); }
    on_damage(integer n) { llAdjustDamage(-1, 99.0); llAdjustDamage(9, 99.0); }
    final_damage(integer n) { llAdjustDamage(0, 99.0); result = llDetectedDamage(0); }
  }` })
  s.linkset.damageEnabled = true
  s.start()
  s.linkset.advanceTime(100)
  expect(s.global('result')).toEqual([12, 5, 12])
  expect(s.chat.filter((c) => c.channel === 2147483647).map((c) => c.text))
    .toEqual(['llAdjustDamage may only be called from the on_damage() event handler'])
})

it('defaults to damage enabled in a region with REGION_FLAG_ALLOW_DAMAGE', async () => {
  const world = new World()
  world.addRegion('combat', { x: 0, y: 0 }, { flags: REGION_FLAG_ALLOW_DAMAGE })
  const { scripts } = await loadLinkset({ world, region: 'combat', prims: [{ scripts: [{ name: 's', source: { source: `integer events; default {
    state_entry() { llDamage(llGetKey(), 1.0, 0); }
    final_damage(integer n) { ++events; }
  }` } }] }] })
  scripts.s!.start()
  expect(scripts.s!.global('events')).toBe(1)
})

// In-world (main grid, 2026-11-23): 200 damage killed the avatar, and its health read 100 at once.
it('restores an avatar without attachments to 100 after a lethal hit', async () => {
  const s = await loadScript({ owner: AVATAR, source: `float health; default {
    state_entry() { llDamage(llGetOwner(), 200.0, 5); }
    touch_start(integer n) { health = llGetHealth(llGetOwner()); }
  }` })
  s.linkset.damageEnabled = true
  s.setCombatAvatar(AVATAR, { health: 75, damageEnabled: true })
  s.start()
  s.fire('touch_start', { num_detected: 1 })
  expect(s.global('health')).toBe(100)
})

it('ignores unknown and safe targets without interrupting the caller', async () => {
  const s = await loadScript({ owner: AVATAR, source: `float health; integer finished; default {
    state_entry() { llDamage(NULL_KEY, 10.0, 0); llDamage("bad", 10.0, 0);
      llDamage(llGetOwner(), 10.0, 0); health = llGetHealth(llGetOwner()); finished = TRUE;
    }
  }` })
  s.linkset.damageEnabled = true
  s.setCombatAvatar(AVATAR, { health: 75, damageEnabled: false })
  s.start()
  expect(s.global('health')).toBe(75)
  expect(s.global('finished')).toBe(1)
  expect(s.chat).toEqual([])
})

// In-world (main grid, 2026-11-23): a non-physical source with damage handlers read 44, and one
// without them read 12, or 10 once physical (pinned in damage-main-grid.test.ts). This test's 42,
// physical with damage handlers, combines those flags; that pairing itself was not probed.
it('reports physical scripted damageable sources in llDetectedType', async () => {
  const s = await loadScript({ source: `integer detectedType; default {
    state_entry() { llSetStatus(STATUS_PHYSICS, TRUE); llDamage(llGetKey(), 1.0, 0); }
    final_damage(integer n) { detectedType = llDetectedType(0); }
  }` })
  s.linkset.damageEnabled = true
  s.start()
  expect(s.global('detectedType')).toBe(42)
})

// Review regressions below need damage-enabled land for simulator comparison.
// The same unavailable-land limitation at the top applies.
it('keeps parked on_damage pending until the stopped script resumes', async () => {
  const { scripts, linkset } = await loadLinkset({ prims: [{ scripts: [
    { name: 'source', source: { source: `list hits; default {
      touch_start(integer n) { llDamage(llGetKey(), 12.0, 5); llSetScriptState("armor", FALSE); }
      touch_end(integer n) { llSetScriptState("armor", TRUE); }
      final_damage(integer n) { hits += llDetectedDamage(0); }
    }` } },
    { name: 'armor', source: { source: `default { on_damage(integer n) { llAdjustDamage(0, 3.0); } }` } },
  ] }] })
  linkset.damageEnabled = true
  scripts.source!.start(); scripts.armor!.start()
  scripts.source!.fire('touch_start', { num_detected: 1 })
  expect(scripts.source!.global('hits')).toEqual([])
  expect(scripts.armor!.parkedEvents).toHaveLength(1)
  scripts.source!.fire('touch_end', { num_detected: 1 })
  linkset.advanceTime(100)
  expect(scripts.source!.global('hits')).toEqual([3, 5, 12])
})

it.each(['llBreakLink(2);', 'llBreakAllLinks();'])('keeps parcel damage settings after %s', async (unlink) => {
  const { scripts, linkset } = await loadLinkset({ prims: [
    { scripts: [{ name: 'root', source: { source: `default {
      state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
      touch_start(integer n) { ${unlink} }
    }` } }] },
    { scripts: [{ name: 'child', source: { source: `integer hits; default {
      touch_start(integer n) { integer i; for(i=0;i<20;++i) llDamage(llGetKey(), 1.0, 0); }
      final_damage(integer n) { hits += n; }
    }` } }] },
  ] })
  linkset.damageEnabled = true
  scripts.root!.start(); scripts.child!.start()
  scripts.root!.grantPermissions(128)
  scripts.root!.fire('touch_start', { num_detected: 1 })
  expect(scripts.child!.linkset).not.toBe(linkset)
  scripts.child!.fire('touch_start', { num_detected: 1 })
  expect(scripts.child!.global('hits')).toBe(20)
  expect(scripts.child!.chat).toEqual([])
})

// https://wiki.secondlife.com/wiki/On_death
// In-world (main grid, 2026-11-23): each 200 damage made the worn scripts hear on_death, and
// health read 100 again at once, so the next lethal hit killed the avatar again.
it('sends on_death to attachments on every lethal hit, and health starts again at 100', async () => {
  const s = await loadScript({ owner: AVATAR, source: `integer deaths; list health; default {
    touch_start(integer n) { llDamage(llGetOwner(), 200.0, 5); }
    touch_end(integer n) { llDamage(llGetOwner(), 50.0, 0); }
    on_death() { ++deaths; }
    final_damage(integer n) { health += [llGetHealth(llGetOwner())]; }
  }` })
  const observer = await loadScript({ host: s.host, source: `integer deaths; default { on_death() { ++deaths; } }` })
  observer.start()
  s.linkset.damageEnabled = true
  s.setCombatAvatar(AVATAR, { health: 75, damageEnabled: true, scripts: [s, observer] })
  s.start()
  s.fire('touch_start', { num_detected: 1 })
  expect([s.global('deaths'), observer.global('deaths')]).toEqual([1, 1])
  s.fire('touch_start', { num_detected: 1 })
  expect([s.global('deaths'), observer.global('deaths')]).toEqual([2, 2])
  s.fire('touch_end', { num_detected: 1 })
  expect([s.global('deaths'), observer.global('deaths')]).toEqual([2, 2])
  expect(s.global('health')).toEqual([100, 100, 50])
})

// In-world (main grid, 2026-11-23): after on_damage changed state, llAdjustDamage in state_exit and
// state_entry said the error, and the script got no final_damage in either state.
it('does not allow lifecycle handlers entered by state change to adjust pending damage', async () => {
  const s = await loadScript({ source: `list hits; default {
    state_entry() { llDamage(llGetKey(), 12.0, 5); }
    on_damage(integer n) { state next; }
    state_exit() { llAdjustDamage(0, 99.0); }
  }
  state next {
    state_entry() { llAdjustDamage(0, 98.0); }
    final_damage(integer n) { hits += llDetectedDamage(0); }
  }` })
  s.linkset.damageEnabled = true
  s.start()
  expect(s.global('hits')).toEqual([])
  expect(s.chat.filter((c) => c.channel === 2147483647)).toHaveLength(2)
})

it('releases parked damage when the stopped recipient is deleted', async () => {
  const { scripts, linkset } = await loadLinkset({ prims: [{ scripts: [
    { name: 'source', source: { source: `list hits; default {
      touch_start(integer n) { llDamage(llGetKey(), 12.0, 5); llSetScriptState("armor", FALSE); }
      final_damage(integer n) { hits += llDetectedDamage(0); }
    }` } },
    { name: 'armor', source: { source: `default { on_damage(integer n) { llAdjustDamage(0, 3.0); } }` } },
  ] }] })
  linkset.damageEnabled = true
  scripts.source!.start(); scripts.armor!.start()
  scripts.source!.fire('touch_start', { num_detected: 1 })
  expect(scripts.source!.global('hits')).toEqual([])
  scripts.armor!.markDead()
  linkset.advanceTime(100)
  expect(scripts.source!.global('hits')).toEqual([12, 5, 12])
})

it('keeps an explicit safe-parcel override when detaching in a damage-enabled region', async () => {
  const world = new World()
  world.addRegion('combat', { x: 0, y: 0 }, { flags: REGION_FLAG_ALLOW_DAMAGE })
  const { scripts, linkset, prims } = await loadLinkset({ world, region: 'combat', prims: [
    {}, { scripts: [{ name: 'child', source: { source: `integer hits; default {
      state_entry() { llDamage(llGetKey(), 1.0, 0); }
      final_damage(integer n) { ++hits; }
    }` } }] },
  ] })
  linkset.damageEnabled = false
  linkset.breakOff(prims[1]!)
  scripts.child!.start()
  expect(scripts.child!.global('hits')).toBe(0)
})
