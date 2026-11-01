import { attemptViewerDetach, type Linkset, type RlvDetachOutcome, World, avatarChatLog, type AvatarChatAction, type RlvInventoryConfig, type RlvProfile, type Script, type WorldAvatar } from '@rezless/vm'
import { loadLinkset } from './loadLinkset.js'

/** Attempt a user lens change in radians, returning the enforced FOV. */
export { changeRlvFov } from '@rezless/vm'

export interface RlvFixture {
  readonly world: World
  readonly avatar: WorldAvatar
  readonly script: Script
  readonly attemptDetach: (attachment?: Linkset) => RlvDetachOutcome
  readonly chatActions: readonly AvatarChatAction[]
  sendChat(channel: number, message: string): AvatarChatAction
}

/** Load identical source into separate Worlds. Call start after seeding each fixture. */
export async function loadRlvPair(input: { readonly source: string }): Promise<Record<RlvProfile, RlvFixture>> {
  const load = async (profile: RlvProfile): Promise<RlvFixture> => {
    const world = new World()
    world.addRegion('RLV fixture', { x: 0, y: 0 })
    const avatar = world.addAvatar({ username: 'rlv.fixture', region: 'RLV fixture', viewer: { profile } })
    const loaded = await loadLinkset({ world, region: avatar.region, owner: avatar.key,
      prims: [{ name: 'RLV fixture', scripts: [{ name: 'fixture', source: { source: input.source } }] }] })
    return { world, avatar, script: loaded.scripts['fixture']!,
      attemptDetach: (attachment = loaded.linkset) => attemptViewerDetach(avatar, attachment),
      get chatActions() { return avatarChatLog(avatar) },
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

/** Replace the avatar tree and optional item-to-attachment mappings without wearing objects. */
export function seedRlvInventory(avatar: WorldAvatar, inventory: RlvInventoryConfig): void {
  avatar.viewer.inventory.seed(inventory)
}
