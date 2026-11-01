import type { BuiltinImpl } from '../runtime.js'
import { PERMISSION_TELEPORT } from '../generated/constants.js'
import { sayError } from './debug.js'

/** A llRequestPermissions call waiting for the test to answer it. */
export interface PermissionRequestEntry {
  readonly agent: string
  readonly permissions: number
  answered: boolean
}

/**
 * llRequestPermissions(key agent, integer permissions) — records the
 * request for the test to answer with Script.grantPermissions or
 * Script.denyPermissions. Requesting no permissions fires nothing.
 */
export const llRequestPermissions: BuiltinImpl = (ctx, args) => {
  const agent = (args[0] as string | undefined) ?? ''
  const permissions = (args[1] as number | undefined) ?? 0
  if (ctx.linkset.attachment?.temporary && (permissions & PERMISSION_TELEPORT)) {
    sayError(ctx, 'Temporary attachments cannot request runtime permissions to teleport')
    return undefined
  }
  if (permissions !== 0) ctx.state.permissions.requests.push({ agent, permissions, answered: false })
  return undefined
}

/** llGetPermissions() — the permission bits last granted. */
export const llGetPermissions: BuiltinImpl = (ctx) => ctx.state.permissions.granted

/** llGetPermissionsKey() — the agent of the last answered request, kept after a denial. */
export const llGetPermissionsKey: BuiltinImpl = (ctx) => ctx.state.permissions.agent
