import { describe, expect, it } from 'vitest'
import { loadRlvPair, loadLinkset, World, RLV_MANIFEST } from '../src/index.js'

// Wiki: https://wiki.secondlife.com/wiki/LSL_Protocol/RestrainedLoveAPI#Miscellaneous
// In-world: aliases, duplicates, absent removes, failed commands, substring filters,
// self-notifications and clear ordering -> paired RLVa expectations below.
// Firestorm 7.2.5.81978, RLVa 2.4.2, Aditi, SLua Tideland, 2026-11-01.
// Paired expectations distinguish Kokua RLV 2.09.35.00 and Firestorm RLVa 2.4.2.
describe('restriction notifications', () => {
  it('delivers ordered aliases through avatar-origin LSL listener events', async () => {
    const pair = await loadRlvPair({ source: `default {
      state_entry() { llListen(22001, "", llGetOwner(), ""); llOwnerSay("@notify:22001=add,sit=add,sit=rem"); }
      listen(integer c, string n, key id, string m) { llSay(0, m); }
    }` })
    for (const [profile, { script }] of Object.entries(pair)) {
      script.start()
      expect(script.chat.filter(x => x.channel === 0 && x.type === "say").map(x => x.text)).toEqual(profile === 'rlv'
        ? ['/sit=n', '/sit=y'] : ['/notify:22001=add', '/sit=add', '/sit=rem'])
    }
  })
})

async function notifications(commands: string) {
  const pair = await loadRlvPair({ source: `list notices; default {
    state_entry() { llListen(22001, "", llGetOwner(), ""); llOwnerSay(${JSON.stringify(commands)}); }
    listen(integer c, string n, key id, string m) { notices += [m]; }
  }` })
  for (const { script } of Object.values(pair)) script.start()
  return { rlv: pair.rlv.script.global('notices'), rlva: pair.rlva.script.global('notices') }
}

it('distinguishes duplicate adds and absent removes', async () => {
  expect(await notifications('@notify:22001=add,sit=n,sit=add,sit=y,sit=rem')).toEqual({
    rlv: ['/sit=n', '/sit=y', '/sit=y'],
    rlva: ['/notify:22001=add', '/sit=n', '/sit=n', '/sit=y', '/sit=rem'],
  })
})

it('filters action text including options, without matching parameter aliases', async () => {
  expect(await notifications('@notify:22001;sit=add,sit:bad=n,unsit=add,clear=sit')).toEqual({
    rlv: ['/sit:bad=n', '/unsit=n', '/clear:sit', '/notify:22001;sit=y'],
    rlva: ['/notify:22001;sit=add', '/sit:bad=n', '/unsit=add'],
  })
  expect(await notifications('@notify:22001;add=add,sit=add')).toEqual({ rlv: [], rlva: ['/notify:22001;add=add'] })
})

it('does not duplicate registrations and removes them only for the issuing prim', async () => {
  expect(await notifications('@notify:22001=add,notify:22001=add,sit=n,notify:22001=rem,sit=y')).toEqual({
    rlv: ['/sit=n', '/notify:22001=y'],
    rlva: ['/notify:22001=add', '/notify:22001=add', '/sit=n'],
  })
})

it('clears subscriptions with the issuing prim rules in insertion order', async () => {
  expect(await notifications('@notify:22001=add,sit=n,clear,sit=y')).toEqual({
    rlv: ['/sit=n', '/clear', '/notify:22001=y'],
    rlva: ['/notify:22001=add', '/sit=n'],
  })
})

it('notifies failed external commands and ignores force and query commands', async () => {
  expect(await notifications('@notify:22001=add,sit:bad=n,issue220unknown=n,sit=force,getstatus=22002')).toEqual({
    rlv: ['/sit:bad=n', '/issue220unknown=n'],
    rlva: ['/notify:22001=add', '/sit:bad=n', '/issue220unknown=n'],
  })
})

it('keeps the first add alias on RLVa duplicates, including registrations', async () => {
  expect(await notifications('@notify:22001=n,notify:22001=add,sit=add,sit=n')).toEqual({
    rlv: ['/sit=n'],
    rlva: ['/notify:22001=n', '/notify:22001=n', '/sit=add', '/sit=add'],
  })
})

// In-world: two subscriptions -> one delivery per subscription, in batch order;
// filtered clear sends /clear:sit to remaining subscriptions, then bare clear
// removes subscriptions before its own callback (same viewer/grid/date as above).
it('orders multiple channels and clear callbacks independently of the input aliases', async () => {
  const pair = await loadRlvPair({ source: `list notices; default {
    state_entry() { llListen(22001,"",llGetOwner(),""); llListen(22002,"",llGetOwner(),"");
      llOwnerSay("@notify:22001=add,notify:22002=add,sit=n,clear=sit,clear"); }
    listen(integer c,string n,key id,string m) { notices += [(string)c + ":" + m]; }
  }` })
  for (const f of Object.values(pair)) f.script.start()
  expect(pair.rlv.script.global('notices')).toEqual([
    '22001:/notify:22002=n', '22001:/sit=n', '22002:/sit=n',
    '22001:/clear:sit', '22002:/clear:sit', '22001:/sit=y', '22002:/sit=y',
    '22001:/clear', '22002:/clear', '22001:/notify:22001=y', '22002:/notify:22001=y', '22002:/notify:22002=y',
  ])
  expect(pair.rlva.script.global('notices')).toEqual([
    '22001:/notify:22001=add', '22001:/notify:22002=add', '22002:/notify:22002=add',
    '22001:/sit=n', '22002:/sit=n', '22001:/clear:sit', '22002:/clear:sit',
  ])
})

// In-world: mixed-case substring and empty filter accepted; extra filter field
// rejected; numeric-prefix channel accepted (same viewer/grid/date as above).
for (const [option, rlv, rlva] of [
  ['22001;SiT', ['/sit=n', '/unsit=n'], ['/notify:22001;sit=add', '/sit=n', '/unsit=add']],
  ['22001;', ['/sit=n', '/unsit=n'], ['/notify:22001;=add', '/sit=n', '/unsit=add']],
  ['22001tail', ['/sit=n', '/unsit=n'], ['/notify:22001tail=add', '/sit=n', '/unsit=add']],
  ['22001;;sit', ['/sit=n', '/unsit=n'], []],
] as const) it(`uses profile-specific option parsing for ${option}`, async () => {
  expect(await notifications(`@notify:${option}=add,sit=n,unsit=add`)).toEqual({ rlv, rlva })
})

for (const option of ['', '0', '-22001', '2147483647', '2147483648', 'bad', '22001;;sit']) {
  it(`keeps invalid or unsupported registration ${JSON.stringify(option)} inspectable`, async () => {
    const pair = await loadRlvPair({ source: `list notices; default {
      state_entry() { llListen(22001,"",llGetOwner(),""); llListen(-22001,"",llGetOwner(),"");
        llListen(0,"",llGetOwner(),""); llListen(2147483647,"",llGetOwner(),"");
        llOwnerSay(${JSON.stringify(`@notify${option ? ':' + option : ''}=add,sit=n`)}); }
      listen(integer c,string n,key id,string m) { notices += [m]; }
    }` })
    for (const f of Object.values(pair)) f.script.start()
    expect(pair.rlva.script.global('notices')).toEqual([])
    expect(pair.rlva.avatar.viewer.restrictions.snapshot().map(r => r.rule)).toEqual(['sit'])
    expect(pair.rlva.avatar.viewer.commandLog[0]).toMatchObject({ status: 'unsupported' })
    expect(pair.rlv.avatar.viewer.restrictions.snapshot()[0]?.rule).toBe('notify' + (option ? ':' + option : ''))
    expect(pair.rlv.script.global('notices')).toEqual(['-22001', '2147483647', '22001;;sit'].includes(option) ? ['/sit=n'] : [])
  })
}

it('does not create notifications for malformed syntax or wrong parameter kinds', async () => {
  expect(await notifications('@notify:22001=add,=n,sit=invalid,sit=force,getstatus=22002')).toEqual({
    rlv: ['/=n'], rlva: ['/notify:22001=add'],
  })
})

it('keeps failed notify callbacks visible to existing subscribers', async () => {
  expect(await notifications('@notify:22001=add,notify:0=add,notify:bad=rem,notify:22002;;sit=n')).toEqual({
    rlv: ['/notify:0=n', '/notify:bad=y', '/notify:22002;;sit=n'],
    rlva: ['/notify:22001=add', '/notify:0=add', '/notify:bad=rem', '/notify:22002;;sit=n'],
  })
})

it('removes a registration by exact wire form without duplicating identical adds', async () => {
  expect(await notifications('@notify:22001=add,notify:22001;=add,sit=n,notify:22001;=rem,sit=y')).toEqual({
    rlv: ['/notify:22001;=n', '/sit=n', '/sit=n', '/notify:22001;=y', '/notify:22001;=y', '/sit=y'],
    rlva: ['/notify:22001=add', '/notify:22001;=add', '/notify:22001;=add', '/sit=n', '/sit=n', '/notify:22001;=rem', '/sit=y'],
  })
})

const listenerSource = `list notices; default {
 state_entry() { llListen(22001,"",llGetOwner(),""); }
 touch_start(integer n) { llOwnerSay(llGetObjectDesc()); }
 listen(integer c,string n,key id,string m) { notices += [m]; }
}`

async function emitter(f: Awaited<ReturnType<typeof loadRlvPair>>['rlv'], source: string) {
  const loaded = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
    prims: [{ scripts: [{ name: 'emitter', source: { source } }] }] })
  const script = loaded.scripts.emitter!
  script.start()
  return script
}
function command(script: Awaited<ReturnType<typeof emitter>>, text: string) {
  script.host.description = text
  script.fire('touch_start', { num_detected: 1 })
}

// In-world: a second prim's remove leaves the registration active; reset and
// script removal preserve it; derez preserves it immediately, then collection
// removes it within 35 seconds (same viewer/grid/date as above).
it('scopes registration removal and clear to the registering prim', async () => {
  const pair = await loadRlvPair({ source: listenerSource })
  for (const f of Object.values(pair)) {
    f.script.start()
    const subscriber = await emitter(f, `default { state_entry() { llOwnerSay("@notify:22001=add"); }
      touch_start(integer n) { llOwnerSay("@clear"); } }`)
    command(f.script, '@notify:22001=rem,sit=n,sit=y,clear')
    const first = f.script.global('notices') as string[]
    expect(first.slice(-3)).toEqual(['/sit=n', '/sit=y', '/clear'])
    subscriber.fire('touch_start', { num_detected: 1 })
    const before = (f.script.global('notices') as string[]).length
    command(f.script, '@sit=n,sit=y')
    expect((f.script.global('notices') as string[]).length).toBe(before)
  }
})

it('keeps subscriptions across script reset, state change and removal, then collects derezzed emitters', async () => {
  const pair = await loadRlvPair({ source: listenerSource })
  for (const f of Object.values(pair)) {
    f.script.start()
    const subscriber = await emitter(f, `default {
      state_entry() { if(llGetObjectDesc() == "") { llOwnerSay("@notify:22001=add"); llSetObjectDesc("seeded"); llResetScript(); } }
      touch_start(integer n) { state other; }
    } state other { state_entry() { llRemoveInventory(llGetScriptName()); } }`)
    command(f.script, '@sit=n,sit=y')
    expect((f.script.global('notices') as string[]).slice(-2)).toEqual(['/sit=n', '/sit=y'])
    subscriber.fire('touch_start', { num_detected: 1 })
    expect(subscriber.host.scripts).toEqual([])
    command(f.script, '@sit=n,sit=y')
    expect((f.script.global('notices') as string[]).slice(-2)).toEqual(['/sit=n', '/sit=y'])
    subscriber.linkset.remove()
    command(f.script, '@sit=n,sit=y')
    expect((f.script.global('notices') as string[]).slice(-2)).toEqual(['/sit=n', '/sit=y'])
    f.world.clock.advance(35000)
    f.script.advanceTime(0)
    expect(f.avatar.viewer.restrictions.snapshot()).toEqual([])
    const before = (f.script.global('notices') as string[]).length
    command(f.script, '@sit=n,sit=y')
    expect((f.script.global('notices') as string[]).length).toBe(before)
  }
})

// In-world: collecting a separate sit=n issuer -> /clear only to a surviving
// subscriber, without /sit=y (same viewer/grid/date as above).
it('notifies collection through clear while suppressing RLVa internal removals', async () => {
  const pair = await loadRlvPair({ source: listenerSource })
  for (const [profile, f] of Object.entries(pair)) {
    f.script.start()
    command(f.script, '@notify:22001=add')
    const restricted = await emitter(f, `default { state_entry() { llOwnerSay("@sit=n,unsit=n"); } }`)
    const before = (f.script.global('notices') as string[]).length
    restricted.linkset.remove()
    f.world.clock.advance(35000)
    f.script.advanceTime(0)
    expect((f.script.global('notices') as string[]).slice(before)).toEqual(profile === 'rlv'
      ? ['/clear', '/sit=y', '/unsit=y'] : ['/clear'])
    expect(f.avatar.viewer.restrictions.snapshot().map(r => r.rule)).toEqual(['notify:22001'])
  }
})

it('leaves disabled mode inert', async () => {
  const world = new World(); world.addRegion('off', { x: 0, y: 0 })
  const avatar = world.addAvatar({ username: 'off', region: 'off' })
  const f = await loadLinkset({ world, region: 'off', owner: avatar.key, prims: [{ scripts: [{ name: 'off',
    source: { source: `default { state_entry() { llOwnerSay("@notify:22001=add,sit=n,clear"); } }` } }] }] })
  f.scripts.off!.start()
  expect(avatar.viewer.commandLog).toEqual([])
  expect(avatar.viewer.restrictions.snapshot()).toEqual([])
})

it('advertises notification registrations and their supported boundaries', () => {
  const entry = RLV_MANIFEST.commands.find(e => e.id === 'notifications')!
  for (const profile of ['rlv', 'rlva'] as const) {
    expect(entry.profiles[profile].support).toBe('enforced')
    expect(entry.profiles[profile].commandForms).toContainEqual({ behaviour: 'notify', type: 'add', support: 'enforced', option: 'any' })
  }
})

for (const reverse of [false, true]) it(`orders subscribing UUIDs with reverse registration ${reverse}`, async () => {
  const pair = await loadRlvPair({ source: `list notices; default {
    state_entry() { llListen(22001,"",llGetOwner(),""); llListen(22002,"",llGetOwner(),""); }
    touch_start(integer n) { llOwnerSay(llGetObjectDesc()); }
    listen(integer c,string n,key id,string m) { if(m == "/sit=n") notices += [c]; }
  }` })
  for (const f of Object.values(pair)) {
    f.script.start()
    const loaded = await loadLinkset({ world: f.world, region: f.avatar.region, owner: f.avatar.key,
      prims: [{ key: 'ffffffff-ffff-ffff-ffff-ffffffffffff', scripts: [{ name: 'last', source: { source: `default {
        state_entry() { llOwnerSay("@notify:22002=add,notify:22001=add"); }
      }` } }] }, { key: '00000000-0000-0000-0000-000000000001', scripts: [{ name: 'first', source: { source: `default {
        state_entry() { llOwnerSay("@notify:22001=add"); }
      }` } }] }] })
    for (const name of reverse ? ['first', 'last'] : ['last', 'first']) loaded.scripts[name]!.start()
    command(f.script, '@sit=n')
    expect(f.script.global('notices')).toEqual([22001, 22002, 22001])
  }
})

it('keeps notifications independent of sendchannel action restrictions', async () => {
  expect(await notifications('@sendchannel=n,notify:22001=add,sit=n,sit=y')).toEqual({
    rlv: ['/sit=n', '/sit=y'], rlva: ['/notify:22001=add', '/sit=n', '/sit=y'],
  })
})

for (const replacement of ['absent', 'disabled'] as const) {
  it(`collects stale subscriptions without delivering through an ${replacement} viewer`, async () => {
    const pair = await loadRlvPair({ source: listenerSource })
    for (const f of Object.values(pair)) {
      f.script.start()
      const subscriber = await emitter(f, `default { state_entry() { llOwnerSay("@notify:22001=add,sit=n"); } }`)
      const before = f.script.global('notices')
      f.world.avatars.splice(f.world.avatars.indexOf(f.avatar), 1)
      if (replacement === 'disabled') f.world.addAvatar({ username: 'replacement', key: f.avatar.key, region: f.avatar.region })
      subscriber.linkset.remove()
      f.world.clock.advance(35000)
      f.script.advanceTime(0)
      expect(f.avatar.viewer.restrictions.snapshot()).toEqual([])
      expect(f.script.global('notices')).toEqual(before)
    }
  })
}
