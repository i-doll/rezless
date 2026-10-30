import { describe, it, expect } from 'vitest'
import { loadLinkset, type ScriptInput } from '../src/index.js'

// In-world: Aditi, Mono. The 4-prim routing table was measured in Dore
// (2026-10-30, see #148); the handler, pass-value, stopped-script and
// lone-prim cases in SLua Tideland (2026-10-31) with a 7-prim linkset whose
// scripts llSay what they received, each prim clicked on face 0.

const ALICE = { key: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Alice Resident' }

const recorder = (events: ReadonlyArray<string> = ['touch_start', 'touch', 'touch_end'], entry = '') => `
  list got = [];
  default {
    state_entry() { ${entry} }
    ${events
      .map(
        (e) => `${e}(integer n) {
          got += ["${e}|" + (string)n + "|" + (string)llDetectedLinkNumber(0) + "|"
            + (string)llDetectedTouchFace(0) + "|" + llDetectedName(0) + "|" + (string)llDetectedKey(0)];
        }`,
      )
      .join('\n')}
  }
`

const script = (name: string, source: string): ScriptInput => ({ name, source: { source, filename: `${name}.lsl` } })

async function setup(prims: ReadonlyArray<ReadonlyArray<ScriptInput>>) {
  const loaded = await loadLinkset({ prims: prims.map((scripts) => ({ scripts })) })
  for (const s of Object.values(loaded.scripts)) s.start()
  const got = (name: string) => loaded.scripts[name]!.global('got')
  return { ...loaded, got }
}

const click = (link: number, face = 0) =>
  ['touch_start', 'touch', 'touch_end'].map((e) => `${e}|1|${link}|${face}|${ALICE.name}|${ALICE.key}`)

describe('linkset.touch routes a click like Second Life', () => {
  it('a click on the root reaches only the root', async () => {
    const { linkset, got } = await setup([[script('root', recorder())], [script('child', recorder())]])
    linkset.touch(1, { avatar: ALICE })
    expect(got('root')).toEqual(click(1))
    expect(got('child')).toEqual([])
  })

  it('a click on a child with touch handlers reaches every script there and not the root', async () => {
    // In-world: link 2 with two touch scripts; both got it, the root got nothing.
    const { linkset, got } = await setup([
      [script('root', recorder())],
      [script('a', recorder()), script('b', recorder())],
    ])
    linkset.touch(2, { avatar: ALICE, face: 3 })
    expect(got('a')).toEqual(click(2, 3))
    expect(got('b')).toEqual(click(2, 3))
    expect(got('root')).toEqual([])
  })

  it('a click on a child with no touch handler, or no scripts, passes to the root', async () => {
    // In-world: links 3 (script without touch handlers) and 4 (no scripts) both reached the root.
    const { linkset, got } = await setup([
      [script('root', recorder())],
      [script('quiet', 'default { state_entry() { } }')],
      [],
    ])
    linkset.touch(2, { avatar: ALICE })
    linkset.touch(3, { avatar: ALICE })
    expect(got('root')).toEqual([...click(2), ...click(3)])
  })

  it.each([
    ['touch', ['touch']],
    ['touch_end', ['touch_end']],
  ])('a script with only a %s handler keeps the click from the root', async (_, events) => {
    // In-world: link 2 with only touch() said "L2 touch", link 3 with only
    // touch_end() said "L3 end"; the root heard none of touch_start, touch or touch_end.
    const { linkset, got } = await setup([[script('root', recorder())], [script('child', recorder(events))]])
    linkset.touch(2, { avatar: ALICE })
    expect(got('child')).toEqual(click(2).filter((e) => e.startsWith(`${events[0]}|`)))
    expect(got('root')).toEqual([])
  })

  it('PASS_ALWAYS also passes a handled click to the root', async () => {
    const { linkset, got } = await setup([
      [script('root', recorder())],
      [script('child', recorder(undefined, 'llPassTouches(PASS_ALWAYS);'))],
    ])
    linkset.touch(2, { avatar: ALICE })
    expect(got('child')).toEqual(click(2))
    expect(got('root')).toEqual(click(2))
  })

  it('PASS_NEVER keeps the click in the child, even with no handler there', async () => {
    const { linkset, got } = await setup([
      [script('root', recorder())],
      [script('child', recorder(undefined, 'llPassTouches(PASS_NEVER);'))],
      [script('quiet', 'default { state_entry() { llPassTouches(PASS_NEVER); } }')],
    ])
    linkset.touch(2, { avatar: ALICE })
    linkset.touch(3, { avatar: ALICE })
    expect(got('child')).toEqual(click(2))
    expect(got('root')).toEqual([])
  })

  it.each([
    ['PASS_IF_NOT_HANDLED', 'PASS_ALWAYS', 'PASS_NEVER'],
    ['3', '1', '2'],
    ['-1', '1', '2'],
  ])('llPassTouches(%s) restores the default', async (value, always, never) => {
    // In-world: PASS_ALWAYS then PASS_IF_NOT_HANDLED on a handled prim kept the
    // click there; PASS_NEVER then PASS_IF_NOT_HANDLED on an unhandled prim
    // passed it to the root. 3 and -1 did the same after 1 or 2.
    const { linkset, got } = await setup([
      [script('root', recorder())],
      [script('child', recorder(undefined, `llPassTouches(${always}); llPassTouches(${value});`))],
      [script('quiet', `default { state_entry() { llPassTouches(${never}); llPassTouches(${value}); } }`)],
    ])
    linkset.touch(2, { avatar: ALICE })
    linkset.touch(3, { avatar: ALICE })
    expect(got('child')).toEqual(click(2))
    expect(got('root')).toEqual(click(3))
  })

  it('a stopped script does not count as handling the click and never sees it', async () => {
    // In-world: link 6's only touch script was not running; the root got the
    // click, and starting the script afterwards replayed nothing.
    const starter = `default { link_message(integer s, integer n, string m, key k) { llSetScriptState("stopped", n); } }`
    const { linkset, scripts, got } = await setup([
      [script('root', recorder())],
      [script('stopped', recorder()), script('starter', starter)],
    ])
    const setRunning = (on: boolean) => linkset.deliverLinkMessage(1, 2, on ? 1 : 0, '', '')
    setRunning(false)
    linkset.advanceTime(0)
    linkset.touch(2, { avatar: ALICE })
    setRunning(true)
    linkset.advanceTime(0)
    expect(scripts['stopped']!.running).toBe(true)
    expect(got('root')).toEqual(click(2))
    expect(got('stopped')).toEqual([])
  })

  it('handlers only count in the state the script is in', async () => {
    // In-world: link 7's script had touch_start in default but sat in a state
    // without touch handlers; the root got the click.
    const other = `
      list got = [];
      default { state_entry() { state idle; } touch_start(integer n) { got += ["default"]; } }
      state idle { state_entry() { } }
    `
    const { linkset, got } = await setup([[script('root', recorder())], [script('other', other)]])
    linkset.touch(2, { avatar: ALICE })
    expect(got('root')).toEqual(click(2))
    expect(got('other')).toEqual([])
  })

  it('a lone prim is touched as link 0 or 1 and reports link number 0', async () => {
    // In-world: an unlinked prim's touch_start saw llDetectedLinkNumber(0) = 0.
    const { linkset, got } = await setup([[script('lone', recorder(['touch_start']))]])
    linkset.touch(0, { avatar: ALICE })
    linkset.touch(1, { avatar: ALICE })
    expect(got('lone')).toEqual([click(0)[0], click(0)[0]])
  })

  it('defaults to face 0 and the owner as the toucher', async () => {
    const owner = '11111111-2222-3333-4444-555555555555'
    const loaded = await loadLinkset({ owner, prims: [{ scripts: [script('s', recorder(['touch_start']))] }] })
    loaded.scripts['s']!.start()
    loaded.linkset.touch(0)
    expect(loaded.scripts['s']!.global('got')).toEqual([`touch_start|1|0|0||${owner}`])
  })

  it('hold delays touch_end, and lets the clock run in between', async () => {
    // Not measured: the headless viewer can only click, not hold, so how often
    // touch repeats during a long hold is not modelled; it fires once.
    const timed = `
      list got = [];
      default {
        touch_start(integer n) { got += ["start@" + (string)llGetTime()]; llSetTimerEvent(0.5); }
        touch(integer n) { got += ["touch@" + (string)llGetTime()]; }
        timer() { got += ["timer@" + (string)llGetTime()]; llSetTimerEvent(0); }
        touch_end(integer n) { got += ["end@" + (string)llGetTime()]; }
      }
    `
    const { linkset, got } = await setup([[script('s', timed)]])
    linkset.touch(0, { hold: 1500 })
    expect(got('s')).toEqual(['start@0.000000', 'touch@0.000000', 'timer@0.500000', 'end@1.500000'])
  })

  it('hold counts from the click, not from when the touch_start handler finishes', async () => {
    const sleepy = `
      list got = [];
      default {
        touch_start(integer n) { llResetTime(); llSleep(2.0); }
        touch_end(integer n) { got += [llGetTime()]; }
      }
    `
    const { linkset, got } = await setup([[script('s', sleepy)]])
    linkset.touch(0, { hold: 1000 })
    expect(got('s')).toEqual([2])
  })

  const selfStopping = (stopIn: string) => `
    list got = [];
    default {
      touch_start(integer n) { got += ["start"]; ${stopIn === 'touch_start' ? 'llSetScriptState(llGetScriptName(), FALSE);' : 'llSetTimerEvent(0.5);'} }
      timer() { llSetTimerEvent(0); llSetScriptState(llGetScriptName(), FALSE); }
      touch(integer n) { got += ["touch"]; }
      touch_end(integer n) { got += ["end"]; }
    }
  `
  const restarter = `default { link_message(integer s, integer n, string m, key k) { llSetScriptState("s", TRUE); } }`

  it('a script that stops itself in touch_start still gets the rest of a click once restarted', async () => {
    // In-world: touch_start called llSetScriptState(llGetScriptName(), FALSE);
    // after another script restarted it, it said "touch" then "end".
    const { linkset, got } = await setup([[script('s', selfStopping('touch_start')), script('r', restarter)]])
    linkset.touch(0)
    expect(got('s')).toEqual(['start'])
    linkset.deliverLinkMessage(0, 0, 0, '', '')
    linkset.advanceTime(0)
    expect(got('s')).toEqual(['start', 'touch', 'end'])
  })

  it('a script stopped during a hold never gets that release', async () => {
    // Not measured: the headless viewer cannot hold a click. In-world a
    // stopped script is never sent a touch, so a release that happens while
    // it is stopped is not queued for it.
    const { linkset, got } = await setup([[script('s', selfStopping('timer')), script('r', restarter)]])
    linkset.touch(0, { hold: 1000 })
    linkset.deliverLinkMessage(0, 0, 0, '', '')
    linkset.advanceTime(0)
    expect(got('s')).toEqual(['start', 'touch'])
  })

  it('starts scripts that have not run state_entry yet', async () => {
    const loaded = await loadLinkset({
      prims: [
        { scripts: [script('root', recorder())] },
        { scripts: [script('child', recorder(undefined, 'llPassTouches(PASS_ALWAYS);'))] },
      ],
    })
    loaded.linkset.touch(2, { avatar: ALICE })
    expect(loaded.scripts['root']!.global('got')).toEqual(click(2))
  })

  it('throws for a link number the linkset does not have', async () => {
    const { linkset } = await setup([[], []])
    expect(() => linkset.touch(3)).toThrow('no prim with link number 3')
    expect(() => linkset.touch(0)).toThrow('no prim with link number 0')
  })
})

describe('llDetectedTouchFace', () => {
  it('reads the face passed to fire(), and 0 past the count or outside a touch', async () => {
    // In-world: a click on face 3 gave llDetectedTouchFace(0) = 3, and 0 for
    // indexes 1 and -1; in state_entry it was 0.
    const { scripts } = await setup([
      [
        script(
          's',
          `list got = [];
          default {
            state_entry() { got += [llDetectedTouchFace(0)]; }
            touch_start(integer n) { got += [llDetectedTouchFace(0), llDetectedTouchFace(1), llDetectedTouchFace(-1)]; }
          }`,
        ),
      ],
    ])
    scripts['s']!.fire('touch_start', { num_detected: 1, detected: [{ ...ALICE, touchFace: 3 }] })
    expect(scripts['s']!.global('got')).toEqual([0, 3, 0, 0])
  })
})

describe('touch coordinates', () => {
  const coords = `
    list got = [];
    string d(integer i) {
      return (string)llDetectedTouchST(i) + "|" + (string)llDetectedTouchUV(i) + "|"
        + (string)llDetectedTouchNormal(i) + "|" + (string)llDetectedTouchBinormal(i);
    }
    default {
      state_entry() { got += [d(0)]; }
      touch_start(integer n) { got += [d(0), d(1)]; }
    }
  `
  const ZERO = '<0.00000, 0.00000, 0.00000>'
  const INVALID = '<-1.00000, -1.00000, 0.00000>'

  it('reads the point passed to linkset.touch', async () => {
    const { linkset, got } = await setup([[script('s', coords)]])
    linkset.touch(0, { st: { x: 0.25, y: 0.75, z: 0 }, uv: { x: 0.5, y: 0.5, z: 0 } })
    expect(got('s')[1]).toBe(`<0.25000, 0.75000, 0.00000>|<0.50000, 0.50000, 0.00000>|${ZERO}|${ZERO}`)
  })

  it('reads normals passed to fire()', async () => {
    const { scripts, got } = await setup([[script('s', coords)]])
    const up = { x: 0, y: 0, z: 1 }
    const east = { x: 1, y: 0, z: 0 }
    scripts['s']!.fire('touch_start', { num_detected: 1, detected: [{ ...ALICE, touchNormal: up, touchBinormal: east }] })
    expect(got('s')[1]).toBe(`${INVALID}|${INVALID}|<0.00000, 0.00000, 1.00000>|<1.00000, 0.00000, 0.00000>`)
  })

  it('a click with no point reads invalid texture coordinates; outside a touch and past the count read zero', async () => {
    // In-world: object.touch sends no surface point. touch_start, touch and
    // touch_end all read ST and UV <-1, -1, 0> and zero normals; index 1 and
    // state_entry read zero for all four.
    const { linkset, got } = await setup([[script('s', coords)]])
    linkset.touch(0)
    const none = [ZERO, ZERO, ZERO, ZERO].join('|')
    expect(got('s')).toEqual([none, `${INVALID}|${INVALID}|${ZERO}|${ZERO}`, none])
  })
})
