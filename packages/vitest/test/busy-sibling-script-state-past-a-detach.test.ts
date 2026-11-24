import { describe, expect, it } from 'vitest'
import { loadLinkset, seedRlvInventory, World } from '../src/index.js'
import type { Script } from '../src/index.js'

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
  linkset.advanceTime(100)
  const say = (m: string) => { t.fire('link_message', { sender_num: 0, num: 0, str: m, id: '' }); linkset.advanceTime(100) }
  say('two')
  t.setGlobal('log', [])
  /** C runs `m`; another script detaches the object while C's handler is busy. */
  const busy = (m: string) => {
    c.mock('llOwnerSay', () => { linkset.detachFromAvatar(); return undefined })
    c.fire('link_message', { sender_num: 0, num: 0, str: m, id: '' })
    linkset.advanceTime(100)
  }
  const wear = () => { linkset.attachToAvatar(OWNER, 5); linkset.advanceTime(100) }
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
  linkset.advanceTime(100)
  t.fire('link_message', { sender_num: 0, num: 0, str: 'two', id: '' })
  linkset.advanceTime(100)
  t.setGlobal('log', [])
  c.mock('llOwnerSay', () => { linkset.detachFromAvatar(); return undefined })
  c.fire('link_message', { sender_num: 0, num: 0, str: 'c1', id: '' })
  linkset.advanceTime(100)
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(2_000)
  expect(t.running).toBe(false)
  expect(t.global('log')).toEqual(['attach 0', 'rez 3', 'attach 1'])
})

describe('several changes from the rest of one busy handler', () => {
  const run = async (body: string) => {
    const { linkset, scripts } = await loadLinkset({ owner: OWNER, prims: [{ scripts: [
      { name: 'T', source: { source: target } },
      { name: 'C', source: { source: `default { link_message(integer s, integer i, string m, key id) {
        if (m != "go") return; llOwnerSay("x"); ${body} } } state other { state_entry() {} }` } },
    ] }] })
    const t = scripts['T']!, c = scripts['C']!
    for (const s of Object.values(scripts)) s.start()
    linkset.attachToAvatar(OWNER, 5)
    linkset.advanceTime(0)
    t.fire('link_message', { sender_num: 0, num: 0, str: 'two', id: '' })
    linkset.advanceTime(0)
    c.mock('llOwnerSay', () => { linkset.detachFromAvatar(); return undefined })
    c.fire('link_message', { sender_num: 0, num: 0, str: 'go', id: '' })
    linkset.advanceTime(0)
    linkset.attachToAvatar(OWNER, 5)
    linkset.advanceTime(100)
    return t
  }

  it('apply in order: a stop and then a start leave the script running', async () => {
    const t = await run('llSetScriptState("T", FALSE); llSetScriptState("T", TRUE);')
    expect(t.running).toBe(true)
    expect(t.global('n')).toBe(3)
  })

  it('apply in order: a reset of a script stopped just before does nothing', async () => {
    const t = await run('llSetScriptState("T", FALSE); llResetOtherScript("T");')
    expect(t.running).toBe(false)
    expect(t.global('n')).toBe(3)
  })

  it.each([['llResetScript();'], ['state other;']])('survive %s later in the handler', async (end) => {
    const t = await run(`llSetScriptState("T", FALSE); ${end}`)
    expect(t.running).toBe(false)
  })
})

describe('a change held for a script that is busy after the wear', () => {
  const run = async (tSource: string, body: string, setUp?: (t: Script) => void, cExtra = '') => {
    const { linkset, scripts } = await loadLinkset({ owner: OWNER, prims: [{ scripts: [
      { name: 'T', source: { source: tSource } },
      { name: 'C', source: { source: `default { ${cExtra} link_message(integer s, integer i, string m, key id) {
        if (m != "go") return; llOwnerSay("x"); ${body} } }` } },
    ] }] })
    const t = scripts['T']!, c = scripts['C']!
    for (const s of Object.values(scripts)) s.start()
    linkset.attachToAvatar(OWNER, 5)
    linkset.advanceTime(100)
    setUp?.(t)
    c.mock('llOwnerSay', () => { linkset.detachFromAvatar(); return undefined })
    c.fire('link_message', { sender_num: 0, num: 0, str: 'go', id: '' })
    linkset.advanceTime(100)
    linkset.attachToAvatar(OWNER, 5)
    linkset.advanceTime(3_000)
    return t
  }

  it('waits for an attach handler that sleeps before resetting the script', async () => {
    const said: string[] = []
    const t = await run(`integer worn; default {
      attach(key id) { if (id) { if (worn) { llSleep(1.0); llOwnerSay("attach"); } worn = TRUE; } }
      state_entry() { llOwnerSay("entry"); } }`, 'llResetOtherScript("T");', s => {
      s.mock('llOwnerSay', (_ctx: unknown, args: readonly unknown[]) => { said.push(String(args[0])); return undefined })
    }, 'on_rez(integer p) { llSleep(0.2); }')
    expect(said).toEqual(['attach', 'entry'])
    expect(t.running).toBe(true)
  })

  it('outlives a state change in the script\'s on_rez', async () => {
    const t = await run(`default { on_rez(integer p) { llSleep(0.5); state two; } } state two { state_entry() {} }`,
      'llSetScriptState("T", FALSE);')
    expect(t.running).toBe(false)
  })

  it('is not lost when the script has 64 events waiting', async () => {
    const t = await run(`default { on_rez(integer p) {
      integer i; for (i = 0; i < 70; ++i) llMessageLinked(LINK_THIS, i, "", ""); llSleep(0.5); }
      link_message(integer s, integer n, string m, key id) {} }`, 'llSetScriptState("T", FALSE);')
    expect(t.running).toBe(false)
  })
})

it('applies held changes from two busy siblings in order: a stop and then a start leave the script running', async () => {
  const busy = (call: string) => `default { link_message(integer s, integer i, string m, key id) {
    if (m != "go") return; llOwnerSay("x"); ${call} } }`
  const { linkset, scripts } = await loadLinkset({ owner: OWNER, prims: [{ scripts: [
    { name: 'T', source: { source: target } },
    { name: 'C', source: { source: busy('llSetScriptState("T", FALSE);') } },
    { name: 'D', source: { source: busy('llSetScriptState("T", TRUE);') } },
  ] }] })
  for (const s of Object.values(scripts)) s.start()
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(0)
  const c = scripts['C']!, d = scripts['D']!
  c.mock('llOwnerSay', () => {
    d.mock('llOwnerSay', () => { linkset.detachFromAvatar(); return undefined })
    d.fire('link_message', { sender_num: 0, num: 0, str: 'go', id: '' })
    return undefined
  })
  c.fire('link_message', { sender_num: 0, num: 0, str: 'go', id: '' })
  linkset.advanceTime(0)
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(100)
  expect(scripts['T']!.running).toBe(true)
})

it('keeps a held change when the busy sibling changes state in its on_rez after the wear', async () => {
  const { linkset, scripts } = await loadLinkset({ owner: OWNER, prims: [{ scripts: [
    { name: 'T', source: { source: target } },
    { name: 'C', source: { source: `default { on_rez(integer p) { state other; }
      link_message(integer s, integer i, string m, key id) { if (m != "go") return; llOwnerSay("x"); llSetScriptState("T", FALSE); } }
      state other { state_entry() {} }` } },
  ] }] })
  for (const s of Object.values(scripts)) s.start()
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(0)
  const c = scripts['C']!
  c.mock('llOwnerSay', () => { linkset.detachFromAvatar(); return undefined })
  c.fire('link_message', { sender_num: 0, num: 0, str: 'go', id: '' })
  linkset.advanceTime(0)
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(100)
  expect(scripts['T']!.running).toBe(false)
})

it('applies held changes from two busy siblings in order: a reset after a stop does nothing', async () => {
  const busy = (call: string) => `default { link_message(integer s, integer i, string m, key id) {
    if (m != "go") return; llOwnerSay("x"); ${call} } }`
  const { linkset, scripts } = await loadLinkset({ owner: OWNER, prims: [{ scripts: [
    { name: 'T', source: { source: target } },
    { name: 'C', source: { source: busy('llSetScriptState("T", FALSE);') } },
    { name: 'D', source: { source: busy('llResetOtherScript("T");') } },
  ] }] })
  for (const s of Object.values(scripts)) s.start()
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(0)
  scripts['T']!.fire('link_message', { sender_num: 0, num: 0, str: 'two', id: '' })
  linkset.advanceTime(0)
  const c = scripts['C']!, d = scripts['D']!
  c.mock('llOwnerSay', () => {
    d.mock('llOwnerSay', () => { linkset.detachFromAvatar(); return undefined })
    d.fire('link_message', { sender_num: 0, num: 0, str: 'go', id: '' })
    return undefined
  })
  c.fire('link_message', { sender_num: 0, num: 0, str: 'go', id: '' })
  linkset.advanceTime(0)
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(100)
  expect(scripts['T']!.running).toBe(false)
  expect(scripts['T']!.global('n')).toBe(3)
})

it('keeps a held change when the busy sibling then stops itself', async () => {
  const { linkset, scripts } = await loadLinkset({ owner: OWNER, prims: [{ scripts: [
    { name: 'T', source: { source: target } },
    { name: 'C', source: { source: `default { link_message(integer s, integer i, string m, key id) {
      if (m != "go") return; llOwnerSay("x"); llSetScriptState("T", FALSE); llSetScriptState("C", FALSE); } }` } },
  ] }] })
  for (const s of Object.values(scripts)) s.start()
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(0)
  const c = scripts['C']!
  c.mock('llOwnerSay', () => { linkset.detachFromAvatar(); return undefined })
  c.fire('link_message', { sender_num: 0, num: 0, str: 'go', id: '' })
  linkset.advanceTime(0)
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(100)
  expect(scripts['T']!.running).toBe(false)
})

it('starts a script that stopped itself in its on_rez after the wear', async () => {
  const { linkset, scripts } = await loadLinkset({ owner: OWNER, prims: [{ scripts: [
    { name: 'T', source: { source: `list log; default { on_rez(integer p) { llSleep(0.5); llSetScriptState("T", FALSE); log += "on"; }
      attach(key id) { if (id) log += "attach"; } }` } },
    { name: 'C', source: { source: `default { link_message(integer s, integer i, string m, key id) {
      if (m != "go") return; llOwnerSay("x"); llSetScriptState("T", TRUE); } }` } },
  ] }] })
  for (const s of Object.values(scripts)) s.start()
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(100)
  const c = scripts['C']!, t = scripts['T']!
  t.setGlobal('log', [])
  c.mock('llOwnerSay', () => { linkset.detachFromAvatar(); return undefined })
  c.fire('link_message', { sender_num: 0, num: 0, str: 'go', id: '' })
  linkset.advanceTime(100)
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(2_000)
  expect(t.running).toBe(true)
  expect(t.global('log')).toEqual(['on', 'attach'])
})

// llResetOtherScript restarts a crashed script; a held reset does the same after the wear.
it('restarts a script that crashed in its on_rez after the wear, when the held change is a reset', async () => {
  const { linkset, scripts } = await loadLinkset({ owner: OWNER, prims: [{ scripts: [
    { name: 'T', source: { source: `list log; integer zero; default {
      state_entry() { log += "entry"; }
      on_rez(integer p) { zero = 1 / zero; } }` } },
    { name: 'C', source: { source: `default { link_message(integer s, integer i, string m, key id) {
      if (m != "go") return; llOwnerSay("x"); llResetOtherScript("T"); } }` } },
  ] }] })
  for (const s of Object.values(scripts)) s.start()
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(0)
  const c = scripts['C']!, t = scripts['T']!
  c.mock('llOwnerSay', () => { linkset.detachFromAvatar(); return undefined })
  c.fire('link_message', { sender_num: 0, num: 0, str: 'go', id: '' })
  linkset.advanceTime(0)
  t.setGlobal('log', [])
  linkset.attachToAvatar(OWNER, 5)
  try { linkset.advanceTime(100) } catch { /* T's on_rez crashes */ }
  linkset.advanceTime(100)
  expect(t.crashed).toBe(false)
  expect(t.running).toBe(true)
  expect(t.global('log')).toEqual(['entry'])
})

// A crashed script keeps a stop held for it; llResetOtherScript then leaves it down (in-world:
// crashed-script-running.test.ts).
it('stops a script that crashed in its on_rez after the wear, so a later reset leaves it down', async () => {
  const { linkset, scripts } = await loadLinkset({ owner: OWNER, prims: [{ scripts: [
    { name: 'T', source: { source: `list log; integer zero; default {
      state_entry() { log += "entry"; }
      on_rez(integer p) { zero = 1 / zero; } }` } },
    { name: 'C', source: { source: `default { link_message(integer s, integer i, string m, key id) {
      if (m == "reset") { llResetOtherScript("T"); return; }
      if (m != "go") return; llOwnerSay("x"); llSetScriptState("T", FALSE); } }` } },
  ] }] })
  for (const s of Object.values(scripts)) s.start()
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(100)
  const c = scripts['C']!, t = scripts['T']!
  c.mock('llOwnerSay', () => { linkset.detachFromAvatar(); return undefined })
  c.fire('link_message', { sender_num: 0, num: 0, str: 'go', id: '' })
  linkset.advanceTime(100)
  t.setGlobal('log', [])
  linkset.attachToAvatar(OWNER, 5)
  try { linkset.advanceTime(100) } catch { /* T's on_rez crashes */ }
  linkset.advanceTime(100)
  expect(t.crashed).toBe(true)
  c.fire('link_message', { sender_num: 0, num: 0, str: 'reset', id: '' })
  linkset.advanceTime(1000)
  expect(t.crashed).toBe(true)
  expect(t.global('log')).toEqual([])
  t.running = true
  c.fire('link_message', { sender_num: 0, num: 0, str: 'reset', id: '' })
  linkset.advanceTime(100)
  expect(t.global('log')).toEqual(['entry'])
})

describe('held changes in an object rezzed from the detached item', () => {
  const OWNER_KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const setUp = async (cBody: string, beforeGo?: (t: Script) => void) => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const avatar = world.addAvatar({ region: 'home', key: OWNER_KEY, username: 'owner' })
    const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER_KEY, prims: [{ scripts: [
      { name: 'T', source: { source: target } },
      { name: 'C', source: { source: `default { link_message(integer s, integer i, string m, key id) {
        if (m != "go") return; llOwnerSay("x"); ${cBody} } }` } },
    ] }] })
    for (const s of Object.values(scripts)) s.start()
    linkset.attachToAvatar(OWNER_KEY, 5)
    linkset.advanceTime(0)
    beforeGo?.(scripts['T']!)
    const c = scripts['C']!
    c.mock('llOwnerSay', () => { linkset.detachFromAvatar(); return undefined })
    c.fire('link_message', { sender_num: 0, num: 0, str: 'go', id: '' })
    linkset.advanceTime(0)
    return { world, avatar, linkset, scripts }
  }

  it('applies a stop held by a sibling that then stopped itself', async () => {
    const f = await setUp('llSetScriptState("T", FALSE); llSetScriptState("C", FALSE);')
    seedRlvInventory(f.avatar, { sharedRootId: null, entries: [{ id: 'item-1', kind: 'item', parentId: null, name: 'probe', object: f.linkset.copy(), assetType: 'object' }] })
    const rezzed = f.world.attemptAvatarRez(f.avatar, 'item-1', { x: 1, y: 2, z: 3 }).object!
    rezzed.advanceTime(100)
    expect(rezzed.prims[0]!.findScript('T')!.running).toBe(false)
  })
})

// A crashed LSL script comes back running from inventory, so a held stop is judged after that.
it('stops a script that had crashed before the detach, once the wear revives it', async () => {
  const { linkset, scripts } = await loadLinkset({ owner: OWNER, prims: [{ scripts: [
    { name: 'T', source: { source: `integer zero; default { link_message(integer s, integer i, string m, key id) { if (m == "boom") zero = 1 / zero; } }` } },
    { name: 'C', source: { source: `default { link_message(integer s, integer i, string m, key id) {
      if (m != "go") return; llOwnerSay("x"); llSetScriptState("T", FALSE); } }` } },
  ] }] })
  for (const s of Object.values(scripts)) s.start()
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(0)
  const t = scripts['T']!, c = scripts['C']!
  try { t.fire('link_message', { sender_num: 0, num: 0, str: 'boom', id: '' }); linkset.advanceTime(0) } catch { /* T crashes */ }
  expect(t.crashed).toBe(true)
  c.mock('llOwnerSay', () => { linkset.detachFromAvatar(); return undefined })
  c.fire('link_message', { sender_num: 0, num: 0, str: 'go', id: '' })
  linkset.advanceTime(0)
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(100)
  expect(t.crashed).toBe(false)
  expect(t.running).toBe(false)
})

it('takes no event slot from the busy sibling for the change it holds', async () => {
  const { linkset, scripts } = await loadLinkset({ owner: OWNER, prims: [{ scripts: [
    { name: 'T', source: { source: target } },
    { name: 'C', source: { source: `list log; default {
      attach(key id) { if (id) log += "worn"; }
      link_message(integer s, integer i, string m, key id) {
        if (m != "go") return;
        integer k; for (k = 0; k < 61; ++k) llMessageLinked(LINK_THIS, k, "", "");
        llOwnerSay("x"); llSetScriptState("T", FALSE); } }` } },
  ] }] })
  for (const s of Object.values(scripts)) s.start()
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(0)
  const c = scripts['C']!
  c.setGlobal('log', [])
  c.mock('llOwnerSay', () => { linkset.detachFromAvatar(); return undefined })
  c.fire('link_message', { sender_num: 0, num: 0, str: 'go', id: '' })
  linkset.advanceTime(0)
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(2_000)
  expect(scripts['T']!.running).toBe(false)
  expect(c.global('log')).toEqual(['worn'])
})
