import { dispatchTouchCommand } from './touch.js'
import { dispatchRenderCommand } from './viewstate.js'
import { sendRestrictionNotifications } from './notify.js'
import type { RlvParsedCommand } from './classifier.js'
import { dispatchTeleportCommand } from './teleport.js'
import { classifyRlvCommand, rlvIntegerPrefix } from './classifier.js'
import { classifyRlvUnsupported } from './classifier.js'
import { getRlvCommandCoverage, getRlvCommands } from './getcommand.js'
import { dispatchForceRemoveCommand, dispatchForceWearCommand } from './forcewear.js'
import { dispatchDetachCommand } from './detach.js'
import { dispatchCameraCommand, getRlvCameraReply } from './camera.js'
import { dispatchRestrictionCommand, isKokuaNamedReply } from './restrictions.js'
import { findRlvFolders, getRlvWornPath } from './findfolder.js'
import { getRlvOutfitReply } from './outfit.js'
import { getRlvInventoryList } from './inventory.js'
import { getRlvStatus } from './status.js'
import { dispatchSeatingCommand, getRlvSitId } from './sit.js'
import { getRlvAttachmentPoint, getRlvAttachmentReply } from './attachments.js'
import { parseRlvCommand } from './parser.js'
import { isValidReplyChannel, sendViewerReply } from './reply.js'
import type { Linkset } from '../linkset.js'
import type { Prim } from '../prim.js'
import type { WorldAvatar } from '../world.js'
import { RLV_PROFILES, type RlvProfile } from './profiles.js'

/** Default reference settings; the Kokua viewer suffix is a fixed fixture value. */
function versionReply(profile: RlvProfile, behaviour: string, option: string): string | undefined {
  const reference = RLV_PROFILES[profile]
  switch (behaviour) {
    case 'version':
    case 'versionnew': {
      const name = behaviour === 'version' ? 'RestrainedLife' : 'RestrainedLove'
      const suffix = profile === 'rlv' ? '26.4.0' : `RLVa ${reference.implementationVersion}`
      return `${name} viewer v${reference.apiVersion} (${suffix})`
    }
    case 'versionnum':
      // Kokua ignores options; RLVa sends an empty response for unknown options.
      return profile === 'rlv' || !option ? String(reference.apiVersionNumber) : option === 'impl' ? '2040213' : ''
    default:
      return undefined
  }
}

/** Dispatch in token order; replies stay queued until the issuing script yields. */
export function dispatchViewerCommand(linkset: Linkset, prim: Prim, message: string, recipient?: WorldAvatar): void {
  if (!message.startsWith('@')) return
  const avatar = recipient ?? linkset.world?.avatars.find(avatar => avatar.key.toLowerCase() === linkset.owner.toLowerCase())
  if (!avatar) return
  const viewer = avatar.viewer
  if (viewer.profile === 'disabled' || viewer.profile === 'rlva' && !recipient && message.length <= 3) return
  viewer.session.bind(linkset, avatar)
  for (const token of message.slice(1).split(',').filter(Boolean)) {
    const command = '@' + token
    const fields = parseRlvCommand(viewer.profile, token)
    const parsed = fields ? classifyRlvCommand(fields) : undefined
    if (viewer.session.retain(parsed, () => {
      const current = prim.linkset!
      if (current.world === linkset.world && current.world?.avatars.includes(avatar)) {
        dispatchViewerCommand(current, prim, command, avatar)
      }
    })) {
      viewer.commandLog.push({ command, sourcePrim: prim.key, ...(parsed ? { parsed } : {}), status: 'queued' })
      continue
    }
    const malformed = !parsed || viewer.profile === 'rlva' && parsed.kind === 'unknown'
    const channel = parsed ? rlvIntegerPrefix(parsed.parameter) : undefined
    const replyChannel = !malformed && channel !== undefined && isValidReplyChannel(viewer.profile, channel)
    const query = replyChannel && parsed?.kind === 'query'
    if (!malformed && parsed && dispatchBlacklistedCommand(avatar, prim, parsed, command)) continue
    if (!malformed && parsed && dispatchTouchCommand(avatar, prim, parsed, command)) continue
    if (!malformed && parsed && dispatchCameraCommand(avatar, prim, parsed, command)) continue
    if (!malformed && parsed && dispatchRenderCommand(avatar, prim, parsed, command)) continue
    // Kokua dispatches named version queries before testing parameter kinds.
    let text: string | undefined
    if (parsed && replyChannel && (viewer.profile === 'rlv' || query)) {
      text = versionReply(viewer.profile, parsed.behaviour, parsed.option)
      text ??= viewer.blacklist.reply(parsed.behaviour, parsed.option, viewer.reference!.apiVersionNumber)
      text ??= getRlvCameraReply(viewer, parsed.behaviour, parsed.option)
    }
    if (parsed && query && (parsed.behaviour === 'getstatus' || parsed.behaviour === 'getstatusall')) {
      text = getRlvStatus(viewer.profile, viewer.restrictions, parsed.option,
        parsed.behaviour === 'getstatus' ? prim.key : undefined)
    }
    if (parsed && query && parsed.behaviour === 'getsitid') text = getRlvSitId(avatar)
    if (!malformed && parsed && dispatchTeleportCommand(linkset, prim, avatar, parsed, command)) continue
    if (!malformed && parsed && dispatchSeatingCommand(linkset, prim, avatar, parsed, command)) continue
    if (parsed && query && parsed.behaviour === 'getcommand' && viewer.profile === 'rlva') {
      const type = parsed.option.split(';')[1] ?? ''
      const invalid = !['', 'any', 'add', 'force', 'reply'].includes(type)
      const reply = sendViewerReply(linkset, avatar, channel, getRlvCommands(viewer.profile, parsed.option)!)!
      viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'replied', reply,
        ...(invalid ? { outcome: 'invalid-option' as const } : {}) })
      if (invalid) viewer.diagnostics.push({ command, reason: 'unsupported', detail: 'invalid-option: Unknown discovery type; the viewer delivers an empty reply.' })
      continue
    }
    if (parsed && query && ['findfolder', 'findfolders', 'getpath', 'getpathnew'].includes(parsed.behaviour)) {
      const result = parsed.behaviour.startsWith('find')
        ? findRlvFolders(viewer.profile, viewer.inventory, parsed.behaviour, parsed.option)
        : getRlvWornPath(viewer.profile, viewer.inventory, linkset, prim, parsed.behaviour, parsed.option, avatar.key)
      if (result === undefined) {
        viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'unsupported', outcome: 'unsupported-form' })
        viewer.diagnostics.push({ command, reason: 'unsupported', detail: 'Outfit-layer paths require an outfit fixture.' })
      } else {
        const reply = sendViewerReply(linkset, avatar, channel, result.text)!
        viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'replied', reply,
          ...(result.failedOption ? { outcome: 'failed-option' as const } : {}) })
      }
      continue
    }
    if (parsed && query && parsed.behaviour === 'getinv') {
      text = getRlvInventoryList(viewer.profile, viewer.inventory, parsed.option)
    }
    if (parsed && query && (parsed.behaviour === 'getoutfit' || parsed.behaviour === 'getinvworn')) {
      const result = getRlvOutfitReply(viewer.profile, viewer.inventory, linkset, parsed.behaviour, parsed.option, avatar.key)
      const reply = sendViewerReply(linkset, avatar, channel, result.text)!
      viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'replied', reply,
        ...(result.failedOption ? { outcome: 'failed-option' as const } : {}) })
      continue
    }
    if (parsed && query && (parsed.behaviour === 'getattach' || parsed.behaviour === 'getattachnames')) {
      const attachmentText = getRlvAttachmentReply(linkset, viewer, parsed.behaviour, parsed.option, avatar.key)
      if (attachmentText !== undefined) {
        const failedOption = viewer.profile === 'rlva' && parsed.behaviour === 'getattach' &&
          !!parsed.option && getRlvAttachmentPoint(parsed.option) === undefined
        const reply = sendViewerReply(linkset, avatar, channel, attachmentText)!
        viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'replied', reply,
          ...(failedOption ? { outcome: 'failed-option' as const } : {}) })
        continue
      }
    }
    if (text === undefined && parsed && !malformed && (parsed.kind === 'add' || parsed.kind === 'remove') &&
      viewer.restrictions.support(parsed.behaviour, parsed.option) === 'enforced') {
      dispatchRestrictionCommand(viewer, prim, parsed, command)
      continue
    }
    if (text === undefined && parsed && !malformed && dispatchForceRemoveCommand(linkset, prim, avatar, parsed, command)) continue
    if (text === undefined && parsed && !malformed && dispatchForceWearCommand(linkset, prim, avatar, parsed, command)) continue
    if (text === undefined && parsed && !malformed && dispatchDetachCommand(linkset, prim, avatar, parsed, command)) continue
    if (text === undefined && parsed && !malformed) {
      const outcome = classifyRlvUnsupported(viewer.profile, parsed)
      if (outcome !== 'state-only') {
        if (!dispatchRestrictionCommand(viewer, prim, parsed, command, outcome)) {
          viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'unsupported', outcome })
          viewer.diagnostics.push({ command, reason: 'unsupported', detail: outcome + ': This command form has no implemented effect.' })
        }
        continue
      }
    }
    if (text === undefined && parsed && !malformed && dispatchRestrictionCommand(viewer, prim, parsed, command)) continue
    const entry = { command, sourcePrim: prim.key, ...(parsed ? { parsed } : {}) }
    if (text === undefined) {
      const status = malformed ? 'malformed' : 'unsupported'
      viewer.commandLog.push({ ...entry, status })
      viewer.diagnostics.push({ command, reason: status, detail: malformed
        ? 'Invalid command syntax or parameter for this viewer profile.'
        : 'This command form has no implemented effect. Version replies require a supported reply channel.' })
      continue
    }
    const reply = sendViewerReply(linkset, avatar, channel!, text)!
    viewer.commandLog.push({ ...entry, status: 'replied', reply,
      ...(viewer.profile === 'rlva' && parsed?.option && ['getcam_fov', 'getcam_fovmin', 'getcam_fovmax'].includes(parsed.behaviour)
        ? { outcome: 'failed-option' as const } : {}) })
  }
}

/** Run before effects; ignored commands never establish restriction state. */
function dispatchBlacklistedCommand(avatar: WorldAvatar, prim: Prim, parsed: RlvParsedCommand, command: string): boolean {
  const viewer = avatar.viewer
  if (viewer.profile === 'rlv' && isKokuaNamedReply(parsed.behaviour)) return false
  const outcome = viewer.blacklist.rejection(parsed)
  if (!outcome || viewer.profile === 'disabled') return false
  if (outcome === 'ignored-blacklist' && parsed.kind === 'add') {
    sendRestrictionNotifications(prim, avatar, viewer.restrictions.snapshot(), parsed.behaviour + (parsed.option ? ':' + parsed.option : ''), '=n')
  }
  viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'ignored', outcome })
  const type = parsed.kind === 'remove' ? 'add' : parsed.kind
  const implemented = getRlvCommandCoverage(viewer.profile).some(form => form.behaviour === parsed.behaviour &&
    form.type === type && form.support === 'enforced' && (form.option === 'any' || !parsed.option))
  if (!implemented) viewer.diagnostics.push({ command, reason: 'unsupported',
    detail: 'This command form has no implemented effect; the viewer setting does not establish enforcement support.' })
  return true
}
