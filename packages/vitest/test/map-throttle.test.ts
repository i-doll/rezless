import { describe, expect, it } from 'vitest'
import { loadLinkset, seedRlvInventory, World, type Script } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlMapDestination, https://wiki.secondlife.com/wiki/LlMapBeacon
// Measured on the Aditi beta grid, SLua Tideland, 2026-11-24, as i doll. The probe ran in
// attachments i doll wore, which show their maps to the owner from any event. On a chat
// command it made timed runs of calls, each with its own position, and logged when it made
// each call; the viewer's log showed which maps reached it, and the owner's chat the errors.
// Runs were 20 to 40 s apart.
const OWNER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const DEBUG_CHANNEL = 2147483647
const ERROR = 'Too many llMapDestination() function calls; halted until average falls.'
const FLOOD = 'Too many errors... dropping further messages until the flood stops'

// "go <ids> <tag> <d|b> <steps>": each step "N@T/G" makes N calls from T s into the run, G s apart.
const probe = `string me;
default {
  state_entry() { me = llGetObjectDesc() + llGetSubString(llGetScriptName(), -1, -1); llListen(7730, "", NULL_KEY, ""); }
  listen(integer ch, string name, key id, string msg) {
    list a = llParseString2List(msg, [" "], []);
    if (llListFindList(llParseString2List(llList2String(a, 1), [","], []), [me]) == -1) return;
    integer tag = llList2Integer(a, 2);
    string fn = llList2String(a, 3);
    list steps = llList2List(a, 4, -1);
    float t0 = llGetTime();
    integer idx;
    integer s;
    for (s = 0; s < llGetListLength(steps); ++s) {
      list p = llParseString2List(llList2String(steps, s), ["@", "/"], []);
      integer k;
      for (k = 0; k < llList2Integer(p, 0); ++k) {
        float wait = llList2Float(p, 1) + llList2Float(p, 2) * k - (llGetTime() - t0);
        if (wait > 0.0) llSleep(wait);
        if (fn == "b") llMapBeacon("SLua Tideland", <tag, idx, 30>, []);
        else llMapDestination("SLua Tideland", <tag, idx, 30>, ZERO_VECTOR);
        ++idx;
      }
    }
  }
}`

// touch_start makes a call at each of the given times into the event.
const toucher = (times: string) => `default {
  touch_start(integer n) {
    list plan = [${times}];
    float t0 = llGetTime();
    integer i;
    for (i = 0; i < llGetListLength(plan); ++i) {
      float w = llList2Float(plan, i) - (llGetTime() - t0);
      if (w > 0.0) llSleep(w);
      llMapDestination("SLua Tideland", <21, i, 30>, ZERO_VECTOR);
    }
  }
}`

async function setup() {
  const world = new World()
  world.addRegion('SLua Tideland', { x: 40960, y: 23296 })
  world.addAvatar({ region: 'SLua Tideland', key: OWNER, username: 'i.doll' })
  world.addAvatar({ region: 'SLua Tideland', key: OTHER, username: 'fivebot' })
  const wear = async (desc: string, scripts: string[], point: number, owner = OWNER) => {
    const { linkset } = await loadLinkset({ world, region: 'SLua Tideland', owner,
      prims: [{ name: `probe ${desc}`, description: desc, scripts: scripts.map(name => ({ name: `probe ${name}`, source: { source: probe } })) }] })
    linkset.attachToAvatar(owner, point)
    for (const s of linkset.allScripts()) s.start()
    return linkset
  }
  const a = await wear('A', ['s1', 's2'], 1)
  const rezzed = async (source: string) => {
    const { linkset, scripts } = await loadLinkset({ world, region: 'SLua Tideland', owner: OWNER,
      prims: [{ name: 'probe C', scripts: [{ name: 'probe s1', source: { source } }] }] })
    const script = scripts['probe s1']!
    script.start()
    return { linkset, script }
  }
  const scripts = () => a.allScripts()
  const go = (message: string) => {
    for (const s of scripts()) s.deliverChat({ channel: 7730, name: 'i Doll', key: OWNER, message })
  }
  const shown = (tag: number, from: Script[] = scripts()) => from.flatMap(s => s.viewerRequests)
    .map(r => (r as unknown as { position: { x: number; y: number } }).position)
    .filter(p => p.x === tag).map(p => p.y)
  const errors = (from: Script[] = scripts()) => from.flatMap(s => s.chat).filter(c => c.channel === DEBUG_CHANNEL).map(c => c.text)
  return { world, a, go, shown, errors, rezzed, scripts, wear }
}

const range = (n: number, from = 0) => Array.from({ length: n }, (_, i) => from + i)

describe('map call throttle', () => {
  // In-world: 30 calls in one event, each taking 1 s -> the first 4 maps showed, and every
  // later call said the error, until the error flood cap: 8 errors, the flood notice, then
  // nothing. 22 s after the last of them, 6 calls showed 4 maps again.
  it('shows 4 maps from a run of calls and refuses the rest with an error, up to the error flood cap', async () => {
    const { a, go, shown, errors } = await setup()
    go('go A1 1 d 30@0')
    a.advanceTime(31_000)
    expect(shown(1)).toEqual(range(4))
    expect(errors()).toEqual([...Array(8).fill(ERROR), FLOOD])
    a.advanceTime(22_000)
    go('go A1 2 d 6@0')
    a.advanceTime(7_000)
    expect(shown(2)).toEqual(range(4))
  })

  // In-world: each run started from an idle throttle; the calls in "4@0" were 1 s apart.
  it.each([
    ['4@0 1@4.5', range(4)],
    ['4@0 1@5', range(5)],
    ['4@0 1@5.5', range(5)],
    ['4@0 1@6', range(5)],
    ['4@0 1@9', range(5)],
    ['4@0 1@12', range(5)],
    ['4@0 1@15', range(5)],
    ['20@0/1.25', range(17)],
    ['15@0/1.5', range(15)],
    ['12@0/2', range(12)],
    ['4@0 10@5/1', range(8)],
    ['10@0/1 1@14 1@18', [...range(4), 11]],
    ['10@0/1 1@16 1@20', [...range(4), 10, 11]],
  ])('counts maps over 4 s periods: %s shows %j', async (steps, expected) => {
    const { a, go, shown } = await setup()
    go(`go A1 5 d ${steps}`)
    a.advanceTime(30_000)
    expect(shown(5)).toEqual(expected)
  })

  // In-world: two scripts in one attachment and a script in a second attachment each made
  // 3 calls at once -> 4 maps between them, and 5 errors.
  it('counts the maps of all the owner\'s scripts and objects together', async () => {
    const { a, go, shown, errors, wear, scripts } = await setup()
    const b = await wear('B', ['s1'], 2)
    const all = [...scripts(), ...b.allScripts()]
    for (const s of b.allScripts()) s.deliverChat({ channel: 7730, name: 'i Doll', key: OWNER, message: 'go A1,A2,B1 3 d 3@0' })
    go('go A1,A2,B1 3 d 3@0')
    a.advanceTime(4_000)
    expect(shown(3, all)).toHaveLength(4)
    expect(errors(all)).toEqual(Array(5).fill(ERROR))
  })

  // In-world: 6 llMapBeacon calls -> 4 beacons, then 2 errors naming llMapDestination. One
  // script calling llMapDestination and another llMapBeacon, 3 times each at once -> 4 between them.
  it('counts llMapBeacon with llMapDestination and refuses it with the same error', async () => {
    const beacons = await setup()
    beacons.go('go A1 17 b 6@0')
    beacons.a.advanceTime(7_000)
    expect(beacons.shown(17)).toEqual(range(4))
    expect(beacons.errors()).toEqual([ERROR, ERROR])

    const mixed = await setup()
    mixed.go('go A1 18 d 3@0')
    mixed.go('go A2 18 b 3@0')
    mixed.a.advanceTime(4_000)
    expect(mixed.shown(18)).toHaveLength(4)
  })

  // In-world: a rezzed object made 6 calls from a listen, showing nobody, with no error. A
  // worn object's call 7 s after the first of them showed its map.
  it('does not count calls that show nobody', async () => {
    const { a, go, shown, errors, rezzed } = await setup()
    const c = await rezzed(probe.replace('llGetObjectDesc()', '"C"'))
    c.script.deliverChat({ channel: 7730, name: 'i Doll', key: OWNER, message: 'go C1 19 d 6@0' })
    a.advanceTime(7_000)
    go('go A1 20 d 1@0')
    a.advanceTime(1_000)
    expect(shown(19, [c.script])).toEqual([])
    expect(errors([c.script])).toEqual([])
    expect(shown(20)).toEqual([0])
  })

  // In-world: a click on a rezzed object whose touch_start made 6 calls showed the first
  // map alone, with no error, and a worn object's call 7.6 s after the click showed its map.
  it('does not count a click\'s calls after the first', async () => {
    const { a, go, shown, errors, rezzed } = await setup()
    const c = await rezzed(toucher('0, 0, 0, 0, 0, 0'))
    c.linkset.touch(0)
    a.advanceTime(7_600)
    go('go A1 22 d 1@0')
    a.advanceTime(1_000)
    expect(shown(21, [c.script])).toEqual([0])
    expect(errors()).toEqual([])
    expect(shown(22)).toEqual([0])
  })

  // In-world: a worn object made 5 calls, the last refused. 4.6 s after its first, a click on
  // a rezzed object whose touch_start called at once and again 4.5 s later: the first call
  // said the error, and the second neither showed nor said it.
  it('uses up a click\'s one map on a refused call', async () => {
    const { a, go, shown, errors, rezzed } = await setup()
    const c = await rezzed(toucher('0, 4.5'))
    go('go A1 24 d 5@0')
    a.advanceTime(4_600)
    c.linkset.touch(0)
    a.advanceTime(8_000)
    expect(shown(24)).toEqual(range(4))
    expect(shown(21, [c.script])).toEqual([])
    expect(errors()).toEqual([ERROR])
    expect(errors([c.script])).toEqual([ERROR])
  })
})

describe('map call throttle for each avatar shown', () => {
  // In-world (both avatars): i doll's worn object made 6 calls, refused from the fifth. 4.6 s
  // after its first, fivebot clicked i doll's rezzed object, whose touch_start's map showed
  // to fivebot. When fivebot's own worn object made the 6 calls instead, the map from the same
  // click was refused, and i doll's object said the error.
  it.each([[OWNER, [0]], [OTHER, []]] as const)('counts maps for the avatar shown them: calls shown to %s first', async (first, expected) => {
    const { a, shown, errors, rezzed, wear } = await setup()
    const f = await wear('F', ['s1'], 1, OTHER)
    const burner = first === OWNER ? a.allScripts()[0]! : f.allScripts()[0]!
    const id = first === OWNER ? 'A1' : 'F1'
    const c = await rezzed(toucher('0'))
    burner.deliverChat({ channel: 7730, name: 'avatar', key: first, message: `go ${id} 30 d 6@0` })
    a.advanceTime(4_600)
    c.linkset.touch(0, { avatar: { key: OTHER, name: 'fivebot' } })
    a.advanceTime(3_000)
    expect(shown(30, [burner])).toEqual(range(4))
    expect(shown(21, [c.script])).toEqual(expected)
    expect(errors([c.script])).toEqual(expected.length ? [] : [ERROR])
  })
})

// In-world: fivebot's worn object made a call a second for 30 s. The fifth to seventh were
// refused; fivebot teleported from SLua Tideland to SLua Tombolo between the seventh and the
// eighth, and the eighth to eleventh showed there before the calls were refused again.
it('keeps each avatar\'s map count in each region', async () => {
  const { world, a, go, shown } = await setup()
  world.addRegion('SLua Tombolo', { x: 40960, y: 23552 })
  const avatar = world.avatars.find(x => x.key === OWNER)!
  // The probe sleeps between calls, so the teleport waits on the clock rather than for it to finish.
  a.clock.scheduleTask(a.allScripts()[0]!, 6_500, () => world.teleportAvatar(avatar, { x: 40960 + 128, y: 23552 + 128, z: 60 }))
  go('go A1 35 d 30@0/1')
  a.advanceTime(31_000)
  expect(shown(35)).toEqual([...range(4), ...range(4, 7)])
})

// https://wiki.secondlife.com/wiki/Touch
// In-world (Aditi, SLua Tideland, 2026-11-24): i doll held a click on its object, whose
// touch_start called llMapDestination and whose first touch after an on_rez or attach called
// it again. The object was taken 4 s into the hold and rezzed again, or detached and worn
// again. Either way its touch events carried on in the new object, the release never reached
// it, and the first touch's map showed. The click ended at i doll's next click, with
// touch_end alone. Here the click is carried the way rezless carries any click whose release
// a script missed: its script is stopped through the release and set running again.
describe('maps from a held click carried through inventory', () => {
  const holder = `integer first;
default {
  on_rez(integer p) { first = TRUE; }
  attach(key id) { if (id) first = TRUE; }
  touch_start(integer k) { first = FALSE; llMapDestination("SLua Tideland", <41, 0, 30>, ZERO_VECTOR); }
  touch(integer k) {
    if (first) { first = FALSE; llMapDestination("SLua Tideland", <41, 1, 30>, ZERO_VECTOR); }
  }
}`
  const stopper = `integer done;
default {
  touch_start(integer n) { if (!done) llSetTimerEvent(0.5); done = TRUE; }
  timer() { llSetTimerEvent(0); llSetScriptState("s", FALSE); }
  link_message(integer s, integer n, string m, key k) { if (m == "go") llSetScriptState("s", TRUE); }
}`
  const ys = (s: Script) => s.viewerRequests.map(r => (r as unknown as { position: { y: number } }).position.y)

  async function carried(worn: boolean) {
    const world = new World()
    world.addRegion('SLua Tideland', { x: 40960, y: 23296 })
    const avatar = world.addAvatar({ region: 'SLua Tideland', key: OWNER, username: 'i.doll' })
    const { linkset, scripts } = await loadLinkset({ world, region: 'SLua Tideland', owner: OWNER,
      prims: [{ name: 'probe E', scripts: [{ name: 's', source: { source: holder } }, { name: 'c', source: { source: stopper } }] }] })
    for (const s of Object.values(scripts)) s.start()
    if (worn) linkset.attachToAvatar(OWNER, 6)
    linkset.advanceTime(1_000)
    linkset.touch(0, { hold: 2_000 })
    linkset.deliverLinkMessage(0, 0, 0, 'go', '')
    linkset.advanceTime(1_000)
    return { world, avatar, linkset, script: scripts.s! }
  }

  it('shows the first touch\'s map in an object rezzed from a take', async () => {
    const { world, avatar, linkset, script } = await carried(false)
    const saved = linkset.copy()
    linkset.remove()
    seedRlvInventory(avatar, { sharedRootId: null, entries: [{ id: 'e', kind: 'item', parentId: null, name: 'probe E', object: saved, assetType: 'object' }] })
    const rezzed = world.attemptAvatarRez(avatar, 'e', { x: 114, y: 43, z: 1998 }).object!
    rezzed.advanceTime(1_000)
    expect(ys(script)).toEqual([0])
    expect(ys(rezzed.allScripts().find(s => s.scriptName === 's')!)).toEqual([1])
  })

  it('shows the first touch\'s map after a detach and a wear', async () => {
    const { linkset, script } = await carried(true)
    linkset.detachFromAvatar()
    linkset.attachToAvatar(OWNER, 6)
    linkset.advanceTime(1_000)
    expect(ys(script)).toEqual([0, 1])
  })
})

// In-world (Aditi, SLua Tideland, 2026-11-24): i doll's rezzed object held six scripts whose
// touch_start slept 10 s and then made one call each, with its own position. fivebot clicked
// it and teleported to SLua Tombolo; it had arrived before the calls, which found it gone from
// the region (llGetAgentSize was ZERO_VECTOR). fivebot's viewer still got the first 4 maps in
// SLua Tombolo, and the object said the error twice. 1.5 s later fivebot's worn object made 5
// calls a second apart in SLua Tombolo: the first 4 showed and the fifth was refused, as from a
// fresh count. The same run with llMapBeacon gave the same 4 and 2 errors.
// A third run had fivebot log out right after the click: the six calls said nothing.
describe('maps for a clicker who left the region during the event', () => {
  const sleeper = (call: string) => `default {
  touch_start(integer n) {
    integer i = (integer)llGetSubString(llGetScriptName(), -1, -1);
    llSleep(10.0);
    ${call};
  }
}`
  const clicked = async (world: World, call: string) => {
    const { linkset } = await loadLinkset({ world, region: 'SLua Tideland', owner: OWNER,
      prims: [{ name: 'probe map', scripts: range(6).map(i => ({ name: `probe ${i}`, source: { source: sleeper(call) } })) }] })
    for (const s of linkset.allScripts()) s.start()
    return linkset
  }
  const calls = {
    llMapDestination: 'llMapDestination("SLua Tideland", <10 + i, 20, 30>, ZERO_VECTOR)',
    llMapBeacon: 'llMapBeacon("SLua Tideland", <10 + i, 20, 30>, [])',
  }

  it.each(Object.entries(calls))('%s shows the map in the new region and counts it in the old one', async (_, call) => {
    const { world, errors, wear, scripts } = await setup()
    world.addRegion('SLua Tombolo', { x: 40960, y: 23552 })
    const fivebot = world.avatars.find(x => x.key === OTHER)!
    const worn = await wear('F', ['s1'], 1, OTHER)
    const c = await clicked(world, call)
    // The click runs its sleeping event through, so the teleport is set on the clock first.
    c.clock.scheduleTask(scripts()[0]!, c.clock.now + 2_000, () => world.teleportAvatar(fivebot, { x: 40960 + 128, y: 23552 + 128, z: 30 }))
    c.touch(0, { avatar: { key: OTHER, name: 'fivebot' } })
    expect(fivebot.region).toBe('SLua Tombolo')
    const requests = c.allScripts().flatMap(s => s.viewerRequests)
    expect(requests).toHaveLength(4)
    expect(requests.every(r => r.agent === OTHER)).toBe(true)
    expect(errors(c.allScripts())).toEqual([ERROR, ERROR])
    worn.advanceTime(1_500)
    for (const s of worn.allScripts()) s.deliverChat({ channel: 7730, name: 'fivebot', key: OTHER, message: 'go F1 36 d 5@0/1' })
    worn.advanceTime(6_000)
    expect(worn.allScripts().flatMap(s => s.viewerRequests)).toHaveLength(4)
    expect(errors(worn.allScripts())).toEqual([ERROR])
  })

  it('shows nothing and says nothing to a clicker who logged out', async () => {
    const { world, errors, scripts } = await setup()
    const c = await clicked(world, calls.llMapDestination)
    const gone = '33333333-3333-3333-3333-333333333333'
    c.clock.scheduleTask(scripts()[0]!, c.clock.now + 2_000, () => c.allScripts()[0]!.setAgentInRegion(gone, false))
    c.touch(0, { avatar: { key: gone, name: 'Gone' } })
    expect(c.allScripts().flatMap(s => s.viewerRequests)).toEqual([])
    expect(errors(c.allScripts())).toEqual([])
  })
})
