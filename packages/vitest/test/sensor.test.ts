import { describe, expect, it } from 'vitest'
import { loadLinkset, loadScript, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/llSensor
// https://wiki.secondlife.com/wiki/llSensorRepeat
// https://wiki.secondlife.com/wiki/llSensorRemove
// In-world: round 1 probes, Aditi, SLua Tideland, 2026-10-31.
// Evidence: https://github.com/i-doll/rezless/issues/154#issuecomment-6549980624
async function scanner(body = 'llSensor("", NULL_KEY, PASSIVE, 20, PI);') {
  const world = new World()
  world.addRegion('sensor region', { x: 0, y: 0 })
  const loaded = await loadLinkset({ world, region: 'sensor region', prims: [{
    name: 'scanner', scripts: [{ name: 'scanner', source: { source: `
      list names; list keys; list types; list positions; integer misses;
      list velocities; list rotations; list owners; list groups; list links;
      default {
        state_entry() { ${body} }
        sensor(integer n) {
          integer i;
          for (i = 0; i < n; ++i) {
            names += [llDetectedName(i)]; keys += [llDetectedKey(i)];
            types += [llDetectedType(i)]; positions += [llDetectedPos(i)];
            velocities += [llDetectedVel(i)]; rotations += [llDetectedRot(i)];
            owners += [llDetectedOwner(i)]; groups += [llDetectedGroup(i)];
            links += [llDetectedLinkNumber(i)];
          }
        }
        no_sensor() { ++misses; }
      }
    ` } }],
  }] })
  return { world, ...loaded, script: loaded.scripts['scanner']! }
}

describe('sensors', () => {
  it('fires no_sensor when the world has no other objects', async () => {
    const { script } = await scanner()
    script.start()
    expect(script.global('misses')).toBe(1)
    expect(script.global('names')).toEqual([])
  })

  it('finds an object placed in the World and supplies detected data', async () => {
    const { script, world } = await scanner()
    const target = await loadLinkset({ world, region: 'sensor region',
      position: { x: 5, y: 0, z: 0 }, prims: [{ name: 'target' }] })
    script.start()
    expect(script.global('names')).toEqual(['target'])
    expect(script.global('keys')).toEqual([target.prims[0]!.key])
    expect(script.global('types')).toEqual([4])
    expect(script.global('positions')).toEqual([{ x: 5, y: 0, z: 0 }])
    expect(script.global('misses')).toBe(0)
  })

  it('waits for the repeat interval before scanning', async () => {
    const { script } = await scanner('llSensorRepeat("", NULL_KEY, PASSIVE, 20, PI, 1);')
    script.start()
    script.advanceTime(999)
    expect(script.global('misses')).toBe(0)
    script.advanceTime(1)
    expect(script.global('misses')).toBe(1)
    script.advanceTime(2000)
    expect(script.global('misses')).toBe(3)
  })
})

// In-world: data.py stage 2 -> group=1, link=0 (Aditi, SLua Tideland, 2026-10-31).
it('exposes an integer group-match result in sensor detected data', async () => {
  const script = await loadScript({ source: `
    integer matched;
    default { sensor(integer n) { matched = llDetectedGroup(0); } }
  ` })
  script.fire('sensor', { num_detected: 1, detected: [
    { key: '11111111-1111-1111-1111-111111111111', name: 'target', group: 1 },
  ] })
  expect(script.global('matched')).toBe(1)
})

// In-world: edges.py/finalprobe.py -> strict range, max 96, nonpositive arc is full sphere;
// dormant/active scripted filters differ from llDetectedType (Aditi, SLua Tideland, 2026-10-31).
describe('measured sensor filters', () => {
  it.each([[1.99, 0], [2, 0], [2.01, 1], [0, -1], [-1, -1]])('range %s produces %s detections', async (radius, hits) => {
    const { script, world } = await scanner(`llSensor("", NULL_KEY, PASSIVE, ${radius}, PI);`)
    await loadLinkset({ world, region: 'sensor region', position: { x: 2, y: 0, z: 0 }, prims: [{ name: 'target' }] })
    script.start()
    expect(script.global('names')).toEqual(hits === 1 ? ['target'] : [])
    expect(script.global('misses')).toBe(hits === 0 ? 1 : 0)
  })

  it('caps the radius at 96 and returns the nearest 32 objects', async () => {
    const { script, world } = await scanner('llSensor("", NULL_KEY, PASSIVE, 1000, PI);')
    for (let i = 34; i >= 1; --i) {
      await loadLinkset({ world, region: 'sensor region', position: { x: i, y: 0, z: 0 }, prims: [{ name: `target ${i}` }] })
    }
    await loadLinkset({ world, region: 'sensor region', position: { x: 96, y: 0, z: 0 }, prims: [{ name: 'boundary' }] })
    script.start()
    expect(script.global('names')).toEqual(Array.from({ length: 32 }, (_, i) => `target ${i + 1}`))
  })

  it.each([[95.99, 1], [96, 0], [97, 0]])('maximum range excludes %s when appropriate', async (distance, hits) => {
    const { script, world } = await scanner('llSensor("", NULL_KEY, PASSIVE, 1000, PI);')
    await loadLinkset({ world, region: 'sensor region', position: { x: distance, y: 0, z: 0 }, prims: [{ name: 'target' }] })
    script.start()
    expect(script.global('names')).toHaveLength(hits)
    expect(script.global('misses')).toBe(1 - hits)
  })

  it.each([[0, 1], [-1, 1], [0.01, 0], [1.56, 0], [1.58, 1], [4, 1]])('uses rotated forward direction for arc %s', async (arc, hits) => {
    const { script, world } = await scanner(`llSetRot(llEuler2Rot(<0,0,PI_BY_TWO>)); llSensor("", NULL_KEY, PASSIVE, 20, ${arc});`)
    await loadLinkset({ world, region: 'sensor region', position: { x: 2, y: 0, z: 0 }, prims: [{ name: 'target' }] })
    script.start()
    expect(script.global('names')).toHaveLength(hits)
    expect(script.global('misses')).toBe(1 - hits)
  })

  it.each([
    ['target', 'NULL_KEY', 1], ['Target', 'NULL_KEY', 0], ['tar', 'NULL_KEY', 0],
    ['target', '"bad"', 1], ['', '"11111111-1111-1111-1111-111111111111"', 1],
    ['wrong', '"11111111-1111-1111-1111-111111111111111"', 0],
    ['wrong', '"11111111-1111-1111-1111-111111111111"', 0],
    ['', '"22222222-2222-2222-2222-222222222222"', 0],
  ])('matches exact name %s and key %s', async (name, key, hits) => {
    const { script, world } = await scanner(`llSensor("${name}", (key)${key}, PASSIVE, 20, PI);`)
    await loadLinkset({ world, region: 'sensor region', position: { x: 2, y: 0, z: 0 }, prims: [{ name: 'target', key: '11111111-1111-1111-1111-111111111111' }] })
    script.start()
    expect(script.global('names')).toHaveLength(hits)
    expect(script.global('misses')).toBe(1 - hits)
  })

  it.each([
    [0, []], [1, []], [2, ['active', 'physical']], [4, ['bare', 'dormant']],
    [8, ['active', 'physical']], [10, ['active', 'physical']],
    [12, ['dormant', 'active', 'physical']], [14, ['dormant', 'active', 'physical']],
  ])('applies type mask %s', async (mask, names) => {
    const { script, world } = await scanner(`llSensor("", NULL_KEY, ${mask}, 20, PI);`)
    for (const [i, name] of ['bare', 'dormant', 'active', 'physical'].entries()) {
      world.addObject({ region: 'sensor region', name, position: { x: i + 1, y: 0, z: 0 },
        scripted: name !== 'bare', active: name === 'active' || name === 'physical', physical: name === 'physical' })
    }
    script.start()
    expect(script.global('names')).toEqual(names)
    expect(script.global('misses')).toBe(mask === 0 || names.length ? 0 : 1)
    if (mask === 12) expect(script.global('types')).toEqual([12, 12, 10])
  })

  it.each([['i Doll', 1, 1], ['i doll', 1, 0], ['i.doll', 16, 1], ['', 1, 1], ['', 9, 0]])('detects avatar name %s with mask %s', async (name, mask, hits) => {
    const { script, world } = await scanner(`llSensor("${name}", NULL_KEY, ${mask}, 20, PI);`)
    world.addAvatar({ region: 'sensor region', key: '11111111-1111-1111-1111-111111111111', name: 'i Doll', username: 'i.doll', position: { x: 2, y: 0, z: 0 } })
    script.start()
    expect(script.global('names')).toHaveLength(hits)
    if (hits) expect(script.global('types')).toEqual([3])
  })

  it('excludes its entire linkset', async () => {
    const { script, linkset, prims } = await scanner('llSensor("", llGetKey(), SCRIPTED | PASSIVE, 20, PI);')
    script.start()
    expect(script.global('misses')).toBe(1)
    expect(script.global('names')).toEqual([])
    expect(linkset.prims).toContain(prims[0])
  })
})

// In-world: repeat/remove probes -> first delayed, replacement, zero once, negative never;
// queued scan survives removal, removal clears current detected context, state stops repeat.
describe('sensor scheduling', () => {
  it.each([[0, 1], [-1, 0]])('handles repeat rate %s', async (rate, misses) => {
    const { script } = await scanner(`llSensorRepeat("", NULL_KEY, PASSIVE, 20, PI, ${rate});`)
    script.start(); script.advanceTime(1000)
    expect(script.global('misses')).toBe(misses)
  })

  it('replaces a repeat and removes it without cancelling a completed queued event', async () => {
    const { script, world } = await scanner(`
      llSensorRepeat("wrong", NULL_KEY, PASSIVE, 20, PI, .1);
      llSensorRepeat("target", NULL_KEY, PASSIVE, 20, PI, .2);
      llSleep(1); llSensorRemove();`)
    await loadLinkset({ world, region: 'sensor region', position: { x: 2, y: 0, z: 0 }, prims: [{ name: 'target' }] })
    script.start(); script.advanceTime(1000)
    expect(script.global('names')).toHaveLength(1)
    expect(script.global('keys')).toEqual(['00000000-0000-0000-0000-000000000000'])
    expect(script.global('misses')).toBe(0)
    script.advanceTime(1000)
    expect(script.global('names')).toHaveLength(1)
  })

  it('cancels a one-shot before it completes', async () => {
    const { script } = await scanner('llSensor("", NULL_KEY, PASSIVE, 20, PI); llSensorRemove();')
    script.start(); script.advanceTime(1000)
    expect(script.global('misses')).toBe(0)
  })

  it('clears detected values inside sensor and stops on state change and reset', async () => {
    const { world } = await scanner()
    world.addObject({ region: 'sensor region', name: 'target', position: { x: 2, y: 0, z: 0 } })
    const { scripts } = await loadLinkset({ world, region: 'sensor region', prims: [{ scripts: [{ name: 'lifecycle', source: { source: `
      key before; key after; integer hits; integer states;
      default { state_entry(){llSensorRepeat("target",NULL_KEY,PASSIVE,20,PI,.2);}
        sensor(integer n){before=llDetectedKey(0);llSensorRemove();after=llDetectedKey(0);++hits;llSensorRepeat("target",NULL_KEY,PASSIVE,20,PI,.2);state done;}}
      state done {state_entry(){++states;} sensor(integer n){++hits;}}
    ` } }] }] })
    const s = scripts['lifecycle']!; s.start(); s.advanceTime(1000)
    expect(s.global('before')).not.toBe('00000000-0000-0000-0000-000000000000')
    expect(s.global('after')).toBe('00000000-0000-0000-0000-000000000000')
    expect(s.global('hits')).toBe(1); expect(s.global('states')).toBe(1)
    s.reset(); s.advanceTime(1000)
    expect(s.global('hits')).toBe(1)
  })
})

// In-world: data.py -> owner/group, position, identity rotation, zero velocity and link 0.
it('snapshots detected fields and compares the target group with the scanner group', async () => {
  const world = new World(); world.addRegion('data', { x: 0, y: 0 })
  const { scripts, linkset } = await loadLinkset({ world, region: 'data', prims: [{ scripts: [{ name: 'data', source: { source: `
    list data; integer missing;
    default { state_entry(){missing=llDetectedGroup(0);llSensor("target",NULL_KEY,PASSIVE,20,PI);}
      sensor(integer n){data=[llDetectedOwner(0),llDetectedGroup(0),llDetectedPos(0),llDetectedRot(0),llDetectedVel(0),llDetectedLinkNumber(0),llDetectedGroup(1)];}}
  ` } }] }] })
  world.sensorProperties.set(linkset, { group: '11111111-1111-1111-1111-111111111111' })
  world.addObject({ region: 'data', name: 'target', owner: '22222222-2222-2222-2222-222222222222', group: '11111111-1111-1111-1111-111111111111', position: { x: 5, y: 0, z: 0 } })
  const s = scripts['data']!; s.start()
  expect(s.global('missing')).toBe(0)
  expect(s.global('data')).toEqual(['22222222-2222-2222-2222-222222222222', 1, { x: 5, y: 0, z: 0 }, { x: 0, y: 0, z: 0, s: 1 }, { x: 0, y: 0, z: 0 }, 0, 0])
})

it('scans the current target position when each repeat completes', async () => {
  const { world, script } = await scanner('llSensorRepeat("target",NULL_KEY,PASSIVE,20,PI,1);')
  const target = world.addObject({ region: 'sensor region', name: 'target', position: { x: 2, y: 0, z: 0 } })
  script.start(); script.advanceTime(1000)
  target.position = { x: 25, y: 0, z: 0 }
  script.advanceTime(1000)
  expect(script.global('names')).toEqual(['target'])
  expect(script.global('positions')).toEqual([{ x: 2, y: 0, z: 0 }])
  expect(script.global('misses')).toBe(1)
})

// In-world: finalprobe.py -> a timer-driven nonphysical script matches ACTIVE and
// SCRIPTED, though llDetectedType remains PASSIVE | SCRIPTED.
it('classifies a loaded timer script separately from its detected type', async () => {
  const { script, world } = await scanner('llSensor("target",NULL_KEY,ACTIVE,20,PI);')
  const target = await loadLinkset({ world, region: 'sensor region', position: { x: 2, y: 0, z: 0 }, prims: [{ name: 'target', scripts: [{ name: 'timer', source: { source: 'default {state_entry(){llSetTimerEvent(1);}timer(){}}' } }] }] })
  target.scripts['timer']!.start()
  script.start()
  expect(script.global('names')).toEqual(['target'])
  expect(script.global('types')).toEqual([12])
})

// In-world: own-root/own-child key scans -> no_sensor (Aditi, SLua Tideland, 2026-10-31).
it('does not return its own linked child even when its key matches', async () => {
  const world = new World(); world.addRegion('self', { x: 0, y: 0 })
  const { scripts } = await loadLinkset({ world, region: 'self', prims: [
    { scripts: [{ name: 'self', source: { source: `integer misses; default { state_entry(){llSensor("",(key)"11111111-1111-1111-1111-111111111111",PASSIVE,20,PI);}no_sensor(){++misses;} }` } }] },
    { key: '11111111-1111-1111-1111-111111111111', name: 'child' },
  ] })
  scripts['self']!.start()
  expect(scripts['self']!.global('misses')).toBe(1)
})

// In-world: resume-diagonal.py/resume-last.py -> dot tolerance .0001 at 45 and 90 degrees.
it.each([[0, 4, 1.57069, 0], [0, 4, 1.5707, 1], [4, 4, .78525, 0], [4, 4, .78527, 1]])('matches measured cone boundary <%s,%s> at %s', async (x, y, arc, hits) => {
  const { script, world } = await scanner(`llSensor("target",NULL_KEY,PASSIVE,20,${arc});`)
  world.addObject({ region: 'sensor region', name: 'target', position: { x, y, z: 0 } })
  script.start()
  expect(script.global('names')).toHaveLength(hits)
  expect(script.global('misses')).toBe(1 - hits)
})

// In-world: resume-coexist.py -> one-shot after a .7 s sleep kept one completed
// sensor event then one no_sensor; repeat-after-oneshot had hits, no no_sensor.
it('replaces a repeat with a one-shot without discarding an already completed result', async () => {
  const { script, world } = await scanner('llSensorRepeat("target",NULL_KEY,PASSIVE,20,PI,.2); llSleep(.7); llSensor("missing",NULL_KEY,PASSIVE,20,PI);')
  world.addObject({ region: 'sensor region', name: 'target', position: { x: 2, y: 0, z: 0 } })
  script.start(); script.advanceTime(1000)
  expect(script.global('names')).toEqual(['target'])
  expect(script.global('misses')).toBe(1)
})
it('replaces an unfinished one-shot with a repeat', async () => {
  const { script, world } = await scanner('llSensor("missing",NULL_KEY,PASSIVE,20,PI); llSensorRepeat("target",NULL_KEY,PASSIVE,20,PI,.2);')
  world.addObject({ region: 'sensor region', name: 'target', position: { x: 2, y: 0, z: 0 } })
  script.start(); script.advanceTime(601)
  expect(script.global('names')).toEqual(['target', 'target', 'target'])
  expect(script.global('misses')).toBe(0)
})

// In-world: resume-probe.py -> a registered listener matched ACTIVE and SCRIPTED,
// not PASSIVE; llDetectedType remained 12 (Aditi, SLua Tideland, 2026-10-31).
it('treats a loaded listener as an active scripted target', async () => {
  const { script, world } = await scanner('llSensor("target",NULL_KEY,SCRIPTED,20,PI);')
  const target = await loadLinkset({ world, region: 'sensor region', position: { x: 2, y: 0, z: 0 }, prims: [{ name: 'target', scripts: [{ name: 'listener', source: { source: 'default {state_entry(){llListen(123,"",NULL_KEY,"");}listen(integer c,string n,key id,string m){}}' } }] }] })
  target.scripts['listener']!.start(); script.start()
  expect(script.global('names')).toEqual(['target'])
  expect(script.global('types')).toEqual([12])
})

// In-world: resume-extra.py/resume-last.py -> DAMAGEABLE alone and combined with
// ACTIVE/PASSIVE/SCRIPTED matched nothing, even active handlers and health=100.
it.each([32, 34, 36, 40, 44])('matches the measured DAMAGEABLE mask %s', async (mask) => {
  const { script, world } = await scanner(`llSensor("target",NULL_KEY,${mask},20,PI);`)
  const target = await loadLinkset({ world, region: 'sensor region', position: { x: 2, y: 0, z: 0 }, prims: [{ name: 'target', scripts: [{ name: 'damage', source: { source: 'default {state_entry(){llSetTimerEvent(1);}timer(){}on_damage(integer n){}final_damage(integer n){}}' } }] }] })
  target.scripts['damage']!.start(); script.start()
  expect(script.global('names')).toEqual([])
  expect(script.global('misses')).toBe(1)
})

// In-world: resume-probe.py -> external root key found, child key not found; link=0.
it('detects only another linkset root and uses its supplied group and motion data', async () => {
  const { script, world } = await scanner('llSensor("target",NULL_KEY,PASSIVE,20,PI);')
  const target = await loadLinkset({ world, region: 'sensor region', owner: '22222222-2222-2222-2222-222222222222', position: { x: 2, y: 0, z: 0 }, prims: [{ name: 'target' }, { name: 'target' }] })
  target.prims[0]!.params.rotation = { x: 0, y: 0, z: 1, s: 0 }
  world.sensorProperties.set(target.linkset, { group: '11111111-1111-1111-1111-111111111111', velocity: { x: 1, y: 2, z: 3 }, active: false })
  script.start()
  expect(script.global('keys')).toEqual([target.prims[0]!.key])
  expect(script.global('positions')).toEqual([{ x: 2, y: 0, z: 0 }])
  expect(script.global('velocities')).toEqual([{ x: 1, y: 2, z: 3 }])
  expect(script.global('rotations')).toEqual([{ x: 0, y: 0, z: 1, s: 0 }])
  expect(script.global('owners')).toEqual(['22222222-2222-2222-2222-222222222222'])
  expect(script.global('groups')).toEqual([0])
  expect(script.global('links')).toEqual([0])
})
