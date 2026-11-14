import { describe, expect, it } from 'vitest'
import { loadLinkset, loadScript, World } from '../src/index.js'

// Measured on the Aditi beta grid, SLua Tideland, 2026-11-14, with two avatars:
// "i doll" owned the probe objects and "fivebot" (a Resident) wore or owned the
// listeners. OWNER stands for i doll and OTHER for fivebot below.
const OWNER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const DEBUG = 2147483647

const listener = `list heard;
default {
  state_entry() {
    llListen(4832, "", NULL_KEY, "");
    llListen(-4832, "", NULL_KEY, "");
    llListen(0, "", NULL_KEY, "");
    llListen(DEBUG_CHANNEL, "", NULL_KEY, "");
  }
  listen(integer c, string n, key id, string m) { heard += [c, m]; }
}`

async function world() {
  const w = new World()
  w.addRegion('home', { x: 0, y: 0 })
  w.addAvatar({ region: 'home', key: OWNER, username: 'i.doll', name: 'i Doll' })
  w.addAvatar({ region: 'home', key: OTHER, username: 'fivebot', name: 'fivebot Resident' })
  return w
}

async function object(w: World, owner: string, source: string) {
  const loaded = await loadLinkset({ world: w, region: 'home', owner, prims: [{ name: 'probe', scripts: [{ name: 's', source: { source } }] }] })
  loaded.scripts.s!.start()
  return { ...loaded, script: loaded.scripts.s! }
}

// https://wiki.secondlife.com/wiki/LlRegionSayTo
describe('chat to another avatar\'s attachments', () => {
  // In-world: the sender, rezzed by i doll, used llSay, llRegionSay and llRegionSayTo.
  // An attachment fivebot owned and wore heard llSay and llRegionSay on 4832, and
  // llRegionSayTo(fivebot) on 4832 and -4832 but not on 0. It heard
  // llRegionSayTo(its own key) on 0 and -4832, and nothing addressed to i doll.
  it('reaches attachments owned and worn by the addressed avatar', async () => {
    const w = await world()
    const worn = await object(w, OTHER, listener)
    worn.linkset.attachToAvatar(OTHER, 6)
    const sender = await object(w, OWNER, `default { touch_start(integer n) {
      llSay(4832, "say");
      llRegionSay(4832, "region");
      llRegionSayTo("${OTHER}", 4832, "to avatar");
      llRegionSayTo("${OTHER}", -4832, "to avatar negative");
      llRegionSayTo("${OTHER}", 0, "to avatar zero");
      llRegionSayTo("${OWNER}", 4832, "to owner");
      llRegionSayTo("${OWNER}", -4832, "to owner negative");
      llRegionSayTo("${worn.prims[0]!.key}", 0, "to prim zero");
      llRegionSayTo("${worn.prims[0]!.key}", -4832, "to prim negative");
    } }`)
    sender.linkset.touch(0)
    expect(worn.script.global('heard')).toEqual([
      4832, 'say', 4832, 'region', 4832, 'to avatar', -4832, 'to avatar negative',
      0, 'to prim zero', -4832, 'to prim negative',
    ])
  })

  // In-world: an object fivebot rezzed heard llRegionSayTo(its key) on 0 and 4832.
  it('reaches another resident\'s rezzed object by its key', async () => {
    const w = await world()
    const rezzed = await object(w, OTHER, listener)
    const sender = await object(w, OWNER, `default { touch_start(integer n) {
      llRegionSayTo("${rezzed.prims[0]!.key}", 0, "zero");
      llRegionSayTo("${rezzed.prims[0]!.key}", 4832, "positive");
      llRegionSayTo("${OTHER}", 4832, "to avatar");
    } }`)
    sender.linkset.touch(0)
    expect(rezzed.script.global('heard')).toEqual([0, 'zero', 4832, 'positive'])
  })
})

// https://wiki.secondlife.com/wiki/DEBUG_CHANNEL
describe('another resident\'s object on DEBUG_CHANNEL', () => {
  // In-world: an object and an attachment owned by fivebot both heard i doll's
  // object say "explicit 483" on DEBUG_CHANNEL, its "Script trying to debit L$..."
  // error, and the two lines of its Math Error run-time error.
  it('hears script errors from an object it does not own', async () => {
    const w = await world()
    const rezzed = await object(w, OTHER, listener)
    const worn = await object(w, OTHER, listener)
    worn.linkset.attachToAvatar(OTHER, 6)
    const erring = await object(w, OWNER, `default { touch_start(integer n) {
      llSay(DEBUG_CHANNEL, "explicit");
      llGiveMoney(llGetOwner(), 1);
    } }`)
    erring.linkset.touch(0)
    const expected = [DEBUG, 'explicit', DEBUG, 'Script trying to debit L$ from owner but PERMISSION_DEBIT permission not set!']
    expect(rezzed.script.global('heard')).toEqual(expected)
    expect(worn.script.global('heard')).toEqual(expected)
  })
})
// https://wiki.secondlife.com/wiki/LlName2Key
// https://wiki.secondlife.com/wiki/LlRequestUserKey
describe('Resident names', () => {
  // In-world: llName2Key and llRequestUserKey from i doll's object, with fivebot
  // (username "fivebot", legacy name "fivebot Resident") on the same parcel. A dotted
  // name with an empty second part reads as Resident; "i Doll." and "i..doll" still
  // fail because their first part is not a username of its own.
  it.each(['fivebot', 'FIVEBOT', 'FiveBot', 'fivebot Resident', 'fivebot resident', 'FIVEBOT RESIDENT',
    'fivebot.resident', 'fivebot.Resident', 'FIVEBOT.RESIDENT', ' fivebot ', 'fivebot_resident', 'fivebot-resident',
    'fivebot  Resident', 'fivebot.', 'fivebot.resident.x', 'fivebot..resident', 'fivebot Resident '])('finds a Resident from %j', async (name) => {
    const w = await world()
    const { script } = await object(w, OWNER, `key found; string answer; default { state_entry() { found = llName2Key("${name}"); llRequestUserKey("${name}"); } dataserver(key q, string d) { answer = d; } }`)
    expect(script.global('found')).toBe(OTHER)
    expect(script.global('answer')).toBe(OTHER)
  })

  it.each(['fivebot Resident x', 'fivebot Linden', 'fivebot.linden', 'five', 'fivebo', '.fivebot', 'fivebot Resident.'])('finds no Resident from %j', async (name) => {
    const w = await world()
    const { script } = await object(w, OWNER, `key found; string answer; default { state_entry() { found = llName2Key("${name}"); llRequestUserKey("${name}"); } dataserver(key q, string d) { answer = d; } }`)
    expect(script.global('found')).toBe('00000000-0000-0000-0000-000000000000')
    expect(script.global('answer')).toBe('00000000-0000-0000-0000-000000000000')
  })
})

// https://wiki.secondlife.com/wiki/LlGetAgentList
describe('llGetAgentList with two avatars', () => {
  // In-world: both avatars on the platform's parcel -> every scope listed both. With
  // fivebot on a smaller parcel of the same owner, AGENT_LIST_PARCEL listed only
  // i doll and AGENT_LIST_PARCEL_OWNER and AGENT_LIST_REGION listed both.
  it('splits parcel and parcel-owner scopes across two parcels of one owner', async () => {
    const w = await world()
    w.addParcel({ region: 'home', owner: OWNER, bounds: { min: { x: 0, y: 0 }, max: { x: 128, y: 256 } } })
    w.addParcel({ region: 'home', owner: OWNER, bounds: { min: { x: 128, y: 0 }, max: { x: 256, y: 256 } } })
    const { script } = await object(w, OWNER, `list p; list o; list r; default { touch_start(integer n) {
      p = llGetAgentList(AGENT_LIST_PARCEL, []); o = llGetAgentList(AGENT_LIST_PARCEL_OWNER, []); r = llGetAgentList(AGENT_LIST_REGION, []); } }`)
    const other = w.avatars.find(a => a.key === OTHER)!
    script.linkset.touch(0)
    for (const scope of ['p', 'o', 'r']) expect([...script.global(scope) as string[]].sort()).toEqual([OWNER, OTHER])
    other.position = { x: 140, y: 0, z: 0 }
    script.linkset.touch(0)
    expect(script.global('p')).toEqual([OWNER])
    expect([...script.global('o') as string[]].sort()).toEqual([OWNER, OTHER])
    expect([...script.global('r') as string[]].sort()).toEqual([OWNER, OTHER])
  })
})

// https://wiki.secondlife.com/wiki/LlIsFriend
describe('llIsFriend with two avatars', () => {
  // In-world: fivebot, present and not a friend -> 0 from i doll's object, and i doll
  // -> 0 from fivebot's object and attachment. A friend of i doll's who was offline
  // -> 1. Both avatars -> 0 for themselves.
  it('is false for a present avatar who is not a friend, either way round', async () => {
    const w = await world()
    const mine = await object(w, OWNER, `integer f; integer self; default { state_entry() { f = llIsFriend("${OTHER}"); self = llIsFriend(llGetOwner()); } }`)
    const theirs = await object(w, OTHER, `integer f; integer self; default { state_entry() { f = llIsFriend("${OWNER}"); self = llIsFriend(llGetOwner()); } }`)
    expect([mine.script.global('f'), mine.script.global('self')]).toEqual([0, 0])
    expect([theirs.script.global('f'), theirs.script.global('self')]).toEqual([0, 0])
  })

  it('is true for an offline friend of a present owner', async () => {
    const w = new World()
    w.addRegion('home', { x: 0, y: 0 })
    const friend = '44444444-4444-4444-4444-444444444444'
    w.addAvatar({ region: 'home', key: OWNER, username: 'i.doll', friends: [friend] })
    const { script } = await object(w, OWNER, `integer f; default { state_entry() { f = llIsFriend("${friend}"); } }`)
    expect(script.global('f')).toBe(1)
  })
})

// https://wiki.secondlife.com/wiki/LlMapDestination
// In-world: each call drew a different position; the viewer log of each avatar showed
// which calls reached it.
describe('llMapDestination audiences', () => {
  const owner = OWNER
  const toucher = OTHER
  const map = (z: number) => `llMapDestination("SLua Tideland", <1,2,${z}>, ZERO_VECTOR)`
  const shown = (s: { viewerRequests: ReadonlyArray<{ kind: string; agent: string; position?: { z: number } }> }) =>
    s.viewerRequests.filter(r => r.kind === 'mapDestination').map(r => [r.agent, r.position!.z])

  // In-world: a rezzed object's touch_start, touch and touch_end each showed the map
  // to fivebot when fivebot clicked, and never to i doll. A listen, from either avatar,
  // a state_entry and a timer showed it to nobody.
  it('shows a rezzed object\'s map to the toucher only, and to nobody outside a touch', async () => {
    const s = await loadScript({ owner, source: `default {
      touch_start(integer n) { ${map(1)}; }
      listen(integer c, string n, key id, string m) { ${map(2)}; }
      state_entry() { llListen(5, "", NULL_KEY, ""); ${map(3)}; llSetTimerEvent(4); }
      timer() { llSetTimerEvent(0); ${map(4)}; }
    }` })
    s.start()
    s.advanceTime(5000)
    s.linkset.touch(0, { avatar: { key: toucher, name: 'fivebot' } })
    s.deliverChat({ channel: 5, name: 'fivebot', key: toucher, message: 'map' })
    s.deliverChat({ channel: 5, name: 'i Doll', key: owner, message: 'map' })
    expect(shown(s)).toEqual([[toucher, 1]])
  })

  it.each(['touch', 'touch_end'])('shows the map from %s alone to the toucher', async (event) => {
    const s = await loadScript({ owner, source: `default { ${event}(integer n) { ${map(1)}; } }` })
    s.linkset.touch(0, { avatar: { key: toucher, name: 'fivebot' } })
    expect(shown(s)).toEqual([[toucher, 1]])
  })

  // In-world: three calls in one touch_start, the last after a 3 s sleep, showed only
  // the first. A touch_start call and a touch_end call for the same click showed only
  // the touch_start one. Clicks 2 s and 5 s apart each showed the map again, and two
  // scripts in one prim each showed it for the same click.
  it('shows the map once per click and script', async () => {
    const w = await world()
    const { scripts, linkset } = await loadLinkset({ world: w, region: 'home', owner, prims: [{ scripts: [
      { name: 'a', source: { source: `default {
        touch_start(integer n) { ${map(1)}; ${map(2)}; llSleep(3); ${map(3)}; }
        touch_end(integer n) { ${map(4)}; }
      }` } },
      { name: 'b', source: { source: `default { touch_start(integer n) { ${map(5)}; } }` } },
    ] }] })
    linkset.touch(0, { avatar: { key: toucher, name: 'fivebot' } })
    linkset.touch(0, { avatar: { key: toucher, name: 'fivebot' } })
    expect(shown(scripts.a!)).toEqual([[toucher, 1], [toucher, 1]])
    expect(shown(scripts.b!)).toEqual([[toucher, 5], [toucher, 5]])
  })

  // In-world: in an attachment i doll wore, a listen from either avatar showed the map
  // to i doll. A click by i doll showed it to i doll, both calls of a touch_start that
  // made two. Clicks by fivebot showed it to nobody.
  it('shows an attachment\'s map to its owner only', async () => {
    const w = await world()
    const { script: s, linkset } = await object(w, owner, `default {
      state_entry() { llListen(5, "", NULL_KEY, ""); }
      touch(integer n) { ${map(1)}; ${map(3)}; }
      listen(integer c, string n, key id, string m) { ${map(2)}; }
    }`)
    linkset.attachToAvatar(owner, 5)
    s.deliverChat({ channel: 5, name: 'fivebot', key: toucher, message: 'map' })
    linkset.touch(0, { avatar: { key: toucher, name: 'fivebot' } })
    linkset.touch(0, { avatar: { key: owner, name: 'i Doll' } })
    expect(shown(s)).toEqual([[owner, 2], [owner, 1], [owner, 3]])
  })
})

// https://wiki.secondlife.com/wiki/Detected
// In-world: while the object's listen handler slept 12 s, i doll clicked it and then
// fivebot did -> one touch_start(2) [i doll, fivebot], one touch(2) and one
// touch_end(2) [i doll, fivebot]. Clicks by fivebot, i doll, fivebot -> touch_start(2)
// [fivebot, i doll], touch(2) and touch_end(2) [i doll, fivebot]: touch_start in
// order of each avatar's first click, touch and touch_end in order of the last.
// The VM queues each click as its own events; merging clicks held back during a
// sleep is #454's work.
it.fails('merges clicks by two avatars during one sleep into one event of each kind', async () => {
  const s = await loadScript({ owner: OWNER, source: `list log;
    string ev(string e, integer n) { string s = e + (string)n; integer i; for (i = 0; i < n; ++i) s += " " + (string)llDetectedKey(i); return s; }
    default {
      state_entry() { llSetTimerEvent(1); }
      timer() { llSetTimerEvent(0); llSleep(12); }
      touch_start(integer n) { log += [ev("ts", n)]; }
      touch(integer n) { log += [ev("t", n)]; }
      touch_end(integer n) { log += [ev("te", n)]; }
    }` })
  s.start()
  s.advanceTime(1500)
  s.linkset.touch(0, { avatar: { key: OTHER, name: 'fivebot' } })
  s.advanceTime(2000)
  s.linkset.touch(0, { avatar: { key: OWNER, name: 'i Doll' } })
  s.advanceTime(2000)
  s.linkset.touch(0, { avatar: { key: OTHER, name: 'fivebot' } })
  s.advanceTime(20000)
  expect(s.global('log')).toEqual([`ts2 ${OTHER} ${OWNER}`, `t2 ${OWNER} ${OTHER}`, `te2 ${OWNER} ${OTHER}`])
})
