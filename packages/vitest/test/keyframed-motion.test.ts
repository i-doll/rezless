import { expect, it } from 'vitest'
import { loadScript, loadLinkset } from '../src/index.js'
import { World, type Script } from '@rezless/vm'

// https://wiki.secondlife.com/wiki/LlSetKeyframedMotion
// https://wiki.secondlife.com/wiki/LlSetRegionPos
// In-world: /tmp/issue-156-probes/{unselected,follow,edges,replacement,last,linkset,rotations3}.py
// Aditi, SLua Tideland, Mono, 2026-11-01. Linear translation, quaternion interpolation,
// original-origin loop, inverse reverse frames, retracing ping-pong; pause holds progress,
// stop holds position and play restarts there. Rejected calls preserve prior motion.
// DEBUG_CHANNEL listeners and the error-collector prim captured no diagnostic text.
const convex = 'llSetPrimitiveParams([PRIM_PHYSICS_SHAPE_TYPE,PRIM_PHYSICS_SHAPE_CONVEX]);'
async function motion(frames = '<4,0,0>,ZERO_ROTATION,2.0', options = '', setup = convex) {
  const s = await loadScript({source:`vector p; rotation r;
    default {state_entry(){${setup}llSetKeyframedMotion([${frames}],[${options}]);}
      touch_start(integer n){p=llGetPos();r=llGetRot();}
      link_message(integer sender,integer num,string text,key id){llSetKeyframedMotion([],[KFM_COMMAND,num]);}}
  `})
  s.start()
  return s
}
function position(s: Script) {
  s.fire('touch_start', {num_detected:1})
  return s.global('p')
}
function command(s: Script, num: number) { s.fire('link_message',{sender_num:1,num,str:'',id:''}) }

it('interpolates position and rotation while virtual time advances', async () => {
  const s = await motion('<4,0,0>,llEuler2Rot(<0,0,PI_BY_TWO>),2.0')
  s.advanceTime(1000)
  expect(position(s)).toEqual({x:2,y:0,z:0})
  expect((s.global('r') as {z:number}).z).toBeCloseTo(.382683,5)
  s.advanceTime(1000)
  expect(position(s)).toEqual({x:4,y:0,z:0})
  expect((s.global('r') as {z:number}).z).toBeCloseTo(Math.SQRT1_2,5)
})

it.each([
  ['KFM_FORWARD',1000,2,0], ['KFM_FORWARD',3000,4,2], ['KFM_FORWARD',6000,4,6],
  ['KFM_REVERSE',1000,0,-2], ['KFM_REVERSE',4000,-2,-6], ['KFM_REVERSE',6000,-4,-6],
  ['KFM_LOOP',6000,2,0], ['KFM_LOOP',13000,4,2],
  ['KFM_PING_PONG',6000,4,4], ['KFM_PING_PONG',9000,2,0], ['KFM_PING_PONG',11000,2,0],
])('%s at %s ms follows the measured path', async (mode, ms, x, y) => {
  const s = await motion('<4,0,0>,ZERO_ROTATION,2.0,<0,6,0>,ZERO_ROTATION,3.0',`KFM_MODE,${mode}`)
  s.advanceTime(ms as number)
  expect(position(s)).toEqual({x,y,z:0})
})

it('pauses at the current transform and resumes the unfinished frame', async () => {
  const s = await motion()
  s.advanceTime(500); command(s,2); s.advanceTime(5000)
  expect(position(s)).toEqual({x:1,y:0,z:0})
  command(s,0); s.advanceTime(500)
  expect(position(s)).toEqual({x:2,y:0,z:0})
})
it('stops in place and restarts its first frame from that position', async () => {
  const s = await motion()
  s.advanceTime(500); command(s,1); s.advanceTime(5000)
  expect(position(s)).toEqual({x:1,y:0,z:0})
  command(s,0); s.advanceTime(2000)
  expect(position(s)).toEqual({x:5,y:0,z:0})
})
it('clears motion with an empty list so play cannot restart it', async () => {
  const s = await motion()
  s.advanceTime(500)
  // A second script controls the same prim property.
  const clearer = await loadScript({source:'default {state_entry(){llSetKeyframedMotion([],[]);}}',host:s.host})
  clearer.start(); command(s,0); s.advanceTime(5000)
  expect(position(s)).toEqual({x:1,y:0,z:0})
})

it('uses region axes for translation even when the prim is rotated', async () => {
  const s = await motion('<4,0,0>,2.0','KFM_DATA,KFM_TRANSLATION',`${convex}llSetLocalRot(llEuler2Rot(<0,0,PI_BY_TWO>));`)
  s.advanceTime(1000)
  expect(position(s)).toEqual({x:2,y:0,z:0})
})
it('supports rotation-only frames', async () => {
  const s = await motion('llEuler2Rot(<0,0,PI_BY_TWO>),2.0','KFM_DATA,KFM_ROTATION')
  s.advanceTime(1000)
  expect(position(s)).toEqual({x:0,y:0,z:0})
  expect((s.global('r') as {z:number}).z).toBeCloseTo(.382683,5)
})

// In-world: follow.py time-100/111/112/133/int and replacement.py short-time.
it.each([['.1',0],['.11',0],['1.0/9',1],['.112',1],['6.0/45',1],['1',1]])(
  'validates frame duration %s', async (time, x) => {
    const s = await motion(`<1,0,0>,ZERO_ROTATION,${time}`)
    s.advanceTime(2000)
    expect(position(s)).toEqual({x,y:0,z:0})
  },
)
it.each([
  ['<1,0,0>,1.0',''], ['<1,0,0>,ZERO_ROTATION',''],
  ['1,ZERO_ROTATION,1.0',''], ['<1,0,0>,<0,0,0>,1.0',''],
  ['<1,0,0>,ZERO_ROTATION,"1"',''], ['<1,0,0>,ZERO_ROTATION,1.0,5',''],
  ['<1,0,0>,ZERO_ROTATION,1.0','KFM_MODE'],
  ['<1,0,0>,ZERO_ROTATION,1.0','KFM_MODE,9'],
  ['<1,0,0>,ZERO_ROTATION,1.0','99,1'],
  ['<1,0,0>,1.0','KFM_DATA,0'], ['<1,0,0>,1.0','KFM_DATA,"2"'],
  ['<1,0,0>,ZERO_ROTATION,1.0','KFM_COMMAND,KFM_CMD_PAUSE'],
  ['<1,0,0>,<0,0,0,2>,1.0',''],
  ['<50.2,0,0>,ZERO_ROTATION,.2',''],
])('rejects malformed frames [%s] or options [%s]', async (frames, options) => {
  const s = await motion(frames,options)
  s.advanceTime(2000)
  expect(position(s)).toEqual({x:0,y:0,z:0})
})
it.each(['.9999995','.9999996','1.0000004','1.0000005'])('accepts rotation length %s within measured tolerance', async scalar => {
  const s = await motion(`<1,0,0>,<0,0,0,${scalar}>,1.0`)
  s.advanceTime(2000)
  expect(position(s)).toEqual({x:1,y:0,z:0})
})
it.each(['.999999','1.0000006','1.0000007','1.000001'])('rejects rotation length %s outside measured tolerance', async scalar => {
  const s = await motion(`<1,0,0>,<0,0,0,${scalar}>,1.0`)
  s.advanceTime(2000)
  expect(position(s)).toEqual({x:0,y:0,z:0})
})
it.each([
  'llSetKeyframedMotion([<1,0,0>,1.0],[]);',
  'llSetKeyframedMotion([<1,0,0>,ZERO_ROTATION,1.0],[KFM_MODE,9]);',
  'llSetKeyframedMotion([<1,0,0>,ZERO_ROTATION,.11],[]);',
  'llSetKeyframedMotion([],[KFM_COMMAND,KFM_CMD_PAUSE,KFM_MODE,KFM_LOOP]);',
])('retains existing motion after rejected replacement %s', async replace => {
  const s = await loadScript({source:`vector p;default {state_entry(){${convex}
    llSetKeyframedMotion([<4,0,0>,ZERO_ROTATION,2.0],[]);llSleep(.5);${replace}}
    touch_start(integer n){p=llGetPos();}}`})
  s.start();s.advanceTime(1000)
  expect(position(s)).toEqual({x:3,y:0,z:0})
})
it.each(['',`${convex}llSetPrimitiveParams([PRIM_PHYSICS_SHAPE_TYPE,PRIM_PHYSICS_SHAPE_PRIM]);`,`${convex}llSetStatus(STATUS_PHYSICS,TRUE);`])(
  'does not animate a legacy or physical object with setup %s', async setup => {
    const s = await motion(undefined,undefined,setup)
    s.advanceTime(1000)
    expect(position(s)).toEqual({x:0,y:0,z:0})
  },
)
it('lets a child script animate the whole linkset when a child uses convex physics', async () => {
  // In-world: commands.py linked child call and linkset.py root prim/convex child.
  const {linkset,scripts} = await loadLinkset({prims:[{scripts:[]},{scripts:[{name:'mover',source:{source:`vector p;
    default {state_entry(){${convex}llSetKeyframedMotion([<4,0,0>,ZERO_ROTATION,2.0],[]);}
    touch_start(integer n){p=llGetPos();}}`}}]}]})
  linkset.prims[1]!.params.position={x:0,y:1,z:0}
  const s=scripts.mover!;s.start();s.advanceTime(1000)
  expect(position(s)).toEqual({x:2,y:1,z:0})
  expect(linkset.prims[0]!.regionPosition()).toEqual({x:2,y:0,z:0})
})

// In-world: run.py region and last.py terrain/active-region/physical-detail.
it.each([
  ['<120,60,2000>',1,120,60,2000], ['<120,60,4096>',1,120,60,4096],
  ['<-10,60,2000>',1,-10,60,2000], ['<256,60,2000>',1,256,60,2000],
  ['<-11,60,2000>',0,0,0,0], ['<267,60,2000>',0,0,0,0],
  ['<120,60,4097>',0,0,0,0], ['<120,60,-1>',0,0,0,0],
  ['<120,60,0>',0,120,60,22], ['<120,60,21.95>',1,120,60,22],
  ['<120,60,21.9>',0,120,60,22],
])('sets region position %s with the measured return and no forced delay', async (target, ok,x,y,z) => {
  const s = await loadScript({source:`integer ok;vector p;float t;
    default {state_entry(){ok=llSetRegionPos(${target});p=llGetPos();t=llGetTime();}}`})
  s.start()
  expect(s.global('ok')).toBe(ok)
  expect(s.global('p')).toEqual({x,y,z})
  expect(s.global('t')).toBe(0)
})
it('rejects region moves on physical objects', async () => {
  const s=await loadScript({source:'integer ok;default {state_entry(){llSetStatus(STATUS_PHYSICS,TRUE);ok=llSetRegionPos(<120,60,2000>);}}'})
  s.start();expect(s.global('ok')).toBe(0)
  expect(s.host.regionPosition()).toEqual({x:0,y:0,z:0})
})
it('rejects region moves during playback, but rebases paused motion after a move', async () => {
  const s=await loadScript({source:`integer playing;integer paused;vector p;
    default {state_entry(){${convex}llSetKeyframedMotion([<8,0,0>,ZERO_ROTATION,8.0],[]);
    llSleep(1);playing=llSetRegionPos(<120,60,2000>);
    llSetKeyframedMotion([],[KFM_COMMAND,KFM_CMD_PAUSE]);paused=llSetRegionPos(<120,60,2000>);
    llSetKeyframedMotion([],[KFM_COMMAND,KFM_CMD_PLAY]);}touch_start(integer n){p=llGetPos();}}`})
  s.start();s.advanceTime(1000)
  expect(s.global('playing')).toBe(0);expect(s.global('paused')).toBe(1)
  expect(position(s)).toEqual({x:121,y:60,z:2000})
})
it('samples terrain at the requested destination', async () => {
  const world=new World();world.addRegion('test',{x:0,y:0},{ground:(x,y)=>x+y})
  const {scripts}=await loadLinkset({world,region:'test',prims:[{scripts:[{name:'mover',source:{source:'integer ok;default {state_entry(){ok=llSetRegionPos(<30,40,10>);}}'}}]}]})
  const s=scripts.mover!;s.start()
  expect(s.global('ok')).toBe(0)
  expect(s.host.regionPosition()).toEqual({x:30,y:40,z:70})
})

// In-world: unselected.py samples llGetPos/llGetRot from recurring timer handlers.
it('updates motion before each timer handler during a single large advance', async () => {
  const s=await loadScript({source:`list samples;default {state_entry(){${convex}
    llSetKeyframedMotion([<4,0,0>,ZERO_ROTATION,2.0],[]);llSetTimerEvent(.5);}
    timer(){vector p=llGetPos();samples+=[p.x];}}`})
  s.start();s.advanceTime(2000)
  expect(s.global('samples')).toEqual([1,2,3,4])
})

// In-world: playback.py -> loop and ping-pong resume after multiple cycles.
it.each(['KFM_LOOP','KFM_PING_PONG'])('resumes %s after pausing beyond its first cycle', async mode => {
  const s=await motion(undefined,`KFM_MODE,${mode}`)
  s.advanceTime(8500);command(s,2);s.advanceTime(5000)
  expect(position(s)).toEqual({x:1,y:0,z:0})
  command(s,0);s.advanceTime(500)
  expect(position(s)).toEqual({x:2,y:0,z:0})
})

// In-world: playback.py -> direct play after completion restarts at the final position;
// pause then play after completion remains there; repeated pause preserves a shifted path.
it('restarts completed forward motion from its final position on a direct play command', async () => {
  const s=await motion()
  s.advanceTime(3000);command(s,0);s.advanceTime(500)
  expect(position(s)).toEqual({x:5,y:0,z:0})
})
it('holds a completed motion when pause precedes play', async () => {
  const s=await motion()
  s.advanceTime(3000);command(s,2);command(s,0);s.advanceTime(500)
  expect(position(s)).toEqual({x:4,y:0,z:0})
})
it('preserves the new origin when pause is repeated after repositioning', async () => {
  const s=await loadScript({source:`vector p;default {state_entry(){${convex}
    llSetKeyframedMotion([<8,0,0>,ZERO_ROTATION,8.0],[]);llSleep(1);
    llSetKeyframedMotion([],[KFM_COMMAND,KFM_CMD_PAUSE]);llSetRegionPos(<120,60,2000>);
    llSetKeyframedMotion([],[KFM_COMMAND,KFM_CMD_PAUSE]);llSetKeyframedMotion([],[KFM_COMMAND,KFM_CMD_PLAY]);}
    touch_start(integer n){p=llGetPos();}}`})
  s.start();s.advanceTime(500)
  expect(position(s)).toEqual({x:120.5,y:60,z:2000})
})

// In-world: integration.py and link-latent.py -> linking stops the mover; after unlink, play restarts full frames.
// Aditi, SLua Tideland, Mono, 2026-11-01. Child play leaves the new root stationary, without a captured diagnostic.
it('stops motion before a moving root becomes a child', async () => {
  const world=new World();world.addRegion('test',{x:0,y:0})
  const key='11111111-2222-3333-4444-555555555555'
  await loadLinkset({world,region:'test',position:{x:20,y:0,z:30},prims:[{key,scripts:[]}]})
  const {scripts}=await loadLinkset({world,region:'test',position:{x:10,y:0,z:30},prims:[{scripts:[{name:'mover',source:{source:`
    default {state_entry(){${convex}llSetKeyframedMotion([<4,0,0>,ZERO_ROTATION,2.0],[KFM_MODE,KFM_FORWARD]);
      llRequestPermissions(llGetOwner(),PERMISSION_CHANGE_LINKS);}
      touch_start(integer n){llCreateLink("${key}",FALSE);}
      link_message(integer sender,integer num,string text,key id){if(num==99)llBreakLink(LINK_THIS);else llSetKeyframedMotion([],[KFM_COMMAND,num]);}}`}}]}]})
  const s=scripts.mover!;s.start();s.grantPermissions();s.advanceTime(500)
  const before={...s.host.regionPosition()}
  expect(before).toEqual({x:11,y:0,z:30})
  s.fire('touch_start',{num_detected:1});s.advanceTime(1000)
  expect(s.host.regionPosition()).toEqual(before)
  command(s,0);s.advanceTime(1000)
  expect(s.host.regionPosition()).toEqual(before)
  command(s,99);s.advanceTime(5000)
  expect(s.host.regionPosition()).toEqual(before)
  command(s,0);s.advanceTime(2000)
  expect(s.host.regionPosition()).toEqual({x:15,y:0,z:30})
})

// In-world: snapshot.py and controlled-snapshot.py -> scripted derez preserves active motion.
// Aditi, SLua Tideland, Mono, 2026-11-01. Viewer Take instead drops motion.
it('snapshots a moving object without cloning its live clock callbacks', async () => {
  const s=await motion()
  s.advanceTime(500)
  const snapshot=s.linkset.copy()
  expect(snapshot.prims[0]!.regionPosition()).toEqual({x:1,y:0,z:0})
  s.advanceTime(500)
  expect(position(s)).toEqual({x:2,y:0,z:0})
})

// In-world: link-follow.py, root retained -> its existing playback continues (Aditi, SLua Tideland, 2026-11-01).
it('keeps playback when the moving root absorbs a stationary object', async () => {
  const s=await motion()
  const other=await loadLinkset({position:{x:10,y:0,z:0},prims:[{}]})
  s.advanceTime(500)
  s.linkset.absorb(other.linkset)
  s.advanceTime(500)
  expect(position(s)).toEqual({x:2,y:0,z:0})
  expect(s.linkset.prims[1]!.regionPosition()).toEqual({x:11,y:0,z:0})
})

// In-world: cycle-snapshot.py and loop-snapshot.py -> the first partial cycle is rebased,
// then repeating modes return to the original path (Aditi, SLua Tideland, Mono, 2026-11-01).
it.each([['KFM_LOOP',3000],['KFM_LOOP',19000],['KFM_PING_PONG',3000],['KFM_PING_PONG',19000]] as const)(
  'restores %s at %s ms but retains its original path for later cycles', async (mode,ms) => {
  const s=await motion('<8,0,0>,ZERO_ROTATION,8.0',`KFM_MODE,${mode}`)
  s.advanceTime(ms)
  const snapshot=s.linkset.copy()
  const rezzed=snapshot.copy()
  rezzed.prims[0]!.params.position={x:100,y:4,z:30}
  rezzed.clock.advance(1000)
  expect(rezzed.prims[0]!.regionPosition()).toEqual({x:101,y:4,z:30})
  rezzed.clock.advance(mode==='KFM_LOOP'?4000:12000)
  expect(rezzed.prims[0]!.regionPosition()).toEqual({x:0,y:0,z:0})
  rezzed.clock.advance(1000)
  expect(rezzed.prims[0]!.regionPosition()).toEqual({x:1,y:0,z:0})
})
