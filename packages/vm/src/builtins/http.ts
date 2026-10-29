import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { LslValue } from '../values/types.js'
import { NULL_KEY } from '../values/types.js'
import {
  HTTP_METHOD,
  HTTP_MIMETYPE,
  HTTP_CUSTOM_HEADER,
  HTTP_BODY_MAXLENGTH,
  HTTP_EXTENDED_ERROR,
} from '../generated/constants.js'
import { requestKey } from '../keys.js'
import { shoutError } from './debug.js'

/** Response bodies longer than this are cut unless HTTP_BODY_MAXLENGTH says otherwise. */
export const DEFAULT_HTTP_BODY_MAXLENGTH = 2048
const MAX_HTTP_BODY_MAXLENGTH = 16384
/** Requests allowed per object within HTTP_THROTTLE_WINDOW_MS. */
const HTTP_THROTTLE_REQUESTS = 25
const HTTP_THROTTLE_WINDOW_MS = 20_000
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'])

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
  /** Response bodies are cut to this many bytes. Default 2048; set by HTTP_BODY_MAXLENGTH. */
  readonly bodyMaxLength: number
  /** Raw, unparsed options list as passed to llHTTPRequest, for completeness. */
  readonly rawOptions: ReadonlyArray<LslValue>
  /** Whether a response has been fed back to this request yet. */
  fulfilled: boolean
}

interface ParsedOptions {
  method: string
  mimetype: string
  headers: Array<readonly [string, string]>
  bodyMaxLength: number
  extendedError: boolean
  /** Index in the options list of the HTTP_METHOD and HTTP_BODY_MAXLENGTH flags, for error text. */
  methodAt: number
  bodyMaxLengthAt: number
}

function parseOptions(raw: ReadonlyArray<LslValue>): ParsedOptions {
  const out: ParsedOptions = {
    method: 'GET',
    mimetype: 'text/plain;charset=utf-8',
    headers: [],
    bodyMaxLength: DEFAULT_HTTP_BODY_MAXLENGTH,
    extendedError: false,
    methodAt: -1,
    bodyMaxLengthAt: -1,
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
        if (typeof v === 'string') {
          out.method = v
          out.methodAt = i
        }
        i += 2
        break
      }
      case HTTP_MIMETYPE: {
        const v = raw[i + 1]
        if (typeof v === 'string') out.mimetype = v
        i += 2
        break
      }
      case HTTP_BODY_MAXLENGTH: {
        const v = raw[i + 1]
        if (typeof v === 'number') {
          out.bodyMaxLength = v
          out.bodyMaxLengthAt = i
        }
        i += 2
        break
      }
      case HTTP_EXTENDED_ERROR: {
        out.extendedError = raw[i + 1] !== 0
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
 * which schedules an http_response event. An invalid URL, method or
 * HTTP_BODY_MAXLENGTH, or more than 25 requests per object in 20 seconds,
 * shouts an error and returns NULL_KEY; with HTTP_EXTENDED_ERROR set it
 * returns a key and answers with an http_response error instead.
 */
export const llHTTPRequest: BuiltinImpl = (ctx, args) => {
  const url = (args[0] as string | undefined) ?? ''
  const rawOptions = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  const body = (args[2] as string | undefined) ?? ''
  const parsed = parseOptions(rawOptions)
  const reject = (shout: string, status: number, title: string, detail: string): string => {
    shoutError(ctx, shout)
    if (!parsed.extendedError) return NULL_KEY
    const key = nextKey(ctx)
    const payload = { request_id: key, status, metadata: [], body: extendedErrorBody(status, title, detail) }
    for (const s of ctx.prim.scripts) ctx.state.clock.scheduleOn(s, ctx.state.clock.now, 'http_response', payload)
    return key
  }
  if (!isValidUrl(url)) {
    const message = 'URL passed to llHTTPRequest is not valid'
    return reject(message, 471, 'llHTTPRequest URL is invalid.', message)
  }
  if (parsed.bodyMaxLength <= 0 || parsed.bodyMaxLength > MAX_HTTP_BODY_MAXLENGTH) {
    return reject(
      'HTTP_BODY_MAXLENGTH value is invalid',
      472,
      'llHTTPRequest parameter error.',
      `Maximum body length must be in the rage (0, ${MAX_HTTP_BODY_MAXLENGTH}] in position ${parsed.bodyMaxLengthAt}`,
    )
  }
  if (!HTTP_METHODS.has(parsed.method)) {
    return reject(
      `HTTP method ${parsed.method} is unsupported`,
      405,
      'Unrecognized HTTP Method.',
      `HTTP method ${parsed.method} is unsupported at position ${parsed.methodAt}.`,
    )
  }
  const now = ctx.state.clock.now
  const recent = ctx.linkset.httpRequestTimes
  while (recent.length > 0 && recent[0]! <= now - HTTP_THROTTLE_WINDOW_MS) recent.shift()
  if (recent.length >= HTTP_THROTTLE_REQUESTS) {
    return reject(
      'Too many HTTP requests too fast.',
      420,
      'llHTTPRequest is throttled.',
      'Too many HTTP requests, made too quickly.',
    )
  }
  recent.push(now)
  const key = nextKey(ctx)
  ctx.state.httpRequests.push({
    key,
    url,
    method: parsed.method,
    body,
    mimetype: parsed.mimetype,
    headers: parsed.headers,
    bodyMaxLength: parsed.bodyMaxLength,
    rawOptions,
    fulfilled: false,
  })
  return key
}

function nextKey(ctx: CallContext): string {
  ctx.state.httpKeyCounter += 1
  return requestKey(ctx, 'http', ctx.state.httpKeyCounter)
}

/** The JSON body Second Life sends in an HTTP_EXTENDED_ERROR http_response. */
function extendedErrorBody(status: number, title: string, detail: string): string {
  return (
    '{\n' +
    `   "detail" : ${JSON.stringify(detail)},\n` +
    `   "status" : ${status},\n` +
    `   "title" : ${JSON.stringify(title)},\n` +
    '   "type" : "http://wiki.secondlife.com/wiki/llHTTPRequest"\n' +
    '}\n'
  )
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname !== ''
  } catch {
    return false
  }
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
