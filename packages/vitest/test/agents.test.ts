import { expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/llGetUsername
// https://wiki.secondlife.com/wiki/llName2Key
it('resolves a local avatar by key and case-insensitive legacy or username', async () => {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: '11111111-1111-1111-1111-111111111111', username: 'i.doll', name: 'i Doll' })
  const { scripts } = await loadLinkset({ world, region: 'home', prims: [{ scripts: [{ name: 'test', source: { source: `
    string username; key found;
    default { state_entry() { username = llGetUsername("11111111-1111-1111-1111-111111111111"); found = llName2Key("I DOLL"); } }
  ` } }] }] })
  scripts.test!.start()
  expect(scripts.test!.global('username')).toBe('i.doll')
  expect(scripts.test!.global('found')).toBe('11111111-1111-1111-1111-111111111111')
})

const OWNER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const GROUP = '33333333-3333-3333-3333-333333333333'
async function fixture(body: string, avatar = true) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addRegion('away', { x: 256, y: 0 })
  if (avatar) world.addAvatar({ region: 'home', key: OWNER, username: 'i.doll', name: 'i Doll',
    displayName: 'Iris', size: { x: 0.45, y: 0.6, z: 1.8 }, info: 6, language: 'en', group: GROUP,
    visualParams: { 33: 0.5, 80: 0 }, friends: [OTHER] })
  const { scripts, linkset } = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'test', source: { source: body } }] }] })
  return { script: scripts.test!, world, linkset }
}

// https://wiki.secondlife.com/wiki/llGetDisplayName
// https://wiki.secondlife.com/wiki/llGetAgentInfo
// https://wiki.secondlife.com/wiki/llGetAgentLanguage
// https://wiki.secondlife.com/wiki/llGetAgentSize
// In-world: basics.lsl, followup.lsl -> i.doll / Five / c, size <0.45,0.6,1.65382>;
// absent/NULL/malformed keys -> empty names/language, zero size/flags.
// Aditi, SLua Tideland, 2026-11-01. Probe sources and transcript: /tmp/issue-153-agents/.
it('reads configured avatar data and follows fixture changes between events', async () => {
  const { script, world } = await fixture(`string display; string language; vector size; integer info;
    default {state_entry(){display=llGetDisplayName(llGetOwner());language=llGetAgentLanguage(llGetOwner());size=llGetAgentSize(llGetOwner());info=llGetAgentInfo(llGetOwner());}
    touch_start(integer n){info=llGetAgentInfo(llGetOwner());}}`)
  script.start()
  expect(script.global('display')).toBe('Iris')
  expect(script.global('language')).toBe('en')
  const size = script.global('size') as { x: number; y: number; z: number }
  expect(size.x).toBeCloseTo(0.45)
  expect(size.y).toBeCloseTo(0.6)
  expect(size.z).toBeCloseTo(1.8)
  expect(script.global('info')).toBe(6)
  world.avatars[0]!.info = 305
  script.fire('touch_start', { num_detected: 1 })
  expect(script.global('info')).toBe(305)
})

it.each([OWNER, '00000000-0000-0000-0000-000000000000', 'bad'])('returns missing-avatar defaults for %s', async (key) => {
  const { script } = await fixture(`string username; string display; string language; vector size; integer info; list params;
    default {state_entry(){username=llGetUsername("${key}");display=llGetDisplayName("${key}");language=llGetAgentLanguage("${key}");size=llGetAgentSize("${key}");info=llGetAgentInfo("${key}");params=llGetVisualParams("${key}",[33]);}}`, false)
  script.start()
  for (const name of ['username', 'display', 'language']) expect(script.global(name)).toBe('')
  expect(script.global('size')).toEqual({ x: 0, y: 0, z: 0 })
  expect(script.global('info')).toBe(0)
  expect(script.global('params')).toEqual([])
})

it('keeps region-only avatar reads separate from global name requests', async () => {
  const { script, world } = await fixture(`key request; key local; string username; string answer;
    default {state_entry(){local=llName2Key("i Doll");username=llGetUsername(llGetOwner());request=llRequestUserKey("I.DOLL");}
    dataserver(key id,string data){if(id==request)answer=data;}}`)
  world.avatars[0]!.region = 'away'
  script.start()
  expect(script.global('local')).toBe('00000000-0000-0000-0000-000000000000')
  expect(script.global('username')).toBe('')
  expect(script.global('answer')).toBe(OWNER)
})

// In-world: basics.lsl, requests.lsl, normalization.lsl, separators.lsl -> case-insensitive
// names, surrounding whitespace and separators resolve; dotted suffixes are ignored.
// Aditi, SLua Tideland, 2026-11-01.
it.each(['i.doll', 'I.DOLL', 'i Doll', 'I DOLL', ' i.doll', 'i.doll ', 'i  Doll', 'i.Doll.Resident', 'i_Doll', 'i-Doll', 'i/doll', 'i,doll', 'i|doll', 'i._Doll', 'i__Doll'])('resolves name format %s', async (name) => {
  const { script } = await fixture(`key found; string answer; default {state_entry(){found=llName2Key("${name}");llRequestUserKey("${name}");}dataserver(key q,string data){answer=data;}}`)
  script.start()
  expect(script.global('found')).toBe(OWNER)
  expect(script.global('answer')).toBe(OWNER)
})

it.each(['i', 'i Resident', 'i.resident', 'i Doll extra', 'i..doll', '.i.doll', 'i Doll.', 'i.Doll_Resident', 'i.doll Resident', 'Five', '', 'rezless_absent_987654321'])('does not invent a name match for %s', async (name) => {
  const { script } = await fixture(`key found; string answer; default {state_entry(){found=llName2Key("${name}");llRequestUserKey("${name}");}dataserver(key q,string data){answer=data;}}`)
  script.start()
  expect(script.global('found')).toBe('00000000-0000-0000-0000-000000000000')
  expect(script.global('answer')).toBe('00000000-0000-0000-0000-000000000000')
})

it('resolves Resident names in short, dotted and legacy forms', async () => {
  // A second avatar with a Resident surname is needed to measure this success case.
  // https://wiki.secondlife.com/wiki/llName2Key
  const { script, world } = await fixture(`list found; default {state_entry(){found=[llName2Key("alice"),llName2Key("ALICE.RESIDENT"),llName2Key("Alice Resident")];}}`)
  world.addAvatar({ region: 'home', key: OTHER, username: 'alice' })
  script.start()
  expect(script.global('found')).toEqual([OTHER, OTHER, OTHER])
})

// https://wiki.secondlife.com/wiki/llGetVisualParams
// In-world: basics.lsl, edges.lsl -> floats for supported integer IDs or case-insensitive
// string names; unknown IDs, numeric strings, floats and keys -> empty strings.
// Aditi, SLua Tideland, 2026-11-01.
it('returns visual values in requested order and marks invalid parameters as strings', async () => {
  const { script } = await fixture(`list values; list types; default {state_entry(){values=llGetVisualParams(llGetOwner(),[33,"height",80,"bad",-1]);integer i;for(i=0;i<llGetListLength(values);++i)types+=[llGetListEntryType(values,i)];}}`)
  script.start()
  expect(script.global('values')).toEqual([0.5, 0.5, 0, '', ''])
  expect(script.global('types')).toEqual([2, 2, 2, 3, 3])
})

it('lists only avatars in the script region with key-typed entries', async () => {
  const { script, world } = await fixture(`list agents; integer type; default {state_entry(){agents=llGetAgentList(AGENT_LIST_REGION,[]);type=llGetListEntryType(agents,0);}}`)
  world.addAvatar({ region: 'away', key: OTHER, username: 'alice' })
  script.start()
  expect(script.global('agents')).toEqual([OWNER])
  expect(script.global('type')).toBe(4)
})

it('filters parcel and parcel-owner scopes by avatar position', async () => {
  // Multi-avatar filtering needs a second avatar for in-world comparison.
  // https://wiki.secondlife.com/wiki/llGetAgentList
  const { script, world } = await fixture(`list parcel;list owner;default {state_entry(){parcel=llGetAgentList(AGENT_LIST_PARCEL,[]);owner=llGetAgentList(AGENT_LIST_PARCEL_OWNER,[]);}}`)
  world.addParcel({ region: 'home', owner: OWNER, bounds: { min: { x: 0, y: 0 }, max: { x: 128, y: 256 } } })
  world.addParcel({ region: 'home', owner: OTHER, bounds: { min: { x: 128, y: 0 }, max: { x: 256, y: 256 } } })
  world.addAvatar({ region: 'home', key: OTHER, username: 'alice', position: { x: 140, y: 0, z: 0 } })
  script.start()
  expect(script.global('parcel')).toEqual([OWNER])
  expect(script.global('owner')).toEqual([OWNER])
})

// https://wiki.secondlife.com/wiki/llIsFriend
// https://wiki.secondlife.com/wiki/llSameGroup
// In-world: groups.lsl -> same/different active group = 1/0, direct group matches even
// after deactivation, NULL group matches only a groupless prim; own friendship = 0.
// Aditi, SLua Tideland, 2026-11-01. Positive friendship needs a second avatar.
it('is not its own friend and matches active groups', async () => {
  const { script, world, linkset } = await fixture(`integer self;integer friend;integer group;integer direct;default {state_entry(){self=llIsFriend(llGetOwner());friend=llIsFriend("${OTHER}");group=llSameGroup(llGetOwner());direct=llSameGroup("${GROUP}");}}`)
  world.sensorProperties.set(linkset, { group: GROUP })
  world.addAvatar({ region: 'home', key: OTHER, username: 'alice' })
  script.start()
  expect(script.global('self')).toBe(0)
  expect(script.global('friend')).toBe(1)
  expect(script.global('group')).toBe(1)
  expect(script.global('direct')).toBe(1)
})

it('broadcasts user-key dataserver answers to every script in the prim', async () => {
  // https://wiki.secondlife.com/wiki/dataserver
  // In-world: broadcast probe -> same query UUID and bare avatar UUID delivered to
  // requester and observer; edges.lsl -> missing name still returns a request UUID
  // and answers with the NULL_KEY string. Aditi, SLua Tideland, 2026-11-01.
  const world = new World(); world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: OWNER, username: 'i.doll' })
  const { scripts } = await loadLinkset({ world, region: 'home', prims: [{ scripts: [
    { name: 'requester', source: { source: 'key q; string answer; default {state_entry(){q=llRequestUserKey("i.doll");}dataserver(key id,string data){if(id==q)answer=data;}}' } },
    { name: 'listener', source: { source: 'string answer; default {dataserver(key id,string data){answer=data;}}' } },
  ] }] })
  scripts.listener!.start(); scripts.requester!.start()
  expect(scripts.requester!.global('answer')).toBe(OWNER)
  expect(scripts.listener!.global('answer')).toBe(OWNER)
  expect(scripts.requester!.dataserverRequests[0]).toMatchObject({ source: 'user_key', args: ['i.doll'], fulfilled: true })
})

it('returns false for an unknown friendship target and compares the null group directly', async () => {
  const { script } = await fixture(`integer friend; integer group; integer unknown; default {state_entry(){friend=llIsFriend("44444444-4444-4444-4444-444444444444");group=llSameGroup(NULL_KEY);unknown=llSameGroup("${OTHER}");}}`)
  script.start()
  expect(script.global('friend')).toBe(0)
  expect(script.global('group')).toBe(1)
  expect(script.global('unknown')).toBe(0)
})

// https://wiki.secondlife.com/wiki/llGetAgentList
// In-world: basics.lsl, edges.lsl -> INVALID_SCOPE takes precedence over
// INVALID_OPTIONS; valid 1/2/4 scopes return owner, nonempty options always error.
// Aditi, SLua Tideland, 2026-11-01.
it.each([0, 3, 5, 7, -1])('rejects scope %s before inspecting options', async (scope) => {
  const { script } = await fixture(`list result;integer type;default{state_entry(){result=llGetAgentList(${scope},[1]);type=llGetListEntryType(result,0);}}`)
  script.start()
  expect(script.global('result')).toEqual(['INVALID_SCOPE'])
  expect(script.global('type')).toBe(3)
})
it.each(['[1]', '["junk"]', '[1,2]'])('rejects nonempty options %s', async (options) => {
  const { script } = await fixture(`list result;default{state_entry(){result=llGetAgentList(AGENT_LIST_REGION,${options});}}`)
  script.start()
  expect(script.global('result')).toEqual(['INVALID_OPTIONS'])
})

it('distinguishes visual argument types and does not trim parameter names', async () => {
  const { script } = await fixture(`list values; default{state_entry(){values=llGetVisualParams(llGetOwner(),["HEIGHT"," height","height ","33",33.0,(key)"height",<0,0,0>]);}}`)
  script.start()
  expect(script.global('values')).toEqual([0.5, '', '', '', '', '', ''])
})

// In-world: states.lsl and anims2.lsl -> standing 6, sitting 54, hovering 263,
// type animation 518, away animation 70, busy animation 2054.
// Aditi, SLua Tideland, 2026-11-01. Fixtures set flags explicitly.
it.each([6, 54, 263, 518, 70, 2054])('reads agent flag mask %s without dropping bits', async (info) => {
  const { script, world } = await fixture('integer flags;default{state_entry(){flags=llGetAgentInfo(llGetOwner());}}')
  world.avatars[0]!.info = info
  script.start()
  expect(script.global('flags')).toBe(info)
})

it('keeps defaults useful without inventing language sharing or friends', async () => {
  const { script, world } = await fixture(`string name;string language;integer flags;vector size;list visual;default{state_entry(){name=llGetDisplayName("${OTHER}");language=llGetAgentLanguage("${OTHER}");flags=llGetAgentInfo("${OTHER}");size=llGetAgentSize("${OTHER}");visual=llGetVisualParams("${OTHER}",[33]);}}`, false)
  world.addAvatar({ region: 'home', key: OTHER, username: 'alice', name: 'Alice Resident' })
  script.start()
  expect(script.global('name')).toBe('Alice Resident')
  expect(script.global('language')).toBe('')
  expect(script.global('flags')).toBe(0)
  expect(script.global('visual')).toEqual([0])
  expect((script.global('size') as { z: number }).z).toBeCloseTo(1.9)
})

it('supports queries without a World and returns a dataserver miss', async () => {
  const { loadScript } = await import('../src/index.js')
  const script = await loadScript({ source: `list agents;integer same;key local;string answer;default{state_entry(){agents=llGetAgentList(AGENT_LIST_REGION,[]);same=llSameGroup(llGetKey());local=llName2Key("i.doll");llRequestUserKey("i.doll");}dataserver(key q,string d){answer=d;}}` })
  script.start()
  expect(script.global('agents')).toEqual([])
  expect(script.global('same')).toBe(1)
  expect(script.global('local')).toBe('00000000-0000-0000-0000-000000000000')
  expect(script.global('answer')).toBe('00000000-0000-0000-0000-000000000000')
})

it('caps regional lists at 100 agents', async () => {
  // The wiki specifies the cap; a 101-avatar test is unavailable here.
  const { script, world } = await fixture('integer count;default{state_entry(){count=llGetListLength(llGetAgentList(AGENT_LIST_REGION,[]));}}', false)
  for (let i = 0; i < 101; ++i) world.addAvatar({ region: 'home', username: `test${i}` })
  script.start()
  expect(script.global('count')).toBe(100)
})

it('includes disjoint same-owner parcels in owner scope but not parcel scope', async () => {
  const { script, world } = await fixture('list parcel;list owner;default{state_entry(){parcel=llGetAgentList(AGENT_LIST_PARCEL,[]);owner=llGetAgentList(AGENT_LIST_PARCEL_OWNER,[]);}}')
  world.addParcel({ region: 'home', owner: OWNER, bounds: { min: { x: 0, y: 0 }, max: { x: 128, y: 256 } } })
  world.addParcel({ region: 'home', owner: OWNER, bounds: { min: { x: 128, y: 0 }, max: { x: 256, y: 256 } } })
  world.addAvatar({ region: 'home', key: OTHER, username: 'alice', position: { x: 140, y: 0, z: 0 } })
  script.start()
  expect(script.global('parcel')).toEqual([OWNER])
  expect(script.global('owner')).toEqual([OWNER, OTHER])
})

it('uses virtual unowned land for parcel scopes when no parcels were added', async () => {
  const { script } = await fixture('list parcel;list owner;default{state_entry(){parcel=llGetAgentList(AGENT_LIST_PARCEL,[]);owner=llGetAgentList(AGENT_LIST_PARCEL_OWNER,[]);}}')
  script.start()
  expect(script.global('parcel')).toEqual([OWNER])
  expect(script.global('owner')).toEqual([OWNER])
})

// Positive friendship, foreign groups and region-presence combinations need a
// second avatar to measure. https://wiki.secondlife.com/wiki/llIsFriend
it.each(['owner', 'target', 'neither'])('requires a friend participant in the region: %s', async (present) => {
  const { script, world } = await fixture(`integer friend;default{state_entry(){friend=llIsFriend("${OTHER}");}}`)
  world.avatars[0]!.region = present === 'owner' ? 'home' : 'away'
  world.addAvatar({ region: present === 'target' ? 'home' : 'away', key: OTHER, username: 'alice' })
  script.start()
  expect(script.global('friend')).toBe(present === 'neither' ? 0 : 1)
})

it('recognizes friendship recorded on the target when the owner is not a fixture', async () => {
  const { script, world } = await fixture(`integer friend;default{state_entry(){friend=llIsFriend("${OTHER}");}}`, false)
  world.addAvatar({ region: 'home', key: OTHER, username: 'alice', friends: [OWNER] })
  script.start()
  expect(script.global('friend')).toBe(1)
})

it('compares same-group prims, World objects and the literal group key', async () => {
  const { script, world, linkset } = await fixture(`integer object;integer prim;integer direct;default{state_entry(){object=llSameGroup("${OTHER}");prim=llSameGroup(llGetKey());direct=llSameGroup("${GROUP}");}}`)
  world.sensorProperties.set(linkset, { group: GROUP })
  world.addObject({ region: 'home', key: OTHER, group: GROUP })
  script.start()
  expect(script.global('object')).toBe(1)
  expect(script.global('prim')).toBe(1)
  expect(script.global('direct')).toBe(1)
})

it('does not turn missing or out-of-region entities into group members', async () => {
  const { script, world, linkset } = await fixture(`integer avatar;integer object;integer null;default{state_entry(){avatar=llSameGroup("${OTHER}");object=llSameGroup("44444444-4444-4444-4444-444444444444");null=llSameGroup(NULL_KEY);}}`)
  world.sensorProperties.set(linkset, { group: GROUP })
  world.addAvatar({ region: 'away', key: OTHER, username: 'alice', group: GROUP })
  world.addObject({ region: 'away', key: '44444444-4444-4444-4444-444444444444', group: GROUP })
  script.start()
  expect(script.global('avatar')).toBe(0)
  expect(script.global('object')).toBe(0)
  expect(script.global('null')).toBe(0)
})

it('uses group membership for friendship when deeded to a group', async () => {
  const world = new World(); world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: OTHER, username: 'alice', group: GROUP })
  const { scripts, linkset } = await loadLinkset({ world, region: 'home', owner: GROUP, prims: [{ scripts: [{ name: 'test', source: { source: `integer friend;default{state_entry(){friend=llIsFriend("${OTHER}");}}` } }] }] })
  world.sensorProperties.set(linkset, { group: GROUP })
  scripts.test!.start()
  expect(scripts.test!.global('friend')).toBe(1)
})

// https://wiki.secondlife.com/wiki/llIsFriend
// Offline friendship needs a second avatar for in-world comparison.
it('recognizes a known friend who has no presence fixture when the owner is local', async () => {
  const { script } = await fixture(`integer friend;default{state_entry(){friend=llIsFriend("${OTHER}");}}`)
  script.start()
  expect(script.global('friend')).toBe(1)
})
