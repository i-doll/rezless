import { describe, expect, it } from 'vitest'
import { loadScript, loadLinkset } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlCreateCharacter
// https://wiki.secondlife.com/wiki/LlUpdateCharacter
// https://wiki.secondlife.com/wiki/LlDeleteCharacter
// https://wiki.secondlife.com/wiki/path_update
// In-world: pathfinding.lsl/followup.lsl -> creation works above the navmesh;
// update on a non-character leaves physics off and navigation raises no event;
// navigation after creation raises PU_FAILURE_INVALID_START with reserved=[].
// Probes: Aditi, SLua Tideland, 2026-10-31. No physical movement is simulated.
describe('pathfinding characters', () => {
  it('records creation and updates the object configuration', async () => {
    const s = await loadScript({ source: `default {
      state_entry() { llCreateCharacter([CHARACTER_DESIRED_SPEED, 3.0]); }
      touch_start(integer n) { llUpdateCharacter([CHARACTER_MAX_SPEED, 10.0]); }
    }` })
    s.start()
    expect(s.character).not.toBeNull()
    expect(s.character?.options.get(1)).toBe(3)
    s.fire('touch_start', { num_detected: 1 })
    expect(s.character?.options.get(1)).toBe(3)
    expect(s.character?.options.get(13)).toBe(10)
  })

  it('removes the character when deleted', async () => {
    const s = await loadScript({ source: `default {
      state_entry() { llCreateCharacter([]); llDeleteCharacter(); }
    }` })
    s.start()
    expect(s.character).toBeNull()
  })

  it('lets a test deliver a path_update to a script handler', async () => {
    const s = await loadScript({ source: `default {
      state_entry() { llCreateCharacter([]); llNavigateTo(<10, 20, 30>, []); }
      path_update(integer type, list reserved) { llSay(0, (string)type + ":" + llList2CSV(reserved)); }
    }` })
    s.start()
    expect(s.character?.commands).toEqual([
      { name: 'llNavigateTo', args: [{ x: 10, y: 20, z: 30 }, []] },
    ])
    s.pathUpdate(3)
    expect(s.chat.at(-1)?.text).toBe('3:')
  })
})

// https://wiki.secondlife.com/wiki/LlEvade
// https://wiki.secondlife.com/wiki/LlExecCharacterCmd
// https://wiki.secondlife.com/wiki/LlFleeFrom
// https://wiki.secondlife.com/wiki/LlNavigateTo
// https://wiki.secondlife.com/wiki/LlPatrolPoints
// https://wiki.secondlife.com/wiki/LlPursue
// https://wiki.secondlife.com/wiki/LlWanderWithin
// In-world: pathfinding.lsl -> navigate/flee/patrol returned PU=2,
// evade/pursue returned PU=5, wander PU=6, stop no event (same region/date).
// Each command keeps its own arguments so tests can inspect the requested
// behavior without simulating the simulator's navigation or physics.
describe('character command capture', () => {
  const cases = [
    ['llEvade', 'NULL_KEY, []', ['00000000-0000-0000-0000-000000000000', []]],
    ['llExecCharacterCmd', 'CHARACTER_CMD_STOP, []', [0, []]],
    ['llFleeFrom', '<1, 2, 3>, 5.0, []', [{ x: 1, y: 2, z: 3 }, 5, []]],
    ['llNavigateTo', '<1, 2, 3>, []', [{ x: 1, y: 2, z: 3 }, []]],
    ['llPatrolPoints', '[<1, 2, 3>, <4, 5, 6>], []', [[{ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }], []]],
    ['llPursue', 'NULL_KEY, []', ['00000000-0000-0000-0000-000000000000', []]],
    ['llWanderWithin', '<1, 2, 3>, <4, 5, 6>, []', [{ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }, []]],
  ] as const
  for (const [name, args, expected] of cases) {
    it(`records ${name} on an existing character`, async () => {
      const s = await loadScript({ source: `default { state_entry() {
        llCreateCharacter([]); ${name}(${args});
      } }` })
      s.start()
      expect(s.character?.commands).toEqual([{ name, args: expected }])
    })
  }
})

// https://wiki.secondlife.com/wiki/LlCreateCharacter#Caveats
// In-world: creator.lsl/driver.lsl -> both root scripts received PU=2 before
// and after resetting the creator (Aditi, SLua Tideland, 2026-10-31).
it('shares a character between scripts and retains it over resets', async () => {
  const l = await loadLinkset({ prims: [{ scripts: [
    { name: 'creator', source: { source: `default {
      touch_start(integer n) { llCreateCharacter([CHARACTER_DESIRED_SPEED, 3.0]); }
    }` } },
    { name: 'driver', source: { source: `default {
      touch_start(integer n) { llNavigateTo(<1,2,3>, []); }
    }` } },
  ] }] })
  const a = l.scripts['creator']!
  const b = l.scripts['driver']!
  a.start()
  b.start()
  a.fire('touch_start', { num_detected: 1 })
  a.reset()
  b.fire('touch_start', { num_detected: 1 })
  expect(a.character).toBe(b.character)
  expect(b.character?.options.get(1)).toBe(3)
  expect(b.character?.commands).toHaveLength(1)
})

// https://wiki.secondlife.com/wiki/LlEvade#Caveats documents this error form.
// In-world: followup.lsl -> absent-character navigation kept running and did
// not raise path_update (Aditi, SLua Tideland, 2026-10-31). The simulator's
// diagnostics did not reach the MCP DEBUG_CHANNEL listener, though an explicit
// llSay(DEBUG_CHANNEL) sentinel did. Error wording follows the wiki.
it('rejects movement before creation and keeps running the handler', async () => {
  const s = await loadScript({ source: `default { state_entry() {
    llNavigateTo(<1,2,3>, []); llSay(0, "still running");
  } }` })
  s.start()
  expect(s.character).toBeNull()
  expect(s.chat).toContainEqual({ channel: 2147483647, text: 'You must call llCreateCharacter before llNavigateTo.', type: 'say' })
  expect(s.chat.at(-1)?.text).toBe('still running')
})

it('keeps characters on separate objects independent', async () => {
  const source = `default { touch_start(integer n) { llCreateCharacter([]); } }`
  const a = await loadScript({ source })
  const b = await loadScript({ source })
  a.start()
  b.start()
  a.fire('touch_start', { num_detected: 1 })
  expect(a.character).not.toBeNull()
  expect(b.character).toBeNull()
})

// Navigation results come from a test fixture; rezless does not bake a navmesh.
it('returns the test-provided navigation query results', async () => {
  const s = await loadScript({ source: `list near; list path;
    default { touch_start(integer n) {
      near = llGetClosestNavPoint(<1,2,3>, []);
      path = llGetStaticPath(<1,2,3>, <4,5,6>, 0.5, []);
    } }
  ` })
  s.setNavigationResults({
    closestNavPoint: [{ x: 1, y: 2, z: 0 }],
    staticPath: [{ x: 1, y: 2, z: 0 }, { x: 4, y: 5, z: 0 }, 0],
  })
  s.start()
  s.fire('touch_start', { num_detected: 1 })
  expect(s.global('near')).toEqual([{ x: 1, y: 2, z: 0 }])
  expect(s.global('path')).toEqual([{ x: 1, y: 2, z: 0 }, { x: 4, y: 5, z: 0 }, 0])
})

// In-world: speed.lsl -> speed stayed ~1 m/s after updating max speed,
// then rose to ~6 m/s after re-creating with no desired speed specified
// (Aditi, SLua Tideland, 2026-10-31). These are requested values, so omitted
// defaults are represented by absent keys rather than estimated defaults.
it('resets omitted requested options on re-creation while retaining explicit dimensions', async () => {
  const s = await loadScript({ source: `default {
    state_entry() { llCreateCharacter([CHARACTER_DESIRED_SPEED, 1.0, CHARACTER_RADIUS, 0.5, CHARACTER_LENGTH, 2.0]); }
    touch_start(integer n) { llCreateCharacter([CHARACTER_MAX_SPEED, 10.0]); }
  }` })
  s.start()
  s.fire('touch_start', { num_detected: 1 })
  expect([...s.character!.options]).toEqual([[2, 0.5], [3, 2], [13, 10]])
})

// In-world: followup.lsl -> update left physics off; only a subsequent create
// allowed a navigate call to raise PU=2 (Aditi, SLua Tideland, 2026-10-31).
it('does not create a character by updating or deleting an absent one', async () => {
  const s = await loadScript({ source: `default { state_entry() {
    llUpdateCharacter([CHARACTER_DESIRED_SPEED, 3.0]); llDeleteCharacter();
  } }` })
  s.start()
  expect(s.character).toBeNull()
})

// In-world: linked-root/linked-child probes -> only root-prim scripts received
// PU=2, even when the child-prim script requested navigation
// (Aditi, SLua Tideland, 2026-10-31).
it('delivers path_update to root scripts when a child drives the character', async () => {
  const l = await loadLinkset({ prims: [
    { scripts: [
      { name: 'root', source: { source: `default {
        state_entry() { llCreateCharacter([]); }
        path_update(integer t, list reserved) { llSay(0, (string)t + ":" + llList2CSV(reserved)); }
      }` } },
      { name: 'observer', source: { source: `default {
        path_update(integer t, list reserved) { llSay(0, "observer " + (string)t); }
      }` } },
    ] },
    { scripts: [{ name: 'child', source: { source: `default {
      touch_start(integer n) { llNavigateTo(<1,2,3>, []); }
      path_update(integer t, list reserved) { llSay(0, "child event"); }
    }` } }] },
  ] })
  const root = l.scripts['root']!
  const observer = l.scripts['observer']!
  const child = l.scripts['child']!
  for (const s of [root, observer, child]) s.start()
  child.fire('touch_start', { num_detected: 1 })
  expect(child.character).toBe(root.character)
  expect(root.character?.commands[0]?.name).toBe('llNavigateTo')
  child.pathUpdate(2)
  expect(root.chat.map((c) => c.text)).toEqual(['2:'])
  expect(observer.chat.map((c) => c.text)).toEqual(['observer 2'])
  expect(child.chat).toEqual([])
})

it('does not deliver results after deletion or before creation', async () => {
  const s = await loadScript({ source: `default {
    touch_start(integer n) { llCreateCharacter([]); llDeleteCharacter(); }
    path_update(integer t, list r) { llSay(0, "unexpected event"); }
  }` })
  s.start()
  s.pathUpdate(1)
  s.fire('touch_start', { num_detected: 1 })
  s.pathUpdate(1)
  expect(s.chat).toEqual([])
})

// https://wiki.secondlife.com/wiki/LlGetClosestNavPoint
// https://wiki.secondlife.com/wiki/LlGetStaticPath
// In-world: queries.lsl -> closest above the navmesh=[], static path between
// <116,48,1999> and <117,48,1999>=[3], without any character creation
// (Aditi, SLua Tideland, 2026-10-31).
it('fails queries without supplied navigation geometry, without requiring a character', async () => {
  const s = await loadScript({ stubs: 'throw', source: `list near; list path;
    default { state_entry() {
      near = llGetClosestNavPoint(<116,48,1999>, []);
      path = llGetStaticPath(<116,48,1999>, <117,48,1999>, 0.5, []);
    } }
  ` })
  s.start()
  expect(s.global('near')).toEqual([])
  expect(s.global('path')).toEqual([3])
  expect(s.character).toBeNull()
})

// In-world: radii.lsl -> -1, 0.1 and 6 returned []; 0.125 and 5 returned [3]
// for the same off-mesh endpoints (Aditi, SLua Tideland, 2026-10-31).
it.each([-1, 0.1, 6])('rejects a static-path radius of %s before using a fixture', async (radius) => {
  const s = await loadScript({ source: `list path; default { state_entry() {
    path = llGetStaticPath(<1,2,3>, <4,5,6>, ${radius.toFixed(3)}, []);
  } }` })
  s.setNavigationResults({ staticPath: [0] })
  s.start()
  expect(s.global('path')).toEqual([])
})

it.each([0.125, 5])('accepts the static-path radius boundary %s', async (radius) => {
  const s = await loadScript({ source: `list path; default { state_entry() {
    path = llGetStaticPath(<1,2,3>, <4,5,6>, ${radius.toFixed(3)}, []);
  } }` })
  s.setNavigationResults({ staticPath: [0] })
  s.start()
  expect(s.global('path')).toEqual([0])
})

it('retains navigation fixtures over resets and snapshots the supplied values', async () => {
  const s = await loadScript({ source: `list near; list path; default { state_entry() {
    near = llGetClosestNavPoint(<1,2,3>, []);
    path = llGetStaticPath(<1,2,3>, <4,5,6>, 0.5, []);
  } }` })
  const points = [{ x: 1, y: 2, z: 3 }]
  const path = [9]
  s.setNavigationResults({ closestNavPoint: points, staticPath: path })
  points[0]!.z = 100
  path[0] = 0
  s.start()
  s.reset()
  expect(s.global('near')).toEqual([{ x: 1, y: 2, z: 3 }])
  expect(s.global('path')).toEqual([9])
  // PU_FAILURE_NO_NAVMESH requires a region with no navmesh, a fatal server
  // failure per the wiki. The viewer tools cannot remove a region's navmesh;
  // tests can supply this status without requiring such a simulator failure.
})
