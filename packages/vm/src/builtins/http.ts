import type { BuiltinImpl, CallContext, ScriptState } from '../runtime.js'
import type { Script } from '../script.js'
import type { LslValue } from '../values/types.js'
import { NULL_KEY } from '../values/types.js'
import {
  HTTP_METHOD,
  HTTP_MIMETYPE,
  HTTP_CUSTOM_HEADER,
  HTTP_BODY_MAXLENGTH,
  HTTP_EXTENDED_ERROR,
  CONTENT_TYPE_TEXT,
  CONTENT_TYPE_HTML,
  CONTENT_TYPE_XML,
  CONTENT_TYPE_XHTML,
  CONTENT_TYPE_ATOM,
  CONTENT_TYPE_JSON,
  CONTENT_TYPE_LLSD,
  CONTENT_TYPE_FORM,
  CONTENT_TYPE_RSS,
  URL_REQUEST_GRANTED,
  URL_REQUEST_DENIED,
} from '../generated/constants.js'
import { truncateUtf8 } from '../values/utf8.js'
import { llGetSimulatorHostname } from './region.js'
import { deterministicKey, requestKey } from '../keys.js'
import { sayError } from './debug.js'

/** Response bodies longer than this are cut unless HTTP_BODY_MAXLENGTH says otherwise. */
export const DEFAULT_HTTP_BODY_MAXLENGTH = 2048
const MAX_HTTP_BODY_MAXLENGTH = 16384
/** Requests allowed per object within HTTP_THROTTLE_WINDOW_MS. */
const HTTP_THROTTLE_REQUESTS = 25
const HTTP_THROTTLE_WINDOW_MS = 20_000
/** URLs a region has free before any script takes one. */
export const DEFAULT_FREE_URLS = 20000
/** An incoming request nobody answers gets the timeout response after this long. */
export const HTTP_IN_TIMEOUT_MS = 25_000
/** Incoming request bodies are cut to this many bytes. */
export const MAX_INCOMING_BODY_BYTES = 2048
/** Methods the region passes on to the script. */
const INCOMING_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])
const TIMEOUT_RESPONSE: IncomingHttpResponse = {
  status: 504,
  body: 'Timed out waiting for response from internal server.',
  contentType: 'text/plain',
}
const CONTENT_TYPES: Record<number, string> = {
  [CONTENT_TYPE_TEXT]: 'text/plain',
  [CONTENT_TYPE_HTML]: 'text/plain',
  [CONTENT_TYPE_XML]: 'application/xml',
  [CONTENT_TYPE_XHTML]: 'application/xhtml+xml',
  [CONTENT_TYPE_ATOM]: 'application/atom+xml',
  [CONTENT_TYPE_JSON]: 'application/json',
  [CONTENT_TYPE_LLSD]: 'application/llsd+xml',
  [CONTENT_TYPE_FORM]: 'application/x-www-form-urlencoded',
  [CONTENT_TYPE_RSS]: 'application/rss+xml',
}
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
 * says an error and returns NULL_KEY; with HTTP_EXTENDED_ERROR set it
 * returns a key and answers with an http_response error instead.
 */
export const llHTTPRequest: BuiltinImpl = (ctx, args) => {
  const url = (args[0] as string | undefined) ?? ''
  const rawOptions = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  const body = (args[2] as string | undefined) ?? ''
  const parsed = parseOptions(rawOptions)
  const reject = (error: string, status: number, title: string, detail: string): string => {
    sayError(ctx, error)
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

/** The answer a script gave an incoming request with llHTTPResponse. */
export interface IncomingHttpResponse {
  readonly status: number
  readonly body: string
  /** The Content-Type header the response is sent with. */
  readonly contentType: string
}

/** What a test sends to a script's URL with `script.sendHttpRequest`. */
export interface IncomingHttpInit {
  /** Default `GET`. */
  readonly method?: string
  /**
   * Request headers. The script can read only `User-Agent` with
   * llGetHTTPHeader; an `X-Forwarded-For` is put in front of the sender's
   * address in `x-remote-ip`. Names are case-insensitive.
   */
  readonly headers?: Readonly<Record<string, string>>
  /**
   * Sent as UTF-8. The script reads it as UTF-8 only when the Content-Type
   * header has `charset=utf-8`; otherwise each byte becomes one character.
   */
  readonly body?: string
  /** The sender's address, read through `x-remote-ip`. Default `127.0.0.1`. */
  readonly remoteIp?: string
}

/** A request sent to one of a script's URLs, and the response it got. */
export class IncomingHttpRequest {
  /** Content type llSetContentType chose, as a CONTENT_TYPE_* value. */
  contentType: number = CONTENT_TYPE_TEXT
  private answer: IncomingHttpResponse | undefined

  constructor(
    /** The request_id the script sees in http_request. */
    readonly key: string,
    /** The full URL the request went to, path and query included. */
    readonly url: string,
    readonly method: string,
    /** The body the script receives, cut to MAX_INCOMING_BODY_BYTES. */
    readonly body: string,
    /** Request headers as llGetHTTPHeader reads them, names in lowercase. */
    readonly headers: ReadonlyMap<string, string>,
    private readonly clock: { readonly now: number },
    /** Virtual time the request arrived. */
    readonly sentAt: number,
  ) {}

  /**
   * The script's llHTTPResponse, or the timeout response once
   * HTTP_IN_TIMEOUT_MS has passed without one; undefined while it's pending.
   */
  get response(): IncomingHttpResponse | undefined {
    if (this.answer) return this.answer
    if (this.timedOut) return TIMEOUT_RESPONSE
    return undefined
  }

  /** Whether the request can still be answered. */
  get open(): boolean {
    return this.answer === undefined && !this.timedOut
  }

  respond(response: IncomingHttpResponse): void {
    this.answer = response
  }

  private get timedOut(): boolean {
    return this.clock.now >= this.sentAt + HTTP_IN_TIMEOUT_MS
  }
}

/**
 * llRequestURL() → key. Grants the script a new URL, or denies it after
 * `script.denyUrls()` or when no URLs are free, through an http_request
 * event with method URL_REQUEST_GRANTED or URL_REQUEST_DENIED.
 */
export const llRequestURL: BuiltinImpl = (ctx) => requestUrl(ctx, false)

/** llRequestSecureURL() → key. As llRequestURL, with an https URL. */
export const llRequestSecureURL: BuiltinImpl = (ctx) => requestUrl(ctx, true)

function requestUrl(ctx: CallContext, secure: boolean): string {
  const key = nextKey(ctx)
  const state = ctx.state
  let method = URL_REQUEST_DENIED
  let body = ''
  if (state.urlPolicy === 'grant' && freeUrls(ctx) > 0) {
    state.urlCounter += 1
    const host = llGetSimulatorHostname(ctx, []) as string
    const cap = requestKey(ctx, 'url', state.urlCounter)
    body = secure ? `https://${host}:12043/cap/${cap}` : `http://${host}:12046/cap/${cap}`
    state.urls.push(body)
    method = URL_REQUEST_GRANTED
  }
  ctx.state.clock.schedule(ctx.state.clock.now, 'http_request', { request_id: key, method, body })
  return key
}

/** llReleaseURL(string url). Frees one of the script's URLs; later requests to it fail. */
export const llReleaseURL: BuiltinImpl = (ctx, args) => {
  const url = (args[0] as string | undefined) ?? ''
  const at = ctx.state.urls.indexOf(url)
  if (at >= 0) ctx.state.urls.splice(at, 1)
  return undefined
}

/** llGetFreeURLs() → integer. URLs the region has left, after every script's held URLs. */
export const llGetFreeURLs: BuiltinImpl = (ctx) => freeUrls(ctx)

function freeUrls(ctx: CallContext): number {
  const { peers, region } = ctx.linkset
  const linksets = peers.filter((l) => l.region === region)
  let held = 0
  for (const l of linksets) for (const s of l.allScripts()) held += s.urls.length
  return Math.max(0, DEFAULT_FREE_URLS - held)
}

/** llGetHTTPHeader(key request_id, string header) → string. "" once the request is answered or timed out. */
export const llGetHTTPHeader: BuiltinImpl = (ctx, args) => {
  const req = openRequest(ctx, args[0])
  return req?.headers.get((args[1] as string | undefined) ?? '') ?? ''
}

/** llSetContentType(key request_id, integer content_type). */
export const llSetContentType: BuiltinImpl = (ctx, args) => {
  const req = openRequest(ctx, args[0])
  if (req) req.contentType = (args[1] as number | undefined) ?? CONTENT_TYPE_TEXT
  return undefined
}

/**
 * llHTTPResponse(key request_id, integer status, string body). Answers an
 * incoming request once; later answers and unknown keys do nothing. A
 * status below 100 is sent as 200.
 */
export const llHTTPResponse: BuiltinImpl = (ctx, args) => {
  const req = openRequest(ctx, args[0])
  if (!req) return undefined
  const status = (args[1] as number | undefined) ?? 0
  req.respond({
    status: status < 100 ? 200 : status,
    body: (args[2] as string | undefined) ?? '',
    contentType: `${CONTENT_TYPES[req.contentType] ?? 'text/plain'}; charset=utf-8`,
  })
  return undefined
}

function openRequest(ctx: CallContext, key: LslValue | undefined): IncomingHttpRequest | undefined {
  const req = ctx.state.incomingHttp.find((r) => r.key === key)
  return req?.open ? req : undefined
}

/**
 * Deliver a test's request to the script holding `url` (the URL itself, or
 * it followed by a path and query) as an http_request event. A URL the
 * script doesn't hold gets a 404, and a method the region doesn't pass on
 * gets the region's own answer, without the script seeing either.
 */
export function sendIncomingHttp(
  script: Script,
  state: ScriptState,
  url: string,
  init: IncomingHttpInit,
): IncomingHttpRequest {
  const clock = script.linkset.clock
  const method = init.method ?? 'GET'
  const base = state.urls.find((u) => url === u || url.startsWith(u + '/') || url.startsWith(u + '?'))
  const answered = (response: IncomingHttpResponse): IncomingHttpRequest => {
    const req = new IncomingHttpRequest('', url, method, init.body ?? '', new Map(), clock, clock.now)
    req.respond(response)
    return req
  }
  if (!base) {
    const cap = /\/cap\/([^/?]*)/.exec(url)?.[1] ?? ''
    return answered({ status: 404, body: `cap not found: '${cap}'\n`, contentType: '' })
  }
  if (!INCOMING_METHODS.has(method)) {
    if (method === 'OPTIONS') return answered({ status: 200, body: 'OK', contentType: 'text/plain' })
    if (method === 'HEAD') return answered({ status: 400, body: '', contentType: '' })
    return answered({ status: 501, body: '', contentType: 'text/html; charset=iso-8859-1' })
  }
  const rest = url.slice(base.length)
  const q = rest.indexOf('?')
  const given = new Map<string, string>()
  for (const [name, value] of Object.entries(init.headers ?? {})) given.set(name.toLowerCase(), value)
  const remoteIp = init.remoteIp ?? '127.0.0.1'
  const forwarded = given.get('x-forwarded-for')
  const headers = new Map<string, string>([
    ['x-script-url', base],
    ['x-path-info', q < 0 ? rest : rest.slice(0, q)],
    ['x-query-string', q < 0 ? '' : rest.slice(q + 1)],
    ['x-remote-ip', forwarded ? `${forwarded}, ${remoteIp}` : remoteIp],
    ['user-agent', given.get('user-agent') ?? ''],
  ])
  state.httpInCounter += 1
  const key = deterministicKey(`${script.host.key}/${script.scriptName}/http-in/${state.httpInCounter}`)
  const body = method === 'DELETE' ? '' : incomingBody(init.body ?? '', given.get('content-type') ?? '')
  const req = new IncomingHttpRequest(key, url, method, body, headers, clock, clock.now)
  state.incomingHttp.push(req)
  const started = script.handles('http_request') ? [script] : []
  script.clockView.schedule(clock.now, 'http_request', { request_id: key, method, body })
  script.linkset.settle(started)
  return req
}

/**
 * The body as the script receives it. Without `charset=utf-8` in its
 * Content-Type, each byte of the body becomes one character. The result is
 * cut to MAX_INCOMING_BODY_BYTES, and a character the cut splits becomes "?".
 */
function incomingBody(body: string, contentType: string): string {
  const text = /charset\s*=\s*utf-8/i.test(contentType)
    ? body
    : Buffer.from(body, 'utf8').toString('latin1')
  const cut = truncateUtf8(text, MAX_INCOMING_BODY_BYTES)
  const split = cut.length < text.length && Buffer.byteLength(cut, 'utf8') < MAX_INCOMING_BODY_BYTES
  return split ? cut + '?' : cut
}

export { NULL_KEY as HTTP_NULL_KEY }
