import type { Prim } from '../prim.js'
import type { LinksetClock } from '../clock.js'
import { rlvIntegerPrefix, type RlvParsedCommand } from './classifier.js'
import type { ViewerProfile, ViewerState } from './profiles.js'

// Kokua routes these named replies before add/remove parameter dispatch.
const KOKUA_REPLIES = new Set([
  'rlvstarted', 'getblacklist', 'getoutfit', 'getattach', 'getstatus', 'getstatusall',
  'getinv', 'getinvworn', 'getsitid', 'getpath', 'getpathnew', 'findfolder', 'findfolders', 'getgroup',
  'getcam_avdistmin', 'getcam_avdistmax', 'getcam_zoommin', 'getcam_zoommax',
  'getcam_fovmin', 'getcam_fovmax', 'getcam_zoom', 'getcam_fov', 'getcam_textures',
])

type RestrictionCommand = Omit<RlvParsedCommand, 'kind'> & { readonly kind: 'add' | 'remove' | 'clear' }

const STATE_ONLY = new Set(['detach', 'sendchat', 'sit', 'unsit', 'tploc', 'tplm'])

export interface RlvRestriction {
  readonly sourcePrim: string
  readonly behaviour: string
  readonly option: string
  /** Canonical behaviour and nonempty option, without parameter or at-sign. */
  readonly rule: string
  readonly support: 'enforced' | 'state-only' | 'unsupported'
}

/** Avatar-owned wire state. Script reset and removal do not alter it. */
export class RlvRestrictions {
  private readonly rules = new Map<string, Map<string, RlvRestriction>>()
  private readonly emitters = new Map<string, Prim>()
  private stopGC: (() => void) | undefined

  constructor(private readonly profile: ViewerProfile) {}

  /** Frozen copies in emitter and rule insertion order, optionally for one prim. */
  snapshot(sourcePrim?: string): readonly RlvRestriction[] {
    const entries = sourcePrim === undefined ? [...this.rules.values()] : [this.rules.get(sourcePrim)]
    return Object.freeze(entries.flatMap(rules => rules ? [...rules.values()] : []))
  }

  /** Apply classified wire commands; unsupported effects remain unsupported. */
  apply(prim: Prim, parsed: RestrictionCommand): RlvRestriction['support'] {
    const { behaviour, option, parameter, kind } = parsed
    if (kind === 'clear') {
      const rules = this.rules.get(prim.key)
      if (rules) {
        for (const rule of rules.keys()) if (rule.includes(parameter)) rules.delete(rule)
        this.prune(prim.key)
      }
      return 'state-only'
    }
    if (this.profile === 'rlv' && (KOKUA_REPLIES.has(behaviour) ||
      /^(version|getenv_|getdebug_)/.test(behaviour))) return 'unsupported'
    const support = this.chatSupport(behaviour, option) ?? (STATE_ONLY.has(behaviour) && !option ? 'state-only' : 'unsupported')
    // RLVa forms outside the supported allowlist are not emulated. Kokua
    // retains arbitrary wire names and options even when their effects are unknown.
    if (this.profile === 'rlva' && support === 'unsupported') return support
    const rule = behaviour + (option ? ':' + option : '')
    if (kind === 'remove') {
      this.rules.get(prim.key)?.delete(rule)
      this.prune(prim.key)
    } else {
      let rules = this.rules.get(prim.key)
      if (!rules) this.rules.set(prim.key, rules = new Map())
      if (!rules.has(rule)) rules.set(rule, Object.freeze({ sourcePrim: prim.key, behaviour, option, rule, support }))
      this.emitters.set(prim.key, prim)
      this.startGC(prim.linkset!.clock)
    }
    return support
  }

  /** Restrict exception scope for this family only; other families stay state-only. */
  private chatSupport(behaviour: string, option: string): RlvRestriction['support'] | undefined {
    if (behaviour === 'permissive' && !option) return 'enforced'
    if (behaviour !== 'sendchannel' && behaviour !== 'sendchannel_sec') return undefined
    if (!option) return 'enforced'
    const channel = rlvIntegerPrefix(option)
    if (this.profile === 'rlv' && String(channel) !== option) return 'unsupported'
    return channel !== undefined && channel > 0 ? 'enforced' : 'unsupported'
  }

  /** Rules whose issuing prims have not granted this private channel. */
  channelDenials(channel: number): readonly RlvRestriction[] {
    if (this.profile === 'disabled' || channel === 0) return Object.freeze([])
    const rules = this.snapshot()
    const family = rules.filter(rule => rule.behaviour === 'sendchannel' || rule.behaviour === 'sendchannel_sec')
    const blocks = family.filter(rule => !rule.option)
    const exceptions = family.filter(rule => rule.option && (this.profile === 'rlva'
      ? rlvIntegerPrefix(rule.option) === channel : rule.option === String(channel)))
    const strict = rules.some(rule => rule.behaviour === 'permissive' && !rule.option)
    const missing = blocks.filter(rule => (strict || rule.behaviour === 'sendchannel_sec') &&
      !exceptions.some(exception => exception.sourcePrim === rule.sourcePrim))
    if (missing.length) return Object.freeze(missing)
    return Object.freeze(blocks.some(rule => rule.behaviour === 'sendchannel') && !exceptions.length ? blocks : [])
  }

  private prune(sourcePrim: string): void {
    if (this.rules.get(sourcePrim)?.size) return
    this.rules.delete(sourcePrim)
    this.emitters.delete(sourcePrim)
    if (!this.rules.size) {
      this.stopGC?.()
      this.stopGC = undefined
    }
  }

  private startGC(clock: LinksetClock): void {
    if (this.stopGC) return
    // Ready-viewer fixtures use the default steady-state collection intervals.
    const interval = this.profile === 'rlva' ? 30000 : 10000
    let next = clock.now + interval
    this.stopGC = clock.onAdvance(now => {
      if (now < next) return
      next += (Math.floor((now - next) / interval) + 1) * interval
      for (const [key, prim] of this.emitters) {
        // Resolve the current linkset so linking and unlinking keep prim state.
        const linkset = prim.linkset!
        if (linkset.dead || !linkset.peers.includes(linkset) || !linkset.prims.includes(prim)) {
          this.rules.delete(key)
          this.prune(key)
        }
      }
    })
  }
}

/** State-only commands still report unsupported action effects in the command log. */
export function dispatchRestrictionCommand(viewer: ViewerState, prim: Prim, parsed: RlvParsedCommand, command: string): boolean {
  if (parsed.kind !== 'add' && parsed.kind !== 'remove' && parsed.kind !== 'clear') return false
  const support = viewer.restrictions.apply(prim, { ...parsed, kind: parsed.kind })
  if (support === 'enforced') {
    viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'applied' })
    return true
  }
  viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'unsupported' })
  viewer.diagnostics.push({ command, reason: 'unsupported', detail: support === 'state-only'
    ? 'Viewer restriction state updated; action enforcement is unsupported.'
    : viewer.profile === 'rlv'
      ? 'Wire rule updated for this profile; its effects are unsupported.'
      : 'This restriction form is outside the supported allowlist.' })
  return true
}
