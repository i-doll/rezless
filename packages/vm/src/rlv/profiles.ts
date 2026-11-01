import { RlvBlacklist } from './blacklist.js'
import { RlvInventory, type RlvInventoryConfig } from './inventory.js'
import { RlvSession } from './session.js'
import { RlvRestrictions } from './restrictions.js'
import type { RlvParsedCommand } from './classifier.js'

/** Implementation families identified by viewer version, not a promise of full RLV conformance. */
export type RlvProfile = 'rlv' | 'rlva'
export type ViewerProfile = 'disabled' | RlvProfile

export interface ViewerConfig {
  readonly profile: ViewerProfile
  readonly inventory?: RlvInventoryConfig
  /** Kokua wire names; force entries end in %f. Ignored by RLVa. */
  readonly blacklist?: readonly string[]
  /** RLVa dictionary setting disabling setenv add/remove, independently of Kokua. */
  readonly rlvaNoSetEnv?: boolean
  readonly ready?: boolean
  readonly doNotQueueVersionRequests?: boolean
  /** Kokua maintenance additions in virtual milliseconds; defaults 5000 and 8000. */
  readonly initialGarbageCollectionAdditionalWait?: number
  readonly garbageCollectionAdditionalInterval?: number
}

export interface RlvReference {
  readonly implementation: string
  readonly implementationVersion: string
  readonly apiVersion: string
  readonly apiVersionNumber: number
  readonly compatibilityVersion: string | null
}

export const RLV_PROFILES: Readonly<Record<RlvProfile, RlvReference>> = Object.freeze({
  rlv: Object.freeze({
    implementation: 'Kokua RLV', implementationVersion: '2.09.35.00',
    apiVersion: '2.09.35.00', apiVersionNumber: 2093500, compatibilityVersion: null,
  }),
  rlva: Object.freeze({
    implementation: 'Firestorm RLVa', implementationVersion: '2.4.2',
    apiVersion: '3.4.3', apiVersionNumber: 3040300, compatibilityVersion: '2.9.28',
  }),
})

export interface RlvDiagnostic {
  readonly command: string
  readonly reason: 'unsupported' | 'malformed'
  readonly detail: string
}

export interface RlvReply {
  readonly channel: number
  readonly text: string
}

export type RlvCommandRecord = {
  readonly outcome?: 'failed-camera-lock' | import('./classifier.js').RlvCommandOutcome | import('./detach.js').RlvDetachOutcome | 'failed-option' | 'ignored-blacklist' | 'failed-disabled' | 'failed-unheld-behaviour' | 'failed-effect-limit' | import('./forcewear.js').RlvForceWearOutcome | import('./forcewear.js').RlvForceRemoveOutcome
  readonly removeResults?: readonly import('./forcewear.js').RlvForceRemoveItemResult[]
  readonly wearResults?: readonly import('./forcewear.js').RlvForceWearItemResult[]
  readonly command: string
  readonly sourcePrim: string
  readonly parsed?: RlvParsedCommand
} & ({ readonly status: 'replied'; readonly reply: RlvReply; readonly outcome?: 'failed-option' | import('./classifier.js').RlvCommandOutcome } | { readonly status: 'enforced' | 'applied' | 'unsupported' | 'malformed' | 'queued' | 'ignored' } | {
  readonly status: 'action'
  readonly action: 'sit' | 'unsit'
  readonly actionOutcome: 'applied' | 'unchanged' | 'refused'
  readonly target: string
  /** Seat identity after the attempt, using the profile's getsitid policy. */
  readonly seat: string
  readonly reason?: 'restriction' | 'target-unavailable' | 'world-constraint'
} | import('./teleport.js').RlvTeleportAction)

/** Per-avatar emulator state shared by commands from all owned prims. */
export interface ViewerState {
  readonly profile: ViewerProfile
  readonly reference: RlvReference | null
  readonly diagnostics: RlvDiagnostic[]
  readonly commandLog: RlvCommandRecord[]
  readonly blacklist: RlvBlacklist
  readonly inventory: RlvInventory
  readonly restrictions: RlvRestrictions
  readonly session: RlvSession
}

export function createViewerState(config?: ViewerConfig): ViewerState {
  const profile = config?.profile ?? 'disabled'
  const session = new RlvSession(profile, config)
  return { blacklist: new RlvBlacklist(profile, config), session, profile, reference: profile === 'disabled' ? null : RLV_PROFILES[profile], diagnostics: [], commandLog: [], restrictions: new RlvRestrictions(profile, session), inventory: new RlvInventory(config?.inventory) }
}
