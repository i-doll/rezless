/** Implementation families identified by viewer version, not a promise of full RLV conformance. */
export type RlvProfile = 'rlv' | 'rlva'
export type ViewerProfile = 'disabled' | RlvProfile

export interface ViewerConfig {
  readonly profile: ViewerProfile
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
  readonly reason: 'unsupported'
  readonly detail: string
}

/** Per-avatar emulator state. No commands are processed in the profile-only slice. */
export interface ViewerState {
  readonly profile: ViewerProfile
  readonly reference: RlvReference | null
  readonly diagnostics: RlvDiagnostic[]
}

export function createViewerState(config?: ViewerConfig): ViewerState {
  const profile = config?.profile ?? 'disabled'
  return { profile, reference: profile === 'disabled' ? null : RLV_PROFILES[profile], diagnostics: [] }
}
