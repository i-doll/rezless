import type { BuiltinImpl, CallContext, ScriptState } from './runtime.js'
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
 */
export function callBuiltin(
  dctx: DispatchContext,
  name: string,
  args: ReadonlyArray<LslValue>,
): LslValue | undefined {
  const spec = specFor(name)
  const impl = dctx.mocks[name] ?? own(REAL_BUILTINS, name) ?? makeStub(name)
  const ctx: CallContext = {
    state: dctx.state,
    spec,
    script: dctx.script,
    prim: dctx.script.host,
    linkset: dctx.script.linkset,
  }
  const result = impl(ctx, args)
  dctx.state.calls.push({ name, args, returned: result })
  // Call log timestamps when the script invoked the function (pre-delay);
  // advance the clock after the push so subsequent calls see the throttle.
  if (spec && spec.delay > 0) {
    dctx.state.clock.advance(spec.delay * 1000)
  }
  return result
}

function makeStub(name: string): BuiltinImpl {
  const spec = specFor(name)
  if (!spec) {
    return () => {
      throw new Error(`LSL function '${name}' has no implementation (not in the LSL definitions; use script.mock to provide it)`)
    }
  }
  return () => defaultValueFor(spec.returnType)
}
