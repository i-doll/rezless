import type {
  Script as Ast,
  EventHandler,
  FunctionDeclaration,
  GlobalVariable,
  TypeName,
} from '@lslvm/parser'
import type { BuiltinImpl, ChatEntry, CallEntry, ScriptState, ScriptIdentity } from './runtime.js'
import type { HttpRequestEntry } from './builtins/http.js'
import type { ListenEntry } from './builtins/listen.js'
import type { LinkedMessageEntry } from './builtins/linked.js'
import type { DataserverRequestEntry } from './builtins/dataserver.js'
import type { LinksetDataEntry } from './builtins/linksetdata.js'
import type { DetectedEntry } from './builtins/detected.js'
import { ResetScriptSignal } from './builtins/object.js'
import { Mulberry32 } from './random.js'
import { NULL_KEY } from './values/types.js'
import { execHandler, StateChangeSignal } from './interpreter.js'
import type { EvalResult, LslType, LslValue } from './values/types.js'
import { defaultEvalFor } from './values/types.js'
import { Env } from './env.js'
import { ScriptClockView } from './clock.js'
import { Linkset } from './linkset.js'
import { Prim } from './prim.js'
import { EVENT_SPECS } from './generated/events.js'
import type { EventSpec } from './generated/events.js'
import { CONSTANT_TABLE } from './generated/constants_table.js'

export interface ScriptOptions {
  /** Filename used in diagnostics; defaults to "<inline>". */
  readonly filename?: string
  /**
   * Seed for the script's PRNG (used by llFrand and friends). Default 1.
   * Pin a seed per test if you need deterministic random output.
   */
  readonly randomSeed?: number
  /** Owner key returned by llGetOwner. Defaults to NULL_KEY. */
  readonly owner?: string
  /** Prim key returned by llGetKey. Defaults to a deterministic per-script key. */
  readonly objectKey?: string
  /** Prim name returned by llGetObjectName. Defaults to "Object". */
  readonly objectName?: string
  /** Script name returned by llGetScriptName. Defaults to filename basename or "script". */
  readonly scriptName?: string
  /**
   * Host prim. If omitted, a 1-prim default linkset is auto-allocated. Pass
   * a prim that's already been added to a Linkset to opt into multi-script.
   */
  readonly host?: Prim
}

/**
 * Public handle for a loaded LSL script. Tests interact almost entirely
 * with this surface: drive events via fire(), inspect chat / calls,
 * override functions via mock(), read or seed globals.
 */
export class Script {
  private readonly state: ScriptState
  private readonly mocks: Record<string, BuiltinImpl> = Object.create(null)
  private readonly globals: Env
  private readonly userFunctions: Map<string, FunctionDeclaration>
  private readonly handlersByState: Map<string, Map<string, EventHandler>>
  private started = false
  /** Per-script clock facade (timer state + time reference). */
  readonly clockView: ScriptClockView
  readonly host: Prim
  readonly linkset: Linkset
  readonly scriptName: string
  /** When false, drainQueue parks events instead of delivering them. */
  running = true
  /** Events parked while `running === false`; replayed when re-enabled. */
  readonly parkedEvents: Array<{ at: number; event: string; payload: Record<string, unknown> }> = []

  constructor(private readonly ast: Ast, options: ScriptOptions = {}) {
    // Auto-wrap: if no host prim was provided, create a default 1-prim linkset.
    let host = options.host
    if (!host) {
      const linkset = new Linkset({ owner: options.owner ?? NULL_KEY })
      const prim = new Prim({
        key:
          options.objectKey ??
          deterministicKey(options.scriptName ?? options.filename ?? 'script'),
        name: options.objectName ?? 'Object',
      })
      linkset.addPrim(prim)
      host = prim
    }
    this.host = host
    if (!host.linkset) {
      throw new Error('Script host prim must belong to a Linkset')
    }
    this.linkset = host.linkset
    this.scriptName = options.scriptName ?? deriveScriptName(options.filename)

    this.clockView = new ScriptClockView(this.linkset.clock, () => this)

    const linkset = this.linkset
    const prim = host
    const scriptName = this.scriptName

    const identity: ScriptIdentity = {
      get owner() {
        return linkset.owner
      },
      get objectKey() {
        return prim.key
      },
      get objectName() {
        return prim.name
      },
      set objectName(v: string) {
        prim.name = v
      },
      get scriptName() {
        return scriptName
      },
    } as ScriptIdentity

    this.state = {
      currentState: 'default',
      chat: [],
      calls: [],
      clock: this.clockView,
      httpRequests: [],
      httpKeyCounter: 0,
      listens: [],
      listenHandleCounter: 0,
      random: new Mulberry32(options.randomSeed ?? 1),
      identity,
      linkedMessages: [],
      dataserverRequests: [],
      dataserverKeyCounter: 0,
      detectedStack: [],
      linksetData: this.linkset.linksetData,
      appearance: this.host.appearance,
      lifecycle: {
        dead: false,
      },
    }

    // Register this script with the prim if it isn't already there.
    if (!host.scripts.includes(this)) {
      host.addScript(this)
    }

    // Build a parent scope holding every kwdb constant (PI, TRUE, HTTP_METHOD,
    // …). Script globals get their own scope below so a user can shadow
    // constants if they really want to (LSL allows it).
    const constants = buildConstantsEnv()
    this.globals = constants.push()
    initGlobals(this.globals, ast.globals)
    this.userFunctions = new Map(ast.functions.map((f) => [f.name, f]))
    this.handlersByState = indexHandlers(ast)
    if (!this.handlersByState.has('default')) {
      throw new Error('LSL script has no default state')
    }
  }

  /** Current virtual time in milliseconds since linkset construction. */
  get now(): number {
    return this.linkset.clock.now
  }

  /**
   * Advance the linkset clock by `ms` and fire every queued event whose
   * scheduled time is ≤ the new now (across all scripts in the linkset).
   * Convenience pass-through to `linkset.advanceTime`.
   */
  advanceTime(ms: number): void {
    this.linkset.advanceTime(ms)
  }

  /**
   * Configured recurring timer interval in seconds, or 0 if no timer is
   * registered. Mirrors `llSetTimerEvent`'s most recent argument.
   */
  get timerInterval(): number {
    return this.clockView.timerIntervalMs / 1000
  }

  /** Current LSL state name. */
  get currentState(): string {
    return this.state.currentState
  }

  /** Captured chat output (llSay/llShout/llWhisper/llOwnerSay/...). */
  get chat(): ReadonlyArray<ChatEntry> {
    return this.state.chat
  }

  /** Universal log of every ll* call this script has made. Filter with callsOf(name). */
  get calls(): ReadonlyArray<CallEntry> {
    return this.state.calls
  }

  /** Filtered call log: only entries for `name`. */
  callsOf(name: string): ReadonlyArray<CallEntry> {
    return this.state.calls.filter((c) => c.name === name)
  }

  /** Captured outgoing HTTP requests from `llHTTPRequest`. */
  get httpRequests(): ReadonlyArray<HttpRequestEntry> {
    return this.state.httpRequests
  }

  /**
   * Feed a response to a previously captured HTTP request. Schedules an
   * `http_response` event for immediate delivery.
   */
  respondToHttp(
    key: string,
    response: { status: number; body?: string; metadata?: ReadonlyArray<unknown> },
  ): void {
    const req = this.state.httpRequests.find((r) => r.key === key)
    if (!req) throw new Error(`unknown HTTP request key: ${key}`)
    req.fulfilled = true
    this.clockView.schedule(this.now, 'http_response', {
      request_id: key,
      status: response.status,
      metadata: response.metadata ?? [],
      body: response.body ?? '',
    })
    this.linkset.drainQueue()
  }

  /** Convenience: respond to the most recent HTTP request. */
  respondToLastHttp(response: {
    status: number
    body?: string
    metadata?: ReadonlyArray<unknown>
  }): void {
    const req = this.state.httpRequests[this.state.httpRequests.length - 1]
    if (!req) throw new Error('no HTTP request to respond to')
    this.respondToHttp(req.key, response)
  }

  /** Currently active listen registrations (from `llListen`). */
  get listens(): ReadonlyArray<ListenEntry> {
    return this.state.listens
  }

  /** Captured llMessageLinked invocations originating from this script. */
  get linkedMessages(): ReadonlyArray<LinkedMessageEntry> {
    return this.state.linkedMessages
  }

  /** Drop every captured outgoing linked-message entry for this script. */
  clearLinkedMessages(): void {
    this.state.linkedMessages.length = 0
  }

  /** Captured pending dataserver requests (llRequestAgentData and friends). */
  get dataserverRequests(): ReadonlyArray<DataserverRequestEntry> {
    return this.state.dataserverRequests
  }

  /**
   * Feed a value back to a pending dataserver request. Schedules a
   * `dataserver` event with the request key and a string value.
   */
  respondToDataserver(key: string, value: string): void {
    const req = this.state.dataserverRequests.find((r) => r.key === key)
    if (!req) throw new Error(`unknown dataserver request key: ${key}`)
    req.fulfilled = true
    this.clockView.schedule(this.now, 'dataserver', {
      queryid: key,
      data: value,
    })
    this.linkset.drainQueue()
  }

  /** Convenience: respond to the most recent dataserver request. */
  respondToLastDataserver(value: string): void {
    const req = this.state.dataserverRequests[this.state.dataserverRequests.length - 1]
    if (!req) throw new Error('no dataserver request to respond to')
    this.respondToDataserver(req.key, value)
  }

  /** Currently displayed floating text (from llSetText). null if unset. */
  get text(): {
    text: string
    color: { x: number; y: number; z: number }
    alpha: number
  } | null {
    return this.state.appearance.text
  }

  /** Object description from llSetObjectDesc. */
  get objectDesc(): string {
    return this.state.appearance.description
  }

  /**
   * Read-only view of the Linkset Data store. Tests can iterate to assert on
   * keys / values / protection. Modify via the LSL builtins or seedLinksetData.
   */
  get linksetData(): ReadonlyMap<string, LinksetDataEntry> {
    return this.state.linksetData
  }

  /**
   * White-box helper: pre-populate the Linkset Data store without going
   * through llLinksetDataWrite. Does not fire linkset_data events.
   */
  seedLinksetData(entries: Iterable<readonly [string, { value: string; password?: string }]>): void {
    for (const [k, v] of entries) {
      this.state.linksetData.set(k, { value: v.value, password: v.password ?? '' })
    }
  }

  /** True once `llDie()` has been called. Subsequent fire() calls are no-ops. */
  get dead(): boolean {
    return this.state.lifecycle.dead
  }

  /**
   * Match chat against this script's listens and queue `listen` events for
   * every match. Does not drain — caller does that. Used by Linkset.deliverChat
   * for cross-script delivery.
   */
  matchChatListens(opts: {
    channel: number
    name: string
    key: string
    message: string
  }): void {
    for (const l of this.state.listens) {
      if (!l.active) continue
      if (l.channel !== opts.channel) continue
      if (l.name && l.name !== opts.name) continue
      if (l.key && l.key !== '00000000-0000-0000-0000-000000000000' && l.key !== opts.key) continue
      if (l.message && l.message !== opts.message) continue
      this.clockView.schedule(this.now, 'listen', {
        channel: opts.channel,
        name: opts.name,
        id: opts.key,
        message: opts.message,
      })
    }
  }

  /**
   * Deliver chat to this script only. Linkset-wide delivery (every listening
   * script in the linkset) is `linkset.deliverChat`.
   */
  deliverChat(opts: {
    channel: number
    name: string
    key: string
    message: string
  }): void {
    this.matchChatListens(opts)
    this.linkset.drainQueue()
  }

  /**
   * Override an `ll*` function for the lifetime of this Script. Replaces
   * any built-in or stub of the same name.
   */
  mock(name: string, impl: BuiltinImpl): void {
    this.mocks[name] = impl
  }

  /** Read a global variable's current value. White-box hook for tests. */
  global(name: string): LslValue {
    return this.globals.get(name).value
  }

  /** Seed a global variable. The value is coerced to the global's declared type. */
  setGlobal(name: string, value: LslValue, type?: LslType): void {
    const inferred: LslType = type ?? inferType(value)
    this.globals.set(name, { type: inferred, value } as EvalResult)
  }

  /**
   * Drive an event into the current state.
   *
   * `payload` is keyed by the event's documented parameter names (per kwdb).
   * The handler's declared parameters bind by position to the event spec, so
   * the user's chosen names don't have to match.
   *
   * Synchronous: runs the handler to completion before returning, including
   * any state transitions triggered by `state foo;` (state_exit / change /
   * state_entry chain runs before fire() returns).
   *
   * If the current state has no handler for `eventName`, this is a no-op
   * — matches LSL behavior of silently dropping unhandled events.
   */
  fire(eventName: string, payload: Record<string, unknown> = {}): void {
    if (this.state.lifecycle.dead) return
    if (!this.started) {
      this.started = true
      const entry = this.handlersByState.get(this.state.currentState)?.get('state_entry')
      if (entry && eventName !== 'state_entry') {
        this.runHandler(entry, [])
        this.linkset.drainQueue()
      }
    }
    const handler = this.handlersByState.get(this.state.currentState)?.get(eventName)
    if (handler) {
      const args = bindPayload(eventName, payload)
      this.withDetected(payload, () => this.runHandler(handler, args))
    }
    this.linkset.drainQueue()
  }

  /**
   * Run state_entry of the default state. If the script has been auto-started
   * (e.g. by an earlier fire), this is a no-op.
   */
  start(): void {
    if (this.state.lifecycle.dead) return
    if (this.started) return
    this.started = true
    const entry = this.handlersByState.get('default')?.get('state_entry')
    if (entry) {
      this.runHandler(entry, [])
    }
    this.linkset.drainQueue()
  }

  /**
   * Reset the script as if `llResetScript` had been called: clear globals,
   * reseed them from the AST initializers, return to the default state,
   * cancel timers, and run state_entry. Used internally when llResetScript
   * is invoked from inside a handler; tests can also call it directly.
   */
  reset(): void {
    this.globals.clear()
    initGlobals(this.globals, this.ast.globals)
    this.state.currentState = 'default'
    this.state.lifecycle.dead = false
    this.clockView.cancelTimer()
    this.linkset.clock.purgeTarget(this)
    this.parkedEvents.length = 0
    this.started = false
    this.start()
  }

  /**
   * Internal: invoked by `Linkset.drainQueue` to deliver one queued event.
   * The synthetic `__reset` event triggers a sibling-initiated reset
   * (scheduled by `llResetOtherScript`).
   */
  deliver(event: string, payload: Record<string, unknown>): void {
    if (this.state.lifecycle.dead) return
    if (event === '__reset') {
      this.reset()
      return
    }
    const handler = this.handlersByState.get(this.state.currentState)?.get(event)
    if (!handler) return
    const args = bindPayload(event, payload)
    this.withDetected(payload, () => this.runHandler(handler, args))
  }

  /**
   * Push a detected context (if the payload includes `detected`) for the
   * duration of `fn`, so llDetectedKey / Name / Pos / etc. inside the
   * handler resolve to the right entries.
   */
  private withDetected(payload: Record<string, unknown>, fn: () => void): void {
    const detected = payload['detected']
    if (!Array.isArray(detected) || detected.length === 0) {
      fn()
      return
    }
    this.state.detectedStack.push({ entries: detected as ReadonlyArray<DetectedEntry> })
    try {
      fn()
    } finally {
      this.state.detectedStack.pop()
    }
  }

  /**
   * Run a handler and process any state-change signal it raises.
   *
   * LSL semantics: when a handler executes `state foo;`, control leaves the
   * handler immediately, the current state's `state_exit` fires, the state
   * changes, then the new state's `state_entry` fires. We mirror that here
   * with a small loop so that a `state_exit` or `state_entry` that itself
   * does `state foo;` continues the chain correctly.
   */
  private runHandler(handler: EventHandler, args: ReadonlyArray<EvalResult>): void {
    const ctx = {
      state: this.state,
      mocks: this.mocks,
      globals: this.globals,
      userFunctions: this.userFunctions,
      script: this,
      prim: this.host,
      linkset: this.linkset,
    }
    let pending: { handler: EventHandler; args: ReadonlyArray<EvalResult> } | null = {
      handler,
      args,
    }
    while (pending) {
      const { handler: h, args: a } = pending
      pending = null
      try {
        execHandler(ctx, h, a)
      } catch (e) {
        if (e instanceof ResetScriptSignal) {
          this.reset()
          return
        }
        if (!(e instanceof StateChangeSignal)) throw e
        const target = e.target
        const exit = this.handlersByState.get(this.state.currentState)?.get('state_exit')
        if (exit) {
          try {
            execHandler(ctx, exit, [])
          } catch (e2) {
            if (e2 instanceof StateChangeSignal) {
              // Discard further changes inside state_exit per LSL convention.
            } else {
              throw e2
            }
          }
        }
        if (!this.handlersByState.has(target)) {
          throw new Error(`unknown state '${target}' in state change`)
        }
        this.state.currentState = target
        const entry = this.handlersByState.get(target)?.get('state_entry')
        if (entry) {
          pending = { handler: entry, args: [] }
        }
      }
    }
  }

  /**
   * Replay any events parked while this script was disabled. Caller is
   * responsible for advancing the linkset clock if needed afterwards.
   */
  resumeParked(): void {
    if (!this.running) return
    if (this.parkedEvents.length === 0) return
    const events = this.parkedEvents.splice(0, this.parkedEvents.length)
    const at = this.now
    for (const e of events) {
      this.clockView.schedule(at, e.event, e.payload)
    }
  }
}

function bindPayload(
  eventName: string,
  payload: Record<string, unknown>,
): EvalResult[] {
  const spec = (EVENT_SPECS as Record<string, EventSpec>)[eventName]
  if (!spec) return []
  const args: EvalResult[] = []
  for (const p of spec.params) {
    const v = payload[p.name]
    if (v === undefined) {
      args.push(defaultEvalFor(p.type as LslType))
    } else {
      args.push({ type: p.type as LslType, value: v as LslValue })
    }
  }
  return args
}

function indexHandlers(ast: Ast): Map<string, Map<string, EventHandler>> {
  const out = new Map<string, Map<string, EventHandler>>()
  for (const s of ast.states) {
    const map = new Map<string, EventHandler>()
    for (const h of s.handlers) {
      map.set(h.name, h)
    }
    out.set(s.name, map)
  }
  return out
}

function initGlobals(env: Env, globals: ReadonlyArray<GlobalVariable>): void {
  for (const g of globals) {
    let init: EvalResult | undefined
    if (g.init) {
      init = literalToEval(g.init, g.typeName)
    }
    env.declare(g.name, g.typeName as LslType, init)
  }
}

function literalToEval(
  expr: import('@lslvm/parser').Expression,
  declared: TypeName,
): EvalResult | undefined {
  switch (expr.kind) {
    case 'IntegerLiteral':
      return { type: 'integer', value: expr.value | 0 }
    case 'FloatLiteral':
      return { type: 'float', value: expr.value }
    case 'StringLiteral':
      return { type: 'string', value: expr.value }
    case 'Identifier': {
      const c = CONSTANT_TABLE[expr.name]
      if (!c) return undefined
      return { type: c.type as LslType, value: c.value as LslValue }
    }
    case 'VectorLiteral': {
      const x = literalToNumber(expr.x)
      const y = literalToNumber(expr.y)
      const z = literalToNumber(expr.z)
      if (x === null || y === null || z === null) return undefined
      return { type: 'vector', value: { x, y, z } }
    }
    case 'RotationLiteral': {
      const x = literalToNumber(expr.x)
      const y = literalToNumber(expr.y)
      const z = literalToNumber(expr.z)
      const s = literalToNumber(expr.s)
      if (x === null || y === null || z === null || s === null) return undefined
      return { type: 'rotation', value: { x, y, z, s } }
    }
    case 'ListLiteral': {
      const elems: LslValue[] = []
      for (const el of expr.elements) {
        const r = literalToEval(el, 'integer')
        if (!r) return undefined
        elems.push(r.value)
      }
      return { type: 'list', value: elems }
    }
    case 'UnaryExpression': {
      const inner = literalToEval(expr.argument, declared)
      if (!inner) return undefined
      if (expr.operator === '-' && (inner.type === 'integer' || inner.type === 'float')) {
        return { ...inner, value: -(inner.value as number) }
      }
      return inner
    }
    default:
      return undefined
  }
}

function literalToNumber(expr: import('@lslvm/parser').Expression): number | null {
  if (expr.kind === 'IntegerLiteral') return expr.value | 0
  if (expr.kind === 'FloatLiteral') return expr.value
  if (expr.kind === 'Identifier') {
    const c = CONSTANT_TABLE[expr.name]
    if (c && typeof c.value === 'number') return c.value
    return null
  }
  if (expr.kind === 'UnaryExpression' && expr.operator === '-') {
    const n = literalToNumber(expr.argument)
    return n === null ? null : -n
  }
  if (expr.kind === 'UnaryExpression' && expr.operator === '+') {
    return literalToNumber(expr.argument)
  }
  return null
}

/** A stable, UUID-shaped string derived from `seed`. */
function deterministicKey(seed: string): string {
  let h1 = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h1 ^= seed.charCodeAt(i)
    h1 = Math.imul(h1, 0x01000193) >>> 0
  }
  let h2 = (h1 ^ 0xdeadbeef) >>> 0
  for (let i = 0; i < seed.length; i++) {
    h2 ^= seed.charCodeAt(i) << (i & 31)
    h2 = Math.imul(h2, 0x01000193) >>> 0
  }
  const hex = (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).repeat(2)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function deriveScriptName(filename: string | undefined): string {
  if (!filename) return 'script'
  const last = filename.split('/').pop() ?? filename
  return last.replace(/\.lsl$/i, '')
}

function inferType(v: LslValue): LslType {
  if (typeof v === 'number') {
    return Number.isInteger(v) ? 'integer' : 'float'
  }
  if (typeof v === 'string') return 'string'
  if (Array.isArray(v)) return 'list'
  if (v && typeof v === 'object' && 's' in v) return 'rotation'
  return 'vector'
}

/**
 * Construct a fresh Env with every kwdb constant pre-declared. Cheap
 * enough at ~950 entries that we just rebuild it per Script instance —
 * this avoids any cross-script aliasing of constant slots.
 */
function buildConstantsEnv(): Env {
  const env = new Env(null)
  for (const [name, entry] of Object.entries(CONSTANT_TABLE)) {
    env.declare(name, entry.type as LslType, {
      type: entry.type as LslType,
      value: entry.value as LslValue,
    })
  }
  return env
}
