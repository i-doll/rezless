import { describe, expect, it } from 'vitest'
import { loadLinkset, loadRlvPair, setRlvViewerReady, resetRlvViewerSession, setRlvObjectAvailable, World } from '../src/index.js'

// Wiki: https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Architecture
// In-world: startup child -> versionnew then versionnum before ordered /tploc and empty
// status replies. Worn probe -> repeated version replies before status replies; one-time
// tplm did not survive relog, while notify sent again in on_rez returned.
// Deleted and taken issuers -> next collection, /clear without individual removals.
// Completed detachme -> immediate /clear and removal of rules and registrations.
// A never-resolved child -> rule retained at 607 seconds, /clear at about 611 seconds.
// Moving 1500 m away and crossing to adjacent SLua Tombolo retained known issuers.
// Firestorm 7.2.5.81978, RLVa 2.4.2, Aditi, SLua Tideland, 2026-11-01.
// Profiles: Kokua RLV 2.09.35.00 and Firestorm RLVa 2.4.2.
const source = `default {
  state_entry() { llOwnerSay("@sendchat=n,versionnum=722221,sendchat=y,tploc=n"); }
}`

async function load(profile: 'rlv' | 'rlva', ready = false, doNotQueueVersionRequests = true) {
  const world = new World()
  world.addRegion('session', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'session', region: 'session',
    viewer: { profile, ready, doNotQueueVersionRequests } })
  const loaded = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
    prims: [{ scripts: [{ name: 'fixture', source: { source } }] }] })
  return { world, avatar, script: loaded.scripts.fixture! }
}

describe('viewer session startup', () => {
  for (const profile of ['rlv', 'rlva'] as const) {
    it(`${profile} retains startup commands and releases restrictions in wire order`, async () => {
      const { avatar, script } = await load(profile)
      script.start()
      expect(avatar.viewer.restrictions.snapshot()).toEqual([])
      expect(avatar.viewer.commandLog.filter(record => record.status === 'replied')).toHaveLength(profile === 'rlv' ? 1 : 0)
      avatar.viewer.session.setReady(true)
      expect(avatar.viewer.restrictions.snapshot().map(rule => rule.rule)).toEqual(['tploc'])
      expect(avatar.viewer.commandLog.filter(record => record.status !== 'queued').map(record => record.command))
        .toEqual(profile === 'rlv'
          ? ['@versionnum=722221', '@sendchat=n', '@sendchat=y', '@tploc=n']
          : ['@sendchat=n', '@versionnum=722221', '@sendchat=y', '@tploc=n'])
    })
  }

  it('Kokua can queue version requests with its setting disabled', async () => {
    const { avatar, script } = await load('rlv', false, false)
    script.start()
    expect(avatar.viewer.commandLog.filter(record => record.status === 'replied')).toEqual([])
    avatar.viewer.session.setReady(true)
    expect(avatar.viewer.commandLog.filter(record => record.status === 'replied')).toHaveLength(1)
  })

  it('reset discards retained commands and restriction state', async () => {
    const { world, avatar, script } = await load('rlva')
    script.start()
    avatar.viewer.session.reset()
    avatar.viewer.session.setReady(true)
    world.clock.advance(700000)
    expect(avatar.viewer.commandLog.filter(record => record.status === 'replied')).toEqual([])
    expect(avatar.viewer.restrictions.snapshot()).toEqual([])
  })
})

  it('script reset preserves active restrictions while session reset clears them', async () => {
    const { avatar, script } = await load('rlva', true)
    script.start()
    script.reset()
    expect(avatar.viewer.restrictions.snapshot().map(rule => rule.rule)).toEqual(['tploc'])
    avatar.viewer.session.reset()
    expect(avatar.viewer.restrictions.snapshot()).toEqual([])
    expect(avatar.viewer.session.ready).toBe(false)
  })

it('RLVa retains a never-resolved issuer for twenty misses and clears it on the twenty-first', async () => {
  const { world, avatar, script } = await load('rlva', true)
  avatar.viewer.session.setObjectAvailable(script.host.key, false)
  script.start()
  world.clock.advance(600000)
  expect(avatar.viewer.restrictions.snapshot().map(rule => rule.rule)).toEqual(['tploc'])
  world.clock.advance(29999)
  expect(avatar.viewer.restrictions.snapshot()).toHaveLength(1)
  world.clock.advance(1)
  expect(avatar.viewer.restrictions.snapshot()).toEqual([])
})

it('resolving a missing issuer changes subsequent cleanup to the next collection pass', async () => {
  const { world, avatar, script } = await load('rlva', true)
  avatar.viewer.session.setObjectAvailable(script.host.key, false)
  script.start()
  world.clock.advance(30000)
  avatar.viewer.session.setObjectAvailable(script.host.key, true)
  world.clock.advance(30000)
  avatar.viewer.session.setObjectAvailable(script.host.key, false)
  world.clock.advance(29999)
  expect(avatar.viewer.restrictions.snapshot()).toHaveLength(1)
  world.clock.advance(1)
  expect(avatar.viewer.restrictions.snapshot()).toEqual([])
})

for (const profile of ['rlv', 'rlva'] as const) {
  it(`${profile} distinguishes completed detach from timed disappearance`, async () => {
    const { world, avatar, script } = await load(profile, true)
    script.linkset.attachToAvatar(avatar.key, 1)
    script.start()
    script.linkset.detachFromAvatar()
    expect(avatar.viewer.restrictions.snapshot()).toHaveLength(profile === 'rlv' ? 1 : 0)
    world.clock.advance(profile === 'rlv' ? 10000 : 30000)
    expect(avatar.viewer.restrictions.snapshot()).toEqual([])
  })
}

it('RLVa startup version flushing groups version, versionnew and versionnum before other retained work', async () => {
  const { avatar, script, world } = await load('rlva')
  const extra = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
    prims: [{ scripts: [{ name: 'versions', source: { source: `default {
      state_entry() { llOwnerSay("@versionnum=722221,versionnew=722221,version=722221,tplm=n"); }
    }` } }] }] })
  extra.scripts.versions!.start()
  avatar.viewer.session.setStartupPhase('misc')
  world.clock.advance(1999)
  expect(avatar.viewer.commandLog.filter(record => record.status === 'replied')).toEqual([])
  world.clock.advance(1)
  expect(avatar.viewer.commandLog.filter(record => record.status === 'replied').map(record => record.parsed?.behaviour))
    .toEqual(['version', 'versionnew', 'versionnum'])
  expect(avatar.viewer.restrictions.snapshot()).toEqual([])
  avatar.viewer.session.setReady(true)
  expect(avatar.viewer.restrictions.snapshot().map(rule => rule.rule)).toEqual(['tplm'])
  expect(script.dead).toBe(false)
})

it('session reset cancels old collection notifications and preserves another avatar session', async () => {
  const first = await load('rlva', true)
  const second = await load('rlva', true)
  first.script.start()
  second.script.start()
  first.script.linkset.remove()
  first.avatar.viewer.session.reset()
  first.world.clock.advance(700000)
  second.world.clock.advance(700000)
  expect(first.avatar.viewer.restrictions.snapshot()).toEqual([])
  expect(second.avatar.viewer.restrictions.snapshot().map(rule => rule.rule)).toEqual(['tploc'])
})

it('Kokua removes never-resolved issuers on its next maintenance pass', async () => {
  const { world, avatar, script } = await load('rlv', true)
  avatar.viewer.session.setObjectAvailable(script.host.key, false)
  script.start()
  world.clock.advance(9999)
  expect(avatar.viewer.restrictions.snapshot()).toHaveLength(1)
  world.clock.advance(1)
  expect(avatar.viewer.restrictions.snapshot()).toEqual([])
})

it('session reset drops queued replies without deleting unrelated simulator events', async () => {
  const { world, avatar } = await load('rlva', true)
  const extra = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
    prims: [{ scripts: [{ name: 'receiver', source: { source: `list replies; default {
      state_entry() { llListen(722221,"",NULL_KEY,""); }
      listen(integer c,string n,key id,string m) { replies += [m]; }
      touch_start(integer n) { llSay(0,"touch"); }
    }` } }] }] })
  const receiver = extra.scripts.receiver!
  receiver.start()
  receiver.running = false
  const sender = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
    prims: [{ scripts: [{ name: 'sender', source: { source: 'default { state_entry() { llOwnerSay("@versionnum=722221"); } }' } }] }] })
  sender.scripts.sender!.start()
  world.clock.schedule(receiver, world.clock.now + 1, 'touch_start', { num_detected: 1 })
  avatar.viewer.session.reset()
  receiver.running = true
  receiver.resumeParked()
  receiver.advanceTime(2)
  expect(receiver.global('replies')).toEqual([])
  expect(receiver.chat.filter(entry => entry.text === 'touch')).toHaveLength(1)
})

for (const profile of ['rlv', 'rlva'] as const) {
  it(`${profile} treats region departure independently from deletion`, async () => {
    const { world, avatar, script } = await load(profile, true)
    script.start()
    world.addRegion('away', { x: 256, y: 0 })
    avatar.region = 'away'
    expect(script.linkset.dead).toBe(false)
    world.clock.advance(profile === 'rlv' ? 10000 : 30000)
    expect(avatar.viewer.restrictions.snapshot()).toHaveLength(1)
    avatar.viewer.session.setObjectAvailable(script.host.key, false)
    world.clock.advance(profile === 'rlv' ? 10000 : 30000)
    expect(avatar.viewer.restrictions.snapshot()).toEqual([])
  })

  it(`${profile} sends profile-specific orphan cleanup notifications`, async () => {
    const { world, avatar, script } = await load(profile, true)
    const receiver = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
      prims: [{ scripts: [{ name: 'receiver', source: { source: `list notices; default {
        state_entry() { llListen(722222,"",llGetOwner(),""); llOwnerSay("@notify:722222=n"); }
        listen(integer c,string n,key id,string m) { notices += [m]; }
      }` } }] }] })
    receiver.scripts.receiver!.start()
    script.start()
    script.linkset.remove()
    receiver.linkset.advanceTime(profile === 'rlv' ? 10000 : 30000)
    expect(receiver.scripts.receiver!.global('notices')).toEqual(profile === 'rlv'
      ? ['/sendchat=n', '/sendchat=y', '/tploc=n', '/clear', '/tploc=y']
      : ['/notify:722222=n', '/sendchat=n', '/sendchat=y', '/tploc=n', '/clear'])
  })
}

// Fixture settings use milliseconds after maintenance becomes eligible. Kokua's
// default time-based schedule adds 5 s to its initial 5 s wait and 8 s to its 2 s interval.
it('Kokua settings keep initial collection and later maintenance intervals separate', async () => {
  const pair = await loadRlvPair({ source, viewer: { ready: false,
    initialGarbageCollectionAdditionalWait: 15000, garbageCollectionAdditionalInterval: 3000 } })
  const { avatar, script, world } = pair.rlv
  script.start()
  world.clock.advance(60000)
  setRlvViewerReady(avatar)
  setRlvObjectAvailable(avatar, script.host.key, false)
  world.clock.advance(19999)
  expect(avatar.viewer.restrictions.snapshot()).toHaveLength(1)
  world.clock.advance(1)
  expect(avatar.viewer.restrictions.snapshot()).toEqual([])
  const later = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
    prims: [{ scripts: [{ name: 'later', source: { source } }] }] })
  later.scripts.later!.start()
  later.linkset.remove()
  world.clock.advance(4999)
  expect(avatar.viewer.restrictions.snapshot()).toHaveLength(1)
  world.clock.advance(1)
  expect(avatar.viewer.restrictions.snapshot()).toEqual([])
})

it('paired startup helpers isolate reset and object-list membership', async () => {
  const pair = await loadRlvPair({ source, viewer: { ready: false } })
  for (const fixture of Object.values(pair)) fixture.script.start()
  setRlvViewerReady(pair.rlv.avatar)
  resetRlvViewerSession(pair.rlva.avatar)
  setRlvViewerReady(pair.rlva.avatar)
  setRlvObjectAvailable(pair.rlv.avatar, pair.rlv.script.host.key, false)
  pair.rlv.world.clock.advance(10000)
  pair.rlva.world.clock.advance(700000)
  expect(pair.rlv.avatar.viewer.restrictions.snapshot()).toEqual([])
  expect(pair.rlva.avatar.viewer.commandLog.filter(record => record.status === 'replied')).toEqual([])
  expect(pair.rlva.avatar.viewer.restrictions.snapshot()).toEqual([])
})

it('session reset does not notify and a later session can apply new rules', async () => {
  const { world, avatar, script } = await load('rlva', true)
  script.start()
  resetRlvViewerSession(avatar)
  script.reset()
  expect(avatar.viewer.restrictions.snapshot()).toEqual([])
  expect(avatar.viewer.session.pendingCommands).toBe(4)
  setRlvViewerReady(avatar)
  expect(avatar.viewer.restrictions.snapshot().map(rule => rule.rule)).toEqual(['tploc'])
  script.linkset.remove()
  world.clock.advance(30000)
  expect(avatar.viewer.restrictions.snapshot()).toEqual([])
})

it('reset preserves simulator chat queued by the same avatar', async () => {
  const pair = await loadRlvPair({ source: `list replies; default {
    state_entry() { llListen(722221,"",llGetOwner(),""); }
    listen(integer c,string n,key id,string m) { replies += [m]; }
  }` })
  const { world, avatar, script } = pair.rlva
  script.start()
  const sender = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
    prims: [{ scripts: [{ name: 'sender', source: { source: 'default { state_entry() { llOwnerSay("@versionnum=722221"); } }' } }] }] })
  script.running = false
  sender.scripts.sender!.start()
  world.sendAvatarChat(avatar, 722221, 'simulator')
  resetRlvViewerSession(avatar)
  script.running = true
  script.resumeParked()
  script.advanceTime(1)
  expect(script.global('replies')).toEqual(['simulator'])
})

it('disabled startup and reset remain inert', async () => {
  const world = new World()
  world.addRegion('off', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'off', region: 'off', viewer: { profile: 'disabled', ready: false } })
  const loaded = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
    prims: [{ scripts: [{ name: 'off', source: { source } }] }] })
  loaded.scripts.off!.start()
  setRlvViewerReady(avatar)
  resetRlvViewerSession(avatar)
  world.clock.advance(700000)
  expect(avatar.viewer.commandLog).toEqual([])
  expect(avatar.viewer.restrictions.snapshot()).toEqual([])
})

it('rejects collection settings that cannot advance virtual time', () => {
  const world = new World()
  world.addRegion('settings', { x: 0, y: 0 })
  for (const value of [-1, NaN, Infinity]) {
    expect(() => world.addAvatar({ username: 'invalid', region: 'settings', viewer: {
      profile: 'rlv', garbageCollectionAdditionalInterval: value } })).toThrow(RangeError)
  }
})

it('ending an avatar fixture cancels pending startup work', async () => {
  const { world, avatar, script } = await load('rlva')
  script.start()
  avatar.viewer.session.setStartupPhase('misc')
  world.avatars.splice(world.avatars.indexOf(avatar), 1)
  world.clock.advance(2000)
  expect(avatar.viewer.session.pendingCommands).toBe(0)
  expect(avatar.viewer.commandLog.filter(record => record.status === 'replied')).toEqual([])
})

// In-world: identical rezzed startup batches return versionnew/versionnum first,
// then /tploc and empty status in command order. Same viewer/grid/date as above.
it('delivers the retained batch through LSL listens after the early version flush', async () => {
  const pair = await loadRlvPair({ viewer: { ready: false }, source: `list replies; default {
    state_entry() {
      llListen(722221,"",llGetOwner(),"");
      llOwnerSay("@tploc=n,versionnum=722221,getstatus=722221,tploc=y,versionnew=722221,getstatus=722221");
    }
    listen(integer c,string n,key id,string m) { replies += [m]; }
  }` })
  for (const [profile, { script, avatar }] of Object.entries(pair)) {
    script.start()
    if (profile === 'rlva') {
      avatar.viewer.session.setStartupPhase('misc')
      script.advanceTime(2000)
      expect(script.global('replies')).toEqual(['RestrainedLove viewer v3.4.3 (RLVa 2.4.2)', '3040300'])
    } else {
      expect(script.global('replies')).toEqual(['2093500', 'RestrainedLove viewer v2.09.35.00 (26.4.0)'])
    }
    setRlvViewerReady(avatar)
    script.advanceTime(0)
    expect((script.global('replies') as string[]).slice(-2)).toEqual(['/tploc', ''])
  }
})

// An in-world ownership-transfer probe requires a second avatar.
it('keeps retained commands with the receiving avatar when a prim changes owners', async () => {
  const { world, avatar, script } = await load('rlva')
  script.start()
  const other = world.addAvatar({ username: 'new owner', region: avatar.region, viewer: { profile: 'rlva' } })
  script.linkset.owner = other.key
  setRlvViewerReady(avatar)
  expect(avatar.viewer.restrictions.snapshot().map(rule => rule.rule)).toEqual(['tploc'])
  expect(other.viewer.commandLog).toEqual([])
})

it('invalid retained commands remain inspectable and do not obstruct later work', async () => {
  const pair = await loadRlvPair({ viewer: { ready: false }, source: `default {
    state_entry() { llOwnerSay("@bad syntax,versionunknown=n,tploc=n"); }
  }` })
  for (const { avatar, script } of Object.values(pair)) {
    script.start()
    setRlvViewerReady(avatar)
    expect(avatar.viewer.restrictions.snapshot().map(rule => rule.rule)).toEqual(['tploc'])
    expect(avatar.viewer.commandLog.some(record => record.status === 'malformed')).toBe(true)
    expect(avatar.viewer.commandLog.filter(record => record.status !== 'queued')).toHaveLength(3)
  }
})

// In-world: add/clear at 0 s, re-add at 5 s, deletion at 6 s -> cleanup at 30 s.
// Firestorm 7.2.5.81978, RLVa 2.4.2, Aditi, SLua Tideland, 2026-11-01.
it('RLVa keeps its collector until the next tick even if the last rule clears', async () => {
  const pair = await loadRlvPair({ source: `integer cleared; default {
    state_entry() { llOwnerSay("@tploc=n"); }
    touch_start(integer n) { if(!cleared) { cleared=1; llOwnerSay("@clear"); } else { llOwnerSay("@tploc=n"); } }
  }` })
  const { avatar, script, world } = pair.rlva
  script.start()
  script.fire('touch_start', { num_detected: 1 })
  world.clock.advance(10000)
  script.fire('touch_start', { num_detected: 1 })
  script.linkset.remove()
  world.clock.advance(19999)
  expect(avatar.viewer.restrictions.snapshot()).toHaveLength(1)
  world.clock.advance(1)
  expect(avatar.viewer.restrictions.snapshot()).toEqual([])
})

it('reset cancels startup replies before a listener can drain them', async () => {
  const pair = await loadRlvPair({ viewer: { ready: false }, source: `list replies; default {
    state_entry() { llListen(722221,"",llGetOwner(),""); llOwnerSay("@versionnum=722221"); }
    listen(integer c,string n,key id,string m) { replies += [m]; }
  }` })
  const { avatar, script, world } = pair.rlva
  script.start()
  setRlvViewerReady(avatar)
  expect(world.clock.pendingEvents().filter(event => event.event === 'listen')).toHaveLength(1)
  resetRlvViewerSession(avatar)
  script.advanceTime(0)
  expect(script.global('replies')).toEqual([])
})

it('a scheduled startup tick cannot outlive the removed avatar', async () => {
  const { world, avatar, script } = await load('rlva')
  script.start()
  avatar.viewer.session.setStartupPhase('misc')
  world.avatars.splice(world.avatars.indexOf(avatar), 1)
  expect(() => script.advanceTime(2000)).not.toThrow()
  expect(avatar.viewer.session.pendingCommands).toBe(0)
})

it('detaching before the first viewer command has no session state to clear', async () => {
  const { avatar, script } = await load('rlva', true)
  script.linkset.attachToAvatar(avatar.key, 1)
  script.linkset.detachFromAvatar()
  expect(avatar.viewer.restrictions.snapshot()).toEqual([])
  expect(avatar.viewer.commandLog).toEqual([])
})

for (const ready of [true, false]) it(`inspects short malformed tokens inside batches with ready=${ready}`, async () => {
  const pair = await loadRlvPair({ viewer: { ready }, source: 'default { state_entry() { llOwnerSay("@a,xx,tploc=n"); } }' })
  for (const { avatar, script } of Object.values(pair)) {
    script.start()
    setRlvViewerReady(avatar)
    expect(avatar.viewer.commandLog.filter(record => record.status !== 'queued' && ['@a', '@xx'].includes(record.command)).map(record => [record.command, record.status]))
      .toEqual([['@a', 'malformed'], ['@xx', 'malformed']])
    expect(avatar.viewer.restrictions.snapshot().map(rule => rule.rule)).toEqual(['tploc'])
  }
})

it('reset cancels replies sent through the public reply helper before any owner command', async () => {
  const { sendViewerReply } = await import('../src/index.js')
  const { world, avatar } = await load('rlva', true)
  const receiver = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
    prims: [{ scripts: [{ name: 'receiver', source: { source: `list replies; default {
      state_entry() { llListen(722221,"",llGetOwner(),""); }
      listen(integer c,string n,key id,string m) { replies += [m]; }
    }` } }] }] })
  const script = receiver.scripts.receiver!
  script.start()
  sendViewerReply(script.linkset, avatar, 722221, 'pending')
  resetRlvViewerSession(avatar)
  script.advanceTime(0)
  expect(script.global('replies')).toEqual([])
})
