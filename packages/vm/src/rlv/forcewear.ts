import type { Linkset } from '../linkset.js'
import type { Prim } from '../prim.js'
import type { WorldAvatar } from '../world.js'
import type { RlvParsedCommand } from './classifier.js'
import type { RlvProfile } from './profiles.js'
import { RLV_ATTACHMENT_POINTS, getRlvAttachmentPoint, isRlvAttachmentBridge } from './attachments.js'
import { isRlvBodypart, isRlvStrippable } from './outfit.js'
import { getRlvInventoryFolder, RLV_WEARABLE_TYPES, type RlvInventoryEntry } from './inventory.js'

export interface RlvForceWearItemResult {
  readonly itemId: string
  readonly outcome: 'attached' | 'already-worn' | 'blocked' | 'unsupported' | 'skipped'
  readonly point?: number
  readonly reason?: 'detach-lock' | 'missing-definition' | 'unsupported-content' | 'shared-wear-disabled' | 'superseded' | 'unavailable-attachment'
}
export type RlvForceWearOutcome = 'allowed' | 'blocked' | 'no-op' | 'partial' | 'failed-option' | 'unsupported-form'
type WearItem = { entry: RlvInventoryEntry; point: number; replace: boolean }

/** Kokua selects the rightmost recognized parenthesised point, without trimming. */
function kokuaPoint(name: string): number {
  name = name.toLowerCase().replaceAll('(root)', '(avatar center)')
  let point = 0
  let rightmost = -1
  for (const candidate of RLV_ATTACHMENT_POINTS) {
    const index = name.lastIndexOf('(' + candidate.name.toLowerCase() + ')')
    if (index > rightmost) { point = candidate.id; rightmost = index }
  }
  return point
}

/** RLVa legacy folders accept bare names and first/last parenthesised forms. */
function folderPoint(name: string): number {
  const first = /\(([^()]*)\)/.exec(name)
  if (!first) return getRlvAttachmentPoint(name.replace(/^\./, '').toLowerCase()) ?? 0
  const index = first.index
  const text = index === 0 || index === 1 && name.startsWith('.') || index + first[1]!.length + 1 === name.length
    ? first[1]! : [...name.matchAll(/\(([^()]*)\)/g)].at(-1)![1]!
  return getRlvAttachmentPoint(text.toLowerCase()) ?? 0
}

function itemPoint(profile: RlvProfile, entry: RlvInventoryEntry, parent: RlvInventoryEntry): number {
  if (profile === 'rlv') return kokuaPoint(entry.name)
  const text = [...entry.name.matchAll(/\(([^()]*)\)/g)].at(-1)?.[1]?.trim().toLowerCase() ?? ''
  const own = getRlvAttachmentPoint(text) ?? 0
  const folder = folderPoint(parent.name)
  return entry.modifiable === false ? folder || own : own || folder
}

function locked(avatar: WorldAvatar, object: Linkset): boolean {
  return avatar.viewer.restrictions.snapshot().some(rule => rule.behaviour === 'detach' && !rule.option &&
    object.prims.some(prim => prim.key === rule.sourcePrim))
}

function existingAttachment(avatar: WorldAvatar, issuer: Linkset, itemId: string): Linkset | undefined {
  const inventory = avatar.viewer.inventory
  const roots = inventory.attachmentMappings().filter(mapping => mapping.itemId === itemId).map(mapping => mapping.rootKey)
  return issuer.peers.find(peer => !peer.dead && peer.prims[0] && roots.includes(peer.prims[0].key.toLowerCase()) &&
    peer.attachment?.avatar.toLowerCase() === avatar.key.toLowerCase()) ?? inventory.attachmentObject(itemId)
}

function attachmentProblem(avatar: WorldAvatar, issuer: Linkset, entry: RlvInventoryEntry,
  object: Linkset | undefined): 'unavailable-attachment' | 'missing-definition' | undefined {
  if (object && !object.dead && (object.world !== issuer.world || object.owner.toLowerCase() !== avatar.key.toLowerCase() ||
    object.attachment && object.attachment.avatar.toLowerCase() !== avatar.key.toLowerCase())) return 'unavailable-attachment'
  if ((!object || object.dead) && !entry.object) return 'missing-definition'
  return undefined
}

function wear(avatar: WorldAvatar, issuer: Linkset, plan: WearItem): RlvForceWearItemResult {
  const inventory = avatar.viewer.inventory
  const { entry, point, replace } = plan
  let object = existingAttachment(avatar, issuer, entry.id)
  const problem = attachmentProblem(avatar, issuer, entry, object)
  if (problem) return { itemId: entry.id, outcome: 'unsupported', reason: problem }
  if (object?.attachment?.avatar.toLowerCase() === avatar.key.toLowerCase() && !object.dead) {
    inventory.rememberAttachment(entry.id, object)
    return { itemId: entry.id, outcome: 'already-worn', point: object.attachment.point }
  }
  if (point && replace && issuer.peers.some(peer => !peer.dead && peer.attachment?.avatar.toLowerCase() === avatar.key.toLowerCase() &&
    peer.attachment.point === point && locked(avatar, peer))) {
    return { itemId: entry.id, outcome: 'blocked', point, reason: 'detach-lock' }
  }
  if (!object || object.dead || object.region !== avatar.region) {
    const definition = object && !object.dead ? object : entry.object
    if (!definition) return { itemId: entry.id, outcome: 'unsupported', reason: 'missing-definition' }
    object = definition.copy({ world: issuer.world!, region: avatar.region, owner: avatar.key })
  }
  // The existing attachment lifecycle resolves point zero from the saved object.
  // Its events remain queued while replacement removals complete.
  for (const script of object.allScripts()) script.queueRez()
  object.attachToAvatar(avatar.key, point)
  const actualPoint = object.attachment!.point
  if (replace) {
    for (const previous of [...issuer.peers]) {
      if (previous !== object && !previous.dead && previous.attachment?.avatar.toLowerCase() === avatar.key.toLowerCase() &&
        previous.attachment.point === actualPoint && !locked(avatar, previous)) previous.detachFromAvatar()
    }
  }
  inventory.rememberAttachment(entry.id, object)
  return { itemId: entry.id, outcome: 'attached', point: actualPoint }
}

/** Direct folders plus their single-object folded attachment children. */
export function dispatchForceWearCommand(issuer: Linkset, prim: Prim, avatar: WorldAvatar,
  parsed: RlvParsedCommand, command: string): boolean {
  if (parsed.kind !== 'force' || !['attach', 'attachover', 'attachoverorreplace'].includes(parsed.behaviour)) return false
  const viewer = avatar.viewer
  if (viewer.profile === 'disabled') return false
  const profile = viewer.profile
  const inventory = viewer.inventory
  const entries = inventory.snapshot()
  const folderId = getRlvInventoryFolder(profile, inventory, parsed.option)
  const index = viewer.commandLog.length
  const record = (outcome: RlvForceWearOutcome, results: readonly RlvForceWearItemResult[] = []) => {
    viewer.commandLog[index] = { command, sourcePrim: prim.key, parsed,
      status: outcome === 'unsupported-form' ? 'unsupported' : 'enforced', outcome,
      wearResults: Object.freeze(results.map(result => Object.freeze(result))) }
  }
  if (parsed.option.includes('|')) { record('unsupported-form'); return true }
  if (!parsed.option || folderId === undefined || folderId === inventory.sharedRootId) {
    record(profile === 'rlva' ? 'failed-option' : 'no-op'); return true
  }
  const folder = entries.find(entry => entry.id === folderId)!
  let items = entries.filter(entry => entry.kind === 'item' && entry.parentId === folderId)
  for (const child of entries.filter(entry => entry.kind === 'folder' && entry.parentId === folderId)) {
    const contents = entries.filter(entry => entry.kind === 'item' && entry.parentId === child.id)
    if (profile === 'rlva' ? child.folded && contents.filter(entry => entry.assetType === 'object').length === 1
      : kokuaPoint(child.name) && contents.length === 1 && contents[0]!.assetType === 'object' && contents[0]!.modifiable === false) {
      items = [...items, ...contents]
    }
  }
  const replace = parsed.behaviour !== 'attachover' && !folder.name.startsWith('+')
  const results: RlvForceWearItemResult[] = []
  let plans: WearItem[] = []
  for (const entry of items) {
    if (entry.assetType !== 'object' && !inventory.attachmentMappings().some(mapping => mapping.itemId === entry.id)) {
      results.push({ itemId: entry.id, outcome: 'unsupported', reason: 'unsupported-content' }); continue
    }
    const parent = entries.find(parent => parent.id === entry.parentId)!
    const point = profile === 'rlv' && parent.id !== folderId ? kokuaPoint(parent.name) : itemPoint(profile, entry, parent)
    if (profile === 'rlva' && !point && !inventory.sharedWear) {
      results.push({ itemId: entry.id, outcome: 'skipped', reason: 'shared-wear-disabled' }); continue
    }
    const problem = attachmentProblem(avatar, issuer, entry, existingAttachment(avatar, issuer, entry.id))
    if (problem) { results.push({ itemId: entry.id, outcome: 'unsupported', reason: problem }); continue }
    // Named RLVa replacements retain only the final pending item at a point.
    if (profile === 'rlva' && point && replace) {
      for (const previous of plans.filter(plan => plan.point === point)) results.push({
        itemId: previous.entry.id, outcome: 'skipped', point, reason: 'superseded' })
      plans = plans.filter(plan => plan.point !== point)
    }
    plans.push({ entry, point, replace: replace && (profile === 'rlva' || point !== 0) })
  }
  if (profile === 'rlva') plans.sort((a, b) => a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0)
  record('no-op')
  issuer.clock.scheduleTask(issuer, issuer.clock.now, () => {
    for (const plan of plans) results.push(wear(avatar, issuer, plan))
    const successful = results.some(result => result.outcome === 'attached' || result.outcome === 'already-worn')
    const blocked = results.some(result => result.outcome === 'blocked')
    const unsupported = results.some(result => result.outcome === 'unsupported')
    record(successful ? blocked || unsupported ? 'partial' : 'allowed'
      : blocked ? 'blocked' : unsupported ? 'unsupported-form' : 'no-op', results)
  })
  return true
}

export interface RlvForceRemoveItemResult {
  readonly itemId: string
  readonly outcome: 'removed' | 'not-worn' | 'blocked' | 'skipped' | 'unsupported'
  readonly reason?: 'detach-lock' | 'layer-lock' | 'bodypart' | 'nostrip' | 'bridge' | 'unsupported-content'
}
export type RlvForceRemoveOutcome = RlvForceWearOutcome

/** Folder attachment removal and clothing-layer removal share queued completion. */
export function dispatchForceRemoveCommand(issuer: Linkset, prim: Prim, avatar: WorldAvatar,
  parsed: RlvParsedCommand, command: string): boolean {
  if (parsed.kind !== 'force' || !['detach', 'remoutfit'].includes(parsed.behaviour)) return false
  const viewer = avatar.viewer
  if (viewer.profile === 'disabled') return false
  const profile = viewer.profile
  const inventory = viewer.inventory
  const entries = inventory.snapshot()
  const index = viewer.commandLog.length
  const record = (outcome: RlvForceRemoveOutcome, results: readonly RlvForceRemoveItemResult[] = []) => {
    viewer.commandLog[index] = { command, sourcePrim: prim.key, parsed,
      status: outcome === 'unsupported-form' ? 'unsupported' : 'enforced', outcome,
      removeResults: Object.freeze(results.map(result => Object.freeze(result))) }
  }
  const path = parsed.option.replace(/^#rlv\//, '')
  const folderId = getRlvInventoryFolder(profile, inventory, path)
  const folderRemoval = parsed.behaviour === 'detach'
  if (parsed.option.includes('|') || folderRemoval && (!parsed.option || getRlvAttachmentPoint(parsed.option) !== undefined ||
    profile === 'rlva' && folderId === undefined && ['head', 'torso', 'arms', 'legs', 'hud'].includes(parsed.option) || /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(parsed.option))) {
    record('unsupported-form'); return true
  }
  const layer = RLV_WEARABLE_TYPES.some(layer => layer === parsed.option)
  if (!folderRemoval && parsed.option && !layer && folderId !== undefined) {
    record('unsupported-form'); return true
  }
  if (folderRemoval && (folderId === undefined || folderId === inventory.sharedRootId || profile === 'rlva' && layer) ||
    !folderRemoval && parsed.option && !RLV_WEARABLE_TYPES.some(layer => layer === parsed.option)) {
    record(profile === 'rlva' ? 'failed-option' : 'no-op'); return true
  }
  let items = folderRemoval ? entries.filter(entry => entry.kind === 'item' && entry.parentId === folderId)
    : entries.filter(entry => entry.wearableType && (!parsed.option || entry.wearableType === parsed.option))
  if (folderRemoval) {
    for (const child of entries.filter(entry => entry.kind === 'folder' && entry.parentId === folderId)) {
      const contents = entries.filter(entry => entry.kind === 'item' && entry.parentId === child.id)
      if (profile === 'rlva' ? child.folded : kokuaPoint(child.name) && contents.length === 1 &&
        contents[0]!.assetType === 'object' && contents[0]!.modifiable === false) {
        items = [...items, ...contents.filter(entry => entry.assetType === 'object' || inventory.attachmentMappings().some(m => m.itemId === entry.id))]
      }
    }
  }
  if (folderRemoval && profile === 'rlva') items.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  // Later lock changes cannot retroactively deny already accepted removals.
  const rules = viewer.restrictions.snapshot()
  record('no-op')
  issuer.clock.scheduleTask(issuer, issuer.clock.now, () => {
    const results: RlvForceRemoveItemResult[] = items.map(entry => {
      if (folderRemoval && entry.assetType !== 'object' && !inventory.attachmentMappings().some(m => m.itemId === entry.id)) {
        return { itemId: entry.id, outcome: 'unsupported', reason: 'unsupported-content' }
      }
      const object = folderRemoval ? existingAttachment(avatar, issuer, entry.id) : undefined
      const worn = folderRemoval ? object && !object.dead && object.attachment?.avatar.toLowerCase() === avatar.key.toLowerCase()
        : inventory.wornWearables().includes(entry.id)
      if (!worn) return { itemId: entry.id, outcome: 'not-worn' }
      if (!folderRemoval && isRlvBodypart(entry)) return { itemId: entry.id, outcome: 'skipped', reason: 'bodypart' }
      if (object && isRlvAttachmentBridge(viewer, object)) return { itemId: entry.id, outcome: 'blocked', reason: 'bridge' }
      if (!isRlvStrippable(profile, inventory, entry, folderRemoval)) return { itemId: entry.id, outcome: 'blocked', reason: 'nostrip' }
      if (rules.some(rule => folderRemoval ? rule.behaviour === 'detach' && !rule.option && object!.prims.some(p => p.key === rule.sourcePrim)
        : rule.behaviour === 'remoutfit' && (!rule.option || rule.option === entry.wearableType))) {
        return { itemId: entry.id, outcome: 'blocked', reason: folderRemoval ? 'detach-lock' : 'layer-lock' }
      }
      if (folderRemoval) object!.detachFromAvatar()
      else inventory.setWearableWorn(entry.id, false)
      return { itemId: entry.id, outcome: 'removed' }
    })
    const removed = results.some(result => result.outcome === 'removed')
    const blocked = results.some(result => result.outcome === 'blocked')
    const unsupported = results.some(result => result.outcome === 'unsupported')
    record(removed ? blocked || unsupported ? 'partial' : 'allowed' : blocked ? 'blocked' : unsupported ? 'unsupported-form' : 'no-op', results)
  })
  return true
}
