import type { RlvProfile } from './profiles.js'

/** Avatar inventory fixtures are separate from prim contents and inventory offers. */
export interface RlvInventoryEntry {
  readonly id: string
  readonly parentId: string | null
  readonly name: string
  readonly kind: 'folder' | 'item'
  /** Effective folded-folder state for the RLVa profile, including legacy naming. */
  readonly folded?: boolean
}

export interface RlvInventoryConfig {
  readonly sharedRootId: string | null
  /** Direct-child order is the order of entries, independent of folder names. */
  readonly entries: readonly RlvInventoryEntry[]
}

/** An owned copy of a seeded avatar tree; IDs and parent relations survive snapshots. */
export class RlvInventory {
  private entries: readonly RlvInventoryEntry[] = Object.freeze([])
  private rootId: string | null = null

  constructor(config?: RlvInventoryConfig) {
    if (config) this.seed(config)
  }

  get sharedRootId(): string | null { return this.rootId }
  snapshot(): readonly RlvInventoryEntry[] { return this.entries }

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
    this.entries = Object.freeze(entries)
    this.rootId = config.sharedRootId
  }
}

/** Untruncated getinv wire text. Child order follows the seeded inventory. */
export function getRlvInventoryList(profile: RlvProfile, inventory: RlvInventory, path = ''): string {
  const entries = inventory.snapshot()
  const children = (id: string) => entries.filter(entry => entry.kind === 'folder' && entry.parentId === id)
  let id = inventory.sharedRootId
  if (id === null) return ''
  const tokens = path.toLowerCase().split('/').filter(Boolean)
  if (profile === 'rlva') {
    for (const token of tokens) {
      const folders = children(id)
      const match = folders.find(folder => folder.name.toLowerCase() === token) ??
        folders.find(folder => !folder.name.startsWith('.') && folder.name.toLowerCase().includes(token))
      if (!match) return ''
      id = match.id
    }
  } else {
    if (path && tokens.length === 0) return ''
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
      if (!best) return ''
      id = best.id
      offset += bestSize
    }
  }
  return children(id).filter(folder => folder.name && !folder.name.startsWith('.') &&
    (profile === 'rlv' || !folder.folded && !folder.name.includes('/'))).map(folder => folder.name).join(',')
}
