import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

const NULL_KEY = '00000000-0000-0000-0000-000000000000'
const DEBUG_CHANNEL = 2147483647

// https://wiki.secondlife.com/wiki/LlRequestUserKey
// Measured on the Aditi beta grid, SLua Tideland and Mauve, 2026-11-23. The probe
// called llRequestUserKey("fivebot") `count` times, sleeping `gap` seconds between
// calls, and logged each returned key and each dataserver answer.
const OWNER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const ERROR = 'Too many llRequestUserKey requests.  Throttled until average falls.'

const probe = `list keys; list answered;
default {
  state_entry() { llListen(1, "", NULL_KEY, ""); }
  listen(integer c, string n, key id, string m) {
    list p = llCSV2List(m);
    integer count = llList2Integer(p, 0);
    float gap = llList2Float(p, 1);
    integer i;
    for (i = 0; i < count; ++i) {
      keys += [llRequestUserKey("fivebot")];
      if (gap > 0) llSleep(gap);
    }
  }
  dataserver(key q, string d) { if (llListFindList(keys, [q]) >= 0) answered += [q]; }
}`

async function setup(prims = 1, regions = ['home']) {
  const w = new World()
  regions.forEach((r, i) => w.addRegion(r, { x: i * 256, y: 0 }))
  w.addAvatar({ region: 'home', key: OWNER, username: 'i.doll' })
  w.addAvatar({ region: 'home', key: OTHER, username: 'fivebot' })
  const load = async (region: string, owner = OWNER) => {
    const { scripts } = await loadLinkset({ world: w, region, owner, prims: [{ scripts: [{ name: 's', source: { source: probe } }] }] })
    const s = scripts.s!
    s.start()
    const run = (count: number, gap = 0) => s.deliverChat({ channel: 1, name: 'i doll', key: owner, message: `${count},${gap}` })
    const accepted = () => (s.global('keys') as string[]).map(k => k !== NULL_KEY)
    return { s, run, accepted }
  }
  const objects = []
  for (let i = 0; i < prims; i++) objects.push(await load(regions[i % regions.length]!))
  return { w, objects, load }
}

const count = (flags: boolean[], value: boolean) => flags.filter(f => f === value).length

describe('llRequestUserKey throttle', () => {
  // In-world: 40 calls in one event -> keys for the first 20, then NULL_KEY for the
  // other 20 with the error on DEBUG_CHANNEL for each and no dataserver event.
  // Bursts of 25 and 22 also got exactly 20 keys.
  it('answers 20 calls in a burst and refuses the rest with NULL_KEY and an error', async () => {
    const { objects: [o] } = await setup()
    o!.run(25)
    o!.s.advanceTime(1000)
    expect(o!.accepted()).toEqual([...Array(20).fill(true), ...Array(5).fill(false)])
    expect((o!.s.global('answered') as string[]).length).toBe(20)
    expect(o!.s.chat.filter(c => c.channel === DEBUG_CHANNEL)).toEqual(Array(5).fill({ channel: DEBUG_CHANNEL, text: ERROR, type: 'say' }))
  })

  // In-world: 40 calls 0.61 s apart and 40 calls 0.555 s apart -> all answered.
  it.each([0.61, 0.555])('answers every call made %f s apart', async (gap) => {
    const { objects: [o] } = await setup()
    o!.run(40, gap)
    o!.s.advanceTime(30_000)
    expect(count(o!.accepted(), true)).toBe(40)
  })

  // In-world: 50 calls 0.51 s apart -> 20 answered, then all 30 refused over the next
  // 15 s.
  it('refuses calls made about two a second after the 20th', async () => {
    const { objects: [o] } = await setup()
    o!.run(50, 0.51)
    o!.s.advanceTime(30_000)
    expect(o!.accepted()).toEqual([...Array(20).fill(true), ...Array(30).fill(false)])
  })

  // In-world: after a burst of 20 with no other calls, a call 15.1 s later was
  // refused, and calls 18.0, 19.5, 21.0 and 24.1 s later were answered.
  it.each([[15.1, false], [18, true], [21, true]])('after a burst of 20, a call %f s later is answered: %s', async (after, answered) => {
    const { objects: [o] } = await setup()
    o!.run(20)
    o!.s.advanceTime(after * 1000)
    o!.run(1)
    expect(o!.accepted()).toEqual([...Array(20).fill(true), answered])
  })

  // In-world: after a burst of 20 from one script, a second script in the same prim
  // and a script in another object of the same owner were refused at once.
  it('is shared by every object of the owner in the region', async () => {
    const { objects: [a, b] } = await setup(2)
    a!.run(20)
    b!.run(2)
    expect(b!.accepted()).toEqual([false, false])
  })

  it('is shared by the scripts in one prim', async () => {
    const { w } = await setup(0)
    const { scripts } = await loadLinkset({ world: w, region: 'home', owner: OWNER, prims: [{ scripts: [
      { name: 'a', source: { source: 'default { state_entry() { integer i; for (i = 0; i < 20; ++i) llRequestUserKey("fivebot"); } }' } },
      { name: 'b', source: { source: 'key k = "x"; default { touch_start(integer n) { k = llRequestUserKey("fivebot"); } }' } },
    ] }] })
    scripts.a!.start(); scripts.b!.start()
    scripts.b!.linkset.touch(0)
    expect(scripts.b!.global('k')).toBe(NULL_KEY)
  })

  // In-world: right after a burst of 21 from i doll's object, an object fivebot owned
  // was answered twice.
  it('is counted per owner', async () => {
    const { objects: [mine], load } = await setup()
    const theirs = await load('home', OTHER)
    mine!.run(21)
    theirs.run(2)
    expect(theirs.accepted()).toEqual([true, true])
  })

  // In-world: after a burst of 22 in SLua Tideland, an attachment of the same owner
  // that had teleported to Mauve was answered 4 s later.
  it('is counted per region', async () => {
    const { w, objects: [home], load } = await setup(1, ['home', 'away'])
    const worn = await load('home')
    worn.s.linkset.attachToAvatar(OWNER, 6)
    home!.run(22)
    w.avatars.find(a => a.key === OWNER)!.region = 'away'
    worn.run(2)
    expect(worn.accepted()).toEqual([true, true])
  })

  // In-world: 60 calls 0.42 s apart, made 7 s after 40 calls 0.61 s apart -> 18
  // answered, then all 42 refused over 17 s. The earlier run still counted, and the
  // refused calls kept the lockout going; the VM answers 20 and lets the last call
  // through.
  it.fails('counts a run that ended 7 s earlier and keeps refusing while calls continue', async () => {
    const { objects: [o] } = await setup()
    o!.run(40, 0.61)
    o!.s.advanceTime(31_400)
    o!.run(60, 0.42)
    o!.s.advanceTime(30_000)
    expect(o!.accepted().slice(40)).toEqual([...Array(18).fill(true), ...Array(42).fill(false)])
  })
})
