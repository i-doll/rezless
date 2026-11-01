import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { attemptViewerDetach, type ViewerProfile } from '@rezless/vm'
import { loadLinkset, World } from '../src/index.js'

const relaySource = fileURLToPath(new URL('./fixtures/rlv-relay.lsl', import.meta.url))
const controllerSource = fileURLToPath(new URL('./fixtures/rlv-controller.lsl', import.meta.url))
const controllerKey = '23500000-0000-0000-0000-000000000001'
const strangerKey = '23500000-0000-0000-0000-000000000002'

async function fixture(profile: ViewerProfile, authorizedController = controllerKey) {
  const world = new World()
  world.addRegion('relay', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'wearer', region: 'relay', viewer: { profile } })
  const foreign = world.addAvatar({ username: 'controller owner', region: 'relay', viewer: { profile } })
  const relay = await loadLinkset({ world, region: 'relay', owner: avatar.key, prims: [{
    description: authorizedController, scripts: [{ name: 'relay', source: relaySource }],
  }] })
  const makeController = (key: string) => loadLinkset({ world, region: 'relay', owner: foreign.key, prims: [{
    key, description: `${avatar.key},${relay.prims[0]!.key}`, scripts: [{ name: 'controller', source: controllerSource }],
  }] })
  const controller = (await makeController(controllerKey)).scripts.controller!
  const stranger = (await makeController(strangerKey)).scripts.controller!
  const script = relay.scripts.relay!
  relay.linkset.attachToAvatar(avatar.key, 1)
  script.start(); controller.start(); stranger.start()
  const send = (commands: string, sender = controller, target = avatar.key, ident = 'CaseSensitive') => {
    sender.setGlobal('commands', commands)
    sender.setGlobal('target', target)
    sender.setGlobal('ident', ident)
    sender.fire('touch_start', { num_detected: 1 })
  }
  const ack = (command: string, reply = 'ok', sender = controllerKey, ident = 'CaseSensitive') =>
    `${ident},${sender},${command},${reply}`
  return { world, avatar, foreign, script, controller, stranger, send, ack }
}

// https://wiki.secondlife.com/wiki/LSL_Protocol/Restrained_Love_Relay/Specification
// Shared: protocol 1.100 framing and relay policy are implemented by LSL, including
// authorization and acknowledgements. An ok acknowledges forwarding, not viewer support.
// Viewer interception: llviewermessage.cpp process_chat_from_simulator in both profiles.
// These fixtures cover one explicitly authorized controller, not a universal relay.
// In-world: relay/controller exchange -> !version=1100; accepted detach/query ok;
// refused restriction and optional meta-command ko; pong silent; status /detach
// forwarded by relay. Negative query acknowledged ok without a viewer reply;
// release clears relay rules and a following query forwards an empty reply.
// Firestorm RLVa 2.4.2, API 3.4.3 (Aditi, SLua Tideland, 2026-11-01).
describe.each(['rlv', 'rlva', 'disabled'] as const)('LSL relay with %s viewer', profile => {
  it('forwards accepted restrictions through relay owner chat and releases only its issuer', async () => {
    const f = await fixture(profile)
    const other = await loadLinkset({ world: f.world, region: 'relay', owner: f.avatar.key,
      prims: [{ scripts: [{ name: 'other', source: { source: 'default { state_entry() { llOwnerSay("@sit=n"); } }' } }] }] })
    other.scripts.other!.start()
    f.send('!version|@detach=n|@getstatus=235101')
    expect(f.controller.global('acks')).toEqual([
      f.ack('!version', '1100'), f.ack('@detach=n'), f.ack('@getstatus=235101'),
    ])
    expect(f.script.chat.filter(e => e.type === 'ownerSay').map(e => e.text)).toEqual(['@detach=n', '@getstatus=235101'])
    expect(f.controller.global('replies')).toEqual(profile === 'disabled' ? [] : ['/detach'])
    expect(f.controller.global('replySources')).toEqual(profile === 'disabled' ? [] : [f.script.host.key])
    expect(f.foreign.viewer.commandLog).toEqual([])
    if (profile !== 'disabled') expect(attemptViewerDetach(f.avatar, f.script.linkset)).toBe('blocked')
    if (profile !== 'disabled') {
      expect(f.avatar.viewer.restrictions.snapshot(f.script.host.key).map(r => [r.rule, r.support])).toEqual([['detach', 'enforced']])
      expect(f.avatar.viewer.commandLog.slice(-2).map(r => [r.sourcePrim, r.status])).toEqual([
        [f.script.host.key, 'applied'], [f.script.host.key, 'replied'],
      ])
    }
    f.send('!release')
    expect(f.controller.global('acks')).toContain(f.ack('!release'))
    expect(f.avatar.viewer.restrictions.snapshot().map(r => r.rule)).toEqual(profile === 'disabled' ? [] : ['sit'])
    expect(f.avatar.viewer.restrictions.snapshot(f.script.host.key)).toEqual([])
    expect(attemptViewerDetach(f.avatar, f.script.linkset)).toBe('allowed')
    if (profile === 'disabled') expect(f.avatar.viewer.commandLog).toEqual([])
  })

  it('refuses unknown senders and commands, ignores wrong avatars, and keeps accepted state on refused release', async () => {
    const f = await fixture(profile)
    f.send('@detach=n', f.stranger)
    expect(f.stranger.global('acks')).toEqual([f.ack('@detach=n', 'ko', strangerKey)])
    f.send('@detach=n', f.controller, f.foreign.key)
    expect(f.controller.global('acks')).toEqual([])
    f.send('@detach=n,extra')
    expect(f.controller.global('acks')).toEqual([])
    expect(f.script.chat.filter(e => e.type === 'ownerSay')).toEqual([])
    expect(f.avatar.viewer.restrictions.snapshot()).toEqual([])
    f.send('@detach=n|@sendchat=n|!implversion|!pong')
    expect(f.controller.global('acks')).toEqual([
      f.ack('@detach=n'), f.ack('@sendchat=n', 'ko'), f.ack('!implversion', 'ko'),
    ])
    const before = f.avatar.viewer.commandLog.length
    f.send('!release', f.stranger)
    expect(f.stranger.global('acks')).toContain(f.ack('!release', 'ko', strangerKey))
    expect(f.avatar.viewer.commandLog).toHaveLength(before)
    expect(f.avatar.viewer.restrictions.snapshot().map(r => r.rule)).toEqual(profile === 'disabled' ? [] : ['detach'])
    f.send('!release')
    expect(f.avatar.viewer.restrictions.snapshot()).toEqual([])
  })

  it('defaults to denying every sender when no controller is authorized', async () => {
    const f = await fixture(profile, '')
    f.send('@detach=n|!release')
    expect(f.controller.global('acks')).toEqual([f.ack('@detach=n', 'ko'), f.ack('!release', 'ko')])
    expect(f.script.chat.filter(e => e.type === 'ownerSay')).toEqual([])
    expect(f.avatar.viewer.commandLog).toEqual([])
  })

  it('forwards explicit removal and preserves an empty viewer query reply', async () => {
    const f = await fixture(profile)
    f.send('@detach=n|@detach=y|@getstatus=235101')
    expect(f.controller.global('acks')).toEqual([
      f.ack('@detach=n'), f.ack('@detach=y'), f.ack('@getstatus=235101'),
    ])
    expect(f.controller.global('replies')).toEqual(profile === 'disabled' ? [] : [''])
    expect(f.avatar.viewer.restrictions.snapshot()).toEqual([])
  })

  // Confirmed difference: RRInterface::answerOnChat permits negative channels;
  // RlvUtil::isValidReplyChannel rejects them in Firestorm RLVa 2.4.2.
  it('separates relay ok from profile-specific negative query delivery', async () => {
    const f = await fixture(profile)
    f.send('@detach=n|@getstatus=-235101')
    expect(f.controller.global('acks')).toEqual([f.ack('@detach=n'), f.ack('@getstatus=-235101')])
    const expected = { rlv: ['/detach'], rlva: [], disabled: [] }
    expect(f.controller.global('replies')).toEqual(expected[profile])
    if (profile !== 'disabled') expect(f.avatar.viewer.commandLog.at(-1)?.status).toBe(profile === 'rlv' ? 'replied' : 'unsupported')
  })

  it('never interprets foreign relay-channel traffic, direct chat, or owner chat as commands for the wearer', async () => {
    const f = await fixture(profile)
    f.controller.setGlobal('commands', '@detach=n')
    f.controller.fire('timer')
    expect(f.avatar.viewer.commandLog).toEqual([])
    expect(f.avatar.viewer.restrictions.snapshot()).toEqual([])
    expect(f.script.chat.filter(e => e.type === 'ownerSay')).toEqual([])
    // Owner chat belongs to the controller owner, independently of the wearer.
    expect(f.foreign.viewer.restrictions.snapshot().map(r => r.rule)).toEqual(profile === 'disabled' ? [] : ['detach'])
  })
})
