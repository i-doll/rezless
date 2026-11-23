import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

const OWNER = '11111111-1111-1111-1111-111111111111'
const DEBUG_CHANNEL = 2147483647
const FLOOD = 'Too many errors... dropping further messages until the flood stops'

// Measured on the Aditi beta grid, SLua Tideland, 2026-11-23. Each probe object said
// errors with llPlaySound on a sound it didn't have, in timed runs, while the owner's
// viewer and a listener prim on DEBUG_CHANNEL logged what arrived. Each of those calls
// takes 1 s, in-world and here.
//
// The periods start every 16 s on the region's clock, not at a prim's first error, so
// how a run comes out depends on how far into a period it starts. Here the clock starts
// at the start of a period, and a first segment that only waits sets the start.
const probe = `default {
  state_entry() { llListen(1, "", NULL_KEY, ""); }
  listen(integer c, string n, key id, string m) {
    list segments = llParseString2List(m, ["/"], []);
    integer s; integer e;
    for (s = 0; s < llGetListLength(segments); ++s) {
      list p = llCSV2List(llList2String(segments, s));
      if (llList2Float(p, 0) > 0) llSleep(llList2Float(p, 0));
      integer count = llList2Integer(p, 1);
      float gap = llList2Float(p, 2);
      integer i;
      for (i = 0; i < count; ++i) {
        if (i > 0 && gap > 0) llSleep(gap);
        ++e;
        if (llList2String(p, 3) == "say") llSay(DEBUG_CHANNEL, "said " + (string)e);
        else if (llList2String(p, 3) == "owner") llNavigateTo(llGetPos(), []);
        else if (llList2String(p, 3) == "media") llSetLinkMedia(2, 99, [PRIM_MEDIA_HOME_URL, "http://example.com"]);
        else if (llList2String(p, 3) == "crash") { integer z; llOwnerSay((string)(1 / z)); }
        else llPlaySound("missing " + (string)e, 1.0);
      }
    }
  }
}`

const listener = `list heard;
default {
  state_entry() { llListen(DEBUG_CHANNEL, "", NULL_KEY, ""); }
  listen(integer c, string n, key id, string m) { heard += [m]; }
}`

async function setup() {
  const w = new World()
  w.addRegion('home', { x: 0, y: 0 })
  w.addAvatar({ region: 'home', key: OWNER, username: 'i.doll' })
  const object = async (source: string) => {
    const { scripts } = await loadLinkset({ world: w, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 's', source: { source } }] }] })
    scripts.s!.start()
    return scripts.s!
  }
  const ear = await object(listener)
  const errors = async () => {
    const s = await object(probe)
    // Each segment is "wait,count,gap": sleep `wait` s, then say `count` errors `gap` s apart.
    const run = (segments: string) => s.deliverChat({ channel: 1, name: 'i doll', key: OWNER, message: segments })
    const said = () => s.chat.filter(c => c.channel === DEBUG_CHANNEL).map(c => c.text)
    return { s, run, said }
  }
  return { w, ear, errors }
}

/** "8D T 9X 16D": which errors arrived (D), which one the notice took the place of (T), and which were dropped (X). */
function arrivals(said: string[], count: number) {
  const out: string[] = Array(count).fill('X')
  let next = 0
  for (const text of said) {
    const error = /^Could not find sound 'missing (\d+)'\.$/.exec(text)
    if (error) {
      next = Number(error[1])
      out[next - 1] = 'D'
    } else if (text === FLOOD) {
      if (out[next] !== 'X') throw new Error(`notice with no error left to replace after ${next}`)
      out[next++] = 'T'
    }
  }
  return out.join('').match(/(.)\1*/g)!.map(run => run[0] === 'T' ? 'T'.repeat(run.length).split('').join(' ') : `${run.length}${run[0]}`).join(' ')
}

describe('the DEBUG_CHANNEL error flood cap', () => {
  // In-world: 30 errors about 1 s apart, 20 errors 1.5 s apart and 15 errors 2 s apart
  // each gave the first 8, then the notice in place of the 9th, then nothing. The
  // listener heard exactly what the owner saw.
  it.each([['0,30,0', '8D T 21X', 30], ['0,20,0.5', '8D T 11X', 20], ['0,15,1', '8D T 6X', 15]])(
    '%s gives %s', async (segments, expected, count) => {
      const { ear, errors } = await setup()
      const o = await errors()
      o.run(segments)
      o.s.advanceTime(120_000)
      expect(arrivals(o.said(), count)).toBe(expected)
      expect(ear.global('heard')).toEqual(o.said())
    })

  // In-world: after the notice, errors spaced out to 4, 6, 9, 11 and 2.5 s apart were
  // dropped for about 40 s from the first error, then all arrived without another
  // notice. Errors 1 or 2 s apart were dropped for as long as they kept coming (60
  // and 92 s). One error 17, 19, 21 or 23 s after the notice was dropped.
  it.each([
    ['0,9,0/3,25,3', '8D T 9X 16D', 34],
    ['0,9,0/5,20,5', '8D T 6X 14D', 29],
    ['0,9,0/8,10,8', '8D T 4X 6D', 19],
    ['0,9,0/10,12,10', '8D T 3X 9D', 21],
    ['0,9,0/1.5,30,1.5', '8D T 15X 15D', 39],
    ['0,9,0/0,60,0', '8D T 60X', 69],
    ['0,9,0/0,30,0/1,30,1', '8D T 60X', 69],
    ['0,9,0/17,1,0', '8D T 1X', 10],
    ['0,9,0/21,1,0', '8D T 1X', 10],
  ])('%s gives %s', async (segments, expected, count) => {
    const { errors } = await setup()
    const o = await errors()
    o.run(segments)
    o.s.advanceTime(200_000)
    expect(arrivals(o.said(), count)).toBe(expected)
  })

  // In-world: after a run that ended in the notice, 8 errors arrived again 40 s later.
  it('lets errors through again after a quiet spell', async () => {
    const { errors } = await setup()
    const o = await errors()
    o.run('0,10,0/40,10,0')
    o.s.advanceTime(120_000)
    expect(arrivals(o.said(), 20)).toBe('8D T 1X 8D T 1X')
  })

  // In-world: runs of 10 errors 1 s apart and one more 3, 6, 10 and 15 s later, each 25 s
  // after the last. The third run lost its first 6 errors, let 2 through, and then gave
  // the notice: the errors dropped at the end of the second run still counted. Where the
  // series started in a period wasn't logged; starting 9 to 9.5 s in gives this.
  it('counts dropped errors', async () => {
    const { errors } = await setup()
    const o = await errors()
    o.run('9,0,0/0,10,0/3,1,0/25,10,0/6,1,0/25,10,0/10,1,0/25,10,0/15,1,0')
    o.s.advanceTime(300_000)
    expect(arrivals(o.said(), 44)).toBe('8D T 2X 8D T 8X 2D T 2X 8D T 2X')
  })

  // In-world: five runs of 10 errors 1 s apart and one more 3 s later, each 25 s after
  // the last, twice gave 8 errors and the notice. In the third run the first 2 errors
  // were dropped and the other 6 arrived before the notice; the fourth and fifth were
  // like the first two. Where the series started in a period wasn't logged; starting up
  // to 0.75 s in gives this. The first errors of the third run fall in a period whose
  // previous one held the second run's errors.
  it('drops the start of the third run in a series', async () => {
    const { errors } = await setup()
    const o = await errors()
    o.run('0.5,0,0/0,10,0/3,1,0/25,10,0/3,1,0/25,10,0/3,1,0')
    o.s.advanceTime(200_000)
    expect(arrivals(o.said(), 33)).toBe('8D T 2X 8D T 4X 6D T 2X')
  })

  // In-world: while one object was dropping errors, 3 errors from another object of the
  // same owner arrived.
  it('is counted per object', async () => {
    const { errors } = await setup()
    const a = await errors()
    const b = await errors()
    a.run('0,20,0')
    b.run('12,3,0')
    a.s.advanceTime(60_000)
    expect(arrivals(a.said(), 20)).toBe('8D T 11X')
    expect(arrivals(b.said(), 3)).toBe('3D')
  })

  // In-world: with two linked prims, the child's 3 errors arrived while the root's 8
  // errors and its notice did. Two scripts in one prim, 6 errors each at the same
  // time, gave 8 errors between them and the notice.
  it('is counted per prim and shared by its scripts', async () => {
    const w = new World()
    w.addRegion('home', { x: 0, y: 0 })
    const { scripts } = await loadLinkset({ world: w, region: 'home', owner: OWNER, prims: [
      { scripts: [{ name: 'root', source: { source: probe } }, { name: 'twin', source: { source: probe } }] },
      { scripts: [{ name: 'child', source: { source: probe } }] },
    ] })
    for (const s of Object.values(scripts)) s!.start()
    const said = (name: string) => scripts[name]!.chat.filter(c => c.channel === DEBUG_CHANNEL).map(c => c.text)
    scripts.root!.deliverChat({ channel: 1, name: 'i doll', key: OWNER, message: '0,6,0' })
    scripts.twin!.deliverChat({ channel: 1, name: 'i doll', key: OWNER, message: '0,6,0' })
    scripts.child!.deliverChat({ channel: 1, name: 'i doll', key: OWNER, message: '2,3,0' })
    scripts.root!.advanceTime(30_000)
    expect(said('root').length + said('twin').length).toBe(9)
    expect([...said('root'), ...said('twin')].filter(t => t === FLOOD)).toHaveLength(1)
    expect(arrivals(said('child'), 3)).toBe('3D')
  })

  // In-world: 10 and 12 owner-only errors in one event (llNavigateTo with no character)
  // showed the owner 9 of them and no notice; 12 of them 0.5 s apart did the same. 8
  // owner-only errors then 3 llPlaySound errors gave the notice in place of the first
  // sound error.
  it('counts errors only the owner sees, showing the one past the limit as it is', async () => {
    const { errors } = await setup()
    const a = await errors()
    a.run('0,12,0,owner')
    a.s.advanceTime(30_000)
    expect(a.said()).toEqual(Array(9).fill('You must call llCreateCharacter before llNavigateTo.'))
    const b = await errors()
    b.run('0,8,0,owner/0,3,0')
    b.s.advanceTime(30_000)
    expect(b.said().slice(8)).toEqual([FLOOD])
  })

  // In-world: 8 llSay calls on DEBUG_CHANNEL, then 9 errors: the errors gave 8 and the
  // notice, as if the says weren't there.
  it('does not count llSay on DEBUG_CHANNEL', async () => {
    const { errors } = await setup()
    const o = await errors()
    o.run('0,8,0,say/0,9,0')
    o.s.advanceTime(30_000)
    expect(o.said()).toEqual([
      ...Array.from({ length: 8 }, (_, i) => `said ${i + 1}`),
      ...Array.from({ length: 8 }, (_, i) => `Could not find sound 'missing ${i + 9}'.`),
      FLOOD,
    ])
  })

  // In-world: 9 errors 1 s apart, one more, then 10 more 16 s later: the 6 errors at
  // the start of the next period were dropped and 2 more arrived before the notice.
  it('counts errors dropped after the notice', async () => {
    const { errors } = await setup()
    const o = await errors()
    o.run('0,9,0/0,1,0/16,10,0')
    o.s.advanceTime(60_000)
    expect(arrivals(o.said(), 20)).toBe('8D T 7X 2D T 1X')
  })

  // In-world: a root script's 9 llSetLinkMedia errors for a face its child lacks were
  // said by the child: 8 and the notice. The root's own error just after arrived, and
  // the child's own error 14 s later was dropped.
  it('counts an error said by another prim for that prim', async () => {
    const w = new World()
    w.addRegion('home', { x: 0, y: 0 })
    const { scripts, linkset } = await loadLinkset({ world: w, region: 'home', owner: OWNER, prims: [
      { scripts: [{ name: 'root', source: { source: probe } }] },
      { scripts: [{ name: 'child', source: { source: probe } }] },
    ] })
    for (const s of Object.values(scripts)) s!.start()
    scripts.root!.deliverChat({ channel: 1, name: 'i doll', key: OWNER, message: '0,9,0,media/0,1,0' })
    scripts.child!.deliverChat({ channel: 1, name: 'i doll', key: OWNER, message: '14,1,0' })
    scripts.root!.advanceTime(30_000)
    const child = linkset.prims[1]!.key
    const fromChild = scripts.root!.chat.filter(c => c.channel === DEBUG_CHANNEL && c.from === child).map(c => c.text)
    expect(fromChild).toEqual([...Array(8).fill(`PRIM_MEDIA error: face 99 on object ${child} not found`), FLOOD])
    expect(scripts.root!.chat.filter(c => c.channel === DEBUG_CHANNEL && c.from === undefined).map(c => c.text)).toEqual(["Could not find sound 'missing 10'."])
    expect(scripts.child!.chat.filter(c => c.channel === DEBUG_CHANNEL)).toEqual([])
  })

  // In-world: 8 errors, then a math error that crashed the script: the notice came in
  // place of the crash's first line, and its second line was dropped.
  it('counts a script crash', async () => {
    const { errors } = await setup()
    const o = await errors()
    expect(() => {
      o.run('0,8,0/0,1,0,crash')
      o.s.advanceTime(30_000)
    }).toThrow('Math Error')
    expect(o.said().slice(8)).toEqual([FLOOD])
  })

  // A crash's lines take their turn like other errors: the one past the limit becomes the
  // notice for the owner and listeners, and a line before it is still cut to fit the
  // prim's name.
  it.each([
    [6, ['e'.repeat(1146)], ['runtime error']],
    [7, [FLOOD], [FLOOD]],
  ])('ends an SLua crash after %i errors', async (errors, shown, heard) => {
    const source = `for i = 1, ${errors} do ll.PlaySound("missing " .. i, 1.0) end\nerror(string.rep("e", 2000), 0)`
    const { scripts, linkset } = await loadLinkset({ prims: [
      { name: 'probe', scripts: [{ source: { source, filename: 'p.luau', language: 'slua' }, name: 'p', start: false }] },
      { name: 'ear', scripts: [{ source: { source: listener, filename: 'l.lsl' }, name: 'l' }] },
    ] })
    scripts.l!.start()
    expect(() => {
      scripts.p!.start()
      linkset.advanceTime(10_000)
    }).toThrow()
    linkset.advanceTime(10_000)
    const said = scripts.p!.chat.filter(c => c.channel === DEBUG_CHANNEL).map(c => c.text)
    expect(said.slice(errors)).toEqual(['probe [script:p] Script run-time error', ...shown])
    expect((scripts.l!.global('heard') as string[]).slice(errors)).toEqual(['probe [script:p] Script run-time error', ...heard])
  })

  // In-world: 20 llSay calls on DEBUG_CHANNEL in one event all arrived, with no notice.
  it('leaves llSay on DEBUG_CHANNEL alone', async () => {
    const { ear, errors } = await setup()
    const o = await errors()
    o.run('0,20,0,say')
    o.s.advanceTime(10_000)
    expect(ear.global('heard')).toEqual(Array.from({ length: 20 }, (_, i) => `said ${i + 1}`))
  })
  // In-world, with the start of each call and each error's arrival logged by region time:
  // five prims rezzed up to 25 minutes apart and a worn object all fit periods starting at
  // the same point of the region's clock. Runs were then started at chosen points of a
  // period, giving 9 errors and one more later:
  // - 1.5 s in, the last one 22.3 s after the 9th ended: it arrived, twice.
  // - 8.2 s in, so the 9th fell in the next period, the last one 23.8 s after the 9th
  //   ended: it was dropped, twice.
  // - 7.7 s in with 22 s, and 8.1 s in with 24 s: arrived, then dropped.
  // Periods counted from each prim's first error give the opposite in all six.
  it.each([
    ['1.5,0,0/0,9,0/22.3,1,0', '8D T 1D'],
    ['8.2,0,0/0,9,0/23.8,1,0', '8D T 1X'],
    ['7.7,0,0/0,9,0/22,1,0', '8D T 1D'],
    ['8.1,0,0/0,9,0/24,1,0', '8D T 1X'],
  ])('counts in periods on the region clock: %s gives %s', async (segments, expected) => {
    const { errors } = await setup()
    const o = await errors()
    o.run(segments)
    o.s.advanceTime(120_000)
    expect(arrivals(o.said(), 10)).toBe(expected)
  })

  // In-world: the series of three runs 25 s apart lost the first error of the third run and
  // let the other 7 through before the notice. Its calls took 1.02 s, so the third run
  // started 15.2 s into a period, as it does here when the series starts 1.2 s in.
  it('drops the first error of the third run when it starts late in a period', async () => {
    const { errors } = await setup()
    const o = await errors()
    o.run('1.2,0,0/0,10,0/3,1,0/25,10,0/3,1,0/25,10,0/3,1,0')
    o.s.advanceTime(200_000)
    expect(arrivals(o.said(), 33)).toBe('8D T 2X 8D T 3X 7D T 2X')
  })

  // In-world: a worn probe gave 8 errors and the notice, then its avatar teleported to the
  // neighbouring region, or flew across the border into it, and 4 errors 2 s apart from 12 s
  // later all arrived. Without leaving the region the same 4 errors were dropped. 4 errors
  // before a teleport and 9 after it, within 24 s, gave no notice.
  describe('across regions', () => {
    async function worn() {
      const w = new World()
      w.addRegion('home', { x: 0, y: 0 })
      w.addRegion('next', { x: 0, y: 256 })
      const avatar = w.addAvatar({ region: 'home', key: OWNER, username: 'i.doll', position: { x: 128, y: 250, z: 30 } })
      const { scripts, linkset } = await loadLinkset({ world: w, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 's', source: { source: probe } }] }] })
      linkset.attachToAvatar(OWNER, 5)
      const s = scripts.s!
      s.start()
      // Scheduled rather than delivered, so the run is still going when the wearer moves.
      const run = (segments: string) => w.clock.schedule(s, w.clock.now, 'listen', { channel: 1, name: 'i doll', id: OWNER, msg: segments })
      const said = () => s.chat.filter(c => c.channel === DEBUG_CHANNEL).map(c => c.text)
      const away = () => w.teleportAvatar(avatar, { x: 128, y: 300, z: 30 })
      return { s, run, said, away }
    }

    it('drops errors after the notice while the wearer stays', async () => {
      const o = await worn()
      o.run('0,9,0/12,4,1')
      o.s.advanceTime(60_000)
      expect(arrivals(o.said(), 13)).toBe('8D T 4X')
    })

    it('starts the count afresh in the next region', async () => {
      const o = await worn()
      o.run('0,9,0/12,4,1')
      o.s.advanceTime(10_000)
      expect(o.away()).toBe(true)
      o.s.advanceTime(60_000)
      expect(arrivals(o.said(), 13)).toBe('8D T 4D')
    })

    it('does not carry errors said before the teleport', async () => {
      const o = await worn()
      o.run('0,9,0/12,4,1')
      o.s.advanceTime(4_500)
      expect(o.away()).toBe(true)
      o.s.advanceTime(60_000)
      expect(arrivals(o.said(), 13)).toBe('13D')
    })
  })
})
