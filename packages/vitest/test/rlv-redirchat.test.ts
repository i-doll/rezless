import { expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, getRlvCommandCoverage } from '../src/index.js'

const source = `string command; list heard;
 default {
  state_entry() { llListen(0,"",llGetOwner(),""); llListen(42,"",llGetOwner(),""); llListen(43,"",llGetOwner(),""); }
  touch_start(integer n) { llOwnerSay(command); }
  listen(integer c,string n,key id,string m) { heard += [(string)c + ":" + m]; }
 }`

// Kokua RLV 2.09.35.00: RRInterface::crunchEmote; send_chat_from_viewer.
// Firestorm RLVa 2.4.2: RlvHandler::filterChat; RlvHandler::redirectChatOrEmote.
for (const [name, command, message, rlv, rlva] of [
  ['long emote extension', '@sendchat=n,emote=n', '/me waves slowly. Then bows.', ['0:/me waves slowly. Then bows.'], ['0:/me waves slowly. Then bows.']],
  ['quoted emote stays filtered', '@sendchat=n,emote=n', '/me says "hi"', ['0:...'], ['0:...']],
  ['question mark differs', '@sendchat=n,emote=n', '/me wonders?', ['0:/me wonders?'], ['0:...']],
  ['multiple targets', '@redirchat:42=n,redirchat:43=n,sendchat=n', 'hello', ['42:hello', '43:hello'], ['42:hello', '43:hello']],
  ['OOC redirection differs', '@redirchat:42=n', '((hello))', ['42:((hello))'], ['0:((hello))']],
  ['gesture redirection differs', '@redirchat:42=n', '/ao off', ['42:/ao off'], ['0:/ao off']],
  ['long gesture redirects', '@redirchat:42=n', '/longgesture', ['42:/longgesture'], ['42:/longgesture']],
  ['emote redirection bypasses RLVa sendchat', '@rediremote:42=n,sendchat=n', '/me says "hi"', ['0:...'], ['42:/me says "hi"']],
  ['Kokua prefilters before rediremote', '@rediremote:42=n,sendchat=n', '/me waves slowly and smiles.', ['42:/me waves slowly and'], ['42:/me waves slowly and smiles.']],
  ['redirchat bypasses Kokua prefilter', '@redirchat:43=n,rediremote:42=n,sendchat=n', '/me says "hi"', ['42:/me says "hi"'], ['42:/me says "hi"']],
  ['unredirected emote is checked under Kokua redirchat', '@redirchat:42=n', '/me says "hi"', ['0:...'], ['0:/me says "hi"']],
  ['unredirected long emote is not shortened', '@redirchat:42=n,sendchat=n', '/me waves slowly and smiles.', ['0:/me waves slowly and smiles.'], ['0:/me waves slowly and']],
  ['apostrophe classification differs', '@redirchat:43=n,rediremote:42=n', "/me'd wave", ["43:/me'd wave"], ["42:/me'd wave"]],
  ['private channel bypass', '@redirchat:43=n,rediremote:43=n,sendchat=n', 'private', ['42:private'], ['42:private']],
] as const) it(name, async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    f.script.setGlobal('command', command); f.script.fire('touch_start', { num_detected: 1 })
    f.sendChat(name === 'private channel bypass' ? 42 : 0, message)
    expect(f.script.global('heard')).toEqual(profile === 'rlv' ? rlv : rlva)
  }
})

for (const command of [
  '@redirchat:42=n,redirchat:43=n,sendchannel=n,sendchannel:42=add',
  '@redirchat:42=n,redirchat:43=n,sendchannel_except=n,sendchannel_except:43=n',
]) it(`checks each redirected channel: ${command}`, async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.script.start(); f.script.setGlobal('command', command); f.script.fire('touch_start', { num_detected: 1 })
    const record = f.sendChat(0, 'hello')
    expect(f.script.global('heard')).toEqual(['42:hello'])
    expect(record).toMatchObject({ status: 'sent', reason: 'redirchat', redirected: [
      { channel: 42, message: 'hello', status: 'sent' }, { channel: 43, status: 'blocked', restrictions: [expect.any(Object)] },
    ] })
    expect(Object.isFrozen(record.redirected)).toBe(true)
    expect(record.redirected?.every(Object.isFrozen)).toBe(true)
  }
})

it('suppresses public chat even when every redirect is denied, and preserves prior records', async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.script.start(); f.script.setGlobal('command', '@redirchat:42=n,sendchannel=n'); f.script.fire('touch_start', { num_detected: 1 })
    const record = f.sendChat(0, 'secret')
    expect(record).toMatchObject({ status: 'blocked', reason: 'redirchat' })
    expect(record).not.toHaveProperty('deliveredMessage')
    expect(f.script.global('heard')).toEqual([])
    const log = f.chatActions
    f.script.setGlobal('command', '@clear'); f.script.fire('touch_start', { num_detected: 1 })
    f.sendChat(0, 'free')
    expect(f.script.global('heard')).toEqual(['0:free'])
    expect(log).toEqual([record]); expect(record.restrictions).toHaveLength(2)
  }
})

it('keeps issuer redirects separate and supports removal aliases and substring clear', async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.script.start(); f.script.setGlobal('command', '@redirchat:42=add'); f.script.fire('touch_start', { num_detected: 1 })
    const other = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
    const script = other.scripts.other!; script.start()
    script.setGlobal('command', '@redirchat:42=n,redirchat:42=y'); script.fire('touch_start', { num_detected: 1 })
    f.sendChat(0, 'one'); expect(f.script.global('heard')).toEqual(['42:one'])
    script.setGlobal('command', '@redirchat:42=n'); script.fire('touch_start', { num_detected: 1 })
    f.sendChat(0, 'two'); expect(f.script.global('heard')).toEqual(['42:one', '42:two', '42:two'])
    f.script.setGlobal('command', '@redirchat:42=rem'); f.script.fire('touch_start', { num_detected: 1 })
    script.setGlobal('command', '@clear=redirchat'); script.fire('touch_start', { num_detected: 1 })
    f.sendChat(0, 'free'); expect(f.script.global('heard')).toEqual(['42:one', '42:two', '42:two', '0:free'])
  }
})

it('preserves transformed Kokua volume and uses shout for RLVa redirects', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    f.script.setGlobal('command', '@redirchat:42=n,chatnormal=n'); f.script.fire('touch_start', { num_detected: 1 })
    const far = await loadLinkset({ world: f.world, region: f.avatar.region, position: { x: f.avatar.position.x + 50, y: f.avatar.position.y, z: f.avatar.position.z },
      prims: [{ scripts: [{ name: 'far', source: { source } }] }] })
    far.scripts.far!.start()
    const record = f.sendChat(0, 'hello', 'shout')
    expect(record).toMatchObject({ volume: 'shout', deliveredVolume: profile === 'rlv' ? 'whisper' : 'shout' })
    expect(far.scripts.far!.global('heard')).toEqual(profile === 'rlv' ? [] : ['42:hello'])
    expect(f.receivedChat).toEqual([])
  }
})

for (const option of ['', '0', '-42', '2147483647', 'bad', '42tail']) it(`validates redirect option [${option}] per profile`, async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    f.script.setGlobal('command', '@redirchat' + (option ? ':' + option : '') + '=n'); f.script.fire('touch_start', { num_detected: 1 })
    f.sendChat(0, 'hello')
    expect(f.script.global('heard')).toEqual(option === '42tail' ? ['42:hello'] : profile === 'rlv' && option ? [] : ['0:hello'])
    expect(f.avatar.viewer.restrictions.snapshot().map(r => r.support)).toEqual(profile === 'rlv' ? [option ? 'enforced' : 'unsupported'] : option === '42tail' ? ['enforced'] : [])
  }
})

it('discovers the new forms and applies emote removal', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    f.script.setGlobal('command', '@sendchat=n,emote=add,emote=rem'); f.script.fire('touch_start', { num_detected: 1 })
    expect(f.sendChat(0, '/me waves slowly and smiles.').deliveredMessage).toBe('/me waves slowly and')
    for (const behaviour of ['emote', 'redirchat', 'rediremote']) expect(getRlvCommandCoverage(profile)).toContainEqual({ behaviour, type: 'add', support: 'enforced', option: behaviour === 'emote' ? 'none' : 'any' })
  }
})

for (const [command, message, denied] of [
  ['@redirchat:42=n', 'speech', true],
  ['@redirchat:42=n', '/me waves', false],
  ['@rediremote:42=n', '/me waves', true],
  ['@rediremote:42=n', 'speech', false],
] as const) it(`guards DEBUG_CHANNEL for the RLVa matching family: ${command} ${message}`, async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    f.script.setGlobal('command', command); f.script.fire('touch_start', { num_detected: 1 })
    const record = f.sendChat(2147483647, message)
    expect(record.status).toBe(profile === 'rlva' && denied ? 'blocked' : 'sent')
  }
})

it('truncates RLVa redirected payloads at complete UTF-8 boundaries', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    f.script.setGlobal('command', '@redirchat:42=n'); f.script.fire('touch_start', { num_detected: 1 })
    const message = 'a'.repeat(1022) + 'é'
    const record = f.sendChat(0, message)
    const expected = profile === 'rlva' ? 'a'.repeat(1022) : message
    expect(record.redirected?.[0]?.message).toBe(expected)
    expect(f.script.global('heard')).toEqual(['42:' + expected])
  }
})

it('leaves empty RLVa input public and validates emote options', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    f.script.setGlobal('command', '@redirchat:42=n,emote:bad=n'); f.script.fire('touch_start', { num_detected: 1 })
    f.sendChat(0, '')
    expect(f.script.global('heard')).toEqual(profile === 'rlv' ? ['42:'] : ['0:'])
    expect(f.avatar.viewer.commandLog[1]?.status).toBe('unsupported')
  }
})

it('redirects stay separate from script chat and automatic query replies', async () => {
  const pair = await loadRlvPair({ source: `list heard; default {
    state_entry() { llListen(42,"",llGetOwner(),""); llListen(0,"",NULL_KEY,"");
      llOwnerSay("@redirchat:43=n,rediremote:43=n,sendchannel=n,versionnum=42"); llSay(0,"script"); }
    listen(integer c,string n,key id,string m) { heard += [m]; }
  }` })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    expect(f.script.global('heard')).toContain(profile === 'rlv' ? '2093500' : '3040300')
    const other = await loadLinkset({ world: f.world, region: f.avatar.region, prims: [{ scripts: [{ name: 'sender',
      source: { source: 'default { state_entry() { llSay(0,"script"); } }' } }] }] })
    other.scripts.sender!.start()
    expect(f.script.global('heard')).toContain('script')
    expect(f.chatActions).toEqual([])
  }
})
