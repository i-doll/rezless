import type { InventoryOffer } from '../builtins/give.js'
import type { World, WorldAvatar } from '../world.js'
import { sendInventoryOfferNotification } from './notify.js'

export interface RlvInventoryOfferDecision {
  readonly accept: boolean
  /** Explicit opt-in; omitted or false keeps accepted content outside #RLV. */
  readonly allowSharedRouting?: boolean
}
export type RlvInventoryOfferResult = Readonly<
  | { status: 'accepted-in-shared' | 'accepted-in-inventory'; folderId: string; routed: boolean }
  | { status: 'declined'; folderId?: never }
  | { status: 'unsupported'; reason: 'disabled' | 'offer-kind'; folderId?: never }
  | { status: 'refused'; reason: 'not-captured' | 'not-recipient' | 'already-resolved'; folderId?: never }
>
interface CapturedOffer {
  readonly world: World
  readonly avatar: WorldAvatar
  readonly offer: InventoryOffer
  resolved: boolean
}
const captured = new WeakMap<InventoryOffer, CapturedOffer>()

/** Bind a genuine avatar delivery to its recipient, retaining a private snapshot. */
export function captureRlvInventoryOffer(world: World, offer: InventoryOffer): void {
  const avatar = world.avatars.find(avatar => avatar.key.toLowerCase() === offer.target.toLowerCase())
  if (!avatar) return
  captured.set(offer, { world, avatar, resolved: false, offer: {
    ...offer, rootPath: [...offer.rootPath], items: offer.items.map(item => ({ ...item,
      permMask: { ...item.permMask }, ...(item.notecardLines ? { notecardLines: [...item.notecardLines] } : {}) })),
  } })
}

/** Resolve one captured folder offer. No simulator give grants consent by itself. */
export function respondRlvInventoryOffer(avatar: WorldAvatar, offer: InventoryOffer, decision: RlvInventoryOfferDecision): RlvInventoryOfferResult {
  const record = captured.get(offer)
  if (!record) return Object.freeze({ status: 'refused', reason: 'not-captured' })
  if (record.avatar !== avatar || !record.world.avatars.includes(avatar)) return Object.freeze({ status: 'refused', reason: 'not-recipient' })
  if (record.resolved) return Object.freeze({ status: 'refused', reason: 'already-resolved' })
  const profile = avatar.viewer.profile
  if (profile === 'disabled') return Object.freeze({ status: 'unsupported', reason: 'disabled' })
  const saved = record.offer
  if (saved.kind !== 'inventoryList' || saved.folder === null) return Object.freeze({ status: 'unsupported', reason: 'offer-kind' })
  record.resolved = true
  const name = saved.folder
  const prefixed = name.startsWith('#RLV/~')
  const notify = (action: string, path: string) => {
    if (profile === 'rlv' || prefixed) sendInventoryOfferNotification(record.world, avatar, `${action} inv_offer ${path}`)
  }
  if (!decision.accept) {
    notify('declined', name)
    return Object.freeze({ status: 'declined' })
  }
  const inventory = avatar.viewer.inventory
  const allowShared = decision.allowSharedRouting === true && !inventory.forbidGiveToRlv
  let parentId: string | null = null
  let leaf = name
  let shared = false
  // RLVa limits the complete prefix path to four segments. Kokua skips empty
  // tokens and accepts deeper paths, but requires an existing shared root.
  const parts = name.split('/')
  const validPath = profile === 'rlv' || parts.length <= 4
  if (prefixed && allowShared && (profile === 'rlva' || inventory.sharedRootId !== null)) {
    if (profile === 'rlva' && inventory.sharedRootId === null && validPath) inventory.receiveFolder('#RLV', null, [], true)
    if (inventory.sharedRootId !== null) {
      parentId = inventory.sharedRootId
      if (validPath) {
        const path = profile === 'rlv' ? parts.slice(1).filter(Boolean) : parts.slice(1)
        for (const segment of path.slice(0, -1)) {
          const existing = inventory.snapshot().find(entry => entry.kind === 'folder' && entry.parentId === parentId &&
            entry.name.toLowerCase() === segment.toLowerCase())
          parentId = existing?.id ?? inventory.receiveFolder(segment, parentId)
        }
        leaf = path[path.length - 1]!
        shared = true
      }
    }
  }
  // RLVa initially delivers a prefixed offer under an existing root even when
  // its path is too deep for the subsequent move/rename observer.
  const folderId = inventory.receiveFolder(leaf, parentId, saved.items)
  if (shared) notify('accepted_in_rlv', profile === 'rlv' ? name : inventory.sharedPath(folderId)!)
  else if (profile === 'rlv' || !prefixed || !allowShared) notify('accepted_in_inv', name)
  return Object.freeze({ status: parentId === null ? 'accepted-in-inventory' : 'accepted-in-shared', folderId, routed: shared })
}
