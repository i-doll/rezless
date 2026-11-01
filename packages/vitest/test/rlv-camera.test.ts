import { expect, it } from 'vitest'
import { loadRlvPair, changeRlvFov, getRlvFov, World, loadLinkset, PERMISSION_TRACK_CAMERA } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Camera
const source = `string command; default {
  touch_start(integer n) { llOwnerSay(command); }
}`

it('forces a per-avatar FOV in radians and replies with profile precision', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    f.script.setGlobal('command', '@setcam_fov:0.777777=force,getcam_fov=22801')
    f.script.fire('touch_start', { num_detected: 1 })
    expect(f.avatar.viewer.commandLog.map(r => r.status)).toEqual(['applied', 'replied'])
    expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ reply: {
      channel: 22801, text: profile === 'rlva' ? '0.778' : '0.777777',
    } })
  }
})

it('clamps user changes to aggregated limits and restores the RLVa user lens', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    const send = (command: string) => {
      f.script.setGlobal('command', command)
      f.script.fire('touch_start', { num_detected: 1 })
    }
    // User input follows LLViewerCamera::setDefaultFOV; keyboard and preference
    // UI event delivery are outside scripted in-world probes.
    expect(changeRlvFov(f.avatar, 0.75)).toBeCloseTo(0.75)
    send('@setcam_fovmin:0.9=n,setcam_fovmax:1.1=n')
    expect(changeRlvFov(f.avatar, 0.4)).toBeCloseTo(0.9)
    expect(changeRlvFov(f.avatar, 1.4)).toBeCloseTo(1.1)
    send('@setcam_fovmin:0.9=y')
    expect(changeRlvFov(f.avatar, 0.8)).toBeCloseTo(0.8)
    send('@clear')
    expect(getRlvFov(f.avatar)).toBeCloseTo(profile === 'rlva' ? 0.75 : 0.8)
    expect(changeRlvFov(f.avatar, 0.7)).toBeCloseTo(0.7)
  }
})

it('shares the permission agent lens without granting tracking permission', async () => {
  const pair = await loadRlvPair({ source: `float fov; default {
    state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_TRACK_CAMERA); }
    touch_start(integer n) { llOwnerSay("@setcam_fov:0.8=force"); fov = llGetCameraFOV(); }
  }` })
  for (const f of Object.values(pair)) {
    f.script.start()
    f.script.fire('touch_start', { num_detected: 1 })
    expect(f.script.global('fov')).toBe(0)
    f.script.grantPermissions(PERMISSION_TRACK_CAMERA)
    f.script.fire('touch_start', { num_detected: 1 })
    expect(f.script.global('fov')).toBeCloseTo(0.8)
  }
})

it('keeps disabled commands inert and isolates avatar lenses', async () => {
  const world = new World()
  world.addRegion('test', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'off', region: 'test' })
  const other = world.addAvatar({ username: 'other', region: 'test', viewer: { profile: 'rlva' } })
  const { scripts } = await loadLinkset({ world, region: 'test', owner: avatar.key,
    prims: [{ scripts: [{ name: 'probe', source: { source } }] }] })
  scripts.probe!.start()
  scripts.probe!.setGlobal('command', '@setcam_fov:0.8=force,setcam_fovmin:0.9=n,getcam_fov=22801')
  scripts.probe!.fire('touch_start', { num_detected: 1 })
  expect(avatar.viewer.commandLog).toEqual([])
  expect(avatar.viewer.restrictions.snapshot()).toEqual([])
  expect(getRlvFov(avatar)).toBeCloseTo(Math.PI / 3)
  changeRlvFov(other, 0.8)
  expect(getRlvFov(other)).toBeCloseTo(0.8)
  expect(getRlvFov(avatar)).toBeCloseTo(Math.PI / 3)
})

it('distinguishes unset FOV limits by profile', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    f.script.setGlobal('command', '@getcam_fov=22801,getcam_fovmin=22802,getcam_fovmax=22803')
    f.script.fire('touch_start', { num_detected: 1 })
    expect(f.avatar.viewer.commandLog.map(r => r.status === 'replied' ? r.reply.text : r.status))
      .toEqual(profile === 'rlva' ? ['1.047', '', ''] : ['1.047198', '0.000001', '-0.000001'])
  }
})

it('aggregates strongest minimum and maximum from independent issuers', async () => {
  const { loadLinkset } = await import('../src/index.js')
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    const loaded = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
    const other = loaded.scripts.other!
    other.start()
    const send = (script: typeof other, command: string) => {
      script.setGlobal('command', command)
      script.fire('touch_start', { num_detected: 1 })
    }
    send(f.script, '@setcam_fovmin:0.8=n,setcam_fovmin:0.9=n,setcam_fovmax:1.2=n')
    send(other, '@setcam_fovmin:1.0=n,setcam_fovmax:1.1=n')
    send(f.script, '@setcam_fov:0.4=force,getcam_fov=22801,getcam_fovmin=22802,getcam_fovmax=22803')
    const replies = () => f.avatar.viewer.commandLog.filter(r => r.status === 'replied').map(r => r.reply.text).slice(-3)
    expect(replies()).toEqual(profile === 'rlva' ? ['1.000', '1.000', '1.100'] : ['1.000000', '1.000000', '1.100000'])
    send(other, '@clear')
    send(f.script, '@setcam_fov:1.5=force,getcam_fov=22801,getcam_fovmin=22802,getcam_fovmax=22803')
    expect(replies()).toEqual(profile === 'rlva' ? ['1.200', '0.900', '1.200'] : ['1.200000', '0.900000', '1.200000'])
  }
})

function send(f: Awaited<ReturnType<typeof loadRlvPair>>['rlv'], command: string) {
  f.script.setGlobal('command', command)
  f.script.fire('touch_start', { num_detected: 1 })
}
const replies = (f: Awaited<ReturnType<typeof loadRlvPair>>['rlv']) => f.avatar.viewer.commandLog
  .filter(r => r.status === 'replied').map(r => r.reply.text)

// In-world: numeric force roundtrip -> 0.778; force 0/60 -> 0.087/2.145;
// unset bounds -> empty replies (Aditi, SLua Tideland, 2026-11-01, Firestorm RLVa 2.4.2).
it('delivers queued exact wire replies to an LSL listener and discovers every camera form', async () => {
  const pair = await loadRlvPair({ source: `list replies; default {
    state_entry() { llListen(22801,"",llGetOwner(),"");
      llOwnerSay("@setcam_fov:0.777777=force,getcam_fov=22801,getcommand:fov=22801"); }
    listen(integer c,string n,key id,string m) { replies += [m]; }
  }` })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    expect(f.script.global('replies')).toEqual(profile === 'rlva'
      ? ['0.778', 'setcam_fovmax;setcam_fovmin;setcam_fov;getcam_fov;getcam_fovmax;getcam_fovmin'] : ['0.777777'])
  }
})

it('uses viewport range and profile-specific empty force defaults', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    send(f, '@setcam_fov:0=force,getcam_fov=22801,setcam_fov:60=force,getcam_fov=22801,setcam_fov=force,getcam_fov=22801')
    expect(replies(f)).toEqual(profile === 'rlva' ? ['0.087', '2.145', '1.047'] : ['0.087266', '2.144591', '0.087266'])
  }
})

// In-world: min 1.4/max 1.1 -> force 1.0/1.2 yields 1.400, force 2 -> 1.100;
// queries keep 1.400/1.100 (Aditi, SLua Tideland, 2026-11-01, Firestorm RLVa 2.4.2).
it('preserves the profile-specific contradictory-bound policy', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    send(f, '@setcam_fovmin:1.4=n,setcam_fovmax:1.1=n,setcam_fov:1=force,getcam_fov=22801,getcam_fovmin=22801,getcam_fovmax=22801,setcam_fov:2=force,getcam_fov=22801')
    expect(replies(f)).toEqual(profile === 'rlva' ? ['1.400', '1.400', '1.100', '1.100'] : ['1.400000', '1.400000', '1.400000', '1.400000'])
  }
})

// In-world: bad/1e40 force keeps 0.770; bad limit is not stored; 0.7x -> 0.700;
// empty force -> 1.047; negative/zero/3.5 limits retained (Aditi, SLua Tideland, 2026-11-01, Firestorm RLVa 2.4.2).
for (const option of ['bad', '1e40', '1e-50', '0.7x', '', '-1', '0', '3.5']) {
  it(`handles force and limit option [${option}] by profile`, async () => {
    const pair = await loadRlvPair({ source })
    for (const profile of ['rlv', 'rlva'] as const) {
      const f = pair[profile]; f.script.start()
      send(f, `@setcam_fov:0.77=force,setcam_fov:${option}=force,getcam_fov=22801`)
      const invalid = ['bad', '1e40', '1e-50'].includes(option)
      const force = profile === 'rlva' && invalid ? '0.770'
        : option === '0.7x' ? profile === 'rlva' ? '0.700' : '0.700000'
        : !option && profile === 'rlva' ? '1.047'
        : ['1e40', '3.5'].includes(option) ? profile === 'rlva' ? '2.145' : '2.144591'
        : profile === 'rlva' ? '0.087' : '0.087266'
      expect(replies(f)).toEqual([force])
      send(f, `@setcam_fovmin:${option}=n,getcam_fovmin=22801`)
      const stored = f.avatar.viewer.restrictions.snapshot()
      expect(stored.length).toBe(profile === 'rlva' && (invalid || !option) ? 0 : 1)
      if (profile === 'rlva' && (invalid || !option)) expect(replies(f).at(-1)).toBe('')
      else if (profile === 'rlva') expect(replies(f).at(-1)).toBe(Number.parseFloat(option).toFixed(3))
      send(f, '@clear')
      expect(f.avatar.viewer.restrictions.snapshot()).toEqual([])
    }
  })
}

// In-world: force nan -> nan, inf -> 2.145; min nan/inf retained and queried as
// nan/inf. Removing nan leaves a query-visible modifier with no wire rule;
// adding/removing a finite min temporarily masks it (Aditi, SLua Tideland, 2026-11-01, Firestorm RLVa 2.4.2).
it('keeps explicit non-finite values and the RLVa NaN modifier removal behavior', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    send(f, '@setcam_fov:nan=force,getcam_fov=22801')
    expect(replies(f)).toEqual(['nan'])
    expect(getRlvFov(f.avatar)).toBeNaN()
    send(f, '@setcam_fov:inf=force,getcam_fov=22801,setcam_fov:-inf=force,getcam_fov=22801')
    expect(replies(f).slice(-2)).toEqual(profile === 'rlva' ? ['2.145', '0.087'] : ['2.144591', '0.087266'])
    send(f, '@setcam_fovmin:nan=n,getcam_fovmin=22801,setcam_fovmin:nan=y,getcam_fovmin=22801')
    expect(replies(f).slice(-2)).toEqual(profile === 'rlva' ? ['nan', 'nan'] : ['0.000001', '0.000001'])
    expect(f.avatar.viewer.restrictions.snapshot()).toEqual([])
    send(f, '@setcam_fovmin:0.8=n,getcam_fovmin=22801,clear,getcam_fovmin=22801')
    expect(replies(f).slice(-2)).toEqual(profile === 'rlva' ? ['0.800', 'nan'] : ['0.800000', '0.000001'])
    send(f, '@setcam_fovmin:inf=n,getcam_fovmin=22801,clear')
    expect(replies(f).at(-1)).toBe('inf')
  }
})

// In-world: bad query options -> empty replies; removing min 0.9 after forcing
// 0.77 and applying the limit restores 0.770 (Aditi, SLua Tideland, 2026-11-01, Firestorm RLVa 2.4.2).
it('handles query options, duplicate adds, absent removes and filtered clear', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    send(f, '@setcam_fov:0.77=force,setcam_fovmin:0.9=n,setcam_fovmin:0.9=add,setcam_fovmin:0.8=rem')
    expect(f.avatar.viewer.restrictions.snapshot()).toHaveLength(1)
    send(f, '@setcam_fovmin:0.9=y,getcam_fov=22801,getcam_fov:bad=22801,getcam_fovmin:bad=22801,getcam_fovmax:bad=22801')
    expect(replies(f)).toEqual(profile === 'rlva' ? ['0.770', '', '', ''] : ['0.900000', '0.900000', '0.000001', '-0.000001'])
    send(f, '@setcam_fovmin:0.8=n,setcam_fovmax:1.1=n,clear=fovmin,getcam_fovmin=22801,getcam_fovmax=22801')
    expect(replies(f).slice(-2)).toEqual(profile === 'rlva' ? ['', '1.100'] : ['0.000001', '1.100000'])
    send(f, '@setcam_fovmin=n,getcam_fovmin=22801')
    expect(replies(f).at(-1)).toBe(profile === 'rlva' ? '' : '1.500000')
  }
})

it('releases collected emitters without depending on script lifetime', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    send(f, '@setcam_fovmin:1.2=n')
    f.script.reset()
    expect(getRlvFov(f.avatar)).toBeCloseTo(1.2)
    f.script.linkset.dead = true
    f.script.linkset.clock.advance(30000)
    expect(f.avatar.viewer.restrictions.snapshot()).toEqual([])
    expect(getRlvFov(f.avatar)).toBeCloseTo(profile === 'rlva' ? Math.PI / 3 : 1.2)
  }
})

// In-world: 1e-50 is rejected but 0e-50 clamps to 0.087; 0x1p-1 force/min
// -> 0.500; -inf max -> -inf and FOV 0.087; -nan force -> -nan
// (Aditi, SLua Tideland, 2026-11-01, Firestorm RLVa 2.4.2).
it('accepts hexadecimal float prefixes and signed non-finite spellings', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    send(f, '@setcam_fov:0x1p-1=force,getcam_fov=22801,setcam_fovmin:0x1p-1=n,getcam_fovmin=22801,clear')
    expect(replies(f)).toEqual(profile === 'rlva' ? ['0.500', '0.500'] : ['0.500000', '0.500000'])
    send(f, '@setcam_fovmax:-inf=n,getcam_fovmax=22801,clear,setcam_fov:-nan=force,getcam_fov=22801')
    expect(replies(f).slice(-2)).toEqual(['-inf', '-nan'])
    send(f, '@setcam_fov:0e-50=force,getcam_fov=22801')
    expect(replies(f).at(-1)).toBe(profile === 'rlva' ? '0.087' : '0.087266')
  }
})

// In-world: adding weaker min 0.8/max 1.2 behind min 0.9/max 1.1 leaves
// 0.900/1.100; removing stronger bounds reveals 0.800/1.200
// (Aditi, SLua Tideland, 2026-11-01, Firestorm RLVa 2.4.2).
it('keeps weaker modifiers available after strongest-rule removal', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    send(f, '@setcam_fovmin:0.9=n,setcam_fovmin:0.8=n,setcam_fovmax:1.1=n,setcam_fovmax:1.2=n,getcam_fovmin=22801,getcam_fovmax=22801')
    expect(replies(f)).toEqual(profile === 'rlva' ? ['0.900', '1.100'] : ['0.900000', '1.100000'])
    send(f, '@setcam_fovmin:0.9=y,setcam_fovmax:1.1=y,getcam_fovmin=22801,getcam_fovmax=22801')
    expect(replies(f).slice(-2)).toEqual(profile === 'rlva' ? ['0.800', '1.200'] : ['0.800000', '1.200000'])
  }
})

it('restores the default after an unpersisted force and keeps unsupported forms inspectable', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    changeRlvFov(f.avatar, 0.75)
    send(f, '@setcam_fov:0.8=force,setcam_fovmin:0.9=n,clear,getcam_fov=22801')
    expect(replies(f)).toEqual(profile === 'rlva' ? ['1.047'] : ['0.900000'])
    send(f, '@setcam_fov=22801,getcam_fov=force,setcam_fovmin:0.8=force,getcam_fovmin=-2')
    expect(f.avatar.viewer.commandLog.slice(-4).map(r => r.status)).toEqual(profile === 'rlva'
      ? ['unsupported', 'unsupported', 'unsupported', 'unsupported'] : ['unsupported', 'unsupported', 'unsupported', 'replied'])
  }
})

// In-world: force 0x1.8p-1 -> 0.750, min 0x.8p+1 -> 1.000, max 0x1.8p+0 -> 1.500
// (Aditi, SLua Tideland, 2026-11-01, Firestorm RLVa 2.4.2, API 3.4.3).
it('converts fractional hexadecimal angles without decimal reinterpretation', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    send(f, '@setcam_fov:0x1.8p-1=force,getcam_fov=22801,setcam_fovmin:0x.8p+1=n,getcam_fovmin=22801,setcam_fovmax:0x1.8p+0=n,getcam_fovmax=22801')
    expect(replies(f)).toEqual(profile === 'rlva' ? ['0.750', '1.000', '1.500'] : ['0.750000', '1.000000', '1.500000'])
  }
})

// In-world: forces 0.8125/1.0625/1.1875 -> 0.812/1.062/1.188; min 1.0625 -> 1.062,
// max 1.1875 -> 1.188, min -1.0625 -> -1.062; force 0.1328125 -> 0.133
// (Aditi, SLua Tideland, 2026-11-01, Firestorm RLVa 2.4.2, API 3.4.3).
it('rounds exact decimal half cases to the nearest even final digit', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    send(f, '@setcam_fov:0.8125=force,getcam_fov=22801,setcam_fov:1.0625=force,getcam_fov=22801,setcam_fov:1.1875=force,getcam_fov=22801,setcam_fov:0.1328125=force,getcam_fov=22801')
    expect(replies(f)).toEqual(profile === 'rlva' ? ['0.812', '1.062', '1.188', '0.133'] : ['0.812500', '1.062500', '1.187500', '0.132812'])
    send(f, '@setcam_fovmin:1.0625=n,getcam_fovmin=22801,setcam_fovmax:1.1875=n,getcam_fovmax=22801,clear,setcam_fovmin:-1.0625=n,getcam_fovmin=22801')
    expect(replies(f).slice(-3)).toEqual(profile === 'rlva' ? ['1.062', '1.188', '-1.062'] : ['1.062500', '1.187500', '-1.062500'])
  }
})

// In-world: max 1e30 -> 1000000015047466219876688855040.000; min -0 -> -0.000
// (Aditi, SLua Tideland, 2026-11-01, Firestorm RLVa 2.4.2, API 3.4.3).
it('preserves fixed decimal notation and negative zero', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    send(f, '@setcam_fovmax:1e30=n,getcam_fovmax=22801,clear,setcam_fovmin:-0=n,getcam_fovmin=22801')
    expect(replies(f)).toEqual(profile === 'rlva' ? ['1000000015047466219876688855040.000', '-0.000'] : ['-0.000001', '0.000001'])
  }
})

// User lens changes update CameraAngle without changing its persistence mode.
// RLVa saves pi/3 when a preceding force left that mode disabled.
it('preserves force-disabled persistence across a subsequent user lens change', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    changeRlvFov(f.avatar, 0.75)
    send(f, '@setcam_fov:0.8=force')
    expect(getRlvFov(f.avatar)).toBeCloseTo(0.8)
    changeRlvFov(f.avatar, 0.7)
    expect(getRlvFov(f.avatar)).toBeCloseTo(0.7)
    send(f, '@setcam_fovmin:0.9=n')
    expect(getRlvFov(f.avatar)).toBeCloseTo(0.9)
    send(f, '@setcam_fovmin:0.9=y,getcam_fov=22801')
    expect(replies(f)).toEqual(profile === 'rlva' ? ['1.047'] : ['0.900000'])
    expect(f.avatar.viewer.restrictions.snapshot()).toEqual([])
  }
})

it('treats a script-supplied FOV as a user lens change within active limits', async () => {
  const pair = await loadRlvPair({ source: `float fov; default {
    state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_TRACK_CAMERA); }
    touch_start(integer n) { llOwnerSay("@setcam_fovmax:1.1=n"); fov = llGetCameraFOV(); }
  }` })
  for (const f of Object.values(pair)) {
    f.script.start()
    f.script.grantPermissions(PERMISSION_TRACK_CAMERA)
    f.script.setCamera({ fov: 1.0 })
    expect(getRlvFov(f.avatar)).toBeCloseTo(1.0)
    f.script.fire('touch_start', { num_detected: 1 })
    expect(f.script.global('fov')).toBeCloseTo(1.0)
    f.script.setCamera({ fov: 1.4 })
    f.script.fire('touch_start', { num_detected: 1 })
    expect(f.script.global('fov')).toBeCloseTo(1.1)
  }
})
