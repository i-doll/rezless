import type { LslValue } from './values/types.js'
import type { BuiltinSpec } from './generated/functions.js'
import type { ScriptClockView } from './clock.js'
import type { Mulberry32 } from './random.js'
import type { Prim } from './prim.js'
import type { Linkset } from './linkset.js'
import type { Script } from './script.js'
import type { CoverageCollector } from './coverage.js'

/** Script-identity values exposed via llGetOwner / llGetKey / etc. */
export interface ScriptIdentity {
  /** Linkset owner key. */
  readonly owner: string
  /** Prim key (delegated to host prim). */
  readonly objectKey: string
  /** Prim name; mutated by llSetObjectName. */
  objectName: string
  /** Script's inventory name. */
  readonly scriptName: string
}

export type ChatType = 'say' | 'shout' | 'whisper' | 'regionSay' | 'regionSayTo' | 'ownerSay' | 'im'

export interface ChatEntry {
  readonly channel: number
  readonly text: string
  readonly type: ChatType
  /** For `regionSayTo` / `instantMessage`: the target avatar/object key. */
  readonly to?: string
}

export interface CallEntry {
  readonly name: string
  readonly args: ReadonlyArray<LslValue>
  readonly returned: LslValue | undefined
}

/**
 * Mutable state owned by a single Script instance. Built-ins and the
 * interpreter both read and write this; the public Script handle exposes
 * curated views.
 *
 * `linksetData` and `appearance` are aliased to the host linkset / prim's
 * storage so existing builtins that read `ctx.state.linksetData` /
 * `ctx.state.appearance` keep working unchanged across multi-script setups.
 */
export interface ScriptState {
  /** Current LSL state name. Starts at "default". */
  currentState: string
  readonly chat: ChatEntry[]
  readonly calls: CallEntry[]
  readonly clock: ScriptClockView
  readonly httpRequests: import('./builtins/http.js').HttpRequestEntry[]
  /** Monotonic counter feeding deterministic HTTP request keys. */
  httpKeyCounter: number
  readonly listens: import('./builtins/listen.js').ListenEntry[]
  /** Monotonic counter for llListen handles. */
  listenHandleCounter: number
  readonly random: Mulberry32
  identity: ScriptIdentity
  /** Per-script capture of llMessageLinked invocations from this script. */
  readonly linkedMessages: import('./builtins/linked.js').LinkedMessageEntry[]
  readonly dataserverRequests: import('./builtins/dataserver.js').DataserverRequestEntry[]
  /** Monotonic counter for dataserver request keys. */
  dataserverKeyCounter: number
  /**
   * Stack of detected contexts pushed during touch / sensor / collision
   * handler invocation. Top-of-stack is the active context for llDetected*.
   */
  readonly detectedStack: import('./builtins/detected.js').DetectedContext[]
  /**
   * Linkset Data store — aliased to `linkset.linksetData`. Survives
   * llResetScript (the LSD store is owned by the linkset). `password === ''`
   * means the entry is unprotected. Map insertion order matches the LSL
   * contract that llLinksetDataListKeys returns keys in write order.
   */
  readonly linksetData: Map<string, import('./builtins/linksetdata.js').LinksetDataEntry>
  /**
   * Prim appearance — aliased to `prim.appearance`. Set by llSetText /
   * llSetObjectDesc / etc.
   */
  appearance: {
    text: { text: string; color: { x: number; y: number; z: number }; alpha: number } | null
    description: string
  }
  /** Lifecycle flags — `dead` is set when llDie runs. */
  lifecycle: {
    dead: boolean
  }
  /** Source filename used for coverage attribution. "<inline>" for inline-source loads. */
  readonly filename: string
  /** Original LSL source — kept for LCOV / Istanbul line maps. Empty when caller didn't supply it. */
  readonly source: string
  /** Coverage collector when enabled, otherwise null. Hooks short-circuit on null. */
  coverage: CoverageCollector | null
}

export type BuiltinImpl = (ctx: CallContext, args: ReadonlyArray<LslValue>) => LslValue | undefined

export interface CallContext {
  readonly state: ScriptState
  readonly spec: BuiltinSpec | undefined
  readonly script: Script
  readonly prim: Prim
  readonly linkset: Linkset
}
