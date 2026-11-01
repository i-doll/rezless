import type { Prim } from './prim.js'
import type { LslValue } from './values/types.js'
import {
  CHANGED_COLOR, CHANGED_MEDIA, CHANGED_RENDER_MATERIAL, CHANGED_SCALE, CHANGED_SHAPE,
  PRIM_COLOR, PRIM_GLTF_BASE_COLOR, PRIM_GLTF_EMISSIVE, PRIM_GLTF_METALLIC_ROUGHNESS,
  PRIM_GLTF_NORMAL, PRIM_RENDER_MATERIAL, PRIM_SIZE, PRIM_TYPE, PRIM_TYPE_SCULPT,
} from './generated/constants.js'

const PRIM_CHANGES = CHANGED_COLOR | CHANGED_MEDIA | CHANGED_RENDER_MATERIAL | CHANGED_SCALE | CHANGED_SHAPE

/** Queue a prim setter's changes, merging bits within each script's pending events. */
export function raisePrimChanged(prim: Prim, changes: number): void {
  const clock = prim.linkset!.clock
  for (const script of prim.scripts) {
    if (!script.running) continue
    script.queueStart()
    const waiting = clock.pendingEvents().filter(e => e.target === script && e.event === 'changed'
      && ((e.payload['changes'] as number) & PRIM_CHANGES) !== 0)
    const merge = waiting.find(e => e.at >= script.resumedAt) ?? (waiting.length >= 2 ? waiting.at(-1) : undefined)
    if (merge) merge.payload['changes'] = (merge.payload['changes'] as number) | changes
    else clock.schedule(script, clock.now, 'changed', { changes })
  }
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

/** Apply a validated rule and report the kinds of changes that rule can cause. */
export function setPrimParamWithChanged(
  prim: Prim, rule: number, rules: ReadonlyArray<LslValue>, cursor: number, caller = prim,
): number | null {
  // PRIM_TYPE cannot convert a prim to mesh. Mesh shapes remain available as fixtures.
  if (rule === PRIM_TYPE && rules[cursor] === PRIM_TYPE_SCULPT && ((rules[cursor + 2] as number) & 7) === 5) return 3
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
