import { describe, expect, it } from 'vitest'
import { loadLinkset } from '../src/index.js'

const OWNER = '00000000-0000-0000-0000-0000000000aa'

const target = `list log; integer n;
  default {
    state_entry() { log += "default entry " + (string)n; }
    on_rez(integer p) { log += "rez " + (string)n; }
    attach(key id) { log += "attach " + (string)(id != NULL_KEY); }
    link_message(integer s, integer i, string m, key id) {
      if (m == "two") state two;
      else if (m == "busy") { log += "begin"; llOwnerSay("x"); log += "end"; }
      else if (m == "busyreset") { log += "begin"; llOwnerSay("x"); log += "end"; llResetScript(); }
      else log += "default heard " + m;
    }
  }
  state two {
    state_entry() { n = 3; log += "two entry " + (string)n; }
    on_rez(integer p) { log += "rez " + (string)n; }
    attach(key id) { log += "attach " + (string)(id != NULL_KEY); }
    link_message(integer s, integer i, string m, key id) {
      if (m == "busy") { log += "begin"; llOwnerSay("x"); log += "end"; }
      else if (m == "busyreset") { log += "begin"; llOwnerSay("x"); log += "end"; llResetScript(); }
      else log += "two heard " + m;
    }
  }`

/** A sibling that stops (1), starts (2) or resets (3) script T in its attach(NULL_KEY). */
const sibling = (mode: number) => `default { attach(key id) { if (id == NULL_KEY) {
  if (${mode} == 1) llSetScriptState("T", FALSE);
  else if (${mode} == 2) llSetScriptState("T", TRUE);
  else if (${mode} == 3) llResetOtherScript("T"); } } }`

async function worn(mode: number) {
  const { linkset, scripts } = await loadLinkset({ owner: OWNER, prims: [{ scripts: [
    { name: 'T', source: { source: target } }, { name: 'C', source: { source: sibling(mode) } },
  ] }] })
  const t = scripts['T']!
  for (const s of Object.values(scripts)) s.start()
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(100)
  const say = (m: string) => { t.fire('link_message', { sender_num: 0, num: 0, str: m, id: '' }); linkset.advanceTime(100) }
  say('two')
  t.setGlobal('log', [])
  /** Run `m` in T; its handler is busy when the object detaches, with a chat line waiting. */
  const busy = (m: string) => {
    t.mock('llOwnerSay', () => {
      t.fire('link_message', { sender_num: 0, num: 0, str: 'a', id: '' })
      linkset.detachFromAvatar()
      return undefined
    })
    t.fire('link_message', { sender_num: 0, num: 0, str: m, id: '' })
    linkset.advanceTime(100)
  }
  const detach = () => { linkset.detachFromAvatar(); linkset.advanceTime(100) }
  const wear = () => { linkset.attachToAvatar(OWNER, 5); linkset.advanceTime(100) }
  return { linkset, t, say, busy, detach, wear, log: () => t.global('log') }
}

// In-world: a worn box held a script T, moved to its second state with a counter at 3, and a
// sibling C that stopped, started or reset T in its attach(NULL_KEY). C detached the box with
// llDetachFromAvatar and the box was worn again from inventory. A busy handler spun 12 s on
// llGetTime with a chat line waiting, and C detached the box 4 s in (Aditi, SLua Tideland, Firestorm
// RLVa 2.4.2, 2026-11-23).
describe('a sibling that changes a script\'s running state in its attach(NULL_KEY)', () => {
  // In-world: T said attach(NULL_KEY), then C stopped it. Worn again, T stayed stopped and silent;
  // started, it ran state_entry of the default state with the counter at 0.
  it('comes back reset when the sibling stops it there', async () => {
    const f = await worn(1)
    f.detach()
    f.wear()
    expect(f.t.running).toBe(false)
    f.t.running = true
    f.linkset.advanceTime(0)
    f.say('hello')
    expect(f.log()).toEqual(['default entry 0', 'default heard hello'])
  })

  // In-world: T was stopped before the detach and C started it. Worn again, T said on_rez and
  // attach(avatar) in its second state with the counter at 3, and no attach(NULL_KEY).
  it('comes back as it was when the sibling starts it there', async () => {
    const f = await worn(2)
    f.t.running = false
    f.detach()
    f.wear()
    f.say('hello')
    expect(f.t.running).toBe(true)
    expect(f.log()).toEqual(['rez 3', 'attach 1', 'two heard hello'])
  })
})

describe('a script detached in the middle of a handler', () => {
  // In-world: C reset T in its attach(NULL_KEY). The loop stopped there and T ran state_entry; the
  // waiting chat line never ran. Worn again, T said on_rez and attach(avatar).
  it('starts over when a sibling resets it in attach(NULL_KEY)', async () => {
    const f = await worn(3)
    f.busy('busy')
    f.wear()
    f.say('hello')
    expect(f.log()).toEqual(['default entry 0', 'rez 0', 'attach 1', 'default heard hello'])
  })

  // In-world: worn again, the loop ran on to its end and called llResetScript. T ran state_entry
  // and got no on_rez, chat line or attach event.
  it('gets only state_entry when the rest of its handler resets it', async () => {
    const f = await worn(0)
    f.busy('busyreset')
    f.wear()
    f.say('hello')
    expect(f.log()).toEqual(['default entry 0', 'default heard hello'])
  })

  // In-world: C stopped T in its attach(NULL_KEY). Worn again, T stayed stopped and silent;
  // started, it ran state_entry of the default state. The loop never went on.
  it('comes back reset when a sibling stops it in attach(NULL_KEY)', async () => {
    const f = await worn(1)
    f.busy('busy')
    f.wear()
    expect(f.t.running).toBe(false)
    f.t.running = true
    f.linkset.advanceTime(0)
    f.say('hello')
    expect(f.log()).toEqual(['default entry 0', 'default heard hello'])
  })

  // In-world: C stopped T just after the wear, while the loop ran on. Started again, T finished
  // the loop, then said on_rez, the chat line, attach(NULL_KEY) and attach(avatar).
  it('runs the waiting events after on_rez when stopped and started after the wear', async () => {
    const f = await worn(0)
    f.busy('busy')
    f.wear()
    f.t.running = false
    f.linkset.advanceTime(0)
    f.t.running = true
    f.say('hello')
    expect(f.log()).toEqual(['begin', 'end', 'rez 3', 'two heard a', 'attach 0', 'attach 1', 'two heard hello'])
  })
})
