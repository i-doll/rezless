import { expect, it } from 'vitest'
import { loadLinkset, World, Experience, NULL_KEY, type ObjectInput } from '../src/index.js'

const OWNER = '11111111-1111-1111-1111-111111111111'

const PAYLOAD = `list got;
 default {
 on_rez(integer p) {
   got += [llAgentInExperience(llGetOwner())] + llGetExperienceDetails(NULL_KEY);
   llRequestExperiencePermissions(llGetOwner(), "");
   llReadKeyValue("missing");
 }
 experience_permissions(key a) { got += ["granted", a]; llAttachToAvatarTemp(ATTACH_RHAND); got += [llGetAttached()]; }
 experience_permissions_denied(key a, integer r) { got += ["denied", a, r]; llAttachToAvatarTemp(ATTACH_RHAND); got += [llGetPermissions(), llGetAttached()]; }
 dataserver(key q, string d) { got += [d]; }
 }`

async function rez(payload: ObjectInput, experience?: Experience) {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: OWNER, username: 'i.doll' })
  const { scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, position: { x: 100, y: 100, z: 30 },
    ...(experience ? { experience } : {}),
    prims: [{ objects: { payload }, scripts: [{ name: 'rezzer', source: { source:
      `default { state_entry() { llRezObject("payload", llGetPos(), ZERO_VECTOR, ZERO_ROTATION, 1); } }` } }] }] })
  scripts.rezzer!.start()
  const child = world.linksets[1]!.allScripts()[0]!
  return { child, rezzer: scripts.rezzer!, got: child.global('got'), debug: child.chat.filter(c => c.channel === 2147483647).map(c => c.text) }
}

const payload = (experience?: Experience, scriptExperience?: Experience): ObjectInput => ({
  ...(experience ? { experience } : {}),
  prims: [{ scripts: [{ name: 'payload', ...(scriptExperience ? { experience: scriptExperience } : {}), source: { source: PAYLOAD } }] }],
})

// https://wiki.secondlife.com/wiki/LlRequestExperiencePermissions
// https://wiki.secondlife.com/wiki/LlAttachToAvatarTemp
// Not measured: the granted path needs land that allows the experience, and the probe
// avatars own no land and no parcel within reach allows their experience.
it('gives the scripts of an object rezzed from inventory the experience set on the object', async () => {
  const xp = new Experience({ name: 'Quest', owner: OWNER, agents: [OWNER] })
  const { child, got } = await rez(payload(xp))
  expect(child.experience).toBe(xp)
  expect(got).toEqual([1, 'Quest', OWNER, xp.id, 0, 'no error', NULL_KEY, 'granted', OWNER, 6, '0,14'])
})

// In-world: a script compiled with i doll's "Fifth Column" experience, taken in its object and
// rezzed by llRezObject from a rezzer prim, read llAgentInExperience(owner) = 0 and
// llGetExperienceDetails(NULL_KEY) = [Fifth Column, <owner>, <id>, 17, "not allowed to run in
// current location", NULL_KEY]; llRequestExperiencePermissions -> experience_permissions_denied(owner, 17);
// llReadKeyValue of a missing key -> "0,14"; llAttachToAvatarTemp -> "Cannot find the agent to
// attach to." with permissions 0 and nothing attached (Aditi, SLua Tideland, 2026-11-24).
it('carries the experience into the rezzed copy where the land refuses it', async () => {
  const xp = new Experience({ name: 'Fifth Column', owner: OWNER, allowedHere: false, agents: [OWNER] })
  const { got, debug } = await rez(payload(xp))
  expect(got).toEqual([0, 'Fifth Column', OWNER, xp.id, 17, 'not allowed to run in current location', NULL_KEY,
    'denied', OWNER, 17, 0, 0, '0,14'])
  expect(debug).toEqual(['Cannot find the agent to attach to.'])
})

// In-world: the same script compiled without an experience, rezzed the same way, read 0 and [];
// its request was denied with 5, its read answered "0,5", and llAttachToAvatarTemp said "Cannot
// find the agent to attach to." (Aditi, SLua Tideland, 2026-11-24). The rezzer there had no
// experience; a script takes its experience from its own compile, so the rezzer's doesn't pass on
// (https://wiki.secondlife.com/wiki/LlRequestExperiencePermissions).
it('leaves an object without an experience refused, even when the rezzer has one', async () => {
  const rezzerXp = new Experience({ agents: [OWNER] })
  const { child, got, debug, rezzer } = await rez(payload(), rezzerXp)
  expect(rezzer.experience).toBe(rezzerXp)
  expect(child.experience).toBeNull()
  expect(got).toEqual([0, 'denied', OWNER, 5, 0, 0, '0,5'])
  expect(debug).toEqual(['Cannot find the agent to attach to.'])
})

it("keeps a script's own experience over the object's", async () => {
  const own = new Experience({ name: 'Own' })
  const { child } = await rez(payload(new Experience({ name: 'Object' }), own))
  expect(child.experience).toBe(own)
})

it('gives the experience to every prim of the object, SLua scripts too, but not to objects inside it', async () => {
  const xp = new Experience()
  const inner: ObjectInput = { prims: [{ scripts: [{ name: 'inner', source: { source: 'default { state_entry() {} }' } }] }] }
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  const { linkset } = await loadLinkset({ world, region: 'home', prims: [{ objects: { payload: { experience: xp, prims: [
    { objects: { inner }, scripts: [{ name: 'root', source: { source: 'default { state_entry() {} }' } }] },
    { scripts: [{ name: 'child', language: 'slua', source: { source: 'local x = 1' } }] },
  ] } } }] })
  const object = linkset.prims[0]!.inventory.find(item => item.name === 'payload')!.object!
  expect(object.allScripts().map(s => [s.scriptName, s.experience])).toEqual([['root', xp], ['child', xp]])
  const nested = object.prims[0]!.inventory.find(item => item.name === 'inner')!.object!
  expect(nested.allScripts()[0]!.experience).toBeNull()
})
