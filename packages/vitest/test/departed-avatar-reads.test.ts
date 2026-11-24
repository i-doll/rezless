import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlKey2Name
// https://wiki.secondlife.com/wiki/LlGetUsername
// https://wiki.secondlife.com/wiki/LlGetDisplayName
// https://wiki.secondlife.com/wiki/LlGetObjectDetails
// https://wiki.secondlife.com/wiki/LlGetAgentList
// https://wiki.secondlife.com/wiki/LlGetAttachedList
//
// Every "In-world" note below was measured on Aditi, 2026-11-23, with Firestorm (RLVa) and one
// avatar that owned the watch. The watch stayed in SLua Tideland and read the avatar in a loop
// bounded by llGetTime (about 100 samples a second), noting each change with the time since it
// started, while the avatar sat on a seat that died or teleported to SLua Tombolo (the next region
// north), SLua Yardang (diagonal) or Cloud Sandbox 2 (far away).
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OBJECT_NAME = 1, OBJECT_POS = 3, OBJECT_ROT = 4, OBJECT_OWNER = 6, OBJECT_RUNNING_SCRIPT_COUNT = 9
const OBJECT_TOTAL_SCRIPT_COUNT = 10, OBJECT_SCRIPT_MEMORY = 11, OBJECT_STREAMING_COST = 15, OBJECT_ATTACHED_SLOTS_AVAILABLE = 35
const OBJECT_ACCOUNT_LEVEL = 41, OBJECT_MASS = 43, OBJECT_PRIM_COUNT = 30, OBJECT_TOTAL_INVENTORY_COUNT = 31
const SIM_FRAME_MS = 1000 / 45

const source = `
  key o; list out; list details; list later;
  list rd() {
    return [llKey2Name(o), llGetUsername(o), llGetDisplayName(o), llGetAgentInfo(o),
      llGetAnimation(o), llGetAgentSize(o) != ZERO_VECTOR, llListFindList(llGetAgentList(AGENT_LIST_REGION, []), [o]) != -1,
      llList2String(llGetAttachedList(o), 0), llGetListLength(llGetObjectDetails(o, [OBJECT_NAME]))];
  }
  default {
    state_entry() { o = llGetOwner(); llSitTarget(<0.0, 0.0, 0.6>, ZERO_ROTATION); }
    link_message(integer s, integer n, string str, key id) {
      if (str == "rd") out = rd();
      else if (str == "rd3") { out = rd(); llSetText("", ZERO_VECTOR, 20.0); later = [llKey2Name(o)]; llSetText("", ZERO_VECTOR, 10.0); later += rd(); }
      else if (str == "details") {
        list flags = llCSV2List((string)id); list typed; integer i;
        for (; i < llGetListLength(flags); ++i) typed += (integer)llList2String(flags, i);
        details = llGetObjectDetails(o, typed);
      }
      else if (str == "die") llDie();
      else if (str == "lang") out = [llGetAgentLanguage(o)];
    }
  }`

async function probe(world: World) {
  const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, position: { x: 128, y: 128, z: 20 },
    prims: [{ scripts: [{ name: 'probe', source: { source } }] }] })
  const script = scripts['probe']!
  // The in-world watch read in a loop on llGetTime: here a call keeps the handler busy as long.
  script.mock('llSetText', (ctx, args) => { ctx.busy(Number(args[2])); return undefined })
  script.start()
  linkset.advanceTime(0)
  const send = (str: string, id = '') => {
    script.fire('link_message', { sender_num: 1, num: 0, str, id })
    linkset.advanceTime(0)
  }
  const read = () => { send('rd'); return script.global('out') as unknown[] }
  /** Reads in one handler at once, 20 ms later (the name) and 30 ms later, as the in-world watch's loop did. */
  const readThrice = () => {
    send('rd3')
    const later = script.global('later') as unknown[]
    return [script.global('out') as unknown[], later[0], later.slice(1)] as const
  }
  const language = () => { send('lang'); return (script.global('out') as unknown[])[0] }
  const details = (flags: number[]) => { send('details', flags.join(',')); return script.global('details') as unknown[] }
  return { linkset, send, read, readThrice, details, language, prim: linkset.prims[0]! }
}

async function fixture() {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addRegion('north', { x: 0, y: 256 })
  world.addRegion('far', { x: 25600, y: 25600 })
  const avatar = world.addAvatar({ region: 'home', key: OWNER, name: 'owner Resident', username: 'owner.resident', displayName: 'Owner',
    position: { x: 128, y: 128, z: 20 }, viewer: { profile: 'rlva' } })
  const seat = await probe(world)
  const watcher = await probe(world)
  for (const p of [seat, watcher]) avatar.viewer.session.bind(p.linkset, avatar)
  const advance = (ms: number) => watcher.linkset.advanceTime(ms)
  advance(100)
  const teleport = (region: 'home' | 'north' | 'far') => {
    const corner = world.corner(region)
    expect(world.teleportAvatar(avatar, { x: corner.x + 118, y: corner.y + 48, z: 30 })).toBe(true)
  }
  return { world, avatar, seat, watcher, advance, teleport }
}

const NAMES = ['owner Resident', 'owner.resident', 'Owner']
const GONE = ['', '', '', 0, '', 0, 0]

describe('a seat that dies under the avatar', () => {
  // In-world: the seat called llDie() with the avatar on it, five runs. In three, for one region
  // frame (0.02 to 0.04 s) every read came back as if the avatar had left: "" names, 0, "", a zero
  // size, no llGetAgentList entry, llGetAttachedList "NOT FOUND" and llGetObjectDetails []. Then
  // 262 "Striding". Five earlier runs (2026-11-23) each read the gap for one sample.
  it('reads the sitter as absent for one frame', async () => {
    const f = await fixture()
    expect(f.world.userSitAvatar(f.avatar, f.seat.prim)).toBe(true)
    f.advance(1000)
    f.seat.send('die')
    const [now, twenty, thirty] = f.watcher.readThrice()
    expect(now).toEqual([...GONE, 'NOT FOUND', 0])
    expect(twenty).toBe('')
    expect(thirty).toEqual([...NAMES, 0x100, 'Striding', 1, 1, expect.anything(), 1])
  })
})

describe('the region an avatar leaves, while it reads "Init"', () => {
  // In-world: through the "Init" reads, the names, llGetAgentLanguage, llGetAttachedList and
  // llGetObjectDetails read as before, OBJECT_POS where the avatar had stood, and llGetAgentList
  // kept the avatar until one frame (0.02 to 0.05 s) after "Init" ended, in five runs.
  it('reads everything but its motion as before', async () => {
    const f = await fixture()
    f.avatar.language = 'en'
    f.teleport('far')
    expect(f.watcher.read()).toEqual([...NAMES, 0, 'Init', 1, 1, '', 1])
    expect(f.watcher.details([OBJECT_POS, OBJECT_RUNNING_SCRIPT_COUNT])).toEqual([{ x: 128, y: 128, z: 20 }, 0])
    expect(f.watcher.language()).toBe('en')
    f.advance(210 - 2 * SIM_FRAME_MS)
    expect(f.watcher.read()).toEqual([...NAMES, 0, '', 0, 1, '', 1])
    f.advance(20)
    expect(f.watcher.read()).toEqual([...NAMES, 0, '', 0, 0, 'NOT ON REGION', 1])
    expect(f.watcher.language()).toBe('')
  })
})

describe('the region an avatar leaves for a distant one', () => {
  // In-world: two runs to Cloud Sandbox 2. "Init" for 0.07 to 0.29 s, then llGetAgentInfo 0,
  // llGetAnimation "", llGetAgentSize zero, and llGetAgentList dropped the avatar one frame later.
  // llKey2Name, llGetUsername and llGetDisplayName kept returning its names, and llGetAttachedList
  // "NOT ON REGION", until 50.34 and 50.36 s after the llGetAgentList drop; then "" and "NOT
  // FOUND", and llGetObjectDetails [].
  it('keeps the names for about 50 s', async () => {
    const f = await fixture()
    f.teleport('far')
    f.advance(230)
    expect(f.watcher.read()).toEqual([...NAMES, 0, '', 0, 0, 'NOT ON REGION', 1])
    f.advance(50_300)
    expect(f.watcher.read().slice(0, 3)).toEqual(NAMES)
    f.advance(100)
    expect(f.watcher.read()).toEqual([...GONE, 'NOT FOUND', 0])
  })

  // In-world: any llGetObjectDetails list with OBJECT_POS read []; OBJECT_ROT, OBJECT_SCALE and
  // OBJECT_VELOCITY alone each read one value. A list without OBJECT_POS came back in full, with
  // OBJECT_RUNNING_SCRIPT_COUNT, OBJECT_TOTAL_SCRIPT_COUNT, OBJECT_SCRIPT_MEMORY, OBJECT_PRIM_COUNT,
  // OBJECT_TOTAL_INVENTORY_COUNT and OBJECT_STREAMING_COST 0, OBJECT_MASS 1.0,
  // OBJECT_ATTACHED_SLOTS_AVAILABLE 38 (37 before) and OBJECT_ACCOUNT_LEVEL -1 (0 before).
  it('reads no details with OBJECT_POS, and the rest with its scripts and attachments gone', async () => {
    const f = await fixture()
    Object.assign(f.avatar.objectDetails, { runningScriptCount: 1, totalScriptCount: 1, scriptMemory: 65536, primCount: 1,
      totalInventoryCount: 1, streamingCost: 1, mass: 161.16, attachedSlotsAvailable: 37 })
    f.teleport('far')
    f.advance(1000)
    expect(f.watcher.details([OBJECT_NAME, OBJECT_POS])).toEqual([])
    expect(f.watcher.details([OBJECT_POS])).toEqual([])
    expect(f.watcher.details([OBJECT_NAME, OBJECT_OWNER, OBJECT_RUNNING_SCRIPT_COUNT, OBJECT_TOTAL_SCRIPT_COUNT,
      OBJECT_SCRIPT_MEMORY, OBJECT_PRIM_COUNT, OBJECT_TOTAL_INVENTORY_COUNT, OBJECT_STREAMING_COST, OBJECT_MASS,
      OBJECT_ATTACHED_SLOTS_AVAILABLE, OBJECT_ACCOUNT_LEVEL])).toEqual(['owner Resident', OWNER, 0, 0, 0, 0, 0, 0, 1, 38, -1])
  })

  // In-world: the avatar turned 90 degrees in the distant region; OBJECT_ROT kept its old value.
  it('keeps the rotation it had when it left', async () => {
    const f = await fixture()
    const before = { ...f.avatar.rotation }
    f.teleport('far')
    f.advance(1000)
    f.avatar.rotation = { x: 0, y: 0, z: Math.SQRT1_2, s: Math.SQRT1_2 }
    expect(f.watcher.details([OBJECT_ROT])).toEqual([before])
  })

  // In-world: a run to diagonal SLua Yardang read as for a distant region: names, no OBJECT_POS.
  it('counts a diagonal region as distant', async () => {
    const f = await fixture()
    f.world.addRegion('diagonal', { x: 256, y: 256 })
    expect(f.world.teleportAvatar(f.avatar, { x: 256 + 118, y: 256 + 48, z: 30 })).toBe(true)
    f.advance(1000)
    expect(f.watcher.read().slice(0, 3)).toEqual(NAMES)
    expect(f.watcher.details([OBJECT_NAME, OBJECT_POS])).toEqual([])
  })
})

describe('the region an avatar leaves for the next one', () => {
  // In-world: three runs to SLua Tombolo. "Init" for 0.18 s, then llGetAgentInfo 0 and
  // llGetAgentList dropped it, as for a distant region. The names, llGetAttachedList "NOT ON
  // REGION" and llGetObjectDetails lasted the whole 25, 75 and 10 s stays. OBJECT_POS followed the
  // avatar in SLua Tideland's frame (<118, 304, 23> as it stood at <118, 48, 23> in SLua Tombolo),
  // and OBJECT_ROT followed its turns.
  it('keeps the names and follows the avatar for as long as it stays there', async () => {
    const f = await fixture()
    f.teleport('north')
    f.advance(120_000)
    expect(f.watcher.read()).toEqual([...NAMES, 0, '', 0, 0, 'NOT ON REGION', 1])
    f.avatar.position = { x: 118, y: 48, z: 23 }
    f.avatar.rotation = { x: 0, y: 0, z: Math.SQRT1_2, s: Math.SQRT1_2 }
    expect(f.watcher.details([OBJECT_NAME, OBJECT_POS, OBJECT_ROT])).toEqual(['owner Resident', { x: 118, y: 304, z: 23 }, f.avatar.rotation])
  })

  // In-world: after the names had gone, a teleport from Cloud Sandbox 2 to SLua Tombolo brought
  // them back in SLua Tideland, with the live position.
  it('knows an avatar that comes there from far away', async () => {
    const f = await fixture()
    f.teleport('far')
    f.advance(60_000)
    expect(f.watcher.read()[0]).toBe('')
    f.teleport('north')
    f.advance(1000)
    expect(f.watcher.read().slice(0, 3)).toEqual(NAMES)
    expect(f.watcher.details([OBJECT_POS])).toEqual([{ x: 118, y: 304, z: 30 }])
  })

  // In-world: from SLua Tombolo the avatar went on to Cloud Sandbox 2. SLua Tideland kept the
  // position and rotation it last had in SLua Tombolo, and the names, for about 49 s.
  it('keeps where the avatar was last seen once it goes further', async () => {
    const f = await fixture()
    f.teleport('north')
    f.advance(10_000)
    f.avatar.position = { x: 118, y: 48, z: 23 }
    const rotation = { ...f.avatar.rotation }
    f.teleport('far')
    f.advance(40_000)
    expect(f.watcher.read().slice(0, 3)).toEqual(NAMES)
    expect(f.watcher.details([OBJECT_POS, OBJECT_ROT])).toEqual([{ x: 118, y: 304, z: 23 }, rotation])
    f.advance(11_000)
    expect(f.watcher.read()).toEqual([...GONE, 'NOT FOUND', 0])
  })

  it('reads the avatar as usual once it comes back', async () => {
    const f = await fixture()
    f.teleport('north')
    f.advance(1000)
    f.teleport('home')
    f.advance(2000)
    expect(f.watcher.read().slice(0, 3)).toEqual(NAMES)
    expect(f.watcher.read()[6]).toBe(1)
  })
})

describe('an avatar far away that the region never saw', () => {
  it('reads llGetAttachedList "NOT FOUND"', async () => {
    const f = await fixture()
    f.avatar.region = 'far'
    expect(f.watcher.read()).toEqual([...GONE, 'NOT FOUND', 0])
  })
})
