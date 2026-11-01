import type { Linkset } from '../linkset.js'
import type { WorldAvatar } from '../world.js'
import { truncateUtf8 } from '../values/utf8.js'
import type { RlvProfile, RlvReply } from './profiles.js'

/** Object queries use signed 32-bit channels; zero belongs to viewer consoles. */
export function isValidReplyChannel(profile: RlvProfile, channel: number): boolean {
  return Number.isInteger(channel) && channel >= -2147483648 && channel <= 2147483647 &&
    (profile === 'rlv' ? channel !== 0 : channel > 0 && channel !== 2147483647)
}

/** Queue one avatar-origin query reply. Rejection never synthesizes an empty reply. */
export function sendViewerReply(linkset: Linkset, avatar: WorldAvatar, channel: number, message: string): RlvReply | undefined {
  const profile = avatar.viewer.profile
  if (profile === 'disabled' || !isValidReplyChannel(profile, channel)) return undefined
  // Kokua cuts raw bytes, including partial UTF-8 sequences. Decoding those bytes
  // into the VM's JavaScript strings replaces an incomplete character with U+FFFD.
  const text = profile === 'rlva' ? truncateUtf8(message, 1023)
    : new TextDecoder('utf-8', { ignoreBOM: true }).decode(new TextEncoder().encode(message).slice(0, channel < 0 ? 254 : 1023))
  avatar.viewer.session.bind(linkset, avatar)
  avatar.viewer.session.captureReplies(() => linkset.routeViewerReply(avatar, channel, text))
  return { channel, text }
}
