import type { Linkset } from '../linkset.js'
import { RLV_ATTACHMENT_POINTS } from './attachments.js'
import { getRlvInventoryFolder, RLV_WEARABLE_TYPES, type RlvInventory, type RlvInventoryEntry } from './inventory.js'
import type { RlvProfile, ViewerState } from './profiles.js'

export interface RlvOutfitReply { readonly text: string; readonly failedOption?: boolean }
type Counts = { total: number; worn: number }
const digit = ({ total, worn }: Counts): number => !total ? 0 : !worn ? 1 : worn === total ? 3 : 2
const visible = (entry: RlvInventoryEntry): boolean => !!entry.name && !entry.name.startsWith('.')

/** Read seeded clothing/bodyparts and live mapped attachments, without wear operations. */
export function getRlvOutfitReply(profile: RlvProfile, inventory: RlvInventory, linkset: Linkset,
  behaviour: 'getoutfit' | 'getinvworn', option: string, avatar = linkset.owner): RlvOutfitReply {
  const entries = inventory.snapshot()
  const worn = new Set(inventory.wornWearables())
  if (behaviour === 'getoutfit') {
    const layers = new Set(entries.filter(entry => worn.has(entry.id)).map(entry => entry.wearableType))
    const selected = RLV_WEARABLE_TYPES.find(layer => layer === option)
    if (option && !selected && profile === 'rlva') return { text: '', failedOption: true }
    // RlvHideLockedLayers=false: clothing and bodyparts both expose their actual occupancy.
    return { text: (selected ? [selected] : RLV_WEARABLE_TYPES).map(layer => layers.has(layer) ? '1' : '0').join('') }
  }
  const id = getRlvInventoryFolder(profile, inventory, option)
  if (id === undefined) return { text: '', ...(profile === 'rlva' && inventory.sharedRootId !== null ? { failedOption: true } : {}) }
  const folder = entries.find(entry => entry.id === id)!
  const mappings = inventory.attachmentMappings()
  const objects = new Set(mappings.map(mapping => mapping.itemId))
  const liveRoots = new Set(linkset.peers.filter(peer => !peer.dead &&
    peer.attachment?.avatar.toLowerCase() === avatar.toLowerCase()).map(peer => peer.prims[0]!.key.toLowerCase()))
  for (const mapping of mappings) if (liveRoots.has(mapping.rootKey)) worn.add(mapping.itemId)
  const isObject = (entry: RlvInventoryEntry) => entry.assetType === 'object' || objects.has(entry.id)
  const children = (parentId: string) => entries.filter(entry => entry.kind === 'folder' && entry.parentId === parentId)
  const items = (parentId: string) => entries.filter(entry => entry.kind === 'item' && entry.parentId === parentId)
  const counts = (values: readonly RlvInventoryEntry[]): Counts => {
    const wearable = values.filter(entry => entry.wearableType !== undefined || isObject(entry))
    return { total: wearable.length, worn: wearable.filter(entry => worn.has(entry.id)).length }
  }

  if (profile === 'rlv') {
    // Kokua retains no-mod sentinel handling separately from ordinary descendants.
    const info = (current: RlvInventoryEntry): string => {
      const root = current.id === inventory.sharedRootId
      const direct = items(current.id)
      const own = root ? { total: 0, worn: 0 } : counts(direct)
      const name = current.name.toLowerCase().replaceAll('(root)', '(avatar center)')
      const noMod = !root && direct.length === 1 && isObject(direct[0]!) && direct[0]!.modifiable === false &&
        RLV_ATTACHMENT_POINTS.some(point => name.includes(`(${point.name.toLowerCase()})`))
      if (noMod) return own.worn ? 'N' : 'n'
      let sub = 0
      let previous = 0
      for (const child of children(current.id)) {
        const result = info(child)
        if (result === 'n' || result === 'N') {
          if (!root) {
            own.total++
            if (result === 'N') own.worn++
            sub = result === 'N' ? 3 : 1
          }
        } else if (visible(child)) {
          const score = result === '00' ? 0 : ['11', '01', '10'].includes(result) ? 1 :
            ['33', '03', '30'].includes(result) ? 3 : 2
          sub = previous === 0 ? score : score === 0 || previous === score ? previous : 2
          previous = sub
        }
      }
      return `${digit(own)}${sub}`
    }
    const wire = (value: string) => value === 'n' ? '10' : value === 'N' ? '30' : value
    return { text: `|${wire(info(folder))}` + children(id).filter(visible)
      .map(child => `,${child.name}|${wire(info(child))}`).join('') }
  }

  // RLVa folds direct items into the containing folder and skips hidden subtrees.
  const info = (current: RlvInventoryEntry): { own: Counts; descendants: Counts } => {
    const own = counts(items(current.id))
    const descendants = { total: 0, worn: 0 }
    for (const child of children(current.id)) {
      if (!child.name) continue
      if (child.folded) {
        const direct = items(child.id)
        if (direct.filter(isObject).length === 1) {
          const folded = counts(direct.filter(entry => !entry.wearableType || isRlvStrippable('rlva', inventory, entry)))
          own.total += folded.total
          own.worn += folded.worn
        }
      } else if (visible(child)) {
        const nested = info(child)
        descendants.total += nested.own.total + nested.descendants.total
        descendants.worn += nested.own.worn + nested.descendants.worn
      }
    }
    return { own, descendants }
  }
  const code = (current: RlvInventoryEntry) => {
    const result = info(current)
    return `${digit(result.own)}${digit(result.descendants)}`
  }
  return { text: `|${code(folder)}` + children(id).filter(child => visible(child) && !child.folded)
    .sort((a, b) => a.id.toLowerCase() < b.id.toLowerCase() ? -1 : 1)
    .map(child => `,${child.name}|${code(child)}`).join('') }
}

/** Recognized layer locks; all-layer locks have an empty option. */
export function outfitSupport(behaviour: string, option: string): 'enforced' | undefined {
  return (behaviour === 'addoutfit' || behaviour === 'remoutfit') &&
    (!option || RLV_WEARABLE_TYPES.some(layer => layer === option)) ? 'enforced' : undefined
}

const bodyparts = new Set(['skin', 'eyes', 'hair', 'shape'])
export function isRlvBodypart(entry: RlvInventoryEntry): boolean {
  return bodyparts.has(entry.wearableType!)
}

/** Name protection differs between layer removal and shared-folder removal. */
export function isRlvStrippable(profile: RlvProfile, inventory: RlvInventory, entry: RlvInventoryEntry,
  folderRemoval = false): boolean {
  const entries = inventory.snapshot()
  const protectedName = (name: string) => (profile === 'rlv' ? name.toLowerCase() : name).includes('nostrip')
  if ((profile === 'rlva' || folderRemoval) && protectedName(entry.name)) return false
  let parent = entries.find(folder => folder.id === entry.parentId)
  while (parent) {
    if (protectedName(parent.name)) return false
    if (profile === 'rlva' && !parent.folded) break
    parent = entries.find(folder => folder.id === parent!.parentId)
  }
  return true
}

export type RlvWearableActionOutcome = 'allowed' | 'blocked' | 'no-op'

/** Explicit clothing add/remove actions; seeding inventory remains unrestricted. */
export function attemptRlvWearable(avatar: import('../world.js').WorldAvatar, itemId: string,
  wear: boolean): RlvWearableActionOutcome {
  const viewer = avatar.viewer
  const entry = viewer.inventory.snapshot().find(entry => entry.id === itemId)
  if (!entry?.wearableType || isRlvBodypart(entry) || viewer.inventory.wornWearables().includes(itemId) === wear) return 'no-op'
  if (viewer.profile !== 'disabled' && viewer.restrictions.snapshot().some(rule =>
    rule.behaviour === (wear ? 'addoutfit' : 'remoutfit') && (!rule.option || rule.option === entry.wearableType))) return 'blocked'
  viewer.inventory.setWearableWorn(itemId, wear)
  return 'allowed'
}

// Name queries use wearable-type order, unlike the legacy getoutfit bitmap.
const outfitNameLayers = ['shape', 'skin', 'hair', 'eyes', 'shirt', 'pants', 'shoes', 'socks',
  'jacket', 'gloves', 'undershirt', 'underpants', 'skirt', 'alpha', 'tattoo', 'physics', 'universal'] as const

/** RLVa clothing name queries read current occupancy and every active layer lock. */
export function getRlvOutfitNames(viewer: ViewerState, behaviour: string, option: string): RlvOutfitReply | undefined {
  if (viewer.profile !== 'rlva' || !['getoutfitnames', 'getaddoutfitnames', 'getremoutfitnames'].includes(behaviour)) return undefined
  if (option) return { text: '', failedOption: true }
  const inventory = viewer.inventory
  const wornIds = new Set(inventory.wornWearables())
  const worn = inventory.snapshot().filter(entry => wornIds.has(entry.id))
  const rules = viewer.restrictions.snapshot()
  const locked = (behaviour: string, layer: string) => rules.some(rule =>
    rule.behaviour === behaviour && (!rule.option || rule.option === layer))
  const clothingCount = worn.filter(entry => !isRlvBodypart(entry)).length
  const layers = outfitNameLayers.filter(layer => {
    const items = worn.filter(entry => entry.wearableType === layer)
    if (behaviour === 'getoutfitnames') return items.length > 0
    if (behaviour === 'getremoutfitnames') return !locked('remoutfit', layer) &&
      items.some(entry => !isRlvBodypart(entry) && isRlvStrippable('rlva', inventory, entry))
    if (locked('addoutfit', layer)) return false
    // Without locked worn items, replacement remains available even at capacity.
    if (!items.length || !locked('remoutfit', layer)) return true
    return bodyparts.has(layer) || layer === 'physics' ? false : clothingCount < 60
  })
  return { text: layers.join(',') }
}
