/**
 * Runs an SLua script in SLua's own VM, compiled to WebAssembly
 * (wasm/slua.wasm, built by scripts/build-slua-wasm.sh from
 * native/slua-bridge.cpp). One instance per script.
 *
 * The VM calls back into rezless for every `ll.*` / `llcompat.*` function
 * SLua doesn't implement itself, for the clock, for LLTimers' timer and for
 * event handler registration. `ll.*` calls are translated as SLua's native
 * `ll` table does: 0-based index arguments and results become 1-based
 * (-1 becomes nil), boolean-like results become booleans, keys become uuids
 * and lists become tables. `llcompat.*` keeps LSL's values.
 */
import { readFileSync } from 'node:fs'
import type { LslType, LslValue, Rotation, Vector } from '../values/types.js'
import { isRotation, toFloat32Value, toInt32 } from '../values/types.js'
import { listElementTypes, markLuaNumbers, typedList } from '../values/list-types.js'
import { BUILTIN_SPECS } from '../generated/functions.js'
import type { BuiltinSpec } from '../generated/functions.js'
import { EVENT_SPECS } from '../generated/events.js'
import type { EventSpec } from '../generated/events.js'
import type { EvalResult } from '../values/types.js'
import type { Suspension } from '../runtime.js'
import { own } from '../own.js'
import { RuntimeError } from '../memory.js'

/** What the engine needs from the script hosting it. */
export interface SluaHost {
  /**
   * Run builtin `name` with LSL arguments now: its result, and how long the
   * script must then sleep (null for not at all). Throws to stop the script
   * (llDie, llResetScript, a crash).
   */
  call(name: string, args: LslValue[]): { value: LslValue | undefined; delayMs: number | null }
  /** Virtual time in milliseconds. */
  now(): number
  /** The script's clock in seconds (since it started or reset): ll.GetTime, os.clock, LLTimers. */
  clock(): number
  /** Unix time in seconds, for os.time. */
  unixTime(): number
  /** LLTimers' timer: seconds until the next `timer` event, 0 to stop. */
  setTimer(seconds: number): void
  /** Text from Lua's print(). */
  print(text: string): void
}

/** A script that failed to compile. */
export class SluaCompileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SluaCompileError'
  }
}

/** A run-time error raised inside the VM: the script crashes, as in SL. */
export class SluaRuntimeError extends RuntimeError {
  constructor(message: string) {
    super(message)
    this.name = 'SluaRuntimeError'
  }
}

/** One coverage plan entry from the instrumenter. */
interface PlanEntryBase {
  readonly id: number
  readonly line: number
  readonly col: number
  readonly kind: string
}

/** One counter the instrumentation added: a statement, a branch (with whether it has an else) or a function. */
export type SluaPlanEntry =
  | (PlanEntryBase & { readonly t: 's' })
  | (PlanEntryBase & { readonly t: 'b'; readonly else: boolean })
  | (PlanEntryBase & { readonly t: 'f'; readonly name: string })

const enum Status {
  Ok = 0,
  Yield = 1,
  Break = 6,
}

const enum T {
  Nil = 0,
  Boolean = 1,
  Number = 2,
  Integer = 3,
  String = 4,
  Vector = 5,
  Quaternion = 6,
  Uuid = 7,
  Table = 8,
  Function = 9,
}

/** The parts of the WebAssembly API used here (this package's TS lib has no DOM types). */
interface WasmMemory {
  readonly buffer: ArrayBuffer
}
interface WasmApi {
  Module: new (bytes: Uint8Array) => object
  Instance: new (module: object, imports: Record<string, Record<string, unknown>>) => { readonly exports: object }
}
const wasm = (globalThis as unknown as { WebAssembly: WasmApi }).WebAssembly

const RZ_ERROR = -2
const RZ_KILL = -3

interface Exports {
  memory: WasmMemory
  _initialize(): void
  rz_new(): number
  rz_add_ll(s: number, name: number, fn: number, replace: number): void
  rz_load(s: number, name: number, source: number, len: number, coverage: number): number
  rz_event_thread(s: number, event: number): number
  rz_main_thread(s: number): number
  rz_instance_thread(s: number): number
  rz_resume(s: number, t: number, nargs: number): number
  rz_string(s: number): number
  rz_string_len(s: number): number
  rz_used_memory(s: number): number
  rz_plan(s: number): number
  rz_plan_len(s: number): number
  rz_hits(s: number, kind: number): number
  rz_request_break(s: number): void
  rz_set_memory_limit(s: number, limit: number): void
  rz_isnumber(L: number, i: number): number
  rz_typename(s: number, L: number, i: number): void
  rz_gettop(L: number): number
  rz_settop(L: number, top: number): void
  rz_type(L: number, i: number): number
  rz_tonumber(L: number, i: number): number
  rz_toboolean(L: number, i: number): number
  rz_tostring(s: number, L: number, i: number): void
  rz_tovector(L: number, i: number): number
  rz_toquaternion(L: number, i: number): number
  rz_objlen(L: number, i: number): number
  rz_rawgeti(L: number, i: number, n: number): void
  rz_pop(L: number, n: number): void
  rz_pushnil(L: number): void
  rz_pushboolean(L: number, b: number): void
  rz_pushnumber(L: number, n: number): void
  rz_pushstring(L: number, s: number, len: number): void
  rz_pushuuid(L: number, s: number, len: number): void
  rz_pushvector(L: number, x: number, y: number, z: number): void
  rz_pushquaternion(L: number, x: number, y: number, z: number, w: number): void
  rz_newtable(L: number, n: number): void
  rz_rawseti(L: number, i: number, n: number): void
  rz_getglobal(s: number, name: number): void
  rz_setglobal(s: number, name: number): void
  rz_buffer(size: number): number
}

let module: object | null = null

function wasmModule(): object {
  module ??= new wasm.Module(readFileSync(new URL('../../wasm/slua.wasm', import.meta.url)))
  return module
}

/** Every LSL function rezless can answer, by index; SLua's removed ones left out. */
const LL_FUNCTIONS: ReadonlyArray<BuiltinSpec> = Object.values(BUILTIN_SPECS as Record<string, BuiltinSpec>).filter(
  (s) => !s.slua?.removed,
)

const utf8 = new TextEncoder()
const fromUtf8 = new TextDecoder()

export class SluaEngine {
  private readonly x: Exports
  private readonly s: number
  /** Sleep the script owes (ms), taken at its next break or when the code finishes. */
  private sleepMs: number | null = null
  /** Why an ll call stopped the script, rethrown once the VM has unwound. */
  private pendingThrow: unknown = null
  /** Whether the script's top level has run. */
  started = false
  /** Threads being run (more than one when an ll call fires an event into the script). */
  private depth = 0
  private readonly handlerCounts = new Map<string, number>()
  readonly plan: ReadonlyArray<SluaPlanEntry>

  constructor(
    private readonly host: SluaHost,
    name: string,
    source: string,
    coverage: boolean,
    private readonly memoryLimit = 0,
  ) {
    let x!: Exports
    const view = () => new DataView(x.memory.buffer)
    const instance = new wasm.Instance(wasmModule(), {
      rezless: {
        rz_call: (L: number, fn: number, compat: number, nargs: number) => this.call(L, fn, compat !== 0, nargs),
        rz_clock: () => this.host.clock(),
        rz_set_timer: (seconds: number) => this.host.setTimer(seconds),
        rz_event_registered: (ptr: number, len: number, registered: number) => {
          const event = this.readUtf8(ptr, len)
          // SLua refuses a handler for an event the host doesn't deliver.
          if (!supportedEvent(event)) return 0
          this.handlerCounts.set(event, Math.max(0, (this.handlerCounts.get(event) ?? 0) + (registered ? 1 : -1)))
          return 1
        },
        rz_print: (ptr: number, len: number) => this.host.print(this.readUtf8(ptr, len)),
      },
      wasi_snapshot_preview1: {
        clock_time_get: (_id: number, _precision: bigint, out: number) => {
          view().setBigUint64(out, BigInt(Math.round(this.host.unixTime() * 1e9)), true)
          return 0
        },
        /* istanbul ignore next -- the VM never exits */
        proc_exit: (code: number) => {
          throw new Error(`SLua VM exited (${code})`)
        },
        /* istanbul ignore next -- the VM writes nothing to stdout or stderr: print is redirected */
        fd_write: (_fd: number, iovs: number, count: number, written: number) => {
          let total = 0
          for (let i = 0; i < count; i++) total += view().getUint32(iovs + i * 8 + 4, true)
          view().setUint32(written, total, true)
          return 0
        },
        /* istanbul ignore next -- the VM opens no files: builtins are embedded */
        fd_close: () => 0,
        /* istanbul ignore next -- the VM opens no files: builtins are embedded */
        fd_seek: () => 70,
        /* istanbul ignore next -- the VM opens no files: builtins are embedded */
        fd_read: () => 8,
        environ_sizes_get: (count: number, size: number) => {
          view().setUint32(count, 0, true)
          view().setUint32(size, 0, true)
          return 0
        },
        environ_get: () => 0,
      },
      env: { emscripten_notify_memory_growth: () => {} },
    })
    x = instance.exports as unknown as Exports
    this.x = x
    x._initialize()
    this.s = x.rz_new()
    LL_FUNCTIONS.forEach((spec, fn) => x.rz_add_ll(this.s, this.cString(spec.name.slice(2)), fn, 0))
    if (memoryLimit > 0) x.rz_set_memory_limit(this.s, memoryLimit)
    // Source and name share one buffer: source, NUL, name, NUL.
    const bytes = utf8.encode(source)
    const nameBytes = utf8.encode(name)
    const sourcePtr = x.rz_buffer(bytes.length + nameBytes.length + 2)
    const namePtr = sourcePtr + bytes.length + 1
    const mem = new Uint8Array(x.memory.buffer)
    mem.set(bytes, sourcePtr)
    mem[sourcePtr + bytes.length] = 0
    mem.set(nameBytes, namePtr)
    mem[namePtr + nameBytes.length] = 0
    if (x.rz_load(this.s, namePtr, sourcePtr, bytes.length, coverage ? 1 : 0) !== 0) {
      throw new SluaCompileError(this.scratch())
    }
    this.plan = coverage ? (JSON.parse(this.readUtf8(x.rz_plan(this.s), x.rz_plan_len(this.s))) as SluaPlanEntry[]) : []
  }

  /** Run the script's main chunk, as a script starts. */
  *start(): Generator<Suspension, void, unknown> {
    this.started = true
    // A script whose code alone takes all its memory can't run at all. (SLua's
    // host only checks as the script allocates; rezless refuses it up front, as
    // it does an LSL script whose code is past its limit.)
    if (this.memoryLimit > 0 && this.usedMemory() >= this.memoryLimit) throw new SluaRuntimeError('not enough memory')
    yield* this.drive(this.x.rz_main_thread(this.s), 0)
  }


  /** Deliver an LSL event (arguments as the LSL interpreter binds them) to LLEvents' handlers. */
  *dispatch(event: string, args: ReadonlyArray<EvalResult>): Generator<Suspension, void, unknown> {
    const spec = own(EVENT_SPECS as Record<string, EventSpec>, event)
    const L = this.x.rz_event_thread(this.s, this.cString(event))
    const boolParams = new Set(spec?.slua?.boolParams ?? [])
    const stringParams = new Set(spec?.slua?.stringParams ?? [])
    args.forEach((a, i) => {
      if (boolParams.has(i)) this.x.rz_pushboolean(L, (a.value as number) !== 0 ? 1 : 0)
      else if (stringParams.has(i)) this.pushString(L, a.value as string)
      else this.push(L, a.value, a.type, false)
    })
    yield* this.drive(L, 2 + args.length)
  }

  /** Whether any LLEvents handler (LLTimers' included) listens for `event`. */
  handles(event: string): boolean {
    return (this.handlerCounts.get(event) ?? 0) > 0
  }

  /** The script's global `name` as an LSL value, or undefined if it is nil or not convertible. */
  global(name: string): LslValue | undefined {
    const L = this.x.rz_instance_thread(this.s)
    this.x.rz_getglobal(this.s, this.cString(name))
    try {
      return this.read(L, -1)?.value
    } finally {
      this.x.rz_pop(L, 1)
    }
  }

  /** Set the script's global `name`. */
  setGlobal(name: string, value: LslValue, type: LslType): void {
    const L = this.x.rz_instance_thread(this.s)
    this.push(L, value, type, false)
    this.x.rz_setglobal(this.s, this.cString(name))
  }

  /** Bytes the script's own objects and bytecode take, as SLua counts them. */
  usedMemory(): number {
    return this.x.rz_used_memory(this.s)
  }

  /** Coverage counts, by plan id: statements, [true, false] per branch, functions. */
  hits(): { statements: Int32Array; branches: Int32Array; functions: Int32Array } {
    const count = (t: SluaPlanEntry['t']) => this.plan.filter((p) => p.t === t).length
    const read = (kind: number, n: number) => new Int32Array(this.x.memory.buffer, this.x.rz_hits(this.s, kind), n).slice()
    return {
      statements: read(0, count('s')),
      branches: read(1, count('b') * 2),
      functions: read(2, count('f')),
    }
  }

  // ---- Running threads ----

  /**
   * Run a thread to the end. As SLua's host does, a sleep is taken when the
   * script breaks at its next yieldable point (or when it finishes), and a
   * stop unwinds the VM with an uncatchable error before it is rethrown here.
   */
  /** Whether the script is in the middle of running. */
  get running(): boolean {
    return this.depth > 0
  }

  private *drive(L: number, nargs: number): Generator<Suspension, void, unknown> {
    this.depth++
    try {
      yield* this.run(L, nargs)
    } finally {
      this.depth--
    }
  }

  private *run(L: number, nargs: number): Generator<Suspension, void, unknown> {
      let status = this.x.rz_resume(this.s, L, nargs)
      for (;;) {
        if (this.pendingThrow !== null) {
          const e = this.pendingThrow
          this.pendingThrow = null
          this.sleepMs = null
          throw e
        }
        if (status === Status.Break) {
          yield* this.sleep()
          status = this.x.rz_resume(this.s, L, 0)
          continue
        }
        if (status === Status.Yield) {
          // A bare coroutine.yield() on the handler thread is preemption: carry
          // on. Values are reserved for the engine (Executor/src/Script.cpp).
          if (this.x.rz_gettop(L) > 0) throw new SluaRuntimeError('unexpected yield')
          status = this.x.rz_resume(this.s, L, 0)
          continue
        }
        break
      }
      if (status !== Status.Ok) throw new SluaRuntimeError(this.scratch())
      // A sleep the script never reached a yieldable point for.
      yield* this.sleep()
  }

  private *sleep(): Generator<Suspension, void, unknown> {
    if (this.sleepMs === null) return
    const ms = this.sleepMs
    this.sleepMs = null
    yield { until: this.host.now() + ms }
  }

  /** An `ll.*` / `llcompat.*` call from the VM. */
  private call(L: number, fn: number, compat: boolean, nargs: number): number {
    const spec = LL_FUNCTIONS[fn]!
    const args = this.readArgs(L, spec, compat, nargs)
    if (typeof args === 'string') {
      this.pushString(L, args)
      return RZ_ERROR
    }
    let result: { value: LslValue | undefined; delayMs: number | null }
    try {
      result = this.host.call(spec.name, args)
    } catch (e) {
      // Script control flow (llDie, llResetScript, crashes) and harness errors.
      this.pendingThrow = e
      return RZ_KILL
    }
    if (result.delayMs !== null) {
      this.sleepMs = (this.sleepMs ?? 0) + result.delayMs
      this.x.rz_request_break(this.s)
    }
    return this.pushResult(L, spec, compat, result.value)
  }

  /**
   * The call's arguments as the LSL function takes them, or the error SLua
   * raises for a missing or wrong-typed one (as luaL_typeerror words it).
   */
  private readArgs(L: number, spec: BuiltinSpec, compat: boolean, nargs: number): LslValue[] | string {
    const indexParams = new Set(spec.slua?.indexParams ?? [])
    const boolParams = new Set(spec.slua?.boolParams ?? [])
    const uuidParams = new Set(spec.slua?.uuidParams ?? [])
    const integerLists = new Set(spec.slua?.integerListParams ?? [])
    const name = spec.name.slice(2)
    const args: LslValue[] = []
    for (const [i, p] of spec.params.entries()) {
      const slot = i + 1
      const expected = EXPECTED[p.type]!
      if (slot > nargs) return `missing argument #${slot} to '${name}' (${expected} expected)`
      const value = this.readArg(L, slot, p.type, { boolean: boolParams.has(i), uuid: uuidParams.has(i), integers: integerLists.has(i) })
      if (value === undefined) {
        this.x.rz_typename(this.s, L, slot)
        const got = this.scratch()
        return `invalid argument #${slot} to '${name}' (${expected} expected, got ${got})`
      }
      if (typeof value === 'object' && 'error' in value) return value.error
      let v = value
      if (indexParams.has(i) && !compat) {
        const n = v as number
        if (n === 0) return 'passed 0 when a 1-based index was expected'
        if (n >= 1) v = n - 1
      }
      args.push(v)
    }
    return args
  }

  /**
   * Argument `slot` as LSL parameter type `type` takes it, as luaL_check*
   * would accept it (numbers from numeric strings, strings from numbers as
   * Lua formats them), undefined if it is the wrong type, or an error for a
   * list holding something LSL can't.
   */
  private readArg(
    L: number,
    slot: number,
    type: LslType,
    takes: { boolean: boolean; uuid: boolean; integers: boolean },
  ): LslValue | { error: string } | undefined {
    const x = this.x
    const t = x.rz_type(L, slot)
    const numeric = t === T.Number || t === T.Integer || (t === T.String && x.rz_isnumber(L, slot) !== 0)
    switch (type) {
      case 'integer':
        if (takes.boolean && t === T.Boolean) return x.rz_toboolean(L, slot)
        return numeric ? toInt32(Math.trunc(x.rz_tonumber(L, slot))) : undefined
      case 'float':
        return numeric ? x.rz_tonumber(L, slot) : undefined
      case 'string':
        // luaL_checkstring: strings, and numbers as Lua formats them.
        if (t !== T.String && t !== T.Number && !(takes.uuid && t === T.Uuid)) return undefined
        x.rz_tostring(this.s, L, slot)
        return this.scratch()
      case 'key':
        if (t !== T.String && t !== T.Uuid) return undefined
        x.rz_tostring(this.s, L, slot)
        return this.scratch()
      case 'list':
        return t === T.Table ? this.readList(L, slot, takes.integers) : undefined
      default: {
        const want = type === 'vector' ? T.Vector : T.Quaternion
        return t === want ? this.read(L, slot)!.value : undefined
      }
    }
  }

  /** A table as an LSL list, as SLua's own list functions read one. */
  private readList(L: number, slot: number, integers: boolean): LslValue | { error: string } {
    const x = this.x
    const n = x.rz_objlen(L, slot)
    const values: LslValue[] = []
    const types: LslType[] = []
    for (let k = 1; k <= n; k++) {
      x.rz_rawgeti(L, slot, k)
      const el = this.readElement(L, -1)
      x.rz_pop(L, 1)
      if (!el) return { error: 'non-LSL value in list' }
      if (integers && el.type === 'float' && Number.isInteger(el.value)) {
        values.push(toInt32(el.value as number))
        types.push('integer')
        continue
      }
      // LSL floats are 32-bit.
      values.push(toFloat32Value(el.value, el.type))
      types.push(el.type)
    }
    return markLuaNumbers(typedList(values, types))
  }

  private pushResult(L: number, spec: BuiltinSpec, compat: boolean, value: LslValue | undefined): number {
    if (spec.returnType === 'void') return 0
    // The host fills in a result for every non-void call.
    const v = value!
    // Index and boolean results are integers. (On a list result such as
    // llGetPrimitiveParams, bool-semantics marks boolean entries inside the
    // list, which depend on the rules asked for; those stay integers here.)
    const integer = spec.returnType === 'integer'
    if (!compat && integer && spec.slua?.returnIndex) {
      const n = v as number
      if (n === -1) this.x.rz_pushnil(L)
      else this.x.rz_pushnumber(L, n >= 0 ? n + 1 : n)
      return 1
    }
    if (!compat && integer && spec.slua?.returnBool) {
      this.x.rz_pushboolean(L, (v as number) !== 0 ? 1 : 0)
      return 1
    }
    this.push(L, v, spec.returnType, compat)
    return 1
  }

  // ---- Values ----

  /** The value at stack slot `i` as an LSL value: a table as a list of its LSL elements. */
  private read(L: number, i: number): EvalResult | undefined {
    if (this.x.rz_type(L, i) !== T.Table) return this.readElement(L, i)
    const n = this.x.rz_objlen(L, i)
    const values: LslValue[] = []
    const types: LslType[] = []
    for (let k = 1; k <= n; k++) {
      this.x.rz_rawgeti(L, i, k)
      const el = this.readElement(L, -1)
      this.x.rz_pop(L, 1)
      if (!el) continue
      values.push(el.value)
      types.push(el.type)
    }
    return { type: 'list', value: typedList(values, types) }
  }

  /** A value LSL lists can hold, or undefined (nil, tables, functions and the rest). */
  private readElement(L: number, i: number): EvalResult | undefined {
    const x = this.x
    switch (x.rz_type(L, i)) {
      case T.Boolean:
        return { type: 'integer', value: x.rz_toboolean(L, i) }
      case T.Integer:
        return { type: 'integer', value: toInt32(x.rz_tonumber(L, i)) }
      case T.Number:
        return { type: 'float', value: x.rz_tonumber(L, i) }
      case T.String:
        x.rz_tostring(this.s, L, i)
        return { type: 'string', value: this.scratch() }
      case T.Uuid:
        x.rz_tostring(this.s, L, i)
        return { type: 'key', value: this.scratch() }
      case T.Vector: {
        const p = x.rz_tovector(L, i)
        const f = new Float32Array(x.memory.buffer, p, 3)
        return { type: 'vector', value: { x: f[0]!, y: f[1]!, z: f[2]! } }
      }
      case T.Quaternion: {
        const p = x.rz_toquaternion(L, i)
        const f = new Float32Array(x.memory.buffer, p, 4)
        return { type: 'rotation', value: { x: f[0]!, y: f[1]!, z: f[2]!, s: f[3]! } }
      }
      default:
        return undefined
    }
  }

  /** Push an LSL value as SLua represents it: keys as uuids, lists as tables. */
  private push(L: number, value: LslValue, type: LslType, compat: boolean): void {
    const x = this.x
    switch (type) {
      case 'integer':
      case 'float':
        x.rz_pushnumber(L, value as number)
        return
      case 'string':
        this.pushString(L, value as string)
        return
      case 'key': {
        const bytes = utf8.encode(value as string)
        const p = x.rz_buffer(bytes.length)
        new Uint8Array(x.memory.buffer).set(bytes, p)
        x.rz_pushuuid(L, p, bytes.length)
        return
      }
      case 'vector': {
        const v = value as Vector
        x.rz_pushvector(L, v.x, v.y, v.z)
        return
      }
      case 'rotation': {
        const r = value as Rotation
        x.rz_pushquaternion(L, r.x, r.y, r.z, r.s)
        return
      }
      case 'list': {
        const list = value as ReadonlyArray<LslValue>
        const types = listElementTypes(list)
        x.rz_newtable(L, list.length)
        list.forEach((el, k) => {
          this.push(L, el, types?.[k] ?? inferType(el), compat)
          x.rz_rawseti(L, -2, k + 1)
        })
        return
      }
      /* istanbul ignore next -- only 'void' is left, and void results push nothing */
      default:
        x.rz_pushnil(L)
    }
  }

  private pushString(L: number, s: string): void {
    const bytes = utf8.encode(s)
    const p = this.x.rz_buffer(bytes.length)
    new Uint8Array(this.x.memory.buffer).set(bytes, p)
    this.x.rz_pushstring(L, p, bytes.length)
  }

  private cString(s: string): number {
    const bytes = utf8.encode(s)
    const p = this.x.rz_buffer(bytes.length)
    const mem = new Uint8Array(this.x.memory.buffer)
    mem.set(bytes, p)
    mem[p + bytes.length] = 0
    return p
  }

  private readUtf8(ptr: number, len: number): string {
    return fromUtf8.decode(new Uint8Array(this.x.memory.buffer, ptr, len))
  }

  private scratch(): string {
    return this.readUtf8(this.x.rz_string(this.s), this.x.rz_string_len(this.s))
  }
}

/** Whether SLua delivers `event` to LLEvents handlers. */
function supportedEvent(event: string): boolean {
  const spec = own(EVENT_SPECS as Record<string, EventSpec>, event)
  return spec !== undefined && !spec.slua?.removed
}

/** What an error message calls each LSL parameter type. */
const EXPECTED: Partial<Record<LslType, string>> = {
  integer: 'number',
  float: 'number',
  string: 'string',
  key: 'uuid',
  vector: 'vector',
  rotation: 'quaternion',
  list: 'table',
}

/** The type of an untyped list element (from a mock). Lists don't nest, so the rest are vectors. */
function inferType(v: LslValue): LslType {
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'float'
  if (typeof v === 'string') return 'string'
  return isRotation(v) ? 'rotation' : 'vector'
}
