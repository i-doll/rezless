import type { BuiltinImpl, CallContext } from '../runtime.js'
import { requestKey } from '../keys.js'

/**
 * A pending dataserver request. LSL has a small zoo of llRequest*
 * functions that each return a key and later fire the `dataserver` event
 * with the result. We model them all the same way: capture the request,
 * generate a key, expose for tests to respond to via Script.respondToDataserver.
 */
export interface DataserverRequestEntry {
  readonly key: string
  /** "agent_data", "inventory_data", "simulator_data", … — origin builtin name. */
  readonly source: string
  /** Raw arguments captured for assertion convenience. */
  readonly args: ReadonlyArray<unknown>
  fulfilled: boolean
}

export function nextDataserverKey(ctx: CallContext): string {
  ctx.state.dataserverKeyCounter += 1
  return requestKey(ctx, 'dataserver', ctx.state.dataserverKeyCounter)
}

function record(
  ctx: CallContext,
  source: string,
  args: ReadonlyArray<unknown>,
): string {
  const key = nextDataserverKey(ctx)
  ctx.state.dataserverRequests.push({ key, source, args, fulfilled: false })
  return key
}

/** llRequestAgentData(key id, integer data) → request key */
export const llRequestAgentData: BuiltinImpl = (ctx, args) =>
  record(ctx, 'agent_data', [args[0], args[1]])

/** llRequestInventoryData(string name) → request key */
export const llRequestInventoryData: BuiltinImpl = (ctx, args) =>
  record(ctx, 'inventory_data', [args[0]])

/** llRequestSimulatorData(string region, integer data) → request key */
export const llRequestSimulatorData: BuiltinImpl = (ctx, args) =>
  record(ctx, 'simulator_data', [args[0], args[1]])

/** llRequestUsername(key id) → request key */
export const llRequestUsername: BuiltinImpl = (ctx, args) =>
  record(ctx, 'username', [args[0]])

/** llRequestDisplayName(key id) → request key */
export const llRequestDisplayName: BuiltinImpl = (ctx, args) =>
  record(ctx, 'display_name', [args[0]])
