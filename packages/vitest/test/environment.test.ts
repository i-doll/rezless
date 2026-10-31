import { describe, it, expect } from 'vitest'
import { loadLinkset, loadScript, World, type RegionSettings, type Rotation, type Vector } from '../src/index.js'

// Wiki: https://wiki.secondlife.com/wiki/LlGetRegionTimeOfDay, LlGetDayLength
// and LlGetDayOffset. The parcel reads give the region's values when the
// parcel has no environment of its own.

const READS = `
  list day;
  default {
    state_entry() {
      day = [llGetDayLength(), llGetDayOffset(), llGetRegionDayLength(), llGetRegionDayOffset(), llGetRegionTimeOfDay()];
    }
  }
`

async function alone(startUnixTime: number) {
  const s = await loadScript({ source: READS, startUnixTime })
  s.start()
  return s.global('day')
}

async function inRegion(world: World) {
  const { scripts } = await loadLinkset({
    world,
    region: 'Sandbox',
    position: { x: 128, y: 128, z: 20 },
    prims: [{ name: 'probe', scripts: [{ source: { source: READS }, name: 'probe' }] }],
  })
  scripts.probe!.start()
  return scripts.probe!.global('day')
}

describe('day cycle', () => {
  // In-world: llGetDayLength, llGetDayOffset, llGetRegionDayLength and
  // llGetRegionDayOffset -> 14400, 57600, 14400, 57600; llGetRegionTimeOfDay at
  // llGetUnixTime 1793435176 -> 1576.801000, the same as llGetTimeOfDay
  // (Aditi, SLua Tombolo and SLua Tideland, 2026-10-31).
  it('defaults to a four-hour day offset by 16 hours', async () => {
    const day = await alone(1_793_435_176.801)
    expect(day).toEqual([14_400, 57_600, 14_400, 57_600, Math.fround(1_576.801)])
  })

  // In-world: llGetRegionTimeOfDay sampled every 12 s read 1642.534, 1654.534,
  // 1666.534 beside llGetUnixTime 1793435242, ...254, ...266 (SLua Tombolo).
  it('moves the time of day with the virtual clock and wraps at the day length', async () => {
    const s = await loadScript({
      source: `float tod; default { state_entry() { llSetTimerEvent(12); } timer() { tod = llGetRegionTimeOfDay(); } }`,
      startUnixTime: 1_793_435_230.534,
    })
    s.start()
    s.advanceTime(12_000)
    expect(s.global('tod')).toBe(Math.fround(1_642.534))
    s.advanceTime(12_000 * 1_068)
    expect(s.global('tod')).toBe(Math.fround(1_642.534 + 12 * 1_068 - 14_400))
  })

  it('reads a day length and offset set on the region', async () => {
    const world = new World({ startUnixTime: 1000.25 })
    world.addRegion('Sandbox', { x: 256000, y: 256000 }, { dayLength: 3 * 3600, dayOffset: 3600 })
    const day = await inRegion(world)
    expect(day).toEqual([10_800, 3_600, 10_800, 3_600, 4_600.25])
  })

  // In-world: llGetTimeOfDay read the same as llGetRegionTimeOfDay (SLua
  // Tombolo, 2026-10-31). Wiki: https://wiki.secondlife.com/wiki/LlGetTimeOfDay
  it('llGetTimeOfDay follows the region day length and offset', async () => {
    const world = new World({ startUnixTime: 1000.25 })
    world.addRegion('Sandbox', { x: 256000, y: 256000 }, { dayLength: 3 * 3600, dayOffset: 3600 })
    const { scripts } = await loadLinkset({
      world,
      region: 'Sandbox',
      position: { x: 128, y: 128, z: 20 },
      prims: [
        {
          name: 'probe',
          scripts: [{ source: { source: `float tod; default { state_entry() { tod = llGetTimeOfDay(); } }` }, name: 'probe' }],
        },
      ],
    })
    scripts.probe!.start()
    expect(scripts.probe!.global('tod')).toBe(4_600.25)
  })
})

// Wiki: https://wiki.secondlife.com/wiki/LlGetSunDirection, LlGetSunRotation,
// LlGetMoonDirection, LlGetMoonRotation and their llGetRegion* forms. A
// region's sun and moon go wherever its environment puts them, so real regions
// differ. A test sets them on the region; the default is one measured SLua
// Tombolo instant held fixed.
const SKY = `
  list sky;
  default {
    state_entry() {
      sky = [llGetRegionSunRotation(), llGetRegionSunDirection(), llGetRegionMoonRotation(), llGetRegionMoonDirection(),
             llGetSunRotation(), llGetSunDirection(), llGetMoonRotation(), llGetMoonDirection()];
    }
  }
`

type Sky = [Rotation, Vector, Rotation, Vector, Rotation, Vector, Rotation, Vector]

async function skyIn(world: World): Promise<Sky> {
  const { scripts } = await loadLinkset({
    world,
    region: 'Sandbox',
    position: { x: 128, y: 128, z: 20 },
    prims: [{ name: 'probe', scripts: [{ source: { source: SKY }, name: 'probe' }] }],
  })
  scripts.probe!.start()
  return scripts.probe!.global('sky') as Sky
}

function sandbox(settings: RegionSettings, startUnixTime = 0): World {
  const world = new World({ startUnixTime })
  world.addRegion('Sandbox', { x: 256000, y: 256000 }, settings)
  return world
}

// In-world values print with 5 decimals, so they match to within 1e-5.
function expectClose(actual: Vector | Rotation, expected: Vector | Rotation) {
  for (const [k, v] of Object.entries(expected)) expect(Math.abs(actual[k as keyof typeof actual] - v), k).toBeLessThan(1e-5)
}

describe('sun and moon', () => {
  // In-world: at llGetRegionTimeOfDay 2290.531 in SLua Tombolo,
  // llGetRegionSunRotation -> <0, -0.04711, 0, 0.99889>, llGetRegionSunDirection
  // -> <0.99556, 0, 0.09411>, llGetRegionMoonRotation -> <0, 0.99889, 0, 0.04711>,
  // llGetRegionMoonDirection -> <-0.99556, 0, -0.09411>; the parcel reads matched
  // (Aditi, 2026-10-31). SLua Tideland read a different sun at the same time.
  it('defaults to a measured morning sun with the moon opposite', async () => {
    const s = await loadScript({ source: SKY })
    s.start()
    const [sunRot, sunDir, moonRot, moonDir, ...parcel] = s.global('sky') as Sky
    expectClose(sunRot, { x: 0, y: -0.04711, z: 0, s: 0.99889 })
    expectClose(sunDir, { x: 0.99556, y: 0, z: 0.09411 })
    expectClose(moonRot, { x: 0, y: 0.99889, z: 0, s: 0.04711 })
    expectClose(moonDir, { x: -0.99556, y: 0, z: -0.09411 })
    expect(parcel).toEqual([sunRot, sunDir, moonRot, moonDir])
  })

  // In-world: before dawn in SLua Tombolo the sun read rotation <0, 0.31095, 0, 0.95043>
  // and direction <0.80662, 0, -0.59108>; the moon <0, 0.95043, 0, -0.31095> and
  // <-0.80662, 0, 0.59108>. In SLua Tideland, rotation <0, -0.09374, 0, 0.99560> gave
  // direction <0.98243, 0, 0.18665>. Each direction is the rotation applied to <1, 0, 0>.
  it.each([
    [{ x: 0, y: 0.31095, z: 0, s: 0.95043 }, { x: 0.80662, y: 0, z: -0.59108 }],
    [{ x: 0, y: 0.95043, z: 0, s: -0.31095 }, { x: -0.80662, y: 0, z: 0.59108 }],
    [{ x: 0, y: -0.09374, z: 0, s: 0.9956 }, { x: 0.98243, y: 0, z: 0.18665 }],
  ])('reads a rotation set on the region and points along it', async (rotation, direction) => {
    const [sunRot, sunDir, moonRot, moonDir] = await skyIn(sandbox({ sunRotation: rotation, moonRotation: rotation }))
    expectClose(sunRot, rotation)
    expectClose(sunDir, direction)
    expect([moonRot, moonDir]).toEqual([sunRot, sunDir])
  })

  it('reads rotations that are not in the east-up plane', async () => {
    const half = Math.SQRT1_2
    const [sunRot, sunDir, moonRot, moonDir] = await skyIn(
      sandbox({ sunRotation: { x: 0, y: 0, z: half, s: half }, moonRotation: { x: half, y: 0, z: 0, s: half } }),
    )
    expectClose(sunRot, { x: 0, y: 0, z: half, s: half })
    expectClose(sunDir, { x: 0, y: 1, z: 0 })
    expectClose(moonRot, { x: half, y: 0, z: 0, s: half })
    expectClose(moonDir, { x: 1, y: 0, z: 0 })
  })

  it('moves the sun and moon with the day fraction', async () => {
    const fractions: number[] = []
    const turn = (f: number) => {
      fractions.push(f)
      const a = Math.PI * f
      return { x: 0, y: -Math.sin(a), z: 0, s: Math.cos(a) }
    }
    const { scripts } = await loadLinkset({
      world: sandbox({ dayLength: 1000, dayOffset: 0, sunRotation: turn, moonRotation: (f) => turn(f + 0.5) }),
      region: 'Sandbox',
      position: { x: 128, y: 128, z: 20 },
      prims: [
        {
          name: 'probe',
          scripts: [
            {
              name: 'probe',
              source: {
                source: `
                  vector sun; vector moon;
                  default { state_entry() { llSetTimerEvent(250); } timer() { sun = llGetSunDirection(); moon = llGetRegionMoonDirection(); } }
                `,
              },
            },
          ],
        },
      ],
    })
    const probe = scripts.probe!
    probe.start()
    probe.advanceTime(250_000)
    expect(fractions).toEqual([0.25, 0.75])
    expectClose(probe.global('sun') as Vector, { x: 0, y: 0, z: 1 })
    expectClose(probe.global('moon') as Vector, { x: 0, y: 0, z: -1 })
  })
})
