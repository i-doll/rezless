import { describe, it, expect } from 'vitest'
import { loadLinkset, World, type Vector } from '../src/index.js'

const DEBUG_CHANNEL = 2147483647
const SENDER = '00000000-0000-0000-0000-00000000000a'

const listener = `
  list heard = [];
  default {
    state_entry() { llListen(42, "", NULL_KEY, ""); llListen(DEBUG_CHANNEL, "", NULL_KEY, ""); }
    listen(integer c, string n, key id, string m) { heard += [m]; }
  }
`

const sender = (body: string) => `default { touch_start(integer n) { ${body} } }`

let n = 0
async function place(world: World, region: string, position: Vector, source: string, key?: string) {
  const name = `s${n++}`
  const { scripts, prims } = await loadLinkset({
    world,
    region,
    position,
    prims: [
      {
        name,
        key: key ?? `00000000-0000-0000-0001-${String(n).padStart(12, '0')}`,
        scripts: [{ source: { source }, name }],
      },
    ],
  })
  scripts[name]!.start()
  return { script: scripts[name]!, prim: prims[0]! }
}

// Measured around the shared corner of four Sandbox regions (2026-10-30). Each
// receiver sits 5 m out from the corner on both axes; the sender moves along a
// line in Callida 1 m south of its north border.
describe('chat across region borders', () => {
  async function corner(x: number) {
    const world = new World()
    world.addRegion('Callida', { x: 256768, y: 194560 })
    world.addRegion('Prodesse', { x: 256512, y: 194560 })
    world.addRegion('Opportuna', { x: 256768, y: 194816 })
    world.addRegion('Admiranda', { x: 256512, y: 194816 })
    const receivers = {
      Callida: await place(world, 'Callida', { x: 5, y: 251, z: 25 }, listener),
      Opportuna: await place(world, 'Opportuna', { x: 5, y: 5, z: 25 }, listener),
      Admiranda: await place(world, 'Admiranda', { x: 251, y: 5, z: 25 }, listener),
      Prodesse: await place(world, 'Prodesse', { x: 251, y: 251, z: 25 }, listener),
    }
    const to = Object.values(receivers)
      .map((r) => `llRegionSayTo("${r.prim.key}", 42, "to");`)
      .join(' ')
    const { script } = await place(
      world,
      'Callida',
      { x, y: 255, z: 25 },
      sender(`llWhisper(42, "whisper"); llSay(42, "say"); llShout(42, "shout"); llRegionSay(42, "region"); ${to}`),
    )
    script.fire('touch_start', { num_detected: 1 })
    return Object.fromEntries(Object.entries(receivers).map(([k, r]) => [k, r.script.global('heard')]))
  }

  const all = ['whisper', 'say', 'shout']
  const own = ['region', 'to']
  // [sender x, Callida, Opportuna, Admiranda, Prodesse]: chat each receiver hears.
  const table: [number, string[], string[], string[], string[]][] = [
    [3, all, all, all, all], // 4.5 / 6.3 / 10.0 / 8.9 m
    [8, all, all, ['say', 'shout'], ['say', 'shout']], // 5.0 / 6.7 / 14.3 / 13.6 m
    [14, all, ['say', 'shout'], ['say', 'shout'], ['say', 'shout']], // 9.85 / 10.8 / 19.9 / 19.4 m
    [20, ['say', 'shout'], ['say', 'shout'], ['shout'], ['shout']], // 15.5 / 16.2 / 25.7 / 25.3 m
    [90, ['shout'], ['shout'], ['shout'], ['shout']], // 85.1 / 85.2 / 95.2 / 95.1 m
    [100, ['shout'], ['shout'], [], []], // 95.1 / 95.2 / 105.2 / 105.1 m
    [200, [], [], [], []], // 195.0 / 195.1 / 205.1 / 205.0 m
  ]
  for (const [x, callida, opportuna, admiranda, prodesse] of table) {
    it(`sender at x=${x}`, async () => {
      expect(await corner(x)).toEqual({
        Callida: [...callida, ...own],
        Opportuna: opportuna,
        Admiranda: admiranda,
        Prodesse: prodesse,
      })
    })
  }
})

// Measured in one region with a 2-prim receiver: root, plus a child 8 m
// further from the sender. 99, 101 and 125 m were measured straight up.
describe('chat between objects in one region', () => {
  async function receiverAt(offset: Vector) {
    const world = new World()
    world.addRegion('Sandbox', { x: 256000, y: 256000 })
    const { scripts, prims } = await loadLinkset({
      world,
      region: 'Sandbox',
      position: { x: 128, y: 128, z: 25 },
      prims: [
        {
          name: 'root',
          key: '00000000-0000-0000-0000-000000000001',
          scripts: [{ source: { source: listener }, name: 'root' }],
        },
        {
          name: 'child',
          key: '00000000-0000-0000-0000-000000000002',
          scripts: [{ source: { source: listener }, name: 'child' }],
        },
      ],
    })
    prims[1]!.params.position = { x: 8, y: 0, z: 0 }
    for (const s of Object.values(scripts)) s.start()
    const [root, child] = prims
    const { script } = await place(
      world,
      'Sandbox',
      { x: 128 + offset.x, y: 128 + offset.y, z: 25 + offset.z },
      sender(
        `llWhisper(42, "whisper"); llSay(42, "say"); llShout(42, "shout"); llRegionSay(42, "region");` +
          ` llRegionSayTo("${root!.key}", 42, "to root"); llRegionSayTo("${child!.key}", 42, "to child");`,
      ),
      SENDER,
    )
    script.fire('touch_start', { num_detected: 1 })
    return { root: scripts['root']!.global('heard'), child: scripts['child']!.global('heard') }
  }

  const rows: [string, Vector, string[], string[]][] = [
    ['9 m / 17 m', { x: -9, y: 0, z: 0 }, ['whisper', 'say', 'shout'], ['say', 'shout']],
    ['11 m / 19 m', { x: -11, y: 0, z: 0 }, ['say', 'shout'], ['say', 'shout']],
    ['19 m / 27 m', { x: -19, y: 0, z: 0 }, ['say', 'shout'], ['shout']],
    ['21 m / 29 m', { x: -21, y: 0, z: 0 }, ['shout'], ['shout']],
    ['99 m / 99.3 m', { x: 0, y: 0, z: 99 }, ['shout'], ['shout']],
    ['101 m / 101.3 m', { x: 0, y: 0, z: 101 }, [], []],
    ['125 m / 125.3 m', { x: 0, y: 0, z: 125 }, [], []],
  ]
  for (const [label, offset, root, child] of rows) {
    it(`range is checked per receiving prim at ${label}`, async () => {
      expect(await receiverAt(offset)).toEqual({
        root: [...root, 'region', 'to root'],
        child: [...child, 'region', 'to child'],
      })
    })
  }

  it('names the listen after the sending prim', async () => {
    const world = new World()
    world.addRegion('Sandbox', { x: 0, y: 0 })
    const named = `
      list heard = [];
      default {
        state_entry() { llListen(42, "", NULL_KEY, ""); }
        listen(integer c, string n, key id, string m) { heard += [n, id]; }
      }
    `
    const r = await place(world, 'Sandbox', { x: 10, y: 10, z: 25 }, named)
    const s = await place(world, 'Sandbox', { x: 11, y: 10, z: 25 }, sender('llSay(42, "hi");'), SENDER)
    s.script.fire('touch_start', { num_detected: 1 })
    expect(r.script.global('heard')).toEqual([s.prim.name, SENDER])
  })

  it('follows a linkset moved after loading', async () => {
    const world = new World()
    world.addRegion('Sandbox', { x: 0, y: 0 })
    const r = await place(world, 'Sandbox', { x: 10, y: 10, z: 25 }, listener)
    const s = await place(world, 'Sandbox', { x: 50, y: 10, z: 25 }, sender('llSay(42, "say");'))
    s.script.fire('touch_start', { num_detected: 1 })
    s.prim.params.position = { x: 20, y: 10, z: 25 }
    s.script.fire('touch_start', { num_detected: 1 })
    expect(r.script.global('heard')).toEqual(['say'])
  })

  it('throws for a missing region or one the world does not have', async () => {
    const world = new World()
    await expect(place(world, 'Nowhere', { x: 0, y: 0, z: 0 }, listener)).rejects.toThrow("no region named 'Nowhere'")
    await expect(loadLinkset({ world, prims: [] })).rejects.toThrow('no region named')
  })
})

describe('chat within one linkset without a world', () => {
  it('applies ranges per receiving prim', async () => {
    const { scripts, prims } = await loadLinkset({
      position: { x: 128, y: 128, z: 25 },
      prims: [
        {
          name: 'root',
          scripts: [
            {
              source: { source: sender('llWhisper(42, "whisper"); llSay(42, "say"); llRegionSay(42, "region");') },
              name: 'tx',
            },
          ],
        },
        { name: 'near', scripts: [{ source: { source: listener }, name: 'near' }] },
        { name: 'far', scripts: [{ source: { source: listener }, name: 'far' }] },
      ],
    })
    prims[1]!.params.position = { x: 0, y: 0, z: 15 }
    prims[2]!.params.position = { x: 0, y: 0, z: 30 }
    for (const s of Object.values(scripts)) s.start()
    scripts['tx']!.fire('touch_start', { num_detected: 1 })
    expect(scripts['near']!.global('heard')).toEqual(['say', 'region'])
    expect(scripts['far']!.global('heard')).toEqual(['region'])
  })
})

// Measured: a "Cannot use llRegionSay() on channel 0." error was heard at 8 m
// and 15 m, not at 50 m, and not 25 m away across a border.
describe('DEBUG_CHANNEL errors', () => {
  it('are said, with say range, across region borders', async () => {
    const world = new World()
    world.addRegion('West', { x: 0, y: 0 })
    world.addRegion('East', { x: 256, y: 0 })
    const at8 = await place(world, 'East', { x: 18, y: 128, z: 25 }, listener)
    const at15 = await place(world, 'East', { x: 25, y: 128, z: 25 }, listener)
    const at50 = await place(world, 'East', { x: 60, y: 128, z: 25 }, listener)
    const across15 = await place(world, 'West', { x: 251, y: 128, z: 25 }, listener)
    const across25 = await place(world, 'West', { x: 241, y: 128, z: 25 }, listener)
    const s = await place(world, 'East', { x: 10, y: 128, z: 25 }, sender('llRegionSay(0, "x");'))
    s.script.fire('touch_start', { num_detected: 1 })
    const error = 'Cannot use llRegionSay() on channel 0.'
    expect(s.script.chat).toEqual([{ channel: DEBUG_CHANNEL, text: error, type: 'say' }])
    expect(at8.script.global('heard')).toEqual([error])
    expect(at15.script.global('heard')).toEqual([error])
    expect(across15.script.global('heard')).toEqual([error])
    expect(at50.script.global('heard')).toEqual([])
    expect(across25.script.global('heard')).toEqual([])
  })
})

describe('a world shares one clock', () => {
  const ticker = (seconds: number, text: string) => `
    default {
      state_entry() { llSetTimerEvent(${seconds}); }
      timer() { llSay(42, "${text}"); }
    }
  `

  it('delivers events across linksets in time order, whichever linkset is advanced', async () => {
    const world = new World({ startUnixTime: 1_000 })
    world.addRegion('Sandbox', { x: 0, y: 0 })
    const stamped = `
      list heard = [];
      default {
        state_entry() { llListen(42, "", NULL_KEY, ""); }
        listen(integer c, string n, key id, string m) { heard += [m + "@" + (string)llGetUnixTime()]; }
      }
    `
    const r = await place(world, 'Sandbox', { x: 10, y: 10, z: 25 }, stamped)
    const a = await place(world, 'Sandbox', { x: 12, y: 10, z: 25 }, ticker(1.0, 'a'))
    const b = await place(world, 'Sandbox', { x: 14, y: 10, z: 25 }, ticker(1.5, 'b'))
    b.script.advanceTime(2_500)
    expect(r.script.global('heard')).toEqual(['a@1001', 'b@1001', 'a@1002'])
    expect(a.script.now).toBe(2_500)
    expect(r.script.linkset.clock).toBe(world.clock)
  })

  it('times a script added later from its own start, on the world clock', async () => {
    const world = new World({ startUnixTime: 1_000 })
    world.addRegion('Sandbox', { x: 0, y: 0 })
    const early = await place(world, 'Sandbox', { x: 10, y: 10, z: 25 }, listener)
    early.script.advanceTime(60_000)
    const late = await place(
      world,
      'Sandbox',
      { x: 12, y: 10, z: 25 },
      `
        float started = -1;
        integer unix = 0;
        float ticked = -1;
        default {
          state_entry() { started = llGetTime(); unix = llGetUnixTime(); llSetTimerEvent(2.0); }
          timer() { ticked = llGetTime(); llSetTimerEvent(0); }
        }
      `,
    )
    expect(late.script.global('started')).toBe(0)
    expect(late.script.global('unix')).toBe(1_060)
    early.script.advanceTime(1_000)
    expect(late.script.global('ticked')).toBe(-1)
    early.script.advanceTime(1_000)
    expect(late.script.global('ticked')).toBeCloseTo(2.0)
  })
})
