import type { BuiltinImpl, CallContext, Run, ScriptState } from './runtime.js'
import type { LslValue } from './values/types.js'
import { defaultValueFor } from './values/types.js'
import { BUILTIN_SPECS } from './generated/functions.js'
import type { BuiltinSpec } from './generated/functions.js'
import { REAL_BUILTINS } from './builtins/index.js'
import type { Script } from './script.js'
import { own } from './own.js'
import { HaltSignal } from './builtins/object.js'

/** Look up the generated spec for a function name, if any. */
export function specFor(name: string): BuiltinSpec | undefined {
  return own(BUILTIN_SPECS as Record<string, BuiltinSpec>, name)
}

export interface DispatchContext {
  readonly state: ScriptState
  readonly mocks: Readonly<Record<string, BuiltinImpl>>
  readonly script: Script
}

/**
 * Resolve and invoke an `ll*` function call.
 *
 * Resolution order: user mock > real built-in > generated stub > error.
 * Every successful call (including stubs) is appended to ScriptState.calls.
 * A builtin that sleeps or has a delay suspends the script after it returns.
 */
export function* callBuiltin(
  dctx: DispatchContext,
  name: string,
  args: ReadonlyArray<LslValue>,
): Run<LslValue | undefined> {
  const { result, delayMs } = invokeBuiltin(dctx, name, args)
  if (delayMs !== null) yield { until: dctx.state.clock.now + delayMs }
  return result
}

/**
 * Run a builtin now: its result, and how long the script must then sleep
 * (its own sleeps plus the function's forced delay), or null when it doesn't
 * (a zero-length llSleep still suspends). SLua's host returns the result first
 * and sleeps after; callBuiltin does both in order.
 */
export function invokeBuiltin(
  dctx: DispatchContext,
  name: string,
  args: ReadonlyArray<LslValue>,
): { result: LslValue | undefined; delayMs: number | null } {
  const spec = specFor(name)
  const impl = dctx.mocks[name] ?? own(REAL_BUILTINS, name) ?? makeStub(dctx.script, name)
  let sleptMs: number | null = null
  const ctx: CallContext = {
    state: dctx.state,
    spec,
    script: dctx.script,
    prim: dctx.script.host,
    linkset: dctx.script.linkset,
    sleep: (ms) => {
      sleptMs = (sleptMs ?? 0) + ms
    },
  }
  const dying = dctx.state.lifecycle.dying
  const removed = dctx.state.lifecycle.removed
  if (removed && name !== 'llOwnerSay') throw new HaltSignal()
  const result = impl(ctx, args)
  dctx.state.calls.push({ name, args, returned: result })
  if (dying) throw new HaltSignal()
  // A call that moved the calling script away (a no-copy gift or load) leaves it nothing to sleep in.
  if (!removed && dctx.state.lifecycle.removed) return { result, delayMs: null }
  const delayMs = spec ? spec.delay * 1000 : 0
  return { result, delayMs: sleptMs === null && delayMs === 0 ? null : (sleptMs ?? 0) + delayMs }
}

function makeStub(script: Script, name: string): BuiltinImpl {
  const spec = specFor(name)
  if (!spec) {
    return () => {
      throw new Error(`LSL function '${name}' has no implementation (not in the LSL definitions; use script.mock to provide it)`)
    }
  }
  return () => {
    script.reportStub(name)
    return defaultValueFor(spec.returnType)
  }
}
