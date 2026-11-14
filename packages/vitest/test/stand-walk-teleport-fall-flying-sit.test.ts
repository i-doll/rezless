import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlGetAgentInfo
// https://wiki.secondlife.com/wiki/LlGetAnimation
// https://wiki.secondlife.com/wiki/LlUnSit
// https://wiki.secondlife.com/wiki/LlTeleportAgent
//
// Every "In-world" note below was measured on Aditi, SLua Tideland and its northern neighbour SLua
// Tombolo, 2026-11-14, with Firestorm (RLVa) and one avatar that owned every probe object.
//
// A "watch" sampled llGetAgentInfo(owner) and llGetAnimation(owner) on a 0.05 s timer (about one
// sample every 0.044 s) and noted each change with the time since the watch started. The probes were
// a seat with llSitTarget(<0, 0, 0.6>, ZERO_ROTATION) that started a watch from its
// changed(CHANGED_LINK) event, and a watch worn on the left hand. The avatar stood on a platform
// whose top was about 0.93 m below the avatar's centre.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const AGENT_FLYING = 0x1, AGENT_ATTACHMENTS = 0x2, AGENT_SCRIPTED = 0x4, AGENT_SITTING = 0x10
const AGENT_ON_OBJECT = 0x20, AGENT_WALKING = 0x80, AGENT_IN_AIR = 0x100
const MOTION = AGENT_FLYING | AGENT_SITTING | AGENT_ON_OBJECT | AGENT_WALKING | AGENT_IN_AIR
const SIT_GROUND = '@sit:00000000-0000-0000-0000-000000000000=force'

const source = (sitTarget: boolean) => `
  key o; list log;
  default {
    state_entry() { o = llGetOwner(); ${sitTarget ? 'llSitTarget(<0.0, 0.0, 0.6>, ZERO_ROTATION);' : ''} }
    changed(integer c) {
      if (c & CHANGED_LINK) log += ["chg", llGetAgentInfo(o) & ${MOTION}, llGetAnimation(o)];
    }
    link_message(integer s, integer n, string str, key id) {
      if (str == "rd") log += ["rd", llGetAgentInfo(o), llGetAnimation(o)];
      else if (str == "rlv") llOwnerSay((string)id);
      else if (str == "unsit") { llUnSit(o); log += ["now", llGetAgentInfo(o) & ${MOTION}, llGetAnimation(o)]; }
      else if (str == "ask") llRequestPermissions(o, n);
      else if (str == "die") llDie();
      else if (str == "tpa") {
        llTeleportAgent(o, "", (vector)((string)id), ZERO_VECTOR);
        log += ["now", llGetAgentInfo(o) & ${MOTION}, llGetAnimation(o)];
      }
    }
  }`

type Probe = Awaited<ReturnType<typeof probe>>

async function probe(world: World, region = 'home', sitTarget = false) {
  const { linkset, scripts } = await loadLinkset({ world, region, owner: OWNER,
    prims: [{ scripts: [{ name: 'probe', source: { source: source(sitTarget) } }] }] })
  const script = scripts['probe']!
  script.start()
  linkset.advanceTime(0)
  const send = (str: string, num = 0, id = '') => {
    script.fire('link_message', { sender_num: 1, num, str, id })
    linkset.advanceTime(0)
  }
  const entries = (tag: string) => {
    const log = script.global('log') as unknown[]
    const out: unknown[][] = []
    for (let i = 0; i < log.length; i += 3) if (log[i] === tag) out.push([log[i + 1], log[i + 2]])
    return out
  }
  return {
    linkset, script, send, prim: linkset.prims[0]!,
    /** The full llGetAgentInfo bits and llGetAnimation. */
    read: () => { send('rd'); return entries('rd').at(-1)! },
    /** Every changed(CHANGED_LINK) the probe heard, as [masked bits, animation]. */
    changes: () => entries('chg'),
    /** What the probe read in the same handler straight after llUnSit or llTeleportAgent. */
    now: () => entries('now').at(-1),
  }
}

/** Each [masked bits, animation] the watcher read in turn, with when it started and ended (ms). */
function watch(p: Probe, advance: (ms: number) => void, ms: number) {
  const out: { bits: number, state: string, from: number, to: number }[] = []
  for (let t = 0; t <= ms; t += 10) {
    if (t) advance(10)
    const [bits, state] = p.read() as [number, string]
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
  const far = await probe(world, 'away')
  const worn = await probe(world)
  worn.linkset.attachToAvatar(OWNER, 5)
  for (const p of [seat, watcher, worn]) avatar.viewer.session.bind(p.linkset, avatar)
  const advance = (ms: number) => watcher.linkset.advanceTime(ms)
  const sit = () => { expect(world.userSitAvatar(avatar, seat.prim)).toBe(true); advance(0) }
  const stand = () => { expect(world.userStandAvatar(avatar)).toBe(true); advance(0) }
  const fly = () => { avatar.info |= AGENT_FLYING | AGENT_IN_AIR }
  return { world, avatar, seat, watcher, far, worn, advance, sit, stand, fly }
}

describe('AGENT_WALKING after a stand from an object', () => {
  // In-world, seven stands from the seat (three viewer stands, three llUnSit(owner) calls and one
  // "@unsit=force"), each watched by the seat from its changed event and by the worn watch:
  //   262 "Striding" for one sample, then 6 "Standing", then 134 (AGENT_WALKING) "Walking", then 6
  //   "Standing". The walk started 0.29, 0.31, 0.36, 0.36, 0.36, 0.40 and 0.36 s after the stand and
  //   ended 0.42 to 0.53 s after it. One viewer stand also read 134 "Walking" for one sample at
  //   0.04 s, and the "@unsit=force" read 134 "Walking" in its changed event and up to 0.40 s.
  // When the seat said llDie() under the avatar (two runs), the avatar read 262 "Striding" until
  // 0.29 and 0.33 s, then "Walking" until 0.38 and 0.40 s; when the seat was taken, 6 "Standing",
  // then "Walking" from 0.31 to 0.47 s after the stand.
  // rezless walks from 0.35 to 0.48 s, inside those runs.
  it('reads "Walking" for a moment a few tenths of a second after a viewer stand', async () => {
    const f = await fixture()
    f.sit()
    f.stand()
    const w = watch(f.watcher, f.advance, 800)
    expect(steps(w)).toEqual([[AGENT_IN_AIR, 'Striding'], [0, 'Standing'], [AGENT_WALKING, 'Walking'], [0, 'Standing']])
    const walk = w[2]!
    expect(walk.from).toBeGreaterThan(280)
    expect(walk.from).toBeLessThanOrEqual(400)
    expect(walk.to).toBeGreaterThanOrEqual(420)
    expect(walk.to).toBeLessThan(530)
  })

  it('reads the same after llUnSit and after "@unsit=force"', async () => {
    for (const how of ['unsit', 'rlv'] as const) {
      const f = await fixture()
      f.sit()
      if (how === 'unsit') f.seat.send('unsit')
      else {
        f.worn.send('rlv', 0, '@unsit=force')
        f.advance(225)
      }
      expect(steps(watch(f.watcher, f.advance, 800)))
        .toEqual([[AGENT_IN_AIR, 'Striding'], [0, 'Standing'], [AGENT_WALKING, 'Walking'], [0, 'Standing']])
    }
  })

  it('stops walking when the avatar teleports or takes off during the walk', async () => {
    const f = await fixture()
    f.sit()
    f.stand()
    f.advance(400)
    expect(f.world.teleportAvatar(f.avatar, { x: 120, y: 52, z: 30 })).toBe(true)
    f.advance(0)
    expect((f.watcher.read()[0] as number) & MOTION).toBe(AGENT_IN_AIR)
    f.sit()
    f.stand()
    f.advance(200)
    f.fly()
    expect(steps(watch(f.watcher, f.advance, 600))).toEqual([[AGENT_FLYING | AGENT_IN_AIR, 'Standing']])
    f.avatar.info &= ~(AGENT_FLYING | AGENT_IN_AIR)
    f.sit()
    f.stand()
    f.advance(400)
    f.fly()
    expect(steps(watch(f.watcher, f.advance, 600)))
      .toEqual([[AGENT_FLYING | AGENT_IN_AIR | AGENT_WALKING, 'Walking'], [AGENT_FLYING | AGENT_IN_AIR, 'Hovering']])
  })

  it('stands up as from standing when the flying flag went before the stand', async () => {
    const f = await fixture()
    f.fly()
    f.sit()
    f.avatar.info &= ~AGENT_FLYING
    f.stand()
    expect(f.seat.changes().at(-1)).toEqual([AGENT_IN_AIR, 'Striding'])
  })

  it('keeps a locomotion state the test sets after the stand', async () => {
    const f = await fixture()
    f.sit()
    f.stand()
    f.watcher.script.setAnimationState(OWNER, 'Walking')
    f.advance(600)
    expect(f.watcher.read()).toEqual([AGENT_ATTACHMENTS | AGENT_SCRIPTED, 'Walking'])
  })

  // rezless gives a seat that dies the 50 ms "Striding" of every stand (see above), then the walk.
  it('walks after the seat dies under the avatar', async () => {
    const f = await fixture()
    f.sit()
    f.seat.send('die')
    expect(steps(watch(f.watcher, f.advance, 800)))
      .toEqual([[AGENT_IN_AIR, 'Striding'], [0, 'Standing'], [AGENT_WALKING, 'Walking'], [0, 'Standing']])
  })

  // In-world: two viewer stands and one "@unsit=force" from the ground (after "@sitground=force")
  // read 22 "Sitting on Ground", 262 "Striding" for one sample (missed by one viewer stand), then 6
  // "Standing" for the rest of a 3 s watch, with no "Walking".
  it('does not walk after a stand from the ground', async () => {
    const f = await fixture()
    f.worn.send('rlv', 0, SIT_GROUND)
    f.advance(225)
    f.stand()
    expect(steps(watch(f.watcher, f.advance, 800))).toEqual([[AGENT_IN_AIR, 'Striding'], [0, 'Standing']])
  })

  it('does not walk once the avatar has sat down again', async () => {
    const f = await fixture()
    f.sit()
    f.stand()
    f.advance(100)
    f.sit()
    expect(steps(watch(f.watcher, f.advance, 800))).toEqual([[AGENT_SITTING | AGENT_ON_OBJECT, 'Sitting']])
  })
})

describe('llUnSit read in the handler that called it', () => {
  // In-world, six runs of llUnSit(owner) from the seat with the avatar on it. Read straight after
  // the call in the same handler, five read 262 "Striding" and one read 6 "Standing". In the three
  // runs where the handler said nothing before changed ran, the seat's changed read the same as
  // the handler each time. No run read 6 "Striding".
  it('reads AGENT_IN_AIR and "Striding", as the seat\'s changed event does', async () => {
    const f = await fixture()
    f.sit()
    f.seat.send('unsit')
    expect(f.seat.now()).toEqual([AGENT_IN_AIR, 'Striding'])
    expect(f.seat.changes().at(-1)).toEqual([AGENT_IN_AIR, 'Striding'])
  })
})

describe('the fall after a teleport', () => {
  // In-world, the fall lasted as long as a free fall from where the teleport put the avatar to the
  // platform, about sqrt(2 * drop / 9.8) seconds:
  //   viewer teleport 0.6 m above standing height: "Falling Down" for 0.33 s, twice
  //   viewer teleport 5.6 m above: 1.05 s; 15.6 m above: 1.80 s, then "Standing Up"
  //   llTeleportAgent to standing height: shorter than one sample, twice, though the calling handler
  //   read 262 "Falling Down"; 1.6 m above: 0.60 s; 5.6 m above: 1.04 s
  // After every fall but the longest the avatar read 6 "Landing" for 0.05 to 0.71 s (0.11, 0.71,
  // 0.07, 0.22, 0.67, 0.67, 0.05), sometimes then 134 "Walking" for 0.04 to 0.2 s, then 6 "Standing".
  // rezless has no floor to fall to, so it keeps a 0.6 s fall, inside the measured range, and then
  // reads "Landing" for 0.25 s. From a seat, three viewer teleports read 134 "Walking" for about
  // 0.1 to 0.2 s after the fall instead of "Landing", and llTeleportAgent read "Landing"; rezless
  // reads "Landing" after every teleport.
  it('reads "Falling Down" in the measured range, then "Landing", then "Standing"', async () => {
    const f = await fixture()
    expect(f.world.teleportAvatar(f.avatar, { x: 120, y: 52, z: 30 })).toBe(true)
    f.advance(0)
    const w = watch(f.watcher, f.advance, 2600)
    expect(steps(w)).toEqual([[AGENT_IN_AIR, 'Falling Down'], [0, 'Landing'], [0, 'Standing']])
    expect(w[0]!.to).toBeLessThan(1800)
    expect(w[1]!.to - w[1]!.from).toBeGreaterThanOrEqual(40)
    expect(w[1]!.to - w[1]!.from).toBeLessThan(710)
  })

  it('reads "Falling Down" in the handler that called llTeleportAgent, then lands the same way', async () => {
    const f = await fixture()
    f.worn.send('ask', 4096)
    f.worn.script.grantPermissions()
    f.worn.send('tpa', 0, '<120.0, 52.0, 30.0>')
    expect(f.worn.now()).toEqual([AGENT_IN_AIR, 'Falling Down'])
    expect(steps(watch(f.watcher, f.advance, 2600))).toEqual([[AGENT_IN_AIR, 'Falling Down'], [0, 'Landing'], [0, 'Standing']])
  })

  it('keeps sitting when the avatar sits down before it lands', async () => {
    const f = await fixture()
    expect(f.world.teleportAvatar(f.avatar, { x: 120, y: 52, z: 30 })).toBe(true)
    f.advance(700)
    f.sit()
    expect(steps(watch(f.watcher, f.advance, 800))).toEqual([[AGENT_SITTING | AGENT_ON_OBJECT, 'Sitting']])
  })
})

describe('sitting down while flying', () => {
  // In-world: flown up a few metres with the viewer's fly autopilot (263 "Hovering"), then a sit
  // request for the seat, three runs. The seat's changed read 55 (AGENT_FLYING still set) "Sitting",
  // and its watch read 54 "Sitting" from 0.31, 0.33 and 0.31 s after the event. "@sit:<seat>=force"
  // while flying read the same, with 54 from 0.36 s. rezless clears AGENT_FLYING 0.32 s after the sit.
  it('keeps AGENT_FLYING in the seat\'s changed event and clears it a moment later', async () => {
    const f = await fixture()
    f.fly()
    f.sit()
    expect(f.seat.changes()).toEqual([[AGENT_SITTING | AGENT_ON_OBJECT | AGENT_FLYING, 'Sitting']])
    const w = watch(f.watcher, f.advance, 800)
    expect(steps(w)).toEqual([[AGENT_SITTING | AGENT_ON_OBJECT | AGENT_FLYING, 'Sitting'], [AGENT_SITTING | AGENT_ON_OBJECT, 'Sitting']])
    expect(w[0]!.to).toBeGreaterThanOrEqual(270)
    expect(w[0]!.to).toBeLessThan(360)
  })

  it('does the same for "@sit:<key>=force"', async () => {
    const f = await fixture()
    f.fly()
    f.worn.send('rlv', 0, `@sit:${f.seat.prim.key}=force`)
    f.advance(225)
    expect(f.seat.changes()).toEqual([[AGENT_SITTING | AGENT_ON_OBJECT | AGENT_FLYING, 'Sitting']])
    f.advance(400)
    expect((f.watcher.read()[0] as number) & MOTION).toBe(AGENT_SITTING | AGENT_ON_OBJECT)
  })

  // In-world: a seat that called llUnSit(owner) from the changed event of a flying avatar's sit, two
  // runs. The changed event for the stand read 263 (AGENT_FLYING and AGENT_IN_AIR) "Hovering Up",
  // and the avatar went on reading 263 "Hovering Up" until 0.27 and 0.31 s after the stand, then
  // 262 "Falling Down" for about 0.5 s, then 134 "Walking" (after 6 "Landing" in one run), then 6
  // "Standing". A stand after the flag had cleared read 262 "Striding", as from standing.
  it('stands up flying when the avatar stands before the flag clears, then falls', async () => {
    const f = await fixture()
    f.fly()
    f.sit()
    f.advance(100)
    f.stand()
    expect(f.seat.changes().at(-1)).toEqual([AGENT_FLYING | AGENT_IN_AIR, 'Hovering Up'])
    const w = watch(f.watcher, f.advance, 2000)
    expect(w[0]!.to).toBeGreaterThanOrEqual(160)
    expect(w[0]!.to).toBeLessThan(260)
    expect(steps(w)).toEqual([[AGENT_FLYING | AGENT_IN_AIR, 'Hovering Up'], [AGENT_IN_AIR, 'Falling Down'], [0, 'Landing'], [0, 'Standing']])
  })

  it('keeps a state the test sets while the avatar hovers, and lands it', async () => {
    const f = await fixture()
    f.fly()
    f.sit()
    f.advance(100)
    f.stand()
    f.watcher.script.setAnimationState(OWNER, 'Walking')
    f.advance(400)
    expect(f.watcher.read()).toEqual([AGENT_ATTACHMENTS | AGENT_SCRIPTED, 'Walking'])
  })

  it('leaves a flight the avatar starts after standing alone', async () => {
    const f = await fixture()
    f.fly()
    f.sit()
    f.advance(100)
    f.stand()
    expect(f.world.attemptAvatarMovement(f.avatar, 'land').allowed).toBe(true)
    expect(f.world.attemptAvatarMovement(f.avatar, 'fly').allowed).toBe(true)
    f.advance(600)
    expect((f.watcher.read()[0] as number) & AGENT_FLYING).toBe(AGENT_FLYING)
  })

  it('falls when the avatar lands while it hovers', async () => {
    const f = await fixture()
    f.fly()
    f.sit()
    f.advance(100)
    f.stand()
    expect(f.world.attemptAvatarMovement(f.avatar, 'land').allowed).toBe(true)
    expect(f.watcher.read()).toEqual([AGENT_ATTACHMENTS | AGENT_SCRIPTED | AGENT_IN_AIR, 'Falling Down'])
  })

  it('does the same for a flight changed by "@fly=force"', async () => {
    const f = await fixture()
    f.fly()
    f.sit()
    f.advance(100)
    f.stand()
    f.worn.send('rlv', 0, '@fly:false=force')
    expect(f.watcher.read()).toEqual([AGENT_ATTACHMENTS | AGENT_SCRIPTED | AGENT_IN_AIR, 'Falling Down'])
    f.worn.send('rlv', 0, '@fly:true=force')
    f.advance(600)
    expect((f.watcher.read()[0] as number) & AGENT_FLYING).toBe(AGENT_FLYING)
  })

  it('stands up as from standing once the flag has cleared', async () => {
    const f = await fixture()
    f.fly()
    f.sit()
    f.advance(400)
    f.stand()
    expect(f.seat.changes().at(-1)).toEqual([AGENT_IN_AIR, 'Striding'])
  })

  // In-world: a seat holding PERMISSION_TELEPORT called llTeleportAgent(owner, "", a spot 4 m away
  // at standing height, ZERO_VECTOR) from the changed event of a flying avatar's sit, two runs. The
  // handler and the seat's changed event for the stand read 263 "Hovering"; the avatar read 263
  // "Hovering" until 0.27 and 0.31 s after the sit, then 6 "Landing" with no fall to see (the spot
  // was at standing height), then 6 "Standing". rezless falls for its usual 0.6 s.
  it('hovers when the avatar teleports away before the flag clears, then falls', async () => {
    const f = await fixture()
    f.seat.send('ask', 4096)
    f.seat.script.grantPermissions()
    f.fly()
    f.sit()
    f.seat.send('tpa', 0, '<120.0, 52.0, 30.0>')
    expect(f.seat.now()).toEqual([AGENT_FLYING | AGENT_IN_AIR, 'Hovering'])
    expect(f.seat.changes().at(-1)).toEqual([AGENT_FLYING | AGENT_IN_AIR, 'Hovering'])
    const w = watch(f.watcher, f.advance, 2000)
    expect(steps(w)).toEqual([[AGENT_FLYING | AGENT_IN_AIR, 'Hovering'], [AGENT_IN_AIR, 'Falling Down'], [0, 'Landing'], [0, 'Standing']])
    expect(w[0]!.to).toBeGreaterThanOrEqual(260)
    expect(w[0]!.to).toBeLessThan(360)
  })
})

describe('a teleport into another region, seen from there', () => {
  // In-world: a probe rezzed in SLua Tombolo watched the avatar teleport in from SLua Tideland, in
  // two runs. For its first 0.34 and 0.38 s in the region the avatar read without AGENT_ATTACHMENTS
  // and AGENT_SCRIPTED (0 "Landing", 128 "Walking" in one run; 256 "Hovering", 256 "Falling Down" in
  // the other), then with them (134, 262 and 6). Both runs read "Falling Down" and then "Landing"
  // within 0.7 s of arriving. rezless leaves the two bits out for the first 0.35 s.
  it('reads no attachments for a moment after it arrives', async () => {
    const f = await fixture()
    expect(f.world.teleportAvatar(f.avatar, { x: 30, y: 286, z: 30 })).toBe(true)
    f.advance(0)
    expect((f.far.read()[0] as number) & (AGENT_ATTACHMENTS | AGENT_SCRIPTED)).toBe(0)
    expect(f.far.read()[1]).toBe('Falling Down')
    f.advance(300)
    expect((f.far.read()[0] as number) & (AGENT_ATTACHMENTS | AGENT_SCRIPTED)).toBe(0)
    f.advance(100)
    expect((f.far.read()[0] as number) & (AGENT_ATTACHMENTS | AGENT_SCRIPTED)).toBe(AGENT_ATTACHMENTS | AGENT_SCRIPTED)
  })

  // In-world: every teleport within SLua Tideland read 262 or 6 in the worn watch, never without
  // AGENT_ATTACHMENTS and AGENT_SCRIPTED.
  it('keeps them through a teleport within the region', async () => {
    const f = await fixture()
    expect(f.world.teleportAvatar(f.avatar, { x: 120, y: 52, z: 30 })).toBe(true)
    f.advance(0)
    expect((f.watcher.read()[0] as number) & (AGENT_ATTACHMENTS | AGENT_SCRIPTED)).toBe(AGENT_ATTACHMENTS | AGENT_SCRIPTED)
  })

  it('gives them back when the test moves the avatar to another region', async () => {
    const f = await fixture()
    expect(f.world.teleportAvatar(f.avatar, { x: 30, y: 286, z: 30 })).toBe(true)
    f.advance(100)
    f.avatar.region = 'home'
    f.advance(400)
    expect((f.watcher.read()[0] as number) & (AGENT_ATTACHMENTS | AGENT_SCRIPTED)).toBe(AGENT_ATTACHMENTS | AGENT_SCRIPTED)
  })

  it('gives them back when the avatar leaves again before they returned', async () => {
    const f = await fixture()
    expect(f.world.teleportAvatar(f.avatar, { x: 30, y: 286, z: 30 })).toBe(true)
    f.advance(100)
    expect(f.world.teleportAvatar(f.avatar, { x: 30, y: 30, z: 30 })).toBe(true)
    f.advance(1000)
    expect((f.watcher.read()[0] as number) & (AGENT_ATTACHMENTS | AGENT_SCRIPTED)).toBe(AGENT_ATTACHMENTS | AGENT_SCRIPTED)
  })
})
