import { AGENT_FLYING, AGENT_SITTING } from '../generated/constants.js'
import type { World, WorldAvatar } from '../world.js'
import type { Prim } from '../prim.js'
import type { RlvParsedCommand } from './classifier.js'
import { rlvIntegerPrefix } from './classifier.js'
import type { ViewerProfile } from './profiles.js'
import type { RlvRestriction } from './restrictions.js'

export interface AvatarMovementState {
  alwaysRun: boolean
  tempRun: boolean
  /** Viewer hover offset in metres; does not translate the simulator position. */
  hoverOffset: number
  /** Supply the avatar skeleton distance for relative adjustheight commands. */
  pelvisToFoot?: number
  /** False models a region without hover support for a server-baked avatar. */
  hoverEnabled: boolean
}
export type AvatarMovement = 'fly' | 'land' | 'jump' | 'alwaysrun' | 'temprun' | 'walk'
export interface AvatarMovementAction {
  readonly action: AvatarMovement
  readonly allowed: boolean
  readonly reason?: 'restriction' | 'seated' | 'avatar'
  readonly restrictions: readonly RlvRestriction[]
}
const logs = new WeakMap<WorldAvatar, AvatarMovementAction[]>()
export function avatarMovementLog(avatar: WorldAvatar): readonly AvatarMovementAction[] {
  return Object.freeze([...(logs.get(avatar) ?? [])])
}
export function getAvatarMovementState(avatar: WorldAvatar): AvatarMovementState {
  return avatar.movement ??= { alwaysRun: false, tempRun: false, hoverOffset: 0, hoverEnabled: true }
}
export function movementSupport(profile: ViewerProfile, behaviour: string, option: string): RlvRestriction['support'] | undefined {
  if (!['fly', 'jump', 'alwaysrun', 'temprun', 'allowidle'].includes(behaviour)) return undefined
  return profile !== 'disabled' && !option && (profile === 'rlva' || !['jump', 'allowidle'].includes(behaviour))
    ? 'enforced' : 'unsupported'
}
const rulesFor = (avatar: WorldAvatar, behaviour: string) => avatar.viewer.restrictions.snapshot()
  .filter(rule => rule.support === 'enforced' && rule.behaviour === behaviour && !rule.option)

/** Viewer inputs record permission and mode changes, without simulating jump physics. */
export function attemptAvatarMovement(world: World, avatar: WorldAvatar, action: AvatarMovement): AvatarMovementAction {
  const state = getAvatarMovementState(avatar)
  const restrictions = ['fly', 'alwaysrun', 'temprun'].includes(action) || action === 'jump' && !(avatar.info & AGENT_FLYING)
    ? rulesFor(avatar, action) : []
  const reason = !world.avatars.includes(avatar) ? 'avatar' : restrictions.length ? 'restriction' : action === 'fly' && avatar.info & AGENT_SITTING ? 'seated' : undefined
  const result = Object.freeze({ action, allowed: !reason, ...(reason ? { reason } : {}), restrictions: Object.freeze(restrictions) })
  if (!reason) {
    if (action === 'fly') avatar.info |= AGENT_FLYING
    if (action === 'land') avatar.info &= ~AGENT_FLYING
    if (action === 'alwaysrun') state.alwaysRun = true
    if (action === 'temprun') state.tempRun = true
    if (action === 'walk') { state.alwaysRun = false; state.tempRun = false }
  }
  let log = logs.get(avatar)
  if (!log) logs.set(avatar, log = [])
  log.push(result)
  return result
}

/** Restriction transitions can stop modes, but releasing a lock never restores them. */
export function movementRulesChanged(avatar: WorldAvatar, before: readonly RlvRestriction[], after: readonly RlvRestriction[]): void {
  const has = (rules: readonly RlvRestriction[], name: string) => rules.some(r => r.behaviour === name && !r.option && r.support === 'enforced')
  const names = ['fly', 'alwaysrun', 'temprun']
  const state = getAvatarMovementState(avatar)
  if (avatar.viewer.profile === 'rlva') {
    if (!names.some(name => has(before, name) !== has(after, name))) return
    if (has(after, 'fly')) avatar.info &= ~AGENT_FLYING
    if (has(after, 'alwaysrun')) state.alwaysRun = false
    if (has(after, 'temprun')) state.tempRun = false
  } else if (avatar.viewer.profile === 'rlv') {
    const changed = (name: string) => before.filter(r => r.behaviour === name && !r.option).length !== after.filter(r => r.behaviour === name && !r.option).length
    if (changed('fly') && after.some(r => r.behaviour === 'fly' && !r.option && !before.includes(r))) avatar.info &= ~AGENT_FLYING
    if ((changed('temprun') && has(after, 'temprun') && (state.tempRun || state.alwaysRun)) ||
        (changed('alwaysrun') && has(after, 'alwaysrun') && state.alwaysRun)) {
      state.alwaysRun = false; state.tempRun = false
    }
  }
}

const floatPrefix = (text: string) => {
  const match = /^[\t\n\v\f\r ]*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(text)
  return match ? Number(match[0]) : 0
}
const viewerFloat = (text: string): number | undefined => {
  const match = /^[\t\n\v\f\r ]*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(text)
  if (!match || /^[eE]/.test(text.slice(match[0].length))) return undefined
  const value = Number(match[0])
  return Math.abs(value) <= 3.4028234663852886e38 ? Math.fround(value) : undefined
}

export function dispatchMovementCommand(avatar: WorldAvatar, prim: Prim, parsed: RlvParsedCommand, command: string): boolean {
  if (parsed.kind !== 'force' || !['fly', 'adjustheight'].includes(parsed.behaviour)) return false
  const { viewer } = avatar
  if (parsed.behaviour === 'fly' && viewer.profile !== 'rlva') return false
  const record = (actionOutcome: 'applied' | 'unchanged' | 'refused', outcome?: 'failed-option' | 'failed-lock' | 'failed-disabled' | 'unsupported-form') => {
    viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'action', action: parsed.behaviour as 'fly' | 'adjustheight', actionOutcome, ...(outcome ? { outcome } : {}) })
    return true
  }
  if (parsed.behaviour === 'fly') {
    let fly = true
    if (parsed.option) {
      const n = rlvIntegerPrefix(parsed.option)
      if (n !== undefined) {
        if (n !== 0 && n !== 1) return record('refused', 'failed-option')
        fly = !!n
      } else if (/^(true|false)/.test(parsed.option)) fly = parsed.option.startsWith('true')
      else return record('refused', 'failed-option')
    }
    if (fly && rulesFor(avatar, 'fly').some(r => r.sourcePrim !== prim.key)) return record('refused', 'failed-lock')
    if (fly && avatar.info & AGENT_SITTING) return record('refused')
    const unchanged = !!(avatar.info & AGENT_FLYING) === fly
    avatar.info = fly ? avatar.info | AGENT_FLYING : avatar.info & ~AGENT_FLYING
    return record(unchanged ? 'unchanged' : 'applied')
  }
  const state = getAvatarMovementState(avatar)
  const parts = parsed.option.split(';')
  let offset: number
  if (viewer.profile === 'rlva') {
    const values = parts.map(viewerFloat)
    if (parts.length > 3 || values.some(v => v === undefined)) return record('refused', 'failed-option')
    if (parts.length === 1) offset = values[0]! / 100
    else {
      if (values[1] !== 0 && state.pelvisToFoot === undefined) return record('refused', 'unsupported-form')
      offset = (values[0]! - (state.pelvisToFoot ?? 0)) * values[1]! + (values[2] ?? 0)
    }
    if (!state.hoverEnabled) return record('refused', 'failed-disabled')
  } else {
    offset = (rlvIntegerPrefix(parsed.option) ?? 0) / 100
    if (parts.length >= 2 && parts[1]) {
      const scalar = floatPrefix(parts[1])
      if (scalar !== 0) {
        if (state.pelvisToFoot === undefined) return record('refused', 'unsupported-form')
        offset = (floatPrefix(parts[0]!) - state.pelvisToFoot) * scalar + floatPrefix(parts[2] ?? '')
      }
    }
  }
  state.hoverOffset = Math.max(-2, Math.min(2, offset))
  return record('applied')
}
