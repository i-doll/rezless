import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { LslValue, Vector } from '../values/types.js'
import { truncateUtf8 } from '../values/utf8.js'
import { NULL_KEY } from '../values/types.js'
import type { Linkset } from '../linkset.js'
import { sayError } from './debug.js'

/** Requests made by the script. Floater requests include the simulator's rejection code. */
export type ViewerRequest =
  | { readonly kind: 'loadURL'; readonly agent: string; readonly message: string; readonly url: string }
  | { readonly kind: 'mapDestination'; readonly agent: string; readonly region: string; readonly position: Vector; readonly lookAt: Vector }
  | { readonly kind: 'mapBeacon'; readonly agent: string; readonly region: string; readonly position: Vector; readonly options: ReadonlyArray<LslValue> }
  | { readonly kind: 'openFloater'; readonly agent: string; readonly floater: string; readonly url: string; readonly params: ReadonlyArray<LslValue>; readonly result: number }

const regions = new WeakMap<object, Map<string | undefined, Map<string, boolean>>>()

/** Region-presence overrides supplied by tests, shared by scripts in that region. */
export function agentPresence(linkset: Linkset): Map<string, boolean> {
  let regionsForClock = regions.get(linkset.clock)
  if (!regionsForClock) regions.set(linkset.clock, regionsForClock = new Map())
  let agents = regionsForClock.get(linkset.region)
  if (!agents) regionsForClock.set(linkset.region, agents = new Map())
  return agents
}

export function isAgentInRegion(ctx: CallContext, agent: string): boolean {
  agent = agent.toLowerCase()
  if (agent === NULL_KEY || !isKey(agent)) return false
  const explicit = ctx.state.agentPresence.get(agent)
  if (explicit !== undefined) return explicit
  const avatar = ctx.linkset.world?.avatars.find(a => a.key.toLowerCase() === agent.toLowerCase())
  if (avatar) return avatar.region === ctx.linkset.region
  if (agent === ctx.linkset.owner.toLowerCase()) return true
  return ctx.state.detectedStack.at(-1)?.entries.some(e => e.key.toLowerCase() === agent && ((e.type ?? 1) & 1) !== 0) ?? false
}

export function isKey(key: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)
}

export const llLoadURL: BuiltinImpl = (ctx, args) => {
  const agent = (args[0] as string).toLowerCase()
  const message = truncateUtf8(args[1] as string, 255)
  const url = truncateUtf8(args[2] as string, 255)
  if (!isAgentInRegion(ctx, agent)) sayError(ctx, 'llLoadURL - cannot find avatar')
  else if (!url.startsWith('http://') && !url.startsWith('https://')) sayError(ctx, 'llLoadURL - invalid or unsupported scheme.')
  else ctx.state.viewerRequests.push({ kind: 'loadURL', agent, message, url })
  return undefined
}

function mapAgent(ctx: CallContext): string {
  const detected = ctx.state.detectedStack.at(-1)
  return (detected?.event?.startsWith('touch') ? (detected.entries[0]?.key ?? ctx.linkset.owner) : ctx.linkset.owner).toLowerCase()
}

export const llMapDestination: BuiltinImpl = (ctx, args) => {
  const agent = mapAgent(ctx)
  if (isAgentInRegion(ctx, agent)) ctx.state.viewerRequests.push({
    kind: 'mapDestination', agent, region: args[0] as string,
    position: { ...args[1] as Vector }, lookAt: { ...args[2] as Vector },
  })
  return undefined
}

export const llMapBeacon: BuiltinImpl = (ctx, args) => {
  const agent = mapAgent(ctx)
  const options = args[2] as ReadonlyArray<LslValue>
  if (isAgentInRegion(ctx, agent)) ctx.state.viewerRequests.push({
    kind: 'mapBeacon', agent, region: args[0] as string,
    position: { ...args[1] as Vector }, options: [...options],
  })
  return undefined
}

/** Linden-owned privileged experiences cannot be represented by the current Experience fixture. */
export const llOpenFloater: BuiltinImpl = (ctx, args) => {
  const result = -1
  ctx.state.viewerRequests.push({ kind: 'openFloater', agent: ctx.linkset.owner,
    floater: args[0] as string, url: args[1] as string, params: [...args[2] as ReadonlyArray<LslValue>], result })
  return result
}
