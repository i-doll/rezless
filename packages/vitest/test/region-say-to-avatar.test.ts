import { expect, it } from 'vitest'
import { loadLinkset, World } from '../src/index.js'

const OWNER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const listener = `list heard;
default {
  state_entry() {
    llListen(34542, "", NULL_KEY, "");
    llListen(-34542, "", NULL_KEY, "");
    llListen(0, "", NULL_KEY, "");
  }
  listen(integer c, string n, key id, string m) { heard += [c, n, id, m]; }
}`

async function fixture() {
  const world = new World()
  world.addRegion('home', { x: 0, y: 0 })
  world.addRegion('away', { x: 256, y: 0 })
  world.addAvatar({ region: 'home', key: OWNER, username: 'owner' })
  world.addAvatar({ region: 'home', key: OTHER, username: 'other' })
  async function object(name: string, region = 'home', body = '', child = false) {
    const loaded = await loadLinkset({ world, region, owner: OWNER, prims: [
      { name, scripts: [{ name: 'root', source: { source: body || listener } }] },
      ...(child ? [{ name: `${name} child`, scripts: [{ name: 'child', source: { source: listener } }] }] : []),
    ] })
    for (const script of Object.values(loaded.scripts)) script.start()
    return loaded
  }
  const item = await object('item', 'home', '', true)
  const second = await object('second')
  const rezzed = await object('rezzed')
  const foreign = await object('foreign')
  item.linkset.attachToAvatar(OWNER, 6)
  second.linkset.attachToAvatar(OWNER, 5)
  foreign.linkset.attachToAvatar(OTHER, 6)
  return { world, object, item, second, rezzed, foreign }
}

// https://wiki.secondlife.com/wiki/LlRegionSayTo
// In-world: rezzed and HUD senders targeting their owner on 34542 and -34542
// reached worn linksets, including root and child listeners. Channel 0 reached
// no script; a rezzed control heard none of these avatar messages.
// Aditi, SLua Tideland, Firestorm 7.3.0.83011, 2026-11-01.
it.each([34542, -34542, 0])('routes avatar-targeted channel %i from rezzed and HUD senders', async channel => {
  const { object, item, second, rezzed, foreign } = await fixture()
  const tx = await object('sender', 'home', `list heard;
    default {
      state_entry(){llListen(${channel}, "", NULL_KEY, "");}
      touch_start(integer n){llRegionSayTo(llGetOwner(), ${channel}, "hello");}
      listen(integer c,string n,key id,string m){heard += [m];}
    }`)
  const expected = channel === 0 ? [] : [channel, 'sender', tx.prims[0]!.key, 'hello']
  tx.linkset.touch(0)
  for (const receiver of [item.scripts.root!, item.scripts.child!, second.scripts.root!]) {
    expect(receiver.global('heard')).toEqual(expected)
  }
  tx.linkset.attachToAvatar(OWNER, 31)
  tx.linkset.touch(0)
  for (const receiver of [item.scripts.root!, item.scripts.child!, second.scripts.root!]) {
    expect(receiver.global('heard')).toEqual([...expected, ...expected])
  }
  expect(tx.scripts.root!.global('heard')).toEqual([])
  expect(rezzed.scripts.root!.global('heard')).toEqual([])
  expect(foreign.scripts.root!.global('heard')).toEqual([])
})

it('keeps avatar delivery within the sender region and follows the wearer on region changes', async () => {
  const { world, object, item, second } = await fixture()
  const tx = await object('sender', 'away', `default {
    touch_start(integer n){llRegionSayTo("${OWNER}", -34542, "hello");}
  }`)
  tx.linkset.touch(0)
  expect(item.scripts.root!.global('heard')).toEqual([])
  expect(second.scripts.root!.global('heard')).toEqual([])
  world.avatars.find(a => a.key === OWNER)!.region = 'away'
  tx.linkset.touch(0)
  expect(item.scripts.root!.global('heard')).toEqual([-34542, 'sender', tx.prims[0]!.key, 'hello'])
  expect(second.scripts.root!.global('heard')).toEqual([-34542, 'sender', tx.prims[0]!.key, 'hello'])
})

// In-world: direct control-prim targets received channel 0 and -34542;
// attachments received only the separate avatar-targeted message.
// Aditi, SLua Tideland, Firestorm 7.3.0.83011, 2026-11-01.
it('preserves direct prim delivery on zero and negative channels without forwarding to siblings', async () => {
  const { object, item, second } = await fixture()
  const tx = await object('sender', 'home', `default {touch_start(integer n){
    llRegionSayTo("${item.prims[1]!.key}", 0, "zero");
    llRegionSayTo("${item.prims[1]!.key}", -34542, "negative");
    llRegionSayTo(NULL_KEY, -34542, "null");
    llRegionSayTo("33333333-3333-3333-3333-333333333333", -34542, "absent");
  }}`)
  tx.linkset.touch(0)
  expect(item.scripts.child!.global('heard')).toEqual([
    0, 'sender', tx.prims[0]!.key, 'zero',
    -34542, 'sender', tx.prims[0]!.key, 'negative',
  ])
  expect(item.scripts.root!.global('heard')).toEqual([])
  expect(second.scripts.root!.global('heard')).toEqual([])
})

it('applies listen name, key and message filters to avatar delivery', async () => {
  const { object } = await fixture()
  const tx = await object('sender', 'home', `default {touch_start(integer n){
    llRegionSayTo(llGetOwner(), -34542, "hello");
    llRegionSayTo(llGetOwner(), -34542, "other");
  }}`)
  const receiver = await object('filtered', 'home', `list heard;
    default {
      state_entry(){
        llListen(-34542,"sender","${tx.prims[0]!.key}","hello");
        llListen(-34542,"wrong","${tx.prims[0]!.key}","hello");
        llListen(-34542,"sender","${OTHER}","hello");
      }
      listen(integer c,string n,key id,string m){heard += [c,n,id,m];}
    }`)
  receiver.linkset.attachToAvatar(OWNER, 6)
  tx.linkset.touch(0)
  expect(receiver.scripts.root!.global('heard')).toEqual([-34542, 'sender', tx.prims[0]!.key, 'hello'])
})
