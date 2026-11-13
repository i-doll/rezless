import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { LslType, LslValue } from '../values/types.js'
import { isPrim, type Link, type Linkset } from '../linkset.js'
import type { Prim } from '../prim.js'
import type { WorldAvatar } from '../world.js'
import { readAvatarLinkParam, writeAvatarLinkParam } from '../avatar-link.js'
import { LINK_ALL_CHILDREN, LINK_ALL_OTHERS, LINK_SET, PRIM_CLICK_ACTION, PRIM_LINK_TARGET } from '../generated/constants.js'
import { checkPrimRule, primParamTypes, writePrimParamSlots } from '../prim-params.js'
import { typedList } from '../values/list-types.js'
import { sayError } from './debug.js'
import { setPrimParamWithChanged } from '../prim-changed.js'

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
function walkSet(ctx: CallContext, fn: string, target: Prim[], rules: ReadonlyArray<LslValue>, sitter?: WorldAvatar): void {
  const { linkset, prim: caller } = ctx
  let cur = target
  let i = 0
  for (let ruleNumber = 1; i < rules.length; ruleNumber++) {
    const rule = rules[i] as number
    if (rule === PRIM_LINK_TARGET) {
      const links = linkset.linksFrom(caller, (rules[i + 1] as number) | 0)
      cur = links.prims
      sitter = links.sitter
      i += 2
      continue
    }
    const error = typeof rule === 'number' ? checkPrimRule(rule, rules, i + 1) : ': unknown rule'
    if (error !== null) {
      sayError(ctx, `${fn} error running rule #${ruleNumber}${error}.`)
      return
    }
    let consumed: number | null = null
    if (sitter) {
      consumed = writeAvatarLinkParam(sitter, rule, rules[i + 1])
      if (consumed === null) return
    }
    for (const p of cur) {
      const c = setPrimParamWithChanged(p, rule, rules, i + 1, caller)
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

/**
 * Read a PRIM_* rules list from the link `start`. A read is on one link at a
 * time. PRIM_LINK_TARGET counts from `start`, not from the calling prim: there
 * LINK_THIS is `start` and every other negative number is the first link that
 * is not `start`. A read on no link returns nothing more.
 */
function walkGet(linkset: Linkset, start: Link | undefined, rules: ReadonlyArray<LslValue>): ReadonlyArray<LslValue> {
  const out: LslValue[] = []
  const types: Array<LslType | undefined> = []
  let cur = start
  let i = 0
  while (cur && i < rules.length) {
    const rule = rules[i] as number
    if (typeof rule !== 'number') break
    if (rule === PRIM_LINK_TARGET) {
      cur = linkset.oneLink(start!, (rules[i + 1] as number) | 0)
      i += 2
      continue
    }
    if (rule === PRIM_CLICK_ACTION && i !== rules.length - 1) {
      i++
      continue
    }
    let consumed = 0
    let values: ReadonlyArray<LslValue>
    let valueTypes: ReadonlyArray<LslType> | undefined
    if (isPrim(cur)) {
      const r = cur.getPrimParam(rule, rules, i + 1)
      if (r === null) break
      values = r.values
      valueTypes = r.types
      consumed = r.consumed
    } else {
      const read = readAvatarLinkParam(cur, rule)
      if (read === null) break
      values = read
    }
    out.push(...values)
    types.push(...(valueTypes ?? primParamTypes(rule, values)))
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
  const { prims, sitter } = ctx.linkset.linksFrom(ctx.prim, link)
  walkSet(ctx, 'llSetLinkPrimitiveParams', prims, rules, sitter)
  return undefined
}

/** llSetLinkPrimitiveParamsFast — same as the slow variant minus the delay. */
export const llSetLinkPrimitiveParamsFast: BuiltinImpl = (ctx, args) => {
  const link = ((args[0] as number | undefined) ?? 0) | 0
  const rules = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  const { prims, sitter } = ctx.linkset.linksFrom(ctx.prim, link)
  walkSet(ctx, 'llSetLinkPrimitiveParamsFast', prims, rules, sitter)
  return undefined
}

/** llGetPrimitiveParams(list params) — caller's prim. */
export const llGetPrimitiveParams: BuiltinImpl = (ctx, args) => {
  const rules = (args[0] as ReadonlyArray<LslValue> | undefined) ?? []
  return walkGet(ctx.linkset, ctx.prim, rules)
}

/** llGetLinkPrimitiveParams(integer link, list params). The group flags return []. */
export const llGetLinkPrimitiveParams: BuiltinImpl = (ctx, args) => {
  const link = ((args[0] as number | undefined) ?? 0) | 0
  if (link === LINK_SET || link === LINK_ALL_OTHERS || link === LINK_ALL_CHILDREN) return []
  const rules = (args[1] as ReadonlyArray<LslValue> | undefined) ?? []
  return walkGet(ctx.linkset, ctx.linkset.oneLink(ctx.prim, link), rules)
}
