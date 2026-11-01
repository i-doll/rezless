import type { AvatarChatVolume } from './chat-actions.js'
import type { World, WorldAvatar } from '../world.js'
import type { Linkset } from '../linkset.js'
import type { Prim } from '../prim.js'
import type { ChatType } from '../runtime.js'
import type { ViewerProfile } from './profiles.js'
import type { RlvRestriction } from './restrictions.js'

/** Speaker identity is copied at delivery, independently of later object/avatar edits. */
export interface ReceivedChatSpeaker {
  readonly source: 'object' | 'avatar'
  readonly key: string
  readonly name: string
  readonly owner: string
}

/** Text as displayed with the profile's default OOC and ellipsis settings. */
export interface ReceivedChat {
  readonly speaker: ReceivedChatSpeaker
  readonly text: string
  readonly type: Exclude<ChatType, 'im'>
}

const logs = new WeakMap<WorldAvatar, readonly ReceivedChat[]>()
const empty: readonly ReceivedChat[] = Object.freeze([])

/** Frozen snapshots remain valid after subsequent deliveries. */
export function receivedChatLog(avatar: WorldAvatar): readonly ReceivedChat[] {
  return logs.get(avatar) ?? empty
}

const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const base = (behaviour: string) => behaviour.replace(/_sec$/, '')
const globalFamilies = new Set(['recvchat', 'recvemote'])
const targetedFamilies = new Set(['recvchatfrom', 'recvemotefrom'])

export function receivedChatSupport(profile: ViewerProfile, behaviour: string, option: string): RlvRestriction['support'] | undefined {
  const family = base(behaviour)
  if (!globalFamilies.has(family) && !targetedFamilies.has(family)) return undefined
  if (profile === 'disabled' || profile === 'rlv' && targetedFamilies.has(family) && behaviour.endsWith('_sec')) return 'unsupported'
  return uuid(option) || !option && globalFamilies.has(family) ? 'enforced' : 'unsupported'
}

function denied(avatar: WorldAvatar, family: 'recvchat' | 'recvemote', speaker: ReceivedChatSpeaker): boolean {
  const rules = avatar.viewer.restrictions.snapshot().filter(rule => rule.support === 'enforced')
  const matching = (rule: RlvRestriction) => rule.option === speaker.key.toLowerCase()
  const blocks = rules.filter(rule => base(rule.behaviour) === family && !rule.option)
  const exceptions = rules.filter(rule => base(rule.behaviour) === family && matching(rule))
  const strict = rules.some(rule => rule.behaviour === 'permissive' && !rule.option)
  const missing = blocks.some(rule => (strict || rule.behaviour.endsWith('_sec')) &&
    !exceptions.some(exception => exception.sourcePrim === rule.sourcePrim))
  if (missing || blocks.length && !exceptions.length) return true
  // Kokua also matches the owner of an object against the targeted deny list.
  return rules.some(rule => base(rule.behaviour) === family + 'from' &&
    (matching(rule) || avatar.viewer.profile === 'rlv' && rule.option === speaker.owner.toLowerCase()))
}

function kokuaChat(text: string): string {
  const emote = text.indexOf('/me')
  if (emote > 0) text = text.slice(emote)
  if (text.startsWith('/me ') || text.startsWith("/me'") || /^:[a-zA-Z]./.test(text) || text.startsWith(":'")) {
    if (/["]|''|[()*=^_~]| -|- /.test(text)) return '...'
    const bytes = Buffer.from(text)
    const dot = bytes.indexOf(46)
    return bytes.subarray(0, dot >= 0 ? Math.min(dot + 1, 20) : 20).toString('utf8')
  }
  if (text.startsWith('/')) return Buffer.byteLength(text) > 7 ? '...' : text
  return text.startsWith('((') && text.indexOf('))') === text.length - 2 ? text : '...'
}

/** Apply viewer receive policy without changing simulator listens or send records. */
function receive(avatar: WorldAvatar, speaker: ReceivedChatSpeaker, text: string, type: ReceivedChat['type'], attachment = false): void {
  const profile = avatar.viewer.profile
  text = text.replaceAll('\t', '    ')
  // Owner commands are consumed by command dispatch, rather than displayed as chat.
  if (type === 'ownerSay' && text.startsWith('@') && (profile === 'rlv' || profile === 'rlva' && text.length > 3)) return
  const exempt = profile === 'disabled' || type === 'regionSayTo' ||
    speaker.source === 'object' && attachment && speaker.owner.toLowerCase() === avatar.key.toLowerCase() ||
    profile === 'rlva' && (type === 'ownerSay' || speaker.source === 'avatar' && speaker.key.toLowerCase() === avatar.key.toLowerCase())
  if (!exempt) {
    if (profile === 'rlv') {
      if (denied(avatar, 'recvchat', speaker)) text = kokuaChat(text)
      if (denied(avatar, 'recvemote', speaker)) {
        const at = text.indexOf('/me')
        if (at >= 0) text = text.slice(0, at) + '/me ...'
      }
    } else {
      const emote = Buffer.byteLength(text) > 4 && (text.startsWith('/me ') || text.startsWith("/me'"))
      if (emote && denied(avatar, 'recvemote', speaker)) text = '/me ...'
      else if (!emote && text && denied(avatar, 'recvchat', speaker)) {
        if (text.startsWith('/')) { if ([...text].length > 7) text = '...' }
        else if (!(text.length >= 4 && text.startsWith('((') && text.endsWith('))'))) text = '...'
      }
    }
  }
  const record: ReceivedChat = Object.freeze({ speaker: Object.freeze({ ...speaker }), text, type })
  logs.set(avatar, Object.freeze([...receivedChatLog(avatar), record]))
}

/** Avatar local chat reaches nearby viewers, including the speaker's own viewer. */
export function deliverAvatarReceivedChat(world: World, speaker: WorldAvatar, channel: number, text: string, volume: AvatarChatVolume): void {
  if (channel !== 0) return
  const range = volume === 'whisper' ? 10 : volume === 'shout' ? 100 : 20
  const corner = world.corner(speaker.region)
  for (const avatar of world.avatars) {
    const target = world.corner(avatar.region)
    if ((corner.x + speaker.position.x - target.x - avatar.position.x) ** 2 +
        (corner.y + speaker.position.y - target.y - avatar.position.y) ** 2 +
        (speaker.position.z - avatar.position.z) ** 2 > range ** 2) continue
    receive(avatar, { source: 'avatar', key: speaker.key, name: speaker.name, owner: speaker.key }, text, volume)
  }
}

/** Object public chat, private owner chat and avatar-directed region chat. */
export function deliverObjectReceivedChat(linkset: Linkset, prim: Prim, type: ChatType, channel: number, text: string, to?: string): void {
  const world = linkset.world
  if (!world || channel !== 0 || type === 'im') return
  const position = prim.regionPosition()
  const corner = world.corner(linkset.region)
  const range = type === 'whisper' ? 10 : type === 'shout' ? 100 : 20
  for (const avatar of world.avatars) {
    if (type === 'ownerSay' || type === 'regionSayTo') {
      if (avatar.region !== linkset.region || avatar.key.toLowerCase() !== (type === 'ownerSay' ? linkset.owner : to ?? '').toLowerCase()) continue
    } else {
      const target = world.corner(avatar.region)
      if ((corner.x + position.x - target.x - avatar.position.x) ** 2 +
          (corner.y + position.y - target.y - avatar.position.y) ** 2 +
          (position.z - avatar.position.z) ** 2 > range ** 2) continue
    }
    receive(avatar, { source: 'object', key: prim.key, name: prim.name, owner: linkset.owner }, text, type, !!linkset.attachment)
  }
}
