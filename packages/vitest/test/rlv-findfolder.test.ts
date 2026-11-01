import { expect, it } from 'vitest'
import { loadRlvPair, seedRlvInventory, loadLinkset } from '../src/index.js'

// https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Shared_Folders
// In-world: issue-230 folder tree -> findfolder selects the deepest match;
// findfolders returns preorder inventory order with commas and preserves comma names.
// && skips empty terms. Hidden and ~ folders do not match, but their visible
// descendants do. Slash names do not match. A semicolon separator option and
// empty criteria return empty replies. Single and missing searches reply once.
// In-world: two Chest probes -> getpath selects the first, getpathnew lists both.
// Issuer and object UUID selectors return nested containing paths; inventory UUID,
// null UUID, invalid point and numeric point return empty. Legacy folded folders
// collapse to their parent. Detaching the first leaves only the second path;
// reattaching it makes the second the first result. Ground issuers return empty.
// Firestorm RLVa 2.4.2, API 3.4.3, viewer 7.2.5.81978
// (Aditi, SLua Tideland, 2026-11-01).
// Kokua RLV 2.09.35.00 uses postorder traversal, skips hidden/~ subtrees,
// and accepts custom findfolders separators.
const source = `list replies; default {
  state_entry() { llListen(230101,"",llGetOwner(),"");
    llOwnerSay("@findfolder:needle=230101,findfolders:needle=230101,findfolders:needle&&blue=230101,findfolders:missing=230101");
  } listen(integer c,string n,key id,string m) { replies += [m]; }
}`
const folder = (id: string, parentId: string | null, name: string) => ({ id, parentId, name, kind: 'folder' as const })
it('answers single, multiple, multi-term and missing folder searches in each profile', async () => {
  const pair = await loadRlvPair({ source })
  for (const { script, avatar } of Object.values(pair)) {
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null, '#RLV'),
      folder('z', 'r', 'needle Zulu'), folder('a', 'r', 'needle blue Alpha')] })
    script.start()
    expect(script.global('replies')).toEqual(['needle Zulu', 'needle Zulu,needle blue Alpha', 'needle blue Alpha', ''])
  }
})

const queries = (commands: string[]) => `list replies; default {
 state_entry() { llListen(230101,"",llGetOwner(),"");
 ${commands.map(c => `llOwnerSay("@${c}=230101");`).join('\n')} }
 listen(integer c,string n,key id,string m) { replies += [m]; }
}`
it('keeps profile traversal, deepest selection and custom separators distinct', async () => {
 const pair = await loadRlvPair({ source: queries(['findfolder:needle', 'findfolders:needle', 'findfolders:needle;|']) })
 for (const profile of ['rlv','rlva'] as const) {
  const { script, avatar } = pair[profile]
  seedRlvInventory(avatar, {sharedRootId:'r', entries:[folder('r',null,'#RLV'),
   folder('a','r','needle Zulu'),folder('b','a','needle Child'),folder('c','r','Alpha'),
   folder('d','c','Nested'),folder('e','d','needle Deep')]})
  script.start()
  expect(script.global('replies')).toEqual(profile === 'rlv'
   ? ['needle Zulu/needle Child','needle Zulu/needle Child,needle Zulu,Alpha/Nested/needle Deep','needle Zulu/needle Child|needle Zulu|Alpha/Nested/needle Deep']
   : ['Alpha/Nested/needle Deep','needle Zulu,needle Zulu/needle Child,Alpha/Nested/needle Deep',''])
 }
})
it('excludes hidden and dropped matches with profile-specific descendant traversal', async () => {
 const pair = await loadRlvPair({source:queries(['findfolders:secret','findfolders:dropped','findfolders:child','findfolders:slash'])})
 for(const profile of ['rlv','rlva'] as const) {
  const {script,avatar}=pair[profile]
  seedRlvInventory(avatar,{sharedRootId:'r',entries:[folder('r',null,'#RLV'),folder('h','r','.secret'),
   folder('hc','h','child Hidden'),folder('t','r','~dropped'),folder('tc','t','child Dropped'),folder('s','r','slash/name')]})
  script.start()
  expect(script.global('replies')).toEqual(profile==='rlv' ? ['','','','slash/name'] : ['','~dropped/child Dropped','.secret/child Hidden,~dropped/child Dropped',''])
 }
})


it('maps inventory item identity to live attachments without exposing unshared paths', async () => {
 const pair = await loadRlvPair({source: `list replies; default {
  state_entry() { llListen(230101,"",llGetOwner(),""); }
  touch_start(integer n) { llOwnerSay("@getpath:chest=230101,getpathnew:chest=230101"); }
  listen(integer c,string n,key id,string m) { replies += [m]; }
 }`})
 for (const {script,avatar,world} of Object.values(pair)) {
  const a=await loadLinkset({world,owner:avatar.key,region:avatar.region,prims:[{name:'A'}]})
  const b=await loadLinkset({world,owner:avatar.key,region:avatar.region,prims:[{name:'B'}]})
  const unshared=await loadLinkset({world,owner:avatar.key,region:avatar.region,prims:[{name:'Private'}]})
  seedRlvInventory(avatar,{sharedRootId:'r',entries:[folder('r',null,'#RLV'),folder('a','r','Same'),
   folder('b','r','Same'),folder('n','b','Nested'),folder('o',null,'Private'),
   {id:'i1',parentId:'a',name:'Same object',kind:'item'},
   {id:'i2',parentId:'n',name:'Same object',kind:'item'},
   {id:'i3',parentId:'o',name:'Private',kind:'item'}],
   wornAttachments:[{itemId:'i1',rootKey:a.prims[0]!.key},{itemId:'i2',rootKey:b.prims[0]!.key},
    {itemId:'i3',rootKey:unshared.prims[0]!.key}]})
  a.linkset.attachToAvatar(avatar.key,1); b.linkset.attachToAvatar(avatar.key,1); unshared.linkset.attachToAvatar(avatar.key,1)
  script.start();script.fire('touch_start',{num_detected:1})
  const first = avatar.viewer.profile === 'rlv' ? ['Same','Same,Same/Nested,'] : ['Same','Same,Same/Nested']
  expect(script.global('replies')).toEqual(first)
  a.linkset.detachFromAvatar()
  script.fire('touch_start',{num_detected:1})
  expect(script.global('replies')).toEqual([...first,'Same/Nested',avatar.viewer.profile === 'rlv' ? 'Same/Nested,' : 'Same/Nested'])
  b.linkset.detachFromAvatar()
  script.fire('touch_start',{num_detected:1})
  expect((script.global('replies') as string[]).slice(-2)).toEqual(['',''])
 }
})

it('accepts issuer and object UUID selectors, but not inventory UUIDs', async () => {
 const pair = await loadRlvPair({source:`list replies; default {
  state_entry(){llListen(230101,"",llGetOwner(),"");
   llOwnerSay("@getpath=230101,getpathnew=230101,getpath:"+(string)llGetKey()+"=230101,getpathnew:aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa=230101,getpath:invalid=230101");}
  listen(integer c,string n,key id,string m){replies += [m];}
 }`})
 for(const {script,avatar} of Object.values(pair)) {
  seedRlvInventory(avatar,{sharedRootId:'r',entries:[folder('r',null,'#RLV'),folder('n','r','Nested'),
   {id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',parentId:'n',name:'Probe',kind:'item'}],
   wornAttachments:[{itemId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',rootKey:script.linkset.prims[0]!.key}]})
  script.linkset.attachToAvatar(avatar.key,1)
  script.start()
  expect(script.global('replies')).toEqual(['Nested','Nested','Nested','',''])
  if(avatar.viewer.profile==='rlva')expect(avatar.viewer.commandLog.slice(-2).map(e=>'outcome' in e?e.outcome:undefined)).toEqual(['failed-option','failed-option'])
 }
})

it('answers absent roots and invalid options with empty messages on valid channels only', async () => {
 const pair=await loadRlvPair({source:queries(['findfolders:missing','findfolder:missing','getpath:chest','getpathnew:chest','getpath','getpathnew:invalid'])})
 for(const {script} of Object.values(pair)) {
  script.start()
  expect(script.global('replies')).toEqual(['','','','','',''])
 }
})

it('keeps disabled viewers inert for search and worn paths', async () => {
 const {World}=await import('../src/index.js')
 const world=new World();world.addRegion('test',{x:0,y:0})
 const avatar=world.addAvatar({username:'off',region:'test'})
 const loaded=await loadLinkset({world,region:'test',owner:avatar.key,prims:[{scripts:[{name:'off',source:{source:queries(['findfolder:needle','findfolders:needle','getpath','getpathnew:chest'])}}]}]})
 seedRlvInventory(avatar,{sharedRootId:'r',entries:[folder('r',null,'#RLV'),folder('f','r','needle')]})
 loaded.scripts.off!.start()
 expect(loaded.scripts.off!.global('replies')).toEqual([])
 expect(avatar.viewer.commandLog).toEqual([])
})


it('collapses RLVa folded folders and keeps modifiable Kokua containing paths', async () => {
  const pair = await loadRlvPair({ source: queries(['getpath', 'getpathnew']) })
  for (const { script, avatar } of Object.values(pair)) {
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null, '#RLV'),
      folder('n', 'r', 'Nested'), { ...folder('f', 'n', 'legacy (chest)'), folded: true },
      { id: 'i', parentId: 'f', name: 'Probe', kind: 'item' }],
      wornAttachments: [{ itemId: 'i', rootKey: script.host.key }] })
    script.linkset.attachToAvatar(avatar.key, 1)
    script.start()
    expect(script.global('replies')).toEqual(avatar.viewer.profile === 'rlva'
      ? ['Nested', 'Nested'] : ['Nested/legacy (chest)', 'Nested/legacy (chest)'])
  }
})

it('answers empty outfit-layer queries and honors reply channel policy', async () => {
  const pair = await loadRlvPair({ source: `list replies; default {
    state_entry() { llListen(230101,"",llGetOwner(),""); llListen(-230101,"",llGetOwner(),"");
      llOwnerSay("@getpath:shirt=230101,getpathnew:pants=230101,findfolder:missing=0,findfolders:missing=-230101,getpathnew:invalid=230101"); }
    listen(integer c,string n,key id,string m) { replies += [m]; }
  }` })
  for (const { script, avatar } of Object.values(pair)) {
    script.start()
    expect(script.global('replies')).toEqual(avatar.viewer.profile === 'rlv' ? ['', '', '', ''] : ['', '', ''])
    expect(avatar.viewer.commandLog.slice(0, 2)).toMatchObject([
      { status: 'replied', reply: { text: '' } }, { status: 'replied', reply: { text: '' } },
    ])
  }
})

it('validates attachment identity mappings atomically and owns its seeded copies', async () => {
  const { RlvInventory } = await import('../src/index.js')
  const config = { sharedRootId: 'r', entries: [folder('r', null, '#RLV'),
    { id: 'i', parentId: 'r', name: 'Object', kind: 'item' as const }],
    wornAttachments: [{ itemId: 'i', rootKey: 'ROOT' }] }
  const inventory = new RlvInventory(config)
  config.wornAttachments[0]!.rootKey = 'changed'
  expect(inventory.attachmentItem('root')?.id).toBe('i')
  expect(Object.isFrozen(inventory.attachmentItem('root'))).toBe(true)
  for (const wornAttachments of [
    [{ itemId: 'missing', rootKey: 'root' }], [{ itemId: 'r', rootKey: 'root' }],
    [{ itemId: 'i', rootKey: '' }],
    [{ itemId: 'i', rootKey: 'root' }, { itemId: 'i', rootKey: 'another' }],
    [{ itemId: 'i', rootKey: 'ROOT' }, { itemId: 'i', rootKey: 'root' }],
  ]) {
    expect(() => inventory.seed({ ...config, wornAttachments })).toThrow()
    expect(inventory.attachmentItem('root')?.id).toBe('i')
  }
  inventory.seed({ ...config, wornAttachments: undefined })
  expect(inventory.attachmentItem('root')).toBeUndefined()
})

it('distinguishes empty search fields and supports a custom Kokua separator', async () => {
  const pair = await loadRlvPair({ source: queries(['findfolder', 'findfolders', 'findfolders:&&', 'findfolders:needle&&&&blue&&', 'findfolders:needle;;##;ignored']) })
  for (const { script, avatar } of Object.values(pair)) {
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null, '#RLV'),
      folder('a', 'r', 'needle blue'), folder('b', 'r', 'needle second')] })
    script.start()
    expect(script.global('replies')).toEqual(avatar.viewer.profile === 'rlv'
      ? ['needle blue', '', 'needle blue,needle second,', 'needle blue', 'needle blue##needle second']
      : ['', '', '', 'needle blue', ''])
    if (avatar.viewer.profile === 'rlva') expect(avatar.viewer.commandLog[0]).toMatchObject({ outcome: 'failed-option' })
  }
})

it('uses current attachment order after reattachment and ignores another avatar and dead objects', async () => {
  const pair = await loadRlvPair({ source: `list replies; default {
    state_entry() { llListen(230101,"",llGetOwner(),""); }
    touch_start(integer n) { llOwnerSay("@getpath:chest=230101,getpathnew:chest=230101"); }
    listen(integer c,string n,key id,string m) { replies += [m]; }
  }` })
  for (const { script, avatar, world } of Object.values(pair)) {
    const a = await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [{}] })
    const b = await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [{}] })
    const other = world.addAvatar({ username: 'other', region: avatar.region })
    const foreign = await loadLinkset({ world, owner: other.key, region: avatar.region, prims: [{}] })
    foreign.linkset.attachToAvatar(other.key, 1)
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null, '#RLV'),
      folder('a', 'r', 'Zulu'), folder('b', 'r', 'Alpha'),
      { id: 'i1', parentId: 'a', name: 'Same', kind: 'item' },
      { id: 'i2', parentId: 'b', name: 'Same', kind: 'item' }],
      wornAttachments: [{ itemId: 'i2', rootKey: b.prims[0]!.key }, { itemId: 'i1', rootKey: a.prims[0]!.key }] })
    a.linkset.attachToAvatar(avatar.key, 1); b.linkset.attachToAvatar(avatar.key, 1)
    script.start(); script.fire('touch_start', { num_detected: 1 })
    expect(script.global('replies')).toEqual(['Zulu', 'Zulu,Alpha'])
    a.linkset.detachFromAvatar(); a.linkset.attachToAvatar(avatar.key, 1)
    script.fire('touch_start', { num_detected: 1 })
    expect((script.global('replies') as string[]).slice(-2)).toEqual(['Alpha', 'Alpha,Zulu'])
    b.linkset.dead = true
    script.fire('touch_start', { num_detected: 1 })
    expect((script.global('replies') as string[]).slice(-2)).toEqual(['Zulu', 'Zulu'])
  }
})

it('preserves duplicate paths and the shared root empty path without inventing item mappings', async () => {
  const pair = await loadRlvPair({ source: queries(['getpath:left hand', 'getpathnew:left hand', 'getpathnew:chest']) })
  for (const { script, avatar, world } of Object.values(pair)) {
    const a = await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [{}] })
    const b = await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [{}] })
    const c = await loadLinkset({ world, owner: avatar.key, region: avatar.region, prims: [{}] })
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null, '#RLV'),
      { id: 'i1', parentId: 'r', name: 'A', kind: 'item' },
      { id: 'i2', parentId: 'r', name: 'B', kind: 'item' }],
      wornAttachments: [{ itemId: 'i1', rootKey: a.prims[0]!.key }, { itemId: 'i2', rootKey: b.prims[0]!.key }] })
    a.linkset.attachToAvatar(avatar.key, 5); b.linkset.attachToAvatar(avatar.key, 5)
    c.linkset.attachToAvatar(avatar.key, 1)
    script.start()
    expect(script.global('replies')).toEqual(avatar.viewer.profile === 'rlv' ? ['', ',', ''] : ['', '', ''])
    seedRlvInventory(avatar, { sharedRootId: 'r', entries: [folder('r', null, '#RLV'),
      folder('n', 'r', 'Nested'), { id: 'i1', parentId: 'n', name: 'A', kind: 'item' },
      { id: 'i2', parentId: 'n', name: 'B', kind: 'item' }],
      wornAttachments: [{ itemId: 'i1', rootKey: a.prims[0]!.key }, { itemId: 'i2', rootKey: b.prims[0]!.key }] })
    // The same source observes replacement inventory without any wear operation.
    const loaded = await loadLinkset({ world, owner: avatar.key, region: avatar.region,
      prims: [{ scripts: [{ name: 'again', source: { source: queries(['getpathnew:left hand']) } }] }] })
    loaded.scripts.again!.start()
    expect(loaded.scripts.again!.global('replies')).toEqual(['Nested,Nested'])
  }
})

it('exposes no mapped attachment path when the shared root is explicitly absent', async () => {
  const pair = await loadRlvPair({ source: queries(['getpath', 'getpathnew:chest']) })
  for (const { script, avatar } of Object.values(pair)) {
    seedRlvInventory(avatar, { sharedRootId: null, entries: [folder('r', null, '#RLV'),
      folder('n', 'r', 'Private'), { id: 'i', parentId: 'n', name: 'Object', kind: 'item' }],
      wornAttachments: [{ itemId: 'i', rootKey: script.host.key }] })
    script.linkset.attachToAvatar(avatar.key, 1)
    script.start()
    expect(script.global('replies')).toEqual(['', ''])
  }
})
