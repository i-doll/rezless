/**
 * Process-wide coverage activation. Reads the `LSL_COVERAGE=1` environment
 * variable on every call so that a reporter setting `process.env.LSL_COVERAGE`
 * after worker modules already loaded still wins.
 *
 * `loadScript()` and `loadLinkset()` consult this when no explicit
 * `coverage:` option was passed on the call.
 */

export function isCoverageEnabled(): boolean {
  return process.env['LSL_COVERAGE'] === '1'
}
