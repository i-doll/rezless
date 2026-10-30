import { describe, it, expect } from 'vitest'
import { loadLinkset } from '../src/index.js'

// Measured in Second Life (Mono, 2026-10-30) with a 2-prim linkset "RZ root" + "RZ child",
// each prim holding a listener script and a sender script.

const ROOT = '11111111-1111-1111-1111-111111111111'
const CHILD = '22222222-2222-2222-2222-222222222222'
const DEBUG_CHANNEL = 2147483647

const listener = (filter = `"", NULL_KEY, ""`) => `
  list heard = [];
  default {
    state_entry() {
      llListen(0, ${filter});
      llListen(5, ${filter});
      llListen(DEBUG_CHANNEL, ${filter});
    }
    listen(integer c, string n, key id, string m) {
      heard += [(string)c + "|" + n + "|" + (string)id + "|" + m];
    }
  }
`

const sender = (body: string) => `
  default {
    touch_start(integer n) { ${body} }
  }
`

async function setup(rootBody: string, childBody = '', filter?: string) {
  const { scripts, linkset } = await loadLinkset({
    prims: [
      {
        name: 'RZ root',
        key: ROOT,
        scripts: [
          { source: { source: listener(filter), filename: 'rl.lsl' }, name: 'rootListener' },
          { source: { source: sender(rootBody), filename: 'rs.lsl' }, name: 'rootSender' },
        ],
      },
      {
        name: 'RZ child',
        key: CHILD,
        scripts: [
          { source: { source: listener(filter), filename: 'cl.lsl' }, name: 'childListener' },
          { source: { source: sender(childBody), filename: 'cs.lsl' }, name: 'childSender' },
        ],
      },
    ],
  })
  for (const s of Object.values(scripts)) s.start()
  const heard = (name: string) => scripts[name]!.global('heard')
  return { scripts, linkset, heard }
}

describe('chat sent by a script reaches listens in other prims', () => {
  for (const fn of ['llSay', 'llShout', 'llWhisper', 'llRegionSay']) {
    it(`${fn} from the root is heard by the child only`, async () => {
      const { scripts, heard } = await setup(`${fn}(5, "hi");`)
      scripts['rootSender']!.fire('touch_start', { num_detected: 1 })
      expect(heard('childListener')).toEqual([`5|RZ root|${ROOT}|hi`])
      expect(heard('rootListener')).toEqual([])
    })

    it(`${fn} from the child is heard by the root only, named after the child prim`, async () => {
      const { scripts, heard } = await setup('', `${fn}(5, "yo");`)
      scripts['childSender']!.fire('touch_start', { num_detected: 1 })
      expect(heard('rootListener')).toEqual([`5|RZ child|${CHILD}|yo`])
      expect(heard('childListener')).toEqual([])
    })
  }

  it('a script does not hear its own chat', async () => {
    const { scripts } = await loadLinkset({
      prims: [
        {
          name: 'RZ root',
          key: ROOT,
          scripts: [
            {
              source: {
                source: `
                  integer hits = 0;
                  default {
                    state_entry() { llListen(5, "", NULL_KEY, ""); }
                    touch_start(integer n) { llSay(5, "me"); }
                    listen(integer c, string n, key id, string m) { hits++; }
                  }
                `,
              },
              name: 'self',
            },
          ],
        },
      ],
    })
    scripts['self']!.start()
    scripts['self']!.fire('touch_start', { num_detected: 1 })
    expect(scripts['self']!.global('hits')).toBe(0)
  })

  it('llRegionSayTo a prim key is heard only by that prim', async () => {
    const { scripts, heard } = await setup(`llRegionSayTo("${CHILD}", 5, "to child");`, `llRegionSayTo("${ROOT}", 0, "to root");`)
    scripts['rootSender']!.fire('touch_start', { num_detected: 1 })
    scripts['childSender']!.fire('touch_start', { num_detected: 1 })
    expect(heard('childListener')).toEqual([`5|RZ root|${ROOT}|to child`])
    expect(heard('rootListener')).toEqual([`0|RZ child|${CHILD}|to root`])
  })

  it("llRegionSayTo the sender's own prim, or NULL_KEY, is heard by nobody", async () => {
    const { scripts, heard } = await setup(`llRegionSayTo("${ROOT}", 5, "self"); llRegionSayTo(NULL_KEY, 5, "null");`)
    scripts['rootSender']!.fire('touch_start', { num_detected: 1 })
    expect(heard('rootListener')).toEqual([])
    expect(heard('childListener')).toEqual([])
  })

  it('llOwnerSay and llInstantMessage never trigger a listen', async () => {
    const { scripts, heard } = await setup(`llOwnerSay("owner"); llInstantMessage("${CHILD}", "im");`)
    scripts['rootSender']!.fire('touch_start', { num_detected: 1 })
    expect(heard('childListener')).toEqual([])
    expect(heard('rootListener')).toEqual([])
  })

  it('DEBUG_CHANNEL errors are heard in other prims, not the sender prim', async () => {
    const { scripts, heard } = await setup('llRegionSay(0, "x");')
    scripts['rootSender']!.fire('touch_start', { num_detected: 1 })
    expect(heard('childListener')).toEqual([
      `${DEBUG_CHANNEL}|RZ root|${ROOT}|Cannot use llRegionSay() on channel 0.`,
    ])
    expect(heard('rootListener')).toEqual([])
  })

  it('delivers through the event queue, in order, after the sending handler returns', async () => {
    const { scripts, heard } = await setup('llSay(5, "a"); llSleep(1.0); llSay(5, "b");')
    scripts['rootSender']!.fire('touch_start', { num_detected: 1 })
    expect(heard('childListener')).toEqual([`5|RZ root|${ROOT}|a`, `5|RZ root|${ROOT}|b`])
  })

  it('counts toward the 64-event cap', async () => {
    const { scripts, heard } = await setup('integer i; for (i = 0; i < 70; i++) llSay(5, (string)i);')
    scripts['rootSender']!.fire('touch_start', { num_detected: 1 })
    expect(heard('childListener')).toHaveLength(64)
  })

  it('applies listen filters against the sending prim name and key', async () => {
    const { scripts, heard } = await setup('llSay(5, "go"); llSay(5, "stop");', '', `"RZ root", "${ROOT}", "go"`)
    scripts['rootSender']!.fire('touch_start', { num_detected: 1 })
    expect(heard('childListener')).toEqual([`5|RZ root|${ROOT}|go`])
  })

  it('still records the chat on the sender', async () => {
    const { scripts } = await setup('llSay(5, "hi");')
    scripts['rootSender']!.fire('touch_start', { num_detected: 1 })
    expect(scripts['rootSender']!.chat).toEqual([{ channel: 5, text: 'hi', type: 'say' }])
  })
})
