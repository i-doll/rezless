import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { Linkset } from '../linkset.js'
import { uniformList } from '../values/list-types.js'

/**
 * Controller state as the avatar's viewer sends it. Axis values run from -1 to 1,
 * except cursor mode's pixel axes 2 and 3, which take pixels.
 */
export interface GameControlInput {
  /** Action mode: 0 avatar, 1 mouselook, 2 flycam, 3 captive (sitting), 4 cursor. */
  readonly mode?: number
  readonly buttons?: number
  readonly axes?: readonly number[]
  /** Defaults to `buttons`. */
  readonly modeButtons?: number
  readonly modeAxes?: readonly number[]
}

/** What llGetGameControlMode, llGetGameControlModeButtons and llGetGameControlModeAxes report. */
export interface GameControlSnapshot {
  readonly agent: string
  readonly mode: number
  readonly buttons: number
  readonly axes: readonly number[]
}

export interface GameControlState {
  readonly buttons: number
  readonly axes: readonly number[]
  readonly mode: GameControlSnapshot
}

const MODE_AXES = [5, 5, 7, 5, 6]
const CANONICAL_AXES = 6
const CURSOR = 4

const s16 = (v: number) => Math.max(-32768, Math.min(32767, Math.trunc(v))) + 0
// Values travel as 16-bit integers, rounded half away from zero.
const quantize = (v: number) => {
  const x = Math.max(-1, Math.min(1, v)) * 32767
  return Math.sign(x) * Math.round(Math.abs(x)) + 0
}
const decode = (v: number) => Math.fround(v / (v < 0 ? 32768 : 32767))

function axesOf(values: readonly number[] = [], count: number, decodeAxis: (v: number, i: number) => number): number[] {
  if (values.some(v => !Number.isFinite(v))) throw new RangeError('game control axes must be finite')
  return Array.from({ length: count }, (_, i) => decodeAxis(values[i] ?? 0, i))
}

/** The state the region holds for an avatar after its viewer sends `input`. */
export function receiveGameControl(agent: string, input: GameControlInput): GameControlState {
  const mode = input.mode ?? 0
  const count = MODE_AXES[mode]
  if (count === undefined || !Number.isInteger(mode)) throw new RangeError(`game control mode must be 0 to 4, got ${mode}`)
  const buttons = (input.buttons ?? 0) | 0
  return {
    buttons,
    axes: axesOf(input.axes, CANONICAL_AXES, v => decode(quantize(v))),
    mode: {
      agent: agent.toLowerCase(),
      mode,
      buttons: (input.modeButtons ?? buttons) | 0,
      axes: axesOf(input.modeAxes, count, (v, i) => {
        if (mode !== CURSOR || i < 2) return decode(quantize(v))
        if (i < 4) return s16(v)
        return Math.fround(quantize(v) / 32767)
      }),
    },
  }
}

// In-world: an all-zero first state in avatar mode raised no event; in captive mode it raised one.
const REST = receiveGameControl('', {})

export function sameGameControl(a: GameControlState = REST, b: GameControlState): boolean {
  return a.buttons === b.buttons && a.mode.mode === b.mode.mode && a.mode.buttons === b.mode.buttons
    && a.axes.every((v, i) => v === b.axes[i]) && a.mode.axes.every((v, i) => v === b.mode.axes[i])
}

// What each avatar's viewer last sent, held by the World, or the linksets that share a clock.
const avatars = new WeakMap<object, Map<string, GameControlState>>()
export function gameControlAvatars(linkset: Linkset): Map<string, GameControlState> {
  const scope = linkset.world ?? linkset.peers
  let map = avatars.get(scope)
  if (!map) avatars.set(scope, map = new Map())
  return map
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
