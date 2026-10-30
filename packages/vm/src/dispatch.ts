import type { BuiltinImpl, CallContext, Run, ScriptState } from './runtime.js'
import type { LslValue } from './values/types.js'
import { defaultValueFor } from './values/types.js'
import { BUILTIN_SPECS } from './generated/functions.js'
import type { BuiltinSpec } from './generated/functions.js'
import { REAL_BUILTINS } from './builtins/index.js'
import type { Script } from './script.js'
import { own } from './own.js'

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
  const result = impl(ctx, args)
  dctx.state.calls.push({ name, args, returned: result })
  const delayMs = spec ? spec.delay * 1000 : 0
  if (sleptMs !== null || delayMs > 0) yield { until: dctx.state.clock.now + (sleptMs ?? 0) + delayMs }
  return result
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
