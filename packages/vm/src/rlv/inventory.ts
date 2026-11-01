import { Linkset } from '../linkset.js'
import type { WorldAvatar } from '../world.js'
import type { Prim } from '../prim.js'
import { RLV_ATTACHMENT_POINTS, getRlvAttachmentPoint } from './attachments.js'
import type { RlvRestriction } from './restrictions.js'
import type { RlvProfile, ViewerProfile } from './profiles.js'
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

/** Resolve the containing shared folder once for force forms and folder policies. */
export function getRlvItemFolder(profile: RlvProfile, inventory: RlvInventory,
  item: RlvInventoryEntry): string | undefined {
  const parent = inventory.snapshot().find(entry => entry.id === item.parentId)
  if (!parent || inventory.sharedPath(parent.id) === undefined) return undefined
  const kokuaFold = item.modifiable === false && !item.wearableType && RLV_ATTACHMENT_POINTS.some(point =>
    parent.name.toLowerCase().replaceAll('(root)', '(avatar center)').includes('(' + point.name.toLowerCase() + ')'))
  const folderId = (profile === 'rlva' ? parent.folded : kokuaFold) ? parent.parentId : parent.id
  return folderId ?? undefined
}

/** Select shared folders from the issuer, a worn object UUID, point or clothing layer.
 * Undefined denotes an invalid option; an empty list is a valid selector with no shared targets.
 */
export function resolveRlvThisFolders(profile: RlvProfile, avatar: WorldAvatar, issuer: Linkset, prim: Prim,
  option: string): readonly string[] | undefined {
  const { inventory } = avatar.viewer
  const worn = issuer.peers.filter(peer => !peer.dead && peer.attachment?.avatar.toLowerCase() === avatar.key.toLowerCase())
    .sort((a, b) => a.attachment!.order - b.attachment!.order)
  const point = getRlvAttachmentPoint(option)
  const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(option)
  let items: readonly RlvInventoryEntry[]
  if (RLV_WEARABLE_TYPES.some(layer => layer === option)) {
    items = inventory.wornWearables().map(id => inventory.snapshot().find(entry => entry.id === id)!)
      .filter(entry => entry.wearableType === option)
  } else if (!option || uuid || point !== undefined) {
    const objects = worn.filter(peer => point !== undefined ? peer.attachment!.point === point
      : peer.prims.some(part => part.key.toLowerCase() === (option || prim.key.toLowerCase())) &&
        (profile === 'rlv' || peer.owner.toLowerCase() === avatar.key.toLowerCase()))
    if (uuid && profile === 'rlva' && !objects.length) return undefined
    items = objects.flatMap(peer => {
      if (profile === 'rlva' && point === undefined && peer.prims[0]!.key.toLowerCase() !== (option || prim.key.toLowerCase())) return []
      const item = inventory.attachmentItem(peer.prims[0]!.key)
      return item ? [item] : []
    })
  } else return undefined
  return items.flatMap(item => {
    const folder = getRlvItemFolder(profile, inventory, item)
    if (!folder) return []
    // Kokua passes paths back through its shared-folder lookup; RLVa keeps category identity.
    const resolved = profile === 'rlv' ? getRlvInventoryFolder(profile, inventory, inventory.sharedPath(folder)!) : folder
    return resolved && resolved !== inventory.sharedRootId ? [resolved] : []
  })
}


/** Kokua selects the rightmost recognized parenthesised point, without trimming. */
export function kokuaPoint(name: string): number {
  name = name.toLowerCase().replaceAll('(root)', '(avatar center)')
  let point = 0
  let rightmost = -1
  for (const candidate of RLV_ATTACHMENT_POINTS) {
    const index = name.lastIndexOf('(' + candidate.name.toLowerCase() + ')')
    if (index > rightmost) { point = candidate.id; rightmost = index }
  }
  return point
}

const folderPolicyContexts = new WeakMap<WorldAvatar, Linkset>()
const folderLockNames = new Set(['attachthis', 'attachallthis', 'detachthis', 'detachallthis',
  'attachthis_except', 'attachallthis_except', 'detachthis_except', 'detachallthis_except'])

/** Folder policies resolve live worn selectors, independently of force selectors. */
export function folderLockSupport(profile: ViewerProfile, behaviour: string, option: string,
  avatar?: WorldAvatar, prim?: Prim): 'enforced' | 'unsupported' | undefined {
  if (!folderLockNames.has(behaviour)) return undefined
  if (avatar && prim?.linkset) folderPolicyContexts.set(avatar, prim.linkset)
  if (profile === 'disabled') return 'unsupported'
  if (profile === 'rlv') return 'enforced'
  const selector = !behaviour.endsWith('_except') && (!option || getRlvAttachmentPoint(option) !== undefined ||
    RLV_WEARABLE_TYPES.some(layer => layer === option))
  const path = !!option && getRlvAttachmentPoint(option) === undefined && !RLV_WEARABLE_TYPES.some(layer => layer === option) &&
    !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(option) && avatar &&
    getRlvInventoryFolder(profile, avatar.viewer.inventory, option) !== undefined
  return selector || path ? 'enforced' : 'unsupported'
}

/** Node/subtree denials and issuer-local exceptions constrain inventory actions. */
export function isRlvFolderWearLocked(avatar: WorldAvatar, entry: RlvInventoryEntry | undefined, wear: boolean,
  rules = avatar.viewer.restrictions.snapshot()): boolean {
  const profile = avatar.viewer.profile
  if (profile === 'disabled' || !entry) return false
  const inventory = avatar.viewer.inventory
  const entries = inventory.snapshot()
  const context = folderPolicyContexts.get(avatar)
  const objects = context?.peers.filter(peer => !peer.dead && peer.attachment?.avatar.toLowerCase() === avatar.key.toLowerCase()) ?? []
  const family = wear ? 'attach' : 'detach'
  const relevant = rules.filter(rule => rule.support === 'enforced' && folderLockNames.has(rule.behaviour) && rule.behaviour.startsWith(family))
  if (!relevant.length) return false
  let folder = getRlvItemFolder(profile, inventory, entry)
  if (profile === 'rlva') {
    while (entries.find(parent => parent.id === folder)?.folded) {
      folder = entries.find(parent => parent.id === folder)?.parentId ?? undefined
    }
  }
  if (!folder) return false
  const original = folder
  const targets = (rule: RlvRestriction): readonly string[] => {
    const point = getRlvAttachmentPoint(rule.option)
    const layer = RLV_WEARABLE_TYPES.some(layer => layer === rule.option)
    if (rule.option && (profile === 'rlv' || !layer && point === undefined)) {
      const id = getRlvInventoryFolder(profile, inventory, rule.option)
      return id ? [id] : []
    }
    if (profile === 'rlv' && (wear || rule.option)) return []
    const selected = layer ? inventory.wornWearables().map(id => entries.find(e => e.id === id)!).filter(e => e.wearableType === rule.option)
      : objects.filter(object => point !== undefined ? object.attachment!.point === point :
        profile === 'rlva' ? object.prims[0]!.key === rule.sourcePrim : object.prims.some(p => p.key === rule.sourcePrim))
        .flatMap(object => { const item = inventory.attachmentItem(object.prims[0]!.key); return item ? [item] : [] })
    if (profile === 'rlva' && !rule.option) {
      return selected.flatMap(item => item.parentId && inventory.sharedPath(item.parentId) !== undefined ? [item.parentId] : [])
    }
    return selected.flatMap(item => { const id = getRlvItemFolder(profile, inventory, item); return id ? [id] : [] })
  }
  const resolved = relevant.map(rule => ({ rule, folders: targets(rule) }))
  const granted = new Set<string>()
  while (folder) {
    for (const { rule, folders } of resolved) {
      if (!folders.includes(folder) || folder !== original && !rule.behaviour.includes('allthis')) continue
      const except = rule.behaviour.endsWith('_except')
      if (except) { granted.add(rule.sourcePrim); continue }
      // Kokua direct denials always win over a grant at the same folder.
      if (profile === 'rlv' && folder === original || !granted.has(rule.sourcePrim)) return true
    }
    folder = entries.find(e => e.id === folder)?.parentId ?? undefined
  }
  if (profile === 'rlv') {
    // Kokua point/layer selectors inspect all eligible contents of each folder.
    const ancestors: string[] = []
    let current: string | undefined = original
    while (current) { ancestors.push(current); current = entries.find(e => e.id === current)?.parentId ?? undefined }
    for (const rule of relevant) {
      if (!rule.option || rule.behaviour.endsWith('_except')) continue
      const point = getRlvAttachmentPoint(rule.option)
      const layer = RLV_WEARABLE_TYPES.some(layer => layer === rule.option)
      if (point === undefined && !layer) continue
      const folders = rule.behaviour.includes('allthis') ? ancestors : [original]
      if (entries.some(item => item.kind === 'item' && folders.includes(getRlvItemFolder(profile, inventory, item) ?? '') &&
        (layer ? item.wearableType === rule.option && inventory.wornWearables().includes(item.id) :
          wear ? rule.option !== 'root' && kokuaPoint(item.name) === point :
            objects.some(object => object.attachment!.point === point && inventory.attachmentItem(object.prims[0]!.key)?.id === item.id)))) return true
    }
  }
  return false
}
