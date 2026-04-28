import type { BuiltinImpl } from '../runtime.js'
import type { LslValue } from '../values/types.js'
import { NULL_KEY } from '../values/types.js'
import {
  HTTP_METHOD,
  HTTP_MIMETYPE,
  HTTP_CUSTOM_HEADER,
} from '../generated/constants.js'

/**
 * Captured outgoing HTTP request, exposed via Script.httpRequests so tests
 * can assert on what the script fired off, and reply to it via
 * Script.respondToHttp.
 */
export interface HttpRequestEntry {
  /** Request key returned by llHTTPRequest; used to match the response. */
  readonly key: string
  readonly url: string
  /** Default `GET`; overridden by HTTP_METHOD in the options list. */
  readonly method: string
  readonly body: string
  /** Default `text/plain;charset=utf-8`; overridden by HTTP_MIMETYPE. */
  readonly mimetype: string
  /** Custom headers from HTTP_CUSTOM_HEADER pairs in the options list. */
  readonly headers: ReadonlyArray<readonly [name: string, value: string]>
  /** Raw, unparsed options list as passed to llHTTPRequest, for completeness. */
  readonly rawOptions: ReadonlyArray<LslValue>
  /** Whether a response has been fed back to this request yet. */
  fulfilled: boolean
}

/** Generate a deterministic request key. */
function nextHttpKey(state: { httpKeyCounter: number }): string {
  state.httpKeyCounter += 1
  return `http-req-${String(state.httpKeyCounter).padStart(8, '0')}`
}

interface ParsedOptions {
  method: string
  mimetype: string
  headers: Array<readonly [string, string]>
}

function parseOptions(raw: ReadonlyArray<LslValue>): ParsedOptions {
  const out: ParsedOptions = {
    method: 'GET',
    mimetype: 'text/plain;charset=utf-8',
    headers: [],
  }
  let i = 0
  while (i < raw.length) {
    const code = raw[i]
    if (typeof code !== 'number') {
      i++
      continue
    }
    switch (code) {
      case HTTP_METHOD: {
        const v = raw[i + 1]
        if (typeof v === 'string') out.method = v
        i += 2
        break
      }
      case HTTP_MIMETYPE: {
        const v = raw[i + 1]
        if (typeof v === 'string') out.mimetype = v
        i += 2
        break
      }
      case HTTP_CUSTOM_HEADER: {
        const name = raw[i + 1]
        const value = raw[i + 2]
        if (typeof name === 'string' && typeof value === 'string') {
          out.headers.push([name, value])
        }
        i += 3
        break
      }
      default:
        // Unknown options take a single value; advance by 2 to be safe.
        i += 2
        break
    }
  }
  return out
}

/**
 * llHTTPRequest(string url, list options, string body) → key
 *
 * Captures the request into ScriptState.httpRequests and returns a
 * deterministic key. Tests respond via Script.respondToHttp(key, ...),
 * which schedules an http_response event.
 */
export const llHTTPRequest: BuiltinImpl = (ctx, args) => {
  const url = (args[0] as string | undefined) ?? ''
  const rawOptions = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  const body = (args[2] as string | undefined) ?? ''
  const parsed = parseOptions(rawOptions)
  const key = nextHttpKey(ctx.state)
  ctx.state.httpRequests.push({
    key,
    url,
    method: parsed.method,
    body,
    mimetype: parsed.mimetype,
    headers: parsed.headers,
    rawOptions,
    fulfilled: false,
  })
  return key
}

/**
 * llHTTPResponse(key request_id, integer status, string body) — used by
 * scripts that hold an inbound HTTP request from llRequestURL. Captured
 * but not otherwise modelled (no inbound URL feature in this PR).
 */
export const llHTTPResponse: BuiltinImpl = () => {
  return undefined
}

export { NULL_KEY as HTTP_NULL_KEY }
