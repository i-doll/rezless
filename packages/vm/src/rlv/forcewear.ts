import type { Linkset } from '../linkset.js'
import type { Prim } from '../prim.js'
import type { WorldAvatar } from '../world.js'
import type { RlvParsedCommand } from './classifier.js'
import type { RlvProfile } from './profiles.js'
import { RLV_ATTACHMENT_POINTS, getRlvAttachmentPoint, isRlvAttachmentBridge, getRlvSavedPoint, rlvForceDetachBlock } from './attachments.js'
import { isRlvBodypart, isRlvStrippable } from './outfit.js'
import { isRlvDetachLocked as locked, isRlvPointLocked } from './detach.js'
import { isRlvFolderWearLocked, collectRlvWearItems, getRlvInventoryFolder, resolveRlvThisFolders, RLV_WEARABLE_TYPES, type RlvInventoryEntry } from './inventory.js'

export interface RlvForceWearItemResult {
  readonly itemId: string
  readonly outcome: 'attached' | 'worn' | 'already-worn' | 'blocked' | 'unsupported' | 'skipped'
  readonly point?: number
  readonly reason?: 'folder-lock' | 'clothing-capacity' | 'nostrip' | 'layer-lock' | 'detach-lock' | 'addattach-lock' | 'missing-definition' | 'unsupported-content' | 'shared-wear-disabled' | 'superseded' | 'unavailable-attachment'
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

/** Accepted viewer work completes even if its issuer is gone; it ends only with the avatar. */
function viewerWork(issuer: Linkset, avatar: WorldAvatar): { readonly dead: boolean } {
  const world = issuer.world
  return { get dead() { return !world?.avatars.includes(avatar) } }
}

/** Kokua strips a leading shared-root prefix from force options; RLVa resolves the path as given. */
function forceOption(profile: RlvProfile, option: string): string {
  return profile === 'rlv' && option.startsWith('#rlv/') ? option.slice('#rlv/'.length) : option
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

function wear(avatar: WorldAvatar, issuer: Linkset, plan: WearItem, rules: ReturnType<WorldAvatar['viewer']['restrictions']['snapshot']>,
  retainIdentity = false): RlvForceWearItemResult {
  const inventory = avatar.viewer.inventory
  const { entry, point, replace } = plan
  let object = existingAttachment(avatar, issuer, entry.id)
  const problem = attachmentProblem(avatar, issuer, entry, object)
  if (problem) return { itemId: entry.id, outcome: 'unsupported', reason: problem }
  if (object?.attachment?.avatar.toLowerCase() === avatar.key.toLowerCase() && !object.dead) {
    inventory.rememberAttachment(entry.id, object)
    return { itemId: entry.id, outcome: 'already-worn', point: object.attachment.point }
  }
  if (isRlvFolderWearLocked(avatar, entry, true, rules)) return { itemId: entry.id, outcome: 'blocked', reason: 'folder-lock' }
  const definition = object && !object.dead ? object : entry.object
  const actualTarget = point || getRlvSavedPoint(definition)
  if (isRlvPointLocked(avatar, actualTarget, 'add', rules)) return { itemId: entry.id, outcome: 'blocked', point: actualTarget, reason: 'addattach-lock' }
  if (point && replace && issuer.peers.some(peer => !peer.dead && peer.attachment?.avatar.toLowerCase() === avatar.key.toLowerCase() &&
    peer.attachment.point === point && locked(avatar, peer, rules))) {
    return { itemId: entry.id, outcome: 'blocked', point, reason: 'detach-lock' }
  }
  if (!object || object.dead || !retainIdentity && object.region !== avatar.region) {
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
        previous.attachment.point === actualPoint && !locked(avatar, previous, rules)) previous.detachFromAvatar()
    }
  }
  inventory.rememberAttachment(entry.id, object)
  return { itemId: entry.id, outcome: 'attached', point: actualPoint }
}

/** Recover an inventory item at its original point, independently of wear locks.
 * Kokua replaces the point; RLVa adds alongside its current occupants.
 */
export function recoverRlvAttachment(avatar: WorldAvatar, issuer: Linkset, itemId: string,
  point: number): RlvForceWearItemResult | undefined {
  const entry = avatar.viewer.inventory.snapshot().find(entry => entry.id === itemId && entry.kind === 'item')
  if (!entry) return undefined
  return wear(avatar, issuer, { entry, point, replace: avatar.viewer.profile === 'rlv' }, [], avatar.viewer.profile === 'rlv')
}

const RLV_FORCE_THIS_WEAR = ['attachthis', 'attachthisover', 'attachthisoverorreplace', 'attachallthis', 'attachallthisover', 'attachallthisoverorreplace', 'addoutfitthis', 'addoutfitthisover', 'addoutfitthisoverorreplace', 'addoutfitallthis', 'addoutfitallthisover', 'addoutfitallthisoverorreplace']

const recursiveWear = ['attachall', 'attachallover', 'attachalloverorreplace', 'addoutfitall', 'addoutfitallover', 'addoutfitalloverorreplace']

/** Shared-folder force wear, including recursive forms. */
export function dispatchForceWearCommand(issuer: Linkset, prim: Prim, avatar: WorldAvatar,
  parsed: RlvParsedCommand, command: string): boolean {
  if (parsed.kind !== 'force' || !['attach', 'attachover', 'attachoverorreplace', ...recursiveWear, ...RLV_FORCE_THIS_WEAR].includes(parsed.behaviour)) return false
  const viewer = avatar.viewer
  if (viewer.profile === 'disabled') return false
  const profile = viewer.profile
  const inventory = viewer.inventory
  const entries = inventory.snapshot()
  const option = parsed.behaviour.includes('this') ? parsed.option : forceOption(profile, parsed.option)
  const thisForm = parsed.behaviour.includes('this')
  const selectedFolders = thisForm ? resolveRlvThisFolders(profile, avatar, issuer, prim, option) : undefined
  const folderId = getRlvInventoryFolder(profile, inventory, option)
  const index = viewer.commandLog.length
  const record = (outcome: RlvForceWearOutcome, results: readonly RlvForceWearItemResult[] = []) => {
    viewer.commandLog[index] = { command, sourcePrim: prim.key, parsed,
      status: outcome === 'unsupported-form' ? 'unsupported' : 'enforced', outcome,
      wearResults: Object.freeze(results.map(result => Object.freeze(result))) }
  }
  if (profile === 'rlva' && (parsed.behaviour === 'addoutfitalloverorreplace' || thisForm && parsed.behaviour.startsWith('addoutfit') && parsed.behaviour.endsWith('overorreplace'))) { record('unsupported-form'); return true }
  if (thisForm && selectedFolders === undefined) { record(profile === 'rlva' ? 'failed-option' : 'no-op'); return true }
  if (!thisForm && (!option || folderId === undefined || folderId === inventory.sharedRootId || profile === 'rlva' &&
    (RLV_WEARABLE_TYPES.some(layer => layer === option) || getRlvAttachmentPoint(option) !== undefined ||
      /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(option)))) {
    record(profile === 'rlva' ? 'failed-option' : 'no-op'); return true
  }
  const recursive = recursiveWear.includes(parsed.behaviour) || thisForm && parsed.behaviour.includes('allthis')
  const folders = thisForm ? selectedFolders! : [folderId!]
  const items = folders.flatMap((id, batch) => collectRlvWearItems(profile, inventory, id, recursive, false, kokuaPoint)
    .map(item => ({ ...item, baseFolder: id, batch })))
  const adding = parsed.behaviour.endsWith('over')
  const replaceForFolder = (parent: RlvInventoryEntry, baseFolder: string): boolean => {
    if (profile === 'rlv') return !adding && !parent.name.startsWith('+')
    let current: RlvInventoryEntry | undefined = parent
    while (current) {
      if (current.name.startsWith('+')) return false
      if (current.id === baseFolder) break
      current = entries.find(e => e.id === current!.parentId)
    }
    return !adding
  }
  const results: RlvForceWearItemResult[] = []
  let plans: WearItem[] = []
  const clothing: { entry: RlvInventoryEntry; replace: boolean; batch: number }[] = []
  for (const collected of items) {
    const { entry } = collected
    const replace = replaceForFolder(collected.folder, collected.baseFolder)
    if (entry.wearableType) {
      if (profile === 'rlva' && collected.folder.id !== entry.parentId && !isRlvStrippable(profile, inventory, entry)) {
        results.push({ itemId: entry.id, outcome: 'skipped', reason: 'nostrip' }); continue
      }
      clothing.push({ entry, replace, batch: collected.batch })
      continue
    }
    if (entry.assetType !== 'object' && !inventory.attachmentMappings().some(mapping => mapping.itemId === entry.id)) {
      results.push({ itemId: entry.id, outcome: 'unsupported', reason: 'unsupported-content' }); continue
    }
    const parent = entries.find(parent => parent.id === entry.parentId)!
    const point = collected.pointFolder ? kokuaPoint(collected.pointFolder.name) : itemPoint(profile, entry, parent)
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
  const rules = viewer.restrictions.snapshot()
  record('no-op')
  issuer.clock.scheduleTask(viewerWork(issuer, avatar), issuer.clock.now, () => {
    const acceptedLayers = new Set<string>()
    const clothingCount = () => inventory.wornWearables().filter(id => !isRlvBodypart(entries.find(e => e.id === id)!)).length
    for (const plan of clothing) {
      const { entry } = plan
      const singleSlot = isRlvBodypart(entry) || profile === 'rlva' && entry.wearableType === 'physics'
      const replace = singleSlot || plan.replace && (profile === 'rlv' || !acceptedLayers.has(plan.batch + '/' + entry.wearableType!))
      const worn = inventory.wornWearables()
      if (worn.includes(entry.id)) {
        acceptedLayers.add(plan.batch + '/' + entry.wearableType!)
        results.push({ itemId: entry.id, outcome: 'already-worn' }); continue
      }
      if (profile === 'rlva' && isRlvFolderWearLocked(avatar, entry, true, rules)) {
        results.push({ itemId: entry.id, outcome: 'blocked', reason: 'folder-lock' }); continue
      }
      const occupants = worn.map(id => entries.find(e => e.id === id)!).filter(e => e.wearableType === entry.wearableType)
      const addLocked = rules.some(rule => rule.behaviour === 'addoutfit' && (!rule.option || rule.option === entry.wearableType))
      const folderRemovalLocked = occupants.some(previous => isRlvFolderWearLocked(avatar, previous, false, rules))
      const removeLocked = rules.some(rule => rule.behaviour === 'remoutfit' && (!rule.option || rule.option === entry.wearableType))
      const atCapacity = !isRlvBodypart(entry) && clothingCount() >= 60
      const wholeWearLocked = profile === 'rlva' || isRlvBodypart(entry)
      if (wholeWearLocked && (addLocked || (replace || atCapacity) && occupants.length > 0 && (removeLocked || profile === 'rlva' && folderRemovalLocked))) {
        results.push({ itemId: entry.id, outcome: 'blocked', reason: 'layer-lock' }); continue
      }
      if (replace && !removeLocked) for (const previous of profile === 'rlv' && !isRlvBodypart(entry) ? occupants.slice(-1) : occupants) {
        if ((profile === 'rlv' && singleSlot || !isRlvFolderWearLocked(avatar, previous, false, rules)) && (singleSlot || isRlvStrippable(profile, inventory, previous, true))) inventory.setWearableWorn(previous.id, false)
      }
      if (!isRlvBodypart(entry) && clothingCount() >= 60) {
        const top = occupants.filter(e => inventory.wornWearables().includes(e.id)).at(-1)
        // At capacity, the appearance manager replaces the current top item.
        if (top && !removeLocked && !isRlvFolderWearLocked(avatar, top, false, rules) && (profile === 'rlva' || isRlvStrippable(profile, inventory, top, true))) {
          inventory.setWearableWorn(top.id, false)
        }
        if (clothingCount() >= 60) {
          results.push({ itemId: entry.id, outcome: 'blocked', reason: 'clothing-capacity' }); continue
        }
      }
      if (profile === 'rlv' && !singleSlot && isRlvFolderWearLocked(avatar, entry, true, rules)) {
        results.push({ itemId: entry.id, outcome: 'blocked', reason: 'folder-lock' }); continue
      }
      if (addLocked) { results.push({ itemId: entry.id, outcome: 'blocked', reason: 'layer-lock' }); continue }
      inventory.setWearableWorn(entry.id, true)
      acceptedLayers.add(plan.batch + '/' + entry.wearableType!)
      results.push({ itemId: entry.id, outcome: 'worn' })
    }
    for (const plan of plans) results.push(wear(avatar, issuer, plan, rules))
    const successful = results.some(result => result.outcome === 'attached' || result.outcome === 'worn' || result.outcome === 'already-worn')
    const blocked = results.some(result => result.outcome === 'blocked')
    const unsupported = results.some(result => result.outcome === 'unsupported')
    record(successful ? blocked || unsupported ? 'partial' : 'allowed'
      : blocked ? 'blocked' : unsupported ? 'unsupported-form' : 'no-op', results)
  })
  return true
}

export interface RlvForceRemoveItemResult {
  /** Inventory item ID, or the attachment root UUID when no mapping exists. */
  readonly itemId: string
  readonly outcome: 'removed' | 'not-worn' | 'blocked' | 'skipped' | 'unsupported'
  readonly reason?: 'folder-lock' | 'detach-lock' | 'layer-lock' | 'bodypart' | 'nostrip' | 'bridge' | 'unsupported-content'
}
export type RlvForceRemoveOutcome = RlvForceWearOutcome

/** Folder attachment removal and clothing-layer removal share queued completion. */
export function dispatchForceRemoveCommand(issuer: Linkset, prim: Prim, avatar: WorldAvatar,
  parsed: RlvParsedCommand, command: string): boolean {
  if (parsed.kind !== 'force' || !['detach', 'detachall', 'remattach', 'remoutfit', 'detachthis', 'detachallthis'].includes(parsed.behaviour)) return false
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
  const option = parsed.behaviour.includes('this') ? parsed.option : forceOption(profile, parsed.option)
  const thisForm = parsed.behaviour.includes('this')
  const selectedFolders = thisForm ? resolveRlvThisFolders(profile, avatar, issuer, prim, option) : undefined
  const folderId = getRlvInventoryFolder(profile, inventory, option)
  const layer = RLV_WEARABLE_TYPES.some(layer => layer === option)
  const folderRemoval = parsed.behaviour !== 'remoutfit' || !!option && !layer && folderId !== undefined
  const recursive = parsed.behaviour === 'detachall' || parsed.behaviour === 'detachallthis'
  if (thisForm && selectedFolders === undefined) { record(profile === 'rlva' ? 'failed-option' : 'no-op'); return true }
  const point = getRlvAttachmentPoint(option)
  const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(option)
  // Named points and UUIDs take precedence over shared folder paths.
  if (!thisForm && folderRemoval && parsed.behaviour !== 'remoutfit' && !recursive && (!option || point !== undefined || uuid)) {
    const objects = issuer.peers.filter(object => !object.dead && object.attachment?.avatar.toLowerCase() === avatar.key.toLowerCase() &&
      (!uuid || profile === 'rlv' || object.owner.toLowerCase() === avatar.key.toLowerCase()) &&
      (!option || (uuid ? object.prims.some(p => p.key.toLowerCase() === option) : object.attachment.point === point)))
    if (profile === 'rlva' && uuid && objects.some(object => object.prims[0]!.key.toLowerCase() !== option)) {
      record('unsupported-form'); return true
    }
    const decisions = objects.map(object => ({ object, reason: rlvForceDetachBlock(avatar, object),
      itemId: inventory.attachmentItem(object.prims[0]!.key)?.id ?? object.prims[0]!.key }))
    record('no-op')
    issuer.clock.scheduleTask(viewerWork(issuer, avatar), issuer.clock.now, () => {
      const results: RlvForceRemoveItemResult[] = decisions.map(({ object, reason, itemId }) => {
        if (reason) return { itemId, outcome: 'blocked', reason }
        if (object.dead || object.attachment?.avatar.toLowerCase() !== avatar.key.toLowerCase()) return { itemId, outcome: 'not-worn' }
        object.detachFromAvatar()
        return { itemId, outcome: 'removed' }
      })
      const removed = results.some(result => result.outcome === 'removed')
      const blocked = results.some(result => result.outcome === 'blocked')
      record(removed ? blocked ? 'partial' : 'allowed' : blocked ? 'blocked' : 'no-op', results)
    })
    return true
  }
  if (!thisForm && folderRemoval && profile === 'rlva' && folderId === undefined &&
    ['head', 'torso', 'arms', 'legs', 'hud'].includes(option)) {
    record('unsupported-form'); return true
  }
  if (!thisForm && (folderRemoval && (folderId === undefined || folderId === inventory.sharedRootId || profile === 'rlva' &&
      (layer || (recursive || parsed.behaviour === 'remoutfit') && (point !== undefined || uuid))) ||
    !folderRemoval && option && !layer)) {
    record(profile === 'rlva' ? 'failed-option' : 'no-op'); return true
  }
  let items = folderRemoval
    ? (thisForm ? selectedFolders! : [folderId!]).flatMap(id => collectRlvWearItems(profile, inventory, id, recursive, true, kokuaPoint).map(item => item.entry))
    : entries.filter(entry => entry.wearableType && (!option || entry.wearableType === option))
  if (folderRemoval && profile === 'rlva') items.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  // Later lock changes cannot retroactively deny already accepted removals.
  const rules = viewer.restrictions.snapshot()
  record('no-op')
  issuer.clock.scheduleTask(viewerWork(issuer, avatar), issuer.clock.now, () => {
    const results: RlvForceRemoveItemResult[] = items.map(entry => {
      if (folderRemoval && !entry.wearableType && entry.assetType !== 'object' && !inventory.attachmentMappings().some(m => m.itemId === entry.id)) {
        return { itemId: entry.id, outcome: 'unsupported', reason: 'unsupported-content' }
      }
      const object = folderRemoval && !entry.wearableType ? existingAttachment(avatar, issuer, entry.id) : undefined
      const worn = !entry.wearableType ? object && !object.dead && object.attachment?.avatar.toLowerCase() === avatar.key.toLowerCase()
        : inventory.wornWearables().includes(entry.id)
      if (!worn) return { itemId: entry.id, outcome: 'not-worn' }
      if (isRlvBodypart(entry)) return { itemId: entry.id, outcome: 'skipped', reason: 'bodypart' }
      if (isRlvFolderWearLocked(avatar, entry, false, rules)) return { itemId: entry.id, outcome: 'blocked', reason: 'folder-lock' }
      if (object && isRlvAttachmentBridge(viewer, object)) return { itemId: entry.id, outcome: 'blocked', reason: 'bridge' }
      if (!isRlvStrippable(profile, inventory, entry, folderRemoval)) return { itemId: entry.id, outcome: 'blocked', reason: 'nostrip' }
      if (object ? locked(avatar, object, rules)
        : rules.some(rule => rule.behaviour === 'remoutfit' && (!rule.option || rule.option === entry.wearableType))) {
        return { itemId: entry.id, outcome: 'blocked', reason: object ? 'detach-lock' : 'layer-lock' }
      }
      if (object) object.detachFromAvatar()
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
