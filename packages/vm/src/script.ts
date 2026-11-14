import { clearTargetMotion } from './builtins/motion.js'
import { copyGameControl, gameControlAvatars, type GameControlState, type GameControlSnapshot } from './builtins/game-control.js'
import { PERMISSION_GAME_CONTROL, PROFILE_SCRIPT_MEMORY } from './generated/constants.js'
import { clearTargets, copyTargets } from './builtins/targets.js'
import { withCollisionFilter } from './builtins/collision.js'
import { copySensors, runMissedSensor, stopSensors } from './builtins/sensor.js'
import {
  enterDamageEvent,
  leaveDamageEvent,
  combatAvatars,
  type CombatAvatar,
} from './builtins/damage.js'
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
import type { IncomingEmail, IncomingEmailInit, SentEmail, SentTargetedEmail } from './builtins/email.js'
import { deliverEmail, emailQueue } from './builtins/email.js'
import type { Character, NavigationResults } from './builtins/pathfinding.js'
import { characterFor, pathUpdate, setNavigationResults } from './builtins/pathfinding.js'
import { truncateUtf8 } from './values/utf8.js'
import type { ListenEntry } from './builtins/listen.js'
import type { LinkedMessageEntry } from './builtins/linked.js'
import type { DataserverRequestEntry } from './builtins/dataserver.js'
import type { LinksetDataEntry } from './builtins/linksetdata.js'
import type { DetectedEntry } from './builtins/detected.js'
import type { AutoGrantPermissions, PermissionRequestEntry } from './builtins/permissions.js'
import type { DialogEntry } from './builtins/dialog.js'
import type { TakenControls } from './builtins/controls.js'
import { agentPresence, type ViewerRequest } from './builtins/viewer.js'
import type { InventoryOffer } from './builtins/give.js'
import type { Camera } from './builtins/camera.js'
import { defaultCamera } from './builtins/camera.js'
import { changeRlvFov, setRlvCameraPosition } from './rlv/camera.js'
import type { AnimationState } from './builtins/animation.js'
import { animationAvatars, playingAnimations, setAnimationState } from './builtins/animation.js'
import { HaltSignal, ResetScriptSignal } from './builtins/object.js'
import { Mulberry32 } from './random.js'
import { inventoryItemName } from './inventory.js'
import { faceTextureIsItem } from './builtins/slua-result-kinds.js'
import { typedList, listElementTypes } from './values/list-types.js'
import { NULL_KEY } from './values/types.js'
import { execHandler, StateChangeSignal } from './interpreter.js'
import { buildCoveragePlan, CoverageCollector } from './coverage.js'
import type { CoverageReport } from './coverage.js'
import type { EvalResult, LslType, LslValue } from './values/types.js'
import { defaultEvalFor, rot, toFloat32Value, vec } from './values/types.js'
import { Env } from './env.js'
import { DELAYED_EVENTS, ScriptClockView } from './clock.js'
import { Linkset } from './linkset.js'
import { Prim } from './prim.js'
import { EVENT_SPECS } from './generated/events.js'
import type { EventSpec } from './generated/events.js'
import { CONSTANT_TABLE } from './generated/constants_table.js'
import {
  DEBUG_CHANNEL,
  HTTP_BODY_TRUNCATED,
  PERMISSION_CONTROL_CAMERA,
  PERMISSION_TAKE_CONTROLS,
  XP_ERROR_NOT_PERMITTED,
} from './generated/constants.js'
import { own } from './own.js'
import { deterministicKey } from './keys.js'
import { Memory, RuntimeError, codeBytes } from './memory.js'
import { invalidPrograms } from './typecheck.js'
import type { Experience } from './experience.js'
import type { ExperienceRequestEntry } from './builtins/experience.js'
import { grantExperience } from './builtins/experience.js'
import { SluaEngine } from './slua/engine.js'
import { SluaCoverage } from './slua/coverage.js'
import { invokeBuiltin } from './dispatch.js'
import { BUILTIN_SPECS } from './generated/functions.js'
import type { BuiltinSpec } from './generated/functions.js'
import { parse } from '@rezless/parser'

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
   * Which permission requests are granted without a dialog; see
   * `Script.autoGrantPermissions`. Defaults to the world's setting.
   */
  readonly autoGrantPermissions?: AutoGrantPermissions
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
  /**
   * The experience the script is compiled with. Scripts given the same
   * Experience share its key-value store. Default: none.
   */
  readonly experience?: Experience
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
  get hasStarted() { return this.started }
  private readonly stubs: 'allow' | 'warn' | 'throw'
  private readonly warnedStubs = new Set<string>()
  /** Per-script clock facade (timer state + time reference). */
  readonly clockView: ScriptClockView
  readonly host: Prim
  readonly scriptName: string
  /** When false, drainQueue parks events instead of delivering them. */
  private isRunning = true
  /** Set by a run-time error, until the script runs again. llSetScriptState can't start a crashed script. */
  crashed = false
  /** What the run-time error said after its first line; a crashed SLua script says it again when rezzed. */
  private crashText = ''
  /** Events that were already queued when the script stopped; delivered when it runs again. */
  readonly parkedEvents: Array<{ at: number; event: string; payload: Record<string, unknown> }> = []
  /** llGetStartParameter: the linkset's start parameter until the script resets, then 0. */
  startParameter: number
  /** The handler chain suspended in llSleep or a builtin delay, if any. */
  private task: Task | null = null
  /** Virtual time this script last started a handler or woke from a sleep. */
  resumedAt = 0
  /** For an SLua script: its source, and the VM running it. */
  private readonly sluaSource: string | undefined
  private slua: SluaEngine | null = null
  /** What an SLua script passed to print(), in order. */
  readonly printed: string[] = []

  /**
   * Load an SLua script: Luau source run in SLua's own VM. Throws a
   * SluaCompileError if it doesn't compile.
   */
  static fromSlua(source: string, options: ScriptOptions = {}): Script {
    return new Script(SLUA_PLACEHOLDER, { ...options, source }, source)
  }

  /** 'slua' for a script loaded with fromSlua, else 'lsl'. */
  get language(): 'lsl' | 'slua' {
    return this.sluaSource === undefined ? 'lsl' : 'slua'
  }

  constructor(private readonly ast: Ast, private readonly options: ScriptOptions = {}, sluaSource?: string) {
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
    this.startParameter = this.linkset.startParameter
    this.scriptName = inventoryItemName(options.scriptName ?? deriveScriptName(options.filename))

    this.clockView = new ScriptClockView(this.linkset.clock, () => this)

    const prim = host
    const scriptName = this.scriptName

    const identity: ScriptIdentity = {
      get owner() {
        return prim.linkset!.owner
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
    const coverage = options.coverage && sluaSource === undefined
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
      emails: [],
      targetedEmails: [],
      listens: [],
      listenHandleCounter: 0,
      random: new Mulberry32(options.randomSeed ?? 1),
      identity,
      linkedMessages: [],
      dataserverRequests: [],
      dataserverKeyCounter: 0,
      detectedStack: [],
      get linksetData() {
        return prim.linkset!.linksetData
      },
      appearance: this.host.appearance,
      gameControlSnapshot: null,
      permissions: { granted: 0, agent: NULL_KEY, requests: [], autoGrant: options.autoGrantPermissions ?? null },
      experience: options.experience ?? null,
      experienceRequests: [],
      controls: { taken: null, level: 0 },
      camera: defaultCamera(),
      cameraParams: new Map(),
      get animations() {
        return animationAvatars(prim.linkset!)
      },
      inventoryOffers: [],
      viewerRequests: [],
      teleportRequests: [],
      agentPresence: agentPresence(prim.linkset!),
      dialogs: [],
      lifecycle: {
        dead: false,
        dying: false,
        removed: false,
      },
      filename,
      source,
      coverage,
      // An SLua script's memory is its VM's to count and enforce.
      memory: new Memory(codeBytes(ast), sluaSource === undefined && (options.memoryLimit ?? false)),
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
    this.sluaSource = sluaSource
    if (sluaSource !== undefined) {
      // SLua scripts get 128 KiB (Executor/src/Script.cpp).
      this.state.memory.limit = SLUA_MEMORY_LIMIT
      const engine = this.newSluaEngine()
      if (options.coverage) {
        const collector = new SluaCoverage(engine.plan, filename, source)
        collector.attach(engine)
        this.state.coverage = collector
      }
    }

    // Register with the prim only once the script is fully built, so a failed
    // construction (e.g. a Stack-Heap Collision in a global) leaves no trace.
    if (!host.scripts.includes(this)) {
      host.addScript(this)
    }
  }

  /** A state transition leaves on_damage before lifecycle handlers execute. */
  private clearDamageAdjustment(): void {
    const context = this.state.detectedStack.at(-1)
    if (context?.event === 'on_damage') context.event = ''
  }

  /** Configure an avatar's combat health, parcel and attachment scripts. */
  setCombatAvatar(id: string, avatar: CombatAvatar): void {
    combatAvatars(this).set(id.toLowerCase(), { ...avatar, region: this.linkset.region })
  }

  /** Current virtual time in milliseconds since linkset construction. */
  /** The linkset holding this script's prim; it changes when the prim is linked or unlinked. */
  get linkset(): Linkset {
    return this.host.linkset!
  }

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

  /** The object's character, or null before creation and after deletion. */
  get character(): Character | null {
    return characterFor(this)
  }

  /** Set fixed navigation query answers. These fixtures survive script resets. */
  setNavigationResults(results: NavigationResults): void {
    setNavigationResults(this, results)
  }

  /** Raise path_update on every script in the character's root prim. */
  pathUpdate(type: number, reserved: ReadonlyArray<LslValue> = []): void {
    pathUpdate(this, type, reserved)
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

  /** Mail the script sent with llEmail, oldest first. */
  get emails(): ReadonlyArray<SentEmail> {
    return this.state.emails
  }

  /** Mail the script sent with llTargetedEmail, oldest first. */
  get targetedEmails(): ReadonlyArray<SentTargetedEmail> {
    return this.state.targetedEmails
  }

  /** Mail queued on the script's prim, oldest first, waiting for llGetNextEmail. */
  get inbox(): ReadonlyArray<IncomingEmail> {
    return emailQueue(this.host)
  }

  /**
   * Queue mail on the script's prim. It fires `email` only when a script in
   * the prim asks for it with llGetNextEmail. Returns false, queuing
   * nothing, when the prim already holds 101 mails.
   */
  deliverEmail(init: IncomingEmailInit): boolean {
    return deliverEmail(this, init)
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
   * Which permission requests are granted without a dialog. `'sl'` (the
   * default) grants what Second Life grants to an avatar sitting on the object
   * or wearing it, `'none'` grants nothing, and a function decides per request.
   * A script that was never given a setting follows its world's
   * `autoGrantPermissions`. Copies of the script keep the setting. A viewer under `@acceptpermission`
   * still answers what the setting leaves.
   */
  get autoGrantPermissions(): AutoGrantPermissions {
    return this.state.permissions.autoGrant ?? this.linkset.world?.autoGrantPermissions ?? 'sl'
  }

  set autoGrantPermissions(mode: AutoGrantPermissions) {
    this.state.permissions.autoGrant = mode
  }

  /**
   * An avatar stopped sitting on this script's object. If the script holds
   * its permissions for that avatar, Second Life takes controls and camera
   * control back and stops waiting on the script's dialogs: answers to them
   * do nothing. A script that holds nothing for the avatar keeps waiting.
   */
  sitterLeft(avatar: string): void {
    if (this.state.permissions.agent.toLowerCase() !== avatar.toLowerCase()) return
    this.releaseSeat()
    this.dropWaitingRequests()
  }

  /** What a stand leaves: no controls or camera control, and no permission key once nothing is held. */
  private releaseSeat(): void {
    this.dropSeatPermissions()
    if (!this.state.permissions.granted) this.state.permissions.agent = NULL_KEY
  }

  /** The object went into inventory: a dialog raised before that does nothing afterwards. */
  detached(): void {
    this.dropWaitingRequests()
  }

  private dropWaitingRequests(): void {
    for (const request of this.state.permissions.requests) request.answered = true
  }

  /**
   * Second Life takes controls and camera control back, with no event, when
   * the avatar stops sitting on the object, when the object is taken from
   * under its sitter, and by the time a detached attachment is rezzed again.
   * The permission key goes with the last bit, and the avatar's camera goes
   * back to its own rules.
   */
  private dropSeatPermissions(): void {
    const held = this.state.permissions
    if (!(held.granted & (PERMISSION_TAKE_CONTROLS | PERMISSION_CONTROL_CAMERA))) return
    held.granted &= ~(PERMISSION_TAKE_CONTROLS | PERMISSION_CONTROL_CAMERA)
    this.state.controls.taken = null
    this.state.cameraParams.clear()
    this.linkset.clock.purgeEvent(this, 'control')
    for (let i = this.parkedEvents.length - 1; i >= 0; i--) {
      if (this.parkedEvents[i]!.event === 'control') this.parkedEvents.splice(i, 1)
    }
    if (!held.granted) held.agent = NULL_KEY
  }

  /**
   * Answer a waiting permission request, the most recent one unless `request`
   * names another entry of `permissionRequests`. Grants the requested bits
   * that are also in `permissions` (all of them by default) and fires
   * `run_time_permissions` on this script. Every other waiting request is
   * dropped: Second Life acts on the first answer only.
   */
  grantPermissions(permissions?: number, request?: PermissionRequestEntry): void {
    const requests = this.state.permissions.requests
    const req = request ?? [...requests].reverse().find((r) => !r.answered)
    if (!req || req.answered || !requests.includes(req)) {
      throw new Error(requests.length
        ? 'no pending permission request: every request was already answered, granted automatically or dropped by a reset'
        : 'no pending permission request')
    }
    for (const waiting of requests) waiting.answered = true
    const granted = req.permissions & (permissions ?? req.permissions)
    this.state.permissions.granted = granted
    this.state.permissions.agent = req.agent
    if (!(granted & PERMISSION_TAKE_CONTROLS)) this.state.controls.taken = null
    const started = this.handles('run_time_permissions') ? [this] : []
    this.clockView.schedule(this.now, 'run_time_permissions', { perm: granted })
    this.linkset.settle(started)
  }

  /** Answer a waiting permission request with No: the most recent one, or `request`. */
  denyPermissions(request?: PermissionRequestEntry): void {
    this.grantPermissions(0, request)
  }

  /** The experience the script was compiled with, or null. */
  get experience(): Experience | null {
    return this.state.experience
  }

  /** llRequestExperiencePermissions calls waiting for an answer, oldest first. */
  get experienceRequests(): ReadonlyArray<ExperienceRequestEntry> {
    return this.state.experienceRequests
  }

  /**
   * Accept the most recent unanswered llRequestExperiencePermissions: the
   * agent joins the experience, the script holds the experience permissions
   * for that agent, and `experience_permissions` fires.
   */
  grantExperiencePermissions(): void {
    const req = this.answerExperienceRequest()
    const started = this.handles('experience_permissions') ? [this] : []
    grantExperience(this.state, req.agent)
    this.linkset.settle(started)
  }

  /**
   * Decline the most recent unanswered llRequestExperiencePermissions:
   * `experience_permissions_denied` fires with `reason`
   * (XP_ERROR_NOT_PERMITTED by default).
   */
  denyExperiencePermissions(reason: number = XP_ERROR_NOT_PERMITTED): void {
    const req = this.answerExperienceRequest()
    this.fireAndSettle('experience_permissions_denied', { agent_id: req.agent, reason })
  }

  private answerExperienceRequest(): ExperienceRequestEntry {
    const req = [...this.state.experienceRequests].reverse().find((r) => !r.answered)
    if (!req) throw new Error('no pending experience permission request')
    req.answered = true
    return req
  }

  private fireAndSettle(event: string, payload: Record<string, unknown>): void {
    const started = this.handles(event) ? [this] : []
    this.clockView.schedule(this.now, event, payload)
    this.linkset.settle(started)
  }

  /** Controls taken with llTakeControls, or null when none are. */
  get controls(): TakenControls | null {
    return this.state.controls.taken
  }

  /**
   * Have the permission agent hold exactly the controls in `level` (CONTROL_*
   * bits; 0 lets go of all). Fires `control` with the held and just-changed
   * bits among those taken, if the script took controls with accept TRUE and
   * any of them is held or changed.
   */
  sendControl(level: number): void {
    const edge = level ^ this.state.controls.level
    this.state.controls.level = level
    const taken = this.state.controls.taken
    if (!taken?.accept) return
    const held = level & taken.controls
    const changed = edge & taken.controls
    if (held === 0 && changed === 0) return
    const started = this.handles('control') ? [this] : []
    this.clockView.schedule(this.now, 'control', { id: this.state.permissions.agent, level: held, edge: changed })
    this.linkset.settle(started)
  }

  /** Set an avatar's semantic input fixture, shared by scripts in this World. */
  setGameControl(agent: string, input: GameControlState | null): void {
    const avatars = gameControlAvatars(this.linkset)
    if (input === null) avatars.delete(agent.toLowerCase())
    else avatars.set(agent.toLowerCase(), copyGameControl(input))
  }

  /** Queue raw input and a copy of the avatar's semantic fixture for this script. */
  sendGameControl(agent: string, raw: { buttons?: number; axes?: readonly number[] } = {}): void {
    if (!(this.state.permissions.granted & PERMISSION_GAME_CONTROL)
      || agent.toLowerCase() !== this.state.permissions.agent.toLowerCase()) return
    const input = gameControlAvatars(this.linkset).get(agent.toLowerCase())
    const snapshot = input ? { ...copyGameControl(input), agent: agent.toLowerCase() } : null
    this.fire('game_control', {
      id: agent, button_levels: (raw.buttons ?? 0) | 0,
      axes: typedList((raw.axes ?? []).map(Math.fround), (raw.axes ?? []).map(() => 'float')),
      gameControlSnapshot: snapshot,
    })
  }

  /**
   * Set the permission agent's camera that llGetCameraPos / Rot / FOV / Aspect report.
   * For an RLV-enabled agent the FOV is a user lens change, clamped by active RLV limits.
   */
  setCamera(camera: Partial<Camera>): void {
    const agent = this.state.permissions.agent.toLowerCase()
    const avatar = this.linkset.world?.avatars.find(a => a.key.toLowerCase() === agent)
    if (avatar && avatar.viewer.profile !== 'disabled' && camera.fov !== undefined) changeRlvFov(avatar, camera.fov)
    const poseAvatar = avatar ?? this.linkset.world?.avatars.find(a => a.key.toLowerCase() === this.linkset.owner.toLowerCase())
    if (poseAvatar && poseAvatar.viewer.profile !== 'disabled' && (camera.pos || camera.rot)) setRlvCameraPosition(poseAvatar, camera.pos)
    const { pos, rot: r, fov, aspect } = { ...this.state.camera, ...camera }
    this.state.camera = {
      pos: vec(pos.x, pos.y, pos.z),
      rot: rot(r.x, r.y, r.z, r.s),
      fov: Math.fround(fov),
      aspect: Math.fround(aspect),
    }
  }

  /** Camera rules set with llSetCameraParams, by rule. */
  get cameraParams(): ReadonlyMap<number, LslValue> {
    return this.state.cameraParams
  }

  /** Register an avatar in this region and set its default locomotion animation. */
  setAnimationState(agent: string, state: AnimationState): void {
    setAnimationState(this.state.animations, agent, state)
  }

  /** Playing animation UUIDs for an avatar, in UUID order. Returns a fresh array. */
  getPlayingAnimations(agent: string): ReadonlyArray<string> {
    return playingAnimations(this.state.animations, agent)
  }

  /** Inventory offers and completed prim deliveries, oldest first. */
  get inventoryOffers(): ReadonlyArray<InventoryOffer> {
    return this.state.inventoryOffers
  }

  /** Teleport attempts made by this script, oldest first. */
  get teleportRequests(): ReadonlyArray<import('./builtins/sit.js').TeleportRequest> {
    return this.state.teleportRequests
  }

  /** URL/map requests and rejected floater calls, oldest first. */
  get viewerRequests(): ReadonlyArray<ViewerRequest> {
    return this.state.viewerRequests
  }

  /** Override whether an avatar is present in this region, for every script sharing it. */
  setAgentInRegion(agent: string, present = true): void {
    this.state.agentPresence.set(agent.toLowerCase(), present)
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
    if (this.slua) {
      const value = this.slua.global(name)
      if (value === undefined) throw new Error(`undefined variable '${name}'`)
      return value
    }
    return this.globals.get(name).value
  }

  /** Seed a global variable. The value is coerced to the global's declared type. */
  setGlobal(name: string, value: LslValue, type?: LslType): void {
    const inferred: LslType = type ?? inferType(value)
    if (this.slua) {
      this.slua.setGlobal(name, value, inferred)
      return
    }
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
   * — matches LSL behavior of silently dropping unhandled events. An event
   * fired at a stopped or crashed script is lost, as in Second Life.
   */
  fire(eventName: string, payload: Record<string, unknown> = {}): void {
    if (this.state.lifecycle.dead) return
    if (!this.running) return
    if (!this.started) {
      this.started = true
      if (this.slua) {
        // The script's top level is its state_entry.
        this.beginSluaMain()
        this.linkset.settle([this])
        if (eventName === 'state_entry') return
      }
      const entry = this.handlersByState.get(this.state.currentState)?.get('state_entry')
      if (entry && eventName !== 'state_entry') {
        this.begin(entry, [], {})
        this.linkset.settle([this])
      }
    }
    withCollisionFilter(this, eventName, payload, p => {
      const started = this.handles(eventName) ? [this] : []
      if (this.task || (DELAYED_EVENTS.has(eventName) && this.clockView.delayedUntilMs > this.now)) {
        this.clockView.schedule(this.now, eventName, p)
      } else this.deliver(eventName, p)
      this.linkset.settle(started)
    })
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

  /** Queue a fresh inventory script's first event without waiting for its handler. */
  queueStart(): void {
    if (this.started || this.dead) return
    this.started = true
    // A script loaded stopped keeps its first event until it is started.
    if (this.running) this.clockView.schedule(this.now, 'state_entry')
    else this.parkedEvents.push({ at: this.now, event: 'state_entry', payload: {} })
  }

  /** Copy inventory code; fresh copies omit saved runtime state for remote loading. */
  copyTo(host: Prim, opts: { fresh?: boolean } = {}): Script {
    if (this.sluaSource !== undefined) return this.copySluaTo(host, opts.fresh)
    const copy = new Script(this.ast, { ...this.options, host, coverage: false })
    Object.assign(copy.mocks, this.mocks)
    copy.state.permissions.autoGrant = this.state.permissions.autoGrant
    copy.state.coverage = this.state.coverage
    if (opts.fresh) return copy
    for (const g of this.ast.globals) {
      const value = this.global(g.name)
      const saved = Array.isArray(value)
        ? typedList(structuredClone(value), listElementTypes(value) ?? [])
        : structuredClone(value)
      copy.setGlobal(g.name, saved)
    }
    copy.state.memory.limit = this.state.memory.limit
    copy.state.currentState = this.state.currentState
    copy.started = this.started
    copy.running = this.running && !this.dead
    copy.crashed = this.crashed
    Object.assign(copy.state.random, this.state.random)
    // A copy made for the same owner keeps what the script held. What one made for another owner
    // holds needs a second avatar to measure, so that one starts with nothing.
    if (host.linkset!.owner.toLowerCase() === this.linkset.owner.toLowerCase()) {
      copy.state.permissions.granted = this.state.permissions.granted
      copy.state.permissions.agent = this.state.permissions.agent
      const agent = this.state.permissions.agent.toLowerCase()
      // An object taken while the permission avatar sits on it comes out as a stand leaves it,
      // and one that is worn or detached as a detach leaves it.
      if (this.linkset.world?.avatars.some(a => a.key.toLowerCase() === agent && a.sittingOn?.linkset === this.linkset)) copy.releaseSeat()
      else if (this.clockView.inInventory || this.linkset.attachment) copy.dropSeatPermissions()
    }
    copy.state.listens.push(...structuredClone(this.state.listens))
    copy.state.listenHandleCounter = this.state.listenHandleCounter
    copy.clockView.timerIntervalMs = this.clockView.timerIntervalMs
    // A script that is down keeps how long its tick has been overdue.
    const left = this.clockView.timerNextFireMs - this.now
    copy.clockView.timerNextFireMs = copy.now + (this.running ? Math.max(0, left) : left)
    copy.clockView.timeReferenceMs = copy.now - (this.now - this.clockView.timeReferenceMs)
    copy.clockView.minEventDelayMs = this.clockView.minEventDelayMs
    copySensors(this, copy)
    copyTargets(this, copy)
    for (const kind of ['move', 'look'] as const) {
      const request = host.linkset!.prims[0]!.targetMotion[kind]
      if (request?.owner.prim === this.host.key && request.owner.script === this.scriptName) request.owner.prim = host.key
    }
    return copy
  }

  /** Queue rez lifecycle events after restoring the inventory script's saved data. */
  queueRez(): void {
    // A detached attachment comes back from inventory without the controls and camera control it held.
    if (this.clockView.inInventory) this.dropSeatPermissions()
    // A crashed LSL script runs again when its object comes out of inventory.
    // Rezzed or attached from an inventory item, it runs state_entry of the
    // state it was in, with its globals, then on_rez. A crashed SLua script
    // stays crashed and its new prim says the error again.
    if (this.crashed && this.slua) this.sayCrash()
    const revived = this.crashed && !this.slua
    if (revived) {
      this.parkedEvents.length = 0
      this.isRunning = true
      this.crashed = false
      this.started = true
      // A worn object that was detached and is worn again runs on without state_entry.
      if (!this.clockView.inInventory) this.clockView.schedule(this.now, 'state_entry')
    }
    if (!this.running) return
    if (!this.started) {
      this.started = true
      this.clockView.schedule(this.now, 'state_entry')
    }
    this.clockView.schedule(this.now, 'on_rez', { start_param: this.startParameter })
    // A worn object coming back from inventory restores its timer later, in resumeFromInventory.
    if (revived && !this.clockView.inInventory) this.clockView.catchUpTimer()
  }

  private boot(): void {
    this.started = true
    if (this.slua) {
      this.beginSluaMain()
      return
    }
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

  /**
   * llResetOtherScript on a crashed script: it reads as running at once and
   * starts over with state_entry as its next event. Nothing it held or had
   * waiting survives.
   */
  recover(): void {
    this.restart()
    this.running = true
    this.queueStart()
  }

  private restart(): void {
    this.abandon()
    this.state.memory.releaseStack()
    if (!this.slua) this.state.memory.resetLimit()
    if (this.slua) {
      // An SLua reset discards the VM and runs the script from the top again.
      const old = this.slua
      const engine = this.newSluaEngine()
      if (this.state.coverage instanceof SluaCoverage) {
        this.state.coverage.retire(old)
        this.state.coverage.attach(engine)
      }
    }
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
    for (const r of this.state.experienceRequests) r.answered = true
    this.state.controls.taken = null
    stopSensors(this)
    clearTargets(this)
    clearTargetMotion(this)
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
      // Stopped since the reset was asked for: state_entry waits for the start.
      if (!this.running) this.queueStart()
      return
    }
    if (this.slua) {
      // SLua has no states: the "first event" is running the script itself.
      if (event === 'state_entry') {
        // Only the start (or a reset) runs the script's top level.
        if (!this.slua.started) this.beginSluaMain()
        return
      }
      if (!this.slua.handles(event)) return
      if (DELAYED_EVENTS.has(event)) this.clockView.delayedUntilMs = this.now + this.clockView.minEventDelayMs
      const engine = this.slua
      const args = bindPayload(event, payload)
      this.step({ run: this.runHandler(event, () => this.sluaRun(engine.dispatch(event, args)), payload), startedAt: this.now, wakeAt: 0 })
      return
    }
    const handler = this.handlersByState.get(this.state.currentState)?.get(event)
    if (!handler) return
    if (DELAYED_EVENTS.has(event)) this.clockView.delayedUntilMs = this.now + this.clockView.minEventDelayMs
    this.begin(handler, bindPayload(event, payload), payload)
  }

  /** Whether the script handles `event` now: a handler in the current LSL state, or an SLua LLEvents handler. */
  handles(event: string): boolean {
    if (this.slua) return this.slua.handles(event)
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
    this.step({ run: this.runHandler(handler.name, () => this.runHandlerChain(handler, args), payload), startedAt: this.now, wakeAt: 0 })
  }

  private step(task: Task): void {
    this.resumedAt = this.now
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
    this.clockView.finishHandler(r.value)
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
    event: string,
    body: () => Generator<Suspension, boolean, unknown>,
    payload: Record<string, unknown>,
  ): Generator<Suspension, boolean, unknown> {
    this.state.gameControlSnapshot = event === 'game_control'
      ? (payload['gameControlSnapshot'] as GameControlSnapshot | null | undefined) ?? null : null
    enterDamageEvent(payload)
    const detected = payload['detected']
    const pushed = Array.isArray(detected) && detected.length > 0
    if (pushed) this.state.detectedStack.push({
      entries: detected as ReadonlyArray<DetectedEntry>, event,
    })
    try {
      this.state.memory.startEvent()
      return yield* body()
    } catch (e) {
      if (e instanceof RuntimeError) this.crash(e)
      throw e
    } finally {
      if (pushed) this.state.detectedStack.pop()
      this.state.gameControlSnapshot = null
      leaveDamageEvent(payload)
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
        this.state.gameControlSnapshot = null
        this.clearDamageAdjustment()
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
        stopSensors(this)
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

  /** A new SLua VM for this script, replacing any it had. */
  private newSluaEngine(): SluaEngine {
    const engine = new SluaEngine(
      {
        call: (name, args) => this.sluaCall(name, args),
        now: () => this.now,
        clock: () => this.clockView.elapsedSeconds(),
        unixTime: () => this.clockView.unixMicros() / 1e6,
        setTimer: (seconds) => this.clockView.setTimer(seconds * 1000),
        print: (text) => this.printed.push(text),
        faceTextureIsItem: (face) => faceTextureIsItem(this.host, face),
      },
      this.state.filename,
      this.sluaSource!,
      this.options.coverage ?? false,
      this.options.memoryLimit ? this.state.memory.limit : 0,
    )
    this.slua = engine
    return engine
  }

  /** Run the SLua script from the top, as a script starts. */
  private beginSluaMain(): void {
    const engine = this.slua!
    this.step({ run: this.runHandler('state_entry', () => this.sluaRun(engine.start()), {}), startedAt: this.now, wakeAt: 0 })
  }

  /** Run SLua code; true when it ended in llResetScript. */
  private *sluaRun(run: Generator<Suspension, void, unknown>): Generator<Suspension, boolean, unknown> {
    try {
      yield* run
      return false
    } catch (e) {
      if (e instanceof ResetScriptSignal) return true
      if (e instanceof HaltSignal) return false
      throw e
    } finally {
      if (this.dead) this.retireSlua()
    }
  }

  /** Stop counting a dead script's VM, keeping what it counted. */
  private retireSlua(): void {
    if (this.state.coverage instanceof SluaCoverage) this.state.coverage.retire(this.slua!)
  }

  /** An `ll.*` call from SLua: the same builtin, mock or stub an LSL script would reach. */
  private sluaCall(name: string, args: LslValue[]): { value: LslValue | undefined; delayMs: number | null } {
    const spec = BUILTIN_SPECS[name as keyof typeof BUILTIN_SPECS] as BuiltinSpec
    const engine = this.slua!
    // SLua passes floats to LSL functions as 32-bit floats.
    const lslArgs = args.map((a, i) => (spec.params[i]?.type === 'float' ? toFloat32Value(a, 'float') : a))
    let mocks = this.mocks
    // Memory is the VM's own count, answered through the usual dispatch (logging, llDie, removal).
    const vmMemory = this.sluaMemoryBuiltin(name, lslArgs)
    if (!mocks[name] && vmMemory) mocks = { ...mocks, [name]: vmMemory }
    const { result, delayMs } = invokeBuiltin({ state: this.state, mocks, script: this }, name, lslArgs)
    const value = spec.returnType === 'void' ? undefined : toFloat32Value(result ?? defaultEvalFor(spec.returnType as LslType).value, spec.returnType as LslType)
    return { value, delayMs }
  }

  /** The VM-backed implementation of a memory builtin, or undefined for the rest. */
  private sluaMemoryBuiltin(name: string, args: LslValue[]): (() => LslValue | undefined) | undefined {
    const engine = this.slua!
    switch (name) {
      case 'llGetUsedMemory':
        return () => engine.usedMemory()
      case 'llGetFreeMemory':
        return () => Math.max(0, this.state.memory.limit - engine.usedMemory())
      case 'llSetMemoryLimit':
        return () => {
          const limit = args[0] as number
          if (limit < engine.usedMemory() || limit > SLUA_MEMORY_LIMIT) return 0
          this.state.memory.limit = limit
          engine.setMemoryLimit(limit)
          return 1
        }
      case 'llScriptProfiler':
        return () => {
          engine.profileMemory(args[0] === PROFILE_SCRIPT_MEMORY)
          return undefined
        }
      case 'llGetSPMaxMemory':
        return () => engine.peakMemory()
      default:
        return undefined
    }
  }

  /** A copy of this SLua script in `host`. The copy starts afresh: SLua state isn't carried over. */
  private copySluaTo(host: Prim, fresh = false): Script {
    const coverage = this.state.coverage instanceof SluaCoverage ? this.state.coverage : null
    // An instrumented VM when the original is covered, counting into the original's collector.
    const copy = Script.fromSlua(this.sluaSource!, { ...this.options, host, coverage: coverage !== null })
    Object.assign(copy.mocks, this.mocks)
    copy.state.permissions.autoGrant = this.state.permissions.autoGrant
    if (coverage) {
      copy.state.coverage = coverage
      coverage.attach(copy.slua!)
    }
    copy.running = this.running && !this.dead
    copy.crashed = this.crashed && !fresh
    copy.crashText = this.crashText
    return copy
  }

  get running(): boolean {
    return this.isRunning
  }

  set running(value: boolean) {
    const starting = value && !this.isRunning
    this.isRunning = value
    if (value) this.crashed = false
    if (starting) this.catchUp()
  }

  /**
   * What a stopped script gets when it starts: the events that were waiting
   * when it stopped, one timer tick if any fell due, and a sensor scan if one
   * fell due.
   */
  private catchUp(): void {
    this.resumeParked()
    // A detached object's timer and sensor wait for it to be worn again.
    if (this.clockView.inInventory) return
    this.clockView.catchUpTimer()
    runMissedSensor(this)
  }

  /** Stop the script after a fatal run-time error, reporting it on DEBUG_CHANNEL. */
  private crash(error: RuntimeError): void {
    if (error.reported) return
    error.reported = true
    this.crashText = error.said
    this.sayCrash()
    this.running = false
    this.crashed = true
  }

  private sayCrash(): void {
    for (const text of [`${this.host.name} [script:${this.scriptName}] Script run-time error`, this.crashText]) {
      this.state.chat.push({ channel: DEBUG_CHANNEL, text, type: 'say' })
      this.linkset.routeChat(this.host, 'say', DEBUG_CHANNEL, text)
    }
  }

  /**
   * Mark this script as dead and cancel its timer. Used by llDie to bring
   * down every script in the linkset. Idempotent.
   */
  markDead(): void {
    this.state.lifecycle.dead = true
    this.state.urls.length = 0
    stopSensors(this)
    clearTargets(this)
    clearTargetMotion(this)
    this.clockView.cancelTimer()
    this.abandon()
    // Keep the dead VM's counts, but not the VM, once it stops running (llDie
    // lets the script carry on to its next ll call).
    if (this.slua && !this.slua.running) this.retireSlua()
  }

  /**
   * Queue again the events that were waiting when this script stopped.
   * Setting `running` to true already does this, so a test no longer needs
   * to call it; it stays for tests written before that.
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
  return last.replace(/\.(lsl|luau?)$/i, '')
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

/** The (empty) LSL program an SLua script carries for the parts of Script that read one. */
const SLUA_MEMORY_LIMIT = 131072
const SLUA_PLACEHOLDER: Ast = parse('default {}', '<slua>').script
