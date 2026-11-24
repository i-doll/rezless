import type { Prim } from './prim.js'
import type { Script } from './script.js'
import { cameUp } from './clock.js'
import type { LslValue } from './values/types.js'
import {
  CHANGED_COLOR, CHANGED_INVENTORY, CHANGED_MEDIA, CHANGED_RENDER_MATERIAL, CHANGED_SCALE, CHANGED_SHAPE,
  PRIM_COLOR, PRIM_GLTF_BASE_COLOR, PRIM_GLTF_EMISSIVE, PRIM_GLTF_METALLIC_ROUGHNESS,
  PRIM_GLTF_NORMAL, PRIM_RENDER_MATERIAL, PRIM_SIZE, PRIM_TYPE, PRIM_TYPE_SCULPT,
} from './generated/constants.js'

const PRIM_CHANGES = CHANGED_COLOR | CHANGED_MEDIA | CHANGED_RENDER_MATERIAL | CHANGED_SCALE | CHANGED_SHAPE
const MERGED_CHANGES = PRIM_CHANGES | CHANGED_INVENTORY

/**
 * Queue a prim setter's changes, merging bits within each script's pending events. In-world,
 * a script's llSetColor, llSetLinkColor, llSetAlpha, llSetScale, PRIM_COLOR or llSetLinkMedia
 * raised changed a simulator frame after the call, in every script of the changed prim, behind
 * a link message sent straight after it.
 */
export function raisePrimChanged(prim: Prim, changes: number): void {
  for (const script of prim.scripts) {
    if (script.running && script.hasStarted) raiseChanged(script, changes)
  }
}

/**
 * Queue an inventory change for `script` a simulator frame from now, merged into a change still
 * waiting for it. In-world, gifts to the giver's own prim and llSetColor in one handler gave
 * every script there one changed, in any order, and a gift with llSetLinkColor into an idle
 * child gave it one changed(3). Two gifts from another prim to an idle script could give it one
 * changed or two; it gets two here, as an earlier probe measured.
 */
export function raiseInventoryChanged(script: Script, inGiversPrim: boolean): void {
  const idle = !script.handling && script.handlerStartedAt === undefined
  raiseChanged(script, CHANGED_INVENTORY, idle && !inGiversPrim ? PRIM_CHANGES : MERGED_CHANGES)
}

function raiseChanged(script: Script, changes: number, mergesWith = MERGED_CHANGES): void {
  const clock = script.linkset.clock
  const waiting = clock.pendingEvents().filter(e => e.target === script && e.event === 'changed'
    && ((e.payload['changes'] as number) & MERGED_CHANGES) !== 0)
  const into = waiting.filter(e => ((e.payload['changes'] as number) & ~mergesWith) === 0)
  // A busy handler gets what the clock gives any event that comes up while it is busy, but
  // changes made in one frame are one change. In-world, a script busy in another handler got
  // one changed for two or four recolours of its prim in one frame, and two for two recolours
  // 0.1 s apart.
  const merge = script.busy ? into.find(e => e.raisedAt === clock.now)
    : into.find(e => cameUp(e) >= script.resumedAt) ?? (into.length >= 2 ? into.at(-1) : undefined)
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
