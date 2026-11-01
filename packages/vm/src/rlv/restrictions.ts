import { parseNotifyOption, sendRestrictionNotifications } from './notify.js'
import type { Prim } from '../prim.js'
import type { LinksetClock } from '../clock.js'
import type { RlvParsedCommand } from './classifier.js'
import type { ViewerProfile, ViewerState } from './profiles.js'

// Kokua routes these named replies before add/remove parameter dispatch.
const KOKUA_REPLIES = new Set([
  'rlvstarted', 'getblacklist', 'getoutfit', 'getattach', 'getstatus', 'getstatusall',
  'getinv', 'getinvworn', 'getsitid', 'getpath', 'getpathnew', 'findfolder', 'findfolders', 'getgroup',
  'getcam_avdistmin', 'getcam_avdistmax', 'getcam_zoommin', 'getcam_zoommax',
  'getcam_fovmin', 'getcam_fovmax', 'getcam_zoom', 'getcam_fov', 'getcam_textures',
])

/** Decimal option prefixes, limited to the viewer's signed 32-bit channel range. */
function channelOption(option: string): number | undefined {
  const prefix = /^[\t\n\v\f\r ]*([+-]?[0-9]+)/.exec(option)
  if (!prefix) return undefined
  const channel = Number(prefix[1])
  return channel >= -2147483648 && channel <= 2147483647 ? channel : undefined
}

type RestrictionCommand = Omit<RlvParsedCommand, 'kind'> & { readonly kind: 'add' | 'remove' | 'clear' }

const STATE_ONLY = new Set(['sendchat', 'sit', 'unsit', 'tploc', 'tplm'])

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
  private readonly parameters = new WeakMap<RlvRestriction, string>()
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
      this.clear(prim, parameter)
      return 'state-only'
    }
    if (this.profile === 'rlv' && (KOKUA_REPLIES.has(behaviour) ||
      /^(version|getenv_|getdebug_)/.test(behaviour))) return 'unsupported'
    const support = this.notifySupport(behaviour, option) ?? (behaviour === 'detach' && !option ? 'enforced' : this.chatSupport(behaviour, option) ?? (STATE_ONLY.has(behaviour) && !option ? 'state-only' : 'unsupported'))
    // RLVa forms outside the supported allowlist are not emulated. Kokua
    // retains arbitrary wire names and options even when their effects are unknown.
    if (this.profile === 'rlva' && support === 'unsupported') {
      this.notify(prim, behaviour + (option ? ':' + option : ''), '=' + parameter)
      return support
    }
    const rule = behaviour + (option ? ':' + option : '')
    const existing = this.rules.get(prim.key)?.get(rule)
    if (this.profile === 'rlv' && (kind === 'remove' || !existing)) {
      this.notify(prim, rule, kind === 'add' ? '=n' : '=y')
    }
    if (kind === 'remove') {
      this.rules.get(prim.key)?.delete(rule)
      this.prune(prim.key)
    } else {
      let rules = this.rules.get(prim.key)
      if (!rules) this.rules.set(prim.key, rules = new Map())
      if (!existing) {
        const entry = Object.freeze({ sourcePrim: prim.key, behaviour, option, rule, support })
        rules.set(rule, entry)
        this.parameters.set(entry, parameter)
      }
      this.emitters.set(prim.key, prim)
      this.startGC(prim.linkset!.clock)
    }
    if (this.profile === 'rlva') this.notify(prim, rule, '=' +
      (kind === 'add' && existing ? this.parameters.get(existing)! : parameter))
    return support
  }

  private notify(prim: Prim, action: string, suffix = ''): void {
    sendRestrictionNotifications(prim, this.snapshot(), action, suffix)
  }

  private clear(prim: Prim, filter: string): void {
    const action = 'clear' + (filter ? ':' + filter : '')
    if (this.profile === 'rlv') this.notify(prim, action)
    const rules = this.rules.get(prim.key)
    if (rules) {
      for (const rule of rules.keys()) {
        if (!rule.includes(filter)) continue
        if (this.profile === 'rlv') this.notify(prim, rule, '=y')
        rules.delete(rule)
      }
      this.prune(prim.key)
    }
    if (this.profile === 'rlva') this.notify(prim, action)
  }

  private notifySupport(behaviour: string, option: string): RlvRestriction['support'] | undefined {
    if (behaviour !== 'notify') return undefined
    return this.profile !== 'disabled' && parseNotifyOption(this.profile, option) ? 'enforced' : 'unsupported'
  }

  supportsNotifyCommand(parsed: RlvParsedCommand): boolean {
    return (parsed.kind === 'add' || parsed.kind === 'remove') && this.notifySupport(parsed.behaviour, parsed.option) === 'enforced'
  }

  /** Restrict exception scope for this family only; other families stay state-only. */
  private chatSupport(behaviour: string, option: string): RlvRestriction['support'] | undefined {
    if (behaviour === 'permissive' && !option) return 'enforced'
    if (behaviour !== 'sendchannel' && behaviour !== 'sendchannel_sec') return undefined
    if (!option) return 'enforced'
    const channel = channelOption(option)
    if (this.profile === 'rlv' && String(channel) !== option) return 'unsupported'
    return channel !== undefined && channel > 0 ? 'enforced' : 'unsupported'
  }

  /** Enforced chat forms dispatch before unsupported-command classification. */
  supportsChatCommand(parsed: RlvParsedCommand): boolean {
    return (parsed.kind === 'add' || parsed.kind === 'remove') && this.chatSupport(parsed.behaviour, parsed.option) === 'enforced'
  }

  /** Rules whose issuing prims have not granted this private channel. */
  channelDenials(channel: number): readonly RlvRestriction[] {
    if (this.profile === 'disabled' || channel === 0) return Object.freeze([])
    const rules = this.snapshot()
    const family = rules.filter(rule => rule.behaviour === 'sendchannel' || rule.behaviour === 'sendchannel_sec')
    const blocks = family.filter(rule => !rule.option)
    const exceptions = family.filter(rule => rule.option && (this.profile === 'rlva'
      ? channelOption(rule.option) === channel : rule.option === String(channel)))
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
      for (const prim of this.emitters.values()) {
        // Resolve the current linkset so linking and unlinking keep prim state.
        const linkset = prim.linkset!
        if (linkset.dead || !linkset.peers.includes(linkset) || !linkset.prims.includes(prim)) {
          this.clear(prim, '')
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
