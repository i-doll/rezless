import type { BuiltinImpl, CallContext, ScriptState } from './runtime.js'
import type { LslValue } from './values/types.js'
import { defaultValueFor } from './values/types.js'
import { BUILTIN_SPECS } from './generated/functions.js'
import type { BuiltinSpec } from './generated/functions.js'
import { REAL_BUILTINS } from './builtins/index.js'
import type { Script } from './script.js'

/** Look up the kwdb-derived spec for a function name, if any. */
export function specFor(name: string): BuiltinSpec | undefined {
  return (BUILTIN_SPECS as Record<string, BuiltinSpec>)[name]
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
 */
export function callBuiltin(
  dctx: DispatchContext,
  name: string,
  args: ReadonlyArray<LslValue>,
): LslValue | undefined {
  const spec = specFor(name)
  const impl = dctx.mocks[name] ?? REAL_BUILTINS[name] ?? makeStub(name)
  const ctx: CallContext = {
    state: dctx.state,
    spec,
    script: dctx.script,
    prim: dctx.script.host,
    linkset: dctx.script.linkset,
  }
  const result = impl(ctx, args)
  dctx.state.calls.push({ name, args, returned: result })
  return result
}

function makeStub(name: string): BuiltinImpl {
  const spec = specFor(name)
  if (!spec) {
    return () => {
      throw new Error(`unknown LSL function '${name}' (not in kwdb; use script.mock to provide it)`)
    }
  }
  return () => defaultValueFor(spec.returnType)
}
