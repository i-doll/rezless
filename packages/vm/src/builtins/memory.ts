import type { BuiltinImpl } from '../runtime.js'
import { PROFILE_SCRIPT_MEMORY } from '../generated/constants.js'

export const llGetUsedMemory: BuiltinImpl = (ctx) => ctx.state.memory.used

export const llGetFreeMemory: BuiltinImpl = (ctx) => ctx.state.memory.limit - ctx.state.memory.used

export const llGetMemoryLimit: BuiltinImpl = (ctx) => ctx.state.memory.limit

/** llSetMemoryLimit(integer limit) — 1 and applied at once for a limit above current use, up to 65536; otherwise 0. */
export const llSetMemoryLimit: BuiltinImpl = (ctx, args) =>
  ctx.state.memory.setLimit(args[0] as number) ? 1 : 0

/** llScriptProfiler(integer flags) — PROFILE_SCRIPT_MEMORY starts tracking peak use; anything else stops it. */
export const llScriptProfiler: BuiltinImpl = (ctx, args) => {
  if (args[0] === PROFILE_SCRIPT_MEMORY) ctx.state.memory.startProfiling()
  else ctx.state.memory.profiling = false
  return undefined
}

/** llGetSPMaxMemory() — peak memory use seen by the last profiling run. */
export const llGetSPMaxMemory: BuiltinImpl = (ctx) => ctx.state.memory.peak
