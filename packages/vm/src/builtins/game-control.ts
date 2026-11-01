import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { Linkset } from '../linkset.js'
import { uniformList } from '../values/list-types.js'

/** Viewer-derived semantic input. Axes retain their mode-dependent shape. */
export interface GameControlState {
  readonly mode: number
  readonly axes: readonly number[]
  readonly buttons: number
}

export interface GameControlSnapshot extends GameControlState {
  readonly agent: string
}

// Avatar fixture state belongs to the World, or the standalone linkset.
const fixtures = new WeakMap<object, Map<string, GameControlState>>()
export function gameControlAvatars(linkset: Linkset): Map<string, GameControlState> {
  const scope = linkset.world ?? linkset
  let avatars = fixtures.get(scope)
  if (!avatars) fixtures.set(scope, avatars = new Map())
  return avatars
}

export function copyGameControl(state: GameControlState): GameControlState {
  return { mode: state.mode | 0, buttons: state.buttons | 0, axes: state.axes.map(Math.fround) }
}

function snapshot(ctx: CallContext, id: string): GameControlSnapshot | null {
  const current = ctx.state.gameControlSnapshot
  return current?.agent === id.toLowerCase() ? current : null
}

export const llGetGameControlMode: BuiltinImpl = (ctx, args) =>
  snapshot(ctx, args[0] as string)?.mode ?? -1
export const llGetGameControlModeButtons: BuiltinImpl = (ctx, args) =>
  snapshot(ctx, args[0] as string)?.buttons ?? 0
export const llGetGameControlModeAxes: BuiltinImpl = (ctx, args) =>
  uniformList([...(snapshot(ctx, args[0] as string)?.axes ?? [])], 'float')
