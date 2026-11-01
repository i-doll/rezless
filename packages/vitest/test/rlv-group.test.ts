import { expect, it } from 'vitest'
import { getRlvCommands, loadLinkset, loadRlvPair, NULL_KEY, resetRlvViewerSession, setRlvViewerReady, World } from '../src/index.js'
import type { Script, WorldAvatar } from '@rezless/vm'

// Kokua RLV 2.09.35.00: RRInterface::force/handleCommand, LLGroupActions::activate.
// Firestorm RLVa 2.4.2: RlvForceHandler<RLV_BHVR_SETGROUP>, RlvHandler::checkActiveGroupThrottle/processReplyCommand.
const a = '00000000-0000-0000-0000-000000000001'
const b = '00000000-0000-0000-0000-000000000002'
const c = '00000000-0000-0000-0000-000000000003'
const source = `list replies; integer same; default {
  state_entry() { llListen(298,"",llGetOwner(),""); }
  link_message(integer s,integer n,string m,key id) { llOwnerSay(m); same = llSameGroup(llGetOwner()); }
  listen(integer c,string n,key id,string m) { replies += [m]; }
}`
const issue = (script: Script, str: string) => script.fire('link_message', { sender_num: 1, num: 0, str, id: NULL_KEY })
function seed(avatar: WorldAvatar) {
  avatar.groups.push({ key: a, name: 'Builders' }, { key: b, name: 'Builders North' }, { key: c, name: 'Builders South' })
}

it('queries none and the original group name, ignoring query options', async () => {
  for (const { script, avatar, userChangeGroup } of Object.values(await loadRlvPair({ source }))) {
    seed(avatar); script.start()
    issue(script, '@getgroup=298')
    expect(userChangeGroup(a)).toBe(true)
    issue(script, '@getgroup:ignored=298,getgroup=0')
    expect(script.global('replies')).toEqual(['none', 'Builders'])
    expect(avatar.group).toBe(a)
  }
})

it('matches full names in both profiles and UUIDs and prefixes only in RLVa', async () => {
  for (const [profile, { script, avatar, world }] of Object.entries(await loadRlvPair({ source }))) {
    seed(avatar); script.start()
    for (const option of ['BUILDERS', b.toUpperCase(), 'builders ', 'buil', 'missing', 'none', NULL_KEY]) {
      world.clock.advance(60001)
      issue(script, `@setgroup:${option}=force,getgroup=298`)
    }
    expect(script.global('replies')).toEqual(profile === 'rlv'
      ? ['Builders', 'Builders', 'Builders', 'Builders', 'Builders', 'none', 'none']
      : ['Builders', 'Builders North', 'Builders South', 'Builders South', 'Builders South', 'none', 'none'])
    expect(getRlvCommands('rlva', 'group')).toBe('setgroup;setgroup;getgroup')
  }
})

it('blocks user changes and distinguishes own force locks from other issuers', async () => {
  for (const [profile, { script, avatar, world }] of Object.entries(await loadRlvPair({ source }))) {
    seed(avatar); script.start()
    issue(script, '@setgroup=n,setgroup:builders=force,getgroup=298')
    expect(script.global('replies')).toEqual([profile === 'rlv' ? 'none' : 'Builders'])
    expect(world.userChangeAvatarGroup(avatar, b)).toBe(false)
    expect(avatar.viewer.restrictions.snapshot()[0]).toMatchObject({ behaviour: 'setgroup', support: 'enforced' })
    const other = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
      prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
    other.scripts.other!.start(); issue(other.scripts.other!, '@setgroup=n')
    world.clock.advance(60001)
    issue(script, '@setgroup:builders north=force,getgroup=298')
    expect((script.global('replies') as string[]).at(-1)).toBe(profile === 'rlv' ? 'none' : 'Builders')
    expect(avatar.viewer.commandLog.at(-2)).toMatchObject({ status: 'ignored', outcome: 'failed-lock' })
    issue(other.scripts.other!, '@clear')
    issue(script, '@setgroup=rem')
    expect(world.userChangeAvatarGroup(avatar, b)).toBe(true)
    issue(script, '@setgroup=add,clear')
    expect(world.userChangeAvatarGroup(avatar, NULL_KEY)).toBe(true)
    expect(world.userChangeAvatarGroup(avatar, 'not-a-member')).toBe(false)
  }
})

it('makes forced group changes visible to llSameGroup and sensor reads', async () => {
  for (const { script, avatar, world } of Object.values(await loadRlvPair({ source }))) {
    seed(avatar); world.sensorProperties.set(script.linkset, { group: a }); script.start()
    const scanner = await loadLinkset({ world, region: avatar.region, position: { x: 2, y: 0, z: 0 },
      prims: [{ scripts: [{ name: 'scan', source: { source: `list groups; default {
        link_message(integer s,integer n,string m,key id) { llSensor("", NULL_KEY, AGENT, 20, PI); }
        sensor(integer n) { groups += [llDetectedGroup(0)]; }
      }` } }] }] })
    world.sensorProperties.set(scanner.linkset, { group: a })
    const scan = scanner.scripts.scan!; scan.start()
    issue(script, '@setgroup:builders=force')
    expect(script.global('same')).toBe(1)
    issue(scan, 'scan')
    world.clock.advance(60001)
    issue(script, '@setgroup:none=force')
    expect(script.global('same')).toBe(0)
    issue(scan, 'scan')
    expect(scan.global('groups')).toEqual([1, 0])
    expect(avatar.group).toBe(NULL_KEY)
  }
})

it('throttles RLVa for sixty seconds and permits one early force by the lock owner', async () => {
  for (const [profile, { script, avatar, world }] of Object.entries(await loadRlvPair({ source }))) {
    seed(avatar); script.start()
    issue(script, '@setgroup:builders=force,setgroup:builders north=force')
    expect(avatar.group).toBe(profile === 'rlv' ? b : a)
    if (profile === 'rlva') expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ outcome: 'failed-throttled' })
    issue(script, '@setgroup=n,setgroup:builders south=force,setgroup:none=force')
    expect(avatar.group).toBe(profile === 'rlv' ? b : c)
    world.clock.advance(60001)
    issue(script, '@setgroup:none=force')
    expect(avatar.group).toBe(profile === 'rlv' ? b : NULL_KEY)
  }
})

it('rejects invalid RLVa options without consuming the throttle; Kokua misses are inert', async () => {
  for (const [profile, { script, avatar }] of Object.entries(await loadRlvPair({ source }))) {
    seed(avatar); script.start()
    for (const option of ['', 'missing', '00000000-0000-0000-0000-000000000099', 'builders;role;extra']) {
      issue(script, `@setgroup:${option}=force`)
      expect(avatar.group).toBe(NULL_KEY)
      expect(avatar.viewer.commandLog.at(-1)).toMatchObject(profile === 'rlva'
        ? { status: 'ignored', outcome: 'failed-option' } : { status: 'enforced' })
    }
    issue(script, '@setgroup:builders=force,getgroup=298')
    expect(script.global('replies')).toEqual(['Builders'])
    issue(script, '@setgroup:ignored=n')
    expect(avatar.viewer.restrictions.snapshot().filter(r => r.support === 'enforced')).toEqual([])
  }
})

it('supports RLVa role names with exact precedence and last prefix in UUID order', async () => {
  for (const [profile, { script, avatar, world }] of Object.entries(await loadRlvPair({ source }))) {
    avatar.groups.push({ key: a, name: 'Builders', roles: [{ key: c, name: 'Member South' }, { key: a, name: 'Member' }, { key: b, name: 'Member North' }] })
    script.start()
    for (const role of ['MEMBER', 'mem', 'missing']) {
      world.clock.advance(60001)
      issue(script, `@setgroup:builders;${role}=force`)
      expect(avatar.group).toBe(profile === 'rlva' ? a : NULL_KEY)
      expect(avatar.groups[0]!.activeRole).toBe(profile === 'rlva' ? role === 'MEMBER' ? a : c : undefined)
    }
  }
})

it('keeps disabled viewers inert while permitting explicit user group changes', async () => {
  const world = new World(); world.addRegion('test', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'off', region: 'test', group: a, groups: [{ key: a, name: 'Builders' }] })
  const loaded = await loadLinkset({ world, owner: avatar.key, region: 'test', prims: [{ scripts: [{ name: 'off', source: { source } }] }] })
  const script = loaded.scripts.off!; script.start()
  issue(script, '@setgroup=n,setgroup:none=force,getgroup=298')
  expect(avatar.group).toBe(a)
  expect(avatar.viewer.commandLog).toEqual([])
  expect(script.global('replies')).toEqual([])
  expect(world.userChangeAvatarGroup(avatar, NULL_KEY)).toBe(true)
})


it('clears session locks and throttling without restoring the active group', async () => {
  for (const { script, avatar } of Object.values(await loadRlvPair({ source }))) {
    seed(avatar); script.start()
    issue(script, '@setgroup:builders=force,setgroup=n')
    resetRlvViewerSession(avatar); setRlvViewerReady(avatar)
    issue(script, '@setgroup:builders north=force,getgroup=298')
    expect(avatar.group).toBe(b)
    expect(avatar.viewer.restrictions.snapshot()).toEqual([])
    expect(script.global('replies')).toEqual(['Builders North'])
  }
})

it('preserves fixture inputs and returns an empty name for an unknown active UUID', async () => {
  const world = new World(); world.addRegion('test', { x: 0, y: 0 })
  const groups = [{ key: a, name: 'Builders', roles: [{ key: b, name: 'Member' }] }]
  const avatar = world.addAvatar({ username: 'member', region: 'test', group: c, groups, viewer: { profile: 'rlva' } })
  const loaded = await loadLinkset({ world, owner: avatar.key, region: 'test', prims: [{ scripts: [{ name: 'group', source: { source } }] }] })
  const script = loaded.scripts.group!; script.start(); issue(script, '@getgroup=298,setgroup:builders;member=force')
  expect(script.global('replies')).toEqual([''])
  expect(avatar.groups[0]!.activeRole).toBe(b)
  expect(groups[0]).not.toHaveProperty('activeRole')
  expect(avatar.groups[0]!.roles![0]).not.toBe(groups[0]!.roles[0])
})

it('handles Kokua force prefixes and RLVa empty-prefix role selection', async () => {
  for (const [profile, { script, avatar, world }] of Object.entries(await loadRlvPair({ source }))) {
    avatar.groups.push({ key: a, name: 'Builders', roles: [{ key: a, name: 'Member' }, { key: c, name: 'Officer' }] })
    script.start(); issue(script, '@setgroup:#RLV/BUILDERS=force')
    expect(avatar.group).toBe(profile === 'rlv' ? a : NULL_KEY)
    world.clock.advance(60000)
    issue(script, '@setgroup:;=force')
    expect(avatar.group).toBe(a)
    expect(avatar.groups[0]!.activeRole).toBe(profile === 'rlva' ? c : undefined)
    world.clock.advance(60000)
    issue(script, '@setgroup:none;member=force')
    expect(avatar.group).toBe(profile === 'rlva' ? NULL_KEY : a)
  }
})


it('activates RLVa groups without role data while leaving an unavailable title unchanged', async () => {
  for (const [profile, { script, avatar }] of Object.entries(await loadRlvPair({ source }))) {
    seed(avatar); script.start(); issue(script, '@setgroup:builders;member=force')
    expect(avatar.group).toBe(profile === 'rlva' ? a : NULL_KEY)
    expect(avatar.groups[0]!.activeRole).toBeUndefined()
  }
})
