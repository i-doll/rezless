import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadLinkset, loadRlvPair, World, rlvExpectationFor, type RlvExpectations } from '@rezless/vitest'

const source = readFileSync(new URL('./paired-viewers.lsl', import.meta.url), 'utf8')
const apiVersions: RlvExpectations<string[]> = {
  rlv: { kind: 'expected', value: ['2093500'] },
  rlva: { kind: 'expected', value: ['3040300'] },
}
const negativeChannelReplies: RlvExpectations<string[]> = {
  rlv: { kind: 'expected', value: ['/sendchannel'] },
  rlva: { kind: 'expected', value: [] },
}

// One source file drives both controllers and both viewer profiles.
describe('paired viewer example', () => {
  it('detects versions, keeps two issuers independent, enforces chat and cleans up', async () => {
    const pair = await loadRlvPair({ source })
    for (const profile of ['rlv', 'rlva'] as const) {
      const { world, avatar, script, sendChat } = pair[profile]
      const second = await loadLinkset({ world, owner: avatar.key, region: avatar.region,
        prims: [{ scripts: [{ name: 'controller', source: { source } }] }] })
      const other = second.scripts.controller!
      script.start()
      other.start()
      const version = rlvExpectationFor(apiVersions, profile)
      if (version.kind !== 'expected') throw new Error(version.reason)
      // Avatar replies reach every matching listener, including the first controller.
      expect(script.global('versions')).toEqual([...version.value, ...version.value])
      expect(other.global('versions')).toEqual(version.value)
      const issuers = [script.host.key, other.host.key]
      expect(avatar.viewer.restrictions.snapshot().map(rule => rule.sourcePrim).sort()).toEqual([...issuers].sort())
      for (const issuer of issuers) {
        expect(avatar.viewer.restrictions.snapshot(issuer).map(rule => rule.rule)).toEqual(['sendchannel'])
      }
      expect(sendChat(37, 'blocked by both').status).toBe('blocked')
      script.fire('touch_start', { num_detected: 1 })
      expect(script.global('statuses')).toEqual(['/sendchannel'])
      const negative = rlvExpectationFor(negativeChannelReplies, profile)
      if (negative.kind !== 'expected') throw new Error(negative.reason)
      expect(script.global('negativeStatuses')).toEqual(negative.value)
      expect(script.global('allStatuses')).toEqual(['/sendchannel/sendchannel', '/sendchannel'])
      expect(avatar.viewer.restrictions.snapshot().map(rule => rule.sourcePrim)).toEqual([other.host.key])
      expect(sendChat(37, 'still blocked by second').status).toBe('blocked')
      other.fire('touch_start', { num_detected: 1 })
      expect(other.global('allStatuses')).toEqual(['/sendchannel/sendchannel', '/sendchannel', '/sendchannel', ''])
      expect(avatar.viewer.restrictions.snapshot()).toEqual([])
      expect(sendChat(37, 'released').status).toBe('sent')
      const negativeQuery = avatar.viewer.commandLog.find(record => record.command === '@getstatus=-23702')
      expect(negativeQuery?.status).toBe(profile === 'rlv' ? 'replied' : 'unsupported')
      expect(avatar.viewer.commandLog.some(record => record.status === 'applied')).toBe(true)
    }
  })

  it.each(['omitted', 'disabled'] as const)('leaves the same script inert with viewer %s', async mode => {
    const world = new World()
    world.addRegion('example', { x: 0, y: 0 })
    const avatar = world.addAvatar({ username: 'example', region: 'example',
      ...(mode === 'disabled' ? { viewer: { profile: 'disabled' as const } } : {}) })
    const { scripts } = await loadLinkset({ world, owner: avatar.key, region: avatar.region,
      prims: [{ scripts: [{ name: 'controller', source: { source } }] }] })
    const script = scripts.controller!
    script.start()
    script.fire('touch_start', { num_detected: 1 })
    expect(script.global('versions')).toEqual([])
    expect(script.global('statuses')).toEqual([])
    expect(script.global('negativeStatuses')).toEqual([])
    expect(script.global('allStatuses')).toEqual([])
    expect(avatar.viewer.restrictions.snapshot()).toEqual([])
    expect(avatar.viewer.commandLog).toEqual([])
    expect(avatar.viewer.diagnostics).toEqual([])
    expect(script.chat.map(entry => entry.text)).toEqual([
      '@versionnum=23701,sendchannel=n',
      '@getstatus=23702,getstatus=-23702,getstatusall=23703,clear,getstatusall=23703',
    ])
    expect(world.sendAvatarChat(avatar, 37, 'ordinary chat').status).toBe('sent')
  })
})
