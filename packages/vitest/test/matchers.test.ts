import { describe, it, expect } from 'vitest'
import { loadScript } from '../src/index.js'

async function run(source: string) {
  const s = await loadScript({ source })
  s.start()
  return s
}

describe('matchers — negative paths and guards', () => {
  it('toHaveSaid: .not. passes when the script never said the message', async () => {
    const s = await run(`default { state_entry() { llSay(0, "hi"); } }`)
    expect(s).toHaveSaid(0, 'hi')
    expect(s).not.toHaveSaid(0, 'never')
    // Channel mismatch counts as a miss.
    expect(s).not.toHaveSaid(7, 'hi')
  })

  it('toHaveSaid: rejects non-Script receivers with a clear message', () => {
    expect(() => expect({ chat: [] }).toHaveSaid(0, 'x')).toThrow(/expected a Script/)
  })

  it('toBeInState: passes for current state, fails for any other', async () => {
    const s = await run(`
      default { state_entry() { state ready; } }
      state ready { state_entry() {} }
    `)
    expect(s).toBeInState('ready')
    expect(s).not.toBeInState('default')
  })

  it('toBeInState: rejects non-Script receivers', () => {
    expect(() => expect(null).toBeInState('default')).toThrow(/expected a Script/)
  })

  it('toHaveCalledFunction: name-only matches, mismatched args fail', async () => {
    const s = await run(`default { state_entry() { llSetTimerEvent(60.0); } }`)
    expect(s).toHaveCalledFunction('llSetTimerEvent')
    expect(s).toHaveCalledFunction('llSetTimerEvent', 60.0)
    expect(s).not.toHaveCalledFunction('llSetTimerEvent', 30.0)
    expect(s).not.toHaveCalledFunction('llNeverCalled')
  })

  it('toHaveCalledFunction: rejects non-Script receivers', () => {
    expect(() => expect('not a script').toHaveCalledFunction('llSay')).toThrow(/expected a Script/)
  })

  it('toHaveSentHTTP: matches by url/method/body subset', async () => {
    const s = await run(`
      default {
        state_entry() {
          llHTTPRequest("https://x.test/", [HTTP_METHOD, "POST"], "payload");
        }
      }
    `)
    expect(s).toHaveSentHTTP({ url: 'https://x.test/' })
    expect(s).toHaveSentHTTP({ method: 'POST', body: 'payload' })
    expect(s).not.toHaveSentHTTP({ url: 'https://other.test/' })
    expect(s).not.toHaveSentHTTP({ method: 'GET' })
  })

  it('toHaveSentHTTP: rejects non-Script receivers', () => {
    expect(() => expect({}).toHaveSentHTTP({ url: 'x' })).toThrow(/expected a Script/)
  })

  it('toHaveListened: matches active listens with optional name/key/message filters', async () => {
    const s = await run(`
      default {
        state_entry() {
          llListen(7, "Alice", NULL_KEY, "hello");
        }
      }
    `)
    expect(s).toHaveListened(7)
    expect(s).toHaveListened(7, { name: 'Alice' })
    expect(s).toHaveListened(7, { message: 'hello' })
    // The empty-string key filter accepts both '' and NULL_KEY.
    expect(s).toHaveListened(7, { key: '' })
    expect(s).not.toHaveListened(7, { name: 'Bob' })
    expect(s).not.toHaveListened(99)
  })

  it('toHaveListened: skips listens deactivated via llListenControl', async () => {
    const s = await run(`
      integer h;
      default {
        state_entry() {
          h = llListen(7, "", NULL_KEY, "");
          llListenControl(h, FALSE);
        }
      }
    `)
    // The listen entry survives but is inactive — the matcher must skip it.
    expect(s.listens).toHaveLength(1)
    expect(s.listens[0]!.active).toBe(false)
    expect(s).not.toHaveListened(7)
  })

  it('toHaveListened: rejects non-Script receivers', () => {
    expect(() => expect(undefined).toHaveListened(0)).toThrow(/expected a Script/)
  })
})
