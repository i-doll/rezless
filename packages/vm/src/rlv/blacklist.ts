import type { RlvParsedCommand } from './classifier.js'
import type { ViewerConfig, ViewerProfile } from './profiles.js'

/** Immutable per-avatar Kokua blacklist and separate RLVa environment setting. */
export class RlvBlacklist {
  readonly entries: readonly string[]
  private readonly noSetEnv: boolean

  constructor(private readonly profile: ViewerProfile, config?: ViewerConfig) {
    this.entries = Object.freeze([...(config?.blacklist ?? [])])
    this.noSetEnv = config?.rlvaNoSetEnv ?? false
  }

  reply(behaviour: string, option: string, version: number): string | undefined {
    if (this.profile !== 'rlv') return undefined
    if (behaviour === 'versionnumbl') return [String(version), ...this.entries].join(',')
    if (behaviour === 'getblacklist') return this.entries.filter(entry => entry.includes(option)).join(',')
    return undefined
  }

  rejection(parsed: RlvParsedCommand): 'ignored-blacklist' | 'failed-disabled' | undefined {
    if (this.profile === 'rlva') {
      return this.noSetEnv && parsed.behaviour === 'setenv' && (parsed.kind === 'add' || parsed.kind === 'remove')
        ? 'failed-disabled' : undefined
    }
    if (this.profile !== 'rlv') return undefined
    if (parsed.kind === 'add' && parsed.behaviour !== 'notify' && this.entries.includes(parsed.behaviour)) return 'ignored-blacklist'
    if (parsed.kind === 'force' && this.entries.includes(parsed.behaviour + '%f')) return 'ignored-blacklist'
    return undefined
  }
}

