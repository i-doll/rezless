import { expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, World, RLV_MANIFEST } from '../src/index.js'

// Wiki: https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Blacklist_handling
// Confirmed difference: RRInterface::getVersionNum/getBlacklist/add/force and
// RlvBehaviourDictionary/RlvHandler::processCommand distinguish these profiles.
const source = (commands: string) => `list replies; default {
 state_entry() { llListen(23601,"",llGetOwner(),""); llOwnerSay(${JSON.stringify(commands)}); }
 listen(integer c,string n,key id,string m) { replies += [m]; }
}`

// In-world: versionnum -> 3040300; versionnumbl/getblacklist -> no replies
// (Aditi, SLua Tideland, Firestorm 7.2.5.81978, RLVa 2.4.2, 2026-11-01).
it('keeps the blacklist query set profile-specific with an empty blacklist', async () => {
 const pair = await loadRlvPair({ source: source('@versionnum=23601,versionnumbl=23601,getblacklist=23601') })
 for (const f of Object.values(pair)) f.script.start()
 expect(pair.rlv.script.global('replies')).toEqual(['2093500','2093500',''])
 expect(pair.rlva.script.global('replies')).toEqual(['3040300'])
 expect(pair.rlva.avatar.viewer.commandLog.slice(1).every(r => r.status === 'unsupported')).toBe(true)
})

it('preserves blacklist order, force markers, duplicates and substring filters', async () => {
 const pair = await loadRlvPair({ viewer: { blacklist: ['sit', 'unsit%f', 'sit'] }, source: source(
  '@versionnum=23601,versionnumbl:ignored=23601,getblacklist=23601,getblacklist:sit=23601,getblacklist:%f=23601,getblacklist:missing=23601') })
 for (const f of Object.values(pair)) f.script.start()
 expect(pair.rlv.script.global('replies')).toEqual(['2093500','2093500,sit,unsit%f,sit','sit,unsit%f,sit','sit,unsit%f,sit','unsit%f',''])
 expect(pair.rlva.script.global('replies')).toEqual(['3040300'])
})

it('acknowledges ignored Kokua adds after notification without storing them', async () => {
 const pair = await loadRlvPair({ viewer: { blacklist: ['sit','notify'] }, source: source(
  '@notify:23601=add,sit=add,sit=n,sit:bad=n,sit=rem,getstatus=23601') })
 for (const f of Object.values(pair)) f.script.start()
 expect(pair.rlv.script.global('replies')).toEqual(['/sit=n','/sit=n','/sit:bad=n','/sit=y','/notify:23601'])
 expect(pair.rlv.avatar.viewer.restrictions.snapshot().map(r => r.behaviour)).toEqual(['notify'])
 expect(pair.rlv.avatar.viewer.commandLog.slice(1,4).map(r => r.outcome)).toEqual(['ignored-blacklist','ignored-blacklist','ignored-blacklist'])
 expect(pair.rlva.avatar.viewer.restrictions.snapshot().map(r => r.behaviour)).toEqual(['notify'])
})

it('separates force blacklist entries from add entries and prevents force effects', async () => {
 const pair = await loadRlvPair({ viewer: { blacklist: ['sit','unsit%f'] }, source: source('@sit=n,unsit=n,unsit=force,sit=force') })
 for (const f of Object.values(pair)) f.script.start()
 expect(pair.rlv.avatar.viewer.restrictions.snapshot().map(r => r.rule)).toEqual(['unsit'])
 expect(pair.rlv.avatar.viewer.commandLog[2]).toMatchObject({ status: 'ignored', outcome: 'ignored-blacklist' })
 expect(pair.rlv.avatar.viewer.commandLog[3]).toMatchObject({ status: 'action', action: 'sit' })
})

// Setting dependent: RlvSettings::getNoSetEnv blocks setenv add/remove in the
// dictionary before callbacks. Environment enforcement itself is unsupported.
it('models RLVa disabled commands independently without suppressing unsupported diagnostics', async () => {
 const pair = await loadRlvPair({ viewer: { rlvaNoSetEnv: true, blacklist: ['setenv','madeup'] }, source: source(
  '@notify:23601=n,setenv=n,setenv=y,madeup=n,getstatus=23601') })
 for (const f of Object.values(pair)) f.script.start()
 expect(pair.rlva.script.global('replies')).toEqual(['/notify:23601=n','/madeup=n','/notify:23601'])
 expect(pair.rlva.avatar.viewer.commandLog.slice(1,3).map(r => r.outcome)).toEqual(['failed-disabled','failed-disabled'])
 expect(pair.rlva.avatar.viewer.diagnostics.filter(d => d.command.startsWith('@setenv'))).toHaveLength(2)
 expect(pair.rlv.avatar.viewer.diagnostics.some(d => d.command === '@madeup=n')).toBe(true)
 expect(pair.rlv.avatar.viewer.restrictions.snapshot().map(r => r.rule)).toEqual(['notify:23601'])
})

it('scopes configuration to one avatar and keeps disabled viewers inert', async () => {
 const world = new World(); world.addRegion('test',{x:0,y:0})
 for (const profile of ['rlv','disabled'] as const) {
  const avatar = world.addAvatar({ username:profile,region:'test',viewer:{profile,blacklist:['sit']} })
  const f = await loadLinkset({world,region:'test',owner:avatar.key,prims:[{scripts:[{name:'main',source:{source:source('@sit=n,versionnumbl=23601')}}]}]})
  f.scripts.main!.start()
  expect(avatar.viewer.restrictions.snapshot()).toEqual([])
  if(profile === 'disabled') expect(avatar.viewer.commandLog).toEqual([])
 }
 const other = await loadRlvPair({source:source('@sit=n')})
 other.rlv.script.start()
 expect(other.rlv.avatar.viewer.restrictions.snapshot().map(r=>r.rule)).toEqual(['sit'])
})

it('advertises only the Kokua blacklist queries', () => {
 const entry=RLV_MANIFEST.commands.find(e=>e.id === 'blacklist')!
 expect(entry.profiles.rlv.commandForms?.map(f=>f.behaviour)).toEqual(['versionnumbl','getblacklist'])
 expect(entry.profiles.rlva.commandForms).toEqual([])
})

it('keeps named reply dispatch ahead of blacklist checks and accepts signed Kokua channels', async () => {
 const pair = await loadRlvPair({ viewer:{blacklist:['getblacklist','versionnumbl']}, source:`list replies; default {
  state_entry() { llListen(-23601,"",llGetOwner(),""); llOwnerSay("@getblacklist=-23601,versionnumbl=-23601,getblacklist=n"); }
  listen(integer c,string n,key id,string m) { replies += [m]; }
 }` })
 for(const f of Object.values(pair)) f.script.start()
 expect(pair.rlv.script.global('replies')).toEqual(['getblacklist,versionnumbl','2093500,getblacklist,versionnumbl'])
 expect(pair.rlv.avatar.viewer.restrictions.snapshot()).toEqual([])
 expect(pair.rlv.avatar.viewer.commandLog.at(-1)?.status).toBe('unsupported')
 expect(pair.rlva.script.global('replies')).toEqual([])
})

it('retains blacklist configuration through session reset and startup queuing', async () => {
 const entries=['sit']
 const pair=await loadRlvPair({viewer:{blacklist:entries,ready:false},source:source('@versionnumbl=23601,sit=n,getblacklist=23601')})
 entries.push('unsit')
 pair.rlv.script.start()
 expect(pair.rlv.script.global('replies')).toEqual(['2093500,sit'])
 pair.rlv.avatar.viewer.session.setReady(true)
 pair.rlv.script.advanceTime(0)
 expect(pair.rlv.script.global('replies')).toEqual(['2093500,sit','sit'])
 expect(pair.rlv.avatar.viewer.restrictions.snapshot()).toEqual([])
 pair.rlv.avatar.viewer.session.reset()
 expect(pair.rlv.avatar.viewer.blacklist.entries).toEqual(['sit'])
})

it('prevents a blacklisted forced stand while leaving the other profile unaffected', async () => {
 const pair = await loadRlvPair({viewer:{blacklist:['unsit%f']},source:source('@unsit=force')})
 for(const [profile,f] of Object.entries(pair)) {
  const seat=await loadLinkset({world:f.world,region:f.avatar.region,owner:f.avatar.key,prims:[{name:'seat'}]})
  expect(f.userSit(seat.linkset.prims[0]!)).toBe(true)
  f.script.start()
  expect(!!f.avatar.sittingOn).toBe(profile === 'rlv')
  expect(f.avatar.viewer.commandLog[0]).toMatchObject(profile === 'rlv'
   ? {status:'ignored',outcome:'ignored-blacklist'} : {status:'action',action:'unsit',actionOutcome:'applied'})
 }
})
