import type { BuiltinImpl, CallContext } from '../runtime.js'
import { acceptsRlvPermissions } from '../rlv/permissions.js'
import {
  PERMISSION_ATTACH, PERMISSION_CONTROL_CAMERA, PERMISSION_GAME_CONTROL, PERMISSION_OVERRIDE_ANIMATIONS,
  PERMISSION_TAKE_CONTROLS, PERMISSION_TELEPORT, PERMISSION_TRACK_CAMERA, PERMISSION_TRIGGER_ANIMATION,
} from '../generated/constants.js'
import { sayError } from './debug.js'

/** A permission request, including whether it has already been answered. */
export interface PermissionRequestEntry {
  readonly agent: string
  readonly permissions: number
  answered: boolean
}

/**
 * Which requests the simulator grants without a dialog: `'sl'` follows Second
 * Life, `'none'` grants nothing, and a function decides per request. A viewer
 * under `@acceptpermission` still answers what the simulator leaves.
 */
export type AutoGrantPermissions = 'sl' | 'none' | ((request: { agent: string, permissions: number }) => boolean)

const SITTER_PERMISSIONS = PERMISSION_TAKE_CONTROLS | PERMISSION_TRIGGER_ANIMATION | PERMISSION_TRACK_CAMERA |
  PERMISSION_CONTROL_CAMERA | PERMISSION_GAME_CONTROL
const WEARER_PERMISSIONS = SITTER_PERMISSIONS | PERMISSION_ATTACH | PERMISSION_OVERRIDE_ANIMATIONS

/** The bits a request can carry: 1 to 12 and 14 to 20. Second Life drops the rest before it decides anything. */
const REQUESTABLE_PERMISSIONS = 0x1fdffe

/**
 * Second Life grants a request without a dialog when the agent is sitting on
 * the script's object or wearing it, and every requested bit is one it grants
 * to a sitter or a wearer. One other bit sends the whole request to a dialog.
 */
function simulatorGrants(ctx: CallContext, agent: string, permissions: number): boolean {
  const key = agent.toLowerCase()
  const { linkset } = ctx
  const seated = linkset.world?.avatars.some(avatar => avatar.key.toLowerCase() === key && avatar.sittingOn?.linkset === linkset)
  const covered = linkset.attachment?.avatar.toLowerCase() === key ? WEARER_PERMISSIONS : seated ? SITTER_PERMISSIONS : null
  return covered !== null && (permissions & ~covered) === 0
}

/**
 * llRequestPermissions(key agent, integer permissions) — records the
 * request and grants it at once when the simulator or the recipient's viewer
 * would. Other requests wait for Script.grantPermissions or
 * Script.denyPermissions. Requesting no permissions fires nothing unless the
 * agent is sitting on the object or wearing it.
 */
export const llRequestPermissions: BuiltinImpl = (ctx, args) => {
  const agent = (args[0] as string | undefined) ?? ''
  const permissions = ((args[1] as number | undefined) ?? 0) & REQUESTABLE_PERMISSIONS
  if (ctx.linkset.attachment?.temporary && (permissions & PERMISSION_TELEPORT)) {
    sayError(ctx, 'Temporary attachments cannot request runtime permissions to teleport')
    return undefined
  }
  const mode = ctx.state.permissions.autoGrant ?? ctx.linkset.world?.autoGrantPermissions ?? 'sl'
  // A request for nothing never reaches a dialog, so the setting has nothing to decide.
  const automatic = mode === 'sl' || permissions === 0
    ? simulatorGrants(ctx, agent, permissions)
    : mode !== 'none' && mode({ agent, permissions })
  if (permissions === 0 && !automatic) return undefined
  const avatar = ctx.linkset.world?.avatars.find(avatar => avatar.key.toLowerCase() === agent.toLowerCase())
  const answered = automatic || (!!avatar && acceptsRlvPermissions(avatar, ctx.linkset, permissions))
  const { requests } = ctx.state.permissions
  if (answered) {
    // A grant ends every request still waiting on a dialog; a later answer to one does nothing.
    for (const request of requests) request.answered = true
    ctx.state.permissions.granted = permissions
    ctx.state.permissions.agent = agent
    if (!(permissions & PERMISSION_TAKE_CONTROLS)) ctx.state.controls.taken = null
    ctx.state.clock.schedule(ctx.state.clock.now, 'run_time_permissions', { perm: permissions })
  }
  requests.push({ agent, permissions, answered })
  return undefined
}

/** llGetPermissions() — the permission bits last granted. */
export const llGetPermissions: BuiltinImpl = (ctx) => ctx.state.permissions.granted

/** llGetPermissionsKey() — the agent of the last answered request, kept after a denial. */
export const llGetPermissionsKey: BuiltinImpl = (ctx) => ctx.state.permissions.agent
