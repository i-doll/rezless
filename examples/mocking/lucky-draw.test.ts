import { describe, it, expect, beforeEach } from 'vitest'
import { loadScript } from '@rezless/vitest'
import type { Script } from '@rezless/vitest'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./lucky-draw.lsl', import.meta.url))

const ALICE = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const BOB = '11111111-2222-3333-4444-555555555555'

/**
 * `script.mock(name, impl)` overrides any LSL function — built-in, generated
 * stub, or one you mocked earlier. Mocks are scoped to the Script and reset
 * to baseline when you load a fresh one (we re-`loadScript` per test below).
 *
 * The implementation receives `(ctx, args)` and returns an LslValue (or
 * `undefined` for void functions). Args come in raw JS form — numbers,
 * strings, vectors, lists — same as the underlying real builtins receive.
 */
describe('lucky-draw.lsl — patterns for script.mock()', () => {
  let s: Script

  beforeEach(async () => {
    s = await loadScript(SCRIPT)
  })

  it('pin a built-in: force llFrand to a deterministic value', async () => {
    // llFrand has a real impl (seeded), but for THIS test we want a specific
    // outcome regardless of seed. mock() takes precedence over the built-in.
    s.mock('llFrand', () => 42)
    s.mock('llKey2Name', () => 'Alice') // (real impl doesn't exist yet — mock it)

    s.fire('touch_start', { num_detected: 1, detected: [{ key: ALICE, name: 'Alice' }] })

    expect(s).toHaveSaid(0, 'Welcome Alice! You rolled 42.')
    // Roll of 42 < 90, so no prize was given.
    expect(s.callsOf('llGiveInventory')).toHaveLength(0)
  })

  it('mock an unimplemented function: provide custom logic for llKey2Name', async () => {
    // The script calls llKey2Name(toucher), which isn't in our real-builtin
    // set. Without a mock it falls through to a generated stub that returns
    // the empty string. Provide your own behaviour, no wait needed.
    const directory: Record<string, string> = {
      [ALICE]: 'Alice Resident',
      [BOB]: 'Bob Resident',
    }
    s.mock('llKey2Name', (_ctx, [key]) => directory[key as string] ?? '???')
    s.mock('llFrand', () => 10) // low roll, keep this test focused on names

    s.fire('touch_start', { num_detected: 1, detected: [{ key: ALICE, name: 'Alice' }] })
    s.fire('touch_start', { num_detected: 1, detected: [{ key: BOB, name: 'Bob' }] })

    expect(s.chat.map((c) => c.text)).toEqual([
      'Welcome Alice Resident! You rolled 10.',
      'Welcome Bob Resident! You rolled 10.',
    ])
  })

  it('observe a side-effecting mock: assert what was passed to llGiveInventory', async () => {
    // For functions you only want to observe (mock returns void), the
    // existing call log captures every invocation with its raw args.
    // Pair a no-op mock with `s.callsOf('llGiveInventory')` or the
    // toHaveCalledFunction matcher.
    s.mock('llFrand', () => 99) // high roll → prize fires
    s.mock('llKey2Name', () => 'Alice')
    s.mock('llGiveInventory', () => undefined) // no-op; call is still logged

    s.fire('touch_start', { num_detected: 1, detected: [{ key: ALICE, name: 'Alice' }] })

    expect(s).toHaveCalledFunction('llGiveInventory', ALICE, 'Lucky Coin')
    expect(s.chat.map((c) => c.text)).toEqual([
      'Welcome Alice! You rolled 99.',
      'Lucky! Have a Lucky Coin.',
    ])
  })

  it('mock can have its own state: track every prize handed out', async () => {
    // The mock is a regular JS closure, so it can keep its own state. Useful
    // for asserting on aggregate behaviour across many events without
    // walking the call log by hand.
    const givenTo: string[] = []
    s.mock('llGiveInventory', (_ctx, [recipient]) => {
      givenTo.push(recipient as string)
      return undefined
    })
    s.mock('llKey2Name', () => 'Anyone')
    // Two high rolls → two prizes
    let frandCalls = 0
    s.mock('llFrand', () => (frandCalls++ === 0 ? 95 : 91))

    s.fire('touch_start', { num_detected: 1, detected: [{ key: ALICE, name: 'A' }] })
    s.fire('touch_start', { num_detected: 1, detected: [{ key: BOB, name: 'B' }] })

    expect(givenTo).toEqual([ALICE, BOB])
  })
})
