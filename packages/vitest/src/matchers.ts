import { expect } from 'vitest'
import type { Script } from '@rezless/vm'

/**
 * Custom Vitest matchers for the LSL Script handle.
 *
 * Each matcher checks one observable on the Script and returns a Vitest
 * MatcherResult; pass `.not.` to invert. Failure messages include the actual
 * captured state to make debugging quick.
 */

interface MatcherResult {
  pass: boolean
  message: () => string
  actual?: unknown
  expected?: unknown
}

function isScript(value: unknown): value is Script {
  return (
    typeof value === 'object' &&
    value !== null &&
    'chat' in value &&
    'currentState' in value &&
    'callsOf' in value
  )
}

expect.extend({
  toHaveSaid(received: unknown, channel: number, text: string): MatcherResult {
    if (!isScript(received)) {
      return {
        pass: false,
        message: () => `expected a Script, received ${typeof received}`,
      }
    }
    const matched = received.chat.some((c) => c.channel === channel && c.text === text)
    return {
      pass: matched,
      message: () =>
        matched
          ? `expected script not to have said ${JSON.stringify(text)} on channel ${channel}`
          : `expected script to have said ${JSON.stringify(text)} on channel ${channel}\n  actual chat: ${JSON.stringify(received.chat, null, 2)}`,
      actual: received.chat,
      expected: { channel, text },
    }
  },

  toBeInState(received: unknown, name: string): MatcherResult {
    if (!isScript(received)) {
      return {
        pass: false,
        message: () => `expected a Script, received ${typeof received}`,
      }
    }
    const pass = received.currentState === name
    return {
      pass,
      message: () =>
        pass
          ? `expected script not to be in state '${name}'`
          : `expected script to be in state '${name}', actual: '${received.currentState}'`,
      actual: received.currentState,
      expected: name,
    }
  },

  toHaveCalledFunction(received: unknown, name: string, ...args: unknown[]): MatcherResult {
    if (!isScript(received)) {
      return {
        pass: false,
        message: () => `expected a Script, received ${typeof received}`,
      }
    }
    const calls = received.callsOf(name)
    if (calls.length === 0) {
      return {
        pass: false,
        message: () => `expected script to have called ${name}, but it was never called`,
      }
    }
    if (args.length === 0) {
      return {
        pass: true,
        message: () => `expected script not to have called ${name}`,
      }
    }
    const matched = calls.some(
      (c) =>
        c.args.length === args.length &&
        c.args.every((a, i) => Object.is(a, args[i]) || JSON.stringify(a) === JSON.stringify(args[i])),
    )
    return {
      pass: matched,
      message: () =>
        matched
          ? `expected script not to have called ${name}(${args.map((a) => JSON.stringify(a)).join(', ')})`
          : `expected script to have called ${name}(${args.map((a) => JSON.stringify(a)).join(', ')})\n  actual calls: ${JSON.stringify(calls, null, 2)}`,
      actual: calls,
      expected: { name, args },
    }
  },

  toHaveSentHTTP(
    received: unknown,
    expected: { url?: string; method?: string; body?: string },
  ): MatcherResult {
    if (!isScript(received)) {
      return {
        pass: false,
        message: () => `expected a Script, received ${typeof received}`,
      }
    }
    const reqs = received.httpRequests
    const matched = reqs.some(
      (r) =>
        (expected.url === undefined || r.url === expected.url) &&
        (expected.method === undefined || r.method === expected.method) &&
        (expected.body === undefined || r.body === expected.body),
    )
    return {
      pass: matched,
      message: () =>
        matched
          ? `expected script not to have sent HTTP ${JSON.stringify(expected)}`
          : `expected script to have sent HTTP ${JSON.stringify(expected)}\n  actual requests: ${JSON.stringify(reqs, null, 2)}`,
      actual: reqs,
      expected,
    }
  },

  toHaveListened(
    received: unknown,
    channel: number,
    filter?: { name?: string; key?: string; message?: string },
  ): MatcherResult {
    if (!isScript(received)) {
      return {
        pass: false,
        message: () => `expected a Script, received ${typeof received}`,
      }
    }
    const NULL_KEY = '00000000-0000-0000-0000-000000000000'
    const matched = received.listens.some(
      (l) =>
        l.active &&
        l.channel === channel &&
        (filter?.name === undefined || l.name === filter.name) &&
        (filter?.key === undefined ||
          l.key === filter.key ||
          (filter.key === '' && (l.key === '' || l.key === NULL_KEY))) &&
        (filter?.message === undefined || l.message === filter.message),
    )
    return {
      pass: matched,
      message: () =>
        matched
          ? `expected script not to have listened on channel ${channel}`
          : `expected script to have listened on channel ${channel}${filter ? ` with filter ${JSON.stringify(filter)}` : ''}\n  actual listens: ${JSON.stringify(received.listens, null, 2)}`,
      actual: received.listens,
      expected: { channel, filter },
    }
  },
})

interface CustomMatchers<R = unknown> {
  toHaveSaid(channel: number, text: string): R
  toBeInState(name: string): R
  toHaveCalledFunction(name: string, ...args: unknown[]): R
  toHaveSentHTTP(expected: { url?: string; method?: string; body?: string }): R
  toHaveListened(channel: number, filter?: { name?: string; key?: string; message?: string }): R
}

declare module 'vitest' {
  interface Matchers<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
