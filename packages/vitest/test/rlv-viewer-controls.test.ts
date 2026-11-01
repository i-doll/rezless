import { describe, expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, seedRlvInventory } from '../src/index.js'

const source = `
list replies; integer listener; integer attempts; string result;
default {
 state_entry() { listener = llListen(773232, "", llGetOwner(), ""); }
 touch_start(integer n) { if (llGetObjectDesc() == "remove") llRemoveInventory(llGetScriptName()); else llOwnerSay(llGetObjectDesc()); }
 listen(integer c, string n, key id, string m) { if (c == 1) { llListenRemove(listener); return; } replies += [m]; }
}`
async function fixtures(text = source) {
 const pair = await loadRlvPair({ source: text })
 for (const { script, avatar } of Object.values(pair)) {
  const item = await loadLinkset({ prims: [{ name: 'Cuff' }] })
  seedRlvInventory(avatar, { sharedRootId: 'root', entries: [
   { id: 'root', parentId: null, kind: 'folder', name: '#RLV' },
   { id: 'folder', parentId: 'root', kind: 'folder', name: 'Wear' },
   { id: 'item', parentId: 'folder', kind: 'item', name: 'Cuff (chest)', assetType: 'object', object: item.linkset },
  ] })
  script.start()
 }
 return pair
}
type Fixture = Awaited<ReturnType<typeof fixtures>>['rlv']
function send(f: Fixture, command: string) {
 f.script.host.description = command
 f.script.fire('touch_start', { num_detected: 1 })
}
const worn = (f: Fixture) => f.world.linksets.filter(l => l.attachment).length

describe('opt-in viewer controls', () => {
 it('times out, retries folder discovery, then falls back from an empty path without mocking', async () => {
  const pair = await fixtures(`integer attempts; integer phase; string result;
  default {
   state_entry() { llListen(773232,"",llGetOwner(),""); }
   touch_start(integer n) { attempts = 1; llOwnerSay("@getinv=773232"); llSetTimerEvent(1.0); }
   timer() {
    if (phase == 0) { ++attempts; llOwnerSay("@getinv=773232"); }
    else if (phase == 1) { ++attempts; llOwnerSay("@getpath:chest=773232"); }
   }
   listen(integer c,string n,key id,string m) {
    if (phase == 0) { phase = 1; llOwnerSay("@attachover:wear=force"); llOwnerSay("@getpath:chest=773232"); }
    else if (phase == 1) {
     if (m == "") { result = "fallback"; llOwnerSay("@detachall:wear=force"); }
     else result = m;
     phase = 2; llSetTimerEvent(0.0);
    }
   }
  }`)
  for (const f of Object.values(pair)) {
   f.avatar.viewer.dropNext(cmd => cmd.startsWith('@getinv='))
   f.avatar.viewer.dropNext(cmd => cmd.startsWith('@getpath'))
   f.avatar.viewer.answerNext('', cmd => cmd.startsWith('@getpath'))
   send(f, '')
   expect(f.script.global('attempts')).toBe(1)
   f.script.advanceTime(1000)
   expect(worn(f)).toBe(1)
   f.script.advanceTime(1000)
   expect(f.script.global('attempts')).toBe(3)
   expect(f.script.global('result')).toBe('fallback')
   expect(worn(f)).toBe(0)
  }
 })

 it('stacks matching overrides and leaves unmatched predicates pending', async () => {
  for (const f of Object.values(await fixtures())) {
   const viewer = f.avatar.viewer
   viewer.dropNext(cmd => cmd.startsWith('@getpath'))
   viewer.dropNext(cmd => cmd.startsWith('@getinv='))
   viewer.dropNext(cmd => cmd.startsWith('@getinv='))
   viewer.answerNext('chosen', cmd => cmd.startsWith('@getinvworn'))
   send(f, '@getinv=773232,getinv=773232,getinv=773232,getinvworn:wear=773232,getpath:chest=773232,getpath:chest=773232')
   expect(f.script.global('replies')).toEqual(['Wear', 'chosen', ''])
   viewer.dropNext(() => false)
   send(f, '@getinv=773232')
   expect(f.script.global('replies')).toEqual(['Wear', 'chosen', '', 'Wear'])
  }
 })

 it('holds folder actions and replies in order and resumes only without a count', async () => {
  for (const f of Object.values(await fixtures())) {
   const viewer = f.avatar.viewer
   viewer.hold()
   send(f, '@attachover:wear=force,getinv=773232,detachall:wear=force')
   expect(worn(f)).toBe(0)
   viewer.release(0)
   f.script.linkset.advanceTime(0)
   expect(worn(f)).toBe(0)
   viewer.release(1)
   expect(worn(f)).toBe(0)
   f.script.linkset.advanceTime(0)
   expect(worn(f)).toBe(1)
   expect(f.script.global('replies')).toEqual([])
   viewer.release(99)
   expect(worn(f)).toBe(1)
   f.script.linkset.advanceTime(0)
   expect(worn(f)).toBe(0)
   expect(f.script.global('replies')).toEqual(['Wear'])
   send(f, '@getinv=773232')
   expect(f.script.global('replies')).toEqual(['Wear'])
   viewer.release()
   expect(f.script.global('replies')).toEqual(['Wear'])
   f.script.linkset.advanceTime(0)
   expect(f.script.global('replies')).toEqual(['Wear', 'Wear'])
   send(f, '@getinv=773232')
   expect(f.script.global('replies')).toEqual(['Wear', 'Wear', 'Wear'])
  }
 })

 for (const lifecycle of ['reset', 'remove', 'unlisten'] as const) it(`routes released replies to current listeners after ${lifecycle}`, async () => {
  for (const f of Object.values(await fixtures())) {
   const receiver = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
    prims: [{ scripts: [{ name: 'receiver', source: { source } }] }] })
   receiver.scripts.receiver!.start()
   f.avatar.viewer.hold()
   send(f, '@getinv=773232')
   if (lifecycle === 'reset') f.script.reset()
   if (lifecycle === 'remove') send(f, 'remove')
   if (lifecycle === 'unlisten') f.script.fire('listen', { channel: 1, name: '', id: f.avatar.key, message: '' })
   f.avatar.viewer.release()
   f.script.linkset.advanceTime(0)
   expect(receiver.scripts.receiver!.global('replies')).toEqual(['Wear'])
   if (lifecycle === 'reset') expect(f.script.global('replies')).toEqual(['Wear'])
   if (lifecycle === 'unlisten') expect(f.script.global('replies')).toEqual([])
  }
 })

 it('uses default predicates once and delivers an empty getpath as an empty chat message', async () => {
  for (const f of Object.values(await fixtures(`list replies; default {
   state_entry() { llListen(773232,"",llGetOwner(),""); }
   touch_start(integer n) { llOwnerSay("@getpath:chest=773232"); }
   listen(integer c,string n,key id,string m) { replies += [c, id, m]; }
  }`))) {
   f.avatar.viewer.dropNext()
   f.avatar.viewer.answerNext('')
   send(f, '')
   expect(f.script.global('replies')).toEqual([])
   send(f, '')
   expect(f.script.global('replies')).toEqual([773232, f.avatar.key, ''])
  }
 })

 it('rejects invalid counts without draining or resuming delivery', async () => {
  for (const f of Object.values(await fixtures())) {
   f.avatar.viewer.hold()
   send(f, '@getinv=773232')
   for (const count of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => f.avatar.viewer.release(count)).toThrow(RangeError)
   }
   f.script.advanceTime(0)
   expect(f.script.global('replies')).toEqual([])
   f.avatar.viewer.release()
   f.script.advanceTime(0)
   expect(f.script.global('replies')).toEqual(['Wear'])
  }
 })

 it('cancels held replies when the viewer session resets', async () => {
  for (const f of Object.values(await fixtures())) {
   f.avatar.viewer.hold()
   send(f, '@getinv=773232')
   f.avatar.viewer.session.reset()
   f.avatar.viewer.release()
   f.script.advanceTime(0)
   expect(f.script.global('replies')).toEqual([])
  }
 })

 it('completes held forced work after its issuing script is removed', async () => {
  for (const f of Object.values(await fixtures())) {
   f.avatar.viewer.hold()
   send(f, '@attachover:wear=force')
   send(f, 'remove')
   f.avatar.viewer.release()
   expect(worn(f)).toBe(0)
   f.script.linkset.advanceTime(0)
   expect(worn(f)).toBe(1)
  }
 })


 it('holds forced self-detach behind earlier work and preserves issuer-removal handling', async () => {
  for (const f of Object.values(await fixtures())) {
   f.script.linkset.attachToAvatar(f.avatar.key, 1)
   f.avatar.viewer.hold()
   send(f, '@attachover:wear=force,detachme=force')
   send(f, 'remove')
   expect(f.script.linkset.attachment?.point).toBe(1)
   f.avatar.viewer.release(1)
   f.script.linkset.advanceTime(0)
   expect(worn(f)).toBe(2)
   expect(f.script.linkset.attachment?.point).toBe(1)
   f.avatar.viewer.release()
   expect(f.script.linkset.attachment?.point).toBe(1)
   f.script.linkset.advanceTime(0)
   expect(f.script.linkset.attachment).toBeNull()
   expect(worn(f)).toBe(1)
  }
 })

})
