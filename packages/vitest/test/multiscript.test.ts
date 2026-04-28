import { describe, it, expect } from 'vitest'
import { loadLinkset } from '../src/index.js'
import { EOF, NAK } from '@lslvm/vm'

describe('multi-script linkset', () => {
  describe('LSD broadcast', () => {
    it('writer script publishes; reader script receives linkset_data event', async () => {
      const writer = `
        default {
          state_entry() { llSetTimerEvent(0); }
          touch_start(integer n) {
            llLinksetDataWrite("greeting", "hello");
          }
        }
      `
      const reader = `
        integer received = 0;
        string lastKey = "";
        default {
          linkset_data(integer action, string name, string value) {
            received = received + 1;
            lastKey = name;
          }
        }
      `
      const { linkset, scripts } = await loadLinkset({
        prims: [
          {
            name: 'P1',
            scripts: [
              { source: { source: writer, filename: 'writer.lsl' }, name: 'writer' },
              { source: { source: reader, filename: 'reader.lsl' }, name: 'reader' },
            ],
          },
        ],
      })
      scripts['writer']!.start()
      scripts['reader']!.start()
      scripts['writer']!.fire('touch_start', { num_detected: 1 })
      // The writer also receives the event (LSL broadcasts to writer too).
      expect(scripts['reader']!.global('received')).toBe(1)
      expect(scripts['reader']!.global('lastKey')).toBe('greeting')
      expect(linkset.linksetData.get('greeting')?.value).toBe('hello')
    })
  })

  describe('link_message fan-out', () => {
    it('LINK_ALL_OTHERS delivers to other prims with correct sender_num', async () => {
      const sender = `
        default {
          state_entry() {}
          touch_start(integer n) {
            llMessageLinked(LINK_ALL_OTHERS, 42, "ping", "");
          }
        }
      `
      const receiver = `
        integer gotNum = 0;
        integer gotSender = 0;
        string gotStr = "";
        default {
          link_message(integer sender, integer num, string str, key id) {
            gotSender = sender;
            gotNum = num;
            gotStr = str;
          }
        }
      `
      const { scripts } = await loadLinkset({
        prims: [
          {
            name: 'Root',
            scripts: [
              { source: { source: receiver, filename: 'r1.lsl' }, name: 'r1' },
            ],
          },
          {
            name: 'Child',
            scripts: [
              { source: { source: sender, filename: 'sender.lsl' }, name: 'sender' },
              { source: { source: receiver, filename: 'r2.lsl' }, name: 'r2' },
            ],
          },
        ],
      })
      scripts['r1']!.start()
      scripts['r2']!.start()
      scripts['sender']!.start()
      scripts['sender']!.fire('touch_start', { num_detected: 1 })
      // r1 in prim 1 receives from prim 2.
      expect(scripts['r1']!.global('gotSender')).toBe(2)
      expect(scripts['r1']!.global('gotNum')).toBe(42)
      expect(scripts['r1']!.global('gotStr')).toBe('ping')
      // r2 in prim 2 (same prim as sender) does NOT receive — LINK_ALL_OTHERS excludes the calling prim.
      expect(scripts['r2']!.global('gotNum')).toBe(0)
    })

    it('LINK_THIS delivers to siblings in the same prim including caller', async () => {
      const sender = `
        default {
          state_entry() {}
          touch_start(integer n) {
            llMessageLinked(LINK_THIS, 7, "self", "");
          }
        }
      `
      const receiver = `
        integer gotNum = 0;
        default {
          link_message(integer sender, integer num, string str, key id) {
            gotNum = num;
          }
        }
      `
      const { scripts } = await loadLinkset({
        prims: [
          {
            name: 'P1',
            scripts: [
              { source: { source: sender, filename: 's.lsl' }, name: 's' },
              { source: { source: receiver, filename: 'r.lsl' }, name: 'r' },
            ],
          },
        ],
      })
      scripts['s']!.start()
      scripts['r']!.start()
      scripts['s']!.fire('touch_start', { num_detected: 1 })
      expect(scripts['r']!.global('gotNum')).toBe(7)
    })
  })

  describe('link addressing', () => {
    it('llGetNumberOfPrims and llGetLinkNumber report linkset shape', async () => {
      const probe = `
        integer myLink = 0;
        integer total = 0;
        string root = "";
        string second = "";
        default {
          state_entry() {
            myLink = llGetLinkNumber();
            total = llGetNumberOfPrims();
            root = llGetLinkName(1);
            second = llGetLinkName(2);
          }
        }
      `
      const { scripts } = await loadLinkset({
        prims: [
          { name: 'Root', scripts: [{ source: { source: probe, filename: 'a.lsl' }, name: 'a' }] },
          { name: 'Child', scripts: [{ source: { source: probe, filename: 'b.lsl' }, name: 'b' }] },
        ],
      })
      scripts['a']!.start()
      scripts['b']!.start()
      expect(scripts['a']!.global('myLink')).toBe(1)
      expect(scripts['a']!.global('total')).toBe(2)
      expect(scripts['a']!.global('root')).toBe('Root')
      expect(scripts['a']!.global('second')).toBe('Child')
      expect(scripts['b']!.global('myLink')).toBe(2)
    })

    it('llGetLinkKey(0) on a multi-prim linkset returns NULL_KEY', async () => {
      const probe = `
        string k = "unset";
        default { state_entry() { k = (string)llGetLinkKey(0); } }
      `
      const { scripts } = await loadLinkset({
        prims: [
          { name: 'Root', scripts: [{ source: { source: probe, filename: 'a.lsl' }, name: 'a' }] },
          { name: 'Child', scripts: [{ source: { source: 'default { state_entry() {} }', filename: 'b.lsl' }, name: 'b' }] },
        ],
      })
      scripts['a']!.start()
      scripts['b']!.start()
      expect(scripts['a']!.global('k')).toBe('00000000-0000-0000-0000-000000000000')
    })

    it('lone prim reports linkNumber 0 and 1 prim', async () => {
      const probe = `
        integer myLink = 9;
        integer total = 0;
        default { state_entry() { myLink = llGetLinkNumber(); total = llGetNumberOfPrims(); } }
      `
      const { scripts } = await loadLinkset({
        prims: [{ scripts: [{ source: { source: probe, filename: 'p.lsl' }, name: 'p' }] }],
      })
      scripts['p']!.start()
      expect(scripts['p']!.global('myLink')).toBe(0)
      expect(scripts['p']!.global('total')).toBe(1)
    })
  })

  describe('inventory introspection', () => {
    it('loadLinkset propagates inventory name as scriptName so llGetScriptName matches', async () => {
      const probe = `
        string mine = "";
        default { state_entry() { mine = llGetScriptName(); } }
      `
      const { scripts } = await loadLinkset({
        prims: [
          {
            scripts: [
              { source: { source: probe, filename: 'inline.lsl' }, name: 'CustomName' },
            ],
          },
        ],
      })
      scripts['CustomName']!.start()
      expect(scripts['CustomName']!.global('mine')).toBe('CustomName')
    })

    it('llGetInventoryNumber(INVENTORY_SCRIPT) matches scripts in prim', async () => {
      const probe = `
        integer count = 0;
        string first = "";
        default { state_entry() {
          count = llGetInventoryNumber(INVENTORY_SCRIPT);
          first = llGetInventoryName(INVENTORY_SCRIPT, 0);
        } }
      `
      const { scripts } = await loadLinkset({
        prims: [
          {
            scripts: [
              { source: { source: probe, filename: 'a.lsl' }, name: 'a' },
              { source: { source: probe, filename: 'b.lsl' }, name: 'b' },
            ],
          },
        ],
      })
      scripts['a']!.start()
      expect(scripts['a']!.global('count')).toBe(2)
      expect(scripts['a']!.global('first')).toBe('a')
    })

    it('llGetInventoryAcquireTime returns ISO 8601 UTC string', async () => {
      const probe = `
        string ts = "";
        default { state_entry() { ts = llGetInventoryAcquireTime("memo"); } }
      `
      const { scripts } = await loadLinkset({
        prims: [
          {
            inventory: [
              {
                name: 'memo',
                type: 7,
                key: '00000000-0000-0000-0000-000000000123',
                creator: '00000000-0000-0000-0000-000000000000',
                description: '',
                acquireTimeMs: 1712668508000, // 2024-04-09T13:15:08Z
                permMask: { base: 0, owner: 0, group: 0, everyone: 0, next: 0 },
              },
            ],
            scripts: [{ source: { source: probe, filename: 'p.lsl' }, name: 'p' }],
          },
        ],
      })
      scripts['p']!.start()
      expect(scripts['p']!.global('ts')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
      expect(scripts['p']!.global('ts')).toBe('2024-04-09T13:15:08Z')
    })

    it('llGetNotecardLine returns EOF past the end and NAK for missing notecard', async () => {
      const probe = `
        string past = "";
        string missing = "";
        key kPast;
        key kMissing;
        default {
          state_entry() {
            kPast = llGetNotecardLine("memo", 99);
            kMissing = llGetNotecardLine("nope", 0);
          }
          dataserver(key id, string data) {
            if (id == kPast) past = data;
            if (id == kMissing) missing = data;
          }
        }
      `
      const { scripts } = await loadLinkset({
        prims: [
          {
            inventory: [
              {
                name: 'memo',
                type: 7,
                key: '00000000-0000-0000-0000-000000000123',
                creator: '00000000-0000-0000-0000-000000000000',
                description: '',
                acquireTimeMs: 0,
                permMask: { base: 0, owner: 0, group: 0, everyone: 0, next: 0 },
                notecardLines: ['only line'],
              },
            ],
            scripts: [{ source: { source: probe, filename: 'p.lsl' }, name: 'p' }],
          },
        ],
      })
      scripts['p']!.start()
      expect(scripts['p']!.global('past')).toBe(EOF)
      expect(scripts['p']!.global('missing')).toBe(NAK)
    })

    it('llGetNotecardLine reads notecard inventory via dataserver', async () => {
      const probe = `
        string got = "";
        key reqKey = NULL_KEY;
        default {
          state_entry() {
            reqKey = llGetNotecardLine("memo", 1);
          }
          dataserver(key id, string data) {
            if (id == reqKey) got = data;
          }
        }
      `
      const { scripts } = await loadLinkset({
        prims: [
          {
            inventory: [
              {
                name: 'memo',
                type: 7,
                key: '00000000-0000-0000-0000-000000000123',
                creator: '00000000-0000-0000-0000-000000000000',
                description: '',
                acquireTimeMs: 0,
                permMask: { base: 0, owner: 0, group: 0, everyone: 0, next: 0 },
                notecardLines: ['line zero', 'line one', 'line two'],
              },
            ],
            scripts: [{ source: { source: probe, filename: 'p.lsl' }, name: 'p' }],
          },
        ],
      })
      scripts['p']!.start()
      expect(scripts['p']!.global('got')).toBe('line one')
    })

    it.each([
      ['llGetNotecardLine', 'llGetNotecardLine("memo", 0);'],
      ['llGetNumberOfNotecardLines', 'llGetNumberOfNotecardLines("memo");'],
    ])('%s schedules dataserver after the throttle delay (issue #32)', async (_name, call) => {
      // Each builtin must schedule its dataserver event after the kwdb
      // throttle delay, not at the pre-call clock — otherwise the queued
      // event timestamp ends up earlier than the next instruction's clock,
      // inverting LSL's wall-clock ordering.
      const probe = `
        default {
          state_entry() {
            ${call}
            llOwnerSay("snapshot");
          }
        }
      `
      const { linkset, scripts } = await loadLinkset({
        prims: [
          {
            inventory: [
              {
                name: 'memo',
                type: 7,
                key: '00000000-0000-0000-0000-000000000123',
                creator: '00000000-0000-0000-0000-000000000000',
                description: '',
                acquireTimeMs: 0,
                permMask: { base: 0, owner: 0, group: 0, everyone: 0, next: 0 },
                notecardLines: ['only line'],
              },
            ],
            scripts: [{ source: { source: probe, filename: 'p.lsl' }, name: 'p' }],
          },
        ],
      })
      let snapshotNow = -1
      let dataserverAt = -1
      scripts['p']!.mock('llOwnerSay', (ctx) => {
        snapshotNow = ctx.state.clock.now
        const ev = linkset.clock.pendingEvents().find((e) => e.event === 'dataserver')
        dataserverAt = ev ? ev.at : -1
        return undefined
      })
      scripts['p']!.start()
      expect(dataserverAt).toBeGreaterThanOrEqual(snapshotNow)
    })
  })

  describe('script control', () => {
    it('llSetScriptState pauses event delivery to a sibling', async () => {
      const writer = `
        integer counter = 0;
        default {
          touch_start(integer n) {
            counter = counter + 1;
            llLinksetDataWrite("k", (string)counter);
          }
        }
      `
      const reader = `
        integer received = 0;
        default {
          linkset_data(integer action, string name, string value) { received += 1; }
        }
      `
      const controller = `
        default {
          touch_start(integer n) {
            llSetScriptState("reader", FALSE);
          }
        }
      `
      const { scripts, linkset } = await loadLinkset({
        prims: [
          {
            scripts: [
              { source: { source: writer, filename: 'w.lsl' }, name: 'writer' },
              { source: { source: reader, filename: 'r.lsl' }, name: 'reader' },
              { source: { source: controller, filename: 'c.lsl' }, name: 'controller' },
            ],
          },
        ],
      })
      scripts['writer']!.start()
      scripts['reader']!.start()
      scripts['controller']!.start()
      scripts['writer']!.fire('touch_start', { num_detected: 1 })
      expect(scripts['reader']!.global('received')).toBe(1)
      scripts['controller']!.fire('touch_start', { num_detected: 1 })
      scripts['writer']!.fire('touch_start', { num_detected: 1 })
      // Reader is paused, so it shouldn't have received the second event.
      expect(scripts['reader']!.global('received')).toBe(1)
      // Re-enable and the parked event should fire.
      scripts['reader']!.running = true
      scripts['reader']!.resumeParked()
      linkset.drainQueue()
      expect(scripts['reader']!.global('received')).toBe(2)
    })

    it('llResetOtherScript reinitialises a sibling on the next drain', async () => {
      const sibling = `
        integer counter = 0;
        default {
          touch_start(integer n) { counter = counter + 1; }
        }
      `
      const controller = `
        default {
          touch_start(integer n) {
            llResetOtherScript("sibling");
          }
        }
      `
      const { scripts, linkset } = await loadLinkset({
        prims: [
          {
            scripts: [
              { source: { source: sibling, filename: 's.lsl' }, name: 'sibling' },
              { source: { source: controller, filename: 'c.lsl' }, name: 'controller' },
            ],
          },
        ],
      })
      scripts['sibling']!.start()
      scripts['controller']!.start()
      scripts['sibling']!.fire('touch_start', { num_detected: 1 })
      scripts['sibling']!.fire('touch_start', { num_detected: 1 })
      expect(scripts['sibling']!.global('counter')).toBe(2)
      scripts['controller']!.fire('touch_start', { num_detected: 1 })
      // The reset is scheduled, not synchronous — drain to apply it.
      linkset.drainQueue()
      expect(scripts['sibling']!.global('counter')).toBe(0)
    })

    it('llSetScriptState resume realigns timer instead of flooding catch-up events', async () => {
      const sibling = `
        integer ticks = 0;
        default {
          state_entry() { llSetTimerEvent(1.0); }
          timer() { ticks = ticks + 1; }
        }
      `
      const driver = `default { touch_start(integer n) { llSetScriptState("sibling", TRUE); } }`
      const { scripts, linkset } = await loadLinkset({
        prims: [
          {
            scripts: [
              { source: { source: sibling, filename: 's.lsl' }, name: 'sibling' },
              { source: { source: driver, filename: 'd.lsl' }, name: 'driver' },
            ],
          },
        ],
      })
      scripts['sibling']!.start()
      scripts['driver']!.start()
      linkset.advanceTime(2500)
      expect(scripts['sibling']!.global('ticks')).toBe(2)
      // Pause and let a long stretch of virtual time pass — without the
      // timer realignment, resume would replay one fire per missed interval.
      scripts['sibling']!.running = false
      linkset.advanceTime(100_000)
      scripts['driver']!.fire('touch_start', { num_detected: 1 })
      // Half an interval after resume → no new fires yet.
      linkset.advanceTime(500)
      expect(scripts['sibling']!.global('ticks')).toBe(2)
      // Past the next interval → exactly one new fire.
      linkset.advanceTime(700)
      expect(scripts['sibling']!.global('ticks')).toBe(3)
    })

    it('llResetOtherScript on a paused sibling clears its globals immediately', async () => {
      const sibling = `
        integer counter = 0;
        default {
          touch_start(integer n) { counter = counter + 1; }
        }
      `
      const { scripts, linkset } = await loadLinkset({
        prims: [
          {
            scripts: [
              { source: { source: sibling, filename: 's.lsl' }, name: 'sibling' },
              { source: { source: 'default { state_entry() {} }', filename: 'd.lsl' }, name: 'driver' },
            ],
          },
        ],
      })
      scripts['sibling']!.start()
      scripts['driver']!.start()
      scripts['sibling']!.fire('touch_start', { num_detected: 1 })
      scripts['sibling']!.fire('touch_start', { num_detected: 1 })
      expect(scripts['sibling']!.global('counter')).toBe(2)
      // Pause the sibling.
      scripts['sibling']!.running = false
      // Schedule a reset; even though the target is paused, it must apply.
      linkset.clock.schedule(scripts['sibling']!, linkset.clock.now, '__reset', {})
      linkset.drainQueue()
      expect(scripts['sibling']!.global('counter')).toBe(0)
      // The script stays paused.
      expect(scripts['sibling']!.running).toBe(false)
    })

    it('llGetScriptState reflects running flag', async () => {
      const probe = `
        integer beforeStop = 0;
        integer afterStop = 0;
        default {
          state_entry() {
            beforeStop = llGetScriptState("other");
            llSetScriptState("other", FALSE);
            afterStop = llGetScriptState("other");
          }
        }
      `
      const noop = `default { state_entry() { } }`
      const { scripts } = await loadLinkset({
        prims: [
          {
            scripts: [
              { source: { source: probe, filename: 'p.lsl' }, name: 'p' },
              { source: { source: noop, filename: 'o.lsl' }, name: 'other' },
            ],
          },
        ],
      })
      scripts['p']!.start()
      scripts['other']!.start()
      expect(scripts['p']!.global('beforeStop')).toBe(1)
      expect(scripts['p']!.global('afterStop')).toBe(0)
    })
  })

  describe('llDie', () => {
    it('llDie marks every script in the linkset as dead', async () => {
      const dier = `default { touch_start(integer n) { llDie(); } }`
      const peer = `
        integer ticks = 0;
        default {
          state_entry() { llSetTimerEvent(0.1); }
          timer() { ticks = ticks + 1; }
        }
      `
      const { scripts, linkset } = await loadLinkset({
        prims: [
          {
            scripts: [{ source: { source: dier, filename: 'd.lsl' }, name: 'dier' }],
          },
          {
            scripts: [{ source: { source: peer, filename: 'p.lsl' }, name: 'peer' }],
          },
        ],
      })
      scripts['dier']!.start()
      scripts['peer']!.start()
      linkset.advanceTime(250)
      expect(scripts['peer']!.global('ticks')).toBeGreaterThan(0)
      const ticksBefore = scripts['peer']!.global('ticks') as number
      scripts['dier']!.fire('touch_start', { num_detected: 1 })
      expect(scripts['dier']!.dead).toBe(true)
      expect(scripts['peer']!.dead).toBe(true)
      // No further timer fires after death.
      linkset.advanceTime(5000)
      expect(scripts['peer']!.global('ticks')).toBe(ticksBefore)
    })
  })

  describe('loadLinkset', () => {
    it('throws on duplicate inventory names across prims', async () => {
      const src = `default { state_entry() {} }`
      await expect(
        loadLinkset({
          prims: [
            { scripts: [{ source: { source: src, filename: 'a.lsl' }, name: 'shared' }] },
            { scripts: [{ source: { source: src, filename: 'b.lsl' }, name: 'shared' }] },
          ],
        }),
      ).rejects.toThrow(/duplicate script name 'shared'/)
    })
  })

  describe('llSleep frame quantum', () => {
    it('llSleep(0) and negative values are no-ops', async () => {
      const src = `
        float zeroAdvance = -1.0;
        float negAdvance = -1.0;
        default {
          state_entry() { llResetTime(); }
          touch_start(integer n) {
            float t0 = llGetTime();
            llSleep(0.0);
            zeroAdvance = llGetTime() - t0;
            float t1 = llGetTime();
            llSleep(-1.0);
            negAdvance = llGetTime() - t1;
          }
        }
      `
      const { scripts } = await loadLinkset({
        prims: [{ scripts: [{ source: { source: src, filename: 'p.lsl' }, name: 'p' }] }],
      })
      scripts['p']!.start()
      scripts['p']!.fire('touch_start', { num_detected: 1 })
      expect(scripts['p']!.global('zeroAdvance') as number).toBe(0)
      expect(scripts['p']!.global('negAdvance') as number).toBe(0)
    })

    it('llSleep(0.001) is rounded up to one server frame', async () => {
      const src = `
        float advance = 0.0;
        default {
          state_entry() { llResetTime(); }
          touch_start(integer n) {
            float t0 = llGetTime();
            llSleep(0.001);
            advance = llGetTime() - t0;
          }
        }
      `
      const { scripts } = await loadLinkset({
        prims: [{ scripts: [{ source: { source: src, filename: 'p.lsl' }, name: 'p' }] }],
      })
      scripts['p']!.start()
      scripts['p']!.fire('touch_start', { num_detected: 1 })
      expect(scripts['p']!.global('advance') as number).toBeCloseTo(1 / 45, 5)
    })
  })

  describe('shared clock', () => {
    it('llGetTime in two scripts agrees after advanceTime', async () => {
      const src = `
        float t = 0.0;
        default {
          state_entry() { llResetTime(); }
          touch_start(integer n) { t = llGetTime(); }
        }
      `
      const { scripts, linkset } = await loadLinkset({
        prims: [
          {
            scripts: [
              { source: { source: src, filename: 'a.lsl' }, name: 'a' },
              { source: { source: src, filename: 'b.lsl' }, name: 'b' },
            ],
          },
        ],
      })
      scripts['a']!.start()
      scripts['b']!.start()
      linkset.advanceTime(2500)
      scripts['a']!.fire('touch_start', { num_detected: 1 })
      scripts['b']!.fire('touch_start', { num_detected: 1 })
      expect(scripts['a']!.global('t')).toBeCloseTo(2.5)
      expect(scripts['b']!.global('t')).toBeCloseTo(2.5)
    })
  })
})
