import { expect, it } from 'vitest'
import { loadScript, loadLinkset } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlVolumeDetect
// In-world: batch.py settings 11-13 accepted signed PIN limits and 0 with a ~0.2 s delay.
// Aditi, SLua Tideland, Mono, 2026-10-31. Drivers/results: /tmp/issue-154-targets/.
it('makes volume detection readable through phantom status and prim parameters', async () => {
  const s = await loadScript({ source: `list out;
    default { state_entry(){llVolumeDetect(TRUE);out=[llGetStatus(STATUS_PHANTOM)]+llGetPrimitiveParams([PRIM_PHANTOM]);} }` })
  s.start()
  expect(s.global('out')).toEqual([1,1])
})

// https://wiki.secondlife.com/wiki/LlCollisionFilter
it('excludes collisions that do not match the configured filter', async () => {
  const s = await loadScript({ source: `list names;
    default {state_entry(){llCollisionFilter("allowed",NULL_KEY,TRUE);}
      collision_start(integer n){integer i;for(i=0;i<n;++i)names+=[llDetectedName(i)];}}
  ` })
  s.start()
  s.fire('collision_start',{num_detected:2,detected:[{key:'11111111-1111-1111-1111-111111111111',name:'allowed'},{key:'22222222-2222-2222-2222-222222222222',name:'excluded'}]})
  expect(s.global('names')).toEqual(['allowed'])
})

// https://wiki.secondlife.com/wiki/LlSetRemoteScriptAccessPin
it.each([0, -1, -2147483648, 2147483647])('stores remote access PIN %s and sleeps for 0.2 seconds', async (pin) => {
  const s = await loadScript({source:`float elapsed;default {state_entry(){llResetTime();llSetRemoteScriptAccessPin(${pin});elapsed=llGetTime();}}`})
  s.start()
  expect(s.host.remoteScriptAccessPin).toBe(pin)
  expect(s.global('elapsed')).toBeCloseTo(.2)
})

it('starts with restrictive access settings', async () => {
  const s = await loadScript({source:'default {state_entry(){}}'})
  expect(s.host.remoteScriptAccessPin).toBe(0)
  expect(s.host.allowInventoryDrop).toBe(false)
  expect(s.host.volumeDetect).toBe(false)
})

it('keeps prim settings across script reset', async () => {
  const s = await loadScript({source:`default {state_entry(){
    if(llLinksetDataRead("set")==""){
      llLinksetDataWrite("set","1");llVolumeDetect(TRUE);llAllowInventoryDrop(TRUE);
      llSetRemoteScriptAccessPin(-42);llCollisionSound("",.5);llCollisionFilter("allowed",NULL_KEY,FALSE);llResetScript();
    }
  }}`})
  s.start()
  expect(s.host.remoteScriptAccessPin).toBe(-42)
  expect(s.host.allowInventoryDrop).toBe(true)
  expect(s.host.volumeDetect).toBe(true)
  expect(s.host.collisionFilter).toEqual({name:'allowed',key:'00000000-0000-0000-0000-000000000000',accept:false})
  expect(s.host.collisionSound).toEqual({sound:'',volume:.5})
})

// In-world: batch.py and fixed.py -> any nonzero detect enables volume detection;
// both read-backs show phantom=1 even after llSetStatus/PRIM_PHANTOM attempts to clear it.
// Aditi, SLua Tideland, Mono, 2026-10-31 / 2026-11-01. Drivers: /tmp/issue-154-targets/.
it.each([1,2,-1])('enables volume detection for %s',async enabled=>{
  const s=await loadScript({source:`list out;default{state_entry(){llVolumeDetect(${enabled});
    llSetStatus(STATUS_PHANTOM,FALSE);out=[llGetStatus(STATUS_PHANTOM)];
    llSetLinkPrimitiveParamsFast(LINK_THIS,[PRIM_PHANTOM,FALSE]);out+=llGetPrimitiveParams([PRIM_PHANTOM]);}}`})
  s.start()
  expect(s.global('out')).toEqual([1,1])
  expect(s.host.volumeDetect).toBe(true)
})

it('disables volume detection and clears the phantom flag',async()=>{
  const s=await loadScript({source:`list out;default{state_entry(){llSetStatus(STATUS_PHANTOM,TRUE);
    llVolumeDetect(TRUE);llVolumeDetect(FALSE);out=[llGetStatus(STATUS_PHANTOM)]+llGetPrimitiveParams([PRIM_PHANTOM]);}}`})
  s.start()
  expect(s.host.volumeDetect).toBe(false)
  expect(s.global('out')).toEqual([0,0])
})

it('does not generate collisions when settings change or prims move',async()=>{
  const s=await loadScript({source:`integer hits;default{state_entry(){llVolumeDetect(TRUE);llSetPos(<2,0,0>);llSetTimerEvent(0);}
    collision_start(integer n){++hits;}collision(integer n){++hits;}collision_end(integer n){++hits;}}`})
  s.start();s.advanceTime(1000)
  expect(s.global('hits')).toBe(0)
  s.fire('collision_start',{num_detected:1,detected:[{key:'11111111-1111-1111-1111-111111111111',name:'mover'}]})
  s.fire('collision',{num_detected:1,detected:[{key:'11111111-1111-1111-1111-111111111111',name:'mover'}]})
  s.fire('collision_end',{num_detected:1,detected:[{key:'11111111-1111-1111-1111-111111111111',name:'mover'}]})
  expect(s.global('hits')).toBe(2)
})

const KEY='11111111-1111-1111-1111-111111111111'
const OTHER='22222222-2222-2222-2222-222222222222'
// In-world: extra.py -> name matching is case-sensitive and ANDed with a key;
// invalid keys act as blank, accept -1 includes matches, accept 0 excludes them.
it.each([
  ['','NULL_KEY',1,['allowed','other']],
  ['','NULL_KEY',0,[]],
  ['allowed','NULL_KEY',1,['allowed']],
  ['Allowed','NULL_KEY',1,[]],
  ['allowed','NULL_KEY',0,['other']],
  ['allowed','"bad"',1,['allowed']],
  ['','"'+KEY+'"',-1,['allowed']],
  ['wrong','"'+KEY+'"',1,[]],
  ['allowed','"'+OTHER+'"',1,[]],
  ['allowed','"'+KEY+'"',1,['allowed']],
])('filters collision name %s and key %s with accept %s',async(name,key,accept,expected)=>{
  const s=await loadScript({source:`list names;integer count;
    default{state_entry(){llCollisionFilter("${name}",(key)${key},${accept});}
      collision_start(integer n){count=n;integer i;for(i=0;i<n;++i)names+=[llDetectedName(i)];}}`})
  s.start()
  const payload={num_detected:2,detected:[{key:KEY,name:'allowed'},{key:OTHER,name:'other'}]}
  s.fire('collision_start',payload)
  expect(s.global('names')).toEqual(expected)
  expect(s.global('count')).toBe(expected.length)
  expect(payload.detected).toHaveLength(2)
})

it('preserves collision event injection without detected data and leaves land collisions alone',async()=>{
  const s=await loadScript({source:`integer hits;default{state_entry(){llCollisionFilter("",NULL_KEY,FALSE);}
    collision(integer n){++hits;}land_collision_start(vector v){++hits;}}`})
  s.start();s.fire('land_collision_start',{pos:{x:0,y:0,z:0}})
  expect(s.global('hits')).toBe(1)
  s.fire('collision',{num_detected:1})
  expect(s.global('hits')).toBe(2)
})

// In-world: last.py -> missing sound and a script inventory name did not report errors.
// llPlaySound with the same missing name did, and the listener caught a deliberate math error.
// These fields record requests. The viewer tools cannot inspect impact audio or its effective gain.
it.each(['"",-1','"",2','"missing",.5','(string)NULL_KEY,1','"ed124764-705d-d497-167a-182cd9fa2e6c",2'])('records collision sound request %s without a script error',async args=>{
  const s=await loadScript({source:`default{state_entry(){llCollisionSound(${args});}}`})
  s.start()
  expect(s.host.collisionSound).toEqual({sound:s.calls.find(c=>c.name==='llCollisionSound')!.args[0],volume:s.calls.find(c=>c.name==='llCollisionSound')!.args[1]})
  expect(s.chat).toEqual([])
})

it('shares collision and PIN settings between scripts on a prim, keeping other prim settings independent',async()=>{
  const {scripts,linkset}=await loadLinkset({prims:[
    {scripts:[{name:'setter',source:{source:`default{state_entry(){llCollisionFilter("root",NULL_KEY,FALSE);llCollisionSound("",.5);llSetRemoteScriptAccessPin(-42);llAllowInventoryDrop(TRUE);}}`}},
      {name:'observer',source:{source:'default{state_entry(){}}'}}]},
    {scripts:[{name:'child',source:{source:`default{state_entry(){llCollisionFilter("child",NULL_KEY,TRUE);llSetRemoteScriptAccessPin(27);llAllowInventoryDrop(TRUE);}}`}}]},
  ]})
  scripts.setter!.start();scripts.child!.start()
  expect(scripts.observer!.host.collisionFilter).toEqual({name:'root',key:'00000000-0000-0000-0000-000000000000',accept:false})
  expect(scripts.observer!.host.collisionSound).toEqual({sound:'',volume:.5})
  expect(scripts.observer!.host.remoteScriptAccessPin).toBe(-42)
  expect(linkset.prims[0]!.allowInventoryDrop).toBe(true)
  expect(linkset.prims[1]!.allowInventoryDrop).toBe(false)
  expect(linkset.prims[1]!.remoteScriptAccessPin).toBe(27)
  expect(linkset.prims[1]!.collisionFilter.name).toBe('child')
  expect(linkset.prims[1]!.collisionSound).toBeNull()
})

it('lets a child enable volume detection for the whole linkset',async()=>{
  // In-world: fixed.py actual link-2 script -> child ph=1 rootph=1.
  const {scripts,linkset}=await loadLinkset({prims:[{}, {scripts:[{name:'child',source:{source:'default{state_entry(){llVolumeDetect(TRUE);}}'}}]}]})
  scripts.child!.start()
  expect(linkset.prims.map(p=>p.volumeDetect)).toEqual([true,true])
  expect(linkset.prims.map(p=>p.statusFlags & 16)).toEqual([16,16])
})

it('preserves manually set phantom on repeated disabled volume-detect calls',async()=>{
  // In-world: edge-settings.py -> phantom=1 before first enable and again after disabling,
  // setting phantom manually, then repeating llVolumeDetect(FALSE) (Aditi, SLua Tideland, 2026-11-01).
  const s=await loadScript({source:`list out;default{state_entry(){
    llSetStatus(STATUS_PHANTOM,TRUE);llVolumeDetect(FALSE);out=[llGetStatus(STATUS_PHANTOM)];
    llVolumeDetect(TRUE);llVolumeDetect(TRUE);out+=[llGetStatus(STATUS_PHANTOM)];
    llVolumeDetect(FALSE);llSetStatus(STATUS_PHANTOM,TRUE);llVolumeDetect(FALSE);out+=[llGetStatus(STATUS_PHANTOM)];
  }}`})
  s.start()
  expect(s.global('out')).toEqual([1,1,1])
  expect(s.host.volumeDetect).toBe(false)
})
