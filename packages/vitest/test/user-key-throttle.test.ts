import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

const NULL_KEY = '00000000-0000-0000-0000-000000000000'
const DEBUG_CHANNEL = 2147483647

// https://wiki.secondlife.com/wiki/LlRequestUserKey
// Measured on the Aditi beta grid, SLua Tideland and Mauve, 2026-11-23. The probe
// called llRequestUserKey("fivebot") in timed runs, logging each returned key with
// llGetTime, and each dataserver answer. Each run started from an idle throttle.
const OWNER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const ERROR = 'Too many llRequestUserKey requests.  Throttled until average falls.'
const FLOOD = 'Too many errors... dropping further messages until the flood stops'

const probe = `list keys; list answered;
default {
  state_entry() { llListen(1, "", NULL_KEY, ""); }
  listen(integer c, string n, key id, string m) {
    list segments = llParseString2List(m, ["/"], []);
    integer s;
    for (s = 0; s < llGetListLength(segments); ++s) {
      list p = llCSV2List(llList2String(segments, s));
      if (llList2Float(p, 0) > 0) llSleep(llList2Float(p, 0));
      integer count = llList2Integer(p, 1);
      float gap = llList2Float(p, 2);
      integer i;
      for (i = 0; i < count; ++i) {
        if (i > 0 && gap > 0) llSleep(gap);
        keys += [llRequestUserKey("fivebot")];
      }
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
    // Each segment is "wait,count,gap": sleep `wait` s, then make `count` calls `gap` s apart.
    const run = (segments: string) => s.deliverChat({ channel: 1, name: 'i doll', key: owner, message: segments })
    const accepted = () => (s.global('keys') as string[]).map(k => k !== NULL_KEY)
    return { s, run, accepted }
  }
  const objects = []
  for (let i = 0; i < prims; i++) objects.push(await load(regions[i % regions.length]!))
  return { w, objects, load }
}

const runs = (flags: boolean[]) => flags.reduce<string[]>((out, f, i) => {
  if (i > 0 && f === flags[i - 1]) out[out.length - 1] = `${Number.parseInt(out[out.length - 1]!) + 1}${f ? '+' : '-'}`
  else out.push(`1${f ? '+' : '-'}`)
  return out
}, []).join(' ')

describe('llRequestUserKey throttle', () => {
  // In-world: 40 calls in one event -> keys for the first 20, then NULL_KEY for the
  // other 20 and no dataserver event for them. Bursts of 25 and 22 also got exactly
  // 20 keys. Each refused call says the error on DEBUG_CHANNEL, until the error flood
  // cap: 15 refused calls gave 8 errors and the flood notice.
  it('answers 20 calls in a burst and refuses the rest with NULL_KEY and an error', async () => {
    const { objects: [o] } = await setup()
    o!.run('0,25,0')
    o!.s.advanceTime(1000)
    expect(o!.accepted()).toEqual([...Array(20).fill(true), ...Array(5).fill(false)])
    expect((o!.s.global('answered') as string[]).length).toBe(20)
    expect(o!.s.chat.filter(c => c.channel === DEBUG_CHANNEL)).toEqual(Array(5).fill({ channel: DEBUG_CHANNEL, text: ERROR, type: 'say' }))
  })

  it('stops saying the error at the error flood cap', async () => {
    const { objects: [o] } = await setup()
    o!.run('0,10,0/5,25,0')
    o!.s.advanceTime(10_000)
    expect(o!.s.chat.filter(c => c.channel === DEBUG_CHANNEL).map(c => c.text)).toEqual([...Array(8).fill(ERROR), FLOOD])
  })

  // In-world: each run below, from an idle throttle, gave these answers in order
  // ("20+ 6-" is 20 keys, then 6 NULL_KEY). A lookup is refused when the lookups
  // answered in the current 10 s period, plus the previous period's scaled by the
  // part of this period still to come, would pass 20. The periods start at the first
  // lookup. That refusal shuts lookups until the end of the next period, and
  // refusals past the limit while shut keep it shut. Refused lookups count.
  it.each([
    // 0.61, 0.555 and 0.51 s apart.
    ['0,40,0.61', '40+'],
    ['0,40,0.555', '40+'],
    ['0,50,0.51', '20+ 30-'],
    // 10 at once, then 25 at once 5 to 25 s later: none of the 10 are back by 10 s,
    // then one more each second.
    ['0,10,0/5,25,0', '20+ 15-'],
    ['0,10,0/8,25,0', '20+ 15-'],
    ['0,10,0/12,25,0', '22+ 13-'],
    ['0,10,0/14,25,0', '24+ 11-'],
    ['0,10,0/16,25,0', '26+ 9-'],
    ['0,10,0/18,25,0', '28+ 7-'],
    ['0,10,0/25,25,0', '30+ 5-'],
    // The period of the first 5 ends at 10 s, not 10 s after the second burst.
    ['0,5,0/15,25,0', '22+ 8-'],
    // 20 at once is not refused, so nothing is shut: one call is answered 12 to
    // 16.5 s later, and a burst 17 s later gets 14.
    ['0,20,0/12,1,0', '21+'],
    ['0,20,0/15.1,1,0', '21+'],
    ['0,20,0/16.5,1,0', '21+'],
    ['0,20,0/17,25,0', '34+ 11-'],
    // A 21st call shuts it until 20 s.
    ['0,21,0/16,1,0', '20+ 2-'],
    ['0,21,0/20,1,0', '20+ 1- 1+'],
    ['0,21,0/25,1,0', '20+ 1- 1+'],
    // After 20 at once, calls every 3, 4 or 5 s: the 5 s call at 10 s is past the
    // limit and keeps it shut until 30 s.
    ['0,20,0/3,15,3', '20+ 6- 9+'],
    ['0,20,0/4,10,4', '20+ 4- 6+'],
    ['0,20,0/5,8,5', '20+ 5- 3+'],
    // Every 1 or 2 s: the calls past the limit early in the second period keep it
    // shut until 30 s, however many were refused before.
    ['0,20,0/0,40,1', '20+ 30- 10+'],
    ['0,30,0/1,45,1', '20+ 39- 16+'],
    ['0,20,0/2,20,2', '20+ 14- 6+'],
    // Lookups refused while shut count: 21 at once, 10 more 2 s apart, then 25 at
    // once 10 s later.
    ['0,21,0/2,10,2/10,25,0', '20+ 11- 19+ 6-'],
    // A period starts again at the first call after an idle period: the burst at 25 s
    // shut lookups until 45 s, not 40 s.
    ['0,10,0/25,25,0/16,1,0', '30+ 6-'],
    // 60 calls 0.42 s apart, 7 s after 40 calls 0.61 s apart: 18 of the 60 were
    // answered. A rerun, whose sleeps came out at 0.622 and 0.4215 s, got 19.
    ['0,40,0.61/7,60,0.42', '58+ 42-'],
    ['0,40,0.622/7,60,0.4215', '59+ 41-'],
  ])('%s gives %s', async (segments, answers) => {
    const { objects: [o] } = await setup()
    o!.run(segments)
    o!.s.advanceTime(120_000)
    expect(runs(o!.accepted())).toBe(answers)
  })

  // In-world: after a burst of 20 from one script, a second script in the same prim
  // and a script in another object of the same owner were refused at once.
  it('is shared by every object of the owner in the region', async () => {
    const { objects: [a, b] } = await setup(2)
    a!.run('0,20,0')
    b!.run('0,2,0')
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
    mine!.run('0,21,0')
    theirs.run('0,2,0')
    expect(theirs.accepted()).toEqual([true, true])
  })

  // In-world: after a burst of 22 in SLua Tideland, an attachment of the same owner
  // that had teleported to Mauve was answered 4 s later.
  it('is counted per region', async () => {
    const { w, objects: [home], load } = await setup(1, ['home', 'away'])
    const worn = await load('home')
    worn.s.linkset.attachToAvatar(OWNER, 6)
    home!.run('0,22,0')
    w.avatars.find(a => a.key === OWNER)!.region = 'away'
    worn.run('0,2,0')
    expect(worn.accepted()).toEqual([true, true])
  })
})
