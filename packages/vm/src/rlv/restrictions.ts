import { debugSupport } from './debug.js'
import { movementSupport, movementRulesChanged } from './movement.js'
import { permissionSupport } from './permissions.js'
import { editSupport } from './edit.js'
import { teleportOfferSupport, teleportRequestSupport } from './tpoffers.js'
import { touchSupport } from './touch.js'
import { attachmentLockSupport } from './detach.js'
import { gestureSupport } from './gesture.js'
import { avatarIMSupport } from './im-actions.js'
import { chatRedirectSupport, chatVolumeSupport } from './chat-actions.js'
import { receivedChatSupport, receivedIMSupport } from './received.js'
import { teleportSupport } from './teleport.js'
import { standtpSupport, seatingSupport } from './sit.js'
import { parseNotifyOption, sendRestrictionNotifications } from './notify.js'
import type { Prim } from '../prim.js'
import type { WorldAvatar } from '../world.js'
import type { RlvSession } from './session.js'
import { rlvIntegerPrefix as channelOption, type RlvCommandOutcome, type RlvParsedCommand } from './classifier.js'
import type { ViewerProfile, ViewerState } from './profiles.js'
import { outfitSupport, sharedWearSupport } from './outfit.js'
import { cameraSupport, cameraDistanceSupport, cameraControlSupport } from './camera.js'
import { renderSupport, viewStateSupport } from './viewstate.js'

// Kokua routes these named replies before add/remove parameter dispatch.
const KOKUA_REPLIES = new Set([
  'rlvstarted', 'getblacklist', 'getoutfit', 'getattach', 'getstatus', 'getstatusall',
  'getinv', 'getinvworn', 'getsitid', 'getpath', 'getpathnew', 'findfolder', 'findfolders', 'getgroup',
  'getcam_avdistmin', 'getcam_avdistmax', 'getcam_zoommin', 'getcam_zoommax',
  'getcam_fovmin', 'getcam_fovmax', 'getcam_zoom', 'getcam_fov', 'getcam_textures',
])

/** Kokua dispatches these replies before parameter-kind handling. */
export function isKokuaNamedReply(behaviour: string): boolean {
  return KOKUA_REPLIES.has(behaviour) || /^(version|getenv_|getdebug_)/.test(behaviour)
}

type RestrictionCommand = Omit<RlvParsedCommand, 'kind'> & { readonly kind: 'add' | 'remove' | 'clear' }

const STATE_ONLY = new Set(['sit', 'unsit', 'tploc'])

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
  private avatar: WorldAvatar | undefined
  private readonly parameters = new WeakMap<RlvRestriction, string>()
  /** Increases whenever a rule is added or removed. */
  revision = 0

  constructor(private readonly profile: ViewerProfile, private readonly session: RlvSession) {}

  /** The receiving viewer stays with an issuer across later ownership changes. */
  bind(avatar: WorldAvatar): void { this.avatar ??= avatar }

  /** Session reset releases state without command notifications. */
  reset(): void { this.rules.clear(); this.avatar = undefined; this.revision++ }

  /** Frozen copies in emitter and rule insertion order, optionally for one prim. */
  snapshot(sourcePrim?: string): readonly RlvRestriction[] {
    const entries = sourcePrim === undefined ? [...this.rules.values()] : [this.rules.get(sourcePrim)]
    return Object.freeze(entries.flatMap(rules => rules ? [...rules.values()] : []))
  }

  /** Apply classified wire commands; unsupported effects remain unsupported. */
  apply(prim: Prim, parsed: RestrictionCommand): RlvRestriction['support'] {
    this.avatar ??= prim.linkset!.world?.avatars.find(avatar => avatar.key.toLowerCase() === prim.linkset!.owner.toLowerCase())
    const beforeMovement = this.snapshot()
    const { behaviour, option, parameter, kind } = parsed
    if (kind === 'clear') {
      this.clear(prim, parameter)
      return 'state-only'
    }
    if (this.profile === 'rlv' && isKokuaNamedReply(behaviour)) return 'unsupported'
    const support = this.support(behaviour, option)
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
      if (this.rules.get(prim.key)?.delete(rule)) this.revision++
      this.prune(prim.key)
    } else {
      let rules = this.rules.get(prim.key)
      if (!rules) this.rules.set(prim.key, rules = new Map())
      if (!existing) {
        const entry = Object.freeze({ sourcePrim: prim.key, behaviour, option, rule, support })
        rules.set(rule, entry)
        this.parameters.set(entry, parameter)
        this.revision++
      }
      this.session.track(prim, () => this.clear(prim, ''))
    }
    if (this.profile === 'rlva') this.notify(prim, rule, '=' +
      (kind === 'add' && existing ? this.parameters.get(existing)! : parameter))
    if (this.avatar) movementRulesChanged(this.avatar, beforeMovement, this.snapshot())
    return support
  }

  /** How deeply an add/remove form is emulated; dispatch and rule storage share this decision. */
  support(behaviour: string, option: string): RlvRestriction['support'] {
    return debugSupport(this.profile, behaviour, option) ?? movementSupport(this.profile, behaviour, option) ?? permissionSupport(this.profile, behaviour, option) ?? this.notifySupport(behaviour, option) ?? sharedWearSupport(this.profile, behaviour, option) ?? attachmentLockSupport(this.profile, behaviour, option) ?? (this.chatSupport(behaviour, option) ?? outfitSupport(behaviour, option) ?? seatingSupport(this.profile, behaviour, option) ?? standtpSupport(this.profile, behaviour, option) ??
        teleportSupport(this.profile, behaviour, option) ?? teleportOfferSupport(this.profile, behaviour, option) ?? teleportRequestSupport(this.profile, behaviour, option) ?? editSupport(this.profile, behaviour, option) ?? touchSupport(this.profile, behaviour, option) ?? cameraSupport(this.profile, behaviour, option) ?? cameraDistanceSupport(this.profile, behaviour, option) ?? cameraControlSupport(this.profile, behaviour, option) ??
        viewStateSupport(this.profile, behaviour, option) ?? renderSupport(this.profile, behaviour, option) ?? chatRedirectSupport(this.profile, behaviour, option) ?? chatVolumeSupport(behaviour, option) ?? gestureSupport(behaviour, option) ?? receivedChatSupport(this.profile, behaviour, option) ?? receivedIMSupport(this.profile, behaviour, option) ?? avatarIMSupport(this.profile, behaviour, option) ??
        (STATE_ONLY.has(behaviour) && !option ? 'state-only' : 'unsupported'))
  }

  private notify(prim: Prim, action: string, suffix = ''): void {
    sendRestrictionNotifications(prim, this.avatar, this.snapshot(), action, suffix)
  }

  private clear(prim: Prim, filter: string): void {
    const action = 'clear' + (filter ? ':' + filter : '')
    if (this.profile === 'rlv') this.notify(prim, action)
    const rules = this.rules.get(prim.key)
    if (rules) {
      for (const rule of rules.keys()) {
        if (!rule.includes(filter)) continue
        if (this.profile === 'rlv') this.notify(prim, rule, '=y')
        const beforeMovement = this.snapshot()
        rules.delete(rule)
        this.revision++
        if (this.avatar) movementRulesChanged(this.avatar, beforeMovement, this.snapshot())
      }
      this.prune(prim.key)
    }
    if (this.profile === 'rlva') this.notify(prim, action)
  }

  private notifySupport(behaviour: string, option: string): RlvRestriction['support'] | undefined {
    if (behaviour !== 'notify') return undefined
    return this.profile !== 'disabled' && parseNotifyOption(this.profile, option) ? 'enforced' : 'unsupported'
  }

  /** Restrict exception scope for this family only; other families stay state-only. */
  private chatSupport(behaviour: string, option: string): RlvRestriction['support'] | undefined {
    if (behaviour === 'sendchat') return !option ? 'enforced' : 'unsupported'
    if (behaviour === 'sendchannel_except' || behaviour === 'sendchannel_except_sec') {
      if (behaviour === 'sendchannel_except_sec' && this.profile !== 'rlva') return 'unsupported'
      if (this.profile === 'rlv') return !option || /^-?(0|[1-9][0-9]*)$/.test(option) && channelOption(option) !== undefined ? 'enforced' : 'unsupported'
      return !option || (channelOption(option) ?? 0) > 0 ? 'enforced' : 'unsupported'
    }
    if (behaviour === 'permissive' && !option) return 'enforced'
    if (behaviour !== 'sendchannel' && behaviour !== 'sendchannel_sec') return undefined
    if (!option) return 'enforced'
    const channel = channelOption(option)
    if (this.profile === 'rlv' && String(channel) !== option) return 'unsupported'
    return channel !== undefined && channel > 0 ? 'enforced' : 'unsupported'
  }

  /** Rules whose issuing prims have not granted this private channel. */
  channelDenials(channel: number): readonly RlvRestriction[] {
    if (this.profile === 'disabled' || channel === 0) return Object.freeze([])
    const rules = this.snapshot()
    const excluded = rules.filter(rule => rule.behaviour === 'sendchannel_except' ||
      this.profile === 'rlva' && rule.behaviour === 'sendchannel_except_sec')
    const exclusions = excluded.filter(rule => rule.option && (this.profile === 'rlva'
      ? channelOption(rule.option) === channel : rule.option === String(channel)))
    const switches = excluded.filter(rule => !rule.option)
    const strictSwitches = switches.filter(rule => rule.behaviour === 'sendchannel_except_sec' ||
      rules.some(entry => entry.behaviour === 'permissive' && !entry.option))
    // Secure exclusions require each secure issuer to list the channel; under
    // permissive=n every activating issuer must list it.
    const isExcluded = this.profile === 'rlv' ? exclusions.length > 0 : switches.length > 0 &&
      (strictSwitches.length ? strictSwitches.every(rule => exclusions.some(entry => entry.sourcePrim === rule.sourcePrim))
        : exclusions.length > 0)
    if (isExcluded) return Object.freeze(exclusions)
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
    this.session.untrack(sourcePrim)
  }
}

/** State-only commands still report unsupported action effects in the command log. */
export function dispatchRestrictionCommand(viewer: ViewerState, prim: Prim, parsed: RlvParsedCommand, command: string,
  outcome?: RlvCommandOutcome): boolean {
  if (parsed.kind !== 'add' && parsed.kind !== 'remove' && parsed.kind !== 'clear') return false
  const support = viewer.restrictions.apply(prim, { ...parsed, kind: parsed.kind })
  if (support === 'enforced') {
    viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'applied', ...(outcome ? { outcome } : {}) })
    return true
  }
  viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'unsupported', ...(outcome ? { outcome } : {}) })
  const detail = support === 'state-only'
    ? 'Viewer restriction state updated; action enforcement is unsupported.'
    : viewer.profile === 'rlv'
      ? 'Wire rule updated for this profile; its effects are unsupported.'
      : 'This restriction form is outside the supported allowlist.'
  viewer.diagnostics.push({ command, reason: 'unsupported', detail: outcome ? outcome + ': ' + detail : detail })
  return true
}
