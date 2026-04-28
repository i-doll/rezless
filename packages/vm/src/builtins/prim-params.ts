import type { BuiltinImpl } from '../runtime.js'
import type { LslValue } from '../values/types.js'
import type { Linkset } from '../linkset.js'
import type { Prim } from '../prim.js'
import { PRIM_LINK_TARGET } from '../generated/constants.js'
import { writePrimParamSlots } from '../prim-params.js'

/**
 * Walk a PRIM_* rules list, applying each rule to every prim in the
 * current target set. `PRIM_LINK_TARGET, link` mid-list re-targets all
 * subsequent rules to the link resolved against the linkset (matches
 * llSetLinkPrimitiveParams behavior, available inside
 * llSetPrimitiveParams too).
 *
 * An unknown rule constant terminates the walk silently — same as LSL.
 */
function walkSet(linkset: Linkset, caller: Prim, target: Prim[], rules: ReadonlyArray<LslValue>): void {
  let cur = target
  let i = 0
  while (i < rules.length) {
    const rule = rules[i] as number
    if (typeof rule !== 'number') return
    if (rule === PRIM_LINK_TARGET) {
      const link = (rules[i + 1] as number) | 0
      cur = linkset.resolveTargets(caller.linkNumber, link)
      i += 2
      continue
    }
    let consumed: number | null = null
    for (const p of cur) {
      const c = p.setPrimParam(rule, rules, i + 1)
      if (c === null) return
      consumed = c
    }
    if (consumed === null) {
      // Empty target (PRIM_LINK_TARGET resolved to no prims). The rule
      // is silently skipped, but we still advance past its slot width
      // so a later PRIM_LINK_TARGET to a valid link picks up subsequent
      // rules — matches real LSL behavior.
      const slots = writePrimParamSlots(rule, rules, i + 1)
      if (slots === null) return
      consumed = slots
    }
    i += 1 + consumed
  }
}

function walkGet(linkset: Linkset, caller: Prim, startTarget: Prim[], rules: ReadonlyArray<LslValue>): LslValue[] {
  const out: LslValue[] = []
  let cur = startTarget
  let i = 0
  while (i < rules.length) {
    const rule = rules[i] as number
    if (typeof rule !== 'number') return out
    if (rule === PRIM_LINK_TARGET) {
      const link = (rules[i + 1] as number) | 0
      cur = linkset.resolveTargets(caller.linkNumber, link)
      i += 2
      continue
    }
    // For multi-prim get targets, LSL concatenates per-prim results.
    // If the target set is empty we still need to know how many slots
    // the rule consumes; probe against the caller without keeping the
    // values, then continue.
    let consumed: number
    if (cur.length === 0) {
      const probe = caller.getPrimParam(rule, rules, i + 1)
      if (probe === null) return out
      consumed = probe.consumed
    } else {
      let unknown = false
      let c = 0
      for (const p of cur) {
        const r = p.getPrimParam(rule, rules, i + 1)
        if (r === null) {
          unknown = true
          break
        }
        out.push(...r.values)
        c = r.consumed
      }
      if (unknown) return out
      consumed = c
    }
    i += 1 + consumed
  }
  return out
}

/** llSetPrimitiveParams(list rules) — caller's prim only (until PRIM_LINK_TARGET redirects). */
export const llSetPrimitiveParams: BuiltinImpl = (ctx, args) => {
  const rules = (args[0] as ReadonlyArray<LslValue> | undefined) ?? []
  walkSet(ctx.linkset, ctx.prim, [ctx.prim], rules)
  return undefined
}

/** llSetLinkPrimitiveParams(integer link, list rules) — spec delay applied by dispatcher. */
export const llSetLinkPrimitiveParams: BuiltinImpl = (ctx, args) => {
  const link = ((args[0] as number | undefined) ?? 0) | 0
  const rules = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  const target = ctx.linkset.resolveTargets(ctx.prim.linkNumber, link)
  walkSet(ctx.linkset, ctx.prim, target, rules)
  return undefined
}

/** llSetLinkPrimitiveParamsFast — same as the slow variant minus the delay. */
export const llSetLinkPrimitiveParamsFast: BuiltinImpl = (ctx, args) => {
  const link = ((args[0] as number | undefined) ?? 0) | 0
  const rules = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  const target = ctx.linkset.resolveTargets(ctx.prim.linkNumber, link)
  walkSet(ctx.linkset, ctx.prim, target, rules)
  return undefined
}

/** llGetPrimitiveParams(list params) — caller's prim. */
export const llGetPrimitiveParams: BuiltinImpl = (ctx, args) => {
  const rules = (args[0] as ReadonlyArray<LslValue> | undefined) ?? []
  return walkGet(ctx.linkset, ctx.prim, [ctx.prim], rules)
}

/** llGetLinkPrimitiveParams(integer link, list params). */
export const llGetLinkPrimitiveParams: BuiltinImpl = (ctx, args) => {
  const link = ((args[0] as number | undefined) ?? 0) | 0
  const rules = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  const target = ctx.linkset.resolveTargets(ctx.prim.linkNumber, link)
  return walkGet(ctx.linkset, ctx.prim, target, rules)
}
