import { expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, PERMISSION_TRACK_CAMERA, AGENT_MOUSELOOK } from '../src/index.js'

const vec = (x: number, y: number, z: number) => ({ x, y, z })

// https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Camera
// Kokua RLV 2.09.35.00: RRInterface::updateCameraLimits/reallyHandleCommand.
// Firestorm RLVa 2.4.2: RlvBehaviourDictionary, RlvActions and LLAgentCamera::clampCameraPosition.
const source = `string command; vector position; default {
  state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_TRACK_CAMERA); }
  touch_start(integer n) { llOwnerSay(command); position = llGetCameraPos(); }
}`
type Fixture = Awaited<ReturnType<typeof loadRlvPair>>['rlv']
function send(f: Fixture, command: string) {
  f.script.setGlobal('command', command)
  f.script.fire('touch_start', { num_detected: 1 })
}
const replies = (f: Fixture) => f.avatar.viewer.commandLog.filter(r => r.status === 'replied').map(r => r.reply.text)

it('reports unset and aggregated avatar distance bounds by profile', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    send(f, '@getcam_avdistmin=22901,getcam_avdistmax=22901')
    expect(replies(f)).toEqual(profile === 'rlva' ? ['', ''] : ['-1000000.000000', '750000.000000'])
    send(f, '@camdistmin:2=n,setcam_avdistmin:3=n,camdistmax:9=n,setcam_avdistmax:8=n,getcam_avdistmin=22901,getcam_avdistmax=22901')
    expect(replies(f).slice(-2)).toEqual(profile === 'rlva' ? ['3.000', '8.000'] : ['3.000000', '8.000000'])
    send(f, '@setcam_avdistmin:3=y,getcam_avdistmin=22901,clear,getcam_avdistmax=22901')
    expect(replies(f).slice(-2)).toEqual(profile === 'rlva' ? ['2.000', ''] : ['2.000000', '750000.000000'])
  }
})

it('clamps permission-gated pose reads and keeps the current-distance query RLVa-only', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    f.script.setCamera({ pos: vec(10, 0, 0) })
    send(f, '@setcam_avdistmax:4=n,getcam_avdist=22901')
    expect(f.script.global('position')).toEqual(vec(0, 0, 0))
    f.script.grantPermissions(PERMISSION_TRACK_CAMERA)
    send(f, '@getcam_avdist=22901')
    expect(f.script.global('position')).toEqual(vec(4, 0, 0))
    expect(replies(f)).toEqual(profile === 'rlva' ? ['4.000', '4.000'] : [])
    send(f, '@clear,setcam_avdistmin:12=n')
    expect(f.script.global('position')).toEqual(vec(12, 0, 0))
    f.avatar.info |= AGENT_MOUSELOOK
    send(f, '@getcam_avdistmin=22901')
    expect(f.script.global('position')).toEqual(profile === 'rlva' ? vec(12, 0, 0) : vec(10, 0, 0))
  }
})

it('collapses contradictory Kokua bounds but preserves both RLVa modifiers', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start(); f.script.grantPermissions(PERMISSION_TRACK_CAMERA)
    f.script.setCamera({ pos: vec(1, 0, 0) })
    send(f, '@setcam_avdistmin:8=n,setcam_avdistmax:4=n,getcam_avdistmin=22901,getcam_avdistmax=22901')
    expect(replies(f)).toEqual(profile === 'rlva' ? ['8.000', '4.000'] : ['4.000000', '4.000000'])
    expect(f.script.global('position')).toEqual(vec(profile === 'rlva' ? 8 : 4, 0, 0))
  }
})

it('keeps zoom magnification distinct from distance and preserves the opposite alias directions', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    send(f, '@camzoommin:2=n,setcam_fov:0.2=force,getcam_fov=22901,getcam_zoommin=22901,getcam_zoommax=22901,getcam_zoom=22901')
    expect(replies(f)).toEqual(profile === 'rlva' ? ['0.524'] : ['0.200000', '2.000000', '1000000.000000', '5.235988'])
    send(f, '@clear,camzoommax:2=n,setcam_fov:1.5=force,getcam_fov=22901')
    expect(replies(f).at(-1)).toBe(profile === 'rlva' ? '0.524' : '1.500000')
  }
})

it('exposes RLVa-only origin and silhouette state without inventing extra queries', async () => {
  const { getRlvCameraLimits, setRlvCameraOrigins } = await import('../src/index.js')
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start(); f.script.grantPermissions(PERMISSION_TRACK_CAMERA)
    setRlvCameraOrigins(f.avatar, { avatar: vec(1, 0, 0), camera: vec(10, 0, 0) })
    f.script.setCamera({ pos: vec(20, 0, 0) })
    send(f, '@setcam_avdistmax:4=n,setcam_origindistmax:2=n,setcam_avdist:5=n')
    expect(f.script.global('position')).toEqual(vec(profile === 'rlva' ? 12 : 5, 0, 0))
    expect(getRlvCameraLimits(f.avatar)).toEqual({ avatar: [profile === 'rlva' ? undefined : -1000000, 4],
      origin: [undefined, profile === 'rlva' ? 2 : undefined], silhouetteDistance: profile === 'rlva' ? 5 : undefined })
    send(f, '@setcam_avdistmin:4=n')
    expect(f.script.global('position')).toEqual(vec(5, 0, 0))
    send(f, '@getcam_origindistmin=22901,getcam_origindistmax=22901')
    expect(replies(f)).toEqual([])
    expect(f.avatar.viewer.commandLog.slice(-2).map(r => r.status)).toEqual(['unsupported', 'unsupported'])
  }
})

it('retains weaker independent issuers and releases collected emitters', async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.script.start(); f.script.grantPermissions(PERMISSION_TRACK_CAMERA)
    f.script.setCamera({ pos: vec(10, 0, 0) })
    const other = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
    const script = other.scripts.other!; script.start()
    send(f, '@setcam_avdistmax:8=n')
    script.setGlobal('command', '@camdistmax:4=n'); script.fire('touch_start', { num_detected: 1 })
    send(f, '@getcam_avdistmax=22901')
    expect(f.script.global('position')).toEqual(vec(4, 0, 0))
    script.setGlobal('command', '@clear'); script.fire('touch_start', { num_detected: 1 })
    send(f, '@getcam_avdistmax=22901')
    expect(f.script.global('position')).toEqual(vec(8, 0, 0))
    f.script.reset()
    f.script.linkset.dead = true
    f.script.linkset.clock.advance(30000)
    const { getRlvCameraPosition } = await import('../src/index.js')
    expect(getRlvCameraPosition(f.avatar)).toEqual(vec(10, 0, 0))
  }
})

for (const option of ['', 'bad', '2.5suffix', '0', '-2', 'inf', 'nan', '1e40', '0x1p+2']) {
  it(`handles distance option [${option}] with profile parsing`, async () => {
    const pair = await loadRlvPair({ source })
    for (const profile of ['rlv', 'rlva'] as const) {
      const f = pair[profile]; f.script.start()
      send(f, `@setcam_avdistmax:${option}=n,getcam_avdistmax=22901`)
      const rejected = profile === 'rlva' && ['', 'bad', '1e40'].includes(option)
      expect(f.avatar.viewer.restrictions.snapshot()).toHaveLength(rejected ? 0 : 1)
      const expected = profile === 'rlva'
        ? rejected ? '' : ({ '2.5suffix': '2.500', '0': '0.000', '-2': '-2.000', inf: 'inf', nan: 'nan', '0x1p+2': '4.000' } as Record<string, string>)[option]
        : ({ '': '1.500000', bad: '0.000000', '2.5suffix': '2.500000', '0': '0.000000', '-2': '-2.000000', inf: '750000.000000', nan: '750000.000000', '1e40': '750000.000000', '0x1p+2': '4.000000' } as Record<string, string>)[option]
      expect(replies(f)).toEqual([expected])
      send(f, `@setcam_avdistmax:${option}=y,getcam_avdistmax=22901`)
      expect(replies(f).at(-1)).toBe(profile === 'rlva' ? option === 'nan' ? 'nan' : '' : '750000.000000')
    }
  })
}

it('rejects RLVa query options but Kokua ignores them and supports negative channels', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    send(f, '@setcam_avdistmin:2=n,getcam_avdistmin:bad=22901,getcam_avdistmin=-22901')
    expect(replies(f)).toEqual(profile === 'rlva' ? [''] : ['2.000000', '2.000000'])
    if (profile === 'rlva') expect(f.avatar.viewer.commandLog.at(-2)).toMatchObject({ outcome: 'failed-option' })
  }
})

it('does not apply a removed NaN modifier when only weaker distance rules remain', async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.script.start(); f.script.grantPermissions(PERMISSION_TRACK_CAMERA)
    f.script.setCamera({ pos: vec(10, 0, 0) })
    send(f, '@setcam_avdistmax:nan=n,setcam_avdistmax:nan=y,setcam_avdistmin:2=n')
    expect(f.script.global('position')).toEqual(vec(10, 0, 0))
    send(f, '@clear')
    expect(f.script.global('position')).toEqual(vec(10, 0, 0))
  }
})

it('discovers supported distance forms and keeps absent profile handlers inspectable', async () => {
  const { getRlvCommandCoverage } = await import('../src/index.js')
  const pair = await loadRlvPair({ source: `list replies; default {
    state_entry() { llListen(22901,"",llGetOwner(),""); llOwnerSay("@getcommand:avdist=22901"); }
    listen(integer c,string n,key id,string m) { replies += [m]; }
  }` })
  pair.rlva.script.start()
  expect(pair.rlva.script.global('replies')).toEqual(['setcam_avdist;setcam_avdistmax;setcam_avdistmin;getcam_avdist;getcam_avdistmax;getcam_avdistmin'])
  expect(getRlvCommandCoverage('rlv').find(f => f.behaviour === 'setcam_origindistmin')).toBeUndefined()
  expect(getRlvCommandCoverage('rlva').find(f => f.behaviour === 'setcam_avdist')).toMatchObject({ support: 'state-only' })
})

it('uses avatar bounds after removing the final origin rule even if its NaN modifier remains', async () => {
  const pair = await loadRlvPair({ source })
  const f = pair.rlva; f.script.start(); f.script.grantPermissions(PERMISSION_TRACK_CAMERA)
  f.script.setCamera({ pos: vec(10, 0, 0) })
  send(f, '@setcam_origindistmax:nan=n,setcam_origindistmax:nan=y,setcam_avdistmax:4=n')
  expect(f.script.global('position')).toEqual(vec(4, 0, 0))
})

it('reveals weaker distance and silhouette modifiers after removal', async () => {
  const { getRlvCameraLimits, setRlvCameraOrigins } = await import('../src/index.js')
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start(); f.script.grantPermissions(PERMISSION_TRACK_CAMERA)
    f.script.setCamera({ pos: vec(10, 0, 0) })
    setRlvCameraOrigins(f.avatar, {})
    send(f, '@setcam_avdistmin:3=n,setcam_avdistmin:2=n,setcam_avdistmax:6=n,setcam_avdistmax:8=n,setcam_avdist:5=n,setcam_avdist:4=n')
    send(f, '@getcam_avdist:bad=22901')
    expect(replies(f)).toEqual(profile === 'rlva' ? [''] : [])
    send(f, '@setcam_avdistmin:3=y,setcam_avdistmax:6=y,setcam_avdist:5=y,getcam_avdistmin=22901,getcam_avdistmax=22901')
    expect(replies(f).slice(-2)).toEqual(profile === 'rlva' ? ['2.000', '8.000'] : ['2.000000', '8.000000'])
    expect(getRlvCameraLimits(f.avatar).silhouetteDistance).toBe(profile === 'rlva' ? 4 : undefined)
    expect(f.script.global('position')).toEqual(vec(8, 0, 0))
    send(f, '@clear=avdist')
    expect(getRlvCameraLimits(f.avatar).silhouetteDistance).toBeUndefined()
  }
})

it('enforces origin minima and resets explicit origins to the fixture defaults', async () => {
  const { getRlvCameraPosition, setRlvCameraOrigins } = await import('../src/index.js')
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    f.script.setCamera({ pos: vec(12, 0, 0) })
    setRlvCameraOrigins(f.avatar, { camera: vec(10, 0, 0) })
    send(f, '@setcam_origindistmin:4=n')
    expect(getRlvCameraPosition(f.avatar)).toEqual(vec(profile === 'rlva' ? 14 : 12, 0, 0))
    send(f, '@clear,setcam_origindistmax:2=n')
    setRlvCameraOrigins(f.avatar, {})
    expect(getRlvCameraPosition(f.avatar)).toEqual(vec(12, 0, 0))
  }
})

it('keeps disabled camera state inert and isolates it from enabled viewers', async () => {
  const { World, getRlvCameraPosition, getRlvCameraLimits } = await import('../src/index.js')
  const world = new World(); world.addRegion('test', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'disabled', region: 'test' })
  const loaded = await loadLinkset({ world, region: 'test', owner: avatar.key,
    prims: [{ scripts: [{ name: 'probe', source: { source } }] }] })
  const script = loaded.scripts.probe!; script.start(); script.grantPermissions(PERMISSION_TRACK_CAMERA)
  script.setCamera({ pos: vec(10, 0, 0) })
  script.setGlobal('command', '@setcam_avdistmax:4=n'); script.fire('touch_start', { num_detected: 1 })
  expect(script.global('position')).toEqual(vec(10, 0, 0))
  expect(getRlvCameraLimits(avatar)).toEqual({ avatar: [undefined, undefined], origin: [undefined, undefined], silhouetteDistance: undefined })
  expect(getRlvCameraPosition(avatar, vec(7, 0, 0))).toEqual(vec(7, 0, 0))
  expect(avatar.viewer.commandLog).toEqual([])
})

it('does not restore the RLVa lens on removal of a deprecated zoom alias', async () => {
  const { changeRlvFov, getRlvFov } = await import('../src/index.js')
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    changeRlvFov(f.avatar, 0.75)
    send(f, '@camzoommin:2=n,setcam_fov:0.2=force,clear')
    expect(getRlvFov(f.avatar)).toBeCloseTo(profile === 'rlva' ? 0.5235988 : 0.2)
  }
})

it('uses seated camera offsets for viewer distance queries without tracking permission', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    f.script.setCamera({ pos: vec(70, 0, 0) })
    const seat = f.script.linkset.prims[0]!
    seat.params.position = vec(20, 0, 0)
    seat.cameraEyeOffset = vec(10, 0, 0)
    seat.cameraAtOffset = vec(0, 0, 0)
    expect(f.world.sitAvatar(f.avatar, seat)).toBe(true)
    send(f, '@getcam_avdist=22901')
    expect(f.script.global('position')).toEqual(vec(0, 0, 0))
    expect(replies(f)).toEqual(profile === 'rlva' ? ['10.000'] : [])
    f.script.grantPermissions(PERMISSION_TRACK_CAMERA)
    send(f, '@setcam_avdistmax:4=n,getcam_avdist=22901')
    expect(f.script.global('position')).toEqual(vec(24, 0, 0))
    expect(replies(f)).toEqual(profile === 'rlva' ? ['10.000', '4.000'] : [])
  }
})

// Firestorm RLVa 2.4.2: camzoom aliases increment the native FOV behavior
// counts. RlvBehaviourSetCamFovHandler saves only while both counts are zero.
it('keeps the RLVa baseline when a zoom alias precedes the first native FOV limit', async () => {
  const { changeRlvFov, getRlvFov } = await import('../src/index.js')
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    changeRlvFov(f.avatar, 0.75)
    send(f, '@camzoommin:2=n,setcam_fovmax:0.6=n,camzoommin:2=y,setcam_fovmax:0.6=y')
    expect(getRlvFov(f.avatar)).toBeCloseTo(profile === 'rlva' ? Math.PI / 3 : 0.5235988)
  }
})

// Both profiles scale the camera offset by minimum/distance. A coincident
// reference has no direction and produces non-finite coordinates.
it('preserves the profile clamp arithmetic for a coincident camera reference', async () => {
  const { getRlvCameraPosition } = await import('../src/index.js')
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.script.start(); f.script.grantPermissions(PERMISSION_TRACK_CAMERA)
    send(f, '@setcam_avdistmin:2=n')
    const position = f.script.global('position') as { x: number; y: number; z: number }
    expect(position.x).toBeNaN(); expect(position.y).toBeNaN(); expect(position.z).toBeNaN()
    send(f, '@clear,setcam_origindistmin:2=n')
    const originPosition = getRlvCameraPosition(f.avatar)
    if (f.avatar.viewer.profile === 'rlva') expect(originPosition.x).toBeNaN()
    else expect(originPosition).toEqual(vec(0, 0, 0))
  }
})
