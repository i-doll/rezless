import type { Linkset } from '../linkset.js'
import type { ViewerState } from './profiles.js'

/** Firestorm RLVa 2.4.2 reference defaults. Lock-filter setting overrides are unsupported. */
export const RLVA_ATTACHMENT_SETTINGS = Object.freeze({ hideLockedAttachments: false })

/** Canonical avatar attachment points in wire order. Group IDs are viewer groups. */
export const RLV_ATTACHMENT_POINTS = Object.freeze([
  Object.freeze({ id: 1, name: 'Chest', group: 6 }),
  Object.freeze({ id: 2, name: 'Skull', group: 2 }),
  Object.freeze({ id: 3, name: 'Left Shoulder', group: 3 }),
  Object.freeze({ id: 4, name: 'Right Shoulder', group: 1 }),
  Object.freeze({ id: 5, name: 'Left Hand', group: 3 }),
  Object.freeze({ id: 6, name: 'Right Hand', group: 1 }),
  Object.freeze({ id: 7, name: 'Left Foot', group: 5 }),
  Object.freeze({ id: 8, name: 'Right Foot', group: 7 }),
  Object.freeze({ id: 9, name: 'Spine', group: 6 }),
  Object.freeze({ id: 10, name: 'Pelvis', group: 6 }),
  Object.freeze({ id: 11, name: 'Mouth', group: 2 }),
  Object.freeze({ id: 12, name: 'Chin', group: 2 }),
  Object.freeze({ id: 13, name: 'Left Ear', group: 2 }),
  Object.freeze({ id: 14, name: 'Right Ear', group: 2 }),
  Object.freeze({ id: 15, name: 'Left Eyeball', group: 2 }),
  Object.freeze({ id: 16, name: 'Right Eyeball', group: 2 }),
  Object.freeze({ id: 17, name: 'Nose', group: 2 }),
  Object.freeze({ id: 18, name: 'R Upper Arm', group: 1 }),
  Object.freeze({ id: 19, name: 'R Forearm', group: 1 }),
  Object.freeze({ id: 20, name: 'L Upper Arm', group: 3 }),
  Object.freeze({ id: 21, name: 'L Forearm', group: 3 }),
  Object.freeze({ id: 22, name: 'Right Hip', group: 7 }),
  Object.freeze({ id: 23, name: 'R Upper Leg', group: 7 }),
  Object.freeze({ id: 24, name: 'R Lower Leg', group: 7 }),
  Object.freeze({ id: 25, name: 'Left Hip', group: 5 }),
  Object.freeze({ id: 26, name: 'L Upper Leg', group: 5 }),
  Object.freeze({ id: 27, name: 'L Lower Leg', group: 5 }),
  Object.freeze({ id: 28, name: 'Stomach', group: 6 }),
  Object.freeze({ id: 29, name: 'Left Pec', group: 6 }),
  Object.freeze({ id: 30, name: 'Right Pec', group: 6 }),
  Object.freeze({ id: 31, name: 'Center 2', group: 9 }),
  Object.freeze({ id: 32, name: 'Top Right', group: 9 }),
  Object.freeze({ id: 33, name: 'Top', group: 9 }),
  Object.freeze({ id: 34, name: 'Top Left', group: 9 }),
  Object.freeze({ id: 35, name: 'Center', group: 9 }),
  Object.freeze({ id: 36, name: 'Bottom Left', group: 9 }),
  Object.freeze({ id: 37, name: 'Bottom', group: 9 }),
  Object.freeze({ id: 38, name: 'Bottom Right', group: 9 }),
  Object.freeze({ id: 39, name: 'Neck', group: 6 }),
  Object.freeze({ id: 40, name: 'Avatar Center', group: 6 }),
  Object.freeze({ id: 41, name: 'Left Ring Finger', group: 8 }),
  Object.freeze({ id: 42, name: 'Right Ring Finger', group: 8 }),
  Object.freeze({ id: 43, name: 'Tail Base', group: 8 }),
  Object.freeze({ id: 44, name: 'Tail Tip', group: 8 }),
  Object.freeze({ id: 45, name: 'Left Wing', group: 8 }),
  Object.freeze({ id: 46, name: 'Right Wing', group: 8 }),
  Object.freeze({ id: 47, name: 'Jaw', group: 8 }),
  Object.freeze({ id: 48, name: 'Alt Left Ear', group: 8 }),
  Object.freeze({ id: 49, name: 'Alt Right Ear', group: 8 }),
  Object.freeze({ id: 50, name: 'Alt Left Eye', group: 8 }),
  Object.freeze({ id: 51, name: 'Alt Right Eye', group: 8 }),
  Object.freeze({ id: 52, name: 'Tongue', group: 8 }),
  Object.freeze({ id: 53, name: 'Groin', group: 8 }),
  Object.freeze({ id: 54, name: 'Left Hind Foot', group: 8 }),
  Object.freeze({ id: 55, name: 'Right Hind Foot', group: 8 }),
])

const groups = new Map<string, readonly number[]>([
  ['head', [2]], ['torso', [6]], ['arms', [0, 1, 3, 4]], ['legs', [5, 7]], ['hud', [8]],
])
const bridges = new WeakMap<ViewerState, string>()

/** Identify an existing valid Firestorm bridge; no bridge object is fabricated. */
export function setRlvAttachmentBridge(viewer: ViewerState, rootKey: string | undefined): void {
  if (rootKey === undefined) bridges.delete(viewer)
  else bridges.set(viewer, rootKey.toLowerCase())
}

/** Resolve a canonical query option; root is the wire alias for Avatar Center. */
export function getRlvAttachmentPoint(name: string): number | undefined {
  const canonical = name === 'root' ? 'avatar center' : name
  return RLV_ATTACHMENT_POINTS.find(point => point.name.toLowerCase() === canonical)?.id
}

/** Undefined denotes an unsupported command; empty text is a real query reply. */
export function getRlvAttachmentReply(linkset: Linkset, viewer: ViewerState,
  behaviour: string, option = '', avatar = linkset.owner): string | undefined {
  const profile = viewer.profile
  if (profile === 'disabled') return undefined
  if (behaviour !== 'getattach' && (behaviour !== 'getattachnames' || profile !== 'rlva')) return undefined
  const avatarKey = avatar.toLowerCase()
  const bridge = profile === 'rlva' ? bridges.get(viewer) : undefined
  const occupied = new Set(linkset.peers.filter(worn => !worn.dead && worn.attachment &&
    worn.attachment.avatar.toLowerCase() === avatarKey &&
    // Only a registered valid bridge at Center 2 is subtracted. An ordinary
    // attachment with the same name or a missing bridge changes nothing.
    !(worn.attachment.point === 31 && worn.prims[0]!.key.toLowerCase() === bridge))
    .map(worn => worn.attachment!.point))
  if (behaviour === 'getattachnames') {
    const selectedGroups = groups.get(option)
    return RLV_ATTACHMENT_POINTS.filter(point => occupied.has(point.id) &&
      (!selectedGroups || selectedGroups.includes(point.group)))
      .map(point => point.name).join(',')
  }
  if (option) {
    const point = getRlvAttachmentPoint(option)
    return point ? occupied.has(point) ? '1' : '0' : ''
  }
  return '0' + RLV_ATTACHMENT_POINTS.map(point => occupied.has(point.id) ? '1' : '0').join('')
}

/** Save mapped live state before an attachment leaves its World's active objects. */
export function retainRlvAttachment(linkset: Linkset): void {
  const attachment = linkset.attachment
  const rootKey = linkset.prims[0]?.key
  if (!attachment || !rootKey) return
  const avatar = linkset.world?.avatars.find(candidate => candidate.key.toLowerCase() === attachment.avatar.toLowerCase())
  if (!avatar || avatar.viewer.profile === 'disabled') return
  const inventory = avatar.viewer.inventory
  const item = inventory.attachmentItem(rootKey)
  if (item) inventory.rememberAttachment(item.id, linkset)
}
