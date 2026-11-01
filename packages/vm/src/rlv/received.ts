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

function denied(avatar: WorldAvatar, family: 'recvchat' | 'recvemote' | 'recvim', speaker: ReceivedChatSpeaker): boolean {
  const rules = avatar.viewer.restrictions.snapshot().filter(rule => rule.support === 'enforced')
  const matching = (rule: RlvRestriction) => rule.option === speaker.key.toLowerCase()
  const blocks = rules.filter(rule => base(rule.behaviour) === family && !rule.option)
  const exceptions = rules.filter(rule => base(rule.behaviour) === family && matching(rule))
  const strict = rules.some(rule => rule.behaviour === 'permissive' && !rule.option)
  const missing = blocks.some(rule => (strict || rule.behaviour.endsWith('_sec')) &&
    !exceptions.some(exception => exception.sourcePrim === rule.sourcePrim))
  if (missing || blocks.length && !exceptions.length) return true
  if (family === 'recvim' && avatar.viewer.profile === 'rlva') {
    const targeted = rules.filter(rule => base(rule.behaviour) === 'recvimfrom')
    const scoped = targeted.filter(rule => strict || rule.behaviour.endsWith('_sec'))
    return scoped.length ? scoped.every(rule => targeted.some(exception => exception.sourcePrim === rule.sourcePrim && matching(exception)))
      : targeted.some(matching)
  }
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

/** Avatar local say reaches nearby viewers, including the speaker's own viewer. */
export function deliverAvatarReceivedChat(world: World, speaker: WorldAvatar, channel: number, text: string): void {
  if (channel !== 0) return
  const corner = world.corner(speaker.region)
  for (const avatar of world.avatars) {
    const target = world.corner(avatar.region)
    if ((corner.x + speaker.position.x - target.x - avatar.position.x) ** 2 +
        (corner.y + speaker.position.y - target.y - avatar.position.y) ** 2 +
        (speaker.position.z - avatar.position.z) ** 2 > 20 ** 2) continue
    receive(avatar, { source: 'avatar', key: speaker.key, name: speaker.name, owner: speaker.key }, text, 'say')
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

/** An IM displayed by the viewer; object and avatar senders retain their identity. */
export interface ReceivedIM {
  readonly speaker: ReceivedChatSpeaker
  readonly text: string
  readonly type: 'im'
}

const imLogs = new WeakMap<WorldAvatar, readonly ReceivedIM[]>()
const emptyIM: readonly ReceivedIM[] = Object.freeze([])

/** Frozen snapshots of the recipient's displayed IMs, separate from local chat. */
export function receivedIMLog(avatar: WorldAvatar): readonly ReceivedIM[] {
  return imLogs.get(avatar) ?? emptyIM
}

export function receivedIMSupport(profile: ViewerProfile, behaviour: string, option: string): RlvRestriction['support'] | undefined {
  const family = base(behaviour)
  if (family !== 'recvim' && family !== 'recvimfrom') return undefined
  if (profile === 'disabled' || profile === 'rlv' && behaviour === 'recvimfrom_sec') return 'unsupported'
  return uuid(option) || !option && family === 'recvim' ? 'enforced' : 'unsupported'
}

function receiveIM(avatar: WorldAvatar, speaker: ReceivedChatSpeaker, text: string): void {
  if (speaker.source === 'avatar' && avatar.viewer.profile !== 'disabled' && denied(avatar, 'recvim', speaker)) {
    text = avatar.viewer.profile === 'rlv' ? '...' : '*** IM blocked by your viewer'
  }
  const record: ReceivedIM = Object.freeze({ speaker: Object.freeze({ ...speaker }), text, type: 'im' })
  imLogs.set(avatar, Object.freeze([...receivedIMLog(avatar), record]))
}

/** Deliver an online one-to-one avatar IM independently of sender restrictions. */
export function deliverAvatarReceivedIM(world: World, sender: WorldAvatar, recipient: string, text: string): void {
  const avatar = world.avatars.find(candidate => candidate.key.toLowerCase() === recipient.toLowerCase())
  if (avatar) receiveIM(avatar, { source: 'avatar', key: sender.key, name: sender.name, owner: sender.key }, text)
}

/** Scripted object IMs bypass recvim and recvimfrom in both profiles. */
export function deliverObjectReceivedIM(linkset: Linkset, prim: Prim, recipient: string, text: string): void {
  const avatar = linkset.world?.avatars.find(candidate => candidate.key.toLowerCase() === recipient.toLowerCase())
  if (avatar) receiveIM(avatar, { source: 'object', key: prim.key, name: prim.name, owner: linkset.owner }, text)
}
