import { describe, expect, it } from 'vitest'
import { loadLinkset, loadRlvPair, World } from '../src/index.js'

const listener = `string log;
default {
  state_entry() { llListen(0, "", NULL_KEY, ""); llListen(39603, "", NULL_KEY, ""); llListen(-39603, "", NULL_KEY, ""); }
  listen(integer c, string n, key id, string m) { log += (string)c + " " + n + " " + m + "|"; }
}`

async function setup() {
  const world = new World()
  world.addRegion('SLua Tideland', { x: 0, y: 0 })
  world.addRegion('SLua Tombolo', { x: 256, y: 0 })
  const avatar = world.addAvatar({ username: 'bob.resident', name: 'Bob Resident', region: 'SLua Tideland', position: { x: 114, y: 44, z: 1998 } })
  const { scripts, linkset } = await loadLinkset({ world, region: 'SLua Tideland', owner: avatar.key,
    prims: [{ scripts: [{ name: 'listener', source: { source: listener } }] }] })
  const script = scripts.listener!
  script.host.params.position = { x: 114, y: 44, z: 1998 }
  script.start()
  const heard = () => script.global('log') as string
  const at = (distance: number) => { avatar.position = { x: 114 + distance, y: 44, z: 1998 } }
  return { world, avatar, script, linkset, heard, at }
}

// https://wiki.secondlife.com/wiki/Chat
// In-world: a listener on channel 0, 39603 and -39603, the avatar flying away
// along x and chatting at each volume. Channel 0 and 39603: whisper heard at
// 8.6 m and 9.6 m, not at 11.6 m; say heard at 16.6 m and 18.4 m, not at 22.8 m
// or 23.1 m; shout heard at 94.9 m and 95.2 m, not at 105.1 m. Measured on the
// Aditi beta grid, SLua Tideland, Firestorm RLVa 2.4.2, 2026-11-23.
describe('avatar chat ranges', () => {
  it.each([
    [0, 'whisper', 8.6, 11.6],
    [0, 'say', 18.4, 22.8],
    [0, 'shout', 95.2, 105.1],
    [39603, 'whisper', 8.6, 11.6],
    [39603, 'say', 16.6, 23.1],
    [39603, 'shout', 94.9, 105.1],
  ] as const)('channel %s %s is heard at %s m and not at %s m', async (channel, volume, near, far) => {
    const { world, avatar, heard, at } = await setup()
    at(far)
    expect(world.sendAvatarChat(avatar, channel, 'far', volume).status).toBe('sent')
    at(near)
    world.sendAvatarChat(avatar, channel, 'near', volume)
    expect(heard()).toBe(`${channel} Bob Resident near|`)
  })

  // In-world: chat on -39603 at whisper, say and shout -> each heard at 4.5,
  // 8.6, 11.6 and 16.6 m, none at 23.1, 50, 95 or 105 m. The listen saw the
  // avatar's name and key. Negative channels ignore the volume and reach 20 m.
  // Aditi, SLua Tideland, Firestorm RLVa 2.4.2, 2026-11-23.
  it.each(['whisper', 'say', 'shout'] as const)('a negative channel %s reaches 20 m', async volume => {
    const { world, avatar, heard, at } = await setup()
    at(23.1)
    world.sendAvatarChat(avatar, -39603, 'far', volume)
    at(16.6)
    const action = world.sendAvatarChat(avatar, -39603, 'near', volume)
    expect(action).toMatchObject({ status: 'sent', volume, deliveredVolume: 'say' })
    expect(heard()).toBe('-39603 Bob Resident near|')
  })

  // Viewers send negative-channel chat as a dialog reply, whose text field holds
  // 254 bytes; 254 bytes arrived whole in-world (Aditi, 2026-11-23).
  it('cuts negative-channel chat to 254 bytes', async () => {
    const { world, avatar, heard } = await setup()
    const action = world.sendAvatarChat(avatar, -39603, 'x'.repeat(300))
    expect(action.deliveredMessage).toBe('x'.repeat(254))
    expect(heard()).toBe(`-39603 Bob Resident ${'x'.repeat(254)}|`)
    expect(world.sendAvatarChat(avatar, -39603, 'short')).not.toHaveProperty('reason')
  })

  // The viewer cuts raw bytes. What the simulator makes of a split character
  // can't be measured: the test viewer refuses negative-channel chat over 254
  // bytes. The cut keeps whole characters.
  it('keeps whole characters when it cuts negative-channel chat', async () => {
    const { world, avatar } = await setup()
    expect(world.sendAvatarChat(avatar, -39603, 'x'.repeat(253) + 'é').deliveredMessage).toBe('x'.repeat(253))
  })

  // A dialog reply is heard only in the avatar's region (see rlv-channels.test.ts).
  it('keeps negative-channel chat inside the avatar region', async () => {
    const { world, avatar, heard } = await setup()
    avatar.region = 'SLua Tombolo'
    avatar.position = { x: 1, y: 44, z: 1998 }
    const { scripts } = await loadLinkset({ world, region: 'SLua Tideland', owner: avatar.key,
      prims: [{ scripts: [{ name: 'edge', source: { source: listener } }] }] })
    scripts.edge!.host.params.position = { x: 250, y: 44, z: 1998 }
    scripts.edge!.start()
    world.sendAvatarChat(avatar, -39603, 'across')
    world.sendAvatarChat(avatar, 39603, 'across')
    expect(scripts.edge!.global('log')).toBe('39603 Bob Resident across|')
    expect(heard()).toBe('')
  })

  it('reaches what the avatar wears wherever its fixture sits', async () => {
    const { world, avatar, linkset, heard, at } = await setup()
    linkset.attachToAvatar(avatar.key, 6)
    at(150)
    world.sendAvatarChat(avatar, 39603, 'worn', 'whisper')
    world.sendAvatarChat(avatar, -39603, 'worn')
    expect(heard()).toBe('39603 Bob Resident worn|-39603 Bob Resident worn|')
  })

  it('reports channels outside the signed 32-bit range as unsupported', async () => {
    const { world, avatar, heard } = await setup()
    for (const channel of [-2147483649, 1.5, NaN, 2147483648]) {
      expect(world.sendAvatarChat(avatar, channel, 'bad')).toMatchObject({ status: 'unsupported', reason: 'channel' })
    }
    expect(heard()).toBe('')
  })
})

// In-world: @sendchannel=n with a 39604 exception -> chat on -39603 and 39603
// refused; @sendchannel:-39603=add and @sendchannel_except:-39603=n were not
// added (the restriction list stayed the same), and -39603 stayed refused or
// open as before. After @clear, -39603 was heard. Aditi, SLua Tideland,
// Firestorm RLVa 2.4.2, 2026-11-23.
describe('RLVa sendchannel on negative channels', () => {
  const source = `string command; integer heard;
  default {
    state_entry() { llListen(-39603, "", llGetOwner(), ""); }
    touch_start(integer n) { llOwnerSay(command); }
    listen(integer c, string n, key id, string m) { ++heard; }
  }`

  it('blocks negative channels and ignores negative exceptions', async () => {
    const { rlva } = await loadRlvPair({ source })
    rlva.script.start()
    rlva.script.setGlobal('command', '@sendchannel=n,sendchannel:-39603=add')
    rlva.script.fire('touch_start', { num_detected: 1 })
    expect(rlva.sendChat(-39603, 'blocked')).toMatchObject({ status: 'blocked', reason: 'sendchannel' })
    expect(rlva.script.global('heard')).toBe(0)
    rlva.script.setGlobal('command', '@clear')
    rlva.script.fire('touch_start', { num_detected: 1 })
    rlva.script.setGlobal('command', '@sendchannel_except:-39603=n')
    rlva.script.fire('touch_start', { num_detected: 1 })
    expect(rlva.avatar.viewer.restrictions.snapshot()).toEqual([])
    expect(rlva.sendChat(-39603, 'open').status).toBe('sent')
    expect(rlva.script.global('heard')).toBe(1)
  })

  it('leaves volume restrictions off negative channels', async () => {
    const { rlva } = await loadRlvPair({ source })
    rlva.script.start()
    rlva.script.setGlobal('command', '@chatnormal=n')
    rlva.script.fire('touch_start', { num_detected: 1 })
    expect(rlva.sendChat(-39603, 'say')).toMatchObject({ status: 'sent', deliveredVolume: 'say' })
  })
})

// Kokua compares sendchannel options with the outgoing channel as literal text,
// negative channels included (llfloaterimnearbychat.cpp, Kokua-MKRLV). Kokua
// can't be run on the test grid, so this follows its source.
describe('Kokua sendchannel on negative channels', () => {
  const source = `string command; integer heard;
  default {
    state_entry() { llListen(-39603, "", llGetOwner(), ""); llListen(-39605, "", llGetOwner(), ""); }
    touch_start(integer n) { llOwnerSay(command); }
    listen(integer c, string n, key id, string m) { ++heard; }
  }`
  const command = async (text: string) => {
    const { rlv } = await loadRlvPair({ source })
    rlv.script.start()
    rlv.script.setGlobal('command', text)
    rlv.script.fire('touch_start', { num_detected: 1 })
    return rlv
  }

  it('blocks negative channels and honours a negative exception', async () => {
    const rlv = await command('@sendchannel=n,sendchannel:-39603=add')
    expect(rlv.avatar.viewer.restrictions.snapshot().map(rule => rule.support)).toEqual(['enforced', 'enforced'])
    expect(rlv.sendChat(-39605, 'blocked').status).toBe('blocked')
    expect(rlv.sendChat(-39603, 'excepted').status).toBe('sent')
    expect(rlv.script.global('heard')).toBe(1)
  })

  it('closes only the named negative channel with sendchannel_except', async () => {
    const rlv = await command('@sendchannel_except:-39603=n')
    expect(rlv.sendChat(-39603, 'blocked').status).toBe('blocked')
    expect(rlv.sendChat(-39605, 'open').status).toBe('sent')
    expect(rlv.script.global('heard')).toBe(1)
  })
})
