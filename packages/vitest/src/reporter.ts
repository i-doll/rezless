import * as fs from 'node:fs'
import * as path from 'node:path'
import { renderLcov } from './format/lcov.js'
import { renderIstanbul } from './format/istanbul.js'
import { renderConsoleSummary } from './format/console.js'
import { renderHtml } from './format/html.js'
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
  /** Output directory; defaults to `<vitest reportsDirectory>/lsl` (or `coverage/lsl`). */
  readonly outputDir?: string
  /** Skip the per-file `lcov.info` write. */
  readonly disableLcov?: boolean
  /** Skip the `coverage-final.json` write. */
  readonly disableIstanbul?: boolean
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
  /** Vitest 4 exposes per-project resolved configs here. */
  projects?: ReadonlyArray<{
    config?: { setupFiles?: string[] | string }
    vitenode?: unknown
  }>
}

/** Resolves to the absolute file path of `coverage-setup.js` next to this file. */
function coverageSetupFilePath(): string {
  // import.meta.url points to dist/reporter.js once compiled; the setup
  // file lives next to it.
  const here = new URL('./coverage-setup.js', import.meta.url)
  return new URL(here).pathname
}

/**
 * Vitest custom reporter for LSL script coverage.
 *
 * In its default `mode: 'auto'`, the reporter is dormant unless Vitest's
 * `--coverage` flag is set. When active, it enables collection in test
 * workers (via `LSL_COVERAGE=1`), reads per-worker coverage dumps at
 * end-of-run, and writes:
 *   - `<outputDir>/lcov.info`         (LCOV)
 *   - `<outputDir>/coverage-final.json` (Istanbul)
 *   - a console summary table
 *
 * Wire it up once in your `vitest.config.ts`:
 *
 *   import { LslCoverageReporter } from '@lslvm/vitest/reporter'
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
  private active = false

  constructor(opts: LslCoverageReporterOptions = {}) {
    this.opts = opts
    this.outputDir = opts.outputDir
  }

  onInit(vitest?: VitestLike): void {
    this.active = this.shouldActivate(vitest)
    if (!this.active) return

    // Resolve output dir: explicit option > Vitest's reportsDirectory + /lsl > coverage/lsl.
    const fallback = path.join(process.cwd(), 'coverage', 'lsl')
    if (!this.outputDir) {
      const reportsDir = vitest?.config?.coverage?.reportsDirectory
      this.outputDir = reportsDir ? path.join(reportsDir, 'lsl') : fallback
    }

    // Tell workers to collect (env var is read by loadScript / loadLinkset).
    process.env['LSL_COVERAGE'] = '1'

    // Inject our coverage-setup.js into vitest's setupFiles so each worker
    // drains its registry to disk after every test file. Without this, the
    // worker-thread's `process.on('exit')` doesn't fire until after the
    // reporter's onTestRunEnd has already run.
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

    const outputDir = this.outputDir ?? path.join(process.cwd(), 'coverage', 'lsl')
    fs.mkdirSync(outputDir, { recursive: true })

    if (!this.opts.disableLcov) {
      const lcovPath = path.join(outputDir, 'lcov.info')
      fs.writeFileSync(lcovPath, renderLcov(merged))
    }

    if (!this.opts.disableIstanbul) {
      const istanbulPath = path.join(outputDir, 'coverage-final.json')
      fs.writeFileSync(istanbulPath, JSON.stringify(renderIstanbul(merged), null, 2))
    }

    if (!this.opts.disableHtml) {
      const htmlDir = path.join(outputDir, 'html')
      fs.mkdirSync(htmlDir, { recursive: true })
      for (const [name, content] of renderHtml(merged)) {
        fs.writeFileSync(path.join(htmlDir, name), content)
      }
    }

    if (!this.opts.disableConsole) {
      process.stdout.write('\n' + renderConsoleSummary(merged))
      if (!this.opts.disableHtml) {
        process.stdout.write(`\nLSL HTML report: ${path.join(outputDir, 'html', 'index.html')}\n`)
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
