import { expect, it } from 'vitest'
import { getRlvCommandCoverage, getRlvCommands, loadLinkset, loadRlvPair, receivedChatLog, World } from '../src/index.js'

// Kokua RLV 2.09.35.00: LLChatBar::sendChatFromViewer, indra/newview/llchatbar.cpp.
// Firestorm RLVa 2.4.2: RlvActions::checkChatVolume, indra/newview/rlvactions.cpp,
// and FSNearbyChat::sendChatFromViewer, indra/newview/fsnearbychathub.cpp.
const source = `string command; integer heard; string message;
 default {
  state_entry() { llListen(0,"",llGetOwner(),""); llListen(42,"",llGetOwner(),""); }
  touch_start(integer n) { llOwnerSay(command); }
  listen(integer c,string n,key id,string m) { ++heard; message=m; }
 }`
const volumes = ['whisper', 'say', 'shout'] as const
const families = ['chatwhisper', 'chatnormal', 'chatshout'] as const
function restrict(f: Awaited<ReturnType<typeof loadRlvPair>>['rlv'], command: string) {
  f.script.setGlobal('command', command)
  f.script.fire('touch_start', { num_detected: 1 })
}

// Entries are whisper, say, shout outputs. Name both profiles at their divergence.
const combinations = [
  { rules: [], rlv: ['whisper','say','shout'], rlva: ['whisper','say','shout'] },
  { rules: ['chatwhisper'], rlv: ['say','say','shout'], rlva: ['say','say','shout'] },
  { rules: ['chatnormal'], rlv: ['whisper','whisper','whisper'], rlva: ['whisper','whisper','whisper'] },
  { rules: ['chatshout'], rlv: ['whisper','say','say'], rlva: ['whisper','say','say'] },
  { rules: ['chatwhisper','chatnormal'], rlv: ['whisper','whisper','whisper'], rlva: ['say','whisper','whisper'] },
  { rules: ['chatwhisper','chatshout'], rlv: ['say','say','say'], rlva: ['say','say','say'] },
  { rules: ['chatnormal','chatshout'], rlv: ['whisper','whisper','whisper'], rlva: ['whisper','whisper','whisper'] },
  { rules: ['chatwhisper','chatnormal','chatshout'], rlv: ['whisper','whisper','whisper'], rlva: ['say','whisper','whisper'] },
]
for (const test of combinations) it(`applies public volume rules ${test.rules.join('+') || 'none'}`, async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    if (test.rules.length) restrict(f, '@' + test.rules.map(rule => rule + '=n').join(','))
    for (const [i, volume] of volumes.entries()) {
      const record = f.sendChat(0, 'hello', volume)
      expect(record).toMatchObject({ volume, deliveredVolume: test[profile][i], status: 'sent', deliveredMessage: 'hello' })
      expect(record.restrictions.map(rule => rule.behaviour)).toEqual(test.rules)
      expect(f.receivedChat.at(-1)?.type).toBe(test[profile][i])
      expect(f.sendChat(42, 'private', volume)).toMatchObject({ volume, deliveredVolume: volume, restrictions: [] })
    }
    expect(f.script.global('heard')).toBe(6)
  }
})

for (const [volume, range] of [['whisper',10],['say',20],['shout',100]] as const) {
  it(`delivers ${volume} to script and avatar listeners through ${range} m across regions`, async () => {
    const pair = await loadRlvPair({ source })
    for (const f of Object.values(pair)) {
      f.script.start()
      f.avatar.position = { x: 250, y: 0, z: 0 }
      f.world.addRegion('adjacent', { x: 256, y: 0 })
      const target = f.world.addAvatar({ username: 'listener', region: 'adjacent', position: { x: range - 6, y: 0, z: 0 } })
      const loaded = await loadLinkset({ world: f.world, region: target.region, owner: f.avatar.key, position: target.position,
        prims: [{ scripts: [{ name: 'listener', source: { source } }] }] })
      const listener = loaded.scripts.listener!; listener.start()
      expect(f.sendChat(0, 'boundary', volume).deliveredVolume).toBe(volume)
      expect(listener.global('heard')).toBe(1)
      expect(receivedChatLog(target).map(m => [m.text,m.type])).toEqual([['boundary',volume]])
      f.avatar.position.x -= 0.01
      f.sendChat(0, 'outside', volume)
      expect(listener.global('heard')).toBe(1)
      expect(receivedChatLog(target)).toHaveLength(1)
    }
  })
}

it('routes with the transformed volume while preserving sendchat and receive filters', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    restrict(f, '@chatshout=n,sendchat=n')
    const near = f.world.addAvatar({ username: 'near', region: f.avatar.region, position: { x: 20, y: 0, z: 0 }, viewer: { profile } })
    const far = f.world.addAvatar({ username: 'far', region: f.avatar.region, position: { x: 21, y: 0, z: 0 } })
    const record = f.sendChat(0, 'hello', 'shout')
    expect(record).toMatchObject({ volume: 'shout', deliveredVolume: 'say', deliveredMessage: '...', reason: 'sendchat' })
    expect(record.restrictions.map(r => r.behaviour)).toEqual(['chatshout','sendchat'])
    expect(f.script.global('message')).toBe('...')
    expect(receivedChatLog(near).at(-1)).toMatchObject({ text: '...', type: 'say' })
    expect(receivedChatLog(far)).toEqual([])
    expect(f.sendChat(2147483647, 'debug', 'shout')).toMatchObject({ status: 'blocked', reason: 'sendchat', volume: 'shout' })
    expect(f.chatActions.at(-1)).not.toHaveProperty('deliveredVolume')
    expect(Object.isFrozen(record)).toBe(true)
    expect(Object.isFrozen(record.restrictions)).toBe(true)
    restrict(f, '@chatshout=y,sendchat=y,recvchat=n')
    const speaker = f.world.addAvatar({ username: 'speaker', region: f.avatar.region, position: { x: 30, y: 0, z: 0 } })
    f.world.sendAvatarChat(speaker, 0, 'heard shout', 'shout')
    expect(f.receivedChat.at(-1)).toMatchObject({ text: '...', type: 'shout' })
  }
})

it('keeps locks issuer-scoped, supports aliases and clear, and leaves option forms unsupported', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    restrict(f, '@chatshout=add')
    const other = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
    const script = other.scripts.other!; script.start()
    script.setGlobal('command', '@chatshout=rem'); script.fire('touch_start', { num_detected: 1 })
    expect(f.sendChat(0, 'hello', 'shout').deliveredVolume).toBe('say')
    restrict(f, '@chatshout=rem')
    expect(f.sendChat(0, 'hello', 'shout').deliveredVolume).toBe('shout')
    restrict(f, '@chatnormal=n,chatwhisper=n,clear=chat')
    expect(f.sendChat(0, 'hello', 'shout').deliveredVolume).toBe('shout')
    restrict(f, '@chatshout:bad=n,chatwhisper:bad=n,chatnormal:bad=n')
    expect(f.avatar.viewer.commandLog.slice(-3).map(r => r.status)).toEqual(['unsupported','unsupported','unsupported'])
    expect(f.sendChat(0, 'hello', 'shout').deliveredVolume).toBe('shout')
    expect(f.avatar.viewer.restrictions.snapshot()).toHaveLength(profile === 'rlv' ? 3 : 0)
    for (const behaviour of families) expect(getRlvCommandCoverage(profile)).toContainEqual({ behaviour, type: 'add', support: 'enforced', option: 'none' })
  }
  expect(getRlvCommands('rlva', 'chat;add')?.split(';').filter(name => families.includes(name as typeof families[number]))).toEqual(['chatnormal','chatshout','chatwhisper'])
})

it('defaults to say and supports disabled viewers without applying restrictions', () => {
  const world = new World(); world.addRegion('off', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'off', region: 'off' })
  expect(world.sendAvatarChat(avatar, 0, 'hello')).toMatchObject({ volume: 'say', deliveredVolume: 'say' })
  expect(world.sendAvatarChat(avatar, 0, 'loud', 'shout')).toMatchObject({ deliveredVolume: 'shout', restrictions: [] })
})
