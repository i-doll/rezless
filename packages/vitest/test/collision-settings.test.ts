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

// In-world: review-collision.py -> rejected stays absent after accepting; accepted start/end
// each fire once after rejecting (Aditi, SLua Tideland, Mono, 2026-11-01).
it.each([[0,1,0],[1,0,1]])('filters a queued collision at injection, with accept changing from %s to %s',async(initial,after,expected)=>{
  const s=await loadScript({source:`integer hits;default{state_entry(){llCollisionFilter("",NULL_KEY,${initial});}
    timer(){llSleep(1);llCollisionFilter("",NULL_KEY,${after});}
    collision_start(integer n){hits+=n;}}`})
  s.start()
  s.linkset.clock.schedule(s,0,'timer')
  s.advanceTime(0)
  s.fire('collision_start',{num_detected:1,detected:[{key:KEY,name:'collider'}]})
  s.advanceTime(1000)
  expect(s.global('hits')).toBe(expected)
})

// In-world: review-collision.py -> continuous=1 after enabling volume detection,
// continuous=0 after disabling it; start/end=1 in both cases (Aditi, SLua Tideland, 2026-11-01).
it.each([[0,1,1],[1,0,0]])('decides queued continuous collision eligibility before volume changes from %s to %s',async(initial,after,expected)=>{
  const s=await loadScript({source:`integer hits;default{state_entry(){llVolumeDetect(${initial});}
    timer(){llSleep(1);llVolumeDetect(${after});}
    collision(integer n){hits+=n;}}`})
  s.start();s.linkset.clock.schedule(s,0,'timer');s.advanceTime(0)
  s.fire('collision',{num_detected:1,detected:[{key:KEY,name:'collider'}]})
  s.advanceTime(1000)
  expect(s.global('hits')).toBe(expected)
})

it.each([[0,1,0],[1,0,1]])('freezes explicit collision eligibility while queued, accept %s to %s',async(initial,after,expected)=>{
  const s=await loadScript({source:`integer hits;default{state_entry(){llCollisionFilter("",NULL_KEY,${initial});}
    timer(){llSleep(1);}
    collision_start(integer n){hits+=n;}}`})
  s.start();s.linkset.clock.schedule(s,0,'timer');s.advanceTime(0)
  s.fire('collision_start',{num_detected:1,detected:[{key:KEY,name:'collider'}]})
  s.host.collisionFilter.accept=Boolean(after)
  s.advanceTime(1000)
  expect(s.global('hits')).toBe(expected)
})

// The same script in each link of three linked 1 m boxes runs a command from
// link_message and reads llGetStatus(STATUS_PHANTOM), PRIM_PHANTOM of every
// link and OBJECT_PHANTOM.
const VOLUME = `list out;
string ph() { string p; integer i; for (i = 1; i <= llGetNumberOfPrims(); ++i) p += llList2String(llGetLinkPrimitiveParams(i, [PRIM_PHANTOM]), 0); return p; }
default { link_message(integer s, integer n, string m, key id) {
  list a = llParseString2List(m, [" "], []);
  if ((integer)llList2String(a, 0) != llGetLinkNumber()) return;
  string c = llList2String(a, 1);
  integer v = (integer)llList2String(a, 2);
  if (c == "vd") llVolumeDetect(v);
  else if (c == "phantom") llSetStatus(STATUS_PHANTOM, v);
  else if (c == "lphan") llSetLinkPrimitiveParamsFast(v, [PRIM_PHANTOM, (integer)llList2String(a, 3)]);
  out = [llGetStatus(STATUS_PHANTOM), ph(), llList2Integer(llGetObjectDetails(llGetKey(), [OBJECT_PHANTOM]), 0)];
} }`

async function volumeObject(links = 3) {
  const { scripts, linkset } = await loadLinkset({
    prims: Array.from({ length: links }, (_, i) => ({ scripts: [{ name: `l${i + 1}`, source: { source: VOLUME } }] })),
  })
  for (const script of Object.values(scripts)) script.start()
  const run = (command: string) => {
    for (const script of linkset.allScripts()) script.fire('link_message', { sender_num: 1, num: 0, str: command, id: '' })
    linkset.advanceTime(100)
  }
  const read = () => linkset.allScripts().map(script => { run(`${script.host.linkNumber} read`); return script.global('out') })
  return { linkset, run, read }
}

// In-world (Aditi, SLua Tideland, Firestorm 7.3.0, 2026-11-14), three linked
// 1 m boxes: llVolumeDetect(TRUE) from link 2 made all three read 1, "111"
// and 1. llSetStatus(STATUS_PHANTOM, FALSE) from the root, and
// llSetLinkPrimitiveParamsFast(3, [PRIM_PHANTOM, FALSE]) from link 2, left
// them so. llVolumeDetect(FALSE) from the root cleared it for all three, and
// after link 2 turned it on again, llVolumeDetect(FALSE) from link 3 did too.
it('keeps volume detection for the whole object, whichever prim turns it on or off', async () => {
  const s = await volumeObject()
  const on = [1, '111', 1], off = [0, '000', 0]
  s.run('2 vd 1'); expect(s.read()).toEqual([on, on, on])
  s.run('1 phantom 0'); expect(s.read()).toEqual([on, on, on])
  s.run('2 lphan 3 0'); expect(s.read()).toEqual([on, on, on])
  s.run('1 vd 0'); expect(s.read()).toEqual([off, off, off])
  s.run('2 vd 1'); s.run('3 vd 0'); expect(s.read()).toEqual([off, off, off])
})

// In-world: link 2 of three linked boxes turned volume detection on, and the
// viewer linked a fourth box, whose script had read 0, "" and 0 alone. Every
// script then read STATUS_PHANTOM 1 and OBJECT_PHANTOM 1. llVolumeDetect(FALSE)
// from the root then read 0, "0000" and 0 from all four, and TRUE from the
// root 1, "1111" and 1. Right after the link, PRIM_PHANTOM of link 2 read 0
// while the other links read 1; rezless reads 1 for every link.
it('turns volume detection on for a prim linked to an object that has it', async () => {
  const s = await volumeObject()
  s.run('2 vd 1')
  const added = await loadLinkset({ prims: [{ scripts: [{ name: 'l4', source: { source: VOLUME } }] }] })
  s.linkset.absorb(added.linkset)
  expect(s.read().map(([status, , object]) => [status, object])).toEqual([[1, 1], [1, 1], [1, 1], [1, 1]])
  s.run('1 vd 0'); expect(s.read()).toEqual(Array(4).fill([0, '0000', 0]))
  s.run('1 vd 1'); expect(s.read()).toEqual(Array(4).fill([1, '1111', 1]))
})

const COUNTS = `integer starts; integer ongoing; integer ends;
default {
  collision_start(integer n) { ++starts; }
  collision(integer n) { ++ongoing; }
  collision_end(integer n) { ++ends; }
}`
const AVATAR_HIT = { num_detected: 1, detected: [{ key: KEY, name: 'i Doll' }] }

// In-world: three linked 1 m boxes at walking height, each with a script
// counting collision events, and llVolumeDetect(TRUE) from link 2. The avatar
// walked through all three and back, first with the root nearest it and then
// with link 3 nearest. Each time the root's script counted one
// collision_start and one collision_end, and no collision; the scripts in
// links 2 and 3 counted nothing.
it('raises collisions in the root only while the object detects volume', async () => {
  const { scripts, linkset } = await loadLinkset({
    prims: [1, 2, 3].map(n => ({ scripts: [{ name: `l${n}`, source: { source: COUNTS } }, { name: `v${n}`, source: { source: VOLUME } }] })),
  })
  for (const script of Object.values(scripts)) script.start()
  scripts.v2!.fire('link_message', { sender_num: 1, num: 0, str: '2 vd 1', id: '' })
  const counters = [scripts.l1!, scripts.l2!, scripts.l3!]
  for (const script of counters) {
    for (const event of ['collision_start', 'collision', 'collision_end']) script.fire(event, AVATAR_HIT)
  }
  linkset.advanceTime(100)
  expect(counters.map(s => [s.global('starts'), s.global('ongoing'), s.global('ends')]))
    .toEqual([[1, 0, 1], [0, 0, 0], [0, 0, 0]])
})

// In-world: link 3 was then unlinked from the object, which still detected
// volume. Alone it read STATUS_PHANTOM 1, nothing for PRIM_PHANTOM of link 1,
// and OBJECT_PHANTOM 1. When the avatar walked through it, its script counted
// one collision_start and one collision_end, and the rest of the object
// still raised them in its root.
it('keeps volume detection in a prim unlinked from an object that has it', async () => {
  const s = await volumeObject()
  s.run('2 vd 1')
  const third = s.linkset.prims[2]!
  s.linkset.breakOff(third)
  const alone = third.linkset!
  const script = alone.allScripts()[0]!
  script.fire('link_message', { sender_num: 0, num: 0, str: '0 read', id: '' })
  alone.advanceTime(100)
  expect(script.global('out')).toEqual([1, '', 1])
  expect(s.read().map(([status]) => status)).toEqual([1, 1])
  const counter = await loadScript({ host: third, scriptName: 'counter', source: COUNTS })
  counter.start()
  for (const event of ['collision_start', 'collision', 'collision_end']) counter.fire(event, AVATAR_HIT)
  alone.advanceTime(100)
  expect([counter.global('starts'), counter.global('ongoing'), counter.global('ends')]).toEqual([1, 0, 1])
})
