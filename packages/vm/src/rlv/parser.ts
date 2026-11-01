import type { RlvProfile } from './profiles.js'

export interface RlvCommandFields {
  readonly behaviour: string
  readonly option: string
  readonly parameter: string
}

/** Parse one token after the owner-chat prefix and comma separators have been removed. */
export function parseRlvCommand(profile: RlvProfile, token: string): RlvCommandFields | undefined {
  const text = token.toLowerCase()
  const equals = text.indexOf('=')
  const colon = equals > 0 ? text.slice(0, equals).indexOf(':') : -1
  const behaviour = text.slice(0, colon >= 0 ? colon : equals >= 0 ? equals : text.length)
  if (profile === 'rlva' && (equals === 0 || colon === 0)) return undefined
  if (equals < 0 || equals === text.length - 1 && profile === 'rlva') {
    return behaviour === 'clear' ? { behaviour, option: '', parameter: '' } : undefined
  }
  return { behaviour, option: colon >= 0 ? text.slice(colon + 1, equals) : '', parameter: text.slice(equals + 1) }
}
