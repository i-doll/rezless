import { avatarIMLog, type AvatarIMAction } from '@rezless/vm'
import { receivedChatLog, receivedIMLog, type ReceivedChat, type ReceivedIM } from '@rezless/vm'
import { attemptRlvWearable, attemptViewerDetach, type Linkset, type RlvDetachOutcome, type RlvCommandRecord, type RlvTeleportAction, World, avatarChatLog, type AvatarChatAction, type AvatarChatVolume, type RlvInventoryConfig, type RlvProfile, type Script, type Prim, type Vector, type WorldAvatar, type ViewerConfig } from '@rezless/vm'
import { loadLinkset } from './loadLinkset.js'

export { attemptViewerAttach } from '@rezless/vm'

/** Attempt a user lens change in radians, returning the enforced FOV. */
export { changeRlvFov } from '@rezless/vm'

/** Accept or decline a captured folder offer for its original recipient. */
export { respondRlvInventoryOffer } from '@rezless/vm'
export type { RlvInventoryOfferDecision, RlvInventoryOfferResult } from '@rezless/vm'

export interface RlvFixture {
  readonly world: World
  readonly avatar: WorldAvatar
  readonly script: Script
  readonly attemptDetach: (attachment?: Linkset) => RlvDetachOutcome
  readonly imActions: readonly AvatarIMAction[]
  sendIM(recipient: string, message: string): AvatarIMAction
  readonly receivedIM: readonly ReceivedIM[]
  readonly receivedChat: readonly ReceivedChat[]
  readonly chatActions: readonly AvatarChatAction[]
  readonly teleportActions: readonly (RlvTeleportAction & RlvCommandRecord)[]
  attemptWearable(itemId: string, wear: boolean): import('@rezless/vm').RlvWearableActionOutcome
  userSit(prim: Prim, offset?: Vector): boolean
  userStand(): boolean
  sendChat(channel: number, message: string, volume?: AvatarChatVolume): AvatarChatAction
}

/** Load identical source into separate Worlds. Call start after seeding each fixture. */
export async function loadRlvPair(input: { readonly source: string; readonly viewer?: Omit<ViewerConfig, 'profile'> }): Promise<Record<RlvProfile, RlvFixture>> {
  const load = async (profile: RlvProfile): Promise<RlvFixture> => {
    const world = new World()
    world.addRegion('RLV fixture', { x: 0, y: 0 })
    const avatar = world.addAvatar({ username: 'rlv.fixture', region: 'RLV fixture', viewer: { ...input.viewer, profile } })
    const loaded = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
      prims: [{ name: 'RLV fixture', scripts: [{ name: 'fixture', source: { source: input.source } }] }] })
    avatar.viewer.session.bind(loaded.linkset, avatar)
    return { world, avatar, script: loaded.scripts['fixture']!,
      attemptDetach: (attachment = loaded.linkset) => attemptViewerDetach(avatar, attachment),
      get teleportActions() { return avatar.viewer.commandLog.filter((entry): entry is RlvTeleportAction & RlvCommandRecord =>
        entry.status === 'action' && entry.action === 'tpto') },
      get imActions() { return avatarIMLog(avatar) },
      sendIM: (recipient, message) => world.attemptAvatarIM(avatar, recipient, message),
      get receivedIM() { return receivedIMLog(avatar) },
      get receivedChat() { return receivedChatLog(avatar) },
      get chatActions() { return avatarChatLog(avatar) },
      attemptWearable: (itemId, wear) => attemptRlvWearable(avatar, itemId, wear),
      userSit: (prim, offset) => {
        const accepted = world.userSitAvatar(avatar, prim, offset)
        loaded.linkset.advanceTime(0)
        return accepted
      },
      userStand: () => {
        const accepted = world.userStandAvatar(avatar)
        loaded.linkset.advanceTime(0)
        return accepted
      },
      sendChat: (channel, message, volume) => world.sendAvatarChat(avatar, channel, message, volume) }
  }
  return { rlv: await load('rlv'), rlva: await load('rlva') }
}

/** Unsupported cases carry a reason and are data, never an automatic test skip. */
export type RlvExpectation<T> =
  | { readonly kind: 'expected'; readonly value: T }
  | { readonly kind: 'unsupported'; readonly reason: string }

export type RlvExpectations<T> =
  | { readonly shared: RlvExpectation<T> }
  | Readonly<Record<RlvProfile, RlvExpectation<T>>>

export function rlvExpectationFor<T>(expectations: RlvExpectations<T>, profile: RlvProfile): RlvExpectation<T> {
  return 'shared' in expectations ? expectations.shared : expectations[profile]
}

/** Replace the avatar tree, worn wearable IDs and item-to-attachment mappings without wear operations. */
export function seedRlvInventory(avatar: WorldAvatar, inventory: RlvInventoryConfig): void {
  avatar.viewer.inventory.seed(inventory)
}

/** Release the retained startup queue without advancing simulator time. */
export function setRlvViewerReady(avatar: WorldAvatar, ready = true): void {
  avatar.viewer.session.setReady(ready)
}

/** End a viewer session; scripts and inventory keep their simulator state. */
export function resetRlvViewerSession(avatar: WorldAvatar): void {
  avatar.viewer.session.reset()
}

/** Supply viewer object-list membership independently of simulator visibility. */
export function setRlvObjectAvailable(avatar: WorldAvatar, sourcePrim: string, available: boolean): void {
  avatar.viewer.session.setObjectAvailable(sourcePrim, available)
}

export { getRlvCameraPosition, getRlvCameraLimits, setRlvCameraOrigins } from '@rezless/vm'
export type { RlvCameraLimits } from '@rezless/vm'
