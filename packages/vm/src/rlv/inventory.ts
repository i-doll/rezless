import { Linkset } from '../linkset.js'
import type { RlvProfile } from './profiles.js'
import type { InventoryItem } from '../inventory.js'
import { InventoryType } from '../inventory.js'
import { PERM_MODIFY } from '../generated/constants.js'
import { deterministicKey } from '../keys.js'

export const RLV_WEARABLE_TYPES = Object.freeze([
  'gloves', 'jacket', 'pants', 'shirt', 'shoes', 'skirt', 'socks', 'underpants',
  'undershirt', 'skin', 'eyes', 'hair', 'shape', 'alpha', 'tattoo', 'physics', 'universal',
] as const)
export type RlvWearableType = typeof RLV_WEARABLE_TYPES[number]

/** Avatar inventory fixtures are separate from prim contents and inventory offers. */
export interface RlvInventoryEntry {
  readonly id: string
  readonly parentId: string | null
  readonly name: string
  readonly kind: 'folder' | 'item'
  /** Effective folded-folder state for the RLVa profile, including legacy naming. */
  readonly folded?: boolean
  /** Wearable layer for clothing and bodyparts. No bodyparts are fabricated. */
  readonly wearableType?: RlvWearableType
  /** Explicit object type permits unworn attachments to count in folder queries. */
  readonly assetType?: 'object'
  /** Saved attachment definition, copied into the wearing avatar's World. */
  readonly object?: Linkset
  /** Object modify permission, used by Kokua no-mod folder aggregation. */
  readonly modifiable?: boolean
  /** Accepted gift metadata, including the transferred permissions and content. */
  readonly content?: Readonly<InventoryItem>
}

/** Inventory identity of an existing attachment; this never wears or spawns it. */
export interface RlvWornAttachment {
  readonly itemId: string
  readonly rootKey: string
}

export interface RlvInventoryConfig {
  readonly sharedRootId: string | null
  /** RLVa shared wear accepts attachments without a named point; default true. */
  readonly sharedWear?: boolean
  /** Viewer setting forbidding shared routing for received folder offers. */
  readonly forbidGiveToRlv?: boolean
  /** Direct-child order is the order of entries, independent of folder names. */
  readonly entries: readonly RlvInventoryEntry[]
  readonly wornAttachments?: readonly RlvWornAttachment[]
  /** Inventory IDs of worn clothing and bodyparts, including items outside #RLV. */
  readonly wornWearables?: readonly string[]
}

/** An owned copy of a seeded avatar tree; IDs and parent relations survive snapshots. */
export class RlvInventory {
  private entries: readonly RlvInventoryEntry[] = Object.freeze([])
  private attachments: readonly RlvWornAttachment[] = Object.freeze([])
  private wearables: readonly string[] = Object.freeze([])
  private rootId: string | null = null
  private sharedWearEnabled = true
  private objects = new Map<string, Linkset>()
  private forbidGive = false
  private receivedIds = 0

  constructor(config?: RlvInventoryConfig) {
    if (config) this.seed(config)
  }

  get sharedWear(): boolean { return this.sharedWearEnabled }
  get forbidGiveToRlv(): boolean { return this.forbidGive }
  attachmentObject(itemId: string): Linkset | undefined { return this.objects.get(itemId) }

  /** Retain inventory identity and script state across viewer detach and wear. */
  rememberAttachment(itemId: string, object: Linkset): void {
    this.objects.set(itemId, object)
    const rootKey = object.prims[0]!.key.toLowerCase()
    this.attachments = Object.freeze([...this.attachments.filter(entry => entry.itemId !== itemId && entry.rootKey !== rootKey),
      Object.freeze({ itemId, rootKey })])
  }

  get sharedRootId(): string | null { return this.rootId }
  snapshot(): readonly RlvInventoryEntry[] { return this.entries }
  wornWearables(): readonly string[] { return this.wearables }
  attachmentMappings(): readonly RlvWornAttachment[] { return this.attachments }

  /** Append received content without replacing worn state or existing snapshots. */
  receiveFolder(name: string, parentId: string | null, items: readonly InventoryItem[] = [], sharedRoot = false): string {
    if (parentId !== null && !this.entries.some(entry => entry.id === parentId && entry.kind === 'folder')) {
      throw new Error('Received folder parent must identify a folder.')
    }
    const nextId = () => {
      let id: string
      do { id = deterministicKey(`received-inventory/${++this.receivedIds}`) } while (this.entries.some(entry => entry.id === id))
      return id
    }
    const id = nextId()
    const children = items.map(item => Object.freeze({ id: nextId(), parentId: id, name: item.name, kind: 'item' as const,
      ...(item.type === InventoryType.OBJECT ? { assetType: 'object' as const, modifiable: !!(item.permMask.owner & PERM_MODIFY),
        ...(item.object ? { object: item.object } : {}) } : {}),
      content: Object.freeze({ ...item, permMask: Object.freeze({ ...item.permMask }),
        ...(item.notecardLines ? { notecardLines: Object.freeze([...item.notecardLines]) } : {}) }) }))
    this.entries = Object.freeze([...this.entries, Object.freeze({ id, name, parentId, kind: 'folder' as const }), ...children])
    if (sharedRoot) this.rootId = id
    return id
  }

  /** Change one existing wearable without replacing inventory or attachment state. */
  setWearableWorn(itemId: string, worn: boolean): void {
    if (!this.entries.some(entry => entry.id === itemId && entry.wearableType)) return
    this.wearables = Object.freeze(worn ? [...this.wearables.filter(id => id !== itemId), itemId]
      : this.wearables.filter(id => id !== itemId))
  }

  /** Resolve item identity independently of whether the linkset is currently worn. */
  attachmentItem(rootKey: string): RlvInventoryEntry | undefined {
    const mapping = this.attachments.find(entry => entry.rootKey === rootKey.toLowerCase())
    return mapping && this.entries.find(entry => entry.id === mapping.itemId)
  }

  /** Undefined means outside the shared root; the root itself has an empty path. */
  sharedPath(folderId: string | null): string | undefined {
    if (this.rootId === null) return undefined
    const parts: string[] = []
    while (folderId !== this.rootId) {
      const folder = this.entries.find(entry => entry.id === folderId)
      if (!folder) return undefined
      parts.unshift(folder.name)
      folderId = folder.parentId
    }
    return parts.join('/')
  }

  /** Replace atomically, rejecting ambiguous IDs, invalid parents and cycles. */
  seed(config: RlvInventoryConfig): void {
    const entries = config.entries.map(entry => Object.freeze({ ...entry }))
    const byId = new Map(entries.map(entry => [entry.id, entry]))
    if (byId.size !== entries.length || entries.some(entry => !entry.id)) throw new Error('Inventory IDs must be nonempty and unique.')
    if (config.sharedRootId !== null && byId.get(config.sharedRootId)?.kind !== 'folder') throw new Error('Shared root must identify a folder.')
    for (const entry of entries) {
      const seen = new Set([entry.id])
      let parentId = entry.parentId
      while (parentId !== null) {
        const parent = byId.get(parentId)
        if (!parent || parent.kind !== 'folder') throw new Error('Inventory parents must identify folders.')
        if (seen.has(parentId)) throw new Error('Inventory parent relations must be acyclic.')
        seen.add(parentId)
        parentId = parent.parentId
      }
    }
    const attachments = (config.wornAttachments ?? []).map(entry => Object.freeze({ ...entry, rootKey: entry.rootKey.toLowerCase() }))
    const roots = new Set(attachments.map(entry => entry.rootKey))
    const items = new Set(attachments.map(entry => entry.itemId))
    if (roots.size !== attachments.length || items.size !== attachments.length ||
      attachments.some(entry => !entry.rootKey || byId.get(entry.itemId)?.kind !== 'item' || byId.get(entry.itemId)?.wearableType !== undefined)) {
      throw new Error('Attachment mappings require unique item IDs and root keys, and existing inventory items.')
    }
    const wearables = [...config.wornWearables ?? []]
    if (entries.some(entry => entry.wearableType !== undefined &&
      (entry.kind !== 'item' || entry.assetType !== undefined || !RLV_WEARABLE_TYPES.includes(entry.wearableType))) ||
      entries.some(entry => entry.assetType !== undefined && (entry.kind !== 'item' || entry.assetType !== 'object')) ||
      new Set(wearables).size !== wearables.length || wearables.some(id => !byId.get(id)?.wearableType)) {
      throw new Error('Worn wearables require unique existing wearable item IDs and valid layers.')
    }
    if (entries.some(entry => entry.object !== undefined && (entry.assetType !== 'object' ||
      !(entry.object instanceof Linkset) || entry.object.dead || !entry.object.prims.length))) {
      throw new Error('Attachment definitions require a nonempty live object definition and object asset type.')
    }
    this.objects.clear()
    this.sharedWearEnabled = config.sharedWear ?? true
    this.forbidGive = config.forbidGiveToRlv ?? false
    this.wearables = Object.freeze(wearables)
    this.attachments = Object.freeze(attachments)
    this.entries = Object.freeze(entries)
    this.rootId = config.sharedRootId
  }
}

/** Resolve the shared path using each profile's existing folder lookup policy. */
export function getRlvInventoryFolder(profile: RlvProfile, inventory: RlvInventory, path = ''): string | undefined {
  const entries = inventory.snapshot()
  const children = (id: string) => entries.filter(entry => entry.kind === 'folder' && entry.parentId === id)
  let id = inventory.sharedRootId
  if (id === null) return undefined
  const tokens = path.toLowerCase().split('/').filter(Boolean)
  if (profile === 'rlva') {
    for (const token of tokens) {
      const folders = children(id)
      const match = folders.find(folder => folder.name.toLowerCase() === token) ??
        folders.find(folder => !folder.name.startsWith('.') && folder.name.toLowerCase().includes(token))
      if (!match) return undefined
      id = match.id
    }
  } else {
    if (path && tokens.length === 0) return undefined
    const parts = tokens.map(token => token.split('|')[0]!)
    let offset = 0
    while (offset < parts.length) {
      let best: RlvInventoryEntry | undefined
      let bestSize = 0
      for (const folder of children(id)) {
        if (!folder.name || folder.name.startsWith('.')) continue
        const name = folder.name.toLowerCase()
        for (let size = parts.length - offset; size > 0; size--) {
          const candidate = parts.slice(offset, offset + size).join('/')
          if (!name.includes(candidate)) continue
          // Longest path span wins; equal spans are replaced only by an exact match.
          if (size > bestSize || size === bestSize && name === candidate) {
            best = folder
            bestSize = size
          }
          break
        }
      }
      if (!best) return undefined
      id = best.id
      offset += bestSize
    }
  }
  return id
}

/** Untruncated getinv wire text. Child order follows the seeded inventory. */
export function getRlvInventoryList(profile: RlvProfile, inventory: RlvInventory, path = ''): string {
  const id = getRlvInventoryFolder(profile, inventory, path)
  if (id === undefined) return ''
  const children = (id: string) => inventory.snapshot().filter(entry => entry.kind === 'folder' && entry.parentId === id)
  return children(id).filter(folder => folder.name && !folder.name.startsWith('.') &&
    (profile === 'rlv' || !folder.folded && !folder.name.includes('/'))).map(folder => folder.name).join(',')
}

export interface RlvCollectedWearItem {
  readonly entry: RlvInventoryEntry
  /** Folder whose wear prefix applies, after folding. */
  readonly folder: RlvInventoryEntry
  /** Kokua no-mod children take their point from this folder. */
  readonly pointFolder?: RlvInventoryEntry
}

/** Shared force-wear traversal, with profile-specific hidden and folded folders. */
export function collectRlvWearItems(profile: RlvProfile, inventory: RlvInventory, folderId: string,
  recursive: boolean, removing: boolean, pointFromName: (name: string) => number): RlvCollectedWearItem[] {
  const entries = inventory.snapshot()
  const result = new Map<string, RlvCollectedWearItem>()
  const visited = new Set<string>()
  const items = (id: string) => entries.filter(e => e.kind === 'item' && e.parentId === id)
  const object = (e: RlvInventoryEntry) => e.assetType === 'object' || inventory.attachmentMappings().some(m => m.itemId === e.id)
  const add = (entry: RlvInventoryEntry, folder: RlvInventoryEntry, pointFolder?: RlvInventoryEntry) => {
    if (!result.has(entry.id)) result.set(entry.id, { entry, folder, ...(pointFolder ? { pointFolder } : {}) })
  }
  const visit = (folder: RlvInventoryEntry) => {
    if (visited.has(folder.id)) return
    visited.add(folder.id)
    const own = () => {
      if (folder.id !== inventory.sharedRootId) for (const entry of items(folder.id)) add(entry, folder)
    }
    if (profile === 'rlv') own()
    for (const child of entries.filter(e => e.kind === 'folder' && e.parentId === folder.id)) {
      const contents = items(child.id)
      if (profile === 'rlv' && recursive && removing) {
        visit(child)
      } else if (profile === 'rlva' && child.folded) {
        if (removing || contents.filter(object).length === 1) {
          for (const entry of contents.filter(e => object(e) || !removing && e.wearableType)) add(entry, folder)
        }
      } else {
        if (profile === 'rlv' && folder.id !== inventory.sharedRootId && pointFromName(child.name) &&
          contents.length === 1 && object(contents[0]!) && contents[0]!.modifiable === false) {
          add(contents[0]!, folder, child)
        }
        if (recursive && child.name && !child.name.startsWith('.')) visit(child)
      }
    }
    if (profile === 'rlva') own()
  }
  const folder = entries.find(e => e.id === folderId && e.kind === 'folder')
  if (folder) visit(folder)
  return [...result.values()]
}
