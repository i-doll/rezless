import { expect, it } from 'vitest'
import { loadLinkset, loadRlvPair } from '../src/index.js'
import { receivedIMLog } from '@rezless/vm'

// Kokua RLV 2.09.35.00: LLIMProcessing::processNewMessage,
// KokuaRLVExtras::cannotRecvIM, RRInterface::containsWithoutException.
// Firestorm RLVa 2.4.2: LLIMProcessing::processNewMessage,
// RlvActions::canReceiveIM, RlvHandler::isException, rlva_strings.xml.
const senderKey = '11111111-2222-3333-4444-555555555555'
const otherKey = '22222222-2222-3333-4444-555555555555'
const controller = `string command; default { touch_start(integer n) { llOwnerSay(command); } }`
function restrict(f: Awaited<ReturnType<typeof loadRlvPair>>['rlv'], command: string) {
  f.script.setGlobal('command', command)
  f.script.fire('touch_start', { num_detected: 1 })
}
const blocked = { rlv: '...', rlva: '*** IM blocked by your viewer' }

for (const [name, command, allowed] of [
  ['unrestricted', '', true],
  ['global lock', '@recvim=n', false],
  ['global exception', `@recvim=n,recvim:${senderKey}=add`, true],
  ['secure exception', `@recvim_sec=n,recvim_sec:${senderKey}=add`, true],
  ['removed exception', `@recvim=n,recvim:${senderKey}=add,recvim:${senderKey}=rem`, false],
  ['target denial', `@recvimfrom:${senderKey}=n`, false],
  ['other target', `@recvimfrom:${otherKey}=n`, true],
  ['target overrides exception', `@recvim=n,recvim:${senderKey}=add,recvimfrom:${senderKey}=n`, false],
  ['removed lock', '@recvim=n,recvim=y', true],
  ['removed target', `@recvimfrom:${senderKey}=add,recvimfrom:${senderKey}=rem`, true],
  ['clear', '@recvim=n,clear=', true],
] as const) it(name, async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start(); if (command) restrict(f, command)
    const sender = f.world.addAvatar({ key: senderKey, username: 'sender', region: f.avatar.region })
    f.world.sendAvatarIM(sender, f.avatar.key, 'hello')
    expect(f.receivedIM.at(-1)).toMatchObject({ text: allowed ? 'hello' : blocked[profile], type: 'im', speaker: { source: 'avatar', key: sender.key, name: sender.name, owner: sender.key } })
    expect(f.receivedChat).toEqual([])
    expect(f.avatar.viewer.restrictions.snapshot().every(r => r.support === 'enforced')).toBe(true)
  }
})

for (const [name, a, b, allowed] of [
  ['shared exception', '@recvim=n', `@recvim:${senderKey}=add`, true],
  ['secure cross issuer', '@recvim_sec=n', `@recvim:${senderKey}=add`, false],
  ['strict cross issuer', '@recvim=n,permissive=n', `@recvim:${senderKey}=add`, false],
  ['restored permissive scope', '@recvim=n,permissive=n,permissive=y', `@recvim:${senderKey}=add`, true],
  ['every secure issuer', `@recvim_sec=n,recvim:${senderKey}=add`, '@recvim_sec=n', false],
] as const) it(name, async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start(); restrict(f, a)
    const second = await loadLinkset({ world: f.world, owner: f.avatar.key, region: f.avatar.region,
      prims: [{ scripts: [{ name: 's', source: { source: controller } }] }] })
    second.scripts.s!.start(); second.scripts.s!.setGlobal('command', b)
    second.scripts.s!.fire('touch_start', { num_detected: 1 })
    const sender = f.world.addAvatar({ key: senderKey, username: 'sender', region: f.avatar.region })
    f.world.sendAvatarIM(sender, f.avatar.key, 'hello')
    expect(f.receivedIM.at(-1)?.text).toBe(allowed ? 'hello' : blocked[profile])
  }
})

it('supports targeted secure aliases only in Firestorm and rejects uncovered forms', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start(); restrict(f, `@recvimfrom_sec:${senderKey}=n`)
    expect(f.avatar.viewer.commandLog.at(-1)?.status).toBe(profile === 'rlv' ? 'unsupported' : 'applied')
    const sender = f.world.addAvatar({ key: senderKey, username: 'sender', region: f.avatar.region })
    f.world.sendAvatarIM(sender, f.avatar.key, 'hello')
    expect(f.receivedIM.at(-1)?.text).toBe(profile === 'rlv' ? 'hello' : blocked.rlva)
    restrict(f, '@recvim:invalid=n,recvimfrom=n,recvim:20=n')
    expect(f.avatar.viewer.commandLog.slice(-3).map(r => r.status)).toEqual(['unsupported', 'unsupported', 'unsupported'])
  }
})

it('records scripted object IMs across regions without applying avatar IM restrictions', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const f of Object.values(pair)) {
    f.script.start(); restrict(f, '@recvim=n')
    f.world.addRegion('remote', { x: 1024, y: 0 })
    const object = await loadLinkset({ world: f.world, region: 'remote', owner: otherKey,
      prims: [{ name: 'Messenger', key: senderKey, scripts: [{ name: 's', source: { source: `default { state_entry() {
        llInstantMessage("${f.avatar.key.toUpperCase()}", "hello");
      } }` } }] }] })
    object.scripts.s!.start()
    expect(f.receivedIM).toMatchObject([{ type: 'im', text: 'hello', speaker: { source: 'object', key: senderKey, name: 'Messenger', owner: otherKey } }])
    expect(object.scripts.s!.chat.at(-1)).toMatchObject({ type: 'im', text: 'hello' })
    expect(f.receivedChat).toEqual([])
  }
})

it('keeps immutable recipient snapshots and disabled viewers unrestricted', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const f of Object.values(pair)) {
    f.script.start()
    const sender = f.world.addAvatar({ username: 'sender', region: f.avatar.region })
    const off = f.world.addAvatar({ username: 'off', region: f.avatar.region })
    const before = f.receivedIM
    f.world.sendAvatarIM(sender, f.avatar.key, 'one')
    const snapshot = f.receivedIM
    expect(before).toEqual([])
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot[0])).toBe(true)
    expect(Object.isFrozen(snapshot[0]!.speaker)).toBe(true)
    const name = sender.name
    sender.name = 'changed'
    f.world.sendAvatarIM(sender, f.avatar.key, 'two')
    expect(snapshot).toHaveLength(1)
    expect(snapshot[0]!.speaker.name).toBe(name)
    f.world.sendAvatarIM(sender, off.key, 'disabled')
    expect(receivedIMLog(off).map(m => m.text)).toEqual(['disabled'])
    expect(receivedIMLog(sender)).toEqual([])
    f.world.sendAvatarIM(sender, otherKey, 'unknown recipient')
    expect(f.receivedIM.map(m => m.text)).toEqual(['one', 'two'])
  }
})

for (const [name, a, b, rlvDenied, rlvaDenied] of [
  ['secure targeted issuer missing sender', `@recvimfrom_sec:${senderKey}=n`, `@recvimfrom_sec:${otherKey}=n`, false, false],
  ['secure targeted issuers agree', `@recvimfrom_sec:${senderKey}=n`, `@recvimfrom_sec:${senderKey}=n`, false, true],
  ['permissive targeted issuers disagree', `@permissive=n,recvimfrom:${senderKey}=n`, `@recvimfrom:${otherKey}=n`, true, false],
  ['permissive targeted issuers agree', `@permissive=n,recvimfrom:${senderKey}=n`, `@recvimfrom:${senderKey}=n`, true, true],
] as const) it(name, async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start(); restrict(f, a)
    const second = await loadLinkset({ world: f.world, owner: f.avatar.key, region: f.avatar.region,
      prims: [{ scripts: [{ name: 's', source: { source: controller } }] }] })
    second.scripts.s!.start(); second.scripts.s!.setGlobal('command', b)
    second.scripts.s!.fire('touch_start', { num_detected: 1 })
    const sender = f.world.addAvatar({ key: senderKey, username: 'sender', region: f.avatar.region })
    f.world.sendAvatarIM(sender, f.avatar.key, 'hello')
    expect(f.receivedIM.at(-1)?.text).toBe(({ rlv: rlvDenied, rlva: rlvaDenied }[profile]) ? blocked[profile] : 'hello')
  }
})

it('uses truncated builtin text and does not invent recipients or local IM listens', async () => {
  const pair = await loadRlvPair({ source: `string recipient; string message; integer heard;
    default { state_entry() { llListen(0,"",NULL_KEY,""); }
    touch_start(integer n) { llInstantMessage(recipient,message); }
    listen(integer c,string n,key id,string m) { ++heard; } }` })
  for (const f of Object.values(pair)) {
    f.script.start()
    f.script.setGlobal('recipient', f.avatar.key)
    f.script.setGlobal('message', 'é'.repeat(600))
    f.script.fire('touch_start', { num_detected: 1 })
    expect(f.receivedIM.at(-1)?.text).toBe('é'.repeat(512))
    expect(f.script.chat.at(-1)?.text).toBe('é'.repeat(512))
    expect(f.script.global('heard')).toBe(0)
    f.script.linkset.advanceTime(2)
    f.script.setGlobal('recipient', otherKey)
    f.script.fire('touch_start', { num_detected: 1 })
    expect(f.receivedIM).toHaveLength(1)
  }
  const isolated = await loadLinkset({ prims: [{ scripts: [{ name: 's', source: { source: `default { state_entry() { llInstantMessage("${senderKey}","no world"); } }` } }] }] })
  isolated.scripts.s!.start()
  expect(isolated.scripts.s!.chat.at(-1)).toMatchObject({ text: 'no world', type: 'im' })
})
