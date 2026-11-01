import { sendAvatarChat, type AvatarChatAction } from './chat-actions.js'
import type { RlvRestriction } from './restrictions.js'
import type { World, WorldAvatar } from '../world.js'

/** Prepared gesture chat steps, after channel parsing; animation and sound rendering are external. */
export interface AvatarGesture {
  readonly id: string
  readonly chat?: readonly Readonly<{ channel: number; message: string }>[]
}

export interface AvatarGestureAction {
  readonly action: 'gesture'
  readonly gestureId: string
  readonly status: 'played' | 'blocked' | 'unsupported'
  readonly reason?: 'sendgesture' | 'avatar'
  readonly restrictions: readonly RlvRestriction[]
  readonly chat: readonly AvatarChatAction[]
}

const logs = new WeakMap<WorldAvatar, readonly AvatarGestureAction[]>()

export function avatarGestureLog(avatar: WorldAvatar): readonly AvatarGestureAction[] {
  return logs.get(avatar) ?? Object.freeze([])
}

export function gestureSupport(behaviour: string, option: string): RlvRestriction['support'] | undefined {
  return behaviour === 'sendgesture' ? !option ? 'enforced' : 'unsupported' : undefined
}

/** Playback is denied before any chat step. Allowed chat uses the avatar chat pipeline. */
export function playAvatarGesture(world: World, avatar: WorldAvatar, gesture: AvatarGesture): AvatarGestureAction {
  const restrictions = Object.freeze(avatar.viewer.profile === 'disabled' ? [] :
    avatar.viewer.restrictions.snapshot().filter(rule => rule.behaviour === 'sendgesture' && !rule.option))
  const reason = !world.avatars.includes(avatar) ? 'avatar' : restrictions.length ? 'sendgesture' : undefined
  const chat = Object.freeze(reason ? [] : (gesture.chat ?? []).map(step => sendAvatarChat(world, avatar, step.channel, step.message)))
  const record: AvatarGestureAction = Object.freeze({ action: 'gesture', gestureId: gesture.id,
    status: reason === 'avatar' ? 'unsupported' : reason ? 'blocked' : 'played',
    ...(reason ? { reason } : {}), restrictions, chat })
  logs.set(avatar, Object.freeze([...avatarGestureLog(avatar), record]))
  return record
}
