import type { Linkset } from '../linkset.js'
import type { Prim } from '../prim.js'
import type { WorldAvatar } from '../world.js'
import type { RlvParsedCommand } from './classifier.js'
import type { RlvProfile } from './profiles.js'
import { RLV_ATTACHMENT_POINTS, getRlvAttachmentPoint } from './attachments.js'
import { getRlvInventoryFolder, type RlvInventoryEntry } from './inventory.js'

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

function wear(avatar: WorldAvatar, issuer: Linkset, plan: WearItem): RlvForceWearItemResult {
  const inventory = avatar.viewer.inventory
  const { entry, point, replace } = plan
  const roots = inventory.attachmentMappings().filter(mapping => mapping.itemId === entry.id).map(mapping => mapping.rootKey)
  let object = issuer.peers.find(peer => !peer.dead && peer.prims[0] && roots.includes(peer.prims[0].key.toLowerCase()) &&
    peer.attachment?.avatar.toLowerCase() === avatar.key.toLowerCase()) ?? inventory.attachmentObject(entry.id)
  if (object && !object.dead && (object.world !== issuer.world || object.owner.toLowerCase() !== avatar.key.toLowerCase() ||
    object.attachment && object.attachment.avatar.toLowerCase() !== avatar.key.toLowerCase())) {
    return { itemId: entry.id, outcome: 'unsupported', reason: 'unavailable-attachment' }
  }
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
