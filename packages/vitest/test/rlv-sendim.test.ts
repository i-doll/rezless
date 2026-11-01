import { expect, it } from 'vitest'
import { avatarIMLog, loadLinkset, loadRlvPair, receivedIMLog, World } from '../src/index.js'

// Kokua RLV 2.09.35.00: RRInterface::containsWithoutException,
// KokuaRLVExtras::cannotSendIM, LLFloaterIMSession::sendMsg, LLIMMgr::addSession.
// Firestorm RLVa 2.4.2: RlvActions::canSendIM/canStartIM,
// RlvHandler::isException, FSFloaterIM::sendMsg, rlva_strings.xml.
const recipient = '11111111-2222-3333-4444-555555555555'
const other = '22222222-2222-3333-4444-555555555555'
const controller = 'string command; default { touch_start(integer n) { llOwnerSay(command); } }'
type Fixture = Awaited<ReturnType<typeof loadRlvPair>>['rlv']
function restrict(f: Fixture, command: string) {
  f.script.setGlobal('command', command)
  f.script.fire('touch_start', { num_detected: 1 })
}
function target(f: Fixture) {
  return f.world.addAvatar({ key: recipient, username: 'recipient', region: f.avatar.region })
}
const notice = "*** IM blocked by sender's viewer"
for (const [name, command, reason] of [
  ['unrestricted', '', undefined],
  ['global send lock', '@sendim=n', 'sendim'],
  ['send UUID exception', `@sendim=n,sendim:${recipient}=add`, undefined],
  ['secure send exception', `@sendim_sec=n,sendim_sec:${recipient}=add`, undefined],
  ['removed exception', `@sendim=n,sendim:${recipient}=add,sendim:${recipient}=rem`, 'sendim'],
  ['target send lock', `@sendimto:${recipient}=n`, 'sendimto'],
  ['other send target', `@sendimto:${other}=n`, undefined],
  ['target overrides exception', `@sendim=n,sendim:${recipient}=add,sendimto:${recipient}=n`, 'sendimto'],
  ['global start lock', '@startim=n', 'startim'],
  ['start UUID exception', `@startim=n,startim:${recipient}=add`, undefined],
  ['secure start exception', `@startim_sec=n,startim_sec:${recipient}=add`, undefined],
  ['target start lock', `@startimto:${recipient}=n`, 'startimto'],
  ['other start target', `@startimto:${other}=n`, undefined],
  ['target overrides start exception', `@startim=n,startim:${recipient}=add,startimto:${recipient}=n`, 'startimto'],
  ['removed locks', `@sendim=n,startim=n,sendim=y,startim=y`, undefined],
  ['removed targeted locks', `@sendimto:${recipient}=add,startimto:${recipient}=add,sendimto:${recipient}=rem,startimto:${recipient}=rem`, undefined],
  ['cleared locks', '@sendim=n,startim=n,clear=', undefined],
] as const) it(name, async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const f of Object.values(pair)) {
    f.script.start(); if (command) restrict(f, command)
    const to = target(f)
    const result = f.sendIM(recipient.toUpperCase(), 'hello')
    expect(result).toMatchObject({ action: 'im', recipient: recipient.toUpperCase(), message: 'hello', status: reason ? 'blocked' : 'sent' })
    expect(result.reason).toBe(reason)
    expect(result.restrictions.length).toBe(reason ? 1 : 0)
    if (reason?.startsWith('start')) {
      expect(result.deliveredMessage).toBeUndefined()
      expect(receivedIMLog(to)).toEqual([])
    } else {
      expect(result.deliveredMessage).toBe(reason ? notice : 'hello')
      expect(receivedIMLog(to).at(-1)?.text).toBe(reason ? notice : 'hello')
    }
    expect(f.imActions).toEqual([result])
    expect(f.receivedChat).toEqual([])
  }
})

for (const family of ['sendim', 'startim'] as const) for (const [name, a, b, allowed] of [
  ['shared exception', `@${family}=n`, `@${family}:${recipient}=add`, true],
  ['secure missing issuer', `@${family}_sec=n`, `@${family}:${recipient}=add`, false],
  ['strict missing issuer', `@${family}=n,permissive=n`, `@${family}:${recipient}=add`, false],
  ['restored permissive scope', `@${family}=n,permissive=n,permissive=y`, `@${family}:${recipient}=add`, true],
  ['every secure issuer', `@${family}_sec=n,${family}:${recipient}=add`, `@${family}_sec=n`, false],
] as const) it(`${family}: ${name}`, async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const f of Object.values(pair)) {
    f.script.start(); restrict(f, a); target(f)
    const second = await loadLinkset({ world: f.world, owner: f.avatar.key, region: f.avatar.region,
      prims: [{ scripts: [{ name: 's', source: { source: controller } }] }] })
    second.scripts.s!.start(); second.scripts.s!.setGlobal('command', b)
    second.scripts.s!.fire('touch_start', { num_detected: 1 })
    expect(f.sendIM(recipient, 'hello').status).toBe(allowed ? 'sent' : 'blocked')
  }
})

for (const family of ['sendimto', 'startimto'] as const) it(`${family}: secure targeted aliases differ by profile`, async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start(); target(f); restrict(f, `@${family}_sec:${recipient}=n`)
    expect(f.avatar.viewer.commandLog.at(-1)?.status).toBe(profile === 'rlv' ? 'unsupported' : 'applied')
    expect(f.sendIM(recipient, 'hello').status).toBe(profile === 'rlv' ? 'sent' : 'blocked')
    restrict(f, `@${family}=n,sendim:invalid=n,startim:20=n`)
    expect(f.avatar.viewer.commandLog.slice(-3).map(r => r.status)).toEqual(['unsupported', 'unsupported', 'unsupported'])
  }
})

it('allows existing sessions under startim, including incoming sessions, while sendim still applies', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const f of Object.values(pair)) {
    f.script.start(); const to = target(f)
    expect(f.sendIM(recipient, 'open').status).toBe('sent')
    restrict(f, `@startim=n,startimto:${recipient}=n`)
    expect(f.sendIM(recipient, 'continue').status).toBe('sent')
    restrict(f, '@sendim=n')
    expect(f.sendIM(recipient, 'blocked').reason).toBe('sendim')
    const incoming = f.world.addAvatar({ key: other, username: 'incoming', region: f.avatar.region })
    f.world.sendAvatarIM(incoming, f.avatar.key, 'incoming')
    restrict(f, '@sendim=y')
    expect(f.sendIM(incoming.key, 'reply').status).toBe('sent')
    expect(receivedIMLog(to).map(m => m.text)).toEqual(['open', 'continue', notice])
  }
})

it('applies recipient recvim filters after sender filtering', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const f of Object.values(pair)) {
    f.script.start(); target(f); restrict(f, '@recvim=n')
    const sender = f.world.avatars.at(-1)!
    expect(f.world.attemptAvatarIM(sender, f.avatar.key, 'hello').status).toBe('sent')
    expect(f.receivedIM.at(-1)?.text).toBe(f.avatar.viewer.profile === 'rlv' ? '...' : '*** IM blocked by your viewer')
    expect(f.sendIM(sender.key, 'reply').status).toBe('sent')
  }
})

it('freezes action snapshots, preserves speaker identity, and validates unsupported recipients', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const f of Object.values(pair)) {
    f.script.start(); const to = target(f)
    const before = f.imActions
    const result = f.sendIM(recipient, 'one')
    const snapshot = f.imActions
    expect(before).toEqual([])
    for (const value of [result, result.restrictions, snapshot]) expect(Object.isFrozen(value)).toBe(true)
    const name = f.avatar.name
    f.avatar.name = 'changed'
    expect(receivedIMLog(to)[0]?.speaker.name).toBe(name)
    f.sendIM(recipient, 'two')
    expect(snapshot).toHaveLength(1)
    for (const key of ['invalid', other, '00000000-0000-0000-0000-000000000000', f.avatar.key]) {
      expect(f.sendIM(key, 'no').status).toBe('unsupported')
    }
    const foreignWorld = new World()
    foreignWorld.addRegion(f.avatar.region, { x: 0, y: 0 })
    const foreign = foreignWorld.addAvatar({ username: 'foreign', region: f.avatar.region })
    expect(f.world.attemptAvatarIM(foreign, recipient, 'no').reason).toBe('avatar')
    expect(avatarIMLog(foreign)).toHaveLength(1)
    expect(receivedIMLog(to).map(m => m.text)).toEqual(['one', 'two'])
  }
})

for (const family of ['sendimto', 'startimto'] as const) for (const [name, secure, agree, kokuaBlocked, firestormBlocked] of [
  ['secure issuers disagree', true, false, false, false],
  ['secure issuers agree', true, true, false, true],
  ['permissive issuers disagree', false, false, true, false],
  ['permissive issuers agree', false, true, true, true],
] as const) it(`${family}: ${name}`, async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]
    f.script.start(); target(f)
    const behaviour = family + (secure ? '_sec' : '')
    restrict(f, `@${secure ? '' : 'permissive=n,'}${behaviour}:${recipient}=n`)
    const second = await loadLinkset({ world: f.world, owner: f.avatar.key, region: f.avatar.region,
      prims: [{ scripts: [{ name: 's', source: { source: controller } }] }] })
    second.scripts.s!.start(); second.scripts.s!.setGlobal('command', `@${behaviour}:${agree ? recipient : other}=n`)
    second.scripts.s!.fire('touch_start', { num_detected: 1 })
    const denied = profile === 'rlv' ? kokuaBlocked : firestormBlocked
    expect(f.sendIM(recipient, 'hello').status).toBe(denied ? 'blocked' : 'sent')
  }
})

it('blocks start before send and lets a later attempt open after the start lock is removed', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const f of Object.values(pair)) {
    f.script.start(); const to = target(f)
    restrict(f, '@startim=n,sendim=n')
    expect(f.sendIM(recipient, 'first').reason).toBe('startim')
    expect(receivedIMLog(to)).toEqual([])
    restrict(f, '@startim=y')
    expect(f.sendIM(recipient, 'second')).toMatchObject({ reason: 'sendim', deliveredMessage: notice })
    restrict(f, '@startim=n,sendim=y')
    expect(f.sendIM(recipient, 'third').status).toBe('sent')
    expect(receivedIMLog(to).map(m => m.text)).toEqual([notice, 'third'])
  }
})

it('delivers across regions, handles empty messages, and isolates conversations between avatars', async () => {
  const pair = await loadRlvPair({ source: controller })
  for (const f of Object.values(pair)) {
    f.script.start()
    f.world.addRegion('remote', { x: 2048, y: 0 })
    const to = f.world.addAvatar({ key: recipient, username: 'remote', region: 'remote' })
    expect(avatarIMLog(to)).toEqual([])
    expect(to.viewer.restrictions.support('sendim', '')).toBe('unsupported')
    expect(f.sendIM(recipient, '').deliveredMessage).toBe('')
    expect(receivedIMLog(to).at(-1)?.text).toBe('')
    restrict(f, '@startim=n')
    const different = f.world.addAvatar({ key: other, username: 'different', region: 'remote' })
    expect(f.sendIM(different.key, 'new').reason).toBe('startim')
    expect(f.sendIM(to.key, 'existing').status).toBe('sent')
    expect(f.world.attemptAvatarIM(to, f.avatar.key, 'disabled viewer').status).toBe('sent')
    expect(f.receivedIM.at(-1)?.text).toBe('disabled viewer')
  }
})
