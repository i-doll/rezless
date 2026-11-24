import { describe, it, expect } from 'vitest'
import { loadLinkset } from '../src/index.js'

// Measured on Aditi, SLua Tideland, 2026-11-24, with a two-prim box: 50 probe scripts in the root
// and one in the child, each compiled on its own, so that a copy started its root scripts over
// about a second and the child's script after them. Each script logged its state_entry,
// touch_start with llDetectedLinkNumber, its first touch, how many touch events it got and when
// the last came, and touch_end. The box was duplicated and the copy's child clicked at once,
// before its script had started.
//
// In-world: in 3 LSL (Mono) and 3 SLua copies held for 1.5 s, every root script that had started
// got touch_start reading link 2 and touch; the child's script started during the hold and got
// touch_end, with no touch_start and no touch. The root scripts got no touch_end and kept getting
// touch, about 22 a second in LSL and 44 in SLua, for as long as they reported (150 s). In one
// LSL and one SLua copy clicked without a hold, the root scripts got touch_start, one touch and
// touch_end, and the child's script, started after the click, got nothing. Root scripts that
// started after the click got nothing either.
//
// In-world, a follow-up in LSL: with the root stuck that way, a click on the child, its script
// now started, was an ordinary click there (touch_start, touch, touch_end) and the root kept
// getting touch. A click on the root then raised only touch_end in the stuck root scripts, no
// touch_start, and their touch events stopped.

const OWNER = '11111111-1111-1111-1111-111111111111'

// https://wiki.secondlife.com/wiki/Touch_start, https://wiki.secondlife.com/wiki/Touch,
// https://wiki.secondlife.com/wiki/Touch_end, https://wiki.secondlife.com/wiki/LlPassTouches
const LSL = `list got; integer n;
default {
  touch_start(integer k) { got += ["start", llDetectedLinkNumber(0)]; }
  touch(integer k) { ++n; }
  touch_end(integer k) { got += ["end", llDetectedLinkNumber(0)]; }
}`

const SLUA = `got = {}
n = 0
LLEvents:on("touch_start", function(d) table.insert(got, "start") table.insert(got, d[1]:getLinkNumber()) end)
LLEvents:on("touch", function(d) n += 1 end)
LLEvents:on("touch_end", function(d) table.insert(got, "end") table.insert(got, d[1]:getLinkNumber()) end)`

type Lang = 'LSL' | 'SLua'

async function copyOf(lang: Lang) {
  const source = lang === 'LSL' ? LSL : SLUA
  const ext = lang === 'LSL' ? 'lsl' : 'luau'
  const { linkset } = await loadLinkset({ owner: OWNER, prims: [
    { scripts: [{ name: 'root', source: { source, filename: `root.${ext}` } }] },
    { scripts: [{ name: 'child', source: { source, filename: `child.${ext}` } }] },
  ] })
  linkset.startAll()
  linkset.advanceTime(1000)
  const copy = linkset.duplicate(undefined, { startScripts: false })
  const script = (name: string) => copy.allScripts().find(s => s.scriptName === name)!
  const got = (name: string) => {
    const g = script(name).global('got')
    return lang === 'LSL' ? g : Object.values(g as Record<string, unknown>)
  }
  const touches = (name: string) => script(name).global('n')
  copy.startAll([script('root')])
  copy.advanceTime(100)
  return { copy, script, got, touches }
}

describe.each<Lang>(['LSL', 'SLua'])('a click on a child whose %s touch script has not started', (lang) => {
  it('passes to the root', async () => {
    // In-world: clicked without a hold -> the root got touch_start (link 2), one touch and
    // touch_end; the child's script, started after the click, got nothing.
    const { copy, script, got, touches } = await copyOf(lang)
    copy.touch(2)
    copy.startAll([script('child')])
    copy.advanceTime(100)
    expect(got('root')).toEqual(['start', 2, 'end', 2])
    expect(touches('root')).toBe(1)
    expect(got('child')).toEqual([])
  })

  it('ends in the child once its script starts during the hold, and the root keeps getting touch', async () => {
    // In-world: held 1.5 s, the child's script starting during the hold -> the root got
    // touch_start (link 2) and touch but no touch_end, and kept getting touch; the child's
    // script got only touch_end.
    const { copy, script, got, touches } = await copyOf(lang)
    copy.clock.scheduleTask(script('child'), copy.clock.now + 500, () => copy.startAll([script('child')]))
    copy.touch(2, { hold: 1500 })
    copy.advanceTime(10)
    expect(got('root')).toEqual(['start', 2])
    expect(got('child')).toEqual(['end', 2])
    expect(touches('child')).toBe(0)
    const held = touches('root') as number
    copy.advanceTime(10000)
    // SLua raised about 44 a second in-world against 22 for LSL; only the LSL rate is modelled.
    if (lang === 'LSL') expect((touches('root') as number) - held).toBe(225)
    else expect(touches('root')).toBeGreaterThan(held)
  })
})

describe('a root left holding a click that ended in its child', () => {
  async function stuck() {
    const made = await copyOf('LSL')
    const { copy, script } = made
    copy.clock.scheduleTask(script('child'), copy.clock.now + 500, () => copy.startAll([script('child')]))
    copy.touch(2, { hold: 1500 })
    copy.advanceTime(1000)
    return made
  }

  it('keeps getting touch through a click on the child', async () => {
    // In-world: the child's next click raised touch_start, one touch and touch_end there; the
    // root got about 22 touch events a second throughout.
    const { copy, got, touches } = await stuck()
    const before = touches('root') as number
    copy.touch(2)
    copy.advanceTime(1000)
    expect(got('child')).toEqual(['end', 2, 'start', 2, 'end', 2])
    expect(touches('child')).toBe(1)
    expect(got('root')).toEqual(['start', 2])
    expect((touches('root') as number) - before).toBe(23)
  })

  it('ends with a click on the root, which raises only touch_end there', async () => {
    // In-world: the stuck root scripts got touch_end and no second touch_start, and no touch
    // events after it. That touch_end reads the ending click, as touch-routing pins.
    const { copy, got, touches } = await stuck()
    const before = touches('root') as number
    copy.touch(1)
    copy.advanceTime(2000)
    expect(got('root')).toEqual(['start', 2, 'end', 1])
    // The ending click raises one touch of its own, as touch-routing pins.
    expect(touches('root')).toBe(before + 1)
  })
})

// In-world, a second probe in LSL on 2026-11-24: a two-prim box whose child held a recorder and a
// helper that stopped it on a chat command and set it running on a link message from the root.
// The root held a recorder and a script that sent that link message 0.5 s after its touch_start.
describe('the release of a click on a child goes where a click would go at that moment', () => {
  const START_ONLY = `list got; integer n;
default { touch_start(integer k) { got += ["start", llDetectedLinkNumber(0)]; } }`

  async function box(child = LSL) {
    const { linkset, scripts } = await loadLinkset({ owner: OWNER, prims: [
      { scripts: [{ name: 'root', source: { source: LSL, filename: 'root.lsl' } }] },
      { scripts: [{ name: 'child', source: { source: child, filename: 'child.lsl' } }] },
    ] })
    linkset.startAll()
    linkset.advanceTime(1000)
    const got = (name: string) => scripts[name]!.global('got')
    const touches = (name: string) => scripts[name]!.global('n') as number
    const setRunning = (at: number, running: boolean) =>
      linkset.clock.scheduleTask(scripts.child!, linkset.clock.now + at, () => { scripts.child!.running = running })
    return { linkset, scripts, got, touches, setRunning }
  }

  it('ends in a stopped child script set running during the hold', async () => {
    // In-world: the root got touch_start and touch, and kept getting touch after the release;
    // the child's script, set running 0.5 s into a 2 s hold, got only touch_end.
    const { linkset, scripts, got, touches, setRunning } = await box()
    scripts.child!.running = false
    setRunning(500, true)
    linkset.touch(2, { hold: 2000 })
    const held = touches('root')
    linkset.advanceTime(1000)
    expect(got('root')).toEqual(['start', 2])
    expect(touches('root')).toBe(held + 23)
    expect(got('child')).toEqual(['end', 2])
    expect(touches('child')).toBe(0)
  })

  it('leaves the root holding the click when the child script set running handles only touch_start', async () => {
    // In-world: the root got touch_start and touch, and no touch_end, and kept getting touch.
    const { linkset, scripts, got, touches, setRunning } = await box(START_ONLY)
    scripts.child!.running = false
    setRunning(500, true)
    linkset.touch(2, { hold: 2000 })
    const held = touches('root')
    linkset.advanceTime(1000)
    expect(got('root')).toEqual(['start', 2])
    expect(touches('root')).toBe(held + 23)
    expect(got('child')).toEqual([])
  })

  it('raises touch_end in the root when the child script that took the click stops before the release', async () => {
    // In-world, twice: the child's script got touch_start and was stopped during a 2 to 2.5 s
    // hold; the root got touch_end at the release, with no touch_start and no touch.
    const { linkset, got, touches, setRunning } = await box()
    setRunning(800, false)
    linkset.touch(2, { hold: 2000 })
    linkset.advanceTime(1000)
    expect(got('root')).toEqual(['end', 2])
    expect(touches('root')).toBe(0)
    expect(got('child')).toEqual(['start', 2])
  })

  it('ends a click the child script still held when that script takes the next release', async () => {
    // In-world: the child's script, stopped through a release, was set running during the next
    // hold, which had passed to the root. It got touch until the release, then touch_end, and
    // no touch after it; the root kept getting touch.
    const { linkset, got, touches, setRunning } = await box()
    setRunning(800, false)
    linkset.touch(2, { hold: 2000 })
    linkset.touch(1)
    setRunning(500, true)
    linkset.touch(2, { hold: 2000 })
    expect(got('child')).toEqual(['start', 2, 'end', 2])
    const child = touches('child')
    const root = touches('root')
    linkset.advanceTime(1000)
    expect(touches('child')).toBe(child)
    expect(touches('root')).toBe(root + 23)
  })
})
