import { expect, it } from 'vitest'
import { loadLinkset, loadScript, World, Experience, NULL_KEY } from '../src/index.js'

const OWNER = '11111111-1111-1111-1111-111111111111'

// https://wiki.secondlife.com/wiki/LlAttachToAvatar
// https://wiki.secondlife.com/wiki/LlGetAttached
// In-world: point0.lsl and child.lsl -> new point 0 selects 6, root and child
// read the same point and receive attach. Aditi, SLua Tideland, 2026-11-01.
// All probe sources and MCP transcript: /tmp/issue-153-attachments/.
it('attaches a permitted linkset and broadcasts attach to its scripts', async () => {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: OWNER, name: 'i Doll', username: 'i.doll' })
  const { scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [
    { scripts: [{ name: 'root', source: { source: `integer point; list events;
      default { state_entry(){llRequestPermissions(llGetOwner(), PERMISSION_ATTACH);}
      run_time_permissions(integer p){llAttachToAvatar(0);}
      attach(key id){events += [id]; point=llGetAttached();} }` } }] },
    { scripts: [{ name: 'child', source: { source: `integer point; key who;
      default { attach(key id){who=id;point=llGetAttached();} }` } }] },
  ] })
  scripts.root!.start()
  scripts.child!.start()
  scripts.root!.grantPermissions()
  expect(scripts.root!.global('point')).toBe(6)
  expect(scripts.child!.global('point')).toBe(6)
  expect(scripts.root!.global('events')).toEqual([OWNER])
  expect(scripts.child!.global('who')).toBe(OWNER)
})

async function fixture(body: string, world = new World(), experience?: Experience) {
  if (!world.avatars.length) {
    world.addRegion('home', { x: 0, y: 0 })
    world.addAvatar({ region: 'home', key: OWNER, username: 'i.doll' })
  }
  const loaded = await loadLinkset({ world, region: 'home', owner: OWNER,
    prims: [{ scripts: [{ name: 'test', ...(experience ? { experience } : {}), source: { source: body } }] }] })
  return { ...loaded, script: loaded.scripts.test!, world }
}

const attaching = (call: string) => `integer point; list events;
 default {
 state_entry(){llRequestPermissions(llGetOwner(),PERMISSION_ATTACH);}
 run_time_permissions(integer p){${call} point=llGetAttached();}
 attach(key id){events += [id];}
 touch_start(integer n){llDetachFromAvatar();point=llGetAttached();}
 }`

// https://wiki.secondlife.com/wiki/LlAttachToAvatarTemp
it.each(['llAttachToAvatar', 'llAttachToAvatarTemp'])('%s requires PERMISSION_ATTACH', async (fn) => {
  const { script } = await fixture(`integer point;
   default {state_entry(){${fn}(6);point=llGetAttached();}}`)
  script.start()
  expect(script.global('point')).toBe(0)
  // In-world: no-permission.lsl -> no permission key gives this error (Aditi, SLua Tideland, 2026-11-01).
  expect(script.chat.filter(c => c.channel === 2147483647).map(c => c.text)).toEqual(['Cannot find the agent to attach to.'])
})

it('ignores an attach call on an object that is already attached', async () => {
  const { script } = await fixture(attaching('llAttachToAvatar(6); llAttachToAvatar(5);'))
  script.start()
  script.grantPermissions()
  expect(script.global('point')).toBe(6)
  expect(script.global('events')).toEqual([OWNER])
})

// https://wiki.secondlife.com/wiki/LlGetAttachedList
// https://wiki.secondlife.com/wiki/LlGetAttachedListFiltered
it('lists root keys in attachment order, including temporary objects and excluding HUDs', async () => {
  const first = await fixture(attaching('llAttachToAvatar(5);'))
  const second = await fixture(attaching('llAttachToAvatarTemp(6);'), first.world)
  const hud = await fixture(attaching('llAttachToAvatar(31);'), first.world)
  for (const f of [first, second, hud]) { f.script.start(); f.script.grantPermissions() }
  const reader = await fixture(`list all; list filtered;
    default {state_entry(){all=llGetAttachedList(llGetOwner());filtered=llGetAttachedListFiltered(llGetOwner(),[FILTER_INCLUDE,6]);}}`, first.world)
  reader.script.start()
  expect(reader.script.global('all')).toEqual([first.prims[0]!.key, second.prims[0]!.key])
  expect(reader.script.global('filtered')).toEqual([second.prims[0]!.key])
})

it.each(['NULL_KEY', '(key)"bad"', 'llGetKey()'])('reports NOT FOUND for a non-avatar %s', async (key) => {
  const { script } = await fixture(`list all; list filtered;
    default {state_entry(){all=llGetAttachedList(${key});filtered=llGetAttachedListFiltered(${key},[]);}}`)
  script.start()
  expect(script.global('all')).toEqual(['NOT FOUND'])
  expect(script.global('filtered')).toEqual(['NOT FOUND'])
})

// https://wiki.secondlife.com/wiki/LlDetachFromAvatar
it('fires detach with NULL_KEY and reads zero while pending detachment', async () => {
  const { script, linkset } = await fixture(attaching('llAttachToAvatar(6);'))
  script.start()
  script.grantPermissions()
  linkset.touch(0)
  expect(script.global('point')).toBe(6)
  expect(script.global('events')).toEqual([OWNER, '00000000-0000-0000-0000-000000000000'])
})

it('does not detach an object from a child-prim script', async () => {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addAvatar({ region: 'home', key: OWNER, username: 'i.doll' })
  const { scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, prims: [
    { scripts: [{ name: 'root', source: { source: attaching('llAttachToAvatar(6);') } }] },
    { scripts: [{ name: 'child', source: { source: `integer point;
      default { state_entry(){llRequestPermissions(llGetOwner(),PERMISSION_ATTACH);}
       run_time_permissions(integer p){llDetachFromAvatar();point=llGetAttached();} }` } }] },
  ] })
  scripts.root!.start()
  scripts.root!.grantPermissions()
  scripts.child!.start()
  scripts.child!.grantPermissions()
  expect(scripts.child!.global('point')).toBe(6)
  expect(scripts.child!.chat.filter(c => c.channel === 2147483647)).toEqual([])
})

// In-world: point-1/56/127/128/134/255 -> chest, point256 -> right hand;
// point0 -> right hand; hud-32..38 -> requested HUD point.
// Aditi, SLua Tideland, 2026-11-01. Inputs are transmitted as an unsigned byte.
it.each([[0,6],[-1,1],[56,1],[127,1],[128,1],[134,1],[255,1],[256,6],[31,31],[38,38]])(
  'resolves attach point %i to %i', async (point, expected) => {
    const { script, linkset } = await fixture(attaching(`llAttachToAvatar(${point});`))
    script.start(); script.grantPermissions()
    expect(script.global('point')).toBe(expected)
    expect(linkset.attachment).toMatchObject({ avatar: OWNER, point: expected, temporary: false })
  },
)

// In-world: remember.lsl -> attach 5, detach, rez, llAttachToAvatar(0) -> 5
// (Aditi, SLua Tideland, 2026-11-01).
it('remembers the last point across detach and fixture reattachment', async () => {
  const { script, linkset } = await fixture(`list points;
   default {attach(key id){points += [llGetAttached()];}}`)
  script.start()
  linkset.attachToAvatar(OWNER, 5)
  linkset.advanceTime(0)
  linkset.detachFromAvatar()
  linkset.advanceTime(0)
  linkset.attachToAvatar(OWNER, 0)
  linkset.advanceTime(0)
  expect(script.global('points')).toEqual([5,0,5])
})

// In-world: denied.lsl -> permission key owner, bits 0, attach/temp both
// silently leave object rezzed (Aditi, SLua Tideland, 2026-11-01).
it.each(['llAttachToAvatar','llAttachToAvatarTemp'])('%s silently ignores a denied grant', async (fn) => {
  const { script } = await fixture(attaching(`${fn}(6);`))
  script.start();script.denyPermissions()
  expect(script.global('point')).toBe(0)
  expect(script.global('events')).toEqual([])
  expect(script.chat).toEqual([])
})

// In-world: never-permitted.lsl -> permissions 0/key NULL, ground detach is
// silent; viewer wear at 6 followed by detach stays at 6, silently.
// Aditi, SLua Tideland, 2026-11-01.
it('does not detach a viewer-worn probe whose script has never requested permissions', async () => {
  const { script, linkset } = await fixture(`integer point; list events;
    default {touch_start(integer n){llDetachFromAvatar();point=llGetAttached();}
     attach(key id){events += [id];}}`)
  script.start()
  linkset.touch(0)
  expect(script.global('point')).toBe(0)
  expect(script.chat).toEqual([])
  linkset.attachToAvatar(OWNER,6)
  linkset.advanceTime(0)
  linkset.touch(0)
  expect(script.global('point')).toBe(6)
  expect(linkset.attachment?.point).toBe(6)
  expect(script.global('events')).toEqual([OWNER])
  expect(script.chat).toEqual([])
})

// In-world: edges.lsl attached with 32, then replaced the grant with 1040;
// llDetachFromAvatar still detached. never-attach-permission.lsl was worn by
// the viewer and granted only 16, then detached, proving no historical
// ATTACH grant is needed (Aditi, SLua Tideland, 2026-11-01).
it.each([false,true])('detaches with an avatar permission key and no ATTACH bit (prior ATTACH: %s)', async prior => {
  const { script, linkset } = await fixture(`integer point; integer detached;
   default {state_entry(){llRequestPermissions(llGetOwner(),${prior ? 32 : 16});}
   run_time_permissions(integer p){if(p==32){llAttachToAvatar(6);llRequestPermissions(llGetOwner(),1040);}
    else {llDetachFromAvatar();point=llGetAttached();}}
   attach(key id){if(id==NULL_KEY)detached=llGetAttached()+1;}}`)
  script.start()
  if (!prior) {linkset.attachToAvatar(OWNER,6);linkset.advanceTime(0)}
  script.grantPermissions()
  if(prior)script.grantPermissions()
  expect(script.global('point')).toBe(6)
  expect(script.global('detached')).toBe(1)
  expect(linkset.attachment).toBeNull()
  expect(script.chat).toEqual([])
})

// In-world: ground-detach.lsl -> no event/error when granted ATTACH and
// detached on the ground (Aditi, SLua Tideland, 2026-11-01).
it('leaves a rezzed object alone when detaching with permission', async () => {
  const { script, linkset, world } = await fixture(attaching('llDetachFromAvatar();'))
  script.start();script.grantPermissions()
  expect(script.global('events')).toEqual([])
  expect(script.chat).toEqual([])
  expect(world.linksets).toContain(linkset)
})

// In-world: point0/sticky/temp -> return reads old point, attach(NULL_KEY)
// reads 0; no on_rez on ground-to-attachment transition.
// Aditi, SLua Tideland, 2026-11-01. Simulator latency is not wall-clock simulated.
it('changes detach state after the caller returns and removes the object from region lookups', async () => {
  const { script, linkset, world } = await fixture(`list order;
   default {state_entry(){llRequestPermissions(llGetOwner(),32);}
   run_time_permissions(integer p){llAttachToAvatar(6);order += [llGetAttached()];}
   touch_start(integer n){llDetachFromAvatar();order += [llGetAttached()];}
   attach(key id){order += [id,llGetAttached()];}
   on_rez(integer p){order += ["rez"];}}`)
  script.start();script.grantPermissions();linkset.touch(0)
  expect(script.global('order')).toEqual([6,OWNER,6,6,NULL_KEY,0])
  expect(world.linksets).not.toContain(linkset)
})

// In-world: temp-permissions.lsl -> 48 before, after and later; owner remains
// i Doll. temp.lsl -> attach(NULL_KEY) did run despite the wiki caveat.
// Aditi, SLua Tideland, 2026-11-01.
it('keeps extra permissions on a same-owner temporary attachment and reports its detach', async () => {
  const { script, linkset } = await fixture(`integer permissions; list events;
   default {state_entry(){llRequestPermissions(llGetOwner(),48);}
   run_time_permissions(integer p){llAttachToAvatarTemp(6);permissions=llGetPermissions();}
   touch_start(integer n){llDetachFromAvatar();}
   attach(key id){events += [id];}}`)
  script.start();script.grantPermissions()
  expect(script.global('permissions')).toBe(48)
  expect(linkset.attachment?.temporary).toBe(true)
  linkset.touch(0)
  expect(script.global('events')).toEqual([OWNER,NULL_KEY])
  expect(linkset.dead).toBe(true)
})

// In-world: lists.lsl -> invalid/truncated options give [], no DEBUG_CHANNEL
// error; avatar errors take precedence. Repeated includes deduplicate and
// preserve attachment order (Aditi, SLua Tideland, 2026-11-01).
it.each(['[99,0]','[1]','[99]','[2]','["1",6]','[1,"6"]','[1.0,6]','[1,6.0]',
 '[2,"1"]','[2,1.0]','[99,0,1,6]','[1,6,99]','[<1,0,0>,6]','[1,0]','[1,-2]','[1,56]'])('returns an empty list for filter %s', async options => {
  const worn = await fixture(attaching('llAttachToAvatar(6);'))
  worn.script.start();worn.script.grantPermissions()
  const reader = await fixture(`list got; default {state_entry(){got=llGetAttachedListFiltered(llGetOwner(),${options});}}`, worn.world)
  reader.script.start()
  expect(reader.script.global('got')).toEqual([])
  expect(reader.script.chat).toEqual([])
})

it('validates the avatar before checking invalid options', async () => {
  const { script } = await fixture(`list got;default {state_entry(){got=llGetAttachedListFiltered(NULL_KEY,[99]);}}`)
  script.start()
  expect(script.global('got')).toEqual(['NOT FOUND'])
})

it('unions includes without duplicates, preserves order, and returns LSL keys', async () => {
  const first = await fixture(attaching('llAttachToAvatar(5);'))
  const second = await fixture(attaching('llAttachToAvatar(6);'),first.world)
  for(const f of [first,second]){f.script.start();f.script.grantPermissions()}
  const reader = await fixture(`list got; integer type;
   default {state_entry(){got=llGetAttachedListFiltered(llGetOwner(),[1,6,1,5,1,6]);type=llGetListEntryType(got,0);}}`,first.world)
  reader.script.start()
  expect(reader.script.global('got')).toEqual([first.prims[0]!.key,second.prims[0]!.key])
  expect(reader.script.global('type')).toBe(4)
})

// In-world: HUD2 + lists -> no HUDs without experience eligibility, including
// FILTER_FLAGS 1/-1 and explicit HUD point. Experience probe returned 17,
// XP_ERROR_NOT_PERMITTED_LAND, for Fifth Column at this parcel. Positive HUD
// eligibility below follows the wiki and needs an experience-enabled parcel.
it('hides HUDs without matching, allowed, accepted experience scripts', async () => {
  const experience = new Experience({agents:[OWNER]})
  const worn = await fixture(attaching('llAttachToAvatar(31);'),new World(),experience)
  worn.script.start();worn.script.grantPermissions()
  const source=`list got; default {touch_start(integer n){got=llGetAttachedListFiltered(llGetOwner(),[2,1,1,-1]);}}`
  const plain = await fixture(source,worn.world)
  plain.script.start();plain.linkset.touch(0)
  expect(plain.script.global('got')).toEqual([])
  const reader = await fixture(source,worn.world,experience)
  reader.script.start();reader.linkset.touch(0)
  expect(reader.script.global('got')).toEqual([worn.prims[0]!.key])
  experience.allowedHere=false;reader.linkset.touch(0)
  expect(reader.script.global('got')).toEqual([])
  experience.allowedHere=true;experience.agents.clear();reader.linkset.touch(0)
  expect(reader.script.global('got')).toEqual([])
  experience.agents.add(OWNER)
  const foreign = await fixture(source,worn.world,new Experience({name:'other',agents:[OWNER]}))
  foreign.script.start();foreign.linkset.touch(0)
  expect(foreign.script.global('got')).toEqual([])
})

it.each([[1,0,[]],[0,1,['hud']],[2,0,[]]])('uses the last FILTER_FLAGS value (%i then %i)', async (a,b,want) => {
  const exp = new Experience({agents:[OWNER]})
  const worn = await fixture(attaching('llAttachToAvatar(31);'),new World(),exp)
  worn.script.start();worn.script.grantPermissions()
  const reader = await fixture(`list got;default {state_entry(){got=llGetAttachedListFiltered(llGetOwner(),[2,${a},2,${b},1,31]);}}`,worn.world,exp)
  reader.script.start()
  expect(reader.script.global('got')).toEqual(want.length ? [worn.prims[0]!.key] : [])
})

// https://wiki.secondlife.com/wiki/LlWorldPosToHUD
// In-world: hud2.lsl -> camera <116,45,2004.482>, rotation
// <-.08132,.08132,.70242,.70242>, FOV 1.047198, aspect 1.4242. Camera-relative
// <10,1,1> -> <1,.08660,.08660>; <-10,1,1> -> <-1,-.08660,-.08660>.
// hud-32..38 measure the anchor offsets. Aditi, SLua Tideland, 2026-11-01.
it.each([
 [31,0,0],[32,.7121,-.5],[33,0,-.5],[34,-.7121,-.5],
 [35,0,0],[36,-.7121,.5],[37,0,.5],[38,.7121,.5],
])('projects camera-relative positions for HUD point %i', async (point,y,z) => {
  const { script, linkset } = await fixture(`vector front; vector behind;
   default {state_entry(){llRequestPermissions(llGetOwner(),1024);}
    touch_start(integer n){front=llWorldPosToHUD(<110,201,301>);behind=llWorldPosToHUD(<90,201,301>);}}`)
  script.start();script.grantPermissions()
  linkset.attachToAvatar(OWNER,point)
  script.setCamera({pos:{x:100,y:200,z:300},rot:{x:0,y:0,z:0,s:1},fov:Math.PI/3,aspect:1.4242})
  linkset.touch(0)
  expect(script.global('front')).toEqual({x:1,y:expect.closeTo(y+0.08660254,5),z:expect.closeTo(z+0.08660254,5)})
  expect(script.global('behind')).toEqual({x:-1,y:expect.closeTo(y-0.08660254,5),z:expect.closeTo(z-0.08660254,5)})
})

it('applies camera rotation, returns zero in the camera plane, and uses lens settings', async () => {
  const { script, linkset } = await fixture(`vector got;vector plane;vector at;
   default {state_entry(){llRequestPermissions(llGetOwner(),1024);}
   touch_start(integer n){got=llWorldPosToHUD(<99,210,301>);plane=llWorldPosToHUD(<100,200,301>);at=llWorldPosToHUD(<100,200,300>);}}`)
  script.start();script.grantPermissions();linkset.attachToAvatar(OWNER,31)
  script.setCamera({pos:{x:100,y:200,z:300},rot:{x:0,y:0,z:Math.SQRT1_2,s:Math.SQRT1_2},fov:Math.PI/2})
  linkset.touch(0)
  expect(script.global('got')).toEqual({x:1,y:expect.closeTo(.05,5),z:expect.closeTo(.05,5)})
  expect(script.global('plane')).toEqual({x:0,y:0,z:0})
  expect(script.global('at')).toEqual({x:0,y:0,z:0})
})

// In-world: no-permission / hud2 / edges -> ZERO_VECTOR, silently, for
// rezzed objects, body attachments, or HUDs without TRACK_CAMERA.
// Aditi, SLua Tideland, 2026-11-01.
it.each([[0,0],[0,1024],[6,1024],[31,0]])('returns zero without a HUD and camera permission (%i, %i)', async (point,permissions) => {
  const { script,linkset }=await fixture(`vector got;
   default {state_entry(){llRequestPermissions(llGetOwner(),${permissions});}
   touch_start(integer n){got=llWorldPosToHUD(<10,1,1>);}}`)
  script.start();if(permissions)script.grantPermissions()
  if(point)linkset.attachToAvatar(OWNER,point)
  linkset.touch(0)
  expect(script.global('got')).toEqual({x:0,y:0,z:0})
  expect(script.chat).toEqual([])
})

// The wiki documents temporary ownership transfer. In-world verification needs
// a second avatar; i Doll alone cannot grant a foreign avatar's permission.
it('temporarily attaches to the permission avatar and transfers ownership', async () => {
  const other='22222222-2222-2222-2222-222222222222'
  const { script, world,linkset } = await fixture(`key owner; integer permissions;integer changes;
   default {state_entry(){llRequestPermissions("${other}",48);}
   run_time_permissions(integer p){llAttachToAvatarTemp(6);owner=llGetOwner();permissions=llGetPermissions();}
   changed(integer flags){changes=flags;}}`)
  world.addAvatar({region:'home',key:other,username:'second.avatar'})
  script.start();script.grantPermissions()
  expect(script.global('owner')).toBe(other)
  expect(script.global('permissions')).toBe(32)
  expect(script.global('changes')).toBe(128)
  expect(linkset.attachment?.avatar).toBe(other)
})

it('keeps a normal attachment owned by its original owner when permission comes from another avatar', async () => {
  const other='22222222-2222-2222-2222-222222222222'
  const { script,world,linkset }=await fixture(`default {state_entry(){llRequestPermissions("${other}",32);}
   run_time_permissions(integer p){llAttachToAvatar(6);}}`)
  world.addAvatar({region:'home',key:other,username:'second.avatar'})
  script.start();script.grantPermissions()
  expect(linkset.attachment).toBeNull()
  expect(linkset.owner).toBe(OWNER)
})

// Wiki caveat: even a same-owner temporary attach requires transfer permission.
// A no-transfer asset cannot be made with this avatar alone: setting next-owner
// permissions does not restrict the current owner. Needs a second avatar to
// transfer the restricted asset back, or a supplied no-transfer asset.
it('refuses a temporary attachment containing no-transfer inventory', async () => {
  const { script,prims,linkset } = await fixture(attaching('llAttachToAvatarTemp(6);'))
  const item=prims[0]!.inventory[0]!
  item.permMask={...item.permMask,owner:item.permMask.owner & ~8192}
  script.start();script.grantPermissions()
  expect(linkset.attachment).toBeNull()
  expect(script.chat.map(c=>c.text)).toEqual(['No permission to transfer'])
})

// Other-region avatar fixtures represent a child agent for this query. The
// simulator's child-agent interest range is not derived from avatar position.
it('distinguishes a known child agent from an absent avatar', async () => {
  const { script,world }=await fixture(`list all;list filtered;
   default {state_entry(){all=llGetAttachedList(llGetOwner());filtered=llGetAttachedListFiltered(llGetOwner(),[99]);}}`)
  world.addRegion('away',{x:256,y:0});world.avatars[0]!.region='away'
  script.start()
  expect(script.global('all')).toEqual(['NOT ON REGION'])
  expect(script.global('filtered')).toEqual(['NOT ON REGION'])
})

it('keeps fixture attach and detach idempotent', async () => {
  const { script,linkset }=await fixture(`list events; default {attach(key id){events += [id];}}`)
  script.start()
  linkset.detachFromAvatar()
  linkset.attachToAvatar(OWNER,5)
  linkset.attachToAvatar(OWNER,6)
  linkset.advanceTime(0)
  linkset.detachFromAvatar()
  linkset.detachFromAvatar()
  linkset.advanceTime(0)
  expect(script.global('events')).toEqual([OWNER,NULL_KEY])
  expect(linkset.attachment).toBeNull()
})

it('does not invent a local owner avatar when the world contains none', async () => {
  const { script,world,linkset }=await fixture(`list got;
   default {state_entry(){got=llGetAttachedList(llGetOwner());llRequestPermissions(llGetOwner(),32);}
   run_time_permissions(integer p){llAttachToAvatar(6);}}`)
  world.avatars.length=0
  script.start();script.grantPermissions()
  expect(script.global('got')).toEqual(['NOT FOUND'])
  expect(linkset.attachment).toBeNull()
  expect(script.chat.map(c=>c.text)).toEqual(['Cannot find the agent to attach to.'])
})

// Standalone scripts retain their configured owner as an implicit local avatar.
it('supports attachment fixtures without a World', async () => {
  const script=await loadScript({source:attaching('llAttachToAvatar(6);'),owner:OWNER})
  script.start();script.grantPermissions()
  expect(script.global('point')).toBe(6)
  expect(script.global('events')).toEqual([OWNER])
})

// In-world: sleep-normal/temp/long -> a caller sleeping after detach does not
// continue in inventory. sleep-event-normal/temp -> the final attach handler
// reaches its sleep, then stops. Rewearing sleep-normal resumes the caller,
// the queued NULL attach event, then the new attach event. Aditi, SLua Tideland,
// 2026-11-01. These pin inventory suspension and the review's settle hang.
it.each([false,true])('suspends the final detach handler in inventory (temporary: %s)', async temporary => {
  const { script,linkset }=await fixture(`integer finished;
   default {attach(key id){if(id==NULL_KEY){llSleep(0.5);finished=1;}}}`)
  script.start();linkset.attachToAvatar(OWNER,6,temporary);linkset.advanceTime(0)
  linkset.detachFromAvatar();linkset.advanceTime(500)
  expect(script.global('finished')).toBe(0)
  expect(linkset.dead).toBe(temporary)
  linkset.attachToAvatar(OWNER,6)
  linkset.advanceTime(500)
  expect(script.global('finished')).toBe(temporary ? 0 : 1)
})

it('suspends a caller after detach without hanging settle, then resumes on rewear', async () => {
  const { script,linkset }=await fixture(`integer after;integer detached;
   default {state_entry(){llRequestPermissions(llGetOwner(),32);}
   run_time_permissions(integer p){llAttachToAvatar(6);}
   touch_start(integer n){llDetachFromAvatar();llSleep(0.5);after=llGetAttached()+1;}
   attach(key id){if(id==NULL_KEY){llSleep(0.5);detached=1;}}}`)
  script.start();script.grantPermissions();linkset.touch(0);linkset.advanceTime(500)
  expect(script.global('after')).toBe(0)
  expect(script.global('detached')).toBe(0)
  linkset.attachToAvatar(OWNER,6)
  linkset.advanceTime(500)
  expect(script.global('after')).toBe(7)
  expect(script.global('detached')).toBe(1)
})
