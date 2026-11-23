import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlGetAgentInfo
// https://wiki.secondlife.com/wiki/LlGetAnimation
// https://wiki.secondlife.com/wiki/LlGetAgentSize
// https://wiki.secondlife.com/wiki/LlDie
//
// Every "In-world" note below was measured on Aditi, SLua Tideland and its northern neighbour SLua
// Tombolo, 2026-11-23, with Firestorm (RLVa) and one avatar that owned every probe object. A watch
// rezzed next to the avatar read llGetAgentInfo(owner), llGetAnimation(owner) and
// llGetAgentSize(owner) in a loop bounded by llGetTime (several thousand samples in 3 to 6 s) and
// noted each change with the time since the watch started.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const AGENT_FLYING = 0x1, AGENT_ATTACHMENTS = 0x2, AGENT_SCRIPTED = 0x4, AGENT_SITTING = 0x10
const AGENT_ON_OBJECT = 0x20, AGENT_WALKING = 0x80, AGENT_IN_AIR = 0x100
const MOTION = AGENT_FLYING | AGENT_SITTING | AGENT_ON_OBJECT | AGENT_WALKING | AGENT_IN_AIR

const source = (sitTarget: boolean) => `
  key o; list log;
  default {
    state_entry() { o = llGetOwner(); ${sitTarget ? 'llSitTarget(<0.0, 0.0, 0.6>, ZERO_ROTATION);' : ''} }
    link_message(integer s, integer n, string str, key id) {
      if (str == "rd") log = [llGetAgentInfo(o), llGetAnimation(o), llGetAgentSize(o) != ZERO_VECTOR];
      else if (str == "rlv") llOwnerSay((string)id);
      else if (str == "die") llDie();
    }
  }`

async function probe(world: World, region = 'home', sitTarget = false) {
  const { linkset, scripts } = await loadLinkset({ world, region, owner: OWNER,
    prims: [{ scripts: [{ name: 'probe', source: { source: source(sitTarget) } }] }] })
  const script = scripts['probe']!
  script.start()
  linkset.advanceTime(0)
  const send = (str: string, id = '') => {
    script.fire('link_message', { sender_num: 1, num: 0, str, id })
    linkset.advanceTime(0)
  }
  /** [llGetAgentInfo, llGetAnimation, whether llGetAgentSize is non-zero] */
  const read = () => { send('rd'); return script.global('log') as [number, string, number] }
  return { linkset, script, send, read, prim: linkset.prims[0]! }
}

type Probe = Awaited<ReturnType<typeof probe>>

/** Each [masked bits, animation] the probe read in turn, with when it started and ended (ms). */
function watch(p: Probe, advance: (ms: number) => void, ms: number) {
  const out: { bits: number, state: string, from: number, to: number }[] = []
  for (let t = 0; t <= ms; t += 10) {
    if (t) advance(10)
    const [bits, state] = p.read()
    const last = out.at(-1)
    if (last && last.bits === (bits & MOTION) && last.state === state) last.to = t
    else out.push({ bits: bits & MOTION, state, from: t, to: t })
  }
  return out
}

const steps = (w: ReturnType<typeof watch>) => w.map(s => [s.bits, s.state])

async function fixture() {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addRegion('away', { x: 0, y: 256 })
  const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'owner', viewer: { profile: 'rlva' },
    info: AGENT_ATTACHMENTS | AGENT_SCRIPTED })
  const seat = await probe(world, 'home', true)
  const watcher = await probe(world)
  for (const p of [seat, watcher]) avatar.viewer.session.bind(p.linkset, avatar)
  const advance = (ms: number) => watcher.linkset.advanceTime(ms)
  const sit = () => { expect(world.userSitAvatar(avatar, seat.prim)).toBe(true); advance(1000) }
  const fly = () => { avatar.info |= AGENT_FLYING | AGENT_IN_AIR }
  return { world, avatar, seat, watcher, advance, sit, fly }
}

describe('a ground sit while flying', () => {
  // In-world: flown up 3 m with the viewer's fly autopilot (263 "Hovering"), "@sitground=force"
  // from a probe read 23 (AGENT_FLYING kept) "Sitting on Ground" from 0.22 s for the rest of a 3 to
  // 5 s watch, in three runs. Firestorm sends the ground sit with no change to flying.
  it('keeps AGENT_FLYING for "@sitground=force"', async () => {
    const f = await fixture()
    f.fly()
    f.watcher.send('rlv', '@sitground=force')
    const w = watch(f.watcher, f.advance, 5000)
    expect(steps(w)).toEqual([[AGENT_FLYING | AGENT_IN_AIR, 'Hovering'], [AGENT_FLYING | AGENT_SITTING, 'Sitting on Ground']])
    expect(w[1]!.from).toBeLessThan(300)
  })

  it('keeps it when the test sits the avatar on the ground', async () => {
    const f = await fixture()
    f.fly()
    f.world.sitAvatarOnGround(f.avatar)
    expect(f.watcher.read().slice(0, 2)).toEqual([AGENT_ATTACHMENTS | AGENT_SCRIPTED | AGENT_FLYING | AGENT_SITTING, 'Sitting on Ground'])
  })

  // In-world: a viewer stand from that ground sit read 263 "Hovering Up" for 0.05 and 0.07 s, then
  // 263 "Hovering" for the rest of a 4 to 6 s watch, in two runs: the avatar flew again.
  it('flies again when the avatar stands up', async () => {
    const f = await fixture()
    f.fly()
    f.watcher.send('rlv', '@sitground=force')
    f.advance(1000)
    expect(f.world.userStandAvatar(f.avatar)).toBe(true)
    f.advance(0)
    const w = watch(f.watcher, f.advance, 3000)
    expect(steps(w)).toEqual([[AGENT_FLYING | AGENT_IN_AIR, 'Hovering Up'], [AGENT_FLYING | AGENT_IN_AIR, 'Hovering']])
    expect(w[0]!.to).toBeGreaterThanOrEqual(40)
    expect(w[0]!.to).toBeLessThan(80)
  })

  it('lands as from standing when the avatar stops flying before the hover', async () => {
    const f = await fixture()
    f.fly()
    f.watcher.send('rlv', '@sitground=force')
    f.advance(1000)
    f.avatar.info &= ~AGENT_FLYING
    expect(f.world.userStandAvatar(f.avatar)).toBe(true)
    f.advance(0)
    expect(steps(watch(f.watcher, f.advance, 1000))).toEqual([[AGENT_IN_AIR, 'Striding'], [0, 'Standing']])
  })

  it('falls when the avatar stops flying during "Hovering Up"', async () => {
    const f = await fixture()
    f.fly()
    f.watcher.send('rlv', '@sitground=force')
    f.advance(1000)
    expect(f.world.userStandAvatar(f.avatar)).toBe(true)
    f.advance(20)
    f.avatar.info &= ~AGENT_FLYING
    f.advance(40)
    expect(steps(watch(f.watcher, f.advance, 1500)))
      .toEqual([[AGENT_IN_AIR, 'Falling Down'], [0, 'Landing'], [0, 'Standing']])
  })

  it('keeps a state the test sets during "Hovering Up"', async () => {
    const f = await fixture()
    f.fly()
    f.watcher.send('rlv', '@sitground=force')
    f.advance(1000)
    expect(f.world.userStandAvatar(f.avatar)).toBe(true)
    f.advance(20)
    f.watcher.script.setAnimationState(OWNER, 'Flying')
    f.advance(1000)
    expect(f.watcher.read()[1]).toBe('Flying')
  })
})

describe('a seat that dies under the avatar', () => {
  // In-world: a seat (llSitTarget(<0, 0, 0.6>, ZERO_ROTATION)) that called llDie() with the avatar
  // on it, in five runs. For one sample about 0.02 s after the seat died the avatar read 0, "" and
  // a zero size; then 262 "Striding" from 0.04 s to 0.26-0.28 s, then 6 "Standing" in four runs and
  // 134 "Walking" until 0.35 s in one. Two earlier runs (2026-11-14) read "Striding" until 0.29 and
  // 0.33 s, then "Walking" until 0.38 and 0.40 s. rezless reads "Striding" for 270 ms, then
  // "Standing", and leaves out the one-sample gap.
  it('reads "Striding" in the air for about a quarter of a second, then "Standing"', async () => {
    const f = await fixture()
    f.sit()
    f.seat.send('die')
    const w = watch(f.watcher, f.advance, 1500)
    expect(steps(w)).toEqual([[AGENT_IN_AIR, 'Striding'], [0, 'Standing']])
    expect(w[0]!.to).toBeGreaterThanOrEqual(240)
    expect(w[0]!.to).toBeLessThan(330)
  })

  it('stays sitting when the avatar sits down again during the fall', async () => {
    const f = await fixture()
    f.sit()
    const other = await probe(f.world, 'home', true)
    f.seat.send('die')
    f.advance(100)
    expect(f.world.userSitAvatar(f.avatar, other.prim)).toBe(true)
    f.advance(1000)
    expect(f.watcher.read().slice(0, 2)).toEqual([AGENT_ATTACHMENTS | AGENT_SCRIPTED | AGENT_SITTING | AGENT_ON_OBJECT, 'Sitting'])
  })
})

describe('a viewer teleport from a seat', () => {
  // In-world: viewer teleports from the seat and from standing to the same spot read the same.
  // 0.55 m above standing height: 262 "Falling Down" 0.34 s, then 6 "Landing" 0.6 s, then 6
  // "Standing", three runs from the seat and one standing. 1.55 m above: "Falling Down" 0.56-0.58 s,
  // "Landing" 0.04-0.07 s, 134 "Walking" 0.09-0.14 s, then "Standing", two runs from the seat and one
  // standing. Whether "Walking" follows depends on the drop, not on the seat, so rezless lands a
  // teleport from a seat as it lands one from standing.
  it('lands as a teleport from standing does', async () => {
    const seated = await fixture()
    seated.sit()
    expect(seated.world.teleportAvatar(seated.avatar, { x: 120, y: 52, z: 30 })).toBe(true)
    seated.advance(0)
    const standing = await fixture()
    expect(standing.world.teleportAvatar(standing.avatar, { x: 120, y: 52, z: 30 })).toBe(true)
    standing.advance(0)
    expect(watch(seated.watcher, seated.advance, 2000)).toEqual(watch(standing.watcher, standing.advance, 2000))
  })
})

describe('a teleport while flying', () => {
  // In-world: viewer teleports within SLua Tideland of a flying avatar, and of one sitting on the
  // ground with AGENT_FLYING after "@sitground=force", read 263 "Hovering" for the rest of a 4 s
  // watch, two runs each: the avatar kept flying and didn't fall.
  it('keeps hovering after the teleport', async () => {
    const f = await fixture()
    f.fly()
    f.watcher.script.setAnimationState(OWNER, 'Flying')
    expect(f.world.teleportAvatar(f.avatar, { x: 120, y: 52, z: 30 })).toBe(true)
    f.advance(0)
    expect(steps(watch(f.watcher, f.advance, 3000))).toEqual([[AGENT_FLYING | AGENT_IN_AIR, 'Hovering']])
  })

  it('keeps hovering when it takes off during the fall from an earlier teleport', async () => {
    const f = await fixture()
    expect(f.world.teleportAvatar(f.avatar, { x: 120, y: 52, z: 30 })).toBe(true)
    f.advance(100)
    f.fly()
    expect(f.world.teleportAvatar(f.avatar, { x: 100, y: 52, z: 30 })).toBe(true)
    f.advance(0)
    expect(steps(watch(f.watcher, f.advance, 2000))).toEqual([[AGENT_FLYING | AGENT_IN_AIR, 'Hovering']])
  })

  it('hovers after a teleport from a ground sit that kept AGENT_FLYING', async () => {
    const f = await fixture()
    f.fly()
    f.watcher.send('rlv', '@sitground=force')
    f.advance(1000)
    expect(f.world.teleportAvatar(f.avatar, { x: 120, y: 52, z: 30 })).toBe(true)
    f.advance(0)
    expect(steps(watch(f.watcher, f.advance, 3000))).toEqual([[AGENT_FLYING | AGENT_IN_AIR, 'Hovering']])
  })
})

describe('the region an avatar leaves', () => {
  // In-world: a watch in SLua Tideland as the avatar teleported to SLua Tombolo, four runs standing:
  // 6 "Init" with a non-zero llGetAgentSize for 0.20, 0.09, 0.07 and 0.09 s, then 0, "" and a zero
  // size. From the seat: 54 "Sitting", then 6 "Init" for 0.04 s, then gone. Flying, two runs: 263
  // "Hovering", then 7 "Init" (AGENT_FLYING kept) for 0.41 and 0.25 s. Two earlier runs (2026-11-14)
  // read "Init" for 0.26 and 0.37 s. rezless keeps the avatar in the old region as "Init" for 200 ms,
  // the median of the nine runs, without its sitting, walking and in-air bits.
  it('reads "Init" with no motion bits for a moment, then nothing', async () => {
    const f = await fixture()
    expect(f.world.teleportAvatar(f.avatar, { x: 30, y: 286, z: 30 })).toBe(true)
    f.advance(0)
    expect(f.watcher.read()).toEqual([AGENT_ATTACHMENTS | AGENT_SCRIPTED, 'Init', 1])
    f.advance(190)
    expect(f.watcher.read()).toEqual([AGENT_ATTACHMENTS | AGENT_SCRIPTED, 'Init', 1])
    f.advance(10)
    expect(f.watcher.read()).toEqual([0, '', 0])
  })

  it('drops the sitting bits when the avatar leaves from a seat', async () => {
    const f = await fixture()
    f.sit()
    expect(f.world.teleportAvatar(f.avatar, { x: 30, y: 286, z: 30 })).toBe(true)
    f.advance(0)
    expect(f.watcher.read()).toEqual([AGENT_ATTACHMENTS | AGENT_SCRIPTED, 'Init', 1])
  })

  it('keeps AGENT_FLYING when the avatar leaves flying', async () => {
    const f = await fixture()
    f.fly()
    expect(f.world.teleportAvatar(f.avatar, { x: 30, y: 286, z: 30 })).toBe(true)
    f.advance(0)
    expect(f.watcher.read()).toEqual([AGENT_ATTACHMENTS | AGENT_SCRIPTED | AGENT_FLYING, 'Init', 1])
  })

  it('reads the avatar as usual once it comes back', async () => {
    const f = await fixture()
    expect(f.world.teleportAvatar(f.avatar, { x: 30, y: 286, z: 30 })).toBe(true)
    f.advance(10)
    expect(f.world.teleportAvatar(f.avatar, { x: 30, y: 30, z: 30 })).toBe(true)
    f.advance(0)
    expect(f.watcher.read()[1]).toBe('Falling Down')
  })

  it('keeps reading it there when the avatar moves on to a third region at once', async () => {
    const f = await fixture()
    f.world.addRegion('far', { x: 0, y: 512 })
    expect(f.world.teleportAvatar(f.avatar, { x: 30, y: 286, z: 30 })).toBe(true)
    f.advance(20)
    expect(f.world.teleportAvatar(f.avatar, { x: 30, y: 542, z: 30 })).toBe(true)
    f.advance(0)
    expect(f.watcher.read()[1]).toBe('Init')
    f.advance(180)
    expect(f.watcher.read()[1]).toBe('')
  })

  it('does not read "Init" after a teleport within the region', async () => {
    const f = await fixture()
    expect(f.world.teleportAvatar(f.avatar, { x: 120, y: 52, z: 30 })).toBe(true)
    f.advance(0)
    expect(f.watcher.read()[1]).toBe('Falling Down')
  })
})
