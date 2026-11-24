import { describe, it, expect } from 'vitest'
import { loadLinkset, World, type Script } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Touch, https://wiki.secondlife.com/wiki/Touch_end,
// https://wiki.secondlife.com/wiki/LlPassTouches, https://wiki.secondlife.com/wiki/LlBreakLink,
// https://wiki.secondlife.com/wiki/LlCreateLink
//
// In-world probes on Aditi (SLua Tideland, 2026-11-24). Each probe script logged touch_start
// with llDetectedLinkNumber, each change in the link number its touch events read, how many
// touch events it got and when, and touch_end with its link number and time. Clicks were held
// 1.5 to 3.5 s; a script that changed the pass setting or the links did it 0.5 s after the
// first touch_start in the object.

const OWNER = '11111111-1111-1111-1111-111111111111'
const B_KEY = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

const LSL = `list got; integer n; integer last = -1;
default {
  touch_start(integer k) { llResetTime(); got += ["start", llDetectedLinkNumber(0)]; llMessageLinked(LINK_SET, 0, "t", ""); }
  touch(integer k) {
    ++n;
    integer d = llDetectedLinkNumber(0);
    if (d != last) { last = d; got += ["touch", d]; }
  }
  touch_end(integer k) { got += ["end", llDetectedLinkNumber(0), llRound(llGetTime() * 1000)]; }
}`

const SLUA = `got = {}
n = 0
local last = -1
local t0 = ll.GetTime()
local function ms() return math.floor((ll.GetTime() - t0) * 1000 + 0.5) end
LLEvents:on("touch_start", function(d)
  t0 = ll.GetTime()
  table.insert(got, "start") table.insert(got, d[1]:getLinkNumber())
  ll.MessageLinked(LINK_SET, 0, "t", "")
end)
LLEvents:on("touch", function(d)
  n += 1
  local l = d[1]:getLinkNumber()
  if l ~= last then last = l table.insert(got, "touch") table.insert(got, l) end
end)
LLEvents:on("touch_end", function(d)
  table.insert(got, "end") table.insert(got, d[1]:getLinkNumber()) table.insert(got, ms())
end)`

/** Runs `action` 0.5 s after the first touch_start in the object. */
const after = (action: string, entry = '') => `integer fired;
default {
  state_entry() { ${entry} }
  link_message(integer s, integer n, string m, key k) { if (m == "t" && !fired) { fired = 1; llSetTimerEvent(0.5); } }
  timer() { llSetTimerEvent(0); ${action} }
}`

/** Sets every other script in its prim running on the first touch_start in the object. */
const STARTER = `default {
  link_message(integer s, integer n, string m, key k) {
    if (m != "t") return;
    integer i = llGetInventoryNumber(INVENTORY_SCRIPT);
    while (i--) { string nm = llGetInventoryName(INVENTORY_SCRIPT, i); if (nm != llGetScriptName()) llSetScriptState(nm, TRUE); }
  }
}`

type Lang = 'LSL' | 'SLua'
interface ScriptSpec { name: string; lang?: Lang; source?: string; running?: boolean; links?: boolean }

const input = (s: ScriptSpec) => {
  const lang = s.lang ?? 'LSL'
  const source = s.source ?? (lang === 'LSL' ? LSL : SLUA)
  const entry = s.links ? source.replace('state_entry() {', 'state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS);') : source
  return { name: s.name, source: { source: entry, filename: `${s.name}.${lang === 'LSL' ? 'lsl' : 'luau'}` } }
}

async function build(prims: ReadonlyArray<ReadonlyArray<ScriptSpec>>, opts: { world?: World; key?: string; x?: number } = {}) {
  const made = await loadLinkset({
    owner: OWNER,
    ...(opts.world && { world: opts.world, region: 'SLua Tideland', position: { x: opts.x ?? 110, y: 50, z: 1997 } }),
    prims: prims.map((scripts, i) => ({ ...(i === 0 && opts.key && { key: opts.key }), scripts: scripts.map(input) })),
  })
  made.linkset.prims.forEach((p, i) => { if (i) p.params.position = { x: 0.45 * i, y: 0, z: 0 } })
  const specs = prims.flat()
  for (const s of specs) made.scripts[s.name]!.start()
  for (const s of specs) if (s.running === false) made.scripts[s.name]!.running = false
  for (const s of specs) if (s.links) made.scripts[s.name]!.grantPermissions()
  made.linkset.advanceTime(1000)
  return made
}

const gotOf = (s: Script) => {
  const g = s.global('got')
  return Array.isArray(g) ? g : Object.values(g as Record<string, unknown>)
}

function recorder(scripts: Record<string, Script>) {
  const got = (name: string) => gotOf(scripts[name]!)
  const touches = (name: string) => scripts[name]!.global('n') as number
  return { got, touches }
}

describe('the touch repeat rate in SLua', () => {
  it('raises touch every simulator frame in SLua and every second frame in LSL, in the same prim', async () => {
    // In-world: an LSL and an SLua script in one prim, held 2 s. The SLua script got touch
    // 0.021 s after touch_start and then every 0.022 s, 89 by the release; the LSL script got
    // 44, every 0.044 s. The in-world release came a frame late, and the first LSL touch two
    // frames after touch_start, which other LSL probes did not show; rezless releases on time,
    // so each gets one more.
    const timer = (lang: Lang) => lang === 'LSL'
      ? `list got; default { touch(integer k) { got += llGetTime(); } }`
      : `got = {} LLEvents:on("touch", function(d) table.insert(got, ll.GetTime()) end)`
    const { linkset, scripts } = await build([[{ name: 'lsl', source: timer('LSL') }, { name: 'slua', lang: 'SLua', source: timer('SLua') }]])
    const t0 = linkset.clock.now / 1000
    linkset.touch(0, { hold: 2000 })
    const lsl = gotOf(scripts.lsl!) as number[]
    const slua = gotOf(scripts.slua!) as number[]
    expect(slua[0]! - t0).toBeCloseTo(1 / 45, 3)
    for (let i = 1; i < slua.length; i++) expect(slua[i]! - slua[i - 1]!).toBeCloseTo(1 / 45, 3)
    for (let i = 1; i < lsl.length; i++) expect(lsl[i]! - lsl[i - 1]!).toBeCloseTo(2 / 45, 3)
    expect(slua).toHaveLength(90)
    expect(lsl).toHaveLength(45)
  })

  it('under llMinEventDelay an SLua held click raises touch once per delay, on its own beat', async () => {
    // In-world: ll.MinEventDelay(1.0) and a 3.5 s hold -> touch at 0.022, 1.022, 2.044, 3.067
    // and 4.067 after touch_start, and touch_end at 4.089 right behind the last one. As in LSL,
    // rezless runs a touch held back by the delay as soon as the delay is over, where in-world
    // it ran on the next simulator frame, up to 0.022 s later.
    const log = `got = {}
ll.MinEventDelay(1.0)
local t0 = 0
local function ms() return math.floor((ll.GetTime() - t0) * 1000 + 0.5) end
LLEvents:on("touch_start", function(d) t0 = ll.GetTime() table.insert(got, "start") end)
LLEvents:on("touch", function(d) table.insert(got, ms()) end)
LLEvents:on("touch_end", function(d) table.insert(got, "end") table.insert(got, ms()) end)`
    const { linkset, scripts } = await build([[{ name: 's', lang: 'SLua', source: log }]])
    linkset.advanceTime(2000)
    linkset.touch(0, { hold: 3500 })
    linkset.advanceTime(2000)
    expect(gotOf(scripts.s!)).toEqual(['start', 22, 1000, 2000, 3000, 4000, 'end', 4000])
  })

  describe.each<Lang>(['LSL', 'SLua'])('a click passed to an %s root and stuck there', (lang) => {
    // In-world: a root recorder and, in the child, a stopped recorder that a helper set running
    // on the root's touch_start, so the 1.5 s click passed to the root ended in the child. The
    // SLua root kept getting touch about 45 times a second (1798 in 40 s), the LSL root about
    // 22 (#708). Under llMinEventDelay(1.0) set in the root, both kept getting touch about once
    // a second (41 in 40 s).
    const stuck = async (entry = '') => {
      const root = lang === 'LSL' ? LSL.replace('default {', `default {\n  state_entry() { ${entry} }`)
        : `${entry ? 'll.MinEventDelay(1.0)\n' : ''}${SLUA}`
      const made = await build([
        [{ name: 'root', lang, source: root }],
        [{ name: 'child', lang, running: false }, { name: 'starter', source: STARTER }],
      ])
      made.linkset.touch(2, { hold: 1500 })
      return { ...made, ...recorder(made.scripts) }
    }

    it('keeps getting touch at its language\'s rate', async () => {
      const { linkset, got, touches } = await stuck()
      expect(got('child')).toEqual(['end', 2, expect.any(Number)])
      expect(got('root')).toEqual(['start', 2, 'touch', 2])
      const before = touches('root')
      linkset.advanceTime(10000)
      expect(touches('root') - before).toBe(lang === 'LSL' ? 225 : 450)
    })

    it('keeps getting touch once per delay under llMinEventDelay', async () => {
      const { linkset, touches } = await stuck('llMinEventDelay(1.0);')
      const before = touches('root')
      linkset.advanceTime(10000)
      expect(touches('root') - before).toBe(10)
    })
  })
})

describe('a pass setting changed during a held click on a child', () => {
  // In-world: a child that set its pass setting in state_entry changed it 0.5 s into a 2 s
  // hold. The release went where a click would have gone at that moment: a root script that
  // got the click and was no longer reached got no touch_end and kept getting touch; one
  // reached only by the release got touch_end alone.
  const PASS = { PASS_IF_NOT_HANDLED: 0, PASS_ALWAYS: 1, PASS_NEVER: 2 } as const
  type Pass = keyof typeof PASS
  const run = async (from: Pass, to: Pass, childHandles: boolean) => {
    const made = await build([
      [{ name: 'root' }],
      [...childHandles ? [{ name: 'child' }] : [], { name: 'passer', source: after(`llPassTouches(${PASS[to]});`, `llPassTouches(${PASS[from]});`) }],
    ])
    made.linkset.touch(2, { hold: 2000 })
    return { ...made, ...recorder(made.scripts) }
  }

  it.each<[Pass, Pass]>([['PASS_ALWAYS', 'PASS_IF_NOT_HANDLED'], ['PASS_ALWAYS', 'PASS_NEVER']])(
    'from %s to %s leaves the click stuck in the root when the child handles it', async (from, to) => {
      const { linkset, got, touches } = await run(from, to, true)
      expect(got('child')).toEqual(['start', 2, 'touch', 2, 'end', 2, 2000])
      expect(got('root')).toEqual(['start', 2, 'touch', 2])
      const before = touches('root')
      linkset.advanceTime(1000)
      expect(touches('root')).toBeGreaterThan(before + 20)
    })

  it('from PASS_ALWAYS to PASS_NEVER leaves the click stuck in the root when the child has no touch handler', async () => {
    const { linkset, got, touches } = await run('PASS_ALWAYS', 'PASS_NEVER', false)
    expect(got('root')).toEqual(['start', 2, 'touch', 2])
    const before = touches('root')
    linkset.advanceTime(1000)
    expect(touches('root')).toBeGreaterThan(before + 20)
  })

  it('from PASS_ALWAYS to PASS_IF_NOT_HANDLED still ends in the root when the child has no touch handler', async () => {
    const { linkset, got, touches } = await run('PASS_ALWAYS', 'PASS_IF_NOT_HANDLED', false)
    expect(got('root')).toEqual(['start', 2, 'touch', 2, 'end', 2, 2000])
    const before = touches('root')
    linkset.advanceTime(1000)
    expect(touches('root')).toBe(before)
  })

  it.each<[Pass, Pass]>([['PASS_NEVER', 'PASS_ALWAYS'], ['PASS_IF_NOT_HANDLED', 'PASS_ALWAYS']])(
    'from %s to %s gives the root touch_end alone', async (from, to) => {
      const { got } = await run(from, to, true)
      expect(got('child')).toEqual(['start', 2, 'touch', 2, 'end', 2, 2000])
      expect(got('root')).toEqual(['end', 2, expect.any(Number)])
    })
})

describe('a script that leaves its touch handlers during a held click', () => {
  // In-world: the clicked script moved 0.5 s into a 2 s hold to a state with no touch handler,
  // and back to its first state after the release. Its next click raised no touch_start, one
  // touch and touch_end, on a lone prim and on a child that set PASS_NEVER alike.
  const script = `list got; integer fired;
default {
  touch_start(integer k) { got += ["start"]; if (!fired) { fired = 1; llSetTimerEvent(0.5); } }
  touch(integer k) { if (llList2String(got, -1) != "touch") got += ["touch"]; }
  touch_end(integer k) { got += ["end"]; }
  timer() { llSetTimerEvent(0); state other; }
}
state other {
  link_message(integer s, integer n, string m, key k) { if (m == "back") state default; }
}`
  it.each([
    ['a lone prim', [[{ name: 's', source: script }]], 0],
    ['a PASS_NEVER child', [[], [{ name: 's', source: script }, { name: 'p', source: 'default { state_entry() { llPassTouches(PASS_NEVER); } }' }]], 2],
  ] as const)('keeps the click on %s, so the next click raises no touch_start', async (_, prims, link) => {
    const made = await build(prims)
    made.linkset.touch(link, { hold: 2000 })
    made.linkset.deliverLinkMessage(1, -1, 0, 'back', '')
    made.linkset.advanceTime(1000)
    made.linkset.touch(link)
    // The script logs a run of touch events once, so the stuck click's touch and the next click's merge.
    expect(gotOf(made.scripts.s!)).toEqual(['start', 'touch', 'end'])
  })
})

describe('a link change during a held click', () => {
  const linker = (action: string): ScriptSpec => ({ name: 'linker', source: after(action, ''), links: true })

  it('llBreakLink of the clicked child leaves its own click running, and touch_end reads its new link number', async () => {
    // In-world: the child's recorder took the click; the root broke link 2. The child's touch
    // events kept reading link 2 and its touch_end at the release read 0. The root got nothing.
    const made = await build([[{ name: 'root' }, linker('llBreakLink(2);')], [{ name: 'child' }]])
    made.linkset.touch(2, { hold: 2000 })
    const { got } = recorder(made.scripts)
    expect(got('child')).toEqual(['start', 2, 'touch', 2, 'end', 0, 2000])
    expect(got('root')).toEqual([])
  })

  it('llBreakLink ends a click passed to the root at once, with the click\'s link number', async () => {
    // In-world: a child with no touch script passed the click to the root; the root broke
    // link 2 and its recorder got touch_end straight away, reading link 2, and no touch after.
    // The release raised nothing more.
    const made = await build([[{ name: 'root' }, linker('llBreakLink(2);')], [{ name: 'empty', source: 'default { state_entry() {} }' }]])
    made.linkset.touch(2, { hold: 2000 })
    const { got, touches } = recorder(made.scripts)
    expect(got('root')).toEqual(['start', 2, 'touch', 2, 'end', 2, expect.closeTo(510, -2)])
    const n = touches('root')
    made.linkset.advanceTime(1000)
    expect(touches('root')).toBe(n)
  })

  it('llBreakLink ends the root\'s part of a PASS_ALWAYS click, and the child keeps its own', async () => {
    // In-world: the child, with a recorder and PASS_ALWAYS, was broken off 0.5 s into the hold.
    // The root got touch_end at once reading 2; the child kept getting touch, reading 2, and
    // its touch_end read 0.
    const made = await build([
      [{ name: 'root' }, linker('llBreakLink(2);')],
      [{ name: 'child' }, { name: 'passer', source: 'default { state_entry() { llPassTouches(PASS_ALWAYS); } }' }],
    ])
    made.linkset.touch(2, { hold: 2000 })
    const { got } = recorder(made.scripts)
    expect(got('root')).toEqual(['start', 2, 'touch', 2, 'end', 2, expect.closeTo(510, -2)])
    expect(got('child')).toEqual(['start', 2, 'touch', 2, 'end', 0, 2000])
  })

  it.each([
    // In-world: relinked straight after the break -> touch_end at once and touch_end alone at the release.
    ['the clicked child is broken off and linked back', 2, 'key c = llGetLinkKey(2); llBreakLink(2); llCreateLink(c, TRUE);', 2, 2],
    // In-world: a three-prim object clicked on link 3 and link 2 broken off.
    ['another child is broken off, and the clicked one moves down', 3, 'llBreakLink(2);', 3, 2],
    // In-world: clicked on link 2 and link 3 broken off.
    ['another child is broken off', 2, 'llBreakLink(3);', 2, 2],
  ])('when %s, the root gets touch_end at once and touch_end alone at the release', async (_, link, action, early, late) => {
    const empty = { name: 'e', source: 'default { state_entry() {} }' }
    const made = await build([[{ name: 'root' }, linker(action)], [{ ...empty, name: 'e2' }], [{ ...empty, name: 'e3' }]])
    made.linkset.touch(link, { hold: 2000 })
    const { got, touches } = recorder(made.scripts)
    expect(got('root')).toEqual(['start', link, 'touch', link, 'end', early, expect.closeTo(510, -2), 'end', late, 2000])
    const n = touches('root')
    made.linkset.advanceTime(1000)
    expect(touches('root')).toBe(n)
  })

  it.each([
    // In-world: a two-prim object whose root broke link 2 -> touch_end at once reading 1, then
    // touch_end alone reading 0.
    ['llBreakLink of a child', 'LSL', 'root', 'llBreakLink(2);', 0],
    // In-world: the same with llBreakAllLinks.
    ['llBreakAllLinks', 'LSL', 'root', 'llBreakAllLinks();', 0],
    // In-world: the same with llBreakLink(1), which broke the root itself off.
    ['llBreakLink of the root itself', 'LSL', 'root', 'llBreakLink(1);', 0],
    // In-world: a child of a three-prim object broke link 3 -> touch_end at once reading 1, then
    // touch_end alone reading 1.
    ['llBreakLink from a child', 'LSL', 'child', 'llBreakLink(3);', 1],
    // In-world: the same with an SLua recorder in the root.
    ['llBreakLink from a child', 'SLua', 'child', 'llBreakLink(3);', 1],
  ] as const)('%s ends a click on the %s root at once, and the release raises touch_end alone', async (_, lang, where, action, late) => {
    const empty = { name: 'e3', source: 'default { state_entry() {} }' }
    const root: ScriptSpec[] = [{ name: 'root', lang }, ...where === 'root' ? [linker(action)] : []]
    const child: ScriptSpec[] = where === 'child' ? [linker(action)] : [{ name: 'e2', source: empty.source }]
    const made = await build(where === 'root' ? [root, child] : [root, child, [empty]])
    made.linkset.touch(1, { hold: 2000 })
    const { got, touches } = recorder(made.scripts)
    expect(got('root')).toEqual(['start', 1, 'touch', 1, 'end', 1, expect.closeTo(510, -2), 'end', late, 2000])
    const n = touches('root')
    made.linkset.advanceTime(1000)
    expect(touches('root')).toBe(n)
  })

  it('llBreakLink of the root itself ends a click passed to it, and the release reaches nobody', async () => {
    // In-world: a three-prim object clicked on link 2, which has no touch script, and the root
    // broke itself off -> the root got touch_end at once reading 2. The release raised nothing:
    // the clicked prim was now the root of the rest, with no touch script, and link 3's
    // recorder got nothing.
    const made = await build([[{ name: 'root' }, linker('llBreakLink(1);')], [{ name: 'e', source: 'default { state_entry() {} }' }], [{ name: 'third' }]])
    made.linkset.touch(2, { hold: 2000 })
    const { got, touches } = recorder(made.scripts)
    expect(got('root')).toEqual(['start', 2, 'touch', 2, 'end', 2, expect.closeTo(510, -2)])
    expect(got('third')).toEqual([])
    const n = touches('root')
    made.linkset.advanceTime(1000)
    expect(touches('root')).toBe(n)
  })

  it('llBreakLink ends a click stuck in the root', async () => {
    // In-world: a click passed to the root ended in the child, whose recorder was set running
    // during the hold, leaving the root getting touch. 4 s later the root broke link 2: its
    // recorder got touch_end reading 2, and no touch after.
    const breaker = { name: 'breaker', links: true,
      source: 'default { state_entry() {} link_message(integer s, integer n, string m, key k) { if (m == "b") llBreakLink(2); } }' }
    const made = await build([[{ name: 'root' }, breaker], [{ name: 'child', running: false }, { name: 'starter', source: STARTER }]])
    made.linkset.touch(2, { hold: 1500 })
    made.linkset.advanceTime(4000)
    const { got, touches } = recorder(made.scripts)
    expect(got('root')).toEqual(['start', 2, 'touch', 2])
    made.linkset.deliverLinkMessage(1, 1, 0, 'b', '')
    made.linkset.advanceTime(0)
    expect(got('root')).toEqual(['start', 2, 'touch', 2, 'end', 2, expect.closeTo(5500, -2)])
    const n = touches('root')
    made.linkset.advanceTime(1000)
    expect(touches('root')).toBe(n)
  })

  it('llBreakLink leaves the click of a root script that is stopped at the time', async () => {
    // In-world: a helper stopped the root's recorder 0.25 s into a 2 s hold on the root, and
    // the root broke link 2 at 0.5 s. Set running again after the release, the recorder got
    // touch 22 times a second and no touch_end.
    const stopper = { name: 'stopper', source: `integer f;
default {
  link_message(integer s, integer n, string m, key k) {
    if (m == "t" && !f) { f = 1; llSetTimerEvent(0.25); }
    if (m == "go") llSetScriptState("root", TRUE);
  }
  timer() { llSetTimerEvent(0); llSetScriptState("root", FALSE); }
}` }
    const made = await build([[{ name: 'root' }, stopper, linker('llBreakLink(2);')], [{ name: 'e', source: 'default { state_entry() {} }' }]])
    made.linkset.touch(1, { hold: 2000 })
    made.linkset.advanceTime(1000)
    made.linkset.deliverLinkMessage(0, 0, 0, 'go', '')
    made.linkset.advanceTime(0)
    const { got, touches } = recorder(made.scripts)
    const n = touches('root')
    made.linkset.advanceTime(1000)
    expect(touches('root') - n).toBe(23)
    expect(got('root')).toEqual(['start', 1, 'touch', 1])
  })

  it('llBreakLink from a child leaves the child\'s own click running', async () => {
    // In-world: link 2's recorder took the click and its own script broke link 3 -> touch kept
    // coming, and touch_end at the release read 2.
    const made = await build([[{ name: 'root' }], [{ name: 'child' }, linker('llBreakLink(3);')], [{ name: 'e', source: 'default { state_entry() {} }' }]])
    made.linkset.touch(2, { hold: 2000 })
    const { got } = recorder(made.scripts)
    expect(got('child')).toEqual(['start', 2, 'touch', 2, 'end', 2, 2000])
    expect(got('root')).toEqual([])
  })

  describe('llCreateLink', () => {
    async function pair(a: ReadonlyArray<ReadonlyArray<ScriptSpec>>, action: string, link: number) {
      const world = new World()
      world.addRegion('SLua Tideland', { x: 40960, y: 23296 })
      world.addAvatar({ region: 'SLua Tideland', key: OWNER, username: 'owner' })
      const b = await build([[{ name: 'b' }]], { world, key: B_KEY, x: 112 })
      const withLinker = a.map((p, i) => i === 0 ? [...p, { name: 'linker', source: after(action, ''), links: true }] : p)
      const made = await build(withLinker, { world, x: 110 })
      made.linkset.touch(link, { hold: 2000 })
      const scripts = { ...made.scripts, ...b.scripts }
      return recorder(scripts)
    }

    it('keeps a click passed to the root, and touch_end reads the clicked prim\'s new link number', async () => {
      // In-world: a click on link 2 passed to the root; the root linked another prim in as its
      // child, moving the clicked prim to link 3. The root kept getting touch reading 2 and its
      // touch_end read 3. The new prim's script got nothing.
      const { got } = await pair([[{ name: 'root' }], [{ name: 'e', source: 'default { state_entry() {} }' }]], `llCreateLink("${B_KEY}", TRUE);`, 2)
      expect(got('root')).toEqual(['start', 2, 'touch', 2, 'end', 3, 2000])
      expect(got('b')).toEqual([])
    })

    it('keeps the click of a lone prim that links another under it', async () => {
      // In-world: llCreateLink(other, TRUE) from the clicked lone prim -> touch_end read 1; the
      // new child got nothing.
      const { got } = await pair([[{ name: 'root' }]], `llCreateLink("${B_KEY}", TRUE);`, 0)
      expect(got('root')).toEqual(['start', 0, 'touch', 0, 'end', 1, 2000])
      expect(got('b')).toEqual([])
    })

    it('keeps the click of a lone prim that links itself under another, and touch_end reads link 2', async () => {
      // In-world: llCreateLink(other, FALSE) from the clicked lone prim -> its touch events kept
      // reading 0 and touch_end read 2; the new root got nothing.
      const { got } = await pair([[{ name: 'root' }]], `llCreateLink("${B_KEY}", FALSE);`, 0)
      expect(got('root')).toEqual(['start', 0, 'touch', 0, 'end', 2, 2000])
      expect(got('b')).toEqual([])
    })

    it('gives the new root touch_end alone when the clicked prim passes touches', async () => {
      // In-world: the same with PASS_ALWAYS set in the clicked prim -> the new root got
      // touch_end alone at the release, reading 2.
      const { got } = await pair([[{ name: 'root' }, { name: 'p', source: 'default { state_entry() { llPassTouches(PASS_ALWAYS); } }' }]],
        `llCreateLink("${B_KEY}", FALSE);`, 0)
      expect(got('root')).toEqual(['start', 0, 'touch', 0, 'end', 2, 2000])
      expect(got('b')).toEqual(['end', 2, expect.any(Number)])
    })
  })
})


// https://wiki.secondlife.com/wiki/LlMapDestination
// In-world probes on Aditi (SLua Tideland, 2026-11-24): fivebot clicked its own two-prim object,
// whose root script called llMapDestination in touch_start, touch and touch_end, each call with
// its own position, and the viewer's log showed which ones reached it.
describe('maps shown from a held click', () => {
  const mapper = (start: boolean, touches: number, ends: number, action = '') => `integer t; integer e;
default {
  state_entry() { }
  touch_start(integer k) { ${start ? 'llMapDestination("r", <1, 0, 0>, ZERO_VECTOR);' : ''} ${action && 'llSetTimerEvent(0.5);'} }
  touch(integer k) { if (++t <= ${touches}) llMapDestination("r", <100 + t, 0, 0>, ZERO_VECTOR); }
  touch_end(integer k) { ++e; integer i; for (i = 0; i < ${ends}; ++i) llMapDestination("r", <200 + 10 * e + i, 0, 0>, ZERO_VECTOR); }
  timer() { llSetTimerEvent(0); ${action} }
}`

  async function mapped(source: string, opts: { link?: number; hold?: number; links?: boolean } = {}) {
    const world = new World()
    world.addRegion('SLua Tideland', { x: 40960, y: 23296 })
    world.addAvatar({ region: 'SLua Tideland', key: OWNER, username: 'owner' })
    await build([[{ name: 'b' }]], { world, key: B_KEY, x: 112 })
    const made = await build([[{ name: 'map', source, links: opts.links ?? false }], [{ name: 'e', source: 'default { state_entry() {} }' }]], { world })
    made.linkset.touch(opts.link ?? 2, opts.hold === undefined ? {} : { hold: opts.hold })
    made.linkset.advanceTime(3000)
    return made.scripts.map!.viewerRequests.map((r) => (r as unknown as { position: { x: number } }).position.x)
  }

  it('shows touch_start\'s map alone for a click that is not held', async () => {
    // In-world: a click with no hold, 30 s after the last map, showed touch_start's map and
    // neither of the two calls in touch_end.
    expect(await mapped(mapper(true, 0, 2))).toEqual([1])
  })

  it('shows touch_end\'s map again after a held click', async () => {
    // In-world: held 0.05, 0.1, 0.15, 0.3, 0.6, 1, 2 and 2.5 s, touch_end's map showed after
    // touch_start's. A second call in the same touch_end did not.
    expect(await mapped(mapper(true, 0, 2), { hold: 2000 })).toEqual([1, 210])
    expect(await mapped(mapper(true, 0, 2), { hold: 50 })).toEqual([1, 210])
  })

  it('lets the first touch share touch_start\'s showing and shows later touch events\' maps', async () => {
    // In-world: with calls in touch_start, every touch and touch_end, held 2.5 s, the first
    // touch's map was dropped, and the second touch's and touch_end's showed, in two runs. With
    // no call in touch_start, the first touch's showed and so did each later one, a second apart,
    // and touch_end's. Runs made within seconds of other map calls also had calls dropped with
    // "Too many llMapDestination() function calls; halted until average falls." on DEBUG_CHANNEL,
    // and some without it; the runs here were 12 s apart.
    expect(await mapped(mapper(true, 2, 1), { hold: 2500 })).toEqual([1, 102, 210])
    expect(await mapped(mapper(false, 3, 1), { hold: 4000 })).toEqual([101, 102, 103, 210])
  })

  it('shows touch_end\'s map after a link change renumbers the clicked prim', async () => {
    // In-world: a click on link 2 passed to the root, whose script linked a third prim in, so
    // touch_end read link 3: touch_start's map and touch_end's both showed.
    expect(await mapped(mapper(true, 0, 1, `llCreateLink("${B_KEY}", TRUE);`), { hold: 2500, links: true })).toEqual([1, 210])
  })

  it('shows the map from the touch_end a link break raises and from the touch_end alone at the release', async () => {
    // In-world: the root broke the clicked child off and linked it back: the touch_end at the
    // break and the one at the release each showed a map after touch_start's.
    const relink = 'key c = llGetLinkKey(2); llBreakLink(2); llCreateLink(c, TRUE);'
    expect(await mapped(mapper(true, 0, 1, relink), { hold: 2500, links: true })).toEqual([1, 210, 220])
  })
})

describe('a click the root keeps after a link break', () => {
  it('raises no touch_start on the next click when the release reached nobody', async () => {
    // In-world: a click on a child with no touch script, passed to the root, whose script broke
    // the child off. The release went to the lone child. The next click on the root raised no
    // touch_start, one touch and touch_end, reading 0.
    const linker = { name: 'linker', source: after('llBreakLink(2);', ''), links: true }
    const made = await build([[{ name: 'root' }, linker], [{ name: 'e', source: 'default { state_entry() {} }' }]])
    made.linkset.touch(2, { hold: 2000 })
    made.linkset.advanceTime(1000)
    made.linkset.touch(0)
    const { got } = recorder(made.scripts)
    expect(got('root')).toEqual(['start', 2, 'touch', 2, 'end', 2, expect.closeTo(510, -2), 'touch', 0, 'end', 0, expect.any(Number)])
  })

  it('raises touch_start on the next click once the release ended the click', async () => {
    // In-world: the root clicked and link 2 unlinked: touch_end at once, touch_end alone at the
    // release, and the next click raised touch_start.
    const linker = { name: 'linker', source: after('llBreakLink(2);', ''), links: true }
    const made = await build([[{ name: 'root' }, linker], [{ name: 'e', source: 'default { state_entry() {} }' }]])
    made.linkset.touch(1, { hold: 2000 })
    made.linkset.advanceTime(1000)
    made.linkset.touch(0)
    const { got } = recorder(made.scripts)
    expect(got('root').slice(7)).toEqual(['end', 0, 2000, 'start', 0, 'touch', 0, 'end', 0, 0])
  })

  const passedAndBroken = async () => {
    const linker = { name: 'linker', source: after('llBreakLink(2);', ''), links: true }
    return build([[{ name: 'root' }, linker], [{ name: 'e', source: 'default { state_entry() {} }' }]])
  }

  it('forgets the click at a reset', async () => {
    // In-world: the root's script was reset 2 s into a 2.5 s hold, after the break; the next
    // click raised touch_start.
    const made = await passedAndBroken()
    made.linkset.clock.scheduleTask({ dead: false }, made.linkset.clock.now + 2000, () => made.scripts.root!.reset())
    made.linkset.touch(2, { hold: 2500 })
    made.linkset.advanceTime(1000)
    made.linkset.touch(0)
    expect(recorder(made.scripts).got('root')).toEqual(['start', 0, 'touch', 0, 'end', 0, 0])
  })

  it('keeps the click through a stop, and the script gets no touch once it runs again', async () => {
    // In-world: the root's script was stopped 1.5 s into a 3 s hold, after the break, and set
    // running after the release. It got no touch, and the next click raised no touch_start.
    const made = await passedAndBroken()
    const root = made.scripts.root!
    made.linkset.clock.scheduleTask({ dead: false }, made.linkset.clock.now + 1500, () => { root.running = false })
    made.linkset.touch(2, { hold: 3000 })
    made.linkset.advanceTime(1000)
    root.running = true
    const { got, touches } = recorder(made.scripts)
    const n = touches('root')
    made.linkset.advanceTime(2000)
    expect(touches('root')).toBe(n)
    made.linkset.touch(0)
    expect(got('root').slice(7)).toEqual(['touch', 0, 'end', 0, expect.any(Number)])
  })
})

// In-world probes on Aditi (SLua Tideland, 2026-11-24): the same recorder in fivebot's own
// objects, with the links changed from the viewer's build tools (Link and Unlink) about 1 s into
// a 3 s hold. Each case ended as the same change made by a script does.
describe('a link change made in the viewer during a held click', () => {
  const at = (made: { linkset: { clock: { now: number; scheduleTask(t: { dead: boolean }, at: number, run: () => void): unknown } } }, ms: number, run: () => void) =>
    made.linkset.clock.scheduleTask({ dead: false }, made.linkset.clock.now + ms, run)
  const empty = { name: 'e', source: 'default { state_entry() {} }' }

  it('Unlink of a child the click was passed through ends the root\'s click at once, and keeps it until the next click', async () => {
    // In-world: touch_end at once reading 2, no touch after. The next click on the root raised
    // no touch_start, one touch and touch_end reading 0.
    const made = await build([[{ name: 'root' }], [empty]])
    at(made, 1000, () => made.linkset.breakOff(made.linkset.prims[1]!))
    made.linkset.touch(2, { hold: 3000 })
    made.linkset.advanceTime(1000)
    made.linkset.touch(0)
    const { got } = recorder(made.scripts)
    expect(got('root')).toEqual(['start', 2, 'touch', 2, 'end', 2, 1000, 'touch', 0, 'end', 0, expect.any(Number)])
  })

  it('Unlink of a child while the root is clicked ends the click at once and raises touch_end alone at the release', async () => {
    // In-world: touch_end at once reading 1, touch_end alone at the release reading 0, and the
    // next click raised touch_start.
    const made = await build([[{ name: 'root' }], [empty]])
    at(made, 1000, () => made.linkset.breakOff(made.linkset.prims[1]!))
    made.linkset.touch(1, { hold: 3000 })
    const { got } = recorder(made.scripts)
    expect(got('root')).toEqual(['start', 1, 'touch', 1, 'end', 1, 1000, 'end', 0, 3000])
  })

  it('Unlink of the root ends a click passed to it, and the release reaches nobody', async () => {
    // In-world: three prims, a click on link 2 passed to the root, the root unlinked: touch_end
    // at once reading 2. The next click on the old root raised no touch_start, one touch and
    // touch_end reading 0.
    const made = await build([[{ name: 'root' }], [empty], [{ ...empty, name: 'e3' }]])
    const root = made.linkset.prims[0]!
    at(made, 1000, () => made.linkset.breakOff(root))
    made.linkset.touch(2, { hold: 3000 })
    made.linkset.advanceTime(1000)
    root.linkset!.touch(0)
    const { got } = recorder(made.scripts)
    expect(got('root')).toEqual(['start', 2, 'touch', 2, 'end', 2, 1000, 'touch', 0, 'end', 0, expect.any(Number)])
  })

  it('Unlink of a clicked child with its own touch script leaves its click running', async () => {
    // In-world: the child's recorder kept getting touch and its touch_end read 0.
    const made = await build([[{ name: 'root' }], [{ name: 'child' }]])
    at(made, 1000, () => made.linkset.breakOff(made.linkset.prims[1]!))
    made.linkset.touch(2, { hold: 3000 })
    const { got } = recorder(made.scripts)
    expect(got('child')).toEqual(['start', 2, 'touch', 2, 'end', 0, 3000])
    expect(got('root')).toEqual([])
  })

  describe('Link', () => {
    async function two(a: ReadonlyArray<ReadonlyArray<ScriptSpec>>) {
      const world = new World()
      world.addRegion('SLua Tideland', { x: 40960, y: 23296 })
      const b = await build([[{ ...empty, name: 'b' }]], { world, key: B_KEY, x: 112 })
      const made = await build(a, { world, x: 110 })
      return { made, b }
    }

    it('of a prim into the clicked object keeps a click passed to the root, and touch_end reads the new link number', async () => {
      // In-world: the click on link 2 ran on, and touch_end read link 3.
      const { made, b } = await two([[{ name: 'root' }], [empty]])
      at(made, 1000, () => made.linkset.absorb(b.linkset))
      made.linkset.touch(2, { hold: 3000 })
      expect(recorder(made.scripts).got('root')).toEqual(['start', 2, 'touch', 2, 'end', 3, 3000])
    })

    it('of another prim under a clicked lone prim keeps the click, and touch_end reads link 1', async () => {
      // In-world: touch kept reading 0, and touch_end read 1.
      const { made, b } = await two([[{ name: 'root' }]])
      at(made, 1000, () => made.linkset.absorb(b.linkset))
      made.linkset.touch(0, { hold: 3000 })
      expect(recorder(made.scripts).got('root')).toEqual(['start', 0, 'touch', 0, 'end', 1, 3000])
    })

    it('of a clicked lone prim under another keeps the click, and touch_end reads link 2', async () => {
      // In-world: touch kept reading 0, and touch_end read 2.
      const { made, b } = await two([[{ name: 'root' }]])
      at(made, 1000, () => b.linkset.absorb(made.linkset))
      made.linkset.touch(0, { hold: 3000 })
      expect(recorder(made.scripts).got('root')).toEqual(['start', 0, 'touch', 0, 'end', 2, 3000])
    })
  })
})
