import type { BuiltinImpl } from '../runtime.js'
import { acceptsRlvPermissions } from '../rlv/permissions.js'
import { PERMISSION_TAKE_CONTROLS, PERMISSION_TELEPORT } from '../generated/constants.js'
import { sayError } from './debug.js'

/** A permission request, including whether it has already been answered. */
export interface PermissionRequestEntry {
  readonly agent: string
  readonly permissions: number
  answered: boolean
}

/**
 * llRequestPermissions(key agent, integer permissions) — records the
 * request and applies the recipient viewer auto-grant rules. Other requests
 * wait for Script.grantPermissions or Script.denyPermissions.
 * Requesting no permissions fires nothing.
 */
export const llRequestPermissions: BuiltinImpl = (ctx, args) => {
  const agent = (args[0] as string | undefined) ?? ''
  const permissions = (args[1] as number | undefined) ?? 0
  if (ctx.linkset.attachment?.temporary && (permissions & PERMISSION_TELEPORT)) {
    sayError(ctx, 'Temporary attachments cannot request runtime permissions to teleport')
    return undefined
  }
  if (permissions !== 0) {
    const avatar = ctx.linkset.world?.avatars.find(avatar => avatar.key.toLowerCase() === agent.toLowerCase())
    const answered = !!avatar && acceptsRlvPermissions(avatar, ctx.linkset, permissions)
    ctx.state.permissions.requests.push({ agent, permissions, answered })
    if (answered) {
      ctx.state.permissions.granted = permissions
      ctx.state.permissions.agent = agent
      if (!(permissions & PERMISSION_TAKE_CONTROLS)) ctx.state.controls.taken = null
      ctx.state.clock.schedule(ctx.state.clock.now, 'run_time_permissions', { perm: permissions })
    }
  }
  return undefined
}

/** llGetPermissions() — the permission bits last granted. */
export const llGetPermissions: BuiltinImpl = (ctx) => ctx.state.permissions.granted

/** llGetPermissionsKey() — the agent of the last answered request, kept after a denial. */
export const llGetPermissionsKey: BuiltinImpl = (ctx) => ctx.state.permissions.agent
