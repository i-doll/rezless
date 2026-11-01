import type { ViewerConfig, ViewerProfile } from './profiles.js'
import type { RlvRestriction } from './restrictions.js'
import { dispatchRestrictionCommand } from './restrictions.js'
import { rlvIntegerPrefix, type RlvParsedCommand } from './classifier.js'
import { isValidReplyChannel, sendViewerReply } from './reply.js'
import type { WorldAvatar } from '../world.js'
import type { Prim } from '../prim.js'

/** Initial effective viewer values. Aspect ratio supplies RLVa's scaled viewport ratio. */
export interface RlvDebugSettingsConfig {
  readonly avatarSex?: number
  readonly renderResolutionDivisor?: number
  readonly aspectRatio?: number
  readonly windLightUseAtmosShaders?: boolean
  /** Kokua's RestrainedLoveNoSetEnv; RLVa uses viewer.rlvaNoSetEnv. */
  readonly noSetEnv?: boolean
}

/** Debug values belong to the receiving avatar, independently of issuing scripts. */
export class RlvDebugSettings {
  avatarSex: number | string
  renderResolutionDivisor: number
  readonly aspectRatio: number
  windLightUseAtmosShaders: boolean
  readonly noSetEnv: boolean
  constructor(profile: ViewerProfile, config?: ViewerConfig) {
    const initial = config?.debugSettings
    this.avatarSex = (initial?.avatarSex ?? 0) >>> 0
    this.renderResolutionDivisor = (initial?.renderResolutionDivisor ?? 1) >>> 0
    this.aspectRatio = initial?.aspectRatio ?? 16 / 9
    this.windLightUseAtmosShaders = initial?.windLightUseAtmosShaders ?? true
    this.noSetEnv = profile === 'rlva' ? config?.rlvaNoSetEnv ?? false : initial?.noSetEnv ?? false
  }
}

export function debugSupport(profile: ViewerProfile, behaviour: string, option: string): RlvRestriction['support'] | undefined {
  if (behaviour !== 'setdebug') return undefined
  return profile !== 'disabled' && !option ? 'enforced' : 'unsupported'
}

function getDebug(avatar: WorldAvatar, setting: string): string {
  const { debugSettings: values, inventory, profile } = avatar.viewer
  switch (setting) {
    case 'avatarsex': return String(values.avatarSex)
    case 'renderresolutiondivisor': return String(values.renderResolutionDivisor)
    case 'restrainedloveforbidgivetorlv': return String(Number(inventory.forbidGiveToRlv))
    case 'restrainedlovenosetenv': return String(Number(values.noSetEnv))
    case 'windlightuseatmosshaders': return String(Number(values.windLightUseAtmosShaders))
    case 'aspectratio': return profile === 'rlva' ? Math.fround(values.aspectRatio).toFixed(3) : ''
    default: return ''
  }
}

/** LLStringUtil's unsigned stream conversion accepts a decimal prefix and a minus sign. */
function unsignedPrefix(value: string): number | undefined {
  const match = /^[\t\n\v\f\r ]*([+-]?\d+)/.exec(value)
  if (!match) return undefined
  const number = Number(match[1])
  return Math.abs(number) <= 4294967295 ? number >>> 0 : undefined
}

export function dispatchDebugCommand(avatar: WorldAvatar, prim: Prim, parsed: RlvParsedCommand, command: string): boolean {
  const viewer = avatar.viewer
  const values = viewer.debugSettings
  if (parsed.behaviour === 'setdebug' && (parsed.kind === 'add' || parsed.kind === 'remove') && !parsed.option) {
    if (parsed.kind === 'add' && viewer.profile === 'rlv' && !values.noSetEnv) values.windLightUseAtmosShaders = true
    return dispatchRestrictionCommand(viewer, prim, parsed, command)
  }
  if (parsed.behaviour.startsWith('getdebug_') && parsed.kind === 'query') {
    const channel = rlvIntegerPrefix(parsed.parameter)!
    if (viewer.profile === 'disabled' || !isValidReplyChannel(viewer.profile, channel)) return false
    const setting = parsed.behaviour.slice(9)
    if (!setting && viewer.profile === 'rlva') return false
    const reply = sendViewerReply(prim.linkset!, avatar, channel, getDebug(avatar, setting))!
    viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'replied', reply })
    return true
  }
  if (!parsed.behaviour.startsWith('setdebug_') || parsed.kind !== 'force') return false
  const setting = parsed.behaviour.slice(9)
  if (!setting && viewer.profile === 'rlva') return false
  const locks = viewer.restrictions.snapshot().filter(r => r.behaviour === 'setdebug' && !r.option)
  const ownKokuaLock = viewer.profile === 'rlv' && locks.some(r => r.sourcePrim === prim.key)
  if (ownKokuaLock) viewer.restrictions.apply(prim, { behaviour: 'setdebug', option: '', parameter: 'y', kind: 'remove' })
  const restoreLock = () => {
    if (!ownKokuaLock) return
    viewer.restrictions.apply(prim, { behaviour: 'setdebug', option: '', parameter: 'n', kind: 'add' })
    if (!values.noSetEnv) values.windLightUseAtmosShaders = true
  }
  const blocked = locks.some(r => r.sourcePrim !== prim.key)
  if (blocked) {
    viewer.commandLog.push({ command, sourcePrim: prim.key, parsed, status: 'ignored', outcome: 'failed-lock' })
    restoreLock()
    return true
  }
  const writable = setting === 'avatarsex' || setting === 'renderresolutiondivisor'
  let valid = writable
  if (writable) {
    if (setting === 'avatarsex' && viewer.profile === 'rlva') {
      valid = ['1', 't', 'true', '0', 'f', 'false'].includes(parsed.option.trim())
      if (valid) values.avatarSex = parsed.option
    } else {
      const value = viewer.profile === 'rlv' ? (rlvIntegerPrefix(parsed.option) ?? 0) >>> 0 : unsignedPrefix(parsed.option)
      valid = value !== undefined
      if (valid) {
        if (setting === 'avatarsex') values.avatarSex = value!
        else values.renderResolutionDivisor = value!
      }
    }
  }
  restoreLock()
  viewer.commandLog.push({ command, sourcePrim: prim.key, parsed,
    status: !writable ? 'unsupported' : valid ? 'enforced' : 'ignored',
    ...(!writable ? { outcome: 'unsupported-form' as const } : !valid ? { outcome: 'failed-option' as const } : {}) })
  if (!writable) viewer.diagnostics.push({ command, reason: 'unsupported', detail: 'This debug setting is not writable in this profile.' })
  return true
}
