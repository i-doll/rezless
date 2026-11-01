import { describe, expect, it } from 'vitest'
import {
  World, loadLinkset, loadRlvPair, rlvExpectationFor, RLV_PROFILES, RLV_MANIFEST,
  type RlvExpectations, type ViewerProfile,
} from '../src/index.js'

const source = `
integer replies;
default {
  state_entry() { llListen(213, "", NULL_KEY, ""); llOwnerSay("@version=213"); llSay(0, "ordinary chat"); }
  listen(integer channel, string name, key id, string message) { ++replies; }
}`

// Emulator configuration contract, not a reference-viewer runtime measurement.
describe('explicit per-avatar viewer configuration', () => {
  it('defaults to disabled and preserves chat without fabricating query replies', async () => {
    const world = new World()
    world.addRegion('test', { x: 0, y: 0 })
    const avatar = world.addAvatar({ username: 'owner', region: 'test' })
    const { scripts } = await loadLinkset({ world, region: 'test', owner: avatar.key,
      prims: [{ scripts: [{ name: 'probe', source: { source } }] }] })
    const script = scripts['probe']!
    script.start()
    script.advanceTime(1000)
    expect(avatar.viewer.profile).toBe('disabled')
    expect(avatar.viewer.reference).toBeNull()
    expect(script.chat.map(entry => entry.text)).toEqual(['@version=213', 'ordinary chat'])
    expect(script.global('replies')).toBe(0)
  })

  it('isolates configuration and diagnostics between avatars and Worlds', () => {
    const world = new World()
    world.addRegion('test', { x: 0, y: 0 })
    const config: { profile: ViewerProfile } = { profile: 'rlv' }
    const first = world.addAvatar({ username: 'a', region: 'test', viewer: config })
    const second = world.addAvatar({ username: 'b', region: 'test', viewer: config })
    const otherWorld = new World()
    otherWorld.addRegion('test', { x: 0, y: 0 })
    const other = otherWorld.addAvatar({ username: 'a', region: 'test', viewer: { profile: 'rlva' } })
    config.profile = 'disabled'
    expect(first.viewer.profile).toBe('rlv')
    first.viewer.diagnostics.push({ command: '@version=213', reason: 'unsupported', detail: 'Query engine not implemented' })
    expect(second.viewer.diagnostics).toEqual([])
    expect(other.viewer.diagnostics).toEqual([])
    expect(second.viewer).not.toBe(first.viewer)
    expect(other.viewer.profile).toBe('rlva')
    expect(second.viewer.profile).toBe('rlv')
    expect(world.addAvatar({ username: 'off', region: 'test', viewer: { profile: 'disabled' } }).viewer.profile).toBe('disabled')
  })
})

describe('paired LSL fixture', () => {
  it('runs identical source in independent profiles with queued version replies', async () => {
    const pair = await loadRlvPair({ source })
    const expected: RlvExpectations<number> = { shared: { kind: 'expected', value: 1 } }
    for (const profile of ['rlv', 'rlva'] as const) {
      const fixture = pair[profile]
      fixture.script.start()
      fixture.script.advanceTime(1000)
      expect(fixture.avatar.viewer.profile).toBe(profile)
      const result = rlvExpectationFor(expected, profile)
      expect(result.kind).toBe('expected')
      if (result.kind !== 'expected') throw new Error('Expected a supported assertion')
      expect(fixture.script.global('replies')).toBe(result.value)
      expect(fixture.script.chat.map(entry => entry.text)).toEqual(['@version=213', 'ordinary chat'])
      expect(fixture.script.linkset.owner).toBe(fixture.avatar.key)
      expect(fixture.avatar.viewer.reference).toEqual(RLV_PROFILES[profile])
    }
    expect(pair.rlv.world).not.toBe(pair.rlva.world)
    expect(pair.rlv.script).not.toBe(pair.rlva.script)
  })

  it('names divergent reference versions and explicit unsupported cases', async () => {
    const pair = await loadRlvPair({ source })
    const divergence: RlvExpectations<string> = {
      rlv: { kind: 'expected', value: '2.09.35.00' },
      rlva: { kind: 'expected', value: '2.4.2' },
    }
    for (const profile of ['rlv', 'rlva'] as const) {
      const expected = rlvExpectationFor(divergence, profile)
      if (expected.kind !== 'expected') throw new Error(expected.reason)
      expect(pair[profile].avatar.viewer.reference?.implementationVersion).toBe(expected.value)
    }
    const pending: RlvExpectations<string> = {
      rlv: { kind: 'unsupported', reason: 'Per-object compatibility settings are not implemented' },
      rlva: { kind: 'unsupported', reason: 'Per-object compatibility settings are not implemented' },
    }
    expect(rlvExpectationFor(pending, 'rlv')).toEqual(pending.rlv)
    expect(rlvExpectationFor(pending, 'rlva')).toEqual(pending.rlva)
  })
})

it('identifies the reference versions and exposes unsupported command forms honestly', () => {
  expect(RLV_PROFILES.rlv).toEqual({
    implementation: 'Kokua RLV', implementationVersion: '2.09.35.00',
    apiVersion: '2.09.35.00', apiVersionNumber: 2093500, compatibilityVersion: null,
  })
  expect(RLV_PROFILES.rlva).toEqual({
    implementation: 'Firestorm RLVa', implementationVersion: '2.4.2',
    apiVersion: '3.4.3', apiVersionNumber: 3040300, compatibilityVersion: '2.9.28',
  })
  expect(RLV_MANIFEST.schemaVersion).toBe(3)
  expect(RLV_MANIFEST.wiki).toEqual({ url: 'https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI' })
  expect(RLV_MANIFEST.commands.map(entry => entry.id)).toEqual([
    'version', 'channel-policy', 'add-remove-clear', 'sendchat', 'chat-redirection', 'sendgesture', 'chat-volume', 'received-chat', 'received-im', 'sent-im', 'sendchannel_except', 'sendchannel', 'status', 'getinv', 'inventory-offers', 'getoutfit', 'getoutfitnames', 'getaddoutfitnames', 'getremoutfitnames', 'getinvworn', 'findfolder', 'getpath', 'forcewear', 'forceremove', 'getattach', 'getattachnames', 'detach', 'attachment-point-locks', 'getaddattachnames', 'getremattachnames', 'seating', 'teleport', 'camera-fov', 'camera-distance', 'camera-distance-query', 'camera-zoom-query', 'camera-origin', 'camera-silhouette', 'viewer-ui', 'viewer-render', 'discovery', 'notifications', 'blacklist', 'viewer-session',
  ])
  for (const entry of RLV_MANIFEST.commands) {
    expect(entry.forms.length).toBeGreaterThan(0)
    expect(entry.tests).toContain('packages/vitest/test/rlv-profiles.test.ts')
    for (const profile of ['rlv', 'rlva'] as const) {
      expect(entry.profiles[profile].support).toBe((['version', 'channel-policy', 'sendchat', 'chat-redirection', 'sendgesture', 'chat-volume', 'received-chat', 'received-im', 'sent-im', 'sendchannel_except', 'sendchannel', 'notifications', 'viewer-session', 'status', 'getinv', 'inventory-offers', 'getoutfit', 'getinvworn', 'findfolder', 'getpath', 'forcewear', 'forceremove', 'getattach', 'detach', 'attachment-point-locks', 'seating', 'teleport', 'camera-fov', 'camera-distance', 'viewer-ui', 'viewer-render'].includes(entry.id) || ['getoutfitnames', 'getaddoutfitnames', 'getremoutfitnames', 'getattachnames', 'getaddattachnames', 'getremattachnames', 'discovery', 'camera-origin', 'camera-distance-query'].includes(entry.id) && profile === 'rlva' || ['blacklist', 'camera-zoom-query'].includes(entry.id) && profile === 'rlv') ? 'enforced' : (entry.id === 'add-remove-clear' || entry.id === 'camera-silhouette' && profile === 'rlva') ? 'state-only' : 'unsupported')
      const evidence = entry.profiles[profile].evidence
      const reference = RLV_PROFILES[profile]
      expect(evidence).toEqual({
        implementation: `${reference.implementation} ${reference.implementationVersion}`,
        file: expect.stringMatching(/^indra\/newview\/\w+\.(cpp|h)$/),
        symbols: expect.arrayContaining([expect.any(String)]),
      })
      if (profile === 'rlv') expect(evidence.file).toBe(entry.id === 'sendgesture' ? 'indra/newview/llgesturemgr.cpp' : entry.id === 'chat-redirection' ? 'indra/newview/llfloaterimnearbychat.cpp' : entry.id === 'chat-volume' ? 'indra/newview/llchatbar.cpp' : entry.id === 'inventory-offers' ? 'indra/newview/llinventorymodel.cpp' : 'indra/newview/RRInterface.cpp')
    }
  }
})
