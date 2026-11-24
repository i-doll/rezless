import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { LslValue, Vector } from '../values/types.js'
import { truncateUtf8 } from '../values/utf8.js'
import { NULL_KEY } from '../values/types.js'
import type { Linkset } from '../linkset.js'
import type { EnvironmentAsset } from '../world.js'
import { sayError } from './debug.js'
import { WindowThrottle } from '../throttle.js'

/** Requests made by the script. Floater requests include the simulator's rejection code. */
export type ViewerRequest =
  | { readonly kind: 'loadURL'; readonly agent: string; readonly message: string; readonly url: string }
  | { readonly kind: 'mapDestination'; readonly agent: string; readonly region: string; readonly position: Vector; readonly lookAt: Vector }
  | { readonly kind: 'mapBeacon'; readonly agent: string; readonly region: string; readonly position: Vector; readonly options: ReadonlyArray<LslValue> }
  | { readonly kind: 'openFloater'; readonly agent: string; readonly floater: string; readonly url: string; readonly params: ReadonlyArray<LslValue>; readonly result: number }
  /** llSetAgentEnvironment: rules with texture names resolved to keys; [] clears. */
  | { readonly kind: 'agentEnvironment'; readonly agent: string; readonly transition: number; readonly params: ReadonlyArray<LslValue> }
  /** llReplaceAgentEnvironment: the settings key, NULL_KEY to clear, and the item's settings if it is in inventory. */
  | { readonly kind: 'replaceAgentEnvironment'; readonly agent: string; readonly transition: number; readonly environment: string; readonly asset?: EnvironmentAsset }

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

const mapClicks = new WeakMap<object, WeakSet<object>>()

// An attachment shows the map or beacon to its owner, unless someone else clicked it.
// A rezzed object shows it only to whoever clicked it, once per script for each touch data
// the click sends, and llMapDestination and llMapBeacon share that once. A quick click sends
// one for its touch_start, touch and touch_end; a held click sends new data for each later
// touch and for its touch_end.
function mapAgent(ctx: CallContext): string | undefined {
  const owner = ctx.linkset.owner.toLowerCase()
  const detected = ctx.state.detectedStack.at(-1)
  const touch = detected?.event?.startsWith('touch') ? detected : undefined
  const toucher = touch && (touch.entries[0]?.key ?? owner).toLowerCase()
  if (ctx.linkset.attachment) return toucher === undefined || toucher === owner ? owner : undefined
  if (!touch) return undefined
  let shown = mapClicks.get(ctx.state)
  if (!shown) mapClicks.set(ctx.state, shown = new WeakSet())
  const data = touch.entries[0]
  if (!data || shown.has(data)) return undefined
  shown.add(data)
  return toucher
}

const MAP_THROTTLED = 'Too many llMapDestination() function calls; halted until average falls.'
const mapThrottles = new WeakMap<object, Map<string, WindowThrottle>>()

// In-world the limit is 4 maps and beacons for each avatar shown them, whoever owns the
// objects, counted over 4 s periods by a sliding window, and a call past it shuts them
// until the end of the next period. Refused calls count. A call that would show nobody
// isn't counted, but a refused call uses up the click's one showing. Each region keeps its
// own count: an avatar refused maps got 4 more as soon as it arrived in another region.
function mapShown(ctx: CallContext): string | undefined {
  const agent = mapAgent(ctx)
  if (agent === undefined || !isAgentInRegion(ctx, agent)) return undefined
  let byAgent = mapThrottles.get(ctx.linkset.clock)
  if (!byAgent) mapThrottles.set(ctx.linkset.clock, byAgent = new Map())
  const id = `${ctx.linkset.region ?? ''}\n${agent}`
  let throttle = byAgent.get(id)
  if (!throttle) byAgent.set(id, throttle = new WindowThrottle(4_000, 4))
  if (throttle.take(ctx.state.clock.now) === 'open') return agent
  sayError(ctx, MAP_THROTTLED)
  return undefined
}

export const llMapDestination: BuiltinImpl = (ctx, args) => {
  const agent = mapShown(ctx)
  if (agent !== undefined) ctx.state.viewerRequests.push({
    kind: 'mapDestination', agent, region: args[0] as string,
    position: { ...args[1] as Vector }, lookAt: { ...args[2] as Vector },
  })
  return undefined
}

export const llMapBeacon: BuiltinImpl = (ctx, args) => {
  const agent = mapShown(ctx)
  const options = args[2] as ReadonlyArray<LslValue>
  if (agent !== undefined) ctx.state.viewerRequests.push({
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
