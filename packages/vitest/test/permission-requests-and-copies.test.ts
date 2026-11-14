import { describe, expect, it } from 'vitest'
import { loadLinkset, loadRlvPair, loadScript, makeInventoryItem, InventoryType, seedRlvInventory, World } from '../src/index.js'
import type { Linkset, Script } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlRequestPermissions
//
// Every "In-world" note below was measured on Aditi, SLua Tideland, 2026-11-13, with a
// Firestorm viewer whose avatar owned every probe object.
//
// The probe object held an LSL script and an SLua script that did the same things. Each made a
// request when told to on a chat channel and said llGetPermissions(), whether
// llGetPermissionsKey() was its owner, and its counters on the next line and from
// run_time_permissions, on_rez, attach and changed. A second prim listened on DEBUG_CHANNEL. The
// viewer's pending permission dialogs, with the bits each one asked for, were listed after every
// step.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const UNKNOWN = '5f3c1a22-9b7e-4c1d-8e2f-6a7b8c9d0e1f'
const NULL_KEY = '00000000-0000-0000-0000-000000000000'
const DEBUG_CHANNEL = 2147483647
const NOT_FOUND = 'Unable to find specified agent to request permissions.'
const CAMERA_REFUSAL = 'Camera control currently only supported for attachments and objects on which you are sitting.'

const DEBIT = 2, CONTROLS = 4, REMAP = 8, ANIMATION = 16, ATTACH = 32, RELEASE = 64, LINKS = 128, JOINTS = 256, MEDIA = 512
const TRACK = 1024, CAMERA = 2048
const CHANGED_LINK = 32
/** 3094: what the seat probes were granted by their sitter from one dialog. */
const SEAT_SET = DEBIT | CONTROLS | ANIMATION | TRACK | CAMERA
/** 1042: what a stand leaves of SEAT_SET. */
const STOOD_SET = DEBIT | ANIMATION | TRACK

const lsl = `
  integer n; integer ticks; integer changes; list log; key last;
  string where() { return (string)llGetPermissions() + " " + (string)llGetPermissionsKey(); }
  default {
    state_entry() { llListen(5, "", "", ""); llOwnerSay("main"); }
    on_rez(integer p) { log += "rez " + where() + " n=" + (string)n + " changes=" + (string)changes; }
    changed(integer c) { ++changes; log += "changed " + (string)c + " " + where(); }
    attach(key id) { log += "attach " + where(); }
    run_time_permissions(integer p) { log += "rtp " + (string)p + " " + where(); }
    listen(integer c, string name, key id, string m) { log += "heard " + (string)c + " " + m; }
    timer() { ++ticks; }
    object_rez(key id) { last = id; }
    link_message(integer from, integer num, string s, key id) {
      if (s == "inc") ++n;
      else if (s == "timer") llSetTimerEvent(2.0);
      else if (s == "listen") llListen(6, "", "", "");
      else if (s == "ask") { llRequestPermissions(id, num); log += "asked " + where(); }
      else if (s == "report") log += "state " + where() + " n=" + (string)n + " ticks=" + (string)ticks;
      else if (s == "derez") log += "derez " + (string)llDerezObject(last, num);
      else if (s == "reset") llResetScript();
      else llRezObject(s, llGetPos() + <0, 0, 1>, ZERO_VECTOR, ZERO_ROTATION, 5);
    }
  }`

// The SLua twin. Its counters live in an upvalue, a global and a table field, and it has a
// coroutine, so a copy that kept only some of them shows.
const slua = `
  local n = 0
  count = 0
  ticks = 0
  log = {}
  local tbl = { hits = 0 }
  local co = coroutine.wrap(function() local i = 0; while true do i += 1; coroutine.yield(i) end end)
  local function where() return ll.GetPermissions() .. " " .. tostring(ll.GetPermissionsKey()) end
  local function counters() return "n=" .. n .. " count=" .. count .. " hits=" .. tbl.hits end
  ll.Listen(5, "", "", "")
  ll.OwnerSay("main")
  LLEvents:on("on_rez", function(p) table.insert(log, "rez " .. where() .. " " .. counters()) end)
  LLEvents:on("changed", function(c) table.insert(log, "changed " .. c .. " " .. where()) end)
  LLEvents:on("attach", function(id) table.insert(log, "attach " .. where()) end)
  LLEvents:on("run_time_permissions", function(p) table.insert(log, "rtp " .. p .. " " .. where()) end)
  LLEvents:on("listen", function(c, name, id, m) table.insert(log, "heard " .. c .. " " .. m) end)
  LLEvents:on("link_message", function(from, num, s, id)
    if s == "inc" then n += 1; count += 1; tbl.hits += 1; co()
    elseif s == "timer" then LLTimers:every(2, function() ticks += 1 end)
    elseif s == "handlers" then
      LLEvents:on("touch_start", function() table.insert(log, "touched " .. counters()) end)
      LLEvents:once("touch_end", function() table.insert(log, "once") end)
    elseif s == "listen" then ll.Listen(6, "", "", "")
    elseif s == "ask" then ll.RequestPermissions(id, num); table.insert(log, "asked " .. where())
    elseif s == "report" then table.insert(log, "state " .. where() .. " " .. counters() .. " ticks=" .. ticks .. " co=" .. co())
    elseif s == "reset" then ll.ResetScript()
    end
  end)`

type Twin = 'lsl' | 'slua'

function driver(script: Script) {
  const tell = (str: string, num = 0, id = NULL_KEY) => {
    script.fire('link_message', { sender_num: 0, num, str, id })
    script.linkset.advanceTime(0)
  }
  /** Ask `agent` (the owner by default) for `bits`. */
  const ask = (bits: number, agent = script.linkset.owner) => tell('ask', bits, agent)
  const log = () => script.global('log') as string[]
  /** What the script holds and for whom, read by the script itself. */
  const held = () => {
    tell('report')
    const [, bits, key] = log().at(-1)!.split(' ')
    return [Number(bits), key]
  }
  const report = () => {
    tell('report')
    return log().at(-1)!
  }
  const errors = () => script.chat.filter(c => c.channel === DEBUG_CHANNEL).map(c => c.text)
  const events = () => log().filter(line => line.startsWith('rtp')).map(line => Number(line.split(' ')[1]))
  return { script, tell, ask, log, held, report, errors, events }
}

async function fixture(opts: { world?: World } = {}) {
  const world = opts.world ?? new World()
  world.addRegion('home', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
  const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [
    { name: 'lsl', source: { source: lsl } },
    { name: 'slua', source: { source: slua }, language: 'slua' },
  ] }] })
  for (const script of Object.values(scripts)) script.start()
  return { world, avatar, linkset, lsl: driver(scripts.lsl!), slua: driver(scripts.slua!) }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

/** The two probes of a rezzed object, once its rez events have run. */
function twins(object: Linkset) {
  object.advanceTime(0)
  const find = (name: string) => driver(object.allScripts().find(s => s.scriptName === name)!)
  return { linkset: object, lsl: find('lsl'), slua: find('slua') }
}

/** Rez `saved` from the avatar's inventory, as dragging the item onto the ground does. */
function rez(f: Fixture, saved: Linkset) {
  seedRlvInventory(f.avatar, { sharedRootId: null, entries: [{ id: 'item', kind: 'item', parentId: null, name: 'probe', object: saved, assetType: 'object' }] })
  return twins(f.world.attemptAvatarRez(f.avatar, 'item', { x: 1, y: 2, z: 3 }).object!)
}

/** Take the object into inventory: a copy is saved and the object goes. */
function take(f: { linkset: Linkset }) {
  const saved = f.linkset.copy()
  f.linkset.remove()
  return saved
}

/** A prim with the LSL probe that holds `saved` in its contents and rezzes it when told to. */
async function rezzerWith(f: Fixture, saved: Linkset) {
  const rezzer = await loadLinkset({ world: f.world, region: 'home', owner: OWNER,
    prims: [{ scripts: [{ name: 'lsl', source: { source: lsl } }] }] })
  rezzer.scripts.lsl!.start()
  rezzer.prims[0]!.addInventory(makeInventoryItem({ name: 'probe', type: InventoryType.OBJECT, key: saved.prims[0]!.key, object: saved }))
  const control = driver(rezzer.scripts.lsl!)
  const rezOne = () => {
    const before = f.world.linksets.length
    control.tell('probe')
    expect(f.world.linksets).toHaveLength(before + 1)
    return twins(f.world.linksets.at(-1)!)
  }
  return { ...control, rezOne }
}

describe('a permission request to a key that is not an avatar', () => {
  const BITS = [0, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072,
    262144, 524288, 1048576, 18, 2064, 2080766]

  /** The probes hold 16 for the owner from a dialog and have a dialog for 2 waiting. */
  async function holding() {
    const f = await fixture()
    const other = await loadLinkset({ world: f.world, region: 'home', owner: OWNER, prims: [{}] })
    for (const probe of [f.lsl, f.slua]) {
      probe.ask(ANIMATION)
      probe.script.grantPermissions()
      probe.ask(DEBIT)
    }
    const keys = { 'NULL_KEY': NULL_KEY, 'an unknown key': UNKNOWN, "the script's own prim": f.linkset.prims[0]!.key,
      "another object's prim": other.linkset.prims[0]!.key }
    return { ...f, keys }
  }

  // In-world: a probe that held 16 for its owner and had a dialog for 2 waiting made 25 requests,
  // 5 s apart, to each of NULL_KEY, a key that is nobody's, its own prim's key and another prim's
  // key: every bit alone (0, 1, 2 ... 1048576, the dropped bits 1 and 8192 included), 18, 2064 and
  // 2080766 (every bit). DEBUG_CHANNEL said the sentence below once per request: 25 of 25 for
  // NULL_KEY, and one for one in the other three runs. run_time_permissions never fired, and
  // after every request llGetPermissions() still read 16 for the owner.
  it.each(['NULL_KEY', 'an unknown key', "the script's own prim", "another object's prim"] as const)(
    'fails every request to %s with an error', async name => {
      const f = await holding()
      for (const bits of BITS) f.lsl.ask(bits, f.keys[name])
      expect(f.lsl.errors()).toEqual(BITS.map(() => NOT_FOUND))
      expect(f.lsl.events()).toEqual([ANIMATION])
      expect(f.lsl.log().filter(line => line.startsWith('asked')).slice(2)).toEqual(BITS.map(() => `asked 16 ${OWNER}`))
      expect(f.lsl.script.permissionRequests.map(r => r.permissions)).toEqual([ANIMATION, DEBIT])
    })

  // In-world: llRequestPermissions("", 16) and llRequestPermissions((key)"not-a-key", 16) gave the
  // same error, from LSL and from SLua.
  it.each(['', 'not-a-key'])('fails a request to %j, which is not a key at all', async key => {
    const f = await fixture()
    for (const probe of [f.lsl, f.slua]) {
      probe.ask(ANIMATION, key)
      expect(probe.errors()).toEqual([NOT_FOUND])
      expect(probe.script.permissionRequests).toEqual([])
    }
  })

  // In-world: after all 100 of those requests the dialog for 2 was still on screen, and Grant
  // fired run_time_permissions(2). A failed request leaves a waiting dialog alone.
  it('leaves the held permissions and a waiting dialog as they were', async () => {
    const f = await holding()
    for (const key of Object.values(f.keys)) f.lsl.ask(ANIMATION | DEBIT, key)
    expect(f.lsl.held()).toEqual([ANIMATION, OWNER])
    f.lsl.script.grantPermissions()
    expect(f.lsl.events()).toEqual([ANIMATION, DEBIT])
    expect(f.lsl.held()).toEqual([DEBIT, OWNER])
  })

  // In-world: a probe that held nothing asked NULL_KEY for 16 -> the error, and it still read 0
  // with NULL_KEY as the permission key. Starting from nothing shows the key is not set either.
  it('sets nothing on a script that holds nothing', async () => {
    const f = await fixture()
    f.lsl.ask(ANIMATION, NULL_KEY)
    expect(f.lsl.errors()).toEqual([NOT_FOUND])
    expect(f.lsl.held()).toEqual([0, NULL_KEY])
    expect(f.lsl.script.permissionRequests).toEqual([])
    expect(() => f.lsl.script.grantPermissions()).toThrow('no pending permission request')
  })

  // In-world: the SLua twin, holding permissions for its owner, asked NULL_KEY for 16 -> the same
  // sentence on DEBUG_CHANNEL, and it held what it had before.
  it('fails the same way from SLua', async () => {
    const f = await holding()
    f.slua.ask(ANIMATION, NULL_KEY)
    expect(f.slua.errors()).toEqual([NOT_FOUND])
    expect(f.slua.held()).toEqual([ANIMATION, OWNER])
    expect(f.slua.events()).toEqual([ANIMATION])
  })

  // In-world: a probe asked the parcel owner's key, a real account that was not online, for 16 ->
  // the same error. An avatar the world does not hold is one the grid cannot find.
  it('fails a request to an avatar who is not in the world', async () => {
    const f = await fixture()
    f.lsl.ask(ANIMATION, BOB)
    expect(f.lsl.errors()).toEqual([NOT_FOUND])
    f.world.addAvatar({ region: 'home', key: BOB, username: 'bob' })
    f.lsl.ask(ANIMATION, BOB)
    expect(f.lsl.errors()).toEqual([NOT_FOUND])
    f.lsl.script.grantPermissions()
    expect(f.lsl.held()).toEqual([ANIMATION, BOB])
  })

  // In-world: a probe asked its owner for 16 after a 25 s sleep, by which time the owner had
  // teleported to the next region north (SLua Tombolo) -> no error; the dialog reached the viewer
  // there, and Yes from there fired run_time_permissions(16). The same with the owner in a
  // region far away (Ahern), asked for 4: the dialog arrived there, and Yes after coming back
  // fired run_time_permissions(4). The grid found the avatar in both.
  it.each([['the next region', { x: 0, y: 256 }], ['a region far away', { x: 214272, y: 233216 }]])(
    'asks an avatar who is in %s', async (_, corner) => {
      const f = await fixture()
      f.world.addRegion('elsewhere', corner)
      f.avatar.region = 'elsewhere'
      f.lsl.ask(ANIMATION)
      expect(f.lsl.errors()).toEqual([])
      expect(f.lsl.script.permissionRequests).toEqual([{ agent: OWNER, permissions: ANIMATION, answered: false }])
      f.lsl.script.grantPermissions()
      expect(f.lsl.events()).toEqual([ANIMATION])
      expect(f.lsl.held()).toEqual([ANIMATION, OWNER])
    })

  // In-world: in the runs above the standing probe asked NULL_KEY, the unknown key and the prims
  // for 2048, 2064 and 2080766 -> the agent error each time, never the camera control one, which
  // is what its standing owner gets for 2048.
  it('looks for the agent before it checks camera control', async () => {
    const f = await fixture()
    f.lsl.ask(CAMERA, NULL_KEY)
    f.lsl.ask(CAMERA)
    expect(f.lsl.errors()).toEqual([NOT_FOUND, CAMERA_REFUSAL])
  })

  // The test's own grant is not the grid's: a function that grants everything still does.
  it('still lets an autoGrantPermissions function grant the request', async () => {
    const f = await fixture()
    f.lsl.script.autoGrantPermissions = () => true
    f.lsl.ask(ANIMATION, UNKNOWN)
    expect(f.lsl.errors()).toEqual([])
    expect(f.lsl.held()).toEqual([ANIMATION, UNKNOWN])
  })

  describe('outside a world', () => {
    const asking = (owner?: string) => loadScript({ owner, source: `
      default {
        link_message(integer from, integer num, string s, key id) { llRequestPermissions(id, num); }
        touch_start(integer n) { llRequestPermissions(llGetOwner(), 16); }
        touch_end(integer n) { llRequestPermissions(llGetKey(), 16); }
      }` })
    const errors = (script: Script) => script.chat.filter(c => c.channel === DEBUG_CHANNEL).map(c => c.text)

    // A script loaded alone has no world to hold avatars. Its owner stands in for one, whatever
    // key that is, and so does any other key that could be an avatar's.
    it('takes the owner, and any other key that is not a prim, for an avatar', async () => {
      const script = await asking(OWNER)
      script.fire('touch_start', { num_detected: 1 })
      script.grantPermissions()
      script.fire('link_message', { sender_num: 0, num: ANIMATION, str: '', id: BOB })
      script.grantPermissions()
      expect(errors(script)).toEqual([])
      expect(script.permissionRequests).toHaveLength(2)
    })

    it('takes the owner for an avatar when no owner was given', async () => {
      const script = await asking()
      script.fire('touch_start', { num_detected: 1 })
      script.grantPermissions()
      expect(errors(script)).toEqual([])
    })

    it('fails a request to NULL_KEY, to a prim, or to something that is not a key', async () => {
      const script = await asking(OWNER)
      for (const id of [NULL_KEY, '', 'not-a-key']) script.fire('link_message', { sender_num: 0, num: ANIMATION, str: '', id })
      script.fire('touch_end', { num_detected: 1 })
      expect(errors(script)).toEqual([NOT_FOUND, NOT_FOUND, NOT_FOUND, NOT_FOUND])
      expect(script.permissionRequests).toEqual([])
    })
  })
})

describe('what an SLua script keeps through inventory', () => {
  /**
   * Both probes with every counter at 2, a 2 s timer, a second listen, and permissions from a
   * dialog: 16 for the LSL probe, 4 for the SLua one. The SLua probe also has two handlers it
   * added after it started.
   */
  async function busy() {
    const f = await fixture()
    for (const probe of [f.lsl, f.slua]) {
      probe.tell('inc')
      probe.tell('inc')
      probe.tell('timer')
      probe.tell('listen')
    }
    f.slua.tell('handlers')
    f.lsl.ask(ANIMATION)
    f.lsl.script.grantPermissions()
    f.slua.ask(CONTROLS)
    f.slua.script.grantPermissions()
    return f
  }
  const mains = (probe: ReturnType<typeof driver>) => probe.script.chat.filter(c => c.text === 'main').length

  // In-world: the object was taken and rezzed. The SLua script's on_rez read 4 for the owner
  // with its upvalue, its global and its table field as they were; the LSL twin read 16 and its
  // counter. The SLua script did not run from the top again (it says "main" there, and did not).
  it('keeps its variables, its permissions and the permission key through a take and a rez', async () => {
    const f = await busy()
    const copy = rez(f, take(f))
    expect(copy.slua.log().at(-1)).toBe(`rez 4 ${OWNER} n=2 count=2 hits=2`)
    expect(copy.lsl.log().at(-1)).toContain(`rez 16 ${OWNER} n=2`)
    expect(mains(copy.slua)).toBe(0)
    expect(copy.slua.held()).toEqual([CONTROLS, OWNER])
  })

  // In-world: on the rezzed object a touch ran the handler the script had added with LLEvents:on
  // and the one added with LLEvents:once, chat on the second listen's channel was heard, the
  // coroutine went on from where it was (3 after two steps), and the LLTimers timer kept counting.
  it('keeps its event handlers, listens, timers and coroutines', async () => {
    const f = await busy()
    const copy = rez(f, take(f))
    copy.linkset.touch(0)
    expect(copy.slua.log().slice(-2)).toEqual(['touched n=2 count=2 hits=2', 'once'])
    copy.linkset.touch(0)
    expect(copy.slua.log().slice(-2)).toEqual(['once', 'touched n=2 count=2 hits=2'])
    copy.slua.script.deliverChat({ channel: 6, name: 'owner', key: OWNER, message: 'ping' })
    expect(copy.slua.log().at(-1)).toBe('heard 6 ping')
    copy.slua.script.deliverChat({ channel: 5, name: 'owner', key: OWNER, message: 'pong' })
    expect(copy.slua.log().at(-1)).toBe('heard 5 pong')
    copy.linkset.advanceTime(4_000)
    expect(copy.slua.report()).toBe(`state 4 ${OWNER} n=2 count=2 hits=2 ticks=2 co=3`)
    expect(copy.lsl.report()).toBe(`state 16 ${OWNER} n=2 ticks=2`)
  })

  // In-world: taking a copy left the original running with what it had. The original then
  // counted once more and stepped its coroutine; the copy, rezzed, read the count from before
  // that and its coroutine went on from there, while the original's went on from its own step.
  it('leaves the original as it was when a copy is taken', async () => {
    const f = await busy()
    const saved = f.linkset.copy()
    f.slua.tell('inc')
    expect(f.slua.report()).toBe(`state 4 ${OWNER} n=3 count=3 hits=3 ticks=0 co=4`)
    const copy = rez(f, saved)
    expect(copy.slua.report()).toBe(`state 4 ${OWNER} n=2 count=2 hits=2 ticks=0 co=3`)
    expect(mains(f.slua)).toBe(1)
  })

  // In-world: the taken copy was put in another prim's contents and rezzed with llRezObject ->
  // on_rez(5) read 4 for the owner with the counters as saved, the added touch handler ran, and
  // the coroutine went on. A second rez from the same item started from the same saved state:
  // the two rezzed objects are separate copies of it.
  it('keeps them on every copy rezzed from a prim\'s contents', async () => {
    const f = await busy()
    const rezzer = await rezzerWith(f, take(f))
    const first = rezzer.rezOne()
    expect(first.slua.log().at(-1)).toBe(`rez 4 ${OWNER} n=2 count=2 hits=2`)
    first.slua.tell('inc')
    first.linkset.touch(0)
    expect(first.slua.log().slice(-2)).toEqual(['touched n=3 count=3 hits=3', 'once'])
    const second = rezzer.rezOne()
    expect(second.slua.log().at(-1)).toBe(`rez 4 ${OWNER} n=2 count=2 hits=2`)
    expect(second.slua.report()).toBe(`state 4 ${OWNER} n=2 count=2 hits=2 ticks=0 co=3`)
    expect(first.slua.report()).toBe(`state 4 ${OWNER} n=3 count=3 hits=3 ticks=0 co=4`)
  })

  // In-world: the worn object's two probes were each granted 36 (4|32) as a wearer, the SLua one
  // counted once more, and the object detached itself. attach(NULL_KEY) read 36 in both. Worn
  // again, on_rez and attach read 32 in both, with the SLua counters as they were at the detach.
  it('keeps them through a detach and a wear, less the controls', async () => {
    const f = await busy()
    f.linkset.attachToAvatar(OWNER, 5)
    f.linkset.advanceTime(0)
    for (const probe of [f.lsl, f.slua]) probe.ask(CONTROLS | ATTACH)
    f.slua.tell('inc')
    f.linkset.detachFromAvatar()
    f.linkset.advanceTime(0)
    expect(f.slua.log().at(-1)).toBe(`attach 36 ${OWNER}`)
    f.linkset.attachToAvatar(OWNER, 5)
    f.linkset.advanceTime(0)
    expect(f.slua.log().slice(-2)).toEqual([`rez 32 ${OWNER} n=3 count=3 hits=3`, `attach 32 ${OWNER}`])
    expect(f.lsl.log().at(-1)).toBe(`attach 32 ${OWNER}`)
    expect(f.slua.report()).toBe(`state 32 ${OWNER} n=3 count=3 hits=3 ticks=0 co=4`)
    expect(mains(f.slua)).toBe(1)
  })

  // In-world: an SLua script whose top-level code was 10 s into a 45 s ll.Sleep was taken, left
  // in inventory for 15 s and rezzed. It finished the sleep after the rez (its clock read 45 s:
  // the time in inventory did not count), ran the rest of its top level, and only then got
  // on_rez. A handler it registered after the sleep ran on a touch.
  it('finishes top-level code that was asleep when the object was taken, before on_rez', async () => {
    const source = `log = {}
      LLEvents:on("on_rez", function(p) table.insert(log, "rez") end)
      ll.Sleep(45)
      table.insert(log, "after " .. math.floor(ll.GetTime() + 0.5))
      LLEvents:on("touch_start", function() table.insert(log, "touch") end)`
    const f = await fixture()
    const made = await loadLinkset({ world: f.world, region: 'home', owner: OWNER,
      prims: [{ scripts: [{ name: 'slua', source: { source }, language: 'slua' }] }] })
    made.scripts.slua!.queueStart()
    made.linkset.advanceTime(10_000)
    const saved = take(made)
    f.linkset.advanceTime(15_000)
    seedRlvInventory(f.avatar, { sharedRootId: null, entries: [{ id: 'item', kind: 'item', parentId: null, name: 'probe', object: saved, assetType: 'object' }] })
    const copy = f.world.attemptAvatarRez(f.avatar, 'item', { x: 1, y: 2, z: 3 }).object!
    const script = copy.allScripts()[0]!
    copy.advanceTime(34_000)
    expect(script.global('log')).toEqual([])
    copy.advanceTime(1_000)
    expect(script.global('log')).toEqual(['after 45', 'rez'])
    copy.touch(0)
    expect(script.global('log')).toEqual(['after 45', 'rez', 'touch'])
  })

  // In-world: the same with both twins asleep for 45 s inside a listen handler, each of which
  // said its script time after the sleep -> the SLua handler finished after the rez, at 45 s of
  // script time or a little over, and then on_rez ran. (So did the LSL twin's. rezless does not
  // carry an LSL handler that is asleep; see the README.)
  it('finishes a handler that was asleep when the object was taken, before on_rez', async () => {
    const source = `log = {}
      LLEvents:on("on_rez", function(p) table.insert(log, "rez") end)
      LLEvents:on("touch_start", function() table.insert(log, "start"); ll.Sleep(45); table.insert(log, "end " .. math.floor(ll.GetTime() + 0.5)) end)`
    const f = await fixture()
    const made = await loadLinkset({ world: f.world, region: 'home', owner: OWNER,
      prims: [{ scripts: [{ name: 'slua', source: { source }, language: 'slua' }] }] })
    made.scripts.slua!.start()
    // Queued rather than fired: fire() would wait for the handler to finish.
    f.world.clock.schedule(made.scripts.slua!, f.world.clock.now, 'touch_start', { num_detected: 1 })
    made.linkset.advanceTime(10_000)
    const rezzer = await rezzerWith(f, take(made))
    for (let i = 0; i < 2; i++) {
      const before = f.world.linksets.length
      rezzer.tell('probe')
      const script = f.world.linksets[before]!.allScripts()[0]!
      rezzer.script.linkset.advanceTime(34_000)
      expect(script.global('log')).toEqual(['start'])
      rezzer.script.linkset.advanceTime(1_000)
      expect(script.global('log')).toEqual(['start', 'end 45', 'rez'])
    }
  })

  // In-world: a touch_start handler said llDetectedKey and llDetectedName, slept 30 s, and said
  // them again. The object was taken 6 s into the sleep and rezzed. After the sleep both twins
  // still read the toucher's key and name.
  it('keeps who touched it for a touch handler that was asleep when the object was taken', async () => {
    const source = `log = {}
      LLEvents:on("touch_start", function() ll.Sleep(30); table.insert(log, tostring(ll.DetectedKey(1)) .. " " .. ll.DetectedName(1)) end)`
    const f = await fixture()
    const made = await loadLinkset({ world: f.world, region: 'home', owner: OWNER,
      prims: [{ scripts: [{ name: 'slua', source: { source }, language: 'slua' }] }] })
    made.scripts.slua!.start()
    f.world.clock.schedule(made.scripts.slua!, f.world.clock.now, 'touch_start', { num_detected: 1, detected: [{ key: BOB, name: 'Bob' }] })
    made.linkset.advanceTime(6_000)
    seedRlvInventory(f.avatar, { sharedRootId: null, entries: [{ id: 'item', kind: 'item', parentId: null, name: 'probe', object: take(made), assetType: 'object' }] })
    const copy = f.world.attemptAvatarRez(f.avatar, 'item', { x: 1, y: 2, z: 3 }).object!
    copy.advanceTime(24_000)
    expect(copy.allScripts()[0]!.global('log')).toEqual([`${BOB} Bob`])
  })

  // The original's event may carry the host's own record of that delivery (a damage event's does).
  // The copy must not finish or change it: only the original's handler ends the original's event.
  //
  // Not measured: what a copy does with a damage event that was in flight, such as whether a
  // copied on_damage handler's llAdjustDamage counts or the copy gets final_damage. on_damage
  // and final_damage only fire on damage-enabled land, and the probes had none: llDamage on the
  // sandbox parcel fired neither event. The model lets the copied handler run to its end and
  // gives the copy no part in the original's attack.
  it('gives the copy of a sleeping handler the event\'s data but not the original\'s delivery', async () => {
    const source = `done = 0
      LLEvents:on("touch_start", function() ll.Sleep(30); done += 1; who = ll.DetectedName(1) end)`
    const f = await fixture()
    const made = await loadLinkset({ world: f.world, region: 'home', owner: OWNER,
      prims: [{ scripts: [{ name: 'slua', source: { source }, language: 'slua' }] }] })
    const original = made.scripts.slua!
    original.start()
    let completed = 0
    const detected = [{ key: BOB, name: 'Bob' }]
    const delivery = { script: original, active: false, complete: () => { completed++ } }
    f.world.clock.schedule(original, f.world.clock.now, 'touch_start', { num_detected: 1, detected, __damageDelivery: delivery })
    made.linkset.advanceTime(6_000)
    const copied = made.linkset.copy().copy({ world: f.world, region: 'home' })
    const copy = copied.allScripts()[0]!
    detected[0]!.name = 'Changed'
    copied.advanceTime(24_000)
    expect([original.global('done'), copy.global('done')]).toEqual([1, 1])
    expect([original.global('who'), copy.global('who')]).toEqual(['Changed', 'Bob'])
    expect(completed).toBe(1)
  })

  // In-world (Aditi, two avatars, 2026-11-14): an SLua script that had counted to 2 and held 16
  // from its owner was given to a second avatar, who rezzed it -> on_rez read 0, NULL_KEY and a
  // count of 2, then changed(CHANGED_OWNER) fired.
  it('holds nothing on a copy that belongs to another owner, but keeps its variables', async () => {
    const f = await busy()
    const bob = f.world.addAvatar({ region: 'home', key: BOB, username: 'bob' })
    seedRlvInventory(bob, { sharedRootId: null, entries: [{ id: 'item', kind: 'item', parentId: null, name: 'probe', object: f.linkset.copy(), assetType: 'object' }] })
    const copy = twins(f.world.attemptAvatarRez(bob, 'item', { x: 1, y: 2, z: 3 }).object!)
    expect(copy.slua.log().slice(-2)).toEqual([`rez 0 ${NULL_KEY} n=2 count=2 hits=2`, `changed 128 0 ${NULL_KEY}`])
  })

  // A start that is queued has not run the script yet, so its copy has nothing to carry over.
  it('starts a script whose start was still queued when it was copied', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER,
      prims: [{ scripts: [{ name: 'slua', source: { source: slua }, language: 'slua' }] }] })
    scripts.slua!.queueStart()
    const copy = linkset.copy().copy({ world, region: 'home' })
    const script = copy.allScripts()[0]!
    script.queueRez()
    copy.advanceTime(0)
    copy.touch(0)
    expect(script.chat.map(c => c.text)).toEqual(['main'])
    expect(script.global('log')).toEqual([`rez 0 ${NULL_KEY} n=0 count=0 hits=0`])
  })

  it('starts a script that had not started yet from the top, once', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const { linkset } = await loadLinkset({ world, region: 'home', owner: OWNER,
      prims: [{ scripts: [{ name: 'slua', source: { source: slua }, language: 'slua' }] }] })
    const copy = linkset.copy({ world, region: 'home' })
    const script = copy.allScripts()[0]!
    script.queueRez()
    copy.advanceTime(0)
    expect(script.chat.map(c => c.text)).toEqual(['main'])
    expect(script.global('log')).toEqual([`rez 0 ${NULL_KEY} n=0 count=0 hits=0`])
  })

  /** An SLua object in a world, started, and a copy of it rezzed beside it. */
  async function pair(source: string) {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
    const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER,
      prims: [{ scripts: [{ name: 'slua', source: { source }, language: 'slua' }] }] })
    const original = scripts.slua!
    original.start()
    return { world, linkset, original, rezCopy: () => {
      const copied = linkset.copy().copy({ world, region: 'home' })
      const copy = copied.allScripts()[0]!
      copy.queueRez()
      copied.advanceTime(0)
      return { linkset: copied, copy }
    } }
  }

  // The copy is the VM's memory, so what a handler or a timer closed over before the copy must
  // act on the copy's own object afterwards, and the original must go on acting on its own.
  it('runs the copy\'s handlers and timers against the copy\'s own prim', async () => {
    const f = await pair(`touches = 0; ticks = 0
      LLEvents:on("touch_start", function() touches += 1; ll.SetObjectDesc("touched " .. touches); key = ll.GetKey() end)
      LLTimers:every(2, function() ticks += 1; ll.SetText("tick " .. ticks, vector(1, 1, 1), 1) end)`)
    f.linkset.touch(0)
    const { linkset: copied, copy } = f.rezCopy()
    copied.touch(0)
    copied.touch(0)
    expect(copied.prims[0]!.appearance.description).toBe('touched 3')
    expect(f.linkset.prims[0]!.appearance.description).toBe('touched 1')
    expect(copy.global('key')).toBe(copied.prims[0]!.key)
    expect(f.original.global('key')).toBe(f.linkset.prims[0]!.key)
    copied.advanceTime(4_000)
    expect([f.original.global('ticks'), copy.global('ticks')]).toEqual([2, 2])
    expect([f.linkset.prims[0]!.appearance.text?.text, copied.prims[0]!.appearance.text?.text]).toEqual(['tick 2', 'tick 2'])
    f.linkset.touch(0)
    expect([f.original.global('touches'), copy.global('touches')]).toEqual([2, 3])
  })

  it('keeps uuids, vectors and quaternions held in variables as what they were', async () => {
    const f = await pair(`id = ll.GetOwner(); me = ll.GetKey(); v = vector(1, 2, 3); q = quaternion(0, 0, 0, 1)
      kinds = typeof(id) .. " " .. typeof(v) .. " " .. typeof(q)
      LLEvents:on("touch_start", function() kinds = typeof(id) .. " " .. typeof(v) .. " " .. typeof(q); same = id == ll.GetOwner() end)`)
    const { linkset: copied, copy } = f.rezCopy()
    copied.touch(0)
    expect(copy.global('kinds')).toBe('uuid vector quaternion')
    expect(copy.global('same')).toBe(1)
    expect(copy.global('id')).toBe(OWNER)
    expect(copy.global('me')).toBe(f.linkset.prims[0]!.key)
    expect(copy.global('v')).toEqual({ x: 1, y: 2, z: 3 })
    expect(copy.global('q')).toEqual({ x: 0, y: 0, z: 0, s: 1 })
  })

  // Not measured: a dataserver request still in flight when the object is taken. The grid answers
  // within a frame or two, before a take can be made. The model gives the answer to the script
  // that asked; the copy has no request of its own.
  it('answers a request that was in flight to the original only', async () => {
    const f = await pair(`answers = {}
      LLEvents:on("dataserver", function(id, data) table.insert(answers, data) end)
      LLEvents:on("touch_start", function() ll.RequestAgentData(ll.GetOwner(), DATA_ONLINE) end)`)
    f.linkset.touch(0)
    const { copy } = f.rezCopy()
    f.original.respondToLastDataserver('1')
    expect(f.original.global('answers')).toEqual(['1'])
    expect(copy.global('answers')).toEqual([])
    expect(() => copy.respondToLastDataserver('1')).toThrow('no dataserver request')
  })

  it('copies a script whose VM has grown past its first size', async () => {
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER,
      prims: [{ scripts: [{ name: 'slua', source: { source: 'big = table.create(600000, 7); size = #big; last = big[600000]' }, language: 'slua' }] }] })
    scripts.slua!.start()
    const copy = linkset.copy({ world, region: 'home' }).allScripts()[0]!
    expect([copy.global('size'), copy.global('last')]).toEqual([600000, 7])
  })

  it('counts coverage once for what ran before the copy and once for what each runs after', async () => {
    const source = `count = 0
LLEvents:on("touch_start", function()
  count += 1
end)`
    const world = new World()
    world.addRegion('home', { x: 0, y: 0 })
    const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER,
      prims: [{ scripts: [{ name: 'slua', source: { source }, language: 'slua', coverage: true }] }] })
    const original = scripts.slua!
    original.start()
    linkset.touch(0)
    const copy = linkset.copy({ world, region: 'home' }).allScripts()[0]!
    copy.linkset.touch(0)
    copy.linkset.touch(0)
    expect(copy.global('count')).toBe(3)
    expect(original.global('count')).toBe(1)
    const hits = (line: number) => original.coverage!.statements.find(s => s.line === line)!.hits
    expect(hits(1)).toBe(1)
    expect(hits(3)).toBe(3)
  })
})

/**
 * Put `saved` in the inventory of an avatar with an RLV viewer and have a relay force-wear it:
 * the path an item takes from inventory onto the avatar.
 */
async function wearFromInventory(save: (world: World, owner: string, region: string) => Promise<Linkset>) {
  const { rlv } = await loadRlvPair({ source: 'default { touch_start(integer n) { llOwnerSay(llGetObjectDesc()); } }' })
  const { world, avatar } = rlv
  const saved = await save(world, avatar.key, avatar.region)
  seedRlvInventory(avatar, { sharedRootId: 'root', entries: [
    { id: 'root', parentId: null, kind: 'folder', name: '#RLV' },
    { id: 'folder', parentId: 'root', kind: 'folder', name: 'Direct' },
    { id: 'probe', parentId: 'folder', kind: 'item', name: 'Probe (left hand)', assetType: 'object', object: saved },
  ] })
  rlv.script.start()
  rlv.script.host.description = '@attach:direct=force'
  rlv.script.fire('touch_start', { num_detected: 1 })
  const worn = world.linksets.find(l => l.attachment && l !== rlv.script.linkset && l.allScripts().length)!
  return { ...twins(worn), owner: avatar.key }
}

/** The twin probes in `world`, started, owned by `owner`. */
async function probes(world: World, owner: string, region: string) {
  const { linkset, scripts } = await loadLinkset({ world, region, owner, prims: [{ scripts: [
    { name: 'lsl', source: { source: lsl } },
    { name: 'slua', source: { source: slua }, language: 'slua' },
  ] }] })
  for (const script of Object.values(scripts)) script.start()
  return { linkset, lsl: driver(scripts.lsl!), slua: driver(scripts.slua!) }
}

describe('wearing an object from inventory', () => {
  // In-world: the taken object, worn from inventory -> the SLua script's on_rez and attach read
  // 4 for the owner with its counters as they were, as the LSL twin's read 16.
  it('keeps an SLua script\'s variables and permissions', async () => {
    const worn = await wearFromInventory(async (world, owner, region) => {
      const made = await probes(world, owner, region)
      made.slua.tell('inc')
      made.slua.ask(CONTROLS)
      made.slua.script.grantPermissions()
      made.lsl.ask(ANIMATION)
      made.lsl.script.grantPermissions()
      return take(made)
    })
    expect(worn.slua.log().slice(-2)).toEqual([`rez 4 ${worn.owner} n=1 count=1 hits=1`, `attach 4 ${worn.owner}`])
    expect(worn.lsl.log().slice(-2)).toEqual([`rez 16 ${worn.owner} n=0 changes=0`, `attach 16 ${worn.owner}`])
    expect(worn.slua.script.chat.filter(c => c.text === 'main')).toEqual([])
  })

  // In-world: a seat granted 3094 (LSL) and 3092 (SLua) was taken from under its sitter and worn
  // from inventory -> on_rez read 1042 and 1040, then attach, then changed(32), in both scripts.
  it('raises the changed event after attach when the object was taken from under a sitter', async () => {
    const worn = await wearFromInventory(async (world, owner, region) => {
      const made = await probes(world, owner, region)
      const avatar = world.avatars.find(a => a.key === owner)!
      expect(world.sitAvatar(avatar, made.linkset.prims[0]!)).toBe(true)
      made.linkset.advanceTime(0)
      made.lsl.ask(SEAT_SET)
      made.lsl.script.grantPermissions()
      made.slua.ask(SEAT_SET & ~DEBIT)
      return take(made)
    })
    const held = `${STOOD_SET} ${worn.owner}`
    expect(worn.lsl.log().slice(-3)).toEqual([`rez ${held} n=0 changes=1`, `attach ${held}`, `changed 32 ${held}`])
    const sluaHeld = `${STOOD_SET & ~DEBIT} ${worn.owner}`
    expect(worn.slua.log().slice(-3)).toEqual([`rez ${sluaHeld} n=0 count=0 hits=0`, `attach ${sluaHeld}`, `changed 32 ${sluaHeld}`])
  })
})

describe('taking an object that is sat on', () => {
  /** The avatar sits on the object; the LSL probe is granted 3094 by dialog, the SLua one 3092 at once. */
  async function sat() {
    const f = await fixture()
    expect(f.world.sitAvatar(f.avatar, f.linkset.prims[0]!)).toBe(true)
    f.linkset.advanceTime(0)
    f.lsl.ask(SEAT_SET)
    f.lsl.script.grantPermissions()
    f.slua.ask(SEAT_SET & ~DEBIT)
    return f
  }
  const changes = (probe: ReturnType<typeof driver>) => probe.log().filter(line => line.startsWith('changed'))

  // In-world: the avatar sat on the probe object and the viewer took a copy of it. The avatar
  // stood: llGetAgentInfo() lost AGENT_SITTING and llAvatarOnSitTarget() read NULL_KEY. The
  // original's scripts each got one changed(32) and then held 1042 (LSL) and 1040 (SLua): a
  // stand's loss of controls and camera control.
  it('stands the sitter up when a copy is taken, and the original sees the stand', async () => {
    const f = await sat()
    f.linkset.copy()
    f.linkset.advanceTime(0)
    expect(f.avatar.sittingOn).toBeNull()
    expect(changes(f.lsl)).toEqual([`changed 32 0 ${NULL_KEY}`, `changed 32 ${STOOD_SET} ${OWNER}`])
    expect(changes(f.slua).at(-1)).toBe(`changed 32 ${STOOD_SET & ~DEBIT} ${OWNER}`)
    expect(f.lsl.held()).toEqual([STOOD_SET, OWNER])
    expect(f.linkset.dead).toBe(false)
  })

  // In-world: the copy, rezzed, read 1042 in on_rez (1040 in the SLua twin) with the count of
  // changed events it had before the stand, and then got changed(32): one more than the
  // original had seen when the copy was made.
  it('gives the rezzed copy a changed(CHANGED_LINK) after on_rez', async () => {
    const f = await sat()
    const copy = rez(f, f.linkset.copy())
    expect(copy.lsl.log().slice(-2)).toEqual([`rez ${STOOD_SET} ${OWNER} n=0 changes=1`, `changed 32 ${STOOD_SET} ${OWNER}`])
    expect(copy.slua.log().slice(-2)).toEqual([`rez ${STOOD_SET & ~DEBIT} ${OWNER} n=0 count=0 hits=0`, `changed 32 ${STOOD_SET & ~DEBIT} ${OWNER}`])
    expect(changes(copy.lsl)).toHaveLength(2)
  })

  // In-world: the object was taken from under its sitter. The avatar stood and nothing was
  // heard from the seat. Rezzed, it read 1042 in on_rez and then got changed(32).
  it('does the same when the object itself is taken', async () => {
    const f = await sat()
    const saved = take(f)
    expect(f.avatar.sittingOn).toBeNull()
    const copy = rez(f, saved)
    expect(copy.lsl.log().slice(-2)).toEqual([`rez ${STOOD_SET} ${OWNER} n=0 changes=1`, `changed 32 ${STOOD_SET} ${OWNER}`])
    copy.linkset.advanceTime(1_000)
    expect(changes(copy.lsl)).toHaveLength(2)
    expect(changes(f.lsl)).toHaveLength(1)
  })

  // In-world: that item, put in a prim's contents, gave on_rez(5) with 1042 and then changed(32)
  // each time llRezObject rezzed it.
  it('raises the changed event on every rez of the saved object', async () => {
    const f = await sat()
    const rezzer = await rezzerWith(f, take(f))
    for (let i = 0; i < 2; i++) {
      const copy = rezzer.rezOne()
      expect(copy.lsl.log().slice(-2)).toEqual([`rez ${STOOD_SET} ${OWNER} n=0 changes=1`, `changed 32 ${STOOD_SET} ${OWNER}`])
    }
  })

  // In-world: once rezzed (on_rez, then changed(32)), that object was taken again with nobody on
  // it and rezzed -> only on_rez.
  it('raises none on a copy of an object nobody sits on', async () => {
    const f = await sat()
    const first = rez(f, take(f))
    const again = rez(f, take(first))
    expect(again.lsl.log().at(-1)).toContain(`rez ${STOOD_SET} ${OWNER}`)
    expect(changes(again.lsl)).toHaveLength(2)
  })

  it('does not pass the changed event on from an instance made with copy({ world })', async () => {
    const f = await sat()
    const instance = twins(take(f).copy({ world: f.world, region: 'home' }))
    expect(changes(instance.lsl)).toHaveLength(1)
    const again = rez(f, take(instance))
    expect(changes(again.lsl)).toHaveLength(1)
  })

  // Not measured: a copy made in place. The viewer tools here can't shift-drag a copy of an
  // object, which is how a person would duplicate a seat while sitting on it. Only a copy into
  // inventory stands the sitter up in the model, as only that was measured. The copy holds what
  // a stand leaves, as a copy taken from under the sitter does: nobody sits on it.
  it('leaves the sitter seated when the copy is an object in the world', async () => {
    const f = await sat()
    const instance = twins(f.linkset.copy({ world: f.world, region: 'home' }))
    expect(f.avatar.sittingOn).toBe(f.linkset.prims[0])
    expect(instance.lsl.held()).toEqual([STOOD_SET, OWNER])
    expect(f.lsl.held()).toEqual([SEAT_SET, OWNER])
    expect(changes(instance.lsl)).toHaveLength(1)
  })

  // The model clears the mark when the object next goes into inventory by a detach, so a copy
  // that was put in the world and worn without a rez does not raise the event on a later wear.
  it('does not raise the changed event on a later wear of an instance made with copy({ world })', async () => {
    const f = await sat()
    const instance = twins(take(f).copy({ world: f.world, region: 'home' }))
    instance.linkset.attachToAvatar(OWNER, 5)
    instance.linkset.advanceTime(0)
    instance.linkset.detachFromAvatar()
    instance.linkset.advanceTime(0)
    instance.linkset.attachToAvatar(OWNER, 5)
    instance.linkset.advanceTime(0)
    expect(changes(instance.lsl)).toHaveLength(1)
  })

  // In-world: a prim rezzed the seat from its contents, the avatar sat on it and was granted
  // 3094, and the prim called llDerezObject(seat, DEREZ_TO_INVENTORY) -> 1. The avatar stood, and
  // the seat's LSL script said its changed(32), holding 1042, before it went. The item it
  // replaced in the prim's contents, rezzed again, read 1042 in on_rez with the counter the seat
  // had been given (so it was the derezzed object), and then got changed(32).
  it('stands the sitter up when a script derezzes the object to inventory', async () => {
    const f = await fixture()
    const rezzer = await rezzerWith(f, take(f))
    const seat = rezzer.rezOne()
    expect(f.world.sitAvatar(f.avatar, seat.linkset.prims[0]!)).toBe(true)
    seat.lsl.tell('inc')
    seat.lsl.ask(SEAT_SET)
    seat.lsl.script.grantPermissions()
    rezzer.tell('derez', 2)
    expect(rezzer.log().at(-1)).toBe('derez 1')
    expect(f.avatar.sittingOn).toBeNull()
    expect(seat.linkset.dead).toBe(true)
    expect(changes(seat.lsl)).toEqual([`changed 32 0 ${NULL_KEY}`, `changed 32 ${STOOD_SET} ${OWNER}`])
    const back = rezzer.rezOne()
    expect(back.lsl.log().at(-2)).toContain(`rez ${STOOD_SET} ${OWNER} n=1 `)
    expect(back.lsl.log().at(-1)).toBe(`changed 32 ${STOOD_SET} ${OWNER}`)
  })

  /** A seat rezzed from a prim's contents, with the avatar on it. Its scripts log their events. */
  async function derezSeat(scripts: Record<string, string>, prepare: (script: Script) => void = () => {}) {
    const f = await fixture()
    const made = await loadLinkset({ world: f.world, region: 'home', owner: OWNER, prims: [{ scripts:
      Object.entries(scripts).map(([name, source]) => ({ name, source: { source }, language: name.endsWith('.luau') ? 'slua' as const : 'lsl' as const })) }] })
    for (const script of Object.values(made.scripts)) {
      prepare(script)
      script.start()
    }
    const rezzer = await rezzerWith(f, take(made))
    const before = f.world.linksets.length
    rezzer.tell('probe')
    expect(f.world.linksets).toHaveLength(before + 1)
    const seat = f.world.linksets.at(-1)!
    seat.advanceTime(0)
    expect(f.world.sitAvatar(f.avatar, seat.prims[0]!)).toBe(true)
    seat.advanceTime(0)
    const script = (name: string) => seat.allScripts().find(s => s.scriptName === name)!
    return { ...f, rezzer, seat, script }
  }
  const logging = 'list log; default { changed(integer c) { log += "changed"; } touch_start(integer n) { llSleep(10.0); log += "woke"; } }'

  // Not measured: a seat script that is stopped or asleep when the object is derezzed. Neither
  // can run an event before the object goes, so the model gives them none.
  it('gives the stand\'s changed event only to the scripts of the derezzed seat that can run it', async () => {
    const f = await derezSeat({ awake: logging, stopped: logging, asleep: logging })
    f.script('stopped').running = false
    f.world.clock.schedule(f.script('asleep'), f.world.clock.now, 'touch_start', { num_detected: 1 })
    f.seat.advanceTime(0)
    f.rezzer.tell('derez', 2)
    expect(f.seat.dead).toBe(true)
    expect(f.script('awake').global('log')).toEqual(['changed', 'changed'])
    expect(f.script('stopped').global('log')).toEqual(['changed'])
    expect(f.script('asleep').global('log')).toEqual(['changed'])
  })

  // A seat script that crashes in that handler says so on DEBUG_CHANNEL, as any crash does. The
  // other seat scripts still get the event and the script that called llDerezObject carries on.
  it('keeps a crash in the seat\'s changed handler to the seat script', async () => {
    const f = await derezSeat({
      'faulty.luau': 'seen = 0; LLEvents:on("changed", function(c) seen += 1; if seen > 1 then error("boom") end end)',
      zlast: logging,
    })
    f.rezzer.tell('derez', 2)
    expect(f.rezzer.log().at(-1)).toBe('derez 1')
    expect(f.seat.dead).toBe(true)
    const said = f.script('faulty.luau').chat.filter(c => c.channel === DEBUG_CHANNEL).map(c => c.text)
    expect(said).toEqual(['Object [script:faulty.luau] Script run-time error', 'runtime error'])
    expect(f.script('zlast').global('log')).toEqual(['changed', 'changed'])
  })

  // An error that is not the script's (here, one thrown by a mock) still reaches the test, and
  // the object is derezzed all the same.
  it('lets a harness error in the seat\'s handler through after the derez', async () => {
    const f = await derezSeat({ mocked: 'default { changed(integer c) { llOwnerSay("changed"); } }' }, script => {
      let calls = 0
      script.mock('llOwnerSay', () => {
        if (calls++) throw new Error('from the mock')
        return undefined
      })
    })
    expect(() => f.rezzer.tell('derez', 2)).toThrow('from the mock')
    expect(f.seat.dead).toBe(true)
  })

  // In-world: the same with DEREZ_DIE -> the avatar stood, the object was gone, and nothing was
  // heard from the seat.
  it('stands the sitter up when a script derezzes the object for good', async () => {
    const f = await fixture()
    const rezzer = await rezzerWith(f, take(f))
    const seat = rezzer.rezOne()
    expect(f.world.sitAvatar(f.avatar, seat.linkset.prims[0]!)).toBe(true)
    seat.linkset.advanceTime(0)
    rezzer.tell('derez', 0)
    expect(rezzer.log().at(-1)).toBe('derez 1')
    expect(f.avatar.sittingOn).toBeNull()
    expect(seat.linkset.dead).toBe(true)
    expect(changes(seat.lsl)).toHaveLength(1)
  })
})

describe('a dialog the script has stopped waiting for', () => {
  /** A seat that holds 16 for its sitter. `asks` go to dialogs, then the sitter stands. */
  async function stood(...asks: number[]) {
    const f = await fixture()
    expect(f.world.sitAvatar(f.avatar, f.linkset.prims[0]!)).toBe(true)
    f.lsl.ask(ANIMATION)
    for (const bits of asks) f.lsl.ask(bits)
    f.world.standAvatar(f.avatar)
    f.linkset.advanceTime(0)
    return { ...f, probe: f.lsl, script: f.lsl.script, dialog: (i: number) => f.lsl.script.permissionRequests.filter(r => r.permissions !== ANIMATION)[i]! }
  }

  // In-world: a seat granted 16 by its sitter asked for 8 (dialog A). The sitter stood, which
  // ends the wait, and answered Yes on A -> nothing, still 16. The seat asked for 256 (dialog B),
  // and Yes on B fired run_time_permissions(256): A's answer was spent on nothing.
  it('does nothing when the dead dialog is answered before the script asks again', async () => {
    const f = await stood(REMAP)
    f.script.grantPermissions(undefined, f.dialog(0))
    expect(f.probe.events()).toEqual([ANIMATION])
    expect(f.probe.held()).toEqual([ANIMATION, OWNER])
    f.probe.ask(JOINTS)
    f.script.grantPermissions()
    expect(f.probe.events()).toEqual([ANIMATION, JOINTS])
    expect(() => f.script.grantPermissions(undefined, f.dialog(0))).toThrow('no pending permission request')
  })

  // In-world: the same seat asked for 2 (A), the sitter stood, the seat asked for 128 (B), and
  // Grant on A fired run_time_permissions(2): the script held 2, the old dialog's bits, not the
  // 128 it had just asked for. Yes on B afterwards did nothing.
  it('grants the old dialog\'s bits when it is answered after a newer request', async () => {
    const f = await stood(DEBIT)
    f.probe.ask(LINKS)
    f.script.grantPermissions(undefined, f.dialog(0))
    expect(f.probe.events()).toEqual([ANIMATION, DEBIT])
    expect(f.probe.held()).toEqual([DEBIT, OWNER])
    f.script.grantPermissions(undefined, f.dialog(1))
    expect(f.probe.events()).toEqual([ANIMATION, DEBIT])
    expect(f.probe.held()).toEqual([DEBIT, OWNER])
  })

  // In-world: asked for 64 (A), stood, asked for 512 (B). Yes on B first fired
  // run_time_permissions(512), and Yes on A then did nothing.
  it('acts on the newer dialog when that is answered first, and then ignores the old one', async () => {
    const f = await stood(RELEASE)
    f.probe.ask(MEDIA)
    f.script.grantPermissions()
    expect(f.probe.events()).toEqual([ANIMATION, MEDIA])
    f.script.grantPermissions(undefined, f.dialog(0))
    expect(f.probe.events()).toEqual([ANIMATION, MEDIA])
    expect(f.probe.held()).toEqual([MEDIA, OWNER])
  })

  // In-world: asked for 8 (A), stood, asked for 256 (B). No on A fired run_time_permissions(0)
  // and left 0 with the owner as the key. Yes on B then did nothing.
  it('takes a No on the old dialog as the answer too', async () => {
    const f = await stood(REMAP)
    f.probe.ask(JOINTS)
    f.script.denyPermissions(f.dialog(0))
    expect(f.probe.events()).toEqual([ANIMATION, 0])
    expect(f.probe.held()).toEqual([0, OWNER])
    f.script.grantPermissions(undefined, f.dialog(1))
    expect(f.probe.events()).toEqual([ANIMATION, 0])
  })

  // In-world: asked for 64 (A), stood, then asked NULL_KEY for 4 (the agent error), its standing
  // owner for 2048 (the camera control error) and for 0 (nothing). Yes on A did nothing: a
  // request that raises no dialog does not start a wait.
  it('is not brought back by a request that fails or asks for nothing', async () => {
    const f = await stood(RELEASE)
    f.probe.ask(CONTROLS, NULL_KEY)
    f.probe.ask(CAMERA)
    f.probe.ask(0)
    expect(f.probe.errors()).toEqual([NOT_FOUND, CAMERA_REFUSAL])
    f.script.grantPermissions(undefined, f.dialog(0))
    expect(f.probe.events()).toEqual([ANIMATION])
    expect(f.probe.held()).toEqual([ANIMATION, OWNER])
  })

  // In-world: a probe asked its standing owner for 2 and for 8. Grant on the 2 fired
  // run_time_permissions(2), which ends the wait. It asked for 128, and Yes on the 8 dialog
  // fired run_time_permissions(8). Yes on the 128 then did nothing.
  it('is brought back the same way after another dialog was answered first', async () => {
    const f = await fixture()
    for (const bits of [DEBIT, REMAP]) f.lsl.ask(bits)
    const [first, second] = f.lsl.script.permissionRequests
    f.lsl.script.grantPermissions(undefined, first)
    f.lsl.ask(LINKS)
    f.lsl.script.grantPermissions(undefined, second)
    expect(f.lsl.events()).toEqual([DEBIT, REMAP])
    expect(f.lsl.held()).toEqual([REMAP, OWNER])
    f.lsl.script.grantPermissions(undefined, f.lsl.script.permissionRequests[2])
    expect(f.lsl.events()).toEqual([DEBIT, REMAP])
  })

  // In-world: a probe asked for 64, reset itself, and asked for 512. Yes on the 64 dialog, from
  // before the reset, fired run_time_permissions(64) and the script held 64. Yes on the 512 then
  // did nothing. The SLua twin, whose reset ran it from the top again, did the same.
  it.each(['lsl', 'slua'] as Twin[])('is brought back after a reset (%s)', async twin => {
    const f = await fixture()
    const probe = f[twin]
    probe.ask(RELEASE)
    probe.tell('reset')
    expect(() => probe.script.grantPermissions()).toThrow('no pending permission request')
    probe.ask(MEDIA)
    probe.script.grantPermissions(undefined, probe.script.permissionRequests[0])
    expect(probe.events()).toEqual([RELEASE])
    expect(probe.held()).toEqual([RELEASE, OWNER])
    probe.script.grantPermissions(undefined, probe.script.permissionRequests[1])
    expect(probe.events()).toEqual([RELEASE])
  })

  // In-world: a probe asked for 64, reset itself, and Yes on the 64 dialog did nothing. It then
  // asked for 512, and Yes fired run_time_permissions(512).
  it('does nothing when it is answered after a reset and before the script asks again', async () => {
    const f = await fixture()
    f.lsl.ask(RELEASE)
    f.lsl.tell('reset')
    f.lsl.script.grantPermissions(undefined, f.lsl.script.permissionRequests[0])
    expect(f.lsl.events()).toEqual([])
    expect(f.lsl.held()).toEqual([0, NULL_KEY])
    f.lsl.ask(MEDIA)
    f.lsl.script.grantPermissions()
    expect(f.lsl.events()).toEqual([MEDIA])
  })

  // In-world: a seated probe asked for 128 (dialog), then for 16 (granted at once, which ends the
  // wait), then for 2 (dialog). Yes on the 128 fired run_time_permissions(128) and replaced the
  // 16. Grant on the 2 then did nothing. Without the request for 2, Yes on the 128 did nothing.
  it('is brought back after an automatic grant', async () => {
    const f = await fixture()
    expect(f.world.sitAvatar(f.avatar, f.linkset.prims[0]!)).toBe(true)
    for (const bits of [LINKS, ANIMATION, DEBIT]) f.lsl.ask(bits)
    const [links, , debit] = f.lsl.script.permissionRequests
    f.lsl.script.grantPermissions(undefined, links)
    expect(f.lsl.events()).toEqual([ANIMATION, LINKS])
    expect(f.lsl.held()).toEqual([LINKS, OWNER])
    f.lsl.script.grantPermissions(undefined, debit)
    expect(f.lsl.events()).toEqual([ANIMATION, LINKS])
  })

  // In-world: a probe asked for 64 and was taken and rezzed with the dialog open. The rezzed
  // probe asked for 512. Yes on the 64 dialog did nothing, and Yes on the 512 then fired
  // run_time_permissions(512): a dialog raised by the object before it went into inventory is
  // dead for good.
  it('stays dead once the object has been through inventory', async () => {
    const f = await fixture()
    f.lsl.ask(RELEASE)
    const [old] = f.lsl.script.permissionRequests
    const copy = rez(f, take(f))
    copy.lsl.ask(MEDIA)
    expect(copy.lsl.script.permissionRequests).toEqual([{ agent: OWNER, permissions: MEDIA, answered: false }])
    expect(() => copy.lsl.script.grantPermissions(undefined, old)).toThrow('no pending permission request')
    copy.lsl.script.grantPermissions()
    expect(copy.lsl.events()).toEqual([MEDIA])
  })

  // In-world: a worn probe holding 32 asked for 2 (dialog) and detached itself. Worn again, it
  // asked for 128. Grant on the 2 dialog did nothing, and Yes on the 128 then fired
  // run_time_permissions(128).
  it('stays dead after a detach and a wear', async () => {
    const f = await fixture()
    f.linkset.attachToAvatar(OWNER, 5)
    f.linkset.advanceTime(0)
    f.lsl.ask(ATTACH)
    f.lsl.ask(DEBIT)
    const old = f.lsl.script.permissionRequests[1]!
    f.linkset.detachFromAvatar()
    f.linkset.advanceTime(0)
    f.linkset.attachToAvatar(OWNER, 5)
    f.linkset.advanceTime(0)
    f.lsl.ask(LINKS)
    expect(() => f.lsl.script.grantPermissions(undefined, old)).toThrow('no pending permission request')
    f.lsl.script.grantPermissions()
    expect(f.lsl.events()).toEqual([ATTACH, LINKS])
    expect(f.lsl.held()).toEqual([LINKS, OWNER])
  })
})
