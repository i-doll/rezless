import { expect, it } from 'vitest'
import { loadRlvPair, setRlvObjectAvailable, setRlvViewerReady, resetRlvViewerSession, seedRlvInventory } from '../src/index.js'

// Profiles: Kokua RLV 2.09.35.00 and Firestorm RLVa 2.4.2.
const source = `default { state_entry() { llOwnerSay("@tploc=n"); } }`

it('Kokua collects on eligible frame 200, then every frame, ignoring time and visibility settings', async () => {
  const pair = await loadRlvPair({ source, viewer: {
    useNewGarbageCollectionTiming: false, garbageCollectionFramesPerSecond: 20,
    garbageCollectionIgnoreFirstFullyVisible: false,
    initialGarbageCollectionAdditionalWait: 999000, garbageCollectionAdditionalInterval: 999000,
  } })
  for (const fixture of Object.values(pair)) {
    const { avatar, script, world } = fixture
    script.start()
    setRlvObjectAvailable(avatar, script.host.key, false)
    world.clock.advance(9999)
    expect(avatar.viewer.restrictions.snapshot(), avatar.viewer.profile).toHaveLength(1)
    world.clock.advance(1)
    expect(avatar.viewer.restrictions.snapshot(), avatar.viewer.profile).toHaveLength(avatar.viewer.profile === 'rlv' ? 0 : 1)
    setRlvObjectAvailable(avatar, script.host.key, true)
    script.reset()
    setRlvObjectAvailable(avatar, script.host.key, false)
    world.clock.advance(49)
    expect(avatar.viewer.restrictions.snapshot()).toHaveLength(1)
    world.clock.advance(1)
    expect(avatar.viewer.restrictions.snapshot(), avatar.viewer.profile).toHaveLength(avatar.viewer.profile === 'rlv' ? 0 : 1)
    world.clock.advance(19950)
    expect(avatar.viewer.restrictions.snapshot()).toEqual([])
  }
})

it('Kokua counts frames even without issuers, but not before readiness', async () => {
  const pair = await loadRlvPair({ source, viewer: { ready: false,
    useNewGarbageCollectionTiming: false, garbageCollectionFramesPerSecond: 10 } })
  const { avatar, script, world } = pair.rlv
  world.clock.advance(100000)
  setRlvViewerReady(avatar)
  world.clock.advance(19000)
  setRlvViewerReady(avatar, false)
  world.clock.advance(50000)
  script.start()
  setRlvObjectAvailable(avatar, script.host.key, false)
  setRlvViewerReady(avatar)
  world.clock.advance(999)
  expect(avatar.viewer.restrictions.snapshot()).toHaveLength(1)
  world.clock.advance(1)
  expect(avatar.viewer.restrictions.snapshot()).toEqual([])
})

for (const [label, visibleAt, timeout, firstPass] of [
  ['visible delay', 2000, 45000, 27200],
  ['cloud timeout', undefined, 45000, 55200],
  ['timeout before visible delay', 50000, 5000, 15200],
] as const) {
  it(`Kokua time mode waits for ${label}; RLVa keeps its 30-second schedule`, async () => {
    const pair = await loadRlvPair({ source, viewer: {
      garbageCollectionFramesPerSecond: 10, garbageCollectionIgnoreFirstFullyVisible: false,
      firstFullyVisibleAt: visibleAt, garbageCollectionFirstFullyVisibleTimeout: timeout,
    } })
    for (const { avatar, script, world } of Object.values(pair)) {
      script.start()
      setRlvObjectAvailable(avatar, script.host.key, false)
      const deadline = avatar.viewer.profile === 'rlv' ? firstPass : 30000
      world.clock.advance(deadline - 1)
      expect(avatar.viewer.restrictions.snapshot()).toHaveLength(1)
      world.clock.advance(1)
      expect(avatar.viewer.restrictions.snapshot()).toEqual([])
      if (avatar.viewer.profile === 'rlv') {
        setRlvObjectAvailable(avatar, script.host.key, true)
        script.reset()
        setRlvObjectAvailable(avatar, script.host.key, false)
        world.clock.advance(9999)
        expect(avatar.viewer.restrictions.snapshot()).toHaveLength(1)
        world.clock.advance(1)
        expect(avatar.viewer.restrictions.snapshot()).toEqual([])
      }
    }
  })
}

it('visibility timeout starts at readiness, and reset restarts the frame counter', async () => {
  const pair = await loadRlvPair({ source, viewer: { ready: false,
    garbageCollectionIgnoreFirstFullyVisible: false, garbageCollectionFramesPerSecond: 10,
    garbageCollectionFirstFullyVisibleTimeout: 0, garbageCollectionFirstFullyVisibleDelay: 0,
    firstFullyVisibleAt: 0, initialGarbageCollectionAdditionalWait: 0 } })
  const { avatar, script, world } = pair.rlv
  script.start()
  world.clock.advance(60000)
  setRlvViewerReady(avatar)
  setRlvObjectAvailable(avatar, script.host.key, false)
  world.clock.advance(5199)
  expect(avatar.viewer.restrictions.snapshot()).toHaveLength(1)
  world.clock.advance(1)
  expect(avatar.viewer.restrictions.snapshot()).toEqual([])

  const frames = await loadRlvPair({ source, viewer: { useNewGarbageCollectionTiming: false,
    garbageCollectionFramesPerSecond: 10 } })
  frames.rlv.world.clock.advance(19000)
  resetRlvViewerSession(frames.rlv.avatar)
  setRlvViewerReady(frames.rlv.avatar)
  frames.rlv.script.start()
  setRlvObjectAvailable(frames.rlv.avatar, frames.rlv.script.host.key, false)
  frames.rlv.world.clock.advance(19999)
  expect(frames.rlv.avatar.viewer.restrictions.snapshot()).toHaveLength(1)
  frames.rlv.world.clock.advance(1)
  expect(frames.rlv.avatar.viewer.restrictions.snapshot()).toEqual([])
})

it('rejects invalid frame rates and visibility times', async () => {
  for (const value of [-1, NaN, Infinity]) {
    for (const key of ['firstFullyVisibleAt', 'garbageCollectionFirstFullyVisibleTimeout',
      'garbageCollectionFirstFullyVisibleDelay', 'garbageCollectionFramesPerSecond']) {
      await expect(loadRlvPair({ source, viewer: { [key]: value } })).rejects.toThrow(RangeError)
    }
  }
  await expect(loadRlvPair({ source, viewer: { garbageCollectionFramesPerSecond: 0 } })).rejects.toThrow(RangeError)
})

it('Kokua pauses the legacy frame counter while a locked attachment recovers', async () => {
  const pair = await loadRlvPair({ source: `default { state_entry() { llOwnerSay("@detach=n"); } }`,
    viewer: { useNewGarbageCollectionTiming: false, garbageCollectionFramesPerSecond: 10 } })
  const { avatar, script, world } = pair.rlv
  seedRlvInventory(avatar, { sharedRootId: null, entries: [
    { id: 'recovering', parentId: null, kind: 'item', name: 'Recovering', assetType: 'object' },
  ], wornAttachments: [{ itemId: 'recovering', rootKey: script.host.key }] })
  script.linkset.attachToAvatar(avatar.key, 5)
  script.start()
  script.advanceTime(19000)
  script.linkset.detachFromAvatar()
  script.advanceTime(15000)
  expect(script.linkset.attachment?.point).toBe(5)
  setRlvObjectAvailable(avatar, script.host.key, false)
  world.clock.advance(999)
  expect(avatar.viewer.restrictions.snapshot()).toHaveLength(1)
  world.clock.advance(1)
  expect(avatar.viewer.restrictions.snapshot()).toEqual([])
})

it('Kokua defaults legacy virtual frames to 60 per second', async () => {
  const pair = await loadRlvPair({ source, viewer: { useNewGarbageCollectionTiming: false } })
  const { avatar, script, world } = pair.rlv
  script.start()
  setRlvObjectAvailable(avatar, script.host.key, false)
  world.clock.advance(3333)
  expect(avatar.viewer.restrictions.snapshot()).toHaveLength(1)
  world.clock.advance(1)
  expect(avatar.viewer.restrictions.snapshot()).toEqual([])
})
