import { expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, PERMISSION_TRACK_CAMERA, AGENT_MOUSELOOK, getRlvCommandCoverage, getRlvCameraPosition, setRlvCameraPreset, World } from '../src/index.js'

// Kokua RLV 2.09.35.00: RRInterface::refresh, LLAgentCamera::unlockView.
// Firestorm RLVa 2.4.2: RlvBehaviourToggleHandler, RlvForceCamEyeFocusOffsetHandler,
// RlvBehaviourModifier::convertOptionValue, LLAgentCamera::calcCameraPositionTargetGlobal.
const source = `string command; vector position; rotation rotationRead; default {
  state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_TRACK_CAMERA); }
  touch_start(integer n) { llOwnerSay(command); position = llGetCameraPos(); rotationRead = llGetCameraRot(); }
}`
type Fixture = Awaited<ReturnType<typeof loadRlvPair>>['rlv']
const vec = (x: number, y: number, z: number) => ({ x, y, z })
function send(f: Fixture, command: string) {
  f.script.setGlobal('command', command); f.script.fire('touch_start', { num_detected: 1 })
}
async function setup() {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.script.start(); f.script.grantPermissions(PERMISSION_TRACK_CAMERA)
    f.script.setCamera({ pos: vec(10, 0, 0) })
  }
  return pair
}

it('locks the camera to the rear view with either unlock alias', async () => {
  for (const name of ['setcam_unlock', 'camunlock']) {
    const pair = await setup()
    for (const f of Object.values(pair)) {
      send(f, `@${name}=n`)
      expect(f.script.global('position')).toEqual(vec(-3, 0, 0.75))
      send(f, `@${name}=y`)
      // Unlocking permits camera changes; it does not undo the reset.
      expect(f.script.global('position')).toEqual(vec(-3, 0, 0.75))
      f.script.setCamera({ pos: vec(8, 0, 0) }); send(f, '@version=22921')
      expect(f.script.global('position')).toEqual(vec(8, 0, 0))
    }
  }
})

it('applies offset and scale restrictions only in RLVa and restores on clear', async () => {
  const pair = await setup()
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    send(f, '@setcam_eyeoffset:-4/2/1=n,setcam_eyeoffsetscale:2=n')
    expect(f.script.global('position')).toEqual(profile === 'rlva' ? vec(-8, 4, 2) : vec(10, 0, 0))
    send(f, '@clear')
    expect(f.script.global('position')).toEqual(profile === 'rlva' ? vec(-3, 0, 0.75) : vec(10, 0, 0))
  }
})

it('supports force offsets, resets, and rejects force changes while a preset restriction exists', async () => {
  const pair = await setup()
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    send(f, '@setcam_eyeoffset:-4/0/0=force,setcam_focusoffset:0/4/0=force')
    expect(f.script.global('position')).toEqual(profile === 'rlva' ? vec(-4, 0, 0) : vec(10, 0, 0))
    if (profile === 'rlva') expect(f.script.global('rotationRead')).toMatchObject({ z: expect.closeTo(Math.sin(Math.PI / 8)), s: expect.closeTo(Math.cos(Math.PI / 8)) })
    send(f, '@setcam_eyeoffsetscale:2=n,setcam_eyeoffset:-9/0/0=force')
    if (profile === 'rlva') expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'ignored', outcome: 'failed-camera-lock' })
    send(f, '@clear,setcam_eyeoffset=force,setcam_focusoffset=force,setcam_eyeoffsetscale=force')
    expect(f.script.global('position')).toEqual(profile === 'rlva' ? vec(-3, 0, 0.75) : vec(10, 0, 0))
  }
})

it('rejects nonempty RLVa focus restriction options but accepts the empty default', async () => {
  const pair = await setup()
  send(pair.rlva, '@setcam_focusoffset:0/2/0=n')
  expect(pair.rlva.avatar.viewer.restrictions.snapshot()).toEqual([])
  send(pair.rlva, '@setcam_focusoffset=n')
  expect(pair.rlva.avatar.viewer.restrictions.snapshot()).toMatchObject([{ support: 'enforced' }])
  expect(pair.rlva.script.global('position')).toEqual(vec(-3, 0, 0.75))
})

it('exits mouselook only in RLVa and leaves it off after removal', async () => {
  const pair = await setup()
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.avatar.info |= AGENT_MOUSELOOK
    send(f, '@setcam_mouselook=n')
    expect(!!(f.avatar.info & AGENT_MOUSELOOK)).toBe(profile === 'rlv')
    send(f, '@setcam_mouselook=y')
    expect(!!(f.avatar.info & AGENT_MOUSELOOK)).toBe(profile === 'rlv')
  }
})

it('grants one RLVa issuer exclusive control, filters bounds, and rejects competing force commands', async () => {
  const pair = await setup()
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    const loaded = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
    const other = loaded.scripts.other!; other.start()
    const emit = (command: string) => { other.setGlobal('command', command); other.fire('touch_start', { num_detected: 1 }) }
    emit('@setcam_avdistmax:1=n,setcam_fovmax:0.5=n')
    send(f, '@setcam=n,setcam_avdistmax:8=n,getcam_avdistmax=22921,getcam_fovmax=22921')
    const replies = f.avatar.viewer.commandLog.filter(r => r.status === 'replied').map(r => r.reply.text)
    expect(replies).toEqual(profile === 'rlva' ? ['8.000', ''] : ['1.000000', '0.500000'])
    emit('@setcam=n,setcam_fov:0.2=force,setcam_eyeoffset:-8/0/0=force')
    if (profile === 'rlva') expect(f.avatar.viewer.commandLog.slice(-3).map(r => r.outcome)).toEqual(['failed-camera-lock', 'failed-camera-lock', 'failed-camera-lock'])
    send(f, '@clear,getcam_avdistmax=22921')
    expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ reply: { text: profile === 'rlva' ? '1.000' : '1.000000' } })
  }
})

it('advertises the profile-specific command forms', () => {
  for (const name of ['setcam', 'setcam_mouselook', 'setcam_eyeoffset', 'setcam_eyeoffsetscale', 'setcam_focusoffset']) {
    expect(getRlvCommandCoverage('rlva').some(f => f.behaviour === name)).toBe(true)
    expect(getRlvCommandCoverage('rlv').some(f => f.behaviour === name)).toBe(false)
  }
})

it('uses explicit joint and preset inputs and rotates offsets with the avatar', async () => {
  const pair = await setup()
  for (const f of Object.values(pair)) {
    setRlvCameraPreset(f.avatar, { origin: vec(10, 20, 3), eye: vec(-2, 0, 0), focus: vec(0, 2, 0), scale: 2 })
    f.avatar.rotation = { x: 0, y: 0, z: Math.SQRT1_2, s: Math.SQRT1_2 }
    send(f, '@camunlock=n')
    expect(f.script.global('position')).toMatchObject({ x: expect.closeTo(10), y: expect.closeTo(16), z: 3 })
    expect(getRlvCameraPosition(f.avatar)).toEqual(f.script.global('position'))
    setRlvCameraPreset(f.avatar, {})
    send(f, '@version=22921')
    expect(f.script.global('position')).toMatchObject({ x: expect.closeTo(0), y: expect.closeTo(-3), z: expect.closeTo(0.75) })
  }
})

it('keeps camera tracking permission independent and shares the pose with HUD projection', async () => {
  const pair = await loadRlvPair({ source: `vector position; vector hud; default {
    state_entry() { llRequestPermissions(llGetOwner(), PERMISSION_TRACK_CAMERA); }
    touch_start(integer n) { llOwnerSay("@camunlock=n"); position = llGetCameraPos(); hud = llWorldPosToHUD(<1,0,1>); }
  }` })
  for (const f of Object.values(pair)) {
    f.script.linkset.attachToAvatar(f.avatar.key, 35)
    f.script.start(); f.script.fire('touch_start', { num_detected: 1 })
    expect(f.script.global('position')).toEqual(vec(0, 0, 0))
    expect(f.script.global('hud')).toEqual(vec(0, 0, 0))
    f.script.grantPermissions(PERMISSION_TRACK_CAMERA)
    f.script.fire('touch_start', { num_detected: 1 })
    expect(f.script.global('position')).toEqual(vec(-3, 0, 0.75))
    expect(f.script.global('hud')).toMatchObject({ x: 1, y: expect.closeTo(0), z: expect.closeTo(0) })
  }
})

for (const command of ['setcam:bad=n', 'camunlock:bad=n', 'setcam_mouselook:bad=n', 'setcam_eyeoffset:1/2=n', 'setcam_eyeoffset:1 /2/3=n', 'setcam_eyeoffsetscale:bad=n', 'setcam_focusoffset:1/2/3=n']) {
  it(`rejects invalid control option ${command}`, async () => {
    const pair = await setup()
    send(pair.rlva, '@' + command)
    expect(pair.rlva.avatar.viewer.restrictions.snapshot()).toEqual([])
    expect(pair.rlva.script.global('position')).toEqual(vec(10, 0, 0))
    expect(pair.rlva.avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'unsupported' })
  })
}

it('rejects malformed force options and accepts scanf vector suffixes', async () => {
  const pair = await setup()
  send(pair.rlva, '@setcam_eyeoffset:bad=force,setcam_eyeoffsetscale:bad=force,setcam_focusoffset:1/2=force')
  expect(pair.rlva.avatar.viewer.commandLog.slice(-3).map(r => r.outcome)).toEqual(['failed-option', 'failed-option', 'failed-option'])
  send(pair.rlva, '@setcam_eyeoffset:0x1p+2/ 2/3suffix=force')
  expect(pair.rlva.script.global('position')).toEqual(vec(4, 2, 3))
  send(pair.rlva, '@setcam_eyeoffsetscale:2suffix=force')
  expect(pair.rlva.script.global('position')).toEqual(vec(8, 4, 6))
})

it('releases the active preset on last restriction removal even after an earlier force', async () => {
  const pair = await setup()
  const f = pair.rlva
  send(f, '@setcam_eyeoffset:-4/0/0=force,setcam_eyeoffsetscale:2=n')
  expect(f.script.global('position')).toEqual(vec(-8, 0, 0))
  send(f, '@setcam_eyeoffsetscale:2=y')
  expect(f.script.global('position')).toEqual(vec(-3, 0, 0.75))
})

it('preserves offset restrictions across script resets and releases them on collection', async () => {
  const pair = await setup()
  const f = pair.rlva
  send(f, '@setcam_eyeoffset:-4/0/0=n')
  f.script.reset()
  expect(getRlvCameraPosition(f.avatar)).toEqual(vec(-4, 0, 0))
  f.script.linkset.dead = true; f.script.linkset.clock.advance(30000)
  expect(f.avatar.viewer.restrictions.snapshot()).toEqual([])
  expect(getRlvCameraPosition(f.avatar)).toEqual(vec(-3, 0, 0.75))
})

it('keeps disabled viewer controls inert', async () => {
  const world = new World(); world.addRegion('test', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'off', region: 'test' })
  const { scripts } = await loadLinkset({ world, region: 'test', owner: avatar.key,
    prims: [{ scripts: [{ name: 'test', source: { source } }] }] })
  const script = scripts.test!; script.start(); script.grantPermissions(PERMISSION_TRACK_CAMERA)
  script.setCamera({ pos: vec(8, 0, 0) })
  script.setGlobal('command', '@camunlock=n,setcam=n,setcam_eyeoffset:-4/0/0=force')
  script.fire('touch_start', { num_detected: 1 })
  expect(script.global('position')).toEqual(vec(8, 0, 0))
  expect(avatar.viewer.commandLog).toEqual([])
})

it('uses first-added unsorted offsets across issuers even during exclusive control', async () => {
  const pair = await setup()
  const f = pair.rlva
  const loaded = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
    prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
  const other = loaded.scripts.other!; other.start()
  other.setGlobal('command', '@setcam_eyeoffset:-5/0/0=n')
  other.fire('touch_start', { num_detected: 1 })
  send(f, '@setcam=n,setcam_eyeoffset:-2/0/0=n,setcam=n')
  expect(f.script.global('position')).toEqual(vec(-5, 0, 0))
  expect(f.avatar.viewer.commandLog.at(-1)).toMatchObject({ outcome: 'failed-camera-lock' })
  other.setGlobal('command', '@clear'); other.fire('touch_start', { num_detected: 1 })
  send(f, '@version=22921')
  expect(f.script.global('position')).toEqual(vec(-2, 0, 0))
  send(f, '@setcam_eyeoffset:-2/0/0=y')
  expect(f.script.global('position')).toEqual(vec(-3, 0, 0.75))
})

it('retains NaN offset modifiers after wire removal and can release their preset', async () => {
  for (const command of ['setcam_eyeoffset:nan/0/0', 'setcam_eyeoffsetscale:nan']) {
    const pair = await setup(); const f = pair.rlva
    send(f, `@${command}=n,${command}=y`)
    expect(f.avatar.viewer.restrictions.snapshot()).toEqual([])
    expect(Number.isNaN((f.script.global('position') as { x: number }).x)).toBe(true)
    send(f, '@setcam=n,setcam=y')
    expect(f.script.global('position')).toEqual(vec(-3, 0, 0.75))
  }
})

it('allows a new fixture pose after the final offset restriction releases its preset', async () => {
  const pair = await setup(); const f = pair.rlva
  send(f, '@setcam_eyeoffset:-4/0/0=force,setcam_eyeoffsetscale:2=n,clear')
  f.script.setCamera({ pos: vec(8, 2, 1) })
  send(f, '@version=22921')
  expect(f.script.global('position')).toEqual(vec(8, 2, 1))
})

it('applies distance clamping once after the preset pose, including contradictory bounds', async () => {
  const pair = await setup()
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    send(f, '@setcam_eyeoffset:-3/0/0=n,setcam_avdistmin:8=n,setcam_avdistmax:4=n')
    expect(f.script.global('position')).toEqual(profile === 'rlva' ? vec(-8, 0, 0) : vec(4, 0, 0))
    expect(getRlvCameraPosition(f.avatar)).toEqual(f.script.global('position'))
  }
})
