export interface SourceLocation {
  /** 1-based line number. */
  readonly line: number
  /** 1-based column number. */
  readonly col: number
  /** 0-based byte offset into the source. */
  readonly offset: number
}

export interface Diagnostic {
  readonly severity: 'error' | 'warning'
  readonly message: string
  readonly filename: string
  readonly loc: SourceLocation
}

export class LslParseError extends Error {
  constructor(public readonly diagnostics: ReadonlyArray<Diagnostic>) {
    const first = diagnostics[0]
    const detail = first
      ? `${first.filename}:${first.loc.line}:${first.loc.col}: ${first.message}`
      : 'unknown parse error'
    super(`LSL compile error: ${detail}`)
    this.name = 'LslParseError'
  }
}
