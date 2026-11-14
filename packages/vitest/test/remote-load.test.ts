import { describe, expect, it } from 'vitest'
import { loadLinkset, loadScript, World, makeInventoryItem, InventoryType, NULL_KEY } from '../src/index.js'

// In-world: batch.py, Aditi / SLua Tideland, Mono, 2026-11-01.
// Evidence: /tmp/issue-154-ray/results.jsonl.
// https://wiki.secondlife.com/wiki/LlRemoteLoadScriptPin
it('copies an executable script to a prim with a matching PIN', async () => {
  const world = new World()
  world.addRegion('load', { x: 0, y: 0 })
  const target = await loadLinkset({ world, region: 'load', prims: [{}] })
  target.prims[0]!.remoteScriptAccessPin = 42
  const sender = await loadLinkset({ world, region: 'load', prims: [{ scripts: [
    { name: 'payload', source: { source: 'integer param; default {state_entry(){param=llGetStartParameter();}}' } },
    { name: 'send', source: { source: `default {state_entry(){llRemoteLoadScriptPin("${target.prims[0]!.key}","payload",42,TRUE,123);}}` } },
  ] }] })
  sender.scripts['send']!.start()
  sender.linkset.advanceTime(3000)
  expect(target.prims[0]!.findScript('payload')?.global('param')).toBe(123)
})

async function remote(pin = 42, running = 1, param = 123, name = 'payload', receiverPin = 42) {
  const world = new World()
  world.addRegion('load', { x: 0, y: 0 })
  const target = await loadLinkset({ world, region: 'load', prims: [{}] })
  target.prims[0]!.remoteScriptAccessPin = receiverPin
  const sender = await loadLinkset({ world, region: 'load', prims: [{ scripts: [
    { name: 'payload', source: { source: 'integer entries; integer param; integer rez; default {state_entry(){++entries;param=llGetStartParameter();}on_rez(integer p){rez=p;}}' } },
    { name: 'send', source: { source: `integer done;default {state_entry(){llRemoteLoadScriptPin("${target.prims[0]!.key}","${name}",${pin},${running},${param});done=1;}}` } },
  ] }] })
  return { world, target, sender, script: sender.scripts['send']!, payload: sender.scripts['payload']! }
}

it('preserves the source script and copies fresh globals on replacement', async () => {
  const { target, script, payload } = await remote()
  payload.start()
  payload.setGlobal('entries', 9)
  script.start()
  const copy = target.prims[0]!.findScript('payload')!
  expect(copy).not.toBe(payload)
  expect(copy.global('entries')).toBe(1)
  expect(payload.global('entries')).toBe(9)
  script.reset()
  expect(copy.dead).toBe(true)
  expect(target.prims[0]!.inventory.filter(i => i.name === 'payload')).toHaveLength(1)
  expect(target.prims[0]!.findScript('payload')!.global('entries')).toBe(1)
})

it.each([0, 41])('refuses PIN %i and leaves the receiver inventory alone', async pin => {
  const { target, script } = await remote(pin)
  script.start()
  expect(target.prims[0]!.findScript('payload')).toBeUndefined()
  expect(script.chat.some(c => c.channel === 2147483647)).toBe(true)
})

it('allows a matching negative PIN', async () => {
  const { target, script } = await remote(-42, -1, -123, 'payload', -42)
  script.start()
  expect(target.prims[0]!.findScript('payload')!.global('param')).toBe(-123)
})

it('keeps a stopped script dormant until enabled', async () => {
  const { target, script } = await remote(42, 0, 456)
  script.start()
  const copy = target.prims[0]!.findScript('payload')!
  expect(copy.running).toBe(false)
  expect(copy.global('entries')).toBe(0)
  expect(copy.startParameter).toBe(456)
})

it('rejects zero even when the receiver PIN is zero', async () => {
  const { target, script } = await remote(0, 1, 123, 'payload', 0)
  script.start()
  expect(target.prims[0]!.inventory).toHaveLength(0)
})

it('reports a missing inventory script', async () => {
  const { target, script } = await remote(42, 1, 123, 'missing')
  script.start()
  expect(target.prims[0]!.inventory).toHaveLength(0)
  expect(script.chat.some(c => c.channel === 2147483647 && c.text.includes('missing'))).toBe(true)
})

it('starts with state_entry and supplies no on_rez event', async () => {
  const { target, script } = await remote()
  script.start()
  expect(target.prims[0]!.findScript('payload')!.global('entries')).toBe(1)
  expect(target.prims[0]!.findScript('payload')!.global('rez')).toBe(0)
  expect(script.now).toBe(3000)
  expect(script.global('done')).toBe(1)
})

// In-world: follow.py -> wrong type uses Missing inventory item, self with matching PIN uses
// Unable to add item!, invalid/absent targets are silent; delayed completion is ~3 seconds.
// changed.py -> existing receiver script gets CHANGED_INVENTORY; new copy does not get it.
// Aditi, SLua Tideland, Mono, 2026-11-01, /tmp/issue-154-ray/.
it('activates a stopped copy once and clears its start parameter on reset', async () => {
  const { target, script } = await remote(42, 0, 456)
  const controller = await loadScript({ host: target.prims[0]!, source: 'default{touch_start(integer n){llSetScriptState("payload",TRUE);}touch_end(integer n){llResetOtherScript("payload");}}' })
  controller.start()
  script.start()
  controller.fire('touch_start')
  const copy = target.prims[0]!.findScript('payload')!
  expect(copy.global('entries')).toBe(1)
  expect(copy.global('param')).toBe(456)
  copy.fire('touch_start')
  expect(copy.global('entries')).toBe(1)
  controller.fire('touch_end')
  expect(copy.global('param')).toBe(0)
})

it('discards saved globals, state, timers and listens while loading', async () => {
  const { target, sender } = await remote()
  const source = await loadScript({ host: sender.prims[0]!, scriptName: 'stateful', source: `integer n;default{state_entry(){++n;}touch_start(integer x){state other;}}state other{state_entry(){n=99;llSetTimerEvent(5);llListen(42,"",NULL_KEY,"");}}` })
  source.fire('touch_start')
  expect(source.currentState).toBe('other')
  const loader = await loadScript({ host: sender.prims[0]!, source: `default{state_entry(){llRemoteLoadScriptPin("${target.prims[0]!.key}","stateful",42,FALSE,17);}}` })
  loader.start()
  const copy = target.prims[0]!.findScript('stateful')!
  expect(copy.currentState).toBe('default')
  expect(copy.global('n')).toBe(0)
  expect(copy.timerInterval).toBe(0)
  expect(copy.listens).toEqual([])
  expect(source.global('n')).toBe(99)
  const controller = await loadScript({ host: target.prims[0]!, source: 'default{state_entry(){llSetScriptState("stateful",TRUE);}}' })
  controller.start()
  expect(copy.global('n')).toBe(1)
})

it('reports the measured error when the inventory name is not a script', async () => {
  const { sender, script, target } = await remote(42, 1, 123, 'wrong')
  sender.prims[0]!.addInventory(makeInventoryItem({ name: 'wrong', type: InventoryType.NOTECARD }))
  script.start()
  expect(script.chat.map(c => c.text)).toContain("Missing inventory item 'wrong'.")
  expect(target.prims[0]!.inventory).toHaveLength(0)
  expect(script.now).toBe(3000)
})

it('refuses loading into the caller itself even with a matching PIN', async () => {
  const s = await loadScript({ scriptName: 'self', source: 'integer done;default{state_entry(){llSetRemoteScriptAccessPin(42);llRemoteLoadScriptPin(llGetKey(),llGetScriptName(),42,TRUE,123);done=1;}}' })
  s.start()
  expect(s.chat.map(c => c.text)).toContain('Unable to add item!')
  expect(s.global('done')).toBe(1)
  expect(s.host.inventory).toHaveLength(1)
})

it.each(['bad', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001'])('silently refuses unavailable target %s and retains the delay', async key => {
  const s = await loadScript({ scriptName: 'source', source: `integer done;default{state_entry(){llRemoteLoadScriptPin("${key}",llGetScriptName(),42,TRUE,123);done=1;}}` })
  s.start()
  expect(s.chat).toEqual([])
  expect(s.now).toBe(3000)
  expect(s.global('done')).toBe(1)
})

// In-world: replacement.py -> target notecard became payload script, inventory count stayed 2.
it('replaces a same-named non-script item and notifies existing receiver scripts', async () => {
  const { target, script } = await remote()
  target.prims[0]!.addInventory(makeInventoryItem({ name: 'payload', type: InventoryType.NOTECARD }))
  const observer = await loadScript({ host: target.prims[0]!, source: 'integer changes;default{changed(integer c){changes=c;}}' })
  observer.start()
  script.start()
  expect(target.prims[0]!.inventory.filter(i => i.name === 'payload')).toHaveLength(1)
  expect(target.prims[0]!.findScript('payload')!.global('param')).toBe(123)
  expect(observer.global('changes')).toBe(1)
})

// In-world, two avatars (Aditi, SLua Tideland, 2026-11-14): a load onto the other avatar's object
// with its matching PIN -> the illegal-load error. A no-copy script moves, in two-avatar-ownership.test.ts.
it('denies foreign-owner loading even with a matching PIN', async () => {
  const { target, sender, world } = await remote()
  const foreign = await loadLinkset({ world, region: 'load', owner: '00000000-0000-0000-0000-000000000001', prims: [{}] })
  foreign.prims[0]!.remoteScriptAccessPin = 42
  const loader = await loadScript({ host: sender.prims[0]!, source: `default{state_entry(){llRemoteLoadScriptPin("${foreign.prims[0]!.key}","payload",42,TRUE,1);}}` })
  loader.start()
  expect(foreign.prims[0]!.inventory).toHaveLength(0)
  expect(target.prims[0]!.inventory).toHaveLength(0)
  expect(loader.chat.filter(c => c.channel === 2147483647).map(c => c.text)).toEqual([`Task '${sender.prims[0]!.name}' trying to illegally load script onto task 'Object'!`])
})

// In-world: replacement.py -> 3.044656 / 3.044454 s while the loaded handler slept 10 s.
it('lets the caller finish its three-second delay while the loaded script still sleeps', async () => {
  const { target, sender } = await remote()
  await loadScript({ host: sender.prims[0]!, scriptName: 'sleeper', source: 'integer ready;default{state_entry(){llSleep(10);ready=1;}}' })
  const loader = await loadScript({ host: sender.prims[0]!, source: `integer done;default{state_entry(){llRemoteLoadScriptPin("${target.prims[0]!.key}","sleeper",42,TRUE,0);done=1;}}` })
  loader.start()
  expect(loader.now).toBe(3000)
  expect(loader.global('done')).toBe(1)
  const copy = target.prims[0]!.findScript('sleeper')!
  expect(copy.global('ready')).toBe(0)
  loader.advanceTime(7000)
  expect(copy.global('ready')).toBe(1)
})

it('loads into the requested child prim using that prim\'s PIN', async () => {
  const { world, sender } = await remote()
  const receiver = await loadLinkset({ world, region: 'load', prims: [{}, {}] })
  receiver.prims[0]!.remoteScriptAccessPin = 42
  receiver.prims[1]!.remoteScriptAccessPin = -99
  const loader = await loadScript({ host: sender.prims[0]!, source: `default{state_entry(){llRemoteLoadScriptPin("${receiver.prims[1]!.key}","payload",-99,TRUE,88);}}` })
  loader.start()
  expect(receiver.prims[0]!.inventory).toHaveLength(0)
  expect(receiver.prims[1]!.findScript('payload')!.global('param')).toBe(88)
})

it('does not manufacture executable code for a passive script-asset fixture', async () => {
  const { sender, target, script } = await remote(42, 1, 123, 'asset')
  sender.prims[0]!.addInventory(makeInventoryItem({ name: 'asset', type: InventoryType.SCRIPT }))
  script.start()
  expect(target.prims[0]!.inventory).toHaveLength(0)
  expect(sender.prims[0]!.inventory.some(i => i.name === 'asset')).toBe(true)
})

it('finishes installing the script before other queued handlers can inspect it', async () => {
  const { target, script } = await remote()
  const observer = await loadScript({ host: target.prims[0]!, source: 'integer running=-1;default{touch_start(integer n){running=llGetScriptState("payload");}}' })
  observer.start()
  observer.clockView.schedule(observer.now, 'touch_start')
  script.start()
  expect(observer.global('running')).toBe(1)
})

// https://wiki.secondlife.com/wiki/Changed
// In-world, for every test in this block: a two-prim target linkset with
// logging scripts in the root and one in the child, and a separate loader
// object with the same owner calling llRemoteLoadScriptPin. Each script said
// every `changed` value with llGetInventoryNumber(INVENTORY_ALL) and the time.
// Aditi beta grid, SLua Tideland, Firestorm viewer, Mono, 2026-11-13.
describe('changed(CHANGED_INVENTORY) from a remote load', () => {
  const observer = `list seen; list counts; list times; integer entries; integer param; integer seenAtWake = -1;
    default {
      state_entry() { ++entries; param = llGetStartParameter(); }
      changed(integer c) { seen += c; counts += llGetInventoryNumber(INVENTORY_ALL); times += llRound(llGetTime()); }
      link_message(integer s, integer n, string m, key k) {
        if (m == "nap") llSleep((float)n);
        else if (m == "naps") { integer i; for (; i < n / 100; ++i) llSleep((float)(n % 100)); }
        else if (m == "crash") { integer zero; integer q = 1 / zero; }
        else return;
        seenAtWake = llGetListLength(seen);
      }
    }`
  const control = `default { link_message(integer s, integer n, string m, key k) {
    if (m == "state") llSetScriptState((string)k, n);
    else if (m == "reset") llResetOtherScript((string)k);
  } }`
  const script = (name: string, source = observer) => ({ name, source: { source, filename: `${name}.lsl` } })
  const notecard = (name: string) => makeInventoryItem({ name, type: InventoryType.NOTECARD, notecardLines: ['probe'] })

  /** `body` runs when the loader is touched; ROOT and CHILD stand for the target prims' keys. */
  async function rig(body: string, pins = true) {
    const world = new World()
    world.addRegion('load', { x: 0, y: 0 })
    const target = await loadLinkset({ world, region: 'load', prims: [
      { name: 'Target', inventory: [notecard('v1')], scripts: [script('a'), script('b'), script('ctl', control)] },
      { name: 'Child', scripts: [script('c')] },
    ] })
    const [root, child] = target.prims as [typeof target.prims[0], typeof target.prims[0]]
    if (pins) {
      root.remoteScriptAccessPin = 42
      child.remoteScriptAccessPin = 43
    }
    const send = `default { touch_start(integer n) { ${body.replaceAll('ROOT', `"${root.key}"`).replaceAll('CHILD', `"${child.key}"`)} } }`
    const loader = await loadLinkset({ world, region: 'load', prims: [
      { name: 'Loader', inventory: [notecard('nc')], scripts: [script('payload'), script('payload2'), script('send', send)] },
    ] })
    for (const s of [...Object.values(target.scripts), ...Object.values(loader.scripts)]) s.start()
    const tell = (m: string, n = 0, k = '') => target.scripts['ctl']!.fire('link_message', { sender_num: 1, num: n, str: m, id: k })
    const nap = (m: string, seconds: number) => {
      target.linkset.clock.schedule(target.scripts['a']!, target.linkset.clock.now, 'link_message', { sender_num: 1, num: seconds, str: m, id: NULL_KEY })
      target.linkset.advanceTime(0)
    }
    const errors = () => loader.scripts['send']!.chat.filter(c => c.channel === 2147483647).map(c => c.text)
    return { target, loader, root, child, a: target.scripts['a']!, b: target.scripts['b']!, c: target.scripts['c']!, tell, nap, errors, load: () => loader.linkset.touch(1) }
  }

  it('reaches each running script in the target prim once, not the loaded script and not another prim', async () => {
    // In-world: a load of a new script into the root, running TRUE -> every
    // running script in the root said changed(1) once in the frame of the
    // call, with the new script counted; the loaded script said state_entry
    // with its start parameter and no changed; the child's script said nothing.
    const { root, a, b, c, load } = await rig('llRemoteLoadScriptPin(ROOT, "payload", 42, TRUE, 5);')
    load()
    expect(a.global('seen')).toEqual([1])
    expect(a.global('counts')).toEqual([5])
    expect(a.global('times')).toEqual([0])
    expect(b.global('seen')).toEqual([1])
    expect(b.global('counts')).toEqual([5])
    expect(b.global('times')).toEqual([0])
    expect(c.global('seen')).toEqual([])
    const copy = root.findScript('payload')!
    expect(copy.global('entries')).toBe(1)
    expect(copy.global('param')).toBe(5)
    expect(copy.global('seen')).toEqual([])
  })

  it('sends the same single event when the load replaces a running script of that name', async () => {
    // In-world: the same load again, start parameter 6 -> changed(1) once per
    // running script with the item count unchanged; the fresh copy said
    // state_entry with parameter 6 and no changed.
    const { root, a, b, load } = await rig('llRemoteLoadScriptPin(ROOT, "payload", 42, TRUE, 5); llRemoteLoadScriptPin(ROOT, "payload", 42, TRUE, 6);')
    load()
    expect(a.global('seen')).toEqual([1, 1])
    expect(a.global('counts')).toEqual([5, 5])
    expect(b.global('seen')).toEqual([1, 1])
    expect(root.findScript('payload')!.global('param')).toBe(6)
    expect(root.findScript('payload')!.global('seen')).toEqual([])
  })

  it('reaches only the child prim when the script is loaded into the child', async () => {
    // In-world: loads into link 2 with its own PIN (new, replacing, and not
    // running) -> the child's script said changed(1) each time, and the running
    // copy said changed(1) for the load that followed it; no root script said
    // anything.
    const { child, a, b, c, load } = await rig('llRemoteLoadScriptPin(CHILD, "payload", 43, TRUE, 10); llRemoteLoadScriptPin(CHILD, "payload", 43, TRUE, 11); llRemoteLoadScriptPin(CHILD, "payload2", 43, FALSE, 12);')
    load()
    expect(c.global('seen')).toEqual([1, 1, 1])
    expect(c.global('counts')).toEqual([2, 2, 3])
    expect(child.findScript('payload2')!.running).toBe(false)
    expect(a.global('seen')).toEqual([])
    expect(b.global('seen')).toEqual([])
    expect(child.findScript('payload')!.global('seen')).toEqual([1])
  })

  it('tells the prim about a script loaded stopped, and that script hears nothing until it runs', async () => {
    // In-world: a load with running FALSE -> the root's running scripts said
    // changed(1); llGetScriptState of the copy was 0. The owner then dropped a
    // notecard in -> the copy said nothing. llSetScriptState(TRUE) -> it said
    // state_entry with the load's start parameter and no changed. The next
    // notecard dropped in -> it said changed(1).
    const { root, a, tell, load } = await rig('llRemoteLoadScriptPin(ROOT, "payload", 42, FALSE, 7);')
    load()
    const copy = root.findScript('payload')!
    expect(a.global('seen')).toEqual([1])
    expect(copy.running).toBe(false)
    root.addInventory(notecard('x1'))
    tell('state', 1, 'payload')
    root.linkset!.advanceTime(100)
    expect(copy.global('entries')).toBe(1)
    expect(copy.global('param')).toBe(7)
    expect(copy.global('seen')).toEqual([])
    root.addInventory(notecard('x2'))
    expect(copy.global('seen')).toEqual([1])
  })

  it('does not tell a copy that was loaded stopped about a later load', async () => {
    // In-world: a load with running FALSE, then a load of another script 3 s
    // later, then llSetScriptState(TRUE) on the first copy -> it said
    // state_entry with its own start parameter and no changed. The next load
    // -> it said changed(1).
    const { root, a, tell, load } = await rig('llRemoteLoadScriptPin(ROOT, "payload2", 42, FALSE, 80); llRemoteLoadScriptPin(ROOT, "payload", 42, TRUE, 81);')
    load()
    const copy = root.findScript('payload2')!
    expect(a.global('seen')).toEqual([1, 1])
    expect(copy.running).toBe(false)
    tell('state', 1, 'payload2')
    root.linkset!.advanceTime(100)
    expect(copy.global('entries')).toBe(1)
    expect(copy.global('param')).toBe(80)
    expect(copy.global('seen')).toEqual([])
    const next = await loadScript({ host: root.linkset!.peers.find(l => l !== root.linkset)!.prims[0]!, scriptName: 'next', source: `default { state_entry() { llRemoteLoadScriptPin("${root.key}", "payload", 42, TRUE, 82); } }` })
    next.start()
    expect(copy.global('seen')).toEqual([1])
  })

  it('sends the event when a running script is replaced by a stopped one and back', async () => {
    // In-world: running FALSE over a running script of that name -> changed(1)
    // to the others, llGetScriptState 0 and no state_entry; running TRUE over
    // that stopped one -> changed(1) to the others and state_entry with the
    // new start parameter.
    const { loader, root, a, load } = await rig('llRemoteLoadScriptPin(ROOT, "payload", 42, TRUE, 6); llRemoteLoadScriptPin(ROOT, "payload", 42, FALSE, 8);')
    load()
    expect(a.global('seen')).toEqual([1, 1])
    expect(root.findScript('payload')!.running).toBe(false)
    expect(root.findScript('payload')!.global('entries')).toBe(0)
    const back = await loadScript({ host: loader.prims[0]!, scriptName: 'back', source: `default { state_entry() { llRemoteLoadScriptPin("${root.key}", "payload", 42, TRUE, 9); } }` })
    back.start()
    expect(a.global('seen')).toEqual([1, 1, 1])
    expect(a.global('counts')).toEqual([5, 5, 5])
    expect(root.findScript('payload')!.running).toBe(true)
    expect(root.findScript('payload')!.global('entries')).toBe(1)
    expect(root.findScript('payload')!.global('param')).toBe(9)
    expect(root.findScript('payload')!.global('seen')).toEqual([])
  })

  it('is not heard by a stopped script, even after it restarts', async () => {
    // In-world: llSetScriptState(FALSE) on a root logging script, a load into
    // the root, then llSetScriptState(TRUE) -> that script said nothing while
    // the others said changed(1). The next load -> it said changed(1).
    const { target, a, b, tell, load } = await rig('llRemoteLoadScriptPin(ROOT, "payload", 42, TRUE, 13);')
    tell('state', 0, 'a')
    expect(a.running).toBe(false)
    load()
    tell('state', 1, 'a')
    target.linkset.advanceTime(100)
    expect(a.running).toBe(true)
    expect(a.global('seen')).toEqual([])
    expect(b.global('seen')).toEqual([1])
    load()
    expect(a.global('seen')).toEqual([1])
  })

  it('is not heard by a crashed script, even after it is reset', async () => {
    // In-world: a root logging script divided by zero (llGetScriptState 0), a
    // load into the root, then llResetOtherScript -> it ran state_entry and
    // said no changed, while the others said changed(1). The next load -> it
    // said changed(1).
    const { target, a, b, tell, load } = await rig('llRemoteLoadScriptPin(ROOT, "payload", 42, TRUE, 13);')
    expect(() => a.fire('link_message', { sender_num: 1, num: 0, str: 'crash', id: NULL_KEY })).toThrow('Math Error')
    expect(a.running).toBe(false)
    load()
    tell('reset', 0, 'a')
    target.linkset.advanceTime(100)
    expect(a.running).toBe(true)
    expect(a.global('entries')).toBe(1)
    expect(a.global('seen')).toEqual([])
    expect(b.global('seen')).toEqual([1])
    load()
    expect(a.global('seen')).toEqual([1])
  })

  it('keeps an event queued during a sleep when the script is stopped before the sleep ends', async () => {
    // In-world: a load arrived 3 s into a 20 s sleep, the sleeper was stopped
    // with llSetScriptState 3 s later (llGetScriptState 0) and restarted after
    // the sleep would have ended -> on the restart it finished its handler and
    // then said changed(1).
    const { target, a, tell, nap, load } = await rig('llRemoteLoadScriptPin(ROOT, "payload", 42, TRUE, 52);')
    nap('nap', 20)
    target.linkset.advanceTime(3_000)
    load()
    tell('state', 0, 'a')
    target.linkset.advanceTime(20_000)
    expect(a.running).toBe(false)
    expect(a.global('seen')).toEqual([])
    tell('state', 1, 'a')
    target.linkset.advanceTime(100)
    expect(a.global('seen')).toEqual([1])
    expect(a.global('seenAtWake')).toBe(0)
  })

  it('is not heard by a sleeping script that was stopped before the load', async () => {
    // In-world: a script 3 s into a 20 s sleep was stopped with
    // llSetScriptState, a load arrived a second later, and the script was
    // restarted after the sleep would have ended -> it finished its handler
    // and said no changed. The next load -> it said changed(1).
    const { target, a, b, tell, nap, load } = await rig('llRemoteLoadScriptPin(ROOT, "payload", 42, TRUE, 70);')
    nap('nap', 20)
    target.linkset.advanceTime(3_000)
    tell('state', 0, 'a')
    target.linkset.advanceTime(1_000)
    load()
    expect(b.global('seen')).toEqual([1])
    target.linkset.advanceTime(20_000)
    tell('state', 1, 'a')
    target.linkset.advanceTime(100)
    expect(a.global('seenAtWake')).toBe(0)
    expect(a.global('seen')).toEqual([])
    load()
    expect(a.global('seen')).toEqual([1])
  })

  it('reaches only the receiving prim when loader and target share a linkset', async () => {
    // In-world: a script in the child loaded a script into its own root, and a
    // script in the root loaded one into its own child -> each time the
    // receiving prim's running scripts said changed(1) and the scripts in the
    // loading prim said nothing.
    const { root, child, a, b, c } = await rig('')
    await loadScript({ host: child, scriptName: 'up', source: `default { state_entry() { llRemoteLoadScriptPin("${root.key}", "c", 42, TRUE, 50); } }` }).then(s => s.start())
    expect(a.global('seen')).toEqual([1])
    expect(b.global('seen')).toEqual([1])
    expect(c.global('seen')).toEqual([])
    expect(root.findScript('c')!.global('param')).toBe(50)
    await loadScript({ host: root, scriptName: 'down', source: `default { state_entry() { llRemoteLoadScriptPin("${child.key}", "b", 43, TRUE, 51); } }` }).then(s => s.start())
    expect(c.global('seen')).toEqual([1])
    expect(a.global('seen')).toEqual([1])
    expect(b.global('seen')).toEqual([1])
    expect(child.findScript('b')!.global('param')).toBe(51)
  })

  it('follows the same rule for an SLua script in the target prim', async () => {
    // In-world: SLua scripts in the root with an LLEvents "changed" handler.
    // An idle one said changed(1) for each load. Stopped with
    // llSetScriptState, it said nothing for a load, nor after its restart; the
    // next load reached it. One asleep 20 s in a handler (ll.Sleep) said
    // changed(1) once after the handler for two loads made during the sleep.
    const { target, root, tell, load } = await rig('llRemoteLoadScriptPin(ROOT, "payload", 42, TRUE, 60); llRemoteLoadScriptPin(ROOT, "payload2", 42, TRUE, 61);')
    const slua = `LLEvents:on("changed", function(c) ll.Say(7, "changed " .. tostring(c)) end)
      LLEvents:on("link_message", function(s, n, m, id) if m == "nap" then ll.Sleep(n) ll.Say(7, "woke") end end)`
    const idle = await loadScript({ host: root, scriptName: 'lua', source: slua, language: 'slua', filename: 'lua.luau' })
    const sleeper = await loadScript({ host: root, scriptName: 'lua2', source: slua, language: 'slua', filename: 'lua2.luau' })
    idle.start()
    sleeper.start()
    const said = (s: typeof idle) => s.chat.filter(c => c.channel === 7).map(c => c.text)
    target.linkset.clock.schedule(sleeper, target.linkset.clock.now, 'link_message', { sender_num: 1, num: 20, str: 'nap', id: NULL_KEY })
    target.linkset.advanceTime(2_000)
    load()
    expect(said(idle)).toEqual(['changed 1', 'changed 1'])
    expect(said(sleeper)).toEqual([])
    target.linkset.advanceTime(13_000)
    expect(said(sleeper)).toEqual(['woke', 'changed 1'])
    tell('state', 0, 'lua')
    load()
    tell('state', 1, 'lua')
    target.linkset.advanceTime(100)
    expect(said(idle)).toEqual(['changed 1', 'changed 1'])
    load()
    expect(said(idle)).toEqual(['changed 1', 'changed 1', 'changed 1', 'changed 1'])
  })

  it('is not heard by a script the test has not started', async () => {
    // Harness-only state with nothing to measure in-world. Like an owner
    // edit in this harness, a gift and a load skip a script that nothing has
    // started, so its first event is still state_entry.
    const { root, b, load } = await rig('llGiveInventory(ROOT, "nc"); llRemoteLoadScriptPin(ROOT, "payload", 42, TRUE, 5);')
    const late = await loadScript({ host: root, scriptName: 'late', source: observer })
    load()
    expect(b.global('seen')).toEqual([1, 1])
    late.start()
    root.linkset!.advanceTime(100)
    expect(late.global('entries')).toBe(1)
    expect(late.global('seen')).toEqual([])
    load()
    expect(late.global('seen')).toEqual([1, 1])
  })

  it('gives a sleeping script one event after its handler for one load', async () => {
    // In-world: a root script slept 22 s in a handler and one load arrived 3 s
    // in -> the idle scripts said changed(1) at once; the sleeper said
    // changed(1) once, right after its handler ended.
    const { target, a, b, nap, load } = await rig('llRemoteLoadScriptPin(ROOT, "payload", 42, TRUE, 20);')
    nap('nap', 22)
    target.linkset.advanceTime(3_000)
    load()
    expect(b.global('seen')).toEqual([1])
    expect(b.global('times')).toEqual([3])
    expect(a.global('seen')).toEqual([])
    target.linkset.advanceTime(16_000)
    expect(a.global('seen')).toEqual([1])
    expect(a.global('times')).toEqual([22])
    expect(a.global('seenAtWake')).toBe(0)
  })

  it('merges three loads during one sleep into one event, while an idle script gets three', async () => {
    // In-world: three loads from one handler (3 s apart, the call's own
    // delay), each replacing a script already in the root, during one 22 s
    // sleep -> the sleeper said changed(1) once after its handler; each idle
    // script said changed(1) three times, once per load as it happened.
    const { target, loader, root, a, b, nap, load } = await rig('llRemoteLoadScriptPin(ROOT, "payload", 42, TRUE, 21); llRemoteLoadScriptPin(ROOT, "payload2", 42, TRUE, 22); llRemoteLoadScriptPin(ROOT, "payload", 42, TRUE, 23);')
    const before = await loadScript({ host: loader.prims[0]!, scriptName: 'before', source: `default { state_entry() { llRemoteLoadScriptPin("${root.key}", "payload", 42, TRUE, 1); llRemoteLoadScriptPin("${root.key}", "payload2", 42, TRUE, 2); } }` })
    before.start()
    for (const s of [a, b]) for (const name of ['seen', 'counts', 'times']) s.setGlobal(name, [])
    const t0 = target.linkset.clock.now
    const wake = Math.round((t0 - a.clockView.timeReferenceMs) / 1_000) + 22
    nap('nap', 22)
    target.linkset.advanceTime(2_000)
    load()
    expect(target.linkset.clock.now - t0).toBe(11_000)
    expect(b.global('seen')).toEqual([1, 1, 1])
    expect(b.global('counts')).toEqual([6, 6, 6])
    expect(a.global('seen')).toEqual([])
    target.linkset.advanceTime(11_000)
    expect(a.global('seen')).toEqual([1])
    expect(a.global('counts')).toEqual([6])
    expect(a.global('times')).toEqual([wake])
    expect(a.global('seenAtWake')).toBe(0)
  })

  it.each([[2, 10], [3, 12], [4, 8]])('gives two events for loads spread over %i sleeps of one handler', async (sleeps, seconds) => {
    // In-world: one handler slept 10 s twice, 12 s three times, or 8 s four
    // times, and one load arrived about 3 s into each sleep -> changed(1)
    // twice when the handler ended, in every case.
    const { target, a, b, nap, load } = await rig('llRemoteLoadScriptPin(ROOT, "payload", 42, TRUE, 24);')
    nap('naps', sleeps * 100 + seconds)
    target.linkset.advanceTime(3_000)
    for (let i = 0; i < sleeps; i++) {
      expect(target.linkset.clock.now).toBe(i * seconds * 1_000 + 3_000)
      load()
      if (i < sleeps - 1) target.linkset.advanceTime((seconds - 3) * 1_000)
    }
    expect(b.global('seen')).toHaveLength(sleeps)
    expect(a.global('seen')).toEqual([])
    target.linkset.advanceTime((seconds - 5) * 1_000)
    expect(a.global('seen')).toEqual([1, 1])
    expect(a.global('times')).toEqual([sleeps * seconds, sleeps * seconds])
    expect(a.global('seenAtWake')).toBe(0)
  })

  it.each([
    ['load then gift', 'llRemoteLoadScriptPin(ROOT, "payload", 42, TRUE, 30); llGiveInventory(ROOT, "nc");'],
    ['gift then load', 'llGiveInventory(ROOT, "nc"); llRemoteLoadScriptPin(ROOT, "payload", 42, TRUE, 31);'],
  ])('merges a %s during one sleep, while an idle script gets both', async (_order, body) => {
    // In-world: during one 20 s sleep the loader loaded a script and gave a
    // notecard with llGiveInventory, in either order (back to back for gift
    // then load) -> the sleeper said changed(1) once after its handler,
    // counting both; each idle script said changed(1) twice.
    const { target, a, b, nap, load } = await rig(body)
    nap('nap', 20)
    target.linkset.advanceTime(2_000)
    load()
    expect(b.global('seen')).toEqual([1, 1])
    target.linkset.advanceTime(20_000)
    expect(a.global('seen')).toEqual([1])
    expect(a.global('counts')).toEqual([6])
    expect(a.global('times')).toEqual([20])
    expect(a.global('seenAtWake')).toBe(0)
  })

  it.each([['load then drop', true], ['drop then load', false]])('merges a %s by the owner during one sleep', async (_order, loadFirst) => {
    // In-world: during one 28 s sleep the loader loaded a script and the owner
    // dropped a notecard on the root, in either order -> the sleeper said
    // changed(1) once after its handler, counting both; each idle script said
    // changed(1) twice.
    const { target, root, a, b, nap, load } = await rig('llRemoteLoadScriptPin(ROOT, "payload", 42, TRUE, 32);')
    nap('nap', 28)
    target.linkset.advanceTime(2_000)
    const steps = [load, () => { root.addInventory(notecard('x1')) }]
    for (const step of loadFirst ? steps : steps.reverse()) {
      step()
      target.linkset.advanceTime(2_000)
    }
    expect(b.global('seen')).toEqual([1, 1])
    expect(a.global('seen')).toEqual([])
    target.linkset.advanceTime(20_000)
    expect(a.global('seen')).toEqual([1])
    expect(a.global('counts')).toEqual([6])
    expect(a.global('times')).toEqual([28])
    expect(a.global('seenAtWake')).toBe(0)
  })

  it.each([
    ['a wrong PIN', 'llRemoteLoadScriptPin(ROOT, "payload", 41, TRUE, 5);', "Task 'Loader' trying to illegally load script onto task 'Target'!"],
    ['PIN 0', 'llRemoteLoadScriptPin(ROOT, "payload", 0, TRUE, 5);', "Task 'Loader' trying to illegally load script onto task 'Target'!"],
    ['a wrong PIN on the child', 'llRemoteLoadScriptPin(CHILD, "payload", 42, TRUE, 5);', "Task 'Loader' trying to illegally load script onto task 'Child'!"],
    ['a missing script', 'llRemoteLoadScriptPin(ROOT, "nosuch", 42, TRUE, 5);', "Missing inventory item 'nosuch'."],
    ['a notecard', 'llRemoteLoadScriptPin(ROOT, "nc", 42, TRUE, 5);', "Missing inventory item 'nc'."],
  ])('sends nothing when the load is refused for %s', async (_why, body, error) => {
    // In-world: each refused call said the quoted error on DEBUG_CHANNEL from
    // the loader, took its 3 s, and no script in the target said anything.
    const { target, root, child, a, c, errors, load } = await rig(body)
    load()
    expect(target.linkset.clock.now).toBe(3_000)
    expect(errors()).toEqual([error])
    expect(a.global('seen')).toEqual([])
    expect(c.global('seen')).toEqual([])
    expect(root.inventory).toHaveLength(4)
    expect(child.inventory).toHaveLength(1)
  })

  it.each([['never set', false], ['set to 42 and then back to 0', true]])('refuses any PIN for a prim whose PIN was %s', async (_state, cleared) => {
    // In-world: before the target's first llSetRemoteScriptAccessPin, and again
    // after llSetRemoteScriptAccessPin(42) then (0), loads with PIN 42 and with
    // PIN 0 each said the illegal-load error and changed nothing.
    const { target, root, a, errors, load } = await rig('llRemoteLoadScriptPin(ROOT, "payload", 42, TRUE, 5); llRemoteLoadScriptPin(ROOT, "payload", 0, TRUE, 5);', false)
    expect(root.remoteScriptAccessPin).toBe(0)
    if (cleared) {
      const setter = await loadScript({ host: root, scriptName: 'setter', source: 'default { state_entry() { llSetRemoteScriptAccessPin(42); llSetRemoteScriptAccessPin(0); } }' })
      setter.start()
      target.linkset.advanceTime(1_000)
      expect(root.remoteScriptAccessPin).toBe(0)
    }
    load()
    const error = "Task 'Loader' trying to illegally load script onto task 'Target'!"
    expect(errors()).toEqual([error, error])
    expect(root.findScript('payload')).toBeUndefined()
    expect(a.global('seen')).toEqual([])
  })

  it('reports an illegal load onto another owner\'s object when the PIN does not match', async () => {
    // The in-world target had no script, so what a script there would hear
    // was not measured; the watcher here only pins that the refusal queues
    // nothing.
    // In-world: a load aimed at an unscripted object owned by another resident
    // in the region, with a nonzero PIN and with PIN 0 -> each said the
    // illegal-load error, naming that object. With the PIN its owner set matching, the same error
    // (two avatars, 2026-11-14).
    const { loader } = await rig('')
    const world = loader.linkset.world!
    const foreign = await loadLinkset({ world, region: 'load', owner: '00000000-0000-0000-0000-000000000001', prims: [{ name: 'Object', scripts: [script('watcher')] }] })
    foreign.scripts['watcher']!.start()
    const send = await loadScript({ host: loader.prims[0]!, scriptName: 'send2', source: `default { state_entry() { llRemoteLoadScriptPin("${foreign.prims[0]!.key}", "payload", 987654321, TRUE, 5); llRemoteLoadScriptPin("${foreign.prims[0]!.key}", "payload", 0, TRUE, 5); } }` })
    send.start()
    const error = "Task 'Loader' trying to illegally load script onto task 'Object'!"
    expect(send.chat.filter(c => c.channel === 2147483647).map(c => c.text)).toEqual([error, error])
    expect(foreign.prims[0]!.inventory).toHaveLength(1)
    expect(foreign.scripts['watcher']!.global('seen')).toEqual([])
  })
})
