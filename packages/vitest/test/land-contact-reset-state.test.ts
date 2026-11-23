import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'
import type { Linkset, Script } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Land_collision_start
// https://wiki.secondlife.com/wiki/Land_collision
// https://wiki.secondlife.com/wiki/LlResetScript
// https://wiki.secondlife.com/wiki/State
// Every "In-world" note below was measured on Aditi, SLua Tideland, 2026-11-23, two runs each. A
// 0.5 m box held two scripts. One switched the box's physics on 0.6 m above bare land and off
// 1.5 or 2 s later, and logged every land event it got. The other reset itself, or changed to a
// second state with the same land handlers, in its first land_collision, either straight away or
// after a 1 s sleep that the contact went on past, or reset itself there and then reset or changed
// state again in the land_collision_start that came next, or was reset by the other script while
// it slept through the start of the contact. Each script logged the time of every event.
const source = `list log; integer mode;
  default {
    link_message(integer f, integer n, string s, key id) {
      if (s == "reset") mode = 1;
      else if (s == "state") mode = 2;
      else if (s == "sleep reset") { mode = 1; llSleep(n / 1000.0); log += "woke"; }
      else if (s == "sleep state") { mode = 2; llSleep(n / 1000.0); log += "woke"; }
      else if (s == "sleep") { llSleep(n / 1000.0); log += "woke"; }
      else if (s == "twice") mode = 3;
      else if (s == "reset then state") mode = 4;
    }
    land_collision_start(vector p) {
      log += "lcs";
      string again = llLinksetDataRead("again");
      llLinksetDataDelete("again");
      if (again == "reset") llResetScript();
      if (again == "state") state two;
    }
    land_collision(vector p) {
      log += "lc";
      if (mode == 1) { mode = 0; llResetScript(); }
      if (mode == 2) { mode = 0; state two; }
      if (mode == 3) { llLinksetDataWrite("again", "reset"); llResetScript(); }
      if (mode == 4) { llLinksetDataWrite("again", "state"); llResetScript(); }
    }
    land_collision_end(vector p) { log += "lce"; }
  }
  state two {
    state_entry() { log += "s2"; }
    land_collision_start(vector p) { log += "lcs"; }
    land_collision(vector p) { log += "lc"; }
    land_collision_end(vector p) { log += "lce"; }
  }`

const ground = { pos: { x: 124, y: 52, z: 22.31 } }

async function box() {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const { linkset, scripts } = await loadLinkset({ world, region: 'home', prims: [{ scripts: [{ name: 'probe', source: { source } }] }] })
  const script = scripts.probe!
  script.start()
  linkset.advanceTime(0)
  return { linkset, script, log: () => script.global('log') as string[] }
}

type Fire = (script: Script, linkset: Linkset, event: string) => void
const queued: Fire = (script, linkset, event) => linkset.clock.schedule(script, linkset.clock.now, event, ground)
const direct: Fire = (script, _linkset, event) => script.fire(event, ground)

/** `count` land_collision 44 ms apart, then land_collision_end. */
function goOn(f: { linkset: Linkset; script: Script }, fire: Fire, count: number) {
  for (let i = 0; i < count; i++) {
    f.linkset.advanceTime(44)
    fire(f.script, f.linkset, 'land_collision')
  }
  f.linkset.advanceTime(44)
  fire(f.script, f.linkset, 'land_collision_end')
  f.linkset.advanceTime(1_000)
}

const lcs = (n: number) => Array<string>(n).fill('lc')

describe.each([['queued', queued], ['fired at the script', direct]] as const)('a land contact through a reset or a state change (%s)', (_, fire) => {
  // In-world: the script reset itself in the first land_collision of a contact -> its state_entry,
  // then a new land_collision_start at the next physics step, then every land_collision the other
  // script got (29 of 29) and land_collision_end.
  it('raises a new land_collision_start after a reset during the contact', async () => {
    const f = await box()
    f.script.fire('link_message', { sender_num: 0, num: 0, str: 'reset', id: '' })
    fire(f.script, f.linkset, 'land_collision_start')
    f.linkset.advanceTime(44)
    fire(f.script, f.linkset, 'land_collision')
    f.linkset.advanceTime(1)
    expect(f.log()).toEqual([])
    goOn(f, fire, 29)
    expect(f.log()).toEqual(['lcs', ...lcs(29), 'lce'])
  })

  // In-world: the same with `state two` in place of llResetScript -> state_entry of the new state
  // and every land_collision after it (all of the other script's), with no new
  // land_collision_start.
  it('raises no new land_collision_start after a state change during the contact', async () => {
    const f = await box()
    f.script.fire('link_message', { sender_num: 0, num: 0, str: 'state', id: '' })
    fire(f.script, f.linkset, 'land_collision_start')
    f.linkset.advanceTime(44)
    fire(f.script, f.linkset, 'land_collision')
    goOn(f, fire, 28)
    expect(f.log()).toEqual(['lcs', 'lc', 's2', ...lcs(28), 'lce'])
  })

  // In-world: the script reset itself in its first land_collision and again in the new
  // land_collision_start (two runs) -> state_entry, then another land_collision_start at the next
  // physics step, then land_collision. The land_collision of the step the second start came in
  // never ran.
  it('raises the start again for a script reset in the new start', async () => {
    const f = await box()
    f.script.fire('link_message', { sender_num: 0, num: 0, str: 'twice', id: '' })
    fire(f.script, f.linkset, 'land_collision_start')
    f.linkset.advanceTime(44)
    fire(f.script, f.linkset, 'land_collision')
    goOn(f, fire, 3)
    expect(f.log()).toEqual(['lcs', ...lcs(2), 'lce'])
  })

  // In-world: the same with `state two` in the new land_collision_start (two runs) -> no other
  // start, then land_collision. The land_collision of the start's step never ran in one run and
  // ran after the state change in the other; rezless drops it with the events waiting.
  it('raises no start again for a state change in the new start', async () => {
    const f = await box()
    f.script.fire('link_message', { sender_num: 0, num: 0, str: 'reset then state', id: '' })
    fire(f.script, f.linkset, 'land_collision_start')
    f.linkset.advanceTime(44)
    fire(f.script, f.linkset, 'land_collision')
    goOn(f, fire, 3)
    expect(f.log()).toEqual(['lcs', 's2', ...lcs(2), 'lce'])
  })

  // Follows the measurement above: a reset from outside the script, here the owner's Reset, is
  // a reset during the contact as well.
  it('raises a new land_collision_start after the owner resets the script', async () => {
    const f = await box()
    fire(f.script, f.linkset, 'land_collision_start')
    f.linkset.advanceTime(44)
    fire(f.script, f.linkset, 'land_collision')
    f.linkset.advanceTime(1)
    f.script.reset()
    goOn(f, fire, 3)
    expect(f.log()).toEqual(['lcs', ...lcs(3), 'lce'])
  })

  // Follows the measurement above: a link message that runs between the reset and the next
  // land_collision leaves the start owed.
  it('keeps the new start owed through other events', async () => {
    const f = await box()
    f.script.fire('link_message', { sender_num: 0, num: 0, str: 'reset', id: '' })
    fire(f.script, f.linkset, 'land_collision_start')
    f.linkset.advanceTime(44)
    fire(f.script, f.linkset, 'land_collision')
    f.linkset.advanceTime(1)
    f.script.fire('link_message', { sender_num: 0, num: 0, str: 'nothing', id: '' })
    goOn(f, fire, 2)
    expect(f.log()).toEqual(['lcs', ...lcs(2), 'lce'])
  })

  // Follows the measurement above: a land_collision_end still to come doesn't end the contact
  // before its time.
  it('raises the new start when the contact ends only after the reset', async () => {
    const f = await box()
    queued(f.script, f.linkset, 'land_collision_start')
    f.linkset.advanceTime(44)
    queued(f.script, f.linkset, 'land_collision')
    f.linkset.clock.schedule(f.script, f.linkset.clock.now + 500, 'land_collision_end', ground)
    f.linkset.advanceTime(44)
    f.script.reset()
    f.linkset.advanceTime(44)
    fire(f.script, f.linkset, 'land_collision')
    goOn(f, fire, 1)
    expect(f.log()).toEqual(['lcs', 'lc', 'lc', 'lce'])
  })

  // Follows the measurement above: the start comes back only for a contact going on at the reset.
  it('raises nothing for a reset after the contact ended', async () => {
    const f = await box()
    fire(f.script, f.linkset, 'land_collision_start')
    goOn(f, fire, 3)
    f.script.reset()
    f.linkset.advanceTime(1_000)
    expect(f.log()).toEqual([])
    fire(f.script, f.linkset, 'land_collision_start')
    goOn(f, fire, 2)
    expect(f.log()).toEqual(['lcs', 'lc', 'lc', 'lce'])
  })
})

describe('a contact whose held land_collision ran, through a reset or a state change', () => {
  /** A contact that starts 0.6 s into a 1 s sleep and goes on past the wake. */
  async function held(str: string) {
    const f = await box()
    f.linkset.clock.schedule(f.script, f.linkset.clock.now, 'link_message', { sender_num: 0, num: 1_000, str, id: '' })
    f.linkset.advanceTime(600)
    queued(f.script, f.linkset, 'land_collision_start')
    for (let i = 0; i < 8; i++) {
      f.linkset.advanceTime(44)
      queued(f.script, f.linkset, 'land_collision')
    }
    f.linkset.advanceTime(1_000 - f.linkset.clock.now)
    return f
  }

  // In-world: another script in the box reset the sleeper with llResetOtherScript 0.55 s into a
  // contact that came up while it slept, so it never ran that contact's land_collision_start (two
  // runs) -> state_entry, a new land_collision_start at the next physics step, then every
  // land_collision the other script got, and land_collision_end.
  it('raises a new start for a script reset before it ran the contact\'s start', async () => {
    const f = await box()
    f.linkset.clock.schedule(f.script, f.linkset.clock.now, 'link_message', { sender_num: 0, num: 3_000, str: 'sleep', id: '' })
    f.linkset.advanceTime(350)
    queued(f.script, f.linkset, 'land_collision_start')
    for (let i = 0; i < 12; i++) {
      f.linkset.advanceTime(44)
      queued(f.script, f.linkset, 'land_collision')
    }
    f.script.reset()
    goOn(f, queued, 20)
    expect(f.log()).toEqual(['lcs', ...lcs(20), 'lce'])
  })

  // Follows the measurement above: a contact that ended in the sleep and a second one still going
  // on at the reset raise the new start too.
  it('raises a new start for a reset in a sleep that holds an ended contact and one going on', async () => {
    const f = await box()
    f.linkset.clock.schedule(f.script, f.linkset.clock.now, 'link_message', { sender_num: 0, num: 3_000, str: 'sleep', id: '' })
    f.linkset.advanceTime(100)
    for (const ends of [true, false]) {
      queued(f.script, f.linkset, 'land_collision_start')
      for (let i = 0; i < 6; i++) {
        f.linkset.advanceTime(44)
        queued(f.script, f.linkset, 'land_collision')
      }
      f.linkset.advanceTime(44)
      if (ends) queued(f.script, f.linkset, 'land_collision_end')
    }
    f.script.reset()
    goOn(f, queued, 5)
    expect(f.log()).toEqual(['lcs', ...lcs(5), 'lce'])
  })

  // In-world: the sleeper reset itself in its first held land_collision -> a new
  // land_collision_start, then every live land_collision the other script got after the reset
  // (28 of 28, 27 of 27), and land_collision_end.
  it('gives a reset script a new land_collision_start and every live land_collision', async () => {
    const f = await held('sleep reset')
    goOn(f, queued, 28)
    expect(f.log()).toEqual(['lcs', ...lcs(28), 'lce'])
  })

  // In-world: the same with `state two` -> no new land_collision_start, and every live
  // land_collision the other script got after the state change (23 of 23, 24 of 24). With no
  // state change the sleeper got four held land_collision and lost five live ones (28 against 29).
  it('ends the drop of live land_collision at a state change, with no new start', async () => {
    const f = await held('sleep state')
    goOn(f, queued, 23)
    expect(f.log()).toEqual(['woke', 'lcs', 'lc', 's2', ...lcs(23), 'lce'])
  })

  it('drops live land_collision with no state change', async () => {
    const f = await held('sleep')
    goOn(f, queued, 25)
    expect(f.log()).toEqual(['woke', 'lcs', ...lcs(4 + 25 - 5), 'lce'])
  })
})
