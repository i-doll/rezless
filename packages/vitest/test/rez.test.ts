import { expect, it } from 'vitest'
import { loadScript, DEBUG_CHANNEL } from '../src/index.js'

// https://wiki.secondlife.com/wiki/llRezObject
// https://wiki.secondlife.com/wiki/llRezAtRoot
// https://wiki.secondlife.com/wiki/llRezObjectWithParams
// https://wiki.secondlife.com/wiki/llDerezObject
it('reports a missing rez item and adds its measured one-second failure delay', async () => {
  const script = await loadScript({ source: `
    float elapsed;
    default { state_entry() {
      llRezObject("missing", llGetPos(), ZERO_VECTOR, ZERO_ROTATION, 7);
      elapsed = llGetTime();
    } }
  ` })
  script.start()
  expect(script.chat.some(c => c.channel === DEBUG_CHANNEL && c.text.includes('missing'))).toBe(true)
  expect(script.global('elapsed')).toBeCloseTo(1.1)
})

import { loadLinkset, World, makeInventoryItem, InventoryType, NULL_KEY, type Linkset } from '../src/index.js'

async function fixture(call: string, payload?: Linkset) {
  const world = new World()
  world.addRegion('rez region', { x: 0, y: 0 })
  const object = payload ?? (await loadLinkset({ prims: [{ name: 'payload', scripts: [{
    name: 'child', source: { source: `integer param; integer start; integer count;
      default { on_rez(integer p) { param=p; start=llGetStartParameter(); ++count; } }` },
  }] }] })).linkset
  const item = makeInventoryItem({ name: 'payload', type: InventoryType.OBJECT })
  Object.assign(item, { object })
  const loaded = await loadLinkset({ owner: '11111111-1111-1111-1111-111111111111', world, region: 'rez region', position: { x: 100, y: 100, z: 30 }, prims: [{
    name: 'rezzer', inventory: [item], scripts: [{ name: 'parent', source: { source: `
      key result; key eventKey; integer events; float elapsed;
      default { state_entry() { ${call} elapsed=llGetTime(); }
      object_rez(key id) { eventKey=id; ++events; } }
    ` } }],
  }] })
  return { world, ...loaded, parent: loaded.scripts['parent']!, item: loaded.prims[0]!.inventory[0]! }
}

it('rezzes a distinct linkset into the same World and delivers both rez events', async () => {
  const f = await fixture('llRezAtRoot("payload", llGetPos()+<2,0,0>, ZERO_VECTOR, ZERO_ROTATION, -37);')
  f.parent.start()
  expect(f.world.linksets).toHaveLength(2)
  const child = f.world.linksets[1]!
  expect(child.region).toBe('rez region')
  expect(child.owner).toBe(f.linkset.owner)
  expect(child.prims[0]!.regionPosition()).toEqual({ x: 102, y: 100, z: 30 })
  expect(f.parent.global('events')).toBe(1)
  expect(f.parent.global('eventKey')).toBe(child.prims[0]!.key)
  expect(child.allScripts()[0]!.global('param')).toBe(-37)
  expect(child.allScripts()[0]!.global('start')).toBe(-37)
  expect(f.prims[0]!.inventory.filter(i => i.type === InventoryType.OBJECT)).toHaveLength(1)
  expect(f.parent.global('elapsed')).toBeCloseTo(0.1)
})

it('returns the new root key from llRezObjectWithParams', async () => {
  const f = await fixture('result=llRezObjectWithParams("payload", [REZ_POS,<2,0,0>,TRUE,TRUE,REZ_PARAM,19]);')
  f.parent.start()
  expect(f.world.linksets).toHaveLength(2)
  const child = f.world.linksets[1]!
  expect(f.parent.global('result')).toBe(child.prims[0]!.key)
  expect(f.parent.global('eventKey')).toBe(child.prims[0]!.key)
  expect(child.allScripts()[0]!.global('start')).toBe(19)
})

it('returns an empty key on a missing object and fires no object_rez', async () => {
  const f = await fixture('result=llRezObjectWithParams("absent", []);')
  f.parent.start()
  expect(f.parent.global('result')).toBe('')
  expect(f.parent.global('events')).toBe(0)
  expect(f.world.linksets).toHaveLength(1)
  expect(f.parent.chat.some(c => c.channel === DEBUG_CHANNEL)).toBe(true)
})

it.each(['llRezObject', 'llRezAtRoot'])('%s does not rotate region-coordinate offsets by the rezzer rotation', async fn => {
  const f = await fixture(`${fn}("payload", llGetPos()+<3,4,0>, ZERO_VECTOR, ZERO_ROTATION, 0);`)
  f.prims[0]!.params.rotation = { x: 0, y: 0, z: Math.SQRT1_2, s: Math.SQRT1_2 }
  f.parent.start()
  expect(f.world.linksets).toHaveLength(2)
  expect(f.world.linksets[1]!.prims[0]!.regionPosition()).toEqual({ x: 103, y: 104, z: 30 })
})

it('gives repeated rezzes fresh prim keys and independent script globals', async () => {
  const f = await fixture(`llRezAtRoot("payload", llGetPos()+<0,0,2>, ZERO_VECTOR, ZERO_ROTATION, 1);
    llRezAtRoot("payload", llGetPos()+<0,0,3>, ZERO_VECTOR, ZERO_ROTATION, 2);`)
  f.parent.start()
  expect(f.world.linksets).toHaveLength(3)
  const a = f.world.linksets[1]!, b = f.world.linksets[2]!
  expect(a.prims[0]!.key).not.toBe(b.prims[0]!.key)
  expect(a.allScripts()[0]!.global('param')).toBe(1)
  expect(b.allScripts()[0]!.global('param')).toBe(2)
  expect(a.allScripts()[0]!.global('count')).toBe(1)
  expect(b.allScripts()[0]!.global('count')).toBe(1)
  expect(f.parent.global('events')).toBe(2)
})

it('limits rez requests to the inventory of the calling prim', async () => {
  const f = await fixture('')
  const other = (await loadScript({ source: `default { state_entry() {
    llRezAtRoot("payload", llGetPos(), ZERO_VECTOR, ZERO_ROTATION, 0);
  } }` }))
  // A separate object with no payload must not see the rezzer's inventory.
  other.start()
  expect(other.chat.some(c => c.channel === DEBUG_CHANNEL)).toBe(true)
  expect(f.world.linksets).toHaveLength(1)
})

// In-world: errors.py -> missing name reports this error and adds 1s; malformed
// params return NULL_KEY without DEBUG_CHANNEL output (Aditi, SLua Tideland, 2026-11-01).
it.each(['[999,1]', '[REZ_TORQUE,<1,2,3>,TRUE]', '[REZ_POS]', '[REZ_PARAM,"x"]', '[REZ_POS,"x",TRUE,TRUE]', '[REZ_ROT,<0,0,0>,FALSE]'])('rejects malformed rez params %s atomically', async params => {
  const f = await fixture(`result=llRezObjectWithParams("payload", ${params});`)
  f.parent.start()
  expect(f.parent.global('result')).toBe(NULL_KEY)
  expect(f.parent.global('events')).toBe(0)
  expect(f.world.linksets).toHaveLength(1)
  expect(f.parent.chat.filter(c => c.channel === DEBUG_CHANNEL)).toEqual([])
  expect(f.parent.global('elapsed')).toBeCloseTo(0.1)
})

// In-world: reliable.py cases 2-5, 8-13 -> 10.43 yes / 10.44 no for a .5m cube;
// 13.46 yes / 13.47 no for a 4m cube (Aditi, SLua Tideland, 2026-11-01).
it.each([[0.5, 10.43, 2], [0.5, 10.44, 1], [4, 13.46, 2], [4, 13.47, 1]])('uses size %s to gate rez distance %s', async (size, distance, count) => {
  const f = await fixture(`llRezAtRoot("payload", llGetPos()+<${distance},0,0>, ZERO_VECTOR, ZERO_ROTATION, 0);`)
  f.prims[0]!.params.size = { x: size, y: size, z: size }
  f.parent.start()
  expect(f.world.linksets).toHaveLength(count)
  expect(f.parent.global('events')).toBe(count - 1)
})

it('accepts an object definition directly in a prim fixture', async () => {
  const world = new World(); world.addRegion('here', { x: 0, y: 0 })
  const f = await loadLinkset({ world, region: 'here', prims: [{
    objects: { payload: { prims: [{ name: 'from definition', scripts: [{ name: 'child', source: { source: `
      integer value; default { on_rez(integer n) { value=n; } }
    ` } }] }] } },
    scripts: [{ name: 'parent', source: { source: `default { state_entry() {
      llRezAtRoot("payload", llGetPos()+<0,0,2>, ZERO_VECTOR, ZERO_ROTATION, 42);
    } }` } }],
  }] })
  f.scripts['parent']!.start()
  expect(world.linksets).toHaveLength(2)
  expect(world.linksets[1]!.prims[0]!.name).toBe('from definition')
  expect(world.linksets[1]!.allScripts()[0]!.global('value')).toBe(42)
})

// In-world: follow.py -> stored centre offset stays on X for a 90-degree rez;
// root placement keeps the requested point (Aditi, SLua Tideland, 2026-11-01).
it.each([['llRezObject', 101], ['llRezAtRoot', 103]])('places the saved linked payload with %s', async (fn, x) => {
  const payload = await loadLinkset({ prims: [{ name: 'root' }, { name: 'child' }] })
  payload.prims[1]!.params.position = { x: 4, y: 0, z: 0 }
  const f = await fixture(`${fn}("payload", llGetPos()+<3,0,0>, ZERO_VECTOR, <0,0,1,1>, 0);`, payload.linkset)
  f.parent.start()
  const child = f.world.linksets[1]!
  expect(child.prims[0]!.regionPosition()).toEqual({ x, y: 100, z: 30 })
  expect(child.prims[1]!.regionPosition().x).toBeCloseTo(x as number)
  expect(child.prims[1]!.regionPosition().y).toBeCloseTo(104)
  expect(child.prims[0]!.params.rotation.z).toBeCloseTo(Math.SQRT1_2)
  expect(child.prims[0]!.key).not.toBe(payload.prims[0]!.key)
  expect(child.prims[1]!.key).not.toBe(payload.prims[1]!.key)
})

// In-world: reliable.py case 17 -> relative position adds the offset without
// rotating it; relative rotation composes with the rezzer (Aditi, SLua Tideland, 2026-11-01).
it('handles relative params and exposes the start string before on_rez', async () => {
  const payload = await loadLinkset({ prims: [{ scripts: [{ name: 'child', source: { source: `
    integer param; string str; default { on_rez(integer p) { param=p; str=llGetStartString(); } }
  ` } }] }] })
  const f = await fixture(`result=llRezObjectWithParams("payload", [REZ_POS,<3,0,2>,TRUE,TRUE,
    REZ_ROT,llEuler2Rot(<0,0,PI_BY_TWO>),TRUE,REZ_PARAM,-123,REZ_PARAM_STRING,"hello"]);`, payload.linkset)
  f.prims[0]!.params.rotation = { x: 0, y: 0, z: Math.SQRT1_2, s: Math.SQRT1_2 }
  f.parent.start()
  const child = f.world.linksets[1]!
  expect(child.prims[0]!.regionPosition()).toEqual({ x: 103, y: 100, z: 32 })
  expect(child.prims[0]!.params.rotation.z).toBeCloseTo(1)
  expect(child.allScripts()[0]!.global('param')).toBe(-123)
  expect(child.allScripts()[0]!.global('str')).toBe('hello')
})

// In-world: velocity.py -> local velocity uses final payload rotation;
// <300,400,0> becomes <150,200,0>; inherit.py -> <1,2,3> + <3,0,0> = <4,2,3>.
// Aditi, SLua Tideland, 2026-11-01. Velocity is initial state, without integration.
it.each([
  ['REZ_FLAGS,0,REZ_VEL,<3,4,5>,FALSE,FALSE', { x: 0, y: 0, z: 0 }],
  ['REZ_FLAGS,2,REZ_VEL,<3,4,5>,FALSE,FALSE', { x: 3, y: 4, z: 5 }],
  ['REZ_FLAGS,2,REZ_ROT,<0,0,1,1>,FALSE,REZ_VEL,<3,4,5>,TRUE,FALSE', { x: -4, y: 3, z: 5 }],
  ['REZ_FLAGS,2,REZ_VEL,<300,400,0>,FALSE,FALSE', { x: 150, y: 200, z: 0 }],
  ['REZ_FLAGS,2,REZ_VEL,<1,2,3>,FALSE,TRUE', { x: 4, y: 2, z: 3 }],
])('applies initial velocity for %s', async (params, expected) => {
  const payload = await loadLinkset({ prims: [{ scripts: [{ name: 'child', source: { source: `
    vector velocity; default { on_rez(integer p) { velocity=llGetVel(); } }
  ` } }] }] })
  const f = await fixture(`result=llRezObjectWithParams("payload", [REZ_POS,<0,0,2>,TRUE,TRUE,${params}]);`, payload.linkset)
  f.world.sensorProperties.set(f.linkset, { velocity: { x: 3, y: 0, z: 0 } })
  f.parent.start()
  const velocity = f.world.linksets[1]!.allScripts()[0]!.global('velocity') as { x: number; y: number; z: number }
  expect(velocity.x).toBeCloseTo(expected.x)
  expect(velocity.y).toBeCloseTo(expected.y)
  expect(velocity.z).toBeCloseTo(expected.z)
})

// In-world: reliable.py cases 19-26 -> explicit flag bits, including unknown
// bits, are accepted; source scripts saw physics/phantom before clearing physics.
it.each([[0, false, 0, 0], [1, true, 0, 0], [2, false, 1, 0], [4, false, 0, 16], [128, false, 0, 0], [255, true, 1, 16], [256, false, 0, 0], [-1, true, 1, 16]])('sets flags %s before scripts start', async (flags, temp, physics, phantom) => {
  const f = await fixture(`result=llRezObjectWithParams("payload", [REZ_FLAGS,${flags}]);`)
  f.parent.start()
  const root = f.world.linksets[1]!.prims[0]!
  expect(root.params.tempOnRez).toBe(temp)
  expect(root.statusFlags & 1).toBe(physics)
  expect(root.statusFlags & 16).toBe(phantom)
})

// In-world: reliable.py cases 44-49 -> valid derez modes return 1;
// invalid modes, NULL_KEY and self return 0. DEREZ_TO_INVENTORY preserves n.
it('returns the object to its existing inventory item and preserves script globals', async () => {
  const f = await fixture(`result=llRezObjectWithParams("payload", []);
    integer ok=llDerezObject(result,DEREZ_TO_INVENTORY);
    result=llRezObjectWithParams("payload", [REZ_PARAM,9]);`)
  f.parent.start()
  expect(f.parent.calls.filter(c => c.name === 'llDerezObject').map(c => c.returned)).toEqual([1])
  expect(f.world.linksets).toHaveLength(2)
  expect(f.world.linksets[1]!.allScripts()[0]!.global('count')).toBe(2)
  expect(f.world.linksets[1]!.allScripts()[0]!.global('param')).toBe(9)
})

it.each([0, 1, 2, 3, -1])('handles derez mode %s without deleting unrelated objects', async mode => {
  const f = await fixture(`result=llRezObjectWithParams("payload", []); integer ok=llDerezObject(result,${mode});`)
  const unrelated = await loadLinkset({ world: f.world, region: 'rez region', prims: [{ name: 'unrelated' }] })
  f.parent.start()
  const outcome = f.parent.calls.find(c => c.name === 'llDerezObject')!.returned
  expect(outcome).toBe(mode >= 0 && mode <= 2 ? 1 : 0)
  expect(f.world.linksets.includes(unrelated.linkset)).toBe(true)
  expect(f.world.linksets).toHaveLength(mode === 0 || mode === 2 ? 2 : 3)
  if (mode === 1) expect(f.world.linksets[2]!.prims[0]!.params.tempOnRez).toBe(true)
})

it('refuses to derez a different rezzer\'s object', async () => {
  const f = await fixture('result=llRezObjectWithParams("payload", []);')
  f.parent.start()
  const key = f.parent.global('result') as string
  const other = await loadLinkset({ owner: f.linkset.owner, world: f.world, region: 'rez region', prims: [{ scripts: [{ name: 'other', source: { source: `
    integer ok; default { state_entry() { ok=llDerezObject("${key}",0); } }
  ` } }] }] })
  other.scripts['other']!.start()
  expect(other.scripts['other']!.global('ok')).toBe(0)
  expect(f.world.linksets).toHaveLength(3)
})

it('refuses to return an object after its source inventory item was removed', async () => {
  const f = await fixture(`result=llRezObjectWithParams("payload", []);
    llRemoveInventory("payload"); integer ok=llDerezObject(result,DEREZ_TO_INVENTORY);`)
  f.parent.start()
  expect(f.parent.calls.find(c => c.name === 'llDerezObject')!.returned).toBe(0)
  expect(f.world.linksets).toHaveLength(2)
})

// Wiki: https://wiki.secondlife.com/wiki/llRezObject#Caveats
// In-world no-copy restriction cannot be created with next-owner-only MCP
// permission tools without transferring through a second avatar.
it('consumes no-copy inventory only after a successful rez and refuses derez', async () => {
  const f = await fixture('result=llRezObjectWithParams("payload", []); integer ok=llDerezObject(result,0);')
  f.item.permMask = { ...f.item.permMask, owner: 0 }
  f.parent.start()
  expect(f.prims[0]!.inventory.filter(i => i.type === InventoryType.OBJECT)).toEqual([])
  expect(f.parent.calls.find(c => c.name === 'llDerezObject')!.returned).toBe(0)
  expect(f.world.linksets).toHaveLength(2)
})

it('keeps no-copy inventory when the requested position is out of reach', async () => {
  const f = await fixture('result=llRezObjectWithParams("payload", [REZ_POS,<100,0,0>,TRUE,TRUE]);')
  f.item.permMask = { ...f.item.permMask, owner: 0 }
  f.parent.start()
  expect(f.prims[0]!.inventory.includes(f.item)).toBe(true)
  expect(f.world.linksets).toHaveLength(1)
  expect(f.parent.global('result')).toBe(NULL_KEY)
})

// In-world: temp.py -> simulator removed unscripted temp payload after 60.18s.
// VM uses 60s exactly; simulator cleanup cadence is not modeled.
it('expires an unscripted temporary object even after its rezzer dies', async () => {
  const payload = await loadLinkset({ prims: [{ name: 'temporary payload' }] })
  const f = await fixture('result=llRezObjectWithParams("payload", [REZ_FLAGS,1]); llDie();', payload.linkset)
  f.parent.start()
  expect(f.world.linksets).toHaveLength(1)
  f.linkset.advanceTime(59899)
  expect(f.world.linksets).toHaveLength(1)
  f.linkset.advanceTime(1)
  expect(f.world.linksets).toHaveLength(0)
})

it('runs a newly rezzed sleeping script while the rezzer sleeps', async () => {
  const payload = await loadLinkset({ prims: [{ scripts: [{ name: 'child', source: { source: `
    integer done; default { on_rez(integer p) { llSleep(0.2); done=1; } }
  ` } }] }] })
  const f = await fixture('result=llRezObjectWithParams("payload", []); llSleep(0.5);', payload.linkset)
  f.parent.start()
  expect(f.world.linksets[1]!.allScripts()[0]!.global('done')).toBe(1)
})

it('preserves list element types when saving scripts back into inventory', async () => {
  const payload = await loadLinkset({ prims: [{ scripts: [{ name: 'child', source: { source: `
    key savedKey="11111111-1111-1111-1111-111111111111"; list saved=[1.0,savedKey];
    list types; default { on_rez(integer p) { types=[llGetListEntryType(saved,0),llGetListEntryType(saved,1)]; } }
  ` } }] }] })
  const f = await fixture('result=llRezObjectWithParams("payload", []);', payload.linkset)
  f.parent.start()
  expect(f.world.linksets[1]!.allScripts()[0]!.global('types')).toEqual([2, 4])
})

// In-world: reliable.py accepts REZ_ACCEL/OMEGA/DAMAGE/DAMAGE_TYPE/SOUND/
// SOUND_COLLIDE/LOCK_AXES. These capture requested state without simulating contacts or audio.
it('records the additional rez params on the new object before events', async () => {
  const f = await fixture(`result=llRezObjectWithParams("payload", [REZ_FLAGS,3,
    REZ_ACCEL,<1,2,3>,TRUE,REZ_OMEGA,<0,0,1>,FALSE,2.0,1.0,
    REZ_DAMAGE,7.0,REZ_DAMAGE_TYPE,3,REZ_LOCK_AXES,<1,0,1>,
    REZ_SOUND,"00000000-0000-0000-0000-000000000001",0.3,TRUE,
    REZ_SOUND_COLLIDE,"00000000-0000-0000-0000-000000000002",0.4]);`)
  f.parent.start()
  const child = f.world.linksets[1]!, root = child.prims[0]!
  expect(child.rez!.acceleration).toEqual({ x: 1, y: 2, z: 3 })
  expect(child.rez!.accelerationLocal).toBe(true)
  expect(root.params.omega).toEqual({ axis: { x: 0, y: 0, z: 1 }, spinrate: 2, gain: 1 })
  expect(root.params.damage).toEqual({ amount: 7, type: 3 })
  expect(root.statusFlags & 14).toBe(4)
  expect(root.sound.current).toEqual({ sound: '00000000-0000-0000-0000-000000000001', volume: Math.fround(0.3), loop: true, sync: 'none' })
  expect(child.rez!.collisionSound).toEqual({ sound: '00000000-0000-0000-0000-000000000002', volume: Math.fround(0.4) })
})

it('resolves a requested rez sound from the rezzer inventory', async () => {
  const f = await fixture('result=llRezObjectWithParams("payload", [REZ_SOUND,"beep",0.7,FALSE]);')
  f.prims[0]!.addInventory(makeInventoryItem({ name: 'beep', type: InventoryType.SOUND, key: '11111111-1111-1111-1111-111111111111' }))
  f.parent.start()
  expect(f.world.linksets[1]!.prims[0]!.sound.current?.sound).toBe('11111111-1111-1111-1111-111111111111')
})

it('copies non-script inventory and linkset data without sharing mutable state', async () => {
  const payload = await loadLinkset({ prims: [{ inventory: [makeInventoryItem({ name: 'note', type: InventoryType.NOTECARD, notecardLines: ['hello'] })] }] })
  payload.linkset.linksetData.set('label', { value: 'saved', password: '' })
  const f = await fixture('result=llRezObjectWithParams("payload", []);', payload.linkset)
  f.parent.start()
  const child = f.world.linksets[1]!
  expect(child.prims[0]!.inventory[0]!.notecardLines).toEqual(['hello'])
  expect(child.linksetData.get('label')?.value).toBe('saved')
  child.linksetData.get('label')!.value = 'changed'
  expect(payload.linkset.linksetData.get('label')?.value).toBe('saved')
})

it('preserves a saved nondefault LSL state without rerunning state_entry', async () => {
  const payload = await loadLinkset({ prims: [{ scripts: [{ name: 'child', source: { source: `
    integer entered; integer n; default { state_entry() { ++entered; state ready; } }
    state ready { state_entry() { ++entered; } on_rez(integer p) { n=p; } }
  ` } }] }] })
  payload.scripts['child']!.start()
  const f = await fixture('result=llRezObjectWithParams("payload", [REZ_PARAM,23]);', payload.linkset)
  f.parent.start()
  const child = f.world.linksets[1]!.allScripts()[0]!
  expect(child.currentState).toBe('ready')
  expect(child.global('entered')).toBe(2)
  expect(child.global('n')).toBe(23)
})

it('keeps the saved running state and resumes saved timers in the new World', async () => {
  const payload = await loadLinkset({ prims: [{ scripts: [{ name: 'child', source: { source: `
    integer ticks; default { state_entry() { llSetTimerEvent(1); } timer() { ++ticks; } }
  ` } }] }] })
  payload.scripts['child']!.start()
  const f = await fixture('result=llRezObjectWithParams("payload", []);', payload.linkset)
  f.parent.start()
  f.linkset.advanceTime(900)
  expect(f.world.linksets[1]!.allScripts()[0]!.global('ticks')).toBe(1)
  expect(payload.scripts['child']!.global('ticks')).toBe(0)
})

it('counts rezzed script execution in the inventory definition coverage', async () => {
  const payload = await loadLinkset({ prims: [{ scripts: [{ name: 'child', coverage: true, source: { source: `
    integer n; default { on_rez(integer p) { n=p; } }
  ` } }] }] })
  const f = await fixture('result=llRezObjectWithParams("payload", [REZ_PARAM,3]);', payload.linkset)
  f.parent.start()
  expect(payload.scripts['child']!.coverage!.functions.find(f => f.name === 'on_rez')!.hits).toBe(1)
})

// In-world: flags-clear.py, self-removing setter plus observer -> entry=1,
// physics=phantom=temp=1 with omitted flags and REZ_FLAGS,0 (Aditi, SLua Tideland, 2026-11-01).
it.each(['[]', '[REZ_FLAGS,0]'])('preserves saved flags for %s', async params => {
  const payload = await loadLinkset({ prims: [{}] })
  payload.prims[0]!.statusFlags = 17
  payload.prims[0]!.params.tempOnRez = true
  const f = await fixture(`result=llRezObjectWithParams("payload", ${params});`, payload.linkset)
  f.parent.start()
  const root = f.world.linksets[1]!.prims[0]!
  expect(root.statusFlags & 17).toBe(17)
  expect(root.params.tempOnRez).toBe(true)
})

// In-world: nondefault.py -> saved 90-degree three-prim asset has 4m centre
// offset on Y; omitted rotation becomes identity (Aditi, SLua Tideland, 2026-11-01).
it('uses the saved bounding-box centre and resets omitted rotation to identity', async () => {
  const payload = await loadLinkset({ prims: [{}, {}, {}] })
  payload.prims[0]!.params.rotation = { x: 0, y: 0, z: Math.SQRT1_2, s: Math.SQRT1_2 }
  payload.prims[1]!.params.position = { x: 2, y: 0, z: 0 }
  payload.prims[2]!.params.position = { x: 8, y: 0, z: 0 }
  const f = await fixture('result=llRezObjectWithParams("payload", []);', payload.linkset)
  f.parent.start()
  const root = f.world.linksets[1]!.prims[0]!
  expect(root.regionPosition().x).toBeCloseTo(100)
  expect(root.regionPosition().y).toBeCloseTo(96)
  expect(root.params.rotation).toEqual({ x: 0, y: 0, z: 0, s: 1 })
})

// In-world: nondefault.py -> float-valued integer slots fail silently;
// malformed options take precedence over a missing inventory name.
it.each(['[REZ_PARAM,1.0]', '[REZ_FLAGS,1.0]', '[REZ_ROT,ZERO_ROTATION,1.0]'])('rejects float values in integer slots: %s', async params => {
  const f = await fixture(`result=llRezObjectWithParams("payload", ${params});`)
  f.parent.start()
  expect(f.parent.global('result')).toBe(NULL_KEY)
  expect(f.world.linksets).toHaveLength(1)
  expect(f.parent.global('elapsed')).toBeCloseTo(0.1)
})

it('validates malformed options before reporting a missing item', async () => {
  const f = await fixture('result=llRezObjectWithParams("missing", [999,1]);')
  f.parent.start()
  expect(f.parent.global('result')).toBe(NULL_KEY)
  expect(f.parent.chat).toEqual([])
  expect(f.parent.global('elapsed')).toBeCloseTo(0.1)
})

// In-world: nondefault.py -> 1100 ASCII chars truncates to 1024;
// REZ_ACCEL,<1,2,3>,TRUE reads llGetForce=<1,2,3> at final 90-degree rotation.
it('makes the initial rez force readable inside on_rez', async () => {
  const payload = await loadLinkset({ prims: [{ scripts: [{ name: 'child', source: { source: `
    vector force; default { on_rez(integer p) { force=llGetForce(); } }
  ` } }] }] })
  const f = await fixture('result=llRezObjectWithParams("payload", [REZ_FLAGS,3,REZ_ROT,<0,0,1,1>,FALSE,REZ_ACCEL,<1,2,3>,TRUE]);', payload.linkset)
  f.parent.start()
  expect(f.world.linksets[1]!.allScripts()[0]!.global('force')).toEqual({ x: 1, y: 2, z: 3 })
})

it('truncates the start string to the measured 1024-byte limit', async () => {
  const f = await fixture(`result=llRezObjectWithParams("payload", [REZ_PARAM_STRING,"${'x'.repeat(1100)}"]);`)
  f.parent.start()
  expect(f.world.linksets[1]!.startString).toBe('x'.repeat(1024))
})

// In-world: errors.py -> wrong-type item returns a key, produces no object and no error.
it('allocates a key but creates nothing for a wrong inventory type', async () => {
  const f = await fixture('result=llRezObjectWithParams(llGetScriptName(), []);')
  f.parent.start()
  expect(f.parent.global('result')).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/)
  expect(f.parent.global('result')).not.toBe(NULL_KEY)
  expect(f.world.linksets).toHaveLength(1)
  expect(f.parent.global('events')).toBe(0)
  expect(f.parent.chat).toEqual([])
})

it('exposes rezzer identity and initial velocity through object details', async () => {
  const f = await fixture(`result=llRezObjectWithParams("payload", [REZ_FLAGS,2,REZ_VEL,<1,2,3>,FALSE,FALSE]);
    llOwnerSay(llList2CSV(llGetObjectDetails(result,[OBJECT_REZZER_KEY,OBJECT_VELOCITY])));`)
  f.parent.start()
  expect(f.parent.chat[0]!.text).toContain(f.prims[0]!.key)
  expect(f.parent.chat[0]!.text).toContain('<1.000000, 2.000000, 3.000000>')
})

it('keeps the inventory script\'s mock bindings on each rez', async () => {
  const payload = await loadLinkset({ prims: [{ scripts: [{ name: 'child', source: { source: `
    integer n; default { on_rez(integer p) { n=llGetUnixTime(); } }
  ` } }] }] })
  payload.scripts['child']!.mock('llGetUnixTime', () => 123)
  const f = await fixture('result=llRezObjectWithParams("payload", []);', payload.linkset)
  f.parent.start()
  expect(f.world.linksets[1]!.allScripts()[0]!.global('n')).toBe(123)
})

// In-world: temp-transition.py -> clearing temp from a child cleared both prims
// and survived the original 60s deadline; re-enable started a new countdown.
it('cancels expiration when a rezzed script clears temporary status', async () => {
  const payload = await loadLinkset({ prims: [{ scripts: [{ name: 'child', source: { source: `
    default { on_rez(integer p) { llSetPrimitiveParams([PRIM_TEMP_ON_REZ,FALSE]); } }
  ` } }] }] })
  const f = await fixture('result=llRezObjectWithParams("payload", [REZ_FLAGS,1]);', payload.linkset)
  f.parent.start()
  const child = f.world.linksets[1]!
  expect(child.prims[0]!.params.tempOnRez).toBe(false)
  f.linkset.advanceTime(120000)
  expect(f.world.linksets.includes(child)).toBe(true)
})

it('starts a fresh lifetime when a script clears and reenables temp status in one handler', async () => {
  const payload = await loadLinkset({ prims: [{ scripts: [{ name: 'child', source: { source: `
    default { on_rez(integer p) { llSleep(30);
      llSetLinkPrimitiveParamsFast(LINK_THIS,[PRIM_TEMP_ON_REZ,FALSE]);
      llSetLinkPrimitiveParamsFast(LINK_THIS,[PRIM_TEMP_ON_REZ,TRUE]);
    } }
  ` } }] }] })
  const f = await fixture('result=llRezObjectWithParams("payload", [REZ_FLAGS,1]);', payload.linkset)
  f.parent.start()
  const child = f.world.linksets[1]!
  f.linkset.advanceTime(59900)
  expect(f.world.linksets.includes(child)).toBe(true)
  f.linkset.advanceTime(29999)
  expect(f.world.linksets.includes(child)).toBe(true)
  f.linkset.advanceTime(1)
  expect(f.world.linksets.includes(child)).toBe(false)
})

it('clears temporary status for the whole linkset when a child script changes it', async () => {
  const payload = await loadLinkset({ prims: [{}, { scripts: [{ name: 'child', source: { source: `
    default { on_rez(integer p) { llSetPrimitiveParams([PRIM_TEMP_ON_REZ,FALSE]); } }
  ` } }] }] })
  const f = await fixture('result=llRezObjectWithParams("payload", [REZ_FLAGS,1]);', payload.linkset)
  f.parent.start()
  const child = f.world.linksets[1]!
  expect(child.prims.map(p => p.params.tempOnRez)).toEqual([false, false])
  f.linkset.advanceTime(120000)
  expect(f.world.linksets.includes(child)).toBe(true)
})

// In-world: temp-transition.py -> child clear made root/child temp=0; survived
// its first deadline. Child re-enable at ~65s made both 1; repeating TRUE at
// ~95s did not extend it, and it disappeared at ~126.18s (Aditi, SLua Tideland, 2026-11-01).
it('does not restart the lifetime when an already-temporary object is marked temp again', async () => {
  const payload = await loadLinkset({ prims: [{ scripts: [{ name: 'child', source: { source: `
    default { on_rez(integer p) { llSleep(30);
      llSetLinkPrimitiveParamsFast(LINK_THIS,[PRIM_TEMP_ON_REZ,TRUE]);
    } }
  ` } }] }] })
  const f = await fixture('result=llRezObjectWithParams("payload", [REZ_FLAGS,1]);', payload.linkset)
  f.parent.start()
  const child = f.world.linksets[1]!
  f.linkset.advanceTime(59899)
  expect(f.world.linksets.includes(child)).toBe(true)
  f.linkset.advanceTime(1)
  expect(f.world.linksets.includes(child)).toBe(false)
})

it('honors direct fixture changes to temporary status before advancing time', async () => {
  const f = await fixture('result=llRezObjectWithParams("payload", [REZ_FLAGS,1]);')
  f.parent.start()
  const child = f.world.linksets[1]!
  child.prims[0]!.params.tempOnRez = false
  f.linkset.advanceTime(120000)
  expect(f.world.linksets.includes(child)).toBe(true)
  child.prims[0]!.params.tempOnRez = true
  f.linkset.advanceTime(59999)
  expect(f.world.linksets.includes(child)).toBe(true)
  f.linkset.advanceTime(1)
  expect(f.world.linksets.includes(child)).toBe(false)
})

// In-world: controlled-snapshot.py -> DEREZ_TO_INVENTORY returns 1, freezes active
// progress in inventory, and resumes the remaining translation/rotation from the rez pose.
// Aditi, SLua Tideland, Mono, 2026-11-01. Viewer Take instead discards motion (snapshot.py).
it('derezzes and rezzes active keyframed motion with independent playback state', async () => {
  const payload=(await loadLinkset({prims:[{scripts:[{name:'mover',source:{source:`
    default {on_rez(integer n){if(n==1){
      llSetPrimitiveParams([PRIM_PHYSICS_SHAPE_TYPE,PRIM_PHYSICS_SHAPE_CONVEX]);
      llSetKeyframedMotion([<8,0,0>,llEuler2Rot(<0,0,PI_BY_TWO>),8.0],[]);
    }}}`}}]}]})).linkset
  const f=await fixture(`result=llRezObjectWithParams("payload",[REZ_POS,<2,0,0>,TRUE,TRUE,REZ_PARAM,1]);
    llSleep(1);integer ok=llDerezObject(result,DEREZ_TO_INVENTORY);llSleep(3);
    result=llRezObjectWithParams("payload",[REZ_POS,<0,2,0>,TRUE,TRUE,REZ_PARAM,2]);`,payload)
  f.parent.start()
  expect(f.parent.calls.find(c=>c.name==='llDerezObject')!.returned).toBe(1)
  const child=f.world.linksets[1]!,root=child.prims[0]!
  expect(root.regionPosition()).toEqual({x:100.1,y:102,z:30})
  f.parent.advanceTime(1000)
  expect(root.regionPosition()).toEqual({x:101.1,y:102,z:30})
  expect(root.params.rotation.z).toBeCloseTo(Math.sin(1.1*Math.PI/32))
  f.parent.advanceTime(6000)
  expect(root.regionPosition()).toEqual({x:107.1,y:102,z:30})
  expect(root.params.rotation.z).toBeCloseTo(Math.sin(7.1*Math.PI/32))
  // Advancing the world cannot advance the saved inventory controller.
  expect(f.item.object!.prims[0]!.regionPosition()).toEqual({x:102.9,y:100,z:30})
})

// In-world: controlled-paused.log -> saved pause survives; play restarts full frames
// at the new rez pose (Aditi, SLua Tideland, Mono, 2026-11-01).
it('restores paused motion without automatically playing or retaining partial progress', async () => {
  const payload=(await loadLinkset({prims:[{scripts:[{name:'mover',source:{source:`
    default {on_rez(integer n){if(n==1){
      llSetPrimitiveParams([PRIM_PHYSICS_SHAPE_TYPE,PRIM_PHYSICS_SHAPE_CONVEX]);
      llSetKeyframedMotion([<8,0,0>,ZERO_ROTATION,8.0],[]);llSetTimerEvent(2);
    }else llSetTimerEvent(0);}
    timer(){llSetKeyframedMotion([],[KFM_COMMAND,KFM_CMD_PAUSE]);llSetTimerEvent(0);}
    touch_start(integer n){llSetKeyframedMotion([],[KFM_COMMAND,KFM_CMD_PLAY]);}}`}}]}]})).linkset
  const f=await fixture(`result=llRezObjectWithParams("payload",[REZ_PARAM,1]);llSleep(3);
    integer ok=llDerezObject(result,DEREZ_TO_INVENTORY);llSleep(3);
    result=llRezObjectWithParams("payload",[REZ_POS,<0,2,0>,TRUE,TRUE,REZ_PARAM,2]);`,payload)
  f.parent.start()
  expect(f.parent.calls.find(c=>c.name==='llDerezObject')!.returned).toBe(1)
  const child=f.world.linksets[1]!,root=child.prims[0]!
  f.parent.advanceTime(5000)
  expect(root.regionPosition()).toEqual({x:100,y:102,z:30})
  child.allScripts()[0]!.fire('touch_start',{num_detected:1})
  f.parent.advanceTime(8000)
  expect(root.regionPosition()).toEqual({x:108,y:102,z:30})
})
