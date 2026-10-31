import { describe, it, expect } from 'vitest'
import {
  loadScript,
  CAMERA_ACTIVE,
  CAMERA_DISTANCE,
  CONTROL_BACK,
  CONTROL_FWD,
  CONTROL_LEFT,
  PERMISSION_CONTROL_CAMERA,
  PERMISSION_TAKE_CONTROLS,
  PERMISSION_TRACK_CAMERA,
} from '../src/index.js'

// Measured on Aditi (SLua Tideland, 2026-10-31) with the headless viewer as i Doll,
// sitting on a probe prim that requested the three permissions in changed()
// (auto-granted, run_time_permissions(3076)) and a second prim listening on
// DEBUG_CHANNEL. The headless viewer can't press keys, so control input itself
// (when `control` fires, what level and edge hold) follows the wiki pages cited
// below and isn't measured.

const AGENT = '00000000-0000-0000-0000-00000000000a'
const DEBUG_CHANNEL = 2147483647
const ALL = PERMISSION_TAKE_CONTROLS | PERMISSION_TRACK_CAMERA | PERMISSION_CONTROL_CAMERA

const script = (body: string) => `
  list got = [];
  integer p;
  default {
    state_entry() { llRequestPermissions(llGetOwner(), ${ALL}); }
    touch_start(integer n) { ${body} }
    touch_end(integer n) { p = llGetPermissions(); }
    control(key id, integer level, integer edge) { got += [id, level, edge]; }
  }
`

async function load(body: string, grant: number | null = ALL) {
  const s = await loadScript({ source: script(body), owner: AGENT })
  s.start()
  if (grant !== null) s.grantPermissions(grant)
  return s
}

const perms = (s: Awaited<ReturnType<typeof load>>) => {
  s.fire('touch_end', { num_detected: 1 })
  return s.global('p')
}

const debugErrors = (s: Awaited<ReturnType<typeof load>>) => s.chat.filter((c) => c.channel === DEBUG_CHANNEL)

describe('llTakeControls', () => {
  // https://wiki.secondlife.com/wiki/LlTakeControls
  it('records the taken controls once PERMISSION_TAKE_CONTROLS is granted', async () => {
    const s = await load(`llTakeControls(${CONTROL_FWD | CONTROL_BACK}, TRUE, FALSE);`)
    s.linkset.touch(0)
    expect(s.controls).toEqual({ controls: CONTROL_FWD | CONTROL_BACK, accept: true, passOn: false })
  })

  it('does nothing, silently, without the permission', async () => {
    const s = await load(`llTakeControls(${CONTROL_FWD}, TRUE, FALSE);`, null)
    s.linkset.touch(0)
    // In-world: llTakeControls(CONTROL_FWD, TRUE, FALSE) with no permissions said
    // nothing on DEBUG_CHANNEL, despite the wiki's "shout an error" (Aditi, SLua Tideland, 2026-10-31).
    expect(s.controls).toBeNull()
    expect(debugErrors(s)).toEqual([])
  })

  it('fires no control event when the controls are taken', async () => {
    const s = await load(`llTakeControls(-1, TRUE, FALSE);`)
    s.linkset.touch(0)
    // In-world: no control event came in the 12 s after taking every control
    // while seated (Aditi, SLua Tideland, 2026-10-31).
    expect(s.global('got')).toEqual([])
  })

  // Not measured: telling replace from merge needs key presses, which the
  // headless viewer can't send.
  it('replaces the controls an earlier call took', async () => {
    const s = await load(`llTakeControls(${CONTROL_FWD}, TRUE, FALSE); llTakeControls(${CONTROL_BACK}, TRUE, TRUE);`)
    s.linkset.touch(0)
    expect(s.controls).toEqual({ controls: CONTROL_BACK, accept: true, passOn: true })
  })
})

describe('control event', () => {
  // https://wiki.secondlife.com/wiki/Control: level is what's held, edge what was
  // just pressed or released.
  it('reports held and just-changed controls from the permission agent', async () => {
    const s = await load(`llTakeControls(${CONTROL_FWD | CONTROL_BACK}, TRUE, FALSE);`)
    s.linkset.touch(0)
    s.sendControl(CONTROL_FWD)
    s.sendControl(CONTROL_FWD)
    s.sendControl(0)
    expect(s.global('got')).toEqual([AGENT, CONTROL_FWD, CONTROL_FWD, AGENT, CONTROL_FWD, 0, AGENT, 0, CONTROL_FWD])
  })

  it('only reports the controls the script took', async () => {
    const s = await load(`llTakeControls(${CONTROL_FWD}, TRUE, FALSE);`)
    s.linkset.touch(0)
    s.sendControl(CONTROL_FWD | CONTROL_LEFT)
    s.sendControl(CONTROL_LEFT)
    s.sendControl(0)
    expect(s.global('got')).toEqual([AGENT, CONTROL_FWD, CONTROL_FWD, AGENT, 0, CONTROL_FWD])
  })

  it('fires nothing when accept is FALSE or no controls are taken', async () => {
    const s = await load(`llTakeControls(${CONTROL_FWD}, FALSE, TRUE);`)
    s.sendControl(CONTROL_FWD)
    s.linkset.touch(0)
    s.sendControl(0)
    s.sendControl(CONTROL_FWD)
    expect(s.global('got')).toEqual([])
  })
})

describe('llReleaseControls', () => {
  // https://wiki.secondlife.com/wiki/LlReleaseControls
  it('stops control events and drops PERMISSION_TAKE_CONTROLS', async () => {
    const s = await load(`
      if (llGetListLength(got) == 0 && llGetPermissions() & ${PERMISSION_TAKE_CONTROLS}) llTakeControls(${CONTROL_FWD}, TRUE, FALSE);
      else llReleaseControls();
    `)
    s.linkset.touch(0)
    s.sendControl(CONTROL_FWD)
    s.linkset.touch(0)
    s.sendControl(0)
    // In-world: llReleaseControls() took llGetPermissions() from 3076 to 3072
    // (Aditi, SLua Tideland, 2026-10-31).
    expect(s.controls).toBeNull()
    expect(s.global('got')).toEqual([AGENT, CONTROL_FWD, CONTROL_FWD])
    expect(perms(s)).toBe(PERMISSION_TRACK_CAMERA | PERMISSION_CONTROL_CAMERA)
  })

  it('drops the permission even when no controls were taken, silently', async () => {
    const s = await load('llReleaseControls(); llReleaseControls();')
    s.linkset.touch(0)
    // In-world: a fresh grant of 3076, llReleaseControls() twice with nothing
    // taken -> 3072 and no DEBUG_CHANNEL error (Aditi, SLua Tideland, 2026-10-31).
    expect(perms(s)).toBe(PERMISSION_TRACK_CAMERA | PERMISSION_CONTROL_CAMERA)
    expect(debugErrors(s)).toEqual([])
  })

  it('leaves a later llTakeControls without the permission', async () => {
    const s = await load(`llReleaseControls(); llTakeControls(${CONTROL_FWD}, TRUE, FALSE);`)
    s.linkset.touch(0)
    // In-world: llTakeControls after llReleaseControls left llGetPermissions() at 3072,
    // silently (Aditi, SLua Tideland, 2026-10-31).
    expect(s.controls).toBeNull()
    expect(debugErrors(s)).toEqual([])
  })

  it('without permission does nothing', async () => {
    const s = await load('llReleaseControls();', null)
    s.linkset.touch(0)
    // In-world: llReleaseControls() with no permissions said nothing (Aditi, SLua Tideland, 2026-10-31).
    expect(debugErrors(s)).toEqual([])
    expect(perms(s)).toBe(0)
  })

  it('drops the control events still queued', async () => {
    const s = await loadScript({
      owner: AGENT,
      source: `
        list got = [];
        default {
          state_entry() { llRequestPermissions(llGetOwner(), ${PERMISSION_TAKE_CONTROLS}); }
          run_time_permissions(integer p) { llTakeControls(${CONTROL_FWD}, TRUE, FALSE); }
          control(key id, integer level, integer edge) { got += [level, edge]; llReleaseControls(); }
        }
      `,
    })
    s.start()
    s.grantPermissions()
    s.running = false
    s.sendControl(CONTROL_FWD)
    s.sendControl(0)
    s.running = true
    s.resumeParked()
    s.advanceTime(0)
    // llReleaseControls dequeues the remaining control events (lsl_definitions.yaml tooltip).
    expect(s.global('got')).toEqual([CONTROL_FWD, CONTROL_FWD])
  })

  it('happens when a later grant leaves out PERMISSION_TAKE_CONTROLS', async () => {
    const s = await load(
      `if (llGetPermissions() & ${PERMISSION_TAKE_CONTROLS}) { llTakeControls(${CONTROL_FWD}, TRUE, FALSE); llRequestPermissions(llGetOwner(), ${PERMISSION_TRACK_CAMERA}); }`,
    )
    s.linkset.touch(0)
    s.grantPermissions()
    s.sendControl(CONTROL_FWD)
    expect(s.controls).toBeNull()
    expect(s.global('got')).toEqual([])
  })

  it('happens on reset too', async () => {
    const s = await load(`llTakeControls(${CONTROL_FWD}, TRUE, FALSE);`)
    s.linkset.touch(0)
    s.reset()
    expect(s.controls).toBeNull()
  })
})

describe('camera reads', () => {
  // https://wiki.secondlife.com/wiki/LlGetCameraPos, LlGetCameraRot, LlGetCameraFOV, LlGetCameraAspect
  const reads = 'got = [llGetCameraPos(), llGetCameraRot(), llGetCameraFOV(), llGetCameraAspect()];'

  it('return zero values, silently, without PERMISSION_TRACK_CAMERA', async () => {
    const s = await load(reads, PERMISSION_TAKE_CONTROLS | PERMISSION_CONTROL_CAMERA)
    s.setCamera({ pos: { x: 1, y: 2, z: 3 }, fov: 0.5 })
    s.linkset.touch(0)
    // In-world: with no permissions, <0,0,0>, <0,0,0,1>, 0.0 and 0.0, no
    // DEBUG_CHANNEL error (Aditi, SLua Tideland, 2026-10-31).
    expect(s.global('got')).toEqual([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, s: 1 }, 0, 0])
    expect(debugErrors(s)).toEqual([])
  })

  it('return the camera the test set', async () => {
    const s = await load(reads)
    s.setCamera({ pos: { x: 115.769, y: 45.088, z: 1999.36 }, rot: { x: 0, y: 0, z: 0.6, s: 0.8 }, fov: 0.75, aspect: 1.5 })
    s.linkset.touch(0)
    const [pos, r, fov, aspect] = s.global('got') as [unknown, unknown, number, number]
    expect(pos).toEqual({ x: Math.fround(115.769), y: Math.fround(45.088), z: Math.fround(1999.36) })
    expect(r).toEqual({ x: 0, y: 0, z: Math.fround(0.6), s: Math.fround(0.8) })
    expect(fov).toBe(0.75)
    expect(aspect).toBe(1.5)
  })

  it('default to the measured viewer camera lens', async () => {
    const s = await load(reads, PERMISSION_TRACK_CAMERA)
    s.linkset.touch(0)
    // In-world: with PERMISSION_TRACK_CAMERA, llGetCameraFOV() = 1.047198 (60 degrees)
    // and llGetCameraAspect() = 1.424200 in the headless viewer (Aditi, SLua Tideland, 2026-10-31).
    const [, , fov, aspect] = s.global('got') as [unknown, unknown, number, number]
    expect(fov).toBeCloseTo(1.047198, 6)
    expect(aspect).toBeCloseTo(1.4242, 6)
  })
})

describe('llSetCameraParams / llClearCameraParams', () => {
  // https://wiki.secondlife.com/wiki/LlSetCameraParams
  it('records the rules, merging later calls into earlier ones', async () => {
    const s = await load(
      `llSetCameraParams([${CAMERA_ACTIVE}, TRUE, ${CAMERA_DISTANCE}, 5.0]); llSetCameraParams([${CAMERA_DISTANCE}, 8.0]);`,
    )
    s.linkset.touch(0)
    expect(s.cameraParams).toEqual(
      new Map([
        [CAMERA_ACTIVE, 1],
        [CAMERA_DISTANCE, 8],
      ]),
    )
  })

  it('ignores a trailing rule with no value, silently', async () => {
    const s = await load(`llSetCameraParams([${CAMERA_DISTANCE}, 4.0, ${CAMERA_ACTIVE}]);`)
    s.linkset.touch(0)
    // In-world: llSetCameraParams([CAMERA_ACTIVE]), [999, 1] and
    // [CAMERA_DISTANCE, "x"] said nothing on DEBUG_CHANNEL (Aditi, SLua Tideland, 2026-10-31).
    expect(s.cameraParams).toEqual(new Map([[CAMERA_DISTANCE, 4]]))
    expect(debugErrors(s)).toEqual([])
  })

  it('does nothing, silently, without PERMISSION_CONTROL_CAMERA', async () => {
    const s = await load(`llSetCameraParams([${CAMERA_ACTIVE}, TRUE]);`, PERMISSION_TRACK_CAMERA)
    s.linkset.touch(0)
    // In-world: llSetCameraParams([CAMERA_ACTIVE, TRUE]) and llClearCameraParams() with no
    // permissions said nothing on DEBUG_CHANNEL (Aditi, SLua Tideland, 2026-10-31).
    expect(s.cameraParams).toEqual(new Map())
    expect(debugErrors(s)).toEqual([])
  })

  it('llClearCameraParams forgets every rule', async () => {
    const s = await load(
      `if (llGetListLength(got) == 0) { got = [1]; llSetCameraParams([${CAMERA_ACTIVE}, TRUE]); } else llClearCameraParams();`,
    )
    s.linkset.touch(0)
    s.linkset.touch(0)
    expect(s.cameraParams).toEqual(new Map())
  })

  it('llClearCameraParams without the permission keeps the rules', async () => {
    const s = await load(
      `if (llGetListLength(got) == 0) { got = [1]; llSetCameraParams([${CAMERA_ACTIVE}, TRUE]); llRequestPermissions(llGetOwner(), ${PERMISSION_TRACK_CAMERA}); } else llClearCameraParams();`,
    )
    s.linkset.touch(0)
    s.grantPermissions()
    s.linkset.touch(0)
    expect(s.cameraParams).toEqual(new Map([[CAMERA_ACTIVE, 1]]))
  })
})
