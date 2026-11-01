import type { WorldAvatar } from '../world.js'
import type { ViewerProfile } from './profiles.js'
import type { RlvRestriction } from './restrictions.js'
import { cameraAngle } from './camera.js'

const simple = ['showinv', 'showloc', 'showminimap', 'showworldmap', 'shownearby',
  'showhovertextall', 'showhovertexthud', 'showhovertextworld', 'viewnote', 'viewscript', 'viewtexture']
const rlvaOnly = ['showself', 'showselfhead', 'viewtransparent', 'viewwireframe']
const names = ['shownames', 'shownames_sec', 'shownametags', 'shownametags_sec']
const behaviours = [...simple, 'shownames', 'shownametags', 'showhovertext', ...rlvaOnly]
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

export interface RlvViewerContext {
  /** Avatar or exact hover-text prim UUID. Omit to query policy without a target exception. */
  readonly target?: string
  /** Distance in metres for the RLVa nametag range. */
  readonly distance?: number
  /** Hover-text scope; omitted scope reports only all-object and target restrictions. */
  readonly hud?: boolean
}

/** Restriction policy, independent of whether a window is currently open or an object rendered. */
export interface RlvViewerEffect {
  readonly behaviour: string
  readonly support: 'enforced' | 'unsupported'
  /** Null means the profile does not implement this effect. */
  readonly restricted: boolean | null
  /** Wire rules, including options and exceptions, in issuer/rule insertion order. */
  readonly rules: readonly RlvRestriction[]
}

export function viewStateSupport(profile: ViewerProfile, behaviour: string, option: string): RlvRestriction['support'] | undefined {
  if (![...simple, ...rlvaOnly, ...names, 'showhovertext'].includes(behaviour)) return undefined
  if (profile === 'disabled' || profile === 'rlv' && (rlvaOnly.includes(behaviour) || behaviour === 'shownametags_sec')) return 'unsupported'
  if (simple.includes(behaviour) || rlvaOnly.includes(behaviour)) return option ? 'unsupported' : 'enforced'
  if (behaviour === 'showhovertext') return uuid(option) ? 'enforced' : 'unsupported'
  if (!option || uuid(option)) return 'enforced'
  return profile === 'rlva' && behaviour.startsWith('shownametags') && cameraAngle(profile, option) !== undefined
    ? 'enforced' : 'unsupported'
}

/** One immutable query for render-only viewer policy; it never changes avatar state. */
export function getRlvViewerState(avatar: WorldAvatar, context: RlvViewerContext = {}): readonly RlvViewerEffect[] {
  const { profile, restrictions } = avatar.viewer
  const all = restrictions.snapshot().filter(rule => rule.support === 'enforced')
  const target = context.target?.toLowerCase()
  const self = profile === 'rlva' && target === avatar.key.toLowerCase()
  const has = (name: string) => all.some(rule => rule.behaviour === name && !rule.option)
  const matching = (rule: RlvRestriction) => !!target && rule.option.toLowerCase() === target

  return Object.freeze(behaviours.map(behaviour => {
    const support = profile === 'disabled' || profile === 'rlv' && rlvaOnly.includes(behaviour) ? 'unsupported' : 'enforced'
    const family = all.filter(rule => rule.behaviour === behaviour || rule.behaviour === behaviour + '_sec')
    let restricted = family.some(rule => !rule.option)
    let rules = family
    if (behaviour === 'shownames' || behaviour === 'shownametags') {
      if (profile === 'rlv') {
        if (behaviour === 'shownametags') {
          rules = all.filter(rule => names.includes(rule.behaviour))
          restricted ||= rules.some(rule => rule.behaviour.startsWith('shownames'))
        }
        if (behaviour === 'shownames') {
          // Kokua's shownames cache includes optioned rules, and censoring shares
          // name and nametag exceptions. Nametag visibility itself has no exceptions.
          rules = all.filter(rule => names.includes(rule.behaviour))
          restricted = family.length > 0 && !rules.some(matching)
        }
      } else {
        const blocks = family.filter(rule => !rule.option || !uuid(rule.option))
        const exceptions = family.filter(rule => uuid(rule.option) && matching(rule))
        const strict = has('permissive')
        const strictBlocks = blocks.filter(rule => strict || rule.behaviour.endsWith('_sec'))
        const exempt = self || (exceptions.length > 0 && strictBlocks.every(rule =>
          exceptions.some(exception => exception.sourcePrim === rule.sourcePrim)))
        restricted = blocks.length > 0 && !exempt
        if (restricted && behaviour === 'shownametags') {
          // An unoptioned restriction contributes the default distance zero.
          const distances = blocks.map(rule => rule.option ? cameraAngle(profile, rule.option)! : 0)
          const distance = Math.min(...distances)
          if (context.distance !== undefined && distance !== 0 && context.distance ** 2 < distance ** 2) restricted = false
        }
      }
    } else if (behaviour === 'showhovertext') {
      rules = all.filter(rule => rule.behaviour.startsWith('showhovertext'))
      restricted = family.some(matching) || has('showhovertextall') ||
        context.hud === true && has('showhovertexthud') || context.hud === false && has('showhovertextworld')
    }
    return Object.freeze({ behaviour, support, restricted: support === 'unsupported' ? null : restricted,
      rules: Object.freeze(rules) })
  }))
}
