import { classifyRlvCommand, rlvIntegerPrefix } from './classifier.js'
import { classifyRlvUnsupported } from './classifier.js'
import { getRlvCommands } from './getcommand.js'
import { dispatchRestrictionCommand } from './restrictions.js'
import { getRlvInventoryList } from './inventory.js'
import { getRlvStatus } from './status.js'
import { dispatchSeatingCommand, getRlvSitId } from './sit.js'
import { getRlvAttachmentPoint, getRlvAttachmentReply } from './attachments.js'
import { parseRlvCommand } from './parser.js'
import { isValidReplyChannel, sendViewerReply } from './reply.js'
import type { Linkset } from '../linkset.js'
import type { Prim } from '../prim.js'
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
export function dispatchViewerCommand(linkset: Linkset, prim: Prim, message: string): void {
  if (!message.startsWith('@')) return
  const avatar = linkset.world?.avatars.find(avatar => avatar.key === linkset.owner)
  if (!avatar) return
  const viewer = avatar.viewer
  if (viewer.profile === 'disabled' || viewer.profile === 'rlva' && message.length <= 3) return
  for (const token of message.slice(1).split(',').filter(Boolean)) {
    const command = '@' + token
    const fields = parseRlvCommand(viewer.profile, token)
    const parsed = fields ? classifyRlvCommand(fields) : undefined
    const malformed = !parsed || viewer.profile === 'rlva' && parsed.kind === 'unknown'
    const channel = parsed ? rlvIntegerPrefix(parsed.parameter) : undefined
    // Kokua dispatches named version queries before testing parameter kinds.
    let text = !malformed && parsed && (viewer.profile === 'rlv' || parsed.kind === 'query') &&
      channel !== undefined && isValidReplyChannel(viewer.profile, channel)
      ? versionReply(viewer.profile, parsed.behaviour, parsed.option) : undefined
    if (!malformed && parsed?.kind === 'query' && channel !== undefined && isValidReplyChannel(viewer.profile, channel) &&
      (parsed.behaviour === 'getstatus' || parsed.behaviour === 'getstatusall')) {
      text = getRlvStatus(viewer.profile, viewer.restrictions, parsed.option,
        parsed.behaviour === 'getstatus' ? prim.key : undefined)
    }
    if (!malformed && parsed?.kind === 'query' && parsed.behaviour === 'getsitid' &&
      channel !== undefined && isValidReplyChannel(viewer.profile, channel)) text = getRlvSitId(avatar)
    if (!malformed && parsed && dispatchSeatingCommand(linkset, prim, avatar, parsed, command)) continue
    if (!malformed && parsed?.kind === 'query' && parsed.behaviour === 'getcommand' && viewer.profile === 'rlva' &&
      channel !== undefined && isValidReplyChannel(viewer.profile, channel)) {
      const type = parsed.option.split(';')[1] ?? ''
      const invalid = !['', 'any', 'add', 'force', 'reply'].includes(type)
      const reply = sendViewerReply(linkset, avatar, channel, getRlvCommands(viewer.profile, parsed.option)!)!
      viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'replied', reply,
        ...(invalid ? { outcome: 'invalid-option' as const } : {}) })
      if (invalid) viewer.diagnostics.push({ command, reason: 'unsupported', detail: 'invalid-option: Unknown discovery type; the viewer delivers an empty reply.' })
      continue
    }
    if (!malformed && parsed?.kind === 'query' && channel !== undefined && isValidReplyChannel(viewer.profile, channel) && parsed.behaviour === 'getinv') {
      text = getRlvInventoryList(viewer.profile, viewer.inventory, parsed.option)
    }
    if (!malformed && parsed?.kind === 'query' && channel !== undefined && isValidReplyChannel(viewer.profile, channel) &&
      (parsed.behaviour === 'getattach' || parsed.behaviour === 'getattachnames')) {
      const attachmentText = getRlvAttachmentReply(linkset, viewer, parsed.behaviour, parsed.option)
      if (attachmentText !== undefined) {
        const failedOption = viewer.profile === 'rlva' && parsed.behaviour === 'getattach' &&
          !!parsed.option && getRlvAttachmentPoint(parsed.option) === undefined
        const reply = sendViewerReply(linkset, avatar, channel, attachmentText)!
        viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'replied', reply,
          ...(failedOption ? { outcome: 'failed-option' as const } : {}) })
        continue
      }
    }
    if (text === undefined && parsed && !malformed && viewer.restrictions.supportsChatCommand(parsed)) {
      dispatchRestrictionCommand(viewer, prim, parsed, command)
      continue
    }
    if (text === undefined && parsed && !malformed) {
      const outcome = classifyRlvUnsupported(viewer.profile, parsed)
      if (outcome !== 'state-only') {
        if (dispatchRestrictionCommand(viewer, prim, parsed, command)) {
          const last = viewer.commandLog.length - 1
          viewer.commandLog[last] = { ...viewer.commandLog[last]!, outcome }
          const diagnostic = viewer.diagnostics.length - 1
          viewer.diagnostics[diagnostic] = { ...viewer.diagnostics[diagnostic]!, detail: outcome + ': ' + viewer.diagnostics[diagnostic]!.detail }
        } else {
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
    viewer.commandLog.push({ ...entry, status: 'replied', reply })
  }
}
