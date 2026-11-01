import { expect, it } from 'vitest'
import { loadScript, loadLinkset } from '../src/index.js'
import { World, makeInventoryItem, InventoryType } from '@rezless/vm'
import type { Script, Vector, Rotation } from '@rezless/vm'

// https://wiki.secondlife.com/wiki/LlMoveToTarget
// Probe list: tau 0/.01/.0444/.2/1/2, distance 64.9/65/65.1,
// nonphysical requests, stops, reset/state changes, and look-at axes/damping.
it('approaches a move target over virtual time and reaches an llTarget range', async () => {
  const s = await loadScript({ source: `vector p; integer hits;
    default {state_entry(){llSetStatus(STATUS_PHYSICS,TRUE);llTarget(<4,0,0>,.1);llMoveToTarget(<4,0,0>,1);}
    touch_start(integer n){p=llGetPos();}
    at_target(integer h,vector target,vector ours){++hits;}}
  ` })
  s.start()
  s.advanceTime(1000)
  s.fire('touch_start', { num_detected: 1 })
  expect((s.global('p') as {x:number}).x).toBeGreaterThan(0)
  expect((s.global('p') as {x:number}).x).toBeLessThan(4)
  s.advanceTime(9000)
  expect(s.global('hits')).toBeGreaterThan(0)
})

// In-world: /tmp/issue-156-target-probes/{drive,follow-drive,last-drive}.py
// Aditi, SLua Tideland, Mono, 2026-11-01. Samples are in <case>.json.
// tau .044 failed; .044444 and 2/45 worked. 64 m worked; 64.01/64.9/65/65.1 did not.
// Both stops held their sampled transform without coast. Invalid replacements stopped
// the old request. State changes preserved requests; reset cleared both controllers.
// Nonphysical move waited for physics; BOTH look functions snapped immediately.
// strength .044 failed on physics; .044444 worked; nonphysical .01 snapped, zero did not.
// strength 2 turned more slowly than 1, damping 2 matched 1, and low damping wobbled.
// The deterministic model uses nominal exponential convergence, without simulator drift,
// gravity, angular overshoot, collisions or inertia. These are kinematics, not a physics engine.
async function mover(call='llMoveToTarget(<4,0,0>,1);', physical=true, replacement='') {
  const s=await loadScript({source:`vector p; rotation r;
    default {state_entry(){${physical?'llSetStatus(STATUS_PHYSICS,TRUE);':''}${call}}
      touch_start(integer n){p=llGetPos();r=llGetRot();}
      link_message(integer sender,integer num,string str,key id){
        if(num==0){llStopMoveToTarget();llStopLookAt();}
        if(num==1)llSetStatus(STATUS_PHYSICS,TRUE);
        if(num==2)llSetStatus(STATUS_PHYSICS,FALSE);
        if(num==3)state next;
        if(num==4){${replacement}}}}
    state next{touch_start(integer n){p=llGetPos();r=llGetRot();}}
  `})
  s.start();return s
}
function sample(s: Script) {
  s.fire('touch_start',{num_detected:1})
  return {p:s.global('p') as Vector,r:s.global('r') as Rotation}
}
function action(s: Script,num:number) { s.fire('link_message',{sender_num:1,num,str:'',id:''}) }
async function callOn(s: Script,call:string) {
  const control=await loadScript({source:`default{state_entry(){${call}}}`,host:s.host,scriptName:'control'})
  control.start();return control
}

it.each([['.2',3.973],['1',2.528],['2',1.574],['1000',.004]])(
  'uses tau %s for nominal exponential position convergence',async(tau,x)=>{
    const s=await mover(`llMoveToTarget(<4,0,0>,${tau});`)
    s.advanceTime(1000)
    expect(sample(s).p.x).toBeCloseTo(x as number,2)
  })
it('gives the same position for a single advance or many smaller advances',async()=>{
  const a=await mover(),b=await mover()
  a.advanceTime(1000)
  for(let i=0;i<10;i++)b.advanceTime(100)
  expect(sample(a).p.x).toBeCloseTo(sample(b).p.x,6)
})
it.each(['0','-1','.01','.044'])('disables an existing move with invalid tau %s',async tau=>{
  const s=await mover(undefined,true,`llMoveToTarget(<-4,0,0>,${tau});`);s.advanceTime(300)
  const held=sample(s).p
  action(s,4)
  s.advanceTime(5000)
  expect(sample(s).p).toEqual(held)
})
it.each(['.044444','.044444444'])('accepts measured minimum tau %s',async tau=>{
  const s=await mover(`llMoveToTarget(<2,0,0>,${tau});`);s.advanceTime(1000)
  expect(sample(s).p.x).toBeCloseTo(2,5)
})
it.each([[64,true],[64.01,false],[64.9,false],[65,false],[65.1,false]])(
  'validates distance %s',async(distance,moves)=>{
    const s=await mover(`llMoveToTarget(<${distance},0,0>,10);`);s.advanceTime(1000)
    expect(sample(s).p.x>0).toBe(moves)
  })
it('a distant replacement cancels existing movement',async()=>{
  const s=await mover(undefined,true,'llMoveToTarget(llGetPos()+<65,0,0>,1);');s.advanceTime(300);const held=sample(s).p
  action(s,4)
  s.advanceTime(5000);expect(sample(s).p).toEqual(held)
})
it('stores a nonphysical move and pauses it while physics is disabled',async()=>{
  const s=await mover(undefined,false);s.advanceTime(1000)
  expect(sample(s).p.x).toBe(0)
  action(s,1);s.advanceTime(1000);expect(sample(s).p.x).toBeCloseTo(2.528,2)
  action(s,2);const held=sample(s).p;s.advanceTime(1000);expect(sample(s).p).toEqual(held)
  action(s,1);s.advanceTime(1000);expect(sample(s).p.x).toBeCloseTo(3.459,2)
})
it('stop holds position and rotation without coasting',async()=>{
  const s=await mover('llMoveToTarget(<4,0,0>,1);llRotLookAt(llEuler2Rot(<0,0,PI_BY_TWO>),1,1);')
  s.advanceTime(300);action(s,0);const held=sample(s)
  s.advanceTime(10000);expect(sample(s)).toEqual(held)
})
it('a replacement starts at the current position',async()=>{
  const s=await mover();s.advanceTime(1000)
  await callOn(s,'llMoveToTarget(<0,0,0>,1);');s.advanceTime(1000)
  expect(sample(s).p.x).toBeCloseTo(.930,2)
})
it.each(['llLookAt(<4,0,0>,1,1);','llRotLookAt(llEuler2Rot(<0,PI_BY_TWO,0>),1,1);'])(
  'snaps a nonphysical look request: %s',async call=>{
    const s=await mover(call,false);const {r}=sample(s)
    expect(r.y).toBeCloseTo(Math.SQRT1_2,5);expect(r.s).toBeCloseTo(Math.SQRT1_2,5)
  })
it.each(['.2','1','2'])('converges physical rotation with strength %s',async strength=>{
  const s=await mover(`llRotLookAt(llEuler2Rot(<0,0,PI_BY_TWO>),${strength},1);`)
  expect(sample(s).r.z).toBe(0);s.advanceTime(200)
  expect(sample(s).r.z).toBeGreaterThan(0);expect(sample(s).r.z).toBeLessThan(.70711)
  s.advanceTime(30000);expect(sample(s).r.z).toBeCloseTo(Math.SQRT1_2,4)
})
it('uses strength and damping, capping damping at one',async()=>{
  const a=await mover('llRotLookAt(llEuler2Rot(<0,0,PI_BY_TWO>),1,1);')
  const b=await mover('llRotLookAt(llEuler2Rot(<0,0,PI_BY_TWO>),2,1);')
  const c=await mover('llRotLookAt(llEuler2Rot(<0,0,PI_BY_TWO>),1,2);')
  const d=await mover('llRotLookAt(llEuler2Rot(<0,0,PI_BY_TWO>),1,.2);')
  for(const s of [a,b,c,d])s.advanceTime(500)
  expect(sample(a).r.z).toBeGreaterThan(sample(b).r.z)
  expect(sample(a).r).toEqual(sample(c).r)
  expect(sample(d).r.z).toBeGreaterThan(sample(a).r.z)
})
it.each(['0','-1','.01','.044'])('invalid physical strength %s stops turning',async strength=>{
  const s=await mover('llRotLookAt(llEuler2Rot(<0,0,PI_BY_TWO>),1,1);',true,`llRotLookAt(llEuler2Rot(<0,0,-PI_BY_TWO>),${strength},1);`)
  s.advanceTime(300);const held=sample(s).r
  action(s,4)
  s.advanceTime(5000);expect(sample(s).r).toEqual(held)
})
it('accepts .044444 physical strength',async()=>{
  const s=await mover('llRotLookAt(llEuler2Rot(<0,0,PI_BY_TWO>),.044444,1);')
  s.advanceTime(1000);expect(sample(s).r.z).toBeCloseTo(Math.SQRT1_2,4)
})
it.each(['0','-1'])('clamps low damping %s to a fast response',async damping=>{
  const s=await mover(`llRotLookAt(llEuler2Rot(<0,0,PI_BY_TWO>),1,${damping});`)
  s.advanceTime(2000);expect(sample(s).r.z).toBeCloseTo(Math.SQRT1_2,4)
})
it('allows small positive nonphysical strength but rejects zero',async()=>{
  const s=await mover('llRotLookAt(llEuler2Rot(<0,0,PI_BY_TWO>),.01,1);',false)
  expect(sample(s).r.z).toBeCloseTo(Math.SQRT1_2,5)
  await callOn(s,'llRotLookAt(ZERO_ROTATION,0,1);')
  expect(sample(s).r.z).toBeCloseTo(Math.SQRT1_2,5)
})
it('points the positive Z axis toward the llLookAt position',async()=>{
  const s=await mover('llLookAt(<4,0,0>,1,1);');s.advanceTime(10000)
  const {r}=sample(s)
  expect(r.y).toBeCloseTo(Math.SQRT1_2,4);expect(r.z).toBe(0)
})
it('keeps movement and look-at active across a state change',async()=>{
  const s=await mover('llMoveToTarget(<4,0,0>,1);llRotLookAt(llEuler2Rot(<0,0,PI_BY_TWO>),1,1);')
  s.advanceTime(300);action(s,3);s.advanceTime(1000)
  expect(sample(s).p.x).toBeGreaterThan(2);expect(sample(s).r.z).toBeGreaterThan(.4)
})
it('script reset clears its move and look requests',async()=>{
  const s=await mover('',true)
  // The controller starts requests on touch so reset cannot immediately reissue them.
  const owner=await loadScript({host:s.host,scriptName:'owner',source:`default{
    touch_start(integer n){llMoveToTarget(<4,0,0>,1);llRotLookAt(llEuler2Rot(<0,0,PI_BY_TWO>),1,1);}}`})
  owner.start();owner.fire('touch_start',{num_detected:1});s.advanceTime(300)
  owner.reset();const held=sample(s);s.advanceTime(5000)
  expect(sample(s)).toEqual(held)
})

it('reset still finds its requests after the root gains child prims',async()=>{
  const s=await mover('',true)
  const owner=await loadScript({host:s.host,scriptName:'owner',source:`default{
    touch_start(integer n){llMoveToTarget(<4,0,0>,1);llRotLookAt(llEuler2Rot(<0,0,PI_BY_TWO>),1,1);}}`})
  owner.start();owner.fire('touch_start',{num_detected:1});s.advanceTime(300)
  const child=await mover('',false)
  s.linkset.absorb(child.linkset)
  owner.reset();const held=sample(s);s.advanceTime(5000)
  expect(sample(s)).toEqual(held)
})
it('reset of a different script leaves the active requests alone',async()=>{
  const s=await mover('llMoveToTarget(<4,0,0>,1);llRotLookAt(llEuler2Rot(<0,0,PI_BY_TWO>),1,1);')
  const other=await callOn(s,'');s.advanceTime(300);other.reset();s.advanceTime(1000)
  expect(sample(s).p.x).toBeGreaterThan(2)
  expect(sample(s).r.z).toBeGreaterThan(.4)
})


// In-world: ownership{,-compete,-invalid,-reset-order}.py -> the first initiating
// script can stop/reset the controller. A sibling can retarget it, but cannot stop
// it or invalidate it with a rejected request. Reset of the initiator still stops it.
it.each(['llStopMoveToTarget();llStopLookAt();',
  'llMoveToTarget(<-4,0,0>,0);llRotLookAt(ZERO_ROTATION,0,1);'])(
  'a sibling cannot cancel the initiator with %s',async call=>{
    const s=await mover('llMoveToTarget(<4,0,0>,1);llRotLookAt(llEuler2Rot(<0,0,PI_BY_TWO>),1,1);')
    s.advanceTime(300);await callOn(s,call);s.advanceTime(1000)
    expect(sample(s).p.x).toBeGreaterThan(2);expect(sample(s).r.z).toBeGreaterThan(.4)
  })
it('a sibling retargets the shared controller without taking stop ownership',async()=>{
  const s=await mover('llMoveToTarget(<4,0,0>,1);llRotLookAt(llEuler2Rot(<0,0,PI_BY_TWO>),1,1);')
  s.advanceTime(300)
  const other=await loadScript({host:s.host,scriptName:'other',source:`default{
    touch_start(integer n){llMoveToTarget(<0,2,0>,1);llRotLookAt(llEuler2Rot(<0,0,-PI_BY_TWO>),1,1);}
    link_message(integer a,integer b,string c,key d){llStopMoveToTarget();llStopLookAt();}}`})
  other.start();other.reset();other.fire('touch_start',{num_detected:1})
  other.fire('link_message',{sender_num:1,num:0,str:'',id:''});s.advanceTime(1000)
  expect(sample(s).p.y).toBeGreaterThan(1);expect(sample(s).r.z).toBeLessThan(0)
  // The initiator's stop still applies after another script changed both targets.
  action(s,0);const held=sample(s);s.advanceTime(5000);expect(sample(s)).toEqual(held)
})
it('reset of the initiator clears a controller retargeted by a sibling',async()=>{
  const s=await mover('',true)
  const owner=await loadScript({host:s.host,scriptName:'owner',source:`default{
    touch_start(integer n){llMoveToTarget(<4,0,0>,1);llRotLookAt(llEuler2Rot(<0,0,PI_BY_TWO>),1,1);}}`})
  owner.start();owner.fire('touch_start',{num_detected:1});s.advanceTime(300)
  await callOn(s,'llMoveToTarget(<0,2,0>,1);llRotLookAt(llEuler2Rot(<0,0,-PI_BY_TWO>),1,1);')
  owner.reset();const held=sample(s);s.advanceTime(5000);expect(sample(s)).toEqual(held)
})
// In-world: rare-drive.py -> coincident look flips 180 degrees about X, zero
// quaternion becomes identity, and a nonphysical look has no latent controller.
it('uses the measured coincident-target look rotation',async()=>{
  const s=await mover('llSetLocalRot(llEuler2Rot(<0,0,PI_BY_TWO>));llLookAt(llGetPos(),1,1);',false)
  expect(sample(s).r).toEqual({x:1,y:0,z:0,s:0})
})
it('normalizes a zero look quaternion to identity',async()=>{
  const s=await mover('llSetLocalRot(llEuler2Rot(<0,0,PI_BY_TWO>));llRotLookAt(<0,0,0,0>,1,1);',false)
  expect(sample(s).r).toEqual({x:0,y:0,z:0,s:1})
})
it('does not keep a latent nonphysical look after physics is enabled',async()=>{
  const s=await mover('llLookAt(<4,0,0>,1,1);llSetLocalRot(ZERO_ROTATION);llSetStatus(STATUS_PHYSICS,TRUE);',false)
  s.advanceTime(5000);expect(sample(s).r).toEqual({x:0,y:0,z:0,s:1})
})
// In-world: target-snapshot.py -> scripted derez/re-rez retains the original
// region target and both controllers. Reset then removes control; real physical
// inertia can coast afterward, which this kinematic model deliberately omits.
it('copies plain target state onto a fresh inventory clock and rebinds reset ownership',async()=>{
  const s=await mover('',true)
  const owner=await loadScript({host:s.host,scriptName:'owner',source:`default{
    touch_start(integer n){llMoveToTarget(<4,0,0>,1);llRotLookAt(llEuler2Rot(<0,0,PI_BY_TWO>),1,1);}}`})
  owner.start();owner.fire('touch_start',{num_detected:1});s.advanceTime(300)
  const saved=s.linkset.copy(),copy=saved.prims[0]!,script=copy.findScript(s.scriptName)!
  const before=sample(s)
  saved.advanceTime(1000)
  expect(copy.params.position.x).toBeGreaterThan(2)
  expect(sample(s)).toEqual(before)
  copy.findScript('owner')!.reset();const held=sample(script)
  saved.advanceTime(5000);expect(sample(script)).toEqual(held)
})

it('keeps coupled move/look independent of clock partitions and unrelated timers',async()=>{
  const call='llMoveToTarget(<4,0,0>,1);llLookAt(<0,4,0>,1,1);'
  const a=await mover(call),b=await mover(call),c=await mover(call)
  await callOn(c,'llSetTimerEvent(.037);')
  a.advanceTime(1033)
  for(let i=0;i<10;i++)b.advanceTime(100)
  b.advanceTime(33);c.advanceTime(1033)
  const want=sample(a)
  for(const other of [b,c]){
    const actual=sample(other)
    expect(actual.p.x).toBeCloseTo(want.p.x,6)
    for(const axis of ['x','y','z','s'] as const)expect(actual.r[axis]).toBeCloseTo(want.r[axis],6)
  }
})

// In-world: target-snapshot-stop{,-long}.py -> restored stops remove control;
// linear/angular inertia then coast beyond the old target. The model omits inertia.
it.each(['stop','reset'])('restored initiator can %s after llRezAtRoot assigns its final key',async mode=>{
  const payload=await mover('',true)
  const source=await loadScript({host:payload.host,scriptName:'owner',source:`default{
    touch_start(integer n){llMoveToTarget(<4,0,0>,1);llRotLookAt(llEuler2Rot(<0,0,PI_BY_TWO>),1,1);}
    link_message(integer a,integer b,string c,key d){llStopMoveToTarget();llStopLookAt();}}`})
  source.start();source.fire('touch_start',{num_detected:1});payload.advanceTime(300)
  const item=makeInventoryItem({name:'payload',type:InventoryType.OBJECT,object:payload.linkset.copy()})
  const world=new World();world.addRegion('test',{x:0,y:0})
  const parent=await loadLinkset({world,region:'test',prims:[{inventory:[item],scripts:[{name:'parent',source:{source:`
    default{state_entry(){llRezAtRoot("payload",<2,2,0>,ZERO_VECTOR,ZERO_ROTATION,0);}}`}}]}]})
  parent.scripts.parent!.start()
  const restored=world.linksets.find(l=>l!==parent.linkset)!,owner=restored.prims[0]!.findScript('owner')!
  restored.advanceTime(300)
  if(mode==='reset')owner.reset()
  else owner.fire('link_message',{sender_num:1,num:0,str:'',id:''})
  const held=structuredClone({p:owner.host.params.position,r:owner.host.params.rotation})
  restored.advanceTime(5000)
  expect({p:owner.host.params.position,r:owner.host.params.rotation}).toEqual(held)
})

it('reanchors coupled integration after an external pose change',async()=>{
  const call='llMoveToTarget(<4,0,0>,1);llLookAt(<0,4,0>,1,1);'
  const a=await mover(call),b=await mover(call)
  for(const s of [a,b]){s.advanceTime(137);s.host.params.position={x:1,y:1,z:0}}
  a.advanceTime(1000);for(let i=0;i<10;i++)b.advanceTime(100)
  expect(sample(a).p.x).toBeCloseTo(2.896,2)
  expect(sample(a).p.y).toBeCloseTo(.368,2)
  for(const axis of ['x','y','z','s'] as const)expect(sample(a).r[axis]).toBeCloseTo(sample(b).r[axis],6)
})
it('reanchors coupled integration when the script replaces its target',async()=>{
  const call='llMoveToTarget(<4,0,0>,1);llLookAt(<0,4,0>,1,1);'
  const replacement='llMoveToTarget(<0,4,0>,1);llLookAt(<4,0,0>,1,1);'
  const a=await mover(call,true,replacement),b=await mover(call,true,replacement)
  for(const s of [a,b]){s.advanceTime(137);action(s,4)}
  a.advanceTime(1033);for(let i=0;i<10;i++)b.advanceTime(100);b.advanceTime(33)
  expect(sample(a).p.y).toBeGreaterThan(2)
  for(const axis of ['x','y','z','s'] as const)expect(sample(a).r[axis]).toBeCloseTo(sample(b).r[axis],6)
})

// https://wiki.secondlife.com/wiki/LlLookAt#Caveats documents caller-side root
// rotation compensation for child prims. In-world: child-look.py (Aditi, SLua
// Tideland, 2026-11-01), root yaw 90: raw llLookAt and local llRotLookAt give
// world +Z = +Y; compensating the llLookAt direction with /root rotation gives +X.
it.each([
  ['llLookAt(llGetPos()+<4,0,0>,1,1);',0,1],
  ['llLookAt(llGetPos()+<4,0,0>/llGetRootRotation(),1,1);',1,0],
  ['llRotLookAt(llEuler2Rot(<0,PI_BY_TWO,0>),1,1);',0,1],
] as const)('preserves the documented child look-at convention: %s',async(call,x,y)=>{
  const f=await loadLinkset({prims:[{}, {scripts:[{name:'child',source:{source:`vector up;
    default{state_entry(){${call}up=<0,0,1>*(llGetLocalRot()*llGetRootRotation());}}`}}]}]})
  f.prims[0]!.params.rotation={x:0,y:0,z:Math.SQRT1_2,s:Math.SQRT1_2}
  const s=f.scripts.child!;s.start();const up=s.global('up') as Vector
  expect(up.x).toBeCloseTo(x,5);expect(up.y).toBeCloseTo(y,5);expect(up.z).toBeCloseTo(0,5)
})
