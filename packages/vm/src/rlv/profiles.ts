/** Pinned implementation families, not a promise of full RLV conformance. */
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
  readonly commit: string
  readonly url: string
}

export const RLV_PROFILES: Readonly<Record<RlvProfile, RlvReference>> = Object.freeze({
  rlv: Object.freeze({
    implementation: 'Kokua RLV', implementationVersion: '2.09.35.00',
    apiVersion: '2.09.35.00', apiVersionNumber: 2093500, compatibilityVersion: null,
    commit: '643c349d8604949b5e927ae6300661f37114e221',
    url: 'https://bitbucket.org/kokua/kokua/src/643c349d8604949b5e927ae6300661f37114e221/indra/newview/RRInterfaceVersion.h',
  }),
  rlva: Object.freeze({
    implementation: 'Firestorm RLVa', implementationVersion: '2.4.2',
    apiVersion: '3.4.3', apiVersionNumber: 3040300, compatibilityVersion: '2.9.28',
    commit: '08082cbf2ad1094b5701b63b95b0a7c573dfe801',
    url: 'https://github.com/i-doll/phoenix-firestorm/blob/08082cbf2ad1094b5701b63b95b0a7c573dfe801/indra/newview/rlvdefines.h',
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
