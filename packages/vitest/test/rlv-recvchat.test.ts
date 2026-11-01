import { describe, expect, it } from 'vitest'
import { loadLinkset, loadRlvPair, receivedChatLog, getRlvCommands } from '../src/index.js'

// Kokua RLV 2.09.35.00: process_chat_from_simulator, RRInterface::crunchEmote,
// RRInterface::containsWithoutException. Firestorm RLVa 2.4.2:
// process_chat_from_simulator, RlvHandler::filterChat, RlvHandler::isException.
const controller = `string command; default {
  touch_start(integer n) { llOwnerSay(command); }
}`
const speakerKey = '11111111-2222-3333-4444-555555555555'
const otherKey = '22222222-2222-3333-4444-555555555555'

function restrict(fixture: Awaited<ReturnType<typeof loadRlvPair>>['rlv'], command: string) {
  fixture.script.setGlobal('command', command)
  fixture.script.fire('touch_start', { num_detected: 1 })
}

const cases = [
  ['empty chat', '@recvchat=n', '', '...', ''],
  ['empty emote', '@recvemote=n', '/me ', '/me ...', '/me '],
  ['embedded OOC close', '@recvchat=n', '((one)) two))', '...', '((one)) two))'],
  ['Unicode byte truncation', '@recvchat=n', '/me ' + 'é'.repeat(7) + '€', '/me ' + 'é'.repeat(7) + '�', '/me ' + 'é'.repeat(7) + '€'],
  ['period in emote', '@recvchat=n', '/me nods. Then waves', '/me nods.', '/me nods. Then waves'],
  ['apostrophe pose', '@recvchat=n', ":'s pose", ":'s pose", '...'],
  ['ordinary speech', '@recvchat=n', 'hello', '...', '...'],
  ['OOC', '@recvchat=n', '((hello))', '((hello))', '((hello))'],
  ['short gesture', '@recvchat=n', '/wave', '/wave', '/wave'],
  ['long gesture', '@recvchat=n', '/longgesture', '...', '...'],
  ['emote under chat lock', '@recvchat=n', '/me waves for a very long time', '/me waves for a very', '/me waves for a very long time'],
  ['quoted emote under chat lock', '@recvchat=n', '/me says "hello"', '...', '/me says "hello"'],
  ['colon pose', '@recvchat=n', ':waves happily', ':waves happily', '...'],
  ['embedded pose', '@recvchat=n', 'prefix /me waves', '/me waves', '...'],
  ['emote lock', '@recvemote=n', '/me waves', '/me ...', '/me ...'],
  ['emote lock leaves speech', '@recvemote=n', 'hello', 'hello', 'hello'],
  ['embedded emote lock', '@recvemote=n', 'prefix /me waves', 'prefix /me ...', 'prefix /me waves'],
  ['global exception', `@recvchat=n,recvchat:${speakerKey}=add`, 'hello', 'hello', 'hello'],
  ['emote exception', `@recvemote=n,recvemote:${speakerKey}=add`, '/me waves', '/me waves', '/me waves'],
  ['removed exception', `@recvchat=n,recvchat:${speakerKey}=add,recvchat:${speakerKey}=rem`, 'hello', '...', '...'],
  ['targeted chat', `@recvchatfrom:${speakerKey}=n`, 'hello', '...', '...'],
  ['targeted emote', `@recvemotefrom:${speakerKey}=n`, '/me waves', '/me ...', '/me ...'],
  ['targeted denial overrides global exception', `@recvchat=n,recvchat:${speakerKey}=add,recvchatfrom:${speakerKey}=n`, 'hello', '...', '...'],
  ['unrelated target', `@recvchatfrom:${otherKey}=n`, 'hello', 'hello', 'hello'],
  ['cleared restrictions', '@recvchat=n,recvemote=n,clear=', 'hello', 'hello', 'hello'],
  ['removed targeted restriction', `@recvchatfrom:${speakerKey}=n,recvchatfrom:${speakerKey}=y`, 'hello', 'hello', 'hello'],
  ['both filters', '@recvchat=n,recvemote=n', '/me waves for a very long time', '/me ...', '/me ...'],
] as const

for (const [name, command, text, rlv, rlva] of cases) it(name, async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const fixture = pair[profile]
    fixture.script.start(); restrict(fixture, command)
    const speaker = fixture.world.addAvatar({ key: speakerKey, username: 'speaker', region: fixture.avatar.region })
    fixture.world.sendAvatarChat(speaker, 0, text)
    expect(fixture.receivedChat.at(-1)).toMatchObject({ text: { rlv, rlva }[profile],
      speaker: { key: speaker.key, name: speaker.name, source: 'avatar' }, type: 'say' })
    expect(fixture.avatar.viewer.restrictions.snapshot().every(rule => rule.support === 'enforced')).toBe(true)
  }
})

for (const family of ['recvchat', 'recvemote']) describe(family + ' exceptions', () => {
  const text = family === 'recvchat' ? 'hello' : '/me waves'
  const filtered = family === 'recvchat' ? '...' : '/me ...'
  for (const [name, a, b, allowed] of [
    ['shared', `@${family}=n`, `@${family}:${speakerKey}=add`, true],
    ['secure cross issuer', `@${family}_sec=n`, `@${family}:${speakerKey}=add`, false],
    ['secure same issuer', `@${family}_sec=n,${family}:${speakerKey}=add`, '', true],
    ['secure alias exception', `@${family}_sec=n,${family}_sec:${speakerKey}=add`, '', true],
    ['strict scope', `@${family}=n,permissive=n`, `@${family}:${speakerKey}=add`, false],
    ['restored scope', `@${family}=n,permissive=n,permissive=y`, `@${family}:${speakerKey}=add`, true],
    ['every issuer', `@${family}_sec=n,${family}:${speakerKey}=add`, `@${family}_sec=n`, false],
  ] as const) it(name, async () => {
    const pair = await loadRlvPair({ source: controller })
    for (const fixture of Object.values(pair)) {
      fixture.script.start(); restrict(fixture, a)
      const second = await loadLinkset({ world: fixture.world, region: fixture.avatar.region, owner: fixture.avatar.key,
        prims: [{ scripts: [{ name: 'second', source: { source: controller } }] }] })
      second.scripts.second!.start()
      if (b) { second.scripts.second!.setGlobal('command', b); second.scripts.second!.fire('touch_start', { num_detected: 1 }) }
      const speaker = fixture.world.addAvatar({ key: speakerKey, username: 'speaker', region: fixture.avatar.region })
      fixture.world.sendAvatarChat(speaker, 0, text)
      expect(fixture.receivedChat.at(-1)?.text).toBe(allowed ? text : filtered)
    }
  })
})

it('records immutable recipient-specific snapshots and preserves send actions and script listens', async () => {
  const pair = await loadRlvPair({ source: `integer heard; default {
    state_entry() { llListen(0,"",NULL_KEY,""); llOwnerSay("@recvchat=n"); }
    listen(integer c,string n,key id,string m) { ++heard; }
  }` })
  for (const fixture of Object.values(pair)) {
    fixture.script.start()
    const before = fixture.receivedChat
    const speaker = fixture.world.addAvatar({ key: speakerKey, username: 'speaker', region: fixture.avatar.region })
    const record = fixture.world.sendAvatarChat(speaker, 0, 'hello')
    expect(record).toMatchObject({ status: 'sent', message: 'hello', deliveredMessage: 'hello' })
    expect(fixture.script.global('heard')).toBe(1)
    expect(fixture.receivedChat.at(-1)?.text).toBe('...')
    expect(receivedChatLog(speaker).at(-1)?.text).toBe('hello')
    expect(before).toEqual([])
    const snapshot = fixture.receivedChat
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot[0])).toBe(true)
    expect(Object.isFrozen(snapshot[0]!.speaker)).toBe(true)
    speaker.name = 'changed'
    fixture.world.sendAvatarChat(speaker, 42, 'private')
    expect(fixture.receivedChat).toBe(snapshot)
    expect(snapshot[0]!.speaker.name).not.toBe('changed')
    fixture.world.sendAvatarChat(speaker, 0, 'again')
    expect(snapshot).toHaveLength(1)
  }
})

it('applies self-chat exemptions per profile and keeps sendchat filtering intact', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const fixture = pair[profile]
    fixture.script.start(); restrict(fixture, '@recvchat=n')
    fixture.sendChat(0, 'self')
    expect(fixture.receivedChat.at(-1)?.text).toBe(profile === 'rlv' ? '...' : 'self')
    restrict(fixture, '@sendchat=n')
    expect(fixture.sendChat(0, 'filtered by sender')).toMatchObject({ deliveredMessage: '...', reason: 'sendchat' })
    expect(fixture.receivedChat.at(-1)?.text).toBe('...')
    const before = fixture.receivedChat
    expect(fixture.sendChat(2147483647, 'blocked').status).toBe('blocked')
    expect(fixture.receivedChat).toBe(before)
  }
})

it('routes object chat by range, region, target and owner without exposing commands', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const fixture of Object.values(pair)) {
    const { world, avatar } = fixture
    fixture.script.start()
    const far = world.addAvatar({ username: 'far', region: avatar.region, position: { x: 30, y: 0, z: 0 } })
    world.addRegion('elsewhere', { x: 1024, y: 0 })
    const away = world.addAvatar({ username: 'away', region: 'elsewhere' })
    const loaded = await loadLinkset({ world, region: avatar.region, owner: avatar.key, prims: [{ name: 'Speaker', scripts: [{ name: 's', source: { source: `default { state_entry() {
      llWhisper(0,"whisper"); llSay(0,"say"); llShout(0,"shout"); llSay(7,"private");
      llRegionSayTo("${far.key}",0,"direct"); llOwnerSay("owner"); llInstantMessage("${avatar.key}","IM");
    } }` } }] }] })
    loaded.scripts.s!.start()
    expect(fixture.receivedChat.map(m => m.text)).toEqual(['whisper', 'say', 'shout', 'owner'])
    expect(receivedChatLog(far).map(m => m.text)).toEqual(['shout', 'direct'])
    expect(receivedChatLog(away)).toEqual([])
    expect(fixture.receivedChat[0]!.speaker).toMatchObject({ source: 'object', key: loaded.linkset.prims[0]!.key, name: 'Speaker', owner: avatar.key })
  }
})

it('matches targeted object owners only in Kokua and exempts direct chat and owned attachments', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const fixture = pair[profile]
    fixture.script.start(); restrict(fixture, `@recvchatfrom:${otherKey}=n`)
    const loaded = await loadLinkset({ world: fixture.world, region: fixture.avatar.region, owner: otherKey,
      prims: [{ scripts: [{ name: 's', source: { source: `default { touch_start(integer n) { llSay(0,"hello"); llRegionSayTo("${fixture.avatar.key}",0,"direct"); } }` } }] }] })
    loaded.scripts.s!.start(); loaded.scripts.s!.fire('touch_start', { num_detected: 1 })
    expect(fixture.receivedChat.map(m => m.text)).toEqual([profile === 'rlv' ? '...' : 'hello', 'direct'])
    restrict(fixture, '@recvchat=n,recvemote=n')
    const worn = await loadLinkset({ world: fixture.world, region: fixture.avatar.region, owner: fixture.avatar.key,
      prims: [{ scripts: [{ name: 's', source: { source: `default { touch_start(integer n) { llSay(0,"worn"); llSay(0,"/me waves"); } }` } }] }] })
    worn.scripts.s!.start(); worn.linkset.attachToAvatar(fixture.avatar.key, 1)
    worn.scripts.s!.fire('touch_start', { num_detected: 1 })
    expect(fixture.receivedChat.slice(-2).map(m => m.text)).toEqual(['worn', '/me waves'])
    restrict(fixture, '@version=1234')
    expect(fixture.receivedChat.at(-1)?.text).toBe('/me waves')
  }
})

it('supports secure from aliases only in Firestorm and advertises receive command forms', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const fixture = pair[profile]
    fixture.script.start(); restrict(fixture, `@recvchatfrom_sec:${speakerKey}=n,recvemotefrom_sec:${speakerKey}=n`)
    expect(fixture.avatar.viewer.restrictions.snapshot().map(r => r.support)).toEqual(profile === 'rlv' ? ['unsupported', 'unsupported'] : ['enforced', 'enforced'])
    const speaker = fixture.world.addAvatar({ key: speakerKey, username: 'speaker', region: fixture.avatar.region })
    fixture.world.sendAvatarChat(speaker, 0, 'hello'); fixture.world.sendAvatarChat(speaker, 0, '/me waves')
    expect(fixture.receivedChat.map(m => m.text)).toEqual(profile === 'rlv' ? ['hello', '/me waves'] : ['...', '/me ...'])
  }
  expect(getRlvCommands('rlva', 'recv;add')).toBe('recvchat;recvchat_sec;recvchatfrom;recvchatfrom_sec;recvemote;recvemote_sec;recvemotefrom;recvemotefrom_sec;recvim;recvim_sec;recvimfrom;recvimfrom_sec')
})


it('filters object public and owner speech per profile while exempting direct messages', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start(); restrict(f, '@recvchat=n,recvemote=n')
    const object = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{ scripts: [{ name: 's', source: { source: `default { state_entry() {
        llSay(0,"speech"); llSay(0,"/me waves"); llOwnerSay("owner");
        llRegionSayTo("${f.avatar.key}",0,"direct");
      } }` } }] }] })
    object.scripts.s!.start()
    expect(f.receivedChat.map(m => m.text)).toEqual(['...', '/me ...', profile === 'rlv' ? '...' : 'owner', 'direct'])
    expect(object.scripts.s!.chat.map(m => m.text)).toEqual(['speech', '/me waves', 'owner', 'direct'])
  }
})

it('receives only public avatar chat within say range, across adjacent region borders', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const f of Object.values(pair)) {
    f.script.start()
    f.avatar.position = { x: 250, y: 0, z: 0 }
    f.world.addRegion('adjacent', { x: 256, y: 0 })
    const speaker = f.world.addAvatar({ username: 'near', region: 'adjacent', position: { x: 14, y: 0, z: 0 } })
    f.world.sendAvatarChat(speaker, 0, 'boundary')
    expect(f.receivedChat.map(m => m.text)).toEqual(['boundary'])
    speaker.position.x += 0.01
    f.world.sendAvatarChat(speaker, 0, 'out of range')
    expect(f.receivedChat.map(m => m.text)).toEqual(['boundary'])
    speaker.position.x -= 0.01
    f.world.sendAvatarChat(speaker, 7, 'private')
    f.world.sendAvatarChat(speaker, 2147483647, 'debug')
    expect(f.receivedChat.map(m => m.text)).toEqual(['boundary'])
  }
})

it('keeps disabled viewers unrestricted and expands displayed tabs without changing script chat', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const f of Object.values(pair)) {
    const off = f.world.addAvatar({ username: 'off', region: f.avatar.region })
    const object = await loadLinkset({ world: f.world, region: f.avatar.region, owner: off.key,
      prims: [{ scripts: [{ name: 's', source: { source: `default { state_entry() {
        llOwnerSay("@recvchat=n"); llSay(0,"a" + llChar(9) + "b");
      } }` } }] }] })
    object.scripts.s!.start()
    expect(receivedChatLog(off).map(m => m.text)).toEqual(['@recvchat=n', 'a    b'])
    expect(object.scripts.s!.chat.at(-1)?.text).toBe('a\tb')
  }
})

it('rejects invalid UUID receive forms without enabling filters', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const f of Object.values(pair)) {
    f.script.start(); restrict(f, '@recvchat:invalid=n,recvemote:invalid=n,recvchatfrom=n,recvemotefrom=n')
    expect(f.avatar.viewer.commandLog.map(m => m.status)).toEqual(['unsupported', 'unsupported', 'unsupported', 'unsupported'])
    const speaker = f.world.addAvatar({ username: 'speaker', region: f.avatar.region })
    f.world.sendAvatarChat(speaker, 0, 'hello')
    expect(f.receivedChat.at(-1)?.text).toBe('hello')
  }
})
