import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

const OWNER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const LAND_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const LAND_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const LAND_H = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

async function object(w: World, owner: string, source: string) {
  const loaded = await loadLinkset({ world: w, region: 'home', owner, prims: [{ name: 'probe', scripts: [{ name: 's', source: { source } }] }] })
  loaded.scripts.s!.start()
  return { ...loaded, script: loaded.scripts.s! }
}

// https://wiki.secondlife.com/wiki/LlGetAgentList
describe('llGetAgentList across parcels of different owners', () => {
  // In-world (Aditi, Mauve, 2026-11-23): an attachment worn by i doll, who stood on a
  // parcel of the region's owner. AGENT_LIST_PARCEL listed her and the residents on
  // that parcel. AGENT_LIST_PARCEL_OWNER also listed a resident on another parcel of
  // the same owner, and left out residents on parcels of two other owners.
  // AGENT_LIST_REGION listed everyone.
  it('lists only avatars on parcels with the same owner as the parcel under the object', async () => {
    const w = new World()
    w.addRegion('home', { x: 0, y: 0 })
    w.addParcel({ region: 'home', owner: LAND_A, bounds: { min: { x: 0, y: 0 }, max: { x: 128, y: 128 } } })
    w.addParcel({ region: 'home', owner: LAND_A, bounds: { min: { x: 128, y: 0 }, max: { x: 256, y: 128 } } })
    w.addParcel({ region: 'home', owner: LAND_C, bounds: { min: { x: 0, y: 128 }, max: { x: 128, y: 256 } } })
    w.addParcel({ region: 'home', owner: LAND_H, bounds: { min: { x: 128, y: 128 }, max: { x: 256, y: 256 } } })
    const at = (key: string, x: number, y: number) => w.addAvatar({ region: 'home', key, username: key.slice(0, 4), position: { x, y, z: 30 } })
    const SAME = '33333333-3333-3333-3333-333333333333'
    const C = '44444444-4444-4444-4444-444444444444'
    const H = '55555555-5555-5555-5555-555555555555'
    at(OWNER, 60, 60); at(SAME, 70, 70); at(OTHER, 200, 60); at(C, 60, 200); at(H, 200, 200)
    const { script, linkset } = await object(w, OWNER, `list p; list o; list r; default { touch_start(integer n) {
      p = llGetAgentList(AGENT_LIST_PARCEL, []); o = llGetAgentList(AGENT_LIST_PARCEL_OWNER, []); r = llGetAgentList(AGENT_LIST_REGION, []); } }`)
    linkset.attachToAvatar(OWNER, 6)
    linkset.touch(0, { avatar: { key: OWNER, name: 'i Doll' } })
    const sorted = (name: string) => [...script.global(name) as string[]].sort()
    expect(sorted('p')).toEqual([OWNER, SAME])
    expect(sorted('o')).toEqual([OWNER, OTHER, SAME])
    expect(sorted('r')).toEqual([OWNER, OTHER, SAME, C, H])
  })
})

// https://wiki.secondlife.com/wiki/LlMapBeacon
// In-world (Aditi, SLua Tideland, 2026-11-23): each call used its own position and
// was read from each avatar's viewer log. i doll owned the objects.
describe('llMapBeacon audiences', () => {
  const beacons = (s: { viewerRequests: ReadonlyArray<{ kind: string }> }) =>
    s.viewerRequests.filter(r => r.kind === 'mapBeacon').map(r => {
      const b = r as unknown as { agent: string; position: { x: number } }
      return [b.agent, b.position.x]
    })
  const source = `default {
    state_entry() { llListen(5, "", NULL_KEY, ""); llSetTimerEvent(1); }
    attach(key id) { if (id) llMapBeacon(llGetRegionName(), <7, 7, 50>, []); }
    touch_start(integer n) { llMapBeacon(llGetRegionName(), <1, 1, 50>, []); llMapBeacon(llGetRegionName(), <2, 2, 50>, []); }
    touch_end(integer n) { llMapBeacon(llGetRegionName(), <3, 3, 50>, []); }
    listen(integer c, string n, key id, string m) { llMapBeacon(llGetRegionName(), <4, 4, 50>, []); }
    timer() { llSetTimerEvent(0); llMapBeacon(llGetRegionName(), <5, 5, 50>, []); }
  }`
  async function setup(script = source) {
    const w = new World()
    w.addRegion('home', { x: 0, y: 0 })
    w.addAvatar({ region: 'home', key: OWNER, username: 'i.doll' })
    w.addAvatar({ region: 'home', key: OTHER, username: 'fivebot' })
    return object(w, OWNER, script)
  }

  // In-world: a rezzed object. fivebot's click showed the touch_start's first call to
  // fivebot only; the second call and the touch_end call showed nothing. i doll's click
  // did the same for i doll. A second click by fivebot showed it again. A listen from
  // either avatar and a timer showed it to nobody. Another object that called it only
  // in touch_end showed it to fivebot when fivebot clicked.
  it('shows a rezzed object\'s beacon to the clicker, once per click, and to nobody outside a touch', async () => {
    const { script, linkset } = await setup()
    script.advanceTime(2000)
    linkset.touch(0, { avatar: { key: OTHER, name: 'fivebot' } })
    linkset.touch(0, { avatar: { key: OWNER, name: 'i Doll' } })
    linkset.touch(0, { avatar: { key: OTHER, name: 'fivebot' } })
    script.deliverChat({ channel: 5, name: 'fivebot', key: OTHER, message: 'x' })
    script.deliverChat({ channel: 5, name: 'i Doll', key: OWNER, message: 'x' })
    expect(beacons(script)).toEqual([[OTHER, 1], [OWNER, 1], [OTHER, 1]])
  })

  it('shows the beacon from touch_end alone to the clicker', async () => {
    const { script, linkset } = await setup(`default { touch_end(integer n) { llMapBeacon(llGetRegionName(), <3, 3, 50>, []); } }`)
    linkset.touch(0, { avatar: { key: OTHER, name: 'fivebot' } })
    expect(beacons(script)).toEqual([[OTHER, 3]])
  })

  // In-world: a click on an object whose touch_start called llMapDestination and then
  // llMapBeacon showed only the map; with the calls the other way round, only the
  // beacon. A second script in the first object, calling llMapBeacon alone, showed its
  // beacon for the same click.
  it('shares one showing per click and script with llMapDestination', async () => {
    const w = new World()
    w.addRegion('home', { x: 0, y: 0 })
    w.addAvatar({ region: 'home', key: OWNER, username: 'i.doll' })
    const { scripts, linkset } = await loadLinkset({ world: w, region: 'home', owner: OWNER, prims: [{ scripts: [
      { name: 'both', source: { source: `default { touch_start(integer n) { llMapDestination("r", <1, 1, 50>, ZERO_VECTOR); llMapBeacon("r", <2, 2, 50>, []); } }` } },
      { name: 'beacon', source: { source: `default { touch_start(integer n) { llMapBeacon("r", <3, 3, 50>, []); } }` } },
      { name: 'reversed', source: { source: `default { touch_start(integer n) { llMapBeacon("r", <4, 4, 50>, []); llMapDestination("r", <5, 5, 50>, ZERO_VECTOR); } }` } },
    ] }] })
    for (const s of Object.values(scripts)) s.start()
    linkset.touch(0, { avatar: { key: OWNER, name: 'i Doll' } })
    const shown = (name: string) => scripts[name]!.viewerRequests.map(r => [r.kind, (r as unknown as { position: { x: number } }).position.x])
    expect(shown('both')).toEqual([['mapDestination', 1]])
    expect(shown('beacon')).toEqual([['mapBeacon', 3]])
    expect(shown('reversed')).toEqual([['mapBeacon', 4]])
  })

  // In-world: the same object worn by i doll. Its attach event, both touch_start calls
  // and the touch_end call of her click, a listen from fivebot and a timer all showed
  // the beacon to i doll. fivebot's click showed it to nobody.
  it('shows an attachment\'s beacon to its owner only', async () => {
    const { script, linkset } = await setup()
    linkset.attachToAvatar(OWNER, 5)
    // Past the map throttle's 4 calls in 4 s (map-throttle.test.ts), as the in-world steps were.
    script.advanceTime(10_000)
    linkset.touch(0, { avatar: { key: OWNER, name: 'i Doll' } })
    linkset.touch(0, { avatar: { key: OTHER, name: 'fivebot' } })
    script.deliverChat({ channel: 5, name: 'fivebot', key: OTHER, message: 'x' })
    expect(beacons(script)).toEqual([[OWNER, 7], [OWNER, 5], [OWNER, 1], [OWNER, 2], [OWNER, 3], [OWNER, 4]])
  })
})

// https://wiki.secondlife.com/wiki/LlIsFriend
// In-world (Aditi, SLua Tideland, 2026-11-23): i doll offered fivebot friendship and
// fivebot accepted. Each owned an object that called llIsFriend on the other.
describe('llIsFriend between two friends', () => {
  async function setup(friends: boolean) {
    const w = new World()
    w.addRegion('home', { x: 0, y: 0 })
    w.addRegion('away', { x: 256, y: 0 })
    w.addAvatar({ region: 'home', key: OWNER, username: 'i.doll', friends: friends ? [OTHER] : [] })
    w.addAvatar({ region: 'home', key: OTHER, username: 'fivebot', friends: friends ? [OWNER] : [] })
    const src = (k: string) => `integer f; default { touch_start(integer n) { f = llIsFriend("${k}"); } }`
    const mine = await object(w, OWNER, src(OTHER))
    const theirs = await object(w, OTHER, src(OWNER))
    const ask = (o: typeof mine) => { o.linkset.touch(0); return o.script.global('f') }
    const move = (key: string, region: string) => { w.avatars.find(a => a.key === key)!.region = region }
    return { mine, theirs, ask, move }
  }

  // In-world: with the offer still pending, both objects returned 0.
  it('is false while the offer is pending', async () => {
    const { mine, theirs, ask } = await setup(false)
    expect([ask(mine), ask(theirs)]).toEqual([0, 0])
  })

  // In-world: once friends, both present -> 1 from each object. With fivebot in another
  // region -> still 1 from each, so i doll's object (owner present) and fivebot's object
  // (friend present) both answered. With both away when the objects asked -> 0 from each.
  it('is true while the owner or the friend is in the region', async () => {
    const { mine, theirs, ask, move } = await setup(true)
    expect([ask(mine), ask(theirs)]).toEqual([1, 1])
    move(OTHER, 'away')
    expect([ask(mine), ask(theirs)]).toEqual([1, 1])
    move(OWNER, 'away')
    expect([ask(mine), ask(theirs)]).toEqual([0, 0])
  })
})
