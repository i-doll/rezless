import { expect, it } from 'vitest'
import { loadScript, loadLinkset } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlTarget
// https://wiki.secondlife.com/wiki/LlRotTarget
// In-world: batch.py, rounds.py, follow.py, fixed.py, cap.py, busy.py and final.py
// -> strict thresholds, 44 ms stationary cadence, per-script handles starting at 1,
// independent newest-eight caps, root coordinates, state survival and queued event retention.
// Aditi, SLua Tideland, Mono, 2026-10-31 / 2026-11-01. Drivers/results: /tmp/issue-154-targets/.
it('registers positional and rotational targets and repeatedly reports reaching them', async () => {
  const s = await loadScript({ source: `integer p; integer r; integer hits; integer rotations;
    default { state_entry(){p=llTarget(llGetPos(),1); r=llRotTarget(llGetRot(),.1);}
      at_target(integer n, vector t, vector o){++hits;}
      at_rot_target(integer n, rotation t, rotation o){++rotations;}
    }` })
  s.start()
  expect(s.global('p')).toBeGreaterThan(0)
  expect(s.global('r')).toBeGreaterThan(0)
  s.advanceTime(1000)
  expect(s.global('hits')).toBeGreaterThan(1)
  expect(s.global('rotations')).toBeGreaterThan(1)
})

it('supplies the registered target and current position after movement through prim parameters', async () => {
  const s = await loadScript({ source: `integer h; list out;
    default {state_entry(){h=llTarget(<2,0,0>,.1);llSetLinkPrimitiveParamsFast(LINK_THIS,[PRIM_POSITION,<2,0,0>]);}
      at_target(integer n, vector t, vector p){out=[n,t,p];llTargetRemove(n);}}
  ` })
  s.start()
  s.advanceTime(1000)
  expect(s.global('out')).toEqual([s.global('h'), {x:2,y:0,z:0}, {x:2,y:0,z:0}])
  const out=s.global('out')
  s.advanceTime(1000)
  expect(s.global('out')).toEqual(out)
})

it('reports not_at_target while outside every registered target', async () => {
  const s = await loadScript({ source: `integer misses;
    default {state_entry(){llTarget(<5,0,0>,.1);llTarget(<6,0,0>,.1);}
      not_at_target(){++misses;}}
  ` })
  s.start()
  s.advanceTime(1000)
  expect(s.global('misses')).toBeGreaterThan(1)
})

it.each([
  'llSetPos(<2,0,0>);',
  'llSetPrimitiveParams([PRIM_POSITION,<2,0,0>]);',
  'llSetLinkPrimitiveParams(LINK_THIS,[PRIM_POS_LOCAL,<2,0,0>]);',
])('checks position after %s', async (move) => {
  const s = await loadScript({ source: `integer h; integer hits;
    default {state_entry(){h=llTarget(<2,0,0>,.1);${move}}
      at_target(integer n,vector t,vector p){++hits;llTargetRemove(n);}}
  ` })
  s.start();s.advanceTime(1000)
  expect(s.global('hits')).toBe(1)
})

it.each([
  'llSetRot(llEuler2Rot(<0,0,PI_BY_TWO>));',
  'llSetLocalRot(llEuler2Rot(<0,0,PI_BY_TWO>));',
  'llSetPrimitiveParams([PRIM_ROTATION,llEuler2Rot(<0,0,PI_BY_TWO>)]);',
  'llSetLinkPrimitiveParamsFast(LINK_THIS,[PRIM_ROT_LOCAL,llEuler2Rot(<0,0,PI_BY_TWO>)]);',
])('checks rotation after %s', async (rotate) => {
  const s = await loadScript({ source: `integer h;list out;
    default {state_entry(){h=llRotTarget(llEuler2Rot(<0,0,PI_BY_TWO>),.1);${rotate}}
      at_rot_target(integer n,rotation t,rotation r){out=[n,llAngleBetween(t,r)];llRotTargetRemove(n);}}
  ` })
  s.start();s.advanceTime(1000)
  const out = s.global('out') as number[]
  expect(out[0]).toBe(s.global('h'))
  expect(out[1]).toBeLessThan(.001)
})

async function stationary(register: string, extra = '') {
  const s = await loadScript({ source: `list reached; list rotations; integer missed; integer rotmissed; list payload;
    default {state_entry(){${register}}
      at_target(integer n,vector t,vector p){reached+=[n];payload=[t,p];${extra}}
      not_at_target(){++missed;}
      at_rot_target(integer n,rotation t,rotation r){rotations+=[n];payload=[t,r];${extra}}
      not_at_rot_target(){++rotmissed;}
    }` })
  s.start()
  s.advanceTime(1000)
  return s
}

it.each([[0,0,0], [0,-1,1], [1,1,0], [1,.999,0], [1,1.001,1], [.5,-1,1], [1,-1,0]])(
  'uses strict squared distance at distance %s and range %s', async (distance, range, hit) => {
    // In-world: rounds.py pos-zero/negative/boundary/below/above; last.py negative offset.
    const s = await stationary(`llTarget(<${distance},0,0>,${range});`)
    expect((s.global('reached') as unknown[]).length > 0).toBe(Boolean(hit))
    expect(Number(s.global('missed')) > 0).toBe(!hit)
  })

it.each([['0',0], ['-1',0], ['PI_BY_TWO',0], ['PI_BY_TWO-.001',0], ['PI_BY_TWO+.001',1], ['10',1]])(
  'uses a strict rotational threshold of %s', async (range, hit) => {
    // In-world: rounds.py rot-zero/negative/boundary/below/above; follow.py rot-too-large.
    const s = await stationary(`llRotTarget(llEuler2Rot(<0,0,PI_BY_TWO>),${range});`)
    expect((s.global('rotations') as unknown[]).length > 0).toBe(Boolean(hit))
    expect(Number(s.global('rotmissed')) > 0).toBe(!hit)
  })

it.each(['<0,0,0,-1>','<0,0,0,2>','<0,0,0,0>'])('normalizes rotational target %s', async rotation => {
  const s = await stationary(`llRotTarget(${rotation},.1);`, 'llRotTargetRemove(n);')
  expect(s.global('rotations')).toEqual([1])
  const payload = s.global('payload') as {x:number;y:number;z:number;s:number}[]
  expect(Math.abs(payload[0]!.s)).toBe(1)
  expect(payload[0]!.x).toBe(0)
})

it('allocates handles in one per-script sequence, without reusing removed handles', async () => {
  const s = await loadScript({source:`list ids;default {state_entry(){
    integer p=llTarget(ZERO_VECTOR,1);integer r=llRotTarget(ZERO_ROTATION,.1);
    llTargetRemove(p);llRotTargetRemove(r);
    ids=[p,r,llTarget(ZERO_VECTOR,1),llRotTarget(ZERO_ROTATION,.1)];
  }}`})
  s.start()
  expect(s.global('ids')).toEqual([1,2,3,4])
})

it('keeps the newest eight of each target kind independently and emits them in registration order', async () => {
  const s = await stationary(`integer i;for(i=0;i<10;++i)llTarget(ZERO_VECTOR,1);
    for(i=0;i<10;++i)llRotTarget(ZERO_ROTATION,.1);`)
  const p=s.global('reached') as number[], r=s.global('rotations') as number[]
  expect(p.slice(0,8)).toEqual([3,4,5,6,7,8,9,10])
  expect(r.slice(0,8)).toEqual([13,14,15,16,17,18,19,20])
  expect(new Set(p)).toEqual(new Set([3,4,5,6,7,8,9,10]))
  expect(new Set(r)).toEqual(new Set([13,14,15,16,17,18,19,20]))
})

it('reports matches rather than not_at when only some targets are reached', async () => {
  const s = await stationary(`llTarget(ZERO_VECTOR,1);llTarget(<4,0,0>,1);
    llRotTarget(ZERO_ROTATION,.1);llRotTarget(llEuler2Rot(<0,0,PI>),.1);`)
  expect(new Set(s.global('reached') as number[])).toEqual(new Set([1]))
  expect(new Set(s.global('rotations') as number[])).toEqual(new Set([3]))
  expect(s.global('missed')).toBe(0)
  expect(s.global('rotmissed')).toBe(0)
})

it('preserves one queued event per target while a handler sleeps, including after removal', async () => {
  // In-world: busy.py -> busy=2,1 seq=1,2 after sleeping and removing all three registrations.
  const s = await stationary(`integer a=llTarget(ZERO_VECTOR,1);integer b=llTarget(ZERO_VECTOR,1);
    integer r=llRotTarget(ZERO_ROTATION,.1);llSleep(1);
    llTargetRemove(a);llTargetRemove(b);llRotTargetRemove(r);`)
  expect(s.global('reached')).toEqual([1,2])
  expect(s.global('rotations')).toEqual([3])
})

it('does not reuse a removal function for a different target kind or an unknown handle', async () => {
  const s = await stationary(`integer p=llTarget(ZERO_VECTOR,1);integer r=llRotTarget(ZERO_ROTATION,.1);
    llRotTargetRemove(p);llTargetRemove(r);llTargetRemove(-1);llRotTargetRemove(999);`)
  expect((s.global('reached') as number[]).length).toBeGreaterThan(1)
  expect((s.global('rotations') as number[]).length).toBeGreaterThan(1)
})

it('removes a target before its first check without emitting events', async () => {
  const s = await stationary(`llTargetRemove(0);llRotTargetRemove(0);
    integer p=llTarget(ZERO_VECTOR,1);integer r=llRotTarget(ZERO_ROTATION,.1);llTargetRemove(p);llRotTargetRemove(r);`)
  expect(s.global('reached')).toEqual([])
  expect(s.global('rotations')).toEqual([])
  expect(s.global('missed')).toBe(0)
  expect(s.global('rotmissed')).toBe(0)
})

it('keeps targets across state changes and clears them on reset with the handle counter', async () => {
  const s = await loadScript({source:`list reached;integer h;
    default {state_entry(){if(llLinksetDataRead("reset")==""){h=llTarget(ZERO_VECTOR,1);state next;}}}
    state next {at_target(integer n,vector t,vector p){reached+=[n];}
      touch_start(integer n){llLinksetDataWrite("reset","1");llResetScript();}}
  `})
  s.start();s.advanceTime(1000)
  expect((s.global('reached') as number[]).length).toBeGreaterThan(1)
  s.fire('touch_start')
  s.advanceTime(1000)
  expect(s.global('reached')).toEqual([])
  expect(s.linkset.clock.pendingEvents()).toEqual([])
  s.mock('llLinksetDataRead',()=>'')
  s.reset()
  expect(s.global('h')).toBe(1)
})

it('does not send target events to another script in the same prim', async () => {
  const source=`integer hits;default{at_target(integer n,vector t,vector p){++hits;}}`
  const {scripts,linkset}=await loadLinkset({prims:[{scripts:[
    {name:'registrar',source:{source:`integer h;default{state_entry(){h=llTarget(ZERO_VECTOR,1);}}`}},
    {name:'observer',source:{source}},
  ]}]})
  scripts.registrar!.start();scripts.observer!.start();linkset.advanceTime(1000)
  expect(scripts.registrar!.global('h')).toBe(1)
  expect(scripts.observer!.global('hits')).toBe(0)
})

it('checks a child script against the current root position and rotation as the root moves', async () => {
  // In-world: fixed.py child -> child target 0, root target 45 matches; final.py moves/rotates out and back.
  const {scripts,linkset}=await loadLinkset({prims:[
    {scripts:[{name:'root',source:{source:`default {touch_start(integer n){llSetLinkPrimitiveParamsFast(1,[PRIM_POSITION,<2,0,0>,PRIM_ROTATION,llEuler2Rot(<0,0,PI_BY_TWO>)]);}}`}}]},
    {scripts:[{name:'child',source:{source:`list reached;list rotations;
      default{state_entry(){llSetPos(<1,0,0>);llTarget(llGetPos(),.1);llTarget(llGetRootPosition(),.1);llRotTarget(llEuler2Rot(<0,0,PI_BY_TWO>),.1);}
      at_target(integer n,vector t,vector p){reached+=[n];}at_rot_target(integer n,rotation t,rotation r){rotations+=[n];}}`}}]},
  ]})
  scripts.child!.start();linkset.advanceTime(1000)
  expect(new Set(scripts.child!.global('reached') as number[])).toEqual(new Set([2]))
  scripts.root!.fire('touch_start');linkset.advanceTime(1000)
  expect(new Set(scripts.child!.global('rotations') as number[])).toEqual(new Set([3]))
})

// In-world: edge-settings.py -> hits 72 before stop, 72 while stopped, 106 after resume
// (Aditi, SLua Tideland, 2026-11-01).
it('stops producing events while disabled and after deletion', async () => {
  const s=await stationary('llTarget(ZERO_VECTOR,1);')
  const old=s.global('reached')
  s.running=false;s.advanceTime(1000)
  expect(s.global('reached')).toEqual(old)
  s.running=true;s.advanceTime(1000)
  expect((s.global('reached') as number[]).length).toBeGreaterThan((old as number[]).length)
  s.markDead();const last=s.global('reached');s.advanceTime(1000)
  expect(s.global('reached')).toEqual(last)
})

it.each([[.00001,false],[.0001,false],[.001,true],[0,false]])('uses single precision at tolerance %s for an identical quarter-turn target',async(range,hit)=>{
  // In-world: edge-settings.py rotedge -> no, no, yes, no at these tolerances
  // after llSetRot(90 degrees), targeting llGetRot() (Aditi, SLua Tideland, 2026-11-01).
  const s=await stationary(`llSetRot(llEuler2Rot(<0,0,PI_BY_TWO>));llRotTarget(llGetRot(),${range});`)
  expect((s.global('rotations') as number[]).length>0).toBe(hit)
  expect(Number(s.global('rotmissed'))>0).toBe(!hit)
})
