import type { BuiltinImpl } from '../runtime.js'
import { PERMISSION_TAKE_CONTROLS } from '../generated/constants.js'
import { NULL_KEY } from '../values/types.js'
import { sayError } from './debug.js'

/** Controls held by llTakeControls. */
export interface TakenControls {
  readonly controls: number
  readonly accept: boolean
  readonly passOn: boolean
}

/**
 * llTakeControls(integer controls, integer accept, integer pass_on) — takes
 * the permission agent's controls. Without PERMISSION_TAKE_CONTROLS it takes
 * nothing and tells the owner, and the permission avatar if there is one.
 */
export const llTakeControls: BuiltinImpl = (ctx, args) => {
  const { granted, agent } = ctx.state.permissions
  if (!(granted & PERMISSION_TAKE_CONTROLS)) {
    sayError(ctx, 'Script trying to take controls from owner but PERMISSION_TAKE_CONTROLS permission not set!',
      ctx.prim, false, agent === NULL_KEY ? undefined : agent)
    return undefined
  }
  ctx.state.controls.taken = {
    controls: (args[0] as number | undefined) ?? 0,
    accept: ((args[1] as number | undefined) ?? 0) !== 0,
    passOn: ((args[2] as number | undefined) ?? 0) !== 0,
  }
  return undefined
}

/**
 * llReleaseControls() — lets the controls go, drops the control events still
 * queued, and drops PERMISSION_TAKE_CONTROLS, taken or not.
 */
export const llReleaseControls: BuiltinImpl = (ctx) => {
  ctx.state.controls.taken = null
  ctx.linkset.clock.purgeEvent(ctx.script, 'control')
  ctx.state.permissions.granted &= ~PERMISSION_TAKE_CONTROLS
  return undefined
}
