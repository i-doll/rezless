import type {
  Script as Ast,
  EventHandler,
  FunctionDeclaration,
  GlobalVariable,
  Node,
  TypeName,
} from '@rezless/parser'
import type { BuiltinImpl, ChatEntry, CallEntry, ScriptState, ScriptIdentity, Suspension } from './runtime.js'
import type { HttpRequestEntry, IncomingHttpInit, IncomingHttpRequest } from './builtins/http.js'
import { sendIncomingHttp } from './builtins/http.js'
import { truncateUtf8 } from './values/utf8.js'
import type { ListenEntry } from './builtins/listen.js'
import type { LinkedMessageEntry } from './builtins/linked.js'
import type { DataserverRequestEntry } from './builtins/dataserver.js'
import type { LinksetDataEntry } from './builtins/linksetdata.js'
import type { DetectedEntry } from './builtins/detected.js'
import type { PermissionRequestEntry } from './builtins/permissions.js'
import type { DialogEntry } from './builtins/dialog.js'
import { HaltSignal, ResetScriptSignal } from './builtins/object.js'
import { Mulberry32 } from './random.js'
import { inventoryItemName } from './inventory.js'
import { NULL_KEY } from './values/types.js'
import { execHandler, StateChangeSignal } from './interpreter.js'
import { buildCoveragePlan, CoverageCollector } from './coverage.js'
import type { CoverageReport } from './coverage.js'
import type { EvalResult, LslType, LslValue } from './values/types.js'
import { defaultEvalFor, rot, toFloat32Value, vec } from './values/types.js'
import { typedList } from './values/list-types.js'
import { Env } from './env.js'
import { DELAYED_EVENTS, ScriptClockView } from './clock.js'
import { Linkset } from './linkset.js'
import { Prim } from './prim.js'
import { EVENT_SPECS } from './generated/events.js'
import type { EventSpec } from './generated/events.js'
import { CONSTANT_TABLE } from './generated/constants_table.js'
import { DEBUG_CHANNEL, HTTP_BODY_TRUNCATED } from './generated/constants.js'
import { own } from './own.js'
import { deterministicKey } from './keys.js'
import { Memory, RuntimeError, codeBytes } from './memory.js'
import { invalidPrograms } from './typecheck.js'

/** Signature of an unlisted function that a test provides through `script.mock`. */
export interface FunctionSignature {
  /** Return type; omit for a void function. */
  readonly returns?: TypeName
  /** Parameter types, in order; omit for no parameters. */
  readonly params?: ReadonlyArray<TypeName>
}

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
  /**
   * Unix time in seconds at virtual time 0, read by llGetUnixTime,
   * llGetTimestamp and llGetDate. Defaults to 0. Ignored when `host` is given;
   * set it on the Linkset instead.
   */
  readonly startUnixTime?: number
  /**
   * Start parameter and string the object was rezzed with, read by
   * llGetStartParameter and llGetStartString. Default 0 and "". Ignored when
   * `host` is given; set them on the Linkset instead.
   */
  readonly startParameter?: number
  readonly startString?: string
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
  /**
   * Original LSL source — kept on the script for LCOV / Istanbul line maps
   * when coverage is enabled. loadScript() supplies this automatically.
   */
  readonly source?: string
  /**
   * Enable coverage collection on this script. When true, `script.coverage`
   * returns a snapshot after each test; default false (zero overhead).
   */
  readonly coverage?: boolean
  /**
   * Functions outside the LSL definitions the script may call, keyed by name. Second Life
   * rejects calls to undeclared names, so the type checker only accepts these
   * ones; give each an implementation with `script.mock`.
   */
  readonly functions?: Readonly<Record<string, FunctionSignature>>
  /**
   * What happens when the script calls a function rezless only stubs:
   * 'allow' (default) returns the type's default value silently, 'warn'
   * also warns once per function, 'throw' fails the call.
   */
  readonly stubs?: 'allow' | 'warn' | 'throw'
  /**
   * Set true to crash the script with a Stack-Heap Collision when it outgrows
   * its memory limit, as Second Life does. Default false: memory is still
   * measured, but the script keeps running.
   */
  readonly memoryLimit?: boolean
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
  private readonly functions: Readonly<Record<string, FunctionSignature>>
  private readonly invalidPrograms: ReadonlySet<Node>
  private readonly handlersByState: Map<string, Map<string, EventHandler>>
  private started = false
  private readonly stubs: 'allow' | 'warn' | 'throw'
  private readonly warnedStubs = new Set<string>()
  /** Per-script clock facade (timer state + time reference). */
  readonly clockView: ScriptClockView
  readonly host: Prim
  readonly linkset: Linkset
  readonly scriptName: string
  /** When false, drainQueue parks events instead of delivering them. */
  running = true
  /** Events parked while `running === false`; replayed when re-enabled. */
  readonly parkedEvents: Array<{ at: number; event: string; payload: Record<string, unknown> }> = []
  /** llGetStartParameter: the linkset's start parameter until the script resets, then 0. */
  startParameter: number
  /** The handler chain suspended in llSleep or a builtin delay, if any. */
  private task: Task | null = null

  constructor(private readonly ast: Ast, options: ScriptOptions = {}) {
    // Auto-wrap: if no host prim was provided, create a default 1-prim linkset.
    let host = options.host
    if (!host) {
      const linkset = new Linkset({
        owner: options.owner ?? NULL_KEY,
        startUnixTime: options.startUnixTime ?? 0,
        startParameter: options.startParameter ?? 0,
        startString: options.startString ?? '',
      })
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
    this.startParameter = this.linkset.startParameter
    this.scriptName = inventoryItemName(options.scriptName ?? deriveScriptName(options.filename))

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

    const filename = options.filename ?? '<inline>'
    const source = options.source ?? ''
    const coverage = options.coverage
      ? new CoverageCollector(buildCoveragePlan(ast, filename, source))
      : null

    this.state = {
      currentState: 'default',
      chat: [],
      calls: [],
      clock: this.clockView,
      httpRequests: [],
      httpKeyCounter: 0,
      urls: [],
      urlPolicy: 'grant',
      urlCounter: 0,
      incomingHttp: [],
      httpInCounter: 0,
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
      permissions: { granted: 0, agent: NULL_KEY, requests: [] },
      dialogs: [],
      lifecycle: {
        dead: false,
        dying: false,
        removed: false,
      },
      filename,
      source,
      coverage,
      memory: new Memory(codeBytes(ast), options.memoryLimit ?? false),
    }
    if (coverage) coverage.hitState('default')

    // Build a parent scope holding every LSL constant (PI, TRUE, HTTP_METHOD,
    // …). Script globals get their own scope below; typecheck() rejects
    // globals named after constants, as SL does.
    this.globals = new Env(buildConstantsEnv(), this.state.memory)
    initGlobals(this.globals, ast.globals)
    this.userFunctions = new Map(ast.functions.map((f) => [f.name, f]))
    this.functions = options.functions ?? {}
    this.invalidPrograms = invalidPrograms(ast, this.functions)
    this.stubs = options.stubs ?? 'allow'
    this.handlersByState = indexHandlers(ast)
    if (!this.handlersByState.has('default')) {
      throw new Error('LSL script has no default state')
    }

    // Register with the prim only once the script is fully built, so a failed
    // construction (e.g. a Stack-Heap Collision in a global) leaves no trace.
    if (!host.scripts.includes(this)) {
      host.addScript(this)
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

  /**
   * Coverage report snapshot, or null when coverage is disabled. Each call
   * returns a fresh frozen object — safe to retain across further fire()s
   * without seeing later mutations.
   */
  get coverage(): CoverageReport | null {
    return this.state.coverage?.snapshot() ?? null
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
   * `http_response` event for immediate delivery on every script in the
   * prim. A body longer than the request's max length is cut, and the
   * metadata becomes `[HTTP_BODY_TRUNCATED, max]`.
   */
  respondToHttp(
    key: string,
    response: { status: number; body?: string; metadata?: ReadonlyArray<unknown> },
  ): void {
    const req = this.state.httpRequests.find((r) => r.key === key)
    if (!req) throw new Error(`unknown HTTP request key: ${key}`)
    req.fulfilled = true
    const body = response.body ?? ''
    const cut = truncateUtf8(body, req.bodyMaxLength)
    const payload = {
      request_id: key,
      status: response.status,
      metadata:
        cut === body
          ? (response.metadata ?? [])
          : typedList([HTTP_BODY_TRUNCATED, req.bodyMaxLength], ['integer', 'integer']),
      body: cut,
    }
    const started = this.host.scripts.filter((s) => s.handles('http_response'))
    for (const s of this.host.scripts) this.clockView.scheduleOn(s, this.now, 'http_response', payload)
    this.linkset.settle(started)
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

  /** URLs the script holds from llRequestURL / llRequestSecureURL, oldest first. */
  get urls(): ReadonlyArray<string> {
    return this.state.urls
  }

  /** Grant later llRequestURL / llRequestSecureURL calls (the default). */
  grantUrls(): void {
    this.state.urlPolicy = 'grant'
  }

  /** Deny later llRequestURL / llRequestSecureURL calls with URL_REQUEST_DENIED. */
  denyUrls(): void {
    this.state.urlPolicy = 'deny'
  }

  /**
   * Send a request to one of the script's URLs, with a path and query after
   * it if you like, and fire `http_request`. The returned request's
   * `response` holds what the script answered with llHTTPResponse.
   */
  sendHttpRequest(url: string, init: IncomingHttpInit = {}): IncomingHttpRequest {
    return sendIncomingHttp(this, this.state, url, init)
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
   * `dataserver` event with the request key and a string value on every
   * script in the prim.
   */
  respondToDataserver(key: string, value: string): void {
    const req = this.state.dataserverRequests.find((r) => r.key === key)
    if (!req) throw new Error(`unknown dataserver request key: ${key}`)
    req.fulfilled = true
    const payload = { queryid: key, data: value }
    const started = this.host.scripts.filter((s) => s.handles('dataserver'))
    for (const s of this.host.scripts) this.clockView.scheduleOn(s, this.now, 'dataserver', payload)
    this.linkset.settle(started)
  }

  /** Convenience: respond to the most recent dataserver request. */
  respondToLastDataserver(value: string): void {
    const req = this.state.dataserverRequests[this.state.dataserverRequests.length - 1]
    if (!req) throw new Error('no dataserver request to respond to')
    this.respondToDataserver(req.key, value)
  }

  /** Permission requests made with llRequestPermissions, oldest first. */
  get permissionRequests(): ReadonlyArray<PermissionRequestEntry> {
    return this.state.permissions.requests
  }

  /**
   * Answer the most recent unanswered permission request, granting the
   * requested bits that are also in `permissions` (all of them by default).
   * Fires `run_time_permissions` on this script.
   */
  grantPermissions(permissions?: number): void {
    const req = [...this.state.permissions.requests].reverse().find((r) => !r.answered)
    if (!req) throw new Error('no pending permission request')
    req.answered = true
    const granted = req.permissions & (permissions ?? req.permissions)
    this.state.permissions.granted = granted
    this.state.permissions.agent = req.agent
    const started = this.handles('run_time_permissions') ? [this] : []
    this.clockView.schedule(this.now, 'run_time_permissions', { perm: granted })
    this.linkset.settle(started)
  }

  /** Answer the most recent unanswered permission request with No. */
  denyPermissions(): void {
    this.grantPermissions(0)
  }

  /** Dialogs and text boxes this script showed with llDialog / llTextBox, oldest first. */
  get dialogs(): ReadonlyArray<DialogEntry> {
    return this.state.dialogs
  }

  /**
   * Answer a dialog as its avatar: the most recent unanswered one, or
   * `opts.dialog`. The avatar says `text` on the dialog's channel, heard by
   * listens within 20 m of the prim that showed it. A llDialog answer must
   * be one of its buttons; a text box takes any text.
   */
  answerDialog(text: string, opts: { name?: string; dialog?: DialogEntry } = {}): void {
    const dialog = opts.dialog ?? [...this.state.dialogs].reverse().find((d) => !d.answered)
    if (!dialog) throw new Error('no unanswered dialog')
    if (!this.state.dialogs.includes(dialog)) throw new Error('that dialog was not shown by this script')
    if (dialog.answered) throw new Error('that dialog was already answered')
    if (dialog.kind === 'dialog' && !dialog.buttons.includes(text)) {
      throw new Error(`'${text}' is not a button on the dialog: ${dialog.buttons.join(', ')}`)
    }
    dialog.answered = true
    const chat = { channel: dialog.channel, name: opts.name ?? '', key: dialog.agent, message: text }
    this.linkset.settle(this.linkset.routeAvatarChat(this.host, chat).filter((s) => s.handles('listen')))
  }

  /** Currently displayed floating text (from llSetText). null if unset. */
  get text(): {
    text: string
    color: { x: number; y: number; z: number }
    alpha: number
  } | null {
    return this.state.appearance.text
  }

  /** The prim's llSetTouchText text, '' if unset. */
  get touchText(): string {
    return this.host.touchText
  }

  /** The prim's llSetSitText text, '' if unset. */
  get sitText(): string {
    return this.host.sitText
  }

  /** The prim's llSetPayPrice arguments, null if unset. */
  get payPrice(): { price: number; buttons: LslValue[] } | null {
    return this.host.payPrice
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

  /** The script's memory limit in bytes, as llGetMemoryLimit reads it. */
  get memoryLimit(): number {
    return this.state.memory.limit
  }

  /** True once `llDie()` has been called. Subsequent fire() calls are no-ops. */
  get dead(): boolean {
    return this.state.lifecycle.dead
  }

  /**
   * Match chat against this script's listens and queue one `listen` event
   * if any of them match; returns whether one did. Does not drain — caller does that. Used by Linkset.deliverChat
   * for cross-script delivery.
   */
  matchChatListens(opts: {
    channel: number
    name: string
    key: string
    message: string
  }): boolean {
    for (const l of this.state.listens) {
      if (!l.active) continue
      if (l.channel !== opts.channel) continue
      if (l.name && l.name !== opts.name) continue
      if (l.key && l.key !== NULL_KEY && l.key !== opts.key) continue
      if (l.message && l.message !== opts.message) continue
      this.clockView.schedule(this.now, 'listen', {
        channel: opts.channel,
        name: opts.name,
        id: opts.key,
        msg: opts.message,
      })
      return true
    }
    return false
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
    this.linkset.settle(this.matchChatListens(opts) && this.handles('listen') ? [this] : [])
  }

  /**
   * Override an `ll*` function for the lifetime of this Script. Replaces
   * any built-in or stub of the same name.
   */
  mock(name: string, impl: BuiltinImpl): void {
    this.mocks[name] = impl
  }

  /** Internal: called by the dispatcher when the script calls a stubbed function. */
  reportStub(name: string): void {
    const message = `${name} is a stub in rezless and returns its type's default value; give it a value with script.mock`
    if (this.stubs === 'throw') throw new Error(message)
    if (this.stubs === 'warn' && !this.warnedStubs.has(name)) {
      this.warnedStubs.add(name)
      console.warn(message)
    }
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
   * `payload` is keyed by the event's documented parameter names (per the LSL definitions).
   * The handler's declared parameters bind by position to the event spec, so
   * the user's chosen names don't have to match.
   *
   * Synchronous: runs the handler to completion before returning, including
   * any state transitions triggered by `state foo;` (state_exit / change /
   * state_entry chain runs before fire() returns). A handler that sleeps
   * moves the clock to its wake time, running every other script's due
   * events on the way. A script already sleeping handles the event after
   * its current handler.
   *
   * If the current state has no handler for `eventName`, this is a no-op
   * — matches LSL behavior of silently dropping unhandled events.
   */
  fire(eventName: string, payload: Record<string, unknown> = {}): void {
    if (this.state.lifecycle.dead) return
    if (!this.running) {
      this.parkedEvents.push({ at: this.now, event: eventName, payload })
      return
    }
    if (!this.started) {
      this.started = true
      const entry = this.handlersByState.get(this.state.currentState)?.get('state_entry')
      if (entry && eventName !== 'state_entry') {
        this.begin(entry, [], {})
        this.linkset.settle([this])
      }
    }
    const started = this.handles(eventName) ? [this] : []
    if (this.task || (DELAYED_EVENTS.has(eventName) && this.clockView.delayedUntilMs > this.now)) {
      this.clockView.schedule(this.now, eventName, payload)
    } else this.deliver(eventName, payload)
    this.linkset.settle(started)
  }

  /**
   * Run state_entry of the default state. If the script has been auto-started
   * (e.g. by an earlier fire), this is a no-op.
   */
  start(): void {
    if (this.state.lifecycle.dead) return
    if (this.started) return
    this.boot()
    this.linkset.settle([this])
  }

  private boot(): void {
    this.started = true
    const entry = this.handlersByState.get('default')?.get('state_entry')
    if (entry) this.begin(entry, [], {})
  }

  /**
   * Reset the script as if `llResetScript` had been called: clear globals,
   * reseed them from the AST initializers, return to the default state,
   * cancel timers, and run state_entry. Used internally when llResetScript
   * is invoked from inside a handler; tests can also call it directly.
   * A sleeping handler is abandoned.
   */
  reset(): void {
    this.restart()
    this.linkset.settle([this])
  }

  private restart(): void {
    this.abandon()
    this.state.memory.releaseStack()
    this.globals.clear()
    try {
      initGlobals(this.globals, this.ast.globals)
    } catch (e) {
      if (e instanceof RuntimeError) this.crash(e)
      throw e
    }
    this.state.currentState = 'default'
    this.state.lifecycle.dead = false
    this.state.lifecycle.dying = false
    this.state.lifecycle.removed = false
    this.state.listens.length = 0
    this.state.urls.length = 0
    this.state.permissions.granted = 0
    this.state.permissions.agent = NULL_KEY
    for (const r of this.state.permissions.requests) r.answered = true
    this.clockView.cancelTimer()
    this.clockView.setMinEventDelay(0)
    this.startParameter = 0
    this.clockView.resetReference()
    this.linkset.clock.purgeTarget(this)
    this.parkedEvents.length = 0
    this.started = false
    // Returning to default counts as a state entry. The constructor records
    // the first one; runHandler records each `state foo;` transition. A
    // reset never goes through runHandler's StateChangeSignal path (default
    // → default raises no signal), so credit it explicitly here.
    if (this.state.coverage) this.state.coverage.hitState('default')
    // Per LSL: if the script is stopped, reset just clears state — no
    // state_entry runs until it's restarted.
    if (this.running) this.boot()
  }

  /**
   * Internal: invoked by `Linkset.drainQueue` to deliver one queued event.
   * The synthetic `__reset` event triggers a sibling-initiated reset
   * (scheduled by `llResetOtherScript`).
   */
  deliver(event: string, payload: Record<string, unknown>): void {
    if (this.state.lifecycle.dead) return
    if (event === '__reset') {
      this.restart()
      return
    }
    const handler = this.handlersByState.get(this.state.currentState)?.get(event)
    if (!handler) return
    if (DELAYED_EVENTS.has(event)) this.clockView.delayedUntilMs = this.now + this.clockView.minEventDelayMs
    this.begin(handler, bindPayload(event, payload), payload)
  }

  /** Whether the current state has a handler for `event`. */
  handles(event: string): boolean {
    return this.handlersByState.get(this.state.currentState)!.has(event)
  }

  /** Virtual time a sleeping handler wakes at, or undefined when the script is idle. */
  get wakeAt(): number | undefined {
    return this.task?.wakeAt
  }

  /** Internal: invoked by `Linkset.drainQueue` when a sleeping handler's wake time comes. */
  wake(): void {
    const task = this.task
    if (!task) return
    this.task = null
    this.step(task)
  }

  private begin(handler: EventHandler, args: ReadonlyArray<EvalResult>, payload: Record<string, unknown>): void {
    this.step({ run: this.runHandler(handler, args, payload), startedAt: this.now, wakeAt: 0 })
  }

  private step(task: Task): void {
    let r: IteratorResult<Suspension, boolean>
    try {
      r = task.run.next()
    } catch (e) {
      this.finish(task)
      throw e
    }
    if (!r.done) {
      this.task = { ...task, wakeAt: r.value.until }
      return
    }
    this.finish(task)
    if (r.value) this.restart()
  }

  private finish(task: Task): void {
    if (this.now === task.startedAt) return
    this.clockView.busyUntilMs = this.now
    this.linkset.clock.requeue(this)
  }

  private abandon(): void {
    const task = this.task
    this.task = null
    task?.run.return(false)
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
  private *runHandler(
    handler: EventHandler,
    args: ReadonlyArray<EvalResult>,
    payload: Record<string, unknown>,
  ): Generator<Suspension, boolean, unknown> {
    const detected = payload['detected']
    const pushed = Array.isArray(detected) && detected.length > 0
    if (pushed) this.state.detectedStack.push({ entries: detected as ReadonlyArray<DetectedEntry> })
    try {
      this.state.memory.startEvent()
      return yield* this.runHandlerChain(handler, args)
    } catch (e) {
      if (e instanceof RuntimeError) this.crash(e)
      throw e
    } finally {
      if (pushed) this.state.detectedStack.pop()
    }
  }

  /** Returns true when the chain ended in llResetScript. */
  private *runHandlerChain(
    handler: EventHandler,
    args: ReadonlyArray<EvalResult>,
  ): Generator<Suspension, boolean, unknown> {
    const ctx = {
      state: this.state,
      mocks: this.mocks,
      globals: this.globals,
      userFunctions: this.userFunctions,
      functions: this.functions,
      invalidPrograms: this.invalidPrograms,
      script: this,
      prim: this.host,
      linkset: this.linkset,
    }
    let pending: { handler: EventHandler; args: ReadonlyArray<EvalResult> } | null = {
      handler,
      args,
    }
    while (pending && !this.state.lifecycle.dead) {
      const { handler: h, args: a } = pending
      pending = null
      try {
        yield* execHandler(ctx, h, a)
      } catch (e) {
        if (e instanceof ResetScriptSignal) return true
        if (e instanceof HaltSignal) return false
        if (!(e instanceof StateChangeSignal)) throw e
        if (this.state.lifecycle.removed) return false
        const target = e.target
        if (target === this.state.currentState || this.state.lifecycle.dead) continue
        const exit = this.handlersByState.get(this.state.currentState)?.get('state_exit')
        if (exit) {
          try {
            yield* execHandler(ctx, exit, [])
          } catch (e2) {
            if (e2 instanceof HaltSignal) return false
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
        this.state.listens.length = 0
        this.linkset.clock.purgeTarget(this, this.now, '__reset')
        this.state.currentState = target
        if (this.state.coverage) this.state.coverage.hitState(target)
        const entry = this.handlersByState.get(target)?.get('state_entry')
        if (entry) {
          pending = { handler: entry, args: [] }
        }
      }
    }
    return false
  }

  /** Stop the script after a fatal run-time error, reporting it on DEBUG_CHANNEL. */
  private crash(error: RuntimeError): void {
    if (error.reported) return
    error.reported = true
    for (const text of ['Script run-time error', error.message]) {
      this.state.chat.push({ channel: DEBUG_CHANNEL, text, type: 'say' })
      this.linkset.routeChat(this.host, 'say', DEBUG_CHANNEL, text)
    }
    this.running = false
  }

  /**
   * Mark this script as dead and cancel its timer. Used by llDie to bring
   * down every script in the linkset. Idempotent.
   */
  markDead(): void {
    this.state.lifecycle.dead = true
    this.state.urls.length = 0
    this.clockView.cancelTimer()
    this.abandon()
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

interface Task {
  readonly run: Generator<Suspension, boolean, unknown>
  readonly startedAt: number
  readonly wakeAt: number
}

function bindPayload(
  eventName: string,
  payload: Record<string, unknown>,
): EvalResult[] {
  const spec = own(EVENT_SPECS as Record<string, EventSpec>, eventName)
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
      init = literalToEval(env, g.init, g.typeName)
    }
    env.declare(g.name, g.typeName as LslType, init)
  }
}

/**
 * Evaluate a global initialiser. Identifiers resolve against `env`, which
 * holds the constants and every global declared so far.
 */
function literalToEval(
  env: Env,
  expr: import('@rezless/parser').Expression,
  declared: TypeName,
): EvalResult | undefined {
  switch (expr.kind) {
    case 'IntegerLiteral':
      return { type: 'integer', value: expr.value | 0 }
    case 'FloatLiteral':
      return { type: 'float', value: expr.value }
    case 'StringLiteral':
      return { type: 'string', value: expr.value }
    case 'Identifier':
      return lookupGlobal(env, expr.name)
    case 'VectorLiteral': {
      const x = literalToNumber(env, expr.x)
      const y = literalToNumber(env, expr.y)
      const z = literalToNumber(env, expr.z)
      if (x === null || y === null || z === null) return undefined
      return { type: 'vector', value: vec(x, y, z) }
    }
    case 'RotationLiteral': {
      const x = literalToNumber(env, expr.x)
      const y = literalToNumber(env, expr.y)
      const z = literalToNumber(env, expr.z)
      const s = literalToNumber(env, expr.s)
      if (x === null || y === null || z === null || s === null) return undefined
      return { type: 'rotation', value: rot(x, y, z, s) }
    }
    case 'ListLiteral': {
      const elems: LslValue[] = []
      const types: LslType[] = []
      for (const el of expr.elements) {
        const r = literalToEval(env, el, 'integer')
        if (!r) return undefined
        elems.push(r.value)
        types.push(r.type)
      }
      return { type: 'list', value: typedList(elems, types) }
    }
    case 'UnaryExpression': {
      const inner = literalToEval(env, expr.argument, declared)
      if (!inner) return undefined
      if (expr.operator === '-' && inner.type === 'integer') {
        return { ...inner, value: -(inner.value as number) | 0 }
      }
      if (expr.operator === '-' && inner.type === 'float') {
        return { ...inner, value: -(inner.value as number) }
      }
      return inner
    }
    default:
      return undefined
  }
}

function literalToNumber(env: Env, expr: import('@rezless/parser').Expression): number | null {
  if (expr.kind === 'IntegerLiteral') return expr.value | 0
  if (expr.kind === 'FloatLiteral') return expr.value
  if (expr.kind === 'Identifier') {
    const v = lookupGlobal(env, expr.name)
    return v && typeof v.value === 'number' ? v.value : null
  }
  if (expr.kind === 'UnaryExpression' && expr.operator === '-') {
    // literalToEval knows whether the operand is an integer, so -2147483648 wraps.
    const r = literalToEval(env, expr, 'float')
    return r && typeof r.value === 'number' ? r.value : null
  }
  return null
}

function lookupGlobal(env: Env, name: string): EvalResult | undefined {
  try {
    return env.get(name)
  } catch {
    return undefined
  }
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
 * Construct a fresh Env with every LSL constant pre-declared. Cheap
 * enough at ~950 entries that we just rebuild it per Script instance —
 * this avoids any cross-script aliasing of constant slots.
 */
function buildConstantsEnv(): Env {
  const env = new Env(null)
  for (const [name, entry] of Object.entries(CONSTANT_TABLE)) {
    // The definitions list float constants such as PI with more digits than a 32-bit float holds.
    env.declare(name, entry.type as LslType, {
      type: entry.type as LslType,
      value: toFloat32Value(entry.value as LslValue, entry.type as LslType),
    })
  }
  return env
}
