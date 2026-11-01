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

/** Single-command dispatch. Batching and broader channel policies are separate slices. */
export function dispatchViewerCommand(linkset: Linkset, prim: Prim, command: string): void {
  if (!command.startsWith('@')) return
  const avatar = linkset.world?.avatars.find(avatar => avatar.key === linkset.owner)
  if (!avatar) return
  const viewer = avatar.viewer
  if (viewer.profile === 'disabled') return
  const match = /^@([a-z]+)(?::([^=,\s]*))?=([0-9]+)$/.exec(command.toLowerCase())
  const channel = match ? Number(match[3]) : 0
  const text = match && channel > 0 && channel < 2147483647
    ? versionReply(viewer.profile, match[1]!, match[2] ?? '') : undefined
  if (text === undefined) {
    viewer.commandLog.push({ command, sourcePrim: prim.key, status: 'unsupported' })
    viewer.diagnostics.push({ command, reason: 'unsupported',
      detail: 'Only single version/versionnew/versionnum queries on positive non-debug channels are implemented.' })
    return
  }
  viewer.commandLog.push({ command, sourcePrim: prim.key, status: 'replied', reply: { channel, text } })
  linkset.routeViewerReply(avatar, channel, text)
}
