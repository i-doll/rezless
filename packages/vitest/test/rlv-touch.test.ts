import { expect, it } from 'vitest'
import { loadLinkset, loadRlvPair, World } from '../src/index.js'

const controller = 'string command; default { touch_start(integer n) { llOwnerSay(command); } }'
const receiver = `list events; default {
  touch_start(integer n) { events += ["start", llDetectedKey(0), llDetectedLinkNumber(0), llDetectedTouchFace(0)]; }
  touch(integer n) { events += ["touch"]; }
  touch_end(integer n) { events += ["end"]; }
}`
type Fixture = Awaited<ReturnType<typeof loadRlvPair>>['rlv']
function restrict(f: Fixture, command: string) {
  f.script.setGlobal('command', command)
  f.script.fire('touch_start', { num_detected: 1 })
}
async function target(f: Fixture, kind: 'world' | 'self' | 'other' | 'hud' = 'world', distance = 2) {
  const owner = kind === 'other'
    ? f.world.addAvatar({ username: 'other', region: f.avatar.region }).key : f.avatar.key
  const loaded = await loadLinkset({ world: f.world, owner, region: f.avatar.region,
    prims: [{ scripts: [{ name: 'receiver', source: { source: receiver } }] }] })
  const prim = loaded.linkset.prims[0]!
  prim.params.position = { x: distance, y: 0, z: 0 }
  if (kind !== 'world') loaded.linkset.attachToAvatar(owner, kind === 'hud' ? 31 : 5)
  loaded.scripts.receiver!.start()
  return { ...loaded, prim }
}

it('delivers normal touch events with avatar identity, face, link and hold duration', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const f of Object.values(pair)) {
    f.script.start()
    const t = await target(f)
    const before = f.world.clock.now
    expect(f.world.attemptAvatarTouch(f.avatar, t.prim, { face: 3, hold: 250 })).toMatchObject({ status: 'touched', distance: 2, restrictions: [] })
    expect(t.scripts.receiver!.global('events')).toEqual(['start', f.avatar.key, 0, 3, 'touch', 'end'])
    expect(f.world.clock.now - before).toBe(250)
  }
})

for (const [name, command, distance, rlv, rlva] of [
  ['default boundary', '@fartouch=n', 1.5, true, true],
  ['beyond default', '@fartouch=n', 1.5001, false, false],
  ['alias boundary', '@touchfar:3=n', 3, true, true],
  ['minimum across aliases', '@fartouch:4=n,touchfar:2=n', 3, false, false],
  ['default participates in minimum', '@fartouch:4=n,touchfar=n', 2, false, false],
  ['removed option', '@fartouch:1=n,fartouch:1=y', 2, true, true],
  ['cleared alias', '@touchfar=n,clear=touchfar', 2, true, true],
  ['zero limit', '@fartouch:0=n', 0, true, true],
  ['negative limit', '@fartouch:-3=n', 2, false, true],
  ['numeric prefix', '@fartouch:3metres=n', 2, true, true],
  ['invalid numeric option', '@fartouch:invalid=n', 2, false, true],
] as const) it(`distance: ${name}`, async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start(); restrict(f, command)
    const t = await target(f, 'world', distance)
    const allowed = profile === 'rlv' ? rlv : rlva
    const result = f.world.attemptAvatarTouch(f.avatar, t.prim)
    expect(result.status, profile).toBe(allowed ? 'touched' : 'blocked')
    expect(t.scripts.receiver!.global('events')).toEqual(allowed ? ['start', f.avatar.key, 0, 0, 'touch', 'end'] : [])
  }
})

for (const kind of ['world', 'self', 'other', 'hud'] as const) for (const command of [
  'touchall', 'touchworld', 'touchattach', 'touchattachself', 'touchattachother', 'touchhud', 'fartouch',
]) it(`${command} on ${kind}`, async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start(); restrict(f, `@${command}=n`)
    const t = await target(f, kind)
    const blocked = command === 'touchall' ? kind !== 'hud'
      : command === 'touchworld' ? kind === 'world'
      : command === 'touchattach' ? kind === 'self' || kind === 'other'
      : command === 'touchattachself' ? kind === 'self'
      : command === 'touchattachother' ? kind === 'other'
      : command === 'touchhud' ? kind === 'hud'
      : kind === 'world' || profile === 'rlva' && kind === 'other'
    const result = f.world.attemptAvatarTouch(f.avatar, t.prim)
    expect(result.status, profile).toBe(blocked ? 'blocked' : 'touched')
    expect(result.reason).toBe(blocked ? command : undefined)
    expect(t.scripts.receiver!.global('events')).toEqual(blocked ? [] : ['start', f.avatar.key, 0, 0, 'touch', 'end'])
  }
})

for (const [kind, command, exception, rlv, rlva] of [
  ['world', 'touchworld', 'root', true, true],
  ['hud', 'touchhud', 'root', true, true],
  ['self', 'touchattach', 'root', false, true],
  ['self', 'touchattachself', 'attach-root', false, true],
  ['other', 'touchattachother', 'attach-root', false, true],
  ['other', 'touchattach', 'wearer', false, true],
  ['other', 'touchattachother', 'wearer', false, false],
] as const) it(`${command}: ${exception} exception on ${kind}`, async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    const t = await target(f, kind, 0)
    const family = exception.startsWith('attach-') ? 'touchattach' : command
    const id = exception === 'wearer' ? t.linkset.attachment!.avatar : t.prim.key
    restrict(f, `@${command}=n,${family}:${id}=add`)
    const allowed = profile === 'rlv' ? rlv : rlva
    expect(f.world.attemptAvatarTouch(f.avatar, t.prim).status, profile).toBe(allowed ? 'touched' : 'blocked')
  }
})

it('targets an avatar with touchattachother without requiring a global lock', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const f of Object.values(pair)) {
    f.script.start()
    const t = await target(f, 'other', 0)
    restrict(f, `@touchattachother:${t.linkset.attachment!.avatar}=n`)
    expect(f.world.attemptAvatarTouch(f.avatar, t.prim)).toMatchObject({ status: 'blocked', reason: 'touchattachother' })
    restrict(f, `@touchattach:${t.prim.key}=n`)
    expect(f.world.attemptAvatarTouch(f.avatar, t.prim).status).toBe('blocked')
  }
})

it('uses the clicked child position and root UUID for exceptions', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const f of Object.values(pair)) {
    f.script.start()
    const t = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{}, { scripts: [{ name: 'receiver', source: { source: receiver } }] }] })
    t.linkset.prims[0]!.params.position = { x: 100, y: 0, z: 0 }
    const child = t.linkset.prims[1]!
    child.params.position = { x: -99, y: 0, z: 0 }
    restrict(f, '@fartouch=n')
    expect(f.world.attemptAvatarTouch(f.avatar, child).status).toBe('touched')
    restrict(f, `@touchworld=n,touchworld:${child.key}=n`)
    expect(f.world.attemptAvatarTouch(f.avatar, child).status).toBe('blocked')
    restrict(f, `@touchworld:${t.linkset.prims[0]!.key}=n`)
    expect(f.world.attemptAvatarTouch(f.avatar, child).status).toBe('touched')
    expect(t.scripts.receiver!.global('events')).toEqual([
      'start', f.avatar.key, 2, 0, 'touch', 'end', 'start', f.avatar.key, 2, 0, 'touch', 'end',
    ])
  }
})

it('measures global distance to a picked point across region boundaries', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const f of Object.values(pair)) {
    f.script.start(); restrict(f, '@fartouch=n')
    f.world.addRegion('next', { x: 256, y: 0 })
    f.avatar.position = { x: 255, y: 0, z: 0 }
    const t = await loadLinkset({ world: f.world, region: 'next', owner: f.avatar.key, prims: [{}] })
    const prim = t.linkset.prims[0]!
    prim.params.position = { x: 1, y: 0, z: 0 }
    expect(f.world.attemptAvatarTouch(f.avatar, prim)).toMatchObject({ status: 'blocked', distance: 2 })
    expect(f.world.attemptAvatarTouch(f.avatar, prim, { offset: { x: -1, y: 0, z: 0 } })).toMatchObject({ status: 'touched', distance: 1 })
  }
})

it('keeps malformed and profile-specific forms inspectably unsupported', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start(); restrict(f, '@touchall:invalid=n,touchattachself:invalid=n,touchworld:invalid=n')
    expect(f.avatar.viewer.commandLog.map(r => r.status)).toEqual(['unsupported', 'unsupported', 'unsupported'])
    expect(f.avatar.viewer.restrictions.snapshot().length).toBe(profile === 'rlv' ? 3 : 0)
    const t = await target(f)
    expect(f.world.attemptAvatarTouch(f.avatar, t.prim).status).toBe('touched')
  }
})

it('rejects foreign avatars, dead targets and non-finite picked points without delivering events', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const f of Object.values(pair)) {
    const t = await target(f)
    const other = new World()
    other.addRegion(f.avatar.region, { x: 0, y: 0 })
    const foreign = other.addAvatar({ username: 'foreign', region: f.avatar.region })
    expect(f.world.attemptAvatarTouch(foreign, t.prim)).toMatchObject({ status: 'unsupported', reason: 'avatar' })
    expect(f.world.attemptAvatarTouch(f.avatar, t.prim, { offset: { x: NaN, y: 0, z: 0 } })).toMatchObject({ status: 'unsupported', reason: 'position' })
    t.linkset.dead = true
    expect(f.world.attemptAvatarTouch(f.avatar, t.prim)).toMatchObject({ status: 'unsupported', reason: 'target' })
    expect(t.scripts.receiver!.global('events')).toEqual([])
  }
})

for (const [option, rlv, rlva] of [
  ['inf', true, true], ['-inf', false, true], ['nan', true, false],
  ['1e999', true, true], ['1e-999', false, true],
] as const) it(`non-finite and range option ${option}`, async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start(); restrict(f, `@fartouch:${option}=n`)
    const t = await target(f)
    expect(f.touch(t.prim).status, profile).toBe((profile === 'rlv' ? rlv : rlva) ? 'touched' : 'blocked')
  }
})

it('keeps permission checks side-effect free and action snapshots immutable', async () => {
  const { checkAvatarTouch } = await import('../src/index.js')
  const pair = await loadRlvPair({ source: controller })
  for (const f of Object.values(pair)) {
    f.script.start()
    const t = await target(f)
    expect(checkAvatarTouch(f.world, f.avatar, t.prim).status).toBe('allowed')
    expect(t.scripts.receiver!.global('events')).toEqual([])
    expect(f.touchActions).toEqual([])
    const action = f.touch(t.prim)
    const snapshot = f.touchActions
    restrict(f, '@touchall=n')
    const denied = f.touch(t.prim)
    expect(denied).toMatchObject({ status: 'blocked', reason: 'touchall' })
    for (const value of [action, action.restrictions, snapshot, denied, denied.restrictions]) expect(Object.isFrozen(value)).toBe(true)
    expect(snapshot).toEqual([action])
    expect(f.touchActions).toEqual([action, denied])
    expect(t.scripts.receiver!.global('events')).toEqual(['start', f.avatar.key, 0, 0, 'touch', 'end'])
  }
})

for (const [name, command, rlv, rlva] of [
  ['permissive grant from another issuer', '@touchworld=n', true, true],
  ['permissive mode with another issuer grant', '@touchworld=n,permissive=n', false, true],
  ['secure lock with another issuer grant', '@touchworld_sec=n', false, true],
] as const) it(name, async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    const t = await target(f)
    restrict(f, command)
    const second = await loadLinkset({ world: f.world, owner: f.avatar.key, region: f.avatar.region,
      prims: [{ scripts: [{ name: 'controller', source: { source: controller } }] }] })
    const script = second.scripts.controller!
    script.start(); script.setGlobal('command', `@touchworld:${t.prim.key}=n`)
    script.fire('touch_start', { num_detected: 1 })
    expect(f.touch(t.prim).status, profile).toBe((profile === 'rlv' ? rlv : rlva) ? 'touched' : 'blocked')
    if (command.includes('_sec')) expect(f.avatar.viewer.commandLog[0]?.status).toBe(profile === 'rlv' ? 'applied' : 'unsupported')
  }
})

it('lets disabled viewers touch and rejects a prim from another world', async () => {
  const pair = await loadRlvPair({ source: controller })
  const f = pair.rlv
  const t = await target(f)
  const disabled = f.world.addAvatar({ username: 'disabled', region: f.avatar.region })
  expect(f.world.attemptAvatarTouch(disabled, t.prim).status).toBe('touched')
  expect(pair.rlva.world.attemptAvatarTouch(pair.rlva.avatar, t.prim)).toMatchObject({ status: 'unsupported', reason: 'target' })
})

it('preserves RLVa modifier insertion and NaN removal behavior between actions', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    const t = await target(f)
    restrict(f, '@fartouch:4=n,touchfar:nan=n,touchfar:nan=y')
    expect(f.touch(t.prim).status, profile).toBe(profile === 'rlv' ? 'touched' : 'blocked')
    restrict(f, '@fartouch:4=y')
    expect(f.touch(t.prim).status).toBe('touched')
  }
})

it('supplies the clicking avatar name and region position to detection', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const f of Object.values(pair)) {
    f.avatar.position = { x: 3, y: 4, z: 5 }
    const t = await loadLinkset({ world: f.world, owner: f.avatar.key, region: f.avatar.region,
      prims: [{ scripts: [{ name: 'detector', source: { source: `string name; vector pos; default {
        touch_start(integer n) { name = llDetectedName(0); pos = llDetectedPos(0); }
      }` } }] }] })
    f.touch(t.linkset.prims[0]!)
    expect(t.scripts.detector!.global('name')).toBe(f.avatar.name)
    expect(t.scripts.detector!.global('pos')).toEqual({ x: 3, y: 4, z: 5 })
  }
})

it('uses ownership for RLVa self attachment checks', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    const t = await target(f, 'other', 0)
    t.linkset.owner = f.avatar.key
    restrict(f, '@touchattachself=n')
    expect(f.touch(t.prim).status, profile).toBe(profile === 'rlva' ? 'blocked' : 'touched')
  }
})
