import { describe, expect, it } from 'vitest'
import { loadLinkset } from '../src/index.js'

// https://wiki.secondlife.com/wiki/Moving_start
// https://wiki.secondlife.com/wiki/Moving_end
// In-world: a 0.5 m convex-hull box on the platform above SLua Tideland, with a script that
// logged moving_start and moving_end with the time since each command, and a child prim whose
// own script logged the same (Aditi, SLua Tideland, 2026-11-23, Firestorm headless).
const logger = `list log; float t0;
  add(string s) { log += s + " " + (string)llRound((llGetTime() - t0) * 10); }`
const handlers = `moving_start() { add("moving_start"); }
    moving_end() { add("moving_end"); }`
const mover = `${logger}
  default {
    ${handlers}
    state_entry() { llSetPrimitiveParams([PRIM_PHYSICS_SHAPE_TYPE, PRIM_PHYSICS_SHAPE_CONVEX]); }
    link_message(integer f, integer n, string m, key id) {
      t0 = llGetTime();
      if (m == "kfm") llSetKeyframedMotion([<0, 0, 0.5>, 1.0, <0, 0, -0.5>, 1.0], [KFM_DATA, KFM_TRANSLATION]);
      else if (m == "long") llSetKeyframedMotion([<0, 0, 1.0>, 3.0], [KFM_DATA, KFM_TRANSLATION]);
      else if (m == "pause") llSetKeyframedMotion([], [KFM_COMMAND, KFM_CMD_PAUSE]);
      else if (m == "play") llSetKeyframedMotion([], [KFM_COMMAND, KFM_CMD_PLAY]);
      else if (m == "stop") llSetKeyframedMotion([], [KFM_COMMAND, KFM_CMD_STOP]);
      else if (m == "clear") llSetKeyframedMotion([], []);
      else if (m == "regionpos") { llSetRegionPos(llGetPos() + <0, 0, 0.5>); llSleep(1.0); llSetRegionPos(llGetPos() - <0, 0, 0.5>); }
      else if (m == "same") llSetRegionPos(llGetPos());
      else if (m == "setpos") { llSetPos(llGetPos() + <0, 0, 0.5>); llSleep(1.0); llSetPos(llGetPos() - <0, 0, 0.5>); }
    }
  }`

async function object() {
  const { linkset, scripts } = await loadLinkset({
    prims: [
      { scripts: [{ name: 'mover', source: { source: mover } }] },
      { scripts: [{ name: 'child', source: { source: `${logger} default { ${handlers} }` } }] },
    ],
  })
  linkset.prims[0]!.params.position = { x: 128, y: 128, z: 100 }
  const root = scripts.mover!, child = scripts.child!
  root.start()
  child.start()
  const send = (m: string) => root.fire('link_message', { sender_num: 0, num: 0, str: m, id: '' })
  return { linkset, root, child, send }
}

describe('moving_start and moving_end', () => {
  // In-world: llSetKeyframedMotion up 0.5 m and back over 2 s -> moving_start at 0,
  // moving_end at 2.0 s; the child prim's script got both too.
  it('frame keyframed motion from its start to its end, in every prim', async () => {
    const o = await object()
    o.send('kfm')
    o.linkset.advanceTime(3_000)
    expect(o.root.global('log')).toEqual(['moving_start 0', 'moving_end 20'])
    expect((o.child.global('log') as string[]).map((line) => line.split(' ')[0])).toEqual(['moving_start', 'moving_end'])
  })

  // In-world: a 3 s motion paused 1 s in, played again 2 s later -> moving_end at the pause,
  // moving_start at the play and moving_end when the rest had run. Stopped or cleared 1 s
  // into the motion -> moving_end at once.
  it('ends at a pause and starts again at play', async () => {
    const o = await object()
    o.send('long')
    o.linkset.advanceTime(1_000)
    o.send('pause')
    o.linkset.advanceTime(2_000)
    o.send('play')
    o.linkset.advanceTime(3_000)
    expect(o.root.global('log')).toEqual(['moving_start 0', 'moving_end 0', 'moving_start 0', 'moving_end 20'])
  })

  it.each(['stop', 'clear'])('ends at a %s command', async (command) => {
    const o = await object()
    o.send('long')
    o.linkset.advanceTime(1_000)
    o.send(command)
    o.linkset.advanceTime(3_000)
    expect(o.root.global('log')).toEqual(['moving_start 0', 'moving_end 0'])
  })

  // In-world: llSetRegionPos up 0.5 m, a 1 s sleep and llSetRegionPos back -> one
  // moving_start and one moving_end, both after the handler: the second move raised nothing
  // while the first move's events waited. llSetRegionPos to where the object
  // already was -> neither.
  it('starts and ends together when llSetRegionPos moves the object', async () => {
    const o = await object()
    o.send('regionpos')
    o.linkset.advanceTime(2_000)
    expect(o.root.global('log')).toEqual(['moving_start 10', 'moving_end 10'])
  })

  it('raises nothing for llSetRegionPos to where the object is', async () => {
    const o = await object()
    o.send('same')
    o.linkset.advanceTime(1_000)
    expect(o.root.global('log')).toEqual([])
  })

  // In-world: llSetPos up 0.5 m, a 1 s sleep and llSetPos back -> neither event.
  it('raises nothing for llSetPos', async () => {
    const o = await object()
    o.send('setpos')
    o.linkset.advanceTime(2_000)
    expect(o.root.global('log')).toEqual([])
  })

  it('ends a copy of a moving object when its remaining motion has run', async () => {
    const o = await object()
    o.send('long')
    o.linkset.advanceTime(2_000)
    const copy = o.linkset.copy()
    const rezzed = copy.copy()
    rezzed.advanceTime(1_000)
    const log = rezzed.prims[0]!.scripts[0]!.global('log') as string[]
    expect(log.at(-1)).toBe('moving_end 30')
  })
})
