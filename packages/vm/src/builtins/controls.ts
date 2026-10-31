import type { BuiltinImpl } from '../runtime.js'
import { PERMISSION_TAKE_CONTROLS } from '../generated/constants.js'

/** Controls held by llTakeControls. */
export interface TakenControls {
  readonly controls: number
  readonly accept: boolean
  readonly passOn: boolean
}

/**
 * llTakeControls(integer controls, integer accept, integer pass_on) — takes
 * the permission agent's controls. Without PERMISSION_TAKE_CONTROLS it does
 * nothing and says nothing, as measured in-world.
 */
export const llTakeControls: BuiltinImpl = (ctx, args) => {
  if (!(ctx.state.permissions.granted & PERMISSION_TAKE_CONTROLS)) return undefined
  ctx.state.controls.taken = {
    controls: (args[0] as number | undefined) ?? 0,
    accept: ((args[1] as number | undefined) ?? 0) !== 0,
    passOn: ((args[2] as number | undefined) ?? 0) !== 0,
  }
  return undefined
}

/** llReleaseControls() — lets the controls go and drops PERMISSION_TAKE_CONTROLS, taken or not. */
export const llReleaseControls: BuiltinImpl = (ctx) => {
  ctx.state.controls.taken = null
  ctx.state.permissions.granted &= ~PERMISSION_TAKE_CONTROLS
  return undefined
}
