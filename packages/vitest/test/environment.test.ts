import { describe, it, expect } from 'vitest'
import { loadLinkset, loadScript, World } from '../src/index.js'

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
})
