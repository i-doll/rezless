import type { WorldAvatar } from '../world.js'
import type { Prim } from '../prim.js'
import { rlvIntegerPrefix, type RlvParsedCommand } from './classifier.js'
import { dispatchRestrictionCommand } from './restrictions.js'
import type { ViewerState } from './profiles.js'
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
  /** Render effect configuration; tween values describe the configured targets. */
  readonly parameters?: RlvRenderParameters
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

  const ui = behaviours.map(behaviour => {
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
  })
  return Object.freeze([...ui, ...renderEffects(avatar)])
}


const DEFAULT_TEXTURE = 'd2114404-dd59-4a4d-8e6c-49359e91bbf0'
const textureNames = ['setcam_textures', 'camtextures']
const sphereFields = ['mode', 'origin', 'color', 'distmin', 'distmax', 'distextend', 'param', 'tween', 'valuemin', 'valuemax']
const overlayFields = ['alpha', 'texture', 'tint']
type Value = number | string | readonly number[] | null
export interface RlvRenderParameters {
  readonly texture?: string | null
  readonly overlays?: readonly Readonly<Record<string, Value | boolean>>[]
  readonly spheres?: readonly Readonly<Record<string, Value>>[]
}
type Parameters = Record<string, Value>
const sphereDefaults = (): Parameters => ({ mode: 0, origin: 0, param: [0, 0, 0, 0], distmin: 0, distmax: 0,
  distextend: 1, valuemin: 1, valuemax: 1, tween: 0 })
const overlayDefaults = (): Parameters => ({ alpha: 1, texture: null, tint: [1, 1, 1] })
const fieldOf = (name: string) => name.slice(name.indexOf('_') + 1)

export function renderSupport(profile: ViewerProfile, behaviour: string, option: string): RlvRestriction['support'] | undefined {
  if (textureNames.includes(behaviour)) return profile === 'disabled' || profile === 'rlva' && !!option && !uuid(option) ? 'unsupported' : 'enforced'
  if (behaviour === 'setsphere') return profile === 'rlv' || profile === 'rlva' && !option ? 'enforced' : 'unsupported'
  if (behaviour === 'setoverlay' || behaviour === 'setoverlay_touch') return profile === 'rlva' && !option ? 'enforced' : 'unsupported'
  if (behaviour.startsWith('setsphere_') && sphereFields.includes(fieldOf(behaviour)) && fieldOf(behaviour) !== 'color')
    return profile === 'rlv' ? 'enforced' : 'unsupported'
  return undefined
}

function modifierValue(profile: ViewerProfile, field: string, option: string): Value | undefined {
  if (field === 'texture') return uuid(option) ? option : undefined
  const count = field === 'param' ? 4 : field === 'color' || field === 'tint' ? 3 : 0
  if (count) {
    const parts = option.split(profile === 'rlv' ? /[;/]/ : '/')
    if (profile === 'rlva' && parts.length < count) return undefined
    const values = Array.from({ length: count }, (_, i) => cameraAngle(profile, parts[i] ?? ''))
    return values.every(v => v !== undefined) ? values as number[] : undefined
  }
  const value = ['mode', 'origin', 'distextend'].includes(field)
    ? rlvIntegerPrefix(option) ?? (profile === 'rlv' ? 0 : undefined) : cameraAngle(profile, option)
  return profile === 'rlv' && value !== undefined ? Math.max(0, value) : value
}

/** Local parameters belong to the lifetime of the corresponding base rule. */
class RenderState {
  previous: readonly RlvRestriction[] = []
  orderedTextures: RlvRestriction[] = []
  readonly prims = new Map<string, Prim>()
  activeOverlayRoot: string | undefined
  texture = DEFAULT_TEXTURE
  readonly local = new Map<RlvRestriction, Parameters>()
  constructor(readonly viewer: ViewerState) {}
  root(id: string): string { return this.prims.get(id)?.linkset?.prims[0]?.key ?? id }
  sync(): readonly RlvRestriction[] {
    const rules = this.viewer.restrictions.snapshot().filter(r => r.support === 'enforced')
    const removed = this.previous.filter(r => !rules.includes(r))
    const added = rules.filter(r => !this.previous.includes(r))
    for (const rule of removed) this.local.delete(rule)
    this.orderedTextures = this.orderedTextures.filter(r => rules.includes(r))
    for (const rule of added) {
      if (textureNames.includes(rule.behaviour)) this.orderedTextures.push(rule)
      if (rule.behaviour === 'setsphere') this.local.set(rule, sphereDefaults())
      if (rule.behaviour === 'setoverlay') this.local.set(rule, overlayDefaults())
    }
    if (this.viewer.profile === 'rlv') for (const rule of [...removed, ...added]) {
      if (textureNames.includes(rule.behaviour)) {
        if (!rule.option) this.texture = DEFAULT_TEXTURE
        else if (uuid(rule.option)) this.texture = rule.option
      }
    }
    const overlays = [...this.local.keys()].filter(r => r.behaviour === 'setoverlay')
    if (!overlays.some(r => this.root(r.sourcePrim) === this.activeOverlayRoot))
      this.activeOverlayRoot = overlays[0] && this.root(overlays[0].sourcePrim)
    for (const id of this.prims.keys()) if (!rules.some(r => r.sourcePrim === id)) this.prims.delete(id)
    this.previous = rules
    return rules
  }
}
const renderStates = new WeakMap<ViewerState, RenderState>()
function renderState(viewer: ViewerState): RenderState {
  let state = renderStates.get(viewer)
  if (!state) renderStates.set(viewer, state = new RenderState(viewer))
  return state
}

/** Render commands share the same restriction lifecycle and query as UI policy. */
export function dispatchRenderCommand(avatar: WorldAvatar, prim: Prim, parsed: RlvParsedCommand, command: string): boolean {
  const viewer = avatar.viewer, state = renderState(viewer)
  const rules = state.sync()
  state.prims.set(prim.key, prim)
  const { behaviour, option, kind } = parsed
  const base = behaviour.startsWith('setsphere_') ? 'setsphere' : behaviour.startsWith('setoverlay_') ? 'setoverlay' : ''
  const field = fieldOf(behaviour)
  const fields = base === 'setsphere' ? sphereFields : overlayFields
  if (kind === 'force' && base && fields.includes(field)) {
    if (viewer.profile === 'rlv') {
      if (base !== 'setsphere' || field === 'color') return false
      dispatchRestrictionCommand(viewer, prim, { ...parsed, kind: 'add' }, command)
      state.sync()
      return true
    }
    const rule = rules.find(r => r.sourcePrim === prim.key && r.behaviour === base && !r.option)
    const value = option ? modifierValue(viewer.profile, field, option) :
      (base === 'setsphere' ? sphereDefaults() : overlayDefaults())[field]
    if (!rule || value === undefined && (field !== 'color' || !!option)) {
      viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'unsupported', outcome: !rule ? 'failed-unheld-behaviour' : 'invalid-option' })
      return true
    }
    const parameters = state.local.get(rule)!
    if (field === 'color') parameters.param = option ? [...value as readonly number[], 1] : [0, 0, 0, 0]
    else parameters[field] = value!
    viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'applied' })
    return true
  }
  if ((kind !== 'add' && kind !== 'remove') || renderSupport(viewer.profile, behaviour, option) !== 'enforced') return false
  if (viewer.profile === 'rlva' && behaviour === 'setsphere' && kind === 'add' &&
      !rules.some(r => r.sourcePrim === prim.key && r.behaviour === behaviour) && rules.filter(r => r.behaviour === behaviour).length >= 6) {
    viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'unsupported', outcome: 'failed-effect-limit' })
    return true
  }
  dispatchRestrictionCommand(viewer, prim, viewer.profile === 'rlva' && behaviour === 'camtextures'
    ? { ...parsed, behaviour: 'setcam_textures' } : parsed, command)
  if (viewer.profile === 'rlv' && behaviour === 'setsphere' && kind === 'remove' &&
      rules.some(r => r.sourcePrim === prim.key && r.behaviour === behaviour && r.option === option)) {
    for (const rule of viewer.restrictions.snapshot(prim.key).filter(r => r.behaviour.startsWith('setsphere_'))) {
      viewer.restrictions.apply(prim, { behaviour: rule.behaviour, option: rule.option, parameter: 'y', kind: 'remove' })
    }
  }
  state.sync()
  return true
}

function frozenParameters<T extends object>(value: T): Readonly<T> {
  for (const item of Object.values(value)) if (item && typeof item === 'object') frozenParameters(item)
  return Object.freeze(value)
}

function renderEffects(avatar: WorldAvatar): RlvViewerEffect[] {
  const { viewer } = avatar, state = renderState(viewer), rules = state.sync()
  const textures = state.orderedTextures
  const spheres = viewer.profile === 'rlv' ? kokuaSpheres(rules) : rules.filter(r => r.behaviour === 'setsphere')
    .map(r => ({ sourcePrim: r.sourcePrim, ...state.local.get(r)! }))
  const overlays = [...state.local.keys()].filter(r => r.behaviour === 'setoverlay').map(r => ({ sourcePrim: r.sourcePrim,
    ...state.local.get(r)!, enabled: false, blockTouch: rules.some(t => t.behaviour === 'setoverlay_touch' && t.sourcePrim === r.sourcePrim) }))
  // The first active root keeps control; linked issuers render together.
  for (const overlay of overlays) overlay.enabled = state.root(overlay.sourcePrim) === state.activeOverlayRoot
  return ['setcam_textures', 'setoverlay', 'setoverlay_touch', 'setsphere'].map(behaviour => {
    const unsupported = viewer.profile === 'disabled' || viewer.profile === 'rlv' && behaviour.startsWith('setoverlay')
    const family = rules.filter(r => behaviour === 'setcam_textures' ? textureNames.includes(r.behaviour)
      : r.behaviour === behaviour || behaviour === 'setsphere' && r.behaviour.startsWith('setsphere_'))
    const parameters: RlvRenderParameters = behaviour === 'setcam_textures'
      ? { texture: !textures.length ? null : viewer.profile === 'rlv' ? state.texture : textures[0]!.option || DEFAULT_TEXTURE }
      : behaviour === 'setsphere' ? { spheres } : { overlays }
    return Object.freeze({ behaviour, support: unsupported ? 'unsupported' : 'enforced',
      restricted: unsupported ? null : behaviour === 'setsphere' ? spheres.length > 0 : behaviour === 'setoverlay' ? overlays.length > 0 : family.length > 0,
      rules: Object.freeze(family), ...(unsupported ? {} : { parameters: frozenParameters(parameters) }) })
  })
}

function kokuaSpheres(rules: readonly RlvRestriction[]): Parameters[] {
  const sorted = [...rules].sort((a, b) => a.sourcePrim.localeCompare(b.sourcePrim))
  const modes = new Map<string, number>(), effects = new Map<number, Parameters>(), changed = new Map<number, Set<string>>()
  for (const rule of sorted.filter(r => r.behaviour === 'setsphere')) {
    const modeRule = sorted.find(r => r.sourcePrim === rule.sourcePrim && r.behaviour === 'setsphere_mode')
    const mode = modeRule ? rlvIntegerPrefix(modeRule.option) ?? 0 : 0
    if (mode < 0 || mode >= 5) continue
    modes.set(rule.sourcePrim, mode)
    if (!effects.has(mode)) { effects.set(mode, { ...sphereDefaults(), mode }); changed.set(mode, new Set()) }
  }
  for (const rule of sorted.filter(r => r.behaviour.startsWith('setsphere_'))) {
    // Kokua assigns orphan parameters to mode zero when another issuer activates it.
    const mode = modes.get(rule.sourcePrim) ?? 0, effect = effects.get(mode)
    if (!effect) continue
    const field = fieldOf(rule.behaviour)
    if (field === 'mode') continue
    const value = modifierValue('rlv', field, rule.option)!
    const seen = changed.get(mode)!, previous = effect[field]
    if (field === 'param') {
      const next = [...value as readonly number[]], old = previous as readonly number[]
      if (mode === 1) continue
      if (seen.has(field)) for (let i = 0; i < 4; i++) {
        if (mode === 0) next[i] = i < 3 ? Math.fround(old[i]! * next[i]!) : old[i]!
        else next[i] = mode === 2 && i > 0 ? old[i]! : Math.max(old[i]!, next[i]!)
      }
      if (mode === 2 && !seen.has(field)) next.splice(1, 3, 0, 0, 0)
      effect[field] = next
    } else effect[field] = !seen.has(field) ? value : ['valuemin', 'valuemax'].includes(field)
      ? Math.max(previous as number, value as number) : Math.min(previous as number, value as number)
    seen.add(field)
  }
  return [...effects.entries()].sort(([a], [b]) => a - b).map(([, effect]) => effect)
}
