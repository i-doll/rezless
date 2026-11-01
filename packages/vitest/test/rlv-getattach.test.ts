import { describe, expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, World, getRlvAttachmentReply, setRlvAttachmentBridge, RLVA_ATTACHMENT_SETTINGS } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Attachments
// In-world: Chest x2, Left Hand and Center probes -> one occupied bit/name per
// point; after llDetachFromAvatar the exact baseline bitmap returned. Full
// bitmap has 56 characters, starts with 0 and follows attachment IDs 1..55.
// Invalid point, numeric point and "hud center" -> empty replies; root aliases
// Avatar Center. Names are capitalized. Unknown name groups include all points.
// head/torso/arms/legs select their groups; hud selects group 8 (including Jaw),
// not HUD points in group 9. A self-locked Chest remains visible by default.
// Firestorm RLVa 2.4.2, API 3.4.3 (Aditi, SLua Tideland, 2026-11-01).
const channel = 223101
const source = `list replies; list worn; default {
  state_entry() { llListen(${channel}, "", llGetOwner(), ""); }
  touch_start(integer n) {
    worn = llGetAttachedList(llGetOwner());
    llOwnerSay("@getattach=${channel},getattach:chest=${channel},getattach:left hand=${channel},getattach:center=${channel},getattachnames=${channel}");
  }
  listen(integer c,string n,key id,string m) { replies += [m]; }
}`
const bitmap = (...points: number[]) => '0' + Array.from({ length: 55 }, (_, i) => points.includes(i + 1) ? '1' : '0').join('')
async function wear(world: World, avatar: { key: string; region: string }, point: number) {
  const loaded = await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [{ name: 'attachment fixture' }] })
  loaded.linkset.attachToAvatar(avatar.key, point)
  return loaded.linkset
}

describe('paired attachment queries', () => {
  it('returns a full empty bitmap without phantom bridge occupancy', async () => {
    const pair = await loadRlvPair({ source })
    for (const profile of ['rlv', 'rlva'] as const) {
      const { script, avatar } = pair[profile]
      script.start(); script.fire('touch_start', { num_detected: 1 })
      expect(script.global('replies')).toEqual(profile === 'rlv' ? [bitmap(), '0', '0', '0'] : [bitmap(), '0', '0', '0', ''])
      expect(avatar.viewer.commandLog.at(-1)?.status).toBe(profile === 'rlv' ? 'unsupported' : 'replied')
    }
  })

  it('reads loaded attachments, deduplicates points and observes detachment and reattachment', async () => {
    const pair = await loadRlvPair({ source })
    for (const profile of ['rlv', 'rlva'] as const) {
      const { script, world, avatar } = pair[profile]
      const hud = await wear(world, avatar, 35)
      const left = await wear(world, avatar, 5)
      const chestA = await wear(world, avatar, 1)
      const chestB = await wear(world, avatar, 1)
      const other = world.addAvatar({ username: 'other', region: avatar.region })
      await wear(world, other, 2)
      // Attachment avatar, rather than object owner, decides occupancy.
      left.owner = other.key
      script.start(); script.fire('touch_start', { num_detected: 1 })
      const expected = [bitmap(1, 5, 35), '1', '1', '1', ...(profile === 'rlva' ? ['Chest,Left Hand,Center'] : [])]
      expect(script.global('replies')).toEqual(expected)
      expect(script.global('worn')).toEqual([left.prims[0]!.key, chestA.prims[0]!.key, chestB.prims[0]!.key])
      chestA.detachFromAvatar()
      script.fire('touch_start', { num_detected: 1 })
      expect(script.global('replies')).toEqual([...expected, ...expected])
      chestB.detachFromAvatar(); left.detachFromAvatar(); hud.detachFromAvatar()
      script.fire('touch_start', { num_detected: 1 })
      expect((script.global('replies') as string[]).slice(expected.length * 2)).toEqual([bitmap(), '0', '0', '0', ...(profile === 'rlva' ? [''] : [])])
      expect(script.global('worn')).toEqual([])
      chestB.attachToAvatar(avatar.key, 55)
      script.fire('touch_start', { num_detected: 1 })
      expect((script.global('replies') as string[]).slice(-expected.length)).toEqual([bitmap(55), '0', '0', '0', ...(profile === 'rlva' ? ['Right Hind Foot'] : [])])
    }
  })

  it.each(['invalid', '1', 'hud center', 'r hand', ' chest'])('sends an empty reply for invalid point %s', async point => {
    const pair = await loadRlvPair({ source: `list replies; default { state_entry() {
      llListen(${channel},"",llGetOwner(),""); llOwnerSay("@getattach:${point}=${channel}");
    } listen(integer c,string n,key id,string m) { replies += [m]; } }` })
    for (const profile of ['rlv', 'rlva'] as const) {
      const { script, avatar } = pair[profile]
      script.start(); expect(script.global('replies')).toEqual([''])
      expect(avatar.viewer.commandLog[0]).toMatchObject(profile === 'rlva'
        ? { status: 'replied', outcome: 'failed-option' } : { status: 'replied' })
      if (profile === 'rlv') expect(avatar.viewer.commandLog[0]).not.toHaveProperty('outcome')
    }
  })

  it('aliases root to Avatar Center and preserves the last point in the bitmap', async () => {
    const pair = await loadRlvPair({ source: `list replies; default { state_entry() {
      llListen(${channel},"",llGetOwner(),""); llOwnerSay("@getattach:ROOT=${channel},getattach:avatar center=${channel},getattach:right hind foot=${channel},getattach:=${channel}");
    } listen(integer c,string n,key id,string m) { replies += [m]; } }` })
    for (const { script, world, avatar } of Object.values(pair)) {
      await wear(world, avatar, 40); await wear(world, avatar, 55)
      script.start(); expect(script.global('replies')).toEqual(['1', '1', '1', bitmap(40, 55)])
    }
  })

  it('filters names by reference groups, not by HUD point numbers', async () => {
    const options = ['', 'all', 'invalid', 'chest', 'constructor', '__proto__', 'head', 'torso', 'arms', 'legs', 'hud']
    const pair = await loadRlvPair({ source: `list replies; default { state_entry() {
      llListen(${channel},"",llGetOwner(),""); llOwnerSay("@${options.map(o => `getattachnames${o ? ':' + o : ''}=${channel}`).join(',')}");
    } listen(integer c,string n,key id,string m) { replies += [m]; } }` })
    for (const profile of ['rlv', 'rlva'] as const) {
      const { script, world, avatar } = pair[profile]
      for (const point of [47, 35, 7, 5, 2, 1]) await wear(world, avatar, point)
      script.start()
      const all = 'Chest,Skull,Left Hand,Left Foot,Center,Jaw'
      expect(script.global('replies')).toEqual(profile === 'rlv' ? [] : [all, all, all, all, all, all, 'Skull', 'Chest', 'Left Hand', 'Left Foot', 'Jaw'])
      expect(avatar.viewer.commandLog.map(e => e.status)).toEqual(options.map(() => profile === 'rlv' ? 'unsupported' : 'replied'))
    }
  })

  it('keeps self-locked attachments visible with the reference hide-locked default', async () => {
    const pair = await loadRlvPair({ source: source.replace('llListen(', 'llOwnerSay("@detach=n"); llListen(') })
    for (const { script, avatar } of Object.values(pair)) {
      script.linkset.attachToAvatar(avatar.key, 1)
      script.start(); script.fire('touch_start', { num_detected: 1 })
      expect((script.global('replies') as string[]).slice(0, 2)).toEqual([bitmap(1), '1'])
    }
  })

  it('rejects invalid channels and non-query forms, and preserves valid empty replies', async () => {
    const pair = await loadRlvPair({ source: `list replies; default { state_entry() {
      llListen(${channel},"",llGetOwner(),""); llListen(-${channel},"",llGetOwner(),"");
      llOwnerSay("@getattach=-${channel},getattach=0,getattach=2147483647,getattach=n,getattachnames=force,getattach:invalid=${channel}");
    } listen(integer c,string n,key id,string m) { replies += [m]; } }` })
    for (const profile of ['rlv', 'rlva'] as const) {
      const { script, avatar } = pair[profile]
      script.start()
      expect(script.global('replies')).toEqual(profile === 'rlv' ? [bitmap(), ''] : [''])
      expect(avatar.viewer.commandLog.slice(0, 3).map(e => e.status)).toEqual(profile === 'rlv' ? ['replied', 'unsupported', 'replied'] : ['unsupported', 'unsupported', 'unsupported'])
    }
  })

  it('leaves disabled mode inert', async () => {
    const world = new World(); world.addRegion('off', { x: 0, y: 0 })
    const avatar = world.addAvatar({ username: 'off', region: 'off' })
    const loaded = await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [{ scripts: [{ name: 'off', source: { source } }] }] })
    const script = loaded.scripts.off!
    script.start(); script.fire('touch_start', { num_detected: 1 })
    expect(script.global('replies')).toEqual([])
    expect(avatar.viewer.commandLog).toEqual([])
  })
})

it('subtracts only an explicitly identified bridge at Center 2, and never creates occupancy', async () => {
  const pair = await loadRlvPair({ source })
  expect(RLVA_ATTACHMENT_SETTINGS).toEqual({ hideLockedAttachments: false })
  expect(Object.isFrozen(RLVA_ATTACHMENT_SETTINGS)).toBe(true)
  for (const profile of ['rlv', 'rlva'] as const) {
    const { script, world, avatar } = pair[profile]
    const bridge = await wear(world, avatar, 31)
    bridge.prims[0]!.name = '#Firestorm LSL Bridge v2.30'
    const query = () => getRlvAttachmentReply(script.linkset, avatar.viewer, 'getattach', 'center 2')
    expect(query()).toBe('1')
    setRlvAttachmentBridge(avatar.viewer, bridge.prims[0]!.key.toUpperCase())
    script.start(); script.fire('touch_start', { num_detected: 1 })
    expect((script.global('replies') as string[])[0]).toBe(profile === 'rlva' ? bitmap() : bitmap(31))
    expect(query()).toBe(profile === 'rlva' ? '0' : '1')
    const ordinary = await wear(world, avatar, 31)
    expect(query()).toBe('1')
    ordinary.detachFromAvatar()
    setRlvAttachmentBridge(avatar.viewer, undefined)
    expect(query()).toBe('1')
    setRlvAttachmentBridge(avatar.viewer, bridge.prims[0]!.key)
    bridge.detachFromAvatar()
    expect(query()).toBe('0')
    bridge.attachToAvatar(avatar.key, 1)
    expect(getRlvAttachmentReply(script.linkset, avatar.viewer, 'getattach', 'chest')).toBe('1')
    expect(getRlvAttachmentReply(script.linkset, avatar.viewer, 'other')).toBeUndefined()
  }
})

it('returns no helper response for disabled viewers', async () => {
  const { script, world, avatar } = (await loadRlvPair({ source })).rlva
  const disabled = world.addAvatar({ username: 'disabled', region: avatar.region })
  expect(getRlvAttachmentReply(script.linkset, disabled.viewer, 'getattach')).toBeUndefined()
})
