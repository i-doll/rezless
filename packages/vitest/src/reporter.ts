import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderConsoleSummary } from './format/console.js'
import { splitByLanguage, writeCoverage } from './coverage-write.js'
import { readWorkerDumps, clearWorkerDumps } from './coverage-registry.js'
import { aggregateReports } from './coverage-aggregate.js'

/** When the reporter should activate. */
export type ReporterMode = 'auto' | 'always' | 'never'

export interface LslCoverageReporterOptions {
  /**
   * Activation policy:
   *   - 'auto' (default): activate when Vitest's own coverage flag is on
   *     (i.e. `vitest run --coverage` or `coverage.enabled: true` in
   *     `vitest.config.ts`), or when `LSL_COVERAGE=1` is in the env.
   *   - 'always': activate every run regardless of the coverage flag.
   *   - 'never': stay dormant. Useful for conditional config.
   */
  readonly mode?: ReporterMode
  /** Output directory for LSL scripts; defaults to `<vitest reportsDirectory>/lsl` (or `coverage/lsl`). */
  readonly outputDir?: string
  /** Output directory for SLua scripts; defaults to `<vitest reportsDirectory>/slua` (or `coverage/slua`). */
  readonly sluaOutputDir?: string
  /** Skip the per-file `lcov.info` write. */
  readonly disableLcov?: boolean
  /** Skip the `coverage-final.json` write. */
  readonly disableIstanbul?: boolean
  /** Skip the `coverage-summary.json` write. */
  readonly disableSummary?: boolean
  /** Skip the browseable `html/` directory. */
  readonly disableHtml?: boolean
  /** Skip the end-of-run console table. */
  readonly disableConsole?: boolean
  /**
   * Include reports for synthetic filenames — `<inline>`, names without a
   * path separator, or paths that don't exist on disk. Defaults to false
   * since these are almost always throwaway test fixtures.
   */
  readonly includeFixtures?: boolean
}

interface VitestLike {
  config?: {
    coverage?: { enabled?: boolean; reportsDirectory?: string }
    setupFiles?: string[] | string
  }
  /** Vitest 4+ exposes per-project resolved configs here. */
  projects?: ReadonlyArray<{
    config?: { setupFiles?: string[] | string }
    vitenode?: unknown
  }>
}

/** Resolves to the absolute file path of `coverage-setup.js` next to this file. */
function coverageSetupFilePath(): string {
  // import.meta.url points to dist/reporter.js once compiled; the setup
  // file lives next to it. fileURLToPath handles cross-platform quirks
  // (Windows drive letters, percent-encoded paths) that URL.pathname mangles.
  return fileURLToPath(new URL('./coverage-setup.js', import.meta.url))
}

/**
 * Vitest custom reporter for LSL script coverage.
 *
 * In its default `mode: 'auto'`, the reporter is dormant unless Vitest's
 * `--coverage` flag is set. When active, it enables collection in test
 * workers (via `LSL_COVERAGE=1`), reads per-worker coverage dumps at
 * end-of-run, and writes, for LSL scripts into `<outputDir>` and SLua
 * scripts into `<sluaOutputDir>` (so each can be its own coverage component):
 *   - `lcov.info`             (LCOV)
 *   - `coverage-final.json`   (Istanbul)
 *   - `coverage-summary.json` and `html/`
 * and a console summary table.
 *
 * Wire it up once in your `vitest.config.ts`:
 *
 *   import { LslCoverageReporter } from '@rezless/vitest/reporter'
 *   export default defineConfig({
 *     test: {
 *       reporters: ['default', new LslCoverageReporter()],
 *     },
 *   })
 *
 * Then `vitest run --coverage` triggers both the JS and LSL coverage
 * pipelines; plain `vitest run` stays free of coverage overhead.
 */
export class LslCoverageReporter {
  private readonly opts: LslCoverageReporterOptions
  private outputDir: string | undefined
  private sluaOutputDir: string | undefined
  private active = false

  constructor(opts: LslCoverageReporterOptions = {}) {
    this.opts = opts
    this.outputDir = opts.outputDir
    this.sluaOutputDir = opts.sluaOutputDir
  }

  onInit(vitest?: VitestLike): void {
    this.active = this.shouldActivate(vitest)
    if (!this.active) return

    // Resolve output dirs: explicit option > Vitest's reportsDirectory + /lsl
    // (or /slua) > coverage/lsl (or coverage/slua).
    const reportsDir = vitest?.config?.coverage?.reportsDirectory ?? path.join(process.cwd(), 'coverage')
    this.outputDir ??= path.join(reportsDir, 'lsl')
    this.sluaOutputDir ??= path.join(reportsDir, 'slua')

    // Tell workers to collect (env var is read by loadScript / loadLinkset).
    process.env['LSL_COVERAGE'] = '1'

    // Inject our coverage-setup.js into vitest's setupFiles so each worker
    // drains its registry to disk after every test file. Nothing else can:
    // Vitest stops its workers without running their `process.on('exit')`
    // handlers.
    this.injectSetupFile(vitest)

    // Best-effort: clear stale per-worker dumps from a previous run so we
    // don't merge old coverage into the new report.
    clearWorkerDumps()
  }

  private injectSetupFile(vitest: VitestLike | undefined): void {
    if (!vitest) return
    const setupPath = coverageSetupFilePath()
    const addTo = (target: { setupFiles?: string[] | string } | undefined): void => {
      if (!target) return
      const current = target.setupFiles
      if (!current) {
        target.setupFiles = [setupPath]
        return
      }
      if (Array.isArray(current)) {
        if (!current.includes(setupPath)) current.push(setupPath)
        return
      }
      if (current !== setupPath) target.setupFiles = [current, setupPath]
    }
    addTo(vitest.config)
    if (vitest.projects) {
      for (const p of vitest.projects) addTo(p.config)
    }
  }

  onTestRunEnd(): void {
    if (!this.active) return

    const dumps = readWorkerDumps()
    if (dumps.length === 0) {
      if (!this.opts.disableConsole) {
        process.stdout.write('No LSL coverage collected.\n')
      }
      // Clear any malformed dump files so a future run with valid data
      // starts from a clean slate without manual intervention.
      clearWorkerDumps()
      return
    }

    const aggregateOpts =
      this.opts.includeFixtures !== undefined
        ? { includeFixtures: this.opts.includeFixtures }
        : {}
    const merged = aggregateReports(dumps, aggregateOpts)
    if (merged.length === 0) {
      if (!this.opts.disableConsole) {
        process.stdout.write(
          'No coverable LSL scripts after filtering — pass `includeFixtures: true` to keep test fixtures.\n',
        )
      }
      clearWorkerDumps()
      return
    }

    // Each language is its own coverage component, written only when present.
    const { lsl, slua } = splitByLanguage(merged)
    const groups = [
      { label: 'LSL', dir: this.outputDir!, reports: lsl },
      { label: 'SLua', dir: this.sluaOutputDir!, reports: slua },
    ].filter((g) => g.reports.length > 0)
    for (const g of groups) writeCoverage(g.dir, g.reports, this.opts)

    if (!this.opts.disableConsole) {
      process.stdout.write('\n' + renderConsoleSummary(merged))
      if (!this.opts.disableHtml) {
        for (const g of groups) process.stdout.write(`\n${g.label} HTML report: ${path.join(g.dir, 'html', 'index.html')}\n`)
      }
    }

    clearWorkerDumps()
  }

  private shouldActivate(vitest: VitestLike | undefined): boolean {
    const mode = this.opts.mode ?? 'auto'
    if (mode === 'always') return true
    if (mode === 'never') return false
    // auto: track Vitest's coverage flag, with LSL_COVERAGE=1 as a manual override.
    if (vitest?.config?.coverage?.enabled) return true
    if (process.env['LSL_COVERAGE'] === '1') return true
    return false
  }
}
