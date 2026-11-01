import type { BuiltinImpl } from '../runtime.js'
import type { LslType, LslValue, Vector } from '../values/types.js'
import { listElementType, typedList } from '../values/list-types.js'
import { castRayBoxes, castRayTerrain } from '../world.js'

// In-world: batch.py, Aditi / SLua Tideland, 2026-11-01.
export const llCastRay: BuiltinImpl = (ctx, args) => {
  const start = args[0] as Vector
  const end = args[1] as Vector
  const options = args[2] as readonly LslValue[]
  let rejectTypes = 0
  let detectPhantom = false
  let flags = 0
  let maxHits = 1
  for (let i = 0; i < options.length; i += 2) {
    const rule = options[i]
    const value = options[i + 1]
    if ([i, i + 1].some(index => typeof options[index] !== 'number' || !Number.isInteger(options[index])
      || (listElementType(options, index) !== undefined && listElementType(options, index) !== 'integer'))) return []
    const n = Number(value)
    if (rule === 0) {
      if (n < 0 || n > 14) return []
      rejectTypes = n
    } else if (rule === 1) detectPhantom = n !== 0
    else if (rule === 2) {
      if (n < 0 || n > 7) return []
      flags = n
    } else if (rule === 3) {
      if (n < 1 || n > 256) return []
      maxHits = n
    } else return []
  }
  if (start.x === end.x && start.y === end.y && start.z === end.z) return [0]
  const world = ctx.linkset.world
  const hits = (world ? world.castRay(ctx.linkset.region!, start, end, { rejectTypes, detectPhantom })
    : [...castRayBoxes(ctx.linkset.peers, [], start, end, { rejectTypes, detectPhantom }),
      ...(rejectTypes & 8 ? [] : castRayTerrain({}, start, end))]).sort((a, b) => a.fraction - b.fraction).slice(0, maxHits)
  const values: LslValue[] = []
  const types: LslType[] = []
  for (const hit of hits) {
    values.push(flags & 2 ? hit.rootKey : hit.key); types.push('key')
    if (flags & 4) { values.push(hit.linkNumber); types.push('integer') }
    values.push(hit.position); types.push('vector')
    if (flags & 1) { values.push(hit.normal); types.push('vector') }
  }
  values.push(hits.length); types.push('integer')
  return typedList(values, types)
}
