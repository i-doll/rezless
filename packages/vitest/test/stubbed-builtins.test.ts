import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadScript, loadLinkset } from '../src/index.js'
import {
  DEBUG_CHANNEL,
  INVENTORY_NONE,
  InventoryType,
  makeInventoryItem,
  NULL_KEY,
  PERMISSION_CHANGE_LINKS,
  PERMISSION_TRIGGER_ANIMATION,
} from '@rezless/vm'

const OWNER = '11111111-2222-3333-4444-555555555555'
const L = 'list L = [1,2,3,4,5,6,7,8,9,10];'

async function evalList(expr: string, options: { randomSeed?: number } = {}) {
  const s = await loadScript({
    source: `${L} list out; default { state_entry() { out = ${expr}; } }`,
    ...options,
  })
  s.start()
  return s.global('out')
}

async function evalString(expr: string) {
  const s = await loadScript({
    source: `string out; default { state_entry() { out = (string)(${expr}); } }`,
  })
  s.start()
  return s.global('out')
}

describe('llList2ListStrided (measured in Second Life)', () => {
  it.each([
    ['L, 0, -1, 2', [1, 3, 5, 7, 9]],
    ['L, 1, -1, 2', [3, 5, 7, 9]],
    ['L, 2, 7, 3', [4, 7]],
    ['L, -5, -1, 2', [7, 9]],
    ['L, 7, 2, 2', [1, 3, 5, 7, 9]],
    ['L, 0, -1, 1', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
    ['L, 0, -1, 0', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
    ['L, 0, -1, -2', [1, 3, 5, 7, 9]],
    ['L, 0, -1, 20', [1]],
    ['L, 0, 100, 3', [1, 4, 7, 10]],
  ])('llList2ListStrided(%s)', async (args, expected) => {
    expect(await evalList(`llList2ListStrided(${args})`)).toEqual(expected)
  })

  it('keeps element types', async () => {
    const s = await loadScript({
      source: `integer t; default { state_entry() {
        t = llGetListEntryType(llList2ListStrided([(key)"a", 2, (key)"b"], 0, -1, 2), 1);
      } }`,
    })
    s.start()
    expect(s.global('t')).toBe(4)
  })
})

describe('llList2ListSlice (measured in Second Life)', () => {
  it.each([
    ['L, 0, -1, 3, 0', [1, 4, 7, 10]],
    ['L, 0, -1, 3, 1', [2, 5, 8]],
    ['L, 0, -1, 3, -1', [3, 6, 9]],
    ['L, 2, 8, 2, 1', [4, 6, 8]],
    ['L, 0, -1, 3, 5', []],
    ['L, 0, -1, 0, 0', []],
    ['L, 7, 2, 2, 0', [1, 3, 8, 10]],
    ['L, 0, -1, -3, 0', []],
    ['L, 0, -1, -3, 1', []],
    ['L, 0, -1, -3, -1', []],
  ])('llList2ListSlice(%s)', async (args, expected) => {
    expect(await evalList(`llList2ListSlice(${args})`)).toEqual(expected)
  })
})

describe('llListRandomize (measured in Second Life)', () => {
  it('permutes whole stride-2 blocks', async () => {
    const out = (await evalList('llListRandomize(L, 2)', { randomSeed: 7 })) as number[]
    expect([...out].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(out).not.toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    for (let i = 0; i < out.length; i += 2) expect(out[i + 1]).toBe(out[i]! + 1)
  })

  it('returns the list unchanged when its length is not a multiple of the stride', async () => {
    expect(await evalList('llListRandomize(L, 3)')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('returns the list unchanged when the stride is longer than the list', async () => {
    expect(await evalList('llListRandomize(L, 20)')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('shuffles single elements with stride 0', async () => {
    const out = (await evalList('llListRandomize(L, 0)', { randomSeed: 7 })) as number[]
    expect([...out].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(out).not.toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('is deterministic per seed and keeps element types', async () => {
    const a = await evalList('llListRandomize(L, 1)', { randomSeed: 3 })
    const b = await evalList('llListRandomize(L, 1)', { randomSeed: 3 })
    expect(a).toEqual(b)
    const s = await loadScript({
      source: `list out; default { state_entry() { out = llListRandomize([(key)"k"], 1); } }`,
    })
    s.start()
    expect(s.global('out')).toEqual(['k'])
  })
})

describe('llGenerateKey', () => {
  it('returns a fresh UUID per call, deterministic per seed', async () => {
    const source = `key a; key b; default { state_entry() { a = llGenerateKey(); b = llGenerateKey(); } }`
    const s1 = await loadScript({ source, randomSeed: 5 })
    s1.start()
    const s2 = await loadScript({ source, randomSeed: 5 })
    s2.start()
    const a = s1.global('a') as string
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(s1.global('b')).not.toBe(a)
    expect(s2.global('a')).toBe(a)
    expect(s2.global('b')).toBe(s1.global('b'))
  })
})

describe('rotation helpers (measured in Second Life)', () => {
  const q = 'llEuler2Rot(<0.1, 0.2, 0.3>)'
  it.each([
    [q, '<0.06407, 0.09116, 0.15344, 0.98186>'],
    [`llRot2Euler(${q})`, '<0.10000, 0.20000, 0.30000>'],
    ['llEuler2Rot(<1.0, -2.0, 2.5>)', '<-0.61911, -0.47867, 0.32276, 0.53236>'],
    ['llRot2Euler(<0.1, 0.2, 0.3, 0.927362>)', '<0.07262, 0.44554, 0.60929>'],
    ['llRot2Euler(<0.5, 0.5, 0.5, 0.5>)', '<0.00000, 1.57080, 1.57080>'],
    ['llRot2Euler(<0, 0, 0, 0.01>)', '<0.00000, 0.00000, 0.00000>'],
    ['llRot2Euler(<0, 0, 0, 2>)', '<0.00000, 0.00000, 0.00000>'],
    ['llRot2Euler(<0, 0, 0, 0>)', '<0.00000, 0.00000, 0.00000>'],
    ['llRot2Euler(<0.001, 0.002, 0.003, 0.009>)', '<0.07047, 0.45794, 0.62707>'],
    ['llRot2Euler(<0.2, 0.4, 0.6, 1.8>)', '<0.07047, 0.45794, 0.62707>'],
    ['llRot2Euler(<0.005, 0.005, 0.005, 0.005>)', '<0.00000, 1.57080, 1.57080>'],
    ['llRot2Euler(<1, 1, 1, 1>)', '<0.00000, 1.57080, 1.57080>'],
    ['llRot2Euler(<0.01, 0, 0, 0>)', '<3.14159, 0.00000, 0.00000>'],
    ['llEuler2Rot(llRot2Euler(<0.5, 0.5, 0.5, 0.5>))', '<0.50000, 0.50000, 0.50000, 0.50000>'],
    ['llRot2Euler(<-0.5, 0.5, -0.5, 0.5>)', '<0.00000, 1.57080, -1.57080>'],
    ['llEuler2Rot(llRot2Euler(<-0.5, 0.5, -0.5, 0.5>))', '<0.50000, -0.50000, 0.50000, -0.50000>'],
    ['llRot2Euler(llEuler2Rot(<0.3, PI_BY_TWO, 0.2>))', '<0.00000, 1.57080, 0.50000>'],
    ['llRot2Euler(llEuler2Rot(<0.3, -PI_BY_TWO, 0.2>))', '<0.00000, -1.57080, -0.10000>'],
    ['llRot2Euler(llEuler2Rot(<0.3, 1.5707, 0.2>))', '<0.00000, 1.57080, 0.50000>'],
    ['llRot2Euler(llEuler2Rot(<0, PI_BY_TWO, 0>))', '<0.00000, 1.57080, 0.00000>'],
    ['llRot2Euler(llEuler2Rot(<0.3, 1.5704, 0.2>))', '<0.00000, 1.57080, 0.50000>'],
    ['llRot2Euler(llEuler2Rot(<0.3, 1.5705, 0.2>))', '<0.00000, 1.57080, 0.50000>'],
    ['llRot2Euler(llEuler2Rot(<0.3, 1.5706, 0.2>))', '<0.00000, 1.57080, 0.50000>'],
    ['llEuler2Rot(<3, 0, 0>)', '<0.99750, 0.00000, 0.00000, 0.07074>'],
    ['llEuler2Rot(<-3, 0, 0>)', '<0.99750, 0.00000, 0.00000, -0.07074>'],
    ['llEuler2Rot(<0, -3, 0>)', '<0.00000, 0.99750, 0.00000, -0.07074>'],
    ['llEuler2Rot(<0, 0, -3>)', '<0.00000, 0.00000, 0.99750, -0.07074>'],
    ['llEuler2Rot(<3, 3, 3>)', '<-0.07537, 0.06539, -0.07537, 0.99215>'],
    ['llEuler2Rot(<-3, -3, -3>)', '<0.06539, -0.07537, 0.06539, 0.99286>'],
    ['llEuler2Rot(<2, -2.5, 1>)', '<-0.01297, -0.57718, -0.61911, 0.53236>'],
    ['llEuler2Rot(<-2.9, 0.1, 0.2>)', '<0.98592, -0.10497, 0.03735, -0.12470>'],
    ['llEuler2Rot(<1.5, 2.5, -2>)', '<-0.46815, 0.55603, 0.15536, 0.66898>'],
    ['llEuler2Rot(<0.1, 3.1, 0.1>)', '<0.05094, 0.99723, 0.05094, 0.01825>'],
    ['llRot2Left(<0,0,0,0>)', '<0.00000, 1.00000, 0.00000>'],
    ['llRot2Up(<0,0,0,0>)', '<0.00000, 0.00000, 1.00000>'],
    ['llRot2Axis(<0,0,0,0>)', '<0.00000, 0.00000, 0.00000>'],
    ['llRot2Angle(<0,0,0,0>)', '0.000000'],
    [`llRot2Fwd(${q})`, '<0.93629, 0.31299, -0.15935>'],
    [`llRot2Left(${q})`, '<-0.28963, 0.94470, 0.15379>'],
    [`llRot2Up(${q})`, '<0.19867, -0.09784, 0.97517>'],
    [`llRot2Axis(${q})`, '<0.33788, 0.48072, 0.80916>'],
    [`llRot2Angle(${q})`, '0.381565'],
    ['llRot2Fwd(<0,0,0,2>)', '<1.00000, 0.00000, 0.00000>'],
    ['llRot2Axis(ZERO_ROTATION)', '<0.00000, 0.00000, 0.00000>'],
    ['llRot2Angle(ZERO_ROTATION)', '0.000000'],
    ['llRot2Axis(<0,0,0.7071068,-0.7071068>)', '<0.00000, 0.00000, -1.00000>'],
    ['llRot2Angle(<0,0,0.7071068,-0.7071068>)', '1.570796'],
    ['llAxisAngle2Rot(<0,0,1>, PI_BY_TWO)', '<0.00000, 0.00000, 0.70711, 0.70711>'],
    ['llAxisAngle2Rot(<0,0,2>, PI_BY_TWO)', '<0.00000, 0.00000, 0.70711, 0.70711>'],
    ['llAxisAngle2Rot(ZERO_VECTOR, PI_BY_TWO)', '<0.00000, 0.00000, 0.00000, 1.00000>'],
    ['llRotBetween(<1,0,0>, <0,1,0>)', '<0.00000, 0.00000, 0.70711, 0.70711>'],
    ['llRotBetween(<1,0,0>, <-1,0,0>)', '<0.00000, 0.00000, 1.00000, 0.00000>'],
    ['llRotBetween(<0,0,1>, <0,0,-1>)', '<1.00000, 0.00000, 0.00000, 0.00000>'],
    ['llRotBetween(<0,1,0>, <0,-1,0>)', '<1.00000, 0.00000, 0.00000, 0.00000>'],
    ['llRotBetween(<1,1,0>, <-1,-1,0>)', '<0.70711, -0.70711, 0.00000, 0.00000>'],
    ['llRotBetween(<1,2,3>, <-1,-2,-3>)', '<0.96362, -0.14825, -0.22237, 0.00000>'],
    ['llRotBetween(<0,0,-1>, <0,0,1>)', '<1.00000, 0.00000, 0.00000, 0.00000>'],
    ['llRotBetween(<1,0,1>, <-1,0,-1>)', '<0.70711, 0.00000, -0.70711, 0.00000>'],
    ['llRotBetween(<1,0,0>, <2,0,0>)', '<0.00000, 0.00000, 0.00000, 1.00000>'],
    ['llRotBetween(ZERO_VECTOR, <1,0,0>)', '<0.00000, 0.00000, 0.00000, 1.00000>'],
    ['llRotBetween(<1,2,3>, <-3,1,0.5>)', '<-0.11567, -0.54942, 0.40483, 0.72171>'],
  ])('%s = %s', async (expr, expected) => {
    expect(await evalString(expr)).toBe(expected)
  })

  it('a gimbal-locked rotation survives the Euler round trip', async () => {
    const s = await loadScript({
      source: `vector v; default { state_entry() {
        v = <1,0,0> * llEuler2Rot(llRot2Euler(<-0.5, 0.5, -0.5, 0.5>));
      } }`,
    })
    s.start()
    const v = s.global('v') as { x: number; y: number; z: number }
    expect(v.x).toBeCloseTo(0, 5)
    expect(v.y).toBeCloseTo(-1, 5)
    expect(v.z).toBeCloseTo(0, 5)
  })

  it('llRot2Fwd of a zero rotation is the x axis', async () => {
    expect(await evalString('llRot2Fwd(<0,0,0,0>)')).toBe('<1.00000, 0.00000, 0.00000>')
  })
})

describe('llGetRegionTimeDilation', () => {
  it('returns 1.0', async () => {
    expect(await evalString('llGetRegionTimeDilation()')).toBe('1.000000')
  })
})

describe('permissions (measured in Second Life)', () => {
  const source = `
    list events;
    default {
      touch_start(integer n) { llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
      touch_end(integer n) { llRequestPermissions(llGetOwner(), 0); }
      run_time_permissions(integer perm) {
        events += [perm, llGetPermissions(), llGetPermissionsKey()];
      }
    }
  `

  it('a fresh script holds no permissions', async () => {
    const s = await loadScript({
      source: `integer p = -1; key k; default { state_entry() { p = llGetPermissions(); k = llGetPermissionsKey(); } }`,
      owner: OWNER,
    })
    s.start()
    expect(s.global('p')).toBe(0)
    expect(s.global('k')).toBe(NULL_KEY)
  })

  it('granting fires run_time_permissions; denying clears the bits but keeps the key', async () => {
    const s = await loadScript({ source, owner: OWNER })
    s.fire('touch_start', { num_detected: 1 })
    expect(s.permissionRequests).toEqual([
      { agent: OWNER, permissions: PERMISSION_CHANGE_LINKS, answered: false },
    ])
    s.grantPermissions()
    expect(s.global('events')).toEqual([128, 128, OWNER])
    expect(s.permissionRequests[0]!.answered).toBe(true)

    s.fire('touch_start', { num_detected: 1 })
    s.denyPermissions()
    expect(s.global('events')).toEqual([128, 128, OWNER, 0, 0, OWNER])
  })

  it('grants only the requested bits a test passes', async () => {
    const s = await loadScript({ source, owner: OWNER })
    s.fire('touch_start', { num_detected: 1 })
    s.grantPermissions(PERMISSION_CHANGE_LINKS | PERMISSION_TRIGGER_ANIMATION)
    expect(s.global('events')).toEqual([128, 128, OWNER])
  })

  it('requesting no permissions fires no event and leaves nothing to answer', async () => {
    const s = await loadScript({ source, owner: OWNER })
    s.fire('touch_end', { num_detected: 1 })
    expect(s.global('events')).toEqual([])
    expect(s.permissionRequests).toEqual([])
    expect(() => s.grantPermissions()).toThrow(/no pending permission request/)
  })

  it('requesting no permissions after a grant keeps the grant', async () => {
    const s = await loadScript({
      source: `
        list seen;
        default {
          touch_start(integer n) { llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
          touch_end(integer n) { llRequestPermissions(llGetOwner(), 0); llSetTimerEvent(3.0); }
          timer() { llSetTimerEvent(0); seen += [llGetPermissions(), llGetPermissionsKey()]; }
        }
      `,
      owner: OWNER,
    })
    s.fire('touch_start', { num_detected: 1 })
    s.grantPermissions()
    s.fire('touch_end', { num_detected: 1 })
    s.advanceTime(3000)
    expect(s.global('seen')).toEqual([128, OWNER])
  })

  it('llResetScript discards an unanswered request', async () => {
    const s = await loadScript({
      source: `
        list seen;
        default {
          state_entry() { seen += [llGetPermissions(), llGetPermissionsKey()]; }
          touch_start(integer n) { llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); llResetScript(); }
          run_time_permissions(integer perm) { seen += ["rtp", perm]; }
        }
      `,
      owner: OWNER,
    })
    s.fire('touch_start', { num_detected: 1 })
    expect(s.permissionRequests).toEqual([
      { agent: OWNER, permissions: PERMISSION_CHANGE_LINKS, answered: true },
    ])
    expect(() => s.grantPermissions()).toThrow(/no pending permission request/)
    expect(s.global('seen')).toEqual([0, NULL_KEY])
  })

  it('llResetScript clears permissions', async () => {
    const s = await loadScript({
      source: `
        list seen;
        default {
          state_entry() { seen += [llGetPermissions(), llGetPermissionsKey()]; }
          touch_start(integer n) { llRequestPermissions(llGetOwner(), PERMISSION_CHANGE_LINKS); }
          run_time_permissions(integer perm) { llResetScript(); }
        }
      `,
      owner: OWNER,
    })
    s.fire('touch_start', { num_detected: 1 })
    s.grantPermissions()
    expect(s.global('seen')).toEqual([0, NULL_KEY])
  })
})

describe('llRemoveInventory (measured in Second Life)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('deletes another item', async () => {
    const probe = `
      integer before; integer after; integer type;
      default { state_entry() {
        before = llGetInventoryNumber(INVENTORY_ALL);
        llRemoveInventory("memo");
        after = llGetInventoryNumber(INVENTORY_ALL);
        type = llGetInventoryType("memo");
      } }
    `
    const { scripts } = await loadLinkset({
      prims: [
        {
          inventory: [makeInventoryItem({ name: 'memo', type: InventoryType.NOTECARD })],
          scripts: [{ source: { source: probe, filename: 'p.lsl' }, name: 'p' }],
        },
      ],
    })
    const s = scripts['p']!
    s.start()
    expect(s.global('before')).toBe(2)
    expect(s.global('after')).toBe(1)
    expect(s.global('type')).toBe(INVENTORY_NONE)
  })

  it('says an error on a missing name and does nothing else', async () => {
    const s = await loadScript({ source: `default { state_entry() { llRemoveInventory("nope"); } }` })
    s.start()
    expect(s.chat).toEqual([{ channel: DEBUG_CHANNEL, text: "Missing inventory item 'nope'.", type: 'say' }])
    expect(s.host.inventory).toHaveLength(1)
  })

  it('removing the calling script stops it at its next call other than llOwnerSay, and the script is gone', async () => {
    const s = await loadScript({
      source: `default {
        state_entry() {
          llRemoveInventory(llGetScriptName());
          llOwnerSay("next");
          llSleep(1.0);
          llOwnerSay("after sleep");
        }
        touch_start(integer n) { llOwnerSay("touched"); }
      }`,
      scriptName: 'self',
    })
    s.start()
    // In-world: rm.iw / rm2.iw (Aditi, two runs) no other call after the removal took effect (rm1, rm5, rm8) and the script was gone;
    // llRemoveInventory(llGetScriptName()); llOwnerSay("next"); showed "next" in the owner's viewer.
    expect(s.chat.map((c) => c.text)).toEqual(['next'])
    expect(s.host.inventory).toHaveLength(0)
    expect(s.host.scripts).toHaveLength(0)
    s.fire('touch_start', { num_detected: 1 })
    expect(s.chat.map((c) => c.text)).toEqual(['next'])
  })

  it('a self-removed script still runs llOwnerSay, then stops at its next call', async () => {
    const s = await loadScript({
      source: `default { state_entry() {
        llRemoveInventory(llGetScriptName());
        llOwnerSay("next");
        llSetPrimitiveParams([PRIM_TEXT, "set", <1,1,1>, 1.0]);
        llOwnerSay("after");
      } }`,
    })
    s.start()
    // In-world: rm.iw / rm2.iw (Aditi, two runs) no other call after the removal took effect (rm3, rm8);
    // llOwnerSay("next") right after the removal showed in the owner's viewer.
    expect(s.chat.map((c) => c.text)).toEqual(['next'])
    expect(s.text).toBeNull()
  })

  it('nothing after a self-removal takes effect except llOwnerSay', async () => {
    const run = async (body: string) => {
      const s = await loadScript({
        source: `default { state_entry() { llSetTimerEvent(3.0); } timer() { llSetTimerEvent(0); ${body} } }`,
      })
      s.start()
      s.advanceTime(3_000)
      return { heard: s.chat.map((c) => c.text), desc: s.objectDesc, inventory: s.host.inventory.length }
    }
    const rm = 'llRemoveInventory(llGetScriptName());'
    // In-world: rm.iw (two runs) heard only "vN before" for rm1-rm5.
    expect((await run(`llSay(7777, "v1 before"); ${rm} llSay(7777, "v1 s1"); llSay(7777, "v1 s2");`)).heard).toEqual(['v1 before'])
    expect((await run(`llSay(7777, "v2 before"); ${rm} llRegionSay(7777, "v2 r1"); llSay(7777, "v2 s1");`)).heard).toEqual(['v2 before'])
    expect((await run(`llSay(7777, "v4 before"); ${rm} integer i; for (i = 0; i < 1000; ++i) ; llSay(7777, "v4 s1");`)).heard).toEqual(['v4 before'])
    expect((await run(`llSay(7777, "v5 before"); ${rm} llSay(7777, "v5 s1"); llSleep(0.1); llSay(7777, "v5 after sleep");`)).heard).toEqual(['v5 before'])
    // In-world: rm2.iw (two runs) the description stayed at "vN before" and the prim's contents were empty for rm6-rm9.
    expect(await run(`llSetObjectDesc("v6 before"); ${rm} llSetObjectDesc("v6 d1"); llSetObjectDesc("v6 d2");`)).toEqual({ heard: [], desc: 'v6 before', inventory: 0 })
    expect(await run(`llSetObjectDesc("v7 before"); ${rm} integer x = 5; x++; llSetObjectDesc("v7 d1");`)).toEqual({ heard: [], desc: 'v7 before', inventory: 0 })
    expect(await run(`llSetObjectDesc("v9 before"); ${rm} llSay(7777, "v9 s1"); llSetObjectDesc("v9 d1");`)).toEqual({ heard: [], desc: 'v9 before', inventory: 0 })
    // In-world: rm2.iw rm8 kept "v8 before"; the owner's viewer showed llOwnerSay("next") right after a self-removal.
    expect(await run(`llSetObjectDesc("v8 before"); ${rm} llOwnerSay("next"); llSetObjectDesc("v8 d1");`)).toEqual({ heard: ['next'], desc: 'v8 before', inventory: 0 })
  })

  it('a script that removes itself in state_exit just stops', async () => {
    const s = await loadScript({
      source: `default {
        state_entry() { state other; }
        state_exit() {
          llRemoveInventory(llGetScriptName());
          llOwnerSay("exit");
          llSleep(1.0);
          llOwnerSay("after sleep");
        }
      }
      state other { state_entry() { llOwnerSay("other"); } }`,
    })
    expect(() => s.start()).not.toThrow()
    // llOwnerSay still runs after a self-removal (seen in the owner's viewer); the sleep then stops the script.
    expect(s.chat.map((c) => c.text)).toEqual(['exit'])
  })

  it('a fired handler does not run after state_entry removed the script', async () => {
    const s = await loadScript({
      source: `default {
        state_entry() { llRemoveInventory(llGetScriptName()); }
        touch_start(integer n) { llOwnerSay("touched"); }
      }`,
    })
    s.fire('touch_start', { num_detected: 1 })
    expect(s.chat).toEqual([])
  })

  it('a self-removed script stops at its next loop iteration', async () => {
    const s = await loadScript({
      source: `default { state_entry() {
        llRemoveInventory(llGetScriptName());
        integer i;
        for (i = 0; i < 3; ++i) llOwnerSay((string)i);
        while (TRUE) ++i;
      } }`,
    })
    s.start()
    // Not measured: owner chat after a removal is only visible in the owner's viewer. This follows the measured llDie rule
    // (a loop iteration halts) and keeps a removed script from looping forever.
    expect(s.chat.map((c) => c.text)).toEqual(['0'])
    expect(s.host.scripts).toHaveLength(0)
  })
  it('a removal at the end of state_exit skips the new state_entry', async () => {
    const s = await loadScript({
      source: `default {
        state_entry() { state other; }
        state_exit() { llRemoveInventory(llGetScriptName()); }
      }
      state other { state_entry() { llOwnerSay("other"); } }`,
    })
    s.start()
    expect(s.chat.map((c) => c.text)).toEqual([])
    expect(s.host.scripts).toHaveLength(0)
  })
  it('a removal before a state change skips state_exit and the new state_entry', async () => {
    const s = await loadScript({
      source: `default {
        state_entry() { llRemoveInventory(llGetScriptName()); llOwnerSay("next"); state other; }
        state_exit() { llOwnerSay("exit"); }
      }
      state other { state_entry() { llOwnerSay("other"); } }`,
    })
    s.start()
    // llOwnerSay still runs after a self-removal (seen in the owner's viewer); the state change then stops the script.
    expect(s.chat.map((c) => c.text)).toEqual(['next'])
  })

  it('removing another script stops it', async () => {
    const remover = `default { touch_start(integer n) { llRemoveInventory("victim"); } }`
    const victim = `default { touch_start(integer n) { llOwnerSay("still here"); } }`
    const { scripts } = await loadLinkset({
      prims: [
        {
          scripts: [
            { source: { source: remover, filename: 'r.lsl' }, name: 'remover' },
            { source: { source: victim, filename: 'v.lsl' }, name: 'victim' },
          ],
        },
      ],
    })
    scripts['remover']!.fire('touch_start', { num_detected: 1 })
    scripts['victim']!.fire('touch_start', { num_detected: 1 })
    expect(scripts['victim']!.chat).toEqual([])
    expect(scripts['remover']!.host.scripts).toEqual([scripts['remover']])
  })
})

describe('calls to functions that are still stubs', () => {
  afterEach(() => vi.restoreAllMocks())
  const source = `default { state_entry() { llGetAgentSize(NULL_KEY); llGetAgentSize(NULL_KEY); } }`

  it('stay silent by default', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = await loadScript({ source })
    s.start()
    expect(warn).not.toHaveBeenCalled()
    expect(s.callsOf('llGetAgentSize')).toHaveLength(2)
  })

  it("warn once per function with stubs: 'warn'", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = await loadScript({ source, stubs: 'warn' })
    s.start()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toMatch(/llGetAgentSize is a stub/)
  })

  it("throw with stubs: 'throw'", async () => {
    const s = await loadScript({ source, stubs: 'throw' })
    expect(() => s.start()).toThrow(/llGetAgentSize is a stub/)
  })

  it('treat a mocked function as implemented', async () => {
    const s = await loadScript({ source, stubs: 'throw' })
    s.mock('llGetAgentSize', () => ({ x: 1, y: 1, z: 1 }))
    expect(() => s.start()).not.toThrow()
  })
})

// Measured in Second Life, 2026-10-30: llEuler2Rot clears each half-angle sine and cosine whose
// size is below about 1e-5 before combining them, so rotations by PI have exact zero components.
describe('llEuler2Rot near-zero half-angle terms (measured in Second Life)', () => {
  async function component(euler: string, c: 'x' | 'y' | 'z' | 's') {
    const s = await loadScript({
      source: `float out; default { state_entry() { rotation q = llEuler2Rot(${euler}); out = q.${c}; } }`,
    })
    s.start()
    return s.global('out') as number
  }

  it.each([
    ['llEuler2Rot(<PI, 0, 0>)', '<1.00000, 0.00000, 0.00000, 0.00000>'],
    ['llEuler2Rot(<0, PI, 0>)', '<0.00000, 1.00000, 0.00000, 0.00000>'],
    ['llEuler2Rot(<0, 0, PI>)', '<0.00000, 0.00000, 1.00000, 0.00000>'],
    ['llEuler2Rot(<PI, PI, 0>)', '<0.00000, 0.00000, 1.00000, 0.00000>'],
    ['llEuler2Rot(<4, 0, 0>)', '<0.90930, 0.00000, 0.00000, -0.41615>'],
    ['llEuler2Rot(<0, 4, 0>)', '<0.00000, 0.90930, 0.00000, -0.41615>'],
    ['llEuler2Rot(<0, 0, 4>)', '<0.00000, 0.00000, 0.90930, -0.41615>'],
    ['llEuler2Rot(<-4, 0, 0>)', '<0.90930, 0.00000, 0.00000, 0.41615>'],
    ['llEuler2Rot(<4, 4, 0>)', '<-0.37840, -0.37840, 0.82682, 0.17318>'],
    ['llEuler2Rot(<-4, 0, 4>)', '<0.37840, 0.82682, -0.37840, 0.17318>'],
    ['llEuler2Rot(<0, -5, 0>)', '<0.00000, 0.59847, 0.00000, 0.80114>'],
    ['llEuler2Rot(<4, PI, 0>)', '<0.00000, -0.41615, 0.90930, 0.00000>'],
  ])('%s prints %s', async (expr, want) => {
    expect(await evalString(expr)).toBe(want)
  })

  it.each([
    ['<PI, 0, 0>', 's'],
    ['<-PI, 0, 0>', 's'],
    ['<3.14159, 0, 0>', 's'],
    ['<3.14158, 0, 0>', 's'],
    ['<0.00001, 0, 0>', 'x'],
    ['<1, 0.00001, 0>', 'y'],
    ['<1, 0.00001, 0>', 'z'],
  ] as const)('%s has an exact positive zero %s', async (euler, c) => {
    expect(Object.is(await component(euler, c), 0)).toBe(true)
  })

  it.each([
    ['<3.14157, 0, 0>', 's', 1.128117e-5],
    ['<3.1415, 0, 0>', 's', 4.63287e-5],
    ['<0.00003, 0, 0>', 'x', 1.500023e-5],
    ['<1, 0.00003, 0>', 'y', 1.316394e-5],
    ['<1, 0.00003, 0>', 'z', 7.191495e-6],
  ] as const)('%s keeps %s at about %f', async (euler, c, want) => {
    expect(Math.abs((await component(euler, c)) - want) / want).toBeLessThan(1e-4)
  })
})
