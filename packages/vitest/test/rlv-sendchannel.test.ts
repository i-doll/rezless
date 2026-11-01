import { expect, it } from 'vitest'
import { loadRlvPair } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Chat
it('delivers allowed avatar chat and drops sendchannel-restricted private chat', async () => {
  const pair = await loadRlvPair({ source: `integer heard; default {
    state_entry() { llListen(22101, "", llGetOwner(), ""); }
    touch_start(integer n) { llOwnerSay("@sendchannel=n"); }
    listen(integer c, string n, key id, string m) { ++heard; }
  }` })
  for (const fixture of Object.values(pair)) {
    fixture.script.start()
    fixture.sendChat(22101, 'allowed')
    fixture.script.advanceTime(1)
    expect(fixture.script.global('heard')).toBe(1)
    fixture.script.fire('touch_start', { num_detected: 1 })
    fixture.sendChat(22101, 'blocked')
    fixture.script.advanceTime(1)
    expect(fixture.script.global('heard')).toBe(1)
  }
})

const listener = `string command; integer heard; integer publicHeard; string sender; string text;
 default {
  state_entry() { llListen(22101, "", llGetOwner(), ""); llListen(0, "", llGetOwner(), ""); }
  touch_start(integer n) { llOwnerSay(command); }
  listen(integer c, string n, key id, string m) { if(c == 0) ++publicHeard; else ++heard; sender = (string)id; text = m; }
 }`

// In-world: baseline and exception removal -> private messages absent; ordinary
// cross-prim exception -> allowed; secure cross-prim exception -> blocked;
// all secure issuers need their own exception; permissive=n makes ordinary
// issuers need their own exception; permissive=y restores shared exceptions.
// Channel 0 remained available. Denied sends did not reach any listener.
// Aditi, SLua Tideland, Firestorm 7.2.5.81978 / RLVa 2.4.2, 2026-11-01.
const cases = [
  ['baseline', '@sendchannel=n', '', false],
  ['same issuer exception', '@sendchannel=n,sendchannel:22101=add', '', true],
  ['exception removed', '@sendchannel=n,sendchannel:22101=add,sendchannel:22101=rem', '', false],
  ['cross issuer exception', '@sendchannel=n', '@sendchannel:22101=add', true],
  ['secure ignores cross issuer exception', '@sendchannel_sec=n', '@sendchannel:22101=add', false],
  ['secure accepts same issuer exception', '@sendchannel_sec=n,sendchannel:22101=add', '', true],
  ['secure alias exception', '@sendchannel_sec=n,sendchannel_sec:22101=add', '', true],
  ['every secure issuer needs exception', '@sendchannel_sec=n,sendchannel:22101=add', '@sendchannel_sec=n', false],
  ['both secure issuers grant exception', '@sendchannel_sec=n,sendchannel:22101=add', '@sendchannel_sec=n,sendchannel:22101=add', true],
  ['ordinary issuer can share secure issuer exception', '@sendchannel=n', '@sendchannel_sec=n,sendchannel:22101=add', true],
  ['permissive restricts ordinary issuer scope', '@sendchannel=n,permissive=n', '@sendchannel:22101=add', false],
  ['permissive removal restores cross exception', '@sendchannel=n,permissive=n,permissive=y', '@sendchannel:22101=add', true],
  ['permissive all issuers grant', '@sendchannel=n,sendchannel:22101=add', '@sendchannel=n,sendchannel:22101=add,permissive=n', true],
  ['unrelated channel exception', '@sendchannel=n,sendchannel:22102=add', '', false],
  ['restriction removal', '@sendchannel=n,sendchannel=y', '', true],
  ['clear removes secure state', '@sendchannel_sec=n,clear=sendchannel', '', true],
] as const

for (const [name, a, b, allowed] of cases) it(name, async () => {
  const { loadLinkset } = await import('../src/index.js')
  const pair = await loadRlvPair({ source: listener })
  for (const fixture of Object.values(pair)) {
    const { script, avatar, world } = fixture
    script.start()
    const other = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
      prims: [{ scripts: [{ name: 'other', source: { source: listener } }] }] })
    const second = other.scripts.other!
    second.start()
    for (const [issuer, command] of [[script, a], [second, b]] as const) {
      if (!command) continue
      issuer.setGlobal('command', command)
      issuer.fire('touch_start', { num_detected: 1 })
    }
    const record = fixture.sendChat(22101, name)
    script.advanceTime(1)
    expect(record.status).toBe(allowed ? 'sent' : 'blocked')
    expect(script.global('heard')).toBe(allowed ? 1 : 0)
    expect(second.global('heard')).toBe(allowed ? 1 : 0)
    if (allowed) {
      expect(script.global('sender')).toBe(avatar.key)
      expect(script.global('text')).toBe(name)
    }
    fixture.sendChat(0, 'public')
    script.advanceTime(1)
    expect(script.global('publicHeard')).toBe(1)
  }
})

// In-world: sendchannel=n -> scriptSay and scriptRegion both reached the listener;
// avatar private send was blocked (Aditi, SLua Tideland, RLVa 2.4.2, 2026-11-01).
it('keeps simulator chat independent of denied viewer attempts', async () => {
  const { loadLinkset } = await import('../src/index.js')
  const pair = await loadRlvPair({ source: `integer heard; default {
    state_entry() { llListen(22101,"",NULL_KEY,""); llOwnerSay("@sendchannel=n"); }
    listen(integer c,string n,key id,string m) { ++heard; }
  }` })
  for (const fixture of Object.values(pair)) {
    fixture.script.start()
    const sender = await loadLinkset({ world: fixture.world, region: fixture.avatar.region,
      prims: [{ scripts: [{ name: 'sender', source: { source: `default { state_entry() {
        llSay(22101,"say"); llRegionSay(22101,"region");
      } }` } }] }] })
    sender.scripts.sender!.start()
    const before = [...sender.scripts.sender!.chat]
    expect(fixture.script.global('heard')).toBe(2)
    fixture.sendChat(22101, 'denied')
    fixture.script.advanceTime(1)
    expect(fixture.script.global('heard')).toBe(2)
    expect(sender.scripts.sender!.chat).toEqual(before)
  }
})

// In-world: numeric suffix, leading zero, explicit plus and decimal suffix ->
// channel 22101 allowed. Zero, negative, invalid and overflowing options were
// rejected; permissive:bad and permissive_sec were not stored.
// Aditi, SLua Tideland, Firestorm 7.2.5.81978 / RLVa 2.4.2, 2026-11-01.
for (const option of ['22101x', '022101', '+22101', '22101.5']) it(`uses profile-specific numeric exception ${option}`, async () => {
  const pair = await loadRlvPair({ source: listener })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    f.script.setGlobal('command', `@sendchannel=n,sendchannel:${option}=add`)
    f.script.fire('touch_start', { num_detected: 1 })
    expect(f.sendChat(22101, 'numeric').status).toBe(profile === 'rlva' ? 'sent' : 'blocked')
    expect(f.script.global('heard')).toBe(profile === 'rlva' ? 1 : 0)
    expect(f.avatar.viewer.restrictions.snapshot().map(r => r.rule)).toContain(`sendchannel:${option}`)
  }
})

for (const option of ['0', '-22101', 'bad', '2147483648']) it(`keeps invalid option ${option} from allowing a positive channel`, async () => {
  const pair = await loadRlvPair({ source: listener })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    f.script.setGlobal('command', `@sendchannel=n,sendchannel:${option}=add,permissive:bad=n,permissive_sec=n`)
    f.script.fire('touch_start', { num_detected: 1 })
    expect(f.sendChat(22101, 'invalid option').status).toBe('blocked')
    expect(f.script.global('heard')).toBe(0)
    const rules = f.avatar.viewer.restrictions.snapshot()
    expect(rules.map(r => r.rule)).toEqual(profile === 'rlva'
      ? ['sendchannel'] : ['sendchannel', `sendchannel:${option}`, 'permissive:bad', 'permissive_sec'])
    expect(rules.find(r => r.behaviour === 'permissive_sec')?.support).toBe(profile === 'rlv' ? 'unsupported' : undefined)
  }
})

it('records denied attempts without fabricating a listener event or script notice', async () => {
  const pair = await loadRlvPair({ source: listener })
  for (const f of Object.values(pair)) {
    f.script.start()
    expect(f.chatActions).toEqual([])
    f.script.setGlobal('command', '@sendchannel_sec=n')
    f.script.fire('touch_start', { num_detected: 1 })
    const output = [...f.script.chat]
    const record = f.sendChat(22101, 'drop me')
    expect(record).toMatchObject({ action: 'chat', channel: 22101, message: 'drop me', status: 'blocked', reason: 'sendchannel',
      restrictions: [{ sourcePrim: f.script.host.key, rule: 'sendchannel_sec' }] })
    expect(f.chatActions).toEqual([record])
    expect(Object.isFrozen(f.chatActions)).toBe(true)
    expect(Object.isFrozen(record)).toBe(true)
    expect(f.script.chat).toEqual(output)
    expect(f.script.global('heard')).toBe(0)
  }
})

// In-world: normal avatar say -> heard at 19.9 m, absent at 20.1 m.
// Aditi, SLua Tideland, Firestorm 7.2.5.81978 / RLVa 2.4.2, 2026-11-01.
it('routes normal chat within 20 m of the current avatar across region boundaries', async () => {
  const pair = await loadRlvPair({ source: listener })
  for (const f of Object.values(pair)) {
    f.script.start()
    f.script.host.params.position = { x: 19.9, y: 0, z: 0 }
    f.sendChat(22102, 'different channel')
    expect(f.script.global('heard')).toBe(0)
    f.sendChat(22101, 'near')
    expect(f.script.global('heard')).toBe(1)
    f.script.host.params.position = { x: 20.1, y: 0, z: 0 }
    f.sendChat(22101, 'far')
    expect(f.script.global('heard')).toBe(1)
    f.avatar.position = { x: 1, y: 0, z: 0 }
    f.sendChat(22101, 'moved')
    expect(f.script.global('heard')).toBe(2)
    f.world.addRegion('neighbor', { x: 256, y: 0 })
    f.avatar.region = 'neighbor'
    f.avatar.position = { x: 0, y: 0, z: 0 }
    f.script.host.params.position = { x: 255, y: 0, z: 0 }
    f.sendChat(22101, 'border')
    expect(f.script.global('heard')).toBe(3)
    f.script.linkset.remove()
    f.sendChat(22101, 'dead')
    expect(f.script.global('heard')).toBe(3)
  }
})

it('reports unsupported action channels instead of coercing or routing them', async () => {
  const pair = await loadRlvPair({ source: listener })
  for (const f of Object.values(pair)) {
    f.script.start()
    for (const channel of [-1, NaN, 1.5, 2147483648]) {
      expect(f.sendChat(channel, 'unsupported')).toMatchObject({ status: 'unsupported', reason: 'channel' })
    }
    expect(f.script.global('heard')).toBe(0)
    expect(f.script.global('publicHeard')).toBe(0)
  }
})

it('leaves disabled viewers inert while normal avatar chat still reaches listeners', async () => {
  const { World, loadLinkset } = await import('../src/index.js')
  const world = new World()
  world.addRegion('disabled', { x: 0, y: 0 })
  const avatar = world.addAvatar({ region: 'disabled', username: 'disabled' })
  const { scripts } = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
    prims: [{ scripts: [{ name: 'disabled', source: { source: listener } }] }] })
  const script = scripts.disabled!
  script.start()
  script.setGlobal('command', '@sendchannel=n,sendchannel_sec=n,permissive=n')
  script.fire('touch_start', { num_detected: 1 })
  expect(world.sendAvatarChat(avatar, 22101, 'ordinary').status).toBe('sent')
  expect(script.global('heard')).toBe(1)
  expect(avatar.viewer.restrictions.snapshot()).toEqual([])
  expect(avatar.viewer.commandLog).toEqual([])
  const foreign = new World()
  expect(foreign.sendAvatarChat(avatar, 22101, 'foreign')).toMatchObject({ status: 'unsupported', reason: 'avatar' })
  expect(script.global('heard')).toBe(1)
})

it('logs enforced command forms as applied and leaves other effects unsupported', async () => {
  const pair = await loadRlvPair({ source: listener })
  for (const f of Object.values(pair)) {
    f.script.start()
    f.script.setGlobal('command', '@sendchannel=n,sendchannel_sec=n,sendchannel:22101=add,permissive=n,sendchannel:22101=rem,sendchannel=y,permissive=y,sit=n')
    f.script.fire('touch_start', { num_detected: 1 })
    expect(f.avatar.viewer.commandLog.map(entry => entry.status)).toEqual([
      'applied', 'applied', 'applied', 'applied', 'applied', 'applied', 'applied', 'applied',
    ])
    expect(f.avatar.viewer.diagnostics).toHaveLength(0)
    expect(f.avatar.viewer.restrictions.snapshot().filter(r => r.behaviour.startsWith('sendchannel')).every(r => r.support === 'enforced')).toBe(true)
  }
})

it('discovers enforced sendchannel forms without routing them through unsupported diagnostics', async () => {
  const { getRlvCommandCoverage } = await import('../src/index.js')
  const pair = await loadRlvPair({ source: `integer replies; string channels; string permissive;
    default {
      state_entry() {
        llListen(22103,"",llGetOwner(),""); llListen(22104,"",llGetOwner(),"");
        llOwnerSay("@getcommand:sendchannel;add=22103,getcommand:permissive;add=22104");
      }
      listen(integer c,string n,key id,string m) { ++replies; if(c==22103) channels=m; else permissive=m; }
    }` })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start()
    expect(f.script.global('replies')).toBe(profile === 'rlva' ? 2 : 0)
    expect(f.script.global('channels')).toBe(profile === 'rlva' ? 'sendchannel;sendchannel_sec' : '')
    expect(f.script.global('permissive')).toBe(profile === 'rlva' ? 'permissive' : '')
    expect(getRlvCommandCoverage(profile).filter(form => ['sendchannel', 'sendchannel_sec', 'permissive'].includes(form.behaviour))).toEqual([
      { behaviour: 'permissive', type: 'add', support: 'enforced', option: 'none' },
      { behaviour: 'sendchannel', type: 'add', support: 'enforced', option: 'any' },
      { behaviour: 'sendchannel_sec', type: 'add', support: 'enforced', option: 'any' },
    ])
  }
})
