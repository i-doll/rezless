import type { BuiltinImpl, CallContext } from '../runtime.js'
import type { LslType, LslValue, Vector } from '../values/types.js'
import { isPrim, type Link, type Linkset } from '../linkset.js'
import type { Prim } from '../prim.js'
import type { WorldAvatar } from '../world.js'
import { readAvatarLinkParam, writeAvatarLinkParam } from '../avatar-link.js'
import {
  LINK_ALL_CHILDREN, LINK_ALL_OTHERS, LINK_SET, PRIM_CLICK_ACTION, PRIM_LINK_TARGET, PRIM_TYPE, PRIM_TYPE_PRISM,
} from '../generated/constants.js'
import { checkPrimRule, primGetRuleRuns, primParamTypes, writePrimParamSlots } from '../prim-params.js'
import { markLuaResult, ruleElementType, typedList, type LuaResultKind } from '../values/list-types.js'
import { primParamLuaKinds } from './slua-result-kinds.js'
import { sayError } from './debug.js'
import { setPrimParamWithChanged } from '../prim-changed.js'

const zeroForNan = (v: number) => (Number.isNaN(v) ? 0 : v)

/** In SLua a NaN in the cut or hollow of a box, cylinder or prism counts as 0. */
function sluaShapeRules(rules: ReadonlyArray<LslValue>, cursor: number) {
  const kind = rules[cursor]
  const cut = rules[cursor + 2] as Vector | undefined
  const hollow = rules[cursor + 3]
  if (typeof kind !== 'number' || kind < 0 || kind > PRIM_TYPE_PRISM || !cut || typeof hollow !== 'number') return rules
  const fixed = [...rules]
  fixed[cursor + 2] = { x: zeroForNan(cut.x), y: zeroForNan(cut.y), z: cut.z }
  fixed[cursor + 3] = zeroForNan(hollow)
  return fixed
}

/**
 * Walk a PRIM_* rules list, applying each rule to every prim in the
 * current target set. `PRIM_LINK_TARGET, link` mid-list re-targets all
 * subsequent rules to the link resolved against the linkset (matches
 * llSetLinkPrimitiveParams behavior, available inside
 * llSetPrimitiveParams too).
 *
 * A rule that can't run (see checkPrimRule) stops the walk, saying the
 * simulator's error on DEBUG_CHANNEL where it has one; rules before it stay
 * applied.
 */
function walkSet(ctx: CallContext, fn: string, target: Prim[], rules: ReadonlyArray<LslValue>, sitter?: WorldAvatar): void {
  const { linkset, prim: caller } = ctx
  let cur = target
  let i = 0
  for (let ruleNumber = 1; i < rules.length; ruleNumber++) {
    const error = checkPrimRule(rules, i)
    if (error !== null) {
      if (error !== '') sayError(ctx, `${fn} error running rule #${ruleNumber}${error}.`)
      return
    }
    const rule = rules[i] as number
    if (rule === PRIM_LINK_TARGET) {
      const links = linkset.linksFrom(caller, (rules[i + 1] as number) | 0)
      cur = links.prims
      sitter = links.sitter
      i += 2
      continue
    }
    const given = rule === PRIM_TYPE && ctx.script.language !== 'lsl' ? sluaShapeRules(rules, i + 1) : rules
    let consumed: number | null = null
    if (sitter) {
      consumed = writeAvatarLinkParam(sitter, rule, rules[i + 1])
      if (consumed === null) return
    }
    for (const p of cur) {
      const c = setPrimParamWithChanged(p, rule, given, i + 1, caller)
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
  const kinds: LuaResultKind[] = []
  let cur = start
  let i = 0
  while (cur && i < rules.length) {
    if (!primGetRuleRuns(rules, i)) break
    const rule = rules[i] as number
    if (rule === PRIM_LINK_TARGET) {
      const link = rules[i + 1]
      const type = ruleElementType(rules, i + 1)
      if (type ? type !== 'integer' : !Number.isInteger(link)) break
      cur = linkset.oneLink(start!, (link as number) | 0)
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
    kinds.push(...primParamLuaKinds(isPrim(cur) ? cur : undefined, rule, rules, i + 1, values))
    i += 1 + consumed
  }
  return markLuaResult(typedList(out, types), kinds)
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
