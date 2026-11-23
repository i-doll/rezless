import { describe, expect, it } from 'vitest'
import { loadLinkset } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlSetScriptState
// https://wiki.secondlife.com/wiki/LlDetachFromAvatar
const OWNER = '00000000-0000-0000-0000-0000000000aa'

const target = `list log; integer n;
  default {
    state_entry() { log += "default entry " + (string)n; }
    on_rez(integer p) { log += "rez " + (string)n; }
    attach(key id) { log += "attach " + (string)(id != NULL_KEY); }
    link_message(integer s, integer i, string m, key id) {
      if (m == "two") state two;
      log += "default heard " + m;
    }
  }
  state two {
    state_entry() { n = 3; log += "two entry " + (string)n; }
    on_rez(integer p) { log += "rez " + (string)n; }
    attach(key id) { log += "attach " + (string)(id != NULL_KEY); }
    link_message(integer s, integer i, string m, key id) { log += "two heard " + m; }
  }`

/** C's handler is busy when the object detaches, then stops (c1), starts (c2) or resets (c3) T. */
const sibling = `list log; default { link_message(integer s, integer i, string m, key id) {
  if (m != "c1" && m != "c2" && m != "c3") return;
  log += "begin " + (string)llGetAttached();
  llOwnerSay("x");
  if (m == "c3") llResetOtherScript("T");
  else llSetScriptState("T", m == "c2");
  log += "set " + (string)llGetScriptState("T"); } }`

async function worn(source = target) {
  const { linkset, scripts } = await loadLinkset({ owner: OWNER, prims: [{ scripts: [
    { name: 'T', source: { source } }, { name: 'C', source: { source: sibling } },
  ] }] })
  const t = scripts['T']!, c = scripts['C']!
  for (const s of Object.values(scripts)) s.start()
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(0)
  const say = (m: string) => { t.fire('link_message', { sender_num: 0, num: 0, str: m, id: '' }); linkset.advanceTime(0) }
  say('two')
  t.setGlobal('log', [])
  /** C runs `m`; another script detaches the object while C's handler is busy. */
  const busy = (m: string) => {
    c.mock('llOwnerSay', () => { linkset.detachFromAvatar(); return undefined })
    c.fire('link_message', { sender_num: 0, num: 0, str: m, id: '' })
    linkset.advanceTime(0)
  }
  const wear = () => { linkset.attachToAvatar(OWNER, 5); linkset.advanceTime(0) }
  return { linkset, t, say, busy, wear, log: () => t.global('log') }
}

// In-world: a worn box held a script T, moved to its second state with a counter at 3, a script C
// and a script D. A chat line started C's listen handler, which spun 10 s on llGetTime and then
// stopped or started T with llSetScriptState. D heard the same line, slept 4 s and detached the box
// with llDetachFromAvatar; the box was worn again from inventory (Aditi, SLua Tideland, Firestorm
// RLVa 2.4.2, 2026-11-23).
describe('a sibling whose handler was busy at a detach and changes a script\'s running state after it', () => {
  // In-world: T said attach(NULL_KEY) at the detach. Worn again, T said on_rez and attach(avatar)
  // in its second state with the counter at 3; then C's loop ended, worn (llGetAttached 39), and
  // stopped T. Started, T answered in its second state with the counter at 3.
  it('stops the script after the wear, so it comes back as it was', async () => {
    const f = await worn()
    f.busy('c1')
    expect(f.t.running).toBe(true)
    f.wear()
    expect(f.t.running).toBe(false)
    f.t.running = true
    f.say('hello')
    expect(f.log()).toEqual(['attach 0', 'rez 3', 'attach 1', 'two heard hello'])
  })

  // In-world: T was stopped before the line. Worn again, C's loop ended, worn, and started T, which
  // ran state_entry of the default state with the counter at 0 and got no on_rez or attach.
  it('starts the script after the wear, so it comes back reset', async () => {
    const f = await worn()
    f.t.running = false
    f.busy('c2')
    expect(f.t.running).toBe(false)
    f.wear()
    expect(f.t.running).toBe(true)
    f.say('hello')
    expect(f.log()).toEqual(['default entry 0', 'default heard hello'])
  })
})

// In-world: C reset T with llResetOtherScript at the end of its loop. T said attach(NULL_KEY) at the
// detach; worn again it said on_rez and attach(avatar) in its second state, then C's loop ended,
// worn, and T ran state_entry of the default state with the counter at 0.
it('resets the script after the wear when the rest of the handler resets it', async () => {
  // T's log global goes with the reset, so T also says each line.
  const f = await worn(target.replace(/log \+= ([^;]+);/g, '{ log += $1; llOwnerSay($1); }'))
  const said: string[] = []
  f.t.mock('llOwnerSay', (_ctx: unknown, args: readonly unknown[]) => { said.push(String(args[0])); return undefined })
  f.busy('c3')
  expect(said).toEqual(['attach 0'])
  f.wear()
  f.say('hello')
  expect(said).toEqual(['attach 0', 'rez 3', 'attach 1', 'default entry 0', 'default heard hello'])
})

it('waits for an on_rez that sleeps before changing the script', async () => {
  const sleepy = target.replace('on_rez(integer p) { log += "rez " + (string)n; }\n    attach(key id) { log += "attach " + (string)(id != NULL_KEY); }\n    link_message(integer s, integer i, string m, key id) { log += "two heard " + m; }',
    'on_rez(integer p) { llSleep(1.0); log += "rez " + (string)n; }\n    attach(key id) { log += "attach " + (string)(id != NULL_KEY); }\n    link_message(integer s, integer i, string m, key id) { log += "two heard " + m; }')
  expect(sleepy).not.toBe(target)
  const { linkset, scripts } = await loadLinkset({ owner: OWNER, prims: [{ scripts: [
    { name: 'T', source: { source: sleepy } }, { name: 'C', source: { source: sibling } },
  ] }] })
  const t = scripts['T']!, c = scripts['C']!
  for (const s of Object.values(scripts)) s.start()
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(0)
  t.fire('link_message', { sender_num: 0, num: 0, str: 'two', id: '' })
  linkset.advanceTime(0)
  t.setGlobal('log', [])
  c.mock('llOwnerSay', () => { linkset.detachFromAvatar(); return undefined })
  c.fire('link_message', { sender_num: 0, num: 0, str: 'c1', id: '' })
  linkset.advanceTime(0)
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(2_000)
  expect(t.running).toBe(false)
  expect(t.global('log')).toEqual(['attach 0', 'rez 3', 'attach 1'])
})
