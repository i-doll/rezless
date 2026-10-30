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

  it('shouts on a missing name and does nothing else', async () => {
    const s = await loadScript({ source: `default { state_entry() { llRemoveInventory("nope"); } }` })
    s.start()
    expect(s.chat).toEqual([{ channel: DEBUG_CHANNEL, text: "Missing inventory item 'nope'.", type: 'shout' }])
    expect(s.host.inventory).toHaveLength(1)
  })

  it('removing the calling script runs on until it yields, then the script is gone', async () => {
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
    expect(s.chat.map((c) => c.text)).toEqual(['next'])
    expect(s.host.inventory).toHaveLength(0)
    expect(s.host.scripts).toHaveLength(0)
    s.fire('touch_start', { num_detected: 1 })
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
