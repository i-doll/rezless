import { describe, expect, it } from 'vitest'
import { NULL_KEY } from '@rezless/vm'
import { loadRlvPair, loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Sitting
// https://wiki.secondlife.com/wiki/LlSitTarget
// In-world: seating/lock/distance probes -> standing null, linked root UUID,
// ground avatar UUID; nearby target/plain seats work, targeted seats work at
// 60 m, plain seats work at 8 m but fail at 8.5 m (surface geometry matters).
// Empty/null sit ground-sits. Own sit blocks object sit, own unsit blocks
// switching seats but permits force unsit, and foreign locks block force actions.
// Firestorm RLVa 2.4.2, viewer 7.2.5.81978, API 3.4.3
// (Aditi, SLua Tideland, 2026-11-01).
describe('paired viewer seating', () => {
  it('queries standing, seats without script permissions, then stands', async () => {
    const pair = await loadRlvPair({ source: `list replies; integer changes;
      default {
        state_entry() { llListen(225101,"",llGetOwner(),""); llOwnerSay("@getsitid=225101"); }
        touch_start(integer n) { llOwnerSay("@sit:"+(string)llGetKey()+"=force,getsitid=225101"); }
        link_message(integer s,integer n,string m,key id) { llOwnerSay("@unsit=force,getsitid=225101"); }
        changed(integer c) { if(c & CHANGED_LINK) ++changes; }
        listen(integer c,string n,key id,string m) { replies += [m]; }
      }` })
    for (const { world, avatar, script } of Object.values(pair)) {
      script.start()
      expect(script.global('replies')).toEqual([NULL_KEY])
      script.fire('touch_start', { num_detected: 1 })
      expect(avatar.sittingOn).toBe(script.host)
      expect(script.global('replies')).toEqual([NULL_KEY, script.host.key])
      expect(script.global('changes')).toBe(1)
      script.fire('link_message', { sender_num: 1, num: 0, str: '', id: NULL_KEY })
      expect(avatar.sittingOn).toBeNull()
      expect(script.global('replies')).toEqual([NULL_KEY, script.host.key, NULL_KEY])
      expect(script.global('changes')).toBe(2)
      expect(world.avatars).toHaveLength(1)
      expect(script.permissionRequests).toEqual([])
      expect(avatar.viewer.commandLog.filter(e => e.status === 'action').map(e => e.actionOutcome)).toEqual(['applied', 'applied'])
    }
  })
})

const controller = `list replies; integer changes; default {
  state_entry() { llListen(225101,"",llGetOwner(),""); }
  link_message(integer sender,integer num,string message,key id) { llOwnerSay(message); }
  changed(integer c) { if(c & CHANGED_LINK) ++changes; }
  listen(integer c,string n,key id,string m) { replies += [m]; }
}`
const issue = (script: import('@rezless/vm').Script, message: string) =>
  script.fire('link_message', { sender_num: 1, num: 0, str: message, id: NULL_KEY })

it('reports the linked root seat identity and uses configured targets', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const { script, world, avatar } of Object.values(pair)) {
    const seat = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
      prims: [{}, { scripts: [{ name: 'target', source: { source:
        'default { state_entry() { llSitTarget(<0,0,0.5>,ZERO_ROTATION); } }' } }] }] })
    seat.scripts.target!.start(); script.start()
    issue(script, '@sit:' + seat.prims[1]!.key + '=force,getsitid=225101')
    expect(avatar.sittingOn).toBe(seat.prims[1])
    expect(script.global('replies')).toEqual([seat.prims[0]!.key])
    expect(avatar.position.z).toBe(0.5)
    issue(script, '@unsit=force')
    issue(script, '@sit:' + seat.prims[0]!.key + '=force')
    expect(avatar.sittingOn?.key).toBe(seat.prims[1]!.key)
  }
})

it.each(['unknown', 'cross-region', 'attachment', 'occupied', 'removed'] as const)('refuses %s targets without changing the current seat', async kind => {
  const pair = await loadRlvPair({ source: controller })
  for (const { script, world, avatar } of Object.values(pair)) {
    world.addRegion('other', { x: 256, y: 0 })
    const seat = await loadLinkset({ world, region: kind === 'cross-region' ? 'other' : avatar.region,
      owner: avatar.key, prims: [{}] })
    if (kind === 'attachment') seat.linkset.attachToAvatar(avatar.key, 1)
    if (kind === 'occupied') {
      const other = world.addAvatar({ username: 'occupant', region: avatar.region })
      world.sitAvatar(other, seat.prims[0]!)
    }
    if (kind === 'removed') seat.linkset.dead = true
    world.sitAvatar(avatar, script.host)
    script.start()
    const target = kind === 'unknown' ? 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' : seat.prims[0]!.key
    issue(script, '@sit:' + target + '=force,getsitid=225101')
    expect(avatar.sittingOn).toBe(script.host)
    expect(script.global('replies')).toEqual([script.host.key])
    expect(avatar.viewer.commandLog.at(-2)).toMatchObject({ status: 'action', actionOutcome: 'refused' })
  }
})

it('keeps unsupported forms inspectable and disabled mode inert', async () => {
  const world = new World(); world.addRegion('off', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'off', region: 'off' })
  const loaded = await loadLinkset({ world, region: 'off', owner: avatar.key,
    prims: [{ scripts: [{ name: 'off', source: { source: controller } }] }] })
  const script = loaded.scripts.off!
  script.start()
  issue(script, '@sit:' + script.host.key + '=force,unsit=force,getsitid=225101')
  expect(avatar.sittingOn).toBeNull()
  expect(avatar.viewer.commandLog).toEqual([])
  expect(script.global('replies')).toEqual([])
  const pair = await loadRlvPair({ source: controller })
  for (const { script, avatar } of Object.values(pair)) {
    script.start()
    issue(script, '@sit:bad=force,getsitid=0,getsitid=force,unsit:bad=force')
    expect(avatar.sittingOn).toBeNull()
    expect(avatar.viewer.commandLog.every(entry => entry.status === 'unsupported')).toBe(true)
    expect(avatar.viewer.diagnostics).toHaveLength(4)
  }
})

it('has named null-UUID ground-sit expectations', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { script, avatar } = pair[profile]
    script.start()
    issue(script, '@sit:' + NULL_KEY + '=force,getsitid=225101')
    expect(avatar.sittingOn).toBeNull()
    expect(avatar.info & 16).toBe(profile === 'rlva' ? 16 : 0)
    expect(avatar.info & 32).toBe(0)
    expect(script.global('replies')).toEqual([profile === 'rlva' ? avatar.key : NULL_KEY])
    issue(script, '@unsit=force')
    expect(avatar.info & 16).toBe(0)
    expect(script.global('changes')).toBe(0)
  }
})

it('gates object force sit on sit and seated unsit locks, including its own locks', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const { script, avatar, world } of Object.values(pair)) {
    const other = await loadLinkset({ world, region: avatar.region, owner: avatar.key, prims: [{}] })
    script.start()
    issue(script, '@sit=n,sit:' + script.host.key + '=force')
    expect(avatar.sittingOn).toBeNull()
    issue(script, '@clear,sit:' + script.host.key + '=force,unsit=n,sit:' + other.prims[0]!.key + '=force')
    expect(avatar.sittingOn).toBe(script.host)
    expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'action', actionOutcome: 'refused', reason: 'restriction' })
    issue(script, '@clear,unsit=force,unsit=n,sit:' + other.prims[0]!.key + '=force')
    expect(avatar.sittingOn).toBe(other.prims[0])
  }
})

it('exempts only the issuing prim from RLVa forced unsit and ground-sit locks', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { script, avatar, world } = pair[profile]
    script.start()
    issue(script, '@sit:' + script.host.key + '=force,unsit=n,unsit=force')
    expect(avatar.sittingOn).toBe(profile === 'rlva' ? null : script.host)
    issue(script, '@clear,unsit=force,sit=n,sit:' + NULL_KEY + '=force')
    expect(avatar.info & 16).toBe(profile === 'rlva' ? 16 : 0)
    issue(script, '@clear,unsit=force,sit:' + script.host.key + '=force')
    const foreign = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
      prims: [{ scripts: [{ name: 'lock', source: { source: controller } }] }] })
    foreign.scripts.lock!.start()
    issue(foreign.scripts.lock!, '@unsit=n')
    issue(script, '@unsit=force')
    expect(avatar.sittingOn).toBe(script.host)
    issue(script, '@sit:' + NULL_KEY + '=force')
    expect(avatar.sittingOn).toBe(script.host)
    issue(foreign.scripts.lock!, '@clear,sit=n')
    issue(script, '@unsit=force,sit:' + script.host.key + '=force')
    expect(avatar.sittingOn).toBeNull()
    issue(script, '@sit:' + NULL_KEY + '=force')
    expect(avatar.info & 16).toBe(0)
  }
})

it('does not exempt a sibling prim in the same linkset from RLVa unsit locks', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const { script, avatar, world } of Object.values(pair)) {
    script.start()
    const linked = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
      prims: [
        { scripts: [{ name: 'locker', source: { source: controller } }] },
        { scripts: [{ name: 'forcer', source: { source: controller } }] },
      ] })
    linked.scripts.locker!.start(); linked.scripts.forcer!.start()
    issue(script, '@sit:' + script.host.key + '=force')
    issue(linked.scripts.locker!, '@unsit=n')
    issue(linked.scripts.forcer!, '@unsit=force')
    expect(avatar.sittingOn?.key).toBe(script.host.key)
    expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'action', actionOutcome: 'refused', reason: 'restriction' })
  }
})

it.each([
  { configured: true, distance: 60, supported: true },
  { configured: false, distance: 7, supported: true },
  { configured: false, distance: 60, supported: false },
])('handles $distance m seating with configured=$configured honestly', async ({ configured, distance, supported }) => {
  const pair = await loadRlvPair({ source: controller })
  for (const { script, avatar, world } of Object.values(pair)) {
    const seat = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
      position: { x: distance, y: 0, z: 0 }, prims: [{ scripts: [{ name: 'seat', source: { source:
        `default { state_entry() { ${configured ? 'llSitTarget(<0,0,0.5>,ZERO_ROTATION);' : ''} } }` } }] }] })
    seat.scripts.seat!.start(); script.start()
    issue(script, '@sit:' + seat.prims[0]!.key + '=force')
    expect(avatar.sittingOn?.key ?? NULL_KEY).toBe(supported ? seat.prims[0]!.key : NULL_KEY)
    expect(avatar.viewer.commandLog.at(-1)?.status).toBe(supported ? 'action' : 'unsupported')
    if (!supported) expect(avatar.viewer.diagnostics.at(-1)?.detail).toContain('surface placement')
  }
})

it('handles empty sit, ground/object transitions, repeated actions and removed seats', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const { script, avatar } = pair[profile]
    script.start()
    issue(script, '@unsit=force,sit=force')
    expect(avatar.viewer.commandLog[0]).toMatchObject({ status: 'action', actionOutcome: 'unchanged' })
    expect(avatar.info & 16).toBe(profile === 'rlva' ? 16 : 0)
    issue(script, '@sit=force')
    if (profile === 'rlva') expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ actionOutcome: 'unchanged', seat: avatar.key })
    issue(script, '@sit:' + script.host.key + '=force')
    issue(script, '@sit:' + script.host.key + '=force')
    expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ actionOutcome: 'unchanged', seat: script.host.key })
    expect(script.global('changes')).toBe(1)
    issue(script, '@sit=force,getsitid:ignored=225101')
    expect(script.global('replies')).toEqual([profile === 'rlva' ? avatar.key : script.host.key])
    expect(script.global('changes')).toBe(profile === 'rlva' ? 2 : 1)
    script.linkset.dead = true
    expect(avatar.sittingOn).toBeNull()
  }
})

it('discovers seating force and reply forms without duplicate force entries', async () => {
  const pair = await loadRlvPair({ source: `list replies; default {
    state_entry() { llListen(225101,"",llGetOwner(),"");
      llOwnerSay("@getcommand:sit;force=225101,getcommand:sit;reply=225101"); }
    listen(integer c,string n,key id,string m) { replies += [m]; }
  }` })
  pair.rlva.script.start(); pair.rlv.script.start()
  expect(pair.rlva.script.global('replies')).toEqual(['setenv_bluedensity;setenv_bluedensityb;setenv_bluedensityd;setenv_bluedensityg;setenv_bluedensityi;setenv_bluedensityr;setenv_bluedensityx;setenv_bluedensityy;setenv_clouddensity;setenv_densitymultiplier;setenv_hazedensity;setenv_sunmoonposition;sit;unsit'.slice(0, 1023), 'getenv_bluedensity;getenv_bluedensityb;getenv_bluedensityd;getenv_bluedensityg;getenv_bluedensityi;getenv_bluedensityr;getenv_bluedensityx;getenv_bluedensityy;getenv_clouddensity;getenv_densitymultiplier;getenv_hazedensity;getenv_sunmoonposition;getsitid'.slice(0, 1023)])
  expect(pair.rlv.script.global('replies')).toEqual([])
})

it('selects free configured targets and refuses an entirely occupied fixture', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const { script, world, avatar } of Object.values(pair)) {
    const seat = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
      prims: ['first', 'second'].map(name => ({ scripts: [{ name, source: { source:
        'default { state_entry() { llSitTarget(<0,0,0.5>,ZERO_ROTATION); } }' } }] })) })
    seat.scripts.first!.start(); seat.scripts.second!.start(); script.start()
    const first = world.addAvatar({ username: 'first occupant', region: avatar.region })
    const second = world.addAvatar({ username: 'second occupant', region: avatar.region })
    world.sitAvatar(first, seat.prims[0]!)
    issue(script, '@sit:' + seat.prims[0]!.key + '=force')
    expect(avatar.sittingOn?.key).toBe(seat.prims[1]!.key)
    issue(script, '@unsit=force')
    world.sitAvatar(second, seat.prims[1]!)
    issue(script, '@sit:' + seat.prims[0]!.key + '=force')
    expect(avatar.sittingOn).toBeNull()
    expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'action', actionOutcome: 'refused', reason: 'world-constraint' })
    expect(first.sittingOn?.key).toBe(seat.prims[0]!.key)
    expect(second.sittingOn?.key).toBe(seat.prims[1]!.key)
  }
})
