import type { BuiltinImpl, CallContext } from '../runtime.js'
import { acceptsRlvPermissions } from '../rlv/permissions.js'
import {
  PERMISSION_ATTACH, PERMISSION_CHANGE_LINKS, PERMISSION_CONTROL_CAMERA, PERMISSION_DEBIT, PERMISSION_GAME_CONTROL,
  PERMISSION_OVERRIDE_ANIMATIONS, PERMISSION_PRIVILEGED_LAND_ACCESS, PERMISSION_RETURN_OBJECTS,
  PERMISSION_SILENT_ESTATE_MANAGEMENT, PERMISSION_TAKE_CONTROLS, PERMISSION_TELEPORT, PERMISSION_TRACK_CAMERA,
  PERMISSION_TRIGGER_ANIMATION,
} from '../generated/constants.js'
import { sayError } from './debug.js'
import { NULL_KEY } from '../values/types.js'

/** A permission request, including whether it has already been answered. */
export interface PermissionRequestEntry {
  readonly agent: string
  readonly permissions: number
  answered: boolean
}

const OWNER_ONLY = PERMISSION_DEBIT | PERMISSION_CHANGE_LINKS | PERMISSION_RETURN_OBJECTS |
  PERMISSION_SILENT_ESTATE_MANAGEMENT | PERMISSION_PRIVILEGED_LAND_ACCESS

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

/** The bits Second Life grants `agent` without a dialog: a wearer's, a sitter's, or null for anyone else. */
function grantedOnObject(ctx: CallContext, agent: string): number | null {
  const key = agent.toLowerCase()
  const { linkset } = ctx
  if (linkset.attachment?.avatar.toLowerCase() === key) return WEARER_PERMISSIONS
  const seated = linkset.world?.avatars.some(avatar => avatar.key.toLowerCase() === key && avatar.sittingOn?.linkset === linkset)
  return seated ? SITTER_PERMISSIONS : null
}

/**
 * llRequestPermissions(key agent, integer permissions) — records the
 * request and grants it at once when the simulator or the recipient's viewer
 * would. Other requests wait for Script.grantPermissions or
 * Script.denyPermissions. Requesting no permissions fires nothing unless the
 * agent is sitting on the object or wearing it. A request that includes camera
 * control is refused whole, with an error and no dialog, for anyone else.
 * Asking anyone but the owner for a permission only the owner can grant is
 * refused without a request, except in a group-deeded object, which was not
 * measured.
 */
export const llRequestPermissions: BuiltinImpl = (ctx, args) => {
  const agent = (args[0] as string | undefined) ?? ''
  const permissions = ((args[1] as number | undefined) ?? 0) & REQUESTABLE_PERMISSIONS
  const mode = ctx.state.permissions.autoGrant ?? ctx.linkset.world?.autoGrantPermissions ?? 'sl'
  // Second Life grants the request when the agent is sitting on the object or wearing it and
  // every requested bit is one it grants there. One other bit sends the whole request to a dialog.
  // A request for nothing never reaches a dialog, so the setting has nothing to decide.
  const covered = grantedOnObject(ctx, agent)
  const automatic = mode === 'sl' || permissions === 0
    ? covered !== null && (permissions & ~covered) === 0
    : mode !== 'none' && mode({ agent, permissions })
  const world = ctx.linkset.world
  const absent = covered === null && (agent === NULL_KEY ||
    (!!world && !world.avatars.some(avatar => avatar.key.toLowerCase() === agent.toLowerCase())))
  // Second Life looks for the agent before anything else and fails every request to one it cannot
  // find. Only the camera control request is modelled; the others still wait for the test to answer.
  if ((permissions & PERMISSION_CONTROL_CAMERA) && absent && !automatic) {
    sayError(ctx, 'Unable to find specified agent to request permissions.')
    return undefined
  }
  if (ctx.linkset.attachment?.temporary && (permissions & PERMISSION_TELEPORT)) {
    sayError(ctx, 'Temporary attachments cannot request runtime permissions to teleport')
    return undefined
  }
  const owner = ctx.linkset.owner.toLowerCase()
  const deeded = world?.sensorProperties.get(ctx.linkset)?.group?.toLowerCase() === owner
  if ((permissions & OWNER_ONLY) && !deeded && agent.toLowerCase() !== owner) {
    sayError(ctx, 'Script asking non-owner for run time permissions only owner can grant')
    return undefined
  }
  if (permissions === 0 && !automatic) return undefined
  if ((permissions & PERMISSION_CONTROL_CAMERA) && covered === null && !automatic) {
    sayError(ctx, 'Camera control currently only supported for attachments and objects on which you are sitting.')
    return undefined
  }
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
