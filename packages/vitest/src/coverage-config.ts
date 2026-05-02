/**
 * Process-wide coverage activation. Resolved from (in priority order):
 *   1. An explicit override set via `setCoverageEnabled()` — used by the
 *      Vitest reporter when it wants to force-enable in workers it spawns.
 *   2. The `LSL_COVERAGE=1` environment variable — re-read every call so
 *      a reporter that sets `process.env.LSL_COVERAGE` after some worker
 *      modules already loaded still wins.
 *
 * `loadScript()` and `loadLinkset()` consult this when no explicit
 * `coverage:` option was passed on the call.
 */

let override: boolean | null = null

export function isCoverageEnabled(): boolean {
  if (override !== null) return override
  return process.env['LSL_COVERAGE'] === '1'
}

export function setCoverageEnabled(value: boolean): void {
  override = value
}

/** Test-only: undo any override so the next call falls back to the env var. */
export function resetCoverageOverride(): void {
  override = null
}
