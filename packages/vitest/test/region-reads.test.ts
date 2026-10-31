import { describe, it, expect } from 'vitest'
import { loadLinkset, loadScript, World, type Vector } from '../src/index.js'
import { REGION_FLAG_ALLOW_DIRECT_TELEPORT, REGION_FLAG_SANDBOX, SIM_STAT_AI_MS } from '@rezless/vm'

const START = 1_793_409_831

async function inRegion(world: World, region: string, body: string, position: Vector = { x: 128, y: 128, z: 20 }) {
  const { scripts } = await loadLinkset({
    world,
    region,
    position,
    prims: [{ name: 'probe', scripts: [{ source: { source: `list out; default { state_entry() { ${body} } }` }, name: 'probe' }] }],
  })
  scripts.probe!.start()
  return scripts.probe!.global('out')
}

async function alone(body: string) {
  const s = await loadScript({ source: `list out; default { state_entry() { ${body} } }` })
  s.start()
  return s.global('out')
}

// The SLua estate on Aditi is a 2x2 block: Tideland, Tombolo to its north,
// Mesa to its west and Yardang to its north-west. Mapped by teleporting the
// avatar to each neighbouring cell (2026-10-31).
function tideland(): World {
  const world = new World({ startUnixTime: START })
  world.addRegion('SLua Tideland', { x: 40960, y: 23296 }, { agentCount: 2 })
  world.addRegion('SLua Tombolo', { x: 40960, y: 23552 })
  world.addRegion('SLua Mesa', { x: 40704, y: 23296 })
  world.addRegion('SLua Yardang', { x: 40704, y: 23552 })
  return world
}

describe('region reads', () => {
  // In-world: llGetRegionName() in SLua Tideland -> "SLua Tideland";
  // llGetRegionCorner() -> <40960.00000, 23296.00000, 0.00000>.
  it('reads the region name and corner', async () => {
    expect(await inRegion(tideland(), 'SLua Tideland', 'out = [llGetRegionName(), llGetRegionCorner()];')).toEqual([
      'SLua Tideland',
      { x: 40960, y: 23296, z: 0 },
    ])
  })

  // In-world: llGetRegionFlags() -> 1048576 (REGION_FLAG_ALLOW_DIRECT_TELEPORT),
  // llGetRegionFPS() -> 45.01709, llGetRegionAgentCount() -> 2 with one other avatar there.
  it('reads flags, FPS and agent count', async () => {
    expect(
      await inRegion(tideland(), 'SLua Tideland', 'out = [llGetRegionFlags(), llGetRegionFPS(), llGetRegionAgentCount()];'),
    ).toEqual([REGION_FLAG_ALLOW_DIRECT_TELEPORT, 45, 2])
  })

  it('reads flags, FPS and agent count set on the region', async () => {
    const world = new World()
    world.addRegion('Sandbox', { x: 256000, y: 256000 }, { flags: REGION_FLAG_SANDBOX, fps: 22.5, agentCount: 7 })
    expect(
      await inRegion(world, 'Sandbox', 'out = [llGetRegionFlags(), llGetRegionFPS(), llGetRegionAgentCount()];'),
    ).toEqual([REGION_FLAG_SANDBOX, 22.5, 7])
  })

  it('puts a linkset outside a world in a region of its own', async () => {
    expect(
      await alone('out = [llGetRegionName(), llGetRegionCorner(), llGetRegionAgentCount(), llEdgeOfWorld(<128,128,20>, <1,0,0>)];'),
    ).toEqual(['Rezless', { x: 256000, y: 256000, z: 0 }, 1, 1])
  })
})

describe('llGetSimStats', () => {
  // In-world: SIM_STAT_PHYSICS_FPS -> 44.99768, SIM_STAT_AGENT_COUNT -> 2.0 (same as
  // llGetRegionAgentCount), SIM_STAT_SCRIPT_RUN_PCT -> 100.0, and -1 and 27..40 -> 0.0.
  it('reports FPS, agents and script run percentage, and 0 for unknown stats', async () => {
    expect(
      await inRegion(
        tideland(),
        'SLua Tideland',
        'out = [llGetSimStats(SIM_STAT_PHYSICS_FPS), llGetSimStats(SIM_STAT_AGENT_COUNT), llGetSimStats(SIM_STAT_SCRIPT_RUN_PCT), llGetSimStats(-1), llGetSimStats(27), llGetSimStats(40)];',
      ),
    ).toEqual([45, 2, 100, 0, 0, 0])
  })

  it('counts running scripts in the region', async () => {
    const world = tideland()
    await inRegion(world, 'SLua Tideland', '')
    await inRegion(world, 'SLua Tombolo', '')
    expect(await inRegion(world, 'SLua Tideland', 'out = [llGetSimStats(SIM_STAT_ACTIVE_SCRIPT_COUNT)];')).toEqual([2])
  })

  it('reads stats set on the region', async () => {
    const world = new World()
    world.addRegion('Busy', { x: 0, y: 0 }, { simStats: { [SIM_STAT_AI_MS]: 1.5 } })
    expect(await inRegion(world, 'Busy', 'out = [llGetSimStats(SIM_STAT_AI_MS)];')).toEqual([1.5])
  })
})

describe('llGetEnv', () => {
  // In-world, SLua Tideland: chat ranges "10"/"20"/"100", region_idle "0", grid "aditi";
  // unknown names, "" and names that differ in case or spacing -> "".
  it('reads region values by exact name', async () => {
    expect(
      await inRegion(
        tideland(),
        'SLua Tideland',
        'out = [llGetEnv("whisper_range"), llGetEnv("chat_range"), llGetEnv("shout_range"), llGetEnv("region_idle"), llGetEnv("grid"), llGetEnv("bogus"), llGetEnv(""), llGetEnv("CHAT_RANGE"), llGetEnv(" chat_range")];',
      ),
    ).toEqual(['10', '20', '100', '0', 'aditi', '', '', '', ''])
  })

  // In-world: frame_number went 382232551 -> 382232598 across llSleep(1.0), about 45 a second.
  it('counts frames at the region FPS and starts the region at the world start time', async () => {
    const world = tideland()
    const { scripts } = await loadLinkset({
      world,
      region: 'SLua Tideland',
      prims: [
        {
          name: 'probe',
          scripts: [
            {
              name: 'probe',
              source: {
                source: `list out; default { state_entry() { out = [llGetEnv("frame_number")]; llSleep(2.0); out += [llGetEnv("frame_number"), llGetEnv("region_start_time")]; } }`,
              },
            },
          ],
        },
      ],
    })
    scripts.probe!.start()
    expect(scripts.probe!.global('out')).toEqual(['0', '90', String(START)])
  })

  it('reads values set on the region', async () => {
    const world = new World()
    world.addRegion('Estate', { x: 0, y: 0 }, { env: { estate_name: 'Mine', bogus: 'x' } })
    expect(await inRegion(world, 'Estate', 'out = [llGetEnv("estate_name"), llGetEnv("bogus"), llGetEnv("chat_range")];')).toEqual([
      'Mine',
      'x',
      '20',
    ])
  })
})

describe('llEdgeOfWorld', () => {
  const edge = (p: string, dirs: string[]) =>
    inRegion(tideland(), 'SLua Tideland', `out = [${dirs.map((d) => `llEdgeOfWorld(${p}, ${d})`).join(', ')}];`)
  const COMPASS = ['<1,0,0>', '<-1,0,0>', '<0,1,0>', '<0,-1,0>', '<1,1,0>', '<-1,1,0>', '<1,-1,0>', '<-1,-1,0>']

  // In-world, SLua Tideland, each row [E, W, N, S, NE, NW, SE, SW]: TRUE when the
  // ray leaves the region through an edge with no region beyond it.
  it.each([
    ['<128,128,0>', [1, 0, 0, 1, 0, 0, 1, 1]],
    ['<117.718,48.336,0>', [1, 0, 0, 1, 1, 0, 1, 1]],
    ['<10,128,0>', [1, 0, 0, 1, 0, 0, 1, 0]],
    ['<246,128,0>', [1, 0, 0, 1, 1, 0, 1, 1]],
    ['<128,10,0>', [1, 0, 0, 1, 1, 0, 1, 1]],
    ['<128,246,0>', [1, 0, 0, 1, 0, 0, 1, 0]],
  ])('from %s inside the region', async (p, want) => {
    expect(await edge(p, COMPASS)).toEqual(want)
  })

  // In-world, from <128,128,20>: rays aimed exactly at the NE and NW corners -> FALSE
  // (Tombolo, north, exists; the NE cell does not), SE and SW corners -> TRUE.
  it('checks the north or south neighbour for a ray through a corner', async () => {
    expect(await edge('<128,128,20>', ['<128,128,0>', '<-128,128,0>', '<128,-128,0>', '<-128,-128,0>'])).toEqual([0, 0, 1, 1])
  })

  // In-world: z is ignored (<0,1,5>, <0,1,-5>, <-1,0,100> -> FALSE like N and W),
  // <0,0,1> and ZERO_VECTOR -> TRUE, and pos.z of 5000 or -50 changes nothing.
  it('ignores z and is TRUE for a ray with no horizontal direction', async () => {
    expect(
      await edge('<128,128,20>', ['<0,1,5>', '<0,1,-5>', '<-1,0,100>', '<0,0.0001,0>', '<0,0,1>', 'ZERO_VECTOR']),
    ).toEqual([0, 0, 0, 0, 1, 1])
    expect(await edge('<128,128,5000>', ['<0,1,0>', '<0,-1,0>'])).toEqual([0, 1])
  })

  // In-world: from a point on an edge, a ray along the outward normal reads that edge:
  // <0,128> W -> FALSE, <256,128> E -> TRUE, <128,256> N -> FALSE.
  it('reads the edge a point sits on', async () => {
    expect(await edge('<0,128,20>', ['<-1,0,0>'])).toEqual([0])
    expect(await edge('<256,128,20>', ['<1,0,0>'])).toEqual([1])
    expect(await edge('<128,256,20>', ['<0,1,0>'])).toEqual([0])
  })

  // In-world: from outside the region, a ray that never crosses it -> FALSE,
  // e.g. from <300,128> E, N and S, from <-50,128> W, and from <300,300> and <-50,-50> every way.
  it('is FALSE from outside for a ray that misses the region', async () => {
    expect(await edge('<300,128,0>', ['<1,0,0>', '<0,1,0>', '<0,-1,0>', '<1,1,0>', '<1,-1,0>'])).toEqual([0, 0, 0, 0, 0])
    expect(await edge('<-50,128,0>', ['<-1,0,0>', '<0,1,0>', '<0,-1,0>', '<-1,1,0>', '<-1,-1,0>'])).toEqual([0, 0, 0, 0, 0])
    expect(await edge('<300,300,0>', ['<1,0,0>', '<0,1,0>', '<1,1,0>', '<-1,1,0>', '<1,-1,0>'])).toEqual([0, 0, 0, 0, 0])
    expect(await edge('<-50,-50,0>', COMPASS)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })

  // In-world: from outside, a ray that crosses the region reads the edge it leaves by:
  // <-50,128> E and SE -> TRUE, NE -> FALSE; <300,128> SW -> TRUE, NW -> FALSE; <128,-50> N -> FALSE, NE -> TRUE.
  it('reads the exit edge from outside for a ray that crosses the region', async () => {
    expect(await edge('<-50,128,0>', ['<1,0,0>', '<1,-1,0>', '<1,1,0>'])).toEqual([1, 1, 0])
    expect(await edge('<300,128,0>', ['<-1,-1,0>', '<-1,1,0>'])).toEqual([1, 0])
    expect(await edge('<128,-50,0>', ['<0,1,0>', '<1,1,0>'])).toEqual([0, 1])
  })
})
