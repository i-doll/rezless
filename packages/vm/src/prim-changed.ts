import type { Prim } from './prim.js'
import type { Script } from './script.js'
import { cameUp } from './clock.js'
import type { LslValue } from './values/types.js'
import {
  CHANGED_ALLOWED_DROP, CHANGED_COLOR, CHANGED_INVENTORY, CHANGED_MEDIA, CHANGED_RENDER_MATERIAL, CHANGED_SCALE, CHANGED_SHAPE,
  PRIM_COLOR, PRIM_GLTF_BASE_COLOR, PRIM_GLTF_EMISSIVE, PRIM_GLTF_METALLIC_ROUGHNESS,
  PRIM_GLTF_NORMAL, PRIM_RENDER_MATERIAL, PRIM_SIZE, PRIM_TYPE, PRIM_TYPE_SCULPT,
} from './generated/constants.js'

const PRIM_CHANGES = CHANGED_COLOR | CHANGED_MEDIA | CHANGED_RENDER_MATERIAL | CHANGED_SCALE | CHANGED_SHAPE
const MERGED_CHANGES = PRIM_CHANGES | CHANGED_INVENTORY

/**
 * Queue a prim setter's changes, merging bits within each script's pending events. In-world,
 * a script's llSetColor, llSetLinkColor, llSetAlpha, llSetScale, PRIM_COLOR or llSetLinkMedia
 * raised changed a simulator frame after the call, in every script of the changed prim, behind
 * a link message sent straight after it. A colour, alpha, shape, media or render material change
 * of a child whose scripts had no changed handler reached the root's scripts instead.
 */
export function raisePrimChanged(prim: Prim, changes: number): void {
  for (const script of prim.changeListeners()) raiseChanged(script, changes)
}

/**
 * Queue an inventory change for `script` a simulator frame from now, merged into a change still
 * waiting for it. In-world, gifts into a prim of the giver's linkset and colour changes made in
 * one handler gave every script in that prim one changed, in any order, whether it was the
 * giver, idle, or in another prim.
 */
export function raiseInventoryChanged(script: Script): void {
  raiseChanged(script, CHANGED_INVENTORY)
}

/**
 * Queue a CHANGED_ALLOWED_DROP for `script` now, from a gift into an object its owner could not
 * modify, merged into a drop change raised for it this frame that it has not run yet, and for a
 * gift from inside the linkset into a prim change too. `giver` is the script that gave from inside
 * the linkset; a gift from another object has none.
 *
 * In-world, drops landing in one frame gave one changed(64) to each script that had not yet run one:
 * two gifts in one handler, a gift from inside and one from another object in either order, and two
 * gifts from other objects. A script that ran the first change before the next gift got a second.
 * The giving script got a second change when the other object's drop came before its handler.
 * A recolour then a gift from inside gave one changed(66), and one changed(66) still when another
 * object's gift came first; a gift then a recolour gave changed(64), then changed(2).
 */
export function raiseDropChanged(script: Script, giver?: Script): void {
  const clock = script.linkset.clock
  const pending = clock.pendingEvents().filter(e => e.target === script && e.event === 'changed' && cameUp(e) === clock.now)
  const drop = pending.find(e => drops.has(e.payload) && !(script === giver && drops.get(e.payload) === undefined))
  const prim = giver && pending.find(e => !drops.has(e.payload) && ((e.payload['changes'] as number) & PRIM_CHANGES) !== 0)
  const merge = drop ?? prim
  if (merge) {
    merge.payload['changes'] = (merge.payload['changes'] as number) | CHANGED_ALLOWED_DROP
    if (drop && prim) {
      drop.payload['changes'] = (drop.payload['changes'] as number) | (prim.payload['changes'] as number)
      clock.purgeWhere(e => e === prim)
    }
    if (!drop) drops.set(merge.payload, giver)
  } else {
    const payload = { changes: CHANGED_ALLOWED_DROP }
    drops.set(payload, giver)
    clock.schedule(script, clock.now, 'changed', payload)
  }
}

// Drop changes waiting to run, with the script that gave from inside the linkset.
const drops = new WeakMap<object, Script | undefined>()

function raiseChanged(script: Script, changes: number): void {
  const clock = script.linkset.clock
  const waiting = clock.pendingEvents().filter(e => e.target === script && e.event === 'changed'
    && ((e.payload['changes'] as number) & MERGED_CHANGES) !== 0)
  // A busy handler gets what the clock gives any event that comes up while it is busy, but
  // changes made in one frame are one change. In-world, a script busy in another handler got
  // one changed for two or four recolours of its prim in one frame, and two for two recolours
  // 0.1 s apart.
  const merge = script.busy ? waiting.find(e => e.raisedAt === clock.now)
    : waiting.find(e => cameUp(e) >= script.resumedAt) ?? (waiting.length >= 2 ? waiting.at(-1) : undefined)
  if (merge) merge.payload['changes'] = (merge.payload['changes'] as number) | changes
  else clock.scheduleNextFrame(script, 'changed', { changes })
}

function snapshot(prim: Prim, rule: number): string | undefined {
  switch (rule) {
    case PRIM_SIZE: return JSON.stringify(prim.params.size)
    case PRIM_TYPE: return JSON.stringify(prim.params.shape)
    case PRIM_RENDER_MATERIAL:
    case PRIM_GLTF_BASE_COLOR:
    case PRIM_GLTF_NORMAL:
    case PRIM_GLTF_METALLIC_ROUGHNESS:
    case PRIM_GLTF_EMISSIVE:
      return JSON.stringify(prim.params.faces.map(face => [face.renderMaterial, face.gltf]))
    default: return undefined
  }
}

/** A sculpt type PRIM_TYPE accepts: stitching 0 to 4 or 6, with the invert and mirror flags. */
function isSculptType(type: LslValue | undefined): boolean {
  if (typeof type !== 'number') return false
  const stitching = type & 7
  return (type & 0x38) === 0 && stitching !== 5 && stitching !== 7
}

/** Apply a validated rule and report the kinds of changes that rule can cause. */
export function setPrimParamWithChanged(
  prim: Prim, rule: number, rules: ReadonlyArray<LslValue>, cursor: number, caller = prim,
): number | null {
  // PRIM_TYPE cannot convert a prim to mesh, and ignores a sculpt type it does not know or a
  // rule without one. Mesh shapes remain available as fixtures.
  if (rule === PRIM_TYPE && rules[cursor] === PRIM_TYPE_SCULPT && !isSculptType(rules[cursor + 2])) return 3
  const before = snapshot(prim, rule)
  const consumed = prim.setPrimParam(rule, rules, cursor, caller)
  if (consumed === null) return consumed
  if (rule === PRIM_COLOR) raisePrimChanged(prim, CHANGED_COLOR)
  else if (before !== snapshot(prim, rule)) {
    if (rule === PRIM_SIZE) raisePrimChanged(prim.linkset!.prims[0]!, CHANGED_SCALE)
    else if (rule === PRIM_TYPE) raisePrimChanged(prim, CHANGED_SHAPE)
    else raisePrimChanged(prim, CHANGED_RENDER_MATERIAL)
  }
  return consumed
}
