import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { LslType, LslValue } from '../values/types.js'
import type { Linkset } from '../linkset.js'
import type { Prim } from '../prim.js'
import { LINK_ALL_CHILDREN, LINK_ALL_OTHERS, LINK_SET, PRIM_LINK_TARGET } from '../generated/constants.js'
import { checkPrimRule, primParamTypes, writePrimParamSlots } from '../prim-params.js'
import { typedList } from '../values/list-types.js'
import { sayError } from './debug.js'

/**
 * Walk a PRIM_* rules list, applying each rule to every prim in the
 * current target set. `PRIM_LINK_TARGET, link` mid-list re-targets all
 * subsequent rules to the link resolved against the linkset (matches
 * llSetLinkPrimitiveParams behavior, available inside
 * llSetPrimitiveParams too).
 *
 * An unknown rule or a bad argument says the simulator's error on
 * DEBUG_CHANNEL and stops the walk; rules before it stay applied.
 */
function walkSet(ctx: CallContext, fn: string, target: Prim[], rules: ReadonlyArray<LslValue>): void {
  const { linkset, prim: caller } = ctx
  let cur = target
  let i = 0
  for (let ruleNumber = 1; i < rules.length; ruleNumber++) {
    const rule = rules[i] as number
    if (rule === PRIM_LINK_TARGET) {
      const link = (rules[i + 1] as number) | 0
      cur = linkset.resolveTargets(caller.linkNumber, link)
      i += 2
      continue
    }
    const error = typeof rule === 'number' ? checkPrimRule(rule, rules, i + 1) : ': unknown rule'
    if (error !== null) {
      sayError(ctx, `${fn} error running rule #${ruleNumber}${error}.`)
      return
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

function walkGet(
  linkset: Linkset,
  caller: Prim,
  startTarget: Prim[],
  rules: ReadonlyArray<LslValue>,
): ReadonlyArray<LslValue> {
  const out: LslValue[] = []
  const types: Array<LslType | undefined> = []
  let cur = startTarget
  let i = 0
  while (i < rules.length) {
    const rule = rules[i] as number
    if (typeof rule !== 'number') break
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
      if (probe === null) break
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
        types.push(...primParamTypes(rule, r.values))
        c = r.consumed
      }
      if (unknown) break
      consumed = c
    }
    i += 1 + consumed
  }
  return typedList(out, types)
}

/** llSetPrimitiveParams(list rules) — caller's prim only (until PRIM_LINK_TARGET redirects). */
export const llSetPrimitiveParams: BuiltinImpl = (ctx, args) => {
  const rules = (args[0] as ReadonlyArray<LslValue> | undefined) ?? []
  walkSet(ctx, 'llSetPrimitiveParams', [ctx.prim], rules)
  return undefined
}

/** llSetLinkPrimitiveParams(integer link, list rules) — spec delay applied by dispatcher. */
export const llSetLinkPrimitiveParams: BuiltinImpl = (ctx, args) => {
  const link = ((args[0] as number | undefined) ?? 0) | 0
  const rules = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  const target = ctx.linkset.resolveTargets(ctx.prim.linkNumber, link)
  walkSet(ctx, 'llSetLinkPrimitiveParams', target, rules)
  return undefined
}

/** llSetLinkPrimitiveParamsFast — same as the slow variant minus the delay. */
export const llSetLinkPrimitiveParamsFast: BuiltinImpl = (ctx, args) => {
  const link = ((args[0] as number | undefined) ?? 0) | 0
  const rules = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  const target = ctx.linkset.resolveTargets(ctx.prim.linkNumber, link)
  walkSet(ctx, 'llSetLinkPrimitiveParamsFast', target, rules)
  return undefined
}

/** llGetPrimitiveParams(list params) — caller's prim. */
export const llGetPrimitiveParams: BuiltinImpl = (ctx, args) => {
  const rules = (args[0] as ReadonlyArray<LslValue> | undefined) ?? []
  return walkGet(ctx.linkset, ctx.prim, [ctx.prim], rules)
}

/** llGetLinkPrimitiveParams(integer link, list params). Multi-prim links return []. */
export const llGetLinkPrimitiveParams: BuiltinImpl = (ctx, args) => {
  const link = ((args[0] as number | undefined) ?? 0) | 0
  if (link === LINK_SET || link === LINK_ALL_OTHERS || link === LINK_ALL_CHILDREN) return []
  const rules = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  const target = ctx.linkset.resolveTargets(ctx.prim.linkNumber, link)
  return walkGet(ctx.linkset, ctx.prim, target, rules)
}
