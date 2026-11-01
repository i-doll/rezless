import { expect, it } from 'vitest'
import { Experience, InventoryType, makeInventoryItem } from '@rezless/vm'
import { loadLinkset, World } from '../src/index.js'
const OWNER = '11111111-1111-1111-1111-111111111111'
// https://wiki.secondlife.com/wiki/llSitOnLink
// In-world: actions.lsl -> -1 without an experience for valid/invalid links and NULL_KEY.
// Aditi, SLua Tideland, 2026-11-01; sources/transcript in /tmp/issue-153-sit-probes/.
it('rejects forced sitting without an experience', async () => {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: OWNER, username: 'i.doll' })
  const { scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{ scripts: [{ name: 'test', source: { source: `integer result; default { state_entry() {result=llSitOnLink(llGetOwner(),1);} }` } }] }] })
  scripts.test!.start()
  expect(scripts.test!.global('result')).toBe(-1)
})

const OTHER = '22222222-2222-2222-2222-222222222222'
async function fixture(source: string, experience?: Experience) {
  const world = new World()
  world.addRegion('home', { x: 1024, y: 2048 })
  world.addRegion('away', { x: 1280, y: 2048 })
  const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'i.doll', info: 6, position: { x: 10, y: 20, z: 30 } })
  const { scripts, prims, linkset } = await loadLinkset({ world, region: 'home', owner: OWNER, position: { x: 10, y: 20, z: 30 },
    prims: [{ scripts: [{ name: 'test', ...(experience ? { experience } : {}), source: { source } }] }, {}] })
  return { script: scripts.test!, prims, linkset, world, avatar }
}
const xp = () => new Experience({ agents: [OWNER] })
const errors = (script: Awaited<ReturnType<typeof fixture>>['script']) => script.chat.filter(c => c.channel === 2147483647).map(c => c.text)
// https://wiki.secondlife.com/wiki/llSitOnLink
// Successful forced sitting needs an enabled experience on the parcel.
// In-world: xp.lsl compiled for Fifth Column -> permission denial 17, llSitOnLink -1.
// That experience is not allowed on this parcel. Success/failure codes behind this gate
// follow the wiki and need an experience-enabled parcel to measure.
it('seats an accepted experience avatar and exposes its target to scripts', async () => {
  const { script, avatar } = await fixture(`integer result;key sitter;integer info;integer changes;
    default {state_entry(){llSitTarget(<0,0,1>,ZERO_ROTATION);result=llSitOnLink(llGetOwner(),1);sitter=llAvatarOnSitTarget();info=llGetAgentInfo(llGetOwner());}
    changed(integer c){if(c&CHANGED_LINK)++changes;}}`, xp())
  script.start()
  expect(script.global('result')).toBe(1)
  expect(script.global('sitter')).toBe(OWNER)
  expect(script.global('info')).toBe(54)
  expect(script.global('changes')).toBe(1)
  expect(avatar.position.x).toBe(10)
})
it.each([
  { link: 99, accepted: true, target: true, result: -5 },
  { link: -1, accepted: true, target: true, result: -5 },
  { link: 1, accepted: false, target: true, result: -2 },
  { link: 1, accepted: true, target: false, result: -3 },
])('rejects invalid sit setup $result', async ({ link, accepted, target, result }) => {
  const { script } = await fixture(`integer result;default{state_entry(){${target ? 'llSitTarget(<0,0,1>,ZERO_ROTATION);' : ''}result=llSitOnLink(llGetOwner(),${link});}}`, new Experience({ agents: accepted ? [OWNER] : [] }))
  script.start()
  expect(script.global('result')).toBe(result)
})
// https://wiki.secondlife.com/wiki/llSetAgentRot
// In-world: actions.lsl / rotation.lsl -> no permission silently leaves rotation unchanged;
// permission 16 rotates standing yaw. Nonzero flags accepted; seated visual rotation
// stays at the sit target, and the requested yaw applies after standing. Aditi,
// SLua Tideland, 2026-11-01. Viewer smoothing and subsequent body yaw are not simulated.
it('requires animation permission before rotating a standing avatar', async () => {
  const { script, avatar } = await fixture(`default {state_entry(){llSetAgentRot(llEuler2Rot(<0,0,PI_BY_TWO>),0);}}`)
  script.start()
  expect(avatar.rotation).toEqual({ x: 0, y: 0, z: 0, s: 1 })
  expect(errors(script)).toEqual([])
})
it('rotates the permission agent around yaw', async () => {
  const { script, avatar } = await fixture(`default {state_entry(){llRequestPermissions(llGetOwner(),PERMISSION_TRIGGER_ANIMATION);}run_time_permissions(integer p){llSetAgentRot(llEuler2Rot(<0,0,PI_BY_TWO>),0);}}`)
  script.start(); script.grantPermissions()
  expect(avatar.rotation.x).toBe(0)
  expect(avatar.rotation.y).toBe(0)
  expect(avatar.rotation.z).toBeCloseTo(Math.SQRT1_2)
  expect(avatar.rotation.s).toBeCloseTo(Math.SQRT1_2)
})
// https://wiki.secondlife.com/wiki/llTeleportAgent
// In-world: actions.lsl / teleport.lsl -> both teleport functions require bit 4096,
// move locally and face the look-at position, and stand a sitter before teleporting.
// No forced delay; missing permission shouts the same error for both.
// Aditi, SLua Tideland, 2026-11-01.
// https://wiki.secondlife.com/wiki/llTeleportAgentGlobalCoords
it.each(['llTeleportAgent(llGetOwner(),"",<30,40,50>,<30,50,50>)',
  'llTeleportAgentGlobalCoords(llGetOwner(),<1024,2048,0>,<30,40,50>,<30,50,50>)'])('moves a permitted avatar and records %s', async call => {
  const { script, avatar } = await fixture(`default {state_entry(){llRequestPermissions(llGetOwner(),PERMISSION_TELEPORT);}run_time_permissions(integer p){${call};}}`)
  script.start(); script.grantPermissions()
  expect(avatar.position).toEqual({ x: 30, y: 40, z: 50 })
  expect(avatar.rotation.z).toBeCloseTo(Math.SQRT1_2)
  expect(script.teleportRequests).toEqual([expect.objectContaining({ agent: OWNER, accepted: true, position: { x: 30, y: 40, z: 50 }, lookAt: { x: 30, y: 50, z: 50 } })])
})
it.each(['llTeleportAgent(llGetOwner(),"",<30,40,50>,ZERO_VECTOR)',
  'llTeleportAgentGlobalCoords(llGetOwner(),<1024,2048,0>,<30,40,50>,ZERO_VECTOR)'])('rejects missing teleport permission for %s', async call => {
  const { script, avatar } = await fixture(`default {state_entry(){${call};}}`)
  script.start()
  expect(avatar.position).toEqual({ x: 10, y: 20, z: 30 })
  expect(errors(script)).not.toEqual([])
})
it('unsits an avatar on this object and fires a second link change', async () => {
  const { script } = await fixture(`integer changes;key sitter;
    default {state_entry(){llSitTarget(<0,0,1>,ZERO_ROTATION);llSitOnLink(llGetOwner(),1);}
    changed(integer c){if(c&CHANGED_LINK)++changes;}
    touch_start(integer n){llUnSit(llGetOwner());sitter=llAvatarOnSitTarget();}}`, xp())
  script.start(); script.fire('touch_start', { num_detected: 1 })
  expect(script.global('sitter')).toBe('00000000-0000-0000-0000-000000000000')
  expect(script.global('changes')).toBe(2)
})

it('rejects an absent agent in an otherwise accepted experience', async () => {
  const { script } = await fixture(`integer result;default{state_entry(){llSitTarget(<0,0,1>,ZERO_ROTATION);result=llSitOnLink("${OTHER}",1);}}`, new Experience({ agents: [OTHER] }))
  script.start()
  expect(script.global('result')).toBe(-4)
})
it('rejects an experience disabled at the script location', async () => {
  const { script } = await fixture(`integer result;default{state_entry(){result=llSitOnLink(llGetOwner(),1);}}`, new Experience({ agents: [OWNER], allowedHere: false }))
  script.start()
  expect(script.global('result')).toBe(-1)
})
it('finds an unoccupied target after the requested target', async () => {
  // A second avatar is needed to measure occupied-target fallback in-world.
  const { script, world, prims } = await fixture(`integer first;integer second;key root;key child;
    default{state_entry(){llSitTarget(<0,0,1>,ZERO_ROTATION);llLinkSitTarget(2,<0,0,2>,ZERO_ROTATION);
    first=llSitOnLink(llGetOwner(),1);second=llSitOnLink("${OTHER}",1);root=llAvatarOnSitTarget();child=llAvatarOnLinkSitTarget(2);}}`, new Experience({ agents: [OWNER, OTHER] }))
  world.addAvatar({ region: 'home', key: OTHER, username: 'other' })
  script.start()
  expect(script.global('first')).toBe(1)
  expect(script.global('second')).toBe(1)
  expect(script.global('root')).toBe(OWNER)
  expect(script.global('child')).toBe(OTHER)
  expect(world.avatars[1]!.sittingOn).toBe(prims[1])
})
it('rejects sitting when every sit target is occupied', async () => {
  // Requires a second avatar for in-world measurement.
  const { script, world } = await fixture(`integer result;default{state_entry(){llSitTarget(<0,0,1>,ZERO_ROTATION);llSitOnLink(llGetOwner(),1);result=llSitOnLink("${OTHER}",1);}}`, new Experience({ agents: [OWNER, OTHER] }))
  world.addAvatar({ region: 'home', key: OTHER, username: 'other' })
  script.start()
  expect(script.global('result')).toBe(-3)
})
it('ignores rotation while seated on a sit target', async () => {
  const { script, avatar } = await fixture(`default{state_entry(){llSitTarget(<0,0,1>,ZERO_ROTATION);llSitOnLink(llGetOwner(),1);llRequestPermissions(llGetOwner(),PERMISSION_TRIGGER_ANIMATION);}
    run_time_permissions(integer p){llSetAgentRot(llEuler2Rot(<0,0,PI_BY_TWO>),0);}}`, xp())
  script.start(); script.grantPermissions()
  expect(avatar.rotation).toEqual({ x: 0, y: 0, z: 0, s: 1 })
  expect(errors(script)).toEqual([])
})
it('stands and teleports a seated avatar', async () => {
  const { script, avatar } = await fixture(`default{state_entry(){llSitTarget(<0,0,1>,ZERO_ROTATION);llSitOnLink(llGetOwner(),1);llRequestPermissions(llGetOwner(),PERMISSION_TELEPORT);}
    run_time_permissions(integer p){llTeleportAgent(llGetOwner(),"",<30,40,50>,ZERO_VECTOR);}}`, xp())
  script.start(); script.grantPermissions()
  expect(avatar.sittingOn).toBe(null)
  expect(avatar.position).toEqual({ x: 30, y: 40, z: 50 })
  expect(script.teleportRequests).toEqual([expect.objectContaining({ accepted: true })])
})
it('treats a nonexistent landmark as an error rather than a region name', async () => {
  const { script, avatar } = await fixture(`default{state_entry(){llRequestPermissions(llGetOwner(),PERMISSION_TELEPORT);}run_time_permissions(integer p){llTeleportAgent(llGetOwner(),"bad region name",<30,40,50>,ZERO_VECTOR);}}`)
  script.start(); script.grantPermissions()
  expect(avatar.position).toEqual({ x: 10, y: 20, z: 30 })
  expect(errors(script)).not.toEqual([])
})
it('does not use permission granted by a different avatar', async () => {
  // Permission-key mismatch needs a second avatar in-world.
  const { script, avatar } = await fixture(`default{state_entry(){llRequestPermissions("${OTHER}",PERMISSION_TELEPORT);}run_time_permissions(integer p){llTeleportAgent(llGetOwner(),"",<30,40,50>,ZERO_VECTOR);}}`)
  script.start(); script.grantPermissions()
  expect(avatar.position).toEqual({ x: 10, y: 20, z: 30 })
  expect(script.teleportRequests).toEqual([expect.objectContaining({ accepted: false })])
})
it('keeps teleport home subject to land ownership, with its five second delay', async () => {
  // In-world: actions.lsl -> llTeleportAgentHome(NULL_KEY) silently sleeps 5.000209 s.
  // Aditi, SLua Tideland, 2026-11-01. Never probe i Doll's home destination.
  // Owner-land success follows the wiki and uses a supplied virtual home fixture.
  // https://wiki.secondlife.com/wiki/llTeleportAgentHome
  const { script, avatar, world } = await fixture(`integer done;default{state_entry(){llTeleportAgentHome(llGetOwner());done=1;}}`)
  world.addParcel({ region: 'home', owner: OTHER })
  script.start()
  expect(script.now).toBe(5000)
  expect(script.global('done')).toBe(1)
  expect(avatar.position).toEqual({ x: 10, y: 20, z: 30 })
  expect(script.teleportRequests).toEqual([expect.objectContaining({ kind: 'home', agent: OWNER, accepted: false })])
})

it('applies a seated rotation request when standing without losing permissions', async () => {
  // In-world: rotation.lsl -> seated target stays at identity; after llUnSit the
  // requested negative yaw appears, permissions remain 4112. Aditi, SLua Tideland, 2026-11-01.
  const { script, avatar } = await fixture(`integer permissions;
    default{state_entry(){llSitTarget(<0,0,1>,ZERO_ROTATION);llSitOnLink(llGetOwner(),1);llRequestPermissions(llGetOwner(),PERMISSION_TRIGGER_ANIMATION);}
    run_time_permissions(integer p){llSetAgentRot(llEuler2Rot(<0,0,-1>),99);}
    touch_start(integer n){llUnSit(llGetOwner());permissions=llGetPermissions();}}`, xp())
  script.start(); script.grantPermissions()
  expect(avatar.rotation).toEqual({ x: 0, y: 0, z: 0, s: 1 })
  script.fire('touch_start', { num_detected: 1 })
  expect(avatar.rotation.z).toBeCloseTo(-0.47942554)
  expect(avatar.rotation.s).toBeCloseTo(0.87758256)
  expect(script.global('permissions')).toBe(16)
})
it('makes a viewer sit visible to both root and child scripts', async () => {
  // In-world: xp.lsl with a normal viewer sit on the child -> root NULL_KEY,
  // child owner UUID, then llUnSit clears both. Aditi, SLua Tideland, 2026-11-01.
  const { script, world, avatar, prims, linkset } = await fixture(`key root;key child;integer changes;
    default{state_entry(){llSitTarget(<0,0,1>,ZERO_ROTATION);llLinkSitTarget(2,<0,0,1>,ZERO_ROTATION);}
    changed(integer c){if(c&CHANGED_LINK){++changes;root=llAvatarOnSitTarget();child=llAvatarOnLinkSitTarget(2);}}
    touch_start(integer n){llUnSit(llGetOwner());}}`)
  script.start()
  expect(world.sitAvatar(avatar, prims[1]!)).toBe(true)
  linkset.advanceTime(0)
  expect(script.global('root')).toBe('00000000-0000-0000-0000-000000000000')
  expect(script.global('child')).toBe(OWNER)
  expect(script.global('changes')).toBe(1)
  script.fire('touch_start', { num_detected: 1 })
  expect(script.global('child')).toBe('00000000-0000-0000-0000-000000000000')
  expect(script.global('changes')).toBe(2)
})
it('returns NULL_KEY for disabled and invalid sit targets', async () => {
  const { script, world, avatar, prims } = await fixture(`list found;default{touch_start(integer n){found=[llAvatarOnSitTarget(),llAvatarOnLinkSitTarget(99),llAvatarOnLinkSitTarget(LINK_SET),llAvatarOnLinkSitTarget(LINK_THIS)];}}`)
  script.start(); world.sitAvatar(avatar, prims[0]!)
  script.fire('touch_start', { num_detected: 1 })
  expect(script.global('found')).toEqual(Array(4).fill('00000000-0000-0000-0000-000000000000'))
})
it('uses the script prim for LINK_THIS in a child script', async () => {
  // Experience seating success needs a parcel that enables the experience.
  const world = new World(); world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: OWNER, username: 'i.doll' })
  const { scripts, prims } = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [{}, { scripts: [{ name: 'child', experience: xp(), source: { source: `integer result;key sitter;default{state_entry(){llSitTarget(<0,0,1>,ZERO_ROTATION);result=llSitOnLink(llGetOwner(),LINK_THIS);sitter=llAvatarOnLinkSitTarget(LINK_THIS);}}` } }] }] })
  scripts.child!.start()
  expect(scripts.child!.global('result')).toBe(1)
  expect(scripts.child!.global('sitter')).toBe(OWNER)
  expect(world.avatars[0]!.sittingOn).toBe(prims[1])
})
it('moves between regions using global coordinates and a look-at direction', async () => {
  // Cross-region success cannot be measured while all teleports must stay in Tideland.
  // https://wiki.secondlife.com/wiki/llTeleportAgentGlobalCoords
  const { script, avatar } = await fixture(`default{state_entry(){llRequestPermissions(llGetOwner(),PERMISSION_TELEPORT);}run_time_permissions(integer p){llTeleportAgentGlobalCoords(llGetOwner(),<1280,2048,99>,<30,40,50>,<0,-1,0>);}}`)
  script.start(); script.grantPermissions()
  expect(avatar.region).toBe('away')
  expect(avatar.position).toEqual({ x: 30, y: 40, z: 50 })
  expect(avatar.rotation.z).toBeCloseTo(-Math.SQRT1_2)
})
it('rejects an unknown global destination without moving the avatar', async () => {
  const { script, avatar } = await fixture(`default{state_entry(){llRequestPermissions(llGetOwner(),PERMISSION_TELEPORT);}run_time_permissions(integer p){llTeleportAgentGlobalCoords(llGetOwner(),<9000,9000,0>,<30,40,50>,ZERO_VECTOR);}}`)
  script.start(); script.grantPermissions()
  expect(avatar.position).toEqual({ x: 10, y: 20, z: 30 })
  expect(script.teleportRequests).toEqual([expect.objectContaining({ accepted: false })])
})
it('allows an accepted experience to teleport another avatar without a runtime permission request', async () => {
  // Requires a second avatar and an experience-enabled parcel to measure in-world.
  const { script, world } = await fixture(`default{state_entry(){llTeleportAgent("${OTHER}","",<30,40,50>,<40,40,50>);}}`, new Experience({ agents: [OTHER] }))
  const other = world.addAvatar({ region: 'home', key: OTHER, username: 'other' })
  script.start()
  expect(other.position).toEqual({ x: 30, y: 40, z: 50 })
  expect(script.teleportRequests).toEqual([expect.objectContaining({ agent: OTHER, accepted: true })])
})
it('does not treat ordinary foreign-avatar permission as an experience grant', async () => {
  // Requires a second avatar for in-world measurement.
  const { script, world } = await fixture(`default{state_entry(){llRequestPermissions("${OTHER}",PERMISSION_TELEPORT);}run_time_permissions(integer p){llTeleportAgent("${OTHER}","",<30,40,50>,ZERO_VECTOR);}}`)
  const other = world.addAvatar({ region: 'home', key: OTHER, username: 'other' })
  script.start(); script.grantPermissions()
  expect(other.position).toEqual({ x: 0, y: 0, z: 0 })
  expect(errors(script)).toEqual(['Script trying to teleport agent without current permission!'])
})
it('ignores teleport attempts for a permission agent outside the source region', async () => {
  // A second avatar is needed to hold permission while leaving the region in-world.
  const { script, avatar } = await fixture(`default{state_entry(){llRequestPermissions(llGetOwner(),PERMISSION_TELEPORT);}run_time_permissions(integer p){llTeleportAgent(llGetOwner(),"",<30,40,50>,ZERO_VECTOR);}}`)
  script.start(); avatar.region = 'away'; script.grantPermissions()
  expect(avatar.position).toEqual({ x: 10, y: 20, z: 30 })
  expect(script.teleportRequests).toEqual([expect.objectContaining({ accepted: false })])
})
it('teleports home only to an explicitly supplied virtual destination', async () => {
  // Real home teleport deliberately not measured: i Doll must stay in Tideland.
  const { script, avatar, world } = await fixture(`default{state_entry(){llTeleportAgentHome(llGetOwner());}}`)
  world.addParcel({ region: 'home', owner: OWNER })
  avatar.home = { region: 'away', position: { x: 4, y: 5, z: 6 } }
  script.start()
  expect(avatar.region).toBe('away')
  expect(avatar.position).toEqual({ x: 4, y: 5, z: 6 })
  expect(script.now).toBe(5000)
})
it('records an authorized home request when the fixture supplies no home', async () => {
  const { script, avatar, world } = await fixture(`default{state_entry(){llTeleportAgentHome(llGetOwner());}}`)
  world.addParcel({ region: 'home', owner: OWNER })
  script.start()
  expect(avatar.position).toEqual({ x: 10, y: 20, z: 30 })
  expect(script.teleportRequests).toEqual([{ kind: 'home', agent: OWNER, time: 0, accepted: true }])
})
it('does nothing for a standing avatar, NULL_KEY and missing agents', async () => {
  // In-world: actions.lsl -> llUnSit on a non-sitter is silent, no forced delay.
  const { script, avatar } = await fixture(`integer changes;default{state_entry(){llUnSit(llGetOwner());llUnSit(NULL_KEY);llUnSit("${OTHER}");}changed(integer c){++changes;}}`)
  script.start()
  expect(avatar.info).toBe(6)
  expect(script.global('changes')).toBe(0)
  expect(script.now).toBe(0)
  expect(errors(script)).toEqual([])
})

it('resolves a landmark asset fixture and records its actual destination', async () => {
  // A supplied safe landmark is needed: the headless tools cannot create landmarks,
  // and existing landmarks must not risk taking i Doll off Tideland.
  // Local movement/look-at were measured with explicit positions in actions.lsl.
  const { script, avatar, world, prims } = await fixture(`default{state_entry(){llRequestPermissions(llGetOwner(),PERMISSION_TELEPORT);}run_time_permissions(integer p){llTeleportAgent(llGetOwner(),"destination",<99,99,99>,<40,40,50>);}}`)
  prims[0]!.addInventory(makeInventoryItem({ name: 'destination', type: InventoryType.LANDMARK, key: OTHER }))
  world.landmarks.set(OTHER, { region: 'home', position: { x: 30, y: 40, z: 50 } })
  script.start(); script.grantPermissions()
  expect(avatar.position).toEqual({ x: 30, y: 40, z: 50 })
  expect(avatar.rotation).toEqual({ x: 0, y: 0, z: 0, s: 1 })
  expect(script.teleportRequests).toEqual([expect.objectContaining({ kind: 'landmark', landmark: 'destination', position: { x: 30, y: 40, z: 50 }, accepted: true })])
})
it('does not treat NULL_KEY parcel ownership as land authority', async () => {
  const world = new World(); world.addRegion('home', { x: 0, y: 0 }); world.addParcel({ region: 'home' })
  const avatar = world.addAvatar({ region: 'home', key: OWNER, username: 'i.doll' })
  const { scripts } = await loadLinkset({ world, region: 'home', prims: [{ scripts: [{ name: 'test', source: { source: `default{state_entry(){llTeleportAgentHome("${OWNER}");}touch_start(integer n){llUnSit("${OWNER}");}}` } }] }] })
  const other = await loadLinkset({ world, region: 'home', owner: OTHER, prims: [{}] })
  world.sitAvatar(avatar, other.prims[0]!)
  scripts.test!.start(); scripts.test!.fire('touch_start', { num_detected: 1 })
  expect(avatar.sittingOn).toBe(other.prims[0])
  expect(scripts.test!.teleportRequests).toEqual([expect.objectContaining({ accepted: false })])
})

it('does not queue link changes on stopped scripts', async () => {
  // Link-change delivery follows the existing measured linkset event policy.
  const { script, world, avatar, prims } = await fixture(`integer changes;default{changed(integer c){++changes;}}`)
  script.start(); script.running = false
  world.sitAvatar(avatar, prims[0]!)
  script.running = true; script.advanceTime(0)
  expect(script.global('changes')).toBe(0)
})
it('coalesces sit and stand changes that have not yet been delivered', async () => {
  const { script, world, avatar, prims } = await fixture(`integer changes;default{changed(integer c){++changes;}}`)
  script.start()
  world.sitAvatar(avatar, prims[0]!); world.standAvatar(avatar)
  script.advanceTime(0)
  expect(script.global('changes')).toBe(1)
})

// In-world: seat-lifecycle.lsl + observer.lsl -> seat x +5 moves sitter x +5;
// a 90-degree rotation rotates the sitter and its offset. Aditi, SLua Tideland, 2026-11-01.
it('follows the current seat transform and preserves it when standing', async () => {
  const { script, avatar, prims, world } = await fixture(`default{state_entry(){llSitTarget(<1,0,1>,ZERO_ROTATION);}touch_start(integer n){llSetPos(<15,20,30>);llSetRot(llEuler2Rot(<0,0,PI_BY_TWO>));}}`)
  script.start(); world.sitAvatar(avatar, prims[0]!)
  script.fire('touch_start', { num_detected: 1 })
  expect(avatar.position.x).toBeCloseTo(15)
  expect(avatar.position.y).toBeCloseTo(21)
  expect(avatar.position.z).toBeCloseTo(31)
  expect(avatar.rotation.z).toBeCloseTo(Math.SQRT1_2)
  world.standAvatar(avatar)
  expect(avatar.position.x).toBeCloseTo(15)
  expect(avatar.position.y).toBeCloseTo(21)
  expect(avatar.rotation.z).toBeCloseTo(Math.SQRT1_2)
})
// In-world: seat-lifecycle.lsl llDie -> info 54 then 262 while falling, then 6.
// Aditi, SLua Tideland, 2026-11-01. Gravity/standing displacement are not simulated.
it('clears seating when the object dies and refuses the dead seat', async () => {
  const { script, avatar, prims, world } = await fixture(`default{state_entry(){llSitTarget(<0,0,1>,ZERO_ROTATION);}touch_start(integer n){llDie();}}`)
  script.start(); world.sitAvatar(avatar, prims[0]!)
  script.fire('touch_start', { num_detected: 1 })
  expect(avatar.info).toBe(6)
  expect(avatar.sittingOn).toBe(null)
  expect(world.sitAvatar(avatar, prims[0]!)).toBe(false)
})
it('does not grant home authority over an avatar on someone else\'s parcel', async () => {
  // Home success is deliberately not probed. Comparing owned parcels also needs
  // land we control; the Tideland sandbox is owned by Linden Lab.
  const { script, avatar, world } = await fixture(`default{state_entry(){llTeleportAgentHome(llGetOwner());}}`)
  world.addParcel({ region: 'home', owner: OWNER, bounds: { min: { x: 0, y: 0 }, max: { x: 100, y: 256 } } })
  world.addParcel({ region: 'home', owner: OTHER, bounds: { min: { x: 100, y: 0 }, max: { x: 256, y: 256 } } })
  avatar.position = { x: 150, y: 20, z: 30 }
  avatar.home = { region: 'away', position: { x: 1, y: 2, z: 3 } }
  script.start()
  expect(avatar.region).toBe('home')
  expect(avatar.position).toEqual({ x: 150, y: 20, z: 30 })
  expect(script.teleportRequests).toEqual([expect.objectContaining({ accepted: false })])
})

// https://wiki.secondlife.com/wiki/llSitTarget
// In-world: target-change.lsl -> changing or disabling the target preserves the
// seated pose; moving the prim then moves the sitter. Aditi, SLua Tideland, 2026-11-01.
it('keeps the occupied offset when a script edits or disables its sit target', async () => {
  const { script, avatar, world, prims } = await fixture(`default{state_entry(){llSitTarget(<1,0,1>,ZERO_ROTATION);}touch_start(integer n){llSitTarget(<5,0,1>,llEuler2Rot(<0,0,PI_BY_TWO>));}touch_end(integer n){llSitTarget(ZERO_VECTOR,ZERO_ROTATION);llSetPos(<15,20,30>);}}`)
  script.start(); world.sitAvatar(avatar, prims[0]!)
  script.fire('touch_start', { num_detected: 1 })
  expect(avatar.position).toEqual({ x: 11, y: 20, z: 31 })
  expect(avatar.rotation).toEqual({ x: 0, y: 0, z: 0, s: 1 })
  script.fire('touch_end', { num_detected: 1 })
  expect(avatar.position).toEqual({ x: 16, y: 20, z: 31 })
  expect(avatar.sittingOn).toBe(prims[0])
})

// In-world: temp-teleport.lsl -> permission 4128 granted before temporary attachment;
// teleport rejected with 'Temporary attachments cannot teleport agents'.
// Aditi, SLua Tideland, 2026-11-01.
it.each(['llTeleportAgent(llGetOwner(),"",<30,40,50>,ZERO_VECTOR)',
  'llTeleportAgentGlobalCoords(llGetOwner(),<1024,2048,0>,<30,40,50>,ZERO_VECTOR)'])('blocks temporary attachments calling %s', async call => {
  const { script, avatar, linkset } = await fixture(`default{state_entry(){llRequestPermissions(llGetOwner(),PERMISSION_ATTACH|PERMISSION_TELEPORT);}touch_start(integer n){${call};}}`)
  script.start(); script.grantPermissions(); linkset.attachToAvatar(OWNER, 5, true)
  script.fire('touch_start', { num_detected: 1 })
  expect(avatar.position).toEqual({ x: 10, y: 20, z: 30 })
  expect(errors(script)).toEqual(['Temporary attachments cannot teleport agents'])
  expect(script.teleportRequests).toEqual([expect.objectContaining({ accepted: false })])
})
it('rejects temporary attachment teleport permission requests without clearing an existing grant', async () => {
  // In-world: temp-teleport.lsl -> the request error differs from the teleport
  // error, and the existing 4128 grant persists. Aditi, SLua Tideland, 2026-11-01.
  const { script, linkset } = await fixture(`integer granted;integer events;default{state_entry(){llRequestPermissions(llGetOwner(),PERMISSION_ATTACH|PERMISSION_TELEPORT);}run_time_permissions(integer p){++events;}touch_start(integer n){llRequestPermissions(llGetOwner(),PERMISSION_TELEPORT);granted=llGetPermissions();}}`)
  script.start(); script.grantPermissions(); linkset.attachToAvatar(OWNER, 5, true)
  script.fire('touch_start', { num_detected: 1 })
  expect(script.permissionRequests).toHaveLength(1)
  expect(script.global('granted')).toBe(4128)
  expect(script.global('events')).toBe(1)
  expect(errors(script)).toEqual(['Temporary attachments cannot request runtime permissions to teleport'])
})
it('rejects forced and viewer seating on attachments', async () => {
  // Forced -7 needs an experience-enabled parcel to measure; attachments cannot be sat upon.
  // https://wiki.secondlife.com/wiki/llSitOnLink
  const { script, world, avatar, prims, linkset } = await fixture(`integer result;default{state_entry(){llSitTarget(<0,0,1>,ZERO_ROTATION);result=llSitOnLink(llGetOwner(),1);}}`, xp())
  linkset.attachToAvatar(OWNER, 5)
  script.start()
  expect(script.global('result')).toBe(-7)
  expect(world.sitAvatar(avatar, prims[0]!)).toBe(false)
  expect(avatar.sittingOn).toBe(null)
})
