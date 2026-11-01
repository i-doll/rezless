import { expect, it } from 'vitest'
import { avatarGestureLog, getRlvCommandCoverage, getRlvCommands, loadLinkset, loadRlvPair, World } from '../src/index.js'

// Kokua RLV 2.09.35.00: LLGestureMgr::playGesture and runStep,
// indra/newview/llgesturemgr.cpp; RRInterface::contains, indra/newview/RRInterface.cpp.
// Firestorm RLVa 2.4.2: LLGestureMgr::playGesture and runStep,
// indra/newview/llgesturemgr.cpp; RlvActions::canPlayGestures,
// indra/newview/rlvactions.cpp; RlvBehaviourDictionary, indra/newview/rlvhelper.cpp.
const source = `string command; list heard;
default {
 state_entry() { llListen(0,"",llGetOwner(),""); llListen(42,"",llGetOwner(),""); }
 touch_start(integer n) { llOwnerSay(command); }
 listen(integer c,string n,key id,string m) { heard += [m]; }
}`
type Fixture = Awaited<ReturnType<typeof loadRlvPair>>['rlv']
function restrict(f: Fixture, command: string) {
  f.script.setGlobal('command', command)
  f.script.fire('touch_start', { num_detected: 1 })
}
const gesture = { id: 'wave', chat: [{ channel: 0, message: 'hello' }, { channel: 42, message: 'private' }] }

it('records allowed gestures and blocks all their chat under sendgesture in both profiles', async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.script.start()
    const first = f.playGesture(gesture)
    expect(first).toMatchObject({ action: 'gesture', gestureId: 'wave', status: 'played', restrictions: [] })
    expect(first.chat.map(c => c.deliveredMessage)).toEqual(['hello', 'private'])
    expect(f.script.global('heard')).toEqual(['hello', 'private'])
    restrict(f, '@sendgesture=n')
    const blocked = f.playGesture(gesture)
    expect(blocked).toMatchObject({ status: 'blocked', reason: 'sendgesture', chat: [], restrictions: [{ behaviour: 'sendgesture', support: 'enforced' }] })
    expect(f.chatActions).toHaveLength(2)
    expect(f.script.global('heard')).toEqual(['hello', 'private'])
    expect(f.gestureActions).toEqual([first, blocked])
    expect(avatarGestureLog(f.avatar)).toBe(f.gestureActions)
    expect(Object.isFrozen(blocked)).toBe(true)
    expect(Object.isFrozen(blocked.restrictions)).toBe(true)
    expect(Object.isFrozen(blocked.chat)).toBe(true)
    expect(Object.isFrozen(f.gestureActions)).toBe(true)
    restrict(f, '@sendgesture=y')
    expect(f.playGesture({ id: 'silent' })).toMatchObject({ status: 'played', chat: [] })
  }
})

it('keeps locks issuer scoped, supports aliases and clear, and rejects unsupported forms', async () => {
  const pair = await loadRlvPair({ source })
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start()
    const other = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{ scripts: [{ name: 'other', source: { source } }] }] })
    const script = other.scripts.other!; script.start()
    restrict(f, '@sendgesture=add,sendgesture=add')
    script.setGlobal('command', '@sendgesture=n'); script.fire('touch_start', { num_detected: 1 })
    expect(f.playGesture(gesture).restrictions).toHaveLength(2)
    restrict(f, '@sendgesture=rem')
    expect(f.playGesture(gesture).status).toBe('blocked')
    script.setGlobal('command', '@clear=sendgesture'); script.fire('touch_start', { num_detected: 1 })
    expect(f.playGesture(gesture).status).toBe('played')
    restrict(f, '@sendgesture:wave=n,sendgesture=force,sendgesture=42')
    expect(f.avatar.viewer.commandLog.slice(-3).map(r => r.status)).toEqual(['unsupported', 'unsupported', 'unsupported'])
    expect(f.playGesture(gesture).status).toBe('played')
    expect(f.avatar.viewer.restrictions.snapshot()).toHaveLength(profile === 'rlv' ? 1 : 0)
    expect(getRlvCommandCoverage(profile)).toContainEqual({ behaviour: 'sendgesture', type: 'add', support: 'enforced', option: 'none' })
  }
  expect(getRlvCommands('rlva', 'sendgesture;add')).toBe('sendgesture')
  expect(getRlvCommands('rlva', 'sendgesture;force')).toBe('')
})

it('routes gesture chat through sendchat, volume and channel restrictions', async () => {
  const pair = await loadRlvPair({ source })
  for (const f of Object.values(pair)) {
    f.script.start(); restrict(f, '@sendchat=n,chatnormal=n,sendchannel=n')
    const action = f.playGesture(gesture)
    expect(action.status).toBe('played')
    expect(action.chat[0]).toMatchObject({ status: 'sent', deliveredMessage: '...', deliveredVolume: 'whisper', reason: 'sendchat' })
    expect(action.chat[1]).toMatchObject({ status: 'blocked', reason: 'sendchannel' })
    expect(f.script.global('heard')).toEqual(['...'])
    expect(f.receivedChat.at(-1)).toMatchObject({ text: '...', type: 'whisper' })
    expect(action.chat).toEqual(f.chatActions)
  }
})

it('preserves profile-specific redirection of gesture chat', async () => {
  const pair = await loadRlvPair({ source })
  const expected = { rlv: { message: '((hello))', volume: 'say', redirected: true }, rlva: { message: '((hello))', volume: 'say', redirected: false } }
  for (const profile of ['rlv', 'rlva'] as const) {
    const f = pair[profile]; f.script.start(); restrict(f, '@redirchat:42=n')
    const record = f.playGesture({ id: 'ooc', chat: [{ channel: 0, message: '((hello))' }] }).chat[0]!
    expect(record.deliveredMessage).toBe(expected[profile].message)
    expect(record.deliveredVolume).toBe(expected[profile].volume)
    expect(!!record.redirected).toBe(expected[profile].redirected)
    expect(f.script.global('heard')).toEqual(['((hello))'])
  }
})

it('supports disabled viewers, rejects avatars outside the World, and isolates logs', () => {
  const world = new World(); world.addRegion('off', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'off', region: 'off' })
  const other = world.addAvatar({ username: 'other', region: 'off' })
  expect(world.playAvatarGesture(avatar, gesture)).toMatchObject({ status: 'played', restrictions: [] })
  expect(avatarGestureLog(other)).toEqual([])
  const foreign = new World()
  expect(foreign.playAvatarGesture(avatar, gesture)).toMatchObject({ status: 'unsupported', reason: 'avatar', chat: [] })
})
