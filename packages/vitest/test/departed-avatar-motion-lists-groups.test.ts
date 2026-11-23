import { describe, expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LlGetObjectDetails
// https://wiki.secondlife.com/wiki/LlGetAgentList
// https://wiki.secondlife.com/wiki/LlGetAttachedList
// https://wiki.secondlife.com/wiki/LlName2Key
// https://wiki.secondlife.com/wiki/LlGetVisualParams
// https://wiki.secondlife.com/wiki/LlSameGroup
// https://wiki.secondlife.com/wiki/LlSensor
//
// Every "In-world" note below was measured on Aditi, 2026-11-23, with Firestorm (RLVa) and one
// avatar that owned the watch and wore eight attachments, none on the HUD. The watch stayed in
// SLua Tideland and read the avatar in a loop bounded by llGetTime (80 to 130 samples a second),
// noting each change with the time since it started, while the avatar teleported to SLua Tombolo
// (the next region north) or Cloud Sandbox 2 (far away), or sat on a seat that died.
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const OBJECT_ROT = 4, OBJECT_VELOCITY = 5, OBJECT_SCALE = 47
const AGENT_LIST_PARCEL = 1, AGENT_LIST_PARCEL_OWNER = 2, AGENT_LIST_REGION = 4

const source = `
  key o; list out; list details; list seen;
  default {
    state_entry() { o = llGetOwner(); llSitTarget(<0.0, 0.0, 0.6>, llEuler2Rot(<0.0, 0.0, PI_BY_TWO>)); }
    link_message(integer s, integer n, string str, key id) {
      if (str == "lists") out = [llListFindList(llGetAgentList(AGENT_LIST_PARCEL, []), [o]) != -1,
        llListFindList(llGetAgentList(AGENT_LIST_PARCEL_OWNER, []), [o]) != -1,
        llListFindList(llGetAgentList(AGENT_LIST_REGION, []), [o]) != -1];
      else if (str == "others") out = [llName2Key("owner resident") == o, llSameGroup(o),
        llList2String(llGetVisualParams(o, ["height"]), 0)];
      else if (str == "attached") out = llGetAttachedList(o);
      else if (str == "details") details = llGetObjectDetails(o, [n]);
      else if (str == "sense") { seen = []; llSensor("", o, AGENT, 96.0, PI); }
      else if (str == "die") llDie();
    }
    sensor(integer k) { seen = [llDetectedKey(0)]; }
    no_sensor() { seen = ["none"]; }
  }`

async function probe(world: World, position = { x: 64, y: 128, z: 20 }) {
  const { linkset, scripts } = await loadLinkset({ world, region: 'home', owner: OWNER, position,
    prims: [{ scripts: [{ name: 'probe', source: { source } }] }] })
  const script = scripts['probe']!
  script.start()
  linkset.advanceTime(0)
  const send = (str: string, num = 0) => {
    script.fire('link_message', { sender_num: 1, num, str, id: '' })
    linkset.advanceTime(0)
  }
  const ask = (str: string) => { send(str); return script.global('out') as unknown[] }
  return {
    linkset, send, prim: linkset.prims[0]!,
    lists: () => ask('lists'),
    others: () => ask('others'),
    attached: () => ask('attached'),
    details: (flag: number) => { send('details', flag); return script.global('details') as unknown[] },
    seen: () => script.global('seen') as unknown[],
  }
}

async function fixture() {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addRegion('north', { x: 0, y: 256 })
  world.addRegion('far', { x: 25600, y: 25600 })
  world.addParcel({ region: 'home', owner: OWNER, bounds: { min: { x: 0, y: 0 }, max: { x: 128, y: 256 } } })
  world.addParcel({ region: 'home', owner: OTHER, bounds: { min: { x: 128, y: 0 }, max: { x: 256, y: 256 } } })
  const avatar = world.addAvatar({ region: 'home', key: OWNER, name: 'owner Resident', username: 'owner.resident', displayName: 'Owner',
    position: { x: 64, y: 128, z: 20 }, size: { x: 0.45, y: 0.6, z: 1.65 }, visualParams: { 33: 0.596079 },
    viewer: { profile: 'rlva' } })
  const seat = await probe(world)
  const watcher = await probe(world)
  const across = await probe(world, { x: 200, y: 128, z: 20 })
  for (const p of [seat, watcher, across]) avatar.viewer.session.bind(p.linkset, avatar)
  const advance = (ms: number) => watcher.linkset.advanceTime(ms)
  const teleport = (region: 'home' | 'north' | 'far') => {
    const corner = world.corner(region)
    expect(world.teleportAvatar(avatar, { x: corner.x + 118, y: corner.y + 48, z: 30 })).toBe(true)
  }
  return { world, avatar, seat, watcher, across, advance, teleport }
}

const SIZE = { x: 0.45, y: 0.6, z: 1.65 }
const ZERO = { x: 0, y: 0, z: 0 }
const WALKING = { x: 3.2, y: 0, z: 0 }

describe('OBJECT_VELOCITY and OBJECT_SCALE of an avatar that left', () => {
  // In-world: the avatar walked at 3.2 m/s when it was teleported to Cloud Sandbox 2. OBJECT_VELOCITY
  // read zero from the first "Init" sample and while it walked there, and OBJECT_SCALE read its size
  // <0.45, 0.6, 1.65>, until the names went 50.33 s after the llGetAgentList drop; then each read [].
  it('reads zero velocity and its size while the region knows an avatar far away', async () => {
    const f = await fixture()
    f.avatar.velocity = { ...WALKING }
    f.teleport('far')
    expect(f.watcher.details(OBJECT_VELOCITY)).toEqual([ZERO])
    f.advance(5000)
    f.avatar.velocity = { ...WALKING }
    expect(f.watcher.details(OBJECT_VELOCITY)).toEqual([ZERO])
    expect(f.watcher.details(OBJECT_SCALE)).toEqual([SIZE])
    f.advance(45_000)
    expect(f.watcher.details(OBJECT_VELOCITY)).toEqual([ZERO])
    f.advance(1000)
    expect(f.watcher.details(OBJECT_VELOCITY)).toEqual([])
    expect(f.watcher.details(OBJECT_SCALE)).toEqual([])
  })

  // In-world: in SLua Tombolo the avatar walked back and forth; OBJECT_VELOCITY followed it
  // (<3.2, -0.08, 0>, then <-3.16, 0.53, 0>, then zero once it stopped) and OBJECT_SCALE read its size.
  // Through "Init" it read zero in all five teleports out; the one that left walking went far away.
  it('follows the velocity of an avatar in the next region once its "Init" ends', async () => {
    const f = await fixture()
    f.avatar.velocity = { ...WALKING }
    f.teleport('north')
    expect(f.watcher.details(OBJECT_VELOCITY)).toEqual([ZERO])
    f.advance(1000)
    f.avatar.velocity = { x: -3.16, y: 0.53, z: 0 }
    expect(f.watcher.details(OBJECT_VELOCITY)).toEqual([f.avatar.velocity])
    expect(f.watcher.details(OBJECT_SCALE)).toEqual([SIZE])
  })
})

describe('the region an avatar leaves, while it reads "Init"', () => {
  // In-world: five teleports out, standing, walking and from a seat. Through "Init" the avatar
  // stayed in AGENT_LIST_PARCEL and AGENT_LIST_PARCEL_OWNER as well as AGENT_LIST_REGION; all three
  // dropped it in the same sample.
  it('keeps the avatar in the parcel lists as in the region list', async () => {
    const f = await fixture()
    expect(f.watcher.lists()).toEqual([1, 1, 1])
    f.teleport('far')
    expect(f.watcher.lists()).toEqual([1, 1, 1])
    f.advance(1000)
    expect(f.watcher.lists()).toEqual([0, 0, 0])
  })

  it('lists it by the parcel it left from', async () => {
    const f = await fixture()
    expect(f.across.lists()).toEqual([0, 0, 1])
    const corner = f.world.corner('far')
    expect(f.world.teleportAvatar(f.avatar, { x: corner.x + 200, y: corner.y + 128, z: 30 })).toBe(true)
    expect(f.watcher.lists()).toEqual([1, 1, 1])
    expect(f.across.lists()).toEqual([0, 0, 1])
  })

  // In-world: the avatar wore eight attachments, none on the HUD. llGetAttachedList listed all
  // eight through "Init" and one sample past it, then read "NOT ON REGION", in five runs.
  it('lists the attachments it wears', async () => {
    const f = await fixture()
    const { linkset } = await loadLinkset({ world: f.world, region: 'home', owner: OWNER, prims: [{}] })
    linkset.attachToAvatar(OWNER, 6)
    const worn = [linkset.prims[0]!.key]
    expect(f.watcher.attached()).toEqual(worn)
    f.teleport('far')
    expect(f.watcher.attached()).toEqual(worn)
    f.advance(1000)
    expect(f.watcher.attached()).toEqual(['NOT ON REGION'])
  })
})

describe('an avatar that teleports from a seat', () => {
  // In-world: seated on a sit target turned 90 degrees, the avatar read OBJECT_ROT <0, 0, 90> (it
  // stood at <0, 0, 15>). After a teleport to Cloud Sandbox 2 the region read <0, 0, 90> through
  // "Init" and for the 50 s it knew the avatar.
  it('keeps the rotation it had on the seat', async () => {
    const f = await fixture()
    expect(f.world.userSitAvatar(f.avatar, f.seat.prim)).toBe(true)
    f.advance(1000)
    const seated = f.watcher.details(OBJECT_ROT)[0] as { z: number, s: number }
    expect(seated.z).toBeCloseTo(Math.SQRT1_2)
    expect(seated.s).toBeCloseTo(Math.SQRT1_2)
    f.teleport('far')
    expect(f.watcher.details(OBJECT_ROT)).toEqual([seated])
    f.advance(30_000)
    expect(f.watcher.details(OBJECT_ROT)).toEqual([seated])
  })
})

describe('llName2Key, llGetVisualParams and llSameGroup for an avatar that left', () => {
  // In-world: the three read as before through "Init", for the whole stay in SLua Tombolo and,
  // after a teleport to Cloud Sandbox 2, until the names went 50.33 s after the llGetAgentList drop.
  // Then llGetVisualParams read [] and llSameGroup FALSE, while llName2Key still returned the key
  // at the end of the watch, 75 s after the avatar left.
  it('reads the avatar far away until the names go, and its key after', async () => {
    const f = await fixture()
    f.teleport('far')
    expect(f.watcher.others()).toEqual([1, 1, '0.596079'])
    f.advance(50_000)
    expect(f.watcher.others()).toEqual([1, 1, '0.596079'])
    f.advance(1000)
    expect(f.watcher.others()).toEqual([1, 0, ''])
    f.advance(24_000)
    expect(f.watcher.others()).toEqual([1, 0, ''])
  })

  it('reads the avatar in the next region', async () => {
    const f = await fixture()
    f.teleport('north')
    f.advance(120_000)
    expect(f.watcher.others()).toEqual([1, 1, '0.596079'])
  })

  it('finds an avatar in the next region by name, as it reads its group', async () => {
    const f = await fixture()
    f.avatar.region = 'north'
    expect(f.watcher.others()).toEqual([1, 1, '0.596079'])
  })
})

describe('a seat that dies under the avatar', () => {
  // In-world: eight runs, six with the empty frame. In that frame llGetVisualParams read [] and
  // llSameGroup FALSE, as for an avatar that has gone, but llName2Key still returned the key.
  it('hides the avatar from llGetVisualParams and llSameGroup but not from llName2Key', async () => {
    const f = await fixture()
    expect(f.world.userSitAvatar(f.avatar, f.seat.prim)).toBe(true)
    f.advance(1000)
    f.seat.send('die')
    expect(f.watcher.others()).toEqual([1, 0, ''])
    f.advance(30)
    expect(f.watcher.others()).toEqual([1, 1, '0.596079'])
  })

  // In-world: two objects ran llSensorRepeat on the avatar's key (an event every 0.045 s) through
  // the six runs that read the empty frame. Neither ever raised no_sensor.
  it('leaves the avatar to sensors', async () => {
    const f = await fixture()
    expect(f.world.userSitAvatar(f.avatar, f.seat.prim)).toBe(true)
    f.advance(1000)
    f.seat.send('die')
    f.watcher.send('sense')
    f.advance(0)
    expect(f.watcher.seen()).toEqual([OWNER])
  })
})
