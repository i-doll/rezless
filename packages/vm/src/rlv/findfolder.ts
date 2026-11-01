import type { Linkset } from '../linkset.js'
import type { Prim } from '../prim.js'
import { getRlvAttachmentPoint } from './attachments.js'
import type { RlvInventory, RlvInventoryEntry } from './inventory.js'
import type { RlvProfile } from './profiles.js'

export interface RlvFolderReply {
  readonly text: string
  readonly failedOption?: boolean
}

/** Search folder names, preserving each profile's traversal and selection order. */
export function findRlvFolders(profile: RlvProfile, inventory: RlvInventory,
  behaviour: string, option: string): RlvFolderReply {
  const multiple = behaviour === 'findfolders'
  const fields = profile === 'rlv' && multiple ? option.split(';').filter(Boolean) : [option]
  const criteria = fields[0] ?? ''
  const terms = criteria.split('&&').filter(Boolean)
  if (profile === 'rlva' && !terms.length) return { text: '', ...(!option ? { failedOption: true } : {}) }
  if (profile === 'rlv' && multiple && !fields.length) return { text: '' }
  const entries = inventory.snapshot()
  const root = entries.find(entry => entry.id === inventory.sharedRootId)
  if (!root) return { text: '' }
  const matches: string[] = []
  const visible = (folder: RlvInventoryEntry) => !!folder.name && !/^[.~]/.test(folder.name)
  const matchesName = (folder: RlvInventoryEntry) => visible(folder) &&
    (profile === 'rlv' || !folder.name.includes('/')) && terms.every(term => folder.name.toLowerCase().includes(term))
  const visit = (folder: RlvInventoryEntry, path: string, isRoot = false) => {
    if (profile === 'rlva' && !isRoot && matchesName(folder)) matches.push(path)
    for (const child of entries.filter(entry => entry.kind === 'folder' && entry.parentId === folder.id)) {
      if (profile === 'rlva' || visible(child)) visit(child, isRoot ? child.name : `${path}/${child.name}`)
    }
    if (profile === 'rlv' && matchesName(folder)) matches.push(path)
  }
  visit(root, '', true)
  if (multiple) return { text: matches.join(fields[1] ?? ',') }
  if (profile === 'rlv') return { text: matches[0] ?? '' }
  let deepest = ''
  let depth = -1
  for (const path of matches) {
    const slashes = path.split('/').length - 1
    if (slashes > depth) { deepest = path; depth = slashes }
  }
  return { text: deepest }
}

const wearableOptions = new Set(['shape', 'skin', 'hair', 'eyes', 'shirt', 'pants', 'shoes', 'socks',
  'jacket', 'gloves', 'undershirt', 'underpants', 'skirt', 'alpha', 'tattoo', 'physics', 'universal'])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Undefined denotes an outfit-layer form, outside the attachment fixture. */
export function getRlvWornPath(profile: RlvProfile, inventory: RlvInventory,
  linkset: Linkset, prim: Prim, behaviour: string, option: string): RlvFolderReply | undefined {
  if (wearableOptions.has(option)) return undefined
  const owner = linkset.owner.toLowerCase()
  const worn = linkset.peers.filter(peer => !peer.dead && peer.attachment?.avatar.toLowerCase() === owner)
    .sort((a, b) => a.attachment!.order - b.attachment!.order)
  const point = getRlvAttachmentPoint(option)
  const byId = !option || uuid.test(option)
  let selected: Linkset[]
  if (byId) {
    const key = option || prim.key.toLowerCase()
    selected = worn.filter(peer => peer.prims.some(part => part.key.toLowerCase() === key) &&
      (profile === 'rlv' || peer.owner.toLowerCase() === owner))
  } else if (point !== undefined) {
    selected = worn.filter(peer => peer.attachment!.point === point)
  } else {
    return { text: '', ...(profile === 'rlva' ? { failedOption: true } : {}) }
  }
  const paths: string[] = []
  for (const peer of selected) {
    const item = inventory.attachmentItem(peer.prims[0]!.key)
    const parent = inventory.snapshot().find(entry => entry.id === item?.parentId)
    const path = item ? inventory.sharedPath(profile === 'rlva' && parent?.folded ? parent.parentId : item.parentId) : undefined
    // Kokua's point iterator retains an empty slot when no shared item is found.
    if (path !== undefined || profile === 'rlv' && !byId) paths.push(path ?? '')
  }
  const text = behaviour === 'getpath' ? paths[0] ?? '' : profile === 'rlv' ? paths.join(',')
    : paths.reduce((reply, path) => reply ? `${reply},${path}` : path, '')
  return { text, ...(profile === 'rlva' && option && byId && !selected.length ? { failedOption: true } : {}) }
}
