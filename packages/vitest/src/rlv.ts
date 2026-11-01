import { attemptViewerDetach, type Linkset, type RlvDetachOutcome, World, avatarChatLog, type AvatarChatAction, type RlvInventoryConfig, type RlvProfile, type Script, type Prim, type Vector, type WorldAvatar, type ViewerConfig } from '@rezless/vm'
import { loadLinkset } from './loadLinkset.js'

/** Attempt a user lens change in radians, returning the enforced FOV. */
export { changeRlvFov } from '@rezless/vm'

export interface RlvFixture {
  readonly world: World
  readonly avatar: WorldAvatar
  readonly script: Script
  readonly attemptDetach: (attachment?: Linkset) => RlvDetachOutcome
  readonly chatActions: readonly AvatarChatAction[]
  userSit(prim: Prim, offset?: Vector): boolean
  userStand(): boolean
  sendChat(channel: number, message: string): AvatarChatAction
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
      get chatActions() { return avatarChatLog(avatar) },
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
      sendChat: (channel, message) => world.sendAvatarChat(avatar, channel, message) }
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
