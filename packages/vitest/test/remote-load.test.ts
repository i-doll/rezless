import { expect, it } from 'vitest'
import { loadLinkset, loadScript, World, makeInventoryItem, InventoryType, PERM_COPY } from '../src/index.js'

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

// These permission fixtures follow the wiki. Cross-owner permissions and obtaining a no-copy
// script need another owner; the one-avatar headless session cannot measure them.
it('denies foreign-owner loading without a modification-grant fixture', async () => {
  const { target, sender, world } = await remote()
  const foreign = await loadLinkset({ world, region: 'load', owner: '00000000-0000-0000-0000-000000000001', prims: [{}] })
  foreign.prims[0]!.remoteScriptAccessPin = 42
  const loader = await loadScript({ host: sender.prims[0]!, source: `default{state_entry(){llRemoteLoadScriptPin("${foreign.prims[0]!.key}","payload",42,TRUE,1);}}` })
  loader.start()
  expect(foreign.prims[0]!.inventory).toHaveLength(0)
  expect(target.prims[0]!.inventory).toHaveLength(0)
})

it('leaves a no-copy source script in place and refuses the copy', async () => {
  const { sender, target, script, payload } = await remote()
  const item = sender.prims[0]!.inventory.find(i => i.script === payload)!
  item.permMask = { ...item.permMask, owner: item.permMask.owner & ~PERM_COPY }
  script.start()
  expect(target.prims[0]!.inventory).toHaveLength(0)
  expect(sender.prims[0]!.findScript('payload')).toBe(payload)
  expect(script.chat.some(c => c.channel === 2147483647)).toBe(true)
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
