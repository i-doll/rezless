import { describe, expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, World, attemptViewerDetach } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Attachments
// https://wiki.secondlife.com/wiki/LlDetachFromAvatar
// In-world: root and child detach=n block viewer attempts; detach=y lifts the
// root lock. Root detachme respects root and child locks, then detaches unlocked.
// RLVa child detachme is inert even unlocked; nonempty options are rejected.
// A permitted root simulator detach emits attach(NULL_KEY) with point 0 while
// locked, followed by viewer reattachment. Child simulator detach stays attached.
// Firestorm RLVa 2.4.2, viewer 7.2.5.81978, API 3.4.3
// (Aditi, SLua Tideland, 2026-11-01). Forced reattachment recovery is excluded.
const source = `list events; integer before; integer after; default {
 state_entry() {}
 touch_start(integer n) { before = llGetAttached(); llOwnerSay("@detachme=force"); after = llGetAttached(); }
 attach(key id) { events += [(string)id, llGetAttached()]; }
}`

describe('paired viewer self-detach', () => {
 it('detaches the issuing attachment asynchronously and emits attach(NULL_KEY)', async () => {
  const pair = await loadRlvPair({ source })
  for (const { script, avatar } of Object.values(pair)) {
   script.start(); script.linkset.attachToAvatar(avatar.key, 1); script.advanceTime(0)
   script.fire('touch_start', { num_detected: 1 })
   expect(script.linkset.attachment).toBeNull()
   expect(script.global('before')).toBe(1)
   expect(script.global('after')).toBe(1)
   expect(script.global('events')).toEqual([avatar.key, 1, '00000000-0000-0000-0000-000000000000', 0])
  }
 })
})

for (const lock of ['@detach=n', '@detach=add']) it(`honors self locks for ${lock}`, async () => {
 const pair = await loadRlvPair({ source: source.replace('state_entry() {}', `state_entry() { llOwnerSay("${lock}"); }`) })
 for (const { script, avatar } of Object.values(pair)) {
  script.linkset.attachToAvatar(avatar.key, 1); script.start()
  script.fire('touch_start', { num_detected: 1 })
  expect(script.linkset.attachment?.point).toBe(1)
  expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'enforced', outcome: 'blocked' })
 }
})

it('ignores a detachme option in Kokua and rejects it in RLVa', async () => {
 const pair = await loadRlvPair({ source: source.replace('@detachme=force', '@detachme:bad=force') })
 for (const profile of ['rlv', 'rlva'] as const) {
  const { script, avatar } = pair[profile]
  script.start(); script.linkset.attachToAvatar(avatar.key, 1)
  script.fire('touch_start', { num_detected: 1 })
  expect(script.linkset.attachment?.point ?? 0).toBe(profile === 'rlv' ? 0 : 1)
  expect(avatar.viewer.commandLog.at(-1)).toMatchObject({ status: 'enforced', outcome: profile === 'rlv' ? 'allowed' : 'failed-option' })
 }
})

it('resolves Kokua child self-detach but leaves RLVa child self-detach inert', async () => {
 const pair = await loadRlvPair({ source: 'default { state_entry() {} }' })
 for (const profile of ['rlv', 'rlva'] as const) {
  const { world, avatar } = pair[profile]
  const loaded = await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [
   { scripts: [{ name: 'root', source: { source } }] },
   { scripts: [{ name: 'child', source: { source } }] },
  ] })
  loaded.scripts.root!.start(); loaded.scripts.child!.start()
  loaded.linkset.attachToAvatar(avatar.key, 5); loaded.linkset.advanceTime(0)
  loaded.scripts.child!.fire('touch_start', { num_detected: 1 })
  expect(loaded.linkset.attachment?.point ?? 0).toBe(profile === 'rlv' ? 0 : 5)
  expect(loaded.scripts.child!.global('after')).toBe(5)
  for (const script of Object.values(loaded.scripts)) expect(script.global('events')).toEqual(profile === 'rlv'
   ? [avatar.key, 5, '00000000-0000-0000-0000-000000000000', 0] : [avatar.key, 5])
 }
})

const commands = `list events; integer after; default {
 state_entry() {}
 touch_start(integer n) { llOwnerSay(llGetObjectDesc()); after = llGetAttached(); }
 attach(key id) { events += [(string)id, llGetAttached()]; }
}`

it('retains another prim lock until its own issuer removes it', async () => {
 const pair = await loadRlvPair({ source: 'default { state_entry() {} }' })
 for (const { world, avatar } of Object.values(pair)) {
  const loaded = await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [
   { scripts: [{ name: 'root', source: { source: commands } }] },
   { scripts: [{ name: 'child', source: { source: commands } }] },
  ] })
  for (const script of Object.values(loaded.scripts)) script.start()
  loaded.linkset.attachToAvatar(avatar.key, 1)
  const send = (name: 'root' | 'child', command: string) => {
   const script = loaded.scripts[name]!
   script.host.description = command; script.fire('touch_start', { num_detected: 1 })
  }
  send('root', '@detach=n'); send('child', '@detach=n')
  send('root', '@detachme=force'); expect(loaded.linkset.attachment?.point).toBe(1)
  send('child', '@detachme=force'); expect(loaded.linkset.attachment?.point).toBe(1)
  send('root', '@detach=y,detachme=force'); expect(loaded.linkset.attachment?.point).toBe(1)
  send('child', '@detachme=force'); expect(loaded.linkset.attachment?.point).toBe(1)
  send('child', '@detach=rem'); send('root', '@detachme:=force')
  expect(loaded.linkset.attachment).toBeNull()
 }
})

it('does not apply a different attachment lock to the issuing attachment', async () => {
 const pair = await loadRlvPair({ source })
 for (const { script, world, avatar } of Object.values(pair)) {
  const locked = await loadLinkset({ world, owner: avatar.key, region: avatar.region,
   prims: [{ scripts: [{ name: 'lock', source: { source: 'default { state_entry() { llOwnerSay("@detach=n"); } }' } }] }] })
  locked.linkset.attachToAvatar(avatar.key, 1); locked.scripts.lock!.start()
  script.start(); script.linkset.attachToAvatar(avatar.key, 1)
  script.fire('touch_start', { num_detected: 1 })
  expect(script.linkset.attachment).toBeNull()
  expect(locked.linkset.attachment?.point).toBe(1)
 }
})

it('records an unattached force as a no-op and leaves other detach forms unsupported', async () => {
 const pair = await loadRlvPair({ source: source.replace('@detachme=force', '@detachme=force,detach=force,detach:chest=n,detachme=n') })
 for (const { script, avatar } of Object.values(pair)) {
  script.start(); script.fire('touch_start', { num_detected: 1 })
  expect(script.linkset.attachment).toBeNull()
  expect(avatar.viewer.commandLog[0]).toMatchObject({ status: 'enforced', outcome: 'no-op' })
  expect(avatar.viewer.commandLog.slice(1).map(e => e.status)).toEqual(['enforced', 'applied', 'unsupported'])
 }
})

it('keeps disabled viewer commands inert', async () => {
 const world = new World(); world.addRegion('disabled', { x: 0, y: 0 })
 const avatar = world.addAvatar({ username: 'disabled', region: 'disabled' })
 const loaded = await loadLinkset({ world, owner: avatar.key, region: avatar.region,
  prims: [{ scripts: [{ name: 'off', source: { source: source.replace('@detachme=force', '@detach=n,detachme=force') } }] }] })
 const script = loaded.scripts.off!
 script.start(); loaded.linkset.attachToAvatar(avatar.key, 1)
 script.fire('touch_start', { num_detected: 1 })
 expect(loaded.linkset.attachment?.point).toBe(1)
 expect(avatar.viewer.commandLog).toEqual([])
 expect(avatar.viewer.restrictions.snapshot()).toEqual([])
})

// Simulator detach is independent of the viewer's refusal of a detach attempt.
it('allows a permitted root simulator detach through a viewer lock', async () => {
 const pair = await loadRlvPair({ source: `integer after; list events; default {
  state_entry() { llOwnerSay("@detach=n"); llRequestPermissions(llGetOwner(),PERMISSION_ATTACH); }
  touch_start(integer n) { llDetachFromAvatar(); after = llGetAttached(); }
  attach(key id) { events += [(string)id, llGetAttached()]; }
 }` })
 for (const { script, avatar } of Object.values(pair)) {
  script.start(); script.linkset.attachToAvatar(avatar.key, 1); script.grantPermissions()
  script.fire('touch_start', { num_detected: 1 })
  expect(script.global('after')).toBe(1)
  expect(script.linkset.attachment).toBeNull()
  expect(script.global('events')).toEqual([avatar.key, 1, '00000000-0000-0000-0000-000000000000', 0])
 }
})

it('denies viewer detach until the last root or child lock is removed', async () => {
 const pair = await loadRlvPair({ source: commands })
 for (const fixture of Object.values(pair)) {
  const { script, world, avatar } = fixture
  const loaded = await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [
   { scripts: [{ name: 'root', source: { source: commands } }] },
   { scripts: [{ name: 'child', source: { source: commands } }] },
  ] })
  for (const script of Object.values(loaded.scripts)) script.start()
  loaded.linkset.attachToAvatar(avatar.key, 1); loaded.linkset.advanceTime(0)
  const send = (name: 'root' | 'child', command: string) => {
   const script = loaded.scripts[name]!
   script.host.description = command; script.fire('touch_start', { num_detected: 1 })
  }
  send('root', '@detach=n'); send('child', '@detach=n')
  expect(fixture.attemptDetach(loaded.linkset)).toBe('blocked')
  send('root', '@detach=y')
  expect(fixture.attemptDetach(loaded.linkset)).toBe('blocked')
  send('child', '@detach=y')
  expect(fixture.attemptDetach(loaded.linkset)).toBe('allowed')
  loaded.linkset.advanceTime(0)
  expect(loaded.linkset.attachment).toBeNull()
  for (const script of Object.values(loaded.scripts)) expect(script.global('events')).toEqual([
   avatar.key, 1, '00000000-0000-0000-0000-000000000000', 0,
  ])
  expect(fixture.attemptDetach(loaded.linkset)).toBe('no-op')
  script.start(); script.linkset.attachToAvatar(avatar.key, 5)
  expect(fixture.attemptDetach()).toBe('allowed')
 }
})

it('checks the actual wearing avatar and World, including disabled mode', async () => {
 const pair = await loadRlvPair({ source: commands })
 const a = pair.rlv; const b = pair.rlva
 a.script.start(); b.script.start()
 a.script.linkset.attachToAvatar(a.avatar.key, 1)
 expect(b.attemptDetach(a.script.linkset)).toBe('no-op')
 const other = a.world.addAvatar({ username: 'other', region: a.avatar.region })
 const loaded = await loadLinkset({ world: a.world, owner: a.avatar.key, region: a.avatar.region, prims: [{}] })
 loaded.linkset.attachToAvatar(other.key, 1)
 expect(a.attemptDetach(loaded.linkset)).toBe('no-op')
 // Disabled viewers do not consult restrictions retained in a different viewer.
 expect(attemptViewerDetach(other, loaded.linkset)).toBe('allowed')
 expect(loaded.linkset.attachment).toBeNull()
 a.script.linkset.remove()
 expect(a.attemptDetach()).toBe('no-op')
})

it('leaves a permitted child simulator detach inert under a child lock', async () => {
 const pair = await loadRlvPair({ source: 'default { state_entry() {} }' })
 for (const { world, avatar } of Object.values(pair)) {
  const loaded = await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [
   { scripts: [{ name: 'root', source: { source: commands } }] },
   { scripts: [{ name: 'child', source: { source: `integer after; default {
    state_entry() { llOwnerSay("@detach=n"); llRequestPermissions(llGetOwner(),PERMISSION_ATTACH); }
    touch_start(integer n) { llDetachFromAvatar(); after = llGetAttached(); }
   }` } }] },
  ] })
  loaded.scripts.root!.start(); loaded.scripts.child!.start()
  loaded.linkset.attachToAvatar(avatar.key, 1); loaded.scripts.child!.grantPermissions()
  loaded.scripts.child!.fire('touch_start', { num_detected: 1 })
  expect(loaded.linkset.attachment?.point).toBe(1)
  expect(loaded.scripts.child!.global('after')).toBe(1)
 }
})

// In-world: root detachme followed by script self-removal -> surviving script
// reports detach (Aditi, SLua Tideland, 2026-11-01, Firestorm RLVa 2.4.2).
it('completes accepted force self-detach after its script removes itself', async () => {
 const pair = await loadRlvPair({ source: `default {
  touch_start(integer n) { llOwnerSay("@detachme=force"); llRemoveInventory(llGetScriptName()); }
 }` })
 for (const { script, avatar } of Object.values(pair)) {
  script.start(); script.linkset.attachToAvatar(avatar.key, 1); script.advanceTime(0)
  script.fire('touch_start', { num_detected: 1 })
  expect(script.dead).toBe(true)
  expect(script.linkset.attachment).toBeNull()
 }
})
